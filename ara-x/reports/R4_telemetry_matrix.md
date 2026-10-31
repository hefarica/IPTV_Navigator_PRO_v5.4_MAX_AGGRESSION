# R4 · Telemetría QoE disponible y matriz de players (Never-Drop)

**Tarea:** `t5` (r4) · **attempt:** `5aea3121-250d-4499-9629-6eb0e0b92960` · **Autor:** `qoe-player-analyst` (S5 + S9)
**Fecha:** 2026-10-30 · **Estado:** análisis estático sobre el repo + doctrina; **cero** escrituras en VPS, **cero** ADB,
**cero** despliegues. No se tocó `IPTV_v5.4_MAX_AGGRESSION/frontend/**`, `IPTV_v5.4_MAX_AGGRESSION/vps/**` ni `.agent-teams/**`.
**Scope del entregable:** este archivo (`ara-x/reports/R4_telemetry_matrix.md`) es el único artefacto nuevo.

---

## 0 · Contrato de evidencia

Toda afirmación lleva etiqueta, igual que la forensia del equipo (`docs/REA_SCOPE_AND_ARTIFACTS.md`):

| Etiqueta | Significado |
|---|---|
| `[observado]` | Leído en un archivo del repo **o** en evidencia medida ya registrada por el equipo (se cita `ruta:línea`) |
| `[derivado]` | Consecuencia lógica de lo observado (se explica la regla) |
| `[no disponible]` | No hay evidencia en este host; **no se declara PASS** y no se rellena con valores inventados |
| `[NOT_RUN]` | Verificación que requiere device/VPS y no se ejecutó en esta tarea |

Regla cardinal de este documento: **cuando una métrica no se mide, se escribe `null` + `provenance=unavailable`.
Nunca se rellena un hueco con un número plausible.** El ADC debe consumir ese `null`, no un sustituto. Es la misma
invariante que R5 llama **INV-6** (`null != 0`).

**Verificación de citas.** Las **92** referencias `archivo:línea` de este informe se validaron por script
(existencia del archivo **y** línea dentro del rango real) ⇒ **92/92 OK, 0 fallos**. No es una aserción a ojo:
35 archivos distintos, 75 pares `archivo:línea` únicos.

**Coordinación con R5 (actuadores).** Este informe describe **qué se puede medir**; R5 describe **qué se puede mover**.
Los tres puntos de contacto están alineados a propósito: (1) térmico —`thermal_status` por API es la única señal sin
ADB y `cpu_temp_c` exige shell (`ara-x/reports/R5_actuators.md:376-394`); (2) `frame_drop_ratio` sólo es derivable dentro del APK con
`DecoderCounters` (`ara-x/reports/R5_actuators.md:382`); (3) el contrato `/sync` pide magnitudes que ninguno de los dos puede entregar hoy
(`ara-x/reports/R5_actuators.md:371-374`, coincide con R4-F03).

---

## 1 · Veredicto en una tabla

Lo que el meta-controlador **puede** comer hoy, y lo que el schema ya le exige comer (`ara-x/vps/schema/sync_request.schema.json:30-33`).

| Métrica pedida | ¿Se mide hoy? | Dónde | Confianza | Veredicto |
|---|---|---|---|---|
| `frame_time` / `frame_time_variance` | **NO** (fuera del APK propio) | — | — | **NO MEDIBLE** en players de terceros `[derivado]` |
| `dropped frames` | **SÍ, parcial** | logcat ExoPlayer (`droppedFrames.*count=`) y MediaCodecLogger | media | Medible solo si el player loguea; contador acumulado, no ratio |
| `frame_drop_ratio` | **NO** (logcat da numerador sin denominador) | el APK sí tiene `DecoderCounters` (R5 §14.2) | — | `null` hoy; **posible** si el APK lo cablea |
| FPS efectivo | **NO** (solo FPS **declarado**) | `FRAMERATE=` en MediaCodecQuerier; `r_frame_rate` del manifest | baja | Declarado ≠ efectivo `[derivado]` |
| `gpu_load_pct` | **NO** | `[no disponible]` | — | **NO MEDIBLE**: sin API pública de carga GPU; Mali expone `.../mali0/device/utilization` sólo a shell/root (R5 §14.3) |
| `vpu_load_pct` | **NO** | `[no disponible]` | — | **NO MEDIBLE**: sin nodo estándar; se declara `NO_AVAILABLE`, no se rellena (R5 §14.3) |
| `cpu_temp_c` / `gpu_temp_c` | **NO implementado**; legible **sólo por shell/ADB** | `/sys/class/thermal/thermal_zone*/temp` + `type` | — | **MEDIBLE-POR-VERIFICAR** `[NOT_RUN]`; SELinux bloquea `sysfs_thermal` a una app (R5 §14.3) |
| `thermal_status` (enum 0..6) | **NO cableado**, pero **disponible sin ADB** | `PowerManager.getCurrentThermalStatus()` (API 29+) | — | única señal térmica portable; hoy no la emite nadie (R5 §14.2) |
| `buffer` (ms / %) | **SÍ, parcial** | `bufferedDurationUs=` (ExoPlayer), modelo por bandwidth (daemon) | media / **modeled** | Medible en familias ExoPlayer; el resto es **modelo**, no medida |
| `stutter` (probabilidad) | **NO** | — | — | **NO MEDIBLE** directo; solo derivable de primitivas (ver §6) |
| VST / startup | **SÍ** (dos planos) | device: `onRenderedFirstFrame elapsed=`; server: `vst_proxy` | alta / media | El más sólido del sistema |
| rebuffer | **SÍ, parcial** | `STATE_BUFFERING` (ExoPlayer) + proxy de gap >15 s del observer Lua | media / baja | Ciego para Kodi/VLC y para tráfico Xray-directo |
| `bitrate_bps` | **SÍ, parcial** | `bitrateInKbps` real (MediaCodecLogger) o `body_bytes/upstream_time` | alta / media | Real solo cuando hay línea de decoder |
| `rtt/loss/bandwidth` | **SÍ, transporte** | `bandwidth_reactor.lua` (TTFB/jitter/slope) | media | `loss` **no es pérdida de red**: es ratio de 5xx (`IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor.lua:140-146`) |
| `content.*` (motion, grain, complexity, dark) | **NO** | — | — | **NO MEDIBLE en device**; debe venir del LAB/generador `[derivado]` |
| `decoder errors` nativos | **NO estructurado** | logcat textual (`ExoPlaybackException`, `Codec error`) | baja | **NO MEDIBLE como señal**: el enum del server ni acepta `decoder_error` (§8, R4-F01) |

**Consecuencia para el equipo:** el `sync_request.schema.json` actual exige **11 campos que hoy no son medibles en el
device** — 7 escalares (`cpu_temp_c`, `thermal_throttled`, `gpu_load_pct`, `vpu_load_pct`, `frame_drop_ratio`,
`stutter_probability`, `buffer_health_pct`) + los 4 de `content` — más `gpu_temp_c` como opcional. Si `/sync` se implementa tal cual, el cliente sólo tiene dos caminos:
**fabricar** (viola la doctrina) o **no sincronizar** (rompe Never-Drop). R4 propone la enmienda en §6.5.

---

## 2 · Mapa de planos de telemetría (lo que existe de verdad)

Ocho planos escriben, cinco leen. Todo lo demás es aspiracional.

