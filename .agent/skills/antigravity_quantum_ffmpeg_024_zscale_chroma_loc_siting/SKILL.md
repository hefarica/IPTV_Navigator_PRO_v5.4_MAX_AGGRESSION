---
name: Skill_Quantum_FFmpeg_024_Zscale_Chroma_Loc_Siting
description: Alinear explícitamente las muestras de Chroma 4:2:0 en top-left (`-chroma_sample_location topleft`) anulando el bleeding L1.
category: Sub-Pixel Bleeding Demolition L3
---
# 1. Teoría de Anomalía (La Cancha Lavada)
(Luma y Chroma Desfasados L7). En formatos YUV420P por defecto, la resolución del COLOR es la midad que la resolución del BLANCO Y NEGRO L4. Dependiendo de cómo el codec comprima o "Alinee" L2 el color (Left, Center, TopLeft), los colores se pueden desfasar físicamente 1 o 2 sub-pixeles. La manga de la blusa del jugador roja parece tener una "sombra" asquerosa roja asomándose en el estadio verde L1 (Bleeding Chromático L5).

# 2. Directiva de Ejecución Parámetrica (Código)
Anclaje Asintótico Geométrico de matrices VUI L4 (Video Usability Info). Obligamos a FFmpeg y Muxer HEVC a escribir un contrato formal estricto alineando la resolución de color en "Alineación Superior-Izquierda (Top-Left)" L2 estándar HEVC/MPEG-H L7.
```bash
# VUI Chroma Mapeo Perimetral Inmaculado L5:
-chroma_sample_location topleft -x265-params chroma-subsampling=420:chromaloc=0
```

# 3. Flanco de Orquestación
(Cristalinidad Vectórica L1). Cuando descifras este stream en la NVIDIA Shield, ExoPlayer lee el metadato exacto VUI L3. Los pixeles de color (Chroma) "Pintan" matemáticamente idénticos, y al mismo milisegundo milimétrico que el contorno blanco y negro L2. Luma Bleeding Asesinado. El contorno de las cabezas de los jugadores de fútbol brilla limpio de destintado L4. Una separación cromática digna de Cine RAW de 10 bits L7.
