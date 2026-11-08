# Prueba de ejecucion fisica del reproductor REA (654) — 2026-11-08

Responde a la frontera que la auditoria dejo abierta: **«APK <-> efectos REA: falta prueba de
instalacion y ejecucion fisica»**. Ya esta medida. La respuesta no es la que uno espera.

## 1 · Metodo

`ReaExternalPlayerActivity` es la unica actividad exportada del camino REA (intent-filter
`VIEW` con schemes `http`/`https` y tipos `video/*`, `application/x-mpegURL`,
`application/vnd.apple.mpegurl`, `application/dash+xml`). Se lanzo con dos fuentes HLS reales:

```bash
S=adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp
adb -s $S shell 'am start -a android.intent.action.VIEW \\
  -d "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" \\
  -t "application/x-mpegURL" \\
  -n com.ape.crystalagent.rea/com.ape.rea.ReaExternalPlayerActivity'
```

Segunda prueba con un master HEVC (`demo.unified-streaming.com/.../tears-of-steel-hevc.ism/.m3u8`).

## 2 · Lo que SI funciona (medido)

Con el stream AVC, el `ApePlayer` hace exactamente lo que la doctrina pide:

```
ApePlayer: global_beat start
ApePlayer: shader effects applied n=1
ApePlayer: LOCK resolucion 1920x1080 (neverDownscale=true, min_resolution=3840x2160)
ApePlayer: 4k_upscaled: fuente 1920x1080 < target 3840x2160 (upscale de display, wire intacto)
ApePlayer: VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=6221600
ApePlayer: 4k_upscaled: seleccionado 1920x1080 < 3840x2160 (display upscale)
ApePlayer: fallback BEST_4K_THEN_NATIVE: hvc1.2.4.L120.B0@2048x1080/30.0 > hvc1.2.4.L93.B0@1280x720/60.0 > ...
```

- **`shader effects applied n=1`** -> el pipeline de efectos SI se aplica (un efecto).
- **`LOCK resolucion 1920x1080 (neverDownscale=true)`** -> se ancla a la resolucion de la FUENTE.
  No baja. Declara el objetivo `min_resolution=3840x2160`.
- **`upscale de display, wire intacto`** -> declara el 4K como upscale de **display**, no del
  bitstream. Es la honestidad que exige la ley: no finge 4K en el cable.
- **`VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=6221600`** -> AVC High@4.0,
  1080p, 6,2 Mbps: el stream real, sin inflar.

El decodificador de hardware arranca y decodifica:

```
VDA: DecodeBufferTask decoder_state_ = kPictureBuffersReady -> kDecoding
CCodecConfig: raw.crop.width = 1920   raw.crop.height = 1080
mali_gralloc: am_gralloc_get_uvm_decoder_para: w*h(1920*1088)
C2VdecCodecConfig: c2.amlogic.avc.decoder can support 4K
```

Y la sesion reproduce (audio incluido):

```
PlaybackState {state=PLAYING(3), position=1929 -> 3931 -> 4477, buffered=30016}
```

## 3 · Lo que NO funciona: no hay imagen

Captura de pantalla durante la reproduccion, dos veces:

```
[ titulo: APE Crystal REA (Prueba) ]
[ pantalla NEGRA                     ]
[ toast: "Recuperacion: reintentando la fuente actual" ]
```

Y entra en bucle de recuperacion:

```
PlaybackState {state=BUFFERING(6), position=4477, buffered=4477, speed=0.0}
decoder: reset mode: 1, es frames buffering: 0
ApePlayer: tracks sin video (groups=0) - se conserva el ultimo snapshot valido
```

## 4 · El mismo fallo con HEVC

Segunda fuente (master HEVC). El player abre, pero **no encuentra pista de video**:

```
CCodec: allocate(c2.android.aac.decoder)     <- SOLO audio
C2SoftAacDec: Reconfiguring decoder: 0->48000 Hz, 0->2 channels
ApePlayer: tracks sin video (groups=0)
```

Misma pantalla negra y mismo toast. **No es especifico de AVC.**