```
                        ┌──────────────────── DEVICE ────────────────────┐
                        │                                                 │
  logcat (UID 2000) ────┤ ape-qoe-agent.sh ──POST──► /prisma/api/conviva-event
                        │      └ SSE client ──GET──► /ara/events  (deltas ↓)
  APK ExoPlayer ────────┤ QoEReporter.kt ───POST───► /prisma/api/conviva-event
                        │                                                 │
                        └─────────────────────────────────────────────────┘
  host ADB ── prisma_adb_daemon.sh / ape-telemetry-universal.sh /
              collect_player_telemetry.sh / ape_realtime_guardian
              └── /dev/shm/{prisma_adb_telemetry,ape_player_telemetry}.json
                        │
  traffic through VPS ──► qoe_server_side_observer.lua (log_by_lua)
                        │      └ ngx.shared.qoe_metrics
                        │           └ qoe_flush_worker.lua (60 s) ──POST──► /prisma/api/qoe-flush.php
                        │                                                      └── conviva.db
                        └ bandwidth_reactor.lua (por segmento) ── ngx.shared.circuit_metrics
                                                                          └── /prisma/api/telemetry-full
  LECTURA / ACTUACIÓN:
    conviva-event.php  → policy_deltas / ara_heartbeats / PQ-ct / Phase G
    /ara/events (SSE)  → entrega policy_deltas al device   (NO es upload de telemetría)
    ape-feedforward(.stream).php → QoE → riskScore → presets + device_settings (actuador)
    ape_qoe_state_by_channel()   → estado QoE por canal para el mesh (60 s / proxy)
```

| # | Plano | Dirección | Implementación | Cadencia real | Persistencia |
|---|---|---|---|---|---|
| P1 | **SSE `/ara/events`** | VPS → device | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/events-sse.php:58-100` | poll SQL **0.5 s**, heartbeat **15 s**, corte **3600 s**, 50 deltas/ciclo | `policy_deltas`, `ara_heartbeats` |
| P2 | **`/prisma/api/conviva-event`** | device → VPS | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php` + `lib/conviva_qoe_server.php` | por evento (fire-and-forget, timeout 4 s, cola local) | `conviva_events` + buffer circular `/dev/shm/conviva-events.log` |
| P3 | **`/prisma/api/qoe-flush`** | nginx → PHP | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/qoe_flush_worker.lua:20-207` + `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/qoe-flush.php:56-62` | **60 s**; bucket de **5 min** | `server_side_qoe_metrics`, `max_quality_channels`, `qoe_profile_aggregates` |
| P4 | **Observer server-side** | nginx (log phase) | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/qoe_server_side_observer.lua:29-180` | por request `.m3u8/.ts/.m4s`; TTL 300-600 s por clave | `ngx.shared.qoe_metrics` (8 MB, `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/conf.d/prisma-qoe-metrics.conf:6`) |
| P5 | **Reactor/Telescope** | nginx | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor.lua:66-146` + `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/prisma_telemetry_full.lua:91-119` | por segmento; anillo L1 de 12 muestras | `ngx.shared.circuit_metrics` (sin SQLite) |
| P6 | **Agente shell on-device** | device → VPS | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/ape-qoe-agent.sh:96-140` | continuo (logcat) + flush de cola **30 s** + heal **60 s** | cola NDJSON en `/data/local/tmp` |
| P7 | **APK** | device → VPS | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/QoEReporter.kt:34-68` | heartbeat **30 s**, `quality_change` al cambio | — (server) |
| P8 | **ADB host-side** | host → device | `prisma_adb_daemon.sh` (1 s), `ape-telemetry-universal.sh`, `collect_player_telemetry.sh`, `ape-realtime-guardian` (1 s) | 1 s … 6 s por comando `adb` | `/dev/shm/*.json` |
| P9 | **`/a/2` (EXTATTRFROMURL)** | player → VPS | `docs/rea/14_APE_A_CONTRACT.md:9` | 1 GET por zap, **solo OTT** | `ngx.shared.ape_qoe` |
| P10 | **`/omega/open` device_state** | player → VPS | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_device_state_writer.lua:4-17` | 1 escritura por apertura de canal | `/dev/shm/ape_devstate_<ip>.json` |
| P11 | **Actuador feedforward** | VPS → device | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward.php`, `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward-stream.php:29-136` | one-shot / SSE tick **1-10 s** (def. 3 s), `dur ≤ 120 s` | — |
| P12 | **conviva-stream (navegador)** | VPS → navegador | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-stream.php:48-53` | poll **100 ms**, keepalive 25 s, corte 290 s | lee el buffer |
| P13 | **`conviva-qoe-engine.js` (navegador)** | navegador | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/conviva-qoe-engine.js` | tick interno | **no instrumenta playback** (§8, R4-F02) |

---

## 3 · Tabla maestra de métricas (definición · fuente · cadencia · honestidad)

`P` = plano de §2. `prov` = procedencia que el ADC debe arrastrar.

| Métrica | Definición exacta en el código | P | Fórmula / unidad | Cadencia | Latencia al ADC | prov | Límite honesto |
|---|---|---|---|---|---|---|---|
| `vst_ms` (device) | `onRenderedFirstFrame elapsed=<ms>` → `first_frame.startup_time_ms` | P6 | ms desde `prepare()` del player | por sesión | < 1 s | `measured_device` | Sólo ExoPlayer-based; VLC/Kodi no emiten ese tag |
| `vst_proxy_ms` | `t(primer segmento 200) − t(manifest 200)` por `(ip|ua8, canal)` | P4 | ms | por zap | ≤ 60 s (flush) | `measured_server` | **No es** tiempo hasta primer frame: incluye relleno de buffer |
| `vst` (server, tabla) | `vst_proxy_avg / vst_proxy_max` por bucket 5 min | P3 | ms | 5 min | 60-300 s | `measured_server` | — |
| `rebuffer_events` | `STATE_BUFFERING` → `rebuffer_start`; `STATE_READY` → `rebuffer_end` | P6 | eventos | por evento | < 1 s | `measured_device` | ExoPlayer 2: sí. Kodi/VLC: **ciego** |
| `rebuffer_proxy` | gap entre segmentos consecutivos **> 15 s** | P4 | conteo/ventana | por segmento | ≤ 60 s | `measured_server` | Umbral grueso: un stall de 3-14 s **no se ve** |
| `rebuffer_ms` | `rebuffer_end − rebuffer_start` (cliente) | P6 | ms | por evento | < 1 s | `measured_device` | No hay ratio: falta `totalPlayMs` en el agente shell |
| `rebuffer_ratio` | `totalRebufferMs / totalPlayMs` | P13 | 0..1 | — | — | **`unavailable`** | Existe la fórmula (`IPTV_v5.4_MAX_AGGRESSION/frontend/js/conviva-qoe-engine.js:311-315`) pero **sin sujeto de playback** (R4-F02) |
| `frame_drops` | `droppedFrames.*count=` / `Dropped N` | P6/P8 | contador acumulado | por línea | < 1 s / 1-6 s | `measured_device` | Acumulado: la **ratio** exige delta + ventana |
| `frame_drop_ratio` | `Δdropped / Δtotal` | — | 0..1 | — | — | **`unavailable`** | Fuera del APK no hay `totalFrames`; dentro del APK sí (`DecoderCounters`, R5 §14.2), sin cablear (R4-F03) |
| `frame_time` / `frame_time_variance` | — | — | ms / ms² | — | — | **`unavailable`** | No hay API pública para el MediaCodec de otra app; `Choreographer` sólo emite warnings (§5) |
| `fps_declared` | `FRAMERATE=` (MediaCodecQuerier) / `fps` del probe | P6/P8 | fps | por cambio | < 1 s | `measured_device` | Es lo **declarado**, no lo renderizado |
| `fps_effective` | frames renderizados / t | — | fps | — | — | **`unavailable`** | Sólo posible dentro del APK con `VideoFrameMetadataListener` (no cableado) |
| `buffer_ms` | `bufferedDurationUs=` | P8 | µs→ms | 1-6 s | 1-6 s | `measured_device` | ExoPlayer-based; en Kodi/VLC no existe la línea |
| `buffer_health_pct` (medido) | `min(100, bufferedDurationUs / 60 s)` | P8 | % | 1-6 s | 1-6 s | `measured_device` | **Denominador supuesto** (60 s), no capacidad real |
| `buffer_health_pct` (daemon) | tabla por `actual_mbps` vs pisos 17/8/4 Mbps | P8 | % | 1 s nominal | — | **`modeled`** | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/prisma_adb_daemon.sh:217-293`: es un **modelo de red**, no el buffer del player (R4-F05) |
| `bitrate_bps` (real) | `omx.video.<codec>.bitrateInKbps = N` | P6/P8 | kbps→bps | por cambio | < 1 s | `measured_device` | Requiere `log.tag.MediaCodecLogger=I` **y** que el player emita la línea |
| `bitrate_avg_bps` (proxy) | `body_bytes*8*1000 / upstream_time_ms` | P4 | bps | por segmento | ≤ 60 s | `measured_server` | Mide **tiempo de upstream**, no throughput del player |
| `throughput_bps` / `ewma` | delta `body_bytes` por request | P5 | bps | por segmento | inmediato (dict) | `measured_server` | Sólo tráfico **que pasa por el VPS** |
| `ttfb_ms` | `header_time*1000` | P5 | ms | por segmento | inmediato | `measured_server` | idem |
| `jitter_ms` | `EWMA(|ttfb − ttfb_ewma|)` | P5 | ms | por segmento | inmediato | `derived` | Jitter **de servidor**, no de red del cliente |
| `loss_pct` | `5xx / total_requests` | P5 | % | 60 s | ≤ 60 s | `measured_server` | **No es pérdida de paquetes** (nombre engañoso, R4-F08) |
| `err_4xx/5xx`, `redirect_count`, `seg_latency_ms` | observer Lua | P4 | conteo / ms | 60 s | — | `measured_server` | **Se calculan y se envían, pero no se persisten** (R4-F04) |
| `cpu_temp_c`, `gpu_temp_c` | `thermal_zone*/temp` (milésimas de °C) vía **shell/ADB** | — | °C | — | — | **`unavailable`** | Ningún script del repo los lee; una app normal no puede (`sysfs_thermal` + SELinux) |
| `thermal_status` | `PowerManager.getCurrentThermalStatus()` (enum 0..6) | — | enum | — | — | **`unavailable`** | Disponible **por API** en el APK (API 29+); no cableado en `QoEReporter` |
| `gpu_load_pct`, `vpu_load_pct` | — | — | % | — | — | **`unavailable`** | Mali: `/sys/class/misc/mali0/device/utilization` (shell); VPU: sin nodo estándar (R5 §14.3) |
| `ram_available_pct` | `dumpsys meminfo` / `/proc/meminfo` / psutil host | P8 | % | 1-6 s | 1-6 s | `measured_*` | Host: `psutil` (`IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/probes/server_side.py:58-67`); device: por invocación |
| `content.*` | — | — | — | — | — | **`unavailable`** | Dominio de píxeles; los `.tflite` son *placeholders* de 1,5 KB |
| `decoder_error` | `ExoPlaybackException` / `Codec error` (texto) | P6 | evento | por línea | < 1 s | `measured_device` textual | **El server lo rechaza** (R4-F01) |
| `qoe_score` (device→server) | `computeStubQoE()` | P2 | 0..100 | por evento | inmediato | `derived` | Es un **stub por tipo de evento**, no un score de sesión (`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_qoe_server.php:210-236`) |
| `qoe_score` (Telescope) | throughput 30 + TTFB 15 + jitter 10 + loss 10 + estado 20 + tendencia 15 | P5 | 0..100 | por request | inmediato | `derived` | **Sólo red**; llamarlo "QoE" es un riesgo de nomenclatura (R4-F09) |
| `mos_estimated` | curva del `qoe_score` anterior | P5 | 1.0-5.0 | idem | idem | `derived` | Hereda el límite: **no es MOS perceptual** |
| `zap` | cambio de `pid`/codec/res o colapso de bitrate 2 ciclos | P8 | bool + reason | 1-6 s | 1-6 s | `derived` | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py:29-71`; falso positivo en ABR agresivo |
| `channel_id` (atribución) | `/omega/open?channel_id=` por IP | P10 | string | por apertura | — | `measured_server` | 300 s de frescura (`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:95-105`); si el cliente va directo, **no hay atribución** |
| `max_quality` / `cascade_type` | header `X-APE-Max-Quality:1` | P4 | flag | por manifest | ≤ 60 s | `measured_server` | Sólo si el player **manda** el header |

