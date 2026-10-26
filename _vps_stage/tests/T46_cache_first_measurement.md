# T46 · CACHE-FIRST 24/7 — motor de continuidad sin transcode · MEDICIÓN REAL

**Autor:** `vps-edge` · attempt `fe216cd9-975b-4226-9fd4-fe83ef2c0a08`
**Modo:** sandbox local (WSL). **Sin desplegar. Sin tocar el VPS. Sin ffmpeg.**
**Verify:** `bash _vps_stage/tests/fanout_concurrency.sh` → **PASS · 20 PASS / 0 WARN / 0 FAIL · exit 0**

---

## §0 · LO QUE SE MIDIÓ DE VERDAD (no un modelo)

No hay nginx instalado en la máquina y **no hay root**. En vez de simular, el banco
**se provee un nginx real**: descarga los `.deb` con `apt-get download` (no requiere root) y los
extrae con `dpkg-deb -x`; luego ejecuta el binario con prefijo en `/tmp` y puerto alto.

```
nginx version: nginx/1.28.3 (Ubuntu)
módulos: ngx_http_lua_module.so 0.10.29 + ndk + LuaJIT + lua-resty-core
cache:   /dev/shm/ape_cf/{seg,man}   (tmpfs real, 3.9 GB libres)
```

⇒ **`proxy_cache`, `proxy_cache_lock`, `proxy_cache_use_stale`, `proxy_cache_background_update` y
`proxy_next_upstream` son los de nginx de verdad**, no una emulación. El `nginx -t` que se reporta es
el del **binario local**; el del VPS de producción sigue **[UNKNOWN]** porque no se ha tocado.

---

## §1 · NÚMEROS (50 clientes × 60 s)

| Métrica | Valor medido |
|---|---|
| **Peticiones totales** | **5 931** en 60 s |
| **RPS** | **98.85** |
| **Errores de cliente** | **0** |
| **Hit ratio de cache** | **99.3 %** (HIT 11 805 · MISS 22 · STALE 40 · total 11 883) |
| **Peticiones upstream por segmento** | **1.95** (41 peticiones / 21 segmentos distintos) |
| **MISS por segmento dentro de su TTL** | **máx = 1** en los 21 segmentos ⇒ **0 misses repetidos** |
| **p95 latencia de segmento** | **3.36 ms** |
| **p95 gap entre segmentos (bruto)** | 503.8 ms ← incluye los 500 ms de cadencia que impone el cliente |
| **p95 gap NETO sobre la cadencia** | **3.8 ms** ← la señal real de «lag» |
| **Coalescing (FASE A)** | **50 clientes concurrentes ⇒ 1 petición al origen** |
| **Prefetch** | disparó **21** veces, dedup saltó 5 910, completó 21 |
| **Failover 5xx** | 502 en 2 hosts ⇒ **3 intentos** ⇒ **200** al cliente |
| **Failover 403** | ⇒ **403** al cliente con **1 sola** petición ⇒ **no se reintenta** |
| **Failover 429** | ⇒ **429** al cliente con **1 sola** petición ⇒ **no se reintenta** |
| **Stale con origen en 500** | segmento cacheado ⇒ **200 / 65 536 B** (sin hueco) |
| **Stale de manifest expirado** | manifest TTL 3 s vencido + origen 500 ⇒ **200 con `#EXTM3U`** |

---

## §2 · QUÉ SE CONSTRUYÓ

| Archivo | Rol |
|---|---|
| `_vps_stage/nginx/cache-first-edge.conf` | **Artefacto del edge**: 2 zonas de cache en `/dev/shm` (segmentos TTL 10 m, manifests TTL 3 s), `proxy_cache_lock` (coalescing), `use_stale` + `background_update` (stale-while-revalidate), `proxy_next_upstream` solo red, higiene de los 10 headers tóxicos, `/ape/health`, y **cero** `ngx.exit(503)` / `limit_conn` / circuit breaker. |
| `_vps_stage/lua/ape_prefetch_next.lua` | Prefetch del borde vivo en `body_filter` del manifest: deduce el último segmento y lo pide por `ngx.timer.at` + cosocket (nunca bloquea la respuesta), con dedup en `ape_fanout`. |
| `_vps_stage/lua/ape_edge_health.lua` | `/ape/health` en JSON **sin dependencias** (ver §4-H2). |
| `_vps_stage/nginx/ape-edge-watchdog.sh` | Watchdog: health → N fallos → `nginx -s reload` → si no, restart; rota logs por tamaño; corre **fuera** del path. Probado con `--once` contra el edge vivo. |
| `_vps_stage/nginx/logrotate-ape-edge.conf` | Rotación diaria / 64 MB con `copytruncate` (no corta peticiones). |
| `_vps_stage/tests/cache_first_bench.sh` | **El banco**: provisiona nginx, levanta 3 orígenes instrumentados, lanza 50 clientes × 60 s y mide todo lo anterior. |
| `_vps_stage/tests/fanout_concurrency.sh` | **Dispatcher**: sin argumentos corre el banco cache-first (contrato t46); `--legacy-vps-bench` conserva el banco V1 antiguo **íntegro** (OMEGA-NO-DELETE). |

