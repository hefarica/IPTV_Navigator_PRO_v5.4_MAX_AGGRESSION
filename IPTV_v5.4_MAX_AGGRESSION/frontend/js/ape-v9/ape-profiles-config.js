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

    // ═══════════════════════════════════════════════════════════════════════
    // CATEGORÍAS DE HEADERS
    // ═══════════════════════════════════════════════════════════════════════
    const STORAGE_KEY = 'ape_profiles_v9';
    const MANIFEST_STORAGE_KEY = 'ape_manifest_v9';

    const HEADER_CATEGORIES = {
        identity: {
            name: "🔐 Identidad",
            description: "User-Agent, Client Hints y fingerprinting",
            headers: [
                "User-Agent", "Accept", "Accept-Encoding", "Accept-Language",
                "Sec-CH-UA", "Sec-CH-UA-Mobile", "Sec-CH-UA-Platform",
                "Sec-CH-UA-Full-Version-List", "Sec-CH-UA-Arch",
                "Sec-CH-UA-Bitness", "Sec-CH-UA-Model"
            ]
        },
        connection: {
            name: "🔗 Conexión & Seguridad",
            description: "Keep-alive, Sec-Fetch y seguridad",
            headers: [
                "Connection", "Keep-Alive", "Sec-Fetch-Dest", "Sec-Fetch-Mode",
                "Sec-Fetch-Site", "Sec-Fetch-User", "DNT", "Sec-GPC",
                "Upgrade-Insecure-Requests", "TE"
            ]
        },
        cache: {
            name: "💾 Cache & Range",
            description: "Control de cache y rangos de bytes",
            headers: [
                "Cache-Control", "Pragma", "Range", "If-None-Match", "If-Modified-Since"
            ]
        },
        cors: {
            name: "🌐 Origen & Referer",
            description: "CORS, Referer y peticiones XHR",
            headers: [
                "Origin", "Referer", "X-Requested-With"
            ]
        },
        ape_core: {
            name: "🎯 APE Engine Core",
            description: "Headers núcleo del motor SUPREMO",
            headers: [
                "X-App-Version", "X-Playback-Session-Id", "X-Device-Id",
                "X-Stream-Type", "X-Quality-Preference"
            ]
        },
        playback: {
            name: "🎬 Playback Avanzado",
            description: "Prioridad, buffers y prefetch",
            headers: [
                "Priority", "X-Playback-Rate", "X-Segment-Duration",
                "X-Min-Buffer-Time", "X-Max-Buffer-Time",
                "X-Request-Priority", "X-Prefetch-Enabled"
            ]
        },
        codecs: {
            name: "🎥 Codecs & DRM",
            description: "Soporte de video/audio y licencias",
            headers: [
                "X-Video-Codecs", "X-Audio-Codecs", "X-DRM-Support"
            ]
        },
        cdn: {
            name: "📡 CDN & Buffer",
            description: "Estrategia de Edge y tamaño de red",
            headers: [
                "X-CDN-Provider", "X-Failover-Enabled", "X-Buffer-Size",
                "X-Buffer-Target", "X-Buffer-Min", "X-Buffer-Max",
                "X-Network-Caching", "X-Live-Caching", "X-File-Caching"
            ]
        },
        metadata: {
            name: "📊 Metadata & Tracking",
            description: "Info del dispositivo y telemetría",
            headers: [
                "X-Client-Timestamp", "X-Request-Id", "X-Device-Type",
                "X-Screen-Resolution", "X-Network-Type"
            ]
        },
        extra: {
            name: "⚡ Extras SUPREMO",
            description: "Headers adicionales de la versión 13.1",
            headers: [
                "Accept-Charset", "X-Buffer-Strategy", "Accept-CH"
            ]
        },
        ott_navigator: {
            name: "📱 OTT Navigator",
            description: "Compatibilidad con OTT Navigator y reproductores Android",
            headers: [
                "X-OTT-Navigator-Version", "X-Player-Type", "X-Hardware-Decode",
                "X-Tunneling-Enabled", "X-Audio-Track-Selection", "X-Subtitle-Track-Selection",
                "X-EPG-Sync", "X-Catchup-Support"
            ]
        },
        streaming_control: {
            name: "🎛️ Control de Streaming",
            description: "Timeouts, reintentos y control avanzado de conexión",
            headers: [
                "X-Bandwidth-Estimation", "X-Initial-Bitrate", "X-Retry-Count",
                "X-Retry-Delay-Ms", "X-Connection-Timeout-Ms", "X-Read-Timeout-Ms"
            ]
        },
        security: {
            name: "🔒 Seguridad & Anti-Block",
            description: "Headers de seguridad y evasión de bloqueos",
            headers: [
                "X-Country-Code"
            ]
        },

        // ═══════════════════════════════════════════════════════════════════
        // CATEGORÍAS DE CALIDAD VISUAL (5 categorías - 27 headers)
        // ═══════════════════════════════════════════════════════════════════
        hdr_color: {
            name: "🎨 HDR & Color",
            description: "Soporte HDR10, Dolby Vision, profundidad de color",
            headers: [
                "X-HDR-Support", "X-Color-Depth", "X-Color-Space",
                "X-Dynamic-Range", "X-HDR-Transfer-Function", "X-Color-Primaries",
                "X-Matrix-Coefficients", "X-Chroma-Subsampling",
                "X-HEVC-Tier", "X-HEVC-Level", "X-HEVC-Profile",
                "X-Video-Profile", "X-Rate-Control", "X-Entropy-Coding",
                "X-Compression-Level", "X-Pixel-Format", "X-Sharpen-Sigma"
            ]
        },
        resolution_advanced: {
            name: "📺 Resolución Avanzada",
            description: "Resolución máxima, bitrate, frame rates",
            headers: [
                "X-Max-Resolution", "X-Max-Bitrate", "X-Frame-Rates",
                "X-Aspect-Ratio", "X-Pixel-Aspect-Ratio"
            ]
        },
        audio_premium: {
            name: "🔊 Audio Premium",
            description: "Dolby Atmos, canales 7.1, audio espacial",
            headers: [
                "X-Dolby-Atmos", "X-Audio-Channels", "X-Audio-Sample-Rate",
                "X-Audio-Bit-Depth", "X-Spatial-Audio", "X-Audio-Passthrough"
            ]
        },
        parallel_download: {
            name: "⚡ Descarga Paralela",
            description: "Segmentos paralelos, prefetch, máximo ancho de banda",
            headers: [
                "X-Parallel-Segments", "X-Prefetch-Segments",
                "X-Segment-Preload", "X-Concurrent-Downloads"
            ]
        },
        anti_freeze: {
            name: "🛡️ Anti-Corte",
            description: "Reconexión automática, failover sin interrupciones",
            headers: [
                "X-Reconnect-On-Error", "X-Max-Reconnect-Attempts",
                "X-Reconnect-Delay-Ms", "X-Buffer-Underrun-Strategy",
                "X-Seamless-Failover"
            ]
        },

        // ═══════════════════════════════════════════════════════════════════
        // CATEGORÍA DE CONTROL ABR AVANZADO (1 categoría - 7 headers)
        // ═══════════════════════════════════════════════════════════════════
        abr_control: {
            name: "🧠 Control ABR Avanzado",
            description: "Estimación de ancho de banda, suavizado EWMA, detección de congestión",
            headers: [
                "X-Bandwidth-Preference", "X-BW-Estimation-Window", "X-BW-Confidence-Threshold",
                "X-BW-Smooth-Factor", "X-Packet-Loss-Monitor", "X-RTT-Monitoring",
                "X-Congestion-Detect"
            ]
        },

        // ═══════════════════════════════════════════════════════════════════
        // CATEGORÍAS OMEGA GOD-TIER (7 categorías - 85 headers)
        // ═══════════════════════════════════════════════════════════════════
        omega_ai_cortex: {
            name: "Cortex AI (L4)",
            description: "IA Super Resolution, Frame Interpolation y Denoising",
            headers: [
                "X-CORTEX-OMEGA-STATE", "X-APE-AI-SR-ENABLED", "X-APE-AI-SR-MODEL",
                "X-APE-AI-SR-SCALE", "X-APE-AI-FRAME-INTERPOLATION", "X-APE-AI-DENOISING",
                "X-APE-AI-DEBLOCKING", "X-APE-AI-SHARPENING", "X-APE-AI-ARTIFACT-REMOVAL",
                "X-APE-AI-COLOR-ENHANCEMENT", "X-APE-AI-HDR-UPCONVERT", "X-APE-AI-SCENE-DETECTION",
                "X-APE-AI-MOTION-ESTIMATION", "X-APE-AI-CONTENT-AWARE-ENCODING", "X-APE-AI-PERCEPTUAL-QUALITY"
            ]
        },
        omega_lcevc: {
            name: "LCEVC Payload",
            description: "Fase 4 LCEVC y Native SDK WebView Tunneling",
            headers: [
                "X-APE-LCEVC-ENABLED", "X-APE-LCEVC-PHASE", "X-APE-LCEVC-COMPUTE-PRECISION",
                "X-APE-LCEVC-UPSCALE-ALGORITHM", "X-APE-LCEVC-ROI-DYNAMIC", "X-APE-LCEVC-TRANSPORT",
                "X-APE-LCEVC-SDK-ENABLED", "X-APE-LCEVC-SDK-TARGET", "X-APE-LCEVC-SDK-WEB-INTEROP",
                "X-APE-LCEVC-SDK-DECODER"
            ]
        },
        omega_hardware: {
            name: "💻 OMEGA: Enclavamiento Hardware",
            description: "Directivas estrictas de secuestro de GPU y decodificador VVC/EVC",
            headers: [
                "X-APE-GPU-DECODE", "X-APE-GPU-RENDER", "X-APE-GPU-PIPELINE",
                "X-APE-GPU-PRECISION", "X-APE-GPU-MEMORY-POOL", "X-APE-GPU-ZERO-COPY",
                "X-APE-VVC-ENABLED", "X-APE-EVC-ENABLED", "X-APE-PLAYER-ENSLAVEMENT-PROTOCOL",
                "X-APE-PLAYER-ENSLAVEMENT-OVERRIDE-CODEC"
            ]
        },
        omega_resilience: {
            name: "🛡️ OMEGA: Resiliencia & Fallbacks",
            description: "Cadenas de supervivencia degradables Anti-Crash",
            headers: [
                "X-APE-RESILIENCE-L1-FORMAT", "X-APE-RESILIENCE-L2-FORMAT", "X-APE-RESILIENCE-L3-FORMAT",
                "X-APE-RESILIENCE-HTTP-ERROR-403", "X-APE-RESILIENCE-HTTP-ERROR-404", "X-APE-RESILIENCE-HTTP-ERROR-429",
                "X-APE-RESILIENCE-HTTP-ERROR-500", "X-APE-AV1-FALLBACK-ENABLED", "X-APE-AV1-FALLBACK-CHAIN",
                "X-APE-ISP-THROTTLE-ESCALATION-POLICY", "X-APE-ANTI-CUT-ENGINE", "X-APE-ANTI-CUT-DETECTION",
                "X-APE-ANTI-CUT-ISP-STRANGLE", "X-APE-RECONNECT-MAX", "X-APE-RECONNECT-SEAMLESS"
            ]
        },
        omega_stealth: {
            name: "👻 OMEGA: Evasión & Stealth",
            description: "Esquiva CDN, rotación IP, y DPI Bypass",
            headers: [
                "X-APE-IDENTITY-MORPH", "X-APE-IDENTITY-ROTATION-INTERVAL", "X-APE-EVASION-MODE",
                "X-APE-EVASION-DNS-OVER-HTTPS", "X-APE-EVASION-SNI-OBFUSCATION", "X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE",
                "X-APE-EVASION-GEO-PHANTOM", "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS", "X-APE-IP-ROTATION-ENABLED",
                "X-APE-IP-ROTATION-STRATEGY", "X-APE-STEALTH-UA", "X-APE-STEALTH-XFF",
                "X-APE-STEALTH-FINGERPRINT", "X-APE-SWARM-ENABLED", "X-APE-SWARM-PEERS"
            ]
        },
        omega_transport: {
            name: "🏎️ OMEGA: Transporte L7 CMAF",
            description: "Protocolos Ultra Low Latency CMAF y buffers predictivos",
            headers: [
                "X-APE-TRANSPORT-PROTOCOL", "X-APE-TRANSPORT-CHUNK-SIZE", "X-APE-TRANSPORT-FALLBACK-1",
                "X-APE-CACHE-STRATEGY", "X-APE-CACHE-SIZE", "X-APE-CACHE-PREFETCH",
                "X-APE-BUFFER-STRATEGY", "X-APE-BUFFER-PRELOAD-SEGMENTS", "X-APE-BUFFER-DYNAMIC-ADJUSTMENT",
                "X-APE-BUFFER-NEURAL-PREDICTION"
            ]
        },
        omega_qos: {
            name: "🎯 OMEGA: Telchemy QoS / QoE",
            description: "Diagnóstico perceptual TVQM en tiempo real",
            headers: [
                "X-APE-QOS-ENABLED", "X-APE-QOS-DSCP", "X-APE-QOS-PRIORITY",
                "X-APE-POLYMORPHIC-ENABLED", "X-APE-POLYMORPHIC-IDEMPOTENT", "X-TELCHEMY-TVQM",
                "X-TELCHEMY-TR101290", "X-TELCHEMY-IMPAIRMENT-GUARD", "X-TELCHEMY-BUFFER-POLICY",
                "X-TELCHEMY-GOP-POLICY"
            ]
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // PERFILES DEFAULT P0-P5
    // ═══════════════════════════════════════════════════════════════════════
    const DEFAULT_PROFILES = {
        P0: {
            id: "P0",
            name: "ULTRA_EXTREME",
            level: 6,
            quality: "ULTRA",
            description: "ULTRA EXTREME - Máxima agresividad para canales críticos (49.8 Mbps)",
            color: "#dc2626",
            settings: {
                resolution: "3840x2160",
                buffer: 50000,
                buffer_min: 5000,
                buffer_max: 100000,
                network_cache: 60000,
                live_cache: 60000,
                file_cache: 15000,
                strategy: "ultra-aggressive",
                bitrate: 13.4,
                t1: 17.4,
                t2: 21.4,
                playerBuffer: 50000,
                fps: 60,
                codec: "H265",
                headersCount: 235,
                prefetch_segments: 500,
                prefetch_parallel: 250,
                prefetch_buffer_target: 600000,
                prefetch_min_bandwidth: 500000000,
                segment_duration: 2,
                bandwidth_guarantee: 500,
                reconnect_timeout_ms: 5,
                reconnect_max_attempts: 200,
                reconnect_delay_ms: 0,
                // HEVC/H.265 Optimization (configurable)
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10-HDR',
                color_space: 'BT2020',
                chroma_subsampling: '4:2:0',
                transfer_function: 'SMPTE2084',
                matrix_coefficients: 'BT2020NC',
                compression_level: 1,
                sharpen_sigma: 0.02,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le'
            },
            vlcopt: {
                "network-caching": "60000",
                "clock-jitter": "0",
                "clock-synchro": "0",
                "live-caching": "60000",
                "file-caching": "15000",
                "http-user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            },
            kodiprop: {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]"
            },
            enabledCategories: ["identity", "connection", "cache", "cors", "ape_core", "playback", "codecs", "cdn", "metadata", "extra", "ott_navigator", "streaming_control", "security", "hdr_color", "resolution_advanced", "audio_premium", "parallel_download", "anti_freeze", "abr_control"],
            headerOverrides: {}
        },

        P1: {
            id: "P1",
            name: "8K_SUPREME",
            level: 5,
            quality: "8K",
            description: "8K SUPREME - Flujo de ultra alta definición (159.3 Mbps)",
            color: "#ea580c",
            settings: {
                resolution: "7680x4320",
                buffer: 40000,
                buffer_min: 4000,
                buffer_max: 80000,
                network_cache: 50000,
                live_cache: 50000,
                file_cache: 12000,
                strategy: "ultra-aggressive",
                bitrate: 42.9,
                t1: 55.8,
                t2: 68.6,
                playerBuffer: 40000,
                fps: 60,
                codec: "H265",
                headersCount: 185,
                prefetch_segments: 400,
                prefetch_parallel: 200,
                prefetch_buffer_target: 500000,
                prefetch_min_bandwidth: 400000000,
                segment_duration: 2,
                bandwidth_guarantee: 400,
                reconnect_timeout_ms: 5,
                reconnect_max_attempts: 200,
                reconnect_delay_ms: 0,
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10-HDR',
                color_space: 'BT2020',
                chroma_subsampling: '4:2:0',
                transfer_function: 'SMPTE2084',
                matrix_coefficients: 'BT2020NC',
                compression_level: 1,
                sharpen_sigma: 0.02,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le'
            },
            vlcopt: {
                "network-caching": "50000",
                "clock-jitter": "0",
                "clock-synchro": "0",
                "live-caching": "50000",
                "file-caching": "12000",
                "http-user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/13.1-P1"
            },
            kodiprop: {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]"
            },
            enabledCategories: ["identity", "connection", "cache", "cors", "ape_core", "playback", "codecs", "cdn", "metadata", "extra", "ott_navigator", "streaming_control", "security", "hdr_color", "resolution_advanced", "audio_premium", "parallel_download", "anti_freeze", "abr_control"],
            headerOverrides: {}
        },

        P2: {
            id: "P2",
            name: "4K_EXTREME",
            level: 4,
            quality: "4K",
            description: "4K EXTREME - Optimizado para contenido 2160p (49.8 Mbps)",
            color: "#ca8a04",
            settings: {
                resolution: "3840x2160",
                buffer: 35000,
                buffer_min: 3500,
                buffer_max: 70000,
                network_cache: 45000,
                live_cache: 45000,
                file_cache: 10000,
                strategy: "ultra-aggressive",
                bitrate: 13.4,
                t1: 17.4,
                t2: 21.4,
                playerBuffer: 35000,
                fps: 60,
                codec: "H265",
                headersCount: 158,
                prefetch_segments: 350,
                prefetch_parallel: 180,
                prefetch_buffer_target: 450000,
                prefetch_min_bandwidth: 350000000,
                segment_duration: 2,
                bandwidth_guarantee: 350,
                reconnect_timeout_ms: 5,
                reconnect_max_attempts: 200,
                reconnect_delay_ms: 0,
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10-HDR',
                color_space: 'BT2020',
                chroma_subsampling: '4:2:0',
                transfer_function: 'SMPTE2084',
                matrix_coefficients: 'BT2020NC',
                compression_level: 1,
                sharpen_sigma: 0.03,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le'
            },
            vlcopt: {
                "network-caching": "45000",
                "clock-jitter": "0",
                "clock-synchro": "0",
                "live-caching": "45000",
                "file-caching": "10000",
                "http-user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/13.1-P2"
            },
            kodiprop: {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]"
            },
            enabledCategories: ["identity", "connection", "cache", "cors", "ape_core", "playback", "codecs", "cdn", "metadata", "extra", "ott_navigator", "streaming_control", "security", "hdr_color", "resolution_advanced", "audio_premium", "parallel_download", "anti_freeze", "abr_control"],
            headerOverrides: {}
        },

        P3: {
            id: "P3",
            name: "FHD_ADVANCED",
            level: 3,
            quality: "FHD",
            description: "FHD ADVANCED - Estándar Full HD con headers balanceados (18.7 Mbps)",
            color: "#16a34a",
            settings: {
                resolution: "1920x1080",
                buffer: 30000,
                buffer_min: 3000,
                buffer_max: 60000,
                network_cache: 40000,
                live_cache: 40000,
                file_cache: 8000,
                strategy: "ultra-aggressive",
                bitrate: 3.7,
                t1: 4.8,
                t2: 6.0,
                playerBuffer: 30000,
                fps: 50,
                codec: "H265",
                headersCount: 72,
                prefetch_segments: 300,
                prefetch_parallel: 150,
                prefetch_buffer_target: 400000,
                prefetch_min_bandwidth: 300000000,
                segment_duration: 2,
                bandwidth_guarantee: 300,
                reconnect_timeout_ms: 5,
                reconnect_max_attempts: 200,
                reconnect_delay_ms: 0,
                hevc_tier: 'HIGH',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN-10',
                color_space: 'BT709',
                chroma_subsampling: '4:2:0',
                transfer_function: 'BT1886',
                matrix_coefficients: 'BT709',
                compression_level: 1,
                sharpen_sigma: 0.03,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main10',
                pixel_format: 'yuv420p10le'
            },
            vlcopt: {
                "network-caching": "40000",
                "clock-jitter": "0",
                "clock-synchro": "0",
                "live-caching": "40000",
                "file-caching": "8000",
                "http-user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/13.1-P3"
            },
            kodiprop: {
                "inputstream.adaptive.manifest_type": "hls",
                "inputstream.adaptive.stream_headers": "[ENCODED_HEADERS]"
            },
            enabledCategories: ["identity", "connection", "cache", "cors", "ape_core", "playback", "codecs", "cdn", "metadata", "extra", "ott_navigator", "streaming_control", "security", "hdr_color", "resolution_advanced", "audio_premium", "parallel_download", "anti_freeze", "abr_control"],
            headerOverrides: {}
        },

        P4: {
            id: "P4",
            name: "HD_STABLE",
            level: 2,
            quality: "HD",
            description: "HD STABLE - Compatibilidad máxima para 720p (13.8 Mbps)",
            color: "#0891b2",
            settings: {
                resolution: "1280x720",
                buffer: 25000,
                buffer_min: 2500,
                buffer_max: 50000,
                network_cache: 35000,
                live_cache: 35000,
                file_cache: 7000,
                strategy: "ultra-aggressive",
                bitrate: 2.8,
                t1: 3.6,
                t2: 4.5,
                playerBuffer: 25000,
                fps: 60,
                codec: "H265",
                headersCount: 62,
                prefetch_segments: 250,
                prefetch_parallel: 120,
                prefetch_buffer_target: 350000,
                prefetch_min_bandwidth: 250000000,
                segment_duration: 2,
                bandwidth_guarantee: 250,
                reconnect_timeout_ms: 5,
                reconnect_max_attempts: 200,
                reconnect_delay_ms: 0,
                hevc_tier: 'MAIN',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN',
                color_space: 'BT709',
                chroma_subsampling: '4:2:0',
                transfer_function: 'BT1886',
                matrix_coefficients: 'BT709',
                compression_level: 1,
                sharpen_sigma: 0.05,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main',
                pixel_format: 'yuv420p'
            },
            vlcopt: {
                "network-caching": "35000",
                "clock-jitter": "0",
                "clock-synchro": "0",
                "live-caching": "35000",
                "file-caching": "7000",
                "http-user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/13.1-P4"
            },
            kodiprop: {
                "inputstream.adaptive.manifest_type": "hls"
            },
            enabledCategories: ["identity", "connection", "cache", "cors", "ape_core", "playback", "codecs", "cdn", "metadata", "extra", "ott_navigator", "streaming_control", "security", "hdr_color", "resolution_advanced", "audio_premium", "parallel_download", "anti_freeze", "abr_control"],
            headerOverrides: {}
        },

        P5: {
            id: "P5",
            name: "SD_FAILSAFE",
            level: 1,
            quality: "SD",
            description: "SD FAILSAFE - Resiliencia extrema para conexiones lentas (7.4 Mbps)",
            color: "#6366f1",
            settings: {
                resolution: "854x480",
                buffer: 20000,
                buffer_min: 2000,
                buffer_max: 40000,
                network_cache: 30000,
                live_cache: 30000,
                file_cache: 5000,
                strategy: "ultra-aggressive",
                bitrate: 1.5,
                t1: 2.0,
                t2: 2.4,
                playerBuffer: 20000,
                fps: 25,
                codec: "H265",
                headersCount: 41,
                prefetch_segments: 200,
                prefetch_parallel: 100,
                prefetch_buffer_target: 300000,
                prefetch_min_bandwidth: 200000000,
                segment_duration: 2,
                bandwidth_guarantee: 200,
                reconnect_timeout_ms: 5,
                reconnect_max_attempts: 200,
                reconnect_delay_ms: 0,
                hevc_tier: 'MAIN',
                hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: 'MAIN',
                color_space: 'BT709',
                chroma_subsampling: '4:2:0',
                transfer_function: 'BT1886',
                matrix_coefficients: 'BT709',
                compression_level: 1,
                sharpen_sigma: 0.05,
                rate_control: 'VBR',
                entropy_coding: 'CABAC',
                video_profile: 'main',
                pixel_format: 'yuv420p'
            },
            vlcopt: {
                "network-caching": "30000",
                "clock-jitter": "0",
                "clock-synchro": "0",
                "live-caching": "30000",
                "file-caching": "5000",
                "http-user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 APE-Engine/13.1-P5"
            },
            kodiprop: {},
            enabledCategories: ["identity", "connection", "cache", "cors", "ape_core", "playback", "codecs", "cdn", "metadata", "extra", "ott_navigator", "streaming_control", "security", "hdr_color", "resolution_advanced", "audio_premium", "parallel_download", "anti_freeze", "abr_control"],
            headerOverrides: {}
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // VALORES DEFAULT DE HEADERS
    // ═══════════════════════════════════════════════════════════════════════
    const DEFAULT_HEADER_VALUES = {
        // Identity
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
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
        "Origin": "http://line.tivi-ott.net",
        "Referer": "http://line.tivi-ott.net/",
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
        "X-APE-AI-FRAME-INTERPOLATION": "RIFE_V4",
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
        "X-APE-AV1-FALLBACK-CHAIN": "AV1>HEVC>H264>MPEG2",
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
         * Guarda perfiles, manifiesto y headers estratégicos en storage
         */
        save() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
            localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(this.manifest));
            localStorage.setItem(STRATEGIC_HEADERS_STORAGE_KEY, JSON.stringify(this.strategicHeaders));
            console.log('💾 Perfiles APE v9.0, Manifiesto y Headers Estratégicos guardados');
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

                    // 🔄 Valores dinámicos desde perfil
                    if (headerName === 'X-Max-Resolution') {
                        value = profile.settings?.resolution || value;
                    }
                    if (headerName === 'X-Max-Bitrate' && profile.settings?.bitrate) {
                        value = String(profile.settings.bitrate * 1000);
                    }

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
    window.APE_PROFILES_CONFIG = instance;

    console.log('%c🎚️ APE Profiles Config v9.0 EXTENDED Cargado', 'color: #10b981; font-weight: bold;');
    console.log(`   Perfiles: ${Object.keys(instance.profiles).length}`);
    console.log(`   Categorías: ${Object.keys(instance.categories).length}`);
    console.log(`   Headers Totales: 99 (65 originales + 27 calidad visual + 7 ABR control)`);

})();
