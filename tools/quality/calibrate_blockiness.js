#!/usr/bin/env node
'use strict';

// [2026-11-13] CALIBRACION de la metrica borde8/resto sobre fotogramas REALES.
//
// POR QUE EXISTE
// ==============
// El modulo Kotlin propuesto por el operador usa umbrales 1.15 / 1.20 / 1.25 elegidos a ojo,
// y una tabla de precision (100% / 95% / 90%) sin ninguna medicion detras. Mi propia medicion
// de un solo fotograma dio 1.248 en la banda inferior: justo en el borde, y con tres umbrales
// distintos segun el autor. Un umbral sin distribucion no es un umbral: es una opinion.
//
// Este script mide la metrica sobre MUCHOS fotogramas y regiones, y devuelve la DISTRIBUCION
// real (min, p25, mediana, p75, p95, max). De ahi sale el umbral, no al reves.
//
// METRICA (la misma del modulo, para que los numeros sean comparables)
//   ratio = gradiente medio en columnas multiplo de 8  /  gradiente medio en el resto
//   Si la compresion deja bordes de macrobloque, el cociente sube.
//
// REGIONES
//   full        : el fotograma entero
//   grass       : zona de cesped (degradado suave, deberia ser LIMPIA)
//   bottom_band : banda inferior con rotulos (alto contraste: el peor caso)
//
// CONTROL NEGATIVO
//   Se incluye una imagen SINTETICA de gradiente puro: si la metrica la marca como sucia,
//   la metrica esta rota, no la imagen.
//
// Uso: node tools/quality/calibrate_blockiness.js "<video>" [segundos-de-muestreo]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const video = process.argv[2];
const segundos = Number(process.argv[3] || 6);

if (!video || !fs.existsSync(video)) {
    console.error('FALTA el video. Uso: node tools/quality/calibrate_blockiness.js "<ruta>" [segundos]');
    process.exit(2);
}

const TMP = path.join(ROOT, 'scratch', 'calib');
fs.mkdirSync(TMP, { recursive: true });

// Regiones en coordenadas del video de origen (1024x576 en el del operador).
// Se leen de ffprobe para no asumir tamanos.
const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim();
const [W, H] = probe.split(',').map(Number);

const REGIONES = {
    full: { w: W, h: H, x: 0, y: 0 },
    grass: { w: Math.floor(W * 0.7), h: Math.floor(H * 0.25), x: Math.floor(W * 0.1), y: Math.floor(H * 0.35) },
    bottom_band: { w: Math.floor(W * 0.74), h: Math.floor(H * 0.14), x: Math.floor(W * 0.24), y: Math.floor(H * 0.85) }
};

function extraerLuma(t, r, archivo) {
    const vf = `crop=${r.w}:${r.h}:${r.x}:${r.y},format=gray`;
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t),
            '-i', video, '-frames:v', '1', '-vf', vf, '-pix_fmt', 'gray', '-f', 'rawvideo', archivo],
            { stdio: ['ignore', 'ignore', 'ignore'] });
        return fs.existsSync(archivo) ? fs.readFileSync(archivo) : null;
    } catch (e) { return null; }
}

// ratio = gradiente en columnas %8 / gradiente en el resto
function ratioBorde8(buf, rw, rh) {
    if (!buf || buf.length < rw * rh) return null;
    let enBorde = 0, nBorde = 0, fuera = 0, nFuera = 0;
    for (let x = 8; x < rw; x++) {
        let d = 0;
        for (let y = 0; y < rh; y++) {
            d += Math.abs(buf[y * rw + x] - buf[y * rw + x - 1]);
        }
        d /= rh;
        if (x % 8 === 0) { enBorde += d; nBorde++; }
        else { fuera += d; nFuera++; }
    }
    if (nBorde === 0 || nFuera === 0 || fuera === 0) return null;
    return (enBorde / nBorde) / (fuera / nFuera);
}

