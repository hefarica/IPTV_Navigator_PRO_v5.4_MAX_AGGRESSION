#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * validate_filter_chain.js — juez de EJECUCIÓN de una cadena de filtros contra el ffmpeg real.
 *
 * Skill: ape-lista-cartographer
 * Versión: 1.0.0
 *
 * QUÉ HACE
 *   Genera un y4m sintético determinista, escribe la cadena en un `-filter_script` y ejecuta
 *   ffmpeg. El veredicto es el del parser de verdad: `exit 0` = PASS, cualquier otra cosa = FAIL
 *   con el primer mensaje literal del parser.
 *
 *   Es el complemento de map_list.js: `ffmpeg -h filter=X` valida nombres y rangos numéricos;
 *   solo la EJECUCIÓN resuelve las constantes simbólicas (p. ej. `zscale transfer=st2084`).
 *
 * GARANTÍAS
 *   - Cero dependencias externas. Sin red. No escribe fuera de un directorio temporal propio.
 *   - Si ffmpeg no está: NO_COMPUTADO con la razón. Nunca PASS por defecto.
 *   - No toca la lista: `--from-list` solo la lee.
 *
 * USO
 *   node scripts/validate_filter_chain.js --chain "<cadena>"
 *   node scripts/validate_filter_chain.js --chain-file <ruta.txt>
 *   node scripts/validate_filter_chain.js --from-list <lista.m3u8> [--limit N]
 *
 * OPCIONES
 *   --chain <s>        cadena de filtros a validar
 *   --chain-file <f>   cadena en un archivo (una línea)
 *   --from-list <f>    valida todas las cadenas `#EXTVLCOPT:video-filter=` distintas de la lista
 *   --limit <N>        con --from-list: máximo de cadenas distintas a validar (default: todas)
  --per-stage        además de la cadena completa, valida CADA etapa por separado
                     (revela todos los defectos en una corrida, no solo el primero)
 *   --size <WxH>       tamaño de la fuente sintética (default 640x360)
 *   --frames <N>       frames de salida (default 30)
 *   --ffmpeg <ruta>    binario ffmpeg
 *   --json             salida JSON (siempre incluye el resumen legible en stderr)
 *   --keep-temp        no borra el directorio temporal (para inspección)
 *
 * EXIT
 *   0 PASS · 1 FAIL · 2 error de uso · 3 NO_COMPUTADO (sin ffmpeg)
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const TOOL = { name: 'validate_filter_chain.js', version: '1.0.0', schema: 'ape-lista-cartographer/chain-validation@1' };
const REDACTED = '<REDACTED>';

const HELP = `validate_filter_chain.js — PASS/FAIL de una cadena de filtros contra el ffmpeg instalado

  node scripts/validate_filter_chain.js --chain "<cadena>" [--size 640x360] [--frames 30] [--per-stage]
  node scripts/validate_filter_chain.js --chain-file <archivo>
  node scripts/validate_filter_chain.js --from-list <lista.m3u8> [--limit N]
  [--ffmpeg <ruta>] [--json] [--keep-temp]

exit 0 PASS · 1 FAIL · 2 uso · 3 NO_COMPUTADO (ffmpeg ausente)
NO modifica la lista. NO usa red. Cero dependencias externas.`;

function parseArgv(argv) {
  const o = { size: '640x360', frames: 30, ffmpeg: null, json: false, keepTemp: false, limit: null, perStage: false };
  const need = (i, k) => { if (i + 1 >= argv.length) throw new Error(`falta el valor de ${k}`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--chain': o.chain = need(i, a); i++; break;
      case '--chain-file': o.chainFile = path.resolve(need(i, a)); i++; break;
      case '--from-list': o.fromList = path.resolve(need(i, a)); i++; break;
      case '--limit': o.limit = Number(need(i, a)); i++; break;
      case '--per-stage': o.perStage = true; break;
      case '--size': o.size = need(i, a); i++; break;
      case '--frames': o.frames = Number(need(i, a)); i++; break;
      case '--ffmpeg': o.ffmpeg = need(i, a); i++; break;
      case '--json': o.json = true; break;
      case '--keep-temp': o.keepTemp = true; break;
      case '-h': case '--help': o.help = true; break;
      default: throw new Error(`opción desconocida: ${a}`);
    }
  }
  return o;
}

const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

