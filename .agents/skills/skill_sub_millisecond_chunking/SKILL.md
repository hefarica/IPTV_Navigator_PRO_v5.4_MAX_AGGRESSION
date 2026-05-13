---
name: Skill_Sub_Millisecond_Chunking
description: Fragmentación Cuántica Sub-Milisegundo para Live Streams (Zero Latency Extractor).
category: FFmpeg Muxer
---
# 1. Teoría de Compresión y Anomalía
El gran estrangulador en deportes en vivo a máxima tasa de bits (300 Mbps peak) es el "Burst Bloat" inducido por el agrupamiento de chunks. Si el generador M3U8 emite fragmentos de gran duración (ej. 10s) y el multiplexor no divide el flujo interno en mini-clusters, el Buffer Masivo God-Tier (X-Network-Caching) se llena irregularmente provocando macroblocking.

# 2. Directiva de Ejecución (Código / Inyección)
Se debe comandar a FFmpeg a dividir agresivamente el segmento interno del flujo utilizando la flag paralela de keyframes. A diferencia de un chunk HTTP, un chunk fMP4 sub-milisegundo es entregado a disco/RAM tan rápido como es transcodificado:

```bash
# Requisición a Fragmentador:
-f ismv -movflags +faststart+frag_keyframe+min_frag_duration:500000
```
La duración `min_frag_duration` está en microsegundos y se acopla a la bandera `-chunk_duration`.

# 3. Flanco de Orquestación
En la **Doctrina del Cristal Roto**, ExoPlayer suele "vomitar" el cache si la varianza intratemporal excede el 15%. Al mantener un sub-milisegundo constante, el decoder por Hardware jamás se congela o experimenta inanición de cuadros.
