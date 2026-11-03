# E9 · VERIFICACIÓN INDEPENDIENTE DE LA CAPA EDGE (FASE 0 → FASE 1 + hotfixes)

> **Estado:** COMPLETO · **verificador independiente** (no firma el trabajo que verifica).
> **Ventana de medida (UTC):** 2026-10-26 21:36:12 → 22:01:04 · Bogotá 16:36 → 17:01.
> **VPS:** `ubuntu-2gb-ash-1` (Hetzner Ashburn) · nginx 1.24.0 (Ubuntu) + `ngx_http_lua_module` · kernel 6.8.0-124.
> **Regla de este documento:** ni un número heredado de un informe sin re-medirlo o re-hashearlo.
> Cuando un dato es una **cita** ajena, se marca `[cita]` y se dice quién lo midió; cuando es **mío**, se
> dice con qué comando y en qué fichero está el volcado.

---

## 0 · Veredicto en una línea

| Pregunta del encargo | Respuesta verificada |
|---|---|
| ¿HTTP/2 quedó **negociado** (no solo habilitado)? | **SÍ** — ALPN `h2` y `curl --http2` = `2`; el baseline negociaba `http/1.1`. **PASS** |
| ¿La fase 1 movió algo más que `listen`? | **NO** — `diff` del `nginx -T` renderizado contra el backup pre-fase: **4 líneas** (2 `-` / 2 `+`), solo las 2 `listen`. |
| ¿Se tocó algún invariante prohibido? | **NO** — hashes de listas, `/lists/`, PHP del resolver, `origins.php`, `gzip_static`/`gunzip`/CORS y reglas `.ts→404`: idénticos o sin cambios. |
| ¿`CODECS=` cambió en alguna variante emitida? | **No** — misma lista byte a byte (digest `44f5263f…`) y en `/cdn/` no se emite ninguna declaración. |
| ¿El fallo intermitente de `/cdn/` empeoró? | **NO** — censo propio: **111×502 antes → 0×502 después**; no-200 después = 0,65 %, las 4 son sondas deliberadas. |
| ¿El rollback está **probado** (no en dry-run)? | **SÍ** — OFF real con `nginx -t` + reload + medida, y ON re-aplicado y verificado. Ver §9. |
| ¿El hotfix `/upload.php → 403` sobrevivió al rollback? | **SÍ** — GET y POST → **403** en estado OFF, en estado ON y al cierre. |
| ¿`error_ratio` está corregido? | **La fórmula honesta se demuestra** (`fallos/(éxitos+fallos)`) y se publica el valor del baseline y del después; **el arreglo del endpoint está staged, no desplegado** (Δ funcional VPS = 0). |
| ¿La observabilidad (fase 6) está en producción? | **NO** — staged por E7; este documento no la cuenta como desplegada. |

---

## 1 · Método: qué se reejecutó y con qué

| Instrumento | Qué hace | Dónde está | Volcado de esta verificación |
|---|---|---|---|
| `baseline_edge.mjs` **v1.0.1** (el arnés de t1, **sin modificar**) | lista h1/h2, `/cdn/` cliente+loopback, hops, bytes, `error_ratio`, `nginx -T` | `_vps_stage/edge/baseline/baseline_edge.mjs` | `_vps_stage/edge/baseline/runs/20261026T213708Z/` |
| `e9_invariants.sh` (nuevo) | hashes, greps de invariantes, `diff` del `nginx -T`, ALPN, sondas de seguridad, CODECS | `_vps_stage/edge/tests/e9_invariants.sh` | `_vps_stage/edge/tests/runs/20261026T213612Z/invariants.log` |
| `e9_cdn_census.sh` (nuevo) | censo del log de nginx, **mismo parser** a ambos lados del hotfix | `_vps_stage/edge/tests/e9_cdn_census.sh` | `…/runs/20261026T213612Z/cdn_census.log` |
| `e9_cdn_campaign.sh` (nuevo) | campaña de ≥100 peticiones a 3 canales (443 y 8088) | `_vps_stage/edge/tests/e9_cdn_campaign.sh` | `…/cdn_campaign_after.log` |
| `e9_h2_list.mjs` (nuevo) | TTFB de la lista por h2 con n=10 (sesión) y n=5 (nueva) + h1 n=5 | `_vps_stage/edge/tests/e9_h2_list.mjs` | `…/h2_list_after.json` |
| `e9_rollback.sh` (nuevo) | rollback OFF → medida → ON, con `nginx -t` y recuperación automática | `_vps_stage/edge/tests/e9_rollback.sh` | `…/rollback_off.log`, `…/rollback_on.log` |
| `e9_compare.mjs` (nuevo) | tabula los `baseline.json` con el mismo esquema | `_vps_stage/edge/tests/e9_compare.mjs` | tabla de §3 |

**Guardas de seguridad del propio verificador:** ninguna escritura en `/var/www/lists`, `/lists/`, PHP ni Lua; el
único cambio aplicado es el `default` de nginx **durante el rollback** y se deja **exactamente** como estaba
(`49c162a8…`). Todos los backups previos quedan intactos. El `diff` de §6.1 demuestra que, entre el estado
pre-fase-1 y el cierre, la configuración renderizada solo cambió en las 2 líneas `listen`.

---

## 2 · Estado medido al cierre (hechos, no prosa)

| Dato | Valor | Fuente |
|---|---|---|
| `nginx -t` | **OK** | `invariants.log` |
| `MainPID` / `NRestarts` | `2001835` / `0` (activo desde 2026-10-25 23:35:04 UTC) | idem |
| `nginx -T` sha256 | `0c6c0ea0090e7dd7defb0845763e4eb050ed21dfc70953e987cfd9d9b3813d1c` | idem |
| `default` | 7.828 B · `49c162a862f1e5485959350f2b2175f24eec440a10d2cd6902b2e0e03f8c59d1` | idem |
| `http2` en `listen … 443` | **2** (IPv4 + IPv6), de 2 `listen 443` totales | idem |
| ALPN (SNI real → 127.0.0.1) | **h2** | idem |
| Ficheros Lua en `/etc/nginx/lua/` | 14 · digest de directorio `743ecac43325cf68…` | idem |