---

## 4 · Matriz de players (S9) — qué se puede observar en cada uno

Familias presentes o declaradas en el ecosistema. `L1` = logcat directo; `L2` = ADB host; `L3` = observer de VPS;
`L4` = APK (sólo su propio player); `L5` = navegador.

| Player / familia | Motor real `[observado]` | VST | Rebuffer | Drops | Buffer | Bitrate real | Codec/HW | Temp/GPU | Zap | `/a/2` | Nota de compatibilidad |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **`ape-crystal-agent` (APK)** | ExoPlayer/media3 propio | L4 ✔ | L4 ✔ | L4 ✔ (interno, no exportado) | L4 ✔ | L4 ✔ | L4 ✔ | L4 **posible** (`PowerManager`), no cableado | vía heartbeat | n/a | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/fluid/core/PlaybackGuard.java:150-231` ya detecta stall por frame; **no lo publica** |
| **OTT Navigator 1.7.3.3** | ExoPlayer 2 + FFmpeg (SW) `REA:149-165` | L1 ✔ | L1 ✔ | L1 parcial | L2 parcial | L1/L2 ✔ (línea de decoder) | L1/L2 ✔ | ✖ | **mejor** (pid+codec+res+`/a/2`) | **sí** (único que consume D1-D6) | `minSdk 26`; **no** trae `libvlc.so` → opción VLC sin librería (U3 abierto) |
| **TiviMate** | ExoPlayer 2 (derivado) | L1 ✔ | L1 ✔ | L1 parcial | L2 parcial | L2 parcial | L2 ✔ | ✖ | bueno | **no** (ignora D1-D6, `docs/rea/14:38-46`) | headers: sólo valor único (doctrina `tivimate-single-value-headers`) |
| **IPTV Smarters** | ExoPlayer (derivado) | L1 ✔ | L1 ✔ | L1 parcial | L2 | L2 | L2 | ✖ | medio | no | mismo techo que ExoPlayer |
| **VLC 3.x** | libVLC nativo | ✖ | ✖ | ✖ | ✖ (sólo `buffer` en log) | ✖ | L2 parcial | ✖ | **débil** | no | telemetría ≈ sólo L3 (proxy) |
| **Kodi** | su reproductor + ISA | ✖ | ✖ | ✖ | ✖ | ✖ | L2 parcial (`KodiPlayer`) | ✖ | débil | no | L3 es la única señal |
| **hls.js (navegador)** | MSE | **L5 ✔** (`getVideoPlaybackQuality`, `requestVideoFrameCallback`) | L5 ✔ | **L5 ✔** | L5 ✔ | L5 ✔ | L5 ✔ | ✖ | n/a | n/a | es el lane **más rico**, pero hoy **desconectado** (R4-F02) |
| **AVPlayer / Shaka / genérico** | — | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | n/a | n/a | no presentes en disco (REA §6.1); sólo L3 si pasan por el VPS |

### 4.1 Lectura transversal

- **La telemetría buena existe sólo donde el player es ExoPlayer.** `[derivado]` OTT/TiviMate/Smarters/APK comparten
  el mismo tag (`ExoPlayerImpl`, `STATE_BUFFERING`, `MediaCodecVideoRenderer`); VLC y Kodi quedan fuera de L1.
- **L1 (logcat) es gratis y sub-segundo; L2 (ADB host) es 10× más rico y 100× más caro.** `[observado]`
  `prisma_adb_daemon.sh` hace ≈35 `settings get` + `dumpsys wifi` + `wm size` + `pidof` **por vuelta**
  (`:113-146`, `:151-211`, `:295-302`) ⇒ el `sleep 1` nominal (`:16`) no se cumple en la práctica:
  `[derivado]` la vuelta real es **3-6 s** (cada `adb shell` ≈ 60-120 ms).
- **`/a/2` es un beacon de zap de OTT y nada más.** `[observado]` `docs/rea/14_APE_A_CONTRACT.md:38-46`
  (TiviMate/otros ⇒ sólo D0/D5). `[derivado]` no sirve como señal universal de zap.
- **La atribución de canal por IP** (`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php:81-96` + `ape_device_state_writer.lua`) es el pegamento que
  convierte eventos "auto" en `channel_id`. Sin pasar por `/omega/open` o el shield, **no hay atribución**.

---

## 5 · Lo que NO se puede medir (y por qué) — la parte que evita mentir

| # | No medible | Razón técnica | ¿Se puede algún día? | Qué usar en su lugar |
|---|---|---|---|---|
| N1 | `frame_time` / `frame_time_variance` de un player ajeno | Android no expone el timing por frame de otro proceso. `Choreographer` sólo emite *"Frame time is X ms in the future"* como **warning** (dump de logcat del repo, línea 357), no un stream de medidas. `dumpsys gfxinfo` mide **composición de UI**, no la cadencia del decoder | Sólo dentro del APK (`VideoFrameMetadataListener` / `PlaybackStatsListener`) | `rebuffer_events` + `dropped` + `vst` como proxies; **`null` explícito** |
| N2 | `fps_effective` | No hay contador de frames renderizados legible desde fuera; `FRAMERATE=` es lo declarado | APK sí | `fps_declared` + `frame_drop` acumulado |
| N3 | `gpu_load_pct` | No existe **API pública** de carga de GPU en Android; el nodo Mali (`/sys/class/misc/mali0/device/utilization`, S905X4 = Mali-G31) es vendor-specific y sólo accesible a shell/root; PowerVR (MT8696) usa `debugfs`. **Ningún script del repo lo lee** (grep `mali0|utilization|utilisation` = 0 hits en `.sh/.php/.lua/.py/.kt/.java`) | root / debugfs / ADB shell | `null` |
| N4 | `vpu_load_pct` | Ni Amlogic S905X4 ni MediaTek MT8696 publican busy% del VPU: no hay nodo estándar identificado `[derivado]`. Debe declararse `NO_AVAILABLE`, nunca rellenarse | root, si existiera | `null` |
| N5 | `cpu_temp_c` / `gpu_temp_c` / `thermal_throttled` | **Nadie lo mide hoy** (0 scripts leen `thermal_zone`/`thermalservice`). Matiz: por **app** no es legible (SELinux `sysfs_thermal`); por **shell/ADB** sí es la vía natural. La **única** señal térmica sin ADB es `PowerManager.getCurrentThermalStatus()` (enum 0..6, API 29+) | Sí por ADB (`thermal_zone*/temp`) y sí por APK (enum, sin cablear) | `null` + `thermal_status=unknown` hasta verificarlo (§9) |
| N6 | `decoder` **error codes** nativos | `MediaCodec` devuelve códigos a **su** app; en logcat sólo queda texto. Y el enum del servidor **no incluye `decoder_error`** (R4-F01) | Sí, vía APK (`onPlayerError`) o `dumpsys media.metrics` | `error` genérico + `last_error` textual truncado a 100 chars (`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/players/adb/collect_player_telemetry.sh:105`) |
| N7 | `content.*` (motion, film grain, complexity, dark ratio) | Es dominio de píxeles. El APK sólo ve **sus propios** frames (Android prohíbe capturar el MediaCodec de otra app) y sus `.tflite` son *placeholders* de 1,5 KB | Con modelos reales + player propio | **LAB/generador**: el contenido por canal es estático y ya está en el SSOT; el device no debe inventarlo |
| N8 | `rebuffer_ratio` real en nativo | Falta `totalPlayMs` en el agente shell; el engine JS que lo calcula no tiene sujeto de playback | Sí (2 líneas de shell) | `rebuffer_ms` + ventana de sesión |
| N9 | HDR realmente renderizado | Sólo se conoce (a) lo declarado en la lista y (b) las **capacidades** del display (`hdr_types`, `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/QoEReporter.kt:117-119`). El rango de salida efectivo no es observable | `dumpsys SurfaceFlinger` (dataspace) — `[NOT_RUN]` | declarado + `caps.hdr_types` |
| N10 | audio underruns en VLC/Kodi | Sólo ExoPlayer loguea `audioUnderruns=` | — | `null` |

**Regla de oro (heredada de `player-compatibility-matrix` §14):** nada de esto se declara PASS sin device. Todo lo
marcado `[NOT_RUN]` queda como deuda de verificación, no como hueco relleno.

---

## 6 · Features del ADC (contrato de decisión)

### 6.1 Vector canónico por muestra

Cada feature viaja con `value`, `prov`, `age_ms`, `conf`. Sin esas cuatro, el ADC **no** puede usarla.

```
F01 vst_ms              int 0..60000        prov: measured_device | measured_server
F02 startup_outcome     enum ok|timeout|error|unknown
F03 rebuffer_events     int 0..99           prov: measured_device | measured_server
F04 rebuffer_ms         int 0..600000       prov: measured_device
F05 rebuffer_ratio      0..1                prov: derived  (sólo si hay play_ms)
F06 frame_drop_count    int                 prov: measured_device
F07 frame_drop_ratio    0..1                prov: unavailable (hoy) | derived (APK: DecoderCounters)
F08 fps_declared        1..240              prov: measured_device
F09 fps_effective       1..240              prov: unavailable (hoy) | measured_device (APK)
F10 frame_time_ms       float               prov: unavailable (hoy) | measured_device (APK)
F11 frame_time_var_ms2  float               prov: unavailable (hoy) | measured_device (APK)
F12 buffer_ms           int                 prov: measured_device
F13 buffer_pct          0..100              prov: derived (base 60 s) | unavailable
F14 bitrate_bps         int                 prov: measured_device | measured_server
F15 throughput_bps      int                 prov: measured_server
F16 ttfb_ms             int                 prov: measured_server
F17 jitter_ms           int                 prov: derived (server)
F18 err_rate_4xx        0..1                prov: measured_server
F19 err_rate_5xx        0..1                prov: measured_server
F20 redirect_rate       0..1                prov: derived (server; hoy no se persiste)
F21 cpu_temp_c          float               prov: unavailable (hoy) | measured_device (sólo shell/ADB)
F22 thermal_status      enum none|light|moderate|severe|critical|unknown
                                             prov: unavailable (hoy) | measured_device (APK: PowerManager, API 29+)
