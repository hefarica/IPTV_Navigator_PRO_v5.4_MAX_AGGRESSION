-- APE MEMC-TOTAL-8K120 — Synchronized v22.6.0-MEMC-TOTAL-8K120
-- shield_follow_302.lua
-- For providers that return 302 to rotating CDN IPs
-- Follows up to 3 redirects and returns the final content

local http = require "resty.http"
local httpc = http.new()
httpc:set_timeout(10000)

local shield_host = ngx.var.shield_host
local shield_path = ngx.var.shield_path
local args = ngx.var.args or ""
local url = "http://" .. shield_host .. shield_path
if args ~= "" then
    url = url .. "?" .. args
end

local max_redirects = 3
local final_res = nil

for i = 1, max_redirects + 1 do
    local res, err = httpc:request_uri(url, {
        method = "GET",
        headers = {
            ["User-Agent"] = "Mozilla/5.0 (Linux; Android 10; AFTKA) AppleWebKit/537.36 Silk/112.3.1",
            ["Referer"] = "https://www.netflix.com/",
            ["Accept"] = "*/*",
        },
        ssl_verify = false,
    })
    
    if not res then
        ngx.status = 502
        ngx.say("upstream error: " .. (err or "unknown"))
        return
    end
    
    if res.status == 301 or res.status == 302 or res.status == 307 then
        local location = res.headers["Location"]
        if location and i <= max_redirects then
            url = location
        else
            -- Too many redirects or no location
            final_res = res
            break
        end
    else
        final_res = res
        break
    end
end

if final_res then
    ngx.status = final_res.status
    -- Pass through important headers
    if final_res.headers["Content-Type"] then
        ngx.header["Content-Type"] = final_res.headers["Content-Type"]
    end
    ngx.print(final_res.body)
else
    ngx.status = 502
    ngx.say("failed to follow redirects")
end
