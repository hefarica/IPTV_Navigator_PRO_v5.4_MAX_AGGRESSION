-- ═══════════════════════════════════════════════════════════════════════════
-- APE HEADER HANDLER (fase header_filter) — composición única
-- ═══════════════════════════════════════════════════════════════════════════
-- nginx admite UNA sola directiva *_by_lua por fase en un location, así que
-- aquí se componen las responsabilidades de cabeceras del plano:
--
--   1. Quitar Content-Length: el body_filter reescribe el cuerpo y cambia el
--      tamaño. Si se deja el del upstream, nginx TRUNCA la respuesta (bug real
--      medido: Content-Length: 203 con cuerpo reescrito más largo).
--   2. Ejecutar el observador sentinel_auth_guard (passthrough: cuenta 401/403/
--      5xx, expone X-APE-Sentinel, nunca bloquea, nunca ngx.exit).
--   3. [VÍA B] Capturar el FUSIBLE EN CALIENTE `X-APE-Fuse` y resolver el
--      SUELO (fuse_bps) que el body_filter aplicará al manifiesto.
--
-- Se usa `dofile` sobre el archivo original para NO duplicar las 173 líneas del
-- sentinel: una sola fuente de verdad. Coste: compilar ~173 líneas por petición
-- de playlist (decenas de µs), irrelevante frente a la latencia de red.
-- Todo bajo pcall: un fallo del sentinel NUNCA afecta la reproducción.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) el cuerpo cambia de tamaño → el Content-Length del upstream ya no vale
ngx.header["Content-Length"] = nil
ngx.header["X-APE-Meta-Mode"] = "rebase-only"

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) VÍA B — FUSIBLE EN CALIENTE (`X-APE-Fuse`)
-- ───────────────────────────────────────────────────────────────────────────
-- El fusible NO inventa calidad ni toca códecs: sólo reescribe el SUELO
-- declarado (adaptive-minbitrate / min_bandwidth) al valor del perfil activo,
-- para que el próximo reload del HLS arranque con un piso alcanzable. El
-- rewrite real vive en ape_uri_rebase.lua (body_filter), sobre el cuerpo ya
-- buffereado al eof; aquí sólo se CAPTURA la intención y se resuelve el suelo.
--
-- Contrato de estado:
--   * `ngx.ctx.ape_fuse`        = true/false  ← intención de ESTA petición.
--   * `ngx.ctx.ape_fuse_bps`    = número      ← suelo a aplicar (sólo si resolvió).
--   * `ngx.ctx.ape_fuse_profile`= "P0".."P5"  ← perfil que lo justificó.
--   * `ape_flags["fuse:<ip>:<host>"]` = "1"/"0" con TTL ← estado OBSERVABLE.
--
-- DECISIÓN DELIBERADA (criterio "sin cabecera ⇒ byte-idéntico"): el estado
-- persistido en ape_flags es SOLO observabilidad, NO entrada de control. La
-- fusión se decide exclusivamente por la cabecera de la petición actual. Si el
-- estado persistido gobernara el rewrite, una petición POSTERIOR sin cabecera
-- heredaría la fusión durante 300 s y rompería el fallback total exigido.
--
-- Sin cabecera el coste añadido es: 2 lecturas de $http_* + 1 set en shared
-- dict (sub-µs). No se toca el cuerpo ni se añaden cabeceras de respuesta.
-- ═══════════════════════════════════════════════════════════════════════════

local FUSE_DEFAULT_TTL = 300          -- segundos (contrato)
local FUSE_TTL_MIN, FUSE_TTL_MAX = 1, 86400

-- Suelo por perfil (bps). Tabla del contrato; se construye dentro de la función
-- para no asignar en cada petición. Perfil desconocido ⇒ nil (no se inventa).
local function fuse_floor_bps(profile)
    local tbl = {
        P0 = 18000000,   -- 18.0 Mbps
        P1 = 10000000,   -- 10.0 Mbps
        P2 = 10000000,   -- 10.0 Mbps
        P3 = 3500000,    --  3.5 Mbps
        P4 = 1400000,    --  1.4 Mbps
        P5 = 700000,     --  0.7 Mbps
    }
    if type(profile) ~= "string" then return nil end
    return tbl[profile:upper()]
