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
-- ape_codec_cascade hoisted aquí (module scope) — evita pcall(require) repetido
-- en el loop de variantes. package.loaded garantiza singleton por worker.
-- S6 F1 fix 2026-06-08: pcall inline era correcto pero redundante × variantes.
local cc_cascade_mod = require("ape_codec_cascade")
-- ADITIVO 2026-06-16: lazo bitrate-reactor → manifest (floor adaptativo al bw real).
-- require DEFENSIVO (pcall): si el módulo faltara en disco, bw_floor_mod=nil → el filtro usa
-- el floor estático cfg.floor_bps = comportamiento de HOY (passthrough additivo, nunca rompe).
-- Sandbox probado: vps/nginx/lua/sandbox/test_bw_adaptive.lua (13/13). Doc: LUA_ENGINES_..._AUDIT §Wiring.
local ok_bwf, bw_floor_mod = pcall(require, "bw_adaptive_floor")
if not ok_bwf then bw_floor_mod = nil end
-- ADITIVO 2026-06-17 (Sol 1): resolver de profile ARBITRARIO (server-side por stream_id) para players que
-- NO reenvían X-APE-Profile (OkHttp/ExoPlayer). require defensivo → módulo ausente = comportamiento de hoy.
local ok_pr, profile_resolver = pcall(require, "ape_profile_resolver")
if not ok_pr then profile_resolver = nil end
-- ADITIVO 2026-06-19 (Science-Safe): capa device_state que ENVUELVE el resolver vivo. require defensivo →
-- módulo ausente = comportamiento de hoy. Solo añade un fallback (header→arg→stream_id→DEVSTATE→P2) sin quitar nada.
local ok_prs, profile_resolver_ss = pcall(require, "ape_profile_resolver_science_safe")
if not ok_prs then profile_resolver_ss = nil end
-- ADITIVO 2026-06-21 (CRYSTAL FORTIFY -- Camino A): capa de amplificacion Crystal.
-- Fortifica CODECS/RESOLUTION/VIDEO-RANGE en TODAS las variantes P0-P5 de forma
-- orden-agnostica (audio preservado) y sin duplicar VIDEO-RANGE. require defensivo
-- modulo ausente = passthrough (autopista). Reemplaza Virtual 4K y Codec Cascade.
local ok_cf, crystal_fortify_mod = pcall(require, "ape_crystal_fortify")
if not ok_cf then crystal_fortify_mod = nil end
local CRYSTAL_FORTIFY_ACTIVE = true  -- scope archivo: visible en todo el script

-- ═══ STAGE 0: VIDEO BYPASS (BLINDAJE DE MEMORIA) ════════════════════
local uri = ngx.var.uri or ""
local _ct = (ngx.header["Content-Type"] or ""):lower()
if not uri:find(".m3u8", 1, true) and not uri:find(".m3u", 1, true) and not _ct:find("mpegurl", 1, true) then
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

-- APE GENERIC SHIELD URL REWRITE v3 (host del URI; +URI= attrs KEY/MAP/MEDIA/PART; pcall-safe autopista)
do
    local _tok, _host = (ngx.var.uri or ""):match("^/shield/([a-f0-9]+)/([^/]+)/")
    if _tok and _host then
        local _pfx = "/shield/" .. _tok .. "/" .. _host
        local ok_rw, rw = pcall(function()
            local b = body
            b = b:gsub("([\r\n])(https?://)([^/%s\"']+)([^%s\r\n\"']*)", function(nl, _s, h, path)
                if h == "iptv-ape.duckdns.org" then return nil end
                if path == "" then path = "/" end
                return nl .. "/shield/" .. _tok .. "/" .. h .. path
            end)
            b = b:gsub("([\r\n])(/[^\r\n]*)", function(nl, path)
                if path:find("^/shield/", 1, false) then return nil end
                return nl .. _pfx .. path
            end)
            b = b:gsub('URI="([^"]*)"', function(u)
                if u == "" then return nil end
                if u:find("^/shield/", 1, false) then return nil end
                local h, rest = u:match("^https?://([^/]+)(.*)$")
                if h then
                    if h == "iptv-ape.duckdns.org" then return nil end
                    if rest == "" then rest = "/" end
                    return 'URI="/shield/' .. _tok .. '/' .. h .. rest .. '"'
                elseif u:sub(1,1) == "/" then
                    return 'URI="' .. _pfx .. u .. '"'
                end
                return nil
            end)
            return b
        end)
        if ok_rw and rw then body = rw end
    end
