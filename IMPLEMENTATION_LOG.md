# IMPLEMENTATION — ARA continuidad

## I01 — Cursor ledger (G1)

**Estado:** VERIFIED (local; sin deploy al VPS).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_cursor.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_cursor_test.php`

**Contrato:** `/dev/shm/ape_cursor/`; clave `md5(clientIp + '+' + ch_id)`; TTL 300 s; campos `media_sequence`, `segment_uri`, `byte_offset`, `pts`, `program_date_time`, `last_delivered`.

**Diseño:**

- Escritura atómica `tmp + rename`; permisos `0640`.
- `read()` valida TTL con `clearstatcache(true, $path)` antes de `filemtime`.
- `startSequence()` devuelve `last_delivered + 1` o `1` sin cursor.
- `clear()` borra una clave.

**Matriz:**

- O1 ledgers nuevos PHP con pruebas de aislamiento/TTL · N4 · rev 5 · riesgo 0 · alineación 5 · coste 2 → ELEGIDA.
- O2 extender `ape_neuro_tracker.json` (strikes) · N1 · rev 3 · riesgo 2 · alineación 2 · coste 3 → descartada: mezcla strikes con cursor y no cumple store.
- O3 usar Redis/DB · N5 · rev 2 · riesgo 2 · alineación 1 · coste 5 → descartada: dependencia nueva.

**Verificación (VPS temporal, sin deploy):**

```text
No syntax errors detected in .../ape_cursor.php
No syntax errors detected in .../ape_cursor_test.php
PASS key is md5(ip+ch)
PASS different clients -> different keys
PASS write client A
PASS read client A
PASS client A resumes at 42
PASS client B is isolated
PASS client B starts at 1
PASS expired cursor is null
PASS expired cursor file removed
PASS cleanup A
PASS cleanup B
ALL_OK
test_exit=0
```

**No desplegado:** el archivo no se copió a `/var/www/html` ni a `/etc/nginx`; la prueba usó `/tmp/ara_i01_*` y `/dev/shm/ape_cursor` con claves de test, limpiadas.

## I02 — Ventana persistente (G2/G6)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_window.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_window_test.php`

**Política:** `keep=30`; `delete_threshold=10`; solo se poda cuando hay más de 40; se borran los más antiguos hasta 30. `resetOnChannelChange()` es el único camino que vacía la ventana completa.

**Verificación (VPS temporal `/tmp/ara_i02_*`):**

```text
PASS initial 45 segments
PASS prune deletes down to 30
PASS oldest removed
PASS newest retained
PASS normal prune is idempotent
PASS state write
PASS state read
PASS channel change clears 30 segments
PASS channel change clears state
ALL_OK
test_exit=0
```

**No desplegado:** solo `/dev/shm/ape_window_test_*`; no se tocó `/dev/shm/ape_cmaf_cache` de producción.

## I03 — MEDIA-SEQUENCE con fuente epoch (G3)

**Estado:** VERIFIED (local; sin deploy).

**Hallazgo corregido:** `vps/ape_hls_generators.php:577` calculaba `$mediaSeq = max(0, $segCount - 5)`; el tag `:595` existía, pero se reiniciaba con el conteo. A03/A09 lo habían declarado ausente por limitar el grep a Python/JS.

**Cambio:** `$mediaSeq = intdiv(time(), max(1, $targetDur));` en `:577`; el tag `:595` no cambia.

**Verificación (VPS temporal `/tmp/ara_i03b_*`):**

```text
No syntax errors detected in .../ape_hls_generators.php
a=896730923 b=896730924 monotonic=YES
test_exit=0
```

**Límite:** la ruta de fallback `:724` conserva `MEDIA-SEQUENCE:0`; no se tocó en I03.

## I04 — DISCONTINUITY + DISCONTINUITY-SEQUENCE + PROGRAM-DATE-TIME (G4/G8)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_hls_state.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_hls_state_test.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php`

**Lógica:** `worker.pid` es la señal de reinicio. Primer arranque: secuencia 0, sin `DISCONTINUITY`. PID nuevo: secuencia +1, `DISCONTINUITY` una vez. `PROGRAM-DATE-TIME` se emite antes del primer `EXTINF`.

