# E1 · BASELINE DE LA CAPA EDGE (FASE 0) — 2026-10-26

> **Estado:** COMPLETO · **cero cambios funcionales propios** · backups verificados + rollback probado en dry-run.
> **Run canónico del arnés:** [`_vps_stage/edge/baseline/runs/20261026T202041Z/`](../../_vps_stage/edge/baseline/runs/20261026T202041Z/baseline.json)
> **Backups:** [`_vps_stage/edge/baseline/runs/20261026T201548Z/`](../../_vps_stage/edge/baseline/runs/20261026T201548Z/phase0_verify.log) · **Arnés:** [`baseline_edge.mjs`](../../_vps_stage/edge/baseline/baseline_edge.mjs) v1.0.1
> **Ventana de medida (UTC):** 2026-10-26 20:20:41 → 20:21:33 · **Bogotá:** 15:20:41 → 15:21:33
> **VPS:** `ubuntu-2gb-ash-1` (Hetzner Ashburn) · nginx 1.24.0 (Ubuntu) + `ngx_http_lua_module` · kernel 6.8.0-124
>
> **Post-baseline (2026-10-26):** 20:48Z hotfix ajeno SSRF/video + breaker 15 s eliminado en
> `ape_gateway.lua` (`66a20017…` → `2dc0fad8…`); 20:53Z **FASE 1 HTTP/2 aplicada**
> (`default` `e2ba4684…` → `49c162a8…`). Ver [`PHASE1_HTTP2.md`](PHASE1_HTTP2.md) y
> [`DEPLOY_LOG.md`](DEPLOY_LOG.md). **Este baseline corresponde a `default 58bee1cb…`, gateway
> `66a20017…` y sin HTTP/2**; sigue siendo la referencia de FASE 0, no el estado vivo actual.

Este documento fija los números que las fases 1–6 deberán mover. **Esta sesión no ha
tocado ningún `.conf` vivo, no ha recargado nginx y no ha desplegado nada.** Los únicos
bytes escritos en el VPS por este arnés son las copias de
`/root/backups/edge-e1-20261026T201548Z/`. El único cambio vivo ocurrido en la ventana
fue el **hotfix ajeno de `/upload.php`** (20:22:56–20:23:27 UTC), documentado en §2/§3
y en [`DEPLOY_LOG.md`](DEPLOY_LOG.md): el baseline canónico es **anterior** a él.

---

## 1 · Resumen ejecutivo (lo que gobierna el diseño de las fases)

| # | Hallazgo medido | Consecuencia para el equipo |
|---|---|---|
| **B1** | **HTTP/2 NO está activo en 443.** `listen 443 ssl` sin `http2`; ALPN negocia `http/1.1`; `http2.connect` estricto falla con `ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL`; `curl --http2` del VPS también negocia `1.1`. | La fase 1 es real y medible, pero **no** es la palanca de los 700 ms: con keep-alive HTTP/1.1 el suelo es **~110 ms** (RTT Bogotá↔Ashburn). |
| **B2** | **El doble hop 443→8088 cuesta ~0,1 ms** (warm, sin TLS: 443 p50 0,2 ms vs 8088 p50 0,1 ms; resolución del reloj). | Colapsarlo (fase 2) **no baja el TTFB de forma perceptible**. Se justifica por simplicidad y observabilidad, no por latencia. **No prometer latencia aquí.** |
| **B3** | **El TTFB del manifiesto está dominado por el fetch al proveedor + 302:** `X-APE-Upstream-Ms` p50 = **704 / 732 / 750 ms** para los canales 3/5/6. El “708 ms” del encargo es exactamente esto, **no** el hop interno ni la lista. | La fase 3 (cache del destino del 302, 30–60 s) es la única con margen para bajar a <350 ms… **si** el split primer-hop vs CDN lo permite. Hoy no está medido (ver §7). |
| **B4** | **`error_ratio` = 0,2637** en `/_ape/health`, pero **no es una tasa de error**: `ape_obs.lua:62` lo calcula como `all_failed / req`, y `req` solo se incrementa en respuestas **exitosas** (`ape_gateway.lua:416`). 24 fallos / 91 éxitos ⇒ **18,0 % de intentos fallidos**. Las 18 peticiones del arnés fueron **todas 200**. | La fase 6 debe (a) exponer el fallo por petición y (b) corregir la fórmula a `fallos / (éxitos + fallos)`. No confundir “24 fallos históricos” con “proveedor caído ahora”. |
| **B5** | **La lista se sirve desde el `.gz` (gzip_static always + gunzip):** 140.555.650 B comprimidos; la ruta sin `Accept-Encoding: gzip` es **chunked** y su ETag es **débil** (`W/"6adfb045-860b582"`), mientras la ruta gzip tiene ETag **fuerte** (`"6adfb045-860b582"`). | La fase 5 (ETag/304) debe manejar **dos representaciones** y no asumir un ETag único. |
| **B6** | **La lista NO pasa por Lua ni por 8088** (0 cabeceras `X-APE-*`). Su TTFB es nginx estático: p50 **427,5 ms** con conexión nueva (TLS ~228 ms) y **110,6 ms** warm keep-alive. | Optimizar la lista es TLS/RTT, no Lua. HTTP/2 reduce conexiones, no el RTT. |

