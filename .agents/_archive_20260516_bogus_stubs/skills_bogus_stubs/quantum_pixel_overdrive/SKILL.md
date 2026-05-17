---
name: Antigravity Quantum Pixel Overdrive v5 (Max-Color & AI-SR)
description: Habilidad maestra para el renderizado computacional en VPS, implementando Neural SDR-to-HDR ITM, separación Luma/Chroma Split-Scaling y pre-acondicionamiento para Video Super Resolution (AI-SR/NPU).
---

# 🌌 Antigravity Quantum Pixel Overdrive (v5)

Esta directriz exige la inyección de técnicas de renderizado computacional subterráneas y manipulación de espectro a nivel de bitstream, superando los métodos tradicionales de escalado. Preparamos el flujo logístico para forzar al procesador neuronal (NPU) y al panel Quantum Dot/OLED del cliente a encender su brillo máximo y escalar con nitidez absoluta.

## 1. Motor ITM (Inverse Tone Mapping) para Expansión BT.2020

El pipeline no debe limitarse a un pase (passthrough) simple con calidades bajas. Cuando enfrentamos un stream SDR sub-estándar, se ordena una expansión algorítmica:

* Usando mapeo inverso (como zscale/libplacebo), el sistema traduce el SDR BT.709 a BT.2020 de 10-bits.
* El panel del cliente es forzado a activar el modo HDR/HLG (Deep Color), multiplicando geométricamente la saturación del volumen de píxel.

## 2. Luma/Chroma Split-Scaling (Reconstrucción 4:4:4)

Escalar con métodos básicos emborrona el canal Chroma.

* **Directiva:** Se separa la Luma (Brillo) del Chroma (Color). A la Luma se le aplica un Debanding (ej. `hqdn3d` o `nlmeans` vectorial en FFmpeg/VLC core) para erradicar artefactos.
* **Metadatos HTTP/HLS:** Inyectar cabeceras agresivas en `#EXTHTTP` (OTT Navigator): `"X-Chroma-Subsampling":"4:4:4"`, `"X-Color-Depth":"10bit"` para indicar al hardware decoder que reserve memoria extrema.

## 3. Pre-Acondicionamiento para NPU (AI-SR Trigger)

En lugar de asfixiar las CPUs del VPS escalando artificialmente a 4K con métodos primitivos (Bicubic), el objetivo es entregar un "Clean Canvas" o Lienzo Limpio (1080p prístino con Zero-Noise).

* Las CPUs actúan como purificadores (Denoising vectorial).
* A nivel PHP Resolver, se adjuntan banderas para desviar todo peso a MediaCodec HW para Post-Proc:

```nginx
#EXTVLCOPT:video-filter=hqdn3d
#EXTVLCOPT:postproc-q=6
#EXTVLCOPT:hw-dec-accelerator=mediacodec,vaapi,nvdec
#EXTVLCOPT:video-scaler=vdpau,opengl
```

* **Trigger:** Añadir flag `"X-Force-AI-SR":"true"` en el M3U8 Generator. La pantalla del usuario asume la meta de escalar el video usando IA propietaria (AI Super Resolution), exhibiendo colores, texturas y pop profundos.

## Mandato Absoluto

El objetivo técnico en 2026 de APE ULTIMATE no es la compresión extrema VMAF como Netflix; es el impacto visual absoluto utilizando las NPUs del hardware final del cliente desatadas de límites de proxy.
