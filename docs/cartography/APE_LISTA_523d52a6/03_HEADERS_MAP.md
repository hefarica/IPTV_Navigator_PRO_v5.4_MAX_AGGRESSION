# 03 — Mapa de metadatos y transporte por canal

**Objeto:** `APE_LISTA_1793589060441.m3u8`
**Ruta (solo lectura):** `C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\DSH_BLUEGREEN_021\home\attachments\v1\files\52\523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6\APE_LISTA_1793589060441.m3u8`
**Tamaño:** 604.593.696 bytes
**SHA-256:** `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`
**Artefacto machine-readable:** [`03_headers_map.json`](03_headers_map.json)
**Analizador reproducible:** [`03_headers_analyzer.mjs`](03_headers_analyzer.mjs)

Verificación de identidad (comando y salida literal):

```
PS> Get-Item -LiteralPath $f | Select Length
Length : 604593696
PS> (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash
523D52A6D147F81CE5A212E47B9C55401FB409CD4A41AEE96F8BA80B5B5049D6
```

Ejecución del analizador (un solo pase streaming, 43 s):

```
PS> node docs\cartography\APE_LISTA_523d52a6\03_headers_analyzer.mjs --out docs\cartography\APE_LISTA_523d52a6\03_headers_map.json
[ok] escrito docs\cartography\APE_LISTA_523d52a6\03_headers_map.json (145523 bytes)
[ok] canales=10573 lineas=10315662 sha256=523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6
```

Todos los números de este documento salen de ese JSON o de los comandos `rg` citados junto a cada cifra.
Ningún valor de header, propiedad o atributo se reproduce en claro: los únicos valores emitidos pasan por
`redact()` (`user:pass@`, rutas Xtream, JWT, `Bearer`/`Basic`, `token=`/`password=`, blobs base64/hex ≥ 40).

---

## 0. Estructura del corpus (necesaria para leer el resto)

| Hecho medido | Valor | Comando / fuente |
|---|---|---|
| Líneas totales | 10.315.662 | `meta.total_lines` |
| Líneas de extensión (`#`) | 10.294.513 | `meta.extension_lines` |
| Líneas NO-tag (= URIs) | **10.573** | `meta.non_tag_lines` |
| Canales (`#EXTINF`) | **10.573** | `rg -c '^\#EXTINF'` → `10573` |
| Canales declarados por la lista | 10.573 | `#EXT-X-APE-CHANNELS:10573` (línea 4) |
| Preámbulo (tags antes del 1er `#EXTINF`) | 187 líneas + 1 en blanco; 1er `#EXTINF` en línea **189** | `reconciliation.preamble_lines_before_first_EXTINF` |
| Tags distintos (nivel superior) | **819** | `global_tag_counts` |

**Single-URL-per-channel: CUMPLE al 100 %.** Hay exactamente 10.573 líneas no-tag para 10.573 canales →
**1,000 URL por canal**, ninguna en preámbulo. (`meta.non_tag_lines == meta.channels_measured`)

**Uniformidad estructural exacta.** El bloque de canal es una plantilla replicada; cada división da entero:
`570.942/10.573 = 54`, `1.089.019/10.573 = 103`, `1.416.782/10.573 = 134`, `253.752/10.573 = 24`,
`200.887/10.573 = 19`, `179.741/10.573 = 17`. Ningún canal tiene un conjunto de tags distinto a otro:
la variación es **por perfil** (P1/P3/P4), no por estructura.

---

## 1. Contraste con los hechos del capitán (verificados / refutados)

| Afirmación recibida | Veredicto | Evidencia |
|---|---|---|
| `#EXTHTTP` = 10.573 (1 por canal) | **CONFIRMADO, exacto** | `rg -c '^\#EXTHTTP:'` → `10573`; `exthttp.channels_with_exthttp = 10573`, `channels_without = 0` |
| `#KODIPROP` = 1.089.025 | **CONFIRMADO, exacto** | `rg -c` → `1089025` |
| `#EXTVLCOPT` = 1.416.786 | **CONFIRMADO, exacto** | `rg -c` → `1416786` |
| `#EXT-X-APE-` = 6.498.710 | **CONFIRMADO, exacto** | `ape_family.total_occurrences = 6498710` (688 tags distintos) |
| Primer canal: 256 `#EXTVLCOPT` | **REFUTADO** — son **134** por canal, en los 10.573 | `1.416.782/10.573 = 134,000` exacto |
| Primer canal: 189 `#KODIPROP` | **REFUTADO** — son **103** por canal, en los 10.573 | `1.089.019/10.573 = 103,000` exacto |
| Primer canal: 108 `#EXTATTRFROMURL` | **REFUTADO** — son **54** por canal, en los 10.573 | `rg -c '^\#EXTATTRFROMURL'` → `570942 = 54 × 10573` |
| Corpus: "EXTHTTP con 200 campos" | **CONFIRMADO como máximo/mediana**, no como mínimo | campos/objeto: min **199**, mediana **200**, media 199,55 |
| Corpus: "8.124 bytes" | **CONFIRMADO como máximo**, no como típico | bytes/objeto: min 7.197, mediana 7.849, media 7.789,99, **max 8.124** |
| Corpus: "26 campos en overflow" | **PARCIAL**: 26 es el **mínimo** del objeto de overflow, no el total | overflow: min **26**, mediana **33**, media 36,3, **max 65** |
| Corpus: "0 EXT-X-MAP" | **CONFIRMADO** | `rg -c '^\#EXT-X-MAP'` → sin coincidencias; `ext_x_map_count = 0` |

Las tres refutaciones de conteo por canal son de método, no de sustancia: 189/256/108 probablemente se
contaron sobre un tramo de líneas fijo, no sobre el bloque delimitado por `#EXTINF`.

---

## 2. `#EXTHTTP` — 10.573 objetos JSON

### 2.1 Cobertura y validez

| Métrica | Valor |
|---|---|
| Ocurrencias | 10.573 |
| Canales con `#EXTHTTP` | **10.573 / 10.573 (100 %)** |
| Canales sin `#EXTHTTP` | 0 |
| **JSON válido (`JSON.parse`)** | **10.573** |
| **JSON inválido** | **0** |
| JSON válido pero no-objeto | 0 |
| Nombres de campo distintos (objeto principal) | **250** |
| Nombres distintos (principal ∪ overflow) | **276** |

Se validaron los **10.573** objetos, no una muestra: el censo es total, no estratificado. Invariante
"`#EXTHTTP` debe ser JSON válido" **se cumple sin una sola excepción**.

### 2.2 El límite real es de CAMPOS, no de BYTES

Este es el hallazgo estructural de la sección:

| Métrica | Valor |
|---|---|
| Campos por objeto | min **199**, max **200**, mediana **200**, media 199,55 |
| Bytes por objeto | min 7.197, max **8.124**, mediana 7.849, media 7.789,99 |
| Objetos > 8.192 bytes | **0** |

