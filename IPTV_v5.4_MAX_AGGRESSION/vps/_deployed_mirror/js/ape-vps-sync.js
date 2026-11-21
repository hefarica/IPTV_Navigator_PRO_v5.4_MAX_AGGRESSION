/**
 * ╔═══════════════════════════════════════════════════════════════════════════════════╗
 * ║                    APE VPS SYNC v1.0.0 - MÓDULO DE SINCRONIZACIÓN                ║
 * ║                     Para IPTV Navigator PRO + Hetzner VPS                        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════════╣
 * ║  Módulo que sincroniza perfiles, headers y listas M3U8 entre la App y el VPS.    ║
 * ║  Integra el Motor ABR del servidor para decisiones de calidad dinámicas.         ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════╝
 */

const APE_VPS_SYNC = (function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const CONFIG = {
        VPS_BASE_URL: 'https://iptv-ape.duckdns.org',
        API_ENDPOINTS: {
            ABR_DECIDE: '/api/abr-decide',
            SYNC_PROFILES: '/api/sync-profiles',
            SYNC_LIST: '/api/sync-list',
            GET_OPTIMIZED_URL: '/api/get-optimized-url',
            GENERATE_M3U8_ENTRY: '/api/generate-m3u8-entry',
            ABR_PROFILES: '/api/abr-profiles',
            ABR_HEADERS: '/api/abr-headers',
            ABR_STATUS: '/api/abr-status',
            HEALTH: '/api/health'
        },
        TIMEOUT_MS: 10000,
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY_MS: 1000
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // DETECCIÓN DE CAPACIDADES DEL CLIENTE
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const ClientCapabilities = {
        /**
         * Detecta todas las capacidades del dispositivo/navegador actual
         */
        detect: async function() {
            const caps = {
                bandwidth_mbps: await this.estimateBandwidth(),
                screen_resolution: this.getScreenResolution(),
                video_codecs: this.getSupportedCodecs(),
                hdr_support: this.getHDRSupport(),
                network_type: this.getNetworkType(),
                device_type: this.getDeviceType(),
                quality_preference: 'high',
                timestamp: new Date().toISOString()
            };
            
            console.log('[APE_VPS_SYNC] Capacidades detectadas:', caps);
            return caps;
        },

        /**
         * Estima el ancho de banda disponible
         */
        estimateBandwidth: async function() {
            // Usar Network Information API si está disponible
            if (navigator.connection) {
                const conn = navigator.connection;
                if (conn.downlink) {
                    return conn.downlink; // Ya en Mbps
                }
            }
            
            // Fallback: test de velocidad básico
            try {
                const testUrl = `${CONFIG.VPS_BASE_URL}/api/health?t=${Date.now()}`;
                const startTime = performance.now();
                const response = await fetch(testUrl);
                const data = await response.text();
                const endTime = performance.now();
                
                const durationSec = (endTime - startTime) / 1000;
                const sizeBytes = new Blob([data]).size;
                const bitsPerSec = (sizeBytes * 8) / durationSec;
                const mbps = bitsPerSec / 1000000;
                
                // Multiplicar por factor de corrección (test pequeño)
                return Math.min(mbps * 50, 100);
            } catch (e) {
                console.warn('[APE_VPS_SYNC] Error estimando bandwidth:', e);
                return 25; // Default 25 Mbps
            }
        },

        /**
         * Obtiene la resolución de pantalla
         */
        getScreenResolution: function() {
            const width = window.screen.width * (window.devicePixelRatio || 1);
            const height = window.screen.height * (window.devicePixelRatio || 1);
            return `${Math.round(width)}x${Math.round(height)}`;
        },

        /**
         * Detecta codecs de video soportados
         */
        getSupportedCodecs: function() {
            const codecs = [];
            const video = document.createElement('video');
            
            const codecTests = {
                'h264': 'video/mp4; codecs="avc1.42E01E"',
                'hevc': 'video/mp4; codecs="hvc1.1.6.L93.B0"',
                'av1': 'video/mp4; codecs="av01.0.05M.08"',
                'vp9': 'video/webm; codecs="vp9"'
            };
            
            for (const [codec, mimeType] of Object.entries(codecTests)) {
                if (video.canPlayType(mimeType) !== '') {
                    codecs.push(codec);
                }
            }
            
            return codecs.length > 0 ? codecs : ['h264'];
        },

        /**
         * Detecta soporte HDR
         */
        getHDRSupport: function() {
            const hdr = [];
            
            if (window.matchMedia) {
                if (window.matchMedia('(dynamic-range: high)').matches) {
                    hdr.push('hdr10');
                }
                if (window.matchMedia('(color-gamut: p3)').matches) {
                    hdr.push('p3');
                }
                if (window.matchMedia('(color-gamut: rec2020)').matches) {
                    hdr.push('rec2020');
                }
            }
            
            // Verificar HDR en video
            const video = document.createElement('video');
            if (video.canPlayType('video/mp4; codecs="hvc1.2.4.L153.B0"') !== '') {
                hdr.push('dolby-vision');
            }
            
            return hdr;
        },

        /**
         * Detecta tipo de red
         */
        getNetworkType: function() {
            if (navigator.connection) {
                const type = navigator.connection.effectiveType;
                const typeMap = {
                    'slow-2g': '2g',
                    '2g': '2g',
                    '3g': '3g',
                    '4g': '4g'
                };
                
                if (navigator.connection.type === 'wifi') return 'wifi';
                if (navigator.connection.type === 'ethernet') return 'ethernet';
                
                return typeMap[type] || 'unknown';
            }
            return 'unknown';
        },

        /**
         * Detecta tipo de dispositivo
         */
        getDeviceType: function() {
            const ua = navigator.userAgent.toLowerCase();
            
            if (ua.includes('smart-tv') || ua.includes('smarttv') || ua.includes('tizen') || ua.includes('webos')) {
                return 'smart-tv';
            }
            if (ua.includes('android tv') || ua.includes('androidtv')) {
                return 'android-tv';
            }
            if (ua.includes('playstation') || ua.includes('xbox')) {
                return 'console';
            }
            if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) {
                return 'mobile';
            }
            if (ua.includes('tablet') || ua.includes('ipad')) {
                return 'tablet';
            }
            
            return 'desktop';
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // API CLIENT
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const APIClient = {
        /**
         * Realiza petición HTTP con reintentos
         */
        request: async function(endpoint, options = {}) {
            const url = `${CONFIG.VPS_BASE_URL}${endpoint}`;
            const defaultOptions = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: CONFIG.TIMEOUT_MS
            };
            
            const fetchOptions = { ...defaultOptions, ...options };
            
            for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
                    
                    const response = await fetch(url, {
                        ...fetchOptions,
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    return await response.json();
                } catch (error) {
                    console.warn(`[APE_VPS_SYNC] Intento ${attempt}/${CONFIG.RETRY_ATTEMPTS} falló:`, error.message);
                    
                    if (attempt < CONFIG.RETRY_ATTEMPTS) {
                        await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS * attempt));
                    } else {
                        throw error;
                    }
                }
            }
        },

        /**
         * GET request
         */
        get: function(endpoint) {
            return this.request(endpoint, { method: 'GET' });
        },

        /**
         * POST request
         */
        post: function(endpoint, data) {
            return this.request(endpoint, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // ABR SYNC FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const ABRSync = {
        /**
         * Obtiene decisión ABR del servidor
         */
        getABRDecision: async function(clientCaps = null) {
            if (!clientCaps) {
                clientCaps = await ClientCapabilities.detect();
            }
            
            const result = await APIClient.post(CONFIG.API_ENDPOINTS.ABR_DECIDE, clientCaps);
            console.log('[APE_VPS_SYNC] Decisión ABR:', result.decision);
            return result;
        },

        /**
         * Sincroniza perfiles al VPS
         */
        syncProfiles: async function(profiles) {
            const result = await APIClient.post(CONFIG.API_ENDPOINTS.SYNC_PROFILES, {
                profiles: profiles
            });
            console.log('[APE_VPS_SYNC] Perfiles sincronizados:', result);
            return result;
        },

        /**
         * Sincroniza lista M3U8 al VPS
         */
        syncList: async function(listName, listContent, config = {}) {
            const result = await APIClient.post(CONFIG.API_ENDPOINTS.SYNC_LIST, {
                name: listName,
                content: listContent,
                config: config
            });
            console.log('[APE_VPS_SYNC] Lista sincronizada:', result);
            return result;
        },

        /**
         * Obtiene URL optimizada con headers
         */
        getOptimizedURL: async function(channelUrl, profile = 'auto', clientCaps = null) {
            if (!clientCaps && profile === 'auto') {
                clientCaps = await ClientCapabilities.detect();
            }
            
            const result = await APIClient.post(CONFIG.API_ENDPOINTS.GET_OPTIMIZED_URL, {
                channel_url: channelUrl,
                profile: profile,
                client_caps: clientCaps || {}
            });
            
            return result;
        },

        /**
         * Genera entrada M3U8 completa para un canal
         */
        generateM3U8Entry: async function(channel, profile = 'auto', clientCaps = null) {
            if (!clientCaps && profile === 'auto') {
                clientCaps = await ClientCapabilities.detect();
            }
            
            const result = await APIClient.post(CONFIG.API_ENDPOINTS.GENERATE_M3U8_ENTRY, {
                channel: channel,
                profile: profile,
                client_caps: clientCaps || {}
            });
            
            return result;
        },

        /**
         * Obtiene perfiles ABR disponibles
         */
        getProfiles: async function() {
            return await APIClient.get(CONFIG.API_ENDPOINTS.ABR_PROFILES);
        },

        /**
         * Obtiene headers de calidad disponibles
         */
        getHeaders: async function() {
            return await APIClient.get(CONFIG.API_ENDPOINTS.ABR_HEADERS);
        },

        /**
         * Obtiene estado del motor ABR
         */
        getStatus: async function() {
            return await APIClient.get(CONFIG.API_ENDPOINTS.ABR_STATUS);
        },

        /**
         * Verifica salud del VPS
         */
        checkHealth: async function() {
            try {
                const result = await APIClient.get(CONFIG.API_ENDPOINTS.HEALTH);
                return { online: true, ...result };
            } catch (e) {
                return { online: false, error: e.message };
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // M3U8 GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const M3U8Generator = {
        /**
         * Genera lista M3U8 completa con ABR del VPS
         */
        generateList: async function(channels, options = {}) {
            const {
                listName = 'APE_GENERATED',
                profile = 'auto',
                syncToVPS = true
            } = options;
            
            // Detectar capacidades si es auto
            let clientCaps = null;
            if (profile === 'auto') {
                clientCaps = await ClientCapabilities.detect();
            }
            
            // Obtener decisión ABR
            const abrDecision = await ABRSync.getABRDecision(clientCaps);
            const selectedProfile = abrDecision.decision.profile;
            const headers = abrDecision.headers;
            
            // Construir lista
            let m3u8Content = '#EXTM3U\n';
            m3u8Content += `#EXT-X-APE-VERSION:9.0\n`;
            m3u8Content += `#EXT-X-APE-PROFILE:${selectedProfile}\n`;
            m3u8Content += `#EXT-X-APE-PROFILE-NAME:${abrDecision.decision.profile_name}\n`;
            m3u8Content += `#EXT-X-APE-QUALITY:${abrDecision.decision.quality}\n`;
            m3u8Content += `#EXT-X-APE-RESOLUTION:${abrDecision.decision.resolution}\n`;
            m3u8Content += `#EXT-X-APE-GENERATED:${new Date().toISOString()}\n`;
            m3u8Content += `#EXT-X-APE-HEADERS-COUNT:${Object.keys(headers).length}\n\n`;
            
            // Agregar cada canal
            for (const channel of channels) {
                const entry = await this.generateChannelEntry(channel, selectedProfile, headers);
                m3u8Content += entry + '\n\n';
            }
            
            // Sincronizar al VPS si está habilitado
            if (syncToVPS) {
                try {
                    await ABRSync.syncList(listName, m3u8Content, {
                        profile: selectedProfile,
                        channels_count: channels.length,
                        generated_at: new Date().toISOString()
                    });
                } catch (e) {
                    console.warn('[APE_VPS_SYNC] Error sincronizando lista:', e);
                }
            }
            
            return {
                content: m3u8Content,
                profile: selectedProfile,
                profile_name: abrDecision.decision.profile_name,
                channels_count: channels.length,
                headers_count: Object.keys(headers).length
            };
        },

        /**
         * Genera entrada para un canal individual
         */
        generateChannelEntry: async function(channel, profile, headers) {
            const {
                id = '',
                name = 'Unknown',
                logo = '',
                group = 'General',
                url = ''
            } = channel;
            
            // Obtener perfil del VPS
            let profileData;
            try {
                const profiles = await ABRSync.getProfiles();
                profileData = profiles.profiles[profile] || profiles.profiles['P3'];
            } catch (e) {
                profileData = {
                    name: profile,
                    level: 'L3',
                    quality: 'FHD',
                    buffer_ms: 20000,
                    network_caching_ms: 20000,
                    live_caching_ms: 20000
                };
            }
            
            let entry = '';
            
            // EXTINF
            entry += `#EXTINF:-1 tvg-id="${id}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}" ape-profile="${profile}",${name}\n`;
            
            // VLC Options
            entry += `#EXTVLCOPT:http-user-agent=APE-Player/9.0\n`;
            entry += `#EXTVLCOPT:network-caching=${profileData.network_caching_ms || 20000}\n`;
            entry += `#EXTVLCOPT:live-caching=${profileData.live_caching_ms || 20000}\n`;
            entry += `#EXTVLCOPT:http-reconnect=true\n`;
            entry += `#EXTVLCOPT:http-continuous=true\n`;
            
            // Kodi Props
            entry += `#KODIPROP:inputstream.adaptive.manifest_type=hls\n`;
            entry += `#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive\n`;
            
            // APE Metadata
            entry += `#EXT-X-APE-PROFILE:${profile}\n`;
            entry += `#EXT-X-APE-LEVEL:${profileData.level || 'L3'}\n`;
            entry += `#EXT-X-APE-QUALITY:${profileData.quality || 'FHD'}\n`;
            entry += `#EXT-X-APE-BUFFER:${profileData.buffer_ms || 20000}\n`;
            
            // URL con headers
            const headersStr = Object.entries(headers)
                .map(([k, v]) => `${k}=${v}`)
                .join('&');
            entry += `${url}|${headersStr}`;
            
            return entry;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    return {
        // Configuración
        CONFIG: CONFIG,
        
        // Detección de capacidades
        detectCapabilities: ClientCapabilities.detect.bind(ClientCapabilities),
        
        // ABR Sync
        getABRDecision: ABRSync.getABRDecision.bind(ABRSync),
        syncProfiles: ABRSync.syncProfiles.bind(ABRSync),
        syncList: ABRSync.syncList.bind(ABRSync),
        getOptimizedURL: ABRSync.getOptimizedURL.bind(ABRSync),
        generateM3U8Entry: ABRSync.generateM3U8Entry.bind(ABRSync),
        getProfiles: ABRSync.getProfiles.bind(ABRSync),
        getHeaders: ABRSync.getHeaders.bind(ABRSync),
        getStatus: ABRSync.getStatus.bind(ABRSync),
        checkHealth: ABRSync.checkHealth.bind(ABRSync),
        
        // M3U8 Generator
        generateList: M3U8Generator.generateList.bind(M3U8Generator),
        generateChannelEntry: M3U8Generator.generateChannelEntry.bind(M3U8Generator),
        
        // Utilidades
        version: '1.0.0',
        
        /**
         * Inicializa el módulo y verifica conexión con VPS
         */
        init: async function() {
            console.log('[APE_VPS_SYNC] Inicializando v' + this.version);
            
            const health = await this.checkHealth();
            if (health.online) {
                console.log('[APE_VPS_SYNC] ✅ VPS conectado');
                
                const status = await this.getStatus();
                console.log('[APE_VPS_SYNC] Motor ABR:', status.engine);
                console.log('[APE_VPS_SYNC] Perfiles:', status.profiles.count);
                console.log('[APE_VPS_SYNC] Headers:', status.headers.total);
                
                return { success: true, status: status };
            } else {
                console.error('[APE_VPS_SYNC] ❌ VPS no disponible:', health.error);
                return { success: false, error: health.error };
            }
        },

        /**
         * Flujo completo: detectar → decidir → generar URL optimizada
         */
        getOptimalStream: async function(channelUrl) {
            // 1. Detectar capacidades
            const caps = await this.detectCapabilities();
            
            // 2. Obtener decisión ABR
            const decision = await this.getABRDecision(caps);
            
            // 3. Generar URL optimizada
            const optimized = await this.getOptimizedURL(channelUrl, decision.decision.profile, caps);
            
            return {
                original_url: channelUrl,
                optimized_url: optimized.optimized_url,
                profile: decision.decision.profile,
                profile_name: decision.decision.profile_name,
                quality: decision.decision.quality,
                resolution: decision.decision.resolution,
                score: decision.decision.score,
                headers_count: optimized.headers_count,
                client_capabilities: caps
            };
        }
    };
})();

// Exportar para Node.js si está disponible
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APE_VPS_SYNC;
}

// Auto-inicializar si está en navegador
if (typeof window !== 'undefined') {
    window.APE_VPS_SYNC = APE_VPS_SYNC;
    console.log('[APE_VPS_SYNC] Módulo cargado. Usa APE_VPS_SYNC.init() para comenzar.');
}
