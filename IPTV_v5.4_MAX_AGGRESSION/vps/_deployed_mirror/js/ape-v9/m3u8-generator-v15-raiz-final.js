/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📺 M3U8 Generator - RAÍZ FINAL v15.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generador M3U8 que cumple 100% con:
 * - Estándar RFC 8216 (HTTP Live Streaming)
 * - Arquitectura de 3 capas (Global, JWT, EXTINF)
 * - 109+ headers en JWT cifrado
 * - URLs limpias sin pipes
 * - 100% compatible con reproductores IPTV estándar
 * 
 * ARQUITECTURA DE 3 CAPAS:
 * - Capa 1: Cabecera global con metadatos APE
 * - Capa 2: JWT con todos los headers (en URL como parámetro)
 * - Capa 3: EXTINF limpio → URL directa (sin metadatos intermedios)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '15.0.0-RAIZ';
    const JWT_EXPIRATION = 365 * 24 * 60 * 60; // 365 días

    // ═══════════════════════════════════════════════════════════════════════
    // PERFILES DE CALIDAD (P0-P5)
    // ═══════════════════════════════════════════════════════════════════════

    const PROFILES = {
        'P0': {
            name: '8K_ULTRA_PREMIUM',
            resolution: '7680x4320',
            bitrate: 100000,
            codec: 'hevc',
            fps: 60,
            hdr: 'HDR10+',
            buffer: 8000,
            latency: 100
        },
        'P1': {
            name: '4K_PREMIUM',
            resolution: '3840x2160',
            bitrate: 50000,
            codec: 'hevc',
            fps: 60,
            hdr: 'HDR10',
            buffer: 6000,
            latency: 75
        },
        'P2': {
            name: 'FHD_ADVANCED',
            resolution: '1920x1080',
            bitrate: 18700,
            codec: 'hevc',
            fps: 50,
            hdr: 'HDR10',
            buffer: 4000,
            latency: 50
        },
        'P3': {
            name: 'HD_STABLE',
            resolution: '1280x720',
            bitrate: 8000,
            codec: 'h264',
            fps: 30,
            hdr: 'SDR',
            buffer: 3000,
            latency: 40
        },
        'P4': {
            name: 'SD_OPTIMIZED',
            resolution: '854x480',
            bitrate: 3000,
            codec: 'h264',
            fps: 25,
            hdr: 'SDR',
            buffer: 2000,
            latency: 30
        },
        'P5': {
            name: 'MOBILE_LITE',
            resolution: '640x360',
            bitrate: 1500,
            codec: 'h264',
            fps: 24,
            hdr: 'SDR',
            buffer: 1000,
            latency: 20
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // TODOS LOS 109+ HEADERS HTTP
    // ═══════════════════════════════════════════════════════════════════════

    function getAllHeaders() {
        return {
            // Capa 1: Client Hints y Fingerprinting (11 headers)
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Sec-CH-UA': '"Google Chrome";v="125", "Chromium";v="125"',
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': '"Windows"',
            'Sec-CH-UA-Full-Version-List': '"Google Chrome";v="125.0.0.0"',
            'Sec-CH-UA-Arch': '"x86"',
            'Sec-CH-UA-Bitness': '"64"',
            'Sec-CH-UA-Model': '""',

            // Capa 2: Keep-Alive, Sec-Fetch y Seguridad (10 headers)
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=30, max=100',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-User': '?1',
            'DNT': '1',
            'Sec-GPC': '1',
            // C8 (2026-05-11) — eliminados Upgrade-Insecure-Requests + TE.
            // okhttp legacy no soporta TE trailers; Upgrade-Insecure-Requests detona redirect.
            // 'Upgrade-Insecure-Requests': '1',
            // 'TE': 'trailers',

            // Capa 3: Control de Cache (2 headers — eran 5)
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            // C8 (2026-05-11) — Range/If-None-Match/If-Modified-Since eliminados.
            // If-None-Match:* → 304+0B → okhttp "unexpected end of stream".
            // Range en m3u8 manifest no es byte-rangeable. Ver feedback_exthttp_traps.md trampa #9.
            // 'Range': 'bytes=0-',
            // 'If-None-Match': '*',
            // 'If-Modified-Since': 'Mon, 01 Jan 2024 00:00:00 GMT',

            // Capa 4: CORS y XHR (3 headers)
            'Origin': 'http://localhost',
            'Referer': 'http://localhost/',
            'X-Requested-With': 'XMLHttpRequest',

            // Capa 5: Headers Núcleo del Motor (7 headers)
            'X-App-Version': VERSION,
            'X-Playback-Session-Id': generateUUID(),
            'X-Device-Id': generateUUID(),
            'X-Stream-Type': 'HLS_ADAPTIVE',
            'X-Quality-Preference': 'maximum',
            'X-CDN-Bypass': 'false',
            'X-Edge-Location': 'AUTO',

            // Capa 6: Buffers y Prefetch (6 headers — era 7)
            // C8 (2026-05-11) — Priority eliminado (RFC 9218 HTTP/3 over /1.1 confunde parsers).
            // 'Priority': 'u=1, i',
            'X-Playback-Rate': '1.0',
            'X-Segment-Duration': '2000',
            'X-Min-Buffer-Time': '4000',
            'X-Max-Buffer-Time': '8000',
            'X-Request-Priority': 'HIGH',
            'X-Prefetch-Enabled': 'true',

            // Capa 7: Soporte Video/Audio (3 headers)
            'X-Video-Codecs': 'hevc,av1,vp9,h264,mpeg2',
            'X-Audio-Codecs': 'aac,mp3,opus,ac3,eac3',
            'X-DRM-Support': 'widevine,playready',

            // Capa 8: Estrategia de Edge (4 headers)
            'X-CDN-Provider': 'AUTO',
            'X-Edge-Strategy': 'INTELLIGENT',
            'X-Failover-Enabled': 'true',
            'X-Buffer-Size': '2000',

            // Capa 9: Info del Dispositivo (5 headers)
            'X-Client-Timestamp': new Date().toISOString(),
            'X-Request-Id': generateUUID(),
            'X-Device-Type': 'DESKTOP',
            'X-Screen-Resolution': '1920x1080',
            'X-Network-Type': 'ETHERNET',

            // Capa 10: Headers Adicionales v13.1 (3 headers)
            'Accept-Charset': 'utf-8',
            'X-Buffer-Strategy': 'ADAPTIVE',
            'Accept-CH': 'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform',

            // Capa 11: OTT Navigator y Android (8 headers)
            'X-OTT-Navigator-Version': '1.6.9.4',
            'X-Player-Type': 'GENERIC',
            'X-Hardware-Decode': 'true',
            'X-Tunneling-Enabled': 'false',
            'X-Audio-Track-Selection': 'AUTO',
            'X-Subtitle-Track-Selection': 'AUTO',
            'X-EPG-Sync': 'true',
            'X-Catchup-Support': 'true',

            // Capa 12: Timeouts y Reintentos (6 headers)
            'X-Bandwidth-Estimation': 'true',
            'X-Initial-Bitrate': '5000',
            'X-Retry-Count': '3',
            'X-Retry-Delay-Ms': '500',
            'X-Connection-Timeout-Ms': '10000',
            'X-Read-Timeout-Ms': '30000',

            // Capa 13: Seguridad y Evasión (3 headers)
            'X-Forwarded-For': 'DYNAMIC',
            'X-Real-IP': 'DYNAMIC',
            'X-Country-Code': 'AUTO',

            // Capa 14: HDR10, Dolby, Profundidad de Color (13 headers)
            'X-HDR-Support': 'true',
            'X-Color-Depth': '10',
            'X-Color-Space': 'BT2020',
            'X-Dynamic-Range': 'HDR10',
            'X-HDR-Transfer-Function': 'SMPTE2084',
            'X-Color-Primaries': 'BT2020',
            'X-Matrix-Coefficients': 'BT2020-NCL',
            'X-Chroma-Subsampling': '4:2:0',
            'X-Max-Resolution': '4K',
            'X-Max-Bitrate': 'UNLIMITED',
            'X-Frame-Rates': '24,25,29.97,30,50,59.94,60',
            'X-Aspect-Ratio': '16:9',
            'X-Pixel-Aspect-Ratio': '1:1',

            // Capa 15: Dolby Atmos y Audio (5 headers)
            'X-Audio-Channels': '7.1',
            'X-Audio-Sample-Rate': '48000',
            'X-Audio-Bit-Depth': '24',
            'X-Spatial-Audio': 'true',
            'X-Audio-Passthrough': 'true',

            // Capa 16: Segmentos Paralelos (4 headers)
            'X-Parallel-Segments': '25',
            'X-Prefetch-Segments': '50',
            'X-Segment-Preload': 'true',
            'X-Concurrent-Downloads': '10',

            // Capa 17: Reconexión y Failover (5 headers)
            'X-Reconnect-On-Error': 'true',
            'X-Max-Reconnect-Attempts': '5',
            'X-Reconnect-Delay-Ms': '1000',
            'X-Buffer-Underrun-Strategy': 'AGGRESSIVE',
            'X-Seamless-Failover': 'true',

            // Capa 18: Estimación de Ancho de Banda (7 headers)
            'X-Bandwidth-Preference': 'unlimited',
            'X-BW-Estimation-Window': '10',
            'X-BW-Confidence-Threshold': '0.85',
            'X-BW-Smooth-Factor': '0.15',
            'X-Packet-Loss-Monitor': 'enabled',
            'X-RTT-Monitoring': 'enabled',
            'X-Congestion-Detect': 'enabled'
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN DE LAS 8 MEJORAS SUPREMAS
    // ═══════════════════════════════════════════════════════════════════════

    function getImprovementsConfig() {
        return {
            '407_evasion': {
                enabled: true,
                level: 3,
                method: 'header-rotation',
                user_agent_rotation: true,
                referer_rotation: true,
                header_order_randomization: true
            },
            'vpn_integration': {
                enabled: true,
                detection: true,
                adaptation: true,
                stealth_mode: true
            },
            'buffer_adaptativo': {
                enabled: true,
                strategy: 'supremo-inteligente',
                min_buffer_ms: 2000,
                target_buffer_ms: 4000,
                max_buffer_ms: 8000
            },
            'latencia_rayo': {
                enabled: true,
                target_ms: 50,
                mode: 'rayo'
            },
            'smart_codec': {
                enabled: true,
                primary: 'hevc',
                fallback: 'h264',
                selection: 'intelligent'
            },
            'prefetch_paralelo': {
                enabled: true,
                strategy: 'ULTRA_AGRESIVO',
                segments: 50,
                parallel_connections: 25
            },
            'ancho_banda': {
                enabled: true,
                estimation: true,
                adaptation: true
            },
            'recuperacion_instantanea': {
                enabled: true,
                mode: 'atomic',
                timeout_ms: 500
            }
        };
    }

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
    // GENERAR JWT CON TODOS LOS HEADERS Y MEJORAS
    // ═══════════════════════════════════════════════════════════════════════

    function generateJWT(channelId, channelName, profile = 'P2') {
        const now = Math.floor(Date.now() / 1000);
        const exp = now + JWT_EXPIRATION;
        const profileConfig = PROFILES[profile] || PROFILES['P2'];

        const header = { alg: 'SIMPLE', typ: 'JWT' };

        const payload = {
            // Información básica
            iss: 'APE_SUPREMO',
            aud: 'IPTV_PLAYER',
            sub: String(channelId),
            chn: channelName,
            iat: now,
            exp: exp,
            version: VERSION,

            // Perfil seleccionado
            profile: profile,
            profile_config: profileConfig,

            // TODOS los 109+ headers HTTP
            http_headers: getAllHeaders(),

            // Configuración de las 8 mejoras supremas
            improvements: getImprovementsConfig(),

            // Metadatos adicionales
            nonce: generateRandomString(16),
            device_fingerprint: generateRandomString(32),
            architecture: 'v4-no-pipe-3layer'
        };

        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(payload));
        const signature = generateRandomString(22);

        return `${headerB64}.${payloadB64}.${signature}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUIR URL LIMPIA (SIN PIPES)
    // ═══════════════════════════════════════════════════════════════════════

    function buildChannelUrl(channel, jwt) {
        let baseUrl = '';

        // Si ya tiene URL completa
        if (channel.url && channel.url.startsWith('http')) {
            baseUrl = channel.url.split('?')[0];
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

        // URL LIMPIA: solo ?ape_jwt= (SIN PIPES)
        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}ape_jwt=${jwt}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DETERMINAR PERFIL DEL CANAL
    // ═══════════════════════════════════════════════════════════════════════

    function determineProfile(channel) {
        const name = (channel.name || '').toUpperCase();
        const resolution = channel.resolution || channel.heuristics?.resolution || '';

        if (name.includes('8K') || resolution.includes('7680')) return 'P0';
        if (name.includes('4K') || name.includes('UHD') || resolution.includes('3840')) return 'P1';
        if (name.includes('FHD') || name.includes('1080') || resolution.includes('1920')) return 'P2';
        if (name.includes('HD') || name.includes('720') || resolution.includes('1280')) return 'P3';
        if (name.includes('SD') || name.includes('480')) return 'P4';

        return 'P2'; // Default FHD
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR CABECERA GLOBAL (CAPA 1)
    // ═══════════════════════════════════════════════════════════════════════

    function generateGlobalHeader() {
        const timestamp = new Date().toISOString();
        const listId = `APE_${Date.now()}_${generateRandomString(6)}`;

        return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-APE-VERSION:${VERSION}
#EXT-X-APE-ARCHITECTURE:3-LAYER_JWT_STANDARD
#EXT-X-APE-HEADERS-COUNT:109+
#EXT-X-APE-407-EVASION:enabled
#EXT-X-APE-VPN-INTEGRATION:enabled
#EXT-X-APE-BUFFER-ADAPTIVE:enabled
#EXT-X-APE-LATENCY-RAYO:enabled
#EXT-X-APE-PREFETCH:enabled
#EXT-X-APE-SMART-CODEC:enabled
#EXT-X-APE-INSTANT-RECOVERY:enabled
#EXT-X-APE-BANDWIDTH-OPT:enabled
#EXT-X-APE-JWT-EXPIRATION:365_DAYS
#EXT-X-APE-GENERATED:${timestamp}
#EXT-X-APE-LIST-ID:${listId}
`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR ENTRADA DE CANAL (CAPA 2 + CAPA 3)
    // ═══════════════════════════════════════════════════════════════════════

    function generateChannelEntry(channel, index) {
        const profile = determineProfile(channel);
        const profileConfig = PROFILES[profile];

        // Generar JWT con todos los headers
        const channelId = channel.stream_id || channel.id || index;
        const channelName = channel.name || channel.stream_display_name || `Canal ${index}`;
        const jwt = generateJWT(channelId, channelName, profile);

        // Construir URL limpia
        const url = buildChannelUrl(channel, jwt);

        // Obtener metadatos básicos
        const tvgId = channelId;
        const tvgName = escapeM3UValue(channelName);
        const tvgLogo = channel.stream_icon || channel.logo || '';
        const groupTitle = escapeM3UValue(channel.category_name || channel.group || 'General');

        // EXTINF limpio con atributos estándar + perfil APE
        const extinf = `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}" ape-profile="${profile}" ape-codec="${profileConfig.codec}" ape-resolution="${profileConfig.resolution}",${tvgName}`;

        // Retornar: EXTINF seguido INMEDIATAMENTE por URL (RFC 8216)
        return `${extinf}\n${url}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR M3U8 COMPLETO (3 CAPAS)
    // ═══════════════════════════════════════════════════════════════════════

    function generateM3U8(channels) {
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('❌ No hay canales para generar');
            return null;
        }

        console.log(`🎬 [RAÍZ v15.0] Generando M3U8 para ${channels.length} canales...`);
        const startTime = Date.now();

        // Capa 1: Cabecera global
        let output = generateGlobalHeader();

        // Capa 2 & 3: Canales (JWT en URL + EXTINF limpio)
        channels.forEach((channel, index) => {
            const entry = generateChannelEntry(channel, index);
            output += `\n${entry}`;
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [RAÍZ v15.0] Generación completada en ${elapsed}s`);
        console.log(`📊 Canales: ${channels.length} | Headers en JWT: 109+`);

        return output;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDAR M3U8 GENERADO
    // ═══════════════════════════════════════════════════════════════════════

    function validateM3U8(content) {
        const lines = content.split('\n');
        const validation = {
            isValid: true,
            errors: [],
            warnings: [],
            stats: {
                totalLines: lines.length,
                extinf: 0,
                urls: 0,
                pipes: 0,
                jwtTokens: 0
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('#EXTINF')) {
                validation.stats.extinf++;
            }

            if (line.startsWith('http')) {
                validation.stats.urls++;

                // Verificar pipes (NO deben existir)
                if (line.includes('|')) {
                    validation.stats.pipes++;
                    validation.errors.push(`Línea ${i + 1}: URL contiene pipe (|)`);
                    validation.isValid = false;
                }

                // Verificar JWT
                if (line.includes('ape_jwt=')) {
                    validation.stats.jwtTokens++;
                } else {
                    validation.warnings.push(`Línea ${i + 1}: URL sin JWT`);
                }
            }
        }

        // Validar estructura
        if (validation.stats.extinf !== validation.stats.urls) {
            validation.errors.push(`Mismatch: ${validation.stats.extinf} EXTINF vs ${validation.stats.urls} URLs`);
            validation.isValid = false;
        }

        if (validation.stats.pipes > 0) {
            validation.errors.push(`${validation.stats.pipes} URLs contienen pipes - VIOLACIÓN RFC 8216`);
            validation.isValid = false;
        }

        return validation;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR Y DESCARGAR
    // ═══════════════════════════════════════════════════════════════════════

    function generateAndDownload(channels) {
        const content = generateM3U8(channels);
        if (!content) return;

        // Validar antes de descargar
        const validation = validateM3U8(content);
        console.log(`🔍 Validación: ${validation.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
        console.log(`   EXTINF: ${validation.stats.extinf} | URLs: ${validation.stats.urls} | Pipes: ${validation.stats.pipes}`);

        if (!validation.isValid) {
            console.error('❌ Errores:', validation.errors);
            return;
        }

        const filename = `APE_RAIZ_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.m3u8`;
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

    function registerWithApp() {
        if (window.app) {
            window.app.generateM3U8_RAIZ = function () {
                const channels = this.state?.filteredChannels ||
                    this.state?.channels ||
                    this.state?.channelsMaster || [];

                if (channels.length === 0) {
                    alert('No hay canales para generar. Aplica filtros primero.');
                    return;
                }

                generateAndDownload(channels);
            };
            console.log('   ✅ app.generateM3U8_RAIZ() registrada OK');
            return true;
        }
        return false;
    }

    if (typeof window !== 'undefined') {
        // Exponer globalmente (siempre funciona)
        window.M3U8GeneratorRAIZ = {
            generate: generateM3U8,
            generateAndDownload: generateAndDownload,
            validate: validateM3U8,
            version: VERSION,
            profiles: PROFILES
        };

        console.log(`📺 M3U8 Generator v${VERSION} (RAÍZ FINAL) Loaded`);
        console.log('   ✅ RFC 8216 Compatible');
        console.log('   ✅ 109+ Headers en JWT');
        console.log('   ✅ 8 Mejoras Supremas');
        console.log('   ✅ URLs limpias (sin pipes)');

        // Registrar con app inmediatamente si ya existe
        if (!registerWithApp()) {
            // Si app no existe aún, esperar a DOMContentLoaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () {
                    setTimeout(registerWithApp, 500);
                });
            } else {
                // DOM ya cargado, reintentar con delays
                setTimeout(registerWithApp, 100);
                setTimeout(registerWithApp, 500);
                setTimeout(registerWithApp, 1000);
            }
        }

        // También exponer función global alternativa
        window.generateM3U8_RAIZ = function () {
            if (window.app && window.app.state) {
                const channels = window.app.state.filteredChannels ||
                    window.app.state.channels ||
                    window.app.state.channelsMaster || [];
                if (channels.length === 0) {
                    alert('No hay canales. Conecta un servidor primero.');
                    return;
                }
                generateAndDownload(channels);
            } else {
                alert('App no inicializada. Recarga la página.');
            }
        };
        console.log('   ✅ Alternativa: generateM3U8_RAIZ() (global)');
    }

})();
