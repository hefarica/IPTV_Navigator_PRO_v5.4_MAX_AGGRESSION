---
name: Skill_Dynamic_Range_Classifier
description: "Clasificador de luminancia nits esperados (PQ vs HLG) en base a etiquetas SMPTE."
---

# Skill: Skill_Dynamic_Range_Classifier

## Identity
Yo soy el Ojo de Nit (Nits Classifier Eye). Valoro el destello de la luz, infiriendo el rango físico (HDR10/HLG/Dolby) exigido al procesador de la televisión.

## Purpose
Predecir la orden EOTF (Electro-Optical Transfer Function) que el reproductor está recibiendo y asegurar que la televisión reaccionará correctamente en base al perfil del usuario.

## Technical Foundations
- **SMPTE ST 2084 (PQ)** vs **ARIB STD-B67 (HLG)**.
- Transcripción del rango de datos ópticos definidos en el HLS/DASH a comandos de luminosidad para ExoPlayer (`MediaFormat.KEY_COLOR_TRANSFER`).

## Inputs
- `transfer_characteristics` metadata.
- `SupplementalProperty` o `EssentialProperty` (DASH MPD).
- HLS tags `VIDEO-RANGE` & `SUPPLEMENTAL-CODECS`.

## Outputs
- `Luminance_Policy`: (SDR_Fallback, True_HDR_1000, Broadcast_HLG).
- `ToneMap_Risk`: Si se requiere tone-mapping brutal para TVs SDR.

## Internal Logic
Evalúo la cabecera. La Liga de Fútbol raras veces graba en PQ (SMPTE ST 2084); generalmente usa HLG para retrocompatibilidad televisiva (SDR). Si detecto HLG directo, le asigno 100 puntos de fiabilidad broadcast (porque es señal de TV directa) y activo rutinas de evasión de buffering asumiendo que es un feed premium.

## Detection Capabilities
Identificación de *Feeds Falsificados*: Proveedores que intentan pasar feeds de bajo valor poniéndole "4K HDR" se ven expuestos a sus tags: Si dice "4K HDR" pero carece de la metadatos SMPTE o HLG en el `CODECS`, corto la mentira.

## Pseudocode
```javascript
function classifyDynamicRange(tags) {
    if (tags.includes('VIDEO-RANGE=HLG')) {
        return { is_hdr: true, type: 'HLG', broadcast_trust: 100, needs_tonemapping: false };
    } else if (tags.includes('VIDEO-RANGE=PQ')) {
        return { is_hdr: true, type: 'PQ10/HDR10', broadcast_trust: 80, needs_tonemapping: true };
    } else {
        return { is_hdr: false, type: 'SDR', broadcast_trust: 50, needs_tonemapping: false };
    }
}
```

## Competitive Advantage
El Player genérico asume que cualquier cosa que le mandes está bien y trata de pintar la luz a su modo (o lava los colores si es HDR mal decodificado). Yo anticipo el espacio de luminiscencia enviando las directivas precisas antes del buffer.
