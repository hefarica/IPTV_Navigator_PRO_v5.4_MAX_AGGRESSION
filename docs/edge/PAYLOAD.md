# E6 · PESO Y ENTREGA DE LA LISTA (FASE 5) — 2026-10-26

> **Estado:** COMPLETO · **cero cambios en el VPS** (solo GET/HEAD + lectura de `/proc`, `/var/log` y `nginx -T`).
> NO se ha tocado `/var/www/lists`, ni la ruta `/lists/`, ni `gzip_static`/`gunzip`, ni un solo `.conf`.
> **Run canónico (pre-HTTP/2):** [`runs/20261026T204034Z/`](../../_vps_stage/edge/e6/runs/20261026T204034Z/payload.json) — 20:40:34 → 20:41:33 UTC
> **Run canónico (post-HTTP/2):** [`runs/20261026T205941Z/`](../../_vps_stage/edge/e6/runs/20261026T205941Z/payload.json) — 20:59:41 → 21:01:0x UTC · **primera pasada post-h2:** [`runs/20261026T205755Z/`](../../_vps_stage/edge/e6/runs/20261026T205755Z/payload.json) · **transición:** [`runs/20261026T205522Z/`](../../_vps_stage/edge/e6/runs/20261026T205522Z/payload.json)
> **Arnés:** [`payload_edge.mjs`](../../_vps_stage/edge/e6/payload_edge.mjs) v1.1.0 + [`probe_vps.sh`](../../_vps_stage/edge/e6/probe_vps.sh) v1.0.0 (read-only, 0 dependencias)
> **VPS:** `ubuntu-2gb-ash-1` (Hetzner Ashburn, 3 vCPU / 3,8 GB) · nginx 1.24.0 (Ubuntu) + `ngx_http_lua_module`
> **Baseline que hereda:** [`BASELINE.md`](BASELINE.md) (E1) · **Propuesta:** [`manifest_microcache_1s.md`](../../_vps_stage/edge/e6/proposals/manifest_microcache_1s.md)

> **Nota de ventana:** la fase 1 (HTTP/2) se aplicó **durante** este trabajo (20:55:20 UTC,
> `default` `71546564…` → `49c162a8…`, `nginx -T` `ddf6a267…` → `0c6c0ea0…`). Por eso hay
> **dos runs canónicos**: uno con ALPN `http/1.1` y otro con ALPN `h2`, medidos con el mismo
> arnés. La matriz A/C/D se midió en ambos; los resultados son idénticos salvo el protocolo y
> el caudal (§8.1). E6 **no** aplicó ese cambio.

Este documento **mide y propone**. No reescribe el catálogo, no cambia la entrega y no
adelanta trabajo de otras fases: la lista se sirve hoy desde el `.gz` con
`gzip_static always` + `gunzip on` y así se queda salvo decisión del propietario.

---

## 1 · Resumen ejecutivo

