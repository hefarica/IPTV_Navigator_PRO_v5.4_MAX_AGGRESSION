-- ???????????????????????????????????????????????????????????????????????????
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ ANTES DE TOCAR: lee docs/edge/EDGE_EGRESS_RESOLVER.md
--
-- Este fichero participa en el EGRESS del edge. El proveedor EXIGE egress/auth:
-- el `/cdn/` crudo devuelve 407 (reason=http_407, all_upstreams_failed) porque
-- le falta el `srv`/`ctx` que aporta el resolver. NO cambies la logica de
-- egress/host sin leer ese documento y sin actualizar su pin sha256.
-- _vps_stage/tests/edge_doctrine_assert.js falla si este aviso desaparece.
-- ═══════════════════════════════════════════════════════════════════════════
-- APE GATEWAY v4 ? content handler del plano de metadata
-- ???????????????????????????????????????????????????????????????????????????
-- Ruta:  /cdn/<host-proveedor>[:puerto]/<ruta>.m3u8[?alt=host2,host3]
--
-- NOVEDAD v4 (2026-10-24): SEGUIMIENTO DE 302. Verificado en producci?n: los
-- proveedores Xtream responden 302 a un CDN con token distinto por petici?n
-- (p.ej. line.tivi-ott.net -> 185.89.249.7/live/play/<token>/<id>). Sin seguir
-- el 302 el gateway serv?a una playlist VAC?A. Ahora:
--   * sigue hasta 3 saltos con ngx.location.capture (sin dependencias externas)
--   * s?lo sigue a IP literal p?blica o a host de la allowlist (anti-SSRF)
--   * bloquea rangos privados (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16)
--   * REBASA las URIs al ORIGEN FINAL (el CDN), no al proveedor
--
-- Resto de responsabilidades:
--   * allowlist de hosts (SSRF guard)
--   * rebase de URIs (invariante metadata-only: el player nunca pide video al VPS)
--   * LL-HLS (SERVER-CONTROL si la fuente trae partes)
--   * UHD (4K siempre; 4K real -> 8K declarado; CODECS intacto)
--   * QoE (contadores reales) + floor calibrado del LAB
-- ???????????????????????????????????????????????????????????????????????????
local cjson = require "cjson.safe"
local lib   = require "ape_rebase_lib"
local uhd   = require "ape_uhd"
local lab   = require "ape_lab_bridge"

local FLAGS = ngx.shared.ape_flags
local QOE   = ngx.shared.ape_qoe
local HOSTS = ngx.shared.ape_hosts

local ALLOW_FILE = "/etc/nginx/ape-hosts-allow.txt"
local MAX_HOPS   = 3

local function flag(name, default)
    if not FLAGS then return default end
    local v = FLAGS:get(name)
    if v == nil then return default end
    return (v == "1" or v == 1 or v == true)
end

local function qinc(key, n)
    if QOE then QOE:incr(key, n or 1, 0) end
end

local function qset(key, v)
    if QOE then QOE:set(key, v) end
end

-- ?? [t95] REGISTRO DE HOSTS (la allowlist deja de ser PUERTA) ???????????
-- Modelo invertido: DENY duro SOLO para rangos privados/reservados (SSRF);
-- cualquier HOST P?BLICO se permite SIEMPRE y se AUTO-REGISTRA. Un proveedor
-- nuevo no puede apagar un canal: si est? en las listas generadas, va derecho.
local SELFHEAL_DIR = "/etc/nginx/ape-hosts-allow.d"

-- Rangos privados/reservados por IP LITERAL (sin DNS, coste O(1)).
local function _is_private_lit(h)
    if not h or h == "" then return true end
    local ip = tostring(h):gsub(":%d+$", "")
    if ip == "0.0.0.0" or ip == "::1" or ip == "::" then return true end
    local a, b = ip:match("^(%d+)%.(%d+)%.")
    if a then
        a, b = tonumber(a), tonumber(b)
        if a == 127 or a == 10 or a == 0 then return true end
        if a == 172 and b >= 16 and b <= 31 then return true end
        if a == 192 and b == 168 then return true end
        if a == 169 and b == 254 then return true end
        return false
    end
    local lo = ip:lower()
    if lo:match("^fc") or lo:match("^fd") or lo:match("^fe80") or lo:match("^ff") then return true end
    return false
