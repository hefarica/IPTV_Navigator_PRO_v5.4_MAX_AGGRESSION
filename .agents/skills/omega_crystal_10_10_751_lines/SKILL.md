---
name: omega_crystal_10_10_751_lines
description: "Doctrina Absoluta de Inyección y Estructura M3U8 para OMEGA CRYSTAL V5 (796 Líneas por Canal, 10 Capas L0-L10). SUPERSEDE todas las versiones anteriores (735, 746, 751). Usar cuando se genere, audite o modifique el generador M3U8."
---

# Mapa de Directivas Definitivo: OMEGA CRYSTAL V5 (796 Líneas) 💎

> **NOTA DE VERSIÓN:** Esta skill fue actualizada de 751→796 líneas el 2026-04-07.
> La arquitectura anterior (751 líneas, Phantom Hydra de 16 líneas) fue reemplazada
> por la arquitectura OMEGA CRYSTAL V5 con 10 capas universales (L0-L10).

## Misión de la Skill

Obligar a que el generador M3U8 produzca **exactamente 796 líneas** para cada canal en TODOS los perfiles (P0-P5), utilizando la función monolítica `generateChannelEntry()` con las 10 capas L0-L10. No se tolerará la falta de una sola directiva ni variación en el conteo de líneas.

## Arquitectura de 10 Capas (OMEGA CRYSTAL V5)

| Capa | Directiva | Líneas | Descripción |
|------|-----------|--------|-------------|
| L0 | `#EXTINF` + `#EXT-X-STREAM-INF` | 2 | Identidad HLS (única capa parseada por reproductores estándar) |
| L1 | `#EXTVLCOPT` (12 subsecciones) | 110 | Esclavización VLC/ExoPlayer: red, video-filter, hw decode, codec, audio, ABR |
| L2 | `#EXTHTTP` JSON enriquecido | 1 | Payload JSON colosal para el Resolver PHP (sid, nonce, quality_levels, resilience) |
| L3 | `#KODIPROP` Kodi ISA | 65 | Manifest, hw decode, HDR, audio, DRM, VRR, user-agent |
| L4 | `#EXT-X-CMAF` Pipeline fMP4 | 25 | Latencia cero CMAF/fMP4, 7 niveles de fallback |
| L5 | `#EXT-X-APE-HDR-DV` | 45 | Override HDR10+/Dolby Vision 5000 nits, LCEVC Phase 4 |
| L6 | `#EXT-X-APE-TELCHEMY` | 10 | Telemetría simulada QoS/QoE (VMAF, PSNR, SSIM) |
| L7 | `#EXTATTRFROMURL` | 53 | Puente matemático L2-L7 (identidad, codec, evasión, DRM, transporte, caché, ABR) |
| L8 | `#EXT-X-APE-*` (23 secciones × 20) | 470 | Núcleo Crystal: Buffer, BBR, QoS, Phantom, Codec, Resilience, Spoof, DRM, AI, Audio, Scorecard, VRR, Polimorfismo, Quality Override, Luma, Bitrate Anarchy, Quantum Pixel, Buffer God-Tier, Space Validator, VNOVA LCEVC, Cortex Telemetry, Diagnosis, Player Enslavement |
| L9 | `#EXT-X-PHANTOM-HYDRA` | 13 | Evasión ISP: 5 UAs, 3 DNS, SNI front, HTTPS mimicry, Sandvine bypass, IP rotation SWARM_2048 |
| L10 | `#EXT-X-MEDIA` + `#EXT-X-I-FRAME-STREAM-INF` + `#EXT-X-STREAM-INF` + URL | 5 | Audio metadata (SIN URI=), I-Frame metadata (SIN URI=), 1 STREAM-INF + 1 URL única. FIX 2026-04-17: URI= en MEDIA/I-FRAME causaba 509. |
| **TOTAL** | | **796** | |

## Identidad Dual (Polimorfismo + Idempotencia)

- `_nonce796 = generateRandomString(8)` → cambia en cada descarga → evasión DPI
- `_sid796 = FNV32(ch.id + 'OMEGA_STATIC_SEED_V5')[:16]` → nunca cambia → cache key del Resolver PHP (<5ms HIT)

## Protocolo de Generación de Canal (Estándar OMEGA V5)

1. **Target Final**: `frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js`.
2. **Método**: Función monolítica `generateChannelEntry()` que produce un bloque atómico indivisible de 796 líneas. Todas las capas se inyectan secuencialmente (L0→L10) sin condicionales que alteren el conteo.
3. **Verificación en runtime**: El motor incluye validación automática en L6490: `if (_omega_count !== 796) console.warn(...)`.
4. **Perfiles P0-P5**: Todos los perfiles producen exactamente 796 líneas. Los valores (resolución, bitrate, FPS, nits) varían según el perfil, pero la estructura es idéntica.

## Reglas No Negociables

- **NUNCA fragmentar** el bloque de 796 líneas en funciones modulares separadas (lección aprendida del sistema legacy).
- **NUNCA condicionar** la inclusión de capas enteras — todas las capas se escriben siempre.
- **Redundancia deliberada**: EXTVLCOPT + KODIPROP + EXTHTTP + EXT-X-APE repiten directivas para control dictatorial sobre cualquier decodificador.

## Referencia Completa

Ver `iptv_omega_796_integrator/references/omega_layers.md` para la documentación detallada de cada subsección dentro de las 10 capas.
