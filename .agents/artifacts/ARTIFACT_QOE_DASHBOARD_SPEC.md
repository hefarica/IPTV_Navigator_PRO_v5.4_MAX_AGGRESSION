# ARTIFACT — QoE DASHBOARD SPEC

**Generated:** 2026-05-17
**Owner skill:** `qoe-observability-engine` (S5)
**Exporters:** APE PRISMA v1.3+ · `ape-realtime-guardian` · NGINX log_by_lua

---

## 1. KPI matrix (Prometheus metric definitions)

| KPI | Type | Unit | Labels | Threshold-action |
|---|---|---|---|---|
| `iptv_startup_time_seconds` | Histogram | s | `channel`, `player`, `profile` | p95 > 3 → WARN |
| `iptv_rebuffer_ratio` | Gauge | ratio (0-1) | `channel`, `player` | > 0.02 → WARN; > 0.05 → BLOCK |
| `iptv_stall_count_total` | Counter | count | `channel`, `player`, `cause` | rate > 0.1/min → INVESTIGATE |
| `iptv_error_rate` | Gauge | ratio | `channel`, `error_class` | > 0.01 → WARN |
| `iptv_403_rate` | Gauge | ratio | `channel`, `upstream` | > 0.005 → INVESTIGATE |
| `iptv_407_rate` | Gauge | ratio | `channel`, `upstream` | > 0 → CRITICAL (per `feedback_http_407_proxy_auth_doctrine`) |
| `iptv_eof_rate` | Gauge | ratio | `channel`, `player` | > 0.005 → WARN (toxic header? per `feedback_exthttp_traps`) |
| `iptv_segment_miss_rate` | Gauge | ratio | `channel` | > 0.001 → WARN |
| `iptv_playlist_latency_seconds` | Histogram | s | `channel`, `upstream` | p95 > 0.2 → INVESTIGATE (zapping atómico) |
| `iptv_segment_latency_seconds` | Histogram | s | `channel`, `upstream` | p95 > 1.0 → WARN |
| `iptv_bitrate_observed_mbps` | Gauge | Mbps | `channel`, `profile` | < 0.7×floor → WARN |
| `iptv_fps_drops_total` | Counter | count | `channel`, `player` | rate > 0 → WARN |
| `iptv_player_compat_score` | Gauge | 0-100 | `channel`, `player` | < 80 → WARN |
| `iptv_vmaf_estimate` | Gauge | 0-100 | `channel`, `profile` | < 70 → WARN; < 50 → BLOCK |
| `iptv_mos_estimate` | Gauge | 1-5 | `channel`, `player` | < 3.5 → WARN |

---

## 2. Histogram buckets (estándar industria)

| Metric | Buckets (seconds) |
|---|---|
| `iptv_startup_time_seconds` | 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, +Inf |
| `iptv_playlist_latency_seconds` | 0.025, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1, 2, +Inf |
| `iptv_segment_latency_seconds` | 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10, +Inf |

---

## 3. Probe sources (cómo se obtienen las métricas)

| KPI | Source | Path en repo |
|---|---|---|
| Startup time | ADB logcat `MediaCodecLogger` (Fire TV, Onn 4K) | `ape-realtime-guardian/probes/adb_player.py` |
| Rebuffer ratio | ExoPlayer event listener events | `frontend/js/conviva-qoe-engine.js` (untracked nuevo) |
| Stall count | Player event sum | mismo |
| Error 4xx/5xx | NGINX `log_by_lua` → `/dev/shm/iptv-status.log` | `net-shield/nginx/lua/upstream_response.lua` |
| Bitrate observed | Player MediaCodec stats (bitrate of decoded buffer) | `ape-realtime-guardian/buffer_analyzer.py` |
| TTFB | NGINX `$upstream_response_time` | logged + parsed |
| Segment miss | NGINX 404 count per `*.ts`/`*.m4s` | logged + aggregated |
| VMAF estimate | Computed from metadata (ffprobe + resolution+bitrate+codec) | offline batch |

---

## 4. /metrics endpoint (Prometheus exposition)

Path: `https://<host>/prisma/api/metrics` (gated por basic-auth `prisma_metrics`)

Format: Prometheus text exposition (no protobuf needed)

