# ARTIFACT — Conviva via ADB Push · Design (NO implementation)

**Generated:** 2026-05-17
**Authority:** S5 QoE/QoS Researcher + S9 Player Compatibility Engineer + S11 Data Observability Engineer
**Status:** **DESIGN ONLY** · zero code · zero touch a producción · próxima sesión decide approval/implementation
**Doctrine compliance:** per `feedback_cableado_y_sandbox_doctrine` — design previo OBLIGATORIO antes de implementation

---

## 1. Problem statement

`conviva-qoe-engine.js` (frontend browser) **NO recibe eventos reales** del player que reproduce el contenido (OTT Navigator / TiviMate en Android TV / Fire TV). El wire actual (commit b4906f3 inline script en index-v4.html) solo tracks el momento de **generación de la lista**, NO el playback real.

**Gap operativo:** las 8 métricas Conviva (VST, EBVS, RBR, ABR, FDR, CIRR, EPF, QoE Score) requieren callbacks del player en tiempo real. El player vive en otro device. Necesitamos un transporte.

---

## 2. Architecture options (design choices)

### Opción A — ADB Push from Android TV client (recomendado)

```
┌─────────────────────────────┐
│ Android TV / Fire TV         │
│  · OTT Navigator / TiviMate │
│  · ExoPlayer events         │
│  · adb shell logcat watch   │
└───────────┬─────────────────┘
            │ ADB events (logcat MediaCodecLogger)
            ↓
┌─────────────────────────────┐
│ VPS Hetzner                 │
│  · ape-realtime-guardian    │
│    (Python pkg ya existe)   │
│  · Probe: adb_player.py     │
│  · Output: /dev/shm/iptv-*  │
└───────────┬─────────────────┘
            │ HTTP POST con metrics JSON
            ↓
┌─────────────────────────────┐
│ Server endpoint PHP nuevo:   │
│  /prisma/api/conviva-event  │
│  · Valida payload schema    │
│  · Invoca ConvivaQoE.*       │
│    server-side equivalent   │
│  · Persiste a sqlite/json   │
└───────────┬─────────────────┘
            │ WebSocket / polling
            ↓
┌─────────────────────────────┐
│ Frontend browser dashboard  │
│  · Listen 'conviva:qoe-*'   │
│  · Visualiza histograma     │
└─────────────────────────────┘
```

**Pros:**
- Reusa `ape-realtime-guardian` (Python pkg ya deployed per `reference_ape_realtime_guardian_v1_DEPLOYED`)
- ADB push ya validado per `reference_adb_persistence_daemon` (Fire Stick Cali + ONN Buga)
- Telemetría server-side persistente (no se pierde con browser refresh)
- Misma data accessible desde dashboard + analytics + alerting

**Cons:**
- Requiere nuevo endpoint PHP `/prisma/api/conviva-event` (toca VPS — `iptv-vps-touch-nothing` aplica)
- ADB connection inestable en NAT scenarios (per `reference_adb_persistence_daemon`)
- Server-side Conviva equivalent: necesita port de `conviva-qoe-engine.js` a PHP (~600 LoC)

### Opción B — WebSocket bidireccional browser ↔ player

```
Browser (Frontend) ←WS→ Player Android TV (con app custom)
```

**Pros:** real-time bidireccional.
**Cons:** requiere custom Android app (TiviMate/OTT Nav son apps cerradas).

→ **Descartada** (requiere control sobre el player, que NO tenemos).

### Opción C — HLS playlist tracking via NGINX log_by_lua

```
Player → request segments → NGINX shield → log_by_lua → ape-realtime-guardian
```

**Pros:** ya existe el pipeline (Lua passthrough escribe a `/dev/shm/iptv-telemetry.log`).
**Cons:** solo captura request-level metrics (TTFB, status code), NO player-level (rebuffering, VST, frame drops).

→ **Útil como complemento**, NO como reemplazo de Conviva.

### Opción D (preferida final) — Hybrid A + C

Combinar:
- **Capa request** (vía Lua existente): captura latency manifest/segment, status codes, throughput
- **Capa playback** (vía ADB push nuevo): captura VST, RBR, FDR, frame drops, codec decisions
- **Aggregator** (vía ape-realtime-guardian extension): merge ambas en sesión Conviva

---

## 3. Schema del payload ADB → server

Endpoint: `POST /prisma/api/conviva-event`

```json
{
  "session_id": "uuid-v4",
  "device_id": "fire-tv-4k-max-bogota",
  "player": "OTT_Navigator",
  "channel": {
    "id": "channel_xxxxx",
    "name": "ESPN 4K HDR",
    "profile": "P1"
  },
  "event_type": "first_frame | rebuffer_start | rebuffer_end | bitrate_change | frame_drop | error | end_session",
  "timestamp_ms": 1747500000000,
  "data": {
    "bitrate_bps": 22000000,
    "resolution": "3840x2160",
    "codec": "hvc1.2.4.L153.B0",
    "frame_drops": 0,
    "buffer_ahead_ms": 28500,
    "error_code": null,
    "error_message": null
  }
}
```

