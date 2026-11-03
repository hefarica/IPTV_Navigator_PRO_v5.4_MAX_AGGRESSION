# E7 · OBSERVABILIDAD DE LA DECISIÓN — métricas del plano de metadata

**Fase 6 del plan edge.** Entrega **staged** (no desplegada): artefactos en `_vps_stage/edge/E7_observability/**`,
pruebas en `runs/**`, y este documento. La aplicación en producción es de **E10** (ventana §4), con los
scripts de `apply_E7.sh` / `rollback_E7.sh` ya probados en seco.

- Fecha de medición: **2026-10-26 20:44–20:53 UTC**
- VPS: `ubuntu-2gb-ash-1` · nginx **1.24.0 (Ubuntu)** · `libnginx-mod-http-lua` (LuaJIT, Lua 5.1) · lua5.1.5 en el sistema
- MainPID **2001835**, `NRestarts=0` durante toda la fase; **cero recargas propias**. HTTP/2 ya está activo en 443 (fase 1 de E2, aplicada a las 20:53Z), así que la familia `edge` empieza a registrar h1 **y** h2.
- Bytes de producción contra los que está pineado: `ape_gateway.lua` `2dc0fad8…`, `ape_obs.lua` `f477741b…`,
  `conf.d/50-ape-meta-plane.conf` `3e29b928…`

---

## 1 · Qué se entrega

| Fichero | Qué es |
|---|---|
| `lua/ape_obs_metrics.lua` | **Librería**: registro O(1) en fase log + agregación ventaneada + percentiles. Sin dependencias. |
| `lua/ape_obs_rec.lua` | Handler `log_by_lua` del gateway: vuelca la decisión (`ngx.ctx.ape_dec`) al dict. |
| `lua/ape_obs_http.lua` | Handler `log_by_lua` de borde (familia `e:`): `request_time`, `upstream_response_time`, status, h1/h2. |
| `lua/ape_log_chain.lua` | Encadena **wake-on-manifest (existente, intacto)** + `ape_obs_http` en `/meta/` (un solo `log_by_lua` por location). |
| `lua/ape_obs_metrics_api.lua` | Endpoint `GET /_ape/metrics` (solo loopback): JSON con ventana deslizante. |
| `patches/0001-ape_gateway-decision.patch` | Gateway: `meta` de hops/timings en `fetch_follow` + `ngx.ctx.ape_dec` en los 4 desenlaces. |
| `patches/0002-ape_obs-error-ratio.patch` | **Arregla `error_ratio`** (fallos/intentos) y publica 6 contadores que ya existían pero no se veían. |
| `patches/0003-50-ape-meta-plane-e7.patch` | 2 `log_by_lua` + `location = /_ape/metrics`. Nada más. |
| `scripts/preflight_E7.sh` | Preflight **sin tocar producción**: `luac5.1 -p`, selftest, `nginx -t` sobre copia en `/tmp`, dry-run de parches, prueba de que los bytes vivos no cambiaron. |
| `scripts/apply_E7.sh` | Aplicación en ventana: hash-pin, backup, parches, `luac5.1 -p`, `nginx -t`, **reload**, smoke, **rollback automático** ante cualquier fallo. |
| `scripts/rollback_E7.sh` | Vuelta a los bytes del backup + reload + verificación (incluye `/ _ape/metrics → 404`). |
| `scripts/probe_remote.sh` + `tools/e7_obs.mjs` | Arnés: `probe` mide el baseline **sin desplegar**; `read` consulta `/ _ape/metrics`; `watch` calcula percentiles **de la ventana** por deltas. |
| `tests/stub_ngx.lua` + `tests/selftest_obs.lua` | 60 aserciones de la librería en **Lua 5.1.5 real** con `ngx` simulado. |
| `runs/**` | Evidencia: preflight, selftest, dos `probe` (con y sin el breaker de 15 s), snapshots. |

---

## 2 · Contrato de métricas