end

-- Normaliza "p1"/"P1 "/"x" → "P1" o nil. Nunca inventa un perfil.
local function norm_profile(p)
    if type(p) ~= "string" then return nil end
    local u = p:upper()
    if u:match("^P[0-5]$") then return u end
    return nil
end

-- TTL de la cabecera opcional `X-APE-Fuse-TTL`, acotado y con default seguro.
local function fuse_ttl()
    local raw = ngx.var.http_x_ape_fuse_ttl
    local n = tonumber(raw)
    if not n or n ~= n then return FUSE_DEFAULT_TTL end   -- nil o NaN
    n = math.floor(n)
    if n < FUSE_TTL_MIN then return FUSE_TTL_MIN end
    if n > FUSE_TTL_MAX then return FUSE_TTL_MAX end
    return n
end

-- Perfil: explícito (cabecera → query) y, si no hay, resolución server-side por
-- identidad de canal (ape_profile_resolver: players que no reenvían perfiles).
-- Se invoca SÓLO con el fusible encendido: el camino por defecto no paga I/O.
local function resolve_profile(lua_dir)
    local p = norm_profile(ngx.var.http_x_ape_profile)
    if p then return p end
    p = norm_profile(ngx.var.arg_profile)
    if p then return p end
    p = norm_profile(ngx.var.arg_p)
    if p then return p end

    local ok_m, mod = pcall(dofile, lua_dir .. "ape_profile_resolver.lua")
    if ok_m and type(mod) == "table" and type(mod.resolve) == "function" then
        local ok_r, rv = pcall(mod.resolve, ngx.var.uri)
        if ok_r then return norm_profile(rv) end
    end
    return nil
end

local fuse_ok, fuse_err = pcall(function()
    ngx.ctx.ape_fuse = false            -- boolean siempre, nunca nil

    local h = ngx.var.http_x_ape_fuse
    local on = (h == "1" or h == "true")
    ngx.ctx.ape_fuse = on

    -- Directorio de Lua (remapeable por sed en los tests aislados).
    local dir = ngx.var.ape_lua_dir or "/etc/nginx/lua/"
    if dir:sub(-1) ~= "/" then dir = dir .. "/" end

    if on then
        local profile = resolve_profile(dir)
        local bps = fuse_floor_bps(profile)
        if bps then
            ngx.ctx.ape_fuse_bps = bps
            ngx.ctx.ape_fuse_profile = profile
            -- Sólo con el fusible activo se añade cabecera de respuesta (el
            -- camino por defecto queda byte-idéntico también en cabeceras).
            ngx.header["X-APE-Fuse"] = profile .. ":" .. tostring(bps)
        else
            -- No se inventa un suelo: cuerpo intacto.
            ngx.log(ngx.WARN, "[ape-header] fuse ON sin perfil resoluble (profile=",
                    tostring(profile), "): cuerpo intacto")
        end
    end

    -- Estado observable por dispositivo + host (TTL del contrato).
    local dict = ngx.shared.ape_flags
    if dict then
        local ip = ngx.var.remote_addr or "-"
        local host = ngx.var.ape_host or ngx.var.host or "-"
        dict:set("fuse:" .. ip .. ":" .. host, on and "1" or "0", fuse_ttl())
    end
end)

if not fuse_ok then
    -- Passthrough: sin fusible, el body_filter deja el cuerpo intacto.
    ngx.ctx.ape_fuse = false
    ngx.ctx.ape_fuse_bps = nil
    ngx.log(ngx.WARN, "[ape-header] fuse non-fatal: ", tostring(fuse_err))
end

-- 3) observador passthrough (nunca bloquea)
-- El directorio de Lua se toma de una variable nginx para poder remapearlo en los
-- tests aislados (sed sobre el conf) sin tocar este archivo.
local dir = ngx.var.ape_lua_dir or "/etc/nginx/lua/"
if dir:sub(-1) ~= "/" then dir = dir .. "/" end
local ok, err = pcall(dofile, dir .. "sentinel_auth_guard.lua")
if not ok then
    ngx.log(ngx.WARN, "[ape-header] sentinel non-fatal: ", tostring(err))
end
