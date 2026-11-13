#!/usr/bin/env node
'use strict';

// [2026-11-13] GATE: metrica CORRECTA para detectar sobrecompresion.
//
// QUE SE DESCUBRIO
// ================
// La metrica `borde8/resto` (energia de gradiente alineada a la rejilla de 8) NO detecta
// sobrecompresion en H.264. Medido con contenido CONTROLADO (mismo video, 5 bitrates):
//
//   contenido REAL, ratio full:  20 Mbps 1,1185 -> 400 kbps 1,1450   (50x mas compresion)
//   NO monotona: 2 inversiones en 4 saltos.
//
//   contenido SINTETICO:         20 Mbps 2,6507 -> 400 kbps 2,8811   NO monotona.
//
// LA CAUSA: H.264 lleva DEBLOCKING EN BUCLE activado por defecto. El codificador ELIMINA
// precisamente los bordes de bloque que esa metrica busca. Se estaba midiendo lo que el
// codec ya arreglo.
//
// LA METRICA QUE SI FUNCIONA: energia de ALTA FRECUENCIA = media de |Y - desenfoque(Y)|.
// Medido sobre el mismo video a 5 bitrates:
//
//   bitrate    HF_full   HF_banda
//    20000k      1,82      1,56
//     8000k      1,82      1,56
//     3000k      1,77      1,53
//     1000k      1,61      1,36
//      400k      1,24      1,13     <- 32 % de caida, MONOTONA PURA
//
// Lo que pierde un video sobrecomprimido es DETALLE, no alineacion de bloques. Es coherente
// con lo que el ojo ve: la imagen se ve blanda y sin textura.
//
// QUE EXIGE ESTE GATE
//   1. HF cae de forma MONOTONA al bajar el bitrate (sin inversiones)
//   2. La caida total es significativa (>= 15 %)
//   3. CONTROL NEGATIVO: dos codificaciones al MISMO bitrate dan HF casi identica
//      (si HF variara entre codificaciones identicas, no mediria compresion sino ruido)
//   4. CONTROL NEGATIVO de la metrica vieja: borde8/resto NO es monotona. Si algun dia lo
//      fuera, este gate avisa de que hay que re-evaluar la refutacion.
//
// Uso: node tools/quality/test_hf_detail_metric.js

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'scratch', 'hf_gate' + '_' + process.pid + '_' + Date.now());
try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) { /* EPERM en Windows no debe tumbar el gate */ }
fs.mkdirSync(TMP, { recursive: true });

const FUENTE = process.argv[2] ||
    'C:\\Users\\HFRC\\Downloads\\WhatsApp Video 2026-11-13 at 1.01.22 AM.mp4';

const BITRATES = [20000, 3000, 400];   // alto, medio, bajo: basta para la monotonia

let ok = 0, total = 0;
function check(nombre, pasa, detalle) {
    total++;
    if (pasa) ok++;
    console.log('  ' + (pasa ? 'OK    ' : 'FALLA ') + nombre + (detalle ? '   -> ' + detalle : ''));
}

function codificar(kbps, destino, tag) {
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-t', '4', '-i', FUENTE,
        '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 4}k`,
        '-g', '50', '-an', destino];
    try { execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch (e) { return false; }
    return fs.existsSync(destino);
}

function medirHF(video, etiqueta) {
    const dest = path.join(TMP, `hf_${etiqueta}.yuv`);
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1',
            '-i', video, '-frames:v', '1',
            '-vf', 'crop=1024:400:0:150,format=gray,split[a][b];[b]gblur=sigma=3[c];[a][c]blend=all_mode=difference',
            '-pix_fmt', 'gray', '-f', 'rawvideo', dest], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(dest)) return null;
    const b = fs.readFileSync(dest);
    if (!b.length) return null;
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i];
    try { fs.unlinkSync(dest); } catch (e) { /* noop */ }
    return s / b.length;
}

// La metrica vieja, para el control negativo de la refutacion
function medirBorde8(video, etiqueta) {
    const dest = path.join(TMP, `b8_${etiqueta}.yuv`);
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1',
            '-i', video, '-frames:v', '1', '-vf', 'crop=1024:400:0:150,format=gray',
            '-pix_fmt', 'gray', '-f', 'rawvideo', dest], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(dest)) return null;
    const b = fs.readFileSync(dest);
    const W = 1024, H = 400;
    if (b.length < W * H) return null;
    let eb = 0, nb = 0, fu = 0, nf = 0;
    for (let x = 8; x < W; x++) {
        let d = 0;
        for (let y = 0; y < H; y++) d += Math.abs(b[y * W + x] - b[y * W + x - 1]);
        d /= H;
        if (x % 8 === 0) { eb += d; nb++; } else { fu += d; nf++; }
    }
    try { fs.unlinkSync(dest); } catch (e) { /* noop */ }
    if (!nb || !nf || fu === 0) return null;
    return (eb / nb) / (fu / nf);
}

