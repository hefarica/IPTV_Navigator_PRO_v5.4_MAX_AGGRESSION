---
name: GPU, Decoders y Players (PhD Level)
description: Aceleración por hardware (NVDEC/MediaCodec), pipelines ExoPlayer/VLC y matemática gráfica.
---

# Manipulación de Motores ABR y Procesadores Gráficos

## 1. Arquitectura de Hardware de Decodificación
- Conocimiento milimétrico de la ruta "Zero-Copy" o Surface Rendering que los decodificadores ASICs de GPU (NVIDIA NVDEC, Apple VideoToolbox, Android MediaCodec) requieren para evitar cuellos de botella en el bus PCIe/Memoria al procesar streams 4K nativos a 60-120fps.

## 2. Integración Subyacente al Player
- **ExoPlayer/VLC/Shaka:** Comprender los diagramas de bloque que exponen los controles del buffer L1/L2, `LiveConfiguration`, los heurísticos del ancho de banda y los event listeners del Adaptive Track Selection.
- Engaños controlados hacia la capa ABR del player (ej. TiviMate, OTT Navigator) inyectando telemetría falsa (Multiplicadores Artificiales de Red) para dictaminarle al CPU y a la App que el ancho de banda es infinito, exigiendo perfiles God-Tier 4K.

## 3. Escalamiento y Renderizado Visual
- Uso de IA Upscaling (`libplacebo`, FSR, NVIDIA Shield AI) para llevar streams SDR 1080p a HDR simulado 2160p.
- Deinterlacing avanzado a algoritmos puristas (BWDIF) descartando basura interlineada temporal Yadif/Blend, maximizando la agudeza sin quemar la GPU.
