---
description: "Flujo Maestro para auditar e implementar la arquitectura OMEGA Asymmetric Resilience en un despliegue completo M3U8."
---

# Workflow: Despliegue de OMEGA Asymmetric Resilience Health Engine

Sigue estos pasos rigurosos para certificar e implementar cualquier cambio futuro o recuperación de la arquitectura del Streaming Health Asimétrico:

1. **Auditar el UI de Perfiles (Frontend JS)**
   Abre `ape-profiles-config.js` y asegúrate de que existen 19 categorías vivas (7 OMEGA GOD-TIER, 12 Core).
   Busca la matriz base `DEFAULT_HEADER_VALUES`. Si creaste una nueva variable (ej. `my_new_ai_filter`), esta *deberá* agregarse al JSON por defecto para prevenir una cascada de nulos.

2. **Auditar el Motor OMNI-ORCHESTRATOR-V5 (Frontend M3U8)**
   Abre `m3u8-typed-arrays-ultimate.js`. Comprueba en el Hook `generateChannelEntry`:
   - Que `__getOmegaGodTierDirectives(channel, cfg);` está ensamblando polimórficamente los arreglos.
   - Que la `window.StreamingCalculator` sigue capturando los valores del UI y empujando sus resultados locales como metadata `#EXT-X-APE-DYNAMIC-*`.

3. **Verificación Sintáctica del SSOT Engine (Backend PHP)**
   Todo el poder destructivo/protector de OMEGA vive en `rq_streaming_health_engine.php`.
   - Revisa la correcta alineación matemática (Formulas de T1, T2, Risk Score).
   - Revisa las líneas `#EXTVLCOPT` y `#EXT-X-CORTEX` inyectadas en la función de intercepción destructiva `enforceHealthConstraintsAndDefend`.

4. **Validar Parcheado de Single Source of Truth (SSOT Resolver)**
   Entra a `resolve_quality_unified.php`.
   - Busca el require inicial que llame al motor (con comprobación de seguridad `file_exists` y `class_exists`).
   - Ubica la inyección final del `$output`, justo antes del `echo $output;`. Debe comprobar la salud y sobreescribirla en base al `$healthConfig` extraído vía `$_GET` o por Default OMEGA (4K, HEVC, 25 Mbps).

5. **Prueba en Vivo en el Reproductor**
   Despliega ambos archivos `resolve_quality_unified.php` y `rq_streaming_health_engine.php` a tu servidor Cloud VPS.
   - Pide al estrangulador asfixiar temporalmente tu ancho de banda LAN o impón una cuota artificial.
   - Observa como OTT Navigator invoca a `nlmeans_optical`, `realesrgan` y levanta más de 10 conexiones TCP forzosas al servidor, mientras te baja la resolución simulada, pero manteniendo una calidad *inviolable*.
