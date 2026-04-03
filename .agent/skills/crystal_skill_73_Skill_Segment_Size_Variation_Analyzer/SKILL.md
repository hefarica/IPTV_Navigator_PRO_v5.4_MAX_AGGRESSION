---
name: Skill_Segment_Size_Variation_Analyzer
description: Inspector de fluctuaciones en m3u8 para inferir VBR vs CBR reales. Averigua las explosiones de bitrate.
category: M3U8 Parser
---
# 1. Teoría de Compresión y Anomalía
Los CDNs engañan con metadatos como `BANDWIDTH=1500000` en el tag `#EXT-X-STREAM-INF`. Si el stream es VBR (Variable Bit Rate), el tamaño *real* del archivo `.ts` número 45 puede ser de 1 MB (al apuntar el campo vacío de gol) y el número 46 puede ser 25 MB (confeti y luces estroboscópicas sobre la tribuna). Si ExoPlayer no sabe de esta expansión, tira un Buffer Underflow.

# 2. Directiva de Ejecución (Código / Inyección)
Lee los bytes exactos vía cabecera HEAD o audita los picos históricos y obliga al Manifiesto a informar la verdad a través del tag ISO `AVERAGE-BANDWIDTH`.

```javascript
/* M3U8 Injection BWD: */
`#EXT-X-STREAM-INF:BANDWIDTH=${peakBps},AVERAGE-BANDWIDTH=${avgBps}\n`
```

# 3. Flanco de Orquestación
ExoPlayer de Shield TV es inteligente solo si no le mientes. Al agregar la variable AVERAGE y el PEAK BW al M3U8 en `resolve_quality`, el hardware pre-calcula (usando su Network Buffer God-Tier) si la red puede sobrevivir a un pico VBR. Si Exo ve que el Peak VBR va a quemar la red en 10 segundos (gracias al analyzer), pide los `moof` del confeti con muchísima anticipación para guardarlos en RAM.