| # | Hallazgo medido | Severidad | Qué implica |
|---|---|---|---|
| **E6-01** | **La lista pesa ×4,01 según lo que pida el cliente:** 140.555.650 B con `Accept-Encoding: gzip` vs **563.968.332 B** (537,8 MB) sin gzip. Digests verificados: el cuerpo servido en AMBAS rutas es byte-idéntico (`44f5263f…`), igual que `zcat` del `.gz`. Son **10.084.364 líneas**. | **HIGH** | 6 de 8 variantes de `Accept-Encoding` reciben la lista descomprimida. Un cliente con UA `VLC/3.0.24` ya descargó **561.098.813 B** (§9). |
| **E6-02** | **Cada descarga sin gzip cuesta ~2.800 ms de CPU de nginx** (2.770 / 2.830 / 2.880 ms en tres pasadas; **5.270 ms** en la pasada con contención de la fase 1) frente a 270–330 ms con gzip ⇒ **×10,3**. 491 ms por cada 100 MB, en una caja de **3 vCPU**. En loopback: ~2,85 s de pared para 564 MB. | **HIGH** | 3 descargas simultáneas sin gzip saturan los 3 núcleos ~2,8 s y comparten workers con el gateway `/cdn/` (mismo nginx). No medido aún como impacto cruzado (§12-5). |
| **E6-03** | **`Range` funciona… sobre el `.gz`:** `206` con `Content-Range: bytes N-M/140555650` y `Content-Encoding: gzip`; el trozo es **byte-exacto** el del fichero (C10/C11 verificados). **Pero un stream gzip parcial no se puede descomprimir.** Y si el cliente **no** acepta gzip, **el Range se ignora**: `200` + los **563.968.332 B completos**. | **MEDIUM** | Un reproductor que reanude una descarga con Range recibe un gzip truncado (gzip) o la lista entera otra vez (identity). |
| **E6-04** | **`Accept-Ranges: bytes` se anuncia también en la ruta gunzip, donde Range NO se soporta** (C2/C3 → 200 completo), y en la ruta gzip el header sale **duplicado**. Lo pone `add_header Accept-Ranges bytes always` del location, después de que el filtro gunzip lo borre. | **MEDIUM** | Cabecera que miente: invita a un cliente a pedir rangos que el servidor ignora. Es una línea del location `/lists/` (fuera del alcance de E6). |
| **E6-05** | **`multipart/byteranges` con `Content-Encoding: gzip` en el sobre** (C6): el multipart no está comprimido; solo lo están los trozos. Cualquier cliente que honre `Content-Encoding` falla al descomprimir el sobre. | **LOW** | Multi-range es raro en players, pero la declaración es incorrecta. |
| **E6-06** | **ETag/304 correcto en las 12 combinaciones probadas** (fuerte↔débil, cruzadas entre representaciones, `If-Modified-Since`, `If-None-Match: *`): siempre **304 con 0 bytes y sin `Content-Length`** (no hay trampa «304+0 B»). ETag = `"mtime-hex-size-hex"` ⇒ `"6adfb045-860b582"`. | **OK** | Un cliente que revalide ahorra **el 100 %** de los bytes (140 MB o 564 MB) cuando la lista no cambió. Coste del 304: ~1 RTT (24–33 ms loopback / 316–514 ms cliente con TLS). |
| **E6-07** | **Detalles del 304:** el 304 **omite `Vary: Accept-Encoding`** (el 200 sí lo lleva) y devuelve **siempre el ETag fuerte**, aunque el 200 de la ruta gunzip use `W/`. | **LOW** | Solo importaría con una caché compartida delante; hoy **no hay CDN** (DNS → 178.156.147.234 directo). |
| **E6-08** | **HTTP/2 llegó a mitad de E6 (fase 1, 20:55:20Z) y NO es palanca para este peso; con ventanas de flujo por defecto incluso lo empeora.** Pre-h2: ALPN `http/1.1`, `http2.connect` → `ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL`, TTFB p50 **428 ms**, 4 conexiones nuevas 373–403 ms. Post-h2: ALPN **`h2`**, TTFB **204–233 ms desde el stream** (≈500–590 ms desde el dial), 4 streams sobre 1 conexión **422–702 ms** vs 4 conexiones h1 **406–419 ms**, y **caudal h2 con ventana por defecto (64 KiB) 0,42–0,50 MB/s vs 2,9–3,6 MB/s en h1 del mismo run** (⇒ 140 MB en ~5 min); con ventana local 16 MiB sube a **3,7–4,7 MB/s**. La petición de un player son **181 B** (0,00013 % del peso). | **HIGH (para el plan)** | No vender h2 como mejora de peso ni de latencia de la lista: para un cuerpo de 140–564 MB el resultado depende de la **ventana de flujo del cliente**. La aceptación de la fase 1 debe incluir un test de **caudal**, no solo `curl --http2 → 2` (§8.1). |
| **E6-09** | **Micro-caché de manifiesto de 1 s: semánticamente segura en la muestra, pero de techo bajo.** Los manifiestos `/cdn/` medidos son media playlists con `TARGETDURATION` 10–11 s, **sin query/token** en las URIs rebasadas (6 canales, 4 hosts de origen) y cuerpo idéntico a 1 s (cambia a los ~3 s en el canal 5). Del tráfico externo real, solo **19/223 = 8,5 %** de peticiones llegan ≤1 s después de otra con la misma clave; **57/223 = 25,6 % son 502**. | **MEDIUM** | Veredicto: **NO-GO como palanca de latencia**. El techo real está en **≤30 s (120/223 = 53,8 %)**, que es la fase 3, no esta. Diseño y guardas: [propuesta](../../_vps_stage/edge/e6/proposals/manifest_microcache_1s.md). |
| **E6-10** | **El tráfico real ya paga el peso:** en 20,5 h el log sirvió **12.598 MB** de `/lists/`; de ellos **3.656 MB** son descargas externas, con **3 descargas de ~561 MB** (una con UA `VLC/3.0.24`) y **7 peticiones de ~297 MB** del mismo `.m3u8` por el mismo bot cada ~30 min. | **HIGH** | El problema no es teórico ni de laboratorio: ya está en la factura de bytes y de CPU. |

**Una frase:** la lista **pesa 4× de más para quien no negocia gzip**, esa ruta **cuesta 10× de CPU**, el `Range` sobre el `.gz` **devuelve gzip truncado** (o nada de rango en la ruta identity), el **304 es correcto y barato**, **HTTP/2 no mejora este peso y con ventanas pequeñas lo hunde (0,42–0,50 MB/s)**, y la **micro-caché de 1 s no es la palanca** (8,5 % de techo).

---

## 2 · Qué se mide y cómo (arnés reproducible)

[`payload_edge.mjs`](../../_vps_stage/edge/e6/payload_edge.mjs) v1.1.0 (Node ≥18, **0 dependencias**) hace dos cosas:

1. **Sonda del servidor** — ejecuta [`probe_vps.sh`](../../_vps_stage/edge/e6/probe_vps.sh) **en el VPS** por `ssh … 'bash -s' < probe_vps.sh`. La sonda hace **solo** GET/HEAD contra `127.0.0.1:443` con `--resolve` (mismo vhost y TLS reales, sin salir a Internet), lee `/proc/<pid>/stat`, `/var/log`, `nginx -T` y `stat` de los ficheros. **No escribe nada, ni en `/tmp`.**
2. **Medida del cliente** — desde esta máquina (Bogotá ↔ Ashburn): TTFB, primer chunk, 304, Range, caudal acotado (32 MB / 10 s), coste de k conexiones nuevas y sondeo HTTP/2.

**Garantías:** ni una escritura en el VPS; ni un cambio de configuración; el cuerpo de la lista **no se descarga completo desde el cliente** (se aborta tras el primer chunk o al tope de 32 MB/10 s); el peso y el digest **se verifican completos en el loopback** del VPS (B1–B4).

