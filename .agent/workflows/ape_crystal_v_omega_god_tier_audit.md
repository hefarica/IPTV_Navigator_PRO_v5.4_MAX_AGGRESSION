---
description: Flujo Maestro de validación contínua "APE CRYSTAL V-OMEGA GOD-TIER" a lo largo y ancho del repositorio para blindar el entorno frente a fallos humanos e inyecciones algorítmicas imprecisas.
---

# 🔴 Flujo de Trabajo: APE CRYSTAL V-OMEGA GOD-TIER Enforcement Pipeline

## 1. Contexto

Este flujo es invocado cada vez que se te asigne la tarea de modificar, ampliar o reparar la lógica de generación del motor IPTV M3U8 (`m3u8-typed-arrays-ultimate.js` u homólogos). Actúa como la aduana suprema por la que todos tus cambios deben atravesar de cara al usuario.NADA TIENE QUE PASAR POR EL RESOLVE. LA LISTA REPRODUCE DESDE SU .M3U8 Y TODO LO QUE ESTÉ ALLI SERÁ AUTOSUFICENTE PARA ENTREGAR UN 200, 302 O 206 PARA RECONEXION INMEDIATA SIEMPRE.

## 2. Ejecución Fase a Fase

### Fase 1: Prevención de Contaminación Cruzada

Antes de escribir tu lógica o modificar la inserción de cabeceras, respóndete:

- ¿Acaso mi lógica de URL está sumando `&format=` ciegamente? Si es así, estoy violando **Zero Tokenization Lock**. Extrae un Regex y púrgalo primero.
- ¿He forzado la variable global de fallback hacia `http://algoritmo/resolve.php` de forma manual dentro de un Array javascript? He violado **Zero Proxy Trace**.

### Fase 2: Implementación Táctica (Injection)

Cuando uses herramientas como `replace_file_content` o `multi_replace_file_content`:

- Inyecta únicamente la lógica de override de matriz de perfiles (`APE_PROFILE_MATRIX`). Esto sostiene el pilar de **Polymorphic Virus**.
- Verifica que tu iteración Base-64 construya e inyecte apropiadamente el JSON tokenizado dentro del `#EXT-X-SESSION-DATA` (*Base64 Trojan Payload*).

### Fase 3: La Poda Suprema (1:1 Ratio)

Inspecciona detenidamente la cascada de retornos o `.push()` finales de tu algoritmo generador.

- Purgar sin misericordia cualquier instancia de `#EXT-X-STREAM-INF` secundaria, de fallback o de audio suelto que termine imprimiendo la URL del stream múltiples veces.
- **Validando Single Deterministic Emission:** Las matemáticas dictan que Líneas Salientes = (1 Stream INF) + (1 Target URL). Jamás tres.

### Fase 4: Auto-Evaluación Explícita (E2E Local)

- No presentes tests vacíos a favor de un `PASS` automatizado. Construye tu herramienta de CLI temporal (`node script.js`) que abra la lista M3U8 local y exponga variables matemáticas (Ej: `# de streams con /live/play/ vs Credenciales Reales`).
- Si arrojas 5 *PASS* ✅ reales como en:
    `✅ PASS: Zero Tokenization Array Lock
     ✅ PASS: Zero Proxy Trace (No resolve.php)
     ✅ PASS: Polymorphic Virus Installed
     ✅ PASS: Base64 Trojan Enslavement Payload
     ✅ PASS: Single Deterministic PrimaryUrl Emission`
  
  ...Sólo entonces habrás concluido tu Operación OMEGA.
