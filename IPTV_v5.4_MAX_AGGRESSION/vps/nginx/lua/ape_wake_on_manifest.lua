-- ══════════════════════════════════════════════════════════════════════════
-- APE — Wake-on-Manifest  (log_by_lua, AUTOPISTA-SAFE)
-- Cuando el player pide el .m3u8(.gz) AL VPS, encola una señal de "wake" para que
-- el worker despierte el daemon on-device en ms. Corre en log phase (DESPUÉS de
-- enviar la respuesta) → CERO impacto en TTFB/reproducción. Nunca ngx.exit, nunca
-- bloquea, nunca falla la request (todo bajo pcall). NO toca el cuerpo ni la URL.
--
-- Activación (en el location del .m3u8):
--    log_by_lua_file /etc/nginx/lua/ape_wake_on_manifest.lua;
-- ══════════════════════════════════════════════════════════════════════════
local ok, err = pcall(function()
    local uri = ngx.var.uri or ""
    -- Solo playlists (master/media). Ignora segmentos y todo lo demás.
    if not (uri:find("%.m3u8$") or uri:find("%.m3u8%.gz$") or uri:find("%.m3u$")) then
        return
    end

    -- ID de device/lista/canal desde query o cabecera (sin parsear cuerpo).
    -- El anchor del .m3u8 puede llevar ?ape_wake=<deviceId>&ape_ch=<channelId>.
    local dev = ngx.var.arg_ape_wake or ngx.var.http_x_ape_wake or ""
    local ch  = ngx.var.arg_ape_ch  or ""
    local cip = ngx.var.remote_addr or "?"
    -- list id = basename del .m3u8 (para correlación), sin extensión
    local list = uri:match("([^/]+)%.m3u8") or uri:match("([^/]+)%.m3u") or "list"

    -- Si no hay device id explícito, usa la IP del cliente como pista (el worker resuelve).
    if dev == "" then dev = cip end

    -- Cola en /dev/shm (append, post-respuesta). Línea: ts<TAB>dev<TAB>ch<TAB>list<TAB>cip
    local line = string.format("%d\t%s\t%s\t%s\t%s\n",
        ngx.time(), dev, ch, list, cip)
    local f = io.open("/dev/shm/ape_wake_queue", "a")
    if f then
        f:write(line)
        f:close()
    end
end)
-- log phase: si algo falla, solo lo registramos; NUNCA afecta la respuesta ya enviada.
if not ok then
    ngx.log(ngx.WARN, "[ape_wake] non-fatal: ", tostring(err))
end
