---
description: [Sistema de Recuperación Silenciosa (Silent Healing)]
---
# Skill_Silent_Recovery_System

## Descripción
Agente guardián del confort visual. Ante judder insalvable o pérdida masiva de fotogramas, su mandato es el encubrimiento indetectable (Error Concealment).

## Operación
- Inyecta `avcodec-error-resilience=1` en el decoder `libavcodec`.
- Oculta fotogramas corruptos o macro-bloques destrozados, interpolando la imagen desde el fotograma anterior para engañar al ojo.
- Elimina el stuttering inicial durante la transición SDR -> HDR (El salto de nits).
