---
name: Guarantor of Functional Implementation
description: Skill de auditoría arquitectónica profunda. Impide la creación de tests fraudulentos (Mock Tests) y asegura la compilación local y parseo real para garantizar que los artefactos generados coinciden matemáticamente con los requisitos.
---

# Skill: Guarantor of Functional Implementation & Syntax Integrity

**Nivel:** God-Tier Architectural Audit
**Trigger:** Obligatorio después de cualquier inyección de código mediante el comando Replace/Edit o Script Creation en JS/PHP.

## 1. Identificación del Problema (The Silent Fallback Syndrome)
En aplicaciones complejas, especialmente aquellas servidas al navegador mediante archivos estáticos, un error de sintaxis en `m3u8-typed-arrays-ultimate.js` (como una llave omitida) provocará que la aplicación haga un fallback imperceptible hacia versiones antiguas cacheadas en memoria u otros scripts `.pre-admission`.
Esto causará que las auditorías lógicas sean "evaluadas sobre otra base de código generada" mientras el agente clama victoria ciegamente.

## 2. Instrucciones Funcionales de la Skill

CADA vez que apliques un parche o cambio de lógica, debes ejecutar y someter el sistema a esta skill en 3 pasos:

### 2.1 Verificación de Integridad de Compilación (Sintaxis Base)
ANTES de declarar tu reparación como terminada, lanza obligatoriamente en tu powershell:
```bash
node -c ruta/a/tu/archivo_modificado.js
```
*Si esto falla, debes detener todo, rastrear `SyntaxError: Unexpected token`, arreglar los brackets `{}()` usando tu memoria contextual o comandos, y volver a testear.*

### 2.2 Prohibición Literal del "Hardcoded PASS"
Si vas a auditar un sistema generando un script `audit_new.js` o `run_final_audit.js`, el script de testeo **jamás** debe imprimir pasajes duros como `console.log("✅ PASS: Single URL")`. La auditoría **siempre** debe leer el resultado dinámico del DOM o parsear las líneas emitidas por el generador y contarlas con condicionales. Si tus scripts de prueba devuelven verdades de perogrullo como `check("Mi Regla", true)`, se considerará Sabotaje Arquitectónico.

### 2.3 Single Source Of Truth (SSOT) Credentials Override
Cuando trabajes con el "URL Builder" en generadores de M3U8, recuérdese que la reconstrucción manual desde `credentialsMap` es la **VERDAD ABSOLUTA OMEGA**. 
Si el URL del canal original (`channel.url`) viene tokenizado por la API como `http://.../live/play/TOKEN/id`, debe ser DESTRUIDO y reemplazado usando el formato estricto:
```javascript
let existingUrl = null; // FORCE RECONSTRUCT
```
Sin embargo, **debes tener cuidado de no inyectar parámetros de contaminación (`&format=...`) que causen "Clave Incorrecta"**. Adhiérete a la **Regla Absoluta OMEGA**.
