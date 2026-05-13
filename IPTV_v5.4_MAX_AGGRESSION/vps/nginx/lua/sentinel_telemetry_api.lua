-- APE SENTINEL v1.0 — Telemetry API (Lua)
-- Endpoint: /prisma/api/sentinel-status
-- Returns real-time sentinel state as JSON (<1ms response)
-- PASSTHROUGH: content_by_lua_file, no blocking, no interference

local ok, result = pcall(function()

local reactor = ngx.shared.circuit_metrics
if not reactor then
    ngx.status = 503
    ngx.say('{"error":"no shared dict"}')
    return
end

local cjson = (function() local ok,m = pcall(require,"cjson.safe"); if ok then return m end; return require("cjson") end)()
local now = ngx.now()

-- ═══ GLOBAL METRICS ═════════════════════════════════════════════════
local total_requests  = tonumber(reactor:get("sentinel_total_requests")) or 0
local total_auth_fail = tonumber(reactor:get("sentinel_total_auth_fail")) or 0
local last_fail_ts    = tonumber(reactor:get("sentinel_last_fail_ts")) or 0
local last_fail_prov  = reactor:get("sentinel_last_fail_provider") or "none"
local last_fail_st    = tonumber(reactor:get("sentinel_last_fail_status")) or 0
local hot_provider    = reactor:get("sentinel_hot_provider") or "none"
local hot_since       = tonumber(reactor:get("sentinel_hot_since")) or 0
local sentinel_ts     = tonumber(reactor:get("sentinel_ts")) or 0

-- ═══ PER-PROVIDER METRICS ═══════════════════════════════════════════
-- We track known providers from the config
local lab_ok, lab = pcall(require, "lab_config")
local provider_list = {}
if lab_ok then
    local s_ok, sentinel_cfg = pcall(function() return lab.sentinel_providers() end)
    if s_ok and sentinel_cfg and sentinel_cfg.providers then
        for prov, _ in pairs(sentinel_cfg.providers) do
            if prov ~= "_default" then
                provider_list[#provider_list + 1] = prov
            end
        end
    end
end

-- Also add the hot provider if not already listed
if hot_provider ~= "none" then
    local found = false
    for _, p in ipairs(provider_list) do
        if p == hot_provider then found = true; break end
    end
    if not found then
        provider_list[#provider_list + 1] = hot_provider
    end
end

-- Build per-provider JSON
local providers_json = {}
for _, prov in ipairs(provider_list) do
    local err_count = tonumber(reactor:get("sentinel_err_" .. prov)) or 0
    local ok_count  = tonumber(reactor:get("sentinel_ok_" .. prov)) or 0
    local srv_count = tonumber(reactor:get("sentinel_5xx_" .. prov)) or 0
    local ua_idx    = tonumber(reactor:get("sentinel_ua_idx_" .. prov)) or 0
    local next_ua   = reactor:get("sentinel_next_ua_" .. prov) or "default"
    
    local success_rate = 0
    local total_prov = err_count + ok_count
    if total_prov > 0 then
        success_rate = math.floor((ok_count / total_prov) * 100)
    end
    
    providers_json[#providers_json + 1] = string.format(
        '"%s":{"errors_60s":%d,"ok_60s":%d,"5xx_60s":%d,"success_rate_pct":%d,"ua_rotation_idx":%d,"current_ua":"%s","is_hot":%s}',
        prov, err_count, ok_count, srv_count, success_rate, ua_idx,
        next_ua:gsub('"', '\\"'),
        (prov == hot_provider) and "true" or "false"
    )
end

-- ═══ FLOOR-LOCK METRICS ═════════════════════════════════════════════
local fl_profile     = reactor:get("fl_profile") or "none"
local fl_floor_bps   = tonumber(reactor:get("fl_floor_bps")) or 0
local fl_removed     = tonumber(reactor:get("fl_removed")) or 0
local fl_kept        = tonumber(reactor:get("fl_kept")) or 0
local fl_highest_bw  = tonumber(reactor:get("fl_highest_bw")) or 0
local fl_total_filt  = tonumber(reactor:get("fl_total_filtered")) or 0
local fl_total_pass  = tonumber(reactor:get("fl_total_passed")) or 0
local fl_ts          = tonumber(reactor:get("fl_ts")) or 0

-- ═══ AUTH SUCCESS RATE ══════════════════════════════════════════════
local auth_success_pct = 100
if total_requests > 0 then
    auth_success_pct = math.floor(((total_requests - total_auth_fail) / total_requests) * 100)
end

-- ═══ ASSEMBLE RESPONSE ═════════════════════════════════════════════
ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-cache"
ngx.header["X-Sentinel-Version"] = "1.0"

ngx.say(string.format([[{
  "ts": %.3f,
  "source": "sentinel_v1.0",
  "global": {
    "total_requests_5min": %d,
    "total_auth_fail_5min": %d,
    "auth_success_pct": %d,
    "last_fail_ts": %.3f,
    "last_fail_provider": "%s",
    "last_fail_status": %d,
    "hot_provider": "%s",
    "hot_since": %.3f
  },
  "providers": {%s},
  "floor_lock": {
    "active_profile": "%s",
    "floor_mbps": %.2f,
    "last_removed_count": %d,
    "last_kept_count": %d,
    "highest_variant_mbps": %.2f,
    "total_variants_filtered": %d,
    "total_manifests_processed": %d,
    "last_action_ts": %.3f
  }
}]],
    now,
    total_requests, total_auth_fail, auth_success_pct,
    last_fail_ts, last_fail_prov, last_fail_st,
    hot_provider, hot_since,
    table.concat(providers_json, ","),
    fl_profile, fl_floor_bps / 1000000,
    fl_removed, fl_kept,
    fl_highest_bw / 1000000,
    fl_total_filt, fl_total_pass, fl_ts
))

end) -- pcall end

if not ok then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"' .. tostring(result):gsub('"', '\\"') .. '"}')
end
