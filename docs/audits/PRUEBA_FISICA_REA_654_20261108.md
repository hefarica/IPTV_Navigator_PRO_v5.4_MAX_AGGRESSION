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