El tope de 8.192 bytes **nunca se alcanza** (máximo medido 8.124, margen de 68 bytes). El recorte lo produce
el **cap de 200 campos**: cada objeto se corta en 200 y el resto se desplaza a `#EXT-X-APE-OVERFLOW-HEADERS`.
Prueba aritmética de que el corte es por campos y es determinista, campo por campo:
`9.103 + 1.470 = 10.573`, `7.990 + 2.583 = 10.573`, `4.775 + 5.798 = 10.573`, `16 + 10.557 = 10.573`.
Cada campo aparece **o** en el objeto principal **o** en el overflow, nunca en ambos y nunca en ninguno.

### 2.3 Overflow (`#EXT-X-APE-OVERFLOW-HEADERS`, base64→JSON)

| Métrica | Valor |
|---|---|
| Ocurrencias | 10.573 (una por canal) |
| Base64 decodificado → JSON válido | **10.573** |
| JSON inválido | **0** |
| Campos por objeto | min **26**, max **65**, mediana 33, media 36,3 |
| Bytes del JSON decodificado | min 1.102, max 2.902, media 1.671,08 |
| Campos totales por canal (principal + overflow) | min **226**, max **265**, mediana **233**, media 235,85 |

Corrección al corpus: "26 campos en overflow" es el mínimo. El canal típico arrastra **33**, y el máximo
llega a **65**. El objeto `#EXTHTTP` no contiene 200 de 250 campos "por diseño estético": contiene los 200
primeros y **el resto vive en un tag aparte que ningún reproductor lee**.

### 2.4 Campos de `#EXTHTTP` — censo completo

Frecuencia por nombre (censo total, `exthttp.field_frequency`). Se agrupan por bloque funcional; la columna
`n` es el número de canales en que el campo aparece **en el objeto principal**.

| Bloque | Campos | n típico |
|---|---|---|
| Estándar HTTP | `User-Agent`, `Accept`, `Accept-Encoding`, `Accept-Language`, `Accept-CH`, `Referer`, `Origin`, `Pragma`, `Cache-Control`, `DNT`, `Sec-GPC` | 10.573 |
| Identidad APE | `X-APE-Profile`, `X-APE-Tier`, `X-APE-Channel-Id`¹ | 10.573 |
| Sesión / traza | `X-Session-Id`, `X-Request-Id`, `X-Playback-Session-Id`, `X-Client-Timestamp`, `X-Device-Id` | 10.573 |
| Códec / HDR (declarativo) | `X-Codec-Full`, `X-Codec-Support`, `X-Video-Codecs`, `X-Video-Range`, `X-HDR-*` (24 campos), `X-Dolby-Vision-*` (6), `X-HDR10-Plus-*` (7), `X-HLG-*` (4), `X-Color-Volume-*` (6), `X-Luma-Precision`, `X-CICP`² | 10.573 |
| LCEVC / VVC / EVC | `X-LCEVC-*` (15), `X-VVC-*` (3), `X-EVC-*` (2) | 10.573 |
| CMAF / fMP4 (declarativo) | `X-CMAF-*` (5), `X-FMP4-*` (4) | 10.573 |
| Buffer / ABR / red | `X-Buffer-*` (7), `X-Min/Max-Bitrate`, `X-Expected/Average-Bitrate`, `X-Concurrent-Downloads`, `X-Prefetch-*`, `X-Parallel-Segments`, `X-Network-Caching`, `X-Live-Caching`, `X-Network-Type` | 10.573 |
| QoE / player | `CMCD-*` (4), `X-QoE-*` (6), `X-HLSjs-*` (2), `X-Shaka-Version`, `X-ExoPlayer-*` (2), `X-FPS`, `X-Player-Type`, `X-OTT-Navigator-Version` | 4.775 – 7.990 |
| Resiliencia | `X-Retry-*`, `X-Reconnect-*`, `X-Read-Timeout-Ms`, `X-Connection-Timeout-Ms`, `X-Failover-Enabled`, `X-Seamless-Failover` | 1.113 – 10.573 |
| **Bloque `X-APE-*` extendido** | 30 campos (`X-APE-Codec-Video`, `X-APE-Codec-Family`, `X-APE-Codec-Level`, `X-APE-Codec-Profile`, `X-APE-Codec-Chain`, `X-APE-Bit-Depth`, `X-APE-Chroma`, `X-APE-Color-Space`, `X-APE-HDR-Mode`, `X-APE-HDR-Transfer`, `X-APE-HDR-Range`, `X-APE-HDR-Primaries`, `X-APE-HDR-Matrix`, `X-APE-MaxCLL`, `X-APE-MaxFALL`, `X-APE-Bandwidth`, `X-APE-Avg-Bandwidth`, `X-APE-Resolution-Q`, `X-APE-Framerate-Q`, `X-APE-Tone-Mapping`, `X-APE-Auth-Method`, `X-APE-Auth-Retry`, `X-APE-Fallback-*` (5), `X-APE-Follow-Redirects`, `X-APE-Max-Redirects` …) | **1.470** |

¹ `X-APE-Channel-Id` aparece 1.470 veces: **solo el 13,9 % de los canales lleva el identificador de canal**
dentro de `#EXTHTTP`. El resto lo lleva únicamente en `#EXTINF tvg-id` y en `EXTATTRFROMURL`.
² El bloque `X-APE-*` extendido (30 campos) **solo se emite en 1.470 canales (13,9 %)**. En los otros 9.103
**no aparece ni en el objeto principal ni en el overflow** — no es una víctima del corte de 200, es una
emisión condicional. Prueba de complementariedad exacta: `X-PEVCE-Live-Caching` → 9.103 en principal +
1.470 en overflow = 10.573; `X-APE-Codec-Video` → 1.470 en principal + **0** en overflow. Existen **dos
órdenes de campos** y el bloque `X-APE-*` sobrevive al corte solo en el orden de los 1.470.

### 2.5 Headers tóxicos — 0 de 0

Doctrina del repo (`CLAUDE.md` → "Headers PROHIBIDOS", `AGENTS.md` → "9 headers tóxicos EXTHTTP").
Se buscó coincidencia **exacta de nombre** (case-insensitive) en el objeto principal **y** en el overflow:

| Header tóxico | Ocurrencias (principal) | Ocurrencias (overflow) | Canales afectados |
|---|---|---|---|
| `Range` | 0 | 0 | 0 |
| `If-None-Match` | 0 | 0 | 0 |
| `If-Modified-Since` | 0 | 0 | 0 |
| `TE` | 0 | 0 | 0 |
| `Priority` | 0 | 0 | 0 |
| `Upgrade-Insecure-Requests` | 0 | 0 | 0 |

**Canales con al menos un header tóxico: 0.** La invariante "0 headers tóxicos" se sostiene en las 10.573
unidades, incluida la parte que el corpus previo no había auditado (el overflow).

### 2.6 Lookalikes: `X-Priority` y `X-QoS-Priority` — NO son el header tóxico

| Nombre | Ocurrencias | Dónde | Veredicto |
|---|---|---|---|
| `X-Priority` | **10.573** (100 % de canales) | overflow | Nombre **distinto** de `Priority`. HTTP trata los nombres como tokens completos; `X-Priority` ≠ `Priority`. **No es el header tóxico.** |
| `X-QoS-Priority` | **10.573** (100 %) | overflow | Ídem. |

