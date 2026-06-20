---
name: Skill_4K_Enhancement_Enforcer
description: "Fuerza la declaración de 4K/HDR/HEVC/LCEVC/HDCP en el 100% de canales mediante virtual_4k rewrite agresivo (DIRECTIVA FAKE 4K SUPREMO 2026-06-20). Reemplaza Skill_Fake_4K_Detector."
---

# Skill: 4K Enhancement Enforcer (UNLOCKED)

## Purpose
Forzar la declaración de 4K/HDR/HEVC/LCEVC en el 100% de canales mediante
virtual_4k rewrite agresivo, sin importar la resolución/codec/rango real
del stream fuente.

## Doctrine
- **NO** detectar "upscale falso" — el upscale es OBLIGATORIO
- **SIEMPRE** reescribir RESOLUTION a 3840x2160 mínimo
- **SIEMPRE** emparejar con hvc1.2.4.L153.B0 + VIDEO-RANGE=PQ + LCEVC
- Aplicar a **100%** de canales que carguen un `#EXT-X-STREAM-INF` (no solo premium)

## Rules

### Rule 1: Virtual 4K Mandatory
```
IF streamInf_exists THEN RESOLUTION = "3840x2160"
```

### Rule 2: Virtual HDR Mandatory
```
IF streamInf_exists THEN VIDEO-RANGE = "PQ"   # Alternativas: "HLG", "DV"
```

### Rule 3: Virtual HEVC Mandatory
```
IF streamInf_exists THEN CODECS = "hvc1.2.4.L153.B0"   # preservando el codec de audio
```

### Rule 4: Virtual LCEVC Mandatory
```
IF streamInf_exists THEN SUPPLEMENTAL-CODECS = "lcev.1.1.1"
```

### Rule 5: Virtual Bitrate Mandatory
```
IF streamInf_exists THEN BANDWIDTH = 28000000 ; AVERAGE-BANDWIDTH = 22000000
```

### Rule 6: Virtual HDCP Mandatory
```
IF streamInf_exists THEN HDCP-LEVEL = "TYPE-1"
```

### Rule 7: Virtual CMAF Mandatory (VPS Lua / master playlists)
```
IF master_playlist AND no EXT-X-MAP THEN EXT-X-MAP = "init.mp4"
```

## Output Tags
```hls
#EXT-X-APE-VIRTUAL-4K:enabled=true,method=aggressive,tier=all,avc_rewrite=true
#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,FRAME-RATE=60.000,VIDEO-RANGE=PQ,HDCP-LEVEL=TYPE-1,SUPPLEMENTAL-CODECS="lcev.1.1.1"
```

## Implementation
- Generator JS: `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` — post-procesador sobre `_finalM3U`.
- VPS Lua: `vps/nginx/lua/combined_body_filter.lua` STAGE 3 (`CHINA_BOX_FAKE_4K=true`).

## Anti-Patterns (PROHIBITED)
- ❌ Verificar resolución/codec/rango real del stream
- ❌ Aplicar virtual_4k solo a canales "premium" o solo con "evidencia"
- ❌ Dejar canales con metadata "honesta" 1080p/SDR/AVC
- ❌ Eliminar canales (NO CHANNEL LOSS sigue vigente)

## Honest caveats (documented, owner-accepted 2026-06-20)
Declarar `hvc1` sobre bytes AVC puede dar spinner/negro en players nativos sin el daemon ADB y dropear
el canal en devices sin decode HEVC. El realce real lo da el VPP del device (AI-SR/AI-PQ); el bitstream
se entrega tal cual. Los fixtures de CI marcarán estas listas como `bad` — esperado bajo esta doctrina.

## Version
UNLOCKED-2026-06-20 (reemplaza `Skill_Fake_4K_Detector`)
