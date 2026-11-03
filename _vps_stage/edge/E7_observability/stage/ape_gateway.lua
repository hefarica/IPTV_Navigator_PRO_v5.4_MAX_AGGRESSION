-- ═══════════════════════════════════════════════════════════════════════════
-- APE GATEWAY v4 — content handler del plano de metadata
-- ═══════════════════════════════════════════════════════════════════════════
-- Ruta:  /cdn/<host-proveedor>[:puerto]/<ruta>.m3u8[?alt=host2,host3]
--
-- NOVEDAD v4 (2026-10-24): SEGUIMIENTO DE 302. Verificado en producción: los
-- proveedores Xtream responden 302 a un CDN con token distinto por petición
-- (p.ej. line.tivi-ott.net -> 185.89.249.7/live/play/<token>/<id>). Sin seguir
-- el 302 el gateway servía una playlist VACÍA. Ahora:
--   * sigue hasta 3 saltos con ngx.location.capture (sin dependencias externas)
--   * sólo sigue a IP literal pública o a host de la allowlist (anti-SSRF)
--   * bloquea rangos privados (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16)
--   * REBASA las URIs al ORIGEN FINAL (el CDN), no al proveedor
--
-- Resto de responsabilidades:
--   * allowlist de hosts (SSRF guard)
--   * rebase de URIs (invariante metadata-only: el player nunca pide video al VPS)
--   * LL-HLS (SERVER-CONTROL si la fuente trae partes)
--   * UHD (4K siempre; 4K real -> 8K declarado; CODECS intacto)
--   * QoE (contadores reales) + floor calibrado del LAB
-- ═══════════════════════════════════════════════════════════════════════════
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

-- ── allowlist ────────────────────────────────────────────────────────────
local function host_allowed(h)
    if ngx.var.remote_addr == "127.0.0.1" then return true end
    local raw = HOSTS and HOSTS:get("allowlist")
    if not raw then
        local f = io.open(ALLOW_FILE, "r")
        if f then raw = f:read("*a"); f:close() else raw = "__missing__" end
        if HOSTS then HOSTS:set("allowlist", raw, 60) end
    end
    local blob = "," .. tostring(raw):gsub("[#][^\n]*", ""):gsub("%s+", ",") .. ","
    local bare = h:gsub(":%d+$", "")
    return blob:find("," .. h .. ",", 1, true) ~= nil
        or blob:find("," .. bare .. ",", 1, true) ~= nil
end

-- ── anti-SSRF para redirecciones ─────────────────────────────────────────
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

-- ── fetch con seguimiento de 302 ─────────────────────────────────────────
-- E7 · instrumentación de la decisión (aditiva; no cambia el contrato de éxito):
--   devuelve un 4º valor `meta` = { n = redirects seguidos, first_ms = duración
--   del primer hop (proveedor), last_ms = duración del último hop (CDN tras el
--   302), exhausted = true si agotó MAX_HOPS }.
--   Coste: 2 × ngx.now() por hop (nanosegundos, memoria del worker).
local function fetch_follow(h, p, q, hops)
    hops = hops or MAX_HOPS
    local cur_h, cur_p, cur_q = h, p, q or ""
    local meta = { n = 0, first_ms = nil, last_ms = nil, exhausted = false }
    for _ = 1, hops + 1 do
        if not (safe_host(cur_h) and safe_path(cur_p)) then return nil, cur_h, nil, meta end
        local qs = (cur_q ~= "") and ("?" .. cur_q) or ""
        local t_hop = ngx.now()
        local okc, res = pcall(ngx.location.capture,
            "/_ape/_fetch?h=" .. cur_h .. "&p=" .. cur_p .. "&qs=" .. qs)
        local hop_ms = math.floor(((ngx.now() - t_hop) * 1000) + 0.5)
        if meta.n == 0 then meta.first_ms = hop_ms end
        meta.last_ms = hop_ms
        if not (okc and res and res.status) then return nil, cur_h, "capture_failed", meta end

        if res.status >= 300 and res.status < 400 then
            local loc = res.header and res.header["Location"]
            local nh, np, nq = parse_url(loc)
            if not nh then return nil, cur_h, "bad_location", meta end
            if is_private_host(nh) then
                ngx.log(ngx.WARN, "[ape-gw] redirect a rango privado bloqueado: ", nh)
                return nil, cur_h, "redirect_private", meta
            end
            if not (is_ip_literal(nh) or host_allowed(nh)) then
                ngx.log(ngx.WARN, "[ape-gw] redirect a host no permitido: ", nh)
                return nil, cur_h, "redirect_not_allowed", meta
            end
            meta.n = meta.n + 1
            cur_h, cur_p, cur_q = nh, np, (nq or "")
            qinc("redirects")
        else
            return res, cur_h, nil, meta
        end
    end
    -- E7: motivo explícito al agotar MAX_HOPS (antes llegaba nil y el JSON de
    -- error decía "capture_failed"). El status no cambia (502 por defecto):
    -- es diagnóstico, no comportamiento.
    meta.exhausted = true
    return nil, cur_h, "max_hops", meta
end

-- ═══ petición ════════════════════════════════════════════════════════════
local host = ngx.var.ape_host
local path = ngx.var.ape_path or "/"
local args = ngx.var.args or ""