Se reportan porque son el único par de nombres que un auditor por substring marcaría como falso positivo.
Mi primer matcher los confundió con `X-Bitrate-Ladder` y `X-Low-Latency-Mode` (substring `te` de `TE`) y con
`X-Video-Range` (substring `range` de `Range`); se corrigió a coincidencia por sufijo/prefijo con allowlist
de compuestos benignos. Queda declarado el método, no solo el resultado.

Riesgo residual honesto: `X-Priority` **sí** colisiona semánticamente con el header HTTP `Priority` si un
intermediario pliega el prefijo `X-` o si un WAF normaliza nombres. No puedo probar que eso ocurra en este
proveedor; se registra como riesgo, no como hallazgo.

### 2.7 Credenciales y tokens

| Comprobación | Resultado |
|---|---|
| Nombres de header tipo credencial (`Authorization`, `Cookie`, `X-APE-Playback-Token`, `X-Api-Key`, `X-Auth-Token`, `X-Access-Token`, `Proxy-Authorization`) | **0** |
| Canales con valor que parezca `Bearer`/`Basic`/JWT | **0** |
| `?://user:pass@` en cualquier valor emitido | 0 (control post-redacción) |
| `eyJhbGciOi` (JWT header) en el JSON entregable | 0 |

`X-Session-Id`, `X-Request-Id` y `X-Playback-Session-Id` son identificadores opacos por reproducción, no
secretos de acceso: no autentican nada por sí solos y se emiten redactados en el JSON.
**`#EXTHTTP` no transporta credenciales en esta lista.**

---

## 3. `#KODIPROP` — 1.089.025 líneas, 103 propiedades

### 3.1 Inventario

| Métrica | Valor |
|---|---|
| Ocurrencias totales | **1.089.025** |
| En bloque de canal | 1.089.019 |
| En preámbulo | 6 |
| Propiedades distintas | **103** |
| Cobertura por propiedad | **las 103 aparecen exactamente 10.573 veces (100 % de canales)** |

`103 × 10.573 = 1.089.019` exacto ⇒ **cada canal emite el mismo set completo de 103 propiedades**.
No hay un solo canal con una propiedad de menos.

### 3.2 Familias

| Familia | Ocurrencias |
|---|---|
| `inputstream.adaptive.*` | 983.289 |
| `inputstream.hlsjs.*` | 95.157 |
| `inputstream` (selector de módulo, sin sufijo) | 10.573 |

`inputstream=inputstream.adaptive` aparece 10.573 veces ⇒ **Kodi queda forzado al módulo `adaptive` en el
100 % de los canales**; las 9 propiedades `inputstream.hlsjs.*` se emiten para un módulo que **no** es el
seleccionado. Son configuración muerta en este corpus.

### 3.3 Propiedades que declaran códec / HDR / DRM

**Códec** — 1 propiedad: `inputstream.adaptive.video_codec` = `hevc,av1,vp9,h264` en **10.573/10.573**.
Es una **lista de familias**, no una cadena RFC 6381: no contiene `hvc1.` ni `hev1.`.

**HDR** — 15 propiedades, todas 10.573: `hdr_mode`, `hdr_nits`, `hdr_bt2020`, `hdr_hlg`, `hdr_hdr10`,
`hdr_hdr10plus`, `hdr_dolbyvision`, `hdr_dolbyvision_profile`, `hdr_color_conversion`,
`preferred_video_resolution`, `max_resolution`, `max_framerate`, `video_vrr`, `video_vrr_min`,
`video_vrr_max`.
Valores medidos: `hdr_mode` = `SDR` **9.765 (92,4 %)** / `PQ` **808 (7,6 %)**; `hdr_dolbyvision_profile` = `8`
en el 100 %; `max_resolution` = **`1920x1080` en el 100 %** (ver §8, contradicción con `STREAM-INF`).

**DRM** — 8 propiedades, todas 10.573: `drm_type=widevine`, `drm_level=L1`, `drm_security_level=L1`,
`drm_robustness_level=HW_SECURE_ALL`, `drm_license_timeout`, `drm_offline_license`,
`drm_persistent_license`, `drm_key_request_properties`, `drm_server_certificate`.
`drm_key_request_properties` y `drm_server_certificate` están **vacíos en los 10.573 canales** ⇒ no hay URL
de licencia ni certificado, es decir **cero credenciales DRM** (bien) y también **cero configuración DRM
utilizable** (el DRM es declarativo). Contexto: la lista contiene **1** `#EXT-X-KEY` en todo el archivo
(preámbulo), para 10.573 canales.

### 3.4 GOLDEN RULE `hvc1` / `hev1` — 0 violaciones, y el mecanismo

Regla del repo: `hvc1.*` **solo** en `#EXT-X-STREAM-INF CODECS=`; `hev1.*` **solo** en `#KODIPROP`/`#EXTVLCOPT`;
nunca cruzados. Medición por sumidero (canales que emiten cada forma):

| Sumidero | canales con `hvc1.*` | canales con `hev1.*` |
|---|---|---|
| `#EXT-X-STREAM-INF` CODECS | **10.573** | **0** |
| `#KODIPROP` | **0** | **0** |
| `#EXTVLCOPT` | **0** | **0** |
| `#EXT-X-APE-CODEC-REAL` / `-PREFERRED` | 10.528 | **0** |

**Violaciones: 0.** `violation_counts = {}`, `violations_sample = []`.

Pero el "0" tiene una causa que hay que decir, porque cambia lo que significa:
**`#KODIPROP` y `#EXTVLCOPT` no emiten jamás una cadena de códec RFC 6381.** `KODIPROP` usa
`video_codec=hevc,av1,vp9,h264` (familias) y `EXTVLCOPT` usa `codec=h264|hevc,h264|hevc,av1,h264` (familias).
Con esos valores la forma cruzada `hev1.` **es inexpresable**: la regla no se cumple por disciplina de
emisión, se cumple porque el lado que debía llevar `hev1` no lleva ningún codec string. Un futuro cambio que
ponga una cadena RFC 6381 en `KODIPROP` no tendría red de seguridad en esta lista.

---

## 4. `#EXTVLCOPT` — 1.416.786 líneas, 134 opciones (insumo obligatorio para §8)

| Métrica | Valor |
|---|---|
| Total | **1.416.786** |
| En bloque de canal | 1.416.782 |
| En preámbulo | 4 |
| Opciones distintas | **134** |
| Cobertura | las 134 aparecen exactamente 10.573 veces (100 %) |

`134 × 10.573 = 1.416.782` exacto. Agrupación por familia:

| Familia | Opciones | Ocurrencias |
|---|---|---|
| `adaptive-reload-use-*` | 23 | 243.179 |
| `video-*` | 20 | 211.460 |
| `adaptive-*` (resto) | 19 | 200.887 |
| `ts-*` | 15 | 158.595 |
| `hls-*` | 11 | 116.303 |
| `avcodec-*` | 9 | 95.157 |
| `audio-*` | 8 | 84.584 |
| `http-*` | 7 | 74.011 |
| `network-*` | 7 | 74.011 |
| `sub-*` | 6 | 63.438 |
| `sout-*` | 2 | 21.146 |
| otros | 7 | 74.011 |

