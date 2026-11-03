# Council S5 — Telemetría QoE/QoS: métricas realmente calculadas vs declaradas

**Rol:** s5-qoe-qos (S5 · QoE/QoS researcher). **Fase:** Council, SOLO LECTURA.
**Snapshot:** `git rev-parse HEAD` → `e38a89bb30c02cb41050f34cef43d3711a2b0644` (`e38a89b`), exit 0. Árbol con WIP de otras sesiones (no tocado).
**Ejecutado:** solo lectura. Cero cargas contra VPS/producción, cero series temporales, cero promedios, cero escrituras fuera de este archivo, cero secretos impresos.
**Caveat obligatorio:** los anchors de playlist son metadata (RFC 8216 §6.3.1). Un tag `#EXT-X-APE-*` **no mide ni transporta telemetría**: ningún player lo ejecuta. Toda cifra QoE "de producción" exige un productor desplegado + almacén con filas; nada de eso está probado aquí.

---

## 1. Alcance, método y denominador

**Inspeccionado (read-only):** `frontend/js/conviva-qoe-engine.js` (613 L) · `vps/nginx/lua/qoe_server_side_observer.lua` (180 L) · `vps/nginx/lua/qoe_flush_worker.lua` (207 L) · `vps/nginx/snippets/prisma-qoe-observer.conf` (49 L) · `vps/nginx/conf.d/prisma-qoe-metrics.conf` (6 L) · `vps/prisma/api/qoe-flush.php` (178 L) · `vps/prisma/lib/conviva_persistence.php` (897 L) · `vps/prisma/lib/conviva_qoe_server.php` (265 L) · `vps/prisma/lib/lab_tier_qoe_aggregator.php` (216 L) · `vps/prisma/lib/ape_mesh.php` (§D6) · `vps/prisma/api/{conviva-event,conviva-stream}.php` · `vps/prisma/config/lab_tier_qoe_feedback.json` · TTLs SQLite declarados · el emisor `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (todas las ocurrencias de VMAF/MOS/PSNR/SSIM/TELCHEMY/SCORECARD) · `frontend/index-v4.html` (cableado) · `tools/adb_conviva_push_agent.py`.

**Denominador.** "Calculado" = hay una expresión aritmética en código ejecutable. "Medido" = además hay productor desplegado + almacén con filas fechadas. **Nada en este dominio alcanza "medido"**: el observador y el flush worker están en la lista de **22 módulos `.lua` nunca desplegados** (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:131` — `qoe_server_side_observer` 10 641 B · `qoe_flush_worker` 11 412 B · `bandwidth_reactor` 13 625 B · `reactor_tick` 2 811 B), y `audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md:203` no registra ni una fila.

**Comandos de verificación usados:** `git rev-parse HEAD`; `git show HEAD:<ruta> | Select-String -Pattern` para fijar `archivo:línea`; prueba de regex de `channel_id` con 4 URIs de muestra (§S5-04).

**Nota de método (importante, verificada):** dos archivos que cito están **`M` (dirty) en el árbol de trabajo**, con WIP de otra sesión que **desplaza líneas entre lecturas** — `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (HEAD 11 144 L vs worktree 11 443 L; `#EXT-X-TELCHEMY-TVQM` pasó de 5949→6139→6039 en tres lecturas sucesivas) y `frontend/index-v4.html`. Por eso **todas** las citas de esos dos archivos son del **blob inmutable `git show HEAD:`**, reproducibles byte a byte sobre `e38a89b`. Los archivos de telemetría (Lua/PHP/JS-QoE) **no** están dirty: sus líneas son estables. El lector de líneas largas del harness también renumera `m3u8…js` (21 581 vs 11 144): uso la numeración del blob, no la del visor.

---

## 2. Inventario: métricas que SÍ se calculan, y su fórmula exacta

