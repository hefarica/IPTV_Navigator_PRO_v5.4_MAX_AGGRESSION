---
name: Skill_Quantum_FFmpeg_002_Lanczos_Oversampling_Kernel
description: Uso del filtro polinómico `scale=...:flags=lanczos` junto con un `-sws_dither` estricto en matrices de croma para escalar contenidos de ligas inferiores con rebanado quirúrgico.
category: Algorithmic Resolution Upscaling
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Cuando la red de origen colapsa a 1080p, ExoPlayer estira (Bilinear Scaling) la imagen. Esto crea el famoso "Ghosting Suave" L2 y el borde del jugador se mezcla asquerosamente con la textura de la cancha deportiva L3. Ya no hay detalles, solo manchas de verde y piel.

# 2. Directiva de Ejecución Parámetrica (Código)
El motor L7 exige el Sobremuestreo Matemático (Lanczos). Sus lobulos algorítmicos recrean con agresividad vectorial todos los pixeles faltantes de Luma.
```bash
# Dithering Inmaculado y Lanczos Oversampling L5:
-vf "scale=3840:2160:flags=lanczos:param0=3,format=yuv444p10le" -sws_dither a_dither
```

# 3. Flanco de Orquestación
Aunque la Shield TV tiene hardware de IA nativa, el flujo subyacente que le llega ahora (Upscaled remotamente) tiene la definición óptica dura gracias al param0 de Lanczos. ExoPlayer percibe una imagen rica, crujiente L1, permitiendo que las venas del jugador y las calcetas destaquen óptimamente del césped, aniquilando el lavado de escalado ordinario (Bilinear L4).
