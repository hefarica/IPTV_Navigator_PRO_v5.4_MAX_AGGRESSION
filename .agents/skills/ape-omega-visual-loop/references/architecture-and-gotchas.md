# Architecture, file map, wiring, gotchas

## VPS file map (deployed via CI/CD, `/var/www/html/...`)
- `prisma/lib/ape_mesh.php` — the decision mesh + helpers: `ape_mesh_presets` (NeuroBuffer `calculateAggression`→`buildApeTags` + LCEVC + HDR10Plus), `ape_mesh_device_settings` (frame-rate always + `hdr_conversion_mode=1` unconditional), `ape_device_state_by_ip($ip,300s)` (reads `/dev/shm/ape_devstate_<safe_ip>.json`, sanitize `[^0-9A-Fa-f:.]→_`), `ape_qoe_state_by_channel($chId)` (real QoE from `conviva_events` first, server-side proxy fallback, cache 5s), `ape_risk_from_qoe` (qoe_score→risk=100-score, or VST/rebuffer/error thresholds), `ape_pq_db/is_blacklisted/record_incident/blacklist_map` (Phase G).
- `prisma/api/ape-feedforward-stream.php` — F3 SSE (device-keyed/matrícula). Per tick: refresh channel by IP + riskScore from QoE + Phase G auto-trigger (VST>8000→blacklist) + `hdr_conversion=0` if blacklisted. `X-Accel-Buffering:no`, bounded `dur`≤120s, `iv` 1-10.
- `prisma/api/conviva-event.php` — QoE ingest (schema v1.0). Resolves `channel=auto`→real channel from `device_state` by `REMOTE_ADDR`. Dispatches to `ConvivaQoEServer` → `conviva_events` (qoe_score).
- `prisma/api/channel-pq-incident.php` (POST) + `channel-pq-bulk.php` (GET) — Phase G blacklist (mirror of channel-hdcp-*).
- `prisma/lib/conviva_persistence.php` — SQLite at `/opt/netshield/data/conviva.db` (DEFAULT_DB_PATH, public const). Tables: `conviva_events` (channel_id, qoe_score, data_json, idx_channel), `server_side_qoe_metrics` (vst_proxy_avg/max, rebuffer_count, request_count, error_count, bitrate_avg_bps), `channel_hdcp_profile`, `channel_pq_profile` (Phase G). NOTE drift: deployed = 636 lines, repo = 897 (superset).
- `nginx/lua/ape_device_state_writer.lua` — `log_by_lua_file` on `location = /omega/open` (in `ape-visual-v3-2-location.conf`). Writes flat `/dev/shm/ape_devstate_<safe_ip>.json` (NOT subdir; /dev/shm is tmpfs 0777). Log phase = autopista, never blocks, never touches the 302.

