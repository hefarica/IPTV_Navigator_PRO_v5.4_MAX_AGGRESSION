---
name: Skill_HTTP_Status_Classifier
description: "Traduce códigos HTTP upstream a un estado operativo."
---

# Skill_HTTP_Status_Classifier

## 🎯 Objetivo
Categorizar el valor probabilístico del payload recibido cruzando HTTP Code con MIME y resolviendo en un **Estado de Corriente** (Stream State) comprensible para negocio.

## 📥 Inputs
- `status_code`: Integer provisto en la repuesta HTTP.
- `content_type`: String deducido en validación `Skill_HTTP_Header_Analyzer`.

## 📤 Outputs
- `status_classification`: string `(active | active_partial | blocked_auth | offline_missing | degraded)`

## 🧠 Lógica Interna y Reglas
1. **Regla del 206 "Media Segment":** Obtener un `206 Partial Content` de un segmento explícito es un indicador sano de flujo de video.
2. **Regla ISP Ban:** `200` + HTML MIME = `offline_missing (Ban)`.
3. **Regla de Balanceo Fallido:** Cualquier estatus `5xx` indica caída general, o congestión de CDN. Todo 500 debe clasificar como `degraded`.

## 💻 Pseudocódigo
```javascript
function HTTP_Status_Classifier(statusCode, contentType) {
    if (statusCode === 200) {
        if (!contentType || contentType.includes('mpegurl') || contentType.includes('video/mp2t')) {
            return "active";
        }
        return "offline_missing_isp_block"; // Caso portal cautivo
    }
    
    if (statusCode === 206) return "active_partial";
    if (statusCode === 401 || statusCode === 403) return "blocked_auth";
    if (statusCode === 404) return "offline_missing";
    if (statusCode >= 500 && statusCode < 600) return "degraded";
    
    return "unknown_state";
}
```
