-- ═══════════════════════════════════════════════════════════════════════════
-- APE LAB UPLOAD — POST /ape/lab-upload  (publica la DNA del Excel en el VPS)
-- ═══════════════════════════════════════════════════════════════════════════
-- Qué hace: recibe el JSON `LAB_CALIBRATED_*.json` (el que exporta el Excel),
-- lo valida y lo escribe de forma ATÓMICA en la ruta que lee el plano:
--
--   /var/www/html/prisma/config/lab_master_22.6.0.json
--
-- e invalida la cache del puente LAB → el plano lo relee en la siguiente
-- petición (≤60 s por TTL, o inmediato tras el flush).
--
-- Seguridad:
--   * solo POST (405 en otro método)
--   * exige cabecera X-APE-Token == contenido de /etc/nginx/ape-lab-upload.token
--     (comparación de longitud constante para no filtrar por tiempo)
--   * tope de cuerpo 2 MB (la DNA real son ~280 KB)
--   * valida esquema mínimo: profiles_calibrated (tabla) y lab_version omega_*
--     o bulletproof:true — el mismo gate que usa la APP
--   * escritura tmp + rename (nunca deja el archivo a medias)
-- ═══════════════════════════════════════════════════════════════════════════
local cjson = require "cjson.safe"

local TOKEN_FILE = "/etc/nginx/ape-lab-upload.token"
local DEST       = "/var/www/html/prisma/config/lab_master_22.6.0.json"
local TMP        = DEST .. ".upload.tmp"
local MAX_BYTES  = 2 * 1024 * 1024

local function out(status, tbl)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.say(cjson.encode(tbl))
    return
end

if ngx.req.get_method() ~= "POST" then
    return out(405, { ok = false, error = "method_not_allowed", hint = "usa POST" })
end

-- token
local tf = io.open(TOKEN_FILE, "r")
if not tf then
    return out(500, { ok = false, error = "token_file_missing", path = TOKEN_FILE })
end
local expected = (tf:read("*a") or ""):gsub("%s+$", "")
tf:close()

local got = ngx.var.http_x_ape_token or ""
local ok_len = (#got == #expected)
local diff = 0
for i = 1, math.max(#got, #expected) do
    local a = got:byte(i) or 0
    local b = expected:byte(i) or 0
    if a ~= b then diff = diff + 1 end
end
if not (ok_len and diff == 0) or expected == "" then
    ngx.log(ngx.WARN, "[ape-lab-upload] token invalido desde ", ngx.var.remote_addr)
    return out(403, { ok = false, error = "forbidden" })
end

-- cuerpo
ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body then
    local bf = ngx.req.get_body_file()
    if bf then
        local f = io.open(bf, "r")
        if f then body = f:read("*a"); f:close() end
    end
end
if not body or body == "" then
    return out(400, { ok = false, error = "empty_body" })
end
if #body > MAX_BYTES then
    return out(413, { ok = false, error = "too_large", bytes = #body, max = MAX_BYTES })
end

-- validación de esquema (mismo criterio que la APP)
local dok, data = pcall(cjson.decode, body)
if not dok or type(data) ~= "table" then
    return out(400, { ok = false, error = "invalid_json" })
end
if type(data.profiles_calibrated) ~= "table" then
    return out(422, { ok = false, error = "missing_profiles_calibrated" })
end
local ver = tostring(data.lab_version or "")
local is_omega = ver:match("^omega_") ~= nil
if not (is_omega or data.bulletproof == true) then
    return out(422, { ok = false, error = "unsupported_schema", lab_version = ver })
end

-- escritura atómica
local w = io.open(TMP, "w")
if not w then
    return out(500, { ok = false, error = "cannot_open_tmp", path = TMP })
end
local wrote = w:write(body)
w:close()
if not wrote then
    os.remove(TMP)
    return out(500, { ok = false, error = "write_failed" })
end
local ren_ok, ren_err = os.rename(TMP, DEST)
if not ren_ok then
    os.remove(TMP)
    return out(500, { ok = false, error = "rename_failed", detail = tostring(ren_err) })
end

-- invalidar cache del puente
local dict = ngx.shared.lab_config
if dict then
    dict:delete("ape_lab_bridge_v1")
    dict:delete("ape_lab_bridge_v2")
end

ngx.log(ngx.NOTICE, "[ape-lab-upload] DNA actualizada: ", #body, " bytes, version=", ver)
return out(200, {
    ok = true,
    bytes = #body,
    lab_version = ver,
    exported_at = data.exported_at,
    bulletproof = data.bulletproof,
    dest = DEST,
    cache = "invalidada",
})
