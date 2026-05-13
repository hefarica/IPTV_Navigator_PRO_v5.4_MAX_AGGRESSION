-- APE PRISMA v2.0 — FLOOR-LOCK HLS Variant Filter (Lua)
-- RUNS: body_filter_by_lua_file (on HLS master playlist responses ONLY)
-- PURPOSE: Remove #EXT-X-STREAM-INF variants with BANDWIDTH below profile floor.
--   This ensures the player NEVER sees a low-quality variant to select.
--
-- ARCHITECTURE:
--   1. Accumulate response body chunks (body_filter runs per-chunk)
--   2. On last chunk (ngx.arg[2] == true): parse, filter, emit
--   3. PASSTHROUGH: If filter fails or content isn't HLS master, pass original
--   4. PASSTHROUGH: If floor_lock_enabled == false, pass original
--   5. PASSTHROUGH: If no variants removed, pass original (zero overhead)
--
-- AUTOPISTA SOP COMPLIANT:
--   ✅ NEVER calls ngx.exit()
--   ✅ NEVER blocks requests
--   ✅ NEVER returns 503/429
--   ✅ Uses pcall for total isolation
--   ✅ Falls back to original body on ANY error
--
-- INVARIANTS RESPECTED:
--   A1: No ngx.exit
--   A5: proxy_next_upstream untouched
--   B5: proxy_read_timeout untouched
--   C1: proxy_cache_valid 302 = 0 untouched
--
-- CHUNK ACCUMULATION FIX (critical):
--   body_filter_by_lua receives body in chunks. We MUST accumulate all chunks
--   before parsing, otherwise we corrupt the manifest. Only on the final chunk
--   (ngx.arg[2] == true) do we process.

