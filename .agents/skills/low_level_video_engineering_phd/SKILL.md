---
name: Desarrollo de Software de Bajo Nivel para Video (PhD Level)
description: Manipulación profunda en C/PHP de parsers de video, FFmpeg, GStreamer y concurrencia.
---

# Sistemas de Alto Desempeño y Parsing Binario

## 1. APIs Multimedia y Manipulación Binaria
- Ingeniería Inversa a metadatos nativos `sps/pps` en NAL Units (H264/H265 Annex B) hacia AVC/HEVC config boxes (avcC/hvcC) usando FFmpeg bitstream filters como `h264_mp4toannexb` u `h264_metadata` en canales de transcodificación.
- Uso del comando `ffprobe` e interceptación de C/Go routines para orquestar la conversión cruda MPEG-TS a DASH/fMP4 "Zero-Disk" sobre /dev/shm.

## 2. Patrones Arquitectónicos Resilientes
- **Idempotencia:** Garantizar que ante repeticiones de la misma solicitud perturbada, el estado interno jamás crashee y siempre regrese un manifold HLS/DASH válido sin pantallas negras (Fallback Predictivo).
- **Atomicidad y Concurrencia Distribuida:** Operatividad con cerrojos no bloqueantes en memorias temporales, evitando `catastrophic IO latency` al escribir flujos contínuos.
