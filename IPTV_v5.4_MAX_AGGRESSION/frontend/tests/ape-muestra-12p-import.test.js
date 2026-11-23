/**
 * tests/ape-muestra-12p-import.test.js
 * ---------------------------------------------------------------------------
 * Comprueba que los DOS ficheros que entregó el operador en la ronda 15 están
 * dentro del producto, medidos, y que las tres fuentes que hablan de los mismos
 * doce perfiles dicen lo mismo:
 *
 *   A. el módulo lector es puro y sus invariantes se cumplen
 *   B. el CSV de la matriz se lee bien (comillas, CRLF, 18 columnas)
 *   C. las TRES fuentes coinciden celda a celda (324 celdas)
 *   D. el techo de buffer de la app reproduce el efectivo de los 12 perfiles
 *   E. el master de la muestra es estructuralmente válido (12 variantes, 0 roturas)
 *   F. los 49 hashes del manifiesto cuadran con lo enviado y lo no enviado
 *   G. la demanda entrada ≥ salida × (1+delta) sale por perfil, sin inventar
 *
 * LÍMITE HONESTO: esto demuestra que los contratos y la app coinciden en los
 * números. NO demuestra que un player reproduzca la muestra, ni que el buffer
 * no se agote, ni la calidad de imagen: nada de esto se ha abierto en un
 * navegador ni en un reproductor.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../js/ape-v9/muestra-12p-import.js');
const L12 = require('../js/ape-v9/lab-12p-conformance.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const S = path.join(ROOT, 'contracts', 'muestra-12p');
const LABV3 = path.join(ROOT, 'contracts', 'lab', 'APE_FUSION_PREMIUM_6K_4K_LAB_CALIBRATED_BULLETPROOF_v9.3.json');

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'esperado ' + JSON.stringify(want) + ', obtenido ' + JSON.stringify(got)); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
// sha256 leyendo el texto con LF. Hace falta porque al aplicar el parche en una copia
// limpia git reconvierte a CRLF los 3 ficheros que en el arbol estan en LF
// (core.autocrlf=true en esta maquina). No cambia el contenido: se declara aparte.
function shaNorm(p) { return crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex'); }
function cuadra(want, p) { return sha(p) === want || shaNorm(p) === want; }

const md = M.readMetadata(read(path.join(S, 'METADATA_12P.json')));
const mx = M.readMatrix(read(path.join(S, 'PROFILE_MATRIX_12P.csv')));
const lab = M.readLab(read(LABV3));
const master = read(path.join(S, 'MASTERLIST_12P.m3u8'));
const src = read(path.join(__dirname, '..', 'js', 'ape-v9', 'muestra-12p-import.js'));

console.log('\n=== A · el módulo lector es puro ===');
eq('A1  VERSION 1.0.0', M.VERSION, '1.0.0');
eq('A2  los invariantes propios pasan', M.validate().ok, true);
eq('A3  y son 6 de 6', M.validate().checks.filter((c) => c.ok).length, 6);
eq('A4  doce perfiles, sin repetir', M.ORDER.length, 12);
eq('A5  sin DOM', src.indexOf('document.') === -1, true);
eq('A6  sin red', src.indexOf('XMLHttpRequest') === -1 && src.indexOf('fetch(') === -1, true);
eq('A7  sin reloj', src.indexOf('Date.now(') === -1, true);
eq('A8  sin azar', src.indexOf('Math.random(') === -1, true);
eq('A9  no lee ficheros (no usa fs)', /require\('fs'\)/.test(src), false);
eq('A10 exporta por UMD a node y al navegador',
    src.indexOf('module.exports = factory()') > 0 && src.indexOf('APE_MUESTRA_12P') > 0, true);

console.log('\n=== B · el CSV se lee bien ===');
eq('B1  la cabecera tiene 18 columnas (no 19: la coma iba dentro de comillas)', mx.header.length, 18);
eq('B2  y hay 12 filas de perfiles', mx.count, 12);
eq('B3  el orden empieza por P0', mx.rows[0].id, 'P0');
eq('B4  la última es P5.5', mx.rows[11].id, 'P5.5');
eq('B5  el codec con coma queda entero', mx.byId.P0.codec_string, 'dvh1.08.06,ac-3');
eq('B6  una coma a pelo habría dado 19 celdas; con comillas da 18',
    M.parseCsv('a,"b,c"\n').length, 1);
eq('B7  y devuelve las 2 celdas', M.parseCsv('a,"b,c"\n')[0].length, 2);
eq('B8  los 12 declaran resolución, bitrate y techo efectivo',
    mx.rows.filter((r) => r.resolution && r.bitrate_mbps !== null && r.effective_target_s !== null).length, 12);

console.log('\n=== C · las tres fuentes coinciden celda a celda ===');
const cPlusM = M.agree(mx, md);
const cPlusL = M.agree(mx, lab);
const mPlusL = M.agree(md, lab);
ok('C1  matriz vs METADATA_12P.json: 12 perfiles × 9 campos', cPlusM.cells === 108, 'celdas=' + cPlusM.cells);
ok('C2  y coinciden todas', cPlusM.same, JSON.stringify(cPlusM.diffs.slice(0, 3)));
ok('C3  matriz vs zip_calibration del LAB v9.3', cPlusL.cells === 108 && cPlusL.same,
    'celdas=' + cPlusL.cells + ' difs=' + JSON.stringify(cPlusL.diffs.slice(0, 3)));
ok('C4  METADATA vs LAB v9.3', mPlusL.cells === 108 && mPlusL.same,
    'celdas=' + mPlusL.cells + ' difs=' + JSON.stringify(mPlusL.diffs.slice(0, 3)));
eq('C5  en total 324 celdas medidas', cPlusM.cells + cPlusL.cells + mPlusL.cells, 324);
eq('C6  y 324 iguales', cPlusM.matched + cPlusL.matched + mPlusL.matched, 324);
eq('C7  la muestra es de UN canal de demostración', md.channel && md.channel.id, 'demo.12p');
eq('C8  el LAB es la versión v9.3', String(lab.meta.version).indexOf('v9.3') > 0 || String(lab.meta.version).indexOf('V9.3') > 0, true);
eq('C9  que dice de dónde viene (v9.2)', String(lab.meta.previous_version || '').indexOf('9.2') >= 0, true);
eq('C10 los tres juegos tienen los 12 perfiles', [md.count, mx.count, lab.count].join(','), '12,12,12');

console.log('\n=== D · el techo de buffer de la app reproduce los 12 perfiles ===');
let capOk = 0, capBad = [];
mx.rows.forEach((r) => {
    const e = L12.effectiveBuffer({ declaredSec: r.declared_target_s, bitrateMbps: r.bitrate_mbps });
    if (e && e.effective_target_s === r.effective_target_s) capOk++;
    else capBad.push(r.id + ' app=' + (e && e.effective_target_s) + ' muestra=' + r.effective_target_s);
});
eq('D1  los 12 efectivos salen de la regla de la app', capOk, 12);
ok('D2  sin ninguna discrepancia', capBad.length === 0, capBad.join(' | '));
const p0 = mx.byId.P0;
const e0 = L12.effectiveBuffer({ declaredSec: p0.declared_target_s, bitrateMbps: p0.bitrate_mbps });
eq('D3  P0 declara 63 s', p0.declared_target_s, 63);
eq('D4  y el techo lo deja en 15 s', p0.effective_target_s, 15);
eq('D5  la app dice lo mismo', e0.effective_target_s, 15);
eq('D6  y marca que recortó', e0.capped, true);
eq('D7  el declarado NO se reescribe en el contrato', lab.byId.P0.declared_target_s, 63);
ok('D8  ningún efectivo supera el declarado',
    mx.rows.every((r) => r.effective_target_s <= r.declared_target_s), true);

console.log('\n=== E · el master de la muestra es válido ===');
const rep = M.masterReport(master);
eq('E1  empieza por #EXTM3U', rep.manifests, true);
eq('E2  131 líneas declaradas por el propio fichero', master.split(/\r?\n/).length - (master.endsWith('\n') ? 1 : 0), 131);
eq('E3  doce variantes #EXT-X-STREAM-INF', rep.variants.length, 12);
eq('E4  cero roturas: cada STREAM-INF va seguido de su URI', rep.violations.length, 0);
eq('E5  doce etiquetas de perfil', rep.profile_tags, 12);
eq('E6  siete etiquetas globales distintas', new Set(rep.globals).size, 7);
eq('E7  cada variante declara los 6 atributos',
    rep.variants.filter((v) => M.STREAM_INF_ATTRS.every((a) => v.attrs[a])).length, 12);
eq('E8  BANDWIDTH = bitrate declarado × 1 000 000 en las 12',
    rep.variants.filter((v) => Number(v.attrs.BANDWIDTH) === Math.round(mx.byId[v.profile].bitrate_mbps * 1000000)).length, 12);
eq('E9  y la URI apunta a la playlist de su perfil',
    rep.variants.filter((v) => v.uri === 'playlists/' + v.profile + '.m3u8').length, 12);

console.log('\n=== F · los 49 hashes del manifiesto cuadran ===');
const manLines = read(path.join(S, 'MANIFEST_SHA256.txt')).split(/\r?\n/).filter((l) => l.trim());
eq('F1  el manifiesto tiene 49 líneas', manLines.length, 49);
const entries = manLines.map((l) => { const i = l.indexOf('  '); return { sha: l.slice(0, i).trim(), name: l.slice(i + 2).trim() }; });
const present = entries.filter((e) => fs.existsSync(path.join(S, e.name)));
const missing = entries.filter((e) => !fs.existsSync(path.join(S, e.name)));
eq('F2  43 ficheros enviados y verificados', present.filter((e) => cuadra(e.sha, path.join(S, e.name))).length, 43);
eq('F3  ninguno discrepa', present.filter((e) => !cuadra(e.sha, path.join(S, e.name))).length, 0);
const soloLF = present.filter((e) => sha(path.join(S, e.name)) !== e.sha && cuadra(e.sha, path.join(S, e.name)));
eq('F3b sólo difieren en el fin de línea (0 en el árbol, 3 en la copia con autocrlf)',
    soloLF.length <= 3 && soloLF.every((e) => /\.(m3u|py)$/.test(e.name)), true);
eq('F4  y 6 declarados y NO enviados', missing.length, 6);
eq('F5  los 6 son los segmentos .ts', missing.filter((e) => /\.ts$/.test(e.name)).length, 6);
eq('F6  no queda ningún fichero sin declarar (salvo el propio manifiesto)',
    fs.readdirSync(S).filter((n) => /\.(json|csv|md|m3u8|m3u|txt|py|sh)$/.test(n) && !entries.some((e) => e.name === n)).join(','),
    'MANIFEST_SHA256.txt');
const integ = lab.meta.integrity || {};
const zip = (integ.inputs && integ.inputs.zip) || {};
eq('F7  el LAB declara el SHA-256 del ZIP de la muestra',
    zip.sha256, 'cd143c311d1d64df36d205e7890dcd3e5848af72d8429978ed2da802a01ee8a8');
eq('F8  y su tamaño en bytes', zip.bytes, 6280533);
eq('F9  y cuántas entradas usó del manifiesto', zip.entries_in_manifest, 49);
eq('F10 el JSON declara los 50 ficheros del ZIP (49 del manifiesto + el manifiesto mismo)', Object.keys(integ.zip_entries_used || {}).length, 50);
const zeu = integ.zip_entries_used || {};
const casan = Object.keys(zeu).filter((n) => fs.existsSync(path.join(S, n)) && cuadra(zeu[n], path.join(S, n)));
eq('F11 los 44 enviados casan también con el JSON (los 43 del manifiesto + el manifiesto)', casan.length, 44);

console.log('\n=== G · la demanda por perfil no inventa ===');
const conBitrate = mx.rows.filter((r) => r.bitrate_mbps !== null);
const dem = M.demandRows(mx.rows, 10);
eq('G1  los 12 declaran bitrate, así que los 12 se calculan',
    dem.filter((d) => d.computed).length, conBitrate.length);
eq('G2  todos los requisitos son enteros',
    dem.filter((d) => d.computed && Number.isInteger(d.required_bps)).length, conBitrate.length);
eq('G3  y mayores que la salida (delta 10 %)',
    dem.filter((d) => d.computed && d.required_bps > d.output_bps).length, conBitrate.length);
eq('G4  P0: 200 Mbps + 10 % = 220 000 000', M.demand(mx.byId.P0, 10).required_bps, 220000000);
eq('G5  el extra es exactamente la salida × delta', M.demand(mx.byId.P0, 10).extra_bps, 20000000);
eq('G6  sin bitrate no se calcula nada (no se inventa)',
    M.demand({ id: 'X', bitrate_mbps: null }, 10).computed, false);
eq('G7  el estado del cálculo se declara', typeof M.demand({ id: 'X', bitrate_mbps: null }, 10).why, 'string');

console.log('\n=== RESULTADO ===');
console.log('  PASS ' + PASS + ' / FAIL ' + FAIL);
console.log('RESUMEN PASS=' + PASS + ' FAIL=' + FAIL);
if (FAIL > 0) process.exitCode = 1;