Todas se registran en **`log_by_lua`**, es decir **después de enviar el último byte al cliente**: el jugador
no espera por ellas. El content handler solo deja una tabla local (`ngx.ctx.ape_dec`) con números que ya
tenía calculados. Presupuesto declarado en cada respuesta (`cost`): **0 escrituras en ruta caliente**,
≈14 `incr` de shared dict por petición, ≈330 claves máximas en `ape_qoe` (≈35 KB de 1 MB), TTL 35 min.

Sobre el dict existente `ape_qoe` — **no se añade ningún `lua_shared_dict` nuevo** (eso exigiría tocar el
contexto `http` y no aporta nada).

**Cómo se comprueba que el registro no cuesta en la ruta caliente (E9).** El registro corre en `log_by_lua`,
una fase que nginx ejecuta **después** de enviar el último byte; el coste (≈14 `incr` en memoria del worker)
no puede aparecer en el TTFB. Verificación empírica: el mismo `node tools/e7_obs.mjs probe --samples 5`
antes y después del despliegue, sobre los mismos 3 canales — `provider_fetch_ms` y `TTFB cliente` deben
quedar dentro del ruido (§4.1 es la referencia) y `/_ape/metrics` debe declarar `cost.hot_path_writes=0`.

| Métrica | Definición exacta | Denominador | Nota |
|---|---|---|---|
| **`provider_fetch_ms`** | `X-APE-Upstream-Ms`: fetch al proveedor **+** seguimiento del 302, medido dentro del gateway. Publica p50/p90/p95/p99 por histograma de 16 buckets e **interpolación lineal** (la media es exacta; el percentil es una estimación con su rango de bucket publicado). | **solo decisiones 2xx** | Un fallo rápido (connection refused) hundiría el p50 y fingiría una mejora: los fallos se cuentan en `errors`, no aquí. |
| **`provider_fetch_split`** | `first_hop_ms` = primer hop (proveedor) y `last_hop_ms` = último hop (CDN tras el 302), medias exactas + n. | decisiones 2xx | Es el dato que **faltaba** para dimensionar la fase 3 (ver §5.1). |
| **`hops`** | nº de redirects seguidos por la petición (0..3), distribución + `mean` + `redirects_total` + `exhausted` (agotó `MAX_HOPS=3`) + `attempts` (candidatas realmente intentadas). | todas las peticiones | `exhausted>0` es un fallo real de configuración, no ruido. |
| **`uhd_mode`** | `off` \| `4k` \| `8k` \| `blocked` **solo en masters**; las media playlists se cuentan aparte (`na`). `blocked` = `hev1` en `CODECS=` ⇒ GOLDEN RULE, UHD omitido (no se declara codec imposible). | masters servidos | `declared_pct`, `blocked_pct`, `variants_total` (variantes tocadas). |
| **`rebase`** | `rebase_pct` = % de playlists servidas con ≥1 URI rebasada; separado `media_rebase_pct` y `master_rebase_pct`; + `uris_total`, `attrs_total`, `uris_per_playlist`. | playlists 2xx | **Mide trabajo, no corrección.** Un master con URIs absolutas del CDN no rebasa nada y no es un defecto: la corrección se verifica con `probe` (`absolute_uri_pct`). |
| **`errors`** | `ok`, `upstream_fail` (fallo real: se habló con el proveedor), `fast_fail` (no se habló: todas marcadas caídas por el circuito `down:`), `denied` (allowlist), `too_large`; **`error_ratio = fallos / INTENTOS`**. | intentos = ok+fail+ffail+denied+too_large | **Fix de D-67**: antes era `all_failed / req` con `req` = solo éxitos. |
| **`edge`** (familia `e:`) | `request_time` y `upstream_response_time` medios por location, reparto de status, contador h1/h2, bytes. | peticiones en las locations instrumentadas | Sirve para cuantificar el doble hop 443→8088 y el efecto de HTTP/2 sin tocar la lista. |
| **`cumulative`** | Los contadores de siempre (`req`, `all_failed`, `rebase_ok`, `redirects`, `cdn_denied`, `too_large`, `uhd4k`, `uhd8k`, `bytes`, `last_*`) + `error_ratio_cum` corregido. | acumulado del worker | Por compatibilidad y para no romper el ancla `#EXT-X-APE-CDN-QOE:/_ape/qoe` de las listas. Siguen **en cuarentena D-67**: no son citables como QoE. |

