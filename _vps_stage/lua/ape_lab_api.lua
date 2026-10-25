-- ═══════════════════════════════════════════════════════════════════════════
-- APE LAB API — expone el puente LAB (solo loopback: /_ape/lab)
-- ═══════════════════════════════════════════════════════════════════════════
local cjson  = require "cjson.safe"
local bridge = require "ape_lab_bridge"

local d = bridge.get()

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"

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
