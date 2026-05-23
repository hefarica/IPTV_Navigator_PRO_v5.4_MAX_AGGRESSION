-- ═══════════════════════════════════════════════════════════════════════
-- APE LAB UHDX — Combined Body Filter: Floor-Lock + Prefetch v2.0
-- Phase: body_filter_by_lua_file
--
-- PIPELINE ORDER:
--   0. Bypass inmediato para evitar acumular segmentos de video (.ts, .m4s)
--   1. Accumulate all response body chunks (solo para manifests .m3u8)
--   2. At EOF: Run FLOOR-LOCK (priorizar HEVC/HDR, reordenar y anti-washout)
--   3. Then: Run PREFETCH (extract last .ts/m4s from filtered body, pre-warm cache)
--
-- SAFETY: Both stages wrapped in pcall. If anything fails, original body passes.
-- AUTOPISTA COMPLIANT: No ngx.exit(), no blocking, PASSTHROUGH on error.
-- ═══════════════════════════════════════════════════════════════════════

local score_mod = require("ape_uhdx_score")
local v4k_mod = require("ape_virtual_4k")

-- ═══ STAGE 0: VIDEO BYPASS (BLINDAJE DE MEMORIA) ════════════════════
local uri = ngx.var.uri or ""
if not uri:find(".m3u8", 1, true) and not uri:find(".m3u", 1, true) then
    return -- Bypass instantáneo para tráfico de video binario
end

-- ═══ STAGE 0.5: CHUNK ACCUMULATION ════════════════════════════════════
-- body_filter runs per-chunk. We accumulate all chunks and process at EOF.
local chunk = ngx.arg[1]
local eof   = ngx.arg[2]

if not ngx.ctx._combined_buf then
    ngx.ctx._combined_buf = {}
end

