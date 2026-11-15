# Catálogo de perillas del operario LLM y lista negra

**Contrato:** `contracts/llm_operator_knobs_v1.json` — `ape.llm_operator.knobs.v1`, ver **4**, status `SPECIFIED_NOT_IMPLEMENTED`  
**Fecha:** 2026-11-15  
**Medido sobre:** `ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8` (572171381 B, sha256 `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07`), canal 1, perfil `P3` / tier `T6`; device: `docs/audits/VPP_SOC_QUALITY_20261114.md`.

Qué valores puede mover el operario LLM y qué no toca nunca. Dos lados (VPS y APK), **tres bloques en orden de prioridad** — recarga, profundidad, QoE — con el **techo real** de cada perilla, si la fija una **medición** o una **decisión**, y la **precedencia** entre la tabla de perfil y el LLM.

## 0. La frontera y el objetivo

> En CONSTRUCCION se toca la APK para meter al operario dentro; una vez instalado, el operario NO modifica nada de la APK: solo mueve valores del catalogo, en tiempo real.

> El LLM es el prober, el que asigna el perfil y el que mueve el JIT para una reproduccion excepcional, manteniendo el control de QoE/QoS para garantizar BUFFER INFINITO: NUNCA la reproduccion debe quedarse mientras haya red.

| | LADO VPS | LADO APK |
|---|---|---|
| Cuándo se aplica | en la siguiente recarga de manifest (NO inmediato) | INMEDIATO (settings put) |
| Coste de un cambio | una recarga de manifest por cambio | ninguno: no hay recarga |
| Perillas | **79** | **11** |

## 1. Censo medido

| Qué | Cuánto |
|---|---|
| Claves `#EXTHTTP` | **193** |
| Bloques `#EXT-X-SESSION-DATA` | **24** |
| Total inventariado | **217** |
| **Recarga** (prioridad 1) | **11** |
| **Profundidad** (prioridad 2) | **12** |
| QoE (prioridad 3) | 56 |
| APK (display/HDR) | 11 |
| Invariantes (NO perillas) | 1 |
| Lista negra | 131 |
| Excluidas (nadie las lee) | 28 |
| NO DISPONIBLES en el firmware | 17 |
| `set_by` measurement / decision | 159 / 90 |

**Discrepancia declarada:** el encargo decía «63 numéricos + 119 enum/bool» y «8 SESSION-DATA»; el censo real de este canal da **193 claves y 24 bloques**. Los valores con lista (`"10,12,15"`) caen a un lado u otro según se cuenten. Manda el censo medido (reproducible en §13).

## 2. El orden importa: recarga antes que profundidad

>INFINITO ES QUE NUNCA PERMITA QUE LA REPRODUCCION SE ACABE, ASI SEA CON VENTAJA DE 3, 4, 5 SEGUNDOS... Y SI PUEDE SUBIR MAS SIN SACRIFICAR SEGUNDOS O LATENCIA QUE LO HAGA

**Cómo se lee la frase del operador:** Primero se sube todo lo de RECARGA hasta su techo (es gratis). Solo si aun se corta se sube PROFUNDIDAD, y ahi el operario ve exactamente cuantos segundos paga por unidad.

### 2.A RECARGA — 11 perillas (prioridad 1, **baratas**)

Evitan el corte por **adelantarse y recuperarse antes**, no por acumular segundos. **No cuestan latencia perceptible**: el directo no se retrasa.

| Perilla | Valor medido | Rango | **Techo real** | Lo impone | Por qué es barata |
|---|---|---|---|---|---|
| `com.ape.network_resilience.retryBackoffMs` | P3=500 | 100 … 5000 | **5000** — mas de 5 s el reintento llega cuando el buffer ya se vacio | protocol | Backoff del daemon: reintenta sin provocar 403/429. |
| `com.ape.network_resilience.retryCount` | P3=5 | 1 … 15 | **15** — el VPS y el player reintentan a la vez: mas de 15 duplica la presion sobre el proveedor | provider | Reintentos del daemon: mismo efecto, otra capa. |
| `X-Connection-Timeout-Ms` | P3=2500,3500,6000 | 1000 … 15000 | **15000** — mas que eso y el player abandona antes que nosotros | player | Da tiempo a que la conexion lenta termine en vez de matarla. |
| `X-Max-Reconnect-Attempts` | P3=999999 | 1 … 100 | **100** — por encima, el bucle de reconexion es indistinguible de un ban y empeora el bloqueo | provider | No se rinde: la reproduccion no acaba mientras haya red. |
| `X-Parallel-Segments` | P5=4 | 1 … 8 | **8** — no tiene sentido pedir mas segmentos en paralelo que descargas concurrentes permitidas (X-Concurrent-Downloads=8) | protocol | Reparte la descarga en paralelo: llena el buffer antes con la misma red. |
| `X-Prefetch-Segments` | P5=8 | 1 … 16 | **16** — el doble de la ventana viva tipica (8): por encima, los fetches caen fuera del playlist y vuelven 404 | protocol | Pide los segmentos antes: el corte se evita por adelantarse, no por esperar. |
| `X-Read-Timeout-Ms` | P3=6000,9000,12000 | 3000 … 30000 | **30000** — por encima de 30 s la lectura ya no salva el segmento: el buffer se vacia igual | player | Da tiempo a que el segmento lento llegue entero. |
| `X-Reconnect-Delay-Ms` | P3=50,100,200 | 25 … 1000 | **1000** — un segundo entre reconexiones ya es conservador; mas retrasa la vuelta | protocol | Vuelve antes sin empeorar el bloqueo. |
| `X-Retry-Count` | P3=10,12,15 | 1 … 30 | **30** — mas reintentos seguidos = tormenta contra el rate limit del proveedor -> 403/429 | provider | Reintenta: convierte un fallo transitorio en un segmento mas, sin cortar. |
| `X-Retry-Delay-Ms` | P3=120,200,350 | 50 … 2000 | **2000** — por encima de 2 s el reintento llega tarde para salvar el buffer | protocol | Espacia los reintentos para no chocar con el rate limit. |
| `exoplayer.load_control.bufferForPlaybackAfterRebufferMs` | P3=2000 | 500 … 10000 | **10000** — esperar mas de 10 s tras un rebuffer es un corte disfrazado: el spectador ya vio el spin | player | NO cuesta latencia en el directo: solo cambia cuanto se espera tras un rebuffer |