---

## 3 · ANTES / DESPUÉS con el **mismo** arnés (números crudos)

Ejecuciones del **mismo** `baseline_edge.mjs` v1.0.1 (parámetros congelados: N lista 5+5, `/cdn/` 3+3 por
canal en ids 3/5/6, doble hop 7, timeout 20 s; p95 = máximo con N pequeño). En esta tabla: el **ANTES**
canónico de E1 (no re-ejecutable: ese estado ya no existe) y el post-fase de edge-sre `[cita]`, más el
**DESPUÉS medido por mí**; el **ROLLBACK** y el **estado final** están en §3.2, medidos con el mismo arnés.

| métrica | **ANTES** `20261026T202041Z` (E1-FASE0) | DESPUÉS post-fase `20261026T205347Z` `[cita edge-sre]` | **DESPUÉS verificado por mí** `20261026T213708Z` |
|---|---:|---:|---:|
| `default` sha256 | `58bee1cb7b911bc1…` | `49c162a862f1e548…` | `49c162a862f1e548…` |
| `nginx -T` sha256 | `64482e7d9014473e…` | `0c6c0ea0090e7dd7…` | `0c6c0ea0090e7dd7…` |
| `http2` en `listen 443` | **0** | 2 | **2** |
| **ALPN negociado** | **http/1.1** | **h2** | **h2** |
| `http2.connect` estricto | **NO NEGOCIADO** (`ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL`) | OK 200 | **OK 200** (ttfb 117,2 ms) |
| `curl(VPS) --http2` | `1.1` | `2` | **`2`** (200) |
| `curl(VPS) --http1.1` | `1.1` | `1.1` | `1.1` (200) |
| lista h1 conexión nueva **p50** | **427,5 ms** | 439,6 ms | **499,0 ms** |
| lista h1 conexión nueva **p95** | **747,4 ms** | 827,9 ms | **713,3 ms** |
| lista h1 keep-alive **p50** | **110,6 ms** | 171,1 ms | **122,0 ms** |
| `/cdn/` ch3 cliente **p50** | **1.083,5 ms** | 1.172,5 ms | **1.226,0 ms** |
| `/cdn/` ch5 cliente **p50** | **1.159,6 ms** | 1.296,6 ms | **1.105,0 ms** |
| `/cdn/` ch6 cliente **p50** | **1.136,2 ms** | 972,2 ms | **1.120,0 ms** |
| `/cdn/` ch3/5/6 cliente **p95** | **1.106,0 / 1.168,9 / 1.306,5 ms** | 1.258,3 / 1.390,8 / 1.257,7 ms | **1.230,4 / 1.139,6 / 1.220,7 ms** |
| `/cdn/` loopback ch3/5/6 **p50** | 838,1 / 729,5 / 747,2 ms | 748,9 / 823,5 / 700,0 ms | **726,2 / 714,0 / 674,6 ms** |
| **`X-APE-Upstream-Ms` client p50** ch3/5/6 | **704 / 732 / 750 ms** | 859 / 816 / 673 ms | **785 / 719 / 639 ms** |
| `X-APE-Upstream-Ms` loopback p50 ch3/5/6 | 787 / 691 / 713 ms | 698 / 791 / 671 ms | **688 / 679 / 642 ms** |
| **bytes** ch3/5/6 | 635 / 637 / 646 | 644 / 637 / 646 | **642 / 638 / 646** |
| **hops** lista / `/cdn/` | **1 / 4** | 1 / 4 | **1 / 4** |
| overhead doble hop 443→8088 p50 | 0,1 ms | 0 ms | **0 ms** |
| lista bytes declarados (gzip) | 140.555.650 | 140.555.650 | **140.555.650** |
| `X-APE-URI-Rebased` ch3/5/6 | 6 / 6 / 6 | 6 / 6 / 6 | **6 / 6 / 6** |
| `X-APE-UHD` ch3/5/6 | off / off / off | off / off / off | **off / off / off** |
| `/cdn/` status (9 muestras) | 200 ×9 | 200 ×9 | **200 ×9** |
| `error_ratio` **publicado (viejo)** | 0,2637 → 0,2202 | 0,1735 → 0,1623 | **0,1173 → 0,1151** |
| `error_ratio` **honesto** = fallos/(éxitos+fallos) | **0,2087 → 0,1805** | 0,1479 → 0,1397 | **0,1050 → 0,1032** |
| contadores acumulados (req/fallos) | 109 / 24 | 807 / 131 | **1.164 / 134** |
| `MainPID` / `NRestarts` | 2001835 / 0 | 2001835 / 0 | **2001835 / 0** |

### 3.1 · HTTP/2 de la lista con n suficiente (el arnés solo hace 1 conexión h2)

`e9_h2_list.mjs` (HEAD, 0,0 s de cuerpo), ventana 21:41:37–21:41:44 UTC:

| medición | n | min | **p50** | **p95** | max |
|---|---:|---:|---:|---:|---:|
| h2 · sesión **reutilizada** | 10 | 202,4 ms | **204,6 ms** | **598,6 ms**\* | 598,6 ms |
| h2 · **conexión nueva** (ALPN `h2` en 5/5, status 200 en 5/5) | 5 | 304,3 ms | **362,2 ms** | **415,2 ms** | 415,2 ms |
| h1 · **conexión nueva** (`http/1.1` en 5/5, status 200 en 5/5) | 5 | 300,1 ms | **489,2 ms** | **584,2 ms** | 584,2 ms |

\* la primera muestra de la sesión es la creación de la sesión (598,6 ms); las 9 siguientes van a **202–208 ms**.

**Lectura honesta (lo que estos números NO dicen):** la lista es nginx estático y su TTFB es TLS+RTT, no Lua;
el **baseline ya lo decía** (`B6`: 110,6 ms warm keep-alive es el suelo Bogotá↔Ashburn). h2 **no baja el RTT de
una petición**: con una sola petición, h2 y h1 empatan dentro del ruido (362 vs 489 ms p50 en ventanas distintas,
`ping` con jitter de hasta 4× documentado en `PHASE1_HTTP2.md` §4). **El valor de la fase 1 es protocolo
negociado + economía de conexiones, no latencia.** No se declara mejora de latencia.