**Ventana**: 6 slots de 300 s (30 min de cobertura). Cada respuesta publica `window.slots`,
`window.coverage_s` y `window.partial_age_s` (el slot en curso es parcial). No hay percentil "de toda la
vida" **a propósito**: mezclar épocas es lo que hizo inútil el `error_ratio` acumulado.

---

## 3 · Cómo se consultan

### 3.1 · Endpoint (post-despliegue, solo loopback)

```bash
# en el VPS
curl -s http://127.0.0.1:8088/_ape/metrics | python3 -m json.tool | head -40
curl -s 'http://127.0.0.1:8088/_ape/metrics?window=1800'        # 30 min
curl -s 'http://127.0.0.1:8088/_ape/metrics?cumulative=0'       # sin contadores viejos
```

Campos de primer nivel: `provider_fetch_ms`, `provider_fetch_split`, `hops`, `uhd_mode`, `rebase`,
`errors`, `edge`, `cumulative`, `window`, `cost`, `available`.

### 3.2 · Arnés desde el workstation (lo que se usa para decidir)

```bash
cd _vps_stage/edge/E7_observability

node tools/e7_obs.mjs probe                 # baseline SIN desplegar (cabeceras X-APE-*)
node tools/e7_obs.mjs probe --samples 5 --split 3 --json
node tools/e7_obs.mjs read                  # tabla + contraste con el sobre esperado
node tools/e7_obs.mjs read --strict         # exit 1 si algo rompe el sobre
node tools/e7_obs.mjs watch --window 300 --interval 300 --count 2   # Δ de la ventana
```

`read` hace además una **validación cruzada Lua↔JS** del histograma: recalcula el p50 desde los buckets
publicados con la misma fórmula y avisa si discrepan >2 ms (detecta que alguien cambió `M.MS_BOUNDS` en un
solo lado). `watch` resta buckets entre dos lecturas ⇒ percentiles **de la ventana Δ**, no acumulados.

Antes del despliegue, `read` devuelve:

```
/_ape/metrics → 404: la fase 6 aún NO está desplegada.
Mide el baseline con cabeceras:  node tools/e7_obs.mjs probe
```

### 3.3 · Health (siempre, sin desplegar nada nuevo)

`GET http://127.0.0.1:8088/_ape/health` ya publica `checks.attempts`, `checks.fail_total`,
`checks.error_ratio` (corregido), `checks.error_ratio_legacy` (el viejo, para auditar el cambio) y, cuando el
módulo está desplegado, un bloque `window` con 5 min (attempts, error_ratio, p50/p95, hops_mean,
uhd_declared_pct, rebase_pct) y el enlace `endpoint:"/_ape/metrics"`.

---

## 4 · Valores esperados del baseline (medidos, no inventados)

### 4.1 · `probe` canónico — run `runs/20261026T205226Z` (20:52:00→20:52:30 UTC, 3 canales, 15 muestras)

