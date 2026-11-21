/**
 * ╔═══════════════════════════════════════════════════════════════════════════════════╗
 * ║           APE M3U8 GENERATOR INTEGRATION v1.0.0 - INTEGRACIÓN COMPLETA           ║
 * ║                     Para IPTV Navigator PRO + Hetzner VPS                        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════════╣
 * ║  Módulo que integra el generador M3U8 de la App con el Motor ABR del VPS.        ║
 * ║  Genera listas SUPREMAS con headers de máxima calidad y decisiones dinámicas.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════╝
 * 
 * INSTRUCCIONES DE INTEGRACIÓN:
 * 1. Incluir este archivo en tu proyecto IPTV Navigator PRO
 * 2. Incluir también ape-vps-sync.js
 * 3. Llamar a APE_M3U8_GENERATOR.init() al inicio
 * 4. Usar APE_M3U8_GENERATOR.generateSupremeList(channels) para generar listas
 */

const APE_M3U8_GENERATOR = (function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const CONFIG = {
        VERSION: '9.0',
        GENERATOR_NAME: 'APE ULTIMATE',
        VPS_BASE_URL: 'https://iptv-ape.duckdns.org',
        
        // Configuración de generación
        INCLUDE_VLC_OPTIONS: true,
        INCLUDE_KODI_PROPS: true,
        INCLUDE_APE_METADATA: true,
        INCLUDE_HEADERS_IN_URL: true,
        
        // Formato de salida
        OUTPUT_FORMAT: 'm3u8_extended',  // 'm3u8_extended' | 'm3u8_standard' | 'json'
        
        // Headers por defecto (se sobrescriben con los del VPS)
        DEFAULT_USER_AGENT: 'APE-Player/9.0 (IPTV Navigator PRO)',
        
        // Timeouts
        VPS_TIMEOUT_MS: 10000,
        
        // Logging
        DEBUG: true
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const Utils = {
        log: function(message, data = null) {
            if (CONFIG.DEBUG) {
                if (data) {
                    console.log(`[APE_M3U8_GEN] ${message}`, data);
                } else {
                    console.log(`[APE_M3U8_GEN] ${message}`);
                }
            }
        },
        
        error: function(message, error = null) {
            console.error(`[APE_M3U8_GEN] ERROR: ${message}`, error || '');
        },
        
        escapeXml: function(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        },
        
        sanitizeChannelName: function(name) {
            if (!name) return 'Unknown';
            return name.replace(/[^\w\s\-\.áéíóúñÁÉÍÓÚÑ]/gi, '').trim();
        },
        
        generateTimestamp: function() {
            return new Date().toISOString().replace(/[:\-]/g, '').split('.')[0];
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // PERFILES LOCALES (fallback si VPS no disponible)
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const LOCAL_PROFILES = {
        P0: { name: 'ULTRA_EXTREME', level: 'L6', quality: '8K/4K ULTRA', resolution: '7680x4320', buffer_ms: 60000, bitrate_mbps: 80, codecs: ['av1', 'hevc', 'h264'] },
        P1: { name: '4K_SUPREME', level: 'L5', quality: '4K HDR', resolution: '3840x2160', buffer_ms: 45000, bitrate_mbps: 45, codecs: ['hevc', 'h264'] },
        P2: { name: '4K_EXTREME', level: 'L4', quality: '4K SDR', resolution: '3840x2160', buffer_ms: 30000, bitrate_mbps: 25, codecs: ['hevc', 'h264'] },
        P3: { name: 'FHD_ADVANCED', level: 'L3', quality: '1080p FHD', resolution: '1920x1080', buffer_ms: 20000, bitrate_mbps: 12, codecs: ['h264', 'hevc'] },
        P4: { name: 'HD_STABLE', level: 'L2', quality: '720p HD', resolution: '1280x720', buffer_ms: 15000, bitrate_mbps: 6, codecs: ['h264'] },
        P5: { name: 'SD_FAILSAFE', level: 'L1', quality: '480p SD', resolution: '854x480', buffer_ms: 10000, bitrate_mbps: 2, codecs: ['h264'] }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // ESTADO
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    let state = {
        initialized: false,
        vpsConnected: false,
        currentProfile: 'P3',
        cachedHeaders: null,
        cachedProfiles: null,
        lastDecision: null
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // VPS CLIENT
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const VPSClient = {
        async request(endpoint, options = {}) {
            const url = `${CONFIG.VPS_BASE_URL}${endpoint}`;
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.VPS_TIMEOUT_MS);
                
                const response = await fetch(url, {
                    method: options.method || 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: options.body ? JSON.stringify(options.body) : undefined,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                Utils.error(`VPS request failed: ${endpoint}`, error);
                throw error;
            }
        },
        
        async checkHealth() {
            try {
                const result = await this.request('/api/health');
                return result.status === 'ok';
            } catch {
                return false;
            }
        },
        
        async getABRDecision(clientCaps) {
            return await this.request('/api/abr-decide', {
                method: 'POST',
                body: clientCaps
            });
        },
        
        async getProfiles() {
            return await this.request('/api/profiles');
        },
        
        async getHeaders() {
            return await this.request('/api/headers');
        },
        
        async generateEntry(channel, profile, clientCaps) {
            return await this.request('/api/generate-m3u8-entry', {
                method: 'POST',
                body: { channel, profile, client_caps: clientCaps }
            });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // GENERADOR DE HEADERS
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const HeadersGenerator = {
        /**
         * Genera headers localmente (fallback)
         */
        generateLocal(profile) {
            const profileData = LOCAL_PROFILES[profile] || LOCAL_PROFILES.P3;
            
            return {
                // Video
                'X-Video-Codecs': profileData.codecs.join(','),
                'X-Preferred-Codec': profileData.codecs[0],
                'X-Preferred-Resolution': profileData.resolution,
                
                // Buffer
                'X-Target-Buffer-Ms': String(profileData.buffer_ms),
                'X-Network-Caching': String(profileData.buffer_ms),
                'X-Live-Caching': String(profileData.buffer_ms),
                
                // ABR
                'X-APE-Profile': profile,
                'X-APE-Profile-Name': profileData.name,
                'X-APE-Level': profileData.level,
                'X-APE-Quality': profileData.quality,
                'X-APE-Bitrate-Mbps': String(profileData.bitrate_mbps),
                
                // Connection
                'X-Keep-Alive': 'true',
                'X-Keep-Alive-Timeout': '120',
                'X-Auto-Reconnect': 'true',
                'X-Max-Reconnect-Attempts': '10',
                
                // Quality
                'X-Quality-Priority': 'quality',
                'X-Bitrate-Mode': 'variable',
                
                // User Agent
                'User-Agent': CONFIG.DEFAULT_USER_AGENT
            };
        },
        
        /**
         * Convierte headers a string para URL
         */
        toUrlString(headers) {
            return Object.entries(headers)
                .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                .join('&');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // GENERADOR M3U8
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    const M3U8Generator = {
        /**
         * Genera el header del archivo M3U8
         */
        generateHeader(options = {}) {
            const {
                profile = state.currentProfile,
                profileName = LOCAL_PROFILES[profile]?.name || 'UNKNOWN',
                quality = LOCAL_PROFILES[profile]?.quality || 'FHD',
                resolution = LOCAL_PROFILES[profile]?.resolution || '1920x1080',
                channelsCount = 0,
                headersCount = 0
            } = options;
            
            const timestamp = Utils.generateTimestamp();
            
            let header = '#EXTM3U\n';
            header += `#EXT-X-APE-VERSION:${CONFIG.VERSION}\n`;
            header += `#EXT-X-APE-GENERATOR:${CONFIG.GENERATOR_NAME}\n`;
            header += `#EXT-X-APE-PROFILE:${profile}\n`;
            header += `#EXT-X-APE-PROFILE-NAME:${profileName}\n`;
            header += `#EXT-X-APE-QUALITY:${quality}\n`;
            header += `#EXT-X-APE-RESOLUTION:${resolution}\n`;
            header += `#EXT-X-APE-CHANNELS-COUNT:${channelsCount}\n`;
            header += `#EXT-X-APE-HEADERS-COUNT:${headersCount}\n`;
            header += `#EXT-X-APE-GENERATED:${new Date().toISOString()}\n`;
            header += `#EXT-X-APE-TIMESTAMP:${timestamp}\n`;
            header += '\n';
            
            return header;
        },
        
        /**
         * Genera una entrada de canal completa
         */
        generateChannelEntry(channel, profile, headers) {
            const {
                id = '',
                name = 'Unknown',
                logo = '',
                group = 'General',
                url = '',
                epg_id = '',
                language = 'es'
            } = channel;
            
            const profileData = LOCAL_PROFILES[profile] || LOCAL_PROFILES.P3;
            const sanitizedName = Utils.sanitizeChannelName(name);
            
            let entry = '';
            
            // ═══════════════════════════════════════════════════════════════════════════
            // EXTINF con atributos completos
            // ═══════════════════════════════════════════════════════════════════════════
            const extinf_attrs = [
                `tvg-id="${Utils.escapeXml(id || epg_id)}"`,
                `tvg-name="${Utils.escapeXml(sanitizedName)}"`,
                `tvg-logo="${Utils.escapeXml(logo)}"`,
                `tvg-language="${language}"`,
                `group-title="${Utils.escapeXml(group)}"`,
                `ape-profile="${profile}"`,
                `ape-level="${profileData.level}"`,
                `ape-quality="${profileData.quality}"`
            ];
            
            entry += `#EXTINF:-1 ${extinf_attrs.join(' ')},${sanitizedName}\n`;
            
            // ═══════════════════════════════════════════════════════════════════════════
            // VLC Options (Capa de Motor)
            // ═══════════════════════════════════════════════════════════════════════════
            if (CONFIG.INCLUDE_VLC_OPTIONS) {
                entry += `#EXTVLCOPT:http-user-agent=${CONFIG.DEFAULT_USER_AGENT}\n`;
                entry += `#EXTVLCOPT:network-caching=${profileData.buffer_ms}\n`;
                entry += `#EXTVLCOPT:live-caching=${profileData.buffer_ms}\n`;
                entry += `#EXTVLCOPT:file-caching=${profileData.buffer_ms}\n`;
                entry += `#EXTVLCOPT:http-reconnect=true\n`;
                entry += `#EXTVLCOPT:http-continuous=true\n`;
            }
            
            // ═══════════════════════════════════════════════════════════════════════════
            // Kodi Properties
            // ═══════════════════════════════════════════════════════════════════════════
            if (CONFIG.INCLUDE_KODI_PROPS) {
                entry += `#KODIPROP:inputstream.adaptive.manifest_type=hls\n`;
                entry += `#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive\n`;
                entry += `#KODIPROP:inputstream.adaptive.chooser_resolution_max=${profileData.resolution}\n`;
            }
            
            // ═══════════════════════════════════════════════════════════════════════════
            // APE Metadata
            // ═══════════════════════════════════════════════════════════════════════════
            if (CONFIG.INCLUDE_APE_METADATA) {
                entry += `#EXT-X-APE-PROFILE:${profile}\n`;
                entry += `#EXT-X-APE-PROFILE-NAME:${profileData.name}\n`;
                entry += `#EXT-X-APE-LEVEL:${profileData.level}\n`;
                entry += `#EXT-X-APE-QUALITY:${profileData.quality}\n`;
                entry += `#EXT-X-APE-BUFFER:${profileData.buffer_ms}\n`;
                entry += `#EXT-X-APE-RESOLUTION:${profileData.resolution}\n`;
                entry += `#EXT-X-APE-BITRATE:${profileData.bitrate_mbps}\n`;
                entry += `#EXT-X-APE-CODECS:${profileData.codecs.join(',')}\n`;
            }
            
            // ═══════════════════════════════════════════════════════════════════════════
            // URL con Headers (Payload Híbrido)
            // ═══════════════════════════════════════════════════════════════════════════
            if (CONFIG.INCLUDE_HEADERS_IN_URL && headers && Object.keys(headers).length > 0) {
                const headersStr = HeadersGenerator.toUrlString(headers);
                entry += `${url}|${headersStr}\n`;
            } else {
                entry += `${url}\n`;
            }
            
            return entry;
        },
        
        /**
         * Genera lista M3U8 completa
         */
        async generateList(channels, options = {}) {
            const {
                profile = 'auto',
                syncToVPS = true,
                listName = `APE_SUPREME_${Utils.generateTimestamp()}`
            } = options;
            
            Utils.log(`Generando lista con ${channels.length} canales...`);
            
            let selectedProfile = profile;
            let headers = null;
            
            // ═══════════════════════════════════════════════════════════════════════════
            // Obtener decisión ABR del VPS si está disponible
            // ═══════════════════════════════════════════════════════════════════════════
            if (state.vpsConnected && profile === 'auto') {
                try {
                    // Detectar capacidades del cliente
                    let clientCaps = {};
                    if (typeof APE_VPS_SYNC !== 'undefined') {
                        clientCaps = await APE_VPS_SYNC.detectCapabilities();
                    }
                    
                    const decision = await VPSClient.getABRDecision(clientCaps);
                    selectedProfile = decision.decision.profile;
                    headers = decision.headers;
                    state.lastDecision = decision;
                    
                    Utils.log(`ABR Decision: ${selectedProfile} (score: ${decision.decision.score})`);
                } catch (error) {
                    Utils.error('Error obteniendo decisión ABR, usando fallback', error);
                    selectedProfile = 'P3';
                }
            }
            
            // Usar headers locales si no tenemos del VPS
            if (!headers) {
                headers = HeadersGenerator.generateLocal(selectedProfile);
            }
            
            state.currentProfile = selectedProfile;
            state.cachedHeaders = headers;
            
            const profileData = LOCAL_PROFILES[selectedProfile] || LOCAL_PROFILES.P3;
            
            // ═══════════════════════════════════════════════════════════════════════════
            // Generar contenido M3U8
            // ═══════════════════════════════════════════════════════════════════════════
            let m3u8Content = this.generateHeader({
                profile: selectedProfile,
                profileName: profileData.name,
                quality: profileData.quality,
                resolution: profileData.resolution,
                channelsCount: channels.length,
                headersCount: Object.keys(headers).length
            });
            
            // Generar entrada para cada canal
            for (const channel of channels) {
                const entry = this.generateChannelEntry(channel, selectedProfile, headers);
                m3u8Content += entry + '\n';
            }
            
            // ═══════════════════════════════════════════════════════════════════════════
            // Sincronizar al VPS si está habilitado
            // ═══════════════════════════════════════════════════════════════════════════
            if (syncToVPS && state.vpsConnected) {
                try {
                    if (typeof APE_VPS_SYNC !== 'undefined') {
                        await APE_VPS_SYNC.syncList(listName, m3u8Content, {
                            profile: selectedProfile,
                            channels_count: channels.length,
                            headers_count: Object.keys(headers).length
                        });
                        Utils.log(`Lista sincronizada al VPS: ${listName}`);
                    }
                } catch (error) {
                    Utils.error('Error sincronizando lista al VPS', error);
                }
            }
            
            return {
                content: m3u8Content,
                name: listName,
                profile: selectedProfile,
                profile_name: profileData.name,
                quality: profileData.quality,
                resolution: profileData.resolution,
                channels_count: channels.length,
                headers_count: Object.keys(headers).length,
                headers: headers,
                size_bytes: new Blob([m3u8Content]).size,
                generated_at: new Date().toISOString()
            };
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════════════════
    
    return {
        CONFIG: CONFIG,
        
        /**
         * Inicializa el generador y verifica conexión con VPS
         */
        init: async function() {
            Utils.log('Inicializando APE M3U8 Generator v' + CONFIG.VERSION);
            
            // Verificar conexión con VPS
            state.vpsConnected = await VPSClient.checkHealth();
            
            if (state.vpsConnected) {
                Utils.log('✅ VPS conectado');
                
                // Cargar perfiles y headers del VPS
                try {
                    const profiles = await VPSClient.getProfiles();
                    state.cachedProfiles = profiles.profiles;
                    Utils.log(`Perfiles cargados: ${profiles.count}`);
                    
                    const headers = await VPSClient.getHeaders();
                    Utils.log(`Headers disponibles: ${headers.count}`);
                } catch (error) {
                    Utils.error('Error cargando datos del VPS', error);
                }
            } else {
                Utils.log('⚠️ VPS no disponible, usando modo offline');
            }
            
            state.initialized = true;
            
            return {
                success: true,
                vps_connected: state.vpsConnected,
                version: CONFIG.VERSION
            };
        },
        
        /**
         * Genera lista M3U8 SUPREMA con ABR dinámico
         */
        generateSupremeList: async function(channels, options = {}) {
            if (!state.initialized) {
                await this.init();
            }
            
            return await M3U8Generator.generateList(channels, options);
        },
        
        /**
         * Genera entrada individual para un canal
         */
        generateChannelEntry: function(channel, profile = null, headers = null) {
            const useProfile = profile || state.currentProfile || 'P3';
            const useHeaders = headers || state.cachedHeaders || HeadersGenerator.generateLocal(useProfile);
            
            return M3U8Generator.generateChannelEntry(channel, useProfile, useHeaders);
        },
        
        /**
         * Obtiene headers optimizados para un perfil
         */
        getHeaders: function(profile = null) {
            const useProfile = profile || state.currentProfile || 'P3';
            
            if (state.cachedHeaders && !profile) {
                return state.cachedHeaders;
            }
            
            return HeadersGenerator.generateLocal(useProfile);
        },
        
        /**
         * Obtiene la última decisión ABR
         */
        getLastDecision: function() {
            return state.lastDecision;
        },
        
        /**
         * Obtiene el estado actual
         */
        getState: function() {
            return { ...state };
        },
        
        /**
         * Cambia el perfil manualmente
         */
        setProfile: function(profile) {
            if (LOCAL_PROFILES[profile]) {
                state.currentProfile = profile;
                state.cachedHeaders = HeadersGenerator.generateLocal(profile);
                Utils.log(`Perfil cambiado a: ${profile}`);
                return true;
            }
            return false;
        },
        
        /**
         * Descarga la lista generada como archivo
         */
        downloadList: function(listResult, filename = null) {
            const name = filename || `${listResult.name}.m3u8`;
            const blob = new Blob([listResult.content], { type: 'application/x-mpegurl' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            Utils.log(`Lista descargada: ${name}`);
        },
        
        /**
         * Versión del generador
         */
        version: CONFIG.VERSION
    };
})();

// Exportar para Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APE_M3U8_GENERATOR;
}

// Auto-registrar en window
if (typeof window !== 'undefined') {
    window.APE_M3U8_GENERATOR = APE_M3U8_GENERATOR;
    console.log('[APE_M3U8_GENERATOR] Módulo cargado. Usa APE_M3U8_GENERATOR.init() para comenzar.');
}