F23 gpu_load_pct        0..100              prov: unavailable
F24 vpu_load_pct        0..100              prov: unavailable
F25 ram_available_pct   0..100              prov: measured_device | measured_host
F26 stutter_probability 0..1                prov: derived | unavailable
F27 zap                 {bool, reason}      prov: derived (device) | none
F28 player_family       enum                prov: measured_device
F29 soc / android       string/int          prov: measured_device
F30 decoder_name / hw_decode                prov: measured_device
F31 confidence          0..1                prov: measured_device  (ya existe: `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/players/adb/collect_player_telemetry.sh:109-110`)
F32 content_*           LAB-owned           prov: lab_ssot (NO device)
```

### 6.2 Matriz de features por familia de player (lo que el ADC puede esperar)

| Feature | APK propio | OTT (ExoPlayer2) | TiviMate/Smarters | VLC | Kodi | hls.js (si existiera) |
|---|---|---|---|---|---|---|
| F01 vst | device | device | device | — | — | device |
| F03/F04 rebuffer | device | device | device | — | — | device |
| F06 drops | device | device (si loguea) | device (si loguea) | — | — | device |
| F08 fps declared | device | device | device | — | — | manifest |
| F09/F10/F11 | **posible** (no cableado) | — | — | — | — | **posible** |
| F12/F13 buffer | device | vía ADB | vía ADB | — | — | device |
| F14 bitrate real | device | device/ADB | ADB | — | — | device |
| F21 thermal temp | sólo ADB shell | — | — | — | — | — |
| F22 thermal status | **posible** (API, sin cablear) | — | — | — | — | — |
| F15-F20 red | server | server | server | server | server | server |
| F26 stutter | derived (F10/F11) | — | — | — | — | derived |

### 6.3 Derivaciones permitidas (con su fórmula y su límite)

```
F05 rebuffer_ratio   = F04 / play_ms                     # exige play_ms; si falta → null
F07 frame_drop_ratio = ΔF06 / Δtotal_frames              # exige total_frames; hoy → null
F13 buffer_pct       = min(100, F12 / 60000)             # denominador supuesto, declararlo
F20 redirect_rate    = redir / max(1, req)               # server-only
F26 stutter_prob     = f(F05, F07) cuando F05∧F07 existen; si no → null
                       NO derivar de jitter/TTFB: eso mide red, no cadencia de imagen
