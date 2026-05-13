/**
 * APE Metadata-Only Resolve Engine v4.0
 * Ejecución de Skills sin Reproducción de Video (Zero-Playback Intelligence)
 */
const crypto = require('crypto');
const axios = require('axios'); // Requires: npm install axios

// ====================================================
// SKILLS DE EXTRACCIÓN Y PARSING
// ====================================================

class SkillParserM3U8 {
    static exec(manifestRaw) {
        if (!manifestRaw.includes('#EXTM3U')) throw new Error('Not a valid HLS Manifest');
        return {
            lines: manifestRaw.split('\\n'),
            raw: manifestRaw,
            hasExtInf: manifestRaw.includes('#EXTINF:'),
            hasStreamInf: manifestRaw.includes('#EXT-X-STREAM-INF:')
        };
    }
}

class SkillExtraccionStreamInf {
    static exec(manifestLines) {
        let profile = { bandwidth: null, resolution: null, codecs: null, framerate: null };
        for (let line of manifestLines) {
            if (line.includes('#EXT-X-STREAM-INF:')) {
                const bw = line.match(/BANDWIDTH=(\\d+)/);
                const res = line.match(/RESOLUTION=(\\d+x\\d+)/);
                const codecs = line.match(/CODECS="([^"]+)"/);
                const fps = line.match(/FRAME-RATE=([\\d\\.]+)/);
                
                if (bw) profile.bandwidth = parseInt(bw[1], 10);
                if (res) profile.resolution = res[1];
                if (codecs) profile.codecs = codecs[1];
                if (fps) profile.framerate = parseFloat(fps[1]);
                break; // Extraemos solo el mayor o el principal
            }
        }
        return profile;
    }
}

class SkillExtraccionExtinf {
    static exec(manifestLines) {
        let meta = { channel_name: "UNKNOWN", tvg_id: "", group_title: "" };
        for (let line of manifestLines) {
            if (line.startsWith('#EXTINF:')) {
                const tvgMatch = line.match(/tvg-id="([^"]+)"/);
                const groupMatch = line.match(/group-title="([^"]+)"/);
                const nameMatch = line.match(/,(.+)$/);
                
                if (tvgMatch) meta.tvg_id = tvgMatch[1];
                if (groupMatch) meta.group_title = groupMatch[1];
                if (nameMatch) meta.channel_name = nameMatch[1].trim();
                break;
            }
        }
        return meta;
    }
}

// ====================================================
// SKILLS DE RED Y TRANSPORTE
// ====================================================

class SkillAnalisisHeaders {
    static exec(requestHeaders, responseHeaders) {
        return {
            x_ape_channel: requestHeaders['x-ape-channel-name'] || null,
            x_ape_id: requestHeaders['x-ape-channel-id'] || null,
            server: responseHeaders['server'] || 'Unknown',
            content_type: responseHeaders['content-type'] || '',
            content_length: responseHeaders['content-length'] || 0
        };
    }
}

class SkillClasificacionStatus {
    static exec(httpStatus, contentType) {
        if (httpStatus === 200 && contentType.includes('mpegurl')) return 'active';
        if (httpStatus === 200 && !contentType.includes('mpegurl')) return 'offline_missing (Captive Portal)';
        if (httpStatus === 403) return 'blocked_auth';
        if (httpStatus === 404) return 'offline_missing';
        if (httpStatus >= 500) return 'cdn_degradation';
        if (httpStatus === 206) return 'active_partial';
        return 'unknown';
    }
}

// ====================================================
// SKILLS DE CORRELACIÓN Y FINGERPRINT
// ====================================================

class SkillFingerprintStream {
    static exec(streamInf) {
        if (!streamInf.codecs && !streamInf.resolution) return "FINGERPRINT_MISSING";
        
        // SHA-256 inmutable sin timestamps
        const baseString = `${streamInf.resolution || 'NA'}|${streamInf.codecs || 'NA'}|${streamInf.bandwidth || 'NA'}`;
        return crypto.createHash('sha256').update(baseString).digest('hex');
    }
}

class SkillScoringEstabilidad {
    static exec(latencyMs, httpStatus) {
        if (httpStatus >= 400) return 0;
        if (latencyMs < 150) return 100;
        if (latencyMs < 400) return 85;
        if (latencyMs < 800) return 60;
        return 30; // Predicción de 'Freeze' inminente
    }
}

