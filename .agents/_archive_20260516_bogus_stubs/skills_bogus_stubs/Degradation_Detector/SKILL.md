---
name: Skill_Degradation_Detector
description: "Alerta preventivamente antes del timeout del player (Zapping predictor)."
---

# Skill_Degradation_Detector

## 🎯 Objetivo
La vanguardia técnica del Zero-Playback Engine. Analiza la derivada matemática de la latencia en las recargas iterativas de un *Live M3U8 Manifest*. El reproductor HLS típicamente recarga el Playlist cada `TargetDuration` (e.g. 5 a 10s según Apple RFC 8216). Si este fetch se demora por encima de lo dictaminado por los tags, es físicamente imposible que el reproductor reciba video a tiempo.

## 📥 Inputs
- **Serie Temporal:** Array resultante de `Skill_Channel_State_History`.

## 📤 Outputs
- **String de Degradación:** `"STABLE" | "WARNING_LATENCY" | "CRITICAL_FREEZE"`

## 🧠 Lógica Interna y Reglas
1. **Regla de Picos:** Si el promedio de `latency_ms` de las últimas 3 peticiones sufre un diferencial de salto (spike) `> 200%` en la última petición y excede los `500ms`, se genera alerta máxima.
2. El sistema alertará de problemas CDN antes que el propio Nginx del upstream dictamine un `504 Gateway Timeout`.

## 💻 Pseudocódigo
```javascript
function Degradation_Detector(historyQueue) {
    if (historyQueue.length < 3) return "STABLE"; // Poca historia para inferir

    const recent = historyQueue.slice(-3);
    const lastEvent = recent[2];
    
    // Media de los penúltimos eventos empíricos
    const avgPrev = (recent[0].latency_ms + recent[1].latency_ms) / 2;
    
    // Análisis de la derivada
    const spikeRatio = lastEvent.latency_ms / (avgPrev || 1); 

    if (lastEvent.latency_ms > 800) return "CRITICAL_FREEZE"; // Extrema demora Time-to-First-Byte
    if (spikeRatio > 2.0 && lastEvent.latency_ms > 300) return "WARNING_LATENCY";

    return "STABLE";
}
```
