---
name: Skill_Stream_Stability_Scorer
description: "Puntúa de 0 a 100 la fiabilidad del stream basado en latencia y códigos de error."
---

# Skill_Stream_Stability_Scorer

## 🎯 Objetivo
Deducir la robustez de un stream sin mirar los cuadros de video. Usa los tiempos de respuesta del servidor (TTFB) y eventos pasados de Status HTTP para generar un Score de Calidad de Servico (QoS). 

## 📥 Inputs
- `latency_ms`: Tiempo desde el TCP Syn hasta la obtención del primer byte del manifest.
- `status_code`: Status HTTP de la última transacción.

## 📤 Outputs
- `stability_score`: Entero de 0 a 100.

## 🧠 Lógica Interna y Reglas
1. **Regla HTTP Letal:** Cualquier status `>= 400` reduce automáticamente el score a `0` (Channel Down).
2. **Umbral HLS Ideal:** Un fetch de M3U8 debe tardar menos de 200ms. Otorga 100%.
3. **Penalización Cuadrática / Lineal:** Por cada latencia severa (e.g. 800ms) el score se desploma al 30%, porque si el manifest demora casi 1 segundo, la bajada subsiguiente de trozos `.ts` fallará en el dispositivo del usuario final (causando buffering).

## 💻 Pseudocódigo
```javascript
function Stream_Stability_Scorer(latencyMs, statusCode) {
    if (statusCode >= 400) return 0;   // Bloqueo o Error Crítico
    if (latencyMs < 200) return 100;   // Perfectamente sano
    if (latencyMs < 400) return 85;    // Ligera congestión
    if (latencyMs < 800) return 60;    // Peligro de Buffering inminente
    return 30;                         // Extrema lentitud, congelamiento seguro
}
```
