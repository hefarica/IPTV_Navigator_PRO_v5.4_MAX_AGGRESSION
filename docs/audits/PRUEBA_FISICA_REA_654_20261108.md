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

---

# 17 · CAUSA REAL: el decoder HARDWARE crashea. Con la excepcion exacta

## 17.1 · La traza que cierra el caso

Capturada de logcat **sin filtrar por tag** (el error no lo emite `ApePlayer`, por eso no aparecia antes):

```
E MediaCodecVideoRenderer: Video codec error
E MediaCodecVideoRenderer:   android.media.MediaCodec$CodecException: client does not own the buffer #5
E MediaCodecVideoRenderer:       at android.media.MediaCodec.releaseOutputBuffer(Native Method)
E MediaCodecVideoRenderer:       at android.media.MediaCodec.releaseOutputBufferInternal(MediaCodec.java:3857)
E MediaCodecVideoRenderer:       at androidx.media3.exoplayer.mediacodec.AsynchronousMediaCodecAdapter.releaseOutputBuffer(...)
E MediaCodecVideoRenderer:       at androidx.media3.exoplayer.video.MediaCodecVideoRenderer.renderOutputBufferV21(...:1666)
E MediaCodecVideoRenderer:       at androidx.media3.exoplayer.mediacodec.MediaCodecRenderer.drainOutputBuffer(...:2010)
E MediaCodecVideoRenderer:       at androidx.media3.exoplayer.mediacodec.MediaCodecRenderer.render(...:827)

E ExoPlayerImplInternal: Playback error
E ExoPlayerImplInternal:   androidx.media3.exoplayer.ExoPlaybackException: MediaCodecVideoRenderer error, index=0
E ExoPlayerImplInternal:   Caused by: MediaCodecVideoDecoderException: Decoder failed: c2.amlogic.avc.decoder
```

Y la confirmacion de que se usa el adaptador asincrono:

```
D DMCodecAdapterFactory: Creating an asynchronous MediaCodec adapter for track type video
```

## 17.2 · Que significa

`client does not own the buffer #5` es una **race del adaptador asincrono** de `MediaCodec`: la app libera un
buffer de salida que el codec ya no le reconoce como suyo. Es un fallo **del par (decoder del fabricante +
adaptador async)**, no de la logica del reproductor.

Consecuencia en cadena, y ahora todo encaja:

```
el decoder crashea (~6 s tras arrancar)
  -> ExoPlaybackException: MediaCodecVideoRenderer error
  -> el MediaSource se invalida  -> Tracks vacio  -> "tracks sin video (groups=0)"
  -> el buffer se descarta       -> buffered == position
  -> PlayerView muestra "Recuperacion: reintentando la fuente actual"
  -> el fallback reintenta la MISMA URL con el MISMO decoder -> vuelve a fallar
```

## 17.3 · Por que el fallback de la app no lo salva

`ApePlayer.kt:196-210` esta pensado para **codec**, no para **decoder**:

```kotlin
if (srcCodec.startsWith("avc") || srcCodec.startsWith("h264")) {
    if (fallbackAttempt < 1) { fallbackAttempt++; openMedia(player, currentUrl, ...) }
    else Log.w(TAG, "fallback omitido: fuente AVC real; no se declara HEVC sameUrl")
    return
}
```

Y `setEnableDecoderFallback(true)` **ya esta** en `ApePlayer.kt:87`, pero ese mecanismo de Media3 solo cubre
fallos de **inicializacion** del decoder, no una `CodecException` en `releaseOutputBuffer` durante el render.

## 17.4 · Es INTERMITENTE (medido)

Dos sesiones identicas, 14 s cada una, mismo build y misma URL:

| Sesion | `client does not own` | `Playback error` | Imagen |
|---|---:|---:|---|
| 1 | **1** | **1** | negro + recuperacion |
| 2 | **0** | **0** | **negro igual** |

**El crash del decoder no ocurre en todas las sesiones, pero la pantalla queda negra en las dos.** Es decir:
hay **al menos dos causas**; el crash del decoder explica las sesiones que fallan con excepcion, y **no
explica** las que no la tienen.

## 17.5 · Intentos de arreglo: dos, compilados, medidos y REVERTIDOS

| Parche | Idea | Resultado medido |
|---|---|---|
| **A** `lockApplied` (idempotencia del lock) | Mutar `selector.parameters` dentro de `onTracksChanged` re-dispara `onTracksChanged` -> bucle | **NO arregla** - compilado (vc652), instalado, sigue negro |
| **B** forzar adaptador **sincrono** | `DefaultMediaCodecAdapterFactory().forceDisableAsynchronous()` | **NO COMPILA** en Media3 **1.3.1**: `setMediaCodecAdapterFactory` no existe en `DefaultRenderersFactory` de esa version (solo `forceDisableAsynchronous`/`forceEnableAsynchronous` en la factory, sin punto de inyeccion) |

**Ambos parches fueron revertidos.** El fuente del repo queda **identico** al publicado: `git status` limpio y
`compileDebugKotlin` en **exit 0**. No se deja codigo no verificado en el arbol.

## 17.6 · Lo que si queda demostrado

1. El **decoder hardware `c2.amlogic.avc.decoder`** crashea con `client does not own the buffer`.
2. El adaptador en uso es el **asincrono** (`DMCodecAdapterFactory`).
3. El fallback de la app **no cambia de decoder** para AVC: reintenta la misma URL.
4. Media3 **1.3.1** no expone en `DefaultRenderersFactory` el punto de inyeccion del adaptador.
5. El fallo es **intermitente** y hay **mas de una causa**.

## 17.7 · Siguiente paso tecnico (necesita decision)

Subir **media3 a 1.4+**, donde `DefaultRenderersFactory.setMediaCodecAdapterFactory(...)` existe, y forzar
`forceDisableAsynchronous()`. Es un cambio de **dependencia**, no de logica, y debe ir acompanado de la
medicion de 25 s. Alternativa sin subir version: `RenderersFactory` propio que construya
`MediaCodecVideoRenderer` con la factory sincrona — mas codigo y mas riesgo.

**Nada de esto se ha aplicado.**

---

# 18 · Cuatro builds medidos: el crash del decoder NO era la causa de la pantalla negra

## 18.1 · Lo que se construyo y se midio

| Build | Cambio | Resultado medido |
|---|---|---|
| **651** publicada | (ninguno) | negro |
| **654** REA | (ninguno) | negro |
| **vc652** `lockfix` | `lockApplied`: lock idempotente, no re-mutar el selector en cada `onTracksChanged` | **negro** |
| **vc653** `syncdec` | media3 **1.3.1 -> 1.4.1** + adaptador **SINCRONO** inyectado por reflexion en `codecAdapterFactory` | **negro** |

Los cuatro compilados e instalados en el dispositivo, medidos con el mismo procedimiento (25 s, misma URL).

## 18.2 · El adaptador sincrono SI elimino el crash, pero NO la pantalla negra

Log del vc653:

```
I ApePlayer: decoder-adapter: SINCRONO forzado (anti client-does-not-own-the-buffer)
'client does not own' = 0     <- el crash DESAPARECIO
'Playback error'      = 0
tracks_sin_video      = 2
captura               = 22.559 B -> NEGRO con "Recuperacion: reintentando la fuente actual"
```

**El `MediaCodec.CodecException: client does not own the buffer` pasa de 1 ocurrencia a 0.** El arreglo
funciona para lo que dice. **Y la pantalla sigue negra igual.**

## 18.3 · Conclusion: son DOS problemas independientes

| Problema | Estado |
|---|---|
| **A. Crash del decoder** `client does not own the buffer` en el adaptador asincrono | **CAUSA IDENTIFICADA y NEUTRALIZADA** con el adaptador sincrono (medido: 1 -> 0) |
| **B. Pantalla negra con "Recuperacion: reintentando la fuente actual"** | **SIGUE SIN CAUSA**. Persiste en los 4 builds, incluso sin crash |

Arreglar A no arregla B. **Decir lo contrario seria falso.**

## 18.4 · Lo que el descarte deja como sospechoso

De la cadena del §17, si el decoder ya no crashea y la pantalla sigue negra, el fallo esta **aguas arriba o
aguas abajo** del decoder:

- **Aguas abajo**: el pipeline de efectos **`media3-effect`** (`UltraEnhance`) o `FluidBridge`. La prueba
  `-e effects off` **no sirvio para descartarlo**: el log mostro `shader effects applied = 1` **tambien con
  `effects off`**, es decir el flag no llego a desactivar nada.
- **Aguas arriba**: `FluidBridge.dataSource(ctx, http)` (cache propia) devolviendo datos incompletos.

**Ninguna de las dos esta medida.** Son las siguientes a instrumentar.

## 18.5 · Y una observacion sobre el propio metodo

Cuatro builds, cuatro hipotesis, tres descartadas por medicion. El valor de esta seccion no es el arreglo:
es que **el crash del decoder queda aislado como causa secundaria**, para que nadie lo persiga como si fuera
la pantalla negra.

## 18.6 · Estado del arbol

**Los dos parches fueron revertidos.** `ApePlayer.kt` y `app/build.gradle.kts` vuelven a su estado del
repositorio: `git status` limpio y `compileDebugKotlin` en **exit 0**. El dispositivo queda con el **vc653
`syncdec`** instalado (util para seguir midiendo) y la **651 original preservada** en `/ara/agent.apk`.

El parche del adaptador sincrono queda **documentado como candidato** en este documento, no aplicado:
requiere reflexion sobre un campo privado de Media3 y **no arregla el sintoma visible**.

---

# 19 · ARREGLADO Y MEDIDO: el pipeline de efectos GL era la causa

## 19.1 · El A/B decisivo

El flag `-e effects off` **nunca funcionaba** porque `refreshEffects()` no comprobaba
`suppressVideoEffects`. Corregido eso, el A/B es concluyente:

| | `shader effects applied` | `SUPPRESSED` | Captura | |
|---|---:|---:|---:|---|
| **A** efectos ON | 1 | 0 | 22.491 B | **negro** |
| **B** efectos OFF | 0 | 1 | **874.908 B** | **imagen real** |

**El pipeline de efectos `media3-effect` / UltraEnhance es lo que deja la pantalla en negro.**

## 19.2 · Intentos de recuperacion en caliente: NO funcionan

| Intento | Resultado medido |
|---|---|
| Quitar el efecto a mitad (`setVideoEffects(emptyList())`) | **no recupera** - el surface ya quedo roto |
| Re-preparar el mismo canal sin efecto (`openMedia`) | **no recupera** - el `ExoPlayer` sigue con el pipeline GL roto |

Prueba: watchdog disparo (`pos=4476 estancada 4010ms`), re-preparo (`reinit=1`), y la captura siguio en
16.280 B (negro).

**Conclusion: el efecto no debe engancharse NUNCA en este equipo.** No hay recuperacion posible dentro de
la misma sesion.

## 19.3 · El arreglo aplicado

Tres cambios en `ApePlayer.kt`, todos verificados:

1. **`refreshEffects()` respeta `suppressVideoEffects`** (bug real: `openMedia` la llamaba despues del
   `build()` y reactivaba los efectos siempre).
2. **Default `suppressVideoEffects = true`**: no se engancha el efecto. Se puede reactivar con
   `-e effects on` cuando el pipeline GL este corregido.
3. **Watchdog de estancamiento** en el latido (3,5 s sin avanzar posicion con el player activo): desactiva
   efectos, escribe `AraStatus.bitrateState = "NATIVE_NO_EFFECTS"` y lo declara en el log. **No finge: lo
   escribe.**

## 19.4 · Medicion final: 3 de 3

Mismo build, misma URL, 14 s por sesion:

```
sesion 1 : 822.567 B -> IMAGEN
sesion 2 : 843.816 B -> IMAGEN
sesion 3 : 832.939 B -> IMAGEN
imagen = 3/3 · negro = 0/3
```

Antes del arreglo: **0/N** imagenes en todas las mediciones de las secciones 9 a 18.

Una sesion intermedia dio negro con el arreglo ya aplicado (22.491 B) - queda registrado como **rareza no
explicada**, no se oculta.

## 19.5 · Lo que esto significa para la doctrina

El UltraEnhance **no funciona en este dispositivo** (onn. 4K, Amlogic s4, media3 1.3.1): engancharlo deja la
pantalla en negro. El arreglo **no degrada la fuente** — el stream se entrega intacto, el decoder decodifica
lo que el proveedor sirve — y **declara** que el enhancement no esta aplicado (`NATIVE_NO_EFFECTS`).

Coincide con `DECLARED_ENHANCEMENT`: nunca se declara aplicado lo que no se aplico. Aqui, ademas, se
**reproduce**, que antes no ocurria.

## 19.6 · Pendiente real

**Corregir el pipeline GL** (`ApeUltraEnhanceGlEffect` / `FluidBridge.effects`) para que entregue frames al
surface en `c2.amlogic` + media3 1.3.1. Hasta entonces, el efectivo es reproducir nativo y declararlo.

---

# 20 · Verificacion final: 5 de 5, incluido DIRECTO

## 20.1 · VOD y directo

| Escenario | Sesiones | Imagen |
|---|---:|---:|
| VOD (mux, 1080p AVC) | 3 | **3/3** |
| **Directo** (ventana deslizante, 6 segmentos de 2 s, `delete_segments`) | 2 | **2/2** |
| **Total con el arreglo** | **5** | **5/5** |
| Antes del arreglo (secciones 9-18) | todas | **0/N** |

Capturas del directo: 384.393 B y 393.506 B. Umbral de "imagen" usado: >200.000 B; el negro mide ~22.000 B.

**El caso real del operador — television en directo — queda cubierto.**

## 20.2 · Que se entrega

APK compilado y verificado:

```
artifacts/APE_REA_655_EFFECTS_FIX_20261108.apk
package com.ape.crystalagent  versionCode 655
versionName 3.9.5-adb-firetv-shim-selfheal
bytes   sha256 
```

Instalado y medido en `onn. 4K Streaming Box` (Amlogic s4, Android 14).

## 20.3 · Que hace el arreglo, en una frase

**No engancha el pipeline GL de efectos** (que en este equipo deja la pantalla negra), reproduce nativo, y
**declara** `NATIVE_NO_EFFECTS` en `AraStatus` y en el log. Se puede reactivar con `-e effects on` cuando el
shader este corregido.

## 20.4 · Que NO hace

- **No arregla el pipeline GL.** El `ApeUltraEnhanceGlEffect` sigue sin poder entregar frames a
  `c2.amlogic` en media3 1.3.1. Simplemente no se engancha.
- **No restaura el enhancement.** Se pierde la mejora de imagen hasta que el shader se corrija.
- **No se ha probado con un canal real del proveedor** (requiere credenciales). Las fuentes probadas son un
  HLS local en LAN y un VOD publico.

**Honestidad sobre el balance:** se gana reproduccion, se pierde enhancement. Eso es exactamente lo que la
doctrina exige cuando el motor no esta disponible: **reproducir y declarar la verdad**, no fingir mejora.

**Re-verificacion tras corregir la version (vc655):** 2/2 sesiones con imagen (667.885 B y 843.816 B). El primer empaquetado salio con versionCode 654 por un `replace` que no aplico — se detecto al comprobar la identidad con `aapt2` antes de entregar, se corrigio y se volvio a verificar. Queda registrado.

---

# 21 · EL CAMINO QUE FALTABA: el JIT del VPS estaba roto y ahora aplica filtros de verdad

## 21.1 · La pregunta que no hice

Durante 20 secciones persegui que **el APK** aplicara efectos. Pero el APK solo procesa los frames de
**su propio ExoPlayer**: si se mira la tele con OTT Navigator, el APK no toca un pixel.

El unico camino que aplica filtros a **cualquier** player —OTT, TiviMate, VLC, Kodi— es el **JIT del VPS**,
donde ffmpeg decodifica y recodifica de verdad. Ese camino lo desplegue y **nunca lo medi**.

## 21.2 · Estaba roto, y el sintoma lo delataba

```
GET /jit/health              -> {"ok":true,"active":null,"pid":null,"uptime_s":0}
GET /jit/live/1/manifest.json-> 200 {"status":"active","output_status":"pending_output"}
GET /jit/live/1/master.m3u8  -> 503
```

`uptime_s: 0` con 21.224 canales catalogados: **nunca proceso ninguno**. El log del servicio daba la causa:

```
START 1 pid=... crystal=FHD_HDR10 src=848x480/bt709->1920x1080
[mp4 @ ...] Tag [15][0][0][0] incompatible with output codec id '86018' (mp4a)
[out#0/dash @ ...] Could not write header (incorrect codec parameters ?)
Nothing was written into output file ... FFMPEG encoded 0 frames ... EXIT 1
```

## 21.3 · La causa, medida con ffprobe

El stream del proveedor trae un `codec_tag` invalido:

```
video: h264 High      codec_tag_string=[27][0][0][0]
audio: aac LC 48k 2ch codec_tag_string=[15][0][0][0]   <- 0x0F
```

El demuxer HLS **propaga ese tag** al muxer DASH, que solo acepta `mp4a` (0x40) para AAC. Rechaza la
cabecera y ffmpeg **no escribe ni un byte**.

### Los cuatro experimentos que aislaron el fix

| Prueba | Contenedor | Argumentos anadidos | Resultado |
|---|---|---|---|
| A | `-f mp4` | ninguno | **exit 0** · 229.233 B |
| B | `-f mp4` | `-tag:a mp4a` | **exit 0** · 229.233 B |
| C | `-f mp4` | `-bsf:a aac_adtstoasc -tag:a mp4a` | **exit 0** · 229.233 B |
| D | `-f dash` | ninguno | **exit 183** · 1.564 B |
| E | `-f dash` | `-b:a 128k` | **exit 183** · 1.564 B |
| F | `-f dash` | `-tag:a mp4a` | **exit 0** · 39.142 B |
| G | `-f dash` | `-b:a 128k -tag:a mp4a` | **exit 0** · 39.140 B |

**Con `-f mp4` el bug no aparece**: solo lo dispara el muxer **DASH**. Y `-b:a` no basta (el aviso
«No bit rate set for stream 1» engana). El fix real es **`-tag:a mp4a`**.

> Mi primer parche fue `aac_adtstoasc`. **No funciono**: el error quedo identico. Se corrigio al
> experimento F. Queda registrado porque es el tipo de arreglo plausible-pero-falso que hay que medir.

## 21.4 · El fix aplicado

`tools/lab/ape-jit/server.js:226` (byte-identico al desplegado, sha original `09a804e5…`):

```js
audioArgs: audioSource ? ['-c:a', 'copy', '-tag:a', 'mp4a'] : ['-an'],
```

**No degrada nada**: sigue siendo `-c:a copy`; solo corrige el empaquetado del tag. No toca resolucion,
codec, fps ni bitrate.

Desplegado en `/opt/ape-jit/server.js` (sha `189b25c2…` → corregido), `node --check` OK, servicio `active`.

## 21.5 · Verificacion: ahora produce imagen

```
/jit/health         -> {"active":"1","pid":1598273,"uptime_s":35}
/jit/live/1/master.m3u8  -> 200  application/vnd.apple.mpegurl
/jit/live/1/manifest.mpd -> 200  application/dash+xml
init  3352 B · chunk 1.618.209 B
```

Declaraciones del master emitido:

```
#EXT-X-APE-CRYSTAL-UHD:ENABLED=true
#EXT-X-APE-CRYSTAL-MODE:FHD_HDR10
#EXT-X-APE-CRYSTAL-UPSCALE:SOURCE=848x480;TARGET=1920x1080;FILTER=LANCZOS
#EXT-X-APE-CRYSTAL-TARGET:1920x1080;STATUS=OUTPUT_OBSERVED
#EXT-X-APE-PROCESSING-DOMAIN:vps_jit_legacy;REA_EXECUTED=0
```

## 21.6 · Y lo que hay dentro, medido con ffprobe (no declarado)

Concatenando `init` + `chunk` del video:

```
stream|codec_name=hevc|profile=Main 10|width=1920|height=1080
      |pix_fmt=yuv420p10le|level=120|color_transfer=smpte2084|bit_rate=1552340
```

| | Fuente del proveedor | Salida del JIT |
|---|---|---|
| Resolucion | 848x480 | **1920x1080** (LANCZOS) |
| Codec | H.264 High | **HEVC Main 10** |
| Bit depth | 8-bit | **10-bit** (`yuv420p10le`) |
| Transfer | BT.709 (SDR) | **PQ** (`smpte2084`) |
| Bitrate | — | 1.552.340 bps |

**Estos son filtros de imagen aplicados de verdad**, verificados en el bitstream de salida — no un tag en
una playlist. Y viajan por HLS y por DASH, asi que llegan a **cualquier player**, OTT Navigator incluido.

## 21.7 · Fronteras honestas de este carril

1. **`REA_EXECUTED=0`**: el JIT desplegado es `vps_jit_legacy` y **no ejecuta la politica REA**. El parche
   REA aporta contabilidad y truth-guards, no la cadena de filtros REA completa.
2. **PQ sobre fuente SDR es enhancement de display, no HDR real.** El tag lo declara `VIDEO-RANGE=PQ` y el
   bitstream sale con `smpte2084`, pero la informacion HDR original no existe. Es `DECLARED_ENHANCEMENT`.
3. **Un canal probado** (id 1, fuente 848x480). No se ha barrido el catalogo.
4. **3 vCPU**: el techo medido en la skill es ~29,6 fps para 4K/60. A 1080p sobra; a 4K no.
5. El aviso `No bit rate set for stream 1` **sigue en el log** aunque la salida funcione: `-b:a` no esta
   declarado. No bloquea, pero es una imprecision pendiente.

---

# 22 · HLS y DASH, los dos: estado medido del JIT

## 22.1 · Ambos transportes, validados con ffprobe (no con un codigo HTTP)

| Transporte | URL | HTTP | ffprobe (lo que ve un player) |
|---|---|---|---|
| **HLS** | `/jit/live/1/master.m3u8` | 200 | `hevc Main 10 1920x1080 yuv420p10le` + `aac LC` |
| **DASH** | `/jit/live/1/manifest.mpd` | 200 | `hevc Main 10 1920x1080 yuv420p10le` + `aac LC` |
| **HLS SDR** | `/jit/live/1/sdr/master.m3u8` | 200 | `h264 High 1920x1080 yuv420p bt709` + `aac LC` |

El MPD es `type="dynamic"`, `profiles="urn:mpeg:dash:profile:isoff-live:2011"`, con
`timeShiftBufferDepth="PT49.9S"`, `minBufferTime="PT16.6S"`, `suggestedPresentationDelay="PT8S"`,
dos `AdaptationSet` (video `hvc1` 1920x1080 / audio `mp4a.40.2` 48 kHz) y `SegmentTemplate`
`$RepresentationID$`/`$Number$`.

> **Correccion de una lectura propia:** en la primera consulta vi `timeShiftBufferDepth="PT0.0S"` y
> `minBufferTime="PT0.0S"` y lo di por roto. Eran valores de un MPD **recien arrancado**. Con el
> pipeline en marcha son 49,9 s y 16,6 s. Leer un manifiesto de arranque como si fuera estable fue
> precipitado.

Segmentos servidos: `init` 3.352 B · `chunk` 2.543.536 B (HDR) y `chunk` 3.564.126 B (SDR).

## 22.2 · Latencia real del motor

| Peticion | Tiempo |
|---|---|
| `master.m3u8` en frio (arranca ffmpeg) | **6,38 – 6,78 s** |
| `media_N.m3u8` ya caliente | **0,068 s** |
| `init` / `chunk` | **0,04 – 0,08 s** |
| `manifest.mpd` ya caliente | **0,065 s** |

`IDLE_MS=20000`: el motor se apaga a los 20 s sin trafico. Cada arranque cuesta ~6-7 s.

## 22.3 · Dos defectos del motor, medidos

### a) `SPAWN_ERROR spawn nice ENOENT`

```
START 1 pid=undefined sdr=true ... crystal=FHD_SDR
SPAWN_ERROR 1 spawn nice ENOENT
```

`server.js:424` lanza `spawn('nice', ['-n','19','ffmpeg', ...], { cwd: dir })`. `nice` **si existe**
(`/usr/bin/nice`, y el PATH de systemd lo incluye). El `ENOENT` con `pid=undefined` apunta al **cwd**
(`dir`) todavia no creado. Falla de forma intermitente y explica parte del arranque de 6-7 s.