| # | Métrica (nombre real) | Fórmula en código | Fuente |
|---|---|---|---|
| M1 | `VST_proxy` | `now_ms − dict["mts:<ip>\|<ua8>:<ch>"]`, sólo si el 1er segmento 200 llega ≤60 000 ms | `qoe_server_side_observer.lua:74-77,121-132` |
| M2 | `rebuffer_count` (por canal) | `+1` si `gap` entre segmentos del mismo par `(ip\|ua8, ch)` **> 15 000 ms** | `observer.lua:151-160` |
| M3 | `bps` (por canal) | `body_bytes_sent × 8 × 1000 / upstream_response_time_ms` → **bits/s** | `observer.lua:163-167` |
| M4 | `req` / `err` / `cerr` / `serr` / `redir` | contadores `dict:incr` por canal; `err` = status ≥400; `serr` = ≥500; `cerr` = resto; `redir` = 301/302 | `observer.lua:60-72` |
| M5 | `latsum` / `latcnt` → `seg_latency_ms` | Σ `upstream_response_time_ms` / nº segmentos | `observer.lua:169-173`; `flush:141` |
| M6 | `vst_proxy_avg` / `_max` | `floor(Σvst / Σcount)` y `max(vst)` **sobre las claves del dict** | `qoe_flush_worker.lua:56-63,139` |
| M7 | `bitrate_avg_bps` | `floor(Σbps / Σcount)` | `flush:82-88,140,150` |
| M8 | `error_rate` (derivada al leer) | `err / req` | `ape_mesh.php:188-190` |
| M9 | `qoe_score` (persistido) | **tabla fija por `event_type`**: `first_frame`→90/70/50/30 por umbrales de VST; `rebuffer_start`→40; `rebuffer_end`→70; `error`→25; `end_session`→`data.final_qoe` o **75** | `conviva_qoe_server.php:168,210-236` |
| M10 | `riskScore` desde QoE | `100 − qoe_score` (rama "real"); si no, suma de umbrales vst/rebuffer/err | `ape_mesh.php:178-192` |
| M11 | `QoE` browser (0-100) | `100` menos penalizaciones aditivas: VST ≤25, RBR ≤40, FDR ≤20, bitrate ≤15, errores ≤15, yoyo 10 → **clamp 0..100** | `conviva-qoe-engine.js:221-271` |
| M12 | `rebufferRatio` browser | `(totalRebufferMs + rebufferEnCurso) / (now − createdAt)` | `engine:275-280` |
| M13 | `frameDropRate` browser | `(dropped_último − dropped_10-muestras-atrás) / Δt_seg` | `engine:282-290` |
| M14 | `avgBitrate` browser | media aritmética de `bitrateHistory` (últimos ≤300 samples) | `engine:292-296` |
| M15 | `rebuffer_ratio` / `error_ratio` (perfil) | `Σrebuf / Σreq` y `Σerr / Σreq` | `lab_tier_qoe_aggregator.php:114-115` |
| M16 | `target_factor` (sugerencia LAB) | histéresis: `VST>1500 ms` → −0.20; `VST<500 ms ∧ rbr<0.005` → +0.10; bounds [0.5,1.5]; ≥20 req; ventana 6 h | `lab_tier_qoe_aggregator.php:36-54,130-146` |
| M17 | `frame_drop_rate` (agente ADB) | `dropped × 1000 / window_ms` → frames/s | `tools/adb_conviva_push_agent.py:88-93` |

**Lo aritméticamente correcto (crédito explícito):** M3 es dimensionalmente coherente en bits/s; M17 es frames/s correcto; M11 está clampado y es determinista; M16 tiene histéresis real y es observe-only (no auto-aplica: `lab_tier:18-24,155`); `lab_tier_qoe_feedback.json` está **vacío** (`profiles:{}`), no pre-poblado con cifras inventadas.

---

## 3. Unidades y ventanas: declarado vs código

