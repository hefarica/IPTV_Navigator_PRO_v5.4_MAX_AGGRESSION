-- ============================================================================
-- APE VISUAL EXTREME — SCIENCE-SAFE Reactor v7.0
-- Hook: log_by_lua_file
-- Fixes the unsafe behavior of increasing requested bitrate as bandwidth drops.
-- ============================================================================
local ok, err = pcall(function()
    local dict = ngx.shared.circuit_metrics
    if not dict then return end

    local rt = tonumber(ngx.var.request_time) or 0
    local bytes = tonumber(ngx.var.bytes_sent) or 0
    local status = tonumber(ngx.var.status) or 0
    local up = tostring(ngx.var.upstream_response_time or '')
    local upstream_time = tonumber(up:match('([%d%.]+)')) or rt

    if status < 200 or status >= 400 or bytes < 1024 or upstream_time <= 0.001 then return end

    local bps = math.floor((bytes * 8) / upstream_time)
    local prev = tonumber(dict:get('vss_bw_ewma_bps')) or bps
    local ewma = math.floor(0.25 * bps + 0.75 * prev)

    local profile, max_variant_bps, prefetch = 'P3', 12000000, 2
    if ewma >= 90000000 then
        profile, max_variant_bps, prefetch = 'P0', 80000000, 4
    elseif ewma >= 55000000 then
        profile, max_variant_bps, prefetch = 'P1', 45000000, 3
    elseif ewma >= 30000000 then
        profile, max_variant_bps, prefetch = 'P2', 28000000, 3
    elseif ewma >= 16000000 then
        profile, max_variant_bps, prefetch = 'P3', 14000000, 2
    elseif ewma >= 8000000 then
        profile, max_variant_bps, prefetch = 'P4', 7000000, 1
    else
        profile, max_variant_bps, prefetch = 'P5', 3500000, 0
    end

    dict:set('vss_bw_instant_bps', bps, 300)
    dict:set('vss_bw_ewma_bps', ewma, 300)
    dict:set('vss_profile', profile, 300)
    dict:set('vss_max_variant_bps', max_variant_bps, 300)
    dict:set('vss_prefetch_segments', prefetch, 300)
    dict:set('vss_ts', ngx.now(), 300)
end)
if not ok then ngx.log(ngx.WARN, 'APE_VISUAL_SCIENCE_REACTOR_ERR: ' .. tostring(err)) end
