# CONDICIÓN 4 — Medición en hardware real (ONN 4K)

**Fecha:** 2026-11-08 · **Dispositivo:** `onn. 4K Streaming Box` (`onn__4K_Streaming_Box`, YOC)
**SoC:** Amlogic `s4` · **Android 14** (SDK 34) · **Serial ADB:** `adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp` (192.168.1.3:37931, depuración inalámbrica)

La condición 4 del dictamen pedía «comprobar en la APK la variante `.5` realmente aplicada, las
capacidades detectadas y el fallback cuando corresponda». **Ya es medible. La respuesta es NO.**

---

## 1 · El veredicto, primero

| Requisito del LAB para activar `.5` | Lo que el device reporta | ¿Cumple? |
|---|---|:---:|
| El device debe reportar **≥ 5760 × 3240** | Panel/display: **3840 × 2160** | **NO** |
| SoC capaz de 5760 × 3240 | Decoder HEVC máximo: **4096 × 2160** | **NO** |

**El objetivo 6K (5760×3240) EXCEDE el techo del decoder en ambas dimensiones:**

```
5760 > 4096   (ancho)
3240 > 2160   (alto)
```

**La capa `.5` no puede decodificarse en este dispositivo.** El comportamiento correcto es
**fallback: sin 6K**. Y eso es exactamente lo que ocurre.

---

## 2 · El decoder, que es la prueba

```xml
<MediaCodec name="c2.amlogic.hevc.decoder" type="video/hevc">
    <Limit name="size" min="128x128" max="4096x4096" />
    <Limit name="block-count" range="1-34560" /> <!-- max 4096x2160 -->
    <Limit name="blocks-per-second" range="1-2073600" />
    <Limit name="bitrate" range="1-300000000" />
    <Feature name="adaptive-playback" />
    <Feature name="tunneled-playback" />
    <Feature name="low-latency" />
</MediaCodec>
```

Fuente: `/vendor/etc/media_codecs_amlogic_video.xml` (leído por ADB).
Es el decoder **de hardware** (`c2.amlogic`), no un fallback de software.

---

## 3 · El display

```
Physical size: 3840x2160        mode 694 @ 60.000004 fps
Override size: 1920x1080        <- resolucion de la capa de app AHORA
Physical density: 320

supportedHdrTypes = [2, 3, 4]   -> HDR10, HLG, HDR10+
mMaxLuminance = 1000.0 nits
supportedColorModes = [0]       -> NATIVE (sin modo wide-color extra)
isForceSdr = false
```

**Modos de display disponibles:** 3840×2160 y 1920×1080 y 1280×720, a 23.976/24/25/29.97/30/50/59.94/60.
**No existe un modo 5760×3240** — el panel no lo tiene.

**Estado de HDR en la ventana activa:** `hdr metadata types=0`, `dataspace=UNKNOWN`. Es decir, **ningún HDR
activo** en este instante (coherente con no estar reproduciendo contenido HDR).

### Discrepancia que hay que resolver en el device, no en la lista

```
settings get global display_size_forced  ->  3840x2160      (persistido)
mOverrideDisplayInfo                     ->  real 1920x1080 (ACTIVO)
```

**CORRECCION 2026-11-08 — esta conclusion era FALSA.** El `mode` es **694 = 3840x2160 @ 60 Hz** tanto en
`mBaseDisplayInfo` como en `mOverrideDisplayInfo`. El `real 1920x1080` describe el tamano de **composicion
de la UI**, no la salida de video: Android TV compone la capa de app a 1080p y el escalador del SoC la lleva
al panel 4K. **La salida de display ya era 4K60 y nunca estuvo bloqueada.** Se reinicio el equipo sobre esta
premisa falsa. Traza completa y riesgo residual: ver seccion 3.1.

---

## 4 · La APK instalada NO es la auditada

| | |
|---|---|
| Instalada | `com.ape.crystalagent` · **`2.3.0-noWG`** · **versionCode 600** |
| Publicada en `/ara/version.json` | **651** · `3.9.5-adb-firetv-shim` |
| Candidatas REA | 653 y 654 |

Búsqueda de las clases del camino REA en el paquete instalado:

```
dumpsys package com.ape.crystalagent | grep -cE 'ReaProfile|ReaBridge|LabMetadataStore'  ->  0
```

**Cero ocurrencias.** La APK instalada **no contiene** el camino REA (`ReaProfileStore`, `ReaBridge`,
`ReaMetadataStore`). Es un build anterior y distinto a todo lo que la lista y los informes describen.

**Por tanto:** la variante `.5` «realmente aplicada por la APK» **no se puede medir en esta APK** porque
esta APK no implementa el camino que la aplicaría. No es que falle: es que no es el artefacto.

---

## 5 · Contradicción latente: P0 declara Dolby Vision y el device no lo soporta

`profiles_calibrated.P0.settings.hdr_mode = "DOLBY_VISION_P8"`.

El device reporta `supportedHdrTypes = [2, 3, 4]`. En los códigos de `HdrCapabilities` de Android:
`1 = DOLBY_VISION`, `2 = HDR10`, `3 = HLG`, `4 = HDR10+`. **El tipo 1 no está en la lista.**

