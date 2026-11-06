# BG14 · Verificación integrada y cierre técnico (ottshim)

**Tarea:** `t52` (BG14 · verification round 1) · **Autor:** `integration-verifier` · **Fecha:** 2026-10-31 (America/Bogota)
**Repo:** `IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` · **HEAD:** `d89c61f` · **`ottshim/` está untracked** (`?? ottshim/`; el binding es por hashes, no por commit)
**Device:** ONN 4K (`onn. 4K Streaming Box`, Android 14 / SDK 34) · serial ADB `192.168.1.7:5555`
**Scope:** `ottshim/**` únicamente. **No se tocó VPS, listas, `/sync`, `/ara` ni `contracts/`.**

## 0 · Veredicto

| # | Criterio | Resultado |
|---|---|---|
| 1 | build/instalación reproducibles y hash registrado | **PASS** — `assembleDebug` exit 0 (dos builds, mismo APK `bbb15ede…`); instalado en ONN; hash del APK instalado == construido |
| 2 | prefetch frío/ratio/caliente con evidencia | **PASS** — cold miss → prefetch → hit sin petición previa; ratio exacto 2/3=0.6667; `lastCacheServeMs` 5–9 ms |
| 3 | SessionTap sin caída por null + buffer stale documentado | **PASS** — SessionTap habilitado/bound, sin sesión objetivo, `controller/playbackState` null tolerados; 0 FATAL; `buffer_stale:null` + `buffer_source:unavailable:no_media_session` + `guard_state:PROXY_ONLY` |
| 4 | no hay cambios fuera de scope | **PASS** — esta tarea solo escribió `ottshim/BG14_VERIFICATION.md` (+ artefactos de build en `ottshim/app/build/**`); 0 escrituras en `vps/**`, `ara-x/vps/**`, `contracts/**`, `IPTV_v5.4_MAX_AGGRESSION/vps/**` |
| 5 | informe final con veredicto y riesgos | **PASS** — este documento (§6 riesgos/límites) |

**Veredicto global: PASS con límites explícitos** (sin sesión de player real en esta pasada; `ottshim` no versionado; residual BG23-01 de ingress). No es un cierre de despliegue: no se despliega nada.

---

## 1 · Build e instalación reproducibles (criterio 1)

Comando literal del contrato (ejecutado dos veces):

```powershell
powershell -NoProfile -Command "Set-Location 'ottshim'; .\gradlew.bat :app:assembleDebug"
```

Salida cruda (build 1):

```text
> Task :app:packageDebug UP-TO-DATE
> Task :app:createDebugApkListingFileRedirect UP-TO-DATE
> Task :app:assembleDebug UP-TO-DATE

BUILD SUCCESSFUL in 1m 23s
34 actionable tasks: 1 executed, 33 up-to-date
```

Salida cruda (build 2, mismo árbol):

```text
> Task :app:assembleDebug UP-TO-DATE

BUILD SUCCESSFUL in 3s
34 actionable tasks: 1 executed, 33 up-to-date
```

`exit 0` en ambas. **Nota honesta:** Gradle reporta `UP-TO-DATE` porque los inputs no cambiaron; no se hizo `clean` (no se altera el artefacto). El hash es estable entre las dos ejecuciones.

| Artefacto | Bytes | sha256 |
|---|---|---|
| `ottshim/app/build/outputs/apk/debug/app-debug.apk` (build 1 y 2) | **1.419.412** | `bbb15edea19c78f888e1a99ced0f423b3fe55a8fb8a9cc1a1c3041cdedce7c0d` |
| APK instalado (extraído con `pm path` + `adb pull`) | 1.419.412 | **idéntico** `bbb15ede…ce7c0d` |

`aapt dump badging`:

```text
package: name='dev.venice.ottshim' versionCode='1' versionName='0.1' platformBuildVersionName='14' platformBuildVersionCode='34' compileSdkVersion='34' compileSdkVersionCodename='14'
sdkVersion:'26'
```

Instalación y estado:

```text
adb -s 192.168.1.7:5555 install -r ottshim\app\build\outputs\apk\debug\app-debug.apk
# Performing Streamed Install
# Success    (exit 0)

adb -s 192.168.1.7:5555 shell pm path dev.venice.ottshim
# package:/data/app/~~3FMHcXVqbJnvAHvda2g9PA==/dev.venice.ottshim-44h0BcftEvGRITrJt7WiJw==/base.apk
# pull ⇒ 1.419.412 B · sha256 bbb15ede…ce7c0d  (== construido)
```