| Declarado | Dónde | Código real | Veredicto |
|---|---|---|---|
| `bitrate_proxy = body_bytes_sent / upstream_response_time` (**bytes/s**) | `observer.lua:12` | `bytes × 8 × 1000 / ms` (**bits/s**) — `:165`; campo `bitrate_avg_bps` (`flush:150`) | **Drift de unidad en la cabecera**; el código es bps (correcto para el nombre del campo) |
| `rebuffer_proxy = gaps > 2 × segment_duration` | `observer.lua:11` | `gap_ms > 15000` (constante, sin duración de segmento) — `:157` | **Fórmula declarada NO implementada**: server-side no conoce `segment_duration` |
| `rebuffer (gap entre segmentos > 15s)` | `CLAUDE.md:335` | `:157` | **PASS** (coincide con el código, no con la cabecera del Lua) |
| `rebuffer_ratio` (industria: `stall_time / play_time`) | `.agents/skills/rebuffering-ratio-calculator` | `Σrebuf / Σreq` (**conteo / requests**) — `lab_tier:114` | **Unidad distinta**: no es tiempo; no comparable con el benchmark 0.5 % |
| `Si rebuffer > 2% → modo supervivencia` | `engine:21` | `rbr > 0.05` (5 %) — `engine:57,351` | **FAIL de contrato**: doc 2 % · código 5 % · `conviva_qoe_server.php:62` 2 % "por paridad con el engine" |
| Ventana "5 min" | `persistence:131` (`bucket_5min`), `observer` cabecera | TTLs reales: `req/err/serr/cerr/redir` 300 s · `vst/bps/rebuf` **600 s** · `prof/mq` 3600 s (`observer:63,70,132,158,166,171-172,83,111`); **y el flush borra las claves cada 60 s** (`flush:190-192`) | **`bucket_5min` es sólo etiqueta**: 5 filas por bucket, cada una ≈60 s de datos heterogéneos |
| "µs vs ms" | `observer:54` | `ngx.now()*1000` → ms entero; `upstream_response_time` s→ms `:58` | **PASS** (todo en ms enteros, sin µs) |
| `VSTQ=50 / VSMQ=50 / EPSNR=45` | `m3u8-typed-arrays-ultimate.js:5949`; `X-VSTQ-Score:'50'` `:5748` | Sin escala ni unidad definida en el repo; la skill local `telchemy-vstq-vsmq-tr101290-validator` es un stub sin tabla | **Unidad no interpretable** (escala MOS-like del estándar es 1–5) |

---

## 4. Cobertura de players y zona ciega

| Camino | Productor | Estado real | Qué mide de verdad |
|---|---|---|---|
| Browser (Navigator UI) | `conviva-qoe-engine.js` | **En página, desconectado del playback** | Nada de reproducción: ver **S5-12** |
| Nativos vía `log_by_lua` | `qoe_server_side_observer.lua` | **NO desplegado** (`VPS_REALITY…:131`); snippet de activación **comentado** (`prisma-qoe-observer.conf:46-48`) y encadenado desde `bandwidth_reactor.lua:275` / `reactor_tick.lua:58`, ambos también en la lista de no desplegados | Proxy de red no-perceptual (si algún día corre) |
| Nativos vía manifiesto (`#EXT-X-APE-QOE-ENGINE` + `TELEMETRY_ENDPOINT`) | Emisor `m3u8…js:2393-2400`; **presente en la lista servida** (`_raw_census_vigente.txt:108`) | **Inerte por RFC 8216 §6.3.1** — el propio emisor lo admite (`:2388-2389`) | Nada |
| Nativos vía logcat (ExoPlayer/MediaCodec) | `tools/adb_conviva_push_agent.py` + `vps/prisma/adb/ape-qoe-agent.sh` + `QoEReporter.kt` | Daemon de host + APK; **sin evidencia de ejecución en esta fase** (no se corrió nada) | VST/rebuffer/bitrate/frame-drop **por regex de logcat** |
| Ingesta | `conviva-event.php` → `ConvivaQoEServer` → `conviva.db` | Endpoint y esquema existen; **almacén sin filas y path en disputa** (§S5-18) | `qoe_score` = stub (§S5-05) |

