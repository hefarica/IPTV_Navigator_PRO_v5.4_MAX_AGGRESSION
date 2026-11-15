# VPP / SoC — LEVERS REALES Y EFECTO MEDIDO (2026-11-14)

**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t56
**Device:** ONN 4K Streaming Box (Amlogic, `ro.build.reference.fingerprint=Amlogic/oppen_wv4/oppen_wv4:14/...`) · `192.168.1.3:5555`
**Regla respetada:** solo lectura + **un** cambio de estado intentado (`wm size reset`), con rollback anotado. **Sin root. Sin consumir el slot del proveedor. Sin degradar.**

---

## 0. RESUMEN EJECUTIVO — lo que hay que saber

1. **Los levers de VPP/AI-PQ que la SOP certificada del ONN da por hechos NO EXISTEN en este firmware.** `aipq_enable`, `aisr_enable`, `ai_pq_mode`, `ai_sr_mode`, `ai_pic_mode`, `ai_sr_level` → **`null` en los tres namespaces** (`system`, `global`, `secure`). Tambien `always_hdr`, `hdr_output_type` y `match_content_frame_rate` → `null`.
2. **La superficie real del VPP Amlogic (`/sys/class/amvecm`) existe pero es `Permission denied` para shell.** Sin root **no hay ningun nodo de PQ/CM accesible**. Traduccion: **por adb sin root no se puede tocar el VPP**.
3. **El override de composicion a 1920x1080 NO se puede quitar** con `wm size reset`: no dio error y **no cambio nada** (las dos capturas salen con el **mismo sha256**). Confirma empiricamente lo que el capitan afirmaba.
4. **El pipeline SI es HDR-capable**: el sink anuncia **PQ (ST 2084) y HLG**, la pantalla declara `hdrTypes=[2,3,4]` y **1000 nits**, y el enlace HDMI esta en **`420,10bit`**. Lo que falta no es capacidad.
5. **CORRECCION IMPORTANTE al dato del brief:** el `dataspace=UNKNOWN` / `hdr metadata types=0` se midio **sin reproduccion activa** (`media_session active=false`, `mCurrentFocus=null`). En ese estado es **lo esperado** y **no demuestra** que el HDR no llegue al panel durante la reproduccion. Se explica en §4.
6. `hdr_conversion_mode` **no es `null`: vale `1`** = **PASSTHROUGH** (el valor honesto). La SOP recomienda `3` = **forzar SDR→HDR = HDR falso**, que la ley del repo prohibe. **No se aplico.**

---

## 1. LEVERS: LO QUE ESTE SoC EXPONE SIN ROOT

Leyenda: **ACC** = accesible sin root · **OBS** = existe pero solo lectura · **NO** = no existe / sin permisos.

| # | Lever | Namespace | Valor medido | Valores posibles (observados) | ACC | ¿OTT lo aprovecha? |
|---|---|---|---|---|---|---|
| 1 | `display_mode_hdr` | global | **1** | 0/1 | ACC (escritura) | **Si** — es politica de sistema; afecta a todo el display |
| 2 | `display_mode_resolution` | global | **2160** | 1080/2160 | ACC | **Si** (sistema) |
| 3 | `display_mode_refresh_rate` | global | **60** | 50/60 | ACC | **Si** (sistema) |
| 4 | `user_preferred_resolution_width` | global | **3840** | — | ACC | **Si** (sistema) |
| 5 | `user_preferred_resolution_height` | global | **2160** | — | ACC | **Si** (sistema) |
| 6 | `user_preferred_refresh_rate` | global | **60.000004** | — | ACC | **Si** (sistema) |
| 7 | `hdr_conversion_mode` | global | **1 (PASSTHROUGH)** | 0=UNKNOWN,1=PASSTHROUGH,2=SYSTEM,3=FORCE | ACC | **Si** (sistema). **3 = HDR falso: prohibido** |
| 8 | `hdr_force_conversion_type` | global | **-1 (off)** | -1 / 4 | ACC | Si (sistema) |
| 9 | `display_color_mode` | secure | **1** | 0/1/3 segun build | ACC (secure) | Si (sistema) |
| 10 | `are_user_disabled_hdr_formats_allowed` | global | **1** | 0/1 | ACC | Si (sistema) |
| 11 | `user_disabled_hdr_formats` | global | **(vacio)** | lista | ACC | Si (sistema) |
| 12 | `aipq_enable` / `aisr_enable` / `ai_pq_mode` / `ai_sr_mode` | system **y** global | **`null` (los 4)** | — | **NO existen** | **NO** — no hay AI-PQ que aprovechar |
| 13 | `ai_pic_mode` / `ai_sr_level` | global | **`null`** | — | **NO existen** | **NO** |
| 14 | `always_hdr` | global | **`null`** | — | **NO existe** | **NO** |
| 15 | `hdr_output_type` | global | **`null`** | — | **NO existe** | **NO** |
| 16 | `match_content_frame_rate` | global | **`null`** (sin definir) | 0/1 | ACC (escritura posible, **efecto NO verificado**) | **Pendiente de medir** (§3.3) |
| 17 | `/sys/class/amvecm/*` (PQ/CM del VPP Amlogic) | sysfs | **`Permission denied`** | — | **NO (root-only)** | Es el VPP real, **inalcanzable sin root** |
| 18 | `/sys/class/amhdmitx/amhdmitx0/attr` | sysfs | **`420,10bit`** | — | OBS (lectura) | Es el enlace, no un control |
| 19 | `/sys/class/amhdmitx/amhdmitx0/hdr_cap` | sysfs | **PQ=1, HLG=1, HDR10+=1, SDR=1** | — | OBS | Capacidad del sink |
| 20 | `/sys/class/amhdmitx/amhdmitx0/dv_cap` | sysfs | **Dolby Vision: NO** | — | OBS | — |

