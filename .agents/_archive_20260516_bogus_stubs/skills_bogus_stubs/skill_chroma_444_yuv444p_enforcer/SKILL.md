---
name: Skill_Chroma_I444_Subsampling_Enforcer
description: Forzado del submuestreo cromático completo (4:4:4) para erradicar el "banding" en degradados complejos y retener textura de césped.
category: Colorimetry / Filter
---
# 1. Teoría de Compresión y Anomalía
El estándar general de transmisión 4:2:0 comprime severamente la información de color de cada píxel, descartando el 75% del Croma para ahorrar ancho de banda. En el HDR, esto se manifiesta como anillos concéntricos o "banding" asqueroso alrededor de luces, focos, y destruye la individualidad de la textura del césped (apareciendo como un bloque sólido verde o manchas lavadas).

# 2. Directiva de Ejecución (Código / Inyección)
La resurrección cuántica de la imagen asume un ancho de banda masivo. No ahorramos en color. Obligamos a FFmpeg y al Cliente a usar una paleta completa mediante el filtro general de formato de píxel.

```bash
# Inyección God-Tier de Formato de Píxel 4:4:4:
-pix_fmt yuv444p10le -color_primaries bt2020 -colorspace bt2020nc
# Equivalente en M1U8 VLC / OTT:
#EXTVLCOPT:video-filter=chroma_I444
```

# 3. Flanco de Orquestación
La combinación inyectada exige al GPU que maneje toda la cuadrícula de Luma (brillo) y Croma (color) 1 a 1. La Shield TV, programada en "Color Vívido" en la TV, detona la profundidad requerida, y los pixeles del césped se perfilan en 3D porque ya no sufren sangrado cromático. La imagen es prístina y matemáticamente inmaculada.