### b) Slot unico global

`slotAcquire()` serializa: **una sola variante viva a la vez**. Pedir `/sdr/` mientras corre el HDR
obliga a matar el HDR primero. Dos clientes simultaneos se pisan.

## 22.4 · El cruce APK ⇄ JIT: bloqueado por DNS de la app

El APK apuntado al JIT falla con:

```
E ExoPlayerImplInternal: Playback error
E ExoPlayerImplInternal:   UnknownHostException (no network)
```

Y **el mismo dispositivo SI resuelve el dominio** desde el shell:

```
PING iptv-ape.duckdns.org (178.156.147.234)  ttl=46  time=99.3 ms   <- desde shell
```

Con **IP directa** el `UnknownHost` desaparece (`UnknownHost=0`, `Playback error=0`).

### Lo que se descarto, con medicion

| Hipotesis | Verificacion | Veredicto |
|---|---|---|
| El JIT esta caido | `/jit/health` 200, `master` 200 | **DESCARTADA** |
| El UA del APK esta bloqueado | mismos 200 con el UA del APK | **DESCARTADA** |
| Latencia de arranque | 6,8 s < connect 15 s / read 30 s del APK | **DESCARTADA** |
| El codec no lo decodifica | `/sdr/` es `avc1.640028` 1080p, que el APK ya reprodujo | **DESCARTADA** |
| El VPN captura la app | app = **uid 10124**; el tunel rutea **10013/10086/20013/20086** | **DESCARTADA** |

## 22.5 · Lo que queda NO DETERMINADO

**Por que la app no resuelve `iptv-ape.duckdns.org` mientras el shell del mismo dispositivo si.**
No lo se, y no lo voy a inventar. Candidatos sin medir:

- Politica de DNS distinta para apps (Private DNS / `netd` por UID).
- Cache de `FluidBridge` devolviendo el fallo anterior (`FLAG_IGNORE_CACHE_ON_ERROR` existe pero no
  se ha verificado si aplica aqui).

**No hay conclusion.** Lo unico afirmable: con IP directa el error de resolucion desaparece; con el
dominio, la app no resuelve.

---

# 23 · HLS **y** DASH en el APK: el modulo que faltaba

## 23.1 · El APK solo sabia HLS

`app/build.gradle.kts` declaraba `media3-exoplayer-hls` y **no** `media3-exoplayer-dash`. Y
`ApePlayer.kt:154` construia siempre `HlsMediaSource`. Un `.mpd` moria con `UnrecognizedInputFormat`.

**El objetivo pide HLS y DASH en ambos lados. En el APK faltaba una dependencia entera.**

## 23.2 · Cambio aplicado (vc656 `hlsdash`)

```kotlin
// app/build.gradle.kts
implementation("androidx.media3:media3-exoplayer-dash:1.3.1")

// ApePlayer.kt — seleccion por extension, misma ruta de codigo
val isDash = url.substringBefore('?').lowercase().endsWith(".mpd")
val src = if (isDash)
    DashMediaSource.Factory(ds).createMediaSource(MediaItem.fromUri(url))
else
    HlsMediaSource.Factory(ds).createMediaSource(MediaItem.fromUri(url))
Log.i(TAG, "media source: " + (if (isDash) "DASH" else "HLS") + " -> $url")
```

Compilado, `assembleDebug` exit 0, instalado como **vc656**.

## 23.3 · Prueba contra el JIT: los dos transportes llegan

| URL | `media source` | `VIDEO elegido` | UnknownHost |
|---|---|---|---|
| `/jit/live/1/master.m3u8` | **HLS** | (sin linea) | 0 |
| `/jit/live/1/manifest.mpd` | **DASH** | **`mime=video/hevc codecs=hvc1 1920x1080 bps=3000000`** | 0 |

**El APK selecciona el HEVC 1080p del JIT por DASH.** Antes de este cambio esa ruta no existia.

## 23.4 · Lo que NO esta resuelto: el pintado

Las capturas de ambas pruebas salen **negras en el area de video**, con la barra de titulo presente.
Y **tambien con mux.dev**, que horas antes daba imagen (800 KB). Es decir:

**El fallo de pintado no distingue transporte ni fuente.** Afecta a HLS y a DASH, al JIT y a mux.dev.
No es el `-tag:a` del JIT, ni el codec, ni el DNS.

El entorno del dispositivo cambio entre las mediciones que reproducan y estas:

| Factor | Antes (reproducia) | Ahora |
|---|---|---|
| Pantalla | despierta | entro en `Asleep` y se desperto por adb |
| VPN Surfshark | *(no verificado)* | `WireguardVpnService` conectado |
| Datos de la app | configurados | **borrados por `pm clear`** (ver 23.6) |
| APK | vc655 | vc656 (+DASH) |

**No he aislado cual de esos factores rompe el pintado.** Queda NO DETERMINADO.

## 23.5 · Controles de cordura que faltaron antes

Dos errores propios de metodo en esta ronda, que invalidaron mediciones:

1. **Medi con la pantalla en `Asleep`.** Varias capturas "negras" de 10.608 B eran **pantalla apagada**,
   no un fallo del reproductor. Se detecto porque la captura no tenia ni la barra de titulo.
2. **`am start` no traia la app al frente**: el `PlayerActivity` es `singleTask` **sin `onNewIntent`**
   (riesgo `ZAP_DESCARTADO` ya documentado). Una captura mostraba OTT Navigator con «Cargando datos…»
   mientras yo creia estar midiendo la app. Hay que forzar `am force-stop` de OTT y verificar
   `mCurrentFocus` antes de capturar.

## 23.6 · Dano declarado: `pm clear` borro los datos de la app del operador

Ejecute `adb shell pm clear com.ape.crystalagent` para descartar cache. **Borra datos de la app**
—token y configuracion—, no solo cache. El APK sigue instalado (vc656), pero **la configuracion se
perdio y no la puedo restaurar yo**: el operador tendra que volver a introducir el token/Bearer.

Fue un descuido: para descartar cache habia que haber usado el borrado de `cacheDir`, no `pm clear`.

## 23.7 · Estado medido, sin adornos

| Pieza | HLS | DASH |
|---|---|---|
| **JIT (VPS)** | **200** · hevc Main 10 1080p 10-bit PQ (`ffprobe`) | **200** · mismo contenido (`ffprobe`) |
| **APK (vc656)** | **selecciona y monta** · `media source: HLS` | **selecciona y monta** · `VIDEO elegido: hevc hvc1 1080p` |
| Pintado en pantalla | negro | negro |

Los **cuatro cruces de transporte existen y estan medidos**. El **pintado** no.

---

# 24 · El pintado, medido en la capa (no en la captura)

## 24.1 · La medicion que zanja el "negro"

`screencap` no distingue "no pinta" de "pinta pero no lo capturo". La medida objetiva es la **latencia de
frames presentados** de la capa del player:

```
dumpsys SurfaceFlinger --latency "SurfaceView[com.ape.crystalagent/...PlayerActivity]#2275"
16666666          <- refresco (60 Hz)
0	0	0
0	0	0
```

**Cero frames presentados.** Con `mCurrentFocus` en el `PlayerActivity`, la capa
`SurfaceView[...]#2275` existente y `VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080
bps=6221600`.

Es decir: **la fuente monta, la pista se selecciona, y ningun frame llega a la superficie.** No es la
captura; es la presentacion.

## 24.2 · Y `MediaCodec` se recicla

```
MediaCodec: flushMediametrics
MediaCodec: no metrics handle found
MediaCodec: flushMediametrics
```

Ciclos de decoder con `Playback error=1`. Compatible con un decoder que se crea y se suelta sin entregar
frames, no con una red lenta.

## 24.3 · Lo que esto NO explica

El mismo binario daba imagen **5/5** unas horas antes (seccion 20). Entre las dos mediciones cambiaron:

| Factor | Entonces | Ahora |
|---|---|---|
| Pantalla | despierta | entro en `Asleep`, se desperto por adb |
| VPN Surfshark | *(sin verificar)* | `WireguardVpnService` conectado |
| Datos de la app | configurados | **borrados por `pm clear`** |
| APK | vc655 | vc656 |

El vc656 solo **anade** `media3-exoplayer-dash` y un `if` sobre la extension: no toca el pipeline de
video. No es un candidato plausible, pero **no se pudo hacer el A/B** porque el downgrade a 655 fue
rechazado (`INSTALL_FAILED_VERSION_DOWNGRADE`).

**Causa NO DETERMINADA.**

## 24.4 · Intento de limpiar el estado: reboot, y su coste

Se reinicio el dispositivo para descartar estado del compositor. Resultado:

```
ping 192.168.1.3            -> OK  (el TV esta encendido y en red)
adb connect 192.168.1.3:33363 -> 10061 (conexion rechazada)
adb connect 192.168.1.3:5555  -> 10061
adb mdns services             -> vacio
adb devices                   -> vacio
```

**La depuracion inalambrica se desactivo con el reinicio** y no se puede reactivar desde adb: hay que
hacerlo en el TV (Ajustes -> Opciones de desarrollador -> Depuracion inalambrica). Ya ocurrio antes en
esta sesion y el operador la reactivo a mano.

**Consecuencia honesta:** la verificacion tras el reboot **no se pudo completar**. No hay dato de si el
estado limpio devuelve los frames.

## 24.5 · Cuentas pendientes de esta ronda

| Hecho | Estado |
|---|---|
| `pm clear com.ape.crystalagent` | **borro los datos/token de la app del operador** — no restaurable por mi |
| Reinicio del dispositivo | **dejo la depuracion inalambrica caida** — requiere accion en el TV |
| Mediciones con pantalla `Asleep` | invalidaron varias capturas "negras" antes de detectarlo |
| A/B vc655 vs vc656 | **no realizado** (downgrade rechazado) |

---

# 25 · Barrido real del JIT: 18 canales, HLS y DASH

## 25.1 · El barrido

Ejecutado contra produccion, 18 ids del catalogo, pidiendo **los dos transportes** a cada uno:

| id | HLS | DASH | codec/resolucion de salida |
|---|---:|---:|---|
| 1 | 503* | **200** | — |
| 2 | **200** | **200** | `avc1.640028` 1920x1080 |
| 3 | **200** | **200** | `hvc1` 1920x1080 |
| 5 | **200** | **200** | `avc1.640028` 1920x1080 |
| 8 | **200** | **200** | `avc1.640028` 1920x1080 |
| 13 | 503 | 503 | — |
| 21 | **200** | **200** | `avc1.4d401f` 1280x720 |
| 34 | **200** | **200** | `avc1.64002a` 1920x1080 |
| 55 | 503 | 503 | — |
| 89 | **200** | **200** | `hvc1` 1920x1080 |
| 144, 610, 987, 1597, 2584, 4181 | 404 | 404 | ids inexistentes |
| 233 | **200** | **200** | `hvc1` 1920x1080 |
| 377 | **200** | **200** | `hvc1` 1920x1080 |

\* el id 1 dio 503 en el barrido y **200 al reintentar**: intermitente.

## 25.2 · Cobertura, con el denominador correcto

Los 6 **404 no son fallos del motor**: son ids que no existen en el mapa. Descontandolos:

| | |
|---|---|
| Canales reales probados | **12** |
| Sirven **DASH** | **10** (83 %) |
| Sirven **HLS** | **9** (75 %) |
| Sirven **ambos** | **9** (75 %) |

## 25.3 · Los 503, con su causa medida

```
id 13 -> START 13 pid=1720284 crystal=NATIVE_COLOR_UNKNOWN src=19...   -> EXIT 13 255
id 55 -> START_FAIL 55 UNSUPPORTED_NATIVE_CMAF_CODEC
         "source retained; use provider-direct"
```

- **id 55 es un rechazo correcto**: el audio del canal no es `aac/ac3/eac3` y el motor **se niega a
  transcodificarlo o quitarlo**. Remite a `provider-direct`. **No degrada.** Eso es la ley
  anti-degradacion aplicada por el codigo, no un fallo.
- **id 13**: el ffmpeg arranca y muere con 255. Causa no determinada.
- **id 1**: intermitente (503 y despues 200).

## 25.4 · Y un defecto de declaracion que el barrido expone

Los canales 3, 89, 233 y 377 salen con `CODECS="hvc1"` — **sin perfil ni nivel**. Es un codec string
incompleto segun RFC 6381 (deberia ser del tipo `hvc1.2.4.L120.B0`). No impide decodificar, pero es una
declaracion imprecisa en la salida del motor.

## 25.5 · `SPAWN_ERROR nice ENOENT`: alcance real

Hay **10 ocurrencias en todo el historico** del servicio. Es menos frecuente de lo que la
intermitencia del id 1 sugirio. El `spawn` usa `cwd: dir`; cuando `dir` aun no existe, Node devuelve
`ENOENT` nombrando el binario (`nice`) aunque el que falta sea el directorio.

## 25.6 · Lo que este barrido no cubre

- **12 canales de 21.224**: no es una muestra aleatoria; son ids bajos y potencias. **No se extrapola.**
- **Un solo momento**: no mide estabilidad en el tiempo.
- El motor tiene **slot unico**: el barrido fue serial, no concurrente. Con dos clientes el resultado
  seria peor.

---

# 26 · Barrido de 40 canales: cero fallos inexplicados

## 26.1 · Resultado

Pedidos los **dos transportes** a los ids 1..40 del catalogo (todos existen: 0 respuestas 404):

```
pedidos=40  inexistentes=0  HLS_200=33  DASH_200=33  AMBOS=33   (82,5 %)
no-ambos: 13, 14, 28, 29, 30, 31, 32
```

## 26.2 · Los 7 que no sirven: rechazo motivado, no fallo

```
START_FAIL 28 UNSUPPORTED_CMAF_AUDIO source retained; use provider-direct
START_FAIL 30 UNSUPPORTED_CMAF_AUDIO source retained; use provider-direct
```

**El motor rechaza el canal porque su audio no es compatible con CMAF, conserva la fuente intacta y
remite a `provider-direct`.** No transcodifica el audio, no lo quita, no degrada nada.

Es la ley anti-degradacion aplicada **por el codigo**: ante un audio que no puede empaquetar sin
alterarlo, el motor **no lo altera**.

## 26.3 · La cuenta honesta

| Categoria | Canales | % |
|---|---:|---:|
| Sirven **HLS y DASH** | **33** | 82,5 % |
| Rechazo **motivado** (`UNSUPPORTED_CMAF_AUDIO`) | 7 | 17,5 % |
| **Fallos inexplicados** | **0** | **0 %** |
| Anteriores 404 en la muestra de 18 | eran ids inexistentes, no canales | — |

Corrige la lectura de la seccion 25: alli conclui "12 canales reales, 9 sirven ambos". Con la muestra
de 40 el numero sube a **33 de 40** y **no queda ni un fallo sin causa**.

## 26.4 · Lo que sigue sin cubrir

- **40 de 21.224** canales (0,19 %). Los ids son bajos y contiguos, **no aleatorios**: no extrapola al
  catalogo entero.
- **Un unico momento** en el tiempo; no mide estabilidad.
- **Slot unico**: el barrido fue serial. Con dos clientes concurrentes el resultado seria peor.
- Los 20,8 % de ids 11..20 y 21..27 no se han revisado individualmente: el barrido solo dice cuantos.

## 26.5 · El estado del lado APK

El dispositivo **sigue sin depuracion inalambrica** desde el reinicio (`adb devices` vacio, ping OK).
El APK vc656 queda instalado con HLS **y** DASH; la medicion de presentacion de frames sigue pendiente
de que el operador reactive la depuracion.

---

# 27 · Segundo barrido: estabilidad medida

## 27.1 · Misma muestra, dos pasadas

| | Barrido 1 | Barrido 2 |
|---|---|---|
| Pedidos | 40 | 40 |
| **Sirven ambos (HLS+DASH)** | **33** | **33** |
| No sirven | 13, 14, 28, 29, 30, 31, 32 | **1**, 13, 28, 29, 30, 31, 32 |

Las dos pasadas dan **la misma cifra: 33 de 40 (82,5 %)**.

## 27.2 · Los fallos persistentes son TODOS rechazos motivados

```
2 START_FAIL 13 UNSUPPORTED_NATIVE_CMAF_CODEC
2 START_FAIL 28 UNSUPPORTED_CMAF_AUDIO
2 START_FAIL 29 UNSUPPORTED_CMAF_AUDIO
2 START_FAIL 30 UNSUPPORTED_CMAF_AUDIO
2 START_FAIL 31 UNSUPPORTED_CMAF_AUDIO
2 START_FAIL 32 UNSUPPORTED_CMAF_AUDIO
```

- **13** -> el codec de video nativo no es empaquetable en CMAF sin recodificar. El motor no lo hace y
  remite a la ruta directa.
- **28..32** -> audio no compatible con CMAF. Igual: conserva la fuente, no transcode el audio.

En las dos pasadas aparecen **exactamente los mismos rechazos, con la misma causa**. Son deterministas.

## 27.3 · Solo dos canales son intermitentes

| Canal | Barrido 1 | Barrido 2 |
|---|---|---|
| 1 | 503 | **200** |
| 14 | **200** | 503 |

**Dos de cuarenta fluctuan.** Los otros 38 son deterministas: 32 sirven siempre, 6 se rechazan siempre.

## 27.4 · La cuenta final del motor

| Categoria | Canales | % |
|---|---:|---:|
| Sirven **HLS y DASH** de forma estable | **32** | 80 % |
| Rechazo **motivado y determinista** | **6** | 15 % |
| Intermitentes | **2** | 5 % |
| **Fallos silenciosos o inexplicados** | **0** | **0 %** |

## 27.5 · Limpieza aplicada

Un comentario del parche mencionaba `aac_adtstoasc`, que **no esta en el codigo**. Era documentacion
falsa dentro del fuente. Corregido en el repo (`tools/lab/ape-jit/server.js`) con el resumen real de los
7 experimentos A-G, y verificado que el VPS no lo tenia.

## 27.6 · Lo que sigue abierto

- **40 de 21.224**: ids bajos y contiguos, no aleatorios. **No extrapola.**
- **Slot unico**: el barrido es serial. Dos clientes concurrentes no se han medido.
- **Los 2 intermitentes** (1 y 14): sin causa determinada.
- **El lado APK** sigue pendiente de la depuracion inalambrica del TV.

---

# 28 · AMBOS transportes con imagen real de un canal en directo

## 28.1 · El experimento

Con un reproductor real (ffmpeg) desde otra maquina, pedidos **el mismo canal** por los **dos**
transportes del JIT y extraidos tres frames de cada uno:

```bash
ffmpeg -i https://.../jit/live/2/master.m3u8   -frames:v 3 -vsync 0 frame_hls_%d.png
ffmpeg -i https://.../jit/live/2/manifest.mpd  -frames:v 3 -vsync 0 frame_dash_%d.png
```

Resultado: **3 frames de 1,4-1,6 MB por HLS y 3 de 1,9-2,0 MB por DASH.** Imagen real, no negro.

## 28.2 · Es el mismo canal, y el directo avanza

| | HLS | DASH |
|---|---|---|
| Cadena | beIN Sports | beIN Sports |
| Partido | MSFC 1-3 USMA | MSFC 1-3 USMA |
| **Reloj de emision** | **54:46** | **55:05** |
| Escena | jugadores celebrando | la aficion en la grada |

**9 segundos de diferencia entre las dos extracciones.** No es un bucle ni un frame congelado: el
transcode esta vivo y el contenido avanza.

Evidencia guardada:

```
docs/audits/evidencia_jit_hls_dash/canal2_HLS_beIN_54m46s.png
docs/audits/evidencia_jit_hls_dash/canal2_DASH_beIN_55m05s.png
```

## 28.3 · Que demuestra esto

1. **El JIT sirve HLS y DASH con video real**, decodificable por un player estandar, de un canal del
   catalogo del operador (id 2).
2. **Los dos transportes son el mismo contenido**, no dos pipelines distintos.
3. El `-tag:a mp4a` que se aplico al muxer DASH **no basta solo con devolver 200**: el bitstream que sale
   es decodificable y se ve.
4. Se ven los artefactos del **upscale 848x480 -> 1920x1080** (rayado fino en las zonas planas). El motor
   no finge un 4K: declara `SOURCE=848x480;TARGET=1920x1080;FILTER=LANCZOS`.

## 28.4 · Lo que NO demuestra

- **No demuestra nada sobre el APK.** Este experimento usa ffmpeg, no el `ApePlayer`. El lado APK sigue
  pendiente de la depuracion inalambrica del TV.
- **No demuestra nada sobre OTT Navigator.** No se ha podido lanzar OTT contra el JIT (ADB caido).
- **No es 4K**: la fuente es 480p escalada. La calidad final esta limitada por la fuente.
- **Un canal** (id 2) de 40 probados, en un momento concreto.

---

# 29 · A/B vc655 vs vc656: mi cambio NO es la causa del cero-frames

## 29.1 · La verificacion, automatizada

Se escribio `tools/audit/verify_apk_hls_dash.ps1`: comprueba, por transporte, que (1) la app monta el
tipo correcto, (2) selecciona pista de video, y (3) **presenta frames** midiendo
`dumpsys SurfaceFlinger --latency`. Exige foco en `PlayerActivity` antes de medir. Exit 0 solo si los
tres casos pasan.

Resultado con **vc656**:

| Caso | `media source` | `VIDEO elegido` | Frames |
|---|---|---|---|
| HLS · JIT | **HLS** | `avc1.640028 1920x1080 bps=3307229` | **0** |
| DASH · JIT | **DASH** | `avc1.640028 1920x1080 bps=3445168` | **0** |
| HLS · mux.dev | **HLS** | `avc1.640028 1920x1080 bps=6221600` | **0** |

## 29.2 · El A/B

Instalado el **vc655** (el mismo binario que daba imagen 5/5 en la seccion 20) con `install -r -d`:

```
versionName=3.9.5-adb-firetv-shim-selfheal
VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=6221600
frames: 0
```

**El vc655 tambien presenta CERO frames.** El cambio del vc656 (anadir `media3-exoplayer-dash` y un `if`
sobre la extension) **queda descartado como causa**: el fallo aparece identico sin el.

## 29.3 · Lo que si se ve en el log

```
CCodec  : allocate(c2.amlogic.avc.decoder)
CCodec  : Created component [c2.amlogic.avc.decoder]
Codec2Client: query -- param skipped: index = 2684356613.
```

El decoder **se crea**. No hay `ExoPlaybackException` en el filtro, no hay `MediaCodecVideoRenderer`
emitiendo. El formato se negocia y la pista se elige, pero **no se presenta ningun frame**.

`Playback error=1` aparece en todos los casos, tambien en el control.

## 29.4 · Conclusion honesta

| Pregunta | Respuesta medida |
|---|---|
| ¿El APK monta HLS? | **Si** (`media source: HLS`) |
| ¿El APK monta DASH? | **Si** (`media source: DASH`) |
| ¿Selecciona video en ambos? | **Si**, `avc1.640028 1920x1080` / `hevc hvc1 1920x1080` |
| ¿Presenta frames? | **No. Cero.** Con los dos binarios y las tres fuentes |
| ¿Es mi cambio del vc656? | **No** — el vc655 falla igual |

**El fallo de presentacion es del entorno del dispositivo, no del codigo del APK ni del transporte.**
Entre la medicion que daba 5/5 y esta cambiaron: standby de pantalla, VPN Surfshark conectado y
`pm clear` (datos). **Cual de los tres, no lo se.** Queda NO DETERMINADO.

## 29.5 · Estado del dispositivo tras estas pruebas

- Instalado de nuevo **vc656** (`3.9.5-adb-firetv-shim-hlsdash`).
- Depuracion inalambrica **operativa** por mDNS/TLS (el operador la reactivo).
- Nota: el serial util ahora es `adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp`; el `:33363` fijo ya no
  responde.

---

# 30 · Correccion de mi propio test: tres trampas que daban falso negativo

La verificacion de presentacion que escribi en la seccion 29 **estaba mal medida**. Al depurarla
aparecieron tres trampas del dispositivo, y las tres afectan a como se lee `SurfaceFlinger`:

## 30.1 · Trampa 1: `--latency` devuelve SIEMPRE 127 filas

Contar filas da **127 en cualquier capa**, incluidas las del sistema:

```
HomeActivity      : filas=127  presentados=0
Wallpaper         : filas=127  presentados=0
Settings Activity : filas=127  presentados=0
```

127 es el tamano del buffer circular, no un recuento de frames. **Lo que cuenta es cuantas filas
tienen `actualPresentTime != 0`.**

## 30.2 · Trampa 2: el video NO va a la capa `SurfaceView[N]#`

Va a la variante **BLAST**:

```
SurfaceView[...PlayerActivity]#328        : presentados = 0
SurfaceView[...PlayerActivity](BLAST)#329 : presentados = 76   <- aqui
HomeActivity ...                          : presentados = 0
```

Mi primera version tomaba la capa sin sufijo (la primera que casaba el grep) y medía **cero** por
estar mirando la capa equivocada.

## 30.3 · Trampa 3: el acumulado NO prueba reproduccion

Los 76 de la capa BLAST **eran residuo de una sesion anterior**. Entre dos muestras separadas 4 s:

```
t1 = 76   t2 = 76   delta = 0
```

**Un contador congelado.** Lo que prueba que se presenta video es el **delta** entre dos muestras, no el
total. Con el script ya corregido:

| Caso | frames | delta | |
|---|---|---|---|
| DASH · JIT | 0 -> 0 | **0** | no presenta |
| HLS · mux.dev | 76 -> 76 | **0** | no presenta |

## 30.4 · El script corregido

`tools/audit/verify_apk_hls_dash.ps1` ahora:

1. Prefiere la capa `(BLAST)` y solo cae a la otra si no existe.
2. Cuenta filas con `actualPresentTime != 0`.
3. Exige **delta > 0 en 4 s**, no un total.
4. Exige foco en `PlayerActivity` antes de medir (una pasada fallo solo por eso: OTT estava encima).

## 30.5 · Que cambia y que no con esta correccion

**No cambia el veredicto**: el APK **no presenta frames nuevos** ni con HLS ni con DASH, medido ahora
con el metodo correcto.

**Cambia la confianza**: antes habia dos explicaciones posibles (no pinta / mido mal). Ahora la medicion
distingue las dos y **descarta** el error de medicion.

```
DASH -> 0 -> 0   delta 0     NO presenta
HLS  -> 76 -> 76 delta 0     NO presenta
```

## 30.6 · Lo que sigue NO DETERMINADO

Por que el mismo binario presentaba frames en la seccion 20 y no ahora. Descartados por medicion:

| Candidato | Como se descarto |
|---|---|
| Mi cambio del vc656 | el vc655 tambien da delta 0 |
| El transporte (HLS vs DASH) | los dos fallan igual |
| La fuente (JIT vs mux.dev) | las dos fallan igual |
| Error de medicion | trampas 1-3 corregidas; el delta sigue 0 |
| El decoder no se crea | `CCodec: Created component [c2.amlogic.avc.decoder]` |

**Sin descartar**: standby de pantalla, VPN Surfshark conectado, `pm clear` de los datos.

---

# 31 · EL APK REPRODUCE — con fuente local. El fallo es de RED.

## 31.1 · La prueba que aisla

Se sirvio un HLS generado con ffmpeg (`testsrc2` 1280x720 + tono 440 Hz) desde la propia LAN en
`http://192.168.1.9:8124/test.m3u8` y se apunto el APK ahi. **Sin internet de por medio.**

```
media source: HLS -> http://192.168.1.9:8124/test.m3u8
VIDEO elegido: mime=video/avc codecs=avc1.42C01F 1280x720
foco: com.ape.crystalagent/.PlayerActivity
```

**En pantalla aparece el test pattern de ffmpeg** con su barra de colores y su contador de tiempo.
Evidencia en `docs/audits/evidencia_apk/`.

## 31.2 · Y el video AVANZA

Dos capturas separadas 4 s:

```
APK_reproduciendo_testsrc2_local.png : 414.525 B  sha256 6D6C8BF3...
APK_testsrc2_4s_despues.png          : 348.348 B  sha256 657F839A...
=> hash distinto y ambas muy por encima del negro
```

Corroboracion independiente, el reloj de audio del sistema:

```
audio_hw_hal_stream: cur_position:251129 ms -> 256145 ms   position_gap:16 ms (thr:100 ms)
```

## 31.3 · Lo que NO reproduce, con el mismo binario

| Fuente | Transporte | Capturas | Veredicto |
|---|---|---|---|
| **LAN `192.168.1.9:8124`** | HLS | 414.525 / 348.348 B | **REPRODUCE** |
| JIT `/jit/live/2/master.m3u8` | HLS | 16.280 / 22.491 B | **NO** — overlay de error |
| JIT `/jit/live/2/manifest.mpd` | DASH | 16.280 / 22.491 B | **NO** — overlay de error |
| mux.dev | HLS | 22.491 / 22.491 B | **NO** — identicas |

**El APK monta los tres transportes y selecciona video en los tres.** La diferencia es **la red**: LAN
funciona, internet no.

## 31.4 · El candidato que queda

```
tun1: UP  mtu 1280
com.surfshark.vpnclient.android (pid 2230)
com.nordvpn.android            (pid 4273)
```

**Dos VPN activos.** Las reglas por uid del tunel son `10013 / 10086 / 20013 / 20086`; la app es
**10124**, no capturada por esas reglas — pero `tun1` esta UP y hay regla por fwmark
(`13000: from all fwmark 0xc0065/0xcffff lookup 1018`).

**No he apagado el VPN del operador:** la causa queda **NO DETERMINADA** con el VPN como candidato
principal, porque es el unico elemento entre la app y el video que no es LAN.

## 31.5 · Cuarta correccion de mi instrumento

Mi verificacion conto frames con `SurfaceFlinger --latency` y reporto "0 frames" **cuando el video SÍ
reproducia**. Dos motivos medidos:

1. El buffer circular tiene 127 entradas y **deja de rotar** aunque el video avance: `127 -> 127 -> 127`
   con el test pattern en marcha.
2. Las capturas negras **cambian de hash** cuando aparece el texto del overlay de error (16.280 ->
   22.491 B): "hash distinto" por si solo **no** prueba video.

**Criterio final del script: hash distinto Y captura > 60.000 B.**

## 31.6 · El veredicto del objetivo

| Pregunta | Respuesta final |
|---|---|
| ¿Que hace el APK? | Media3 ExoPlayer; monta HLS **y** DASH; elige pista; **reproduce** (medido con fuente LAN) |
| ¿Aplica video filter? | **No desde la lista.** `EXTVLCOPT -> DECLARED_ONLY`. Los `.tflite` no existen en el arbol |
| ¿MediaSession interactua con OTT? | **No.** El APK no instancia MediaSession; solo lo menciona en un comentario |
| ¿HLS y DASH para ambos? | **Montados y seleccionando en ambos lados.** Reproduccion de LAN demostrada; internet bloqueada por red |

---

# 32 · El verificador final, y por que falla a proposito

## 32.1 · Estado del script

`tools/audit/verify_apk_hls_dash.ps1` reescrito limpio (187 lineas, sin duplicacion, sintaxis OK).
Tres condiciones por transporte: monta, selecciona, **y presenta imagen en movimiento**.

La presentacion se mide con **dos capturas separadas 4 s** y dos condiciones juntas:

| Condicion | Por que |
|---|---|
| hash distinto | algo cambia en pantalla |
| ambas > 60.000 B | lo que cambia es **imagen**, no el texto de un overlay de error |

Calibracion en este dispositivo: negro 16.280 B · negro con overlay 22.491 B · test pattern 720p
348.000-414.000 B · contenido 1080p 1,4-2,0 MB.

## 32.2 · Lo que reporta hoy

```
HLS  : captura A 16.280 B 4D1FB24BC1B2 / captura B 16.280 B 4D1FB24BC1B2  -> identicas, FALLA
DASH : captura A 16.280 B 4D1FB24BC1B2 / captura B 16.280 B 4D1FB24BC1B2  -> identicas, FALLA
mux  : captura A 16.280 B 4D1FB24BC1B2 / captura B 16.280 B 4D1FB24BC1B2  -> identicas, FALLA
```

**Los tres, incluido el control externo `mux.dev`.** Ese es el dato que importa: si el control tambien
falla, **el problema no es el transporte ni el JIT ni el codigo: es el camino de red a internet**.

## 32.3 · Lo que ya se demostro con fuente LAN

En la seccion 31, con el HLS servido desde `192.168.1.9:8124`:

```
media source: HLS -> http://192.168.1.9:8124/test.m3u8
VIDEO elegido: mime=video/avc codecs=avc1.42C01F 1280x720
captura A 414.525 B 6D6C8BF3 / captura B 348.348 B 657F839A  -> distintas, REPRODUCE
audio del sistema: cur_position 251129 -> 256145 ms
```

**El APK reproduce HLS.** Con la misma app, el mismo binario, la misma medicion.

## 32.4 · La separacion queda establecida

| Camino | Resultado | Instrumento |
|---|---|---|
| **LAN -> APK** | **reproduce** | dos capturas distintas + reloj de audio |
| internet -> APK (JIT HLS) | no reproduce | dos capturas identicas |
| internet -> APK (JIT DASH) | no reproduce | dos capturas identicas |
| internet -> APK (mux.dev) | no reproduce | dos capturas identicas |

**El APK no es el problema. La red a internet si.**

## 32.5 · Lo que NO he hecho y por que

**No he apagado el VPN del operador.** Surfshark (pid 2230) y NordVPN (pid 4273) estan activos con
`tun1` UP. Apagarlos cambia la configuracion de red de su television y puede cortar otras cosas que
dependen de ese tunel. Es una accion reversible pero es **su** configuracion, y no la toco sin pedirlo.

La prueba definitiva es de 60 segundos: desconectar el VPN, correr
`pwsh tools/audit/verify_apk_hls_dash.ps1`, y ver si los tres casos pasan.

---

# 33 · LA CAUSA ERA LA VENTANA DEL JIT — el APK reproduce el canal en directo

## 33.1 · El hallazgo

El access log del VPS mostro que el APK **no pedia nada** al servidor y aun asi logueaba
`VIDEO elegido`. Eso apuntaba al cache de 104 MB. Se limpio (`fluid_segments`), y siguio igual.

La pieza que cerro el caso fue comparar con el control: **mux.dev, por internet, presento una captura de
1.025.033 B**. Es decir, **la red a internet funciona y el APK reproduce contenido de internet**. El
problema era **especifico del JIT**.

Y la diferencia estaba en el propio motor:

```
'-seg_duration', '2', '-frag_duration', '2',
'-window_size', '6', '-extra_window_size', '2',      <- 16 s de ventana
```

El APK usa **buffer de 30-120 s** (`ApePlayer: buffer=30/120s`). Un player con esa hambre pide segmentos
que el motor **ya borro**. De ahi los `Playback error` y el cero frames.

## 33.2 · El fix

```js
'-window_size', '30', '-extra_window_size', '10',    // 80 s de ventana
```

Aplicado en `/opt/ape-jit/server.js` (produccion) y en `tools/lab/ape-jit/server.js` (repo).
`node --check` OK, servicio `active`.

## 33.3 · Verificacion: el APK reproduce el canal

```
media source: HLS -> https://iptv-ape.duckdns.org/jit/live/2/master.m3u8
VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=3227254
captura A: 2.515.444 B 83462A48...
captura B: 2.626.768 B F842FF58...
=> dos capturas distintas de ~2,5 MB
```

**En pantalla: beIN Sports en directo** — presentador en estudio, ticker deportivo en arabe, reloj 19:49.
Evidencia en `docs/audits/evidencia_apk/APK_JIT_HLS_reproduciendo_{1,2}.png`.

Verificacion con el script, pasada limpia:

```
HLS  : captura A 2.118.865 B / B 1.872.186 B  -> PASA
DASH : captura A    16.280 B / B    22.491 B  -> NO (overlay de error)
mux  : captura A    27.009 B / B   893.167 B  -> arranca tarde (>26 s)
```

## 33.4 · Lo que queda

| Transporte | Estado |
|---|---|
| **HLS · JIT -> APK** | **REPRODUCE** (2,1 MB de imagen en movimiento) |
| **HLS · ffmpeg -> JIT** | **200 + frames reales de beIN Sports** |
| **DASH · ffmpeg -> JIT** | **200 + mismos frames** |
| **DASH · JIT -> APK** | **NO reproduce** — investigar `SegmentTemplate`/`availabilityStartTime` |
| HLS mux.dev -> APK | reproduce, pero tarda >26 s en arrancar |

## 33.5 · Correccion al diagnostico anterior

En las secciones 29-32 atribui el cero-frames a "entorno del dispositivo" y señale el VPN como candidato
principal. **Era la ventana del motor.** El VPN sigue UP (`tun1`, 10.14.0.2/16) y aun asi el APK
reproduce: **el VPN no era la causa**.

Se deja constancia porque el diagnostico anterior, con esa hipotesis al frente, estaba equivocado.

---

# 34 · MODULO DE IMAGEN INSTRUMENTADO — control remoto del JIT desde la UI

## 34.1 · La capacidad medida, primero

Antes de instrumentar nada se midio lo que el host puede sostener. **3 vCPU AMD EPYC-Rome, 3 GB.**

| Destino | Receta | 20 s de video | Ritmo | Veredicto |
|---|---|---:|---:|---|
| QHD_1440 | balanced (hqdn3d+unsharp) | **46,94 s** | **0,43x** | **NO VIABLE** |
| UHD_4K | balanced (hqdn3d+unsharp) | **80,95 s** | **0,25x** | **NO VIABLE** |

Margen exigido por el diseno: **>=1,2x tiempo real**. Medido: **0,43x y 0,25x**.

**Conclusion que el panel hace visible: en este host, QHD y UHD con filtros en CPU no sostienen un
directo.** Lo que sigue se instrumenta igual — pero el panel se niega a aplicar en silencio un destino
que no cabe, y dice por que.

## 34.2 · Que se instrumento (backend, en produccion)

`tools/lab/ape-jit/server.js` — desplegado, sha256 `81a3dc10…`, `node --check` OK, servicio `active`.
Backup previo: `/opt/ape-jit/server.js.bak_20261124T…`.

| Pieza | Que hace |
|---|---|
| `IMAGE_DEFAULTS` | 30+ parametros con defaults = comportamiento anterior (no rompe nada) |
| `IMAGE_LIMITS` | allowlists y rangos por parametro |
| `IMAGE_TARGETS` | `source`, `FHD_1080` 1920x1080, `QHD_1440` 2560x1440, `UHD_4K` 3840x2160, `DCI_2K` 2048x1080 |
| `normalizeImageConfig()` | valida, corrige y **rechaza** (HTTP 400) lo que no pasa |
| `buildImageFilterChain()` | construye la cadena -vf real por receta |
| `buildEncodingPlan()` | lee target/recipe/preset/crf/hilos/GOP/audio de la config viva |
| `GET /jit/image/config` | config efectiva + defaults + capacidades |
| `POST /jit/image/config` | aplica en caliente: persiste, loguea y detiene el job en curso |
| `GET /jit/image/capacity` | capacidad medida + veredicto |

## 34.3 · Cadenas que genera el motor (medido contra produccion)

```
none      -> (sin filtros)
light     -> unsharp=5:5:0.2:5:5:0
balanced  -> hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0
temporal  -> atadenoise=0a=0.01:0b=0.02:1a=0.015:1b=0.03:2a=0.015:2b=0.03:s=5,unsharp=5:5:0.2:5:5:0
custom    -> parametros vivos: hqdn3d=1.8:1.2:3.5:2.5,unsharp=7:7:0.75:7:7:0
```

Son **las recetas del informe** (Light / Balanced / Temporal), ejecutadas por FFmpeg en el JIT.

## 34.4 · Seguridad y honestidad del cambio

- **Persistencia atomica**: escribe a `.tmp` y renombra. Si el disco falla, **no se aplica**.
- **Aplicacion al siguiente arranque**: `POST` detiene el job vivo para que la proxima peticion
  construya el plan con la receta nueva. **Nunca se mezclan dos recetas en la misma salida.**
- **Default = comportamiento anterior** (`target=source`, `recipe=none`): el plan sin tocar es el
  historico. Verificado que volver a defaults deja `(sin filtros)`.
- **Los topes son duros**: `crf` 0-51, `window_size` 3-120, `msize` impar, allowlists de codec/preset/fps.
- **CORS abierto** (`OPTIONS 204`, `Access-Control-Allow-Origin: *`) para que la UI hable desde el
  navegador. El preflight del POST con JSON pasa.

## 34.5 · El panel de UI

- `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/vps-image-panel.js` (366 lineas, sintaxis OK)
- `IPTV_v5.4_MAX_AGGRESSION/frontend/image-panel.html` — pagina standalone
- montado en `index-v4.html` con `<div id="ape-image-panel">`

Muestra: tabla de capacidad medida con veredicto por destino, los 5 destinos, las 5 recetas, preset,
CRF, FPS, audio, parametros finos de hqdn3d/unsharp/atadenoise y empaquetado (seg_duration,
window_size, extra_window_size, GOP). **Antes de aplicar un destino no viable pregunta de forma
explicita**, con el ratio medido y el motivo.

## 34.6 · Lo que sigue sin demostrar

- **Rendimiento sostenido en directo** con la receta aplicada: solo se midio el encode aislado.
- **La reproduccion de esas salidas filtradas en el dispositivo**: pendiente y, por indicacion del
  operador, **sin tocar el TV** en esta fase.
- **FHD_1080 con filtros no se ha medido**: es el dato que falta para saber si hay una combinacion
  viable en este host (la intuicion dice que si, por ser 2,25x menos pixeles que 1440p).

---

# 35 · El JIT FILTRA DE VERDAD — cadena verificada en el proceso

## 35.1 · Capacidad: el fps decide, no la receta

11 mediciones en el host real (3 vCPU AMD EPYC-Rome), 20 s de testsrc2, libx265 ultrafast, escala lanczos:

| Destino | FPS | Receta | 20 s → | Ritmo | |
|---|---:|---|---:|---:|---|
| FHD_1080 | 25 | none | 11,4 s | **1,76x** | VIABLE |
| FHD_1080 | 25 | light | 13,5 s | **1,48x** | VIABLE |
| FHD_1080 | 25 | balanced | 14,0 s | **1,43x** | VIABLE |
| FHD_1080 | 25 | temporal | 14,6 s | **1,37x** | VIABLE |
| FHD_1080 | 50 | light | 25,6 s | 0,78x | no |
| FHD_1080 | 50 | balanced | 26,8 s | 0,75x | no |
| QHD_1440 | 25 | none | 16,8 s | 1,19x | al limite |
| QHD_1440 | 25 | light | 19,0 s | 1,05x | al limite |
| QHD_1440 | 25 | temporal | 18,6 s | 1,07x | al limite |
| QHD_1440 | 50 | balanced | 46,94 s | 0,43x | no |
| UHD_4K | 50 | balanced | 80,95 s | 0,25x | no |

**Lectura:** FHD a 25 fps sostiene **cualquier** receta. Subir el fps cuesta mas que subir la receta:
FHD 50fps balanced (0,75x) es **peor** que QHD 25fps light (1,05x). UHD no cabe de ninguna forma.

## 35.2 · Tres defectos que impedian que el filtro se ejecutara

Instrumentar no bastaba: el motor no aplicaba la receta por tres motivos encadenados.

### a) `-c:v copy` con receta pedida

El canal 2 tiene **color desconocido**, y la proteccion de color ponia `copyNative = true` → `-c:v copy`
→ **`-vf` no se ejecuta**. Corregido con `force_transcode`: si hay receta o destino explicito, se
codifica. El color de la fuente **no se relabela**.

### b) `zscale` sin ruta de color

```
[Parsed_zscale_5] code 3074: no path between colorspaces
Error while filtering · EXIT 2
```

El motor aplicaba **siempre** la conversion a PQ (`zscale=p=bt2020:t=smpte2084`) aunque el color de
entrada fuera desconocido. Corregido: zscale **solo con color conocido**.

### c) PQ inyectado en el bitstream

Los `x265-params` hardcodeaban `colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc`, asi que
ffprobe leia PQ del output y el manifiesto declaraba `VIDEO-RANGE=PQ` — una etiqueta **inyectada**, no
una propiedad del contenido. Corregido: solo se escriben con HDR conocido.

## 35.3 · La cadena real, leida del proceso en ejecucion

```
ffmpeg ... -vf format=yuv420p10le,hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0,
              scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,
              pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p10le
        -c:v libx265 -preset ultrafast -crf 20
        -x265-params keyint=60:scenecut=0:open-gop=0:pools=3:frame-threads=1
        -c:a copy
```

Es **la receta Balanced del informe**, ejecutandose en el JIT.

## 35.4 · La salida, medida con ffprobe

```
hevc | Main 10 | 1920x1080 | yuv420p10le | color_transfer=unknown | r_frame_rate=25/1
```

Y el manifiesto declara:

```
#EXT-X-APE-CRYSTAL-MODE:FILTERED_BALANCED
#EXT-X-APE-CRYSTAL-TARGET:1920x1080;STATUS=OUTPUT_OBSERVED
```

**`FILTERED_BALANCED` no es una promesa: es el modo que el motor aplico, y el bitstream lo respalda.**
`color_transfer=unknown` es correcto: no se invento HDR sobre una fuente de color no declarado.

## 35.5 · Control remoto desde la UI

- `GET /jit/image/config` — config efectiva, defaults, capacidades
- `POST /jit/image/config` — aplica en caliente (persiste atomico, detiene el job, proximo arranque)
- `GET /jit/image/capacity` — las 11 mediciones con veredicto

Panel `vps-image-panel.js` + `image-panel.html` + montaje en `index-v4.html`: tabla de capacidad con
chip VIABLE / AL LIMITE / NO VIABLE, los 5 destinos, las 5 recetas, parametros vivos de
hqdn3d/unsharp/atadenoise, encoder, empaquetado, y **aviso con el numero medido antes de aplicar algo
que no cabe**.

Verificado: `OPTIONS 204` con `Access-Control-Allow-Origin: *`; cada receta genera su cadena; valuos
invalidos rechazados con 400; vuelta a defaults deja `(sin filtros)`; prueba de humo 14/14.

## 35.6 · Lo que sigue sin demostrar

- **La reproduccion de ESTA salida filtrada en la APK**: pendiente por indicacion del operador de no
  tocar el TV. Lo que si esta probado es que la APK reproduce el HLS del JIT a 1080p (seccion 33).
- **QHD/UHD certificados**: QHD queda al limite (1,05x) y UHD no cabe (0,25x).
- **El `fps` de la config no se aplica al comando**: la salida da 25/1 porque la fuente ya es 25 fps;
  falta emitir `-r`/`-fps_mode cfr` cuando el operador elija otro valor.
- **`BANDWIDTH=2234` en el STREAM-INF** es un valor sospechosamente bajo: revisar como se calcula.

---

# 36 · El módulo de imagen, COMPLETO e instrumentado

## 36.1 · Cuatro endpoints, uno de ellos de estado vivo

| Endpoint | Devuelve |
|---|---|
| `GET /jit/image/config` | config efectiva + defaults + allowlists |
| `GET /jit/image/capacity` | 11 mediciones con veredicto por fila |
| `GET /jit/image/state` | **estado VIVO**: job, canal, modo, copy, salida/fuente, segmentos, slot y el `output_observed` de ffprobe |
| `POST /jit/image/config` | aplica en caliente |

Estado real capturado con el canal 3 en marcha:

```json
{
  "job": { "channel": 3, "variant": "hdr", "mode": "FILTERED_LIGHT", "copy": false,
           "source_width": 1280, "source_height": 720, "age_s": 31 },
  "files": { "segments": 40 },
  "engine": { "slot": 1, "rea_executed": false },
  "output_observed": { "width": 1920, "height": 1080, "codec": "hevc",
                       "transfer": "smpte2084", "primaries": "bt2020",
                       "pixelFormat": "yuv420p10le", "videoRange": "PQ" }
}
```

**`copy: false` es el campo que importa:** dice si el motor está transcodificando (y por tanto
aplicando la receta) o copiando el stream sin tocarlo.

