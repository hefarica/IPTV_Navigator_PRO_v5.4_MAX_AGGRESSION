---
description: [Gestor de Paralelismo Seguro]
---
# Skill_Safe_Parallelism_Manager

## Descripción
Desata todos los núcleos SoC/CPU posibles de forma orquestada para aplicar los filtros complejos sin estrangulamiento de latencia.

## Operación
- Inyecta `avcodec-threads=0` para desbloquear el CPU Bound del decodificador.
- Eleva las conexiones TCP paralelas en arranques agresivos (`$parallelStreams = 6`) saturando la banda ancha del ISP a la fuerza (Modo CS7 Nivel Físico).