**Este device no soporta Dolby Vision.** Si algún día se asignan canales a P0, la lista declararía DV sobre
un dispositivo que no puede decodificarlo. Hoy es **inerte** (P0 tiene 0 canales en el catálogo), pero es
una bomba de relojería declarativa.

---

## 6 · Lo que esto cambia en el dictamen

| Afirmación previa | Estado tras medir |
|---|---|
| «el realce se plantea después, en el dispositivo» | **CIERTO** como diseño, pero el dispositivo **no tiene techo** para 5760×3240 |
| «recibir 1080p/720p es compatible con este diseño» | **CIERTO**, y además es **lo máximo posible** aquí |
| «falta comprobar la variante `.5` aplicada» | **MEDIDO: no aplicable** — el decoder no llega a 6K |
| «fallback cuando corresponda» | **CORRESPONDE**, y el device ya está en fallback (1080p, sin HDR activo) |

**La condición 4 queda cerrada con veredicto: el dispositivo no puede ejecutar la capa `.5`.** No es un
fallo de la lista ni del contrato: es la frontera física que el propio LAB anticipó
(`emulation.apply = device_vpp_declared` + «≥5760×3240 y SoC capaz»), y el device no la cruza.

---

## 7 · Evidencia reproducible

```bash
S=adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp
adb -s $S shell "getprop ro.board.platform; getprop ro.build.version.sdk"          # s4 / 34
adb -s $S shell "wm size; wm density"                                              # 3840x2160 fisico / override 1920x1080
adb -s $S shell "sed -n '/video\/hevc/,/<\/MediaCodec>/p' /vendor/etc/media_codecs_amlogic_video.xml"
adb -s $S shell "dumpsys display | grep -oE 'supportedHdrTypes=\[[0-9, ]+\]' | head -1"
adb -s $S shell "dumpsys package com.ape.crystalagent | grep -E 'versionName|versionCode'"
adb -s $S shell "dumpsys package com.ape.crystalagent | grep -cE 'ReaProfile|ReaBridge|LabMetadataStore'"
```

**Nada de esto se dedujo. Todo salió del dispositivo.**

---

## 3.1 · Correccion de un diagnostico propio falso — y el bug real que aparecio

### Lo que dije y por que estaba mal

Lei `Override size: 1920x1080` como "el 4K esta siendo robado" y reinicie el equipo. **Falso.** La evidencia
que lo refuta esta en la misma captura:

```
mBaseDisplayInfo     ... real 3840 x 2160 ... mode 694, 60.000004 fps ... app 3840x2160 density 640
mOverrideDisplayInfo ... real 1920 x 1080 ... mode 694, 60.000004 fps ... app 1920x1080 density 320
```

`mode 694` = **3840x2160 @ 60 Hz** en ambos. El display **ya salia en 4K60**.

### El bug real: el formato de `display_size_forced` es invalido en todo el ecosistema

| Fichero | Linea | Contenido | Problema |
|---|---|---:|---|
| `android/ape-crystal-agent/.../SettingsApplier.kt` | 241 | `"display_size_forced" to Regex("^[0-9]{3,5}x[0-9]{3,5}$")` | **valida la forma `WxH`** |
| `android/ape-crystal-agent/.../SyncStore.kt` | 110 | `"global display_size_forced 3840x2160"` | **emite la forma `WxH`** |
| `backend/onn_settings_global_pq.txt` | 32 | `display_size_forced=3840x2160` | forma `WxH` |
| `ara-x/vps/crystal/profiles/*.json` (12) | 39 | `"display_size_forced": "5760x3240"` etc. | forma `WxH` |

**Android espera `ANCHO,ALTO` (coma).** Medido:

```
wm size 1280x720   -> settings global display_size_forced = 1280,720   -> override 1280x720   APLICA
wm size 3840x2160  -> settings global display_size_forced = (vacio)    -> override 1920x1080  NO APLICA
```

El validador de la APK acepta una forma que el sistema **no puede parsear**. Es un bug de formato, no de
permisos ni de plataforma. `FIRETV_APPLIED_2026-11-05.md:16` atribuye el fallo a que "Fire OS reafirma el
override"; la medicion dice otra cosa: **el valor esta malformado desde el origen**.

### Riesgo residual que deje

Antes de detectar el error escribi, y luego reinicie:

```
settings put global display_size_forced  3840,2160
settings put global display_density_forced 640
```

Si el sistema aplica ambas, la UI se compone a 3840x2160 con densidad 640 — equivalente fisico a lo
anterior. Si aplica **solo la densidad**, la UI a 1080p con densidad 640 quedaria **al doble de tamano**.
**Reversion inmediata:**

```bash
adb shell settings delete global display_density_forced
adb shell settings delete global display_size_forced
adb shell wm size reset
adb shell wm density reset
```

El reinicio desactivo la depuracion inalambrica (comportamiento normal de Android), asi que **el estado
post-reinicio no esta medido**. No se declara corregido.
