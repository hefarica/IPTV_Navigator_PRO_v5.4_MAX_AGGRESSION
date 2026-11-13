#!/usr/bin/env node
'use strict';

// [2026-11-13] ¿EXISTE EL "ARTEFACTO SAO"? Se mide, no se asume.
//
// LA AFIRMACION A COMPROBAR
// ========================
// "SAO causa suavizado artificial en bajas frecuencias" y por eso hace falta un detector
// especifico de artefactos SAO.
//
// LO QUE SAO ES EN REALIDAD
// =========================
// SAO (Sample Adaptive Offset) es un filtro EN BUCLE de HEVC que CORRIGE la reconstruccion:
// tiene dos modos, band offset (BO) y edge offset (EO), y su proposito es REDUCIR ringing y
// banding. No es una fuente de artefactos: es un corrector.
//
// PERO hay un efecto real y documentado: si SAO es demasiado agresivo, SOBRE-SUAVIZA y se
// come la textura fina. Eso SI seria medible.
//
// COMO SE COMPRUEBA
// =================
// Mismo contenido, mismo bitrate, misma codificacion: la UNICA variable es sao=0 vs sao=1.
//   - Si sao=1 baja el detalle (HF) de forma apreciable en zonas planas -> sobre-suavizado
//     confirmado, y el "detector SAO" tiene sentido: medir HF en zonas de bajo contraste.
//   - Si no cambia -> la afirmacion es falsa y un detector de SAO seria ruido.
//
// DOS REGIONES, porque el efecto se busca donde SAO actua:
//   PLANO   : cesped, bajo contraste, degradado suave  <- donde SAO sobre-suaviza
//   DETALLE : rotulos, alto contraste                  <- donde SAO apenas actua
//
// CONTROL NEGATIVO: dos codificaciones con los MISMOS parametros deben dar HF casi identica.
//
// Uso: node tools/quality/test_sao_artifact.js [video]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'scratch', 'sao_test' + '_' + process.pid + '_' + Date.now());
try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) { /* EPERM en Windows no debe tumbar el gate */ }
fs.mkdirSync(TMP, { recursive: true });

const FUENTE = process.argv[2] ||
    'C:\\Users\\HFRC\\Downloads\\WhatsApp Video 2026-11-13 at 1.01.22 AM.mp4';
const SEG = 3;
const BITRATES = [4000, 800];

const PLANO   = { w: 716, h: 144, x: 102, y: 201 };   // cesped
const DETALLE = { w: 1024, h: 400, x: 0, y: 150 };    // rotulos y movimiento

if (!fs.existsSync(FUENTE)) { console.error('FALTA la fuente: ' + FUENTE); process.exit(2); }

function codificar(kbps, sao, destino) {
    const x265 = `sao=${sao}:deblock=-1,-1:psy-rd=2.0:aq-mode=3:rdoq-level=2:rd=6:log-level=none`;
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-t', String(SEG), '-i', FUENTE,
        '-c:v', 'libx265', '-preset', 'medium', '-pix_fmt', 'yuv420p10le', '-profile:v', 'main10',
        '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 4}k`, '-g', '50',
        '-x265-params', x265, '-an', destino];
    try { execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch (e) { return false; }
    return fs.existsSync(destino);
}

function hf(video, region, tag) {
    const d = path.join(TMP, `hf_${tag}.yuv`);
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '0.8', '-i', video,
            '-frames:v', '1',
            '-vf', `crop=${region.w}:${region.h}:${region.x}:${region.y},format=gray,split[a][b];[b]gblur=sigma=3[c];[a][c]blend=all_mode=difference`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', d], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(d)) return null;
    const b = fs.readFileSync(d);
    if (!b.length) { try { fs.unlinkSync(d); } catch (e) { /* noop */ } return null; }
    let s = 0; for (let i = 0; i < b.length; i++) s += b[i];
    const v = s / b.length;
    try { fs.unlinkSync(d); } catch (e) { /* noop */ }
    return v;
}

// Contraste local: desviacion tipica del luma en la region. SAO actua mas donde el contraste
// es bajo; sirve para confirmar que las regiones son las que decimos que son.
function contraste(video, region, tag) {
    const d = path.join(TMP, `sd_${tag}.yuv`);
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '0.8', '-i', video,
            '-frames:v', '1', '-vf', `crop=${region.w}:${region.h}:${region.x}:${region.y},format=gray`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', d], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(d)) return null;
    const b = fs.readFileSync(d);
    let s = 0; for (let i = 0; i < b.length; i++) s += b[i];
    const m = s / b.length;
    let v = 0; for (let i = 0; i < b.length; i++) { const t = b[i] - m; v += t * t; }
    try { fs.unlinkSync(d); } catch (e) { /* noop */ }
    return Math.sqrt(v / b.length);
}

let ok = 0, total = 0;
function check(n, p, d) { total++; if (p) ok++; console.log('  ' + (p ? 'OK    ' : 'FALLA ') + n + (d ? '   -> ' + d : '')); }

