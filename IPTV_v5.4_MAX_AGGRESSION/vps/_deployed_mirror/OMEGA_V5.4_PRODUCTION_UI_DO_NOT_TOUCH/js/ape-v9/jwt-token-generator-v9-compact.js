/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔐 JWT TOKEN GENERATOR v9 - COMPACT MODE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Genera JWT compactos de ~40 campos esenciales (~800 caracteres)
 * Los 28 campos restantes se migran a EXTVLCOPT, KODIPROP y EXT-X-APE
 * 
 * Compatibilidad: OTT Navigator, TiviMate, Smarters (URLs cortas)
 * 
 * @version 9.1.0-COMPACT
 * @architecture APE_COMPACT_JWT
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '9.1.0-COMPACT';
    const MAX_JWT_LENGTH = 1200; // Máximo ~1200 chars para URL total < 2000

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════════════════════════

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function generateNonce() {
        return Array.from({ length: 32 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    function base64UrlEncode(str) {
        try {
            const base64 = btoa(unescape(encodeURIComponent(str)));
            return base64
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        } catch (e) {
            console.error('Error encoding JWT:', e);
            return '';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JWT COMPACTO - 40 CAMPOS ESENCIALES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Genera JWT compacto con referencia de perfil (P0-P5)
     * El código de perfil lleva implícitas TODAS las características:
     *   P0 = 8K_ULTRA_EXTREME (7680x4320, AV1, 80Mbps)
     *   P1 = 8K_SUPREME (3840x2160@60, HEVC, 45Mbps)
     *   P2 = 4K_EXTREME (3840x2160@30, HEVC, 30Mbps)
     *   P3 = FHD_ADVANCED (1920x1080, HEVC, 8Mbps)
     *   P4 = HD_STABLE (1280x720, H264, 4.5Mbps)
     *   P5 = SD_FAILSAFE (854x480, H264, 1.5Mbps)
     *
     * @param {Object} channel - Datos del canal
     * @param {Object|string} profile - Perfil de calidad (P0-P5) o string
     * @param {number} index - Índice del canal
     * @returns {string} JWT compacto codificado en Base64URL (~300 chars)
     */
    function generateCompactJWT(channel, profile, index) {
        const now = Math.floor(Date.now() / 1000);
        const oneYear = 365 * 24 * 60 * 60;

        // Resolver profile ID: puede ser string "P3" u objeto con .name
        const profileId = (typeof profile === 'string') ? profile : (profile?.name || 'P3');

        // ═══════════════════════════════════════════════════════════════════
        // JWT COMPACTO — ~10 CAMPOS CON REFERENCIA DE PERFIL
        // El receptor lee "p":"P3" y conoce TODAS las reglas implícitas
        // ═══════════════════════════════════════════════════════════════════

        const header = { alg: 'HS256', typ: 'JWT', mode: 'profile-ref' };

        const payload = {
            // ── Auth básico (6 campos) ──────────────────────────────────
            iss: `APE_COMPACT_v${VERSION}`,
            iat: now,
            exp: now + oneYear,
            sub: String(channel.stream_id || channel.num || index),
            jti: `j_${generateRandomString(8)}_${index}`,
            nonce: generateNonce(),

            // ── Referencia de Perfil (1 campo = TODAS las características) ─
            // P0-P5 define: resolución, codec, bitrate, buffer, prefetch,
            // evasión, HDR, audio, reconnect, throughput, strategy, etc.
            p: profileId,

            // ── Canal (1 campo) ─────────────────────────────────────────
            c: String(channel.stream_id || channel.num || index),

            // ── Fingerprint (1 campo) ───────────────────────────────────
            fp: (window.DeviceFingerprintCollector?._cache?.unique_hash?.substring(0, 20))
                || ('FP_' + generateRandomString(16)),

            // ── Versión & Arquitectura (1 campo) ────────────────────────
            v: VERSION
        };

        // Construir JWT: header.payload.signature
        const headerB64 = base64UrlEncode(JSON.stringify(header));
        const payloadB64 = base64UrlEncode(JSON.stringify(payload));
        const signature = generateRandomString(43); // Simulación de firma

        const jwt = `${headerB64}.${payloadB64}.${signature}`;

        // Log tamaño (~250-350 chars esperado)
        if (jwt.length > MAX_JWT_LENGTH) {
            console.warn(`⚠️ [COMPACT-JWT] Token excede límite: ${jwt.length} > ${MAX_JWT_LENGTH}`);
        } else {
            console.log(`📦 [COMPACT-JWT] Profile-ref JWT: ${jwt.length} chars (profile: ${profileId})`);
        }

        return jwt;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CAMPOS MIGRADOS A M3U8 HEADERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Retorna los campos que deben ir en EXTVLCOPT (8 campos)
     */
    function getEXTVLCOPTFields(profile) {
        return {
            hdr_support: profile.hdr_support || ['hdr10', 'hdr10+'],
            color_depth: profile.color_depth || 10,
            audio_channels: profile.audio_channels || 6,
            reconnect_timeout_ms: profile.reconnect_timeout_ms || 30,
            reconnect_max_attempts: profile.reconnect_max_attempts || 100,
            availability_target: profile.availability_target || 99.99,
            throughput_t1: profile.throughput_t1 || 3.9,
            throughput_t2: profile.throughput_t2 || 4.8
        };
    }

    /**
     * Retorna los campos que deben ir en KODIPROP (8 campos)
     */
    function getKODIPROPFields(profile) {
        return {
            prefetch_segments: profile.prefetch_segments || 15,
            prefetch_parallel: profile.prefetch_parallel || 6,
            prefetch_buffer_target: profile.prefetch_buffer_target || 30000,
            prefetch_min_bandwidth: profile.prefetch_min_bandwidth || 70000000,
            prefetch_adaptive: true,
            prefetch_ai_enabled: true,
            prefetch_strategy: 'ultra-aggressive',
            prefetch_priority: 'quality'
        };
    }

    /**
     * Retorna los campos que deben ir en EXT-X-APE (12 campos)
     */
    function getEXTXAPEFields(profile) {
        return {
            isp_evasion_level: 3,
            cdn_priority: 'premium',
            geo_resilience: true,
            proxy_rotation: true,
            bandwidth_guarantee: 150,
            quality_enhancement: 300,
            zero_interruptions: true,
            invisibility_enabled: true,
            fp_device: 'desktop',
            fp_platform: typeof navigator !== 'undefined' ? navigator.platform : 'Win32',
            fp_screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '1920x1080',
            fp_session: generateRandomString(32)
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════════

    const CompactJWTGenerator = {
        VERSION,
        MAX_JWT_LENGTH,

        generate: generateCompactJWT,
        generateCompactJWT,

        // Campos migrados
        getEXTVLCOPTFields,
        getKODIPROPFields,
        getEXTXAPEFields,

        // Utilidades
        estimateJWTLength: (channel, profile) => {
            const jwt = generateCompactJWT(channel, profile, 0);
            return jwt.length;
        },

        isWithinLimit: (jwt) => jwt.length <= MAX_JWT_LENGTH,

        // Info
        getFieldCount: () => ({
            jwt: 10,       // Profile-ref: auth(6) + profile(1) + channel(1) + fp(1) + version(1)
            extvlcopt: 8,
            kodiprop: 8,
            extxape: 12,
            total: 38      // 10 in JWT + 28 in M3U8 headers
        })
    };

    // Exponer globalmente
    window.CompactJWTGenerator = CompactJWTGenerator;

    console.log(`%c🔐 Compact JWT Generator v${VERSION} cargado - 40 campos JWT, 28 campos migrados`,
        'color: #10b981; font-weight: bold;');

})();
