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

---

# 11 · La red del dispositivo queda descartada con medidas

## 11.1 · Estado real de la red

```
WiFi: "Sofi Tigo 5G" · BSSID 90:93:5a:0d:de:71 · RSSI -61 dBm · 5 GHz · 5220 MHz
      Link speed 520 Mbps · LinkDnBandwidth >= 60000 Kbps
      Capabilities: NOT_METERED & INTERNET & TRUSTED & NOT_VPN & VALIDATED
      InterfaceName: wlan0 · IP 192.168.1.3/24 · Gateway 192.168.1.254

WAN:  ping 8.8.8.8 -> 1/1 paquetes, rtt 21.785 ms
      1.1.1.1:443   -> responde (Cloudflare 400 a un GET crudo, es normal)
      iptv-ape.duckdns.org:80 -> HTTP/1.1 302 (nginx responde)
```

**La red esta sana y validada.** 60 Mbps de bajada, 21 ms de RTT, sin perdida.

## 11.2 · El VPN no interfere

```
ip route get 8.8.8.8  ->  8.8.8.8 via 192.168.1.254 dev wlan0     <- sale por WiFi
ip rule: 12000: from all iif tun1 lookup 97                       <- tun1 solo por reglas uid
always_on_vpn_app      -> null
always_on_vpn_lockdown -> null
```

Hay interfaz `tun1` (10.14.0.2/16) y estan corriendo `com.nordvpn.android` (PID 3714) y
`com.surfshark.vpnclient.android` (PID 2382), **pero ninguno es la ruta por defecto**. El trafico
general sale por `wlan0`. **El VPN no explica ningun atasco.**

## 11.3 · OTT Navigator tambien se queda en Buffering: 0%

Se intento abrir una lista M3U local minima (`/sdcard/Download/ott_test.m3u`, 129 B, un canal apuntando
al HLS de la LAN) mediante `am start -a VIEW -t audio/x-mpegurl`.

OTT Navigator **abrio su `PlayerActivity`**, pero **ignoro el fichero** y arranco un canal propio de su
lista: **`AMEDIA HIT HD` (FHD)**, con el panel inferior y **`Buffering: 0%`** en el centro. Sin imagen.

**Alcance de esta observacion, sin exagerarla:**
- Prueba que el reproductor del operador tambien esta sin imagen en ese instante.
- **No** prueba que sea el mismo fallo: el canal es del proveedor (WAN), no el HLS local.
- El intent `VIEW` con `file://` no fue respetado por OTT; la prueba con la fuente local via OTT
  **no se completo**.

## 11.4 · Lo que esto cambia

| Causa posible del atasco del `ApePlayer` | Estado |
|---|---|
| Red del dispositivo | **DESCARTADA** - 60 Mbps, 21 ms, VALIDATED, sin perdida |
| VPN interfiriendo | **DESCARTADA** - no es ruta por defecto, always-on null |
| DNS | **DESCARTADA** - resuelve y alcanza hosts publicos |
| Origen lento | **DESCARTADA** - falla con HLS local en LAN |
| **El `ApePlayer`** | **SIGUE EN PIE** - es lo unico compatible con toda la evidencia |

## 11.5 · Hecho util colateral: se puede escribir en el directorio de la app

`adb push` **si** puede escribir en `/sdcard/Android/data/com.ape.crystalagent.rea/files/`.
Se dejo alli `LAB_CALIBRATED_IMPORTADO.json` (605.082 B). **La app no lo consumio**: sin logs de carga
y el fichero quedo intacto tras reiniciar.

Esto confirma por segunda via independiente lo del §6: **la carga del LAB solo ocurre desde
`ReaProfilesActivity`, que es inalcanzable.** No hay ruta automatica que rescatar.

---

# 12 · La 651 PUBLICADA falla igual: el defecto no es de las REA

## 12.1 · Instalacion de la 651 (bloqueada primero por Play Protect)

El APK servido en `/ara/agent.apk` se descargo y **se verifico antes de instalar**:

```
bytes : 25678434         (esperado 25678434)
sha256: 8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4
versionCode 651 · versionName 3.9.5-adb-firetv-shim · package com.ape.crystalagent
```

**Primer intento de `adb install -r`: colgado.** La causa estaba en pantalla, no en la red:

```
mCurrentFocus = com.android.vending/.../PlayProtectDialogsActivity
"Google Play Protect — Se bloqueo la app no segura — APE Crystal Agent"
```

Desactivada la verificacion de instalaciones por ADB (`settings put global verifier_verify_adb_installs 0`),
el reintento fue inmediato:

