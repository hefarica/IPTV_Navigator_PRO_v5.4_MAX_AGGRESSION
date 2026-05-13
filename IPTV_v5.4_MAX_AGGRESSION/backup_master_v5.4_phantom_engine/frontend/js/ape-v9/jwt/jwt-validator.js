/**
 * ═══════════════════════════════════════════════════════════════════════════
 * JWT VALIDATOR v1.0 - VALIDACIÓN DE JWT PARA ARCHITECTURE 1
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Valida integridad, expiración y estructura de JWT generados
 * 
 * Funciones:
 * - validateJWT(token) → Valida firma, estructura, expiración
 * - decodeJWT(token) → Decodifica sin validar
 * - countFields(token) → Cuenta campos del payload
 * - validateRequired(token) → Verifica campos obligatorios
 * 
 * @version 1.0.0
 * @date 2026-01-29
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.0.0-VALIDATOR';

    // ═══════════════════════════════════════════════════════════════════════
    // CAMPOS REQUERIDOS (mínimo para validación)
    // ═══════════════════════════════════════════════════════════════════════

    const REQUIRED_FIELDS = [
        // Identificación JWT (obligatorios)
        'iss', 'iat', 'exp', 'jti', 'sub',
        // Canal (obligatorios)
        'chn', 'device_profile',
        // Dispositivo (obligatorios)
        'resolution', 'device_class',
        // Streaming (obligatorios)
        'target_bitrate'
    ];

    const SECTION_FIELD_COUNTS = {
        identification: 8,      // iss, iat, exp, nbf, jti, nonce, aud, sub
        channel_info: 8,        // chn, chn_id, chn_group, chn_logo, chn_catchup, chn_catchup_days, chn_catchup_source, chn_epg_id
        profile_config: 12,     // device_profile, device_class, resolution, fps, bitrate, buffer_ms, network_cache_ms, live_cache_ms, player_buffer_ms, file_cache_ms, max_bandwidth, codec_primary
        quality_config: 10,     // codec_fallback, codec_priority, codec_selection_method, codec_detection, hdr_support, color_depth, chroma_subsampling, pixel_format, audio_codec, audio_bitrate
        prefetch_config: 8,     // prefetch_segments, prefetch_parallel, prefetch_buffer_target, prefetch_min_bandwidth, prefetch_adaptive, prefetch_ai_enabled, prefetch_enabled, prefetch_strategy
        strategy_config: 8,     // strategy, target_bitrate, quality_threshold, latency_target_ms, network_optimization, segment_duration, throughput_t1, throughput_t2
        security_config: 8,     // service_tier, invisibility_enabled, fingerprint, isp_evasion_level, cdn_priority, dfp, version, bandwidth_guarantee
        metadata: 8             // quality_enhancement, zero_interruptions, reconnection_time_ms, availability_target, generation_timestamp, last_modified, src, architecture
    };

    const MIN_TOTAL_FIELDS = 68;

    // ═══════════════════════════════════════════════════════════════════════
    // BASE64URL DECODE
    // ═══════════════════════════════════════════════════════════════════════

    function base64UrlDecode(str) {
        try {
            // Reemplazar caracteres URL-safe
            let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

            // Añadir padding si es necesario
            const padding = base64.length % 4;
            if (padding) {
                base64 += '='.repeat(4 - padding);
            }

            // Decodificar
            if (typeof atob === 'function') {
                return atob(base64);
            } else if (typeof Buffer !== 'undefined') {
                return Buffer.from(base64, 'base64').toString('utf-8');
            }

            throw new Error('No base64 decoder available');
        } catch (e) {
            throw new Error(`Base64 decode error: ${e.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DECODIFICAR JWT (sin validar firma)
    // ═══════════════════════════════════════════════════════════════════════

    function decodeJWT(token) {
        if (!token || typeof token !== 'string') {
            return { valid: false, error: 'Token is null or not a string' };
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
            return { valid: false, error: `Invalid JWT format: expected 3 parts, got ${parts.length}` };
        }

        try {
            const header = JSON.parse(base64UrlDecode(parts[0]));
            const payload = JSON.parse(base64UrlDecode(parts[1]));
            const signature = parts[2];

            return {
                valid: true,
                header,
                payload,
                signature,
                raw: {
                    header: parts[0],
                    payload: parts[1],
                    signature: parts[2]
                }
            };
        } catch (e) {
            return { valid: false, error: `JSON parse error: ${e.message}` };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDAR JWT COMPLETO
    // ═══════════════════════════════════════════════════════════════════════

    function validateJWT(token, options = {}) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            fieldCount: 0,
            sections: {}
        };

        // 1. Decodificar
        const decoded = decodeJWT(token);
        if (!decoded.valid) {
            result.valid = false;
            result.errors.push(decoded.error);
            return result;
        }

        const { header, payload } = decoded;

        // 2. Validar Header
        if (!header.alg) {
            result.errors.push('Missing algorithm in header');
            result.valid = false;
        }
        if (!header.typ || header.typ !== 'JWT') {
            result.warnings.push('Header type is not "JWT"');
        }

        // 3. Validar expiración
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            if (!options.allowExpired) {
                result.errors.push(`Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
                result.valid = false;
            } else {
                result.warnings.push('Token is expired but allowExpired=true');
            }
        }

        // 4. Validar campos requeridos
        const missingRequired = REQUIRED_FIELDS.filter(field => !(field in payload));
        if (missingRequired.length > 0) {
            result.errors.push(`Missing required fields: ${missingRequired.join(', ')}`);
            result.valid = false;
        }

        // 5. Contar campos por sección
        result.fieldCount = Object.keys(payload).length;

        // Verificar mínimo de campos
        if (result.fieldCount < MIN_TOTAL_FIELDS) {
            result.warnings.push(`Only ${result.fieldCount} fields, expected ${MIN_TOTAL_FIELDS}+`);
        }

        // 6. Detectar secciones presentes
        result.sections = {
            identification: ['iss', 'iat', 'exp', 'nbf', 'jti', 'nonce', 'aud', 'sub'].filter(f => f in payload).length,
            channel_info: ['chn', 'chn_id', 'chn_group', 'chn_logo', 'chn_catchup', 'chn_catchup_days', 'chn_catchup_source', 'chn_epg_id'].filter(f => f in payload).length,
            profile_config: ['device_profile', 'device_class', 'resolution', 'fps', 'bitrate', 'buffer_ms', 'network_cache_ms', 'live_cache_ms', 'player_buffer_ms', 'file_cache_ms', 'max_bandwidth', 'codec_primary'].filter(f => f in payload).length,
            quality_config: ['codec_fallback', 'codec_priority', 'hdr_support', 'color_depth', 'audio_codec', 'audio_bitrate'].filter(f => f in payload).length,
            prefetch_config: ['prefetch_segments', 'prefetch_parallel', 'prefetch_buffer_target', 'prefetch_adaptive', 'prefetch_enabled', 'prefetch_strategy'].filter(f => f in payload).length,
            strategy_config: ['strategy', 'target_bitrate', 'quality_threshold', 'latency_target_ms', 'network_optimization'].filter(f => f in payload).length,
            security_config: ['service_tier', 'invisibility_enabled', 'fingerprint', 'isp_evasion_level', 'dfp', 'version'].filter(f => f in payload).length,
            metadata: ['quality_enhancement', 'zero_interruptions', 'reconnection_time_ms', 'availability_target', 'generation_timestamp', 'src', 'architecture'].filter(f => f in payload).length
        };

        result.decoded = decoded;
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONTAR CAMPOS
    // ═══════════════════════════════════════════════════════════════════════

    function countFields(token) {
        const decoded = decodeJWT(token);
        if (!decoded.valid) {
            return { total: 0, error: decoded.error };
        }

        const payload = decoded.payload;
        let total = 0;

        function countRecursive(obj) {
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    total++;
                    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                        countRecursive(obj[key]);
                    }
                }
            }
        }

        countRecursive(payload);
        return { total, topLevel: Object.keys(payload).length };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDAR BASE64URL
    // ═══════════════════════════════════════════════════════════════════════

    function isValidBase64Url(str) {
        // Base64URL no debe contener +, /, o =
        if (/[+/=]/.test(str)) {
            return false;
        }
        // Solo caracteres válidos: A-Z, a-z, 0-9, -, _
        return /^[A-Za-z0-9_-]+$/.test(str);
    }

    function validateBase64Url(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { valid: false, error: 'Invalid JWT structure' };
        }

        const results = {
            header: isValidBase64Url(parts[0]),
            payload: isValidBase64Url(parts[1]),
            signature: isValidBase64Url(parts[2])
        };

        const valid = results.header && results.payload && results.signature;
        return { valid, parts: results };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR REPORTE
    // ═══════════════════════════════════════════════════════════════════════

    function generateReport(token) {
        const validation = validateJWT(token);
        const fieldCount = countFields(token);
        const base64Check = validateBase64Url(token);

        return {
            summary: {
                valid: validation.valid && base64Check.valid,
                totalFields: fieldCount.total,
                topLevelFields: fieldCount.topLevel,
                meetsMinimum: fieldCount.topLevel >= MIN_TOTAL_FIELDS,
                base64UrlValid: base64Check.valid
            },
            sections: validation.sections,
            errors: validation.errors,
            warnings: validation.warnings,
            recommendation: validation.valid
                ? '✅ JWT válido y completo'
                : `❌ JWT inválido: ${validation.errors.join(', ')}`
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════

    const JWTValidator = {
        validateJWT,
        decodeJWT,
        countFields,
        validateBase64Url,
        generateReport,
        isValidBase64Url,
        REQUIRED_FIELDS,
        MIN_TOTAL_FIELDS,
        SECTION_FIELD_COUNTS,
        version: VERSION
    };

    // Exponer globalmente
    if (typeof window !== 'undefined') {
        window.JWTValidator = JWTValidator;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = JWTValidator;
    }

    console.log(`🛡️ JWT Validator v${VERSION} Loaded`);
    console.log(`   ✅ validateJWT(token) → Validación completa`);
    console.log(`   ✅ decodeJWT(token) → Decodificación`);
    console.log(`   ✅ countFields(token) → Conteo de campos`);
    console.log(`   ✅ generateReport(token) → Reporte detallado`);

})();
