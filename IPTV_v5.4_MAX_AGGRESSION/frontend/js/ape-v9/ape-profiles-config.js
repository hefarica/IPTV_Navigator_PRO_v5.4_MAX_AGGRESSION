/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎚️ APE PROFILES CONFIG v9.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Configuración de perfiles P0-P5 con headers organizados por categorías.
 * Este archivo define los valores por defecto para cada perfil.
 * 
 * AUTOR: APE Engine Team - IPTV Navigator PRO
 * VERSIÓN: 13.1.0-SUPREMO
 * FECHA: 2026-01-05
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'ape_profiles_v9';
    const MANIFEST_STORAGE_KEY = 'ape_manifest_v9';

    const HEADER_CATEGORIES = {
        identity: {
            name: "🔐 1. Identity",
            description: "Stealth & Spoofing (UA, Client Hints, Fingerprinting)",
            headers: [
                "User-Agent", "Accept", "Accept-Encoding", "Accept-Language",
                "Sec-CH-UA", "Sec-CH-UA-Mobile", "Sec-CH-UA-Platform",
                "Sec-CH-UA-Full-Version-List", "Sec-CH-UA-Arch",
                "Sec-CH-UA-Bitness", "Sec-CH-UA-Model"
            ]
        },
        connection: {
            name: "🔗 2. Connection",
            description: "Zero-Latency Persistence (Keep-alive, Sec-Fetch)",
            headers: [
                "Connection", "Keep-Alive", "Sec-Fetch-Dest", "Sec-Fetch-Mode",
                "Sec-Fetch-Site", "Sec-Fetch-User", "DNT", "Sec-GPC"
                // C8 (2026-05-11) — removed "Upgrade-Insecure-Requests", "TE":
                // browser-only / unsupported by okhttp legacy. Final gate _ca7BannedAbsolute
                // strips them anyway, removed from catalog for UX clarity.
            ]
        },
        cache: {
            name: "💾 3. Cache",
            description: "Neural Predictive Loading (Cache-Control, Pragma)",
            headers: [
                "Cache-Control", "Pragma"
                // C8 (2026-05-11) — removed "Range", "If-None-Match", "If-Modified-Since":
                // If-None-Match: * detonates HTTP 304+0B → okhttp "unexpected end of stream"
                // (TEST-B/D/E vs G empirical proof, 2026-05-11 vs tivigo.cc → linovrex.cc CDN).
                // Range on .m3u8 is nonsensical (not byte-rangeable). Final gate strips them.
            ]
        },
        cors: {
            name: "🌐 4. CORS",
            description: "Barrier Evasion (Origin, Referer, X-Requested-With)",
            headers: [
                "Origin", "Referer", "X-Requested-With"
            ]
        },
        ape_core: {
            name: "🎯 5. APE Core",
            description: "Engine Sovereignty (App-Version, Session, Stream-Type)",
            headers: [
                "X-App-Version", "X-Playback-Session-Id", "X-Device-Id",
                "X-Stream-Type", "X-Quality-Preference"
            ]
        },
        playback: {
            name: "🎬 6. Playback",
            description: "Frame Perfection (Rate, Buffers)",
            headers: [
                "X-Playback-Rate", "X-Segment-Duration",
                "X-Min-Buffer-Time", "X-Max-Buffer-Time",
                "X-Request-Priority", "X-Prefetch-Enabled"
                // C8 (2026-05-11) — removed "Priority": RFC 9218 HTTP/3 priority over HTTP/1.1
                // confuses Xtream/Stalker parsers. Final gate _ca7BannedAbsolute strips it.
            ]
        },
        cdn: {
            name: "📡 7. CDN",
            description: "Edge Bypass (Provider, Failover, Network-Caching)",
            headers: [
                "X-CDN-Provider", "X-Failover-Enabled", "X-Buffer-Size",
                "X-Buffer-Target", "X-Buffer-Min", "X-Buffer-Max",
                "X-Network-Caching", "X-Live-Caching", "X-File-Caching"
            ]
        },
        metadata: {
            name: "📊 8. Metadata",
            description: "Forensic Enrichment (Timestamp, Request-Id, device-Type)",
            headers: [
                "X-Client-Timestamp", "X-Request-Id", "X-Device-Type",
                "X-Screen-Resolution", "X-Network-Type"
            ]
        },
        advanced: {
            name: "⚙️ 9. Advanced",
            description: "System Hardening (Buffer-Strategy, Manifest-Refresh)",
            headers: [
                "X-Buffer-Strategy", "X-ExoPlayer-Buffer-Min", "X-Manifest-Refresh", 
                "X-KODI-LIVE-DELAY", "X-APE-STRATEGY", "X-APE-Prefetch-Segments", 
                "X-APE-Quality-Threshold"
            ]
        },
        hdr_color: {
            name: "🎨 10. HDR/Color",
            description: "12-bit Rec.2020 Depth + HDR10+/Dolby Vision (25 headers)",
            headers: [
                "X-HDR-Support", "X-Color-Depth", "X-Color-Space",
                "X-Dynamic-Range", "X-HDR-Transfer-Function", "X-Color-Primaries",
                "X-Matrix-Coefficients", "X-Chroma-Subsampling",
                "X-HEVC-Tier", "X-HEVC-Level", "X-HEVC-Profile",
                "X-Video-Profile", "X-Rate-Control", "X-Entropy-Coding",
                "X-Compression-Level", "X-Pixel-Format", "X-Sharpen-Sigma",
                "X-HDR-Mode", "X-HDR-Peak-Nits", "X-Color-Transfer",
                "X-Bit-Depth", "X-Tone-Mapping-Peak", "X-Tone-Mapping-Reference",
                "X-BT2020", "X-Full-Range"
            ]
        },
        resolution: {
            name: "📺 11. Resolution",
            description: "8K to Failover (Max-Resolution, FPS, Bitrate, Throughput)",
            headers: [
                "X-Max-Resolution", "X-APE-RESOLUTION", "X-APE-FPS",
                "X-APE-BITRATE", "X-APE-TARGET-BITRATE", "X-APE-THROUGHPUT-T1",
                "X-APE-THROUGHPUT-T2", "X-Frame-Rates", "X-Aspect-Ratio",
                "X-Pixel-Aspect-Ratio",
                "X-Stream-Resolution", "X-Stream-FPS", "X-Stream-Bitrate",
                "X-Stream-Codecs", "X-Segment-Duration-S"
            ]
        },
        audio: {
            name: "🔊 12. Audio",
            description: "Atmos & Neural-X (Atmos, Channels, Sample-Rate, Passthrough)",
            headers: [
                "X-Dolby-Atmos", "X-Audio-Channels", "X-Audio-Sample-Rate",
                "X-Audio-Bit-Depth", "X-Spatial-Audio", "X-Audio-Passthrough"
            ]
        },
        parallel: {
            name: "⚡ 13. Parallel",
            description: "Swarm Chunking (Parallel-Segments, Prefetch, Downloads)",
            headers: [
                "X-Parallel-Segments", "X-Prefetch-Segments",
                "X-Segment-Preload", "X-Concurrent-Downloads"
            ]
        },
        anti_freeze: {
            name: "🛡️ 14. Anti-Freeze",
            description: "Buffer Immortality (Reconnect, Underrun-Strategy, Failover)",
            headers: [
                "X-Reconnect-On-Error", "X-Max-Reconnect-Attempts",
                "X-Reconnect-Delay-Ms", "X-Buffer-Underrun-Strategy",
                "X-Seamless-Failover"
            ]
        },
        abr: {
            name: "🧠 15. ABR",
            description: "Neuro-Adaptive Flow (Bandwidth-Preference, Congestion-Detect)",
            headers: [
                "X-Bandwidth-Preference", "X-BW-Estimation-Window", "X-BW-Confidence-Threshold",
                "X-BW-Smooth-Factor", "X-Packet-Loss-Monitor", "X-RTT-Monitoring",
                "X-Congestion-Detect"
            ]
        },
        codecs: {
            name: "🎥 16. Codecs",
            description: "VVC/AV1/Dolby Vision Dominance (Full codec chain + priority)",
            headers: [
                "X-Video-Codecs", "X-Audio-Codecs", "X-DRM-Support", "X-Codec-Support",
                "X-Codec-Full", "X-Codec-Priority", "X-Audio-Codec-Preferred"
            ]
        },
        hlsjs_engine: {
            name: "🚀 16b. HLS.js Engine",
            description: "HLS.js v1.6 Official Calibration + CMCD CTA-5004 (31 params, 73 events)",
            headers: [
                "X-HLSjs-Config", "X-HLSjs-Version", "X-HLSjs-API-Version",
                "X-HLSjs-Events-Listener", "X-HLSjs-ErrorDetails-Handled",
                "X-HLSjs-Telemetry-Mode", "X-HLSjs-Recovery-Matrix",
                "X-HLSjs-Error-Penalty-Expire-Ms", "X-HLSjs-State-Transitions",
                "X-Shaka-Config", "X-Shaka-Version",
                "X-ExoPlayer-Config", "X-ExoPlayer-Version",
                "X-ABR-Algorithm", "X-ABR-Fast-Window-S", "X-ABR-Slow-Window-S",
                "X-ABR-BW-Factor", "X-ABR-Switch-Interval-S",
                "X-Low-Latency-Mode", "X-Live-Sync-Duration-Count",
                "X-Live-Max-Latency-Count", "X-Stall-Detection-Ms",
                "X-Fragment-Retry-Max", "X-Fragment-TTFB-Max-Ms",
                "X-Bitrate-Ladder", "X-Bitrate-Ladder-Source",
                "CMCD-Object", "CMCD-Request", "CMCD-Session", "CMCD-Status",
                "X-QoE-Startup-Target-Ms", "X-QoE-Rebuffer-Ratio-Target",
                "X-QoE-TTFB-Target-Ms", "X-QoE-Bitrate-Target-Mbps",
                "X-QoE-Monitor", "X-QoE-Player"
            ]
        },
        extra: {
            name: "⚡ 17. Extra",
            description: "OTT Optimizations (OTT-Navigator-Version, Platform, Player-Type)",
            headers: [
                "X-OTT-Navigator-Version", "X-Platform", "X-Player-Type", 
                "X-Hardware-Decode", "X-Tunneling-Enabled", "X-Audio-Track-Selection", 
                "X-Subtitle-Track-Selection", "X-EPG-Sync", "X-Catchup-Support", 
                "Accept-Charset", "Accept-CH"
            ]
        },
        security: {
            name: "🔒 18. Security",
            description: "HMAC Shielding (Credential-Lock, Country-Code)",
            headers: [
                "X-Credential-Lock", "X-Country-Code"
            ]
        },
        omega_god_tier: {
            name: "⚛️ 19. Omega God-Tier",
            description: "Cortex AI & LCEVC (AI-SR, LCEVC, GPU-Decoding, Resilience, Evacuation, Transport)",
            headers: [
                "X-CORTEX-OMEGA-STATE", "X-APE-AI-SR-ENABLED", "X-APE-AI-SR-MODEL",
                "X-APE-AI-SR-SCALE", "X-APE-AI-FRAME-INTERPOLATION", "X-APE-AI-DENOISING",
                "X-APE-AI-DEBLOCKING", "X-APE-AI-SHARPENING", "X-APE-AI-ARTIFACT-REMOVAL",
                "X-APE-AI-COLOR-ENHANCEMENT", "X-APE-AI-HDR-UPCONVERT", "X-APE-AI-SCENE-DETECTION",
                "X-APE-AI-MOTION-ESTIMATION", "X-APE-AI-CONTENT-AWARE-ENCODING", "X-APE-AI-PERCEPTUAL-QUALITY",
                "X-APE-LCEVC-ENABLED", "X-APE-LCEVC-PHASE", "X-APE-LCEVC-COMPUTE-PRECISION",
                "X-APE-LCEVC-UPSCALE-ALGORITHM", "X-APE-LCEVC-ROI-DYNAMIC", "X-APE-LCEVC-TRANSPORT",
                "X-APE-LCEVC-SDK-ENABLED", "X-APE-LCEVC-SDK-TARGET", "X-APE-LCEVC-SDK-WEB-INTEROP",
                "X-APE-LCEVC-SDK-DECODER", "X-APE-GPU-DECODE", "X-APE-GPU-RENDER", "X-APE-GPU-PIPELINE",
                "X-APE-GPU-PRECISION", "X-APE-GPU-MEMORY-POOL", "X-APE-GPU-ZERO-COPY",
                "X-APE-VVC-ENABLED", "X-APE-EVC-ENABLED", "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC", "X-APE-RESILIENCE-L1-FORMAT",
                "X-APE-RESILIENCE-L2-FORMAT", "X-APE-RESILIENCE-L3-FORMAT",
                "X-APE-RESILIENCE-HTTP-ERROR-403", "X-APE-RESILIENCE-HTTP-ERROR-404",
                "X-APE-RESILIENCE-HTTP-ERROR-429", "X-APE-RESILIENCE-HTTP-ERROR-500",
                "X-APE-AV1-FALLBACK-ENABLED", "X-APE-AV1-FALLBACK-CHAIN",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY", "X-APE-ANTI-CUT-ENGINE",
                "X-APE-ANTI-CUT-DETECTION", "X-APE-ANTI-CUT-ISP-STRANGLE",
                "X-APE-RECONNECT-MAX", "X-APE-RECONNECT-SEAMLESS", "X-APE-IDENTITY-MORPH",
                "X-APE-IDENTITY-ROTATION-INTERVAL", "X-APE-EVASION-MODE",
                "X-APE-EVASION-DNS-OVER-HTTPS", "X-APE-EVASION-SNI-OBFUSCATION",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE", "X-APE-EVASION-GEO-PHANTOM",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS", "X-APE-IP-ROTATION-ENABLED",
                "X-APE-IP-ROTATION-STRATEGY", "X-APE-STEALTH-UA", "X-APE-STEALTH-XFF",
                "X-APE-STEALTH-FINGERPRINT", "X-APE-SWARM-ENABLED", "X-APE-SWARM-PEERS",
                "X-APE-TRANSPORT-PROTOCOL", "X-APE-TRANSPORT-CHUNK-SIZE",
                "X-APE-TRANSPORT-FALLBACK-1", "X-APE-CACHE-STRATEGY", "X-APE-CACHE-SIZE",
                "X-APE-CACHE-PREFETCH", "X-APE-BUFFER-STRATEGY", "X-APE-BUFFER-PRELOAD-SEGMENTS",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT", "X-APE-BUFFER-NEURAL-PREDICTION",
                "X-APE-QOS-ENABLED", "X-APE-QOS-DSCP", "X-APE-QOS-PRIORITY",
                "X-APE-POLYMORPHIC-ENABLED", "X-APE-POLYMORPHIC-IDEMPOTENT", "X-TELCHEMY-TVQM",
                "X-TELCHEMY-TR101290", "X-TELCHEMY-IMPAIRMENT-GUARD", "X-TELCHEMY-BUFFER-POLICY",
                "X-TELCHEMY-GOP-POLICY", "X-Tone-Mapping", "X-HDR-Output-Mode"
            ]
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 🛡️ ANTI-DRIFT — PM9 canonical header lookup
    // Used by importFromLABData to resolve LAB→PM9 rename collisions.
    // PM9 HEADER_CATEGORIES is the canonical source; LAB headers with case
    // or separator drift can be mapped back to the frontend-standard name.
    // ═══════════════════════════════════════════════════════════════════════
    const _PM9_FLAT_HEADERS = (function () {
        const arr = [];
        for (const cat of Object.values(HEADER_CATEGORIES)) {
            if (cat && Array.isArray(cat.headers)) arr.push(...cat.headers);
        }
        return arr;
    })();

    // Normalize key for collision detection: lowercase + strip dashes/underscores
    const _normalizeHeaderKey = (k) => String(k || '').toLowerCase().replace(/[_\-\s]/g, '');

    const _PM9_NORMALIZED_MAP = (function () {
        const m = new Map();
        for (const h of _PM9_FLAT_HEADERS) m.set(_normalizeHeaderKey(h), h);
        return m;
    })();

    const _PM9_EXACT_SET = new Set(_PM9_FLAT_HEADERS);

    /**
     * Returns the PM9 canonical name for a LAB key, or null if no match.
     * - Exact match → returns the same key (no rename needed).
     * - Case/separator drift match → returns canonical PM9 name.
     * - No match → null (caller treats as "extra").
     */
    function findPm9CanonicalName(labKey) {
        if (!labKey) return null;
        if (_PM9_EXACT_SET.has(labKey)) return labKey;
        const norm = _normalizeHeaderKey(labKey);
        return _PM9_NORMALIZED_MAP.get(norm) || null;
    }

    /** Returns Set of all 267 PM9 canonical header names (for diff). */
    function getPm9HeaderSet() {
        return _PM9_EXACT_SET;
    }


    const DEFAULT_PROFILES = {
        "P0": {
            "id": "P0",
            "name": "GOD_TIER_8K_OMEGA",
            "level": 6,
            "quality": "ULTRA",
            "description": "GOD TIER 8K OMEGA — Máxima calidad visual 8K/4K con fallback dinámico",
            "color": "#dc2626",
            "settings": {
                "resolution": "7680x4320",
                "buffer": 25000,
                "strategy": "ultra-aggressive",
                "bitrate": 80.0,
                "t1": 100.0,
                "t2": 150.0,
                "playerBuffer": 60000,
                "fps": 60,
                "codec": "AV1",
                "headersCount": 233,
                "bufferSeconds": 25,
                "focus": "MAXIMA_CALIDAD_8K_HDR_CARGA_ULTRARAPIDA_SIN_CORTES",
                "hdr_canonical": "dolby-vision",
                "nits_target": 8000,
                "codec_chain_video": "dvh1.05.06,dvh1.08.06,hvc1.2.4.L183.B0,hvc1.1.6.L183.B0,av01.0.13M.10.0.110.09.16.09.0,avc1.640033,avc1.640028",
                "codec_chain_audio": "ec-3,ac-3,mp4a.40.2,mp4a.40.5",
                "codec_chain_hdr": "dolby-vision,hdr10+,hdr10,hlg,sdr",
                "codec_chain_player_pref": "hvc1,hev1,dvh1,dvhe,h265,av1,avc1,h264",
                "codec_chain_video_family": "DV>HEVC-MAIN10>HEVC-MAIN>AV1>H264-HIGH>H264-MAIN"
            },
            "vlcopt": {
                "network-caching": "25000",
                "clock-jitter": "1000",
                "clock-synchro": "1",
                "live-caching": "18000",
                "file-caching": "60000",
                "http-user-agent": "Mozilla/5.0 APE-8K_ULTRA_EXTREME_MASTER",
                "http-referer": "auto",
                "http-forward-cookies": "true",
                "http-reconnect": "true",
                "http-continuous-stream": "true",
                "http-max-retries": "12",
                "http-timeout": "5000",
                "video-color-space": "BT2020",
                "video-transfer-function": "SMPTE-ST2084",
                "video-color-primaries": "BT2020",
                "video-color-range": "limited,full",
                "tone-mapping": "auto",
                "hdr-output-mode": "auto",
                "sharpen-sigma": "0.04",
                "contrast": "1.03",
                "brightness": "1.0",
                "saturation": "1.06",
                "gamma": "1.0",
                "video-filter": "nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full",
                "audio-codec-priority": "eac3,ac3,aac",
                "audio-spatializer": "passthrough",
                "adaptive-logic": "highest",
                "adaptive-maxwidth": "7680",
                "adaptive-maxheight": "4320",
                "demux": "hls"
            },
            "kodiprop": {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]",
                "inputstream.adaptive.min_bandwidth": "60000000",
                "inputstream.adaptive.max_bandwidth": "120000000",
                "inputstream.adaptive.preferred_video_resolution": "4320",
                "inputstream.adaptive.chooser_bandwidth_max": "120000000",
                "inputstream.adaptive.media_renewal_time": "60",
                "inputstream.adaptive.manifest_config": "{\"buffer_assured_duration\":60,\"buffer_max_duration\":120,\"connect_timeout\":15,\"read_timeout\":60,\"retry_count\":99,\"reconnect\":true,\"chunk_size\":1048576}"
            },
            "enabledCategories": [
                "identity",
                "connection",
                "cache",
                "cors",
                "ape_core",
                "playback",
                "cdn",
                "metadata",
                "advanced",
                "hdr_color",
                "resolution_advanced",
                "audio_premium",
                "parallel_download",
                "anti_freeze",
                "abr_control",
                "codecs",
                "hlsjs_engine",
                "extra",
                "ott_navigator",
                "streaming_control",
                "security",
                "omega_ai_cortex",
                "omega_lcevc",
                "omega_hardware",
                "omega_resilience",
                "omega_stealth",
                "omega_transport",
                "omega_qos"
            ],
            "headerOverrides": {
                "X-Video-Codecs": "hevc,h265,h.265,vp9,h264,mpeg2",
                "X-ExoPlayer-Buffer-Min": "34000",
                "X-Manifest-Refresh": "34000",
                "X-KODI-LIVE-DELAY": "34",
                "X-APE-STRATEGY": "ultra-aggressive",
                "X-APE-Prefetch-Segments": "50",
                "X-APE-Quality-Threshold": "0.99",
                "X-Segment-Duration": "1,2,4,6",
                "X-Prefetch-Enabled": "true,adaptive,auto,false",
                "X-APE-CODEC": "AV1",
                "X-APE-RESOLUTION": "7680x4320",
                "X-APE-FPS": "120",
                "X-Screen-Resolution": "7680x4320",
                "X-APE-BITRATE": "64.5",
                "X-APE-TARGET-BITRATE": "64500",
                "X-APE-THROUGHPUT-T1": "83.9",
                "X-APE-THROUGHPUT-T2": "103.2",
                "X-Parallel-Segments": "8,10,12",
                "X-Prefetch-Segments": "30,40,50",
                "X-Concurrent-Downloads": "8,10,12",
                "X-Max-Reconnect-Attempts": "UNLIMITED",
                "X-Reconnect-Delay-Ms": "50,80,120",
                "X-Buffer-Underrun-Strategy": "aggressive-refill,adaptive-refill,conservative-refill",
                "Accept-Encoding": "identity",
                "Accept": "application/vnd.apple.mpegurl, application/x-mpegurl, application/x-m3u8, audio/mpegurl, application/octet-stream, */*",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Cache-Control": "no-cache,no-store,max-age=0,max-stale=0",
                "Sec-Fetch-Site": "same-origin,none,cross-site,same-site",
                "X-Buffer-Strategy": "aggressive",
                "X-Color-Depth": "12bit",
                "X-Quality-Preference": "codec-hevc,profile-main-12,main-10,tier-high;codec-h265,profile-main-12,main-10,tier-high;codec-h.265,profile-main-12,main-10,tier-high;codec-vp9,profile2,profile0,n/a",
                "DNT": "1,0",
                "Sec-GPC": "1,0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "1,0", → HTTPS redirect risk
                "Sec-Fetch-User": "?1,?0",
                "Keep-Alive": "timeout=120, max=1000",
                "Sec-Fetch-Mode": "no-cors,navigate,cors,same-origin",
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers,chunked,compress,deflate", → okhttp legacy trailer EOF
                "User-Agent": "Mozilla/5.0 (SMART-TV; Tizen 8.0; Samsung 8K QN900D) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.3 Safari/538.1",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,pt;q=0.7",
                "Sec-CH-UA": "\"Google Chrome\";v=\"125\", \"Chromium\";v=\"125\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"Windows\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"125.0.6422.142\"",
                "Sec-CH-UA-Arch": "x86",
                "Sec-CH-UA-Bitness": "64",
                "Sec-CH-UA-Model": "\"\"",
                "Connection": "keep-alive,close",
                "Pragma": "no-cache,no-store",
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-", → m3u8 manifest is not byte-rangeable
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                "Origin": "https://iptv-ape.duckdns.org",
                "Referer": "https://iptv-ape.duckdns.org/",
                "X-Requested-With": "XMLHttpRequest,fetch,null",
                "X-App-Version": "APE_10.2_ULTIMATE_HDR",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,cmaf,dash",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0, i", → RFC 9218 HTTP/3 over HTTP/1.1 confuses Xtream parsers
                "X-Playback-Rate": "1.0,1.25,1.5",
                "X-Min-Buffer-Time": "10",
                "X-Max-Buffer-Time": "54",
                "X-Request-Priority": "high",
                "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,dts,mp3",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,cloudflare,akamai,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "54000",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Device-Type": "smart-tv-8k",
                "X-Network-Type": "wifi,ethernet,5g,4g",
                "Accept-Charset": "utf-8, iso-8859-1;q=0.5",
                "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
                "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
                "X-Player-Type": "exoplayer-ultra,vlc-pro",
                "X-Hardware-Decode": "true,adaptive,false",
                "X-Tunneling-Enabled": "off",
                "X-Audio-Track-Selection": "default",
                "X-Subtitle-Track-Selection": "off,auto",
                "X-EPG-Sync": "enabled,adaptive,disabled",
                "X-Catchup-Support": "flussonic-ultra,timeshift,archive",
                "X-Bandwidth-Estimation": "aggressive,adaptive,balanced",
                "X-Initial-Bitrate": "64500000",
                "X-Retry-Count": "40,50,60",
                "X-Retry-Delay-Ms": "50,80,120",
                "X-Connection-Timeout-Ms": "2000,3000,5000",
                "X-Read-Timeout-Ms": "5000,8000,12000",
                "X-Country-Code": "US,GB,ES,DE,FR",
                "X-HDR-Support": "hdr10,dolby-vision,hlg",
                "X-Color-Space": "bt2020",
                "X-Dynamic-Range": "hdr",
                "X-HDR-Transfer-Function": "pq,hlg",
                "X-Color-Primaries": "bt2020",
                "X-Matrix-Coefficients": "bt2020nc",
                "X-Chroma-Subsampling": "4:2:2,4:2:0",
                "X-HEVC-Tier": "HIGH",
                "X-HEVC-Level": "6.1,6.0,5.1,5.0,4.1",
                "X-HEVC-Profile": "MAIN-12,MAIN-10",
                "X-Video-Profile": "main-12,main-10",
                "X-Rate-Control": "VBR,CQP",
                "X-Entropy-Coding": "CABAC",
                "X-Compression-Level": "0",
                "X-Pixel-Format": "yuv420p10le",
                "X-Max-Resolution": "7680x4320",
                "X-Max-Bitrate": "103200000",
                "X-Frame-Rates": "120,24,25,30,50,60",
                "X-Aspect-Ratio": "16:9,21:9,4:3",
                "X-Pixel-Aspect-Ratio": "1:1",
                "X-Dolby-Atmos": "true,adaptive,false",
                "X-Audio-Channels": "7.1,5.1,2.0",
                "X-Audio-Sample-Rate": "96000,48000,44100",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "true,adaptive,false",
                "X-Audio-Passthrough": "true,adaptive,false",
                "X-Segment-Preload": "true,adaptive,false",
                "X-Reconnect-On-Error": "true,immediate,adaptive,false",
                "X-Seamless-Failover": "true-ultra,true,adaptive,false",
                "X-Bandwidth-Preference": "unlimited,high,balanced,auto",
                "X-BW-Estimation-Window": "10,15,20",
                "X-BW-Confidence-Threshold": "0.95,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.10,0.15",
                "X-Packet-Loss-Monitor": "enabled,aggressive,adaptive",
                "X-RTT-Monitoring": "enabled,aggressive,adaptive",
                "X-Congestion-Detect": "enabled,aggressive-extreme,adaptive",
                "X-Tone-Mapping": "auto,hdr-to-sdr,sdr-to-hdr,passthrough",
                "X-HDR-Output-Mode": "hdr,auto,tonemap,sdr",
                "X-Buffer-Target": "34000",
                "X-Buffer-Max": "216000",
                "X-Buffer-Min": "10000",
                "X-Network-Caching": "10000",
                "X-Live-Caching": "10000",
                "X-File-Caching": "34000",
                "X-Sharpen-Sigma": "0.03",
                "X-Codec-Support": "hevc,h265,h.265",
                "X-CORTEX-OMEGA-STATE": "ACTIVE_DOMINANT,ACTIVE,STANDBY",
                "X-APE-AI-SR-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,ESRGAN,BICUBIC",
                "X-APE-AI-SR-SCALE": "4,2,1",
                "X-APE-AI-FRAME-INTERPOLATION": "OPTICAL_FLOW_SVFI,RIFE,DISABLED",
                "X-APE-AI-DENOISING": "NLMEANS_HQDN3D_TEMPORAL,NLMEANS,HQDN3D,DISABLED",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE_MAX,ADAPTIVE,STANDARD,DISABLED",
                "X-APE-AI-SHARPENING": "UNSHARP_MASK_ADAPTIVE,UNSHARP_MASK,STANDARD,DISABLED",
                "X-APE-AI-ARTIFACT-REMOVAL": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "AUTO,ENABLED,TONEMAP,OFF",
                "X-APE-AI-SCENE-DETECTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,DISABLED",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_98,VMAF_95,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-PHASE": "4,3,2,1",
                "X-APE-LCEVC-COMPUTE-PRECISION": "FP32,FP16,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS4,LANCZOS3,BICUBIC,BILINEAR",
                "X-APE-LCEVC-ROI-DYNAMIC": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_SIDECAR,DISABLED",
                "X-APE-LCEVC-SDK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,WEBGL,WASM",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "BI_DIRECTIONAL_JS_TUNNEL,UNIDIRECTIONAL,DISABLED",
                "X-APE-LCEVC-SDK-DECODER": "WASM+WEBGL,WASM,NATIVE",
                "X-APE-GPU-DECODE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-RENDER": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-PIPELINE": "DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER,DECODE_LCEVC_AI_SR_TONEMAP_RENDER,DECODE_TONEMAP_RENDER,DECODE_RENDER",
                "X-APE-GPU-PRECISION": "FP32,FP16,INT8",
                "X-APE-GPU-MEMORY-POOL": "VRAM_ONLY,VRAM_SHARED,SYSTEM_RAM",
                "X-APE-GPU-ZERO-COPY": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-VVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "OMEGA_ABSOLUTE,OMEGA,STANDARD",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "TRUE,ADAPTIVE,FALSE",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,HLS_TS,CMAF",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "MORPH_IDENTITY,ROTATE_UA,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,SKIP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "SWARM_EVASION,BACKOFF,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RECONNECT_SILENT,RETRY,FALLBACK",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "NUCLEAR_ESCALATION_NEVER_DOWN,AGGRESSIVE_ESCALATION,ADAPTIVE_ESCALATION,DEFAULT",
                "X-APE-ANTI-CUT-ENGINE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "REAL_TIME,PREDICTIVE,REACTIVE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "NUCLEAR,AGGRESSIVE,MODERATE,PASSIVE",
                "X-APE-RECONNECT-MAX": "UNLIMITED",
                "X-APE-RECONNECT-SEAMLESS": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IDENTITY-MORPH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "30,60,120,300",
                "X-APE-EVASION-MODE": "SWARM_PHANTOM_HYDRA_STEALTH,PHANTOM_STEALTH,STEALTH,STANDARD",
                "X-APE-EVASION-DNS-OVER-HTTPS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-SNI-OBFUSCATION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVASION-GEO-PHANTOM": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IP-ROTATION-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IP-ROTATION-STRATEGY": "PER_REQUEST,PER_SESSION,PER_CHANNEL",
                "X-APE-STEALTH-UA": "RANDOMIZED,ROTATING,FIXED",
                "X-APE-STEALTH-XFF": "DYNAMIC,ROTATING,FIXED",
                "X-APE-STEALTH-FINGERPRINT": "MUTATING,ROTATING,FIXED",
                "X-APE-SWARM-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-SWARM-PEERS": "20,10,5,1",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-TRANSPORT-CHUNK-SIZE": "200MS,500MS,1000MS,2000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-CACHE-STRATEGY": "PREDICTIVE_NEURAL,ADAPTIVE,LRU,NONE",
                "X-APE-CACHE-SIZE": "1GB,512MB,256MB,128MB",
                "X-APE-CACHE-PREFETCH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE_PREDICTIVE_NEURAL,ADAPTIVE_PREDICTIVE,ADAPTIVE,FIXED",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "50",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-QOS-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-QOS-DSCP": "EF,AF41,AF31,BE",
                "X-APE-QOS-PRIORITY": "7,6,5,4",
                "X-APE-POLYMORPHIC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "TRUE,ADAPTIVE,FALSE",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,FREEZE=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=30000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500"
            },
            "prefetch_config": {
                "strategy": "ULTRA_AGRESIVO",
                "prefetch_segments": 45,
                "parallel_downloads": 15,
                "buffer_target_seconds": 54,
                "min_bandwidth_mbps": 194,
                "adaptive_enabled": true,
                "ai_prediction_enabled": true,
                "continuous_prefetch": true
            },
            "quality_levels": {
                "L1": {
                    "label": "GOD_TIER_8K",
                    "condition": "riskScore<=5 AND stallRate<=0.02 AND vfi>=80",
                    "resolution": "7680x4320",
                    "bitrate_mbps": 200,
                    "hdr": "hdr10plus",
                    "video_filter": "nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full"
                },
                "L2": {
                    "label": "SUPREME_4K",
                    "condition": "riskScore<=10 AND stallRate<=0.05 AND vfi>=70",
                    "resolution": "3840x2160",
                    "bitrate_mbps": 100,
                    "hdr": "hdr10",
                    "video_filter": "nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full"
                },
                "L3": {
                    "label": "ULTRA_1080P",
                    "condition": "riskScore<=20 AND stallRate<=0.08 AND vfi>=55",
                    "resolution": "1920x1080",
                    "bitrate_mbps": 40,
                    "hdr": "hdr10",
                    "video_filter": "nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full"
                },
                "L4": {
                    "label": "HIGH_720P",
                    "condition": "riskScore<=35 AND stallRate<=0.12 AND vfi>=40",
                    "resolution": "1280x720",
                    "bitrate_mbps": 20,
                    "hdr": "hlg",
                    "video_filter": "hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0"
                },
                "L5": {
                    "label": "STANDARD_480P",
                    "condition": "riskScore<=50 AND stallRate<=0.20 AND vfi>=25",
                    "resolution": "854x480",
                    "bitrate_mbps": 10,
                    "hdr": "sdr",
                    "video_filter": "yadif=mode=0:parity=-1:deint=0"
                },
                "L6": {
                    "label": "LOW_360P",
                    "condition": "riskScore<=70 AND stallRate<=0.35",
                    "resolution": "640x360",
                    "bitrate_mbps": 4,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L7": {
                    "label": "SD_FAILSAFE",
                    "condition": "ALWAYS_AVAILABLE",
                    "resolution": "426x240",
                    "bitrate_mbps": 1.5,
                    "hdr": "sdr",
                    "video_filter": "",
                    "action": "ACTIVATE_BACKUP_URL"
                },
                "primary": {
                    "codec": "AV1",
                    "profile": "MAIN-12,MAIN-10,MAIN,HIGH,BASELINE"
                }
            },
            "headers": {
                "User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.3 TV Safari/538.1,Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Linux; Android 13; BRAVIA 4K GB ATV3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept": "application/vnd.apple.mpegurl,application/x-mpegurl,application/x-m3u8,video/mp4,audio/aac,audio/mpeg,application/octet-stream,*/*",
                "Accept-Encoding": "identity",
                "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.5",
                "Accept-Charset": "utf-8,iso-8859-1;q=0.5,*;q=0.1",
                "Sec-CH-UA": "\"Google Chrome\";v=\"134\",\"Chromium\";v=\"134\",\"Not-A.Brand\";v=\"99\",\"Samsung Internet\";v=\"23\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"SmartTV\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"134.0.6998.89\",\"Samsung Internet\";v=\"23.0.1.1\",\"Chromium\";v=\"134.0.6998.89\"",
                "Sec-CH-UA-Arch": "x86,arm64,arm",
                "Sec-CH-UA-Bitness": "64,32",
                "Sec-CH-UA-Model": "\"SHIELD Android TV\",\"Samsung Smart TV\",\"BRAVIA 4K\",\"\"",
                "Accept-CH": "DPR,Viewport-Width,Width,Device-Memory,RTT,Downlink,ECT,Save-Data",
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=300,max=1000,timeout=120,max=500",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Sec-Fetch-Mode": "no-cors,cors,same-origin,navigate",
                "Sec-Fetch-Site": "same-origin,same-site,cross-site,none",
                "Sec-Fetch-User": "?0,?1",
                "DNT": "0",
                "Sec-GPC": "0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "0", → forces HTTPS redirect on HTTP-only providers
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers", → com.android.okhttp legacy does not support RFC 7230 trailers
                "Cache-Control": "no-cache,max-age=0,must-revalidate,no-store",
                "Pragma": "no-cache",
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-,bytes=0-2097152,bytes=0-1048576,bytes=0-524288",
                "Origin": "https://iptv-ape.duckdns.org,https://localhost,null",
                "Referer": "https://iptv-ape.duckdns.org/,https://localhost/,https://iptv-ape.duckdns.org/player",
                "X-Requested-With": "XMLHttpRequest,com.android.chrome,tv.ottnavigator",
                "X-App-Version": "APE_10.0_OMEGA,APE_9.1_SUPREME,APE_9.0,APE_8.5",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,dash,cmaf,smooth,progressive",
                "X-Quality-Preference": "codec-av1,profile-main-12,main-10,main,tier-high;codec-hevc,main-12,main-10,high;codec-vp9,profile-2,profile-0",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0,i,u=1,i,u=2,u=3", → HTTP/3 priority over /1.1
                "X-Playback-Rate": "1.0,1.25,0.75,1.5",
                "X-Segment-Duration": "1,2,4,6",
                "X-Min-Buffer-Time": "1,2,4,6",
                "X-Max-Buffer-Time": "60,45,30,20",
                "X-Request-Priority": "high,normal,low,background",
                "X-Prefetch-Enabled": "adaptive,true,auto,false",
                "X-Video-Codecs": "av1,hevc,vp9,h264",
                "X-Audio-Codecs": "opus,eac3,ac3,aac,dolby,mp3,flac",
                "X-Codec-Support": "av1,hevc,vp9,h264",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,generic,akamai,cloudflare,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "500000,350000,200000,100000",
                "X-Buffer-Target": "250000,180000,120000,80000",
                "X-Buffer-Min": "60000,45000,30000,20000",
                "X-Buffer-Max": "1000000,750000,500000,250000",
                "X-Network-Caching": "25000,18000,12000,8000",
                "X-Live-Caching": "18000,12000,8000,5000",
                "X-File-Caching": "60000,45000,30000,20000",
                "X-Device-Type": "smart-tv,android-tv,fire-tv,set-top-box",
                "X-Screen-Resolution": "7680x4320,3840x2160,2560x1440,1920x1080",
                "X-Network-Type": "ethernet,wifi,5g,4g",
                "X-Buffer-Strategy": "adaptive-predictive,adaptive,balanced,conservative",
                "X-OTT-Navigator-Version": "1.7.0.0-stable,1.6.9.9-stable,1.6.5.0,1.6.0.0",
                "X-Player-Type": "exoplayer,mediaplayer2,vlc,avplayer",
                "X-Hardware-Decode": "auto,preferred,true,false",
                "X-Tunneling-Enabled": "off,false,disabled,auto",
                "X-Audio-Track-Selection": "default,best,auto,first",
                "X-Subtitle-Track-Selection": "off,disabled,none,auto",
                "X-EPG-Sync": "enabled,auto,background,manual",
                "X-Catchup-Support": "flussonic,timeshift,none,auto",
                "X-Bandwidth-Estimation": "balanced,adaptive,conservative,aggressive",
                "X-Initial-Bitrate": "50000000,30000000,20000000,10000000",
                "X-Max-Bitrate": "100000000,80000000,50000000,30000000",
                "X-APE-BITRATE": "80,50,30,20",
                "X-APE-TARGET-BITRATE": "80000000,50000000,30000000,20000000",
                "X-APE-THROUGHPUT-T1": "100,80,50,30",
                "X-APE-THROUGHPUT-T2": "150,100,80,50",
                "X-Retry-Count": "12,10,8,5",
                "X-Retry-Delay-Ms": "100,200,350,500",
                "X-Connection-Timeout-Ms": "2000,3000,4500,6000",
                "X-Read-Timeout-Ms": "5000,7000,9000,12000",
                "X-Country-Code": "ES,US,GB,DE,FR",
                "X-HDR-Support": "hdr10plus,hdr10,hlg,sdr",
                "X-Color-Depth": "12bit,10bit,8bit",
                "X-Color-Space": "bt2020,bt709,srgb",
                "X-Dynamic-Range": "hdr10plus,hdr10,hlg,sdr",
                "X-HDR-Transfer-Function": "smpte2084,arib-std-b67,bt1886,srgb",
                "X-Color-Primaries": "bt2020,bt709,srgb",
                "X-Matrix-Coefficients": "bt2020nc,bt2020c,bt709,bt601",
                "X-Chroma-Subsampling": "4:2:0,4:2:2,4:4:4",
                "X-HEVC-Tier": "HIGH,MAIN",
                "X-HEVC-Level": "6.2,6.1,6.0,5.2",
                "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN,MAIN-STILL-PICTURE",
                "X-Video-Profile": "main-12,main-10,main,high,baseline",
                "X-Rate-Control": "VBR,CBR,CRF,CQP",
                "X-Entropy-Coding": "CABAC,CAVLC",
                "X-Compression-Level": "0,1,2,3",
                "X-Pixel-Format": "yuv420p10le,yuv420p,nv12,p010le",
                "X-Sharpen-Sigma": "0.04,0.06,0.08,0.00",
                "X-Max-Resolution": "7680x4320,3840x2160,2560x1440,1920x1080",
                "X-APE-RESOLUTION": "7680x4320,3840x2160,2560x1440,1920x1080",
                "X-APE-FPS": "60,50,30,24",
                "X-Frame-Rates": "60,50,30,24",
                "X-Aspect-Ratio": "16:9,21:9,4:3,1:1",
                "X-Pixel-Aspect-Ratio": "1:1,SAR,DAR,AUTO",
                "X-Dolby-Atmos": "auto,enabled,false,off",
                "X-Audio-Channels": "7.1,5.1,2.0",
                "X-Audio-Sample-Rate": "48000,44100,32000",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "auto,enabled,false,off",
                "X-Audio-Passthrough": "auto,enabled,false,off",
                "X-Parallel-Segments": "8,6,4,2",
                "X-Prefetch-Segments": "12,10,8,6",
                "X-Segment-Preload": "adaptive,auto,true,false",
                "X-Concurrent-Downloads": "8,6,4,2",
                "X-Reconnect-On-Error": "true,adaptive,auto,false",
                "X-Max-Reconnect-Attempts": "15,12,10,8",
                "X-Reconnect-Delay-Ms": "100,200,350,500",
                "X-Buffer-Underrun-Strategy": "adaptive,refill,wait,auto",
                "X-Seamless-Failover": "adaptive,enabled,true,auto",
                "X-Bandwidth-Preference": "balanced,adaptive,conservative,max",
                "X-BW-Estimation-Window": "5,8,10,12",
                "X-BW-Confidence-Threshold": "0.95,0.93,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.08,0.10,0.12",
                "X-Packet-Loss-Monitor": "enabled,real-time,auto,background",
                "X-RTT-Monitoring": "enabled,real-time,auto,background",
                "X-Congestion-Detect": "enabled,adaptive,balanced,auto",
                "X-CORTEX-OMEGA-STATE": "ACTIVE,MONITORING,ADAPTIVE,PASSIVE",
                "X-APE-AI-SR-ENABLED": "AUTO,ENABLED,FALSE,DISABLED",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,LANCZOS,BICUBIC,NONE",
                "X-APE-AI-SR-SCALE": "2,1,4,0",
                "X-APE-AI-FRAME-INTERPOLATION": "NONE,RIFE_4.6,DAIN,AUTO",
                "X-APE-AI-DENOISING": "NLMEANS,HQDN3D,LOW,NONE",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE,STANDARD,LOW,NONE",
                "X-APE-AI-SHARPENING": "LOW,UNSHARP_MASK,CAS,NONE",
                "X-APE-AI-ARTIFACT-REMOVAL": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "DISABLED,AUTO,OFF,NONE",
                "X-APE-AI-SCENE-DETECTION": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,NONE,AUTO",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_95,VMAF_93,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-PHASE": "2,1,3,0",
                "X-APE-LCEVC-COMPUTE-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS3,BICUBIC,BILINEAR,AUTO",
                "X-APE-LCEVC-ROI-DYNAMIC": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_FMP4,HLS_TS,AUTO",
                "X-APE-LCEVC-SDK-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,ANDROID_TV,TIZEN,WEBOS",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "AUTO,NATIVE,JS_TUNNEL,OFF",
                "X-APE-LCEVC-SDK-DECODER": "AUTO,NATIVE,WASM,WEBGL",
                "X-APE-GPU-DECODE": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-RENDER": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-PIPELINE": "DECODE_TONEMAP_RENDER,DECODE_RENDER,DECODE_DENOISE_RENDER,AUTO",
                "X-APE-GPU-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-GPU-MEMORY-POOL": "AUTO,SHARED,VRAM_ONLY,SYSTEM",
                "X-APE-GPU-ZERO-COPY": "AUTO,PREFERRED,ENABLED,DISABLED",
                "X-APE-VVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-EVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,AUTO,ENABLED,PREFERRED",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "STANDARD,COMPATIBILITY,SAFE,AUTO",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "AUTO,FALSE,DISABLED,OFF",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,CMAF,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_TS,HLS_FMP4,MPEG_TS,PROGRESSIVE",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "RETRY,BACKOFF,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,BACKOFF,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "BACKOFF,RETRY,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RETRY,BACKOFF,FALLBACK_ORIGIN,RECONNECT",
                "X-APE-ANTI-CUT-ENGINE": "ADAPTIVE,ENABLED,AUTO,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "ADAPTIVE,REAL_TIME,AUTO,DISABLED",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "BALANCED,ADAPTIVE,CONSERVATIVE,AUTO",
                "X-APE-RECONNECT-MAX": "15,12,10,8",
                "X-APE-RECONNECT-SEAMLESS": "AUTO,ADAPTIVE,TRUE,FALSE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-MORPH": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "0,0,0,0",
                "X-APE-EVASION-MODE": "DISABLED,OFF,NONE,PASSIVE",
                "X-APE-EVASION-DNS-OVER-HTTPS": "AUTO,DISABLED,OFF,NONE",
                "X-APE-EVASION-SNI-OBFUSCATION": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-EVASION-GEO-PHANTOM": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IP-ROTATION-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-IP-ROTATION-STRATEGY": "PER_SESSION,STATIC,NONE,AUTO",
                "X-APE-STEALTH-UA": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-STEALTH-XFF": "STATIC,OFF,NONE,DEFAULT",
                "X-APE-STEALTH-FINGERPRINT": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-SWARM-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-SWARM-PEERS": "0,0,0,0",
                "X-APE-POLYMORPHIC-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,PROGRESSIVE",
                "X-APE-TRANSPORT-CHUNK-SIZE": "200MS,500MS,1000MS,1500MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,PROGRESSIVE,MPEG_TS",
                "X-APE-CACHE-STRATEGY": "ADAPTIVE,PREDICTIVE,BALANCED,CONSERVATIVE",
                "X-APE-CACHE-SIZE": "1GB,512MB,256MB,128MB",
                "X-APE-CACHE-PREFETCH": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE,BALANCED,CONSERVATIVE,AUTO",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "12,10,8,6",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,AUTO,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "DISABLED,AUTO,OFF,NONE",
                "X-APE-QOS-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-QOS-DSCP": "CS0,AF31,AF21,BE",
                "X-APE-QOS-PRIORITY": "3,2,1,0",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=INFO",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,RINGING=DETECT,MOSQUITO=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=5000,MAX=30000,TARGET=15000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500,KEYFRAME_FORCE=FALSE",
                "X-APE-CODEC": "AV1,HEVC,VP9,H264",
                "X-ExoPlayer-Buffer-Min": "60000,45000,30000,20000",
                "X-Manifest-Refresh": "10000,15000,20000,30000",
                "X-KODI-LIVE-DELAY": "60,45,30,20",
                "X-APE-STRATEGY": "ultra-aggressive,aggressive,adaptive,balanced",
                "X-APE-Prefetch-Segments": "12,10,8,6",
                "X-APE-Quality-Threshold": "0.97,0.95,0.93,0.90",
                "X-Tone-Mapping": "auto,passthrough,hdr-to-sdr,none",
                "X-HDR-Output-Mode": "auto,native,sdr,force-hdr",
                "X-Platform": "android,linux,webos,tizen",
                "X-Deinterlace-Mode": "auto,bob,yadif,off",
                "X-Error-Concealment": "adaptive,enabled,auto,disabled",
                "X-Low-Latency-Mode": "auto,enabled,disabled,off",
                "X-ABR-Algorithm": "adaptive,bandwidth,buffer,hybrid",
                "X-Startup-Quality": "max,high,medium,auto",
                "X-Quality-Switch-Mode": "seamless,auto,instant,none",
                "X-Max-Startup-Delay-Ms": "2000,3000,4000,5000",
                "X-Seek-Tolerance-Ms": "500,1000,1500,2000",
                "X-Gap-Policy": "skip,fill,wait,error",
                "X-Credential-Lock": "none,auto,disabled,off",
                "X-Token-Refresh": "auto,enabled,disabled,off"
            }
        },

        "P1": {
            "id": "P1",
            "name": "SUPREME_4K_HDR",
            "level": 5,
            "quality": "4K+",
            "description": "SUPREME 4K HDR — Ultra-alta definición con HDR10+ y resiliencia",
            "color": "#ea580c",
            "settings": {
                "resolution": "3840x2160",
                "buffer": 20000,
                "strategy": "ultra-aggressive",
                "bitrate": 40.0,
                "t1": 50.0,
                "t2": 80.0,
                "playerBuffer": 50000,
                "fps": 60,
                "codec": "AV1",
                "headersCount": 233,
                "bufferSeconds": 20,
                "focus": "MAXIMA_CALIDAD_4K_HDR10PLUS_SIN_CORTES",
                "hdr_canonical": "hdr10+",
                "nits_target": 8000,
                "codec_chain_video": "hvc1.2.4.L153.B0,hev1.2.4.L153.B0,hvc1.1.6.L150.B0,av01.0.12M.10.0.110.09.16.09.0,avc1.640033,avc1.640028",
                "codec_chain_audio": "ec-3,ac-3,mp4a.40.2,mp4a.40.5",
                "codec_chain_hdr": "hdr10+,hdr10,hlg,sdr",
                "codec_chain_player_pref": "hvc1,hev1,h265,av1,avc1,h264",
                "codec_chain_video_family": "HEVC-MAIN10>HEVC-MAIN>AV1>H264-HIGH>H264-MAIN"
            },
            "vlcopt": {
                "network-caching": "20000",
                "clock-jitter": "1000",
                "clock-synchro": "1",
                "live-caching": "15000",
                "file-caching": "50000",
                "http-user-agent": "Mozilla/5.0 APE-4K_HDR10PLUS_SUPREME",
                "http-referer": "auto",
                "http-forward-cookies": "true",
                "http-reconnect": "true",
                "http-continuous-stream": "true",
                "http-max-retries": "10",
                "http-timeout": "6000",
                "video-color-space": "BT2020",
                "video-transfer-function": "SMPTE-ST2084",
                "video-color-primaries": "BT2020",
                "video-color-range": "limited,full",
                "tone-mapping": "auto",
                "hdr-output-mode": "auto",
                "sharpen-sigma": "0.04",
                "contrast": "1.03",
                "brightness": "1.0",
                "saturation": "1.05",
                "gamma": "1.0",
                "video-filter": "nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full",
                "audio-codec-priority": "eac3,ac3,aac",
                "audio-spatializer": "passthrough",
                "adaptive-logic": "highest",
                "adaptive-maxwidth": "3840",
                "adaptive-maxheight": "2160",
                "demux": "hls"
            },
            "kodiprop": {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]",
                "inputstream.adaptive.min_bandwidth": "18000000",
                "inputstream.adaptive.max_bandwidth": "26900000",
                "inputstream.adaptive.preferred_video_resolution": "2160",
                "inputstream.adaptive.chooser_bandwidth_max": "26900000",
                "inputstream.adaptive.media_renewal_time": "60",
                "inputstream.adaptive.manifest_config": "{\"buffer_assured_duration\":60,\"buffer_max_duration\":120,\"connect_timeout\":15,\"read_timeout\":60,\"retry_count\":99,\"reconnect\":true,\"chunk_size\":1048576}"
            },
            "enabledCategories": [
                "identity",
                "connection",
                "cache",
                "cors",
                "ape_core",
                "playback",
                "codecs",
                "hlsjs_engine",
                "cdn",
                "metadata",
                "hdr_color",
                "resolution_advanced",
                "audio_premium",
                "parallel_download",
                "anti_freeze",
                "abr_control",
                "extra",
                "ott_navigator",
                "streaming_control",
                "security",
                "omega_ai_cortex",
                "omega_lcevc",
                "omega_hardware",
                "omega_resilience",
                "omega_stealth",
                "omega_transport",
                "omega_qos"
            ],
            "headerOverrides": {
                "X-ExoPlayer-Buffer-Min": "34000",
                "X-Manifest-Refresh": "34000",
                "X-KODI-LIVE-DELAY": "34",
                "X-Max-Reconnect-Attempts": "UNLIMITED",
                "X-Reconnect-Delay-Ms": "60,100,150",
                "X-Buffer-Underrun-Strategy": "aggressive-refill,adaptive-refill,conservative-refill",
                "Accept-Encoding": "identity",
                "Accept": "application/vnd.apple.mpegurl, application/x-mpegurl, application/x-m3u8, audio/mpegurl, application/octet-stream, */*",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Cache-Control": "no-cache,no-store,max-age=0,max-stale=0",
                "Sec-Fetch-Site": "same-origin,none,cross-site,same-site",
                "X-Screen-Resolution": "3840x2160",
                "X-Buffer-Strategy": "ultra-aggressive",
                "X-Color-Depth": "12bit",
                "X-Video-Codecs": "av1,hevc,vp9,h264,mpeg2",
                "X-Quality-Preference": "codec-av1,profile-main-12,main-10,main,tier-high;codec-hevc,main-12,main-10,high",
                "X-APE-CODEC": "H265",
                "X-APE-RESOLUTION": "3840x2160",
                "X-APE-FPS": "120",
                "X-APE-BITRATE": "26.9",
                "X-APE-TARGET-BITRATE": "26900",
                "X-APE-THROUGHPUT-T1": "35",
                "X-APE-THROUGHPUT-T2": "43",
                "X-Prefetch-Segments": "20,30,40",
                "X-Parallel-Segments": "6,8,10",
                "X-Concurrent-Downloads": "6,8,10",
                "X-Buffer-Size": "54000",
                "X-Retry-Count": "30,40,50",
                "X-Bandwidth-Estimation": "aggressive,adaptive,balanced",
                "X-Initial-Bitrate": "26900000",
                "X-Retry-Delay-Ms": "60,100,150",
                "X-Connection-Timeout-Ms": "2000,3000,5000",
                "X-Read-Timeout-Ms": "5000,8000,12000",
                "X-Chroma-Subsampling": "4:4:4,4:2:2,4:2:0",
                "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN",
                "X-Compression-Level": "0",
                "X-Rate-Control": "VBR,CQP",
                "X-Pixel-Format": "yuv420p12le",
                "X-BW-Estimation-Window": "10,15,20",
                "X-Bandwidth-Preference": "unlimited,high,balanced,auto",
                "X-BW-Confidence-Threshold": "0.95,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.10,0.15",
                "X-Packet-Loss-Monitor": "enabled,aggressive,adaptive",
                "X-RTT-Monitoring": "enabled,aggressive,adaptive",
                "X-Congestion-Detect": "enabled,aggressive-extreme,adaptive",
                "X-Reconnect-On-Error": "true,immediate,adaptive,false",
                "X-Seamless-Failover": "true-ultra,true,adaptive,false",
                "X-Player-Type": "exoplayer-ultra-extreme,vlc-pro,kodi-pro",
                "X-Hardware-Decode": "true,adaptive,false",
                "X-Tunneling-Enabled": "off",
                "X-Catchup-Support": "flussonic-ultra,timeshift,archive",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0, i", → RFC 9218 HTTP/3 over HTTP/1.1 confuses Xtream parsers
                "X-Playback-Rate": "1.0,1.25,1.5",
                "X-Segment-Duration": "1,2,4,6",
                "X-Min-Buffer-Time": "10",
                "X-Max-Buffer-Time": "54",
                "X-Request-Priority": "ultra-high",
                "X-Prefetch-Enabled": "true,adaptive,auto,false",
                "Origin": "https://iptv-ape.duckdns.org",
                "Referer": "https://iptv-ape.duckdns.org/",
                "Connection": "keep-alive,close",
                "Keep-Alive": "timeout=120, max=1000",
                "Sec-Fetch-Mode": "no-cors,navigate,cors,same-origin",
                "Sec-Fetch-User": "?1,?0",
                "DNT": "1,0",
                "Sec-GPC": "1,0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "1,0", → HTTPS redirect risk
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers,chunked,compress,deflate", → okhttp legacy trailer EOF
                "User-Agent": "Mozilla/5.0 (SMART-TV; webOS 24; LG OLED C4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 LGBROWSER/24.0",
                "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,dts,mp3",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
                "X-Audio-Track-Selection": "default",
                "X-HDR-Support": "hdr10,hdr10+,dolby-vision,hlg",
                "X-Color-Space": "bt2020",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,pt;q=0.7",
                "Sec-CH-UA": "\"Google Chrome\";v=\"125\", \"Chromium\";v=\"125\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"Windows\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"125.0.6422.142\"",
                "Sec-CH-UA-Arch": "x86",
                "Sec-CH-UA-Bitness": "64",
                "Sec-CH-UA-Model": "\"\"",
                "Pragma": "no-cache,no-store",
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-", → m3u8 manifest is not byte-rangeable
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                "X-Requested-With": "XMLHttpRequest,fetch,null",
                "X-App-Version": "APE_10.2_ULTIMATE_HDR",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,cmaf,dash",
                "X-CDN-Provider": "auto,cloudflare,akamai,fastly",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Device-Type": "smart-tv-4k",
                "X-Network-Type": "wifi,ethernet,5g,4g",
                "Accept-Charset": "utf-8, iso-8859-1;q=0.5",
                "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
                "X-Subtitle-Track-Selection": "off,auto",
                "X-EPG-Sync": "enabled,adaptive,disabled",
                "X-Country-Code": "US,GB,ES,DE,FR",
                "X-Dynamic-Range": "hdr",
                "X-HDR-Transfer-Function": "pq,hlg",
                "X-Color-Primaries": "bt2020",
                "X-Matrix-Coefficients": "bt2020nc",
                "X-HEVC-Tier": "HIGH",
                "X-HEVC-Level": "6.1,6.0,5.1",
                "X-Video-Profile": "main-12,main-10,main",
                "X-Entropy-Coding": "CABAC",
                "X-Max-Resolution": "3840x2160",
                "X-Max-Bitrate": "43000000",
                "X-Frame-Rates": "120,24,25,30,50,60",
                "X-Aspect-Ratio": "16:9,21:9,4:3",
                "X-Pixel-Aspect-Ratio": "1:1",
                "X-Dolby-Atmos": "true,adaptive,false",
                "X-Audio-Channels": "7.1,5.1,2.0",
                "X-Audio-Sample-Rate": "96000,48000,44100",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "true,adaptive,false",
                "X-Audio-Passthrough": "true,adaptive,false",
                "X-Segment-Preload": "true,adaptive,false",
                "X-APE-STRATEGY": "ultra-aggressive",
                "X-APE-Prefetch-Segments": "40",
                "X-APE-Quality-Threshold": "0.99",
                "X-Tone-Mapping": "auto,hdr-to-sdr,sdr-to-hdr,passthrough",
                "X-HDR-Output-Mode": "hdr,auto,tonemap,sdr",
                "X-Buffer-Target": "34000",
                "X-Buffer-Max": "216000",
                "X-Buffer-Min": "10000",
                "X-Network-Caching": "10000",
                "X-Live-Caching": "10000",
                "X-File-Caching": "34000",
                "X-Sharpen-Sigma": "0.02",
                "X-Codec-Support": "av1",
                "X-CORTEX-OMEGA-STATE": "ACTIVE_DOMINANT,ACTIVE,STANDBY",
                "X-APE-AI-SR-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,ESRGAN,BICUBIC",
                "X-APE-AI-SR-SCALE": "4,2,1",
                "X-APE-AI-FRAME-INTERPOLATION": "OPTICAL_FLOW_SVFI,RIFE,DISABLED",
                "X-APE-AI-DENOISING": "NLMEANS_HQDN3D_TEMPORAL,NLMEANS,HQDN3D,DISABLED",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE_MAX,ADAPTIVE,STANDARD,DISABLED",
                "X-APE-AI-SHARPENING": "UNSHARP_MASK_ADAPTIVE,UNSHARP_MASK,STANDARD,DISABLED",
                "X-APE-AI-ARTIFACT-REMOVAL": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "AUTO,ENABLED,TONEMAP,OFF",
                "X-APE-AI-SCENE-DETECTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,DISABLED",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_98,VMAF_95,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-PHASE": "4,3,2,1",
                "X-APE-LCEVC-COMPUTE-PRECISION": "FP32,FP16,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS4,LANCZOS3,BICUBIC,BILINEAR",
                "X-APE-LCEVC-ROI-DYNAMIC": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_SIDECAR,DISABLED",
                "X-APE-LCEVC-SDK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,WEBGL,WASM",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "BI_DIRECTIONAL_JS_TUNNEL,UNIDIRECTIONAL,DISABLED",
                "X-APE-LCEVC-SDK-DECODER": "WASM+WEBGL,WASM,NATIVE",
                "X-APE-GPU-DECODE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-RENDER": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-PIPELINE": "DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER,DECODE_LCEVC_AI_SR_TONEMAP_RENDER,DECODE_TONEMAP_RENDER,DECODE_RENDER",
                "X-APE-GPU-PRECISION": "FP32,FP16,INT8",
                "X-APE-GPU-MEMORY-POOL": "VRAM_ONLY,VRAM_SHARED,SYSTEM_RAM",
                "X-APE-GPU-ZERO-COPY": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-VVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "OMEGA_ABSOLUTE,OMEGA,STANDARD",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "TRUE,ADAPTIVE,FALSE",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,HLS_TS,CMAF",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "MORPH_IDENTITY,ROTATE_UA,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,SKIP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "SWARM_EVASION,BACKOFF,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RECONNECT_SILENT,RETRY,FALLBACK",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "NUCLEAR_ESCALATION_NEVER_DOWN,AGGRESSIVE_ESCALATION,ADAPTIVE_ESCALATION,DEFAULT",
                "X-APE-ANTI-CUT-ENGINE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "REAL_TIME,PREDICTIVE,REACTIVE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "NUCLEAR,AGGRESSIVE,MODERATE,PASSIVE",
                "X-APE-RECONNECT-MAX": "UNLIMITED",
                "X-APE-RECONNECT-SEAMLESS": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IDENTITY-MORPH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "30,60,120,300",
                "X-APE-EVASION-MODE": "SWARM_PHANTOM_HYDRA_STEALTH,PHANTOM_STEALTH,STEALTH,STANDARD",
                "X-APE-EVASION-DNS-OVER-HTTPS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-SNI-OBFUSCATION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVASION-GEO-PHANTOM": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IP-ROTATION-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IP-ROTATION-STRATEGY": "PER_REQUEST,PER_SESSION,PER_CHANNEL",
                "X-APE-STEALTH-UA": "RANDOMIZED,ROTATING,FIXED",
                "X-APE-STEALTH-XFF": "DYNAMIC,ROTATING,FIXED",
                "X-APE-STEALTH-FINGERPRINT": "MUTATING,ROTATING,FIXED",
                "X-APE-SWARM-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-SWARM-PEERS": "20,10,5,1",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-TRANSPORT-CHUNK-SIZE": "200MS,500MS,1000MS,2000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-CACHE-STRATEGY": "PREDICTIVE_NEURAL,ADAPTIVE,LRU,NONE",
                "X-APE-CACHE-SIZE": "1GB,512MB,256MB,128MB",
                "X-APE-CACHE-PREFETCH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE_PREDICTIVE_NEURAL,ADAPTIVE_PREDICTIVE,ADAPTIVE,FIXED",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "40",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-QOS-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-QOS-DSCP": "EF,AF41,AF31,BE",
                "X-APE-QOS-PRIORITY": "7,6,5,4",
                "X-APE-POLYMORPHIC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "TRUE,ADAPTIVE,FALSE",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,FREEZE=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=20000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500"
            },
            "prefetch_config": {
                "strategy": "ULTRA_AGRESIVO",
                "prefetch_segments": 45,
                "parallel_downloads": 15,
                "buffer_target_seconds": 54,
                "min_bandwidth_mbps": 81,
                "adaptive_enabled": true,
                "ai_prediction_enabled": true,
                "continuous_prefetch": true
            },
            "quality_levels": {
                "L1": {
                    "label": "SUPREME_4K",
                    "condition": "riskScore<=8 AND stallRate<=0.03 AND vfi>=75",
                    "resolution": "3840x2160",
                    "bitrate_mbps": 100,
                    "hdr": "hdr10plus",
                    "video_filter": "nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full"
                },
                "L2": {
                    "label": "ULTRA_1080P",
                    "condition": "riskScore<=15 AND stallRate<=0.06 AND vfi>=60",
                    "resolution": "1920x1080",
                    "bitrate_mbps": 40,
                    "hdr": "hdr10",
                    "video_filter": "nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full"
                },
                "L3": {
                    "label": "HIGH_720P",
                    "condition": "riskScore<=30 AND stallRate<=0.10 AND vfi>=45",
                    "resolution": "1280x720",
                    "bitrate_mbps": 20,
                    "hdr": "hlg",
                    "video_filter": "hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0"
                },
                "L4": {
                    "label": "STANDARD_480P",
                    "condition": "riskScore<=45 AND stallRate<=0.18 AND vfi>=30",
                    "resolution": "854x480",
                    "bitrate_mbps": 10,
                    "hdr": "sdr",
                    "video_filter": "yadif=mode=0:parity=-1:deint=0"
                },
                "L5": {
                    "label": "LOW_360P",
                    "condition": "riskScore<=65 AND stallRate<=0.30",
                    "resolution": "640x360",
                    "bitrate_mbps": 4,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L6": {
                    "label": "SD_FAILSAFE",
                    "condition": "riskScore<=85",
                    "resolution": "426x240",
                    "bitrate_mbps": 1.5,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L7": {
                    "label": "EMERGENCY",
                    "condition": "ALWAYS_AVAILABLE",
                    "resolution": "426x240",
                    "bitrate_mbps": 0.8,
                    "hdr": "sdr",
                    "video_filter": "",
                    "action": "ACTIVATE_BACKUP_URL"
                },
                "primary": {
                    "codec": "AV1",
                    "profile": "MAIN-12,MAIN-10,MAIN,HIGH,BASELINE"
                }
            },
            "headers": {
                "User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.3 TV Safari/538.1,Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Linux; Android 13; BRAVIA 4K GB ATV3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept": "application/vnd.apple.mpegurl,application/x-mpegurl,application/x-m3u8,video/mp4,audio/aac,audio/mpeg,application/octet-stream,*/*",
                "Accept-Encoding": "identity",
                "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.5",
                "Accept-Charset": "utf-8,iso-8859-1;q=0.5,*;q=0.1",
                "Sec-CH-UA": "\"Google Chrome\";v=\"134\",\"Chromium\";v=\"134\",\"Not-A.Brand\";v=\"99\",\"Samsung Internet\";v=\"23\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"SmartTV\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"134.0.6998.89\",\"Samsung Internet\";v=\"23.0.1.1\",\"Chromium\";v=\"134.0.6998.89\"",
                "Sec-CH-UA-Arch": "x86,arm64,arm",
                "Sec-CH-UA-Bitness": "64,32",
                "Sec-CH-UA-Model": "\"SHIELD Android TV\",\"Samsung Smart TV\",\"BRAVIA 4K\",\"\"",
                "Accept-CH": "DPR,Viewport-Width,Width,Device-Memory,RTT,Downlink,ECT,Save-Data",
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=300,max=1000,timeout=120,max=500",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Sec-Fetch-Mode": "no-cors,cors,same-origin,navigate",
                "Sec-Fetch-Site": "same-origin,same-site,cross-site,none",
                "Sec-Fetch-User": "?0,?1",
                "DNT": "0",
                "Sec-GPC": "0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "0", → forces HTTPS redirect on HTTP-only providers
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers", → com.android.okhttp legacy does not support RFC 7230 trailers
                "Cache-Control": "no-cache,max-age=0,must-revalidate,no-store",
                "Pragma": "no-cache",
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-,bytes=0-2097152,bytes=0-1048576,bytes=0-524288",
                "Origin": "https://iptv-ape.duckdns.org,https://localhost,null",
                "Referer": "https://iptv-ape.duckdns.org/,https://localhost/,https://iptv-ape.duckdns.org/player",
                "X-Requested-With": "XMLHttpRequest,com.android.chrome,tv.ottnavigator",
                "X-App-Version": "APE_10.0_OMEGA,APE_9.1_SUPREME,APE_9.0,APE_8.5",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,dash,cmaf,smooth,progressive",
                "X-Quality-Preference": "codec-av1,profile-main-10,main,tier-high;codec-hevc,main-10,main,high;codec-vp9,profile-2,profile-0",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0,i,u=1,i,u=2,u=3", → HTTP/3 priority over /1.1
                "X-Playback-Rate": "1.0,1.25,0.75,1.5",
                "X-Segment-Duration": "1,2,4,6",
                "X-Min-Buffer-Time": "1,2,4,6",
                "X-Max-Buffer-Time": "50,40,30,20",
                "X-Request-Priority": "high,normal,low,background",
                "X-Prefetch-Enabled": "adaptive,true,auto,false",
                "X-Video-Codecs": "av1,hevc,vp9,h264",
                "X-Audio-Codecs": "opus,eac3,ac3,aac,dolby,mp3,flac",
                "X-Codec-Support": "av1,hevc,vp9,h264",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,generic,akamai,cloudflare,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "400000,280000,180000,100000",
                "X-Buffer-Target": "200000,140000,90000,60000",
                "X-Buffer-Min": "50000,35000,25000,15000",
                "X-Buffer-Max": "800000,600000,400000,200000",
                "X-Network-Caching": "20000,15000,10000,8000",
                "X-Live-Caching": "15000,10000,8000,5000",
                "X-File-Caching": "50000,35000,25000,15000",
                "X-Device-Type": "smart-tv,android-tv,fire-tv,set-top-box",
                "X-Screen-Resolution": "3840x2160,2560x1440,1920x1080,1280x720",
                "X-Network-Type": "ethernet,wifi,5g,4g",
                "X-Buffer-Strategy": "adaptive-predictive,adaptive,balanced,conservative",
                "X-OTT-Navigator-Version": "1.7.0.0-stable,1.6.9.9-stable,1.6.5.0,1.6.0.0",
                "X-Player-Type": "exoplayer,mediaplayer2,vlc,avplayer",
                "X-Hardware-Decode": "auto,preferred,true,false",
                "X-Tunneling-Enabled": "off,false,disabled,auto",
                "X-Audio-Track-Selection": "default,best,auto,first",
                "X-Subtitle-Track-Selection": "off,disabled,none,auto",
                "X-EPG-Sync": "enabled,auto,background,manual",
                "X-Catchup-Support": "flussonic,timeshift,none,auto",
                "X-Bandwidth-Estimation": "balanced,adaptive,conservative,aggressive",
                "X-Initial-Bitrate": "25000000,15000000,10000000,5000000",
                "X-Max-Bitrate": "50000000,40000000,25000000,15000000",
                "X-APE-BITRATE": "40,25,15,10",
                "X-APE-TARGET-BITRATE": "40000000,25000000,15000000,10000000",
                "X-APE-THROUGHPUT-T1": "50,35,20,12",
                "X-APE-THROUGHPUT-T2": "80,50,30,15",
                "X-Retry-Count": "10,8,6,4",
                "X-Retry-Delay-Ms": "150,250,400,600",
                "X-Connection-Timeout-Ms": "2500,3500,5000,7000",
                "X-Read-Timeout-Ms": "6000,8000,10000,12000",
                "X-Country-Code": "ES,US,GB,DE,FR",
                "X-HDR-Support": "hdr10plus,hdr10,hlg,sdr",
                "X-Color-Depth": "10bit,8bit",
                "X-Color-Space": "bt2020,bt709,srgb",
                "X-Dynamic-Range": "hdr10plus,hdr10,hlg,sdr",
                "X-HDR-Transfer-Function": "smpte2084,arib-std-b67,bt1886,srgb",
                "X-Color-Primaries": "bt2020,bt709,srgb",
                "X-Matrix-Coefficients": "bt2020nc,bt709,bt601",
                "X-Chroma-Subsampling": "4:2:0,4:2:2,4:4:4",
                "X-HEVC-Tier": "HIGH,MAIN",
                "X-HEVC-Level": "5.2,5.1,5.0,4.1",
                "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN,MAIN-STILL-PICTURE",
                "X-Video-Profile": "main-12,main-10,main,high,baseline",
                "X-Rate-Control": "VBR,CBR,CRF,CQP",
                "X-Entropy-Coding": "CABAC,CAVLC",
                "X-Compression-Level": "0,1,2,3",
                "X-Pixel-Format": "yuv420p10le,yuv420p,nv12,p010le",
                "X-Sharpen-Sigma": "0.04,0.06,0.08,0.00",
                "X-Max-Resolution": "3840x2160,2560x1440,1920x1080,1280x720",
                "X-APE-RESOLUTION": "3840x2160,2560x1440,1920x1080,1280x720",
                "X-APE-FPS": "60,50,30,24",
                "X-Frame-Rates": "60,50,30,24",
                "X-Aspect-Ratio": "16:9,21:9,4:3,1:1",
                "X-Pixel-Aspect-Ratio": "1:1,SAR,DAR,AUTO",
                "X-Dolby-Atmos": "auto,enabled,false,off",
                "X-Audio-Channels": "7.1,5.1,2.0",
                "X-Audio-Sample-Rate": "48000,44100,32000",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "auto,enabled,false,off",
                "X-Audio-Passthrough": "auto,enabled,false,off",
                "X-Parallel-Segments": "6,4,3,2",
                "X-Prefetch-Segments": "10,8,6,4",
                "X-Segment-Preload": "adaptive,auto,true,false",
                "X-Concurrent-Downloads": "6,4,3,2",
                "X-Reconnect-On-Error": "true,adaptive,auto,false",
                "X-Max-Reconnect-Attempts": "12,10,8,6",
                "X-Reconnect-Delay-Ms": "150,250,400,600",
                "X-Buffer-Underrun-Strategy": "adaptive,refill,wait,auto",
                "X-Seamless-Failover": "adaptive,enabled,true,auto",
                "X-Bandwidth-Preference": "balanced,adaptive,conservative,max",
                "X-BW-Estimation-Window": "5,8,10,12",
                "X-BW-Confidence-Threshold": "0.95,0.93,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.08,0.10,0.12",
                "X-Packet-Loss-Monitor": "enabled,real-time,auto,background",
                "X-RTT-Monitoring": "enabled,real-time,auto,background",
                "X-Congestion-Detect": "enabled,adaptive,balanced,auto",
                "X-CORTEX-OMEGA-STATE": "ACTIVE,MONITORING,ADAPTIVE,PASSIVE",
                "X-APE-AI-SR-ENABLED": "AUTO,ENABLED,FALSE,DISABLED",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,LANCZOS,BICUBIC,NONE",
                "X-APE-AI-SR-SCALE": "2,1,4,0",
                "X-APE-AI-FRAME-INTERPOLATION": "NONE,RIFE_4.6,DAIN,AUTO",
                "X-APE-AI-DENOISING": "NLMEANS,HQDN3D,LOW,NONE",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE,STANDARD,LOW,NONE",
                "X-APE-AI-SHARPENING": "LOW,UNSHARP_MASK,CAS,NONE",
                "X-APE-AI-ARTIFACT-REMOVAL": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "DISABLED,AUTO,OFF,NONE",
                "X-APE-AI-SCENE-DETECTION": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,NONE,AUTO",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_95,VMAF_93,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-PHASE": "2,1,3,0",
                "X-APE-LCEVC-COMPUTE-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS3,BICUBIC,BILINEAR,AUTO",
                "X-APE-LCEVC-ROI-DYNAMIC": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_FMP4,HLS_TS,AUTO",
                "X-APE-LCEVC-SDK-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,ANDROID_TV,TIZEN,WEBOS",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "AUTO,NATIVE,JS_TUNNEL,OFF",
                "X-APE-LCEVC-SDK-DECODER": "AUTO,NATIVE,WASM,WEBGL",
                "X-APE-GPU-DECODE": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-RENDER": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-PIPELINE": "DECODE_TONEMAP_RENDER,DECODE_RENDER,DECODE_DENOISE_RENDER,AUTO",
                "X-APE-GPU-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-GPU-MEMORY-POOL": "AUTO,SHARED,VRAM_ONLY,SYSTEM",
                "X-APE-GPU-ZERO-COPY": "AUTO,PREFERRED,ENABLED,DISABLED",
                "X-APE-VVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-EVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,AUTO,ENABLED,PREFERRED",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "STANDARD,COMPATIBILITY,SAFE,AUTO",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "AUTO,FALSE,DISABLED,OFF",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,CMAF,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_TS,HLS_FMP4,MPEG_TS,PROGRESSIVE",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "RETRY,BACKOFF,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,BACKOFF,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "BACKOFF,RETRY,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RETRY,BACKOFF,FALLBACK_ORIGIN,RECONNECT",
                "X-APE-ANTI-CUT-ENGINE": "ADAPTIVE,ENABLED,AUTO,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "ADAPTIVE,REAL_TIME,AUTO,DISABLED",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "BALANCED,ADAPTIVE,CONSERVATIVE,AUTO",
                "X-APE-RECONNECT-MAX": "12,10,8,6",
                "X-APE-RECONNECT-SEAMLESS": "AUTO,ADAPTIVE,TRUE,FALSE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-MORPH": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "0,0,0,0",
                "X-APE-EVASION-MODE": "DISABLED,OFF,NONE,PASSIVE",
                "X-APE-EVASION-DNS-OVER-HTTPS": "AUTO,DISABLED,OFF,NONE",
                "X-APE-EVASION-SNI-OBFUSCATION": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-EVASION-GEO-PHANTOM": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IP-ROTATION-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-IP-ROTATION-STRATEGY": "PER_SESSION,STATIC,NONE,AUTO",
                "X-APE-STEALTH-UA": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-STEALTH-XFF": "STATIC,OFF,NONE,DEFAULT",
                "X-APE-STEALTH-FINGERPRINT": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-SWARM-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-SWARM-PEERS": "0,0,0,0",
                "X-APE-POLYMORPHIC-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,PROGRESSIVE",
                "X-APE-TRANSPORT-CHUNK-SIZE": "300MS,500MS,1000MS,1500MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,PROGRESSIVE,MPEG_TS",
                "X-APE-CACHE-STRATEGY": "ADAPTIVE,PREDICTIVE,BALANCED,CONSERVATIVE",
                "X-APE-CACHE-SIZE": "512MB,256MB,128MB,64MB",
                "X-APE-CACHE-PREFETCH": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE,BALANCED,CONSERVATIVE,AUTO",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "10,8,6,4",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,AUTO,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "DISABLED,AUTO,OFF,NONE",
                "X-APE-QOS-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-QOS-DSCP": "CS0,AF31,AF21,BE",
                "X-APE-QOS-PRIORITY": "3,2,1,0",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=INFO",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,RINGING=DETECT,MOSQUITO=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=5000,MAX=30000,TARGET=15000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500,KEYFRAME_FORCE=FALSE",
                "X-APE-CODEC": "AV1,HEVC,VP9,H264",
                "X-ExoPlayer-Buffer-Min": "50000,35000,25000,15000",
                "X-Manifest-Refresh": "12000,18000,25000,35000",
                "X-KODI-LIVE-DELAY": "50,35,25,15",
                "X-APE-STRATEGY": "ultra-aggressive,aggressive,adaptive,balanced",
                "X-APE-Prefetch-Segments": "10,8,6,4",
                "X-APE-Quality-Threshold": "0.97,0.95,0.93,0.90",
                "X-Tone-Mapping": "auto,passthrough,hdr-to-sdr,none",
                "X-HDR-Output-Mode": "auto,native,sdr,force-hdr",
                "X-Platform": "android,linux,webos,tizen",
                "X-Deinterlace-Mode": "auto,bob,yadif,off",
                "X-Error-Concealment": "adaptive,enabled,auto,disabled",
                "X-Low-Latency-Mode": "auto,enabled,disabled,off",
                "X-ABR-Algorithm": "adaptive,bandwidth,buffer,hybrid",
                "X-Startup-Quality": "high,medium,auto,low",
                "X-Quality-Switch-Mode": "seamless,auto,instant,none",
                "X-Max-Startup-Delay-Ms": "2500,3500,4500,5500",
                "X-Seek-Tolerance-Ms": "500,1000,1500,2000",
                "X-Gap-Policy": "skip,fill,wait,error",
                "X-Credential-Lock": "none,auto,disabled,off",
                "X-Token-Refresh": "auto,enabled,disabled,off"
            }
        },

        "P2": {
            "id": "P2",
            "name": "ELITE_4K_BALANCED",
            "level": 4,
            "quality": "4K",
            "description": "ELITE 4K — Equilibrio entre calidad 4K y estabilidad robusta",
            "color": "#ca8a04",
            "settings": {
                "resolution": "3840x2160",
                "buffer": 15000,
                "strategy": "aggressive",
                "bitrate": 20.0,
                "t1": 25.0,
                "t2": 40.0,
                "playerBuffer": 40000,
                "fps": 60,
                "codec": "HEVC",
                "headersCount": 233,
                "bufferSeconds": 15,
                "focus": "MAXIMA_CALIDAD_8K_HDR_CARGA_ULTRARAPIDA_SIN_CORTES",
                "hdr_canonical": "hdr10",
                "nits_target": 8000,
                "codec_chain_video": "hvc1.2.4.L153.B0,hev1.2.4.L153.B0,hvc1.1.6.L150.B0,avc1.640033,avc1.640028",
                "codec_chain_audio": "ec-3,ac-3,mp4a.40.2,mp4a.40.5",
                "codec_chain_hdr": "hdr10,hlg,sdr",
                "codec_chain_player_pref": "hvc1,hev1,h265,avc1,h264",
                "codec_chain_video_family": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN"
            },
            "vlcopt": {
                "network-caching": "15000",
                "clock-jitter": "1000",
                "clock-synchro": "1",
                "live-caching": "12000",
                "file-caching": "40000",
                "http-user-agent": "Mozilla/5.0 APE-8K_ULTRA_EXTREME_MASTER",
                "http-referer": "auto",
                "http-forward-cookies": "true",
                "http-reconnect": "true",
                "http-continuous-stream": "true",
                "http-max-retries": "8",
                "http-timeout": "7000",
                "video-color-space": "BT2020",
                "video-transfer-function": "SMPTE-ST2084",
                "video-color-primaries": "BT2020",
                "video-color-range": "limited",
                "tone-mapping": "auto",
                "hdr-output-mode": "auto",
                "sharpen-sigma": "0.04",
                "contrast": "1.02",
                "brightness": "1.0",
                "saturation": "1.04",
                "gamma": "1.0",
                "audio-codec-priority": "eac3,ac3,aac",
                "audio-spatializer": "passthrough",
                "adaptive-logic": "highest",
                "adaptive-maxwidth": "3840",
                "adaptive-maxheight": "2160",
                "demux": "hls"
            },
            "kodiprop": {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]",
                "inputstream.adaptive.min_bandwidth": "13000000",
                "inputstream.adaptive.max_bandwidth": "18000000",
                "inputstream.adaptive.preferred_video_resolution": "2160",
                "inputstream.adaptive.chooser_bandwidth_max": "18000000",
                "inputstream.adaptive.media_renewal_time": "60",
                "inputstream.adaptive.manifest_config": "{\"buffer_assured_duration\":60,\"buffer_max_duration\":120,\"connect_timeout\":15,\"read_timeout\":60,\"retry_count\":99,\"reconnect\":true,\"chunk_size\":1048576}"
            },
            "enabledCategories": [
                "identity",
                "connection",
                "cache",
                "cors",
                "ape_core",
                "playback",
                "codecs",
                "hlsjs_engine",
                "cdn",
                "hdr_color",
                "resolution_advanced",
                "audio_premium",
                "parallel_download",
                "abr_control",
                "anti_freeze",
                "metadata",
                "extra",
                "ott_navigator",
                "streaming_control",
                "security",
                "omega_ai_cortex",
                "omega_lcevc",
                "omega_hardware",
                "omega_resilience",
                "omega_stealth",
                "omega_transport",
                "omega_qos"
            ],
            "headerOverrides": {
                "X-ExoPlayer-Buffer-Min": "34000",
                "X-Manifest-Refresh": "34000",
                "X-KODI-LIVE-DELAY": "34",
                "X-Parallel-Segments": "4,6,8",
                "X-Prefetch-Segments": "10,15,20",
                "X-Max-Reconnect-Attempts": "40",
                "X-Reconnect-Delay-Ms": "50,100,200",
                "X-Buffer-Underrun-Strategy": "aggressive-refill",
                "Accept-Encoding": "identity",
                "Accept": "application/vnd.apple.mpegurl, application/x-mpegurl, application/x-m3u8, audio/mpegurl, application/octet-stream, */*",
                "Sec-Fetch-Dest": "media",
                "Cache-Control": "no-cache",
                "Sec-Fetch-Site": "same-origin",
                "X-Screen-Resolution": "3840x2160",
                "X-Buffer-Strategy": "ultra-aggressive",
                "X-Color-Depth": "12bit",
                "X-Video-Codecs": "hevc,h265,h.265,vp9,h264,mpeg2",
                "X-Quality-Preference": "codec-hevc,profile-main-12,main-10,tier-high;codec-h265,profile-main-12,main-10,tier-high;codec-h.265,profile-main-12,main-10,tier-high;codec-vp9,profile2,profile0,n/a",
                "X-Concurrent-Downloads": "4,6,8",
                "User-Agent": "Mozilla/5.0 (APE-NAVIGATOR; ULTRA-8K-HEVC-MASTER) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                "Sec-CH-UA": "\"Google Chrome\";v=\"125\", \"Chromium\";v=\"125\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"Windows\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"125.0.6422.142\"",
                "Sec-CH-UA-Arch": "x86",
                "Sec-CH-UA-Bitness": "64",
                "Sec-CH-UA-Model": "\"\"",
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=120, max=100",
                "Sec-Fetch-Mode": "no-cors",
                "Sec-Fetch-User": "?0",
                "DNT": "0",
                "Sec-GPC": "0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "0", → forces HTTPS redirect on HTTP-only providers
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers", → com.android.okhttp legacy does not support RFC 7230 trailers
                "Pragma": "no-cache",
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-", → m3u8 manifest is not byte-rangeable
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                "Origin": "https://iptv-ape.duckdns.org",
                "Referer": "https://iptv-ape.duckdns.org/",
                "X-Requested-With": "XMLHttpRequest",
                "X-App-Version": "APE_9.1_ULTIMATE_HDR",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,dash",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0, i", → RFC 9218 HTTP/3 over HTTP/1.1 confuses Xtream parsers
                "X-Playback-Rate": "1.0,1.25,1.5",
                "X-Segment-Duration": "1,2,4",
                "X-Min-Buffer-Time": "10",
                "X-Max-Buffer-Time": "54",
                "X-Request-Priority": "ultra-high",
                "X-Prefetch-Enabled": "true,adaptive,auto",
                "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,mp3",
                "X-DRM-Support": "widevine,playready,fairplay",
                "X-CDN-Provider": "auto",
                "X-Failover-Enabled": "true",
                "X-Buffer-Size": "54000",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Device-Type": "smart-tv",
                "X-Network-Type": "wifi",
                "Accept-Charset": "utf-8, iso-8859-1;q=0.5",
                "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
                "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
                "X-Player-Type": "exoplayer-ultra-extreme,vlc-pro,kodi-pro",
                "X-Hardware-Decode": "true",
                "X-Tunneling-Enabled": "off",
                "X-Audio-Track-Selection": "default",
                "X-Subtitle-Track-Selection": "off",
                "X-EPG-Sync": "enabled",
                "X-Catchup-Support": "flussonic-ultra",
                "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
                "X-Initial-Bitrate": "21500000",
                "X-Retry-Count": "10,12,15",
                "X-Retry-Delay-Ms": "120,200,350",
                "X-Connection-Timeout-Ms": "2500,3500,6000",
                "X-Read-Timeout-Ms": "6000,9000,12000",
                "X-Country-Code": "US",
                "X-HDR-Support": "hdr10,hdr10+,dolby-vision,hlg",
                "X-Color-Space": "bt2020",
                "X-Dynamic-Range": "hdr",
                "X-HDR-Transfer-Function": "pq,hlg",
                "X-Color-Primaries": "bt2020",
                "X-Matrix-Coefficients": "bt2020nc",
                "X-Chroma-Subsampling": "4:4:4,4:2:2,4:2:0",
                "X-HEVC-Tier": "HIGH",
                "X-HEVC-Level": "6.1,6.0,5.1,5.0,4.1",
                "X-HEVC-Profile": "MAIN-12,MAIN-10",
                "X-Video-Profile": "main-12,main-10",
                "X-Rate-Control": "VBR,CQP",
                "X-Entropy-Coding": "CABAC",
                "X-Compression-Level": "0",
                "X-Pixel-Format": "yuv420p12le",
                "X-Max-Resolution": "3840x2160",
                "X-Max-Bitrate": "34400000",
                "X-Frame-Rates": "120,24,25,30,50,60",
                "X-Aspect-Ratio": "16:9,21:9",
                "X-Pixel-Aspect-Ratio": "1:1",
                "X-Dolby-Atmos": "true",
                "X-Audio-Channels": "7.1",
                "X-Audio-Sample-Rate": "96000",
                "X-Audio-Bit-Depth": "24bit",
                "X-Spatial-Audio": "true",
                "X-Audio-Passthrough": "true",
                "X-Segment-Preload": "true",
                "X-Reconnect-On-Error": "true,immediate,adaptive",
                "X-Seamless-Failover": "true-ultra",
                "X-Bandwidth-Preference": "unlimited",
                "X-BW-Estimation-Window": "10",
                "X-BW-Confidence-Threshold": "0.95",
                "X-BW-Smooth-Factor": "0.05",
                "X-Packet-Loss-Monitor": "enabled,aggressive",
                "X-RTT-Monitoring": "enabled,aggressive",
                "X-Congestion-Detect": "enabled,aggressive-extreme",
                "X-APE-STRATEGY": "ultra-aggressive",
                "X-APE-Prefetch-Segments": "20",
                "X-APE-Quality-Threshold": "0.99",
                "X-APE-CODEC": "AV1",
                "X-APE-RESOLUTION": "3840x2160",
                "X-APE-FPS": "120",
                "X-APE-BITRATE": "21.5",
                "X-APE-TARGET-BITRATE": "21500",
                "X-APE-THROUGHPUT-T1": "27.9",
                "X-APE-THROUGHPUT-T2": "34.4",
                "X-Tone-Mapping": "auto",
                "X-HDR-Output-Mode": "auto",
                "X-Buffer-Target": "34000",
                "X-Buffer-Max": "216000",
                "X-Buffer-Min": "10000",
                "X-Network-Caching": "10000",
                "X-Live-Caching": "10000",
                "X-File-Caching": "34000",
                "X-Sharpen-Sigma": "0.02",
                "X-Codec-Support": "hevc,h265,h.265"
            },
            "prefetch_config": {
                "strategy": "ULTRA_AGRESIVO",
                "prefetch_segments": 90,
                "parallel_downloads": 40,
                "buffer_target_seconds": 54,
                "min_bandwidth_mbps": 65,
                "adaptive_enabled": true,
                "ai_prediction_enabled": true,
                "continuous_prefetch": true
            },
            "quality_levels": {
                "primary": {
                    "resolution": "7680x4320",
                    "bitrate": "120000000,150000000,200000000",
                    "fps": "120",
                    "codec": "HEVC",
                    "profile": "MAIN-12,MAIN-10,MAIN,HIGH,BASELINE"
                }
            },
            "headers": {
                "User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.3 TV Safari/538.1,Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Linux; Android 13; BRAVIA 4K GB ATV3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept": "application/vnd.apple.mpegurl,application/x-mpegurl,application/x-m3u8,video/mp4,audio/aac,audio/mpeg,application/octet-stream,*/*",
                "Accept-Encoding": "identity",
                "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.5",
                "Accept-Charset": "utf-8,iso-8859-1;q=0.5,*;q=0.1",
                "Sec-CH-UA": "\"Google Chrome\";v=\"134\",\"Chromium\";v=\"134\",\"Not-A.Brand\";v=\"99\",\"Samsung Internet\";v=\"23\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"SmartTV\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"134.0.6998.89\",\"Samsung Internet\";v=\"23.0.1.1\",\"Chromium\";v=\"134.0.6998.89\"",
                "Sec-CH-UA-Arch": "x86,arm64,arm",
                "Sec-CH-UA-Bitness": "64,32",
                "Sec-CH-UA-Model": "\"SHIELD Android TV\",\"Samsung Smart TV\",\"BRAVIA 4K\",\"\"",
                "Accept-CH": "DPR,Viewport-Width,Width,Device-Memory,RTT,Downlink,ECT,Save-Data",
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=300,max=1000,timeout=120,max=500",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Sec-Fetch-Mode": "no-cors,cors,same-origin,navigate",
                "Sec-Fetch-Site": "same-origin,same-site,cross-site,none",
                "Sec-Fetch-User": "?0,?1",
                "DNT": "0",
                "Sec-GPC": "0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "0", → forces HTTPS redirect on HTTP-only providers
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers", → com.android.okhttp legacy does not support RFC 7230 trailers
                "Cache-Control": "no-cache,max-age=0,must-revalidate,no-store",
                "Pragma": "no-cache",
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-,bytes=0-2097152,bytes=0-1048576,bytes=0-524288",
                "Origin": "https://iptv-ape.duckdns.org,https://localhost,null",
                "Referer": "https://iptv-ape.duckdns.org/,https://localhost/,https://iptv-ape.duckdns.org/player",
                "X-Requested-With": "XMLHttpRequest,com.android.chrome,tv.ottnavigator",
                "X-App-Version": "APE_10.0_OMEGA,APE_9.1_SUPREME,APE_9.0,APE_8.5",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,dash,cmaf,smooth,progressive",
                "X-Quality-Preference": "codec-hevc,profile-main-10,main,tier-high;codec-av1,main-10;codec-vp9,profile-2",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0,i,u=1,i,u=2,u=3", → HTTP/3 priority over /1.1
                "X-Playback-Rate": "1.0,1.25,0.75,1.5",
                "X-Segment-Duration": "1,2,4,6",
                "X-Min-Buffer-Time": "1,2,4,6",
                "X-Max-Buffer-Time": "40,30,20,15",
                "X-Request-Priority": "high,normal,low,background",
                "X-Prefetch-Enabled": "adaptive,true,auto,false",
                "X-Video-Codecs": "hevc,av1,vp9,h264",
                "X-Audio-Codecs": "eac3,ac3,aac,opus,mp3",
                "X-Codec-Support": "hevc,av1,vp9,h264",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,generic,akamai,cloudflare,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "300000,200000,120000,80000",
                "X-Buffer-Target": "150000,100000,70000,45000",
                "X-Buffer-Min": "40000,30000,20000,12000",
                "X-Buffer-Max": "600000,400000,280000,150000",
                "X-Network-Caching": "15000,12000,9000,6000",
                "X-Live-Caching": "12000,9000,7000,4000",
                "X-File-Caching": "40000,30000,20000,15000",
                "X-Device-Type": "smart-tv,android-tv,fire-tv,set-top-box",
                "X-Screen-Resolution": "3840x2160,1920x1080,1280x720,854x480",
                "X-Network-Type": "ethernet,wifi,5g,4g",
                "X-Buffer-Strategy": "adaptive-predictive,adaptive,balanced,conservative",
                "X-OTT-Navigator-Version": "1.7.0.0-stable,1.6.9.9-stable,1.6.5.0,1.6.0.0",
                "X-Player-Type": "exoplayer,mediaplayer2,vlc,avplayer",
                "X-Hardware-Decode": "auto,preferred,true,false",
                "X-Tunneling-Enabled": "off,false,disabled,auto",
                "X-Audio-Track-Selection": "default,best,auto,first",
                "X-Subtitle-Track-Selection": "off,disabled,none,auto",
                "X-EPG-Sync": "enabled,auto,background,manual",
                "X-Catchup-Support": "flussonic,timeshift,none,auto",
                "X-Bandwidth-Estimation": "balanced,adaptive,conservative,aggressive",
                "X-Initial-Bitrate": "12000000,8000000,5000000,3000000",
                "X-Max-Bitrate": "25000000,20000000,12000000,8000000",
                "X-APE-BITRATE": "20,12,8,5",
                "X-APE-TARGET-BITRATE": "20000000,12000000,8000000,5000000",
                "X-APE-THROUGHPUT-T1": "25,15,10,6",
                "X-APE-THROUGHPUT-T2": "40,20,12,8",
                "X-Retry-Count": "8,6,5,3",
                "X-Retry-Delay-Ms": "200,300,500,700",
                "X-Connection-Timeout-Ms": "3000,4000,5500,7000",
                "X-Read-Timeout-Ms": "7000,9000,11000,13000",
                "X-Country-Code": "ES,US,GB,DE,FR",
                "X-HDR-Support": "hdr10,hlg,sdr,hdr10plus",
                "X-Color-Depth": "10bit,8bit",
                "X-Color-Space": "bt2020,bt709,srgb,bt601",
                "X-Dynamic-Range": "hdr10,hlg,sdr",
                "X-HDR-Transfer-Function": "smpte2084,arib-std-b67,bt1886,srgb",
                "X-Color-Primaries": "bt2020,bt709,srgb,bt601",
                "X-Matrix-Coefficients": "bt2020nc,bt709,bt601",
                "X-Chroma-Subsampling": "4:2:0,4:2:2,4:4:4",
                "X-HEVC-Tier": "HIGH,MAIN",
                "X-HEVC-Level": "5.1,5.0,4.1,4.0",
                "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN,MAIN-STILL-PICTURE",
                "X-Video-Profile": "main-12,main-10,main,high,baseline",
                "X-Rate-Control": "VBR,CBR,CRF,CQP",
                "X-Entropy-Coding": "CABAC,CAVLC",
                "X-Compression-Level": "0,1,2,3",
                "X-Pixel-Format": "yuv420p10le,yuv420p,nv12",
                "X-Sharpen-Sigma": "0.04,0.06,0.08,0.00",
                "X-Max-Resolution": "3840x2160,1920x1080,1280x720,854x480",
                "X-APE-RESOLUTION": "3840x2160,1920x1080,1280x720,854x480",
                "X-APE-FPS": "60,50,30,24",
                "X-Frame-Rates": "60,50,30,24",
                "X-Aspect-Ratio": "16:9,21:9,4:3,1:1",
                "X-Pixel-Aspect-Ratio": "1:1,SAR,DAR,AUTO",
                "X-Dolby-Atmos": "auto,enabled,false,off",
                "X-Audio-Channels": "5.1,2.0",
                "X-Audio-Sample-Rate": "48000,44100,32000",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "auto,enabled,false,off",
                "X-Audio-Passthrough": "auto,enabled,false,off",
                "X-Parallel-Segments": "4,3,2,1",
                "X-Prefetch-Segments": "8,6,4,3",
                "X-Segment-Preload": "adaptive,auto,true,false",
                "X-Concurrent-Downloads": "4,3,2,1",
                "X-Reconnect-On-Error": "true,adaptive,auto,false",
                "X-Max-Reconnect-Attempts": "10,8,6,4",
                "X-Reconnect-Delay-Ms": "200,350,500,700",
                "X-Buffer-Underrun-Strategy": "adaptive,refill,wait,auto",
                "X-Seamless-Failover": "adaptive,enabled,true,auto",
                "X-Bandwidth-Preference": "balanced,adaptive,conservative,max",
                "X-BW-Estimation-Window": "5,8,10,12",
                "X-BW-Confidence-Threshold": "0.95,0.93,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.08,0.10,0.12",
                "X-Packet-Loss-Monitor": "enabled,real-time,auto,background",
                "X-RTT-Monitoring": "enabled,real-time,auto,background",
                "X-Congestion-Detect": "enabled,adaptive,balanced,auto",
                "X-CORTEX-OMEGA-STATE": "ACTIVE,MONITORING,ADAPTIVE,PASSIVE",
                "X-APE-AI-SR-ENABLED": "AUTO,ENABLED,FALSE,DISABLED",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,LANCZOS,BICUBIC,NONE",
                "X-APE-AI-SR-SCALE": "2,1,4,0",
                "X-APE-AI-FRAME-INTERPOLATION": "NONE,RIFE_4.6,DAIN,AUTO",
                "X-APE-AI-DENOISING": "NLMEANS,HQDN3D,LOW,NONE",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE,STANDARD,LOW,NONE",
                "X-APE-AI-SHARPENING": "LOW,UNSHARP_MASK,CAS,NONE",
                "X-APE-AI-ARTIFACT-REMOVAL": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "DISABLED,AUTO,OFF,NONE",
                "X-APE-AI-SCENE-DETECTION": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,NONE,AUTO",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_95,VMAF_93,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-PHASE": "2,1,3,0",
                "X-APE-LCEVC-COMPUTE-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS3,BICUBIC,BILINEAR,AUTO",
                "X-APE-LCEVC-ROI-DYNAMIC": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_FMP4,HLS_TS,AUTO",
                "X-APE-LCEVC-SDK-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,ANDROID_TV,TIZEN,WEBOS",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "AUTO,NATIVE,JS_TUNNEL,OFF",
                "X-APE-LCEVC-SDK-DECODER": "AUTO,NATIVE,WASM,WEBGL",
                "X-APE-GPU-DECODE": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-RENDER": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-PIPELINE": "DECODE_TONEMAP_RENDER,DECODE_RENDER,DECODE_DENOISE_RENDER,AUTO",
                "X-APE-GPU-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-GPU-MEMORY-POOL": "AUTO,SHARED,VRAM_ONLY,SYSTEM",
                "X-APE-GPU-ZERO-COPY": "AUTO,PREFERRED,ENABLED,DISABLED",
                "X-APE-VVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-EVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,AUTO,ENABLED,PREFERRED",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "STANDARD,COMPATIBILITY,SAFE,AUTO",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "AUTO,FALSE,DISABLED,OFF",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,CMAF,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_TS,HLS_FMP4,MPEG_TS,PROGRESSIVE",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "RETRY,BACKOFF,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,BACKOFF,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "BACKOFF,RETRY,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RETRY,BACKOFF,FALLBACK_ORIGIN,RECONNECT",
                "X-APE-ANTI-CUT-ENGINE": "ADAPTIVE,ENABLED,AUTO,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "ADAPTIVE,REAL_TIME,AUTO,DISABLED",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "BALANCED,ADAPTIVE,CONSERVATIVE,AUTO",
                "X-APE-RECONNECT-MAX": "10,8,6,4",
                "X-APE-RECONNECT-SEAMLESS": "AUTO,ADAPTIVE,TRUE,FALSE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-MORPH": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "0,0,0,0",
                "X-APE-EVASION-MODE": "DISABLED,OFF,NONE,PASSIVE",
                "X-APE-EVASION-DNS-OVER-HTTPS": "AUTO,DISABLED,OFF,NONE",
                "X-APE-EVASION-SNI-OBFUSCATION": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-EVASION-GEO-PHANTOM": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IP-ROTATION-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-IP-ROTATION-STRATEGY": "PER_SESSION,STATIC,NONE,AUTO",
                "X-APE-STEALTH-UA": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-STEALTH-XFF": "STATIC,OFF,NONE,DEFAULT",
                "X-APE-STEALTH-FINGERPRINT": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-SWARM-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-SWARM-PEERS": "0,0,0,0",
                "X-APE-POLYMORPHIC-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,PROGRESSIVE",
                "X-APE-TRANSPORT-CHUNK-SIZE": "500MS,1000MS,1500MS,2000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,PROGRESSIVE,MPEG_TS",
                "X-APE-CACHE-STRATEGY": "ADAPTIVE,PREDICTIVE,BALANCED,CONSERVATIVE",
                "X-APE-CACHE-SIZE": "512MB,256MB,128MB,64MB",
                "X-APE-CACHE-PREFETCH": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE,BALANCED,CONSERVATIVE,AUTO",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "8,6,4,3",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,AUTO,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "DISABLED,AUTO,OFF,NONE",
                "X-APE-QOS-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-QOS-DSCP": "CS0,AF31,AF21,BE",
                "X-APE-QOS-PRIORITY": "3,2,1,0",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=INFO",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,RINGING=DETECT,MOSQUITO=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=5000,MAX=30000,TARGET=15000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500,KEYFRAME_FORCE=FALSE",
                "X-APE-CODEC": "HEVC,AV1,VP9,H264",
                "X-ExoPlayer-Buffer-Min": "40000,30000,20000,15000",
                "X-Manifest-Refresh": "15000,20000,30000,40000",
                "X-KODI-LIVE-DELAY": "40,30,20,15",
                "X-APE-STRATEGY": "aggressive,adaptive,balanced,conservative",
                "X-APE-Prefetch-Segments": "8,6,4,3",
                "X-APE-Quality-Threshold": "0.97,0.95,0.93,0.90",
                "X-Tone-Mapping": "auto,passthrough,hdr-to-sdr,none",
                "X-HDR-Output-Mode": "auto,native,sdr,force-hdr",
                "X-Platform": "android,linux,webos,tizen",
                "X-Deinterlace-Mode": "auto,bob,yadif,off",
                "X-Error-Concealment": "adaptive,enabled,auto,disabled",
                "X-Low-Latency-Mode": "auto,enabled,disabled,off",
                "X-ABR-Algorithm": "adaptive,bandwidth,buffer,hybrid",
                "X-Startup-Quality": "high,medium,auto,low",
                "X-Quality-Switch-Mode": "seamless,auto,instant,none",
                "X-Max-Startup-Delay-Ms": "3000,4000,5000,6000",
                "X-Seek-Tolerance-Ms": "500,1000,1500,2000",
                "X-Gap-Policy": "skip,fill,wait,error",
                "X-Credential-Lock": "none,auto,disabled,off",
                "X-Token-Refresh": "auto,enabled,disabled,off"
            }
        },

        "P3": {
            "id": "P3",
            "name": "ULTRA_FHD_STABLE",
            "level": 3,
            "quality": "FHD",
            "description": "ULTRA FHD — Full HD optimizado para estabilidad y compatibilidad",
            "color": "#16a34a",
            "settings": {
                "resolution": "1920x1080",
                "buffer": 12000,
                "strategy": "adaptive",
                "bitrate": 10.0,
                "t1": 12.0,
                "t2": 15.0,
                "playerBuffer": 30000,
                "fps": 60,
                "codec": "HEVC",
                "headersCount": 233,
                "bufferSeconds": 12,
                "focus": "ULTRA_1080P_HDR10_CARGA_RAPIDA_SIN_CORTES",
                "hdr_canonical": "hlg",
                "nits_target": 8000,
                "codec_chain_video": "hvc1.1.6.L120.B0,hev1.1.6.L120.B0,hvc1.2.4.L120.B0,avc1.640028,avc1.4D401F",
                "codec_chain_audio": "mp4a.40.2,mp4a.40.5,mp4a.40.29",
                "codec_chain_hdr": "hlg,sdr",
                "codec_chain_player_pref": "hvc1,hev1,h265,avc1,h264",
                "codec_chain_video_family": "HEVC-MAIN>HEVC-MAIN10>H264-HIGH>H264-MAIN"
            },
            "vlcopt": {
                "network-caching": "12000",
                "clock-jitter": "1000",
                "clock-synchro": "1",
                "live-caching": "9000",
                "file-caching": "30000",
                "http-user-agent": "Mozilla/5.0 APE-1080P_HDR10_ULTRA",
                "http-referer": "auto",
                "http-forward-cookies": "true",
                "http-reconnect": "true",
                "http-continuous-stream": "true",
                "http-max-retries": "8",
                "http-timeout": "8000",
                "video-color-space": "BT709",
                "video-transfer-function": "BT1886",
                "video-color-primaries": "BT709",
                "video-color-range": "limited,full",
                "tone-mapping": "auto",
                "hdr-output-mode": "auto",
                "sharpen-sigma": "0.03",
                "contrast": "1.02",
                "brightness": "1.0",
                "saturation": "1.03",
                "gamma": "1.0",
                "video-filter": "nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full",
                "audio-codec-priority": "eac3,aac",
                "adaptive-logic": "highest",
                "adaptive-maxwidth": "1920",
                "adaptive-maxheight": "1080",
                "demux": "hls"
            },
            "kodiprop": {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]",
                "inputstream.adaptive.min_bandwidth": "5000000",
                "inputstream.adaptive.max_bandwidth": "8000000",
                "inputstream.adaptive.preferred_video_resolution": "1080",
                "inputstream.adaptive.chooser_bandwidth_max": "8000000",
                "inputstream.adaptive.media_renewal_time": "60",
                "inputstream.adaptive.manifest_config": "{\"buffer_assured_duration\":60,\"buffer_max_duration\":120,\"connect_timeout\":15,\"read_timeout\":60,\"retry_count\":99,\"reconnect\":true,\"chunk_size\":1048576}"
            },
            "enabledCategories": [
                "identity",
                "connection",
                "cache",
                "cors",
                "ape_core",
                "playback",
                "codecs",
                "hlsjs_engine",
                "hdr_color",
                "audio_premium",
                "abr_control",
                "cdn",
                "resolution_advanced",
                "metadata",
                "parallel_download",
                "extra",
                "anti_freeze",
                "security",
                "streaming_control",
                "ott_navigator",
                "omega_ai_cortex",
                "omega_lcevc",
                "omega_hardware",
                "omega_resilience",
                "omega_stealth",
                "omega_transport",
                "omega_qos"
            ],
            "headerOverrides": {
                "X-APE-CODEC": "H264",
                "X-APE-RESOLUTION": "1920x1080",
                "X-APE-FPS": "60",
                "X-Screen-Resolution": "1920x1080",
                "X-APE-BITRATE": "6.7",
                "X-APE-TARGET-BITRATE": "6700",
                "X-APE-THROUGHPUT-T1": "8.7",
                "X-APE-THROUGHPUT-T2": "10.7",
                "X-ExoPlayer-Buffer-Min": "34000",
                "X-Manifest-Refresh": "34000",
                "X-KODI-LIVE-DELAY": "34",
                "X-APE-STRATEGY": "ultra-aggressive",
                "X-APE-Prefetch-Segments": "30",
                "X-APE-Quality-Threshold": "0.98",
                "X-Segment-Duration": "1,2,4,6",
                "X-Prefetch-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "54000",
                "X-Buffer-Strategy": "aggressive",
                "X-Concurrent-Downloads": "4,6,8",
                "X-Prefetch-Segments": "15,20,30",
                "X-Parallel-Segments": "4,6,8",
                "X-Max-Reconnect-Attempts": "UNLIMITED",
                "X-Reconnect-Delay-Ms": "80,120,200",
                "X-Buffer-Underrun-Strategy": "aggressive-refill,adaptive-refill,conservative-refill",
                "Accept-Encoding": "identity",
                "Accept": "application/vnd.apple.mpegurl, application/x-mpegurl, application/x-m3u8, audio/mpegurl, application/octet-stream, */*",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Cache-Control": "no-cache,no-store,max-age=0,max-stale=0",
                "Sec-Fetch-Site": "same-origin,none,cross-site,same-site",
                "X-Color-Depth": "12bit",
                "X-Video-Codecs": "hevc,h265,h.265,vp9,h264,mpeg2",
                "X-Quality-Preference": "codec-hevc,profile-main-12,main-10,tier-high;codec-h265,profile-main-12,main-10,tier-high;codec-h.265,profile-main-12,main-10,tier-high;codec-vp9,profile2,profile0,n/a",
                "User-Agent": "Mozilla/5.0 (SMART-TV; Android 14; SHIELD TV Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,pt;q=0.7",
                "Sec-CH-UA": "\"Google Chrome\";v=\"125\", \"Chromium\";v=\"125\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"Windows\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"125.0.6422.142\"",
                "Sec-CH-UA-Arch": "x86",
                "Sec-CH-UA-Bitness": "64",
                "Sec-CH-UA-Model": "\"\"",
                "Connection": "keep-alive,close",
                "Keep-Alive": "timeout=120, max=1000",
                "Sec-Fetch-Mode": "no-cors,navigate,cors,same-origin",
                "Sec-Fetch-User": "?1,?0",
                "DNT": "1,0",
                "Sec-GPC": "1,0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "1,0", → HTTPS redirect risk
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers,chunked,compress,deflate", → okhttp legacy trailer EOF
                "Pragma": "no-cache,no-store",
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-", → m3u8 manifest is not byte-rangeable
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                "Origin": "https://iptv-ape.duckdns.org",
                "Referer": "https://iptv-ape.duckdns.org/",
                "X-Requested-With": "XMLHttpRequest,fetch,null",
                "X-App-Version": "APE_10.2_ULTIMATE_HDR",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,cmaf,dash",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0, i", → RFC 9218 HTTP/3 over HTTP/1.1 confuses Xtream parsers
                "X-Playback-Rate": "1.0,1.25,1.5",
                "X-Min-Buffer-Time": "10",
                "X-Max-Buffer-Time": "54",
                "X-Request-Priority": "high",
                "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,dts,mp3",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,cloudflare,akamai,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Device-Type": "smart-tv",
                "X-Network-Type": "wifi,ethernet,5g,4g",
                "Accept-Charset": "utf-8, iso-8859-1;q=0.5",
                "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
                "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
                "X-Player-Type": "exoplayer-ultra,vlc-pro",
                "X-Hardware-Decode": "true,adaptive,false",
                "X-Tunneling-Enabled": "off",
                "X-Audio-Track-Selection": "default",
                "X-Subtitle-Track-Selection": "off,auto",
                "X-EPG-Sync": "enabled,adaptive,disabled",
                "X-Catchup-Support": "flussonic-ultra,timeshift,archive",
                "X-Bandwidth-Estimation": "aggressive,adaptive,balanced",
                "X-Initial-Bitrate": "6700000",
                "X-Retry-Count": "20,30,40",
                "X-Retry-Delay-Ms": "80,120,200",
                "X-Connection-Timeout-Ms": "2500,3500,6000",
                "X-Read-Timeout-Ms": "6000,9000,12000",
                "X-Country-Code": "US,GB,ES,DE,FR",
                "X-HDR-Support": "hdr10,dolby-vision,hlg",
                "X-Color-Space": "bt2020",
                "X-Dynamic-Range": "hdr",
                "X-HDR-Transfer-Function": "pq,hlg",
                "X-Color-Primaries": "bt2020",
                "X-Matrix-Coefficients": "bt2020nc",
                "X-Chroma-Subsampling": "4:2:2,4:2:0",
                "X-HEVC-Tier": "HIGH",
                "X-HEVC-Level": "6.1,6.0,5.1,5.0,4.1",
                "X-HEVC-Profile": "MAIN-12,MAIN-10",
                "X-Video-Profile": "main-12,main-10",
                "X-Rate-Control": "VBR,CQP",
                "X-Entropy-Coding": "CABAC",
                "X-Compression-Level": "0",
                "X-Pixel-Format": "yuv420p",
                "X-Max-Resolution": "1920x1080",
                "X-Max-Bitrate": "10700000",
                "X-Frame-Rates": "60,24,25,30,50",
                "X-Aspect-Ratio": "16:9,21:9,4:3",
                "X-Pixel-Aspect-Ratio": "1:1",
                "X-Dolby-Atmos": "true,adaptive,false",
                "X-Audio-Channels": "7.1,5.1,2.0",
                "X-Audio-Sample-Rate": "96000,48000,44100",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "true,adaptive,false",
                "X-Audio-Passthrough": "true,adaptive,false",
                "X-Segment-Preload": "true,adaptive,false",
                "X-Reconnect-On-Error": "true,immediate,adaptive,false",
                "X-Seamless-Failover": "true-ultra,true,adaptive,false",
                "X-Bandwidth-Preference": "unlimited,high,balanced,auto",
                "X-BW-Estimation-Window": "10,15,20",
                "X-BW-Confidence-Threshold": "0.95,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.10,0.15",
                "X-Packet-Loss-Monitor": "enabled,aggressive,adaptive",
                "X-RTT-Monitoring": "enabled,aggressive,adaptive",
                "X-Congestion-Detect": "enabled,aggressive-extreme,adaptive",
                "X-Tone-Mapping": "auto,hdr-to-sdr,sdr-to-hdr,passthrough",
                "X-HDR-Output-Mode": "hdr,auto,tonemap,sdr",
                "X-Buffer-Target": "34000",
                "X-Buffer-Max": "216000",
                "X-Buffer-Min": "10000",
                "X-Network-Caching": "10000",
                "X-Live-Caching": "10000",
                "X-File-Caching": "34000",
                "X-Sharpen-Sigma": "0.03",
                "X-Codec-Support": "hevc,h265,h.265",
                "X-CORTEX-OMEGA-STATE": "ACTIVE_DOMINANT,ACTIVE,STANDBY",
                "X-APE-AI-SR-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,ESRGAN,BICUBIC",
                "X-APE-AI-SR-SCALE": "4,2,1",
                "X-APE-AI-FRAME-INTERPOLATION": "OPTICAL_FLOW_SVFI,RIFE,DISABLED",
                "X-APE-AI-DENOISING": "NLMEANS_HQDN3D_TEMPORAL,NLMEANS,HQDN3D,DISABLED",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE_MAX,ADAPTIVE,STANDARD,DISABLED",
                "X-APE-AI-SHARPENING": "UNSHARP_MASK_ADAPTIVE,UNSHARP_MASK,STANDARD,DISABLED",
                "X-APE-AI-ARTIFACT-REMOVAL": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "AUTO,ENABLED,TONEMAP,OFF",
                "X-APE-AI-SCENE-DETECTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,DISABLED",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_98,VMAF_95,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-PHASE": "4,3,2,1",
                "X-APE-LCEVC-COMPUTE-PRECISION": "FP32,FP16,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS4,LANCZOS3,BICUBIC,BILINEAR",
                "X-APE-LCEVC-ROI-DYNAMIC": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_SIDECAR,DISABLED",
                "X-APE-LCEVC-SDK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,WEBGL,WASM",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "BI_DIRECTIONAL_JS_TUNNEL,UNIDIRECTIONAL,DISABLED",
                "X-APE-LCEVC-SDK-DECODER": "WASM+WEBGL,WASM,NATIVE",
                "X-APE-GPU-DECODE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-RENDER": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-PIPELINE": "DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER,DECODE_LCEVC_AI_SR_TONEMAP_RENDER,DECODE_TONEMAP_RENDER,DECODE_RENDER",
                "X-APE-GPU-PRECISION": "FP32,FP16,INT8",
                "X-APE-GPU-MEMORY-POOL": "VRAM_ONLY,VRAM_SHARED,SYSTEM_RAM",
                "X-APE-GPU-ZERO-COPY": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-VVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "OMEGA_ABSOLUTE,OMEGA,STANDARD",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "TRUE,ADAPTIVE,FALSE",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,HLS_TS,CMAF",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "MORPH_IDENTITY,ROTATE_UA,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,SKIP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "SWARM_EVASION,BACKOFF,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RECONNECT_SILENT,RETRY,FALLBACK",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "NUCLEAR_ESCALATION_NEVER_DOWN,AGGRESSIVE_ESCALATION,ADAPTIVE_ESCALATION,DEFAULT",
                "X-APE-ANTI-CUT-ENGINE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "REAL_TIME,PREDICTIVE,REACTIVE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "AGGRESSIVE,MODERATE,PASSIVE,MONITOR",
                "X-APE-RECONNECT-MAX": "UNLIMITED",
                "X-APE-RECONNECT-SEAMLESS": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IDENTITY-MORPH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "30,60,120,300",
                "X-APE-EVASION-MODE": "SWARM_PHANTOM_HYDRA_STEALTH,PHANTOM_STEALTH,STEALTH,STANDARD",
                "X-APE-EVASION-DNS-OVER-HTTPS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-SNI-OBFUSCATION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVASION-GEO-PHANTOM": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IP-ROTATION-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IP-ROTATION-STRATEGY": "PER_REQUEST,PER_SESSION,PER_CHANNEL",
                "X-APE-STEALTH-UA": "RANDOMIZED,ROTATING,FIXED",
                "X-APE-STEALTH-XFF": "DYNAMIC,ROTATING,FIXED",
                "X-APE-STEALTH-FINGERPRINT": "MUTATING,ROTATING,FIXED",
                "X-APE-SWARM-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-SWARM-PEERS": "20,10,5,1",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-TRANSPORT-CHUNK-SIZE": "200MS,500MS,1000MS,2000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-CACHE-STRATEGY": "PREDICTIVE_NEURAL,ADAPTIVE,LRU,NONE",
                "X-APE-CACHE-SIZE": "1GB,512MB,256MB,128MB",
                "X-APE-CACHE-PREFETCH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE_PREDICTIVE_NEURAL,ADAPTIVE_PREDICTIVE,ADAPTIVE,FIXED",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "30",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-QOS-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-QOS-DSCP": "EF,AF41,AF31,BE",
                "X-APE-QOS-PRIORITY": "7,6,5,4",
                "X-APE-POLYMORPHIC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "TRUE,ADAPTIVE,FALSE",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,FREEZE=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=15000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500"
            },
            "prefetch_config": {
                "strategy": "ULTRA_AGRESIVO",
                "prefetch_segments": 90,
                "parallel_downloads": 40,
                "buffer_target_seconds": 54,
                "min_bandwidth_mbps": 20,
                "adaptive_enabled": true,
                "ai_prediction_enabled": true,
                "continuous_prefetch": true
            },
            "quality_levels": {
                "L1": {
                    "label": "ULTRA_1080P",
                    "condition": "riskScore<=10 AND stallRate<=0.04 AND vfi>=65",
                    "resolution": "1920x1080",
                    "bitrate_mbps": 40,
                    "hdr": "hdr10",
                    "video_filter": "nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full"
                },
                "L2": {
                    "label": "HIGH_720P",
                    "condition": "riskScore<=25 AND stallRate<=0.08 AND vfi>=50",
                    "resolution": "1280x720",
                    "bitrate_mbps": 20,
                    "hdr": "hlg",
                    "video_filter": "hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0"
                },
                "L3": {
                    "label": "STANDARD_480P",
                    "condition": "riskScore<=40 AND stallRate<=0.15 AND vfi>=35",
                    "resolution": "854x480",
                    "bitrate_mbps": 10,
                    "hdr": "sdr",
                    "video_filter": "yadif=mode=0:parity=-1:deint=0"
                },
                "L4": {
                    "label": "LOW_360P",
                    "condition": "riskScore<=60 AND stallRate<=0.25",
                    "resolution": "640x360",
                    "bitrate_mbps": 4,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L5": {
                    "label": "SD_FAILSAFE",
                    "condition": "riskScore<=80",
                    "resolution": "426x240",
                    "bitrate_mbps": 1.5,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L6": {
                    "label": "EMERGENCY",
                    "condition": "ALWAYS_AVAILABLE",
                    "resolution": "426x240",
                    "bitrate_mbps": 0.8,
                    "hdr": "sdr",
                    "video_filter": "",
                    "action": "ACTIVATE_BACKUP_URL"
                },
                "L7": {
                    "label": "AUDIO_ONLY",
                    "condition": "VIDEO_STREAM_FAILED",
                    "resolution": "0x0",
                    "bitrate_mbps": 0.2,
                    "hdr": "none",
                    "video_filter": "",
                    "action": "AUDIO_ONLY_MODE"
                },
                "primary": {
                    "codec": "HEVC",
                    "profile": "MAIN-12,MAIN-10,MAIN,HIGH,BASELINE"
                }
            },
            "headers": {
                "User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.3 TV Safari/538.1,Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Linux; Android 13; BRAVIA 4K GB ATV3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept": "application/vnd.apple.mpegurl,application/x-mpegurl,application/x-m3u8,video/mp4,audio/aac,audio/mpeg,application/octet-stream,*/*",
                "Accept-Encoding": "identity",
                "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.5",
                "Accept-Charset": "utf-8,iso-8859-1;q=0.5,*;q=0.1",
                "Sec-CH-UA": "\"Google Chrome\";v=\"134\",\"Chromium\";v=\"134\",\"Not-A.Brand\";v=\"99\",\"Samsung Internet\";v=\"23\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"SmartTV\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"134.0.6998.89\",\"Samsung Internet\";v=\"23.0.1.1\",\"Chromium\";v=\"134.0.6998.89\"",
                "Sec-CH-UA-Arch": "x86,arm64,arm",
                "Sec-CH-UA-Bitness": "64,32",
                "Sec-CH-UA-Model": "\"SHIELD Android TV\",\"Samsung Smart TV\",\"BRAVIA 4K\",\"\"",
                "Accept-CH": "DPR,Viewport-Width,Width,Device-Memory,RTT,Downlink,ECT,Save-Data",
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=300,max=1000,timeout=120,max=500",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Sec-Fetch-Mode": "no-cors,cors,same-origin,navigate",
                "Sec-Fetch-Site": "same-origin,same-site,cross-site,none",
                "Sec-Fetch-User": "?0,?1",
                "DNT": "0",
                "Sec-GPC": "0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "0", → forces HTTPS redirect on HTTP-only providers
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers", → com.android.okhttp legacy does not support RFC 7230 trailers
                "Cache-Control": "no-cache,max-age=0,must-revalidate,no-store",
                "Pragma": "no-cache",
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-,bytes=0-2097152,bytes=0-1048576,bytes=0-524288",
                "Origin": "https://iptv-ape.duckdns.org,https://localhost,null",
                "Referer": "https://iptv-ape.duckdns.org/,https://localhost/,https://iptv-ape.duckdns.org/player",
                "X-Requested-With": "XMLHttpRequest,com.android.chrome,tv.ottnavigator",
                "X-App-Version": "APE_10.0_OMEGA,APE_9.1_SUPREME,APE_9.0,APE_8.5",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,dash,cmaf,smooth,progressive",
                "X-Quality-Preference": "codec-hevc,profile-main-10,main;codec-h264,high,main;codec-av1,main",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0,i,u=1,i,u=2,u=3", → HTTP/3 priority over /1.1
                "X-Playback-Rate": "1.0,1.25,0.75,1.5",
                "X-Segment-Duration": "2,4,6,8",
                "X-Min-Buffer-Time": "2,4,6,8",
                "X-Max-Buffer-Time": "30,20,15,10",
                "X-Request-Priority": "high,normal,low,background",
                "X-Prefetch-Enabled": "adaptive,true,auto,false",
                "X-Video-Codecs": "hevc,h264,vp9,av1",
                "X-Audio-Codecs": "eac3,ac3,aac,opus,mp3",
                "X-Codec-Support": "hevc,h264,vp9,av1",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,generic,akamai,cloudflare,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "200000,140000,90000,60000",
                "X-Buffer-Target": "100000,70000,45000,30000",
                "X-Buffer-Min": "30000,20000,15000,10000",
                "X-Buffer-Max": "400000,280000,180000,120000",
                "X-Network-Caching": "12000,9000,7000,5000",
                "X-Live-Caching": "9000,7000,5000,3000",
                "X-File-Caching": "30000,20000,15000,10000",
                "X-Device-Type": "smart-tv,android-tv,fire-tv,set-top-box",
                "X-Screen-Resolution": "1920x1080,1280x720,854x480,640x360",
                "X-Network-Type": "ethernet,wifi,5g,4g",
                "X-Buffer-Strategy": "adaptive-predictive,adaptive,balanced,conservative",
                "X-OTT-Navigator-Version": "1.7.0.0-stable,1.6.9.9-stable,1.6.5.0,1.6.0.0",
                "X-Player-Type": "exoplayer,mediaplayer2,vlc,avplayer",
                "X-Hardware-Decode": "auto,preferred,true,false",
                "X-Tunneling-Enabled": "off,false,disabled,auto",
                "X-Audio-Track-Selection": "default,best,auto,first",
                "X-Subtitle-Track-Selection": "off,disabled,none,auto",
                "X-EPG-Sync": "enabled,auto,background,manual",
                "X-Catchup-Support": "flussonic,timeshift,none,auto",
                "X-Bandwidth-Estimation": "balanced,adaptive,conservative,aggressive",
                "X-Initial-Bitrate": "8000000,5000000,3000000,2000000",
                "X-Max-Bitrate": "15000000,10000000,8000000,5000000",
                "X-APE-BITRATE": "10,8,5,3",
                "X-APE-TARGET-BITRATE": "10000000,8000000,5000000,3000000",
                "X-APE-THROUGHPUT-T1": "12,8,5,3",
                "X-APE-THROUGHPUT-T2": "15,10,8,5",
                "X-Retry-Count": "8,6,4,3",
                "X-Retry-Delay-Ms": "250,400,600,800",
                "X-Connection-Timeout-Ms": "3500,4500,6000,7500",
                "X-Read-Timeout-Ms": "8000,10000,12000,14000",
                "X-Country-Code": "ES,US,GB,DE,FR",
                "X-HDR-Support": "hdr10,hlg,sdr",
                "X-Color-Depth": "10bit,8bit",
                "X-Color-Space": "bt709,srgb,bt601",
                "X-Dynamic-Range": "hdr10,hlg,sdr",
                "X-HDR-Transfer-Function": "bt1886,srgb,arib-std-b67,auto",
                "X-Color-Primaries": "bt709,srgb,bt601",
                "X-Matrix-Coefficients": "bt709,bt601",
                "X-Chroma-Subsampling": "4:2:0,4:2:2,4:4:4",
                "X-HEVC-Tier": "HIGH,MAIN",
                "X-HEVC-Level": "4.1,4.0,3.2,3.1",
                "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN,MAIN-STILL-PICTURE",
                "X-Video-Profile": "main-12,main-10,main,high,baseline",
                "X-Rate-Control": "VBR,CBR,CRF,CQP",
                "X-Entropy-Coding": "CABAC,CAVLC",
                "X-Compression-Level": "0,1,2,3",
                "X-Pixel-Format": "yuv420p,nv12,yuv420p10le",
                "X-Sharpen-Sigma": "0.04,0.06,0.08,0.00",
                "X-Max-Resolution": "1920x1080,1280x720,854x480,640x360",
                "X-APE-RESOLUTION": "1920x1080,1280x720,854x480,640x360",
                "X-APE-FPS": "60,50,30,25",
                "X-Frame-Rates": "60,50,30,25",
                "X-Aspect-Ratio": "16:9,21:9,4:3,1:1",
                "X-Pixel-Aspect-Ratio": "1:1,SAR,DAR,AUTO",
                "X-Dolby-Atmos": "auto,enabled,false,off",
                "X-Audio-Channels": "5.1,2.0",
                "X-Audio-Sample-Rate": "48000,44100,32000",
                "X-Audio-Bit-Depth": "16bit",
                "X-Spatial-Audio": "auto,enabled,false,off",
                "X-Audio-Passthrough": "auto,enabled,false,off",
                "X-Parallel-Segments": "3,2,2,1",
                "X-Prefetch-Segments": "6,4,3,2",
                "X-Segment-Preload": "adaptive,auto,true,false",
                "X-Concurrent-Downloads": "3,2,2,1",
                "X-Reconnect-On-Error": "true,adaptive,auto,false",
                "X-Max-Reconnect-Attempts": "10,8,6,4",
                "X-Reconnect-Delay-Ms": "250,400,600,800",
                "X-Buffer-Underrun-Strategy": "adaptive,refill,wait,auto",
                "X-Seamless-Failover": "adaptive,enabled,true,auto",
                "X-Bandwidth-Preference": "balanced,adaptive,conservative,max",
                "X-BW-Estimation-Window": "5,8,10,12",
                "X-BW-Confidence-Threshold": "0.95,0.93,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.08,0.10,0.12",
                "X-Packet-Loss-Monitor": "enabled,real-time,auto,background",
                "X-RTT-Monitoring": "enabled,real-time,auto,background",
                "X-Congestion-Detect": "enabled,adaptive,balanced,auto",
                "X-CORTEX-OMEGA-STATE": "ACTIVE,MONITORING,ADAPTIVE,PASSIVE",
                "X-APE-AI-SR-ENABLED": "AUTO,ENABLED,FALSE,DISABLED",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,LANCZOS,BICUBIC,NONE",
                "X-APE-AI-SR-SCALE": "2,1,4,0",
                "X-APE-AI-FRAME-INTERPOLATION": "NONE,RIFE_4.6,DAIN,AUTO",
                "X-APE-AI-DENOISING": "NLMEANS,HQDN3D,LOW,NONE",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE,STANDARD,LOW,NONE",
                "X-APE-AI-SHARPENING": "LOW,UNSHARP_MASK,CAS,NONE",
                "X-APE-AI-ARTIFACT-REMOVAL": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "DISABLED,AUTO,OFF,NONE",
                "X-APE-AI-SCENE-DETECTION": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,NONE,AUTO",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_95,VMAF_93,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-PHASE": "2,1,3,0",
                "X-APE-LCEVC-COMPUTE-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS3,BICUBIC,BILINEAR,AUTO",
                "X-APE-LCEVC-ROI-DYNAMIC": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_FMP4,HLS_TS,AUTO",
                "X-APE-LCEVC-SDK-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,ANDROID_TV,TIZEN,WEBOS",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "AUTO,NATIVE,JS_TUNNEL,OFF",
                "X-APE-LCEVC-SDK-DECODER": "AUTO,NATIVE,WASM,WEBGL",
                "X-APE-GPU-DECODE": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-RENDER": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-PIPELINE": "DECODE_TONEMAP_RENDER,DECODE_RENDER,DECODE_DENOISE_RENDER,AUTO",
                "X-APE-GPU-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-GPU-MEMORY-POOL": "AUTO,SHARED,VRAM_ONLY,SYSTEM",
                "X-APE-GPU-ZERO-COPY": "AUTO,PREFERRED,ENABLED,DISABLED",
                "X-APE-VVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-EVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,AUTO,ENABLED,PREFERRED",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "STANDARD,COMPATIBILITY,SAFE,AUTO",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "AUTO,FALSE,DISABLED,OFF",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,CMAF,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_TS,HLS_FMP4,MPEG_TS,PROGRESSIVE",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "RETRY,BACKOFF,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,BACKOFF,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "BACKOFF,RETRY,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RETRY,BACKOFF,FALLBACK_ORIGIN,RECONNECT",
                "X-APE-ANTI-CUT-ENGINE": "ADAPTIVE,ENABLED,AUTO,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "ADAPTIVE,REAL_TIME,AUTO,DISABLED",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "BALANCED,ADAPTIVE,CONSERVATIVE,AUTO",
                "X-APE-RECONNECT-MAX": "10,8,6,4",
                "X-APE-RECONNECT-SEAMLESS": "AUTO,ADAPTIVE,TRUE,FALSE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-MORPH": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "0,0,0,0",
                "X-APE-EVASION-MODE": "DISABLED,OFF,NONE,PASSIVE",
                "X-APE-EVASION-DNS-OVER-HTTPS": "AUTO,DISABLED,OFF,NONE",
                "X-APE-EVASION-SNI-OBFUSCATION": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-EVASION-GEO-PHANTOM": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IP-ROTATION-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-IP-ROTATION-STRATEGY": "PER_SESSION,STATIC,NONE,AUTO",
                "X-APE-STEALTH-UA": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-STEALTH-XFF": "STATIC,OFF,NONE,DEFAULT",
                "X-APE-STEALTH-FINGERPRINT": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-SWARM-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-SWARM-PEERS": "0,0,0,0",
                "X-APE-POLYMORPHIC-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,PROGRESSIVE",
                "X-APE-TRANSPORT-CHUNK-SIZE": "500MS,1000MS,1500MS,2000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,PROGRESSIVE,MPEG_TS",
                "X-APE-CACHE-STRATEGY": "ADAPTIVE,PREDICTIVE,BALANCED,CONSERVATIVE",
                "X-APE-CACHE-SIZE": "256MB,128MB,64MB,32MB",
                "X-APE-CACHE-PREFETCH": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE,BALANCED,CONSERVATIVE,AUTO",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "6,4,3,2",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,AUTO,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "DISABLED,AUTO,OFF,NONE",
                "X-APE-QOS-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-QOS-DSCP": "CS0,AF31,AF21,BE",
                "X-APE-QOS-PRIORITY": "3,2,1,0",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=INFO",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,RINGING=DETECT,MOSQUITO=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=5000,MAX=30000,TARGET=15000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500,KEYFRAME_FORCE=FALSE",
                "X-APE-CODEC": "HEVC,H264,VP9,AV1",
                "X-ExoPlayer-Buffer-Min": "30000,20000,15000,10000",
                "X-Manifest-Refresh": "15000,20000,30000,45000",
                "X-KODI-LIVE-DELAY": "30,20,15,10",
                "X-APE-STRATEGY": "adaptive,balanced,conservative,auto",
                "X-APE-Prefetch-Segments": "6,4,3,2",
                "X-APE-Quality-Threshold": "0.97,0.95,0.93,0.90",
                "X-Tone-Mapping": "auto,passthrough,hdr-to-sdr,none",
                "X-HDR-Output-Mode": "auto,native,sdr,force-hdr",
                "X-Platform": "android,linux,webos,tizen",
                "X-Deinterlace-Mode": "auto,bob,yadif,off",
                "X-Error-Concealment": "adaptive,enabled,auto,disabled",
                "X-Low-Latency-Mode": "auto,enabled,disabled,off",
                "X-ABR-Algorithm": "adaptive,bandwidth,buffer,hybrid",
                "X-Startup-Quality": "medium,auto,low,min",
                "X-Quality-Switch-Mode": "seamless,auto,instant,none",
                "X-Max-Startup-Delay-Ms": "3500,4500,5500,6500",
                "X-Seek-Tolerance-Ms": "500,1000,1500,2000",
                "X-Gap-Policy": "skip,fill,wait,error",
                "X-Credential-Lock": "none,auto,disabled,off",
                "X-Token-Refresh": "auto,enabled,disabled,off"
            }
        },

        "P4": {
            "id": "P4",
            "name": "HIGH_HD_COMPATIBLE",
            "level": 2,
            "quality": "HD",
            "description": "HIGH HD — 720p con máxima compatibilidad de dispositivos",
            "color": "#0891b2",
            "settings": {
                "resolution": "1280x720",
                "buffer": 10000,
                "strategy": "balanced",
                "bitrate": 5.0,
                "t1": 6.0,
                "t2": 8.0,
                "playerBuffer": 20000,
                "fps": 30,
                "codec": "H264",
                "headersCount": 233,
                "bufferSeconds": 10,
                "focus": "HIGH_720P_BALANCEADO_SIN_CORTES",
                "hdr_canonical": "sdr",
                "nits_target": 8000,
                "codec_chain_video": "hvc1.1.6.L93.B0,hev1.1.6.L93.B0,avc1.640020,avc1.4D401F,avc1.42E01F",
                "codec_chain_audio": "mp4a.40.2,mp4a.40.5,mp4a.40.29",
                "codec_chain_hdr": "sdr",
                "codec_chain_player_pref": "hvc1,hev1,h265,avc1,h264",
                "codec_chain_video_family": "HEVC-MAIN-HD>H264-HIGH>H264-MAIN>H264-BASELINE"
            },
            "vlcopt": {
                "network-caching": "10000",
                "clock-jitter": "1000",
                "clock-synchro": "1",
                "live-caching": "7000",
                "file-caching": "20000",
                "http-user-agent": "Mozilla/5.0 APE-720P_BALANCED_HIGH",
                "http-referer": "auto",
                "http-forward-cookies": "true",
                "http-reconnect": "true",
                "http-continuous-stream": "true",
                "http-max-retries": "6",
                "http-timeout": "9000",
                "video-color-space": "BT709",
                "video-transfer-function": "BT1886",
                "video-color-primaries": "BT709",
                "video-color-range": "limited,full",
                "tone-mapping": "auto",
                "hdr-output-mode": "auto",
                "sharpen-sigma": "0.02",
                "contrast": "1.01",
                "brightness": "1.0",
                "saturation": "1.02",
                "gamma": "1.0",
                "video-filter": "hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0",
                "audio-codec-priority": "aac",
                "adaptive-logic": "highest",
                "adaptive-maxwidth": "1280",
                "adaptive-maxheight": "720",
                "demux": "hls"
            },
            "kodiprop": {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.min_bandwidth": "2500000",
                "inputstream.adaptive.max_bandwidth": "4000000",
                "inputstream.adaptive.preferred_video_resolution": "720",
                "inputstream.adaptive.chooser_bandwidth_max": "4000000",
                "inputstream.adaptive.media_renewal_time": "60",
                "inputstream.adaptive.manifest_config": "{\"buffer_assured_duration\":60,\"buffer_max_duration\":120,\"connect_timeout\":15,\"read_timeout\":60,\"retry_count\":99,\"reconnect\":true,\"chunk_size\":1048576}"
            },
            "enabledCategories": [
                "identity",
                "connection",
                "cache",
                "cors",
                "ape_core",
                "anti_freeze",
                "abr_control",
                "streaming_control",
                "hdr_color",
                "resolution_advanced",
                "parallel_download",
                "ott_navigator",
                "extra",
                "metadata",
                "cdn",
                "codecs",
                "hlsjs_engine",
                "playback",
                "security",
                "audio_premium",
                "omega_ai_cortex",
                "omega_lcevc",
                "omega_hardware",
                "omega_resilience",
                "omega_stealth",
                "omega_transport",
                "omega_qos"
            ],
            "headerOverrides": {
                "X-ExoPlayer-Buffer-Min": "34000",
                "X-Manifest-Refresh": "34000",
                "X-KODI-LIVE-DELAY": "34",
                "X-APE-CODEC": "VP9",
                "X-APE-RESOLUTION": "1280x720",
                "X-APE-FPS": "60",
                "X-Screen-Resolution": "1280x720",
                "X-APE-BITRATE": "3",
                "X-APE-TARGET-BITRATE": "3000",
                "X-APE-THROUGHPUT-T1": "3.9",
                "X-APE-THROUGHPUT-T2": "4.8",
                "X-APE-STRATEGY": "aggressive",
                "X-APE-Prefetch-Segments": "20",
                "X-APE-Quality-Threshold": "0.97",
                "X-Segment-Duration": "1,2,4,6",
                "X-Prefetch-Enabled": "true,adaptive,auto,false",
                "X-BW-Estimation-Window": "10,15,20",
                "X-Max-Reconnect-Attempts": "UNLIMITED",
                "X-Buffer-Size": "54000",
                "X-Min-Buffer-Time": "10",
                "Referer": "https://iptv-ape.duckdns.org/",
                "Origin": "https://iptv-ape.duckdns.org",
                "X-Prefetch-Segments": "12,15,20",
                "X-Concurrent-Downloads": "4,6,8",
                "X-Parallel-Segments": "4,6,8",
                "X-Reconnect-Delay-Ms": "100,150,250",
                "X-Buffer-Underrun-Strategy": "aggressive-refill,adaptive-refill,conservative-refill",
                "Accept-Encoding": "identity",
                "Accept": "application/vnd.apple.mpegurl, application/x-mpegurl, application/x-m3u8, audio/mpegurl, application/octet-stream, */*",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Cache-Control": "no-cache,no-store,max-age=0,max-stale=0",
                "Sec-Fetch-Site": "same-origin,none,cross-site,same-site",
                "X-Buffer-Strategy": "adaptive",
                "X-Color-Depth": "12bit",
                "X-Video-Codecs": "hevc,h265,h.265,vp9,h264,mpeg2",
                "X-Quality-Preference": "codec-hevc,profile-main-12,main-10,tier-high;codec-h265,profile-main-12,main-10,tier-high;codec-h.265,profile-main-12,main-10,tier-high;codec-vp9,profile2,profile0,n/a",
                "User-Agent": "Mozilla/5.0 (SMART-TV; Tizen 7.0; Samsung QN65QN85B) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.1 Safari/538.1",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,pt;q=0.7",
                "Sec-CH-UA": "\"Google Chrome\";v=\"125\", \"Chromium\";v=\"125\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"Windows\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"125.0.6422.142\"",
                "Sec-CH-UA-Arch": "x86",
                "Sec-CH-UA-Bitness": "64",
                "Sec-CH-UA-Model": "\"\"",
                "Connection": "keep-alive,close",
                "Keep-Alive": "timeout=120, max=1000",
                "Sec-Fetch-Mode": "no-cors,navigate,cors,same-origin",
                "Sec-Fetch-User": "?1,?0",
                "DNT": "1,0",
                "Sec-GPC": "1,0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "1,0", → HTTPS redirect risk
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers,chunked,compress,deflate", → okhttp legacy trailer EOF
                "Pragma": "no-cache,no-store",
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-", → m3u8 manifest is not byte-rangeable
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                "X-Requested-With": "XMLHttpRequest,fetch,null",
                "X-App-Version": "APE_10.2_ULTIMATE_HDR",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,cmaf,dash",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0, i", → RFC 9218 HTTP/3 over HTTP/1.1 confuses Xtream parsers
                "X-Playback-Rate": "1.0,1.25,1.5",
                "X-Max-Buffer-Time": "54",
                "X-Request-Priority": "medium",
                "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,dts,mp3",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,cloudflare,akamai,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Device-Type": "smart-tv",
                "X-Network-Type": "wifi,ethernet,5g,4g",
                "Accept-Charset": "utf-8, iso-8859-1;q=0.5",
                "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
                "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
                "X-Player-Type": "exoplayer,vlc",
                "X-Hardware-Decode": "true,adaptive,false",
                "X-Tunneling-Enabled": "off",
                "X-Audio-Track-Selection": "highest-quality",
                "X-Subtitle-Track-Selection": "off,auto",
                "X-EPG-Sync": "enabled,adaptive,disabled",
                "X-Catchup-Support": "flussonic-ultra,timeshift,archive",
                "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
                "X-Initial-Bitrate": "3000000",
                "X-Retry-Count": "15,20,30",
                "X-Retry-Delay-Ms": "100,150,250",
                "X-Connection-Timeout-Ms": "2500,3500,6000",
                "X-Read-Timeout-Ms": "6000,9000,12000",
                "X-Country-Code": "US,GB,ES,DE,FR",
                "X-HDR-Support": "hdr10,hlg",
                "X-Color-Space": "bt2020,bt709",
                "X-Dynamic-Range": "hdr,sdr",
                "X-HDR-Transfer-Function": "pq,hlg",
                "X-Color-Primaries": "bt2020,bt709",
                "X-Matrix-Coefficients": "bt2020nc,bt709",
                "X-Chroma-Subsampling": "4:2:0",
                "X-HEVC-Tier": "HIGH",
                "X-HEVC-Level": "6.1,6.0,5.1,5.0,4.1",
                "X-HEVC-Profile": "MAIN-12,MAIN-10",
                "X-Video-Profile": "main-12,main-10",
                "X-Rate-Control": "VBR",
                "X-Entropy-Coding": "CABAC",
                "X-Compression-Level": "1",
                "X-Pixel-Format": "yuv420p",
                "X-Max-Resolution": "1280x720",
                "X-Max-Bitrate": "4800000",
                "X-Frame-Rates": "60,24,25,30,50",
                "X-Aspect-Ratio": "16:9,21:9,4:3",
                "X-Pixel-Aspect-Ratio": "1:1",
                "X-Dolby-Atmos": "true,adaptive,false",
                "X-Audio-Channels": "7.1,5.1,2.0",
                "X-Audio-Sample-Rate": "96000,48000,44100",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "true,adaptive,false",
                "X-Audio-Passthrough": "true,adaptive,false",
                "X-Segment-Preload": "true,adaptive,false",
                "X-Reconnect-On-Error": "true,immediate,adaptive,false",
                "X-Seamless-Failover": "true-ultra,true,adaptive,false",
                "X-Bandwidth-Preference": "unlimited,high,balanced,auto",
                "X-BW-Confidence-Threshold": "0.95,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.10,0.15",
                "X-Packet-Loss-Monitor": "enabled,aggressive,adaptive",
                "X-RTT-Monitoring": "enabled,aggressive,adaptive",
                "X-Congestion-Detect": "enabled,aggressive-extreme,adaptive",
                "X-Tone-Mapping": "auto,hdr-to-sdr,sdr-to-hdr,passthrough",
                "X-HDR-Output-Mode": "hdr,auto,tonemap,sdr",
                "X-Buffer-Target": "34000",
                "X-Buffer-Max": "216000",
                "X-Buffer-Min": "10000",
                "X-Network-Caching": "10000",
                "X-Live-Caching": "10000",
                "X-File-Caching": "34000",
                "X-Sharpen-Sigma": "0.04",
                "X-Codec-Support": "hevc,h265,h.265",
                "X-CORTEX-OMEGA-STATE": "ACTIVE_DOMINANT,ACTIVE,STANDBY",
                "X-APE-AI-SR-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,ESRGAN,BICUBIC",
                "X-APE-AI-SR-SCALE": "4,2,1",
                "X-APE-AI-FRAME-INTERPOLATION": "OPTICAL_FLOW_SVFI,RIFE,DISABLED",
                "X-APE-AI-DENOISING": "NLMEANS_HQDN3D_TEMPORAL,NLMEANS,HQDN3D,DISABLED",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE_MAX,ADAPTIVE,STANDARD,DISABLED",
                "X-APE-AI-SHARPENING": "UNSHARP_MASK_ADAPTIVE,UNSHARP_MASK,STANDARD,DISABLED",
                "X-APE-AI-ARTIFACT-REMOVAL": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "AUTO,ENABLED,TONEMAP,OFF",
                "X-APE-AI-SCENE-DETECTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,DISABLED",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_98,VMAF_95,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-PHASE": "4,3,2,1",
                "X-APE-LCEVC-COMPUTE-PRECISION": "FP32,FP16,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS4,LANCZOS3,BICUBIC,BILINEAR",
                "X-APE-LCEVC-ROI-DYNAMIC": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_SIDECAR,DISABLED",
                "X-APE-LCEVC-SDK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,WEBGL,WASM",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "BI_DIRECTIONAL_JS_TUNNEL,UNIDIRECTIONAL,DISABLED",
                "X-APE-LCEVC-SDK-DECODER": "WASM+WEBGL,WASM,NATIVE",
                "X-APE-GPU-DECODE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-RENDER": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-PIPELINE": "DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER,DECODE_LCEVC_AI_SR_TONEMAP_RENDER,DECODE_TONEMAP_RENDER,DECODE_RENDER",
                "X-APE-GPU-PRECISION": "FP32,FP16,INT8",
                "X-APE-GPU-MEMORY-POOL": "VRAM_ONLY,VRAM_SHARED,SYSTEM_RAM",
                "X-APE-GPU-ZERO-COPY": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-VVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "OMEGA_ABSOLUTE,OMEGA,STANDARD",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "TRUE,ADAPTIVE,FALSE",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,HLS_TS,CMAF",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "MORPH_IDENTITY,ROTATE_UA,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,SKIP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "SWARM_EVASION,BACKOFF,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RECONNECT_SILENT,RETRY,FALLBACK",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "NUCLEAR_ESCALATION_NEVER_DOWN,AGGRESSIVE_ESCALATION,ADAPTIVE_ESCALATION,DEFAULT",
                "X-APE-ANTI-CUT-ENGINE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "REAL_TIME,PREDICTIVE,REACTIVE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "MODERATE,PASSIVE,MONITOR,OFF",
                "X-APE-RECONNECT-MAX": "UNLIMITED",
                "X-APE-RECONNECT-SEAMLESS": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IDENTITY-MORPH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "30,60,120,300",
                "X-APE-EVASION-MODE": "SWARM_PHANTOM_HYDRA_STEALTH,PHANTOM_STEALTH,STEALTH,STANDARD",
                "X-APE-EVASION-DNS-OVER-HTTPS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-SNI-OBFUSCATION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVASION-GEO-PHANTOM": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IP-ROTATION-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IP-ROTATION-STRATEGY": "PER_REQUEST,PER_SESSION,PER_CHANNEL",
                "X-APE-STEALTH-UA": "RANDOMIZED,ROTATING,FIXED",
                "X-APE-STEALTH-XFF": "DYNAMIC,ROTATING,FIXED",
                "X-APE-STEALTH-FINGERPRINT": "MUTATING,ROTATING,FIXED",
                "X-APE-SWARM-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-SWARM-PEERS": "20,10,5,1",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-TRANSPORT-CHUNK-SIZE": "200MS,500MS,1000MS,2000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-CACHE-STRATEGY": "PREDICTIVE_NEURAL,ADAPTIVE,LRU,NONE",
                "X-APE-CACHE-SIZE": "1GB,512MB,256MB,128MB",
                "X-APE-CACHE-PREFETCH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE_PREDICTIVE_NEURAL,ADAPTIVE_PREDICTIVE,ADAPTIVE,FIXED",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "20",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-QOS-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-QOS-DSCP": "EF,AF41,AF31,BE",
                "X-APE-QOS-PRIORITY": "7,6,5,4",
                "X-APE-POLYMORPHIC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "TRUE,ADAPTIVE,FALSE",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,FREEZE=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=12000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500"
            },
            "prefetch_config": {
                "strategy": "ULTRA_AGRESIVO",
                "prefetch_segments": 90,
                "parallel_downloads": 40,
                "buffer_target_seconds": 54,
                "min_bandwidth_mbps": 9,
                "adaptive_enabled": true,
                "ai_prediction_enabled": true,
                "continuous_prefetch": true
            },
            "quality_levels": {
                "L1": {
                    "label": "HIGH_720P",
                    "condition": "riskScore<=15 AND stallRate<=0.06 AND vfi>=55",
                    "resolution": "1280x720",
                    "bitrate_mbps": 20,
                    "hdr": "hlg",
                    "video_filter": "hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0"
                },
                "L2": {
                    "label": "STANDARD_480P",
                    "condition": "riskScore<=30 AND stallRate<=0.12 AND vfi>=40",
                    "resolution": "854x480",
                    "bitrate_mbps": 10,
                    "hdr": "sdr",
                    "video_filter": "yadif=mode=0:parity=-1:deint=0"
                },
                "L3": {
                    "label": "LOW_360P",
                    "condition": "riskScore<=50 AND stallRate<=0.22",
                    "resolution": "640x360",
                    "bitrate_mbps": 4,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L4": {
                    "label": "SD_FAILSAFE",
                    "condition": "riskScore<=70",
                    "resolution": "426x240",
                    "bitrate_mbps": 1.5,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L5": {
                    "label": "EMERGENCY",
                    "condition": "ALWAYS_AVAILABLE",
                    "resolution": "426x240",
                    "bitrate_mbps": 0.8,
                    "hdr": "sdr",
                    "video_filter": "",
                    "action": "ACTIVATE_BACKUP_URL"
                },
                "L6": {
                    "label": "AUDIO_ONLY",
                    "condition": "VIDEO_STREAM_FAILED",
                    "resolution": "0x0",
                    "bitrate_mbps": 0.2,
                    "hdr": "none",
                    "video_filter": "",
                    "action": "AUDIO_ONLY_MODE"
                },
                "L7": {
                    "label": "RECONNECT",
                    "condition": "ALL_STREAMS_FAILED",
                    "resolution": "0x0",
                    "bitrate_mbps": 0,
                    "hdr": "none",
                    "video_filter": "",
                    "action": "FORCE_RECONNECT_30S"
                },
                "primary": {
                    "codec": "H264",
                    "profile": "MAIN-12,MAIN-10,MAIN,HIGH,BASELINE"
                }
            },
            "headers": {
                "User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.3 TV Safari/538.1,Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Linux; Android 13; BRAVIA 4K GB ATV3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept": "application/vnd.apple.mpegurl,application/x-mpegurl,application/x-m3u8,video/mp4,audio/aac,audio/mpeg,application/octet-stream,*/*",
                "Accept-Encoding": "identity",
                "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.5",
                "Accept-Charset": "utf-8,iso-8859-1;q=0.5,*;q=0.1",
                "Sec-CH-UA": "\"Google Chrome\";v=\"134\",\"Chromium\";v=\"134\",\"Not-A.Brand\";v=\"99\",\"Samsung Internet\";v=\"23\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"SmartTV\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"134.0.6998.89\",\"Samsung Internet\";v=\"23.0.1.1\",\"Chromium\";v=\"134.0.6998.89\"",
                "Sec-CH-UA-Arch": "x86,arm64,arm",
                "Sec-CH-UA-Bitness": "64,32",
                "Sec-CH-UA-Model": "\"SHIELD Android TV\",\"Samsung Smart TV\",\"BRAVIA 4K\",\"\"",
                "Accept-CH": "DPR,Viewport-Width,Width,Device-Memory,RTT,Downlink,ECT,Save-Data",
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=300,max=1000,timeout=120,max=500",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Sec-Fetch-Mode": "no-cors,cors,same-origin,navigate",
                "Sec-Fetch-Site": "same-origin,same-site,cross-site,none",
                "Sec-Fetch-User": "?0,?1",
                "DNT": "0",
                "Sec-GPC": "0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "0", → forces HTTPS redirect on HTTP-only providers
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers", → com.android.okhttp legacy does not support RFC 7230 trailers
                "Cache-Control": "no-cache,max-age=0,must-revalidate,no-store",
                "Pragma": "no-cache",
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-,bytes=0-2097152,bytes=0-1048576,bytes=0-524288",
                "Origin": "https://iptv-ape.duckdns.org,https://localhost,null",
                "Referer": "https://iptv-ape.duckdns.org/,https://localhost/,https://iptv-ape.duckdns.org/player",
                "X-Requested-With": "XMLHttpRequest,com.android.chrome,tv.ottnavigator",
                "X-App-Version": "APE_10.0_OMEGA,APE_9.1_SUPREME,APE_9.0,APE_8.5",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,dash,cmaf,smooth,progressive",
                "X-Quality-Preference": "codec-h264,profile-high,main,baseline;codec-hevc,main-10,main",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0,i,u=1,i,u=2,u=3", → HTTP/3 priority over /1.1
                "X-Playback-Rate": "1.0,1.25,0.75,1.5",
                "X-Segment-Duration": "2,4,6,8",
                "X-Min-Buffer-Time": "2,4,6,8",
                "X-Max-Buffer-Time": "25,18,12,8",
                "X-Request-Priority": "high,normal,low,background",
                "X-Prefetch-Enabled": "adaptive,true,auto,false",
                "X-Video-Codecs": "h264,hevc,vp9,mpeg2",
                "X-Audio-Codecs": "aac,ac3,mp3,opus",
                "X-Codec-Support": "h264,hevc,vp9,mpeg2",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,generic,akamai,cloudflare,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "120000,90000,60000,40000",
                "X-Buffer-Target": "60000,40000,30000,20000",
                "X-Buffer-Min": "20000,15000,10000,8000",
                "X-Buffer-Max": "250000,180000,120000,80000",
                "X-Network-Caching": "10000,8000,6000,4000",
                "X-Live-Caching": "7000,5000,4000,3000",
                "X-File-Caching": "20000,15000,12000,8000",
                "X-Device-Type": "smart-tv,android-tv,fire-tv,set-top-box",
                "X-Screen-Resolution": "1280x720,854x480,640x360,426x240",
                "X-Network-Type": "ethernet,wifi,5g,4g",
                "X-Buffer-Strategy": "adaptive-predictive,adaptive,balanced,conservative",
                "X-OTT-Navigator-Version": "1.7.0.0-stable,1.6.9.9-stable,1.6.5.0,1.6.0.0",
                "X-Player-Type": "exoplayer,mediaplayer2,vlc,avplayer",
                "X-Hardware-Decode": "auto,preferred,true,false",
                "X-Tunneling-Enabled": "off,false,disabled,auto",
                "X-Audio-Track-Selection": "default,best,auto,first",
                "X-Subtitle-Track-Selection": "off,disabled,none,auto",
                "X-EPG-Sync": "enabled,auto,background,manual",
                "X-Catchup-Support": "flussonic,timeshift,none,auto",
                "X-Bandwidth-Estimation": "balanced,adaptive,conservative,aggressive",
                "X-Initial-Bitrate": "3000000,2000000,1500000,1000000",
                "X-Max-Bitrate": "8000000,5000000,3000000,2000000",
                "X-APE-BITRATE": "5,3,2,1.5",
                "X-APE-TARGET-BITRATE": "5000000,3000000,2000000,1500000",
                "X-APE-THROUGHPUT-T1": "6,4,2.5,1.5",
                "X-APE-THROUGHPUT-T2": "8,5,3,2",
                "X-Retry-Count": "6,5,4,3",
                "X-Retry-Delay-Ms": "300,500,700,900",
                "X-Connection-Timeout-Ms": "4000,5000,6500,8000",
                "X-Read-Timeout-Ms": "9000,11000,13000,15000",
                "X-Country-Code": "ES,US,GB,DE,FR",
                "X-HDR-Support": "sdr,hlg",
                "X-Color-Depth": "8bit",
                "X-Color-Space": "bt709,bt601,srgb",
                "X-Dynamic-Range": "sdr,hlg",
                "X-HDR-Transfer-Function": "bt1886,srgb,auto",
                "X-Color-Primaries": "bt709,bt601,srgb",
                "X-Matrix-Coefficients": "bt709,bt601",
                "X-Chroma-Subsampling": "4:2:0,4:2:2,4:4:4",
                "X-HEVC-Tier": "HIGH,MAIN",
                "X-HEVC-Level": "4.0,3.2,3.1,3.0",
                "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN,MAIN-STILL-PICTURE",
                "X-Video-Profile": "main-12,main-10,main,high,baseline",
                "X-Rate-Control": "VBR,CBR,CRF,CQP",
                "X-Entropy-Coding": "CABAC,CAVLC",
                "X-Compression-Level": "0,1,2,3",
                "X-Pixel-Format": "yuv420p,nv12",
                "X-Sharpen-Sigma": "0.04,0.06,0.08,0.00",
                "X-Max-Resolution": "1280x720,854x480,640x360,426x240",
                "X-APE-RESOLUTION": "1280x720,854x480,640x360,426x240",
                "X-APE-FPS": "30,25,24,50",
                "X-Frame-Rates": "30,25,24,50",
                "X-Aspect-Ratio": "16:9,21:9,4:3,1:1",
                "X-Pixel-Aspect-Ratio": "1:1,SAR,DAR,AUTO",
                "X-Dolby-Atmos": "auto,enabled,false,off",
                "X-Audio-Channels": "2.0,5.1",
                "X-Audio-Sample-Rate": "44100,32000",
                "X-Audio-Bit-Depth": "16bit",
                "X-Spatial-Audio": "auto,enabled,false,off",
                "X-Audio-Passthrough": "auto,enabled,false,off",
                "X-Parallel-Segments": "2,2,1,1",
                "X-Prefetch-Segments": "4,3,2,1",
                "X-Segment-Preload": "adaptive,auto,true,false",
                "X-Concurrent-Downloads": "2,2,1,1",
                "X-Reconnect-On-Error": "true,adaptive,auto,false",
                "X-Max-Reconnect-Attempts": "8,6,4,3",
                "X-Reconnect-Delay-Ms": "300,500,700,900",
                "X-Buffer-Underrun-Strategy": "adaptive,refill,wait,auto",
                "X-Seamless-Failover": "adaptive,enabled,true,auto",
                "X-Bandwidth-Preference": "balanced,adaptive,conservative,max",
                "X-BW-Estimation-Window": "5,8,10,12",
                "X-BW-Confidence-Threshold": "0.95,0.93,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.08,0.10,0.12",
                "X-Packet-Loss-Monitor": "enabled,real-time,auto,background",
                "X-RTT-Monitoring": "enabled,real-time,auto,background",
                "X-Congestion-Detect": "enabled,adaptive,balanced,auto",
                "X-CORTEX-OMEGA-STATE": "ACTIVE,MONITORING,ADAPTIVE,PASSIVE",
                "X-APE-AI-SR-ENABLED": "AUTO,ENABLED,FALSE,DISABLED",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,LANCZOS,BICUBIC,NONE",
                "X-APE-AI-SR-SCALE": "2,1,4,0",
                "X-APE-AI-FRAME-INTERPOLATION": "NONE,RIFE_4.6,DAIN,AUTO",
                "X-APE-AI-DENOISING": "NLMEANS,HQDN3D,LOW,NONE",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE,STANDARD,LOW,NONE",
                "X-APE-AI-SHARPENING": "LOW,UNSHARP_MASK,CAS,NONE",
                "X-APE-AI-ARTIFACT-REMOVAL": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "DISABLED,AUTO,OFF,NONE",
                "X-APE-AI-SCENE-DETECTION": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,NONE,AUTO",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_95,VMAF_93,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-PHASE": "2,1,3,0",
                "X-APE-LCEVC-COMPUTE-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS3,BICUBIC,BILINEAR,AUTO",
                "X-APE-LCEVC-ROI-DYNAMIC": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_FMP4,HLS_TS,AUTO",
                "X-APE-LCEVC-SDK-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,ANDROID_TV,TIZEN,WEBOS",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "AUTO,NATIVE,JS_TUNNEL,OFF",
                "X-APE-LCEVC-SDK-DECODER": "AUTO,NATIVE,WASM,WEBGL",
                "X-APE-GPU-DECODE": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-RENDER": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-PIPELINE": "DECODE_TONEMAP_RENDER,DECODE_RENDER,DECODE_DENOISE_RENDER,AUTO",
                "X-APE-GPU-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-GPU-MEMORY-POOL": "AUTO,SHARED,VRAM_ONLY,SYSTEM",
                "X-APE-GPU-ZERO-COPY": "AUTO,PREFERRED,ENABLED,DISABLED",
                "X-APE-VVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-EVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,AUTO,ENABLED,PREFERRED",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "STANDARD,COMPATIBILITY,SAFE,AUTO",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "AUTO,FALSE,DISABLED,OFF",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,CMAF,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_TS,HLS_FMP4,MPEG_TS,PROGRESSIVE",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "RETRY,BACKOFF,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,BACKOFF,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "BACKOFF,RETRY,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RETRY,BACKOFF,FALLBACK_ORIGIN,RECONNECT",
                "X-APE-ANTI-CUT-ENGINE": "ADAPTIVE,ENABLED,AUTO,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "ADAPTIVE,REAL_TIME,AUTO,DISABLED",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "BALANCED,ADAPTIVE,CONSERVATIVE,AUTO",
                "X-APE-RECONNECT-MAX": "8,6,4,3",
                "X-APE-RECONNECT-SEAMLESS": "AUTO,ADAPTIVE,TRUE,FALSE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-MORPH": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "0,0,0,0",
                "X-APE-EVASION-MODE": "DISABLED,OFF,NONE,PASSIVE",
                "X-APE-EVASION-DNS-OVER-HTTPS": "AUTO,DISABLED,OFF,NONE",
                "X-APE-EVASION-SNI-OBFUSCATION": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-EVASION-GEO-PHANTOM": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IP-ROTATION-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-IP-ROTATION-STRATEGY": "PER_SESSION,STATIC,NONE,AUTO",
                "X-APE-STEALTH-UA": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-STEALTH-XFF": "STATIC,OFF,NONE,DEFAULT",
                "X-APE-STEALTH-FINGERPRINT": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-SWARM-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-SWARM-PEERS": "0,0,0,0",
                "X-APE-POLYMORPHIC-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,PROGRESSIVE",
                "X-APE-TRANSPORT-CHUNK-SIZE": "1000MS,1500MS,2000MS,3000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,PROGRESSIVE,MPEG_TS",
                "X-APE-CACHE-STRATEGY": "ADAPTIVE,PREDICTIVE,BALANCED,CONSERVATIVE",
                "X-APE-CACHE-SIZE": "128MB,64MB,32MB,16MB",
                "X-APE-CACHE-PREFETCH": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE,BALANCED,CONSERVATIVE,AUTO",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "4,3,2,1",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,AUTO,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "DISABLED,AUTO,OFF,NONE",
                "X-APE-QOS-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-QOS-DSCP": "CS0,AF31,AF21,BE",
                "X-APE-QOS-PRIORITY": "3,2,1,0",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=INFO",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,RINGING=DETECT,MOSQUITO=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=5000,MAX=30000,TARGET=15000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500,KEYFRAME_FORCE=FALSE",
                "X-APE-CODEC": "H264,HEVC,VP9,MPEG2",
                "X-ExoPlayer-Buffer-Min": "20000,15000,12000,8000",
                "X-Manifest-Refresh": "20000,25000,35000,50000",
                "X-KODI-LIVE-DELAY": "20,15,10,8",
                "X-APE-STRATEGY": "balanced,conservative,auto,adaptive",
                "X-APE-Prefetch-Segments": "4,3,2,1",
                "X-APE-Quality-Threshold": "0.97,0.95,0.93,0.90",
                "X-Tone-Mapping": "auto,passthrough,hdr-to-sdr,none",
                "X-HDR-Output-Mode": "auto,native,sdr,force-hdr",
                "X-Platform": "android,linux,webos,tizen",
                "X-Deinterlace-Mode": "auto,bob,yadif,off",
                "X-Error-Concealment": "adaptive,enabled,auto,disabled",
                "X-Low-Latency-Mode": "auto,enabled,disabled,off",
                "X-ABR-Algorithm": "adaptive,bandwidth,buffer,hybrid",
                "X-Startup-Quality": "auto,low,min,medium",
                "X-Quality-Switch-Mode": "seamless,auto,instant,none",
                "X-Max-Startup-Delay-Ms": "4000,5000,6000,7000",
                "X-Seek-Tolerance-Ms": "500,1000,1500,2000",
                "X-Gap-Policy": "skip,fill,wait,error",
                "X-Credential-Lock": "none,auto,disabled,off",
                "X-Token-Refresh": "auto,enabled,disabled,off"
            }
        },

        "P5": {
            "id": "P5",
            "name": "SD_FAILSAFE_UNIVERSAL",
            "level": 1,
            "quality": "SD",
            "description": "SD FAILSAFE — Resiliencia universal para cualquier conexión",
            "color": "#6366f1",
            "settings": {
                "resolution": "854x480",
                "buffer": 8000,
                "strategy": "conservative",
                "bitrate": 2.0,
                "t1": 2.5,
                "t2": 3.0,
                "playerBuffer": 15000,
                "fps": 30,
                "codec": "H264",
                "headersCount": 233,
                "bufferSeconds": 8,
                "focus": "MAXIMA_CALIDAD_8K_HDR_CARGA_ULTRARAPIDA_SIN_CORTES",
                "hdr_canonical": "sdr",
                "nits_target": 8000,
                "codec_chain_video": "avc1.42E01E,avc1.42E00D,mp2v.2",
                "codec_chain_audio": "mp4a.40.5,mp4a.40.29,mp4a.40.2",
                "codec_chain_hdr": "sdr",
                "codec_chain_player_pref": "avc1,h264",
                "codec_chain_video_family": "H264-MAIN>H264-BASELINE>MPEG2"
            },
            "vlcopt": {
                "network-caching": "8000",
                "clock-jitter": "1000",
                "clock-synchro": "1",
                "live-caching": "5000",
                "file-caching": "15000",
                "http-user-agent": "Mozilla/5.0 APE-8K_ULTRA_EXTREME_MASTER",
                "http-referer": "auto",
                "http-forward-cookies": "true",
                "http-reconnect": "true",
                "http-continuous-stream": "true",
                "http-max-retries": "5",
                "http-timeout": "10000",
                "video-color-space": "BT601",
                "video-transfer-function": "BT1886",
                "video-color-primaries": "BT601",
                "video-color-range": "limited,full",
                "tone-mapping": "auto",
                "hdr-output-mode": "auto",
                "sharpen-sigma": "0.01",
                "contrast": "1.00",
                "brightness": "1.0",
                "saturation": "1.00",
                "gamma": "1.0",
                "video-filter": "",
                "audio-codec-priority": "aac",
                "adaptive-logic": "highest",
                "adaptive-maxwidth": "854",
                "adaptive-maxheight": "480",
                "demux": "hls"
            },
            "kodiprop": {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.min_bandwidth": "800000",
                "inputstream.adaptive.max_bandwidth": "1500000",
                "inputstream.adaptive.preferred_video_resolution": "480",
                "inputstream.adaptive.chooser_bandwidth_max": "1500000",
                "inputstream.adaptive.media_renewal_time": "60",
                "inputstream.adaptive.manifest_config": "{\"buffer_assured_duration\":60,\"buffer_max_duration\":120,\"connect_timeout\":15,\"read_timeout\":60,\"retry_count\":99,\"reconnect\":true,\"chunk_size\":1048576}"
            },
            "enabledCategories": [
                "identity",
                "connection",
                "cache",
                "cors",
                "anti_freeze",
                "abr_control",
                "ape_core",
                "playback",
                "codecs",
                "hlsjs_engine",
                "extra",
                "ott_navigator",
                "streaming_control",
                "security",
                "hdr_color",
                "resolution_advanced",
                "audio_premium",
                "parallel_download",
                "cdn",
                "metadata",
                "omega_ai_cortex",
                "omega_lcevc",
                "omega_hardware",
                "omega_resilience",
                "omega_stealth",
                "omega_transport",
                "omega_qos"
            ],
            "headerOverrides": {
                "X-APE-CODEC": "H265",
                "X-APE-RESOLUTION": "854x480",
                "X-APE-FPS": "60",
                "X-Screen-Resolution": "854x480",
                "X-APE-BITRATE": "1.7",
                "X-APE-TARGET-BITRATE": "1700",
                "X-APE-THROUGHPUT-T1": "2.2",
                "X-APE-THROUGHPUT-T2": "2.7",
                "X-Max-Reconnect-Attempts": "10,12,15",
                "X-Reconnect-Delay-Ms": "120,200,350",
                "X-Buffer-Underrun-Strategy": "aggressive-refill,adaptive-refill,conservative-refill",
                "Accept-Encoding": "identity",
                "Accept": "application/vnd.apple.mpegurl, application/x-mpegurl, application/x-m3u8, audio/mpegurl, application/octet-stream, */*",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Cache-Control": "no-cache,no-store,max-age=0,max-stale=0",
                "Sec-Fetch-Site": "same-origin,none,cross-site,same-site",
                "X-Buffer-Strategy": "adaptive",
                "X-Color-Depth": "10bit",
                "X-Video-Codecs": "h264,avc,h.264,mpeg2",
                "X-ExoPlayer-Buffer-Min": "34000",
                "X-Manifest-Refresh": "34000",
                "X-KODI-LIVE-DELAY": "34",
                "X-Quality-Preference": "codec-h264,profile-high,tier-high;codec-avc,profile-high,tier-high;codec-h.264,profile-high,tier-high;codec-mpeg2,main,high",
                "X-APE-STRATEGY": "ultra-aggressive",
                "X-APE-Prefetch-Segments": "10",
                "X-APE-Quality-Threshold": "0.95",
                "X-Segment-Duration": "1,2,4,6",
                "X-Prefetch-Enabled": "true,adaptive,auto,false",
                "User-Agent": "Mozilla/5.0 (APE-NAVIGATOR; ULTRA-8K-HEVC-MASTER) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,pt;q=0.7",
                "Sec-CH-UA": "\"Google Chrome\";v=\"125\", \"Chromium\";v=\"125\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"Windows\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"125.0.6422.142\"",
                "Sec-CH-UA-Arch": "x86",
                "Sec-CH-UA-Bitness": "64",
                "Sec-CH-UA-Model": "\"\"",
                "Connection": "keep-alive,close",
                "Keep-Alive": "timeout=120, max=1000",
                "Sec-Fetch-Mode": "no-cors,navigate,cors,same-origin",
                "Sec-Fetch-User": "?1,?0",
                "DNT": "1,0",
                "Sec-GPC": "1,0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "1,0", → HTTPS redirect risk
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers,chunked,compress,deflate", → okhttp legacy trailer EOF
                "Pragma": "no-cache,no-store",
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-", → m3u8 manifest is not byte-rangeable
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                "Origin": "https://iptv-ape.duckdns.org",
                "Referer": "https://iptv-ape.duckdns.org/",
                "X-Requested-With": "XMLHttpRequest,fetch,null",
                "X-App-Version": "APE_10.2_ULTIMATE_HDR",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,cmaf,dash",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0, i", → RFC 9218 HTTP/3 over HTTP/1.1 confuses Xtream parsers
                "X-Playback-Rate": "1.0,1.25,1.5",
                "X-Min-Buffer-Time": "10",
                "X-Max-Buffer-Time": "54",
                "X-Request-Priority": "low",
                "X-Audio-Codecs": "opus,aac,eac3,ac3,dolby,dts,mp3",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,cloudflare,akamai,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "54000",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Device-Type": "smart-tv",
                "X-Network-Type": "wifi,ethernet,5g,4g",
                "Accept-Charset": "utf-8, iso-8859-1;q=0.5",
                "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
                "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
                "X-Player-Type": "exoplayer",
                "X-Hardware-Decode": "true,adaptive,false",
                "X-Tunneling-Enabled": "off",
                "X-Audio-Track-Selection": "default",
                "X-Subtitle-Track-Selection": "off,auto",
                "X-EPG-Sync": "enabled,adaptive,disabled",
                "X-Catchup-Support": "flussonic-ultra,timeshift,archive",
                "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
                "X-Initial-Bitrate": "1700000",
                "X-Retry-Count": "10,12,15",
                "X-Retry-Delay-Ms": "120,200,350",
                "X-Connection-Timeout-Ms": "2500,3500,6000",
                "X-Read-Timeout-Ms": "6000,9000,12000",
                "X-Country-Code": "US,GB,ES,DE,FR",
                "X-HDR-Support": "hlg,sdr",
                "X-Color-Space": "bt709",
                "X-Dynamic-Range": "sdr",
                "X-HDR-Transfer-Function": "bt1886",
                "X-Color-Primaries": "bt709",
                "X-Matrix-Coefficients": "bt709",
                "X-Chroma-Subsampling": "4:2:0",
                "X-HEVC-Tier": "HIGH",
                "X-HEVC-Level": "5.1,5.0,4.2,4.1",
                "X-HEVC-Profile": "HIGH",
                "X-Video-Profile": "high",
                "X-Rate-Control": "VBR",
                "X-Entropy-Coding": "CABAC",
                "X-Compression-Level": "1",
                "X-Pixel-Format": "yuv420p",
                "X-Max-Resolution": "854x480",
                "X-Max-Bitrate": "2700000",
                "X-Frame-Rates": "60,24,25,30,50",
                "X-Aspect-Ratio": "16:9,21:9,4:3",
                "X-Pixel-Aspect-Ratio": "1:1",
                "X-Dolby-Atmos": "true,adaptive,false",
                "X-Audio-Channels": "7.1,5.1,2.0",
                "X-Audio-Sample-Rate": "96000,48000,44100",
                "X-Audio-Bit-Depth": "24bit,16bit",
                "X-Spatial-Audio": "true,adaptive,false",
                "X-Audio-Passthrough": "true,adaptive,false",
                "X-Parallel-Segments": "2,4,6",
                "X-Prefetch-Segments": "8,10,12",
                "X-Segment-Preload": "true,adaptive,false",
                "X-Concurrent-Downloads": "2,4,6",
                "X-Reconnect-On-Error": "true,immediate,adaptive,false",
                "X-Seamless-Failover": "true-ultra,true,adaptive,false",
                "X-Bandwidth-Preference": "unlimited,high,balanced,auto",
                "X-BW-Estimation-Window": "10,15,20",
                "X-BW-Confidence-Threshold": "0.95,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.10,0.15",
                "X-Packet-Loss-Monitor": "enabled,aggressive,adaptive",
                "X-RTT-Monitoring": "enabled,aggressive,adaptive",
                "X-Congestion-Detect": "enabled,aggressive-extreme,adaptive",
                "X-Tone-Mapping": "auto,hdr-to-sdr,sdr-to-hdr,passthrough",
                "X-HDR-Output-Mode": "hdr,auto,tonemap,sdr",
                "X-Buffer-Max": "216000",
                "X-Buffer-Target": "34000",
                "X-Buffer-Min": "10000",
                "X-Network-Caching": "10000",
                "X-Live-Caching": "10000",
                "X-File-Caching": "34000",
                "X-Sharpen-Sigma": "0.06",
                "X-Codec-Support": "h264,avc,h.264",
                "X-CORTEX-OMEGA-STATE": "ACTIVE_DOMINANT,ACTIVE,STANDBY",
                "X-APE-AI-SR-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,ESRGAN,BICUBIC",
                "X-APE-AI-SR-SCALE": "4,2,1",
                "X-APE-AI-FRAME-INTERPOLATION": "OPTICAL_FLOW_SVFI,RIFE,DISABLED",
                "X-APE-AI-DENOISING": "NLMEANS_HQDN3D_TEMPORAL,NLMEANS,HQDN3D,DISABLED",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE_MAX,ADAPTIVE,STANDARD,DISABLED",
                "X-APE-AI-SHARPENING": "UNSHARP_MASK_ADAPTIVE,UNSHARP_MASK,STANDARD,DISABLED",
                "X-APE-AI-ARTIFACT-REMOVAL": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "AUTO,ENABLED,TONEMAP,OFF",
                "X-APE-AI-SCENE-DETECTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,DISABLED",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_98,VMAF_95,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-PHASE": "4,3,2,1",
                "X-APE-LCEVC-COMPUTE-PRECISION": "FP32,FP16,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS4,LANCZOS3,BICUBIC,BILINEAR",
                "X-APE-LCEVC-ROI-DYNAMIC": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_SIDECAR,DISABLED",
                "X-APE-LCEVC-SDK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,WEBGL,WASM",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "BI_DIRECTIONAL_JS_TUNNEL,UNIDIRECTIONAL,DISABLED",
                "X-APE-LCEVC-SDK-DECODER": "WASM+WEBGL,WASM,NATIVE",
                "X-APE-GPU-DECODE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-RENDER": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-GPU-PIPELINE": "DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER,DECODE_LCEVC_AI_SR_TONEMAP_RENDER,DECODE_TONEMAP_RENDER,DECODE_RENDER",
                "X-APE-GPU-PRECISION": "FP32,FP16,INT8",
                "X-APE-GPU-MEMORY-POOL": "VRAM_ONLY,VRAM_SHARED,SYSTEM_RAM",
                "X-APE-GPU-ZERO-COPY": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-VVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "OMEGA_ABSOLUTE,OMEGA,STANDARD",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "TRUE,ADAPTIVE,FALSE",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,HLS_TS,CMAF",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "MORPH_IDENTITY,ROTATE_UA,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,SKIP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "SWARM_EVASION,BACKOFF,RETRY",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RECONNECT_SILENT,RETRY,FALLBACK",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "NUCLEAR_ESCALATION_NEVER_DOWN,AGGRESSIVE_ESCALATION,ADAPTIVE_ESCALATION,DEFAULT",
                "X-APE-ANTI-CUT-ENGINE": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "REAL_TIME,PREDICTIVE,REACTIVE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "MONITOR,OFF,OFF,OFF",
                "X-APE-RECONNECT-MAX": "10,12,15",
                "X-APE-RECONNECT-SEAMLESS": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IDENTITY-MORPH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "30,60,120,300",
                "X-APE-EVASION-MODE": "SWARM_PHANTOM_HYDRA_STEALTH,PHANTOM_STEALTH,STEALTH,STANDARD",
                "X-APE-EVASION-DNS-OVER-HTTPS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-SNI-OBFUSCATION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "TRUE,ADAPTIVE,FALSE",
                "X-APE-EVASION-GEO-PHANTOM": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-IP-ROTATION-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-IP-ROTATION-STRATEGY": "PER_REQUEST,PER_SESSION,PER_CHANNEL",
                "X-APE-STEALTH-UA": "RANDOMIZED,ROTATING,FIXED",
                "X-APE-STEALTH-XFF": "DYNAMIC,ROTATING,FIXED",
                "X-APE-STEALTH-FINGERPRINT": "MUTATING,ROTATING,FIXED",
                "X-APE-SWARM-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-SWARM-PEERS": "20,10,5,1",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-TRANSPORT-CHUNK-SIZE": "200MS,500MS,1000MS,2000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,TS_DIRECT",
                "X-APE-CACHE-STRATEGY": "PREDICTIVE_NEURAL,ADAPTIVE,LRU,NONE",
                "X-APE-CACHE-SIZE": "1GB,512MB,256MB,128MB",
                "X-APE-CACHE-PREFETCH": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE_PREDICTIVE_NEURAL,ADAPTIVE_PREDICTIVE,ADAPTIVE,FIXED",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "10",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "ENABLED,ADAPTIVE,DISABLED",
                "X-APE-QOS-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-QOS-DSCP": "EF,AF41,AF31,BE",
                "X-APE-QOS-PRIORITY": "7,6,5,4",
                "X-APE-POLYMORPHIC-ENABLED": "TRUE,ADAPTIVE,FALSE",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "TRUE,ADAPTIVE,FALSE",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,FREEZE=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=8000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500"
            },
            "prefetch_config": {
                "strategy": "ULTRA_AGRESIVO",
                "prefetch_segments": 90,
                "parallel_downloads": 40,
                "buffer_target_seconds": 54,
                "min_bandwidth_mbps": 5,
                "adaptive_enabled": true,
                "ai_prediction_enabled": true,
                "continuous_prefetch": true
            },
            "quality_levels": {
                "L1": {
                    "label": "SD_FAILSAFE",
                    "condition": "riskScore<=30 AND stallRate<=0.15",
                    "resolution": "640x360",
                    "bitrate_mbps": 3,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L2": {
                    "label": "LOW_240P",
                    "condition": "riskScore<=55 AND stallRate<=0.28",
                    "resolution": "426x240",
                    "bitrate_mbps": 1.5,
                    "hdr": "sdr",
                    "video_filter": ""
                },
                "L3": {
                    "label": "EMERGENCY",
                    "condition": "ALWAYS_AVAILABLE",
                    "resolution": "426x240",
                    "bitrate_mbps": 0.8,
                    "hdr": "sdr",
                    "video_filter": "",
                    "action": "ACTIVATE_BACKUP_URL"
                },
                "L4": {
                    "label": "AUDIO_ONLY",
                    "condition": "VIDEO_STREAM_FAILED",
                    "resolution": "0x0",
                    "bitrate_mbps": 0.2,
                    "hdr": "none",
                    "video_filter": "",
                    "action": "AUDIO_ONLY_MODE"
                },
                "L5": {
                    "label": "RECONNECT",
                    "condition": "ALL_STREAMS_FAILED",
                    "resolution": "0x0",
                    "bitrate_mbps": 0,
                    "hdr": "none",
                    "video_filter": "",
                    "action": "FORCE_RECONNECT_30S"
                },
                "L6": {
                    "label": "OFFLINE_NOTICE",
                    "condition": "RECONNECT_FAILED_3X",
                    "resolution": "0x0",
                    "bitrate_mbps": 0,
                    "hdr": "none",
                    "video_filter": "",
                    "action": "SHOW_OFFLINE_NOTICE"
                },
                "L7": {
                    "label": "DEAD_CHANNEL",
                    "condition": "OFFLINE_5MIN",
                    "resolution": "0x0",
                    "bitrate_mbps": 0,
                    "hdr": "none",
                    "video_filter": "",
                    "action": "MARK_CHANNEL_DEAD"
                },
                "primary": {
                    "codec": "H264",
                    "profile": "MAIN-12,MAIN-10,MAIN,HIGH,BASELINE"
                }
            },
            "headers": {
                "User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.3 TV Safari/538.1,Mozilla/5.0 (Linux; Android 14; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Linux; Android 13; BRAVIA 4K GB ATV3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept": "application/vnd.apple.mpegurl,application/x-mpegurl,application/x-m3u8,video/mp4,audio/aac,audio/mpeg,application/octet-stream,*/*",
                "Accept-Encoding": "identity",
                "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.5",
                "Accept-Charset": "utf-8,iso-8859-1;q=0.5,*;q=0.1",
                "Sec-CH-UA": "\"Google Chrome\";v=\"134\",\"Chromium\";v=\"134\",\"Not-A.Brand\";v=\"99\",\"Samsung Internet\";v=\"23\"",
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": "\"SmartTV\"",
                "Sec-CH-UA-Full-Version-List": "\"Google Chrome\";v=\"134.0.6998.89\",\"Samsung Internet\";v=\"23.0.1.1\",\"Chromium\";v=\"134.0.6998.89\"",
                "Sec-CH-UA-Arch": "x86,arm64,arm",
                "Sec-CH-UA-Bitness": "64,32",
                "Sec-CH-UA-Model": "\"SHIELD Android TV\",\"Samsung Smart TV\",\"BRAVIA 4K\",\"\"",
                "Accept-CH": "DPR,Viewport-Width,Width,Device-Memory,RTT,Downlink,ECT,Save-Data",
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=300,max=1000,timeout=120,max=500",
                "Sec-Fetch-Dest": "media,video,audio,empty",
                "Sec-Fetch-Mode": "no-cors,cors,same-origin,navigate",
                "Sec-Fetch-Site": "same-origin,same-site,cross-site,none",
                "Sec-Fetch-User": "?0,?1",
                "DNT": "0",
                "Sec-GPC": "0",
                // C8 (2026-05-11) — removed (toxic): "Upgrade-Insecure-Requests": "0", → forces HTTPS redirect on HTTP-only providers
                // C8 (2026-05-11) — removed (toxic): "TE": "trailers", → com.android.okhttp legacy does not support RFC 7230 trailers
                "Cache-Control": "no-cache,max-age=0,must-revalidate,no-store",
                "Pragma": "no-cache",
                // C8 (2026-05-11) — removed (toxic): "If-None-Match": "*", → 304+0B okhttp EOF (feedback_exthttp_traps.md #9)
                // C8 (2026-05-11) — removed (toxic): "If-Modified-Since": "[HTTP_DATE]", → 304+0B okhttp EOF
                // C8 (2026-05-11) — removed (toxic): "Range": "bytes=0-,bytes=0-2097152,bytes=0-1048576,bytes=0-524288",
                "Origin": "https://iptv-ape.duckdns.org,https://localhost,null",
                "Referer": "https://iptv-ape.duckdns.org/,https://localhost/,https://iptv-ape.duckdns.org/player",
                "X-Requested-With": "XMLHttpRequest,com.android.chrome,tv.ottnavigator",
                "X-App-Version": "APE_10.0_OMEGA,APE_9.1_SUPREME,APE_9.0,APE_8.5",
                "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
                "X-Device-Id": "[GENERATE_UUID]",
                "X-Client-Timestamp": "[TIMESTAMP]",
                "X-Request-Id": "[GENERATE_UUID]",
                "X-Stream-Type": "hls,dash,cmaf,smooth,progressive",
                "X-Quality-Preference": "codec-h264,profile-main,baseline;codec-mpeg2,main",
                // C8 (2026-05-11) — removed (toxic): "Priority": "u=0,i,u=1,i,u=2,u=3", → HTTP/3 priority over /1.1
                "X-Playback-Rate": "1.0,1.25,0.75,1.5",
                "X-Segment-Duration": "2,4,6,8",
                "X-Min-Buffer-Time": "2,4,6,8",
                "X-Max-Buffer-Time": "20,15,10,6",
                "X-Request-Priority": "high,normal,low,background",
                "X-Prefetch-Enabled": "adaptive,true,auto,false",
                "X-Video-Codecs": "h264-baseline,h264,hevc,mpeg2",
                "X-Audio-Codecs": "aac,mp3,opus",
                "X-Codec-Support": "h264,mpeg2,hevc,vp9",
                "X-DRM-Support": "widevine,playready,fairplay,clearkey",
                "X-CDN-Provider": "auto,generic,akamai,cloudflare,fastly",
                "X-Failover-Enabled": "true,adaptive,auto,false",
                "X-Buffer-Size": "80000,60000,40000,25000",
                "X-Buffer-Target": "40000,30000,20000,12000",
                "X-Buffer-Min": "12000,10000,8000,5000",
                "X-Buffer-Max": "180000,120000,80000,50000",
                "X-Network-Caching": "8000,6000,4000,3000",
                "X-Live-Caching": "5000,4000,3000,2000",
                "X-File-Caching": "15000,12000,8000,5000",
                "X-Device-Type": "smart-tv,android-tv,fire-tv,set-top-box",
                "X-Screen-Resolution": "854x480,640x360,426x240,320x180",
                "X-Network-Type": "ethernet,wifi,5g,4g",
                "X-Buffer-Strategy": "adaptive-predictive,adaptive,balanced,conservative",
                "X-OTT-Navigator-Version": "1.7.0.0-stable,1.6.9.9-stable,1.6.5.0,1.6.0.0",
                "X-Player-Type": "exoplayer,mediaplayer2,vlc,avplayer",
                "X-Hardware-Decode": "auto,preferred,true,false",
                "X-Tunneling-Enabled": "off,false,disabled,auto",
                "X-Audio-Track-Selection": "default,best,auto,first",
                "X-Subtitle-Track-Selection": "off,disabled,none,auto",
                "X-EPG-Sync": "enabled,auto,background,manual",
                "X-Catchup-Support": "flussonic,timeshift,none,auto",
                "X-Bandwidth-Estimation": "balanced,adaptive,conservative,aggressive",
                "X-Initial-Bitrate": "1500000,1000000,800000,500000",
                "X-Max-Bitrate": "3000000,2000000,1500000,1000000",
                "X-APE-BITRATE": "2,1.5,1,0.5",
                "X-APE-TARGET-BITRATE": "2000000,1500000,1000000,500000",
                "X-APE-THROUGHPUT-T1": "2.5,1.5,1,0.5",
                "X-APE-THROUGHPUT-T2": "3,2,1.5,1",
                "X-Retry-Count": "5,4,3,2",
                "X-Retry-Delay-Ms": "400,600,800,1000",
                "X-Connection-Timeout-Ms": "4500,6000,7500,9000",
                "X-Read-Timeout-Ms": "10000,12000,14000,16000",
                "X-Country-Code": "ES,US,GB,DE,FR",
                "X-HDR-Support": "sdr",
                "X-Color-Depth": "8bit",
                "X-Color-Space": "bt601,bt709,srgb",
                "X-Dynamic-Range": "sdr",
                "X-HDR-Transfer-Function": "bt1886,srgb,auto",
                "X-Color-Primaries": "bt601,bt709,srgb",
                "X-Matrix-Coefficients": "bt601,bt709",
                "X-Chroma-Subsampling": "4:2:0,4:2:2,4:4:4",
                "X-HEVC-Tier": "HIGH,MAIN",
                "X-HEVC-Level": "3.1,3.0,2.1,2.0",
                "X-HEVC-Profile": "MAIN-12,MAIN-10,MAIN,MAIN-STILL-PICTURE",
                "X-Video-Profile": "main-12,main-10,main,high,baseline",
                "X-Rate-Control": "VBR,CBR,CRF,CQP",
                "X-Entropy-Coding": "CABAC,CAVLC",
                "X-Compression-Level": "0,1,2,3",
                "X-Pixel-Format": "yuv420p",
                "X-Sharpen-Sigma": "0.04,0.06,0.08,0.00",
                "X-Max-Resolution": "854x480,640x360,426x240,320x180",
                "X-APE-RESOLUTION": "854x480,640x360,426x240,320x180",
                "X-APE-FPS": "30,25,24,15",
                "X-Frame-Rates": "30,25,24,15",
                "X-Aspect-Ratio": "16:9,21:9,4:3,1:1",
                "X-Pixel-Aspect-Ratio": "1:1,SAR,DAR,AUTO",
                "X-Dolby-Atmos": "auto,enabled,false,off",
                "X-Audio-Channels": "2.0",
                "X-Audio-Sample-Rate": "32000,44100",
                "X-Audio-Bit-Depth": "16bit",
                "X-Spatial-Audio": "auto,enabled,false,off",
                "X-Audio-Passthrough": "auto,enabled,false,off",
                "X-Parallel-Segments": "2,1,1,1",
                "X-Prefetch-Segments": "3,2,1,1",
                "X-Segment-Preload": "adaptive,auto,true,false",
                "X-Concurrent-Downloads": "2,1,1,1",
                "X-Reconnect-On-Error": "true,adaptive,auto,false",
                "X-Max-Reconnect-Attempts": "6,5,4,3",
                "X-Reconnect-Delay-Ms": "400,600,800,1000",
                "X-Buffer-Underrun-Strategy": "adaptive,refill,wait,auto",
                "X-Seamless-Failover": "adaptive,enabled,true,auto",
                "X-Bandwidth-Preference": "balanced,adaptive,conservative,max",
                "X-BW-Estimation-Window": "5,8,10,12",
                "X-BW-Confidence-Threshold": "0.95,0.93,0.90,0.85",
                "X-BW-Smooth-Factor": "0.05,0.08,0.10,0.12",
                "X-Packet-Loss-Monitor": "enabled,real-time,auto,background",
                "X-RTT-Monitoring": "enabled,real-time,auto,background",
                "X-Congestion-Detect": "enabled,adaptive,balanced,auto",
                "X-CORTEX-OMEGA-STATE": "ACTIVE,MONITORING,ADAPTIVE,PASSIVE",
                "X-APE-AI-SR-ENABLED": "AUTO,ENABLED,FALSE,DISABLED",
                "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,LANCZOS,BICUBIC,NONE",
                "X-APE-AI-SR-SCALE": "2,1,4,0",
                "X-APE-AI-FRAME-INTERPOLATION": "NONE,RIFE_4.6,DAIN,AUTO",
                "X-APE-AI-DENOISING": "NLMEANS,HQDN3D,LOW,NONE",
                "X-APE-AI-DEBLOCKING": "ADAPTIVE,STANDARD,LOW,NONE",
                "X-APE-AI-SHARPENING": "LOW,UNSHARP_MASK,CAS,NONE",
                "X-APE-AI-ARTIFACT-REMOVAL": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-COLOR-ENHANCEMENT": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-HDR-UPCONVERT": "DISABLED,AUTO,OFF,NONE",
                "X-APE-AI-SCENE-DETECTION": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW,BLOCK_MATCHING,NONE,AUTO",
                "X-APE-AI-CONTENT-AWARE-ENCODING": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_95,VMAF_93,VMAF_90,VMAF_85",
                "X-APE-LCEVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-PHASE": "2,1,3,0",
                "X-APE-LCEVC-COMPUTE-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS3,BICUBIC,BILINEAR,AUTO",
                "X-APE-LCEVC-ROI-DYNAMIC": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER,HLS_FMP4,HLS_TS,AUTO",
                "X-APE-LCEVC-SDK-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE,ANDROID_TV,TIZEN,WEBOS",
                "X-APE-LCEVC-SDK-WEB-INTEROP": "AUTO,NATIVE,JS_TUNNEL,OFF",
                "X-APE-LCEVC-SDK-DECODER": "AUTO,NATIVE,WASM,WEBGL",
                "X-APE-GPU-DECODE": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-RENDER": "AUTO,PREFERRED,ENABLED,FALSE",
                "X-APE-GPU-PIPELINE": "DECODE_TONEMAP_RENDER,DECODE_RENDER,DECODE_DENOISE_RENDER,AUTO",
                "X-APE-GPU-PRECISION": "AUTO,FP16,FP32,INT8",
                "X-APE-GPU-MEMORY-POOL": "AUTO,SHARED,VRAM_ONLY,SYSTEM",
                "X-APE-GPU-ZERO-COPY": "AUTO,PREFERRED,ENABLED,DISABLED",
                "X-APE-VVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-EVC-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-AV1-FALLBACK-ENABLED": "TRUE,AUTO,ENABLED,PREFERRED",
                "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
                "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "STANDARD,COMPATIBILITY,SAFE,AUTO",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "AUTO,FALSE,DISABLED,OFF",
                "X-APE-RESILIENCE-L1-FORMAT": "CMAF,HLS_FMP4,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4,CMAF,HLS_TS,MPEG_TS",
                "X-APE-RESILIENCE-L3-FORMAT": "HLS_TS,HLS_FMP4,MPEG_TS,PROGRESSIVE",
                "X-APE-RESILIENCE-HTTP-ERROR-403": "RETRY,BACKOFF,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN,RETRY,BACKOFF,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-429": "BACKOFF,RETRY,FALLBACK_ORIGIN,STOP",
                "X-APE-RESILIENCE-HTTP-ERROR-500": "RETRY,BACKOFF,FALLBACK_ORIGIN,RECONNECT",
                "X-APE-ANTI-CUT-ENGINE": "ADAPTIVE,ENABLED,AUTO,DISABLED",
                "X-APE-ANTI-CUT-DETECTION": "ADAPTIVE,REAL_TIME,AUTO,DISABLED",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "BALANCED,ADAPTIVE,CONSERVATIVE,AUTO",
                "X-APE-RECONNECT-MAX": "6,5,4,3",
                "X-APE-RECONNECT-SEAMLESS": "AUTO,ADAPTIVE,TRUE,FALSE",
                "X-APE-ANTI-CUT-ISP-STRANGLE": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-MORPH": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IDENTITY-ROTATION-INTERVAL": "0,0,0,0",
                "X-APE-EVASION-MODE": "DISABLED,OFF,NONE,PASSIVE",
                "X-APE-EVASION-DNS-OVER-HTTPS": "AUTO,DISABLED,OFF,NONE",
                "X-APE-EVASION-SNI-OBFUSCATION": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-EVASION-GEO-PHANTOM": "DISABLED,OFF,NONE,AUTO",
                "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "DISABLED,OFF,NONE,AUTO",
                "X-APE-IP-ROTATION-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-IP-ROTATION-STRATEGY": "PER_SESSION,STATIC,NONE,AUTO",
                "X-APE-STEALTH-UA": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-STEALTH-XFF": "STATIC,OFF,NONE,DEFAULT",
                "X-APE-STEALTH-FINGERPRINT": "STATIC,COMPATIBLE,AUTO,DEFAULT",
                "X-APE-SWARM-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-SWARM-PEERS": "0,0,0,0",
                "X-APE-POLYMORPHIC-ENABLED": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-POLYMORPHIC-IDEMPOTENT": "FALSE,DISABLED,OFF,AUTO",
                "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL,HLS_FMP4,HLS_TS,PROGRESSIVE",
                "X-APE-TRANSPORT-CHUNK-SIZE": "1000MS,1500MS,2000MS,4000MS",
                "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4,HLS_TS,PROGRESSIVE,MPEG_TS",
                "X-APE-CACHE-STRATEGY": "ADAPTIVE,PREDICTIVE,BALANCED,CONSERVATIVE",
                "X-APE-CACHE-SIZE": "64MB,32MB,16MB,8MB",
                "X-APE-CACHE-PREFETCH": "AUTO,ADAPTIVE,ENABLED,DISABLED",
                "X-APE-BUFFER-STRATEGY": "ADAPTIVE,BALANCED,CONSERVATIVE,AUTO",
                "X-APE-BUFFER-PRELOAD-SEGMENTS": "3,2,1,1",
                "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED,ADAPTIVE,AUTO,DISABLED",
                "X-APE-BUFFER-NEURAL-PREDICTION": "DISABLED,AUTO,OFF,NONE",
                "X-APE-QOS-ENABLED": "AUTO,DISABLED,FALSE,OFF",
                "X-APE-QOS-DSCP": "CS0,AF31,AF21,BE",
                "X-APE-QOS-PRIORITY": "3,2,1,0",
                "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
                "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT,PRIORITY_2=WARN,PRIORITY_3=INFO",
                "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT,RINGING=DETECT,MOSQUITO=DETECT",
                "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=5000,MAX=30000,TARGET=15000",
                "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500,KEYFRAME_FORCE=FALSE",
                "X-APE-CODEC": "H264,MPEG2,HEVC,VP9",
                "X-ExoPlayer-Buffer-Min": "15000,12000,8000,5000",
                "X-Manifest-Refresh": "20000,30000,40000,60000",
                "X-KODI-LIVE-DELAY": "15,12,8,5",
                "X-APE-STRATEGY": "conservative,balanced,auto,adaptive",
                "X-APE-Prefetch-Segments": "3,2,1,1",
                "X-APE-Quality-Threshold": "0.97,0.95,0.93,0.90",
                "X-Tone-Mapping": "auto,passthrough,hdr-to-sdr,none",
                "X-HDR-Output-Mode": "auto,native,sdr,force-hdr",
                "X-Platform": "android,linux,webos,tizen",
                "X-Deinterlace-Mode": "auto,bob,yadif,off",
                "X-Error-Concealment": "adaptive,enabled,auto,disabled",
                "X-Low-Latency-Mode": "auto,enabled,disabled,off",
                "X-ABR-Algorithm": "adaptive,bandwidth,buffer,hybrid",
                "X-Startup-Quality": "low,min,auto,medium",
                "X-Quality-Switch-Mode": "seamless,auto,instant,none",
                "X-Max-Startup-Delay-Ms": "5000,6000,7000,8000",
                "X-Seek-Tolerance-Ms": "500,1000,1500,2000",
                "X-Gap-Policy": "skip,fill,wait,error",
                "X-Credential-Lock": "none,auto,disabled,off",
                "X-Token-Refresh": "auto,enabled,disabled,off"
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // VALORES DEFAULT DE HEADERS
    // ═══════════════════════════════════════════════════════════════════════
    const DEFAULT_HEADER_VALUES = {
        // Identity
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Sec-CH-UA": '"Google Chrome";v="125", "Chromium";v="125"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-CH-UA-Full-Version-List": '"Google Chrome";v="125.0.6422.142"',
        "Sec-CH-UA-Arch": "x86",
        "Sec-CH-UA-Bitness": "64",
        "Sec-CH-UA-Model": '""',

        // Connection
        "Connection": "keep-alive",
        "Keep-Alive": "timeout=30, max=100",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "DNT": "1",
        "Sec-GPC": "1",
        "Upgrade-Insecure-Requests": "1",
        "TE": "trailers",

        // Cache
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Range": "bytes=0-",
        "If-None-Match": "*",
        "If-Modified-Since": "[HTTP_DATE]",

        // Origin & Referer
        "Origin": "[DYNAMIC_ORIGIN]",
        "Referer": "[DYNAMIC_REFERER]",
        "X-Requested-With": "XMLHttpRequest",

        // APE Core
        "X-App-Version": "APE_9.0_ULTIMATE",
        "X-Playback-Session-Id": "[CONFIG_SESSION_ID]",
        "X-Device-Id": "[GENERATE_UUID]",
        "X-Stream-Type": "hls",
        "X-Quality-Preference": "auto",

        // Playback
        "Priority": "u=1, i",
        "X-Playback-Rate": "1.0",
        "X-Segment-Duration": "6",
        "X-Min-Buffer-Time": "20",
        "X-Max-Buffer-Time": "60",
        "X-Request-Priority": "high",
        "X-Prefetch-Enabled": "true",

        // Codecs
        "X-Video-Codecs": "h264,hevc,vp9,av1",
        "X-Audio-Codecs": "aac,mp3,opus,ac3,eac3",
        "X-DRM-Support": "widevine,playready",

        // CDN
        "X-CDN-Provider": "auto",
        "X-Failover-Enabled": "true",
        "X-Buffer-Size": "8192",
        "X-Buffer-Target": "30000",
        "X-Buffer-Min": "3000",
        "X-Buffer-Max": "60000",
        "X-Network-Caching": "60000",
        "X-Live-Caching": "60000",
        "X-File-Caching": "30000",

        // Metadata
        "X-Client-Timestamp": "[TIMESTAMP]",
        "X-Request-Id": "[GENERATE_UUID]",
        "X-Device-Type": "smart-tv",
        "X-Screen-Resolution": "1920x1080",
        "X-Network-Type": "wifi",

        // Extra SUPREMO
        "Accept-Charset": "utf-8, iso-8859-1;q=0.5",
        "X-Buffer-Strategy": "adaptive",
        "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",

        // OTT Navigator & Player Compatibility (8)
        "X-OTT-Navigator-Version": "1.7.0.0",
        "X-Player-Type": "exoplayer",
        "X-Hardware-Decode": "true",
        "X-Tunneling-Enabled": "off",
        "X-Audio-Track-Selection": "default",
        "X-Subtitle-Track-Selection": "off",
        "X-EPG-Sync": "enabled",
        "X-Catchup-Support": "flussonic",

        // Advanced Streaming Control (6)
        "X-Bandwidth-Estimation": "auto",
        "X-Initial-Bitrate": "highest",
        "X-Retry-Count": "3",
        "X-Retry-Delay-Ms": "1000",
        "X-Connection-Timeout-Ms": "15000",
        "X-Read-Timeout-Ms": "30000",

        "X-Country-Code": "US",

        // ═══════════════════════════════════════════════════════════════════
        // HEADERS DE CALIDAD VISUAL (27 headers)
        // ═══════════════════════════════════════════════════════════════════

        // HDR & Color (8)
        "X-HDR-Support": "hdr10,hdr10+,dolby-vision,hlg",
        "X-Color-Depth": "10bit,12bit",
        "X-Color-Space": "bt2020,p3,rec709",
        "X-Dynamic-Range": "hdr",
        "X-HDR-Transfer-Function": "pq,hlg",
        "X-Color-Primaries": "bt2020",
        "X-Matrix-Coefficients": "bt2020nc",
        "X-Chroma-Subsampling": "4:2:0,4:2:2,4:4:4",

        // HEVC/H.265 Optimization (8)
        "X-HEVC-Tier": "HIGH",
        "X-HEVC-Level": "5.1",
        "X-HEVC-Profile": "MAIN-10",
        "X-Video-Profile": "main10",
        "X-Rate-Control": "VBR",
        "X-Entropy-Coding": "CABAC",
        "X-Compression-Level": "1",
        "X-Sharpen-Sigma": "0.05",
        "X-Pixel-Format": "yuv420p10le",

        // Resolución Avanzada (5)
        "X-Max-Resolution": "7680x4320",
        "X-Max-Bitrate": "100000000",
        "X-Frame-Rates": "24,25,30,50,60,120",
        "X-Aspect-Ratio": "16:9,21:9",
        "X-Pixel-Aspect-Ratio": "1:1",

        // Audio Premium (6)
        "X-Dolby-Atmos": "true",
        "X-Audio-Channels": "7.1,5.1,2.0",
        "X-Audio-Sample-Rate": "48000,96000",
        "X-Audio-Bit-Depth": "24bit",
        "X-Spatial-Audio": "true",
        "X-Audio-Passthrough": "true",

        // Descarga Paralela (4)
        "X-Parallel-Segments": "4",
        "X-Prefetch-Segments": "3",
        "X-Segment-Preload": "true",
        "X-Concurrent-Downloads": "4",

        // Anti-Corte (5)
        "X-Reconnect-On-Error": "true",
        "X-Max-Reconnect-Attempts": "10",
        "X-Reconnect-Delay-Ms": "100",
        "X-Buffer-Underrun-Strategy": "rebuffer",
        "X-Seamless-Failover": "true",

        // ═══════════════════════════════════════════════════════════════════
        // HEADERS DE CONTROL ABR AVANZADO (7 headers)
        // ═══════════════════════════════════════════════════════════════════

        "X-Bandwidth-Preference": "unlimited",
        "X-BW-Estimation-Window": "10",
        "X-BW-Confidence-Threshold": "0.85",
        "X-BW-Smooth-Factor": "0.15",
        "X-Packet-Loss-Monitor": "enabled",
        "X-RTT-Monitoring": "enabled",
        "X-Congestion-Detect": "enabled",

        // ═══════════════════════════════════════════════════════════════════
        // OMEGA GOD-TIER DEFAULTS (85 HEADERS)
        // ═══════════════════════════════════════════════════════════════════
        // CORTEX AI
        "X-CORTEX-OMEGA-STATE": "ACTIVE_DOMINANT",
        "X-APE-AI-SR-ENABLED": "TRUE",
        "X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS",
        "X-APE-AI-SR-SCALE": "4",
        "X-APE-AI-DENOISING": "NLMEANS_HQDN3D_TEMPORAL",
        "X-APE-AI-DEBLOCKING": "ADAPTIVE_MAX",
        "X-APE-AI-SHARPENING": "UNSHARP_MASK_ADAPTIVE",
        "X-APE-AI-ARTIFACT-REMOVAL": "ENABLED",
        "X-APE-AI-COLOR-ENHANCEMENT": "ENABLED",
        "X-APE-AI-HDR-UPCONVERT": "ENABLED",
        "X-APE-AI-SCENE-DETECTION": "ENABLED",
        "X-APE-AI-MOTION-ESTIMATION": "OPTICAL_FLOW",
        "X-APE-AI-CONTENT-AWARE-ENCODING": "ENABLED",
        "X-APE-AI-PERCEPTUAL-QUALITY": "VMAF_98",
        
        // LCEVC & SDK
        "X-APE-LCEVC-ENABLED": "TRUE",
        "X-APE-LCEVC-PHASE": "4",
        "X-APE-LCEVC-COMPUTE-PRECISION": "FP32",
        "X-APE-LCEVC-UPSCALE-ALGORITHM": "LANCZOS4",
        "X-APE-LCEVC-ROI-DYNAMIC": "ENABLED",
        "X-APE-LCEVC-TRANSPORT": "CMAF_LAYER",
        "X-APE-LCEVC-SDK-ENABLED": "TRUE",
        "X-APE-LCEVC-SDK-TARGET": "HTML5_NATIVE",
        "X-APE-LCEVC-SDK-WEB-INTEROP": "BI_DIRECTIONAL_JS_TUNNEL",
        "X-APE-LCEVC-SDK-DECODER": "WASM+WEBGL",
        
        // HARDWARE
        "X-APE-GPU-DECODE": "ENABLED",
        "X-APE-GPU-RENDER": "ENABLED",
        "X-APE-GPU-PIPELINE": "DECODE_ITM_LCEVC_AI_SR_DENOISE_TONEMAP_RENDER",
        "X-APE-GPU-PRECISION": "FP32",
        "X-APE-GPU-MEMORY-POOL": "VRAM_ONLY",
        "X-APE-GPU-ZERO-COPY": "ENABLED",
        "X-APE-VVC-ENABLED": "TRUE",
        "X-APE-EVC-ENABLED": "TRUE",
        "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL": "OMEGA_ABSOLUTE",
        "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC": "TRUE",
        
        // RESILIENCE
        "X-APE-RESILIENCE-L1-FORMAT": "CMAF",
        "X-APE-RESILIENCE-L2-FORMAT": "HLS_FMP4",
        "X-APE-RESILIENCE-L3-FORMAT": "HLS_FMP4",
        "X-APE-RESILIENCE-HTTP-ERROR-403": "MORPH_IDENTITY",
        "X-APE-RESILIENCE-HTTP-ERROR-404": "FALLBACK_ORIGIN",
        "X-APE-RESILIENCE-HTTP-ERROR-429": "SWARM_EVASION",
        "X-APE-RESILIENCE-HTTP-ERROR-500": "RECONNECT_SILENT",
        "X-APE-AV1-FALLBACK-ENABLED": "TRUE",
        "X-APE-AV1-FALLBACK-CHAIN": "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN>H264-BASELINE",
        "X-APE-ISP-THROTTLE-ESCALATION-POLICY": "NUCLEAR_ESCALATION_NEVER_DOWN",
        "X-APE-ANTI-CUT-ENGINE": "ENABLED",
        "X-APE-ANTI-CUT-DETECTION": "REAL_TIME",
        "X-APE-ANTI-CUT-ISP-STRANGLE": "NUCLEAR_10_LEVELS",
        "X-APE-RECONNECT-MAX": "UNLIMITED",
        "X-APE-RECONNECT-SEAMLESS": "TRUE",
        
        // STEALTH
        "X-APE-IDENTITY-MORPH": "ENABLED",
        "X-APE-IDENTITY-ROTATION-INTERVAL": "30",
        "X-APE-EVASION-MODE": "SWARM_PHANTOM_HYDRA_STEALTH",
        "X-APE-EVASION-DNS-OVER-HTTPS": "ENABLED",
        "X-APE-EVASION-SNI-OBFUSCATION": "ENABLED",
        "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE": "TRUE",
        "X-APE-EVASION-GEO-PHANTOM": "ENABLED",
        "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS": "ENABLED",
        "X-APE-IP-ROTATION-ENABLED": "TRUE",
        "X-APE-IP-ROTATION-STRATEGY": "PER_REQUEST",
        "X-APE-STEALTH-UA": "RANDOMIZED",
        "X-APE-STEALTH-XFF": "DYNAMIC",
        "X-APE-STEALTH-FINGERPRINT": "MUTATING",
        "X-APE-SWARM-ENABLED": "TRUE",
        "X-APE-SWARM-PEERS": "20",
        
        // TRANSPORT
        "X-APE-TRANSPORT-PROTOCOL": "CMAF_UNIVERSAL",
        "X-APE-TRANSPORT-CHUNK-SIZE": "200MS",
        "X-APE-TRANSPORT-FALLBACK-1": "HLS_FMP4",
        "X-APE-CACHE-STRATEGY": "PREDICTIVE_NEURAL",
        "X-APE-CACHE-SIZE": "1GB",
        "X-APE-CACHE-PREFETCH": "ENABLED",
        "X-APE-BUFFER-STRATEGY": "ADAPTIVE_PREDICTIVE_NEURAL",
        "X-APE-BUFFER-PRELOAD-SEGMENTS": "10",
        "X-APE-BUFFER-DYNAMIC-ADJUSTMENT": "ENABLED",
        "X-APE-BUFFER-NEURAL-PREDICTION": "ENABLED",
        
        // QOS / TELCHEMY
        "X-APE-QOS-ENABLED": "TRUE",
        "X-APE-QOS-DSCP": "EF",
        "X-APE-QOS-PRIORITY": "7",
        "X-APE-POLYMORPHIC-ENABLED": "TRUE",
        "X-APE-POLYMORPHIC-IDEMPOTENT": "TRUE",
        "X-TELCHEMY-TVQM": "ENABLED,INTERVAL=1000,METRICS=VMAF:PSNR:SSIM",
        "X-TELCHEMY-TR101290": "ENABLED,PRIORITY_1=ALERT",
        "X-TELCHEMY-IMPAIRMENT-GUARD": "ENABLED,BLOCKINESS=DETECT,BLUR=DETECT",
        "X-TELCHEMY-BUFFER-POLICY": "ADAPTIVE,MIN=30000",
        "X-TELCHEMY-GOP-POLICY": "DETECT,IDEAL=2000,TOLERANCE=500"
    };

    const DEFAULT_MANIFEST = {
        version: "13.1.0-SUPREMO",
        jwtExpiration: "365_DAYS",
        multilayer: "EXTVLCOPT,KODIPROP,EXTHTTP,EXT-X-STREAM-INF,EXT-X-APE,EXT-X-START,JWT",
        matrixType: "65_HEADERS_BY_PERFIL"
    };

    // ═══════════════════════════════════════════════════════════════════════
    // HEADERS ESTRATÉGICOS - MODO MANUAL/DINÁMICO
    // ═══════════════════════════════════════════════════════════════════════
    // Por defecto: DYNAMIC (usa valores estratégicos del generador M3U8)
    // Si se cambia a MANUAL: usa el valor personalizado del Frontend
    const STRATEGIC_HEADERS_CONFIG = {
        'User-Agent': {
            mode: 'DYNAMIC',  // DYNAMIC = OTT Navigator/1.6.9.4 (evasión), MANUAL = valor custom
            dynamicValue: 'OTT Navigator/1.6.9.4 (Build 40936) AppleWebKit/606',
            manualValue: '',
            description: 'User-Agent para evasión de bloqueos ISP'
        },
        'X-Forwarded-For': {
            mode: 'DYNAMIC',  // DYNAMIC = detectar IP real, MANUAL = IP fija
            dynamicValue: '[AUTO_DETECT]',
            manualValue: '',
            description: 'IP para proxy/CDN bypass'
        },
        'X-Real-IP': {
            mode: 'DYNAMIC',  // DYNAMIC = detectar IP real, MANUAL = IP fija
            dynamicValue: '[AUTO_DETECT]',
            manualValue: '',
            description: 'IP real del cliente'
        },
        'Sec-CH-UA': {
            mode: 'DYNAMIC',  // DYNAMIC = generar dinámico, MANUAL = valor fijo
            dynamicValue: '[GENERATE]',
            manualValue: '',
            description: 'Client Hints User-Agent'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // AUTO-SEED: Ensure EVERY header listed in HEADER_CATEGORIES has an entry
    // in STRATEGIC_HEADERS_CONFIG so the UI can render it
    // ═══════════════════════════════════════════════════════════════════════
    (function _autoSeedStrategicHeaders() {
        // Valores default razonables por header name pattern
        const defaultValueByHeader = {
            // HDR/Color
            'X-HDR-Mode': 'DYNAMIC',
            'X-HDR-Peak-Nits': '10000',
            'X-Color-Transfer': 'SMPTE ST 2084 (PQ)',
            'X-Bit-Depth': '10',
            'X-Tone-Mapping-Peak': '10000',
            'X-Tone-Mapping-Reference': '203',
            'X-BT2020': 'true',
            'X-Full-Range': 'false',
            // Resolution/Stream
            'X-Stream-Resolution': '[AUTO_FROM_PROFILE]',
            'X-Stream-FPS': '[AUTO_FROM_PROFILE]',
            'X-Stream-Bitrate': '[AUTO_FROM_PROFILE]',
            'X-Stream-Codecs': '[AUTO_FROM_PROFILE]',
            'X-Segment-Duration-S': '6',
            // Codecs
            'X-Codec-Full': '[AUTO_FROM_PROFILE]',
            'X-Codec-Priority': 'dvh1,hvc1,av01,vp09,avc1',
            'X-Audio-Codec-Preferred': 'ec-3',
            // HLS.js Engine
            'X-HLSjs-Config': '[AUTO_FROM_PROFILE]',
            'X-HLSjs-Version': '1.6.15',
            'X-HLSjs-API-Version': 'v1.6',
            'X-HLSjs-Events-Listener': 'FRAG_LOAD_EMERGENCY_ABORTED,FPS_DROP_LEVEL_CAPPING,BACK_BUFFER_REACHED,STALL_RESOLVED,ERROR',
            'X-HLSjs-ErrorDetails-Handled': '[AUTO_FROM_PROFILE]',
            'X-HLSjs-Telemetry-Mode': 'client-local',
            'X-HLSjs-Recovery-Matrix': '[AUTO_FROM_PROFILE]',
            'X-HLSjs-Error-Penalty-Expire-Ms': '30000',
            'X-HLSjs-State-Transitions': 'IDLE->LOADING->PARSING->BUFFERED->PLAYING',
            'X-Shaka-Config': '[AUTO_FROM_PROFILE]',
            'X-Shaka-Version': '4.x',
            'X-ExoPlayer-Config': '[AUTO_FROM_PROFILE]',
            'X-ExoPlayer-Version': 'Media3-1.3',
            'X-ABR-Algorithm': 'EWMA-HLSjs,BOLA-Shaka,Bandwidth-ExoPlayer',
            'X-ABR-Fast-Window-S': '3',
            'X-ABR-Slow-Window-S': '9',
            'X-ABR-BW-Factor': '0.95',
            'X-ABR-Switch-Interval-S': '0',
            'X-Low-Latency-Mode': 'true',
            'X-Live-Sync-Duration-Count': '3',
            'X-Live-Max-Latency-Count': '10',
            'X-Stall-Detection-Ms': '1250',
            'X-Fragment-Retry-Max': '6',
            'X-Fragment-TTFB-Max-Ms': '10000',
            'X-Bitrate-Ladder': '[AUTO_FROM_PROFILE]',
            'X-Bitrate-Ladder-Source': 'bitmovin-stream-lab-2025',
            // CMCD (CTA-5004)
            'CMCD-Object': '[AUTO_FROM_PROFILE]',
            'CMCD-Request': '[AUTO_FROM_PROFILE]',
            'CMCD-Session': '[AUTO_FROM_PROFILE]',
            'CMCD-Status': '[AUTO_FROM_PROFILE]',
            // QoE (Mux Data)
            'X-QoE-Startup-Target-Ms': '2000',
            'X-QoE-Rebuffer-Ratio-Target': '0.005',
            'X-QoE-TTFB-Target-Ms': '200',
            'X-QoE-Bitrate-Target-Mbps': '[AUTO_FROM_PROFILE]',
            'X-QoE-Monitor': 'hlsanalyzer,qosifire,mux-data,akamai-media-analytics',
            'X-QoE-Player': 'hlsjs-1.6,bitmovin-player,shaka-4.x,exoplayer-media3',
        };

        // Recolectar todos los headers únicos de HEADER_CATEGORIES
        const allDeclared = new Set();
        for (const cat of Object.values(HEADER_CATEGORIES)) {
            if (cat.headers && Array.isArray(cat.headers)) {
                cat.headers.forEach(h => allDeclared.add(h));
            }
        }

        let added = 0;
        for (const header of allDeclared) {
            if (!STRATEGIC_HEADERS_CONFIG[header]) {
                const dv = defaultValueByHeader[header] || '[AUTO]';
                STRATEGIC_HEADERS_CONFIG[header] = {
                    mode: 'DYNAMIC',
                    dynamicValue: dv,
                    manualValue: '',
                    description: `Auto-seeded header: ${header}`,
                };
                added++;
            }
        }
        if (added > 0) {
            console.log(`[APE-Profiles] Auto-seed: ${added} headers añadidos a STRATEGIC_HEADERS_CONFIG`);
        }
    })();

    const STRATEGIC_HEADERS_STORAGE_KEY = 'ape_strategic_headers_v9';

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════
    class APEProfilesConfig {
        constructor() {
            this.categories = HEADER_CATEGORIES;
            this.defaultHeaderValues = DEFAULT_HEADER_VALUES;
            this.profiles = this._load() || JSON.parse(JSON.stringify(DEFAULT_PROFILES));
            this.manifest = this._loadManifest() || JSON.parse(JSON.stringify(DEFAULT_MANIFEST));

            // 🔄 Auto-migration v12.0 ELITE: upgrade old multilayer to 7-layer strategy
            const CURRENT_MULTILAYER = DEFAULT_MANIFEST.multilayer;
            if (this.manifest.multilayer && this.manifest.multilayer !== CURRENT_MULTILAYER) {
                if (this.manifest.multilayer.includes('PIPE_HEADERS') || !this.manifest.multilayer.includes('EXT-X-STREAM-INF')) {
                    console.log(`🔄 [Migration] Multilayer upgraded: "${this.manifest.multilayer}" → "${CURRENT_MULTILAYER}"`);
                    this.manifest.multilayer = CURRENT_MULTILAYER;
                    try { localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(this.manifest)); } catch (e) { }
                }
            }

            this.strategicHeaders = this._loadStrategicHeaders() || JSON.parse(JSON.stringify(STRATEGIC_HEADERS_CONFIG));

            // 🧪 LAB integration — rehidratar datos optimizados desde LAB Excel si existen
            this.nivel1Directives = [];
            this.nivel3PerLayer = {};
            this.placeholdersMap = {};
            this.evasionPool = { user_agents: [], referers: [] };
            this.labServers = [];
            this.labMetadata = {};
            this.configGlobal = {};
            this.labExportedAt = null;
            this.omegaGapPlan = null;
            try { this.loadLABFromStorage && this.loadLABFromStorage(); } catch (e) {}
        }

        /**
         * Carga perfiles desde localStorage
         */
        _load() {
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                console.error('⚠️ Error cargando perfiles, usando defaults:', e);
                return null;
            }
        }

        /**
         * Carga configuración del manifiesto desde localStorage
         */
        _loadManifest() {
            try {
                const data = localStorage.getItem(MANIFEST_STORAGE_KEY);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                console.error('⚠️ Error cargando configuración del manifiesto, usando defaults:', e);
                return null;
            }
        }

        /**
         * Carga headers estratégicos desde localStorage
         */
        _loadStrategicHeaders() {
            try {
                const data = localStorage.getItem(STRATEGIC_HEADERS_STORAGE_KEY);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                console.error('⚠️ Error cargando headers estratégicos, usando defaults:', e);
                return null;
            }
        }

        /**
         * Guarda perfiles, manifiesto y headers estratégicos en storage.
         * Debounced: múltiples llamadas en <300ms se colapsan en una sola escritura.
         */
        save() {
            if (this._saveTimer) clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
                localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(this.manifest));
                localStorage.setItem(STRATEGIC_HEADERS_STORAGE_KEY, JSON.stringify(this.strategicHeaders));
                console.log('[APE-Profiles] Perfiles v9.0 + Manifiesto + Headers guardados');
                this._saveTimer = null;
            }, 300);
        }

        /**
         * Exporta perfiles + manifiesto + headers a un objeto JSON descargable.
         * @returns {Object} { _meta, profiles, manifest, strategicHeaders }
         */
        exportProfiles() {
            return {
                _meta: {
                    version: 'APE_v9.0',
                    exported: new Date().toISOString(),
                    source: 'ApeProfileManager.exportProfiles',
                    total_profiles: Object.keys(this.profiles).length,
                },
                profiles: JSON.parse(JSON.stringify(this.profiles)),
                manifest: JSON.parse(JSON.stringify(this.manifest)),
                strategicHeaders: JSON.parse(JSON.stringify(this.strategicHeaders)),
            };
        }

        /**
         * Importa perfiles desde un objeto JSON. Reemplaza los activos y persiste.
         * @param {Object|string} data - objeto o string JSON con { profiles, ... }
         * @returns {boolean} true si importó correctamente
         */
        importProfiles(data) {
            try {
                const obj = typeof data === 'string' ? JSON.parse(data) : data;
                if (!obj || typeof obj !== 'object') throw new Error('Invalid data');
                const imported = obj.profiles || obj;
                if (!imported || typeof imported !== 'object') throw new Error('No profiles key found');
                // Validar que tenga P0-P5 al menos
                const pids = Object.keys(imported).filter(k => /^P[0-5]$/.test(k));
                if (pids.length === 0) throw new Error('No P0-P5 profiles found in JSON');
                // Merge con DEFAULT_PROFILES para garantizar estructura completa
                const merged = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
                for (const pid of pids) {
                    if (merged[pid]) {
                        // Deep merge preservando estructura
                        merged[pid] = this._deepMerge(merged[pid], imported[pid]);
                    } else {
                        merged[pid] = imported[pid];
                    }
                }
                this.profiles = merged;
                if (obj.manifest) this.manifest = obj.manifest;
                if (obj.strategicHeaders) this.strategicHeaders = obj.strategicHeaders;
                // Persistir inmediato (skip debounce para import manual)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
                localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(this.manifest));
                localStorage.setItem(STRATEGIC_HEADERS_STORAGE_KEY, JSON.stringify(this.strategicHeaders));
                console.log(`[APE-Profiles] IMPORTADOS ${pids.length} perfiles: ${pids.join(', ')}`);
                return true;
            } catch (e) {
                console.error('[APE-Profiles] Error importando perfiles:', e.message);
                return false;
            }
        }

        /**
         * 🧪 IMPORT FROM LAB — consume LAB_CALIBRATED_*.json (schema omega_v1)
         * - Profiles: deep-merge respetando headerOverrides completo
         * - nivel1_directives: persiste en this.nivel1Directives + localStorage
         * - nivel3_per_layer: persiste en this.nivel3PerLayer + localStorage
         * - servers: emite event para que app.state los absorba
         * - evasion_pool: persiste en this.evasionPool
         * - config_global: aplica selectivamente a strategicHeaders existentes
         */
        /**
         * SEMANTIC FILL — proyecta valores ya calibrados por el LAB a sus
         * nombres canónicos PM9 cuando headerOverrides[pm9Key] está vacío.
         *
         * No transforma valores. No clampa. No sobrescribe lo existente.
         * Solo llena blancos con data que ya está en otras secciones del LAB.
         *
         * Mappings (17, justificados en plan cosmic-seeking-sutton.md §III.A):
         *   hdr_color (4):       vlcopt.*  — tone-mapping + BT2020 + fullrange
         *   codecs (3):          settings.* — codec_full + codec_priority + audio_codec
         *   hlsjs_engine (10):   hlsjs.* + optimized_knobs.* — ABR/latency/retry
         *
         * 2 mappings prefieren optimized_knobs sobre hlsjs raw:
         *   X-ABR-BW-Factor       → optimized_knobs (0.85 float) > hlsjs (95 %)
         *   X-Fragment-Retry-Max  → optimized_knobs (32 fresh) > hlsjs (10 raw)
         *
         * @param {Object} profile — perfil ya mergeado tras shallow merge LAB
         * @returns {{count: number, filled: Array<{pm9: string, source: string, value: *}>}}
         */
        _fillSemanticHeadersFromLAB(profile) {
            const SEMANTIC_MAPPINGS = [
                // ── hdr_color (4) — tone-mapping + colorspace flags
                { pm9: 'X-Tone-Mapping-Peak',       sources: ['vlcopt.video-tone-mapping-peak', 'settings.peakLuminanceNits'] },
                { pm9: 'X-Tone-Mapping-Reference',  sources: ['vlcopt.video-tone-mapping-reference'] },
                { pm9: 'X-BT2020',                  sources: ['vlcopt.video-bt2020'] },
                { pm9: 'X-Full-Range',              sources: ['vlcopt.video-fullrange'] },

                // ── codecs (3) — codec descriptor + priority + preferred audio
                { pm9: 'X-Codec-Full',              sources: ['settings.codec_full'] },
                { pm9: 'X-Codec-Priority',          sources: ['settings.codec_priority'] },
                { pm9: 'X-Audio-Codec-Preferred',   sources: ['settings.audio_codec'] },

                // ── hlsjs_engine (10) — ABR + latency + retry budget
                { pm9: 'X-ABR-Fast-Window-S',       sources: ['hlsjs.abrEwmaFastLive'] },
                { pm9: 'X-ABR-Slow-Window-S',       sources: ['hlsjs.abrEwmaSlowLive'] },
                // SOLVER FIRST: optimized_knobs.abrBandWidthFactor (0.85 float, hls.js correct)
                // hlsjs.abrBandWidthFactor=95 está en formato porcentaje (raw Excel export).
                { pm9: 'X-ABR-BW-Factor',           sources: ['optimized_knobs.abrBandWidthFactor', 'hlsjs.abrBandWidthFactor'] },
                { pm9: 'X-ABR-Switch-Interval-S',   sources: ['hlsjs.abrSwitchInterval'] },
                { pm9: 'X-Low-Latency-Mode',        sources: ['hlsjs.lowLatencyMode'] },
                { pm9: 'X-Live-Sync-Duration-Count',sources: ['hlsjs.liveSyncDurationCount'] },
                { pm9: 'X-Live-Max-Latency-Count',  sources: ['hlsjs.liveMaxLatencyDurationCount'] },
                { pm9: 'X-Stall-Detection-Ms',      sources: ['hlsjs.detectStallWithCurrentTimeMs'] },
                // SOLVER FIRST: optimized_knobs.fragLoad_maxNumRetry (32) > hlsjs raw (10).
                // Solver eleva retry budget tras evidencia de provider con flaky CDN.
                { pm9: 'X-Fragment-Retry-Max',      sources: ['optimized_knobs.fragLoad_maxNumRetry', 'hlsjs.fragLoadPolicy_maxNumRetry'] },
                { pm9: 'X-Fragment-TTFB-Max-Ms',    sources: ['hlsjs.fragLoadPolicy_maxTimeToFirstByteMs'] }
            ];

            const ho = profile.headerOverrides = profile.headerOverrides || {};
            const filled = [];

            const readPath = (path) => {
                const dot = path.indexOf('.');
                if (dot < 0) return undefined;
                const sec = path.slice(0, dot);
                const key = path.slice(dot + 1);
                const sectionObj = profile[sec];
                if (!sectionObj || typeof sectionObj !== 'object') return undefined;
                return sectionObj[key];
            };

            for (const m of SEMANTIC_MAPPINGS) {
                // Rule 1: NO sobrescribir si ya existe valor non-empty
                const existing = ho[m.pm9];
                if (existing !== undefined && existing !== null && existing !== '') continue;

                // Rule 3: probar sources en orden (solver fresh > raw)
                for (const path of m.sources) {
                    const v = readPath(path);
                    if (v !== undefined && v !== null && v !== '') {
                        // Rule 2: proyectar as-is, no transform
                        ho[m.pm9] = v;
                        filled.push({ pm9: m.pm9, source: path, value: v });
                        break;
                    }
                }
            }

            if (filled.length > 0) {
                console.log(`[LAB SEMANTIC FILL] ${profile.id || '?'}: ${filled.length}/17 headers homologados desde LAB calibrated`);
                filled.forEach(f => console.log(`  ✓ ${f.pm9} ← ${f.source} = ${typeof f.value === 'object' ? JSON.stringify(f.value).slice(0,60) : f.value}`));
            }

            return { count: filled.length, filled };
        }

        async importFromLABData(data, options = {}) {
            // 🛡️ ANTI-DRIFT options (added 2026-04-29):
            //   - options.includeExtrasByProfile: { P0: true|false, ... } — gate
            //     que el generator usa para decidir si emite vlcopt/kodiprop/headers
            //     no homologables a PM9. Persistido en this.profiles[pid].includeLabExtras.
            //   - options.collisionResolutions: { 'P0:labKey': 'rename'|'omit', ... } —
            //     resolución por colisión de rename (LAB drift case/separator vs PM9).
            //   - options.renameCollisions: array completo de colisiones detectadas
            //     (usado para iterar y aplicar la decisión).
            const includeExtrasByProfile = options.includeExtrasByProfile || {};
            const collisionResolutions = options.collisionResolutions || {};
            const renameCollisions = Array.isArray(options.renameCollisions) ? options.renameCollisions : [];

            const result = {
                profilesUpdated: 0,
                headersAdded: 0,
                nivel1Count: 0,
                nivel3Total: 0,
                serversCount: 0,
                placeholdersCount: 0,
                gapPlanItems: 0,
                gapPlanReplicar: 0,
                gapPlanImplementar: 0,
                gapPlanQuitar: 0,
                renameApplied: 0,
                renameOmitted: 0,
                profilesWithExtras: 0,
                // C12 (2026-05-12) — SEMANTIC fill counters:
                // 17 PM9 canonical headers que el LAB calibra en secciones distintas a
                // headerOverrides (settings/vlcopt/hlsjs/optimized_knobs). Sin SEMANTIC
                // fill, el PM9 panel los pinta en blanco; el solver ya tiene el valor.
                semanticFillCount: 0,
                semanticFillByProfile: {}
            };
            try {
                const supportedSchemas = ['omega_v1'];
                const isBulletproof = data.lab_schema_variant === 'omega_v2_bulletproof_perprofile' || data.bulletproof === true;
                if (!data || !supportedSchemas.includes(data.lab_version)) {
                    throw new Error(`Schema invalido (esperado: ${supportedSchemas.join(', ')})`);
                }
                if (isBulletproof) console.log('[LAB-CONSUMER] 🛡 Bulletproof JSON detectado — consumiendo 100% de los campos.');
                if (data.playlist_format !== 'm3u8') {
                    throw new Error('playlist_format debe ser m3u8');
                }

                // === 1. PROFILES ===
                // Helper: convierte campos numéricos de strings a Number (LAB Excel exporta TODO como string)
                // FIX v4.20.4: maneja coma decimal española "2,6" → 2.6
                // FIX v4.20.5 (2026-04-26): auto-detect TODOS los strings numéricos.
                //   Antes: allowlist de 9 keys cubría solo ~6% de los valores numéricos del LAB.
                //   Ahora: cualquier string que matchee /^-?\d+([.,]\d+)?$/ se coerce.
                //   Aplicado a settings + hlsjs + prefetch_config (las 3 secciones JS-consumidas).
                //   NO aplicado a vlcopt/kodiprop/headerOverrides (se emiten como texto plano,
                //   tipo no afecta wire format HTTP).
                const NUMERIC_RE = /^-?\d+([.,]\d+)?$/;
                const toNum = (v) => {
                    if (v === null || v === undefined || v === '') return 0;
                    if (typeof v === 'number') return v;
                    let s = String(v).trim();
                    // Si hay coma pero NO punto, es decimal español "2,6" → "2.6"
                    if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
                    // Si hay coma Y punto, la coma es separador de miles: quitarla
                    else if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/,/g, '');
                    const n = Number(s);
                    return isNaN(n) ? 0 : n;
                };
                const coerceNumericStrings = (obj) => {
                    if (!obj || typeof obj !== 'object') return obj;
                    const out = Object.assign({}, obj);
                    for (const k of Object.keys(out)) {
                        const v = out[k];
                        if (typeof v === 'string' && NUMERIC_RE.test(v.trim())) {
                            out[k] = toNum(v);
                        }
                    }
                    return out;
                };

                const labProfiles = data.profiles_calibrated || {};
                for (const pid of ['P0','P1','P2','P3','P4','P5']) {
                    const lp = labProfiles[pid];
                    if (!lp) continue;

                    // 🔧 FIX: coerce strings numéricos → Number antes de merge
                    // Cubre las 3 secciones que JS consume como números (settings + hlsjs + prefetch_config).
                    const lpFixed = Object.assign({}, lp);
                    if (lpFixed.settings) lpFixed.settings = coerceNumericStrings(lpFixed.settings);
                    if (lpFixed.hlsjs) lpFixed.hlsjs = coerceNumericStrings(lpFixed.hlsjs);
                    if (lpFixed.prefetch_config) lpFixed.prefetch_config = coerceNumericStrings(lpFixed.prefetch_config);

                    // 🛡️ ANTI-DRIFT: aplicar collision resolutions a headerOverrides
                    // antes del merge. 'rename' → mover valor a key canónica PM9.
                    // 'omit' → eliminar el header del payload importado.
                    if (lpFixed.headerOverrides && renameCollisions.length > 0) {
                        const ho = Object.assign({}, lpFixed.headerOverrides);
                        for (const c of renameCollisions) {
                            if (c.profile !== pid) continue;
                            const action = collisionResolutions[`${pid}:${c.labKey}`];
                            if (action === 'rename') {
                                const value = ho[c.labKey];
                                delete ho[c.labKey];
                                if (value !== undefined && c.pm9Key) {
                                    ho[c.pm9Key] = value;
                                    result.renameApplied++;
                                }
                            } else if (action === 'omit') {
                                delete ho[c.labKey];
                                result.renameOmitted++;
                            }
                        }
                        lpFixed.headerOverrides = ho;
                    }

                    if (this.profiles[pid]) {
                        if (isBulletproof) {
                            // 🛡 BULLETPROOF: SHALLOW MERGE — el LAB sobreescribe sus secciones
                            // calibradas (settings/vlcopt/kodiprop/headerOverrides/hlsjs/prefetch_config/
                            // role/fitness/bounds/optimized_knobs/player_enslavement/actor_injections/
                            // solver_trace/optimized_timestamp) en bloque, PERO preserva campos del
                            // frontend que el LAB no produce (enabledCategories, color, level, quality,
                            // description, customHeaders, expandedCategories). Sin esto, REPLACE total
                            // rompe el render() del PM9 que necesita enabledCategories.
                            // Doctrina: LAB es SSOT para datos calibrados, frontend conserva su meta UI.
                            this.profiles[pid] = Object.assign(
                                {},
                                this.profiles[pid],
                                JSON.parse(JSON.stringify(lpFixed))
                            );
                            result.headersAdded += Object.keys(lpFixed.headerOverrides || {}).length;
                        } else {
                            // Modo legacy (no-bulletproof): deep merge preserva headers viejos
                            // que LAB no envía. headerOverrides MERGE explícito (LAB gana en colisión).
                            const existingHO = this.profiles[pid].headerOverrides || {};
                            const labHO = lpFixed.headerOverrides || {};
                            const mergedHO = Object.assign({}, existingHO, labHO);
                            result.headersAdded += Object.keys(labHO).length;
                            this.profiles[pid] = this._deepMerge(this.profiles[pid], lpFixed);
                            this.profiles[pid].headerOverrides = mergedHO;
                        }
                    } else {
                        // Profile nuevo (no debería pasar pero safe-guard)
                        this.profiles[pid] = JSON.parse(JSON.stringify(lpFixed));
                        result.headersAdded += Object.keys(lpFixed.headerOverrides || {}).length;
                    }

                    // 🛡️ ANTI-DRIFT: persistir flag per-profile que el GENERATOR consulta
                    // para decidir si emite extras (vlcopt/kodiprop/headers no-PM9).
                    // Default = false (modo "campos habituales del frontend").
                    if (Object.prototype.hasOwnProperty.call(includeExtrasByProfile, pid)) {
                        this.profiles[pid].includeLabExtras = includeExtrasByProfile[pid] === true;
                        if (this.profiles[pid].includeLabExtras) result.profilesWithExtras++;
                    } else {
                        // Sin extras detectados para este perfil: default false (no-op).
                        this.profiles[pid].includeLabExtras = false;
                    }

                    // ═══════════════════════════════════════════════════════════════
                    // C12 (2026-05-12) — SEMANTIC FILL PASS
                    // ───────────────────────────────────────────────────────────────
                    // 17 PM9 canonical headers que LAB calibra en otras secciones.
                    // Sin este pass, el panel los pinta en blanco aunque el dato
                    // exista en settings/vlcopt/hlsjs/optimized_knobs.
                    //
                    // Reglas inviolables (per feedback_no_clamp_lab_values):
                    //  1. NO sobrescribir si headerOverrides[h] ya tiene valor
                    //  2. NO transformar — proyectar as-is
                    //  3. Preferir optimized_knobs.* sobre hlsjs.* raw (solver fresh)
                    //  4. Auditable — log + counter
                    // ═══════════════════════════════════════════════════════════════
                    const semFill = this._fillSemanticHeadersFromLAB(this.profiles[pid]);
                    if (semFill.count > 0) {
                        result.semanticFillCount += semFill.count;
                        result.semanticFillByProfile[pid] = semFill.filled;
                    }

                    result.profilesUpdated++;
                }

                // === 2. NIVEL_1 DIRECTIVES (master playlist headers) ===
                this.nivel1Directives = Array.isArray(data.nivel1_directives) ? data.nivel1_directives : [];
                result.nivel1Count = this.nivel1Directives.length;

                // === 3. NIVEL_3 PER LAYER (per-channel directives) ===
                this.nivel3PerLayer = data.nivel3_per_layer || {};
                for (const layer in this.nivel3PerLayer) {
                    result.nivel3Total += (this.nivel3PerLayer[layer] || []).length;
                }

                // === 3b. PLACEHOLDERS MAP (Excel 32_PLACEHOLDERS_MAP) ===
                // Single source de placeholders {namespace.key} → valor real.
                // Consumido por placeholder resolver en m3u8-typed-arrays-ultimate.js (anti-{config.X} literal upstream).
                this.placeholdersMap = data.placeholders_map || {};
                result.placeholdersCount = Object.keys(this.placeholdersMap).length;

                // === 4. EVASION POOL ===
                this.evasionPool = data.evasion_pool || { user_agents: [], referers: [] };
                // === 4b. CONFIG_GLOBAL (LAB Excel hoja 18_CONFIG) ===
                // 48 parámetros globales calibrados (UA_Default, Referer_Default, JWT_*,
                // Client_*, etc.). Consumido por placeholder resolver {config.X} en el
                // generador (PATH A) y por validador.
                this.configGlobal = data.config_global || {};

                // === 5. SERVERS — solo guardar, app.state los absorbe via event ===
                this.labServers = data.servers || [];
                result.serversCount = this.labServers.length;

                // === 5b. OMEGA_GAP_PLAN — policy de injection cocinada por el LAB Excel ===
                // 50 items con canonical_template_by_level por nivel (NIVEL_1/NIVEL_2/NIVEL_3/PLAYER_CONFIG)
                // + action (REPLICAR|IMPLEMENTAR|QUITAR) + injection_order + already_present_in_lab.
                // Sin esto el toolkit no sabe qué directivas inyectar para llegar al 100% del scorecard.
                this.omegaGapPlan = data.omega_gap_plan || null;
                if (this.omegaGapPlan) {
                    const items = Array.isArray(this.omegaGapPlan.items) ? this.omegaGapPlan.items : [];
                    const counts = items.reduce((acc, it) => {
                        const a = (it.action || '').toUpperCase();
                        acc[a] = (acc[a] || 0) + 1;
                        return acc;
                    }, {});
                    console.log('[LAB-CONSUMER] 📜 omega_gap_plan absorbido:', items.length, 'items', counts);
                    result.gapPlanItems = items.length;
                    result.gapPlanReplicar = counts.REPLICAR || 0;
                    result.gapPlanImplementar = counts.IMPLEMENTAR || 0;
                    result.gapPlanQuitar = counts.QUITAR || 0;
                }

                // === 6. SCORING METADATA ===
                this.labMetadata = data.scoring_metadata || {};
                this.labExportedAt = data.exported_at || null;
                // Anotar scorecard del gap_plan en result para la UI
                result.gapPlanScorecard = this.omegaGapPlan?.scorecard_total || null;
                result.gapPlanGrade = this.omegaGapPlan?.scorecard_grade || null;

                // === 7. PERSISTENCIA ===
                // Profiles via mecanismo existente
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
                if (this.manifest) localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(this.manifest));
                if (this.strategicHeaders) localStorage.setItem(STRATEGIC_HEADERS_STORAGE_KEY, JSON.stringify(this.strategicHeaders));

                // Datos LAB en keys nuevas
                localStorage.setItem('ape_lab_nivel1', JSON.stringify(this.nivel1Directives));
                localStorage.setItem('ape_lab_nivel3', JSON.stringify(this.nivel3PerLayer));
                localStorage.setItem('ape_lab_placeholders', JSON.stringify(this.placeholdersMap));
                localStorage.setItem('ape_lab_evasion', JSON.stringify(this.evasionPool));
                localStorage.setItem('ape_lab_config_global', JSON.stringify(this.configGlobal));
                localStorage.setItem('ape_lab_servers', JSON.stringify(this.labServers));
                localStorage.setItem('ape_lab_omega_gap_plan', JSON.stringify(this.omegaGapPlan || null));
                localStorage.setItem('ape_lab_metadata', JSON.stringify({
                    metadata: this.labMetadata,
                    exported_at: this.labExportedAt,
                    imported_at: new Date().toISOString()
                }));

                // === 8. LAB METADATA BULLETPROOF (added 2026-04-18) ===
                this.labSchemaVariant = data.lab_schema_variant || null;
                this.labBulletproof = data.bulletproof === true;
                this.labMetaPerProfile = data.meta_per_profile || null;
                // Fix B bridge: expose labVersion and bulletproof for enforceLABPresence() + _getLABConfig()
                this.labVersion = data.lab_version || null;
                this.bulletproof = data.bulletproof === true;
                this.labFileName = data.labFileName || data.meta_per_profile?.source_file || 'LAB_CALIBRATED';
                this.bulletproofVersion = data.lab_schema_variant || '';
                localStorage.setItem('ape_lab_bulletproof_meta', JSON.stringify({
                    lab_schema_variant: this.labSchemaVariant,
                    bulletproof: this.labBulletproof,
                    labVersion: this.labVersion,
                    labFileName: this.labFileName,
                    meta_per_profile: this.labMetaPerProfile,
                    imported_at: new Date().toISOString()
                }));

                // === 8.5 PRISMA LAB-SYNC v2.0 CONSUMPTION (Stage 1 + 1.5) ===
                // Sección emitida por mod_PRISMA_BulletproofEnrich.Brain_PrismaEnrichBulletproof
                // Contiene: profile_attributes (boost/floor/target/zap), channel_dna_defaults,
                // n3_directives_added, placeholders_added, vba_modules, hook_injection,
                // feature_sheets (FLOOR_LOCK + SENTINEL + TELESCOPE + ADB 35 settings),
                // config_jsons_consumed_by_vps (6 JSONs inline).
                // El generator usa este state para inyectar piso/boost por perfil + DNA per canal.
                if (data.prisma_lab_sync_v20) {
                    this.prismaLabSync = data.prisma_lab_sync_v20;
                    const psync = data.prisma_lab_sync_v20;

                    // Per-profile PRISMA attrs accesibles vía getPrismaProfileAttrs(P0..P5)
                    this.prismaProfileAttrs = psync.profile_attributes || {};

                    // DNA defaults per-channel (las cols 56-63 de 33_CHANNELS_FROM_FRONTEND)
                    this.prismaChannelDnaDefaults = psync.channel_dna_defaults || {};

                    // Feature sheet contents (15 FLOOR_LOCK, 16 SENTINEL, 17 TELESCOPE, 19 ADB)
                    this.prismaFeatureSheets = psync.feature_sheets || {};

                    // Floor lock config inline (el más crítico para el generator)
                    const cfgJsons = psync.config_jsons_consumed_by_vps || {};
                    this.prismaFloorLockConfig = cfgJsons.floor_lock_config_json || null;
                    this.prismaProfileBoostMultipliers = cfgJsons.profile_boost_multipliers_json || null;
                    this.prismaTelescopeThresholds = cfgJsons.telescope_thresholds_json || null;
                    this.prismaSentinelProvidersMap = cfgJsons.sentinel_providers_map_json || null;
                    this.prismaEnterpriseDoctrineManifest = cfgJsons.enterprise_doctrine_manifest_json || null;

                    // Persistir
                    localStorage.setItem('ape_lab_prisma_sync', JSON.stringify(psync));
                    localStorage.setItem('ape_lab_prisma_floor_lock', JSON.stringify(this.prismaFloorLockConfig));
                    localStorage.setItem('ape_lab_prisma_profile_boost', JSON.stringify(this.prismaProfileBoostMultipliers));

                    // Result counters
                    result.prismaStage = psync._metadata?.stage || 'unknown';
                    result.prismaComplianceScore = psync._metadata?.compliance_score_current || 0;
                    result.prismaProfileAttrsCount = Object.keys(this.prismaProfileAttrs).length;
                    result.prismaN3DirectivesCount = (psync.n3_directives_added || []).length;
                    result.prismaPlaceholdersCount = (psync.placeholders_added || []).length;
                    result.prismaVbaModulesCount = Object.keys(psync.vba_modules || {}).length;
                    result.prismaConfigJsonsCount = Object.keys(cfgJsons).filter(k => k !== '_dir').length;

                    console.log('[LAB-CONSUMER] 🔮 PRISMA LAB-SYNC v2.0 detectado y consumido:', {
                        stage: result.prismaStage,
                        compliance: result.prismaComplianceScore,
                        profiles: result.prismaProfileAttrsCount,
                        n3_directives: result.prismaN3DirectivesCount,
                        placeholders: result.prismaPlaceholdersCount,
                        config_jsons: result.prismaConfigJsonsCount
                    });
                } else {
                    console.log('[LAB-CONSUMER] ⚠ Sección prisma_lab_sync_v20 ausente — generator usará defaults v1.3');
                }

                // Persistir a IndexedDB también si está disponible
                if (window.app?.db?.saveAppState) {
                    try {
                        await window.app.db.saveAppState('ape_lab_nivel1', this.nivel1Directives);
                        await window.app.db.saveAppState('ape_lab_nivel3', this.nivel3PerLayer);
                        await window.app.db.saveAppState('ape_lab_evasion', this.evasionPool);
                        if (this.omegaGapPlan) {
                            await window.app.db.saveAppState('ape_lab_omega_gap_plan', this.omegaGapPlan);
                        }
                        // PRISMA LAB-SYNC v2.0 persistence
                        if (this.prismaLabSync) {
                            await window.app.db.saveAppState('ape_lab_prisma_sync', this.prismaLabSync);
                        }
                    } catch (e) { console.warn('[LAB] IDB save warning:', e); }
                }

                // Disparar event con payload completo para que app.state absorba servers
                // y otros consumers reaccionen al gap_plan.
                try {
                    window.dispatchEvent(new CustomEvent('lab-imported', {
                        detail: {
                            ...result,
                            labServers: this.labServers,
                            omegaGapPlan: this.omegaGapPlan
                        }
                    }));
                } catch (_) {}

                console.log('[LAB] Imported successfully:', result);
                return result;
            } catch (e) {
                console.error('[LAB] importFromLABData error:', e);
                throw e;
            }
        }

        /**
         * Carga datos LAB desde localStorage al inicio (rehidratar).
         */
        loadLABFromStorage() {
            try {
                const n1 = localStorage.getItem('ape_lab_nivel1');
                if (n1) this.nivel1Directives = JSON.parse(n1);
                const n3 = localStorage.getItem('ape_lab_nivel3');
                if (n3) this.nivel3PerLayer = JSON.parse(n3);
                const ph = localStorage.getItem('ape_lab_placeholders');
                if (ph) this.placeholdersMap = JSON.parse(ph);
                const ev = localStorage.getItem('ape_lab_evasion');
                if (ev) this.evasionPool = JSON.parse(ev);
                const cg = localStorage.getItem('ape_lab_config_global');
                if (cg) this.configGlobal = JSON.parse(cg);
                const sv = localStorage.getItem('ape_lab_servers');
                if (sv) this.labServers = JSON.parse(sv);
                const md = localStorage.getItem('ape_lab_metadata');
                if (md) {
                    const o = JSON.parse(md);
                    this.labMetadata = o.metadata;
                    this.labExportedAt = o.exported_at;
                }
                const bpm = localStorage.getItem('ape_lab_bulletproof_meta');
                if (bpm) {
                    const o = JSON.parse(bpm);
                    this.labSchemaVariant = o.lab_schema_variant;
                    this.labBulletproof = o.bulletproof;
                    this.labMetaPerProfile = o.meta_per_profile;
                }
                const gp = localStorage.getItem('ape_lab_omega_gap_plan');
                if (gp) this.omegaGapPlan = JSON.parse(gp);

                // PRISMA LAB-SYNC v2.0 rehydration
                const psync = localStorage.getItem('ape_lab_prisma_sync');
                if (psync) {
                    this.prismaLabSync = JSON.parse(psync);
                    this.prismaProfileAttrs = this.prismaLabSync.profile_attributes || {};
                    this.prismaChannelDnaDefaults = this.prismaLabSync.channel_dna_defaults || {};
                    this.prismaFeatureSheets = this.prismaLabSync.feature_sheets || {};
                    const cfgJsons = this.prismaLabSync.config_jsons_consumed_by_vps || {};
                    this.prismaFloorLockConfig = cfgJsons.floor_lock_config_json || null;
                    this.prismaProfileBoostMultipliers = cfgJsons.profile_boost_multipliers_json || null;
                    this.prismaTelescopeThresholds = cfgJsons.telescope_thresholds_json || null;
                    this.prismaSentinelProvidersMap = cfgJsons.sentinel_providers_map_json || null;
                    this.prismaEnterpriseDoctrineManifest = cfgJsons.enterprise_doctrine_manifest_json || null;
                    console.log('[LAB] PRISMA LAB-SYNC v2.0 rehydrated from storage:', {
                        stage: this.prismaLabSync._metadata?.stage,
                        compliance: this.prismaLabSync._metadata?.compliance_score_current
                    });
                }
            } catch (e) {
                console.warn('[LAB] loadLABFromStorage:', e);
            }
        }

        /**
         * 🔮 PRISMA LAB-SYNC v2.0 runtime accessors
         * Generator y otros consumers usan estos para inyectar piso/boost por perfil + DNA per canal
         */
        getPrismaProfileAttrs(profileId) {
            if (!this.prismaProfileAttrs) return null;
            return this.prismaProfileAttrs[profileId] || null;
        }
        getPrismaFloorBpsForProfile(profileId) {
            const attrs = this.getPrismaProfileAttrs(profileId);
            if (attrs && typeof attrs.prisma_floor_min_bandwidth_bps === 'number') {
                return attrs.prisma_floor_min_bandwidth_bps;
            }
            // Fallback to floor_lock_config
            const fl = this.prismaFloorLockConfig;
            if (fl) {
                const key = `floor_lock_min_bandwidth_${profileId.toLowerCase()}`;
                if (typeof fl[key] === 'number') return fl[key];
                if (typeof fl.floor_lock_min_bandwidth_default === 'number') return fl.floor_lock_min_bandwidth_default;
            }
            return 8000000; // hardcoded fallback 8 Mbps
        }
        getPrismaTargetBpsForProfile(profileId) {
            const attrs = this.getPrismaProfileAttrs(profileId);
            if (attrs && typeof attrs.prisma_target_bandwidth_bps === 'number') {
                return attrs.prisma_target_bandwidth_bps;
            }
            return 12000000;
        }
        getPrismaBoostMultiplierForProfile(profileId) {
            const attrs = this.getPrismaProfileAttrs(profileId);
            if (attrs && typeof attrs.prisma_boost_multiplier === 'number') {
                return attrs.prisma_boost_multiplier;
            }
            return 1.5;
        }
        getPrismaChannelDnaDefault(key) {
            if (!this.prismaChannelDnaDefaults) return null;
            return this.prismaChannelDnaDefaults[key];
        }
        isPrismaLoaded() {
            return !!this.prismaLabSync;
        }

        /**
         * Deep merge sin modificar originales.
         */
        _deepMerge(target, source) {
            if (source === null || typeof source !== 'object') return source;
            if (Array.isArray(source)) return source.slice();
            const out = Object.assign({}, target);
            for (const k of Object.keys(source)) {
                if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k]) && target[k] && typeof target[k] === 'object') {
                    out[k] = this._deepMerge(target[k], source[k]);
                } else {
                    out[k] = source[k];
                }
            }
            return out;
        }

        /**
         * Carga perfiles desde un File object (input type=file). Lee JSON y llama importProfiles.
         * @param {File} file
         * @returns {Promise<boolean>}
         */
        async importProfilesFromFile(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(this.importProfiles(e.target.result));
                reader.onerror = () => resolve(false);
                reader.readAsText(file);
            });
        }

        /**
         * Descarga los perfiles actuales como archivo JSON.
         * @param {string} [filename] - nombre custom, default con timestamp
         */
        downloadProfilesJSON(filename) {
            const data = this.exportProfiles();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || `APE_ALL_PROFILES_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        }

        /**
         * Obtiene la configuración de un header estratégico
         * @param {string} headerName - Nombre del header (ej: 'User-Agent')
         * @returns {Object} - {mode, dynamicValue, manualValue, description}
         */
        getStrategicHeader(headerName) {
            return this.strategicHeaders[headerName] || null;
        }

        /**
         * Obtiene el valor efectivo de un header estratégico (según su modo)
         * @param {string} headerName - Nombre del header
         * @returns {string} - Valor a usar (dinámico o manual según modo)
         */
        getStrategicHeaderEffectiveValue(headerName) {
            const config = this.strategicHeaders[headerName];
            if (!config) return null;
            return config.mode === 'MANUAL' ? config.manualValue : config.dynamicValue;
        }

        /**
         * Cambia el modo de un header estratégico (DYNAMIC/MANUAL)
         * @param {string} headerName - Nombre del header
         * @param {string} mode - 'DYNAMIC' o 'MANUAL'
         */
        setStrategicHeaderMode(headerName, mode) {
            if (this.strategicHeaders[headerName]) {
                this.strategicHeaders[headerName].mode = mode;
                this.save();
                console.log(`🔄 ${headerName}: modo cambiado a ${mode}`);
            }
        }

        /**
         * Establece el valor manual de un header estratégico
         * @param {string} headerName - Nombre del header  
         * @param {string} value - Valor manual personalizado
         */
        setStrategicHeaderManualValue(headerName, value) {
            if (this.strategicHeaders[headerName]) {
                this.strategicHeaders[headerName].manualValue = value;
                this.save();
                console.log(`✏️ ${headerName}: valor manual = "${value}"`);
            }
        }

        /**
         * Obtiene todos los headers estratégicos
         */
        getAllStrategicHeaders() {
            return this.strategicHeaders;
        }

        /**
         * Obtiene un perfil por ID
         */
        getProfile(profileId) {
            return this.profiles[profileId] || null;
        }

        /**
         * Obtiene todos los perfiles
         */
        getAllProfiles() {
            return this.profiles;
        }

        /**
         * Calcula el total de píxeles desde una cadena de resolución en crudo (ej: "3840x2160")
         * @param {string} resString
         * @returns {number}
         */
        _computeResolutionPixels(resString) {
            if (!resString) return 0;
            const parts = resString.toLowerCase().split('x');
            if (parts.length === 2) {
                const w = parseInt(parts[0], 10);
                const h = parseInt(parts[1], 10);
                if (!isNaN(w) && !isNaN(h)) return w * h;
            }
            return 0;
        }

        /**
         * 📊 OMEGA ABSOLUTE: Retorna los perfiles estrictamente ordenados matemáticamente
         * de mayor resolución (Top Tier) a menor resolución (Degradation Fallback)
         * El ID estático (P0, P1, P2) queda desacoplado del nivel de caída.
         */
        getDegradationHierarchy() {
            const profilesArray = Object.values(this.profiles);
            
            return profilesArray.sort((a, b) => {
                const resA = a.settings?.resolution || '';
                const resB = b.settings?.resolution || '';
                
                const pxA = this._computeResolutionPixels(resA);
                const pxB = this._computeResolutionPixels(resB);
                
                if (pxA === pxB) {
                    return a.id.localeCompare(b.id);
                }
                
                // Descendente: El de más pixeles se sirve primero
                return pxB - pxA;
            });
        }

        /**
         * Actualiza un perfil
         */
        updateProfile(profileId, data) {
            if (this.profiles[profileId]) {
                Object.assign(this.profiles[profileId], data);
                this.save();
                return true;
            }
            return false;
        }

        /**
         * Crea un nuevo perfil (custom)
         */
        createProfile(id, baseProfileId = 'P3') {
            if (this.profiles[id]) {
                console.warn(`Perfil ${id} ya existe`);
                return false;
            }
            const base = JSON.parse(JSON.stringify(this.profiles[baseProfileId] || DEFAULT_PROFILES.P3));
            base.id = id;
            base.name = `Custom ${id}`;
            base.isCustom = true;
            this.profiles[id] = base;
            this.save();
            return true;
        }

        /**
         * Obtiene la configuración del manifiesto
         */
        getManifestConfig() {
            return this.manifest;
        }

        /**
         * Actualiza la configuración del manifiesto
         */
        updateManifestConfig(updates) {
            this.manifest = { ...this.manifest, ...updates };
            this.save();
        }

        /**
         * Restaura la configuración del manifiesto a sus valores por defecto
         */
        resetManifestConfig() {
            this.manifest = JSON.parse(JSON.stringify(DEFAULT_MANIFEST));
            this.save();
        }

        /**
         * Elimina un perfil custom
         */
        deleteProfile(profileId) {
            if (DEFAULT_PROFILES[profileId]) {
                console.warn('No se pueden eliminar perfiles por defecto');
                return false;
            }
            if (this.profiles[profileId]) {
                delete this.profiles[profileId];
                this.save();
                return true;
            }
            return false;
        }

        /**
         * Duplica un perfil
         */
        duplicateProfile(sourceId, newId) {
            const source = this.profiles[sourceId];
            if (!source) return false;

            const copy = JSON.parse(JSON.stringify(source));
            copy.id = newId;
            copy.name = `${source.name} (Copy)`;
            copy.isCustom = true;
            this.profiles[newId] = copy;
            this.save();
            return true;
        }

        /**
         * Restaura un perfil a sus valores por defecto
         */
        resetProfile(profileId) {
            if (DEFAULT_PROFILES[profileId]) {
                this.profiles[profileId] = JSON.parse(JSON.stringify(DEFAULT_PROFILES[profileId]));
                this.save();
                return true;
            }
            return false;
        }

        /**
         * Restaura todos los perfiles por defecto
         */
        resetAll() {
            this.profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
            this.save();
            console.log('🔄 Todos los perfiles restaurados a default');
        }

        /**
         * Obtiene headers habilitados para un perfil
         */
        getEnabledHeaders(profileId) {
            const profile = this.profiles[profileId];
            if (!profile) return [];

            const headers = [];
            for (const catId of profile.enabledCategories || []) {
                const category = this.categories[catId];
                if (category) {
                    headers.push(...category.headers);
                }
            }
            return headers;
        }

        /**
         * Obtiene valor de un header (con override si existe)
         */
        getHeaderValue(profileId, headerName) {
            const profile = this.profiles[profileId];
            if (!profile) return this.defaultHeaderValues[headerName] || '';

            // Check override first
            if (profile.headerOverrides && profile.headerOverrides[headerName] !== undefined) {
                return profile.headerOverrides[headerName];
            }
            return this.defaultHeaderValues[headerName] || '';
        }

        /**
         * Establece override de valor para un header
         */
        setHeaderOverride(profileId, headerName, value) {
            const profile = this.profiles[profileId];
            if (!profile) return false;

            if (!profile.headerOverrides) {
                profile.headerOverrides = {};
            }
            profile.headerOverrides[headerName] = value;
            this.save();
            return true;
        }

        /**
         * Obtiene categorías
         */
        getCategories() {
            return this.categories;
        }

        /**
         * Cuenta headers activos
         */
        countActiveHeaders(profileId) {
            return this.getEnabledHeaders(profileId).length;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PREFETCH CONFIGURATION METHODS
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Obtiene configuración de prefetch para un perfil
         * @param {string} profileId - ID del perfil (P0-P5)
         * @returns {Object} Configuración de prefetch
         */
        getPrefetchConfig(profileId) {
            const profile = this.profiles[profileId];
            if (!profile) return this._getDefaultPrefetchConfig(profileId);

            // Si no tiene prefetch_config, retornar default
            if (!profile.prefetch_config) {
                return this._getDefaultPrefetchConfig(profileId);
            }

            return profile.prefetch_config;
        }

        /**
         * Obtiene configuración de prefetch por defecto según el perfil
         * @private
         */
        _getDefaultPrefetchConfig(profileId) {
            // Mapeo de estrategia default por perfil
            const defaultStrategyMap = {
                P0: 'ULTRA_AGRESIVO',
                P1: 'AGRESIVO',
                P2: 'AGRESIVO',
                P3: 'BALANCEADO',
                P4: 'BALANCEADO',
                P5: 'CONSERVADOR'
            };

            const strategy = defaultStrategyMap[profileId] || 'BALANCEADO';

            // Obtener valores del preset si está disponible
            if (window.PREFETCH_PRESETS && window.PREFETCH_PRESETS.get(strategy)) {
                const preset = window.PREFETCH_PRESETS.get(strategy);
                return {
                    strategy: strategy,
                    prefetch_segments: preset.prefetch_segments,
                    parallel_downloads: preset.parallel_downloads,
                    buffer_target_seconds: preset.buffer_target_seconds,
                    min_bandwidth_mbps: preset.min_bandwidth_mbps,
                    adaptive_enabled: preset.adaptive_enabled,
                    ai_prediction_enabled: preset.ai_prediction_enabled || false,
                    continuous_prefetch: preset.continuous_prefetch || true
                };
            }

            // Fallback hardcoded si PREFETCH_PRESETS no está cargado
            const defaults = {
                CONSERVADOR: { segments: 15, parallel: 6, buffer: 45, bw: 20 },
                BALANCEADO: { segments: 25, parallel: 10, buffer: 90, bw: 40 },
                AGRESIVO: { segments: 50, parallel: 20, buffer: 150, bw: 70 },
                ULTRA_AGRESIVO: { segments: 90, parallel: 40, buffer: 240, bw: 120 },
                ADAPTATIVO: { segments: 25, parallel: 10, buffer: 90, bw: 40 }
            };

            const d = defaults[strategy] || defaults.BALANCEADO;
            return {
                strategy: strategy,
                prefetch_segments: d.segments,
                parallel_downloads: d.parallel,
                buffer_target_seconds: d.buffer,
                min_bandwidth_mbps: d.bw,
                adaptive_enabled: true,
                ai_prediction_enabled: false,
                continuous_prefetch: true
            };
        }

        /**
         * Establece la estrategia de prefetch para un perfil
         * @param {string} profileId - ID del perfil
         * @param {string} strategyId - ID de la estrategia (CONSERVADOR, BALANCEADO, etc.)
         */
        setPrefetchStrategy(profileId, strategyId) {
            const profile = this.profiles[profileId];
            if (!profile) return false;

            // Obtener preset si está disponible
            let config;
            if (window.PREFETCH_PRESETS && window.PREFETCH_PRESETS.get(strategyId)) {
                const preset = window.PREFETCH_PRESETS.get(strategyId);
                config = {
                    strategy: strategyId,
                    prefetch_segments: preset.prefetch_segments,
                    parallel_downloads: preset.parallel_downloads,
                    buffer_target_seconds: preset.buffer_target_seconds,
                    min_bandwidth_mbps: preset.min_bandwidth_mbps,
                    adaptive_enabled: preset.adaptive_enabled,
                    ai_prediction_enabled: preset.ai_prediction_enabled || false,
                    continuous_prefetch: preset.continuous_prefetch || true
                };
            } else {
                // Fallback: solo cambiar la estrategia, mantener otros valores
                config = this.getPrefetchConfig(profileId);
                config.strategy = strategyId;
            }

            profile.prefetch_config = config;
            this.save();
            console.log(`⚡ Prefetch strategy set to ${strategyId} for ${profileId}`);
            return true;
        }

        /**
         * Actualiza un valor específico de prefetch para un perfil
         * @param {string} profileId - ID del perfil
         * @param {string} key - Clave del valor (prefetch_segments, parallel_downloads, etc.)
         * @param {*} value - Nuevo valor
         */
        updatePrefetchSetting(profileId, key, value) {
            const profile = this.profiles[profileId];
            if (!profile) return false;

            // Inicializar prefetch_config si no existe
            if (!profile.prefetch_config) {
                profile.prefetch_config = this._getDefaultPrefetchConfig(profileId);
            }

            // Actualizar el valor
            profile.prefetch_config[key] = value;
            this.save();
            console.log(`⚡ Prefetch ${key} set to ${value} for ${profileId}`);
            return true;
        }

        /**
         * Genera headers M3U8 para prefetch de un perfil
         * @param {string} profileId - ID del perfil
         * @returns {Array} Array de líneas de headers M3U8
         */
        getPrefetchHeaders(profileId) {
            const config = this.getPrefetchConfig(profileId);
            const headers = [];

            headers.push(`#EXT-X-APE-PREFETCH-STRATEGY:${config.strategy}`);
            headers.push(`#EXT-X-APE-PREFETCH-SEGMENTS:${config.prefetch_segments}`);
            headers.push(`#EXT-X-APE-PREFETCH-PARALLEL:${config.parallel_downloads}`);
            headers.push(`#EXT-X-APE-PREFETCH-BUFFER-TARGET:${config.buffer_target_seconds * 1000}`);
            headers.push(`#EXT-X-APE-PREFETCH-ADAPTIVE:${config.adaptive_enabled}`);
            headers.push(`#EXT-X-APE-PREFETCH-MIN-BANDWIDTH:${config.min_bandwidth_mbps * 1000000}`);

            if (config.ai_prediction_enabled) {
                headers.push(`#EXT-X-APE-PREFETCH-AI-ENABLED:true`);
            }

            return headers;
        }

        /**
         * Resetea configuración de prefetch a defaults para un perfil
         * @param {string} profileId - ID del perfil
         */
        resetPrefetchConfig(profileId) {
            const profile = this.profiles[profileId];
            if (!profile) return false;

            profile.prefetch_config = this._getDefaultPrefetchConfig(profileId);
            this.save();
            console.log(`⚡ Prefetch config reset for ${profileId}`);
            return true;
        }

        // ═══════════════════════════════════════════════════════════════════
        // MÉTODOS ABR CONTROL (NUEVOS)
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Obtiene configuración ABR para un perfil
         * @param {string} profileId - ID del perfil (P0-P5)
         * @returns {Object} Configuración ABR
         */
        getABRConfig(profileId) {
            const profile = this.profiles[profileId];
            if (!profile) return this._getDefaultABRConfig();

            return {
                bandwidthPreference: this.getHeaderValue(profileId, 'X-Bandwidth-Preference'),
                estimationWindow: parseInt(this.getHeaderValue(profileId, 'X-BW-Estimation-Window')),
                confidenceThreshold: parseFloat(this.getHeaderValue(profileId, 'X-BW-Confidence-Threshold')),
                smoothFactor: parseFloat(this.getHeaderValue(profileId, 'X-BW-Smooth-Factor')),
                packetLossMonitor: this.getHeaderValue(profileId, 'X-Packet-Loss-Monitor') === 'enabled',
                rttMonitoring: this.getHeaderValue(profileId, 'X-RTT-Monitoring') === 'enabled',
                congestionDetect: this.getHeaderValue(profileId, 'X-Congestion-Detect') === 'enabled'
            };
        }

        /**
         * Configuración ABR por defecto
         * @private
         */
        _getDefaultABRConfig() {
            return {
                bandwidthPreference: 'unlimited',
                estimationWindow: 10,
                confidenceThreshold: 0.85,
                smoothFactor: 0.15,
                packetLossMonitor: true,
                rttMonitoring: true,
                congestionDetect: true
            };
        }

        /**
         * Actualiza configuración ABR para un perfil
         * @param {string} profileId - ID del perfil
         * @param {Object} config - Nueva configuración ABR
         */
        updateABRConfig(profileId, config) {
            const profile = this.profiles[profileId];
            if (!profile) return false;

            if (config.bandwidthPreference !== undefined) {
                this.setHeaderOverride(profileId, 'X-Bandwidth-Preference', config.bandwidthPreference);
            }
            if (config.estimationWindow !== undefined) {
                this.setHeaderOverride(profileId, 'X-BW-Estimation-Window', String(config.estimationWindow));
            }
            if (config.confidenceThreshold !== undefined) {
                this.setHeaderOverride(profileId, 'X-BW-Confidence-Threshold', String(config.confidenceThreshold));
            }
            if (config.smoothFactor !== undefined) {
                this.setHeaderOverride(profileId, 'X-BW-Smooth-Factor', String(config.smoothFactor));
            }
            if (config.packetLossMonitor !== undefined) {
                this.setHeaderOverride(profileId, 'X-Packet-Loss-Monitor', config.packetLossMonitor ? 'enabled' : 'disabled');
            }
            if (config.rttMonitoring !== undefined) {
                this.setHeaderOverride(profileId, 'X-RTT-Monitoring', config.rttMonitoring ? 'enabled' : 'disabled');
            }
            if (config.congestionDetect !== undefined) {
                this.setHeaderOverride(profileId, 'X-Congestion-Detect', config.congestionDetect ? 'enabled' : 'disabled');
            }

            console.log(`🧠 ABR Config updated for ${profileId}`);
            return true;
        }

        /**
         * Genera headers M3U8 para ABR Control de un perfil
         * @param {string} profileId - ID del perfil
         * @returns {Array} Array de líneas de headers M3U8
         */
        getABRHeaders(profileId) {
            const config = this.getABRConfig(profileId);
            const headers = [];

            headers.push(`#EXT-X-APE-ABR-BANDWIDTH-PREFERENCE:${config.bandwidthPreference}`);
            headers.push(`#EXT-X-APE-ABR-ESTIMATION-WINDOW:${config.estimationWindow}`);
            headers.push(`#EXT-X-APE-ABR-CONFIDENCE-THRESHOLD:${config.confidenceThreshold}`);
            headers.push(`#EXT-X-APE-ABR-SMOOTH-FACTOR:${config.smoothFactor}`);
            headers.push(`#EXT-X-APE-ABR-PACKET-LOSS-MONITOR:${config.packetLossMonitor ? 'enabled' : 'disabled'}`);
            headers.push(`#EXT-X-APE-ABR-RTT-MONITORING:${config.rttMonitoring ? 'enabled' : 'disabled'}`);
            headers.push(`#EXT-X-APE-ABR-CONGESTION-DETECT:${config.congestionDetect ? 'enabled' : 'disabled'}`);

            return headers;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 🌐 GENERACIÓN DE #EXTHTTP JSON (GLOBAL POR PERFIL)
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Genera objeto JSON con HTTP Headers habilitados para un perfil
         * Este objeto se usa para construir el tag #EXTHTTP: global en el M3U8
         * @param {string} profileId - ID del perfil (P0-P5)
         * @param {Object} options - Opciones adicionales
         * @param {Object} options.fingerprint - Datos de fingerprint de dispositivo
         * @param {string} options.userAgent - User-Agent override (de rotator)
         * @returns {Object} Objeto con headers HTTP clave-valor
         */
        getHTTPHeadersJSON(profileId, options = {}) {
            const profile = this.profiles[profileId];
            if (!profile) {
                console.warn(`⚠️ Perfil ${profileId} no encontrado, usando P3`);
                return this.getHTTPHeadersJSON('P3', options);
            }

            const headers = {};
            const enabledCats = profile.enabledCategories || Object.keys(this.categories);
            const now = new Date();

            // Recorrer categorías habilitadas
            for (const catId of enabledCats) {
                const category = this.categories[catId];
                if (!category) continue;

                for (const headerName of category.headers) {
                    let value = this.getHeaderValue(profileId, headerName);

                    // 🔄 Valores dinámicos especiales
                    if (value.includes('[TIMESTAMP]')) {
                        value = now.toISOString();
                    }
                    if (value.includes('[GENERATE_UUID]')) {
                        value = crypto.randomUUID ? crypto.randomUUID() :
                            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                                const r = Math.random() * 16 | 0;
                                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                            });
                    }
                    if (value.includes('[HTTP_DATE]')) {
                        value = now.toUTCString();
                    }
                    if (value.includes('[CONFIG_SESSION_ID]')) {
                        value = `APE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    }

                    // 🔄 Override de User-Agent desde options
                    if (headerName === 'User-Agent' && options.userAgent) {
                        value = options.userAgent;
                    }

                    // 🔄 Datos de fingerprint
                    if (options.fingerprint) {
                        if (headerName === 'X-Device-Id' && options.fingerprint.deviceId) {
                            value = options.fingerprint.deviceId;
                        }
                        if (headerName === 'X-Screen-Resolution' && options.fingerprint.screenResolution) {
                            value = options.fingerprint.screenResolution;
                        }
                        if (headerName === 'X-Device-Type' && options.fingerprint.deviceType) {
                            value = options.fingerprint.deviceType;
                        }
                    }

                    // 🔄 Valores dinámicos desde perfil (MAPEO COMPLETO 152 FALLBACKS)
                    if (headerName === 'X-Max-Resolution') value = profile.settings?.resolution || value;
                    if (headerName === 'X-Max-Bitrate' && profile.settings?.bitrate) value = String(profile.settings.bitrate * 1000000);
                    if (headerName === 'X-Frame-Rates') value = profile.settings?.fps || value;
                    if (headerName === 'X-Video-Codecs') value = profile.settings?.codec || value;
                    if (headerName === 'X-HEVC-Tier') value = profile.settings?.hevc_tier || value;
                    if (headerName === 'X-HEVC-Level') value = profile.settings?.hevc_level || value;
                    if (headerName === 'X-HEVC-Profile') value = profile.settings?.hevc_profile || value;
                    if (headerName === 'X-Color-Space') value = profile.settings?.color_space || value;
                    if (headerName === 'X-Chroma-Subsampling') value = profile.settings?.chroma_subsampling || value;
                    if (headerName === 'X-HDR-Transfer-Function') value = profile.settings?.transfer_function || value;
                    if (headerName === 'X-Matrix-Coefficients') value = profile.settings?.matrix_coefficients || value;
                    if (headerName === 'X-Compression-Level') value = profile.settings?.compression_level || value;
                    if (headerName === 'X-Sharpen-Sigma') value = profile.settings?.sharpen_sigma || value;
                    if (headerName === 'X-Rate-Control') value = profile.settings?.rate_control || value;
                    if (headerName === 'X-Entropy-Coding') value = profile.settings?.entropy_coding || value;
                    if (headerName === 'X-Video-Profile') value = profile.settings?.video_profile || value;
                    if (headerName === 'X-Pixel-Format') value = profile.settings?.pixel_format || value;

                    // Solo agregar si tiene valor
                    if (value && value.trim() !== '') {
                        headers[headerName] = value;
                    }
                }
            }

            console.log(`🌐 [EXTHTTP] Generando ${Object.keys(headers).length} headers para ${profileId}`);

            // 🛡️ PROXY-SAFE: Eliminar headers que causan 407/403
            // Sincronizado con PROXY_BANNED_HEADERS de m3u8-typed-arrays-ultimate.js
            const BANNED = new Set([
                'X-Tunneling-Enabled', 'Proxy-Authorization', 'Proxy-Authenticate',
                'Proxy-Connection', 'Proxy', 'Via', 'Forwarded',
                'X-Forwarded-For', 'X-Forwarded-Proto', 'X-Forwarded-Host', 'X-Real-IP',
                'Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform',
                'Sec-CH-UA-Full-Version-List', 'Sec-CH-UA-Arch', 'Sec-CH-UA-Bitness', 'Sec-CH-UA-Model',
                'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site', 'Sec-Fetch-User',
                'Sec-GPC', 'Upgrade-Insecure-Requests', 'TE',
                'X-Requested-With', 'Accept-Charset', 'Accept-CH', 'DNT', 'Pragma'
            ]);
            const BANNED_PREFIXES = ['Sec-CH-', 'Sec-Fetch-', 'X-Proxy-', 'Tunnel-', 'Upstream-Proxy-'];

            const clean = {};
            for (const [key, value] of Object.entries(headers)) {
                if (BANNED.has(key)) continue;
                if (BANNED_PREFIXES.some(p => key.startsWith(p))) continue;
                clean[key] = value;
            }

            console.log(`🛡️ [PROXY-SAFE] ${Object.keys(headers).length} → ${Object.keys(clean).length} headers (${Object.keys(headers).length - Object.keys(clean).length} eliminados)`);
            return clean;
        }

        /**
         * Genera la línea completa #EXTHTTP: para insertar en el M3U8
         * @param {string} profileId - ID del perfil
         * @param {Object} options - Opciones adicionales
         * @returns {string} Línea #EXTHTTP:{...json...}
         */
        getEXTHTTPLine(profileId, options = {}) {
            const headers = this.getHTTPHeadersJSON(profileId, options);
            return `#EXT-X-APE-HTTP-HEADERS:${JSON.stringify(headers)}`;
        }

        /**
         * Genera el bloque completo de #EXTHTTP con comentario
         * @param {string} profileId - ID del perfil
         * @param {Object} options - Opciones adicionales
         * @returns {string} Bloque con comentario y #EXTHTTP
         */
        getEXTHTTPBlock(profileId, options = {}) {
            const profile = this.profiles[profileId];
            const headers = this.getHTTPHeadersJSON(profileId, options);
            const headerCount = Object.keys(headers).length;

            const lines = [];
            lines.push('');
            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push(`# 🌐 GLOBAL HTTP HEADERS (Profile: ${profileId} - ${profile?.name || 'Unknown'})`);
            lines.push(`# 📊 Headers: ${headerCount} | Generated: ${new Date().toISOString()}`);
            lines.push('# ═══════════════════════════════════════════════════════════════════════════');
            lines.push(`#EXT-X-APE-HTTP-HEADERS:${JSON.stringify(headers)}`);
            lines.push('');

            return lines.join('\n');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const instance = new APEProfilesConfig();
    // Anti-drift helpers (PM9 canonical lookup + flat header set) — usados
    // por _computeLABDiff y por importFromLABData para resolver renames.
    instance.findPm9CanonicalName = findPm9CanonicalName;
    instance.getPm9HeaderSet = getPm9HeaderSet;
    window.APE_PROFILES_CONFIG = instance;

    // C1+A4 (2026-04-30) — UA pool 2026-fresh para fallback cuando PhantomHydra no
    // está disponible. 12 UAs verificados: Chrome 119+ (Web0S), Tizen 7, Android TV
    // SHIELD/Pixel/AFTKA, macOS 14.4, Win10 Chrome 138, Firefox 134, Kodi 21,
    // OTT Navigator 1.7, TiviMate 4.7. Selección determinista por hash sid.
    window.APE_UA_POOL_2026 = [
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 NativeCross/1.0 SamsungBrowser/2.6 Chrome/63.0.3239.84 TV Safari/538.1',
        'Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Tizen 6.5; SmartHub; SMART-TV; SmartTV; U; Maple2012) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; AFTKA Build/STT1.231215.001) AppleWebKit/537.36 (KHTML, like Gecko) Silk/138.5.7 like Chrome/138.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240105.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
        'Kodi/21.0 (Windows 10) Version/21.0-Omega',
        'OTT Navigator/1.7.0.0 (Linux;Android 13) ExoPlayer/2.19.1',
        'TiviMate/4.7.0 (Linux;Android 13) ExoPlayer/2.19.1'
    ];

    console.log('%c🎚️ APE Profiles Config v9.0 EXTENDED Cargado', 'color: #10b981; font-weight: bold;');
    console.log(`   Perfiles: ${Object.keys(instance.profiles).length}`);
    console.log(`   Categorías: ${Object.keys(instance.categories).length}`);
    console.log(`   Headers Totales: 99 (65 originales + 27 calidad visual + 7 ABR control)`);

})();