| Métrica | Valor medido | Sobre esperado (`e7_obs.mjs`, WARN fuera / FAIL ×2) |
|---|---|---|
| `provider_fetch_ms` n | 15/15 ok | — |
| `provider_fetch_ms` **p50** | **770 ms** | **[500, 950]** |
| `provider_fetch_ms` p90 / **p95** / p99 | 882 / **915** / 954 ms | p95 **[700, 1800]** |
| `provider_fetch_ms` mean (min–max) | 780 ms (659–963) | — |
| `provider_fetch_split` **primer hop** | p50 **413** / mean 393 ms | **[300, 900]** |
| `provider_fetch_split` **último hop (CDN)** | p50 **439** / mean 420 ms | — |
| `hops` (curl -L, 3 canales) | **1, 1, 1** ⇒ media **1,0** (MAX_HOPS=3) | **[0,4, 1,8]** |
| `hops.exhausted` | 0 | **[0, 0]** (cualquier valor >0 es FAIL) |
| TTFB cliente (loopback) p50 | 804 ms | — |
| Δ(TTFB − upstream) p50 | **33,3 ms** | — |
| `uhd_mode` | 15× `off` (todas **media playlists**) + `na` | `declared_pct` **[50, 100]** *solo si hay masters* (con 0 masters ⇒ n/a) |
| `uhd_mode.blocked_pct` | 0 | **[0, 0]** |
| `rebase.media_rebase_pct` | **100 %** (90 URIs rebasadas, 6/playlist) | **[90, 100]** |
| `absolute_uri_pct` (corrección del rebase) | **100 %** (0 relativas de 90) | **[100, 100]** invariante |
| `errors.error_ratio` (esta ventana) | **0,0** | **[0, 0,5]** |
| `errors.error_ratio` (día, acumulado) | 131 fallos / 778 intentos = **16,8 %** | — |
| Origen final tras el 302 | `185.227.34.195:80` | — |

### 4.2 · Descomposición del TTFB (lo que el jugador paga)

```
TTFB p50 804 ms ≈ 413 (primer hop: proveedor → 302) + 439 (CDN: cuerpo de la playlist) − solape + 33 (handler + loopback)
```

### 4.3 · Run con el breaker antiguo (`20261026T204849Z`, 20:48:38→20:48:53, **antes** del cambio de otro lane)

| Métrica | Valor |
|---|---|
| muestras ok | **6/15** (`error_ratio` 0,60) |
| `provider_fetch_ms` (2xx) | n=6, p50 **700,5** / p95 796,8 / mean 727 (680–799) |
| patrón | 1 fallo real ⇒ **11 fallos instantáneos** (502 en 30–50 ms, 121 B, sin cabeceras `X-APE-*`) |

El 502 rápido no era el proveedor: era el **circuito blando `down:<host>` de 15 s** del gateway
(`ape_gateway.lua` antiguo: `if not HOSTS:get(dk) then … set(dk,1,15)`). Es decir, **un solo fallo real
secuestraba 15 s de todas las peticiones de ese host**. Eso explica el `error_ratio` "intermitente" del
baseline E1 (0,22–0,29): no era un proveedor caído, era un amplificador.

**Ventana posterior al cambio (20:52:30 → 20:57:23 UTC, 4 min 53 s):** eq 647 → **821** (+174) y ll_failed
131 → **133** (+2) ⇒ **1,15 % de fallos** frente al **16,8 %** acumulado del día y el 23 % que se citaba en E1.
Ventana corta y con salud de proveedor variable: es evidencia de que el amplificador explicaba la mayor parte,
no una promesa de que el proveedor ya no falla. Con el breaker fuera, un fallo real ahora **tarda** (3–60 s de
timeout) en vez de devolver 502 en 30 ms, y rrors.fast_fail queda a 0 como centinela.

> **Contexto de coordinación:** a las **20:49:57 UTC** —entre mis dos medidas— otra sesión desplegó
> `ape_gateway.lua` `2dc0fad8…` **eliminando ese breaker** («breaker ELIMINADO (autopista: siempre
> intentar)»). Mis dos runs son, de facto, un experimento natural antes/después: **6/15 → 15/15 ok**.
> E7 se ha **re-pineado** a los bytes nuevos (los parches se regeneraron y el preflight volvió a verde).

---

## 5 · Hallazgos que cambian el plan

*(Todo medido en esta fase; cada uno con su número y su consecuencia.)*

### 5.1 · La caché del destino del 302 **no puede** llegar a <350 ms sola