**Verificación (VPS temporal `/tmp/ara_i04c_*`):**

```text
PASS first start sequence 0
PASS first start no discontinuity
PASS program date time is UTC
PASS same pid no discontinuity
PASS same pid sequence stays 0
PASS new pid discontinuity true
PASS new pid sequence increments
PASS after restart no repeated discontinuity
PASS after restart sequence stays 1
ALL_OK
test_exit=0 lint_exit=0
```

**No desplegado:** no se copió a `/var/www/html`; la prueba usó `/dev/shm/ape_hls_test_*`.

## I05 — Reanudación desde last_delivered+1 (G5)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_resume.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_resume_test.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php` (cursor + ventana + `X-APE-Prefetch`)

**Lógica:** si el cliente tiene cursor, `ApeResume::window()` filtra `chunk-stream0-*` desde `last_delivered+1`; `mediaSeq` pasa al primer segmento de esa ventana; `prefetchUrls()` calcula `+1/+2` y se publica en `X-APE-Prefetch`.

**Verificación (VPS temporal `/tmp/ara_i05_55598`):**

```text
PASS window starts at 106
PASS window excludes 105
PASS window includes 110
PASS missing resume falls back to last 5
PASS no cursor keeps last 5
PASS prefetch has 2 URLs
PASS prefetch URL +1
PASS prefetch URL +2
ALL_OK
test_exit=0 lint_exit=0
```

**Límite:** I05 selecciona URLs de prefetch; no ejecuta la descarga HTTP. El prefetch real queda para la capa que consuma `X-APE-Prefetch`.

## I06 — Deshuerfanar la vía CMAF (G7)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_cmaf_bootstrap.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_cmaf_bootstrap_test.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php:545-566`

**Lógica:** antes de esperar `init-stream0.m4s`, escribe `/dev/shm/ape_metrics/<ch>/origin_url.txt` y `target_dna.json` y lanza `cmaf_worker.php` con el mismo argv que usa `cmaf_proxy`. Solo acepta `http(s)`; no inventa origen.

**Verificación (VPS temporal `/tmp/ara_i06_*`):**

```text
PASS ensure returns true
PASS origin_url written
PASS target_dna written
PASS origin content exact
PASS dna codec_tag
PASS dna list_id
PASS rejects non-http origin
ALL_OK
test_exit=0 lint_exit=0
```

**No desplegado:** no se copió a `/var/www/html`; no se ejecutó el worker de producción.

## I07 — HLS timing y `INDEPENDENT-SEGMENTS` (G9)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_hls_timing.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_hls_timing_test.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php:598-608,641-645`

**Lógica:** `TARGETDURATION` se toma de `target_dna.seg_dur` (2..12; fallback 6), no de un 2 fijo. `#EXT-X-INDEPENDENT-SEGMENTS` solo se emite si el DNA declara `independent_segments=true`; por defecto no se miente.

**Verificación (VPS temporal `/tmp/ara_i07b_*`):**

```text
PASS dna 6 -> target 6
PASS dna 4 -> target 4
PASS dna 1 clamps to 6
PASS dna 20 clamps to 6
PASS missing dna -> 6
PASS independent false by default
PASS independent true only when proven
ALL_OK
test_exit=0 lint_exit=0
```

**Límite:** no se mide el GOP real del proveedor; se usa el `seg_dur` que el worker declara. La verificación dinámica del GOP queda pendiente.