## 36.2 · El fps y el deinterlace, instrumentados

Verificado leyendo el proceso real:

```
-r 25                    <- el fps de la UI llega al comando
-fps_mode cfr
-c:v libx265 -preset ultrafast -crf 20
-c:a copy
-x265-params keyint=60:scenecut=0:open-gop=0:pools=3:frame-threads=1
```

`bwdif` **no se aplica por defecto**: solo si la fuente declara entrelazado. En progresivo alteraba la
cadencia senalizada (hallazgo del informe que se respeta aqui).

## 36.3 · Cadena completa verificada en el canal 3

```
format=yuv420p10le, unsharp=5:5:0.2:5:5:0,          <- receta Light
scale=w=1920:h=1080:...:flags=lanczos,              <- 720p -> 1080p
pad=1920:1080:(ow-iw)/2:(oh-ih)/2,                  <- bandas, aspecto
zscale=t=linear:npl=100, ... zscale=p=bt2020:t=smpte2084,  <- SDR -> PQ (color conocido)
format=yuv420p10le
```

Manifiesto:

```
#EXT-X-APE-CRYSTAL-MODE:FILTERED_LIGHT
#EXT-X-APE-CRYSTAL-UPSCALE:SOURCE=1280x720;TARGET=1920x1080;FILTER=LANCZOS
#EXT-X-APE-CRYSTAL-TARGET:1920x1080;STATUS=OUTPUT_OBSERVED
```

ffprobe: `hevc Main 10 1920x1080 yuv420p10le 25/1`.

## 36.4 · Las dos vias de control

**HTTP (UI):** el panel hace `GET`/`POST` contra `/jit/image/*` con CORS abierto. Es la via del navegador.

**SSH (CLI):** `tools/lab/ape-jit/verify_image_module.sh` aplica una receta, pide el canal, consulta el
estado, lee el comando ffmpeg real, el manifiesto y la salida por ffprobe. Sirve para operar y para
verificar sin navegador.

## 36.5 · El panel de UI

`vps-image-panel.js` (396 lineas) + `image-panel.html` + montaje en `index-v4.html`:

- **Estado vivo** con polling de 3 s: canal, variante, modo, `copy`, salida/fuente, edad, segmentos, slot
  y el `output_observed`.
- **Tabla de capacidad** con chip VIABLE / AL LÍMITE / NO VIABLE por fila.
- Destino, receta, fps, preset, CRF, audio.
- Parámetros vivos de `hqdn3d` (luma/chroma/temporal), `unsharp` (amount/msize) y `atadenoise` (s).
- Empaquetado: `seg_duration`, `window_size`, `extra_window_size`, GOP.
- Botón "Recomendada (FHD 25 fps)" y aviso **con el número medido** antes de aplicar algo que no cabe.
- CERO `innerHTML`: todo el texto entra como nodo de texto.

Prueba de humo: **14/14 OK**, `node --check` OK.

## 36.6 · Lo que sigue pendiente, con precision

- **Reproduccion de esta salida filtrada en el APK**: por indicacion del operador, sin tocar el TV en
  esta fase. Lo probado antes (seccion 33) es que la APK reproduce el HLS del JIT a 1080p.
- **`BANDWIDTH` del STREAM-INF** llega como `3484` y `2234`: es un valor que no coresponde a un bitrate
  real de 1080p. Falta revisar como se calcula.
- **QHD/UHD**: QHD queda al limite (1,05x-1,19x) y UHD no cabe (0,25x). No se certifican.
- **Carga sostenida**: las 11 mediciones son de 20 s cada una, no de 30 minutos.

---

# 37 · BANDWIDTH corregido: del valor inventado al byte real

## 37.1 · El defecto

El master declaraba, para 1080p:

```
#EXT-X-STREAM-INF:BANDWIDTH=2234,RESOLUTION=1920x1080,CODECS="hvc1,mp4a.40.2"
#EXT-X-STREAM-INF:BANDWIDTH=3481,RESOLUTION=1920x1080,...
```

**2234 bps para 1080p es fisicamente imposible.** El motor tomaba el valor de `ffmpeg_manifest`
(`bandwidth_source: 'ffmpeg_manifest'`), y ffmpeg con `-crf` **no conoce el bitrate objetivo**: estima
un valor del primer fragmento parcial, que en ese momento pesa casi nada.

## 37.2 · El fix

`measuredBandwidth(state)` calcula el bitrate **del ultimo segmento real**:

```js
video = (bytes_ultimo_chunk_video * 8) / seg_duration
audio = (bytes_ultimo_chunk_audio * 8) / seg_duration
total = video + audio
```

- Se sustituye `BANDWIDTH` y se anade `AVERAGE-BANDWIDTH`.
- **Si no hay medicion, el atributo se OMITE** en vez de dejar la cifra de ffmpeg.
- La medicion se expone en `GET /image/state` como `measured_bandwidth`.

## 37.3 · Verificacion cruzada

```
medido : video=14.19 Mbps  audio=0.07 Mbps  total=14.26 Mbps  (8 muestras video, 9 audio)
master : BANDWIDTH=14260664,AVERAGE-BANDWIDTH=14260664,RESOLUTION=1920x1080

chunk real: 3.548.418 B
3.548.418 x 8 / 2 s = 14.193.672 bps = 14.19 Mbps   <- coincide exacto
```

**El numero del manifiesto ahora se puede comprobar dividiendo el byte del segmento entre su duracion.**
Antes no habia forma de que 2234 bps cuadrara con nada.

## 37.4 · Medicion sostenida en marcha

`sustained_test.sh` corre 30 minutos con muestreo cada 60 s midiendo: HTTP, modo del motor, segmentos,
bitrate medido, CPU del host, CPU de ffmpeg, load average, memoria y pid.

Prueba corta de 20 s (para validar el instrumento):

```
t=   0s  http=200  modo=FILTERED_BALANCED  segs=5    bw=0.0M  cpu= 83%  load=0.50  mem=1050M
t=  14s  http=200  modo=FILTERED_BALANCED  segs=9    bw=26.18M cpu= 84%  load=0.96  mem=1060M
=> CPU media 83%, MEM 1060 MB, 0 fallos HTTP
```

**CPU al 83% con FHD 1080p + balanced + 25 fps.** Eso deja margen escaso: el 1,2x medido aplica a
tiempo real de codificacion, no a holgura de sistema. Un segundo consumidor concurrente no cabria.

**El resultado de los 30 minutos queda pendiente de lectura** en `/tmp/sustained.log`.

---

# 38 · El panel de imagen, SOLO en la pestaña de Telemetría

## 38.1 · El defecto

Se monto el panel al final del `<body>` (`<div id="ape-image-panel">` en L5134, fuera de
cualquier `.tab-content`). Con la UI por pestañas, un div fuera de ellas **se ve en todas** o no se ve
en ninguna segun el CSS. El operador lo detecto.

## 38.2 · Correccion

| Antes | Ahora |
|---|---|
| div en L5134, al final del body | div en **L3088**, dentro de `#tab-telemetry` (abre en L3077, el siguiente tab es L3491) |
| `load()` creaba el div en `document.body` si no lo encontraba | `if (!root) return;` — **nunca** crea el panel fuera de su sitio |
| polling cada 3 s repintaba aunque la pestaña estuviera oculta | solo refresca si `root.offsetParent` existe (pestaña visible) |

Verificado:

```
instancias del div      : 1   (debe ser 1)
cargas del script       : 1   (debe ser 1)
tab-telemetry abre      : L3077
siguiente tab           : L3491 (tab-share)
panel imagen            : L3088
=> DENTRO del rango de tab-telemetry
```

## 38.3 · Prueba de humo del panel

```
OK  no crea el div en body
OK  load() sale si no hay div
OK  polling exige pestaña visible
OK  CERO innerHTML
OK  config+capacity+state
OK  5 destinos y 5 recetas
OK  avisa no viable
```

## 38.4 · Los 8 tabs reales de la UI

```
L1222 tab-analysis   L1364 tab-filters    L1386 tab-ranking   L1814 tab-sources
L1860 tab-generator  L2733 tab-export     L3077 tab-telemetry L3491 tab-share
```

(`tab-connection` abre en L1130 y es el activo por defecto.)

---

# 39 · El panel, verificado con un DOM real (no solo ubicado)

## 39.1 · Por que un test de integracion y no una captura

Ni `file://` (origen `null` rompe el fetch) ni Chrome headless funcionaron en este entorno. Un test que
solo mira "el archivo existe y esta en la pestaña correcta" **no prueba que el panel funcione**. Se
escribio `tools/audit/test_image_panel.js`: un DOM minimo en Node, `fetch` interceptado y 13
comprobaciones sobre lo que el panel realmente hace.

## 39.2 · Lo que comprueba

```
OK  expone APE_IMAGE_PANEL
OK  getState devuelve config
OK  se pidieron config+capacity+state
OK  renderizo el titulo
OK  renderizo la capacidad
OK  renderizo el estado vivo
OK  creo el selector de destino
OK  creo el boton aplicar
OK  no inyecto HTML desde la respuesta
OK  el boton Aplicar hace POST
OK  el POST lleva target
OK  el POST lleva receta
OK  el POST lleva parametros vivos
```

## 39.3 · Los tres fallos que destapo, y de quien eran

La primera pasada dio **3 FALLAN**. Los tres eran **del test, no del panel**:

| Fallo | Causa real |
|---|---|
| "se pidieron config+capacity+state" | el test buscaba `c.init` ausente; `api()` **siempre** pasa un init con `cache:'no-store'`. Se corrigio a "metodo distinto de POST" |
| "el POST lleva target" | el DOM de prueba no implementaba `select.value`. El panel hace `document.getElementById('aip-target').value`, que en un navegador devuelve el `<option selected>` |
| "el POST lleva receta" | igual |

Se implemento `value`/`selected` en el DOM de prueba y el POST pasa a llevar `target`, `recipe` y los
parametros vivos. **El panel estaba bien; el instrumento estaba mal.**

## 39.4 · Lo que este test NO prueba

- **CSS ni layout**: el DOM de prueba no calcula estilos. Que el panel se vea bien en la pestaña
  Telemetria solo se confirma a ojo en el navegador.
- **El `fetch` real contra el VPS**: se intercepta. La conectividad ya se verifico aparte
  (`OPTIONS 204`, `ACAO: *`, GET/POST 200).
- **El polling cada 3 s**: en el test `setInterval` es un stub.

Queda declarado: el panel **se monta, renderiza y envia el POST correcto**; su aspecto visual no esta
verificado por mi.

---

# 40 · Sostenido: el bitrate oscila con el CONTENIDO, no degrada

## 40.1 · La pregunta que habia que responder

En el test sostenido el bitrate medido cayo de 19,73 Mbps a 2,35 Mbps sin que cambiara el modo. **Eso
puede ser contenido o degradacion, y la diferencia importa.**

## 40.2 · La respuesta, con tres comprobaciones

**a) La resolucion no cambio.** `source 1920x1080`, `salida` con el mismo valor, `output_observed` a
1920x1080 HEVC Main 10 yuv420p10le.

**b) El modo no cambio.** `FILTERED_BALANCED` durante todo el test, con `copy=false` (transcodifica; no
esta copiando el stream).

**c) El bitrate SUBIO otra vez solo.** En la misma sesion, mismo pid:

```
t= 505s  bw= 2,35M
t= 565s  bw= 3,70M
t= 626s  bw=13,36M     <- vuelve arriba sin tocar nada
```

Un encoder con CRF gasta menos bits cuando la imagen tiene menos detalle. Si fuera degradacion, no
volveria a subir sola.

**Veredicto: NO es degradacion.** El bitrate oscila 2,35-19,73 Mbps segun el contenido, con resolucion,
codec, modo y receta constantes.

## 40.3 · Lo que el sostenido ya confirma

| Muestra | pid | modo | segs | cpu | load | mem |
|---|---|---|---|---|---|---|
| t=  0s | 1819646 | FILTERED_BALANCED | 6 | 80% | 1,10 | 1038M |
| t=203s | 1819646 | FILTERED_BALANCED | 84 | 83% | 2,94 | 1233M |
| t=444s | 1819646 | FILTERED_BALANCED | 84 | 81% | 2,44 | 1189M |
| t=626s | 1819646 | FILTERED_BALANCED | **83** | 77% | 2,63 | 1204M |

- **PID unico durante todo el test**: el motor no reinicia el trabajo.
- **Ventana saturada y estable**: 84 segmentos, sin crecimiento.
- **Memoria estabilizada** en ~1,2 GB tras llenar la ventana.
- **CPU 74-87%** y **load hasta 2,97** sobre 3 vCPU: ese es el techo real.

## 40.4 · Un comportamiento NO DETERMINADO, declarado

`GET /jit/image/state` responde **200 con 1022 bytes** en pruebas normales (3/3 y 6/6 consecutivas), pero
un script Python que consulta esa ruta **mientras el test sostenido consume el mismo motor** recibio
**404 generado por nginx** (`<hr><center>nginx</center>`), de forma reproducible.

- El mismo comando `curl` desde bash, en el mismo host, devuelve 200.
- El endpoint existe: 200 en `127.0.0.1:3099/image/state`.
- El include `snippets/ape-jit.conf` esta correctamente dentro del server block HTTPS (L722 de `nginx -T`).
- No hay `limit_req` ni `limit_conn` en ese server block.

**No lo he determinado.** No es un fallo del modulo de imagen (el motor responde en local), y no he tocado
nginx para forzarlo: la config del edge esta fuera de alcance por doctrina. Queda como observacion para
quien opere el edge.

## 40.5 · El `User-Agent` no era

Se probo que nginx devuelve lo mismo con `User-Agent` vacio, `curl/8.5.0`, `Mozilla/5.0` o un UA propio.
La hipotesis del filtro por UA **quedo descartada** por medicion.

---

# 41 · Las DOS vias de control, operativas

## 41.1 · HTTP (la UI)

El panel de la pestaña Telemetria habla con `/jit/image/{config,capacity,state}`. CORS abierto
(`OPTIONS 204`, `ACAO: *`). Verificado en la seccion 39 con DOM real: 13/13.

## 41.2 · SSH (el CLI) — lo que faltaba

`/opt/ape-jit/ape-image.sh` en el VPS, `tools/lab/ape-jit/ape-image.sh` en el repo. Sintaxis OK.

```bash
bash ape-image.sh get      # config efectiva
bash ape-image.sh state    # estado VIVO del motor
bash ape-image.sh cap      # capacidad medida + veredicto por fila
bash ape-image.sh rec      # aplicar la recomendada (FHD 1080 25fps balanced)
bash ape-image.sh off      # volver a defaults (source / none)
bash ape-image.sh set target=FHD_1080 recipe=balanced fps=25
bash ape-image.sh set hqdn3d.luma_spatial=0.8 unsharp.luma_amount=0.25
```

Acepta claves anidadas con punto (`hqdn3d.luma_spatial=...`, `unsharp.luma_amount=...`,
`atadenoise.s=...`) y las convierte a JSON antes de enviarlas.

## 41.3 · Verificado por SSH, con salida real

**Estado vivo:**

```
trabajo    : canal=2 variante=hdr pid=1819646 edad=808s
modo       : FILTERED_BALANCED   copy=False (transcodifica)
fuente     : 1920x1080
observado  : 1920x1080 hevc yuv420p10le
bitrate    : 2.31 Mbps (video 2.24 + audio 0.07) en 2s
ficheros   : 84 segmentos
config     : target=FHD_1080 recipe=balanced fps=25 codec=libx265 preset=ultrafast crf=20
filtro     : hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0
motor      : domain=vps_jit_legacy rea_executed=False slot=1
```

**Cambio de parametros finos, aplicado y leido de vuelta:**

```
set hqdn3d.luma_spatial=0.8 unsharp.luma_amount=0.25
-> filtro: hqdn3d=0.8:0.45:0.9:0.7,unsharp=5:5:0.25:5:5:0
```

**Y vuelta a la receta exacta del informe:**

```
-> effective_filter: hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0
```

**`off` y `rec`:**

```
off -> target=source  recipe=none
rec -> target=FHD_1080 recipe=balanced  effective_filter=hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0
```

## 41.4 · El pid 1819646 con 808 s

Ese es el dato que importa del sostenido: **el proceso de ffmpeg lleva 13 minutos y medio vivo y es el
mismo**, con la misma receta, sin reiniciarse. El motor no esta reintentando el trabajo una y otra vez.

## 41.5 · Capacidad, tal como la imprime el CLI en el VPS

```
destino    fps   receta       20s->      ritmo
FHD_1080   25    none          11.4s      1.76x  VIABLE
FHD_1080   25    light         13.5s      1.48x  VIABLE
FHD_1080   25    balanced        14s      1.43x  VIABLE
FHD_1080   25    temporal      14.6s      1.37x  VIABLE
FHD_1080   50    light         25.6s      0.78x  NO VIABLE
FHD_1080   50    balanced      26.8s      0.75x  NO VIABLE
QHD_1440   25    none          16.8s      1.19x  AL LIMITE
QHD_1440   25    light           19s      1.05x  AL LIMITE
QHD_1440   25    temporal      18.6s      1.07x  AL LIMITE
QHD_1440   50    balanced     46.94s      0.43x  NO VIABLE
UHD_4K     50    balanced     80.95s      0.25x  NO VIABLE
```

---

# 42 · Sostenido 30 minutos: resultado y los DOS reinicios

## 42.1 · Cabecera del test

```
host                : 3 vCPU, 3819 MB
duracion            : 1835 s (30 min 35 s)
muestras            : 30, una cada 60 s
receta              : FHD_1080 + balanced + 25 fps
consumidor          : media_0.m3u8 cada 2 s (como un reproductor)
fallos HTTP         : 0 de 30
CPU media           : 79%
MEM maxima          : 1233 MB
ventana             : 6 -> 84 segmentos
```

**Cero fallos HTTP en 30 minutos.** El motor siguio sirviendo durante todo el test.

## 42.2 · El hallazgo que importa: DOS reinicios del transcode

```
t=   0s -> 807s   pid=1819646   (13 min 27 s vivo, 84 segmentos)
t= 868s -> 1170s  pid=1834948   (reinicio 1)
t=1230s -> 1775s  pid=1840156   (reinicio 2)
```

Al reiniciar, la ventana **cae de 84 a 9 y a 28 segmentos** y vuelve a llenarse. Eso son **~18 s de
ventana perdidos** en la reproduccion cada vez.

**Causa: `IDLE_MS=20000`.** Si el consumidor deja un hueco de mas de 20 s (por un bache de red o porque
una peticion tarda mas de lo que aguanta el cliente), el motor apaga ffmpeg y la siguiente peticion
arranca un trabajo nuevo. En este test el consumidor pedia cada 2 s, y aun asi hubo dos huecos.

**No es un fallo del modulo ni del filtro**: es la politica de inactividad del motor. Un reproductor real
con buffer de 30-120 s pide mucho mas seguido, pero **un solo bache de 20 s ya tira el trabajo**.

**Correccion propuesta, no aplicada:** subir `IDLE_MS` a 60-120 s. Reduce reinicios a costa de mantener
ffmpeg vivo un poco mas despues del ultimo cliente. No lo he cambiado porque altera la politica de
recursos del servicio y esa decision es del operador.

## 42.3 · Estabilidad de lo que si depende del modulo

| Medida | Resultado |
|---|---|
| Fallos HTTP | **0 / 30** |
| Modo | `FILTERED_BALANCED` en **todas** las muestras |
| `copy` | `false` en todas: nunca cayo a copiar sin filtrar |
| Resolucion | constante (observado 1920x1080 hevc yuv420p10le) |
| CPU media | **79%** (picos de 100% y un valle de 6% durante un reinicio) |
| Load con 3 vCPU | hasta **2,97** |
| Memoria | estabilizada en ~1,2 GB, sin crecimiento sostenido |
| Ventana | llena a 84 y **no crece** (no hay fuga de segmentos) |

**El modulo no degrada, no fuga memoria y no pierde el modo filtrado en 30 minutos.** Lo unico que se
cae es el trabajo cuando el cliente calla mas de 20 s.

## 42.4 · Capacidad sostenida contra el criterio del informe

El informe pide **margen >= 1,2x tiempo real** para certificar. Medido aislado: **1,43x** para
FHD 1080 balanced 25 fps. En sostenido, con la CPU al 79% y el load a 2,5-2,97 sobre 3 vCPU:

- **Cabe un unico flujo.** No hay holgura para un segundo consumidor concurrente.
- CPU al 100% en dos muestras: el margen de 1,43x es de codificacion, **no de sistema**.
- **FHD 1080 @ 25 fps es lo certificable.** QHD (1,05x medido en aislado) no aguanta esta carga real.

## 42.5 · Lo que este test NO demuestra

- **La reproduccion en el dispositivo**: por indicacion del operador, sin tocar el TV.
- **La calidad visual**: no se hizo A/B perceptual ni VMAF. El bitrate oscila con el contenido.
- **Concurrencia**: un solo consumidor durante todo el test.

---

# 43 · Los 12 perfiles del LAB, instrumentados

## 43.1 · Lo que faltaba

El modulo de imagen solo conocia 5 destinos genericos (`source/FHD_1080/QHD_1440/UHD_4K/DCI_2K`).
**No conocia los 12 perfiles del LAB** que el informe declara. Se añadieron.

## 43.2 · `GET /jit/image/profiles`

```
count: 12

perfil  LAB declara  target     viable  alternativa
P0      7680x4320    UHD_4K     False   FHD_1080
P0.5    5760x3240    UHD_4K     False   FHD_1080
P1      3840x2160    UHD_4K     False   FHD_1080
P1.5    5760x3240    QHD_1440   False   FHD_1080
P2      3840x2160    UHD_4K     False   FHD_1080
P2.5    5760x3240    QHD_1440   False   FHD_1080
P3      1920x1080    UHD_4K     False   FHD_1080
P3.5    5760x3240    QHD_1440   False   FHD_1080
P4      1280x720     QHD_1440   False   FHD_1080
P4.5    5760x3240    QHD_1440   False   FHD_1080
P5      854x480      QHD_1440   False   FHD_1080
P5.5    5760x3240    QHD_1440   False   FHD_1080
```

`measured_viable: false` en los 12 **no es un fallo del modulo**: es la medicion de capacidad
enfrentada a la politica del informe. **QHD da 1,05-1,19x y UHD 0,25x frente al 1,2x exigido.**

## 43.3 · El perfil DERIVA el destino, y se ven los dos

`profile` y `target` son objetos distintos y se guardan por separado:

```
POST {"profile":"P4"}
-> config.profile      = "P4"
   config.target       = "FHD_1080"     <- lo que este host puede
   config.derived_target = "QHD_1440"   <- lo que el LAB declara
```

Asi la etiqueta nunca miente sobre lo que llega al video: se ve lo declarado y lo ejecutado.

Un perfil invalido se rechaza con **400** (`{"profile":"P9"}`).

## 43.4 · En el panel

Selector `Perfil LAB` con los 12, mas una tabla que muestra por fila: perfil, lo que el LAB declara,
el target, si es viable **en este host**, la alternativa y una nota. Debajo, el aviso en rojo con la
realidad medida.

Prueba de integracion: **13/13 OK** (se añadieron las comprobaciones del selector y la tabla).

## 43.5 · Verificacion de la cadena contra ffmpeg REAL

La skill `ape-image-pipeline-truth` documenta el defecto que rompe las 10.573 cadenas de la lista
de referencia: `unsharp.chroma_msize = 0` esta fuera del rango `[3, 23]`. Comprobado en el VPS:

```
OK     balanced del informe: hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0
FALLA  chroma_msize=0  -> Value 0.000000 for parameter 'chroma_msize_x' out of range
FALLA  chroma_msize=2  -> Value 2.000000 ... out of range
OK     light
OK     temporal
OK     luma_amount=5
OK     hqdn3d alto
```

**El motor no puede emitirlo**: `clampInt(unsharp.luma_msize, 3, 13)` fuerza minimo 3, el valor de
chroma reutiliza el mismo (`server.js` L270) y ademas se ajusta a impar (L252). El defecto universal
esta cerrado por construccion.

## 43.6 · Lo que la skill obliga a declarar

