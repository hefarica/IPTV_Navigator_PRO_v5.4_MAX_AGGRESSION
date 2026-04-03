---
name: Skill_Quantum_FFmpeg_022_B_Frame_Hierarchy_HEVC_Tier
description: Establecer `-b-intra 1 -b-adapt 2` obligando al Codec a usar referencias asimétricas B en jerarquías piramidales profundas.
category: Hardware Rate Optimization L2
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Cuando FFmpeg transcodifica HEVC L4, usa "B-frames" (Cuadros Bi-direccionales que ahorran muchísimo peso refiriéndose al futuro y al pasado L1). Pero si las configuraciones están en "Preset Medium" (Genérico y soso), FFmpeg no se atreve a arriesgar L7 y corta los B-Frames consecutivos. Pierdes el 30% del Ancho de Banda en redundancias inútiles. Al final la imagen L3 se ve aplastada (Luma lavado) porque te quedaste sin límite matemático.

# 2. Directiva de Ejecución Parámetrica (Código)
Explotación HEVC Tier B-Frames Asimétricos. Liberamos a FFmpeg del miedo L5 obligándolo a construir pirámides jerárquicas gigantes y tomarse su tiempo para deducir qué bloques borrar L2.
```bash
# Asintótica B-Pyramid Hierarchy L4 y B-Intra L7:
-x265-params bframes=8:b-adapt=2:b-pyramid=strict:b-intra=1:weightb=1
```

# 3. Flanco de Orquestación
Con The Broken Glass Doctrine L1: El partido viaja hiper comprimido en sus zonas estáticas (El pasto verde y el logo del Fox Sports quedan casi "Gratis" en tamaño de megabytes) L3. TODA la fuerza del Rate Control VBR de ExoPlayer en TiviMate se drena hacia las zonas imposibles (La piel del árbitro y el balón girando L5). Exprimimos calidad God-Tier usando exactamente el mismo Bitrate del servidor L4 que un competidor usaría para darte vómito pixelado L2. Matemática asimétrica L7 resuelta.
