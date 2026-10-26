# REA · R4 — Matriz de headers con evidencia

**Tarea:** `t4` · **Attempt:** `abb5a1d5-50ea-46c0-b8b4-8882308ee2e8` · **Autor:** `headers-recon`
**Fecha:** 2026-10-25 · **Entregable:** este documento
**Dependencia:** R1 (`docs/REA_SCOPE_AND_ARTIFACTS.md`) — gate de inventario, identidad de APK y frontera legal.
**Fuente adicional:** R2 (`docs/REA_APK_ANALYSIS.md`) — parser `http-h` de OTT, UA/Referer/cookie y delta de `Authorization: Basic`.

> **Regla de lectura:** cada afirmación de este documento lleva una etiqueta:
> `[observado]` = visto en código, artefacto o medición local de esta sesión;
> `[público]` = documentación/estándar externo verificable;
> `[no disponible]` = no hay artefacto, no se midió o el eje queda fuera de alcance.
> **No se usa ✓ para una app que no se ha analizado.** Cuando no hay APK, la celda dice
> `N/D` con el motivo, no un ✓ inventado.

---

## 0. Resumen ejecutivo

1. **La matriz v9 sí tiene 139 headers**, pero no es un número único: `getStats()` devuelve
   **139** (suma de claves por nivel: L1=15, L2=16, L3=18, L4=25, L5=65), el union real de
   nombres es **135** (hay 4 nombres repetidos entre niveles) y `getHeaders(5)` emite **109**
   tras su propio `BANNED`. Los rótulos **154** (comentario) y **148** (tag de salida) son
   **stale** y no coinciden con el código. `[observado]`
2. **Hay cuatro capas de headers que no son la misma cosa:** el generador principal
   (`m3u8-typed-arrays-ultimate.js`), la matriz v9, las categorías de `ape-profiles-config.js`
   y el motor PHP `universal_headers_engine.php`. Sus conteos y sus filtros **divergen**.
   `[observado]`
3. **El “76–79 headers por canal” del encargo no se pudo confirmar con un artefacto post-fix.**
   El generador actual tiene un tope de **200 nombres / 8 192 bytes** y derrama el resto a
   `#EXT-X-APE-OVERFLOW-HEADERS`. El único listado masivo en disco es **anterior** al fix C8
   (2026-05-11): 2 754 canales × **200** headers, con **18 headers tóxicos por canal**.
   `[observado]` para el artefacto; `[no disponible]` para el conteo efectivo actual.
4. **Hallazgo crítico de cableado (H1):** `build_exthttp()` devuelve un **string**
   (`#EXTHTTP:{...}`), pero el llamador lo trata como objeto y hace
   `..._exthttp_base.headers`. Ese spread es siempre `{}`. Por tanto, los ~385 headers
   estáticos de `build_exthttp()` —incluida la inyección del Profile Manager y su propio
   filtro— **no se fusionan** en el `_httpPayload` final. El EXTHTTP final sale del literal
   `_httpPayload` (66 claves, 61 tras el denylist) más JWT/max-quality condicionales.
   `[observado]` en código; el total emitido en runtime queda `[no disponible]` porque no se
   generó una lista post-fix en esta tarea.
5. **Los 9 tóxicos del plan están bien identificados:** 6 de la familia C8 (`Range`,
   `If-None-Match`, `If-Modified-Since`, `TE`, `Priority`, `Upgrade-Insecure-Requests`) +
   3 hop-by-hop (`Connection`, `Keep-Alive`, `Proxy-Connection`). El código implementa
   **11 patrones** porque añade dos familias (`Sec-Fetch-*`, `Sec-CH-UA-*`). `[observado]`
6. **El filtro no es uniforme:** el EXTHTTP del generador principal sí pasa por CA7 + denylist
   + scrub; el `#KODIPROP` sigue emitiendo `Connection=keep-alive` en
   `manifest_headers`/`stream_headers`; el módulo PHP secundario emite `Connection` y
   `X-Forwarded-For` en su EXTHTTP. La política “9 tóxicos” **no está aplicada a todas las
   capas**. `[observado]`
7. **La política 4-layer existe en el repo, pero no es global:** `test_exporter.js` conserva
   el patrón 4-layer para headers opacos y fuerza single-value para `Connection`, `Range`,
   `Referer`, `Origin`, `Authorization`, etc.; el generador principal no tiene un enforcement
   global equivalente. **TiviMate no está en disco**, así que su comportamiento real
   (¿primer valor? ¿rechazo?) es `[no disponible]`; solo se puede citar la doctrina del repo,
   no la app. `[observado]` repo / `[no disponible]` app.
8. **Kodi sí está documentado públicamente** para múltiples headers: `stream_headers` y
   `manifest_headers` usan pares `k=v` separados por `&` (y valores URL-encoded). El generador
   tiene una ruta correcta con `&` y otra ruta legacy que serializa JSON en `stream_headers`;
   además deja `Connection=keep-alive` dentro de esos pares. `[público]` + `[observado]`
9. **OTT Navigator sí está en disco** (1.7.3.3, A1). R2 observó el parser `http-h`
   (`hg.j#b` / `h8.k#b`): acepta **JSON de objeto** (nombres arbitrarios) o `K=V&K2=V2`,
   **last-wins** por nombre, `null` omite, UA por defecto `ExoPlayerLib/2.15.1`, `Referer`
   literal y `Authorization: Basic` automático desde `user:pass@` en 1.7.3.3. **No se
   observó** que el tag `#EXTHTTP` se mapee a `http-h`; por eso la fila del tag queda
   `PARCIAL`, no ✓. `R2:36-38,52-56,412-470,1009-1019`. `[observado]` R2 /
   `[no disponible]` el mapeo del tag.
10. **TiviMate, Disney+ y Prime Video no están en disco y no hay ADB** (R1). Todas sus celdas
    de comportamiento son `N/D`. Disney+/Prime además tienen el eje DRM **fuera de alcance**
    (R1 §8; `AGENTS.md` §Regla legal). No se replica `Authorization`, ni sesión de plataforma,
    ni handshake de licencia. `[observado]` gate / `[público]` norma / `[no disponible]` app.
11. **Alternativas lícitas:** el stack tiene HMAC-SHA256 implementado pero **desactivado por
    defecto** (`TOKEN_MODE='none'`, `REQUIRE_SIG=false`, secreto placeholder); CORS está
    **mezclado** (origen específico en algunos endpoints, `*` en otros); **no hay
    `valid_referers`** activo. Se recomienda activar HMAC/allowlist solo para nuestros propios
    endpoints, nunca para simular una plataforma premium. `[observado]` repo / `[público]`
    MDN y nginx.

---

## 1. Gate, alcance y método

### 1.1 Qué apps se pueden afirmar (gate R1)

| App | ¿APK en disco? | ¿Qué se puede afirmar en esta matriz? | Etiqueta |
|---|---|---|---|
| **Nuestro stack** | N/A (código repo) | Emisión, filtros, conteos y sintaxis de nuestras capas | `[observado]` |
| **OTT Navigator 1.7.3.3** | **SÍ** — `studio.scillarium.ottnavigator`, vc 25110201, sha256 `b964c274…` | R2 observó el parser `http-h` (JSON o `k=v&`), last-wins, UA y Referer. **No** se observó el mapeo del tag `#EXTHTTP` a `http-h`; no se marca ✓ de ese tag | `[observado]` R2 / `[no disponible]` mapeo del tag |
| **OTT Navigator 1.6.9.4** | **SÍ** — build universal, sha256 `bd509c0c…`, con VLC nativo | Línea base/diff; no se usa para celdas de comportamiento en esta tarea | `[observado]` |
| **TiviMate** | **NO** (0 APK, 0 ADB) | Ninguna celda de comportamiento; solo doctrina del repo, marcada como tal | `[no disponible]` |
| **Disney+** | **NO** | Ninguna celda de app; eje DRM fuera de alcance | `[no disponible]` |
| **Prime Video** | **NO** | Ninguna celda de app; eje DRM fuera de alcance | `[no disponible]` |
| **Conviva** | No es APK; 0 hits en dex de OTT | No aplica a esta matriz | `[no disponible]` |

Fuente del gate: `R1:337-341` (tabla de veredicto), `R1:426-435` (casos L1–L10).
`AGENTS.md:8-14` fija la regla legal: solo streams/credenciales/tráfico autorizados; prohibido
DRM bypass.

### 1.2 Método (reproducible, sin ejecutar apps)