**Ciego por diseño (declarado honesto):** frame drops y errores de decoder **no derivables server-side** (`CLAUDE.md:337`); `ape_mesh.php:102-106` declara que su QoE es *proxy de red, NO perceptual*. **Ciego no declarado:** (a) el observador sólo reconoce `.ts`/`.m4s` (`observer.lua:36`) ⇒ segmentos `.mp4`/`.aac`/`.m4a` y DASH quedan fuera; (b) los patrones logcat son de ExoPlayer ⇒ **VLC, Kodi y Smart TV (Tizen/webOS) sin telemetría**; (c) clientes que no pasan por el shield (Xray-directo) no generan proxy-QoE (`ape_mesh:106`); (d) iOS/AVPlayer sin agente.

---

## 5. Documentado sin implementación (NOT_RUN) · Implementado sin documentar

**5.1 Declarado y NO implementado**

| Declarado | Dónde | Realidad |
|---|---|---|
| `EBVS` (exit before video start) | `engine:11` | Implementado sólo como `!firstFrameAt` en `endSession` (`:212`) — válido pero **sin productor que cierre sesiones de playback** |
| `CIRR` (connection induced rebuffer rate) | `engine:15` | **No existe** ningún `cirr` en el repo → **NOT_RUN** |
| `EPF` (ended play fraction) | `engine:16` | **No existe** → **NOT_RUN** |
| `avgVST`, `totalRebufferEvents`, `worstChannel` | `engine:38-44` | Se declaran y **nunca se actualizan** (sólo `avgQoE` en `:586`) ⇒ `getGlobalStats()` devuelve ceros que aparentan medición |
| `/qoe-report` "desde telemetry endpoint o logs" | `.claude/commands/qoe-report.md:2,13` | No hay endpoint ni log con datos QoE ⇒ el comando no tiene fuente: **NOT_RUN** |
| `error_rate` como columna | `observer.lua:13` | No hay columna: sólo `error_count`/`request_count` (ratio derivada en `ape_mesh:190`) |

**5.2 Implementado y NO documentado** (ni en `CLAUDE.md` ni en la cabecera del módulo)
- `cerr`/`serr`/`redir` (split 4xx/5xx y churn 301/302) — `observer.lua:64-70`.
- `latsum`/`latcnt` → `seg_latency_ms` — `observer.lua:169-173`; `flush:141,154`.
- `mq` / `mqcasc` → tabla **`max_quality_channels`** — `observer.lua:107-117`; `flush:96-116`; `qoe-flush.php:155-164`; DDL `persistence:189-200`. No figura en `CLAUDE.md`.
- Tabla **`qoe_profile_aggregates`** — `persistence:147-161`. `CLAUDE.md:345` sólo menciona "`server_side_qoe_metrics` + 2 métodos" (hay **2 tablas y ≥6 métodos** de QoE).
- `LabTierQoeAggregator` completo (bucle Conviva→LAB) — `lab_tier_qoe_aggregator.php` (216 L). Sin mención en `CLAUDE.md`.

---

## 6. Cifras QoE inventadas, disensos y veredicto

### 6.1 Cifras que aparentan medición y son constantes

