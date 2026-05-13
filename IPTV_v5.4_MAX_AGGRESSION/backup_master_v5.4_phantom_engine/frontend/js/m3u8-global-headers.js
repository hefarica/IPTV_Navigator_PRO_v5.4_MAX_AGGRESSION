/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 M3U8 GLOBAL HEADERS MODULE v3.0 — ALL HEADERS × 4 PROTOCOLS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lee TODOS los headers desde ULTRA_HEADERS_MATRIX (100+).
 * Los valores dinámicos son resueltos por generators en runtime.
 * Los valores estáticos se cablean desde el UI (HeadersManagerUI).
 *
 * Output en 4 formatos de protocolo:
 *   1. #EXTVLCOPT:http-header:Name=Value    (VLC / OTT / Tivimate / Smarters)
 *   2. #KODIPROP:inputstream.adaptive.http_headers=Name=Value  (Kodi)
 *   3. #EXT-X-APE-HTTP-HEADER:Name=Value    (APE Engine metadata)
 *   4. #EXT-X-HEADER:Name=Value             (Generic HLS extension)
 *
 * FECHA: 2026-02-07 | VERSION: 3.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // RESOLUCIÓN DINÁMICA — Lee TODOS los headers del frontend
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Obtiene TODOS los headers con valor no vacío del ULTRA_HEADERS_MATRIX
     * para el nivel activo del HeadersManagerUI.
     *
     * @param {Object} [channel] - Canal actual (para generadores dinámicos)
     * @param {Object} [server]  - Servidor actual
     * @returns {Object} Map { headerName: resolvedValue }
     */
    function getResolvedHeaders(channel, server) {
        const matrix = window.ULTRA_HEADERS_MATRIX;
        const ui = window.headersManagerUI;

        if (!matrix) {
            console.warn('[M3U8-GlobalHeaders] ULTRA_HEADERS_MATRIX no disponible');
            return {};
        }

        // Nivel activo del UI (default: 3 = ADVANCED)
        const activeLevel = (ui && ui.activeLevel) ? ui.activeLevel : 3;

        // Usar getAllHeadersForLevel — ya resuelve generators y placeholders
        const raw = matrix.getAllHeadersForLevel(activeLevel, channel || {}, server || {});

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
        for (const [key, value] of Object.entries(raw)) {
            if (BANNED.has(key)) continue;
            if (BANNED_PREFIXES.some(p => key.startsWith(p))) continue;
            clean[key] = value;
        }

        return clean;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROTOCOLO 1: #EXTVLCOPT (VLC / OTT Navigator / Tivimate / Smarters)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @param {Object} headers - Map {name: value}
     * @returns {string}
     */
    function formatEXTVLCOPT(headers) {
        let block = '';
        for (const [name, value] of Object.entries(headers)) {
            block += `#EXTVLCOPT:http-header:${name}=${value}\n`;
        }
        return block;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROTOCOLO 2: #KODIPROP (Kodi inputstream.adaptive)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @param {Object} headers
     * @returns {string}
     */
    function formatKODIPROP(headers) {
        let block = '';
        for (const [name, value] of Object.entries(headers)) {
            block += `#KODIPROP:inputstream.adaptive.http_headers=${name}=${value}\n`;
        }
        return block;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROTOCOLO 3: #EXT-X-APE-HTTP-HEADER (APE Engine metadata)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @param {Object} headers
     * @returns {string}
     */
    function formatEXTXAPE(headers) {
        let block = '';
        for (const [name, value] of Object.entries(headers)) {
            block += `#EXT-X-APE-HTTP-HEADER:${name}=${value}\n`;
        }
        return block;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROTOCOLO 4: #EXT-X-HEADER (Generic HLS extension)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @param {Object} headers
     * @returns {string}
     */
    function formatEXTXHEADER(headers) {
        let block = '';
        for (const [name, value] of Object.entries(headers)) {
            block += `#EXT-X-HEADER:${name}=${value}\n`;
        }
        return block;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERADORES DE BLOQUES (usados por los motores de generación)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Bloque GLOBAL (después de #EXTM3U) — 4 protocolos
     * @param {Object} [channel]
     * @param {Object} [server]
     * @returns {string}
     */
    function generateGlobalHeaderBlock(channel, server) {
        const headers = getResolvedHeaders(channel, server);
        const count = Object.keys(headers).length;

        let block = '\n';
        block += `# ════════════════════════════════════════════════════════\n`;
        block += `# 🌐 GLOBAL HTTP HEADERS (${count} headers × 4 protocols)\n`;
        block += `# ════════════════════════════════════════════════════════\n`;

        // Protocol 1: EXTVLCOPT
        block += `# ── VLC / OTT Navigator / Tivimate / Smarters ──\n`;
        block += formatEXTVLCOPT(headers);

        // Protocol 2: KODIPROP
        block += `# ── Kodi (inputstream.adaptive) ──\n`;
        block += formatKODIPROP(headers);

        // Protocol 3: EXT-X-APE
        block += `# ── APE Engine Metadata ──\n`;
        block += formatEXTXAPE(headers);

        // Protocol 4: EXT-X-HEADER
        block += `# ── Generic HLS Extension ──\n`;
        block += formatEXTXHEADER(headers);

        block += `# ════════════════════════════════════════════════════════\n`;
        return block;
    }

    /**
     * Bloque PER-CHANNEL (antes de cada URL) — 4 protocolos
     * @param {Object} [channel]
     * @param {Object} [server]
     * @returns {string}
     */
    function generateChannelHeaderBlock(channel, server) {
        const headers = getResolvedHeaders(channel, server);

        let block = '';

        // Protocol 1: EXTVLCOPT
        block += formatEXTVLCOPT(headers);

        // Protocol 2: KODIPROP
        block += formatKODIPROP(headers);

        // Protocol 3: EXT-X-APE
        block += formatEXTXAPE(headers);

        // Protocol 4: EXT-X-HEADER
        block += formatEXTXHEADER(headers);

        return block;
    }

    /**
     * URL pipe-encoded headers
     * @param {Object} [channel]
     * @param {Object} [server]
     * @returns {string}
     */
    function generatePipeHeaderString(channel, server) {
        const headers = getResolvedHeaders(channel, server);
        const parts = [];

        for (const [name, value] of Object.entries(headers)) {
            const encodedValue = value
                .replace(/ /g, '+')
                .replace(/=/g, '%3D');
            parts.push(`${name}=${encodedValue}`);
        }

        return parts.join('&');
    }

    /**
     * @returns {Object} headers resueltos
     */
    function getHeaders(channel, server) {
        return getResolvedHeaders(channel, server);
    }

    /**
     * @returns {number} total de headers con valor no vacío
     */
    function getHeaderCount(channel, server) {
        return Object.keys(getResolvedHeaders(channel, server)).length;
    }

    /**
     * Info de fuente y estado
     */
    function getSourceInfo() {
        const matrix = window.ULTRA_HEADERS_MATRIX;
        const ui = window.headersManagerUI;
        return {
            source: matrix ? 'ULTRA_HEADERS_MATRIX' : 'NONE',
            activeLevel: (ui && ui.activeLevel) ? ui.activeLevel : 3,
            totalRegistered: matrix ? Object.keys(matrix.headers).length : 0,
            matrixAvailable: !!matrix,
            uiAvailable: !!ui,
            protocols: ['EXTVLCOPT', 'KODIPROP', 'EXT-X-APE-HTTP-HEADER', 'EXT-X-HEADER']
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INDIVIDUAL PROTOCOL GENERATORS (for per-file output)
    // ═══════════════════════════════════════════════════════════════════════

    function generateEXTVLCOPTBlock(channel, server) {
        return formatEXTVLCOPT(getResolvedHeaders(channel, server));
    }

    function generateKODIPROPBlock(channel, server) {
        return formatKODIPROP(getResolvedHeaders(channel, server));
    }

    function generateEXTXAPEBlock(channel, server) {
        return formatEXTXAPE(getResolvedHeaders(channel, server));
    }

    function generateEXTXHEADERBlock(channel, server) {
        return formatEXTXHEADER(getResolvedHeaders(channel, server));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GLOBAL EXPOSURE
    // ═══════════════════════════════════════════════════════════════════════

    window.M3U8_GLOBAL_HEADERS = {
        // Core generators (used by ape-engine-v9 and m3u8-generator-architecture1)
        generateGlobalHeaderBlock,
        generateChannelHeaderBlock,
        generatePipeHeaderString,

        // Individual protocol generators
        generateEXTVLCOPTBlock,
        generateKODIPROPBlock,
        generateEXTXAPEBlock,
        generateEXTXHEADERBlock,

        // Data access
        getHeaders,
        getHeaderCount,
        getResolvedHeaders,
        getSourceInfo,

        VERSION: '3.0.0'
    };

    // Startup log
    const matrix = window.ULTRA_HEADERS_MATRIX;
    const total = matrix ? Object.keys(matrix.headers).length : 0;
    console.log(
        `%c✅ M3U8 Global Headers v3.0 — ${total} headers × 4 protocols (EXTVLCOPT / KODIPROP / EXT-X-APE / EXT-X-HEADER)`,
        'color: #4caf50; font-weight: bold;'
    );

})();