## I08 — Strike Tracker escribe cursor (G10)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_cursor.php` (`writeFromHeaders`)
- `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php:4412-4421`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_cursor_test.php`

**Lógica:** el strike tracker sigue escribiendo `ape_neuro_tracker.json`; además, si llegan `X-APE-Resume-Seq` y `X-APE-Cursor`, persiste el cursor. Sin `X-APE-Resume-Seq` numérico no escribe nada; no inventa secuencia.

**Verificación (VPS temporal `/tmp/ara_i08_*`):**

```text
PASS writeFromHeaders writes cursor
PASS header cursor last_delivered 77
PASS header cursor segment_uri
PASS missing header does not write
ALL_OK
test_exit=0 lint_exit=0
```

**Límite:** no hay cliente que envíe esos headers todavía; I08 prueba el receptor, no el emisor.

## I09 — Manifest cache 1s / stale `.ts` (G11/G12)

**Estado:** VERIFIED (local; sin deploy).

**Cambio:** `vps_configs/autopista-trap.conf:65` `proxy_cache_valid 200 206 5s` → `1s` en `location ~* \.m3u8$`. El bloque `.ts` ya tenía `proxy_cache_use_stale ... timeout ...` en `:112`; no se tocó.

**Verificación (wrapper nginx temporal en VPS; sin tocar config viva):**

```text
nginx: the configuration file /tmp/ara_i09b_44818/nginx-test.conf syntax is ok
nginx: configuration file /tmp/ara_i09b_44818/nginx-test.conf test is successful
nginx_test_exit=0
```

**Límite:** el wrapper valida el bloque con `proxy_cache_path` y módulos reales, pero no es `nginx -t` sobre la config viva; eso exige APLICA + backup + reload.

## I10 — slice 1m uniforme (G13)

**Estado:** VERIFIED (no-op justificado; sin deploy).

**Evidencia:** `nginx -T` de la config viva no contiene ninguna `location ~* \.ts$`; producción es metadata-only y no transporta segmentos. `vps_configs/autopista-trap.conf:90` sí tiene `slice 1m`, pero ese server no está en la ruta viva.

**Decisión:** no se añade `slice` a un data-plane que no existe. Se evita un cambio cosmético que no afecta a producción.

**Verificación:** `nginx -T | grep -E 'location .*\.ts|slice 1m'` → sin coincidencias de `.ts` activo.

## I11 — lab_config fail-loud, `%06d`, rendiciones (G14/G15/G16)

**Estado:** VERIFIED (local; sin deploy).

**G14:** `lab_config.lua` ahora tiene `fail_loud()`: `ngx.ERR` + `_M.degraded` + `_M.errors` (máx. 20) para missing/empty/corrupt. Sigue devolviendo defaults para no romper el reactor; el fallo ya es visible.

**G15:** `cmaf_worker.php:164` `%05d` → `%06d`.

**G16:** 4 rendiciones reales: fuente `copy` + 3 escalados/encode `libx264` (1080/720/480), scope 4:3:2:1. La prueba FFmpeg produjo 4 `Representation`, 4 `media_*.m3u8`, 4 init y 4 chunks.

**Opciones G16:**

- O1 4 salidas reales con copy+encode · N1 · rev 3 · riesgo 3 · alineación 5 · coste 4 → ELEGIDA (autorizada por owner).
- O2 etiquetar `media_0` como 4 variantes · N0 · rev 3 · riesgo 5 · alineación 1 · coste 1 → descartada: mentira al player.
- O3 usar variantes del master del proveedor · N2 · rev 3 · riesgo 3 · alineación 4 · coste 4 → descartada: no hay master de 4 garantizado.

**Verificación:**

```text
luac -p lab_config.lua → 0
php -l cmaf_worker.php → 0
representations=4
media_playlists=4
init_files=4
chunk_files=4
test_exit=0
```

**Límite:** el transcode añade 3 encodes en el worker; no se ha medido CPU/throughput en producción. No se desplegó.

## I12 — `ara_state` dinámico en metadata de lista (contrato §3)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_ara_state.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_ara_state_test.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php:638-645`

**Fuente:** `/dev/shm/ape_state/<ch>.json`; si no existe, **no se emite** el tag. Campos: `class`, `confidence`, `buffer_pct`, `bitrate_bps`, `media_sequence`, `timestamp`; `class` solo `SLATE|FLAT|DETAIL|MOTION`; confidence 0..1; buffer 0..100.

**Tag:** `#EXT-X-APE-ARA-STATE:{json}`; es metadata ignorable para RFC 8216.

**Verificación (VPS temporal `/tmp/ara_i12_41044`):**

