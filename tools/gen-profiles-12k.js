#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * gen-profiles-12k.js — materializa los 12 PERFILES desde el LAB
 *
 * FUENTE ÚNICA: artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json (se cita su
 * sha256 en la cabecera del fichero generado). NO hay ni un valor tecleado a
 * mano: los 12 ids, resoluciones, codecs, bitrates, fps y la cadena de filtros
 * (vlcopt['video-filter']) salen del LAB.
 *
 * RECETA DE DETALLE (flt) — campo que viaja en el contrato del canal:
 *   nlmeans_s  0.05..2.0   <- LAB s=... CLAMPEADO si excede (se declara)
 *   nlmeans_p  1..15
 *   nlmeans_r  3..30
 *   unsharp    "radio:h_radio:amount:gh:ga"   (luma_msize_x:luma_msize_y:luma_amount:chroma_msize_x:chroma_amount)
 *   gradfun    "strength:radius"
 *   zscale     "t:m:r"                        (transfer:matrix:range)
 *   eq         "brightness:contrast:saturation" (sólo si el LAB lo trae)
 *   downscale  0..1
 *
 * REGLA DE DETALLE POR TIER (declarada, no inventada):
 *   el .5 (6K SIMULATE) debe ser MÁS exigente que su base. Si el LAB ya trae
 *   unsharp amount mayor, se usa el del LAB (src=lab). Si el LAB deja el .5
 *   igual o menor que su base, se DERIVA amount = min(2.0, base × 1.5)
 *   (src=derived:detail_tier_x1.5) y se conserva el valor del LAB en lab_amount
 *   para que la diferencia sea auditable. NUNCA se sale del rango de la allowlist.
 *
 * VERDAD: los filtros NO inventan detalle. En el VPS no hay transcode de
 * píxeles; el consumidor real es el VPP del device / pipeline del APK, o un
 * player tipo VLC vía #EXTVLCOPT. El 6K es SIMULATE (objetivo de display).
 *
 * Uso:
 *   node tools/gen-profiles-12k.js                 # escribe el JS del frontend
 *   node tools/gen-profiles-12k.js --emit-json F   # escribe también las recetas JSON
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const LAB = path.join(ROOT, 'artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json');
const OUT_JS = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-12k.js');

const RANGES = {
    nlmeans_s: [0.05, 2.0],
    nlmeans_p: [1, 15],
    nlmeans_r: [3, 30],
    downscale: [0, 1],
    unsharp_amount: [0, 2.0]
};
const DETAIL_FACTOR = 1.5;      // regla declarada para el tier .5 cuando el LAB no basta
const STR_OK = /^[0-9A-Za-z:=.,_+\-]{1,120}$/;