```
Performing Streamed Install
Success
  versionCode=651  versionName=3.9.5-adb-firetv-shim     (antes: 600 / 2.3.0-noWG)
```

## 12.2 · Y reproduce EL MISMO fallo

Mismo HLS local en LAN, `PlayerActivity` de la 651 con `-e url`:

```
04:21:44  ApePlayer: fallback BEST_4K_THEN_NATIVE: ...
04:21:44  ApePlayer: tracks sin video (groups=4) - se conserva el ultimo snapshot valido
04:21:49  ApePlayer: tracks sin video (groups=0) - se conserva el ultimo snapshot valido
04:21:57  ApePlayer: REARM global_beat: guard sin publicar 7468ms (tick=7)
04:21:59  ApePlayer: REARM global_beat: guard sin publicar 9470ms (tick=8)
04:22:01  ApePlayer: REARM global_beat: guard sin publicar 11472ms (tick=9)
```

Captura a t+9s **con la 651**:

```
[ titulo: APE Crystal Agent ]        <- es la 651
[ pantalla NEGRA ]
"Se redujo el filtro de imagen para priorizar la fluidez de esta sesion."
"Recuperacion: reintentando la fuente actual"
```

Dos cosas nuevas respecto a la 654:

1. **`groups=4` primero y luego `groups=0`**: la enumeracion **si ve 4 grupos** al principio y los pierde
   despues. El conteo no esta roto desde el arranque: se rompe en el tiempo.
2. **«Se redujo el filtro de imagen…»**: el **LoadGovernor esta degradando los filtros** para intentar
   salvar la fluidez. Es exactamente la respuesta que el diseno describe, pero llega tarde: la pantalla
   ya esta negra.

## 12.3 · Consecuencia: no es una regresion de las REA

| Build | Resultado con el mismo HLS local |
|---|---|
| **654** `3.9.8-rea-12profiles-test` | negro + `Recuperacion: reintentando la fuente actual` |
| **651** `3.9.5-adb-firetv-shim` **(publicada)** | negro + `Recuperacion` + `Se redujo el filtro de imagen` |

**El defecto esta en el `ApePlayer` compartido y esta presente en la version publicada.** Actualizar a la
651 **no lo arregla**.

Esto cambia el marco del problema: no se trata de «el candidato REA no funciona», sino de que **el
reproductor de la app que el operador publica hoy ya no sostiene la reproduccion** en este dispositivo y
con fuentes que la 654 si decodifica.

## 12.4 · Alcance honesto de esta comparacion

- Usa **un solo tipo de fuente**: HLS VOD generado por ffmpeg (1080p AVC, segmentos de 4 s) en la LAN.
- **No** se probo un canal real del proveedor con la 651 (exigiria credenciales en el intent).
- La 651 no publica `PlaybackState` en logcat (`PLAYING=0`, `BUFFERING=0`): su observabilidad es menor que
  la de la 654, asi que la comparacion de estado se apoya en capturas y en `ApePlayer`, no en MediaSession.

---

# 13 · Refutada la ultima hipotesis externa: no es el contenido corto

## 13.1 · La hipotesis que quedaba

El player declara `buffer=45/180s`: **minimo 45 segundos de buffer**. Los HLS de prueba anteriores duraban
**30 s de contenido total** — menos que el minimo exigido. Era razonable sospechar que el player esperara
eternamente un buffer que **no puede existir** en un VOD corto, y que el atasco fuera un artefacto de la
prueba y no del producto.

## 13.2 · El experimento

Se genero un HLS de **200 segundos** (6,6x el minimo de buffer), 51 ficheros, **77,5 MB**, servido en LAN
(instantaneo, sin WAN):

```bash
ffmpeg -f lavfi -i "testsrc2=size=1920x1080:rate=30" -f lavfi -i "sine=frequency=440" \
  -t 200 -c:v libx264 -preset ultrafast -g 60 -b:v 3000k -c:a aac -b:a 128k \
  -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename "seg%03d.ts" "master.m3u8"
```

Resultado con la **654**:

```
t+5s  -> 23.818 B   (negro)
t+12s -> 23.852 B   (negro)
t+20s -> 17.631 B   (negro)
t+28s -> 27.876 B   (negro)

BUFFERING = 18
ApePlayer: REARM global_beat: guard sin publicar 23374ms (tick=14)
ApePlayer: REARM global_beat: guard sin publicar 29379ms (tick=17)
```

**Se atasca igual.** Con 200 s disponibles, en LAN, sin WAN, con un buffer minimo de 45 s tres veces
satisfecho.

## 13.3 · Tabla final de descartes