---

## 2 · Entorno y configuración medida (read-only)

| Dato | Valor |
|---|---|
| Fecha/hora UTC | `2026-10-26T20:20:41Z` (inicio del arnés) · `20:20:46Z` (preflight en VPS) · `20:21:33Z` (última lectura del run) |
| Host / kernel | `ubuntu-2gb-ash-1` · Linux 6.8.0-124-generic · Ubuntu 24.04 |
| nginx | `nginx/1.24.0 (Ubuntu)` · `nginx -t` **OK** · `MainPID=2001835` · `NRestarts=0` · activo desde `2026-10-25 23:35:04 UTC` |
| `nginx -T` sha256 | `64482e7d9014473ea9228253bbe7fbe81d431df97787c81940dc745c25e15404` (pre-hotfix; ver drift abajo) |
| `http2` en `listen … 443` | **0 ocurrencias** (`grep` sobre `sites-enabled/default` + `conf.d/`) |
| HTTP/2 real | ALPN `[h2,http/1.1]` → **`http/1.1`**; TLSv1.3 `TLS_AES_256_GCM_SHA384`; `http2.connect` → `ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL`; `curl(VPS 8.5.0) --http2` → `http_version=1.1` |
| Lista viva | `/var/www/html/lists/APE_LISTA_4K.m3u8` (stub 8 B) + `.m3u8.gz` **140.555.650 B** · mtime `2026-10-26 19:55:49 UTC` |
| Lista CDN usada para canales | `/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz` (160.845.954 B) |

### Configuración viva respaldada (hashes, **estado en la ventana de medida**)

| Fichero | Bytes | Modo | sha256 |
|---|---:|---|---|
| `/etc/nginx/conf.d/50-ape-meta-plane.conf` | 10.941 | 644 | `3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515` |
| `/etc/nginx/snippets/ape-meta-public.conf` | 2.509 | 644 | `a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39` |
| `/etc/nginx/sites-enabled/default` | 6.862 | 644 | `58bee1cb7b911bc1b40ebab65003d1cdfcfa8a7c6f03dc5e0acbdd77b38a4f96` |

> **Drift posterior a la medida (hotfix de otra sesión del equipo `edge-fluidez`):**
> entre **20:22:56 y 20:23:27 UTC** se aplicó `location = /upload.php { return 403; }`
> en `sites-enabled/default` (hotfix de seguridad E8-§10), con `nginx -t` + `systemctl
> reload nginx` (3 reloads en journal; workers reiniciados a las 20:23:27; master
> `2001835` intacto, `NRestarts=0`). El fichero vivo pasó a **7.095 B**, sha256
> `715465641c7e97ff…`; `nginx -T` a `ddf6a267…`.
> **El baseline canónico se midió ANTES** (config `58bee1cb…`). El diff solo añade el
> bloque exacto de `/upload.php` y **no toca** `listen 443`, `/lists/`, `/cdn/` ni
> `/ape/health`. Registro y rollback: [`docs/edge/DEPLOY_LOG.md`](DEPLOY_LOG.md) ·
> backup `/root/backups/default.bak_20261026T202256Z`. Sanity post-reload:
> [`runs/20261026T202041Z/post_drift_sanity.log`](../../_vps_stage/edge/baseline/runs/20261026T202041Z/post_drift_sanity.log)
> (lista 200 · `/cdn/` 200 con `X-APE-Upstream-Ms=694` · health 200).

