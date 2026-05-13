---
description: [Controlador Adaptativo de Buffer]
---
# Skill_Adaptive_Buffer_Controller

## Descripción
Entidad matemática que oscila a conveniencia. En situación de choque (zapping) empuja el requerimiento al máximo (`multiplier=8`), y en situación de estabilidad lo normaliza (`multiplier=2`) sin cortar la fluidez.

## Metas
- Cero congelamientos.
- Cero saturación de memoria RAM que provoque reinicio del app.
- Balance elástico dictado desde el archivo `resolve_quality_unified.php`.
