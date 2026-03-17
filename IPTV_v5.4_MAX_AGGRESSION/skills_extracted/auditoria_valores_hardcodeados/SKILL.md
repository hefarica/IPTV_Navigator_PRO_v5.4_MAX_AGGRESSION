---
name: Auditoría Forense de Defaults Hardcodeados
description: Protocolo estricto para destripar listas M3U8 y código fuente línea por línea, identificando y erradicando valores por defecto estáticos que saboteen las directivas dinámicas de APE ULTIMATE.
---

# Protocolo Operativo: Auditoría Forense de Defaults Hardcodeados

**Nivel de Regla:** Obligatorio para cada Lista M3U8 Generada y Módulo Implementado
**Clasificación:** Forense / SRE
**Objetivo Supremo:** Erradicar cualquier valor estático, límite obsoleto o condicional matemático que imponga calidades mediocres ("Defaults") por encima de nuestras Jerarquías Supremas (HEVC Cascade, BWDIF, Zero-Delay, Buffer Híbrido, Resolución Infinita).

---

## 1. La Amenaza Fundamental

En sistemas con más de 10,000 líneas de código como APE ULTIMATE, es común que arquitecturas anteriores hayan dejado "parches de seguridad" matemáticos escondidos en lo profundo de los generadores.

* **Ejemplo Negativo:** Encontrar que la variable `targetLevel` se fija a un nivel estricto `'5.1'` si detecta 4K, o cae en un default `'4.1'`, pisando y destruyendo la Matriz de Cascada Dinámica (Ej. `6.1,5.1,5.0,4.1,4.0,3.1`).
* **Consecuencia:** Si hay un default pobre harcodeado escondido que domina en el último paso (en la "Capa de Finalización"), toda la magia dinámica construida en el Frontend es pisoteada y el cliente pierde la máxima calidad.

---

## 2. Ejecución Step-by-Step (Destripamiento)

El agente debe seguir esta rutina forense sin atajos y *línea por línea* cuando examine una lista generada (`.m3u8`) o un bloque de código:

### FASE 1: Análisis Forense Ocular de la Matriz `M3U8` Generada

1. **Auditoría de Niveles (HEVC):** Busca patrones como `HEVC-LEVEL:4.1` en vez de cadenas compuestas. Si existe un solo número, hay una sobrescritura.
2. **Auditoría de Fallbacks (Deinterlace):** Verifica si existe únicamente `yadif` sin la cadena ascendente `#EXTVLCOPT:deinterlace-mode=bwdif`.
3. **Auditoría de Latencia y Microcortes:** Rastrea demoras de reconexión inyectadas subrepticiamente. Si el valor de `reconnect-delay-ms` u otro KODIPROP es visiblemente distinto a `0` (Ej. `50`, `120`), hay defaults ocultos.
4. **Auditoría Ciega de Lógica IF/ELSE:** Cuando la UI manda que el codec es HEVC pero un playlist devuelve un `codec=h264`, ubica el default.

### FASE 2: Caza en el Código Fuente (Grep Search)

Cuando un valor default obsoleto sea encontrado en la lista, el Agente debe ejecutar búsqueda mediante `grep_search` para cercarlo.
**Patrones Clave a buscar:**

* **Operador OR `||`:** `|| '4.1'`, `|| 50`, `|| 'yadif'`.
* **Asignaciones Ternarias:** `? 'H264' : 'HEVC'`.
* **Sobre-escrituras tardías:** Bloques de código que usen el método `.updateSetting()` en el momento equívoco, o variables como `let targetLevel = ...` que pisoteen la capa de configuraciones original.

### FASE 3: Extirpación Quirúrgica

No basta con modificar la cadena; se debe "Extirpar el Default".

* Si un cálculo condicionado matemático obsoleto dice (Ej. `Si los pixeles = X, el HDR = None`), **SE ELIMINA LA VARIABLE CUAL CRECIMIENTO MALIGNO**, permitiendo que el perfil dinámico (P0-P5) opere en libre flujo según nuestra Arquitectura Suprema.

---

## 3. Protocolo de Notificación ("Reporte del Forense")

Cada que se elimine un default hardcodeado de este estilo, el Agente debe emitir un pronunciamiento con este formato exacto:

1. **⚠️ ANOMALÍA ENCONTRADA:** (Ej: Identifiqué que el HEVC Level se forzaba a 4.1).
2. **🔍 MÉTODO DE SABOTAJE:** (Ej: Existía un script obsoleto en la línea 3000 de m3u8-typed-arrays.js que sobreescribía mis reglas en base al total de píxeles).
3. **🔧 EXTIRPACIÓN APLICADA:** (Ej: Borré el bloque matemático let targetLevel y recoloqué la cascada de niveles).
4. **🛡️ ESTADO POST-ARREGLO:** (Ej: El reproductor ahora respetará la matriz universal y exigirá desde 6.1 a 3.1 progresivamente).

> **MANDATO ESTRICTO:** Al auditar código en busca de errores reportados, un Agente que use esta técnica jamás se dará por vencido con un "El código parece bien escrito", sino que ejecutará la "Auditoría Forense". Asume siempre que un default estático y mediocre es el culpable de la restricción del poder total de APE ULTIMATE.