function stats(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return {
        n: s.length,
        min: +s[0].toFixed(4),
        p25: +q(0.25).toFixed(4),
        mediana: +q(0.5).toFixed(4),
        p75: +q(0.75).toFixed(4),
        p95: +q(0.95).toFixed(4),
        max: +s[s.length - 1].toFixed(4),
        media: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(4)
    };
}

(async () => {
    console.log('video   : ' + path.basename(video));
    console.log('tamano  : ' + W + 'x' + H);
    console.log('muestreo: ' + segundos + ' s a 3 fps');
    console.log('');

    const resultados = {};
    for (const k of Object.keys(REGIONES)) resultados[k] = [];

    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim());
    const hasta = Math.min(segundos, Math.max(0, dur - 0.2));

    for (let t = 0.2; t < hasta; t += 1 / 3) {
        for (const [k, r] of Object.entries(REGIONES)) {
            const f = path.join(TMP, `${k}_${t.toFixed(2).replace('.', '_')}.yuv`);
            const buf = extraerLuma(t.toFixed(3), r, f);
            const v = ratioBorde8(buf, r.w, r.h);
            if (v !== null) resultados[k].push(v);
            try { fs.unlinkSync(f); } catch (e) { /* noop */ }
        }
    }

    // ── CONTROL NEGATIVO: gradiente sintetico puro. DEBE dar ~1.0 ──────────────
    const sint = path.join(TMP, 'sintetico.yuv');
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
        '-i', 'gradients=size=1024x576:duration=0.1', '-frames:v', '1', '-vf', 'format=gray',
        '-pix_fmt', 'gray', '-f', 'rawvideo', sint], { stdio: ['ignore', 'ignore', 'ignore'] });
    const bufS = fs.existsSync(sint) ? fs.readFileSync(sint) : null;
    const rS = ratioBorde8(bufS, 1024, 576);
    try { fs.unlinkSync(sint); } catch (e) { /* noop */ }

    console.log('=== DISTRIBUCION DEL RATIO borde8/resto ===');
    for (const k of Object.keys(REGIONES)) {
        const st = stats(resultados[k]);
        if (!st) { console.log(`  ${k.padEnd(12)} SIN DATOS`); continue; }
        console.log(`  ${k.padEnd(12)} n=${String(st.n).padStart(3)}  min=${st.min}  p25=${st.p25}  mediana=${st.mediana}  p75=${st.p75}  p95=${st.p95}  max=${st.max}`);
    }
    console.log('');
    console.log('=== CONTROL NEGATIVO ===');
    console.log('  gradiente sintetico (deberia dar ~1.0): ' + (rS === null ? 'NO COMPUTADO' : rS.toFixed(4)));

    const out = {
        schema: 'ape.blockiness.calibration.v1',
        generado: new Date().toISOString(),
        video: path.basename(video),
        tamano: `${W}x${H}`,
        regiones: Object.fromEntries(Object.keys(REGIONES).map(k => [k, stats(resultados[k])])),
        control_negativo: {
            descripcion: 'gradiente sintetico puro (lavfi gradients); si la metrica lo marca sucio, la metrica esta rota',
            ratio: rS,
            veredicto: rS === null ? 'NO_COMPUTADO' : (Math.abs(rS - 1.0) < 0.15 ? 'OK (cerca de 1.0)' : 'SOSPECHOSO')
        },
        no_computado: [
            'La calibracion es sobre UNA fuente (el video del operador, grabado con telefono a 1,38 Mbps).',
            'La compresion del telefono contamina la medida: no es la imagen del televisor.',
            'Para umbrales de produccion hace falta medir frames del DECODIFICADOR, no de una grabacion.'
        ]
    };
    const destino = path.join(ROOT, 'docs/audits/BLOCKINESS_CALIBRATION.json');
    fs.writeFileSync(destino, JSON.stringify(out, null, 2), 'utf8');
    console.log('');
    console.log('artefacto: ' + path.relative(ROOT, destino));

    if (!rS || Math.abs(rS - 1.0) >= 0.15) {
        console.error('CONTROL NEGATIVO FALLIDO: la metrica no da ~1.0 en un gradiente puro. Umbrales NO validos.');
        process.exit(1);
    }
    process.exit(0);
})();
