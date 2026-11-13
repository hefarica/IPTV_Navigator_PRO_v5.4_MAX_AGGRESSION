#!/usr/bin/env node
'use strict';

// [2026-11-13] CALIBRADOR HF CON CLASIFICACION DE ZONA — probando la mejora que propuso el operador.
//
// EL PROBLEMA QUE HAY QUE RESOLVER
// ================================
// La version anterior (hf_session_calibrator.js) compara cada fotograma contra la linea base
// del arranque. Su CONTROL NEGATIVO FALLO:
//   dos codificaciones IDENTICAS del mismo video -> ambas "DEGRADADO" con 6 alertas.
// Las alertas las disparaba el CAMBIO DE CONTENIDO (la camara hace zoom), no una degradacion.
//
// LA MEJORA QUE PROPUSO EL OPERADOR
// =================================
// Clasificar la zona por varianza local (FLAT / DETAIL / UNKNOWN) y comparar contra la
// varianza de la linea base. La idea: si el contenido se vuelve mas plano, el HF baja por
// el CONTENIDO, no por el codificador -> no debe alertar.
//
// REGLA QUE SE PRUEBA
//   alertar solo si la varianza actual esta dentro de +-20 % de la de la linea base
//   (mismo tipo de escena) Y el HF cae por encima del umbral.
//
// LO QUE DECIDE SI ESTO SIRVE: el mismo control negativo.
//   - Si dos codificaciones identicas dan 0 alertas -> la mejora funciona.
//   - Si siguen dando alertas -> no funciona y hay que decirlo otra vez.
//
// Uso: node tools/quality/hf_zone_aware_calibrator.js "<video>" [segundos-base] [--json]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'scratch', 'hf_zone');
fs.mkdirSync(TMP, { recursive: true });

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const pos = args.filter(a => !a.startsWith('--'));
const video = pos[0];
const segBase = Number(pos[1] || 3);

if (!video || !fs.existsSync(video)) {
    console.error('FALTA el video.');
    process.exit(2);
}

// Umbrales del operador, todos medidos antes
const SUELO_RUIDO = 0.04;      // % entre dos codificaciones identicas
const UMBRAL_ALERTA = 2.0;     // %  (50x el suelo)
const UMBRAL_SEVERO = 8.0;     // %  (equivale a bitrate/2)
const TOLERANCIA_ZONA = 20;    // % de varianza permitida para considerar "la misma escena"

const REGION = { w: 1024, h: 400, x: 0, y: 150 };

function extraer(video_, t, filtro, destino) {
    try {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t),
            '-i', video_, '-frames:v', '1',
            '-vf', `crop=${REGION.w}:${REGION.h}:${REGION.x}:${REGION.y},${filtro}`,
            '-pix_fmt', 'gray', '-f', 'rawvideo', destino], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { return null; }
    if (!fs.existsSync(destino)) return null;
    const b = fs.readFileSync(destino);
    try { fs.unlinkSync(destino); } catch (e) { /* noop */ }
    return b.length ? b : null;
}

// HF = media de |Y - desenfoque(Y)|
function medirHF(video_, t, tag) {
    const d = path.join(TMP, `hf_${tag}.yuv`);
    const b = extraer(video_, t,
        'format=gray,split[a][b];[b]gblur=sigma=3[c];[a][c]blend=all_mode=difference', d);
    if (!b) return null;
    let s = 0; for (let i = 0; i < b.length; i++) s += b[i];
    return s / b.length;
}

// Varianza local: distingue escena plana de escena con detalle
function medirVarianza(video_, t, tag) {
    const d = path.join(TMP, `sd_${tag}.yuv`);
    const b = extraer(video_, t, 'format=gray', d);
    if (!b) return null;
    let s = 0; for (let i = 0; i < b.length; i++) s += b[i];
    const m = s / b.length;
    let v = 0; for (let i = 0; i < b.length; i++) { const x = b[i] - m; v += x * x; }
    return Math.sqrt(v / b.length);
}

const dur = (() => { try {
    return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim());
} catch (e) { return 10; } })();
const fin = Math.min(dur - 0.3, Math.max(segBase + 2, 9));

