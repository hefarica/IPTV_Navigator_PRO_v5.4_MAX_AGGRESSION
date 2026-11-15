-- ============================================================================
-- ape_profile_resolver_science_safe.lua  (ADDITIVE; REUSES the live resolver)
-- APE Visual Extreme — Science-Safe profile resolution.
--
-- DOES NOT overwrite the live `ape_profile_resolver.lua` (OMEGA-NO-DELETE).
-- It REUSES it 100% for the stream_id->profile step, and only ADDS two layers:
--   1. X-APE-Profile header           (player that forwards it)
--   2. ?profile= query arg
--   3. live `ape_profile_resolver.resolve(uri)`   <-- REUSED, not duplicated
--   4. /dev/shm/ape_devstate_<ip>.json  (device_state)
--   5. default 'P2'  (safe BYPASS, = current behavior)
--
-- All file/JSON access is pcall/io guarded; any failure falls through to P2.
-- Never touches URLs, never mutates the manifest, never blocks (autopista).
-- ============================================================================
local M = {}

local function safe_upper(x)
    x = tostring(x or ''):upper()
    if x:match('^P[0-5]$') then return x end
    return nil
end
M.safe_upper = safe_upper

-- device_state written by the OMEGA loop (Phase A): /dev/shm/ape_devstate_<ip>.json
function M.profile_from_devstate(remote_addr)
    local ip = tostring(remote_addr or ''):gsub('[^0-9A-Fa-f:.]', '')
    if ip == '' then return nil end
    local f = io.open('/dev/shm/ape_devstate_' .. ip .. '.json', 'rb')
    if not f then return nil end
    local txt = f:read('*a'); f:close()
    local ok_cjson, cjson = pcall(require, 'cjson.safe')
    if not ok_cjson or not cjson then return nil end
    local obj = cjson.decode(txt)
    if type(obj) ~= 'table' then return nil end
    return safe_upper(obj.profile or obj.visual_profile or obj.ape_profile)
end

-- ctx = { header_profile, arg_profile, uri, remote_addr }
-- returns profile (P0-P5), source string. Never errors, never returns nil.
function M.resolve(ctx)
    ctx = ctx or {}

    -- 1 + 2: explicit profile wins (additive; never overridden below)
    local p = safe_upper(ctx.header_profile) or safe_upper(ctx.arg_profile)
    if p then return p, 'header_or_arg' end

    -- 3: REUSE the live stream_id resolver (ape_profile_map.json by_streamid)
    local ok_mod, base = pcall(require, 'ape_profile_resolver')
    if ok_mod and type(base) == 'table' and type(base.resolve) == 'function' then
        local ok_call, pr = pcall(base.resolve, ctx.uri)
        if ok_call then
            local sp = safe_upper(pr)
            if sp then return sp, 'stream_id_map(live)' end
        end
    end

    -- 4: device_state by IP
    local pd = M.profile_from_devstate(ctx.remote_addr)
    if pd then return pd, 'devstate' end

    -- 5: safe default
    return 'P2', 'default'
end

return M
