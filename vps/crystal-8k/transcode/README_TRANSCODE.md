# APE Crystal VPS Transcode (Agente 3 + 5-color) — opt-in, async, FREEZELESS-fallback

> **Owner override 2026-06-20** — `DIRECTIVA TRANSCODE VPS PERMITIDO` (CLAUDE.md).
> VPS pixel processing (decode → filter → re-encode) is **PERMITTED**, but ONLY in the
> form below. The PDF's "ffmpeg inside `body_filter_by_lua`" is **non-functional and
> prohibited** (Lua can't decode video; a blocking ffmpeg freezes the worker).

## What runs where

| File | Deploy target | Role |
|---|---|---|
| `ape_pixel_processor.py` | `/opt/ape-api-server/crystal/` | systemd supervisor: 1 ffmpeg per opt-in channel |
| `ape_hdr_color_science.py` | `/opt/ape-api-server/crystal/` | color-filter builder (BT.2446 SDR→HDR, DV RPU, mastering meta) |
| `crystal_transcode_control.json` | `/etc/ape/` | per-channel opt-in map (`enabled=true` to transcode) |
| `ape-crystal-transcode.service` | `/etc/systemd/system/` | service unit (CPU/Mem caps protect nginx) |
| `nginx_transcode_serve.conf` | `include` in the stream `server{}` | serve `/dev/shm/crystal/<chId>/` else passthrough |

## The FREEZELESS guarantee

The supervisor only **produces** HLS into `/dev/shm/crystal/<chId>/`. nginx `try_files`
serves the transcoded file **if present**, else `@crystal_passthrough` proxies the
**verbatim** provider. A lagging/crashed/absent transcode → automatic passthrough.
**A missing transcoded segment can never freeze the channel.** The systemd `CPUQuota`/
`Nice`/`MemoryMax`/`OOMScoreAdjust` ensure the transcoder can never starve nginx, so the
hundreds of **non-flagged** channels stay pure SHIELDED passthrough at all times.

## Capacity — the honest numbers (permission ≠ physics)

`detect_hwaccel()` auto-selects the encoder and `max_concurrent` caps the channel count:

| VPS hardware | Encoder | Realistic concurrent | 8K real-time? |
|---|---|---|---|
| **NVIDIA GPU** (NVENC) | `hevc_nvenc` | ~4× 4K (set `max_concurrent_gpu`) | maybe 1× with a strong GPU |
| **Intel/AMD GPU** (VAAPI) | `hevc_vaapi` | ~2–3× 4K | unlikely |
| **CPU only** (x265) | `libx265 preset=fast` | **1–2× 4K at best**, often sub-real-time | **NO** |

> **Before enabling any 8K channel, confirm the VPS actually has a GPU**
> (`ffmpeg -hwaccels`, `nvidia-smi`). On a CPU-only proxy VPS, leave 8K disabled — it
> will run slower than real time and the channel will live on the passthrough fallback.

## Truth-guards baked in

- **Opt-in only** — every channel ships `enabled=false`. You flip flagship channels deliberately.
- **`minterpolate` OFF by default** — it is a BANNED directive (micro-cuts) + CPU killer; per-channel `motion_interp:true` is the explicit, owner-accepted opt-in.
- **Level↔Resolution correct** — `CRYSTAL_8K`=level 6.1, `CRYSTAL_4K120`=5.2, `CRYSTAL_4K`=5.1 (never L153 on 8K).
- **HDR honest** — real BT.2020/PQ transform + real `master-display`/`max-cll` static metadata (the pixels are actually graded, not faked).
- **SHIELDED preserved** for every non-flagged channel; transcode terminates passthrough **only** for the channels you flag.

## Deploy (GATED — needs explicit owner OK + `iptv-vps-touch-nothing`)

```bash
# 1. confirm hardware
ffmpeg -hwaccels ; nvidia-smi || echo "CPU-only -> keep max_concurrent_cpu=1, no 8K"
# 2. stage files (backup any existing target first)
install -D ape_pixel_processor.py /opt/ape-api-server/crystal/ape_pixel_processor.py
install -D ape_hdr_color_science.py /opt/ape-api-server/crystal/ape_hdr_color_science.py
install -D crystal_transcode_control.json /etc/ape/crystal_transcode_control.json
install -D ape-crystal-transcode.service /etc/systemd/system/ape-crystal-transcode.service
# 3. wire nginx (validate first)
#    include .../nginx_transcode_serve.conf;  in the stream server{}
nginx -t && systemctl reload nginx        # config-only change -> reload OK (no *_by_lua_file edited)
# 4. start the supervisor (all channels disabled by default = no-op until you flag one)
systemctl daemon-reload
systemctl enable --now ape-crystal-transcode
# 5. enable ONE flagship channel in /etc/ape/crystal_transcode_control.json, then:
systemctl restart ape-crystal-transcode   # picks up the control map (or wait one tick)
# rollback: systemctl disable --now ape-crystal-transcode ; remove the nginx include ; nginx -t ; reload
```

> Note: editing a `*_by_lua_file` elsewhere still requires `systemctl restart nginx`
> (the `lua_code_cache` restart-not-reload law). This conf change is plain nginx → `reload` is fine.
