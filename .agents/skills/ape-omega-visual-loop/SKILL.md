---
name: APE OMEGA Visual Loop + ADB→URL-2 QoE Plane
description: This skill should be used when working on the IPTV Navigator PRO OMEGA visual feed-forward loop — the device→channel correlation, the QoE plane (ADB→URL-2→conviva-event→D6→SSE→daemon), the unconditional PQ/HDR pipeline + Phase G rollback, the on-device ADB QoE agent, or when the user asks about "el lazo OMEGA", "el plano ADB", "Conviva por las URLs", "Phase A/B/C/D/E/F/G", "feed-forward", "device_state por IP", "VIDEO-RANGE=PQ incondicional", "el agente on-device", "por qué se pierde el Firestick", or "puede quemar el TV". Encodes the proven architecture, the truth-guards, the CI/CD discipline, and the non-obvious gotchas from the 2026-06-16 build.
version: 1.0.0
metadata:
  type: reference
---

# APE OMEGA Visual Loop + ADB→URL-2 QoE Plane

Procedural knowledge for the OMEGA visual feed-forward loop of IPTV Navigator PRO v5.4. Built + verified E2E 2026-06-16 (Phases A–G). Read `references/architecture-and-gotchas.md` for the full file map, wiring, and gotchas; read `references/adb-qoe-plane.md` for the ADB agent design; read `references/truth-guards-safety.md` for the doctrines + hardware safety.

## The honest dual-URL model (do not violate)

Two links per channel, NEVER one wrapped URL:
- **URL-1 (playback)** = the VERBATIM provider URL, routed by the DNS-hijack (unbound→nginx). Ley SHIELDED 5. Single URL per channel (anti-509). NEVER emit `/omega/resolve/...` or any wrapped form as the playback line. The video bytes go provider-direct.
- **URL-2 (metadata/QoE bus)** = `/omega/*` endpoints + the SSE feed-forward + `conviva-event.php`. Carries device→channel state, QoE telemetry, and the per-tick feed-forward presets/device_settings. Rides the same hijack + inert `#EXT-X-APE-*` anchors (RFC 8216 §6.3.1 — players ignore unknown tags).

**Honest ceiling:** there is NO remote per-frame loop (RTT Colombia→Ashburn ~80-100ms ≫ 33ms/frame). Per-frame happens LOCAL on the SoC; the VPS feed-forward is a POLICY loop in seconds/ticks. State the ceiling honestly; never claim the VPS edits pixels remotely.

## The feed-forward loop (LIVE, verified E2E)

```
player → /omega/open?channel_id=X (302→verbatim)   [URL-1 playback unchanged]
   │  └─ nginx log_by_lua (ape_device_state_writer.lua) writes /dev/shm/ape_devstate_<remote_addr>.json
   ▼
device QoE → ADB reads logcat → POST conviva-event.php (URL-2)  [the QoE source]
   ▼
conviva_events (qoe_score) ──► D6: ape-feedforward-stream.php SSE refreshes riskScore PER TICK
   │                                (ape_qoe_state_by_channel reads real QoE; proxy fallback)
   ▼
engines (NeuroBuffer/LCEVC/HDR10Plus) react ──► device_settings[] + presets[]
   ▼
on-device daemon applies device_settings (frame-rate, hdr_conversion) via WRITE_SECURE_SETTINGS
```

Correlation key = the home public IP (shared NAT). The runner POSTs `channel=auto`; `conviva-event.php` resolves the real channel from `device_state` by `REMOTE_ADDR` (`ape_device_state_by_ip`).

## Phases A–G (what each delivered)

- **A** — device→channel by IP: `log_by_lua_file` on `location = /omega/open` → flat file `/dev/shm/ape_devstate_<safe_ip>.json` (tmpfs 0777, www-data writes, no bootstrap). SSE reads by `$_SERVER['REMOTE_ADDR']` → `channel_source:"ip"`.
- **B** — HDR INCONDICIONAL: `Hdr10PlusDynamicEngine` v3.4.0 (SDR→HDR directives, DV tier, all player-blind `#EXT-X-APE-*`/EXTVLCOPT) + `hdr_conversion_mode=1` unconditional in `device_settings`.
- **C** — `VIDEO-RANGE=PQ` INCONDICIONAL in STREAM-INF (player-facing) + doctrine change in CLAUDE.md. **User override** of the "only-if-probed" truth-guard.
- **D** — Conviva por las URLs: D6 closes the QoE loop (riskScore/tick). The **ADB→URL-2 plane** is the real QoE source (WG dead).
- **E** — HEVC-first: already DONE (generator emits best `hvc1.2.4.L*.B0` Main10 per resolution; GOLDEN RULE + Ley Cardinal 1 intact).
- **F** — playback VERBATIM (kept; user chose SHIELDED Law 5 over /omega/open-302).
- **G** — rollback PQ→SDR per-canal (the safety net): QoE detects black-screen (VST>8000ms) → `channel_pq_profile` blacklist → SSE emits `hdr_conversion=0` (live) + generator emits `VIDEO-RANGE=SDR` without BT.2020 CICP. PQ stays unconditional by default; only the channel that breaks reverts. Mirrors HDCP-Adaptive.

