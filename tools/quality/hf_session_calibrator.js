#!/usr/bin/env node
'use strict';

// ##########################################################################################
// ##  REFUTADO COMO DETECTOR EN VIVO — se conserva SOLO como herramienta de comparacion  ##
// ##########################################################################################
//
// CONTROL NEGATIVO EJECUTADO (2026-11-13): dos codificaciones IDENTICAS del mismo video
// (mismos parametros, mismo contenido) dieron AMBAS "DEGRADADO" con 6 alertas cada una.
//
//   copia a: base=2,0249  alertas=6  veredicto=DEGRADADO
//   copia b: base=2,0249  alertas=6  veredicto=DEGRADADO
//
// CONCLUSION: las alertas las dispara el CAMBIO DE CONTENIDO (la camara se mueve, hace zoom,
// cambia de plano), no una degradacion. Un plano general tiene menos detalle que un primer
// plano, y el calibrador lo lee como caida.
//
// LA CAUSA DE FONDO: cualquier metrica de detalle aplicada a un stream vivo SIN REFERENCIA
// no puede separar "menos detalle porque el codificador lo tiro" de "menos detalle porque la
// escena lo tiene". Para separarlo hace falta la imagen original, que un reproductor no tiene.
//
// QUE SIGUE SIENDO VALIDO:
//   - Comparar el MISMO contenido a distintos bitrates (experimento controlado):
//     es como se midieron los umbrales y como se descubrio que HEVC gana +12 % de detalle
//     a 500 kbps y empata a 8 Mbps.
//   - NO es valido para decidir si un canal se ve mal en vivo.
//
// PARA EL ESTADO DEL PIPELINE (que si es objetivo y no inferencial) usar:
//   tools/probe/pipeline_lint.ps1   (geometria, color, cadencia, overrides)
//
// Este fichero se deja porque su utilidad de comparacion es real, no porque detecte nada.
// ##########################################################################################

// [2026-11-13] CALIBRADOR AUTOMATICO de HF — umbrales relativos, no absolutos.
//
// POR QUE RELATIVO Y NO ABSOLUTO
// ==============================
// El HF depende del CONTENIDO: un cesped y unos rotulos dan valores distintos. Un umbral
// fijo ("si HF < 1.2 esta sucio") marcaria canales buenos con contenido plano. Medido:
//   cesped   HF ~1,55
//   rotulos  HF ~1,83
//   sintetico HF ~2,6
// Cualquier umbral absoluto falla en cuanto cambia la escena.
//
// LO QUE SI ES MEDIBLE: la CAIDA de HF respecto al ARRANQUE del propio stream. Si el
// proveedor baja la variante en caliente, o si aparece un artefacto, el HF cae. Y la caida
// se mide contra la propia linea base de ese canal.
//
// EL SUELO DE RUIDO ESTA MEDIDO, no estimado:
//   dos codificaciones IDENTICAS con los mismos parametros -> 0,04 % de diferencia
//   (gate tools/quality/test_hf_detail_metric.js, control negativo)
// Y el efecto del bitrate:
//   de 4000 a 800 kbps en el cesped -> -8,0 %
//   sao 0 vs sao 1 a 4000 kbps      -> -2,6 %
// De ahi salen los umbrales, con el suelo de ruido como referencia:
//   < 1 %   ruido de medida (25x el suelo) -> ignorar
//   >= 2 %  cambio real (50x el suelo)
//   >= 8 %  equivale a bajar el bitrate a la mitad -> degradacion severa
//
// USO
// ===
//   node tools/quality/hf_session_calibrator.js "<video>" [segundos-linea-base]
//   node tools/quality/hf_session_calibrator.js "<video>" 3 --json
//
// IMPLEMENTADO CONTRA FICHEROS, no contra el decodificador del aparato: el bloqueante del
// ImageReader (ver VEREDICTO_BLOCKINESS_DETECTOR) sigue en pie. Este calibrador sirve para
// calcular los umbrales; llevarlo al device requiere resolver ese bloqueante aparte.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'scratch', 'hf_cal');
fs.mkdirSync(TMP, { recursive: true });

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const pos = args.filter(a => !a.startsWith('--'));
const video = pos[0];
const segBase = Number(pos[1] || 3);

if (!video || !fs.existsSync(video)) {
    console.error('FALTA el video. Uso: node tools/quality/hf_session_calibrator.js "<ruta>" [segundos]');
    process.exit(2);
}

// Suelo de ruido medido. NO es una estimacion.
const SUELO_RUIDO_PCT = 0.04;
const UMBRAL_CAMBIO_PCT = 2.0;      // 50x el suelo de ruido
const UMBRAL_SEVERO_PCT = 8.0;      // equivale a bajar el bitrate a la mitad

const REGIONES = {
    cuadro: { w: 1024, h: 400, x: 0, y: 150 },
    plano:  { w: 716,  h: 144, x: 102, y: 201 }
};

