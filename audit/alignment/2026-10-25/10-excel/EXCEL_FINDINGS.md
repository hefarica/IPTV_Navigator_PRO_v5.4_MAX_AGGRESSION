# EXCEL_FINDINGS — huecos, incoherencias y checklist para el JSON

**SSOT auditado:** `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` · `sha256=663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` · 3 582 019 B · 55 hojas · VBA 1 715 712 B
**Rama alternativa medida:** `C:\Users\HFRC\Documents\APE_M3U8_LAB_v8_FIXED.xlsm` · `sha256=E3BC629E…2DBD` · 56 hojas (incluye `30_DISNEY_GRADE_DIRECTIVES`)
**Regla de este documento:** nada se corrigió. Todo hallazgo cita `hoja!celda` y es reproducible con los artefactos de `_raw/` (subconjunto versionado: ver `EXCEL_INVENTORY.md` §10.1) o regenerando los volcados con `tools/extract_lab_ssot.py`. Las correcciones son **propuestas**, no aplicadas (lane de auditoría, solo lectura sobre producción).

---

## 0 · Resumen por severidad

| Sev | Nº | Hallazgos |
|---|---:|---|
| **BLOCKER** | 2 | F-01 (doble rama divergente sin dueño declarado), F-02 (dos escaleras de codec contradictorias dentro del mismo libro) |
| **HIGH** | 5 | F-03 (Ley Nivel↔Resolución violada en P1–P5), F-04 (P2 4K vs 2K), F-05 (avg > max bitrate en P1–P5), F-13 (credenciales en claro + export a JSON), F-14 (rama canónica sin hoja Disney) |
| **MEDIUM** | 9 | F-06 (corrupción numérica por locale), F-07 (claves duplicadas divergentes), F-08 (placeholders `{prisma.*}` rotos), F-09 (header tóxico latente + stub de credencial), F-10 (Floor-Lock vs perfiles), F-15 (TLS 1.0/1.1), F-16 (named ranges R1C1), F-19 (P4/P5 sin `stream_headers`), F-20 (capa SYS nunca emitida) |
| **LOW** | 4 | F-11 (DV profile 8.1 vs 8.6), F-12 (bit_depth 12 sobre DV P8), F-17 (21 vs 24 VNOVA-LCEVC), F-18 (network-caching global 8000 vs perfil 5000) |

**Total: 20 hallazgos** (2 BLOCKER · 5 HIGH · 9 MEDIUM · 4 LOW). F-19 y F-20 se detallan en §2 ("segunda pasada").

---

## F-01 · BLOCKER — Dos ramas del "mismo" SSOT, divergentes y sin dueño declarado

- **Evidencia:** `Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` (`663EF44E…`, 55 hojas, mtime 2026-06-11T01:54:49-05) vs `Documents\APE_M3U8_LAB_v8_FIXED.xlsm` (`E3BC629E…`, 56 hojas, mtime 2026-05-19T17:11:05-05). Mismo nombre de archivo, mismo `created=2026-04-12T17:23:55Z`, mismo `creator=openpyxl`.
- **Divergencia medible en `6_NIVEL_2_PROFILES`:** 647 claves (Downloads) vs 629 (Documents); **18 claves solo en Downloads**; **110 filas con valores distintos** entre ambas. Ejemplos: `codec_chain_audio` (`6_NIVEL_2_PROFILES!B661` = `mp4a.40.2,ac-3,mp4a.40.5` vs `B642` = `ec-3,ac-3,mp4a.40.2,mp4a.40.5`); `codec_chain_video` (`B659` incluye `L183/L180`; `B640` no); `headerOverrides.X-APE-AI-*` en **P2** rellenas en Downloads y **vacías** en Documents (`D263:D276`).
- **Síntoma:** cualquier consumidor que abra "el `.xlsm` del LAB" obtiene una calibración distinta según la carpeta.
- **Causa raíz probable:** reescrituras openpyxl sucesivas sobre una copia, sin control de versión (el `.xlsm` **no está en git**).
- **Impacto en la cadena:** LAB→JSON→lista→VPS queda indefinido en origen. `LAB_CALIBRATED_BULLETPROOF_22.6.0-*` (408 174 B, 2026-06-07) no puede atribuirse a una rama sin el hash del libro que lo produjo.
- **Corrección propuesta (no aplicada):** declarar **una** ruta canónica, versionarla (LFS o hash en `docs/`), y que todo JSON exportado lleve `source_xlsm_sha256`.
- **Prueba de cierre:** `sha256` del `.xlsm` embebido en el JSON == `sha256` del archivo declarado canónico.

---

## F-02 · BLOCKER — Dos escaleras de codec contradictorias **dentro del mismo libro**

