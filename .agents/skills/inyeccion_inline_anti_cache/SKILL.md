---
name: Protocolo de Inyección Inline Anti-Caché (UI Toggles)
description: Doctrina arquitectónica para erradicar el caché agresivo del navegador al añadir nuevos módulos/toggles a la UI. Exige que todo nuevo módulo de APE Module Manager se inyecte vía script en línea dentro de index-v4.html.
--- 

# 🛡️ PROTOCOLO DE INYECCIÓN INLINE ANTI-CACHÉ (CACHE-IMMUNE PROTOCOL)

## Contexto Histórico y Problema

En el ecosistema IPTV Navigator PRO, el navegador (Edge/Chrome) impone un caché estático extremadamente agresivo sobre los archivos JavaScript centrales (`ape-module-manager.js`, `ape-module-panel-ui.js`). Las estrategias tradicionales de desvío de caché (como añadir sufijos `?v=2.6`) **fallan rotundamente**. Esto provoca que cuando se desarrollan e integran nuevos módulos estratégicos (como *Ghost Protocol*, *God Mode*, *DASH-CMAF Omni*), estos **no aparezcan en el panel de UI** para el usuario, a pesar de que el código base esté actualizado.

## Doctrina Arquitectónica (La Solución)

Para garantizar que cualquier nueva característica aparezca instantáneamente en la interfaz de usuario bajo el esquema de `ApeModuleManager` sin depender del borrado manual de caché, **todos los nuevos módulos (toggles) se incorporarán al sistema usando un patrón de "Inyección en Línea" (Inline Injection)** directamente dentro de `index-v4.html`.

Al pertenecer directamente al DOM del archivo HTML de entrada, la inyección es **Inmune al Caché** y poblará la base de datos de módulos de `ApeModuleManager` en tiempo real (Runtime), actualizando el panel visual automáticamente.

## Framework de Implementación Obligatorio

Cuando un desarrollador (o asistente de IA) necesite crear un nuevo módulo (Toggle) para el panel, DEBE obedecer al pie de la letra esta plantilla, insertándola justo después de las invocaciones de script en `index-v4.html` (alrededor de la línea ~3180).

### Plantilla Estándar (Copiar y Pegar)

```html
  <!-- 🧩 [NOMBRE DEL MODULO]: Inline injection (cache-immune) -->
  <script>
    (function () {
      function injectMyNewModule() {
        // 1. Esperar a que el Module Manager esté instanciado en el entorno global
        if (!window.ApeModuleManager) { 
            setTimeout(injectMyNewModule, 200); 
            return; 
        }
        
        const moduleId = 'id-unico-del-modulo';

        // 2. Comprobar si ya se ha inyectado en este ciclo para evitar duplicados
        if (!window.ApeModuleManager.registry[moduleId]) {
          
          // 3. Registrar matemáticamente el módulo
          window.ApeModuleManager.registry[moduleId] = {
            id: moduleId,
            name: '✨ Nombre Visual del Toggle',
            description: 'Descripción detallada de la acción de estrangulamiento/optimización.',
            file: null,
            globalVar: null,
            defaultEnabled: false,
            category: 'architecture', // 'security', 'quality', 'network'
            
            // 4. Lógica de Activación y Enrutamiento (Cascadas)
            onEnable: function () {
                window._MY_GLOBAL_FLAG = true;
                console.log('✨ [MODULO] Activado exitosamente.');
                // Inserte activaciones en cascada aquí si es un Macro-Toggle:
                // window.ApeModuleManager.enable('otro-modulo');
            },
            
            onDisable: function () {
                window._MY_GLOBAL_FLAG = false;
                console.log('⚪ [MODULO] Desactivado.');
            }
          };

          // 5. Inicializar la configuración local (localStorage persistencia)
          if (window.ApeModuleManager.config[moduleId] === undefined) {
            window.ApeModuleManager.config[moduleId] = false;
          }
        }
        
        // 6. Refrescar el Panel Visual
        console.log(`✨ [${moduleId}] inyectado exitosamente anti-caché.`);
        if (window.refreshApeModulesUI) window.refreshApeModulesUI();
      }
      
      // Detonar la función
      injectMyNewModule();
    })();
  </script>
```

## Beneficios Cardinales

1. **Paso Cero de Setup:** Ningún usuario tendrá que abrir la DevTools ni lidiar con "Clear Cache & Hard Reload".
2. **Independencia del Archivo:** Se deja de modificar el colosal `ape-module-manager.js`, reduciendo riesgos de sintaxis.
3. **Escalabilidad Infinita:** Permite crear Macro-Toggles (como el **God Mode**) que orquesten submódulos a nivel de DOM.
4. **SOP de Grado Militar:** Normaliza el proceso de despliegue de Features y parcheo de UI del proyecto al modelo más seguro existente.