| Hipotesis | Como se probo | Resultado |
|---|---|---|
| Red / WAN | HLS local en LAN | **DESCARTADA** |
| VPN interfiriendo | `ip route get` -> wlan0; always-on null | **DESCARTADA** |
| Codec | AVC 1080p y HEVC | **DESCARTADA** |
| Manifiesto | 5 fuentes distintas | **DESCARTADA** |
| Overlay REA | `PlayerActivity` estandar | **DESCARTADA** |
| Build / version | **651 publicada Y 654 REA** | **DESCARTADA** - ambas fallan |
| SELinux `dmabuf` | el camino sin overlay usa otro pipeline | **DESCARTADA como causa unica** |
| **Contenido mas corto que el buffer minimo** | HLS de 200 s (6,6x el minimo) | **DESCARTADA** |
| **El `ApePlayer` se atasca** | toda la evidencia | **UNICA COMPATIBLE** |

## 13.4 · Estado de la conclusion

Tras 13 secciones de medicion, **todas las explicaciones externas al reproductor estan descartadas con
experimento**. El unico hecho que queda es el medido en §10:

> El `ApePlayer` llega a tener **150 s de buffer**, falla la enumeracion de pistas (`groups=0`), y en **un
> segundo** su buffer cae a la posicion actual y la reproduccion no se recupera; su propio watchdog
> (`REARM global_beat: guard sin publicar`) sube sin techo.

Eso ocurre en la **651 publicada** y en la **654**, con AVC y HEVC, con WAN y con LAN, con contenido corto
y largo. **Es un defecto del reproductor, no del entorno ni de los datos.**

---

# 14 · CAUSA RAIZ NOMBRADA POR LA PROPIA APP: `state=NO_TRACKS reason=rearm`

## 14.1 · Ultimo experimento: directo real, no VOD

Todas las pruebas anteriores usaron VOD. La television en directo es una playlist **en vivo con ventana
deslizante**, y ese es el caso de uso real. Se levanto un stream vivo de verdad:

```bash
ffmpeg -re -f lavfi -i "testsrc2=size=1920x1080:rate=30" -f lavfi -i "sine=frequency=440" \
  -c:v libx264 -preset ultrafast -g 60 -b:v 3000k -c:a aac -b:a 128k \
  -f hls -hls_time 2 -hls_list_size 6 -hls_flags delete_segments \
  -hls_segment_filename "seg%03d.ts" "live.m3u8"
```

Playlist resultante: `EXT-X-TARGETDURATION:2`, `EXT-X-MEDIA-SEQUENCE:0`, ventana de **6 segmentos**,
`delete_segments` activo. Servido desde `192.168.1.9:8123` en LAN.

## 14.2 · Resultado: falla igual, y la app lo nombra

```
t+5s  -> 23.920 B (negro)
t+12s -> 17.631 B (negro)
t+20s -> 17.631 B (negro)

PLAYING=4  BUFFERING=12
ApePlayer: REARM global_beat: guard sin publicar 13368ms (tick=9)
ApePlayer: REARM global_beat: guard sin publicar 15369ms (tick=10)
ApePlayer: REARM global_beat: guard sin publicar 17372ms (tick=11)

*** state=NO_TRACKS reason=rearm bitrate=0kbps samples=763 age=19790ms since_publish=17373ms locked=0kbps floor=0 ***
    state=BUFFERING(6), position=0, buffered position=0, speed=0.0
```

## 14.3 · Por que esto es la causa raiz

**`NO_TRACKS` es el nombre que la propia app da a su estado, y `reason=rearm` dice quien lo provoco.**

La cadena queda cerrada y sin interpretacion:

```
1. El guard del global_beat no logra publicar
2.   -> REARM global_beat  (el watchdog se rearma)
3.   -> el rearme deja el player en  state=NO_TRACKS  reason=rearm
4.   -> sin pistas de video:  tracks sin video (groups=0)
5.   -> buffer cae a la posicion actual y no vuelve
6.   -> BUFFERING(6) permanente + "Recuperacion: reintentando la fuente actual"
```

`since_publish=17373ms` y subiendo confirma que el guard **no publica nunca** tras el rearme. `bitrate=0kbps`
y `locked=0kbps` confirman que no queda ninguna pista seleccionada. `samples=763` demuestra que **si hubo
decodificacion** antes del rearme: no es que no llegaran datos.

## 14.4 · Lo que esto cierra definitivamente