| Bloque | Casos | Qué responde |
|---|---|---|
| **A** | 8 | Negociación: qué cabeceras y qué peso recibe cada `Accept-Encoding` |
| **B** | 4 | Peso y digest REALES de cada representación + **CPU de nginx** por descarga |
| **C** | 11 | `Range` sobre el `.gz`: 206/200, `Content-Range`, y si el trozo es el del fichero |
| **D** | 13 | `ETag` / `If-None-Match` / `If-Modified-Since` → 304 en ambas representaciones |
| **E** | 5 | ALPN/HTTP/2 y tamaño de la petición de un player |
| **cliente** | ~30 | TTFB real, 304 real, Range real, caudal, k conexiones, h2 |

---

## 3 · Hechos de la entrega (config y ficheros, read-only)

| Dato | Valor (run canónico `20261026T204034Z`) |
|---|---|
| `sites-enabled/default` | `715465641c7e97ff…` · 7.095 B (**post-hotfix** `/upload.php`; el baseline E1 lo midió pre-hotfix) |
| `conf.d/50-ape-meta-plane.conf` | `3e29b9280c05de36…` (sin cambios) |
| `snippets/ape-meta-public.conf` | `a39e8de902cf5449…` (sin cambios) |
| `nginx -T` sha256 | `ddf6a267aee7fb66…` · `MainPID=2001835` · `nginx -t` OK |
| `http2` en `listen …443` | **0 ocurrencias** |
| `.m3u8` (stub servible si el `.gz` no aplica) | **8 B**, contenido `#EXTM3U\n` (`234558544d33550a`), sha256 `144659b4…` |
| `.m3u8.gz` | **140.555.650 B**, mtime `2026-10-26T19:55:49Z`, sha256 `a464a0c325a94b3c…` |
| Descomprimido (por `zcat`) | **563.968.332 B = 537,8 MiB**, **10.084.364 líneas**, sha256 `44f5263f78eac14c…` |
| Ratio | **×4,01** |
| `Cache-Control` | `max-age=300` (`expires 5m`) **+** `public, max-age=300` (`add_header`) ⇒ **duplicado** |
| DNS del borde | `iptv-ape.duckdns.org → 178.156.147.234` (sin CDN delante) |

> **Por qué importa el stub de 8 B:** `try_files $uri =404` apunta a `/lists/APE_LISTA_4K.m3u8`, que existe como fichero de 8 B. Cualquier camino que **desactive** `gzip_static` serviría **una lista vacía** (`#EXTM3U`) en vez de la lista real. Hoy no ocurre en ninguna de las variantes medidas (§4, §6), pero es el modo de fallo a vigilar si se toca el location.

---

## 4 · Negociación gzip: qué recibe cada cliente (sonda A, loopback)

| # | `Accept-Encoding` enviado | Status | `Content-Encoding` | `Content-Length` | ETag | Cuerpo con GET |
|---|---|---|---|---|---|---|
| A1 | *(ninguna cabecera)* | 200 | — | — | `W/"6adfb045-860b582"` | **563.968.332 B** `chunked` |
| A2 | `identity` | 200 | — | — | `W/"6adfb045-860b582"` | **563.968.332 B** `chunked` |
| A3 | `gzip` | 200 | **gzip** | **140.555.650** | `"6adfb045-860b582"` | **140.555.650 B** |
| A4 | `gzip, deflate, br, zstd` | 200 | **gzip** | **140.555.650** | `"6adfb045-860b582"` | **140.555.650 B** |
| A5 | `br` (solo brotli) | 200 | — | — | `W/"6adfb045-860b582"` | **563.968.332 B** `chunked` |
| A6 | `gzip;q=0` | 200 | — | — | `W/"6adfb045-860b582"` | **563.968.332 B** `chunked` |
| A7 | `gzip;q=0, identity` | 200 | — | — | `W/"6adfb045-860b582"` | **563.968.332 B** `chunked` |
| A8 | *(ninguna, HTTP/1.0)* | 200 | — | — | `W/"6adfb045-860b582"` | **563.968.332 B** `chunked` |

- **Causa:** `gzip_static always` sirve el `.gz` incluso si el cliente no lo pide; `gunzip on` lo **descomprime** para quien no acepta gzip. Ese es el diseño del location (documentado en el `.conf`) y **funciona**: los digests B3/B4 coinciden con `zcat` del fichero (`44f5263f…`) ⇒ **no corrompe**.
- **Efecto:** 6 de 8 variantes pagan **4,01× bytes**. Un player que no manda `Accept-Encoding` (o manda `br`/`gzip;q=0`) descarga 564 MB.
- `Vary: Accept-Encoding` está presente en el **200** de ambas rutas (correcto).
- En **HEAD** no se emite `Transfer-Encoding`; en **GET** la ruta gunzip responde `Transfer-Encoding: chunked` (C2/C3 y cliente §5).

**Evidencia cruda:** `runs/20261026T204034Z/probe.raw.txt` → casos `A1…A8`.

---

## 5 · Peso real y coste de cada representación (sonda B + cliente §9)

### 5.1 · En el servidor (run canónico pre-h2 `204034`, loopback, cuerpo completo)

| Representación | Bytes servidos | Pared | **CPU nginx** | CPU/100 MB | Digest del cuerpo |
|---|---:|---:|---:|---:|---|
| gzip (`sendfile` del `.gz`) | 140.555.650 | **294 ms** | **270 ms** | **192 ms** | `44f5263f…` (descomprimido) |
| identity (`gunzip` en streaming) | **563.968.332** | **2.810 ms** | **2.770 ms** | **491 ms** | `44f5263f…` (idéntico) |

