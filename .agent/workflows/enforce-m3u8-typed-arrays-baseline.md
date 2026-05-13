---
description: enforce-m3u8-typed-arrays-baseline
---

# Flujo de Trabajo Maestro: M3U8 TYPED ARRAYS PERFECT BASELINE v10 (OMEGA)

Este flujo es OBLIGATORIO para auditar, modificar, regenerar o parchear cualquier lógica del lado cliente/servidor que involucre el ensamble masivo de Listas M3U8 dentro del proyecto **IPTV Navigator PRO v5.4**.

1. **Reclamo de Identidad**: Antes de empezar cualquier operación, el modelo debe leer la habilidad base: `@m3u8_typed_arrays_perfect_baseline_v10/SKILL.md`. Solo tras esta lectura se le permite intervenir la arquitectura JS o PHP del generador.
2. **Validación de la Plantilla M3U8 Referencia**: Revisar que el framework de construcción (habitualmente dentro de `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`) mantenga el esquema `Array.push()` para cada una de las 300+ líneas directivas detectadas como *línea base*.
   - Todo cambio debe reflejarse como adiciones independientes al Typed Array modular (`build_extvlcopt`, `build_kodiprop`, `build_exthttp`, etc.).
3. **Auditoría de Inyectables de 12 Horas**: Verificar con suma agresión (Regex/Line by line) que las siguientes integraciones matemáticas sigan en su lugar:
   - `build_extvlcopt()` cuenta con el filtro pesado con `tonemap=mobius`, `format=yuv444p10le`, y `minterpolate=120`.
   - `build_exthttp()` contiene `"X-Cortex-AI-Super-Resolution": "REALESRGAN_X4PLUS_LITE"`, `"X-Luma-Precision": "12-BIT-FLOATING"`, etc.
   - `build_omega_crystal_uhd_14gaps()` cuenta con todos los mecanismos SPOOFING (`SHIELD_TV_PRO_2023`), BUFFER `ADAPTIVE_PREDICTIVE_NEURAL`, AV1 FALLBACK (`HEVC>H264>BASELINE`), CODEC-PRIORITY y TELEMETRY (`TVQM`, `TR101290`).
   - `build_kodiprop()` inyecta `vrr_sync`, `audio_passthrough_earc`, y `drm_widevine_enforce`.
   - `#EXT-X-MEDIA` (SIN URI=), `#EXT-X-I-FRAME-STREAM-INF` (SIN URI=), `#EXT-X-STREAM-INF` + 1 URL sobreviven en L10 de `generateChannelEntry`. FIX 2026-04-17: `EXT-X-MAP:URI="init.mp4"` eliminado (causaba 404).
   - `#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES` está alojado luego del `SERVER-CONTROL` en el header global.
4. **Alerta de Regresión Zero Tolerance**: Cualquier hallazgo en el cual el código utilice *template strings planas* para agrupar metadata y pierda 1 o más directivas debe corregirse **de tajo inmediato**, priorizando y devolviendo cada directiva a un elemento por línea de un array atómico JS.
5. **Certificación Final**: La salida de este workflow concluye informando de manera explícita que la matriz base mantiene el estándar 10.0/10.0.