| Clave | `6_NIVEL_2_PROFILES` (SSOT de export) | `37_VALORES_UNIFICADOS` (misma fila lógica) | Doctrina OMEGA |
|---|---|---|---|
| `settings.codec_full` P1 | `hvc1.2.4.L153.B0` (`C37`) | `av01.0.15M.10` | **AV1 8K** |
| `settings.codec_full` P3 | `hvc1.2.4.L123.B0` (`E37`) | `hvc1.1.6.L120.B0` | `hvc1.2.4.L123.B0` |
| `settings.codec_full` P4 | `hvc1.2.4.L93.B0` (`F37`) | `avc1.64001f` | `hvc1.2.4.L93.B0` |
| `settings.codec` P1 | `HVC1` (`C33`) | `AV01` | AV1 |
| `settings.fps` | `120` en los 6 (`B32:G32`) | `60/120/60/60/30/30` | 120 sólo P0/P1 |
| `settings.codec_priority` P1 | `hvc1,hev1,av01,vp09` (`C38`) | `av01,hvc1,hev1,dvh1,vp09` | AV1 primero |

- **Magnitud medida:** de **641 claves comunes** entre ambas hojas, **554 idénticas y 87 divergentes** (13,6 %). (Cruce reproducible con `_raw/sheets/06_*` vs `_raw/sheets/40_37_VALORES_UNIFICADOS.tsv`.)
- **Síntoma:** el libro contiene simultáneamente la escalera "P1 = 4K HEVC" (perfil) y la escalera "P1 = 8K AV1" (valores unificados, alineada con el manifiesto). La doctrina exige coherencia **triple** Excel↔JSON↔lista; aquí falla ya dentro del Excel.
- **Causa raíz probable:** `37_VALORES_UNIFICADOS` es un snapshot derivado (2 396 filas, `A1:M2889`) que se regeneró con otra calibración y no se re-sincronizó con `6_NIVEL_2_PROFILES` (663 filas).
- **Impacto:** si el export lee `6_NIVEL_2_PROFILES` (lo que hace `mod_PRISMA_Export.bas`, `SHEET_PROFILES = "6_NIVEL_2_PROFILES"`), **P1 sale como 4K HEVC** y se pierde AV1; si alguien "corrige" hacia `37_VALORES_UNIFICADOS`, P1 salta a 8K. Es exactamente el patrón del freeze 2026-06-08.
- **Corrección propuesta:** una sola fuente por atributo; `37_VALORES_UNIFICADOS` debe ser **derivada y de solo lectura** (o eliminarse del camino de export).
- **Prueba de cierre:** para las 641 claves comunes, 0 divergencias.

---

## F-03 · HIGH — Ley Cardinal 1 (Nivel↔Resolución+fps) violada en P1, P2, P3, P4 y P5

`settings.fps = 120` para **todos** los perfiles (`6_NIVEL_2_PROFILES!B32:G32`, tipo `N`), y `settings.targetFps = 120` (`B51:G51`), `vlcopt.video-fps = 120` (`B108:G108`), `settings.target_framerate = 120FPS` (`B633:G633`).

| Perfil | Resolución (`B21:G21`) | fps declarado | `codec_full` (`B37:G37`) | Techo HEVC del nivel | ¿Coherente? |
|---|---|---|---:|---|---|
| P0 | 7680×4320 | 120 | `dvh1.08.06` | DV 8.6 (8K) | ✔ (DV) |
| P1 | 3840×2160 | **120** | `hvc1.2.4.L153.B0` | L153 = 4K@**60** | ✘ **imposible** |
| P2 | 3840×2160 | **120** | `hvc1.2.4.L150.B0` | L150 = 4K@**30** | ✘✘ doble |
| P3 | 1920×1080 | **120** | `hvc1.2.4.L123.B0` | L123 = 1080p@**60** | ✘ |
| P4 | 1280×720 | **120** | `hvc1.2.4.L93.B0` | L93 = 720p@**30** | ✘ |
| P5 | 854×480 | **120** | `avc1.42c01e` | AVC L3.0 ≤ 720×576@30 | ✘ |

- **Agravante 1:** `headerOverrides.X-APE-CODEC` de P2 empieza por `hvc1.2.4.L123.B0` (`D135`) — un nivel de 1080p — sobre una resolución declarada de 4K: violación dentro del propio header.
- **Agravante 2:** `headerOverrides.X-Stream-FPS` sí trae fps sensatos (`B352:G352` = `60,120,60,60,30,30`) → **el libro se contradice a sí mismo** entre `settings.fps` y `X-Stream-FPS`.
- **Impacto:** freeze 2026-06-08 reproducido por diseño. El player rechaza la variante declarada.
- **Corrección propuesta:** `settings.fps` = el de `X-Stream-FPS` por perfil; P2 a `L153` (4K@60) o bajar fps a 60; P3→`L123` con 60fps; P4→`L93` con 30fps; P5→30fps.
- **Prueba de cierre:** para los 6 perfiles, `level_capacity(resolución,fps) ≥ declarado` con tabla HEVC Annex A.

---

## F-04 · HIGH — P2 declara tres resoluciones distintas

