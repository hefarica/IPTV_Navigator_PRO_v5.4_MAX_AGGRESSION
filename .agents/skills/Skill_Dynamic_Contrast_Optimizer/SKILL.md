---
description: [Optimizador de Contraste Dinámico (Blacks Absolutos)]
---
# Skill_Dynamic_Contrast_Optimizer

## Descripción
En sintonía con el Amplificador de Luminancia, este módulo se asegura de hundir los negros a la profundidad más absoluta ("más negros que un OLED") alterando las curvas matemáticas del GPU Decoder. Evita el Crushing en áreas oscuras, reteniendo el detalle espectral.

## Operación
- Intercepta el filtro `gradfun` para eliminar el color banding (cielos cuadriculados y grises ruidosos).
- Actúa siempre asumiendo el espacio de color BT.2020 impulsado por el resolver.
