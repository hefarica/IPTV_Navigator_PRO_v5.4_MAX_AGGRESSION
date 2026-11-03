# REA 13 — Verificación del ARA en device real (procedimiento + script read-only)

**Tarea:** t46 · **Disciplina:** S9 · **Snapshot:** `git HEAD 2f8861c` · **Fecha:** 2026-10-28
**Estado:** **NOT_RUN en device** — no hay device conectado en esta sesión. **No se inventa ninguna salida de device.**
**Lo único medido hoy** (server-side, read-only, 2026-10-28T19:00Z): `GET ape-feedforward.php?device=__selftest__` → `activated=true, mode=device, preset_count=41, device_settings=3, ape_vpp.allowed=false, reason=no_caps` ⇒ el **gate fail-closed** funciona como está diseñado (sin caps no hay VPP).
**Entregables:** este doc + [`_vps_stage/edge/uhd/proposed/verify_ara_device.sh`](../../_vps_stage/edge/uhd/proposed/verify_ara_device.sh) (read-only, `bash -n` OK, self-test OK; no instala, no enrola, no escribe settings, no modifica DB).

## 1. Requisitos (con archivo:línea)

| # | Requisito | Evidencia | Estado |
|---|---|---|---|
| R1 | APK/daemon APE en el Android TV **autorizado** (`com.ape.crystalagent`) | `android/ape-crystal-agent/app/build.gradle`: `applicationId = "com.ape.crystalagent"`; alternativa shell: `vps/prisma/adb/bootstrap_ara_android.sh:1-20` | Requisito |
| R2 | **ADB autorizado** (RSA/wireless debugging); una playlist/VPS **no** puede abrirlo | `bootstrap_ara_android.sh:26-34` (`ARA_BOOTSTRAP_REQUIRED` si `get-state != device`) | Requisito |
| R3 | **Enrolamiento** `POST /ara/enroll` con `{secret, device_pubkey, device_id, model}`; `secret` sólo del env `APE_ENROLL_SECRET` (≥16, `hash_equals`); pubkey base64 43+`=`; cola a worker root | `vps/prisma/api/ara-enroll.php:6,29-30,37,40-42,50-56` | Requisito |
| R4 | **Heartbeat** periódico a `POST /prisma/api/conviva-event` (`event_type=heartbeat`) → tabla `ara_heartbeats` | `vps/prisma/api/conviva-event.php:126-135`; `ape_mesh.php:342-351` (`device_id PK, last_seen, channel_id, player, ara_version, state, caps_json, last_error`); APK `QoEReporter.kt:32,68-77` | Requisito |
| R5 | **`caps_json`** con `soc` (y `soc_8k` para 8K): el servidor sólo consume esas dos claves | `ape_mesh.php:633-648,657,684,694`; `docs/rea/09_URL2_VPP_METADATA.md:29,94` | Requisito |
| R6 | **Feedforward device-keyed**: `ape-feedforward.php?device=<id>` → `device_settings` (3 base) y, si el SoC está allowlisted, `ape_vpp` (hasta **14**) | `vps/prisma/api/ape-feedforward.php:29-40,57-70,74-95`; `ape_mesh.php:56-82` (3 base) y `:671-698` (gate) | Requisito |

## 2. Comandos ADB de sólo lectura (los usa el script)

| Paso | Comando | PASS esperado |
|---|---|---|
| A1 | `adb get-state` | `device` (autorizado) |
| A2 | `adb shell pm list packages \| grep -i ape` | aparece `package:com.ape.crystalagent` |
| A3 | `adb shell pidof com.ape.crystalagent` | PID no vacío |
| A4 | `adb shell getprop ro.product.model` · `ro.board.platform` | modelo y SoC legibles (p.ej. `mt8696`) |
| A5 | `adb shell logcat -d -t 400 \| grep -iE 'ara\|ape-' \| tail` | ≥1 línea reciente del agente |
| A6 | `adb shell settings get global pq_ai_sr_enable` (+ `ai_sr_level`, `ai_pq_mode`, `ai_pic_mode`, `hdr_conversion_mode`, `match_content_frame_rate`, `minimal_post_processing_allowed`) | valor ≠ `null` (el ARA escribió) |

**Nunca** se usa `settings put`, `pm install`, `am start`, `svc` ni `adb root`: el script es read-only.

## 3. Comprobación server-side (read-only)

