# ARTIFACT — SKILLS INDEX (306 enterprise skills)

**Generated:** 2026-05-17
**Source:** `.agents/skills_index.json` (194 KB · JSON válido)
**Validator:** `bash .agents/install_skills.sh` → `Indexed 306 · On disk 307 · Bad 0 · Secrets 0 · PASS`

---

## 1. Distribución por specialist

| ID | Specialist | Domain | Skills | % |
|----|------------|--------|--------|---|
| S1 | IPTV/HLS Architect | HLS/M3U8 | 30 | 9.8% |
| S2 | LL-HLS/CMAF Engineer | LL-HLS/CMAF | 30 | 9.8% |
| S3 | Video Codec Engineer | Codec/Container | 31 | 10.1% |
| S4 | Color Scientist HDR | HDR/Color | 30 | 9.8% |
| S5 | QoE/QoS Researcher | QoE/Telemetry | 30 | 9.8% |
| S6 | Nginx/OpenResty/Lua Engineer | Edge/Proxy | 31 | 10.1% |
| S7 | Linux VPS/SRE Engineer | SRE/Operations | 30 | 9.8% |
| S8 | Network/TCP/QUIC Engineer | Network | 31 | 10.1% |
| S9 | hls.js/MSE/Android TV Player Engineer | Player/Client | 32 | 10.5% |
| S10 | Security/Auth/Headers Engineer | Security | 31 | 10.1% |
| **TOTAL** | | | **306** | **100%** |

Plus: S13 augment skill `claude-code-repo-surgeon` (not in 10-matrix).

---

## 2. Anchors (15 skills enterprise completas)

| Anchor | Specialist | Description (1-line) |
|---|---|---|
| `iptv-hls-validator` | S1 | RFC 8216 / EXTHTTP traps / 4-layer rules · BLOCK on CRITICAL |
| `m3u8-playlist-surgeon` | S1 | In-place playlist sanitization · OMEGA-NO-DELETE · atomic write |
| `ll-hls-cmaf-engineer` | S2 | Genuine LL-HLS / CMAF only · refuses fake tags in M3U Plus |
| `codec-quality-analyzer` | S3 | HEVC/AVC/AV1 profile · fake-4K detection · ladder enforcement |
| `color-scientist-hdr` (hook) | S4 | HDR authenticity (PQ/HLG/DV) · BT.2020/2100 transfer |
| `qoe-observability-engine` | S5 | Prometheus metrics · KPIs (startup, rebuffer, stall, 403/407) |
| `nginx-openresty-streaming-proxy` | S6 | nginx -t · Lua phases · autopista doctrine |
| `linux-vps-sre-engineer` (hook) | S7 | systemd · watchdog · backup · runbook 365d |
| `vps-network-tcp-quic-tuning` | S8 | BBR · initcwnd 400 · MTU per WG · sub-second failover |
| `player-compatibility-matrix` | S9 | OTT Nav / TiviMate / hls.js / Shaka / VLC / Apple AV / ExoPlayer |
| `android-tv-ott-tivimate-tuning` | S9 | ADB injection · ExoPlayer LoadControl · KODIPROP / EXTVLCOPT |
| `secure-header-profiler` | S10 | Toxic header detector · OkHttp single-value · anti-fingerprint |
| `stream-watchdog-sre` | S7 | Health checks · auto-restart · backoff · circuit-breaker (telemetry-only) |
| `ffmpeg-ffprobe-validator` | S12 (augment) | ISOBMFF inspect · EBU R128 · SCTE compliance smoke |
| `claude-code-repo-surgeon` | S13 (augment) | Multi-file refactor · git surgery · doctrine enforcement |

---

## 3. Satellites (291 sub-tópico skills · sampling)

Each anchor expands into ~20 satellites focused on a micro-scope, cross-referenced to the parent anchor.

### S1 IPTV/HLS Architect satellites (extracto)
- `tvg-id-tvg-name-formatter`
- `tvg-logo-url-validator`
- `extinf-extractor`
- `ext-x-stream-inf-extractor`
- `m3u-playlist-parser`
- `m3u8-manifest-parser`
- `duplicate-stream-detector`
- `single-url-per-channel-enforcer` (Anti-509)
- `xtream-codes-url-parser`
- `accept-encoding-identity-enforcer`

### S2 LL-HLS/CMAF Engineer satellites (extracto)
- `can-block-reload-handler`
- `can-skip-until-tuner`
- `ext-x-preload-hint-cmaf`
- `ext-x-server-control-ll-hls`
- `ext-x-part-inf-emitter`
- `ts-to-fmp4-repackager`
- `fmp4-moov-atom-relocator`
- `dash-timeline-epoch-sync` (cross-reference to existing `.agent/skills/dash_timeline_epoch_sync/`)

### S3 Video Codec satellites (extracto)
- `aac-codec-string-builder`
- `ac3-codec-string-builder`
- `av1-codec-string-builder`
- `vp9-codec-string-builder`
- `hevc-level-6-1-enforcer`
- `bit-depth-detector`
- `bitrate-real-vs-declared-checker`
- `average-bitrate-emitter`