### 2.1 · Repo vs VPS: no asumir que el Lua del repo es el desplegado (D-32)

| Fichero | Vivo en el VPS | Repo `_vps_stage/lua/` | Consecuencia |
|---|---|---|---|
| `ape_gateway.lua` | **267 líneas, 11.651 B**, sha256 `66a2001730d7e2b566d9baa0b9ce697bd413544395a82e5d8f8b8bb6c869fdf5`, mtime `2026-10-24 17:59:36Z` | 439 líneas, sha256 `b9eb14061d5e2c81fdb71c69c81637abc161d081c6276aba1e71691379322710` | El vivo **no** tiene el fusible de suelo: no emite `X-APE-Floor-Fuse` (confirmado: ausente en las 9 respuestas del run) ni aplica `fuse_*`. Desplegar el del repo **cambia comportamiento** (no es baseline). |
| `ape_obs.lua` | sha256 `f477741bcfa600bb44801d44b83a62777848d4b11e5305a7327bee09d1fdc6d0` | **idéntico** | `error_ratio = failed / req` (ver §5.5) |
| `ape_lab_bridge.lua` | sha256 `d0cae6166fd41f104d08b937a3f5fa6b640c86f26f78e7ed9a76041eaba92c61` | **idéntico** | cache 60 s en `lab_config` |

Medido por `sha256sum` en el VPS y `Get-FileHash` local en la misma ventana. **Manda el
desplegado** (D-32); el repo es candidato, no fuente de verdad de comportamiento.

---

## 3 · Backups de FASE 0 (y rollback probado)

**Raíz en el VPS:** `/root/backups/edge-e1-20261026T201548Z/` (modo 600 `root:root`).

| Fichero original | Backup (sufijo `.bak_20261026T201548Z`) | sha256 verificado | `cmp` | restore-sim |
|---|---|---|---|---|
| `conf.d/50-ape-meta-plane.conf` | `…/etc/nginx/conf.d/50-ape-meta-plane.conf.bak_20261026T201548Z` | `3e29b928…` | OK | OK |
| `snippets/ape-meta-public.conf` | `…/etc/nginx/snippets/ape-meta-public.conf.bak_20261026T201548Z` | `a39e8de9…` | OK | OK |
| `sites-enabled/default` | `…/etc/nginx/sites-enabled/default.bak_20261026T201548Z` | `58bee1cb…` | OK | OK |

Además: `SHA256SUMS`, `nginx-T.conf` (35.974 B, sha256 `64482e7d…`), `nginx-t.txt`,
`nginx-T.err`. Evidencia: `runs/20261026T201548Z/phase0_verify.log` (re-hash + `cmp`
en una segunda pasada: **RESULT=OK**) y `restore_dryrun.log` (**RESULT=OK**).

**Copia espejo en el repo** (byte-exacta, verificada por sha256):
[`live-snapshot/20261026T201548Z/etc/nginx/`](../../_vps_stage/edge/baseline/live-snapshot/20261026T201548Z/etc/nginx/).

**Rollback:** [`restore_phase0.sh`](../../_vps_stage/edge/baseline/restore_phase0.sh) — dry-run por
defecto, `--apply` reinstala con el modo original, valida sha256 y corre `nginx -t`
(sin reload). Probado en dry-run; no se aplicó porque **nada cambió**.

> ⚠️ **Este set es PRE-HOTFIX** (ver drift en §2): restaurarlo devuelve
> `sites-enabled/default` a `58bee1cb…` y **deshace** el 403 de `/upload.php`
> aplicado a las 20:23:27Z. Es correcto para volver al estado del baseline; **no**
> es un “fix” de producción. Antes de un `--apply` real: re-hashear la config viva
> y decidir con la otra sesión.