```bash
# B) DB del VPS (sqlite -readonly; ruta por defecto del repo)
sqlite3 -readonly /opt/netshield/data/conviva.db \
  "SELECT COUNT(*) FROM ara_heartbeats;
   SELECT device_id,last_seen,length(caps_json) FROM ara_heartbeats ORDER BY last_seen DESC LIMIT 3;
   SELECT COUNT(*) FROM policy_deltas;"
# C) feedforward device-keyed (GET)
curl -fsS "https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=<DEVICE_ID>&iv=3&dur=110" | jq '{activated,mode,preset_count,ds:(.device_settings|length),vpp:.ape_vpp}'
```
- DB por defecto: `/opt/netshield/data/conviva.db` (`ape_mesh.php:290-305`, override `CONVIVA_DB_PATH`).
- `preset_count` **41** (medido hoy con device sintético; es list-level, no depende del device).
- `device_settings`: **3** sin VPP · **14** con `ape_vpp.allowed` (3 base + 11 levers únicos; `ape_mesh.php:56-82,574-602`).
- `ape_vpp.allowed`: `true` **sólo** si `caps.soc ∈ {mt8696, amlogic, s905x4, s905x3}` (fail-closed; `reason` = `no_caps` / `soc_not_allowlisted` / `target_8k_sin_caps_8k`; `ape_mesh.php:651-698`).
- `policy_deltas`: 0 filas es normal si no hay deltas; columnas `target_device_id, channel_id, delta_type, payload_json, applied_count, source` (`ape_mesh.php:326-337`).

## 4. Criterios PASS/FAIL y significado

| Paso | PASS | FAIL | Significa |
|---|---|---|---|
| A1 | `get-state=device` | sin device/`unauthorized` | ADB no autorizado (RSA) → el ARA no puede aplicar settings |
| A2 | paquete presente | ausente | **APK/daemon ausente** |
| A3 | PID vivo | sin PID | servicio parado/crasheado |
| A4 | modelo/SoC legibles | — | contexto para el gate de SoC |
| A5 | líneas `ara/ape` | 0 líneas | el agente no loguea (no instalado/parado) |
| A6 | settings ≠ `null` | `null` | **ARA no aplica settings** (sin `WRITE_SECURE_SETTINGS` o key inexistente en el SoC) |
| B1 | filas > 0 | 0 filas | **no enrolado / nunca latió** |
| B2 | latido ≤ `--max-age-s` (300 s) | stale | heartbeat parado o red |
| C1 | `activated=true, mode=device` | passthrough | el gate no reconoció el device |
| C2 | `preset_count` legible | — | metadata list-level (no prueba VPP) |
| C3 | `device_settings=14` | `=3` | **sin caps/SoC allowlisted ⇒ ARA no aplicará VPP** |
| C4 | `ape_vpp.allowed=true` | `false` (`no_caps`/`soc_not_allowlisted`) | **SoC no allowlisted o sin caps** → fail-closed correcto |

**Diagnóstico rápido:** A2/A3 fallan → APK/daemon; B1/B2 fallan → enrolamiento/heartbeat; C3/C4 fallan con `no_caps` → el heartbeat no trae `caps_json.soc`; con `soc_not_allowlisted` → SoC fuera de la allowlist (no se fuerza: se declara).

## 5. Seguridad

- **Nunca** pegar `secret` ni `device_pubkey` en logs, docs o issues: el `secret` vive sólo en el env `APE_ENROLL_SECRET` del pool php-fpm (`ara-enroll.php:29`); el script lo **borra** si lo encuentra en su entorno.
- El script **no** imprime `caps_json` completo: sólo `soc`/`soc_8k` (vía `length()`/`jq`); no imprime tokens ni la respuesta cruda.
- Sin escrituras: `sqlite3 -readonly`, `settings get`, `GET` del feedforward. Cero `put`/`install`/`am`.

## 6. Ejecución (cuando haya device) y NOT_RUN declarado

```bash
# en un host con ADB autorizado y acceso de lectura al VPS:
./verify_ara_device.sh --serial <ip:puerto> --device-id <ID_REAL> --ssh root@178.156.147.234
# o en el propio VPS (DB local):
./verify_ara_device.sh --device-id <ID_REAL>
```
Salida: `[PASS]/[FAIL]/[NOT_RUN]` + `RESUMEN: checks=N fail=M`; **exit 1 si hay FAIL**, 0 si no, 2 si no se ejecutó nada. Hoy, en esta sesión: **A/B = NOT_RUN** (sin device y sin acceso a la DB desde aquí) y **C verificado sólo con device sintético** (fail-closed). **Ningún resultado de device se declara aquí.**

**Límites:** el servidor sólo compara `caps.soc`/`soc_8k`; `ai_sr`/`ai_pq`/`hdr` viajan en `caps_json` pero **no se usan para el gate** (NO_VERIFICADO su consumo). `preset_count=41` es de la corrida de hoy. El script es una **propuesta read-only**; no se ha aplicado a producción.