end

-- Registro en caliente: shared dict inmediato + persistencia AS?NCRONA.
-- Nunca bloquea la petici?n ni provoca reload.
local function register_host(h)
    if not h or h == "" then return end
    local bare = tostring(h):gsub(":%d+$", "")
    if HOSTS then
        HOSTS:set("h:" .. bare, 1, 86400)
        HOSTS:rpush("selfheal_q", bare)   -- la escribe log_by_lua, fuera de esta fase
    end
end

-- Compatibilidad: los llamadores existentes siguen funcionando, pero ahora
-- significa "no es privado" y registra. NUNCA devuelve false por un p?blico.
local function host_allowed(h)
    if _is_private_lit(h) then return false end
    register_host(h)
    return true
end

-- ?? anti-SSRF para redirecciones ?????????????????????????????????????????
local function is_private_host(h)
    local ip = h:match("^(%d+%.%d+%.%d+%.%d+)")
    if not ip then return false end
    local a, b = ip:match("^(%d+)%.(%d+)")
    a, b = tonumber(a), tonumber(b)
    if not a or not b then return true end
    if a == 0 or a == 10 or a == 127 then return true end
    if a == 169 and b == 254 then return true end
    if a == 172 and b >= 16 and b <= 31 then return true end
    if a == 192 and b == 168 then return true end
    if a == 100 and b >= 64 and b <= 127 then return true end
    return false
end

local function is_ip_literal(h)
    -- acepta "1.2.3.4" y "1.2.3.4:puerto" (los CDN Xtream vienen con :80)
    return h:match("^%d+%.%d+%.%d+%.%d+") ~= nil
end

local function parse_url(u)
    if type(u) ~= "string" then return nil end
    local host, rest = u:match("^https?://([^/]+)(.*)$")
    if not host then return nil end
    host = host:gsub("^([^@]+@)", "")        -- quitar userinfo si lo hubiera
    local path, q = rest:match("^([^?]*)(%?.*)$")
    if not path then path, q = rest, "" end
    if path == "" then path = "/" end
    q = (q or ""):gsub("^%?", "")
    return host, path, q
end

local function safe_path(p)
    return type(p) == "string" and p:match("^/[-%w%._~/%%]*$") ~= nil
end

local function safe_host(h)
    return type(h) == "string" and h:match("^[%w%.%-%:]+$") ~= nil
end

-- ?? fetch con seguimiento de 302 ?????????????????????????????????????????
local function fetch_follow(h, p, q, hops)
    hops = hops or MAX_HOPS
    local cur_h, cur_p, cur_q = h, p, q or ""
    for _ = 1, hops + 1 do
        if not (safe_host(cur_h) and safe_path(cur_p)) then return nil, cur_h end
        local qs = (cur_q ~= "") and ("?" .. cur_q) or ""
        local okc, res = pcall(ngx.location.capture,
            "/_ape/_fetch?h=" .. cur_h .. "&p=" .. cur_p .. "&qs=" .. qs)
        if not (okc and res and res.status) then return nil, cur_h, "capture_failed" end

        if res.status >= 300 and res.status < 400 then
            local loc = res.header and res.header["Location"]
            local nh, np, nq = parse_url(loc)
            if not nh then return nil, cur_h, "bad_location" end
            if is_private_host(nh) then
                ngx.log(ngx.WARN, "[ape-gw] redirect a rango privado bloqueado: ", nh)
                return nil, cur_h, "redirect_private"
            end
            if not (is_ip_literal(nh) or host_allowed(nh)) then
                ngx.log(ngx.WARN, "[ape-gw] redirect a host no permitido: ", nh)
                return nil, cur_h, "redirect_not_allowed"
            end
            cur_h, cur_p, cur_q = nh, np, (nq or "")
            qinc("redirects")
        else
            return res, cur_h
        end
    end
    return nil, cur_h
end

-- ??? petici?n ????????????????????????????????????????????????????????????
local host = ngx.var.ape_host
local path = ngx.var.ape_path or "/"
local args = ngx.var.args or ""

