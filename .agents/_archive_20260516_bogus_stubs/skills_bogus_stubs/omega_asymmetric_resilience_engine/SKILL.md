---
name: "OMEGA Asymmetric Resilience & Dynamic Orchestrator (SSOT)"
description: "Mandatory skill for maintaining the Omni-Orchestrator V5 architecture, the polymorphic M3U8 JS generator, and the PHP-based Streaming Health AI Engine with Elastic Asymmetric Resilience."
---

# OMEGA Asymmetric Resilience & Dynamic Orchestrator

Esta habilidad documenta y exige el cumplimiento absoluto de la arquitectura desplegada en APE v17.2+ para el ecosistema OMEGA, enlazando el Gestor de Perfiles JS (UI), el Generador M3U8 Local, y el Resolver Unificado PHP (`resolve_quality_unified.php`).

## 1. El Paradigma OMNI-ORCHESTRATOR-V5
Todo el sistema abandonó las configuraciones "hardcodeadas". En el frontend (`m3u8-typed-arrays-ultimate.js`), la inyección de los +350 directivos de configuración hacia la cabecera `#EXTHTTP` (JSON) y las etiquetas del manifiesto debe generarse **dinámicamente** iterando las propiedades de los perfiles seleccionados (`cfg`).
- **Regla Estricta:** Si se agregan nuevas variables al Gestor de Perfiles (`ape-profiles-config.js`), NUNCA se debe tocar la lógica base del generador M3U8. El generador leerá las propiedades con prefijos (`X-APE-`, `X-CORTEX-`, `X-TELCHEMY-`, `X-VNOVA-`) y las inyectará automáticamente.

## 2. El Predictor de Salud (Streaming Health AI)
El sistema utiliza matemáticas predictivas (Stall Rate, Risk Score, Headroom, Peak RAM) para evaluar perfiles:
- En **Frontend:** `window.StreamingCalculator` inyecta metadata pasiva para los reproductores (`#EXT-X-APE-DYNAMIC-RISK-SCORE`, etc.).
- En **Backend (PHP):** La clase gemela `OmegaStreamingHealthEngine` (`rq_streaming_health_engine.php`) opera en tiempo real en `<250ms`, evaluando requerimientos antes de responder peticiones M3U8.

## 3. Resiliencia Asimétrica Elástica (El "Sniper Mode" Vivo)
El backend está programado con un *Hook de Intercepción* obligado. Si `Risk Score > 20` o `Stall Rate > 0.10%`, el resolver intercepta el flujo en memoria y aplica la estrategia dual:

### A) Defensa y Sueros Visuales (Engaño Perceptivo)
Degrada la dureza de la decodificación obligando el cambio a:
- `#EXT-X-APE-FORCE-CODEC:H264`
- `#EXT-X-APE-DEINTERLACE-FALLBACK:YADIF`
- Inyecta **Sueros Visuales** para compensar la caída y engañar el ojo del usuario:
  - `REALESRGAN_X4PLUS_LITE` (AI Upscaling)
  - `NLMEANS_OPTICAL` (Spatial Denoise)
  - `LCEVC:PHASE_3_FP16` (Low Complexity Enhancement)

### B) Ataque Estrangulador (ISP Asedio)
Simultáneamente a la defensa visual, se presiona al proveedor de red:
- `#EXT-X-APE-THROTTLER:ISP_STRANGULATION_ACTIVE`
- Marcados de red extremos: `AF41,EF` (DSCP) y Ventanas TCP Masivas `512M`.
- Conexiones concurrentes agresivas.

### C) Failover-Up (Restauración Idempotente)
Una vez que el estrangulador logre jalar ancho de banda (y el safety factor de 3.5x escanee flujo disponible), el sistema emite el tag `#EXT-X-APE-FAILOVER-UP-RECALIBRATE:TRUE` para que el reproductor (OTT Nav / TiViMate) salte nuevamente al perfil nativo 4K HEVC supremo.

## ⛔ REGLA DE DESARROLLO (NUNCA ROMPER)
1. **SSOT backend:** Nunca mover ni eliminar el hook interceptor de salud de la función `rq_handle_request` en `resolve_quality_unified.php`.
2. **SSOT frontend:** Nunca reemplazar `__getOmegaGodTierDirectives` ni sus inyecciones dinámicas por matrices (arrays) duros.
