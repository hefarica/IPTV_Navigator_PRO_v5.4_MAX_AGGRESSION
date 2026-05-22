-- ═══════════════════════════════════════════════════════════════════════════
-- QoE Server-Side Observer v1.0 — Conviva-equivalent telemetry for native players
-- ═══════════════════════════════════════════════════════════════════════════
-- TiviMate, OTT Navigator, VLC, Kodi, IPTV Smarters, ExoPlayer-based players
-- cannot execute JS (no conviva-qoe-engine.js loaded). We reconstruct equivalent
-- QoE metrics from server-side access patterns observed via log_by_lua_file.
--
-- METRICS DERIVED FROM nginx VARS (no extra latency, log phase only):
--   VST_proxy        = (first segment fetch ts) - (manifest fetch ts) per session
--   rebuffer_proxy   = gaps between consecutive segment fetches > 2 * segment_duration
--   bitrate_proxy    = body_bytes_sent / upstream_response_time
--   error_rate       = % of 4xx/5xx per channel per 5-min window
--
-- WIRE INTO HDCP-ADAPTIVE ENGINE:
--   If VST_proxy > 3000ms for 3 consecutive sessions on same channel → POST
--   /prisma/api/channel-hdcp-incident.php (same fire-and-forget path as JS).
--
-- DOCTRINE:
--   - PASSTHROUGH: this script runs in log_by_lua phase, ZERO impact on request
--   - AUTOPISTA: cannot block, cannot return errors, cannot interfere
--   - SHARED DICT: uses ngx.shared.qoe_metrics (declared in nginx.conf)
--   - PERIODIC FLUSH: shared dict → POST /prisma/api/qoe-flush.php every 60s
--
-- ACTIVATION: include `log_by_lua_file /etc/nginx/lua/qoe_server_side_observer.lua`
--             in stream proxy_pass locations (manifest .m3u8 + segments .ts/.m4s)
-- ═══════════════════════════════════════════════════════════════════════════

