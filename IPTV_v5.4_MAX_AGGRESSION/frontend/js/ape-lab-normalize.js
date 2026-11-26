/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE LAB NORMALIZER v1.0 — acepta las DOS familias de LAB reales
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIDO (2026-11-20) sobre los dos ficheros reales del propietario:
 *
 *   A) LAB_CALIBRATED_BULLETPROOF_20260418_210955.json  (579.602 B)
 *      root: profiles_calibrated (P0..P5), lab_version, bulletproof
 *
 *   B) APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO(1).json (1.702.316 B)
 *      sha256 8c11e78148b64a3a…   root: _meta, profiles
 *      _meta.type=all_profiles · _meta.version=APE_v9.0
 *      IDs: P0..P5 + P0.5..P5.5  (los .5 son identidad EXACTA: P0.5 ≠ P0)
 *
 * El importador del repo sólo aceptaba A (`profiles_calibrated`) y exigía
 * `lab_version` omega_* o `bulletproof===true`; con B lanzaba
 * «JSON inválido: falta profiles_calibrated». Este normalizador devuelve la
 * forma canónica SIN tocar el objeto de entrada y SIN inventar campos.
 *
 * Reglas duras:
 *   · las dos familias a la vez y distintas ⇒ BLOQUEA (no elige por su cuenta);
 *   · IDs tal cual (nada de parseInt ni de recortar el .5);
 *   · la ausencia de un campo opcional no se rellena con valores fabricados.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.APELabNormalize = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var FAMILY_A = 'profiles_calibrated';
    var FAMILY_B = 'profiles';

    function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

    /* Devuelve { ok, family, ids, data, reason } — nunca lanza por conflicto:
     * el llamador decide (el importador bloquea; las lecturas devuelven null). */
    function analyze(data) {
        if (!isObj(data)) return { ok: false, family: null, ids: [], data: null, reason: 'LAB vacío o no es objeto' };
        var a = data[FAMILY_A];
        var b = data[FAMILY_B];
        if (isObj(a) && isObj(b)) {
            if (JSON.stringify(a) !== JSON.stringify(b)) {
                return { ok: false, family: null, ids: [], data: null, reason: 'dos familias distintas (profiles_calibrated y profiles): importación BLOQUEADA' };
            }
        }
        var family = isObj(a) ? FAMILY_A : (isObj(b) ? FAMILY_B : null);
        if (!family) return { ok: false, family: null, ids: [], data: null, reason: 'falta profiles_calibrated o profiles' };
        var profs = family === FAMILY_A ? a : b;
        var ids = Object.keys(profs);

        var meta = isObj(data._meta) ? data._meta : null;
        var version = data.lab_version || (meta && meta.version) || '';
        var variant = data.lab_schema_variant || (meta && meta.type) || null;
        var exported = data.exported_at || (meta && meta.exported) || null;
        var schemaOk = /^omega_/i.test(String(version)) || data.bulletproof === true ||
            (meta && meta.type === 'all_profiles');
        if (!schemaOk) {
            return { ok: false, family: family, ids: ids, data: null, reason: 'schema no soportado: version=' + version };
        }

        var out = {};
        for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
        out[FAMILY_A] = profs;                 /* forma canónica aguas abajo */
        out.lab_version = version;
        out.exported_at = exported;
        if (variant && !out.lab_schema_variant) out.lab_schema_variant = variant;
        out._ape_lab_family = family;
        out._ape_lab_ids = ids.slice();
        return { ok: true, family: family, ids: ids, data: out, reason: null };
    }

    /* Para los lectores que hoy hacen `data.profiles_calibrated || {}`. */
    function profilesOf(data) {
        var r = analyze(data);
        return r.ok ? r.data[FAMILY_A] : (isObj(data) && isObj(data[FAMILY_A]) ? data[FAMILY_A] : {});
    }

    function normalize(data) {
        var r = analyze(data);
        if (!r.ok) throw new Error(r.reason);
        return r;
    }

    return {
        version: '1.0.0',
        FAMILY_A: FAMILY_A,
        FAMILY_B: FAMILY_B,
        analyze: analyze,
        profilesOf: profilesOf,
        normalize: normalize
    };
}));