### S4 HDR satellites (extracto)
- `bt2020-color-gamut-validator`
- `bt709-color-gamut-fallback`
- `transfer-characteristics-pq-hlg-emitter`
- `tonemap-hlg-to-sdr-helper`
- `tonemap-pq-to-sdr-helper`
- `video-range-pq-hlg-emitter`

### S5 QoE satellites (extracto)
- `bitrate-switch-event-tracker`
- `throughput-ewma-calculator`
- `throughput-instant-calculator`
- `ttfb-ewma-calculator`
- `ttfb-tracker`
- `vmaf-score-estimator-from-metadata`

### S6 Nginx/OpenResty/Lua satellites (extracto)
- `access-by-lua-file-per-location-rule`
- `body-filter-by-lua-helper`
- `upstream-failover-handler`
- `accept-encoding-identity-enforcer` (cross-disciplinary)

### S7 SRE satellites (extracto)
- `alert-channel-router`
- `auto-restart-safe-helper`
- `channel-critical-health-check`
- `wireguard-health-monitor-builder`

### S8 Network satellites (extracto)
- `tcp-bbr-congestion-control-enabler`
- `tcp-cubic-fallback-helper`
- `tcp-fast-open-cookie-handler`
- `tcp-fastopen-enabler`
- `tcp-initcwnd-tuner`
- `tcp-initrwnd-tuner`
- `tcp-keepalive-tuner`
- `tcp-mtu-discovery-handler`
- `tcp-rto-min-locker`
- `tcp-syn-flood-protection`
- `wireguard-nested-mtu-tuner`
- `wireguard-tunnel-builder`

### S9 Player satellites (extracto)
- `androidtv-adb-overlay-helper`
- `androidtv-decoder-h264-vs-h265-router`
- `androidtv-fire-tv-4k-max-tuner`
- `androidtv-hdr-capability-detector`
- `androidtv-onn-4k-tuner`
- `tivimate-profile-builder`
- `tivimate-single-value-headers-enforcer`
- `vlc-extvlcopt-builder`
- `vlc-network-caching-tuner`
- `video-js-config-builder`

### S10 Security satellites (extracto)
- `alpn-protocol-negotiator`
- `anti-hotlink-legitimate-builder`
- `basic-auth-handler-bcrypt`
- `token-ttl-rotator`
- `toxic-header-blocker-if-modified-since`
- `toxic-header-blocker-if-none-match-star`
- `toxic-header-blocker-priority`
- `toxic-header-blocker-range-bytes-0`
- `toxic-header-blocker-te-trailers`
- `toxic-header-blocker-upgrade-insecure-requests`
- `tls-1-2-fallback`
- `tls-1-3-enforcer`
- `x-content-type-options-nosniff-emitter`
- `x-frame-options-emitter`
- `x-xss-protection-emitter`
- `user-agent-pool-rotator`
- `cache-control-no-cache-emitter`

---

## 4. File structure per skill (uniform spec)

```
.agents/skills/<name>/
  SKILL.md            ← 14-section anchor template (linter-normalized)
  README.md           ← overview + file map
  references.md       ← 3-layer knowledge (internal/external/operative)
  commands.md         ← exact shell/python/lua commands
  checklist.md        ← pre/during/post-cambio gates
  tests.md            ← fixture cases (happy, edge, regression)
  audit-report.md     ← append-only invocation log
  install.lock.json   ← spec version + dependencies_optional + license
  examples/.gitkeep   ← (populate on demand)
  scripts/.gitkeep    ← (populate on demand)
  fixtures/.gitkeep   ← (populate on demand)
```

---

## 5. Lookup queries (cómo encontrar la skill correcta)

```bash
# Skills by domain
python3 -c "import json; d=json.load(open('.agents/skills_index.json')); [print(s['name'],'·',s['domain']) for s in d['skills'] if s['domain']=='HLS/M3U8']" | head

# Skills by specialist
python3 -c "import json; d=json.load(open('.agents/skills_index.json')); [print(s['name']) for s in d['skills'] if s['specialist']=='S10']"

# Only anchors
python3 -c "import json; d=json.load(open('.agents/skills_index.json')); [print(s['name']) for s in d['skills'] if s.get('kind')=='anchor']"

# Skill containing keyword
python3 -c "import json,sys; d=json.load(open('.agents/skills_index.json')); kw=sys.argv[1]; [print(s['name']) for s in d['skills'] if kw.lower() in s['name'].lower()]" toxic
```

---

## 6. Cross-reference con skills singular `.agent/skills/`

The 721 legacy skills at `.agent/skills/` REMAIN AUTHORITATIVE for project-specific doctrines (e.g. `iptv-cortex-init-mandatory`, `iptv-omega-no-delete`, `m3u8-typed-arrays-perfect-baseline-v10`).

The 306 enterprise skills at `.agents/skills/` add a STANDARDIZED specialist-organized layer for the Team Agent Supremo doctrine.

**Both coexist · neither replaces the other.**

---

**Fin Skills Index.**
