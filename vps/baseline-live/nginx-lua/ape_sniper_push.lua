-- ════════════════════════════════════════════════════════════════════════════
-- ape_sniper_push.lua — the SNIPER PUSH hook (server-seen errors → events spool).
--
-- Two responsibilities, BOTH FREEZELESS / fire-and-forget / pcall'd:
--
--   (1) M.on_upstream_response()  — called from upstream_response.lua's LOG phase.
--       When the edge SAW a bad ngx.status (403/404/509/504/000/502), we append a
--       canonical sniper event to /dev/shm/ape_sniper_events.jsonl so ape-sniper-rs
--       heals it even BEFORE the player notices. This is telemetry-only: it NEVER
--       runs on the request path, NEVER ngx.exit, NEVER opens a circuit. A failed
--       append is swallowed (the autopista must not error because a spool is full).
--
--   (2) M.read_decision(channel_id) — called by ape_header_value_publisher.lua (a
--       worker-0 timer, OFF the request path) to read ape-sniper-rs's decision spool
--       with a STALENESS GUARD (same pattern as lhs_get_channel_live). If the spool
--       is missing / stale / unparseable, returns nil → the caller falls back
--       last-good → static-default → plain passthrough. The REQUEST path never calls
--       this; the optional UDS query (M.query_uds) carries a hard 800µs timeout +
--       passthrough-on-timeout for callers that want the freshest decision.
--
-- LEGAL: this hook only WRITES error telemetry and READS decisions. It has no power
-- to rotate a host itself — Rust owns the provider→own-siblings map. Nothing here can
-- emit a toxic header or weaken auth; the value overlay enforces that downstream.
-- ════════════════════════════════════════════════════════════════════════════

local M = {}

local EVENTS_SPOOL    = "/dev/shm/ape_sniper_events.jsonl"
local DECISIONS_SPOOL = "/dev/shm/ape_sniper_decisions.json"
local UDS_ADDR        = "unix:/dev/shm/ape-sniper.sock"   -- optional SECONDARY query path
local STALE_AFTER_S   = 8                                 -- decisions older than this are ignored
local UDS_TIMEOUT_MS  = 1                                 -- hard cap; ngx min granularity is 1ms (budget intent: sub-ms)

local cjson_ok, cjson = pcall(require, "cjson.safe")
if not cjson_ok then cjson = nil end

-- ── tiny JSON encode for the event line (avoid a hard cjson dep on the write path) ──
local function esc(s)
  s = tostring(s or "")
  s = s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', ' '):gsub('\r', ' ')
  return s
end

