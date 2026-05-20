-- ═══════════════════════════════════════════════════════════════════════════
-- qm_apply_worker.lua — Background worker to poll and apply pending manifests
-- ═══════════════════════════════════════════════════════════════════════════
-- Checks for /var/www/html/prisma/quality-manifest.pending every 3 seconds.
-- If present, runs local POST to /prisma/api/prisma-adb-quality.php?action=server_apply_pending
-- to trigger ADB sync.
--
-- AUTOPISTA COMPLIANT: non-blocking timer loops, pure local traffic.
-- ═══════════════════════════════════════════════════════════════════════════

local _M = {}

local INTERVAL_S = 3
local PENDING_FILE = "/var/www/html/prisma/quality-manifest.pending"
local APPLY_URL_PATH = "/prisma/api/prisma-adb-quality.php?action=server_apply_pending"
local LOCAL_HOST = "127.0.0.1"
local LOCAL_PORT = 8099

local function file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

local function apply_callback(premature)
    if premature then return end

    local ok, err = pcall(function()
        if not file_exists(PENDING_FILE) then return end

        ngx.log(ngx.INFO, "[qm_apply_worker] Pending manifest detected, executing apply...")

        -- HTTP POST to trigger PHP ADB apply
        local sock = ngx.socket.tcp()
        sock:settimeout(5000) -- 5 seconds timeout for local ADB
        local connected = sock:connect(LOCAL_HOST, LOCAL_PORT)
        if not connected then
            ngx.log(ngx.ERR, "[qm_apply_worker] Failed to connect to local server for apply")
            return
        end

        local req = "POST " .. APPLY_URL_PATH .. " HTTP/1.1\r\n" ..
                    "Host: localhost\r\n" ..
                    "Content-Length: 0\r\n" ..
                    "Connection: close\r\n\r\n"
        sock:send(req)
        local res, sock_err = sock:receive("*a")
        sock:close()

        if sock_err then
            ngx.log(ngx.ERR, "[qm_apply_worker] Local request failed: ", sock_err)
        end
    end)

    if not ok then
        ngx.log(ngx.ERR, "[qm_apply_worker] Error during apply: ", err)
    end

    -- Re-schedule
    local ok_sched, sched_err = ngx.timer.at(INTERVAL_S, apply_callback)
    if not ok_sched then
        ngx.log(ngx.ERR, "[qm_apply_worker] Failed to re-schedule timer: ", sched_err)
    end
end

function _M.start()
    ngx.log(ngx.INFO, "[qm_apply_worker] Initializing background manifest worker...")
    local ok, err = ngx.timer.at(INTERVAL_S, apply_callback)
    if not ok then
        ngx.log(ngx.ERR, "[qm_apply_worker] Failed to schedule initial timer: ", err)
    end
end

return _M
