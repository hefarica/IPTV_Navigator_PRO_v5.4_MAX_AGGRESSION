---
name: iptv-hdr-lcevc-pipeline
description: Guía de implementación del pipeline de calidad extrema en IPTV. Usar cuando necesites exprimir la calidad visual de un stream, aplicar HDR10+, Dolby Vision, LCEVC Phase 4, AI Super Resolution, o configurar el tone-mapping en VLC/ExoPlayer para lograr una calidad de imagen superior sin aumentar el ancho de banda.
---

# IPTV: Pipeline de Calidad Extrema (HDR/LCEVC)

Esta habilidad describe cómo estructurar una lista M3U8 para forzar a los reproductores a activar sus pipelines de mejora de imagen por hardware y software, exprimiendo la máxima calidad visual posible incluso en streams de bajo bitrate.

## 1. El Objetivo

El objetivo no es simplemente reproducir el video, sino pasarlo por un pipeline de procesamiento visual en tiempo real que mejore la calidad de imagen de manera imperceptible (sin latencia ni artefactos). Esto se logra mediante la combinación de directivas de reproductor nativo (`#EXTVLCOPT`) y directivas propietarias (`#EXT-X-APE-HDR-DV`).

## 2. LCEVC Phase 4 (MPEG-5 Part 2)

Low Complexity Enhancement Video Coding (LCEVC) es obligatorio en la arquitectura OMEGA. Permite enviar un stream base de baja resolución (ej. 720p) y una capa de mejora que el reproductor usa para reconstruir la imagen a 4K con menos bitrate que un 4K nativo.

```m3u8
#EXT-X-VNOVA-LCEVC:VERSION=4,ENHANCEMENT_LAYER=TRUE
#EXT-X-APE-LCEVC-PHASE:4
```

**Beneficio:** Si el reproductor soporta LCEVC, reconstruirá la imagen. Si no, simplemente reproducirá la capa base (compatibilidad universal).

## 3. Override de HDR10+ y Dolby Vision

Muchos streams IPTV SDR se ven opacos en TVs modernos. Forzamos un override de HDR10+ y Dolby Vision inyectando metadata de color (SMPTE ST 2084) directamente en el reproductor.

```m3u8
#EXT-X-APE-HDR-DV:PEAK_NITS=5000,MASTERING_DISPLAY=BT2020,OOTF=BT2446A
#EXTVLCOPT:video-color-space=bt2020nc
#EXTVLCOPT:video-color-primaries=bt2020
#EXTVLCOPT:video-color-trc=smpte2084
#EXTVLCOPT:tone-mapping=hable
#EXTVLCOPT:hdr-peak-luminance=5000
```

**Beneficio:** Obliga a la TV a cambiar al modo HDR, expandiendo el rango dinámico y el volumen de color, incluso si el stream original no tenía los flags HDR correctos.

## 4. AI Super Resolution (RealESRGAN / RIFE_V4)

Para reproductores basados en Android (ExoPlayer) o PCs con GPUs modernas, podemos activar filtros de escalado por IA.

```m3u8
#EXT-X-APE-AI-PIPELINE:UPSCALER=RealESRGAN_x4Plus,INTERPOLATION=RIFE_V4
```

Y para VLC, activamos la cadena de filtros de video (`video-filter`):

```m3u8
#EXTVLCOPT:video-filter=zscale=transfer=st2084:chromal=topleft,nlmeans,bwdif,deband,minterpolate
```

- `zscale`: Mapeo de color de alta precisión.
- `nlmeans`: Reducción de ruido no lineal.
- `bwdif`: Desentrelazado de alta calidad.
- `deband`: Eliminación de banding en gradientes de color.
- `minterpolate`: Interpolación de fotogramas (suavidad de movimiento).

## 5. Hardware Decode Obligatorio

Todo este procesamiento requiere aceleración por hardware. Si se hace por CPU, el video se trabará. Forzamos el hardware decode en VLC y Kodi:

```m3u8
#EXTVLCOPT:avcodec-hw=any
#EXTVLCOPT:hw-dec=all
#KODIPROP:inputstream.adaptive.play_timeshift=true
```

## Resumen del Pipeline

1. **Recepción:** El reproductor descarga el stream (fMP4/CMAF).
2. **Decodificación:** Hardware decode (HEVC/AV1).
3. **Reconstrucción:** LCEVC Phase 4 aplica la capa de mejora.
4. **Escalado:** AI SR escala la resolución.
5. **Color:** Se aplica el override HDR10+ (5000 nits) y tone-mapping (Hable).
6. **Visualización:** La TV recibe una señal 4K HDR impecable, generada a partir de un stream de 8 Mbps.
