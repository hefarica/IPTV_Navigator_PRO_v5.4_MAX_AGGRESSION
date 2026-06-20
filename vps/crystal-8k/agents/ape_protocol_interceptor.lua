-- ape_protocol_interceptor.lua
-- Agente 2 (A2): Stream Protocol Interceptor. Hook: body_filter_by_lua_file.
-- Parses + normalizes EXTVLCOPT/EXTHTTP/EXTKODIPROP/STREAM-INF and generates
-- per-player Crystal directives. AUTOPISTA: fail-silent (pcall), passthrough on error.
--
-- Truth-guard (GOLDEN RULE): hvc1.* stays in manifest CODECS=; hev1.* only appears
-- inside KODIPROP / EXTVLCOPT runtime hints (never crossed).

local M = {}

local DIRECTIVES = {
  EXTVLCOPT = {
    pattern = "#EXTVLCOPT:(.+)",
    extract = function(val)
      local k, v = val:match("([%w%-]+)=(.+)")
      if k then return { key = k, value = v } end
      return { raw = val }
    end,
  },
  EXTHTTP = {
    pattern = "#EXTHTTP:(.+)",
    extract = function(val)
      local ok, data = pcall(function() return require("cjson").decode(val) end)
      if ok then return data end
      return { raw = val }
    end,
  },
  KODIPROP = {
    pattern = "#EXTKODIPROP:(.+)",
    extract = function(val)
      local k, v = val:match("([%w%-%.]+)=(.+)$")
      if k then return { key = k, value = v } end
      return { raw = val }
    end,
  },
  STREAM_INF = {
    pattern = "#EXT%-X%-STREAM%-INF:(.+)",
    extract = function(val)
      return {
        bandwidth  = tonumber(val:match("BANDWIDTH=(%d+)")),
        resolution = val:match("RESOLUTION=([%dx]+)"),
        codecs     = val:match('CODECS="([^"]+)"'),
      }
    end,
  },
}

function M.parse(body)
  local result = {}
  for line in body:gmatch("[^\r\n]+") do
    for name, def in pairs(DIRECTIVES) do
      local val = line:match(def.pattern)
      if val then
        local parsed = def.extract(val)
        parsed.directive = name
        result[#result + 1] = parsed
      end
    end
  end
  return result
end

-- Per-player Crystal directive generation. hev1.* allowed ONLY in these runtime hints.
function M.crystal_directives_for(player)
  local p = (player or ""):lower()
  if p:find("vlc") then
    return {
      "#EXTVLCOPT:codec=hev1,amcv,vvc",
      "#EXTVLCOPT:color-primaries=bt2020",
      "#EXTVLCOPT:hw-dec=all",
      "#EXTVLCOPT:video-filter=chroma_I444",
      "#EXTVLCOPT:deinterlace=bwdif",
    }
  elseif p:find("kodi") then
    return {
      "#EXTKODIPROP:inputstream.adaptive.manifest_type=hls",
      "#EXTKODIPROP:gui-framerate-decouple=true",
      "#EXTKODIPROP:match-frame-rate=true",
    }
  elseif p:find("tivimate") or p:find("exoplayer") then
    return { '#EXTHTTP:{"X-Bypass-ABR":true,"X-Max-Bitrate":300000000}' }
  end
  return {}
end

return M
