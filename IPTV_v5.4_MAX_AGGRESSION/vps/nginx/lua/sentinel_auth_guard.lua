-- APE SENTINEL v1.0 — Auth Guard + UA Rotation + Provider Fingerprint (Lua)
-- RUNS: header_filter_by_lua_file (after upstream responds, before body sent)
-- PURPOSE: Detect 401/403 from upstream, rotate UA, signal retry or fallback.
--   This is PASSTHROUGH — it NEVER blocks, NEVER returns errors to the player.
--
-- ARCHITECTURE:
--   1. On 401/403 from upstream: log, increment provider error counter, set retry headers
--   2. On 200: reset error counters for this provider
--   3. UA rotation: cycle through provider-specific UA pools per request
--   4. Provider fingerprint: extract provider identity from upstream URL
--
-- AUTOPISTA SOP COMPLIANT:
--   ✅ NEVER calls ngx.exit()
--   ✅ NEVER blocks requests
--   ✅ NEVER returns 503/429
--   ✅ Uses pcall for total isolation
--   ✅ header_filter only sets headers and logs — no body mutation

local ok, err = pcall(function()

local reactor = ngx.shared.circuit_metrics
if not reactor then
    return  -- No shared dict, skip silently
end

local status = tonumber(ngx.status) or 0
local now    = ngx.now()

-- ═══ PROVIDER IDENTITY EXTRACTION ═══════════════════════════════════
-- Extract provider from the upstream URL or the shield host
local shield_host = ngx.var.shield_host or ngx.var.upstream_addr or "unknown"
-- Normalize to base domain
local provider = shield_host:match("([%w%-]+%.[%w]+)$") or shield_host

-- ═══ READ LAB CONFIG (Sentinel providers) ═══════════════════════════
local lab_ok, lab = pcall(require, "lab_config")
local sentinel_cfg = nil
if lab_ok then
    local s_ok, s_cfg = pcall(function() return lab.sentinel_providers() end)
    if s_ok then sentinel_cfg = s_cfg end
end

-- ═══ UA ROTATION (per-request, per-provider) ════════════════════════
-- Cycle through UA pool for this provider on EVERY request
-- This happens BEFORE the upstream response, but we set it here for NEXT request
local ua_pool = nil
if sentinel_cfg and sentinel_cfg.providers then
    local p_cfg = sentinel_cfg.providers[provider] or sentinel_cfg.providers._default
    if p_cfg and p_cfg.ua_pool and #p_cfg.ua_pool > 0 then
        ua_pool = p_cfg.ua_pool
    end
end

-- Rotate UA index for next request
if ua_pool then
    local ua_key = "sentinel_ua_idx_" .. provider
    local ua_idx = (tonumber(reactor:get(ua_key)) or 0) % #ua_pool
    reactor:set(ua_key, ua_idx + 1)
    -- Store selected UA for the next request's access phase
    reactor:set("sentinel_next_ua_" .. provider, ua_pool[ua_idx + 1])
end

-- ═══ RESPONSE STATUS HANDLING ═══════════════════════════════════════

    -- USER DOCTRINE 2026-05-11: trigger failover Miami->Brasil via flag (read by wg-health-fast.sh)
    pcall(function()
        local f = io.open("/tmp/sentinel_force_failover", "w")
        if f then
            f:write(os.time(), " ", tostring(ngx.var.proxy_host or "unknown"), " status=", status, "
")
            f:close()
        end
    end)

    -- ── AUTH FAILURE: Provider rejected us ───────────────────────────
    
    -- Increment provider error counter (60s sliding window)
    local err_key = "sentinel_err_" .. provider
    local err_count = (tonumber(reactor:get(err_key)) or 0) + 1
    reactor:set(err_key, err_count, 60)  -- auto-expire after 60s
    
    -- Total 401/403 counter
    local total_key = "sentinel_total_auth_fail"
    local total = (tonumber(reactor:get(total_key)) or 0) + 1
    reactor:set(total_key, total, 300)  -- 5 min window
    
    -- Track last failure time and provider
    reactor:set("sentinel_last_fail_ts", now)
    reactor:set("sentinel_last_fail_provider", provider)
    reactor:set("sentinel_last_fail_status", status)
    
    -- Set response headers for telemetry (these go to the player)
    ngx.header["X-APE-Sentinel"] = string.format(
        "AUTH_FAIL;provider=%s;status=%d;errors_60s=%d",
        provider, status, err_count
    )
    
    -- If errors_60s > threshold, mark provider as "hot" for widget display
    local burst_limit = 8  -- default
    if sentinel_cfg and sentinel_cfg.global_thresholds then
        burst_limit = tonumber(sentinel_cfg.global_thresholds.burst_limiter_burst) or 8
    end
    
    if err_count > burst_limit then
        reactor:set("sentinel_hot_provider", provider)
        reactor:set("sentinel_hot_since", now)
        ngx.header["X-APE-Sentinel-Hot"] = provider
        
        ngx.log(ngx.WARN, string.format(
            "SENTINEL_HOT: provider=%s errors_60s=%d > burst_limit=%d status=%d",
            provider, err_count, burst_limit, status
        ))
    end
    
    -- Log every auth failure
    ngx.log(ngx.WARN, string.format(
        "SENTINEL_AUTH_FAIL: provider=%s status=%d errors_60s=%d ua=%s uri=%s",
        provider, status, err_count,
        ngx.var.upstream_http_server or "?",
        ngx.var.uri or "?"
    ))

elseif status >= 200 and status < 300 then
    -- ── SUCCESS: Reset error state for this provider ────────────────
    
    -- Track successful requests
    local ok_key = "sentinel_ok_" .. provider
    local ok_count = (tonumber(reactor:get(ok_key)) or 0) + 1
    reactor:set(ok_key, ok_count, 60)
    
    -- If this provider was "hot", check if it's recovered
    local hot = reactor:get("sentinel_hot_provider")
    if hot == provider then
        local err_key = "sentinel_err_" .. provider
        local remaining = tonumber(reactor:get(err_key)) or 0
        if remaining == 0 then
            -- Provider recovered — clear hot status
            reactor:delete("sentinel_hot_provider")
            reactor:delete("sentinel_hot_since")
            ngx.log(ngx.NOTICE, string.format(
                "SENTINEL_RECOVERED: provider=%s (errors cleared)",
                provider
            ))
        end
    end
    
    -- Set lightweight telemetry header
    ngx.header["X-APE-Sentinel"] = "OK"

elseif status >= 500 then
    -- ── SERVER ERROR: Track but don't confuse with auth ──────────────
    local srv_key = "sentinel_5xx_" .. provider
    local srv_count = (tonumber(reactor:get(srv_key)) or 0) + 1
    reactor:set(srv_key, srv_count, 60)
    
    ngx.header["X-APE-Sentinel"] = string.format(
        "SRV_ERR;provider=%s;status=%d;5xx_60s=%d",
        provider, status, srv_count
    )
end

-- ═══ GLOBAL METRICS ═════════════════════════════════════════════════
-- Total requests through sentinel (for dashboard denominator)
local total_req = (tonumber(reactor:get("sentinel_total_requests")) or 0) + 1
reactor:set("sentinel_total_requests", total_req, 300)
reactor:set("sentinel_ts", now)

end) -- pcall end

if not ok then
    -- Silent fail — response proceeds normally
    ngx.log(ngx.ERR, "SENTINEL_ERROR: " .. tostring(err))
end