**Sobre el TTFB del manifiesto:** sigue dominado por el proveedor (`X-APE-Upstream-Ms` p50 639–785 ms) y el
**hop interno 443→8088 sigue costando 0 ms** — colapsarlo (fase 2) no es una palanca de latencia, y la caché
del 302 (fase 3) no puede bajar de los ~396 ms del hop CDN medidos por E4. Este verificador **no re-mide** ese
split (E4 lo midió con 30 pares; aquí solo se confirma la coherencia del total).

### 3.2 · Los **4** runs del mismo arnés (incluye el rollback)

`e9_compare.mjs` sobre los cuatro `baseline.json` (salida cruda: `…/runs/20261026T213612Z/compare_4runs.txt`):

| métrica | **ANTES** (FASE 0) | DESPUÉS | **ROLLBACK OFF** | **FINAL ON** |
|---|---:|---:|---:|---:|
| inicio UTC | 20:20:41 | 21:37:08 | 21:58:26 | 21:59:34 |
| `default` sha256 | `58bee1cb…` | `49c162a8…` | **`e2ba4684…`** | **`49c162a8…`** |
| `nginx -T` sha256 | `64482e7d…` | `0c6c0ea0…` | **`cb02e8b7…`** | **`0c6c0ea0…`** |
| `http2` en `listen 443` | 0 | 2 | **0** | **2** |
| ALPN negociado | http/1.1 | h2 | **http/1.1** | **h2** |
| `http2.connect` estricto | NO NEGOCIADO | OK 200 | **NO NEGOCIADO** | **OK 200** |
| `curl(VPS) --http2` | 1.1 | 2 | **1.1** | **2** |
| lista h1 nueva **p50 / p95** | 427,5 / 747,4 | 499,0 / 713,3 | **475,8 / 807,4** | **535,1 / 658,6** |
| lista h1 keep-alive **p50** | 110,6 | 122,0 | **101,0** | **113,7** |
| `/cdn/` cliente p50 ch3/5/6 | 1.083,5 / 1.159,6 / 1.136,2 | 1.226 / 1.105 / 1.120 | **1.385,9 / 1.124,5 / 1.112,8** | **1.116,9 / 1.223 / 1.114,6** |
| `X-APE-Upstream-Ms` p50 ch3/5/6 | 704 / 732 / 750 | 785 / 719 / 639 | **698 / 754 / 654** | **702 / 697 / 739** |
| `/cdn/` status | 200×9 | 200×9 | **200×9** | **200×9** |
| `error_ratio` viejo → **honesto** | 0,2637 → **0,2087** | 0,1173 → **0,1050** | 0,0959 → **0,0875** | 0,0945 → **0,0863** |
| `MainPID` / `NRestarts` | 2001835 / 0 | 2001835 / 0 | **2001835 / 0** | **2001835 / 0** |

**El `nginx -T` del estado OFF es `cb02e8b7…`, exactamente el hash registrado el 20:49:57Z (pre-fase-1), y su
ALPN/`curl` se comportan igual que el baseline prístino (1.1).** El estado ON re-aplicado vuelve a `0c6c0ea0…`.
Eso es el rollback: no “parecido”, **byte-idéntico**.

---

## 4 · HTTP/2: NEGOCIADO, no solo habilitado

| Prueba | ANTES (baseline) | AHORA | Instrumento |
|---|---|---|---|
| ALPN con `h2` ofrecido | `http/1.1` | **`h2`** | `openssl s_client -alpn h2` (VPS, SNI real) y `tls.connect` |
| `curl --http2` (curl 8.5.0 + nghttp2 del VPS) | `http_version=1.1` | **`http_version=2`** (200) | `curl -I --http2` |
| `curl --http1.1` | `1.1` | `1.1` (200) | `curl -I --http1.1` |
| Cliente Node `http2.connect` estricto | falla (`NO_APPLICATION_PROTOCOL`) | **200**, `alpn=h2` | `baseline_edge.mjs` §4 / `e9_h2_list.mjs` |
| Respuesta real | — | `HTTP/2 200` con `content-length: 140555650`, `content-encoding: gzip` | `curl -I` (cabeceras crudas en `invariants.log`) |
| `error.log` por HTTP/2 | — | sin entradas nuevas de h2 (no se observó ninguna durante la ventana) | lectura del log |

**Veredicto de la fase 1: PASS** — si el ALPN siguiera en `1.1`, esta fase sería FAIL aunque la directiva
estuviera puesta; no es el caso.

---

## 5 · `error_ratio`: la fórmula vieja queda **obsoleta**

**Defecto confirmado en el código vivo** (`ape_obs.lua`, vivo ≡ repo): `error_ratio = all_failed / req`, y
`req` **solo se incrementa en respuestas exitosas** (`ape_gateway.lua`). No es una tasa de error; es
`fallos/éxitos`. La corrección (E7, **staged, no desplegada**) es `fallos / (éxitos + fallos + denegados + demasiado_grande)`:

```lua
-- ape_obs.lua (parche 0002 de E7, staged): attempts = req + failed + denied + big
--                                            err_ratio = fails / attempts
--                                            error_ratio_legacy = failed / req  (se sigue publicando para auditar)
```

Verificado leyendo el parche `_vps_stage/edge/E7_observability/patches/0002-ape_obs-error-ratio.patch` (líneas
34–50) y su `error_ratio_semantics = "fallos/intentos (E7; antes fallos/éxitos)"`.

**Valores recalculados desde los contadores crudos que el endpoint SÍ publica hoy** (`req`, `all_failed`):