> **Por qué el sufijo `.bak_<stamp>` no se deja junto a `sites-enabled/default`:**
> `nginx.conf` incluye `include /etc/nginx/sites-enabled/*;` **sin filtro de extensión**.
> Un hermano `default.bak_<stamp>` se parsearía como un **segundo** `server { listen 443 ssl default_server; }`
> ⇒ `nginx -t` falla ⇒ el siguiente reload/restart falla. El backup conserva la ruta
> original **dentro** de la raíz de backups y el sufijo va en el nombre del fichero.
> Censo confirmado: `sites-enabled/` solo contiene `default` y `coa-navigator`.

---

## 4 · Arnés FIJO (reproducible)

[`_vps_stage/edge/baseline/baseline_edge.mjs`](../../_vps_stage/edge/baseline/baseline_edge.mjs) v1.0.1
· Node ≥18 (probado v24.12.0) · **cero dependencias** · sha256 `423e260dcbf3adfb5dc3b198092aa16595b852239376fb7394d62cc451324089`.

| Parámetro | Valor fijo |
|---|---|
| Host | `iptv-ape.duckdns.org` (443 público) |
| Lista | `GET /lists/APE_LISTA_4K.m3u8` (cuerpo abortado tras el 1.er chunk) |
| Canales `/cdn/` | ids **3, 5, 6** de `line.tivi-ott.net` (descubiertos de la lista viva; credenciales redactadas) |
| N | lista 5 (conexión nueva) + 5 (keep-alive HEAD) · `/cdn/` 3 cliente + 3 loopback por canal · doble hop 7 |
| Timeout | 20 s/petición |
| Percentiles | nearest-rank; con N=3/5, **p95 = máximo** (es una línea base, no un IC) |

Garantías: solo GET/HEAD + `nginx -t`; el cuerpo de la lista se destruye tras el
primer chunk (no se bajan 140 MB); no se persisten credenciales; cada ejecución
escribe `baseline.json`, `baseline.log` y (opcional) cabeceras crudas.

---

## 5 · Resultados (run `20261026T202041Z`)

### 5.1 Lista pública — TTFB

| Medición | n | min | **p50** | p95 | max | setup TCP+TLS p50¹ |
|---|---:|---:|---:|---:|---:|---:|
| HTTP/1.1 · conexión **nueva** (GET, `Accept-Encoding: gzip`) | 5 | 405,9 ms | **427,5 ms** | 747,4 ms | 747,4 ms | ~228 ms |
| HTTP/1.1 · **keep-alive** (HEAD, 1 conexión reutilizada) | 5 | 108,7 ms | **110,6 ms** | 363,9 ms | 363,9 ms | — (reutilizada) |
| HTTP/2 · intento estricto | — | — | **NO NEGOCIADO** | — | — | — |

¹ `tlsMs` del arnés = `t0 → secureConnect`: incluye DNS (cacheado tras la 1.ª), TCP y TLS; ≈ 2 RTT con RTT ~110 ms.

- La primera muestra de conexión nueva pagó la conexión fría (**507,9 ms** hasta `secureConnect`); las
  siguientes, ~211–248 ms. El **suelo de red** con keep-alive es **~109–114 ms** (1 RTT)
  (primer HEAD 363,9 ms por conexión nueva).
- **HTTP/2:** `tlsProbe` negocia `http/1.1`; `http2.connect` falla con
  `ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL`; `curl 8.5.0` del VPS con `--http2`
  devuelve **`http_version=1.1`** (200). El `curl` local (8.16.0/Schannel) **no**
  soporta HTTP/2, por eso la prueba decisiva se ejecuta en el VPS.

**Cabeceras de la representación gzip (GET):**

```
HTTP/1.1 200 OK
Server: nginx
Content-Type: application/vnd.apple.mpegurl
Content-Length: 140555650
Content-Encoding: gzip
ETag: "6adfb045-860b582"
Last-Modified: Mon, 26 Oct 2026 19:55:49 GMT
Vary: Accept-Encoding
Cache-Control: max-age=300, public, max-age=300
```

