/* ═══════════════════════════════════════════════════════════════════════════
 * APE 4K / PREMIUM-6K AUDIT ADAPTER v1.0 — ADITIVO, APAGADO POR DEFECTO
 *
 * ⚠️ FLAG MAESTRO: window.APE_4K6K_AUDIT  ·  DEFAULT = 0 (APAGADO)
 *    Con el flag apagado NINGUNA función toca la lista:
 *      · isEnabled()        -> false
 *      · audit()/overlay()  -> sobre inerte, no recorren nada
 *      · enrich(channels)   -> devuelve la MISMA referencia (coste 0)
 *    Semántica alineada con el idiom medido del repo
 *    (`window.APE_8K_DECLARE === true`, BASELINE.md §5.2/§5.3): "ausente" = OFF.
 *    Se acepta además 1 / '1' / 'on' / 'yes' para el flag numérico de la misión.
 *
 * CONTRATO: implementa la semántica de
 *   artifacts/integracion-4k6k/SPEC_ADAPTADOR.md  (contrato exacto Python ⇄ JS)
 * que a su vez describe
 *   .agents/skills/ape-iptv-auditoria-4k-premium6k/scripts/auditar_y_ampliar.py
 * VERSION = 'ape-4k-premium6k-intent/1'. NO duplica ese motor: copia sus
 * nombres de campo y literales (§1.2, §1.3, §1.6, §4, §9).
 *
 * ── QUÉ NO HACE (gates del repo, no negociables) ──────────────────────────
 *  1. NO cambia CODECS / RESOLUTION / VIDEO-RANGE / SUPPLEMENTAL-CODECS.
 *     (§1.7 nota 3: el renombre del Python conserva los atributos tal cual;
 *      aquí ni se renombra — desviación deliberada, ver ADAPTADOR.md.)
 *  2. NO toca #EXTSHIMOTT (ape.extshimott.v1 · additionalProperties=false,
 *     BASELINE.md §2.2 / C1). No añade campos: el audit va por sidecar.
 *  3. NO degrada fuente: 8K conserva su resolución; `preserveHigherSource:true`
 *     + `outputPreference:'preserve_verified_source'` lo declaran (§1.3).
 *  4. NO inventa ids: sólo tvg_id/stream_id/id existentes (§6 caso 10).
 *  5. NO declara executed=true jamás (C7: sólo DECLARED / EXECUTED=0).
 *  6. NO toca QoE.p: perfil visual y perfil de red son ejes separados
 *     (SPEC §4.2, §6 caso 14: se REGISTRA el desajuste, no se "arregla").
 *  7. NO inventa tuning: overlay() LEE window.APE_PROFILES_CONFIG
 *     (ape-profiles-config.js:6584) y lo publica en un bloque ADITIVO aparte.
 *  8. NO emite 6144x3456: ese target es del FFmpeg legacy del VPS, que en
 *     producción es metadata-only (BASELINE §2.9 / C3). El único 6K que se
 *     declara es 5760x3240 (device REA, C5).
 *
 * IDEMPOTENCIA: sin reloj, sin aleatorio, orden de claves fijo.
 * enrich(enrich(x)) === enrich(x) en bytes (SPEC §5.1: igualdad de bytes).
 *
 * UMD puro, sin DOM, sin red, sin dependencias — patrón de
 * frontend/js/ape-v9/streaming/auto-tune-v1.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    var api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) { try { root.APE_4K6K = api; } catch (_) { /* host hostil: no romper carga */ } }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /* ── CONTRATO (literales de SPEC §1.2, §1.6, §4.2) ────────────────────── */
    var FLAG = 'APE_4K6K_AUDIT';
    var SCHEMA_INTENT = 'ape-4k-premium6k-intent/1';   // :18 VERSION
    var SCHEMA_EXTENDS = 'ape.rea-intent/1';           // :70 extends
    var SCHEMA_AUDIT = 'ape-audit/1';                  // :170
    var SCHEMA_ARCHIVE = 'ape-4k6k-audit-original/1';  // envoltorio del archivo de objetos

    var ARCHIVE_FIELD = 'APE-AUDIT-ORIGINAL';          /* formato PYTHON: no lo escribe este adaptador */
    var INTENT_FIELD = 'APE-4K6K-INTENT';              /* sidecar propio de esta integración (fase 2) */
    var OUT_TAG = '#EXT-X-APE-OUTPUT-REQUEST:';
    var PREMIUM_TAG = '#EXT-X-APE-PREMIUM-REQUEST:';
    var LEGACY_TAG = '#EXT-X-APE-AUDIT-ORIGINAL:';
    var INTENT_TAG = '#EXT-X-APE-4K6K-INTENT:';
    var POLICY_TAG = '#EXT-X-APE-AUDIT-POLICY:';
    var REA_TAG = '#EXT-X-APE-REA:';
    var QOE_TAG = '#EXT-X-APE-QOE-CONTRACT:';

    /* §1.6: PROFILES = [f'P{i}{s}' for s in ('', '.5') for i in range(6)] */
    var PROFILE_IDS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5',
                       'P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'];

    /* Herencia REAL medida en el repo: rea-export-finalizer.js `_apeQoeNet`
     * asigna a P0.5 los MISMOS knobs que P0 (idem P1.5/P1 … P5.5/P5). Se usa
     * sólo para el bloque ADITIVO `repo_inheritance`; el campo del contrato
     * `inherit_existing_profile` lleva la propia clave, como exige §3.1. */
    var BASE_OF = { 'P0.5': 'P0', 'P1.5': 'P1', 'P2.5': 'P2',
                    'P3.5': 'P3', 'P4.5': 'P4', 'P5.5': 'P5' };

    /* Nombres REALES del generador (m3u8-typed-arrays-ultimate.js:7874-7878). */
    var URI_FIELDS = ['url', 'src', 'stream_url', 'streamUrl', 'direct_source', 'source_url', 'URL', 'uri'];
    /* Orden idéntico a rea-export-finalizer.js:404 / §4.4. */
    var ID_FIELDS = ['tvg_id', 'stream_id', 'id'];
    /* §4.2: claves de query que cuentan como metadata completa. */
    var FULL_META_KEYS = ['ape_meta', 'ape_policy', 'metadata', 'idata', 'isession'];
    var HLS_ATTR_RE = /([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/g;

    /* ── UTILIDADES ────────────────────────────────────────────────────────── */
    function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function inc(map, key) { map[key] = (map[key] || 0) + 1; }
    function cloneJson(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
    function shallow(o) { var out = {}, k; for (k in o) { if (has(o, k)) out[k] = o[k]; } return out; }
    function sortKeys(o) {
        var out = {}, k, ks = [];
        for (k in o) { if (has(o, k)) ks.push(k); }
        ks.sort();
        for (k = 0; k < ks.length; k++) out[ks[k]] = o[ks[k]];
        return out;
    }

    /* ── SHA-256 PURO (sin crypto, sin DOM) ────────────────────────────────── *
     * El contrato usa nombres `sha256_*` y en navegador no hay SHA-256
     * SÍNCRONO (crypto.subtle es async). Un hash falso etiquetado "sha256"
     * sería una medición inventada: se implementa el algoritmo y la suite lo
     * verifica contra node:crypto antes de aceptar una sola salida. */
    var _K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

    function utf8Bytes(str) {
        var s = String(str == null ? '' : str), out = [], i, c, c2, cp;
        for (i = 0; i < s.length; i++) {
            c = s.charCodeAt(i);
            if (c < 0x80) { out.push(c); }
            else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
                c2 = s.charCodeAt(i + 1);
                if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                    cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
                    out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                             0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
                    i++;
                } else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
            } else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
        }
        return out;
    }

    function sha256Hex(str) {
        var msg = utf8Bytes(str), bitLen = msg.length * 8, i, off, w = new Array(64);
        msg.push(0x80);
        while (msg.length % 64 !== 56) msg.push(0x00);
        var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
        msg.push((hi >>> 24) & 0xFF, (hi >>> 16) & 0xFF, (hi >>> 8) & 0xFF, hi & 0xFF);
        msg.push((lo >>> 24) & 0xFF, (lo >>> 16) & 0xFF, (lo >>> 8) & 0xFF, lo & 0xFF);

        var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        var a, b, c, d, e, f, g, h, s0, s1, t1, t2, s2, mj;

        for (off = 0; off < msg.length; off += 64) {
            for (i = 0; i < 16; i++) {
                w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) |
                       (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
            }
            for (i = 16; i < 64; i++) {
                s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
            for (i = 0; i < 64; i++) {
                s2 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                t1 = (h + s2 + ((e & f) ^ (~e & g)) + _K[i] + w[i]) | 0;
                s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                mj = (a & b) ^ (a & c) ^ (b & c);
                t2 = (s0 + mj) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0;
                d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
        }
        var hex = '';
        for (i = 0; i < 8; i++) hex += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
        return hex;
    }

    /* base64url -> UTF-8 (§2.1: alfabeto urlsafe, relleno eliminado). */
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    function b64urlToUtf8(value) {
        var v = String(value || '').replace(/=+$/, '');
        var bytes = [], i, n = 0, bits = 0, idx, c, out = '', cp;
        for (i = 0; i < v.length; i++) {
            idx = B64.indexOf(v.charAt(i));
            if (idx < 0) throw new Error('base64url invalido');
            n = (n << 6) | idx; bits += 6;
            if (bits >= 8) { bits -= 8; bytes.push((n >> bits) & 0xFF); }
        }
        for (i = 0; i < bytes.length; i++) {
            c = bytes[i];
            if (c < 0x80) out += String.fromCharCode(c);
            else if (c < 0xE0) out += String.fromCharCode(((c & 0x1F) << 6) | (bytes[++i] & 0x3F));
            else if (c < 0xF0) {
                cp = ((c & 0x0F) << 12) | ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F);
                out += String.fromCharCode(cp);
            } else {
                cp = ((c & 0x07) << 18) | ((bytes[++i] & 0x3F) << 12) |
                     ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F);
                cp -= 0x10000;
                out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
            }
        }
        return out;
    }

    /* ── FLAG ──────────────────────────────────────────────────────────────── *
     * Lee SOLO root.APE_4K6K_AUDIT en cada llamada (activación en caliente y
     * alternancia desde la prueba). No lee process.env: el contrato es window. */
    function isEnabled() {
        if (!root) return false;
        var raw = root[FLAG];
        if (raw === undefined || raw === null) return false;
        if (raw === true) return true;
        if (raw === false || raw === 0) return false;
        var s = String(raw).trim().toLowerCase();
        return s === '1' || s === 'true' || s === 'on' || s === 'yes';
    }

    function inert(what) {
        return {
            schema: what === 'audit' ? SCHEMA_AUDIT : SCHEMA_INTENT,
            enabled: false,
            applied: false,
            executed: false,
            implementation_state: 'metadata_only_not_deployed',
            reason: FLAG + '=0 (apagado por defecto)',
            not_computed: [{ field: '*', reason: 'adaptador desactivado por flag ' + FLAG + '=0' }]
        };
    }

    /* ── VARIANTES (§1.6 literales exactos) ───────────────────────────────── */
    function variants() {
        return {
            standard_4k: {
                label: '4K escalado si la fuente lo requiere',
                width: 3840, height: 2160,
                requested: true, executed: false, native_quality_claim: false
            },
            premium_6k_simulated: {
                label: 'Premium 6K simulada',
                width: 5760, height: 3240,
                requested: true, executed: false, native_quality_claim: false,
                processing: 'spatial_upscale_not_ai_superresolution'
            }
        };
    }

    /* ── PERFILES ─────────────────────────────────────────────────────────── *
     * §6 caso 9: DOS defaults distintos y ambos medidos —
     *   patch (enrich) usa "runtime" (:135) · audit usa "unknown" (:203). */
    function readProfile(ch, fallback) {
        var raw = String((ch && (ch.ape_profile || ch.apeProfile || ch.profile)) || '').toUpperCase();
        return PROFILE_IDS.indexOf(raw) >= 0 ? raw : fallback;
    }
    function readId(ch) {
        var i, v;
        for (i = 0; i < ID_FIELDS.length; i++) {
            v = ch[ID_FIELDS[i]];
            if (v !== undefined && v !== null && String(v) !== '') return String(v);
        }
        return '';                                   /* §6 caso 10: nunca inventado */
    }
    function readUri(ch) {
        var i, v;
        for (i = 0; i < URI_FIELDS.length; i++) {
            v = ch[URI_FIELDS[i]];
            if (typeof v === 'string' && v !== '') return v;
        }
        return null;
    }

    /* ── INTENCIÓN 4K/6K: SIDECAR versionado, la política REA NO se toca ───── *
     * [FASE 2 · 2026-11-20 · orden del operador] La versión anterior escribía
     * `rea.policyId` (rea-adaptive-v1 → ape-4k-premium6k-intent/1) y
     * `rea.targetResolution` (null → 3840x2160). Un consumidor que decida por
     * policyId o por la semántica de targetResolution vería un cambio de
     * política, y tener el valor viejo archivado no lo vuelve compatible: el
     * archivo prueba procedencia, no compatibilidad.
     *
     * Ahora `rea` se devuelve VERBATIM (misma referencia y mismos bytes) y la
     * intención viaja en un campo propio y versionado. Mismo contenido, dueño
     * distinto: nadie que lea `rea` ve un campo que no esperaba.
     */
    /* [FASE 2 · corregido con el LAB del propietario] El objetivo del PERFIL manda.
     * Medido en APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (12 perfiles):
     *   P0 = 7680x4320 · P1/P2 = 3840x2160 · P3/P4/P5 = 1080p/720p/480p ·
     *   P0.5..P5.5 = 5760x3240
     * Declarar 3840 fijo sobre P0 seria DEGRADAR su declaracion (ley anti-degradacion).
     * Regla: objetivo = max(perfil, standard_4k); premium = max(perfil, premium_6k).
     */
    function profileResolution(pid) {
        var cfg = readProfilesConfig();
        var p = (cfg && isObj(cfg.profiles)) ? cfg.profiles[pid] : null;
        var res = p && ((p.settings && p.settings.resolution) || p.resolution);
        var m = (typeof res === 'string') ? res.match(/^(\d{2,5})x(\d{2,5})$/) : null;
        return m ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : null;
    }

    function objective(pid) {
        var own = profileResolution(pid);
        var std = { w: 3840, h: 2160 };
        var prem = { w: 5760, h: 3240 };
        return {
            own: own,
            target: (own && own.w > std.w) ? own : std,
            premium: (own && own.w > prem.w) ? own : prem,
            profileWasHigher: !!(own && own.w > prem.w)
        };
    }

    function wh(o) { return o.w + 'x' + o.h; }

    function buildIntent(profile) {
        var o = objective(profile);
        return {
            schema: SCHEMA_INTENT,
            status: 'requested_only',
            targetResolution: wh(o.target),
            targetWidth: o.target.w,
            targetHeight: o.target.h,
            boxWidth: o.target.w,
            boxHeight: o.target.h,
            mode: 'upscale_if_needed',
            enhancementRequested: true,
            execution: 'not_verified',
            capacityGate: 'device_runtime',
            outputPreference: 'preserve_verified_source',
            /* El consumidor REA no ha sido probado con esta extensión: se declara. */
            reaPolicyPreserved: true,
            reaFieldsWritten: 0,
            /* EXACTAMENTE 13 claves; ahora el objetivo sale del perfil real. */
            outputPolicy: {
                schema: SCHEMA_INTENT,
                profile: profile,
                defaultVariant: 'standard_4k',
                floorLock: wh(o.target),
                premiumRequested: true,
                premiumResolution: wh(o.premium),
                premiumKind: 'simulated_spatial_upscale',
                preserveHigherSource: true,
                sourceTruthUnchanged: true,
                inheritExistingVisualTuning: true,
                hdrPolicy: 'preserve_verified_source',
                nativeResolutionClaim: false,
                executed: false
            },
            /* Trazabilidad del perfil medido: si el perfil ya era mayor, se dice. */
            profileTarget: o.own ? wh(o.own) : null,
            profileTargetPreserved: o.profileWasHigher
        };
    }
    /* §6 caso 2: REA con JSON inválido ⇒ ABORTA. Prohibido "arreglarlo" en silencio.
     * Se acepta objeto (forma normal) y string JSON (forma serializada). */
    function normaliseRea(raw, label) {
        if (raw === undefined || raw === null) return { present: false, obj: null };
        if (isObj(raw)) return { present: true, obj: raw };
        if (typeof raw === 'string') {
            var parsed;
            try { parsed = JSON.parse(raw); }
            catch (e) { throw new Error('REA no parseable en ' + label + ': ' + e.message); }
            if (!isObj(parsed)) throw new Error('REA no es objeto JSON en ' + label);
            return { present: true, obj: parsed };
        }
        throw new Error('REA con tipo no admitido (' + (typeof raw) + ') en ' + label);
    }

    /* ── ENRICH ───────────────────────────────────────────────────────────── *
     * Contrato de frontera (fase 2):
     *   · `rea` (si existe) se copia VERBATIM: misma referencia, mismos bytes,
     *     mismos campos desconocidos. No se archiva porque no se reescribe.
     *   · La intención va en `APE-4K6K-INTENT` (sidecar versionado).
     *   · Este adaptador NO escribe el archivo de líneas del Python
     *     (`#EXT-X-APE-AUDIT-ORIGINAL:<base64url({"line":…,"eol":…})>`): ese
     *     formato lo produce y lo verifica la herramienta Python, y no se le
     *     atribuye compatibilidad desde aquí.
     *   · Si el sidecar ya existe con el mismo schema, se conserva (punto fijo)
     *     para que la 2ª pasada emita bytes idénticos.
     */
    function enrichOne(ch, index) {
        if (!isObj(ch)) return ch;                    /* no-objetos pasan intactos */
        var label = 'canal#' + index;
        var profile = readProfile(ch, 'runtime');      /* patch ⇒ runtime */
        var norm = normaliseRea(has(ch, 'rea') ? ch.rea : undefined, label);
        var out = {}, k, prev;

        for (k in ch) {
            if (!has(ch, k)) continue;
            if (k === 'rea' || k === INTENT_FIELD) continue;
            out[k] = ch[k];                            /* previos y DESCONOCIDOS: verbatim */
        }
        if (norm.present) out.rea = ch.rea;            /* VERBATIM, sin reconstruir */
        prev = has(ch, INTENT_FIELD) ? ch[INTENT_FIELD] : undefined;
        out[INTENT_FIELD] = (isObj(prev) && prev.schema === SCHEMA_INTENT)
            ? prev
            : buildIntent(profile);
        return out;
    }

    function enrich(channels) {
        if (!isEnabled()) return channels;             /* MISMA referencia: coste 0 */
        if (!Array.isArray(channels)) return channels;
        var out = new Array(channels.length), i;
        for (i = 0; i < channels.length; i++) out[i] = enrichOne(channels[i], i);
        return out;
    }

    /* ── OVERLAY (§1.6 / §3.1: 7 claves raíz + bloque aditivo) ─────────────── */
    function readProfilesConfig() {
        var cfg = root && root.APE_PROFILES_CONFIG;
        return (cfg && isObj(cfg) && isObj(cfg.profiles)) ? cfg : null;
    }

    /* §1.6 common — 10 claves, con las 4 políticas en forma OBJETO (§2.3). */
    function commonPolicy() {
        return {
            preserve_source_truth: true,
            preserve_existing_metadata: true,
            inherit_existing_visual_tuning: true,
            video_path: 'unchanged_existing_uri',
            codec_selection: {
                preferred_family: 'hevc',
                only_existing_verified_renditions: true,
                within_hevc: 'highest_verified_quality_supported_by_device_and_network',
                fallback: 'highest_verified_compatible_source',
                do_not_transcode_by_headers: true,
                no_claim_of_lossless: true
            },
            runtime_gate: {
                requires_player_or_helper: true,
                verify_source_with: 'ffprobe_or_decoder',
                verify_device_capabilities: true,
                never_forge_device_descriptor: true,
                unsupported_output: 'report_blocked_do_not_label_as_4k_or_6k',
                continuity_fallback: 'native_only_with_explicit_output_status',
                preserve_higher_resolution_source: true
            },
            floor_lock: { requested: true, resolution: '3840x2160', state: 'not_executed' },
            virtual_4k: { requested: true, resolution: '3840x2160', kind: 'upscaled_if_needed' },
            hdr_intent: {
                policy: 'preserve_verified_source',
                sdr_to_hdr: 'disabled_by_default',
                dolby_vision_synthesis: false
            },
            APE_VISUAL_FIRST: {
                default: 0, enabled_value: 1,
                scope: 'experimental_local_visual_tuning',
                override_source_hdr_metadata: false
            }
        };
    }

    /* §1.6 zapping — 11 claves tal y como están en el código (:73-82).
     * NOTA: SPEC §1.6 dice "12 claves"; el código fuente tiene 11. Se
     * implementa el CÓDIGO (fuente de verdad) y se declara la discrepancia. */
    function zappingPolicy() {
        return {
            required: true,
            method: 'POST',
            url_change_method: 'PUT',
            endpoint: null,
            endpoint_state: 'requires_existing_vps_route',
            fields: ['channel_id', 'channel_name', 'content_type', 'codec_hint',
                     'timestamp', 'profile', 'variant', 'policy_schema'],
            async_nonblocking: true,
            video_path_unchanged: true,
            execution_state: 'requires_player_or_local_helper',
            timestamp_format: 'RFC3339_UTC',
            must_not_send_provider_credentials: true
        };
    }

    function overlay() {
        if (!isEnabled()) return inert('overlay');
        var cfg = readProfilesConfig();
        var profiles = {}, repoInh = {}, i, id, baseId, real, tuningCount = 0;

        for (i = 0; i < PROFILE_IDS.length; i++) {
            id = PROFILE_IDS[i];
            /* §3.1: inherit_existing_profile = la propia clave, tal cual. */
            profiles[id] = { inherit_existing_profile: id, variants: variants() };

            /* Bloque ADITIVO: tuning REAL heredado de ape-profiles-config.js.
             * El Python no podía leerlo; el adaptador JS sí. No se inventa:
             * si la config no está, se declara NO COMPUTADO. */
            baseId = BASE_OF[id] || id;
            real = (cfg && isObj(cfg.profiles[baseId])) ? cfg.profiles[baseId] : null;
            if (real) tuningCount++;
            repoInh[id] = {
                inherits_tuning_from: baseId,
                state: real ? 'ape-profiles-config' : 'not_available',
                source_line: 'frontend/js/ape-v9/ape-profiles-config.js:6584',
                inherited_resolution: (real && isObj(real.settings) && real.settings.resolution)
                    ? String(real.settings.resolution) : null,
                tuning: real ? cloneJson(real) : null
            };
        }

        var notComputed = [
            {
                field: 'repo_inheritance',
                reason: cfg ? 'ok'
                    : 'window.APE_PROFILES_CONFIG no cargado: tuning real NO COMPUTADO (no se inventa)'
            },
            {
                field: 'mapping Pn -> perfil_con_nombre_largo',
                reason: 'SPEC §7 N1: no existe tabla en el código; no se inventa la correspondencia'
            },
            {
                field: '6144x3456',
                reason: 'BASELINE §2.9/C3: target FFmpeg del VPS (metadata-only en producción); ' +
                        'NO se unifica con 5760x3240 y no se declara'
            }
        ];

        return {
            /* — 7 claves raíz del contrato (§1.6 / §3.1) — */
            schema: SCHEMA_INTENT,
            extends: SCHEMA_EXTENDS,
            deployment: 'not_installed',
            active_default_variant: 'standard_4k',
            common: commonPolicy(),
            profiles: profiles,
            zapping: zappingPolicy(),
            /* — aditivo (no sustituye nada de lo anterior) — */
            enabled: true,
            applied: false,
            executed: false,
            implementation_state: 'metadata_only_not_deployed',
            profiles_count: PROFILE_IDS.length,
            repo_inheritance: {
                source: cfg ? 'window.APE_PROFILES_CONFIG' : null,
                profiles_inherited: tuningCount,
                profiles: repoInh
            },
            qoe_policy: 'untouched',
            channel_reassignment: 'none',
            not_computed: notComputed
        };
    }

    /* ── AUDIT (§4.1: {before, implementation_state} [+after, preservation]) ─ */
    var AUDIT_KEYS = [
        'schema', 'file_bytes', 'channels', 'uris',
        'source_resolution_verified', 'source_codec_verified', 'source_hdr_verified',
        'rea_present', 'rea_null_target', 'premium_requested', 'urls_with_full_metadata',
        'qoe_profile_mismatch', 'duplicate_channel_ids', 'network_test_scope',
        'sha256_uncompressed_text', 'uri_sequence_sha256', 'profiles', 'tag_counts',
        'device_descriptors', 'hls_unverified_declarations', 'network_caching_ms',
        'qoe_profile_mismatches', 'duplicate_metadata_keys_channels'
    ];

    function emptyBefore(inputKind) {
        var b = {
            schema: SCHEMA_AUDIT,
            file_bytes: null,
            channels: 0, uris: 0,
            source_resolution_verified: 0, source_codec_verified: 0, source_hdr_verified: 0,
            rea_present: 0, rea_null_target: 0, premium_requested: 0,
            urls_with_full_metadata: 0, qoe_profile_mismatch: 0, duplicate_channel_ids: 0,
            network_test_scope: 'none_in_this_script',   /* §4.2 literal fijo */
            sha256_uncompressed_text: null,
            uri_sequence_sha256: null,
            profiles: {}, tag_counts: {}, device_descriptors: {},
            hls_unverified_declarations: {}, network_caching_ms: {},
            qoe_profile_mismatches: {}, duplicate_metadata_keys_channels: {}
        };
        return b;
    }

    /* preservation_checks (§4.3) + aborto si divergen (§4.3 nota) */
    function preservationChecks(before, after) {
        var checks = {
            channel_count_unchanged: before.channels === after.channels,
            uri_sequence_unchanged: before.uri_sequence_sha256 === after.uri_sequence_sha256,
            original_not_overwritten: true,
            source_verified_flags_not_forged:
                after.source_resolution_verified === before.source_resolution_verified
        };
        if (!checks.channel_count_unchanged || !checks.uri_sequence_unchanged) {
            throw new Error('Se alteraron canales o URIs: validacion abortada.');
        }
        return checks;
    }

    /* ── AUDIT sobre objetos de canal ─────────────────────────────────────── *
     * `before` = las 23 claves del contrato. Lo que la entrada no permite
     * calcular NO se rellena: va a `not_computed` (raíz aditiva). */
    function audit(channels, opts) {
        if (!isEnabled()) return inert('audit');
        opts = isObj(opts) ? opts : {};
        var list = Array.isArray(channels) ? channels : [];
        var before = emptyBefore('channel_object_list');
        var notComputed = [];
        var i, ch, uri, id, profile, qoeP, rea, dRaw, dVal, dHint, keys, k, full;
        var uriSeq = [], ids = {}, idSeen = false, uriFieldSeen = 0;
        var verifiedRes = 0;
        var inventory = opts.inventory ? [] : null;
        var payloads = [];                            /* para sha256 del texto equivalente */

        for (i = 0; i < list.length; i++) {
            ch = list[i];
            if (!isObj(ch)) continue;
            before.channels++;

            id = readId(ch);
            if (id !== '') {
                idSeen = true;
                if (has(ids, id)) before.duplicate_channel_ids++;   /* §6 caso 10 */
                ids[id] = 1;
            }

            profile = readProfile(ch, 'unknown');                   /* audit ⇒ unknown (§6 caso 9) */
            inc(before.profiles, profile);

            if (ch.resolution_verified === true) { before.source_resolution_verified++; verifiedRes++; }
            if (ch.codec_verified === true) before.source_codec_verified++;
            if (ch.hdr_verified === true) before.source_hdr_verified++;

            rea = ch.rea;
            if (isObj(rea)) {
                before.rea_present++;
                if (rea.targetResolution === null || rea.targetResolution === undefined) before.rea_null_target++;
                if (isObj(rea.outputPolicy) && rea.outputPolicy.premiumRequested === true) before.premium_requested++;
            }

            uri = readUri(ch);
            var urlFullMeta = false;
            if (uri !== null) {
                uriFieldSeen++;
                before.uris++;
                uriSeq.push(uri + '\n');
                full = false;
                for (k = 0; k < FULL_META_KEYS.length; k++) {
                    if (uri.indexOf('?' + FULL_META_KEYS[k] + '=') >= 0 ||
                        uri.indexOf('&' + FULL_META_KEYS[k] + '=') >= 0) { full = true; break; }
                }
                if (full) { before.urls_with_full_metadata++; urlFullMeta = true; }
            }

            dRaw = null;
            if (uri !== null) {
                var m = /[?&]d=([^&|#]+)/.exec(uri);
                if (m) dRaw = m[1];
            }
            dHint = null;
            if (dRaw) {
                try {
                    dVal = JSON.parse(b64urlToUtf8(dRaw));
                    dHint = dVal;
                    inc(before.device_descriptors, JSON.stringify(sortKeys(dVal)));  /* §6 caso 12 */
                } catch (_) {
                    inc(before.device_descriptors, 'invalid');
                }
            }

            /* §6 caso 14: se REGISTRA el desajuste, no se corrige. */
            qoeP = (ch.qoe && ch.qoe.p !== undefined) ? String(ch.qoe.p)
                  : (ch.qoe_p !== undefined ? String(ch.qoe_p) : null);
            if (qoeP !== null && qoeP !== profile) {
                before.qoe_profile_mismatch++;
                inc(before.qoe_profile_mismatches, profile + '->' + qoeP);
            }

            /* §4.4: source_resolution / source_codec SIEMPRE null (hueco reservado). */
            if (inventory) {
                inventory.push({
                    channel_id: id,
                    profile: profile,
                    source_resolution: null,
                    source_codec: null,
                    source_verified: ch.resolution_verified === true,
                    output_requested: isObj(rea) && rea.outputPreference !== undefined,
                    premium_requested: isObj(rea) && isObj(rea.outputPolicy) &&
                                       rea.outputPolicy.premiumRequested === true,
                    device_hint: dHint ? cloneJson(dHint) : null,
                    url_contains_full_metadata: urlFullMeta,
                    qoe_profile: qoeP
                });
            }
        }

        before.uri_sequence_sha256 = sha256Hex(uriSeq.join(''));
        /* Huella de entrada. El nombre de contrato es de TEXTO: aquí no hay texto. */
        var inputSha = sha256Hex(JSON.stringify(list));

        if (verifiedRes === 0) {
            notComputed.push({
                field: 'source_resolution_verified',
                reason: 'ningun canal trae resolution_verified===true: 0 = "no declarado", no "no verificado"'
            });
        }
        if (uriFieldSeen === 0 && list.length > 0) {
            notComputed.push({
                field: 'uris',
                reason: 'ningun canal expone ' + URI_FIELDS.join('/') + ': URLs NO COMPUTADAS'
            });
        }
        if (!idSeen) {
            notComputed.push({
                field: 'duplicate_channel_ids',
                reason: 'ningun canal expone ' + ID_FIELDS.join('/') + ': ids NO COMPUTADOS (nunca inventados)'
            });
        }
        notComputed.push({
            field: 'sha256_uncompressed_text',
            reason: 'entrada son objetos de canal, no texto de playlist: usar auditText(text)'
        });
        notComputed.push({
            field: 'file_bytes',
            reason: 'no hay fichero en esta llamada (entrada en memoria)'
        });
        notComputed.push({
            field: 'tag_counts',
            reason: 'objetos de canal no llevan lineas de tag: usar auditText(text)'
        });
        notComputed.push({
            field: 'hls_unverified_declarations',
            reason: 'no hay #EXT-X-STREAM-INF en objetos de canal: usar auditText(text)'
        });
        notComputed.push({
            field: 'network_caching_ms',
            reason: 'no hay #EXTVLCOPT en objetos de canal: usar auditText(text)'
        });
        notComputed.push({
            field: 'duplicate_metadata_keys_channels',
            reason: 'un objeto JS no puede tener claves repetidas: solo medible en auditText(text)'
        });

        var record = {
            before: before,
            implementation_state: 'metadata_only_not_deployed',
            adapter: {
                version: '1.0.0', flag: FLAG, flag_value: root ? root[FLAG] : undefined,
                input_kind: 'channel_object_list', input_sha256: inputSha,
                network_test_scope: before.network_test_scope
            },
            not_computed: notComputed
        };
        if (inventory) record.inventory = inventory;
        if (Array.isArray(opts.after)) {
            var afterRec = audit(opts.after, { inventory: false });
            record.after = afterRec.before;
            record.preservation_checks = preservationChecks(before, afterRec.before);
        }
        return record;
    }

    /* ── AUDIT sobre TEXTO de playlist (equivalente al audit() del Python) ─── */
    function auditText(text) {
        if (!isEnabled()) return inert('audit');
        var src = String(text == null ? '' : text);
        var hasCrlf = src.indexOf('\r\n') >= 0;
        var hasBareLf = /(^|[^\r])\n/.test(src);
        /* Se parte conservando el EOL por línea: §4.2 exige el "\n" en la clave
         * de tag_counts cuando la línea no lleva ':' (:193). */
        var rawLines = src.split(/(?<=\n)/);
        var before = emptyBefore('playlist_text');
        before.file_bytes = utf8Bytes(src).length;
        before.sha256_uncompressed_text = sha256Hex(src);

        var notComputed = [];
        var uriSeq = [], ids = {}, idSeen = false, i, j, s, key, perBlock = {}, block = [], blocks = [];

        for (i = 0; i < rawLines.length; i++) {
            if (rawLines[i].indexOf('#EXTINF:') === 0 && block.length) { blocks.push(block); block = []; }
            block.push(rawLines[i]);
        }
        if (block.length) blocks.push(block);

        for (var b = 0; b < blocks.length; b++) {
            var blk = blocks[b], isChannel = blk.length > 0 && blk[0].indexOf('#EXTINF:') === 0;
            for (j = 0; j < blk.length; j++) {
                s = blk[j];
                if (s.charAt(0) === '#') {
                    /* §6 caso 11: sin ':' la clave conserva el salto de línea. */
                    key = s.indexOf(':') >= 0
                        ? s.slice(0, s.indexOf(':')).split(' ')[0]
                        : s.split(' ')[0];
                    inc(before.tag_counts, key);
                }
            }
            if (!isChannel) continue;
            before.channels++;
            var attr = blk[0], profile = 'unknown', pm = /ape-profile="([^"]*)"/.exec(attr);
            if (pm) profile = pm[1];
            inc(before.profiles, profile);

            var im = /tvg-id="([^"]*)"/.exec(attr);
            if (im && im[1] !== '') {
                idSeen = true;
                if (ids[im[1]]) before.duplicate_channel_ids++;
                ids[im[1]] = 1;
            }

            var qoeP = null;
            for (j = 1; j < blk.length; j++) {
                s = blk[j];
                var body = s.replace(/\r?\n$/, '');
                if (body.indexOf('#EXT-X-APE-RESOLUTION-VERIFIED:true') === 0) before.source_resolution_verified++;
                if (body.indexOf('#EXT-X-APE-CODEC-VERIFIED:true') === 0) before.source_codec_verified++;
                if (body.indexOf('#EXT-X-APE-HDR-VERIFIED:true') === 0) before.source_hdr_verified++;
                if (body.indexOf(REA_TAG) === 0) {
                    before.rea_present++;
                    try {
                        var rj = JSON.parse(body.slice(REA_TAG.length));
                        if (rj.targetResolution === null || rj.targetResolution === undefined) before.rea_null_target++;
                    } catch (_) { /* no parseable: no se cuenta como objetivo nulo */ }
                }
                if (body.indexOf('#EXT-X-APE-CRYSTAL-6K:REQUESTED;') === 0) before.premium_requested++;
                if (body.indexOf(OUT_TAG) === 0) inc(perBlock, 'OUTPUT');
                if (body.indexOf(QOE_TAG) === 0) {
                    try { var qj = JSON.parse(body.slice(QOE_TAG.length)); qoeP = (qj && qj.p !== undefined) ? String(qj.p) : null; }
                    catch (_) { qoeP = null; }
                }
                if (body.indexOf('#EXT-X-STREAM-INF:') === 0) {
                    /* §4.2: clave = JSON de atributos con sort_keys. */
                    var attrs = {}, mAttr;
                    HLS_ATTR_RE.lastIndex = 0;
                    while ((mAttr = HLS_ATTR_RE.exec(body.slice(18))) !== null) attrs[mAttr[1]] = mAttr[2];
                    inc(before.hls_unverified_declarations, JSON.stringify(sortKeys(attrs)));
                }
                if (body.indexOf('#EXTVLCOPT:network-caching=') === 0) inc(before.network_caching_ms, body.split('=')[1]);
                if (body.indexOf('#EXTVLCOPT:') === 0 || body.indexOf('#KODIPROP:') === 0) {
                    inc(perBlock, body.split('=')[0]);
                } else if (body.charAt(0) === '#') {
                    inc(perBlock, body.split(':')[0]);
                }
                if (body !== '' && body.charAt(0) !== '#') {
                    before.uris++;
                    uriSeq.push(body + '\n');
                    var f = false, x;
                    for (x = 0; x < FULL_META_KEYS.length; x++) {
                        if (body.indexOf('?' + FULL_META_KEYS[x] + '=') >= 0 ||
                            body.indexOf('&' + FULL_META_KEYS[x] + '=') >= 0) { f = true; break; }
                    }
                    if (f) before.urls_with_full_metadata++;
                    var dm = /[?&]d=([^&|#\s]+)/.exec(body);
                    if (dm) {
                        try { inc(before.device_descriptors, JSON.stringify(sortKeys(JSON.parse(b64urlToUtf8(dm[1]))))); }
                        catch (_) { inc(before.device_descriptors, 'invalid'); }
                    }
                }
            }
            if (qoeP !== null && qoeP !== profile) {
                before.qoe_profile_mismatch++;
                inc(before.qoe_profile_mismatches, profile + '->' + qoeP);
            }
            var kk;
            for (kk in perBlock) {
                if (perBlock[kk] > 1 && kk !== '#EXT-X-APE-AUDIT-ORIGINAL' &&
                    !before.duplicate_metadata_keys_channels[kk]) {
                    before.duplicate_metadata_keys_channels[kk] = 1;
                }
            }
            perBlock = {};
        }

        before.uri_sequence_sha256 = sha256Hex(uriSeq.join(''));
        if (!idSeen && before.channels > 0) {
            notComputed.push({
                field: 'duplicate_channel_ids',
                reason: 'ningun bloque expone tvg-id: ids NO COMPUTADOS (nunca inventados)'
            });
        }

        return {
            before: before,
            implementation_state: 'metadata_only_not_deployed',
            adapter: {
                version: '1.0.0', flag: FLAG, flag_value: root ? root[FLAG] : undefined,
                input_kind: 'playlist_text',
                eol: hasCrlf && hasBareLf ? 'mixed' : (hasCrlf ? 'crlf' : (hasBareLf ? 'lf' : 'none'))
            },
            not_computed: notComputed
        };
    }

    /* ── EMISIÓN: una sola URI por canal, tag propio, EXTSHIMOTT intacto ───── *
     * Devuelve la línea del sidecar SIN salto de línea. El llamador la inserta
     * INMEDIATAMENTE ANTES de la URI del canal, de modo que el bloque conserva
     * `metadata → una URI` y EXTSHIMOTT v1 (additionalProperties=false) no
     * recibe ni un campo nuevo. Esta función es pura: NO consulta el flag; el
     * punto de llamada es quien debe comprobarlo (ver el cableado del index).
     */
    function intentTag(ch) {
        var profile = readProfile(isObj(ch) ? ch : {}, 'runtime');
        var prev = (isObj(ch) && isObj(ch[INTENT_FIELD])) ? ch[INTENT_FIELD] : null;
        var payload = (prev && prev.schema === SCHEMA_INTENT) ? prev : buildIntent(profile);
        return INTENT_TAG + JSON.stringify(payload);
    }

    /* ── INSERCIÓN EN EL BLOQUE (§4: una URI por canal, tag antes de la URI) ── *
     * [FASE 2 · corregido contra el generador REAL] El bloque de un canal NO
     * termina en la URI: el emisor añade metadata después (medido con el LAB
     * real: 65.278 caracteres que acaban en `#EXT-X-APE-CRYSTAL-UHD:...`).
     * La regla correcta es localizar la ÚNICA línea de URI e insertar justo antes.
     *   · si hay 0 o más de 1 línea de URI, NO se toca el bloque (no se adivina);
     *   · conserva el fin de línea (LF/CRLF) y la ausencia de salto final;
     *   · no reordena ni toca ninguna otra línea (EXTHTTP, EXTVLCOPT, KODIPROP,
     *     EXT-X-*, EXTSHIMOTT incluidos);
     *   · con la bandera OFF devuelve el bloque TAL CUAL (identidad): ningún
     *     llamador puede emitir metadata nueva sin activar el flag, aunque olvide
     *     el guard. `force === true` es solo para pruebas.
     */
    function insertIntentTag(block, ch, force) {
        if (force !== true && !isEnabled()) return block;
        if (typeof block !== 'string' || block === '') return block;
        var eol = block.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
        var lineas = block.split(eol);
        var idx = -1, n = 0, i;
        for (i = 0; i < lineas.length; i++) {
            if (/^\s*https?:\/\//i.test(lineas[i])) { n++; idx = i; }
        }
        if (n !== 1) return block;                 /* ambiguo o sin URI: intacto */
        lineas.splice(idx, 0, intentTag(ch));
        return lineas.join(eol);
    }
    return {
        version: '1.1.0',
        FLAG: FLAG,
        SCHEMAS: {
            intent: SCHEMA_INTENT, extends: SCHEMA_EXTENDS,
            audit: SCHEMA_AUDIT, archive: SCHEMA_ARCHIVE
        },
        AUDIT_KEYS: AUDIT_KEYS.slice(),
        PROFILE_IDS: PROFILE_IDS.slice(),
        ARCHIVE_FIELD: ARCHIVE_FIELD,
        INTENT_FIELD: INTENT_FIELD,
        TAGS: {
            out: OUT_TAG, premium: PREMIUM_TAG, archive: LEGACY_TAG,
            intent: INTENT_TAG, policy: POLICY_TAG, rea: REA_TAG
        },
        STANDARD_4K: { width: 3840, height: 2160 },
        PREMIUM_6K: { width: 5760, height: 3240 },
        VPS_FFMPEG_6K_NOT_DECLARED: 6144,            /* BASELINE §2.9 / C3 */
        isEnabled: isEnabled,
        audit: audit,
        auditText: auditText,
        overlay: overlay,
        enrich: enrich,
        intentTag: intentTag,
        insertIntentTag: insertIntentTag,
        _sha256Hex: sha256Hex,
        _utf8Bytes: utf8Bytes
    };
});