| Momento | `req` (éxitos) | `all_failed` | publicado viejo | **honesto = fallos/(éxitos+fallos)** | inflación del viejo |
|---|---:|---:|---:|---:|---:|
| **Baseline** (20:20:41Z, inicio) | 91 | 24 | 0,2637 | **0,2087 (20,87 %)** | +26,3 % |
| Baseline (fin del run) | 109 | 24 | 0,2202 | **0,1805** | +22,0 % |
| **Después** (21:37:13Z) | 1.164 | 134 | 0,1151 | **0,1032 (10,32 %)** | +11,5 % |
| Después (fin del run) | 1.164 | 134 | 0,1151 | **0,1032** | +11,5 % |

**Conclusión:** el valor que hay que citar del baseline es **20,87 % de intentos fallidos**, no 26,4 %; y el de
hoy, **10,32 %**, no 11,51 %. La fórmula vieja queda marcada **OBSOLETA** en este documento; el endpoint sigue
publicándola hasta que se despliegue E7 (fuera del alcance de este verificador).

---

## 6 · El fallo intermitente de `/cdn/`: censo propio y campaña propia

### 6.1 · Censo del log con **un solo parser** a ambos lados del corte (20:49:57Z, breaker eliminado)

Fuente: `/var/log/nginx/access.log` + `access.log.1` (25/Oct 00:00 → 26/Oct 21:36Z), líneas con ` /cdn/ ` en la
petición; corte por marca de tiempo `26/Oct/2026:20:49:57`. Script: `e9_cdn_census.sh`.

| lado | peticiones | 200 | **502** | otros | % no-200 |
|---|---:|---:|---:|---|---:|
| **ANTES** del hotfix | **696** | 564 (81,03 %) | **111** | 404×8 · 407×5 · 405×2 · 504×1 · 513×4 · 301×1 | **18,97 %** |
| **DESPUÉS** del hotfix | **611** | 607 (99,35 %) | **0** | 513×3 · 405×1 | **0,65 %** |

**Las 4 no-200 de después son sondas deliberadas y se ven una a una:**

```
20:50:15 513  /cdn/line.tivi-ott.net/live/x/y/1.m3u8          (sonda con credenciales falsas)
20:55:07 513  /cdn/line.tivi-ott.net/live/0000/0000/3.m3u8   (smoke de la fase 1)
20:55:08 405  /cdn/line.tivi-ott.net/live/<USER>/<PASS>/999999999.m3u8  (id inválido)
21:36:21 513  /cdn/line.tivi-ott.net/live/x/x/0.m3u8         (sonda de ESTE verificador)
```

**Diagnóstico (coincide con E11, medido por mí):** el 18,97 % de antes es **502 del breaker** (`ms:0`, sin
intentar); tras eliminarlo, **0×502 en 611 peticiones** y el residuo son sondas. El `502 all_upstreams_failed`
que queda en el código es el **agotamiento real** de hosts, no un breaker: no hay TTL, no hay castigo persistido
(§7.3).

### 6.2 · Campaña propia de ≥100 peticiones (instrumento distinto, mismo criterio)

`e9_cdn_campaign.sh`, 21:38:17 → 21:40:05 UTC: **117 intentos** → **102 al 443** (3 canales × 34) + **15 al 8088**.

| plano | intentos | 200 | % ok | TTFB **p50** | TTFB **p95** | `X-APE-Upstream-Ms` p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|
| 443 (TLS, SNI real) | 102 | **102** | **100,00 %** | **733,5 ms** | **892,3 ms** | **694 / 859 ms** |
| 8088 (loopback) | 15 | **15** | **100,00 %** | **700,3 ms** | **803,3 ms** | — |

`X-APE-URI-Rebased: 6` en **102/102**; 12 cuerpos distintos (playlists vivas que rotan). **Ningún 502, ningún 5xx.**

### 6.3 · Coherencia entre los dos instrumentos y con E11

| fuente | antes | después |
|---|---|---|
| **Censo de este verificador** (696/611) | 18,97 % no-200, **111×502** | **0,65 %**, 0×502 |
| `[cita]` E11 (1.227 peticiones, ventana 2 días) | 32,4 % honesto (188×502) | 2,1 % (0×502) |
| `[cita]` E11 campaña (114) | — | 114/114 = 200 |
| **Campaña de este verificador** (117) | — | 117/117 = 200 |

La diferencia de **antes** (111 vs 188 `502`) es de **ventana**, no de método: mi censo solo cubre
`access.log` + `access.log.1` (desde 25/Oct 00:00) y E11 incluyó rotaciones más antiguas. Ambos coinciden en lo
que importa: **502 concentrado antes del hotfix y CERO después**.

---

## 7 · Invariantes prohibidos: comprobados con sha256 y con `diff`

### 7.1 · Listas y datos servidos (intactos)

| Objeto | sha256 **antes** (referencia) | sha256 **ahora** | ¿Igual? |
|---|---|---|---|
| `/var/www/html/lists/APE_LISTA_4K.m3u8` (stub 8 B) | `144659b48f342d02…` `[cita E6]` | `144659b48f342d02b9298907ab32fcf0479ac9c99a0d293c7c2ebf8df313dd12` | **SÍ** |
| `…APE_LISTA_4K.m3u8.gz` (140.555.650 B) | `a464a0c325a94b3c…` `[cita E6]` | `a464a0c325a94b3cc97bef3b3b936ccd5905496f0509b509550d0278149e081b` | **SÍ** |
| descomprimido (563.968.332 B, 10.084.364 líneas) | `44f5263f78eac14c…` `[cita E6]` | `44f5263f78eac14cc358df39e4470c508b4f0721767acda7f4241ac301d5e080` | **SÍ** |
| `…APE_LISTA_1793002539897_CDN.m3u8.gz` (160.845.954 B) | — | `db2d034ea0aa8f48…` (mtime 2026-10-26 08:23, sin cambios) | sin referencia previa |
| `mtime` de la lista servida | `1793044549` (19:55:49Z) | `1793044549` | **SÍ** (no se reescribió) |
| `/var/www/lists` (12 ficheros) digest del directorio | — | `431e078aa179c69d…` (por fichero, ordenado) | — |
| **Range byte-exacto** sobre el `.gz` | — | 206 · `sha256(bytes 0-1023)` = `fb9538dc…` **==** `head -c 1024` del fichero | **SÍ** |