`ProxyService` corre en foreground (`isForeground=true foregroundId=1`), `pid` estable durante todo el test (**25526** en la instancia final), y `SessionTap` está bound (`isBindService:true`).

**Riesgo de reproducibilidad:** `ottshim/` **no está trackeado en git** (`git status --porcelain -- ottshim` ⇒ `?? ottshim/`). El build es reproducible en esta máquina (hash estable), pero **no hay commit/pin**: la identidad del producto es el sha256 del APK + hashes de fuentes (§7).

---

## 2 · Prefetch frío / ratio / caliente (criterio 2)

Fuente pública usada (asset de test de Shaka, VOD con segmentos válidos; **no** es un canal del proveedor):
`https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8` → variante `playlist_v-0144p-0100k-libx264.mp4.m3u8` (94 segmentos `/seg?id=`).

Secuencia exacta (proxy loopback en el ONN; `adb forward` local para aislar el test):

1. `GET /source.m3u8` (master) y `GET /media.m3u8?id=<id>` (media playlist) para poblar el mapa de ids.
2. **Frío:** primer `GET /seg?id=<seg1>` ⇒ miss limpio ⇒ upstream.
3. Espera a que el prefetch del **siguiente** segmento termine (`pending` 1→0).
4. **Caliente:** `GET /seg?id=<seg2>` (nunca pedido antes) ⇒ debe ser **hit** por prefetch.
5. **Caliente 2:** `GET /seg?id=<seg1>` de nuevo ⇒ hit.

Snapshots de `/health` (crudos, campos clave):

| Momento | cache_hits | cache_misses | hit_ratio | media_segments_served | lastCacheServeMs | pending |
|---|---|---|---|---|---|---|
| baseline (proxy recién arrancado) | 0 | 0 | `null` | 0 | 0 | 0 |
| tras source+media | 0 | 0 | `null` | 0 | 0 | 0 |
| tras **GET seg1 (frío)** | 0 | **1** | **0** | 1 | 5 | **1** (prefetch en curso) |
| tras esperar prefetch | 0 | 1 | 0 | 1 | 5 | **0** |
| tras **GET seg2 (caliente)** | **1** | 1 | **0.5** | 2 | 5 | 1 (prefetch siguiente) |
| tras **GET seg1 (caliente 2)** | **2** | 1 | **0.6666666666666666** | 3 | 9 | 1 (prefetch siguiente) |

Respuestas HTTP crudas:

```text
GET /seg?id=<seg1>  (frío)      HTTP 200 bytes=1129349 time=0.935289
GET /seg?id=<seg2>  (caliente)  HTTP 200 bytes=1241550 time=0.163551
GET /seg?id=<seg1>  (caliente2) HTTP 200 bytes=1129349 time=0.086102
```

Logcat crudo (`ottshim`):

```text
10-31 20:00:04.184 ... cache serve 1129349B in 5ms
10-31 20:00:04.185 ... cache hit=0 miss=1 ratio=0%
10-31 20:00:07.667 ... cache serve 1241550B in 5ms
10-31 20:00:07.668 ... cache hit=1 miss=1 ratio=50%
10-31 20:00:08.018 ... cache serve 1129349B in 9ms
10-31 20:00:08.018 ... cache hit=2 miss=1 ratio=66%
```

`/metrics` final (crudo; mismos campos que el comando Verify — `proxy_requests` puede variar por las consultas de health/metrics):

```json
{"segments":0,"segment_gap_ms":0,"transport_stall_suspected":null,"transport_stall_source":"unavailable:no_session","proxy_media_seen":true,"last_bps":0,"ewma_bps":0,"last_ttfb_ms":0,"rebuffer_count":0,"freeze_ms":0,"freeze_source":"unavailable:no_position_samples","last_stall_ms":0,"position_samples":0,"http_errors":0,"http_4xx":0,"http_5xx":0,"responses":6,"last_status":200,"last_error":"","last_stall_at":0,"session_present":false,"player_package":"","player_state":-1,"position_ms":0,"buffered_position_ms":0,"buffer_ahead_ms":0,"buffer_valid":false,"buffer_age_ms":-1,"buffer_stale":null,"tta_ms":null,"drain_ratio":null,"drain_ratio_source":"unavailable:no_drain_model","throughput_utilisation":null,"throughput_utilisation_at":0,"guard_state":"PROXY_ONLY","guard_note":"PROXY_ONLY: sin acción sobre el player; sólo se observa/limita el proxy","guard_actions":0,"guard_actions_source":"proxy_backoff: reducciones REALES del techo admitido (nunca acciones sobre el player)","position_at":0,"cache_hits":2,"cache_misses":1,"cache_hit_ratio":0.6666666666666666,"miss_reason":{"absent":1,"upstream_error":0},"media_segments_served":3,"proxy_requests":12,"proxy_last_request_at":1793491208242,"proxy_up":true,"proxy_port":33133,"proxy_restarts":0,"buffer_source":"unavailable:no_media_session","rebuffer_source":"unavailable:no_position_samples","samples":[]}
```

