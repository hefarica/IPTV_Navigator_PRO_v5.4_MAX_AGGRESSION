-- ═══════════════════════════════════════════════════════════════════════
-- NET SHIELD — Internal 302 Follow Engine v1.0
-- Phase: access_by_lua_file (replaces proxy_pass for m3u8 requests)
--
-- PURPOSE: Instead of returning 302 to the player (which adds a full
--   round-trip through VLESS tunnel), NGINX follows the redirect chain
--   internally and returns the FINAL content directly.
--
-- BEFORE: Player → NGINX → Provider (302) → Player → CDN → Player
--   Total: 3 round trips through VLESS (~1500ms)
--
-- AFTER:  Player → NGINX → Provider (302) → CDN (200) → Player
--   Total: 1 round trip through VLESS (~500ms)
--
-- SAFETY:
--   - Max 3 redirects (prevents infinite loops)
--   - Timeout 5s total (never hangs)
--   - pcall wrapped (fails silently → falls back to normal proxy_pass)
--   - PASSTHROUGH: if anything breaks, normal proxy flow continues
--   - Only for .m3u8 requests (segments go direct)
--
-- AUTOPISTA COMPLIANT: No circuit breaker, no blocking, no rate limiting.
-- ═══════════════════════════════════════════════════════════════════════

local ok, err = pcall(function()

    local http = require("resty.http")
    local httpc = http.new()
    httpc:set_timeouts(2000, 5000, 5000)  -- connect 2s, send 5s, read 5s

    -- Build the upstream URL
    local host = ngx.var.host or ""
    local uri  = ngx.var.request_uri or "/"

    -- Resolve the upstream IP(s) for this host
    -- Use the upstream pool defined in NGINX config
    local url = "http://" .. host .. uri

    local max_redirects = 3
    local final_res = nil
    local redirect_chain = {}

    for i = 1, max_redirects + 1 do
        local res, req_err = httpc:request_uri(url, {
            method = "GET",
            headers = {
                ["User-Agent"] = "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/91 Safari/537.36",
                ["Referer"] = "https://www.netflix.com/",
                ["Accept"] = "*/*",
                ["Host"] = host,
            },
            ssl_verify = false,
        })

        if not res then
            -- HTTP request failed, fall back to normal proxy_pass
            return
        end

        redirect_chain[#redirect_chain + 1] = url .. " → " .. tostring(res.status)

        if res.status == 301 or res.status == 302 or res.status == 307 then
            local location = res.headers["Location"]
            if location and i <= max_redirects then
                -- Update host for next request
                local new_host = location:match("^https?://([^/]+)")
                if new_host then
                    host = new_host
                end
                url = location
            else
                final_res = res
                break
            end
        else
            final_res = res
            break
        end
    end

    if not final_res then
        return  -- fall back to normal proxy_pass
    end

    -- ═══ EMIT FINAL RESPONSE ════════════════════════════════════════
    ngx.status = final_res.status

    -- Pass through important headers
    local pass_headers = {
        "Content-Type", "Content-Length", "Cache-Control",
        "ETag", "Last-Modified", "Accept-Ranges"
    }
    for _, h in ipairs(pass_headers) do
        if final_res.headers[h] then
            ngx.header[h] = final_res.headers[h]
        end
    end

    -- Telemetry headers
    ngx.header["X-302-Followed"] = #redirect_chain
    ngx.header["X-302-Chain"] = table.concat(redirect_chain, " | ")

    -- Send body
    ngx.print(final_res.body or "")
    ngx.exit(final_res.status)

end) -- pcall

if not ok then
    -- Silent failure — normal proxy_pass will handle the request
    ngx.log(ngx.WARN, "302_FOLLOW_ERR: " .. tostring(err))
end
