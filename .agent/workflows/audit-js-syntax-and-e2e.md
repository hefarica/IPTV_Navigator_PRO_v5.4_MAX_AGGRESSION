---
description: Flujo de trabajo y Auditoría E2E para asegurar Sintaxis Strict (node -c) post-edición, y validación matemática de M3U8 para prevenir Falsos Tests.
---

# 🔴 Flujo de Trabajo: Guarantor of Functional Implementation & Syntax Integrity

## 1. Contexto

Este flujo de trabajo es **OBLIGATORIO** ejecutarse explícitamente tras realizar CUALQUIER edición automatizada o regeneración de bloques masivos sobre un archivo central JavaScript (ej. `m3u8-typed-arrays-ultimate.js`). Un solo corchete omitido `}` por parte del Agente puede romper el motor y causar fallas silenciosas en la aplicación, la cual hará rollback a la caché anterior dejando al descubierto errores letales que se creerán solucionados.

## 2. Instrucciones Paso a Paso (El Pipeline Anti-Fallos)

### Paso 1: Edición y Verificación Estática Inmediata (Syntax Muro)

Una vez finalizado el uso de `replace_file_content` o regex en el archivo JS, **INMEDIATAMENTE**, ejecuta el chequeo sintáctico sin compilar:

```bash
# Ejemplo: node -c <tu_archivo.js>
// turbo
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

### Paso 2: Resolución de Fallas Sintácticas (Si Aplica)

Si el Paso 1 escupe `SyntaxError: Unexpected identifier` o `Unexpected token }`, **está PROHIBIDO continuar**.
Debes leer y cazar manualmente el error de indentación/llave usando las líneas afectadas, corrigiendo el código en base a `replace_file_content` hasta que el Paso 1 pase completamente en limpio.

### Paso 3: Diseño Inteligente de la Auditoría E2E (Scripting Real)

Si necesitas crear o actualizar un archivo como `run_final_audit.js` para probar que tus cambios arquitectónicos funcionan, DEBES implementar lógica que certifique esto parsing *variables crudas*:

- Está **prohibido** inyectar booleanos mágicos (`check("Regla URL", true)`).
- La auditoría debe contar tags (`#EXT-X-STREAM-INF`) dinámicamente y emitir alertas automáticas en rojo si los números sobrepasan sus ratios límites.

### Paso 4: Pase Final al Usuario

Sólo cuando todos los scripts devuelvan un Clean Output y la sintaxis sea declarada PERFECTA, envías un resumen al usuario garantizando que su UI Web cargará los cambios reales y no una reliquia crasheada cacheada.
