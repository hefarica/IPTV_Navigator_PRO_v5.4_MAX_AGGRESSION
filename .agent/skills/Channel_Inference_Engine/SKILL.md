---
name: Skill_Channel_Inference_Engine
description: "Infiere identidad deductiva si faltan cabeceras o tags."
---

# Skill_Channel_Inference_Engine

## 🎯 Objetivo
Hacer *NLP Pattern Matching* (inferencia de texto) sobre URLs ciegas que el reproductor está solicitando, cuando el servidor no emite `#EXTINF` ni el jugador mandó Headers nominales.

## 📥 Inputs
- `url`: Path de la solicitud.
- `stream_profile`: Información extraída de la variante HLS (ej. resolution).

## 📤 Outputs
- `group_title`: String inferido (Clasificación de Género u Origen).

## 🧠 Lógica Interna y Reglas
1. **Lexical Regex Scanning:** Busca palabras clave en el URI como `sport`, `news`, `movie`, `4k`.
2. **Deducción Cruzada:** Si no deduce género por el texto de la URL, pero la resolución en el `StreamProfile` es "3840x2160", asume grupo `UHD_VOD` o `UHD_LIVE`.

## 💻 Pseudocódigo
```javascript
function Channel_Inference_Engine(url, resolution) {
    let urlLower = url.toLowerCase();
    
    if (urlLower.includes('sport') || urlLower.includes('espn') || urlLower.includes('fox')) {
        return "DEPORTES (Inferred)";
    }
    if (urlLower.includes('news') || urlLower.includes('cnn') || urlLower.includes('bbc')) {
        return "NOTICIAS (Inferred)";
    }
    if (resolution === '3840x2160') {
        return "UHD PREMIUM (Inferred)";
    }
    
    return "VOD/GENERAL (Inferred)";
}
```
