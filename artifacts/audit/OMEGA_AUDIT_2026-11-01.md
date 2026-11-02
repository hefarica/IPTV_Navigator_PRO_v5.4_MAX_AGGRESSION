# Auditoría OMEGA CRYSTAL — Lista APE CDN

**Fecha:** 2026-11-01  
**Skill:** `iptv-m3u8-auditor`  
**Lista auditada:** `/lists/APE_LISTA_1793569066655_CDN.m3u8`  
**Método:** lectura streaming, sin modificar la lista.

## Veredicto

| Lista | Canales | Líneas | Directivas únicas | Score 14D | Score 19D |
|---|---:|---:|---:|---:|---:|
| Original | 10.573 | 10.315.628 | 678.092 | **2,59 / 10** | **3,37 / 10** |
| FAST | 10.573 | 1.448.502 | 10.748 | 0,95 / 10 | 0,76 / 10 |

La lista original **no llega a 10/10**. La FAST no pretende ser 10/10: es una lista de zapping que sacrifica metadata inerte, no calidad de vídeo.

## Scorecard 14 dimensiones (skill)

| Dimensión | Peso | Score | Estado |
|---|---:|---:|---|
| D1 Dynamic Range Classifier | 8 | 2,5 | Parcial: solo `zscale=st2084`; faltan `colorspace=auto`, `tonemap=mobius`, `trc=auto` |
| D2 Space Validator | 7 | 0,0 | Falta todo el bloque 4:4:4/deband/chroma |
| D3 Bitrate Anarchy | 9 | 0,0 | Faltan las 4 directivas |
| D4 Hardware Spoofing | 7 | 2,5 | Solo un indicador; faltan Device-Class/Decoding/SHIELD |
| D5 Quantum Pixel | 7 | 2,5 | Solo un indicador; falta 4:4:4 10-bit real |
| D6 Luma Precision | 8 | 7,5 | `nlmeans`, `hqdn3d`, `unsharp`; falta `LUMA-GAMMA` |
| D7 Network Buffer | 9 | 2,5 | `network-caching`; faltan buffer neural/preload/dynamic |
| D8 Codec Priority | 8 | 2,5 | Falta `preferred_codec`, override y cadena AV1 |
| D9 fMP4/CMAF | 8 | 2,5 | faltan transporte/chunk/fallback |
| D10 VRR/Refresh | 7 | 0,0 | Falta todo |
| D11 AI/DLSS | 9 | 0,0 | Falta todo |
| D12 Audio Pipeline | 7 | 7,5 | tags Atmos/passthrough/fallback; falta eARC |
| D13 DRM | 6 | 5,0 | hay DRM, faltan Widevine/EXT-X-KEY |
| D14 Auditoría | 8 | 2,5 | falta TVQM/TR101290/impairment |
| **Ponderado 14D** | **108** | **2,59** | **No 10/10** |

## Dimensiones extendidas de la skill (19D)

| Dimensión | Peso | Score | Observación |
|---|---:|---:|---|
| D15 LL-HLS | 6 | 5,0 | Server-Control presente; faltan PART/PRELOAD-HINT |
| D16 Multi-CDN | 6 | 10,0 | Content-Steering presente |
| D17 Zapping | 6 | 10,0 | tags de zapping presentes |
| D18 Telemetry Session | 5 | 5,0 | `EXT-X-SESSION-DATA`; falta `com.ape.session` |
| D19 Manifest Compression | 4 | 0,0 | falta `EXT-X-DEFINE` |
| **Ponderado 19D** | **135** | **3,37** | |

## La trampa: D12 no mide audio real

El scorecard da 7,5/10 en audio porque encuentra tags:

```text
dolby_atmos
audio_passthrough
AUDIO-FALLBACK
```

Pero la sonda real del canal MAIN EVENTS 4K demuestra:

```text
EAC3
paquetes presentes
decoder: coupling not allowed in mono or dual-mono
decode error rate 1 > 0.666667
sample_rate=0
channels=0
```

**Audio efectivo de MAIN 4K: 0/10**, aunque los tags estén presentes.

F1 sí tiene audio real:

```text
AAC-LC 48 kHz 2ch
3840x2160 HEVC Main10 HDR10/PQ
```

## La trampa: D17 no mide zapping real

D17 da 10/10 por tags de zapping, pero la lista original tarda porque:

```text
10.315.628 líneas
678.092 directivas únicas
152 MB gzip
808 bloques con network-caching=72000
```

Por eso existe la FAST:

```text
769 KB
1.448.502 líneas
network-caching=6000
```

La FAST baja el score de metadata porque elimina deliberadamente tags inertes; su objetivo es zapping, no competir en el scorecard 10/10.

## Gaps prioritarios para subir el score

1. **No inyectar tags a ciegas**: las directivas de filtro/AI pueden romper OTT/TiviMate.
2. **D2/D10/D11/D13/D19** son los bloques con 0.
3. **Audio real** no se arregla con tags: MAIN 4K necesita audio válido del proveedor o un injerto 4K+FHD audio con sincronía comprobada.
4. **Zapping** se arregla con lista FAST + `network-caching` correcto, no con más metadata.
5. **DRM** no aplica a streams en claro; forzarlo puede romper reproducción.

## Artefactos

```text
tools/audit_omega_m3u8.py
artifacts/audit/OMEGA_AUDIT_2026-11-01.md
```

El script es de solo lectura y acepta `.m3u8` o `.m3u8.gz`.
