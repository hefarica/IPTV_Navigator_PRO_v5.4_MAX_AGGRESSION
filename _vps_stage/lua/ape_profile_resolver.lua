-- ═══════════════════════════════════════════════════════════════════════
-- APE LAB UHDX — Profile Resolver (Sol 1: profile ARBITRARIO por identidad de canal)
-- PURE-ish module (solo io.open + ngx.shared cache, nil-safe). Determinista, unit-testable.
--
-- ROL: resuelve el perfil P0-P5 SERVER-SIDE por la IDENTIDAD del canal (stream_id de la URI Xtream
-- `/live/USER/PASS/<STREAMID>.m3u8`), para players que NO reenvían `X-APE-Profile` (OkHttp/ExoPlayer:
-- OTT Navigator/TiviMate/Smarters). Es el mecanismo de ESCALACIÓN DE FLOOR POR CANAL.
--
-- VERDAD VERIFICADA (2026-06-17): los 6 perfiles fuerzan virtual_4k+PQ+codec POR IGUAL; la ÚNICA
-- diferencia REAL es `floor_lock` (ACTIVE solo en P0/P1 → descarta variantes bajas → fuerza la alta).
-- Por eso el default es P2 (BYPASS, seguro) y `by_streamid` escala SOLO canales con evidencia QoE de
-- bitrate sostenido (escritos por ape_floor_escalation.php). El adaptive-floor relaja si la red no sostiene.
--
-- INVARIANTES (no negociables):
--   * Solo se invoca cuando el cliente NO trajo un perfil válido (es un FALLBACK aditivo) → nunca
--     pisa un ?profile=/X-APE-Profile explícito.
--   * Devuelve "P0".."P5" o nil. Si nil → el caller mantiene su default P2 (= comportamiento de hoy).
--   * nil-safe + cache por worker (reusa ngx.shared.lab_config). Sin map/sin default → nil.
-- ═══════════════════════════════════════════════════════════════════════

local M = {}

M.MAP_PATH  = "/etc/nginx/lua/ape_profile_map.json"  -- { "default":"P3", "by_streamid":{ "1":"P3", ... } }
M.CACHE_TTL = 60

-- Carga el map (cacheado por worker en el shared dict ya declarado lab_config).
local function load_map()
    local cache = ngx.shared and ngx.shared.lab_config or nil
    if cache then
        local cached = cache:get("ape_profile_map")
        if cached then
            local ok, m = pcall(function() return require("cjson").decode(cached) end)
            if ok and type(m) == "table" then return m end
            if cached == "__none__" then return nil end  -- negative cache (sin archivo)
        end
    end
    local f = io.open(M.MAP_PATH, "r")
    if not f then
        if cache then cache:set("ape_profile_map", "__none__", M.CACHE_TTL) end
        return nil
    end
    local content = f:read("*a"); f:close()
    if not content or content == "" then
        if cache then cache:set("ape_profile_map", "__none__", M.CACHE_TTL) end
        return nil
    end
    if cache then cache:set("ape_profile_map", content, M.CACHE_TTL) end
    local ok, m = pcall(function() return require("cjson").decode(content) end)
    if ok and type(m) == "table" then return m end
    return nil
end

-- Extrae el stream_id de una URI Xtream (último número antes de .m3u8/.ts, o último segmento numérico).
-- Acepta /live/USER/PASS/1.m3u8, /USER/PASS/1.m3u8, .../1.ts, .../1/  → "1". Si no hay → nil.
function M.streamid_from_uri(uri)
    if type(uri) ~= "string" then return nil end
    return uri:match("/(%d+)%.m3u8")
        or uri:match("/(%d+)%.ts")
        or uri:match("/(%d+)/?$")
        or nil
end

-- resolve_from_map(uri, m): parte PURA (sin io/cjson, unit-testable). Perfil P0-P5 desde el map
-- (by_streamid del stream_id → default) o nil. Valida que el resultado sea un perfil legal.
function M.resolve_from_map(uri, m)
    if type(m) ~= "table" then return nil end
    local sid = M.streamid_from_uri(uri)
    if sid and type(m.by_streamid) == "table" and m.by_streamid[sid] then
        local p = tostring(m.by_streamid[sid]):upper()
        if p:match("^P[0-5]$") then return p end
    end
    if m.default then
        local d = tostring(m.default):upper()
        if d:match("^P[0-5]$") then return d end
    end
    return nil
end

-- resolve(uri): carga el map (io+cjson, cacheado) y resuelve. Devuelve P0-P5 o nil.
function M.resolve(uri)
    return M.resolve_from_map(uri, load_map())
end

return M
