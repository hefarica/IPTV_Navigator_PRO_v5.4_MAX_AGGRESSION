-- ape_metadata_injector.lua
-- Agente 1 (A1): Response Metadata Injector.
-- Hook: header_filter_by_lua_file (POST-upstream). AUTOPISTA: pcall-wrapped.
--
-- Emits X-APE-* PRIVATE metadata headers (hints the player/UI may read). These are
-- NOT toxic headers and do not alter the stream bytes. FREEZELESS.
-- COUNCIL FIX: the PDF's `uri:match("%.(ts|m4s|aac)$")` is broken (Lua patterns have
-- no `|` alternation) -> fixed to explicit suffix checks.

local function ends_with(s, suffix)
  return s:sub(-#suffix) == suffix
end

local function inject_visual_headers()
  local uri = ngx.var.uri or ""
  local ct  = ngx.header["Content-Type"] or ""
  local is_manifest = uri:match("%.m3u8$") ~= nil or ct:find("mpegurl", 1, true) ~= nil
  local is_segment = ends_with(uri, ".ts") or ends_with(uri, ".m4s") or ends_with(uri, ".aac")

  -- Universal visual-quality hints (private metadata).
  ngx.header["X-APE-Visual-Engine"] = "CRYSTAL-UHD-v3.0"
  ngx.header["X-APE-Color-Space"]   = "BT.2020/PQ"
  ngx.header["X-APE-HDR-Profile"]   = "HDR10+DolbyVision"
  ngx.header["X-APE-Max-Resolution"] = "7680x4320"

  if is_manifest then
    ngx.header["X-APE-Manifest-Type"] = "MASTER-ENHANCED"
    ngx.header["X-APE-Floor-Lock"]    = "ACTIVE"
    ngx.header["X-APE-LCEVC-Ready"]   = "ENHANCED-LAYER-INJECTED"
    -- Buffering / bitrate HINTS (player may honour; never the toxic Range header).
    ngx.header["X-Network-Caching"] = "80000"
    ngx.header["X-Max-Bitrate"]     = "300000000"
    ngx.header["X-Min-Bitrate"]     = "80000000"
  elseif is_segment then
    ngx.header["X-APE-Segment-Enhancement"] = "LCEVC-ACTIVE"
    -- Do NOT 10-minute cache live segments (token rotation -> stale). Short, safe.
    if not ngx.header["Cache-Control"] then
      ngx.header["Cache-Control"] = "public, max-age=2"
    end
  end
end

local ok, err = pcall(inject_visual_headers)
if not ok then ngx.log(ngx.WARN, "AGENT1_INJECT_ERR: " .. tostring(err)) end
