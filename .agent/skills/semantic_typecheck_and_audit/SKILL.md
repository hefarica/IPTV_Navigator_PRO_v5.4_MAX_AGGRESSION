---
name: semantic_typecheck_and_audit
description: Flujo pre-despliegue que impone una auditoría rigurosa para cazar variables de tipado ambiguo (ej: confusiones entre Object y String), ausencia de Optional Chaining y TypeErrors predictivos. 
---

# Prevención de Gaslighting Analítico y Auditoría Semántica 

## Objetivo
Ejecutar la doble tarea de (1) Detectar cualquier "Falso Positivo" provocado por errores en mutación de tipado que erróneamente se asuman como fallas de red/metadata y (2) Imponer un escáner total del Toolkit para asegurar que no queden lecturas a profundidad sin protección (`?.`).

## Procedimiento (Paso a Paso)

### Fase 1: El Detector de Falsos Positivos
1. **Evalúa la Falla Re-Apariente:** Antes de emitir cualquier reporte sobre pérdida de paquetes, estrangulamiento CDN, o falta de datos en el M3U, REVISA EL STACK TRACE.
2. **Confirma el Status de los Objetos:** ¿El error dice `Cannot read property X of undefined/null`? Automáticamente aborta cualquier diagnóstico de "conexión" y céntrate en el *Data Model*.
3. **Escanea la Mutación de Vida:** Revisa funciones donde un ID (String) y un JSON (Object) compartan el mismo nombre de variable paramétrico (e.g., sobreescribir `profile = "P0"` en un entorno que esperaba un perfil JSON).

### Fase 2: Auditoría del Toolkit Completo
1. **Barrido de Accesos Profundos (El Optional Chaining Rule):**
   - Ejecuta un regex mental o real por el código fuente buscando accesos mayores a dos puntos `[a-zA-Z]+\.[a-zA-Z]+\.[a-zA-Z]+`.
   - Modifica todo para implementar `?.` y `??`. Ej: `config?.stream?.codec ?? 'HEVC'`.
2. **Protección Try-Catch Focalizado:**
   - La plataforma IPTV APE_V9 nunca debe permitir una cascada. Todos los loops de generación (como mapping de canales) deben tener un `try-catch` INDIVIDUAL con un `console.error` descriptivo de la falla interna. 
3. **Mapeo de Funciones Críticas:** Revisa las entradas/salidas de: `getProfileConfig`, `determineProfile`, `executeCortex`. Deben tener claro si envían y reciben strings, números u objetos.

## Reglas Estrictas
- NUNCA diagnosticar fallas desde la capa de RED si existe un `TypeError` explícito de JavaScript en la consola.
- PROHIBIDO utilizar encadenamiento de objetos directo (ej. `a.b.c`) a la hora de inyectar variables en M3U8 o construir URLs, ya que los metadatos de IPTV pueden venir limpios (sin las propiedades esperadas).