```

### 6.4 Reglas de consumo (no negociables)

1. **Prohibido rellenar.** `unavailable` ⇒ `null`. El fuzzy/Thompson debe tener ramas para `null` (p.ej. usar
   sólo el bloque de red y la política segura `P2`).
2. **`modeled` ≠ `measured`.** `buffer_health_pct` del daemon (`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/prisma_adb_daemon.sh:217-293`) entra como `modeled`
   y **no** puede disparar una decisión de degradación de imagen por sí solo.
3. **Frescura.** `age_ms > 2 × cadencia` ⇒ decaer a prior y marcar `flags: stale_<feature>`.
4. **Atribución antes que métrica.** Sin `channel_id` atribuido (P9/P10), la muestra es de **dispositivo**, no de
   canal; el ADC no debe aprender QoE por canal con muestras sin atribuir.
5. **Separación de procedencias.** `qoe_score` de conviva_events (device) y `riskScore` del mesh (server) **no** son
   la misma escala; el ADC debe normalizar y conservar el `source` que ya devuelve `ape_qoe_state_by_channel()`
   (`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:144-186`).

### 6.5 Enmienda propuesta a `sync_request.schema.json`

El schema actual (`ara-x/vps/schema/sync_request.schema.json:30-73`) hace **imposible** un `/sync` honesto. Propuesta
mínima (compatible hacia atrás para el cliente, endurece el servidor):

```jsonc
"metrics": {
  "required": ["window_s", "source", "content", "prov", "conf"],
  "properties": {
    "cpu_temp_c":        { "type": ["number","null"] },
    "thermal_throttled": { "type": ["boolean","null"] },
    "gpu_load_pct":      { "type": ["number","null"] },
    "vpu_load_pct":      { "type": ["number","null"] },
    "frame_drop_ratio":  { "type": ["number","null"] },
    "stutter_probability": { "type": ["number","null"] },
    "buffer_health_pct": { "type": ["number","null"] },
    "prov": { "type": "object", "additionalProperties": {
      "enum": ["measured_device","measured_server","derived","modeled","lab_ssot","unavailable"] } },
    "conf": { "type": "number", "minimum": 0, "maximum": 1 }
  }
}
```
- `content.*` sigue **requerido** pero su `prov` debe ser `lab_ssot` (el device no lo mide). Alternativa: moverlo a
  `state` como *hint* del VPS.
- `null` es un valor **válido y esperado**; el servidor registra `unavailable` y decide con lo que quede.

---

## 7 · Cadencia y presupuesto (lo que el ADC puede prometer)

| Lane | Cadencia | Latencia a la decisión | Coste | Techo real |
|---|---|---|---|---|
| Observer VPS (P4) + flush (P3) | por request → **60 s** | **60-300 s** | ≈ µs/clave en `log_by_lua` | granularidad de **5 min** en SQLite |
| Reactor/Telescope (P5) | por segmento | inmediato (dict) | bajo | sólo tráfico through-VPS |
| Agente shell (P6) | tiempo real | **< 1 s** | 1 hilo + logcat | depende de que el player loguee |
| APK (P7) | heartbeat **30 s** | 30 s | OkHttp | sólo su propio player |
| ADB host (P8) | 1 s nominal → **3-6 s** real | 3-6 s | **alto**: ~35 `adb shell`/vuelta | saturar ADB degrada el propio device |
| SSE `/ara/events` (P1) | poll 0.5 s / hb 15 s | < 1 s | 1 worker PHP-FPM por device | `pm.max_children=50` (`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward-stream.php:10`) |
| Feedforward SSE (P11) | tick 1-10 s (def. 3) | ≤ 10 s | idem | `dur ≤ 120 s` ⇒ reconexión |
| `/sync` (protocolo) | **30 s ± 20 %** | — | — | primer `/sync` **después** del primer frame (`ara-x/spec/ARA_X_SYNC_PROTOCOL.md:198-206`) |

**Recomendación de cadencia para el ADC (3 carriles):**

| Carril | Periodo | Contenido | Justificación |
|---|---|---|---|
| **Fast** | 3-10 s | `riskScore` del mesh + deltas SSE + `buffer_ms`/`bitrate` si hay ADB caliente | Es lo único con latencia útil para Never-Drop |
| **Sync** | 30 s (protocolo) | vector F01-F32 con `prov/age/conf` | Coincide con `sync_response.valid_until ≤ 120 s` |
| **Slow** | 60 s-5 min | agregados `server_side_qoe_metrics`, `qoe_profile_aggregates` | Es la granularidad real que produce el observer |

**Anti-patrón a evitar:** poner el ADB a 1 s para "tener más datos". `[derivado]` el daemon ya demuestra que cada
vuelta cuesta ~35 llamadas; a 1 s eso es contención de ADB y CPU en el device — **el remedio sería peor que la
enfermedad**.

---

## 8 · Hallazgos (formato del repo)

```
ID: R4-F01
Archivo: vps/prisma/api/conviva-event.php:148-177 · vps/prisma/lib/conviva_qoe_server.php:70-81
Severidad: HIGH
Capa: QoE ingest (server)
Síntoma: la rama Phase-G contempla `decoder_error`, pero `decoder_error` NO está en VALID_EVENT_TYPES.
Causa raíz: la validación (línea 112) corre ANTES del bloque Phase-G; un evento `decoder_error` sale con 400
           `event_type_not_in_enum` y nunca llega al rollback PQ→SDR.
Impacto: el "decoder error" —la señal más directa de pantalla negra— es inalcanzable. La única vía viva es `error`.
Corrección: añadir `decoder_error` (y `device_capabilities`) a VALID_EVENT_TYPES, o emitir `error` con
           `error_code=decoder`. Test: POST con `event_type=decoder_error` ⇒ 200 y delta emitido.
Prueba: lectura estática; reproducible con un POST sintético en lab (APE_LAB_MODE=1).
Estado: ABIERTO
```

```
ID: R4-F02
Archivo: frontend/index-v4.html:4528-4549 · frontend/js/conviva-qoe-engine.js:501-512
Severidad: HIGH
Capa: QoE cliente (navegador)
Síntoma: el motor "Conviva" del navegador no instrumenta playback. Su único llamador real es el evento
         `m3u8-generated` (generación de lista) y hace `reportFirstFrame(sessId)` de inmediato ⇒ VST≈0.
         `reportFrameDrops()` no tiene NI UN llamador en todo el repo (grep).