| Cifra emitida | Archivo:línea | Por qué es fabricación |
|---|---|---|
| `#EXT-X-TELCHEMY-TVQM:VSTQ=50,VSMQ=50,EPSNR=45,MAPDV=10,PPDV=5` | `m3u8…js:5949` | Constantes; el productor es `build_http_anabolic_demo_headers()` — el propio nombre dice **demo** (`:5570,5757`) y sí está cableado a la emisión (`:5149`) |
| `#EXT-X-TELCHEMY-TR101290:SYNC_LOSS=0,CC_ERROR=0,PCR_ERR=0,SYNC_BYTE_ERR=0` | `:5950` | No hay un solo analizador MPEG-TS/TR 101 290 en el repo |
| `#EXT-X-APE-TELCHEMY:VSTQ=50,EPSNR=45,MOS=4.8,JITTER=0,LOSS=0` | `:8624` | Constantes en `generateChannelEntry()` (llamada real: `:10203`) |
| `#EXT-X-APE-TELCHEMY-QOE:VMAF=…,PSNR=42,SSIM=0.99` | `:8626` | `PSNR=42` y `SSIM=0.99` fijos |
| `#EXT-X-APE-TELCHEMY-LATENCY:STARTUP=0ms,REBUFFER=0ms,ZAPPING=<30ms` | `:8628` | **0 ms medidos** sin medición; `ZAPPING<30ms` imposible conocido |
| `#EXT-X-APE-SCORECARD:…MOS=4.8,PSNR=42,SSIM=0.99,REBUFFER=0,STARTUP=0` | `:8639` | Un **scorecard** con ceros se lee como medición, no como target |
| `#EXT-X-APE-QUALITY-OVERRIDE-PSNR:42` / `-SSIM:0.99` | `:8918-8919` | "override" de métricas que nadie calculó |
| `#EXT-X-APE-CORTEX-TELEMETRY-VMAF/MOS/PSNR/SSIM` | `:9248-9251` | Se llama **TELEMETRY** a 4 constantes |
| `X-Metrics-Endpoint: https://qos.edge-cdn.net/report` | `:5754` | Destino de telemetría en **dominio ajeno** al proyecto, contradictorio con `TELEMETRY_ENDPOINT=iptv-ape.duckdns.org` (`:2393-2400`) |

**Atenuantes verificados (no todo el dominio miente):** `X-QoE-Target-MOS:4.8`, `X-Rebuffer-Tolerance:0`, `X-VMAF-Target:88` y `#EXT-X-SESSION-DATA com.ape.qos.target_mos=4.8` **son targets** y están rotulados como tales (census `:108,53`); `docs/**/*.md` **no contiene** ninguna cifra QoE presentada como medida (búsqueda negativa ejecutada: 0 coincidencias de `VST NNNms`, `rebuffer N%`, `MOS n.n` en `docs/`).

### 6.2 Hallazgos numerados

