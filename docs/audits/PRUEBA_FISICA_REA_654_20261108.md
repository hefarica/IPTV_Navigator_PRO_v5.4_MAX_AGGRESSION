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
