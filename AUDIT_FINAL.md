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

## A06 — Entregable Excel

**Estado:** VERIFIED (artefacto existe y es byte-idéntico en dos rutas).

**Ruta real:** `deliverables/LAB_2026-10-26/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm`.  
**Duplicado:** `deliverables/VALIDACION_ENTREGA_2026-10-28/lab/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm`.

**Identidad:** 3.425.790 bytes; SHA-256 `813a05aa3aa6070c33c6172933bbfd2714791340af48fb70686de33c742a2399`; misma hash en el duplicado.

**Estructura OOXML:** 111 entradas; `xl/vbaProject.bin` presente; 22 hojas `xl/worksheets/sheet*.xml` (se listaron hasta sheet22). No se ejecutó ninguna macro; solo se leyó el ZIP.

**Consumidores:** `verify_bulletproof.py:4`, `synthesize_bulletproof_certified.py:5`, `run_export.py:4`, `fix_excel.py:6`.

**Conclusión:** el entregable Excel existe y es real; no hay GAP total en A06. La auditoría no valida el contenido de cada celda ni la ejecución de macros en este paso.