**Fail-honest:** no verifiqué las 134 opciones contra la tabla real de opciones de VLC. El subconjunto
`adaptive-reload-use-*` (23 opciones, 243.179 ocurrencias = 17,2 % de todas las `#EXTVLCOPT`) tiene forma de
opciones que VLC no documenta (`adaptive-reload-use-0rtt`, `-use-quic`, `-use-webtransport`, `-use-webrtc`…).
**Se registra como sospecha no probada**, no como hallazgo: probarlo exige ejecutar VLC y leer su log.

Valores que importan para §8 (100 % de canales): `codec` = `h264` (7.457) / `hevc,h264` (2.308) /
`hevc,av1,h264` (808); `video-hdr=false` (10.573); `video-hdr-mode=SDR` (10.573);
`adaptive-maxwidth=7680`, `adaptive-maxheight=4320` (10.573).

---

## 5. `#EXTATTRFROMURL` — 570.942 líneas, 54 atributos

| Métrica | Valor |
|---|---|
| Total | **570.942** |
| Canales que lo usan | **10.573 / 10.573 (100 %)** |
| Por canal | **54,000 exacto** |
| Atributos distintos | **54** (cada uno 10.573 veces) |

**Qué rellena:** el tag no apunta a un atributo de `#EXTINF`; emite pares `X-APE-*=valor` que **declaran
metadatos del canal derivados del propio stream/URL**. Los 54 atributos y su patrón de valor medido
(`extattrfromurl.attribute_value_patterns`):

| Atributo | Patrón | Cardinalidad / muestra (redactada) |
|---|---|---|
| `X-APE-TIMESTAMP` | `iso8601_timestamp` | 1 valor por canal (derivado del instante de exportación) |
| `X-APE-PROFILE` | enum | `P4` / `P3` / `P1` |
| `X-APE-CODEC` | `rfc6381_codec` | `hvc1.2.4.L93.B0` / `L123.B0` / `L153.B0` |
| `X-APE-RESOLUTION` | `resolution_WxH` | por perfil |
| `X-APE-FRAMERATE` | `integer` | `30` / `60` |
| `X-APE-BANDWIDTH` | `integer` | `8000000` / `19800000` |
| `X-APE-HDR-MODE` | enum | `SDR` / … |
| `X-APE-HDR-NITS` | `integer` | |
| `X-APE-LCEVC` | `integer` | `4` |
| `X-APE-AI-SR` | enum | `realesrgan` |
| `X-APE-AI-FI` | enum | `rife_v4` |
| `X-APE-DRM` | enum | `widevine_L1` |
| `X-APE-DRM-HDCP` | `version_or_decimal` | `2.2` |
| `X-APE-SPOOF-UA` | `user_agent` | UA completo |
| `X-APE-SPOOF-IP` | `ipv4` | IP de CDN |
| `X-APE-CDN-IP` | **`ipv4`** | 600 valores distintos (`52.91.240.122`, `142.250.184.58`, `104.87.72.136`…) |
| `X-APE-EVASION` | enum | `PHANTOM_HYDRA_V5` |
| `X-APE-IDEMPOTENCIA` | enum | `OMEGA_STATIC_V5` |
| `X-APE-POLIMORFISMO` | enum | `1PCT_UNIQUENESS` |
| `X-APE-SID` | `hex_id` | **10.573 valores distintos** (1 por canal) |
| `X-APE-NONCE` | `enum_token` | **10.573 distintos** (1 por canal) |
| `X-APE-SESSION-ID` | `opaque_id_triple` | 10.573 distintos — **único identificador o secret**; se emite redactado |
| `X-APE-REQUEST-ID` | `opaque_id_triple` | 10.573 distintos — redactado |
| `X-APE-LIST-HASH` | `hex_id` | |
| `X-APE-JWT` | `boolean` | `true` (**bandera**, no un token: no hay JWT embebido) |
| `X-APE-ANABOLIC-HEADERS` | `integer` | `100` |
| `X-APE-CORTEX` | enum | `IPTV_SUPPORT_CORTEX_V_OMEGA` |
| `X-APE-CAPACITY-OVERDRIVE` | enum | `40MB` / `60MB` / `160MB` |
| `X-APE-UA-PHANTOM` | `boolean` | `true` |
| `X-APE-VMAF` | `integer` | `88` |
| `X-APE-SCORECARD` / `X-APE-TELCHEMY` | `boolean` | `true` |
| `X-APE-CMAF` | enum | **`fmp4`** (ver §8: contradicho por `#EXT-X-CMAF-CONTAINER: mpegts`) |
| `X-APE-INIT-SEGMENT` | enum | **`init.mp4`** (no existe: `#EXT-X-MAP` = 0) |
| `X-APE-MANIFEST-TYPE` | enum | `hls` |
| `X-APE-MANIFEST-VERSION` | `integer` | `7` (el de la lista es `#EXT-X-VERSION:9`) |
| `X-APE-PLAYLIST-TYPE` | enum | `EVENT` |
| `X-APE-TARGET-DURATION` | `integer` | `2` |
| `X-APE-LIVE-DELAY` / `-HOLD-BACK` / `-PART-HOLD-BACK` | `integer` | `0` |
| `X-APE-CHUNK-DURATION` / `-PART-TARGET` | `version_or_decimal` | `0.5` |
| `X-APE-DOLBY-VISION` | enum | `P8L6` |
| `X-APE-ATMOS` | `version_or_decimal` | `7.1.4` |
| `X-APE-DTS-X` | `boolean` | `true` |
| `X-APE-TRUEHD` | `version_or_decimal` | `7.1` |
| `X-APE-VRR` | enum | `24-120Hz` |
| `X-APE-SPORT-MODE` / `-BOOST` | `boolean` | `true` |
| `X-APE-QUANTUM-PIXEL` | enum | `12BIT` |
| `X-APE-BUFFER` / `-MB` / `-SEGMENTS` | `integer` | `6000`/`8000`/`15000`, `40`/`60`/`160`, `15`/`16`/`12` |

Los 4 identificadores por canal (`SID`, `NONCE`, `SESSION-ID`, `REQUEST-ID`) son **efímeros de descarga**
(cambian en cada export: `SID=c8e0e7080a71bc00`, `NONCE=8mfaohz5771d` en el primer canal). No son
credenciales: no autentican acceso. Se emiten redactados por prudencia.

---

## 6. Familias `#EXT-X-CMAF-*`, `#EXT-X-VNOVA-LCEVC-*`, `#EXT-X-PHANTOM-HYDRA-*`

### 6.0 `#EXT-X-MAP` = 0 — **no hay CMAF real**

```
PS> rg -c '^\#EXT-X-MAP' <lista>      → sin coincidencias (0)
ext_x_map_count = 0
```

Sin `#EXT-X-MAP` no hay segmento de inicialización fMP4 declarado, y sin él **no hay CMAF reproducible**:
un cliente HLS no tiene `moov` que cargar. Consecuencias medidas y verificables:

- `#EXT-X-CMAF-INIT-SEGMENT: BYTERANGE="1024@0"` (10.573 canales) declara un byte-range de init **sin URI
  y sin `#EXT-X-MAP`**: es una declaración huérfana.