- **S5-01 · CRITICAL.** Cifras QoE fabricadas en artefactos emitidos (§6.1, `m3u8…js:5949-5950,8624-8641,8918-8919,9248-9251`). Viola la regla cardinal "No datos falsos" de `AGENTS.md`. Ningún player las lee, pero cualquier auditor o dashboard downstream las tomaría por medición.
- **S5-02 · CRITICAL.** El `qoe_score` que alimenta el lazo de decisión es un **stub de 5 constantes** (`conviva_qoe_server.php:168,210-236`) y `ape_mesh.php:113-115,181` lo consume como **"QoE REAL"** y lo convierte en `riskScore = 100 − qoe_score`, que los engines usan para "reducir agresión" (`:174-177`). Hoy inerte por falta de filas; con el primer evento, el actuador se mueve con una constante.
- **S5-03 · HIGH.** `VST_proxy` **no es VST**: mide *manifest→petición del 1er segmento* (`observer.lua:74-77,121-132`), no *→primer frame*. Se compara contra el umbral de 3000 ms del VST del browser (`engine:81`) sin equivalencia establecida, y dispara el motor HDCP-Adaptive (`observer.lua:134-143`).
- **S5-04 · HIGH.** `channel_id` de segmentos no matchea la forma Xtream canónica: patrón `/(%d+)/[^/]+%.ts` (`observer.lua:49-50`) exige **directorio numérico**. Verificado con 4 URIs: `/live/abc/def/12345.ts` → **no match**; `/shield/ab12/host/live/abc/def/12345.ts` → **no match**; sólo `/shield/ab12/host/12345/seg1.ts` matchea. El manifiesto sí extrae `12345` (`:48`) ⇒ la clave `mts:` (manifiesto) y la del segmento (**`"unknown"`**) nunca coinciden ⇒ **VST_proxy estructuralmente 0**, y rebuffer/bitrate se agregan bajo el canal `unknown`.
- **S5-05 · HIGH.** `vst_proxy_avg == vst_proxy_max` siempre: el observador **sobrescribe** una única clave por canal (`observer.lua:132`) y el flush promedia `suma/cuenta` sobre esa única clave (`flush:57-62,139`) ⇒ N=1. Igual para `bitrate_avg_bps` (`observer.lua:166`; `flush:140,150`). Los nombres "avg"/"max" son falsos.
- **S5-06 · HIGH.** `bitrate_avg_bps` no es bitrate de medios: es **throughput de descarga del último segmento** (`bytes×8/upstream_response_time`, `observer.lua:165`), no `bytes / duración_de_segmento`. Sobrestima en enlaces rápidos y no es comparable con `BANDWIDTH` del manifiesto.
- **S5-07 · HIGH.** Contrato roto productor↔consumidor: `ape_mesh` lee `data_json.vst_ms` y `data_json.rebuffer_duration_ms` (`:131-132`), pero el productor ADB emite `startup_time_ms` (`adb_conviva_push_agent.py:61`) y `rebuffer_*` **sin payload** (`:68,74`) ⇒ `vst`/`rebuffer` de la rama "real" son siempre `null`.
- **S5-08 · HIGH.** `decide()` lee `data.rebuffer_ratio` (`conviva_qoe_server.php:243`) que **ningún productor envía** (0 productores en el repo) ⇒ `FORCE_SURVIVAL_MODE` es inalcanzable por esa vía.
- **S5-09 · MEDIUM.** El enriquecimiento F5 se calcula y se transporta **para ser descartado**: `err4xx/err5xx/redirect_count/seg_latency_ms` van en el payload (`flush:151-154`) pero `qoe-flush.php:100-109` sólo pasa 8 campos a `recordServerSideQoE()` y la tabla no tiene esas columnas (`persistence:128-140`); en cambio `lab_tier_qoe_aggregator.php:78-81` sí las lee del payload crudo ⇒ dos consumidores con vistas distintas del mismo mensaje.
- **S5-10 · MEDIUM.** `readServerSideQoESnapshot()` no agrega dentro del bucket: el `INNER JOIN` devuelve **todas** las filas de `MAX(bucket_5min)` (`persistence:716-724`) y con flush cada 60 s son ~5 filas/canal; `ape_mesh:148-149` hace *last-write-wins* en orden arbitrario.
- **S5-11 · HIGH.** El motor del browser **no mide reproducción**: su único cableado es el evento `m3u8-generated` con `reportFirstFrame()` inmediato y `endSession(...,'list_published')` (`index-v4.html:4518-4537`) ⇒ `VST ≈ 0` por construcción; `reportRebufferStart/End`, `reportBitrate`, `reportFrameDrops`, `reportQualityChange` **no se llaman en ninguna parte** ⇒ `rebufferRatio`, `frameDropRate` y `avgBitrate` quedan en 0 y el `QoE` score es estructuralmente ~100 mientras el banner diga "Disney+ Grade Telemetry Active" (`engine:607`).
- **S5-12 · MEDIUM.** Nombres de evento desalineados: el motor emite `conviva-qoe-tick` (`engine:572`) y la página escucha `conviva:qoe-update` (`index-v4.html:4541`) ⇒ listener muerto.
- **S5-13 · MEDIUM.** "Ventana de 5 min" no existe como agregación (§3): TTLs dispares + borrado por flush ⇒ cada fila cubre ~60 s de señales con vidas distintas.
- **S5-14 · MEDIUM.** `conviva.db = 0 B` (doctrina, `CLAUDE.md:9`; `VPS_DRIFT_VS_REPO.md:203`) apunta a `/var/www/html/prisma/db/conviva.db`, pero el productor escribe en **`/opt/netshield/data/conviva.db`** (`conviva_persistence.php:40`; `ape_mesh:204`). La medición **no prueba** el estado del almacén real ⇒ el estado del almacén es **NOT_RUN**, no PASS ni FAIL.
- **S5-15 · LOW.** `VSTQ/VSMQ/EPSNR` sin escala ni unidad definida en el repo (§3, última fila).