function cl(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function r2(v) { return Math.round(v * 100) / 100; }

/* ── parseo de la cadena vlcopt del LAB ─────────────────────────────────── */
function parseChain(str) {
    const out = { raw: String(str || ''), nl: null, sharp: null, band: null, zs: null, eq: null, scaleW: null, scaleH: null };
    if (!str) return out;
    const nlm = /nlmeans=([^,]+)/.exec(str);
    if (nlm) {
        const m = {};
        nlm[1].split(':').forEach(p => { const [k, v] = p.split('='); if (k && v !== undefined) m[k] = v; });
        if (m.s !== undefined) out.nl = { s: parseFloat(m.s), p: parseInt(m.p, 10), r: parseInt(m.r, 10) };
    }
    const us = /unsharp=([^,]+)/.exec(str);
    if (us) {
        const m = {};
        us[1].split(':').forEach(p => { const [k, v] = p.split('='); if (k && v !== undefined) m[k] = v; });
        out.sharp = {
            radio: parseInt(m.luma_msize_x, 10) || 3,
            h_radio: parseInt(m.luma_msize_y, 10) || 3,
            amount: parseFloat(m.luma_amount),
            gh: parseInt(m.chroma_msize_x, 10) || 0,
            ga: parseFloat(m.chroma_amount) || 0
        };
    }
    const gf = /gradfun=([^,]+)/.exec(str);
    if (gf) {
        const m = {};
        gf[1].split(':').forEach(p => { const [k, v] = p.split('='); if (k && v !== undefined) m[k] = v; });
        out.band = { strength: parseFloat(m.strength), radius: parseInt(m.radius, 10) };
    }
    const zs = /zscale=([^,]+)/.exec(str);
    if (zs) {
        const m = {};
        zs[1].split(':').forEach(p => { const [k, v] = p.split('='); if (k && v !== undefined) m[k] = v; });
        out.zs = { t: m.transfer || null, m: m.matrix || null, r: m.range || 'limited' };
    }
    const eq = /eq=([^,]+)/.exec(str);
    if (eq) {
        const m = {};
        eq[1].split(':').forEach(p => { const [k, v] = p.split('='); if (k && v !== undefined) m[k] = v; });
        out.eq = { b: m.brightness || '0', c: m.contrast || '1', s: m.saturation || '1' };
    }
    const sc = /(?:zscale|scale)=w=(\d+):h=(\d+)/.exec(str);
    if (sc) { out.scaleW = parseInt(sc[1], 10); out.scaleH = parseInt(sc[2], 10); }
    return out;
}

/* ── receta flt a partir de la cadena, con clamps y regla de tier ───────── */
function recipeFrom(chain, baseAmount) {
    const p = parseChain(chain);
    const notes = [];
    const f = {};

    if (p.nl) {
        const sN = cl(p.nl.s, RANGES.nlmeans_s[0], RANGES.nlmeans_s[1]);
        if (sN !== p.nl.s) notes.push('nlmeans_s ' + p.nl.s + ' -> ' + sN + ' (allowlist 0.05..2.0)');
        f.nlmeans_s = r2(sN);
        f.nlmeans_p = cl(p.nl.p || 5, RANGES.nlmeans_p[0], RANGES.nlmeans_p[1]);
        f.nlmeans_r = cl(p.nl.r || 9, RANGES.nlmeans_r[0], RANGES.nlmeans_r[1]);
    }
    if (p.sharp && isFinite(p.sharp.amount)) {
        let amount = cl(p.sharp.amount, RANGES.unsharp_amount[0], RANGES.unsharp_amount[1]);
        f.lab_amount = amount;
        let src = 'lab';
        if (baseAmount !== null && amount <= baseAmount) {
            const der = r2(cl(baseAmount * DETAIL_FACTOR, 0, RANGES.unsharp_amount[1]));
            notes.push('amount del LAB (' + amount + ') no supera al de su base (' + baseAmount +
                '): DERIVADO ' + der + ' = base x' + DETAIL_FACTOR);
            amount = der;
            src = 'derived:detail_tier_x' + DETAIL_FACTOR;
        }
        f.unsharp = p.sharp.radio + ':' + p.sharp.h_radio + ':' + amount + ':' + p.sharp.gh + ':' + p.sharp.ga;
        f.unsharp_amount = amount;
        f.unsharp_src = src;
    }
    if (p.band) {
        f.gradfun = (isFinite(p.band.strength) ? p.band.strength : 1.0) + ':' + (p.band.radius || 16);
    }
    if (p.zs && p.zs.t) {
        f.zscale = p.zs.t + ':' + (p.zs.m || 'bt2020nc') + ':' + (p.zs.r || 'limited');
    }
    if (p.eq) f.eq = p.eq.b + ':' + p.eq.c + ':' + p.eq.s;
    f.downscale = 0;                            // el LAB hace upscale, no downscale
    if (p.scaleW === 5760) f.upscale_to = '5760x3240';   // declarado, no ejecutado

    /* validación final: nada que el controlador vaya a rechazar */
    ['unsharp', 'gradfun', 'zscale', 'eq'].forEach(k => {
        if (f[k] !== undefined && !STR_OK.test(String(f[k]))) { notes.push(k + ' descartado: no cumple el patrón del controlador'); delete f[k]; }
    });
    f.notes = notes;
    return f;
}

/* ── main ────────────────────────────────────────────────────────────────── */
const raw = fs.readFileSync(LAB, 'utf8');
const sha = crypto.createHash('sha256').update(raw).digest('hex');
const lab = JSON.parse(raw);
const P = lab.profiles_calibrated;
const ids = Object.keys(P).filter(k => /^P[0-5](\.[25])?$/.test(k));
if (ids.length !== 12) { console.error('ABORTO: el LAB no trae 12 perfiles, trae ' + ids.length); process.exit(2); }

const out = {};
ids.forEach(id => {
    const pr = P[id] || {};
    const s = pr.settings || {};
    const vlc = (pr.vlcopt || {})['video-filter'] || (pr.vlcopt || {}).videoFilter || '';
    out[id] = {
        id: id,
        name: pr.name || id,
        resolution: s.resolution || '',
        codec: s.codec || '',
        codec_full: s.codec_full || '',
        codec_chain_video: s.codec_chain_video || '',   // aqui vive el nivel (L183)
        bitrate: Number(s.bitrate) || 0,
        fps: Number(s.fps) || 0,
        segment_duration_s: Number(s.segment_duration_s) || 6,
        playerBuffer: Number(s.playerBuffer) || 0,
        strategy: s.strategy || '',
        is6k: /\.5$/.test(id),
        tier: /\.5$/.test(id) ? 6 : 0,
        filter_chain_lab: vlc,
        flt: null
    };
});

/* .5 depende de su base: receta comparada para garantizar más detalle */
ids.forEach(id => {
    if (!/\.5$/.test(id)) { out[id].flt = recipeFrom(out[id].filter_chain_lab, null); return; }
    const base = id.replace(/\.5$/, '');
    const baseAmt = (out[base] && typeof out[base].flt.unsharp_amount === 'number')
        ? out[base].flt.unsharp_amount : null;
    out[id].flt = recipeFrom(out[id].filter_chain_lab, baseAmt);
    /* si la base NO tiene unsharp en el LAB (P2, P5), cualquier amount > 0
     * del .5 ya es más exigente: se deja constancia en la receta. */
    if (baseAmt === null && typeof out[id].flt.unsharp_amount === 'number') {
        out[id].flt.notes = (out[id].flt.notes || []).concat(
            ['base ' + base + ' sin unsharp en el LAB: el .5 (' + out[id].flt.unsharp_amount + ') es más exigente por definición']);
    }
});

const generated = new Date().toISOString();
const header = [
    '/* ═══════════════════════════════════════════════════════════════════════════',
    ' * APE PROFILES 12K — GENERADO. NO EDITAR A MANO.',
    ' * Fuente: ' + path.relative(ROOT, LAB).replace(/\\/g, '/'),
    ' * sha256 LAB: ' + sha,
    ' * Generado: ' + generated + ' con tools/gen-profiles-12k.js',
    ' * 12 perfiles = 6 base (P0..P5) + 6 SIMULATE 6K (P0.5..P5.5).',
    ' * flt = receta de detalle del tier; valores del LAB, derivados declarados',
    ' * cuando el .5 no superaba a su base, siempre dentro de la allowlist del',
    ' * controlador (nlmeans_s 0.05..2.0, p 1..15, r 3..30, downscale 0..1).',
    ' * VERDAD: 6K es SIMULATE (objetivo de display). Los filtros NO inventan',
    ' * detalle: el VPS no transcodifica píxeles; el realce lo hace el VPP del',
    ' * device / pipeline del APK, o un player tipo VLC por #EXTVLCOPT.',
    ' * ═══════════════════════════════════════════════════════════════════════════ */'
].join('\n');

const body = [
    '(function (root, factory) {',
    "    if (typeof module === 'object' && module.exports) module.exports = factory();",
    '    else root.APE_PROFILES_12K = factory();',
    '})(typeof globalThis !== \'undefined\' ? globalThis : this, function () {',
    "    'use strict';",
    '    return ' + JSON.stringify({
        lab: { path: path.relative(ROOT, LAB).replace(/\\/g, '/'), sha256: sha },
        generated_at: generated,
        generator: 'tools/gen-profiles-12k.js',
        truth: { mode: 'SIMULATE', executor: 'display', executed: 0, note: '6K declarado como objetivo de display; sin transcode en el VPS' },
        ranges: RANGES,
        detail_rule: 'unsharp.amount del .5 > amount de su base; si el LAB no lo cumple se DERIVA base x' + DETAIL_FACTOR,
        profiles: out
    }, null, 2).replace(/\n/g, '\n    ') + ';',
    '});',
    ''
].join('\n');

fs.writeFileSync(OUT_JS, header + '\n' + body);
console.log('escrito ' + path.relative(ROOT, OUT_JS));
console.log('  LAB sha256: ' + sha);
console.log('  perfiles  : ' + ids.length + ' -> ' + ids.join(', '));

const emitIdx = process.argv.indexOf('--emit-json');
if (emitIdx > 0 && process.argv[emitIdx + 1]) {
    const dest = process.argv[emitIdx + 1];
    const recipes = {};
    ids.forEach(id => { recipes[id] = out[id].flt; });
    fs.writeFileSync(dest, JSON.stringify({
        v: 1, lab_sha256: sha, generated_at: generated,
        truth: 'SIMULATE/display', profiles: recipes
    }, null, 2));
    console.log('recetas JSON: ' + dest);
}
