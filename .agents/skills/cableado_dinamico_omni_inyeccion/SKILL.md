---
name: "Cableado Dinámico y Omni-Inyección APE (UI -> M3U8)"
description: "Doctrina arquitectónica inmutable que exige que el 100% de la interfaz (40 toggles del ApeModuleManager y 154 campos del Gestor de Perfiles) esté estrictamente enlazada y determine la salida del M3U8 generado a través del ProfileBridge, garantizando un passthrough completo sin valores ocultos o ignorados."
---

# 🔌 Cableado Dinámico y Omni-Inyección APE (DNA Pass-Through)

**Versión:** 1.0 (STRICT)
**Componentes Implicados:** `ApeModuleManager`, `ProfileManagerV9`, `APEProfileBridge v9.1`, `m3u8-typed-arrays-ultimate.js`, `resolve.php`

## 1️⃣ Principio de Sincronía Absoluta (Zero Orphan Configs)

* **Ningún botón es decorativo:** Todo toggle activado o desactivado en la interfaz de usuario (UI) ***debe*** influir dinámicamente en el contenido del `.m3u8` generado.
* **Ningún campo es ignorado:** Los 154+ cabeceras (headers) disponibles en el menú de "Gestor de Perfiles APE v9.0" (`ProfileManagerV9`) ***deben*** fluir sin filtros, modificaciones y de manera idéntica hacia el objeto `#EXTHTTP` (para los reproductores OTT) y al `channels_map.json` (para el VPS).

## 2️⃣ Componentes del Cableado

Esta habilidad amalgama la integración estricta de dos sistemas frontales masivos contra el generador base de listas:

### A) El Cableado del ApeModuleManager (40 Toggles)

En `m3u8-typed-arrays-ultimate.js`, el objeto `MODULE_FEATURES` y la función `isModuleEnabled(moduleId)` controlan el 100% de la funcionalidad avanzada.

* **Mapeo:** Deben haber **40 identificadores idénticos** al `data-module-id` del panel (ej: `xtreamExploit`, `godMode`, `quantumVisual`, `hydraStealth`, `sessionWarmup`, `eliteHls`, etc.).
* **Ejecución Condicional:** Cada bloque de inserción de directivas (`apeHeaders.push(...)` o `vlcOpts.push(...)`) debe estar encapsulado en un iterador de habilitación (`if (isModuleEnabled(MODULE_FEATURES.nombre_del_modulo)) { ... }`).
* Nunca se inyecta código a la fuerza sin esta condicional validando, garantizando **generación modular quirúrgica bajo demanda**.

### B) El Cableado del Gestor de Perfiles (154 Headers & P0-P5)

1. **Frontend (`ProfileManagerV9`):** Intercepta la modificación en tiempo real desde 19 categorías de la UI (`Connection`, `Codecs`, `HDR & Color`, `ABR Control`, etc).
2. **The Bridge (`profile-bridge-v9.js`):** Traduce y reúne todas esas propiedades UI (Ej. `clock-jitter`, `max_bandwidth`, etc.) bajo un objeto maestro para que el generador no lea el DOM directamente, empaquetándolos bajo la estructura `cfg.headers`.
3. **Omni-Inyección (`m3u8-typed-arrays-ultimate.js`):**
    El paso fundamental y Crítico, al ensamblar los headers `exthttpHEVC` debe integrar **toda la carga genética (DNA) de la interfaz** a nivel de M3U8 para forzar el estado al reproductor (OTT / TiviMate).
    * **Prohibición de Hardcodeo Local exclusivo:** Prohibido dejar cabeceras manuales sin hacer el **Spread Operator** dinámico del Bridge:

    ```javascript
    const exthttpHEVC = {
         // Cabeceras calculadas localmente
         "X-Congestion-Detect": "enabled",
         
         // ── 🧬 APE DNA OMNI-INJECTION (154+ UI HEADERS FAST-PASSTHROUGH) ──
         ...(cfg.headers || {})
    };
    ```

## 3️⃣ Flujo Predictivo (SOP) al Implementar Nuevos Elementos en la UI

Si se añade un nuevo botón a la Interfaz Gráfica (`index-v4.html`), es obligatorio:

1. Si es un **Módulo/Toggle (ApeModuleManager)**: Agregarlo en `MODULE_FEATURES` del generador M3U8 y envolver la lógica nueva bajo `isModuleEnabled()`.
2. Si es un **Input/Atributo de Perfil (ProfileManager)**: Asegurarse de que el Bridge lo levanta (`profile-bridge-v9.js`) y confirmar en consola que el spread operator de la Omni-Inyección lo vuelca dentro de `.m3u8` en modo texto.

*Al aplicar este conocimiento, se previene el Efecto Placebo (donde el usuario cambia algo en la UI creyendo que mejora la red, pero el manifiesto entregado no contenía los cambios subyacentes).*