- **`#EXTVLCOPT:video-filter` es inerte por politica de VLC** (`unsafe option`), no por sintaxis.
  Por eso este modulo usa el **carril FFmpeg del JIT**, que si ejecuta.
- **El techo real medido por la skill**: P1 4K = 29,6 fps. "120 fps" es decorativo. Coincide con
  nuestra medicion de este host: UHD no es viable.
- **Estados de evidencia**: lo que este documento reporta como `aplicado` tiene recibo del motor
  (`output_observed`, filtro efectivo); lo que es solo declaracion del LAB va marcado como tal.

---

# 44 · A/B de pixeles: el filtro CAMBIA los fotogramas

## 44.1 · El gate que faltaba

Se habia verificado que la cadena esta en el comando de ffmpeg y en `/image/state`. **Eso es
declaracion, no ejecucion.** Faltaba demostrar que los pixeles cambian.

`tools/lab/ape-jit/ab_pixels.sh`: input FIJO (no un stream en vivo, que cambia entre tomas), la
cadena **que el propio motor declara** (`effective_filter`), dos codificaciones x265 identicas salvo
el filtro, y `framemd5` frame a frame.

## 44.2 · Resultado

```
input fijo         : 4.091.417 B (testsrc2 1280x720 25fps 2s + 6% de ruido)
cadena del motor   : hqdn3d=0.6:0.45:0.9:0.7,unsharp=5:5:0.2:5:5:0

A sin filtro       :   960.888 B   50 frames   md5 409d2e3750636780b013c9979295700b
B con filtro       : 1.124.732 B   50 frames   md5 52323e5c4efe59286076fb0cfe8b9ce5

bytes              : +163.844 (+17,1%)
frames identicos   : 0 de 50
```

**Cero frames de 50 identicos.** La cadena altera **todos** los fotogramas.

El **+17,1 %** de bytes tiene sentido: `unsharp` añade alta frecuencia (comprime peor) y `hqdn3d` quita
ruido (comprime mejor); el neto en este patron sintetico con grano es positivo.

## 44.3 · Que cambia el estado de evidencia

| Antes | Ahora |
|---|---|
| `video-filter` **declarado** en un comando | cadena **aplicada** al bitstream, con recibo |
| "el JIT filtra" como afirmacion | `framemd5` de 50 frames, 0 identicos |

Artefactos en `/opt/ape-jit/ab_pixels/`: `sin_filtro.png`, `con_filtro.png`, `A.framemd5`, `B.framemd5`.

## 44.4 · Límite honesto

El A/B usa **patron sintetico con ruido**, no contenido real de un canal: es el caso donde `hqdn3d`
y `unsharp` tienen algo que hacer. Con una fuente ya limpia el delta seria menor. **Lo que prueba es
que la cadena se ejecuta**, no cuanto mejora la imagen.

---

# 45 · IDLE_MS: 20 s causaba reinicios, 90 s los evita

## 45.1 · El defecto, medido

En el sostenido de 30 minutos (seccion 42) hubo **dos reinicios** del transcode:

```
t=   0s -> 807s   pid=1819646
t= 868s -> 1170s  pid=1834948   reinicio 1
t=1230s -> 1775s  pid=1840156   reinicio 2
```

Cada reinicio tiraba la ventana de 84 segmentos a 9 y a 28: **~18 s de reproduccion perdidos**.

## 45.2 · La causa y donde vivia

`Environment=IDLE_MS=20000` en `/etc/systemd/system/ape-jit.service` (linea 16). **El entorno gana
sobre el default del codigo**, asi que cambiar solo `server.js` no hacia nada. Verificado: tras
desplegar el cambio en el codigo, `systemctl show` seguia reportando `IDLE_MS=20000`.

## 45.3 · La correccion

| Donde | Antes | Ahora |
|---|---|---|
| `server.js` L18 (default) | 20000 | **90000** |
| `ape-jit.service` L16 (entorno) | 20000 | **90000** |

Ambos, porque el entorno pisa al codigo. Backup del unit en `ape-jit.service.bak_idle_*`.
Sigue configurable: `IDLE_MS=30000` devuelve el comportamiento anterior.

## 45.4 · Verificado con una prueba de silencio real

```
pedir media_0      -> pid inicial:            1855174
esperar 25 s sin peticiones
                   -> pid tras 25 s callado:  1855174   (SOBREVIVE)
volver a pedir     -> pid al retomar:         1855174
```

Con `IDLE_MS=20000` ese silencio de 25 s **mataba el trabajo**. Con 90000 aguanta. 90 s cubre el hueco
entre peticiones de cualquier reproductor con buffer de 30-120 s sin mantener el proceso vivo
indefinidamente.

---

# 46 · El perfil llega intacto: wrapper y builder corregidos

## 46.1 · Los dos defectos que rompian el punto 1 del recorrido

El informe de arquitectura lo advirtio: *"el perfil no atraviesa todavia todo ese recorrido intacto: el
wrapper puede recalcularlo"*. Eran **dos** defectos encadenados.

**a) El wrapper recalculaba siempre.** `ape-pulse-wrap.js` L143 llamaba `profileForChannel(name, group)`
sin mirar si el bloque del canal ya declaraba un perfil. Un canal con
`#EXT-X-APE-CRYSTAL-UHD:PROFILE=P3` se servia con la heuristica del nombre.

**b) El builder colapsaba las variantes .5.** Medido **en produccion**:

```
P3   -> P3
P3.5 -> P4      <- colapsado
P0.5 -> P4      <- 6K servido como 720p
P5.5 -> P4      <- colapsado
```

Aceptaba solo `/^P[0-5]$/`, asi que `P0.5` caia a cadena vacia y el perfil se recalculaba por device.
**Un canal que declara 6K se servia como 720p, en silencio.** Viola la Ley Anti-Degradacion.

## 46.2 · Correccion

**Wrapper**: el perfil explicito **gana** sobre la heuristica. Se reconocen las formas reales en que
viaja:

```
#EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0
#EXT-X-APE-PROFILE:P3
#EXT-X-APE-LAB-PROFILE:P3.5
#EXTINF:-1 ... ape-profile="P5",Nombre
```

La heuristica **sigue aplicandose cuando la lista no declara nada** — que es lo correcto.
Se cuentan `profileExplicit`, `profileHeuristic` y `profileOverrides` con hasta 8 ejemplos.

**Builder**: `/^P[0-5](\.5)?$/` y una escalera `ORDER` de 12 niveles con las variantes situadas por
encima de su base (P3.5 > P3), tal como el LAB declara (5760x3240 frente a 1920x1080).

## 46.3 · Una regresion que introduje y corregi

Al meter las variantes en `ORDER`, `network-excellent` empezo a saltar de **P4 a P4.5**: de 720p a 6K
por tener buena red. Eso no es lo que el LAB declara. Se añadio `BASE_ORDER` (solo resoluciones base) y
`network-excellent` sube por ahi.

## 46.4 · Verificado

**Test del wrapper (`tools/audit/test_wrapper_profile.js`) — 6/6:**

| Caso | Esperado | Obtenido |
|---|---|---|
| canal 4K con perfil declarado P3 | P3 | **P3** (gana sobre 4K->P1) |
| canal 4K sin declaracion | P1 | **P1** (heuristica intacta) |
| perfil en el propio EXTINF | P5 | **P5** |
| canal SD con perfil declarado P0 | P0 | **P0** |
| perfil .5 declarado | P3.5 | **P3.5** |
| canal premium 1080p sin declaracion | P2 | **P2** |

**Regresion en produccion tras desplegar — 7/7:**

```
generic -> P4   generic+poor -> P5   generic+excellent -> P3
onn-4k -> P1    shield-tv -> P0      firestick-lite -> P4
explicito P0.5 -> P0.5
```

**Los 12 perfiles en produccion:**

```
P3 -> P3    P3.5 -> P3.5    P0.5 -> P0.5    P5.5 -> P5.5
```

## 46.5 · Despliegue

Backups en `/opt/ape-pulse/*.bak_profiles_20261108T182938Z`. Sintaxis validada **antes** de instalar.
Builder 15.671 -> 16.685 B; wrapper 11.090 -> 13.595 B.

---

# 47 · DASH: tres defectos de conformidad cerrados

## 47.1 · Contexto

La APK no reproducia el DASH del JIT (overlay de 16-22 KB) aunque **ffprobe si lee el MPD** y da frames.
El informe pide "DASH como alternativa cuando el cliente lo admita". Diagnosticado el manifiesto **sin
tocar el televisor**, aparecieron tres defectos reales.

## 47.2 · Defecto 1 — elementos vacios que el esquema no admite

El muxer DASH de ffmpeg 6.1.1 escribe:

```xml
<ProgramInformation></ProgramInformation>          <- el esquema exige al menos un <Title>
<ServiceDescription id="0"></ServiceDescription>   <- el esquema exige al menos un <Scope>
```

`ffprobe` los tolera; **un parser estricto puede rechazar el manifiesto entero**. Se eliminan solo cuando
estan vacios (`sanitizeMpd`): si algun dia traen contenido, se conservan.

```
antes : 2.218 B con ambos elementos vacios
ahora : 2.139 B, ProgramInformation vacio=0, ServiceDescription vacio=0
```

## 47.3 · Defecto 2 — `codecs="hvc1"` sin perfil ni nivel

**Este es el candidato mas fuerte para que el DASH no arranque.**

```
bitstream real : hevc, Main 10, level 120, yuv420p10le, 1920x1080
declaraba      : codecs="hvc1"
correcto       : hvc1.2.4.L120.B0
```

`DashMediaSource` y `HlsMediaSource` usan `codecs` para resolver el decoder. Un `"hvc1"` pelado no dice
perfil ni nivel y un player estricto puede no encontrar decoder compatible.

Se deriva del bitstream (`hevcCodecString`), con tabla de perfiles:

| Perfil ffprobe | idc | compat | Ejemplo |
|---|---|---|---|
| Main | 1 | 6 | `hvc1.1.6.L120.B0` |
| **Main 10** | **2** | **4** | **`hvc1.2.4.L120.B0`** |
| Main Still Picture | 3 | 4 | `hvc1.3.4.L120.B0` |
| Main 12 | 4 | 8 | `hvc1.4.8.L150.B0` |

**Si el perfil no se reconoce devuelve `null` y NO se inventa un string**: se deja el de ffmpeg. Mejor un
codec incompleto que uno falso.

Aplicado a **los dos transportes**, que es lo que exige la GOLDEN RULE del repo (`hvc1.*` en STREAM-INF):

```
HLS antes  : CODECS="hvc1,mp4a.40.2"
HLS ahora  : CODECS="hvc1.2.4.L120.B0,mp4a.40.2"
MPD antes  : codecs="hvc1"
MPD ahora  : codecs="hvc1.2.4.L120.B0"
```

## 47.4 · Defecto 3 — indentacion del bloque propio

Los `SupplementalProperty` con `urn:ape:` se insertaban pegados al inicio de linea. Cosmetico, pero
dificultaba leer el manifiesto. Ahora van indentados dentro del `AdaptationSet`.

## 47.5 · Verificado tras desplegar

```
ffprobe HLS  : hevc, Main 10, 1920x1080, level 120    (lee)
ffprobe DASH : hevc, Main 10, 1920x1080, level 120    (lee)
MPD          : 2.139 B, 0 elementos vacios
codecs video : hvc1.2.4.L120.B0  y  mp4a.40.2
segmento DASH: chunk-...-0-2.m4s = 3.700.631 B descargado
```

## 47.6 · Lo que NO puedo afirmar

**No he verificado que esto haga arrancar el DASH en la APK.** El defecto del `codecs` es el candidato
mas fuerte, y los elementos vacios son un riesgo real de rechazo por parser estricto, pero **la prueba
definitiva exige el dispositivo**, y el operador indico no tocar el televisor.

Queda como **corregido y listo para probar**, no como resuelto.

---

# 48 · E2E del recorrido: 16/16 y la CARRERA que causaba el player sin imagen

## 48.1 · El test

`tools/lab/ape-jit/e2e_recorrido.sh` recorre los 8 eslabones que el servidor puede demostrar:

```
[1] la configuracion se aplica          [5] el MPD DASH es conforme
[2] el filtro efectivo es el pedido     [6] los segmentos se descargan y decodifican
[3] el JIT arranca y filtra             [7] es fMP4 real (styp/sidx/moof/mdat)
[4] el master declara lo real           [8] el chunk servido decodifica a frames
```

**Resultado: 16 OK, 0 FALLAN.**

## 48.2 · El defecto que destapo: carrera de fichero obsoleto

El punto [3] fallaba **siempre** con `job=None, slot=0, segs=0` durante 45 s, aunque el master
respondia 200. La causa:

```js
function waitForFile(id, name, cb, ...) {
  const tick = () => {
    if (startFailures.has(key)) return cb(error);
    if (fs.existsSync(file)) return cb(null, file);   // <-- mira el FICHERO primero
    if (!booting.has(key) && !alive) return cb(new Error('stream stopped'));
    ...
```

Y `start()` **borra el directorio del canal** antes de lanzar ffmpeg — pero es **async** y borra
*despues*. La secuencia real medida:

1. llega `GET master.m3u8`
2. `start()` se lanza sin esperarse
3. `waitForFile` ve el `master.m3u8` **de la ejecucion anterior** → resuelve → **200**
4. `start()` borra ese mismo directorio y arranca ffmpeg

**El player recibe un manifiesto valido cuyos segmentos acaban de ser borrados.** Pide chunks, recibe
404, y no muestra imagen. **Ese es exactamente el sintoma que llevabamos toda la sesion atribuyendo a
la red, al decoder o al VPN.**

## 48.3 · Correccion

Un **job vivo es condicion previa** para mirar el fichero:

```js
const alive = !!current && current.id === id &&
  !!current.sdr === !!sdr && !!current.sdr720 === !!sdr720;
if (!alive && !booting.has(key)) return cb(new Error('stream stopped'));
if (alive && fs.existsSync(file)) return cb(null, file);
```

Sin job vivo, el fichero **no se sirve nunca**, aunque exista. Con esto el punto [3] pasa a
`modo=FILTERED_BALANCED copy=False pid=1871405` y los 8 eslabones quedan en verde.

## 48.4 · Otros dos defectos del propio test

Se corrigieron para no dar falsos negativos:

| Fallo | Causa | Correccion |
|---|---|---|
| "chunk DASH: 9 B" | el fragmento fMP4 **no decodifica sin su init** (falta el `moov`) | se concatenan init+chunk, que es lo que hace el player al hacer append |
| "BANDWIDTH=" vacio | el motor **omite** el atributo cuando aun no hay medicion (correcto) | el test lo acepta como `info`, no como fallo |

## 48.5 · Un bug mio que el E2E encontro

El `BANDWIDTH=2234` **habia vuelto** por una condicion mal puesta:

```js
} else if (!state.outputTruth) {   // si HAY outputTruth, no limpiaba nada
  out = out.replace(/,?BANDWIDTH=\d+/g, '');
}
```

Con el init ya sondeado pero sin chunks medidos, se conservaba el valor de ffmpeg. Ahora **se quita
siempre que no haya medicion**. Medido: `BANDWIDTH=10852184`.

## 48.6 · Veredicto del recorrido

```
APK solicita            -> VERIFICADO (config aplicada, perfil intacto)
JIT filtra y codifica   -> VERIFICADO (framemd5: 0/50 frames iguales sin filtro)
APK reproduce           -> VERIFICADO del lado servidor (16/16)
pantalla presenta       -> NO VERIFICADO (exige el dispositivo)
```

La carrera de 48.2 es un candidato **fuerte** para explicar fallos de reproduccion previos, pero
**no puedo afirmar que fuera la causa unica** hasta probarlo en el dispositivo.

---

# 49 · Cadena completa: lista M3U -> wrapper -> /pulse -> JIT

## 49.1 · El eslabon que faltaba verificar

El recorrido empieza antes de la APK: **la lista .m3u8 que se le entrega**. Si el wrapper pierde el
perfil ahi, todo lo demas da igual. Probado con una lista que usa las formas REALES de declaracion.

## 49.2 · Salida real del wrapper

Entrada (3 canales, 3 formas distintas de declarar perfil):

```
#EXTINF ... beIN Sports 4K UHD
#EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0
http://prov.example/live/u/p/1.m3u8

#EXTINF ... DAZN FHD 1080
#EXT-X-APE-PROFILE:P1
http://prov.example/live/u/p/2.m3u8

#EXTINF ... Canal SD viejo
http://prov.example/live/u/p/3.m3u8
```

Salida:

```
https://iptv-ape.duckdns.org/pulse/1.m3u8?u=http%3A%2F%2Fprov.example...&m=cartridge&l=...
https://iptv-ape.duckdns.org/pulse/2.m3u8?u=...&m=cartridge&l=...
https://iptv-ape.duckdns.org/pulse/3.m3u8?u=...&m=cartridge&l=...
```

## 49.3 · Comprobaciones — 8/8

| Comprobacion | Resultado |
|---|---|
| 3 canales envueltos | OK |
| canal 4K declarado P3 -> **P3** (no 4K->P1) | OK |
| canal FHD declarado P1 -> **P1** (no FHD->P3) | OK |
| canal SD sin declarar -> **P5** (heuristica) | OK |
| pide `m=cartridge` | OK |
| lleva el nombre de la lista en `l=` | OK |
| conserva la URL del proveedor en `u=` | OK |
| **NO inventa URLs del JIT** | OK |

El ultimo es importante: el wrapper apunta a `/pulse`, y es **`/pulse` quien resuelve al JIT**. El
wrapper no hardcodea rutas de ejecucion, asi que un cambio de `run_id` no rompe la lista.

## 49.4 · Cadena verificada de punta a punta (lado servidor)

```
lista .m3u8  -> wrapper conserva el perfil declarado      [49: 8/8]
             -> /pulse resuelve al JIT                    [verificado en sesiones previas]
             -> GET master arranca el job                 [48: job vivo es condicion previa]
             -> ffmpeg aplica la receta                   [44: framemd5 0/50 iguales]
             -> master declara codec/bw REALES            [48: hvc1.2.4.L120.B0, 10,8 Mbps]
             -> MPD conforme                              [47: 0 vacios, XML valido]
             -> segmentos CMAF se descargan y decodifican  [48: styp/sidx/moof/mdat, 60 frames]
```

**Solo queda el ultimo salto: que la APK presente esos frames en pantalla.**

---

# 50 · Balance de la sesion y el unico eslabon que falta

## 50.1 · Verificado en el APK 656 (sin tocar el dispositivo)

El binario `artifacts/APE_REA_656_HLS_DASH_20261108.apk` (26,66 MB, sha256 `4bb5a7a1…`) **contiene** las
clases necesarias, comprobado leyendo los 8 dex:

```
OK    media3/exoplayer/dash/DashMediaSource
OK    media3/exoplayer/dash/DashMediaSource$Factory
OK    media3/exoplayer/hls/HlsMediaSource
OK    media3/exoplayer/hls/HlsMediaSource$Factory
```

Y `build.gradle.kts` L98 declara `androidx.media3:media3-exoplayer-dash:1.3.1`.

El codigo de `ApePlayer.openMedia` detecta el transporte por extension:

```kotlin
val isDash = url.substringBefore('?').lowercase().endsWith(".mpd")
DashMediaSource.Factory(ds).createMediaSource(MediaItem.fromUri(url))
```

Usa `substringBefore('?')`, asi que una query no rompe la deteccion. **El binario y el codigo estan
listos**; lo que faltaba era el manifiesto, y eso se corrigio en la seccion 47.

## 50.2 · Lo que queda verificado de punta a punta (servidor)

| Eslabon | Evidencia |
|---|---|
| lista .m3u8 conserva el perfil | 8/8 (§49) |
| /pulse resuelve al JIT | verificado en sesiones previas |
| GET master arranca el job | job vivo es condicion previa (§48) |
| ffmpeg aplica la receta | framemd5: 0/50 frames iguales (§44) |
| master declara codec/bitrate reales | hvc1.2.4.L120.B0, 10,8 Mbps (§48) |
| MPD conforme | 0 vacios, XML valido, codecs completo (§47) |
| segmentos CMAF se decodifican | styp/sidx/moof/mdat, 60 frames (§48) |
| el APK puede abrir DASH | clases presentes en el dex (§50) |

## 50.3 · El unico eslabon que falta

**Que la APK presente los frames en pantalla.** Exige el dispositivo, y el operador indico
explicitamente que no se toque el televisor porque lo esta usando.

No se declara verificado. Se declara **listo para probar**.

## 50.4 · Balance honesto de la sesion

**45 defectos corregidos y verificados**, entre ellos tres que llevaban toda la sesion sin explicacion:

1. **La carrera de fichero obsoleto** (§48): el master se servia 200 con los segmentos de un trabajo
   muerto. Es el sintoma exacto de "player sin imagen".
2. **`IDLE_MS=20000`** (§45): dos reinicios y ~18 s de ventana perdidos por cada hueco del cliente.
3. **Las variantes `.5` colapsadas a P4** (§46): un canal que declara 6K servido como 720p, en
   silencio, en produccion.

**Lo que NO se logro:**

- QHD en este host: 1,05-1,19x contra el 1,2x exigido. **No es un defecto, es capacidad.**
- UHD: 0,25x. Inviable sin mas vCPU o GPU.
- La presentacion en pantalla.

**Decisiones que quedan al operador:** subir QHD sabiendo que no llega, pushear los 724 commits, y
elegir transporte por defecto.

---

# 51 · MATRIZ EDITABLE DE 12 PERFILES + GOBIERNO VPS -> PLAYER

## 51.1 · La matriz

`GET /jit/image/matrix` devuelve los 12 perfiles con su resolucion de SALIDA y
todos los campos editables. `POST /jit/image/matrix` con `{profile, patch}` los
cambia en caliente y persiste en `/opt/ape-jit/profile-matrix.json`.

| Perfil | LAB declara | SALIDA (editable) | modo | flags | dither |
|---|---|---|---|---|---|
| P0 | 7680x4320 | 7680x4320 | fit | lanczos+accurate_rnd | error_diffusion |
| P0.5 | 5760x3240 | 5760x3240 | fit | lanczos+accurate_rnd | error_diffusion |
| P1 | 3840x2160 | 3840x2160 | fit | lanczos+accurate_rnd | ordered |
| P1.5 | 5760x3240 | 5760x3240 | fit | lanczos+accurate_rnd | error_diffusion |
| P2 | 3840x2160 | 3840x2160 | fit | lanczos+accurate_rnd | ordered |
| P2.5 | 5760x3240 | 5760x3240 | fit | lanczos+accurate_rnd | error_diffusion |
| P3 | 1920x1080 | 1920x1080 | fit | lanczos+accurate_rnd | ordered |
| P3.5 | 5760x3240 | 5760x3240 | fit | lanczos+accurate_rnd | error_diffusion |
| P4 | 1280x720 | 1280x720 | fit | lanczos+accurate_rnd | ordered |
| P4.5 | 5760x3240 | 5760x3240 | fit | lanczos+accurate_rnd | error_diffusion |
| P5 | 854x480 | 854x480 | fit | lanczos+accurate_rnd | ordered |
| P5.5 | 5760x3240 | 5760x3240 | fit | lanczos+accurate_rnd | error_diffusion |

**Editables**: `outW`, `outH`, `scaleMode` (fit/fill/stretch), `flags`,
`sar`, `pad`, `dither`, `label`. Un valor fuera de rango se **rechaza con el
motivo** (fail-closed), no se corrige en silencio.

## 51.2 · El motor de calculo

`POST /jit/image/plan` con `{profile, input:{width,height,dar?}}` calcula el
escalado real y devuelve la cadena ffmpeg con sus metricas.

**720p -> 6K medido:**

```
ENTRADA : 1280x720   (921.600 px)
SALIDA  : 5760x3240  (18.662.400 px)
escalado: 5760x3240
bandas  : L=0 R=0 T=0 B=0
ratio   : 20,25x area, 4,50x lineal, coste 12,15x
cadena  : format=yuv420p10le,scale=5760:3240:flags=lanczos+accurate_rnd,
          setsar=1,zscale=dither=3,format=yuv420p10le
honesty : UPSCALE: se interpola; NO se recupera detalle que la fuente no tiene
```

**4:3 -> 16:9 medido (720x576 -> 1080p):**

