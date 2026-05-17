---
name: content_aware_hevc_multichannel
description: Arquitectura de codificación multicanal HEVC distribuida y acelerada por GPU para streaming de baja latencia E2E, con Content-Aware Quality Adaptation en vivo y per-scene encoding.
category: Encoding & Transcoding
version: 1.0.0
importance: CRITICAL
---

# APE ULTIMATE: Arquitectura Multicanal Content-Aware 4K HEVC

> **"Codificar en crudo sin mirar la escena destruye la retina. Usar solo CPU satura los cores. El camino es orquestación por GPU + Análisis en tiempo real por cada corte de cámara."**

Esta doctrina establece el estándar de oro (God-Tier) para la construcción de la planta de compresión APE v17, habilitando codificación paralela en tiempo real (N:N streams) de perfiles 4K (2160p60) preservando HDR, film grain y resolviendo métricas QoE on-the-fly.

## 1. Resumen Ejecutivo de Arquitectura

El ecosistema transita desde la compresión pasiva hacia una plataforma de *Streaming Per-Title-equivalent en directo*, utilizando:

1. **Detección Analítica de Complejidad (Pre-pass):** Evalúa MV (Motion Vectors) y Txture Maps cada *GOP*.
2. **GPU HW Accelerated Pipeline:** HEVC vía `nvenc` (o equivalentes) con tuning estricto (`-preset p6 -tune hq`).
3. **Content-Aware Rate Allocation (Bitrate Steering):** Traslado de recursos en MS (milisegundos) desde un canal en "Standby/Estudio" hacia un canal en "Deportes 60fps" compartiendo el mismo "pool" VBR de recursos o hardware.

**Arquitectura Conceptual (Microservicios):**
`[Ingesta SRT/UDP] --> [Normalizer] --> [APE Analyzer Daemon] --> [Nvidia Encoder Clusters] --> [Low-Latency Packager (2s/0.2s)]`

## 2. Requisitos y Cuellos de Botella Sistémicos

* **Requisito E2E Latencia:** < 4 segundos Glass-to-Glass.
* **Aceleración Mandatoria:** Uso exclusivo de Decodificadores HW (`cuvid` o equivalente) hacia memoria VRAM, evitando cuellos de botella PCIe. Filter chains operando íntegramente en la GPU.
* **Tolerancia a Caídas:** Un stream codificador (Pod K8s / Worker) caído debe relanzar y empatar el frame exacto basándose en Epoch Timeline (Skill "dash_timeline_epoch_sync").

## 3. Decisiones de Encoding y Latencia

¿Por qué HEVC y no H.264 o AV1 en el anillo P0?

* AV1 es perfecto, pero su encoding NVENC (o SW) de baja latencia aún cuesta T-Flops inabarcables para "multicanal real de escala masiva". HEVC es el *Sweet Spot* actual 2026+. Se usa AV1 SOLO para perfiles de 8K o como fallback VOD.

* **Configuración Base del GOP y Chunks:**
  * `GOP` = 2s o 1s (DASH Segment = 2s).
  * Para Lograr `LL-DASH`, chunk_duration (CMAF) = 200ms.
  * `B-Frames` = 0 o máximo 2 (cada B-Frame añade penalización de latencia en la cadena de pre-lookahead). Para "Ultra-LL" se configuran 0. Para "Premium-LL", se permiten 2 B-frames con lookahead limitado a 10 frames.

## 4. Content-Aware Bitrate Control (Steering)

En vivo, "Per-Title" se convierte en "Per-Scene" (Continuous).
**Variables Sensitivas:**

1. `Motion Entropy` (Vectores de movimiento rápidos).
2. `Spatial Detail` (Granosidad fina vs Gráfico plano).
3. `Flash/Fade` (Transiciones globales).

**Accionables de la API del Encoder:**

* Si *Talking Head* -> Target baja un 30% (Ej. De 18Mbps a 12Mbps en 4K) y Max/QP se relaja para ahorrar VBR.
* Si *Deporte / Gamibng* -> Target sube un 40% (Ej. De 18Mbps a 25Mbps) garantizando fidelidad temporal.

**Trade-offs Ocultos:**

* **Bitrate Pumping:** Reactividad muy rápida provoca que la calidad palpite si el detector varía entre un plano general y uno cerrado del mismo set. **Solución:** Smoothing en ventana de 6-10 segundos en la toma de decisión del Capping.

## 5. El Ladder ABR Optimo

Se rechaza el ladder corporativo tradicional. El *Ladder Premium APE* para 4K HEVC HW-Decoder:

* `P0` - 2160p (4K UHD) @ 25 Mbps (VBR Constrained, Max 30Mbps).
* `P1` - 1440p (QHD) @ 16 Mbps.
* `P2` - 1080p (FHD HQ) @ 10 Mbps.
* `P3` - 720p (HD HQ) @ 6 Mbps.
* `P4` - 540p (SD HQ) @ 3 Mbps.

*Las resoluciones se mantienen sin "blurring". Escaneo y escalado se realizan por Lanczos/Spline en HW para evitar pérdida de retícula por downsampling bilinear barato.*

## 6. Rendimiento y Hardware Profiling

*Nodo de Referencia (1x NVIDIA L40S):*
Escalado: El codec dual NvENC soporta aproximadamente entre 6 a 8 sesiones independientes concurrentes convirtiendo 1080p60 a la ladder completa (4 streams por perfil completo), o de 3 a 4 pasadas si provienen de Source 4K bruto.

## 7. Directiva de Recomendación de Entorno

**1. El Baseline Híbrido:** Un clúster donde el análisis de "Content Complexity" se hace "cada N frames (1 fps)" por un sub-thread de CPU ultra ligero, este thread emite comandos a la API del encoder vía JSON, regulando el MaxRate y VBV_Size al vuelo sin reiniciar la sesión del codificador.

**2. Failover Inmediato:** En caso de que el `Content Analyzer` dispare error, el encoder cae instantáneamente a `CBR Fijo (Conservador)` del 80% del perfil superior. El usuario final NO notará la pérdida del analizador más allá de un pequeño softening de texturas, y no un "Black Screen".
