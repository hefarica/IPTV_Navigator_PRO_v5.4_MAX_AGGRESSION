# AUDIT_FINAL — ARA CONTINUIDAD

## A01 — LAB_CALIBRATED_BULLETPROOF

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Ruta real:** `deliverables/LAB_2026-10-26/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json`  
**Duplicado:** `deliverables/VALIDACION_ENTREGA_2026-10-28/lab/LAB_CALIBRATED_BULLETPROOF_CERTIFIED.json`

**Esquema observado:** `profiles_calibrated` con P0..P5. Cada perfil contiene resolución, codec, HDR, buffer de player y cadenas de player. No contiene un modelo TFLite, no contiene umbrales del clasificador y no declara precisión >94%.

**Lectores:** scripts Python de laboratorio (`verify_bulletproof.py`, `compare_calibrated.py`). No hay consumidor en runtime Lua/Kotlin/JS.

**lab_config.lua:** existe en `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/lab_config.lua` y lee los JSON de `/var/www/html/prisma/config/` (línea 18); no lee `LAB_CALIBRATED_BULLETPROOF`.

**Conclusión:** el archivo es calibración de **perfiles de reproductor**, no del clasificador de captura. A.1 tal como se describió no es cableable sin un dataset/umbrales de clasificación reales.

**GATE 0:** no cerrado; A01 es la primera ficha.

## A02 — headers-matrix-v9.js

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Ruta real:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/headers-matrix-v9.js`.

**Conteo real (ejecutado con Node):**

```text
totalHeaders: 139
L1=15  L2=16  L3=18  L4=25  L5=65
profiles: 4
```

La cabecera declara “154 headers” (línea 7) y distribuciones +30/+34/+36/+26 (líneas 12–16); el código real expone 139. **GAP de documentación/valor.**

**Consumidores:**

- `frontend/index-v4.html:4087` carga el archivo.
- `frontend/js/ape-v9/m3u8-api-wrapper-integrated.js:513` obtiene `hasHeadersMatrix` booleano; `:648-655` intenta `hasHeadersMatrix.getStats?.()` / `.getHeaders?.(...)` sobre el booleano.
- `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:11741` define `getHeaders(ch,p){ return {}; }`: el generador no consume la matriz.
- Exportada como `window.HEADERS_MATRIX_V9` en `headers-matrix-v9.js:646`.

**Riesgos observados:**

- `DNT` activo en L2 (`:132`) y baneado en runtime (`:536`).
- `Alt-Svc` como request header (`:272`), semánticamente response header.
- `Cookie` simulado (`:279`) y múltiples `X-*`.
- `Range`, `If-None-Match`, `If-Modified-Since`, `Priority`, `TE`, `Upgrade-Insecure-Requests` comentados (`:99`, `:115-116`, `:174`, `:205-206`), no activos.

**Conclusión:** la matriz existe, pero no está cableada al generador; el valor real es 139, no 154. No se edita código funcional en A02.

## A03 — Generadores HLS

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Archivos:** `IPTV_v5.4_MAX_AGGRESSION/generate_m3u8_v54_max_aggression.py` (957 líneas) y `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (12.671 líneas).

**Sintaxis:** `python -m py_compile` = 0; `node --check` = 0.

**Tags observados:**

- Python emite `#EXTHTTP`, `#EXTVLCOPT`, y tags propietarios `#EXT-X-APE-*` (`build_ape_block`, alrededor de `:657-665`). No emite `#EXT-X-MEDIA-SEQUENCE`, `#EXT-X-DISCONTINUITY`, `#EXT-X-PROGRAM-DATE-TIME` ni `#EXT-X-MAP`.
- JS emite `#EXT-X-STREAM-INF`, `#EXT-X-TARGETDURATION` y tags propietarios `#EXT-X-APE-CMAF-*` (`:6349-6361`). No emite las etiquetas estándar de continuidad.
- `#EXT-X-APE-CMAF-MEDIA-SEQUENCE:dynamic` y `#EXT-X-APE-CMAF-DISCONTINUITY-SEQUENCE:auto` no son las etiquetas RFC 8216 `#EXT-X-MEDIA-SEQUENCE` / `#EXT-X-DISCONTINUITY-SEQUENCE`.