-- Build the canonical sniper event line (one JSON object, newline-terminated, O_APPEND atomic).
-- {"ts":N,"channel_id":"..","error_code":"..","profile":"P..","host":"..","vst_ms":N}
local function build_event_line(ev)
  local parts = {
    '{"ts":', tostring(ngx.time()),
    ',"channel_id":"', esc(ev.channel_id), '"',
    ',"error_code":"', esc(ev.error_code), '"',
    ',"profile":"', esc(ev.profile or "P3"), '"',
    ',"host":"', esc(ev.host or ""), '"',
  }
  if ev.vst_ms ~= nil then
    parts[#parts + 1] = ',"vst_ms":'
    parts[#parts + 1] = tostring(math.floor(tonumber(ev.vst_ms) or 0))
  end
  parts[#parts + 1] = '}\n'
  return table.concat(parts)
end

-- Append one event to the spool. Fire-and-forget, silent-fail. Uses a plain Lua file
-- handle in O_APPEND ("a"): on tmpfs this is an atomic small write; no flock needed for
-- a single line < PIPE_BUF, and a contended/failed open is simply dropped (autopista).
local function append_event(ev)
  if not ev or not ev.channel_id or ev.channel_id == "" then return false end
  local line = build_event_line(ev)
  local f = io.open(EVENTS_SPOOL, "a")
  if not f then return false end          -- spool missing/full → drop, never error
  f:write(line)
  f:close()
  return true
end

-- ── (1) LOG-phase hook: server-seen bad status → sniper event ───────────────
-- Call from upstream_response.lua AFTER it has already done its telemetry-only incr.
-- `ctx` carries what the log phase knows: status, channel_id, profile, host, rt.
-- EVERYTHING here is wrapped by the caller in pcall; we also guard internally.
function M.on_upstream_response(ctx)
  if not ctx then return end
  local status = tonumber(ctx.status) or 0
  -- Map ngx.status / empty upstream_response_time → canonical error_code.
  local code
  if status == 403 then code = "403"
  elseif status == 404 then code = "404"
  elseif status == 509 then code = "509"
  elseif status == 504 then code = "504"
  elseif status == 502 or status == 0 or ctx.unreachable then code = "000"
  else return end   -- 2xx/3xx and anything else: nothing to heal, stay telemetry-only.

  append_event({
    channel_id = ctx.channel_id or ctx.stream_id or "",
    error_code = code,
    profile    = ctx.profile or "P3",
    host       = ctx.host or "",
    vst_ms     = ctx.rt_ms,   -- upstream_response_time*1000 if available
  })
end

-- Convenience: let a PHP/edge caller push a player-side event through this same path
-- (used by the optional Lua-side mirror; the PHP endpoint writes the spool directly).
function M.push_player_event(channel_id, error_code, profile, host, vst_ms)
  return append_event({
    channel_id = channel_id, error_code = error_code,
    profile = profile, host = host, vst_ms = vst_ms,
  })
end

-- ── (2) Decision reader (publisher/orchestrator side, OFF request path) ──────
-- Returns the full decoded decisions table {channels={...}, generated_ts=N} or nil.
-- STALENESS GUARD: a spool older than STALE_AFTER_S is treated as absent → caller
-- degrades to last-good / static-default / passthrough. Never throws.
function M.read_decisions()
  if not cjson then return nil end
  local f = io.open(DECISIONS_SPOOL, "r")
  if not f then return nil end
  local body = f:read("*a")
  f:close()
  if not body or body == "" then return nil end
  local ok, doc = pcall(cjson.decode, body)
  if not ok or type(doc) ~= "table" then return nil end
  local gen = tonumber(doc.generated_ts) or 0
  if gen <= 0 or (ngx.time() - gen) > STALE_AFTER_S then
    return nil   -- stale → passthrough discipline
  end
  return doc
end

-- Read one channel's decision block (nil if absent/stale). The publisher folds the
-- returned {host, ua_idx, referer, tier, codec, jump_to_live, buffer_s, ...} into
-- /dev/shm/ape_header_values.json; list_header_store.php overlays the VALUEs.
function M.read_decision(channel_id)
  if not channel_id or channel_id == "" then return nil end
  local doc = M.read_decisions()
  if not doc or type(doc.channels) ~= "table" then return nil end
  local dec = doc.channels[tostring(channel_id)]
  -- ═══ OVERRIDE ANTI-FREEZE (Buffer Perpetuo) ═══
  -- Si el sniper en Rust envía r403_rotate_host_ua_nonce (que causa 403 en cascada
  -- al invalidar el token en el proveedor), lo neutralizamos aquí y lo forzamos
  -- a r403_m3u8_refresh_only. Esto permite curar el canal sin perder la sesión.
  if dec and dec.rule == "r403_rotate_host_ua_nonce" then
      dec.rule = "r403_m3u8_refresh_only"
      dec.jump_to_live = false
      dec.buffer_s = 8
  end
  return dec
end

-- ── Optional SECONDARY: UDS query with a HARD timeout + passthrough fallback ─
-- For a caller (orchestrator timer) that wants the freshest decision without waiting
-- for the 2s publisher tick. NEVER used on the request path. On ANY error/timeout we
-- return nil so the caller uses the spool / last-good — the budget is sub-ms; ngx's
-- timeout granularity floors at 1ms, which is the hard cap here.
function M.query_uds(channel_id)
  if not channel_id or channel_id == "" then return nil end
  local sock = ngx.socket.tcp()
  sock:settimeouts(UDS_TIMEOUT_MS, UDS_TIMEOUT_MS, UDS_TIMEOUT_MS)
  local ok = sock:connect(UDS_ADDR)
  if not ok then return nil end
  -- protocol: one line "GET <channel_id>\n" → one JSON line back.
  sock:send("GET " .. tostring(channel_id) .. "\n")
  local line, err = sock:receive("*l")
  sock:setkeepalive(1000, 4)   -- pool, but the request path never touches this anyway
  if err or not line or not cjson then return nil end
  local good, dec = pcall(cjson.decode, line)
  if not good or type(dec) ~= "table" then return nil end
  return dec
end

return M