**Comprobaciones:**
- `cache_hit_ratio = hits/(hits+misses) = 2/3 = 0.6666666666666666` ⇒ coincide exactamente con lo reportado; cuando no hay muestras (baseline) es **`null`**, no un 0 falso.
- `miss_reason = {absent:1, upstream_error:0}` ⇒ el miss frío es limpio, no un fallo upstream.
- `media_segments_served` 1→2→3 y `lastCacheServeMs` 5–9 ms ⇒ los hits se sirven de caché en memoria (vs 0,94 s del fetch frío).
- El hit de **seg2 sin haberlo pedido antes** es la evidencia del prefetch: `afterSegment()` prefetchea el siguiente segmento (`LoopbackProxy.kt:333-336`), `prefetch()` lo encola/almacena (`:381-386`), y el request caliente lo encuentra en `prefetchCache` (`:261-266`).

## 3 · SessionTap sin caída por null y buffer stale PROXY_ONLY (criterio 3)

### 3.1 SessionTap null-safe (código + runtime)

Código (`SessionTap.kt`, sha256 `169bf4bd…d9ab0d`, 3.478 B):

| Línea | Comportamiento |
|---|---|
| `:38-41` | `poll()`: si `controller == null` ⇒ `bindBest()` (no desreferencia null) |
| `:44-49` | `playbackState == null` se tolera hasta **6 polls** (1,2 s); sólo entonces se libera la sesión y se llama `onSessionLost()` |
| `:65-80` | `bindBest()` en `runCatching`; `getActiveSessions` filtrado por package objetivo; `candidate?.let(::bind)` (null-safe) |
| `:53-58` | `onSession(...)` sólo con `state != null` |

Runtime: `enabled_notification_listeners` incluye `dev.venice.ottshim/dev.venice.ottshim.SessionTap` y `dumpsys activity services` muestra el `SessionTap` **bound** (`isBindService:true`); sin sesión de OTT Navigator (no hay player objetivo), el poll recorre `controller/playbackState` null sin excepción: **0 `FATAL EXCEPTION`**, `pid` estable, `/metrics` sigue respondiendo. No se declara probado el camino con sesión presente (ver §6).

### 3.2 Buffer stale documentado (runtime + código)

`/metrics` (sin sesión):

```json
{"session_present":false,"player_package":"","player_state":-1,"position_ms":0,"buffered_position_ms":0,"buffer_ahead_ms":0,
 "buffer_valid":false,"buffer_age_ms":-1,"buffer_stale":null,
 "buffer_source":"unavailable:no_media_session",
 "guard_state":"PROXY_ONLY",
 "guard_note":"PROXY_ONLY: sin acción sobre el player; sólo se observa/limita el proxy"}
```

Código: `QoeSources.bufferStale(sessionPresent, bufferAgeMs)` devuelve `null` si no hay sesión/edad (`QoeSources.kt:17-19`); `QoeEngine` lo serializa como `JSONObject.NULL` (`QoeEngine.kt:240/272`) y `buffer_source` distingue `unavailable:no_media_session` (`:295-296`). `guard_state` es `PROXY_ONLY` (no se actúa sobre el player) con nota explícita (`:278-279`). `rebuffer_source` y `freeze_source` también declaran `unavailable:no_position_samples` (no se inventan 0).

## 4 · Salud, estabilidad y no-regresión

`/health` (mismo instante):

```json
{"ok":true,"proxy_up":true,"port":33133,"restarts":0,"uptime_ms":23295,"last_watchdog_at":1793491217004,
 "qoe_ready":false,"rebuffer_detector_armed":false,"proxy_media_seen":true,
 "ceilingBps":6250000,"maxBwAdmitted":50000000,"ids":98,
 "cache_hits":2,"cache_misses":1,"cache_hit_ratio":0.6666666666666666,
 "miss_reason":{"absent":1,"upstream_error":0},"media_segments_served":3,
 "requests":14,"last_request_at":1793491220275,"lastCacheServeMs":9,"queued":0,"pending":0,
 "ingress_timeout_ms":300,"admit_threads":3}
```