### 7.2 · `resolve.php` / `origins.php` (decisión: NO se tocan)

| Fichero | sha256 `[cita E8]` | sha256 ahora | modo |
|---|---|---|---|
| `/var/www/html/resolve.php` (42.620 B) | `31e13a03ab70f028…` | `31e13a03ab70f02844cf9c6634718c7a656aec9e0b72e1145cd813e509e98665` | 644 |
| `/var/www/html/resolve_quality_unified.php` | `27db7ab7a5b56f43…` | `27db7ab7a5b56f43cb815f4732124bd9009b0fc22c223211c30a78579f25d260` | 644 |
| `/var/www/html/resolve_quality.php` | `78c27dff701da449…` | `78c27dff701da449bc6e66628a372d8620972926776986bb86cbbc759614520c` | 644 |
| `/etc/ape/origins.php` (440 B) | `c574090c1c34560b…` | `c574090c1c34560b7da99d0471714a502ab6fc7fc37d9edc2506f86adfa51924` | **640 root:www-data** (sin cambios) |
| `/var/www/lists/resolve.php` (35.931 B) | `f7e36fd7d06e7d88…` | `f7e36fd7d06e7d880f4676631f2175d9566e27e57c4212739919f06785163102` | **775 www-data** (sin cambios) |

### 7.3 · `nginx -T` renderizado: `diff` contra el backup **pre-fase-1**

```
$ diff -u /root/backups/edge-e1-20261026T205255Z/nginx-T.conf <(nginx -T)
-    listen 443 ssl default_server;
-    listen [::]:443 ssl default_server;
+    listen 443 ssl http2 default_server;
+    listen [::]:443 ssl http2 default_server;
```

**4 líneas, ninguna otra.** Eso prueba de una vez que `gzip_static`, `gunzip`, CORS, `/lists/`, `/cdn/`, la
regla `.ts→404`, el 403 de `/upload.php`, el bloqueo SSRF y el `proxy_cache off` **no se movieron** entre el
estado pre-fase-1 y el cierre. Los mismos greps dan presencia y **orden** (líneas del `nginx -T` renderizado):

| Directiva | Línea | Valor |
|---|---:|---|
| `gzip_static on;` (nivel http) | 74 | presente |
| `proxy_cache off;` | 301 | presente (caché general apagada) |
| `proxy_cache_valid … 302` | — | **0 ocurrencias** (los 302 no se cachean) |
| regla SSRF `location ~ ^/cdn/(127\.\|0\.0\.0\.0\|localhost\|10\.\|192\.168\.\|172\.(1[6-9]\|2[0-9]\|3[01])\.\|169\.254\.\|\[::1\]) { return 403; }` | **648** | antes del include |
| regla vídeo `location ~ ^/cdn/.*\.(ts\|m4s\|mp4)$ { return 404; }` | **653** | antes del include |
| `include snippets/ape-meta-public.conf;` | **654** | **después** de las dos reglas (orden correcto) |
| `location = /upload.php { return 403; }` | 690 | presente |
| bloque que sirve `/lists/` (`location ~* \.m3u8$`) | 718 | `gzip_static always;` (726) + `gunzip on;` (732) + 4 `add_header Access-Control-*` |
| regla vídeo del plano público `location ~* \.(ts\|m4s\|mp4)$` | 800 | 404 |
| `proxy_pass http://127.0.0.1:8088` | 3 | hop 8088 intacto (fase 2 no aplicada) |

### 7.4 · `ngx.exit(503)` y circuit breaker

* **`ngx.exit(503)` / `HTTP_SERVICE_UNAVAILABLE` en los 14 Lua: 0 ocurrencias.** No existe el patrón prohibido.
* **Breaker:** el único castigo por host **fue eliminado** el 20:49:57Z y el `diff` del gateway lo prueba con 4 líneas:

```
-    if not (HOSTS and HOSTS:get(dk)) then
+    if true then -- APE 2026-10-26: breaker ELIMINADO (autopista: siempre intentar)
-        if HOSTS then HOSTS:set(dk, 1, 15) end
+        -- APE 2026-10-26: castigo desactivado (no se persiste el fallo); telemetria qinc se mantiene
```

* Lo que **sigue** es (a) la telemetría `host_down:<host>` (`qinc`, contador histórico, no decide nada) y
  (b) `502 all_upstreams_failed` como respuesta de **agotamiento real** tras intentar todos los hosts. **Ningún
  breaker nuevo.** Diferencia de comportamiento demostrada: 111×502 → **0×502** (§6).

---

## 8 · `CODECS=` y metadata UHD (decisión del propietario: se respeta)

### 8.1 · Declaraciones `STREAM-INF` de la lista servida — medidas, no citadas

Pasada completa sobre `APE_LISTA_4K.m3u8.gz` (140,5 MB gzip → 563.968.332 B, 10.084.364 líneas):

| Dato | Valor |
|---|---|
| líneas `#EXT-X-STREAM-INF` | **10.520** |
| ocurrencias de `CODECS=` | **31.561** |
| declaraciones **distintas** | **8** (todas `hvc1.*`; **0** `hev1` en `STREAM-INF` → GOLDEN RULE) |
| digest del multiconjunto (ordenado) | `2c14697c17b8edc02e1cd57dec996aff05c4574d44c324afbaa4ec33925a4655` |
| digest del cuerpo descomprimido | `44f5263f78eac14c…` — **idéntico** a la referencia de E6 (misma lista) |

Valores distintos observados y su frecuencia:

```
808  CODECS="hvc1.2.4.L153.B0,mp4a.40.2"      9742  CODECS="hvc1.2.4.L153.B0,aac"
778  CODECS="hvc1.2.4.L153.B0,ac-3"           7446  CODECS="hvc1.2.4.L93.B0"
7446 CODECS="hvc1.2.4.L93.B0,mp4a.40.2"        809  CODECS="hvc1.2.4.L153.B0"
2266 CODECS="hvc1.2.4.L123.B0,mp4a.40.2"      2266  CODECS="hvc1.2.4.L123.B0"
```