Validación schema en server: JSON Schema (Draft 2020-12) en `vps/prisma/lib/conviva_event_schema.json`.

---

## 4. Server endpoint (PHP) — implementación propuesta

```php
// vps/prisma/api/conviva-event.php
<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/conviva_qoe_server.php';
require_once __DIR__ . '/../lib/lab_config_loader.php';

// 1. Auth + rate limit
if (!verify_basic_auth() || !rate_limit_ok($_SERVER['REMOTE_ADDR'])) {
    http_response_code(429);
    exit;
}

// 2. Parse + validate JSON
$body = file_get_contents('php://input');
$evt = json_decode($body, true);
if (!validate_conviva_schema($evt)) {
    http_response_code(400);
    exit;
}

// 3. Dispatch al motor server-side
$session_id = $evt['session_id'];
$result = ConvivaQoEServer::dispatch($session_id, $evt);

// 4. Persist (sqlite + /dev/shm circular buffer)
ConvivaQoEServer::persist($session_id, $evt, $result);

// 5. Response
header('Content-Type: application/json');
echo json_encode(['ok' => true, 'decision' => $result['decision'] ?? null]);
```

---

## 5. Cliente ADB push — implementación propuesta

```bash
#!/usr/bin/env bash
# vps/scripts/conviva_adb_push.sh
# Runs on VPS · pulls events from Android TV via ADB · POSTs to /prisma/api/conviva-event
#
# Gate 3 SANDBOX safety:
#   - Read-only ADB (no commands that mutate device state)
#   - HTTPS auth required
#   - Rate limit at server side (max 10 req/sec per device)

set -euo pipefail

DEVICE_IP="10.200.0.3"  # Fire TV Cali · per reference_adb_persistence_daemon
ENDPOINT="https://iptv-ape.duckdns.org/prisma/api/conviva-event"
AUTH_USER="prisma_conviva"

adb connect "${DEVICE_IP}:5555"

# Watch logcat for MediaCodecLogger / ExoPlayer events
adb logcat -s "MediaCodecLogger:V" "ExoPlayer:V" | while read -r line; do
    event_json=$(parse_logcat_line "$line")  # bash function or python helper
    if [ -n "$event_json" ]; then
        curl -fsS -u "${AUTH_USER}:${CONVIVA_AUTH_TOKEN}" \
             -H 'Content-Type: application/json' \
             -d "$event_json" \
             --max-time 5 \
             "${ENDPOINT}" || true  # || true to avoid failing the watcher
    fi
done
```

---

## 6. Conviva server-side equivalent (port de conviva-qoe-engine.js)

Port the existing 549 LoC of `conviva-qoe-engine.js` to PHP class `ConvivaQoEServer`:

| JS API | PHP equivalent |
|---|---|
| `ConvivaQoE.createSession(...)` | `ConvivaQoEServer::createSession(...)` |
| `reportFirstFrame()` | `reportFirstFrame()` |
| `reportRebufferStart/End()` | idem |
| `reportBitrate(bps)` | idem |
| `reportFrameDrops(d, t)` | idem |
| `reportError(code, msg)` | idem |
| `getActiveSnapshot()` | idem |
| `endSession(reason)` | idem |
| Decision engine 2% RBR → FORCE_SURVIVAL | idem |

Persistence: SQLite local en VPS (`/opt/netshield/data/conviva.db`) + circular buffer `/dev/shm/conviva-events.log`.

---

## 7. WebSocket frontend ← server (for dashboard live updates)

```javascript
// frontend/js/conviva-server-sync.js
const ws = new WebSocket('wss://iptv-ape.duckdns.org/conviva-stream');
ws.onmessage = (evt) => {
    const update = JSON.parse(evt.data);
    // Bridge server-side conviva events to existing browser ConvivaQoE
    // This makes the browser dashboard (commit b4906f3 wire) visualize REAL playback data
    window.dispatchEvent(new CustomEvent('conviva:server-update', { detail: update }));
};
```

Browser `index-v4.html` ya tiene listener para `conviva:qoe-update` (commit b4906f3 línea ~63 inline script) — añadir listener para `conviva:server-update` permite visualización del playback real.

---

## 8. Compliance con doctrina (los 4 gates)

