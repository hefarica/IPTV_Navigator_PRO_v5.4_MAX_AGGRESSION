---
name: Skill_Encoding_Profile_Analyzer
description: "Analizador de perfiles de compresión: High vs Main 10 vs Baseline."
---

# Skill: Skill_Encoding_Profile_Analyzer

## Identity
Yo soy la Interpolación Matemática de Diccionarios. Leo cómo se empaquetó el bloque (CABAC) para decidir si el reproductor debe sudar o si reirá decodificando el video.

## Purpose
Identificar el esfuerzo computacional invertido por el proveedor en codificar el video, basándome en el atributo `avc1` o `hvc1` Profile/Level (ej: Baseline, Main, High, Main 10).

## Technical Foundations
- **H.264 / AVC Profiles**: CABAC (Context-based Adaptive Binary Arithmetic Coding) vs CAVLC (Context-Adaptive Variable-Length Coding). Baseline no soporta CABAC, lo cual infla el tamaño y reduce calidad.
- **HEVC Main 10**: Soporte masivo a espacios de color 10-bit HDR nativo.

## Inputs
- Valor hexadecimal y nivel dictaminado en el tag `CODECS=`.
  - AVC/H264: `avc1.42E0...` (Baseline) vs `avc1.6400...` (High).
  - HEVC/H265: `hvc1.1...` (Main) vs `hvc1.2...` (Main 10).

## Outputs
- `Profile_Grade`: Puntaje de ingeniería.
- `Bypass_Dictation`: Decisión de reproducir el feed o cazar otro superior.

## Internal Logic
Si detecto `avc1.42...` (Baseline), el proveedor codificó el video para que reproduzca en celulares del año 2012. Esto es basura visual ineficiente en una Smart TV de este siglo. Sanción masiva. Exigiré y mandaré la señal de cazar una alternativa en perfil `High` (`avc1.64...`) o derechamente `HEVC`.

## Detection Capabilities
Detección de *Lazy Re-Encoders (Low Effort Origin)*: Evito canales que desperdician gigabytes de red enviando calidad mediocre a través de perfiles de compresión baratos (y rápidos para el servidor, pero horribles para el cliente).

## Pseudocode
```python
def analyzeEncodingProfile(codecStr):
    if "avc1.42" in codecStr: # Baseline
        return { score: 10, verdict: "TRASH_TIER_BASELINE", action: "SEEK_AV1_OR_HEVC" }
    elif "avc1.64" in codecStr: # High Profile
        return { score: 70, verdict: "ACCEPTABLE_AVC_HIGH", action: "ALLOW" }
    elif "hvc1.2" in codecStr or "hev1.2" in codecStr: # Main 10 HDR
        return { score: 100, verdict: "GOD_TIER_HEVC_MAIN10", action: "PRIORITIZE_LOCK" }
    return { score: 50, verdict: "UNKNOWN_DEFAULT", action: "PASSIVE" }
```

## Competitive Advantage
Mientras el 95% está atorado viendo la resolución "4K", yo reviso si el diccionario de compresión CABAC del origen es digno del procesador destino, erradicando pixelados originados por perfiles "Baseline".
