#!/usr/bin/env node
/**
 * run_all_tests.js — bateria reproducible del arnes verify_demuxed.js
 * ============================================================================
 * Ejecuta TODOS los casos (5 fixtures obligatorios del encargo + 1 extra del
 * contrato con t10 + los casos de ffprobe con audio real + los casos de borde)
 * y compara el resultado con lo ESPERADO. Si algun caso se desvia, sale != 0.
 *
 *   node tools/ape-demuxed/fixtures/run_all_tests.js            # sin la lista real
 *   node tools/ape-demuxed/fixtures/run_all_tests.js --with-real-list
 *   node tools/ape-demuxed/fixtures/run_all_tests.js --real-list <ruta>
 *
 * No toca la lista (solo lectura) y escribe sus JSON en el directorio temporal
 * del sistema (no ensucia el repo). Cero dependencias.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const TOOL = path.join(HERE, '..', 'verify_demuxed.js');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-verify-tests-'));
const argv = process.argv.slice(2);
const withReal = argv.includes('--with-real-list') || argv.includes('--real-list');
const realIdx = argv.indexOf('--real-list');
const realPath = realIdx >= 0 ? argv[realIdx + 1] : 'C:\\Users\\HFRC\\Downloads\\APE_LISTA_1793589060441.m3u8';

const F = (n) => path.join(HERE, n);
const A = (n) => path.join(HERE, 'audio', n);

// id, args, exit esperado, gates esperados (prefijo de estado) y nota
const cases = [
  // --- los 5 casos obligatorios del encargo ---
  ['C1_master_correcto', [F('master_ok.m3u8'), '--source-resolution', '3840x2160'], 0,
    { g1: 'PASS', g2: 'PASS', g3: 'PASS', g4: 'NO_COMPUTADO' },
    'master demuxed correcto: estructura OK, cero downscale, cero caps. Throughpass NO_COMPUTADO (no se aporto segmento).'],
  ['C2_downscale_video', [F('master_downscale_variant.m3u8'), '--source-resolution', '3840x2160'], 1,
    { g2: 'FAIL' }, 'variante 1920x1080 declarando fuente 3840x2160 => FAIL'],
  ['C3_cap_max_resolution', [F('master_cap_max_resolution.m3u8'), '--source-resolution', '3840x2160'], 1,
    { g3: 'FAIL' }, 'inputstream.adaptive.max_resolution=1920x1080 => FAIL'],
  ['C4_session_data_name', [F('master_session_data_name.m3u8'), '--source-resolution', '3840x2160'], 1,
    { g1: 'FAIL' }, 'SESSION-DATA:NAME= en vez de DATA-ID= => FAIL'],
  ['C5_audio_group_inexistente', [F('master_audio_group_missing.m3u8'), '--source-resolution', '3840x2160'], 1,
    { g1: 'FAIL' }, 'AUDIO="grp" sin GROUP-ID declarado => FAIL'],

  // --- extra: contrato con t10 (cap_verdicts.json) ---
  ['C6_cap_chooser_t10', [F('master_chooser_cap_only.m3u8'), '--source-resolution', '3840x2160'], 1,
    { g3: 'FAIL' }, 'chooser_bandwidth_max (unico cap real segun t10, NO esta en los 8 del encargo) => FAIL'],

  // --- throughpass medido con ffprobe sobre audio REAL codificado por ffmpeg ---
  ['C7_audio_ac3_51_ok', [F('master_ok.m3u8'), '--source-resolution', '3840x2160',
    '--audio-segment', A('ac3_51_48k.ts'), '--expect-audio-codec', 'ac-3', '--expect-sample-rate', '48000', '--expect-channels', '6'], 0,
    { g4: 'PASS' }, 'AC-3 5.1 48 kHz medido: PASS'],
  ['C8_audio_eac3_51_ok', [F('master_ok.m3u8'), '--source-resolution', '3840x2160',
    '--audio-segment', A('eac3_51_48k.ts'), '--expect-audio-codec', 'ec-3', '--expect-sample-rate', '48000', '--expect-channels', '6'], 0,
    { g4: 'PASS' }, 'E-AC-3 5.1 48 kHz medido: PASS'],
  ['C9_audio_aac_st_ok', [F('master_ok.m3u8'), '--source-resolution', '3840x2160',
    '--audio-segment', A('aac_st_44100.aac'), '--expect-audio-codec', 'mp4a.40.2', '--expect-sample-rate', '44100', '--expect-channels', '2'], 0,
    { g4: 'PASS' }, 'AAC-LC estereo 44,1 kHz medido: PASS (downscale de audio permitido, no se penaliza)'],
  ['C10_audio_codec_equivocado', [F('master_ok.m3u8'), '--source-resolution', '3840x2160',
    '--audio-segment', A('ac3_51_48k.ts'), '--expect-audio-codec', 'ec-3'], 1,
    { g4: 'FAIL' }, 'se esperaba ec-3 y el segmento es ac-3: el gate DISCRIMINA => FAIL'],

  // --- bordes: lo que NO se puede medir se declara, no se disfraza ---
  ['C11_sin_source_resolution', [F('master_ok.m3u8')], 2,
    { g2: 'NO_COMPUTADO' }, 'sin --source-resolution no hay con que probar el cero-downscale => exit 2, no PASS'],
  ['C12_strict', [F('master_ok.m3u8'), '--source-resolution', '3840x2160', '--strict'], 2,
    { g4: 'NO_COMPUTADO' }, '--strict convierte el throughpass NO_COMPUTADO en exit 2'],
  ['C13_rendition_enmascarada', [path.join(HERE, '..', 'examples', 'fixture_demuxed_master.OUTPUT.m3u8'),
    '--source-resolution', '3840x2160', '--probe-rendition', 'EAC3 5.1'], 0,
    { g4: 'NO_COMPUTADO' }, 'URI *** (master redacted): no hay recurso medible => NO_COMPUTADO declarado'],
  ['C14_rendition_inalcanzable', [F('master_ok.m3u8'), '--source-resolution', '3840x2160', '--probe-rendition', 'EAC3 5.1'], 0,
    { g4: 'NO_COMPUTADO' }, 'dominio .invalid: ffprobe da I/O error => NO_COMPUTADO con el error literal'],
  ['C15_min_bitrate_suelo', [F('master_downscale_variant.m3u8'), '--source-resolution', '3840x2160', '--min-video-bitrate', '8000000'], 1,
    { g2: 'FAIL' }, 'umbral de bitrate: la variante de 4 Mbps no alcanza 8 Mbps => FAIL'],
  ['C16_sin_entrada', [], 3, {}, 'sin argumentos => exit 3 (uso)'],
  ['C17_fichero_inexistente', [F('no_existe_este_master.m3u8')], 4, {}, 'master inexistente => exit 4 (IO)']
];

let bad = 0;
const rows = [];
for (const [id, args, expExit, expGates, note] of cases) {
  const json = path.join(OUT, id + '.json');
  const r = spawnSync(process.execPath, [TOOL, ...args, '--json', json, '--quiet'], { encoding: 'utf8', timeout: 180000 });
  const exit = r.status;
  let gates = {};
  let verdict = '—';
  if (fs.existsSync(json)) {
    try {
      const j = JSON.parse(fs.readFileSync(json, 'utf8'));
      verdict = j.summary.verdict;
      gates = j.summary.gates.reduce((a, g) => { a[g.gate.split('_')[0].toLowerCase()] = g.status; return a; }, {});
    } catch (e) { verdict = 'JSON_ILEGIBLE'; }
  }
  const exitOk = exit === expExit;
  const gatesOk = Object.entries(expGates).every(([k, v]) => gates[k] === v);
  const ok = exitOk && gatesOk;
  if (!ok) bad++;
  rows.push({ id, exit, expExit, verdict, ok, gates, note });
  const detail = Object.entries(expGates).map(([k, v]) => k.split('_')[0] + '=' + (gates[k] || '∅') + (gates[k] === v ? '' : '(!=' + v + ')')).join(' ');
  process.stdout.write((ok ? 'OK  ' : 'MAL ') + id.padEnd(26) + ' exit=' + String(exit).padEnd(3) +
    ' esperado=' + String(expExit).padEnd(3) + ' verdict=' + String(verdict).padEnd(16) + detail + '\n');
  if (!ok) process.stdout.write('     notas: ' + note + '\n' + '     stderr: ' + String(r.stderr || '').slice(0, 300) + '\n');
}

// --- caso opcional: la lista de referencia completa (604 MB, 10.573 canales) ---
if (withReal && fs.existsSync(realPath)) {
  const json = path.join(OUT, 'C18_lista_referencia.json');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [TOOL, realPath, '--source-resolution', '3840x2160', '--json', json, '--quiet'],
    { encoding: 'utf8', timeout: 600000 });
  const ms = Date.now() - t0;
  let j = null;
  try { j = JSON.parse(fs.readFileSync(json, 'utf8')); } catch (e) { j = null; }
  const g3 = j && j.gates.g3_zero_video_caps;
  const ok = r.status === 1 && j && j.summary.verdict === 'FAIL' && g3.status === 'FAIL' &&
    j.gates.g1_structure.status === 'NO_COMPUTADO' && j.gates.g2_zero_video_downscale.status === 'PASS';
  if (!ok) bad++;
  process.stdout.write((ok ? 'OK  ' : 'MAL ') + 'C18_lista_referencia'.padEnd(26) + ' exit=' + String(r.status).padEnd(3) +
    ' verdict=' + (j ? j.summary.verdict : '∅').padEnd(16) +
    'caps_lines=' + (g3 ? g3.caps_lines : '∅') + ' (esperado 84584 = 8 x 10573)  ' + ms + ' ms\n');
} else if (withReal) {
  process.stdout.write('SKIP C18_lista_referencia: no existe ' + realPath + '\n');
}

process.stdout.write('\n' + (bad === 0 ? 'TODOS LOS CASOS COMO SE ESPERABA' : bad + ' CASO(S) FUERA DE LO ESPERADO') +
  '\nJSON de cada caso en: ' + OUT + '\n');
process.exit(bad === 0 ? 0 : 1);