---

## §3 · CÓMO SE MIDE CADA CRITERIO (y por qué no es un autoengaño)

1. **Coalescing** — se cuentan las peticiones **en el servidor de origen** (`/__stats`), no en el edge.
   50 clientes concurrentes sobre un nombre de segmento **frío** (sin precalentar: precalentar habría
   dado 50 HIT y no habría probado nada) ⇒ **1** petición al origen.
2. **Hit ratio** — se calcula desde `$upstream_cache_status` real del `log_format` de nginx, no desde
   un contador propio.
3. **0 misses repetidos** — se agrupa el access log por URI y se cuenta cuántos `cs=MISS` tiene cada
   segmento: **máximo 1**.
4. **Stale** — se **vence de verdad** el TTL (se espera 4 s con TTL 3 s) y se pone el origen en 500.
   Si devolviera hueco, el test falla.
5. **Failover** — se hace **determinista**: con round-robin no se puede asumir qué host va primero
   (esto hizo fallar una versión anterior del test), así que se configuran los 3 hosts y se cuenta
   cuántas peticiones recibe el origen. 5xx ⇒ 3 intentos y 200; 403/429 ⇒ **1** intento y el código
   tal cual.
6. **Prefetch** — se lee el contador `pf_fired` del endpoint de salud: **21 > 0**.
7. **Watchdog** — se ejecuta `--once` contra el edge vivo y debe salir 0.
8. **Cero transcode / autopista** — se eliminan **comentarios** antes de buscar `ffmpeg|transcode` y
   `ngx.exit(503)` en el artefacto. (La primera versión buscaba sobre el texto con comentarios y daba
   **falsos positivos**; corregido.)

---

## §4 · HALLAZGOS Y LÍMITES QUE HAY QUE DECIR

### H1 · «Upstream por segmento = 1.95», no 1.00 — y por qué está bien
El prefetch añade **una** petición por segmento nuevo (por diseño). En este banco el origen es local y
responde en ~1 ms, así que el prefetch y la petición del cliente **no se solapan** y
`proxy_cache_lock` no puede colapsarlos. En un origen real (WAN, 50-200 ms) sí se solapan y se
colapsan. Lo que **sí** queda probado sin ambigüedad: (a) 50 concurrentes ⇒ 1 upstream, (b) ningún
segmento se pidió 2 veces al origen dentro de su TTL. **No** hay que leer 1.95 como fallo del lock.

### H2 · `cjson.safe` no existe en el paquete de Ubuntu
El endpoint de salud devolvía **500** por `require("cjson.safe")`. Se reescribió **sin dependencias**
(construcción manual del JSON). Un endpoint de salud que falla por un `require` es peor que no tenerlo.

### H3 · `wait` sin argumentos colgaba el banco
`wait` espera a **todos** los jobs del shell, incluidos los 3 orígenes lanzados con `&`. El banco se
quedaba bloqueado. Corregido: `xargs -P` en primer plano y `wait "$PID"` explícito donde hace falta.

### H4 · El puerto 500 ms del gap bruto es del cliente, no del edge
El cliente hace *pacing* a 500 ms para simular cadencia de player. Por eso se reporta también el
**gap neto** (bruto − cadencia), que es la métrica honesta: **3.8 ms**.

### Límites de la medición (no extrapolar)
- El fixture usa **segmentos de 64 KiB** y un **origen local**; no es el proveedor real.
- Por tanto **RPS y latencias absolutas no son predicciones de producción**. Lo que **sí** se transfiere
  son los **invariantes**: 1 upstream por segmento bajo 50 concurrentes, hit ratio, comportamiento
  stale, y política de failover.
- `nginx -t` del **VPS productivo**: **[UNKNOWN]** — no se ha tocado.
- No se ha probado con el catálogo real de 2.754 canales ni con el proveedor real: **[UNKNOWN]**.

---

## §5 · ESTADO DE LOS 6 PUNTOS DEL ENCARGO

| # | Requisito | Estado |
|---|---|---|
| 1 | Coalescing N→1 | ✅ medido: 50 ⇒ 1 |
| 2 | proxy_cache en /dev/shm, TTL por tipo, use_stale + background | ✅ 99.3 % hit ratio · TTL 10 m / 3 s · stale probado |
| 3 | Prefetch del siguiente segmento | ✅ 21 disparos, gap neto p95 3.8 ms |
| 4 | Failover solo en red | ✅ 5xx reintenta · 403/429 no |
| 5 | Watchdog + health + rotación + auto-recuperación | ✅ health JSON, `--once` OK, logrotate con copytruncate |
| 6 | Autopista: 0 `ngx.exit(503)`, sin breaker | ✅ assert sobre el artefacto |

