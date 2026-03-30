---
name: Skill_Request_to_Channel_Correlator
description: "Vincula un request anonimizado con la identidad real del canal."
---

# Skill_Request_to_Channel_Correlator

## 🎯 Objetivo
Cruzar la información explícita recolectada (Headers HTTP) con la información implícita (Tags HLS) para decretar sin lugar a dudas cuál es el Canal Humano real que se está visualizando. Actúa como juez resolutor si hay conflictos nominales.

## 📥 Inputs
- **Headers Analizados:** De `Skill_HTTP_Header_Analyzer` (contiene `x_ape_channel`).
- **Metadata EXTINF:** Nombre extraído por `Skill_EXTINF_Extractor`.
- **URL Petición:** URL capturada del *Request Interceptor*.

## 📤 Outputs
- `channel_name`: String con el veredicto final.
- `confidence_score`: Nivel de confianza en el macheo (0-100).

## 🧠 Lógica Interna y Reglas
1. **Prioridad 1 (Confidence 99%):** Si el Player APE inyectó el header `X-APE-Channel-Name`, confía en él, pues proviene directamente de la base de datos SQL del usuario al hacer clic en la EPG.
2. **Prioridad 2 (Confidence 85%):** Si no hay header, usar el nombre parseado desde el `#EXTINF` del manifest alojado en el servidor origen.
3. **Prioridad 3 (Confidence 30%):** Si tampoco hay `#EXTINF`, usar fallback léxico (derivado del Path de la URL).

## 💻 Pseudocódigo
```javascript
function Request_to_Channel_Correlator(url, headerHints, extinfName) {
    let result = { channel_name: "UNKNOWN", confidence_score: 0 };
    
    // Nivel 1
    if (headerHints && headerHints.x_ape_channel) {
        result.channel_name = headerHints.x_ape_channel;
        result.confidence_score = 99;
        return result;
    }
    
    // Nivel 2
    if (extinfName && extinfName !== "UNKNOWN") {
        result.channel_name = extinfName;
        result.confidence_score = 85;
        return result;
    }
    
    // Nivel 3 - Fallback heurístico pobre pero necesario
    const urlParts = url.split('/');
    const lastPart = urlParts[urlParts.length - 1]; // ej. "espn_hd.m3u8"
    result.channel_name = lastPart.replace('.m3u8', '').replace(/_/g, ' ');
    result.confidence_score = 30; // Riesgoso
    
    return result;
}
```