- Lectura estática de código y documentos del repo (`read`, `grep`).
- Conteos reproducibles con Node sobre los archivos del repo (comandos en Anexo A).
- REA/JADX-headless 0.7.1 sobre el APK A1 para inventario de clases y xrefs de OkHttp
  (evidencia de sesión `ev_efa87d…`, `ev_749c79…`). Se reutiliza R2
  (`docs/REA_APK_ANALYSIS.md`) para el parser `http-h`, UA/Referer/cookie y el delta de
  `Authorization: Basic` en 1.7.3.3.
- Documentación pública para los puntos que no dependen de nuestras apps: RFC 7235/9110
  (`Authorization`), Apple AVFoundation (`X-Playback-Session-Id`), Kodi inputstream.adaptive
  (`stream_headers`/`manifest_headers`), MDN CORS, nginx `valid_referers`, RFC 8216
  (los tags desconocidos se ignoran).
- **No** se ejecutó ningún APK, **no** se contactó ningún dispositivo ADB, **no** se hizo
  tráfico a Disney+/Prime/proveedor, **no** se analizó ningún handshake de licencia.

---

## 2. Arquitectura real de headers: cuatro capas y sus conteos

La primera conclusión de evidencia es que “la matriz de headers” no es una sola fuente de
verdad. Estas capas coexisten y no comparten el mismo filtro ni el mismo conteo:

| Capa | Archivo | Qué hace | Conteo observado | ¿Llega al EXTHTTP final? |
|---|---|---|---:|---|
| **A. Generador principal** | `MAIN` | Construye `_httpPayload` y emite `#EXTHTTP`; además define `build_exthttp()` | 385 claves literales en `build_exthttp` + 66 en `_httpPayload`; union 433 (18 solapadas) | **Parcial**: el tag sale de `_httpPayload`; el payload de `build_exthttp` se pierde por H1 |
| **B. Headers Matrix v9** | `MATRIX` | 5 niveles acumulativos, 4 perfiles de coherencia, `getHeaders(level)` | **139** stats (135 union; 109 emitidos en L5) | **No verificado**: el wrapper la expone como `recommended_headers`, pero no hay consumidor que la fusione en `MAIN` |
| **C. Profile Manager / categorías** | `PROFILES` | 20 categorías, valores por perfil P0–P5, `getHTTPHeadersJSON()` | **261** slots declarados; 20 cats; 86 valores en P3; **68** tras su `BANNED` (P0=75; P1–P5=68) | **Parcial/indirecto**: `build_exthttp` inyecta categorías; si H1 se confirma, tampoco llega |
| **D. Motor PHP “universal”** | `PHPUH` | Genera EXTHTTP/EXTVLCOPT/KODIPROP “por player” | 4 headers base + Origin/Referer/XFF condicionales | **No verificado** si está desplegado; su política difiere (emite `Connection`, `X-Forwarded-For`) |

### 2.1 EXTHTTP del generador principal (capa A)

- Tag emitido: `lines.push(...)` con el string `#EXTHTTP:${_exthttpJson}` — `MAIN:8654`. `[observado]`
- El objeto final `_httpPayload` se define en `MAIN:8282-8521`; el literal activo tiene
  **66 claves únicas** (67 apariciones), de las cuales 5 son `Sec-*` condicionales que el
  denylist elimina después. `[observado]` (conteo Node, Anexo A.3)
- Tope: `MAX_EXTHTTP_HEADERS = 200` y `MAX_EXTHTTP_BYTES = 8192` — `MAIN:5429-5431`.
  El bucle reparte entre `primaryHeaders` y `overflowHeaders` — `MAIN:5580-5603`; el overflow
  se serializa en base64 como `#EXT-X-APE-OVERFLOW-HEADERS` — `MAIN:5610-5616`. `[observado]`
- `build_exthttp()` devuelve **string**, no objeto: `return` con `#EXTHTTP:${primaryJson}`
  (`MAIN:5608`) y en el caso overflow devuelve el string concatenado (`MAIN:5615`). `[observado]`
- El llamador guarda ese string en `_exthttp_base` (`MAIN:7945-7947`) y luego hace
  `...(_exthttp_base ? _exthttp_base.headers || {} : {})` — `MAIN:8431`. Un string no tiene
  `.headers`; el spread es `{}`. `[observado]`
- **Consecuencia H1:** los 385 headers estáticos de `build_exthttp` (incluida la inyección
  PM de `MAIN:5503-5578` y su filtro tóxico) no se fusionan. El comentario de `MAIN:4903`
  (“se mergea a `_httpPayload` final via spread”) describe la intención, no el código actual.
  El split `primaryHeaders`/`overflowHeaders` de `MAIN:5580-5616` vive dentro de
  `build_exthttp`, así que **tampoco se emite** el `#EXT-X-APE-OVERFLOW-HEADERS` por esta
  ruta; el `_httpPayload` final solo pasa por `_sanitizePayloadSize` (`MAIN:8640`). El total
  real solo se puede confirmar generando una lista post-fix; eso no se hizo en R4 →
  `[no disponible]`.

> **No se afirma** que el EXTHTTP actual tenga exactamente 61, 66 o 76–79 headers. Se afirma
> el mecanismo y los conteos estáticos; la medición runtime queda pendiente.

**Claim del encargo vs. evidencia medida**

| Claim del encargo | Evidencia disponible | Veredicto |
|---|---|---|
| “EXTHTTP: 76–79 headers por canal” | No hay lista post-fix en disco; el artefacto masivo (2026-03-30) tiene 200; el tope actual es 200 nombres/8 192 B; el literal `_httpPayload` aporta 66 (61 tras denylist) | `[no disponible]` el número exacto; `[observado]` el mecanismo y los topes |
| “Headers Matrix v9: 139 headers” | `getStats()` = 139; union 135; L5 emitidas 109 | `[observado]` **confirmado** el 139 de `getStats()` |
| “9 headers tóxicos” | 6 C8 + 3 hop-by-hop; el array del código tiene 11 patrones por 2 familias | `[observado]` **confirmado** el conjunto nominal |
| “4-layer” | `test_exporter.js` lo implementa y lista single-value; `MAIN` no tiene enforcement global | `[observado]` en el repo; no verificado en apps |

### 2.2 EXTVLCOPT (capa VLC)

- Bloque de emisión: `MAIN:7985-8033` y siguientes (`network-caching`, `http-user-agent`,
  `http-referrer`, `clock-synchro`, `codec`, `avcodec-*`, filtros HDR/SDR). `[observado]`
- El listado legacy `downloaded_list.m3u8` tiene **261 630** líneas `#EXTVLCOPT` para 2 754
  canales = **95 por canal**. `[observado]` (Anexo A.4)
- El comentario de cabecera de `MAIN:7` dice “21 EXTVLCOPT”; el artefacto dice 95. Es drift
  de documentación, no una medición del código actual. `[observado]`

### 2.3 KODIPROP (capa Kodi)

- Bloque principal: `MAIN:8662-8728` (inputstream, manifest_type, selección, buffer, HDR,
  audio, DRM props). `[observado]`
- Ruta L3.6: `manifest_headers` y `stream_headers` con separador `&`, sin comas ni espacios
  alrededor de `=`/`&`, mismo UA en ambos — `MAIN:8799-8839`. `[observado]`
- Ruta legacy alternativa: `streamHeaders` serializado como **JSON** en
  `#KODIPROP:inputstream.adaptive.stream_headers=...` — `MAIN:3571-3609` y `MAIN:3807`.
  Esto **no** es la sintaxis documentada por Kodi (ver §2.5). `[observado]`
- El bloque KODIPROP también incluye propiedades DRM (`drm_type`, `drm_level`,
  `drm_robustness_level`, etc.) — `MAIN:8716-8725`. Son **propiedades de player**, no un
  handshake de licencia; su análisis funcional/DRM queda fuera de alcance. `[observado]`
- El listado legacy tiene **148 716** `#KODIPROP` / 2 754 = **54 por canal**. El comentario
  de `MAIN:8659` dice “71 líneas”; drift. `[observado]`

### 2.4 Headers Matrix v9: 139 reales, 135 union, 109 emitidos

Medición reproducible (Anexo A.1). Las cifras de emisión son **acumulativas** (L2 incluye
L1; L5 incluye L1–L4):

| Nivel | Claves en el objeto | Emitidas por `getHeaders(level)` tras `BANNED` |
|---|---:|---:|
| L1 SAFE | 15 | 10 |
| L2 STABLE | 16 | 19 |
| L3 ADVANCED | 18 | 32 |
| L4 EXTREME | 25 | 48 |
| L5 ULTRA | 65 | **109** |
| **Stats `totalHeaders`** | **139** | — |