(async () => {
    const informe = { schema: 'ape.sao.artifact-test.v1', generado: new Date().toISOString(), bitrates: BITRATES, filas: [] };

    console.log('=== Contraste de las dos regiones (para confirmar que son lo que decimos) ===');
    const refPlano = contraste(FUENTE, PLANO, 'ref_plano');
    const refDet = contraste(FUENTE, DETALLE, 'ref_det');
    console.log(`  PLANO   (cesped)       desv_tipica=${refPlano === null ? '—' : refPlano.toFixed(2)}`);
    console.log(`  DETALLE (rotulos)      desv_tipica=${refDet === null ? '—' : refDet.toFixed(2)}`);
    console.log('');

    for (const kbps of BITRATES) {
        console.log(`=== ${kbps} kbps — misma codificacion, solo cambia sao ===`);
        const fila = { kbps, sao_0: null, sao_1: null };
        for (const sao of [0, 1]) {
            const out = path.join(TMP, `sao${sao}_${kbps}.mp4`);
            if (!codificar(kbps, sao, out)) { console.log(`  sao=${sao}: CODIFICACION FALLIDA`); continue; }
            const hp = hf(out, PLANO, `p${sao}_${kbps}`);
            const hd = hf(out, DETALLE, `d${sao}_${kbps}`);
            const st = fs.statSync(out);
            console.log(`  sao=${sao}  HF_plano=${hp === null ? '—' : hp.toFixed(4)}  HF_detalle=${hd === null ? '—' : hd.toFixed(4)}  (${(st.size / 1024).toFixed(0)} KB)`);
            fila[`sao_${sao}`] = { hf_plano: hp, hf_detalle: hd, bytes: st.size };
            try { fs.unlinkSync(out); } catch (e) { /* noop */ }
        }
        informe.filas.push(fila);
        console.log('');
    }

    console.log('=== VEREDICTO: ¿SAO sobre-suaviza de forma medible? ===');
    let hayEfecto = false;
    for (const f of informe.filas) {
        if (!f.sao_0 || !f.sao_1 || f.sao_0.hf_plano === null || f.sao_1.hf_plano === null) continue;
        const difPct = (f.sao_0.hf_plano - f.sao_1.hf_plano) / f.sao_0.hf_plano * 100;
        const difDet = (f.sao_0.hf_detalle !== null && f.sao_1.hf_detalle !== null)
            ? (f.sao_0.hf_detalle - f.sao_1.hf_detalle) / f.sao_0.hf_detalle * 100 : null;
        console.log(`  ${f.kbps}k: sao=1 quita ${difPct.toFixed(2)} % de HF en zona PLANA` +
            (difDet === null ? '' : ` y ${difDet.toFixed(2)} % en zona de DETALLE`));
        // Se considera efecto real si sao=1 baja el HF de la zona plana mas de un 2 %
        if (difPct > 2) hayEfecto = true;
    }
    console.log('');
    check('SAO produce un sobre-suavizado medible (>2 % de HF en zona plana)', hayEfecto,
        hayEfecto ? 'efecto confirmado' : 'efecto NO detectado en este contenido');

    // CONTROL NEGATIVO: misma codificacion repetida
    console.log('');
    console.log('=== CONTROL NEGATIVO: dos codificaciones IDENTICAS (sao=1) ===');
    const a = path.join(TMP, 'id_a.mp4'), b = path.join(TMP, 'id_b.mp4');
    if (codificar(4000, 1, a) && codificar(4000, 1, b)) {
        const ha = hf(a, PLANO, 'ida'), hb = hf(b, PLANO, 'idb');
        if (ha !== null && hb !== null) {
            const dif = Math.abs(ha - hb) / Math.max(ha, hb) * 100;
            check('misma codificacion -> HF casi identica (dif < 2 %)', dif < 2, `${dif.toFixed(3)} %`);
        } else check('medir las identicas', false, 'sin dato');
    } else check('codificar las identicas', false, 'ffmpeg fallo');
    try { fs.unlinkSync(a); fs.unlinkSync(b); } catch (e) { /* noop */ }

    informe.conclusion = hayEfecto
        ? 'SAO sobre-suaviza de forma medible: un detector tiene sentido, y la metrica es HF en zonas de BAJO contraste (no en el cuadro completo).'
        : 'SAO NO sobre-suaviza de forma medible en este contenido: un detector especifico de SAO seria ruido, y la metrica HF general ya lo cubre.';
    informe.no_computado = [
        'No se leen los parametros SAO del bitstream: no se distingue BO de EO ni su intensidad por bloque.',
        'SAO actua en bucle en el ENCODER; el efecto medido es el resultado en la imagen decodificada, no el parametro.',
        'Una sola fuente de contenido: otra escena podria dar otro porcentaje.'
    ];

    const dest = path.join(ROOT, 'docs/audits/SAO_ARTIFACT_TEST.json');
    fs.writeFileSync(dest, JSON.stringify(informe, null, 2), 'utf8');
    console.log('');
    console.log('  artefacto: ' + path.relative(ROOT, dest));
    console.log('  ' + informe.conclusion);
    console.log('');
    console.log('TOTAL ' + ok + '/' + total);
    process.exit(ok === total ? 0 : 1);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