- **×10,3 de CPU** por descarga completa, en una máquina de **3 vCPU**. 3 clientes sin gzip a la vez ⇒ **~8,3 s de CPU** en ~2,8 s de pared ⇒ **saturación** del nginx que también sirve `/cdn/`.
- El `.gz` con `sendfile` cuesta 270 ms *de syscalls*, no de compresión (el trabajo ya está hecho en disco).
- Los otros dos runs (ensayo y sonda suelta) dieron 330/2.960 ms y 280/2.830 ms ⇒ el orden de magnitud es estable (**×10**).

### 5.2 · En el cliente (run canónico pre-h2 `204034`, Bogotá ↔ Ashburn, muestra acotada + extrapolación)

| Representación | Muestra | Caudal estable | Descarga extrapolada |
|---|---|---:|---|
| gzip (134,0 MiB) | 33,6 MB en 5,2 s (tope por bytes) | **7,0 MB/s** | **≈ 20 s** |
| identity (**537,8 MiB**) | 21,4 MB en 10,0 s (tope por tiempo) | **2,25 MB/s** | **≈ 250 s** |

> **Varianza honesta:** en el run de calibración el mismo test dio gzip 6,36 MB/s (≈21 s) e identity **7,19 MB/s** (≈75 s). El camino Bogotá↔Ashburn varía; lo robusto es el **ratio de bytes (×4,01)** y el orden de magnitud de la CPU del servidor. La extrapolación es lineal y **no** modela congestión (§12-2).
>
> **Abortar ahorra trabajo, pero con sobre-escritura:** el log del arnés registra `body_bytes_sent` de **35,5–37,7 MB** para topes de cliente de 32 MB (buffers del socket) y **~179 KB** para un aborto tras el primer chunk. El coste es proporcional a lo **escrito**, no a lo leído: un cliente que corta a los 21 MB cuesta ~6 % de la descarga completa (~175 ms de CPU), no el 100 %.

**TTFB (conexión nueva, n=3):** gzip p50 **428,0 ms** (371,9–587,0) · identity p50 **407,7 ms** (362,9–493,1) · `tls_ms` p50 225–261 ms. **Suelo keep-alive:** 96,3 / 100,7 ms en las muestras reutilizadas (la 1.ª abre conexión: 329 ms). Es el mismo suelo de ~100 ms que fijó E1.

---

## 6 · `Range` sobre el `.gz` (sonda C, verificada byte a byte)

| Caso | Petición | Respuesta | `Content-Range` | Bytes | ¿Correcto? |
|---|---|---|---|---|---|
| C1 | `bytes=0-1023` + gzip | **206** | `bytes 0-1023/140555650` | 1.024 | ✅ trozo del `.gz` |
| C2 | `bytes=0-1023` + identity | **200** | — | **563.968.332** | ⚠️ Range **ignorado**, cuerpo completo |
| C3 | `bytes=0-1023` sin AE | **200** | — | **563.968.332** | ⚠️ ídem |
| C4 | `bytes=100000000-100000999` + gzip | **206** | `bytes 100000000-100000999/140555650` | 1.000 | ✅ trozo del `.gz` |
| C5 | `bytes=-1024` (sufijo) + gzip | **206** | `bytes 140554626-140555649/140555650` | 1.024 | ✅ trozo del `.gz` |
| C6 | `bytes=0-99,200-299` + gzip | **206** | — | 451 | ⚠️ `multipart/byteranges` **con `Content-Encoding: gzip`** |
| C7 | `bytes=0-1023` + `If-Range` ETag correcto | **206** | `bytes 0-1023/140555650` | 1.024 | ✅ |
| C8 | `bytes=0-1023` + `If-Range` ETag ajeno | **200** | — | **140.555.650** | ✅ (Range ignorado a propósito) |
| C9 | `HEAD` + Range + gzip | **206** | `bytes 0-1023/140555650` | 0 | ✅ |

**Verificación de contenido (no solo cabeceras):**
`C10` (Range 0-1023) → sha256 `fb9538dc…` **==** `head -c 1024` del `.gz`.
`C11` (Range 100.000.000-100.000.999) → sha256 `fe8a1469…` **==** `tail -c +100000001 | head -c 1000` del `.gz`.
⇒ el mecanismo de rangos es **exacto**, pero **el objeto ranurado es el gzip comprimido**, no la lista.

**Consecuencias prácticas (para players, sin cambiar nada):**
1. Un player que **reanude** la lista con `Range` sobre la ruta gzip obtendrá un **stream gzip truncado** ⇒ no se puede descomponer.
2. Un player que reanude **sin** gzip obtendrá **200 + 564 MB** otra vez (el Range se ignora): no reanuda, **re-descarga**.
3. No usar `Range` en esta URL; si algún día se quiere descarga reanudable, hay que decidir explícitamente entre *identity ranges* o desactivar `gzip_static` para rangos — **fuera del alcance de E6** (§11).

---

## 7 · `ETag` / `If-None-Match` → 304 (sonda D + cliente §7)

**ETag = `"<hex mtime>-<hex size>"`** ⇒ `0x6adfb045` = `1.793.044.549` (mtime del `.gz`) y `0x860b582` = **140.555.650** (tamaño). Se regenera la lista ⇒ cambia el ETag ⇒ el 304 deja de ser posible (correcto).

