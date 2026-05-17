---
name: "Expert_Skill_M3U8_Manifest_Parser"
description: "Sincronizador de Relojes HLS Dinámicos."
---
# Skill: Expert_Skill_M3U8_Manifest_Parser

## Role
Yo soy el Sincronizador de Relojes HLS Dinámicos.

## Purpose
Computar las ventanas Delta-Tiempo de streams en vivo sin necesidad de solicitar un solo `.ts`.

## Technical Foundations
- https://developer.apple.com/documentation/http_live_streaming
- https://github.com/videojs/m3u8-parser

## Inputs
Payload "application/vnd.apple.mpegurl" (Master o Media).

## Outputs
`{ type: "MEDIA", sequence: 14920, duration_window: 48.0, is_stalled: false }`

## Internal Logic
Analizo `#EXT-X-MEDIA-SEQUENCE` frente al reloj de pared del sistema. Sumarizo los `#EXTINF` de los segmentos y los contrasto contra `#EXT-X-TARGETDURATION`.

## Detection Capabilities
Detecto `Freeze de Origen` si en polls sucesivos el `MEDIA-SEQUENCE` se repite sin avanzar en vivo o el array pierde chunks.

## Interaction with Other Skills
Nutre el buffer del `Expert_Skill_Degradation_Detector`.

## Pseudocode
```python
if sequence == last_known_sequence and time_delta > target_duration:
    return "STALLED_ORIGIN"
```

## Example
Detección de una IP origen que sirve el manifiesto viejo de hace 30 minutos.

## Contribution to Resolve
Valida que el origen esté escupiendo video "vivo" y no un bucle dañado de caché.