| Celda | Clave | Valor |
|---|---|---|
| `6_NIVEL_2_PROFILES!D8` | `name` | `2K QHD` |
| `D21` / `D25` | `resolution` / `settings.resolution` | `3840x2160` |
| `D109`/`D110` | `vlcopt.video-width/height` | `2560` / `1440` |
| `D121` | `kodiprop…max_resolution` | `2560x1440` |
| `D136` | `headerOverrides.X-APE-RESOLUTION` | arranca en `2560x1440,…` |
| `D351` | `headerOverrides.X-Stream-Resolution` | `3840x2160` |
| `D25` variante Documents | `settings.resolution` | `3840x2160` (igual) |

- **Síntoma:** el mismo perfil es 4K para STREAM-INF y 2K para VLC/Kodi. Si el generador usa `settings.resolution` y VLC usa `vlcopt.video-width`, el canal sale 4K declarado sobre un decoder capado a 2K.
- **Corrección propuesta:** fijar P2 = `3840x2160` en las 6 claves, o renombrar el perfil a `2K QHD` y bajar `resolution` a `2560x1440` (decisión del owner, no del auditor).

---

## F-05 · HIGH — `avgBitrateKbps` > `maxBitrateKbps` en P1–P5 (imposible)

| Perfil | `settings.maxBitrateKbps` (`B49:G49`) | `settings.avgBitrateKbps` (`B50:G50`) | Veredicto |
|---|---:|---:|---|
| P0 | 200 000 | 160 000 | ✔ |
| P1 | 40 000 | **75 000** | ✘ avg 1,875× max |
| P2 | 25 000 | **35 000** | ✘ 1,4× |
| P3 | 10 000 | **15 000** | ✘ 1,5× |
| P4 | 5 000 | **6 000** | ✘ 1,2× |
| P5 | 2 000 | **2 200** | ✘ 1,1× |

- Agravante: `headerOverrides.X-Stream-Bitrate` (`B349:G349`) pone a P1 en `40000000` bps mientras `X-APE-TARGET-BITRATE` (`C140`) arranca en `100000000` bps, y `vlcopt.adaptive-maxbitrate` (`B113:G113`) en P1 = `100000000`.
- **Impacto:** `AVERAGE-BANDWIDTH` > `BANDWIDTH` rompe la premisa del ABR (RFC 8216bis §4.4.6.2 recomienda `AVERAGE-BANDWIDTH ≤ BANDWIDTH`); players que usan avg para el ladder sobreestiman la variante.
- **Corrección propuesta:** `avg = ratio · max` con `ratio = settings.avg_bandwidth_ratio` (`B639:G639` = `0.75` salvo P5 `0.78`).

---

## F-06 · MEDIUM — Corrupción numérica por locale ES-ES (coma decimal) — 5 patrones medidos

| Celda(s) | Clave | Valor almacenado (literal) | Valor plausible | Evidencia |
|---|---|---|---|---|
| `B40:G40` | `settings.chroma_subsampling` | `168055555555556` (tipo `N`, style 37) | `4:2:0` | XML crudo: `<c r="E40" s="37"><v>168055555555556</v></c>`; el mismo valor en las 6 columnas. `4:02:00` como hora Excel = 0,168055… → el punto decimal se perdió al escalar |
| `B563:G563` | `hlsjs.abrBandWidthFactor` | `95, 9, 85, 8`… | `0.95, 0.9, 0.85, 0.8` | patrón 0,x → x |
| `B568:G568` | `hlsjs.nudgeOffset` | `1, 15, 2, 25` | `0.1, 0.15, 0.2, 0.25` | ídem |
| `B65:G65` / `B574:G574` | `settings.maxLiveSyncPlaybackRate` / `hlsjs.maxLiveSyncPlaybackRate` | `15,14,13,12,**115**,11` | `1.5,1.4,1.3,1.2,**1.15**,1.1` | P4 = `115` rompe la serie monótona |
| `B622:G622` | `prisma_boost_multiplier` | `2` / `1,5` / `1,2` — **mezcla número y texto con coma** | `2.0 / 1.5 / 1.2` | tipo mixto `N`/`S` en la misma fila |

- **Causa raíz:** escritura de valores con separador decimal `,` (locale ES-ES) por script, sin forzar formato invariante — exactamente la trampa documentada en `iptv-excel-safe-mode` (regla 6).
- **Impacto:** `hlsjs.abrBandWidthFactor = 95` significa "95" no "0,95" → ABR completamente descalibrado si el generador copia el literal; `chroma_subsampling` como entero envenena cualquier JSON que lo serialice tal cual.
- **Corrección propuesta:** reescribir esas celdas como número en `en-US` (o texto explícito `"4:2:0"`), y validar con un chequeo de tipo por clave.
- **Prueba de cierre:** ninguna celda de las claves afectadas con `value` que no parsee como número finito dentro de rango esperado.