| Caso | Petición | Respuesta | ETag devuelto | `Content-Length` | `Content-Encoding` |
|---|---|---|---|---|---|
| D1 | gzip + INM **fuerte** (el suyo) | **304** | `"6adfb045-860b582"` | — | — |
| D2 | gzip + INM **débil** | **304** | `"6adfb045-860b582"` | — | — |
| D3 | identity + INM **débil** (el suyo) | **304** | `"6adfb045-860b582"` | — | — |
| D4 | identity + INM **fuerte cruzado** | **304** | `"6adfb045-860b582"` | — | — |
| D5 | sin AE + INM fuerte cruzado | **304** | `"6adfb045-860b582"` | — | — |
| D6 | gzip + `If-None-Match: *` | **304** | `"6adfb045-860b582"` | — | — |
| D7 | gzip + INM **ajeno** | **200** | `"6adfb045-860b582"` | 140.555.650 | gzip |
| D8 | sin AE + `If-Modified-Since` = Last-Modified | **304** | `"6adfb045-860b582"` | — | — |
| D9 | gzip + IMS | **304** | `"6adfb045-860b582"` | — | — |
| D10 | `HEAD` gzip + INM fuerte | **304** | `"6adfb045-860b582"` | — | — |
| D11 | `HEAD` identity + INM débil | **304** | `"6adfb045-860b582"` | — | — |
| D12 | gzip + INM + IMS | **304** | `"6adfb045-860b582"` | — | — |
| D13 | Range + INM fuerte + If-Range | **304** | `"6adfb045-860b582"` | — | — |

- **12/12** variantes con validador propio o cruzado devuelven **304 con 0 bytes**. Con ETag ajeno → **200** (correcto).
- **No hay trampa «304 + 0 B»**: el 304 **no** lleva `Content-Length` (nginx lo limpia). El caso tóxico de la doctrina es hacia el **proveedor**; aquí el cliente pregunta al VPS por un fichero estático y la respuesta es la canónica.
- **Coste del 304:** 24–33 ms loopback; **316–514 ms** desde el cliente con conexión nueva (TLS incluido) y **0 bytes**. Es el mejor «ahorro» medido de toda la fase: **140 MB o 564 MB → 0**.
- **Dos imperfecciones (E6-07):** el 304 **no** incluye `Vary: Accept-Encoding` (el 200 sí) y devuelve **siempre** el ETag fuerte, aunque el 200 gunzip use `W/`. Sin CDN delante, impacto práctico nulo; se documenta por si mañana se pone una caché compartida.
- `Cache-Control: max-age=300` hace que el cliente **no** revalide hasta 5 min; el 304 solo ayuda a partir de ahí. No se cambia (es una decisión de producto: «que los players re-descarguen periódicamente»).

---

## 8 · HTTP/2: qué se midió y qué no (sin inventar)

**Estado PRE-h2 (run canónico `204034`, antes de la fase 1):** `listen 443 ssl` sin `http2`; `H2_LISTEN_COUNT=0`; ALPN `[h2,http/1.1]` → **`http/1.1`**; `http2.connect` estricto → **`ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL`**; `curl --http2` **del VPS** → `http_version=1.1`. El estado **post-h2** (ya con la fase 1 aplicada) está en §8.1.

**Lo que se puede cuantificar con el borde en h1 (medido):**

| Medición | Valor | Lectura |
|---|---|---|
| TTFB h1 conexión nueva (gzip) | p50 **428,0 ms** (n=3) | 2 RTT de setup (~225–260 ms TLS) + ~1 RTT de respuesta |
| TTFB h1 conexión nueva (identity) | p50 **407,7 ms** | idéntico dentro del ruido ⇒ **el peso no cambia el TTFB**, solo la duración |
| Suelo keep-alive | **96,3 / 100,7 ms** | 1 RTT Bogotá↔Ashburn |
| 1 conexión nueva vs **4 simultáneas** | **372 ms** vs **402,9 ms** | abrir 4 no multiplica la pared (paralelizan), pero son **4 handshakes TLS** |
| Petición de un player (UA + `Accept-Encoding`) | **181 B** | 0,00013 % de 140 MB; HPACK ahorraría ~100 B |

**Conclusión honesta:** para **este** recurso (una sola transferencia grande), HTTP/2 **no reduce el peso ni el TTFB** de forma medible: aporta **1 conexión en vez de k** y compresión de cabeceras (irrelevante frente a 140 MB). Su valor real está en el **abanico de objetos pequeños** (`/cdn/` manifiestos, EPG, logos) y en la CPU/handshakes del servidor. Cualquier promesa de mejora de la lista por h2 sería falsa.

### 8.1 · HTTP/2 medido DESPUÉS de la fase 1 (20:55:20Z)

La fase 1 se aplicó durante E6: `listen 443 ssl http2` (×2), `default` `71546564…` → **`49c162a8…`**, `nginx -T` `ddf6a267…` → `0c6c0ea0…`. E6 **no** aplicó ese cambio; solo lo midió antes y después con el mismo arnés (`runs/20261026T205755Z` y `runs/20261026T205941Z`; en el segundo, **30 de 41** casos de la sonda salieron por h2 — A8 y E4 fuerzan h1 a propósito).

