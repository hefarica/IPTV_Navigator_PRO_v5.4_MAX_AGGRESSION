-- ═══════════════════════════════════════════════════════════════════════════
-- APE LAB API — expone el puente LAB (solo loopback: /_ape/lab)
-- ═══════════════════════════════════════════════════════════════════════════
local cjson  = require "cjson.safe"
local bridge = require "ape_lab_bridge"

local d = bridge.get()
local list_id = ngx.var.arg_list_id

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- Biblioteca dinámica por lista: _lab_meta/<list_id>.json (sin valores fijos).
if list_id and list_id:match("^[a-f0-9][a-f0-9]+$") and #list_id == 16 then
    local f = io.open("/dev/shm/ape_canon/_lab_meta/" .. list_id .. ".json", "rb")
    if not f then
        ngx.status = 404
        ngx.say(cjson.encode({ok=false, error="metadata_not_found", list_id=list_id}))
        return
    end
    local body = f:read("*a")
    f:close()
    local obj = cjson.decode(body)
    if not obj then
        ngx.status = 500
        ngx.say(cjson.encode({ok=false, error="metadata_invalid"}))
        return
    end
    ngx.say(cjson.encode({ok=true, list_id=list_id, profile=obj.profile, fields=obj.fields}))
    return
end

ngx.say(cjson.encode({
    ok             = d.ok,
    source         = d.source,
    lab_generated  = d.generated_ts,
    floor_locked   = d.floor_lock_enabled,
    passthrough    = d.passthrough_when_unreachable,
    floors_bps     = d.floors,
    headers        = d.headers,
    tcp            = d.tcp,
    telemetry      = d.telemetry,
    profiles       = d.profiles,
    missing        = d.missing,
}))
