-- ═══════════════════════════════════════════════════════════════════════════
-- NET SHIELD — Speculative Prefetch Engine v1.0
-- Phase: body_filter_by_lua_file (runs while NGINX streams manifest to client)
--
-- PURPOSE: When NGINX proxies a .m3u8 manifest, this script reads the response
--   body, extracts the LAST .ts segment URL (live edge), and fires a background
--   HTTP request to pre-warm the NGINX cache. When the player requests that
--   segment milliseconds later, it's already a cache HIT (0ms).
--
-- SAFETY:
--   - PASSTHROUGH: Never modifies the response body (ngx.arg[1] untouched)
--   - FAIL-SILENT: All logic wrapped in pcall(), errors logged but never block
--   - NON-BLOCKING: Prefetch fires via ngx.timer.at (background coroutine)
--   - RESOURCE-BOUND: Max 1 prefetch per manifest, 3s timeout, auto-cleanup
--   - RATE-LIMITED: Shared dict prevents duplicate prefetches for same segment
--
-- AUTOPISTA COMPLIANT: No ngx.exit(), no return 503, no blocking.
-- ═══════════════════════════════════════════════════════════════════════════

local ok, err = pcall(function()

    -- Only process 200 OK responses
    if ngx.status ~= 200 then return end

    local ctx = ngx.ctx
    if not ctx._prefetch_buf then
        ctx._prefetch_buf = {}
    end

    -- Accumulate body chunks (NGINX streams in pieces)
    local chunk = ngx.arg[1]
    if chunk and #chunk > 0 then
        ctx._prefetch_buf[#ctx._prefetch_buf + 1] = chunk
    end

    -- Not EOF yet — wait for more chunks
    if not ngx.arg[2] then return end

    -- === EOF: Parse manifest and prefetch ===
    local body = table.concat(ctx._prefetch_buf)
    ctx._prefetch_buf = nil

    -- Skip if body is too small to be a real manifest
    if #body < 50 then return end

    -- Extract the LAST .ts segment URL (live edge = what player requests first)
    local last_ts = nil
    for line in body:gmatch("[^\r\n]+") do
        if not line:match("^#") then
            if line:match("%.ts") or line:match("%.m4s") or line:match("%.aac") then
                last_ts = line
            end
        end
    end

    if not last_ts then return end

    -- Determine host and path for the prefetch request
    local req_host = ngx.var.host or ""
    local ts_path = last_ts

    -- Handle absolute URLs: http://cdn.example.com/path/segment.ts
    if last_ts:match("^https?://") then
        local h, p = last_ts:match("^https?://([^/]+)(/.+)$")
        if h and p then
            req_host = h
            ts_path = p
        else
            return -- Can't parse, skip
        end
    end

    -- Handle relative URLs: ensure they start with /
    if not ts_path:match("^/") then
        -- Build from the manifest request URI directory
        local uri_dir = ngx.var.uri:match("^(.*/)")
        if uri_dir then
            ts_path = uri_dir .. ts_path
        else
            ts_path = "/" .. ts_path
        end
    end

    -- Rate limit: don't prefetch the same segment twice (shared dict)
    local cache_dict = ngx.shared.circuit_metrics
    if cache_dict then
        local cache_key = "pf:" .. req_host .. ts_path
        local already = cache_dict:get(cache_key)
        if already then return end
        -- Mark as prefetched for 10 seconds
        cache_dict:set(cache_key, 1, 10)
    end

    -- Fire background prefetch (non-blocking)
    ngx.timer.at(0, function(premature)
        if premature then return end

        local sock = ngx.socket.tcp()
        sock:settimeouts(1000, 3000, 3000) -- connect 1s, send 3s, read 3s

        local conn_ok, conn_err = sock:connect("127.0.0.1", 80)
        if not conn_ok then
            sock:close()
            return
        end

        -- Send minimal HTTP/1.1 request
        local req = "GET " .. ts_path .. " HTTP/1.1\r\n"
                 .. "Host: " .. req_host .. "\r\n"
                 .. "User-Agent: NGINX-Prefetch/1.0\r\n"
                 .. "Connection: close\r\n"
                 .. "\r\n"

        local send_ok, send_err = sock:send(req)
        if not send_ok then
            sock:close()
            return
        end

        -- Read just the headers (enough to trigger NGINX cache write)
        -- We don't need the full body — NGINX will cache it from upstream
        local headers = sock:receive("*l") -- Read first line (HTTP/1.1 200 OK)
        -- Read a bit more to ensure cache is triggered
        for i = 1, 20 do
            local line, err = sock:receive("*l")
            if not line or line == "" then break end
        end

        -- Read first 4KB of body to trigger cache write
        sock:receive(4096)

        sock:close()
    end)

end) -- pcall

-- If anything failed, it's logged but never blocks
if not ok then
    ngx.log(ngx.WARN, "prefetch: ", tostring(err))
end
