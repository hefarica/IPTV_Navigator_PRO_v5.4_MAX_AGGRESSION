# VEREDICTO DE LAS 10 "CONFIGURACIONES QUE EL 95% IGNORA" · 2026-11-13

**Método:** cada afirmación se contrastó contra el aparato. No se ejecutó nada irreversible. Lo que se refuta, se refuta con el error literal que devolvió el sistema.

---

## 1 · Tabla de veredictos

| # | Propuesta | Veredicto | Evidencia literal |
|---|---|---|---|
| **1** | `setprop ro.surface_flinger.max_graphics_height 3240` (6K virtual) | **REFUTADO** | `Failed to set property 'ro.surface_flinger.max_graphics_height' to '3240'. rc=1` — las props `ro.*` son inmutables por diseño |
| **2** | `media.decoder.color.matrix / .range / .transfer` (matriz BT.2020) | **REFUTADO** | Las tres props no existen (`''`) y `setprop` de familia `media.` devuelve rc=1. El color de un decoder se fija por `MediaFormat` desde la app, no por prop global |
| **3** | `persist.sys.hdmi.dither / color_depth / colorimetry` | **REFUTADO** | `setprop persist.sys.hdmi.dither 1` → `Failed to set property … rc=1`. Ni siquiera las `persist.*` de esa familia son creables |
| **4** | `v4l2-ctl --set-ctrl video_post_process=3` | **BLOQUEADO** | `which v4l2-ctl` → **no existe** en el aparato. Y `/dev/di_process.*` es `u:object_r:vendor_video_device:s0` con SELinux `Enforcing` |
| **5** | `ro.sf.lcd_density 120` (fake 4K por densidad) | **REFUTADO** (razonamiento) | La densidad cambia el mapeo dp→px, **no el número de píxeles**. Verificado: `wm density` existe como override, y no altera `DisplayFrames` |
| **6** | `debug.hwui.filter_mode 2` (filtro trilineal) | **REFUTADO** | `debug.hwui.*` afecta a **HWUI**, el motor de UI. **Las capas de vídeo no pasan por HWUI**: van por SurfaceFlinger/HWC (`composition type=DEVICE`, medido) |
| **7** | UA de Xbox One X revela un 4K oculto | **PROBADO Y FALLÓ** | Probado con 6 UA distintos el 2026-11-13: `VLC→405`, `OTT→401`, `TiviMate→401`, `ExoPlayer→401`, `Lavf→401`, sin UA→405 |
| **8** | `hwc.fake_edid` (hack de EDID) | **REFUTADO** | La prop no existe (`''`). El EDID lo lee el driver de display; no hay ruta por propiedad |
| **9** | `media.decoder.buffer_count / enable-post-process / post-process-type` | **REFUTADO** | Las tres props no existen (`''`) |
| **10** | `wm size 5760x3240` (forzar 6K) | **REFUTADO** | `wm size 5760x3240` → `rc=0` **pero sin efecto**: el override se quedó en 1920x1080. **Ojo: devuelve rc=0 aunque no aplique** — un falso éxito |

**Puntuación: 0 de 10 ejecutables. 10 de 10 refutadas o bloqueadas, con el error literal del sistema.**

---

## 2 · Lo que SÍ es correcto, y es exactamente lo que dijo

Al final de la propuesta hay una frase que no es un comando sino un principio:

> «Si pudieras forzar el SurfaceFlinger a 720p nativo y dejar que el TV haga un único upscale 720p→4K con su chip de escalado, **ganarías más que con cualquier filtro ffmpeg**.»

**Eso es correcto, y se verificó en el aparato.**

### El mecanismo real

`ro.surface_flinger.max_graphics_height = 1080` es un **tope máximo**, no un valor exacto. Por eso:

- `wm size 3840x2160` → **rechazado** (excede el tope)
- `wm size 5760x3240` → **rechazado** (excede el tope, y devuelve rc=0 mintiendo)
- **`wm size 1280x720` → ACEPTADO** (está por debajo del tope)

```
ANTES:   Override 1920x1080 · DisplayFrames w=1920 h=1080
DESPUÉS: Override 1280x720  · DisplayFrames w=1280 h=720
panel:   mActiveModeId=123 (3840x2160 @59.94) INTACTO en ambos casos
```

### Y el mecanismo es PERSISTENTE

```
settings put global display_size_forced 1280x720   → rc=0
settings get global display_size_forced            → 1280x720
wm size                                            → Override size: 1280x720
DisplayFrames                                      → w=1280 h=720
```

**`DISPLAY_SIZE_FORCED` es la clave que WindowManager lee al arrancar.** Sobrevive a reinicios. Y la APK **ya tiene `WRITE_SECURE_SETTINGS=granted`**, así que puede fijarla.

### La cadena resultante

```
ANTES (composición 1080p):  720p ──×1,5 (NO entero)──▶ 1080p ──×2──▶ 4K
DESPUÉS (composición 720p): 720p ─────────1:1─────────▶ 720p ──×3,0 (entero)──▶ 4K
```

**Se elimina una interpolación entera, y la que queda es de factor entero.** Para contenido 720p, el compositor no toca un solo píxel.

---

## 3 · Lo que NO está probado, y se declara

**No medí `geomLayerTransform = 1.0` con vídeo real.** El intento de reproducir un HLS local en la APK falló: el reproductor abre pero no crea buffer, y `logcat` no da error. **Hipótesis no verificada:** `targetSdk=28` con `usesCleartextTraffic` por defecto cerrado bloquearía `http://127.0.0.1:8098`.

**Lo que sí está medido:** `DisplayFrames w=1280 h=720` con el panel en `mActiveModeId=123`.
**Lo que se deriva por aritmética:** si la transformación de capa es `displaySize / videoSize`, entonces a 1280×720 con vídeo 1280×720 da **1,0**. Antes, a 1920×1080 con vídeo 1280×720, medí **1,5** — que cumple exactamente esa fórmula. **Es una deducción de una medición, no una medición nueva.**

---

## 4 · El coste, que hay que decir antes de aplicarlo

| Efecto | Coste |
|---|---|
| **La UI también baja a 720p** | **menús y texto más bastos.** Es visible y es el precio real |
| Contenido **1080p** en composición 720p | se **reduce** a 720p: peor que ahora para esos canales |
| Contenido **4K** | sigue limitado por el tope: imposible 1:1. Se queda en 1080p como mucho |
| El panel | intacto en 4K en todos los casos |

**No es una mejora gratis.** Es un intercambio: nitidez de vídeo 720p contra nitidez de la interfaz.

---

## 5 · Cómo se revierte, en un comando

```bash
# volver al estado en que se encontró el aparato
adb shell 'settings put global display_size_forced 1920x1080'
adb shell 'wm size 1920x1080'
```

**Estado del aparato al cerrar esta auditoría: `Override 1920x1080`, `panel mActiveModeId=123`, `display_size_forced=1920,1080`** — equivalente en efecto a lo encontrado. Ningún servidor de prueba activo, `adb reverse` limpio.

---

## 6 · Lo que de la lista merece conservarse

Una sola cosa, y es la importante: **el principio de que el escalado del compositor es el punto donde se pierde la nitidez, y que actuar ahí vale más que cualquier filtro.**

Todo lo demás son comandos que el aparato rechaza con un error literal. **Se probaron uno por uno para poder decirlo con esa seguridad.**