/** Redacta credenciales por si la cadena viniera de una fuente contaminada. */
function scrub(s) {
  if (s == null) return s;
  let v = String(s);
  v = v.replace(/\b([a-zA-Z][\w+.\-]*:\/\/)[^\s/@:]+:[^\s/@]*@/g, `$1${REDACTED}:${REDACTED}@`);
  v = v.replace(/\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, REDACTED);
  v = v.replace(/\bBearer\s+[A-Za-z0-9._\-]{8,}/gi, `Bearer ${REDACTED}`);
  v = v.replace(/\b[A-Fa-f0-9]{32,}\b/g, REDACTED);
  return v;
}

/* ───────────────────────────────────────────── fuente y4m determinista */

/**
 * Escribe un y4m 4:2:0 con N frames de un patrón determinista (gradiente + banda en movimiento).
 * No requiere lavfi ni ningún otro binario: el archivo lo produce este script.
 */
function writeSyntheticY4m(file, w, h, frames) {
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, `YUV4MPEG2 W${w} H${h} F25:1 Ip A1:1 C420mpeg2\n`);
  const ySize = w * h;
  const cSize = (w >> 1) * (h >> 1);
  const y = Buffer.allocUnsafe(ySize);
  const u = Buffer.alloc(cSize, 112);
  const v = Buffer.alloc(cSize, 144);
  for (let f = 0; f < frames; f++) {
    const shift = f * 3;
    for (let py = 0; py < h; py++) {
      const row = py * w;
      for (let px = 0; px < w; px++) {
        const band = ((px + shift) % 64) < 8 ? 60 : 0;
        y[row + px] = 16 + ((px * 180) / w | 0) / 2 + ((py * 60) / h | 0) / 2 + band;
      }
    }
    fs.writeSync(fd, 'FRAME\n');
    fs.writeSync(fd, y);
    fs.writeSync(fd, u);
    fs.writeSync(fd, v);
  }
  fs.closeSync(fd);
  return { bytes: fs.statSync(file).size, width: w, height: h, frames, pix_fmt: 'yuv420p', colorspace_tag: 'C420mpeg2' };
}

/* ─────────────────────────────────────────────────── validación 1 cadena */

function ffmpegVersion(bin) {
  const r = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 20000 });
  if (r.error) return { ok: false, reason: String(r.error.message || r.error) };
  if (r.status !== 0) return { ok: false, reason: `ffmpeg -version exit=${r.status}` };
  return { ok: true, version: String(r.stdout || '').split(/\r?\n/)[0].trim() };
}