- `X-APE-INIT-SEGMENT=init.mp4` (`#EXTATTRFROMURL`, 10.573) referencia un archivo que ningún tag define.
- **`#EXT-X-CMAF-CONTAINER: mpegts` en los 10.573 canales** mientras `X-APE-CMAF=fmp4` dice lo contrario en
  esos mismos canales.

**Declaración formal: la familia CMAF de esta lista es declarativa, no funcional.** No hay un solo byte de
fMP4/CMAF identificable desde el manifiesto. Cumple la invariante del repo "0 declaraciones CMAF falsas"
solo en el sentido de que `#EXT-X-MAP` está ausente (que es la condición que el repo exige para no marcarlo
`verified=true`); la capa de tags, en cambio, **sí afirma CMAF**.

### 6.1 `#EXT-X-CMAF-*` — 24 tags, 253.752 ocurrencias (= 24 × 10.573)

| Tag | Valor(es) medido(s) | Canales | Clasificación |
|---|---|---|---|
| `-VERSION` | `7` | 10.573 | **inerte** (contradice `#EXT-X-VERSION:9`) |
| `-CONTAINER` | **`mpegts`** | 10.573 | **inerte** (contradice `X-APE-CMAF=fmp4`) |
| `-INIT-SEGMENT` | `BYTERANGE="1024@0"` | 10.573 | **inerte huérfano** (no hay `#EXT-X-MAP`) |
| `-CHUNK-DURATION` | `0.5` | 10.573 | **inerte** (contradice `PART-TARGET=1.0` real) |
| `-PART-TARGET` | `0.5` | 10.573 | **inerte** |
| `-PART-HOLD-BACK` | `1.5` | 10.573 | **inerte** (contradice 1.0 de `#EXT-X-SERVER-CONTROL` y 6.0 de `-LATENCY`) |
| `-LATENCY` | `TARGET=4.0,HOLD-BACK=12.0,PART-HOLD-BACK=6.0` | 10.573 | **inerte** (3 valores de PART-HOLD-BACK en la misma lista) |
| `-HDR` | `SDR,NITS=100` (7.457) / `SDR,NITS=400` (2.308) / `PQ,NITS=1500` (808) | 10.573 | **inerte** |
| `-HDR-METADATA` | `MDCV=true,CLLI=true` | 10.573 | **inerte** (no hay SEI ni caja verificable) |
| `-LCEVC` | `PHASE=4,ENABLED=true` | 10.573 | **inerte** |
| `-AI-SR` | `MODEL=realesrgan,SCALE=4,ENABLED=true` | 10.573 | **inerte** |
| `-AI-FI` | `MODEL=rife_v4,FPS=30` (7.457) / `FPS=60` (3.116) | 10.573 | **inerte** |
| `-VRR` | `MIN=24,MAX=120,ENABLED=true` | 10.573 | **inerte** |
| `-DOLBY-VISION` | `PROFILE=8,LEVEL=6,ENABLED=true` | 10.573 | **inerte** |
| `-ATMOS` | **`ENABLED=false`**,`CHANNELS=7.1.4` | 10.573 | **inerte** (contradice `X-APE-ATMOS=7.1.4`) |
| `-DTS` | **`ENABLED=false`**,`TYPE=DTS:X` | 10.573 | **inerte** (contradice `X-APE-DTS-X=true`) |
| `-TRUEHD` | **`ENABLED=false`**,`CHANNELS=7.1` | 10.573 | **inerte** (contradice `X-APE-TRUEHD=7.1`) |
| `-CODEC-FALLBACK` | `hevc,av1,vp9,h264` | 10.573 | **inerte** |
| `-AUDIO-FALLBACK` | `mp4a.40.2,ac-3` | 10.573 | **inerte** |
| `-BUFFER` | `TARGET=6000,MAX=41943040` (7.457) / `8000/62914560` (2.308) / `15000/167772160` (808) | 10.573 | **inerte** |
| `-NETWORK` | `TIMEOUT=60000,RECONNECT=true,COUNT=99` | 10.573 | **inerte** |
| `-SESSION` | `SID=…,NONCE=…` | 10.573 | **inerte** · 10.573 valores distintos (1/canal) |
| `-POLIMORFISMO` | `NONCE=…,SID=…,HASH=…` | 10.573 | **inerte** · 10.573 distintos |
| `-IDEMPOTENCIA` | `SID=…,SEED=OMEGA_STATIC_V5` | 10.573 | **inerte** · 10.572 distintos |

**Ninguno de los 24 es un tag definido por RFC 8216.** Por §6.3.1 un cliente HLS conforme **debe
ignorarlos**. No encontré ninguno que un reproductor pueda consumir por otra vía: están en el manifiesto
como comentarios con nombre. **Clasificación: metadata inerte, 24/24.**

### 6.2 `#EXT-X-VNOVA-LCEVC-*` — 19 tags, 200.887 ocurrencias (= 19 × 10.573)

| Tag | Valor medido | Clasificación |
|---|---|---|
| `-VERSION` | `4.0` | inerte |
| `-CODEC` | `HEVC,AVC` | inerte |
| `-RESOLUTION` | `1280x720` (7.457) / `1920x1080` (2.308) / `3840x2160` (808) | inerte |
| `-BASE-RESOLUTION` | **`1920x1080`** (10.573) | inerte (contradice `-RESOLUTION` y `STREAM-INF` 3840x2160) |
| `-ENHANCEMENT-RESOLUTION` | `1280x720` / `1920x1080` / `3840x2160` | inerte |
| `-BASE-FPS` / `-ENHANCEMENT-FPS` | `30` (7.457) / `60` (3.116) | inerte |
| `-BASE-CODEC` | `HEVC` | inerte |
| `-ENHANCEMENT-CODEC` | `LCEVC` | inerte |
| `-BASE-BANDWIDTH` | `7200000` (9.765) / `17820000` (808) | inerte |
| `-ENHANCEMENT-BANDWIDTH` | `800000` (9.765) / `1980000` (808) | inerte |
| `-BANDWIDTH-SAVING` | `50%` | inerte |
| `-QUALITY-BOOST` | `true` | inerte |
| `-LATENCY` | `0ms` | inerte |
| `-BASE-LAYER` / `-ENHANCEMENT-LAYER` / `-FALLBACK` | `ENABLED=true` | inerte |
| `-FALLBACK-RESOLUTION` | `1920x1080` | inerte |
| `-SID` | 10.572 valores distintos | inerte |

LCEVC (MPEG-5 Part 2) **requiere una capa de mejora en el bitstream**; un tag no la transporta. `0ms` de
latencia y `50%` de ahorro son afirmaciones sin artefacto en la lista. **Inerte, 19/19.** No afirmo que el
proveedor no sirva LCEVC en el segmento real — no lo medí —, solo que **desde el manifiesto es invisible**.

### 6.3 `#EXT-X-PHANTOM-HYDRA-*` — 17 tags, 179.741 ocurrencias (= 17 × 10.573)