**Estas son las que se suben PRIMERO.** Subirlas hasta su techo es gratis: no se paga en segundos detrás del directo. Si con todas en su techo la reproducción aún se corta, el problema no es de margen, es de red o de proveedor.

### 2.B PROFUNDIDAD — 12 perillas (prioridad 2, **cuestan latencia**)

Dan margen real, y en un directo **se pagan en segundos detrás de la emisión**. El operario debe saber cuánto paga por unidad.

| Perilla | Valor medido | Rango | **Techo real** | Lo impone | **Coste por unidad** |
|---|---|---|---|---|---|
| `com.ape.live_sync.liveMaxLatencyDurationCount` | P3=10 | 3 … 20 | **20** — 20 x 6 s = 2 min detras del directo: el zape se vuelve inusable | protocol | +1 unidad = +6 s detrás |
| `com.ape.live_sync.maxLiveOffsetMs` | P3=12000 | 3000 … 60000 | **60000** — = liveMaxLatencyDurationCount (10) x segmento (6 s) | protocol | +1 s por cada +1 s de margen |
| `exoplayer.load_control.maxBufferMs` | P3=30000 | 10000 … 60000 | **60000** — 60 s del bitrate 4K = 210 MB de RAM: por encima el SO mata el proceso | memory | +1 s por cada +1 s de margen |
| `exoplayer.load_control.minBufferMs` | P3=20000 | 2000 … 30000 | **30000** — no puede superar maxBufferMs | player | +1 s por cada +1 s de margen |
| `X-Buffer-Max` | P3=200000 | 32000 … 110100480 | **110100480** — mismo techo de memoria: 105 MiB a 28 Mbps | memory | +1 s por cada +1 s de margen |
| `X-Buffer-Min` | P3=120000 | 16000 … 110100480 | **110100480** — no puede superar X-Buffer-Size (invariante min <= size <= max) | player | +1 s por cada +1 s de margen |
| `X-Buffer-Size` | P3=100000 | 16000 … 110100480 | **110100480** — 30 s del bitrate maximo del 4K (28 Mbps) = 105 MiB; mas no cabe en el buffer del player | memory | +1 s por cada +1 s de margen |
| `X-Buffer-Target` | P3=60000 / P5=6667 | 2000 … 30000 | **30000** — el player deja de bufferear en maxBufferMs=30 s; por encima lo ignora y no gana nada | player | +1 s por cada +1 s de margen |
| `X-Live-Caching` | P3=120000 | 1000 … 60000 | **60000** — mismo techo: un minuto detras del directo es el limite practico | player | +1 s por cada +1 s de margen |
| `X-Max-Buffer-Time` | P3=12,18,25 | 4 … 30 | **30** — subirlo de 16 a 600 NO hace nada: el techo real es maxBufferMs del player (30 s) | player | +1 unidad = +1 s detrás |
| `X-Min-Buffer-Time` | P3=2,4,6 | 1 … 30 | **20** — por encima del maxBufferMs del player no cambia nada; 20 s ya cubre 3 segmentos largos | player | +1 unidad = +1 s detrás |
| `X-Network-Caching` | P3=120000 | 1000 … 60000 | **60000** — 10 segmentos = 1 minuto de cache: mas y el zape es inusable | player | +1 s por cada +1 s de margen |

**Cuánto se paga, en números.** Subir `maxBufferMs` de 30 s a 60 s son **+30 s detrás del directo** (y 210 MB de RAM). Pasar `liveMaxLatencyDurationCount` de 10 a 20 son **+60 s**. Ese es el precio. El operador dijo «si puede subir más sin sacrificar segundos o latencia, que lo haga» — y esto es exactamente lo que hay que mirar antes de subir: los segundos.

**Hallazgo medido en la lista servida (P3):** `X-Buffer-Min` = 120000 es **mayor** que `X-Buffer-Size` = 100000, cuando el invariante es `min ≤ size ≤ max`. Inconsistencia real de la lista: el validador la rechazaría con `E_KNOB_RANGE`.

### 2.C Invariante que NO es perilla — `X-Concurrent-Downloads = 8`

| Campo | Valor |
|---|---|
| Nombre | `X-Concurrent-Downloads` |
| Valor | **8** (SSOT) |
| ¿Es perilla? | **NO** |
| Por qué | NO es una perilla: es SSOT del perfil. AGENTS.md (§Ultimos cambios 2026-11-01) documenta que 256/200 saturaban el proveedor. Subirlo no da buffer: satura y provoca 403/429. |
| Política | SALE de la lista de candidatas. Si el LLM lo propone, se rechaza con E_INVARIANT_TOUCHED. |
| Detección | `E_INVARIANT_TOUCHED (intento de escribir un nombre declarado invariante)` |

Está **fuera** de la lista de candidatas a propósito: subirlo no da buffer, satura el proveedor. Se documenta aquí para que nadie lo mueva «para tener más buffer».