local ok, _ = pcall(function()
    local dict = ngx.shared.qoe_metrics
    if not dict then return end  -- shared dict not declared → silently skip

    -- ── Identify request type from URI ──
    local uri = ngx.var.uri or ""
    local is_manifest = uri:match("%.m3u8$") ~= nil
    local is_segment = uri:match("%.ts$") ~= nil or uri:match("%.m4s$") ~= nil
    if not (is_manifest or is_segment) then return end

    -- ── Extract session key (client IP + UA hash) ──
    local client_ip = ngx.var.remote_addr or "0.0.0.0"
    local ua = ngx.var.http_user_agent or "unknown"
    -- Short UA hash (first 8 chars of UA): differentiates VLC vs Kodi vs ExoPlayer
    local ua_short = ua:sub(1, 8)
    local session_key = client_ip .. "|" .. ua_short

    -- ── Extract channel_id from URI ──
    -- Xtream pattern: /live/USER/PASS/STREAMID.m3u8 or /STREAMID/HASH.ts
    local channel_id = uri:match("/live/[^/]+/[^/]+/(%d+)%.m3u8") or
                       uri:match("/(%d+)/[^/]+%.ts") or
                       uri:match("/(%d+)/[^/]+%.m4s") or
                       "unknown"

    -- ── Timing data ──
    local now_ms = math.floor(ngx.now() * 1000)
    local status = tonumber(ngx.var.status) or 0
    local body_bytes = tonumber(ngx.var.body_bytes_sent) or 0
    local upstream_time_s = tonumber(ngx.var.upstream_response_time) or 0
    local upstream_time_ms = math.floor(upstream_time_s * 1000)

    -- ── A) Error rate tracking (per channel, 5-min window) ──
    if status >= 400 then
        local err_key = "err:" .. channel_id
        dict:incr(err_key, 1, 0, 300)  -- TTL 300s
        -- [F5 2026-05-21] split 4xx vs 5xx (richer QoE signal; 5xx = upstream sick).
        -- Keys are letters-only so the worker's ^([a-z]+): prefix parser captures them.
        if status >= 500 then dict:incr("serr:" .. channel_id, 1, 0, 300)
        else dict:incr("cerr:" .. channel_id, 1, 0, 300) end
    end
    -- [F5 2026-05-21] redirect rate (302/301): upstream session churn / affinity signal
    if status == 302 or status == 301 then dict:incr("redir:" .. channel_id, 1, 0, 300) end
    local req_key = "req:" .. channel_id
    dict:incr(req_key, 1, 0, 300)

    -- ── B) Manifest fetch → record timestamp for VST_proxy ──
    if is_manifest and status == 200 then
        local manifest_ts_key = "mts:" .. session_key .. ":" .. channel_id
        dict:set(manifest_ts_key, now_ms, 30)  -- TTL 30s (segment fetch should follow soon)
        -- [Feature 1 2026-05-20] Capture X-APE-Profile (sent by the list's EXTHTTP block)
        -- for per-profile QoE aggregation (Conviva→LAB loop). Channel→profile is static,
        -- so one set per manifest fetch is enough. NOT consumed in hot path (read at flush).
        local prof = ngx.var.http_x_ape_profile
        if prof and prof ~= "" then
            dict:set("prof:" .. channel_id, prof, 3600)  -- TTL 1h
        end
    end

    -- ── C) Segment fetch → compute VST_proxy if it's the FIRST after manifest ──
    if is_segment and status == 200 then
        local manifest_ts_key = "mts:" .. session_key .. ":" .. channel_id
        local manifest_ts = dict:get(manifest_ts_key)
        if manifest_ts then
            -- This is the first segment after the manifest → compute VST_proxy
            local vst_proxy = now_ms - manifest_ts
            dict:delete(manifest_ts_key)  -- consumed

            if vst_proxy > 0 and vst_proxy < 60000 then  -- sanity bounds
                -- Store latest VST_proxy per channel (overwrite, only most recent matters)
                dict:set("vst:" .. channel_id, vst_proxy, 600)  -- TTL 10min

                -- ── D) HDCP-Adaptive wire: if VST_proxy > 3000ms, increment counter ──
                if vst_proxy > 3000 then
                    local hdcp_fail_key = "hdcpfail:" .. channel_id
                    local consecutive = dict:incr(hdcp_fail_key, 1, 0, 600)
                    -- Trigger HDCP fallback after 3 consecutive slow VSTs (anti-noise)
                    if consecutive and consecutive >= 3 then
                        -- Mark this channel for HDCP NONE — actual POST happens in flush
                        dict:set("hdcpneeded:" .. channel_id, vst_proxy, 3600)
                        dict:delete(hdcp_fail_key)  -- reset counter after trigger
                    end
                else
                    -- Good VST → reset consecutive failure counter
                    dict:delete("hdcpfail:" .. channel_id)
                end
            end
        end

        -- ── E) Rebuffer proxy: gap between segments of same session ──
        local last_seg_ts_key = "lst:" .. session_key .. ":" .. channel_id
        local last_seg_ts = dict:get(last_seg_ts_key)
        if last_seg_ts then
            local gap_ms = now_ms - last_seg_ts
            -- Segments typically arrive every ~2-10s. Gap > 15s indicates rebuffer.
            if gap_ms > 15000 then
                dict:incr("rebuf:" .. channel_id, 1, 0, 600)
            end
        end
        dict:set(last_seg_ts_key, now_ms, 30)

        -- ── F) Bitrate proxy: bytes/sec for this segment ──
        if upstream_time_ms > 0 and body_bytes > 0 then
            local bps = math.floor((body_bytes * 8 * 1000) / upstream_time_ms)
            dict:set("bps:" .. channel_id, bps, 600)
        end

        -- ── [F5 2026-05-21] segment upstream latency (sum+count -> worker avg) ──
        if upstream_time_ms > 0 then
            dict:incr("latsum:" .. channel_id, upstream_time_ms, 0, 300)
            dict:incr("latcnt:" .. channel_id, 1, 0, 300)
        end
    end
end)
-- Errors are silenced — log phase MUST NOT throw (autopista doctrine)
if not ok then
    -- One-line audit trail; never re-throw
    ngx.log(ngx.WARN, "[qoe_observer] silent error swallowed")
end
