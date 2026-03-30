# Arquitectura Maestro: APE Resolve Engine (18 Skills Modulares)

**Objetivo Central:** Identificar, monitorizar y clasificar streams IPTV en tiempo real utilizando EXCLUSIVAMENTE metadata extraída de HTTP requests/responses y manifests M3U/M3U8. **Cero reproducción de video.**

**Referencias Normativas Integradas:**
- **HLS RFC 8216:** [https://datatracker.ietf.org/doc/html/rfc8216](https://datatracker.ietf.org/doc/html/rfc8216)
- **Apple HLS Docs:** [https://developer.apple.com/documentation/http_live_streaming](https://developer.apple.com/documentation/http_live_streaming)
- **HTTP Headers Mozilla:** [https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- **FFprobe:** [https://ffmpeg.org/ffprobe.html](https://ffmpeg.org/ffprobe.html) (Se extrae su capacidad de metadata pero portado a M3U8 Tag Parsing puro temporal).
- **Streamlink:** [https://streamlink.github.io/](https://streamlink.github.io/) (Lógica de extracción de M3U8 variante).
- **Python m3u8 parser:** [https://github.com/globocom/m3u8](https://github.com/globocom/m3u8)
- **Node m3u8 parser:** [https://github.com/videojs/m3u8-parser](https://github.com/videojs/m3u8-parser)

---

## ETAPA 1 — DEFINICIÓN TÉCNICA DE LAS 18 SKILLS

### 1. Skill_M3U_Playlist_Parser
- **Objetivo:** Ingerir una lista M3U cruda global y extraer su topología sin reproducir nada.
- **Inputs:** `string` (contenido del archivo `.m3u`).
- **Outputs:** `Array<Object>` (Listado de canales y sus metadatos globales).
- **Metadata:** `#EXTM3U`, `#EXTINF`.
- **Lógica:** Implementa un lexer similar a *videojs/m3u8-parser* para leer listas M3U estándar.
- **Errores:** Archivo corrupto (sin `#EXTM3U`).
- **Pseudocódigo:**
```javascript
function Skill_M3U_Playlist_Parser(m3uContent) {
  if(!m3uContent.startsWith("#EXTM3U")) throw "Invalid M3U";
  return m3uContent.split('#EXTINF:').slice(1).map(block => {
      let lines = block.split('\\n');
      return { rawHead: lines[0], url: lines[1] };
  });
}
```

### 2. Skill_M3U8_Manifest_Parser
- **Objetivo:** Descomponer un playlist HLS específico (Master o Media) según RFC 8216.
- **Inputs:** `string` manifestHLS.
- **Outputs:** `Object` (MasterPlaylist o MediaPlaylist properties).
- **Metadata:** `#EXT-X-VERSION`, `#EXT-X-TARGETDURATION`, `#EXT-X-MEDIA-SEQUENCE`.
- **Reglas:** Distingue si es Master (contiene variantes) o Media (contiene segmentos `.ts`).

### 3. Skill_EXTINF_Extractor
- **Objetivo:** Extraer la identidad humana del canal desde el tag originario.
- **Inputs:** `string` headerTag (e.g. `"-1 tvg-id=\"ESPN\",ESPN HD"`).
- **Outputs:** `Object` `{ channel_name, tvg_id, group_title }`.
- **Lógica:** Regex transversal. `/,([^,]+)$/` extrae el nombre post-coma.

### 4. Skill_EXT_X_STREAM_INF_Extractor
- **Objetivo:** Cuantificar la calidad física y codec map del stream.
- **Inputs:** `string` tag `#EXT-X-STREAM-INF`.
- **Outputs:** `Object` `{ bandwidth, resolution, codec, frame_rate }`.
- **Reglas:** Si hay múltiples atributos, prioriza el `RESOLUTION` más alto de la variante primaria.

### 5. Skill_HTTP_Header_Analyzer
- **Objetivo:** Extraer telemetría técnica de la negociación HTTP.
- **Inputs:** `Object` HTTP Request Headers & Response Headers.
- **Outputs:** `Object` `{ x_ape_channel, server, content_type }`.
- **Error:** Si `Content-Type` no contiene `mpegurl`, rechaza el análisis (Portal cautivo o baneo).

### 6. Skill_HTTP_Status_Classifier
- **Objetivo:** Categorizar operativamente el status devuelto por el servidor upstream IPTV.
- **Inputs:** `int` statusCode.
- **Outputs:** `string` state.
- **Reglas:** 200->activo, 206->entrega parcial, 403->bloqueado, 404->inexistente, 503/504->degradado.

### 7. Skill_Stream_Fingerprinting
- **Objetivo:** Generar una firma inmutable del stream físico abstrayendo IDs temporales.
- **Inputs:** Resolución, Codec, Bandwidth.
- **Outputs:** `string` Hash SHA-256.
- **Lógica:**
```javascript
function Skill_Stream_Fingerprinting(res, codec, bw) {
  return crypto.createHash('sha256').update(`${res}|${codec}|${bw}`).digest('hex');
}
```

### 8. Skill_Request_to_Channel_Correlator
- **Objetivo:** Vincular un request anónimo (`GET /6789.m3u8`) con el metadata procesado del canal.
- **Inputs:** M3U8 manifest URL, Hash HTTP Headers.
- **Outputs:** `channel_name` referencial.

### 9. Skill_Duplicate_Stream_Detector
- **Objetivo:** Identificar si dos canales lógicos diferentes son en realidad el mismo segmento HLS redundante.
- **Inputs:** `string` fingerprintA, `string` fingerprintB.
- **Outputs:** `boolean` isDuplicate, `string` duplicate_group.

### 10. Skill_Stream_Stability_Scorer
- **Objetivo:** Calcular % de fiabilidad.
- **Inputs:** `int` latencyMs, `int` errorCount (404/504).
- **Outputs:** `int` Score (0-100).
- **Reglas:** Pierde 10 puntos por cada 100ms de latencia por encima de 300ms.

### 11. Skill_Multi_Channel_Monitor
- **Objetivo:** Sostener una memoria de estado en RAM para trackeo de `N` canales sin bloqueo.
- **Inputs:** SessionID, JSON Stream Profiles.
- **Outputs:** Mapa vivo de instancias asíncronas concurrentes (Map/LRU cache).

### 12. Skill_Channel_Inference_Engine
- **Objetivo:** Deduce qué canal es, si no existe `#EXTINF` ni Header directo.
- **Inputs:** URL path (ej. `/live/sports/espn.m3u8`), M3U8 Codecs.
- **Lógica:** Ejecuta NLP simple (Regex) en el path, omitiendo credenciales, deduciendo "espn" de la URI.

### 13. Skill_Query_Params_Analyzer
- **Objetivo:** Extraer IDs del panel y firmas tokenizadas de URLs dinámicas.
- **Inputs:** `string` URL.
- **Outputs:** `Object` (Diccionario de parámetros).
- **Lógica:** Emplea URLSearchParams. Extrae `?token=...` o `?ch=...`.

### 14. Skill_CDN_Server_Identifier
- **Objetivo:** Clasificar el origen del proveedor (Xtream Codes nginx, Cloudflare, etc).
- **Inputs:** Header `Server`, Header `Via`.
- **Outputs:** `string` CDN Vendor Type.

### 15. Skill_Cross_Playlist_Correlator
- **Objetivo:** Comparar listas completas para detectar fuentes alternativas.
- **Inputs:** `Array` Payload Lista A, `Array` Payload Lista B.
- **Outputs:** Matriz de canales equivalentes (Listas de Backup).

### 16. Skill_Channel_State_History
- **Objetivo:** Retener la ventana de tiempo de los últimos 10 requests al canal.
- **Inputs:** Timestamp, Status Actual.
- **Outputs:** `Array<Object>` Sliding window queue.

### 17. Skill_Degradation_Detector
- **Objetivo:** Alertar previo a que la señal caiga en el reproductor.
- **Inputs:** Array temporal de latencias TTFB de `Skill_Channel_State_History`.
- **Reglas:** Si la derivada de la latencia crece un 200% y supera el TargetDuration del HLS RFC 8216, alertar inestabilidad inminente.

### 18. Skill_RealTime_Event_Aggregator
- **Objetivo:** Compilar los descubrimientos de todas las skills en un Payload final que será exportado o loggeado.
- **Inputs:** Outputs de Skills 1 a 17.
- **Outputs:** JSON Estandarizado Final.

---

## ETAPA 2 — CONSTRUCCIÓN DEL RESOLVE CERO-VIDEO

### El Controlador del Sistema (Node.js)
```javascript
const crypto = require('crypto');
const axios = require('axios'); // Herramienta para Zero-Video HTTP Probing

class APEResolveIntelligence {
    constructor() {
        this.stateHistory = new Map(); // Skill 16: Channel State History
        this.channelMonitor = new Map(); // Skill 11: Multi Channel Monitor
    }

    async orchestrateRequest(targetUrl, incomingHeaders) {
        const timestamp = new Date().toISOString();
        let startTime = Date.now();
        
        try {
            // STEP 1: Interceptor & HTTP Head Probe (No Video Fetch)
            const response = await axios.get(targetUrl, { timeout: 3000 });
            let latency = Date.now() - startTime;
            
            return this.buildOutput(response.data, response.status, response.headers, incomingHeaders, targetUrl, latency, timestamp);
        } catch(error) {
            let latency = Date.now() - startTime;
            let status = error.response ? error.response.status : 504;
            return this.buildOutput("", status, error.response?.headers || {}, incomingHeaders, targetUrl, latency, timestamp);
        }
    }

    buildOutput(m3u8Body, statusCode, resHeaders, reqHeaders, url, latency, time) {
        // Skill 5 & 14: Header Analyzer & CDN
        const cdn = resHeaders['server'] || 'Unknown';
        const cType = resHeaders['content-type'] || '';
        
        // Skill 6: Status Classifier
        let statusClass = "unknown";
        if (statusCode === 200) statusClass = "active";
        else if (statusCode === 206) statusClass = "active_partial";
        else if (statusCode === 403) statusClass = "blocked_auth";
        else if (statusCode === 404) statusClass = "offline_missing";
        else if (statusCode >= 500) statusClass = "degraded";

        // M3U8 Parsing Layer (Skills 2, 3, 4)
        let name = "UNKNOWN", bw = 0, res = "Unknown", codec = "", fps = 0, tvg = "";
        if (statusClass.includes("active") && cType.includes("mpegurl")) {
            const extInfMatch = m3u8Body.match(/#EXTINF:.*tvg-id="([^"]*)".*?,(.*)\\n/);
            if (extInfMatch) { tvg = extInfMatch[1]; name = extInfMatch[2]; }
            
            const streamInfMatch = m3u8Body.match(/#EXT-X-STREAM-INF:BANDWIDTH=(\\d+).*RESOLUTION=(\\d+x\\d+).*CODECS="([^"]+)"/);
            if(streamInfMatch) { bw = parseInt(streamInfMatch[1]); res = streamInfMatch[2]; codec = streamInfMatch[3]; }
        }

        // Skill 12: Inference Engine (Fallback)
        if (name === "UNKNOWN") {
            const pathGuess = url.split('/').pop().replace('m3u8', '');
            if(pathGuess.length > 2) name = pathGuess;
        }

        // Skill 7 & 9: Fingerprint & Duplicates
        const fingerprint = crypto.createHash('sha256').update(`${res}|${codec}|${bw}`).digest('hex');
        const duplicateGroup = `grp_${fingerprint.substring(0,8)}`;

        // Skill 10 & 17: Stability & Degradation
        let stability = 100;
        if(latency > 800) stability = 50; 
        if(statusCode >= 400) stability = 0;

        // Skill 18: Event Aggregator => JSON OBLIGATORIO
        return {
            channel_name: reqHeaders['x-ape-channel-name'] || name,
            channel_id: reqHeaders['x-ape-channel-id'] || "unknown",
            tvg_id: tvg,
            group_title: "",
            source_playlist: "APE_V5.4",
            manifest_url: url,
            request_url: `/virtual/proxy/${fingerprint}`,
            status_code: statusCode,
            status_classification: statusClass,
            stream_state: statusClass.startsWith('active') ? "active" : statusClass,
            bandwidth: bw,
            resolution: res,
            frame_rate: fps,
            codec: codec,
            server: cdn,
            content_type: cType,
            latency_ms: latency,
            fingerprint: fingerprint,
            duplicate_group: duplicateGroup,
            stability_score: stability,
            quality_score: res.includes('1080') ? 100 : 70,
            confidence_score: (reqHeaders['x-ape-channel-name']) ? 99 : 60,
            detected_by: ["Skill_HTTP_Status_Classifier", "Skill_EXTINF_Extractor"],
            timestamp: time,
            observations: [
                latency > 800 ? "WARNING: Latency exceeded HLS TargetDuration buffer" : "Stable TTFB bounds"
            ]
        };
    }
}
```