## 3. LADO VPS — QoE (56 perillas, prioridad 3)

| Perilla | Valor medido | Tipo / unidad | Rango | Lector | Paso | Dir. prohibida | Síntoma |
|---|---|---|---|---|---|---|---|
| `com.ape.abr_quality_policy` | `{\"preferHigherBitrate\":true,\"minStabl` | json-object / objeto JSON | undefined … undefined | vps `ape_hls_generators.php:205` | por subcampo | **DOWN** | politica del daemon/APK |
| `com.ape.codec_preferences` | `{\"preferredCodecs\":[\"dvh1\",\"hvc1.2\` | json-object / objeto JSON | undefined … undefined | vps `ape_hls_generators.php:207` | por subcampo | **DOWN** | politica del daemon/APK |
| `com.ape.live_sync` | `{\"liveSyncDurationCount\":3,\"liveMaxLa` | json-object / objeto JSON | undefined … undefined | vps `ape_hls_generators.php:202` | por subcampo | **DOWN** | politica del daemon/APK |
| `com.ape.network_resilience` | `{\"connectionTimeoutMs\":8000,\"readTime` | json-object / objeto JSON | undefined … undefined | vps `ape_hls_generators.php:204` | por subcampo | **DOWN** | politica del daemon/APK |
| `com.ape.recovery_policy` | `{\"resumeFromLastPositionMs\":true,\"ski` | json-object / objeto JSON | undefined … undefined | vps `ape_hls_generators.php:203` | por subcampo | **DOWN** | politica del daemon/APK |
| `com.ape.universal_parity` | `{\"applyToResolutions\":[\"480p\",\"720p` | json-object / objeto JSON | undefined … undefined | vps `ape_hls_generators.php:206` | por subcampo | **DOWN** | politica del daemon/APK |
| `exoplayer.load_control` | `{\"minBufferMs\":20000,\"bufferForPlayba` | json-object / objeto JSON | undefined … undefined | vps `server.js:8581` | por subcampo | **DOWN** | buffer/ABR del player |
| `exoplayer.track_selection` | `{\"maxDurationForQualityDecreaseMs\":200` | json-object / objeto JSON | undefined … undefined | vps `ape_hls_generators.php:199` | por subcampo | **DOWN** | buffer/ABR del player |
| `X-AI-Motion-Estimation` | `OPTICAL-FLOW` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | movimiento con judder |
| `X-AI-SR-Artifact-Removal` | `enabled` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | artefactos de compresion |
| `X-AI-SR-Enabled` | `true` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | imagen blanda en fuentes de baja resolucion |
| `X-AI-SR-GPU-Acceleration` | `cuda` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | realce sin GPU |
| `X-AI-SR-Model` | `esrgan-pro` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | modelo flojo para 4K |
| `X-AI-SR-Noise-Reduction` | `auto` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | ruido visible en sombras |
| `X-AI-SR-Precision` | `FP16` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | precision que degrada el realce |
| `X-AI-SR-Scale` | `4x` | enum / x | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | upscale insuficiente |
| `X-AI-SR-Tile-Size` | `256` | int / px | 64 … 512 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | rendimiento del realce |
| `X-Audio-Track-Selection` | `default` | enum / - | null … null | vps `ape_hls_generators.php:116` | discreto | **DOWN** | pista de audio por defecto |
| `X-Bandwidth-Estimation` | `adaptive,balanced,conservative` | enum-list / - | null … null | vps `ape_hls_generators.php:120` | discreto | **DOWN** | estimacion de BW demasiado pesimista |
| `X-Bandwidth-Preference` | `unlimited` | enum / - | null … null | vps `ape_hls_generators.php:90` | discreto | **DOWN** | forzar limite de BW sin motivo |
| `X-BW-Confidence-Threshold` | `0.95` | decimal / ratio | 0.5 … 0.99 | vps `ape_hls_generators.php:92` | 25 % | **DOWN** | cambios de calidad a lo loco |
| `X-BW-Estimation-Window` | `10` | int / muestras | 3 … 60 | vps `ape_hls_generators.php:91` | 25 % | **DOWN** | ABR que baja de calidad con ruido |
| `X-BW-Smooth-Factor` | `0.05` | decimal / ratio | 0.01 … 0.5 | vps `ape_hls_generators.php:93` | 25 % | **UP** | ABR que reacciona tarde a la caida |
| `X-CMAF-Part-Target` | `1.0` | decimal / s | 0.2 … 2 | vps `url2-cartridge.php:219` | 25 % | — | baja latencia en CMAF |
| `X-Detail-Edge-Enhancement` | `adaptive` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | bordes blandos |
| `X-Detail-Enhancement` | `enabled` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | imagen plana |
| `X-Detail-Enhancement-Level` | `high` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | nivel de detalle bajo |
| `X-Detail-Noise-Threshold` | `0.02` | decimal / ratio | 0.01 … 0.1 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | NR que no limpia el grano |
| `X-Detail-Sharpen-Sigma` | `0.03` | decimal / sigma | 0.01 … 0.1 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | nitidez insuficiente |
| `X-Detail-Sharpening` | `adaptive-unsharp` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | falta de nitidez |
| `X-Detail-Texture-Enhancement` | `auto` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | texturas lavadas |
| `X-EPG-Sync` | `enabled` | enum / - | null … null | vps `ape_hls_generators.php:118` | discreto | **DOWN** | desfase de EPG |
| `X-Failover-Enabled` | `true` | enum / - | null … null | vps `ape_hls_generators.php:160` | discreto | **DOWN** | conmutacion a replica |
| `X-File-Caching` | `300000` | int / ms | 1000 … 600000 | vps `server.js:1331` | 25 % | **DOWN** | seek y trick-play lentos |
| `X-Initial-Bitrate` | `15000000` | int / bps | 1000000 … 80000000 | vps `ape_hls_generators.php:121` | 25 % | **DOWN** | primer segundo en calidad baja |
| `X-LCEVC-B-Frames` | `8` | int / frames | 1 … 16 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | eficiencia de la capa de mejora |
| `X-LCEVC-Lookahead` | `60` | int / frames | 1 … 120 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | decisiones de rate control |
| `X-LCEVC-Psycho-Visual` | `true` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | percepcion de calidad |
| `X-LCEVC-Rate-Control` | `CRF+VBR` | enum / - | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | bitrate mal repartido en LCEVC |
| `X-LCEVC-Ref-Frames` | `16` | int / frames | 1 … 32 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | calidad temporal |
| `X-LCEVC-Scale-Factor` | `2x` | enum / x | null … null | vps `url2-cartridge.php:219` | discreto | **DOWN** | factor de escalado |
| `X-LCEVC-Threads` | `12` | int / hilos | 1 … 32 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | encoding lento de la capa |
| `X-PEVCE-Deinterlace` | `-1` | int / modo | -1 … 1 | generator `m3u8-typed-arrays-ultimate.js:5934` | discreto | — | fuentes entrelazadas |
| `X-PEVCE-HW-Threads` | `0` | int / hilos | 0 … 16 | generator `m3u8-typed-arrays-ultimate.js:5930` | ±1 | **DOWN** | decoder sin hilos suficientes |
| `X-PEVCE-Live-Caching` | `3000` | int / ms | 500 … 60000 | generator `m3u8-typed-arrays-ultimate.js:5925` | 25 % | **DOWN** | desfase del directo con PEVCE |
| `X-PEVCE-Network-Caching` | `3000` | int / ms | 500 … 60000 | vps `url2-cartridge.php:219` | 25 % | **DOWN** | tirones con el motor PEVCE |
| `X-PEVCE-Skip-Frame` | `0` | int / bool | 0 … 1 | generator `m3u8-typed-arrays-ultimate.js:5931` | discreto | — | saltar frames cuando el SoC no da |
| `X-PEVCE-Skip-Idct` | `0` | int / bool | 0 … 1 | generator `m3u8-typed-arrays-ultimate.js:5932` | discreto | — | reducir carga de decoder |
| `X-PEVCE-TCP-Caching` | `3000` | int / ms | 500 … 60000 | generator `m3u8-typed-arrays-ultimate.js:5926` | 25 % | **DOWN** | reinicios de conexion con PEVCE |
| `X-PEVCE-Timeshift-RAM` | `64MB` | string-mem / MB | 16 … 512 | generator `m3u8-typed-arrays-ultimate.js:5933` | discreto | **DOWN** | timeshift corto |
| `X-Playback-Rate` | `1.0,1.25,1.5` | enum-list / x | null … null | vps `ape_hls_generators.php:103` | discreto | **DOWN** | velocidades disponibles |
| `X-Prefetch-Enabled` | `true,adaptive,auto` | enum / - | null … null | vps `server.js:1799` | discreto | **DOWN** | arranque y zapeo lentos |
| `X-Request-Priority` | `ultra-high` | enum / - | null … null | vps `ape_hls_generators.php:107` | discreto | **DOWN** | prioridad de peticiones |
| `X-Segment-Duration` | `2000` | int / ms | 1000 … 6000 | vps `server.js:1340` | ±1 | — | latencia alta o exceso de peticiones |
| `X-Subtitle-Track-Selection` | `off` | enum / - | null … null | vps `ape_hls_generators.php:117` | discreto | **DOWN** | subtitulos por defecto |
| `X-Trick-Play-Rates` | `2,4,8,16,32` | int-list / x | 1 … 32 | vps `url2-cartridge.php:219` | ±1 | **DOWN** | seek rapido |

Los **8 bloques `#EXT-X-SESSION-DATA`** están aquí como objeto; sus subcampos de recarga y profundidad subieron a §2. Van al lado VPS porque quien los **re-emite** es el VPS (`ape_hls_generators.php:199-207`, `ape-jit/server.js:8581`). Matiz honesto: que un player los aplique por su cuenta **no está medido**.

## 4. LADO APK — 11 perillas (inmediatas)

Sólo lo que el firmware **tiene** y el código **escribe**. Cada una con comando y verificación: una perilla sin verificación es una perilla que no sabemos si funciona.

| Perilla | Valores | Escribe | Verifica | Evidencia | Dir. prohibida |
|---|---|---|---|---|---|
| `are_user_disabled_hdr_formats_allowed` | `0|1` | `adb shell settings put global are_user_disabled_hdr_formats_allowed 1` | `adb shell settings get global are_user_disabled_hdr_formats_allowed` | `SettingsApplier.kt · VPP fila 10` | **UP** |
| `display_color_mode` | `0|1|3` | `adb shell settings put secure display_color_mode {0|1|3}` | `adb shell settings get secure display_color_mode` | `SettingsApplier.kt · VPP fila 9` | **GUARD** |
| `display_mode_hdr` | `0|1` | `adb shell settings put global display_mode_hdr 1` | `adb shell settings get global display_mode_hdr` | `SettingsApplier.kt · VPP fila 1` | **UP** |
| `display_mode_refresh_rate` | `50|60` | `adb shell settings put global display_mode_refresh_rate {50|60}` | `adb shell settings get global display_mode_refresh_rate  · efecto: dumpsys display` | `SettingsApplier.kt · VPP fila 3` | **UP** |
| `display_mode_resolution` | `1080|2160` | `adb shell settings put global display_mode_resolution {1080|2160}` | `adb shell settings get global display_mode_resolution` | `SettingsApplier.kt (Settings.Global.put) · VPP audit fila 2` | **UP** |
| `hdr_conversion_mode` | `0|1|2` | `adb shell settings put global hdr_conversion_mode {0|1|2}` | `adb shell settings get global hdr_conversion_mode  · efecto: dumpsys SurfaceFlinger | grep -i dataspace (NO MEDIDO)` | `ExtShimOtt.kt:158,166 · VPP fila 7` | **GUARD** |
| `hdr_force_conversion_type` | `-1` | `adb shell settings put global hdr_force_conversion_type -1` | `adb shell settings get global hdr_force_conversion_type` | `SettingsApplier.kt · VPP fila 8` | **GUARD** |
| `user_disabled_hdr_formats` | `(vacio)` | `adb shell settings put global user_disabled_hdr_formats ""` | `adb shell settings get global user_disabled_hdr_formats` | `SettingsApplier.kt · VPP fila 11` | **GUARD** |
| `user_preferred_refresh_rate` | `50|60` | `adb shell settings put global user_preferred_refresh_rate {50|60}` | `adb shell settings get global user_preferred_refresh_rate` | `SettingsApplier.kt · VPP fila 6` | **UP** |
| `user_preferred_resolution_height` | `720..2160` | `adb shell settings put global user_preferred_resolution_height {720..2160}` | `adb shell settings get global user_preferred_resolution_height` | `SettingsApplier.kt · VPP fila 5 (dev.res_h)` | **UP** |
| `user_preferred_resolution_width` | `1280..3840` | `adb shell settings put global user_preferred_resolution_width {1280..3840}` | `adb shell settings get global user_preferred_resolution_width` | `SettingsApplier.kt · VPP fila 4 (dev.res_w)` | **UP** |

**Límite de la verificación:** `settings get` prueba que el valor **se escribió**, no que el SoC lo aplique. El efecto se lee con `dumpsys display`, y para HDR con `dumpsys SurfaceFlinger | grep -i dataspace` — pero el audit VPP declara **NO MEDIDO** el efecto en reproducción HDR (§4.3).

### 4.1 NO DISPONIBLE — 17 levers que se dan por hechos y no existen

| Lever | Qué sería | Por qué NO está | Evidencia |
|---|---|---|---|
| `aipq_enable` | setting AI-PQ del SoC | null en system y global: NO EXISTE en este firmware | `docs/audits/VPP_SOC_QUALITY_20261114.md:37` |
| `aisr_enable` | setting AI-SR del SoC | null: NO EXISTE | `docs/audits/VPP_SOC_QUALITY_20261114.md:37` |
| `ai_pq_mode` | modo AI-PQ | null: NO EXISTE (el codigo lo nombra en SettingsApplier.kt:318, el setting no existe) | `docs/audits/VPP_SOC_QUALITY_20261114.md:37` |
| `ai_sr_mode` | modo AI-SR | null: NO EXISTE | `docs/audits/VPP_SOC_QUALITY_20261114.md:37` |
| `ai_pic_mode` | modo AI picture | null: NO EXISTE | `docs/audits/VPP_SOC_QUALITY_20261114.md:38` |
| `ai_sr_level` | nivel AI-SR | null: NO EXISTE (codigo en DeviceSampler.kt:21) | `docs/audits/VPP_SOC_QUALITY_20261114.md:38` |
| `pq_sharpness_enable` | sharpness del SoC | null: NO EXISTE (codigo en SettingsApplier.kt:351) | `docs/audits/VPP_SOC_QUALITY_20261114.md:37-38` |
| `pq_hdr_*` | familia HDR del SoC | null: NO EXISTE (codigo en SettingsApplier.kt:354) | `docs/audits/VPP_SOC_QUALITY_20261114.md:37-40` |
| `pq_video_dnr / pq_*_dnr` | denoise del SoC | no aparece ni en el codigo (90 .kt/.java) ni en el firmware | `grep recursivo sobre la APK: SIN COINCIDENCIAS` |
| `always_hdr` | HDR siempre | null: NO EXISTE | `docs/audits/VPP_SOC_QUALITY_20261114.md:39` |
| `hdr_output_type` | tipo de salida HDR | null: NO EXISTE | `docs/audits/VPP_SOC_QUALITY_20261114.md:40` |
| `sr_unsharp_f32 (TFLite)` | modelo AI-SR | TFL3 valido pero 1.580 B: no es red de inferencia real | `.../assets/sr_unsharp_f32.tflite sha256 0d192994028f…` |
| `car_denoise_f32 (TFLite)` | modelo denoise | TFL3 valido pero 1.676 B: stub | `.../assets/car_denoise_f32.tflite sha256 2f26b5f17389…` |
| `rife_blend_f32 (TFLite)` | modelo interpolacion | TFL3 valido pero 1.484 B: stub | `.../assets/rife_blend_f32.tflite sha256 aaad0ed9b911…` |
| `minterpolate` | interpolacion de frames | no esta en la APK: es filtro ffmpeg (lado VPS/EXTVLCOPT) | `grep .kt/.java: SIN COINCIDENCIAS` |
| `display improvement (di)` | mejora de display | no implementado en la APK | `grep display_improvement: SIN COINCIDENCIAS` |
| `LCEVC sintetico` | capa LCEVC sintetica | implementado (LcevcSyntheticPipeline.kt) pero SIN lever de escritura: no hay setting ni API que el operario mueva | `LcevcSyntheticPipeline.kt:8,11` |

Los tres `.tflite` existen y son TFLite válidos (`TFL3`) pero pesan 1.484–1.676 B: un stub, no una red. `minterpolate` no está en la APK. El `di` de `#EXTSHIMOTT` tampoco. **No se inventa ningún lever.**

## 5. MEDICIÓN vs DECISIÓN — el muro de latencia, dicho

El LLM **es el prober**, y eso no borra lo medido: medir cuesta **1.653 s de p50** = **330.6×** el presupuesto de 5 ms.

> La MEDICION del canal cuesta 1,653 s de p50 (330,6x el presupuesto de 5 ms). Por eso se hace FUERA del camino caliente, en segundo plano, y deja el resultado en la tabla. El <5 ms es la DECISION al sintonizar.

| `set_by` | Quién fija el valor | Coste | Dónde |
|---|---|---|---|
| `measurement` | el probe (mide el canal) | ~1.653 s | **fuera** del camino caliente, en segundo plano |
| `decision` | el LLM (elige en rango) | ~0 ms | **en** el camino, al sintonizar |

Reparto: **159 `measurement`** (declaraciones de la fuente e identidad: por eso son lista negra) y **90 `decision`** (las perillas de este catálogo).

## 6. ¿Quién manda en el perfil? — precedencia

| Pregunta | Regla |
|---|---|
| Campos que describen la fuente (codec, resolución, HDR, fps, bitrate) | **la medición**; son lista negra |
| Perillas de QoE (recarga, profundidad, qoe) | **el LLM**, dentro de rango, techo y paso |
| ¿El LLM puede asignar perfil? | **Sí, sólo hacia arriba** (P3→P2): Ley Crystal, mejorar siempre |
| ¿Bajar de perfil? | **Prohibido**: `E_PROFILE_DOWNGRADE` |
| ¿Conflicto en campos declarados? | gana la tabla; se registra `E_PROFILE_CONFLICT` |

## 7. Límite de cambio por paso — distinto por lado

| | LADO VPS | LADO APK |
|---|---|---|
| Se aplica | siguiente recarga de manifest | **inmediato** |
| Máx. por perilla | **25 %** | un salto a un valor válido |
| Perillas por iteración | **3** | **5** |
| Espera entre cambios de la misma perilla | **2 iteraciones** | **1 iteración** |
| Salto grande | **imposible**: duplicar exige ≥4 pasos | imposible: `1080|2160`, `50|60`, `0|1|2` sin intermedios |

## 8. PROHIBIDO POR LEY (no por prudencia)

- **Bajar resolucion (4K->FHD/HD/SD) para "estabilizar"**
- **Bajar el bitrate maximo**
- **Reducir fps (50/60 -> 25/30)**
- **Apagar HDR o poner hdr_conversion_mode=3 (HDR falso)**
- **Comprar estabilidad con calidad: el buffer se compra con latencia**

### Trampa T1 — Bajar timeouts "para fallar rapido" mata segmentos que solo iban lentos

Un timeout agresivo convierte una conexion lenta en un fallo, y el fallo en un reintento: el segmento se pide dos veces y se tarda mas que dejandolo terminar. Hay un punto donde la agresividad se vuelve contraproducente: cuando el timeout baja de 2x el p95 del tiempo de conexion observado, o el retry-delay baja de ~100 ms (el proveedor responde 403/429).

- **Punto de cruce:** X-Connection-Timeout-Ms por debajo de ~2000 ms o X-Retry-Delay-Ms por debajo de ~100 ms en una red con p95 alto.
- **Cómo se detecta:** Si la tasa de timeouts por intento supera el 30 % con bytes ya recibidos, o si los 403/429 aparecen en rafaga, se cruzo la linea: se sube el timeout y se espacia el retry, nunca se baja mas.
- **Código:** `E_TIMEOUT_TOO_AGGRESSIVE / E_RATE_LIMITED`

### Trampa T2 — Degradar imagen para salvar el buffer esta PROHIBIDO por ley

Bajar resolucion, bitrate maximo, fps o apagar HDR para "estabilizar" es exactamente lo que la LEY ANTI-DEGRADACION (AGENTS.md) prohibe. Esas no son perillas: son intentos de degradacion.

- **Punto de cruce:** —
- **Cómo se detecta:** Los nombres que declararian menos calidad estan en la lista negra (measurement) y responden E_NOT_A_KNOB; un perfil mas bajo responde E_PROFILE_DOWNGRADE; el gate del repo (check_anti_degradation_policy.js) es la ultima barrera.
- **Código:** `E_KNOB_DEGRADATION / E_PROFILE_DOWNGRADE`

## 9. Lista negra en runtime — 131 claves

| Clase | Cuántas | Por qué | `set_by` | Detección |
|---|---|---|---|---|
| `structure_declaration` | 12 | declara la fuente real | measurement | `E_NOT_A_KNOB` |
| `identity_anti_cache` | 15 | identidad/anti-cache/proveedor | identity | `E_NOT_A_KNOB` |
| `device_fact` | 12 | hecho del device | measurement | `E_NOT_A_KNOB` |
| `hdr_declaration` | 41 | metadata HDR/color del bitstream | measurement | `E_NOT_A_KNOB` |
| `codec_family_declaration` | 13 | codec/audio/DRM del proveedor | measurement | `E_NOT_A_KNOB` |
| `media_feature_declaration` | 25 | CMAF/EMSG/SCTE/CDN declarados | measurement | `E_NOT_A_KNOB` |
| `declared_other` | 13 | metadata declarativa | measurement | `E_NOT_A_KNOB` |

**`structure_declaration`** (12): `X-APE-Profile`, `X-APE-Tier`, `X-Video-Range`, `X-Codec-Full`, `X-Resolution`, `X-Framerate`, `X-Expected-Bitrate`, `X-Average-Bitrate`, `X-Stream-Type`, `X-Quality-Preference`, `X-Luma-Precision`, `X-Video-Codecs`

**`identity_anti_cache`** (15): `User-Agent`, `X-Request-Id`, `X-Session-Id`, `X-Playback-Session-Id`, `Accept`, `Accept-Language`, `Accept-Encoding`, `DNT`, `Sec-GPC`, `Cache-Control`, `Pragma`, `Origin`, `Referer`, `X-Client-Timestamp`, `Accept-CH`

**`device_fact`** (12): `X-Device-Capabilities`, `X-App-Version`, `X-Device-Id`, `X-Cortex-Device-Type`, `X-Cortex-Device-HDR`, `X-Device-Type`, `X-Screen-Resolution`, `X-Network-Type`, `X-OTT-Navigator-Version`, `X-Player-Type`, `X-Hardware-Decode`, `X-Tunneling-Enabled`

**`hdr_declaration`** (41): `X-HDR-Nits`, `X-HDR-MaxCLL`, `X-HDR-MaxFALL`, `X-HDR-Mastering-Display`, `X-HDR-Reference-White`, `X-HDR-Vivid`, `X-HDR-Filmmaker-Mode`, `X-HDR-Extended-Range`, `X-HDR-Peak-Nit-Engine`, `X-HDR-PQ-EOTF`, `X-HDR-PQ-Target-Code`, `X-HDR-Pixel-Format`, `X-HDR-Local-Dimming`, `X-HDR-Specular-Boost`, `X-HDR-Highlight-Rolloff`, `X-HDR-Bloom-Effect`, `X-HDR-Film-Grain-Synthesis`, `X-HDR10-Plus`, `X-HDR10-Plus-Version`, `X-HDR10-Plus-MaxLuminance`, `X-HDR10-Plus-MinLuminance`, `X-HDR10-Plus-Dynamic-Tone-Mapping`, `X-HDR10-Plus-Scene-Analysis`, `X-HDR10-Plus-L1-MinMaxAvg`, `X-HDR10-Plus-L6-MaxSCL`, `X-Dolby-Vision-Profile`, `X-Dolby-Vision-Level`, `X-Dolby-Vision-RPU`, `X-Dolby-Vision-Compatibility`, `X-Dolby-Vision-Max-Luminance`, `X-Dolby-Vision-Min-Luminance`, `X-HLG-Enabled`, `X-HLG-Version`, `X-HLG-Reference-White`, `X-HLG-Alternative-Transfer`, `X-Color-Volume-Primaries`, `X-Color-Volume-Transfer`, `X-Color-Volume-Matrix`, `X-Color-Volume-Range`, `X-Color-Volume-Signal`, `X-Color-Volume-Metadata`

**`codec_family_declaration`** (13): `X-Audio-Codec-Preferred`, `X-VVC-Toolset`, `X-VVC-Subpictures`, `X-VVC-LMCS`, `X-EVC-Level`, `X-EVC-Toolset`, `X-Audio-Bitrate`, `X-Audio-Objects`, `X-Audio-TrueHD`, `X-Audio-DRC-Profile`, `X-Audio-Codecs`, `X-DRM-Support`, `X-Codec-Support`

**`media_feature_declaration`** (25): `X-CMAF-Server-Control`, `X-CMAF-Playlist-Type`, `X-CMAF-Delta-Playlist`, `X-CMAF-Program-Date-Time`, `X-FMP4-Edit-List`, `X-FMP4-EMSG-Box`, `X-FMP4-PSSH-Box`, `X-FMP4-Client-Data`, `X-Cortex-AI-Super-Resolution`, `X-Cortex-AI-Spatial-Denoise`, `X-Cortex-LCEVC`, `X-Cortex-Temporal-Artifact-Repair`, `X-Cortex-Constant-Frame-Rate`, `X-Cortex-Optical-Flow-Minterpolate`, `X-Cortex-Idempotency`, `X-Cortex-Bidirectional`, `X-Thumbnail-Format`, `X-Chapter-Markers`, `X-SCTE35-PID`, `X-SCTE35-Segmentation-Type`, `X-SCTE35-Blackout-Override`, `X-CDN-Provider`, `X-PEVCE-HTTP-Reconnect`, `X-PEVCE-HTTP-Continuous`, `X-Catchup-Support`

**`declared_other`** (13): `X-LCEVC-Enabled`, `X-LCEVC-Version`, `X-LCEVC-Enhancement-Type`, `X-LCEVC-Base-Codec`, `X-LCEVC-L1-Block`, `X-LCEVC-L2-Block`, `X-LCEVC-HW-Acceleration`, `X-AI-Content-Type`, `X-Buffer-Strategy`, `X-Buffer-Underrun-Strategy`, `X-PEVCE-HW-Decode`, `X-PEVCE-Force-HDR`, `X-Reconnect-On-Error`

### 9.1 Estructura del fichero y código de la app

| Qué | Por lista | Detección |
|---|---|---|
| `#EXTINF` | 11 | sha256 del bloque normalizado por canal |
| `#EXT-X-STREAM-INF` | 22 | sha256 + cruce con el probe |
| `#EXTSHIMOTT` | 11 | tools/quality/validate_extshimott.js |
| `URL del canal` | 11 | sha256 de la linea |
| `#EXT-X-APE-PROFILE-TEMPLATE` | 9 | hash por canal |
| `#EXT-X-APE-LAB-METADATA` | 31 | hash de la concatenacion de chunks |
| `codigo de la APK (.kt/.java/.gradle), pipeline, workflows, modulos` | 90 | sha256 del arbol + git status => E_APK_CODE_TOUCHED |

El operario no puede tocar estructura: su superficie escribible es `knobs[]` y todo lo demás responde `E_NOT_A_KNOB`, `E_STRUCTURE_TOUCHED` o `E_APK_CODE_TOUCHED`.

## 10. Excluidas por no leerlas nadie — 28

| Nombre | Evidencia (sólo el generador) |
|---|---|
| `X-PEVCE-Live-Caching` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5925` |
| `X-PEVCE-TCP-Caching` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5926` |
| `X-PEVCE-HTTP-Reconnect` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5927` |
| `X-PEVCE-HTTP-Continuous` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5928` |
| `X-PEVCE-HW-Decode` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5929` |
| `X-PEVCE-HW-Threads` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5930` |
| `X-PEVCE-Skip-Frame` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5931` |
| `X-PEVCE-Skip-Idct` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5932` |
| `X-PEVCE-Timeshift-RAM` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5933` |
| `X-PEVCE-Deinterlace` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5934` |
| `X-PEVCE-Force-HDR` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:5935` |
| `X-Tunneling-Enabled` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-lab-v8-profiles.js:197` |
| `com.ape.lab.schema` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3347` |
| `com.ape.lab.exported_at` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3348` |
| `com.ape.lab.bulletproof` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3349` |
| `com.ape.lab.filename` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3350` |
| `com.ape.profile.master` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3353` |
| `com.ape.profile.master_name` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3356` |
| `com.ape.profile.master_role` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3357` |
| `com.ape.codec.chain.player_pref` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3359` |
| `com.ape.codec.chain.audio` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3360` |
| `com.ape.codec.chain.hdr` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3361` |
| `com.ape.codec.chain.video_family` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3362` |
| `com.ape.qos.target_mos` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3365` |
| `com.ape.zapping.max_ms` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3366` |
| `com.ape.startup.max_ms` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3367` |
| `com.ape.rebuffer.tolerance` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3368` |
| `com.ape.build` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:3554` |

Incluye `com.ape.profile.master` (+`_name`/`_role`), `com.ape.lab.*`, `com.ape.codec.chain.*`, `com.ape.qos.target_mos`, `com.ape.zapping.max_ms`, `com.ape.startup.max_ms`, `com.ape.rebuffer.tolerance` y `com.ape.build`.

## 11. Detección de un intento

| Intento | Código |
|---|---|
| knob out of range | `E_KNOB_RANGE` |
| knob step too large | `E_STEP_TOO_LARGE` |
| knob above ceiling | `E_ABOVE_CEILING (supera el techo real declarado)` |
| knob prohibited direction | `E_KNOB_DEGRADATION` |
| profile downgrade | `E_PROFILE_DOWNGRADE` |
| profile conflict | `E_PROFILE_CONFLICT` |
| unknown name | `E_NOT_A_KNOB` |
| structure | `E_STRUCTURE_TOUCHED` |
| apk code | `E_APK_CODE_TOUCHED` |
| no evidence | `E_NO_EVIDENCE` |
| no receipt | `E_NO_RECEIPT` |
| tocar un invariante | `E_INVARIANT_TOUCHED` |

## 12. NO COMPUTADO (honesto)

- El valor de cada perilla en los perfiles que no son P3 ni P5: los valores son por perfil; lo que el contrato fija son los rangos y los techos.
- El efecto en pantalla de display_mode_* y hdr_conversion_mode: el audit VPP lo declara NO MEDIDO (§4.3).
- Que ExoPlayer/VLC lean EXTHTTP: no lo leen. El EXTHTTP lo consume el VPS/shim.
- Los 8 SESSION-DATA se marcan lado VPS porque el VPS los re-emite (ape_hls_generators.php:199-207, server.js:8581); que un player los aplique por su cuenta no esta medido.
- La latencia de punta a punta al subir cada perilla de buffer: se declara el coste por unidad, no se ha medido en reproduccion real.
- El techo real de X-Prefetch-Segments depende de la ventana viva de cada canal, que no se mide aqui: 16 es el doble de la ventana tipica medida en el ecosistema.

## 13. Repro exacto y huellas

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8','utf8').slice(0,600000);const l=t.split(/\\r?\\n/);const j=JSON.parse(l.find(x=>x.startsWith('#EXTHTTP:')).slice(9));console.log(Object.keys(j).length, l.filter(x=>x.startsWith('#EXT-X-SESSION-DATA')).length)"
python3 -c "import json;d=json.load(open('contracts/llm_operator_knobs_v1.json'));print(d['ver'],len(d['knobs']),d['census']['knobs_recarga'],d['census']['knobs_profundidad'])"
node tools/check_anti_degradation_policy.js
```

| Artefacto | Bytes | sha256 |
|---|---|---|
| `contracts/llm_operator_knobs_v1.json` | 185609 | `4b8ac25b9d3b47ec39ca480990df811699213c2de781e309a22eba295f45f1dd` |
| `ara-x/evidence/APE_LISTA_4K_ARA-X_once.m3u8` | 572171381 | `c8b5039ed8624b3d586bf60a85d1d15248475082f7552878e051ec1ae0d1ea07` |
| `docs/audits/VPP_SOC_QUALITY_20261114.md` | 15429 | `ed19334c0a8342d95df99be097457dcb2fc35eb2beb7da0a2234ce4b99d479c8` |

### Ámbito respetado

Sólo se escribieron `contracts/llm_operator_knobs_v1.json` y `docs/audits/KNOB_CATALOG_20261115.md`. **No** se tocaron las listas, ni el VPS, ni el código de la APK, ni el generador. Nada implementado: contrato + catálogo.