- `getStats()` suma claves por nivel: **139** — `MATRIX:625-639`. `[observado]`
- Union de nombres entre niveles: **135** (4 nombres se repiten y se sobrescriben al acumular:
  `User-Agent`, `Accept`, `Accept-Encoding` y `X-Segment-Duration`). `[observado]`
- `BANNED` de la matriz elimina Client Hints, Sec-Fetch, TE, UIR, DNT, Pragma, etc. —
  `MATRIX:528-538`; **no elimina `Connection` ni `Keep-Alive`**, que siguen saliendo en L5.
  Si alguien consume `getHeaders(5)` sin el gate CA7, recibe hop-by-hop tóxicos. `[observado]`
- Rótulos **stale**: comentario “154 headers” (`MATRIX:7`), tag
  `enabled(148hdrs,5lvl)` (`WRAP:1140`, `UNIFIED:276`), UI
  “154 headers” (`index-v4.html:2168`, `profile-manager-v9.js:6`). El número real de
  `getStats()` es **139**. `[observado]`
- **Cableado:** `WRAP:648-657` llama `hasHeadersMatrix.getHeaders(...)` y lo guarda en
  `recommended_headers` (`WRAP:833-836`), pero no se encontró consumidor de
  `recommended_headers` ni referencia a `HEADERS_MATRIX_V9` dentro de `MAIN`. La matriz es,
  en el código inspeccionado, **asesora/UI**, no una fuente fusionada al EXTHTTP de producción.
  `[observado]`; el runtime de una build concreta queda `[no disponible]`.

### 2.5 4-layer, single-value y reglas por player

**4-layer (comas como capas de fallback):**

- `TESTEXP:7622-7647` documenta el patrón “Beautiful Madness 4-layer” y su límite:
  valores comma-joined en headers de protocolo **rompen** parsers estrictos
  OkHttp/TiviMate/Kodi/ExoPlayer; para headers RFC 7230 se conserva **solo el primer token**.
  `[observado]`
- Lista single-value de `TESTEXP:7628-7640`: `Connection`, `Keep-Alive`, `Proxy-Connection`,
  `Sec-Fetch-*`, `Upgrade-Insecure-Requests`, `Cache-Control`, `Pragma`, `Expires`, `TE`,
  `Trailer`, `Transfer-Encoding`, `Host`, `Content-Length`, `Content-Encoding`, `DNT`,
  `X-Requested-With`, `Referer`, `Origin`, `Authorization`, `Range`, `Accept-Encoding`,
  `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`. `[observado]`
- La doctrina del repo (skill `secure-header-profiler` / `iptv-4layer-fallback-doctrine`)
  coincide: opacos (`User-Agent`, `Referer`, `Origin`, `Cookie`) toleran multi-value; los
  estructurados/token-list no. **La conducta real de TiviMate no está verificada** porque no
  hay APK. `[observado]` doctrina / `[no disponible]` app.
- El generador principal **no** aplica ese sanitizer global: emite valores multi-token en
  `X-Quality-Preference`, `X-Playback-Rate`, `X-Segment-Duration`, etc. (`MAIN:4956-4962`).
  Son headers custom `X-*`, no de protocolo; el riesgo es menor, pero **no hay evidencia** de
  que TiviMate los interprete como lista. `[observado]` emisión / `[no disponible]` app.

**TiviMate (single-value):** el repo asume que TiviMate/OkHttp se queda con el primer valor
y que multi-value puede rechazar el header (`TESTEXP:7622-7645`, `PLAN:58,1173`). Es
**doctrina interna**, no una observación de la app. En la matriz final: `N/D` para toda celda
de comportamiento de TiviMate. `[no disponible]`

**Kodi (multi-header):** la documentación pública de `inputstream.adaptive` especifica
`manifest_headers` y `stream_headers` como pares `header=value` separados por `&`, con valores
URL-encoded (Kodi v20/v21+; en v21+ `stream_headers` aplica solo a segmentos y
`manifest_headers` a manifiestos). `[público]` — ver Anexo C.5. El generador tiene la ruta
correcta en `MAIN:8817-8839` (`&`, sin comas) y una ruta legacy JSON en `MAIN:3807` que no
sigue esa sintaxis. `[observado]`

### 2.6 Los 9 tóxicos: definición, filtros y agujeros

**Definición nominal (6 + 3):** `Range`, `If-None-Match`, `If-Modified-Since`, `TE`,
`Priority`, `Upgrade-Insecure-Requests` + `Connection`, `Keep-Alive`, `Proxy-Connection`.
`[observado]` en `MAIN:2356-2360`; `TG:60-64`; `PLAN:58`.

El código implementa **11 patrones** porque añade dos familias: `Sec-Fetch-*` y `Sec-CH-UA-*`
— `MAIN:2356-2360`. `[observado]`

| Tóxico | Por qué se prohíbe (según el repo) | Dónde se filtra | ¿Queda en alguna capa? |
|---|---|---|---|
| `Range: bytes=0-` | `.m3u8` no es byte-rangeable; algunos paneles cierran el socket tras 206 inválido | CA7 + denylist + scrub (`MAIN:8600-8639`, `2398-2415`) | EXTHTTP no; el artefacto legacy sí |
| `If-None-Match: *` | CDN responde 304 + 0 B → OkHttp legacy “unexpected end of stream” | CA7 + denylist | EXTHTTP no; legacy sí |
| `If-Modified-Since` | mismo 304 con cuerpo vacío | CA7 + denylist | EXTHTTP no; legacy sí |
| `TE: trailers` | OkHttp legacy no soporta trailers → EOF | CA7 + denylist | EXTHTTP no; legacy sí |
| `Priority: u=0, i` | RFC 9218 (HTTP/3) sobre HTTP/1.1 confunde parsers Xtream | CA7 + denylist | EXTHTTP no; legacy sí |
| `Upgrade-Insecure-Requests: 1` | redirect inválido en providers HTTP-only | CA7 browser-only + denylist | EXTHTTP no; legacy sí |
| `Connection` | hop-by-hop RFC 7230 §6.1; el cliente lo gestiona | CA7 absoluto (EXTHTTP) | **Sí en KODIPROP** (`MAIN:8823,8832`) y en `PHPUH:171` |
| `Keep-Alive` | hop-by-hop; multi-valor rompe OkHttp | CA7 absoluto (EXTHTTP) | **Sí en `PHPUH:171`**; matriz v9 lo emite |
| `Proxy-Connection` | hop-by-hop, prohibido | CA7 + `BANNED` de matriz (`MATRIX:531`) | EXTHTTP no |
| `Sec-Fetch-*` | structured headers; solo navegador real | CA7 browser-only + denylist incondicional | **Neto cero**: se añaden en `MAIN:8484-8491` y el denylist las quita en `8636-8639` |
| `Sec-CH-UA-*` | Client Hints de navegador; mismatch JA3/JA4 | CA7 browser-only + denylist incondicional | **Neto cero**: se añaden en `MAIN:8494-8507` y el denylist las quita en `8636-8639` |

**Agujero H3 (Sec-*):** el código añade Client Hints condicionalmente por UA de navegador y
luego el denylist incondicional las elimina en el mismo pipeline. El resultado neto es
“nunca se emiten”, aunque el código parezca soportarlas. Si se quieren Client Hints para un
navegador real, hay que cambiar el orden o excluirlas del denylist; hoy son código muerto.
`[observado]`

**Agujero H4 (KODIPROP/PHP):** la política “9 tóxicos” se aplica al EXTHTTP, no al KODIPROP
ni al motor PHP. `MAIN:8823` y `MAIN:8832` emiten `Connection=keep-alive` dentro de
`manifest_headers`/`stream_headers`; `PHPUH:167-172` emite `Connection` en su EXTHTTP y
`PHPUH:182-185` emite `X-Forwarded-For` si hay `proxy_ip`. `[observado]`

---

## 3. Matriz comparativa de headers (la tabla central)

**Leyenda de celdas**

- `SÍ [observado]` — la capa/app lo soporta y se vio en código, APK o artefacto. En apps, la
  observación es de R2 y se cita en la columna de fuente.
- `NO [observado]` — la capa lo prohíbe/filtra y se vio el filtro (o la app carece del motor).
- `PARCIAL [observado]` — se emite en una ruta y no en otra, existe pero está desactivado, o
  el contenedor se observó pero no el mapeo completo (p. ej. `#EXTHTTP`→`http-h` en OTT).