| Medición | Pre-h2 (h1) | Post-h2 |
|---|---|---|
| ALPN negociado | `http/1.1` | **`h2`** |
| TTFB de la lista (desde el *stream*, TLS aparte) | — | **204–233 ms** |
| TTFB de la lista (desde el *dial*, TLS incluido) | **428 ms** p50 | **500–590 ms** |
| Caudal gzip, **ventana por defecto (64 KiB)** | — | **0,42–0,50 MB/s** (5,2 MB en 10,4 s) |
| Caudal gzip, **ventana local 16 MiB** | — | **3,7–4,7 MB/s** |
| Caudal h1 en el mismo run | 2,9–7,0 MB/s | 2,9–3,6 MB/s |
| 4 recursos concurrentes | **373–403 ms** con 4 conexiones | **422–702 ms** con 1 conexión (streams de 95–110 ms) |
| Matriz A/C/D (negociación, Range, 304) | 206/304/`Content-Range`/ETag | **idéntica** (30 casos) |
| Petición de un player | 181 B | 181 B (HPACK ahorra ~100 B de 140 MB) |

**Interpretación (medida, no teoría):**
1. **El TTFB no mejora**: para *una* transferencia h2 paga el mismo TLS; solo ahorra handshakes cuando hay **varias** conexiones.
2. **El caudal puede empeorar mucho.** HTTP/2 está limitado por la **ventana de flujo** (65.535 B por defecto por stream y por conexión). Con RTT ~100 ms el techo teórico es ~655 KB/s; medido **0,42–0,50 MB/s**. A ese ritmo, los 140 MB de la lista tardan **≈5 min** y los 564 MB de la ruta identity **≈19 min** (extrapolación lineal). Con la ventana local subida a 16 MiB: **3,7–4,7 MB/s** ⇒ el límite es **del cliente**, no del servidor.
3. **4 streams por h2 no ganan en pared a 4 conexiones h1** (422–702 vs 406–419 ms): el `connect` único pesa más que 4 handshakes en paralelo. La multiplexación sí se ve dentro de la sesión: los 4 HEAD salen en **95–110 ms** (≈1 RTT).
4. **La semántica no cambia** con h2: los mismos `206` con `Content-Range: bytes N-M/140555650`, los mismos `304` sin cuerpo, el mismo `Vary` en el 200 y la misma ausencia de `Transfer-Encoding` (correcta en h2).

**Riesgo para la fase 1 y recomendación:**
1. La aceptación de la fase 1 debe incluir un **test de caudal con un cliente de ventana por defecto**, no solo `curl --http2 → http_version=2`.
2. **Medir un player real** (VLC/TiviMate/ExoPlayer) contra 443/h2 antes de cerrar la fase: si su stack usa ventanas pequeñas, descargar el listado puede tardar minutos.
3. Si aparece ese síntoma, el rollback de la fase 1 (quitar `http2` del `listen`) sigue siendo la salida.
4. **Transitorio de reload observado:** en el run de transición (`205522`, 20:55:22Z) los **primeros 8** casos de la sonda salieron `HTTP/1.1` porque el reload de la fase 1 estaba ocurriendo durante la sonda; 2,5 min después (`205755`, 20:57:55Z) solo A8/E4 salieron h1. ⇒ Al verificar un reload, **repetir la prueba unos segundos después** o puede parecer que no se aplicó.

---

## 9 · Tráfico real observado (`/var/log/nginx/playlist_access.log`)

**Ventana del snapshot:** 2026-10-26 00:03:06 → **20:37:04 UTC** (13.688 líneas). Las filas agregadas marcadas «real» excluyen las peticiones de `127.0.0.1` (sondas), las del arnés (`UA edge-fluidez-*`), las de `178.156.147.234` (el propio VPS) y las de `181.130.154.235` (host de medida/auditorías previas); las filas por descarga salen del log **completo** y así se indica.

| Métrica | Valor |
|---|---|
| `/lists/` (todas) | 86 peticiones: 81×200, 3×404, 1×400, **1×206** |
| Bytes totales servidos de `/lists/` | **13.210.229.491 B ≈ 12.598 MB** en 20,5 h |
| `/lists/` «real» (sin sondas ni hosts de medida) | **3.834.348.556 B ≈ 3.656 MB** |
| Descargas **identity** completas o grandes | `APE-audit/1.0` → 561.096.490 B (08:28:19Z) · `VLC/3.0.24` → **561.098.813 B** (08:33:05Z) · `curl/8.16.0` → 561.098.323 B (08:39:32Z) · `178.156.147.234` → 3 × ~504,8 MB (05:46–05:48Z) |
| Descargas **gzip** completas (sin contar las del arnés) | 2 × **140.555.650 B** (20:13Z y 20:22Z, anteriores a los runs de E6) |
| Bot recurrente | `146.70.86.222` → **7 peticiones** del mismo `APE_LISTA_1792869328847.m3u8` cada ~30 min (02:05→04:45Z), **6 × 297.134.088 B** + **1 × 235.019.533 B** servidos |
| `/cdn/` externo (sin loopback, sin IP del VPS, sin host de medida) | **223** peticiones → **161×200**, **57×502 (25,6 %)**, **5×407** |
| Intervalo entre peticiones de la **misma** clave `/cdn/` | ≤1 s: **19 (8,5 %)** · 1–5 s: 15 · 5–30 s: **86** · >30 s: 10 |

