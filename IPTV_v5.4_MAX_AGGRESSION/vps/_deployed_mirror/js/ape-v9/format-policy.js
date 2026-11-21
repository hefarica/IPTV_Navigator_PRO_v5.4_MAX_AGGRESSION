/**
 * ═══════════════════════════════════════════════════════════════
 * 🧩 APE FORMAT POLICY — Etapa 1 del plan "Integración sin /resolve/"
 * ═══════════════════════════════════════════════════════════════
 *
 * Política formal de serialización + canonicalizador de parámetros.
 *
 * Doctrina:
 *   - Parámetros operativos simples → RAW
 *   - Payloads estructurados → JSON_MIN (nunca JSON legible en URL)
 *   - Credenciales / claims → JWT solo si es necesario
 *   - Binario en URL → BASE64URL (nunca BASE64 clásico)
 *   - Hashes / huellas cortas → HEX
 *   - Canonical: mismo conjunto de params → misma URL bit-a-bit (idempotencia)
 *
 * API pública:
 *   APEFormatPolicy.FORMAT            → enum de formatos
 *   APEFormatPolicy.POLICY_TABLE      → array {format, useCase, preferenceOver, notes}
 *   APEFormatPolicy.getPreferredFor(useCase)    → string (formato preferido)
 *   APEFormatPolicy.serialize(payload, format)  → string
 *   APEFormatPolicy.canonicalize(params)        → string querystring canónica
 *   APEFormatPolicy.canonicalizeUrl(url)        → string URL con query canonicalizada
 *   APEFormatPolicy.base64UrlEncode(str)        → base64url
 *   APEFormatPolicy.base64UrlDecode(b64url)     → string
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const FORMAT = Object.freeze({
        RAW:        'raw',
        JSON:       'json',
        JSON_MIN:   'json_min',
        JWT_HS256:  'jwt_hs256',
        JWT_RS256:  'jwt_rs256',
        BASE64:     'base64',
        BASE64URL:  'base64url',
        HEX:        'hex',
    });

    const USE_CASE = Object.freeze({
        URL_PARAM_SIMPLE:       'url_param_simple',       // stream_id, profile, etc.
        URL_PAYLOAD_STRUCTURED: 'url_payload_structured', // bloque EXTHTTP embebido
        AUTH_CREDENTIAL:        'auth_credential',        // username/password, token
        SIGNATURE_SHORT:        'signature_short',        // HMAC, hash huella
        BINARY_IN_URL:          'binary_in_url',          // bytes crudos en URL
    });

    const POLICY_TABLE = Object.freeze([
        { format: FORMAT.RAW,       useCase: USE_CASE.URL_PARAM_SIMPLE,       preferenceOver: [],                      notes: 'Preferido para parámetros operativos simples.' },
        { format: FORMAT.JSON_MIN,  useCase: USE_CASE.URL_PAYLOAD_STRUCTURED, preferenceOver: [FORMAT.JSON],           notes: 'Preferido frente a JSON legible.' },
        { format: FORMAT.JSON,      useCase: USE_CASE.URL_PAYLOAD_STRUCTURED, preferenceOver: [],                      notes: 'Admitido solo si JSON_MIN no aplica.' },
        { format: FORMAT.JWT_HS256, useCase: USE_CASE.AUTH_CREDENTIAL,        preferenceOver: [],                      notes: 'Firma simétrica. Entornos cerrados.' },
        { format: FORMAT.JWT_RS256, useCase: USE_CASE.AUTH_CREDENTIAL,        preferenceOver: [FORMAT.JWT_HS256],      notes: 'Firma asimétrica. Separación emisor/verificador.' },
        { format: FORMAT.BASE64URL, useCase: USE_CASE.BINARY_IN_URL,          preferenceOver: [FORMAT.BASE64],         notes: 'Preferido sobre BASE64 para URL-safe.' },
        { format: FORMAT.BASE64,    useCase: USE_CASE.BINARY_IN_URL,          preferenceOver: [],                      notes: 'Evitar en URL. Solo body.' },
        { format: FORMAT.HEX,       useCase: USE_CASE.SIGNATURE_SHORT,        preferenceOver: [],                      notes: 'Para hashes/huellas cortas.' },
    ]);

    // Build reverse index { useCase → format preferido }
    const PREFERRED_BY_USE_CASE = (() => {
        const map = Object.create(null);
        // Sort by preference: el que NO tiene preferenceOver para este useCase pero está sobre otros → preferido
        for (const entry of POLICY_TABLE) {
            const uc = entry.useCase;
            const current = map[uc];
            if (!current) {
                map[uc] = entry.format;
                continue;
            }
            // Si este entry prefiere sobre el current, reemplaza
            if (entry.preferenceOver.includes(current)) {
                map[uc] = entry.format;
            }
        }
        return Object.freeze(map);
    })();

    function getPreferredFor(useCase) {
        return PREFERRED_BY_USE_CASE[useCase] || FORMAT.RAW;
    }

    // ── Serializers ─────────────────────────────────────────────

    function serialize(payload, format) {
        switch (format) {
            case FORMAT.RAW:
                return String(payload);
            case FORMAT.JSON:
                return JSON.stringify(payload, null, 2);
            case FORMAT.JSON_MIN:
                return JSON.stringify(payload);
            case FORMAT.BASE64:
                return base64Encode(payload);
            case FORMAT.BASE64URL:
                return base64UrlEncode(payload);
            case FORMAT.HEX:
                return hexEncode(payload);
            case FORMAT.JWT_HS256:
            case FORMAT.JWT_RS256:
                // JWT requiere una clave + firma; no se construye aquí.
                // Este módulo solo define la política; la firma la hace jwt-token-generator-v9.js.
                throw new Error(`serialize(${format}): JWT no puede firmarse aquí. Usa jwt-token-generator-v9.`);
            default:
                throw new Error(`serialize: formato desconocido "${format}"`);
        }
    }

    // ── Codecs base64 / hex (implementaciones mínimas seguras en browser) ─

    function _toBytes(input) {
        if (typeof input === 'string') {
            if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(input);
            // Fallback: bytes latin-1
            const b = new Uint8Array(input.length);
            for (let i = 0; i < input.length; i++) b[i] = input.charCodeAt(i) & 0xff;
            return b;
        }
        if (input instanceof Uint8Array) return input;
        if (Array.isArray(input)) return new Uint8Array(input);
        return new Uint8Array(0);
    }

    function base64Encode(input) {
        const bytes = _toBytes(input);
        if (typeof btoa !== 'undefined') {
            let s = '';
            for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
            return btoa(s);
        }
        if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
        throw new Error('base64Encode: no btoa/Buffer disponible');
    }

    function base64UrlEncode(input) {
        return base64Encode(input)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function base64UrlDecode(b64url) {
        let s = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4;
        if (pad === 2) s += '==';
        else if (pad === 3) s += '=';
        else if (pad !== 0) throw new Error('base64UrlDecode: longitud inválida');
        if (typeof atob !== 'undefined') {
            const decoded = atob(s);
            if (typeof TextDecoder !== 'undefined') {
                const bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
                return new TextDecoder().decode(bytes);
            }
            return decoded;
        }
        if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('utf-8');
        throw new Error('base64UrlDecode: no atob/Buffer disponible');
    }

    function hexEncode(input) {
        const bytes = _toBytes(input);
        const out = new Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            out[i] = bytes[i].toString(16).padStart(2, '0');
        }
        return out.join('');
    }

    // ── Canonicalizer (idempotencia de URL) ───────────────────────

    /**
     * Dado un objeto o string de query, devuelve una querystring con:
     *   - Claves ordenadas alfabéticamente
     *   - Valores encoded una sola vez con encodeURIComponent
     *   - Sin claves con valor undefined/null
     *   - Claves duplicadas se preservan (orden: por key, luego por valor)
     * Sin signo de interrogación inicial.
     */
    function canonicalize(params) {
        let pairs = [];
        if (params == null) return '';

        if (typeof params === 'string') {
            // Quitar "?" inicial si existe
            const qs = params.replace(/^\?/, '');
            if (!qs) return '';
            for (const part of qs.split('&')) {
                if (!part) continue;
                const eq = part.indexOf('=');
                const k = eq < 0 ? part : part.slice(0, eq);
                const v = eq < 0 ? '' : part.slice(eq + 1);
                if (!k) continue;
                // Decodificar para re-encodear consistentemente
                let dk, dv;
                try { dk = decodeURIComponent(k.replace(/\+/g, ' ')); } catch { dk = k; }
                try { dv = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { dv = v; }
                pairs.push([dk, dv]);
            }
        } else if (typeof params === 'object') {
            for (const k of Object.keys(params)) {
                const v = params[k];
                if (v === undefined || v === null) continue;
                if (Array.isArray(v)) {
                    for (const vi of v) {
                        if (vi === undefined || vi === null) continue;
                        pairs.push([k, String(vi)]);
                    }
                } else {
                    pairs.push([k, String(v)]);
                }
            }
        }

        // Orden determinístico: alfabético por key, tiebreaker por value
        pairs.sort((a, b) => {
            if (a[0] < b[0]) return -1;
            if (a[0] > b[0]) return 1;
            if (a[1] < b[1]) return -1;
            if (a[1] > b[1]) return 1;
            return 0;
        });

        const encode = (s) => encodeURIComponent(String(s))
            .replace(/%20/g, '+')          // espacios como + (form style)
            .replace(/'/g, '%27')          // seguro para URLs
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29');

        return pairs.map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
    }

    /**
     * Devuelve la URL con su query string canonicalizado.
     * Preserva scheme, user:pass, host, port, path, fragment. Solo reordena query.
     */
    function canonicalizeUrl(url) {
        if (!url) return '';
        const str = String(url);
        const hashIdx = str.indexOf('#');
        const fragment = hashIdx >= 0 ? str.slice(hashIdx) : '';
        const noHash = hashIdx >= 0 ? str.slice(0, hashIdx) : str;
        const qIdx = noHash.indexOf('?');
        if (qIdx < 0) return str;
        const base = noHash.slice(0, qIdx);
        const query = noHash.slice(qIdx + 1);
        const canonical = canonicalize(query);
        return canonical ? `${base}?${canonical}${fragment}` : `${base}${fragment}`;
    }

    const runtime = {
        FORMAT,
        USE_CASE,
        POLICY_TABLE,
        getPreferredFor,
        serialize,
        canonicalize,
        canonicalizeUrl,
        base64Encode,
        base64UrlEncode,
        base64UrlDecode,
        hexEncode,
    };

    if (typeof window !== 'undefined') window.APEFormatPolicy = runtime;
    if (typeof globalThis !== 'undefined') globalThis.APEFormatPolicy = runtime;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = runtime;
    }
})();