end

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

    -- Determine profile. Orden: cliente (?profile/?p/X-APE-Profile) → Sol 1 server-side (stream_id) → P2.
    local profile = nil
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
    if not (profile and profile:match("^P[0-6]$")) then profile = nil end
    -- ADITIVO 2026-06-17 (Sol 1: ESCALACIÓN DE FLOOR POR CANAL): si el cliente NO trajo un perfil válido
    -- (OkHttp/ExoPlayer que NO reenvían #EXTHTTP), resolver SERVER-SIDE por la identidad del canal (stream_id).
    -- by_streamid escala a P1/P0 (floor_lock ACTIVE → fuerza la variante alta) SOLO canales con evidencia QoE;
    -- el resto → default P2 (BYPASS seguro, todas las variantes). Solo FALLBACK → NUNCA pisa el perfil del
    -- cliente. pcall + nil-safe → módulo/map ausente → profile nil → P2 de hoy. Freeze-safety: adaptive-floor relaja.
    if not profile and profile_resolver then
        local ok_rv, resolved = pcall(function() return profile_resolver.resolve(ngx.var.uri) end)
        if ok_rv and type(resolved) == "string" and resolved:match("^P[0-5]$") then
            profile = resolved
        end
    end
    -- ADITIVO 2026-06-19 (Science-Safe): si sigue sin perfil, intentar device_state por IP
    -- (/dev/shm/ape_devstate_<ip>.json). Puramente aditivo + pcall: módulo/archivo ausente o fallo → P2 de hoy.
    -- Solo FALLBACK tras header/arg/stream_id → NUNCA pisa un perfil ya resuelto. No cambia ninguna ruta existente.
    if not profile and profile_resolver_ss and type(profile_resolver_ss.profile_from_devstate) == "function" then
        local ok_ds, ds = pcall(function() return profile_resolver_ss.profile_from_devstate(ngx.var.remote_addr) end)
        if ok_ds and type(ds) == "string" and ds:match("^P[0-5]$") then
            profile = ds
        end
    end
    if not profile then profile = "P0" end   -- default final (= comportamiento de hoy si no resolvió)

    -- Map P0-P5 to JSON profile keys — CADA NIVEL su propia config (mandato HFRC:
    -- "4K forzado para los 6 niveles, cada uno se configura distinto"). P2 es el
    -- catch-all para requests sin perfil o perfiles fuera de rango.
    local profile_keys = {
        P0 = "P0_SHOWROOM_FLASH_4K",
        P1 = "P1_DAILY_EXTREME_4K",
        P2 = "P2_SAFE_COMPAT",
        P3 = "P3_HD_BOOST",
        P4 = "P4_HD_LITE",
        P5 = "P5_SD_RESCUE",
        P6 = "P6_CHINA_BOX_8K_ULTRA_AGGRESSIVE"  -- CRYSTAL EDGE: máxima agresividad visual
    }
    local mapped_profile = profile_keys[profile] or "P2_SAFE_COMPAT"  -- P6 → P6_CHINA_BOX_8K_ULTRA_AGGRESSIVE
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
            -- HEVC FIRST — detección universal 2026-06-08.
            -- Usa cc_cascade_mod.is_hevc_family() (hoisted al top: singleton per worker).
            -- Cubre hvc1/hev1/hevc/h265/H.265/x265/libx265/video/hevc/MPEG-H/JCT-VC.
            -- Fallback inline si el módulo no tiene is_hevc_family (versión anterior en disco).
            local is_hevc_variant = false
            if cc_cascade_mod and cc_cascade_mod.is_hevc_family then
                is_hevc_variant = cc_cascade_mod.is_hevc_family(codecs)
            else
                -- Fallback inline — cubre los alias más comunes
                local cl = codecs:lower()
                is_hevc_variant = cl:find("hvc1",   1, true) ~= nil
                               or cl:find("hev1",   1, true) ~= nil
                               or cl:find("hevc",   1, true) ~= nil
                               or cl:find("h265",   1, true) ~= nil
                               or cl:find("h.265",  1, true) ~= nil
                               or cl:find("x265",   1, true) ~= nil
                               or cl:find("mpeg-h", 1, true) ~= nil
            end

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

        -- ADITIVO 2026-06-16: floor ADAPTATIVO al bw real (lazo bitrate-reactor → manifest).
        -- Monótono ↓: eff_floor <= cfg.floor_bps SIEMPRE (el guard `adj <= eff_floor` lo fuerza)
        -- → nunca descarta MÁS variantes que el floor estático → 0 pérdida de canal. pcall +
        -- ngx.shared.circuit_metrics nil-safe → passthrough (autopista). DEGRADED (bw real bajo)
        -- relaja el floor → sobrevive un peldaño que el player SÍ sostiene (anti-freeze).
        local eff_floor = tonumber(cfg.floor_bps) or 0
        if bw_floor_mod then
            local ok_bw, adj = pcall(function()
                local R = ngx.shared.circuit_metrics
                if not R then return nil end
                local bw_ts = tonumber(R:get("bw_ts"))               -- ts de la última muestra REAL (ngx.now())
                local age_s = bw_ts and (ngx.now() - bw_ts) or nil   -- nil si nunca hubo muestra real
                return bw_floor_mod.adaptive_floor(cfg.floor_bps, {
                    state        = R:get("bw_state"),
                    ewma_bps     = R:get("bw_ewma_bps"),
                    floor_4k_bps = cfg.floor_bps,   -- WARN2: floor REAL del perfil (P0=18M/P1=14M), no 15M hardcoded
                    age_s        = age_s,           -- WARN3: gate de frescura (descarta EWMA stale del tick 1Hz)
                })
            end)
            if ok_bw and type(adj) == "number" and adj <= eff_floor then
                eff_floor = adj
            end
        end

        -- ADITIVO 2026-06-17 (ESCALACIÓN +imagen): simétrico al adaptive_floor. SOLO en perfiles BYPASS
        -- (P2-P5) y SOLO si cfg.escalation=="ACTIVE" (default OFF → inerte). Si el master tiene una variante
        -- ALTA y el bw real la sostiene (healthy + fresco), TIGHTEN el floor para forzar la variante alta en
        -- vez de dejar al ABR sub-seleccionar. Freeze-safe: 0 bajo red mala/sin evidencia/sin variante alta;
        -- la variante top (mayor score) SIEMPRE se conserva (rama idx==highest_idx). pcall + dict nil-safe.
        local esc_floor = 0
        -- F3 (review S6): allowlist POSITIVA del floor_lock (string "BYPASS"/nil) — si un perfil futuro
        -- usa floor_lock como objeto/valor no-estándar, la escalación NO aplica (jamás en P0/P1 ACTIVE).
        if bw_floor_mod and cfg.escalation == "ACTIVE" and (cfg.floor_lock == "BYPASS" or cfg.floor_lock == nil) then
            local maxbw = 0
            for _, v in ipairs(variants) do
                local b = tonumber(v.bw) or 0
                if b > maxbw then maxbw = b end
            end
            local ok_e, ef = pcall(function()
                local R = ngx.shared.circuit_metrics
                if not R then return 0 end
                local bw_ts = tonumber(R:get("bw_ts"))
                local age_s = bw_ts and (ngx.now() - bw_ts) or nil
                return bw_floor_mod.escalation_floor(maxbw, {
                    state    = R:get("bw_state"),
                    ewma_bps = R:get("bw_ewma_bps"),
                }, age_s)
            end)
            if ok_e and type(ef) == "number" and ef > 0 then esc_floor = ef end
        end

        for idx, v in ipairs(variants) do
            local keep = false
            -- Always keep the highest scoring variant as fallback
            if idx == highest_idx then
                keep = true
            elseif cfg.floor_lock == "ACTIVE" then
                if v.bw >= eff_floor then
                    keep = true
                end
            elseif esc_floor > 0 then
                -- ESCALACIÓN (BYPASS + canal sostiene tier alto): descarta variantes MUY bajas → fuerza la alta
                if v.bw >= esc_floor then
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

        -- CRYSTAL FORTIFY HOOK (Camino A 2026-06-21)
        -- Amplifica CODECS/RESOLUTION/VIDEO-RANGE en TODAS las variantes de kept_variants.
        -- Actua DESPUES del floor (kept_variants ya filtrado) y ANTES del emit.
        -- pcall + nil-safe: modulo ausente o fallo = passthrough (invariante PASSTHROUGH).
        if CRYSTAL_FORTIFY_ACTIVE and crystal_fortify_mod then
            local cf_ok, cf_err = pcall(function()
                kept_variants = crystal_fortify_mod.fortify_variants(kept_variants, mapped_profile, cfg)
            end)
            if not cf_ok then
                ngx.log(ngx.WARN, "[CRYSTAL-FORTIFY] fortify_variants failed (passthrough): " .. tostring(cf_err))
            else
                ngx.log(ngx.INFO, "[CRYSTAL-FORTIFY] OK profile=" .. tostring(mapped_profile) .. " variants=" .. tostring(#kept_variants))
            end
        end

        -- Apply virtual 4K (FAKE 4K) to the top variant if active.
        -- Codec = T1 de la cascada (respeta override CSV del widget). HDR=PQ SOLO si
        -- el perfil lo pide (cfg.virtual_4k_hdr=="ACTIVE", showroom P0/P1) → forzar PQ
        -- sobre SDR = pantallazo negro; el SDR→HDR real lo hace el TV por ADB.
        -- LEVER B (2026-06-18): guard honesto anti-fake-4K-sobre-AVC (FZ-01 / TG-2).
        -- CHINA BOX FAKE-4K (2026-06-18, ORDEN EXPLÍCITA del propietario — override de LEVER B):
        -- el dueño ordena declarar 4K FAKE en los canales que NO son 4K real (= fuentes AVC/H264).
        -- CHINA_BOX_FAKE_4K=true => el guard de LEVER B queda DESACTIVADO: virtual_4k dispara también
        -- sobre AVC en P2-P5 (fake-4K en "los que no hay 4K real"). REVERSIBLE: CHINA_BOX_FAKE_4K=false
        -- restaura LEVER B (no fake-4K sobre AVC) en 1 línea. Caveat ACEPTADO por el dueño: 4K+PQ sobre
        -- AVC SDR puede dar color-shift/negro en players que honran STREAM-INF; sin red Phase-G en 302→CDN
        -- directo. virtual_4k SOLO actúa en MASTER playlists (inerte si el proveedor responde 302→CDN media).
        -- VIRTUAL 4K BLOCK -- DESACTIVADO por Crystal Fortify (Camino A 2026-06-21)
        -- Crystal Fortify aplica CODECS/RESOLUTION/VIDEO-RANGE a TODAS las variantes.
        -- Reactivar: cambiar CRYSTAL_FORTIFY_ACTIVE = false abajo.
        -- CRYSTAL_FORTIFY_ACTIVE declarada en scope de archivo (L41) -- ver SCOPE FIX 2026-06-21
        local CHINA_BOX_FAKE_4K = (not CRYSTAL_FORTIFY_ACTIVE)   -- <== APAGADO en 1 línea: false restaura el guard honesto LEVER B
        local _v4k_allow = true
        if (not CHINA_BOX_FAKE_4K) and cfg.virtual_4k == "ACTIVE" and #kept_variants > 0 and not (profile == "P0" or profile == "P1") then
            local _tc = (kept_variants[1].codecs or ""):lower()
            if _tc:find("avc1", 1, true) or _tc:find("h264", 1, true) then
                _v4k_allow = false
                ngx.log(ngx.WARN, "[LEVER-B] virtual_4k SKIP (P2-P5 fuente AVC -> no fake-4K/PQ): profile=" .. tostring(profile))
            end
        end
        if cfg.virtual_4k == "ACTIVE" and #kept_variants > 0 and _v4k_allow then
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
        if cfg.codec_cascade == "ACTIVE" and not CRYSTAL_FORTIFY_ACTIVE then  -- DESACTIVADO por Crystal Fortify (Camino A 2026-06-21)
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
                -- CRYSTAL FORTIFY METADATA (Camino A 2026-06-21)
                if CRYSTAL_FORTIFY_ACTIVE and crystal_fortify_mod then
                    pcall(function()
                        crystal_fortify_mod.inject_crystal_metadata(new_lines, mapped_profile, profile)
                    end)
                end
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
-- ADITIVO 2026-06-21: append ALL calibrated directives (pcall additive; RFC 8216 4.2 -> ignored by non-grok players, read by VPS engine/daemon/VLC/Kodi). FREEZELESS: on error body intacto.
pcall(function()
    if type(body) ~= "string" then return end
    local _sid = (ngx.var.uri or ""):match("(%d+)%.m3u8") or (ngx.var.uri or ""):match("/(%d+)/")
    local _d = require("ape_quantum_metadata_calibrator").directives({ profile = profile, stream_id = _sid })
    if _d and #_d > 0 then body = body .. table.concat(_d, "\n") .. "\n" end
end)

ngx.arg[1] = body