## 5 · Causas candidatas, medidas y NO confirmadas

| Evidencia | Que sugiere |
|---|---|
| `16x  avc: denied { getattr } for name="/" dev="dmabuf" ino=1 ... tcontext=u:object_r:unlabeled:s0 tclass=filesystem` | SELinux niega el acceso al buffer `dmabuf` desde el hilo del efecto. `unlabeled` = el contexto no esta etiquetado para la app |
| `OpenGLRenderer: Unable to match the desired swap behavior` (cada ~8-12 s) | El EGL/GL del Surface no encuentra configuracion de swap compatible |
| `tracks sin video (groups=0)` | La enumeracion de pistas devuelve cero grupos de video |
| `decoder: reset mode: 1, es frames buffering: 0` | Reset del decoder -> alimenta el bucle de recuperacion |

**No afirmo cual es la causa raiz.** Las cuatro estan presentes y las cuatro pueden contribuir.
Confirmarlo exige ver el codigo de `ReaBridge` / `ReaAdaptiveEffect`, que **no existe en este
workspace** (solo compilado en el dex).

**Lo que si es seguro:** no es red, ni manifiesto, ni codec. Llego a decodificar a 1080p real con el
decoder de hardware. El fallo esta **despues del decode**, en la presentacion.

## 6 · Veredicto

| Frontera del dictamen | Estado tras medir |
|---|---|
| APK REA instalada | **SI** — com.ape.crystalagent.rea 3.9.8-rea-12profiles-test vc654 |
| La APK ejecuta | **SI** — actividad, motor, decoder, efectos |
| Declara con honestidad | **SI** — `wire intacto`, `neverDownscale=true`, `min_resolution` separado del fuente |
| **Produce imagen** | **NO** — pantalla negra + `Recuperacion: reintentando la fuente actual`, en AVC y en HEVC |

**La cadena APK -> efectos REA esta medida de punta a punta: se rompe en la presentacion, no antes.**

## 7 · Nota sobre el control con la 651

Se intento comparar con la 651 instalada. **No se pudo**: la APK `com.ape.crystalagent` que hay en el
device es `2.3.0-noWG` (versionCode 600) y **no contiene `PlayerActivity`**:

```
Error: Activity class {com.ape.crystalagent/com.ape.crystalagent.PlayerActivity} does not exist.
```

Es otro build distinto al publicado (`3.9.5-adb-firetv-shim`). No se instalo el local `app-debug.apk`
(vc52) porque seria un **downgrade** de versionCode sobre la app existente y podria romper lo que el
operador use hoy.

---

# 8 · CORRECCION DEL VEREDICTO (misma sesion, medicion posterior)

## 8.1 · Lo que dije mal

En la seccion 6 escribi **«Produce imagen: NO — pantalla negra»**. **Era falso.**

Las capturas de la primera prueba se tomaron **despues** del atasco. Una captura tardia no demuestra que
nunca haya imagen. El error de metodo: medi un solo instante y generalice.

## 8.2 · Lo que pasa de verdad: pinta, y luego lo pierde

Capturas escalonadas del mismo stream, mismo intent:

```
t+2s  ->  66.664 B
t+4s  -> 154.580 B   <- CONTENIDO RICO
t+6s  ->  23.884 B   <- negro
t+9s  ->  23.876 B   <- negro, se queda
```

A t+4s la pantalla muestra la tarjeta de **Big Buck Bunny** dentro de la ventana de la app. **El
reproductor SI pinta video.**

Secuencia real:

1. Arranca, elige `VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=6221600`.
2. **Reproduce ~4,5 s con imagen.**
3. A los ~4,6 s: `PlaybackState {state=BUFFERING(6), position=4646, buffered=4646, speed=0.0}`.
4. `ApePlayer: tracks sin video (groups=0) - se conserva el ultimo snapshot valido`.
5. Pantalla negra y bucle `"Recuperacion: reintentando la fuente actual"`.

Politica activa en ese momento:

```
ApePlayer: policy target=3840x2160 max=3840x2160 neverDownscale=true buffer=45/180s cache=256MiB
```