**Lectura:**
1. **El peso ya se paga en producción**: 3 descargas de ~561 MB y 7 de ~297 MB en 20,5 h. No es un escenario: es el log.
2. El **25,6 % de 502** en `/cdn/` externo es el problema de QoE dominante — muy por encima de cualquier caché (§10). Debe atacarse en la fase 3/6, no aquí.
3. La cadencia de sondeo de los consumidores es **5–30 s** (86 de 223), no ≤1 s: una caché de 1 s casi nunca tendría el cuerpo caliente.

---

## 10 · Micro-caché de manifiesto (1 s por host+path+args): veredicto

**¿Altera la semántica live?** En la muestra medida, **no de forma peligrosa**:
- Las media playlists de `/cdn/` tienen **`TARGETDURATION` 10–11 s** y 3–6 segmentos; 1 s de estaleness es ≤10 % del intervalo de sondeo del player.
- Las URIs rebasadas **no llevan query ni token** (6 canales, 4 hosts de origen distintos: `185.227.34.195`, `185.227.34.188`, `43.250.127.10`, `31.56.41.3`) ⇒ **no se reutilizan tokens de otra petición**.
- El cuerpo es **idéntico a 1 s** y cambia a los ~3 s (canal 5: `MEDIA-SEQUENCE` 120→121 a t+3 s) ⇒ una entrada de 1 s devuelve, como mucho, lo que el proveedor ya servía.

**¿Sirve como palanca?** **No.** Techo medido: **8,5 %** de las peticiones externas (19/223) llegan ≤1 s después de otra con la misma clave; el ahorro por acierto sería el fetch al proveedor (~690–750 ms). Media ponderada: **≈60 ms** sobre el agregado, con un 25,6 % de peticiones que son **502 y jamás deben cachearse**. El techo real está en **≤30 s (120/223 = 53,8 %)** — eso es la **fase 3** (caché del destino del 302), no esta.

**Veredicto:** **NO-GO** para la micro-caché de 1 s como mejora de latencia. Si el capitán decide implementarla por otra razón (p. ej. amortiguar ráfagas), el diseño menos invasivo y con guardas está en
[`proposals/manifest_microcache_1s.md`](../../_vps_stage/edge/e6/proposals/manifest_microcache_1s.md) (caché en `ngx.shared` dentro del gateway, **no** `proxy_cache`: evita replesar `X-APE-Upstream-Ms` y no deja credenciales en disco).

---

## 11 · Prohibiciones respetadas y condiciones para cambiar algo

**No se ha tocado** (ni se propone tocar en E6):

- `/var/www/lists` y la ruta `/lists/` (ni su `location`, ni `try_files`, ni `add_header`).
- `gzip_static also/always`, `gunzip on`, `gzip_vary`, `output_buffers` del location.
- La regla `.ts|.m4s|.mp4 → 404`, `resolve.php`/`origins.php`, `ngx.exit(503)`, cualquier circuit breaker.
- `proxy_cache_valid 302` sigue siendo **0**: la propuesta de caché **no** cachea redirecciones.

**Si alguna fase futura quiere cambiar la entrega de la lista**, los candidatos que ESTA medición deja sobre la mesa (ninguno aplicado, todos requieren ventana §4 + backup + `nginx -t` + rollback probado):

| Candidato | Efecto medido esperado | Riesgo |
|---|---|---|
| Quitar `add_header Accept-Ranges bytes always` del location `/lists/` | Deja de mentir en la ruta gunzip; el 206 gzip ya emite su propio `Accept-Ranges` | Nulo funcional; una línea; el 206 seguiría igual |
| Honrar `Range` también en la ruta gunzip, o documentar que no se soporta | Evita la re-descarga silenciosa de 564 MB cuando un cliente cree que reanuda | Toca la ruta `/lists/` ⇒ **decisión del propietario** |
| Caché del destino del 302 (30–60 s) | Techo 53,8 % de peticiones; −~700 ms por acierto | Token/estaleness; **fase 3**, no E6 |
| Micro-caché 1 s de manifiesto | Techo 8,5 %; −~700 ms por acierto | Bajo, pero payoff pequeño (§10) |

---

## 12 · Límites y honestidad (lo que este informe **no** prueba)

1. **N pequeño** en cliente: 3 muestras por representación; p95 = máximo. Es una línea base, no un IC.
2. **Varianza del camino** Bogotá↔Ashburn: el caudal h1 medido osciló **2,9–7,0 MB/s** entre pasadas (identity 2,25–7,19 MB/s). La extrapolación de descarga es **lineal** y no modela congestión ni pérdida.
3. **No se descargó la lista completa desde el cliente** (serían 140 MB/564 MB por muestra). El peso y el digest se verifican **completos en loopback**; el cliente solo hace lecturas acotadas.
4. **CPU medida con `/proc/<pid>/stat`** del árbol nginx (workers + cache manager/loader) en `CLK_TCK=100` ⇒ resolución 10 ms; es CPU de **proceso**, no de sistema total. En la pasada `205941` la CPU salió **inflada** (gzip 510 ms / identity 5.270 ms) por la contención de la verificación de la fase 1 en curso ⇒ se reporta como techo, no como valor típico (~2,8 s).
5. **No se midió el impacto cruzado** de una descarga sin gzip sobre el TTFB de `/cdn/` (mismo nginx). Es aritmética de CPU (~2,8 s por descarga en 3 vCPU), no una medición de contención; requeriría una ventana controlada.
6. **La muestra de manifiestos es de 6 canales** (de ~2.700). Todos comparten formato y host del proveedor, pero **no se censó la lista entera**; si un canal sirviera URIs con token, la propuesta de caché necesitaría un guard adicional.
7. **El log es una ventana de 20,5 h** y las IPs de medida (`127.0.0.1`, `178.156.147.234`, `181.130.154.235`) se excluyen de las cifras «reales»; las cifras «todas» se dan aparte para que se pueda re-derivar.
8. **HTTP/2 se midió solo con dos clientes**: `curl 8.5.0` (VPS, loopback) y Node `http2` (cliente, con ventana por defecto y con 16 MiB). **No** se midió un player real (VLC/TiviMate/ExoPlayer) sobre h2: el riesgo de caudal de §8.1 está medido en el cliente Node, no en esos players.
9. **El path del `.m3u8` puede cambiar** si el propietario regenera con otro nombre; el arnés fija `/lists/APE_LISTA_4K.m3u8` (el vivo hoy).