```
# HELP iptv_startup_time_seconds Time from channel open to first frame
# TYPE iptv_startup_time_seconds histogram
iptv_startup_time_seconds_bucket{channel="ESPN",player="OTT_NAV",profile="P3",le="0.5"} 12
iptv_startup_time_seconds_bucket{channel="ESPN",player="OTT_NAV",profile="P3",le="1"} 47
...

# HELP iptv_rebuffer_ratio Rebuffer time / total playback time
# TYPE iptv_rebuffer_ratio gauge
iptv_rebuffer_ratio{channel="ESPN",player="OTT_NAV"} 0.012
```

---

## 5. Grafana dashboard layout (3-row JSON spec)

### Row 1: "Live health" (refresh 5s)
| Panel | Type | Metric | Threshold colors |
|---|---|---|---|
| Active channels | Stat | `count(iptv_bitrate_observed_mbps > 0)` | green/red |
| 407 rate (last 5m) | Stat | `sum(rate(iptv_407_rate[5m]))` | green<0.001, red>=0.001 |
| EOF rate (last 5m) | Stat | `sum(rate(iptv_eof_rate[5m]))` | green<0.005, red>=0.005 |
| TTFB p95 manifest | Gauge | `histogram_quantile(0.95, sum(rate(iptv_playlist_latency_seconds_bucket[5m])) by (le))` | red>0.2 |

### Row 2: "Per-channel detail" (drilldown)
| Panel | Type | Metric |
|---|---|---|
| Bitrate timeseries | TimeSeries | `iptv_bitrate_observed_mbps{channel=~"$channel"}` |
| Rebuffer ratio | TimeSeries | `iptv_rebuffer_ratio{channel=~"$channel"}` |
| Error events table | Table | `topk(20, sum by (channel, error_class) (rate(iptv_error_rate[1h])))` |

### Row 3: "Player comparison"
| Panel | Type | Metric |
|---|---|---|
| Startup time p50/p95/p99 by player | TimeSeries multi | `histogram_quantile(0.95, sum(rate(iptv_startup_time_seconds_bucket{player=~"$player"}[5m])) by (le, player))` |
| Compatibility score heatmap | Heatmap | `iptv_player_compat_score by (channel, player)` |

---

## 6. Alerting rules (prometheus.rules.yml fragment)

```yaml
groups:
  - name: iptv-critical
    rules:
      - alert: IPTV_HIGH_407_RATE
        expr: sum(rate(iptv_407_rate[5m])) > 0.001
        for: 5m
        labels: {severity: critical}
        annotations:
          summary: "Proxy-auth-required rate exceeds 0.1%"
          runbook: "https://repo-internal/runbooks/iptv-407"

      - alert: IPTV_HIGH_REBUFFER_RATIO
        expr: avg(iptv_rebuffer_ratio) by (channel) > 0.02
        for: 10m
        labels: {severity: warning}

      - alert: IPTV_PLAYLIST_LATENCY_HIGH
        expr: histogram_quantile(0.95, sum(rate(iptv_playlist_latency_seconds_bucket[5m])) by (le)) > 0.2
        for: 5m
        labels: {severity: warning}
        annotations:
          summary: "Manifest TTFB p95 > 200ms (zapping atómico violado)"
```

---

## 7. Cardinality control (important — Prometheus OOM avoidance)

- **Channels:** max ~500 (manageable)
- **Players:** 5-7 enums
- **Profiles:** P0-P5 = 6 enums
- **Upstream:** ~10 enums (Xtream providers)
- **error_class:** ~10 enums (timeout/4xx/5xx/network/dns/etc.)

Avoid: user_id, session_id, IP, URL path as labels. Use `_total` counters + drill-down logs for high-cardinality data.

---

## 8. Required `dev/shm/*` permissions (per `feedback_dev_shm_permissions_nginx_worker`)

Lua/bash producers running as root MUST `chmod 644 <file>` post-write so NGINX worker (www-data) can read. Failure mode: telemetry appears empty.

---

## 9. Conviva QoE Engine integration (DEPLOYED in-file, pending wire)