- `N/D — … [no disponible]` — no hay APK, no hay medición de esa app, o el eje queda fuera;
  **no** es un ✗ de la app.

**Fuentes:** códigos definidos y **enlazados** en el Anexo B. Cada fila cita la fuente
primaria; las referencias públicas están en el Anexo C. En la tabla, `SÍ`/`NO`/`PARCIAL`
heredan `[observado]`; `N/D` hereda `[no disponible]`.

| # | Header / familia | Nuestro stack | TiviMate | OTT Navigator 1.7.3.3 | Disney+ | Prime Video | Fuente de evidencia |
|---:|---|---|---|---|---|---|---|
| 1 | `#EXTHTTP:{...}` (JSON de headers) | **PARCIAL** — tag emitido, pero payload de `build_exthttp` perdido por H1 | `N/D — sin APK` | **PARCIAL** — `http-h` JSON observado; mapeo `#EXTHTTP`→`http-h` **no** observado | `N/D — sin APK; eje DRM fuera` | `N/D — sin APK; eje DRM fuera` | `MAIN:5608,7945,8431,8654`; `R1:456-457`; `R2:52-56,459-470` |
| 2 | `#EXTVLCOPT:` (VLC) | **SÍ** | `N/D — sin APK` | `N/D — APK sí; EXTVLCOPT no verificado; VLC nativo ausente en 1.7.3.3` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:7985-8033`; `R1:138` |
| 3 | `#KODIPROP:` (Kodi ISA) | **PARCIAL** — emite, pero `Connection` tóxico dentro y ruta JSON legacy | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:8662-8728,8799-8839,3807`; `PHPUH:270-300` |
| 4 | `User-Agent` | **SÍ** — UA determinista por canal (banco 180) | `N/D — sin APK` | **SÍ** — UA custom por perfil; default `ExoPlayerLib/2.15.1` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:630-686,782-793,4916,8340`; `R2:552,1018` |
| 5 | `Accept` / `Accept-Language` / `Accept-Encoding` | **SÍ** | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:4917-4919,8472-8474`; `PHPUH:168-171` |
| 6 | `Referer` / `Origin` | **SÍ** — pool de 20 dominios neutros, rotación por canal/epoch | `N/D — sin APK` | **SÍ** — `Referer` literal inyectado desde perfil/`http-h`; `Origin` no observado | `N/D — sin APK` | `N/D — sin APK` | `MAIN:7744,8508-8520`; `R2:550-552,1016-1017` |
| 7 | `Cache-Control` / `Pragma` | **SÍ** — `no-cache` | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:4945-4946,8475-8476` |
| 8 | `Authorization` | **PARCIAL** — solo `Bearer <JWT propio>` si hay JWT; no hay credencial premium | `N/D — sin APK` | **PARCIAL** — header arbitrario por `http-h`; 1.7.3.3 añade `Basic` desde `user:pass@` y puede sobrescribir | `N/D — no se replica; plataforma` | `N/D — no se replica; plataforma` | `MAIN:8429`; `JWT:229-233,274-292`; `R2:57-59,1019`; RFC 7235 §4.2 |
| 9 | `X-Playback-Session-Id` | **SÍ** — UUID de correlación propio | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — no se replica; sesión de plataforma` | `N/D — no se replica; sesión de plataforma` | `MAIN:4951,8425`; Apple AVFoundation (Anexo C.2) |
| 10 | `Cookie` | **PARCIAL** — solo matriz v9 L5 (cookies CF simuladas); **no** en EXTHTTP principal | `N/D — sin APK` | **SÍ** — cookie jar propio del player | `N/D — sin APK` | `N/D — sin APK` | `MATRIX:278-279`; grep sin `Cookie` en `MAIN`; `R2:1023` |
| 11 | `Connection` / `Keep-Alive` | **PARCIAL** — fuera del EXTHTTP (CA7), dentro de KODIPROP/PHP | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:8600-8634,8823,8832`; `PHPUH:171` |
| 12 | `Range` / `If-None-Match` / `If-Modified-Since` | **NO** — CA7 + denylist + scrub | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:2356-2360,8600-8639`; `TG:60-64` |
| 13 | `TE` / `Priority` / `Upgrade-Insecure-Requests` | **NO** — mismo gate | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:2356-2360,8600-8639` |
| 14 | `Sec-Fetch-*` / `Sec-CH-UA-*` | **NO (neto)** — se añaden y el denylist las quita | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:8484-8507,8618-8639` |
| 15 | `X-Forwarded-For` / `X-Real-IP` / `Via` / `Forwarded` | **NO** en EXTHTTP; sobreviven como tags `EXT-X-APE-FALLBACK-*` | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — sin APK` | `N/D — sin APK` | `MAIN:8362-8364,8600-8607,1173-1240` |
| 16 | `X-APE-*` (metadata interna) | **PARCIAL** — 27 claves activas en `_httpPayload`; doctrina dice que no deben filtrarse | `N/D — sin APK` | **SÍ** — `http-h` JSON acepta nombres arbitrarios | `N/D — sin APK` | `N/D — sin APK` | `MAIN:8316-8338,8400-8410`; `R2:459-470`; conteo A.5 |
| 17 | `X-WidevineKeySystem` / `X-PlayReady-Support` / `X-DRM-Support` | **PARCIAL** — solo matriz v9, metadata inerte; no es DRM real | `N/D — sin APK` | `N/D — APK sí; comportamiento no verificado` | `N/D — fuera de alcance` | `N/D — fuera de alcance` | `MATRIX:187,282-284`; `PROFILES:194` |
| 18 | Multi-value / 4-layer | **PARCIAL** — sanitizer en `test_exporter.js`; no enforcement global en `MAIN` | `N/D — doctrina repo, sin APK` | **PARCIAL** — parser observado; `map.put` ⇒ last-wins (derivado): un solo valor por nombre | `N/D — sin APK` | `N/D — sin APK` | `TESTEXP:7622-7647`; `MAIN:4956-4962`; `R2:465,1015` |
| 19 | CORS de respuesta (`Access-Control-Allow-Origin`) | **PARCIAL** — origen específico en varios endpoints, `*` en otros | N/A | N/A | N/A | N/A | `CORS:30,92`; `CONVIVA:24`; `ARA:21` |
| 20 | URL firmada HMAC (`?token=`) | **PARCIAL** — implementada, desactivada por defecto | N/A | N/A | N/A | N/A | `RESOLVE:44-49,69-73,426`; `JWT:229-233` |
| 21 | Referer allowlist (`valid_referers`) | **NO** — no hay `valid_referers` en el repo | N/A | N/A | N/A | N/A | grep sin `valid_referers`; nginx docs (Anexo C.6) |
| 22 | Handshake de licencia DRM | **NO [observado] — fuera de alcance** | `N/D — sin APK` | `N/D — APK sí; DRM fuera de alcance` | **FUERA [observado] doctrina** | **FUERA [observado] doctrina** | `R1:426-435`; `AGENTS.md:8-14` |

**Notas de la tabla**

- Las filas 19–21 son de **servidor/entrega**, no headers que el player envíe al proveedor.
  Se incluyen porque el encargo pide “qué sí podemos hacer” (HMAC, CORS, referer allowlist).
- Las filas 8–9 son las dos que el encargo identifica como **headers de plataforma**. Se
  desarrollan en §5.
- Las filas 17 y 22 se separan deliberadamente: `X-WidevineKeySystem`/`X-DRM-Support` son
  strings custom inertes; **no** son un handshake ni una licencia.

---

## 4. Estado por app (sin inventar ✓/✗)

### 4.1 Nuestro stack — `[observado]`

**Lo que sí se puede afirmar**

- Emitimos `#EXTHTTP`, `#EXTVLCOPT` y `#KODIPROP` en el mismo bloque de canal
  (`MAIN:8654`, `7985-8033`, `8662-8839`). `[observado]`
- El EXTHTTP del generador principal tiene tope de 200 nombres / 8 192 B y overflow base64
  (`MAIN:5429-5431`, `5580-5616`). `[observado]`
- Existe una matriz v9 con 139 stats / 135 union / 109 emitidas en L5 (`MATRIX:625-639`;
  Anexo A.2). `[observado]`
- Existe un perfil P0–P5 con 20 categorías y 261 slots declarados; P3 produce 86 valores y
  deja 68 tras su `BANNED` (`PROFILES:44-276,5826-5931`; Anexo A.3). `[observado]`
