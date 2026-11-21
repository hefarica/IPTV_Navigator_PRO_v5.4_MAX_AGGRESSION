/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🏆 M3U8 GENERATOR v16.0 - ELITE MANIFEST
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ARQUITECTURA: MANIFIESTO HLS INTELIGENTE (RFC 8216 - Nivel Maestro)
 * 
 * Esta versión representa un cambio de paradigma:
 * 1. INTELIGENCIA EN EL MANIFIESTO: La lógica de renderizado se mueve de la URL
 *    a la directiva #EXT-X-STREAM-INF, usando atributos avanzados del estándar HLS.
 * 2. PERFILES DE INTENCIÓN DE RENDERIZADO (PIR): Se definen experiencias de
 *    visualización (ej. "Cine", "Deportes") en lugar de solo perfiles técnicos.
 * 3. MAPEADOR AVANZADO: Traduce los más de 100 X-Headers de la configuración APE
 *    a atributos HLS estándar y extendidos, desbloqueando optimizaciones nativas.
 * 
 * VENTAJA COMPETITIVA: Mientras otros usan URLs propietarias, nosotros hablamos
 * el lenguaje nativo del reproductor HLS, logrando una calidad y rendimiento
 * que parece "magia tecnológica".
 * 
 * ARMAS SECRETAS (RFC 8216 Avanzado):
 * - VIDEO-RANGE: Control de color maestro (SDR/HLG/PQ)
 * - HDCP-LEVEL: Guardián de ultra alta definición
 * - PATHWAY-ID: Navegador anti-interrupciones
 * - SCORE: Calificador de calidad subjetiva
 * 
 * INTEGRACIÓN: Lee perfiles desde window.APE_PROFILES_CONFIG (ape-profiles-config.js)
 *              Lee canales desde window.app.state.channelsMaster
 *              NO modifica ningún archivo existente.
 * 
 * AUTHOR: APE Engine Team - IPTV Navigator PRO (Edición de Competición)
 * VERSION: 16.0.0-ELITE
 * DATE: 2026-02-21
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function (window) {
    'use strict';

    const VERSION = '16.0.0-ELITE';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTES: MAPEO DE HEVC LEVEL A CÓDIGO NUMÉRICO (RFC 6381)
    // ═══════════════════════════════════════════════════════════════════════════
    const HEVC_LEVEL_MAP = {
        '1.0': 30, '2.0': 60, '2.1': 63,
        '3.0': 90, '3.1': 93,
        '4.0': 120, '4.1': 123,
        '5.0': 150, '5.1': 153, '5.2': 156,
        '6.0': 180, '6.1': 183, '6.2': 186
    };

    // Mapeo de HEVC Profile a profile_idc (RFC 6381 / ISO 14496-15)
    const HEVC_PROFILE_MAP = {
        'MAIN': 1,
        'MAIN-10': 2,
        'MAIN-10-HDR': 2,
        'MAIN-STILL': 3,
        'MAIN-444': 4
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PERFILES DE INTENCIÓN DE RENDERIZADO (PIR)
    // ═══════════════════════════════════════════════════════════════════════════
    const RENDER_INTENTS = {
        P0: { intent: 'CINEMA-HDR-PRO', description: 'Experiencia Cinemática 4K HDR' },
        P1: { intent: 'STUDIO-8K-REF', description: 'Calidad 8K Referencia de Estudio' },
        P2: { intent: 'PREMIUM-4K', description: 'Premium 4K con HDR' },
        P3: { intent: 'SPORTS-MOTION-MAX', description: 'FHD Máxima Fluidez 60fps' },
        P4: { intent: 'HD-STABLE', description: 'HD Compatibilidad Máxima' },
        P5: { intent: 'SD-FAILSAFE', description: 'SD Resiliencia Extrema' }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 🧠 NÚCLEO DEL TRADUCTOR: De X-Headers/Perfiles APE a Atributos HLS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Traduce un perfil APE (P0-P5) a atributos #EXT-X-STREAM-INF avanzados.
     * Esta es el arma secreta: mapea la configuración APE a atributos HLS estándar
     * y extendidos, muchos desconocidos o ignorados por la competencia.
     * 
     * @param {Object} profile - Perfil APE completo (P0-P5) con settings, vlcopt, etc.
     * @param {Object} channelData - Datos del canal (name, category_name, stream_id, etc.)
     * @returns {Object} Atributos formateados para #EXT-X-STREAM-INF
     */
    function translateProfileToStreamInf(profile, channelData) {
        const attributes = {};
        const settings = profile.settings || {};
        const profileId = profile.id || '';

        // ── Atributos Fundamentales ──
        attributes.BANDWIDTH = Math.round((settings.bitrate || 3.7) * 1000000);
        attributes['AVERAGE-BANDWIDTH'] = Math.round(attributes.BANDWIDTH * 0.75);
        attributes.RESOLUTION = settings.resolution || '1920x1080';
        attributes['FRAME-RATE'] = (settings.fps || 30).toFixed(3);

        // ── Mapeo de Codecs (RFC 6381 + ISO 14496-15) ──
        const videoCodec = buildVideoCodecString(settings);
        const audioCodec = buildAudioCodecString(settings);
        attributes.CODECS = `"${videoCodec},${audioCodec}"`;

        // ── ARMA SECRETA 1: VIDEO-RANGE (Rango Dinámico y Color) ──
        // Detección por perfil APE: P0/P1/P2 son HDR, P3 es HLG, P4/P5 son SDR
        // Fallback: si settings.hevc_profile contiene 'HDR', usar PQ
        const hdrProfiles = { P0: 'PQ', P1: 'PQ', P2: 'PQ', P3: 'HLG' };
        if (hdrProfiles[profileId]) {
            attributes['VIDEO-RANGE'] = hdrProfiles[profileId];
        } else if (settings.hevc_profile && settings.hevc_profile.includes('HDR')) {
            attributes['VIDEO-RANGE'] = 'PQ';
        } else {
            attributes['VIDEO-RANGE'] = 'SDR';
        }

        // ── ARMA SECRETA 2: HDCP-LEVEL (Protección de Contenido) ──
        // Detección por perfil APE: P0/P1/P2 requieren TYPE-1, P3/P4 TYPE-0, P5 NONE
        const hdcpMap = { P0: 'TYPE-1', P1: 'TYPE-1', P2: 'TYPE-1', P3: 'TYPE-0', P4: 'TYPE-0', P5: 'NONE' };
        attributes['HDCP-LEVEL'] = hdcpMap[profileId] || 'NONE';

        // ── ARMA SECRETA 3: PATHWAY-ID (Agrupación para Failover Inteligente) ──
        const category = (channelData.category_name || channelData.group || 'general')
            .replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().substring(0, 30);
        const videoRange = attributes['VIDEO-RANGE'].toLowerCase();
        attributes['PATHWAY-ID'] = `"${category}-${videoRange}"`;

        // ── ARMA SECRETA 4: SCORE (Calificación de Calidad Subjetiva) ──
        // Mapeo directo por perfil para garantizar diferenciación clara
        const scoreMap = { P0: '9.8', P1: '9.5', P2: '9.2', P3: '7.5', P4: '5.5', P5: '3.2' };
        attributes.SCORE = scoreMap[profileId] || calculateStreamScore(settings, profile);

        // ── Audio Avanzado: Grupo de Audio ──
        if (profileId === 'P0' || profileId === 'P1' || settings.X_Dolby_Atmos === true || settings.X_Dolby_Atmos === 'true') {
            attributes.AUDIO = '"atmos"';
        } else if (profileId === 'P2' || profileId === 'P3') {
            attributes.AUDIO = '"surround"';
        } else {
            attributes.AUDIO = '"stereo"';
        }

        return attributes;
    }


    /**
     * Construye el string de codec de video según RFC 6381 + ISO 14496-15.
     * Ejemplo: hvc1.2.4.L153.B0 (Main 10, High Tier, Level 5.1)
     * Ejemplo: avc1.640029 (H.264 High Profile Level 4.1)
     * 
     * @param {Object} settings - Settings del perfil APE
     * @returns {string} Codec string RFC 6381
     */
    function buildVideoCodecString(settings) {
        if (settings.codec === 'H265' || settings.codec === 'HEVC') {
            const profileIdc = HEVC_PROFILE_MAP[settings.hevc_profile] || 2; // Default Main 10
            const tierFlag = (settings.hevc_tier === 'HIGH') ? 4 : 0;
            const levelIdc = HEVC_LEVEL_MAP[settings.hevc_level] || 153; // Default 5.1
            // Constraint flags byte (B0 = no constraints beyond profile)
            return `hvc1.${profileIdc}.${tierFlag}.L${levelIdc}.B0`;
        }
        if (settings.codec === 'AV1') {
            return 'av01.0.12M.10'; // AV1 Main Profile, Level 5.1, 10-bit
        }
        if (settings.codec === 'VP9') {
            return 'vp09.02.51.10'; // VP9 Profile 2, Level 5.1, 10-bit
        }
        // Default: H.264 High Profile Level 4.1
        return 'avc1.640029';
    }

    /**
     * Construye el string de codec de audio.
     * Soporta AAC-LC, EAC-3 (Dolby Digital Plus), AC-3 (Dolby Digital).
     * 
     * @param {Object} settings - Settings del perfil APE
     * @returns {string} Audio codec string
     */
    function buildAudioCodecString(settings) {
        // Si Dolby Atmos está habilitado → EAC-3 (Enhanced AC-3)
        if (settings.X_Dolby_Atmos === true || settings.X_Dolby_Atmos === 'true') {
            return 'ec-3';
        }
        // Perfiles de alta calidad → AC-3
        if (settings.bitrate >= 10) {
            return 'ac-3';
        }
        // Default → AAC-LC
        return 'mp4a.40.2';
    }

    /**
     * Calcula un puntaje de calidad normalizado (0-10) para el atributo SCORE.
     * Combina múltiples factores: bitrate, fps, resolución, HDR, audio.
     * 
     * La fórmula pondera:
     * - Base: 3.0
     * - Bitrate: hasta +2.5 puntos
     * - FPS: hasta +1.5 puntos 
     * - Resolución: hasta +2.0 puntos
     * - HDR: +1.0 punto
     * - Audio premium: +0.5 puntos
     * 
     * @param {Object} settings - Settings del perfil APE
     * @param {Object} profile - Perfil completo
     * @returns {string} Score formateado con 1 decimal
     */
    function calculateStreamScore(settings, profile) {
        let score = 3.0;

        // Bitrate contribution (0-2.5 points, log scale for diminishing returns)
        const bitrateKbps = (settings.bitrate || 1.5);
        score += Math.min(2.5, Math.log2(bitrateKbps + 1) * 0.6);

        // FPS contribution (0-1.5 points)
        const fps = settings.fps || 25;
        if (fps >= 60) score += 1.5;
        else if (fps >= 50) score += 1.2;
        else if (fps >= 30) score += 0.8;
        else score += 0.4;

        // Resolution contribution (0-2.0 points)
        const res = settings.resolution || '854x480';
        if (res.includes('7680')) score += 2.0;      // 8K
        else if (res.includes('3840')) score += 1.5;  // 4K
        else if (res.includes('1920')) score += 1.0;  // FHD
        else if (res.includes('1280')) score += 0.6;  // HD
        else score += 0.2;                            // SD

        // HDR contribution (+1.0)
        if (settings.hevc_profile && settings.hevc_profile.includes('HDR')) {
            score += 1.0;
        }

        // Audio premium contribution (+0.5)
        if (settings.X_Dolby_Atmos === true || settings.X_Dolby_Atmos === 'true') {
            score += 0.5;
        }

        return Math.min(10.0, score).toFixed(1);
    }

    /**
     * Formatea los atributos en un string para la directiva #EXT-X-STREAM-INF.
     * 
     * @param {Object} attributes - Mapa de atributos HLS
     * @returns {string} Atributos formateados como key=value separados por comas
     */
    function formatAttributes(attributes) {
        return Object.entries(attributes)
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
    }

    /**
     * Construye la URL de streaming para un canal con un perfil dado.
     * Usa la URL original del canal si está disponible, o construye una URL relativa.
     * 
     * @param {Object} channel - Canal con datos de stream
     * @param {Object} profile - Perfil APE
     * @returns {string} URL de stream
     */
    function buildStreamUrl(channel, profile) {
        // Si el canal tiene una URL de stream disponible, usarla directamente
        if (channel.stream_url) {
            return channel.stream_url;
        }
        if (channel.url && channel.url.startsWith('http')) {
            return channel.url;
        }

        // ✅ V9.1: Credential Isolation — resolve server PER CHANNEL via serverId
        let server = null;
        const channelServerId = channel._source || channel.serverId || channel.server_id;

        if (channelServerId && window.app?.state?.activeServers) {
            server = window.app.state.activeServers.find(s => s.id === channelServerId);
        }
        if (!server && window.app?.state?.currentServer) {
            server = window.app.state.currentServer;
        }
        if (!server && window.app?.state?.activeServers?.length > 0) {
            server = window.app.state.activeServers[0];
        }

        // Construir URL Xtream Codes con credenciales del servidor correcto
        if (server && server.baseUrl && server.username && server.password && channel.stream_id) {
            const cleanBase = server.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '');
            const ext = (profile.settings?.codec === 'H265' || profile.settings?.codec === 'HEVC') ? 'm3u8' : 'ts';
            return `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.${ext}`;
        }

        // Fallback: URL relativa
        return `stream_${channel.stream_id || channel.num || 0}_${profile.id}.m3u8`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🏗️ GENERADOR PRINCIPAL DEL MANIFIESTO ELITE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Genera el manifiesto HLS inteligente completo.
     * 
     * Para cada canal, genera una variante por cada perfil (P0-P5),
     * cada una con atributos #EXT-X-STREAM-INF ricos en información
     * que instruyen al reproductor sobre cómo renderizar.
     * 
     * @param {Array} channels - Array de objetos de canal
     * @param {Object} profilesConfig - Instancia de APEProfilesConfig o mapa de perfiles
     * @returns {string|null} Contenido M3U8 completo o null si hay error
     */
    function generateEliteM3U8(channels, profilesConfig) {
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('[ELITE] ❌ No hay canales para generar.');
            return null;
        }
        if (!profilesConfig) {
            console.error('[ELITE] ❌ La configuración de perfiles no está disponible.');
            return null;
        }

        // Obtener mapa de perfiles (soporta tanto instancia como objeto plano)
        const profiles = (typeof profilesConfig.getAllProfiles === 'function')
            ? profilesConfig.getAllProfiles()
            : profilesConfig;

        if (!profiles || Object.keys(profiles).length === 0) {
            console.error('[ELITE] ❌ No se encontraron perfiles en la configuración.');
            return null;
        }

        const profileKeys = Object.keys(profiles).sort(); // P0, P1, P2, P3, P4, P5
        const totalVariants = channels.length * profileKeys.length;

        console.log(`🏆 [ELITE] Generando Manifiesto HLS Inteligente...`);
        console.log(`   📊 Canales: ${channels.length} | Perfiles: ${profileKeys.length} | Variantes: ${totalVariants}`);

        const startTime = Date.now();
        const lines = [];

        // ── Cabecera Global ──
        lines.push('#EXTM3U');
        lines.push('#EXT-X-VERSION:9');
        lines.push('#EXT-X-INDEPENDENT-SEGMENTS');
        lines.push('');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push(`# 🏆 MANIFIESTO HLS INTELIGENTE - APE ELITE v${VERSION}`);
        lines.push(`# 📅 Generado: ${new Date().toISOString()}`);
        lines.push(`# 📊 Canales: ${channels.length} | Perfiles: ${profileKeys.join(', ')} | Variantes: ${totalVariants}`);
        lines.push(`# 🎯 Arquitectura: Perfiles de Intención de Renderizado (PIR)`);
        lines.push(`# 📐 RFC 8216 Nivel Maestro: VIDEO-RANGE, HDCP-LEVEL, PATHWAY-ID, SCORE`);
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push('');
        lines.push(`#EXT-X-APE-GENERATOR:M3U8-GENERATOR-V16-ELITE`);
        lines.push(`#EXT-X-APE-VERSION:${VERSION}`);
        lines.push(`#EXT-X-APE-TIMESTAMP:${new Date().toISOString()}`);
        lines.push(`#EXT-X-APE-ARCHITECTURE:INTELLIGENT-HLS-MANIFEST`);
        lines.push('');

        // ── Grupos de Audio Avanzado (#EXT-X-MEDIA) ──
        lines.push('# ── Grupos de Audio Avanzado ──');
        lines.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="atmos",NAME="Dolby Atmos",LANGUAGE="und",CHANNELS="16/JOC",DEFAULT=YES,AUTOSELECT=YES');
        lines.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="surround",NAME="Surround 5.1",LANGUAGE="und",CHANNELS="6",DEFAULT=YES,AUTOSELECT=YES');
        lines.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="stereo",NAME="Stereo",LANGUAGE="und",CHANNELS="2",DEFAULT=YES,AUTOSELECT=YES');
        lines.push('');

        // ── Procesamiento de Canales ──
        let processedCount = 0;

        channels.forEach((channel, index) => {
            const channelName = channel.name || channel.title || `Channel_${index + 1}`;
            const channelId = channel.stream_id || channel.id || channel.num || index;

            // Comentario separador por canal
            lines.push('');
            lines.push(`# ── Canal ${index + 1}/${channels.length}: ${channelName} ──`);

            // EXTINF con metadatos del canal
            const tvgId = channel.epg_channel_id || channel.tvg_id || '';
            const tvgName = channel.tvg_name || channelName;
            const tvgLogo = channel.stream_icon || channel.tvg_logo || '';
            const groupTitle = channel.category_name || channel.group || 'General';

            lines.push(`#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}",${channelName}`);

            // 🔄 Rotación de User-Agent (Competición v16.0)
            if (window.userAgentRotation) {
                const ua = window.userAgentRotation.selectRandomUserAgent();
                lines.push(`#EXTVLCOPT:http-user-agent=${ua}`);
                lines.push('#EXTVLCOPT:http-referrer=https://premium-iptv-service.com/');
                lines.push('#EXTVLCOPT:http-reconnect=true');
            }

            // Generar una variante por cada perfil
            profileKeys.forEach(profileKey => {
                const profile = profiles[profileKey];
                if (!profile || !profile.settings) return;

                // Obtener intención de renderizado
                const renderIntent = RENDER_INTENTS[profileKey] || { intent: 'UNKNOWN', description: 'Custom Profile' };

                // 1. Traducir el perfil APE a atributos HLS avanzados
                const streamInfAttributes = translateProfileToStreamInf(profile, channel);

                // 2. Formatear la directiva #EXT-X-STREAM-INF
                const attributesString = formatAttributes(streamInfAttributes);

                // 3. Comentario del perfil (solo para el primer perfil del canal, info completa)
                if (profileKey === profileKeys[0]) {
                    lines.push(`# PIR: ${renderIntent.intent} — ${renderIntent.description}`);
                }

                lines.push(`#EXT-X-STREAM-INF:${attributesString}`);

                // 4. URL del stream
                const url = buildStreamUrl(channel, profile);
                lines.push(url);
            });

            processedCount++;
        });

        // ── Footer ──
        lines.push('');
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');
        lines.push(`# 🏁 FIN DEL MANIFIESTO — ${processedCount} canales × ${profileKeys.length} perfiles = ${processedCount * profileKeys.length} variantes`);
        lines.push(`# ⏱️ Generado en ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
        lines.push('# ═══════════════════════════════════════════════════════════════════════════');

        const content = lines.join('\n');
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`✅ [ELITE] Manifiesto generado exitosamente:`);
        console.log(`   📄 Líneas: ${lines.length}`);
        console.log(`   📊 Variantes: ${processedCount * profileKeys.length}`);
        console.log(`   ⏱️ Tiempo: ${elapsed}s`);
        console.log(`   📐 Tamaño: ${(content.length / 1024).toFixed(1)} KB`);

        return content;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔌 INTEGRACIÓN Y EXPOSICIÓN AL FRONTEND
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Genera el manifiesto y lo descarga como archivo .m3u8.
     * Lee canales y perfiles desde el estado global de la aplicación.
     */
    function generateAndDownload() {
        console.log('🏆 [ELITE] Solicitando generación de Manifiesto ELITE...');

        // ── Obtener canales FILTRADOS desde el estado de la app ──
        let channels = [];
        if (window.app && typeof window.app.getFilteredChannels === 'function') {
            channels = window.app.getFilteredChannels();
            console.log(`🏆 [ELITE] Usando getFilteredChannels(): ${channels.length} canales filtrados`);
        } else {
            channels = window.app?.state?.channelsMaster
                || window.app?.state?.channels
                || [];
            console.warn('🏆 [ELITE] ⚠️ getFilteredChannels no disponible, usando channelsMaster');
        }

        if (channels.length === 0) {
            alert('❌ No hay canales para generar.\n\nPor favor, conecta al menos un servidor y carga canales antes de generar el manifiesto ELITE.');
            console.error('[ELITE] No hay canales disponibles');
            return;
        }

        // ── Obtener configuración de perfiles ──
        const profilesConfig = window.APE_PROFILES_CONFIG || null;

        if (!profilesConfig) {
            alert('❌ La configuración de perfiles APE no está disponible.\n\nAsegúrate de que ape-profiles-config.js se haya cargado correctamente.');
            console.error('[ELITE] window.APE_PROFILES_CONFIG no está definido');
            return;
        }

        // ── Generar contenido ──
        const content = generateEliteM3U8(channels, profilesConfig);
        if (!content) {
            alert('❌ Error al generar el manifiesto. Revisa la consola para más detalles.');
            return;
        }

        // ── Descargar archivo ──
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `APE_ELITE_MANIFEST_${dateStr}.m3u8`;

        const blob = new Blob([content], { type: 'application/vnd.apple.mpegurl' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log(`📥 [ELITE] Archivo descargado: ${filename}`);
        console.log(`   📊 Canales procesados: ${channels.length}`);
        console.log(`   📐 Tamaño: ${(content.length / 1024).toFixed(1)} KB`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════

    if (!window.apeEliteGenerator) {
        window.apeEliteGenerator = {
            generate: generateEliteM3U8,
            generateAndDownload: generateAndDownload,
            translateProfileToStreamInf: translateProfileToStreamInf,
            buildVideoCodecString: buildVideoCodecString,
            calculateStreamScore: calculateStreamScore,
            version: VERSION,
            RENDER_INTENTS: RENDER_INTENTS
        };

        console.log(`%c🏆 Generador M3U8 ELITE v${VERSION} cargado y listo para la competición.`, 'color: #f59e0b; font-weight: bold; font-size: 1.1em;');
        console.log('%c   Arquitectura: Manifiesto HLS Inteligente (RFC 8216 Nivel Maestro)', 'color: #94a3b8;');
        console.log('%c   Armas: VIDEO-RANGE · HDCP-LEVEL · PATHWAY-ID · SCORE', 'color: #94a3b8;');
        console.log('%c   Usa: window.apeEliteGenerator.generateAndDownload()', 'color: #10b981;');
    }

})(window);