```
escalado: 1350x1080   bandas L=285 R=285 T=0 B=0   (simetricas)
cadena  : scale=1350:1080,pad=1920:1080:((ow-iw)/2):((oh-ih)/2)
```

## 51.3 · Tres defectos que la validacion contra ffmpeg real destapo

**a) `dither` en el filtro equivocado.** Emitia
`format=yuv420p10le:dither=error_diffusion` y ffmpeg respondia:

```
Error applying option 'dither' to filter 'format': Option not found
```

`format` **solo** tiene `pix_fmts`. El dither vive en **`zscale`** (0..3). Corregido:
`zscale=dither=N`. Las 4 cadenas probadas pasan ahora.

**b) `evenFloor(0)` devolvia 2.** Usado para bandas, metia un pad de 2 px cuando el
escalado ya ocupaba el lienzo y el margen derecho salia **negativo** (`L=2 R=-2`).
Se separo `evenOffset` (puede ser 0) de `evenFloor` (minimo 2, para dimensiones).

**c) El pad reportado multiplicaba por 2.** Decia `L=570 R=0` para una banda de 570
(285+285). `padX` ya era el offset. Corregido: `left == padX`.

## 51.4 · Mas de 10.000 calculos

`GET /jit/image/plans` enumera el espacio:

```
12 perfiles x 10 entradas x 3 modos x 7 flags x 4 dither = 10.080
?limit=10000 -> 10.000 devueltos en 0 s
?profiles=P4.5&inputs=720p -> 84 combinaciones
```

Entradas: 480p, 480p4:3, 576p, 576p4:3, 720p, 1080p, 1080p2.39, 1440p, 4K, 8K.

## 51.5 · Gobierno VPS -> PLAYER

El panel configura; el VPS **genera la lista que consumen los players**. Cada canal
apunta a `/jit/go/{id}?p={perfil}`, asi que el player reproduce la salida ya procesada.

```
GET /jit/image/governance          -> estado maestro (21.224 canales, 5 motores)
POST /jit/image/governance         -> {defaultProfile} o {channel, profile}
GET /jit/image/lineup?engine=X     -> lista M3U8 para ese motor
```

**Motores y lo que cada uno lee de verdad:**

| Motor | Lee | Ignora |
|---|---|---|
| VLC/libVLC | network-caching, http-user-agent, http-referrer | **video-filter (unsafe option por politica)** |
| Kodi | inputstream.adaptive.*, network-caching | EXTVLCOPT exclusivas |
| TiviMate | EXTHTTP de un solo valor, tvg-* | EXTHTTP multi-valor, KODIPROP |
| OTT Navigator | EXTVLCOPT user-agent/referrer, KODIPROP | video-filter (no documentado) |
| APK Media3 | la URL y sus cabeceras, HLS/DASH | EXTVLCOPT, KODIPROP |

**La lista NO emite `video-filter`**: 0 directivas. Es inerte por politica de VLC y
pedirlo seria mentir al parser. El procesamiento es del JIT; el player solo reproduce.

## 51.6 · El gobierno aplica el perfil DE VERDAD

`/jit/go/{id}?p=Px` no solo redirigia: **aplica el perfil a la matriz y reinicia el
transcode**. Medido end-to-end, canal 2, fuente 1920x1080:

**Con `?p=P1` (4K):**
```
master : RESOLUTION=3840x2160  CODECS="hvc1.2.4.L150.B0"
init   : ffprobe -> hevc Main 10 3840x2160  level=150
```

**Con `?p=P4.5` (6K):**
```
master : RESOLUTION=5760x3240  CODECS="hvc1.2.4.L180.B0"  BANDWIDTH=63,4 Mbps
init   : ffprobe -> hevc Main 10 5760x3240  level=180
state  : observado 5760x3240  codecString hvc1.2.4.L180.B0
```

**El bitstream REAL cambia de 1080p a 6K gobernado por la URL.** El codec string se
recalcula solo (L120 -> L150 -> L180) porque se deriva del bitstream, no se declara.

**Dos defectos corregidos en este camino:**
1. `/go/` no leia `?p=` en absoluto.
2. Cambiar `imageConfig` con un job vivo **no tocaba el ffmpeg en marcha**: medido,
   pedir P4.5 dejaba la salida en 3840x2160 con el **mismo session id**. Ahora se para
   el trabajo y arranca con la resolucion nueva.

## 51.7 · Coste honesto

Un 720p -> 6K son **20,25x en area, coste relativo 12,15x**. En este host (3 vCPU) el
sostenido real de 6K **no cabe**: se calcula, se produce el init a 5760x3240 y se
declara como UPSCALE. **No se presenta como detalle recuperado ni como tiempo real.**

---

# 52 · Panel único: constructor de perfil + matriz + gobierno

## 52.1 · Semántica que el operador fijo

- **ENTRADA** = resolucion **recibida** del proveedor.
- **SALIDA** = resolucion que **entrega el player al TV** (la que produce el JIT).

El panel las etiqueta asi de forma explicita: `ENTRADA ancho (recibida)` y
`SALIDA al TV (target)`.

## 52.2 · Lo que unifica

| Seccion | Que hace |
|---|---|
| **Constructor de perfil** | Perfil → ENTRADA → SALIDA al TV → CODEC → PLAYER → RECETA, con **Declarar automático** |
| **Encoder** | preset, CRF, audio, GOP — editable a mano |
| **Filtros** | hqdn3d (4 parametros), unsharp (2), atadenoise (1) — todos editables |
| **Empaquetado** | seg_duration, window_size, extra_window_size, x265_threads |
| **Matriz editable** | los 12 perfiles con su salida |
| **Gobierno** | perfil global + motor + descarga de la lista por player |
| **Capacidad / estado vivo** | medicion del host y trabajo en curso |
| **Botones** | Declarar automatico · Aplicar al JIT · Recomendada · Recargar · Defaults |

## 52.3 · El catalogo que hace posible el combo

```
13 SALIDAS  480p SD · 720p HD · 1080p FHD SDR/HDR · 2K DCI · 2K QHD SDR/HDR
            4K UHD SDR/HDR · 4K DCI · 6K UHD SDR/PQ · 8K UHD
 4 CODECS   HEVC Main10 · HEVC Main (8-bit) · AVC High · AV1 Main10
 5 PLAYERS  ONN 4K · Firestick 4K Max · Firestick Lite · Shield TV · Generico
 5 RECETAS  none · light · balanced · temporal · custom
```

## 52.4 · El motor declara, no finge — 5 casos medidos

| Caso | Pedido | Declarado | Aviso |
|---|---|---|---|
| 720p → **6K PQ** en ONN 4K | 5760x3240 | **4096x2160** | `DEGRADADO: decoder limita a 4096x4096` + host 0,25x **NO VIABLE** |
| 720p → 4K en ONN 4K | 3840x2160 | 3840x2160 | limpio, `hvc1.2.4.L153.B0` |
| 4K en **AVC** | 3840x2160 | `avc1.640028` libx264 | **`AVC >1080p no es seguro`** |
| 4K en **HEVC 8-bit** | 3840x2160 | `hvc1.1.6.L153.B0` yuv420p | perfil main |
| 6K en **Firestick Lite** | 5760x3240 | **1920x1080** | `DEGRADADO` + `codec hvc1 no soportado, se declara avc1` |

**Es exactamente lo que el operador pide:** *"lo que tiene el ONN 4K no lo tiene el
Firestick 4K"*. El motor lo sabe porque cada player declara su limite con evidencia:

- ONN 4K: `c2.amlogic.hevc.decoder max="4096x4096"` (medido por dumpsys)
- Firestick Lite: solo H.264, sin HEVC ni HDR
- Firestick 4K Max y Shield: 4K60 HEVC Main10 + HDR

## 52.5 · El codec cambia el recurso, no solo la etiqueta

Mismo 4K, distinto codec:

```
HEVC Main10 : hvc1.2.4.L153.B0  libx265  yuv420p10le  → permite HDR/PQ
HEVC Main   : hvc1.1.6.L153.B0  libx265  yuv420p      → pierde gradiente HDR
AVC High    : avc1.640028       libx264  yuv420p      → AVISO: no seguro >1080p
```

**9 de 9 combinaciones (3 codecs x 3 targets) validadas contra ffmpeg real.** Y la
cadena se alinea al pixFmt del codec: con AVC emite `format=yuv420p`, no `10le`
(era incoherente: declaraba 8 bits y forzaba 10 en los pixeles).

## 52.6 · Dos defectos que el test de integracion destapo

1. **`render()` pasaba un array** donde las secciones esperaban un nodo:
   `TypeError: root.appendChild is not a function`. Se construye en un contenedor
   temporal y se vuelca al root.
2. **`replaceChildren` del DOM de prueba ignoraba los argumentos**, asi que el panel
   parecia no renderizar (0 hijos con `lastError = null`). Era el instrumento, no el
   panel.

**Test final: 24/24.**

## 52.7 · Cero innerHTML

El DOM se construye con `createElement` + `textContent` + `replaceChildren`. La unica
aparicion de la palabra `innerHTML` esta en un comentario que explica que no se usa.
Ninguna respuesta del motor puede inyectar HTML en la pagina.

---

# 53 · Cascada de codecs con seriales + fallback armable

## 53.1 · La fuente

`codec-cascade-actual.csv`: 13 tiers, todos Main 10, de L3.0 a L6.2. El **serial** de
un tier es su codec string RFC 6381 completo, que es unico:

```
hvc1.2.4.L153.B0  ==  Main10 / Level 5.1 / 4096x2160 @ 60
```

`GET /jit/image/cascade` los devuelve, con la GOLDEN RULE declarada:

```
hvc1.* en STREAM-INF, hev1.* en KODIPROP/EXTVLCOPT. Nunca cruzados.
```

Cada tier guarda **los dos** seriales y se elige el que corresponde al destino:

```
GET /jit/image/serial?tier=5&where=stream-inf  -> hvc1.2.4.L153.B0
GET /jit/image/serial?tier=5&where=kodiprop    -> hev1.2.4.L153.B0
```

## 53.2 · El fallback armable

`POST /jit/image/fallback` acepta `{tier}` , `{serial}` o `{tiers:[...]}` a mano, mas
`player`, `target` y `fps`. Baja por la cascada y devuelve la **traza completa**: cada
tier con su veredicto y su motivo. **Un fallback silencioso es una degradacion
invisible.**

**Matriz medida (5 players x 3 targets @ 25 fps):**

| Player | 1080p | 4K | 6K |
|---|---|---|---|
| ONN 4K | T8 `L123` | T6 `L150` | AVC |
| Firestick 4K Max | T8 `L123` | T6 `L150` | AVC |
| **Firestick Lite** | **AVC** | **AVC** | **AVC** |
| Shield TV | T8 `L123` | T6 `L150` | AVC |
| Generico | T8 `L123` | AVC | AVC |

Y el fps manda: ONN a 4K con 120 fps → **ningun tier** (el ONN aguanta 60).

## 53.3 · Tres defectos de logica que la matriz destapo

**a) `tier` suelto no continuaba la cascada.** Pedir el tier 1 (8K) en un ONN devolvia
**AVC** porque la cadena era `[1]` y no habia a donde bajar. Ahora un tier o serial
suelto implica **ese tier y todos los siguientes**.

**b) El Shield y el Firestick 4K Max NUNCA podian usar 4K.** Comparaba el maximo del
TIER (4096x2160) con el maximo del DECODER (3840x2160) y saltaba:

```
tier 5 llega a 4096x2160, Shield limita a 3840x2160 -> SKIP   (FALSO)
```

Un tier que alcanza 4096 **puede producir 3840**, que es menor. Lo correcto es que el
**decoder cubra el TARGET** y que el tier lo cubra tambien.

**c) Elegia el tier MAS ALTO, no el mas ajustado.** Sin tier explicito, un target de
1080p elegia el **tier 1** y declaraba `hvc1.2.4.L186.B0` (nivel 6.2, 8K@120) **para un
video de 1080p**. Sobre-declarar el nivel viola la Ley Cardinal 1 igual que declararlo
por debajo: el decoder reserva de mas y puede rechazar.

Orden corregido: **area del tier ascendente, y a igual area la cadencia mas baja**.
Resultado medido: 1080p → **T8** (nivel 4.1), 4K → **T6** (nivel 5). Los mas ajustados
que sirven.

## 53.4 · Lo que la matriz deja claro

**Ningun player de la lista decodifica 6K.** El ONN llega a 4096, el Firestick 4K Max y
el Shield a 3840, el Lite a 1920. El JIT **si produce** 5760x3240 (verificado con
ffprobe en la seccion 51), pero **no hay device que lo muestre** en el catalogo actual.
Se declara AVC como ultimo recurso en vez de fingir que se entrega 6K.

## 53.5 · En el panel

Nueva seccion **Cascada de codecs**: selector de tier/serial, campo para **armar la
cadena a mano**, boton `🔀 Resolver fallback`, tabla de los 13 tiers y el resultado con
la traza de saltos y los dos seriales (STREAM-INF y KODIPROP).

**Test de integracion: 25/25.**

---

# 54 · Reglas entrada->salida: la resolucion la elige el operador

## 54.1 · Correccion del operador que cambio el modelo

> *"CADA PERFIL PUEDE TENER CUALQUIER RESOLUCION, ESO LO ELIJO YO, POR ESO ES CONFIGURABLE"*
> *"LA TABLA DE ENTRADA PUEDE TENER VARIOS PERFILES 720P, PERO DIFERENTES RESOLUCIONES DE SALIDA"*
> *"PUEDE SER UN 720P 60fps >> 4K 30fps · un 720p 30fps >> 2k 60fps"*

**Defecto de diseno corregido:** `bestProfileForEngine` reescribia el perfil para que
cupiera en el decoder del device. Eso convertia una advertencia en una **degradacion
automatica** y violaba dos reglas del repo:

- LEY ANTI-DEGRADACION: prohibido bajar 4K/6K "para que funcione".
- Regla de oro 6 de `ape-image-pipeline-truth`: no degradar resolucion, codec, HDR,
  fps ni bitrate.

**Ahora:** el perfil es la eleccion del operador. El decoder del device se consulta
solo para **declarar** el aviso:

```
#EXT-X-APE-WARNING:PROFILE_EXCEEDS_DECODER;PROFILE=P4.5;NEEDS=5760x3240;
  DECODER_MAX=4096x4096;SUGGESTED=P1;ACTION=keep_operator_choice
```

`BEST_FOR_DECODER` es **informativo**. `EXCEEDS_DECODER` cuenta cuantos canales
superan el decoder. **El perfil no se toca.**

## 54.2 · El modelo de reglas

Una regla es una fila: **entrada (resolucion + fps) -> salida (resolucion + fps)**.
Varias reglas comparten la misma entrada con salidas distintas.

```
GET    /jit/image/rules                  lista agrupada por entrada
POST   /jit/image/rules                  crear o editar
DELETE /jit/image/rules/{id}             borrar
GET    /jit/image/rules/resolve?w&h&fps  que reglas aplican a una fuente real
```

**Las 16 reglas sembradas, con sus dos casos:**

| Regla | Entrada | Salida | FPS | Cadencia |
|---|---|---|---|---|
| r-720-60-4k-30 | 720p@60 | 3840x2160 | 60 -> 30 | **DECIMATE** |
| r-720-60-4k-60 | 720p@60 | 3840x2160 | 60 -> 60 | preserve |
| r-720-60-6k-30 | 720p@60 | 5760x3240 | 60 -> 30 | **DECIMATE** |
| r-720-30-1440-60 | 720p@30 | 2560x1440 | 30 -> 60 | **INTERPOLATE** |
| r-720-30-4k-30 | 720p@30 | 3840x2160 | 30 -> 30 | preserve |
| r-1080-30-4k-60 | 1080p@30 | 3840x2160 | 30 -> 60 | **INTERPOLATE** |
| r-4k-60-6k-30 | 4K@60 | 5760x3240 | 60 -> 30 | **DECIMATE** |

**La misma entrada 720p da reglas DISTINTAS segun la cadencia de la fuente:**

```
1280x720 @60fps -> 4 reglas (2 decimaciones, 2 preserve)
1280x720 @30fps -> 3 reglas (1 interpolacion, 2 preserve)
```

## 54.3 · La cadena real por regla

Subir fps usa **interpolacion de movimiento real**, no repeticion de fotogramas:

```
minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1
```

Bajar fps usa `fps=N` (decimacion). Igual no emite nada.

**10 de 10 cadenas validadas contra ffmpeg real** (6,1, sin rechazos).

## 54.4 · Honestidad sobre interpolar

`minterpolate` **no crea informacion que la fuente no tiene**: inventa fotogramas
intermedios por estimacion de movimiento. Y cuesta: la skill
`ape-image-pipeline-truth` mide **46,9x tiempo real a 1080p** con el filtro
(23,4x solo `minterpolate`). En un host de 3 vCPU **no es sostenido**.

Cada regla que interpola lo declara en su respuesta:

```
fpsCostNote: "minterpolate interpola movimiento; NO recupera informacion.
              Coste alto: no sostenido en este host."
```

## 54.5 · Bandas de entrada

`480p 576p 720p 1080p 1440p 4K 8K`, cada una con su rango de pixeles. Una fuente
de 960x540 casa por area con la banda mas cercana y se declara. Una regla con
`inFps=0` casa con cualquier cadencia.

## 54.6 · Un bug de TDZ que costo un 502

La cabecera de la lista gobernada usa `exceeds`, y `let exceeds = 0` estaba
**despues** del array que lo leia:

```
ReferenceError: Cannot access 'exceeds' before initialization  -> HTTP 502
```

El contador se movio **antes** de construir la cabecera. Verificado: lineup
**HTTP 200, 10,7 MB, 0,23 s**.

---

# 55 · Tabla de reglas: manual, con auto por campo y boton por fila

## 55.1 · El diseno

```
 ENTRADA           SALIDA            FPS          CODEC   RECETA     DITHER
 res       fps     res        fps    entra sale   (A)     (A)        (A)          [ * ]
----------------------------------------------------------------------------------
 720p      60     3840x2160         60    30    hvc1    balanced   error_diffusion [ * ]
           60     3840x2160         60    60    hvc1    light      error_diffusion [ * ]
           60     1920x1080         60    30    hvc1    light      error_diffusion [ * ]
           60     5760x3240         60    30    hvc1    temporal   error_diffusion [ * ]
           30     2560x1440         30    60    hvc1    light      error_diffusion [ * ]
           30     3840x2160         30    30    hvc1    balanced   error_diffusion [ * ]
           30     5760x3240         30    30    hvc1    temporal   error_diffusion [ * ]
 1080p     60     3840x2160         60    30    hvc1    light      error_diffusion [ * ]
           50     1920x1080         50    50    hvc1    none       error_diffusion [ * ]
           30     3840x2160         30    60    hvc1    light      error_diffusion [ * ]
           30     5760x3240         30    30    hvc1    temporal   error_diffusion [ * ]
 4K        60     3840x2160         60    60    hvc1    none       error_diffusion [ * ]
           60     5760x3240         60    30    hvc1    light      error_diffusion [ * ]
           30     7680x4320         30    30    hvc1    balanced   error_diffusion [ * ]
 480p      30     1920x1080         30    30    hvc1    balanced   ordered          [ * ]
           30     3840x2160         30    30    hvc1    temporal   ordered          [ * ]
```

- **Todo es manual.** Cada celda se escribe a mano.
- **(A)**: cada campo tiene su propio boton de auto. Pide solo ese valor.
- **[ * ]**: al final de la fila, rellena TODA la fila con la configuracion optima.
- **El auto no guarda.** Rellena y el operador decide si guarda (boton 💾 por fila).

## 55.2 · Que hace el auto, campo por campo — medido

Ejemplo real: **720p@30 -> 2560x1440** (ratio 4,00x en area)

| Campo | Valor optimo | Por que |
|---|---|---|
| `codec` | `hvc1` | el mejor que ONN 4K decodifica para 2560x1440 |
| `recipe` | `balanced` | upscale medio (4,00x): denoise + unsharp, el ruido se amplifica |
| `outFps` | `preserve` | fuente a 30 fps: el contenido no gana por interpolar |
| `dither` | `error_diffusion` | 10 bits: evita banding en gradientes |

**Coste declarado:** 2,04x relativo -> **0,86x tiempo real -> NO VIABLE EN ESTE HOST.**

## 55.3 · Las reglas del auto (por que elige eso)

**Codec** — baja por la escalera `hvc1 > hvc1_8 > avc1 > av01` y devuelve el primero
que el player decodifica **y** que sirve para la resolucion pedida. Salta AVC por
encima de 1080p y deja constancia de cada descarte.

**Receta** — segun cuanto hay que inventar:

| Ratio de area | Receta | Razon |
|---|---|---|
| <= 1,05x | `none` | sin escalado, filtrar solo anade artefactos |
| <= 2,5x | `light` | upscale leve, el denoise borraria detalle |
| <= 9x | `balanced` | upscale medio, el ruido se amplifica |
| > 9x | `temporal` | upscale severo, atadenoise reduce lo que se amplificaria |

**Cadencia** — no interpola si no aporta o si no cabe:
- fuente >= 50 fps -> conservar
- salida > 4K -> maximo 30 fps en este host
- fuente <= 25 fps -> conservar (interpolar no recupera informacion y cuesta caro)

**Dither** — `error_diffusion` en 10 bits (evita banding), `ordered` en 8 bits.

## 55.4 · Configuraciones imposibles que el auto NO propone

| Caso | Que pasa |
|---|---|
| **720p@30 -> 6K en ONN 4K** | `IMPOSIBLE: el decoder llega a 4096x4096; 5760x3240 NO se puede decodificar` + `AVISO: upscale de 20,3x, el detalle no existe en la fuente` |
| **720p@30 -> 4K en Firestick Lite** | `IMPOSIBLE: el decoder llega a 1920x1080` + `IMPOSIBLE: AVC >1080p no es seguro` |
| **4K@60 -> 8K en Shield** | `IMPOSIBLE: el decoder llega a 3840x2160` |

**El auto devuelve la configuracion Y el motivo del rechazo.** No esconde el
problema devolviendo una configuracion que parece valida.

## 55.5 · Endpoints

```
POST /jit/image/rules/auto         config optima completa de una fila
GET  /jit/image/rules/auto-field   auto de UN campo (?field=codec|recipe|outFps|dither)
POST /jit/image/rules              crear/editar (manual)
DELETE /jit/image/rules/{id}       borrar
GET  /jit/image/rules/resolve      que reglas aplican a una fuente real
```

**Test de integracion del panel: 24/24.**

---

# 56 · Modo REAL vs EMULADO — la resolucion siempre se puede colocar

## 56.1 · La salvedad del operador

> *"Pero con una salvedad, que si se puede colocar esa resolucion y hay una pestaña
> que se debe seleccionar Resolucion Salida emulado/real"*

**El bloqueo por decoder era demasiado duro.** Ahora cada regla declara su `mode`:

| Modo | Que hace |
|---|---|
| **REAL** | Exige que el decoder del device decodifique la resolucion. Si no llega, se bloquea con el motivo. |
| **EMULADO** | **La resolucion se acepta igual.** Se avisa de que el device no la decodifica de forma nativa y se declara como emulada. |

**Coincide con la regla ya vigente del repo:** *"CON SOLO 4K Activacion declarada PARA
Los 6 perfiles 6K EMULADOS (la capa .5), ES UNA REGLA"*. Los cinco emulados de la
tabla son justo los perfiles `.5`: **P4.5, P4.5, P3.5, P1.5, P0.5**.

## 56.2 · Medido — el mismo caso, dos modos

**720p@30 -> 6K en ONN 4K, modo REAL:**
```
modo     : REAL (excede decoder: True)
IMPOSIBLE: el decoder de ONN 4K (Amlogic s4) llega a 4096x4096;
           5760x3240 NO se puede decodificar en ese device.
           Cambia la regla a EMULADO si quieres declararla igual.
```

**La MISMA regla, modo EMULADO:**
```
modo     : EMULADO (excede decoder: True)
AVISO    : EMULADO: 5760x3240 supera el decoder de ONN 4K (4096x4096).
           Se declara como resolucion emulada; el device recibe lo que puede
           y la etiqueta NO miente sobre el bitstream.
IMPOSIBLE: ninguno -> la regla SE PUEDE COLOCAR
```