function hf(video_, region, tag) {
    const d = path.join(TMP, `hf_${tag}.yuv`);
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(tag),
            '-i', video_, '-frames:v', '1',
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

const dur = (() => {
    try {
        return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
            '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim());
    } catch (e) { return 10; }
})();
const fin = Math.min(dur - 0.3, Math.max(segBase + 1, 9));

// 1) Linea base: las primeras muestras
const base = { cuadro: [], plano: [] };
for (let t = 0.3; t < segBase; t += 0.5) {
    for (const [k, r] of Object.entries(REGIONES)) {
        const v = hf(video, r, t.toFixed(2));
        if (v !== null) base[k].push(v);
    }
}
// 2) Serie posterior
const serie = { cuadro: [], plano: [] };
for (let t = segBase; t < fin; t += 0.5) {
    for (const [k, r] of Object.entries(REGIONES)) {
        const v = hf(video, r, t.toFixed(2));
        if (v !== null) serie[k].push({ t: +t.toFixed(1), v });
    }
}

function media(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

const lineaBase = {};
const alertas = [];
for (const k of Object.keys(REGIONES)) {
    const m = media(base[k]);
    lineaBase[k] = m;
    for (const pt of serie[k]) {
        if (m === null || m === 0) continue;
        const caida = (m - pt.v) / m * 100;
        if (caida >= UMBRAL_SEVERO_PCT) {
            alertas.push({ region: k, t: pt.t, hf: +pt.v.toFixed(4), base: +m.toFixed(4), caida_pct: +caida.toFixed(2), nivel: 'SEVERO' });
        } else if (caida >= UMBRAL_CAMBIO_PCT) {
            alertas.push({ region: k, t: pt.t, hf: +pt.v.toFixed(4), base: +m.toFixed(4), caida_pct: +caida.toFixed(2), nivel: 'CAMBIO' });
        }
    }
}

const out = {
    schema: 'ape.hf.session-calibrator.v1',
    generado: new Date().toISOString(),
    fuente: path.basename(video),
    umbrales: {
        suelo_ruido_pct: SUELO_RUIDO_PCT,
        cambio_pct: UMBRAL_CAMBIO_PCT,
        severo_pct: UMBRAL_SEVERO_PCT,
        origen: 'suelo de ruido medido (0,04 % entre dos codificaciones identicas) x 50 = 2 %; 8 % equivale a bajar el bitrate a la mitad (medido: 4000->800 kbps da -8,0 % en el cesped)'
    },
    linea_base: Object.fromEntries(Object.entries(lineaBase).map(([k, v]) => [k, v === null ? null : +v.toFixed(4)])),
    muestras: serie.cuadro.length + serie.plano.length,
    alertas,
    veredicto: alertas.length === 0 ? 'ESTABLE: ninguna caida supera el umbral de cambio'
        : (alertas.some(a => a.nivel === 'SEVERO') ? 'DEGRADADO: hay caidas severas de detalle' : 'ATENCION: hay caidas por encima del umbral de cambio'),
    no_computado: [
        'Se ejecuta contra FICHEROS. El bloqueante del ImageReader como salida de MediaCodec sigue en pie: no se puede correr sobre el decodificador del aparato sin resolverlo.',
        'La linea base son los primeros ' + segBase + ' s. Si el stream ya viene degradado desde el inicio, no hay caida que detectar.',
        'Una escena con menos detalle natural (un plano de cielo) bajar\u00eda el HF sin que haya degradaci\u00f3n: por eso se usan DOS regiones y se compara contra la propia base.'
    ]
};

if (JSON_OUT) {
    console.log(JSON.stringify(out, null, 2));
} else {
    console.log('fuente      : ' + out.fuente);
    console.log('linea base  : cuadro=' + out.linea_base.cuadro + '  plano=' + out.linea_base.plano);
    console.log('muestras    : ' + out.muestras + ' (' + segBase + ' s de base)');
    console.log('umbrales    : cambio>=' + UMBRAL_CAMBIO_PCT + ' %  severo>=' + UMBRAL_SEVERO_PCT + ' %  (suelo de ruido ' + SUELO_RUIDO_PCT + ' %)');
    console.log('');
    if (!alertas.length) {
        console.log('  ' + out.veredicto);
    } else {
        for (const a of alertas.slice(0, 12)) {
            console.log(`  [${a.nivel}] ${a.region} t=${a.t}s  HF=${a.hf} (base ${a.base})  caida ${a.caida_pct} %`);
        }
        if (alertas.length > 12) console.log('  ... y ' + (alertas.length - 12) + ' mas');
        console.log('');
        console.log('  ' + out.veredicto);
    }
}

const dest = path.join(ROOT, 'docs/audits/HF_SESSION_CALIBRATION.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');
if (!JSON_OUT) console.log('\nartefacto: ' + path.relative(ROOT, dest));
process.exit(0);