**Conclusion de §1:** el unico bloque de levers **realmente disponible sin root** es el de **politica de display** (filas 1-11), que es **SO**, no VPP. **No hay ni un solo control de VPP/AI-PQ escribible sin root en este firmware.** Los 8 levers que la SOP certificada manda aplicar **no existen aqui** (firmware `oppen_wv4` Android 14, no el DroidLogic TV 12 de la SOP).

---

## 2. EFECTO MEDIDO — QUE SE MIDIO Y QUE CAMBIO

### 2.1 Lo unico que se intento cambiar: el override de composicion

| Paso | Comando | Antes | Despues | Cambio real |
|---|---|---|---|---|
| Quitar Override FHD | `adb shell wm size reset` | `Override size: 1920x1080` | **`Override size: 1920x1080`** | **NINGUNO** |
| Captura previa | `screencap` | `01_before_wm1080.png` sha256 `82825933c30acb694af109f9f8d1362658e279091e9d786c2571c0d11dafc66a` | — | — |
| Captura posterior | `screencap` | — | `02_after_wm_reset.png` **mismo sha256** | **Identicas byte a byte** |

**Resultado:** `wm size reset` **no devuelve ni error ni efecto**. El WM sigue componiendo a 1920x1080 sobre panel 4K.
**Origen del override: NO COMPUTADO.** `settings get global display_size_forced` devuelve **vacio**, asi que el override **no** viene de ese ajuste; `dumpsys window displays` sigue mostrando `base=1920x1080 320dpi ... rng=1080x1080-1920x1920`. Apunta a mecanismo de vendor (necesita inspeccion con root o del proveedor del overlay).

### 2.2 Lo que NO se puede medir aqui (y por que) — importante

| Medicion | Por que NO se puede |
|---|---|
| **Efecto del VPP en los pixeles** (sharpness, denoise, contraste, AI-SR) | Dos razones independientes: (a) `/sys/class/amvecm` es **root-only**, no hay nodo que leer ni escribir; (b) **`screencap` captura el buffer de composicion de Android, ANTES del post-proceso VPP y ANTES de la salida HDMI** → una captura **nunca** mostraria el efecto del VPP. Comparar capturas para "demostrar" VPP seria un falso positivo garantizado |
| **Efecto de `match_content_frame_rate`** | Requiere contenido reproduciendo para ver el cambio de modo (25p→50Hz, etc.). **Sin reproduccion no hay recibo** → quedaria en DECLARED, no APPLIED (§3.3) |
| **HDR real extremo a extremo** | Requiere un stream HDR reproduciendo + lectura de `dataspace` en ese momento (§4) |

**Propuesta de medicion que SI se puede hacer (no ejecutada):** capturador HDMI externo en la salida del ONN (o un analizador de señal) comparando el fotograma con el VPP ON/OFF. Todo lo demas es fe.

---

## 3. ESTADO DEL PIPELINE (datos duros de esta sesion)

### 3.1 Panel / enlace — capacidad confirmada

```
/sys/class/amhdmitx/amhdmitx0/attr = 420,10bit
hdr_cap: HDR10Plus Supported: 1 · HDR Static Metadata: Supported
         EOTF: SDR:1  Traditional HDR:0  SMPTE ST 2084 (PQ): 1  HLG: 1  SMD type1: 1
dv_cap = The Rx don't support DolbyVision
edid_parsing = ok
DisplayDeviceInfo: 3840 x 2160, modeId 165, renderFrameRate 59.94006, colorMode 0,
  hdrCapabilities{mSupportedHdrTypes=[2,3,4], mMaxLuminance=1000.0, mMaxAverageLuminance=1000.0}
mActiveModeId=165 · supportedColorModes [0] (solo NATIVE)
```