if chunk and #chunk > 0 then
    ngx.ctx._combined_buf[#ngx.ctx._combined_buf + 1] = chunk
    ngx.arg[1] = nil  -- suppress chunk, we'll emit full body at EOF
end

if not eof then
    return  -- more chunks coming
end

-- ═══ EOF: Full body available ═══════════════════════════════════════
local body = table.concat(ngx.ctx._combined_buf or {})
ngx.ctx._combined_buf = nil

-- If body is empty or tiny, pass through
if #body < 20 then
    ngx.arg[1] = body
    return
end

-- ═══ STAGE 1: UHDX SCORING, FLOOR-LOCK & VIRTUAL 4K (Visual Supremacy) ═════
local floor_ok, floor_err = pcall(function()

    -- Only for 200 OK responses
    if ngx.status ~= 200 then
        ngx.log(ngx.WARN, "[UHDX-DEBUG] Status is not 200: ", ngx.status)
        return
    end

    -- Only for HLS content
    local ct = ngx.header["Content-Type"] or ngx.header["content-type"] or ""
    ngx.log(ngx.WARN, "[UHDX-DEBUG] Content-Type is: ", tostring(ct))
    local is_hls = ct:find("mpegurl", 1, true)
                    or ct:find("mpegURL", 1, true)
                    or ct:find("octet-stream", 1, true)
    if not is_hls then
        ngx.log(ngx.WARN, "[UHDX-DEBUG] is_hls is false")
        return
    end

    -- Must be a Master Playlist (has #EXT-X-STREAM-INF)
    local has_stream_inf = body:find("#EXT-X-STREAM-INF", 1, true)
    ngx.log(ngx.WARN, "[UHDX-DEBUG] has_stream_inf is: ", tostring(has_stream_inf ~= nil))
    if not has_stream_inf then return end

    -- Read visual profiles config from JSON
    local function load_visual_profiles()
        local cache = ngx.shared.lab_config
        if cache then
            local cached_json = cache:get("visual_profiles")
            if cached_json then
                return require("cjson").decode(cached_json)
            end
        end

        local f = io.open("/etc/ape-uhdx/visual_profiles.json", "r")
        if not f then return nil end
        local content = f:read("*a")
        f:close()

        if cache then
            cache:set("visual_profiles", content, 60) -- cache for 60s
        end

        return require("cjson").decode(content)
    end

    local configs = load_visual_profiles()
    if not configs then
        ngx.log(ngx.WARN, "[UHDX] Failed to load visual profiles from JSON")
        return
    end

    -- Determine profile (default P2 = P2_SAFE_COMPAT)
    local profile = "P2"
    local args = ngx.req.get_uri_args()
    if args and args.profile then
        profile = tostring(args.profile):upper()
    elseif args and args.p then
        profile = tostring(args.p):upper()
    end
    local hdr_profile = ngx.req.get_headers()["X-APE-Profile"]
    if hdr_profile then
        profile = tostring(hdr_profile):upper()
    end
    if not profile:match("^P[0-5]$") then profile = "P2" end

    -- Map P0-P5 to JSON profile keys — CADA NIVEL su propia config (mandato HFRC:
    -- "4K forzado para los 6 niveles, cada uno se configura distinto"). P2 es el
    -- catch-all para requests sin perfil o perfiles fuera de rango.
    local profile_keys = {
        P0 = "P0_SHOWROOM_FLASH_4K",
        P1 = "P1_DAILY_EXTREME_4K",
        P2 = "P2_SAFE_COMPAT",
        P3 = "P3_HD_BOOST",
        P4 = "P4_HD_LITE",
        P5 = "P5_SD_RESCUE"
    }
    local mapped_profile = profile_keys[profile] or "P2_SAFE_COMPAT"
    local cfg = configs[mapped_profile] or configs["P2_SAFE_COMPAT"]

    -- Parse lines
    local lines = {}
    for line in body:gmatch("[^\r\n]+") do
        lines[#lines + 1] = line
    end

    -- Identify variants
    local variants = {}
    local other_lines = {}
    local has_hdr = false
    local has_hevc = false

    local i = 1
    while i <= #lines do
        local line = lines[i]
        if line:match("^#EXT%-X%-STREAM%-INF:") then
            local bw = tonumber(line:match("BANDWIDTH=(%d+)")) or 0
            local codecs = line:match('CODECS="([^"]+)"') or ""
            local resolution = line:match("RESOLUTION=(%d+x%d+)")
            local fps = tonumber(line:match("FRAME%-RATE=([%d%.]+)")) or 30
            local is_hdr_variant = codecs:find("hvc1.2.4", 1, true) 
                                or codecs:find("dvh1", 1, true) 
                                or codecs:find("dvhe", 1, true)
            local is_hevc_variant = codecs:find("hvc1", 1, true) 
                                 or codecs:find("hev1", 1, true) 
                                 or codecs:find("hev", 1, true)

            if is_hdr_variant then has_hdr = true end
            if is_hevc_variant then has_hevc = true end

            local url = ""
            if i + 1 <= #lines and not lines[i + 1]:match("^#") then
                url = lines[i + 1]
                i = i + 2
            else
                i = i + 1
            end

            local variant = {
                tag = line,
                url = url,
                bw = bw,
                codecs = codecs,
                resolution = resolution,
                fps = fps,
                is_hdr = is_hdr_variant,
                is_hevc = is_hevc_variant
            }
            variant.score = score_mod.calculate_score(variant)
            variants[#variants + 1] = variant
        else
            other_lines[#other_lines + 1] = line
            i = i + 1
        end
    end

    -- Filter and prioritize
    if #variants > 0 then
        local kept_variants = {}
        local highest_score = -1
        local highest_idx = 1

        -- Find the highest scoring variant
        for idx, v in ipairs(variants) do
            if v.score > highest_score then
                highest_score = v.score
                highest_idx = idx
            end
        end

        for idx, v in ipairs(variants) do
            local keep = false
            -- Always keep the highest scoring variant as fallback
            if idx == highest_idx then
                keep = true
            elseif cfg.floor_lock == "ACTIVE" then
                if v.bw >= cfg.floor_bps then
                    keep = true
                end
            else
                keep = true
            end

            if keep then
                kept_variants[#kept_variants + 1] = v
            end
        end

        -- Sort variants by score descending
        table.sort(kept_variants, function(a, b)
            return a.score > b.score
        end)

        -- Apply virtual 4K (FAKE 4K) to the top variant if active.
        -- Codec = T1 de la cascada (respeta override CSV del widget). HDR=PQ SOLO si
        -- el perfil lo pide (cfg.virtual_4k_hdr=="ACTIVE", showroom P0/P1) → forzar PQ
        -- sobre SDR = pantallazo negro; el SDR→HDR real lo hace el TV por ADB.
        if cfg.virtual_4k == "ACTIVE" and #kept_variants > 0 then
            local v4k_codec = nil
            pcall(function()
                local cc = require("ape_codec_cascade")
                local casc = cc.load_cascade()
                -- CORONA = T9 (hvc1.2.4.L153.B0 = 4K@60 UHD) — tier de referencia P0
                -- Usar corona_tier() es equivalente a resolve_tier({profile="P0"})
                local t_corona = cc.corona_tier(casc)
                if t_corona and t_corona.codec then v4k_codec = t_corona.codec end
            end)
            v4k_mod.rewrite_variant_to_4k(kept_variants[1], {
                codec = v4k_codec,                            -- nil → default hvc1.2.4.L153.B0
                with_hdr = (cfg.virtual_4k_hdr == "ACTIVE")
            })
        end

        -- ═══ CASCADE-DRIVEN CODECS REWRITE ════════════════════════════════
        -- DORMANT por defecto: solo actúa si el perfil define codec_cascade=="ACTIVE"
        -- en visual_profiles.json. Reescribe el codec de video de cada variante al
        -- string del tier resuelto por la cascada (subida por el widget). HINT que
        -- el player negocia con el bitstream real; NO transcodifica, NO toca HDR.
        if cfg.codec_cascade == "ACTIVE" then
            local cc_ok, cc_err = pcall(function()
                local cc_mod = require("ape_codec_cascade")
                local cascade = cc_mod.load_cascade()
                if not cascade then return end
                for _, v in ipairs(kept_variants) do
                    local fam = "HEVC"
                    local vc = v.codecs or ""
                    if vc:find("avc1", 1, true) then fam = "H264"
                    elseif vc:find("av01", 1, true) then fam = "AV1" end
                    local tier = cc_mod.resolve_tier(cascade, {
                        profile = profile,
                        resolution = v.resolution,
                        fps = v.fps,
                        family = fam,
                        honest_family = (cfg.codec_cascade_honest == true)
                    })
                    if tier and tier.codec then
                        v4k_mod.rewrite_variant_codecs(v, tier.codec)
                        v.cascade_tier = tier.tier
                    end
                end
                ngx.ctx._codec_chain = cc_mod.build_codec_chain(cascade)
            end)
            if not cc_ok then ngx.log(ngx.WARN, "[CODEC-CASCADE] rewrite failed (passthrough): " .. tostring(cc_err)) end
        end

        -- Build final manifest
        local new_lines = {}
        for _, l in ipairs(other_lines) do
            if l:match("^#EXTM3U") then
                new_lines[#new_lines + 1] = l
                new_lines[#new_lines + 1] = "#EXT-X-APE-UHDX-MODE:LUA_SUPREMACY"
                if ngx.ctx._codec_chain and ngx.ctx._codec_chain ~= "" then
                    new_lines[#new_lines + 1] = "#EXT-X-APE-CODEC-CHAIN:" .. ngx.ctx._codec_chain
                end
                if cfg.virtual_4k == "ACTIVE" then
                    v4k_mod.inject_client_metadata(new_lines, cfg.upscaler, cfg.hdr_intent)
                end
            else
                new_lines[#new_lines + 1] = l
            end
        end

        for _, v in ipairs(kept_variants) do
            new_lines[#new_lines + 1] = v.tag
            if v.url ~= "" then
                new_lines[#new_lines + 1] = v.url
            end
        end

        body = table.concat(new_lines, "\n") .. "\n"

        -- Observability logging (Headers sent in header filter phase)
        ngx.log(ngx.INFO, string.format("[UHDX] Floor-Lock: profile=%s;floor=%d;kept=%d;removed=%d", mapped_profile, cfg.floor_bps, #kept_variants, #variants - #kept_variants))
    end

end) -- pcall floor_lock

if not floor_ok then
    ngx.log(ngx.WARN, "FLOOR_LOCK_ERR: " .. tostring(floor_err))
end

-- ═══ STAGE 2: PREFETCH (pre-warm cache with last .ts segment) ══════
local pf_ok, pf_err = pcall(function()

    if ngx.status ~= 200 then return end
    if #body < 50 then return end

    -- Extract the LAST .ts/.m4s segment URL (live edge)
    local last_ts = nil
    for line in body:gmatch("[^\r\n]+") do
        if not line:match("^#") then
            if line:match("%.ts") or line:match("%.m4s") or line:match("%.aac") then
                last_ts = line
            end
        end
    end

    if not last_ts then return end

    -- Build host and path
    local req_host = ngx.var.host or ""
    local ts_path = last_ts

    if last_ts:match("^https?://") then
        local h, p = last_ts:match("^https?://([^/]+)(/.+)$")
        if h and p then req_host = h; ts_path = p
        else return end
    end

    if not ts_path:match("^/") then
        local uri_dir = ngx.var.uri:match("^(.*/)")
        if uri_dir then ts_path = uri_dir .. ts_path
        else ts_path = "/" .. ts_path end
    end

    -- Dedup: don't prefetch same segment twice
    local cache_dict = ngx.shared.circuit_metrics
    if cache_dict then
        local key = "pf:" .. req_host .. ts_path
        if cache_dict:get(key) then return end
        cache_dict:set(key, 1, 10)
    end

    -- Fire background prefetch
    ngx.timer.at(0, function(premature)
        if premature then return end
        local sock = ngx.socket.tcp()
        sock:settimeouts(1000, 3000, 3000)
        local ok, err = sock:connect("127.0.0.1", 80)
        if not ok then sock:close(); return end
        sock:send("GET " .. ts_path .. " HTTP/1.1\r\nHost: " .. req_host .. "\r\nUser-Agent: NGINX-Prefetch/1.0\r\nConnection: close\r\n\r\n")
        local hdr = sock:receive("*l")
        for j = 1, 20 do
            local line, err = sock:receive("*l")
            if not line or line == "" then break end
        end
        sock:receive(4096)
        sock:close()
    end)

end) -- pcall prefetch

if not pf_ok then
    ngx.log(ngx.WARN, "PREFETCH_ERR: " .. tostring(pf_err))
end

-- ═══ EMIT FINAL BODY ════════════════════════════════════════════════
ngx.arg[1] = body