El split medido es casi **mitad y mitad**: primer hop (proveedor + 302) **≈413 ms**, hop del CDN **≈439 ms**.
Si la fase 3 cachea el destino del 302 durante 30–60 s, elimina el **primer hop**, no el segundo:
el suelo es **≈440–470 ms** (CDN + handler), no <350 ms. Para bajar de ahí haría falta cachear también el
**cuerpo** del CDN — y el 302 lleva **token por petición** (documentado en el propio gateway), así que una
caché de 30–60 s del destino puede servir un token caducado. Recomendación para E4: medir el acierto real
del token antes de prometer el número; y re-etiquetar el objetivo como «~40 % menos» en lugar de «<350 ms».

### 5.2 · El `error_ratio` del baseline estaba doblemente falseado

1. **Fórmula**: `all_failed / req` con `req` contando **solo éxitos** ⇒ 131/647 = 20,25 % publicado frente al
   **16,8 %** real de intentos (131/778). El parche 0002 lo corrige y deja `error_ratio_legacy` visible para auditar.
2. **Amplificador**: el circuito `down:` de 15 s convertía 1 fallo real en ~11 fallos (5.4.3). Ya eliminado por
   otro lane; `errors.fast_fail` queda como centinela por si se reintroduce.

Además, el acumulado está **envenenado por nuestras propias sondas** (D-67) y sigue en cuarentena. La
métrica **citable** pasa a ser `errors.error_ratio` **ventaneado** (≤30 min), que arranca limpio por diseño.

### 5.3 · `uhd_mode` en tráfico real es casi siempre `na`, no `off`

Los 15/15 muestreos de `/cdn/` devolvieron **media playlists** (`X-APE-UHD: off`, sin `EXT-X-STREAM-INF`).
Los masters (donde vive la declaración 4K/8K) solo aparecen si el jugador pide un master. Contarlos juntos
habría dado un `declared_pct` deprimido y falso: por eso el denominador son **solo masters**.

### 5.4 · El rebase es correcto (100 %) y ahora se puede demostrar en la misma consulta

`rebase_pct=100 %` **y** `absolute_uri_pct=100 %` (0 URIs relativas de 90 servidas). La primera mide trabajo,
la segunda mide el invariante metadata-only. Ambas quedan registradas.

### 5.5 · El proveedor exige UA de navegador (461 si no)

Medido: `curl/8.5.0` → **HTTP 461**; `Mozilla/5.0` → **302** en ~0,29–0,39 s. El gateway ya manda
`User-Agent "Mozilla/5.0"`, por eso funciona; el arnés tuvo que imitarlo (primer intento del `probe` medía
461 y se descartó esa corrida). Consecuencia: cualquier monitorización externa con UA por defecto medirá un
falso «proveedor caído».

### 5.6 · Drift de producción durante la fase (y cómo se maneja)

`ape_gateway.lua` cambió a las 20:49:57 UTC (breaker fuera) y `sites-enabled/default` a las 20:22/20:49
(403 de `/upload.php`, bloqueo SSRF de `/cdn/` a rangos privados, y `\.(ts|m4s|mp4) → 404` bajo `/cdn/`).
Ninguno de esos cambios es de E7 y **ninguno se ha tocado aquí**. El preflight **abortó en rojo** al detectar
el hash distinto — el guard funciona — y E7 se re-pineó a los bytes nuevos antes de volver a verde.

---

## 6 · Defectos corregidos (parche 0002, `ape_obs.lua`)

| # | Defecto | Corrección |
|---|---|---|
| D-1 | `error_ratio = all_failed / req` con `req` = solo éxitos | `fail_total / attempts`, `attempts = req + all_failed + cdn_denied + too_large`; se publica `error_ratio_legacy` para comparar |
| D-2 | `redirects`, `cdn_denied`, `too_large`, `uhd4k`, `uhd8k`, `last_origin` se **escribían pero no se publicaban** | añadidos a `METRICS`: el 302 seguido, las denegaciones de allowlist y las omisiones de UHD dejan de ser invisibles |
| D-3 | `get_keys(Q, 500)` podía truncar al crecer el dict | tope 1000 bajo `pcall` (el dict pasa a ~330 claves) |
| D-4 | `/ _ape/health` no distinguía intentos de éxitos | `checks.attempts`, `checks.fail_total`, `checks.error_ratio_semantics` + bloque `window` (5 min) |

