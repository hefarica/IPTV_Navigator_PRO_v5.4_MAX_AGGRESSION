---
name: Protocolo Botón Generador Typed Arrays (Strict Bind)
description: Regla de UI que garantiza que el botón generador "TYPED ARRAYS ULTIMATE" en el frontend nunca ejecute rutas de fallback débiles. Obliga a que el botón se ligue indisolublemente al método principal `app.generateM3U8_TypedArrays()` o al orquestador `ApeModuleManager`, asegurando la inyección y ejecución del 100% del Toolkit de Generación Total (Fusión BWDIF Infinita, Sincronizador Netflix Max, Latencia Rayo QoS, Sincronizador Híbrido Supremo, etc.) sin posibilidad de bypass prematuro.
---

# 🔘 PROTOCOLO DE INTERFAZ: TYPED ARRAYS BINDING (STRICT MODO)

## 1. El Problema (Button Bypass & Premature Execution)

En arquitecturas web estáticas modulares, si un botón tiene un atributo `onclick` con lógica ternaria (ej. `app.generar() ? app.generar() : ObjetoGlobal.generar(...)`), existe el riesgo catastrófico de que debido a problemas de carga (timing) o la impaciencia del usuario con clics prematuros, se ejecute directamente el núcleo desnudo del generador.
Esto resulta en el bypass masivo de comprobaciones críticas, anulando silenciosamente:

- Sincronizador Netflix Max (Headroom 300% & Riesgo 0)
- Latencia Rayo QoS (Priorización de Tráfico y Auto-Speedtest)
- Fusión Infinita BWDIF (Doctrina del Agujero Negro)
- Sincronizador Híbrido Supremo
- Todas las construcciones de directivas dinámicas del APE Engine y sus metadatos del mapa (`channels_map.json`).

## 2. La Directiva (Cima de Ingeniería - Ejecución del 100% del Toolkit)

El botón "TYPED ARRAYS ULTIMATE" **NUNCA** ejecutará código terciario u objetos estáticos desacoplados. Debe estar amarrado a la manguera principal de la aplicación, forzando la evaluación y empaquetado del 100% del paquete de generación contemplado en las directivas de las habilidades.

## 3. Lógica Estricta de Invocación (`onclick`)

El atributo `onclick` debe reestructurarse para llamar invariablemente a la orquestación asíncrona mapeada y blindada de la interfaz.

### ❌ Prohibido (El Bypass Débil y Permisivo)

```html
<button onclick="app.generateM3U8_TypedArrays ? app.generateM3U8_TypedArrays() : M3U8TypedArraysGenerator.generateAndDownload(app.state.channels)">
  TYPED ARRAYS ULTIMATE
</button>
```

*Razón:* Si los módulos del ecosistema (Netflix Max, QoS, BWDIF) tardan milisegundos de más en inicializarse, el clic prematuro arrojará una lista estéril y básica evadiendo toda la genialidad arquitectónica porque saltó directamente al motor pasivo estandar (`M3U8TypedArraysGenerator.generateAndDownload`).

### ✅ Obligatorio (Strict Middleware Bind)

```html
<button onclick="if(window.ApeModuleManager && window.ApeModuleManager.exportEngine) { window.ApeModuleManager.exportEngine('typed-arrays'); } else if(window.app && typeof window.app.generateM3U8_TypedArrays === 'function') { window.app.generateM3U8_TypedArrays(); } else { alert('El Sincronizador Maestro HLS (Toolkit Completo) aún está armando los buffers y conectando directivas. Espera un segundo.'); }">
  TYPED ARRAYS ULTIMATE
</button>
```

## 4. Garantías Exigidas del Toolkit

1. **Protección Total del Ecosistema:** Ningún archivo M3U8 sale del generador sin pasar por los filtros UI, hooks de pre-generación, orquestadores, la validación del mapa VPS, ni las banderas de sincronización perfiladas.
2. **Alertas Sensatas y Bloqueantes:** Protege al usuario con bloqueos y mensajes explícitos en caso de clic ultra-prematuro (antes de que la escalada BWDIF o el QoS estén inyectados en la memoria y vinculados a la app).
3. **Sincronización del Dominio Global:** Asegura que cualquier *checkbox* tildado (o preajuste de Netlfix, de Latencia Oculta, etc.) haya inyectado sus valores en la orquestación y transmitido su payload al `channels_map.json` del VPS **ANTES** de descargar un solo byte y guardarlo en el ordenador del usuario. ¡Todos los engranajes del motor giran simultáneamente, o el coche ni siquiera arranca para generarse!
