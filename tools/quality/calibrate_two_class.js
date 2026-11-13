#!/usr/bin/env node
'use strict';

// [2026-11-13] CALIBRACION DE DOS CLASES — con CONTENIDO CONTROLADO.
//
// POR QUE NO SE HACE COMO SE PROPUSO
// ==================================
// El procedimiento propuesto compara "un stream limpio" contra "un stream sucio". Eso mezcla
// DOS variables: el CONTENIDO y la COMPRESION. Si el "limpio" es otro canal, cualquier
// diferencia puede venir del contenido y no de los artefactos. El resultado no seria
// interpretable.
//
// EL EXPERIMENTO CORRECTO
// =======================
// Mismo contenido, codificado a VARIOS bitrates. La unica variable que cambia es la
// compresion. Si la metrica borde8/resto sirve para detectar artefactos de compresion, debe
// subir MONOTONAMENTE al bajar el bitrate. Si es plana o ruidosa, la metrica no sirve y
// ningun umbral la salva.
//
// DOS CONTENIDOS
//   real       : fotogramas del video del operador (contenido de futbol real)
//   sintetico  : patron con texto y detalle (controlado, sin compresion previa)
//
// SALIDA
//   Por cada contenido x bitrate: la distribucion del ratio en las tres regiones.
//   Veredicto de monotonia: si el ratio NO sube al bajar bitrate, la metrica no discrimina.
//
// Uso: node tools/quality/calibrate_two_class.js

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'scratch', 'calib2class' + '_' + process.pid + '_' + Date.now());
try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) { /* EPERM en Windows no debe tumbar el gate */ }
fs.mkdirSync(TMP, { recursive: true });

const VIDEO_REAL = process.argv[2] ||
    'C:\\Users\\HFRC\\Downloads\\WhatsApp Video 2026-11-13 at 1.01.22 AM.mp4';

// Bitrates de la misma fuente: del muy alto (referencia) al muy bajo (artefactos garantizados)
const BITRATES = [
    { nombre: 'REF_20M', kbps: 20000 },
    { nombre: 'ALTO_8M', kbps: 8000 },
    { nombre: 'MEDIO_3M', kbps: 3000 },
    { nombre: 'BAJO_1M', kbps: 1000 },
    { nombre: 'MUYBAJO_400K', kbps: 400 }
];

function sh(cmd, args) {
    return execFileSync(cmd, args, { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Extrae luma de la region y devuelve el ratio borde8/resto
function ratioRegion(video, t, r) {
    const dest = path.join(TMP, 'r.yuv');
    try {
        sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video,
            '-frames:v', '1', '-vf', `crop=${r.w}:${r.h}:${r.x}:${r.y},format=gray`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', dest]);
    } catch (e) { return null; }
    if (!fs.existsSync(dest)) return null;
    const b = fs.readFileSync(dest);
    if (b.length < r.w * r.h) return null;
    let eb = 0, nb = 0, fu = 0, nf = 0;
    for (let x = 8; x < r.w; x++) {
        let d = 0;
        for (let y = 0; y < r.h; y++) d += Math.abs(b[y * r.w + x] - b[y * r.w + x - 1]);
        d /= r.h;
        if (x % 8 === 0) { eb += d; nb++; } else { fu += d; nf++; }
    }
    if (!nb || !nf || fu === 0) return null;
    return (eb / nb) / (fu / nf);
}

function stats(a) {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return {
        n: s.length,
        min: +s[0].toFixed(4), p25: +q(.25).toFixed(4), mediana: +q(.5).toFixed(4),
        p75: +q(.75).toFixed(4), p95: +q(.95).toFixed(4), max: +s[s.length - 1].toFixed(4),
        media: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(4)
    };
}

function medir(video, W, H, segundos) {
    const regiones = {
        full: { w: W, h: H, x: 0, y: 0 },
        banda_inferior: { w: Math.floor(W * 0.74), h: Math.floor(H * 0.14), x: Math.floor(W * 0.24), y: Math.floor(H * 0.85) }
    };
    const acc = {};
    for (const k of Object.keys(regiones)) acc[k] = [];
    for (let t = 0.3; t < segundos; t += 0.5) {
        for (const [k, r] of Object.entries(regiones)) {
            const v = ratioRegion(video, t.toFixed(3), r);
            if (v !== null) acc[k].push(v);
        }
    }
    return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, stats(v)]));
}

