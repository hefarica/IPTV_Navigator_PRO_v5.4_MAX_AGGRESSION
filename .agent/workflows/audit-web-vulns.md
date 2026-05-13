---
description: Flujo para auditar el ecosistema ante inyecciones Owasp L7 y asegurar blindaje SSRF
---

# AUTONOMOUS AUDIT BATTLE-WORKFLOW: WEB VULNS (IPTV CONCURSO)

Este workflow permite a cualquier Agente IA ejecutar un simulacro de escaneo de penetración interno con la misión de verificar si la infraestructura PHP y JS del IPTV Navigator PRO está preparada contra ataques web letales de los competidores.

## PASO 1: Análisis Dinámico de Contaminación de Inputs
- **Objetivo:** Verificar si los inputs HTTP GET expuestos están adecuadamente castrados (Zero-Trust).
- **Acción (IA):** Debes auditar el código estático de `resolve_quality_unified.php` en los bloques correspondientes a la inyección GET de credenciales y host, y verificar que pasen forzosamente por filtros RegEx estrictos o type casting (`(string)` y enjaulamientos de URL locales).

## PASO 2: Confirmación SSRF 
- **Objetivo:** Auditar la función `cURL` interna (`rq_fetch` u análogas) para detectar si acepta IPs privadas en el destino antes de resolver.
- **Acción (IA):** Asegurar que las variables de dominio objetivo nunca confíen ciegamente en resoluciones no-controladas, y que la cabecera `Host:` sea verificada.

## PASO 3: Auditar Persistencia en Cookies y URL
- **Objetivo:** Bloquear fuga y fijación de sesiones (Session Fixation).
- **Acción (IA):** Inspeccionar si cualquier parte del generador M3U8 Frontend vierte credenciales sensibles en `localStorage` sin la respectiva expiración o sin ofuscación, proponiendo siempre su reemplazo o saneamiento bajo encriptación en la capa final antes de que el M3U8 o el ZIP salga.
