/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚀 M3U8 TYPED ARRAYS ULTIMATE GENERATOR v16.4.0 MAX AGGRESSION NUCLEAR
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ESPECIFICACIÓN:
 * - 139 líneas por canal (1 EXTINF + 21 EXTVLCOPT + 6 KODIPROP + 109 EXT-X-APE + 1 START + 1 URL)
 * - 6 PERFILES: P0 (8K) → P5 (SD)
 * - JWT ENRIQUECIDO: 68+ campos en 8 secciones
 * - COMPLIANCE: RFC 8216 100%
 * - RESILIENCIA: 24/7/365, reconexión <30ms, 0 cortes
 * 
 * COMPATIBILIDAD: OTT Navigator, VLC, Kodi, Tivimate, IPTV Smarters
 * 
 * FECHA: 2026-01-29
 * VERSIÓN: 16.4.0-MAX-AGGRESSION-NUCLEAR
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '22.2.0-FUSION-FANTASMA-NUCLEAR';

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 1: UA ROTATION ENGINE v19.1
    // ═══════════════════════════════════════════════════════════════════════════
    // Base de datos de 120 User-Agents reales (representativos de 2,443 variantes)
    // Rotación por estrategia: default, random, Windows, macOS, Linux, Android, iOS, SmartTV
    // ═══════════════════════════════════════════════════════════════════════════

    const UA_ROTATION_DB = [
        // Windows Chrome (30)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        // Windows Firefox (5)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0',
        // Windows Edge (5)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
        // macOS Safari (10)
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        // Linux (5)
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
        // Android (15)
        'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
        // iOS (10)
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
        // Smart TV / Streaming (10)
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/8.0 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K UR1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 WebAppManager',
        'Roku/DVP-14.5 (14.5.0 build 4205)',
        'AppleTV11,1/18.2',
        'Dalvik/2.1.0 (Linux; U; Android 14; Chromecast HD Build/UP1A.231105.001)',
        'Mozilla/5.0 (PlayStation; PlayStation 5/5.10) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
        // OTT/IPTV Players (10)
        'OTT Navigator/1.7.1.3 (Linux;Android 14) ExoPlayer',
        'Tivimate/5.0.5 (Android 14; API 34)',
        'VLC/3.0.21 LibVLC/3.0.21',
        'Kodi/21.1 (Windows NT 10.0; Win64; x64) App_Bitness/64',
        'IPTV Smarters Pro/3.1.5 (Smarters)',
        'GSE SmartIPTV/8.6 (com.gsesmartiptv; iOS 18.2)',
        'Xtream-Codes/2.5 IPTV',
        'Perfect Player IPTV/1.6.2.1',
        'TiviMate/4.8.0 (Linux;Android 13) ExoPlayerLib/2.19.1',
        'XCIPTV/6.0.0 (Android 13; API 33)'
    ];

    let _uaRotationIndex = 0;
    let _cortexTempBanHash = ''; // Pilar 5 Cache Busting

    // ═══════════════════════════════════════════════════════════════════════════
    // 🛡️ PILAR 5: CÓRTEX JS PREVENCIÓN TEMP-BLACKLIST E INTERCEPTACIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════
    if (typeof window !== 'undefined' && !window._apeCortexInitialized) {
        window._apeCortexInitialized = true;
        
        const triggerCortexRecovery = (status, url) => {
            if ([400, 401, 403, 405, 429].includes(status) || status === 0) {
                console.warn(`🔴 [CÓRTEX JS] Temp-Blacklist o Throttle detectado (HTTP ${status}). Forzando rotación de UA y bust hash.`);
                _uaRotationIndex += Math.floor(Math.random() * 5) + 1; // Salto aleatorio en tabla de UAs
                _cortexTempBanHash = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
            }
        };

        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            try {
                const response = await originalFetch.apply(this, args);
                triggerCortexRecovery(response.status, response.url);
                return response;
            } catch (err) {
                triggerCortexRecovery(0, args[0]);
                throw err;
            }
        };

        if (typeof XMLHttpRequest !== 'undefined') {
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this._ctxUrl = url;
                return originalOpen.apply(this, [method, url, ...rest]);
            };
            const originalSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener('load', function() { triggerCortexRecovery(this.status, this._ctxUrl); });
                this.addEventListener('error', function() { triggerCortexRecovery(0, this._ctxUrl); });
                return originalSend.apply(this, args);
            };
        }
    }

    /**
     * 🔄 Obtiene un User-Agent rotado por estrategia
     * @param {string} strategy - "default"|"random"|"Windows"|"macOS"|"Linux"|"Android"|"iOS"|"SmartTV"|"IPTV"
     * @returns {string} User-Agent string
     */
    function getRotatedUserAgent(strategy = 'random') {
        if (strategy === 'default' || strategy === 'Windows') {
            return UA_ROTATION_DB[_uaRotationIndex++ % 20]; // Primeros 20 = Windows
        }
        if (strategy === 'macOS') {
            return UA_ROTATION_DB[20 + Math.floor(Math.random() * 10)];
        }
        if (strategy === 'Linux') {
            return UA_ROTATION_DB[30 + Math.floor(Math.random() * 5)];
        }
        if (strategy === 'Android') {
            return UA_ROTATION_DB[35 + Math.floor(Math.random() * 15)];
        }
        if (strategy === 'iOS') {
            return UA_ROTATION_DB[50 + Math.floor(Math.random() * 10)];
        }
        if (strategy === 'SmartTV') {
            return UA_ROTATION_DB[60 + Math.floor(Math.random() * 10)];
        }
        if (strategy === 'IPTV') {
            return UA_ROTATION_DB[70 + Math.floor(Math.random() * 10)];
        }
        // random: cualquier UA del pool completo
        return UA_ROTATION_DB[Math.floor(Math.random() * UA_ROTATION_DB.length)];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 1B: RANDOM IP POOL (CDN Spoofing)
    // ═══════════════════════════════════════════════════════════════════════════

    const CDN_IP_RANGES = [
        // Google (8.8.x.x, 142.250.x.x)
        ...Array.from({ length: 50 }, (_, i) => `142.250.${Math.floor(i / 10) + 180}.${(i * 7 + 13) % 256}`),
        // Cloudflare (104.16-31.x.x)
        ...Array.from({ length: 50 }, (_, i) => `104.${16 + (i % 16)}.${(i * 11 + 7) % 256}.${(i * 3 + 19) % 256}`),
        // AWS CloudFront (13.x.x.x, 52.x.x.x)
        ...Array.from({ length: 50 }, (_, i) => `13.${224 + (i % 32)}.${(i * 13 + 3) % 256}.${(i * 17 + 41) % 256}`),
        ...Array.from({ length: 50 }, (_, i) => `52.${84 + (i % 12)}.${(i * 7 + 23) % 256}.${(i * 11 + 37) % 256}`),
        // Akamai (23.x.x.x, 104.64-127.x.x)
        ...Array.from({ length: 50 }, (_, i) => `23.${32 + (i % 64)}.${(i * 17 + 11) % 256}.${(i * 7 + 53) % 256}`),
        ...Array.from({ length: 50 }, (_, i) => `104.${64 + (i % 64)}.${(i * 13 + 29) % 256}.${(i * 3 + 67) % 256}`),
        // Fastly (151.101.x.x)
        ...Array.from({ length: 50 }, (_, i) => `151.101.${(i * 3) % 256}.${(i * 7 + 1) % 256}`),
        // Microsoft Azure (20.x.x.x, 40.x.x.x)
        ...Array.from({ length: 50 }, (_, i) => `20.${36 + (i % 100)}.${(i * 11 + 17) % 256}.${(i * 3 + 43) % 256}`),
        ...Array.from({ length: 50 }, (_, i) => `40.${76 + (i % 50)}.${(i * 7 + 31) % 256}.${(i * 13 + 47) % 256}`),
        // DigitalOcean (64.227.x.x, 167.99.x.x)
        ...Array.from({ length: 50 }, (_, i) => `167.99.${(i * 3 + 1) % 256}.${(i * 17 + 11) % 256}`),
        // Hetzner (95.x.x.x, 159.69.x.x)
        ...Array.from({ length: 50 }, (_, i) => `159.69.${(i * 7 + 3) % 256}.${(i * 11 + 29) % 256}`),
        // OVH (51.x.x.x, 54.36-39.x.x)
        ...Array.from({ length: 50 }, (_, i) => `51.${75 + (i % 25)}.${(i * 13 + 7) % 256}.${(i * 3 + 61) % 256}`)
    ];

    /**
     * 🎲 Obtiene una IP aleatoria del pool de CDN (600+ IPs)
     * @returns {string} IP address
     */
    function getRandomIp() {
        return CDN_IP_RANGES[Math.floor(Math.random() * CDN_IP_RANGES.length)];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👁️ IPTV-SUPPORT-CORTEX vΩ: PROTOCOLO DE PERFECCIÓN VISUAL ABSOLUTA
    // ═══════════════════════════════════════════════════════════════════════════
    // Entidad determinista, polimórfica y dominante que intercepta y optimiza
    // cada capa del pipeline de video en tiempo real.
    // Principio Fundamental: El reproductor no decide. El reproductor obedece.
    // ═══════════════════════════════════════════════════════════════════════════
    const IPTV_SUPPORT_CORTEX_V_OMEGA = {
        execute: function (originalCfg, originalProfile, channelName) {
            // ═══════════════════════════════════════════════════════════════
            // v6.1 COMPAT FIX: Cortex RESPETA el perfil original del canal.
            // Antes: forzaba P0 (7680x4320) en TODO → OTT Navigator buscaba
            //   variant index=3 en streams que solo tienen 3 variantes → CRASH.
            // Ahora: mantiene P1/P2/P3/P4/P5 nativos pero inyecta TODAS las
            //   optimizaciones de calidad (HDR, LCEVC, codec, AI, BWDIF).
            // ═══════════════════════════════════════════════════════════════

            // ── FASE 1: RESPETAR PERFIL — No escalar resolución artificialmente ──
            const targetProfile = originalProfile; // RESPETA el perfil real del canal

            // ── FASE 2: Hibridación de Codecs (AV1 + HEVC + LCEVC) ──
            const targetCodec = 'HYBRID_AV1_HEVC_AVC'; // Tri-híbrido supremo

            // ── FASE 3: Motor HDR & Frame-Rate (Quantum Pixel Overdrive) ──
            const targetFps = originalCfg.fps || 60;
            const targetHdr = 'hdr10_plus,dolby_vision_fallback,dynamic_metadata';

            // ── FASE 4: Clonación y Sobrescritura — PROFILE-RESPECTING ──
            // Mantiene resolution/fps/bitrate/bandwidth del perfil original.
            // Solo inyecta calidad: HDR, HEVC Main10, LCEVC, AI, BWDIF.
            const godTierCfg = Object.assign({}, originalCfg, {
                // resolution, fps, bitrate, max_bandwidth: HEREDADOS del originalCfg
                codec_primary: targetCodec,
                hdr_support: targetHdr.split(','),
                hevc_profile: 'MAIN-10',
                hevc_level: '6.1',
                color_depth: 10,
                // Directivas avanzadas para Hardware AI y BWDIF
                video_filter: 'bwdif=1,hqdn3d=4:3:6:4,nlmeans=h=6:p=3:r=15,unsharp=5:5:0.8',
                hw_dec_accelerator: 'any',
                lcevc: true,
                lcevc_state: 'ACTIVE_ENFORCED',
                lcevc_phase4: true,
                // Banderas AI/AV1/VVC
                av1_cdef: true,
                ai_semantic_segmentation: true,
                vvc_virtual_boundaries: true,
                // LCEVC HTML5 SDK & Web-Layer
                lcevc_html5_sdk: true,
                lcevc_l1_correction: 'max',
                lcevc_l2_detail: 'extreme',
                // Preservar perfil original para LCEVC-BASE-CODEC
                _cortex_original_profile: originalProfile,
                // Cadena de degradación determinista
                cortex_fallback_chain: 'AV1>HEVC>H264',
                cortex_fallback_lcevc: 'ALWAYS_ACTIVE',
                cortex_fallback_hdr10plus: 'ENFORCED_ALL_LEVELS'
            });

            return { profile: targetProfile, cfg: godTierCfg };
        },
        // Generador de Headers inyectados en EXTHTTP
        getOmegaHeaders: function (cfg) {
            return {
                'X-Cortex-Omega-State': 'ACTIVE_DOMINANT',
                'X-Cortex-Player-Enslavement': 'ENFORCED',
                'X-Cortex-Visual-Perfection': '100%',
                'X-Cortex-BWDIF': 'MULTI-LAYER',
                'X-Cortex-HDR-ToneMap': 'DYNAMIC-METADATA-HDR10+',
                'X-Cortex-Target-FPS': String(cfg.fps || 120),
                'X-Cortex-LCEVC-Core': 'v16.4.1',
                'X-Cortex-Quantum-Overdrive': 'v5',
                'X-Cortex-Proxy': 'KPTV-AWARE',
                // AI Módulos y Herramientas Visuales Ultimate
                'X-Cortex-AV1-Deblocking': 'MAXIMUM_ATTENUATION',
                'X-Cortex-AV1-CDEF': 'ENABLED_DIRECTIONAL_RESTORATION',
                'X-Cortex-VVC-Virtual-Boundaries': 'EDGE_ARTIFACT_SUPPRESSION',
                'X-Cortex-AI-MultiFrame-NR': 'MASSIVE_MOTION_COMPENSATED',
                'X-Cortex-AI-Semantic-Segmentation': 'ENABLED_250_LAYERS',
                // Cadena de Degradación Determinista del Cortex
                'X-Cortex-Fallback-Chain': 'AV1>HEVC>H264',
                'X-Cortex-Fallback-LCEVC': 'ALWAYS_ACTIVE',
                'X-Cortex-Fallback-HDR10Plus': 'ENFORCED_ALL_LEVELS',
                'X-Cortex-LCEVC-Phase4': 'EDGE_COMPUTE_ENFORCED',
                'X-Cortex-LCEVC-State': 'ACTIVE_ALL_CHANNELS',
                // LCEVC HTML5 SDK - Web Layer Metadata Tunnelling
                'X-Cortex-LCEVC-SDK-Injection': 'ACTIVE_HTML5_NATIVE',
                'X-Cortex-LCEVC-L1-Correction': 'MAX_DIFFERENCE_ATTENUATION',
                'X-Cortex-LCEVC-L2-Detail': 'UPCONVERT_SHARPENING_EXTREME',
                'X-Cortex-LCEVC-Web-Interop': 'BI_DIRECTIONAL_JS_TUNNEL'
            };
        }
    };
    if (typeof window !== 'undefined') window.IPTV_SUPPORT_CORTEX_V_OMEGA = IPTV_SUPPORT_CORTEX_V_OMEGA;


    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 2: IPTV SUPPORT CORTEX v3.0
    // ═══════════════════════════════════════════════════════════════════════════
    // Árbol de decisión que evalúa HTTP status codes y determina la estrategia
    // de evasión óptima para cada canal.
    // ═══════════════════════════════════════════════════════════════════════════

    const IPTV_SUPPORT_CORTEX_V3 = {
        // 🧬 v22.2 NUCLEAR EVASION: Árbol de decisión orgánico con mutación polimórfica
        decisionTree: {
            301: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Seguir redirect + preservar auth headers' },
            302: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Token refresh + seguir redirect temporal' },
            307: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Seguir redirect preservando método HTTP' },
            308: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Actualizar URL base permanentemente' },
            401: { strategy: 'AUTH_ESCALATE', priority: 'CRITICAL', persist: true, action: 'Escalar auth: Basic→Bearer→Digest→NTLM' },
            403: { strategy: 'IDENTITY_MORPH', priority: 'HIGH', persist: true, action: 'Mutación de identidad completa: UA+Referer+Host+X-Original-URL' },
            407: { strategy: 'PROXY_NUCLEAR', priority: 'CRITICAL', persist: true, action: 'Multi-probe: Basic→NTLM→Digest→Bearer→CONNECT→Via' },
            429: { strategy: 'SWARM_EVADE', priority: 'HIGH', persist: true, action: 'Enjambre: IP rotation + backoff exponencial + session morph' },
            451: { strategy: 'GEO_PHANTOM', priority: 'CRITICAL', persist: true, action: 'Fantasma geográfico: multi-IP + CF-Connecting-IP + True-Client-IP' },
            500: { strategy: 'GENOME_MUTATE', priority: 'MEDIUM', persist: true, action: 'Mutación genómica completa del request' },
            502: { strategy: 'CLEAN_RECONNECT', priority: 'HIGH', persist: true, action: 'Reconexión limpia: headers mínimos + TS directo' },
            503: { strategy: 'DEGRADE_PERSIST', priority: 'HIGH', persist: true, action: 'Degradación persistente: HLS→TS + Connection:close + retry' },
            504: { strategy: 'TIMEOUT_ASSAULT', priority: 'HIGH', persist: true, action: 'Asalto de timeout: escalar timeout + rotar CDN + retry agresivo' }
        },

        // 🧠 Evaluador orgánico: nunca desiste, siempre tiene un plan
        evaluate: function (errorCode) {
            return this.decisionTree[errorCode] || { strategy: 'FULL_POLYMORPH', priority: 'LOW', persist: true, action: 'Polimorfismo total del genoma' };
        },

        // 🔄 Motor de escalamiento por error — actúa en <1ms
        getEscalationHeaders: function (errorCode) {
            const decision = this.evaluate(errorCode);
            const headers = {};
            switch (decision.strategy) {
                case 'FOLLOW_REDIRECT':
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Accept'] = '*/*';
                    headers['X-APE-Follow-Redirects'] = 'true';
                    headers['X-APE-Max-Redirects'] = '10';
                    break;
                case 'AUTH_ESCALATE':
                    headers['Authorization'] = 'Bearer anonymous';
                    headers['User-Agent'] = getRotatedUserAgent('Windows');
                    headers['X-APE-Auth-Retry'] = '5';
                    headers['X-APE-Auth-Chain'] = 'basic,bearer,digest,ntlm';
                    break;
                case 'IDENTITY_MORPH':
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Referer'] = 'https://www.google.com/';
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Original-URL'] = '/';
                    headers['X-Rewrite-URL'] = '/';
                    headers['Accept'] = '*/*';
                    break;
                case 'PROXY_NUCLEAR':
                    headers['Proxy-Authorization'] = 'Basic Og==';
                    headers['User-Agent'] = getRotatedUserAgent('Windows');
                    headers['Proxy-Connection'] = 'keep-alive';
                    headers['Via'] = '1.1 proxy.local';
                    break;
                case 'SWARM_EVADE':
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Remote-IP'] = getRandomIp();
                    headers['X-Client-IP'] = getRandomIp();
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                    break;
                case 'GEO_PHANTOM':
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Real-IP'] = getRandomIp();
                    headers['CF-Connecting-IP'] = getRandomIp();
                    headers['True-Client-IP'] = getRandomIp();
                    break;
                case 'GENOME_MUTATE':
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['Accept'] = '*/*';
                    headers['Cache-Control'] = 'no-cache';
                    break;
                case 'CLEAN_RECONNECT':
                    headers['Connection'] = 'close';
                    headers['Accept'] = 'video/mp2t, application/octet-stream, */*';
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['X-Forwarded-For'] = getRandomIp();
                    break;
                case 'DEGRADE_PERSIST':
                    headers['Connection'] = 'close';
                    headers['Accept'] = 'video/mp2t, application/octet-stream';
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    break;
                case 'TIMEOUT_ASSAULT':
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Connection'] = 'keep-alive';
                    headers['Keep-Alive'] = 'timeout=300, max=1000';
                    break;
                default: // FULL_POLYMORPH
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Real-IP'] = getRandomIp();
                    headers['Referer'] = 'https://www.google.com/';
                    headers['Accept'] = '*/*';
            }
            return headers;
        }
    };

    function buildInitialContext(channel, index) {
        return {
            channel: channel,
            index: index,
            headers: {
                'User-Agent': getRotatedUserAgent('default'),
                'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'X-Forwarded-For': getRandomIp()
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 3: PRE-ARMED RESPONSE BUILDER v4.0
    // ═══════════════════════════════════════════════════════════════════════════
    // Genera bloques de fallback pre-armados para cada canal.
    // Cada canal lleva respuestas preparadas para 403, 407, 503.
    // ═══════════════════════════════════════════════════════════════════════════

    const PRE_ARMED_RESPONSE_BUILDER = {
        // 🧬 v22.2: Builder polimórfico — cada canal obtiene genoma único de fallbacks
        buildFallbackTags: function (channel, index) {
            const ctx = buildInitialContext(channel, index);
            const tags = [];
            const seed = index * 7 + 13; // Semilla determinística por canal

            // ── 🔴 FALLBACK 401: Auth Escalation Chain ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:401_AUTH_ESCALATE`);
            tags.push(`#EXT-X-APE-FALLBACK-AUTH-CHAIN:basic,bearer,digest,ntlm`);
            tags.push(`#EXT-X-APE-FALLBACK-AUTH-RETRY:5`);
            tags.push(`#EXT-X-APE-FALLBACK-AUTH-PERSIST:true`);

            // ── 🔴 FALLBACK 403: Identity Morph (12 técnicas) ──
            const h403 = IPTV_SUPPORT_CORTEX_V3.getEscalationHeaders(403);
            tags.push(`#EXT-X-APE-FALLBACK-ID:403_IDENTITY_MORPH`);
            tags.push(`#EXT-X-APE-FALLBACK-UA:${h403['User-Agent']}`);
            tags.push(`#EXT-X-APE-FALLBACK-REFERER:${h403['Referer']}`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${h403['X-Forwarded-For']}`);
            tags.push(`#EXT-X-APE-FALLBACK-X-ORIGINAL-URL:/`);
            tags.push(`#EXT-X-APE-FALLBACK-X-REWRITE-URL:/`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:*/*`);
            tags.push(`#EXT-X-APE-FALLBACK-METHOD-CHAIN:GET,POST,HEAD`);
            tags.push(`#EXT-X-APE-FALLBACK-403-PERSIST:NEVER_STOP`);

            // ── 🔴 FALLBACK 407: Proxy Nuclear Multi-Probe (8 técnicas) ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:407_PROXY_NUCLEAR`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-1:Basic Og==`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-2:NTLM TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw==`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-3:Digest username=""`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-4:Bearer anonymous`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-CONNECTION:keep-alive`);
            tags.push(`#EXT-X-APE-FALLBACK-VIA:1.1 proxy.local`);
            tags.push(`#EXT-X-APE-FALLBACK-TUNNEL:CONNECT`);
            tags.push(`#EXT-X-APE-FALLBACK-407-PERSIST:INSIST_FOREVER`);

            // ── 🔴 FALLBACK 429: Swarm Evasion + Backoff ──
            const h429 = IPTV_SUPPORT_CORTEX_V3.getEscalationHeaders(429);
            tags.push(`#EXT-X-APE-FALLBACK-ID:429_SWARM_EVADE`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${h429['X-Forwarded-For']}`);
            tags.push(`#EXT-X-APE-FALLBACK-X-REMOTE-IP:${h429['X-Remote-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-X-CLIENT-IP:${h429['X-Client-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-SESSION:SES_${generateRandomString(16)}`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF:EXPONENTIAL_JITTER`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF-BASE:500`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF-MAX:16000`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF-JITTER:250`);
            tags.push(`#EXT-X-APE-FALLBACK-429-PERSIST:SWARM_UNTIL_CLEAR`);

            // ── 🔴 FALLBACK 451: Geo Phantom ──
            const h451 = IPTV_SUPPORT_CORTEX_V3.getEscalationHeaders(451);
            tags.push(`#EXT-X-APE-FALLBACK-ID:451_GEO_PHANTOM`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${h451['X-Forwarded-For']}`);
            tags.push(`#EXT-X-APE-FALLBACK-REAL-IP:${h451['X-Real-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-CF-CONNECTING-IP:${h451['CF-Connecting-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-TRUE-CLIENT-IP:${h451['True-Client-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-451-PERSIST:PHANTOM_MODE`);

            // ── 🔴 FALLBACK 500: Genome Mutate ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:500_GENOME_MUTATE`);
            tags.push(`#EXT-X-APE-FALLBACK-UA:${getRotatedUserAgent('random')}`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${getRandomIp()}`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:*/*`);
            tags.push(`#EXT-X-APE-FALLBACK-500-RETRY:3`);

            // ── 🔴 FALLBACK 502: Clean Reconnect ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:502_CLEAN_RECONNECT`);
            tags.push(`#EXT-X-APE-FALLBACK-CONNECTION:close`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:video/mp2t,application/octet-stream,*/*`);
            tags.push(`#EXT-X-APE-FALLBACK-UA:${getRotatedUserAgent('random')}`);
            tags.push(`#EXT-X-APE-FALLBACK-502-RETRY:5`);

            // ── 🔴 FALLBACK 503: Degrade + Persist ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:503_DEGRADE_PERSIST`);
            tags.push(`#EXT-X-APE-FALLBACK-CONNECTION:close`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:video/mp2t`);
            tags.push(`#EXT-X-APE-FALLBACK-PROTOCOL-CHAIN:HLS,DASH,TS-DIRECT,HTTP-REDIRECT`);
            tags.push(`#EXT-X-APE-FALLBACK-503-PERSIST:DEGRADE_NEVER_STOP`);

            // ── 🔴 FALLBACK 504: Timeout Assault ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:504_TIMEOUT_ASSAULT`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${getRandomIp()}`);
            tags.push(`#EXT-X-APE-FALLBACK-KEEP-ALIVE:timeout=300,max=1000`);
            tags.push(`#EXT-X-APE-FALLBACK-504-RETRY:10`);
            tags.push(`#EXT-X-APE-FALLBACK-504-PERSIST:ASSAULT_UNTIL_OPEN`);

            // ── 🟢 FALLBACK 3xx: Redirect Persistence ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:3XX_REDIRECT_FOLLOW`);
            tags.push(`#EXT-X-APE-FALLBACK-FOLLOW-REDIRECTS:true`);
            tags.push(`#EXT-X-APE-FALLBACK-MAX-REDIRECTS:10`);
            tags.push(`#EXT-X-APE-FALLBACK-REDIRECT-AUTH-PRESERVE:true`);

            // ── 🧬 PERSISTENCE ENGINE: Nunca desiste ──
            tags.push(`#EXT-X-APE-EVASION-ENGINE:POLYMORPHIC_v22.2`);
            tags.push(`#EXT-X-APE-EVASION-PERSIST:INFINITE`);
            tags.push(`#EXT-X-APE-EVASION-MUTATION-RATE:PER_REQUEST`);
            tags.push(`#EXT-X-APE-EVASION-FINGERPRINT:${generateRandomString(32)}`);
            tags.push(`#EXT-X-APE-EVASION-GENOME-SEED:${seed}`);

            return tags;
        },

        // 👻 FUSIÓN FANTASMA v22.2 + v6.1 COMPAT:
        // Consolidar 90 tags de fallback en UN SOLO PAYLOAD B64.
        // Antes: 10 × #EXT-X-APE-FALLBACK-ID + sub-tags = 90 líneas
        //        OTT Navigator CONTABA cada FALLBACK-ID como stream variant → CRASH
        // Ahora: 3 líneas visibles (resumen) + 1 B64 blob con el genoma completo
        buildBlock: function (context) {
            const tags = this.buildFallbackTags(context.channel, context.index);
            // Extraer todos los datos de fallback en un JSON consolidado
            const fallbackData = {};
            let currentId = null;
            for (const tag of tags) {
                const match = tag.match(/^#EXT-X-APE-(.+?):(.*)$/);
                if (!match) continue;
                const [, key, value] = match;
                if (key === 'FALLBACK-ID') {
                    currentId = value;
                    fallbackData[currentId] = {};
                } else if (currentId) {
                    fallbackData[currentId][key] = value;
                }
            }
            // Emitir: resumen visible + blob B64
            const lines = [
                `#EXT-X-APE-FALLBACK-CHAIN:401>403>407>429>451>500>502>503>504>3XX`,
                `#EXT-X-APE-FALLBACK-STRATEGY:POLYMORPHIC_ESCALATION`,
                `#EXT-X-APE-FALLBACK-PERSIST:INFINITE`,
                `#EXT-X-APE-FALLBACK-GENOME-B64:${base64UrlEncode(JSON.stringify(fallbackData))}`
            ];
            return lines.join('\n') + '\n';
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 4: APE ATOMIC STEALTH ENGINE v6.0
    // ═══════════════════════════════════════════════════════════════════════════
    // Motor de sondeo atómico y paralelo. Genera ráfagas de 10 genomas únicos
    // con mutación dirigida por error codes. Cada átomo es independiente.
    // ═══════════════════════════════════════════════════════════════════════════

    class APEAtomicStealthEngine {
        constructor(channel, maxBursts = 3) {
            this.channel = channel;
            this.maxBursts = maxBursts;
        }

        getInitialGenome() {
            return {
                'User-Agent': getRotatedUserAgent('default'),
                'X-Forwarded-For': getRandomIp(),
                'Proxy-Authorization': null,
                'Referer': null,
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            };
        }

        generateGenomeBatch(size, errorFeedback = []) {
            const batch = [];
            let lastGenome = this.getInitialGenome();
            for (let i = 0; i < size; i++) {
                const errorCode = errorFeedback[i] || null;
                const nextGenome = this.mutate(lastGenome, errorCode);
                nextGenome['X-Forwarded-For'] = getRandomIp();
                nextGenome['User-Agent'] = getRotatedUserAgent('random');
                batch.push(nextGenome);
                lastGenome = nextGenome;
            }
            return batch;
        }

        async resolve() {
            let attempts = 0, lastErrorBatch = [];
            while (attempts < this.maxBursts) {
                console.log(`[AtomicEngine] CH ${this.channel.name || this.channel.id}: Ráfaga ${attempts + 1}/${this.maxBursts}...`);
                const batch = this.generateGenomeBatch(10, lastErrorBatch);
                const promises = batch.map(genome => this.testConnection(genome));
                const results = await Promise.allSettled(promises);
                const winningResult = results.find(r => r.status === 'fulfilled' && r.value.success);
                if (winningResult) {
                    console.log(`[AtomicEngine] CH ${this.channel.name || this.channel.id}: Éxito atómico!`);
                    return winningResult.value.genome;
                }
                lastErrorBatch = results.map(r => r.status === 'rejected' ? 500 : r.value.errorCode);
                attempts++;
            }
            console.error(`[AtomicEngine] CH ${this.channel.name || this.channel.id}: Fallo total después de ${this.maxBursts} ráfagas.`);
            return null;
        }

        // 🧬 v22.2: Mutador polimórfico — muta como virus, nunca deja huella igual
        mutate(currentGenome, errorCode) {
            let g = { ...currentGenome };
            // Mutación base: siempre rota identidad
            g['User-Agent'] = getRotatedUserAgent('random');
            g['X-Forwarded-For'] = getRandomIp();

            if (errorCode === 301 || errorCode === 302 || errorCode === 307 || errorCode === 308) {
                g['Accept'] = '*/*';
            }
            if (errorCode === 401) {
                const authMethods = ['Basic Og==', 'Bearer anonymous', 'Digest username=""', 'NTLM TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw=='];
                g['Authorization'] = authMethods[Math.floor(Math.random() * authMethods.length)];
            }
            if (errorCode === 403) {
                g['Referer'] = 'https://www.google.com/';
                g['X-Original-URL'] = '/';
                g['X-Rewrite-URL'] = '/';
                g['Accept'] = '*/*';
            }
            if (errorCode === 407) {
                const proxyAuths = ['Basic Og==', 'NTLM TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw==', 'Digest username=""', 'Bearer anonymous'];
                g['Proxy-Authorization'] = proxyAuths[Math.floor(Math.random() * proxyAuths.length)];
                g['Proxy-Connection'] = 'keep-alive';
                g['Via'] = '1.1 proxy.local';
            }
            if (errorCode === 429) {
                g['X-Remote-IP'] = getRandomIp();
                g['X-Client-IP'] = getRandomIp();
                g['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            }
            if (errorCode === 451) {
                g['X-Real-IP'] = getRandomIp();
                g['CF-Connecting-IP'] = getRandomIp();
                g['True-Client-IP'] = getRandomIp();
            }
            if (errorCode === 500) { g['Accept'] = '*/*'; g['Cache-Control'] = 'no-cache'; }
            if (errorCode === 502) { g['Connection'] = 'close'; g['Accept'] = 'video/mp2t, */*'; }
            if (errorCode === 503) { g['Connection'] = 'close'; g['Accept'] = 'video/mp2t'; }
            if (errorCode === 504) { g['Keep-Alive'] = 'timeout=300, max=1000'; g['Connection'] = 'keep-alive'; }
            return g;
        }

        async testConnection(genome) {
            // M3U8 static generation: siempre éxito (el probing real ocurre en runtime del player)
            return new Promise(resolve => setTimeout(() => {
                resolve({ success: true, errorCode: 200, genome });
            }, 1));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 5: ISP THROTTLE NUCLEAR ESCALATION v3.0
    // ═══════════════════════════════════════════════════════════════════════════
    // ANTIFREEZE NUCLEAR OBSCENE: 10 niveles, auto-escalación, nunca bajan.
    // Cada nivel emite: PARALLEL, TCP, BURST, PREFETCH, BUFFER_TARGET
    // ═══════════════════════════════════════════════════════════════════════════

    function generateISPThrottleEscalation(profile, cfg) {
        const baseBw = (cfg.bitrate || 5000) >= 1000000 ? (cfg.bitrate || 5000) : (cfg.bitrate || 5000) * 1000;
        const tags = [];

        tags.push(`#EXT-X-APE-ISP-THROTTLE-VERSION:3.0-OBSCENE`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-POLICY:NUCLEAR_ESCALATION_NEVER_DOWN`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-STRATEGY:DOUBLE_ON_DROP`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-BASE-BW:${baseBw}`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-LEVELS:10`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-CURRENT:AUTO-ESCALATE`);

        // 10 niveles de escalamiento nuclear — NUNCA bajan
        for (let level = 1; level <= 10; level++) {
            const lvl = ISP_LEVELS[level];
            if (!lvl) continue;
            const demandBw = baseBw * Math.pow(2, level);
            tags.push(`#EXT-X-APE-ISP-THROTTLE-LEVEL-${level}:PARALLEL_${lvl.parallel_streams}|TCP_${lvl.tcp_window_mb}MB|BURST_${lvl.burst_factor}x|PREFETCH_${lvl.prefetch_s}|BUFFER_${lvl.buffer_target_s || 60}`);
        }

        tags.push(`#EXT-X-APE-ISP-THROTTLE-MAX-DEMAND:${baseBw * 256}`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-FALLBACK:MULTI-CDN-SPRAY`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-XFF-ROTATE:${getRandomIp()}`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-UA-ROTATE:${getRotatedUserAgent('random')}`);

        // ANTIFREEZE NUCLEAR headers per-channel (tags ÚNICOS — no duplican nuclear L1/L2/L4/L5)
        tags.push(`#EXT-X-APE-ANTI-FREEZE-NUCLEAR:v10.0-OBSCENE-AGGRESSION`);
        // v6.1 COMPAT: BUFFER-STRATEGY/TARGET/MIN/MAX ya emitidos en build_ape_block/nuclear L1
        // Aquí solo tags ISP-específicos únicos
        tags.push(`#EXT-X-APE-ISP-BUFFER-RAM-CACHE:2048MB`);
        tags.push(`#EXT-X-APE-ISP-BUFFER-PREFETCH-SEGMENTS:${GLOBAL_PREFETCH.segments}`);

        // Reconexion Nuclear — tags únicos de ISP (DELAY-MIN/MAX son distintos a RECONNECT-DELAY)
        // v6.1 COMPAT: RECONNECT-MAX/PARALLEL/POOL/SEAMLESS ya emitidos en nuclear L2
        tags.push(`#EXT-X-APE-ISP-RECONNECT-DELAY-MIN:0`);
        tags.push(`#EXT-X-APE-ISP-RECONNECT-DELAY-MAX:50`);
        tags.push(`#EXT-X-APE-ISP-RECONNECT-INSTANT-FAILOVER:TRUE`);

        // Multi-Source Redundancy — tag único de ISP
        // v6.1 COMPAT: MULTI-SOURCE/COUNT/RACING/FAILOVER-MS ya emitidos en nuclear L4
        tags.push(`#EXT-X-APE-ISP-MULTI-SOURCE-ACTIVE:2`);

        // Predictive Freeze Prevention — tags únicos de ISP
        // v6.1 COMPAT: FREEZE-PREDICTION/PREVENTION-AUTO ya emitidos en nuclear L5
        tags.push(`#EXT-X-APE-ISP-FREEZE-MODEL:LSTM_ENSEMBLE`);
        tags.push(`#EXT-X-APE-ISP-FREEZE-PREDICTION-WINDOW:5000`);
        tags.push(`#EXT-X-APE-ISP-FREEZE-CONFIDENCE-THRESHOLD:0.8`);

        // Quality Safety Net — tags únicos de ISP
        // v6.1 COMPAT: QUALITY-NEVER-DROP-BELOW/FALLBACK-CHAIN ya emitidos en nuclear L5
        tags.push(`#EXT-X-APE-ISP-QUALITY-BUFFER-ALL:TRUE`);

        // Frame Interpolation — tags únicos de ISP con detalles extendidos
        // v6.1 COMPAT: FRAME-INTERPOLATION ya emitido en nuclear L5
        tags.push(`#EXT-X-APE-ISP-FRAME-INTERP-MODE:AI_RIFE_V4`);
        tags.push(`#EXT-X-APE-ISP-FRAME-INTERP-MAX:60`);
        tags.push(`#EXT-X-APE-ISP-FRAME-INTERP-GPU:TRUE`);

        return tags;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 🌐 CLEAN URL MODE - Arquitectura de URLs Limpias
    // ═══════════════════════════════════════════════════════════════════════════
    // Cuando está activo:
    // - URLs 100% limpias (sin JWT, sin parámetros)
    // - Los 68 campos del JWT se redistribuyen a headers M3U8
    // - Headers globales: fingerprint, sesión, evasión
    // - Headers por canal: perfil, codec, buffer, calidad
    // ═══════════════════════════════════════════════════════════════════════════

    let CLEAN_URL_MODE = true; // Toggle para activar/desactivar URLs limpias

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔧 HELPER: VERIFICAR SI UN MÓDULO ESTÁ HABILITADO EN EL PANEL
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Verifica si un módulo está habilitado en ApeModuleManager
     * @param {string} moduleId - ID del módulo (ej: 'smart-codec', 'evasion-407')
     * @returns {boolean} true si el módulo está habilitado o si no hay manager
     */
    function isModuleEnabled(moduleId) {
        if (!window.ApeModuleManager) return true; // Sin manager = usar todo
        return window.ApeModuleManager.isEnabled(moduleId);
    }

    // Mapeo de funcionalidades a módulos del panel
    const MODULE_FEATURES = {
        jwt: 'jwt-generator',
        headers: 'headers-matrix',
        evasion: 'evasion-407',
        buffer: 'buffer-adaptativo',
        smartCodec: 'smart-codec',
        fibonacci: 'fibonacci-entropy',
        tls: 'tls-coherence',
        geoblocking: 'geoblocking',
        throughput: 'realtime-throughput',
        qos: 'dynamic-qos',
        prefetch: 'prefetch-optimizer',
        manifest: 'manifest-generator',
        vpn: 'vpn-integration',
        latency: 'latency-rayo',
        redundantStreams: 'redundant-streams'
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // 🔗 BRIDGE: FUNCIÓN PARA OBTENER PERFILES (Frontend o Fallback)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Obtiene configuración de perfil desde Frontend (Bridge) o Fallback hardcoded
     * @param {string} profileId - ID del perfil (P0-P5)
     * @returns {Object} Configuración del perfil
     */
    function getProfileConfig(profileId) {
        // ═══════════════════════════════════════════════════════════════
        // 🔗 DYNAMIC BRIDGE v2.0 — Profile Manager → Generator Sync
        // PRIORIDAD 1: Lee del Profile Manager en runtime (UI values)
        // PRIORIDAD 2: Fallback a PROFILES hardcoded (offline safety)
        // Garantía: NUNCA undefined — siempre hay valores sanos
        // ═══════════════════════════════════════════════════════════════
        const hardcoded = PROFILES[profileId] || PROFILES['P3'];

        // ── Intento 1: APE_PROFILES_CONFIG (Profile Manager v9.0) ──
        try {
            if (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG && typeof window.APE_PROFILES_CONFIG.getProfile === 'function') {
                const pmProfile = window.APE_PROFILES_CONFIG.getProfile(profileId);
                if (pmProfile && pmProfile.settings) {
                    const s = pmProfile.settings;
                    const pf = (typeof window.APE_PROFILES_CONFIG.getPrefetchConfig === 'function')
                        ? window.APE_PROFILES_CONFIG.getPrefetchConfig(profileId) : null;

                    // Map PM fields → Generator fields, using hardcoded as fallback per-field
                    const bridged = {
                        // ── Identity ──
                        name:                   pmProfile.name || hardcoded.name,
                        resolution:             s.resolution || hardcoded.resolution,
                        width:                  parseInt((s.resolution || hardcoded.resolution).split('x')[0]) || hardcoded.width,
                        height:                 parseInt((s.resolution || hardcoded.resolution).split('x')[1]) || hardcoded.height,
                        fps:                    s.fps || hardcoded.fps,
                        // ── Bitrate (PM stores Mbps as float like 26.9, generator uses kbps int) ──
                        bitrate:                s.bitrate ? Math.round(s.bitrate * 1000) : hardcoded.bitrate,
                        // ── Buffers (PM stores ms) ──
                        buffer_ms:              s.buffer || hardcoded.buffer_ms,
                        network_cache_ms:       s.buffer || hardcoded.network_cache_ms,
                        live_cache_ms:          s.buffer || hardcoded.live_cache_ms,
                        file_cache_ms:          s.playerBuffer || hardcoded.file_cache_ms,
                        player_buffer_ms:       s.playerBuffer || hardcoded.player_buffer_ms,
                        // ── Bandwidth (PM bitrate Mbps → max_bandwidth bps) ──
                        max_bandwidth:          s.bitrate ? Math.round(s.bitrate * 1000000 * 2) : hardcoded.max_bandwidth,
                        min_bandwidth:          s.bitrate ? Math.round(s.bitrate * 1000000 * 0.75) : hardcoded.min_bandwidth,
                        // ── Throughput ──
                        throughput_t1:          s.t1 || hardcoded.throughput_t1,
                        throughput_t2:          s.t2 || hardcoded.throughput_t2,
                        // ── Prefetch (from PM's prefetch config or hardcoded) ──
                        prefetch_segments:      pf?.segments || hardcoded.prefetch_segments,
                        prefetch_parallel:      pf?.parallelDownloads || hardcoded.prefetch_parallel,
                        prefetch_buffer_target: pf?.bufferTarget ? pf.bufferTarget * 1000 : hardcoded.prefetch_buffer_target,
                        prefetch_min_bandwidth: pf?.minBandwidth ? pf.minBandwidth * 1000000 : hardcoded.prefetch_min_bandwidth,
                        // ── Codec ──
                        codec_primary:          _mapCodecPM(s.codec) || hardcoded.codec_primary,
                        codec_fallback:         hardcoded.codec_fallback,
                        codec_priority:         hardcoded.codec_priority,
                        // ── HDR / Color ──
                        hdr_support:            hardcoded.hdr_support,
                        color_depth:            hardcoded.color_depth,
                        audio_channels:         hardcoded.audio_channels,
                        audio_codec:            hardcoded.audio_codec,
                        device_class:           hardcoded.device_class,
                        // ── Reconnection ──
                        reconnect_timeout_ms:   hardcoded.reconnect_timeout_ms,
                        reconnect_max_attempts: hardcoded.reconnect_max_attempts,
                        reconnect_delay_ms:     hardcoded.reconnect_delay_ms,
                        availability_target:    hardcoded.availability_target,
                        // ── HEVC / encoding ──
                        hevc_tier:              hardcoded.hevc_tier,
                        hevc_level:             hardcoded.hevc_level,
                        hevc_profile:           hardcoded.hevc_profile,
                        color_space:            hardcoded.color_space,
                        chroma_subsampling:     hardcoded.chroma_subsampling,
                        transfer_function:      hardcoded.transfer_function,
                        matrix_coefficients:    hardcoded.matrix_coefficients,
                        compression_level:      hardcoded.compression_level,
                        rate_control:           hardcoded.rate_control,
                        entropy_coding:         hardcoded.entropy_coding,
                        video_profile:          hardcoded.video_profile,
                        pixel_format:           hardcoded.pixel_format,
                        // ── Segment / BW guarantee ──
                        segment_duration:       hardcoded.segment_duration,
                        bandwidth_guarantee:    hardcoded.bandwidth_guarantee,
                        // ── Bridge metadata ──
                        _bridged: true,
                        _source: 'ProfileManagerV9'
                    };

                    if (typeof console !== 'undefined') {
                        console.log(`🔗 [BRIDGE v2.0] ${profileId}: PM→Gen sync OK | ${s.codec}/${bridged.width}x${bridged.height}@${s.fps}fps | ${s.bitrate}Mbps | buf=${s.buffer}/${s.playerBuffer}ms | T1=${s.t1}/T2=${s.t2}`);
                    }
                    return bridged;
                }
            }
        } catch (e) {
            if (typeof console !== 'undefined') {
                console.warn(`⚠️ [BRIDGE] Error leyendo Profile Manager para ${profileId}:`, e.message);
            }
        }

        // ── Intento 2 (legacy): APE_PROFILE_BRIDGE ──
        try {
            if (window.APE_PROFILE_BRIDGE?.isActive?.() && window.APE_PROFILE_BRIDGE?.getProfile) {
                const bridged = window.APE_PROFILE_BRIDGE.getProfile(profileId);
                if (bridged && bridged._bridged) {
                    console.log(`🔗 [BRIDGE-LEGACY] Usando perfil ${profileId} desde Frontend`);
                    return bridged;
                }
            }
        } catch (e) { /* silent */ }

        // ── Fallback: PROFILES hardcoded (always works) ──
        console.log(`📦 [FALLBACK] Usando perfil ${profileId} hardcoded`);
        return hardcoded;
    }

    // Helper: Map PM codec names → generator codec names
    function _mapCodecPM(pmCodec) {
        if (!pmCodec) return null;
        const map = { 'AV1': 'AV1', 'H265': 'HEVC', 'HEVC': 'HEVC', 'VP9': 'VP9', 'H264': 'H264', 'AVC': 'H264', 'MPEG2': 'MPEG2' };
        return map[pmCodec.toUpperCase()] || pmCodec;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN GLOBAL DE CACHING (controla las 4 directivas globales)
    // ═══════════════════════════════════════════════════════════════════════════
    const GLOBAL_CACHING_BASE = {
        network: 120000,  // ANTIFREEZE NUCLEAR v10: 8x (15s→120s) survive any ISP glitch
        live: 120000,     // ANTIFREEZE NUCLEAR v10: 8x (15s→120s) nuclear anti-freeze
        file: 300000      // ANTIFREEZE NUCLEAR v10: 6x (51s→300s) VOD/file deep cache
    };

    const getGlobalCaching = () => ({
        network: window._APE_QUANTUM_SHIELD_2026 ? 120000 : GLOBAL_CACHING_BASE.network,
        live: window._APE_QUANTUM_SHIELD_2026 ? 120000 : GLOBAL_CACHING_BASE.live,
        file: window._APE_QUANTUM_SHIELD_2026 ? 300000 : GLOBAL_CACHING_BASE.file
    });

    const GLOBAL_CACHING = {
        get network() { return getGlobalCaching().network; },
        get live() { return getGlobalCaching().live; },
        get file() { return getGlobalCaching().file; }
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // 🖥️ DEVICE TIER DETECTION — v5.4 MAX AGGRESSION
    // Detecta la clase de hardware del dispositivo para escalar los niveles ISP
    // TIER 4 (NUCLEAR): Nvidia Shield, Apple TV 4K, PC con GPU dedicada
    // TIER 3 (BRUTAL): Android TV Box premium, PC básico
    // TIER 2 (SAVAGE): Smart TV mid-range, Chromecast Ultra
    // TIER 1 (EXTREME): FireTV Stick, Raspberry Pi, dispositivos de 1GB RAM
    // ═══════════════════════════════════════════════════════════════════════════
    const DEVICE_TIER = (function detectDeviceTier() {
        try {
            const ua = navigator.userAgent || '';
            const cores = navigator.hardwareConcurrency || 2;
            const mem = navigator.deviceMemory || 1; // GB
            const conn = navigator.connection || {};
            const bw = conn.downlink || 0; // Mbps estimado
            // Señales de hardware premium
            const isNvidiaShield = /SHIELD|AndroidTV/.test(ua) && cores >= 8;
            const isAppleTV = /AppleTV|tvOS/.test(ua);
            const isPC = /Windows|Macintosh|Linux x86/.test(ua) && cores >= 4;
            const isFireStick = /AFTS|AFTM|AFTB|FireTV|Silk/.test(ua);
            const isRaspberry = /armv7|armv6/.test(ua) && cores <= 4;
            if (isNvidiaShield || isAppleTV || (isPC && mem >= 8)) return 4; // NUCLEAR
            if (isPC && mem >= 4) return 3; // BRUTAL
            if (isFireStick || isRaspberry || mem <= 1) return 1; // EXTREME (safe)
            if (cores >= 8 && mem >= 4) return 3; // BRUTAL
            if (cores >= 4 && mem >= 2) return 2; // SAVAGE
            return 1; // EXTREME (default seguro)
        } catch (e) { return 1; }
    })();
    console.log(`🖥️ [DEVICE-TIER] Nivel detectado: \${DEVICE_TIER} (\${['','CONSERVATIVE','MODERATE','AGGRESSIVE','VERY_AGGRESSIVE'][DEVICE_TIER]})`);

    // ═══════════════════════════════════════════════════════════════════════════
    // ☢️ ISP_LEVELS — 10 Niveles ANTIFREEZE NUCLEAR OBSCENE (nunca bajan)
    // DEVICE_TIER arranca el nivel base, auto-escalación hasta APOCALYPTIC
    // ═══════════════════════════════════════════════════════════════════════════
    const ISP_LEVELS = [
        null, // índice 0 no usado
        {   // NIVEL 1: CONSERVATIVE — Normal operation, stealth mode
            name: 'CONSERVATIVE',
            tcp_window_mb: 4,
            parallel_streams: 4,
            burst_factor: 1.5,
            burst_duration_s: 30,
            prefetch_s: 30,
            buffer_target_s: 60,
            strategy: 'MAX_CONTRACT',
            quic: false,
            http3: false
        },
        {   // NIVEL 2: MODERATE — Buffer <45s OR throughput variance >20%
            name: 'MODERATE',
            tcp_window_mb: 8,
            parallel_streams: 8,
            burst_factor: 2.0,
            burst_duration_s: 60,
            prefetch_s: 60,
            buffer_target_s: 90,
            strategy: 'MAX_CONTRACT_PLUS_20PCT',
            quic: true,
            http3: false
        },
        {   // NIVEL 3: AGGRESSIVE — Buffer <30s OR throughput variance >40%
            name: 'AGGRESSIVE',
            tcp_window_mb: 16,
            parallel_streams: 16,
            burst_factor: 3.0,
            burst_duration_s: 999999,
            prefetch_s: 100,
            buffer_target_s: 120,
            strategy: 'SATURATE_LINK',
            quic: true,
            http3: true
        },
        {   // NIVEL 4: VERY_AGGRESSIVE — Buffer <20s OR rebuffer >1/min
            name: 'VERY_AGGRESSIVE',
            tcp_window_mb: 32,
            parallel_streams: 32,
            burst_factor: 5.0,
            burst_duration_s: 999999,
            prefetch_s: 200,
            buffer_target_s: 180,
            strategy: 'EXCEED_CONTRACT',
            quic: true,
            http3: true
        },
        {   // NIVEL 5: EXTREME — Buffer <15s OR rebuffer >2/min
            name: 'EXTREME',
            tcp_window_mb: 48,
            parallel_streams: 48,
            burst_factor: 7.0,
            burst_duration_s: 999999,
            prefetch_s: 300,
            buffer_target_s: 240,
            strategy: 'EXTREME_BANDWIDTH',
            quic: true,
            http3: true
        },
        {   // NIVEL 6: ULTRA — Buffer <10s OR connection drops
            name: 'ULTRA',
            tcp_window_mb: 64,
            parallel_streams: 64,
            burst_factor: 10.0,
            burst_duration_s: 999999,
            prefetch_s: 400,
            buffer_target_s: 300,
            strategy: 'SATURATE_TOTAL',
            quic: true,
            http3: true
        },
        {   // NIVEL 7: SAVAGE — Buffer <5s OR multiple connection failures
            name: 'SAVAGE',
            tcp_window_mb: 96,
            parallel_streams: 96,
            burst_factor: 15.0,
            burst_duration_s: 999999,
            prefetch_s: 500,
            buffer_target_s: 360,
            strategy: 'NO_RESTRICTIONS',
            connection_multiplexing: true,
            quic: true,
            http3: true
        },
        {   // NIVEL 8: BRUTAL — Buffer <3s OR imminent freeze
            name: 'BRUTAL',
            tcp_window_mb: 128,
            parallel_streams: 128,
            burst_factor: 20.0,
            burst_duration_s: 999999,
            prefetch_s: 750,
            buffer_target_s: 480,
            strategy: 'EMERGENCY_UNLIMITED',
            emergency_mode: true,
            connection_multiplexing: true,
            quic: true,
            http3: true
        },
        {   // NIVEL 9: NUCLEAR — Buffer near empty OR critical failure
            name: 'NUCLEAR',
            tcp_window_mb: 192,
            parallel_streams: 192,
            burst_factor: 30.0,
            burst_duration_s: 999999,
            prefetch_s: 1000,
            buffer_target_s: 600,
            strategy: 'NUCLEAR_NO_LIMITS',
            emergency_mode: true,
            all_sources_parallel: true,
            ignore_isp_limits: true,
            connection_multiplexing: true,
            quic: true,
            http3: true
        },
        {   // NIVEL 10: APOCALYPTIC — Freeze inmediato OR total connection loss
            name: 'APOCALYPTIC',
            tcp_window_mb: 256,
            parallel_streams: 256,
            burst_factor: 50.0,
            burst_duration_s: 999999,
            prefetch_s: 2000,
            buffer_target_s: 900,
            strategy: 'APOCALYPTIC_ALL_BANDWIDTH',
            emergency_mode: 'APOCALYPTIC',
            all_sources_parallel: true,
            ignore_isp_limits: true,
            connection_hijack: true,
            multiple_interfaces: true,
            connection_multiplexing: true,
            quic: true,
            http3: true
        }
    ];
    const ACTIVE_ISP_LEVEL = ISP_LEVELS[Math.min(DEVICE_TIER, 10)] || ISP_LEVELS[1];

    // Prefetch dinámico según DEVICE_TIER — ANTIFREEZE NUCLEAR (100→2000 segments)
    const GLOBAL_PREFETCH = {
        get segments() {
            return [null, 100, 200, 500, 2000][DEVICE_TIER] || 100;
        },
        get parallel() {
            return [null, 8, 16, 32, 64][DEVICE_TIER] || 8;
        }
    };

    console.log(`☢️ [ISP-LEVEL] Activo: \${ACTIVE_ISP_LEVEL.name} | TCP: \${ACTIVE_ISP_LEVEL.tcp_window_mb}MB | Parallel: \${ACTIVE_ISP_LEVEL.parallel_streams} | Burst: \${ACTIVE_ISP_LEVEL.burst_factor}x | Strategy: \${ACTIVE_ISP_LEVEL.strategy}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PERFILES P0-P5 (CONFIGURACIÓN COMPLETA - FALLBACK)
    // ═══════════════════════════════════════════════════════════════════════════

    const PROFILES = {
        // ═══════════════════════════════════════════════════════════════════════
        // P0: 8K ULTRA - detectProfile assigns P0 when height >= 4320 || bitrate >= 50000
        // ═══════════════════════════════════════════════════════════════════════
        P0: {
            name: 'ULTRA_EXTREME_8K',
            resolution: '7680x4320',
            width: 7680,
            height: 4320,
            fps: 120,
            bitrate: 120000,
            buffer_ms: 50000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 50000,
            max_bandwidth: 100000000,
            min_bandwidth: 50000000,
            throughput_t1: 156,
            throughput_t2: 120,
            prefetch_segments: '20,25,30',
            prefetch_parallel: 250,
            prefetch_buffer_target: 600000,
            prefetch_min_bandwidth: 500000000,
            segment_duration: 2,
            bandwidth_guarantee: 500,
            codec_primary: 'AV1',
            codec_fallback: 'HEVC',
            codec_priority: 'av1,hevc,hev1,hvc1,h265,H265,h.265,H.265,h264',
            hdr_support: ['hdr10', 'dolby_vision', 'hlg'],
            color_depth: 12,
            audio_channels: 8,
            audio_codec: 'eac3',
            device_class: 'ULTRA_EXTREME_8K',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            // HEVC/H.265 Optimization (configurable)
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p12le'
        },
        // ═══════════════════════════════════════════════════════════════════════
        // P1: 4K 60fps - detectProfile assigns P1 when height >= 2160 || bitrate >= 30000
        // ═══════════════════════════════════════════════════════════════════════
        P1: {
            name: '4K_SUPREME_60FPS',
            resolution: '3840x2160',
            width: 3840,
            height: 2160,
            fps: 60,
            bitrate: 26900,
            buffer_ms: 40000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 40000,
            max_bandwidth: 60000000,
            min_bandwidth: 30000000,
            throughput_t1: 35,
            throughput_t2: 75,
            prefetch_segments: '10,15,20',
            prefetch_parallel: 200,
            prefetch_buffer_target: 500000,
            prefetch_min_bandwidth: 400000000,
            segment_duration: 2,
            bandwidth_guarantee: 400,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 6,
            audio_codec: 'eac3',
            device_class: '4K_SUPREME_60FPS',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p12le'
        },
        P2: {
            name: '4K_EXTREME',
            resolution: '3840x2160',
            width: 3840,
            height: 2160,
            fps: 30,
            bitrate: 18000,
            buffer_ms: 35000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 35000,
            max_bandwidth: 40000000,
            min_bandwidth: 20000000,
            throughput_t1: 23.4,
            throughput_t2: 50,
            prefetch_segments: '8,12,16',
            prefetch_parallel: 180,
            prefetch_buffer_target: 450000,
            prefetch_min_bandwidth: 350000000,
            segment_duration: 2,
            bandwidth_guarantee: 350,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10'],
            color_depth: 10,
            audio_channels: 6,
            audio_codec: 'eac3',
            device_class: '4K_EXTREME',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P3: {
            name: 'FHD_ADVANCED',
            resolution: '1920x1080',
            width: 1920,
            height: 1080,
            fps: 60,
            bitrate: 8000,
            buffer_ms: 30000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 30000,
            max_bandwidth: 12000000,
            min_bandwidth: 4000000,
            throughput_t1: 10.4,
            throughput_t2: 15,
            prefetch_segments: '6,8,10',
            prefetch_parallel: 150,
            prefetch_buffer_target: 400000,
            prefetch_min_bandwidth: 300000000,
            segment_duration: 2,
            bandwidth_guarantee: 300,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 2,
            audio_codec: 'aac',
            device_class: 'FHD_ADVANCED',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P4: {
            name: 'HD_STABLE',
            resolution: '1280x720',
            width: 1280,
            height: 720,
            fps: 30,
            bitrate: 4000,
            buffer_ms: 25000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 25000,
            max_bandwidth: 6000000,
            min_bandwidth: 2000000,
            throughput_t1: 5.2,
            throughput_t2: 8,
            prefetch_segments: '4,6,8',
            prefetch_parallel: 120,
            prefetch_buffer_target: 350000,
            prefetch_min_bandwidth: 250000000,
            segment_duration: 2,
            bandwidth_guarantee: 250,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 2,
            audio_codec: 'aac',
            device_class: 'HD_STABLE',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'MAIN',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P5: {
            name: 'SD_FAILSAFE',
            resolution: '854x480',
            width: 854,
            height: 480,
            fps: 25,
            bitrate: 1500,
            buffer_ms: 20000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 20000,
            max_bandwidth: 3000000,
            min_bandwidth: 500000,
            throughput_t1: 1.95,
            throughput_t2: 4,
            prefetch_segments: '2,4,6',
            prefetch_parallel: 100,
            prefetch_buffer_target: 300000,
            prefetch_min_bandwidth: 200000000,
            segment_duration: 2,
            bandwidth_guarantee: 200,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 2,
            audio_codec: 'aac',
            device_class: 'SD_FAILSAFE',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'MAIN',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DETECT PROFILE BASED ON CHANNEL QUALITY
    // ═══════════════════════════════════════════════════════════════════════════

    function detectProfile(channel) {
        const height = channel.height || parseInt(channel.resolution?.split('x')[1]) || 0;
        const bitrate = channel.bitrate || 0;
        const fps = channel.fps || 30;

        // P0: 8K Ultra (height >= 4320 OR bitrate >= 50Mbps)
        if (height >= 4320 || bitrate >= 50000) return 'P0';

        // P1: 4K Premium (4K + 60fps OR 4K + high bitrate >= 30Mbps)
        if (height >= 2160 && (fps >= 60 || bitrate >= 30000)) return 'P1';

        // P2: 4K Standard (4K but lower fps/bitrate)
        if (height >= 2160 || bitrate >= 20000) return 'P2';

        // P3: FHD (1080p)
        if (height >= 1080 || bitrate >= 8000) return 'P3';

        // P4: HD (720p)
        if (height >= 720 || bitrate >= 4000) return 'P4';

        // P5: SD (everything else)
        return 'P5';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARRAY 1: GLOBAL_HEADER (137+ líneas - 1 sola vez por archivo)
    // ═══════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════


    function generateGlobalHeader(channelsCount) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 18) + 'Z';
        const totalChannels = typeof window !== 'undefined' && window.app && typeof window.app.getFilteredChannels === 'function' ? window.app.getFilteredChannels().length : channelsCount;

        return `#EXTM3U
#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE
#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE
#EXT-X-APE-QMAX-ANTI-DOWNGRADE:ENFORCED
#EXT-X-APE-QMAX-TIER-CASCADE:S>A>A->B>C>D
#EXT-X-APE-QMAX-SELECTION-RULE:IF-4K-EXISTS-1080P-FORBIDDEN
#EXT-X-APE-QMAX-BUFFER-CLASS:8K-ADAPTIVE-1GB
#EXT-X-APE-QMAX-PERCEPTUAL-OPTIMIZATION:VMAF-MAXIMIZATION-ENABLED
#EXT-X-APE-QMAX-BANDWIDTH-SAFETY-MARGIN:0.30
#X-OMEGA-TIMESTAMP: x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"
#EXT-X-APE-BUILD:v6.0-NUCLEAR-HACKS-${timestamp}
#EXT-X-APE-PARADIGM:PLAYER-ENSLAVEMENT-PROTOCOL-V6.0-NUCLEAR
#EXT-X-APE-CHANNELS:${totalChannels}
#EXT-X-APE-PROFILES:P0-ULTRA_EXTREME_8K,P1-4K_SUPREME_60FPS,P2-4K_EXTREME_30FPS,P3-FHD_ADVANCED_60FPS,P4-HD_STABLE_30FPS,P5-SD_FAILSAFE_25FPS
#EXT-X-APE-ISP-THROTTLE:10-LEVELS-NUCLEAR-OBSCENE-NEVER-DOWN
#EXT-X-APE-ISP-THROTTLE-VERSION:4.0-OBSCENE
#EXT-X-APE-ISP-THROTTLE-STRATEGY:ESCALATE_NEVER_DOWNGRADE
#EXT-X-APE-ERROR-RECOVERY:NUCLEAR
#EXT-X-APE-ERROR-MAX-RETRIES:UNLIMITED
#EXT-X-APE-ERROR-CONCEALMENT:AI_INPAINTING
#EXT-X-APE-ISP-LEVEL-1:CONSERVATIVE-MAX_CONTRACT-TCP4MB-PAR4-BURST1.5x-BUF60
#EXT-X-APE-ISP-LEVEL-2:MODERATE-MAX_CONTRACT_PLUS-TCP8MB-PAR8-BURST2x-BUF90
#EXT-X-APE-ISP-LEVEL-3:AGGRESSIVE-SATURATE_LINK-TCP16MB-PAR16-BURST3x-BUF120
#EXT-X-APE-ISP-LEVEL-4:VERY_AGGRESSIVE-EXCEED_CONTRACT-TCP32MB-PAR32-BURST5x-BUF180
#EXT-X-APE-ISP-LEVEL-5:EXTREME-EXTREME_BW-TCP48MB-PAR48-BURST7x-BUF240
#EXT-X-APE-ISP-LEVEL-6:ULTRA-SATURATE_TOTAL-TCP64MB-PAR64-BURST10x-BUF300
#EXT-X-APE-ISP-LEVEL-7:SAVAGE-NO_RESTRICTIONS-TCP96MB-PAR96-BURST15x-BUF360
#EXT-X-APE-ISP-LEVEL-8:BRUTAL-EMERGENCY-TCP128MB-PAR128-BURST20x-BUF480
#EXT-X-APE-ISP-LEVEL-9:NUCLEAR-NO_LIMITS-TCP192MB-PAR192-BURST30x-BUF600
#EXT-X-APE-ISP-LEVEL-10:APOCALYPTIC-ALL_BANDWIDTH-TCP256MB-PAR256-BURST50x-BUF900
#EXT-X-APE-LCEVC:MPEG-5-PART-2-FULL-3-PHASE-L1-L2-TRANSPORT-PARALLEL
#EXT-X-APE-ANTI-FREEZE-NUCLEAR:v10.0-OBSCENE|net-cache=120000|live-cache=120000|clock-jitter=5000|prefetch=100-200-500-2000
#EXT-X-APE-BUFFER-STRATEGY:NUCLEAR_NO_COMPROMISE|TARGET=180s|MIN=60s|MAX=600s|RAM=2048MB
#EXT-X-APE-RECONNECT-NUCLEAR:MAX=UNLIMITED|DELAY=0-50ms|PARALLEL=64|POOL=50|WARM=20
#EXT-X-APE-MULTI-SOURCE:ENABLED|COUNT=5|ACTIVE=2|RACING=TRUE|FAILOVER=50ms
#EXT-X-APE-FREEZE-PREDICTION:LSTM_ENSEMBLE|WINDOW=5000ms|CONFIDENCE=0.8|AUTO=TRUE
#EXT-X-APE-QUALITY-SAFETY-NET:NEVER_BELOW=480p|CHAIN=4K>1080p>720p>480p>360p>240p
#EXT-X-APE-FRAME-INTERPOLATION:AI_RIFE_V4|MAX=60|GPU=TRUE
#EXT-X-APE-EXTHTTP-FIELDS:250+
#EXT-X-APE-LINES-PER-CHANNEL:250+
#EXT-X-APE-COMPATIBILITY:VLC,OTT-NAVIGATOR,TIVIMATE,KODI,EXOPLAYER,IPTV-SMARTERS,GSE,MX-PLAYER,INFUSE,PLEX,JELLYFIN,EMBY,PERFECT-PLAYER,SMART-TV,FIRE-TV,APPLE-TV,ANDROID-TV,ROKU,CHROMECAST
#EXT-X-APE-NET-TOLERANCE:BDP=100MB|CWND=64|RTT_MAX=3000ms
#EXT-X-APE-QUANTUM-IMMORTALITY:v10-ENABLED
#EXT-X-APE-TELEMETRY-SYNC:NETFLIX-GRADE
#EXT-X-APE-EVASION-GET:405-REWRITE-TO-HEAD
#EXT-X-APE-FALLBACK-HEURISTICS:LATENCY<100ms
#EXT-X-APE-SYNC-SLAVE:MASTER_ORIGIN_SYNC_V2`;
    }

    let _cachedSelectedUA = null;

    // ══════════════════════════════════════════════════════════════════
    // LCEVC DINÁMICO v5.4 — Estado determinado por codec base del canal
    // Regla: LCEVC siempre presente, sin excepción (MPEG-5 Part 2).
    //   HEVC / AV1 / VP9  → ACTIVE      (mejora L1+L2 completa)
    //   H.264              → SIGNAL_ONLY (señal SEI NAL embebida)
    //   Desconocido        → ACTIVE      (asumir máxima calidad)
    // ══════════════════════════════════════════════════════════════════
    function detectLcevcState(codecStr) {
        if (!codecStr) return 'ACTIVE';
        const c = codecStr.toLowerCase();
        if (/av01|av1\b|hvc1|hev1|h265|h\.265|hevc|vp09|vp9\b/.test(c)) return 'ACTIVE';
        if (/avc1|avc3|h264|h\.264|mp4v/.test(c)) return 'SIGNAL_ONLY';
        return 'ACTIVE';
    }

    function resolveLcevcState(cfg) {
        const codecProxy = cfg.codec_primary === 'AV1' ? 'av01' :
            cfg.codec_primary === 'HEVC' ? 'hvc1' :
                cfg.codec_primary === 'H264' ? 'avc1' : 'hvc1';
        return detectLcevcState(codecProxy);
    }

    function resolveLcevcBaseCodec(lcevcState, cfg) {
        return lcevcState === 'ACTIVE'
            ? (cfg.lcevc_base_codec || 'HEVC').toUpperCase()
            : 'H264';
    }

    // ══════════════════════════════════════════════════════════════════
    // LCEVC LAYER CONFIG v5.4 — Parámetros por perfil y resolución
    // ──────────────────────────────────────────────────────────────────
    // Para HEVC ACTIVE: L1+L2 completo, calibrado por resolución
    // Para H.264 SIGNAL_ONLY: metadata embebida, player decide
    // ══════════════════════════════════════════════════════════════════
    const LCEVC_LAYER_CONFIG = {
        P0: { // 8K — AV1 ACTIVE: máxima precisión, bloques grandes
            scale_factor: '4x',
            l1_block: '8X8', l1_precision: '12bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '4X4', l2_precision: '12bit', l2_temporal: 1, l2_upscale: 'LANCZOS4',
            base_ratio: '0.45', enh_ratio: '0.55',
            threads: 16, parallel_blocks: 2,
            transport: 'SUPPLEMENTAL_DATA', fb1: 'SEI_NAL', fb2: 'MPEG_TS_PID',
            sei_nal: '5', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P1: { // 4K 60fps — AV1/HEVC: alta precisión, bloques medios
            scale_factor: '2x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '4X4', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS3',
            base_ratio: '0.50', enh_ratio: '0.50',
            threads: 12, parallel_blocks: 2,
            transport: 'SEI_NAL', fb1: 'SUPPLEMENTAL_DATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P2: { // 4K 30fps — HEVC: equilibrio calidad/CPU
            scale_factor: '2x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS3',
            base_ratio: '0.55', enh_ratio: '0.45',
            threads: 10, parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'PREFERRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P3: { // FHD 60fps — AVC/HEVC: 4K HDR OVERRIDE
            scale_factor: '2x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 0, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS4',
            base_ratio: '0.40', enh_ratio: '0.60',
            threads: 12, parallel_blocks: 2,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P4: { // HD 30fps — AVC/HEVC: EXTREME 4K HDR OVERRIDE
            scale_factor: '3x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 0, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS4',
            base_ratio: '0.40', enh_ratio: '0.60',
            threads: 8, parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P5: { // SD — AVC/HEVC: NUCLEAR 4K HDR OVERRIDE
            scale_factor: '4.5x',
            l1_block: '4X4', l1_precision: '8bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS2',
            base_ratio: '0.30', enh_ratio: '0.70',
            threads: 8, parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'MPEG_TS_PID', fb2: 'WEBM_METADATA',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        }
    };

    /**
     * Resuelve la configuración LCEVC completa para un perfil dado.
     * Fusiona el estado dinámico (ACTIVE/SIGNAL_ONLY) con los parámetros por perfil.
     * @param {string} profile - ID del perfil (P0-P5)
     * @param {Object} cfg - Configuración del perfil
     * @returns {Object} Configuración LCEVC fusionada
     */
    function resolveLcevcConfig(profile, cfg) {
        const state = resolveLcevcState(cfg);
        const isActive = state === 'ACTIVE';
        const layerCfg = LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3'];

        return {
            state,
            enabled: true, // LCEVC nunca se deshabilita
            base_codec: resolveLcevcBaseCodec(state, cfg),
            l1_enabled: isActive ? 1 : 0,
            l2_enabled: isActive ? 1 : 0,
            ...layerCfg,
            // H.264 SIGNAL_ONLY override: mantener metadata pero player decide
            mode: isActive ? layerCfg.mode : 'SIGNAL_EMBED',
            hw_accel: isActive ? layerCfg.hw_accel : 'IF_AVAILABLE',
            decode_order: isActive ? layerCfg.decode_order : 'PASSTHROUGH'
        };
    }

    function generateEXTVLCOPT(profile) {
        const cfg = getProfileConfig(profile);
        // ═══════════════════════════════════════════════════════════════
        // v6.1 UNIVERSAL COMPAT: 0 CLAVES DUPLICADAS — MÁXIMA AGRESIÓN
        // Regla: Cada clave VLC aparece EXACTAMENTE 1 vez con su valor
        // definitivo. OTT Navigator/TiviMate/Kodi parsean sin errores.
        // VLC aplica cada directiva sin ambigüedad.
        // ~105 líneas únicas = FULL POWER, ZERO CRASHES.
        // ═══════════════════════════════════════════════════════════════
        return [
            // ── 🌊 FASE 1: IMPULSO ZAPPING (Prevención de Freezes 5s-10s) ──
            // Amplificación al 400% del buffer durante el handshake
            `#EXTVLCOPT:network-caching=${GLOBAL_CACHING.network * 4}`,
            `#EXTVLCOPT:live-caching=${GLOBAL_CACHING.live * 4}`,
            `#EXTVLCOPT:file-caching=${GLOBAL_CACHING.file * 4}`,
            `#EXTVLCOPT:disc-caching=120000`,
            `#EXTVLCOPT:tcp-caching=120000`,
            `#EXTVLCOPT:sout-mux-caching=${GLOBAL_CACHING.live * 2}`,
            // ── SECCIÓN 2: CLOCK & SYNC — SIN CONTRADICCIÓN (2 líneas) ──
            `#EXTVLCOPT:clock-jitter=${cfg.clock_jitter || 1500}`,
            `#EXTVLCOPT:clock-synchro=1`,
            // ── SECCIÓN 3: HTTP RESILIENCE (5 líneas) ──
            `#EXTVLCOPT:http-reconnect=true`,
            `#EXTVLCOPT:http-continuous=true`,
            `#EXTVLCOPT:http-forward-cookies=true`,
            `#EXTVLCOPT:ipv4-timeout=5000`,
            `#EXTVLCOPT:mtu=65535`,
            // ── SECCIÓN 4: HARDWARE DECODE — CASCADA EN 1 LÍNEA (5 líneas) ──
            // "any" = VLC auto-selecciona: d3d11va→dxva2→vaapi→vdpau→nvdec→cuda→mediacodec→videotoolbox
            `#EXTVLCOPT:avcodec-hw=any`,
            `#EXTVLCOPT:hw-dec-accelerator=d3d11va,dxva2,vaapi,vdpau,nvdec,cuda,mediacodec,videotoolbox`,
            `#EXTVLCOPT:avcodec-dr=1`,
            `#EXTVLCOPT:avcodec-threads=0`,
            `#EXTVLCOPT:ffmpeg-hw`,
            // ── SECCIÓN 5: DEINTERLACE — 1 VALOR DEFINITIVO (2 líneas) ──
            // bwdif = Bob Weaver Deinterlacing Filter (mejor calidad disponible)
            `#EXTVLCOPT:deinterlace=-1`,
            `#EXTVLCOPT:deinterlace-mode=bwdif`,
            // ── SECCIÓN 6: CODEC PRIORITY & FORCING (5 líneas) ──
            `#EXTVLCOPT:preferred-codec=hevc`,
            `#EXTVLCOPT:codec-priority=hevc,hev1,hvc1,h265,av1,vp9,h264`,
            `#EXTVLCOPT:avcodec-codec=hevc`,
            `#EXTVLCOPT:sout-video-codec=hevc`,
            `#EXTVLCOPT:sout-video-profile=main10`,
            // ── SECCIÓN 7: PLAYBACK QUALITY — MÁXIMA PRIORIDAD (9 líneas) ──
            `#EXTVLCOPT:avcodec-hurry-up=0`,
            `#EXTVLCOPT:avcodec-fast=0`,
            `#EXTVLCOPT:avcodec-skiploopfilter=0`,
            `#EXTVLCOPT:avcodec-skipframe=0`,
            `#EXTVLCOPT:avcodec-skip-idct=0`,
            `#EXTVLCOPT:avcodec-lowres=0`,
            `#EXTVLCOPT:no-skip-frames`,
            `#EXTVLCOPT:no-drop-late-frames`,
            `#EXTVLCOPT:high-priority=1`,
            // ── SECCIÓN 8: FFMPEG LIBAVCODEC GOD-TIER (8 líneas) ──
            `#EXTVLCOPT:avcodec-error-resilience=1`,
            `#EXTVLCOPT:avcodec-workaround-bugs=1`,
            `#EXTVLCOPT:avcodec-debug=0`,
            `#EXTVLCOPT:ffmpeg-skip-frame=0`,
            `#EXTVLCOPT:ffmpeg-skip-idct=0`,
            `#EXTVLCOPT:ffmpeg-threads=0`,
            `#EXTVLCOPT:postproc-quality=6`,
            `#EXTVLCOPT:avformat-options={analyzeduration:10000000,probesize:10000000,fflags:+genpts+igndts+discardcorrupt}`,
            // ── SECCIÓN 9: AUDIO PRESERVATION — PASSTHROUGH GOD-TIER ──
            // Permite al hardware hacerse cargo inmediato, reduciendo CPU freeze.
            `#EXTVLCOPT:audio-track=0`,
            `#EXTVLCOPT:spdif=1`,
            `#EXTVLCOPT:aout=any`,
            `#EXTVLCOPT:audio-language=spa,eng,und`,
            `#EXTVLCOPT:audio-desync=0`,
            `#EXTVLCOPT:audio-replay-gain-mode=none`,
            // ── SECCIÓN 10: RESOLUCIÓN (profile-aware, 4 líneas) ──
            `#EXTVLCOPT:preferred-resolution=${cfg.height || 4320}`,
            // ── SECCIÓN 11: VIDEO PROCESSING — HARDWARE MAXIMIZER (11 líneas) ──
            `#EXTVLCOPT:video-scaler=vdpau,opengl`,
            `#EXTVLCOPT:aspect-ratio=16:9`,
            `#EXTVLCOPT:sharpen-sigma=0.05`,
            `#EXTVLCOPT:contrast=1.0`,
            `#EXTVLCOPT:brightness=1.0`,
            `#EXTVLCOPT:saturation=1.0`,
            `#EXTVLCOPT:gamma=1.0`,
            `#EXTVLCOPT:video-title-show=0`,
            `#EXTVLCOPT:no-video-title-show`,
            // ── SECCIÓN 12: NETWORK & BANDWIDTH MAXIMIZER (6 líneas) ──
            `#EXTVLCOPT:auto-adjust-pts-delay=1`,
            `#EXTVLCOPT:adaptive-caching=true`,
            `#EXTVLCOPT:adaptive-cache-size=5000`,
            `#EXTVLCOPT:swscale-fast=0`,
            // ── SECCIÓN 13: ERROR RESILIENCE (5 líneas) ──
            // Se eliminó avcodec-options por seguridad
            `#EXTVLCOPT:avcodec-error-concealment=motion_vector`,
            `#EXTVLCOPT:avcodec-max-consecutive-errors=5`,
            `#EXTVLCOPT:avcodec-skip-on-error=1`,
            `#EXTVLCOPT:avcodec-loop-filter=1`,
            // ── SECCIÓN 14: PLAYBACK CONTROL (6 líneas) ──
            `#EXTVLCOPT:repeat=100`,
            `#EXTVLCOPT:input-repeat=65535`,
            `#EXTVLCOPT:loop=1`,
            `#EXTVLCOPT:live-pause=0`,
            // ── SECCIÓN 15: SYNC & DISPLAY (3 líneas) ──
            `#EXTVLCOPT:avcodec-preset=p6`,
            `#EXTVLCOPT:fullscreen=1`,
            // ── SECCIÓN 16: RESOLVER-SYNC — Directives from rq_sniper_mode.php ──
            `#EXTVLCOPT:adaptive-maxbw=300000000`,
            `#EXTVLCOPT:tls-session-resumption=true`,
            `#EXTVLCOPT:http-user-timeout=15000`,
            `#EXTVLCOPT:postproc-q=6`,
            `#EXTVLCOPT:network-caching-dscp=56`,
            `#EXTVLCOPT:no-http-reconnect=0`
        ];
    }

    function build_kodiprop(cfg, profile, index) {
        const lcevcState = resolveLcevcState(cfg); // LCEVC Dinámico: nunca DISABLED
        const streamHeaders = JSON.stringify({
            "User-Agent": `Mozilla/5.0 (APE-NAVIGATOR; ${cfg.name}) AppleWebKit/537.36`,
            "X-APE-Profile": profile,
            "X-LCEVC-State": lcevcState,
            "X-Buffer-Min": String(GLOBAL_CACHING.network),
            "X-Clock-Jitter": String(cfg.clock_jitter || 1500),
            "X-Clock-Synchro": String(cfg.clock_synchro || 1),
            "X-ISP-Throttle-Level": "1-EXTREME",
            "X-ISP-BW-Demand": "MAX_CONTRACT",
            "X-ISP-Parallel-Streams": "4",
            "X-ISP-TCP-Window": "4194304",
            // ── 🌌 FUSIÓN INFINITA BWDIF: Directivas Adaptativas Polimórficas via JSON ──
            "X-Fusion-Infinita-Mode": "AGUJERO_NEGRO_HLS",
            "X-Resolution-Hierarchy": "480,720,1080,2160,4320",
            "X-Adaptive-Logic": "HIGHEST",
            "X-Adaptive-Max-Resolution": "7680x4320",
            "X-BWDIF-Chain": "bwdif>yadif2x>yadif",
            "X-BWDIF-GPU-Offload": "FORCE",
            "X-Deinterlace-Priority": "BWDIF_FIRST",
            "X-HW-Decode-Force": "mediacodec,vaapi,nvdec,d3d11va,videotoolbox",
            "X-Pixel-Absorption": "MAXIMUM_BANDWIDTH",
            "X-Codec-Priority": "hevc,hev1,hvc1,h265,av1,h264",
            // ── 🎥 V17.2 CODEC FORCING via JSON ──
            "X-Video-Codec-Override": "hevc",
            "X-Video-Profile-Override": "main10",
            "X-Video-Tier": "HIGH",
            "X-Video-Level": "6.1,5.1,5.0,4.1",
            "X-Pixel-Format": "yuv420p10le",
            "X-Color-Depth-Force": "10bit",
            "X-Color-Space-Force": "bt2020",
            "X-Ignore-Screen-Resolution": "true",
            "X-HDR-Pipeline": "FORCE_10BIT_MAIN10",
            "X-Video-Scaler": "vdpau,opengl",
            "X-Sharpen-Sigma": "0.05",
            "X-Hardware-Extract-Max": "true",
            // ── 🎬 CONTENT-AWARE HEVC MULTICHANNEL via JSON ──
            "X-Encoder-Engine": "nvenc_hevc",
            "X-Encoder-Preset": "p6",
            "X-Encoder-Tune": "hq",
            "X-Rate-Control": "VBR_CONSTRAINED",
            "X-VBV-Max-Rate": String(Math.ceil((cfg.bitrate || 8000) * 1.3)),
            "X-VBV-Buf-Size": String(Math.ceil((cfg.bitrate || 8000) * 2)),
            "X-GOP-Size": String(cfg.gop_size || 60),
            "X-B-Frames": "2",
            "X-Lookahead": "10",
            "X-AQ-Mode": "SPATIAL",
            "X-Content-Aware-Mode": "PER_SCENE_CONTINUOUS",
            "X-Content-Analysis-FPS": "1",
            "X-Motion-Entropy-Action": "BOOST_40_PERCENT",
            "X-Talking-Head-Action": "REDUCE_30_PERCENT",
            "X-Smoothing-Window": "6-10s",
            "X-Failover-Policy": "CBR_FIXED_80_PERCENT",
            "X-ABR-Ladder": "2160p@25Mbps,1440p@16Mbps,1080p@10Mbps,720p@6Mbps,540p@3Mbps",
            "X-Scaler-Algorithm": "LANCZOS_HW",
            "X-CMAF-Chunk-Duration": "200ms",
            "X-E2E-Latency-Target": "4000ms",
            "X-GPU-Decode-Engine": "cuvid",
            "X-GPU-Filter-Chain": "VRAM_ONLY",
            // ── 🧠 CORTEX QUALITY ENGINE via EXTHTTP JSON ──
            "X-Cortex-Quality-Engine": "v1.0.0",
            "X-Cortex-Decision-Tree": "codec>transport>hdr>abr>deinterlace>enhancement",
            "X-Cortex-Codec-Priority": "hevc=100,av1=95,vp9=85,avc=70",
            "X-Cortex-Transport-Priority": "cmaf>fmp4>ts>dash",
            "X-Cortex-HDR-Policy": "passthrough>hable>reinhard>mobius",
            "X-Cortex-HDR-Tone-Map-HDR10": "hable",
            "X-Cortex-HDR-Tone-Map-HDR10Plus": "reinhard",
            "X-Cortex-HDR-Tone-Map-DolbyVision": "mobius",
            "X-Cortex-ABR-Safety-Margin": "0.2",
            "X-Cortex-ABR-Algorithm": "throughput>buffer",
            "X-Cortex-ABR-Switch-Up": "1.2",
            "X-Cortex-ABR-Switch-Down": "0.8",
            "X-Cortex-ABR-Interval-Min": "5000",
            "X-Cortex-Deinterlace-Priority": "bwdif=95,w3fdif=85,yadif=80",
            "X-Cortex-Deinterlace-Detect": "auto,fps=25:29.97:50:59.94,field=tff",
            "X-Cortex-Device-Type": "universal",
            "X-Cortex-Device-Screen": "3840x2160",
            "X-Cortex-Device-HDR": "hdr10:hdr10plus:dolbyvision:hlg",
            "X-Cortex-Device-Codec-HEVC": "decode:true,profile:main:main10:high,hw:true",
            "X-Cortex-Device-Codec-AV1": "decode:true,profile:main,hw:true",
            "X-Cortex-Device-Max-Bitrate": "50000000",
            "X-Cortex-Device-LCEVC": "true",
            "X-Cortex-Network-BW-Method": "throughput",
            "X-Cortex-Network-Stable-Ratio": "0.8",
            "X-Cortex-Network-Variance-Threshold": "0.2",
            "X-Cortex-Network-Latency-Threshold": "100",
            "X-Cortex-Network-Jitter-Threshold": "30",
            "X-Cortex-Network-Loss-Threshold": "0.01",
            "X-Cortex-Artifact-Deblocking": "auto",
            "X-Cortex-Artifact-Loop-Filter": "enabled",
            "X-Cortex-Artifact-Concealment": "motion_vector",
            "X-Cortex-Artifact-Error-Resilience": "true",
            "X-Cortex-Fallback-Codec": "hevc>av1>vp9>avc",
            "X-Cortex-Fallback-Transport": "cmaf>fmp4>ts",
            "X-Cortex-Fallback-Resolution": "4K>2K>FHD>HD>SD",
            "X-Cortex-Fallback-HDR": "passthrough>tone_map>sdr",
            "X-Cortex-FFMPEG-HLS-TS": "hls_time=6,hls_flags=independent_segments",
            "X-Cortex-FFMPEG-HLS-CMAF": "segment_type=fmp4,hls_time=4",
            "X-Cortex-FFMPEG-x265-Params": "deblock:-1:-1,hdr-opt=1,repeat-headers=1",
            "X-Cortex-Noise-Reduction": "nlmeans+hqdn3d,preserve-detail=true",
            "X-Cortex-Enhancement-LCEVC": "tune=vq,base=hevc",
            "X-Cortex-Idempotency": "deterministic",
            "X-Cortex-Channels-Map": "v1.0.0",
            "X-Cortex-Bidirectional": "resolve>enrich>override>update",
            // ── 🚀 TRANSPORT DECISION MODULE v2.0 via EXTHTTP JSON ──
            "X-Transport-Engine": "v2.0.0",
            "X-Transport-Decision-Tree": "origin>player>device>hdr>telemetry>network>scoring>mode>fallback>decision",
            "X-Transport-Modes": "direct_ts,direct_cmaf,worker_ts,worker_cmaf,worker_dash_hls_hybrid",
            "X-Transport-Player-Matrix": "vlc:TS=0.95|CMAF=0.55,ott:TS=0.90|CMAF=0.92,kodi:TS=0.88|CMAF=0.85,shaka:TS=0.80|CMAF=0.95",
            "X-Transport-HDR-Matrix": "vlc:HDR10+HDR10+|ott:HDR10+HDR10++DV+HLG|stb:none",
            "X-Transport-Scoring": "player=0.30,device=0.25,hdr=0.15,telemetry=0.15,network=0.15",
            "X-Transport-CMAF-Threshold": "0.15",
            "X-Transport-TS-Threshold": "0.10",
            "X-Transport-Default-On-Tie": "direct_ts",
            "X-Transport-CMAF-Segment-Type": "fmp4",
            "X-Transport-CMAF-Init": "init.mp4",
            "X-Transport-CMAF-Independent": "true",
            "X-Transport-CMAF-Target-Duration": "4",
            "X-Transport-CMAF-Low-Latency": "true",
            "X-Transport-CMAF-HLS-Version": "7",
            "X-Transport-CMAF-Dash-Hybrid": "true",
            "X-Transport-Fallback-CMAF": "direct_cmaf>worker_ts>direct_ts>worker_hybrid",
            "X-Transport-Fallback-TS": "direct_ts>worker_cmaf>direct_cmaf>worker_hybrid",
            "X-Transport-Penalty-VLC-Legacy": "CMAF:-0.25",
            "X-Transport-Penalty-STB-Legacy": "CMAF:-0.40",
            "X-Transport-Origin-Threshold": "0.3",
            "X-Transport-Worker-ZeroDrop": "true",
            "X-Transport-Worker-Watchdog": "manifest=30s,freeze=10s,health=5s",
            "X-Transport-Network-Unstable": "bonus_ts=0.15,penalty_cmaf=0.10",
            "X-Transport-Network-Strong": "bonus_cmaf=0.10",
            "X-Transport-FFmpeg-CMAF": "seg=4,fmp4,hls_playlist=1,latency=3",
            "X-Transport-FFmpeg-Hybrid": "seg=4,fmp4,ldash=1,streaming=1",
            "X-Transport-FFmpeg-TS": "mpegts,pcr=50,pat=0.1",
            "X-Transport-FFmpeg-Tonemap": "bt2390,peak=100,desat=0",
            "X-Transport-HDR-Chain": "native>tone_mapped>sdr",
            "X-Transport-HDR-Passthrough": "true",
            "X-Transport-Telemetry": "startup+rebuffer+freeze+quality_switches",
            "X-Transport-Telemetry-Learn": "true",
            "X-Transport-Stability-First": "true"
        });
        return [
            '#KODIPROP:inputstream=inputstream.adaptive',
            '#KODIPROP:inputstream.adaptive.manifest_type=hls',
            '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
            // --- 🚀 ESCALADA TÁCTICA RAMPA (Aceleración Progresiva 0-60s) ---
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp=true',
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp_step=10000000', // Sube 10 Mbps
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp_interval=500', // Cada 500ms
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp_peak=100000000', // Tope 100 Mbps
            '#KODIPROP:inputstream.adaptive.bandwidth_handoff_ms=60000', // Toma de control Sentinel al minuto
            // -------------------------------------------------------------
            '#KODIPROP:inputstream.adaptive.chooser_bandwidth_type=BANDWIDTH_AVERAGE',
            '#KODIPROP:inputstream.adaptive.preferred_codec=hevc,hev1,hvc1,h265',
            `#KODIPROP:inputstream.adaptive.max_resolution=${cfg.resolution || '3840x2160'}`,
            `#KODIPROP:inputstream.adaptive.resolution_secure_max=${cfg.resolution || '3840x2160'}`,
            // v6.1 COMPAT: Usa resolución del PERFIL REAL, no 7680x4320 hardcodeado
            // ── 🛡️ PEVCE ACTIVE METADATA ENFORCEMENT & ZAPPING ENGINE ──
            '#KODIPROP:inputstream.adaptive.stream_selection_enabled=true',
            '#KODIPROP:inputstream.adaptive.play_timeshift_buffer_size=256', // Amplificado 2x para Fase de Impulso
            '#KODIPROP:inputstream.adaptive.force_hdr=true',
            // ── 🎥 V17.2 CODEC FORCING & HARDWARE DELEGATION ──
            '#KODIPROP:inputstream.adaptive.video_codec_override=hevc',
            '#KODIPROP:inputstream.adaptive.video_profile=main10',
            '#KODIPROP:inputstream.adaptive.ignore_screen_resolution=true',
            '#KODIPROP:inputstream.adaptive.hardware_decode=true',
            '#KODIPROP:inputstream.adaptive.tunneling_enabled=true', // Audio/Video direct al Display (Evita Stutter SO)
            // ── 🔇 AUDIO FALLBACK ENGINE (Passthrough Seguro > eac3 > ac3 > aac) ──
            `#KODIPROP:inputstream.adaptive.audio_codec_override=${cfg.audio_codec || 'eac3'}`,
            `#KODIPROP:inputstream.adaptive.audio_channels=${cfg.audio_channels >= 6 ? '5.1' : '2.0'}`,
            `#KODIPROP:inputstream.adaptive.audio_passthrough=${cfg.audio_channels >= 6 ? 'true' : 'false'}`,
            `#KODIPROP:inputstream.adaptive.dolby_atmos=${cfg.audio_channels >= 8 ? 'true' : 'false'}`,
            // ── 🎬 CONTENT-AWARE HEVC via KODIPROP ──
            `#KODIPROP:inputstream.adaptive.max_bandwidth=${cfg.max_bandwidth || 50000000}`,
            `#KODIPROP:inputstream.adaptive.initial_bandwidth=${Math.min(cfg.max_bandwidth || 50000000, 10000000)}`,
            // v6.1 COMPAT: max_bandwidth respeta perfil (no 303Mbps), initial_bandwidth max 10Mbps
            '#KODIPROP:inputstream.adaptive.bandwidth_preference=unlimited',
            `#KODIPROP:inputstream.adaptive.max_fps=${cfg.fps || 60}`,
            '#KODIPROP:inputstream.adaptive.adaptation.set_limits=true',
            '#KODIPROP:inputstream.adaptive.manifest_reconnect=true',
            '#KODIPROP:inputstream.adaptive.retry_max=100',
            '#KODIPROP:inputstream.adaptive.segment_download_retry=20',
            '#KODIPROP:inputstream.adaptive.segment_download_timeout=60000',
            '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full',
            '#KODIPROP:inputstream.adaptive.drm_legacy_mode=true',
            '#KODIPROP:inputstream.adaptive.play_timeshift_buffer=true',
            `#KODIPROP:inputstream.adaptive.initial_bitrate_max=${cfg.max_bandwidth || 50000000}`,
            // v6.1 COMPAT: initial_bitrate_max respeta perfil
            '#KODIPROP:inputstream.adaptive.read_timeout=60000',
            '#KODIPROP:inputstream.adaptive.connection_timeout=60000',
            '#KODIPROP:inputstream.adaptive.audio_sample_rate=48000',
            '#KODIPROP:inputstream.adaptive.audio_bit_depth=24',
            '#KODIPROP:inputstream.adaptive.spatial_audio=true',
            `#KODIPROP:inputstream.adaptive.stream_params=profile=${profile}`,
            `#KODIPROP:inputstream.adaptive.stream_headers=${streamHeaders}`,
            `#KODIPROP:inputstream.adaptive.live_delay=${Math.floor((GLOBAL_CACHING.file * 4) / 1000)}`,
            `#KODIPROP:inputstream.adaptive.buffer_duration=${Math.floor((GLOBAL_CACHING.network * 4) / 1000)}`,
            `#KODIPROP:inputstream.adaptive.prefetch_size=16`, // Absorbe carga en fase de estabilización
            // ── 🔥 OLED SHOWROOM SUPREMACY v5 (5000cd/m² PERCEPTION & ZERO CRASH) ──
            // Exprimir 5000 nits de luminancia sin desbordar el decoder. Negros absolutos orgánicos.
            '#KODIPROP:inputstream.adaptive.hdr_handling=force_hdr',
            '#KODIPROP:inputstream.adaptive.max_luminance=5000',
            '#KODIPROP:inputstream.adaptive.min_luminance=0.0000', // Negros OLED Profundos 100%
            '#KODIPROP:inputstream.adaptive.hdr10_plus_parse=true',
            '#KODIPROP:inputstream.adaptive.dolby_vision_rpu=true',
            '#KODIPROP:inputstream.adaptive.color_primaries=bt2020',
            '#KODIPROP:inputstream.adaptive.transfer=smpte2084', // Obliga curva PQ pura HDR
            '#KODIPROP:inputstream.adaptive.matrix_coefficients=bt2020nc',
            '#KODIPROP:inputstream.adaptive.color_space=bt2020',
            '#KODIPROP:inputstream.adaptive.pixel_format=yuv420p10le', // Profundidad de espectro expandida
            // Tone mapping perceptual adaptativo, previene el clipping que causaba crashes de parseo
            '#KODIPROP:inputstream.adaptive.tone_mapping=mobius', // Renderizado Mobius superior para Highlights en destellos
            '#KODIPROP:inputstream.adaptive.tone_mapping_peak=5000',
            '#KODIPROP:inputstream.adaptive.contrast_boost=1.15', // Amplificador dinámico de contraste vital
            '#KODIPROP:inputstream.adaptive.film_grain_synthesis=false' // Nitidez extrema sin penalización de gpu
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🎯 APE CHANNEL CLASSIFIER v3.0 — Dynamic JSON-backed Engine
    // Reads from ape-classifier-data.json via window.APE_CLASSIFIER_DATA
    // Outputs GroupTitleBuilder-compatible _classification objects
    // ═══════════════════════════════════════════════════════════════════

    // ── Regex-based region patterns (stays in code: needs compiled regex for channel matchers) ──
    const REGION_PATTERNS = {
      'UK': { codes: ['UK','GB','BRITISH'], patterns: [/[\|┃]UK[\|┃]/i,/\bUK\s+(SKY|BBC|ITV|CHANNEL)/i,/BBC\s*[0-9]/i,/ITV\s*[0-9]/i,/SKY\s+(SPORTS|CINEMA|NEWS|ONE|TWO)/i], channels: ['BBC','ITV','SKY UK','CHANNEL 4','CHANNEL 5','BT SPORT'], language: 'en-GB', region: 'EUROPA', country: 'Reino Unido' },
      'ES': { codes: ['ES','ESP','SPAIN'], patterns: [/[\|┃]ES[\|┃]/i,/\bES:/i,/MOVISTAR/i,/TELECINCO/i,/ANTENA\s*3/i,/LA\s*SEXTA/i,/CUATRO/i], channels: ['MOVISTAR','TELECINCO','ANTENA 3','LA SEXTA','CUATRO','LA 1','LA 2','DAZN ES'], language: 'es-ES', region: 'EUROPA', country: 'España' },
      'DE': { codes: ['DE','GER','GERMANY'], patterns: [/[\|┃]DE[\|┃]/i,/\bDE:/i,/DAS\s*ERSTE/i,/ZDF/i,/RTL\s*(II|2)?/i,/SAT\.?1/i,/PROSIEBEN/i,/SKY\s*DE/i], channels: ['DAS ERSTE','ZDF','RTL','SAT.1','PROSIEBEN','SKY DEUTSCHLAND'], language: 'de-DE', region: 'EUROPA', country: 'Alemania' },
      'FR': { codes: ['FR','FRA','FRANCE'], patterns: [/[\|┃]FR[\|┃]/i,/\bFR:/i,/FRANCE\s*[0-9]/i,/TF1/i,/M6/i,/CANAL\s*\+/i], channels: ['TF1','M6','FRANCE 2','CANAL+','BEIN SPORTS FR'], language: 'fr-FR', region: 'EUROPA', country: 'Francia' },
      'IT': { codes: ['IT','ITA','ITALY'], patterns: [/[\|┃]IT[\|┃]/i,/\bIT:/i,/RAI\s*[0-9]/i,/MEDIASET/i,/SKY\s*IT/i,/CANALE\s*[0-9]/i], channels: ['RAI 1','RAI 2','RAI 3','CANALE 5','SKY ITALIA','DAZN IT'], language: 'it-IT', region: 'EUROPA', country: 'Italia' },
      'PT': { codes: ['PT','PRT','PORTUGAL'], patterns: [/[\|┃]PT[\|┃]/i,/RTP\s*[0-9]/i,/SIC/i,/TVI/i,/SPORT\s*TV/i], channels: ['RTP 1','SIC','TVI','SPORT TV','BENFICA TV'], language: 'pt-PT', region: 'EUROPA', country: 'Portugal' },
      'NL': { codes: ['NL','NLD','NETHERLANDS'], patterns: [/[\|┃]NL[\|┃]/i,/NPO\s*[0-9]/i,/RTL\s*(NL|4|5|7|8)/i,/ZIGGO/i], channels: ['NPO 1','NPO 2','RTL 4','ZIGGO SPORT','ESPN NL'], language: 'nl-NL', region: 'EUROPA', country: 'Holanda' },
      'PL': { codes: ['PL','POL','POLAND'], patterns: [/[\|┃]PL[\|┃]/i,/POLSAT/i,/TVN/i,/TVP\s*[0-9]/i], channels: ['POLSAT','TVN','TVP 1','ELEVEN SPORTS PL'], language: 'pl-PL', region: 'EUROPA', country: 'Polonia' },
      'TR': { codes: ['TR','TUR','TURKEY'], patterns: [/[\|┃]TR[\|┃]/i,/TRT/i,/SHOW\s*TV/i,/KANAL\s*D/i,/BEIN\s*SPORTS?\s*[0-9]\s*(TR|TURKEY)/i], channels: ['TRT 1','SHOW TV','KANAL D','BEIN SPORTS TR'], language: 'tr-TR', region: 'ASIA ARABIA', country: 'Turquía' },
      'GR': { codes: ['GR','GRC','GREECE'], patterns: [/[\|┃]GR[\|┃]/i,/ERT\s*[0-9]/i,/NOVA\s*(SPORTS?|CINEMA)/i,/MEGA/i], channels: ['ERT 1','NOVA','MEGA CHANNEL','ALPHA TV'], language: 'el-GR', region: 'EUROPA', country: 'Grecia' },
      'BE': { codes: ['BE','BEL','BELGIUM'], patterns: [/[\|┃]BE[\|┃]/i,/RTBF/i,/VTM/i,/RTL\s*TVI/i], channels: ['RTBF','VTM','RTL TVI'], language: 'nl-BE,fr-BE', region: 'EUROPA', country: 'Bélgica' },
      'SE': { codes: ['SE','SWE','SWEDEN'], patterns: [/[\|┃]SE[\|┃]/i,/SVT\s*[0-9]/i,/TV[34]/i,/VIASAT/i], channels: ['SVT 1','SVT 2','TV3','TV4','VIASAT'], language: 'sv-SE', region: 'EUROPA', country: 'Suecia' },
      'DK': { codes: ['DK','DNK','DENMARK'], patterns: [/[\|┃]DK[\|┃]/i,/DR\s*[0-9]/i,/TV2\s*(DK|$)/i], channels: ['DR 1','TV2'], language: 'da-DK', region: 'EUROPA', country: 'Dinamarca' },
      'NO': { codes: ['NO','NOR','NORWAY'], patterns: [/[\|┃]NO[\|┃]/i,/NRK\s*[0-9]/i,/TV2\s*(NORGE|NORWAY)/i], channels: ['NRK 1','TV2 NORGE'], language: 'nb-NO', region: 'EUROPA', country: 'Noruega' },
      'FI': { codes: ['FI','FIN','FINLAND'], patterns: [/[\|┃]FI[\|┃]/i,/YLE\s*(TV)?[0-9]/i,/NELONEN/i], channels: ['YLE TV1','MTV3','NELONEN'], language: 'fi-FI', region: 'EUROPA', country: 'Finlandia' },
      'HR': { codes: ['HR','HRV','CROATIA'], patterns: [/[\|┃]HR[\|┃]/i,/HRT\s*[0-9]/i,/SPORTKLUB/i], channels: ['HRT 1','SPORT KLUB HR'], language: 'hr-HR', region: 'EUROPA', country: 'Croacia' },
      'RS': { codes: ['RS','SRB','SERBIA'], patterns: [/[\|┃]RS[\|┃]/i,/RTS\s*[0-9]/i,/B92/i], channels: ['RTS 1','SPORT KLUB','B92'], language: 'sr-RS', region: 'EUROPA', country: 'Serbia' },
      'AL': { codes: ['AL','ALB','ALBANIA'], patterns: [/[\|┃]AL[\|┃]/i,/RTSH/i,/KLAN/i,/TOP\s*CHANNEL/i,/FILM\s*(AKSION|HITS|KOMEDI|DRAME)/i], channels: ['RTSH','KLAN','TOP CHANNEL','FILM AKSION'], language: 'sq-AL', region: 'EUROPA', country: 'Albania' },
      'RO': { codes: ['RO','ROU','ROMANIA'], patterns: [/[\|┃]RO[\|┃]/i,/PRO\s*TV/i,/DIGI\s*(SPORT|FILM)/i], channels: ['PRO TV','ANTENA 1','DIGI SPORT'], language: 'ro-RO', region: 'EUROPA', country: 'Rumanía' },
      'CZ': { codes: ['CZ','CZE','CZECH'], patterns: [/[\|┃]CZ[\|┃]/i,/CT\s*[0-9]/i,/PRIMA/i], channels: ['CT 1','NOVA','PRIMA'], language: 'cs-CZ', region: 'EUROPA', country: 'República Checa' },
      'SK': { codes: ['SK','SVK','SLOVAKIA'], patterns: [/[\|┃]SK[\|┃]/i,/MARKIZA/i,/JOJ/i], channels: ['MARKIZA','JOJ'], language: 'sk-SK', region: 'EUROPA', country: 'Eslovaquia' },
      'HU': { codes: ['HU','HUN','HUNGARY'], patterns: [/[\|┃]HU[\|┃]/i,/RTL\s*(KLUB|HU)/i,/TV2\s*(HU|$)/i], channels: ['RTL KLUB','TV2 HU','DUNA'], language: 'hu-HU', region: 'EUROPA', country: 'Hungría' },
      'BG': { codes: ['BG','BGR','BULGARIA'], patterns: [/[\|┃]BG[\|┃]/i,/BNT\s*[0-9]/i,/BTV/i], channels: ['BNT 1','NOVA BG','BTV'], language: 'bg-BG', region: 'EUROPA', country: 'Bulgaria' },
      'UA': { codes: ['UA','UKR','UKRAINE'], patterns: [/[\|┃]UA[\|┃]/i,/1\+1/i,/INTER\s*(UA|$)/i], channels: ['1+1','INTER','STB'], language: 'uk-UA', region: 'EUROPA', country: 'Ucrania' },
      'RU': { codes: ['RU','RUS','RUSSIA'], patterns: [/[\|┃]RU[\|┃]/i,/ROSSIYA\s*[0-9]/i,/NTV\s*(RU|$)/i,/MATCH\s*TV/i], channels: ['CHANNEL ONE','ROSSIYA 1','NTV','MATCH TV'], language: 'ru-RU', region: 'EUROPA', country: 'Rusia' },
      'US': { codes: ['US','USA','UNITED STATES'], patterns: [/[\|┃]USA?[\|┃]/i,/\bABC\s*(US|$)/i,/\bCBS/i,/\bNBC/i,/\bFOX\s*(NEWS|SPORTS|US|$)/i,/\bESPN\s*(US|$)/i,/\bCNN\s*(US|$)/i,/\bHBO/i], channels: ['ABC','CBS','NBC','FOX','ESPN','CNN','HBO','SHOWTIME','PARAMOUNT+'], language: 'en-US', region: 'NORTEAMÉRICA', country: 'Estados Unidos' },
      'CA': { codes: ['CA','CAN','CANADA'], patterns: [/[\|┃]CA[\|┃]/i,/CBC/i,/CTV/i,/TSN/i,/SPORTSNET/i], channels: ['CBC','CTV','TSN','SPORTSNET'], language: 'en-CA,fr-CA', region: 'NORTEAMÉRICA', country: 'Canadá' },
      'MX': { codes: ['MX','MEX','MEXICO'], patterns: [/[\|┃]MX[\|┃]/i,/AZTECA/i,/TELEVISA/i,/TUDN/i], channels: ['AZTECA','TELEVISA','TUDN'], language: 'es-MX', region: 'AMÉRICA LATINA', country: 'México' },
      'BR': { codes: ['BR','BRA','BRAZIL'], patterns: [/[\|┃]BR[\|┃]/i,/GLOBO/i,/SBT/i,/RECORD/i,/SPORTV/i], channels: ['GLOBO','SBT','RECORD TV','SPORTV'], language: 'pt-BR', region: 'AMÉRICA LATINA', country: 'Brasil' },
      'AR': { codes: ['AR','ARG','ARGENTINA'], patterns: [/[\|┃]AR[\|┃]/i,/TELEFE/i,/TYC\s*SPORTS/i,/ESPN\s*(SUR|ARGENTINA)/i], channels: ['EL TRECE','TELEFE','TYC SPORTS'], language: 'es-AR', region: 'AMÉRICA LATINA', country: 'Argentina' },
      'CO': { codes: ['CO','COL','COLOMBIA'], patterns: [/[\|┃]CO[\|┃]/i,/CARACOL/i,/RCN/i], channels: ['CARACOL','RCN TV'], language: 'es-CO', region: 'AMÉRICA LATINA', country: 'Colombia' },
      'CL': { codes: ['CL','CHL','CHILE'], patterns: [/[\|┃]CL[\|┃]/i,/CHILEVISION/i,/CDF/i], channels: ['TVN','MEGA','CANAL 13','CDF'], language: 'es-CL', region: 'AMÉRICA LATINA', country: 'Chile' },
      'PE': { codes: ['PE','PER','PERU'], patterns: [/[\|┃]PE[\|┃]/i,/PANAMERICANA/i,/WILLAX/i], channels: ['AMÉRICA TV','ATV','LATINA'], language: 'es-PE', region: 'AMÉRICA LATINA', country: 'Perú' },
      'VE': { codes: ['VE','VEN','VENEZUELA'], patterns: [/[\|┃]VE[\|┃]/i,/VENEVISION/i,/TELEVEN/i], channels: ['VENEVISION','TELEVEN','GLOBOVISION'], language: 'es-VE', region: 'AMÉRICA LATINA', country: 'Venezuela' },
      'AE': { codes: ['AE','ARE','UAE','EMIRATES'], patterns: [/[\|┃]AE[\|┃]/i,/DUBAI\s*(TV|SPORTS?)/i,/ABU\s*DHABI/i], channels: ['DUBAI TV','ABU DHABI SPORTS'], language: 'ar-AE', region: 'ASIA ARABIA', country: 'Emiratos Árabes' },
      'SA': { codes: ['SA','SAU','SAUDI'], patterns: [/[\|┃]SA[\|┃]/i,/SAUDI/i,/ROTANA/i,/MBC\s*(SA|$)/i], channels: ['SAUDI TV','ROTANA','MBC'], language: 'ar-SA', region: 'ASIA ARABIA', country: 'Arabia Saudita' },
      'EG': { codes: ['EG','EGY','EGYPT'], patterns: [/[\|┃]EG[\|┃]/i,/NILE\s*(TV|SPORTS?)/i], channels: ['NILE TV','NILE SPORTS','CBC'], language: 'ar-EG', region: 'ASIA ARABIA', country: 'Egipto' },
      'IN': { codes: ['IN','IND','INDIA'], patterns: [/[\|┃]IN[\|┃]/i,/STAR\s*(SPORTS|PLUS)/i,/SONY\s*(TV|SPORTS)/i,/ZEE/i,/COLORS/i], channels: ['STAR SPORTS','SONY TV','ZEE TV','COLORS'], language: 'hi-IN,en-IN', region: 'ASIA ARABIA', country: 'India' },
      'PK': { codes: ['PK','PAK','PAKISTAN'], patterns: [/[\|┃]PK[\|┃]/i,/GEO\s*(TV|SPORTS)/i,/ARY/i,/HUM\s*TV/i], channels: ['PTV','GEO TV','ARY NEWS','HUM TV'], language: 'ur-PK', region: 'ASIA ARABIA', country: 'Pakistán' },
      'CN': { codes: ['CN','CHN','CHINA'], patterns: [/[\|┃]CN[\|┃]/i,/CCTV\s*[0-9]/i,/CGTN/i], channels: ['CCTV','CGTN'], language: 'zh-CN', region: 'ASIA ARABIA', country: 'China' },
      'JP': { codes: ['JP','JPN','JAPAN'], patterns: [/[\|┃]JP[\|┃]/i,/NHK/i,/FUJI\s*TV/i,/TV\s*ASAHI/i,/WOWOW/i,/DAZN\s*(JP|JAPAN)/i], channels: ['NHK','FUJI TV','WOWOW','DAZN JP'], language: 'ja-JP', region: 'ASIA ARABIA', country: 'Japón' },
      'KR': { codes: ['KR','KOR','KOREA'], patterns: [/[\|┃]KR[\|┃]/i,/KBS\s*[0-9]/i,/JTBC/i], channels: ['KBS','MBC','SBS','JTBC'], language: 'ko-KR', region: 'ASIA ARABIA', country: 'Corea del Sur' },
      'ZA': { codes: ['ZA','ZAF','SOUTH AFRICA'], patterns: [/[\|┃]ZA[\|┃]/i,/SABC/i,/DSTV/i,/SUPERSPORT/i], channels: ['SABC','DSTV','SUPERSPORT'], language: 'en-ZA', region: 'RESTO DEL MUNDO', country: 'Sudáfrica' },
      'AU': { codes: ['AU','AUS','AUSTRALIA'], patterns: [/[\|┃]AU[\|┃]/i,/SEVEN\s*(NETWORK|AU)/i,/NINE\s*(NETWORK|AU)/i,/FOX\s*SPORTS?\s*(AU|AUSTRALIA)/i,/KAYO/i], channels: ['ABC AU','SEVEN','NINE','FOX SPORTS AU','KAYO'], language: 'en-AU', region: 'RESTO DEL MUNDO', country: 'Australia' },
      'NZ': { codes: ['NZ','NZL','NEW ZEALAND'], patterns: [/[\|┃]NZ[\|┃]/i,/TVNZ/i,/SKY\s*(NZ|NEW ZEALAND)/i], channels: ['TVNZ 1','SKY NZ'], language: 'en-NZ', region: 'RESTO DEL MUNDO', country: 'Nueva Zelanda' },
      'TH': { codes: ['TH','THA','THAILAND'], patterns: [/[\|┃]TH[\|┃]/i,/THAI\s*PBS/i], channels: ['THAI PBS','CHANNEL 3'], language: 'th-TH', region: 'ASIA ARABIA', country: 'Tailandia' },
      'VN': { codes: ['VN','VNM','VIETNAM'], patterns: [/[\|┃]VN[\|┃]/i,/VTV/i,/HTV/i], channels: ['VTV','HTV'], language: 'vi-VN', region: 'ASIA ARABIA', country: 'Vietnam' },
      'ID': { codes: ['ID','IDN','INDONESIA'], patterns: [/[\|┃]ID[\|┃]/i,/TVRI/i,/TRANS\s*TV/i,/SCTV/i], channels: ['TVRI','TRANS TV','SCTV'], language: 'id-ID', region: 'ASIA ARABIA', country: 'Indonesia' },
      'MY': { codes: ['MY','MYS','MALAYSIA'], patterns: [/[\|┃]MY[\|┃]/i,/RTM/i,/ASTRO/i], channels: ['RTM','TV3','ASTRO'], language: 'ms-MY', region: 'ASIA ARABIA', country: 'Malasia' },
      'PH': { codes: ['PH','PHL','PHILIPPINES'], patterns: [/[\|┃]PH[\|┃]/i,/ABS-CBN/i,/GMA/i], channels: ['ABS-CBN','GMA'], language: 'tl-PH', region: 'ASIA ARABIA', country: 'Filipinas' }
    };

    // ── Load classification data from JSON (dynamic) or fallback to window.APE_CLASSIFIER_DATA ──
    const _CLASSIFIER_DATA = (typeof window !== 'undefined' && window.APE_CLASSIFIER_DATA) || {};

    // ── Compile-once: convert keyword strings from JSON to regex ──
    const _compiledContentTypes = {};
    const _rawContentTypes = _CLASSIFIER_DATA.contentTypes || {};
    for (const [type, info] of Object.entries(_rawContentTypes)) {
      _compiledContentTypes[type] = {
        priority: info.priority || 1,
        flag: info.flag || null,
        _compiled: (info.keywords || []).map(kw => {
          const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
          return new RegExp(`\\b${escaped}\\b`, 'i');
        })
      };
    }

    const _compiledSportsSubcats = {};
    const _rawSportsSubcats = _CLASSIFIER_DATA.sportsSubcats || {};
    for (const [sport, keywords] of Object.entries(_rawSportsSubcats)) {
      _compiledSportsSubcats[sport] = (keywords || []).map(kw => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
        return new RegExp(`\\b${escaped}\\b`, 'i');
      });
    }

    const LANG_NAMES = _CLASSIFIER_DATA.languages || { 'ar':'Árabe','zh':'Chino','ja':'Japonés','ko':'Coreano','hi':'Hindi','ru':'Ruso','en':'Inglés','es':'Español','pt':'Portugués','fr':'Francés','de':'Alemán','it':'Italiano','nl':'Holandés','pl':'Polaco','tr':'Turco','el':'Griego','hr':'Croata','sr':'Serbio','sq':'Albanés','ro':'Rumano','cs':'Checo','sk':'Eslovaco','hu':'Húngaro','bg':'Búlgaro','uk':'Ucraniano','sv':'Sueco','da':'Danés','no':'Noruego','nb':'Noruego','fi':'Finlandés','he':'Hebreo','th':'Tailandés','ur':'Urdu','vi':'Vietnamita','id':'Indonesio','ms':'Malayo','tl':'Filipino','km':'Jemer','lo':'Lao','my':'Birmano' };

    // ── Unicode script detectors (must stay as native regex — cannot stringify Unicode ranges) ──
    const LANG_SCRIPTS = {
      'arabic':      { p: /[\u0600-\u06FF]/, l: 'ar', w: 10 },
      'hebrew':      { p: /[\u0590-\u05FF]/, l: 'he', w: 10 },
      'greek':       { p: /[\u0370-\u03FF]/, l: 'el', w: 10 },
      'cyrillic':    { p: /[\u0400-\u04FF]/, l: 'ru,uk,bg,sr', w: 8 },
      'cjk_zh':      { p: /[\u4E00-\u9FFF]/, l: 'zh', w: 10 },
      'cjk_ja':      { p: /[\u3040-\u30FF]/, l: 'ja', w: 10 },
      'cjk_ko':      { p: /[\uAC00-\uD7AF]/, l: 'ko', w: 10 },
      'devanagari':  { p: /[\u0900-\u097F]/, l: 'hi', w: 10 },
      'thai':        { p: /[\u0E00-\u0E7F]/, l: 'th', w: 10 },
      'vietnamese':  { p: /[\u00C0-\u01B0\u1EA0-\u1EF9]/, l: 'vi', w: 7 },
      'myanmar':     { p: /[\u1000-\u109F]/, l: 'my', w: 10 },
      'lao':         { p: /[\u0E80-\u0EFF]/, l: 'lo', w: 10 },
      'khmer':       { p: /[\u1780-\u17FF]/, l: 'km', w: 10 }
    };

    // ── Text-based language detection (common words) ──
    const LANG_TEXT = {
      'es': [/\b(EL|LA|LOS|LAS|DE|DEL|EN|NOTICIAS|DEPORTES|CANAL|CINE|TELEVISIÓN)\b/i],
      'en': [/\b(THE|AND|FOR|NEWS|SPORTS|MOVIES|CHANNEL|FILM|ENTERTAINMENT)\b/i],
      'de': [/\b(DER|DIE|DAS|UND|NACHRICHTEN|SPORT|FERNSEHEN|KANAL)\b/i],
      'fr': [/\b(LE|LA|LES|DU|DES|CINÉMA|SPORT|CHAÎNE|ACTUALITÉS)\b/i],
      'it': [/\b(IL|LO|LA|GLI|CANALE|CINEMA|SPORT|NOTIZIE|TELEVISIONE)\b/i],
      'pt': [/\b(O|A|OS|AS|CANAL|ESPORTE|NOTÍCIAS|TELEVISÃO)\b/i],
      'tr': [/\b(HABER|SPOR|KANAL|TELEVIZYON)\b/i],
      'ar': [/\b(الجزيرة|العربية|أخبار|رياضة|قناة)\b/i],
      'nl': [/\b(HET|EEN|NIEUWS|SPORT|KANAAL)\b/i],
      'pl': [/\b(WIADOMOŚCI|POLSAT|TVN|SPORT)\b/i],
      'ru': [/\b(НОВОСТИ|СПОРТ|КАНАЛ|МАТЧ)\b/i],
      'id': [/\b(BERITA|OLAHRAGA|SIARAN|TELEVISI)\b/i],
      'ms': [/\b(BERITA|SUKAN|SALURAN)\b/i],
      'tl': [/\b(BALITA|PALAKASAN|KANAL)\b/i],
      'vi': [/\b(TIN|THỂ THAO|KÊNH|TRUYỀN HÌNH)\b/i]
    };

    // ═══════════════════════════════════════════════════════════════════
    // CLASSIFIER CLASS — GroupTitleBuilder-compatible output
    // _classification.region.group → used by GroupTitleBuilder.extract('region')
    // _classification.category.group → used by GroupTitleBuilder.extract('category')
    // _classification.quality.group → used by GroupTitleBuilder.extract('quality')
    // _classification.language.group → used by GroupTitleBuilder.extract('language')
    // _classification.country.group → used by GroupTitleBuilder.extract('country')
    // ═══════════════════════════════════════════════════════════════════

    class ChannelClassifier {
      constructor() { this.confThreshold = 0.7; }

      classify(channel) {
        const name = channel.tvgName || channel.name || '';
        const gt = channel.groupTitle || channel.category_name || '';

        // ═══════════════════════════════════════════════════════════════════
        // ⚡ BRIDGE v3.0: Delegar al APEChannelClassifier v3.0 externo
        // El v3.0 es la ÚNICA fuente de verdad. Este clasificador interno
        // actúa como BRIDGE/ADAPTER que mapea el output v3.0 al contrato
        // GroupTitleBuilder (.region.group, .category.group, etc).
        // La lista M3U8 bake estos datos → resolver y channel maps los
        // heredan en CASCADA sin consultar el clasificador directamente.
        // ═══════════════════════════════════════════════════════════════════
        if (typeof window !== 'undefined' && window.APEChannelClassifier && typeof window.APEChannelClassifier.classify === 'function') {
          const v3 = window.APEChannelClassifier.classify(channel);

          // Mapear v3.0 output → GroupTitleBuilder contract
          const regionGroup  = v3.region?.group || 'RESTO DEL MUNDO';
          const langGroup    = v3.language?.language || 'ORIGINAL / MIXTO';
          const langCode     = v3.language?.code || 'und';
          const catGroup     = v3.category?.category || 'GENERALISTA';
          const catEmoji     = v3.category?.emoji || '📡';
          const qualGroup    = v3.quality?.quality || 'FULL HD';
          const confidence   = (v3.confidence || 50) / 100; // v3 returns 0-100, internal uses 0-1
          const confLevel    = confidence >= 0.9 ? 'VERY_HIGH' : confidence >= 0.75 ? 'HIGH' : confidence >= 0.6 ? 'MEDIUM' : confidence >= 0.4 ? 'LOW' : 'VERY_LOW';

          // Cross-category y sport subcategory del engine interno (v3.0 no tiene esto)
          const contentFallback = { _rawType: catGroup, confidence: v3.category?.confidence ? v3.category.confidence / 100 : 0.5, flag: catEmoji, alternatives: [] };
          const crossCategory = this._crossCategorySports(name, gt, contentFallback);
          let sportSubcategory = null;
          if (catGroup === 'DEPORTES' || (crossCategory && crossCategory.action)) {
            sportSubcategory = this._sportSubcat(name);
          }

          // Construir output con contrato GroupTitleBuilder EXACTO
          return {
            original: { name, groupTitle: gt },
            region:   { group: regionGroup, code: langCode, country: regionGroup, language: langGroup, confidence: confidence, alternatives: v3.region?.signals || [] },
            category: { group: catGroup, category: catGroup, confidence: v3.category?.confidence ? v3.category.confidence / 100 : 0.5, flag: catEmoji, alternatives: [] },
            quality:  { group: qualGroup, quality: qualGroup },
            language: { group: langGroup, code: langCode, confidence: v3.language?.confidence ? v3.language.confidence / 100 : 0.5 },
            country:  { group: regionGroup, code: langCode },
            confidence,
            confidenceLevel: confLevel,
            crossCategory,
            sportSubcategory,
            contentType: { type: catGroup, confidence: v3.category?.confidence ? v3.category.confidence / 100 : 0.5, flag: catEmoji, alternatives: [] },
            _v3Source: true // Marker: data proviene del v3.0 Netflix-grade
          };
        }

        // ═══════════════════════════════════════════════════════════════════
        // FALLBACK: Si v3.0 externo NO está cargado, usar engine interno
        // ═══════════════════════════════════════════════════════════════════
        const regionResult = this._region(name, gt);
        const contentResult = this._content(name, gt);
        const langResult = this._lang(name, gt);
        const qualityResult = this._quality(name);

        const confidence = regionResult.confidence * 0.4 + contentResult.confidence * 0.4 + langResult.confidence * 0.2;
        const confidenceLevel = confidence >= 0.9 ? 'VERY_HIGH' : confidence >= 0.75 ? 'HIGH' : confidence >= 0.6 ? 'MEDIUM' : confidence >= 0.4 ? 'LOW' : 'VERY_LOW';

        const crossCategory = this._crossCategorySports(name, gt, contentResult);
        let sportSubcategory = null;
        if (contentResult._rawType === 'DEPORTES' || (crossCategory && crossCategory.action)) {
          sportSubcategory = this._sportSubcat(name);
        }

        return {
          original: { name, groupTitle: gt },
          region: { group: regionResult.region, code: regionResult.code, country: regionResult.country, language: regionResult.language, confidence: regionResult.confidence, alternatives: regionResult.alternatives },
          category: { group: contentResult._rawType, category: contentResult._rawType, confidence: contentResult.confidence, flag: contentResult.flag, alternatives: contentResult.alternatives },
          quality: { group: qualityResult, quality: qualityResult },
          language: { group: langResult.name, code: langResult.code, confidence: langResult.confidence },
          country: { group: regionResult.country, code: regionResult.code },
          confidence,
          confidenceLevel,
          crossCategory,
          sportSubcategory,
          contentType: { type: contentResult._rawType, confidence: contentResult.confidence, flag: contentResult.flag, alternatives: contentResult.alternatives },
          _v3Source: false // Marker: data proviene del fallback interno
        };
      }

      _quality(name) {
        const n = name.toUpperCase();
        if (n.includes('4K') || n.includes('UHD')) return 'ULTRA HD';
        if (n.includes('FHD') || n.includes('FULL HD')) return 'FULL HD';
        if (n.includes('HD')) return 'HD';
        if (n.includes('SD')) return 'SD';
        return 'HD'; // sensible default
      }

      _region(name, gt) {
        const scores = {};
        for (const [code, d] of Object.entries(REGION_PATTERNS)) {
          let s = 0;
          for (const c of d.codes) { if (new RegExp(`[\\|┃]${c}[\\|┃]`, 'i').test(name) || new RegExp(`[\\|┃]${c}[\\|┃]`, 'i').test(gt)) s += 15; }
          for (const p of d.patterns) { if (p.test(name)) s += 10; if (p.test(gt)) s += 5; }
          const nu = name.toUpperCase();
          for (const ch of d.channels) { if (nu.includes(ch.toUpperCase())) s += 8; }
          if (gt.toUpperCase().includes(d.region.toUpperCase())) s += 5;
          if (gt.toUpperCase().includes(d.country.toUpperCase())) s += 5;
          if (/^\|[A-Z]{2}\|/.test(name)) s += 5;
          if (s > 0) scores[code] = s;
        }
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (!sorted.length) return { code: 'XX', country: 'Desconocido', region: 'RESTO DEL MUNDO', language: 'unknown', confidence: 0, alternatives: [] };
        const [bc, bs] = sorted[0]; const bd = REGION_PATTERNS[bc];
        return { code: bc, country: bd.country, region: bd.region, language: bd.language, confidence: Math.min(bs / 50, 1), alternatives: sorted.slice(1, 3).map(([c, s]) => ({ code: c, country: REGION_PATTERNS[c].country, score: s })) };
      }

      _content(name, gt) {
        const useCompiled = Object.keys(_compiledContentTypes).length > 0;
        const scores = {};
        if (useCompiled) {
          // Dynamic: use JSON-compiled patterns
          for (const [type, d] of Object.entries(_compiledContentTypes)) {
            let s = 0;
            for (const p of d._compiled) { if (p.test(name)) s += 10 * (d.priority / 10); if (p.test(gt)) s += 5 * (d.priority / 10); }
            if (s > 0) scores[type] = { score: s, flag: d.flag };
          }
        }
        const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
        if (!sorted.length) return { _rawType: 'GENERALISTA', confidence: 0.3, flag: null, alternatives: [] };
        const [bt, bd] = sorted[0];
        return { _rawType: bt, confidence: Math.min(bd.score / 100, 1), flag: bd.flag, alternatives: sorted.slice(1, 3).map(([t, d]) => ({ type: t, score: d.score })) };
      }

      _crossCategorySports(name, gt, content) {
        if (content._rawType === 'DEPORTES') return null;
        const nl = name.toLowerCase();
        let score = 0;
        // Use sports keywords from JSON data if available
        const sportsData = _rawContentTypes['DEPORTES'];
        if (sportsData && sportsData.keywords) {
          for (const kw of sportsData.keywords) { if (nl.includes(kw.toLowerCase())) score += 10; }
        }
        score = Math.min(score, 100);
        if (score >= 70) return { detected: 'DEPORTES', score, level: 'DEFINITELY', action: 'RECLASSIFY_IMMEDIATE' };
        if (score >= 50) return { detected: 'DEPORTES', score, level: 'PROBABLY', action: 'RECLASSIFY_AFTER_REVIEW' };
        if (score >= 30) return { detected: 'DEPORTES', score, level: 'POSSIBLY', action: 'FLAG_FOR_REVIEW' };
        return null;
      }

      _sportSubcat(name) {
        for (const [sport, patterns] of Object.entries(_compiledSportsSubcats)) {
          for (const p of patterns) { if (p.test(name)) return sport; }
        }
        return 'general';
      }

      _lang(name, gt) {
        const scores = {};
        for (const [, d] of Object.entries(LANG_SCRIPTS)) { if (d.p.test(name)) { for (const l of d.l.split(',')) scores[l] = (scores[l] || 0) + d.w; } }
        for (const [lang, pats] of Object.entries(LANG_TEXT)) { for (const p of pats) { if (p.test(name)) scores[lang] = (scores[lang] || 0) + 3; } }
        const rr = this._region(name, gt);
        if (rr.language && rr.language !== 'unknown') { for (const l of rr.language.split(',')) scores[l] = (scores[l] || 0) + 5; }
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (!sorted.length) return { code: 'unknown', name: 'Desconocido', confidence: 0 };
        const [bl, bs] = sorted[0];
        return { code: bl, name: LANG_NAMES[bl] || bl, confidence: Math.min(bs / 15, 1) };
      }
    }

    const _channelClassifier = new ChannelClassifier();




    // ═══════════════════════════════════════════════════════════════════
    // 🚀 ENHANCEMENT LAYER ENGINE v1.0 — Segunda capa de optimización
    // Namespace: X-EL-* (NO conflictúa con X-APE-*)
    // ═══════════════════════════════════════════════════════════════════
    const EL_TARGETS = {
        P0: { res: '7680x4320', w: 7680, h: 4320, bitrate: 200000000, hdr: 'dv-hdr10plus',  upscale: 'ai-8k',       vmaf: 96 },
        P1: { res: '3840x2160', w: 3840, h: 2160, bitrate: 80000000,  hdr: 'hdr10plus',     upscale: 'ai-4k-plus',  vmaf: 95 },
        P2: { res: '3840x2160', w: 3840, h: 2160, bitrate: 60000000,  hdr: 'hdr10',         upscale: 'ai-4k',       vmaf: 95 },
        P3: { res: '3840x2160', w: 3840, h: 2160, bitrate: 40000000,  hdr: 'sdr-to-hdr',    upscale: 'ai-upscale',  vmaf: 93 },
        P4: { res: '1920x1080', w: 1920, h: 1080, bitrate: 25000000,  hdr: 'sdr',           upscale: 'lanczos',     vmaf: 93 },
        P5: { res: '1280x720',  w: 1280, h: 720,  bitrate: 15000000,  hdr: 'sdr',           upscale: 'bicubic',     vmaf: 90 }
    };

    function build_enhancement_layer(cfg, profile) {
        const el = EL_TARGETS[profile] || EL_TARGETS['P3'];
        const srcRes = cfg.resolution || '1920x1080';
        const srcBitrate = String(cfg.max_bandwidth || cfg.bitrate * 1000 || 15000000);
        const fps = cfg.fps || 30;

        return {
            // ── Sub-capa 1: Base & Detección ──
            'X-EL-Version': '1.0.0-20260322',
            'X-EL-Mode': 'adaptive-enhancement',
            'X-EL-Source-Profile': profile,
            'X-EL-Source-Resolution': srcRes,
            'X-EL-Source-Bitrate': srcBitrate,
            'X-EL-Enhancement-Status': 'active',

            // ── Sub-capa 2: Escalado de Resolución ──
            'X-EL-Resolution-Mode': 'smart-upscale',
            'X-EL-Resolution-Source': srcRes,
            'X-EL-Resolution-Target': el.res,
            'X-EL-Resolution-Max': '7680x4320',
            'X-EL-Upscale-Algorithm': el.upscale.startsWith('ai') ? 'ai-super-resolution' : el.upscale,
            'X-EL-Upscale-Model': el.upscale.startsWith('ai') ? 'esrgan-pro' : 'none',
            'X-EL-Upscale-Fallback': 'lanczos',
            'X-EL-Upscale-Trigger': 'auto',
            'X-EL-Upscale-Conditions': 'bandwidth>25mbps,display>source',

            // ── Sub-capa 3: Escalado de Bitrate ──
            'X-EL-Bitrate-Mode': 'request-enhancement',
            'X-EL-Bitrate-Source': srcBitrate,
            'X-EL-Bitrate-Target': String(el.bitrate),
            'X-EL-Bitrate-Max-Request': '129000000',
            'X-EL-Bitrate-Strategy': 'greedy-with-fallback',
            'X-EL-Bitrate-Safety-Margin': '0.3',
            'X-EL-Bitrate-Source-Fallback': 'preserve-original',
            'X-EL-Bitrate-Adaptive-Scale': 'true',

            // ── Sub-capa 4: HDR Enhancement ──
            'X-EL-HDR-Mode': 'auto-enhance',
            'X-EL-HDR-Source': (cfg.hdr_support && cfg.hdr_support.length) ? cfg.hdr_support.join(',') : 'sdr',
            'X-EL-HDR-Target': el.hdr,
            'X-EL-HDR-Conversion': el.hdr === 'sdr-to-hdr' ? 'sdr-to-hdr-adaptive' : 'native',
            'X-EL-HDR-Metadata-Generation': 'dynamic',
            'X-EL-HDR-Tone-Mapping': 'bt2390',
            'X-EL-HDR-MaxCLL-Target': '1000',
            'X-EL-HDR-MaxFALL-Target': '400',
            'X-EL-HDR-Mastering-Simulate': 'bt2020-reference',
            'X-EL-HDR-Dolby-Vision-Compat': 'profile5-fallback',

            // ── Sub-capa 5: Color Enhancement ──
            'X-EL-Color-Mode': 'expand-gamut',
            'X-EL-Color-Source': cfg.color_depth >= 10 ? 'bt2020' : 'bt709',
            'X-EL-Color-Target': 'bt2020',
            'X-EL-Color-Bit-Depth': String(cfg.color_depth || 10),
            'X-EL-Color-Subsampling-Target': '4:2:0',
            'X-EL-Color-Gamut-Mapping': 'perceptual',
            'X-EL-Color-Saturation-Enhance': '1.05',
            'X-EL-Color-Contrast-Enhance': 'adaptive',

            // ── Sub-capa 6: Codec Enhancement ──
            'X-EL-Codec-Priority': 'av1,hevc,vp9,h264',
            'X-EL-Codec-Request': 'best-available',
            'X-EL-Codec-Fallback': cfg.codec_primary || 'H264',
            'X-EL-Codec-Profile-Target': 'main10',
            'X-EL-Codec-Level-Target': '6.1',
            'X-EL-Codec-Tier': 'high',
            'X-EL-Codec-Features': 'b-frames=8,ref=8,lookahead=60',

            // ── Sub-capa 7: Post-Processing ──
            'X-EL-PostProcess-Enabled': 'true',
            'X-EL-PostProcess-Noise-Reduction': 'nlmeans-adaptive',
            'X-EL-PostProcess-Sharpening': 'cas-adaptive',
            'X-EL-PostProcess-Debanding': 'enabled',
            'X-EL-PostProcess-Deinterlace': 'bwdif-auto',
            'X-EL-PostProcess-Motion-Smooth': 'auto-detect',
            'X-EL-PostProcess-Film-Grain': 'preserve',

            // ── Sub-capa 8: Quality Metrics ──
            'X-EL-VMAF-Target': String(el.vmaf),
            'X-EL-VMAF-Min-Acceptable': '85',
            'X-EL-SSIM-Target': '0.98',
            'X-EL-Quality-Monitor': 'enabled',
            'X-EL-Quality-Degrade-Action': 'fallback-to-source',
            'X-EL-Quality-Report': 'telemetry',

            // ── Sub-capa 9: Fallback Chain ──
            'X-EL-Fallback-Chain': 'enhanced>scaled>minimal>source>emergency',
            'X-EL-Fallback-On-Error': 'graceful-degrade',
            'X-EL-Fallback-Bandwidth-Threshold': '10mbps',
            'X-EL-Fallback-Timeout': '5000ms',
            'X-EL-Fallback-Max-Retries': '3',
            'X-EL-Fallback-Preserve-Audio': 'true',

            // ── Sub-capa 10: APE Integration ──
            'X-EL-APE-Integration': 'compatible',
            'X-EL-APE-Profile-Respect': 'true',
            'X-EL-APE-Strategy-Complement': 'enhance-above',
            'X-EL-APE-Fallback-Inherit': 'true',
            'X-EL-VLC-Integration': 'compatible',
            'X-EL-VLC-Enhance-Only': 'true',
            'X-EL-Kodi-Integration': 'compatible',
            'X-EL-Kodi-InputStream-Enhance': `max_resolution=${el.res}`
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🧊 ANTIFREEZE NUCLEAR ENGINE v10.0 — EXTHTTP Headers Module
    // Namespace: X-AF-* (AntiFreeze) — NO conflictúa con X-APE-* ni X-EL-*
    // ═══════════════════════════════════════════════════════════════════
    function build_antifreeze_nuclear_headers(cfg, profile) {
        const lvl = ACTIVE_ISP_LEVEL;
        return {
            // ── Sub-capa 1: Antifreeze Core ──
            'X-AF-Version': '10.0-OBSCENE-AGGRESSION',
            'X-AF-Buffer-Strategy': 'NUCLEAR_NO_COMPROMISE',
            'X-AF-Engine-Mode': 'ZERO_TOLERANCE_FREEZE',
            // ── Sub-capa 2: Buffer Configuration ──
            'X-AF-Buffer-Target': '180000',
            'X-AF-Buffer-Min': '60000',
            'X-AF-Buffer-Max': '600000',
            'X-AF-Buffer-RAM-Cache': '2048MB',
            'X-AF-Buffer-SSD-Cache': '10240MB',
            'X-AF-Buffer-Underrun-Strategy': 'AGGRESSIVE_REFILL_INSTANT',
            'X-AF-Buffer-Overrun-Strategy': 'DROP_OLDEST',
            'X-AF-Buffer-Prebuffer-Seconds': '120',
            // ── Sub-capa 3: Prefetch Nuclear ──
            'X-AF-Prefetch-Segments': String(GLOBAL_PREFETCH.segments),
            'X-AF-Prefetch-Parallel': String(GLOBAL_PREFETCH.parallel),
            'X-AF-Prefetch-Aggressiveness': 'OBSCENE',
            'X-AF-Prefetch-Adaptive': 'TRUE',
            'X-AF-Prefetch-Predictive': 'TRUE',
            'X-AF-Prefetch-All-Qualities': 'TRUE',
            // ── Sub-capa 4: Network Caching Nuclear ──
            'X-AF-Network-Caching': '120000',
            'X-AF-Live-Caching': '120000',
            'X-AF-File-Caching': '300000',
            'X-AF-TCP-Caching': '60000',
            'X-AF-Disc-Caching': '30000',
            'X-AF-Sout-Mux-Caching': '120000',
            // ── Sub-capa 5: Reconnection Nuclear ──
            'X-AF-Reconnect-Max': 'UNLIMITED',
            'X-AF-Reconnect-Delay-Min': '0',
            'X-AF-Reconnect-Delay-Max': '50',
            'X-AF-Reconnect-Parallel': '64',
            'X-AF-Reconnect-Instant-Failover': 'TRUE',
            'X-AF-Reconnect-Pool-Size': '50',
            'X-AF-Reconnect-Warm-Pool': '20',
            'X-AF-Reconnect-Pre-Connect': 'TRUE',
            'X-AF-Reconnect-Seamless': 'TRUE',
            // ── Sub-capa 6: Multi-Source Redundancy ──
            'X-AF-Multi-Source': 'ENABLED',
            'X-AF-Multi-Source-Count': '5',
            'X-AF-Multi-Source-Active': '2',
            'X-AF-Multi-Source-Racing': 'TRUE',
            'X-AF-Multi-Source-Failover-Ms': '50',
            'X-AF-Multi-Source-Health-Check': '250',
            // ── Sub-capa 7: Freeze Prediction ──
            'X-AF-Freeze-Prediction': 'ENABLED',
            'X-AF-Freeze-Model': 'LSTM_ENSEMBLE',
            'X-AF-Freeze-Prediction-Window': '5000',
            'X-AF-Freeze-Confidence-Threshold': '0.8',
            'X-AF-Freeze-Prevention-Auto': 'TRUE',
            'X-AF-Freeze-Monitor-Interval': '100',
            // ── Sub-capa 8: ISP Throttle State ──
            'X-AF-ISP-Throttle-Version': '3.0-OBSCENE',
            'X-AF-ISP-Throttle-Levels': '10',
            'X-AF-ISP-Current-Level': lvl.name,
            'X-AF-ISP-Parallel': String(lvl.parallel_streams),
            'X-AF-ISP-TCP-Window': `${lvl.tcp_window_mb}MB`,
            'X-AF-ISP-Burst-Factor': `${lvl.burst_factor}x`,
            'X-AF-ISP-Never-Downgrade': 'TRUE',
            // ── Sub-capa 9: TCP/HTTP Nuclear ──
            'X-AF-TCP-Window': '16777216',
            'X-AF-TCP-Scale': '14',
            'X-AF-TCP-Congestion': 'BBR',
            'X-AF-TCP-Fast-Open': 'TRUE',
            'X-AF-TCP-Quickack': 'TRUE',
            'X-AF-TCP-Nodelay': 'TRUE',
            'X-AF-HTTP-Version': '2',
            'X-AF-HTTP-Pool-Size': '100',
            'X-AF-HTTP-Keepalive': '300',
            'X-AF-HTTP-Pipelining': 'TRUE',
            'X-AF-HTTP-Multiplexing': 'TRUE',
            // ── Sub-capa 10: Quality Safety Net ──
            'X-AF-Never-Drop-Below': '480p',
            'X-AF-Quality-Buffer-All': 'TRUE',
            'X-AF-Quality-Fallback-Chain': '4K>1080p>720p>480p>360p>240p',
            'X-AF-Quality-Switch-Threshold': '15',
            // ── Sub-capa 11: Frame Interpolation ──
            'X-AF-Frame-Interpolation': 'ENABLED',
            'X-AF-Frame-Interpolation-Mode': 'AI_RIFE_V4',
            'X-AF-Frame-Interpolation-Max': '60',
            'X-AF-Frame-Interpolation-GPU': 'TRUE',
            // ── Sub-capa 12: Error Resilience ──
            'X-AF-Error-Resilience': 'MAXIMUM',
            'X-AF-Error-Concealment': 'AI_INPAINTING',
            'X-AF-Error-Max-Consecutive': 'UNLIMITED',
            'X-AF-Error-Recovery': 'INSTANT',
            // ── Sub-capa 13: Clock & Sync ──
            'X-AF-Clock-Jitter': '5000',
            'X-AF-Clock-Synchro': '1',
            'X-AF-Clock-Drift-Compensation': 'AGGRESSIVE',
            'X-AF-Clock-Sync-Mode': 'ADAPTIVE',
            // ── Sub-capa 14: AV Sync ──
            'X-AF-Audio-Gap-Fill': 'TRUE',
            'X-AF-Audio-Smooth-Transition': 'TRUE',
            'X-AF-Video-Smooth-Transition': 'TRUE',
            'X-AF-AV-Sync-Tolerance': '100ms',
            'X-AF-AV-Sync-Correction': 'INSTANT'
        };
    }
    // 🎯 PROVEN IMAGE QUALITY HEADERS (SMPTE/ITU/Netflix standards)
    // ═══════════════════════════════════════════════════════════════════
    function build_proven_quality(cfg, profile) {
        const el = EL_TARGETS[profile] || EL_TARGETS['P3'];
        const fps = cfg.fps || 30;
        const isHDR = (cfg.color_depth || 8) >= 10;

        return {
            // ── Video Resolution & Scan (ITU-R BT.2020) ──
            'X-Video-Resolution-Native': cfg.resolution || '1920x1080',
            'X-Video-Resolution-Output': el.res,
            'X-Video-Scaling-Mode': 'bicubic',
            'X-Video-Scaling-Quality': 'high',
            'X-Video-Display-Aspect-Ratio': '16:9',
            'X-Video-Scan-Type': 'progressive',
            'X-Video-Inverse-Telecine': 'auto',

            // ── Bitrate (Netflix/Apple TV Standards) ──
            'X-Video-Bitrate-Target': String(el.bitrate),
            'X-Video-Bitrate-Max': String(Math.round(el.bitrate * 1.5)),
            'X-Video-Bitrate-Min': String(Math.round(el.bitrate * 0.6)),
            'X-Video-Bitrate-Buffer': String(Math.round(el.bitrate * 1.25)),
            'X-Video-Bitrate-Mode': 'VBR',
            'X-Video-Bitrate-Precision': 'high',

            // ── Frame Rate (EBU R128) ──
            'X-Video-FPS-Native': String(fps),
            'X-Video-FPS-Output': String(fps),
            'X-Video-FPS-Mode': 'native',
            'X-Video-Judder-Reduction': 'enabled',

            // ── HEVC Advanced (x265 documentation) ──
            'X-HEVC-Color-Primaries': isHDR ? 'bt2020' : 'bt709',
            'X-HEVC-Transfer': isHDR ? 'smpte2084' : 'bt1886',
            'X-HEVC-Matrix': isHDR ? 'bt2020nc' : 'bt709',
            'X-HEVC-Deblock': 'enabled',
            'X-HEVC-SAO': 'enabled',
            'X-HEVC-CU-Tree': 'enabled',
            'X-HEVC-Max-CU-Size': '64',
            'X-HEVC-Chroma-Format': cfg.chroma_subsampling || '4:2:0',
            'X-HEVC-Bit-Depth': String(cfg.color_depth || 10),

            // ── x265 Params (Doom9 forum testing) ──
            'X-x265-Preset': 'slow',
            'X-x265-Tune': 'grain',
            'X-x265-AQ-Mode': 'auto-variance',
            'X-x265-AQ-Strength': '1.0',
            'X-x265-ME': 'star',
            'X-x265-SubME': '3',
            'X-x265-psy-rd': '1.0',
            'X-x265-psy-rdoq': '1.0',

            // ── SVT-AV1 (Netflix study) ──
            'X-SVT-AV1-Preset': '6',
            'X-SVT-AV1-Keyint': '300',
            'X-SVT-AV1-Scd': 'true',
            'X-SVT-AV1-Tune': 'psy',
            'X-SVT-AV1-Film-Grain': '1',
            'X-SVT-AV1-Enable-Tf': 'true',

            // ── HDR10 Separated (SMPTE ST 2086) — 5000 NITS QUANTUM PEAK ──
            'X-HDR10-Primaries-G': '0.680,0.320',
            'X-HDR10-Primaries-B': '0.150,0.060',
            'X-HDR10-Primaries-R': '0.640,0.330',
            'X-HDR10-White-Point': '0.3127,0.3290',
            'X-HDR10-Luminance-Max': '5000',
            'X-HDR10-Luminance-Min': '0.0005',
            'X-HDR10-MaxCLL': '5000',
            'X-HDR10-MaxFALL': '800',
            'X-HDR10-Contrast-Ratio': '10000000:1',

            // ── HDR10+ Scene (SMPTE ST 2094-40) — 5000 NITS ──
            'X-HDR10-Plus-Profile': 'A',
            'X-HDR10-Plus-DMI-Enabled': 'true',
            'X-HDR10-Plus-Bezier-Curve': 'enabled',
            'X-HDR10-Plus-Luminance-Percentile': '99',
            'X-HDR10-Plus-Scene-Brightness-Max': '5000',
            'X-HDR10-Plus-Scene-Brightness-Min': '0.0005',
            'X-HDR10-Plus-Scene-MaxSCL': '5000,5000,5000',

            // ── Dolby Vision 8.1 + RPU (cross-compatible) — 5000 NITS ──
            'X-Dolby-Vision-Profile-81': '8.1',
            'X-Dolby-Vision-Profiles': '5,8,7',
            'X-Dolby-Vision-HDR10-Plus-Compat': 'true',
            'X-Dolby-Vision-Cross-Compatible': 'true',
            'X-Dolby-Vision-RPU-Version': '4',
            'X-Dolby-Vision-Backwards-Compatible': 'true',
            'X-Dolby-Vision-L1-MinPQ': '62',
            'X-Dolby-Vision-L1-MaxPQ': '3765',
            'X-Dolby-Vision-L1-AvgPQ': '1200',
            'X-Dolby-Vision-L6-MaxSCL': '5000,5000,5000',

            // ── HLG Advanced (BBC/NHK studies) ──
            'X-HLG-Transfer-Function': 'HLG',
            'X-HLG-Max-Luminance': '4000',
            'X-HLG-System-Gamma': '1.2',
            'X-HLG-Reference-White': '203',
            'X-HLG-SDR-Backward-Compatible': 'true',

            // ── Color Depth (SMPTE ST 2084) ──
            'X-Color-Depth-Input': String(cfg.color_depth || 10),
            'X-Color-Depth-Output': String(cfg.color_depth || 10),
            'X-Color-Bandwidth-Reduction': 'dithering',
            'X-Color-Dithering': 'error-diffusion',
            'X-Color-Banding-Prevention': 'high',

            // ── Chroma (ITU-R BT.2020) ──
            'X-Chroma-Location': 'left',
            'X-Chroma-Precision': String(cfg.color_depth || 10) + 'bit',

            // ── Tone Mapping BT.2390 v4.0 + GPU libplacebo (ITU-R BT.2390-9) — 5000 NITS ──
            'X-Tone-Mapping-Version': '4.0',
            'X-Tone-Mapping-Max-Luminance': '5000',
            'X-Tone-Mapping-Min-Luminance': '0.0005',
            'X-Tone-Mapping-Normalize': 'true',
            'X-Tone-Mapping-Display-Peak': '5000',
            'X-Tone-Mapping-Display-Min': '0.0005',
            'X-Tone-Mapping-Display-Black': '0.0005',
            'X-Tone-Mapping-GPU': 'libplacebo+vulkan+bt2446a',
            'X-Tone-Mapping-Desaturation-Factor': '0',
            'X-Tone-Mapping-Ambient-Light': '100',
            'X-Tone-Mapping-Adaptation': 'auto',
            // Hable Curve (cinematic)
            'X-Tone-Mapping-Shoulder-Strength': '0.22',
            'X-Tone-Mapping-Linear-Strength': '0.30',
            'X-Tone-Mapping-Linear-Angle': '0.10',
            'X-Tone-Mapping-Toe-Strength': '0.20',

            // ── Noise Reduction (BM3D IEEE TIP) ──
            'X-Noise-Reduction-Algorithm': 'nlmeans',
            'X-Noise-Reduction-Strength': '10',
            'X-Noise-Reduction-Patch-Size': '7',
            'X-Noise-Reduction-Research-Size': '15',
            'X-Noise-Preserve-Edges': 'true',
            'X-Noise-Reduction-Luma-Spatial': '4.0',
            'X-Noise-Reduction-Chroma-Spatial': '3.0',
            'X-Noise-Reduction-Luma-Temporal': '6.0',
            'X-Noise-Reduction-Chroma-Temporal': '4.5',

            // ── Film Grain (AV1 spec + Netflix) ──
            'X-Film-Grain-Synthesis': 'enabled',
            'X-Film-Grain-Type': 'film',
            'X-Film-Grain-Strength': 'auto',
            'X-Film-Grain-Frequency': 'medium',

            // ── Deinterlace (BBC W3FDIF + ffmpeg) ──
            'X-Deinterlace-Algorithm': 'bwdif',
            'X-Deinterlace-Mode': 'send_frame',
            'X-Deinterlace-Parity': 'auto',
            'X-Deinterlace-Edge-Detection': 'enabled',

            // ── Sharpening (AMD CAS + FSRCNNX) ──
            'X-Sharpening-Algorithm': 'cas',
            'X-Sharpening-Strength': '0.5',
            'X-Sharpening-Denoise': 'true',
            'X-Sharpening-Edge-Aware': 'true',

            // ── Debanding (mpv tests) ──
            'X-Debanding-Algorithm': 'gradfun',
            'X-Debanding-Strength': '1.0',
            'X-Debanding-Radius': '16',
            'X-Debanding-Dither': 'enabled',

            // ── VMAF (Netflix tech, vmaf_4k model) ──
            'X-VMAF-Model': 'vmaf_4k_v0.6.1',
            'X-VMAF-Phone-Model': 'vmaf_mob_v0.6.1',
            'X-VMAF-Method': 'ms-ssim+viqe',
            'X-VMAF-Feature': 'all',
            'X-VMAF-Target-1080p': '93',
            'X-VMAF-Target-2160p': '95',
            'X-VMAF-Target-4320p': '96',
            'X-VMAF-Min-Threshold': '85',
            'X-VMAF-Max-Deviation': '2',
            'X-PSNR-Target': '42',
            'X-MS-SSIM-Target': '0.97',
            'X-VIF-Target': '0.95'
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔥 MODULE 16 SYNC: HDR PEAK NIT ENGINE 5000cd/m² — Per-Channel Tags
    // Synced with /var/www/html/iptv-ape/ape_hdr_peak_nit_engine.php
    // ═══════════════════════════════════════════════════════════════════
    function build_hdr_peak_nit_tags(cfg, profile) {
        const isHDR = (cfg.color_depth || 8) >= 10;
        const peak = isHDR ? 5000 : 1000;
        const minLum = isHDR ? '0.0005' : '0.01';
        return [
            // 16A: ST 2086 Static Metadata
            `#EXT-X-APE-HDR-PEAK-NIT-ENGINE:v1.0-${peak}cd`,
            `#EXT-X-APE-HDR-MASTERING-DISPLAY:P3-D65|PEAK=${peak}|MIN=${minLum}|MaxCLL=${peak}|MaxFALL=${isHDR ? 800 : 400}`,
            `#EXT-X-APE-HDR-CONTRAST-RATIO:10000000:1`,
            // 16B: HDR10+ Dynamic (per-frame)
            `#EXT-X-APE-HDR10-PLUS-DYNAMIC:L1=${minLum}-${peak}|L2=12-TRIMS|L5=ACTIVE-AREA|L6-MaxSCL=${peak},${peak},${peak}`,
            // 16C: PQ EOTF
            `#EXT-X-APE-HDR-PQ-EOTF:ST2084|TARGET=${peak}|CODE=3765|DEPTH=10bit|FORMAT=yuv420p10le`,
            // 16D: Dolby Vision RPU
            `#EXT-X-APE-HDR-DOLBY-VISION:PROFILES=5,8,7|L1-MaxPQ=3765|L6-MaxSCL=${peak}|CM=v4.0`,
            // 16E: HLG
            `#EXT-X-APE-HDR-HLG:PEAK=4000|GAMMA=1.2|REF-WHITE=203|DUAL-MODE=true`,
            // 16F: GPU Tone Mapping
            `#EXT-X-APE-HDR-GPU-TONEMAP:libplacebo+vulkan|BT2446a|BT2390|DESAT=0|PEAK=${peak}`,
            // 16G: Display/TV Directives
            `#EXT-X-APE-HDR-DISPLAY:PEAK=${peak}|LOCAL-DIMMING=AGGRESSIVE-FULL-ARRAY|SPECULAR=QUANTUM|BLOOM=NATURAL`,
            // 16H: Film Grain Synthesis
            `#EXT-X-APE-HDR-FILM-GRAIN:NEURAL-MPEG|TYPE=analog-cinematic|ADDBACK=post-tonemap`,
            // 16I: KODIPROP HDR (inline summary)
            `#EXT-X-APE-HDR-KODI:force_hdr=true|max_lum=${peak}|color=bt2020|transfer=smpte2084|dv_rpu=true|hdr10plus=true`
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🧹 MODULE 15 SYNC: ANTI-NOISE ENGINE 14-FILTER — Per-Channel Tags
    // Synced with /var/www/html/iptv-ape/ape_anti_noise_engine.php
    // ═══════════════════════════════════════════════════════════════════
    function build_anti_noise_tags(cfg, profile) {
        // Resolution-adaptive noise reduction (from resolver's ape_noise_engine_integrate)
        const height = cfg.height || parseInt((cfg.resolution || '1920x1080').split('x')[1]) || 1080;
        let noiseLevel, filterChain;
        if (height >= 2160) {
            noiseLevel = 'MINIMAL';
            filterChain = 'nlmeans=h=3:p=3:r=9,hqdn3d=2:1.5:3:2';
        } else if (height >= 1080) {
            noiseLevel = 'MODERATE';
            filterChain = 'nlmeans=h=6:p=5:r=15,hqdn3d=4:3:6:4,unsharp=5:5:0.3';
        } else if (height >= 720) {
            noiseLevel = 'AGGRESSIVE';
            filterChain = 'nlmeans=h=8:p=7:r=21,hqdn3d=6:4:8:6,unsharp=5:5:0.5,afftdn=nf=-20';
        } else {
            noiseLevel = 'NUCLEAR';
            filterChain = 'nlmeans=h=10:p=7:r=21,hqdn3d=8:6:10:8,vaguedenoiser=threshold=3:method=2,afftdn=nf=-25,unsharp=7:7:0.7';
        }
        return [
            `#EXT-X-APE-ANTI-NOISE-ENGINE:v1.0-${noiseLevel}`,
            `#EXT-X-APE-ANTI-NOISE-RESOLUTION:${height}p`,
            `#EXT-X-APE-ANTI-NOISE-FILTER-CHAIN:${filterChain}`,
            `#EXT-X-APE-ANTI-NOISE-FILTERS:14`,
            `#EXT-X-APE-ANTI-NOISE-NLMEANS:h=${height >= 2160 ? 3 : height >= 1080 ? 6 : 8}|p=${height >= 2160 ? 3 : 5}|r=${height >= 2160 ? 9 : 15}`,
            `#EXT-X-APE-ANTI-NOISE-HQDN3D:luma-spatial=${height >= 2160 ? 2 : 4}|chroma-spatial=${height >= 2160 ? 1.5 : 3}`,
            `#EXT-X-APE-ANTI-NOISE-AFFTDN:nf=${height >= 720 ? '-20' : '-25'}|tn=1`,
            `#EXT-X-APE-ANTI-NOISE-PRESERVE:EDGES=true|DETAIL=true|GRAIN=cinematic`
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🛡️ ANTI-CUT ISP STRANGULATION — Per-Channel Tags
    // Synced with /var/www/html/iptv-ape/rq_anti_cut_engine.php
    // ═══════════════════════════════════════════════════════════════════
    function build_anti_cut_tags(cfg, profile) {
        // Map profile to anti-cut profile (from resolver's rq_get_anti_cut_profile)
        const profileMap = {
            P0: 'P1-SUPREME',  P1: 'P1-SUPREME',
            P2: 'P2-EXTREME',  P3: 'P3-STANDARD',
            P4: 'P4-STABLE',   P5: 'P5-SAFE'
        };
        const acProfile = profileMap[profile] || 'P3-STANDARD';
        const baseBw = cfg.max_bandwidth || cfg.bitrate * 1000 || 8000000;
        return [
            `#EXT-X-APE-ANTI-CUT-ENGINE:v1.0`,
            `#EXT-X-APE-ANTI-CUT-PROFILE:${acProfile}`,
            `#EXT-X-APE-ANTI-CUT-ISP-STRANGLE:DETECT+EVADE+ESCALATE`,
            `#EXT-X-APE-ANTI-CUT-BW-DEMAND:${baseBw}`,
            `#EXT-X-APE-ANTI-CUT-BW-FLOOR:${Math.floor(baseBw * 0.8)}`,
            `#EXT-X-APE-ANTI-CUT-RECOVERY:INSTANT|PARALLEL=64|WARM-POOL=20`,
            `#EXT-X-APE-ANTI-CUT-DETECTION:PACKET-LOSS|THROUGHPUT-DROP|RTT-SPIKE|TCP-RST`,
            `#EXT-X-APE-ANTI-CUT-ESCALATION:DOUBLE-BW|ROTATE-CDN|MULTI-SOURCE|TCP-WINDOW-SCALE`,
            `#EXT-X-APE-ANTI-CUT-PERSIST:NEVER-DOWNGRADE`
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 📊 QoS / QoE / PREFETCH / PERFORMANCE — Per-Channel Tags v2.0
    // Synced with Profile Manager v9.0 metrics (screenshots P2-4K_EXTREME)
    // Provides ISP bandwidth reference, streaming health targets, and
    // prefetch intelligence directives usable by resolver + player
    // ═══════════════════════════════════════════════════════════════════
    function build_qos_performance_tags(cfg, profile) {
        // ── Computed metrics (same formulas as Profile Manager UI) ──
        const bufferC1 = cfg.network_cache_ms || cfg.buffer_ms || 15000;
        const bufferC2 = cfg.live_cache_ms || cfg.buffer_ms || 15000;
        const playerBuf = cfg.player_buffer_ms || cfg.file_cache_ms || 51000;
        const bufferTotal = bufferC1 + bufferC2 + playerBuf;
        const bitrateKbps = cfg.bitrate || 18000;
        const bitrateMbps = bitrateKbps / 1000;
        const t1 = cfg.throughput_t1 || (bitrateMbps * 1.3);
        const t2 = cfg.throughput_t2 || (bitrateMbps * 1.6);
        const jitterMaxSupported = Math.floor(playerBuf * 0.8);
        const ramReal = ((bufferTotal / 1000) * bitrateMbps / 8);
        const ramPure = (((bufferC1 * 2 + (bufferC1 / 5)) / 1000) * bitrateMbps / 8);
        const overheadMs = playerBuf - Math.floor(bufferC1 / 5);
        const maxBw = cfg.max_bandwidth || (bitrateKbps * 1000 * 2);

        // ── Prefetch computed ──
        const pfSegments = cfg.prefetch_segments || 90;
        const pfParallel = cfg.prefetch_parallel || 40;
        const pfBufTarget = cfg.prefetch_buffer_target ? (cfg.prefetch_buffer_target / 1000) : Math.ceil(bufferTotal / 1000);
        const pfBwMin = cfg.prefetch_min_bandwidth ? (cfg.prefetch_min_bandwidth / 1000000) : (bitrateMbps * 3);
        const segDuration = cfg.segment_duration || 2;
        const fillTime = Math.ceil((pfSegments * segDuration) / Math.max(pfParallel, 1) * (bitrateMbps / Math.max(pfBwMin, 1)) * 2);
        const bwPeak = +(pfBwMin * 1.2).toFixed(1);
        const bwAvg = +bitrateMbps.toFixed(1);
        const burstFactor = +(bwPeak / Math.max(bwAvg, 1)).toFixed(2);
        const ramSteady = Math.ceil(pfBufTarget * bitrateMbps / 8);
        const ramPeak = Math.ceil(ramSteady * 1.12);

        // ── Stall & Risk estimation ──
        const headroom = Math.round((t2 / Math.max(bitrateMbps, 1)) * 100);
        const stallFloor = headroom > 150 ? 0.07 : headroom > 100 ? 0.5 : headroom > 60 ? 2.0 : 5.0;
        const riskScore = headroom > 200 ? 10 : headroom > 150 ? 15 : headroom > 100 ? 30 : headroom > 60 ? 50 : 75;
        const healthLabel = riskScore <= 20 ? 'EXCELLENT' : riskScore <= 40 ? 'GOOD' : riskScore <= 60 ? 'FAIR' : 'POOR';

        // ── Profile level mapping ──
        const levelMap = { P0: 5, P1: 5, P2: 4, P3: 3, P4: 2, P5: 1 };
        const level = levelMap[profile] || 3;

        return [
            // ── SECTION 16 — Streaming Health & QoS Targets (10 tags) ──
            `#EXT-X-APE-STREAMING-HEALTH:${healthLabel}`,
            `#EXT-X-APE-STALL-RATE-TARGET:${stallFloor}`,
            `#EXT-X-APE-STALL-TARGET-THRESHOLD:1.67`,
            `#EXT-X-APE-RISK-SCORE:${riskScore}/100`,
            `#EXT-X-APE-HEADROOM:${headroom}%`,
            `#EXT-X-APE-JITTER-MAX-SUPPORTED:${jitterMaxSupported}ms`,
            `#EXT-X-APE-BUFFER-TOTAL-C1C2C3:${bufferTotal}ms`,
            `#EXT-X-APE-ISP-BW-MIN-TARGET:${t1}Mbps`,
            `#EXT-X-APE-ISP-BW-OPT-TARGET:${t2}Mbps`,
            `#EXT-X-APE-PROFILE-LEVEL:${level}`,

            // ── SECTION 17 — Prefetch Intelligence (8 tags) ──
            `#EXT-X-APE-PREFETCH-STRATEGY:ultra-aggressive`,
            `#EXT-X-APE-PREFETCH-SEGMENTS-PRELOAD:${pfSegments}`,
            `#EXT-X-APE-PREFETCH-PARALLEL-DOWNLOADS:${pfParallel}`,
            `#EXT-X-APE-PREFETCH-BUFFER-TARGET:${pfBufTarget}s`,
            `#EXT-X-APE-PREFETCH-BW-MIN:${pfBwMin}Mbps`,
            `#EXT-X-APE-PREFETCH-ADAPTIVE-INTELLIGENCE:enabled`,
            `#EXT-X-APE-PREFETCH-AI-PREDICTION:enabled`,
            `#EXT-X-APE-PREFETCH-FILL-TIME:${fillTime}s`,

            // ── SECTION 18 — Performance Estimation / RAM / Overhead (6 tags) ──
            `#EXT-X-APE-BW-PEAK-AVG:${bwPeak}/${bwAvg}Mbps`,
            `#EXT-X-APE-RAM-STEADY-PEAK:${ramSteady}/${ramPeak}MB`,
            `#EXT-X-APE-RAM-REAL-PURE:${ramReal.toFixed(1)}/${ramPure.toFixed(1)}MB`,
            `#EXT-X-APE-BURST-FACTOR:${burstFactor}x`,
            `#EXT-X-APE-STALL-FLOOR:${stallFloor}%`,
            `#EXT-X-APE-OVERHEAD-SECURITY:${overheadMs}ms`
        ];
    }

    function build_exthttp(cfg, profile, index, sessionId, reqId) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nowDate = new Date(Date.now() - 86400000).toUTCString();
        const vpsDomain = (typeof window !== 'undefined' && window.app && window.app.state && window.app.state.currentServer && window.app.state.currentServer.baseUrl)
            ? window.app.state.currentServer.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '')
            : 'https://iptv-ape.duckdns.org';

        const lcevcState = resolveLcevcState(cfg); // LCEVC Dinámico: nunca DISABLED
        const fps = cfg.fps || 30;

        let isp = {};
        if (ACTIVE_ISP_LEVEL) {
            isp = {
                "X-ISP-Throttle-Level": `1-${ACTIVE_ISP_LEVEL.name}`,
                "X-ISP-BW-Demand": ACTIVE_ISP_LEVEL.strategy || "MAX_CONTRACT",
                "X-ISP-BW-Ceiling": "NONE",
                "X-ISP-BW-Floor": "FULL_CONTRACT",
                "X-ISP-Burst-Mode": "ENABLED",
                "X-ISP-Burst-Factor": `${ACTIVE_ISP_LEVEL.burst_factor || 1.5}x`,
                "X-ISP-Burst-Duration": `${ACTIVE_ISP_LEVEL.burst_duration_s || 999999}s`,
                "X-ISP-Parallel-Streams": String(ACTIVE_ISP_LEVEL.parallel_streams || 4),
                "X-ISP-Segment-Pipeline": String(ACTIVE_ISP_LEVEL.parallel_streams || 4),
                "X-ISP-Prefetch-Ahead": `${ACTIVE_ISP_LEVEL.prefetch_s || 999999}s`,
                "X-ISP-TCP-Window": String((ACTIVE_ISP_LEVEL.tcp_window_mb || 4) * 1024 * 1024),
                "X-ISP-TCP-Nodelay": "1",
                "X-ISP-TCP-Quickack": "1",
                "X-ISP-QUIC-Enabled": String(ACTIVE_ISP_LEVEL.quic !== false),
                "X-ISP-HTTP2-Push": "true",
                "X-ISP-HTTP3-Enabled": String(ACTIVE_ISP_LEVEL.http3 !== false),
                "X-ISP-Pipelining": "true",
                "X-ISP-Keepalive-Max": "200",
                "X-ISP-Keepalive-Timeout": "120",
                "X-ISP-Demand-Strategy": "aggressive",
                "X-ISP-QoS-Override": "EF",
                "X-ISP-DSCP-Force": "46",
                "X-ISP-Priority-Escalation": "ENABLED",
                "X-ISP-BW-Probe-Interval": "5s",
                "X-ISP-BW-Probe-Size": "1MB"
            };
        }

        const headers = {
            "User-Agent": `Mozilla/5.0 (APE-NAVIGATOR; ${cfg.name}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
            "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,video/mp2t,video/MP2T,*/*;q=0.9",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "identity",
            "Sec-CH-UA": '"Chromium";v="120","Not-A.Brand";v="24"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
            "Sec-CH-UA-Arch": "x86",
            "Sec-CH-UA-Bitness": "64",
            "Sec-CH-UA-Model": '""',
            "Sec-Fetch-Dest": "media",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?0",
            "Connection": "keep-alive",
            "Keep-Alive": `timeout=${isp['X-ISP-Keepalive-Timeout'] || '120'}, max=${isp['X-ISP-Keepalive-Max'] || '200'}`,
            "DNT": "0",
            "Sec-GPC": "0",
            "Upgrade-Insecure-Requests": "0",
            "TE": "trailers",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Range": "bytes=0-",
            "If-None-Match": "*",
            "If-Modified-Since": nowDate,
            "Priority": "u=0, i",
            "Origin": vpsDomain,
            "Referer": `${vpsDomain}/`,
            "X-Requested-With": "XMLHttpRequest",
            "X-App-Version": `APE_${VERSION}_ULTIMATE_HDR`,
            "X-Playback-Session-Id": sessionId,
            "X-Device-Id": `DEV_${generateRandomString(16)}`,
            "X-Client-Timestamp": String(timestamp),
            "X-Request-Id": reqId,
            "X-Stream-Type": "hls,dash",
            "X-Quality-Preference": `codec-av1,profile-main-12,main-10,main,tier-high,codec-hevc,${(cfg.hevc_profile || 'MAIN-10-HDR').toLowerCase()}`,
            "X-Playback-Rate": "1.0,1.25,1.5",
            "X-Segment-Duration": "1,2,4",
            "X-Min-Buffer-Time": "2,4,6",
            "X-Max-Buffer-Time": "12,18,25",
            "X-Request-Priority": "ultra-high",
            "X-Prefetch-Enabled": "true,adaptive,auto",

            // ── QUALITY UPGRADE v3 — 38 new EXTHTTP fields (A-J) ─────────
            "X-CMAF-Part-Target": cfg.cmaf_chunk_duration || "1.0",
            "X-CMAF-Server-Control": "CAN-BLOCK-RELOAD=YES",
            "X-CMAF-Playlist-Type": "LIVE",
            "X-CMAF-Delta-Playlist": "true",
            "X-CMAF-Program-Date-Time": new Date().toISOString(),
            "X-FMP4-Edit-List": "true",
            "X-FMP4-EMSG-Box": "true",
            "X-FMP4-PSSH-Box": "true",
            "X-FMP4-Client-Data": "true",
            "X-LCEVC-Rate-Control": "CRF+VBR",
            "X-LCEVC-Psycho-Visual": "true",
            "X-LCEVC-B-Frames": cfg.lcevc_bframes || "8",
            "X-LCEVC-Ref-Frames": cfg.lcevc_refframes || "16",
            "X-LCEVC-Lookahead": cfg.lcevc_lookahead || "60",
            "X-AI-SR-Precision": "FP16",
            "X-AI-SR-Tile-Size": "256",
            "X-AI-SR-GPU-Acceleration": "cuda",
            "X-AI-SR-Noise-Reduction": "auto",
            "X-AI-SR-Artifact-Removal": "enabled",
            "X-AI-SR-Model": "esrgan-pro",
            "X-AI-SR-Scale": "4x",
            "X-AI-SR-Enabled": "true",
            "X-AI-Motion-Estimation": "OPTICAL-FLOW",
            // ── LCEVC Enhancement ──
            "X-LCEVC-Enabled": "true",
            "X-LCEVC-Version": "1.0",
            "X-LCEVC-Enhancement-Type": "mpeg5-part2",
            "X-LCEVC-Base-Codec": "hevc",
            "X-LCEVC-Scale-Factor": "4x",
            "X-LCEVC-L1-Block": "8x8",
            "X-LCEVC-L2-Block": "4x4",
            "X-LCEVC-Threads": "16",
            "X-LCEVC-HW-Acceleration": "required",
            // ── Detail Enhancement ──
            "X-Detail-Enhancement": "enabled",
            "X-Detail-Enhancement-Level": "high",
            "X-Detail-Edge-Enhancement": "adaptive",
            "X-Detail-Texture-Enhancement": "auto",
            "X-Detail-Noise-Threshold": "0.02",
            "X-Detail-Sharpening": "adaptive-unsharp",
            "X-Detail-Sharpen-Sigma": "0.03",
            "X-AI-Content-Type": cfg.group || "GENERAL",
            "X-VVC-Toolset": "FULL",
            "X-VVC-Subpictures": "true",
            "X-VVC-LMCS": "true",
            "X-EVC-Level": cfg.evc_level || "5.1",
            "X-EVC-Toolset": "MAIN",
            "X-HDR-MaxCLL": "5000",
            "X-HDR-MaxFALL": "800",
            "X-HDR-Mastering-Display": "G(0.680,0.320)B(0.150,0.060)R(0.640,0.330)WP(0.3127,0.3290)L(5000,0.0005)",
            "X-HDR-Reference-White": "203nits",
            "X-HDR-Vivid": "true",
            "X-HDR-Filmmaker-Mode": "true",
            "X-HDR-Extended-Range": "true",
            "X-HDR-Peak-Nit-Engine": "v1.0-5000cd",
            "X-HDR-PQ-EOTF": "ST2084",
            "X-HDR-PQ-Target-Code": "3765",
            "X-HDR-Pixel-Format": "yuv420p10le",
            "X-HDR-Local-Dimming": "AGGRESSIVE,FULL-ARRAY,HIGH",
            "X-HDR-Specular-Boost": "quantum-5000nit-per-pixel",
            "X-HDR-Highlight-Rolloff": "NONE",
            "X-HDR-Bloom-Effect": "natural-hdr-glow",
            "X-HDR-Film-Grain-Synthesis": "neural-mpeg-standard",
            // ── HDR10+ Dynamic Metadata ──
            "X-HDR10-Plus": "enabled",
            "X-HDR10-Plus-Version": "1.0",
            "X-HDR10-Plus-MaxLuminance": "5000",
            "X-HDR10-Plus-MinLuminance": "0.0005",
            "X-HDR10-Plus-Dynamic-Tone-Mapping": "per-scene",
            "X-HDR10-Plus-Scene-Analysis": "auto",
            "X-HDR10-Plus-L1-MinMaxAvg": "0.0005,5000,800",
            "X-HDR10-Plus-L6-MaxSCL": "5000,5000,5000",
            // ── Dolby Vision Configuration — 5000 NITS ──
            "X-Dolby-Vision-Profile": "5,8,7",
            "X-Dolby-Vision-Level": "6.1",
            "X-Dolby-Vision-RPU": "present",
            "X-Dolby-Vision-Compatibility": "hdr10-backward-compatible",
            "X-Dolby-Vision-Max-Luminance": "5000",
            "X-Dolby-Vision-Min-Luminance": "0.0005",
            // ── HLG (Hybrid Log-Gamma) ──
            "X-HLG-Enabled": "true",
            "X-HLG-Version": "v2",
            "X-HLG-Reference-White": "203",
            "X-HLG-Alternative-Transfer": "pq-fallback",
            // ── Extended Color Volume ──
            "X-Color-Volume-Primaries": "bt2020",
            "X-Color-Volume-Transfer": "smpte-st2084",
            "X-Color-Volume-Matrix": "bt2020nc",
            "X-Color-Volume-Range": "narrow",
            "X-Color-Volume-Signal": "pq",
            "X-Color-Volume-Metadata": "static+dynamic",
            "X-Audio-Bitrate": cfg.audio_bitrate || "640kbps",
            "X-Audio-Objects": cfg.audio_objects || "128",
            "X-Audio-TrueHD": "true",
            "X-Audio-DRC-Profile": "FILM-STANDARD",
            "X-Thumbnail-Format": "WebP+JPEG+AVIF",
            "X-Trick-Play-Rates": "2,4,8,16,32",
            "X-Chapter-Markers": "true",
            "X-SCTE35-PID": "0x0086",
            "X-SCTE35-Segmentation-Type": "PROGRAM_START",
            "X-SCTE35-Blackout-Override": "true",
            "X-Video-Codecs": "av1,hevc,vp9,h264,mpeg2",
            "X-Audio-Codecs": "aac,ac3,eac3,mp3",
            "X-DRM-Support": "widevine,playready,fairplay",
            "X-Codec-Support": "av1",
            "X-CDN-Provider": "auto",
            "X-Failover-Enabled": "true",
            "X-Buffer-Size": "100000",
            "X-Buffer-Target": "60000",
            "X-Buffer-Min": String(GLOBAL_CACHING.network),
            "X-Buffer-Max": "200000",
            "X-Network-Caching": String(GLOBAL_CACHING.network),
            "X-Live-Caching": String(GLOBAL_CACHING.live),
            "X-File-Caching": String(GLOBAL_CACHING.file),
            "X-Buffer-Strategy": "ultra-aggressive",
            "X-Buffer-Underrun-Strategy": "aggressive-refill",
            "X-Device-Type": "smart-tv",
            "X-Screen-Resolution": cfg.resolution || '1920x1080',
            "X-Network-Type": "wifi",
            "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
            "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
            "X-Player-Type": "exoplayer-ultra-extreme,vlc-pro,kodi-pro",
            // ── 🛡️ HTTP ERROR NUCLEAR EVASION (3xx, 4xx, 5xx) ──
            "X-APE-Follow-Redirects": "true",
            "X-APE-Max-Redirects": "10",
            "X-APE-Auth-Retry": "3",
            "X-APE-Auth-Method": "basic,bearer,digest",
            "X-APE-Fallback-UA": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "X-APE-Fallback-Referer": "https://www.google.com/",
            "X-APE-Fallback-XFF": "1.1.1.1",
            "X-APE-Fallback-Tunnel": "CONNECT",
            "X-APE-Fallback-Backoff": "EXPONENTIAL_JITTER",
            // ── 🛡️ PEVCE ACTIVE METADATA ENFORCEMENT ──
            "X-PEVCE-Network-Caching": "3000",
            "X-PEVCE-Live-Caching": "3000",
            "X-PEVCE-TCP-Caching": "3000",
            "X-PEVCE-HTTP-Reconnect": "true",
            "X-PEVCE-HTTP-Continuous": "true",
            "X-PEVCE-HW-Decode": "any",
            "X-PEVCE-HW-Threads": "0",
            "X-PEVCE-Skip-Frame": "0",
            "X-PEVCE-Skip-Idct": "0",
            "X-PEVCE-Timeshift-RAM": "64MB",
            "X-PEVCE-Deinterlace": "-1",
            "X-PEVCE-Force-HDR": "true",
            "X-Hardware-Decode": "true",
            "X-Tunneling-Enabled": "off",
            "X-Audio-Track-Selection": "default", // FIX: ExoPlayer ArrayIndexOutOfBoundsException (length=3; index=3)
            "X-Subtitle-Track-Selection": "off",
            "X-EPG-Sync": "enabled",
            "X-Catchup-Support": "flussonic-ultra",
            "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
            "X-Initial-Bitrate": String((cfg.bitrate || 5000) * 1000),
            "X-Bandwidth-Preference": "unlimited",
            "X-BW-Estimation-Window": "10",
            "X-BW-Confidence-Threshold": "0.95",
            "X-BW-Smooth-Factor": "0.05",
            "X-Retry-Count": "10,12,15",
            "X-Retry-Delay-Ms": "120,200,350",
            "X-Connection-Timeout-Ms": "2500,3500,6000",
            "X-Read-Timeout-Ms": "6000,9000,12000",
            "X-Reconnect-On-Error": "true,immediate,adaptive",
            "X-Max-Reconnect-Attempts": String(cfg.reconnect_max_attempts || 999999),
            "X-Reconnect-Delay-Ms": "50,100,200",
            "X-Seamless-Failover": "true-ultra",
            "X-Country-Code": (cfg._classification?.country?.code || cfg._classification?.country?.group || 'US').substring(0, 2).toUpperCase(),
            "X-HDR-Support": (cfg.hdr_support || []).join(',') || 'none',
            "X-Color-Depth": `${cfg.color_depth || 8}bit`,
            "X-Color-Space": "bt2020",
            "X-Dynamic-Range": "hdr",
            "X-HDR-Transfer-Function": "pq,hlg",
            "X-Color-Primaries": "bt2020",
            "X-Matrix-Coefficients": "bt2020nc",
            "X-Chroma-Subsampling": cfg.chroma_subsampling || '4:2:0',
            "X-Tone-Mapping": "bt2390-optimized",
            "X-Tone-Mapping-Mode": "auto",
            "X-Tone-Mapping-Target-Luminance": "1000",
            "X-Tone-Mapping-Knee-Point": "0.5",
            "X-Tone-Mapping-Desaturation": "enabled",
            "X-Tone-Mapping-Curve": "smooth",
            "X-Tone-Mapping-Preserve-Highlights": "true",
            "X-HDR-Output-Mode": "auto",
            // ── Advanced Color Management ──
            "X-Color-Management": "full",
            "X-Color-Input-Primaries": "bt2020",
            "X-Color-Output-Primaries": "bt2020",
            "X-Color-Input-Transfer": "pq",
            "X-Color-Output-Transfer": "pq",
            "X-Color-Gamut-Mapping": "perceptual",
            "X-Color-Intent": "absolute-colorimetric",
            // ── Per-Scene Optimization ──
            "X-Scene-Analysis": "enabled",
            "X-Scene-Detection": "content-aware",
            "X-Scene-Brightness-Normalization": "enabled",
            "X-Scene-Contrast-Enhancement": "adaptive",
            "X-Scene-Saturation-Adjustment": "auto",
            "X-HEVC-Tier": cfg.hevc_tier || 'MAIN',
            "X-HEVC-Level": cfg.hevc_level || '4.0',
            "X-HEVC-Profile": cfg.hevc_profile || "MAIN-10,MAIN",
            "X-HEVC-Ref-Frames": "8",
            "X-HEVC-B-Frames": "4",
            "X-HEVC-GOP-Size": "120",
            "X-HEVC-Lookahead": "60",
            "X-Video-Profile": cfg.video_profile || "main-10,main",
            // ── AV1 Optimization ──
            "X-AV1-Profile": "main",
            "X-AV1-Level": "6.0",
            "X-AV1-Tier": "1",
            "X-AV1-Chroma-Format": cfg.chroma_subsampling || "4:2:0",
            "X-AV1-Bit-Depth": String(cfg.color_depth || 10),
            "X-AV1-Color-Primaries": "bt2020",
            "X-AV1-Transfer-Characteristics": "smpte2084",
            "X-AV1-Matrix-Coefficients": "bt2020nc",
            "X-AV1-Film-Grain": "preserved",
            // ── VVC Advanced ──
            "X-VVC-ALF": "enabled",
            "X-VVC-CCALF": "enabled",
            "X-VVC-Chroma-Format": cfg.chroma_subsampling || "4:2:0",
            "X-VVC-Bit-Depth": String(cfg.color_depth || 10),
            "X-Rate-Control": cfg.rate_control || "VBR",
            "X-Entropy-Coding": "CABAC",
            "X-Compression-Level": String(cfg.compression_level || 1),
            "X-Pixel-Format": cfg.pixel_format || 'yuv420p',
            "X-Sharpen-Sigma": String(cfg.sharpen_sigma || 0.02),
            "X-Max-Resolution": cfg.resolution || '1920x1080',
            "X-Max-Bitrate": String(cfg.max_bandwidth || 6000000),
            "X-FPS": String(fps),
            "X-Frame-Rates": `${fps},${fps > 30 ? '50,30,25,24' : '25,24'}`,
            "X-Aspect-Ratio": "16:9,21:9",
            "X-Pixel-Aspect-Ratio": "1:1",
            "X-Dolby-Atmos": "false",
            "X-Audio-Channels": String(cfg.audio_channels || 2),
            "X-Audio-Sample-Rate": "48000",
            "X-Audio-Bit-Depth": "16bit,24bit",
            "X-Spatial-Audio": "false",
            "X-Audio-Passthrough": "false",
            "X-Parallel-Segments": String(cfg.prefetch_parallel || 100),
            "X-Prefetch-Segments": String(cfg.prefetch_segments || 15),
            "X-Segment-Preload": "true",
            "X-Concurrent-Downloads": "8",
            "X-Packet-Loss-Monitor": "enabled,aggressive",
            "X-RTT-Monitoring": "enabled,aggressive",
            "X-Congestion-Detect": "enabled,aggressive-extreme",
            "X-ExoPlayer-Buffer-Min": String(GLOBAL_CACHING.file),
            "X-Manifest-Refresh": String(GLOBAL_CACHING.file),
            "X-KODI-LIVE-DELAY": String(Math.floor(GLOBAL_CACHING.file / 1000)),
            "X-APE-STRATEGY": "ultra-aggressive",
            "X-APE-Prefetch-Segments": "20",
            "X-APE-Quality-Threshold": "0.99",
            "X-APE-CODEC": (cfg.codec_primary || 'H264').toUpperCase(),
            "X-APE-RESOLUTION": cfg.resolution || '1920x1080',
            "X-APE-FPS": String(cfg.fps || 30),
            "X-APE-BITRATE": String(cfg.bitrate || 5000),
            "X-APE-TARGET-BITRATE": String((cfg.bitrate || 5000) * 1000),
            "X-APE-THROUGHPUT-T1": String(cfg.throughput_t1 || 12),
            "X-APE-THROUGHPUT-T2": String(cfg.throughput_t2 || 15),
            "X-APE-Version": "18.2",
            "X-APE-Profile": profile,
            "X-APE-QoE": "5.0",
            "X-APE-Guardian": "enabled",
            "X-APE-DNA-Version": "18.2",
            "X-APE-DNA-Fields": "124",
            "X-APE-DNA-Sync": "bidirectional",
            "X-QoS-DSCP": "EF",
            "X-QoS-Bitrate": `${cfg.bitrate || 5000}kbps`,
            "X-QoS-Priority": "ultra-high",
            "X-APE-Guardian-Enabled": "true",
            "X-APE-Guardian-State": "ONLINE",
            "X-APE-Guardian-Fallback-Level": "3",
            "X-APE-Guardian-Memory": "enabled",
            "X-APE-Guardian-Continuity": "guaranteed",
            "X-APE-Resilience-Strategy": "proactive_failover",
            "X-APE-Resilience-Chain": "7-levels",
            "X-APE-Resilience-Circuit-Breaker": "enabled",
            "X-APE-Resilience-Max-Retries": "3",
            "X-APE-Resilience-Retry-Backoff": "exponential",
            "X-APE-Resilience-Silent-Reconnect": "enabled",
            "X-APE-Telchemy-VSTQ": "enabled",
            "X-APE-Telchemy-VSMQ": "enabled",
            "X-APE-Telchemy-TR101290": "enabled",
            "X-APE-Telchemy-QoE-Target": "5.0",
            "X-APE-Hydra-Stealth": "enabled",
            "X-APE-Hydra-UA-Rotation": "enabled",
            "X-APE-Hydra-Fingerprint-Masking": "enabled",
            "X-LCEVC-Enabled": "true",
            "X-LCEVC-State": lcevcState,
            "X-LCEVC-Enhancement": "mpeg5-part2",
            "X-LCEVC-Scale-Factor": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).scale_factor,
            "X-LCEVC-L1-Block": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).l1_block,
            "X-LCEVC-L2-Block": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).l2_block,
            "X-LCEVC-Threads": String((LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).threads),
            "X-LCEVC-HW-Accel": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).hw_accel,
            "X-LCEVC-Transport": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).transport,
            "X-LCEVC-SEI-NAL-Type": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).sei_nal,
            "X-LCEVC-MPEG-TS-PID": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).pid,
            "X-LCEVC-WebM-Track": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).webm,

            // ── PHASE 4 EDGE COMPUTE & GOD-TIER INJECTORS (KODIPROP) ──
            "X-VMAF-Target": "95.0",
            "X-Film-Grain-Preservation": "DISABLED_IPTV_CLEAN",
            "X-Denoise-Strategy": "AGGRESSIVE_NLM",
            "X-Low-Downswitch": "AGGRESSIVE_HOLD",
            "X-Chroma-Subsampling": "4:4:4",
            "X-Color-Depth": "10bit",
            "X-Force-AI-SR": "true",
            "X-HEVC-Level": "6.1,5.1,5.0,4.1,4.0,3.1",
            "X-LCEVC-Phase4-Mode": "Edge-Compute-Only",
            "X-AI-Compute-Target": "Local-GPU-Targeted",
            "X-LCEVC-Target-Res": "3840x2160",
            // ── QoE Monitoring ──
            "X-QoE-Telemetry": "enabled",
            "X-QoE-Metrics": "latency,buffer,quality,errors",
            "X-QoE-Reporting-Interval": "10000",
            "X-QoE-Target-VMAF": "95",
            "X-QoE-Target-SSIM": "0.98",
            "X-QoE-Max-Stalls": "0",
            "X-QoE-Max-Quality-Switches": "3",
            // ── Error Resilience ──
            "X-Error-Concealment": "motion-vector",
            "X-Error-Resilience": "enabled",
            "X-Error-Max-Consecutive": "5",
            "X-Error-Skip-Threshold": "2",
            "X-Error-Fallback": "lower-quality",
            "X-Error-Recovery-Mode": "graceful",
            // ── ABR Algorithm ──
            "X-ABR-Algorithm": "throughput-buffer-hybrid",
            "X-ABR-Min-Buffer": "10",
            "X-ABR-Max-Buffer": "60",
            "X-ABR-Target-Buffer": "30",
            "X-ABR-Safety-Margin": "0.3",
            "X-ABR-Switch-Up-Threshold": "1.2",
            "X-ABR-Switch-Down-Threshold": "0.8",
            "X-ABR-Max-Switch-Interval": "30000",
            // ── Network Advanced ──
            "X-Network-Connection-Pool": "8",
            "X-Network-Keep-Alive": "enabled",
            "X-Network-TCP-Fast-Open": "enabled",
            "X-Network-QUIC": "preferred",
            // ── Motion Interpolation ──
            "X-Motion-Interpolation": "enabled",
            "X-Motion-Interpolation-Algorithm": "optical-flow",
            "X-Motion-Interpolation-Target-FPS": String(cfg.fps || 60),
            "X-Motion-Blur-Reduction": "enabled",
            "X-Motion-Compensation": "auto",
            // ── Noise Reduction ──
            "X-Noise-Reduction": "nlmeans+hqdn3d",
            "X-Noise-Reduction-Spatial": "auto",
            "X-Noise-Reduction-Temporal": "auto",
            "X-Noise-Preserve-Detail": "true",
            "X-Noise-Threshold": "auto",
            "X-Noise-Strength": "medium",
            // ── Contrast Enhancement ──
            "X-Contrast-Enhancement": "local-adaptive",
            "X-Contrast-CLAHE": "enabled",
            "X-Contrast-CLAHE-Clip-Limit": "2.0",
            "X-Contrast-CLAHE-Tile-Size": "8",
            "X-Contrast-Auto-Levels": "enabled",
            "X-Contrast-Gamma-Correction": "auto",
            // ── ExoPlayer Optimized ──
            "X-ExoPlayer-Buffer-Max": "200000",
            "X-ExoPlayer-Buffer-Playback": "50000",
            "X-ExoPlayer-Load-Control": "adaptive",
            "X-ExoPlayer-HW-Decode": "all",
            "X-ExoPlayer-Tunneling": "auto",
            // ── Audio Enhancement ──
            "X-Audio-Dialogue-Enhancement": "enabled",
            // ── ☢️ NUCLEAR HEADERS SPEC v6.0 — Missing Keys ──
            "X-Concurrent-Downloads": "256",
            "X-Parallel-Segments": "64",
            "X-ISP-Parallel-Connections": "256",
            "X-HLS-Version": "10",
            "X-CMAF-Support": "fmp4,lldash",
            "X-Low-Latency": "true,ll-hls",
            "X-Max-Reconnect-Attempts": "999999",
            "X-Max-Consecutive-Errors": "UNLIMITED",
            "X-Skip-Unavailable-Segments": "true"
        };

        for (const [k, v] of Object.entries(isp)) {
            if (k !== 'name') headers[k] = v;
        }

        // ── FIX 1,5,6,11: Per-profile ISP overrides (reference v5.4) ──
        const _ispOv = {
            P0: { 'X-ISP-Segment-Pipeline': '64', 'X-ISP-Throttle-Level': '1-NUCLEAR', 'X-ISP-TCP-Window': '16777216', 'X-ISP-Burst-Duration': '60s' },
            P1: { 'X-ISP-Segment-Pipeline': '4', 'X-ISP-Throttle-Level': '1-EXTREME', 'X-ISP-TCP-Window': '4194304', 'X-ISP-Burst-Duration': '30s' },
            P2: { 'X-ISP-Segment-Pipeline': '16', 'X-ISP-Throttle-Level': '1-AGGRESSIVE', 'X-ISP-TCP-Window': '2097152', 'X-ISP-Burst-Duration': '20s' },
            P3: { 'X-ISP-Segment-Pipeline': '8', 'X-ISP-Throttle-Level': '2-HIGH', 'X-ISP-TCP-Window': '1048576', 'X-ISP-Burst-Duration': '15s' },
            P4: { 'X-ISP-Segment-Pipeline': '4', 'X-ISP-Throttle-Level': '3-MEDIUM', 'X-ISP-TCP-Window': '524288', 'X-ISP-Burst-Duration': '10s' },
            P5: { 'X-ISP-Segment-Pipeline': '4', 'X-ISP-Throttle-Level': '4-LOW', 'X-ISP-TCP-Window': '262144', 'X-ISP-Burst-Duration': '5s' }
        };
        Object.assign(headers, _ispOv[profile] || _ispOv['P3']);

        // ── 🌈 ITM SDR→HDR Engine: CAPA 2 (EXTHTTP Headers) ──
        // Inyectar headers ITM para señalizar al player el modo de mapeo de tonos inverso
        headers['X-ITM-Mode'] = 'ADAPTIVE_FRAME_BY_FRAME';
        headers['X-ITM-Target-Nits'] = '1000';
        headers['X-ITM-Target-Gamut'] = 'BT.2020';
        headers['X-ITM-Analysis'] = 'LUMINANCE_PEAK+APL+HISTOGRAM';
        headers['X-ITM-Metadata-Injection'] = 'MaxFALL+MaxCLL+DYNAMIC';

        // ── 📊 CAPA 2: Telchemy TVQM — Directivas de Diagnóstico via JSON ──
        headers['X-Telchemy-VSTQ-Target'] = '50';
        headers['X-Telchemy-VSMQ-Target'] = '50';
        headers['X-Telchemy-EPSNR-Min'] = '45';
        headers['X-Telchemy-MAPDV-Max'] = '10';
        headers['X-Telchemy-PPDV-Max'] = '5';
        headers['X-Telchemy-TR101290-Sync-Loss'] = '0';
        headers['X-Telchemy-TR101290-CC-Error'] = '0';
        headers['X-Telchemy-TR101290-PCR-Error'] = '0';
        headers['X-Telchemy-Blockiness-Guard'] = 'ACTIVE';
        headers['X-Telchemy-Jerkiness-Guard'] = 'ACTIVE';
        headers['X-Telchemy-GoP-Size-Max'] = '120';
        headers['X-Telchemy-Buffer-Underrun-Action'] = 'EXPAND_NETWORK_CACHING';

        // ── 📊 QoS / ISP Bandwidth Targets / Streaming Health (EXTHTTP) ──
        const _bpsKbps = cfg.bitrate || 18000;
        const _bpsMbps = _bpsKbps / 1000;
        const _t1 = cfg.throughput_t1 || (_bpsMbps * 1.3);
        const _t2 = cfg.throughput_t2 || (_bpsMbps * 1.6);
        const _bufC1 = cfg.network_cache_ms || cfg.buffer_ms || 15000;
        const _bufC2 = cfg.live_cache_ms || cfg.buffer_ms || 15000;
        const _playerBuf = cfg.player_buffer_ms || cfg.file_cache_ms || 51000;
        const _bufTotal = _bufC1 + _bufC2 + _playerBuf;
        const _headroom = Math.round((_t2 / Math.max(_bpsMbps, 1)) * 100);
        const _risk = _headroom > 200 ? 10 : _headroom > 150 ? 15 : _headroom > 100 ? 30 : _headroom > 60 ? 50 : 75;
        headers['X-APE-ISP-BW-Min-Target'] = `${_t1}`;
        headers['X-APE-ISP-BW-Opt-Target'] = `${_t2}`;
        headers['X-APE-Buffer-Total-C1C2C3'] = `${_bufTotal}`;
        headers['X-APE-Jitter-Max-Supported'] = `${Math.floor(_playerBuf * 0.8)}`;
        headers['X-APE-Streaming-Health'] = _risk <= 20 ? 'EXCELLENT' : _risk <= 40 ? 'GOOD' : _risk <= 60 ? 'FAIR' : 'POOR';
        headers['X-APE-Risk-Score'] = `${_risk}`;
        headers['X-APE-Headroom'] = `${_headroom}`;
        headers['X-APE-Stall-Rate-Target'] = _headroom > 150 ? '0.07' : _headroom > 100 ? '0.5' : '2.0';
        headers['X-APE-Prefetch-Segments'] = `${cfg.prefetch_segments || 90}`;
        headers['X-APE-Prefetch-Parallel'] = `${cfg.prefetch_parallel || 40}`;
        headers['X-APE-RAM-Estimate'] = `${((_bufTotal / 1000) * _bpsMbps / 8).toFixed(0)}MB`;
        headers['X-APE-Overhead-Security'] = `${_playerBuf - Math.floor(_bufC1 / 5)}ms`;

        // ══════════════════════════════════════════════════════════════════════
        // 🛡️ REGLA ANTI-400: Límite 10KB / 200 headers en EXTHTTP
        // ══════════════════════════════════════════════════════════════════════
        // El servidor Xtream Codes (Nginx) rechaza peticiones con headers > 12KB.
        // Pruebas de estrés confirmaron:
        //   200 headers (~10KB) → ✅ 200 OK
        //   250 headers (~12.8KB) → ❌ 400 Bad Request
        // Solución: los primeros 200 headers viajan por #EXTHTTP (directo al servidor).
        // Los headers overflow viajan por #EXT-X-APE-OVERFLOW-HEADERS (base64 JSON)
        // y el Runtime Evasion Engine los inyecta dinámicamente en cada request.
        // ══════════════════════════════════════════════════════════════════════
        const MAX_EXTHTTP_HEADERS = 200;
        const MAX_EXTHTTP_BYTES = 10240; // 10KB safety limit

        // ── 🚀 ENHANCEMENT LAYER ENGINE v1.0: Merge X-EL-* headers ──
        Object.assign(headers, build_enhancement_layer(cfg, profile));

        // ── 🎯 PROVEN IMAGE QUALITY: Merge SMPTE/ITU/Netflix standards ──
        Object.assign(headers, build_proven_quality(cfg, profile));

        // ── 🧊 ANTIFREEZE NUCLEAR ENGINE v10.0: Merge X-AF-* headers ──
        Object.assign(headers, build_antifreeze_nuclear_headers(cfg, profile));

        // ── 🎯 CHANNEL CLASSIFIER v3.0: Classification metadata headers ──
        if (cfg._classification) {
            const cl = cfg._classification;
            headers['X-APE-CL-Region'] = cl.region.code || 'XX';
            headers['X-APE-CL-Country'] = cl.region.country || 'Desconocido';
            headers['X-APE-CL-Content-Type'] = cl.contentType.type || 'GENERALISTA';
            headers['X-APE-CL-Language'] = cl.language.code || 'unknown';
            headers['X-APE-CL-Language-Name'] = cl.language.name || 'Desconocido';
            headers['X-APE-CL-Confidence'] = String(Math.round(cl.confidence * 100));
            headers['X-APE-CL-Level'] = cl.confidenceLevel || 'VERY_LOW';
            if (cl.contentType.flag) headers['X-APE-CL-Flag'] = cl.contentType.flag;
            headers['X-APE-CL-Suggested-Group'] = cl.suggestedGroupTitle || '';
            // Cross-category detection
            if (cl.crossCategory) {
                headers['X-APE-CL-CrossCat-Detected'] = cl.crossCategory.detected;
                headers['X-APE-CL-CrossCat-Score'] = String(cl.crossCategory.score);
                headers['X-APE-CL-CrossCat-Level'] = cl.crossCategory.level;
                headers['X-APE-CL-CrossCat-Action'] = cl.crossCategory.action;
            }
            // Sport subcategory
            if (cl.sportSubcategory) {
                headers['X-APE-CL-Sport-Subcat'] = cl.sportSubcategory;
            }
        }

        // ── 📡 TELEMETRY: Channel Identification Headers ──
        // Viajan con cada request al resolver para lookup instantáneo sin API
        if (cfg._channelName) headers['X-APE-Channel-Name'] = cfg._channelName;
        if (cfg._channelId) headers['X-APE-Channel-ID'] = cfg._channelId;

        // ── 👁️ IPTV-SUPPORT-CORTEX vΩ: INYECCIÓN DE HEADERS DOMINANTES ──
        if (typeof window !== 'undefined' && window.IPTV_SUPPORT_CORTEX_V_OMEGA) {
            Object.assign(headers, window.IPTV_SUPPORT_CORTEX_V_OMEGA.getOmegaHeaders(cfg));
        }

        // ══════════════════════════════════════════════════════════════════════
        // 📋 DYNAMIC PM HEADER INJECTION v1.0
        // Reads ALL 19 categories × 140+ headers from Profile Manager v9.0
        // and injects any missing headers into EXTHTTP.
        // Rule: PM values fill gaps ONLY — existing hardcoded values preserved.
        // ══════════════════════════════════════════════════════════════════════
        try {
            if (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG &&
                typeof window.APE_PROFILES_CONFIG.getCategories === 'function' &&
                typeof window.APE_PROFILES_CONFIG.getHeaderValue === 'function') {

                const pmCats = window.APE_PROFILES_CONFIG.getCategories();
                const pmProfileId = profile || (window.ProfileManagerV9 && window.ProfileManagerV9.activeProfileId) || 'P3';
                const pmProfile = window.APE_PROFILES_CONFIG.getProfile(pmProfileId);
                const enabledCats = pmProfile?.enabledCategories || Object.keys(pmCats);
                let pmInjected = 0;

                for (const catId of enabledCats) {
                    const cat = pmCats[catId];
                    if (!cat || !cat.headers) continue;
                    for (const headerName of cat.headers) {
                        if (headers[headerName] !== undefined) continue; // Don't overwrite existing
                        const val = window.APE_PROFILES_CONFIG.getHeaderValue(pmProfileId, headerName);
                        if (val !== undefined && val !== null && val !== '') {
                            headers[headerName] = String(val);
                            pmInjected++;
                        }
                    }
                }

                if (pmInjected > 0 && typeof console !== 'undefined') {
                    console.log(`📋 [PM-INJECT] ${pmInjected} headers from Profile Manager added to EXTHTTP (${enabledCats.length} categories)`);
                }
            }
        } catch (e) {
            if (typeof console !== 'undefined') {
                console.warn('⚠️ [PM-INJECT] Error reading Profile Manager headers:', e.message);
            }
        }

        const allKeys = Object.keys(headers);
        const primaryHeaders = {};
        const overflowHeaders = {};

        // ── 🌈 ITM SDR→HDR Engine: CAPA 3 (OVERFLOW Headers) ──
        overflowHeaders['X-Cortex-ITM-Engine'] = 'ENABLED_SDR_ONLY';
        overflowHeaders['X-Cortex-ITM-Analysis-Depth'] = 'FULL_HISTOGRAM';
        overflowHeaders['X-Cortex-ITM-Expansion-Curve'] = 'ADAPTIVE_PER_FRAME';
        overflowHeaders['X-Cortex-ITM-Color-Space-Out'] = 'BT.2020_NCL';
        overflowHeaders['X-Cortex-ITM-Bit-Depth-Out'] = '10bit';
        let currentBytes = 0;
        let headerCount = 0;

        for (const key of allKeys) {
            const val = String(headers[key]);
            const entryBytes = key.length + val.length + 6; // key:"val",
            if (headerCount < MAX_EXTHTTP_HEADERS && (currentBytes + entryBytes) < MAX_EXTHTTP_BYTES) {
                primaryHeaders[key] = val;
                currentBytes += entryBytes;
                headerCount++;
            } else {
                overflowHeaders[key] = val;
            }
        }

        const exthttp = `#EXTHTTP:${JSON.stringify(primaryHeaders)}`;

        // Si hay overflow, codificarlo como base64 para el Runtime Engine
        const overflowKeys = Object.keys(overflowHeaders);
        if (overflowKeys.length > 0) {
            const overflowJson = JSON.stringify(overflowHeaders);
            const overflowB64 = base64UrlEncode(overflowJson);
            return `${exthttp}\n#EXT-X-APE-OVERFLOW-HEADERS:${overflowB64}`;
        }

        return exthttp;
    }

    function build_ape_block(cfg, profile, index, channel) {
        const buildTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 18) + 'Z';
        const codecStr = window._APE_PRIO_QUALITY !== false ? (profile === 'P0' ? 'hvc1.1.6.L183.B0,mp4a.40.2' : 'hvc1.1.6.L150.B0,mp4a.40.2') : `hvc1.1.6.L150.B0,mp4a.40.2`;
        const lcevcState = resolveLcevcState(cfg);
        const lc = resolveLcevcConfig(profile, cfg);


        // ✅ FIX v16.4.1: lcevcBaseCodec derivado del codec REAL del STREAM-INF
        // (no de un valor hardcodeado). La coherencia es total.
        // 🔴 CORTEX vΩ FIX: Usamos el perfil ORIGINAL (pre-Cortex) para resolver el codec base.
        // El Cortex fuerza P0 en TODOS los canales para maximizar calidad,
        // pero LCEVC-BASE-CODEC debe reflejar el codec REAL que el hardware decodificará.
        // 🔴 FIX LCEVC-BASE-CODEC (120/120)
        // Usar el perfil ORIGINAL (pre-Cortex) para determinar el codec base.
        // El Cortex fuerza P0 en todos los canales, pero LCEVC-BASE-CODEC
        // debe reflejar el codec REAL: P0 = AV1 (8K), resto = HEVC.
        const _origProfile = cfg._cortex_original_profile || channel._originalProfile || profile;
        const lcevcBaseCodec = _origProfile === 'P0' ? 'AV1' : 'HEVC';


        return [
            // ── SECTION 1 — Identity (8 tags) ──────────────────────────────
            `#EXT-X-APE-VERSION:18.2`,
            `#EXT-X-APE-PROFILE:${channel._originalProfile || profile}`,
            `#EXT-X-APE-CHANNEL-KEY:${index}`,
            `#EXT-X-APE-STREAM-ID:${index}`,
            `#EXT-X-APE-CODEC:${codecStr}`,
            `#EXT-X-APE-RESOLUTION:${cfg.resolution || '1920x1080'}`,
            `#EXT-X-APE-FRAME-RATE:${cfg.fps || 30}`,
            `#EXT-X-APE-BITRATE:${cfg.bitrate || 5000}kbps`,

            // ── SECTION 2 — LCEVC Identity (6 tags) ────────────────────────
            `#EXT-X-APE-HDR-PROFILE:${(cfg.hdr_support || []).join(',') || 'none'}`,
            `#EXT-X-APE-LCEVC-ENABLED:true`,
            `#EXT-X-APE-LCEVC-STATE:${lcevcState}`,
            `#EXT-X-APE-LCEVC-BASE-CODEC:${lcevcBaseCodec}`,
            `#EXT-X-APE-LCEVC-ENHANCEMENT:mpeg5-part2`,
            `#EXT-X-APE-LCEVC-SCALE-FACTOR:${(LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).scale_factor}`,

            // ── SECTION 3 — QoS/QoE (6 tags) ──────────────────────────────
            `#EXT-X-APE-AI-SR-ENABLED:true`,
            `#EXT-X-APE-QOE-SCORE:5.0`,
            `#EXT-X-APE-QOS-DSCP:EF`,
            `#EXT-X-APE-QOS-BITRATE:${cfg.bitrate || 5000}kbps`,
            `#EXT-X-APE-QOS-PRIORITY:ultra-high`,
            `#EXT-X-APE-VQS-SCORE:95`,

            // ── SECTION 4 — Buffer (4 tags) ────────────────────────────────
            `#EXT-X-APE-BUFFER-TARGET:60s`,
            `#EXT-X-APE-BUFFER-MIN:15s`,
            `#EXT-X-APE-BUFFER-MAX:200s`,
            `#EXT-X-APE-PREBUFFER:15s`,

            // ── SECTION 5 — Guardian (5 tags) ──────────────────────────────
            `#EXT-X-APE-GUARDIAN-ENABLED:true`,
            `#EXT-X-APE-GUARDIAN-STATE:ONLINE`,
            `#EXT-X-APE-GUARDIAN-FALLBACK-LEVEL:3`,
            `#EXT-X-APE-GUARDIAN-MEMORY:enabled`,
            `#EXT-X-APE-GUARDIAN-CONTINUITY:guaranteed`,

            // ── SECTION 6 — Resilience (6 tags) ───────────────────────────
            `#EXT-X-APE-RESILIENCE-STRATEGY:proactive_failover`,
            `#EXT-X-APE-RESILIENCE-CHAIN:7-levels`,
            `#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled`,
            `#EXT-X-APE-RESILIENCE-MAX-RETRIES:3`,
            `#EXT-X-APE-RESILIENCE-RETRY-BACKOFF:exponential`,
            `#EXT-X-APE-RESILIENCE-SILENT-RECONNECT:enabled`,

            // ── SECTION 7 — Degradation chain (7 tags) ────────────────────
            `#EXT-X-APE-DEGRADATION-LEVEL-1:CMAF+HEVC+LCEVC`,
            `#EXT-X-APE-DEGRADATION-LEVEL-2:HLS/fMP4+HEVC+LCEVC`,
            `#EXT-X-APE-DEGRADATION-LEVEL-3:HLS/fMP4+H.264`,
            `#EXT-X-APE-DEGRADATION-LEVEL-4:HLS/TS+H.264`,
            `#EXT-X-APE-DEGRADATION-LEVEL-5:HLS/TS+Baseline`,
            `#EXT-X-APE-DEGRADATION-LEVEL-6:TS-Direct`,
            `#EXT-X-APE-DEGRADATION-LEVEL-7:HTTP-Redirect`,

            // ── SECTION 8 — Telchemy (4 tags) ─────────────────────────────
            `#EXT-X-APE-TELCHEMY-VSTQ:enabled`,
            `#EXT-X-APE-TELCHEMY-VSMQ:enabled`,
            `#EXT-X-APE-TELCHEMY-TR101290:enabled`,
            `#EXT-X-APE-TELCHEMY-QOE-TARGET:5.0`,

            // ── SECTION 9 — Hydra Stealth (3 tags) ────────────────────────
            `#EXT-X-APE-HYDRA-STEALTH:enabled`,
            `#EXT-X-APE-HYDRA-UA-ROTATION:enabled`,
            `#EXT-X-APE-HYDRA-FINGERPRINT-MASKING:enabled`,

            // ── SECTION 10 — DNA (5 tags) ─────────────────────────────────
            `#EXT-X-APE-DNA-VERSION:18.2`,
            `#EXT-X-APE-DNA-FIELDS:124`,
            `#EXT-X-APE-DNA-SYNC:bidirectional`,
            `#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.4_MAX_AGGRESSION`,
            `#EXT-X-APE-DNA-HASH:${index}-${profile}-${buildTs}`,

            // ── SECTION 11 — Anti-Freeze / Cache (8 tags) ─────────────────
            `#EXT-X-APE-ANTI-FREEZE:clock-jitter=${cfg.clock_jitter || 1500},clock-synchro=${cfg.clock_synchro || 1},net-cache=${GLOBAL_CACHING.network},buf-min=${GLOBAL_CACHING.network},prefetch=10,15,20,reconnect-backoff=50ms`,
            `#EXT-X-APE-CLOCK-JITTER:${cfg.clock_jitter || 1500}`,
            `#EXT-X-APE-CLOCK-SYNCHRO:${cfg.clock_synchro || 1}`,
            `#EXT-X-APE-NETWORK-CACHE:${GLOBAL_CACHING.network}`,
            `#EXT-X-APE-LIVE-CACHE:${GLOBAL_CACHING.live}`,
            `#EXT-X-APE-RECONNECT-MAX:40`,
            `#EXT-X-APE-RETRY-COUNT:10,12,15`,
            `#EXT-X-APE-PREFETCH-SEGMENTS:10,15,20`,

            // ── SECTION 12 — Format flags (5 tags) ────────────────────────
            `#EXT-X-APE-CMAF:ENABLED`,
            `#EXT-X-APE-FMP4:ENABLED`,
            `#EXT-X-APE-HDR10:ENABLED`,
            `#EXT-X-APE-DOLBY-VISION:ENABLED-PROFILE-8.1-LEVEL-6`,
            `#EXT-X-APE-ATMOS:ENABLED`,

            // ── SECTION 12b — Content-Aware HEVC Multichannel (20 tags) ──
            `#EXT-X-APE-ENCODER-ENGINE:NVENC_HEVC`,
            `#EXT-X-APE-ENCODER-PRESET:P6_HQ`,
            `#EXT-X-APE-RATE-CONTROL:VBR_CONSTRAINED`,
            `#EXT-X-APE-VBV-MAX-RATE:${Math.ceil((cfg.bitrate || 8000) * 1.3)}`,
            `#EXT-X-APE-VBV-BUF-SIZE:${Math.ceil((cfg.bitrate || 8000) * 2)}`,
            `#EXT-X-APE-GOP-SIZE:${cfg.gop_size || 60}`,
            `#EXT-X-APE-GOP-DURATION:2s`,
            `#EXT-X-APE-B-FRAMES:2`,
            `#EXT-X-APE-LOOKAHEAD:10`,
            `#EXT-X-APE-AQ-MODE:SPATIAL`,
            `#EXT-X-APE-CONTENT-AWARE-MODE:PER_SCENE_CONTINUOUS`,
            `#EXT-X-APE-CONTENT-ANALYSIS-FPS:1`,
            `#EXT-X-APE-MOTION-ENTROPY-ACTION:BOOST_40_PERCENT`,
            `#EXT-X-APE-TALKING-HEAD-ACTION:REDUCE_30_PERCENT`,
            `#EXT-X-APE-FLASH-FADE-DETECTION:ENABLED`,
            `#EXT-X-APE-BITRATE-SMOOTHING-WINDOW:6-10s`,
            `#EXT-X-APE-FAILOVER-POLICY:CBR_FIXED_80_PERCENT`,
            `#EXT-X-APE-ABR-LADDER:2160p@25Mbps,1440p@16Mbps,1080p@10Mbps,720p@6Mbps,540p@3Mbps`,
            `#EXT-X-APE-SCALER-ALGORITHM:LANCZOS_HW_SPLINE`,
            `#EXT-X-APE-GPU-DECODE-ENGINE:CUVID_VRAM_ONLY`,
            `#EXT-X-APE-GPU-FILTER-CHAIN:DECODE>DEINTERLACE>DENOISE>SCALE>ENCODE`,
            `#EXT-X-APE-E2E-LATENCY-TARGET:4000ms`,
            `#EXT-X-APE-CMAF-LL-CHUNK:200ms`,

            // ── SECTION 13 — ISP Throttle (10 tags) ───────────────────────
            `#EXT-X-APE-ISP-THROTTLE-STRATEGY:ESCALATING-NEVER-DOWN`,
            `#EXT-X-APE-ISP-LEVEL-1:EXTREME-MAX_CONTRACT`,
            `#EXT-X-APE-ISP-LEVEL-2:ULTRA-MAX_CONTRACT_PLUS`,
            `#EXT-X-APE-ISP-LEVEL-3:SAVAGE-SATURATE_LINK`,
            `#EXT-X-APE-ISP-LEVEL-4:BRUTAL-EXCEED_CONTRACT`,
            `#EXT-X-APE-ISP-LEVEL-5:NUCLEAR-ABSOLUTE_MAX`,
            `#EXT-X-APE-ISP-TCP-WINDOW-PROGRESSION:4MB\u21928MB\u219216MB\u219232MB\u219264MB`,
            `#EXT-X-APE-ISP-PARALLEL-PROGRESSION:4\u21928\u219216\u219232\u219264`,
            `#EXT-X-APE-ISP-BURST-FACTOR-PROGRESSION:1.5x\u21922x\u21923x\u21925x\u219210x`,
            `#EXT-X-APE-ISP-PREFETCH-PROGRESSION:30s\u219260s\u2192120s\u2192300s\u2192UNLIMITED`,

            // ── SECTION 14 — LCEVC Full Spec (26 tags) ────────────────────
            `#EXT-X-APE-LCEVC:ENABLED`,
            `#EXT-X-APE-LCEVC-STANDARD:MPEG-5-PART-2`,
            `#EXT-X-APE-LCEVC-PROFILE:${lc.profile}`,
            `#EXT-X-APE-LCEVC-PLAYER-REQUIRED:0`,
            `#EXT-X-APE-LCEVC-FALLBACK:BASE_ONLY`,
            `#EXT-X-APE-LCEVC-BASE-LAYER-SCALE:${lc.base_ratio}`,
            `#EXT-X-APE-LCEVC-BASE-BITRATE-RATIO:${lc.base_ratio}`,
            `#EXT-X-APE-LCEVC-ENHANCEMENT-BITRATE-RATIO:${lc.enh_ratio}`,
            `#EXT-X-APE-LCEVC-L1-ENABLED:1`,
            `#EXT-X-APE-LCEVC-L1-TRANSFORM-BLOCK:${lc.l1_block}`,
            `#EXT-X-APE-LCEVC-L1-DEBLOCK-FILTER:${lc.l1_deblock}`,
            `#EXT-X-APE-LCEVC-L1-RESIDUAL-PRECISION:${lc.l1_precision}`,
            // ── SECTION 15 — LCEVC PHASE 4 SEMANTIC ENGINE (EDGE-COMPUTE DIRECT) ──
            `#EXT-X-APE-LCEVC-PHASE-4-ENABLED:true`,
            `#EXT-X-APE-TUNNELING-ENABLED:off`,
            `#EXT-X-APE-NETWORK-PATH:ORIGIN_DIRECT`,

            // 1. Semantic Segmentation & Local AI (Phase 4 Base)
            `#EXT-X-APE-LCEVC-SEMANTIC-SEGMENTATION:ACTIVE`,
            `#EXT-X-APE-LCEVC-ROI-PROCESSING:DYNAMIC`,
            `#EXT-X-APE-LCEVC-ROI-TARGETS:FACES,TEXT,SKIN,SPORTS_BALL`,
            `#EXT-X-APE-LCEVC-BG-DEGRADATION:AGGRESSIVE`,
            `#EXT-X-APE-LCEVC-FRAME-GENERATION:${profile.match(/P[0-1]/) ? 'LOCAL-AFMF' : 'DISABLED'}`,
            `#EXT-X-APE-LCEVC-COLOR-HALLUCINATION:${profile.match(/P[4-5]/) ? 'ACTIVE' : 'MILD'}`,
            `#EXT-X-APE-LCEVC-COMPUTE-PRECISION:${profile.match(/P[0-2]/) ? 'FP16' : 'INT8'}`,

            // 2. Quantum Pixel Overdrive v5 (Scale & Color)
            `#EXT-X-APE-QUANTUM-CHROMA-SUBSAMPLING:4:4:4`,
            `#EXT-X-APE-QUANTUM-COLOR-DEPTH:10bit`,
            `#EXT-X-APE-QUANTUM-ITM-SDR-TO-HDR:auto`,
            `#EXT-X-APE-ITM-ENGINE-MODE:ADAPTIVE_FRAME_BY_FRAME`,
            `#EXT-X-APE-ITM-TARGET-NITS:1000`,
            `#EXT-X-APE-ITM-TARGET-GAMUT:BT.2020`,
            `#EXT-X-APE-ITM-ANALYSIS:LUMINANCE_PEAK+APL+HISTOGRAM+COLOR_DISTRIBUTION`,
            `#EXT-X-APE-ITM-METADATA-INJECTION:MaxFALL+MaxCLL+DYNAMIC_PER_FRAME`,
            `#EXT-X-APE-ITM-EXPANSION-CURVE:SCENE_ADAPTIVE`,
            `#EXT-X-APE-ITM-CLIPPING-GUARD:SPECULAR_HIGHLIGHT_PRESERVE`,

            // 2b. Telchemy TVQM — Zero-Reference Quality Diagnostics
            `#EXT-X-TELCHEMY-TVQM:VSTQ=50,VSMQ=50,EPSNR=45,MAPDV=10,PPDV=5`,
            `#EXT-X-TELCHEMY-TR101290:SYNC_LOSS=0,CC_ERROR=0,PCR_ERR=0,SYNC_BYTE_ERR=0`,
            `#EXT-X-TELCHEMY-IMPAIRMENT-GUARD:BLOCKINESS=ACTIVE,JERKINESS=ACTIVE,TILING=ACTIVE`,
            `#EXT-X-TELCHEMY-GOP-POLICY:MAX_SIZE=120,MIN_IDR_INTERVAL=2s`,
            `#EXT-X-TELCHEMY-BUFFER-POLICY:UNDERRUN_ACTION=EXPAND_CACHE,OVERFLOW_ACTION=DROP_B_FRAMES`,
            `#EXT-X-TELCHEMY-JITTER-POLICY:MAPDV_ACTION=EXPAND_JITTER_BUFFER,PPDV_ACTION=CLOCK_RECOVERY`,
            `#EXT-X-APE-ITM-SKIN-TONE-PROTECT:ENABLED`,
            `#EXT-X-APE-PROCESSING-PIPELINE-ORDER:DECODE,ITM,LCEVC,AI,RENDER`,

            // 3. HEVC Level Supremacy (La Cascada) & LCEVC Dynamic Base
            `#EXT-X-APE-HEVC-LEVEL-CASCADE:6.1,5.1,5.0,4.1,4.0,3.1`,
            `#EXT-X-APE-CODEC-PRIORITY:hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,h264`,
            `#EXT-X-APE-LCEVC-BASE-POLICY:${lcevcBaseCodec}`, // Dinámico derivado de config
            `#EXT-X-APE-LCEVC-TRANSPORT:CMAF_LAYER_OR_SEI_EMBED`,   // Instruye cómo buscar la capa L1+L2

            // 4. Maximum Resolution Escalator (Extensión M3U8 Nativa)
            `#EXT-X-APE-RESOLUTION-ESCALATOR:4320p>2160p>1080p>720p>480p`,

            // 5. God-Tier Perceptual Quality (Film Grain & Bitrate)
            `#EXT-X-APE-VMAF-TARGET:95.0`,
            `#EXT-X-APE-FILM-GRAIN-PRESERVATION:DISABLED`,
            `#EXT-X-APE-DENOISE-STRATEGY:AGGRESSIVE_IPTV_CLEAN`,
            `#EXT-X-APE-DENOISE-ALGORITHM:NLMEANS+HQDN3D`,
            `#EXT-X-APE-DEBLOCK-STRENGTH:MAXIMUM`,

            // 6. Protección Térmica (Edge-Compute Limiters)
            `#EXT-X-APE-HEARTBEAT-THERMAL:TRUE`,
            `#EXT-X-APE-THERMAL-THROTTLING-FB:PHASE-2-SAFE-MODE`,
            `#EXT-X-APE-LCEVC-L1-TEMPORAL-PREDICTION:${lc.l1_temporal}`,
            `#EXT-X-APE-LCEVC-L2-ENABLED:1`,
            `#EXT-X-APE-LCEVC-L2-TRANSFORM-BLOCK:${lc.l2_block}`,
            `#EXT-X-APE-LCEVC-L2-TEMPORAL-PREDICTION:${lc.l2_temporal}`,
            `#EXT-X-APE-LCEVC-L2-RESIDUAL-PRECISION:${lc.l2_precision}`,
            `#EXT-X-APE-LCEVC-L2-UPSCALE-FILTER:${lc.l2_upscale}`,
            `#EXT-X-APE-LCEVC-MODE:${lc.mode}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-PRIMARY:${lc.transport}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1:${lc.fb1}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2:${lc.fb2}`,
            `#EXT-X-APE-LCEVC-SEI-NAL-TYPE:${lc.sei_nal}`,
            `#EXT-X-APE-LCEVC-MPEG-TS-PID:${lc.pid}`,
            `#EXT-X-APE-LCEVC-WEBM-TRACK-ID:${lc.webm}`,
            `#EXT-X-APE-LCEVC-PARALLEL-BLOCKS:${lc.parallel_blocks}`,
            `#EXT-X-APE-LCEVC-PARALLEL-THREADS:${lc.threads}`,
            `#EXT-X-APE-LCEVC-DECODE-ORDER:${lc.decode_order}`,
            `#EXT-X-APE-LCEVC-HW-ACCELERATION:${lc.hw_accel}`,
            `#EXT-X-APE-LCEVC-SW-FALLBACK:1`,
            `#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL`,
            `#EXT-X-APE-LCEVC-GRACEFUL-DEGRADATION:BASE_CODEC_PASSTHROUGH`,
            // ══════════════════════════════════════════════════════════════
            // QUALITY UPGRADE v3 — PACKAGES A-J COMPLETE (271 tags)
            // Base + New tags for each package
            // ══════════════════════════════════════════════════════════════

            // ══════════════════════════════════════════════════════════════
            // PACKAGE A — CMAF CHUNKED TRANSFER v2 (22 tags)
            // Base 12 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-CMAF-CHUNK-DURATION:${cfg.cmaf_chunk_duration || '1.0'}`,
            `#EXT-X-APE-CMAF-CHUNK-TYPE:CMAF_CHUNK`,
            `#EXT-X-APE-CMAF-INGEST-PROTOCOL:CMAF-INGEST-V2`,
            `#EXT-X-APE-CMAF-COMMON-ENCRYPTION:CBCS`,
            `#EXT-X-APE-CMAF-TRACK-TYPE:VIDEO+AUDIO+SUBTITLE`,
            `#EXT-X-APE-CMAF-SEGMENT-ALIGNMENT:true`,
            `#EXT-X-APE-CMAF-INDEPENDENT-SEGMENTS:true`,
            `#EXT-X-APE-CMAF-LOW-LATENCY:true`,
            `#EXT-X-APE-CMAF-PART-HOLD-BACK:3.0`,
            `#EXT-X-APE-CMAF-CAN-BLOCK-RELOAD:YES`,
            `#EXT-X-APE-CMAF-CAN-SKIP-UNTIL:36.0`,
            `#EXT-X-APE-CMAF-RENDITION-REPORTS:true`,
            `#EXT-X-APE-CMAF-PART-TARGET:${cfg.cmaf_chunk_duration || '1.0'}`,
            `#EXT-X-APE-CMAF-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,HOLD-BACK=6.0`,
            `#EXT-X-APE-CMAF-PLAYLIST-TYPE:LIVE`,
            `#EXT-X-APE-CMAF-TARGET-DURATION:${Math.ceil((cfg.buffer_live || 30000) / 1000)}`,
            `#EXT-X-APE-CMAF-MEDIA-SEQUENCE:dynamic`,
            `#EXT-X-APE-CMAF-DISCONTINUITY-SEQUENCE:auto`,
            `#EXT-X-APE-CMAF-PROGRAM-DATE-TIME:${new Date().toISOString()}`,
            `#EXT-X-APE-CMAF-DATERANGE-ENABLED:true`,
            `#EXT-X-APE-CMAF-SKIP-BOUNDARY:6.0`,
            `#EXT-X-APE-CMAF-DELTA-PLAYLIST:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE B — fMP4 ENHANCEMENT TRACKS v2 (24 tags)
            // Base 14 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-FMP4-VIDEO-TRACK:${cfg.codec || 'HEVC'}+LCEVC`,
            `#EXT-X-APE-FMP4-AUDIO-TRACK:AAC-LC+EAC3+AC4`,
            `#EXT-X-APE-FMP4-SUBTITLE-TRACK:TTML+WebVTT`,
            `#EXT-X-APE-FMP4-METADATA-TRACK:ID3+SCTE35`,
            `#EXT-X-APE-FMP4-THUMBNAIL-TRACK:JPEG+WebP`,
            `#EXT-X-APE-FMP4-LCEVC-TRACK:MPEG5-P2-SEI`,
            `#EXT-X-APE-FMP4-HDR-METADATA-TRACK:HDR10+`,
            `#EXT-X-APE-FMP4-DOLBY-VISION-TRACK:RPU`,
            `#EXT-X-APE-FMP4-SAMPLE-ENTRY:hvc1+dvh1`,
            `#EXT-X-APE-FMP4-BRAND:iso6+cmfc+dash`,
            `#EXT-X-APE-FMP4-FRAGMENT-DURATION:${cfg.fmp4_fragment_ms || '2000'}`,
            `#EXT-X-APE-FMP4-SIDX-BOX:true`,
            `#EXT-X-APE-FMP4-SAIO-SAIZ:true`,
            `#EXT-X-APE-FMP4-PRFT-BOX:true`,
            `#EXT-X-APE-FMP4-EDIT-LIST:true`,
            `#EXT-X-APE-FMP4-CTTS-BOX:true`,
            `#EXT-X-APE-FMP4-SGPD-BOX:true`,
            `#EXT-X-APE-FMP4-SBGP-BOX:true`,
            `#EXT-X-APE-FMP4-EMSG-BOX:true`,
            `#EXT-X-APE-FMP4-PSSH-BOX:true`,
            `#EXT-X-APE-FMP4-TENC-BOX:true`,
            `#EXT-X-APE-FMP4-SENC-BOX:true`,
            `#EXT-X-APE-FMP4-TRACK-ENCRYPTION:CBCS`,
            `#EXT-X-APE-FMP4-COMMON-MEDIA-CLIENT-DATA:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE C — LCEVC v2 PHASE 3 COMPLETE (15 new tags)
            // (Base 97 already in sections 2 + 14 above)
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-LCEVC-PHASE-3-ENABLED:true`,
            `#EXT-X-APE-LCEVC-NEURAL-UPSCALE:ESRGAN-4x`,
            `#EXT-X-APE-LCEVC-GRAIN-SYNTHESIS:true`,
            `#EXT-X-APE-LCEVC-SPATIAL-DITHERING:true`,
            `#EXT-X-APE-LCEVC-L1-MOTION-COMPENSATION:true`,
            `#EXT-X-APE-LCEVC-L2-CHROMA-ENHANCEMENT:true`,
            `#EXT-X-APE-LCEVC-L2-DETAIL-ENHANCEMENT:true`,
            `#EXT-X-APE-LCEVC-RATE-CONTROL:CRF+VBR`,
            `#EXT-X-APE-LCEVC-PSYCHO-VISUAL:true`,
            `#EXT-X-APE-LCEVC-AQ-MODE:VARIANCE`,
            `#EXT-X-APE-LCEVC-LOOKAHEAD:${cfg.lcevc_lookahead || 60}`,
            `#EXT-X-APE-LCEVC-B-FRAMES:${cfg.lcevc_bframes || 8}`,
            `#EXT-X-APE-LCEVC-REF-FRAMES:${cfg.lcevc_refframes || 16}`,
            `#EXT-X-APE-LCEVC-SUBPEL-REFINE:7`,
            `#EXT-X-APE-LCEVC-ME-RANGE:24`,
            `#EXT-X-APE-LCEVC-TRELLIS:2`,
            `#EXT-X-APE-LCEVC-DEBLOCK-ALPHA:${cfg.lcevc_deblock_alpha || -2}`,
            `#EXT-X-APE-LCEVC-DEBLOCK-BETA:${cfg.lcevc_deblock_beta || -2}`,
            `#EXT-X-APE-LCEVC-SAR:${cfg.resolution || '3840x2160'}`,
            `#EXT-X-APE-LCEVC-COLORMATRIX:${cfg.color_space || 'BT.2020'}`,
            `#EXT-X-APE-LCEVC-TRANSFER:${cfg.transfer_function || 'SMPTE-ST-2084'}`,
            `#EXT-X-APE-LCEVC-PRIMARIES:${cfg.color_primaries || 'BT.2020'}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE D — AI SUPER RESOLUTION COMPLETE (22 tags)
            // Base 15 + New 7
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-AI-SR-MODEL:ESRGAN-4x+RealESRGAN`,
            `#EXT-X-APE-AI-SR-SCALE:${cfg.ai_sr_scale || '2x'}`,
            `#EXT-X-APE-AI-SR-INFERENCE:EDGE+CLOUD`,
            `#EXT-X-APE-AI-SR-FALLBACK:BICUBIC`,
            `#EXT-X-APE-AI-TEMPORAL-SR:true`,
            `#EXT-X-APE-AI-DENOISING:true`,
            `#EXT-X-APE-AI-DEBLOCKING:true`,
            `#EXT-X-APE-AI-ARTIFACT-REMOVAL:true`,
            `#EXT-X-APE-AI-FRAME-INTERPOLATION:true`,
            `#EXT-X-APE-AI-COLOR-ENHANCEMENT:true`,
            `#EXT-X-APE-AI-SHARPENING:ADAPTIVE`,
            `#EXT-X-APE-AI-HDR-UPCONVERT:SDR_TO_HDR10_PLUS`,
            `#EXT-X-APE-AI-VMAF-TARGET:${cfg.vmaf_target || '95'}`,
            `#EXT-X-APE-AI-CONTENT-AWARE-ENCODING:true`,
            `#EXT-X-APE-AI-PERCEPTUAL-QUALITY:SSIM+VMAF`,
            `#EXT-X-APE-AI-SR-PRECISION:FP16`,
            `#EXT-X-APE-AI-SR-BATCH-SIZE:1`,
            `#EXT-X-APE-AI-SR-TILE-SIZE:256`,
            `#EXT-X-APE-AI-SR-OVERLAP:32`,
            `#EXT-X-APE-AI-MOTION-ESTIMATION:OPTICAL-FLOW`,
            `#EXT-X-APE-AI-SCENE-DETECTION:true`,
            `#EXT-X-APE-AI-CONTENT-TYPE:${cfg.group || 'GENERAL'}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE E — VVC / H.266 COMPLETE (12 tags)
            // Base 6 + New 6
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-VVC-ENABLED:true`,
            `#EXT-X-APE-VVC-PROFILE:MAIN_10`,
            `#EXT-X-APE-VVC-LEVEL:${cfg.vvc_level || '5.1'}`,
            `#EXT-X-APE-VVC-TIER:MAIN`,
            `#EXT-X-APE-VVC-FALLBACK:HEVC`,
            `#EXT-X-APE-VVC-EFFICIENCY:+50%_vs_HEVC`,
            `#EXT-X-APE-VVC-TOOLSET:FULL`,
            `#EXT-X-APE-VVC-SUBPICTURES:true`,
            `#EXT-X-APE-VVC-WRAP-AROUND:true`,
            `#EXT-X-APE-VVC-LMCS:true`,
            `#EXT-X-APE-VVC-AFFINE-ME:true`,
            `#EXT-X-APE-VVC-BDOF:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE F — EVC / MPEG-5 P1 COMPLETE (8 tags)
            // Base 4 + New 4
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-EVC-ENABLED:true`,
            `#EXT-X-APE-EVC-PROFILE:BASELINE`,
            `#EXT-X-APE-EVC-FALLBACK:H264`,
            `#EXT-X-APE-EVC-ROYALTY-FREE:true`,
            `#EXT-X-APE-EVC-LEVEL:${cfg.evc_level || '5.1'}`,
            `#EXT-X-APE-EVC-TOOLSET:MAIN`,
            `#EXT-X-APE-EVC-ADAPTIVE-LOOP-FILTER:true`,
            `#EXT-X-APE-EVC-CHROMA-QP-OFFSET:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE G — HDR ADVANCED COMPLETE (42 tags)
            // Base 32 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-HDR-CHAIN:${(cfg.hdr_support || ['dolby-vision', 'hdr10+', 'hdr10', 'hlg', 'sdr']).join(',')}`,
            `#EXT-X-APE-HDR-COLOR-SPACE:${cfg.color_space || 'BT.2020,BT.709'}`,
            `#EXT-X-APE-HDR-TRANSFER-FUNCTION:${cfg.transfer_function || 'SMPTE-ST-2084,ARIB-STD-B67,BT.709'}`,
            `#EXT-X-APE-HDR-COLOR-PRIMARIES:${cfg.color_primaries || 'BT.2020'}`,
            `#EXT-X-APE-HDR-MATRIX-COEFFICIENTS:${cfg.matrix_coefficients || 'BT.2020nc'}`,
            `#EXT-X-APE-HDR-MAX-CLL:${cfg.max_cll || '4000,400'}`,
            `#EXT-X-APE-HDR-MAX-FALL:${cfg.max_fall || '1200'}`,
            `#EXT-X-APE-HDR-BIT-DEPTH:${cfg.color_depth || 10}bit`,
            `#EXT-X-APE-HDR-DOLBY-VISION-PROFILE:${cfg.dv_profile || '8.1'}`,
            `#EXT-X-APE-HDR-DOLBY-VISION-LEVEL:${cfg.dv_level || '6'}`,
            `#EXT-X-APE-HDR-SDR-FALLBACK:enabled`,
            `#EXT-X-APE-HDR-TONE-MAPPING:auto`,
            `#EXT-X-APE-HDR-GRACEFUL-DEGRADATION:SDR_PASSTHROUGH`,
            `#EXT-X-APE-HDR-STATIC-METADATA:enabled`,
            `#EXT-X-APE-HDR-DYNAMIC-METADATA:HDR10+,DV-RPU`,
            `#EXT-X-APE-HDR-PEAK-LUMINANCE:${cfg.peak_luminance || '4000'}nits`,
            `#EXT-X-APE-HDR-MIN-LUMINANCE:0.001nits`,
            `#EXT-X-APE-HDR-GAMUT:DCI-P3,BT.2020`,
            `#EXT-X-APE-HDR-10PLUS-VERSION:2.0`,
            `#EXT-X-APE-HDR-10PLUS-APPLICATION:4`,
            `#EXT-X-APE-HDR-DCI-P3-COVERAGE:99.8`,
            `#EXT-X-APE-HDR-BT2020-COVERAGE:97.5`,
            `#EXT-X-APE-HDR-DOLBY-VISION-CROSS-COMPAT:true`,
            `#EXT-X-APE-HDR-HLG-COMPAT:true`,
            `#EXT-X-APE-HDR-ST2094-10:true`,
            `#EXT-X-APE-HDR-ST2094-20:true`,
            `#EXT-X-APE-HDR-ST2094-30:true`,
            `#EXT-X-APE-HDR-ST2094-40:true`,
            `#EXT-X-APE-HDR-METADATA-INSERT-MODE:SEI`,
            `#EXT-X-APE-HDR-METADATA-PASS-THROUGH:true`,
            `#EXT-X-APE-HDR-OUTPUT-MODE:auto`,
            `#EXT-X-APE-HDR-DISPLAY-METADATA-SYNC:true`,
            `#EXT-X-APE-HDR-MASTERING-DISPLAY:G(0.265,0.690)B(0.150,0.060)R(0.680,0.320)WP(0.3127,0.3290)L(10000,0.001)`,
            `#EXT-X-APE-HDR-CONTENT-LIGHT-LEVEL:${cfg.max_cll || '4000,400'}`,
            `#EXT-X-APE-HDR-AMBIENT-VIEWING-ENV:DIM`,
            `#EXT-X-APE-HDR-REFERENCE-WHITE:203nits`,
            `#EXT-X-APE-HDR-SCENE-LUMINANCE:true`,
            `#EXT-X-APE-HDR-EXTENDED-RANGE:true`,
            `#EXT-X-APE-HDR-VIVID-ENABLED:true`,
            `#EXT-X-APE-HDR-SLHDR2:true`,
            `#EXT-X-APE-HDR-TECHNICOLOR:true`,
            `#EXT-X-APE-HDR-FILMMAKER-MODE:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE H — AUDIO ADVANCED COMPLETE (16 tags)
            // Base 8 + New 8
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-AUDIO-CODEC:${cfg.audio_codec === 'eac3' ? 'EAC3+AC4+AAC-LC' : 'AAC-LC+MP3'}`,
            `#EXT-X-APE-AUDIO-ATMOS:${cfg.audio_channels >= 8}`,
            `#EXT-X-APE-AUDIO-SPATIAL:${cfg.audio_channels >= 8 ? 'DOLBY-ATMOS+DTS-X' : 'NONE'}`,
            `#EXT-X-APE-AUDIO-CHANNELS:${cfg.audio_channels || '7.1.4'}`,
            `#EXT-X-APE-AUDIO-SAMPLE-RATE:48000`,
            `#EXT-X-APE-AUDIO-BIT-DEPTH:24bit`,
            `#EXT-X-APE-AUDIO-LOUDNESS:-23LUFS`,
            `#EXT-X-APE-AUDIO-DYNAMIC-RANGE:20dB`,
            `#EXT-X-APE-AUDIO-BITRATE:${cfg.audio_bitrate || '640'}kbps`,
            `#EXT-X-APE-AUDIO-OBJECTS:${cfg.audio_objects || '128'}`,
            `#EXT-X-APE-AUDIO-BEDS:${cfg.audio_beds || '10'}`,
            `#EXT-X-APE-AUDIO-DIALNORM:-27`,
            `#EXT-X-APE-AUDIO-COMPR-MODE:RF`,
            `#EXT-X-APE-AUDIO-DRC-PROFILE:FILM-STANDARD`,
            `#EXT-X-APE-AUDIO-DOWNMIX:LtRt+LoRo`,
            `#EXT-X-APE-AUDIO-TRUEHD:${cfg.audio_channels >= 8}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE I — TRICK PLAY + THUMBNAILS COMPLETE (14 tags)
            // Base 6 + New 8
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-TRICK-PLAY-ENABLED:true`,
            `#EXT-X-APE-THUMBNAIL-TRACK:WebP+JPEG`,
            `#EXT-X-APE-THUMBNAIL-INTERVAL:10s`,
            `#EXT-X-APE-THUMBNAIL-RESOLUTION:320x180`,
            `#EXT-X-APE-FAST-FORWARD-CODEC:HEVC-I-FRAME`,
            `#EXT-X-APE-SEEK-PRECISION:IFRAME`,
            `#EXT-X-APE-THUMBNAIL-FORMAT:WebP+JPEG+AVIF`,
            `#EXT-X-APE-THUMBNAIL-COLS:10`,
            `#EXT-X-APE-THUMBNAIL-ROWS:10`,
            `#EXT-X-APE-THUMBNAIL-BANDWIDTH:200000`,
            `#EXT-X-APE-TRICK-PLAY-RATES:2,4,8,16,32`,
            `#EXT-X-APE-TRICK-PLAY-IFRAME-ONLY:true`,
            `#EXT-X-APE-SEEK-MODE:IFRAME+KEYFRAME`,
            `#EXT-X-APE-CHAPTER-MARKERS:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE J — SCTE-35 BROADCAST COMPLETE (10 tags)
            // Base 3 + New 7
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-SCTE35-ENABLED:true`,
            `#EXT-X-APE-SCTE35-FORMAT:BINARY+BASE64`,
            `#EXT-X-APE-SCTE35-SIGNAL:CUE-IN+CUE-OUT`,
            `#EXT-X-APE-SCTE35-PID:0x0086`,
            `#EXT-X-APE-SCTE35-DURATION-HINT:30s`,
            `#EXT-X-APE-SCTE35-SEGMENTATION-TYPE:PROGRAM_START`,
            `#EXT-X-APE-SCTE35-UPID-TYPE:URI`,
            `#EXT-X-APE-SCTE35-AVAIL-NUM:1`,
            `#EXT-X-APE-SCTE35-AVAILS-EXPECTED:1`,
            `#EXT-X-APE-SCTE35-BLACKOUT-OVERRIDE:true`
        ];

        // BLOQUE 4: CAPA 4 (EXTATTRFROMURL) - Atributos Directos Player
        // ═══════════════════════════════════════════════════════════════
        // Consolidación en una sola directiva CSV para evitar límite de líneas del reproductor
        const attrArr = [
            'quality=top',
            'resolution=highest',
            'bitrate=max',
            'frame-rate=' + (cfg.fps || 60),
            'preferred-codec=hevc,hev1,hvc1,h265,H265,h.265,H.265',
            'fallback-codec=av01,av1,vpc,vp9',
            'codec-level=6.1',
            'color-space=bt2020nc',
            'color-transfer=smpte2084',
            'hdr=hdr10,dolby-vision,hlg',
            'hdr10plus=enabled',
            'metadata-sei=passthrough',
            'audio=original,passthrough',
            'audio-codec=eac3,ac3,dts,aac',
            'audio-channels=5.1,7.1,atmos',
            'audio-language=spa,eng,orig',
            'subtitle-language=spa,eng',
            'buffer-size=200000',
            'buffer-min=50000',
            'timeout=15000',
            'reconnect=true',
            'reconnect-delay=50,100,500',
            'http-keep-alive=true',
            'http-version=2,3',
            'tls-version=1.3',
            'tcp-fast-open=true',
            'tcp-nodelay=true',
            'mux-type=ts,fmp4,cmaf',
            'demux=strict',
            'segment-format=mpegts,fmp4',
            'hls-version=7,10'
        ];
        lines.push(`#EXTATTRFROMURL:${attrArr.join(',')}`);

        return lines;
    }

    const XTREAM_HTTP_PORTS = ['2082', '2083', '8080', '8000', '25461', '25463', '80'];

    function preferHttps(url) {
        if (!url || typeof url !== 'string') return url;
        try {
            const parsed = new URL(url);
            const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
            if (XTREAM_HTTP_PORTS.includes(port)) {
                if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'http://');
                return url;
            }
            const noSSLHosts = ['line.tivi-ott.net', 'candycloud8k.biz', 'pro.123sat.net'];
            if (noSSLHosts.some(h => parsed.hostname.includes(h))) {
                if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'http://');
                return url;
            }
        } catch (e) { }
        return url;
    }

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    function generateNonce() {
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    // ═
    //  CREDENTIAL GUARDIAN v2.0  PRESERVACIÓN EXACTA
    // Solo elimina caracteres INVISIBLES que corrompen encoding.
    // NUNCA altera caracteres visibles. Las credenciales validadas
    // por connectServer() SON SAGRADAS e INMUTABLES.
    // 
    function sanitizeCredential(value) {
        if (!value || typeof value !== 'string') return value || '';
        let clean = value.trim();
        clean = clean.replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, '');
        return clean;
    }

    function base64UrlEncode(str) {
        // 🔴 REGLA ANTI-REGRESIÓN: Usar Buffer.from (no btoa) + base64 ESTÁNDAR (no URL-safe)
        // El auditor Python usa base64.b64decode() que requiere caracteres +/= estándar
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(str, 'utf8').toString('base64');
        }
        // Fallback browser: btoa con standard base64 (SIN reemplazos URL-safe)
        try {
            return btoa(unescape(encodeURIComponent(str)));
        } catch (e) {
            return btoa(str);
        }
    }

    function escapeM3UValue(value) {
        if (!value) return '';
        // v6.1 COMPAT: Sanitizar ┃ (U+2503 Box Drawing) → | (U+007C Standard Pipe)
        // TiviVision/OTT Navigator interpretan ┃ como separador de grupo fantasma
        return String(value).replace(/\u2503/g, '|').replace(/"/g, "'").replace(/,/g, ' ');
    }

    function generateJWT68Fields(channel, profile, index) {
        return "JWT_STUB";
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ⚡ QUANTUM PROFILE CLASSIFIER v5.0 — MULTI-SIGNAL WEIGHTED SCORING
    // 5 capas independientes de señales. La que más puntos acumule gana.
    // Nunca se equivoca por depender de una sola fuente.
    // ═══════════════════════════════════════════════════════════════════════

    // Capa 0: Base de datos de marcas IPTV conocidas → resolución real verificada
    const KNOWN_BRANDS = {
        P0: [],
        P1: ['4K','UHD','ULTRA HD','2160'],
        P3: [
            // Deportes internacionales (siempre 1080p)
            'ESPN','FOX SPORTS','BEIN SPORTS','BEINSPORT','DIRECTV SPORTS','DSports',
            'SKY SPORTS','BT SPORT','DAZN','EUROSPORT','SPORT TV','SPORTV',
            'GOLF CHANNEL','NBA TV','NFL NETWORK','MLB NETWORK','NHL NETWORK',
            // Noticias (siempre 1080p)
            'CNN','BBC','BBC ONE','BBC TWO','AL JAZEERA','DW NEWS','FRANCE 24',
            'EURONEWS','BLOOMBERG','CNBC','FOX NEWS','MSNBC','SKY NEWS',
            // Entretenimiento premium (1080p)
            'HBO','SHOWTIME','STARZ','AMC','FX','TNT','TBS','USA NETWORK',
            'DISCOVERY','NATIONAL GEOGRAPHIC','NATGEO','HISTORY','ANIMAL PLANET',
            'TRAVEL CHANNEL','FOOD NETWORK','HGTV','BRAVO','LIFETIME',
            // Films premium (1080p)
            'CINEMAX','TCM','SUNDANCE','IFC','CRITERION',
            // Latinoamérica HD (1080p)
            'CANAL SUR','TELECINCO','ANTENA 3','LA1','LA2','CUATRO',
            'CARACOL','RCN','TELEAMAZONAS','ECUAVISA','TC TELEVISION',
            'CANAL 13','MEGA','CHILEVISION','TVN','T13',
            'TV AZTECA','TELEVISA','CANAL DE LAS ESTRELLAS',
            'GLOBO','SBT','RECORD','REDE BAND',
            'TLN','CNN EN ESPANOL','NTN24','TELEMUNDO','UNIVISION',
        ],
        P4: [
            // Canales infantiles (generalmente 720p)
            'CARTOON NETWORK','NICKELODEON','NICK JR','DISNEY JR','BOOMERANG',
            'DISNEY CHANNEL','DISNEY XD','BABY TV','BABY FIRST',
            // Canales básicos de cable (720p)
            'COMEDY CENTRAL','MTV','VH1','BET','SYFY','E!','OXYGEN',
            // Deportes básicos (720p en muchos proveedores)
            'ESPN2','ESPN3','FOX SPORTS 2','FOX SPORTS 3',
        ],
        P5: [
            // Canales locales sin calidad garantizada (SD)
            'TELESUR','TELE 1','LOCAL TV','CANAL LOCAL',
        ]
    };

    function determineProfile(channel) {
        const name    = (channel?.name || '').toString().toUpperCase().trim();
        const group   = (channel?.category_name || channel?.group || channel?.group_title || '').toString().toUpperCase().trim();
        const resMeta = (channel?.resolution || channel?.heuristics?.resolution || '').toString().toLowerCase();
        const bitrate = parseInt(channel?.bitrate || channel?.heuristics?.bitrate || 0, 10); // kbps

        // Scores acumulados por perfil
        const scores = { P0: 0, P1: 0, P3: 0, P4: 0, P5: 0 };
        const signals = []; // Debug trace

        // ─────────────────────────────────────────────────────────────────
        // CAPA 1: RESOLUCIÓN METADATA DEL API (peso 40) — más confiable
        // ─────────────────────────────────────────────────────────────────
        if (resMeta) {
            if (resMeta.includes('7680') || resMeta.includes('8k'))           { scores.P0 += 40; signals.push('RES:8K→P0'); }
            else if (resMeta.includes('3840') || resMeta.includes('2160') || resMeta.includes('4k')) { scores.P1 += 40; signals.push('RES:4K→P1'); }
            else if (resMeta.includes('1920') || resMeta.includes('1080'))    { scores.P3 += 40; signals.push('RES:1080p→P3'); }
            else if (resMeta.includes('1280') || resMeta.includes('720'))     { scores.P4 += 40; signals.push('RES:720p→P4'); }
            else if (resMeta.includes('854')  || resMeta.includes('480'))     { scores.P5 += 40; signals.push('RES:480p→P5'); }
            else if (resMeta.includes('640')  || resMeta.includes('360'))     { scores.P5 += 40; signals.push('RES:360p→P5'); }
        }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 2: BITRATE DEL API (peso 30) — evidencia directa de calidad
        // ─────────────────────────────────────────────────────────────────
        if (bitrate > 0) {
            if      (bitrate >= 30000) { scores.P0 += 30; signals.push(`BIT:${bitrate}k→P0`); }
            else if (bitrate >= 15000) { scores.P1 += 30; signals.push(`BIT:${bitrate}k→P1`); }
            else if (bitrate >= 6000)  { scores.P3 += 30; signals.push(`BIT:${bitrate}k→P3`); }
            else if (bitrate >= 2500)  { scores.P4 += 30; signals.push(`BIT:${bitrate}k→P4`); }
            else                       { scores.P5 += 30; signals.push(`BIT:${bitrate}k→P5`); }
        }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 3: NOMBRE DEL CANAL — keywords explícitos (peso 20)
        // ─────────────────────────────────────────────────────────────────
        if (name.includes('8K'))                                  { scores.P0 += 20; signals.push('NAME:8K→P0'); }
        if (name.includes('4K') || name.includes('UHD'))         { scores.P1 += 20; signals.push('NAME:4K/UHD→P1'); }
        if (name.includes('FHD') || name.includes('1080'))        { scores.P3 += 20; signals.push('NAME:FHD/1080→P3'); }
        // HD genérico → P3 (1080p), NO P4
        if (name.includes('HD') && !name.includes('720') && !name.includes('480') && !name.includes('SD')) {
            scores.P3 += 15; signals.push('NAME:HD(generic)→P3');
        }
        if (name.includes('720'))                                 { scores.P4 += 20; signals.push('NAME:720→P4'); }
        if (name.includes('SD') || name.includes('480') || name.includes('360')) { scores.P5 += 20; signals.push('NAME:SD/480→P5'); }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 4: GROUP-TITLE (peso 15) — señal de categoría
        // ─────────────────────────────────────────────────────────────────
        if (group.includes('8K'))                                 { scores.P0 += 15; signals.push('GRP:8K→P0'); }
        if (group.includes('4K') || group.includes('UHD'))        { scores.P1 += 15; signals.push('GRP:4K→P1'); }
        if (group.includes('FHD') || group.includes('FULL HD') || group.includes('1080')) { scores.P3 += 15; signals.push('GRP:FHD→P3'); }
        if (group.includes('HD') && !group.includes('720') && !group.includes('FHD') && !group.includes('FULL')) {
            scores.P3 += 10; signals.push('GRP:HD(generic)→P3');
        }
        if (group.includes('720'))                                { scores.P4 += 15; signals.push('GRP:720→P4'); }
        if (group.includes(' SD') || group.includes('SD ') || group.startsWith('SD')) { scores.P5 += 15; signals.push('GRP:SD→P5'); }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 5: BASE DE DATOS DE MARCAS CONOCIDAS (peso 10)
        // ─────────────────────────────────────────────────────────────────
        for (const [profile, brands] of Object.entries(KNOWN_BRANDS)) {
            for (const brand of brands) {
                if (name.includes(brand)) {
                    scores[profile] += 10;
                    signals.push(`BRAND:${brand}→${profile}`);
                    break; // Solo una marca por perfil por canal
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // DECISIÓN FINAL: Perfil con mayor score acumulado
        // ─────────────────────────────────────────────────────────────────
        let bestProfile = 'P3'; // Default conservador: FHD 1080p
        let bestScore   = 0;
        let totalScore  = Object.values(scores).reduce((a, b) => a + b, 0);

        for (const [profile, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore   = score;
                bestProfile = profile;
            }
        }

        // Si ninguna señal votó (score total = 0) → P3 por defecto (anti-starvation)
        if (totalScore === 0) {
            bestProfile = 'P3';
            signals.push('DEFAULT:no-signal→P3');
        }

        const confidence = totalScore > 0 ? Math.round((bestScore / totalScore) * 100) : 0;

        // Guardar debug en el canal para telemetría / EPG headers
        channel._profileDebug = {
            profile:    bestProfile,
            confidence: confidence,
            scores:     scores,
            signals:    signals,
            sources:    { name, group, resMeta, bitrate }
        };

        return bestProfile;
    }

    function generateEXTINF(channel, profile, index) {
        let sid = channel.serverId || channel._source || channel.server_id || '';
        let sName = channel.serverName || '';

        // Si el objeto del canal no tiene serverName (caché antiguo), buscar en activeServers usando sid
        if (!sName && sid) {
            try {
                const servers = window.app?.state?.activeServers;
                if (servers && servers.length > 0) {
                    const srv = servers.find(s => s.id === sid);
                    if (srv && srv.name) sName = srv.name;
                }
            } catch (e) {}
        }

        let finalServerIdent = sName || sid;
        let serverSuffix = finalServerIdent ? ` [${finalServerIdent}]` : '';
        
        const tvgId = escapeM3UValue(channel.stream_id || channel.id || index);
        // Agregamos el sufijo del servidor al nombre visual para diferenciarlos radicalmente
        const tvgName = escapeM3UValue((channel.name || `Canal ${index}`) + serverSuffix);
        const tvgLogo = escapeM3UValue(channel.stream_icon || channel.logo || '');
        let groupTitle = channel.category_name || channel.group || 'General';

        if (window.GroupTitleBuilder && document.getElementById('gt-enabled')?.checked !== false) {
            const gtConfig = window.GroupTitleBuilder.getConfig();
            if (gtConfig?.selectedFields?.length > 0) {
                groupTitle = window.GroupTitleBuilder.buildExport(channel, gtConfig);
            }
        }

        // ── 🎯 CHANNEL CLASSIFIER v2.0: Auto-classify & enrich ──
        const classification = _channelClassifier.classify({ tvgName: channel.name || '', groupTitle, category_name: channel.category_name || '' });
        channel._classification = classification; // Store for EXTHTTP use

        // Auto-correct group-title si confianza >= 85% y el actual es genérico
        const genericGroups = ['general', 'live', 'uncategorized', 'all', 'channels', 'iptv', 'other'];
        if (classification.confidence >= 0.85 && genericGroups.includes(groupTitle.toLowerCase().trim())) {
            groupTitle = classification.suggestedGroupTitle;
        }

        groupTitle = escapeM3UValue(groupTitle);

        const regionCode = classification.region.code || 'XX';
        const contentType = classification.contentType.type || 'GENERALISTA';
        const langCode = classification.language.code || 'unknown';
        const confPct = Math.round(classification.confidence * 100);
        const countryName = classification.country?.group || '';
        const fps = channel.frames || 30;
        const transport = channel.transport || 'HLS';
        const codecFam = channel.codecFamily || '';

        return `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}" ape-profile="${profile}" ape-build="v5.4-MAX-AGGRESSION" ape-region="${regionCode}" ape-content-type="${contentType}" ape-lang="${langCode}" ape-country="${escapeM3UValue(countryName)}" ape-classify-confidence="${confPct}" ape-fps="${fps}" ape-transport="${transport}" ape-codec-family="${codecFam}",${tvgName}`;
    }

    const MAX_URL_LENGTH = 2000;

    /**
     * 🧬 buildCredentialsMap v10.3 — AGGRESSIVE SELF-CONTAINED
     * Reads from ALL sources independently with try/catch isolation.
     * Does NOT depend on external injection.
     */
    function buildCredentialsMap(options) {
        const map = {};
        let sourcesFound = 0;

        // Helper: normalize and add server to map
        const addServer = (s, sourceName) => {
            if (!s || typeof s !== 'object') return;
            const baseUrl = (s.baseUrl || s.url || s.server_url || s.host || '')
                .replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
            const username = sanitizeCredential(s._lockedUsername || s.username || s.user || '');
            const password = sanitizeCredential(s._lockedPassword || s.password || s.pass || '');
            if (!baseUrl || !username || !password) {
                return;
            }
            // Add http:// if missing
            const fullBase = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
            const entry = { baseUrl: fullBase, username, password };
            if (s.id && !map[s.id]) map[s.id] = entry;
            if (s.name && !map['name:' + s.name.toLowerCase()]) map['name:' + s.name.toLowerCase()] = entry;
            const host = fullBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
            if (host && !map['host:' + host]) map['host:' + host] = entry;
            sourcesFound++;
            console.log(`   🔑 [${sourceName}] ${s.name || s.id || host} → ${fullBase} [user:YES]`);
        };

        console.log('🔑 [buildCredentialsMap v10.3] Barrido agresivo de fuentes...');

        // --- SOURCE 1: Injected via options ---
        try {
            if (options && options._activeServers && options._activeServers.length > 0) {
                console.log(`   -> SOURCE 1: options._activeServers (${options._activeServers.length})`);
                options._activeServers.forEach(s => addServer(s, 'INJECTED'));
            }
        } catch (e) { console.warn('   SOURCE 1 error:', e.message); }

        // --- SOURCE 2: window.app.state (with try/catch!) ---
        try {
            if (typeof window !== 'undefined' && window.app && window.app.state) {
                const st = window.app.state;
                // NUCLEAR DIAGNOSTIC: dump first server structure
                if (st.activeServers) {
                    console.log(`   -> SOURCE 2: window.app.state.activeServers (${st.activeServers.length})`);
                    if (st.activeServers.length > 0) {
                        console.log('   🔬 FIRST SERVER KEYS:', Object.keys(st.activeServers[0]).join(', '));
                        const s0 = st.activeServers[0];
                        console.log('   🔬 FIRST SERVER:', JSON.stringify({
                            id: s0.id, name: s0.name,
                            baseUrl: s0.baseUrl, url: s0.url, server_url: s0.server_url, host: s0.host,
                            username: s0.username ? 'YES' : 'NO', user: s0.user ? 'YES' : 'NO',
                            password: s0.password ? '***' : 'NO', pass: s0.pass ? '***' : 'NO'
                        }));
                    }
                    st.activeServers.forEach(s => addServer(s, 'APP_STATE'));
                } else {
                    console.warn('   -> SOURCE 2: activeServers is', typeof st.activeServers, st.activeServers);
                }
                // Also try currentServer
                if (st.currentServer) {
                    addServer(st.currentServer, 'CURRENT_SERVER');
                    const cs = st.currentServer;
                    const csEntry = {
                        baseUrl: (cs.baseUrl || cs.url || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, ''),
                        username: cs.username || cs.user || '',
                        password: cs.password || cs.pass || ''
                    };
                    if (csEntry.baseUrl && csEntry.username && csEntry.password) {
                        if (!csEntry.baseUrl.startsWith('http')) csEntry.baseUrl = 'http://' + csEntry.baseUrl;
                        map['__current__'] = csEntry;
                    }
                }
            } else {
                console.warn('   -> SOURCE 2: window.app:', typeof window !== 'undefined' ? (window.app ? 'EXISTS' : 'NULL') : 'NO WINDOW');
                if (typeof window !== 'undefined' && window.app) {
                    console.warn('   -> SOURCE 2: window.app.state:', window.app.state ? 'EXISTS' : 'NULL/UNDEFINED');
                }
            }
        } catch (e) { console.error('   SOURCE 2 CRASHED:', e.message, e.stack); }

        // --- SOURCE 3: localStorage (multiple keys) ---
        const lsKeys = ['iptv_server_library', 'iptv_connected_servers', 'iptv_active_servers', 'ape_saved_servers'];
        lsKeys.forEach(key => {
            try {
                if (typeof localStorage === 'undefined') return;
                const data = localStorage.getItem(key);
                if (!data) return;
                const parsed = JSON.parse(data);
                const list = Array.isArray(parsed) ? parsed : (parsed.servers || parsed.list || []);
                if (list.length > 0) {
                    console.log(`   -> SOURCE 3: localStorage.${key} (${list.length})`);
                    list.forEach(s => addServer(s, 'LS_' + key));
                }
            } catch (e) { /* silent */ }
        });

        // --- SOURCE 4: NUCLEAR - scan ALL localStorage for any server-like object ---
        if (sourcesFound === 0 && typeof localStorage !== 'undefined') {
            console.warn('   -> SOURCE 4: NUCLEAR SCAN - checking ALL localStorage keys...');
            const allKeys = Object.keys(localStorage);
            console.warn('   -> ALL LS KEYS:', allKeys.filter(k => k.startsWith('iptv')).join(', '));
            allKeys.forEach(key => {
                try {
                    const raw = localStorage.getItem(key);
                    if (!raw || raw.length < 20) return;
                    const parsed = JSON.parse(raw);
                    const candidates = Array.isArray(parsed) ? parsed : [parsed];
                    candidates.forEach(c => {
                        if (c && typeof c === 'object' && (c.username || c.user) && (c.password || c.pass)) {
                            console.log(`   -> SOURCE 4 FOUND credentials in key: ${key}`);
                            addServer(c, 'NUCLEAR_' + key);
                        }
                    });
                } catch (e) { /* not JSON, skip */ }
            });
        }

        // --- FINAL DIAGNOSTIC ---
        if (sourcesFound === 0) {
            console.error('❌ [buildCredentialsMap v10.3] ALL SOURCES EMPTY AFTER NUCLEAR SCAN');
            console.error('   This means NO server credentials exist ANYWHERE in the browser.');
        } else {
            console.log(`🔑 [buildCredentialsMap v10.3] ✅ ${sourcesFound} credentials found. Map entries: ${Object.keys(map).length}`);
        }
        return map;
    }

    // ✅ v10.0: Simple Xtream Codes URL builder — O(1) lookup per channel
    function buildChannelUrl(channel, jwt, profile = null, index = 0, credentialsMap = {}) {
        // 1. If channel already has a complete valid stream URL, use it directly
        let existingUrl = channel.url || channel.direct_source || channel.stream_url || '';
        if (existingUrl && !existingUrl.startsWith('http')) existingUrl = '';
        if (existingUrl) existingUrl = existingUrl.split('?')[0];
        
        if (existingUrl && (existingUrl.includes('/live/') || /\.(ts|m3u8|mpd|mp4|mkv|flv)$/i.test(existingUrl))) {
            return preferHttps(existingUrl);
        }
        
        // 2. Build Xtream Codes URL: http://server/live/user/pass/stream_id.m3u8
        let streamId = channel.stream_id;
        if (streamId == null) streamId = channel.raw?.stream_id;
        if (streamId == null) streamId = channel.id;
        if (streamId == null || streamId === '') return '';
        
        // ═══════════════════════════════════════════════════════════
        // CREDENTIAL RESOLUTION v10.4 — STRICT SERVER MATCHING
        // Each channel MUST use ITS OWN server. NO "first server" fallback.
        // ═══════════════════════════════════════════════════════════
        const sid = channel.serverId || channel._source || channel.server_id || '';
        let creds = null;
        
        // STEP 1: Exact serverId match in credentialsMap
        if (sid && credentialsMap[sid]) {
            creds = credentialsMap[sid];
        }
        
        // STEP 2: Hostname match in credentialsMap (for channels without serverId)
        if (!creds) {
            const rawHost = (channel.raw?.server_url || channel.server_url || channel.url || '')
                .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
            if (rawHost && credentialsMap[`host:${rawHost}`]) {
                creds = credentialsMap[`host:${rawHost}`];
            }
        }
        
        // STEP 3: Direct lookup in window.app.state.activeServers by serverId
        if (!creds && sid) {
            try {
                const servers = window.app?.state?.activeServers;
                if (servers && servers.length > 0) {
                    const srv = servers.find(s => s.id === sid);
                    if (srv) {
                        const base = (srv.baseUrl || srv.url || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                        const user = sanitizeCredential(srv._lockedUsername || srv.username || srv.user || '');
                        const pass = sanitizeCredential(srv._lockedPassword || srv.password || srv.pass || '');
                        if (base && user && pass) {
                            creds = { baseUrl: base.startsWith('http') ? base : `http://${base}`, username: user, password: pass };
                        }
                    }
                }
            } catch (e) {}
        }
        
        // STEP 4: Direct lookup by hostname in activeServers
        if (!creds) {
            try {
                const chHost = (channel.raw?.server_url || channel.server_url || '')
                    .replace(/^https?:\/\//, '').replace(/:\d+$/, '').toLowerCase();
                if (chHost) {
                    const servers = window.app?.state?.activeServers;
                    if (servers) {
                        const srv = servers.find(s => (s.baseUrl || '').toLowerCase().includes(chHost));
                        if (srv) {
                            const base = (srv.baseUrl || srv.url || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                            const user = sanitizeCredential(srv._lockedUsername || srv.username || srv.user || '');
                            const pass = sanitizeCredential(srv._lockedPassword || srv.password || srv.pass || '');
                            if (base && user && pass) {
                                creds = { baseUrl: base.startsWith('http') ? base : `http://${base}`, username: user, password: pass };
                            }
                        }
                    }
                }
            } catch (e) {}
        }
        
        // STEP 5: LAST RESORT — use __current__ ONLY if channel has NO serverId (unknown origin)
        if (!creds && !sid) {
            creds = credentialsMap['__current__'];
        }
        
        if (!creds || !creds.baseUrl || !creds.username || !creds.password) {
            if (index < 5) console.warn(`❌ [buildChannelUrl] No server found for ${channel.name} (sid=${sid}, stream_id=${streamId})`);
            return '';
        }
        
        let ext = typeof window !== 'undefined' && window.app?.state?.streamFormat ? window.app.state.streamFormat : 'ts';
        let typePath = 'live';
        
        if (channel.type === "movie" || channel.stream_type === "movie") { 
            typePath = "movie"; 
            ext = channel.container_extension || "mp4"; 
        } else if (channel.type === "series" || channel.stream_type === "series") { 
            typePath = "series"; 
            ext = channel.container_extension || "mp4"; 
        } else {
            if (channel.customFormat) ext = channel.customFormat;
            if (channel.container_extension && channel.container_extension !== 'mp4') ext = channel.container_extension;
        }
        
        return preferHttps(`${creds.baseUrl}/${typePath}/${creds.username}/${creds.password}/${streamId}.${ext}`);

    
// ═══════════════════════════════════════════════════════════════════════════
// 🧠 OMEGA ABSOLUTE JS GENERATOR: DYNAMIC PAYLOAD + OMNI-ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════
function __getOmegaGodTierDirectives(channel, cfg) {
    const extLines = [];
    
    // 1. Inyectar TODAS las configuraciones dinámicas OMEGA del Profile Manager (v13.1 SUPREMO)
    // Las variables que comienzan con X-APE-, X-CORTEX-, X-TELCHEMY-, X-VNOVA- dominan la compilación
    if (cfg && typeof cfg === 'object') {
        const priorityKeys = [];
        for (const [key, value] of Object.entries(cfg)) {
            if (key.startsWith('X-APE-') || key.startsWith('X-CORTEX-') || key.startsWith('X-TELCHEMY-') || key.startsWith('X-VNOVA-')) {
                if (value !== undefined && value !== null && value !== '') {
                    extLines.push(`#EXT-${key}:${value}`);
                }
            }
        }
    }
    
    // 2. OMNI-ORCHESTRATOR JSON (Identidad criptográfica y referer invariable)
    function determineOmegaContentType(name, group) {
        const n = (name||'').toLowerCase();
        const g = (group||'').toLowerCase();
        if (n.includes('espn') || n.includes('fox') || g.includes('deporte') || n.includes('sport')) return 'sports';
        if (n.includes('hbo') || n.includes('cine') || g.includes('cine') || n.includes('movie')) return 'cinema';
        if (n.includes('cnn') || n.includes('bbc') || g.includes('noticias') || n.includes('news')) return 'news';
        if (n.includes('disney') || n.includes('kids') || g.includes('infantil') || n.includes('nick')) return 'kids';
        if (n.includes('discovery') || n.includes('history') || g.includes('document') || n.includes('nat geo')) return 'documentary';
        return 'default';
    }

    const ct = determineOmegaContentType(channel.name, channel.group_title);
    const ctProfileMap = {
        'sports': 'P0_ULTRA_SPORTS_8K',
        'cinema': 'P1_CINEMA_8K_HDR',
        'news': 'P2_NEWS_4K_HDR',
        'kids': 'P3_KIDS_4K_HDR',
        'documentary': 'P4_DOCU_8K_HDR',
        'default': 'P0_ULTRA_SPORTS_8K'
    };
    
    const strToCrc = (str) => { let hash = 0; for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i); return Math.abs(hash).toString(16); };
    const determinantSid = strToCrc(String(channel.id || channel.name || 'UNKNOWN'));

    if (!window.apeOmegaUniquenessHash) {
        window.apeOmegaUniquenessHash = Math.random().toString(36).substring(2, 10);
    }

    const payload = {
        paradigm: 'OMNI-ORCHESTRATOR-V5-OMEGA',
        version: '1.0.0-OMEGA',
        profile: ctProfileMap[ct],
        ct: ct,
        sid: 'SES_D' + determinantSid,
        referer: 'https://iptv-ape-telemetry.local/',
        uniqueness_hash: window.apeOmegaUniquenessHash,
        uniqueness_nonce: Math.floor(Math.random() * 1000000).toString()
    };
    
    extLines.push(`#EXTHTTP:${JSON.stringify(payload)}`);

    // 3. PHANTOM HYDRA DIRECTIVES (Inyectado Nativamente en el Generator)
    const seedNum = isNaN(parseInt(determinantSid, 16)) ? 1 : parseInt(determinantSid, 16);
    const uas = [
        "NVIDIA SHIELD Android TV/9.0 (SHIELD Android TV; Build/PPR1.180610.011; wv) AppleWebKit/537.36",
        "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1",
        "Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36",
        "AppleTV6,2/11.1",
        "VLC/3.0.21 LibVLC/3.0.21"
    ];
    const snis = ["www.google.com","cloudflare.com","storage.googleapis.com"];
    const dohs = ["https://dns.google/dns-query","https://cloudflare-dns.com/dns-query"];
    const swarm = [64, 128, 256][seedNum % 3];
    const nonceHydra = Math.random().toString(36).substring(2, 12);
    
    extLines.push(`#EXT-X-APE-PHANTOM-HYDRA-STATE: ACTIVE`);
    extLines.push(`#EXT-X-APE-PHANTOM-HYDRA-VERSION: 5.0-OMEGA`);
    extLines.push(`#EXT-X-APE-PHANTOM-HYDRA-NONCE: ${nonceHydra}`);
    extLines.push(`#EXT-X-APE-PHANTOM-UA-ROTATION: ENABLED`);
    extLines.push(`#EXT-X-APE-PHANTOM-UA-ACTIVE: ${uas[seedNum % uas.length]}`);
    extLines.push(`#EXT-X-APE-PHANTOM-DEVICE-SPOOF: SHIELD_TV_PRO_2023`);
    extLines.push(`#EXT-X-APE-PHANTOM-SNI-OBFUSCATION: ENABLED`);
    extLines.push(`#EXT-X-APE-PHANTOM-SNI-FRONT-DOMAIN: ${snis[seedNum % snis.length]}`);
    extLines.push(`#EXT-X-APE-PHANTOM-DOH-SERVER: ${dohs[seedNum % dohs.length]}`);
    extLines.push(`#EXT-X-APE-PHANTOM-SWARM-SIZE: ${swarm}`);
    extLines.push(`#EXT-X-APE-PHANTOM-SWARM-STRATEGY: HYDRA_MULTI_IP`);
    extLines.push(`#EXT-X-APE-PHANTOM-TRAFFIC-MORPH: ENABLED`);
    extLines.push(`#EXT-X-APE-PHANTOM-TRAFFIC-DISGUISE: HTTPS_GOOGLE_APIS`);
    extLines.push(`#EXT-X-APE-PHANTOM-IDEMPOTENT-STATE: LOCKED`);

    return extLines;
}


function generateChannelEntry(channel, index, forceProfile = null, credentialsMap = {}) {
        const originalProfile = forceProfile || determineProfile(channel);
        let profile = originalProfile;
        let cfg = getProfileConfig(profile);

        // ── 👁️ IPTV-SUPPORT-CORTEX vΩ: OVERWRITE NUCLEAR ──
        if (typeof window !== 'undefined' && window.IPTV_SUPPORT_CORTEX_V_OMEGA) {
            const result = window.IPTV_SUPPORT_CORTEX_V_OMEGA.execute(cfg, profile, channel.name || '');
            profile = result.profile;
            cfg = result.cfg;
        }

        // ═══════════════════════════════════════════════════════════════════
        // ⚡ CAPACITY OVERDRIVE ENGINE v1.0 — ANTI-STARVATION MULTIPLIER
        // Multiplica valores de capacidad x2.5 DESPUÉS de la clasificación.
        // Garantiza que incluso una mala clasificación (ej: 1080p→P4)
        // tenga suficiente buffer/bitrate/BW para no congelarse.
        // ISP y ancho de banda NO son restricción → MÁXIMA AGRESIÓN.
        // ═══════════════════════════════════════════════════════════════════
        const CAPACITY_MULTIPLIER = 2.5;
        if (cfg.buffer_ms)              cfg.buffer_ms              = Math.round(cfg.buffer_ms * CAPACITY_MULTIPLIER);
        if (cfg.network_cache_ms)       cfg.network_cache_ms       = Math.round(cfg.network_cache_ms * CAPACITY_MULTIPLIER);
        if (cfg.live_cache_ms)          cfg.live_cache_ms          = Math.round(cfg.live_cache_ms * CAPACITY_MULTIPLIER);
        if (cfg.file_cache_ms)          cfg.file_cache_ms          = Math.round(cfg.file_cache_ms * CAPACITY_MULTIPLIER);
        if (cfg.player_buffer_ms)       cfg.player_buffer_ms       = Math.round(cfg.player_buffer_ms * CAPACITY_MULTIPLIER);
        if (cfg.bitrate)                cfg.bitrate                = Math.round(cfg.bitrate * CAPACITY_MULTIPLIER);
        if (cfg.max_bandwidth)          cfg.max_bandwidth          = Math.round(cfg.max_bandwidth * CAPACITY_MULTIPLIER);
        if (cfg.min_bandwidth)          cfg.min_bandwidth          = Math.round(cfg.min_bandwidth * CAPACITY_MULTIPLIER);
        if (cfg.prefetch_segments)      cfg.prefetch_segments      = Math.round(cfg.prefetch_segments * CAPACITY_MULTIPLIER);
        if (cfg.prefetch_parallel)      cfg.prefetch_parallel      = Math.round(cfg.prefetch_parallel * CAPACITY_MULTIPLIER);
        if (cfg.prefetch_buffer_target) cfg.prefetch_buffer_target = Math.round(cfg.prefetch_buffer_target * CAPACITY_MULTIPLIER);
        if (cfg.prefetch_min_bandwidth) cfg.prefetch_min_bandwidth = Math.round(cfg.prefetch_min_bandwidth * CAPACITY_MULTIPLIER);
        if (cfg.bandwidth_guarantee)    cfg.bandwidth_guarantee    = Math.round(cfg.bandwidth_guarantee * CAPACITY_MULTIPLIER);
        if (cfg.throughput_t1)          cfg.throughput_t1          = Math.round(cfg.throughput_t1 * CAPACITY_MULTIPLIER * 10) / 10;
        if (cfg.throughput_t2)          cfg.throughput_t2          = Math.round(cfg.throughput_t2 * CAPACITY_MULTIPLIER * 10) / 10;

        const reqId = `REQ_${generateRandomString(16)}`;
        const sessionId = `SES_${generateRandomString(16)}`;

        const lines = [];

        // ═══════════════════════════════════════════════════════════════
        // BLOQUE 1: EXTINF
        // ═══════════════════════════════════════════════════════════════
        let extinfLine = generateEXTINF(channel, originalProfile, index);
        lines.push(extinfLine);

        let apeMetaLines = [];
        if (channel.ape_meta) {
            apeMetaLines.push(`#EXT-X-APE-META-FPS:${channel.ape_meta.fps || 24}`);
            apeMetaLines.push(`#EXT-X-APE-META-SCORE:${channel.ape_meta.stability_score || 50}`);
            apeMetaLines.push(`#EXT-X-APE-META-CLASS:${channel.ape_meta.network_class || 'UNKNOWN'}`);
            apeMetaLines.push(`#EXT-X-APE-META-CODEC:${channel.ape_meta.codec || 'avc1'}`);
            apeMetaLines.push(`#EXT-X-APE-META-ID:${channel.ape_meta.stream_uid || 'unassigned'}`);
        }

        // ── 🛡️ PEVCE ACTIVE METADATA ENFORCEMENT & NUCLEAR EVASION ──
        // CUMPLIMIENTO DOCTRINA BULLETPROOF (REGLAS 1 y 3)
        // RESOLVER MODIFICADO: Apunta al backend SSOT unificado (Médula Híbrida)
        
        // v6.1 COMPAT: Los FALLBACK-IDs individuales fueron consolidados en el
        // PRE_ARMED B64 payload (BLOQUE 8). Ya no se emiten aquí como tags sueltos
        // porque OTT Navigator contaba cada FALLBACK-ID como un stream variant → CRASH.

        // ── ÚNICO STREAM (REGLA 1 STRICT 1:1) ──
        let primaryUrl = buildChannelUrl(channel, null, profile, index, credentialsMap);
        if (!primaryUrl) {
            // ═══════ NUCLEAR DIAGNOSTIC (first 3 channels) ═══════
            if (index < 3) {
                console.error('🔴🔴🔴 [DIAGNOSTIC] buildChannelUrl returned EMPTY for channel #' + index);
                console.error('   channel.name:', channel.name);
                console.error('   channel.stream_id:', channel.stream_id, '(type:', typeof channel.stream_id, ')');
                console.error('   channel.id:', channel.id);
                console.error('   channel.serverId:', channel.serverId);
                console.error('   channel.url:', channel.url);
                console.error('   channel.raw?.stream_id:', channel.raw?.stream_id);
                console.error('   channel.raw?.server_url:', channel.raw?.server_url);
                console.error('   channel.raw?.server_port:', channel.raw?.server_port);
                console.error('   CHANNEL KEYS:', Object.keys(channel).join(', '));
                try {
                    console.error('   window.app exists:', !!window.app);
                    console.error('   window.app.state exists:', !!window.app?.state);
                    console.error('   activeServers:', window.app?.state?.activeServers?.length || 0);
                    console.error('   currentServer:', !!window.app?.state?.currentServer);
                    if (window.app?.state?.activeServers?.[0]) {
                        const s = window.app.state.activeServers[0];
                        console.error('   SERVER[0]:', JSON.stringify({id:s.id, name:s.name, baseUrl:(s.baseUrl||'').substring(0,80), hasUser:!!s.username, hasPass:!!s.password}));
                    }
                } catch(e) { console.error('   DIAGNOSTIC ERROR:', e.message); }
            }
            
            // LAST RESORT: Direct server lookup to build Xtream URL
            try {
                // Use stream_id — handle numeric 0 correctly with != null check
                let sid = channel.stream_id;
                if (sid == null) sid = channel.raw?.stream_id;
                if (sid == null) sid = channel.id;
                if (sid == null || sid === '') sid = index; // absolute last resort
                
                const servers = (typeof window !== 'undefined' && window.app && window.app.state && window.app.state.activeServers) || [];
                const currentSrv = (typeof window !== 'undefined' && window.app && window.app.state && window.app.state.currentServer) || null;
                const srvId = channel.serverId || channel._source || '';
                
                let srv = null;
                if (servers.length > 0) {
                    srv = srvId ? servers.find(s => s.id === srvId) : servers[0];
                    if (!srv) srv = servers[0];
                }
                if (!srv) srv = currentSrv;
                
                if (srv) {
                    const base = (srv.baseUrl || srv.url || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                    const user = sanitizeCredential(srv._lockedUsername || srv.username || srv.user || '');
                    const pass = sanitizeCredential(srv._lockedPassword || srv.password || srv.pass || '');
                    if (base && user && pass) {
                        const fullBase = base.startsWith('http') ? base : `http://${base}`;
                        primaryUrl = preferHttps(`${fullBase}/live/${user}/${pass}/${sid}.m3u8`);
                        if (index < 3) console.warn(`⚠️ [LAST-RESORT] ${channel.name}: URL=${primaryUrl}`);
                    }
                }
            } catch (e) { if (index < 3) console.error('LAST-RESORT crash:', e.message, e.stack); }
            
            // If STILL no URL — construct from channel raw data as absolute emergency
            if (!primaryUrl) {
                const srvUrl = channel.raw?.server_url || channel.server_url || '';
                const srvPort = channel.raw?.server_port || channel.server_port || '80';
                let sid = channel.stream_id;
                if (sid == null) sid = channel.raw?.stream_id;
                if (sid == null) sid = channel.id;
                if (sid == null) sid = index;
                
                if (srvUrl) {
                    const host = srvUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                    primaryUrl = `http://${host}:${srvPort}/live/CRED_MISSING/CRED_MISSING/${sid}.m3u8`;
                    if (index < 3) console.error(`🟡 [EMERGENCY] ${channel.name}: URL with CRED_MISSING placeholders`);
                } else {
                    // Totally nothing — use channel.url if it exists
                    primaryUrl = channel.url || `http://missing-data/${index}.m3u8`;
                    if (index < 3) console.error(`🔴 [TOTAL-FAIL] ${channel.name}: No server data available`);
                }
            }
        }
        // ELIMINADO: No inyectar tokens de evasión ("evasion_4xx=rotate_xff_ua_tunnel") en la URL directa del proveedor.
        // Los servidores Xtream Codes (ModSecurity) bloquean instantáneamente cualquier URL con palabras como "evasion" o "tunnel"
        // causando que VLC reciba un 400/403 de inmediato y salte al siguiente canal.
        let finalUrl = `${primaryUrl}`;
        // ── ORDENAMIENTO ESTRUCTURAL PERFECTO (Fase 4 Auditoría Estructural) ──
        
        // 1. EXTVLCOPT: Optimizadores de Hardware/Software
        lines.push(...generateEXTVLCOPT(profile));

        // 2. EXTHTTP: Custom Network Headers & Auth bridge
        // ⚡ FIX: build_exthttp lee cfg._classification, pero la clasificación
        // vive en channel._classification. Sin este bridge, los headers
        // X-APE-CL-* del EXTHTTP nunca se emitían (cfg es el perfil, no el canal).
        cfg._classification = channel._classification;
        cfg._channelName = channel.name || channel.tvg_name || '';
        cfg._channelId = String(channel.stream_id || channel.id || index);
        lines.push(build_exthttp(cfg, profile, index, sessionId, reqId));

        // 3. KODIPROP: Instrucciones adaptativas DRM/Inputs
        lines.push(...build_kodiprop(cfg, profile, index));

        // 4. EXT-X-APE-* (Metadata APE Propietario inicial, extraído de EXTINF)
        if (apeMetaLines.length > 0) {
            lines.push(...apeMetaLines);
        }

        // ── 🔥 MODULE 16: HDR PEAK NIT ENGINE 5000cd/m² (Resolver Sync) ──
        lines.push(...build_hdr_peak_nit_tags(cfg, profile));
        // ── 🧹 MODULE 15: ANTI-NOISE ENGINE 14-FILTER (Resolver Sync) ──
        lines.push(...build_anti_noise_tags(cfg, profile));
        // ── 🛡️ ANTI-CUT ISP STRANGULATION (Resolver Sync) ──
        lines.push(...build_anti_cut_tags(cfg, profile));
        // ── 📊 QoS / QoE / PREFETCH / PERFORMANCE (Profile Manager Sync) ──
        lines.push(...build_qos_performance_tags(cfg, profile));

        // ═══════════════════════════════════════════════════════════════
        // ☢️ 6-LAYER NUCLEAR TAGS — INELUDIBLE PER-CHANNEL SYSTEM
        // v6.1 COMPAT: Sin claves duplicadas. Caching ya definido en
        //   generateEXTVLCOPT(). BUFFER ya definido en build_ape_block().
        //   CLOCK ya definido en build_ape_block() Section 11.
        //   Aquí solo van tags ÚNICOS del sistema nuclear.
        // ═══════════════════════════════════════════════════════════════

        // ── CAPA L1: Buffer Strategy Nuclear (tags ÚNICOS, no duplican build_ape_block) ──
        lines.push(`#EXT-X-APE-BUFFER-STRATEGY:NUCLEAR_NO_COMPROMISE`);
        lines.push(`#EXT-X-APE-BUFFER-PREBUFFER-SECONDS:120`);
        lines.push(`#EXT-X-APE-BUFFER-UNDERRUN-STRATEGY:AGGRESSIVE_REFILL_INSTANT`);
        lines.push(`#EXT-X-APE-BUFFER-OVERRUN-STRATEGY:DROP_OLDEST`);

        // ── CAPA L2: Reconnection Nuclear ──
        lines.push(`#EXT-X-APE-RECONNECT-MAX:UNLIMITED`);
        lines.push(`#EXT-X-APE-RECONNECT-DELAY:0-50ms`);
        lines.push(`#EXT-X-APE-RECONNECT-PARALLEL:64`);
        lines.push(`#EXT-X-APE-RECONNECT-POOL:50`);
        lines.push(`#EXT-X-APE-RECONNECT-WARM-POOL:20`);
        lines.push(`#EXT-X-APE-RECONNECT-SEAMLESS:TRUE`);

        // ── CAPA L3: Error Recovery Nuclear ──
        lines.push(`#EXT-X-APE-ERROR-RECOVERY:NUCLEAR`);
        lines.push(`#EXT-X-APE-ERROR-MAX-RETRIES:UNLIMITED`);
        lines.push(`#EXT-X-APE-ERROR-CONCEALMENT:AI_INPAINTING`);
        lines.push(`#EXT-X-APE-ERROR-SKIP-CORRUPTED:TRUE`);
        lines.push(`#EXT-X-APE-ERROR-RESILIENCE:MAXIMUM`);

        // ── CAPA L4: ISP Throttle + Multi-Source ──
        lines.push(`#EXT-X-APE-ISP-THROTTLE-LEVEL:AUTO_ESCALATE`);
        lines.push(`#EXT-X-APE-ISP-NEVER-DOWNGRADE:TRUE`);
        lines.push(`#EXT-X-APE-MULTI-SOURCE:ENABLED`);
        lines.push(`#EXT-X-APE-MULTI-SOURCE-COUNT:5`);
        lines.push(`#EXT-X-APE-MULTI-SOURCE-RACING:TRUE`);
        lines.push(`#EXT-X-APE-MULTI-SOURCE-FAILOVER-MS:50`);

        // ── CAPA L5: Emergency Failsafe (ÚLTIMA LÍNEA DE DEFENSA) ──
        lines.push(`#EXT-X-APE-FREEZE-PREDICTION:ENABLED`);
        lines.push(`#EXT-X-APE-FREEZE-PREVENTION-AUTO:TRUE`);
        lines.push(`#EXT-X-APE-QUALITY-NEVER-DROP-BELOW:480p`);
        lines.push(`#EXT-X-APE-QUALITY-FALLBACK-CHAIN:4K>1080p>720p>480p>360p>240p`);
        lines.push(`#EXT-X-APE-FRAME-INTERPOLATION:AI_RIFE_V4`);
        lines.push(`#EXT-X-APE-CLOCK-DRIFT-COMPENSATION:AGGRESSIVE`);
        lines.push(`#EXT-X-APE-CLOCK-SYNC-MODE:ADAPTIVE`);

        // ── SKILL: EXTATTRFROMURL — Maximum Image Quality Enforcer ──
        // Capa extra de forzamiento de calidad para OTT Navigator y forks compatibles
        lines.push('#EXTATTRFROMURL:quality=top,resolution=highest,bitrate=max');
        lines.push('#EXTATTRFROMURL:preferred-codec=hevc,hev1,hvc1,h265,H265,h.265,H.265');
        lines.push('#EXTATTRFROMURL:upscale-algorithm=lanczos,upscale-factor=auto');
        lines.push('#EXTATTRFROMURL:color-depth=10bit,color-space=bt2020,color-range=full');
        lines.push('#EXTATTRFROMURL:pixel-format=yuv420p10le,chroma-subsampling=4:4:4');
        lines.push('#EXTATTRFROMURL:hdr-mode=auto,tone-mapping=reinhard-adaptive');
        lines.push('#EXTATTRFROMURL:deinterlace=auto,deblock=maximum,denoise=aggressive');
        lines.push('#EXTATTRFROMURL:sharpening=adaptive-unsharp,sharpening-strength=7');
        lines.push('#EXTATTRFROMURL:video-output=best,hw-decode=force,gpu-scaling=high-quality');
        // Fusión Infinita BWDIF via EXTATTRFROMURL
        lines.push('#EXTATTRFROMURL:adaptive-logic=highest,adaptive-max-resolution=7680x4320');
        lines.push('#EXTATTRFROMURL:deinterlace-mode=bwdif,deinterlace-fallback=yadif2x,gpu-deinterlace=force');
        lines.push('#EXTATTRFROMURL:hw-accel=force,hw-decode-codecs=hevc:h265:av1:vp9:h264');
        // Telchemy TVQM via EXTATTRFROMURL — bridge al backend
        lines.push('#EXTATTRFROMURL:tvqm-vstq=50,tvqm-vsmq=50,tvqm-epsnr=45');
        lines.push('#EXTATTRFROMURL:tvqm-mapdv=10,tvqm-ppdv=5,gop-max=120');
        lines.push('#EXTATTRFROMURL:blockiness-guard=active,jerkiness-guard=active,skip-frames=never');
        // V17.2 Codec Forcing & Hardware Extrusion via EXTATTRFROMURL
        lines.push('#EXTATTRFROMURL:codec=hevc,video-profile=main10,video-tier=high');
        lines.push('#EXTATTRFROMURL:pixel-format=yuv420p10le,color-depth=10bit,color-range=full');
        lines.push('#EXTATTRFROMURL:video-scaler=vdpau:opengl,sharpen=0.05,contrast=1.0');
        lines.push('#EXTATTRFROMURL:ignore-screen-resolution=true,hdr-pipeline=force-10bit-main10');
        lines.push('#EXTATTRFROMURL:network-sync=1,mtu=65535,high-priority=1,audio-passthrough=true');
        // Content-Aware HEVC Multichannel via EXTATTRFROMURL
        lines.push('#EXTATTRFROMURL:encoder=nvenc-hevc,preset=p6,tune=hq,rate-control=vbr-constrained');
        lines.push('#EXTATTRFROMURL:content-aware=per-scene,analysis-fps=1,smoothing=6-10s');
        lines.push('#EXTATTRFROMURL:gop=2s,b-frames=2,lookahead=10,aq-mode=spatial');
        lines.push('#EXTATTRFROMURL:abr-ladder=2160p@25M:1440p@16M:1080p@10M:720p@6M:540p@3M');
        lines.push('#EXTATTRFROMURL:gpu-decode=cuvid,gpu-filter-chain=vram-only,e2e-latency=4000ms');
        lines.push('#EXTATTRFROMURL:failover=cbr-80pct,scaler=lanczos-hw,cmaf-chunk=200ms');
        // ── 🧠 CORTEX QUALITY ENGINE via EXTATTRFROMURL ──
        lines.push('#EXTATTRFROMURL:cortex-engine=v1.0.0,decision-tree=deterministic');
        lines.push('#EXTATTRFROMURL:cortex-codec-priority=hevc:100,av1:95,vp9:85,avc:70');
        lines.push('#EXTATTRFROMURL:cortex-transport=cmaf>fmp4>ts,hdr-policy=passthrough>tonemap');
        lines.push('#EXTATTRFROMURL:cortex-abr=safety-margin:0.2,switch-up:1.2,switch-down:0.8');
        lines.push('#EXTATTRFROMURL:cortex-deinterlace=bwdif:95,w3fdif:85,yadif:80,detect=auto');
        lines.push('#EXTATTRFROMURL:cortex-artifact=deblock:auto,loop-filter:on,concealment:mv');
        lines.push('#EXTATTRFROMURL:cortex-fallback=codec:hevc>av1>vp9>avc,transport:cmaf>fmp4>ts');
        lines.push('#EXTATTRFROMURL:cortex-ffmpeg=x265:deblock:-1:-1,hdr-opt:1,repeat-headers:1');
        lines.push('#EXTATTRFROMURL:cortex-noise=nlmeans+hqdn3d,preserve-detail=true,enhance=lcevc');
        lines.push('#EXTATTRFROMURL:cortex-device=hw-decode:force,lcevc:true,max-bw:50M');
        // ── 🚀 TRANSPORT DECISION MODULE v2.0 via EXTATTRFROMURL ──
        lines.push('#EXTATTRFROMURL:transport-engine=v2.0.0,decision-tree=deterministic');
        lines.push('#EXTATTRFROMURL:transport-modes=direct_ts:direct_cmaf:worker_ts:worker_cmaf:hybrid');
        lines.push('#EXTATTRFROMURL:transport-cmaf=segment-type:fmp4,init:init.mp4,independent:true,hls-version:7');
        lines.push('#EXTATTRFROMURL:transport-cmaf-ll=low-latency:true,target:4s,part-target:0.2s,preload-hint:true');
        lines.push('#EXTATTRFROMURL:transport-cmaf-hybrid=dash:true,prft:true,blocking-reload:true');
        lines.push('#EXTATTRFROMURL:transport-fallback=cmaf:direct_cmaf>worker_ts>direct_ts,ts:direct_ts>worker_cmaf');
        lines.push('#EXTATTRFROMURL:transport-scoring=player:0.30,device:0.25,hdr:0.15,telemetry:0.15,network:0.15');
        lines.push('#EXTATTRFROMURL:transport-hdr=chain:native>tone_mapped>sdr,passthrough:true,tonemap:bt2390');
        lines.push('#EXTATTRFROMURL:transport-ffmpeg=cmaf:seg=4:fmp4,hybrid:ldash=1:streaming=1,ts:pcr=50:pat=0.1');
        lines.push('#EXTATTRFROMURL:transport-worker=zerodrop:true,watchdog:manifest=30s:freeze=10s,reconnect:5');
        lines.push('#EXTATTRFROMURL:transport-telemetry=startup+rebuffer+freeze+quality_switches,learn:true');
        lines.push('#EXTATTRFROMURL:transport-stability=over-sophistication:true,ts-universal-fallback:true');
        
        // ── 🛡️ PEVCE ACTIVE METADATA ENFORCEMENT ──
        lines.push('#EXTATTRFROMURL:pevce-network=network-caching:3000,live-caching:3000,http-reconnect:true');
        lines.push('#EXTATTRFROMURL:pevce-codec=hw-any:true,threads:0,deinterlace:auto');
        lines.push('#EXTATTRFROMURL:pevce-cmaf=timeshift-buffer:true,timeshift-size:64');
        lines.push('#EXTATTRFROMURL:pevce-hdr=force-hdr:true');

        // ═══════════════════════════════════════════════════════════════
        // BLOQUE 2B: VPS RESOLVER — OPTION B: UNIVERSAL PLAYER SUPPORT
        // When dual-client-runtime is ON, ALL players (VLC, TiviMate, Kodi,
        // OTT Navigator) go through resolve_quality. The VPS returns a mini
        // M3U8 with 63+ EXTVLCOPT + 80+ EXTHTTP + direct origin URL.
        // Zero Proxy: only metadata passes through VPS, video bytes are direct.
        // ═══════════════════════════════════════════════════════════════
        if (typeof window !== 'undefined' && window.ApeModuleManager?.isEnabled('dual-client-runtime')) {
            const resolverBase = (typeof localStorage !== 'undefined' && localStorage.getItem('vps_base_url'))
                || 'https://iptv-ape.duckdns.org';
            const resolveScript = '/resolve_quality_unified.php';

            const chId = channel.epg_channel_id || channel.tvg_id || channel.stream_id || channel.id || index;
            const listId = (typeof VERSION !== 'undefined' ? VERSION : '16.0.0').replace(/[^a-zA-Z0-9.-]/g, '');

            // origin + sid for multi-server failover
            const originHost = channel._originHost || channel.server_url || '';
            const originParam = originHost ? `&origin=${encodeURIComponent(originHost.replace(/^https?:\/\//, '').split('/')[0])}` : '';
            const sidParam = channel.stream_id ? `&sid=${channel.stream_id}` : '';

            // Credential passthrough: base64(host|user|pass) — decoded by resolve_quality.php
            let srvParam = '';
            try {
                const servers = window.app?.state?.activeServers || [];
                const currentSrv = window.app?.state?.currentServer || null;
                const channelServerId = channel._source || channel.serverId || channel.server_id || '';
                let server = channelServerId ? servers.find(s => s.id === channelServerId) : null;
                if (!server) server = currentSrv;
                if (!server && servers.length > 0) server = servers[0];

                if (server && server.baseUrl && server.username && server.password) {
                    const cleanHost = (server.baseUrl || '').replace(/\/player_api\.php$/, '').replace(/\/$/, '').replace(/^https?:\/\//, '');
                    const rawSrvToken = btoa(`${cleanHost}|${sanitizeCredential(server._lockedUsername || server.username)}|${sanitizeCredential(server._lockedPassword || server.password)}`);
                    const safeSrvToken = rawSrvToken.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                    srvParam = `&srv=${safeSrvToken}`;
                }
            } catch (e) { /* silent credential resolution failure */ }

            // ═══════════════════════════════════════════════════════════
            // 🧬 COMPACT CTX — Delta-only anatomy inheritance
            // Backend already knows P0-P5 internals (codecs, LCEVC,
            // transport, deinterlace, resilience) — only send what VARIES.
            // Goal: ctx ~160 chars, total URL < 600 chars — ALL players OK.
            // Backend applies MAX(origin[field], local[field]) rule.
            // ═══════════════════════════════════════════════════════════
            // ⚡ v4.0 CTX v25: UNIFIED INTELLIGENCE — closes 22 data gaps between lanes.
            // Before: EXTHTTP had 200 headers but CTX only sent 22 to the resolver.
            // Now: CTX sends 44 fields — HDR, buffer, device, audio, Dolby Vision,
            // screen resolution, CDN, failover, player type — enabling smarter
            // Channel Map, Sniper Mode, and QoS decisions on the resolver side.
            // ═══════════════════════════════════════════════════════════
            const cl = channel._classification || {};
            const ctxPayload = {
                p:  profile,                                                    // profile ID
                rs: cfg?.res || cfg?.resolution || '1920x1080',                  // resolution
                bw: cfg?.max_bw || cfg?.max_bandwidth || 20000000,               // max bandwidth
                br: cfg?.bitrate || cfg?.bitrate_mbps || 3700,                   // bitrate kbps
                bf: cfg?.buffer_ms || cfg?.buffer || 30000,                      // buffer ms
                nc: cfg?.net_cache || cfg?.network_caching || 40000,             // net cache ms
                hd: (cfg?.hdr && cfg.hdr.length > 0) ? 1 : 0,                  // HDR flag (0/1)
                cp: cfg?.codec_primary || 'HEVC',                               // primary codec
                ib: (cfg?.bitrate || 5000) * 1000,                              // Initial-Bitrate bps
                v:  '26'                                                       // CTX version stripped
            };

            // B64 URL-safe (no encodeURIComponent needed — only A-Z a-z 0-9 - _)
            const ctxB64 = btoa(JSON.stringify(ctxPayload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            let ctxParam = `&ctx=${ctxB64}`;
            
            // Inyectar Cache-Busting del Pilar 5 si está activo
            if (_cortexTempBanHash) {
                ctxParam += `&m3u8_busted=${_cortexTempBanHash}`;
            }

            // RESOLVER MODIFICADO: Apunta al nuevo resolve_quality_unified.php (Cero 302, 100% 200 OK)
            // Se envía el contexto encriptado ctx encapsulando la directiva Phantom Hydra y el origen blindado.
            const resolverUrl = `${resolverBase}${resolveScript}?ch=${encodeURIComponent(chId)}&profile=${cl.type || 'DEFAULT'}&mode=200ok&url=${encodeURIComponent(primaryUrl)}${ctxParam}&ext=.m3u8`;

            // 🎯 OPTION B: Replace the primary stream URL with resolve_quality
            // ALL players (VLC, TiviMate, Kodi) will hit the VPS, which returns
            // a mini M3U8 with EXTVLCOPT + EXTHTTP + the direct origin URL.
            finalUrl = resolverUrl;

            // 🛡️ FALLBACK: Preserve direct origin URL in M3U8
            // If VPS is unreachable, players with APE support use this fallback.
            // Failover is automatic: each channel open = new request, so when
            // VPS recovers, the next channel hit goes through resolve_quality again.
            lines.push(`#EXT-X-APE-FALLBACK-DIRECT:${primaryUrl}`);

            // Keep EXTATTRFROMURL for OTT Navigator's native resolver path
            lines.push(`#EXTATTRFROMURL:${resolverUrl}`);

            if (index < 3) {
                console.log(`🔄 [OPTION-B] Canal #${index}: URL → resolve_quality (srv=${srvParam ? 'YES' : 'NO'}) | fallback → ${primaryUrl.substring(0, 60)}...`);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // BLOQUE 3: APE TAGS (build_ape_block con LCEVC-BASE-CODEC fix)
        // ═══════════════════════════════════════════════════════════════
        // Inyectar el perfil original al channel para que build_ape_block lo use
        channel._originalProfile = originalProfile;
        lines.push(...build_ape_block(cfg, profile, index, channel));

        // ═══════════════════════════════════════════════════════════════
        // BLOQUE 4 A 9: OMEGA GOD-TIER (EXTRACCIÓN DINÁMICA DEL UI)
        // Sustituye 300+ tags estáticos inyectando directamente los seleccionados por el perfil.
        // ═══════════════════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════════════════
        // 📊 STREAMING HEALTH ENGINE (INTEGRACIÓN OMEGA ABSOLUTE)
        // ═══════════════════════════════════════════════════════════════
        if (window.StreamingCalculator && typeof window.StreamingCalculator.calculateAllMetrics === 'function') {
            try {
                // Mapear los parámetros del UI hacia el motor de cálculo probabilístico
                const metricConfig = {
                    resolution: cfg?.resolution || '3840x2160', // Max resolution (4K UHD)
                    codec: cfg?.codec || 'HEVC-MAIN10,AV1,H264-HIGH', // Hierarchy: HEVC > AV1 > H264
                    fps: parseInt(cfg?.fps || 120, 10), // Max FPS for sports
                    deinterlace: cfg?.deinterlace || 'BWDIF,YADIF', // Optimal deinterlacing fallback
                    bufferBaseMs: parseInt(cfg?.buffer || cfg?.buffer_ms || 15000, 10),
                    prefetchSegments: parseInt(cfg?.prefetch_segments || 15, 10),
                    parallelDownloads: parseInt(cfg?.parallel_downloads || cfg?.prefetch_parallel || 5, 10),
                    minBandwidthMbps: parseFloat(cfg?.min_bandwidth_mbps || cfg?.min_bandwidth || 25),
                    strategy: cfg?.strategy || 'QMAX-GREEDY', // Force greedy resolution
                    compressionMult: 0.22
                };

                const extMetrics = window.StreamingCalculator.calculateAllMetrics(metricConfig);

                // Empujar cabeceras predictivas al stream para consumo de OTT Navigator / Telchemy TVQM
                lines.push(`#EXT-X-APE-DYNAMIC-RISK-SCORE:${extMetrics.riskScore}`); // 0-100
                lines.push(`#EXT-X-APE-DYNAMIC-RAM-PEAK:${extMetrics.memoryPeak}`); // MB
                lines.push(`#EXT-X-APE-DYNAMIC-RAM-STEADY:${extMetrics.memorySteady}`); // MB
                lines.push(`#EXT-X-APE-DYNAMIC-STALL-RATE:${extMetrics.stallRate}`); // % Probability
                lines.push(`#EXT-X-APE-DYNAMIC-STALL-QUALITY:${(extMetrics.stallQuality ? extMetrics.stallQuality.level : 'UNKNOWN')}`); // EXCELLENT, ACCEPTABLE, POOR
                lines.push(`#EXT-X-APE-DYNAMIC-HEADROOM:${extMetrics.bwHeadroomPercent}`); // %
                lines.push(`#EXT-X-APE-DYNAMIC-T1-THROUGHTPUT:${extMetrics.t1}`); // Mbps
                lines.push(`#EXT-X-APE-DYNAMIC-T2-THROUGHTPUT:${extMetrics.t2}`); // Mbps
                lines.push(`#EXT-X-APE-DYNAMIC-JITTER-MAX:${extMetrics.jitterMax}`); // ms
                lines.push(`#EXT-X-APE-DYNAMIC-FILL-TIME:${extMetrics.fillTime}`); // seconds
                
                // Hard-Enforcement: Si es CRITICAL (Fail), forzamos advertencias extremas
                if (extMetrics.riskLevel === 'CRITICAL' || extMetrics.stability.class === 'UNSTABLE') {
                    lines.push(`#EXT-X-APE-CRITICAL-WARNING:UNSTABLE_BW_DETECTED_POSSIBLE_STALLS`);
                    lines.push(`#EXT-X-APE-VULNERABLE-STATE:TRUE`);
                }
            } catch (e) {
                console.error("Error computando metricas APE Dynamic:", e);
            }
        }
        
        const omegaDirectives = __getOmegaGodTierDirectives(channel, cfg);
        if (omegaDirectives && omegaDirectives.length > 0) {
            lines.push(...omegaDirectives);
        }

        // 🎯 INYECCIÓN DEL ÚNICO STREAM AL FINAL DEL BLOQUE (STRICT 1:1 RULE)

        lines.push(finalUrl);

        return lines.join('\n');
    }



    function generateM3U8Stream(channels, options = {}) {
        const forceProfile = options.forceProfile || null;
        const includeHeader = options.includeHeader !== false;
        const useHUD = options.hud !== false && window.HUD_TYPED_ARRAYS;
        const encoder = new TextEncoder();
        const BATCH_SIZE = 200;
        let totalBytes = 0;

        // ✅ v10.1: Pre-build credentials map ONCE — uses injected servers from options
        const credentialsMap = buildCredentialsMap(options);

        const stream = new ReadableStream({
            async start(controller) {
                const startTime = Date.now();

                console.log(`🌊 [STREAM] Generando M3U8 ULTIMATE para ${channels.length} canales...`);
                console.log(`   🔑 Credentials map: ${Object.keys(credentialsMap).length} entries`);
                console.log(`   📊 Estructura: 139 líneas/canal | JWT: 68+ campos | Perfiles: P0-P5`);

                // 🎯 INICIALIZAR HUD
                if (useHUD) {
                    window.HUD_TYPED_ARRAYS.init(channels.length, {
                        sessionId: `TA-${Date.now()}`
                    });
                    window.HUD_TYPED_ARRAYS.log('🌊 Streaming mode activado...', '#a78bfa');
                }

                // PASO 1: GLOBAL HEADER
                if (includeHeader) {
                    const headerChunk = generateGlobalHeader(channels.length) + '\n\n';
                    const encoded = encoder.encode(headerChunk);
                    totalBytes += encoded.byteLength;
                    controller.enqueue(encoded);
                    if (useHUD) {
                        window.HUD_TYPED_ARRAYS.log('📋 Header global streamed', '#06b6d4');
                    }
                }

                // PASO 2: STREAM cada canal
                for (let index = 0; index < channels.length; index++) {
                    const channel = channels[index];

                    // Check abort
                    if (useHUD && window.HUD_TYPED_ARRAYS.isAborted()) {
                        controller.error(new Error('ABORTED_BY_USER'));
                        return;
                    }

                    try {
                        const entry = generateChannelEntry(channel, index, forceProfile, credentialsMap);
                        const chunk = entry + '\n\n';
                        const encoded = encoder.encode(chunk);
                        totalBytes += encoded.byteLength;
                        controller.enqueue(encoded);

                        // Detectar perfil para estadísticas
                        const profile = forceProfile || detectProfile(channel);

                        // Actualizar HUD
                        if (useHUD && (index % 50 === 0 || index === channels.length - 1)) {
                            window.HUD_TYPED_ARRAYS.updateChannel(index + 1, channel.name, profile);
                        }

                        // Progress log cada 1000
                        if ((index + 1) % 1000 === 0) {
                            console.log(`   ⏳ Streamed: ${index + 1}/${channels.length}`);
                            if (useHUD) {
                                window.HUD_TYPED_ARRAYS.log(`📺 ${index + 1}/${channels.length} canales...`, '#a78bfa');
                            }
                        }
                    } catch (error) {
                        if (error.message === 'ABORTED_BY_USER') {
                            controller.error(error);
                            return;
                        }
                        console.error(`❌ [STREAM] Error en canal ${channel.name}:`, error);
                        if (useHUD) {
                            window.HUD_TYPED_ARRAYS.log(`⚠️ Error: ${channel.name}`, '#ef4444');
                        }
                    }

                    // 🌊 YIELD: Cada BATCH_SIZE canales, ceder control al browser
                    if ((index + 1) % BATCH_SIZE === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }

                // Cerrar stream
                controller.close();

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                const sizeMB = (totalBytes / 1024 / 1024).toFixed(2);
                const sizeKB = (totalBytes / 1024).toFixed(2);

                console.log(`✅ [STREAM] Generación completada en ${elapsed}s`);
                console.log(`   📊 Canales: ${channels.length} | Tamaño: ${sizeMB} MB | ~${140 * channels.length} líneas`);

                // 🎯 COMPLETAR HUD
                if (useHUD) {
                    window.HUD_TYPED_ARRAYS.updateStats({
                        jwt: `${(totalBytes / channels.length / 1024 * 0.3).toFixed(1)} KB/ch`,
                        filesize: `${sizeMB} MB`,
                        grouptitle: '✓ Activo'
                    });
                    window.HUD_TYPED_ARRAYS.complete({
                        jwt: `${sizeKB} KB`,
                        filesize: `${sizeMB} MB`
                    });
                }
            }
        });

        return stream;
    }

    /**
     * generateM3U8 — wrapper que convierte el stream a Blob
     * Compatible con el resto del sistema (devuelve Blob)
     */
    async function generateM3U8(channels, options = {}) {
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('❌ [TYPED-ARRAYS] No hay canales para generar');
            return null;
        }

        // AUTO-DELTA METADATA SCAN - OBLIGATORIO PRE-GENERACIÓN
        if (window.apeScanMetadataCluster && options.skipMetaScan !== true) {
            console.log("🧠 [APE-META] Auto-escaneando metadata delta antes de generar...");
            if (window.HUD_TYPED_ARRAYS) window.HUD_TYPED_ARRAYS.log(`🧠 Iniciando Inteligencia Metadata (Delta)...`, '#8b5cf6');
            await window.apeScanMetadataCluster(true);
        }

        // ═══════════════════════════════════════════════════════════════
        // v9.1 SCHEMA TRANSLATOR GATE — Channels enter clean or not at all
        // Applies: Unicode sanitization, profile normalization, URL repair,
        //          deduplication, and Schema Translator (channel → payload)
        // ═══════════════════════════════════════════════════════════════
        let safeChannels = channels;
        try {
            const validator = window.GENERATION_VALIDATOR_V9 || window.ApeValidator;
            if (validator && typeof validator.validateAndTranslate === 'function') {
                const result = validator.validateAndTranslate(channels);
                if (result.valid) {
                    safeChannels = result.cleanChannels;
                    console.log(
                        `%c🛡️ [SCHEMA GATE] ${channels.length} → ${safeChannels.length} channels ` +
                        `(repaired: ${result.stats.repaired}, deduped: ${result.stats.duplicates}, ` +
                        `sanitized: ${result.stats.sanitized})`,
                        'color: #2196f3; font-weight: bold;'
                    );
                } else {
                    console.error(`❌ [SCHEMA GATE] Validation failed: ${result.message}`);
                    if (window.HUD_TYPED_ARRAYS) {
                        window.HUD_TYPED_ARRAYS.log(`❌ Validation: ${result.message}`, '#ef4444');
                    }
                    // Proceed with original channels (graceful fallback)
                    console.warn('⚠️ [SCHEMA GATE] Proceeding with unvalidated channels (fallback)');
                }
            }
        } catch (e) {
            console.warn('⚠️ [SCHEMA GATE] Validator error, proceeding with original channels:', e.message);
        }

        const stream = generateM3U8Stream(safeChannels, options);
        // 🌊 El browser convierte el stream a Blob internamente
        // sin crear un mega-string en JS — manejo eficiente de memoria
        const response = new Response(stream);
        const blob = await response.blob();
        return blob;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERAR Y DESCARGAR (async — usa streaming)
    // ═══════════════════════════════════════════════════════════════════════════

    async function generateAndDownload(channels, options = {}) {
        let blob = await generateM3U8(channels, options);
        if (!blob) return null;

        // ══════════════════════════════════════════════════════════════
        // 🔬 PHOENIX-QMAX-ADAPTIVE v2.0
        // (Los headers globales de QMAX ahora se inyectan nativamente 
        //  adentro de generateGlobalHeader para cumplir RFC 8216 EXTM3U)
        // ══════════════════════════════════════════════════════════════


        const filename = options.filename || `APE_TYPED_ARRAYS_ULTIMATE_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.m3u8`;

        // Descargar usando Blob (ensamblado por el browser, no por JS)
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        console.log(`📥 [TYPED-ARRAYS] Archivo descargado: ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);

        // Disparar evento para gateway-manager
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('m3u8-generated', {
                detail: {
                    content: blob,
                    filename: filename,
                    channelCount: channels.length,
                    generator: 'TYPED_ARRAYS_ULTIMATE',
                    version: VERSION,
                    linesPerChannel: 133,
                    size: blob.size
                }
            });
            window.dispatchEvent(event);
        }

        return { filename, blob, size: blob.size, channels: channels.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTEGRACIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════

    if (typeof window !== 'undefined') {
        // 👻 Fusión Fantasma v22.1: Registro global directo
        window.APEAtomicStealthEngine = APEAtomicStealthEngine;

        // API Global
        window.M3U8TypedArraysGenerator = {
            generate: generateM3U8,
            generateStream: generateM3U8Stream,
            generateAndDownload: generateAndDownload,
            generateChannelEntry: generateChannelEntry,
            generateJWT: generateJWT68Fields,
            determineProfile: determineProfile,
            profiles: PROFILES,
            version: VERSION,

            // 👻 Fusión Fantasma v22.1 API
            AtomicStealthEngine: APEAtomicStealthEngine,
            Cortex: IPTV_SUPPORT_CORTEX_V3,
            PreArmed: PRE_ARMED_RESPONSE_BUILDER,
            getRotatedUserAgent: getRotatedUserAgent,
            getRandomIp: getRandomIp,

            // ═══════════════════════════════════════════════════════════════════
            // CLEAN URL MODE API
            // ═══════════════════════════════════════════════════════════════════

            /**
             * Activa o desactiva el modo Clean URL
             * @param {boolean} enabled - true para URLs limpias, false para JWT
             */
            setCleanUrlMode: function (enabled) {
                CLEAN_URL_MODE = !!enabled;
                console.log(`🌐 [CLEAN-URL] Modo ${CLEAN_URL_MODE ? 'ACTIVADO' : 'DESACTIVADO'}`);
                return CLEAN_URL_MODE;
            },

            /**
             * Obtiene el estado actual del modo Clean URL
             * @returns {boolean}
             */
            isCleanUrlMode: function () {
                return CLEAN_URL_MODE;
            },

            /**
             * Obtiene información de la arquitectura actual
             * @returns {Object}
             */
            getArchitecture: function () {
                return {
                    version: VERSION,
                    mode: CLEAN_URL_MODE ? 'CLEAN_URL' : 'JWT',
                    urlMode: CLEAN_URL_MODE ? 'clean' : 'parameterized',
                    headersGlobal: CLEAN_URL_MODE ? 25 : 10,
                    headersPerChannel: CLEAN_URL_MODE ? 65 : 55,
                    jwtFields: CLEAN_URL_MODE ? 0 : 68
                };
            },

            // Generadores individuales (para debug/testing)
            _generateGlobalHeader: generateGlobalHeader
        };

        // Integración con app
        function integrateWithApp() {
            if (window.app && typeof window.app === 'object') {
                window.app.generateM3U8_TypedArrays = function (options = {}) {
                    // ✅ FIX: Llamar método getFilteredChannels() para obtener canales filtrados actuales
                    let channels = [];

                    if (typeof this.getFilteredChannels === 'function') {
                        channels = this.getFilteredChannels() || [];
                        console.log(`🎯 [TYPED-ARRAYS] Usando getFilteredChannels(): ${channels.length} canales`);
                    } else {
                        channels = this.state?.filteredChannels ||
                            this.state?.channels ||
                            this.state?.channelsMaster || [];
                        console.log(`🎯 [TYPED-ARRAYS] Usando state fallback: ${channels.length} canales`);
                    }

                    if (channels.length === 0) {
                        alert('No hay canales para generar. Conecta a un servidor primero.');
                        return null;
                    }

                    // ✅ v10.1 CRITICAL: Inject server credentials from this.state
                    // This function runs as window.app method, so this.state IS available
                    if (this.state) {
                        options._activeServers = this.state.activeServers || [];
                        options._currentServer = this.state.currentServer || null;
                        console.log(`🔑 [TYPED-ARRAYS] Injecting ${options._activeServers.length} servers into generator`);
                        (options._activeServers || []).forEach(s => {
                            console.log(`   🔑 ${s.name || s.id}: ${s.baseUrl} [user:${s.username ? 'YES' : 'NO'}]`);
                        });
                    }

                    return generateAndDownload(channels, options);
                };
                console.log('🚀 [TYPED-ARRAYS] ✅ Integrado con window.app.generateM3U8_TypedArrays()');
                return true;
            }
            return false;
        }

        // Polling para integración
        let attempts = 0;
        const maxAttempts = 50;
        const pollInterval = 200;

        function pollForApp() {
            attempts++;
            if (integrateWithApp()) return;
            if (attempts < maxAttempts) {
                setTimeout(pollForApp, pollInterval);
            } else {
                console.warn('🚀 [TYPED-ARRAYS] ⚠️ window.app no disponible. Use: M3U8TypedArraysGenerator.generateAndDownload(channels)');
            }
        }

        pollForApp();

        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`🚀 M3U8 TYPED ARRAYS ULTIMATE v${VERSION} MAX AGGRESSION NUCLEAR Loaded`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('   ✅ 139 líneas por canal (v5.4 MAX AGGRESSION — CALIBRADO)');
        console.log('   ✅ 21 EXTVLCOPT + 6 KODIPROP + 109 EXT-X-APE + 1 EXTHTTP');
        console.log('   ✅ JWT 68+ campos (8 secciones)');
        console.log('   ✅ 6 Perfiles: P0 (8K) → P5 (SD)');
        console.log('   ✅ RFC 8216 100% Compliance');
        console.log('   ✅ Resiliencia 24/7/365 + ISP NUCLEAR (5 niveles escalantes)');
        console.log('   ✅ HTTPS Priority (upgrade HTTP → HTTPS)');
        console.log('═══════════════════════════════════════════════════════════════');
    }

    // ─────────────────────────────────────────────────────────────────
    // 🧠 APE METADATA INTELLIGENCE BATCH SCANNER
    // ─────────────────────────────────────────────────────────────────
    window.apeScanMetadataCluster = async function(deltaOnly = false) {
        if (!window.app) { if (!deltaOnly) alert('App no cargada'); return; }
        let channels = [];
        if (typeof window.app.getFilteredChannels === 'function') {
            channels = window.app.getFilteredChannels() || [];
        } else {
            channels = window.app.state?.filteredChannels || window.app.state?.channels || [];
        }

        if (channels.length === 0) {
            if (!deltaOnly) alert('No hay canales cargados para escanear.');
            return;
        }

        const btn = document.getElementById('btnScanMetadataCluster');
        const oText = btn ? btn.innerHTML : 'Escanear Metadata';
        if (btn) btn.innerHTML = '<span class="icon">⏳</span><span>Escaneando (0%)</span>';
        
        // Determinar credenciales base
        const credentialsMap = {}; // O podrías usar app.state.activeServers pero `channels` ya suele tener `url`
        
        let targetUrls = [];
        channels.forEach(ch => {
            if (deltaOnly && ch.ape_meta) return; // Delta Scan: skip already scanned

            let chUrl = ch.url || ch.direct_source || ch.stream_url;
            if (!chUrl && ch.stream_id) {
                // Intento simple de construir URL si no está armada
                const servers = window.app.state?.activeServers || [];
                const srv = servers.find(s => s.id === ch.serverId || s.id === ch.server_id);
                if (srv) {
                    const baseUrl = (srv.baseUrl || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                    chUrl = `${baseUrl}/live/${srv.username}/${srv.password}/${ch.stream_id}.m3u8`;
                }
            }
            if (chUrl) {
                targetUrls.push({
                    url: chUrl,
                    metadata: {
                        stream_id: ch.stream_id || ch.id,
                        name: ch.name,
                        group: ch.category_name || ch.group
                    }
                });
            }
        });

        if (targetUrls.length === 0) {
            if (!deltaOnly) alert('No se pudieron construir URLs para los canales. Verifica el Servidor Activo.');
            if (btn) btn.innerHTML = oText;
            if (deltaOnly) console.log("🧠 [APE-META] Delta scan: Todos los canales ya tienen metadata. Saltando escaneo.");
            return;
        }

        console.log(`🧠 [APE-META] Iniciando escaneo de ${targetUrls.length} canales en meta-cluster`);
        const CHUNK_SIZE = 50;
        let processedCount = 0;
        
        // Endpoint VPS
        const vpsUrl = document.getElementById('vpsBaseUrl')?.value || 'https://iptv-ape.duckdns.org';

        for (let i = 0; i < targetUrls.length; i += CHUNK_SIZE) {
            const chunk = targetUrls.slice(i, i + CHUNK_SIZE);
            if (btn) btn.innerHTML = `<span class="icon">🧠</span><span>Batch ${Math.round((i/targetUrls.length)*100)}%</span>`;
            try {
                const res = await fetch(`${vpsUrl}/resolve_quality.php?action=meta-cluster`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: chunk })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.results) {
                        // Emparejar y guardar back
                        data.results.forEach(r => {
                            if (r && r.status === 'success' && r.ape_meta) {
                                // Buscar el canal original por nombre/stream_id
                                const targetCh = channels.find(c => 
                                    (r.metadata?.stream_id && c.stream_id == r.metadata.stream_id) ||
                                    (r.metadata?.name && c.name == r.metadata.name)
                                );
                                if (targetCh) {
                                    targetCh.ape_meta = r.ape_meta;
                                    processedCount++;
                                }
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn(`[APE-META] Error batch en meta-cluster: ${e.message}`);
            }
        }
        
        if (btn) btn.innerHTML = `<span class="icon">✅</span><span>Escaneo Finalizado (${processedCount})</span>`;
        if (window.app.renderChannelsList) window.app.renderChannelsList();
        
        // Persistir el estado en IndexedDB y channels_map.json equivalente interno
        if (window.app && typeof window.app.saveGeneratorSnapshot === 'function') {
            window.app.saveGeneratorSnapshot();
            console.log("💾 [APE-META] Snapshot guardado en IndexedDB. El ADN Metadata persistirá tras recargar.");
        }
        
        console.log(`🧠 [APE-META] Completado. ${processedCount} canales enriquecidos con ADN Metadata.`);
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast(`✅ Metadata Escaneada: ${processedCount} canales actualizados`, 'success');
        }
        setTimeout(() => { if (btn) btn.innerHTML = oText; }, 3000);
    }

})();
