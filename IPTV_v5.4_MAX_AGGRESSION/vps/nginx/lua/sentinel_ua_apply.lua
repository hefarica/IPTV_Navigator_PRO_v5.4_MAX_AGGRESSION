-- APE SENTINEL v1.0 — UA Apply (access_by_lua companion)
-- RUNS: Called from upstream_gate.lua via require("sentinel_ua_apply")
-- PURPOSE: Read the rotated UA from shared dict and apply it to the current request.
--   The companion sentinel_auth_guard.lua (header_filter) writes the NEXT UA after
--   seeing the upstream response. This module READS that value in the access phase
--   and applies it via ngx.var.sentinel_ua (which proxy_set_header references).
--
-- ARCHITECTURE:
--   1. Read provider identity from $shield_host (nginx map variable)
--   2. Read rotated UA from circuit_metrics shared dict
--   3. Set ngx.var.sentinel_ua = rotated_ua
--   4. proxy_set_header User-Agent $sentinel_ua picks it up
--
-- AUTOPISTA SOP COMPLIANT:
--   ✅ NEVER calls ngx.exit()
--   ✅ NEVER blocks requests
--   ✅ Uses pcall for total isolation
--   ✅ Falls back to static UA on ANY error (set in nginx config as default)
--
-- NGINX WIRING REQUIRED (in shield-location.conf):
--   set $sentinel_ua "Mozilla/5.0 (Linux; Android 10; AFTKA)...";  # static default
--   proxy_set_header User-Agent $sentinel_ua;
--   # sentinel_ua_apply.lua overrides $sentinel_ua if rotation available

local M = {}

function M.apply()
    local ok, err = pcall(function()
        local reactor = ngx.shared.circuit_metrics
        if not reactor then
            return  -- No shared dict, use static default
        end

        -- Get provider identity from shield_host (map variable, always set)
        local shield_host = ngx.var.shield_host
        if not shield_host or shield_host == "" then
            return  -- No host info, use static default
        end

        -- Normalize to base domain (same logic as sentinel_auth_guard.lua)
        local provider = shield_host:match("([%w%-]+%.[%w]+)$") or shield_host

        -- Read the rotated UA that sentinel_auth_guard.lua stored
        local ua_key = "sentinel_next_ua_" .. provider
        local rotated_ua = reactor:get(ua_key)

        if rotated_ua and rotated_ua ~= "" then
            -- Apply the rotated UA to this request
            -- ngx.var.sentinel_ua is defined in shield-location.conf as:
            --   set $sentinel_ua "static_fallback";
            -- We override it here; proxy_set_header User-Agent $sentinel_ua reads it.
            ngx.var.sentinel_ua = rotated_ua
        end
        -- If no rotated UA available, $sentinel_ua keeps its static default → safe
    end)

    if not ok then
        -- PASSTHROUGH: any error → static UA is used (already set in nginx config)
        ngx.log(ngx.ERR, "SENTINEL_UA_APPLY_ERROR: " .. tostring(err))
    end
end

return M
