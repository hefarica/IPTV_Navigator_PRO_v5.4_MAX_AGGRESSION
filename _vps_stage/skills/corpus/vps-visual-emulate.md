# Canary visual — orden de filtros

Cadena **obligatoria** (una sola pasada, sin transcode de producción):

```
deblock → dering → yuv444p → Lanczos(3840x2160) → grain → unsharp → eq → yuv420p
```

Notas de implementación:

- `deblock` y `dering` son las etapas de limpieza; en ffmpeg 6.1 Ubuntu **no existe el filtro
  `dering`**. El canary usa `smartblur` (edge-aware) como **sustituto declarado** de la etapa
  dering. No se oculta: el reporte lo registra como limitación. Si se exige el filtro literal,
  el canary debe declarar FAIL.
- `format=yuv444p` antes de escalar (Lanczos) y `format=yuv420p` al final.
- `grain` se implementa con `noise` (grano temporal), no con un filtro inventado.
- x265: `-preset ultrafast -tune zerolatency`, `pools=1:frame-threads=1`.
- HLS: `-hls_time 3 -hls_list_size 20 -hls_flags independent_segments+delete_segments`.
- Salida **5 fps muestreados** en el canary (no es un vivo 25/30 fps): a 40 % de CPU un 4K
  x265 realtime no es sostenible. Se declara como muestra, no como producción.
- 8K: **nunca** se emite 7680x4320; sólo presentación en el device.