function codificar(fuente, kbps, destino, esReal) {
    // Mismo codec, misma resolucion, mismo GOP. Solo cambia el bitrate.
    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    if (esReal) args.push('-t', '4', '-i', fuente);
    else args.push('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=4');
    args.push('-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${Math.round(kbps * 4)}k`,
        '-g', '50', '-an', destino);
    try { sh('ffmpeg', args); return fs.existsSync(destino); } catch (e) { return false; }
}

const informe = {
    schema: 'ape.blockiness.two-class.v1',
    generado: new Date().toISOString(),
    metodo: 'mismo contenido x varios bitrates: la unica variable es la compresion',
    bitrates: BITRATES.map(b => b.kbps),
    contenidos: {}
};

let monotonoGlobal = true;

for (const contenido of ['real', 'sintetico']) {
    console.log('\n=== CONTENIDO ' + contenido.toUpperCase() + ' ===');
    const filas = [];
    for (const b of BITRATES) {
        const out = path.join(TMP, `${contenido}_${b.nombre}.mp4`);
        const ok = codificar(VIDEO_REAL, b.kbps, out, contenido === 'real');
        if (!ok) { console.log(`  ${b.nombre.padEnd(14)} CODIFICACION FALLIDA`); continue; }
        // el sintetico sale en 1280x720; el real conserva su tamano
        const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
        const [W, H] = probe.split(',').map(Number);
        const st = fs.statSync(out);
        const kbpsReal = Math.round((st.size * 8) / 4 / 1000);   // tamano*8 / 4s
        const m = medir(out, W, H, 3.5);
        if (!m.full) { console.log(`  ${b.nombre.padEnd(14)} sin medicion`); continue; }
        console.log(`  ${b.nombre.padEnd(14)} objetivo=${String(b.kbps).padStart(5)}k  real=${String(kbpsReal).padStart(5)}k  ` +
            `full med=${m.full.mediana}  banda med=${m.banda_inferior ? m.banda_inferior.mediana : '—'}`);
        filas.push({ nombre: b.nombre, kbps_objetivo: b.kbps, kbps_real: kbpsReal, regiones: m });
        try { fs.unlinkSync(out); } catch (e) { /* noop */ }
    }

    // Monotonia: al bajar bitrate, la mediana debe SUBIR. Se comprueba de REF a MUYBAJO.
    const validas = filas.filter(f => f.regiones.full);
    let monotono = null, detalle = 'sin datos suficientes';
    if (validas.length >= 3) {
        const ref = validas[0].regiones.full.mediana;
        const bajo = validas[validas.length - 1].regiones.full.mediana;
        monotono = bajo > ref;
        // cuantas inversiones hay en la serie
        let inversiones = 0;
        for (let i = 1; i < validas.length; i++) {
            if (validas[i].regiones.full.mediana < validas[i - 1].regiones.full.mediana) inversiones++;
        }
        detalle = `REF=${ref} -> MUY_BAJO=${bajo} ; inversiones=${inversiones}/${validas.length - 1}`;
        if (!monotono || inversiones > 1) monotonoGlobal = false;
    }
    console.log(`  MONOTONIA (ratio debe subir al bajar bitrate): ` +
        (monotono === null ? 'NO COMPUTADO' : (monotono && detalle.includes('inversiones=0') ? 'MONOTONA' : 'NO MONOTONA / RUIDOSA')));
    console.log(`  ${detalle}`);
    informe.contenidos[contenido] = { filas, monotono, detalle };
}

const destino = path.join(ROOT, 'docs/audits/BLOCKINESS_TWO_CLASS.json');
fs.writeFileSync(destino, JSON.stringify(informe, null, 2), 'utf8');

console.log('\n----------------------------------------');
console.log('  artefacto: ' + path.relative(ROOT, destino));
console.log('  VEREDICTO: ' + (monotonoGlobal
    ? 'la metrica RESPONDE a la compresion en los dos contenidos -> calibrable'
    : 'la metrica NO responde de forma monotona en al menos un contenido -> NO calibrable con umbral fijo'));
process.exit(monotonoGlobal ? 0 : 1);