| Gate | Implementación propuesta cumple? |
|---|---|
| 1 CABLEADO | ✅ flow E2E: Player → ADB → server PHP → ConvivaQoEServer → SQLite + WebSocket → browser |
| 2 BENEFICIO | ✅ telemetría real de playback (no solo generation events) · cierra gap del eslabón 9 |
| 3 SANDBOX | ⚠ requiere VPS endpoint + ADB connection · debe testarse en staging primero · NO PRODUCTION sin smoke |
| 4 EXCEPCIONAL | ✅ design completo + schema + cross-refs + rollback plan |

---

## 9. Riesgos identificados

| Riesgo | Severidad | Mitigación |
|---|---|---|
| ADB connection drops (NAT, sleep mode) | HIGH | `adb_persistence_daemon` ya gestiona reconnect (reference docu) |
| Bandwidth overhead (telemetry traffic) | MEDIUM | Rate limit server-side · max 10 events/sec/device |
| SQLite contention con high event rate | MEDIUM | Switch a circular buffer `/dev/shm` para hot path · SQLite para histórico |
| Endpoint exposed sin auth → DoS | HIGH | Basic auth + rate limit + firewall whitelist (peer IPs autorizadas) |
| Schema drift entre versiones del cliente | MEDIUM | Versioning del schema · `version: "1.0"` field obligatorio |
| Server-side Conviva PHP port introduces bugs | HIGH | Port 1:1 línea por línea · unit tests Python equivalent · paridad behavior |

---

## 10. Rollback plan

Si algo falla post-deploy:

1. **Endpoint PHP**: comentar require_once en routing nginx · `/prisma/api/conviva-event` returns 404
2. **ADB script**: kill systemd unit `conviva-adb-push.service` · ADB connection sigue para otros usos
3. **WebSocket**: comentar load del script `conviva-server-sync.js` en index-v4.html
4. **SQLite**: `mv conviva.db conviva.db.disabled_$(date +%s)` · cero data loss
5. **Browser**: el listener `conviva:server-update` es no-op si no hay events · cero impact UI

Rollback E2E < 5 minutos.

---

## 11. Verificación end-to-end (post-deploy)

```bash
# 1. Server endpoint healthy
curl -fsS -u prisma_conviva:$TOKEN https://iptv-ape.duckdns.org/prisma/api/health/conviva
# Expected: 200 OK + {"status":"ready"}

# 2. ADB connection alive
ssh root@178.156.147.234 'systemctl status conviva-adb-push.service'

# 3. Simulate event (smoke test)
curl -fsS -u prisma_conviva:$TOKEN -H 'Content-Type: application/json' \
  -d '{"session_id":"test","device_id":"smoke","player":"test","channel":{"id":"t","name":"t","profile":"P3"},"event_type":"first_frame","timestamp_ms":1747500000000,"data":{}}' \
  https://iptv-ape.duckdns.org/prisma/api/conviva-event
# Expected: 200 + {"ok":true}

# 4. Verify persistence
ssh root@178.156.147.234 "sqlite3 /opt/netshield/data/conviva.db 'SELECT COUNT(*) FROM events WHERE session_id=\"test\"'"
# Expected: 1

# 5. Browser dashboard receives WS update (manual test in DevTools console)
# Expected: console log "[Conviva-Server] update from session=test"
```

---

## 12. Decisión

**Status:** `DESIGN COMPLETE · IMPLEMENTATION DEFERRED`

Per la doctrina cableado+sandbox, NO se implementa en esta sesión porque:

1. **Toca VPS productivo** — requiere `iptv-vps-touch-nothing` checklist explícito del usuario
2. **Crea endpoint nuevo** — requiere routing nginx update + auth setup + DB schema
3. **Cliente ADB script** — requiere SSH access + systemd setup
4. **Server-side Conviva port** — 600 LoC nuevo · requiere unit tests + paridad behavior

**Próximos triggers para implementar:**

- `aprueba conviva ADB phase 1: server endpoint stub` — solo el endpoint + auth + schema validation (no ADB ni WS)
- `aprueba conviva ADB phase 2: ADB script` — añadir el cliente ADB + smoke test con 1 device
- `aprueba conviva ADB phase 3: WS browser sync` — bridge frontend ← server

Phased rollout reduce riesgo · cada fase tiene rollback < 5min.

---

## 13. Cross-references

- `frontend/js/conviva-qoe-engine.js` (549 LoC · client-side actual)
- `frontend/index-v4.html:4234+` (commit b4906f3 · wire decorativo actual)
- `vps/ape-realtime-guardian/` (Python pkg base · reusable)
- `reference_adb_persistence_daemon.md` (ADB infrastructure ya validada)
- `reference_ape_realtime_guardian_v1_DEPLOYED.md` (telemetry pipeline base)
- `ARTIFACT_QOE_DASHBOARD_SPEC.md` §9 (Conviva integration spec original)
- `feedback_cableado_y_sandbox_doctrine.md` (doctrine compliance)

---

**Fin Conviva ADB Push Design · 0 LoC implementadas · 100% design documented.**
