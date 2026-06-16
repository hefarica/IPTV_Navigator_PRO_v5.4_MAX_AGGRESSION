# ADB→URL-2 QoE plane — the real client's QoE source

## Why ADB (not WireGuard)
The real client (ONN/Fire TV) plays video via **Xray-directo** → segments BYPASS the shield → the VPS server-side proxy-QoE never sees them. The device's WG tunnel to the VPS is **dead** (don't revive it; the user confirmed it "da problemas"). The only real video-QoE path: a host with ADB reads the device logcat and **POSTs to the VPS by URL** (`conviva-event.php`). The data travels by URL; the VPS does NOT need to reach the device.

## The 3 problems of the old host-side Python agent (and the cure)
1. **Popen-Windows glitch**: `subprocess.Popen(['adb','logcat'])` does not stream under Windows cmd.exe → the agent dies instantly. CURE: read logcat ON the device (native Linux pipe), or use the ADB protocol directly (not a subprocess).
2. **ADB port 5555 closes** on device sleep/reboot → host-side can't reach it (chicken-and-egg: need ADB to reopen ADB). CURE: on-device agent (egress POST doesn't need inbound 5555); the host watchdog reconnects when the port reopens.
3. **Reboot reverts ADB-network to OFF + changes the device IP (DHCP)** and may switch to **Wireless Debugging** (a random port != 5555). CURE: discover the device by **mDNS** (`adb mdns services` → `_adb._tcp` / `_adb-tls-connect._tcp` gives `IP:port`), NEVER hardcode the IP.

## The recommended agent (workflow winner #5): on-device sh + host-watchdog
- **`vps/prisma/adb/ape-qoe-agent.sh`** — runs ON the device as shell-user (UID 2000, group log=1007 → sees ALL players' logcat, unlike a sideloaded app with READ_LOGS which only sees its own UID). Reads `logcat -v epoch -T 1`, parses QoE (MediaCodecQuerier CODECS/WIDTH/HEIGHT/BITRATE, onRenderedFirstFrame, Dropped frames, STATE_BUFFERING/READY, ExoPlaybackException) → `$BASE/curl` POST conviva-event v1.0. Reuses the proven freeze-safe `ape-uhdx-sentinel.sh` pattern (bundled curl + lockfile). ndjson retry queue. Self-heal `adb_wifi_enabled` (the device's OWN authorized shell re-enabling its adb locally — NOT remote-enable, truth-guard OK). Autopista fire-and-forget. Why sh not Go: reuses live infra, zero toolchain, no Android CA-store problem (bundled curl resolves TLS).
- **`vps/prisma/adb/host-qoe-watchdog.ps1`** (or `tools/adb-keepalive.sh`) — runs on a LAN host (NOT the VPS, NAT). 1Hz keep-alive + re-bootstrap after reboot (uptime detect) + Ensure-AgentAlive. **mDNS auto-discovery** (`DEV=auto`): handles IP/port changes. Honest limit: a fully-cold reset (agent dead + 5555 closed + no ADB session) needs 1 USB / re-enable ADB-debugging touch (Android security model).

## The bridge tools (host-side, work today)
- `tools/adb-conviva-push.sh` — bash runner (adb logcat | parse | curl POST). `adb logcat` streams reliably in bash (unlike Python Popen on Windows).
- `tools/adb-keepalive.sh` — the watchdog with mDNS auto-discovery.
- `tools/adb_conviva_push_agent.py` — the OLD Python (Popen bug); to be retired (deprecate, don't delete — keep the calibrated parser as reference).

## Calibration + deploy (pending; needs ADB connected)
1. `adb connect <ip:port>` (discover via `adb mdns services`).
2. Capture real logcat: `adb logcat -d -v epoch -s MediaCodec MediaCodecVideoRenderer ExoPlayerImpl MediaCodecQuerier` while playing a 4K HEVC channel; tune the `case` patterns to the actual lines.
3. `sh ape-qoe-agent.sh selftest` → confirm uid=2000, groups has log(1007), curl=OK, logcat=READABLE.
4. Push: `adb push curl ape-qoe-agent.sh /data/local/tmp/ && adb shell chmod 755 ... && adb shell "nohup sh /data/local/tmp/ape-qoe-agent.sh daemon >/dev/null 2>&1 &"`.
5. Verify events land in `conviva_events` + D6 reacts. Channel correlation: POST `channel=auto`; the VPS resolves it by REMOTE_ADDR (shared home NAT IP) from device_state.

## Channel id correlation (OTT Navigator does NOT log channel_id)
Verified: OTT Navigator logcat has no channel_id/URL. So correlation is **VPS-side by IP**: the runner POSTs `channel=auto`; `conviva-event.php` resolves the real channel from `/dev/shm/ape_devstate_<REMOTE_ADDR>.json` (the home public IP is shared between the PC running the agent and the Fire TV that hit `/omega/open`). Exact per-channel only when the player uses our `/omega/open` list — which the user kept VERBATIM (Phase F), so for the Xray-directo client the channel stays `auto` unless the list routes through `/omega/open`.