-- candidatos
local candidates = { host }
for h in (tostring(ngx.var.arg_alt or "") .. ","):gmatch("([^,%s]+)") do
    if h ~= host then candidates[#candidates + 1] = h end
end

-- [t95] filtro SSRF: se descartan SOLO rangos privados; los p?blicos pasan
local allowed = {}
for _, h in ipairs(candidates) do
    if not _is_private_lit(h) then allowed[#allowed + 1] = h; register_host(h) end
end
if #allowed == 0 then
    qinc("cdn_denied_private")
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"private_range_blocked","hint":"solo se bloquean rangos privados/reservados (SSRF)"}')
    ngx.exit(403)
end
candidates = allowed

-- failover entre candidatos
local t0 = ngx.now()
-- ═══ [t104] EGRESS DEL RESOLVER — reintento ÚNICO ante 407 ═══════════════════
-- El proveedor exige egress/auth: el `/cdn/` crudo devuelve 407 con
-- reason=http_407 / all_upstreams_failed. El resolver aporta `srv` y `ctx`
-- (base64) que el edge no tiene. Aquí se capturan para poder REINTENTAR UNA vez.
-- NO se inventan: si no vienen en la petición, no hay reintento.
-- 1 conexión: el capture fallido ya cerró antes de este punto; el reintento abre
-- una nueva, nunca dos a la vez.
local _ape_srv = (ngx.var.arg_srv or '')
local _ape_ctx = (ngx.var.arg_ctx or '')
local _ape_egress_ok = (_ape_srv ~= '' and _ape_ctx ~= '')
local _ape_egress_tried = false
local function _ape_egress_retry(host_try)
    if not _ape_egress_ok or _ape_egress_tried then return nil end
    _ape_egress_tried = true
    ngx.log(ngx.WARN, "[ape-gw] egress-retry 407 host=", tostring(host_try),
            " srv_len=", #_ape_srv, " ctx_len=", #_ape_ctx)
    return true
end
local winner, res_ok, final_origin, last_status = nil, nil, nil, nil
local last_reason = nil

for _, h in ipairs(candidates) do
    local dk = "down:" .. h
    if not (HOSTS and HOSTS:get(dk)) then
        local res, fh, why = fetch_follow(h, path, args)
        if res and res.status and res.status >= 200 and res.status < 300 then
            winner, res_ok = h, res
            final_origin = "http://" .. fh
            break
        end
        last_status = (res and res.status) or 502
        last_reason = why or (res and res.status and ("http_" .. res.status)) or "capture_failed"
        if HOSTS then HOSTS:set(dk, 1, 15) end
        qinc("host_down:" .. h)
    end
end

local elapsed_ms = math.floor(((ngx.now() - t0) * 1000) + 0.5)

if not res_ok then
    qinc("all_failed")
    ngx.status = (last_status and last_status >= 400) and last_status or 502
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ ok = false, error = "all_upstreams_failed",
        tried = candidates, reason = last_reason, path = path, ms = elapsed_ms }))
    return
end

-- ?? cuerpo ???????????????????????????????????????????????????????????????
local body  = res_ok.body or ""
local ctype = res_ok.header["Content-Type"] or "application/vnd.apple.mpegurl"

