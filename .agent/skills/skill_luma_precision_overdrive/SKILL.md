---
name: Skill_Luma_Precision_Overdrive
description: Precisión de luma agresiva para evitar que los interpoladores aplasten el Shadow Detail (Detalle en sombras) simulando contraste local.
category: FFmpeg Filter
---
# 1. Teoría de Compresión y Anomalía
Cuando escalamos flujos desde orígenes 1080p hacia M3U8 "Crystal UHD", la interpolación de color tradicional de ffmpeg usa rutinas bicúbicas que promedian matemáticamente la luz; la física dicta que si hay un píxel muy brillante y uno negro, "inventan" uno gris intermedio, arruinando el detalle de contraste a la luz del sol (Shadow Crush).

# 2. Directiva de Ejecución (Código / Inyección)
Se exige usar los algoritmos "Lanczos" con un Overdrive de alta luma y antialiasing, para que el reborde hiperafilado del pasto o del jugador mantenga su negrura/brillo atómico intacto en el subsampling.

```bash
# Precisión Luma Extrema (Escalador Zscale/Lanczos/HDR):
-sws_flags lanczos+accurate_rnd+full_chroma_int+full_chroma_inp
# O en escaladores zscale HDR-aware:
-vf zscale=t=smpte2084:m=bt2020nc:c=topleft:f=spline36
```

# 3. Flanco de Orquestación
El cliente ya no tiene que adivinar qué hacer en los contornos entre un jugador y el cielo porque la matriz luma se inyectó con `full_chroma_int` en el bitstream. Combinado con el Modo: "Dinámico", Contrast Local: "Alto" y Micro Diming: "Alto" en la TV, el over-sharpening se cancela a favor de un filo orgánico perfecto 4K sin artefactos halo.
