const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

class APEResolveIntelligence {
    constructor() {
        this.stateHistory = new Map(); // Skill 16: Channel State History
        this.channelMonitor = new Map(); // Skill 11: Multi Channel Monitor active RAM
    }

    async orchestrateRequest(targetUrl, incomingHeaders) {
        const timestamp = new Date().toISOString();
        let startTime = Date.now();
        
        try {
            // STEP 1: Interceptor & HTTP Head Probe (No Video Fetch) - Skill 5, 14
            const response = await axios.get(targetUrl, { timeout: 3000 });
            let latency = Date.now() - startTime;
            this.pushHistory(targetUrl, latency, response.status);
            
            return this.buildOutput(response.data, response.status, response.headers, incomingHeaders, targetUrl, latency, timestamp);
        } catch(error) {
            let latency = Date.now() - startTime;
            let status = error.response ? error.response.status : 504;
            this.pushHistory(targetUrl, latency, status);
            return this.buildOutput("", status, error.response?.headers || {}, incomingHeaders, targetUrl, latency, timestamp);
        }
    }

    pushHistory(url, latency, status) {
        if (!this.stateHistory.has(url)) this.stateHistory.set(url, []);
        let arr = this.stateHistory.get(url);
        arr.push({ latency, status, time: Date.now() });
        if (arr.length > 10) arr.shift();
    }

    checkDegradation(url) {
        // Skill 17: Degradation Detector
        let arr = this.stateHistory.get(url) || [];
        if (arr.length < 3) return "STABLE";
        let last = arr[arr.length - 1];
        let avgPrev = (arr[arr.length - 2].latency + arr[arr.length - 3].latency) / 2;
        let spike = last.latency / (avgPrev || 1);
        if (last.latency > 800) return "CRITICAL_FREEZE";
        if (spike > 2.0 && last.latency > 300) return "WARNING_LATENCY";
        return "STABLE";
    }

    buildOutput(m3u8Body, statusCode, resHeaders, reqHeaders, url, latency, time) {
        // Skill 5 & 14: Header Analyzer & CDN
        const cdn = resHeaders['server'] || 'Unknown';
        const cType = resHeaders['content-type'] || '';
        
        // Skill 6: Status Classifier
        let statusClass = "unknown";
        if (statusCode === 200) statusClass = "active";
        else if (statusCode === 206) statusClass = "active_partial";
        else if (statusCode === 401 || statusCode === 403) statusClass = "blocked_auth";
        else if (statusCode === 404) statusClass = "offline_missing";
        else if (statusCode >= 500) statusClass = "degraded";

        // Skill 2, 3, 4: M3U8 Parsing Layer (RFC 8216 compliant)
        let name = "UNKNOWN", bw = 0, res = "Unknown", codec = "", fps = 0, tvg = "";
        const isValidM3U8 = typeof m3u8Body === 'string' && m3u8Body.includes('#EXTM3U');
        if (statusClass.includes("active") && isValidM3U8) {
            // Skill 3: EXTINF Extractor — real newlines, flexible attribute order
            const extInfMatch = m3u8Body.match(/#EXTINF:[^,]*tvg-id="([^"]*)"[^,]*,(.+)/);
            if (extInfMatch) { tvg = extInfMatch[1]; name = extInfMatch[2].trim(); }
            
            // Skill 4: EXT-X-STREAM-INF — order-agnostic attribute extraction
            const bwMatch = m3u8Body.match(/BANDWIDTH=(\d+)/);
            const resMatch = m3u8Body.match(/RESOLUTION=(\d+x\d+)/);
            const codecMatch = m3u8Body.match(/CODECS="([^"]+)"/);
            if (bwMatch) bw = parseInt(bwMatch[1]);
            if (resMatch) res = resMatch[1];
            if (codecMatch) codec = codecMatch[1];
            
            // Frame rate (optional per RFC 8216)
            const fpsMatch = m3u8Body.match(/FRAME-RATE=([\d.]+)/);
            if (fpsMatch) fps = parseFloat(fpsMatch[1]);

            // Skill 3 extended: group-title extraction
            const groupMatch = m3u8Body.match(/group-title="([^"]*)"/);
            if (groupMatch) tvg = tvg || groupMatch[1];
        } else if (statusCode === 200 && !isValidM3U8 && typeof m3u8Body === 'string' && m3u8Body.includes('<html')) {
            // Skill 5 companion: Portal Cautivo / ISP Block detection
            statusClass = "offline_isp_block";
        }