## Generator (frontend JS, `frontend/js/ape-v9/`)
- `m3u8-typed-arrays-ultimate.js` (~10K lines, PATH A único producción): emits STREAM-INF via `emitStreamInfFromTruth` (main, via `ape-fallback-resolver.js`) + a legacy path (~L9720, `_vrLegacy`). Bulk fetches `window.APE_HDCP_PROFILE` (channel-hdcp-bulk) + `window.APE_PQ_PROFILE` (channel-pq-bulk, Phase G, TTL 60s). `build_stream_inf()` L6503 is `@deprecated NOT called` (dead code, ignore).
- `ape-fallback-resolver.js` — F0-F5 ladder, `emitStreamInfFromTruth`: unconditional `VIDEO-RANGE=PQ` (HLG if probed) + CICP trifecta; Phase G: if `window.APE_PQ_PROFILE[channelId]==='SDR'` → `VIDEO-RANGE=SDR` WITHOUT BT.2020 CICP (SDR has no HDR color metadata — that's what causes the HDMI HDR handshake black-screen).
- `ape-quality-prober.js` — live manifest probe. node -c ×3 all three after any edit.

## Daemon (Android, `android/ape-crystal-agent/`, aplicador PURO)
SSE device-keyed subscriber (`FeedForwardClient.kt`) → `SettingsApplier.kt` ALLOWLIST (match_content_frame_rate/hdr_conversion_mode/minimal_post_processing_allowed/display_color_mode) → `Settings.*` via WRITE_SECURE_SETTINGS. Does NOT read the player (sideload UID restriction; no READ_LOGS). The "ver" is the ADB plane / VPS proxy, not the daemon.

## conviva_event_schema v1.0
Required: version("1.0"), session_id (8-64 [a-zA-Z0-9_-]), device_id, player (enum OTT_Navigator/TiviMate/ExoPlayer/VLC/Kodi/...), channel{id,name,profile P0-P5}, event_type (first_frame/rebuffer_start/rebuffer_end/bitrate_change/frame_drop/quality_change/error/end_session), timestamp_ms (≥1.7e12). data{} free (bitrate_bps, resolution, codec, vst_ms, rebuffer_duration_ms, ...). `additionalProperties:false` at top + channel; use `data{}` for extras.

## Gotchas (non-obvious, hard-won)
- **Two nginx instances**: stock `/usr/sbin/nginx` (systemd `nginx`=active) serves :80/:443 and has my config; an OpenResty process exists but is inactive/zombie. lua module = `mod-http-lua.conf` (modules-enabled); `log_by_lua_file` works (bandwidth_reactor uses it).
- **CI/CD \r bug**: Windows python `print()` → `\r\n`; `deploy_vps.sh` mapfile rows had `post="nginx-reload\r"` ≠ match → nginx never reloaded. Fixed with `| tr -d '\r'`.
- **D0 false positive**: conviva-event/qoe-flush "502" was a misdiagnosis (they return 400/200 over HTTPS; 301 over plain http→https). Don't "fix" working prod.
- **Test locally**: curl SSE with `--resolve iptv-ape.duckdns.org:443:127.0.0.1` so REMOTE_ADDR=127.0.0.1 matches a seeded `/dev/shm/ape_devstate_127.0.0.1.json`. The generator runs in-browser; smoke it in node with `global.window={...}` + `require('./ape-fallback-resolver.js')`.
- **Health "critical"** after a reload = transient cache-cold (`/dev/shm/nginx_cache` empty with traffic) + the WG-peer warning; not a deploy regression (only rolls back if non-critical→critical).
- **WG peer fix applied**: `/etc/net-shield/authorized_peers.conf` — Cali key rotated Ga1ykV7T→fhQ5lipG (audit whitelist only, doesn't gate the tunnel).

## Council verdict (2026-06-16, 10 PhDs)
WARN, 0 BLOCK, freezeless_avg 7.39. ADB on-device agent passes truth-guards. Must-do = Phase G (done). **Follow-up not done (S3)**: fix `.90`→`.B0` (RFC 6381 constraint_byte) in 3 DRIFTED files — `frontend/vps/cmaf_engine/cmaf_integration_shim.php:270`, `frontend/vps/cmaf_engine/modules/dual_manifest_generator.php:25/310`, `m3u8-quality-upgrader-v2.js:249` (+ quotes-inside-quotes in VIDEO-RANGE L252-253). Main flow (m3u8-typed-arrays + ape-hevc-cascade) is clean (.B0); these frontend/vps copies are desynced and can make ExoPlayer reject HEVC → silent AVC fallback.

## Key commits (2026-06-16, branch feat/adb-generic-visual-enhancement-installer)
07a4c56→3762fff: A1-A3, CI/CD \r fix, Phase B (df63fb5), Phase C (ae5233e), D6 (e3ae37a/cd157f7/0e9cbbd), ADB→URL-2 plane (53bdfb6/584b4e7), on-device agent (81fa82e), Phase G (0620a92/163e45a), mDNS watchdog (3762fff).