```text
PASS missing file is null
PASS loads valid state
PASS normalizes confidence
PASS tag is dynamic
PASS invalid class is null
PASS clamps confidence/buffer
PASS no state -> empty tag
ALL_OK
test_exit=0 lint_exit=0
```

**Límite:** todavía no hay productor de `/dev/shm/ape_state/<ch>.json`; I12 prueba el inyector y la ausencia de datos inventados.

## I13 — Comandos SSE (contrato)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_sse_commands.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_sse_commands_test.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/events-sse.php:81-99`

**Comandos:** `PRE_FILL_MAX`, `EMERGENCY_FILL`, `UNLIMITED_BITRATE`, `CRYSTAL-UHD-MIN`, `CRYSTAL-UHD-MED`, `CRYSTAL-UHD-MAX`. Cualquier otro se descarta; `policy.delta` normal pasa sin cambios.

**Verificación (VPS temporal `/tmp/ara_i13_80169`):**

```text
PASS PRE_FILL_MAX allowed
PASS CRYSTAL-UHD-MAX allowed
PASS unknown rejected
PASS normalizes segments
PASS keeps command
PASS fromDelta accepts command
PASS fromDelta keeps buffer
PASS fromDelta rejects unknown
PASS normalize rejects unknown
ALL_OK
test_exit=0 lint_exit=0
```

**Límite:** no hay productor que inserte estas filas en `policy_deltas`; I13 valida el vocabulario y el filtro del emisor SSE.

## I14 — MetaReceiver a actuadores y clasificador a SSE

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `ara-x/vps/crystal/state_bridge.php`
- `ara-x/vps/crystal/state.php:12,33-45`
- `IPTV_v5.4_MAX_AGGRESSION/android/.../AraDeviceId.kt`
- `IPTV_v5.4_MAX_AGGRESSION/android/.../AraCommandBridge.kt`
- `IPTV_v5.4_MAX_AGGRESSION/android/.../MetaReceiver.kt:37-50`
- `IPTV_v5.4_MAX_AGGRESSION/android/.../StatePublisher.kt:28-30`
- `IPTV_v5.4_MAX_AGGRESSION/android/.../ScreenCaptureService.kt:50,148`

**Cambios:**

- `MetaReceiver.connect()` ahora envía `?device_id=`; antes `/ara/sse` devolvía 400.
- `AraCommandBridge` instancia `MetaReceiver` + `MetaMapper` en `ScreenCaptureService`, no solo en `SseTestActivity`.
- `StatePublisher` envía `device_id` y `channel_id`.
- `state.php` persiste en `events.db:m` y, si hay `device_id`, inserta `classifier.state` en `policy_deltas` (TTL 30 s) para que `/ara/sse` lo entregue.

**Verificación:**

```text
php -l state_bridge.php → 0
php -l tests/state_bridge_test.php → 0
php -l state.php → 0
PASS inserts row
PASS device stored
PASS type classifier.state
PASS source ara_classifier
PASS class kept
PASS no device -> null
PASS invalid kind -> null
ALL_OK
test_exit=0 lint_exit=0

gradlew :app:compileDebugKotlin --offline
BUILD SUCCESSFUL in 55s
gradle_exit=0
```

**Límite:** no se ejecutó el APK en el ONN; la compilación Kotlin pasa, pero el E2E SSE en dispositivo no se midió. No se desplegó `state.php` ni `state_bridge.php`.