**Representación sin `Accept-Encoding` (HEAD, ruta gunzip → chunked):**
`ETag: W/"6adfb045-860b582"` (débil), **sin** `Content-Length` ni `Content-Encoding`.
Raw: [`runs/20261026T202041Z/list_headers.txt`](../../_vps_stage/edge/baseline/runs/20261026T202041Z/list_headers.txt).
**Cero cabeceras `X-APE-*`** (0 coincidencias) ⇒ la lista no pasa por el plano Lua.

**Bytes:** declarados 140.555.650 B (gzip) · primer chunk 7.443 B · en disco: stub
`.m3u8` 8 B + `.gz` 140.555.650 B. `Cache-Control` 300 s; el `.gz` se sirve por
`gzip_static always`.

### 5.2 Manifiesto `/cdn/` — 3 canales

**Desde el cliente (HTTPS 443, conexión nueva por muestra, n=3/canal):**

| Canal | TTFB p50 | setup TCP+TLS p50¹ | `X-APE-Upstream-Ms` p50 | Bytes | Status |
|---|---:|---:|---:|---:|---|
| 3 | **1.083,5 ms** | 266,8 ms | **704 ms** | 635 | 200/200/200 |
| 5 | **1.159,6 ms** | 277,8 ms | **732 ms** (688–802) | 637–638 | 200/200/200 |
| 6 | **1.136,2 ms** | 235,8 ms | **750 ms** (749–774) | 646 | 200/200/200 |

¹ `tlsMs` = DNS(cacheado)+TCP+TLS hasta `secureConnect`; ≈ 2 RTT (RTT ~110–150 ms).

**Desde el loopback del VPS (127.0.0.1:8088, server-side, n=3/canal):**

| Canal | TTFB loopback p50 | `X-APE-Upstream-Ms` p50 | Δ (TTFB−upstream, pareado) | Bytes | Origen final |
|---|---:|---:|---:|---:|---|
| 3 | **838,1 ms** | **787 ms** (722–812) | ~34–51 ms | 635 | `185.227.34.195:80` |
| 5 | **729,5 ms** | **691 ms** (686–794) | ~31–44 ms | 637 | `185.227.34.195:80` |
| 6 | **747,2 ms** | **713 ms** (649–752) | ~31–43 ms | 646 | `185.227.34.195:80` |

Cabeceras del gateway (idénticas en los 3 canales): `X-APE-CDN: line.tivi-ott.net`,
`X-APE-Origin: http://185.227.34.195:80`, `X-APE-Failover: false`,
`X-APE-URI-Rebased: 6`, `X-APE-LL-HLS: none`, `X-APE-UHD: off`,
`X-APE-LAB-FLOOR: 8000000`. **No hay `X-APE-Floor-Fuse`** (el gateway vivo es la
versión sin fusible, §2.1). `Content-Type: application/x-mpegURL`,
`Transfer-Encoding: chunked`, `Cache-Control: no-store`.

**Variación del cuerpo (importante para cache):** el canal 3 dio el mismo sha256 en
las 3 muestras (`65617734…`); el canal 6 también (`eca7ddef…`); el **canal 5 cambió**
(`2d943e40…` 637 B → `dec4018b…` 638 B) ⇒ la playlist es **viva** y puede rodar
durante la ventana. Cualquier caché debe asumir cuerpo cambiante (TTL corto).

**Δ TTFB loopback − `X-APE-Upstream-Ms` ≈ 31–51 ms** por muestra pareada: coste del
handler Lua (rebase/UHD/`lab.floor_for`; el gateway vivo no tiene fusible, §2.1) +
generación de la respuesta. **No se atribuye causalmente en FASE 0**; candidato a
instrumentar en la fase 6. (El `lab.get()` cachea 60 s en `lab_config`, pero sirve el
JSON decodificado por request; medirlo es parte de la fase 6.)

### 5.3 Hops (intercambios HTTP demostrables, **no** hops IP)