---

## 13 · Reproducción exacta

```bash
# 1 · arnés completo (sonda servidor + medidas cliente). Read-only.
node _vps_stage/edge/e6/payload_edge.mjs --label "E6"

# 2 · solo cliente, reutilizando la última sonda del servidor
node _vps_stage/edge/e6/payload_edge.mjs --skip-probe --label "E6-cliente"

# 3 · re-derivar los hechos del servidor desde un raw ya capturado (0 tráfico)
node _vps_stage/edge/e6/payload_edge.mjs --rebuild _vps_stage/edge/e6/runs/<STAMP>

# salida nueva en:
#   _vps_stage/edge/e6/runs/<STAMP_UTC>/payload.json
#   _vps_stage/edge/e6/runs/<STAMP_UTC>/payload.log
#   _vps_stage/edge/e6/runs/<STAMP_UTC>/probe.raw.txt
# y copia en runs/latest.json
```

`EDGE_SSH` cambia el destino SSH (default `root@178.156.147.234`). Los parámetros (rutas,
topes de 32 MB/10 s, k=4) están congelados en el script; cambiarlos exige nueva versión y
actualizar este documento.

---

## 14 · Evidencia (rutas y hashes)

| Artefacto | Ruta | sha256 (16) / nota |
|---|---|---|
| Arnés | [`payload_edge.mjs`](../../_vps_stage/edge/e6/payload_edge.mjs) | `9d41cd65c2991693…` · **v1.1.0** (46.897 B) |
| Sonda servidor | [`probe_vps.sh`](../../_vps_stage/edge/e6/probe_vps.sh) | `e0e3445d4cd3aa1f…` · v1.0.0 · read-only |
| **Run canónico pre-h2 (JSON)** | [`runs/20261026T204034Z/payload.json`](../../_vps_stage/edge/e6/runs/20261026T204034Z/payload.json) | 29.185 B · `c4f7450306a22e5d…` |
| Run canónico pre-h2 (log) | [`runs/20261026T204034Z/payload.log`](../../_vps_stage/edge/e6/runs/20261026T204034Z/payload.log) | `4c0c66d5ab17e1b0…` |
| Sonda cruda pre-h2 | [`runs/20261026T204034Z/probe.raw.txt`](../../_vps_stage/edge/e6/runs/20261026T204034Z/probe.raw.txt) | 31.823 B · 41 casos · `f4b5307582154060…` |
| **Run canónico post-h2 (JSON)** | [`runs/20261026T205941Z/payload.json`](../../_vps_stage/edge/e6/runs/20261026T205941Z/payload.json) | 34.462 B · `a544449d2b1f2995…` |
| Sonda cruda post-h2 | [`runs/20261026T205941Z/probe.raw.txt`](../../_vps_stage/edge/e6/runs/20261026T205941Z/probe.raw.txt) | 30.709 B · h2=30 / h1.1=2 · `d61844f9dabd1252…` |
| Primera pasada post-h2 | [`runs/20261026T205755Z/payload.json`](../../_vps_stage/edge/e6/runs/20261026T205755Z/payload.json) | 34.470 B · `1f33060bd2c2fb03…` · h2=30/h1.1=2 · caudal h2 0,42 / 3,69 MB/s |
| Run de **transición** (reload a mitad) | [`runs/20261026T205522Z/payload.json`](../../_vps_stage/edge/e6/runs/20261026T205522Z/payload.json) | 32.991 B · `26d429168d431a6c…` · 8 casos h1 por el reload en curso |
| Ensayo de calibración | [`runs/20261026T203833Z/`](../../_vps_stage/edge/e6/runs/20261026T203833Z/payload.json) | 1.ª pasada (parser v1.0.0); se conserva por trazabilidad |
| Sonda suelta previa | [`runs/20261026T203552Z/probe.raw.txt`](../../_vps_stage/edge/e6/runs/20261026T203552Z/probe.raw.txt) | 1.ª sonda manual (misma config, CPU 280/2.830 ms) |
| Propuesta micro-caché | [`proposals/manifest_microcache_1s.md`](../../_vps_stage/edge/e6/proposals/manifest_microcache_1s.md) | 9.286 B · `1f369ea863e9c0c6…` · diseño + guardas + rollback |
| Arnés E1 (baseline) | [`../edge/baseline/baseline_edge.mjs`](../../_vps_stage/edge/baseline/baseline_edge.mjs) | `423e260dcbf3adfb…` · sin cambios |

**Entorno de medida (cliente):** Windows, Node v24.12.0, OpenSSH de Windows, RTT ~100 ms a Ashburn.
