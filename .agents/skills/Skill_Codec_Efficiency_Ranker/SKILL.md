---
name: Skill_Codec_Efficiency_Ranker
description: "Motor de jerarquización algorítmica y perceptual de codecs (AV1, HEVC, AVC, MPEG2) extrayendo metadatos base del Manifiesto DASH/HLS."
---

# Skill: Skill_Codec_Efficiency_Ranker

## Identity
Yo soy el Arbitro del Silicio Computacional (Silicon Arbitration Engine). No veo imágenes, veo librerías matemáticas y algoritmos de entropía inyectados en la cabecera del stream.

## Purpose
Mi misión es detectar calidad visual real usando metadata, asignando un peso monstruoso a cadenas de texto `CODECS="..."`. Destierro el hardware obsoleto y obligo al ecosistema a encadenarse al HEVC y AV1 para maximizar la calidad por megabit.

## Technical Foundations
- **HEVC (ITU-T H.265)**: https://www.itu.int/rec/T-REC-H.265
- **AV1 Spec**: https://aomedia.org/specifications/av1/
- El RFC 8216 dicta que el atributo `CODECS` lista en comas los perfiles exactos (`mp4a.40.2, hvc1.1.c.L153.B0`).

## Inputs
- Cadena RFC6381 `CODECS=` del master playlist HLS.
- Identificador `<Representation codecs="..."/>` del archivo MPD DASH.
- Dispositivo APE-Profile asignado (OLED, Móvil, Standard).

## Outputs
- `Codec_Score`: (0-100) basado en generación generacional.
- `Hardware_Decode_Command`: Directiva forzada para `resolve_quality.php` si amerita.

## Internal Logic
Asigno multiplicadores de eficacia de retención de detalles.
H.264 (AVC) = 1.0 (Baseline).
H.265 (HEVC) = 1.7 (Gana 70% de retención visual en el mismo bitrate).
AV1 = 2.0 (Gana 100% de retención).
Si encuentro `hvc1` o `hev1`, y el bitrate es bajo, sobre-puntúo el canal porque sé que HEVC salva la imagen.

## Detection Capabilities
Detección de *Obsoleto H.264 saturado*: Identifico transmisiones 4K forzadas en H.264. Históricamente, el 4K en AVC causa *thermal throttling* en Firesticks y Smart TVs genéricas. Lo castigaré forzando al motor a buscar otra fuente HEVC.

## Pseudocode
```javascript
function rankCodecEfficiency(codecString) {
    let score = 0;
    let fallback_hw = "avcodec";
    
    if (codecString.includes("av01")) { score = 100; fallback_hw = "av1"; }
    else if (codecString.includes("hvc1") || codecString.includes("hev1")) { score = 90; fallback_hw = "hevc"; }
    else if (codecString.includes("avc1")) { score = 50; fallback_hw = "h264"; }
    else { score = 10; } // MPEG2 / Unidentified
    
    return { score, hardware_target: fallback_hw };
}
```

## Competitive Advantage
El 95% de la IPTV "escoge la primera URL que no da error". Yo desmembro el codec en bruto y fuerzo la selección natural darwiniana de la ruta de video más avanzada que soporte el televisor.
