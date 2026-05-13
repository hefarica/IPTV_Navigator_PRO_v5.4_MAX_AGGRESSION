---
name: Protocolos y Contenedores de Streaming (PhD Level)
description: Arquitectura estructural de protocolos HLS/DASH/CMAF, diseño de escaleras ABR y manejo profundo de origen/Edge.
---

# Estructuras de Distribución Multimedia

## 1. HLS, DASH y Dominancia CMAF
- **Evolución del Contenedor:** Entender la transición del farragoso MPEG-TS (Transport Stream, 188 bytes multipacket) hacia la eficiencia inmaculada de fMP4 (Fragmented MP4) encapsulado vía CMAF (Common Media Application Format).
- **LL-HLS / LL-DASH (Low Latency):** Uso estricto de HTTP/1.1 Chunked Transfer Encoding e HTTP/2 Pushing para entregar "parts" intrafagmento de video logrando sub-3s latencias E2E reales.

## 2. Ingeniería ABR (Adaptive Bitrate)
- **Escaleras de Dominancia:** Creación matemática e inyección forzada de `#EXT-X-STREAM-INF` (RFC 8216) y `<Representation>` tags ISO-23009.
- **Oscillation Damping:** Empleo de heurísticas avanzadas para evitar saltos vertiginosos de calidad resolutiva en el player "Yo-Yo effect" manipulando manifiestos planos, subiendo artificialmente las cotas operativas.

## 3. Topología E2E de Origen
- Dominios arquitectónicos full-stack: Ingesta (RTMP/SRT), Transcodificación Farm (FFmpeg/NVIDIA NVENC), Packaging Dinámico al vuelo (Shaka/Bento4) y caching de borde (CDN).
- Estrategias de blindaje de Origen y Zero-Probe enforcement ante fallas catastróficas del upstream.