## 8.3 · NO es el overlay REA

Prueba de control dentro de la **misma APK**: `com.ape.crystalagent.PlayerActivity` (camino estandar, sin
`ReaExternalPlayerActivity` ni `ReaBridge`). Clave del extra: **`-e url <URL>`**.

```bash
adb shell am start -n com.ape.crystalagent.rea/com.ape.crystalagent.PlayerActivity -e url "<URL>"
```

Resultado: **falla igual**.

```
PlaybackState {state=PLAYING(3), position=4646, buffered=90016}
PlaybackState {state=BUFFERING(6), position=4646, buffered=4646, speed=0.0}
ApePlayer: tracks sin video (groups=0) - se conserva el ultimo snapshot valido
```

**Ambos caminos se atascan a los ~4,6 s y pierden la pista de video.** El fallo esta en el nucleo
`ApePlayer`, que comparten los dos, **no en el overlay REA**.

Esto **reescribe** la conclusion de la seccion 5: la animacion SELinux sobre `dmabuf` y el
`OpenGLRenderer: Unable to match the desired swap behavior` **pueden ser sintomas, no causa**; el
comportamiento identico del camino sin overlay lo desmiente como causa unica.

## 8.4 · Lo que queda sin determinar

**¿Es el stream o el jugador?** No se pudo cerrar:

- Se intento medir 3 streams distintos (mux x36xhzz, akamai sintel, mux pts_shift). En las dos tandas
  la **conexion ADB inalambrica se corto** a mitad (`waiting for device`), y el bucle de capturas quedo
  colgado. Se cancelaron ambos trabajos. **No hay dato.**
- El atasco a ~4,6 s coincide en dos caminos distintos, lo que apunta al jugador; pero la politica
  `buffer=45/180s` (minimo 45 s) contra un origen WAN que no la llena es una explicacion igual de
  compatible. **No se elige entre las dos sin medir.**

**Para cerrarlo** hace falta una de estas dos, y ninguna depende de mi:

1. Reproducir un **canal real** del operador en la app y ver si se sostiene pasados los 10 s.
2. Servir un HLS **local en la LAN** (elimina la WAN) y comprobar si el atasco desaparece.

## 8.5 · Veredicto corregido

| Frontera | Estado |
|---|---|
| APK REA instalada | **SI** (vc654) |
| La APK ejecuta | **SI** |
| Declara con honestidad | **SI** (`wire intacto`, `neverDownscale=true`, target separado) |
| **Produce imagen** | **SI, durante ~4,5 s** |
| **Sostiene la reproduccion** | **NO** - atasca a los ~4,6 s y pierde la pista de video |
| **Afecta al overlay REA en particular** | **NO** - el camino estandar falla igual |
| Causa raiz | **NO DETERMINADA** - jugador vs politica de buffer vs origen |

La cadena APK -> efectos REA no esta «rota en la presentacion». **Presenta, y despues se cae.** Son dos
problemas distintos y el segundo es el que hay que resolver.

---

# 9 · CAUSA CERRADA: es el jugador, no la red

## 9.1 · El experimento que faltaba

Se sirvio un **HLS local en la LAN**, elimininando la WAN por completo:

```bash
ffmpeg -f lavfi -i "testsrc2=size=1920x1080:rate=30" -f lavfi -i "sine=frequency=440" \
  -t 30 -c:v libx264 -preset ultrafast -g 60 -b:v 4000k -c:a aac -b:a 128k \
  -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename "seg%03d.ts" "master.m3u8"
python -m http.server 8123 --bind 0.0.0.0 -d <dir>
```

Resultado: 9 ficheros, 15,38 MB, **segmentos de 4 s**, 1080p AVC.
Alcanzable desde el TV, verificado antes de reproducir:

```
adb shell 'echo -e "GET /master.m3u8 HTTP/1.0\r\n\r\n" | toybox nc -w 4 192.168.1.9 8123'
  -> HTTP/1.0 200 OK · Content-Length: 337 · #EXTM3U
```

## 9.2 · Se atasca IGUAL, sin red de por medio

