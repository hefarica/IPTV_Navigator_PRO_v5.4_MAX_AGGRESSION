---
name: Skill_RealTime_Event_Aggregator
description: "Compila todas las extracciones en el Output JSON Mandatorio."
---

# Skill_RealTime_Event_Aggregator

## 🎯 Objetivo
El nodo terminal del *API Gateway* del Engine. Tiene una sola responsabilidad: Compilar absolutamente todos los descubrimientos y cálculos de las 17 skills anteriores en un modelo DTO (Data Transfer Object) estricto y uniformemente predecible en formato JSON. Esta es la base de datos visual para cualquier Dashboard superior de observación IPTV (Elastic, Grafana, React Panel).

## 📥 Inputs
- **Pipeline Aggregate:** Un diccionario con el resultado de todas las heurísticas procesadas por el Orchestrator.

## 📤 Outputs
- **Contrato Estricto JSON.**

## 🧠 Lógica Interna y Reglas
1. Ningún campo devuelto puede ser `undefined`. Debe completarse como `"Unknown"`, `0`, o `[]` (Listas vacías para pistas no decodificables).
2. Agrega la hora `toISOString` obligatoria como huella local.

## 💻 Pseudocódigo
```javascript
function RealTime_Event_Aggregator(params) {
    return {
        // Core Id
        channel_name: params.channel_name || "UNKNOWN",
        channel_id: params.channel_id || "unknown",
        tvg_id: params.tvg_id || "",
        group_title: params.group_title || "",
        source_playlist: params.source_playlist || "NA",
        
        // Navigation
        manifest_url: params.manifest_url || "",
        request_url: params.request_url || "",
        
        // Operation Output
        status_code: params.status_code || 0,
        status_classification: params.status_classification || "unknown",
        stream_state: params.stream_state || "unknown",
        
        // Physical Heuristics
        bandwidth: params.bandwidth || 0,
        resolution: params.resolution || "Unknown",
        frame_rate: params.frame_rate || 0,
        codec: params.codec || "",
        server: params.server || "Unknown",
        content_type: params.content_type || "Unknown",
        latency_ms: params.latency_ms || 0,
        
        // Derived Analytics
        fingerprint: params.fingerprint || "missing_fp",
        duplicate_group: params.duplicate_group || "missing_grp",
        stability_score: params.stability_score || 0,
        quality_score: params.quality_score || 0,
        confidence_score: params.confidence_score || 0,
        detected_by: params.detected_by || [],
        timestamp: new Date().toISOString(),
        observations: params.observations || []
    };
}
```

## 📚 Referencia
- Estructura de ingesta ELK (Elastic Stack) o Kibana para análisis de telemetría de red. Este Object cumple los requisitos para ser enviado a Logstash directo.
