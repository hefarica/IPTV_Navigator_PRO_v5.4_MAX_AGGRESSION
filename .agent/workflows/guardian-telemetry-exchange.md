---
description: Flujo Maestro - Telemetría APE Guardian v16 & Feedback Exchange
---

# Flujo de Trabajo: APE Guardian Telemetry Exchange

Este workflow garantiza la transmisión de logs, errores de `resolve_quality_unified.php` (latencia, fallos de codec, timeouts HLS) directamente hacia el panel UI en `index-v4.html` (Gestor de Perfiles APE v9.0), usando una arquitectura **0-Bloqueo de Disco (Pure RAM)** y de alta eficiencia.

## 1. El Emisor (Resolver: `resolve_quality_unified.php`)
Cuando el resolver intercepta una solicitud, registra los tiempos y el perfil P0-P5 original.
- Si el cliente Player pide algo que la red del ISP no soporta, el resolver aplica un Fallback HLS y anota la métrica.
- Las estadísticas se envían atómicamente a `/dev/shm/guardian_exchange.json` para evitar daño en las lecturas simultáneas y desgaste de SD/NVMe.

## 2. El Puente (Proxy: `guardian.php`)
Usa este puente o un alias en el NGINX VPS `iptv-ape.duckdns.org/guardian` que apunta a `/dev/shm/guardian_exchange.json`. 
- **Cors:** OBLIGATORIAMENTE debe emitir `Access-Control-Allow-Origin: *`.
- **Caché:** Responder con cabeceras para forzar la lectura del contenido en RAM y no cachés Edge/ISP.

## 3. El Recetor (Client: `index-v4.html` & `ape-profiles-config-v5.js`)
El "Gestor de Perfiles APE v9.0" asume la culpa si los parámetros (SSOT) ocasionan fallas.
- El Frontend realiza un `fetch()` periódico al `endpoint`.
- Interpreta el JSON. Si detecta una cadena de degradaciones (`P1 -> P5`), debe parsear el error y escupirlo al Event Log del panel Guardian Engine.
- **Auto-Corrección Simulada:** Muestra al Operador un texto "Sugerencia: Cambiar LCEVC Phase 4 a False debido a Timeout".
