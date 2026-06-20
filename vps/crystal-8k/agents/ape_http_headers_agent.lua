-- ape_http_headers_agent.lua
-- Agente 1 (A1): HTTP Headers & Metadata Mastery — REQUEST FORGE.
-- Hook: access_by_lua_file (PRE-upstream). AUTOPISTA: never blocks, pcall-wrapped.
--
-- COUNCIL FIXES vs the PDF spec:
--   * DROPPED `X-DSCP-Marking: AF41`  -> AF41/QOS-DSCP-OVERRIDE is a BANNED directive
--     (407 / micro-cuts) per the visual-supremacy orchestrator's banned list.
--   * DROPPED `Connection: keep-alive` to the upstream -> Xtream upstream keepalive is
--     forbidden (509 / stale connection reuse).
--   * KEPT  Accept-Encoding: identity (doctrine-correct), UA rotation, X-APE-Profile.

local agent1 = {}

-- Player User-Agents only (never a browser UA -> shield/anti-hotlink doctrine).
local UA_POOL = {
  "ExoPlayer/2.19.1 (Linux;Android 14) MediaCore/1.0",
  "Dalvik/2.1.0 (Linux; U; Android 12; SHIELD Android TV)",
  "VLC/3.0.21 LibVLC/3.0.21",
  "Kodi/21.0 (Windows NT 10.0; Win64; x64) App/2.3.14",
  "Lavf/60.16.100",
  "AppleCoreMedia/1.0.0.21F90 (iPhone; U; CPU OS 18_5)",
  "TiviMate/4.2.0 (Android TV)",
}

function agent1.rotate_ua()
  -- math.random without an explicit seed is fine here (per-worker entropy is enough,
  -- and we only need to vary the UA, not cryptographic randomness).
  local ua = UA_POOL[math.random(1, #UA_POOL)]
  ngx.var.sentinel_ua = ua            -- consumed by proxy_set_header User-Agent $sentinel_ua
  return ua
end

function agent1.forge_request()
  -- Anti-compression so manifests stay parseable by the body_filter agents.
  ngx.req.set_header("Accept-Encoding", "identity")
  -- Profile passthrough (P0..P5) used by downstream agents; default P3.
  local args = ngx.req.get_uri_args()
  ngx.req.set_header("X-APE-Profile", args["profile"] or "P3")
  agent1.rotate_ua()
  -- NOTE: no DSCP AF41 (banned), no upstream keepalive (forbidden). FREEZELESS.
  return true
end

local ok, err = pcall(agent1.forge_request)
if not ok then ngx.log(ngx.WARN, "AGENT1_FORGE_ERR: " .. tostring(err)) end

return agent1
