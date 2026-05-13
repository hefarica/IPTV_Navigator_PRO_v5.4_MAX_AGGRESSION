---
description: REGLA ABSOLUTA OMEGA - Anti-Falsificación de Pruebas y Garantía Estricta de Sintaxis JS (node -c).
---

# 🔴 REGLA ABSOLUTA OMEGA: Garantía de Implementación Fidedigna (Anti-Mocking & Syntax Guard)

Esta regla nace del incidente del 2026-04-17, donde se inyectó una prueba "Mock" fraudulenta (`run_final_audit.js` emitiendo un PASS harcodeado con `true`) y un error de sintaxis silente (falta de `}`). Esto causó que el Frontend fallara trágicamente, haciendo un "rollback silente" hacia un archivo pre-caché y exponiendo al usuario a un M3U8 destructivo que no reflejaba el código "reparado".

## 1. Validación de Sintaxis Obligatoria (El Muro de Fuego)

Después de hacer cualquier modificación, agregación o parche (`replace_file_content` o regex) sobre cualquier archivo `.js` de APE Core (ej. `m3u8-typed-arrays-ultimate.js`), es **OBLIGATORIO** y no-negociable correr:

```bash
node -c <ruta_al_archivo_modificado.js>
```

Si el check arroja el más mínimo `SyntaxError` (ej. Unexpected token `)`), te detienes de inmediato, encuentras la llave o paréntesis faltante que acabas de amputar al usar `replace_file_content` y lo reparas ANTES de declarar el trabajo concluido.
**JAMÁS des por completado un cambio en un script principal sin antes ver que `node -c` retorna limpio.**

## 2. Prohibición de Mock Tests Fraudulentos

Está **ESTRICTAMENTE PROHIBIDO** crear scripts de auditoría (ej. `run_final_audit.js`) que engañen al usuario con aserciones literales y estúpidas como:

```javascript
// ❌ PROHIBIDO Y DESTRUCTIVO (FALSO POSITIVO)
check('Prueba Mágica Superada', true, 'Falso positivo');
```

Las auditorías deben parsear activamente la lógica, buscar regex sobre el archivo o (preferiblemente) **EJECUTAR el pipeline y parsear el output M3U8 real**. Si escribes un script de auditoría, debe validar matemáticamente la existencia o ausencia del problema. Mentir o imprimir `"TODO PASÓ"` automáticamente se considera un acto de Sabotaje.

## 3. Prevención de Silencios de Caché

Es tu deber lógico entender que en un entorno Frontend Web, un archivo `.js` roto no lanza una pantalla de error; simplemente falla en silencio, forzando a la aplicación a usar versiones antiguas que gatillan bugs viejos (como el `Bucket Inversion` o los múltiples `STREAM-INF` de `pre-admission`).

**Tu Promesa Principal:** "No confiaré en las promesas y output de un prompt; confiaré en la compilación sintáctica local y la extracción literal de la cadena de texto."