---

## F-07 · MEDIUM — 25 claves normalizadas duplicadas (12 con valores divergentes)

En `6_NIVEL_2_PROFILES` la misma clave aparece dos veces con prefijo distinto (`settings.X` vs `X`). Grupos detectados (`_raw/metrics.json → profiles.duplicateKeyGroups`):

| Clave normalizada | Filas | ¿Divergen? | Ejemplo de divergencia |
|---|---|---:|---|
| `codec_string` | 632 / 651 | **sí** | P3: `hvc1.2.4.L123.B0,mp4a.40.2` vs `hvc1.2.4.L120.B0,mp4a.40.2` |
| `codec_chain_video` | 640 / 659 | **sí** | cadena larga distinta (L183… vs L153…) |
| `codec_chain_video_family` | 641 / 660 | **sí** | `L6.1>L6.0>…` vs `L5.1>L5.0>…` |
| `codec_chain_player_pref` | 644 / 663 | **sí** | P5 `hvc1,hev1,avc1,h264` vs `avc1,h264,hvc1,hev1` |
| `codec_primary` | 631 / 650 | **sí** | P3 `HVC1` vs `HEVC` (etiqueta distinta) |
| `hdr_mode` | 44 / 645 | **sí** | P0 `HDR10` (`B44`) vs `DOLBY_VISION_P8` (`B53`, y `B645`) |
| `color_primaries` | 43 / 647 | **sí** | `BT.2020` (texto) vs `9` (código) |
| `liveSyncDurationCount` | 64 / 557 | **sí** | `∅` en 64, `3/4/5` en 557 |
| `maxLiveSyncPlaybackRate` | 65 / 574 / 616 | **sí** | tres fuentes distintas |
| `nudgeMaxRetry` | 569 / 614 | **sí** | `10,8,7,5,4,3` vs `13,10,7,5…` |
| `video_range`, `resolution`, `strategy`, `vmaf_target`, `bandwidth_*`, `avg_bandwidth_ratio`, `nits_target`, `target_framerate`, `codec_chain_audio/hdr`, `transfer_characteristics`, `matrix_coefficients` | varios | no | mismo valor, duplicado textual |

- **Impacto:** según qué fila lea el VBA/JS, el JSON sale distinto. En `hdr_mode` la divergencia es semántica dura (HDR10 vs DOLBY_VISION_P8).
- **Corrección propuesta:** una clave = una fila; los alias planos (627–663) deben ser referencias, no copias.

---

## F-08 · MEDIUM — 3 placeholders `{prisma.*}` rotos en NIVEL 3 (marcados por el propio libro)

| Celda | Valor | Marca del libro |
|---|---|---|
| `7_NIVEL_3_CHANNEL!D42` | `{prisma.bitrate_floor}` | `E42` = *"⚠️ BROKEN: {prisma.bitrate_floor} not in NIVEL_2"* |
| `7_NIVEL_3_CHANNEL!D84` | `{prisma.bitrate_floor}` | misma marca |
| `7_NIVEL_3_CHANNEL!D88` | `{prisma.target_bandwidth}` | `E88` = *"⚠️ BROKEN: {prisma.target_bandwidth} not in NIVEL_2"* |

- **Matiz medido:** `6_NIVEL_2_PROFILES` **sí** tiene los datos, pero con otro nombre: `prisma_floor_min_bandwidth_bps` (`B624:G624`) y `prisma_target_bandwidth_bps` (`B625:G625`). Es un **desajuste de namespace** (`prisma.bitrate_floor` ≠ `prisma_floor_min_bandwidth_bps`), no una ausencia de dato.
- **Impacto:** el generador que sustituya placeholders deja `{prisma.bitrate_floor}` literal en `adaptive-minbw` y `inputstream.adaptive.initial_bandwidth` → Kodi/VLC reciben un valor no numérico.
- **Corrección propuesta:** mapear los 3 placeholders a `prisma_floor_min_bandwidth_bps` / `prisma_target_bandwidth_bps` en `32_PLACEHOLDERS_MAP` (que hoy resuelve 30 placeholders contra `18_CONFIG` pero ninguno `prisma.*`).

---

## F-09 · MEDIUM — Headers tóxicos: 1 valor latente + 1 credencial stub inyectada en los 6 perfiles

**Positivo (verificado):** `TE`, `Priority`, `If-None-Match`, `If-Modified-Since`, `Upgrade-Insecure-Requests` **no tienen valor** en ningún perfil (`6_NIVEL_2_PROFILES!A159/A163/A175/A176/A177/A185` sin celdas `B..G`). `Range` está vacío en `headerOverrides` (`A175`).

**Latente:** `7_NIVEL_3_CHANNEL!D57` = `bytes=0-` con nota `F57` = *"C8 (2026-05-11) DEACTIVATED -- toxic header detona okhttp EOF"*. Sólo está desactivado porque `A57` está **vacía**; el filtro `Cells(r,1)="X"` (medido en `APE_LAB_BRAIN.bas`) es el único guard. Un `X` en `A57` rearma el header tóxico.

