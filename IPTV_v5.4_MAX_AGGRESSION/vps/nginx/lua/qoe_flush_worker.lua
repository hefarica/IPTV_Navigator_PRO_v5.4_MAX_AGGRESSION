-- APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120
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
local FLUSH_PORT = 8099

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
        local channel_profile = {}      -- chId → "P0".."P5" (Feature 1: from observer X-APE-Profile capture)
        local hdcp_needed = {}          -- list of {channel_id, vst_ms}
        -- ── [MAX_QUALITY 2026-05-22] Canales con MAX_QUALITY OVERRIDE activo ─────────────────
        -- Poblado por qoe_server_side_observer.lua desde el header X-APE-Max-Quality:1
        -- que el generador inyecta via EXTHTTP cuando el toggle MAX QUALITY OVERRIDE está ON.
        -- El flush envía este dato a qoe-flush.php → ConvivaPersistence::recordMaxQualityChannel()
        -- → tabla max_quality_channels en conviva.db (auditable, reportable desde dashboard).
        local max_quality_channels = {} -- list of {channel_id, cascade_type}
        -- Tabla auxiliar para evitar duplicados dentro del mismo ciclo de flush
        local max_quality_seen = {}     -- chId → true (dedup guard)
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
            elseif prefix == "prof" then
                -- [Feature 1] channel→profile mapping. Do NOT delete (persists across cycles, TTL 1h).
                channel_profile[chId] = tostring(dict:get(k) or "")
            elseif prefix == "mq" then
                -- ── [MAX_QUALITY 2026-05-22] Canal en reproducción con MAX_QUALITY OVERRIDE ──
                -- Seteado por qoe_server_side_observer.lua cuando detecta X-APE-Max-Quality:1
                -- en el manifest request. Solo se incluye una vez por canal por ciclo de flush.
                -- IMPORTANTE: NO borramos la key aquí (TTL 1h en el observer) porque el
                -- canal puede seguir en reproducción MAX_QUALITY durante múltiples ciclos.
                -- Usamos max_quality_seen como dedup para no enviar el mismo canal 2 veces
                -- en el mismo payload.
                if not max_quality_seen[chId] then
                    max_quality_seen[chId] = true
                    -- Buscar el tipo de cascada correspondiente (puede no existir si el
                    -- generador es viejo y no emitía X-APE-Codec-Cascade aún)
                    local cascade_type = tostring(dict:get("mqcasc:" .. chId) or "dual-hvc1-hev1")
                    table.insert(max_quality_channels, {
                        channel_id   = chId,
                        cascade_type = cascade_type,
                        profile      = channel_profile[chId] or "unknown",
                    })
                end
                -- DO NOT add to keys_to_delete — la key persiste hasta su TTL natural (1h)
                -- porque el canal puede seguir reproduciéndose durante el próximo ciclo.
            elseif prefix == "cerr" then   -- [F5] 4xx count
                local r = per_channel[chId] or {}; r.cerr = (r.cerr or 0) + (tonumber(dict:get(k)) or 0); per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "serr" then   -- [F5] 5xx count
                local r = per_channel[chId] or {}; r.serr = (r.serr or 0) + (tonumber(dict:get(k)) or 0); per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "redir" then  -- [F5] 302/301 count
                local r = per_channel[chId] or {}; r.redir = (r.redir or 0) + (tonumber(dict:get(k)) or 0); per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "latsum" then -- [F5] upstream latency sum (ms)
                local r = per_channel[chId] or {}; r.latsum = (r.latsum or 0) + (tonumber(dict:get(k)) or 0); per_channel[chId] = r
                table.insert(keys_to_delete, k)
            elseif prefix == "latcnt" then -- [F5] upstream latency count
                local r = per_channel[chId] or {}; r.latcnt = (r.latcnt or 0) + (tonumber(dict:get(k)) or 0); per_channel[chId] = r
                table.insert(keys_to_delete, k)
            end
            ::continue::
        end

        -- ── Build flush payload ──
        local metrics = {}
        for chId, r in pairs(per_channel) do
            local vst_avg = (r.vst_count and r.vst_count > 0) and math.floor(r.vst_sum / r.vst_count) or 0
            local bps_avg = (r.bps_count and r.bps_count > 0) and math.floor(r.bps_sum / r.bps_count) or 0
            local lat_avg = (r.latcnt and r.latcnt > 0) and math.floor(r.latsum / r.latcnt) or 0  -- [F5]
            table.insert(metrics, {
                channel_id     = chId,
                profile        = (channel_profile[chId] ~= "" and channel_profile[chId]) or "P3",  -- Feature 1
                vst_proxy_avg  = vst_avg,
                vst_proxy_max  = r.vst_max or 0,
                rebuffer_count = r.rebuf or 0,
                request_count  = r.req or 0,
                error_count    = r.err or 0,
                bitrate_avg_bps = bps_avg,
                err4xx         = r.cerr or 0,    -- [F5] client errors
                err5xx         = r.serr or 0,    -- [F5] upstream errors
                redirect_count = r.redir or 0,   -- [F5] 302/301 churn
                seg_latency_ms = lat_avg,        -- [F5] avg upstream segment latency
            })
        end

        if #metrics == 0 and #hdcp_needed == 0 and #max_quality_channels == 0 then return end

        local cjson = require("cjson.safe")
        local body = cjson.encode({
            metrics = metrics,
            hdcp_needed_channels = hdcp_needed,
            -- ── [MAX_QUALITY 2026-05-22] Lista de canales consumidos con MAX QUALITY OVERRIDE ──
            -- Procesado por qoe-flush.php → ConvivaPersistence::recordMaxQualityChannel()
            -- Cada entrada: {channel_id, cascade_type, profile}
            -- Usado para auditoría, dashboard y trigger ADB en daemon ONN.
            max_quality_channels = max_quality_channels,
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