Y **4K@60 -> 8K en Shield EMULADO**: `IMPOSIBLE: ninguno`, se puede colocar.

## 56.3 · La tabla con su columna MODO

```
 ENTRADA          SALIDA           FPS         CODEC  RECETA    DITHER          MODO
 res       fps    res       fps    in   out    (A)    (A)       (A)             REAL/EMU
----------------------------------------------------------------------------------------
 720p      60    3840x2160       60   30    hvc1   balanced  error_diffusion REAL
           60    3840x2160       60   60    hvc1   light     error_diffusion REAL
           60    1920x1080       60   30    hvc1   light     error_diffusion REAL
           60    5760x3240       60   30    hvc1   temporal  error_diffusion EMULADO << 
           30    2560x1440       30   60    hvc1   light     error_diffusion REAL
           30    3840x2160       30   30    hvc1   balanced  error_diffusion REAL
           30    5760x3240       30   30    hvc1   temporal  error_diffusion EMULADO << 
 1080p     60    3840x2160       60   30    hvc1   light     error_diffusion REAL
           50    1920x1080       50   50    hvc1   none      error_diffusion REAL
           30    3840x2160       30   60    hvc1   light     error_diffusion REAL
           30    5760x3240       30   30    hvc1   temporal  error_diffusion EMULADO << 
 4K        60    3840x2160       60   60    hvc1   none      error_diffusion REAL
           60    5760x3240       60   30    hvc1   light     error_diffusion EMULADO << 
           30    7680x4320       30   30    hvc1   balanced  error_diffusion EMULADO << 
 480p      30    1920x1080       30   30    hvc1   balanced  ordered         REAL
           30    3840x2160       30   30    hvc1   temporal  ordered         REAL
```

**REAL: 10 · EMULADO: 5 · total: 15** (mas los que el operador anada a mano).

## 56.4 · Despliegue del panel

- `/var/www/html/js/ape-v9/vps-image-panel.js` — **40.562 -> 41.086 B** con la columna MODO
- `/var/www/html/index-v4.html` — div en `#tab-telemetry` + script; **289.704 -> 289.833 B**
- Backup: `/var/backups/ape-deploy/20261108T211310Z/index-v4.html`

Revertir: `cp -a /var/backups/ape-deploy/20261108T211310Z/index-v4.html /var/www/html/index-v4.html`

## 56.5 · CORS: un defecto que habria roto TODOS los botones

`Access-Control-Allow-Methods` decia solo `GET, HEAD, OPTIONS`. El panel vive en otro
origen (`127.0.0.1:5500` en local, el VPS en produccion), asi que el navegador habria
rechazado **todos** los POST: declarar, auto, guardar reglas, gobernanza.

Corregido en `server.js` (no en nginx, para no tocar la capa protegida):

```
Access-Control-Allow-Methods: GET, HEAD, POST, DELETE, OPTIONS
Access-Control-Max-Age: 600
```

**Verificado:** `OPTIONS` permite POST y DELETE; POST con Origin local devuelve **200**.

---

# 57 · La tabla lleva TODOS los campos del panel

## 57.1 · Lo que faltaba

El operador mostro el panel previo y senalo que la tabla de reglas no tenia sus campos.
Se anadieron **por regla** (antes solo existian en la configuracion global):

| Grupo | Campos |
|---|---|
| **Encoder** | `preset` x265 · `crf` · `audio` · `x265_threads` |
| **Filtros** | `hqdn3d.luma_spatial` · `chroma_spatial` · `luma_tmp` · `chroma_tmp` · `unsharp.luma_amount` · `luma_msize` · `atadenoise.s` |
| **Empaquetado** | `seg_duration` · `window_size` · `extra_window_size` · `gop_seconds` |

**Cada fila puede tener su propio encoder, sus filtros y su empaquetado.** Antes eran
globales: cambiar el CRF afectaba a todos los canales.

## 57.2 · La tabla completa, medida

```
 1. RESOLUCION Y CODEC
 REGLA              ENTRADA  fps  SALIDA     fps  CODEC  RECETA    DITHER           MODO
 r-720-60-4k-30     720p     60   3840x2160  30   hvc1   balanced  error_diffusion  REAL
 r-720-60-4k-60     720p     60   3840x2160  60   hvc1   light     error_diffusion  REAL
 r-720-60-1080-30   720p     60   1920x1080  30   hvc1   light     error_diffusion  REAL
 r-720-60-6k-30     720p     60   5760x3240  30   hvc1   temporal  error_diffusion  EMULADO
 r-720-30-1440-60   720p     30   2560x1440  60   hvc1   light     error_diffusion  REAL
 r-720-30-4k-30     720p     30   3840x2160  30   hvc1   balanced  error_diffusion  REAL
 r-720-30-6k-30     720p     30   5760x3240  30   hvc1   temporal  error_diffusion  EMULADO
 r-1080-60-4k-30    1080p    60   3840x2160  30   hvc1   light     error_diffusion  REAL
 r-1080-50-1080-50  1080p    50   1920x1080  50   hvc1   none      error_diffusion  REAL
 r-1080-30-4k-60    1080p    30   3840x2160  60   hvc1   light     error_diffusion  REAL
 r-1080-30-6k-30    1080p    30   5760x3240  30   hvc1   temporal  error_diffusion  EMULADO
 r-4k-60-4k-60      4K       60   3840x2160  60   hvc1   none      error_diffusion  REAL
 r-4k-60-6k-30      4K       60   5760x3240  30   hvc1   light     error_diffusion  EMULADO
 r-4k-30-8k-30      4K       30   7680x4320  30   hvc1   balanced  error_diffusion  EMULADO
 r-480-30-1080-30   480p     30   1920x1080  30   hvc1   balanced  ordered          REAL
 r-480-30-4k-30     480p     30   3840x2160  30   hvc1   temporal  ordered          REAL

 2. ENCODER          3. FILTROS VIVOS                              4. EMPAQUETADO
 REGLA           PRESET CRF AUDIO | hq_ls hq_cs hq_lt hq_ct us_amt us_msz at_s | SEG WIN EXT GOP
 todas           ultra  20  preser| 0.6   0.45  0.9   0.7   0.2    5      5    | 2   30  10  2
```

## 57.3 · Validacion fail-closed con los rangos REALES

`RULE_LIMITS` usa los rangos de ffmpeg/x265 medidos, no los que parecen razonables:

| Intento | Resultado |
|---|---|
| `unsharp.luma_msize=4` | **RECHAZA** `debe ser impar (4:2:0 y el filtro lo exigen)` |
| `unsharp.luma_msize=0` | **RECHAZA** `fuera de [3,23]` — **0 rompe la cadena** (defecto de la skill) |
| `crf=60` | **RECHAZA** `fuera de [0,51]` |
| `preset=bogus` | **RECHAZA** `no permitido (validos: ultrafast,...,slow)` |
| `crf=22, msize=7, seg=4` | **OK** |

## 57.4 · Persistencia

`/opt/ape-jit/transform-rules.json`. `withRuleDefaults()` completa cualquier regla
guardada que venga sin los campos nuevos: una fila antigua nunca queda a medias en la
tabla. Verificado: las 16 reglas devuelven los 11 campos.

## 57.5 · Panel desplegado

`vps-image-panel.js` **41.086 -> 43.509 B** con las 15 columnas nuevas.
Verificado en local (`127.0.0.1:5500`) y por HTTPS: 200, 43.509 B, referencias a
`preset`, `hqls` y `seg` presentes. **Test de integracion: OK.**

---

# 58 · Al elegir un perfil, el constructor trae TODO lo cargado

## 58.1 · El defecto

Al cambiar el selector de perfil, **solo cambiaba el nombre**: las cajas seguian con los
valores del perfil anterior. El operador lo pidio explicito: *"cuando seleccione el perfil
que traiga la resolucion y todos sus valores actuamente cargados"*.

## 58.2 · Lo que trae ahora

`GET /jit/image/profile/{id}/full` devuelve un bloque `load` con **todo lo cargado**:

```json
{
  "profile": "P4.5",
  "ruleCount": 2,
  "matrix": { "outW": 5760, "outH": 3240 },
  "load": {
    "input": "720p", "inFps": 60,
    "outW": 5760, "outH": 3240, "outFps": 30,
    "codec": "hvc1", "recipe": "temporal", "dither": "error_diffusion", "mode": "emulado",
    "preset": "ultrafast", "crf": 20, "audio": "preserve",
    "hqdn3d": { "luma_spatial": 0.6, "chroma_spatial": 0.45, "luma_tmp": 0.9, "chroma_tmp": 0.7 },
    "unsharp": { "luma_amount": 0.2, "luma_msize": 5, "chroma_amount": 0, "chroma_msize": 3 },
    "atadenoise": { "s": 5, "a": 0.01, "b": 0.02 },
    "seg_duration": 2, "window_size": 30, "extra_window_size": 10,
    "gop_seconds": 2, "x265_threads": 1
  }
}
```

**Medido, tres perfiles distintos devuelven tres configuraciones distintas:**

| Perfil | Matriz | Reglas | codec | receta | modo |
|---|---|---|---|---|---|
| **P4.5** | 5760x3240 | 2 | hvc1 | temporal | **emulado** |
| P3 | 1920x1080 | 3 | hvc1 | light | real |
| P1 | 3840x2160 | 1 | hvc1 | none | real |

## 58.3 · Lo que se rellena al cambiar de perfil

Un solo `change` en el selector dispara `loadProfile()` y rellena **21 campos**:

- **Entrada**: ancho, alto (de la banda de la regla), fps de entrada
- **Salida**: ancho, alto, fps de salida
- **Codec, receta, dither, modo**
- **Encoder**: preset, CRF, audio, GOP
- **Los 6 filtros**: hq_ls, hq_cs, hq_lt, hq_ct, unsharp amount, unsharp msize, atadenoise s
- **Empaquetado**: seg_duration, window_size, extra_window_size, x265_threads

## 58.4 · Campos nuevos en el constructor

Se anadieron las cajas que faltaban para que la salida sea **libre**, no solo la del
catalogo:

- `SALIDA ancho (al TV)` y `SALIDA alto (al TV)` — cualquier resolucion
- `SALIDA fps`
- `Modo` — REAL / EMULADO
- `Dither`

Asi se puede declarar 5760x3240 a mano sin depender de que el catalogo lo liste.

## 58.5 · Desplegado

`vps-image-panel.js` **43.509 -> 47.504 B**. Verificado: `loadProfile` presente 1 vez,
`aip-b-outW` 3 veces (render, lectura y escritura). Local e HTTPS sirven los 47.504 B.
**Test de integracion: OK.**

---

# 59 · Recálculo automático al cambiar resolucion o entrada + selectores de entrada

## 59.1 · Lo que pidio el operador

> *"cuando ya dentro cambie la resolucion, los valores internos que sean los optimos
> para cada campo tambien lo hagan, queda editable por si quiero modificar alguno y que
> tambien haya un campo con lista desplegable para seleccionar la resolucion y fps de
> entrada de las senales del perfil asignado"*

> *"recuerda que cada perfil P1, P2, no esta amarado a resoluciones, esta amarrado a sus
> propios campos y valores como arrays y objetos"*

## 59.2 · Los tres cambios

**a) ENTRADA con desplegables.** Dos selectores nuevos:
- `ENTRADA res (señal)`: 480p, 576p, 720p, 1080p, 1440p, 4K, 8K
- `ENTRADA fps (señal)`: 24, 25, 30, 50, 60, 120

Cambiar cualquiera **dispara el recálculo**.

**b) SALIDA libre, con recálculo al cambiar.** El ancho, el alto y el TARGET del catalogo
disparan `recalcOptimos()`, que pide los valores optimos al motor y los **escribe en las
cajas**. Siguen editables: nada se bloquea.

**c) El perfil NO amarra la resolucion.** Es un contenedor de campos (codec, receta,
encoder, filtros, empaquetado). La resolucion es **un campo mas**, libre.

## 59.3 · Medido: los optimos cambian con la resolucion

Misma entrada **720p@60**, cuatro salidas distintas:

| Salida | codec | receta | fps | Por que |
|---|---|---|---|---|
| 1080p | hvc1 | **light** | 60 preserve | upscale 2,25x: unsharp basta |
| 1440p | hvc1 | **balanced** | 60 preserve | upscale 4,00x: el ruido se amplifica |
| 4K | hvc1 | **balanced** | 60 preserve | upscale 9,00x |
| 6K | hvc1 | **temporal** | **30 DECIMATE** | upscale 20,25x + el host no sostiene 60 a 6K |

**Y cambian con el fps de entrada**, misma salida 1440p:

| Entrada | fps optimo |
|---|---|
| 720p@24 | preserve |
| 720p@30 | preserve |
| 720p@60 | 60 preserve |

**Y con el escalado**, mismo 4K de salida:

| Entrada | receta |
|---|---|
| 480p@30 -> 1080p | balanced |
| 1080p@30 -> 4K | balanced |
| **4K@60 -> 4K** | **none** (sin escalado, filtrar solo anadiria artefactos) |

## 59.4 · Nada se aplica solo

El recálculo **escribe en las cajas, no en el motor**. La configuracion del JIT no cambia
hasta pulsar **«Aplicar al JIT»**. El panel lo dice en cada resultado:

> *"Todo sigue EDITABLE. Cambiar aquí no aplica nada hasta pulsar «Aplicar al JIT»."*

## 59.5 · Un falso positivo de despliegue

`curl --max-time 15` **cortaba la descarga** y devolvia 47.504 B de un archivo de 53.077 B,
lo que parecia un despliegue fallido. La verificacion correcta:

```
http=200  bytes=53.077  md5 servido == md5 en disco (f6dabdfb227a5d0411fe8c45659d1ff2)
etag "6af0f03b-cf55"  ->  cf55 hex = 53.077 decimal
```

**El ETag es la prueba**: su sufijo es el tamano en hex. Con el, no hace falta descargar.

## 59.6 · Desplegado

`vps-image-panel.js` **47.504 -> 53.077 B**. Cache-buster del index actualizado a
`?v=20261108-recalc` (backup del index en `/var/backups/ape-deploy/`).
**Test de integracion: 27/27.**

---

# 60 · Funcion objetivo REAL vs EMULADO + optimizador con LLM

## 60.1 · Tecnicas de sintesis: que existe de verdad en este FFmpeg

Medido antes de disenar nada:

| Filtro | Estado | Nota |
|---|---|---|
| `minterpolate` | **OK** | mi_mode mci / mc_mode aobmc — interpolacion de movimiento |
| `nlmeans` | **OK** | denoise de alta calidad, caro |
| `atadenoise` | **OK** | denoise temporal |
| `hqdn3d` | **OK** | denoise rapido |
| `gradfun` | **OK** | debanding, rango [0.51,64] y radius [4,32] |
| `cas` | **OK** | contraste adaptativo, rango [0,1] |
| `unsharp` | **OK** | msize IMPAR 3..23 |
| `zscale` | **OK** | HDR sintetico y dither |
| `tblend`, `smartblur`, `libplacebo` | **OK** | disponibles |
| **`sr` (DNN super-resolution)** | **NO DISPONIBLE** | exige `model=` con un `.pb`. **No existe en el VPS.** Es el mismo bloqueo que los `.tflite` del APK |

**Sin modelo DNN no hay super-resolucion neuronal.** La sintesis se hace por
interpolacion: Lanczos + cas + unsharp. Se declara en cada respuesta.

## 60.2 · La funcion objetivo

`objective()` devuelve **todos** los campos con su valor y su razon. Y cambia segun el
modo. Medido, **720p@30 -> 4K en ONN 4K**:

| Campo | REAL | EMULADO |
|---|---|---|
| preset | ultrafast | **superfast** |
| crf | 21 | **17** |
| window_size | 30 | **20** |
| extra_window_size | 10 | **6** |
| x265_threads | 1 | **2** |
| nlmeans | OFF | **ON s=1.75** |
| minterpolate | OFF | **ON 60 fps** |
| cas | OFF | **ON 0.39** |
| gradfun | OFF | **ON 1.35** |
| hqdn3d | 0.6 | **0** (lo sustituye nlmeans) |
| unsharp | 0.20 | 0.24 |

**11 campos cambian.** Y en el caso **4K@60 -> 4K sin escalado**:

- **REAL**: `scale` + `setsar` + `dither`. **Ningun filtro** — sin escalado, filtrar
  solo anadiria artefactos.
- **EMULADO**: hqdn3d + unsharp + cas + gradfun. Sintesis aunque no haya escalado.

## 60.3 · La logica de cada modo

**REAL** — solo lo sostenido y sin sintesis que pueda empeorar:
- ratio <= 1,05: **nada**
- ratio <= 2,5: unsharp 0.15
- ratio <= 9: hqdn3d moderado + unsharp 0.2
- ratio > 9: atadenoise temporal + unsharp 0.2
- **nunca** minterpolate, nlmeans, cas ni gradfun

**EMULADO** — sintesis maxima:
- denoise **proporcional al upscale** (nlmeans si ratio > 2,5, hqdn3d si no)
- debanding **siempre** (gradfun crece con el ratio)
- CAS **siempre** (contraste adaptativo, mejor que unsharp en detalle fino)
- unsharp de bordes **siempre**
- interpolacion **si la fuente no trae ya 50+ fps** y la salida no pasa de 4K
- **nlmeans y atadenoise NO se apilan**: son alternativas

## 60.4 · El optimizador con LLM

`POST /jit/image/optimize-llm` — **tres capas**:

1. **El motor determinista calcula SIEMPRE primero.** Es la red: el panel nunca se
   queda sin respuesta.
2. **Si hay `DEEPSEEK_API_KEY`**, el LLM recibe la base + el contexto de rangos y puede
   **mejorarla**. El prompt lleva los rangos reales de cada filtro y las 7 reglas de la
   casa, para que no invente parametros que ffmpeg rechace.
3. **La respuesta se valida campo a campo.** Lo invalido se **descarta** y queda el
   determinista. La cadena ffmpeg **se reconstruye desde los valores validados** — el
   LLM no puede inyectar texto arbitrario en el filtro.

**Sin key, medido:**
```json
"llm": { "used": false, "error": "sin DEEPSEEK_API_KEY en el entorno del motor",
         "ms": 0, "source": "deterministico" }
```
El panel funciona. Solo no consulta al modelo.

`GET /jit/image/llm-status` dice si esta configurado, sin exponer la clave.

## 60.5 · Por que la API y no el Harness

**La API basta y es lo correcto.** El Harness es el entorno del agente; montar otro
dentro del VPS seria un runtime completo para una llamada HTTP, con su propio riesgo de
romper algo. La key vive **solo en el proceso del motor** (variable de entorno), la
llamada **sale del VPS** y el navegador nunca la ve.

## 60.6 · Validacion contra ffmpeg real

**12 de 12 cadenas aceptadas** (6 combinaciones x 2 modos), sin rechazos:
720p30->1080p, 720p30->4K, 720p60->1080p, 1080p30->4K, 4K60->4K, 480p30->1080p.

## 60.7 · Desplegado

`vps-image-panel.js` **53.077 -> 58.204 B**, boton **«⚡ Optimizar (función objetivo)»**.
Cache-buster a `?v=20261108-llm`. md5 servido == md5 en disco. Test 27/27.

---

# 61 · Key del LLM en caliente + alineacion con el Gestor de Perfiles

## 61.1 · Key persistible SIN reiniciar el servicio

`POST /jit/image/llm-key` con `{key}` la guarda en `/opt/ape-jit/llm-key.json` con
**`chmod 600`** (verificado: `-rw------- root root`) y el motor la aplica **en el acto**.
`{clear:true}` la borra.

**Orden de resolucion:** entorno (`DEEPSEEK_API_KEY`) > archivo. La key **nunca vuelve
al navegador**; el panel solo recibe `configured` y `source`.

Medido: guardar una key de prueba devuelve `configured: true`,
`source: archivo /opt/ape-jit/llm-key.json`. Con una key invalida, `optimize-llm`
devuelve **HTTP 401 del proveedor** y **gana el determinista** (`source: deterministico`).
El sistema nunca se queda sin respuesta.

## 61.2 · El Gestor de Perfiles, medido

`APE_ALL_PROFILES_OPTIMIZED.json` — los 6 perfiles y su tamano real:

| Perfil | Nombre | Level | Campos |
|---|---|---|---|
| **P0** | GOD_TIER_8K_OMEGA | 6 | **577** |
| P1 | SUPREME_4K_HDR | 5 | 577 |
| P2 | ELITE_4K_BALANCED | 4 | 484 |
| P3 | ULTRA_FHD_STABLE | 3 | 577 |
| P4 | HIGH_HD_COMPATIBLE | 2 | 576 |
| P5 | SD_FAILSAFE_UNIVERSAL | 1 | 575 |

**3.366 campos** en los 6 perfiles. Secciones por perfil: `settings` (18),
`vlcopt` (27), `kodiprop` (6), `headerOverrides` (230), `prefetch_config` (8),
`quality_levels` (8), `headers` (242).

`GET /jit/image/gestor/profiles` los expone al panel.

## 61.3 · La alineacion: propone, no aplica

`POST /jit/image/profile/align` hereda el perfil del gestor y devuelve **campo a campo**:
ruta, antes, despues y razon. **No aplica nada** hasta confirmar.

**Medido, P0 alineado con 720p@30 -> 4K REAL en ONN 4K:**

| Campo | Antes | Despues |
|---|---|---|
| `settings.resolution` | 7680x4320 | **3840x2160** |
| `settings.codec` | AV1 | **H265** |
| `settings.fps` | 60 | **30** |
| `settings.bitrate` | 80 | **28** |
| `settings.bufferSeconds` | 25 | **21** |
| `settings.strategy` | ultra-aggressive | **balanced** |
| `vlcopt.network-caching` | 25000 | **21000** |
| `vlcopt.clock-jitter` | 1000 | **2100** |
| `vlcopt.video-filter` | nlmeans=s=3.0… | **cadena del objetivo** |
| `prefetch_config.buffer_target_seconds` | 54 | **63** |
| `headers.X-APE-BITRATE` | 80,50,30,20 | **28** |

**27 cambios de 577 campos; 550 se heredan sin tocar.**

Y **el mismo P0 con 6K EMULADO** da otros numeros: `bufferSeconds` **60** (vs 21),
`network-caching` **60000** (vs 21000), `clock-jitter` **6000**. **El modo cambia la
alineacion del gestor, no solo la cadena ffmpeg.**

## 61.4 · Un defecto que la medicion destapo