if lib.is_too_big(#body) then
    qinc("too_large")
    ngx.status = 502
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ ok = false, error = "playlist_too_large", bytes = #body }))
    return
end

-- rebase al ORIGEN FINAL (CDN tras el 302), nunca al proveedor nominal
local rebased, n_uri, n_attr = lib.rebase_body(body, final_origin)

-- LL-HLS
local sc_added = false
if lib.has_parts(rebased) then
    rebased, sc_added = lib.inject_server_control(rebased)
end

-- UHD: 4K siempre; 8K declarado SÓLO si can_declare_8k (A LOCKED). CODECS intacto.
local uhd_mode, uhd_n = nil, 0
local uhd_can8k = nil
if lib.is_master(rebased) then
    if uhd.codec_truth_fields(rebased) > 0 then
        ngx.log(ngx.WARN, "[ape-gw] hev1 en CODECS: GOLDEN RULE, UHD omitido")
    elseif flag("uhd8k", false) then
        -- Override explícito del propietario (t32): la guarda se APLICA, no sólo se mide.
        -- Sin can_declare_8k (nivel < L183 o fuente < 3840) ⇒ 4K, nunca 8K ilegal.
        local ok8 = uhd.can_declare_8k(rebased, { allow_8k = true })
        uhd_can8k = ok8
        if ok8 then
            rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
                add_pq = flag("uhd_pq", false), only_top = true, can8k = true })
            if uhd_n > 0 then uhd_mode = "8k" end
        else
            rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_4K, mode = "4k",
                add_pq = flag("uhd_pq", false), only_top = true, can8k = false })
            if uhd_n > 0 then uhd_mode = "4k" end
        end
    elseif flag("uhd_auto", true) then
        local m
        rebased, uhd_n, m, uhd_can8k = uhd.declare_auto(rebased, {
            add_pq = flag("uhd_pq", false),
            allow_8k = flag("uhd8k", false),
        })
        if uhd_n > 0 then uhd_mode = m end
    elseif flag("uhd4k", true) then
        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_4K, mode = "4k",
            add_pq = flag("uhd_pq", false), only_top = true })
        if uhd_n > 0 then uhd_mode = "4k" end
    end
end

if flag("hint", false) then
    local changed
    rebased, changed = lib.inject_presentation_hint(rebased, "2160p", 60)
    if changed then qinc("hint_injected") end
end