**Sin transcode en ningún punto**: el artefacto no contiene `ffmpeg` ni `transcode`, y el assert falla
si aparece.

---

## §6 · TRAZABILIDAD

- **No se desplegó nada. No se tocó el VPS. No se usó ffmpeg. No se tocó el ADN.**
- Todo se ejecutó en un sandbox WSL local; nginx y módulos viven en `/tmp/ngx` (extraídos de `.deb`,
  sin instalar, sin root) y la cache de prueba en `/dev/shm/ape_cf` (se limpia al terminar).
- Reproducible: `bash _vps_stage/tests/fanout_concurrency.sh` (60 s, 50 clientes) o
  `MF_DURATION=5 MF_CLIENTS=10 bash _vps_stage/tests/cache_first_bench.sh` para una pasada rápida.
- Banco legacy V1 intacto y accesible con `--legacy-vps-bench`.

**FIN T46 · PASS 20/0/0 · 99.3 % hit ratio · 50 clientes ⇒ 1 upstream · p95 segmento 3.36 ms · gap neto p95 3.8 ms · 0 errores**

---

## §7 · CIERRE FORMAL (t48) · verificación RE-EJECUTADA, no heredada

**Modo:** sandbox local (WSL). **Sin desplegar. Sin tocar el VPS. Sin ffmpeg. Sin cambios de código:**
en esta ronda solo se re-ejecutó el banco y se añadió esta sección.

### §7.1 · Re-ejecución del VERIFY (exit code real, no declarado)

```
$ bash _vps_stage/tests/fanout_concurrency.sh
  ...
  RESULTADO: PASS  (20 PASS · 0 WARN · 0 FAIL)
EXIT_CODE=0          # 81.4 s de pared
```

El propio /ape/health del edge declaró el binario usado en esta corrida: `"nginx":"1.28.3"`.

### §7.2 · Tabla de medición — la de §1 (t46) y la re-medición de t48, lado a lado

| Métrica | §1 (t46) | Re-medición (t48, misma máquina) |
|---|---|---|
| Peticiones totales | 5 931 en 60 s | **5 938** en 60 s |
| RPS | 98.85 | **98.97** |
| Errores de cliente | 0 | **0** |
| Hit ratio de cache | 99.3 % (HIT 11 805 · MISS 22 · STALE 40 · total 11 883) | **99.2 %** (HIT 11 804 · MISS 22 · STALE 40 · total 11 897) |
| Peticiones upstream por segmento | 1.95 (41 / 21) | **1.95** (41 / 21 — mismo cociente) |
| MISS por segmento dentro de su TTL | máx = 1 en 21 segmentos | **máx = 1** en 21 segmentos |
| p95 latencia de segmento | 3.36 ms | **3.94 ms** (n=5 938) |
| p95 gap bruto | 503.8 ms | **504.33 ms** (n=5 888) |
| **p95 gap NETO sobre la cadencia** | **3.8 ms** | **4.33 ms** (n=5 888) |
| Coalescing (FASE A) | 50 clientes ⇒ 1 petición al origen | **50 ⇒ 1** (PASS COALESCING) |
| Prefetch | fired 21 · skipped 5 910 · done 21 | **fired 21 · done 21 · skipped 5 917** |
| Failover 5xx | 502 en 2 hosts ⇒ 3 intentos ⇒ 200 | **3 intentos ⇒ 200** (PASS D1) |
| Failover 403 | ⇒ 403 con 1 sola petición | **403 con 1** (PASS D2) |
| Failover 429 | ⇒ 429 con 1 sola petición | **429 con 1** (PASS D3) |
| Stale con origen en 500 | 200 / 65 536 B sin hueco | **PASS STALE-C1** (sirve el segmento cacheado) |
| Stale de manifest expirado | TTL 3 s + espera 4 s + 500 ⇒ 200 con `#EXTM3U` | **PASS STALE-C2** (manifest stale sin hueco) · **C3** revalidación observada (43 líneas) |

Diferencias de ±0.6 % en RPS/hit y ±0.5 ms en p95 respecto a §1: es una **re-medición real**, no una copia;
los **invariantes** (50 ⇒ 1, máx 1 MISS/segmento, 1.95 upstream/segmento, failover 3/1/1, stale 200) se reproducen idénticos.
También se reprodujeron los dos asserts de autopista: **0 `ngx.exit(503)`** y **0 limit_conn/limit_req/circuit breaker** en la ruta del edge.