## TODO POR CI/CD (non-negotiable)

Every VPS change goes through `tools/cicd/vps_deploy_map.json` + `deploy_vps.ps1/.sh` (pre-flight df, backup to `/root/ape-deploy-rollback/<ts>/`, atomic scp→tmp→mv NO `--delete`, `php -l`/`nginx -t`, reload, health-verify, **auto-rollback**). APK builds via GitHub Actions. NEVER scp/ssh ad-hoc for repo files. `no_touch` = `iptv-intercept.conf` + `OMEGA_..._DO_NOT_TOUCH`. Git push needs explicit user OK. Known fix: `deploy_vps.sh` strips `\r` from manifest rows (Windows python `print()` emits `\r\n` → broke nginx-reload detection).

## Truth-guards + hardware safety (key facts)

- Players are BLIND to `#EXT-X-APE-*` (RFC 8216 §6.3.1). Only EXTVLCOPT/KODIPROP (VLC/Kodi) and ADB Settings (on-device daemon) actually apply. The VPS selects variants/metadata/QoE, NOT pixels.
- GOLDEN RULE: `hvc1.*` only in STREAM-INF `CODECS=`; `hev1.*` only in KODIPROP/EXTVLCOPT. Ley Cardinal 1: codec Level↔Resolution (L153=4K@60 techo, L186=8K@120). Never level<resolution.
- **PQ/HDR signaling CANNOT burn/damage a TV.** HDMI/EDID is negotiated (the TV advertises support; the source cannot force a damaging signal). Metadata is a display hint, not a panel drive; the TV firmware clamps to safe limits. Worst case = RECOVERABLE black screen (change channel / power-cycle), never hardware damage. Verify a display's HDR capability with `adb shell dumpsys display | grep HdrCapabilities` (types [2,3,4]=HDR10/HLG/HDR10+).

## The ADB→URL-2 QoE plane (the real QoE source)

The real client (ONN/Fire TV) plays via Xray-directo → video segments BYPASS the shield → server-side proxy-QoE is data-starved for it. The only real video-QoE comes from the **ADB plane**: a host (or on-device agent) reads the device logcat (ExoPlayer/MTK `MediaCodecQuerier`) and POSTs to `conviva-event.php` via URL — WG NOT used (dead). Recommended agent = **on-device `sh`** (shell-user UID 2000, group log=1007 sees all players) reading local logcat + egress HTTPS POST — eliminates host-side ADB-port fragility. See `references/adb-qoe-plane.md`. Discover the device by **mDNS** (`adb mdns services` → `_adb-tls-connect._tcp`), NEVER hardcode the IP (Fire TV changes IP on reboot + switches to wireless-debugging ports != 5555).

## How to work in this system

1. Run `iptv-cortex-init-mandatory` (5-layer scan) first — sessions are isolated.
2. Any VPS edit → CI/CD (manifest + `deploy_vps`), backup + nginx-t/php-l + health + rollback.
3. Generator edits (`m3u8-typed-arrays-ultimate.js` + `ape-fallback-resolver.js` + `ape-quality-prober.js`) → `node -c` ×3, additive only (1% uniqueness — never rewrite the monolith).
4. Verify E2E LIVE (curl the SSE via `--resolve iptv-ape.duckdns.org:443:127.0.0.1`, hit `/omega/open` to seed device_state). Inject synthetic QoE to test rollbacks; clean up test rows.
5. Use a workflow (multi-agent) for substantive understand/design/review; adversarially verify findings.

## Additional Resources

- **`references/architecture-and-gotchas.md`** — full file map (VPS + generator + daemon), the exact wiring per phase, the conviva schema v1.0, the persistence drift, the /dev/shm details, the council verdict + the `.90`→`.B0` follow-up.
- **`references/adb-qoe-plane.md`** — the ADB agent redesign (on-device sh + host-watchdog + mDNS), the 3 problems (Popen-Windows glitch, 5555 closed, reboot-resets-ADB), the runner/watchdog tools, the calibration steps.
- **`references/truth-guards-safety.md`** — the SHIELDED/GOLDEN-RULE/Cardinal-Law doctrines, the unconditional-PQ override + Phase G, the hardware-safety reasoning, the autopista invariants.