**No se toca**: `plane`, `qoe`, `hosts_down`, `flags`, ni el endpoint público `/ape/health` (sigue mínimo).

---

## 7 · Contrato de no-regresión (lo que E10 debe poder comprobar)

Invariantes que la fase 6 **no** puede romper y cómo se verifican tras el reload (`apply_E7.sh` §6):

1. `/_ape/qoe` y `/_ape/health` → **200** y con la misma forma (el watchdog `ape-meta-watchdog` y el ancla
   `#EXT-X-APE-CDN-QOE:/_ape/qoe` de las listas dependen de ellos).
2. `/ape/health` público → **200** y mínimo (sin métricas internas). Ojo: vive en el **server 443**; en el 8088 responde 404 a propósito (medido).
3. Lista 4K por 443 → **200** (no se toca `/lists/`, ni `gzip_static`/`gunzip`, ni la regla `.ts→404`).
4. `/_ape/metrics` → **200**, `schema=ape.obs.metrics/1`, `cost.hot_path_writes=0`.
5. `/__selftest_full.m3u8` → **200** (demuestra que el **encadenado** del `log_by_lua` sigue ejecutando el
   wake-on-manifest existente y además registra la familia `e:`).
6. `/cdn/<host no permitido>` por IP pública → **403** (allowlist intacta, sin fetch al proveedor).
7. `/_ape/health` `error_ratio` == `fail_total/attempts` (aritmética verificada con `python3`).
8. `nginx -t` verde, **reload** (no restart), MainPID sin cambiar, `NRestarts=0`.
9. Ante **cualquier** fallo: rollback automático y `RESULT=FAIL` (probado en seco; ver `runs/`).

Prohibiciones respetadas por construcción: no se toca `/var/www/lists`, `/lists/`, `gzip_static`/`gunzip`,
la regla `.ts→404`, `resolve.php`/`origins.php`, `ngx.exit(503)` ni ningún circuit breaker; no se añade
tráfico de vídeo ni se reempaqueta nada.

---

## 8 · Despliegue (E10) y rollback

```bash
# 1 · subir el stage SOLO a /tmp (nunca a producción)
scp -r _vps_stage/edge/E7_observability root@178.156.147.234:/tmp/e7-stage-src

# 2 · preflight (no escribe en /etc/nginx; valida en copia /tmp)
ssh root@178.156.147.234 "STAGE=/tmp/e7-stage-src bash -s" < scripts/preflight_E7.sh

# 3 · ver el diff exacto que se aplicaría (no escribe)
ssh root@178.156.147.234 "STAGE=/tmp/e7-stage-src bash -s -- --check" < scripts/apply_E7.sh

# 4 · aplicar en ventana §4 (backup + parches + nginx -t + reload + smoke + rollback automático)
ssh root@178.156.147.234 "STAGE=/tmp/e7-stage-src STAMP=<stamp> bash -s -- --apply" < scripts/apply_E7.sh

# 5 · rollback si hace falta
ssh root@178.156.147.234 "bash -s -- <stamp> --apply" < scripts/rollback_E7.sh
```

Backups en `/root/backups/edge-e7-<stamp>/` (3 ficheros `.orig` + `SHA256SUMS`, modo 600).

**Regla de drift (obligatoria):** el preflight **aborta** si `ape_gateway.lua`, `ape_obs.lua` o
`50-ape-meta-plane.conf` no tienen el sha pineado. Si otro lane los toca, hay que re-basar (copiar los bytes
nuevos a `live/`, re-aplicar la instrumentación en `stage/`, regenerar el parche, re-pinear `SHA_GW`/`SHA_OBS`/
`SHA_CONF` y volver a pasar el preflight). Ya ha pasado una vez en esta fase (§5.6).

