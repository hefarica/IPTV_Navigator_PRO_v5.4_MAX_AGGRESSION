---
description: Site Reliability Engineering (SRE) - Monitoreo & Observabilidad pura - Síntesis de Telemetría Sintética Extrema Asíncrona (Synthetic Probing)
---
# Síntesis de Telemetría Sintética Extrema Asíncrona (Synthetic Probing)

## 1. Definición Operativa
La capacidad de diseñar bots L2 O(1) inmutables distribuidos mundialmente que se comportan como humanos (headless browers/curls forzosos L7), detectando que la plataforma 'dice estar viva' L5 pero funcionalmente está bloqueada asincrona P2P.

## 2. Capacidades Específicas
- Inyección Puppeteer/Playwright crudo asíncrono L4 L7
- Monitoreo multi-zona BGP Ciega Asimétrica L3
- Detección Semántica Cruda (DOM Loaded vs Data Loaded L2)

## 3. Herramientas y Tecnologías
**Datadog Synthetics, Blackbox Exporter, Cypress L4**

## 4. Métrica de Dominio
**Métrica Clave:** Detección visual o de payload vacío crudo asíncrono de una página Blanca (Blank-Screen 200 OK L5 L3) T < 10s P2P superando el HealthCheck tradicional L4.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El Resolver IPTV devuelve M3U8 asíncrono L7 con cabecera `200 OK`, pero vacío L5 (cero canales). El Synthetic Playback lo detecta L4 al ver que no hay PIDs crudos de video e invoca un Fallback L3 L1.