- El 4-layer está implementado en `test_exporter.js` con lista single-value explícita
  (`TESTEXP:7622-7647`). `[observado]`
- Los 9 tóxicos nominales están en el denylist; el código añade 2 familias (`MAIN:2356-2360`).
  `[observado]`
- Existe JWT propio HS256 y extracción `Authorization: Bearer` / `?_ape_token=` / cookie
  (`JWT:229-233,274-292`). `[observado]`

**Lo que no se puede afirmar**

- Que el EXTHTTP actual tenga 76–79 headers. **No hay artefacto post-fix**; el listado masivo
  es de 2026-03-30 (antes del fix C8) y tiene 200 headers + 18 tóxicos por canal.
  `[no disponible]`
- Que la matriz v9 se fusione al EXTHTTP de producción. El wrapper la expone como
  `recommended_headers`, pero no se encontró consumidor; `MAIN` no referencia
  `HEADERS_MATRIX_V9`. `[observado]` ausencia de cableado; runtime `[no disponible]`.
- Que el `build_exthttp` de 385 claves llegue al player. H1 muestra que el spread es sobre
  `.headers` de un string → `{}`. `[observado]`; medición runtime `[no disponible]`.
- Que los 9 tóxicos estén ausentes de **todas** las capas: `Connection` sigue en KODIPROP y
  en `PHPUH`; el listado masivo legacy tiene 18 por canal. `[observado]`

### 4.2 OTT Navigator 1.7.3.3 — APK sí; gramática `http-h` observada por R2

**Observado en el APK A1** (`sha256 b964c274…`, R1:81, R1:107):

- `usesCleartextTraffic=true`, minSdk 26, targetSdk 30, sin `networkSecurityConfig`
  (`R1:190`, `R1:257-258`). `[observado]`
- R1 documenta **369 hits** de `com/google/android/exoplayer`, **0** de `androidx.media3` y
  **ausencia de `libvlc.so`** en 1.7.3.3; su conclusión “ExoPlayer 2 + FFmpeg” es un derivado
  de esas observaciones (`R1:147-165`). `[observado]` las observaciones.
- En esta sesión, JADX 0.7.1 encontró clases **`okhttp3.*`** (incluido `OkHttpClient`,
  `Headers`, `RealCall`, `Http1ExchangeCodec`, `Http2ExchangeCodec`) y **29 xrefs** de clase
  a `okhttp3.OkHttpClient`, varias desde clases ofuscadas (`A8.H`, `C8.Q`, `C8.V`,
  `C8.X`, `C8.r`, `E8.J`, `S7.f`, `S7.i`, `U7.b`, `n8.l`, `p8.d`, `y8.c`). `[observado]`
  Evidencia de sesión: `ev_efa87d…` (matches `okhttp3`), `ev_749c79…` (xrefs).
- Búsquedas JADX de `HttpDataSource`, `ExoPlayer` y `DataSource` en el inventario top-level
  devolvieron **0 matches**. No se interpreta como ausencia de ExoPlayer: R1 ya documentó
  369 hits de la cadena `com/google/android/exoplayer` en los dex; la ausencia en el listado
  top-level es compatible con ofuscación/R8 y queda como limitación, no como ✗.
  `[observado]` inventario / `[no disponible]` mapeo de clases.

**Observado por R2 en el parser de headers** (`R2:412-470,1009-1019`):

- `http-h` acepta **JSON de objeto** (`{"Header":"valor",...}`) o querystring
  `K1=V1&K2=V2`; la precedencia es atributo del ítem > atributo del canal.
  `[observado]` R2.
- En JSON, los nombres son literales (`nextName()`) y los valores `null` se omiten; un valor
  que empieza por `{` pero no es objeto JSON se descarta completo. `[observado]` R2.
- Header repetido: gana el **último** (`map.put`) → un solo valor por nombre.
  `[observado/derivado]` R2.
- UA por defecto `ExoPlayerLib/2.15.1`, sustituible por perfil; `Referer` se inyecta como
  header literal; 1.7.3.3 añade `Authorization: Basic` desde `user:pass@` y puede sobrescribir
  un `Authorization` de `http-h`. `[observado]` R2.
- Cookie jar propio del player. `[observado]` R2.

**No verificado (no confundir con “no soportado”)**

- Que el tag **`#EXTHTTP`** del M3U8 se mapee a `http-h`: R2 observó el parser de `http-h`,
  no el parser M3U/XSPF (su clase quedó sin nombre). `[no disponible]`
- Que el cliente HTTP efectivo del DataSource sea OkHttp; las xrefs prueban uso de OkHttp en
  la app, no que el player lo use para manifests/segmentos. `[no disponible]`
- Que el proveedor upstream **acepte** cada header; eso es probe, no REA. `[no disponible]`

**Consecuencia para la matriz:** las celdas de OTT ya no son “N/D” en bloque: la gramática
`http-h` observada permite afirmar JSON con nombres arbitrarios, last-wins, UA/Referer/cookie.
La fila del **tag** `#EXTHTTP` queda `PARCIAL` porque el mapeo tag→`http-h` no se observó.
`[observado]` R2 / `[no disponible]` mapeo y aceptación upstream.

### 4.3 TiviMate — no disponible

- 0 APK, 0 ADB (R1:338; R1:33; R1:350-356). `[observado]`
- No se puede verificar: single-value, parseo de `#EXTHTTP`, `#EXTVLCOPT`, `#KODIPROP`,
  User-Agent, ni comportamiento ante headers duplicados. **Todas** las celdas de TiviMate son
  `N/D`. `[no disponible]`
- Lo que sí existe es doctrina interna que asume OkHttp/TiviMate first-value
  (`TESTEXP:7622-7645`, `PLAN:58`), y una skill de repo
  (`tivimate-single-value-headers-enforcer`) que lo repite. Se cita como **doctrina**, no
  como observación de la app. `[observado]` repo.
- Para cerrar la fila hace falta el APK de la instalación del propietario (base + splits) o un
  equipo autorizado por ADB; instrucciones exactas en `R1:471-505`. `[público]` procedimiento.

### 4.4 Disney+ y Prime Video — no disponibles y fuera de alcance DRM

- 0 APK, 0 ADB (R1:339-340). `[observado]`
- Aunque llegara un APK, el eje `Authorization`/sesión/DRM de plataforma no se replica:
  handshake de licencia, claves, CDM, HDCP y redistribución están prohibidos por
  `R1:426-435` y `AGENTS.md:8-14`. `[público]` norma + `[observado]` doctrina.
- Lo lícito: analizar **capacidades** del dispositivo y compatibilidad (códecs, HDR, nivel de
  DRM declarado) en el equipo del propietario, con su suscripción; nunca parchear el binario
  ni re-servir el manifest (`R1:426-435`, L1–L10). `[público]`
- En la matriz: `N/D` en todas las celdas de app; `N/D — fuera de alcance` en las filas de
  `Authorization`/sesión/DRM. `[no disponible]`

---

## 5. Headers de plataforma: `Authorization` y `X-Playback-Session-Id`

### 5.1 `Authorization` — credencial de origen, no un “header mágico”

- Es un campo estándar de HTTP: autentica al user-agent con el origin server; su valor son
  credenciales del esquema elegido (Basic, Bearer, etc.) — RFC 7235 §4.2; definición vigente
  en RFC 9110 §11.6.2. `[público]`
- En un servicio premium, `Authorization` lleva un token emitido por **su** plataforma de
  autenticación a **su** cliente licenciado. Replicar ese token en otro cliente es acceso no
  autorizado y, si toca licencias/DRM, circumvención; queda **fuera de alcance**.
  `[público]` norma + `[observado]` R1 §8.
- **Nuestro uso lícito:** `Authorization: Bearer <JWT HS256 propio>` para nuestro resolver,
  emitido/verificado por `ape_jwt_auth.php` (`JWT:229-233`), y solo si el generador tiene JWT
  (`MAIN:8429`). El endpoint también acepta `?_ape_token=` y cookie para players sin headers
  (`JWT:274-292`) — es nuestra propia autenticación, no la de un tercero. `[observado]`
- **OTT 1.7.3.3** añade `Authorization: Basic` desde `user:pass@` y puede sobrescribir el
  `Authorization` que venga por `http-h` (`R2:57-59,1019`). Si se usa, evitar credenciales en
  la URL o no duplicar el header. `[observado]` R2.
- **No se hace:** capturar el `Authorization` de Disney+/Prime, reutilizarlo, ni fabricar uno
  “parecido”. No hay APK ni tráfico de esos servicios en esta sesión. `[no disponible]`

