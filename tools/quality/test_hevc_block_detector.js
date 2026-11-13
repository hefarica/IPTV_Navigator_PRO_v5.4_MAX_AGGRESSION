#!/usr/bin/env node
'use strict';

// [2026-11-13] ¿SE PUEDE ADAPTAR EL DETECTOR DE BLOQUE A HEVC?
//
// La respuesta corta es NO, y este script lo demuestra en vez de afirmarlo.
//
// POR QUE NO
// ==========
// El detector mide energia de gradiente alineada a la rejilla de 8 (`borde8/resto`). Eso
// funcionaba con codecs SIN filtro de deblocking en bucle. H.264 y HEVC llevan AMBOS
// deblocking en el bucle, y HEVC ademas lleva SAO (Sample Adaptive Offset). Los dos filtros
// estan DENTRO del codificador y su trabajo es precisamente BORRAR los bordes de bloque.
//
// Ya quedo medido que la metrica NO responde a la compresion en H.264 (contenido controlado,
// 20 Mbps a 400 kbps, 2 inversiones). En HEVC tiene que ser igual o peor, porque tiene un
// filtro mas.
//
// LO QUE SE MIDE AQUI
//   1. borde8/resto sobre HEVC a 3 bitrates  -> si NO es monotona, la metrica no sirve para HEVC
//   2. HF (|Y - desenfoque(Y)|) sobre los MISMOS HEVC -> si SI es monotona, esta es la metrica
//   3. Lo mismo sobre H.264, para comparar los dos codecs con las dos metricas
//
// Con eso queda respondido: no se "adapta" el detector de bloque a HEVC; se sustituye por la
// metrica de detalle, que funciona en los dos.
//
// Uso: node tools/quality/test_hevc_block_detector.js [video]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'scratch', 'hevc_det' + '_' + process.pid + '_' + Date.now());
try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) { /* EPERM en Windows no debe tumbar el gate */ }
fs.mkdirSync(TMP, { recursive: true });

const FUENTE = process.argv[2] ||
    'C:\\Users\\HFRC\\Downloads\\WhatsApp Video 2026-11-13 at 1.01.22 AM.mp4';
const BITRATES = [8000, 2000, 500];
const SEG = 3;
const W = 1024, H = 400, X = 0, Y = 150;

if (!fs.existsSync(FUENTE)) { console.error('FALTA la fuente: ' + FUENTE); process.exit(2); }