/** Extrae el primer mensaje de error del parser de ffmpeg del stderr capturado. */
function firstParserError(stderr) {
  const lines = String(stderr || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const prefer = lines.find((l) => /out of range|Undefined constant|No such filter|Error while opening|No option name|Invalid argument|Error reinitializing|Cannot find|Unable to parse|Invalid value|not found|Error initializing|Failed to configure/i.test(l));
  return prefer || lines[0] || null;
}

/** Parte una cadena por comas de nivel superior (respeta paréntesis/corchetes/llaves/comillas). */
function splitTopLevel(chain, sep = ',') {
  const parts = [];
  let depth = 0; let cur = ''; let q = null;
  for (const ch of chain) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function validateOne(chain, opts, ctx) {
  const t0 = Date.now();
  const chainFile = path.join(ctx.tmp, `chain_${sha(chain).slice(0, 8)}.txt`);
  fs.writeFileSync(chainFile, `${chain}\n`, 'utf8');
  const args = [
    '-hide_banner', '-nostdin', '-y', '-v', 'error',
    '-i', ctx.y4m,
    '-filter_script:v', chainFile,
    '-frames:v', String(opts.frames),
    '-f', 'null', '-',
  ];
  const r = spawnSync(ctx.ffmpeg, args, { encoding: 'utf8', timeout: 300000 });
  const elapsed = Date.now() - t0;
  // ffmpeg devuelve el código negativo truncado a 32 bits (p. ej. -34 → 4294967262)
  const exitCode = r.error ? -1 : (r.status > 2147483647 ? r.status - 4294967296 : r.status);
  const stderr = `${r.stdout || ''}${r.stderr || ''}`;
  const status = r.error ? 'FAIL' : (r.status === 0 ? 'PASS' : 'FAIL');
  const result = {
    status,
    exit_code: exitCode,
    chain_sha256: sha(chain),
    chain_length: chain.length,
    chain: scrub(chain),
    frames_requested: opts.frames,
    elapsed_ms: elapsed,
    first_error: status === 'PASS' ? null : (r.error ? `spawn: ${String(r.error.message || r.error)}` : firstParserError(stderr)),
    stderr_tail: scrub(String(r.stderr || '').split(/\r?\n/).filter(Boolean).slice(-8).join('\n')),
    source: ctx.source,
    ffmpeg: ctx.ffmpegVersion,
  };
  try { fs.unlinkSync(chainFile); } catch { /* temporal */ }
  return result;
}

/* ───────────────────────────────────────── cadenas distintas de una lista */

function extractChainsFromList(file) {
  const counts = new Map();
  const fd = fs.openSync(file, 'r');
  const chunk = 8 * 1024 * 1024;
  const buf = Buffer.allocUnsafe(chunk);
  let carry = '';
  let lines = 0;
  for (;;) {
    const n = fs.readSync(fd, buf, 0, chunk, null);
    if (n <= 0) break;
    carry += buf.toString('utf8', 0, n);
    let start = 0;
    for (;;) {
      const nl = carry.indexOf('\n', start);
      if (nl < 0) break;
      lines++;
      const line = carry[start] === '#' && carry.endsWith('\r', nl) ? carry.slice(start, nl - 1) : carry.slice(start, nl);
      if (line.startsWith('#EXTVLCOPT:video-filter=')) {
        const chain = line.slice('#EXTVLCOPT:video-filter='.length);
        counts.set(chain, (counts.get(chain) || 0) + 1);
      }
      start = nl + 1;
    }
    carry = start ? carry.slice(start) : carry;
    if (carry.length > 64 * 1024 * 1024) throw new Error('línea patológicamente larga (>64 MiB)');
  }
  if (carry) {
    lines++;
    const line = carry.endsWith('\r') ? carry.slice(0, -1) : carry;
    if (line.startsWith('#EXTVLCOPT:video-filter=')) {
      const chain = line.slice('#EXTVLCOPT:video-filter='.length);
      counts.set(chain, (counts.get(chain) || 0) + 1);
    }
  }
  fs.closeSync(fd);
  return { lines, counts };
}

/* ─────────────────────────────────────────────────────────── main */

function main() {
  let opts;
  try { opts = parseArgv(process.argv.slice(2)); } catch (e) {
    console.error(`[chain] ${e.message}`);
    console.error(HELP);
    process.exit(2);
  }
  if (opts.help) { console.log(HELP); return; }
  if (!opts.chain && !opts.chainFile && !opts.fromList) {
    console.error('[chain] falta --chain, --chain-file o --from-list\n' + HELP);
    process.exit(2);
  }
  const m = /^(\d+)x(\d+)$/.exec(opts.size);
  if (!m) { console.error(`[chain] --size inválido: ${opts.size} (forma WxH)`); process.exit(2); }
  const w = Number(m[1]); const h = Number(m[2]);
  if (w < 16 || h < 16 || w > 4096 || h > 4096) { console.error('[chain] --size fuera de [16..4096]'); process.exit(2); }

  const bin = opts.ffmpeg || 'ffmpeg';
  const ver = ffmpegVersion(bin);
  const report = {
    schema: TOOL.schema,
    tool: TOOL,
    generated_at: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    ffmpeg: { bin, present: ver.ok, version: ver.ok ? ver.version : null, reason: ver.ok ? null : ver.reason },
    harness: { size: `${w}x${h}`, frames: opts.frames, pix_fmt: 'yuv420p' },
    results: [],
    limitations: [
      'La fuente es un y4m sintético ETIQUETADO (C420mpeg2). Una cadena con zscale sin parámetros *in puede comportarse distinto sobre un TS real sin etiquetar: en ese caso el veredicto de aquí es una cota, no una equivalencia.',
      'PASS significa que el filtergraph se construye y produce frames. NO significa que el filtro mejore la imagen ni que un player lo aplique.',
      'El coste medido depende del host y del tamaño elegido; no es una medida de tiempo real de producción.',
    ],
  };

  if (!ver.ok) {
    report.status = 'NO_COMPUTADO';
    report.reason = `ffmpeg no disponible (${ver.reason})`;
    emit(report, opts, 3);
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-cartographer-'));
  const ctx = {
    tmp,
    ffmpeg: bin,
    ffmpegVersion: ver.version,
    y4m: path.join(tmp, 'src.y4m'),
    source: null,
  };
  try {
    ctx.source = writeSyntheticY4m(ctx.y4m, w, h, Math.max(1, opts.frames));
    report.harness.source = ctx.source;

    if (opts.fromList) {
      const { lines, counts } = extractChainsFromList(opts.fromList);
      const list = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const max = opts.limit ? Math.min(opts.limit, list.length) : list.length;
      report.list = { path: opts.fromList, lines, distinct_chains: list.length, channels_per_chain: list.map(([, c]) => c), validated: max };
      for (let i = 0; i < max; i++) {
        const [chain, n] = list[i];
        const res = validateOne(chain, opts, ctx);
        res.channels = n;
        report.results.push(res);
      }
      const pass = report.results.filter((r) => r.status === 'PASS').length;
      const fail = report.results.filter((r) => r.status === 'FAIL').length;
      report.status = fail === 0 ? 'PASS' : (pass === 0 ? 'FAIL' : 'PARCIAL');
      report.verdict = { chains: report.results.length, pass, fail, channels_total: list.reduce((a, [, c]) => a + c, 0) };
      emit(report, opts, fail === 0 ? 0 : 1);
    } else {
      const chain = opts.chain || fs.readFileSync(opts.chainFile, 'utf8').split(/\r?\n/).find((l) => l.trim()) || '';
      if (!chain.trim()) { console.error('[chain] cadena vacía'); process.exit(2); }
      const full = validateOne(chain.trim(), opts, ctx);
      full.scope = 'cadena_completa';
      report.results.push(full);
      // --per-stage: cada etapa por separado, para ver TODOS los defectos en una sola corrida
      if (opts.perStage) {
        for (const stage of splitTopLevel(chain.trim(), ',')) {
          const r = validateOne(stage, opts, ctx);
          r.scope = 'etapa_aislada';
          r.stage = stage.split('=')[0].split('{')[0].trim();
          report.results.push(r);
        }
      }
      const fail = report.results.filter((r) => r.status === 'FAIL').length;
      report.status = full.status;
      report.verdict = {
        chains: opts.perStage ? report.results.length : 1,
        full_chain: full.status,
        pass: report.results.filter((r) => r.status === 'PASS').length,
        fail,
        stages_failing: report.results.filter((r) => r.scope === 'etapa_aislada' && r.status === 'FAIL').map((r) => r.stage),
      };
      emit(report, opts, full.status === 'PASS' ? 0 : 1);
    }
  } finally {
    if (!opts.keepTemp) {
      // solo se borra el directorio que este script creó (prefijo propio + mkdtemp)
      if (path.basename(tmp).startsWith('ape-cartographer-')) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    } else {
      console.error(`[chain] temporal conservado: ${tmp}`);
    }
  }
}

function emit(report, opts, exitCode) {
  if (opts.json) {
    const text = scrub(JSON.stringify(report, null, 2));
    console.log(text);
  } else {
    console.log(`# ${TOOL.name} v${TOOL.version}`);
    console.log(`ffmpeg: ${report.ffmpeg.present ? report.ffmpeg.version : `AUSENTE (${report.ffmpeg.reason})`}`);
    console.log(`fuente: y4m sintético ${report.harness.size} · ${report.harness.frames} frames`);
    if (report.status === 'NO_COMPUTADO') console.log(`ESTADO: NO_COMPUTADO — ${report.reason}`);
    for (const r of report.results) {
      console.log('');
      console.log(`## ${r.status}  (exit=${r.exit_code}, ${r.elapsed_ms} ms${r.channels ? `, ${r.channels} canales` : ''})`);
      console.log(`sha256: ${r.chain_sha256}`);
      console.log(`cadena: ${r.chain.length > 240 ? `${r.chain.slice(0, 240)}…` : r.chain}`);
      if (r.first_error) console.log(`primer error del parser: ${r.first_error}`);
      if (r.status === 'FAIL' && r.stderr_tail) console.log(`stderr (cola):\n${r.stderr_tail}`);
    }
    if (report.verdict) {
      console.log('');
      console.log(`RESUMEN: ${report.verdict.chains} cadenas · PASS ${report.verdict.pass} · FAIL ${report.verdict.fail}`);
    }
    console.log('');
    console.log('Límites: PASS = el filtergraph se construye y produce frames; NO = el filtro mejore la imagen ni que un player lo aplique.');
  }
  process.exit(exitCode);
}

main();