local ok, err = pcall(function()

-- ═══ GUARD: Only process HLS master playlists ═══════════════════════
-- Check Content-Type: must be application/vnd.apple.mpegurl or application/x-mpegURL or text/
local ct = ngx.header["Content-Type"] or ""
local is_hls = ct:find("mpegurl", 1, true)
                or ct:find("mpegURL", 1, true)
                or ct:find("x-mpegURL", 1, true)
                or ct:find("application/octet-stream", 1, true)

if not is_hls then
    -- Not HLS content, pass through unchanged
    return
end

-- ═══ READ LAB CONFIG (floor thresholds) ═════════════════════════════
local lab_ok, lab = pcall(require, "lab_config")
if not lab_ok then
    -- No lab_config module, pass through
    return
end

local floor_cfg = lab.floor_lock()
if not floor_cfg or not floor_cfg.floor_lock_enabled then
    -- Floor lock disabled in LAB config, pass through
    return
end

-- ═══ CHUNK ACCUMULATION ═════════════════════════════════════════════
-- Use ngx.ctx to accumulate chunks across calls
local chunk = ngx.arg[1]
local eof   = ngx.arg[2]

if not ngx.ctx._floor_lock_buf then
    ngx.ctx._floor_lock_buf = ""
end

if chunk and #chunk > 0 then
    ngx.ctx._floor_lock_buf = ngx.ctx._floor_lock_buf .. chunk
    -- Suppress this chunk from output (we'll emit the full body at EOF)
    ngx.arg[1] = nil
end

if not eof then
    -- More chunks coming, wait
    return
end

-- ═══ FULL BODY AVAILABLE — PROCESS ══════════════════════════════════
local body = ngx.ctx._floor_lock_buf or ""

-- Guard: empty body or not a master playlist
if #body < 20 then
    ngx.arg[1] = body
    return
end

-- Must contain #EXT-X-STREAM-INF to be a master playlist
if not body:find("#EXT-X-STREAM-INF", 1, true) then
    -- Media playlist or non-HLS, pass through
    ngx.arg[1] = body
    return
end

-- ═══ DETERMINE PROFILE FROM REQUEST ═════════════════════════════════
-- Profile comes from:
--   1. Query param ?profile=P0
--   2. Request header X-APE-Profile
--   3. Default: P3
local profile = "P5"  -- v2.1: P5 = most permissive (~1Mbps floor). Players without profile see ALL variants.
local args = ngx.req.get_uri_args()
if args and args.profile then
    profile = tostring(args.profile):upper()
end
local hdr_profile = ngx.req.get_headers()["X-APE-Profile"]
if hdr_profile then
    profile = tostring(hdr_profile):upper()
end

-- Validate profile format
if not profile:match("^P[0-5]$") then
    profile = "P3"
end

-- Get floor for this profile
local floor_bps = lab.floor_bps_for_profile(profile)

-- ═══ PARSE AND FILTER MASTER PLAYLIST ═══════════════════════════════
-- HLS Master Playlist structure:
--   #EXTM3U
--   #EXT-X-STREAM-INF:BANDWIDTH=8000000,CODECS="...",RESOLUTION=1920x1080
--   http://cdn/stream_1080p.m3u8
--   #EXT-X-STREAM-INF:BANDWIDTH=4000000,CODECS="...",RESOLUTION=1280x720
--   http://cdn/stream_720p.m3u8
--
-- We remove pairs where BANDWIDTH < floor_bps.
-- SAFETY: Always keep at least 1 variant (the highest bitrate one).

local lines = {}
for line in body:gmatch("[^\r\n]+") do
    lines[#lines + 1] = line
end

local filtered = {}
local removed_count = 0
local kept_variants = 0
local highest_bw = 0
local highest_idx = -1

-- First pass: identify highest bandwidth variant
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

-- Second pass: filter
local i = 1
while i <= #lines do
    local bw_match = lines[i]:match('#EXT%-X%-STREAM%-INF:.-BANDWIDTH=(%d+)')
    
    if bw_match then
        local bw = tonumber(bw_match) or 0
        
        if bw < floor_bps and i ~= highest_idx then
            -- This variant is below floor AND is not the highest — skip it and its URL
            removed_count = removed_count + 1
            i = i + 1  -- skip the #EXT-X-STREAM-INF line
            if i <= #lines and not lines[i]:match("^#") then
                i = i + 1  -- skip the URL line too
            end
        else
            -- Keep this variant
            filtered[#filtered + 1] = lines[i]
            kept_variants = kept_variants + 1
            i = i + 1
            -- Keep its URL line
            if i <= #lines and not lines[i]:match("^#") then
                filtered[#filtered + 1] = lines[i]
                i = i + 1
            end
        end
    else
        -- Non-variant line (headers, comments, etc.) — always keep
        filtered[#filtered + 1] = lines[i]
        i = i + 1
    end
end

-- SAFETY: If we removed ALL variants, revert to original (should never happen
-- because we always keep highest, but defense-in-depth)
if kept_variants == 0 then
    ngx.arg[1] = body
    return
end

-- ═══ EMIT FILTERED BODY ═════════════════════════════════════════════
if removed_count > 0 then
    -- Add floor-lock metadata comment at the top (after #EXTM3U)
    local result = {}
    local inserted_comment = false
    for _, line in ipairs(filtered) do
        result[#result + 1] = line
        if not inserted_comment and line:match("^#EXTM3U") then
            result[#result + 1] = string.format(
                "## PRISMA FLOOR-LOCK: profile=%s floor=%d bps, removed=%d variants, kept=%d",
                profile, floor_bps, removed_count, kept_variants
            )
            inserted_comment = true
        end
    end
    
    local output = table.concat(result, "\n") .. "\n"
    ngx.arg[1] = output
    
    -- Set response headers for telemetry
    ngx.header["X-APE-Floor-Lock"] = string.format(
        "profile=%s;floor=%d;removed=%d;kept=%d",
        profile, floor_bps, removed_count, kept_variants
    )
    
    -- Persist metrics to shared dict for reactor/widget
    local reactor = ngx.shared.circuit_metrics
    if reactor then
        reactor:set("fl_profile", profile)
        reactor:set("fl_floor_bps", floor_bps)
        reactor:set("fl_removed", removed_count)
        reactor:set("fl_kept", kept_variants)
        reactor:set("fl_highest_bw", highest_bw)
        reactor:set("fl_ts", ngx.now())
        -- Increment total filtered count
        local total = (tonumber(reactor:get("fl_total_filtered")) or 0) + removed_count
        reactor:set("fl_total_filtered", total)
        local total_pass = (tonumber(reactor:get("fl_total_passed")) or 0) + 1
        reactor:set("fl_total_passed", total_pass)
    end
    
    -- Log the filter action
    ngx.log(ngx.NOTICE, string.format(
        "FLOOR_LOCK: %s floor=%dMbps removed=%d kept=%d highest=%dMbps uri=%s",
        profile,
        floor_bps / 1000000,
        removed_count,
        kept_variants,
        highest_bw / 1000000,
        ngx.var.uri or "?"
    ))
else
    -- Nothing to filter — pass original body unchanged
    ngx.arg[1] = body
    
    -- Track passthrough for telemetry
    local reactor = ngx.shared.circuit_metrics
    if reactor then
        local total_pass = (tonumber(reactor:get("fl_total_passed")) or 0) + 1
        reactor:set("fl_total_passed", total_pass)
        reactor:set("fl_ts", ngx.now())
    end
end

end) -- pcall end

if not ok then
    -- PASSTHROUGH on ANY error — NEVER break the pipeline
    -- Restore the accumulated body if we suppressed chunks
    if ngx.ctx and ngx.ctx._floor_lock_buf and ngx.arg[2] then
        ngx.arg[1] = ngx.ctx._floor_lock_buf
    end
    ngx.log(ngx.ERR, "FLOOR_LOCK_ERROR: " .. tostring(err))
end