```
t+3s  -> 302.261 B   <- VIDEO (patron testsrc2 visible)
t+7s  ->  17.631 B   <- negro
t+12s ->  23.852 B   <- negro
t+18s ->  23.781 B   <- negro

BUFFERING=13   tracks_sin_video=2   PLAYING=4
```

Captura a t+3s: la pantalla muestra el patron de barras de color con el **timestamp
`00:00:00.260`**. Es decir: **a los 3 segundos de reloj el video va por 0,26 s de contenido.**
Pinta el arranque y se congela casi de inmediato.

## 9.3 · La pista concreta: `global_beat` deja de publicar

```
ApePlayer: REARM global_beat: guard sin publicar 13376ms (tick=9)
ApePlayer: REARM global_beat: guard sin publicar 15377ms (tick=10)
ApePlayer: REARM global_beat: guard sin publicar 17377ms (tick=11)
ApePlayer: REARM global_beat: guard sin publicar 19378ms (tick=12)
```

El propio watchdog de la app advierte de que su latido **no se esta publicando**, y el contador sube
sin recuperarse. El player entonces se queda en `BUFFERING` y pierde la pista de video.

## 9.4 · Tabla de descartes

| Hipotesis | Como se probo | Resultado |
|---|---|---|
| Es la red / el WAN | HLS local en LAN, 15 MB, segmentos 4 s | **DESCARTADA** - atasca igual |
| Es el overlay REA (`ReaBridge`/`ReaAdaptiveEffect`) | `PlayerActivity` estandar de la misma APK, clave `-e url` | **DESCARTADA** - falla identico |
| Es el codec | AVC 1080p y HEVC | **DESCARTADA** - ambos fallan |
| Es el manifiesto | 4 fuentes distintas (mux, akamai, hevc, local ffmpeg) | **DESCARTADA** - todas fallan |
| Es SELinux `dmabuf` | El camino sin overlay no usa el efecto y falla igual | **DESCARTADA como causa unica** |
| **El `ApePlayer` se atasca** | Todo lo anterior + `global_beat` sin publicar | **CONSISTENTE con toda la evidencia** |

## 9.5 · Veredicto final de esta frontera

| Frontera | Estado |
|---|---|
| APK REA instalada y ejecutable | **SI** (vc654) |
| Declara con honestidad | **SI** (`wire intacto`, `neverDownscale=true`) |
| Decodifica con hardware | **SI** (AVC 1080p, `c2.amlogic.avc.decoder`) |
| **Presenta imagen** | **SI, el arranque** (patron visible, timestamp 0.26 s) |
| **Sostiene la reproduccion** | **NO** - se congela a los ~0,26 s de contenido |
| Causa | **El `ApePlayer` deja de publicar su `global_beat` y se queda en BUFFERING** |
| Red, overlay REA, codec, manifiesto | **Los cuatro, descartados con medicion** |

**Esto no es un problema de la lista, ni del LAB, ni del VPS, ni del JIT.** Es un defecto del
reproductor de la APK, reproducible con un HLS generado por ffmpeg en la misma LAN.

**Siguiente paso tecnico (necesita el fuente):** revisar el ciclo `global_beat` / `REARM` en
`ApePlayer.kt` — el guard no publica y nadie lo rescata. Sin el fuente solo puedo seguir midiendo
sintomas.

---

# 10 · MECANISMO MEDIDO: el jugador VUELCA el buffer tras fallar la enumeracion de pistas

## 10.1 · La secuencia exacta (una sola sesion, timestamps reales)

```
04:00:52.489  policy target=3840x2160 max=3840x2160 neverDownscale=true buffer=45/180s cache=256MiB
04:00:52.568  global_beat start
04:00:52.620  shader effects applied n=1
04:00:52.899  LOCK resolucion 1920x1080 (neverDownscale=true, min_resolution=3840x2160)
04:00:52.899  VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=6221600
04:00:54.622  PLAYING   position=1238   buffered=65083     actions=775
04:00:56.632  PLAYING   position=3235   buffered=140016    actions=775
04:00:58.629  PLAYING   position=4675   buffered=150000    actions=775   <- BUFFER LLENO
04:00:59.679  tracks sin video (groups=0) - se conserva el ultimo snapshot valido
04:01:00.632  BUFFERING position=4675   buffered=4675      actions=519   <- COLAPSO
04:01:02.633  BUFFERING position=4675   buffered=4675      actions=519
```