Causa raíz: se cableó el ciclo de vida de *generación de lista* al ciclo de vida de *sesión de reproducción*.
Impacto: (a) `rebuffer_ratio` y `frame_drop_ratio` del navegador son 0 por construcción; (b) el HDCP-Adaptive
         disparado desde el navegador (`VST>3000`) nunca se activa; (c) un `qoe_score` de navegador es un número
         decorativo. Responde a U6 de la forensia: los `conviva-*.js` son código real apuntando al sujeto equivocado.
Corrección: no cablear `reportFirstFrame` en generación; si se quiere QoE web, crear sesión por `<video>`/hls.js y
            alimentar `reportFrameDrops` desde `getVideoPlaybackQuality()`.
Prueba: grep `reportFrameDrops(` ⇒ sólo la definición; `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html:4538-4540` marca primer frame al generar.
Estado: ABIERTO
```

```
ID: R4-F03
Archivo: ara-x/vps/schema/sync_request.schema.json:30-73
Severidad: HIGH
Capa: Contrato /sync
Síntoma: el schema exige `gpu_load_pct`, `vpu_load_pct`, `cpu_temp_c`, `thermal_throttled`, `frame_drop_ratio`,
         `stutter_probability`, `buffer_health_pct` y los 4 `content.*`. Ninguno se mide en el repo (grep sin hits
         para thermal/mali/utilisation).
Causa raíz: el contrato se escribió desde el ideal del meta-controlador, no desde las primitivas disponibles.
Impacto: un cliente honesto no puede cumplir `/sync` ⇒ o fabrica (viola doctrina) o no sincroniza (rompe Never-Drop).
Corrección: §6.5 — hacerlos `nullable`, añadir `prov`/`conf` y mover `content.*` a `lab_ssot`.
Prueba: validar un vector con `null` en esos campos contra el schema enmendado (test determinista).
Estado: ABIERTO — bloquea R5 si no se enmienda
```

```
ID: R4-F04
Archivo: vps/nginx/lua/qoe_flush_worker.lua:151-155 · vps/prisma/api/qoe-flush.php:100-109
          vps/prisma/lib/conviva_persistence.php:626-635
Severidad: MEDIUM
Capa: QoE server-side
Síntoma: el worker Lua calcula y envía `err4xx`, `err5xx`, `redirect_count`, `seg_latency_ms`; `qoe-flush.php` los
         ignora y `recordServerSideQoE()` no tiene columnas para ellos.
Causa raíz: el "F5 2026-05-21" se implementó en el productor y en el transporte, pero no en la tabla.
Impacto: la señal más rica (4xx vs 5xx, churn de 302, latencia de upstream) se pierde en cada flush.
Corrección: migración aditiva de `server_side_qoe_metrics` (+4 columnas) y paso de argumentos; nunca borrar las 7.
Prueba: flush sintético ⇒ `SELECT err5xx,... FROM server_side_qoe_metrics` con valores.
Estado: ABIERTO
```

```
ID: R4-F05
Archivo: vps/prisma/adb/prisma_adb_daemon.sh:217-293, 317-388
Severidad: MEDIUM
Capa: QoE device (host ADB)
Síntoma: `buffer_health_pct` se **calcula del throughput** (`actual_mbps` vs pisos), no del buffer del player;
         además el JSON hardcodea `"serial": "G4N2JM02434606AT"` y `"chip": "mt8696"` (líneas 322-324).
Causa raíz: el daemon nació como controlador de banda, no como sensor de buffer; el device se fijó en código.
Impacto: (a) el ADC recibiría como "medido" un número que es un modelo de red; (b) si el fleet cambia de SoC
         (S905X4 vs MT8696) el JSON miente sobre la identidad del device.
Corrección: renombrar a `buffer_health_modeled` con `prov=modeled`; leer serial/SoC con `getprop`
            (`ro.serialno`, `ro.soc.model` / `ro.hardware`) como ya hace `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/ape-qoe-agent.sh:33-34`.
Prueba: `dumpsys`/`getprop` comparados con el campo emitido en dos devices distintos.
Estado: ABIERTO
```

```
ID: R4-F06
Archivo: vps/prisma/adb/ape-qoe-agent.sh:116-138
Severidad: MEDIUM
Capa: QoE device (logcat)
Síntoma: el codec/bitrate **real** depende de la línea `omx.video.*bitrateInKbps` y el rebuffer de
         `STATE_BUFFERING`/`STATE_READY`: ambos son específicos de familias ExoPlayer con logger activo.
Causa raíz: no hay rama por familia de player; `current_player()` sólo etiqueta el nombre (líneas 62-69).
Impacto: con Kodi/VLC el agente emite `heartbeat` y poco más, y el ADC puede creer que "no hay problemas"
         (silencio ≠ salud). Es el fallo clásico de telemetría: ausencia leída como cero.
Corrección: emitir `no_signal` explícito por familia cuando en N s no aparezca ninguna primitiva; y añadir
            patrones Kodi/VLC. Test: correr con VLC y verificar `no_signal`, no silencio.
Prueba: lectura estática de los `case` + tags suscritos (línea 98-100).
Estado: ABIERTO
```

```
ID: R4-F07
Archivo: vps/nginx/lua/qoe_server_side_observer.lua:151-167
Severidad: MEDIUM
Capa: QoE server-side
Síntoma: `rebuffer_proxy` = gap > **15 s** entre segmentos; `bps` = `body_bytes*8*1000/upstream_time_ms`.
Causa raíz: el gap de segmentos no distingue "el player no pidió" (pausa, buffer lleno, zap) de "stall"; y el
           "bitrate" es velocidad de upstream, no del decode.
Impacto: un stall de 3-14 s es invisible; un zapping normal puede parecer un rebuffer.
Corrección: (a) exigir ≥2 gaps consecutivos; (b) normalizar `bps` por `request_time` del cliente y marcarlo
            `throughput_upstream`, no `bitrate`; (c) usar `EXT-X-TARGETDURATION` como base del umbral.
Prueba: replay de un log de acceso con un zap conocido ⇒ no debe contar rebuffer.
Estado: ABIERTO
```

```
ID: R4-F08
Archivo: vps/nginx/lua/bandwidth_reactor.lua:140-146 · vps/nginx/lua/prisma_telemetry_full.lua:96-119
Severidad: MEDIUM
Capa: Nomenclatura / decisión
Síntoma: `packet_loss_pct` = ratio de respuestas 5xx. `qoe_score` = 6 términos de **red** (throughput, TTFB,
         jitter, 5xx, estado, tendencia) y `mos_estimated` se deriva de él.
Causa raíz: se reutilizó el vocabulario de QoE para métricas de transporte.
Impacto: el ADC podría "degradar la imagen" por un 5xx del edge creyendo que hay pérdida de paquetes, y llamar
         MOS a un número que no mide percepción.
Corrección: renombrar a `edge_error_rate` y `network_health_score`; no mapear a MOS.
Prueba: grep de consumidores; verificar que ningún decisor use el nombre viejo.
Estado: ABIERTO (bajo riesgo técnico, alto riesgo de lectura)
```

```
ID: R4-F09
Archivo: vps/prisma/lib/ape_mesh.php:124-208
Severidad: MEDIUM
Capa: Bus QoE → decisión
Síntoma: `ape_qoe_state_by_channel()` devuelve QoE "real" (conviva_events, ventana 60 s) o cae a proxy; sin QoE
         devuelve `[]` y `ape_risk_from_qoe([])` = **0.0 = "no degradar"**.
Causa raíz: decisión de diseño (default = comportamiento actual).
Impacto: un cliente no observado (Xray-directo, o player sin telemetría) es indistinguible de un cliente perfecto.
         Never-Drop queda ciego justo donde más duele.