### 6.3 Disensos (declarados, no resueltos — no los convierto en PASS)

- **D-1 · ¿VST_proxy es un proxy válido de VST?** Disiento. No hay ni un par de mediciones simultáneas (proxy vs browser) en el repo; usarlo como disparador del motor HDCP con el mismo umbral de 3000 ms es una extrapolación, no una equivalencia. **Recomiendo renombrar a `manifest_to_first_segment_ms`** y no reutilizar el umbral de VST.
- **D-2 · Umbral de supervivencia 2 % vs 5 %.** Doc del motor dice 2 % (`engine:21`), el código usa 5 % (`engine:57,351`) y `conviva_qoe_server.php:62` declara 2 % "por paridad" con ese mismo motor. No hay medición que elija. Disiento de fijar cualquiera de los dos sin datos, y además el campo que lo activaría no se envía (S5-08).
- **D-3 · ¿El `SCORECARD` del manifiesto es target o medición?** Disiento de la ambigüedad: `REBUFFER=0,STARTUP=0` en un tag llamado SCORECARD se lee como medición. Recomiendo el patrón que el propio repo ya usa bien para `X-QoE-Target-MOS`: renombrar a `-TARGET`/`-POLICY` y **borrar** los valores que nadie mide (PSNR/SSIM/VMAF/MOS/Telchemy/TR 101 290).
- **D-4 · ¿`conviva.db = 0 B` prueba ausencia de telemetría?** Disiento de la forma (S5-14), no del fondo: la ausencia está probada por (a) módulos `.lua` nunca desplegados y (b) ausencia de filas en el archivo medido; **no** por el tamaño del archivo correcto, que no fue medido.
- **D-5 · ¿Sirve el agente ADB como cobertura nativa?** Parcialmente. Es el único productor con semántica de reproducción real, pero `session_id` se genera **una vez al arrancar el daemon** (`adb…py:265`), no por sesión de playback ⇒ toda la vida del daemon es una sola sesión, y `rebuffer_end` puede llegar sin `rebuffer_start` (no hay máquina de estados, `:64-76`). Sirve para señales sueltas; **NO** para VST/RBR por sesión.

### 6.4 Totales y veredicto

| Severidad | N | IDs |
|---|---|---|
| CRITICAL | 2 | S5-01, S5-02 |
| HIGH | 7 | S5-03, S5-04, S5-05, S5-06, S5-07, S5-08, S5-11 |
| MEDIUM | 5 | S5-09, S5-10, S5-12, S5-13, S5-14 |
| LOW | 1 | S5-15 |
| **Total** | **15** | |

**Veredicto S5: FAIL — ninguna métrica QoE es "medida" en este snapshot.** Hay aritmética real y bien dimensionada (M3, M12, M13, M17, M11, M16) y documentación honesta en varios puntos (`m3u8…js:2388-2389` admite que los players ignoran el tag; `ape_mesh:102-106` admite proxy≠perceptual; el feedback JSON está vacío). Pero: (1) **ningún productor QoE está desplegado ni produce filas** — observador, flush worker y sus hosts de encadenado están en la lista de 22 módulos nunca desplegados; (2) el único cableado del motor del browser mide **generación de lista**, no reproducción, y produce un QoE ~100 por construcción; (3) el `qoe_score` del lazo de decisión es un **stub** y el contrato productor↔consumidor está roto en 2 campos; (4) el observador tiene un defecto de `channel_id` que anula VST en la forma de URL más común; (5) se emiten **cifras QoE fabricadas** (MOS 4.8, PSNR 42, SSIM 0.99, VSTQ/VSMQ 50, `REBUFFER=0`, `STARTUP=0`, TR 101 290 en cero) en artefactos generados, y un `X-Metrics-Endpoint` hacia un dominio ajeno. Todo es corregible en documentación/código: **ninguna corrección exige tocar el VPS en esta fase**.