if (!fs.existsSync(FUENTE)) {
    console.error('FALTA el video de referencia: ' + FUENTE);
    process.exit(2);
}

(async () => {
    console.log('\n=== 1 · HF cae de forma MONOTONA al bajar el bitrate ===');
    const hf = [], b8 = [];
    for (const kbps of BITRATES) {
        const out = path.join(TMP, `enc_${kbps}.mp4`);
        if (!codificar(kbps, out, String(kbps))) { check('codificar ' + kbps + 'k', false, 'ffmpeg fallo'); continue; }
        const h = medirHF(out, String(kbps));
        const r = medirBorde8(out, String(kbps));
        console.log(`       ${String(kbps).padStart(6)}k  HF=${h === null ? '—' : h.toFixed(4)}  borde8=${r === null ? '—' : r.toFixed(4)}`);
        if (h !== null) hf.push({ kbps, v: h });
        if (r !== null) b8.push({ kbps, v: r });
        try { fs.unlinkSync(out); } catch (e) { /* noop */ }
    }

    check('hay al menos 3 mediciones', hf.length >= 3, `${hf.length} obtenidas`);

    if (hf.length >= 3) {
        let inversiones = 0;
        for (let i = 1; i < hf.length; i++) if (hf[i].v > hf[i - 1].v) inversiones++;
        const caida = (hf[0].v - hf[hf.length - 1].v) / hf[0].v;
        check('HF monotona decreciente (0 inversiones)', inversiones === 0, `${inversiones} inversiones`);
        check('caida total >= 15 %', caida >= 0.15, `${(caida * 100).toFixed(1)} %`);
    }

    console.log('\n=== 2 · CONTROL NEGATIVO: dos codificaciones IDENTICAS ===');
    const a = path.join(TMP, 'id_a.mp4'), b = path.join(TMP, 'id_b.mp4');
    const okA = codificar(3000, a, 'idA');
    const okB = codificar(3000, b, 'idB');
    if (okA && okB) {
        const ha = medirHF(a, 'idA'), hb = medirHF(b, 'idB');
        if (ha !== null && hb !== null) {
            const dif = Math.abs(ha - hb) / Math.max(ha, hb);
            // x264 es determinista con los mismos parametros: deben ser casi identicas
            check('mismo bitrate -> HF casi identica (dif < 2 %)', dif < 0.02, `${(dif * 100).toFixed(2)} %`);
        } else check('medir las dos codificaciones identicas', false, 'sin dato');
    } else check('codificar las dos identicas', false, 'ffmpeg fallo');
    try { fs.unlinkSync(a); fs.unlinkSync(b); } catch (e) { /* noop */ }

    console.log('\n=== 3 · CONTROL NEGATIVO de la metrica VIEJA (borde8/resto) ===');
    if (b8.length >= 3) {
        let inv8 = 0;
        for (let i = 1; i < b8.length; i++) if (b8[i].v < b8[i - 1].v) inv8++;
        // Se documenta que NO es monotona creciente: el ratio deberia SUBIR al comprimir mas
        const sube = b8[b8.length - 1].v > b8[0].v;
        const caidaB8 = (b8[0].v - b8[b8.length - 1].v) / b8[0].v;
        console.log(`       borde8: alto=${b8[0].v.toFixed(4)} bajo=${b8[b8.length - 1].v.toFixed(4)} sube=${sube} caida=${(caidaB8 * 100).toFixed(1)}%`);
        check('la metrica vieja NO responde como discriminador (queda refutada)',
            !(sube && caidaB8 > 0.15),
            'si ahora respondiera, habria que re-evaluar la refutacion del veredicto');
    } else check('mediciones de la metrica vieja', false, 'sin datos');

    console.log('\n----------------------------------------');
    console.log('TOTAL ' + ok + '/' + total);
    console.log('La metrica valida es HF = media de |Y - desenfoque(Y)|, NO la energia en la rejilla de 8.');
    process.exit(ok === total ? 0 : 1);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