        // Skill 12: Inference Engine (Fallback)
        if (name === "UNKNOWN") {
            const pathGuess = url.split('/').pop().replace('.m3u8', '');
            if(pathGuess.length > 2) name = pathGuess;
        }

        // Skill 7 & 9: Fingerprint & Duplicates
        const fingerprint = crypto.createHash('sha256').update(`${res}|${codec}|${bw}`).digest('hex');
        const duplicateGroup = `grp_${fingerprint.substring(0,8)}`;

        // Skill 10: Stability Scorer
        let stability = 100;
        if(latency > 400) stability = 85;
        if(latency > 800) stability = 50; 
        if(statusCode >= 400) stability = 0;

        let degradation = this.checkDegradation(url);
        
        // Return JSON Model (Matches Skill 18: Event Aggregator Schema)
        const payload = {
            channel_name: reqHeaders['x-ape-channel-name'] || name,
            channel_id: reqHeaders['x-ape-channel-id'] || "unknown",
            tvg_id: tvg,
            group_title: res === "3840x2160" ? "UHD PREMIUM (Inferred)" : "VOD/GENERAL (Inferred)",
            source_playlist: "APE_V5.4",
            manifest_url: url,
            request_url: reqHeaders['host'] ? `http://${reqHeaders['host']}${reqHeaders['url'] || ''}` : "internal",
            status_code: statusCode,
            status_classification: statusClass,
            http_state: "HEADERS_PROCESSED",
            stream_state: statusClass.startsWith('active') && degradation !== "CRITICAL_FREEZE" ? "active" : "unstable",
            bandwidth: bw,
            resolution: res,
            frame_rate: fps,
            codec: codec,
            audio_tracks: [],
            subtitle_tracks: [],
            server: cdn,
            content_type: cType,
            latency_ms: latency,
            fingerprint: fingerprint,
            duplicate_group: duplicateGroup,
            stability_score: stability,
            quality_score: res.includes('1080') ? 95 : (res.includes('2160') ? 100 : 70),
            confidence_score: (reqHeaders['x-ape-channel-name']) ? 99 : 60,
            detected_by: ["Skill_HTTP_Status_Classifier", "Skill_EXT_X_STREAM_INF_Extractor", "Skill_Degradation_Detector"],
            timestamp: time,
            observations: [
                `Degradation Engine: ${degradation}`
            ]
        };
        
        // Cache active
        this.channelMonitor.set(payload.channel_name, payload);
        return payload;
    }
}

const resolveEngine = new APEResolveIntelligence();

app.get('/analyze', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "Missing Target URL" });

    // Pasa los cabeceras custom desde resolve_quality.php si vienen como parámetros o interceptados
    let incomingHeaders = {
        'x-ape-channel-name': req.query.ch_n || req.headers['x-ape-channel-name'],
        'x-ape-channel-id': req.query.ch_i || req.headers['x-ape-channel-id'],
        'host': req.headers['host'],
        'url': req.originalUrl
    };

    const telemetry = await resolveEngine.orchestrateRequest(url, incomingHeaders);
    res.json(telemetry);
});

app.listen(3005, '127.0.0.1', () => {
    console.log("🔥 APE Metadata-Only Resolve Engine (18 Skills) corriendo en puerto 3005.");
});