**Lectura:** el panel **si** acepta **PQ + HLG + HDR10+** y el enlace esta en **10 bits**. `Traditional HDR: 0` es normal en EDIDs modernos (describen HDR via ST 2084/HLG, no via "traditional HDR").

### 3.2 Politica de HDR del sistema

```
nrdp_platform_capabilities = {"vp9Disabled":"false","hdrOutputType":"playback","minVideoFramesForPlaybackStart":"11"}
hdr_conversion_mode = 1   (PASSTHROUGH)
hdr_force_conversion_type = -1   (off)
display_mode_hdr = 1
```

**Lectura:** Google TV declara **`hdrOutputType: playback`** → el HDR **solo se activa durante una sesion de reproduccion**. Es la pieza que explica §4.

### 3.3 `match_content_frame_rate`

`null` → **sin definir**. Es el unico lever candidato a mejorar **fluidez** (judder) sin degradar nada: haria que 25p se muestre a 50Hz y 24p a … sin recortar fps ni bitrate. **NO se aplico**: sin reproduccion activa no habria recibo, y aplicar un cambio no verificable es exactamente lo que la doctrina prohibe.
**Experimento propuesto (con el operador delante):** reproducir un canal 25p → `dumpsys display | grep mActiveModeId` antes/despues de `settings put global match_content_frame_rate 1`; si el modo cambia a 50Hz, es **APPLIED** con recibo; si no cambia, es **DECLARED** y se revierte con `settings delete global match_content_frame_rate`.

---

## 4. LA PREGUNTA QUE IMPORTA: ¿EL HDR LLEGA AL PANEL?

### 4.1 Lo que el brief afirma y lo que yo he medido

El brief da como **dato duro**: `SurfaceFlinger: dataspace=UNKNOWN (0)`, `hdr metadata types=0`.

**Yo lo reproduje — y ademas medi las condiciones:** en el momento de la medicion **no habia reproduccion** (`dumpsys media_session` → `active=false`; solo errores de audio Bluetooth) y **`mCurrentFocus=null`** (nada en primer plano).

| Estado | `dataspace` de las capas | `hdr metadata types` |
|---|---|---|
| **Idle (nada reproduciendo)** | `UNKNOWN (0)` en **todas** las capas | `0` |
| **Reproduciendo HDR** | **NO MEDIDO** (ver §4.3) | **NO MEDIDO** |

**Consecuencia honesta:** `dataspace=UNKNOWN` **en reposo es el estado esperado**. Con `hdrOutputType=playback`, el HDR esta **desactivado por politica** mientras no hay sesion de reproduccion. Por tanto **ese dato, por si solo, NO demuestra que el HDR no llegue al panel**: demuestra que **estaba apagado en ese instante porque no habia nada que mostrar**. Convertirlo en "el HDR no llega" seria leer una etiqueta como si fuera otra cosa.

### 4.2 Que falta para que el SoC declare PQ / BT.2020 (cadena completa)

Para que aparezca `dataspace` HDR en SurfaceFlinger y metadata HDR en el HDMI, hacen falta **cinco** eslabones. Estado de cada uno:

| # | Eslabon | Estado medido |
|---|---|---|
| 1 | **Panel/sink acepta HDR** | **CUMPLE** — PQ=1, HLG=1, HDR10+=1, 1000 nits (`hdr_cap`, `hdrTypes=[2,3,4]`) |
| 2 | **Enlace HDMI con profundidad** | **CUMPLE** — `420,10bit` |
| 3 | **Politica del SO permite HDR** | **CUMPLE con condicion** — `display_mode_hdr=1`, `hdr_conversion_mode=1` (passthrough), pero `hdrOutputType=playback` ⇒ **solo en reproduccion** |
| 4 | **Fuente realmente HDR** (PQ/HLG, 10-bit) | **NO COMPUTADO** — no habia reproduccion; no se consumio el slot del proveedor para averiguarlo |
| 5 | **El reproductor pide salida HDR** (MediaCodec con transfer ST2084 + `HDR_STATIC_INFO`, capa con dataspace BT2020_PQ) | **NO COMPUTADO** — depende de OTT Navigator y del stream; no medido |

**Respuesta:** no falta hardware ni permisos: falta **contenido HDR + que el reproductor pida HDR**. Los eslabones 4 y 5 son los unicos sin verificar, y son **exactamente los que no puedo probar sin reproducir**. Si OTT Navigator decodifica un stream HDR **sin** pedir salida HDR (lo mas comun en players que configuran el decoder en SDR), el resultado es justo lo que se ve: **todo UNKNOWN y HDMI en SDR dentro de un contenedor de 10 bits**.