// Linea base
const baseHF = [], baseVar = [];
for (let t = 0.3; t < segBase; t += 0.5) {
    const h = medirHF(video, t, 'b' + t.toFixed(2));
    const v = medirVarianza(video, t, 'b' + t.toFixed(2));
    if (h !== null && v !== null) { baseHF.push(h); baseVar.push(v); }
}
if (!baseHF.length) { console.error('sin linea base'); process.exit(2); }
const media = a => a.reduce((x, y) => x + y, 0) / a.length;
const refHF = media(baseHF);
const refVar = media(baseVar);

// Serie posterior, con y sin clasificacion de zona
const sinZona = [], conZona = [];
for (let t = segBase; t < fin; t += 0.5) {
    const h = medirHF(video, t, 's' + t.toFixed(2));
    const v = medirVarianza(video, t, 's' + t.toFixed(2));
    if (h === null || v === null) continue;
    const caida = (refHF - h) / refHF * 100;
    const nivel = caida >= UMBRAL_SEVERO ? 'SEVERO' : caida >= UMBRAL_ALERTA ? 'ALERTA' : null;

    // A) sin clasificacion (version anterior): alerta por caida de HF
    if (nivel) sinZona.push({ t: +t.toFixed(1), hf: +h.toFixed(4), caida: +caida.toFixed(2), nivel });

    // B) con clasificacion de zona (mejora propuesta): solo si la varianza es comparable
    const difVar = Math.abs(v - refVar) / refVar * 100;
    const mismaEscena = difVar <= TOLERANCIA_ZONA;
    if (nivel && mismaEscena) {
        conZona.push({ t: +t.toFixed(1), hf: +h.toFixed(4), caida: +caida.toFixed(2), nivel,
            varianza: +v.toFixed(2), dif_varianza_pct: +difVar.toFixed(1) });
    }
    // B2) y la variante con el sesgo: alertar si la escena se volvio MAS plana y el HF cayo
}

const out = {
    schema: 'ape.hf.zone-aware.v1',
    generado: new Date().toISOString(),
    fuente: path.basename(video),
    umbrales: { suelo_ruido_pct: SUELO_RUIDO, alerta_pct: UMBRAL_ALERTA, severo_pct: UMBRAL_SEVERO, tolerancia_zona_pct: TOLERANCIA_ZONA },
    linea_base: { hf: +refHF.toFixed(4), varianza: +refVar.toFixed(2), muestras: baseHF.length },
    sin_clasificacion_de_zona: { alertas: sinZona.length, detalle: sinZona },
    con_clasificacion_de_zona: { alertas: conZona.length, detalle: conZona },
    veredicto: conZona.length === 0
        ? 'la clasificacion de zona ELIMINA las alertas en esta serie'
        : 'la clasificacion de zona NO elimina todas las alertas: quedan ' + conZona.length
};

if (JSON_OUT) {
    console.log(JSON.stringify(out, null, 2));
} else {
    console.log('base: HF=' + out.linea_base.hf + '  varianza=' + out.linea_base.varianza + '  n=' + out.linea_base.muestras);
    console.log('');
    console.log('SIN clasificacion de zona (version anterior): ' + sinZona.length + ' alertas');
    for (const a of sinZona.slice(0, 8)) console.log(`  [${a.nivel}] t=${a.t}s HF=${a.hf} caida ${a.caida} %`);
    console.log('');
    console.log('CON clasificacion de zona (mejora propuesta): ' + conZona.length + ' alertas');
    for (const a of conZona.slice(0, 8)) console.log(`  [${a.nivel}] t=${a.t}s HF=${a.hf} caida ${a.caida} %  var=${a.varianza} (dif ${a.dif_varianza_pct} %)`);
    console.log('');
    console.log('  ' + out.veredicto);
}

const dest = path.join(ROOT, 'docs/audits/HF_ZONE_AWARE.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');
if (!JSON_OUT) console.log('\nartefacto: ' + path.relative(ROOT, dest));
process.exit(0);
