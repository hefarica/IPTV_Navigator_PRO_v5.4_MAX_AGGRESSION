# EXCEL_HEADERS_EXTRACT — conteos exactos de directivas por hoja

**Archivo medido:** `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` · `sha256=663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` · 3 582 019 B · 55 hojas
**Método:** búsqueda literal de token sobre **todas** las celdas de tipo texto (`S`/`INLINE`/`STR`) de cada hoja, leídas del OOXML. Excel no se abrió.
**Dos métricas distintas, no intercambiables:**
- **celdas** = número de celdas que *contienen* el token al menos una vez (lo que un lector humano llamaría "una línea").
- **ocurrencias** = número total de apariciones del token (una celda puede contener el token varias veces).

Regenerable con `_raw/directives.json` (salida de `tools/extract_lab_ssot.py`).

---

## 1 · Tabla maestra (celdas / ocurrencias)

Solo se listan las hojas con al menos un token de la familia. `—` = 0.

| Hoja | `#EXTHTTP` | `#EXTVLCOPT` | `#KODIPROP` | `#EXT-X-SESSION-DATA` | `#EXT-X-VNOVA-LCEVC` | `LCEVC` (case-exact) |
|---|---:|---:|---:|---:|---:|---:|
| `1_README` | 1 / 1 | 1 / 1 | 1 / 1 | — | — | — |
| `2_CATALOGO_MASTER` | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | **21 / 21** | **51 / 51** |
| `3_CAPAS` | 1 / 1 | 1 / 1 | 1 / 1 | — | — | — |
| `6_NIVEL_2_PROFILES` | — | — | — | — | — | **22 / 82** |
| `8_MATRIX_3D` | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | **21 / 21** | **61 / 61** |
| `23_BOTTLENECK` | — | — | — | — | — | 1 / 1 |
| `34_BRAIN_SCORING` | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | **21 / 21** | **71 / 71** |
| `37_VALORES_UNIFICADOS` | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | **21 / 21** | **89 / 155** |

Lectura honesta: **el LAB no almacena listas M3U8**. Almacena (a) una *tabla de capas* (`7_NIVEL_3_CHANNEL`, 77 filas de plantilla), (b) un *registro de directivas* (`2_CATALOGO_MASTER`, 1 761 directivas inventariadas, 1 fila por directiva) y (c) los *valores por perfil* (`6_NIVEL_2_PROFILES`, 409 `headerOverrides.*` × 6 perfiles). Por eso los conteos por hoja son de **1 celda por familia** en el catálogo: ahí `#EXTHTTP` es *la fila de la directiva*, no una emisión.

---

## 2 · `5_NIVEL_1_HEADER` — cabecera global

**56 directivas `#EXT-X-SYS-*` / `#EXT-X-*` en `B7:B72`; 50 marcadas para emitir (`A="X"`), 6 no marcadas.**

| Capa declarada en la hoja | Filas | Rango |
|---|---:|---|
| IDENTIDAD | 6 | `A6:A12` |
| COMPATIBILIDAD | 3 | `A13:A16` |
| BUFFER GLOBAL | 4 | `A17:A21` |
| PROTOCOLO HTTP | 10 | `A22:A32` |
| TLS GLOBAL | 4 | `A33:A36` |
| CODECS GLOBAL | 4 | `A37:A41` |
| RESILIENCIA | 6 | `A42:A48` |
| FINGERPRINT | 6 | `A49:A55` |
| SERVIDORES ROTATION | 4 | `A56:A62` |
| EVASION GLOBAL | 7 | `A63:A70` |
| EXTHTTP GLOBAL JSON | 1 | `A71:A72` |

**Las 6 no marcadas (no se emiten):** `B24` `#EXT-X-SYS-PREFER-HTTP3` (`C24=false`), `B29` `#EXT-X-SYS-HTTP2-PUSH` (`C29=disabled`), `B30` `#EXT-X-SYS-HTTP3-0RTT` (`C30=disabled`), `B35` `#EXT-X-SYS-TLS-REQUIRED` (`C35=false`), `B61` `#EXT-X-SERVER-2`, `B62` `#EXT-X-SERVER-3`.

