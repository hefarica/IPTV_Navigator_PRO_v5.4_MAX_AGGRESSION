# Anatomía Quirúrgica Completa: Perfiles P0 a P5 (Base V1 + Últimas 12h)

Este documento detalla la anatomía exacta, línea por línea y array por array, que debe inyectarse en el generador del Frontend para cada uno de los 6 perfiles (P0 a P5). Integra la base V1 (20260407) con las 51 directivas de las 3 capas del estándar CRYSTAL UHD implementadas en las últimas 12 horas.

**REGLA DE ORO:** NINGÚN campo debe ser obviado. La ausencia de un solo campo colapsa la puntuación del perfil correspondiente.

---

## 1. Cabecera Global (Aplica a todos los perfiles)

La cabecera de la lista `#EXTM3U` debe incluir estas directivas exactamente en este orden, antes del primer canal:

```m3u8
#EXTM3U
#EXTM3U-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0
#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES
```

---

## 2. Anatomía del Perfil P0: ULTRA SPORTS 8K EXTREME

**Objetivo:** Máxima calidad absoluta, hardware premium, sin restricciones de ancho de banda.

### Array `#EXTHTTP` (JSON Payload)
Debe inyectarse completo en la directiva `#EXTHTTP:`

```json
{
  "paradigm": "OMNI-ORCHESTRATOR-V5-OMEGA",
  "version": "1.0.0-OMEGA",
  "profile": "P0_ULTRA_SPORTS_8K",
  "ct": "sports",
  "X-Cortex-Device-Type": "PREMIUM_TV",
  "X-Cortex-Device-HDR": "DOLBY_VISION_P8",
  "X-Cortex-Idempotency": "STRICT",
  "X-Cortex-Bidirectional": "ENABLED",
  "X-Cortex-AI-Super-Resolution": "REALESRGAN_X4PLUS",
  "X-Cortex-AI-Spatial-Denoise": "NLMEANS_OPTICAL",
  "X-Cortex-LCEVC": "PHASE_4_FP16",
  "X-Cortex-Temporal-Artifact-Repair": "ACTIVATED",
  "X-Cortex-Constant-Frame-Rate": "CFR_60_ANCHOR_LOCKED",
  "X-Cortex-Optical-Flow-Minterpolate": "120FPS_ACTIVATED",
  "X-Transport-CMAF-Init": "init.mp4"
}
```

### Array `#EXT-X-APE-*` (Directivas APE)
```m3u8
#EXT-X-APE-SPOOF-DEVICE-CLASS:premium-tv
#EXT-X-APE-SPOOF-DECODING-CAPABILITY:hevc-main10-level6.1
#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT:ENABLED
#EXT-X-APE-BUFFER-NEURAL-PREDICTION:ENABLED
#EXT-X-APE-DRM-WIDEVINE:ENFORCE
#EXT-X-APE-DRM-FAIRPLAY:ENFORCE
#EXT-X-APE-AV1-FALLBACK-ENABLED:true
#EXT-X-APE-AV1-FALLBACK-CHAIN:HEVC>AV1>H264
#EXT-X-APE-CODEC-PRIORITY:HEVC>AV1>H264
#EXT-X-APE-TELCHEMY-TVQM:ENABLED
#EXT-X-APE-TELCHEMY-TR101290:ENABLED
```

### Array `#KODIPROP` (Kodi / ExoPlayer)
```m3u8
#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive
#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=2147483647
#KODIPROP:inputstream.adaptive.chooser_resolution_max=8K
#KODIPROP:inputstream.adaptive.ignore_screen_resolution=true
#KODIPROP:vrr_sync=enabled
#KODIPROP:auto_match_source_fps=true
#KODIPROP:audio_passthrough_earc=strict
#KODIPROP:drm_widevine_enforce=true
```

### Array `#EXTVLCOPT` (VLC / TiviMate / OTT Navigator)
```m3u8
#EXTVLCOPT:video-filter=fieldmatch,decimate,nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,deband=1thr=0.015:2thr=0.015:3thr=0.015:4thr=0.015:blur=1,pp=ac/dr/ci,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4,zscale=transfer=st2084:primaries=bt2020:matrix=2020_ncl:dither=error_diffusion:range=limited:chromal=topleft,format=yuv444p10le,hqdn3d=4:3:12:9,fps=fps=60:round=near,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs
#EXTVLCOPT:colorspace=all=auto:trc=auto
#EXTVLCOPT:tonemap=mobius
```