**Inyectado (peor):** `6_NIVEL_2_PROFILES!B532:G532` `Proxy-Authorization` y `B533:G533` `X-Auth-Stub-Basic` = `Basic YW5vbjphbm9u` (= base64 de `anon:anon`) **en los 6 perfiles**. Coincide con `16_EVASION!G32` (fallback del 407). Es una credencial falsa que viaja al proveedor en cada request → puede disparar bucles 407/WAF y contradice `headerOverrides.X-Credentials-Isolation` = `per-server-namespace` (`B478:G478`).
- **Corrección propuesta:** quitar el stub del camino caliente; dejar el 407-handling sólo en la capa de recuperación.

---

## F-10 · MEDIUM — Floor-Lock (VPS) desalineado con los pisos de perfil

| Clave | Valor | Fuente |
|---|---|---|
| `floor_lock_min_bandwidth_p0` | **15 000 000** bps (rotulado "Piso 8K UHD") | `15_FLOOR_LOCK_CONFIG!B5` |
| `floor_lock_min_bandwidth_p1` | 15 000 000 | `B6` |
| `floor_lock_min_bandwidth_p2` | 15 000 000 | `B7` |
| `floor_lock_min_bandwidth_p3` | 8 000 000 | `B8` |
| `floor_lock_min_bandwidth_p4` | 8 000 000 | `B9` |
| `floor_lock_min_bandwidth_p5` | 4 000 000 | `B10` |
| `x_max_bitrate_upstream_header` | **20 000 000** | `B14` |
| vs `settings.bandwidth_max` P0 | 80 000 000 | `6_NIVEL_2_PROFILES!B638` |
| vs `settings.bandwidth_max` P1 | 28 000 000 | `C638` |

- **Síntoma:** el filtro Lua Floor-Lock deja pasar variantes desde 15 Mbps para P0 (que declara 200/80 Mbps) y **capa el upstream a 20 Mbps** con `x_max_bitrate_upstream_header`, contradiciendo el piso y el techo del perfil. P0 y P1 comparten piso (15 Mbps) pese a resoluciones distintas.
- **Impacto:** en la práctica el VPS recorta el techo que el LAB declara — desalineación directa Excel↔VPS y pérdida de imagen máxima (contra MAX IMAGE FIRST).
- **Corrección propuesta:** derivar los 6 pisos de `settings.bandwidth_floor` por perfil y eliminar el cap fijo de 20 Mbps o subirlo a `max(bandwidth_max)`.

---

## F-11 · LOW — Dolby Vision declarado con dos perfiles distintos

- `settings.codec` P0 = `DVH1` (`B33`), `settings.codec_full` P0 = `dvh1.08.06` (`B37`), `settings.hdrMode` = `DOLBY_VISION_P8` (`B53`).
- `headerOverrides.X-Dolby-Vision-Profile` = `8.1` sólo en P0 y **P2** (`B369`=8.1, `D369`=8.1), `X-Dolby-Vision-Level` = `10` (`B370`, `D370`).
- **Contradicción:** (a) `08.06` (P8.6) vs `8.1` (P8.1); (b) P2 declara DV 8.1 pero su `codec_full` es `hvc1` y su `hdrMode` es `HLG` (`D53`) → DV declarado sin codec DV.
- **Corrección propuesta:** un único `dolby_vision_profile` por perfil y `X-Dolby-Vision-*` vacío donde no haya DV.

---

## F-12 · LOW — `bit_depth = 12` sobre Dolby Vision Profile 8 (10-bit)

`settings.bit_depth` P0 = `12` (`B39`), `settings.bitDepth` P0 = `12` (`B52`), `vlcopt.video-bit-depth` P0 = `12` (`B101`); `settings.color_transfer` = `SMPTE ST 2084 (PQ)` y `peak_luminance_nits` = `10000` (`B45`). DV Profile 8 es single-layer de 10 bits: 12 bits es inconsistente con `dvh1.08.06`.
- **Corrección propuesta:** P0 a `10` bits, o cambiar el codec a `dvh1.09.*`/Main12 real si el owner quiere 12 bits.

---

## F-13 · HIGH — Credenciales en claro en el libro **y** exportadas al JSON

| Ubicación | Contenido | Filas/celdas |
|---|---|---|
| `17_SERVERS_POOL!C4:E9`, `C14:E17` | base_url + **username + password** | 10 servidores |
| `14_KEYRING!A4:F8` | keyring en claro (`jwt_v1`, `aes_main`, `hmac_session`, `iv_static`, `hydra_key`) | 5 llaves |
| `98_SHIELD_IMMUTABLE!B3` | `SHIELD_MASTER_TOKEN` (64 hex) | 1 |
| `99_DEAD_CHANNELS_BLACKLIST!F2:G568` | **user + pass** por canal muerto | 567 filas |