| Tag | Valor medido | Clasificación |
|---|---|---|
| `-UA-TIER1` / `-TIER2` / `-TIER3` | UA rotativos (180 valores distintos cada uno) | inerte |
| `-UA-VLC` | 8 valores distintos | inerte |
| `-UA-OTT` | 6 valores distintos | inerte |
| `-UA-KODI` / `-UA-TIVIMATE` / `-UA-EXOPLAYER` / `-UA-SAFARI` | 180 valores distintos cada uno | inerte |
| `-IP` | **600 valores distintos** (`52.91.240.122`, `142.250.184.58`, `104.87.72.136`…) | inerte |
| `-DNS-DOH` | `cloudflare=1.1.1.1,google=8.8.8.8` | inerte |
| `-SNI` | `cdn.akamaized.net` | inerte |
| `-DPI-BYPASS` / `-SANDVINE-BYPASS` / `-GEO-PHANTOM` | `true` | inerte |
| `-SID` | 10.572 distintos | inerte |
| `-NONCE` | **10.573 distintos** (1/canal) | inerte |

**Crítico y honesto:** `-DPI-BYPASS: true`, `-SANDVINE-BYPASS: true` y `-DNS-DOH` **no ejecutan nada**.
Son tags HLS; un reproductor conforme los ignora (RFC 8216 §6.3.1) y ninguno de estos clientes cablea
evasión de DPI a un tag de manifiesto. **No hay efecto medido ni mecanismo por el cual pueda haberlo** desde
la lista. Presentarlos como "evasión activa" sería vender humo. **Inerte, 17/17.**

Además: `-IP` con 600 valores distintos y `-SNI: cdn.akamaized.net` son valores sintéticos de un pool; no
verifiqué correspondencia con el host real de cada canal (eso es de la tarea de hosts/URLs).

### 6.4 ¿Hay algún tag de familia con efecto esperado?

| Criterio | Resultado |
|---|---|
| Tags de familia definidos por RFC 8216 | **0 de 60** |
| Tags de familia con URI que un cliente pueda pedir | **0** |
| Tags de familia que cambien estado en un cliente conforme | **0 probado** |
| Tags de familia que contradicen un tag real del mismo canal | **9** (ver §8) |

**Conclusión de la sección:** las tres familias son **metadata inerte al 100 %** (60 tags distintos,
634.380 ocurrencias). Su valor es de auditoría/trazabilidad interna, no de reproducción. La única familia con
efecto real sobre un reproductor en esta lista es la capa HLS estándar (`#EXT-X-SERVER-CONTROL`,
`#EXT-X-PART-INF`, `#EXT-X-STREAM-INF`) y la capa `#EXTVLCOPT`/`#KODIPROP`, que sí son consumidas por VLC y
Kodi respectivamente.

---

## 7. Encabezados de variante

| Tag | Total | Por canal (min/max/mediana) | Canales con 0 | Canales con >1 | `URI=` indebido |
|---|---|---|---|---|---|
| `#EXT-X-STREAM-INF` | **10.573** | 1 / 1 / 1 | **0** | **0** | **0** |
| `#EXT-X-I-FRAME-STREAM-INF` | **10.573** | 1 / 1 / 1 | 0 | 0 | **0** |
| `#EXT-X-MEDIA` | **0** | 0 / 0 / 0 | 10.573 | 0 | **0** (no existe) |
| `#EXT-X-DATERANGE` | **10.574** | 1 / 1 / 1 | 0 | 0 | — (+1 en preámbulo) |
| `#EXT-X-MAP` | **0** | 0 / 0 / 0 | 10.573 | 0 | — |

**Doctrina Single-URL-per-channel: CUMPLE en los tres tags.**
- `#EXT-X-MEDIA`: **no se emite nunca** ⇒ no puede haber `URI=`.
- `#EXT-X-I-FRAME-STREAM-INF`: 1 por canal, **0 con `URI=`**.
- `#EXT-X-STREAM-INF`: **exactamente 1 por canal en el 100 % de los canales**, 0 canales con más de uno,
  0 con ninguno, **0 con `URI=`**.

**Atributos de `#EXT-X-STREAM-INF` (constantes medidas):**

| Atributo | Valores | Canales |
|---|---|---|
| `RESOLUTION` | `3840x2160` | **10.573 (100 %)** |
| `CODECS` | `hvc1.2.4.L153.B0,mp4a.40.2` | **10.573 (100 %)** — un único valor en toda la lista |
| `VIDEO-RANGE` | `PQ` | **10.573 (100 %)** |
| `HDCP-LEVEL` | `TYPE-1` | 10.528 (**45 canales sin el atributo**) |
| `FRAME-RATE` | `30.000` (8.651) / `60.000` (1.922) | 10.573 |
| `BANDWIDTH` | `9000000` (7.963) / `12000000` (1.757) / `28000000` (853) | 10.573 |
| `STABLE-VARIANT-ID` (sufijo de perfil) | `P4` (7.412) / `P3` (2.308) / `P1` (808) | 10.573 |

`#EXT-X-I-FRAME-STREAM-INF` CODECS: `hvc1.2.4.L93.B0` (7.457) / `hvc1.2.4.L123.B0` (2.308) /
`hvc1.2.4.L153.B0` (808). **Un tercer nivel de H.265 distinto del de `STREAM-INF` para el mismo canal.**

**Observación RFC 8216 §4.4.6.6:** el atributo `URI` es **obligatorio** en `#EXT-X-I-FRAME-STREAM-INF`. Los
10.573 tags lo omiten. Es la consecuencia inevitable de la doctrina Single-URL-per-channel, que prohíbe
`URI=` en ese tag. Un cliente conforme puede descartar el tag (o, siendo estricto, la playlist); un cliente
permisivo lo ignora. **No puedo probar que rompa reproducción** — no ejecuté reproductores —, pero la
no-conformidad es un hecho del manifiesto, no una opinión.

---

## 8. Matriz de coherencia entre capas (el hallazgo central de esta tarea)

El mismo canal declara cosas distintas según qué capa se lea. Todo lo siguiente está medido sobre
10.573 canales:

| Capa | Resolución | Códec declarado | Rango HDR | Límite de buffer |
|---|---|---|---|---|
| `#EXT-X-STREAM-INF` | **3840x2160** (100 %) | **hvc1.2.4.L153.B0** (100 %) | **PQ** (100 %) | `BANDWIDTH` 9/12/28 Mbps |
| `#EXT-X-I-FRAME-STREAM-INF` | — | `hvc1.2.4.L93/L123/L153` | — | `200000` |
| `#EXTHTTP` (`X-APE-*`) | `X-APE-Resolution-Q` | `hvc1.2.4.L150.B0` (1.296) / `L123.B0` (174) | `SDR` (1.470) | `X-Buffer-*` |
| `#KODIPROP` | **`1920x1080`** (100 %) | `hevc,av1,vp9,h264` (100 %) | **`SDR`** 9.765 / `PQ` 808 | `max_buffer_duration` |
| `#EXTVLCOPT` | `adaptive-maxwidth=7680` / `maxheight=4320` (100 %) | **`h264`** (7.457) / `hevc,h264` (2.308) / `hevc,av1,h264` (808) | **`video-hdr=false`, `mode=SDR`** (100 %) | `network-caching` |
| `#EXT-X-DATERANGE` | — | — | `SDR` 7.457 / `SDR + HLG fallback` 2.308 / `HDR10 + HLG` 808 | — |
| `#EXTATTRFROMURL` | `X-APE-RESOLUTION` | `X-APE-CODEC = hvc1.2.4.L93/L123/L153` | `X-APE-HDR-MODE` | `X-APE-BUFFER` |
| `#EXT-X-VNOVA-LCEVC-*` | `-BASE-RESOLUTION=1920x1080` (100 %) | — | — | `-BUFFER` |
| `#EXT-X-CMAF-*` | — | `-CONTAINER=mpegts` (100 %) | `-HDR` 3 valores | `-BUFFER` |

