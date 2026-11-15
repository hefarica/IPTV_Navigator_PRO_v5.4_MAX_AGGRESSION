-- ============================================================================
-- APE VISUAL EXTREME — SCIENCE-SAFE v7.0
-- OpenResty body_filter_by_lua_file
-- Goal: visual preference without breaking ABR/player compatibility.
-- Doctrine: passthrough on failure, no fake metadata, no hard removal by default.
-- ============================================================================

local chunk = ngx.arg[1]
local eof   = ngx.arg[2]

local MAX_BODY_BYTES = tonumber(ngx.var.ape_visual_max_body_bytes or '') or (2 * 1024 * 1024)

if not ngx.ctx._ape_vss_buf then ngx.ctx._ape_vss_buf = {} end
if not ngx.ctx._ape_vss_len then ngx.ctx._ape_vss_len = 0 end

if chunk and #chunk > 0 then
    ngx.ctx._ape_vss_len = ngx.ctx._ape_vss_len + #chunk
    if ngx.ctx._ape_vss_len > MAX_BODY_BYTES then
        -- Body too large for safe buffering in a body filter. Passthrough.
        ngx.arg[1] = table.concat(ngx.ctx._ape_vss_buf or {}) .. chunk
        ngx.ctx._ape_vss_buf = nil
        ngx.ctx._ape_vss_passthrough = true
        return
    end
    ngx.ctx._ape_vss_buf[#ngx.ctx._ape_vss_buf + 1] = chunk
    ngx.arg[1] = nil
end

if not eof then return end
if ngx.ctx._ape_vss_passthrough then return end

local body = table.concat(ngx.ctx._ape_vss_buf or {})
ngx.ctx._ape_vss_buf = nil

local function passthrough()
    ngx.arg[1] = body
end

if #body < 20 or not body:find('#EXTM3U', 1, true) then
    return passthrough()
end

local ok_main, err_main = pcall(function()
    if ngx.status ~= 200 then return end

    local ct = tostring(ngx.header['Content-Type'] or ''):lower()
    local uri = tostring(ngx.var.uri or '')
    local looks_hls = ct:find('mpegurl', 1, true) or ct:find('mpegurl', 1, true) or uri:find('%.m3u8') or body:find('#EXTM3U', 1, true)
    if not looks_hls then return end
    if not body:find('#EXT%-X%-STREAM%-INF') then return end

    local function safe_upper(x)
        x = tostring(x or ''):upper()
        if x:match('^P[0-5]$') then return x end
        return nil
    end

    local function stream_id_from_uri(u)
        -- Common Xtream/HLS forms: /live/USER/PASS/12345.m3u8 or /movie/.../123.mp4
        local id = u:match('/live/[^/]+/[^/]+/([^/%.%?]+)%.m3u8')
                or u:match('/live/[^/]+/[^/]+/([^/%?]+)')
                or u:match('/([^/%?]+)%.m3u8$')
        if id then return tostring(id):gsub('[^0-9A-Za-z_.%-]', '') end
        return nil
    end

    local function load_profile_map()
        local path = ngx.var.ape_channel_profiles_json or '/etc/ape-uhdx/channel_profiles.json'
        local dict = ngx.shared.circuit_metrics
        local cache_key = 'vss:profile_map'
        if dict then
            local cached = dict:get(cache_key)
            if cached then return cached end
        end
        local f = io.open(path, 'rb')
        if not f then return nil end
        local txt = f:read('*a'); f:close()
        if dict then dict:set(cache_key, txt, 10) end
        return txt
    end

    local function profile_from_json_for_stream(stream_id)
        if not stream_id or stream_id == '' then return nil end
        local txt = load_profile_map()
        if not txt or #txt < 2 then return nil end
        local ok_cjson, cjson = pcall(require, 'cjson.safe')
        if not ok_cjson or not cjson then return nil end
        local obj = cjson.decode(txt)
        if type(obj) ~= 'table' then return nil end
        local direct = obj[stream_id]
        if type(direct) == 'string' then return safe_upper(direct) end
        if type(obj.streams) == 'table' and type(obj.streams[stream_id]) == 'string' then
            return safe_upper(obj.streams[stream_id])
        end
        if type(obj.streams) == 'table' and type(obj.streams[stream_id]) == 'table' then
            return safe_upper(obj.streams[stream_id].profile)
        end
        return nil
    end

    local function profile_from_devstate()
        local ip = tostring(ngx.var.remote_addr or ''):gsub('[^0-9A-Fa-f:.]', '')
        if ip == '' then return nil end
        local path = '/dev/shm/ape_devstate_' .. ip .. '.json'
        local f = io.open(path, 'rb')
        if not f then return nil end
        local txt = f:read('*a'); f:close()
        local ok_cjson, cjson = pcall(require, 'cjson.safe')
        if not ok_cjson or not cjson then return nil end
        local obj = cjson.decode(txt)
        if type(obj) == 'table' then
            return safe_upper(obj.profile or obj.visual_profile or obj.ape_profile)
        end
        return nil
    end

    local headers = ngx.req.get_headers() or {}
    local args = ngx.req.get_uri_args() or {}
    local sid = stream_id_from_uri(uri)
    local profile = safe_upper(headers['X-APE-Profile'])
                 or safe_upper(args.profile)
                 or profile_from_json_for_stream(sid)
                 or profile_from_devstate()
                 or 'P2'

    local function codec_rank(codecs)
        local c = tostring(codecs or ''):lower()
        if c:find('dvh1', 1, true) or c:find('dvhe', 1, true) then return 115 end
        if c:find('hvc1.2', 1, true) then return 110 end -- HEVC Main10 in STREAM-INF should be hvc1
        if c:find('hvc1', 1, true) then return 100 end
        if c:find('av01', 1, true) then return 95 end
        if c:find('vp09', 1, true) then return 70 end
        if c:find('avc1.64', 1, true) or c:find('avc1.640') then return 45 end
        if c:find('avc1', 1, true) or c:find('avc3', 1, true) then return 35 end
        return 50
    end

    local function parse_res(res)
        local w, h = tostring(res or ''):match('(%d+)x(%d+)')
        return tonumber(w) or 0, tonumber(h) or 0
    end

    local function res_tier(w, h)
        local px = w * h
        if px >= 7680 * 4320 then return '8K', 80 end
        if px >= 3840 * 2160 then return '4K', 60 end
        if px >= 2560 * 1440 then return 'QHD', 40 end
        if px >= 1920 * 1080 then return 'FHD', 25 end
        if px >= 1280 * 720 then return 'HD', 10 end
        return 'SD', 0
    end

    local function bpppf(bps, w, h, fps)
        fps = fps > 0 and fps or 30
        if bps <= 0 or w <= 0 or h <= 0 then return 0 end
        return bps / (w * h * fps)
    end

    local lines = {}
    for line in body:gmatch('[^\r\n]+') do lines[#lines + 1] = line end

    local header, variants = {}, {}
    local started = false
    local i = 1
    while i <= #lines do
        local line = lines[i]
        if line:find('#EXT%-X%-STREAM%-INF') then
            started = true
            local url = ''
            if i + 1 <= #lines and not lines[i + 1]:match('^#') then
                url = lines[i + 1]
                i = i + 1
            end
            local bw = tonumber(line:match('BANDWIDTH=(%d+)')) or 0
            local abw = tonumber(line:match('AVERAGE%-BANDWIDTH=(%d+)')) or bw
            local codecs = line:match('CODECS="([^"]+)"') or ''
            local res = line:match('RESOLUTION=(%d+x%d+)') or ''
            local fps = tonumber(line:match('FRAME%-RATE=([%d%.]+)')) or 0
            local w, h = parse_res(res)
            local tier, rscore = res_tier(w, h)
            variants[#variants + 1] = {
                inf=line, url=url, bw=bw, abw=abw, codecs=codecs, res=res, fps=fps,
                w=w, h=h, tier=tier, rscore=rscore, crank=codec_rank(codecs), bpp=bpppf(abw, w, h, fps)
            }
        else
            if not started then header[#header + 1] = line end
        end
        i = i + 1
    end

    if #variants < 2 then return end

    local profile_weight = { P0=1.20, P1=1.15, P2=1.08, P3=1.00, P4=0.92, P5=0.85 }
    local pw = profile_weight[profile] or 1.0

    local function science_score(v)
        -- Prefer real resolution + compatible efficient codec + enough bpp/frame.
        -- BPP is capped to avoid blindly chasing bitrate noise.
        local bpp_score = math.min(v.bpp * 10000, 120)
        local fps_score = v.fps >= 59 and 12 or (v.fps >= 49 and 10 or (v.fps >= 29 and 5 or 0))
        local hdr_bonus = (v.inf:find('VIDEO%-RANGE=PQ') or v.inf:find('HDR=')) and 8 or 0
        return (v.rscore * 100 + v.crank * 12 + bpp_score + fps_score + hdr_bonus) * pw
    end

    for _, v in ipairs(variants) do v.score = science_score(v) end

    table.sort(variants, function(a, b)
        if a.score ~= b.score then return a.score > b.score end
        return a.abw > b.abw
    end)

    -- Default: preserve all variants. Optional aggressive mode may move clearly unsafe low bitrate variants last,
    -- but never deletes AVC fallback unless explicitly enabled and at least 2 variants remain per tier.
    local mode = tostring(headers['X-APE-Visual-Mode'] or args.visual_mode or 'safe'):lower()
    local output_variants = variants
    local removed = 0
    if mode == 'aggressive' then
        local kept = {}
        for _, v in ipairs(variants) do
            local too_starved_4k = (v.tier == '4K' and v.abw > 0 and v.abw < 9000000)
            local fake_8k_starved = (v.tier == '8K' and v.abw > 0 and v.abw < 25000000)
            if too_starved_4k or fake_8k_starved then
                removed = removed + 1
            else
                kept[#kept + 1] = v
            end
        end
        if #kept >= 2 then output_variants = kept else removed = 0 end
    end

    local out = {}
    for _, l in ipairs(header) do out[#out + 1] = l end
    for _, v in ipairs(output_variants) do
        out[#out + 1] = v.inf
        if v.url and v.url ~= '' then out[#out + 1] = v.url end
    end
    body = table.concat(out, '\n') .. '\n'

    local top = output_variants[1]
    ngx.header['X-APE-Visual-Science'] = string.format(
        'v=7;profile=%s;stream_id=%s;mode=%s;variants=%d;removed=%d;top=%s/%s/%d;bpppf=%.6f',
        profile, sid or 'none', mode, #output_variants, removed, top.res or '', top.codecs or '', top.abw or 0, top.bpp or 0
    )
end)

if not ok_main then
    ngx.log(ngx.WARN, 'APE_VISUAL_SCIENCE_SAFE_ERR: ' .. tostring(err_main))
end

ngx.arg[1] = body