- **Lo que multiplica el riesgo (código, no sospecha):** `APE_LAB_BRAIN.bas` construye `"servers": [{"base_url":…,"username":…,"password":…}]` leyendo `wsSrv.Cells(r,4)` y `Cells(r,5)` **sin enmascarar**. Ese JSON es el que consume la app.
- **Ningún valor se reproduce aquí** (protocolo inter-sesión §11). Todos están enmascarados en `EXCEL_INVENTORY.md` §8.
- **Corrección propuesta:** mover credenciales a un vault/`.env` fuera del libro; el JSON exportado debe llevar `credential_ref`, nunca `password`.
- **Prueba de cierre:** `grep` de `"password"` en el JSON exportado = 0.

---

## F-14 · HIGH — La rama canónica **no tiene** `30_DISNEY_GRADE_DIRECTIVES`

- La hoja existe **solo** en `Documents\APE_M3U8_LAB_v8_FIXED.xlsm` (`E3BC629E…`), con **14 filas / 69 celdas** y **8 `#EXT-X-SESSION-DATA`** (ver `EXCEL_HEADERS_EXTRACT.md` §6: `exoplayer.load_control`, `exoplayer.track_selection`, `com.ape.live_sync`, `com.ape.recovery_policy`, `com.ape.network_resilience`, `com.ape.abr_quality_policy`, `com.ape.universal_parity`, `com.ape.codec_preferences`) + `EXT-X-START(-3.0)`, `EXT-X-SERVER-CONTROL`, `EXT-X-TARGETDURATION=2`, `EXT-X-PART-INF(PART-TARGET=1.0)`, `EXT-X-INDEPENDENT-SEGMENTS`.
- **Síntoma:** el "Disney grade" (paridad LL-HLS/Disney+) **no llega al export canónico**: si el JSON se generó el 2026-06-11 desde la rama Downloads, esas 8 `SESSION-DATA` y los tags de timeline **no están** en la cadena.
- **Riesgo adicional:** `EXT-X-TARGETDURATION=2` y `EXT-X-PART-INF` son tags **de media playlist**; emitirlos en un master (como hacen otras hojas de 3 niveles) viola la separación master/media (RFC 8216 §4.3.3.1 / §4.4.3.2).
- **Corrección propuesta:** (1) decidir rama; (2) si se adopta Disney, colocarlo en la capa correcta y sólo para playlists media; (3) añadir prueba de tipo de playlist.

---

## F-15 · MEDIUM — TLS obsoleto en la cabecera global

- `5_NIVEL_1_HEADER!C34` `#EXT-X-SYS-TLS-PRIORITY` = `tls1.2,tls1.1`; `C36` `#EXT-X-SYS-MIN-TLS-VERSION` = `1.0`; `C35` `#EXT-X-SYS-TLS-REQUIRED` = `false` (esta última no se emite: `A35` vacía).
- **Impacto:** TLS 1.0/1.1 están deprecados (RFC 8996); declararlos en la metadata del generador invita a degradación de transporte. En el VPS real no se aplica (nginx no lo lee), pero la lista puede propagarlo si algún consumidor lo interpreta.
- **Corrección propuesta:** `tls1.3,tls1.2` y `MIN-TLS-VERSION=1.2`.

---

## F-16 · MEDIUM — 8 named ranges en notación R1C1 (riesgo de corrupción silenciosa)

Detectados en `xl/workbook.xml → definedNames`:

| Nombre | RefersTo (literal) | Notación |
|---|---|---|
| `BUFFER_LIST` | `_LISTAS!F3C12:F7C12` | **R1C1** |
| `CODEC_LIST` | `_LISTAS!F1C10:F7C10` | **R1C1** |
| `CONN_LIST` | `_LISTAS!F1C14:F2C14` | **R1C1** |
| `HDR_LIST` | `_LISTAS!F1C11:F7C11` | **R1C1** |
| `REF_LIST` | `_LISTAS!F1C8:F4C8` | **R1C1** |
| `RES_LIST` | `_LISTAS!F1C9:F7C9` | **R1C1** |
| `UA_LIST` | `_LISTAS!F1C7:F9C7` | **R1C1** |
| `lst_PlayerTargets` | `'98_VALIDATIONS'!F2C2:F7C2` | **R1C1** |

- **Por qué importa:** es la trampa #8 de `iptv-excel-safe-mode` ("Named Ranges: A1 notation ONLY, never R1C1 → corrupción silenciosa y Validation roto"). Toda `Data Validation` que apunte a estos nombres es frágil. Además `lst_PlayerTargets` en la rama Documents está en A1 (`$B$2:$B$6`) → las dos ramas no son equivalentes.
- **Corrección propuesta:** reescribir los 8 a A1 (`_LISTAS!$F$3:$F$7`, etc.).

---

## F-17 · LOW — Inventario de directivas incompleto frente a la doctrina