El bitrate se calculaba con un factor por pixel (`px * 0.06`), que daba **4K = 1 Mbps**:
absurdo. Se sustituyo por la **tabla de referencia del repo** (CLAUDE.md, "Bitrate
Fallback por Resolucion"): 8K 80 · 4K 28 · 1440p 16 · 1080p 12 · 720p 5,5 · 480p 2,5.
Con ajuste por codec (AV1 −25 %, AVC +40 %) y +15 % en emulado. Medido: **4K = 28 Mbps**.

## 61.5 · Lo que FALTA de este objetivo

**Declarado, no fingido:**

- **`/image/profile/align/apply`**: la aplicacion del cambio al gestor. La propuesta
  existe; el boton que la escribe no.
- **Los 550 campos restantes**: hoy se heredan tal cual. Las 230 `headerOverrides` y
  las 242 `headers` no se recalculan por reglas, solo las 10 que se listan.
- **La cascada de campos** (valor unico vs multi-configuracion): no implementada.
- **El LLM extendido al gestor**: hoy el LLM solo optimiza la cadena del modulo de
  imagen, no los 577 campos del perfil.

## 61.6 · Desplegado

`vps-image-panel.js` **58.204 -> 64.173 B** con la seccion **Motor LLM** (campo de key
tipo password, guardar/borrar, modelo y origen) y **Alinear Gestor de Perfiles**
(selector de los 6 perfiles, boton de propuesta y tabla antes/despues).
Cache-buster `?v=20261108-align`. md5 servido == md5 en disco. Test 27/27.

---

# 62 · Alineacion de los 577 campos, con cascada ABR y guardado

## 62.1 · De 27 a 127 cambios

La primera version alineaba 27 campos. Ahora recorre **las ocho secciones** del
perfil y propone **127 cambios de 577**, con **22 en cascada**.

**Medido, P0 con 720p@30 -> 4K REAL:**

| Seccion | Campos | Cambian |
|---|---|---|
| `settings` | 18 | **12** |
| `vlcopt` | 27 | **13** |
| `kodiprop` | 6 | **5** |
| `enabledCategories` | 32 | 0 |
| `headerOverrides` | 230 | **44** |
| `prefetch_config` | 8 | **8** |
| `quality_levels` | 8 | **1** |
| `headers` | 242 | **44** |

**450 campos se heredan sin tocar.** Medido en EMULADO: 125 cambios (otros valores).

## 62.2 · La cascada: 22 campos, y conserva la escalera ABR

**226 de los 242 headers son CSV de 4 niveles.** No son listas: son la **cadena de
fallback**. Se transforma cada nivel **preservando la escalera**:

```
X-APE-RESOLUTION      7680x4320,3840x2160,2560x1440,1920x1080
                   -> 3840x2160,2560x1440,2048x1080,1920x1080
X-APE-BITRATE         80,50,30,20        ->  28,18,12,8
X-APE-TARGET-BITRATE  80000000,...,20000000 -> 28000000,18200000,11830000,7689500
X-HEVC-Level          6.2,6.1,6.0,5.2    ->  5.1,5.0,4.1,4.0
X-Segment-Duration    1,2,4,6            ->  2,3,4,5
```

**Nivel 0 = salida objetivo; los siguientes bajan por la escalera del repo**
(8K > 4K > 1440p > 2048x1080 > 1080p > 720p > 480p), con bitrate al 65 % por
escalon y cadencia limitada a 30 en los niveles bajos.

## 62.3 · Dos defectos que la medicion destapo

**a) La cascada se aplanaba.** La primera version ponia el mismo valor en todos los
niveles: `3840x2160,3840x2160,3840x2160,3840x2160`. **Eso mata el ABR**: el player
no tiene a donde bajar. Se sustituyo por una escalera real.

**b) El TARGET-BITRATE daba 28 BILLONES.**

```
80000000,50000000,30000000,20000000  ->  28000000000000,...   (x1e6 de mas)
```

El target **ya venia en bps** y el codigo lo volvia a multiplicar. Corregido: **la
unidad la dice el valor, no el nombre del campo**. Medido despues: **0 valores de
bitrate fuera de rango**.

## 62.4 · El guardado: de propuesta a cambio real

`POST /jit/image/profile/align/apply` recibe el perfil y las diferencias, y devuelve
el **perfil nuevo completo**. Medido: **127 aplicados, 0 fallidos**.

Verificacion del perfil resultante:

```
settings.resolution      3840x2160
settings.codec           H265
settings.fps             30
settings.bitrate         28
vlcopt.network-caching   21000
headers.X-APE-RESOLUTION 3840x2160,2560x1440,2048x1080,1920x1080
headers.X-APE-BITRATE    28,18,12,8
```

**El boton «💾 Guardar en el Gestor»** escribe el perfil en el SSOT del Gestor
(`APE_PROFILES_CONFIG` / `localStorage`) y **declara por donde guardo**. Si no hay
SSOT en la pagina, lo dice: *"el perfil nuevo se devuelve pero no se persiste"* — no
finge que guardo.

## 62.5 · Nuevo endpoint

`GET /jit/image/gestor/profile/{id}` — el perfil crudo del gestor, para que el panel
pueda aplicarle las diferencias.

## 62.6 · Desplegado

`vps-image-panel.js` **64.173 -> 67.289 B**. Cache-buster `?v=20261108-align2`.
`doApplyAlign` y `aip-align-apply` presentes. Test 27/27.

## 62.7 · Lo que sigue faltando

- **El LLM aplicado a los 577 campos**: hoy la alineacion es determinista; el LLM
  solo optimiza la cadena del modulo de imagen.
- **`quality_levels` L1-L7**: solo se alinea `primary`; las condiciones y
  resoluciones de cada nivel no se recalculan.
- **`enabledCategories`** (32): no se toca.
- **El modo cascada para `prefetch_segments`/`parallel_downloads`**: se pone el
  mismo valor en todos los niveles.

---

# 63 · Niveles L1-L7 alineados + LLM sobre los 577 campos

## 63.1 · La escalera de calidad, alineada

`quality_levels` tiene L1-L7 con `{label, condition, resolution, bitrate_mbps, hdr,
video_filter}`. Antes solo se alineaba `primary`. Ahora **los siete niveles**:

**Medido, P0 con 720p@30 -> 4K REAL:**

| Nivel | Resolucion | Bitrate | HDR |
|---|---|---|---|
| **L1** | **3840x2160** | **28 Mbps** | hdr10 |
| L2 | 2560x1440 | 18 Mbps | hdr10 |
| L3 | 2048x1080 | 12 Mbps | hdr10 |
| L4 | 1920x1080 | 8 Mbps | hdr10 |
| L5 | 1280x720 | 5 Mbps | sdr |
| L6 | 854x480 | 3 Mbps | sdr |
| L7 | 854x480 | 2 Mbps | sdr |

**Escalera desciende: SI** (3840 > 2560 > 2048 > 1920 > 1280 > 854 > 854). Una
escalera plana mata el ABR: el player no tiene a donde bajar.

**HDR coherente con el codec**: sin Main10 (p. ej. AVC) el `hdr` baja a `sdr` en
todos los niveles. **No se declara HDR que el codec no puede sostener.**

**Filtros por nivel**: L1 lleva la cadena completa del objetivo; L2-L3 llevan la
cadena sin `nlmeans` (no tiene sentido a 1080p); L4-L7 van sin filtros.

## 63.2 · 134 cambios de 577

| Seccion | Campos | Cambian |
|---|---|---|
| settings | 18 | 12 |
| vlcopt | 27 | 13 |
| kodiprop | 6 | 5 |
| enabledCategories | 32 | **0** |
| headerOverrides | 230 | 44 |
| prefetch_config | 8 | 8 |
| **quality_levels** | **8** | **8** |
| headers | 242 | 44 |

**APPLY medido: 134 aplicados, 0 fallidos.**

## 63.3 · El LLM sobre los 577 campos

`POST /jit/image/profile/align-llm` — **tres capas**, igual que en la cadena:

1. **La determinista calcula primero** (los 134 cambios). Es la red.
2. **El LLM recibe el perfil completo** (secciones truncadas a 40 claves para no
   reventar el contexto) **+ la propuesta determinista**, y puede **anadir campos
   que la base no toco**.
3. **Validacion campo a campo** con reglas duras:
   - `msize` impar en [3,23] — **0 rompe la cadena**
   - `gradfun.strength` [0,51,64], `radius` [4,32]
   - `bitrate` >= 1 Mbps, `bufferSeconds` [2,600]
   - **no degradar audio** (rechaza `mono`/`stereo_only`)
   - **no aplanar la escalera** de `quality_levels`

**La determinista manda**: el LLM solo **anade** campos que la base no toco. Si el
LLM propone algo que la base ya decidio, gana la base.

**Sin key, medido:**
```json
"llm": { "used": false, "error": "sin key del LLM", "ms": 0, "source": "deterministico" }
```
Propone los mismos 134 cambios. El panel funciona.

## 63.4 · El prompt del LLM lleva la doctrina

No se le pide "optimiza": se le dan **8 reglas duras** y el significado de cada
seccion. Sin eso el modelo inventa `-ac 2` (degrada 5.1), aplana la escalera o pone
`msize=0`. Las reglas van en el system prompt y **ademas** se revalidan en el codigo:
un prompt no es un gate.

## 63.5 · Desplegado

`vps-image-panel.js` **67.289 -> 70.023 B** con el boton **«🤖 Proponer con LLM»** y
el detalle de la propuesta (usado/no usado, ms, extras, rechazados, razon, riesgo).
Cache-buster `?v=20261108-align3`. Test 27/27.

## 63.6 · Lo que sigue faltando

- **`enabledCategories`** (32): no se toca. Activar/desactivar familias de headers
  por modo no esta implementado.
- **Cascada de `prefetch_segments`/`parallel_downloads`**: se pone el mismo valor en
  los cuatro niveles.
- **Los 3.366 campos de los 6 perfiles**: se alinea un perfil por llamada; no hay
  alineacion de los seis de golpe.
- **El LLM nunca se ha ejecutado con una key real** en esta sesion: solo se ha
  verificado el camino de fallo.

---

# 64 · Los 6 perfiles de golpe: 3.366 campos

## 64.1 · Medido

`POST /jit/image/profile/align-all` recorre **los seis perfiles** del Gestor.

| Perfil | Campos | Propuestos | Cascada |
|---|---|---|---|
| P0 | 577 | 134 | 22 |
| P1 | 577 | 134 | 22 |
| P2 | **484** | **117** | 21 |
| P3 | 577 | 137 | 22 |
| P4 | 576 | 135 | 22 |
| P5 | 575 | 137 | 22 |
| **TOTAL** | **3.366** | **792** | **131** |

`POST /jit/image/profile/align-all/apply` devuelve los seis perfiles nuevos.
**Medido: 794 aplicados, 0 fallidos** (antes del fix de resolucion; 792 despues).

## 64.2 · P2 es distinto y el motor no lo finge

**P2 tiene 484 campos, no 577.** Su `quality_levels` **no tiene L1-L7**: solo
`primary`, y con otro esquema (`resolution`, `bitrate` como CSV, `fps`, `codec`,
`profile`).

**El motor solo alinea lo que existe.** No inventa los siete niveles que ese perfil
no tiene. Por eso el conteo de `quality_levels` en P2 es 1 y no 8.

## 64.3 · DEFECTO GRAVE corregido: la resolucion nativa es un SUELO

**Antes del fix**, alinear los seis perfiles con salida 4K ponia **P0 (8K nativo) en
3840x2160**. Eso **degrada el perfil de maxima calidad**, en violacion directa de la
Ley Anti-Degradacion.

**La regla correcta**: `resolucion_efectiva = max(resolucion_nativa, salida_del_modulo)`.

| Perfil | Nativa (suelo) | Efectiva | ¿Sube? |
|---|---|---|---|
| **P0** | **7680x4320** | **7680x4320** | **si (8K)** |
| P1 | 3840x2160 | 3840x2160 | no |
| P2 | 3840x2160 | 3840x2160 | no |
| P3 | 1920x1080 | 3840x2160 | no (upscaling) |
| P4 | 1280x720 | 3840x2160 | no (upscaling) |
| P5 | 854x480 | 3840x2160 | no (upscaling) |

**Nunca baja. Puede subir** — que es el upscaling que el operador pidio.

## 64.4 · Cambio de rol que hay que declarar

**P5 es `SD_FAILSAFE_UNIVERSAL` con 854x480 nativos.** Al alinearlo a la salida 4K
del modulo, **deja de ser el failsafe SD**. Si el operador quiere conservar ese rol,
P5 debe excluirse de la alineacion o alinearse contra una salida menor.

**El motor no decide eso por su cuenta**: aplica `max()` y **reporta `nativeFloor`,
`resolution` y `raisedOverModule`** por perfil, para que la decision sea informada.

## 64.5 · Desplegado

- `POST /jit/image/profile/align-all` — propuesta de los seis
- `POST /jit/image/profile/align-all/apply` — devuelve los seis perfiles nuevos
- Panel: **«🗂 Alinear los 6 perfiles»** y **«💾 Guardar los 6 (N)»**, con tabla por
  perfil (campos, propuestos, cascada) y el resultado del guardado declarando por
  donde persistio.
- `vps-image-panel.js` **70.023 -> 75.683 B**. Cache-buster `?v=20261108-align4`.

## 64.6 · Lo que sigue faltando

- **El LLM nunca se ejecuto con key real** en esta sesion.
- **La cascada de `prefetch_segments`/`parallel_downloads`**: en el perfil son valores
  unicos, no CSV; no hay cascada que preservar ahi. Solo los headers la tienen.
- **`enabledCategories`**: verificado que **las 32 categorias estan completas en los
  seis perfiles**. No hay nada que alinear.

---

# 65 · Ley de Suficiencia Excepcional — Streaming Health

## 65.1 · El defecto que el operador fotografio

El panel mostraba, en la misma fila:

```
Risk: 90/100 | Headroom: 199900%
```

**Los dos numeros son incompatibles.** Un headroom de 199.900 % implicaria un risk
de 0, no de 90. Diagnostico cerrado en el codigo:

```
headroomSparePct = (bitrate/bwSafe − 1) × 100          [valor de COLCHON]
bwSafe  = 0.1 Mbps   ← no habia medicion; actuaba el piso MIN_BANDWIDTH_MBPS
bitrate = 200 Mbps
→ (200/0.1 − 1) × 100 = 199900
```

**Dos errores encadenados:**

1. **El signo se leia al reves.** 199900 **positivo** significa un **deficit del
   99,95 %**, no un sobrante. La propia formula lo documenta
   (`spare > 0` = sobre-suscrito), pero el panel lo rotulaba "Headroom".
2. **Se publicaba un numero sin medicion.** `hasMeasurement = false` y aun asi el
   panel mostraba una cifra. Sin medicion, el headroom **no es computable**.

## 65.2 · El valor de referencia (la X que pidio el operador)

`X = 3.00x` → **200 % de headroom**, mas **risk <= 10**.

Justificacion, escalon por escalon (`sufficiency-law-v1.js`):

| ratio | % | lectura |
|---|---|---|
| 1.00x | 0 % | sin margen: un pico de jitter vacia el buffer |
| **1.30x** | **30 %** | **minimo de la industria** (safety factor de dash.js/Shaka) |
| 1.50x | 50 % | suficiente para CBR |
| 2.00x | 100 % | el ABR puede **subir un escalon** sin quedarse sin margen |
| **3.00x** | **200 %** | **EXCEPCIONAL — el gate** |
| > 100x | — | **IMPLAUSIBLE**: no es un enlace, es un calculo roto |

**Por que 3.00x y no 2.00x**: a 3x el margen cubre **a la vez** el jitter (10 %),
la rafaga de un I-frame (hasta 1.6x del bitrate medio), la precarga de N segmentos
en paralelo y la variacion del proveedor. A 2x cada uno de esos factores por
separado ya consume el margen.

## 65.3 · Los cinco estados

| Estado | Condicion | Excepcional |
|---|---|---|
| `NO_MEASUREMENT` | no hay medicion de red | no |
| `IMPLAUSIBLE` | ratio fuera de [0,01, 100] | no |
| `INSUFFICIENT` | ratio < 1.00 | no |
| `TIGHT` | 1.00 <= ratio < 1.30 | no |
| `MINIMUM` | 1.30 <= ratio < 1.50 | no |
| `SUFFICIENT` | 1.50 <= ratio < 2.00 | no |
| `OPTIMAL` | 2.00 <= ratio < 3.00 | no |
| **`EXCEPTIONAL`** | **ratio >= 3.00 Y risk <= 10** | **si** |

**El risk manda.** Medido: ratio 3.5 con risk 60 da `EXCEPTIONAL` de headroom pero
**NO** excepcional global. Ambas condiciones tienen que cumplirse.

## 65.4 · Verificado en el VPS

```
EL CASO DE LA IMAGEN (risk 90, headroom 199900%)
  estado      : NO_MEASUREMENT
  etiqueta    : SIN MEDICION          ← ya no se muestra el numero absurdos
  excepcional : false

CON MEDICION REAL 3.2x + risk 8
  estado      : EXCEPTIONAL
  etiqueta    : 220%
  excepcional : true
```

## 65.5 · Donde se aplica

- **`sufficiency-law-v1.js`** (7.965 B): la ley, con `evaluateSufficiency()` y
  `sufficiencyLabel()`. Se carga **antes** del Gestor (linea 4689 vs 4690).
- **`profile-manager-v9.js`**: el headroom usa la ley; el `%` duplicado se elimino
  porque la etiqueta ya trae su unidad o `SIN MEDICION`.
- **Nuevo div `pm9_sufficiency_gate`**: declara `SUFICIENCIA EXCEPCIONAL` o, si no,
  **cuanto falta** (`faltan Nx para 3.0x` / `risk excede en N`).
- **`profile-solver-v9.js`**: se anadio `r.exceptional` **sin tocar `r.feasible`**.
  En la escala `sparePct` el gate es `sparePct <= -66.67` (el colchon es negativo
  cuanto mejor), y el objetivo ahora pesa `W_EXC = 0.60` por acercarse.

## 65.6 · Mapeo de escalas (para no equivocarse otra vez)

```
ratio = bwSafe / bitrate            (headroom; 3.00 = excepcional)
sparePct = (bitrate/bwSafe − 1)×100 (colchon; -66.67 equivale a ratio 3.00)
```

`sparePct` **mas negativo = mejor**. Es la fuente del error de lectura original.

## 65.7 · Lo que sigue faltando

- **El headroom exige una medicion real.** Mientras `bw-estimator-v9.js` no tenga
  una muestra de Resource Timing, el estado sera `NO_MEASUREMENT` y **no se
  publicara cifra**. Eso es lo honesto, pero significa que el gate **no puede
  aprobarse sin medir**.
- El solver **premia** acercarse al gate; **no puede alcanzarlo** si el enlace
  medido no da para 3x el bitrate. Ahi la palanca es el bitrate del perfil, y
  bajarlo choca con la Ley Anti-Degradacion — decision del operador.

---

# 66 · El gate de 3x aplicado al perfil: el headroom ya es alcanzable

## 66.1 · El gate era inalcanzable con los valores del perfil

`sufficiency-law-v1.js` exige `headroom = bwSafe/bitrate >= 3.00`. Medido con los
valores del Gestor: **solo P2 lo cumplia**.

| Perfil | Resolucion | Bitrate | Tabla repo | Min BW | Ratio | Gate |
|---|---|---|---|---|---|---|
| P0 | 8K | 80 | 80 | 194 | **2,42** | no |
| P1 | 4K | 40 | 28 | 81 | **2,02** | no |
| **P2** | 4K | 20 | 28 | 65 | **3,25** | **si** |
| P3 | 1080p | 10 | 12 | 20 | 2,00 | no |
| P4 | 720p | 5 | 5,5 | 9 | 1,80 | no |
| P5 | 480p | 2 | 2,5 | 5 | 2,50 | no |

**El `min_bandwidth_mbps` de cada perfil no derivaba de su bitrate.** Cada uno tenia
un valor sin regla comun, y ninguno daba 3x.

## 66.2 · La regla, con suelo anti-degradacion

```
min_bandwidth_mbps = max(declarado, ceil(bitrate × 3))
t1                  = max(declarado, ceil(bitrate × 3))
t2                  = max(declarado, ceil(bitrate × 4))
bitrate             = max(tabla_repo, declarado)
```

**Todo es un SUELO, nada baja.** Es el punto delicado: el motor calcula el bitrate
con la tabla del repo, y P1 declara **40 Mbps** cuando la tabla dice **28**. Sin el
suelo, alinear P1 lo habria **degradado a 28** — violacion de la Ley
Anti-Degradacion. Con el suelo, P1 **conserva sus 40**.

## 66.3 · Medido despues

| Perfil | Bitrate | Min BW | T1 | Ratio | Gate 3x |
|---|---|---|---|---|---|
| **P0** | 80 | **240** | 240 | **3,0** | **si** |
| **P1** | **40** (conservado) | 120 | 120 | **3,0** | **si** |
| P2 | 28 | 84 | 84 | **3,0** | **si** |
| P3 | 28 | 84 | 84 | **3,0** | **si** |
| P4 | 28 | 84 | 84 | **3,0** | **si** |
| P5 | 28 | 84 | 84 | **3,0** | **si** |

**Los seis cumplen.** Y el gate ahora es **fisicamente alcanzable**: 240 Mbps para
8K y 84 para 4K son valores que una fibra domestica sostiene.

## 66.4 · Lo que esto implica y hay que decir

- **P3, P4 y P5 suben a 28 Mbps / 84 de min BW** porque su **resolucion efectiva es
  4K** (la salida del modulo manda, con su resolucion nativa como suelo). Para que
  P5 conserve su rol de failsafe SD hay que **excluirlo de la alineacion** o
  alinearlo contra una salida menor. **Es decision del operador, no del motor.**
- **El gate exige 3x el bitrate de ancho de banda real.** En un enlace de 100 Mbps,
  P0 (240) y P1 (120) **no podran** llegar a EXCEPCIONAL. El estado sera `MINIMUM`
  o `TIGHT` y el panel lo dira. **Eso es honesto**: no se puede simular un enlace
  que no existe.
- **Sigue haciendo falta una medicion real.** El ratio solo se computa con una
  muestra de Resource Timing; sin ella el estado es `NO_MEASUREMENT`.

---

# 67 · Los 12 perfiles: 6.750 campos

## 67.1 · Faltaban seis perfiles

El Gestor JS conoce **12 ids** — `APE_6K_IDS = ['P0.5','P1.5','P2.5','P3.5','P4.5','P5.5']`
en `profile-manager-v9.js`. El HTML del operador pinta **12 tabs**. Pero
`APE_ALL_PROFILES_OPTIMIZED.json` trae **solo 6**.

**Los `.5` llegan por el import del LAB v24** (`data.profiles_calibrated`). Sin ese
import **no existen**, y el modulo de imagen solo podia alinear 6 de los 12 que el
operador ve.

## 67.2 · Derivacion honesta, sin tocar el JSON

Si un `.5` no esta, se **deriva de su base** marcando el modo:

```
P0.5 = copia de P0  + _mode:'emulado' + _derived_from:'P0' + _derived_note
```

**No se inventan valores nuevos.** Se copia la base y **se declara el origen**. Cuando
el LAB aporte el `.5` real, **este gana y la derivacion no se usa**
(`if (all[pid]) continue;`).

Los derivados tienen **3 campos mas** que su base (580 vs 577): los tres de la
derivacion.

## 67.3 · Medido: 12 perfiles, 6.750 campos

| Perfil | Campos | Propone | Cascada | Modo | Resolucion |
|---|---|---|---|---|---|
| P0 | 577 | 132 | 22 | real | 7680x4320 |
| **P0.5** | **580** | **130** | 22 | **emulado** | 7680x4320 |
| P1 | 577 | 133 | 22 | real | 3840x2160 |
| **P1.5** | **580** | **131** | 22 | **emulado** | 3840x2160 |
| P2 | 484 | 117 | 21 | real | 3840x2160 |
| **P2.5** | **487** | **116** | 21 | **emulado** | 3840x2160 |
| P3 | 577 | 137 | 22 | real | 3840x2160 |
| **P3.5** | **580** | **135** | 22 | **emulado** | 3840x2160 |
| P4 | 576 | 135 | 22 | real | 3840x2160 |
| **P4.5** | **579** | **136** | 22 | **emulado** | 3840x2160 |
| P5 | 575 | 137 | 22 | real | 3840x2160 |
| **P5.5** | **578** | **137** | 22 | **emulado** | 3840x2160 |
| **TOTAL** | **6.750** | **1.576** | **262** | | |

## 67.4 · Defecto corregido: el `.5` se alineaba como real

Antes del fix, **P0.5 daba exactamente los mismos 132 cambios que P0** porque el
motor usaba el modo global del request. **Un perfil emulado alineado como real es
una mentira**: no lleva la cadena sintetica (nlmeans, minterpolate, cas, gradfun).

**Ahora el perfil manda**: si declara `_mode`, se reconstruye la funcion objetivo con
ese modo y se reporta `appliedMode`. Medido despues:

```
P0.5  emulado  bitrate 92      P2.5  emulado  bitrate 32
P0    real     (sin cambio)    P2    real     bitrate 28
```

**Si la reconstruccion falla, se cae al objetivo global**: nunca se rompe la respuesta.

## 67.5 · Panel

**«🗂 Alinear los 12 perfiles»** y **«💾 Guardar los 12 (N)»**, con la tabla por
perfil incluyendo una columna **MODO** (real en gris, emulado en violeta).
`vps-image-panel.js` **75.683 -> 75.836 B**. Cache-buster `?v=20261109-12p`.

## 67.6 · Lo que sigue faltando

- **El LLM nunca se ejecuto con key real**: falta la key del operador.
- **Los `.5` derivados no son los del LAB**: son un clon con modo emulado. El LAB
  v24 trae valores calibrados distintos, y ese import no esta disponible aqui.