El archivo `frontend/js/conviva-qoe-engine.js` (untracked nuevo, audit completo en `.agents/reports/AUDIT_CONVIVA_QOE_ENGINE.md`) implementa **Disney+ Grade telemetry** localmente, sin dependencia de Conviva SaaS ($200K/año).

### 9.1 8 métricas core de Conviva (mapeadas a Prometheus)

| Conviva metric | Prometheus exporter mapping | Source |
|---|---|---|
| **VST** (Video Startup Time) | `iptv_startup_time_seconds` histogram | `ConvivaQoE.reportFirstFrame()` |
| **EBVS** (Exit Before Video Start) | `iptv_ebvs_total` counter | `endSession(reason='abandoned_before_first_frame')` |
| **RBR** (Rebuffering Ratio) | `iptv_rebuffer_ratio` gauge | `SessionMetrics.getRebufferRatio()` |
| **ABR** (Average Bitrate observed) | `iptv_bitrate_observed_mbps` gauge | `SessionMetrics.getAverageBitrate()` |
| **FDR** (Frame Drop Rate) | `iptv_fps_drops_total` counter | `SessionMetrics.getFrameDropRate()` |
| **CIRR** (Connection Induced Rebuffer Rate) | `iptv_cirr_ratio` gauge (new) | derive: rebuffer events with `cause=network` |
| **EPF** (Ended Play Fraction) | `iptv_epf_ratio` gauge (new) | `endSession(reason)` aggregate |
| **QoE Score** (0-100) | `iptv_qoe_score` gauge | `SessionMetrics.computeQoE()` |

### 9.2 Automatic decisions (DecisionEngine output)

| Trigger | Decision | Code threshold | Master prompt threshold |
|---|---|---|---|
| RBR > 2% | `FORCE_SURVIVAL_MODE` (480p) | 0.02 | 0.05 (5%) |
| QoE < 50 | `DEGRADE_QUALITY` | 50 | 50 |
| FDR > 5/s | `REDUCE_DECODER_LOAD` | 5 | 5 |
| VST > 3000ms | `PRELOAD_NEXT_CHANNEL` | 3000 | 3000 |
| QoE ≥ 80 sostenido 15s | `PROMOTE_QUALITY` | 80 / 15s | 85 / 15s |

**Threshold reconciliation decision:** mantener los valores del **código** Conviva (más estrictos = mejor QoE). Master prompt usa valores más relajados; el código es la SSOT operativa.

### 9.3 Event bus

```javascript
window.addEventListener('conviva:qoe-update', (e) => {
    const { sessionId, channelName, qoeScore, decision } = e.detail;
    // Consumers: Guardian, PRISMA, Cortex auditor
});
```

Despachado por `ConvivaQoE._tickInterval` cada 1000ms cuando hay sesión activa.

### 9.4 Integration points (pending wire — próxima sesión)

| Sistema | Wire-up |
|---|---|
| `frontend/index-v4.html` | `<script src="js/conviva-qoe-engine.js"></script>` post APE v9 |
| Player hooks (hls.js) | Llamar `ConvivaQoE.reportBitrate/FrameDrops/Error` desde event listeners |
| Player hooks (ExoPlayer ADB) | Push events vía ADB → backend → `ConvivaQoE` API |
| `vps/prisma/api/telemetry-full` PHP endpoint | Incluir `window.ConvivaQoE.getActiveSnapshot()` en payload |
| Guardian dashboard | Consume `getGlobalStats()` para UI |
| Cortex auditor | Listen `conviva:qoe-update` event |

### 9.5 Observaciones del audit (de `.agents/reports/AUDIT_CONVIVA_QOE_ENGINE.md`)

| ID | Severity | Item |
|---|---|---|
| C-001 | LOW | `_tickInterval` no documenta cleanup en page unload → añadir `window.addEventListener('beforeunload', clearInterval)` |
| C-002 | LOW | `_state.sessions` Map crece indefinido sin TTL → añadir cleanup sesiones > 1h |
| C-003 | INFO | RBR threshold 2% (código) vs 5% (master prompt) → documentado, mantener código |
| C-004 | INFO | THRESHOLDS no inyectables desde LAB → considerar `window.APE_PROFILES_CONFIG.qoe_thresholds` futuro |

---

**Fin QoE Dashboard Spec (con Conviva integration).**
