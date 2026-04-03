---
description: [Amplificador Perceptual de Luminancia (Objetivo 5000 Nits)]
---
# Skill_Luminance_Amplifier

## Descripción
Módulo cognitivo de visión artificial. Utiliza el pipeline de Tone Mapping HDR (`zscale=t=bt2020nc`) para expandir el rango dinámico de fuentes SDR/HDR comprimidas, forzando un brillo percibido equivalente a 5000 nits. Empuja los highlights a límites cegadores sin clipping destructivo de texturas y colores.

## Reglas de Control
- **Prioridad Absoluta**: Blancos que impacten visualmente manteniendo texturas.
- **Inyección Backend**: Se aplica mediante `#EXTVLCOPT:video-filter` forzando Tone Mapping algoritmo 'hable'.
- **Evasión de Clipping**: Mantiene detalle en picos de luminancia remapeando la curva en milisegundos.
