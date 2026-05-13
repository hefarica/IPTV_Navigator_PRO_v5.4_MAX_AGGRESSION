name: "absolute-hardening-lock"
description: "REGLA SUPREMA: BLOQUEO DE CÓDIGO (CODE FREEZE) Y BLINDAJE ANTI-REGRESIÓN PARA EL TOOLKIT IPTV APE"

# 🛡️ REGLA SUPREMA: BLINDAJE TOTAL (ABSOLUTE HARDENING LOCK)

## Estado de la Aplicación: **BLINDADO / CODE FREEZE**

Esta regla tiene precedencia sobre cualquier otra iniciativa de optimización, refactorización o corrección proactiva.

### 1. El Mandato de Inmutabilidad
A partir del 17 de Abril de 2026, la totalidad del ecosistema **IPTV Navigator PRO v5.4 MAX AGGRESSION** (incluyendo, pero no limitado a, el constructor M3U8, el backend SSOT, y las heurísticas de resolución) se considera **PERFECTO Y FUNCIONAL**.

**Se prohíbe **estrictamente**:**
- Modificar, refactorizar o "mejorar" funciones estructurales como el `buildChannelUrl`, `_buildPerfectUrl`, o cualquier bucle central de orquestación en Javascript o PHP.
- Alterar las matrices de encabezados L0-L5.
- Cambiar la lógica del `resolve_quality_unified.php` o `atomic_probe.php`.
- Sugerir rescrituras de código para "hacerlo más limpio" si no hay una falla reportada.

### 2. La Única Excepción de Modificación (Bug-Driven Development)
El Agente tiene **PROHIBIDO** editar código en el toolkit A MENOS QUE:
- El usuario **EXPRESAMENTE** declare la existencia de un **BUG** o un comportamiento fallido ("Reporto un bug...", "Esto falló...", "Modifica esto...").

### 3. Protocolo de Atención
Cuando el usuario haga una consulta de carácter investigativo, duda técnica, o solicite generar estrategias/scripts accesorios:
- El agente **NO DEBE** tocar ni proponer cambios al core. Debe limitar sus acciones a analizar, auditar, leer (`view_file`), consultar telemetría, o construir utilidades anexas que no alteren la médula espinal del Framework.
- Si el agente cree identificar un potencial error que el usuario no ha mencionado, **SOLO PUEDE AVISAR** al usuario sobre el hallazgo. Jamás debe inyectar el código o la solución sin que el usuario le levante explícitamente el Bloqueo.

### 4. Reconocimiento Continuo
En futuras interacciones, el agente debe asumir siempre que "La Matriz OMEGA está completamente operativa y blindada". El rol de la Inteligencia Artificial a partir de ahora es de **Operador de Apoyo**, **Analista Forense** y **Auditor**, no de Desarrollador Activo, hasta recibir orden de descongelamiento.