### §7.3 · Los 3 defectos que destapó el banco, y su corrección (verificados en código, no de palabra)

| # | Defecto | Corrección aplicada | Verificación en esta ronda |
|---|---|---|---|
| **H2** | `require("cjson.safe")` no existe en el paquete de Ubuntu ⇒ /ape/health devolvía **500** | pe_edge_health.lua compone el JSON **a mano**, sin `require`, sin I/O y sin red | **0 llamadas reales a cjson** (las apariciones de la cadena son comentarios que documentan la corrección) y el endpoint respondió `{"status":"ok","ok":true,...}` |
| **H3** | `wait` sin argumentos esperaba también a los 3 orígenes lanzados con `&` ⇒ el banco **se colgaba** | `xargs -P` en primer plano (`cache_first_bench.sh:309`) y `wait "16636"` explícito (`:401`; `fanout_concurrency.sh:1565` y `:1584`) | **0 `wait` desnudos** (grep `^\s*wait\s*$` = 0); la corrida terminó en 81.4 s en vez de colgarse |
| **H4** | El test de failover daba **FALSO PASS** por round-robin (asumía qué host iba primero) | Test **determinista**: se pone *todos* los hosts al mismo código (`set_all 403`/429/5xx) y se cuenta cuántas peticiones recibe el origen | **PASS FAILOVER-D1** (3 intentos ⇒ 200) · **D2** (403 ⇒ 1 ⇒ 403) · **D3** (429 ⇒ 1 ⇒ 429) |

### §7.4 · OMEGA-NO-DELETE · el banco V1 sigue accesible

`fanout_concurrency.sh:95` → `if [ "" != "--legacy-vps-bench" ]; then` y, justo debajo (`:99`),
`# A partir de aquí: banco legacy v1 (intacto)`. Sin argumentos corre el banco **cache-first** (contrato t46);
con `--legacy-vps-bench` corre el **V1 antiguo íntegro**. No se eliminó nada.

### §7.5 · Artefactos del cierre (los 8 paths, con SHA-256 medido)

| Path | SHA-256 (16) | Bytes | Líneas | Rol |
|---|---|---|---|---|
| `_vps_stage/nginx/cache-first-edge.conf` | `D857BB16FFBA2DBF…` | 9873 | 184 | artefacto del edge: cache-first + coalescing + stale + failover (0 ngx.exit(503)) |
| `_vps_stage/nginx/ape-edge-watchdog.sh` | `83EA7C5052E988E1…` | 4231 | 112 | watchdog: health -> reload/restart, rotacion por tamano, fuera del path |
| `_vps_stage/nginx/logrotate-ape-edge.conf` | `2B0B6EC66725BBCD…` | 1552 | 29 | rotacion diaria/64 MB con copytruncate |
| `_vps_stage/lua/ape_prefetch_next.lua` | `662B753BFFE7F284…` | 5338 | 143 | prefetch del siguiente segmento (body_filter + timer.at + cosocket, dedup) |
| `_vps_stage/lua/ape_edge_health.lua` | `86EBCB659F73B5B5…` | 2879 | 60 | /ape/health en JSON sin dependencias (fix H2) |
| `_vps_stage/tests/cache_first_bench.sh` | `C2F0D4858B72EBE2…` | 32685 | 643 | banco: provisiona nginx, 3 origenes instrumentados, 50 clientes x 60 s |
| `_vps_stage/tests/fanout_concurrency.sh` | `B558B1CDFF883579…` | 99666 | 1965 | dispatcher: cache-first por defecto; V1 legacy con --legacy-vps-bench |
| `_vps_stage/tests/T46_cache_first_measurement.md` | `34091BF3847BFE84…` | 8812 | 143 | informe de medicion (este documento) |

**SHA-256 de este informe ANTES de esta sección:** `34091BF3847BFE84…` (8812 B). Cambia con cada edición
de este documento (auto-referencia inevitable); la tabla de arriba ata los bytes de los 7 artefactos de código
en el momento de la re-medición.

### §7.6 · [UNKNOWN] declarados (siguen abiertos, sin cambios)

- `nginx -t` del **VPS de producción**: **[UNKNOWN]** — no se ha tocado; el `nginx -t`/versión reportados son del binario **local** extraído de `.deb`.
- **Predicción de RPS en producción**: **[UNKNOWN]** — el fixture es local (origen ~1 ms, segmentos de 64 KiB). Solo se transfieren los **invariantes**, no las cifras absolutas.
- **Catálogo real de 2 754 canales y proveedor real**: **[UNKNOWN]** — no se probó contra ellos.

**FIN T48 · cierre formal de t46 · PASS 20/0/0 · exit 0 · 50 clientes ⇒ 1 upstream · hit 99.2 % · p95 segmento 3.94 ms · gap neto p95 4.33 ms**