**Aviso sobre el atajo que NO hay que tomar:** forzar `hdr_conversion_mode=3` + `always_hdr=1` (lo que recomienda la SOP) haria **aparecer** HDR en el OSD **sin que el contenido lo sea**: **HDR falso**, prohibido por `docs/policies`/AGENTS.md. Ese atajo produciria un "HDR ON" cosmetico y una imagen peor (color shift, negros lavados). **No se aplico.**

### 4.3 Como se cierra la medicion (sin consumir el slot del proveedor)

1. Reproducir **un archivo HDR local** en OTT (fichero propio en el dispositivo, no un canal del proveedor) → **no consume slot**.
2. Con la reproduccion activa: `dumpsys SurfaceFlinger | grep -E 'dataspace|hdr metadata'` y `cat /sys/class/amhdmitx/amhdmitx0/attr`.
3. **Exito = `dataspace` BT2020_PQ (o HLG) en la capa de video y metadata HDR≠0.** Cualquier otra cosa es SDR con etiqueta.
4. Si sale SDR con fuente HDR: el culpable esta en el **eslabon 5** (OTT/decoder), no en el SoC.

---

## 5. SEPARACION DE RESPONSABILIDADES (que es de quien)

| Capa | Que controla aqui | Quien manda | Evidencia |
|---|---|---|---|
| **SO / politica de display** | modo (3840x2160@59.94), `display_mode_hdr`, `hdr_conversion_mode`, `colorMode`, **tamano de composicion (override 1080p)**, `hdrOutputType=playback` | Android TV (`system_server`, `SurfaceFlinger`) | §3.1-3.2, §2.1 |
| **Reproductor (OTT Navigator)** | que variante pide, con que `MediaCodec` configura el decoder, **si pide salida HDR o SDR**, fps real del stream | OTT + el manifest servido | **NO COMPUTADO** (§4.2, 4-5) |
| **VPP / SoC** | sharpness, NR, contraste, AI-SR, tone mapping de hardware | **`/sys/class/amvecm` = root-only** | §2.2 |
| **No es de nadie de los tres** | El logo "4K" que se propuso en t49 | — | ver §6 |

### 5.1 Aviso que hay que repetir (hallazgo de t49)

**El WM compone a 1920x1080** (`base=1920x1080`, `rng=1080x1080-1920x1920`) sobre un panel 3840x2160, y **`wm size reset` no lo revierte** (§2.1). Por tanto:

> **Un logo que diga "4K" sobre esta superficie MIENTE.** No se repite ese error: cualquier indicador debe decir la verdad (`1080p compuesto` / `4K no aplicado`) o no mostrarse. Medir la calidad de la senal empieza por no mentir sobre lo que ya se sabe.

---

## 6. LO QUE NO SE PUEDE MEDIR DESDE AQUI (lista honesta)

| Item | Razon exacta | Que haria falta |
|---|---|---|
| Efecto del VPP en pixeles | `/sys/class/amvecm` root-only **y** `screencap` no captura post-proceso VPP/HDMI | capturador HDMI externo + fotograma patron |
| AI-PQ / AI-SR reales | **no existen** los settings en este firmware (§1) | otro firmware o control por vendor (root) |
| HDR extremo a extremo | sin reproduccion; `dataspace` idle no prueba nada (§4.1) | archivo HDR local + lectura en reproduccion |
| Si OTT pide HDR | no medido; depende del decoder del player | logcat de MediaCodec + dataspace en reproduccion |
| Quitar el override 1080p | `wm size reset` sin efecto; `display_size_forced` vacio | mecanismo de vendor / root |
| Fluidez (`match_content_frame_rate`) | sin reproduccion no hay recibo del cambio de modo | prueba con el operador delante (§3.3) |

---

## 7. ROLLBACK Y ESTADO DEL DEVICE

| Accion | Efecto | Rollback |
|---|---|---|
| `wm size reset` (unico cambio intentado) | **NINGUNO** (verificado: `Override size` sigue 1920x1080 y capturas byte-identicas) | `adb shell wm size 1920x1080` (no necesario: nada cambio) |
| Lecturas (`settings get`, `getprop`, `cat /sys`, `dumpsys`, `screencap`) | ninguno | n/a |
| `settings put` | **CERO ejecutados** | n/a |
| Cambios de resolucion/color/HDR | **CERO** (no se degrado nada) | n/a |

**Estado final:** `wm size` = Physical 3840x2160 / Override 1920x1080 · `mActiveModeId=165` · `hdr_conversion_mode=1` · HDMI `420,10bit`. **Igual que al empezar, salvo que ahora esta documentado con nombre y apellido.**

*Medido el 2026-11-14 sobre ONN 4K en 192.168.1.3:5555. Sin root. Sin instalaciones. Sin tocar el proveedor. Evidencia cruda en `scratch\t56_vpp_20261114\`.*