- Doctrine OMEGA: **24** `#EXT-X-VNOVA-LCEVC-*` por canal. `2_CATALOGO_MASTER` inventaría **21** (`C161`…). `8_MATRIX_3D` y `37_VALORES_UNIFICADOS` repiten 21.
- Faltan además hojas doctrinales por nombre: `servers` (existe como `17_SERVERS_POOL`, veryHidden), `30_DISNEY_GRADE_DIRECTIVES` (solo rama Documents), `30_EXPORT_FINAL` ✔ existe, `25_JSON_EXPORT` ✔ existe.
- **Corrección propuesta:** completar las 3 filas del catálogo o corregir la doctrina a 21.

---

## F-18 · LOW — `network-caching` global (8000) vs perfil (5000)

- `5_NIVEL_1_HEADER!C19` `#EXT-X-SYS-NETWORK-CACHING` = `8000` y `C18` `GLOBAL-BUFFER-STRATEGY` = `NETWORK=8000,LIVE=4500,FILE=4000`.
- `6_NIVEL_2_PROFILES!B67` `vlcopt.network-caching` = `5000` en las 6 columnas; `7_NIVEL_3_CHANNEL!D23` = `5000`.
- **Síntoma:** dos valores para el mismo parámetro (nivel 1 gana si el generador emite la cabecera; nivel 2/3 pierde). `#EXT-X-SYS-*` es metadata APE (los players lo ignoran), pero el toolkit sí lo lee → divergencia de telemetría.
- **Corrección propuesta:** una sola fuente (`vlcopt.network-caching` por perfil) y que NIVEL 1 emita `{profile.network_caching}`.

---

## 1 · Checklist de lo que el JSON **debería** contener según el Excel (para el verificador)

Cada ítem es contrastable con `EXCEL_PROFILES_EXTRACT.json` (que cita celda por valor).

**A. Identidad y trazabilidad**
- [ ] A1. El JSON declara la rama de origen (`Downloads` 55 hojas vs `Documents` 56 hojas) y el `sha256` del `.xlsm` que lo produjo.
- [ ] A2. `profiles_calibrated.P0..P5` existen los 6, con `id/name/level/quality` = `B7:B12`…`G7:G12`.

**B. Núcleo visual por perfil (valores literales del Excel)**
- [ ] B1. `resolution`: `7680x4320 / 3840x2160 / 3840x2160 / 1920x1080 / 1280x720 / 854x480` (filas 21 & 25).
- [ ] B2. `fps`: **una** de las dos fuentes, declarada explícitamente (fila 32 = `120`×6, o fila 352 = `60,120,60,60,30,30`).
- [ ] B3. `codec_full`: `dvh1.08.06 / hvc1.2.4.L153.B0 / hvc1.2.4.L150.B0 / hvc1.2.4.L123.B0 / hvc1.2.4.L93.B0 / avc1.42c01e` (fila 37) **o** la escalera de `37_VALORES_UNIFICADOS` — nunca una mezcla (F-02).
- [ ] B4. `bit_depth`: `12/10/10/10/8/8` (fila 39) coherente con el codec (F-12).
- [ ] B5. `bitrate`: `maxBitrateKbps` = `200000/40000/25000/10000/5000/2000` y `avgBitrateKbps` ≤ `max` (F-05).
- [ ] B6. `color_space`/`transfer`/`primaries`/`hdrMode`/`videoRange` sin contradicción interna (F-07, F-11).
- [ ] B7. `chroma_subsampling` = `4:2:0` textual, **no** `168055555555556` (F-06).

**C. Headers**
- [ ] C1. `headerOverrides` con **409** claves por perfil (400 con valor); las 9 vacías deben viajar como `null`, no como `""` que se emita.
- [ ] C2. Cero claves tóxicas con valor: `TE`, `Priority`, `If-None-Match`, `If-Modified-Since`, `Upgrade-Insecure-Requests`, `Range`.
- [ ] C3. `Proxy-Authorization` / `X-Auth-Stub-Basic` **ausentes** o marcados como stub no emitible (F-09).
- [ ] C4. `X-HDCP-Level` = `TYPE-1, TYPE-1, TYPE-1, NONE, NONE, NONE` (fila 519) — coherente con el HDCP-Adaptive Engine, sin hardcode universal.
- [ ] C5. `vlcopt` 47 claves y `kodiprop` 8 claves por perfil; `kodiprop...stream_headers` no vacío en P4/P5 (en el Excel `F118:G118` están **vacías** → ver F-19 abajo).

**D. Config de motor**
- [ ] D1. `hlsjs` 41 claves; `abrBandWidthFactor`/`abrBandWidthUpFactor` en rango `(0,1]` — hoy en el Excel valen `95/9/85/8` (F-06).
- [ ] D2. `prefetch_config` 14 claves; `hlsjs.maxBufferSize` = `251658240/167772160/104857600/62914560/41943040/26214400` (fila 555).
- [ ] D3. `bounds`/`opt` presentes (14 + 10 claves) y sin NaN/`4.6e14`.

