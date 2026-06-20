-- ape_manifest_rewriter.lua
-- Agente 4 (A4): CMAF/HLS Manifest Rewriter. Hook: body_filter_by_lua_file.
-- EXTENDS (never replaces) combined_body_filter.lua. AUTOPISTA: pcall, passthrough on error.
--
-- COUNCIL FIXES vs the PDF:
--   * GOLDEN RULE: STREAM-INF CODECS= uses hvc1.* (NOT hev1.*). PDF used hev1 -> FIXED.
--   * Cardinal Law 1: 4K declares L153 (5.1), NOT L93 (3.1). PDF used L93 -> FIXED.
--   * Fixed the PDF's broken Lua patterns (unescaped quote in CODECS match).
--   * Single-URL awareness: a synthetic UHD variant REUSES the existing top media-playlist
--     URL (virtual-4K metadata, owner-permitted) -> never fabricates a new channel URL.

local M = {}

local HEVC_4K = "hvc1.2.4.L153.B0"   -- Main10 (.2), level 5.1 = 4K@60 ceiling
local AUDIO   = "mp4a.40.2"

function M.parse_master(body)
  local variants, global_tags = {}, {}
  for i = 1, #body do
    local line = body[i]
    if line:match("^#EXT%-X%-STREAM%-INF") then
      local v = {
        line_idx   = i,
        bandwidth  = tonumber(line:match("BANDWIDTH=(%d+)")) or 0,
        resolution = line:match("RESOLUTION=([%dx]+)"),
        codecs     = line:match('CODECS="([^"]+)"'),
        frame_rate = line:match("FRAME%-RATE=([%d%.]+)"),
      }
      local nxt = body[i + 1]
      if nxt and not nxt:match("^#") then v.url = nxt end
      variants[#variants + 1] = v
    elseif line:match("^#") then
      global_tags[#global_tags + 1] = line
    end
  end
  return { variants = variants, global_tags = global_tags }
end

function M.inject_uhd_variant(variants)
  for _, v in ipairs(variants) do
    if v.resolution and v.resolution:match("^3840") then return variants end
  end
  local top = variants[1]
  if not top or not top.url then return variants end
  variants[#variants + 1] = {
    bandwidth  = 30000000,
    resolution = "3840x2160",
    codecs     = HEVC_4K .. "," .. AUDIO,
    frame_rate = "60.000",
    url        = top.url,        -- reuse existing media-playlist URL (virtual-4K metadata)
    synthetic  = true,
  }
  return variants
end

function M.rewrite_for_crystal(body)
  local parsed = M.parse_master(body)
  local out = {}
  for _, tag in ipairs(parsed.global_tags) do out[#out + 1] = tag end

  parsed.variants = M.inject_uhd_variant(parsed.variants)
  for _, v in ipairs(parsed.variants) do
    v.bandwidth = math.max(v.bandwidth or 0, 15000000)
    if not v.codecs or not v.codecs:find("hvc1") then
      v.codecs = HEVC_4K .. "," .. AUDIO   -- HEVC-first, hvc1 ONLY in STREAM-INF
    end
    local tag = string.format(
      '#EXT-X-STREAM-INF:BANDWIDTH=%d,CODECS="%s",RESOLUTION=%s',
      v.bandwidth, v.codecs, v.resolution or "3840x2160")
    if v.frame_rate then tag = tag .. ",FRAME-RATE=" .. v.frame_rate end
    out[#out + 1] = tag
    if v.url then out[#out + 1] = v.url end   -- single URL per variant
  end

  out[#out + 1] = "#EXT-X-APE-VERSION:LCEVC-BASE-CODEC:HEVC"
  out[#out + 1] = "#APE-CRYSTAL-MANIFEST:ENHANCED"
  return out
end

return M
