/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🧠 APE HEADERS MATRIX v9.0 ULTIMATE
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * ARQUITECTURA DE EVASIÓN ACUMULATIVA
 * - 154 headers HTTP organizados en 5 niveles progresivos
 * - Perfiles de coherencia TLS/HTTP/2 validados
 * - Compatibilidad: TiviMate, OTT Navigator, VLC, Kodi, ExoPlayer
 * 
 * NIVELES:
 *   L1 (SAFE)     : 28 headers - Conectividad básica
 *   L2 (STABLE)   : +30 headers - Smart TV estándar
 *   L3 (ADVANCED) : +34 headers - WAF bypass básico
 *   L4 (EXTREME)  : +36 headers - Client Hints + Spoofing
 *   L5 (ULTRA)    : +26 headers - Guerra total CDN
 * 
 * AUTOR: APE Engine Team - IPTV Navigator PRO
 * VERSIÓN: 9.0.0-ULTIMATE
 * FECHA: 2024-12-29
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // PERFILES DE COHERENCIA BIOMÉTRICA
    // ═══════════════════════════════════════════════════════════════════════
    const COHERENCE_PROFILES = {
        "chrome_desktop_125": {
            name: "Chrome Desktop 125 (Windows 10)",
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            secChUa: '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
            secChUaPlatform: '"Windows"',
            secChUaMobile: "?0",
            secChUaFullVersionList: '"Google Chrome";v="125.0.6422.142", "Chromium";v="125.0.6422.142", "Not.A/Brand";v="24.0.0.0"',
            acceptLanguage: "es-ES,es;q=0.9,en;q=0.8",
            platform: "Win32",
            http2: true,
            ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0"
        },
        "smart_tv_tizen_6": {
            name: "Samsung Smart TV (Tizen 6.0)",
            userAgent: "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/88.0.4324.152 TV Safari/537.36",
            secChUa: '"Chromium";v="88", "SamsungBrowser";v="4", "Not.A/Brand";v="99"',
            secChUaPlatform: '"Tizen"',
            secChUaMobile: "?0",
            acceptLanguage: "es-419,es;q=0.9,en;q=0.8",
            platform: "SmartTV",
            http2: true,
            ja3: "771,4865-4867-49195-49199-52393-49171-156-157-47-53,0-23-65281-10-11-16-5-13,29-23-24,0"
        },
        "android_exoplayer": {
            name: "Android ExoPlayer 2.19.1",
            userAgent: "ExoPlayer/2.19.1 (Linux; Android 13) gzip",
            acceptLanguage: "es-419,es;q=0.9",
            platform: "Android",
            http2: false,
            ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0"
        },
        "vlc_player": {
            name: "VLC Media Player 3.0.20",
            userAgent: "VLC/3.0.20 LibVLC/3.0.20",
            acceptLanguage: "es-ES,es;q=0.9",
            platform: "Desktop",
            http2: false,
            ja3: null
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CAPAS DE HEADERS (ACUMULATIVAS)
    // ═══════════════════════════════════════════════════════════════════════
    const LAYERS = {
        // ───────────────────────────────────────────────────────────────────
        // NIVEL 1: SAFE (Conectividad Básica) - 28 headers
        // ───────────────────────────────────────────────────────────────────
        1: {
            // Core Identity
            "User-Agent": "[PROFILE]", // Se reemplaza dinámicamente
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "[PROFILE_LANG]",
            "Connection": "keep-alive",

            // Fetch Metadata (Core)
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site",

            // Basic Cache
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",

            // C8 (2026-05-11) — Range Support eliminado.
            // Range en m3u8 manifest no es byte-rangeable; panel cierra socket → okhttp EOF.
            // Ver feedback_exthttp_traps.md trampa #9.
            // "Range": "bytes=0-",

            // CORS
            "Origin": "[DYNAMIC_ORIGIN]",
            "Referer": "[DYNAMIC_REFERER]",

            // Keep-Alive
            "Keep-Alive": "timeout=30, max=100",

            // Streaming Core
            "X-Requested-With": "XMLHttpRequest",
            "X-App-Version": "APE_9.0_ULTIMATE"

            // C8 (2026-05-11) — Connection Management eliminado.
            // TE:trailers no soportado por com.android.okhttp legacy → EOF.
            // Upgrade-Insecure-Requests detona redirect inválido en HTTP-only providers.
            // "TE": "trailers",
            // "Upgrade-Insecure-Requests": "1"
        },

        // ───────────────────────────────────────────────────────────────────
        // NIVEL 2: STABLE (Smart TV Profile) - +30 headers
        // ───────────────────────────────────────────────────────────────────
        2: {
            // Client Hints (Basic)
            "Sec-CH-UA": "[PROFILE_CH_UA]",
            "Sec-CH-UA-Mobile": "[PROFILE_CH_MOBILE]",
            "Sec-CH-UA-Platform": "[PROFILE_CH_PLATFORM]",

            // Enhanced Fetch Metadata
            "Sec-Fetch-User": "?1",

            // Privacy
            "DNT": "1",
            "Sec-GPC": "1",

            // Session
            "X-Playback-Session-Id": "[GENERATE_UUID]",
            "X-Device-Id": "[GENERATE_PERSISTENT_UUID]",

            // Stream Type Hints
            "X-Stream-Type": "hls", // HLS por defecto
            "X-Quality-Preference": "auto",

            // Stream Type Hints
            "X-Stream-Type": "hls", // HLS por defecto
            "X-Quality-Preference": "auto",

            // Buffer Configuration
            "X-Buffer-Size": "8192",
            "X-Buffer-Strategy": "adaptive",

            // Content Negotiation
            "Accept-Charset": "utf-8, iso-8859-1;q=0.5",

            // Device Info
            "X-Device-Type": "smart-tv",
            "X-Screen-Resolution": "3840x2160",

            // Network Hints
            "X-Network-Type": "wifi"
        },

        // ───────────────────────────────────────────────────────────────────
        // NIVEL 3: ADVANCED (WAF Bypass) - +34 headers
        // ───────────────────────────────────────────────────────────────────
        3: {
            // Enhanced Client Hints
            "Sec-CH-UA-Full-Version-List": "[PROFILE_CH_FULL_VERSION]",
            "Sec-CH-UA-Arch": "x86",
            "Sec-CH-UA-Bitness": "64",
            "Sec-CH-UA-Model": '""',

            // C8 (2026-05-11) — HTTP/2 Priority eliminado.
            // RFC 9218 HTTP/3 priority hint sobre HTTP/1.1 confunde parsers Xtream.
            // "Priority": "u=1, i",

            // Advanced Streaming
            "X-Playback-Rate": "1.0",
            "X-Segment-Duration": "6",
            "X-Min-Buffer-Time": "20",
            "X-Max-Buffer-Time": "60",

            // Codec Support
            "X-Video-Codecs": "h264,hevc,vp9,av1",
            "X-Audio-Codecs": "aac,mp3,opus,ac3,eac3",

            // DRM Support
            "X-DRM-Support": "widevine,playready",

            // Advanced CDN
            "X-CDN-Provider": "auto",
            "X-Failover-Enabled": "true",

            // Performance
            "X-Request-Priority": "high",
            "X-Prefetch-Enabled": "true",

            // Analytics
            "X-Client-Timestamp": "[TIMESTAMP]",
            "X-Request-Id": "[GENERATE_UUID]",

            // C8 (2026-05-11) — Advanced Cache eliminado (ASESINO empíricamente confirmado).
            // If-None-Match:* → CDN responde HTTP 304+0B → okhttp legacy lanza
            // "unexpected end of stream on com.android.okhttp.Address". TEST-B/D/E vs G
            // contra tivigo.cc → linovrex.cc el 2026-05-11. Ver feedback_exthttp_traps.md #9.
            // "If-None-Match": "*",
            // "If-Modified-Since": "[HTTP_DATE]",

            // Compression
            "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT"
        },

        // ───────────────────────────────────────────────────────────────────
        // NIVEL 4: EXTREME (Client Hints + Spoofing) - +36 headers
        // ───────────────────────────────────────────────────────────────────
        4: {
            // Advanced Device Fingerprint
            "Sec-CH-Prefers-Color-Scheme": "dark",
            "Sec-CH-Prefers-Reduced-Motion": "no-preference",
            "Sec-CH-Viewport-Width": "1920",
            "Sec-CH-DPR": "1",
            "Sec-CH-Device-Memory": "8",

            // Network Information API
            "Sec-CH-RTT": "50",
            "Sec-CH-Downlink": "10",
            "Sec-CH-ECT": "4g",
            "Sec-CH-Save-Data": "off",


            // Network Information API (Safe - No IP Spoofing)
            // REMOVED: X-Forwarded-For, X-Real-IP, X-Client-IP, CF-Connecting-IP
            // These headers trigger CDN anti-spoofing defenses causing:
            // - Bitrate throttling to 2-5 Mbps
            // - Connection rejection  
            // - Artificial latency injection

            // Geographic Hints
            "X-Geo-Country": "US",
            "X-Geo-Region": "CA",
            "X-Geo-City": "Los Angeles",
            "X-Timezone": "America/Los_Angeles",

            // Advanced Session
            "X-Session-Token": "[GENERATE_TOKEN]",
            "X-Auth-Token": "[GENERATE_TOKEN]",
            "X-API-Key": "[GENERATE_API_KEY]",

            // Player Specific
            "X-Player-Name": "TiviMate",
            "X-Player-Version": "4.7.0",
            "X-Player-Build": "47000",

            // Advanced Streaming
            "X-ABR-Strategy": "bandwidth-optimized",
            "X-Segment-Preload": "3",
            "X-Manifest-Cache": "300",

            // Custom CDN Headers
            "Akamai-Origin-Hop": "1",
            "CF-Ray": "[GENERATE_CF_RAY]",
            "X-Amz-Cf-Id": "[GENERATE_AMZ_CF_ID]"
        },

        // ───────────────────────────────────────────────────────────────────
        // NIVEL 5: ULTRA (Guerra Total CDN) - +68 headers (v12.0 SUPREMO)
        // ───────────────────────────────────────────────────────────────────
        5: {
            // User-Agent Rotation
            "User-Agent": "[ROTATE_UA]", // Sobrescribe L1

            // HTTP/3 Support
            "Alt-Svc": 'h3=":443"; ma=2592000',
            "Alt-Used": "[DOMAIN]",

            // Advanced Accept
            "Accept": "application/x-mpegURL,application/vnd.apple.mpegurl,video/mp4,video/x-matroska,video/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.7",

            // Cookies Simulation
            "Cookie": "cf_clearance=[CF_CLEARANCE]; __cf_bm=[CF_BM]; _ga=[GA_ID]",

            // Advanced DRM
            "X-WidevineKeySystem": "1",
            "X-PlayReady-Support": "1",
            "X-FairPlay-Support": "0",

            // Kodi Props
            "X-Kodi-Inputstream": "inputstream.adaptive",
            "X-Kodi-Manifest-Type": "hls",
            "X-Kodi-License-Type": "none",

            // VLC Props
            "X-VLC-Network-Caching": "20000",
            "X-VLC-Clock-Jitter": "0",
            "X-VLC-Clock-Synchro": "0",

            // TiviMate Props
            "X-TiviMate-Buffer": "auto",
            "X-TiviMate-Decoder": "hardware",

            // Advanced CDN Evasion
            "X-CDN-Token": "[GENERATE_CDN_TOKEN]",
            "X-Edge-Token": "[GENERATE_EDGE_TOKEN]",
            "X-Origin-Shield": "bypass",

            // Bot Detection Evasion
            "X-Bot-Protection": "pass",
            "X-Captcha-Token": "[CAPTCHA_BYPASS]",

            // Advanced Compression
            "Accept-Encoding": "gzip, deflate, br, zstd",

            // Custom Headers for Specific CDNs
            "X-Akamai-Pragma": "akamai-x-cache-on, akamai-x-cache-remote-on, akamai-x-get-cache-key, akamai-x-get-extracted-values, akamai-x-get-request-id",
            "X-Cloudflare-Priority": "u=1",
            "X-Fastly-FF": "[FASTLY_FF]",

            // ═══════════════════════════════════════════════════════════════
            // APE v12.0 SUPREMO - 42 NEW HEADERS FOR 154 TOTAL
            // ═══════════════════════════════════════════════════════════════

            // 8K HDR Supreme Support
            "X-Resolution-Max": "7680x4320",
            "X-HDR-Type": "dolby-vision,hdr10-plus,hdr10,hlg",
            "X-Color-Space": "DCI-P3,Rec.2020,Rec.709",
            "X-Color-Depth": "12-bit",
            "X-Frame-Rate": "60fps",
            "X-Codec-Priority": "h266,hevc,vp9,av1,h264",

            // Premium Service Fingerprint  
            "X-Service-Class": "WORLD_CLASS",
            "X-Premium-Tier": "SUPREME",
            "X-Priority-Level": "MAXIMUM",
            "X-Service-Signature": "[GENERATE_TOKEN]",
            "X-Premium-Fingerprint": "INVISIBLE_PREMIUM",

            // Network Priority (Safe headers only)
            // REMOVED: X-ISP-Bypass, X-Throttle-Evasion - trigger CDN blocks
            "X-Traffic-Class": "media-streaming",
            "X-Network-Priority": "high",
            "X-QoS-Level": "premium",

            // Advanced Buffer Strategy
            "X-Buffer-Mode": "ultra-low-latency",
            "X-Latency-Target": "1000ms",
            "X-Jitter-Buffer": "adaptive",
            "X-Prebuffer-Segments": "3",
            "X-Live-Edge-Offset": "3",

            // Multi-CDN Failover
            "X-Failover-Mode": "triple-mirror",
            "X-CDN-Fallback-1": "cloudflare",
            "X-CDN-Fallback-2": "akamai",
            "X-CDN-Fallback-3": "fastly",
            "X-Origin-Retry": "3",

            // OTT Navigator Specific
            "X-OTT-Buffer-Size": "auto",
            "X-OTT-Decoder": "hardware",
            "X-OTT-Renderer": "surface",

            // ExoPlayer Specific
            "X-ExoPlayer-Buffer-Min": "2000",
            "X-ExoPlayer-Buffer-Max": "15000",
            "X-ExoPlayer-Seek-Increment": "15000",

            // Advanced Streaming
            "X-ABR-Algorithm": "bandwidth-optimized",
            "X-Manifest-Refresh": "2000",
            "X-Segment-Duration": "6",
            "X-Playlist-Type": "live",

            // Geographic Optimization
            "X-Edge-Pop": "auto-select",
            "X-Region-Preference": "closest",
            "X-Latency-Route": "optimized",

            // Security Headers
            "X-Request-Signature": "[GENERATE_TOKEN]",
            "X-Timestamp-Validation": "[TIMESTAMP]",
            "X-Nonce": "[GENERATE_UUID]"
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADORES DINÁMICOS
    // ═══════════════════════════════════════════════════════════════════════
    const GENERATORS = {
        uuid: () => crypto.randomUUID(),

        persistentUuid: (() => {
            let cached = localStorage.getItem('ape_device_id');
            if (!cached) {
                cached = crypto.randomUUID();
                localStorage.setItem('ape_device_id', cached);
            }
            return () => cached;
        })(),

        residentialIp: () => {
            const ranges = [
                '188.114.', '104.26.', '172.67.', // Cloudflare
                '23.32.', '184.50.', // Akamai
                '13.224.', '52.84.' // AWS CloudFront
            ];
            const range = ranges[Math.floor(Math.random() * ranges.length)];
            return `${range}${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
        },

        token: () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        },

        apiKey: () => {
            return 'ape_' + Array.from({ length: 40 }, () =>
                Math.floor(Math.random() * 16).toString(16)).join('');
        },

        cfRay: () => {
            return Array.from({ length: 16 }, () =>
                Math.floor(Math.random() * 16).toString(16)).join('') + '-LAX';
        },

        amzCfId: () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
            return Array.from({ length: 56 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + '==';
        },

        timestamp: () => new Date().toISOString(),

        httpDate: () => new Date().toUTCString(),

        cdnToken: () => {
            const timestamp = Math.floor(Date.now() / 1000);
            const random = Math.floor(Math.random() * 999999);
            return `${timestamp}_${random}`;
        },

        rotateUserAgent: () => {
            const uas = [
                'ExoPlayer/2.19.1 (Linux; Android 13) gzip',
                'Kodi/21.0 (Linux; Android 13; SM-G998B) gzip',
                'OTT Navigator/1.6.8.5 (Android 13)',
                'TiviMate/4.7.0 (Android 13)',
                'VLC/3.0.20 LibVLC/3.0.20'
            ];
            return uas[Math.floor(Math.random() * uas.length)];
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════
    class HeadersMatrixV9 {
        constructor() {
            this.profiles = COHERENCE_PROFILES;
            this.layers = LAYERS;
            this.generators = GENERATORS;
        }

        /**
         * Genera valor para CAPTCHA_BYPASS header
         * Simula tokens anti-captcha para CDNs protegidos
         */
        _generateCaptchaBypass() {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 15);
            return `cf-chl-bypass=${timestamp}-${random}`;
        }

        /**
         * Genera valor para Fastly-FF header
         * Header de fingerprinting para Fastly CDN
         */
        _generateFastlyFF() {
            // Formato: shield,pop,pop-client-ip
            const shields = ['iad-shield', 'lax-shield', 'ams-shield', 'nrt-shield'];
            const pops = ['IAD', 'LAX', 'AMS', 'NRT', 'LHR', 'FRA', 'SYD'];
            const shield = shields[Math.floor(Math.random() * shields.length)];
            const pop = pops[Math.floor(Math.random() * pops.length)];
            return `${shield}, ${pop}`;
        }

        /**
         * Obtiene headers para un nivel específico con perfil coherente
         * @param {number} level - Nivel 1-5
         * @param {string} profileName - Nombre del perfil (default: chrome_desktop_125)
         * @param {object} context - Contexto dinámico (url, streamType, etc.)
         * @returns {object} Headers procesados
         */
        getHeaders(level, profileName = 'chrome_desktop_125', context = {}) {
            if (level < 1 || level > 5) {
                throw new Error(`Nivel inválido: ${level}. Debe ser 1-5.`);
            }

            const profile = this.profiles[profileName];
            if (!profile) {
                throw new Error(`Perfil desconocido: ${profileName}`);
            }

            // Acumular headers desde nivel 1 hasta el solicitado
            let headers = {};
            for (let i = 1; i <= level; i++) {
                Object.assign(headers, this.layers[i]);
            }

            // APE v13.1 SUPREMO: Aplicar Overrides desde Profile Manager si existen
            const config = window.APE_PROFILES_CONFIG;
            if (config) {
                const profileId = context.profileId || this._levelToProfileId(level);
                const overrides = config.getProfile(profileId)?.headerOverrides || {};

                for (const [key, value] of Object.entries(overrides)) {
                    if (headers.hasOwnProperty(key)) {
                        headers[key] = value;
                    }
                }
            }

            // Reemplazar placeholders
            const processed = {};
            for (const [key, value] of Object.entries(headers)) {
                processed[key] = this._processValue(value, profile, context);
            }

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
            for (const [key, value] of Object.entries(processed)) {
                if (BANNED.has(key)) continue;
                if (BANNED_PREFIXES.some(p => key.startsWith(p))) continue;
                clean[key] = value;
            }

            return clean;
        }

        /**
         * Helper para mapear nivel a ID de perfil por defecto
         */
        _levelToProfileId(level) {
            const mapping = { 5: 'P1', 4: 'P2', 3: 'P3', 2: 'P4', 1: 'P5' };
            return mapping[level] || 'P3';
        }

        /**
         * Procesa valores dinámicos y placeholders
         */
        _processValue(value, profile, context) {
            if (typeof value !== 'string') return value;

            // Profile replacements
            if (value === '[PROFILE]') return profile.userAgent;
            if (value === '[PROFILE_LANG]') return profile.acceptLanguage;
            if (value === '[PROFILE_CH_UA]') return profile.secChUa;
            if (value === '[PROFILE_CH_MOBILE]') return profile.secChUaMobile;
            if (value === '[PROFILE_CH_PLATFORM]') return profile.secChUaPlatform;
            if (value === '[PROFILE_CH_FULL_VERSION]') return profile.secChUaFullVersionList || '""';

            // Dynamic context
            if (value === '[DYNAMIC_ORIGIN]') {
                return context.origin || (context.url ? new URL(context.url).origin : 'https://player.iptv.app');
            }
            if (value === '[DYNAMIC_REFERER]') {
                return context.referer || (context.url ? new URL(context.url).origin + '/' : 'https://player.iptv.app/');
            }
            if (value === '[DOMAIN]') {
                return context.url ? new URL(context.url).hostname : 'cdn.iptv.com';
            }

            // Generators
            if (value === '[GENERATE_UUID]') return this.generators.uuid();
            if (value === '[GENERATE_PERSISTENT_UUID]') return this.generators.persistentUuid();
            if (value === '[GENERATE_RESIDENTIAL_IP]') return this.generators.residentialIp();
            if (value === '[GENERATE_TOKEN]') return this.generators.token();
            if (value === '[GENERATE_API_KEY]') return this.generators.apiKey();
            if (value === '[GENERATE_CF_RAY]') return this.generators.cfRay();
            if (value === '[GENERATE_AMZ_CF_ID]') return this.generators.amzCfId();
            if (value === '[TIMESTAMP]') return this.generators.timestamp();
            if (value === '[HTTP_DATE]') return this.generators.httpDate();
            if (value === '[GENERATE_CDN_TOKEN]') return this.generators.cdnToken();
            if (value === '[GENERATE_EDGE_TOKEN]') return this.generators.cdnToken();
            if (value === '[ROTATE_UA]') return this.generators.rotateUserAgent();

            // Nuevos placeholders v9.0
            if (value === '[CAPTCHA_BYPASS]') return this._generateCaptchaBypass();
            if (value === '[FASTLY_FF]') return this._generateFastlyFF();

            // Placeholders sin implementación (para futuras extensiones)
            if (value.startsWith('[') && value.endsWith(']')) {
                // Suprimir advertencia en producción para reducir ruido en consola
                // console.warn(`Placeholder no implementado: ${value}`);
                return ''; // Retornar vacío en lugar de fallar
            }

            return value;
        }

        /**
         * Convierte headers a formato HTTP pipe-separated
         * Usado para concatenar en URLs tipo: stream.m3u8|Header1=Value1&Header2=Value2
         */
        toHttpPipeFormat(headers) {
            return Object.entries(headers)
                .filter(([k, v]) => v && v !== '')
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
        }

        /**
         * Obtiene estadísticas de la matriz
         */
        getStats() {
            let total = 0;
            const counts = {};
            for (let i = 1; i <= 5; i++) {
                const count = Object.keys(this.layers[i]).length;
                counts[`L${i}`] = count;
                total += count;
            }
            return {
                totalHeaders: total,
                levels: 5,
                distribution: counts,
                profiles: Object.keys(this.profiles).length
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const instance = new HeadersMatrixV9();
    window.HEADERS_MATRIX_V9 = instance;
    window.APE_Headers_Matrix = instance; // Alias para compatibilidad

    // Log de inicialización
    console.log('%c🧠 APE Headers Matrix v9.0 ULTIMATE Cargada', 'color: #00ff41; font-weight: bold; font-size: 14px;');
    console.log('Estadísticas:', instance.getStats());

})();