---

## 9 · Verificación ejecutada (evidencia en `runs/`)

| Prueba | Comando | Resultado |
|---|---|---|
| Sintaxis Lua 5.1 (la de LuaJIT) | `luac5.1 -p` vía stdin para los 7 ficheros | **SYNTAX_OK** ×7 |
| Selftest de la librería | `scripts/selftest_lua.sh` (stub `ngx` + 60 aserciones, Lua 5.1.5 real) | **60/60 pass** |
| Compatibilidad 5.1 | escaneo de construcciones 5.2+ (`//`, `goto`, `table.unpack`, `math.type`, `utf8.`, `bit32`) | limpio (los 2 hits de `ape_gateway.lua` son `http://` en strings) |
| `nginx -t` con la config nueva | `preflight_E7.sh` sobre copia en `/tmp` | **syntax is ok / test is successful** |
| Parches contra los bytes vivos | `patch --dry-run` en `/etc/nginx/{lua,conf.d}` | **3/3 DRY-RUN OK** |
| Producción intacta | sha256 antes/después en el preflight | los 3 ficheros siguen iguales; `MainPID 2001835`, `NRestarts=0` |
| Baseline medido | `tools/e7_obs.mjs probe` ×2 (con y sin breaker) | §4.1 y §4.3 |

Reparto exacto de la evidencia:

| Run | Contenido |
|---|---|
| `runs/20261026T154301Z/` | `selftest_lua51.log` (60/60), `luac51_p.log` (7 × SYNTAX_OK), `preflight.log` (primer intento: cazó dos bugs del propio preflight —orden parche/sed y el fixture del wake— y abortó en rojo como debía) |
| `runs/20261026T204849Z/` | `probe` **antes** de que otro lane quitara el breaker (6/15 ok, cascada de fast-fails) + `selftest_lua51_v2.log` (60/60 con `fast_fail`) |
| `runs/20261026T205124Z/` | `probe` **descartado para el split**: el proveedor responde **461** al UA de curl (hallazgo §5.5); sirvió para corregir el arnés |
| `runs/20261026T205226Z/` | **canónico**: `probe.json`/`probe.log` (15/15 ok, split válido), `preflight_final2.log` (RESULT=OK contra los bytes re-pinados), `apply_check_final.log` (RESULT=CHECK) |

Reproducir:

```bash
cd _vps_stage/edge/E7_observability
bash scripts/selftest_lua.sh                       # 60 aserciones en Lua 5.1.5 real
scp -r . root@178.156.147.234:/tmp/e7-stage-src
ssh root@178.156.147.234 "STAGE=/tmp/e7-stage-src bash -s" < scripts/preflight_E7.sh
node tools/e7_obs.mjs probe --samples 5 --split 3  # baseline (≈35 s, sin desplegar)
```

---

## 10 · Límites honestos (lo que estas métricas NO dicen)

- **No son QoE del jugador**: no hay rebuffer, frames perdidos ni startup real. Miden el **plano de metadata**
  (decisión + entrega de la playlist). El VPS no sirve vídeo, así que no puede medir segmentos.
- **`provider_fetch_ms` excluye los fallos** a propósito (§2). Para saber «cuánto tarda el proveedor cuando
  falla» están `errors.*` y `edge.mean_request_ms`; hoy un fallo real tarda 3–60 s (timeouts), no ms.
- **Percentiles por bucket**: la media es exacta, el percentil es una estimación dentro de un bucket de
  25–800 ms (rango publicado junto al valor). Con `n<10` en la ventana el CLI avisa.
- **La familia `edge` solo se llena donde se instala el hook** (`/meta/` en el plan mínimo; `/cdn/` y `.m3u8`
  del 443 son un hook opcional documentado, no aplicado).
- **No hay serie histórica**: el dict es memoria del worker y se pierde con un restart. Para histórico hay que
  exportar (`read --json`) o añadir un `log_format` dedicado (propuesta, no aplicada).