| Ruta | Cadena | Hops probados | Evidencia |
|---|---|---:|---|
| Lista | cliente → 443 estático (`gzip_static`+`gunzip`) | **1** | 0 cabeceras `X-APE-*`; sin Lua ni 8088 |
| `/cdn/` | cliente → 443 (proxy) → 8088 (gateway Lua) → proveedor → **302** → CDN | **3 + ≥1 redirect = 4** | `X-APE-CDN` presente ⇒ sirvió el 8088; `X-APE-Origin` host ≠ host pedido ⇒ ≥1 redirect seguido; `MAX_HOPS=3` configurado |

### 5.4 Overhead del doble hop (443 vs 8088, warm, sin TLS)

| Ruta | n | p50 | min | max |
|---|---:|---:|---:|---:|
| `https://…/ape/health` (443, proxy → 8088) | 7 | **0,2 ms** | 0,2 | 0,2 |
| `http://127.0.0.1:8088/_ape/health` (directo) | 7 | **0,1 ms** | 0,1 | 0,2 |
| **Overhead del hop extra** | 7 | **≈ 0,1 ms** | — | — |

Cada muestra es la **2.ª transferencia** de una misma invocación `curl` (keep-alive):
aísla el hop sin handshake TLS. La 1.ª transferencia (fría, con TLS) mide ~26–32 ms
(cert + handshake), no el hop.

### 5.5 `/_ape/health` — `error_ratio` y contadores

| Campo | ANTES | DESPUÉS | Δ |
|---|---:|---:|---:|
| `requests` | 91 | 109 | **+18** (las del arnés) |
| `all_failed` | 24 | 24 | **+0** |
| `error_ratio` | **0,2637** | **0,2202** | −0,0435 |
| intentos fallidos reales² | 24 / 115 = **20,9 %** | 24 / 133 = **18,0 %** | — |
| `last_latency_ms` | 668 | 752 | — |
| `bytes` (contador Lua) | 57.660 | 69.169 | +11.509 |
| `rebase_ok` | 91 | 109 | +18 |
| `upstreams_down` | 0 | 0 | 0 |
| `host_down:line.tivi-ott.net` | 3 | 3 | (contador con TTL 15 s; no implica caída actual) |

**Lectura honesta:** el `error_ratio` **acumulado desde el reload** (2026-10-25 23:35 UTC)
se calcula como `all_failed / req` (`ape_obs.lua:62`, vivo ≡ repo) y **`req` solo cuenta
éxitos** (`ape_gateway.lua:257`, vivo). Por eso el valor **no es una tasa de error**: 24
fallos / 91 éxitos = ratio 0,2637 ⇒ **18,0 % de intentos fallidos** (24 de 115), no 26,4 %.
El arnés añadió 18 peticiones **todas 200**, por eso el ratio **bajó**. Los 24 fallos son
reales pero **intermitentes**; no se puede concluir “proveedor caído”. La fase 6 debe (a)
exponer el fallo **por petición** (motivo y host) y (b) corregir la fórmula a
`fallos / (éxitos + fallos)`.

² `intentos fallidos reales = all_failed / (requests + all_failed)`.

**Lecturas posteriores de la misma variable viva (fuera del run):** `20:24:17Z` →
118 éxitos / 28 fallos (`error_ratio` 0,2373; **19,2 %** de intentos); `20:27:25Z` →
137 éxitos / 41 fallos (`error_ratio` 0,2993; **23,0 %** de intentos). Entre el fin del
run (20:21:33) y 20:27:25 se añadieron **+28 éxitos y +17 fallos** (45 intentos, 37,8 %
fallidos en esa ventana): el fallo **sigue ocurriendo** y el ratio depende del tráfico.
El watchdog `ape-meta-watchdog` solo consulta `/_ape/health` y **no** incrementa estos
contadores; el tráfico es de consumidores reales del plano `/cdn/`.

### 5.6 Descomposición del TTFB (por qué el “708 ms” no es el hop)

Para el canal 3 desde el cliente (p50): **1.083,5 ms ≈ 266,8 ms (setup TCP+TLS, ~2 RTT)
+ 704 ms (fetch proveedor+302) + ~112,7 ms (último RTT Bogotá↔Ashburn)**. El suelo de
RTT medido con la lista keep-alive es ~110 ms. **El 65 % del TTFB del manifiesto es el
fetch al proveedor.** El hop 443→8088 aporta **~0,1 ms** (medido en §5.4).

