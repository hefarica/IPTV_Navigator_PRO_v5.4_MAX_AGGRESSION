-- follow_redirect.lua
-- Intercepts 302 from upstream and follows it, returning content to player
-- This fixes CDN IP rotation issues where segments only work from
-- the host that served the manifest

local status = ngx.status
if status ~= 302 and status ~= 301 and status ~= 307 then
    return  -- not a redirect, pass through
end

local location = ngx.header["Location"]
if not location then
    return  -- no Location header, pass through
end

-- Only follow redirects to known problematic CDN IPs
-- line.tivi-ott.net redirects to 43.250.127.x
if false then -- RESTRICTION REMOVED: follow ALL redirects
    return  -- not a tivi CDN redirect, pass through normally
end

-- Follow the redirect internally using ngx.location.capture
-- We use a subrequest to an internal location that proxies to the redirect URL
ngx.header["Location"] = nil
ngx.header["Content-Type"] = nil

local res = ngx.location.capture("/_follow_redirect", {
    vars = { redirect_target = location }
})

if res then
    ngx.status = res.status
    for k, v in pairs(res.header) do
        ngx.header[k] = v
    end
    ngx.say(res.body)
    ngx.exit(res.status)
end
