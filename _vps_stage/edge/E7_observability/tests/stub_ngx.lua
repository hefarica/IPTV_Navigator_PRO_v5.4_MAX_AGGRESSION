-- ═════════════════════════════════════════════════════════════════════════════
-- STUB de `ngx` para ejercitar ape_obs_metrics.lua FUERA de nginx (Lua 5.1).
-- ═════════════════════════════════════════════════════════════════════════════
-- Implementa SOLO lo que usa la librería, con la semántica real de
-- lua-nginx-module:
--   ngx.shared.<dict>:get(k) / set(k,v[,ttl]) / incr(k,v[,init[,init_ttl]]) /
--   expire(k,ttl) / delete(k) / get_keys(max)
--   ngx.now(), ngx.time(), ngx.log(level, ...), ngx.WARN
--
-- `STUB_INCR_NO_TTL = true` simula un lua-nginx viejo sin `init_ttl` para probar
-- la ruta de degradación incr+expire.
-- ═════════════════════════════════════════════════════════════════════════════

local STUB = { dicts = {}, now = 0, logs = {} }

local function new_dict()
    local d = { data = {}, exp = {} }
    function d:get(k)
        if self.exp[k] and self.exp[k] <= STUB.now then
            self.data[k] = nil; self.exp[k] = nil
            return nil
        end
        return self.data[k]
    end
    function d:set(k, v, ttl)
        self.data[k] = v
        if ttl then self.exp[k] = STUB.now + ttl end
        return true
    end
    function d:incr(k, v, init, init_ttl)
        if init_ttl ~= nil and STUB.incr_no_ttl then
            error("bad argument #4 to 'incr' (init_ttl not supported)", 2)
        end
        local cur = self:get(k)
        if cur == nil then
            if init == nil then return nil, "not found" end
            cur = init
            if init_ttl then self.exp[k] = STUB.now + init_ttl end
        end
        cur = cur + v
        self.data[k] = cur
        return cur
    end
    function d:expire(k, ttl)
        if self.data[k] == nil then return nil, "not found" end
        if ttl == nil then self.exp[k] = nil else self.exp[k] = STUB.now + ttl end
        return true
    end
    function d:delete(k) self.data[k] = nil; self.exp[k] = nil; return true end
    function d:get_keys(max)
        local out, n = {}, 0
        for k in pairs(self.data) do
            n = n + 1
            if max and n > max then break end
            out[#out + 1] = k
        end
        return out
    end
    return d
end

STUB.dicts["ape_qoe"] = new_dict()

ngx = {
    WARN = 4, ERR = 3, INFO = 1,
    shared = {},
    now = function() return STUB.now end,
    time = function() return math.floor(STUB.now) end,
    log = function(level, ...)
        local parts = {}
        for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
        STUB.logs[#STUB.logs + 1] = table.concat(parts)
    end,
}
-- `ngx.shared` es un proxy: cada nombre crea (o reutiliza) su dict
setmetatable(ngx.shared, { __index = function(_, name)
    STUB.dicts[name] = STUB.dicts[name] or new_dict()
    return STUB.dicts[name]
end })

-- Sin `return` a nivel de chunk: este archivo se CONCATENA antes de la librería
-- y del test (scripts/selftest_lua.sh). Se expone por global.
_G.__STUB = STUB
