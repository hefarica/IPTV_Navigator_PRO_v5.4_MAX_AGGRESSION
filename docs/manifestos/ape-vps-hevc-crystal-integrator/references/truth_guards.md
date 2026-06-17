# Truth guards for APE VPS HEVC-UHD Crystal integrations

Apply these guards whenever implementing or reviewing APE/Prisma IPTV/VPS/player/daemon packages.

## Non-negotiable technical truths

| Claim area | Allowed wording | Forbidden wording |
|---|---|---|
| M3U8 installer | `#EXT-X-APE-INSTALLER` is metadata/pointer to a bootstrap URL. | The playlist installs or executes code in the player. |
| Wake-on-playback | Playback can trigger wake through manifest GET observation or an optional beacon handled by the VPS. | The HLS tag itself wakes the device or executes commands. |
| ADB | Bootstrap requires a host where ADB is installed, enabled, and authorized for the target device. | ADB can be enabled remotely or silently forced by the playlist/VPS. |
| VPS visual role | VPS selects variants, policies, metadata, profiles, and QoE fallback. | VPS directly improves pixels on a remote player without a real player/device engine. |
| Player-daemon model | The daemon/sentinel runs on the authorized device or host; the player may send beacons/metadata. | The media player magically hosts a daemon from HLS metadata. |
| HEVC-first (GOLDEN RULE) | `hvc1.*` ONLY in `#EXT-X-STREAM-INF CODECS=` (manifest/parser role, out-of-band hvcC, Apple-preferred); `hev1.*` ONLY in `#KODIPROP`/`#EXTVLCOPT`/`X-APE-CODEC` (decoder-runtime role, in-band NAL). Prefer real HEVC UHD when viable, fallback under QoE pressure. | Cross them (`hev1.*` in a STREAM-INF breaks Apple/Tizen/webOS; `hvc1.*` in KODIPROP breaks ExoPlayer ISA), or declare a codec/level the device decoder cannot carry. |

## Implementation guardrails

Keep Nginx and HLS serving non-blocking. Queue wake events and process them in a worker or service. Deduplicate wake events by channel, device, playlist, and time window to avoid storms.

Validate all user-provided claims against source files before reporting completion. If a required module is absent, report the missing path or create a clearly marked implementation stub only when the user asked for new code.

Separate local validations from VPS-only validations. Local static checks do not prove systemd, Nginx, PHP-FPM, Lua runtime, ADB authorization, or Android device behavior on the production VPS.

## Cardinal Law 1 — HEVC Level ↔ Resolution (the 2026-06-08 freeze vector)

`level_idc = level × 30`. Declare `hvc1.2.4.L<N>.B0` **only** when the declared `RESOLUTION`+fps fits that
level's MaxLumaSR (ITU-T H.265 Annex A). A level **below** the content resolution = the variant the player
rejects = freeze.

| codec | Level | techo |
|---|---|---|
| `…L93`  | 3.1 | 720p |
| `…L120` | 4.0 | 1080p@30 |
| `…L123` | 4.1 | 1080p@60 |
| `…L150` | 5.0 | 4K@30 |
| `…L153` | 5.1 | **4K@60 (CORONA / techo)** |
| `…L156` | 5.2 | 4K@120 |
| `…L180` | 6.0 | 8K@30 |
| `…L183` | 6.1 | 8K@60 |
| `…L186` | 6.2 | 8K@120 |

**Forbidden:** `hvc1.2.4.L153.B0` on 8K@120 (commit 7103cfd, freeze 2026-06-08). AV1 carries 8K
(P1 = `av01.0.15M.10`); HEVC L153 cannot. Detail: `references/web_authority.md §3`.

## HDR truth (no fake HDR)

- **VIDEO-RANGE:** emit `PQ` only if probe found TransferCharacteristics **code point 16** (SMPTE ST 2084);
  `HLG` only for **code point 18** (ARIB STD-B67) in the HEVC SPS VUI. `PQ`/`HLG` on SDR (CP 1,6,13,14,15)
  = RFC 8216bis MUST-violation (fake HDR → ExoPlayer black-screen).
- **MaxCLL ≥ MaxFALL** always; default `MaxFALL = round(MaxCLL × 0.25)` (EBU R103-4). Per-profile live:
  P0=4000/1000, P1=1500/375, P2=1000/250, P3=400/100.
- **SUPPLEMENTAL-CODECS:** never emit unless probe found real `dvh1`/`dvhe` in the bitstream.
  `lcev.1.1.1` (invented LCEVC) = PROHIBITED.

## CMAF truth (no fake CMAF)

Emit `ape-container=fmp4-cmaf,verified=true` **only** when probe found `EXT-X-MAP` → init segment
(`ftyp` brand iso6+, `moov` with zero-sample tracks) and `EXT-X-VERSION ≥ 6`. No `EXT-X-MAP` ⇒ not CMAF.

## Toxic EXTHTTP headers (NEVER emit in any integration artifact)

`Range: bytes=0-` · `If-None-Match: *` · `If-Modified-Since` · `TE: trailers` · `Priority: u=0, i` ·
`Upgrade-Insecure-Requests: 1` · multi-value `Connection`/`Keep-Alive` (OkHttp) · `Sec-Fetch-*`.
These cause 400/403/304+0B → okhttp `unexpected end of stream`.

## SHIELDED (Law 5) + NO-STRIP (Law 4)

- **SHIELDED:** channel URLs in `#EXTINF`/`#EXT-X-STREAM-INF` are **VERBATIM** provider URLs.
  SHIELDED = filename suffix only (`_SHIELDED.m3u8`). Never wrap with `/shield/` or any proxy path.
  Real shielding = WireGuard + DNS hijack.
- **NO-STRIP:** never remove/reduce the ~945 per-channel functional headers (`EXTVLCOPT`/`KODIPROP`/
  `EXT-X-VNOVA-LCEVC-*`/`EXTHTTP X-APE-*`/`EXT-X-SESSION-DATA`). Each has a live player or VPS-Lua
  consumer; stripping them blinds the VPS.

## nginx Lua phase safety matrix (autopista)

The log phase runs AFTER the response is fully sent (zero TTFB impact) BUT blocking I/O inside it blocks
the worker for ALL concurrent requests.

| phase | safe | unsafe |
|---|---|---|
| `log_by_lua` | `io.open` append on `/dev/shm` (sub-µs), `ngx.shared.DICT` | sync HTTP/DNS/large read → use `ngx.timer.at(0,…)` cosockets |
| `body_filter_by_lua` | small rewrite of the buffered chunk | blocking I/O, unbounded buffering |
| `content_by_lua` | cosocket I/O | blocking syscalls |
| `access_by_lua` | shared-dict checks | per-request upstream auth round-trip |

## Network invariants (cardinal — generated fragments MUST NOT revert)

`tcp_congestion_control=bbr` · `initcwnd=400` · `initrwnd=400` · `rto_min=40ms` ·
`proxy_read_timeout ≥ 60s` · `limit_conn xtream_slot ≥ 2` · `proxy_cache_valid 302 = 0`.

## Required final caveat

Every final report for this class of task must include this caveat in plain language:

> Playlist anchors are metadata. Real installation and wake require a deployed VPS path plus an authorized ADB host/device or a compatible player/device runtime.