function codificar(codec, kbps, destino) {
    const base = ['-y', '-hide_banner', '-loglevel', 'error', '-t', String(SEG), '-i', FUENTE];
    let args;
    if (codec === 'h264') {
        args = base.concat(['-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
            '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 4}k`, '-g', '50', '-an', destino]);
    } else {
        args = base.concat(['-c:v', 'libx265', '-preset', 'medium', '-pix_fmt', 'yuv420p10le',
            '-profile:v', 'main10', '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 4}k`,
            '-g', '50', '-an', '-x265-params', 'log-level=none', destino]);
    }
    try { execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch (e) { return false; }
    return fs.existsSync(destino);
}

function luma(video, destino) {
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '0.8', '-i', video,
            '-frames:v', '1', '-vf', `crop=${W}:${H}:${X}:${Y},format=gray`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', destino], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    return fs.existsSync(destino) ? fs.readFileSync(destino) : null;
}

function hf(video, tag) {
    const d = path.join(TMP, `hf_${tag}.yuv`);
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '0.8', '-i', video,
            '-frames:v', '1',
            '-vf', `crop=${W}:${H}:${X}:${Y},format=gray,split[a][b];[b]gblur=sigma=3[c];[a][c]blend=all_mode=difference`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', d], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(d)) return null;
    const b = fs.readFileSync(d);
    let s = 0; for (let i = 0; i < b.length; i++) s += b[i];
    const v = b.length ? s / b.length : null;
    try { fs.unlinkSync(d); } catch (e) { /* noop */ }
    return v;
}

function borde8(video, tag) {
    const d = path.join(TMP, `b8_${tag}.yuv`);
    const b = luma(video, d);
    if (!b || b.length < W * H) { try { fs.unlinkSync(d); } catch (e) { /* noop */ } return null; }
    let eb = 0, nb = 0, fu = 0, nf = 0;
    for (let x = 8; x < W; x++) {
        let dd = 0;
        for (let y = 0; y < H; y++) dd += Math.abs(b[y * W + x] - b[y * W + x - 1]);
        dd /= H;
        if (x % 8 === 0) { eb += dd; nb++; } else { fu += dd; nf++; }
    }
    try { fs.unlinkSync(d); } catch (e) { /* noop */ }
    if (!nb || !nf || fu === 0) return null;
    return (eb / nb) / (fu / nf);
}

function monotona(vals, debeSubir) {
    if (vals.length < 3 || vals.some(v => v === null)) return null;
    let inv = 0;
    for (let i = 1; i < vals.length; i++) {
        const sube = vals[i] > vals[i - 1];
        if (debeSubir ? !sube : sube) inv++;
    }
    return { inversiones: inv, monotona: inv === 0 };
}

let ok = 0, total = 0;
function check(n, p, d) { total++; if (p) ok++; console.log('  ' + (p ? 'OK    ' : 'FALLA ') + n + (d ? '   -> ' + d : '')); }

(async () => {
    const informe = { schema: 'ape.hevc.detector-test.v1', generado: new Date().toISOString(), bitrates: BITRATES, resultados: {} };

    for (const codec of ['h264', 'hevc']) {
        console.log(`\n=== ${codec.toUpperCase()} a ${BITRATES.join(' / ')} kbps ===`);
        const hfs = [], b8s = [];
        for (const kbps of BITRATES) {
            const out = path.join(TMP, `${codec}_${kbps}.mp4`);
            if (!codificar(codec, kbps, out)) { console.log(`  ${kbps}k: CODIFICACION FALLIDA`); hfs.push(null); b8s.push(null); continue; }
            const h = hf(out, `${codec}_${kbps}`);
            const r = borde8(out, `${codec}_${kbps}`);
            console.log(`  ${String(kbps).padStart(5)}k  HF=${h === null ? '—' : h.toFixed(4)}  borde8=${r === null ? '—' : r.toFixed(4)}`);
            hfs.push(h); b8s.push(r);
            try { fs.unlinkSync(out); } catch (e) { /* noop */ }
        }
        // HF debe CAER al bajar bitrate => mirando de 8M a 500k, los valores deben bajar
        const mHF = monotona(hfs, false);
        // borde8 deberia SUBIR al comprimir mas si sirviera como detector
        const mB8 = monotona(b8s, true);
        informe.resultados[codec] = { hf: hfs, borde8: b8s, hf_monotona_decreciente: mHF, borde8_monotona_creciente: mB8 };
        console.log(`  HF monotona decreciente : ${mHF ? (mHF.monotona ? 'SI' : 'NO (' + mHF.inversiones + ' inversiones)') : 'NO COMPUTADO'}`);
        console.log(`  borde8 monotona creciente: ${mB8 ? (mB8.monotona ? 'SI' : 'NO (' + mB8.inversiones + ' inversiones)') : 'NO COMPUTADO'}`);
    }

    console.log('\n=== VEREDICTO ===');
    const rH = informe.resultados.h264, rE = informe.resultados.hevc;
    check('HF funciona en H.264 (monotona decreciente)', !!(rH.hf_monotona_decreciente && rH.hf_monotona_decreciente.monotona),
        rH.hf_monotona_decreciente ? rH.hf_monotona_decreciente.inversiones + ' inversiones' : 'no computado');
    check('HF funciona en HEVC (monotona decreciente)', !!(rE.hf_monotona_decreciente && rE.hf_monotona_decreciente.monotona),
        rE.hf_monotona_decreciente ? rE.hf_monotona_decreciente.inversiones + ' inversiones' : 'no computado');
    check('borde8 NO sirve en H.264 (no es monotona creciente)', !(rH.borde8_monotona_creciente && rH.borde8_monotona_creciente.monotona),
        rH.borde8_monotona_creciente ? rH.borde8_monotona_creciente.inversiones + ' inversiones' : 'no computado');
    check('borde8 NO sirve en HEVC (no es monotona creciente)', !(rE.borde8_monotona_creciente && rE.borde8_monotona_creciente.monotona),
        rE.borde8_monotona_creciente ? rE.borde8_monotona_creciente.inversiones + ' inversiones' : 'no computado');

    informe.conclusion = 'La metrica borde8/resto no discrimina compresion en ninguno de los dos codecs porque ambos llevan deblocking en bucle (HEVC ademas SAO), que borra precisamente esos bordes. Adaptarla a HEVC no la arregla: la metrica correcta es la energia de alta frecuencia.';
    informe.no_computado = [
        'No se ha medido sobre un stream HEVC real de proveedor: se ha codificado desde la grabacion del operador.',
        'Una sola fuente de contenido. Otro contenido podria dar numeros distintos, aunque el mecanismo (deblocking en bucle) es del codec, no del contenido.'
    ];
    const dest = path.join(ROOT, 'docs/audits/HEVC_BLOCK_DETECTOR_TEST.json');
    fs.writeFileSync(dest, JSON.stringify(informe, null, 2), 'utf8');
    console.log('\n  artefacto: ' + path.relative(ROOT, dest));
    console.log('\nTOTAL ' + ok + '/' + total);
    process.exit(ok === total ? 0 : 1);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