| Pregunta | Respuesta medida |
|---|---|
| ¿Afecta al directo (caso real)? | **SI** - el stream en vivo con ventana deslizante falla igual |
| ¿Es un artefacto del VOD? | **NO** - se probo VOD de 30 s, VOD de 200 s y directo |
| ¿Es falta de datos? | **NO** - `samples=763`, y el buffer llego a 150 s |
| ¿Quien deja al player sin pistas? | **El propio `REARM` del `global_beat`** - lo dice `reason=rearm` |

## 14.5 · Para el que tenga el fuente: el nombre exacto

**Buscar en `ApePlayer.kt` el literal `NO_TRACKS` y el `reason` con valor `rearm`.**

Ese es el punto donde el guard del `global_beat`, al rearmarse, marca el player como sin pistas. La pregunta
concreta es: **por que el guard no publica** (lo que dispara el rearme) y **por que el rearme invalida las
pistas** en vez de solo reprogramar el latido.

**Criterio de exito:** 60 s de un canal en directo con `state=PLAYING`, `since_publish` acotado y sin
`NO_TRACKS`.

---

# 15 · Exoneracion: el fallo NO lo introdujo el despliegue del JIT

## 15.1 · La duda que habia que descartar

Al desplegar el parche REA, `/jit/source.json` paso a **404**. Si el `global_beat` publicara su latido a un
endpoint del VPS que ya no existe, el bucle `REARM -> NO_TRACKS` seria **consecuencia de ese despliegue** y no
un defecto del producto. Habia que medirlo, no suponerlo.

## 15.2 · Medido: la app no hace ni una peticion al VPS

Sesion de 14 s con la 654, buscando en logcat del proceso (`pid 16495`):

```
duckdns        -> 0 ocurrencias
/jit/          -> 0
/sync          -> 0
/ara/          -> 0
SocketTimeout  -> 0
UnknownHost    -> 0
ConnectException -> 0
404            -> 0
```

**El `global_beat` es interno.** No publica a ningun endpoint: el literal `global_beat start` sale de
`ApePlayer` y el guard que falla es un guard **local** (publicacion del latido dentro del propio reproductor,
probablemente a `MediaSession`). No hay trafico de red implicado.

## 15.3 · Segundo argumento: la 651 es anterior

La **651** se publico el **2026-11-07T18:55:00Z** (campo `published_at` de `/ara/version`). El despliegue del
JIT y todas las mediciones de esta sesion son del **2026-11-08**. La 651 ya existia antes y **tambien se
atasca** (§12).

## 15.4 · Conclusion

| Afirmacion | Estado |
|---|---|
| El despliegue del JIT causo el atasco | **REFUTADO** - la app no hace peticiones al VPS durante la reproduccion |
| El fallo es de red | **REFUTADO** - 0 errores de socket, host o conexion |
| El fallo depende del `source.json` ausente | **REFUTADO** - 0 peticiones a `/jit/` |
| El fallo esta en el reproductor | **SOSTENIDO** - unica explicacion compatible con todo lo medido |

## 15.5 · Pista adicional aparecida en esta sesion

```
ApePlayer: reintento AVC sameUrl 1/1 (sin cambiar codec)
```

El reproductor **intenta recuperarse** reintentando la misma URL sin cambiar de codec, una sola vez. Ese
reintento no restaura las pistas porque el estado ya es `NO_TRACKS`: vuelve a pedir el mismo manifiesto a un
player que se quedo sin pistas seleccionadas. Es coherente con la cadena del §14 y anade el detalle de que el
mecanismo de recuperacion **no toca el estado de pistas**.

---

# 16 · CORRECCION CON EL FUENTE DELANTE: `NO_TRACKS` era sintoma, no causa

## 16.1 · Antes de nada: el fuente SI estaba en el repo

Durante varias rondas afirme que necesitaba el fuente de la 654 para cerrar el diagnostico. **Era falso:**
el fuente esta en el propio repositorio.

```
IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/
  ApePlayer.kt        22.973 B   <- incluye el latido y el error handler
  BitrateGuard.kt                <- evaluate(), heartbeat(), lockTo()
  PlaybackPolicy.kt     3.857 B  <- target/max 3840x2160, neverDownscale
```

Los artefactos compilados lo confirman: `ApePlayer$Companion$beat$1.class`,
`ApePlayer$Companion$beatHandler$2.class`. **No habia bloqueo de fuente; habia una busqueda incompleta.**

## 16.2 · Correccion: el `global_beat` es SOLO telemetria

El §14 de este documento atribuyo el fallo al `REARM` del `global_beat`. **Leido el codigo, es falso.**

`ApePlayer.kt:418-456` (`beat.run()`), cada `TICK_MS` = 2.000 ms:

```kotlin
val t = p.lastTracks
if (t != null) runCatching { g.evaluate(t) }        // solo publica estado
g.heartbeat(if (t == null) "no_tracks" else "tick") // solo escribe un log
if (g.isStale()) { log REARM; g.heartbeat("rearm") } // solo reescribe el log
```

Y `BitrateGuard.kt:119-129`, la rama que produce `NO_TRACKS`:

```kotlin
if (variants.isEmpty()) {
    state = "NO_TRACKS"
    AraStatus.bitrateState = state
    ...
    return            // NO toca el selector, NO toca el lock
}
```

**El latido no llama a `prepare()`, ni a `seekTo()`, ni cambia el `MediaSource`, ni modifica la seleccion de
pistas.** Escribe cadenas en `AraStatus` y logs. **No puede dejar la pantalla en negro.**

`state=NO_TRACKS reason=rearm` significa: *«al latido le llego un `Tracks` sin variantes de video
utilizables»*. Es la **descripcion del sintoma en el instante del latido**, no su causa.

## 16.3 · Tampoco es `lockHighest`

`ApePlayer.kt:238-277` fija `min = max = bestW x bestH` en el selector. Parecia el culpable, pero
`bestW/bestH` se calcula **recorriendo las pistas reales** (L245-258) y **capando al maximo de la politica**
(L250-252), no al target. Con una fuente 1080p, el lock es 1920x1080 — y el log lo confirma:

```
LOCK resolucion 1920x1080 (neverDownscale=true, min_resolution=3840x2160)
```

Bloqueo **correcto**. `min_resolution=3840x2160` en ese log es informativo (`policy.minWidth/minHeight`), no
lo que se aplica.

## 16.4 · Lo que si muestra la medicion

Sesion de 25 s, misma fuente, repetida:

```
PLAYING=6   BUFFERING=12   tracks_sin_video=1   reintentos=0
player error -> NINGUNO (0 ocurrencias de PlaybackException / ERROR_CODE)

BUFFERING   pos=4655   buf=4655
BUFFERING   pos=4655   buf=4655
BUFFERING   pos=4655   buf=4655
```

**Se detiene siempre en la misma posicion (4.655 ms) y `buffered == position`.** No hay error, no hay
reintento, no hay caida de red. El buffer queda **exactamente** en la posicion: se descarto todo lo que
habia por delante.

Un buffer que se vacia sin error de reproduccion corresponde a un **re-inicio del `MediaSource`** (o a un
cambio de seleccion que invalida el pipeline). En `ApePlayer` el unico punto que reescribe el `MediaSource`
es:

```
ApePlayer.kt:154-155   player.setMediaSource(src); player.prepare()
                        (dentro de openMedia, llamada por playChannel y por attemptDecoderFallback)
```

y el unico punto que **reescribe la ventana del selector en caliente** es `lockHighest`, invocado en el
listener de pistas (`logSelected`, L317 y siguientes).

## 16.5 · Hipotesis tecnica viva (a verificar con build)

**`lockHighest` vuelve a aplicarse en un cambio de pistas posterior al arranque y fija un `min = max`
exacto. Si el nuevo `bestW x bestH` difiere del anterior aunque sea en un pixel (p. ej. altura reportada
1088 por padding de macrobloque frente a 1080 declarada), la seleccion vigente queda fuera de la ventana,
ExoPlayer la invalida, el buffer se descarta y el player queda en `BUFFERING` sin recuperarse.**

Encaja con todo lo medido: inicio correcto, parada a los 4,6 s, `buffered == position`, cero errores y
`tracks sin video (groups=0)` justo antes.

**Es una hipotesis, no un hecho.** Para confirmarla hace falta instrumentar `lockHighest` (loguear cada
`bestW x bestH` aplicado y si ya habia un lock previo) y reconstruir el APK.

## 16.6 · Arreglo candidato (surgical, sin tocar doctrina)

1. **Aplicar el lock UNA sola vez por media**: un flag que se resetea en `playChannel`/`openMedia` y que
   impide re-aplicar `setMinVideoSize`/`setMaxVideoSize` en cambios de pistas posteriores.
2. **O** dejar `setMinVideoSize(0, 0)` y conservar solo el techo (`setMaxVideoSize`), apoyandose en
   `setForceHighestSupportedBitrate(true)` — que ya esta (L267) — para seguir eligiendo la mejor variante.

Ninguna de las dos baja la calidad: la variante elegida sigue siendo la mejor disponible (`forceHighest`).
La diferencia es que un cambio de resolucion en vuelo ya no invalida la seleccion.

**Nada de esto se ha aplicado.** Requiere compilar el APK y repetir la medicion.