## I15 — Buffer libre: piso 60%, sin techo

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/android/.../BufferPolicy.kt`
- `IPTV_v5.4_MAX_AGGRESSION/android/.../AraStatus.kt:81-84`
- `IPTV_v5.4_MAX_AGGRESSION/android/.../BitrateGuard.kt:76-81,180-185`

**Cambio:** `BufferPolicy.FLOOR_PCT=60`, `CEILING_PCT=null`; el panel publica `bufferPct`, `bufferFloorPct`, `bufferCeilingPct` y `bufferState` (`BELOW_FLOOR`/`OK`). No se impone un techo ni se cambia `bufferMaxS` de ExoPlayer; el buffer real sigue siendo el del player.

**Verificación:**

```text
gradlew :app:compileDebugKotlin --offline
BUILD SUCCESSFUL in 5s
gradle_exit=0
```

**Límite:** política y observabilidad; no se fuerza al player a mantener 60% (eso requeriría cambiar `DefaultLoadControl` y medir startup). No se ejecutó en ONN.

## I16 — Exportador Excel alineado al contrato

**Estado:** VERIFIED (local; sin deploy).

**Archivo:** `deliverables/LAB_2026-10-26/export_ara_state_contract.py`

**Comportamiento:** lee `contracts/continuity.contract.json`; cabeceras = `ara_state_fields` + `cursor_<field>`; escribe un `.xlsx` **separado**; falla si falta una columna o si el input no es un array.

**Verificación:**

```text
OK rows=1 cols=11
HEADERS=class,confidence,buffer_pct,bitrate_bps,media_sequence,timestamp,
cursor_media_sequence,cursor_segment_uri,cursor_byte_offset,cursor_pts,cursor_program_date_time
ROWS=1
export_exit=0
read_exit=0
```

**No regresión:** el `.xlsm` certificado no se tocó:

```text
SHA-256 813a05aa3aa6070c33c6172933bbfd2714791340af48fb70686de33c742a2399
bytes   3425790
```

**Límite:** no se inyectaron columnas dentro del `.xlsm` certificado (rompería VBA/SHA); el exportador es un artefacto nuevo y aditivo.

## I17 — Matriz de cabeceras única derivada del contrato

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `scripts/gen_contract_headers.py`
- `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/headers-contract.js` (generado)
- `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/headers-matrix-v9.js:526-535,562-576`
- `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html:4087`

**Cambio:** las 4 cabeceras del contrato se generan desde `contracts/continuity.contract.json` a `window.APE_CONTRACT_HEADERS`; `getHeaders()` las fusiona por nombre, sin sobrescribir una existente y derivando el valor del contexto (`cursor`, `resumeSeq`, `windowSpan`, `discontinuitySeq`). La matriz sigue siendo una sola.

**Verificación:**

```text
gen_exit=0 headers=4
matrix_check=0
contract_check=0
CONTRACT_PRESENT=4/4
HEADERS_TOTAL=113
DUPES=0
VALUES={"X-APE-Cursor":"/s/77.ts","X-APE-Resume-Seq":"77","X-APE-Window-Span":"30","X-APE-Discontinuity-Seq":"0"}
OK
node_exit=0
```

**Nota:** 139 es el total crudo de `LAYERS`; `getHeaders(5)` devuelve 113 tras el bloqueo de headers tóxicos. La cabecera del archivo se corrigió de 154 a 139.

**Límite:** no se cargó en navegador real; la prueba usa `vm` con `window`/`localStorage`.

## Hotfix post-deploy — fallback CMAF

`serve_cmaf_m3u8_fallback()` seguía emitiendo `#EXT-X-MEDIA-SEQUENCE:0` y
`#EXT-X-INDEPENDENT-SEGMENTS` fijos. Se corrigió:

- el fallback es un **master playlist** (`EXT-X-STREAM-INF`), por lo que **no**
  emite `TARGETDURATION`/`MEDIA-SEQUENCE`/`DISCONTINUITY-SEQUENCE` (tags de media);
- `INDEPENDENT-SEGMENTS` solo si `target_dna.json` lo prueba.

Verificación: `php -l` local y live → 0; `nginx -t` → ok; `/ara/events` y `/ara/sse`
sin token → 401; `nginx`/`php8.3-fpm` activos. Hash live:
`5569e8f6f7d8949a5684548c6100de127c4889333e6543005bb0cde972cc60ef`.

Prueba real del fallback con servidor local y `.m3u8` fixture:

```text
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=...,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
http://127.0.0.1:18765/feed.m3u8
PASS_no_media_sequence
PASS_no_targetduration
PASS_no_discontinuity_sequence
PASS_master_stream_inf
PASS_independent_not_claimed
```












