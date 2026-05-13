/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📺 M3U8 GENERATOR v15.0 - 3 CAPAS (RFC 8216 COMPATIBLE)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ARQUITECTURA DE 3 CAPAS:
 * - Capa 1: Cabecera global con metadatos APE
 * - Capa 2: JWT con todos los headers (en URL como parámetro)
 * - Capa 3: EXTINF limpio → URL directa (sin metadatos intermedios)
 * 
 * COMPATIBILIDAD: RFC 8216 (HLS Estándar)
 * - OTT Navigator, VLC, Kodi, Tivimate, IPTV Smarters, etc.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '15.0.0-3LAYER';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN DE PERFILES
    // ═══════════════════════════════════════════════════════════════════════

    const PROFILES = {
        P0: { name: 'ULTRA_EXTREME', quality: 'ULTRA', buffer: 8000, resolution: '3840x2160' },
        P1: { name: '8K_SUPREME', quality: '8K', buffer: 5000, resolution: '7680x4320' },
        P2: { name: '4K_EXTREME', quality: '4K', buffer: 3000, resolution: '3840x2160' },
        P3: { name: 'FHD_ADVANCED', quality: 'FHD', buffer: 2000, resolution: '1920x1080' },
        P4: { name: 'HD_STABLE', quality: 'HD', buffer: 1500, resolution: '1280x720' },
        P5: { name: 'SD_FAILSAFE', quality: 'SD', buffer: 1000, resolution: '854x480' }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCIONES AUXILIARES
    // ═══════════════════════════════════════════════════════════════════════

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function base64UrlEncode(str) {
        try {
            return btoa(unescape(encodeURIComponent(str)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        } catch (e) {
            return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        }
    }

    function escapeM3UValue(value) {
        if (!value) return '';
        return String(value).replace(/"/g, "'").replace(/,/g, ' ');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR JWT CON TODOS LOS HEADERS
    // ═══════════════════════════════════════════════════════════════════════

    function generateJWT(channel, profile, index) {
        const cfg = PROFILES[profile] || PROFILES['P3'];
        const now = Math.floor(Date.now() / 1000);
        const expiry = now + (365 * 24 * 60 * 60); // 1 año

        const header = { alg: 'SIMPLE', typ: 'JWT' };

        const payload = {
            // Identificación
            iss: 'APE_v15.0_3LAYER',
            iat: now,
            exp: expiry,
            jti: `jwt_${generateRandomString(12)}`,
            nonce: generateRandomString(24),

            // Canal
            sub: String(channel.stream_id || channel.id || index),
            chn: channel.name || 'Unknown',

            // Perfil
            device_profile: profile,
            device_class: cfg.name,
            resolution: cfg.resolution,
            buffer: cfg.buffer,

            // Headers HTTP (embebidos en JWT)
            http_headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            },

            // Configuración APE
            ape_config: {
                evasion_407: true,
                vpn_stealth: true,
                buffer_adaptive: true,
                prefetch: true,
                instant_recovery: true,
                latency_optimization: true
            },

            // Versión
            version: VERSION
        };

        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(payload));
        const signature = generateRandomString(22);

        return `${headerB64}.${payloadB64}.${signature}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUIR URL DEL CANAL
    // ═══════════════════════════════════════════════════════════════════════

    function buildChannelUrl(channel, jwt) {
        let baseUrl = '';

        // Si ya tiene URL completa
        if (channel.url && channel.url.startsWith('http')) {
            baseUrl = channel.url.split('?')[0]; // Quitar parámetros existentes
        }
        // Si hay direct_source
        else if (channel.direct_source && channel.direct_source.startsWith('http')) {
            baseUrl = channel.direct_source.split('?')[0];
        }
        // Construir desde credenciales del servidor
        else if (typeof window !== 'undefined' && window.app && window.app.state) {
            const state = window.app.state;
            const channelServerId = channel._source || channel.serverId || channel.server_id;
            let server = null;

            if (channelServerId && state.activeServers) {
                server = state.activeServers.find(s => s.id === channelServerId);
            }
            if (!server && state.currentServer) {
                server = state.currentServer;
            }

            if (server && server.baseUrl && server.username && server.password && channel.stream_id) {
                const cleanBase = server.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '');
                const ext = state.streamFormat || 'm3u8';
                baseUrl = `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.${ext}`;
            }
        }

        if (!baseUrl) {
            baseUrl = channel.url || channel.direct_source || '';
        }

        // URL limpia con JWT como único parámetro
        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}ape_jwt=${jwt}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR CABECERA GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    function generateGlobalHeader() {
        const timestamp = new Date().toISOString();
        const listId = `APE_${Date.now()}_${generateRandomString(6)}`;

        return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-APE-VERSION:${VERSION}
#EXT-X-APE-ARCHITECTURE:3-LAYER_JWT_STANDARD
#EXT-X-APE-GENERATED:${timestamp}
#EXT-X-APE-LIST-ID:${listId}
#EXT-X-APE-COMPATIBLE:OTT_NAVIGATOR,VLC,KODI,TIVIMATE,SMARTERS
`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR ENTRADA DE CANAL (LIMPIA)
    // ═══════════════════════════════════════════════════════════════════════

    function generateChannelEntry(channel, index, profile = 'P3') {
        // Generar JWT con toda la configuración
        const jwt = generateJWT(channel, profile, index);

        // Construir URL limpia
        const url = buildChannelUrl(channel, jwt);

        // Obtener metadatos básicos
        const tvgId = channel.stream_id || channel.id || index;
        const tvgName = escapeM3UValue(channel.name || channel.stream_display_name || `Canal ${index}`);
        const tvgLogo = channel.stream_icon || channel.logo || '';
        const groupTitle = escapeM3UValue(channel.category_name || channel.group || 'General');

        // Línea EXTINF limpia con atributos estándar
        const extinf = `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}" ape-profile="${profile}",${tvgName}`;

        // Retornar: EXTINF seguido INMEDIATAMENTE por URL (RFC 8216)
        return `${extinf}\n${url}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DETERMINAR PERFIL DEL CANAL
    // ═══════════════════════════════════════════════════════════════════════

    function determineProfile(channel) {
        const name = (channel.name || '').toUpperCase();
        const resolution = channel.resolution || channel.heuristics?.resolution || '';

        if (name.includes('8K') || resolution.includes('7680')) return 'P1';
        if (name.includes('4K') || name.includes('UHD') || resolution.includes('3840')) return 'P2';
        if (name.includes('FHD') || name.includes('1080') || resolution.includes('1920')) return 'P3';
        if (name.includes('HD') || name.includes('720') || resolution.includes('1280')) return 'P4';
        if (name.includes('SD') || name.includes('480')) return 'P5';

        return 'P3'; // Default
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR M3U8 COMPLETO (3 CAPAS)
    // ═══════════════════════════════════════════════════════════════════════

    function generateM3U8(channels) {
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('❌ No hay canales para generar');
            return null;
        }

        console.log(`🎬 [3-LAYER] Generando M3U8 para ${channels.length} canales...`);
        const startTime = Date.now();

        // Capa 1: Cabecera global
        let output = generateGlobalHeader();

        // Capa 2 & 3: Canales (JWT en URL + EXTINF limpio)
        channels.forEach((channel, index) => {
            const profile = determineProfile(channel);
            const entry = generateChannelEntry(channel, index, profile);
            output += `\n${entry}`;
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [3-LAYER] Generación completada en ${elapsed}s`);
        console.log(`📊 Canales procesados: ${channels.length}`);

        return output;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR Y DESCARGAR
    // ═══════════════════════════════════════════════════════════════════════

    function generateAndDownload(channels) {
        const content = generateM3U8(channels);
        if (!content) return;

        const filename = `APE_3LAYER_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.m3u8`;
        const blob = new Blob([content], { type: 'application/x-mpegurl' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log(`📥 Archivo descargado: ${filename}`);
        console.log(`📊 Tamaño: ${(content.length / 1024).toFixed(2)} KB`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTEGRACIÓN CON APP
    // ═══════════════════════════════════════════════════════════════════════

    if (typeof window !== 'undefined') {
        // Exponer globalmente
        window.M3U8Generator3Layer = {
            generate: generateM3U8,
            generateAndDownload: generateAndDownload,
            version: VERSION
        };

        // Integrar con app si existe
        if (window.app) {
            window.app.generateM3U8_3Layer = function () {
                const channels = this.state?.filteredChannels ||
                    this.state?.channels ||
                    this.state?.channelsMaster || [];

                if (channels.length === 0) {
                    alert('No hay canales para generar. Aplica filtros primero.');
                    return;
                }

                generateAndDownload(channels);
            };
        }

        console.log(`📺 M3U8 Generator v${VERSION} (3-Layer) Loaded`);
        console.log('   ✅ RFC 8216 Compatible');
        console.log('   ✅ Usa: app.generateM3U8_3Layer() o M3U8Generator3Layer.generateAndDownload(channels)');
    }

})();
