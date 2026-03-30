---
name: Skill_HTTP_Header_Analyzer
description: "Extrae telemetría técnica de las cabeceras de red."
---

# Skill_HTTP_Header_Analyzer

## 🎯 Objetivo
Diseccionar pasivamente el protocolo de negociación capa 7 en busca de identidades inyectadas intencionalmente (`X-APE` headers), metadata geográfica (CDN node hints), y firmas que adviertan engaños upstream (p.e. un `text/html` disfrazado de `200 OK`).

## 📥 Inputs
- `reqHeaders`: Diccionario de Headers inyectados vía Request (Client-side / Player).
- `resHeaders`: Diccionario de Headers emitidos por el Response (Server-side).

## 📤 Outputs
- **Objeto de Telemetría:**
  - `x_ape_channel`: string
  - `x_ape_id`: string
  - `server`: string
  - `content_type`: string
  - `content_length`: integer

## 🧠 Lógica Interna y Reglas
1. **Regla de Oro (Zero-Latency Recon):** Si la cabecera del request contiene directivas `X-APE-Channel-Name`, **sobreescribe** el flujo heurístico del parser. El Agente usa este Header como 99% fuente de verdad, ahorrando procesamiento HLS posterior.
2. **Defensa contra Portales Cautivos / ISP Blocking:** ISP bloqueando m3u8 devolverán HTTP 200, pero con `Content-Type: text/html`. Esta skill aísla `Content-Type` para que la skill de estado detecte el bloqueo.

## 🚧 Errores Detectables
- `MIMETYPE_MISMATCH`: Se pidió IPTV y el server entregó HTML.
- `CONTENT_LENGTH_ZERO`: Canal vacío.

## 💻 Pseudocódigo
```javascript
function HTTP_Header_Analyzer(requestHeaders, responseHeaders) {
    const normalize = (dict) => {
        let n = {};
        for(let key in dict) n[key.toLowerCase()] = dict[key];
        return n;
    };
    
    let reqH = normalize(requestHeaders);
    let resH = normalize(responseHeaders);
    
    return {
        x_ape_channel: reqH['x-ape-channel-name'] || null,
        x_ape_id: reqH['x-ape-channel-id'] || null,
        user_agent_used: reqH['user-agent'] || 'Unknown',
        server: resH['server'] || 'Unknown',
        content_type: resH['content-type'] || 'unknown',
        content_length: parseInt(resH['content-length'] || "0", 10),
        cache_control: resH['cache-control'] || 'no-cache'
    };
}
```

## 📚 Referencia
- Especificación HTTP/1.1 y HTTP/2 sobre Headers. MDN (`developer.mozilla.org/en-US/docs/Web/HTTP/Headers`).
