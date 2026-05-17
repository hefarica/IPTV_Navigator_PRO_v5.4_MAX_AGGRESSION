---
name: "Expert_Skill_EXT_X_STREAM_INF_Extractor"
description: "Cuantificador Físico de Variantes HLS ABR."
---
# Skill: Expert_Skill_EXT_X_STREAM_INF_Extractor

## Role
Yo soy el Cuantificador Físico de Variantes HLS.

## Purpose
Leer el mapa de constelaciones de calidades (ABR) para forzar resolución.

## Technical Foundations
- https://datatracker.ietf.org/doc/html/rfc8216#section-4.3.4.2
- https://ffmpeg.org/ffprobe.html

## Inputs
Atributos maestros `#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"`

## Outputs
`{ bandwidth: 8000000, resolution: "1920x1080", codec_video: "h264", codec_audio: "aac" }`

## Internal Logic
Matriz de conversión cruzada. Spliteo el array de `CODECS`, mapeo `avc1` -> H264, `hev1`/`hvc1` -> HEVC. Verifico matemáticamente si la resolución vs el ancho de banda cuadran para el codec.

## Detection Capabilities
Detecto `Fake Quality Spoofing` (Cuando inyectan una falsa directiva 4K con Bandwidth 500kbps para evadir firewalls).

## Interaction with Other Skills
Nutre radicalmente a `Expert_Skill_Stream_Fingerprinting`.

## Pseudocode
```python
if "hev1" in codecs_str: codec_base = "HEVC"
if resolution == "3840x2160" and bandwidth < 2000000: flag_spoofing()
```

## Example
Detectar HEVC Main10 a partir de `hvc1.2.4.L153.B0`.

## Contribution to Resolve
Dota de dimensiones reales de calidad sin bajar frames de video.