Corrección: exponer `unknown` (no 0) y dejar que el ADC aplique su prior (P2 + buffer seguro) en vez de asumir
            "todo bien". Es un cambio de semántica, no de umbral.
Prueba: unidad sobre `ape_risk_from_qoe([])` ⇒ `null`; consumidores tratan `null` como prior.
Estado: ABIERTO
```

```
ID: R4-F10
Archivo: vps/nginx/lua/quality_realtime.lua:28-30
Severidad: LOW
Capa: Documentación de contrato
Síntoma: el propio endpoint declara "NO TIMING DATA: no VST, no rebuffer. SOLO codec + resolución + ADB".
Causa raíz: es correcto, pero **está repo-only y ausente del VPS** (según `ape-crystal-ultraenhance-apk` ITEM4).
Impacto: si alguien lo toma como fuente de QoE, se equivoca; si se despliega, duplica funciones de
         `combined_body_filter.lua`/`ape_virtual_4k.lua`.
Corrección: no desplegarlo como "QoE"; etiquetarlo como *codec/tier resolver*.
Prueba: `nginx -T` en VPS (no ejecutado aquí).
Estado: INFORMATIVO
```

```
ID: R4-F11
Archivo: vps/prisma/adb/ape-qoe-agent.sh:91 · vps/prisma/lib/conviva_qoe_server.php:96-152
Severidad: LOW
Capa: Contrato de eventos
Síntoma: el agente puede emitir `quality_change` sin `resolution` ni `codec` (sólo `decoded`), y `channel.id`
         puede ir como `auto`; la validación exige `channel.name` no vacío y `player` en enum.
Causa raíz: `emit()` arma JSON libre; el server valida un enum estricto de 10 tipos y 10 players.
Impacto: un evento con enum fuera de lista se descarta con 400 sin reintento útil (la cola reintenta el mismo JSON).
Corrección: validar en el cliente antes de encolar; loggear el 400 con el motivo.
Prueba: POST con `player: "crystalagent-kotlin"` ⇒ 400 (esto ya pasó, ver `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/QoEReporter.kt:152-156`).
Estado: ABIERTO (menor, pero genera pérdida silenciosa)
```

```
ID: R4-F12
Archivo: backend/onn_settings_global_pq.txt (dump real) vs docs/REA_SCOPE_AND_ARTIFACTS.md:304-322
Severidad: MEDIUM
Capa: Identidad de device
Síntoma: el repo se refiere al device como "ONN 4K / S905X4" (ara-x/README) y a la vez hardcodea "mt8696 / Fire TV"
         (prisma_adb_daemon.sh, `ape-crystal-ultraenhance-apk`); el dump `onn_settings_global_pq.txt` muestra
         `ai_pic_mode`, `color_depth=12`, `ai_sr_level=3` — familia MediaTek, no Amlogic.
Causa raíz: convivencia de dos equipos (ONN 4K y Fire TV 4K Max) con nombres cruzados en scripts y docs.
Impacto: gating por SoC (`ape_soc_allowlisted`) y features del ADC pueden aplicarse al SoC equivocado ⇒ palancas
         inexistentes (o peores: existentes y no aplicadas).
Corrección: `soc` obligatorio y **medido** (`getprop ro.soc.model` / `ro.hardware`) en cada muestra y en `/sync`;
            prohibido hardcodear serial/chip.
Prueba: `/sync` con `soc` distinto ⇒ rama de allowlist distinta.
Estado: ABIERTO
```

---

## 9 · Plan de verificación en device (read-only) — `[NOT_RUN]`

Todo lo que sigue es **sólo lectura** y no se ejecutó aquí (no hay device en este host: `docs/REA_SCOPE_AND_ARTIFACTS.md:350-356`).
Ejecutarlo cierra N5 y confirma/refuta N3/N4 antes de cablear features térmicas.

```bash
# 0. Identidad (obligatoria para el ADC)
adb -s $T shell getprop ro.serialno
adb -s $T shell getprop ro.hardware          # amlogic / mt8696 ...
adb -s $T shell getprop ro.soc.model         # API 31+
adb -s $T shell getprop ro.build.version.sdk

# 1. Temperatura (N5) — ¿legible sin root?
adb -s $T shell 'for z in /sys/class/thermal/thermal_zone*; do echo -n "$z "; cat $z/type; cat $z/temp; done'
adb -s $T shell dumpsys thermalservice | head -40          # estado de throttling (API 29+)

# 2. GPU (N3) — se espera NO (sin API pública; sólo shell/root)
adb -s $T shell 'ls -l /sys/class/misc/mali0/device/ 2>/dev/null; cat /sys/class/misc/mali0/device/utilization 2>/dev/null   # algunos kernels: utilisation'

# 3. Codec / decoder / resolución reales (L2)
adb -s $T shell dumpsys media.codec | grep -iE 'video/|c2\.|OMX\.|state'
adb -s $T shell dumpsys media.metrics | head -60

# 4. FPS/refresh del display (declarado del panel, NO del stream)
adb -s $T shell dumpsys display | grep -iE 'mDisplayWidth|mDisplayHeight|refresh|active mode'

# 5. HDR de salida (N9)
adb -s $T shell dumpsys SurfaceFlinger | grep -iE 'hdr|dataspace'