### 5.2 `X-Playback-Session-Id` — identificador de sesión del asset, no una llave de acceso

- Apple AVFoundation documenta `AVURLAsset.httpSessionIdentifier` como “a session identifier
  that the asset sends in HTTP requests that it makes”, y precisa: “The asset uses this value
  to set as the `X-Playback-Session-Id` header of HTTP requests that it creates.”
  `[público]` — Anexo C.2.
- Es un UUID por asset/sesión, útil para correlacionar peticiones. **Por sí solo no concede
  acceso**; en un servicio premium va atado a la sesión/credenciales/DRM de esa plataforma.
  Replicar el valor de otra sesión o intentar “unirse” a ella es suplantación/acceso no
  autorizado. `[público]` + `[observado]` R1 §8.
- **Nuestro uso lícito:** generamos un UUID propio por canal y lo ponemos como
  `X-Playback-Session-Id` para nuestra telemetría (`MAIN:4951`, `MAIN:8425`); es correlación,
  no autenticación. `[observado]`
- **No se hace:** replicar el `X-Playback-Session-Id` de Disney+/Prime; no hay APK ni captura
  autorizada de su tráfico. `[no disponible]`

### 5.3 Otros headers “de plataforma” y pseudo-DRM

- `Cookie`: puede llevar sesión de plataforma; nuestro `MAIN` **no** la emite (solo la matriz
  v9 L5 simula cookies CF, `MATRIX:278-279`). No se replica la cookie de un servicio premium.
  `[observado]` / `[no disponible]`
- `X-WidevineKeySystem`, `X-PlayReady-Support`, `X-FairPlay-Support`, `X-DRM-Support`: son
  **strings custom** de nuestra matriz/perfil (`MATRIX:187,282-284`, `PROFILES:194`). No son
  headers de plataforma, no piden una licencia y **no** habilitan DRM. Presentarlos como
  “soporte DRM” sería una mentira técnica; se mantienen como metadata inerte o se eliminan.
  `[observado]`
- `X-APE-*`: metadata interna nuestra; no es plataforma. Su fuga al upstream es un riesgo de
  fingerprint, no una credencial. Ver H5. `[observado]`

---

## 6. Alternativas lícitas: qué sí podemos hacer

### 6.1 URLs firmadas HMAC (nuestro origen)

**Estado observado**

- `resolve.php` define `TOKEN_TTL = 120`, `TOKEN_MODE = 'none'`, `TOKEN_SECRET` placeholder,
  `REQUIRE_SIG = false` — `RESOLVE:44-49,54`. `[observado]`
- `token_hmac()` implementa `base64url(payload) . base64url(HMAC-SHA256(payload, secret))`
  — `RESOLVE:69-73`; se aplicaría solo si `TOKEN_MODE === 'hmac'` (`RESOLVE:426`). `[observado]`
- Hay verificación HMAC con comparación de tiempo constante en otro endpoint:
  `hash_equals($expected, $hmac)` — `resolve_quality_unified.php:3712-3737`. `[observado]`
- JWT propio HS256 con `hash_equals` y TTL — `JWT:229-233,251-258`. `[observado]`

**Recomendación lícita**

1. Activar `TOKEN_MODE='hmac'` **solo** para nuestros endpoints que validan el token; no
   añadirlo a un upstream Xtream que rechaza query params desconocidos (el propio comentario
   `RESOLVE:46-47` lo advierte).
2. Mover `TOKEN_SECRET` a variable de entorno/secret manager, no al archivo; rotar.
3. TTL corto (120 s ya definido) + `hash_equals` en la verificación; no comparar con `==`.
4. No usar el token como sustituto de `Authorization` de una plataforma premium; es nuestra
   firma, no una licencia de terceros. `[observado]` código / `[público]` HMAC.

### 6.2 CORS controlado

**Estado observado**

- Endpoints con origen específico:
  `Access-Control-Allow-Origin "https://iptv-ape.duckdns.org"` — `CORS:30`, `CONVIVA:24`.
- Endpoints con wildcard: `CORS:92` y `ARA:21` usan `"*"`. `[observado]`
- No hay `Vary: Origin` en los snippets inspeccionados. `[observado]`

**Recomendación lícita**

- Para endpoints con credenciales/cookies, **nunca** `*`; reflejar solo orígenes allowlisted y
  añadir `Vary: Origin` (MDN: el wildcard no es válido con credenciales). `[público]` Anexo C.3.
- Para segmentos/manifiestos consumidos por players nativos, CORS no aplica (no hay navegador);
  no añadir headers CORS innecesarios al media path. `[público]` + `[observado]` doctrina.
- No usar CORS para “abrir” contenido premium de terceros; solo para nuestros propios
  endpoints y orígenes. `[observado]` R1 §8.

### 6.3 Referer allowlist (anti-hotlink de nuestro origen)

**Estado observado**

- **No hay `valid_referers`** en el repo (grep sin coincidencias). `[observado]`
- En su lugar, el generador rota `Referer`/`Origin` a 20 dominios neutros
  (`MAIN:7744,8508-8520`) y el shield fija `Referer "https://www.netflix.com/"`
  (`SHIELD:75`). Eso es **spoofing de referer**, no una allowlist. `[observado]`
- `PHPUH:221-224` usa `http-referrer` “helps with anti-hotlink protection” en el lado VLC,
  pero no valida el referer entrante. `[observado]`

**Recomendación lícita**

- Para **nuestros** endpoints, usar `valid_referers none blocked server_names ...` +
  `if ($invalid_referer) { return 403; }` (nginx docs, Anexo C.6). Es una defensa de nuestro
  catálogo, no una evasión de un tercero. `[público]`
- No confundir “referer allowlist” con “referer spoofing”: el spoofing se usa para parecer un
  navegador/player ajeno; puede violar ToS y no es evidencia de compatibilidad.
  `[observado]` doctrina / `[público]` nginx.

---

## 7. Hallazgos, contradicciones y riesgos (H1–H10)

> Severidad orientativa: **H** = puede romper la política o la reproducibilidad;
> **M** = drift/riesgo de compatibilidad; **L** = documentación.

| ID | Sev. | Hallazgo | Evidencia | Impacto / corrección |
|---|---|---|---|---|
| **H1** | **H** | `build_exthttp()` devuelve string; el caller hace `.headers` sobre ese string → spread `{}`. El payload de `build_exthttp` (385 claves literales + inyección PM) no llega al EXTHTTP final. | `MAIN:5608,5615,7945-7947,8431` | El EXTHTTP efectivo es mucho menor que el configurado; matriz/perfil pueden no estar en la lista. Corregir el contrato (`{headers}` o `JSON.parse`) y añadir test de conteo post-emisión. |
| **H2** | **M** | La matriz v9 (139) no tiene cableado encontrado hacia el EXTHTTP de `MAIN`; el wrapper la deja en `recommended_headers` sin consumidor. | `WRAP:648-657,833-836`; grep sin `HEADERS_MATRIX_V9` en `MAIN` | La matriz es asesora/UI; no afirmar que sus 139 headers llegan al player. Cablear o retirar la promesa. |
| **H3** | **M** | `Sec-Fetch-*`/`Sec-CH-UA-*` se añaden condicionalmente y el denylist incondicional las quita: neto cero. | `MAIN:8484-8507` vs `8636-8639` | Código muerto y falsa sensación de soporte; decidir una política (navegador real vs nunca) y alinear orden. |
| **H4** | **H** | La política de 9 tóxicos no cubre KODIPROP, el motor PHP ni el `BANNED` de perfiles: `Connection=keep-alive` y `X-Forwarded-For` siguen emitiéndose ahí. | `MAIN:8823,8832`; `PHPUH:167-185`; `PROFILES:5911-5920` | Unify: aplicar el mismo denylist a `stream_headers`/`manifest_headers` y al builder de perfiles, o justificar por player; hoy la doctrina y el código no coinciden. |
| **H5** | **H** | 27 claves `X-APE-*` activas en `_httpPayload`; solo 4 (`Nonce`, `SID`, `List-Hash`, `Timestamp`) están en CA7. La doctrina dice “X-APE-* no debe filtrarse upstream”. | `MAIN:8316-8338,8400-8410,8605-8607` | Fingerprint del engine si el player habla directo al proveedor. El shield HTTP (`proxy_pass_request_headers off`) las quitaría en `/shield/`, pero la doctrina SHIELDED emite URLs directas al proveedor (`TG:68-70`), así que ese strip no cubre el media path. Verificar y/o completar el ban. |
| **H6** | **H** | Los artefactos legacy tienen headers tóxicos: el listado masivo 18/canal y `audit_bulletproof` 6/canal; son pre-fix y no prueban el filtro actual end-to-end. | `downloaded_list.m3u8` (2026-03-30): 2 754 canales, 200 headers, 49 572 hits, 2 754 overflow; `audit_bulletproof_output.m3u8` (2026-05-11) 60 hits/10 canales | No declarar “0 tóxicos” sin un artefacto post-fix; añadir un smoke que parsee el EXTHTTP emitido y falle si aparece un tóxico. |
| **H7** | **M** | Drift de conteos: 154/148/139; 139 líneas/canal vs 95 EXTVLCOPT + 54 KODIPROP + ~515 APE; log “99 headers” vs 261 slots; “71 KODIPROP” vs 54. | `MATRIX:7`; `WRAP:1140`; `PROFILES:6001`; `MAIN:7,8659`; artefacto A.4 | Los números de cabecera no son confiables; generar un `HEADERS-COUNT.json` desde el artefacto real y consumirlo en docs/UI. |
| **H8** | **M** | La matriz v9 L5 incluye headers de evasión/pseudo-bypass (`X-Captcha-Token`, `Cookie` CF simulada, `X-Origin-Shield: bypass`); el catálogo de perfiles añade etiquetas de DPI-bypass/IP-rotation/stealth-XFF. | `MATRIX:279,303-307`; `PROFILES:259-265` | No son evidencia de compatibilidad; algunos pueden violar ToS. Cuarentenar (no emitir por defecto) y no presentarlos como “soporte”. |
| **H9** | **M** | HMAC implementado pero desactivado; CORS mezcla allowlist y `*`; no hay `valid_referers`. | `RESOLVE:48-54`; `CORS:30,92`; `ARA:21` | Activar solo para nuestros endpoints; no usar como sustituto de auth de plataforma. |
| **H10** | **L** | Celdas de TiviMate/Disney+/Prime podrían tentar a inferir ✓ desde doctrina. | `R1:337-341`; `R1:426-435` | Mantener `N/D`; la doctrina no es observación de la app. |