**E. Niveles 1 y 3**
- [ ] E1. `nivel1`: **50** directivas emitibles (de 56) con su valor literal (`5_NIVEL_1_HEADER`).
- [ ] E2. `nivel3_per_layer`: `EXTINF 8, EXTVLCOPT 23, KODIPROP 16, EXTHTTP 7, STREAM-INF 7, SYS 0, URL 4` — si `SYS` sale con 8 entradas, el export ignoró el flag `X` (F-20 abajo).
- [ ] E3. Cero placeholders sin resolver: `{prisma.bitrate_floor}`, `{prisma.target_bandwidth}` (F-08).

**F. Extras que sólo existen en la rama Documents**
- [ ] F1. Si se adopta la rama Documents: 8 `#EXT-X-SESSION-DATA` + `EXT-X-START` + `EXT-X-SERVER-CONTROL` + `EXT-X-TARGETDURATION=2` + `EXT-X-PART-INF` deben aparecer **en la capa correcta** (F-14).
- [ ] F2. `8_CODEC_LADDER` debe mapear a `PRISMA_CODEC_LADDER_P0..P5` en el JSON (named ranges ya cableados).

**G. Seguridad**
- [ ] G1. `servers[]` sin `password` en claro (F-13).
- [ ] G2. Ningún `SHIELD_MASTER_TOKEN` en el JSON público.

---

## 2 · Dos hallazgos de segunda pasada (medidos al construir el checklist)

### F-19 · MEDIUM — P4/P5 sin `kodiprop.stream_headers`
`6_NIVEL_2_PROFILES!F118` y `G118` (`kodiprop.inputstream.adaptive.stream_headers`) están **vacías**, mientras P0–P3 llevan el marcador `[ENCODED_HEADERS]`. Kodi en P4/P5 saldría **sin cabeceras** (sin UA/Referer) → 403 del proveedor en los perfiles más débiles, justo donde el failsafe importa.

### F-20 · MEDIUM — La capa `SYS` de NIVEL 3 nunca se emite
8 filas (`7_NIVEL_3_CHANNEL!A69:A76`: `SYS-TLS-VERIFY-PEER=0`, `SYS-PREFETCH-SEGMENTS=6`, `SYS-PREFETCH-PARALLEL=6`, `SYS-CATCHUP=flussonic`, `SYS-CATCHUP-DAYS=7`, `SYS-CLOCK-SYNCHRO=0`, `SYS-SERVER-POOL-MODE=failover`, `SYS-RECONNECT-COUNT=99`) **no tienen `X`** en la columna `A`, y `APE_LAB_BRAIN.bas` filtra exactamente por `Cells(r,1)="X"` → `nivel3_per_layer.SYS = []`. El LL-HLS/live-delay configurado en esta capa no llega nunca al JSON.

---

## 3 · UNKNOWN declarados

| # | UNKNOWN | Motivo |
|---|---|---|
| U-1 | Rama canónica definitiva (Downloads vs Documents) | Sin declaración del owner ni historial versionado (F-01) |
| U-2 | Si el JSON `LAB_CALIBRATED_20260611_020645.json` salió de la rama Downloads | Correlación temporal fuerte (12 min) pero no hay hash del libro dentro del JSON; lo confirma `json-ssot` |
| U-3 | Autoría/orden de las reescrituras openpyxl | `lastModifiedBy="o 6742"`, `creator="openpyxl"`, sin log dentro del libro |
| U-4 | Efecto de openpyxl sobre validaciones/estilos/formas | Solo se midió estructura OOXML, no se comparó celda-a-celda contra guardado nativo de Excel |
| U-5 | Contraseñas de las 4 hojas protegidas | SHA-512/spin 100 000; descifrar está fuera de alcance y prohibido |

---

## 4 · Nota de método

Todos los números de este informe provienen de `_raw/inventory.json`, `_raw/directives.json`, `_raw/metrics.json`, `_raw/snapshots.json`, `_raw/live_candidates.json`, de los volcados citados en `_raw/sheets/` y `_raw/formulas/`, y de `_raw/vba/full_vba_dump.txt` — todos generados por los 4 scripts de `tools/` sobre una **copia temporal hash-verificada** del `.xlsm`. El original sólo se abrió para leerlo y copiarlo: **0 escrituras**, `sha256` origen == `sha256` copia == `663EF44E…806A` (re-verificado al cierre).

Los volcados de las hojas que contienen credenciales (`17_SERVERS_POOL`, `14_KEYRING`, `98_SHIELD_IMMUTABLE`, `99_DEAD_CHANNELS_BLACKLIST`) **no se conservan** en el lane, deliberadamente: se regeneran bajo demanda y su contenido está descrito —enmascarado— en `EXCEL_INVENTORY.md` §8 y F-13.