Muestras literales (celda → valor):
- `5_NIVEL_1_HEADER!C14` → `RFC8216` · `C15` → `OTT_NAVIGATOR,VLC,KODI,TIVIMATE,SMARTERS`
- `C34` → `tls1.2,tls1.1` · `C36` → `1.0` (⚠ ver F-15)
- `C38` → `dvh1,dvhe,hvc1,hev1,av01,vp09,avc1` · `C39` → `ac-3,mp4a.40.2`
- `C60` → `http://ky-tv.cc:80` (host del pool; sin credenciales)
- `C66` → `104` (tamaño del pool de UA declarado) · `C68` → `407,403,429,502,503`
- `C72` → JSON de cabecera global (`#EXT-X-SYS-HTTP-HEADERS`), cadena de >100 cabeceras.

---

## 3 · `7_NIVEL_3_CHANNEL` — bloque por canal

**77 filas de plantilla (filas 6–91), repartidas en 7 capas. 65 marcadas `X`, 12 no marcadas.**

| Capa (`B`) | Filas totales | Marcadas `X` | No marcadas (no se emiten) |
|---|---:|---:|---|
| `EXTINF` | 8 | 8 | — |
| `EXTVLCOPT` | 23 | 23 | — |
| `KODIPROP` | 16 | 16 | — |
| `EXTHTTP` | 10 | **7** | `r53` Connection, `r54` Keep-Alive, `r57` Range |
| `STREAM-INF` | 8 | **7** | `r66` HDCP-LEVEL |
| `SYS` | 8 | **0** | `r69…r76` (los 8) |
| `URL` | 4 | 4 | — |
| **Total** | **77** | **65** | **12** |

Confirmación del filtro (código, no inferencia): `APE_LAB_BRAIN.bas` → `If UCase(CStr(wsN3.Cells(r, 1).value)) = "X" Then … InStr(…, layerName)` al construir `nivel3_per_layer`. Es decir: **la columna `A` es el interruptor real de emisión**, y `SYS` exporta un array **vacío**.

Valores literales relevantes (celda → valor):
- `D12` → `xc` (catchup) · `D13` → `7` · `D14` → `?utc={utc}&lutc={lutc}`
- `D22` → `30000` · `D23` → `5000` (network-caching) · `D24` → `4500` · `D25` → `4000`
- `D31/D32` → `7680`/`4320` · `D33` → `60000` (adaptive-maxbuffer)
- `D40` → `{config.kodi_headers_urlencoded}` · `D42` → `{prisma.bitrate_floor}` marcado en `E42` = *"⚠️ BROKEN: {prisma.bitrate_floor} not in NIVEL_2"*
- `D57` → `bytes=0-` con `F57` = *"C8 (2026-05-11) DEACTIVATED -- toxic header detona okhttp EOF"* (no se emite porque `A57` está vacía)
- `D66` → `NONE` (HDCP-LEVEL, no emitido aquí; el HDCP se decide por perfil en `6_NIVEL_2_PROFILES!B519`)
- `D84` → `{prisma.bitrate_floor}` (⚠ BROKEN) · `D88` → `{prisma.target_bandwidth}` (⚠ BROKEN)
- `D89` → `2160` · `D90` → `1` · `D91` → `fixed`

---

## 4 · `6_NIVEL_2_PROFILES` — 409 overrides × 6 perfiles

Estructura transpuesta: **col A = clave**, **cols B..G = P0..P5**. Secciones declaradas por marcadores (`A6`, `A24`, `A66`, `A116`, `A125`, `A535`, `A551`, `A593`, `A609`, `A621`) y conteo exacto de claves por sección (idéntico en los 6 perfiles):