---

## 8. Tabla comparativa final por player (veredicto de evidencia)

| Player | Artefacto | Nivel de evidencia de headers | Se puede afirmar | **No** se puede afirmar | Fuente principal |
|---|---|---|---|---|---|
| **Nuestro stack** | Código repo + artefactos legacy | **Alto** en emisión/filtros; **medio** en runtime | Emitimos EXTHTTP/EXTVLCOPT/KODIPROP; hay 139 en matriz v9; hay 9 tóxicos nominales; hay HMAC/JWT | Que el EXTHTTP actual tenga 76–79; que la matriz se fusione; que el filtro cubra KODIPROP/PHP; que “0 tóxicos” se cumpla en la lista vigente | §2, §3, Anexo A |
| **OTT Navigator 1.7.3.3** | APK A1 (sha `b964c274…`) | **Medio**: gramática `http-h` observada por R2; mapeo del tag y cliente HTTP de media no observados | Que `http-h` acepta JSON con nombres arbitrarios, last-wins, UA/Referer/cookie; que la app contiene OkHttp; que permite cleartext; que R1 observó señales de ExoPlayer2/FFmpeg | Que el tag `#EXTHTTP` se mapee a `http-h`; que use OkHttp para media; que el proveedor acepte cada header; que sea Play-signed (no lo es) | `R2:52-56,412-470,1009-1019`; `R1:81,107,190,257-258` |
| **TiviMate** | **No hay APK** | **Nulo** | Nada de comportamiento de app | Nada de single-value, EXTHTTP, EXTVLCOPT o KODIPROP; solo doctrina interna | `R1:338,471-505`; §2.5 |
| **Disney+** | **No hay APK** | **Nulo** | Nada de headers de app; sí el estándar `Authorization` y la naturaleza de plataforma | Nombres/valores concretos de sus headers; handshake de licencia; reutilización de tokens | `R1:339,426-435`; §5 |
| **Prime Video** | **No hay APK** | **Nulo** | Ídem Disney+ | Ídem Disney+ | `R1:340,426-435`; §5 |

**Conclusión del veredicto:** la matriz es **completa para nuestro stack** y **deliberadamente
incompleta para las apps no disponibles**. Las celdas `N/D` no son un fracaso del análisis:
son el resultado correcto del gate R1 y la única forma de no inventar.

---

## 9. Criterios de aceptación de R4

| # | Criterio del encargo | Estado | Evidencia |
|---:|---|---|---|
| 1 | Nuestro stack con evidencia directa: EXTHTTP, KODIPROP, EXTVLCOPT, matriz 139, 9 tóxicos, 4-layer, reglas por player | **CUMPLIDO** | §2, §3, Anexo A/B |
| 2 | TiviMate/OTT/Disney+/Prime marcados según gate, sin ✓ inventado | **CUMPLIDO** | §1.1, §3, §4, §8 |
| 3 | Headers de plataforma (`Authorization`, `X-Playback-Session-Id`) y por qué replicarlos cae fuera; alternativas lícitas | **CUMPLIDO** | §5, §6 |
| 4 | Tabla comparativa final con columna “fuente de evidencia” por fila | **CUMPLIDO** | §3 (columna final), §8 |
| — | Entregable `docs/REA_HEADERS_MATRIX.md` | **CUMPLIDO** | este archivo |

**Límites honestos de R4**

- No se generó una lista post-fix; no hay medición runtime del EXTHTTP actual. `[no disponible]`
- No se decompiló el parser de headers de OTT; no hay verificación de EXTHTTP en OTT.
  `[no disponible]`
- No hay APK de TiviMate/Disney+/Prime; no hay ADB. `[no disponible]`
- No se analizó ningún handshake de licencia, CDM, Widevine/PlayReady ni HDCP; es fuera de
  alcance por doctrina y ley. `[público]` + `[observado]`.

---

## Anexo A — Comandos y mediciones reproducibles

> Todos los comandos se ejecutaron desde la raíz del workspace
> `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`.
> No ejecutan apps ni tocan red/dispositivo.

### A.1 Conteo de la matriz v9

```powershell
@'
global.window = {};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000000' };
require('./IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/headers-matrix-v9.js');
const m = global.window.HEADERS_MATRIX_V9;
console.log(JSON.stringify(m.getStats()));
for (let l=1;l<=5;l++) console.log('L'+l, Object.keys(m.getHeaders(l,'chrome_desktop_125',{url:'https://example.com/a.m3u8'})).length);
'@ | node -
```

**Salida observada:** `totalHeaders=139`; `L1=15,L2=16,L3=18,L4=25,L5=65`; emitidas
`L1=10,L2=19,L3=32,L4=48,L5=109`; union de nombres = 135. `[observado]`

### A.2 Conteo de categorías/perfiles

```powershell
@'
global.window = {};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { addEventListener: () => {}, dispatchEvent: () => {} };
global.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000000' };
global.CustomEvent = class { constructor(){} };
require('./IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js');
const c = global.window.APE_PROFILES_CONFIG;
console.log('cats', Object.keys(c.getCategories()).length);
let sum=0; for (const cat of Object.values(c.getCategories())) sum += cat.headers.length; console.log('slots', sum);
for (const p of ['P0','P1','P2','P3','P4','P5']) console.log(p, Object.keys(c.getHTTPHeadersJSON(p)).length);
'@ | node -
```

**Salida observada:** 20 categorías, 261 slots; `getHTTPHeadersJSON` = P0 75,
P1–P5 68; P3 generó 86 y eliminó 18. `[observado]`

### A.3 Conteo estático del generador principal

```powershell
@'
const fs=require('fs');
const t=fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js','utf8').split(/\r?\n/);
function keys(a,b){ const s=new Set(); for(const line of t.slice(a-1,b)){ if(/^\s*\/\//.test(line)) continue; const code=line.replace(/\/\/.*$/,''); for(const m of code.matchAll(/['"]([A-Za-z0-9][A-Za-z0-9_-]+)['"]\s*:/g)) s.add(m[1]); } return s; }
const ex=keys(4915,5355), pl=keys(8282,8521);
console.log('build_exthttp', ex.size, 'payload', pl.size, 'union', new Set([...ex,...pl]).size);
'@ | node -
```

