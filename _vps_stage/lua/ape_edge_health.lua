-- ═══════════════════════════════════════════════════════════════════════════
-- APE EDGE HEALTH — endpoint de salud del motor cache-first
-- Fase: content_by_lua_file  (location = /ape/health, solo 127.0.0.1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Responde JSON con lo que un watchdog necesita para decidir sin adivinar:
--   · ok           → el worker de Lua está vivo y puede escribir en su dict
--   · nginx        → versión real del binario
--   · uptime_s     → segundos desde el primer arranque observado
--   · prefetch     → pf_fired / pf_skipped / pf_done (efecto del prefetch)
--
-- CERO DEPENDENCIAS EXTERNAS: el JSON se construye a mano. `require("cjson.safe")`
-- NO es portable —el paquete ngx_http_lua de Ubuntu no lo trae— y un endpoint de
-- salud que devuelve 500 por un `require` es peor que no tenerlo. Aquí no hay
-- require, ni I/O, ni red: solo memoria compartida.
--
-- AUTOPISTA: este endpoint NO está en la ruta de reproducción. Responde en
-- microsegundos. Cero disco, cero upstream.
-- ═══════════════════════════════════════════════════════════════════════════

local dict = ngx.shared.ape_fanout

local function num(key)
    if not dict then return 0 end
    return math.floor(tonumber(dict:get(key)) or 0)
end

-- Escapa lo mínimo imprescindible para un JSON válido
local function jstr(v)
    local s = tostring(v == nil and "" or v)
    s = s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('[\r\n\t]', ' ')
    return '"' .. s .. '"'
end

local now = ngx.now()
local boot = dict and dict:get("boot_ts")
if not boot then
    boot = now
    if dict then dict:set("boot_ts", now) end
end
local uptime = math.floor(now - (tonumber(boot) or now))
if uptime < 0 then uptime = 0 end

local ok_worker, wpid = pcall(ngx.worker.pid)
if not ok_worker then wpid = 0 end

local out = '{"status":"ok","ok":true'
    .. ',"nginx":' .. jstr(ngx.var.nginx_version)
    .. ',"pid":' .. jstr(ngx.var.pid)
    .. ',"worker":' .. jstr(wpid)
    .. ',"uptime_s":' .. uptime
    .. ',"prefetch":{"fired":' .. num("pf_fired")
    .. ',"skipped":' .. num("pf_skip")
    .. ',"done":' .. num("pf_done") .. '}'
    .. ',"cache":{"segments_zone":"ape_seg","manifest_zone":"ape_man","root":"/dev/shm"}'
    .. ',"ts":' .. math.floor(ngx.time())
    .. '}'

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.print(out)