### Finalización del Bloque P0
```m3u8
#EXT-X-MAP:URI="init.mp4"
[URL DEL STREAM]
```

---

## 3. Anatomía del Perfil P1: 4K SUPREME CINEMA

**Objetivo:** Calidad cinematográfica, cadencia perfecta, hardware alto.

### Array `#EXTHTTP` (JSON Payload)
*(Igual que P0, pero con `profile: P1_4K_SUPREME`, `ct: cinema`, y `X-Cortex-Optical-Flow-Minterpolate: 60FPS_CINEMA`)*

### Array `#EXT-X-APE-*` (Directivas APE)
*(Igual que P0)*

### Array `#KODIPROP` (Kodi / ExoPlayer)
```m3u8
#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive
#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=2147483647
#KODIPROP:inputstream.adaptive.chooser_resolution_max=4K
#KODIPROP:inputstream.adaptive.ignore_screen_resolution=true
#KODIPROP:vrr_sync=enabled
#KODIPROP:auto_match_source_fps=true
#KODIPROP:audio_passthrough_earc=strict
#KODIPROP:drm_widevine_enforce=true
```

### Array `#EXTVLCOPT` (VLC / TiviMate / OTT Navigator)
```m3u8
#EXTVLCOPT:video-filter=fieldmatch,decimate,nlmeans=s=2.6:p=7:r=13,bwdif=mode=1:parity=-1:deint=0,deband=1thr=0.015:2thr=0.015:3thr=0.015:4thr=0.015:blur=1,pp=ac/dr/ci,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25,zscale=transfer=st2084:primaries=bt2020:matrix=2020_ncl:dither=error_diffusion:range=limited:chromal=topleft,format=yuv444p10le,hqdn3d=3:2:9:7,fps=fps=60:round=near
#EXTVLCOPT:colorspace=all=auto:trc=auto
#EXTVLCOPT:tonemap=mobius
```

### Finalización del Bloque P1
```m3u8
#EXT-X-MAP:URI="init.mp4"
[URL DEL STREAM]
```

---

## 4. Anatomía del Perfil P2: 4K EXTREME ACTION

**Objetivo:** Acción rápida, reducción de blur, hardware medio-alto.

### Array `#EXTHTTP` (JSON Payload)
*(Igual que P0, pero con `profile: P2_4K_EXTREME`, `ct: action`, y `X-Cortex-Optical-Flow-Minterpolate: 120FPS_ACTIVATED`)*

### Array `#EXT-X-APE-*` (Directivas APE)
*(Igual que P0)*

### Array `#KODIPROP` (Kodi / ExoPlayer)
*(Igual que P1)*

### Array `#EXTVLCOPT` (VLC / TiviMate / OTT Navigator)
```m3u8
#EXTVLCOPT:video-filter=fieldmatch,decimate,nlmeans=s=2.0:p=7:r=13,bwdif=mode=1:parity=-1:deint=0,deband=1thr=0.015:2thr=0.015:3thr=0.015:4thr=0.015:blur=1,pp=ac/dr/ci,zscale=transfer=st2084:primaries=bt2020:matrix=2020_ncl:dither=error_diffusion:range=limited:chromal=topleft,format=yuv420p10le,hqdn3d=2:1:7:5,fps=fps=60:round=near,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs
#EXTVLCOPT:colorspace=all=auto:trc=auto
#EXTVLCOPT:tonemap=mobius
```

### Finalización del Bloque P2
```m3u8
#EXT-X-MAP:URI="init.mp4"
[URL DEL STREAM]
```

---

## 5. Anatomía del Perfil P3: FHD ADVANCED

**Objetivo:** Máxima estabilidad en 1080p, hardware estándar.

