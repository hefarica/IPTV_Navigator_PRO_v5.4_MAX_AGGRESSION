---
name: Skill_VLCOpt_Video_Visual_Full_Range
description: Implementación satelital y asíncrona de `#EXTVLCOPT:video-visual=full-range` para el M3U8.
category: M3U8 Generator
---
# 1. Teoría de Compresión y Anomalía
Replicando la intención detrás de FFmpeg Color Range Full, el problema del velo grisáceo azota la QoE de los perfiles deportivos Premium. Cuando el decodificador ExoPlayer o VLC delegan a MediaCodec en equipos de gama media, el equipo asume señal YUV "Limited Range", incluso si el VPS ha intentado enviar la instrucción en banda (Pudo haber dropes L7).

# 2. Directiva de Ejecución (Código / Inyección)
Se obliga a que la directriz aparezca textualmente en la cascada de tags del canal en los sistemas generadores.

```javascript
/* M3U8 Generator Pipeline Injection: */
`#EXTVLCOPT:video-visual=full-range\n`
/* En combinación con las reglas de VLC chroma_I444 y network-caching masivo */
```

# 3. Flanco de Orquestación
Esta directriz es redundante pero obligatoria ("Seguro anti fallos" / The Broken Glass Doctrine); si falla la cabecera L7 del VPS (PHP), o FFmpeg deshecha el VUI, el cliente, como tonto obediente, forzará la pantalla Luma a 0-255 porque la lista de reproducción así lo mandata ciegamente. 12-Bit HDR salvado en toda eventualidad.
