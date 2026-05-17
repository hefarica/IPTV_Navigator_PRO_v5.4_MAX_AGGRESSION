---
name: mapa_directivas_definitivo
description: "Skill para asegurar el cumplimiento estricto del Mapa de Directivas OMEGA CRYSTAL V5 (796 líneas por canal, 10 capas L0-L10) en la generación de M3U8. SUPERSEDE versiones anteriores (735, 746, 751)."
---

# Mapa de Directivas Definitivo: OMEGA CRYSTAL V5 (796 Líneas) 💎

## Objetivo
Establecer la estructura atómica y obligatoria de cada canal en la lista M3U8, garantizando que el pipeline de generación inyecte exactamente **796 directivas** (cableadas mediante Typed Arrays) distribuidas en **10 capas (L0-L10)** para alcanzar el estándar broadcast God-Tier.

## Estructura de 10 Capas (Mapa Mental)

| Capa | Tipo | Líneas | Descripción |
|------|------|--------|-------------|
| **L0** | Identidad HLS | 2 | `#EXTINF` + `#EXT-X-STREAM-INF` — única capa parseada por RFC 8216 |
| **L1** | EXTVLCOPT | 110 | 12 subsecciones: red/buffer, video-filter, hw-decode, codec, audio, ABR, error-resilience, deinterlace, HDR tone-mapping, red avanzada, subtítulos, reproducción |
| **L2** | EXTHTTP JSON | 1 | Payload JSON colosal: sid, nonce, quality_levels, resilience, isp_evasion, ai_pipeline |
| **L3** | KODIPROP | 65 | Kodi ISA: manifest, hw-decode, HDR/BT.2020, audio Atmos/DTS, DRM Widevine/FairPlay, VRR |
| **L4** | EXT-X-CMAF | 25 | Pipeline fMP4/CMAF latencia cero, 7 niveles fallback, HDR, audio |
| **L5** | EXT-X-APE-HDR-DV | 45 | Override HDR10+/DV 5000 nits, LCEVC Phase 4, AI SR, tone-mapping |
| **L6** | EXT-X-APE-TELCHEMY | 10 | Telemetría QoS/QoE simulada: VMAF, PSNR, SSIM, jitter, packet loss |
| **L7** | EXTATTRFROMURL | 53 | Puente L2↔L7: identidad/sesión, codec/calidad, evasión, DRM, transporte, caché, ABR |
| **L8** | EXT-X-APE-* | 470 | Núcleo Crystal (23 secciones × ~20 líneas): Buffer Nuclear, BBR, QoS, Phantom, Codec, Resilience, Spoof, DRM, AI, Audio, Scorecard, VRR, Polimorfismo, Quality Override, Luma, Bitrate, Quantum Pixel, Buffer God-Tier, Space Validator, VNOVA LCEVC, Cortex Telemetry, Diagnosis, Player Enslavement |
| **L9** | EXT-X-PHANTOM-HYDRA | 13 | Evasión ISP: UAs, DNS DoH, SNI obfuscation, HTTPS mimicry, Sandvine bypass |
| **L10** | EXT-X-MEDIA + I-FRAME + STREAM-INF + URL | 5 | Audio metadata (SIN URI=), I-Frame (SIN URI=), 1 STREAM-INF + 1 URL. FIX 2026-04-17: URI= causaba 509. |
| **TOTAL** | | **796** | |

## Procedimiento de Auditoría (Paso a Paso)

### 1. Verificación de Cabecera (L0)
Cada canal **DEBE** iniciar con:
- `#EXTINF:-1 tvg-id="..." tvg-name="..."` (Línea 1)
- `#EXT-X-STREAM-INF:BANDWIDTH=...,RESOLUTION=...,CODECS="...",FRAME-RATE=...` (Línea 2)

### 2. Verificación de Bloque EXTVLCOPT (L1 — 110 líneas)
Auditar que existan las 110 directivas VLC en 12 subsecciones:
- `video-filter`: Debe incluir `bwdif`, `nlmeans`, `deband`, zscale `st2084/bt2020/2020ncl`.
- `hw-dec=all` y `avcodec-hw=any`.
- `network-caching` >= 30,000ms.
- `spdif=eac3,ac3,dts,truehd`, `audio-channels=8`.

### 3. Verificación de EXTHTTP (L2 — 1 línea)
JSON minificado con:
- `X-App-Version`: `APE_22.2.0-FUSION-FANTASMA-NUCLEAR_ULTIMATE_HDR`
- `X-APE-SID` (idempotente), `X-APE-NONCE` (polimórfico)
- `quality_levels` L1-L7, `resilience` 7 niveles, `isp_evasion`

### 4. Verificación de KODIPROP (L3 — 65 líneas)
- `inputstream.adaptive.stream_headers`: debe replicar headers clave del L2.
- `inputstream.adaptive.max_luminance=5000`.
- Widevine L1 y FairPlay DRM.

### 5. Verificación de CMAF Pipeline (L4 — 25 líneas)
- `CONTAINER=fMP4`, `SEGMENT=4`, `LATENCY=ZERO`
- 7 niveles fallback: CMAF+HEVC → HLS/fMP4 → HLS/TS → TS_Direct → HTTP_Redirect → AUDIO_ONLY

### 6. Verificación de HDR-DV (L5 — 45 líneas)
- Peak luminance configurable por perfil (`_hdr796`)
- LCEVC Phase 4 activo, AI SR (RealESRGAN, RIFE)

### 7. Verificación de Telchemy (L6 — 10 líneas)
- `VSTQ`, `EPSNR`, `MOS`, `JITTER`, `LOSS` presentes

### 8. Verificación de Puente EXTATTRFROMURL (L7 — 53 líneas)
- 7 subsecciones: identidad, codec, evasión, DRM, transporte, caché, ABR

### 9. Verificación de Núcleo Crystal (L8 — 470 líneas)
- 23 secciones presentes, cada una con ~20 líneas.
- Conteo exacto: `#EXT-X-APE-BUFFER-NUCLEAR`, `#EXT-X-APE-BBR-HIJACK`, etc.

### 10. Verificación de Phantom Hydra (L9 — 13 líneas)
- 5 User-Agents, 3 DNS, SNI front, HTTPS mimicry

### 11. Verificación de URL Final (L10 — 2 líneas)
- `#EXT-X-MEDIA` (SIN URI=) + `#EXT-X-I-FRAME-STREAM-INF` (SIN URI=) + `#EXT-X-STREAM-INF` + URL final única

## Reglas Estrictas (No Negociables)
- **Regla del 100%:** Si falta una sola línea de las 796 mapeadas, el canal se considera **INCUMPLE (FAIL)**.
- **Typed Arrays Only:** Todo viene de los arrays definidos en `m3u8-typed-arrays-ultimate.js`.
- **Atómico:** El bloque de 796 líneas es indivisible — no se fragmenta en submodulos.
- **Orden de Inyección:** L0→L1→L2→L3→L4→L5→L6→L7→L8→L9→L10. No mover bloques.
- **Redundancia Intencional:** EXTVLCOPT + KODIPROP + EXTHTTP + EXT-X-APE repiten directivas para control total sobre cualquier decodificador.

## Archivos de Referencia
- Ubicación del Generador: `frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js`
- Skill de Integración: `iptv_omega_796_integrator/SKILL.md`
- Referencia de Capas: `iptv_omega_796_integrator/references/omega_layers.md`