-- candidatos
local candidates = { host }
for h in (tostring(ngx.var.arg_alt or "") .. ","):gmatch("([^,%s]+)") do
    if h ~= host then candidates[#candidates + 1] = h end
end

-- filtro allowlist
local allowed = {}
for _, h in ipairs(candidates) do
    if host_allowed(h) then allowed[#allowed + 1] = h end
end
if #allowed == 0 then
    qinc("cdn_denied")
    -- E7 · se declara el intento fallido (denegado, sin fetch)
    ngx.ctx.ape_dec = { outcome = "denied", status = 403, hops = 0, attempts = 0 }
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ ok = false, error = "host_not_allowed", host = host,
        hint = "añadir a " .. ALLOW_FILE }))
    return
end
candidates = allowed

-- failover entre candidatos
local t0 = ngx.now()
local winner, res_ok, final_origin, last_status = nil, nil, nil, nil
local last_reason = nil
local last_meta, tried = nil, 0     -- E7 · decisiones que alimentan /_ape/metrics

for _, h in ipairs(candidates) do
    local dk = "down:" .. h
    if true then -- APE 2026-10-26: breaker ELIMINADO (autopista: siempre intentar)
        tried = tried + 1                       -- E7 · candidatas realmente intentadas
        local res, fh, why, meta = fetch_follow(h, path, args)
        last_meta = meta                        -- E7
        if res and res.status and res.status >= 200 and res.status < 300 then
            winner, res_ok = h, res
            final_origin = "http://" .. fh
            break
        end
        last_status = (res and res.status) or 502
        last_reason = why or (res and res.status and ("http_" .. res.status)) or "capture_failed"
        -- APE 2026-10-26: castigo desactivado (no se persiste el fallo); telemetria qinc se mantiene
        qinc("host_down:" .. h)
    end
end

local elapsed_ms = math.floor(((ngx.now() - t0) * 1000) + 0.5)

if not res_ok then
    qinc("all_failed")
    -- E7 · intento fallido CON fetch: su tiempo no contamina provider_fetch_ms
    -- (ese percentil es de decisiones exitosas), pero sí se cuenta el intento.
    ngx.ctx.ape_dec = {
        outcome = "fail", status = (last_status and last_status >= 400) and last_status or 502,
        ms = elapsed_ms, hops = (last_meta and last_meta.n) or 0,
        exhausted = (last_meta and last_meta.exhausted) or false,
        hop1_ms = last_meta and last_meta.first_ms,
        hoplast_ms = last_meta and last_meta.last_ms,
        attempts = tried, kind = "unknown",
    }
    ngx.status = (last_status and last_status >= 400) and last_status or 502
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ ok = false, error = "all_upstreams_failed",
        tried = candidates, reason = last_reason, path = path, ms = elapsed_ms }))
    return
end

-- ── cuerpo ───────────────────────────────────────────────────────────────
local body  = res_ok.body or ""
local ctype = res_ok.header["Content-Type"] or "application/vnd.apple.mpegurl"

if lib.is_too_big(#body) then
    qinc("too_large")
    -- E7 · intento fallido (playlist por encima del tope del plano)
    ngx.ctx.ape_dec = { outcome = "too_large", status = 502, ms = elapsed_ms,
        hops = (last_meta and last_meta.n) or 0, attempts = tried, kind = "unknown" }
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

-- UHD: 4K siempre; 4K real -> 8K declarado. CODECS intacto.
local uhd_mode, uhd_n = nil, 0
local is_master = lib.is_master(rebased)      -- E7 · se calcula una vez y se reusa
local uhd_blocked = false                     -- E7 · GOLDEN RULE ⇒ no se declara
if is_master then
    if uhd.codec_truth_fields(rebased) > 0 then
        ngx.log(ngx.WARN, "[ape-gw] hev1 en CODECS: GOLDEN RULE, UHD omitido")
        uhd_blocked = true
    elseif flag("uhd8k", false) then
        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
            add_pq = flag("uhd_pq", false), only_top = true })
        if uhd_n > 0 then uhd_mode = "8k" end
    elseif flag("uhd_auto", true) then
        local m
        rebased, uhd_n, m = uhd.declare_auto(rebased, { add_pq = flag("uhd_pq", false) })
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

-- ── respuesta ────────────────────────────────────────────────────────────
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

-- ── E7 · decisión observable (la registra ape_obs_rec.lua en fase log) ────
-- Solo se deja una tabla en memoria: CERO escrituras de dict, cero I/O, cero
-- logs. El cliente ya tiene su respuesta: el `log_by_lua` corre después.
ngx.ctx.ape_dec = {
    outcome    = "ok",
    ms         = elapsed_ms,
    hops       = (last_meta and last_meta.n) or 0,
    exhausted  = false,
    hop1_ms    = last_meta and last_meta.first_ms,
    hoplast_ms = last_meta and last_meta.last_ms,
    attempts   = tried,
    kind       = is_master and "master" or "media",
    uhd        = uhd_blocked and "blocked" or (uhd_mode or "off"),
    uhd_n      = uhd_n,
    uris       = n_uri,
    attrs      = n_attr,
    size       = #rebased,
}

ngx.print(rebased)

-- ── QoE ──────────────────────────────────────────────────────────────────
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
