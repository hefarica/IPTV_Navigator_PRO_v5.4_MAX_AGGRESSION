#!/usr/bin/env node
/**
 * single_variant_assert.js — GATE de "lista 4K publicable" (t67)
 * ============================================================================
 * Comprueba, canal por canal, que el artefacto 4K/8K es PUBLICABLE:
 *   S1 · exactamente 1 `#EXT-X-STREAM-INF` por canal  (anti-509)
 *   S2 · ese STREAM-INF declara RESOLUTION del modo (3840x2160 ó 7680x4320)
 *   S3 · la FAMILIA de codec del STREAM-INF coincide con la del original
 *        (HEVC sigue HEVC; AVC solo si el origen era AVC)
 *   S4 · 0 tóxicos, en forma plana y en forma JSON
 *   S5 · `#EXT-X-APE-UPSCALE:fake4k` / `:fake8k` por canal
 *   S6 · 0 pares de freeze (`L153` en un STREAM-INF 8K)
 *
 * Cómo lo hace: toma una lista de ENTRADA con STREAM-INF heredados (el caso
 * que rompe la publicación) y la lista de SALIDA que produjo el arnés, y
 * empareja por posición de canal.
 *
 * Uso:  node single_variant_assert.js <input.m3u8> <output.m3u8> [--mode 8k|4k]
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0; const fail = [];
const ok = (n, c, d) => { if (c) { pass++; return true; } fail.push(d ? `${n} — ${d}` : n); return false; };

// Tóxicos: plana + JSON (escapes incluidos), como el detector endurecido de t64.
const TOX = ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority',
    'Upgrade-Insecure-Requests', 'Connection', 'Keep-Alive', 'Proxy-Connection'];
function countToxic(text) {
    // OJO: contar `TE:` como subcadena da FALSOS POSITIVOS — casa dentro de
    // `...BITRATE:` y `...TIVIMATE:`. Sólo cuentan:
    //   · la clave JSON del `#EXTHTTP`: `"TE":` (y su forma escapada)
    //   · una directiva al INICIO de línea: `TE:`
    let n = 0;
    for (const t of TOX) {
        const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        n += (text.match(new RegExp('"' + esc + '"\\s*:', 'g')) || []).length;
        n += (text.match(new RegExp('\\\\"' + esc + '\\\\"\\s*:', 'g')) || []).length;
        n += (text.match(new RegExp('^' + esc + ':', 'gm')) || []).length;
    }
    return n;
}

// Extrae por canal: el STREAM-INF (si lo hay) y la familia de su CODECS.
function scanChannels(text) {
    const out = [];
    let cur = null;
    let lastStreamInf = null;
    for (const raw of text.split('\n')) {
        const l = raw.trim();
        if (l.startsWith('#EXTINF')) {
            if (cur) out.push(cur);
            cur = { streamInfs: [], codec: null, hasAnchor: false, uri: null };
            lastStreamInf = null;
        } else if (l.startsWith('#EXT-X-STREAM-INF')) {
            if (cur) {
                cur.streamInfs.push(l);
                const m = /CODECS="([^"]+)"/.exec(l);
                if (m && !cur.codec) cur.codec = (m[1].split(',')[0] || '').toLowerCase();
            }
            lastStreamInf = l;
        } else if (l.startsWith('#EXT-X-APE-UPSCALE:')) {
            if (cur) cur.hasAnchor = true;
        } else if (l && !l.startsWith('#') && /^https?:\/\//i.test(l)) {
            if (cur && !cur.uri) cur.uri = l;
        }
    }
    if (cur) out.push(cur);
    return out;
}

function familyOf(codec) {
    if (!codec) return 'none';
    if (/^hvc1|^hev1/.test(codec)) return 'HEVC';
    if (/^avc1|^avc3/.test(codec)) return 'AVC';
    if (/^av01/.test(codec)) return 'AV1';
    if (/^vvc1/.test(codec)) return 'VVC';
    if (/^dvh1|^dvhe/.test(codec)) return 'DV';
    return 'other';
}

function main() {
    const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
    const modeArg = (process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : '4k');
    const targetRes = modeArg === '8k' ? 'RESOLUTION=7680x4320' : 'RESOLUTION=3840x2160';
    const anchor = modeArg === '8k' ? ':fake8k' : ':fake4k';
    const inPath = args[0], outPath = args[1];

    console.log(`── single_variant_assert · modo ${modeArg}`);
    if (!inPath || !outPath || !fs.existsSync(inPath) || !fs.existsSync(outPath)) {
        console.error('uso: node single_variant_assert.js <input.m3u8> <output.m3u8> [--mode 8k|4k]');
        return 2;
    }
    const inTxt = fs.readFileSync(inPath, 'utf8');
    const outTxt = fs.readFileSync(outPath, 'utf8');
    const inCh = scanChannels(inTxt);
    const outCh = scanChannels(outTxt);

    ok('S0 los canales no se pierden', outCh.length === inCh.length, `${outCh.length} de ${inCh.length}`);
    ok('S0b entrada y salida no vacías', inCh.length > 0 && outCh.length > 0);

    // S1 · exactamente 1 STREAM-INF por canal
    const multi = outCh.map((c, i) => ({ i, n: c.streamInfs.length })).filter(x => x.n !== 1);
    ok('S1 exactamente 1 `#EXT-X-STREAM-INF` por canal', multi.length === 0,
        `canales con !=1: ${multi.length} (muestra: ${multi.slice(0, 4).map(m => `#${m.i}=${m.n}`).join(' ')})`);

    // S2 · resolución del modo
    const wrongRes = outCh.map((c, i) => ({ i, l: c.streamInfs[0] || '' })).filter(x => x.l && !x.l.includes(targetRes));
    ok(`S2 el STREAM-INF declara ${targetRes}`, wrongRes.length === 0,
        `canales sin la resolución: ${wrongRes.length} (muestra: ${(wrongRes[0] || {}).l || ''})`);

    // S3 · familia preservada respecto del original
    const famMismatch = [];
    const before = { HEVC: 0, AVC: 0, other: 0 };
    for (let i = 0; i < Math.min(inCh.length, outCh.length); i++) {
        const fin = familyOf(inCh[i].codec);
        const fout = familyOf(outCh[i].codec);
        if (fin === 'HEVC') before.HEVC++; else if (fin === 'AVC') before.AVC++; else before.other++;
        if (fin !== 'none' && fout !== 'none' && fin !== fout) famMismatch.push({ i, fin, fout });
    }
    ok('S3 la familia del STREAM-INF coincide con la del original', famMismatch.length === 0,
        `${famMismatch.length} discrepancias (muestra: ${famMismatch.slice(0, 4).map(m => `#${m.i} ${m.fin}->${m.fout}`).join(', ')})`);

    // S4 · tóxicos 0 (plana + JSON)
    const tox = countToxic(outTxt);
    ok('S4 0 tóxicos (plana + JSON)', tox === 0, `${tox}`);

    // S5 · ancla por canal
    const withAnchor = outCh.filter(c => c.hasAnchor).length;
    ok(`S5 ancla ${anchor} por canal`, withAnchor === outCh.length, `${withAnchor}/${outCh.length}`);

    // S6 · freeze: L153 en un STREAM-INF con RESOLUTION 8K
    let freeze = 0;
    for (const l of outTxt.split('\n')) {
        if (l.startsWith('#EXT-X-STREAM-INF') && /RESOLUTION=7680x4320/.test(l) && l.includes('L153')) freeze++;
    }
    ok('S6 0 pares de freeze (L153 en STREAM-INF 8K)', freeze === 0, `${freeze}`);

    const famAfter = { HEVC: 0, AVC: 0, other: 0 };
    for (const c of outCh) {
        const f = familyOf(c.codec);
        if (f === 'HEVC') famAfter.HEVC++; else if (f === 'AVC') famAfter.AVC++; else famAfter.other++;
    }
    console.log(`\n   canales           : entrada ${inCh.length} · salida ${outCh.length}`);
    console.log(`   STREAM-INF totales: ${outCh.reduce((a, c) => a + c.streamInfs.length, 0)}`);
    console.log(`   familia ANTES     : HEVC ${before.HEVC} · AVC ${before.AVC} · otras ${before.other}`);
    console.log(`   familia DESPUÉS   : HEVC ${famAfter.HEVC} · AVC ${famAfter.AVC} · otras ${famAfter.other}`);
    console.log(`   anclas ${anchor}   : ${withAnchor}/${outCh.length}`);
    console.log(`   tóxicos           : ${tox}    freeze: ${freeze}`);

    console.log('\n════════════════════════════════════════════════════════');
    if (fail.length === 0) {
        console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
        console.log('════════════════════════════════════════════════════════');
        return 0;
    }
    console.log(`RESULTADO: FAIL — ${pass} OK, ${fail.length} fallo(s)`);
    fail.forEach(f => console.log(`  ✗ ${f}`));
    console.log('════════════════════════════════════════════════════════');
    return 1;
}

process.exit(main());
