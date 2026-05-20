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

-- ═══ STAGE 1: FLOOR-LOCK & ANTI-WASHOUT (Visual Supremacy) ═════════
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

    -- Read floor config
    local lab_ok, lab = pcall(require, "lab_config")
    ngx.log(ngx.WARN, "[UHDX-DEBUG] require lab_config status: ", tostring(lab_ok), " error: ", tostring(lab))
    if not lab_ok then return end

    local floor_cfg = lab.floor_lock()
    if not floor_cfg or not floor_cfg.floor_lock_enabled then return end

    -- Determine profile (default P3 = 8 Mbps floor)
    local profile = "P3"
    local args = ngx.req.get_uri_args()
    if args and args.profile then
        profile = tostring(args.profile):upper()
    end
    local hdr_profile = ngx.req.get_headers()["X-APE-Profile"]
    if hdr_profile then
        profile = tostring(hdr_profile):upper()
    end
    if not profile:match("^P[0-5]$") then profile = "P3" end

    local floor_bps = lab.floor_bps_for_profile(profile)

    -- Configuración Anti-Washout
    local APE_ANTI_WASHOUT = true
    local APE_BLOCK_LOW_SDR_FALLBACK = true
    local APE_FORCE_HEVC_FIRST = true

    -- Parse lines
    local lines = {}
    for line in body:gmatch("[^\r\n]+") do
        lines[#lines + 1] = line
    end

    -- Identificar variantes
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

            variants[#variants + 1] = {
                tag = line,
                url = url,
                bw = bw,
                codecs = codecs,
                is_hdr = is_hdr_variant,
                is_hevc = is_hevc_variant
            }
        else
            other_lines[#other_lines + 1] = line
            i = i + 1
        end
    end

    -- Filtrado y priorización
    if #variants > 0 then
        local kept_variants = {}
        local highest_bw = 0
        local highest_idx = 1

        -- Buscar la variante de máximo bitrate absoluta
        for idx, v in ipairs(variants) do
            if v.bw > highest_bw then
                highest_bw = v.bw
                highest_idx = idx
            end
        end

        -- Umbral de bloqueo de perfiles SDR degradados si hay HDR/HEVC disponible
        local cutoff_bps = floor_bps
        if APE_ANTI_WASHOUT and (has_hdr or has_hevc) then
            if profile == "P0" then
                cutoff_bps = 18000000 -- Bloquear variantes SDR por debajo de 18 Mbps
            elseif profile == "P1" then
                cutoff_bps = 14000000
            elseif profile == "P2" then
                cutoff_bps = 8000000
            end
        end

        for idx, v in ipairs(variants) do
            local keep = false
            -- Siempre mantener la variante de mayor calidad absoluta para evitar playlists vacías
            if idx == highest_idx then
                keep = true
            elseif APE_BLOCK_LOW_SDR_FALLBACK and (has_hdr or has_hevc) and not v.is_hdr and not v.is_hevc then
                -- Si hay variantes Premium (HDR/HEVC), descartar variantes AVC/SDR de baja calidad
                if v.bw >= cutoff_bps then
                    keep = true
                end
            elseif v.bw >= floor_bps then
                keep = true
            end

            if keep then
                kept_variants[#kept_variants + 1] = v
            end
        end

        -- Reordenar variantes para priorizar HEVC/HDR en la parte superior del manifest (Codec Supremacy)
        if APE_FORCE_HEVC_FIRST then
            table.sort(kept_variants, function(a, b)
                -- 1. Comparar HDR/Dolby Vision
                if a.is_hdr ~= b.is_hdr then
                    return a.is_hdr
                end
                -- 2. Comparar HEVC
                if a.is_hevc ~= b.is_hevc then
                    return a.is_hevc
                end
                -- 3. Comparar bandwidth
                return a.bw > b.bw
            end)
        else
            -- Ordenación estándar por bitrate
            table.sort(kept_variants, function(a, b)
                return a.bw > b.bw
            end)
        end

        -- Construir manifest final
        local new_lines = {}
        for _, l in ipairs(other_lines) do
            -- Conservar la cabecera EXTM3U en primer lugar
            if l:match("^#EXTM3U") then
                new_lines[#new_lines + 1] = l
                -- Inyectar metadatos informativos
                new_lines[#new_lines + 1] = "#EXT-X-APE-UHDX-MODE:LUA_SUPREMACY"
                if has_hdr then
                    new_lines[#new_lines + 1] = "#EXT-X-APE-UHDX-INTENT:HDR_SUPREME_10000_NIT"
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

        -- Configurar headers de observabilidad y limpiar Content-Length
        ngx.header["X-APE-Floor-Lock"] = string.format("profile=%s;floor=%d;kept=%d;removed=%d", profile, floor_bps, #kept_variants, #variants - #kept_variants)
        ngx.header["X-APE-UHDX-Mode"] = "LUA_SUPREMACY"
        ngx.header["X-APE-UHDX-Anti-Washout"] = APE_ANTI_WASHOUT and "ACTIVE" or "INACTIVE"
        ngx.header.content_length = nil -- Forzar a Nginx a recalcular la longitud del manifest modificado
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