**Cursor / ara_state:** no hay `X-APE-Cursor`, `X-APE-Resume-Seq` ni `ara_state` en ninguno de los dos generadores.

**Conclusión:** los generadores emiten metadata propietaria, pero no la secuencia/ventana/cursor del contrato. A03 confirma el GAP de continuidad.

**Corrección 2026-10-31:** A03 se limitó a Python/JS. `vps/ape_hls_generators.php:595` **sí emite** `#EXT-X-MEDIA-SEQUENCE`, pero con `$mediaSeq = max(0, $segCount - 5)` (`:577`), una fuente que se reinicia con el conteo. G3 no es “no existe”: es “existe con fuente incorrecta”. I03 corrige la fuente a epoch en local.

## A04 — events-sse.php y colisión autopista-trap

**Estado:** VERIFIED (repo + baseline público 401; producción no inferida más allá de la sonda GET).

**Archivo real:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/events-sse.php`.

**Auth:** Bearer obligatorio; `ARA_TOKEN` vacío → 503; regex `^Bearer\s+` + `hash_equals` (`:20-30`); no acepta token por query string. `device_id` obligatorio (`:32-35`).

**Payload:** lee `policy_deltas` de `conviva.db` (`:76-91`), filtra `expires_at`, `target_device_id` y `channel_id`; emite `event: policy.delta`, `data: {...}` con `id`. Heartbeat cada 15 s (`:59`, `:93-95`); cierre por rotación a 3600 s (`:67`, `:102-104`). No hay comandos `PRE_FILL_MAX`/`EMERGENCY_FILL`/`UNLIMITED_BITRATE`.

**Nginx:** `vps/nginx/snippets/prisma-ara-events.conf:15-40`; location exacto, `fastcgi_buffering off`, `fastcgi_request_buffering off`, socket `php8.3-fpm.sock`, `HTTP_AUTHORIZATION` pasado a PHP, `fastcgi_read_timeout 3700s`.

**Colisión con autopista-trap:** `vps_configs/autopista-trap.conf:20-24` es un `server` `listen 80` cuyo `server_name` solo matchea IPv4 literal; `:128` devuelve 444 para `/ara/` en **ese** server. El vhost público HTTPS no está en ese scope. Medido: `/ara/events` sin Bearer → **401**, no 444. No hay colisión pública; el 444 es intencional en el trap de IP.

**Verificación:** `php -l` en VPS → 0; `/ara/events` → 401.

## A05 — APK, captura, clasificador, SSE y latencia

**Estado:** BLOCKED (inventario de código completo; latencia real no instrumentada).

**Captura:** `ScreenCaptureService.kt:60` crea `ImageReader` a `w/2 x h/2` (960×540 en este ONN); `:71` `createVirtualDisplay`; `:117` clasificación por `lapVar/motion`; `:128` log cada 15 frames; `:129` publica estado cada 30 frames.

**Clasificador:** reglas Kotlin en `ScreenCaptureService.kt:117-120`; no es TFLite. No hay modelo ni confianza.

**SSE:** `MetaReceiver.kt:24-88` (OkHttp, `/ara/sse`, reconexión exponencial); `StatePublisher.kt:19-51` (`/ara/state`, `source=ara_classifier`); `MetaMapper.kt:12-61` (levers/presets con clamp).

**Buffer:** `BitrateConfig.kt:12` define bandas `floorKbps/ceilKbps`; `BitrateGuard.kt:95-96` calcula `bufferPct` contra `bufferMaxS`; el buffer libre 60%/<1 ms del contrato **no está implementado**.

**Latencia:** grep de `latency|nanoTime|elapsedRealtime|capture.*time` no encuentra instrumentación de captura→display en `ScreenCaptureService`; solo hay timestamps de bitrate/glitch. La cifra 50–80 ms es del repo LSFG, no medida en este ONN.

**Por qué BLOCKED:** A05 exige latencias reales. Las tres vías evaluadas:
- instrumentar `ScreenCaptureService` (código funcional; prohibido con GATE 0 rojo),
- `screenrecord` externo (mide presentación, no captura→display),
- heredar 50–80 ms (inferencia, viola E6).
Ninguna mide la latencia real sin código o sin una fuente de tiempo común.

**Addendum 2026-10-31 — vía externa Perfetto:** el ONN expone `perfetto v34.0`; `com.ape.crystalagent` no estaba corriendo y `dumpsys media.projection` no lista servicio. Al abrir `MainActivity`, Android mostró el diálogo de consentimiento de MediaProjection (“¿Deseas iniciar una grabación…?”); se canceló y se hizo `force-stop`. No se aceptó captura ni se generó traza. Perfetto no elimina el requisito de consentimiento ni mide captura→display por sí solo.

## A06 — Entregable Excel

**Estado:** VERIFIED (artefacto existe y es byte-idéntico en dos rutas).

**Ruta real:** `deliverables/LAB_2026-10-26/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm`.  
**Duplicado:** `deliverables/VALIDACION_ENTREGA_2026-10-28/lab/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm`.

**Identidad:** 3.425.790 bytes; SHA-256 `813a05aa3aa6070c33c6172933bbfd2714791340af48fb70686de33c742a2399`; misma hash en el duplicado.

**Estructura OOXML:** 111 entradas; `xl/vbaProject.bin` presente; 22 hojas `xl/worksheets/sheet*.xml` (se listaron hasta sheet22). No se ejecutó ninguna macro; solo se leyó el ZIP.

**Consumidores:** `verify_bulletproof.py:4`, `synthesize_bulletproof_certified.py:5`, `run_export.py:4`, `fix_excel.py:6`.

**Conclusión:** el entregable Excel existe y es real; no hay GAP total en A06. La auditoría no valida el contenido de cada celda ni la ejecución de macros en este paso.

## A07 — resolve_quality_unified.php vs cmaf_worker

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Identidades reales (distintas):**

```text
backend/resolve_quality_unified.php           342703 B  sha 7728bfb5...
vps/resolve_quality_unified.php                 6270 B  sha 27db7ab7...
vps/production_mirror/resolve_quality_unified.php 3894 B sha 42154e5b...
```

No son el mismo archivo; el de backend no está en la ruta del proxy.

**Cadena real:**

1. `vps/cmaf_proxy.php:38` apunta a `/dev/shm/ape_cmaf_cache/$streamId`.
2. `cmaf_proxy.php:47-48` busca `origin_url.txt` y `target_dna.json` en `/dev/shm/ape_metrics/$streamId/`.
3. `cmaf_proxy.php:53-69`: si el manifiesto falta/es viejo **y existe `origin_url.txt`**, lanza `exec('php cmaf_worker.php ...')`.
4. `cmaf_worker.php:64` lee `target_dna.json`; `:31-32` escribe `manifest.mpd`/`worker.pid`; `:187` abre FFmpeg con `proc_open`.
5. `ape_hls_generators.php:530-540` lee `/dev/shm/ape_cmaf_cache/{ch}`; si no está listo, `:696` registra `cmaf_worker_not_ready_using_provider_m3u8` y cae al M3U8 directo del proveedor.

**Dónde muere:** no hay ningún writer de `origin_url.txt` ni `target_dna.json` en `vps/*.php` o `backend/*.php` (solo lectores/comentarios). `resolve_quality_unified.php` no los escribe. Por tanto, la condición `file_exists($originFile)` del proxy no se cumple desde estos artefactos y el worker no se auto-lanza; el generador cae al proveedor.

**Verificación:** grep de writers → solo `cmaf_proxy.php:47-48` y `cmaf_worker.php:64` como lectores; `ape_hls_generators.php:696` como fallback.

## A08 — Lua de data-plane

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Archivos:** `vps/nginx/lua/upstream_gate.lua` (46 líneas), `upstream_response.lua` (134), `decision_engine.lua` (184), `bandwidth_reactor.lua` (283).

**Efectos sobre ventana/secuencia:**

- `upstream_gate.lua:20-44`: solo telemetría y rotación de UA; **no** bloquea, no toca secuencia/ventana.
- `upstream_response.lua:66-70`: para `.m3u8/.m3u` limpia `ngx.header.content_length` para forzar chunked; no toca `MEDIA-SEQUENCE` ni ventana. `:114` lee URI, no secuencia.
- `decision_engine.lua:9`: declara no `ngx.exit`/no 503; ajusta headers; no secuencia.
- `bandwidth_reactor.lua:82-151`: ring buffer de 12 muestras y contadores de 60s; telemetría, no secuencia.
- Grep de `MEDIA-SEQUENCE|DISCONTINUITY|PROGRAM-DATE-TIME|media_sequence|segment_uri` en los cuatro → **sin coincidencias**.

**Conclusión:** los cuatro Lua **no modifican la ventana ni la secuencia**. El único cambio de cuerpo es quitar `Content-Length` del manifest para chunked. La continuidad no está aquí; no se toca.

## A09 — Grep global de MEDIA-SEQUENCE / DISCONTINUITY / PROGRAM-DATE-TIME

**Estado:** VERIFIED (grep global literal; resultado completo en spill de 966 coincidencias, cap 250).

**Conteo:** 966 coincidencias; 250 mostradas antes del cap. Incluye código, tests, docs, backups y snapshots.

**Emisor real fuera del generador activo:**

- `_vps_stage/media/ape-ingest.sh:2028` `echo '#EXT-X-MEDIA-SEQUENCE:0'`
- `_vps_stage/media/ape-ingest.sh:2044` `echo "#EXT-X-MEDIA-SEQUENCE:$lo"`
- `_vps_stage/media/ape-ingest.sh:2207,2218,2526,2538` más secuencias.
- `test_exporter2.js:5976` `lines.push('#EXT-X-MEDIA-SEQUENCE:0')` (test).
- `docs/MEDIA_FANOUT_CONCURRENCY_REPORT.md:281` ejemplo.

**Generador activo:**

- `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:226` solo `findIndex` de validación; `:6354-6356` solo tags `#EXT-X-APE-CMAF-*`; **no emite** `#EXT-X-MEDIA-SEQUENCE`.
- `backend/resolve_quality_unified.php` no aparece como emisor en este grep.

**Corrección 2026-10-31:** el grep global omitió en el resumen `vps/ape_hls_generators.php:595`, que sí emite `#EXT-X-MEDIA-SEQUENCE`; su fuente era `segCount-5`. A09 queda corregido: el problema es la fuente, no la ausencia total.

**Conclusión:** hay usos reales de las etiquetas fuera del generador activo (ingest/test/docs) y una emisión activa con fuente incorrecta; el GAP de continuidad sigue en la capa activa.

## A10 — Prefetch a 127.0.0.1:80 tras ff5ff5a

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Commit:** `ff5ff5a` modifica solo `vps_configs/autopista-trap.conf` (38+, 4−).

**Prefetch real:** `prefetch_segment.lua`:
- `:101` `sock:connect("127.0.0.1", 80)`.
- `:108-109` envía `GET <ts_path>` con `Host: <req_host>`.
- `:59-67` `req_host` es `ngx.var.host` o el host de la URL absoluta del segmento; nunca se fuerza `127.0.0.1` como Host.
- `:73-82` `ts_path` es la ruta del segmento (`/...`/`shield/...`), no `/ara/`.

**Trap:** `vps_configs/autopista-trap.conf:20-24` solo aplica a `Host` IPv4 literal; `:128` devuelve 444 para `/ara/` en ese server. El prefetch no usa Host `127.0.0.1` ni path `/ara/`, así que **no cae en 444**.

**Riesgo distinto:** el `listen 80` público del vhost normal redirige a HTTPS (visto en la configuración auditada); el prefetch lee solo cabeceras y puede recibir un 301, no calentar la caché. No es 444, pero puede ser un prefetch inefectivo.

## A11 — Rendiciones reales vs media_0

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Worker activo:** `vps/cmaf_worker.php:139` `-map 0:v:0? -map 0:a:0?`; `:154` `-f dash`; `:163-164` nombres por `RepresentationID`; `:167` `-hls_segment_type fmp4`. Produce una representación de vídeo (`media_0`) y una de audio (`media_1`) como máximo.

**Generador DASH:** `vps/ape_hls_generators.php:440-457` declara `AdaptationSet` video con `Representation v4k` (`:441`), `vfhd` (`:446`), y audio `a1` (`:453`). Son **3 Representations** (2 video + 1 audio), no 4.

**HLS CMAF:** `ape_hls_generators.php:540-572` usa `init-stream0.m4s` y `chunk-stream0-*.m4s` desde `/dev/shm/ape_cmaf_cache`; no hay 4 variantes reales en esta ruta.

**Conclusión:** no existen 4 rendiciones reales en la cadena activa. Hay 1 video en el worker, 2 video en el MPD hardcodeado y 1 audio; `media_0` es la única representación de vídeo del worker. El inventario de 4 no está en estos artefactos.

## A12 — Cabeceras por reproductor y reconexión

**Estado:** VERIFIED (auditoría de repo; producción no inferida).

**Resolver actual:** `backend/resolve_quality_unified.php` (7.495 líneas).
- Detección por UA: `:1793` VLC, `:1794` Kodi, `:1796` OTT Navigator, `:1798` Smarters, `:1799` TiviMate.
- Capacidades: VLC `supports_vlcopt=true, supports_kodiprop=false` (`:1821-1822`); Kodi lo inverso (`:1837-1838`); TiviMate `supports_vlcopt=true` (`:1885-1886`); OTT ninguno (`:1853-1854`).
- VLC: `buildVlcDirectives` `:2742`; `#EXTVLCOPT:http-reconnect=true` `:2758` y `http-continuous` `:2759`.
- Kodi: `buildKodiDirectives` `:2796`; buffers `:2805-2807`; no emite `http-reconnect`, usa `retry_count/exponential` en el bloque enriquecido (`:5078-5080`).
- TiviMate: `buildTivimateDirectives` (dispatch `:2721`) solo añade `#EXTVLCOPT:network-caching` (`:2862`). **No** añade `http-reconnect` en su builder.
- Anti-cut global: `:4552` añade `http-reconnect=true` a `anti_cut['extvlcopt']` y `:4763` lo aplica a `$vlcopts` para todos los players. TiviMate lo recibe por esta vía global, no por su builder.

**API server:** `ape_api_server.py:1390-1396` y `ape_api_server_v2.1.py:1151-1157` emiten **EXTVLCOPT y KODIPROP a todos** sin detección de player; no es la ruta del resolver.

**Efecto:** VLC/TiviMate obtienen reconexión HTTP por EXTVLCOPT; Kodi no emite `http-reconnect`, pero tiene retry/backoff en KODIPROP; OTT no recibe ninguna etiqueta de reconnect. No hay evidencia de que un tag inválido se inyecte al player equivocado en el resolver actual.

## A13 — Estado real de /ara/sse y /ara/events (VPS)

**Estado:** VERIFIED (sonda read-only 2026-10-31 15:40 UTC).

**Resultados:**

```text
GET /ara/events sin token  → 401 application/json {"ok":false,"error":"UNAUTHORIZED"}
GET /ara/sse sin token     → 401 application/json {"error":"unauthorized"}
GET /ara/sse con token     → 200 text/event-stream;charset=UTF-8
                             ": hb"
nginx                       → active
nginx -t                    → syntax ok / test successful
```

**Lectura:** ambos endpoints existen y fallan cerrados sin token. `/ara/sse` responde SSE autenticado con heartbeat; no había payload en la ventana de 3 s. `/ara/events` conserva su 401. `nginx -t` pasa y el servicio está activo.

## A14 — Matriz de gaps G1–G16

**Estado:** VERIFIED (matriz cerrada con cita; GATE 0 sigue ROJO).

**Contrato:** `contracts/continuity.contract.json:3-29`.  
**Mapa de consumidores:** `contracts/consumer-map.json` (10 consumidores, 0 leen el contrato).

| GAP | Evidencia | Severidad | Estado |
|---|---|---|---|
| G1 cursor `/dev/shm/ape_cursor/` | contrato `:5`; grep global: no writer/reader de `ape_cursor` | blocker | ABIERTO |
| G2 ventana persistente 30/10 | `cmaf_worker.php:104-107` window 10 + extra 20; sin persistencia | high | ABIERTO |
| G3 `start_number_source=epoch` | `ape_hls_generators.php:595` emite; `:577` usaba `segCount-5`; I03 local lo cambia a epoch | high | PARCIAL (I03 local, sin deploy) |
| G4 `DISCONTINUITY` estándar | `ape_hls_generators.php` I04 local: `DISCONTINUITY`/`DISCONTINUITY-SEQUENCE`; producción sin deploy | high | PARCIAL (I04 local) |
| G5 resume `last_delivered+1` | `ape_hls_generators.php` I05 local: cursor + `ApeResume::window`; prefetch URLs +1/+2; producción sin deploy | high | PARCIAL (I05 local) |
| G6 retención 30/10 / rm solo cambio de canal | `cmaf_worker.php:104-107`; no hay rm por canal | high | ABIERTO |
| G7 resolver sirve vía CMAF | `ape_hls_generators.php` I06 local escribe `origin_url.txt`/`target_dna.json` y lanza `cmaf_worker`; producción sin deploy | high | PARCIAL (I06 local) |
| G8 `PROGRAM-DATE-TIME` estándar | `ape_hls_generators.php` I04 local: tag antes del primer `EXTINF`; producción sin deploy | high | PARCIAL (I04 local) |
| G9 `hls_time` al GOP real | I07 local: `TARGETDURATION` desde `target_dna.seg_dur`; `INDEPENDENT-SEGMENTS` solo si probado; producción sin deploy | medium | PARCIAL (I07 local) |
| G10 Strike Tracker escribe cursor | I08 local: `ApeCursor::writeFromHeaders` en `resolve_quality_unified.php:4414-4421`; sin header no inventa | high | PARCIAL (I08 local) |
| G11 manifest cache 1s u off | I09 local: `autopista-trap.conf:65` m3u8 TTL 1s; `:146` default 20s; producción sin deploy | medium | PARCIAL (I09 local) |
| G12 stale en timeout `.ts` | `vps_configs/autopista-trap.conf:112` `proxy_cache_use_stale ... timeout http_403 ...` | medium | MITIGADO nativo |
| G13 slice 1m uniforme | `vps_configs/autopista-trap.conf:90` `slice 1m`; no uniforme en todas las rutas | medium | PARCIAL |
| G14 `lab_config` fail-loud | `lab_config.lua:38-39,47-48` loguea WARN/ERR y devuelve defaults | medium | ABIERTO |
| G15 `%06d` | `cmaf_worker.php:164` `-media_seg_name ... %05d` | low | ABIERTO |
| G16 4 rendiciones | A11: worker 1 video + 1 audio; DASH 2 video + 1 audio | medium | ABIERTO |

**GATE 0:**

- [x] A01..A14 COMPLETO o BLOCKED con motivo: A01–A04, A06–A14 VERIFIED; A05 BLOCKED por latencia no instrumentada.
- [x] Cero hipótesis sin marcar: las dudas de A05 están marcadas y bloqueadas.
- [x] Contrato existe y consumidores mapeados: `contracts/consumer-map.json`; **ninguno lee el contrato**.
- [x] Matriz G1..G16 con evidencia y severidad.
- [x] Fichas: 14/14 unidades definidas (A01–A14). El texto del plan dice “16 fichas” pero enumera 14; se documenta la inconsistencia y no se inventan A15/A16.
- [x] GATE 0: **CERRADO CON A05 BLOCKED**. Los 13 gaps/parciales pasan a la Fase 1 como backlog, no bloquean la compuerta.

**Conclusión:** auditoría cerrada. A05 queda BLOCKED con causa y cuatro vías evaluadas. No se inicia Fase 1 hasta `APLICA`.