| Sección | Rango de filas | Claves | Celdas no vacías por perfil |
|---|---|---:|---:|
| `-- META --` | 6–23 | 17 | 17 |
| `-- SETTINGS --` | 25–65 | 41 | 40 (`settings.liveSyncDurationCount` vacía en los 6) |
| `-- VLCOPT --` | 67–113 | 47 | 47 |
| `-- KODIPROP --` | 117–124 | 8 | 8 |
| `-- HEADEROVERRIDES --` | 126–534 | **409** | **400** (9 claves sin valor: `Upgrade-Insecure-Requests`, `TE`, `Range`, `If-None-Match`, `If-Modified-Since`, `Priority`, `Keep-Alive`, `Connection`, `Sec-CH-UA-Model`) |
| `-- PREFETCH_CONFIG --` | 536–550 | 14 | 14 |
| `-- HLSJS --` | 552–592 | 41 | 41 |
| `-- OPTIMIZER BOUNDS --` | 594–607 | 14 | 14 |
| `-- OPTIMIZER RESULTS --` | 610–619 | 10 | 10 |
| `-- PRISMA STAGE 1 --` | 622–625 | 4 | 4 |
| *alias planos* (`hdr_mode`, `codec_string`, `bandwidth_*`…) | 627–663 | 36 | 36 |
| **Total** | | **678** | **665** |

**Las 6 cabeceras tóxicas clásicas están AUSENTES como valor** (no aparecen en `B..G`) salvo `Range`, que sí tiene valor en dos sitios controlados:
- `6_NIVEL_2_PROFILES!B175/F175` (`headerOverrides.Range`) → **vacías/MISSING** ✔
- `headerOverrides.TE` (fila 163), `Priority` (185), `If-None-Match` (176), `If-Modified-Since` (177), `Upgrade-Insecure-Requests` (159) → **MISSING** ✔
- excepción: `B532:G533` `Proxy-Authorization` / `X-Auth-Stub-Basic` = `Basic <base64 anon:anon>` en los 6 perfiles (⚠ F-09)

Conteo de la familia LCEVC dentro de esta hoja: **22 celdas, 82 ocurrencias** — repartidas en las claves `X-APE-LCEVC-*` (filas 277–286, 10 claves × 6 perfiles = 60 celdas potenciales; 22 con valor) más menciones dentro del bloque de cabeceras `B15:G15` (JSON de headers). Primer ejemplo: `B15` (JSON de cabeceras del perfil P0, contiene `LCEVC`).

---

## 5 · `2_CATALOGO_MASTER` — registro de directivas (no emisión)

`A1:J1762` → cabecera en fila 1, **1 761 directivas** en filas 2–1762.
Columnas: `A #`, `B Seccion`, `C Tag/Key/Header`, `D L1 (Feb1)`, `E L2 (Mar1)`, `F L3 (Apr11)`, `G Status`, `H Player target`, `I Universal`, `J Score impacto`.

Conteos medidos en el registro:
| Token | Celdas | Dónde |
|---|---:|---|
| `#EXT-X-VNOVA-LCEVC` | 21 | p.ej. `C161` = `#EXT-X-APE-CONTENT-HEURISTIC-4K-LCEVC` |
| `LCEVC` | 51 | ídem + derivados |
| `#EXTHTTP` | 1 | `C1011` |
| `#EXTVLCOPT` | 1 | `C1014` |
| `#KODIPROP` | 1 | `C1015` |
| `#EXT-X-SESSION-DATA` | 1 | `C980` |

Nota de doctrina: el manifiesto OMEGA declara **24** `#EXT-X-VNOVA-LCEVC-*` por canal; el registro solo inventaría **21** → 3 tags doctrinales sin fila en el catálogo (ver F-17).

---

## 6 · `30_DISNEY_GRADE_DIRECTIVES` — **solo existe en la rama Documents**

