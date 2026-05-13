-- ═══════════════════════════════════════════════════════════════════════
-- NET SHIELD — Combined Body Filter: Floor-Lock + Prefetch v1.0
-- Phase: body_filter_by_lua_file
--
-- PIPELINE ORDER:
--   1. Accumulate all response body chunks
--   2. At EOF: Run FLOOR-LOCK (remove low-quality HLS variants)
--   3. Then: Run PREFETCH (extract last .ts from filtered body, pre-warm cache)
--
-- SAFETY: Both stages wrapped in pcall. If anything fails, original body passes.
-- AUTOPISTA COMPLIANT: No ngx.exit(), no blocking, PASSTHROUGH on error.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══ STAGE 0: CHUNK ACCUMULATION ════════════════════════════════════
-- body_filter runs per-chunk. We accumulate all chunks and process at EOF.

local chunk = ngx.arg[1]
local eof   = ngx.arg[2]

if not ngx.ctx._combined_buf then
    ngx.ctx._combined_buf = {}
end

if chunk and #chunk > 0 then
    ngx.ctx._combined_buf[#ngx.ctx._combined_buf + 1] = chunk
    ngx.arg[1] = nil  -- suppress chunk, we'll emit full body at EOF
end

if not eof then
    return  -- more chunks coming
end

-- ═══ EOF: Full body available ═══════════════════════════════════════
local body = table.concat(ngx.ctx._combined_buf or {})
ngx.ctx._combined_buf = nil

-- If body is empty or tiny, pass through
if #body < 20 then
    ngx.arg[1] = body
    return
end

-- ═══ STAGE 1: FLOOR-LOCK (filter low-quality HLS variants) ═════════
local floor_ok, floor_err = pcall(function()

    -- Only for 200 OK responses
    if ngx.status ~= 200 then return end

    -- Only for HLS content
    local ct = ngx.header["Content-Type"] or ""
    local is_hls = ct:find("mpegurl", 1, true)
                    or ct:find("mpegURL", 1, true)
                    or ct:find("octet-stream", 1, true)
    if not is_hls then return end

    -- Must be a Master Playlist (has #EXT-X-STREAM-INF)
    if not body:find("#EXT-X-STREAM-INF", 1, true) then return end

    -- Read floor config
    local lab_ok, lab = pcall(require, "lab_config")
    if not lab_ok then return end

    local floor_cfg = lab.floor_lock()
    if not floor_cfg or not floor_cfg.floor_lock_enabled then return end

    -- Determine profile (default P3 = 8 Mbps floor)
    local profile = "P3"
    local args = ngx.req.get_uri_args()
    if args and args.profile then
        profile = tostring(args.profile):upper()
    end
    local hdr_profile = ngx.req.get_headers()["X-APE-Profile"]
    if hdr_profile then
        profile = tostring(hdr_profile):upper()
    end
    if not profile:match("^P[0-5]$") then profile = "P3" end

    local floor_bps = lab.floor_bps_for_profile(profile)

    -- Parse lines
    local lines = {}
    for line in body:gmatch("[^\r\n]+") do
        lines[#lines + 1] = line
    end

    -- Find highest bandwidth variant (always keep it)
    local highest_bw = 0
    local highest_idx = -1
    for i = 1, #lines do
        local bw = lines[i]:match('#EXT%-X%-STREAM%-INF:.-BANDWIDTH=(%d+)')
        if bw then
            bw = tonumber(bw) or 0
            if bw > highest_bw then
                highest_bw = bw
                highest_idx = i
            end
        end
    end

    -- Filter: remove variants below floor (keep highest always)
    local filtered = {}
    local removed = 0
    local kept = 0
    local i = 1
    while i <= #lines do
        local bw_match = lines[i]:match('#EXT%-X%-STREAM%-INF:.-BANDWIDTH=(%d+)')
        if bw_match then
            local bw = tonumber(bw_match) or 0
            if bw < floor_bps and i ~= highest_idx then
                removed = removed + 1
                i = i + 1  -- skip STREAM-INF
                if i <= #lines and not lines[i]:match("^#") then
                    i = i + 1  -- skip URL
                end
            else
                filtered[#filtered + 1] = lines[i]
                kept = kept + 1
                i = i + 1
                if i <= #lines and not lines[i]:match("^#") then
                    filtered[#filtered + 1] = lines[i]
                    i = i + 1
                end
            end
        else
            filtered[#filtered + 1] = lines[i]
            i = i + 1
        end
    end

    if kept == 0 then return end  -- safety: keep original if all filtered

    if removed > 0 then
        body = table.concat(filtered, "\n") .. "\n"
        ngx.header["X-APE-Floor-Lock"] = string.format(
            "profile=%s;floor=%d;removed=%d;kept=%d",
            profile, floor_bps, removed, kept
        )
        ngx.log(ngx.NOTICE, string.format(
            "FLOOR_LOCK: %s floor=%dMbps removed=%d kept=%d highest=%dMbps",
            profile, floor_bps / 1000000, removed, kept, highest_bw / 1000000
        ))
        -- Update shared dict metrics
        local reactor = ngx.shared.circuit_metrics
        if reactor then
            reactor:set("fl_removed", removed)
            reactor:set("fl_kept", kept)
            reactor:set("fl_profile", profile)
            reactor:set("fl_ts", ngx.now())
        end
    end

end) -- pcall floor_lock

if not floor_ok then
    ngx.log(ngx.WARN, "FLOOR_LOCK_ERR: " .. tostring(floor_err))
end

-- ═══ STAGE 2: PREFETCH (pre-warm cache with last .ts segment) ══════
local pf_ok, pf_err = pcall(function()

    if ngx.status ~= 200 then return end
    if #body < 50 then return end

    -- Extract the LAST .ts/.m4s segment URL (live edge)
    local last_ts = nil
    for line in body:gmatch("[^\r\n]+") do
        if not line:match("^#") then
            if line:match("%.ts") or line:match("%.m4s") or line:match("%.aac") then
                last_ts = line
            end
        end
    end

    if not last_ts then return end

    -- Build host and path
    local req_host = ngx.var.host or ""
    local ts_path = last_ts

    if last_ts:match("^https?://") then
        local h, p = last_ts:match("^https?://([^/]+)(/.+)$")
        if h and p then req_host = h; ts_path = p
        else return end
    end

    if not ts_path:match("^/") then
        local uri_dir = ngx.var.uri:match("^(.*/)")
        if uri_dir then ts_path = uri_dir .. ts_path
        else ts_path = "/" .. ts_path end
    end

    -- Dedup: don't prefetch same segment twice
    local cache_dict = ngx.shared.circuit_metrics
    if cache_dict then
        local key = "pf:" .. req_host .. ts_path
        if cache_dict:get(key) then return end
        cache_dict:set(key, 1, 10)
    end

    -- Fire background prefetch
    ngx.timer.at(0, function(premature)
        if premature then return end
        local sock = ngx.socket.tcp()
        sock:settimeouts(1000, 3000, 3000)
        local ok, err = sock:connect("127.0.0.1", 80)
        if not ok then sock:close(); return end
        sock:send("GET " .. ts_path .. " HTTP/1.1\r\nHost: " .. req_host .. "\r\nUser-Agent: NGINX-Prefetch/1.0\r\nConnection: close\r\n\r\n")
        local hdr = sock:receive("*l")
        for j = 1, 20 do
            local line, err = sock:receive("*l")
            if not line or line == "" then break end
        end
        sock:receive(4096)
        sock:close()
    end)

end) -- pcall prefetch

if not pf_ok then
    ngx.log(ngx.WARN, "PREFETCH_ERR: " .. tostring(pf_err))
end

-- ═══ EMIT FINAL BODY ════════════════════════════════════════════════
ngx.arg[1] = body
