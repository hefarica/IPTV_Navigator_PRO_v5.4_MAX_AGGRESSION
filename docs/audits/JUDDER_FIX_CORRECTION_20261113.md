# Corrección: el arreglo del judder NO es limpiar el modo preferido · 2026-11-13

**Este documento corrige lo que dije hace una ronda.** Dije que bastaba con `cmd display clear-user-preferred-display-mode`. Es **falso**, y aquí está por qué.

## Por qué el arreglo que di no funciona

```
ro.surface_flinger.enable_frame_rate_override  =  false     ← read-only, fijada al arrancar
frameRateOverrideConfig                        =  Disabled
FrameRateOverrides                             =  none
mDefaultModeId                                 =  124       ← 3840x2160 @ 60.000004
```

Tres hechos que juntos lo invalidan:

1. **El mecanismo de emparejamiento está deshabilitado en el firmware.** `ro.` significa solo lectura: no se cambia en ejecución. El ajuste `get-match-content-frame-rate-pref -> 2 (ALWAYS)` **es decorativo en esta caja**.
2. **El modo por defecto también es 60 Hz** (`mDefaultModeId=124`). Limpiar la preferencia del usuario haría caer al defecto: **el mismo 60 Hz**. No cambiaría nada.
3. La app **no señala** cadencia (`FrameRateOverrides=none`), así que aunque el mecanismo estuviera activo no habría nada que emparejar.

## Lo que sí funciona, y por qué

**Fijar el modo a 50 Hz**, con el modo que el panel ya tiene (`{id=125, 3840x2160, fps=50.0}`):

```
adb -s 192.168.1.3:34813 shell cmd display set-user-preferred-display-mode 3840 2160 50.0
```

Y la razón es aritmética de cadencia:

| Contenido | En 60 Hz | En 50 Hz |
|---|---|---|
| **25 fps** | 60/25 = **2,4** → unos fotogramas 2 refrescos, otros 3 → **judder** | 50/25 = **2,0** → cada fotograma exactamente 2 veces → **perfecto** |
| **50 fps** | 60/50 = **1,2** → irregular → **judder** | 50/50 = **1,0** → 1:1 → **perfecto** |
| 60 fps | 1:1 perfecto | 60/50 = 1,2 → judder |
| 23,976 | 2,5 → judder | no divide → peor |

## Y el catálogo es abrumadoramente 25 fps

Medido en la muestra auditada:

```
fps=25   x6
fps=60   x1
```

**6 de 7 canales a 25 fps.** A 50 Hz pasarían de judder a **2:2 exacto**. El precio es que el único canal de 60 fps y los de 23,976 sufrirían.

## Lo que esto revela, y es lo importante

El dispositivo **no puede** adaptar la cadencia solo: el mecanismo está apagado en firmware y es de solo lectura.

**Por tanto la adaptación tiene que hacerla el software que controla la sesión.** Y el §5 del mandato pide exactamente eso:

> *«Preserva el FPS de origen y sus fracciones reales. No cambies automáticamente 59,94, 50, 29,97 o 23,976 por 30.»*

**La APK ya conoce el fps del canal** (lo lee del manifiesto, y el sistema lo reporta como `framerate-content`). Lo que falta es que **fije el modo de pantalla a la cadencia del contenido al iniciar cada canal** — porque Android en esta caja no lo va a hacer.

### Propuesta concreta para la APK

```
al abrir un canal:
  fps = cadencia del contenido (del manifiesto o del decoder)
  modo = el 3840x2160/1920x1080 cuyo fps divida EXACTAMENTE a fps
  25  -> 50 Hz (2:2)        |  50 -> 50 Hz (1:1)
  30  -> 60 Hz (2:2)        |  60 -> 60 Hz (1:1)
  23,976 -> 23,976 Hz       |  24 -> 24 Hz
  si no hay modo exacto: dejar el actual y registrar fallback_reason
  al salir: restaurar el modo del sistema
```

Es reversible, es por canal, y el modo ya existe en la tabla de `supportedModes` de este panel: los 16 modos están ahí.

**No propuesto como cambio unilateral:** es una decisión de producto sobre el APK, y toca configuración del dispositivo del usuario.

## Estado

- **El judder está medido:** 98,1–99,8 % de fotogramas, con el sistema en marcha y el operador mirando.
- **La causa está identificada:** mecanismo de emparejamiento deshabilitado en firmware (`ro.* = false`) + modo forzado a 60 Hz + contenido a 25/50 fps.
- **El arreglo manual está listo** y es de una línea.
- **El arreglo automático es trabajo de la APK**, no del sistema operativo.
- **Nada ejecutado.** El dispositivo del operador no se ha tocado.
