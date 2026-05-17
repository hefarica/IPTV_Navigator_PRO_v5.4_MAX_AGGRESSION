---
name: falso_positivo_semantic_detector
description: Alerta y protocolo forense para NO culpar a factores externos (red, metadatos, ISP) cuando el sistema lanza un TypeError. Te entrena para cazar errores semánticos profundos.
---

# Detector Semántico de Falsos Positivos en Runtime (Anti-Gaslighting)

## Objetivo
Erradicar el "Falso Positivo Diagnóstico", una falla analítica recurrente donde la IA o el programador culpan erróneamente a elementos externos (como "caídas de red", "metadatos faltantes", "ISP bloqueando", "listas corruptas") cuando la VERDADERA CAUSA es un error de tipado estricto o un *Semantic Object Mismatch* (Ej: Intentar acceder a un objeto cuando la variable en realidad guarda un String).

## Procedimiento (Paso a Paso)

1. **Aislamiento del Origen:**
   - Si la terminal reporta `TypeError: Cannot read properties of undefined`, **NUNCA ASUMAS INICIALMENTE QUE LA RED FALLÓ**. Asume que una variable interna cambió de tipo silenciósamente.
   - Revisa el stack trace (cadena de llamadas). Identifica en qué línea explotó.

2. **Deducción de Tipo Semántico (El Escáner de Tipos):**
   - Rastrea el ciclo de vida de la variable ofendida.
   - ¿Era inicialmente un Objeto JSON pero luego mutó a un String ID? (Ej. `profile = "P1"` en lugar de `profile = { settings {...} }`).
   - ¿Era un Array pero fue redeclarado como un `null` en un try-catch silencioso?

3. **Verificación de Optional Chaining (`?.`):**
   - Revisa el código adyacente. Todo encadenamiento profundo (e.g. `cfg.stream.video.codec`) DEBE estar protegido por **Optional Chaining** (`cfg?.stream?.video?.codec`) o por _Fallback OR Defaults_ (`|| 'VALOR'`).

4. **El Falso Positivo de "Falla de Metadata":**
   - Si el sistema dice "Faltó metadata del canal", verifica primero si el inyector intentó buscar propiedades en la variable equivocada. El dato externo suele estar intacto.

## Reglas Estrictas

- **NO CULPAR A FACTORES EXTERNOS:** Prohibido emitir excusas sobre "el internet del usuario", "firewalls del ISP", o "la fuente externa" sin antes comprobar que el Tipado Dinámico (Type Casting) interno no se corrompió.
- **NO DEJAR ENCADENAMIENTOS INSEGUROS:** Cualquier lectura a propiedades con >1 nivel de profundidad debe obligatoriamente estar asegurada con `Optional Chaining`.
- **VALIDAR TIPOS ANTES DEL DEBUG:** Ante cada error fatal de JS, pregúntate inmediatamente: "¿Estoy tratando un String como un Objeto?".