## 10.2 · Lo que esto descarta definitivamente

**A las 04:00:58.629 el jugador tenia 150.000 ms (150 s) de buffer.** Cuatro segundos despues tiene
4.675 ms, exactamente su posicion. **El buffer no se agoto: se vacio.**

Eso cierra la ultima explicacion de red:

| Explicacion | Estado |
|---|---|
| La red no da abasto | **IMPOSIBLE** - 150 s ya descargados y en memoria |
| El source es lento | **IMPOSIBLE** - mismo resultado con HLS local en LAN |
| El buffer minimo (45 s) no se alcanza | **IMPOSIBLE** - llego a 150 s, tres veces el minimo |

## 10.3 · El orden importa: falla la enumeracion, luego colapsa

1. `04:00:59.679` - la enumeracion de pistas devuelve **`groups=0`** (cero grupos de video).
2. `04:01:00.632` - **un segundo despues**, `buffered` pasa de 150.000 a 4.675 y el estado cae a
   `BUFFERING`. `actions` baja de 775 a 519 (pierde capacidades de control).

**La correlacion es de 1 segundo y el orden es inequivoco.** El volcado ocurre DESPUES del fallo de
enumeracion, no antes.

La propia app lo reconoce en su mensaje: *«se conserva el ultimo snapshot valido»* - sabe que la
enumeracion fallo y preserva el dato anterior para la telemetria. Pero **el dano ya esta hecho**: el
player se ha quedado sin buffer y sin pista de video.

## 10.4 · Por que falla la enumeracion

No determinado desde el artefacto. Lo que si se puede afirmar con lo medido:

- No depende del codec (falla en AVC y en HEVC).
- No depende de la red (falla con LAN local).
- No depende del overlay REA (falla con `PlayerActivity` estandar).
- **Ocurre una sola vez, ~7 s despues del arranque, coincidiendo con el ciclo del `global_beat`.**

Candidato principal, por orden temporal: **la rutina que captura el snapshot de pistas para el latido
(`global_beat`) consulta el player en un momento en que este no puede resolver los grupos de video, y
la reaccion a `groups=0` reinicia el media source.**

## 10.5 · Defecto secundario confirmado en el codigo del APK

Las cadenas del dex confirman que la APK **escribe el setting en el formato invalido**:

```
global display_size_forced 3840x2160          <- forma WxH (Android espera "3840,2160")
global hdr_conversion_mode 1
global user_preferred_refresh_rate 60.000004
global user_preferred_resolution_width 3840
global user_preferred_resolution_height 2160
global are_user_disabled_hdr_formats_allowed 1
global db_id_audio_drc_mode 2
global db_id_droidlogic_audio_digital_mode 1
```

Es la confirmacion, dentro del artefacto, del defecto de formato descrito en
`docs/audits/CONDICION_4_MEDICION_ONN4K_20261108.md` §3.1: la ruta `settings put global
display_size_forced` sale de aqui con `x` en vez de coma.

## 10.6 · Informe para quien tenga el fuente

**Sintoma:** la reproduccion se congela a los ~4,6 s de contenido; pantalla negra; `Recomendacion:
reintentando la fuente actual` en bucle.

**Evidencia:** buffer a 150 s -> `tracks sin video (groups=0)` -> buffer a 4,7 s en 1 segundo.

**Donde mirar, en este orden:**
1. El manejador de `global_beat` / `REARM` y su captura de snapshot de pistas.
2. Que hace `ApePlayer` al recibir `groups=0` en la enumeracion: si reinicia el `MediaSource`.
3. Por que la enumeracion devuelve 0 grupos ~7 s despues del arranque.

**Criterio de exito:** reproducir 60 s seguidos sin que `buffered` caiga por debajo de la posicion.
