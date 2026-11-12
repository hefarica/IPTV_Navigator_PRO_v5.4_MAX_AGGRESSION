# Reproducción real medida en el ONN 4K con OTT Navigator · 2026-11-12

**Lo que es:** captura hecha **mientras el operador reproducía un canal** en `studio.scillarium.ottnavigator`. Todo lo de abajo sale del propio aparato por ADB, en solo lectura. Recibos: `docs/audits/PLAYBACK_SAMPLE_20261112T210123Z.json` y `…T210020Z.json`.

```
topResumedActivity = studio.scillarium.ottnavigator/.PlayerActivity
```

## Vídeo: lo que decodifica de verdad

```
mediametrics_codec_reported
  package_name: studio.scillarium.ottnavigator   package_version_code: 25110201
  codec: c2.amlogic.avc.decoder      mime: video/avc      mode: video
  width: 1920   height: 1080   rotation: 0   secure: -1   crypto: -1
  profile: 2    level: 32768
  latency_avg: 55628   latency_count: 1   lifetime_millis: 32000
```

| Dato | Valor medido |
|---|---|
| Códec | **H.264 / AVC por hardware de Amlogic** (`c2.amlogic.avc.decoder`) |
| Resolución de vídeo decodificada | **1920x1080** |
| Perfil | `profile:2` → AVC **Main** |
| Nivel | `level:32768` (0x8000) → **Level 5.1** |
| Descifrado | `secure:-1`, `crypto:-1` → **sin DRM** |
| Latencia del codec | 55.628 µs · **una sola muestra** (`latency_count:1`) |

**Estable en 6 de 6 muestras durante 20 s y 4 de 4 en otra ventana de 12 s**: mismo códec, misma resolución, sin cambio de variante. No hubo ABR moviéndose.

Y el propio codec lo dice en logcat:

```
E C2VdecCodecConfig: c2.amlogic.avc.decoder can support 4K
```

**El hardware puede 4K; el flujo que se está reproduciendo es 1080p AVC.** Son dos hechos distintos y no se confunden.

## Audio: decodificado en software

```
codec: c2.android.aac.decoder   mime: audio/mp4a-latm
channel_count: 2   sample_rate: 44100   latency_avg: 165143 µs (11 muestras)
```

**AAC estéreo 44,1 kHz, y el decodificador es `c2.android.*` — software, no el `c2.amlogic.*` de hardware.** Es un dato con consecuencias para §14 (audio): el aparato no está usando su ruta de audio por hardware para este flujo.

## Térmica: no sube con la reproducción

| Momento | soc_thermal |
|---|---|
| En Ajustes, sin reproducir | **63,7 °C** |
| Reproduciendo 30+ s | **63,7 °C** (idéntico en todas las muestras) |
| Segundo sensor | 52,5 °C → 59,7 °C |

`mHotThrottlingThresholds=[NaN, 65.0, 75.0, 95.0, 105.0, 120.0]` → **margen 1,3 °C**.

Reproducir AVC 1080p **no movió la aguja térmica**. El SoC ya está caliente de base, no por el player. Esto importa para el diseño de §5: el presupuesto térmico disponible para *cualquier* procesado extra es **1,3 °C**, no 30.

## La captura de pantalla: lo que dice y lo que NO dice

`screencap` devolvió un PNG de **1920x1080** con contenido **uniforme y oscuro** (10.610 B, sha256 `6988aff5…`).

Dos lecturas, y **no elijo una sin prueba**:

1. **`screencap` no captura el plano de vídeo por hardware** en muchos Android TV. Es una limitación conocida de la herramienta: la imagen puede estar perfectamente en el televisor y la captura salir negra. Si es así, no dice nada del vídeo.
2. **La salida es realmente negra.** Entonces sería un fallo de reproducción visible.

**No puedo distinguirlas desde ADB.** Solo el operador, mirando el televisor, resuelve esto. Se registra como pendiente, no como hallazgo.

Lo que **sí** establece la captura: **la superficie lógica es 1920x1080**, coherente con el `Override size: 1920x1080` del `wm size`. El override es real; la captura lo confirma.

## Una discrepancia que dejo sin resolver

`logcat` muestra, repetidamente:

```
mali_gralloc: am_gralloc_get_uvm_decoder_para: parameters:[slot_id=0,w*h(1024*576),...]
```

**1024x576** en los parámetros de buffer del decodificador, frente a **1920x1080** en el registro del codec. Posibilidades: buffers de otra sesión previa, un pool intermedio, o que el flujo real sea menor que lo reportado. **No lo resuelve una sola línea de log y no lo afirmo.**

## Lo que este recibo NO establece

- **Que la imagen se vea bien o mal.** Sin ojos en el panel ni captura fiable del plano de vídeo, la calidad visual sigue sin evaluar.
- **Frames perdidos.** OTT Navigator no expone contadores de dropped frames por ninguna vía que haya podido leer: no está en `media_session` (no registra sesión) ni en `media.metrics` (los campos `frame_rate`, `operating_rate` vienen a `-1`, no soportados por este codec).
- **HDR.** El flujo es AVC 1080p SDR; no hay nada HDR que evaluar en esta sesión.
- **De dónde sale el flujo.** No pude leer la URL: `/proc/net/tcp` no es legible y `netstats` solo dio el uid. **No sé si es una lista del VPS o va directo al proveedor.**
- **TiviMate.** No se probó.

## Retracción de método

Mi primera versión del muestreador habría reportado **«0 con reproducción activa»** con el televisor reproduciendo: detectaba únicamente por `media_session`, y **OTT Navigator no registra sesión de media** (`active=false` mientras decodifica). Corregido a detección por `PlayerActivity` + codec reportado.

Y el resumen de la primera corrida imprimió **«0 con reproducción activa» mientras sus propias 6 muestras decían `true(codec+activity)`**: contaba `-eq 'true'` sobre valores como `'true(codec+activity)'`. Corregido a `-like 'true*'` y verificado: **4 de 4**.

Dos fallos de la misma familia —una herramienta que se contradice con sus propios datos— en el mismo script.
