---
name: god_tier_perceptual_quality
description: Perceptual quality-first streaming architecture with per-scene encoding, AI-driven optimization, and premium multi-codec delivery
category: Architecture & Optimization
version: 1.0.0
importance: GOD_TIER
---

# APE ULTIMATE: Arquitectura de Calidad Perceptual GOD-TIER

> **"Primero, fidelidad absoluta y preservación del grano de la película. Segundo, y solo si sobra calidad, eficiencia de red. No existe 'ahorro de ancho de banda' a costa de un macrobloque en una cara en 4K."**

Esta Doctrina Arquitectónica Suprema establece cómo la plataforma transiciona del paradigma corporativo *"Bitrate Efficiency"* al paradigma APE *"Quality Ceiling & Quality Floor"*.

## 1. Resumen Ejecutivo

El sistema debe diseñarse desde el principio (Ingesta -> Encoder -> CMAF -> CDN -> Player) para entregar calidad de Master ProRes/Mezzanine tanto como el ancho de banda último permita.

* **Decisiones Claves:** VVB Buffer Ultra-Largo, Multi-Codec puro (HEVC + AV1 + Fallback H264), y **Rate Control Guiado por Complejidad Visual** antes que por "Target Rate".

## 2. Definición del Problema: Ahorro vs Esplendor

Los ABR estáticos asumen que *"Si tienes 10 Mbps de fibra, te doy 10 Mbps de video"*. Un enfoque APE God-Tier define que: *"Si tienes 1 Gbps, pero la escena del bosque requiere 35 Mbps para preservar el grano, te enviamos 35 Mbps en picos controlados"*.
La obsesión por el CBR achata (softens) los detalles y ahoga las gradientes oscuras (Banding).

## 3. Arquitectura End-To-End

`[Source Premium / Mezzanine 10-bit HDR]`
                 |
`[Perceptual Frame / Noise Analyzer (AI)]`
                 |
`[God-Tier Encoder (AV1 / HEVC) con VBR-Constrained y Capping Alto]`
                 |
`[Origin / Multi-CDN (Optimización Request-Collapsing & Edge Cache de 2MB)]`
                 |
`[Player ExoPlayer Configurado con "Low Downswitch Agresivo" y Buffer de 15s]`

## 4. Preservación del Film Grain y Tratamiento Source

Los codecs modernos (AV1 p.ej.) tienen herramientas de síntesis de grano (FGS), pero si no se dispone, el encoder debe tener la función `no-deblock` suavizada, el `-aq-mode` ajustado para oscuridad y el T-Max de `Lookahead` fijado en > 32 para que los B-Frames atrapen los parpadeos granulares antes de comprimirlos con "blur".
El escalado jamás puede ser bilineal; siempre será **Spline36 o Lanczos** por Hardware.

## 5. Per-Scene / Per-Shot Encoding

A diferencia del VOD (donde de antemano mides la película), en Vivo implementaremos "Lookahead-Window Tuning".

1. **Scene Detection:** Picos de inter-frame differences.
2. **Si hay Cambio de Escena (I-Frame Triggered):** El sistema asigna nueva partida de *Bitrate Budget*.
3. Si la escena es oscura, se eleva el bitrate mínimo (Quality Floor) para impedir macrobloques en los negros, aumentando el QP Mínimo de compresión.

## 6. Las Escaleras ABR Premium (Multi-Codec)

Las escaleras son separadas por compatibilidad:

**AV1 (Smart TVs & Flagships):**

* 2160p @ 18-20 Mbps.
* 1440p @ 10-12 Mbps.
* 1080p @ 6-8 Mbps.

**HEVC (Massive Apple / Android Premium):**

* 2160p @ 22-25 Mbps.
* 1080p @ 8-10 Mbps.
* 720p @ 5-6 Mbps.

**H.264 (Fallback & Legacy):**

* 1080p @ 10-14 Mbps.
* *(Nota: H.264 no se usa para resoluciones mayores a 1080p para no asfixiar el CDN).*

## 7. Optimización de CDN y Tolerancia al VBR

* El CDN se configurará para absorber picos (Bursts). El origin enviará los segments / chunks lo más rápido que su interfaz permita.
* Los tamaños de segmento para God-Tier *no* serán de baja latencia agresiva, sino **2.0 a 3.0 Segundos** exactos, favoreciendo la consolidación temporal de los Frames P y B.

## 8. Player Strategy (ExoPlayer y ABR)

* **Buffer Target:** 10 a 15 segundos.
* El reproductor no debe bajar de calidad solo porque haya fluctuado un ping; el algoritmo ABR penaliza brutalmente el *Fast Downswitch* porque arruina la experiencia cinemática.
* La latencia se sacrifica (Glass-to-glass de 7 a 10 segundos) en pro de la absorción absoluta de los picos.

## 9. Evaluación Perceptual (Métricas)

Se prescinde del PSNR como métrica final (pues tiende a la suavidad). El objetivo matemático es **VMAF > 93 en el perfil P0 (2160p)**.
La verificación subjetiva es obligatoria para garantizar el HDR passthrough correcto y la fidelidad del color REC.2020 a 10 bits.

## 10. Directriz de Plan de Ejecución

1. **Baseline Ladder:** Validar que 4K entregue MÍNIMO 18 Mbps.
2. **Multi-Codec:** Permitir que los reproductores envíen su array de "Supported Codecs" para que el Gateway decida la redirección óptima HEVC o AV1 automáticamente.
3. **QoE Cerrado:** Unificar este modelo visual con la telemetría del `qoe_driven_ll_dash` para tener: Baja Latencia cuando es Deporte y Altísima Calidad / Mayor Buffer cuando es Cine Premium VOD.
