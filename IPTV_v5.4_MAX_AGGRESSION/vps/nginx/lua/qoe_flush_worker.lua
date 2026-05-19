-- ═══════════════════════════════════════════════════════════════════════════
-- QoE Flush Worker v1.0 — periodic shared-dict → PHP/SQLite flush (60s timer)
-- ═══════════════════════════════════════════════════════════════════════════
-- Runs ONCE per nginx worker (init_worker_by_lua_file). Every 60s walks the
-- ngx.shared.qoe_metrics dict, builds a flush payload, POSTs to local
-- /prisma/api/qoe-flush.php (localhost only). Then clears flushed keys.
--
-- Companion to qoe_server_side_observer.lua (writer side).
--
-- DOCTRINE:
--   - AUTOPISTA: timer-based, async, NEVER touches active streams
--   - LOCALHOST: HTTP POST goes to 127.0.0.1, no external traffic
--   - PASSTHROUGH: shared dict reads are < 1µs; HTTP call wrapped in pcall
--
-- ACTIVATION: add to nginx.conf http block:
--   init_worker_by_lua_file /etc/nginx/lua/qoe_flush_worker.lua;
-- ═══════════════════════════════════════════════════════════════════════════

local FLUSH_INTERVAL_S = 60
local FLUSH_URL_PATH = "/prisma/api/qoe-flush.php"
local FLUSH_HOST = "127.0.0.1"
local FLUSH_PORT = 80

-- Only the first worker runs the flush timer (avoid N workers × N flushes)
if ngx.worker.id() ~= 0 then return end

local function flush_callback(premature)
    if premature then return end

    local ok, err = pcall(function()
        local dict = ngx.shared.qoe_metrics
        if not dict then return end

        local keys = dict:get_keys(2000)  -- max 2000 keys/cycle
        if not keys or #keys == 0 then return end

        -- ── Aggregate per channel ──
        local per_channel = {}          -- chId → {vst_sum, vst_count, vst_max, rebuf, req, err, bps_sum, bps_count}
        local hdcp_needed = {}          -- list of {channel_id, vst_ms}
        local keys_to_delete = {}

        for _, k in ipairs(keys) do
            local prefix, chId = k:match("^([a-z]+):(.+)$")
            if not chId then goto continue end

            if prefix == "vst" then
                local v = tonumber(dict:get(k)) or 0
                local r = per_channel[chId] or {}
                r.vst_sum = (r.vst_sum or 0) + v
                r.vst_count = (r.vst_count or 0) + 1
                r.vst_max = math.max(r.vst_max or 0, v)
                per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "rebuf" then
                local v = tonumber(dict:get(k)) or 0
                local r = per_channel[chId] or {}
                r.rebuf = (r.rebuf or 0) + v
                per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "req" then
                local v = tonumber(dict:get(k)) or 0
                local r = per_channel[chId] or {}
                r.req = (r.req or 0) + v
                per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "err" then
                local v = tonumber(dict:get(k)) or 0
                local r = per_channel[chId] or {}
                r.err = (r.err or 0) + v
                per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "bps" then
                local v = tonumber(dict:get(k)) or 0
                local r = per_channel[chId] or {}
                r.bps_sum = (r.bps_sum or 0) + v
                r.bps_count = (r.bps_count or 0) + 1
                per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "hdcpneeded" then
                local v = tonumber(dict:get(k)) or 0
                table.insert(hdcp_needed, { channel_id = chId, vst_ms = v, channel_name = "CH-" .. chId })
                table.insert(keys_to_delete, k)
            end
            ::continue::
        end

        -- ── Build flush payload ──
        local metrics = {}
        for chId, r in pairs(per_channel) do
            local vst_avg = (r.vst_count and r.vst_count > 0) and math.floor(r.vst_sum / r.vst_count) or 0
            local bps_avg = (r.bps_count and r.bps_count > 0) and math.floor(r.bps_sum / r.bps_count) or 0
            table.insert(metrics, {
                channel_id     = chId,
                vst_proxy_avg  = vst_avg,
                vst_proxy_max  = r.vst_max or 0,
                rebuffer_count = r.rebuf or 0,
                request_count  = r.req or 0,
                error_count    = r.err or 0,
                bitrate_avg_bps = bps_avg,
            })
        end

        if #metrics == 0 and #hdcp_needed == 0 then return end

        local cjson = require("cjson.safe")
        local body = cjson.encode({
            metrics = metrics,
            hdcp_needed_channels = hdcp_needed,
            bucket_5min = math.floor(ngx.time() / 300),
            ts = ngx.time(),
        })
        if not body then return end

        -- ── POST to localhost endpoint ──
        local sock = ngx.socket.tcp()
        sock:settimeout(2000)
        local connected = sock:connect(FLUSH_HOST, FLUSH_PORT)
        if not connected then return end

        local req = "POST " .. FLUSH_URL_PATH .. " HTTP/1.1\r\n" ..
                    "Host: localhost\r\n" ..
                    "Content-Type: application/json\r\n" ..
                    "Content-Length: " .. #body .. "\r\n" ..
                    "Connection: close\r\n\r\n" .. body
        sock:send(req)
        sock:receive("*a")  -- drain response, don't care about content
        sock:close()

        -- ── Clear flushed keys ──
        for _, k in ipairs(keys_to_delete) do
            dict:delete(k)
        end
    end)

    -- Schedule next flush
    ngx.timer.at(FLUSH_INTERVAL_S, flush_callback)

    if not ok then
        ngx.log(ngx.WARN, "[qoe_flush] silent error: ", err)
    end
end

-- Schedule first flush
local _ok, _err = ngx.timer.at(FLUSH_INTERVAL_S, flush_callback)
if not _ok then
    ngx.log(ngx.ERR, "[qoe_flush] failed to schedule initial timer: ", _err)
end
