-- ═══════════════════════════════════════════════════════════════════════════
-- APE HEADER HANDLER (fase header_filter) — composición única
-- ═══════════════════════════════════════════════════════════════════════════
-- nginx admite UNA sola directiva *_by_lua por fase en un location, así que
-- aquí se componen las dos responsabilidades de cabeceras del plano:
--
--   1. Quitar Content-Length: el body_filter reescribe el cuerpo y cambia el
--      tamaño. Si se deja el del upstream, nginx TRUNCA la respuesta (bug real
--      medido: Content-Length: 203 con cuerpo reescrito más largo).
--   2. Ejecutar el observador sentinel_auth_guard (passthrough: cuenta 401/403/
--      5xx, expone X-APE-Sentinel, nunca bloquea, nunca ngx.exit).
--
-- Se usa `dofile` sobre el archivo original para NO duplicar las 173 líneas del
-- sentinel: una sola fuente de verdad. Coste: compilar ~173 líneas por petición
-- de playlist (decenas de µs), irrelevante frente a la latencia de red.
-- Todo bajo pcall: un fallo del sentinel NUNCA afecta la reproducción.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) el cuerpo cambia de tamaño → el Content-Length del upstream ya no vale
ngx.header["Content-Length"] = nil
ngx.header["X-APE-Meta-Mode"] = "rebase-only"

-- 2) observador passthrough (nunca bloquea)
-- El directorio de Lua se toma de una variable nginx para poder remapearlo en los
-- tests aislados (sed sobre el conf) sin tocar este archivo.
local dir = ngx.var.ape_lua_dir or "/etc/nginx/lua/"
if dir:sub(-1) ~= "/" then dir = dir .. "/" end
local ok, err = pcall(dofile, dir .. "sentinel_auth_guard.lua")
if not ok then
    ngx.log(ngx.WARN, "[ape-header] sentinel non-fatal: ", tostring(err))
end
