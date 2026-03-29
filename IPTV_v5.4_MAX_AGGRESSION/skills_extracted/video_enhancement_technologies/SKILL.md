---
name: video_enhancement_technologies
description: Comprehensive reference for ALL video enhancement technologies used in the APE IPTV pipeline — FFmpeg filters, AI super-resolution (Real-ESRGAN, RealBasicVSR, BasicSR), neural video compression (GNVC), GPU SDKs (NVIDIA RTX, Intel VSR), HDR tone mapping (HDRnet, libplacebo), and MPEG NN post-filtering standards.
---

# Skill: Video Enhancement Technologies — Master Reference

## Filosofía APE

> PHP = Orquestador. FFmpeg = Motor. GPU = Acelerador. Client-Side Enhancement.
> Cero transcodificación en servidor. TODO es directivas/hints al player.

---

## 1. FFmpeg Filters (Fuente: ffmpeg.org/ffmpeg-filters.html)

### 1.1 Filtros Usados en el Pipeline APE

| Filtro | Tipo | Función | Valor APE | Doc |
|--------|------|---------|-----------|-----|
| `bwdif` | Deinterlace | Bob Weaver Deinterlacing Filter — híbrido temporal+espacial | `bwdif=1` (**Protegido**) | [ref](https://ffmpeg.org/ffmpeg-filters.html#bwdif) |
| `hqdn3d` | Denoise | High Quality 3D Denoiser — temporal + espacial adaptativo | `hqdn3d=2:1:3:2` (STABLE) / `4:3:6:4.5` (recovery) | [ref](https://ffmpeg.org/ffmpeg-filters.html#hqdn3d) |
| `afftdn` | Audio Denoise | FFT-based audio denoiser — ruido periódico en dominio frecuencia | `afftdn=nf=-20` (solo SD/HD) | [ref](https://ffmpeg.org/ffmpeg-filters.html#afftdn) |
| `eq` | Color | Ecualizador de brillo/contraste/saturación/gamma | `eq=brightness=0.03:contrast=1.0:saturation=0.65` | [ref](https://ffmpeg.org/ffmpeg-filters.html#eq) |
| `cas` | Sharpen | Contrast Adaptive Sharpening (AMD FidelityFX) | `cas=0.7` (**Protegido** 80%) | [ref](https://ffmpeg.org/ffmpeg-filters.html#cas) |
| `unsharp` | Sharpen | Unsharp masking — complementa CAS para bordes | `unsharp=5:5:0.8:5:5:0.0` (**Protegido**) | [ref](https://ffmpeg.org/ffmpeg-filters.html#unsharp) |
| `zscale` | Color/HDR | Scaling con libzimg — conversión de color space | `zscale=t=linear:p=bt709` | [ref](https://ffmpeg.org/ffmpeg-filters.html#zscale) |
| `tonemap` | HDR→SDR | Conversión tonal HDR a SDR | `tonemap=hable:desat=0` (curva Hable/Reinhard) | [ref](https://ffmpeg.org/ffmpeg-filters.html#tonemap) |
| `minterpolate` | FPS | Motion interpolation con compensación | `fps=120:mi_mode=mci:me=hexbs:mc=64:scd=none` | [ref](https://ffmpeg.org/ffmpeg-filters.html#minterpolate) |

### 1.2 Filtros Adicionales Disponibles (No usados aún)

| Filtro | Uso Potencial | Notas |
|--------|--------------|-------|
| `nlmeans` | Super denoise | Non-local means — mejor calidad que hqdn3d pero 10x más lento |
| `yadif` | Deinterlace | Yet Another DeInterlacing Filter — NO usar (bwdif es superior) |
| `colorspace` | Color conversion | Alternativa a zscale para BT.601→BT.709 |
| `scale` | Resize | `scale=3840:2160:flags=lanczos` para upscale |
| `fps` | Frame rate | Simple frame rate change sin interpolación |
| `setdar/setsar` | Aspect ratio | Forzar DAR/SAR |
| `loudnorm` | Audio | EBU R128 loudness normalization |
| `aresample` | Audio | Resampling de audio (48kHz→96kHz) |

### 1.3 Pipeline Order (Orden IMPORTA)

```
INPUT → bwdif → hqdn3d/afftdn → eq → cas+unsharp → zscale+tonemap → minterpolate → OUTPUT
        ↑deint   ↑denoise       ↑color  ↑sharpen     ↑HDR→SDR          ↑120fps
```

> [!CAUTION]
> **Nunca poner sharpen ANTES de denoise** — amplifica el ruido.
> **Nunca poner tonemap ANTES de color correction** — pierde gamut.

### 1.4 FFmpeg Hardware Acceleration

```
// Decode: Prioridad GPU
-hwaccel cuda -hwaccel_device 0    // NVIDIA
-hwaccel vaapi                      // Intel/AMD Linux
-hwaccel qsv                       // Intel QuickSync
-hwaccel dxva2                     // Windows DirectX
-hwaccel d3d11va                   // Windows Direct3D 11

// Priority chain en APE:
NVDEC > VAAPI > QSV > DXVA2 > D3D11VA > CPU
```

---

## 2. AI Super Resolution

### 2.1 Real-ESRGAN (Tencent ARC Lab)

- **Paper:** [arxiv 2107.10833](https://arxiv.org/abs/2107.10833)
- **Repo:** [github.com/xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)
- **Framework:** Basado en BasicSR (PyTorch)
- **Modelos:**
  - `RealESRGAN_x4plus` — 4x upscale, imágenes generales
  - `RealESRGAN_x4plus_anime` — 4x, optimizado para anime/cartoon
  - `realesr-general-x4v3` — modelo v3 general purpose
  - `realesr-animevideov3` — video anime (temporal consistency)
- **Resoluciones:** Cualquier input → 2x/4x output (ej: 720p→4K)
- **Velocidad:** ~0.3s por frame 1080p en RTX 3090
- **Integración:**
  - CLI: `realesrgan-ncnn-vulkan -i input -o output -s 4`
  - Python: `from realesrgan import RealESRGANer`
  - NCNN: Portable, no requiere CUDA (Vulkan GPU)
- **Uso en APE:** Hint via `X-AI-SR-Level: low` (Samsung/LG TVs con procesador propio)

### 2.2 RealBasicVSR (CVPR 2022, NTU Singapore)

- **Paper:** [arxiv 2111.12704](https://arxiv.org/pdf/2111.12704.pdf)
- **Repo:** [github.com/ckkelvinchan/RealBasicVSR](https://github.com/ckkelvinchan/RealBasicVSR)
- **Framework:** MMEditing / BasicSR
- **Innovación:** Investiga tradeoffs en video super-resolution real
  - Cleaning module ANTES de SR (denoising → enhancing)
  - Stochastic degradation scheme para training con datos reales
  - Temporal propagation bidireccional: usa frames futuros+pasados
- **Diferencia vs Real-ESRGAN:** RealBasicVSR es para VIDEO (temporal consistency entre frames), Real-ESRGAN es por frame individual
- **Uso:** Video enhancement donde la consistencia temporal importa (broadcast IPTV)

### 2.3 BasicSR Framework (XPixel Group)

- **Repo:** [github.com/XPixelGroup/BasicSR](https://github.com/XPixelGroup/BasicSR)
- **Descripción:** Toolbox unificado de restauración de imagen/video (PyTorch)
- **Modelos incluidos:**
  - **EDSR** — Enhanced Deep Residual SR
  - **RCAN** — Residual Channel Attention Networks
  - **SRResNet/SRGAN** — SR con GANs
  - **ESRGAN** — Enhanced SRGAN (precursor de Real-ESRGAN)
  - **EDVR** — Video Restoration with Enhanced Deformable Convolutions
  - **BasicVSR/BasicVSR++** — Video SR con propagación temporal
  - **SwinIR** — Image Restoration usando Swin Transformer
  - **ECBSR** — Real-time SR para dispositivos móviles
- **Training:** Soporta distributed training, mixed precision, wandb logging
- **Uso en APE:** Framework de referencia para entrenar modelos propios si se quisiera server-side SR

---

## 3. NVIDIA RTX Video SDK

### 3.1 RTX Video Super Resolution (VSR)

- **Tecnología:** AI-based upscaling en GPU RTX (Tensor Cores)
- **Modelos:** 4 niveles — `low`, `medium`, `high`, `ultra`
- **Uso en APE:** `X-AI-SR-Level: low` (**Protegido** — NUNCA medium/high, genera artefactos)
- **Resoluciones:** 720p→4K, 1080p→4K nativo en GPU
- **Rendimiento:** Tiempo real a 60fps en RTX 3060+
- **Integración:** Driver-level (automático en Chrome/Edge), SDK para apps
- **VLC Plugin:** No existe plugin oficial. Se usa como hint al sistema operativo

### 3.2 RTX AI Tone Mapping

- **Función:** SDR→HDR en tiempo real usando IA
- **Curvas:** Perceptual + scene-adaptive (superior a tonemap=hable estático)
- **Uso en APE:** Hint via `X-RTX-Tone-Map: adaptive`
- **Requisito:** GPU RTX 20+ series, driver 545+

### 3.3 NVDEC/NVENC

- **NVDEC:** HW decode — H.264, H.265/HEVC, VP9, AV1 (RTX 40+)
- **NVENC:** HW encode — No usado en APE (cero transcodificación)
- **FFmpeg:** `-hwaccel cuda -hwaccel_output_format cuda`
- **Uso en APE:** `avcodec-hw=any,nvdec` en EXTVLCOPT

---

## 4. Intel Video Super Resolution (VSR)

- **Tecnología:** RAISR-based (Rapid and Accurate Image Super Resolution, Google)
- **Open Source:** [OpenVisualCloud GitHub](https://github.com/OpenVisualCloud)
- **Integración:** OpenVINO + FFmpeg via `vpp_qsv` filter
- **Resoluciones:** 720p→1080p, 1080p→4K
- **Rendimiento:** Real-time en Intel Arc GPUs, 30fps en iGPU
- **FFmpeg filter:** `vpp_qsv=detail=50` (mejora de detalle por QSV)
- **Uso en APE:** Hint via `X-Intel-VSR: enabled` para clientes con iGPU Intel

---

## 5. HDRnet (Google Research)

- **Paper:** [arxiv 1707.01024](https://arxiv.org/abs/1707.01024)
- **Tecnología:** Per-frame adaptive HDR tone mapping usando bilateral learning
- **Innovación:**
  - Red neuronal que aprende transformaciones de color por frame
  - Bilateral grid: aplica transformaciones en espacio bilateral (posición + intensidad)
  - 1000+ FPS en GPU (extremadamente rápido)
- **Uso en APE:** Referencia teórica para `X-HDR-Tone-Mapping: adaptive`
- **Diferencia vs tonemap=hable:** HDRnet es adaptativo (cambia por escena), hable es estático

---

## 6. libplacebo (VideoLAN)

- **Repo:** [code.videolan.org/videolan/libplacebo](https://code.videolan.org/videolan/libplacebo)
- **Descripción:** GPU-accelerated color management y rendering
- **Características:**
  - Color space conversion (BT.601, BT.709, BT.2020, Display P3)
  - HDR tone mapping (múltiples curvas: hable, reinhard, mobius, clip)
  - Debanding (eliminar banding en gradientes)
  - Film grain synthesis
  - Custom LUT support
  - HDR10+ / Dolby Vision metadata parsing
- **Integración FFmpeg:** `--enable-libplacebo`, filter `libplacebo`
- **VLC 4.0:** Usa libplacebo como backend de rendering
- **mpv:** Usa libplacebo nativo
- **Uso en APE:**
  - `X-Libplacebo: true,hdr,color-management,tonemap` (hint)
  - Kodi: InputStream.Adaptive con libplacebo para HDR→SDR real

---

## 7. Neural Video Compression

### 7.1 GNVC-VD (Generative Neural Video Compression)

- **Paper:** [huggingface papers/2512.05016](https://huggingface.co/papers/2512.05016)
- **Innovación:** Usa modelos generativos para comprimir video
  - Posterior latente reduce bits transmitidos
  - Decoder usa difusión para reconstruir detalles
  - Supera H.266/VVC en perceptual quality (LPIPS, FID)
- **Estado:** Investigación (no real-time aún)
- **Relevancia APE:** Futuro — cuando los codecs neurales sean real-time

### 7.2 MPEG NN Post-Filtering (152nd MPEG Meeting)

- **Fuente:** [MPEG Column 152](https://records.sigmm.org/2025/12/09/mpeg-column-152nd-mpeg-meeting/)
- **Estándar:** MPEG está desarrollando estándares para post-filtering basado en redes neuronales
  - Aplicado DESPUÉS del decoder (no cambia el codec)
  - Super-resolution, denoising, deblocking, film grain
  - Transmitido como metadata en el bitstream
- **Relevancia APE:** Los futuros players tendrán NN post-filtering nativo

---

## 8. CVQE Benchmarking 2025

- **Paper:** [arxiv 2509.10407](https://arxiv.org/pdf/2509.10407)
- **Descripción:** Compressed Video Quality Enhancement benchmarking
  - Evalúa métodos de mejora de calidad para video comprimido
  - Métricas: PSNR, SSIM, LPIPS, VMAF, FID
  - Compara: EDVR, BasicVSR, SwinIR, Real-ESRGAN en video comprimido

### 8.1 NTIRE 2025 UGC Video Enhancement

- **Paper:** [arxiv 2505.03007](https://arxiv.org/html/2505.03007v1)
- **Challenge:** User-Generated Content video enhancement
  - Foco en video de cámaras de consumo (ruido, baja resolución, compresión)
  - Ganadores usan combinación de denoise + SR + color correction

---

## 9. Referencia Rápida — Qué Usar y Cuándo

### Para IPTV LIVE (nuestro caso):

| Necesidad | Solución Client-Side | Directiva APE |
|-----------|---------------------|---------------|
| Deinterlace 1080i | bwdif (FFmpeg/VLC) | `bwdif=1` |
| Denoise SD/HD | hqdn3d + afftdn | `hqdn3d=2:1:3:2` + `afftdn=nf=-20` |
| Denoise 4K | **OFF** (preservar textura) | Sin filtro |
| HDR→SDR fallback | zscale + tonemap=hable | `zscale=t=linear:p=bt709,tonemap=hable` |
| Sharpen | CAS + unsharp (80%) | `cas=0.7` + `unsharp=5:5:0.8` |
| Upscale 720→4K | NVIDIA RTX VSR / TV processor | `X-AI-SR-Level: low` |
| Frame interpolation | minterpolate 120fps | `fps=120:mi_mode=mci` |
| Buffer anti-cut | VLC network-caching | `network-caching=360000` |
| Kodi adaptive | InputStream.Adaptive | 30+ KODIPROP directives |

### Para FUTURO (cuando sea real-time):

| Tecnología | Estado | ETA |
|-----------|--------|-----|
| Real-ESRGAN video | Funciona pero no real-time server-side | 2026-2027 |
| GNVC neural codec | Investigación | 2028+ |
| MPEG NN post-filter | Estándar en desarrollo | 2027+ |
| libplacebo en VLC 4 | VLC 4.0 beta disponible | 2026 |

---

## 10. Los 10 Parámetros Protegidos (NUNCA MODIFICAR)

| # | Param | Valor | Tecnología |
|---|-------|-------|-----------|
| 1 | Deinterlace | `bwdif=1` | FFmpeg bwdif |
| 2 | Sharpness | `cas=0.7` + `unsharp=5:5:0.8` = 80% | FFmpeg CAS + unsharp |
| 3 | AI-SR Level | `low` | NVIDIA RTX VSR |
| 4 | Denoise 4K | OFF | — |
| 5 | ALLM | `false` | HDMI 2.1 |
| 6 | Audio | eARC | HDMI eARC |
| 7 | Upscaling | TV native first | Sony XR / Samsung |
| 8 | Color Temp | WARM | Display |
| 9 | Contrast | `1.0` (100%) | FFmpeg eq |
| 10 | Saturación | `0.65` (65%) | FFmpeg eq |