**CODECS= sin cambios**: el fichero servido es byte-idéntico al de la referencia previa (`a464a0c3…` gzip,
`44f5263f…` descomprimido, mismo `mtime`), la config solo cambió en 2 líneas `listen` y **el plano `/cdn/` no
emite ninguna declaración** (verificado: 0 `EXT-X-STREAM-INF` y 0 `CODECS=` en los 3 manifiestos servidos).

### 8.2 · Metadata UHD: se mantiene, y no se inventa nada

| Guarda | Estado medido |
|---|---|
| Flags del plano meta | `uhd_auto="1", uhd4k="1", uhd8k="0", uhd_pq="0"` (`conf.d/50-ape-meta-plane.conf:122`, fichero `3e29b928…` sin cambios) |
| `X-APE-UHD` en las 9 muestras del arnés | **off** en las 9 → el rewrite UHD **no se dispara** con estas playlists |
| `ape_uhd.lua` (`f1f5eb67…`, vivo) | reescribe solo `RESOLUTION`/`VIDEO-RANGE`; **`CODECS` nunca se toca** (comentario y código); valida `hev1` en `STREAM-INF` y aborta el UHD si aparece |
| `RESOLUTION`/`VIDEO-RANGE` | decisión del propietario: no se audita como defecto; no se modificó ni se propuso modificarla aquí |
| Vídeo por el VPS | `\.(ts|m4s|mp4)$` → **404** en los dos planos, verificado con `curl` (2026-10-26 21:36Z): `/cdn/…x.ts` 404, `…x.m4s` 404, `…x.mp4` 404, `/meta/…x.ts` 404 |

---

## 9 · Rollback PROBADO (OFF real → medida → ON real)

**Qué se revierte:** la única fase aplicada que cambia configuración (fase 1, `http2` en los 2 `listen`).
**Con qué:** el backup **pre-fase-1 y post-seguridad** `/root/backups/edge-e1-20261026T205255Z/…default.bak_20261026T205255Z`
(`e2ba4684…`, 7.816 B) — **no** el backup de FASE 0 (`58bee1cb…`), que es **pre-hotfix** y reabriría el 403 de
`/upload.php`. El script aborta si el sha vivo no es el esperado y, si `nginx -t` falla, **restaura el estado
ON automáticamente** (nunca deja producción rota).

### 9.1 · Comandos exactos ejecutados

```bash
# ventana anunciada en COORDENADAS_SESIONES.md §4 (2026-10-26T22:00Z)
STAMP=<STAMP> ssh root@178.156.147.234 'STAMP=$STAMP bash -s' -- off < _vps_stage/edge/tests/e9_rollback.sh
#   -> guarda el vivo (h2 ON) en /root/backups/e9-<STAMP>/default.h2.<STAMP>
#   -> cp -a <backup pre-fase-1> /etc/nginx/sites-enabled/default ; chmod 644 ; chown root:root
#   -> nginx -t  (si falla: recupera ON) ; systemctl reload nginx ; verifica ALPN y sondas

STAMP=<STAMP> ssh root@178.156.147.234 'STAMP=$STAMP bash -s' -- on  < _vps_stage/edge/tests/e9_rollback.sh
#   -> cp -a /root/backups/e9-<STAMP>/default.h2.<STAMP> /etc/nginx/sites-enabled/default
#   -> nginx -t ; systemctl reload nginx ; verifica ALPN=h2 y sondas
```

### 9.2 · OFF — estado restaurado (h2 apagado), medido a las 21:57:51Z

| Comprobación | Valor medido |
|---|---|
| sha256 `default` | `e2ba46846175729b…` (7.816 B) — **el del backup pre-fase-1** |
| `nginx -T` sha256 | `cb02e8b7cf575593…` — **el registrado el 20:49:57Z, antes de la fase 1** |
| `nginx -t` | **OK** (el script aborta y recupera ON si falla) |
| reload | `systemctl reload nginx` · `MainPID 2001835` · `NRestarts 0` |
| ALPN (SNI real) | con `h2` ofrecido → `No ALPN negotiated`; con `h2,http/1.1` → **`http/1.1`** |
| `curl --http2` / `--http1.1` | **1.1** / 1.1 (200) — igual que el baseline prístino |
| Arnés (mismo instrumento) | `http2.connect` **NO NEGOCIADO** · ALPN `http/1.1` · `curl=1.1` · run `20261026T215826Z` |
| lista h1 nueva p50/p95 · keep-alive p50 | 475,8 / 807,4 ms · 101,0 ms |
| `/cdn/` ch3/5/6 cliente p50 | 1.385,9 / 1.124,5 / 1.112,8 ms · **200×9** |
| `X-APE-Upstream-Ms` cliente p50 | 698 / 754 / 654 ms |
| `GET`/`POST /upload.php` | **403 / 403** |
| `GET /cdn/127.0.0.1:8088/_ape/health` | **403** |
| `GET /cdn/…x.ts` | **404** |
| `/resolve.php?ch=1&p=P3` · `/ape/health` | 200 · 200 |

### 9.3 · ON — estado final re-aplicado (h2 encendido), medido a las 21:59:32Z

