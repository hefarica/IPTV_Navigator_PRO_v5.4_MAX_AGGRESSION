-- ARA-X floor filter (STAGED, NOT INCLUDED IN NGINX).
-- Body filter for a master playlist only. It never touches /lists/ or media playlists.
-- If no variant reaches the floor, it keeps the highest variant (does not black-screen).
-- Activation requires an explicit location include; no reload is performed here.
local function split_lines(s)
    local out, i = {}, 1
    while true do
        local nl = s:find("\n", i, true)
        if not nl then
            out[#out + 1] = s:sub(i)
            break
        end
        out[#out + 1] = s:sub(i, nl - 1)
        i = nl + 1
    end
    return out
end

local function parse_master(body)
    local lines = split_lines(body)
    local out, entries = {}, {}
    local i = 1
    while i <= #lines do
        local line = lines[i]
        if line:match("^#EXT%-X%-STREAM%-INF") then
            local bw = tonumber(line:match("BANDWIDTH=(%d+)")) or 0
            local uri = lines[i + 1] or ""
            if uri ~= "" and not uri:match("^#") then
                entries[#entries + 1] = { tag = line, uri = uri, bw = bw }
                i = i + 2
            else
                out[#out + 1] = line
                i = i + 1
            end
        else
            out[#out + 1] = line
            i = i + 1
        end
    end
    return out, entries
end

local function filter_body(body, floor_kbps)
    local out, entries = parse_master(body)
    if #entries == 0 then return body end

    local kept, max = {}, nil
    for _, e in ipairs(entries) do
        if not max or e.bw > max.bw then max = e end
        if e.bw >= floor_kbps then kept[#kept + 1] = e end
    end
    if #kept == 0 then kept = { max } end

    local res = { table.concat(out, "\n") }
    for _, e in ipairs(kept) do
        res[#res + 1] = e.tag
        res[#res + 1] = e.uri
    end
    return table.concat(res, "\n")
end

local chunk = ngx.arg[1]
if chunk then
    ngx.ctx.ara_floor_buf = (ngx.ctx.ara_floor_buf or "") .. chunk
end
if ngx.arg[2] then
    local buf = ngx.ctx.ara_floor_buf or ""
    ngx.ctx.ara_floor_buf = nil
    local floor = tonumber(ngx.var.arg_min_kbps or "") or 13000
    ngx.arg[1] = filter_body(buf, floor)
end
