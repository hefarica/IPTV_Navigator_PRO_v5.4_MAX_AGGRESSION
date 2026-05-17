---
name: Compresión de Video y HDR (PhD Level)
description: Teoría de codificación de video H.264/HEVC/AV1, modelos de calidad visual (VMAF/SSIM) y representación avanzada de Color/HDR (BT.2020, PQ/HLG, Tone-Mapping).
---

# Teoría de Codificación y Modelos de Calidad

## 1. Codificación Avanzada
- **Jerarquía de Codecs:** Dominar las diferencias estructurales entre H.264 (AVC), H.265 (HEVC) y AV1.
- **Estructura GOP (Group of Pictures):** Ajustar la longitud y distancia de los I-Frames (Keyframes) para predecir y calcular factores críticos como la velocidad de zapping (arranque rápido) y motion blur en escenas de alta complejidad motriz.
- **Predictive Quality Control:** Comprender el impacto del QP (Quantization Parameter), rate-control (CBR vs VBR vs Capped VBR) en transmisiones en vivo.
- **Per-Title Encoding:** Adaptar las escaleras de resolución y bitrate basándose estrictamente en la complejidad espacial y temporal del componente en tiempo real (ej. Fútbol vs Noticias).

## 2. Modelos de Calidad Perceptual
- **VMAF (Video Multimethod Assessment Fusion):** Uso de puntuación ponderada para dictaminar calidad visual objetiva idéntica a la vista humana.
- **PSNR y SSIM:** Correlacionar ruidos como macro-blocking, banding (bandas de color crudas) y blurring (desenfoque) en transmisiones deportivas 4K con caídas de bitrate. Aplicación directa para el `Expert_Skill_SSIM_Predictor`.

## 3. Color, Luminancia y HDR (High Dynamic Range)
- **Espacios de Color:** Mapeo matemático entre SDR (BT.709) y HDR (BT.2020).
- **Curvas de Transferencia:** Interpretación de SMPTE ST.2084 (PQ - Perceptual Quantizer, mastering up to 10k nits) frente a HLG (Hybrid Log-Gamma, backwards compatibility con SDR).
- **Tone-Mapping Computacional:** Evitar zonas quemadas ("blown-out highlights") forzando filtros de mobius, hable o reinhard al aplicar el downscale SDR-HDR y control de nits paramétrico en tiempo de reproducción.