| Comprobación | Valor medido |
|---|---|
| sha256 `default` | `49c162a862f1e548…` (7.828 B) = **el del estado de entrada** |
| `nginx -T` sha256 | `0c6c0ea0090e7dd7…` = **el del estado de entrada** |
| `nginx -t` | **OK** |
| reload | `systemctl reload nginx` · `MainPID 2001835` · `NRestarts 0` |
| ALPN (SNI real) | **`h2`** |
| `curl --http2` / `--http1.1` | **2** (200) / 1.1 (200) |
| Arnés (mismo instrumento) | `http2.connect` **OK 200** · ALPN `h2` · `curl=2` · run `20261026T215934Z` |
| lista h1 nueva p50/p95 · keep-alive p50 | 535,1 / 658,6 ms · 113,7 ms |
| `/cdn/` ch3/5/6 cliente p50 | 1.116,9 / 1.223 / 1.114,6 ms · **200×9** |
| `X-APE-Upstream-Ms` cliente p50 | 702 / 697 / 739 ms |
| `GET`/`POST /upload.php` | **403 / 403** |
| `GET /cdn/127.0.0.1:8088/_ape/health` · `…x.ts` | **403** · **404** |
| `/resolve.php` · `/ape/health` | 200 · 200 |
| Re-hash de invariantes a las **22:01:04Z** | **idénticos** al estado de entrada: `49c162a8…` / `0c6c0ea0…` / `3e29b928…` / `a39e8de9…` / `2dc0fad8…` / lista `a464a0c3…` / descomprimido `44f5263f…` / multiconjunto CODECS `2c14697c…` / PHP `31e13a03…`+`c574090c…`+`f7e36fd7…` / `ngx.exit(503)` = 0 |

### 9.4 · Lo que el rollback **no** puede reabrir (comprobado en los dos estados)

| Sonda | OFF | ON |
|---|---|---|
| `GET /upload.php` | **403** | **403** |
| `POST /upload.php` (multipart) | **403** | **403** |
| `GET /cdn/127.0.0.1:8088/_ape/health` (SSRF) | **403** | **403** |
| `GET /cdn/…x.ts` (vídeo por el VPS) | **404** | **404** |
| `GET /lists/APE_LISTA_4K.m3u8` | 200 | **200 (h2)** |
| `GET /resolve.php?ch=1&p=P3` | 200 | 200 |
| `MainPID` / `NRestarts` | 2001835 / 0 | **2001835 / 0** |

**Estado final dejado en producción:** `default` = `49c162a8…` (7.828 B), `nginx -T` = `0c6c0ea0…`,
ALPN = `h2`, `nginx -t` OK, `MainPID 2001835` sin restart. **Idéntico al de entrada** (mismos hashes).

---

## 10 · Tabla de hashes de configuración por momento

| Momento (UTC) | `sites-enabled/default` | `nginx -T` | `lua/ape_gateway.lua` | Qué pasó |
|---|---|---|---|---|
| 20:15:48 (FASE 0) | `58bee1cb7b911bc1…` (6.862 B) | `64482e7d9014473e…` | `66a2001730d7e2b5…` | baseline + backups |
| 20:22:56 | `715465641c7e97ff…` (7.095 B) | `ddf6a267aee7fb66…` | `66a2001730d7e2b5…` | hotfix `/upload.php → 403` |
| 20:49:57 | `e2ba46846175729b…` (7.816 B) | `cb02e8b7cf575593…` | `2dc0fad86f45f4ac…` | SSRF 403 + `.ts→404` + **breaker fuera** |
| 20:53:22 (FASE 1) | `49c162a862f1e548…` (7.828 B) | `0c6c0ea0090e7dd7…` | `2dc0fad86f45f4ac…` | `http2` en 2 `listen` |
| 21:36:12 (E9, este doc) | `49c162a862f1e548…` | `0c6c0ea0090e7dd7…` | `2dc0fad86f45f4ac…` | **verificado igual** |
| **21:57:51** (rollback **OFF**) | **`e2ba46846175729b…`** (7.816 B) | **`cb02e8b7cf575593…`** | `2dc0fad86f45f4ac…` | rollback probado: vuelve al estado pre-fase-1 |
| **21:59:32** (rollback **ON**) | `49c162a862f1e548…` (7.828 B) | `0c6c0ea0090e7dd7…` | `2dc0fad86f45f4ac…` | **estado final = estado de entrada** |
| **22:01:04** (re-hash de cierre) | `49c162a862f1e548…` | `0c6c0ea0090e7dd7…` | `2dc0fad86f45f4ac…` | invariantes de datos idénticos |

Otros ficheros, sin cambios en toda la ventana: `conf.d/50-ape-meta-plane.conf` `3e29b928…` ·
`snippets/ape-meta-public.conf` `a39e8de9…` · `ape_uhd.lua` `f1f5eb67…` · `ape_obs.lua` `f477741b…` ·
`ape_lab_bridge.lua` `d0cae616…` · `nginx.conf` `a9a7146a…`.

---

## 11 · Veredicto PASS/FAIL por fase (solo las fases que existen; ninguna cancelada)

| Fase | Objetivo | Qué se aplicó | Veredicto | Evidencia |
|---|---|---|---|---|
| **1 · HTTP/2 en 443** | h2 negociado en 443 sin romper h1 | `http2` en los 2 `listen` (20:53:22Z) | **PASS** | ALPN `h2`, `curl --http2=2`, h1 `1.1 200`, 9/9 `/cdn/` 200, rollback OFF→ON probado (§4, §9) |
| **2 · Colapsar 443→8088** | latencia | **no aplicada** | **FAIL como mejora de latencia / correctamente no aplicada** | hop 443 vs 8088 = **0,0–0,2 ms p50** en los 3 runs ⇒ no hay latencia que ganar; tocarlo solo añadiría riesgo |
| **3 · Caché del destino del 302** | `<350 ms` | **no aplicada** | **FAIL (refutada por medición)** `[cita E4]` | el suelo del hop CDN es 396 ms p50 con 30 pares; el TTL 30–60 s reintroduce 509. Mi verificación solo confirma la coherencia: `X-APE-Upstream-Ms` p50 639–785 ms sigue siendo el coste dominante |
| **4 · Guard UHD (metadata sí, CODECS no)** | ninguna declaración insostenible; metadata intacta | **no aplicada** (Δ funcional = 0) | **PASS en invariantes / FAIL en el guard** | `CODECS= sin cambios` (8 declaraciones, 31.561 hits, digest `44f5263f…`); `hev1` en `STREAM-INF` = 0; flags `uhd8k=0`; E5 declara su guard en FAIL y no se desplegó |
| **5 · ETag/304 + micro-caché** | 304 correcto y menos bytes | **no aplicada** (solo propuesta) | **PASS en ETag/304 / FAIL en micro-caché (NO-GO)** `[cita E6]` | 12/12 combinaciones dan 304 sin cuerpo; techo de acierto de micro-caché 1 s = 8,5 % (no compensa) |
| **6 · Observabilidad de la decisión** | `provider_fetch_ms`, hops, `uhd_mode`, `rebase_pct` | **staged, no desplegada** | **FAIL de despliegue / PASS de aritmética del `error_ratio`** | el endpoint sigue publicando la fórmula vieja; el `error_ratio` honesto se recalcula y se publica (§5). `rebase_pct` medido por mí: **100 % (102/102 con `X-APE-URI-Rebased: 6`)** |
| **E11 · Fallo intermitente `/cdn/`** | eliminar el 18–23 % | breaker de 15 s **eliminado** (20:49:57Z) | **PASS** | 111×502 → **0×502** (611 peticiones) y 117/117 = 200 en campaña propia (§6) |