---

## 6 · Lectura por fase (qué puede mover cada una y con qué número se valida)

| Fase | Baseline que la gobierna | Qué puede mover | Métrica de aceptación propuesta | Riesgo / nota |
|---|---|---|---|---|
| **1 · HTTP/2 en 443** | B1: no hay h2; keep-alive h1 = 110,6 ms | Conexiones y multiplexación; **no** el RTT de una petición | `curl --http2` → `http_version=2`; ALPN `h2`; sin error de `nginx -t` | Cambio de `listen` ⇒ backup + `nginx -t` + reload en ventana. No tocar `gzip_static/gunzip`. |
| **2 · Colapsar 443→8088** | B2: hop = **≈0,1 ms** | Simplicidad, una sola implementación, menos superficie | Mismo cuerpo/status; hop eliminado; TTFB **sin regresión** | **No vender latencia.** Debe preservar `/_ape/_fetch` y el rebase. |
| **3 · Caché del destino del 302 (30–60 s)** | B3: `X-APE-Upstream-Ms` p50 704–750 ms; origen final `185.227.34.195:80` | El **único** margen real hacia <350 ms | `X-APE-Upstream-Ms` p50 **<350 ms** y 0 regresiones de cuerpo/status | El 302 lleva token por petición (doc del gateway); el cuerpo rota (canal 5). Hay que medir el **split** primer-hop vs CDN antes de prometer. `proxy_cache_valid 302=0` sigue vigente. |
| **4 · Guard de verdad UHD** | Manifiestos servidos son media playlists (`X-APE-UHD: off`); masters no medidos en esta ventana | Metadata UHD (sin tocar CODECS) | Reglas GOLDEN RULE/L153 intactas; ninguna declaración no sostenible | Fuera de FASE 0 funcional; no medido aquí. |
| **5 · ETag/304 y micro-caché del manifiesto** | B5: ETag fuerte (gzip) vs débil (gunzip); `Cache-Control` 300 s; cuerpo rota | Bytes y latencia en clientes que revalidan | `304` correcto con **ambos** ETags; `304` rate; sin 304+0 B | Tóxico solo hacia proveedor; un `If-None-Match` del cliente al VPS es legítimo, pero hay que probar ambas representaciones. |
| **6 · Observabilidad de la decisión** | B4/B5: `error_ratio` acumulado; sin split de proveedor; Δ handler 31–51 ms | Diagnóstico por petición | `provider_fetch_ms`, `hops`, `uhd_mode`, `rebase_pct` en log/cabecera | No bloquear (`log_by_lua`), no `ngx.exit(503)`, no circuit breaker. |

---

## 7 · Límites y honestidad (lo que este baseline **no** prueba)

1. **N pequeño** (3–7 muestras). p95 = máximo; es una línea base punual, no un intervalo de confianza.
2. **Varianza del proveedor:** `X-APE-Upstream-Ms` osciló 649–812 ms entre muestras; los p50 de cliente y loopback se tomaron en momentos distintos (por eso difieren).
3. **El arnés perturba los contadores** de `/_ape/health` (+18 req, +0 fallos): se registra el delta, no se “corrige” el ratio.
4. **No hay split del fetch:** `X-APE-Upstream-Ms` mide proveedor + 302 + CDN juntos. Sin instrumentar el primer hop no se puede afirmar cuánto de los ~700 ms ahorra cachear el destino del 302.
5. **No se miden hops IP** (traceroute). “Hops” = intercambios HTTP demostrables.
6. **El 302 exacto no se expone:** `X-APE-Origin` da el host final, no el número de saltos ni el `Location`.
7. **TTFB cliente incluye TLS** (se reporta aparte `tls_ms`); el keep-alive se midió con HEAD (sin cuerpo) por la ruta gunzip.
8. **Credenciales redactadas:** las URLs de canal se descubren de la lista viva y se guardan como `/live/<USER>/<PASS>/<id>.m3u8`; no se persisten en JSON/log.
9. **Actividad concurrente:** otra sesión del repo ejecutó comandos **read-only** contra el VPS durante la ventana (censo de listas); no toca el plano 443/8088 ni el proveedor.
10. **No se probó 304** ni `If-None-Match` en esta fase (queda para la fase 5, con ambas representaciones).
11. **Drift de configuración:** el hotfix de `/upload.php` (20:22:56–20:23:27 UTC) ocurrió **después** del run canónico. El baseline describe la config `58bee1cb…`; la config viva es `71546564…`. El sanity post-reload demuestra que los endpoints medidos siguen igual (200), pero **cualquier fase posterior debe volver a hashear la config viva antes de aplicar**. El backup de la fase 0 (3 ficheros) sigue siendo el punto de rollback coherente del baseline.

