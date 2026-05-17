---
description: [Modulador de Intensidad Visual (Post-procesamiento Paramétrico)]
---
# Skill_Visual_Intensity_Modulator

## Descripción
Controla la percusión matemática de filtros no inherentes al video. Inyecta `hqdn3d` (Denoise en volumen del tiempo real) para derribar ruidos de compresión (efecto mosquito Mpeg2) y enciende `postproc-q=6` (De-ringing paranoico). 

## Operación
- Evalúa la debilidad de la fuente base.
- Dispara un Up-scale paramétrico (`swscale-mode=lanczos`).
- Regula la agresividad si detecta asfixia de SoC.
