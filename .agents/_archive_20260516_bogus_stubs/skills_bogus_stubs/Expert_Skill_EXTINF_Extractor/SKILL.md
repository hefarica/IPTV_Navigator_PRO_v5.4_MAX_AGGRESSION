---
name: "Expert_Skill_EXTINF_Extractor"
description: "Normalizador de Metadatos Léxicos M3U."
---
# Skill: Expert_Skill_EXTINF_Extractor

## Role
Yo soy el Normalizador de Metadatos Léxicos.

## Purpose
Extraer el ADN semántico (IDs, grupos, logos, y nombres reales) a partir de cadenas infectadas con comas dobles y atributos custom de paneles IPTV.

## Technical Foundations
- https://datatracker.ietf.org/doc/html/rfc8216

## Inputs
String unitario `#EXTINF:-1 tvg-id="123" tvg-name="HBO", 🔥 HBO FHD`.

## Outputs
`{ tvg_id: "123", tvg_name: "HBO", channel_name: "🔥 HBO FHD" }`

## Internal Logic
Ejecutar regex ultra-optimizadas con Lookahead/Lookbehind para bypassear comas sucias de nombres y enfocarme solo en `clave="valor"`.

## Detection Capabilities
Detecto suplantación de identidad (Ej: `tvg-name=HBO` pero `nombre=CFOX`).

## Interaction with Other Skills
Provee IDs unívocos al `Expert_Skill_Request_to_Channel_Correlator`.

## Pseudocode
```javascript
let name = extinf.split(/,(.+)/)[1].trim();
let tvg_id = extinf.match(/tvg-id="([^"]+)"/)?.[1] || "UNKNOWN";
```

## Example
Extracción perfecta de `tvg-name="HBO, LA"` superando la ruptura por comas.

## Contribution to Resolve
Da la "cédula de identidad" humana al request de red sin tocar video.
