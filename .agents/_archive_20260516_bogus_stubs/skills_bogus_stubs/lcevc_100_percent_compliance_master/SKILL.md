---
name: LCEVC 100% Compliance Master (v16.4.1)
description: Reglas definitivas para mantener la coherencia absoluta 100/100 en la inyección de LCEVC Phase 3 y Phase 4, sin caer en bugs de SIGNAL_ONLY o incoherencia de códecs base.
---

# 🏆 LCEVC 100% Compliance Master (Doctrina de la Lista 9)

## 📌 HISTORIA Y CONTEXTO

El **18 de Marzo de 2026**, la generación de la **Lista (9)** alcanzó el hito histórico de lograr un puntaje de **100/100** en calibración LCEVC en un entorno de 6,910 canales. Previo a esta iteración, era común que la arquitectura fallback degradara silenciosamente los canales a un perfil LCEVC `SIGNAL_ONLY` o reportara de manera hardcodeada a la NPU que la compresión era `AVC_BASE_LCEVC_SEI_NAL`, aunque el flujo original fuera HEVC. Esto desactivaba el Edge-Compute y resultaba en una dramática caída de VMAF.

Esta Skill consolida las 5 métricas críticas que nunca más deben ser violadas en el compilador `m3u8-typed-arrays-ultimate.js`.

## 🛠️ REGLAS DE ORO (INMUTABLES)

### 1. Dinamismo Estricto del LCEVC Base Codec
**NUNCA**, bajo ninguna circunstancia, se debe hardcodear el `#EXT-X-APE-LCEVC-BASE-CODEC` o `#EXT-X-APE-LCEVC-BASE-POLICY` a `AVC` o equivalente. Se debe extraer dinámicamente del perfil:
- Si el nodo es `P0` (8K Supreme), el motor debe empujar `AV1`.
- Si el nodo es `P1, P2, P3, P4, P5`, debe ser forzado como `HEVC`.
- La consistencia entre el bitstream y este flag garantiza que LCEVC procese en `ACTIVE` phase mapping.

### 2. Factor de Escala (Scale Factor) Dedicado
Cada resolución de perfil exige una inyección distinta de Scale Factor en su Enhancement Layer:
- **P3 (1080p FHD):** `2x` (Rutea a 4K)
- **P4 (720p HD):** `3x` (Rutea a 4K)
- **P5 (480p SD):** `4.5x` extremo (Rutea a 4K)
> Esto debe venir derivado dinámicamente con `const lc = resolveLcevcConfig(profile, cfg);`.

### 3. Fusión Atómica de Calidad Perceptual (Quantum Pixel)
Garantizar al 100% el envío de:
```plaintext
#EXT-X-APE-QUANTUM-CHROMA-SUBSAMPLING:4:4:4
#EXT-X-APE-LCEVC-NEURAL-UPSCALE:ESRGAN-4x
#EXT-X-APE-LCEVC-TARGET-RES:3840x2160
```
La omisión de solo uno de estos tres descarrilará el *Semantic Engine (Phase 4)*, devolviendo el procesamiento al CPU y degradando visualmente el canal.

### 4. Cache-Busting del Generador Frontal
Si se editan las funciones Typed-Array, JavaScript del Frontend o Core de Perfiles, **es obligación y mandato** incrementar la versión en el fichero index principal (`index-v4.html` o superior) en el tag:
```html
<script src="js/ape-v9/m3u8-typed-arrays-ultimate.js?v=XX.X.X"></script>
```
Sin esta invalidación el compilador usará código obsoleto.

### 5. Las 6 Métricas de Éxito (100/100 Puntuación)
Cualquier auditoría a la salida `.m3u8` generada por este sistema en formato `v5.4 MAX_AGGRESSION` debe pasar la siguiente comprobación regex interna y arrojar 0 incoherencias:
1. `LCEVC-BASE-CODEC` es HEVC o AV1 en el 100% del playlist.
2. `LCEVC-STATE:ACTIVE` universal en el 100% del playlist.
3. El flag de hardware `hw-dec-accelerator=mediacodec,vaapi,nvdec` es mandatorio.
4. Activación de Fase 3 y 4 (Phase 4 Semantic, Phase 3 ESRGAN-4x).
5. Chromasampling `4:4:4` en todos los flujos.
6. Acondicionamiento `bwdif` de de-interlace activo (`bwdif;yadif2x;yadif`).
