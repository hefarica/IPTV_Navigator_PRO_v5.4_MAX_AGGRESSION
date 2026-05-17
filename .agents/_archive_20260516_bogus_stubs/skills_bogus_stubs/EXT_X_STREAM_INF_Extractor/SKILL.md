---
name: Skill_EXT_X_STREAM_INF_Extractor
description: "Cuantifica calidad física y codecs del HLS manifest."
---

# Skill_EXT_X_STREAM_INF_Extractor

## 🎯 Objetivo
Cuantificar capacidades de las "Variant Streams" bajo un *Master Playlist*, extrayendo y categorizando estrictamente la calidad sin analizar un solo frame de video (Zero-Playback compliance).

## 📥 Inputs
- **Array de Líneas:** Producto de `Skill_M3U8_Manifest_Parser`.

## 📤 Outputs
- **Objeto VariantProfile:**
  - `bandwidth`: Integer (bits por segundo).
  - `resolution`: string ("1920x1080").
  - `codec`: string ("avc1.640028,mp4a.40.2").
  - `frame_rate`: float (60.0).

## 🧠 Lógica Interna y Reglas
1. **Scanner Variante Primario:** El HLS puede declarar N variantes. Esta skill tomará la variante de **mayor resolución/bandwidth** si se le pide la "capacidad máxima del canal", o mapeará el primer valor encontrado como calidad deductiva.
2. **Bandwidth:** Representa consumo de bits, crucial para la skill `Stream_Fingerprinting`.
3. **Codec Identifier:** RFC 8216 requiere un string ISO base file format en los codecs. Esto debe ser extraido para estimar HD o H265/HEVC.

## 🚧 Errores Detectables
- `MISSING_BANDWIDTH`: Ilegal bajo RFC 8216. El atributo BANDWIDTH es mandatorio.

## 💻 Pseudocódigo
```javascript
function EXT_X_STREAM_INF_Extractor(hlsLines) {
    let profiles = [];
    
    for (let line of hlsLines) {
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            let bw = line.match(/BANDWIDTH=(\\d+)/);
            let res = line.match(/RESOLUTION=(\\d+x\\d+)/);
            let cod = line.match(/CODECS="([^"]+)"/);
            let fps = line.match(/FRAME-RATE=([\\d\\.]+)/);

            if(!bw) continue; // RFC violation
            
            profiles.push({
                bandwidth: parseInt(bw[1], 10),
                resolution: res ? res[1] : "Unknown",
                codec: cod ? cod[1] : "Unknown",
                frame_rate: fps ? parseFloat(fps[1]) : 0
            });
        }
    }
    
    // Sort desc to get highest quality as baseline signature
    profiles.sort((a,b) => b.bandwidth - a.bandwidth);
    
    return profiles.length > 0 ? profiles[0] : { bandwidth: 0, resolution: "Unknown", codec: "Unknown", frame_rate: 0 };
}
```

## 📚 Referencia
- Cumplimiento de atributos mandatorios y optativos en tag `#EXT-X-STREAM-INF` (Apple HLS RFC).