- Watchdog: `restarts:0`, `last_watchdog_at` avanza, `healthGate` `ok:true/proxy_up:true`; `START_STICKY` y watchdog cada 5 s (`ProxyService.kt:35/44-55/88-90`).
- `pid` estable (25526) desde el arranque hasta las mediciones; **0 FATAL** en el buffer de logcat; no `accept loop ended` ni `Broken pipe`.
- **BG23-01 (residual) — mitigado en los bytes actuales:** `LoopbackProxy` trae `INGRESS_READ_TIMEOUT_MS=300` y `ADMIT_THREADS=3` (`:522-524`), no el 1.500 ms/1 hilo de la medición previa. Test de ingress con conexiones silenciosas (sin enviar petición) contra el proxy actual:

| Escenario | `/health` (HTTP, tiempo) |
|---|---|
| baseline | 200 · 0,035 s |
| 3 conexiones silenciosas | 200 · 0,207 s |
| tras cerrarlas | 200 · 0,060 s |
| 6 conexiones silenciosas | 200 · 0,512 s |
| tras cerrarlas | 200 · 0,075 s |

Logcat: 9 líneas `ingress closed: SocketTimeoutException` espaciadas ~300 ms (3 hilos admit). **Riesgo residual:** el peor caso teórico sigue siendo `ceil(N/3) × 300 ms`; un monitor con `--max-time 5` podría fallar con decenas de conexiones half-open simultáneas (antes eran `N × 1.500 ms` con 1 hilo). Para el caso de un monitor único, correcto.

## 5 · Scope: sin cambios fuera de `ottshim/**` (criterio 4)

- Esta tarea escribió **solo** `ottshim/BG14_VERIFICATION.md` (y artefactos de build dentro de `ottshim/app/build/**`, ya ignorados/untracked).
- `git status --porcelain -- ottshim` ⇒ `?? ottshim/` (el proyecto entero ya estaba untracked; no se commiteó nada).
- Fuera de `ottshim` hay **165 entradas preexistentes** en el working tree (p. ej. `AGENTS.md` mtime 2026-10-27, `contracts/ownership_scopes.json` mtime 2026-10-30 17:31; y cambios de otras campañas). **No se escribió ninguna de ellas en esta tarea**; no se tocaron `vps/**`, `ara-x/vps/**`, `contracts/**` ni `IPTV_v5.4_MAX_AGGRESSION/vps/**`. No se ejecutó ningún comando de escritura en VPS/listas.

## 6 · Riesgos y límites (explícitos)

1. **`ottshim/` no está versionado en git** (`?? ottshim/`). La reproducibilidad es local (APK hash estable + hashes de fuente), pero **no hay commit/pin**; una limpieza del working tree lo perdería. Recomendación: commit quirúrgico de `ottshim/` con los hashes de §7.
2. **BG23-01 residual (MED):** ingress con 3 hilos/300 ms; peor caso `ceil(N/3)×300 ms`. Medido 6 silenciosas ⇒ 0,51 s; con muchas conexiones half-open un monitor rápido podría superar su timeout. No afecta al escenario de streaming saturado (t61) ni al Verify de 5 s con un cliente.
3. **Sin sesión de player real en esta pasada:** SessionTap se probó con `controller/playbackState` null (sin OTT Navigator reproduciendo). `buffer_stale:null` está documentado para *sin sesión*; el camino con sesión presente (stall por posición, freeze) ya tiene evidencia en BG17/BG19/BG20/BG22/BG23, pero **no se re-mide aquí**.
4. **Puerto del proxy efímero por arranque** (`36987 → 42429 → 33133` en esta sesión). Consumidores deben leer `port.txt`/`/health` y actualizar el `adb forward` (el Verify usa `tcp:8899 → tcp:<port>`); un forward fijo queda obsoleto tras reinicio.
5. **Métricas de caché sólo cuentan `/seg`** (playlists/init no cuentan como hit/miss) y `cache_hit_ratio` es `null` sin muestras (honesto). El prefetch test usó un asset público de test, no un canal del proveedor.
6. **Build UP-TO-DATE**, no `clean`; el hash se mantiene idéntico entre dos ejecuciones. No se declaró reproducibilidad bit-a-bit de un clean build.

