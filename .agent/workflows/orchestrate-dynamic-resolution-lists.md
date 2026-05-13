---
description: Pipeline de Generación con Motor de Herencia por Resolución Dinámica (OMEGA)
---

# 🚀 Workflow: Generación M3U8 con Emparejamiento por Resolución Dinámica

**Contexto:** Los perfiles IPTV ya no usan sus literales estáticos (P0, P1) como orden base, sino que la Jerarquía de Degradación viene guiada matemáticamente por la resolución (Ej: 8K va sobre 4K).

Este workflow dictamina los pasos exactos que **cualquier orquestador OMEGA** (u otra Inteligencia Artificial en el sistema de desarrollo Antigravity) debe aplicar cada vez que ensamble o arme manifiestos, generadores o Resolvers para garantizar que "calce perfectamente su herencia".

## Pasos de Ejecución Mandatoria

### 1️⃣ Extraer el Árbol de Herencia Matenático
En el inicio lógico de la construcción del M3U8, prohíbe las iteraciones clásicas de perfiles duros.
Dependiendo del motor en evaluación, asegúrate de invocar:
```javascript
const perfiles_dinamicos = window.APE_PROFILES_CONFIG.getDegradationHierarchy();
```
*(Si no tienes acceso directo por la arquitectura de workers, extrae el dictado inyectado por UI Connector que previamente ha llamado a este método).*

### 2️⃣ Evaluación de Canal Maestro (Matching)
Toma el canal procesado (Ej. *ESPN 4K*) y aplícale las RegExp usuales para determinar su techo (Ceiling).
Una vez que determinas su máximo nivel, procede a la inyección, pero **SÓLO emparejándolo (MATCH)** contra la lista extraída paso I.

No asumas que `P1 = UHD`. Tienes que leer la herencia de resolución del Array iterándolo dinámicamente:
*   Si el canal tiene [4K], buscas el primer índice en `perfiles_dinamicos` donde compute que el `.resolution` sea >= a `3840x2160`. Ese calzará en su primer Variant Stream.

### 3️⃣ Cascading Fallback (Heriditario Obligatorio)
Para generar los streams de degradación (el Fallback Chain) para el canal maestro emparejado, no te inventes las estructuras. Simplemente itera los elementos siguientes al Match maestro en el array dinámico y aplica uno a uno.
*   Primer Stream: `perfiles_dinamicos[matched_index]` (Ej: 8M pixels, hereda LCEVC_Top)
*   Segundo Stream: `perfiles_dinamicos[matched_index + 1]` (Ej: FHD, hereda códec de audio conservador)

En el momento que armen las listas, **los atributos deben fusionarse y calzar desde el modelo del perfil adaptado.**

### 4️⃣ Validación y Sanitización APE (Output)
Inspecciona el bloque EXT-X-STREAM-INF. Debe verse orgánico y con los valores jerárquicos correctos descendiendo, independientemente de si los tags originarios (o identificaciones) parecen ilógicos desde la perspectiva antigua (ej. que P5 termine en alto porque el administrador le subió la resolución).

> [!CAUTION]
> NO proceses ninguna lista si detectas bucles `for..in` iterando diccionarios de OMEGA como fijos. Aborta y exige este workflow.