// ====================================================
// MOTOR PRINCIPAL / ORCHESTRATOR
// ====================================================

class MetadataResolveEngine {
    constructor() {
        this.activeChannels = new Map(); // Concurrencia de múltiples listas
    }

    async resolveChannel(requestUrl, requestHeaders) {
        const timestamp = new Date().toISOString();
        let startTime = Date.now();
        let latency = 0;
        
        try {
            // "Zero-Playback Probe" - Extraemos HTTP y Cabeceras
            const response = await axios.get(requestUrl, {
                headers: { 'User-Agent': 'APE-Metadata-Probe/4.0' },
                timeout: 3000
            });
            
            latency = Date.now() - startTime;
            return this.applyRulesEngine(response.data, response.headers, response.status, latency, requestHeaders, requestUrl, timestamp);

        } catch (error) {
            latency = Date.now() - startTime;
            let status = error.response ? error.response.status : 504;
            let headers = error.response ? error.response.headers : {};
            return this.applyRulesEngine("", headers, status, latency, requestHeaders, requestUrl, timestamp);
        }
    }

    applyRulesEngine(manifestRaw, responseHeaders, httpStatus, latency, requestHeaders, url, timestamp) {
        // Ejecución de Skills Pipeline
        const headersMeta = SkillAnalisisHeaders.exec(requestHeaders, responseHeaders);
        const classification = SkillClasificacionStatus.exec(httpStatus, headersMeta.content_type);
        const stability = SkillScoringEstabilidad.exec(latency, httpStatus);
        
        let parsedM3U8 = { lines: [], hasExtInf: false, hasStreamInf: false };
        if (classification === 'active' || classification === 'active_partial') {
            try { parsedM3U8 = SkillParserM3U8.exec(manifestRaw); } catch(e) {}
        }
        
        const streamInfInfo = SkillExtraccionStreamInf.exec(parsedM3U8.lines);
        const extInfInfo = SkillExtraccionExtinf.exec(parsedM3U8.lines);
        const fingerprint = SkillFingerprintStream.exec(streamInfInfo);
        
        // REGLA 1: Identidad Nominal Primero (Headers)
        let finalChannelName = headersMeta.x_ape_channel || extInfInfo.channel_name;
        let confidence = headersMeta.x_ape_channel ? 99 : (extInfInfo.channel_name !== "UNKNOWN" ? 90 : 20);
        
        // REGLA 2: Clasificación de Duplicados (Agrupador)
        let dupGroup = `group_${fingerprint.substring(0,8)}`;

        // Modelo de Datos JSON Estricto Requerido
        const resolveOutput = {
            channel_name: finalChannelName,
            channel_id: headersMeta.x_ape_id || "",
            tvg_id: extInfInfo.tvg_id,
            group_title: extInfInfo.group_title,
            source_playlist: "APE_V5.4_MAX",
            manifest_url: url,
            request_url: `/resolve?hash=${crypto.randomBytes(4).toString('hex')}`,
            status_code: httpStatus,
            status_classification: classification,
            http_state: "HEADERS_PROCESSED",
            stream_state: classification.startsWith('active') ? "active" : classification,
            bandwidth: streamInfInfo.bandwidth || 0,
            resolution: streamInfInfo.resolution || "Unknown",
            frame_rate: streamInfInfo.framerate || 0,
            codec: streamInfInfo.codecs || "",
            audio_tracks: [], // Future skill implementation
            subtitle_tracks: [], // Future skill implementation
            server: headersMeta.server,
            content_type: headersMeta.content_type,
            latency_ms: latency,
            fingerprint: fingerprint,
            duplicate_group: dupGroup,
            stability_score: stability,
            quality_score: streamInfInfo.resolution?.includes('1080') ? 100 : (streamInfInfo.resolution?.includes('720') ? 80 : 50),
            confidence_score: confidence,
            detected_by: ["SkillAnalisisHeaders", "SkillParserM3U8"],
            timestamp: timestamp,
            observations: [
                latency > 800 ? "WARNING: Latency exceeded 800ms, potential freeze" : "Stable TTFB"
            ]
        };

        // Memoria Concurrente (SkillMonitoreoConcurrente)
        this.activeChannels.set(finalChannelName, resolveOutput);
        
        return resolveOutput;
    }
}

module.exports = { MetadataResolveEngine };