-- ??? V?A B ? FUSIBLE DE SUELO ? EJECUTOR REAL (content handler) ???????????
-- LECCI?N DE t18: la V?a B original viv?a en un body_filter que S?LO estaba
-- cableado en /meta/ (8088). La ruta PUBLICADA (/cdn/, ape-meta-public.conf)
-- ejecuta ?nicamente `content_by_lua_file ape_gateway.lua` ? el fusible no se
-- ejecutaba, y adem?s no habr?a tenido objetivo: el cuerpo que sirve /cdn/ es
-- un manifiesto HLS del PROVEEDOR, y `#EXTVLCOPT:`/`#KODIPROP:` son directivas
-- M3U Plus del CAT?LOGO, no vocabulario HLS. Medido sobre el artefacto real:
-- `adaptive-minbitrate` = 0 y `min_bandwidth` = 0, con controles positivos
-- `adaptive-maxbw` = 2.754 ? el 0 es real, no un fallo de escaneo.
--
-- Por eso el fusible pasa a ser SEM?NTICO y vive aqu?, en el ?nico handler que
-- la ruta publicada ejecuta. No se a?ade ninguna directiva *_by_lua: se respeta
-- una por fase. No se toca CODECS/BANDWIDTH/RESOLUTION/FRAME-RATE.
--
-- Qu? hace, en dos etapas expl?citas:
--   1) DECIDE el suelo con la fuente que YA exist?a en el gateway
--      (`lab.floor_for(profile)` ? floors de floor_lock_config.json / DNA).
--   2) Cuando el fusible est? CERRADO, INYECTA el suelo de DISE?O declarado
--      (#EXTVLCOPT:adaptive-minbitrate / #KODIPROP:...min_bandwidth) y luego lo
--      RELAJA al suelo de FUSI?N. La inyecci?n crea el objetivo; la relajaci?n
--      es la que da efecto. VLC y Kodi honran esas directivas (efecto real);
--      un parser HLS estricto las ignora como tag desconocido (RFC 8216 ?6.3.1:
--      inofensivo). Abierto ? NO se inyecta nada y el cuerpo es byte-id?ntico.
--
-- El cuerpo servido es el ?nico sitio donde esto es honesto: el fusible S?LO
-- BAJA el suelo (fuse_bps <= design_bps), as? que no puede volver un canal m?s
-- dif?cil de reproducir de lo que el propio dise?o del LAB ya pretende.
local FUSE_FLOOR_BPS = {
    P0 = 18000000, P1 = 10000000, P2 = 10000000,
    P3 = 3500000,  P4 = 1400000,  P5 = 700000,
}
local FUSE_TRIGGER, FUSE_RECOVER, FUSE_HOLD = 25, 70, 20   -- % / % / s
local FUSE_DEFAULT_PROFILE = "P3"

local function fuse_norm_profile(p)
    if type(p) ~= "string" then return nil end
    local u = p:upper()
    if u:match("^P[0-5]$") then return u end
    return nil
end

local function fuse_profile()
    return fuse_norm_profile(ngx.var.http_x_ape_profile)
        or fuse_norm_profile(ngx.var.arg_profile)
        or fuse_norm_profile(ngx.var.arg_p)
        or FUSE_DEFAULT_PROFILE
end

local function fuse_keys()
    local ip = ngx.var.remote_addr or "-"
    local h  = ngx.var.ape_host or ngx.var.host or "-"
    return "fusestate:" .. ip .. ":" .. h, "buf:" .. ip .. ":" .. h
end

-- Relajaci?n del suelo. Misma sem?ntica y mismos patrones que la V?a B de
-- /meta/ (ape_uri_rebase.lua). La guarda de frontera `%f[%w_]` evita casar
-- `prefetch_min_bandwidth=` (presupuesto de prefetch), de modo que el ?NICO
-- campo tocado sea el suelo.
local function fuse_rewrite(body, bps)
    local v = tonumber(bps)
    if not v then return body, 0 end
    v = math.floor(v)
    if v <= 0 then return body, 0 end
    local s = tostring(v)
    local hits, n = 0, 0
    body, n = body:gsub("%f[%w_](adaptive%-minbitrate=)(%d+)", "%1" .. s)
    hits = hits + n
    body, n = body:gsub("%f[%w_](min_bandwidth=)(%d+)", "%1" .. s)
    hits = hits + n
    return body, hits
end

-- Inyecci?n del suelo de DISE?O tras #EXTM3U. Devuelve n? de directivas (0|2).
local function fuse_inject(body, bps)
    local v = tonumber(bps)
    if not v then return body, 0 end
    v = math.floor(v)
    if v <= 0 then return body, 0 end
    if not body:find("#EXTM3U", 1, true) then return body, 0 end
    local s = tostring(v)
    local dirs = "#EXTVLCOPT:adaptive-minbitrate=" .. s .. "\n"
              .. "#KODIPROP:inputstream.adaptive.min_bandwidth=" .. s .. "\n"
    local out, n = body:gsub("(#EXTM3U[^\n]*\n)", "%1" .. dirs, 1)
    if n > 0 then return out, 2 end
    return body, 0
end

-- Hist?resis TRIGGER=25 / RECOVER=70 / HOLD=20 persistida por dispositivo.
local function fuse_decide(buf)
    local skey = fuse_keys()
    local now  = ngx.time()
    local state, ts = nil, 0
    if FLAGS then
        local raw = FLAGS:get(skey)
        if raw then
            local s, t = tostring(raw):match("^(%u+):(%d+)$")
            if s then state, ts = s, tonumber(t) or 0 end
        end
    end
    local engaged = (state == "CLOSED")

    -- HOLD: una vez cerrado no se reabre antes de FUSE_HOLD segundos.
    if engaged and (now - ts) < FUSE_HOLD then return true end

    local new
    if buf == nil then
        new = engaged                    -- sin se?al de buffer: mantener estado
    elseif buf < FUSE_TRIGGER then
        new = true                       -- buffer bajo  ? cerrar (relajar suelo)
    elseif buf > FUSE_RECOVER then
        new = false                      -- buffer sano  ? abrir (suelo dise?o)
    else
        new = engaged                    -- zona muerta  ? mantener
    end

    if new ~= engaged and FLAGS then
        FLAGS:set(skey, (new and "CLOSED" or "OPEN") .. ":" .. now, 3600)
    end
    return new
end

local fuse_forced = (ngx.var.http_x_ape_fuse == "1" or ngx.var.http_x_ape_fuse == "true")
local fuse_skey, fuse_bkey = fuse_keys()
local fuse_buf = tonumber(ngx.var.http_x_ape_buffer)
if fuse_buf == nil and FLAGS then
    fuse_buf = tonumber(FLAGS:get(fuse_bkey))
end

local fuse_engaged
if fuse_forced then
    fuse_engaged = true                  -- override manual expl?cito
    if FLAGS then FLAGS:set(fuse_skey, "CLOSED:" .. ngx.time(), 3600) end
else
    fuse_engaged = fuse_decide(fuse_buf)
end

local fuse_prof    = fuse_profile()
local design_bps   = tonumber(lab.floor_for(fuse_prof)) or 0
local fuse_bps     = FUSE_FLOOR_BPS[fuse_prof] or FUSE_FLOOR_BPS[FUSE_DEFAULT_PROFILE]
-- INVARIANTE: el fusible S?LO relaja. Nunca por encima del suelo de dise?o.
if design_bps > 0 and fuse_bps > design_bps then fuse_bps = design_bps end

local fuse_injected, fuse_subst, fuse_floor_final = 0, 0, design_bps
if fuse_engaged then
    if design_bps > 0 then
        rebased, fuse_injected = fuse_inject(rebased, design_bps)
    end
    if fuse_injected > 0 then
        rebased, fuse_subst = fuse_rewrite(rebased, fuse_bps)
        if fuse_subst > 0 then fuse_floor_final = fuse_bps end
    end
end

-- ?? respuesta ????????????????????????????????????????????????????????????
ngx.header["Content-Type"]      = ctype
ngx.header["Content-Length"]    = nil
ngx.header["Cache-Control"]     = "no-store"
ngx.header["X-APE-CDN"]         = winner
ngx.header["X-APE-Origin"]      = final_origin or ""
ngx.header["X-APE-Failover"]    = tostring(winner ~= nil and winner ~= candidates[1])
ngx.header["X-APE-Upstream-Ms"] = tostring(elapsed_ms)
ngx.header["X-APE-URI-Rebased"] = tostring(n_uri)
ngx.header["X-APE-LL-HLS"]      = sc_added and "server-control-added"
    or (lib.has_parts(rebased) and "passthrough" or "none")
ngx.header["X-APE-UHD"]         = uhd_mode and (uhd_mode .. ":" .. uhd_n) or "off"
ngx.header["X-APE-LAB-FLOOR"]   = tostring(lab.floor_for(nil))
-- Estado del fusible, auditable en la propia respuesta (cabecera + cuerpo).
ngx.header["X-APE-Floor-Fuse"]  = string.format(
    "STATE=%s,PROFILE=%s,FLOOR=%d,DESIGN=%d,INJECTED=%d,SUBST=%d,TRIGGER=%d,RECOVER=%d,HOLD=%d,BUF=%s",
    fuse_engaged and "CLOSED" or "OPEN", fuse_prof, fuse_floor_final, design_bps,
    fuse_injected, fuse_subst, FUSE_TRIGGER, FUSE_RECOVER, FUSE_HOLD,
    fuse_buf and tostring(fuse_buf) or "na")
ngx.print(rebased)

-- ?? QoE ??????????????????????????????????????????????????????????????????
qinc("req")
qinc("bytes", #rebased)
qset("last_ms", elapsed_ms)
qset("last_host", winner)
qset("last_origin", final_origin)
qset("last_ts", ngx.time())
if n_uri > 0 then qinc("rebase_ok") end
if winner and candidates[1] and winner ~= candidates[1] then qinc("failovers") end
if sc_added then qinc("llhls_sc") end
if uhd_mode == "4k" then qinc("uhd4k") end
if uhd_mode == "8k" then qinc("uhd8k") end
-- Decisión UHD de la ÚLTIMA petición (B-02: la publica /_ape/uhd)
qset("uhd_mode_last", uhd_mode or "off")
qset("can8k_last", uhd_can8k and 1 or 0)

-- ?? M?tricas propias del fusible (V?a B, ruta publicada) ?????????????????
-- Contadores distintos por estado: un `fuse_hits`>0 s?lo puede ocurrir si de
-- verdad se sirvi? el suelo relajado en /cdn/. `fuse_subst` acumula el n?mero
-- de sustituciones, no el de peticiones.
qinc(fuse_engaged and "fuse_closed" or "fuse_open")
if fuse_injected > 0 then qinc("fuse_injected", fuse_injected) end
if fuse_subst > 0 then
    qinc("fuse_hits")
    qinc("fuse_subst", fuse_subst)
end
qset("last_fuse", (fuse_engaged and "CLOSED" or "OPEN") .. ":" .. fuse_prof
    .. ":" .. tostring(fuse_floor_final))