Contradicciones **medidas**, con su conteo:

| # | Contradicción | Canales | Lectura honesta |
|---|---|---|---|
| C1 | `STREAM-INF` dice `3840x2160` · `KODIPROP max_resolution` dice `1920x1080` | **10.573 (100 %)** | Doctrinal: `virtual_4k` + `VIDEO-RANGE=PQ` incondicional (decisión LOCKED del propietario, `CLAUDE.md` 2026-06-16 / LEVER B). Es **por diseño**, no un bug. Pero la capa de metadata dice lo contrario de la capa de variante en todos los canales. |
| C2 | `STREAM-INF` dice `PQ` · `EXTVLCOPT video-hdr-mode=SDR` y `video-hdr=false` | **10.573 (100 %)** | Misma doctrina. Efecto en VLC: `video-hdr=false` desactiva la salida HDR del decoder → un canal marcado PQ podría mostrarse en SDR en VLC. **No probado**, requiere ejecutar VLC. |
| C3 | `STREAM-INF CODECS=hvc1` · `EXTVLCOPT codec=h264` | **7.457 (70,5 %)** | VLC recibe la instrucción de demuxear **solo H.264** mientras el manifiesto declara HEVC. Es la contradicción con mayor potencial de efecto real de toda la lista. **No probada** (sin ejecución de VLC). |
| C4 | `STREAM-INF L153` · `I-FRAME-STREAM-INF L93/L123` | **10.573 (100 %)** | Tres niveles HEVC distintos para el mismo canal. `L93`/`L123` **están por debajo** de lo que 3840x2160 exige (Ley Cardinal 1: `L153`=4K@60 techo; L123=4.1 y L93=4.0 no soportan 4K). Inerte porque el tag no tiene `URI` y ningún cliente lo usa para decidir decode, pero la declaración es inconsistente. |
| C5 | `STREAM-INF L153` · `EXTHTTP X-APE-Codec-Video L150/L123` | **1.470 (13,9 %)** | Ídem, en la capa de headers (inerte para el player). |
| C6 | `#EXT-X-CMAF-CONTAINER=mpegts` · `X-APE-CMAF=fmp4` · `#EXT-X-MAP=0` | **10.573 (100 %)** | Triple contradicción sobre el contenedor. Ninguna de las tres es verificable como real: **no hay fMP4 en el manifiesto**. |
| C7 | `#EXT-X-VERSION:9` (real) · `#EXT-X-CMAF-VERSION:7` · `X-APE-MANIFEST-VERSION=7` | 10.573 (100 %) | El tag real es 9. Los otros dos son inertes. |
| C8 | `#EXT-X-PART-INF:PART-TARGET=1.0` (real) · `#EXT-X-CMAF-PART-TARGET:0.5` · `-CHUNK-DURATION:0.5` | 10.573 (100 %) | El real es 1.0. `X-APE-PART-TARGET=0.5`. Inerte. |
| C9 | `#EXT-X-SERVER-CONTROL:PART-HOLD-BACK=1.0` · `#EXT-X-CMAF-PART-HOLD-BACK:1.5` · `-LATENCY: PART-HOLD-BACK=6.0` | 10.573 (100 %) | Tres valores distintos. El único que un cliente lee es 1.0. |
| C10 | `#EXT-X-CMAF-ATMOS/DTS/TRUEHD: ENABLED=false` · `X-APE-ATMOS=7.1.4`, `X-APE-DTS-X=true`, `X-APE-TRUEHD=7.1` | 10.573 (100 %) | La familia CMAF dice "desactivado"; la capa de atributos dice "presente". Inerte en ambos lados. |
| C11 | `#EXT-X-CMAF-INIT-SEGMENT: BYTERANGE="1024@0"` · `X-APE-INIT-SEGMENT=init.mp4` · `#EXT-X-MAP=0` | 10.573 (100 %) | Init segment declarado por dos vías sin que exista el tag que lo define. |
| C12 | `#EXTVLCOPT adaptive-maxwidth=7680/maxheight=4320` · `KODIPROP max_resolution=1920x1080` | 10.573 (100 %) | Dos techos de resolución distintos en dos capas de player distintas para el mismo canal. |
| C13 | `HDCP-LEVEL` ausente | **45** | 10.528 canales declaran `TYPE-1`; **45 no declaran el atributo**. Consistente con el override a `NONE` del HDCP-Adaptive Engine, pero esos 45 quedan sin declaración explícita. |

**Ninguna de estas contradicciones es una violación de la GOLDEN RULE `hvc1`/`hev1`** (§3.4: 0 violaciones).
Son desalineaciones **entre capas**, no cruces del par prohibido, y hay que reportarlas como tales para no
inflar el conteo de violaciones doctrinales.

---

## 9. Hallazgos con severidad