---

## 8 · Reproducción exacta

```bash
# requiere OpenSSH con la llave ~/.ssh/id_ed25519_hetzner y Node >= 18
node _vps_stage/edge/baseline/baseline_edge.mjs --label "E1-FASE0-baseline"

# salida nueva en:
#   _vps_stage/edge/baseline/runs/<STAMP_UTC>/baseline.json
#   _vps_stage/edge/baseline/runs/<STAMP_UTC>/baseline.log
# y copia en runs/latest.json
```

Para comparar fases posteriores: ejecutar el mismo comando y diferenciar
`list.*.stats`, `cdn.*.stats.upstreamMs`, `doubleHop.overheadWarmP50Ms`,
`health.errorRatioBefore/After`. Los parámetros están congelados en el script
(N, endpoints, timeouts); cambiar cualquiera exige nueva versión del arnés y
actualizar este documento.

---

## 9 · Evidencia (rutas y hashes)

| Artefacto | Ruta | sha256 / nota |
|---|---|---|
| Arnés baseline | `_vps_stage/edge/baseline/baseline_edge.mjs` | `423e260dcbf3adfb5dc3b198092aa16595b852239376fb7394d62cc451324089` |
| Backups (script) | `_vps_stage/edge/baseline/phase0_backup.sh` | `2273fb4e2dba6e237f6b736ee013208c5930f2def52767d61876977508afa411` |
| Verificación (script) | `_vps_stage/edge/baseline/phase0_verify.sh` | `79038493860097d4d6b0f64ae42163fecad5c8134b6eded59e7a34328b678882` |
| Restore (script) | `_vps_stage/edge/baseline/restore_phase0.sh` | `4d9ff54c403410efde955d0561f1fa9b34d51c0f79e495b952b098bbb1e43e06` |
| Run canónico (JSON) | `_vps_stage/edge/baseline/runs/20261026T202041Z/baseline.json` | 32.951 B |
| Run canónico (log) | `_vps_stage/edge/baseline/runs/20261026T202041Z/baseline.log` | 6.898 B |
| Cabeceras de la lista | `_vps_stage/edge/baseline/runs/20261026T202041Z/list_headers.txt` | 0 `X-APE-*` |
| Sanity post-drift | `_vps_stage/edge/baseline/runs/20261026T202041Z/post_drift_sanity.log` | lista/`/cdn/`/health 200 tras el reload de 20:23:27 |
| Estado final post-run | `_vps_stage/edge/baseline/runs/20261026T202041Z/final_state_check.log` | detecta el drift de `default`; `nginx -t` OK |
| Backups + verificación | `_vps_stage/edge/baseline/runs/20261026T201548Z/phase0_verify.log` | `RESULT=OK` |
| Restore dry-run | `_vps_stage/edge/baseline/runs/20261026T201548Z/restore_dryrun.log` | `RESULT=OK` |
| Snapshot de config viva | `_vps_stage/edge/baseline/live-snapshot/20261026T201548Z/etc/nginx/` | 3 ficheros, sha256 = VPS |

**Entorno del host de medida (cliente):** Windows, Node v24.12.0, curl 8.16.0
(Schannel, **sin** HTTP/2), OpenSSH de Windows. La ruta cliente→VPS es
Bogotá (America/Bogota) ↔ Ashburn; el RTT medido con keep-alive es ~110 ms.