En la rama canónica (Downloads) la hoja **no existe**. En `C:\Users\HFRC\Documents\APE_M3U8_LAB_v8_FIXED.xlsm` (`sha256=E3BC629E…`) sí: **14 filas, 69 celdas**, columnas `key | value | category | applies_to | comment`.

| Fila | key | valor (recortado) | categoría |
|---:|---|---|---|
| 2 | `EXT-X-START` | `TIME-OFFSET=-3.0,PRECISE=YES` | timeline |
| 3 | `EXT-X-SERVER-CONTROL` | `CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0,…` | timeline |
| 4 | `EXT-X-TARGETDURATION` | `2` | fragmentation |
| 5 | `EXT-X-PART-INF` | `PART-TARGET=1.0` | fragmentation |
| 6 | `EXT-X-SESSION-DATA` | `DATA-ID="exoplayer.load_control",VALUE="{…}"` | abr |
| 7 | `EXT-X-SESSION-DATA` | `DATA-ID="exoplayer.track_selection",VALUE="{…}"` | abr |
| 8 | `EXT-X-INDEPENDENT-SEGMENTS` | *(sin value)* | quality |
| 9 | `EXT-X-SESSION-DATA` | `DATA-ID="com.ape.live_sync",VALUE="{…}"` | timeline |
| 10 | `EXT-X-SESSION-DATA` | `DATA-ID="com.ape.recovery_policy",…` | recovery |
| 11 | `EXT-X-SESSION-DATA` | `DATA-ID="com.ape.network_resilience",…` | recovery |
| 12 | `EXT-X-SESSION-DATA` | `DATA-ID="com.ape.abr_quality_policy",…` | abr |
| 13 | `EXT-X-SESSION-DATA` | `DATA-ID="com.ape.universal_parity",…` | quality |
| 14 | `EXT-X-SESSION-DATA` | `DATA-ID="com.ape.codec_preferences",…` | quality |

**Conteo exacto:** 8 × `#EXT-X-SESSION-DATA` (7 con `DATA-ID`, 1 `EXT-X-INDEPENDENT-SEGMENTS` sin valor), 1 × `EXT-X-START`, 1 × `EXT-X-SERVER-CONTROL`, 1 × `EXT-X-TARGETDURATION`, 1 × `EXT-X-PART-INF`. `applies_to = ALL` en las 14 filas.

---

## 7 · Resumen ejecutivo de conteos (para citar sin ambigüedad)

| Afirmación | Número exacto | Fuente |
|---|---:|---|
| Hojas totales / ocultas | 55 / 6 | `xl/workbook.xml` |
| Directivas globales NIVEL 1 emitibles | **50 de 56** | `5_NIVEL_1_HEADER!A7:A72` |
| Filas de plantilla NIVEL 3 emitibles | **65 de 77** | `7_NIVEL_3_CHANNEL!A6:A91` |
| Capa `SYS` de NIVEL 3 emitida | **0 de 8** | `7_NIVEL_3_CHANNEL!A69:A76` vacías |
| `headerOverrides.*` por perfil | **409** (400 con valor) | `6_NIVEL_2_PROFILES!A126:A534` |
| `vlcopt.*` por perfil | 47 | `A67:A113` |
| `kodiprop.*` por perfil | 8 | `A117:A124` |
| `hlsjs.*` por perfil | 41 | `A552:A592` |
| Directivas inventariadas en el catálogo | 1 761 | `2_CATALOGO_MASTER!A2:A1762` |
| `#EXT-X-VNOVA-LCEVC` inventariados | **21** (doctrina pide 24) | `2_CATALOGO_MASTER!C161…` |
| `#EXT-X-SESSION-DATA` de la hoja Disney | 8 | `30_DISNEY_GRADE_DIRECTIVES` (solo rama Documents) |
| Cabeceras tóxicas con valor en el libro | **1** (`Range: bytes=0-`, no emitida) | `7_NIVEL_3_CHANNEL!D57` (col A vacía) + `Proxy-Authorization` stub en `6_NIVEL_2_PROFILES!B532:G533` |