**Salida observada:** `build_exthttp=385`, `payload=66`, `union=433` (18 solapadas);
`_httpPayload` tiene 27 `X-APE-*` activas y 5 `Sec-*` condicionales. `[observado]`
**Caveat:** es un conteo de literales del objeto, no una emisión runtime.

### A.4 Artefacto legacy (pre-fix)

```powershell
@'
const fs=require('fs');
const lines=fs.readFileSync('downloaded_list.m3u8','utf8').split(/\r?\n/);
const ex=lines.filter(l=>l.startsWith('#EXTHTTP:'));
console.log('channels', ex.length);
console.log('first keys', Object.keys(JSON.parse(ex[0].slice(9))).length);
const tox=/^(Range|If-None-Match|If-Modified-Since|TE|Priority|Upgrade-Insecure-Requests|Connection|Keep-Alive|Proxy-Connection|Sec-Fetch-.*|Sec-CH-UA.*)$/i;
console.log('toxic/channel', Object.keys(JSON.parse(ex[0].slice(9))).filter(k=>tox.test(k)).length);
'@ | node -
```

**Salida observada:** 2 754 canales; 200 claves por EXTHTTP; **18 tóxicos por canal**;
2 754 tags `#EXT-X-APE-OVERFLOW-HEADERS`; 95 `#EXTVLCOPT` y 54 `#KODIPROP` por canal.
Fecha del archivo: 2026-03-30 (anterior al fix C8 de 2026-05-11). `[observado]`

### A.5 Conteo de `X-APE-*` y ban

```powershell
@'
const fs=require('fs');
const t=fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js','utf8').split(/\r?\n/);
const active=[];
for(const line of t.slice(8281,8522)){ if(/^\s*\/\//.test(line)) continue; const code=line.replace(/\/\/.*$/,''); for(const m of code.matchAll(/['"](X-APE-[A-Za-z0-9_-]+)['"]\s*:/g)) active.push(m[1]); }
console.log([...new Set(active)].length, [...new Set(active)].join(','));
'@ | node -
```

**Salida observada:** 27 `X-APE-*` activas en `_httpPayload`; el ban CA7 solo cubre
`X-APE-Nonce`, `X-APE-SID`, `X-APE-List-Hash`, `X-APE-Timestamp` (`MAIN:8605-8607`).
`[observado]`

### A.6 REA/JADX sobre OTT A1

- `search_android_classes(query="okhttp")` → clases `okhttp3.*` y
  `com.applovin.shadow.okhttp3.*`; evidencia `ev_efa87d…`.
- `trace_android_references(class_name="okhttp3.OkHttpClient")` → 29 using-nodes, incluidas
  clases ofuscadas; evidencia `ev_749c79…`.
- `search_android_classes(query="HttpDataSource" | "ExoPlayer" | "DataSource")` → 0 matches
  top-level; evidencia `ev_4e202a…`, `ev_5f7932…`, `ev_682ff5…`. No se interpreta como
  ausencia de ExoPlayer (R1 ya documentó 369 hits de la cadena en dex).

---

## Anexo B — Índice de fuentes locales

| Código | Archivo | Uso principal |
|---|---|---|
| `MAIN` | [m3u8-typed-arrays-ultimate.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js) | Generador principal |
| `MATRIX` | [headers-matrix-v9.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/headers-matrix-v9.js) | Matriz v9 |
| `PROFILES` | [ape-profiles-config.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js) | Categorías/perfiles |
| `WRAP` | [m3u8-api-wrapper-integrated.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-api-wrapper-integrated.js) | Wrapper/`recommended_headers` |
| `UNIFIED` | [unified-generator-integration.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/unified-generator-integration.js) | Tag `148hdrs` / integración |
| `TESTEXP` | [test_exporter.js](test_exporter.js) | 4-layer/single-value |
| `PLAN` | [2026-04-30-iptv-lista-coherence-fix.md](docs/superpowers/plans/2026-04-30-iptv-lista-coherence-fix.md) | Doctrina single-value |
| `PHPUH` | [universal_headers_engine.php](IPTV_v5.4_MAX_AGGRESSION/frontend/vps/cmaf_engine/modules/universal_headers_engine.php) | Motor PHP secundario |
| `SHIELD` | [shield-location.conf](IPTV_v5.4_MAX_AGGRESSION/vps/nginx/shield-location.conf) | `proxy_pass_request_headers off` |
| `CORS` | [prisma-public-api-locations.conf](IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-public-api-locations.conf) | CORS mixto |
| `CONVIVA` | [prisma-conviva-event.conf](IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-conviva-event.conf) | CORS específico |
| `ARA` | [prisma-ara-dist.conf](IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-ara-dist.conf) | CORS wildcard |
| `RESOLVE` | [resolve.php](IPTV_v5.4_MAX_AGGRESSION/frontend/vps/resolve.php) | HMAC/TOKEN_MODE |
| `JWT` | [ape_jwt_auth.php](IPTV_v5.4_MAX_AGGRESSION/backend/ape_jwt_auth.php) | JWT propio |
| `TG` | [truth_guards.md](docs/manifestos/ape-vps-hevc-crystal-integrator/references/truth_guards.md) | 9 tóxicos/SHIELDED |
| `R1` | [REA_SCOPE_AND_ARTIFACTS.md](docs/REA_SCOPE_AND_ARTIFACTS.md) | Gate/inventario/legal |
| `R2` | [REA_APK_ANALYSIS.md](docs/REA_APK_ANALYSIS.md) | Parser `http-h` de OTT, UA/Referer/cookie, Delta 1.7.3.3 |
| `AGENTS` | [AGENTS.md](AGENTS.md) | Regla legal |

---

## Anexo C — Referencias públicas

1. **RFC 7235 §4.2 — Authorization.** IETF, 2014.
   https://www.rfc-editor.org/rfc/rfc7235.txt — definición vigente en RFC 9110 §11.6.2:
   https://www.rfc-editor.org/rfc/rfc9110.html#section-11.6.2
2. **Apple AVFoundation — `AVURLAsset.httpSessionIdentifier`.**
   “The asset uses this value to set as the `X-Playback-Session-Id` header of HTTP requests
   that it creates.”
   https://developer.apple.com/documentation/avfoundation/avurlasset/httpsessionidentifier
3. **MDN — `Access-Control-Allow-Origin`.**
   El wildcard no es válido con credenciales; allowlist requiere validar `Origin` y añadir
   `Vary: Origin`.
   https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin
4. **RFC 8216 — HTTP Live Streaming.** Los clientes deben ignorar los tags que no reconocen
   (§6.3.1); `#EXTHTTP` no es un tag estándar de HLS, es una extensión de player.
   https://www.rfc-editor.org/rfc/rfc8216
5. **Kodi `inputstream.adaptive` — Integration.**
   `manifest_headers`/`stream_headers` son pares `header=value` separados por `&`; valores
   URL-encoded; en Kodi 21+ `stream_headers` aplica solo a segmentos.
   https://github.com/xbmc/inputstream.adaptive/wiki/Integration
6. **nginx `ngx_http_referer_module` — `valid_referers`.**
   https://nginx.org/en/docs/http/ngx_http_referer_module.html
7. **RFC 2104 — HMAC: Keyed-Hashing for Message Authentication.**
   https://www.rfc-editor.org/rfc/rfc2104

---

## Anexo D — Lo que este documento deliberadamente NO afirma

- **No** afirma que TiviMate soporte `#EXTHTTP`, `#EXTVLCOPT` o `#KODIPROP`; no hay APK.
- **No** afirma que OTT Navigator parsee el **tag** `#EXTHTTP`; sí afirma que su parser
  `http-h` acepta JSON/last-wins (R2) y que el APK contiene OkHttp.
- **No** afirma nombres/valores concretos de headers de Disney+ o Prime Video; no hay APK ni
  captura autorizada, y el eje DRM está fuera de alcance.
- **No** afirma que la matriz v9 de 139 headers llegue al player; el cableado no se encontró.
- **No** afirma que el EXTHTTP actual tenga 76–79 headers; no hay artefacto post-fix.
- **No** afirma que “0 headers tóxicos” se cumpla en la lista vigente; el artefacto legacy
  tiene 18 por canal y KODIPROP/PHP siguen emitiendo `Connection`.
- **No** propone ni analiza handshake de licencias, CDM, Widevine/PlayReady, HDCP ni
  reutilización de tokens de plataformas premium.

> **Caveat final (doctrina del repo):** los anchors de playlist son metadata. La instalación y
> el wake reales requieren una ruta VPS desplegada + host/dispositivo ADB autorizado o un
> runtime de player compatible (`TG:92-96`).
