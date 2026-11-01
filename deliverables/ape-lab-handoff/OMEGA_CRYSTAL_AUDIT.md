# OMEGA CRYSTAL — Auditoría de la lista nueva

Lista: `APE_LISTA_NEW_AUDIT.m3u8` (1 canal, generada con la fuente corregida)

## Dos estándares distintos

| Estándar | Score | Qué mide |
|---|---:|---|
| Estructura/metadata APE | **100/100** | EXTM3U, URI, chunks, 883 campos, 419 headers, cap 200/8192, overflow |
| OMEGA CRYSTAL 14 dimensiones | **1.85/10** | directivas exactas Crystal en el bloque de canal |

La lista es correcta para metadata y headers, pero **no es una lista OMEGA CRYSTAL 10/10** porque no contiene las cadenas exactas que busca el auditor de la skill.

## Scorecard OMEGA

| # | Dimensión | Score | Estado |
|---|---|---:|---|
| D1 | Dynamic Range Classifier | 0.0 | falta |
| D2 | Space Validator | 2.5 | parcial |
| D3 | Bitrate Anarchy Protocol | 0.0 | falta |
| D4 | Hardware Agent Spoofing | 0.0 | falta |
| D5 | Quantum Pixel Overdrive | 2.5 | parcial |
| D6 | Luma Precision Engine | 2.5 | parcial |
| D7 | Network Buffer God Tier | 2.5 | parcial |
| D8 | Codec Priority Enforcer | 0.0 | falta |
| D9 | fMP4/CMAF Pipeline | 2.5 | parcial |
| D10 | VRR/Refresh Sync | 0.0 | falta |
| D11 | AI/DLSS Reconstruction | 0.0 | falta |
| D12 | Audio Pipeline Real | 7.5 | parcial |
| D13 | DRM/License Wrapping | 5.0 | parcial |
| D14 | Checklist Auditoría Auto | 2.5 | parcial |
| | **FINAL PONDERADO** | **1.85/10** | |

## Gaps exactos

### D1 — Dynamic Range
Faltan:

```text
colorspace=all=auto
tonemap=mobius
trc=auto
zscale=transfer=st2084
```

### D2 — Space Validator
Faltan:

```text
format=yuv444p
chromal=topleft
deband
```

### D3 — Bitrate Anarchy
Faltan:

```text
ANTI-CUT-ISP-STRANGLE
bandwidth_ramp=true
bandwidth_ramp_peak=100000000
OMEGA-ENGINE-BANDWIDTH-MONITOR
```

### D4 — Hardware Spoofing
Faltan:

```text
X-Device-Class
X-Decoding-Capability
SHIELD-TV-PRO
AppleTV14,1
```

### D5 — Quantum Pixel
Faltan:

```text
yuv444p10le
yuv444p
saturation
```

### D6 — Luma Precision
Faltan:

```text
unsharp=luma
nlmeans
LUMA-GAMMA
```

### D7 — Network Buffer
Faltan:

```text
BUFFER-STRATEGY:ADAPTIVE_PREDICTIVE_NEURAL
BUFFER-PRELOAD-SEGMENTS:30
BUFFER-DYNAMIC-ADJUSTMENT:ENABLED
```

### D8 — Codec Priority
Faltan:

```text
preferred_codec=hevc
video_codec_override=hevc
AV1-FALLBACK-CHAIN
CODEC-PRIORITY
```

### D9 — fMP4/CMAF
Faltan:

```text
TRANSPORT-PROTOCOL:CMAF_UNIVERSAL
TRANSPORT-CHUNK-SIZE:200MS
TRANSPORT-FALLBACK-1:HLS_FMP4
```

### D10 — VRR/Refresh
Faltan:

```text
vrr_sync
tunneling_enabled=true
CORTEX-CONSTANT-FRAME-RATE
CORTEX-OPTICAL-FLOW-MINTERPOLATE
```

### D11 — AI/DLSS
Faltan:

```text
CORTEX-AI-SUPER-RESOLUTION
CORTEX-AI-SPATIAL-DENOISE
CORTEX-LCEVC
CORTEX-TEMPORAL-ARTIFACT-REPAIR
```

### D12 — Audio
Falta:

```text
earc
```

### D13 — DRM
Faltan:

```text
drm_widevine
EXT-X-KEY
```

### D14 — Auditoría auto
Faltan:

```text
TELEMETRY-TVQM
TELEMETRY-TR101290
IMPAIRMENT-GUARD
```

## Decisión

No se deben inyectar estas directivas a ciegas: algunas alteran filtros de vídeo/códec y la doctrina prohíbe romper la reproducción o declarar codecs no servidos.

Para subir el score OMEGA hay que:

1. implementar las directivas en el generador por perfil P0–P5;
2. validar que no contradigan el LAB;
3. regenerar;
4. volver a correr la skill.

Mientras tanto:

```text
Estructura/metadata APE: 100/100
OMEGA CRYSTAL:           1.85/10
Playback:                pendiente
100% global:             NO
```
