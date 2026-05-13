/**
 * ═══════════════════════════════════════════════════════════════
 * 🎭 APE MIME POLICY — Etapa 1 del plan "Integración sin /resolve/"
 * ═══════════════════════════════════════════════════════════════
 *
 * Tabla formal de MIMEs permitidos por rol de publicación.
 * Doctrina: ninguna URL entra a la lista final si el Content-Type real
 * no coincide con el papel que dice cumplir.
 *
 * Usado por:
 *   - format-policy.js (canonicalización de query)
 *   - prepublish-checker (Etapa 3): validación HTTP + MIME antes de emitir
 *   - publication-gate (Etapa 4): verificación post-emisión con umbral mime_match_ratio
 *   - m3u8-typed-arrays-ultimate.js (Etapa 2): selección de URL terminal por MIME
 *
 * API pública:
 *   APEMimePolicy.ROLE               → enum de roles
 *   APEMimePolicy.DISPOSITION        → enum de disposiciones
 *   APEMimePolicy.POLICY_TABLE       → array de 15 entradas {mime, role, disposition, notes}
 *   APEMimePolicy.getDisposition(mime, role)    → 'preferred'|'admitted'|'restricted'|'forbidden'
 *   APEMimePolicy.isAllowedForPlaylist(mime)    → boolean
 *   APEMimePolicy.isAllowedForSegment(mime)     → boolean
 *   APEMimePolicy.matchesDeclaredRole(mime, declaredRole) → boolean
 *   APEMimePolicy.normalize(rawContentType)     → string MIME sin charset/params
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const ROLE = Object.freeze({
        PLAYLIST_HLS:   'playlist_hls',     // master/media m3u8
        PLAYLIST_DASH:  'playlist_dash',    // mpd
        SEGMENT_TS:     'segment_ts',       // mpegts
        SEGMENT_CMAF:   'segment_cmaf',     // fMP4 init/media
        AUDIO_TRACK:    'audio_track',
        SUBTITLE:       'subtitle',
        METADATA:       'metadata',         // EXTHTTP body / API JSON
        AUTH_TOKEN:     'auth_token',       // JWT
        BINARY_OPAQUE:  'binary_opaque',    // blob cifrado / init data
        FORM_HANDSHAKE: 'form_handshake',   // login POST
    });

    const DISPOSITION = Object.freeze({
        PREFERRED:  'preferred',
        ADMITTED:   'admitted',
        RESTRICTED: 'restricted',
        FORBIDDEN:  'forbidden',
    });

    const POLICY_TABLE = Object.freeze([
        { mime: 'application/vnd.apple.mpegurl', role: ROLE.PLAYLIST_HLS,   disposition: DISPOSITION.PREFERRED,  notes: 'HLS master/media oficial. Preferido para listas finales.' },
        { mime: 'application/x-mpegurl',         role: ROLE.PLAYLIST_HLS,   disposition: DISPOSITION.ADMITTED,   notes: 'HLS legacy. Admitido por compatibilidad.' },
        { mime: 'application/dash+xml',          role: ROLE.PLAYLIST_DASH,  disposition: DISPOSITION.ADMITTED,   notes: 'DASH manifest. Solo perfiles compatibles.' },
        { mime: 'video/mp2t',                    role: ROLE.SEGMENT_TS,     disposition: DISPOSITION.ADMITTED,   notes: 'MPEG-TS segments. Fallback HLS-TS.' },
        { mime: 'video/iso.segment',             role: ROLE.SEGMENT_CMAF,   disposition: DISPOSITION.ADMITTED,   notes: 'fMP4 segment. CMAF/fMP4.' },
        { mime: 'application/mp4',               role: ROLE.SEGMENT_CMAF,   disposition: DISPOSITION.ADMITTED,   notes: 'CMAF init/segment.' },
        { mime: 'audio/aac',                     role: ROLE.AUDIO_TRACK,    disposition: DISPOSITION.ADMITTED,   notes: 'AAC audio track.' },
        { mime: 'audio/mp4',                     role: ROLE.AUDIO_TRACK,    disposition: DISPOSITION.ADMITTED,   notes: 'fMP4 audio track.' },
        { mime: 'text/vtt',                      role: ROLE.SUBTITLE,       disposition: DISPOSITION.ADMITTED,   notes: 'WebVTT subtitles (HTML5).' },
        { mime: 'application/ttml+xml',          role: ROLE.SUBTITLE,       disposition: DISPOSITION.ADMITTED,   notes: 'TTML subtitles (SMPTE/OTT).' },
        { mime: 'application/json',              role: ROLE.METADATA,       disposition: DISPOSITION.RESTRICTED, notes: 'Solo metadatos / EXTHTTP body auxiliar. Nunca como URL principal.' },
        { mime: 'application/jwt',               role: ROLE.AUTH_TOKEN,     disposition: DISPOSITION.RESTRICTED, notes: 'Transporte de JWT. Restringido a auth.' },
        { mime: 'application/octet-stream',      role: ROLE.BINARY_OPAQUE,  disposition: DISPOSITION.RESTRICTED, notes: 'Blob cifrado o init data. Nunca playlist.' },
        { mime: 'text/plain',                    role: ROLE.METADATA,       disposition: DISPOSITION.RESTRICTED, notes: 'Solo interoperabilidad auxiliar.' },
        { mime: 'application/x-www-form-urlencoded', role: ROLE.FORM_HANDSHAKE, disposition: DISPOSITION.RESTRICTED, notes: 'Login/handshake POST.' },
    ]);

    // Build index { mime → entry } for O(1) lookup
    const INDEX = (() => {
        const idx = Object.create(null);
        for (const entry of POLICY_TABLE) idx[entry.mime] = entry;
        return idx;
    })();

    /**
     * Normaliza un Content-Type crudo a solo el MIME (sin charset, boundary, etc).
     * Ejemplo: 'application/vnd.apple.mpegurl; charset=utf-8' → 'application/vnd.apple.mpegurl'
     */
    function normalize(rawContentType) {
        if (!rawContentType) return '';
        return String(rawContentType).split(';')[0].trim().toLowerCase();
    }

    /**
     * Devuelve la entrada de policy para un MIME (normalizado), o null si no existe.
     */
    function _lookup(mime) {
        return INDEX[normalize(mime)] || null;
    }

    /**
     * Disposición de un MIME (preferred/admitted/restricted/forbidden).
     * Si no está en la tabla → forbidden.
     * Si se pasa un role específico, solo devuelve disposición real si coincide el role.
     */
    function getDisposition(mime, role) {
        const entry = _lookup(mime);
        if (!entry) return DISPOSITION.FORBIDDEN;
        if (role && entry.role !== role) return DISPOSITION.FORBIDDEN;
        return entry.disposition;
    }

    /**
     * ¿Este MIME puede aparecer como URL principal de una playlist HLS?
     * Solo 'preferred' o 'admitted' de rol PLAYLIST_HLS.
     */
    function isAllowedForPlaylist(mime) {
        const d = getDisposition(mime, ROLE.PLAYLIST_HLS);
        return d === DISPOSITION.PREFERRED || d === DISPOSITION.ADMITTED;
    }

    /**
     * ¿Puede aparecer como segmento (TS o CMAF)?
     */
    function isAllowedForSegment(mime) {
        const entry = _lookup(mime);
        if (!entry) return false;
        return (entry.role === ROLE.SEGMENT_TS || entry.role === ROLE.SEGMENT_CMAF)
            && (entry.disposition === DISPOSITION.PREFERRED || entry.disposition === DISPOSITION.ADMITTED);
    }

    /**
     * ¿El MIME real coincide con el rol declarado?
     * Usado por el gate para verificar concordancia MIME-declarado vs MIME-real (umbral 100%).
     */
    function matchesDeclaredRole(mime, declaredRole) {
        const entry = _lookup(mime);
        if (!entry) return false;
        return entry.role === declaredRole;
    }

    /**
     * Devuelve el rol de un MIME normalizado o null si desconocido.
     */
    function getRole(mime) {
        const entry = _lookup(mime);
        return entry ? entry.role : null;
    }

    const runtime = {
        ROLE,
        DISPOSITION,
        POLICY_TABLE,
        normalize,
        getDisposition,
        isAllowedForPlaylist,
        isAllowedForSegment,
        matchesDeclaredRole,
        getRole,
    };

    if (typeof window !== 'undefined') window.APEMimePolicy = runtime;
    if (typeof globalThis !== 'undefined') globalThis.APEMimePolicy = runtime;

    // Node.js / test harness compat
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = runtime;
    }
})();