## 7 · Evidencia y hashes

| Artefacto | Bytes | sha256 |
|---|---|---|
| APK debug (build 1 == build 2 == instalado) | 1.419.412 | `bbb15edea19c78f888e1a99ced0f423b3fe55a8fb8a9cc1a1c3041cdedce7c0d` |
| `LoopbackProxy.kt` | 23.169 | `955c4a6f9f2a1e31839d2342e4b4e171f83b5088141e9e61d1c87939a5e2e11e` |
| `QoeEngine.kt` | 13.870 | `931a80e8d4b7337c7b52d6785e29d0559de5aa0d4eb4c20d035b6ec8556fbfb5` |
| `QoeSources.kt` | 1.162 | `59c5a725c4caf3211651ab220bf6ba849d26aa57a10fc598860c6d8838b1d0dc` |
| `SessionTap.kt` | 3.478 | `169bf4bddfeaf5aa17aee4a2f0666e30409362ff5a020bd4b1b36c246ad9ab0d` |
| `ProxyService.kt` | 5.069 | `90e77ba67e0c9365ba3a5bfca8e298be6a0569d2a5cc7750a250f73d068afefe` |
| `AbrPolicy.kt` | 2.329 | `aa1eacd2b6f3a34d13af1294ab9603513b41eb41c4036138211fac3923eaa94e` |
| `gradlew.bat` | 2.868 | `8e327fcb99d29ce0fe3ee2fec6e6a25de815a2df83a6a44a553dea89ffc92955` |
| `gradle-wrapper.properties` | 250 | `7e1d39503dd81e9efcfdcb507c788d307c0f66fc49ffebb5ab8a0518f7398da8` |

Entorno: JDK `jdk-17.0.10.7-hotspot` · Android SDK build-tools `34.0.0` · `adb` `C:\Android\platform-tools\adb.exe` · device Android 14/SDK 34.

## 8 · Comandos de verificación (reproducibles)

```powershell
# 1) Build (contrato)
powershell -NoProfile -Command "Set-Location 'ottshim'; .\gradlew.bat :app:assembleDebug"   # exit 0
Get-FileHash ottshim\app\build\outputs\apk\debug\app-debug.apk -Algorithm SHA256
# esperado: bbb15edea19c78f888e1a99ced0f423b3fe55a8fb8a9cc1a1c3041cdedce7c0d

# 2) Instalar y arrancar con una fuente de test (device autorizado)
adb -s 192.168.1.7:5555 install -r ottshim\app\build\outputs\apk\debug\app-debug.apk
adb -s 192.168.1.7:5555 shell am start -n dev.venice.ottshim/.MainActivity `
  --es src 'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8' --ei targetKbps 50000
# leer puerto real y enlazarlo (el proxy usa puerto efímero):
adb -s 192.168.1.7:5555 shell cat /sdcard/Android/data/dev.venice.ottshim/files/port.txt
adb -s 192.168.1.7:5555 forward tcp:8899 tcp:<puerto>

# 3) Verify del contrato (métricas)
curl.exe -sS --max-time 5 http://127.0.0.1:8899/metrics    # exit 0 · JSON de §2

# 4) Prefetch frío/caliente (usando los ids del media playlist)
curl.exe -sS http://127.0.0.1:8899/source.m3u8
curl.exe -sS "http://127.0.0.1:8899/media.m3u8?id=<mediaId>"
curl.exe -sS -o NUL -w "%{http_code} %{size_download} %{time_total}`n" "http://127.0.0.1:8899/seg?id=<seg1>"  # miss
curl.exe -sS -o NUL -w "%{http_code} %{size_download} %{time_total}`n" "http://127.0.0.1:8899/seg?id=<seg2>"  # hit por prefetch
curl.exe -sS http://127.0.0.1:8899/health
```

Resultados esperados: APK `bbb15ede…`; `/metrics` con `buffer_stale:null`, `buffer_source:"unavailable:no_media_session"`, `guard_state:"PROXY_ONLY"`, `drain_ratio:null`, `rebuffer_source:"unavailable:no_position_samples"`; tras el test de prefetch `cache_hits:2`, `cache_misses:1`, `cache_hit_ratio:0.6667`, `miss_reason:{absent:1,upstream_error:0}`, `lastCacheServeMs` ≤ 10 ms.

**Firma BG14:** `integration-verifier` · 2026-10-31 · PASS con límites declarados (sin sesión de player real; `ottshim` untracked; residual BG23-01 de ingress).
