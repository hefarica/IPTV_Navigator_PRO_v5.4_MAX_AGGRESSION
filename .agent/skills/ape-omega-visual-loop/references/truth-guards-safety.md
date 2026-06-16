# Truth-guards, doctrines, hardware safety

## Truth-guards (enforced; never violate)
- **Players blind to `#EXT-X-APE-*`** (RFC 8216 §6.3.1 ignores unknown tags). An M3U8 tag does NOT execute code, install apps, or enable ADB. Only EXTVLCOPT/KODIPROP (VLC/Kodi) and ADB Settings (on-device daemon) actually apply. The VPS selects variants/metadata/QoE, NOT pixels.
- **ADB cannot be remote-enabled** from a playlist/VPS. It needs a host with ADB installed + RSA-authorized (per-host). An on-device agent re-enabling `adb_wifi_enabled` from its OWN already-authorized shell is NOT remote-enable (local self-heal) — allowed.
- **GOLDEN RULE**: `hvc1.*` only in STREAM-INF `CODECS=`; `hev1.*` only in KODIPROP/EXTVLCOPT. Never crossed.
- **Ley Cardinal 1 (Nivel↔Resolución)**: a codec Level must carry its declared resolution. L150=4K@30, L153=4K@60 (techo común), L186=8K@120. Never level<resolution (that was the 2026-06-08 freeze: L153 declared on 8K@120).
- **No fake HDR/CMAF/SUPPLEMENTAL-CODECS** in player-facing fields without evidence — EXCEPT the user's explicit unconditional-PQ override (below), which is mitigated by Phase G.

## The unconditional-PQ override (user decision, LOCKED) + Phase G mitigation
The owner explicitly overrode the "VIDEO-RANGE=PQ only if probed" truth-guard: **emit `VIDEO-RANGE=PQ` UNCONDITIONALLY** in STREAM-INF (even on SDR) + `hdr_conversion_mode=1` unconditional, as the declaration of the SDR→HDR display enhancement the daemon materializes. The doctrine in CLAUDE.md was changed accordingly. This is MAX IMAGE FIRST. The honest reconciliation: it does NOT change CODECS or declare an impossible decode (Ley Cardinal 1 intact); VIDEO-RANGE is a range/display hint. **Phase G** is the required FREEZELESS safety net: if the QoE detects a black-screen (VST>8000ms) on a channel with PQ active, that channel reverts to SDR (hdr_conversion=0 live + VIDEO-RANGE=SDR without BT.2020 CICP). PQ stays unconditional by default; only what breaks reverts.

## Hardware safety — PQ/HDR CANNOT burn/damage a TV
Durable, technically-grounded answer (the owner asked):
- **HDMI/EDID is a negotiated handshake.** The TV advertises (via EDID) what it supports; the source CANNOT force a damaging signal. An unsupported mode → black screen / "unsupported" message / fallback. The TV protects itself.
- **PQ/HDR metadata is a display HINT, not a panel drive.** The panel's brightness/voltage is controlled by the TV's OWN firmware, which clamps to safe limits regardless of incoming metadata. No signaling path from HLS metadata or Android settings reaches the panel's power hardware.
- **Worst case = a RECOVERABLE black screen** (HDMI HDR handshake fails on a non-HDR display) or washed colors. Fix: change channel / power-cycle. NOT hardware damage.
- OLED burn-in is from STATIC content over hours/days, not HDR metadata.
- Verify a display's HDR capability: `adb shell dumpsys display | grep HdrCapabilities` — `mSupportedHdrTypes=[2,3,4]` = HDR10/HLG/HDR10+. If HDR-capable, the unconditional PQ is safe ON that device; the black-screen risk is only for non-HDR displays (Phase G covers them).

## Autopista (VPS NET SHIELD) invariants
- nginx passthrough, NEVER `ngx.exit(503)`, no circuit breaker, no rate-limit added by edits. `limit_conn xtream_slot` ≥2, `proxy_read_timeout` ≥60s, tcp bbr, `proxy_cache_valid 302` = 0 (never cache redirects), no keepalive on Xtream upstreams.
- log-phase Lua only (the device_state writer + QoE observer are `log_by_lua` — zero impact on the request/stream). Never intervene mid-stream.
- `iptv-vps-touch-nothing`: backup + nginx -t + reload + health-verify + rollback per change. `iptv-omega-no-delete`: never delete/reduce without explicit order (the ~945 functional headers/channel are NOT decoration). `iptv-excel-safe-mode` for the LAB .xlsm.

## EXTHTTP toxic headers (never emit)
`Range`, `If-None-Match: *`, `If-Modified-Since`, `TE: trailers`, `Priority`, `Upgrade-Insecure-Requests` — cause EOF/304/403 / okhttp "unexpected end of stream" on Android players.

## Legal/ethical (cardinal)
Work ONLY with authorized streams/credentials/servers/lists/traffic. No illegal ISP/provider evasion, no unauthorized access, no DRM bypass, no signal theft. Optimization is for QoE/resilience/continuity/authorized routing only.
