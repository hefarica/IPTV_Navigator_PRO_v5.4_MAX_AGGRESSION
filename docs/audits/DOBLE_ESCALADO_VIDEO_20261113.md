# EL VÍDEO SE ESCALA DOS VECES — causa medida de la pérdida de nitidez · 2026-11-13

**Instrumento correcto, por fin.** No el vídeo del teléfono (1,38 Mbps de WhatsApp contamina la medición), sino **SurfaceFlinger del propio aparato**: la geometría real de la capa de vídeo.

---

## 1 · La medición

```
Layer (BLAST) SurfaceView[studio.scillarium.ottnavigator/.PlayerActivity]
  geomBufferSize      = 1280 x 720      ← el vídeo que se decodifica
  geomLayerTransform  = SCALE 1.5000    ← el compositor lo escala ×1,5
  geomLayerBounds     = 1280 x 720
  geomContentCrop     = 1280 x 720
  composition type    = DEVICE (2)
```

Y el display:

```
mBaseDisplayInfo     real: 3840x2160    ← el panel es 4K
mOverrideDisplayInfo real: 1920x1080    ← la composición es 1080p
mActiveModeId        = 123              ← 3840x2160 @ 59.94
DisplayFrames        w=1920 h=1080
```

## 2 · La cadena real de escalado

```
720p (1280x720)
   │  ×1,5  — compositor de SurfaceFlinger   ← NO ENTERO
   ▼
1080p (1920x1080)
   │  ×2,0  — escalador del panel / HWC
   ▼
4K (3840x2160)
```

**Dos interpolaciones encadenadas, la primera no entera.**

Si el override no existiera, la cadena sería **una sola**:

```
720p  ──×3,0 (entero)──▶  4K
```

**`×1,5` es el peor multiplicador posible para 1280→1920:** cada píxel de origen tiene que repartirse entre 1,5 píxeles de destino, así que el compositor mezcla vecinos. Se pierde el borde real de cada píxel y los degradados se suavizan en bandas anchas — **exactamente el síntoma del césped**.

`×3,0` es entero: cada píxel de origen cae en una rejilla exacta de 3×3. Sin mezcla lateral.

## 3 · Qué NO sé, y no voy a fingir

| Pregunta | Estado |
|---|---|
| ¿El override afecta al vídeo o sólo a la UI? | **MEDIDO: afecta al vídeo.** El `geomLayerTransform` de la capa de vídeo es 1,5, no 1,0. |
| ¿Quién puso el override? | **NO COMPUTADO.** `wm size reset` y `wm size 3840x2160` devuelven `rc=0` sin cambiarlo; `display_size_forced` no lo gobierna; `persist.sys.display.resolution` está vacío. |
| ¿Lo puse yo? | **NO SE PUEDE DESCARTAR.** En esta sesión ejecuté pruebas con `wm size`. Uptime = 110,7 h, así que el aparato no se reinició: el override puede ser de antes o de esta sesión. Lo declaro. |
| ¿Sobrevive a un reinicio? | **NO MEDIDO.** Determinaría si es firmware o estado de runtime. |

## 4 · Lo que hay que hacer, y quién puede

**No se puede desde adb.** Los tres mecanismos probados fallan con `rc=0` y sin efecto:
`wm size reset`, `wm size 3840x2160`, `settings put global display_size_forced 3840x2160`.
(Este último lo escribí yo probando y **lo borré**: `display_size_forced = null`.)

**Caminos, en orden de menor a mayor invasividad:**

1. **Ajustes del ONN → Pantalla y sonido → Resolución.** Si dice 1080p, subirla a 4K. Es un toque y es el camino correcto.
2. **Reiniciar el aparato.** Si el override es estado de runtime, se va. Si sobrevive, es del firmware.
3. Si sobrevive al reinicio: es una decisión del firmware y habría que ver si el ONN expone un ajuste de "resolución de la interfaz".

**Nota honesta sobre si conviene quitarlo:** un override a 1080p aligera la GPU y puede mejorar la fluidez del *menú*. Pero para el **vídeo** es degradación pura: fuerza el doble escalado. La Ley Anti-Degradación del repo no admite discusión aquí — `4K → FHD` está en la lista de prohibiciones, y esto es exactamente eso.

## 5 · Y esto explica por qué nada de lo anterior mejoraba la imagen

Durante toda la sesión perseguí la cadencia, el VPP, el `SOURCE=` del 6K y la cadena de filtros. **Ninguno de esos toca el punto donde se pierde la nitidez**, que está en el compositor, antes de que el panel reciba la imagen.

- La **cadencia** es temporal (judder). Los artefactos son espaciales. **Ya lo había falsado.**
- El **VPP** actúa sobre el fotograma ya decodificado, **después** del compositor.
- El `SOURCE=` del 6K es **metadata**: describe, no escala.
- Los **`video-filter`** de la lista no los aplica OTT.

**El único punto que sí manda sobre la nitidez es el escalado del compositor, y estaba en ×1,5.**

## 6 · Reproducible

```bash
adb -s 192.168.1.3:34813 shell 'wm size'                     # Physical 4K / Override 1080p
adb -s 192.168.1.3:34813 shell 'dumpsys display | grep -oE "mActiveModeId=[0-9]+"'
adb -s 192.168.1.3:34813 shell 'dumpsys SurfaceFlinger | grep -A12 "SurfaceView\[studio.scillarium"'
#   -> geomBufferSize = 1280x720 · geomLayerTransform = SCALE 1.5000
```