### Array `#EXTHTTP` (JSON Payload)
*(Igual que P0, pero con `profile: P3_FHD_ADVANCED`, `ct: general`, `X-Cortex-AI-Super-Resolution: FSR_LITE`, y `X-Cortex-Optical-Flow-Minterpolate: 60FPS_STANDARD`)*

### Array `#EXT-X-APE-*` (Directivas APE)
```m3u8
#EXT-X-APE-SPOOF-DEVICE-CLASS:standard-tv
#EXT-X-APE-SPOOF-DECODING-CAPABILITY:hevc-main10-level5.1
#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT:ENABLED
#EXT-X-APE-AV1-FALLBACK-ENABLED:true
#EXT-X-APE-AV1-FALLBACK-CHAIN:HEVC>H264
#EXT-X-APE-CODEC-PRIORITY:HEVC>H264
#EXT-X-APE-TELCHEMY-TVQM:ENABLED
```

### Array `#KODIPROP` (Kodi / ExoPlayer)
```m3u8
#KODIPROP:inputstream.adaptive.stream_selection_type=fixed-res
#KODIPROP:inputstream.adaptive.chooser_resolution_max=1080p
#KODIPROP:auto_match_source_fps=true
#KODIPROP:audio_passthrough_earc=standard
```

### Array `#EXTVLCOPT` (VLC / TiviMate / OTT Navigator)
```m3u8
#EXTVLCOPT:video-filter=fieldmatch,decimate,nlmeans=s=1.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,deband=1thr=0.015:2thr=0.015:3thr=0.015:4thr=0.015:blur=1,pp=ac/dr/ci,format=yuv420p10le,hqdn3d=2:1:7:5,fps=fps=60:round=near
#EXTVLCOPT:colorspace=all=auto:trc=auto
```

### Finalización del Bloque P3
```m3u8
#EXT-X-MAP:URI="init.mp4"
[URL DEL STREAM]
```

---

## 6. Anatomía del Perfil P4: HD STABLE

**Objetivo:** Estabilidad absoluta en conexiones medias, 720p.

### Array `#EXTHTTP` (JSON Payload)
*(Igual que P3, pero con `profile: P4_HD_STABLE` y sin Super Resolution)*

### Array `#EXT-X-APE-*` (Directivas APE)
*(Igual que P3)*

### Array `#KODIPROP` (Kodi / ExoPlayer)
```m3u8
#KODIPROP:inputstream.adaptive.stream_selection_type=fixed-res
#KODIPROP:inputstream.adaptive.chooser_resolution_max=720p
```

### Array `#EXTVLCOPT` (VLC / TiviMate / OTT Navigator)
```m3u8
#EXTVLCOPT:video-filter=fieldmatch,decimate,bwdif=mode=1:parity=-1:deint=0,format=yuv420p,fps=fps=60:round=near
```

### Finalización del Bloque P4
```m3u8
#EXT-X-MAP:URI="init.mp4"
[URL DEL STREAM]
```

---

## 7. Anatomía del Perfil P5: SD FAILSAFE

**Objetivo:** Garantizar reproducción en hardware mínimo o conexiones 3G/EDGE.

### Array `#EXTHTTP` (JSON Payload)
*(Igual que P4, pero con `profile: P5_SD_FAILSAFE` y sin ninguna mejora Córtex)*

### Array `#EXT-X-APE-*` (Directivas APE)
```m3u8
#EXT-X-APE-SPOOF-DEVICE-CLASS:mobile
#EXT-X-APE-SPOOF-DECODING-CAPABILITY:h264-main-level4.0
#EXT-X-APE-CODEC-PRIORITY:H264
```

### Array `#KODIPROP` (Kodi / ExoPlayer)
```m3u8
#KODIPROP:inputstream.adaptive.stream_selection_type=fixed-res
#KODIPROP:inputstream.adaptive.chooser_resolution_max=480p
```

### Array `#EXTVLCOPT` (VLC / TiviMate / OTT Navigator)
```m3u8
#EXTVLCOPT:video-filter=bwdif=mode=1:parity=-1:deint=0,format=yuv420p
```

### Finalización del Bloque P5
```m3u8
#EXT-X-MAP:URI="init.mp4"
[URL DEL STREAM]
```