> **Nota de honestidad:** «PASS» aquí significa **criterio de la fase cumplido y verificado por mí**, no que la
> fase se haya desplegado. Las fases 2, 3, 5 y 6 **no están en producción** y así se declara; contarlas como
> PASS de despliegue sería falso.

---

## 12 · Límites y honestidad (lo que esta verificación NO prueba)

1. **N pequeño en el arnés** (3–7 muestras): p95 = máximo. Para h2 se añadió `e9_h2_list.mjs` (n=10 y n=5),
   pero la comparación h2/h1 sigue dominada por TLS y jitter del camino Bogotá↔Ashburn (hasta 4×).
2. **No se re-midió el split proveedor//CDN**: se cita E4 (30 pares). Mi evidencia es la coherencia del total.
3. **El censo de `/cdn/` depende de la retención de logs**: cubre 25/Oct 00:00 → 26/Oct 21:36Z; incluye tráfico de
   otras sesiones de prueba (identificado en las 4 no-200 de después).
4. **`error_ratio` corregido no está en producción**: se demuestra la fórmula y se publican los valores
   recalculados; el endpoint seguirá publicando el viejo hasta que se despliegue E7 (con su ventana).
5. **`0×502` no demuestra que el proveedor sea estable**: demuestra que el **breaker ya no fabrica 502**. Un 502
   de agotamiento real seguiría siendo visible y no aparece en 611 + 117 peticiones de esta ventana.
6. **`CODECS=`**: se prueba que **no cambió** (bytes y hashes). No se juzga si la declaración es la mejor posible
   — eso es doctrina del propietario y no es asunto de esta verificación.
7. **Metadata UHD**: no se valida que el display materialice PQ; se valida que la declaración emitida es la misma
   y que el VPS no reempaqueta vídeo (404 en `.ts/.m4s/.mp4`).

---

## 13 · Reproducción exacta

```bash
# 1) ANTES/DESPUÉS con el arnés de t1 (sin modificarlo)
node _vps_stage/edge/baseline/baseline_edge.mjs --label "E9-AFTER-verificador-independiente"
node _vps_stage/edge/tests/e9_compare.mjs \
  _vps_stage/edge/baseline/runs/20261026T202041Z/baseline.json \
  _vps_stage/edge/baseline/runs/20261026T213708Z/baseline.json

# 2) invariantes, censo y campaña (read-only)
STAMP=$(date -u +%Y%m%dT%H%M%SZ) ssh root@178.156.147.234 'STAMP=$STAMP bash -s' < _vps_stage/edge/tests/e9_invariants.sh
ssh root@178.156.147.234 'TH=26/Oct/2026:20:49:57 bash -s' < _vps_stage/edge/tests/e9_cdn_census.sh
ssh root@178.156.147.234 'N=34 bash -s' < _vps_stage/edge/tests/e9_cdn_campaign.sh

# 3) h2 de la lista con n suficiente
node _vps_stage/edge/tests/e9_h2_list.mjs

# 4) rollback probado (SOLO con ventana §4)
STAMP=<STAMP> ssh root@178.156.147.234 'STAMP=$STAMP bash -s' -- off < _vps_stage/edge/tests/e9_rollback.sh
STAMP=<STAMP> ssh root@178.156.147.234 'STAMP=$STAMP bash -s' -- on  < _vps_stage/edge/tests/e9_rollback.sh
```

---

## 14 · Evidencia (rutas de esta verificación)

| Artefacto | Ruta | Nota |
|---|---|---|
| Run **DESPUÉS** del arnés | `_vps_stage/edge/baseline/runs/20261026T213708Z/baseline.{json,log}` | mismo arnés, `RESULT=OK` |
| Run **ROLLBACK OFF** del arnés | `_vps_stage/edge/baseline/runs/20261026T215826Z/baseline.{json,log}` | h2 NO NEGOCIADO, igual que el baseline |
| Run **FINAL ON** del arnés | `_vps_stage/edge/baseline/runs/20261026T215934Z/baseline.{json,log}` | h2 OK, estado restaurado |
| Invariantes (hashes, `diff`, ALPN, sondas, CODECS) | `_vps_stage/edge/tests/runs/20261026T213612Z/invariants.log` | 219 líneas, 21:36Z |
| Invariantes **de cierre** (tras el round-trip) | `…/runs/20261026T213612Z/invariants_final.log` | 22:01Z, hashes idénticos |
| Censo `/cdn/` antes/después | `…/runs/20261026T213612Z/cdn_census.log` | mismo parser |
| Campaña ≥100 peticiones | `…/runs/20261026T213612Z/cdn_campaign_after.log` | 117 intentos |
| h2 de la lista (n=10/5/5) | `…/runs/20261026T213612Z/h2_list_after.json` | ALPN h2 en 5/5 |
| Rollback OFF / ON | `…/runs/20261026T213612Z/rollback_off.log` · `…/rollback_on.log` | comandos + hashes + sondas |
| Comparador y tabla de 4 runs | `_vps_stage/edge/tests/e9_compare.mjs` · `…/compare_4runs.txt` | salida reproducible |
| Baseline canónico (ANTES) | `_vps_stage/edge/baseline/runs/20261026T202041Z/baseline.json` | E1, sin h2 |
