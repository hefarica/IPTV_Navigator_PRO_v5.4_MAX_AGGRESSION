---
name: Jerarquía Base LCEVC Dinámica (HEVC > AVC + L1/L2)
description: Define la política estricta de asignación de códec base para LCEVC (MPEG-5 Part 2), priorizando HEVC+LCEVC y cayendo a H.264+LCEVC solo como fallback. Integra mapeo HDR nativo.
---

# 🧬 Jerarquía Base LCEVC Dinámica (MPEG-5 Part 2)

## 📌 DOCTRINA PRINCIPAL

El estándar **MPEG-5 Part 2 (LCEVC)** es algorítmicamente agnóstico. No es un códec en sí mismo, sino una capa de mejora que requiere un **Códec Base** existente (AVC, HEVC, VVC, AV1) sobre el cual inyectar dos subcapas de datos residuales:
- **Capa L1 (4x4):** Corrige artefactos de compresión y deblocking temporal al nivel de la capa base.
- **Capa L2 (2x2):** Recupera altas frecuencias, nitidez (sharpness), y hace el upscaling neuronal final a la resolución objetivo.

Para el ecosistema APE ULTIMATE de 2026, la directriz arquitectónica no acepta una implementación LCEVC "plana". Se exige una **política de elección de base por canal**.

## 🛠️ LA LÓGICA DE INYECCIÓN (Generador M3U8/DASH)

Basados en la telemetría del stream origen (probe de FFmpeg/Xtream), el generador inyectará las dependencias de LCEVC (mediante `dependencyId` en DASH, o Dual-Track CMAF en HLS) bajo la siguiente estricta cascada:

### Opción 1: Prioridad Absoluta (HEVC_BASE_LCEVC)
Si el stream de origen pertenece a la familia HEVC (`channel.codecFamily === 'HEVC'`):
* **Base Layer:** El flujo HEVC nativo (hvc1).
* **Enhancement Layer:** Señal LCEVC (L1 + L2) acoplada.
* **Metadato Emisor:** Se marca el canal como `HEVC_BASE_LCEVC`.
* **Beneficio:** Máxima retención de HDR10/Dolby Vision y 10-bit color sin banding en las gradientes oscuras.

### Opción 2: Fallback Clásico (AVC_BASE_LCEVC)
Si el stream de origen carece de variante HEVC y solo pertenece a la familia H.264/AVC (`channel.codecFamily === 'AVC'`):
* **Base Layer:** El flujo H.264 (avc1) existente.
* **Enhancement Layer:** Señal LCEVC (L1 + L2) acoplada para pseudo-upscaling de detalle.
* **Metadato Emisor:** Se marca el canal como `AVC_BASE_LCEVC`.

## 📡 EL TRANSPORTE DE LA ENHANCEMENT LAYER (Carriage)

Las subcapas L1 y L2 nunca deben enviarse "encendidas por arte de magia". LCEVC requiere carriage real junto al bitstream:
1. **SEI NAL Unit Embedding:** En HLS estándar (.ts o .m3u8 nativo), la telemetría LCEVC se incrusta directamente en los mensajes **SEI (Supplemental Enhancement Information)** dentro de la pista de video base. El reproductor compatible extrae el NAL y alimenta la NPU.
2. **Dual-Track (HLS/DASH CMAF):** La capa base va en una pista (ej. `video=HEVC`), y la Enhancement Layer va en una pista adyacente (`video=MPEG5-P2-SEI`). El archivo manifiesto vincula ambas partes instruyendo al cliente a fusionarlas en RAM.

## 🌈 INTEGRACIÓN HDR EN LCEVC

A diferencia de los reescaladores antiguos, LCEVC fue certificado por la MPEG y la ITU para transportar y recomponer metadatos HDR (PQ, HLG) con cero alteración en el Transfer Function. Si la capa base HEVC es HDR10, la capa LCEVC aplicará sus residuales respetando el *Color Gamut BT.2020*.

## 📚 REPOSITORIO DE LA VERDAD Y EVIDENCIA CIENTÍFICA

El algoritmo APE basa esta arquitectura en los estándares validados de la industria. Nunca predecimos; aplicamos las normas definidas por MPEG:

1. **Eficiencia Cuantificada:** MPEG Verification Test Report [MPEG-134 May 2021] valida matemáticamente el ahorro de bitrate VS ganancia de VMAF.
2. **Aval Internacional:** Publicaciones oficiales de la [ITU-T (Journal ICTS V3I1)](https://www.itu.int/) y la investigación de Signal Processing en *Frontiers In* evidencian las subcapas 2x2.
3. **Transporte y HLS/DASH Carriage:** Documentación técnica de V-Nova (Creadores del códec) sobre cómo los manifiestos vinculan el Base + Enhancement.
4. **HDR Decoding:** Paper sobre HDR video coding con MPEG-5 LCEVC (MHV22), respaldando nuestra implementación de Deep Color.
5. **Decodificadores Clientes (Para Shaka Player & MainConcept):** Repositorios oficiales confirman la existencia del desempaquetador LCEVC vía MSE/EME en JavaScript/Java, habilitando la decodificación por software cuando hardware fallback es necesario.

### 🚫 Mandato Anti-Ficción:
Ningún tag `#EXT-X-APE-LCEVC` en nuestra lista inyectará LCEVC mágicamente si el CDN no provee la capa de mejora en SEI NAL o pista CMAF separada. Esta regla certifica que nuestra M3U8 sirva como un "Plano de Control Analítico", diciéndole a las apps nativas cómo ensamblar los fragmentos, no inventándolos de la nada.
