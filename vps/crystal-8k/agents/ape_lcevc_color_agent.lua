-- ape_lcevc_color_agent.lua
-- Agente 5 (A5, SIGNALING ONLY): LCEVC detection + HDR/WCG metadata injection.
-- Hook: body_filter_by_lua_file (manifest). AUTOPISTA: pcall, passthrough on error.
--
-- NO transcode here. The actual HDR/LCEVC PIXEL work is the async service
-- (ape_pixel_processor.py), gated by the owner override. This module only emits
-- inert signaling tags (RFC 8216 §6.3.1 -> ignored by players that don't understand them).
-- COUNCIL FIX: the PDF's trailing-comma table lines are removed (valid Lua).

local M = {}

function M.detect_lcevc(codecs_str)
  if not codecs_str then return "NONE" end
  if codecs_str:find("prvc") then return "ENHANCEMENT_PRESENT" end
  if codecs_str:find("lhv1") then return "BASE_WITH_LCEVC" end
  if codecs_str:find("av01") then return "AV1_BASE" end
  if codecs_str:find("hev1") or codecs_str:find("hvc1") then return "HEVC_BASE" end
  return "UNKNOWN"
end

function M.lcevc_base_codec(codecs_str)
  local d = M.detect_lcevc(codecs_str)
  if d == "ENHANCEMENT_PRESENT" then return "LCEVC_ACTIVE" end
  if d == "AV1_BASE" then return "AV1" end       -- LCEVC over AV1 = best quality
  return "HEVC"                                   -- LCEVC over HEVC = widest compat
end

-- Inject HDR10+/DV + LCEVC SDK signaling right after #EXTM3U (inert metadata).
function M.inject_hdr_metadata(body_lines)
  local out, done = {}, false
  for _, line in ipairs(body_lines) do
    out[#out + 1] = line
    if not done and line:match("^#EXTM3U") then
      done = true
      out[#out + 1] = "#APE-HDR:PROFILE=HDR10+DOLBY_VISION"
      out[#out + 1] = "#APE-COLOR:PRIMARIES=BT2020"
      out[#out + 1] = "#APE-COLOR:TRANSFER=PQ"
      out[#out + 1] = "#APE-COLOR:MATRIX=BT2020NC"
      out[#out + 1] = "#APE-COLOR:NPL=1000"
      out[#out + 1] = "#APE-COLOR:MAXCLL=1000"
      out[#out + 1] = "#APE-COLOR:MAXFALL=400"
      out[#out + 1] = "#LCEVC-HTML5-SDK:ACTIVE"
      for i = 0, 12 do
        out[#out + 1] = "#VNOVA-LCEVC-CONFIG-B64:CRYSTAL-" .. i
      end
    end
  end
  return out
end

return M
