/**
 * APE CANON EMITTER — productor del JSONL canónico (cierra Motor 3 E2E)
 * --------------------------------------------------------------------
 * Lado generador: toma el texto de la lista, corre el homologador (Motor 1) y
 * emite un JSONL (1 record canónico por canal, keyed por _key). Ese JSONL se
 * sube junto a la lista; el VPS lo desempaca a /dev/shm/ape_canon/<key>.json
 * (ape-canon-ingest.php) para que ape-session-resolve.php (Motor 3) resuelva
 * por-player en tiempo real.
 *
 * IDEMPOTENTE: misma lista → mismo JSONL byte-equivalente (orden estable por _key).
 * AUTOPISTA: transform puro lado-generador; cero costo en el path de reproducción.
 * VERBATIM: el _provider_url va intacto (SHIELDED 5). NO-fake: solo evidencia.
 * Node-safe + browser-safe. Degrada si APEFieldHomologator no está cargado.
 */
(function (global) {
    'use strict';

    function getHomologator() {
        if (global.APEFieldHomologator) return global.APEFieldHomologator;
        if (typeof require !== 'undefined') { try { return require('./ape-field-homologator.js'); } catch (e) {} }
        return null;
    }

    // SLIM E: el resolve solo usa de E los flags tóxicos + señales de cubo-E (evasión/exploit).
    // El bucket E completo trae ~948 líneas verbatim/canal (~80KB) → reventaba /dev/shm. Lo recortamos
    // a lo que el resolve realmente lee (council 2026-06-11: record fatness). Record: ~80KB → ~2KB.
    function slimE(E) {
        var out = {}; E = E || {};
        Object.keys(E).forEach(function (k) {
            if (k.indexOf('_toxic.') === 0 || /bypass|sandvine|exploit|spoof|phantom|hydra|circuit-breaker/i.test(k)) out[k] = E[k];
        });
        return out;
    }
    // serializa SOLO los campos que el resolve necesita (compacto, sin _provenance ni E gordo)
    function toWireRecord(rec) {
        return {
            _key: rec._key,
            _schemaFingerprint: rec._schemaFingerprint,
            _provider_url: rec._provider_url,            // VERBATIM
            B: rec.B || {}, C: rec.C || {}, D: rec.D || {}, E: slimE(rec.E)
        };
    }

    /**
     * emitJSONL(listText, opts) → string JSONL (1 record por línea), orden estable por _key.
     */
    function emitJSONL(listText, opts) {
        opts = opts || {};
        var H = getHomologator();
        if (!H) throw new Error('APEFieldHomologator no disponible (Motor 1 requerido)');
        var res = H.homologateList(listText, opts);
        var recs = res.channels.map(toWireRecord);
        // orden estable por _key → JSONL idempotente byte-a-byte
        recs.sort(function (a, b) { return a._key < b._key ? -1 : (a._key > b._key ? 1 : 0); });
        var lines = recs.map(function (r) { return JSON.stringify(r); });
        return lines.join('\n') + (lines.length ? '\n' : '');
    }

    /**
     * emitBundle(listText, opts) → { jsonl, count, sha_hint, stats }
     * sha_hint = FNV del JSONL completo (para verificación idempotente en el upload).
     */
    function emitBundle(listText, opts) {
        var H = getHomologator();
        var jsonl = emitJSONL(listText, opts);
        return {
            jsonl: jsonl,
            count: jsonl ? jsonl.trim().split('\n').filter(Boolean).length : 0,
            sha_hint: H && H.fnv1aHex ? H.fnv1aHex(jsonl) : null,
            schema: 'ape.dual_link.canonical.v1'
        };
    }

    var APECanonEmitter = {
        VERSION: '1.0.0-producer',
        emitJSONL: emitJSONL,
        emitBundle: emitBundle,
        toWireRecord: toWireRecord
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = APECanonEmitter;
    global.APECanonEmitter = APECanonEmitter;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