# 6. Log del player (L1) — verificar qué emite realmente cada uno
adb -s $T shell logcat -d -t 400 ExoPlayerImpl:D MediaCodecVideoRenderer:D MediaCodecLogger:I MediaCodec:E *:S
```

**Cómo se registra el resultado:** cada comando ⇒ una fila `[observado]` con el device y el build; si devuelve vacío,
se escribe `[no disponible]` y la feature queda `null`. **No** se convierte un vacío en 0.

También queda pendiente de verificación (no bloquea R4): `qoe_metrics` realmente poblado en el VPS
(`IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-qoe-observer.conf:42` sugiere `curl localhost/prisma/api/qoe-flush.php`), y `conviva.db` con filas
(el estado histórico medido era `0 B`).

---

## 10 · Anexo A — Citas (todo lo anterior se apoya aquí)

| Afirmación | Evidencia |
|---|---|
| SSE `/ara/events`: poll 0.5 s, hb 15 s, 3600 s, 50 deltas | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/events-sse.php:58-100` |
| Auth Bearer obligatoria; `device_id_required`; no token por query | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/events-sse.php:20-35` · `ape-crystal-ultraenhance-apk` ITEM1 |
| Pipeline de eventos y enum de 10 tipos / 10 players | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_qoe_server.php:69-88` |
| Umbrales RBR 2 %, QoE 50/80, FDR 5/s, VST 3000 ms | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_qoe_server.php:62-67`, `:241-264` |
| `qoe_score` es un stub por tipo de evento | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_qoe_server.php:210-236` |
| Atribución de canal por IP (`REMOTE_ADDR` → device_state) | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php:81-96` · `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:95-105` |
| `heartbeat` va a `ara_heartbeats` y sale antes del dispatch | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php:126-135` · `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:392-412` |
| Phase-G usa `decoder_error` (no validado) | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php:152-177` vs `:70-81` |
| Tablas: `conviva_events`, `channel_hdcp_profile`, `server_side_qoe_metrics`, `qoe_profile_aggregates`, `max_quality_channels` | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_persistence.php:82-201` |
| `recordServerSideQoE()` sólo persiste 7 campos | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_persistence.php:626-635` · `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/qoe-flush.php:100-109` |
| F5 (4xx/5xx/redir/latencia) se calcula y se envía, pero no se guarda | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/qoe_flush_worker.lua:117-155` |
| Observer: VST_proxy, rebuffer>15 s, bps, err/redir, latencia | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/qoe_server_side_observer.lua:60-173` |
| Flush cada 60 s a `127.0.0.1:8099`, sólo worker 0, 2000 claves | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/qoe_flush_worker.lua:20-36`, `:161-171` |
| `qoe-flush` sólo acepta loopback | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/qoe-flush.php:56-62` |
| Reactor: TTFB, jitter EWMA, anillo L1, 5xx como "loss" | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor.lua:66-146` |
| Telescope: `qoe_score` de 6 términos de red + MOS derivado | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/prisma_telemetry_full.lua:91-119` |
| Agente shell: tags, patrones, flush 30 s, heal 60 s, SSE | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/ape-qoe-agent.sh:96-140`, `:80-86`, `:50-57`, `:274-298` |
| Agente shell: identidad por `ro.serialno` | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/ape-qoe-agent.sh:33-34` |
| Daemon: 1 s nominal, throughput, modelo de buffer, JSON, serial hardcodeado | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/adb/prisma_adb_daemon.sh:16`, `:151-211`, `:217-293`, `:317-388` |
| Telemetría ADB expuesta con frescura 120 s | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/prisma-adb-telemetry.php:23`, `:77-80` |
| Parser universal: codec/res/bitrate/decoder/buffer/drops | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-telemetry-installer/ape-telemetry-universal.sh:199-249` |
| Props de logging (MediaCodec/ExoPlayer, buffer 4 MB) | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-telemetry-installer/ape-telemetry-universal.sh:182-194` |
| Collector con confianza 0..1 y `last_error` | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/players/adb/collect_player_telemetry.sh:29-110`, `:120-141` |
| Probe QoE con `dumpsys`/`top`/`meminfo`/ping | `IPTV_v5.4_MAX_AGGRESSION/vps/sentinel/lib/probe_qoe.sh:30-99` |
| Guardian: 1 s (0.5 s emergencia), ADB cada 2 ciclos, buffer % sobre 60 s | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/main.py:405-414` · `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py:134-143`, `:464-467` |
| Patrones ExoPlayer: `bufferedDurationUs`, `droppedFrames`, `bitrateInKbps`, `audioUnderruns` | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py:116-123`, `:368-439` |
| Detección de zap (pid/codec/res/colapso) | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/ape_realtime_guardian/probes/adb_player.py:29-71` |
| APK: heartbeat 30 s, `quality_change`, `caps` (display modes, HDR, códecs) | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/QoEReporter.kt:34-55`, `:60-68`, `:93-134` |
| APK: `device_capabilities` (tipo no aceptado por el server) | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/QoEReporter.kt:71-80` vs `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_qoe_server.php:70-81` |
| APK: guard de stall por frame (interno, no exportado) | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/fluid/core/PlaybackGuard.java:150-231` |
| Navegador: sesión al generar lista; `reportFrameDrops` sin llamadores | `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html:4528-4549` · `IPTV_v5.4_MAX_AGGRESSION/frontend/js/conviva-qoe-engine.js:501-512` |
| SSE del navegador opt-in (`CONVIVA_STREAM_AUTOCONNECT`) | `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html:4569-4601` |
| `/a/2` contrato + gate por UA (OTT sí; TiviMate no) | `docs/rea/14_APE_A_CONTRACT.md:9`, `:38-46` |
| `/a/2` medido 200 en loopback y 443, 10.520 líneas | `deliverables/VALIDACION_ENTREGA_2026-10-28/VALIDACION.md:11`, `:45` |
| `/omega/open` escribe device_state por IP real | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_device_state_writer.lua:4-17` |
| Actuador: QoE → `riskScore` por tick, dedup md5, hb | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward-stream.php:29-30`, `:79-88`, `:117-136` |
| `ape_risk_from_qoe`: proxy → riesgo; sin QoE = 0 | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:194-208`, `:124-152` |
| Térmico: 0 lecturas implementadas; el enum de la API es la única señal sin ADB | `ara-x/reports/R5_actuators.md:371-394` |
| `frame_drop_ratio` derivable sólo en el APK (`DecoderCounters`) | `ara-x/reports/R5_actuators.md:382` |
| Reglas del gobernador térmico + `INV-6` (`null != 0`) | `ara-x/reports/R5_actuators.md:420-431` |
| `quality_realtime.lua` no tiene timing | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/quality_realtime.lua:28-30` |
| Cadencia `/sync` 30 s ± 20 %, primer sync tras primer frame | `ara-x/spec/ARA_X_SYNC_PROTOCOL.md:198-206` |
| Campos requeridos por el contrato `/sync` | `ara-x/vps/schema/sync_request.schema.json:27-73` |
| OTT 1.7.3.3 = ExoPlayer 2 + FFmpeg; VLC sin `libvlc.so`; 0 hits "conviva" | `docs/REA_SCOPE_AND_ARTIFACTS.md:149-168` |
| Inventario de players en disco (sólo OTT; sin TiviMate/Disney/Prime) | `docs/REA_SCOPE_AND_ARTIFACTS.md:335-348` |
| No hay device ADB en este host | `docs/REA_SCOPE_AND_ARTIFACTS.md:350-356` |
| U6 (¿conviva real o stub?) | respondido en R4-F02 |

---

## 11 · Anexo B — Respuestas a las incógnitas del equipo

| ID | Incógnita | Respuesta de R4 |
|---|---|---|
| **U6** | ¿Los `conviva-*.js/php` son vigentes o stubs? | **Mixto, y hay que decirlo así:** el **servidor** es real y persiste (schema + SQLite + flush + SSE). El **motor de navegador** es código real **mal apuntado** (instrumenta la generación de lista, no el playback) ⇒ su FDR/RBR/VST no valen. El **APK** reporta sólo heartbeat/quality_change útiles; su `device_capabilities` es rechazado por el server (R4-F01). |
| **U3** | ¿VLC seleccionable en OTT 1.7.3.3 pese a no traer `libvlc.so`? | Sigue **abierto**; R4 sólo aporta la consecuencia QoE: si el usuario elige motor VLC en ese build, **no habría telemetría L1/L2 de ese player** (sería L3 puro). |

---

## 12 · Resumen para el capitán (una pantalla)

1. **Hay dos telemetrías de verdad**: (a) el agente **shell/ADB** sobre logcat —sub-segundo, rica sólo en familias
   ExoPlayer— y (b) el **observer de nginx** —gratis, 60 s, sólo tráfico through-VPS—. Todo lo demás es derivado,
   modelado o inexistente.
2. **El navegador no mide playback.** Su motor QoE está cableado a la generación de la lista ⇒ `reportFrameDrops`
   sin llamadores, VST≈0. Responde U6.
3. **El schema `/sync` pide 11 magnitudes que nadie mide** (GPU, VPU, temperaturas, drop ratio, stutter, buffer %,
   content). Sin enmienda (§6.5) el ADC nace mintiendo.
4. **`/a/2` no es una señal universal de zap**: sólo OTT lo consume.
5. **Lo que sí recomiendo cablear al ADC ya**: `vst` (device+server), `rebuffer_events/ms`, `bitrate_bps`,
   `buffer_ms`, `err_rate_4xx/5xx`, `throughput/ttfb/jitter`, `zap`, `player_family/soc`, y `conf`.
   Lo demás: `null` con `prov=unavailable`, y el fuzzy aprende con menos features en vez de con features falsas.
6. **Riesgo activo más alto:** R4-F03 (contrato irreal) y R4-F01 (`decoder_error` inalcanzable: la señal de pantalla
   negra no puede llegar al rollback PQ→SDR).

**Provenance de este documento:** lectura estática de **35 archivos** del repo (92 referencias verificadas); **ningún**
dato de device ni de VPS medido en esta tarea. Todo lo que dice "medible" y no está en un `[observado]` es una **hipótesis de verificación**
(§9), no un hecho.