| ID | Severidad | Capa | Hallazgo | Corrección propuesta |
|---|---|---|---|---|
| H-03-01 | **HIGH** | `#EXTVLCOPT` / `#EXT-X-STREAM-INF` | 7.457 canales (70,5 %) declaran `codec=h264` en VLC mientras la variante declara `hvc1.2.4.L153.B0` (C3). | Derivar `#EXTVLCOPT:codec=` del códec real de la variante, no del perfil. Verificar con VLC antes de afirmar efecto. |
| H-03-02 | **MEDIUM** | `#EXTHTTP` | El cap de 200 campos expulsa **26–65 campos por canal** a `#EXT-X-APE-OVERFLOW-HEADERS`, un tag que ningún reproductor lee: 383.777 pares header→valor quedan fuera del objeto que el player sí recibe. Y por separado, el bloque de códec/HDR `X-APE-*` (30 campos) **solo se emite en 1.470 canales (13,9 %)**; en 9.103 no existe en ninguna de las dos partes. | Aplicar `EXTHTTP_PRIORITY_KEYS` a los headers de códec/HDR antes del recorte (la infra existe para prefetch y no cubre este bloque) y unificar el orden de campos para que el corte sea determinista entre perfiles. |
| H-03-03 | **MEDIUM** | CMAF | `#EXT-X-CMAF-CONTAINER: mpegts` + `#EXT-X-MAP: 0` + `X-APE-CMAF=fmp4` en el 100 % (C6): la familia CMAF afirma CMAF que no existe. | Alinear `-CONTAINER` con la realidad (`mpegts`) y retirar `X-APE-CMAF`/`-INIT-SEGMENT`, o emitir `#EXT-X-MAP` real. |
| H-03-04 | **MEDIUM** | `#EXT-X-I-FRAME-STREAM-INF` | 10.573 tags omiten `URI`, obligatorio por RFC 8216 §4.4.6.6 (consecuencia de Single-URL-per-channel). | Mantener la doctrina (correcta anti-509) y **documentarla como no-conformidad consciente**; o retirar el tag, que hoy no aporta nada. |
| H-03-05 | **LOW** | niveles HEVC | Tres niveles por canal: `L153` (variante), `L93/L123` (I-frame), `L150/L123` (EXTHTTP) (C4/C5). `L93`/`L123` por debajo de 4K. | Unificar en `L153` en las tres capas, o dejar solo la de variante. |
| H-03-06 | **LOW** | `#KODIPROP` DRM | `drm_type=widevine, drm_level=L1, HW_SECURE_ALL` en el 100 % con `drm_key_request_properties` y `drm_server_certificate` **vacíos** y **1** `#EXT-X-KEY` en toda la lista. | DRM declarativo sin configuración ni clave: marcar como no-verificado o retirar. |
| H-03-07 | **LOW** | `#EXTVLCOPT` | 23 opciones `adaptive-reload-use-*` (243.179 ocurrencias, 17,2 %) con forma de opciones inexistentes en VLC. **No verificado.** | Contrastar con la tabla de opciones de VLC y podar las que no existan. |
| H-03-08 | **INFO** | `#EXTHTTP` | `X-Priority` (10.573) y `X-QoS-Priority` (10.573) son lookalikes de `Priority`, no el header tóxico. 0 headers tóxicos reales. | Ninguna. Registrar para evitar falsos positivos de auditoría. |
| H-03-09 | **INFO** | `#KODIPROP` | `inputstream=inputstream.adaptive` fuerza el módulo adaptive, dejando muertas las 9 propiedades `inputstream.hlsjs.*`. | Emitir las que correspondan al módulo realmente seleccionado. |

---

## 10. Lo que NO se midió (fail-honest)

1. **No ejecuté ningún reproductor.** VLC, Kodi, ExoPlayer, TiviMate, OTT Navigator, hls.js: ninguno se
   lanzó. Todo efecto declarado en §8 (C2, C3) es **expectativa por semántica de la opción**, no medición.
   Las tablas de capacidad por runtime son de otra tarea; aquí no hay veredicto de reproducción.
2. **No validé las 134 opciones `#EXTVLCOPT` contra la tabla real de VLC.** El subconjunto
   `adaptive-reload-use-*` es sospechoso (H-03-07), no probado.
3. **No verifiqué las IPs/SNI de PHANTOM contra el host real de cada canal.** `-IP` (600 valores) y
   `-SNI: cdn.akamaized.net` se reportan como declaración, no como correspondencia.
4. **No medí el bitstream.** Un tag que declara LCEVC, Dolby Vision P8, VVC o EVC no se convierte en
   evidencia de que el segmento lo contenga. La lista no permite verlo y no descargué segmentos.
5. **No atribuyo intención.** "Declarativo", "inerte" y "por diseño" describen lo medido contra la doctrina
   escrita del repo; no leo la mente del generador.
6. **`X-APE-JWT=true` no es un JWT.** Es una bandera booleana; busqué el patrón `eyJhbGciOi` y no aparece.
   Si el token existe, va por `#EXT-X-APE-PLAYBACK-TOKEN` (fuera del alcance de esta tarea).

---

## 11. Reproducibilidad

```powershell
# 1) conteos base (verificación independiente del analizador)
$f='<ruta>\APE_LISTA_1793589060441.m3u8'
foreach($p in @('#EXTINF','#EXTHTTP:','#KODIPROP:','#EXTVLCOPT:','#EXTATTRFROMURL:','#EXT-X-MAP','#EXT-X-STREAM-INF','#EXT-X-MEDIA:','#EXT-X-I-FRAME-STREAM-INF','#EXT-X-DATERANGE')){
  "$p`t" + (rg -c --no-filename -- ($p -replace '#','\#') $f)
}

# 2) censo completo (JSON + validación de schema)
node docs\cartography\APE_LISTA_523d52a6\03_headers_analyzer.mjs --out docs\cartography\APE_LISTA_523d52a6\03_headers_map.json
node -e "JSON.parse(require('fs').readFileSync('docs/cartography/APE_LISTA_523d52a6/03_headers_map.json','utf8'));console.log('JSON OK')"

# 3) control de redacción (0 esperado en todas)
$j = Get-Content docs\cartography\APE_LISTA_523d52a6\03_headers_map.json -Raw
foreach($pat in @('://[^/\s"]+:[^/\s"]+@','(?i)bearer\s+[A-Za-z0-9]','eyJhbGciOi','(?i)&pass=')){ "$pat -> " + ([regex]::Matches($j,$pat)).Count }
```

Salida del control de redacción al cierre: `0`, `0`, `0`, `0`. (La única aparición de la cadena
`password=` en el JSON es la nota de método del campo `meta.redaction`.)

---

## 12. Verificación de consistencia MD ↔ JSON

Se re-derivaron 36 cifras cabecera desde `03_headers_map.json` y se comprobó su presencia literal en este
documento. Resultado: **35/36 presentes**. La única ausente (`2.493.618`, suma de campos por canal) **nunca
se citó en este documento** — es un agregado derivado que no se usa en ninguna afirmación. No hay ninguna
cifra en el MD que no esté en el JSON.

```powershell
node -e "const j=JSON.parse(...03_headers_map.json...); /* 36 rutas: exthttp.*, kodiprop.*, extvlcopt.*,
  extattrfromurl.*, cmaf.*, vnova.*, phantom.*, variant_headers.*, coherence.*, meta.* */"
# -> total_checks=36  no_encontradas_en_MD=1 (2.493.618, no citada)
```

**Limitación declarada del `metacog_audit` (fail-honest):** se ejecutó sobre el conjunto de cifras centrales
y devolvió `NO_SOPORTADO` en 20/21 fragmentos. **No es un hueco de evidencia**: el filtro reportó
`el item no declara objetivo` en los 5 ítems **incluso cuando `objetivo` sí se declaró** (probado en una
llamada mínima de 2 fragmentos y 3 ítems con `objetivo: 1|2`, resultado idéntico). El propio tool advierte
que `NO_SOPORTADO` significa *"no encontré el artefacto en lo que me diste"*, **no** "es falso". El artefacto
existe, se leyó, y cada cifra de este documento lo cita en su misma línea (ruta de campo del JSON + comando).
Su hallazgo `promedio_sin_tamano_de_muestra` es un falso positivo: **n = 10.573 está declarado** en §0 —
es un censo total, no una muestra.

---

**Estado:** cerrado. `#EXTHTTP`, `#KODIPROP`, `#EXTVLCOPT`, `#EXTATTRFROMURL`, las tres familias propietarias
y los encabezados de variante quedan mapeados sobre **10.573/10.573 canales** (censo total, no muestra),
con `#EXT-X-MAP = 0` verificado y las 13 desalineaciones entre capas contadas.
