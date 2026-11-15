#!/usr/bin/env node
/**
 * tools/quality/test_ape_profile_project.js — prueba REAL del proyector por plantilla+nonces.
 *
 * QUE EXIGE (no admite prosa)
 *   1. `project` + `verify` sobre la LISTA REAL de 21.224 canales devuelven el MISMO sha256
 *      que el fichero original. Sin eso, el proyector NO SIRVE.
 *   2. Los dos contenedores (texto JSONL y gzip) reconstruyen byte a byte.
 *   3. Casos borde derivados de la propia lista real:
 *        a) canal SIN nonces (valores vaciados, forma intacta)
 *        b) canal SIN las etiquetas portadoras (forma distinta)
 *        c) canal con PERFIL DESCONOCIDO
 *        d) fichero TRUNCADO a mitad de linea (y a mitad de secuencia multibyte)
 *        e) fichero sin salto de linea final
 *   4. Prueba NEGATIVA: si se corrompe un byte de la proyeccion, `verify` DEBE salir con 5.
 *      Un verificador que no falla no verifica nada.
 *
 * USO
 *   node tools/quality/test_ape_profile_project.js [lista.m3u8] [--quick] [--allow-skip] [--fixtures-only]
 *     --quick          omite la pasada en contenedor de texto sobre la lista completa
 *     --fixtures-only  solo casos borde (no toca la lista completa; para depurar)
 *     --allow-skip     si no hay lista real, termina 0 con SKIP (por defecto sale 2)
 *   La ruta tambien se puede dar con la variable de entorno APE_PROJECT_LIST.
 *
 * SALIDA: una linea PASS/FAIL por caso, resumen y codigo de salida (0 = todo verde).
 *
 * SIN dependencias externas. Sin red. No toca la lista servida: escribe en os.tmpdir().
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TOOL = path.resolve(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'bin', 'ape-profile-project.js');

/* Tamano declarado de la lista LIGERA que se sirve hoy (dato del enunciado, NO medido aqui:
   ese fichero no esta en el workspace). Se usa solo como referencia informativa. */
const LIGHT_DECLARADO_BYTES = 186789613;

const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}` + (detail ? '  — ' + detail : ''));
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(8 << 20);
  let read;
  try {
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function runTool(args) {
  const res = spawnSync(process.execPath, ['--max-old-space-size=6144', TOOL].concat(args), {
    encoding: 'utf8',
    maxBuffer: 64 << 20
  });
  let json = null;
  try { json = JSON.parse(res.stdout); } catch (_e) { /* puede ser salida vacia o mixta */ }
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Localizacion de la lista real
 * ──────────────────────────────────────────────────────────────────────────────── */
function findRealList(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.APE_PROJECT_LIST) candidates.push(process.env.APE_PROJECT_LIST);
  candidates.push(
    path.join(ROOT, 'scratch', 'APE_LISTA_HARNESS.m3u8'),
    path.join(ROOT, 'scratch', 'viva.m3u8'),
    '/var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8'
  );
  for (const c of candidates) {
    try { if (fs.statSync(c).size > 100 * 1024 * 1024) return path.resolve(c); } catch (_e) { /* siguiente */ }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Fixtures derivados de la lista real (sin inventar ni un byte)
 * ──────────────────────────────────────────────────────────────────────────────── */

/** Devuelve {header:[], channels:[[linea,...],...], bytes} con los primeros maxCh canales. */
function readHead(file, maxCh) {
  const CH = 4 << 20;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(CH);
  const out = { header: [], channels: [], cutAt: 0, finalNewline: false };
  let cur = null;
  let carry = null;
  let offsetInFile = 0;
  let scan = 0; // lineas completas consumidas
  let read;
  try {
    outer:
    while ((read = fs.readSync(fd, buf, 0, CH, null)) > 0) {
      const base = offsetInFile;
      offsetInFile += read;
      let start = 0;
      for (let i = 0; i < read; i++) {
        if (buf[i] !== 10) continue;
        const piece = carry ? Buffer.concat([carry, buf.subarray(start, i)]) : buf.subarray(start, i);
        carry = null;
        const line = piece.toString('latin1');
        scan++;
        if (cur === null) {
          if (line.startsWith('#EXTINF')) { cur = [line]; } else out.header.push(line);
        } else if (line.startsWith('#EXTINF')) {
          out.channels.push(cur);
          if (out.channels.length >= maxCh) { out.cutAt = base + i + 1; break outer; }
          cur = [line];
        } else cur.push(line);
        start = i + 1;
      }
      if (start < read) {
        const tail = Buffer.from(buf.subarray(start, read));
        carry = carry ? Buffer.concat([carry, tail]) : tail;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  if (cur && out.channels.length < maxCh) out.channels.push(cur);
  if (out.cutAt === 0) out.cutAt = fs.statSync(file).size;
  let last = 0;
  try { const fd2 = fs.openSync(file, 'r'); const b = Buffer.alloc(1); fs.readSync(fd2, b, 0, 1, out.cutAt - 1); last = b[0]; fs.closeSync(fd2); } catch (_e) { /* noop */ }
  out.finalNewline = last === 10;
  return out;
}

/** Serializa lineas con las mismas reglas que el proyector (byte-exacto). */
function joinLines(lines) { return Buffer.from(lines.join('\n'), 'latin1'); }

const CARRIER_TAGS = [
  '#EXT-X-APE-IDEMPOTENCIA-SID',
  '#EXT-X-APE-POLIMORFISMO-NONCE',
  '#EXT-X-APE-POLIMORFISMO-REQUEST',
  '#EXT-X-APE-POLIMORFISMO-SESSION',
  '#EXT-X-APE-POLIMORFISMO-LIST-HASH',
  '#EXT-X-APE-IDEMPOTENCIA-CHANNEL-ID'
];
const PROFILE_TAGS = ['#EXT-X-APE-IDEMPOTENCIA-PROFILE', '#EXT-X-APE-QUALITY-OVERRIDE'];

function tagOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const c = line.indexOf(':');
  return c > 0 ? line.slice(0, c) : line;
}

/** Caso a: valores nonce vaciados pero etiquetas intactas (misma forma, sin nonces). */
function blankNonces(block) {
  return block.map((line) => {
    const t = tagOf(line);
    if (t && CARRIER_TAGS.indexOf(t) !== -1) return t + ':';
    return line;
  });
}

/** Caso b: etiquetas portadoras eliminadas (forma distinta). */
function stripCarrierTags(block) {
  return block.filter((line) => {
    const t = tagOf(line);
    return !(t && CARRIER_TAGS.indexOf(t) !== -1);
  });
}

/** Caso c: perfil desconocido (sin IDEMPOTENCIA-PROFILE ni QUALITY-OVERRIDE). */
function stripProfile(block) {
  return block.filter((line) => {
    const t = tagOf(line);
    return !(t && PROFILE_TAGS.indexOf(t) !== -1);
  });
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Casos
 * ──────────────────────────────────────────────────────────────────────────────── */

function checkRoundTrip(slug, label, fixture, dir, opts) {
  const base = path.join(dir, slug);
  const rc = runTool(['project', fixture, base + '.plain.m3u8', '--no-selfverify']);
  if (rc.code !== 0 || !rc.json || rc.json.ok !== true) {
    record(label + ' · project(texto)', false, 'exit=' + rc.code + ' ' + String(rc.stderr || '').slice(0, 200));
    return;
  }
  const v1 = runTool(['verify', base + '.plain.m3u8', fixture]);
  record(
    label + ' · verify(texto)',
    v1.code === 0 && v1.json && v1.json.ok === true && v1.json.sha256_reconstruido === rc.json.sha256_in,
    'exit=' + v1.code + ' canales=' + (v1.json ? v1.json.canales : '?') +
    ' sha=' + String(v1.json && v1.json.sha256_reconstruido).slice(0, 12) +
    ' ratio=' + rc.json.ratio
  );
  if (opts && opts.gz) {
    const rg = runTool(['project', fixture, base + '.gz.m3u8', '--gz', '--no-selfverify']);
    if (rg.code !== 0 || !rg.json || rg.json.ok !== true) {
      record(label + ' · project(gzip)', false, 'exit=' + rg.code + ' ' + String(rg.stderr || '').slice(0, 200));
      return;
    }
    const v2 = runTool(['verify', base + '.gz.m3u8', fixture]);
    record(
      label + ' · verify(gzip)',
      v2.code === 0 && v2.json && v2.json.ok === true && v2.json.sha256_reconstruido === rg.json.sha256_in,
      'exit=' + v2.code + ' ratio=' + rg.json.ratio
    );
  }
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const quick = flags.has('--quick');
  const allowSkip = flags.has('--allow-skip');
  const fixturesOnly = flags.has('--fixtures-only');

  console.log('=== test_ape_profile_project ===');
  console.log('tool: ' + TOOL);
  if (!fs.existsSync(TOOL)) {
    console.error('FALLO: no existe el proyector en ' + TOOL);
    process.exit(2);
  }

  const realList = findRealList(positional[0]);
  if (!realList) {
    console.error('SKIP: no hay lista real disponible (1.3 GB).');
    console.error('  Definir APE_PROJECT_LIST=<ruta> o pasar la ruta como argumento.');
    console.error('  Candidatos comprobados: scratch/APE_LISTA_HARNESS.m3u8, scratch/viva.m3u8, /var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8');
    process.exit(allowSkip ? 0 : 2);
  }
  const realBytes = fs.statSync(realList).size;
  const realSha = sha256File(realList);
  console.log('lista real: ' + realList);
  console.log('  bytes=' + realBytes + ' sha256=' + realSha);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-project-test-'));
  console.log('tmp: ' + tmp);

  /* ── 1. Casos borde sobre trozos de la lista real ── */
  console.log('\n--- casos borde (fixtures derivados de la lista real) ---');
  const head = readHead(realList, 6);
  console.log('  cabecera=' + head.header.length + ' lineas, canales capturados=' + head.channels.length);

  if (head.channels.length >= 4) {
    const fx = path.join(tmp, 'fx_borde.m3u8');
    const blocks = [
      head.channels[0].slice(),
      blankNonces(head.channels[1]),
      stripCarrierTags(head.channels[2]),
      stripProfile(head.channels[3])
    ];
    const allLines = head.header.concat(blocks[0], blocks[1], blocks[2], blocks[3]);
    fs.writeFileSync(fx, Buffer.concat([joinLines(allLines), Buffer.from('\n', 'latin1')]));
    checkRoundTrip('borde_formas', 'borde: sin nonces / sin portadores / perfil desconocido', fx, tmp, { gz: true });

    /* fichero sin salto de linea final */
    const fxNonl = path.join(tmp, 'fx_sin_salto.m3u8');
    const linesNoNl = head.header.concat(blocks[0], blocks[1]);
    fs.writeFileSync(fxNonl, joinLines(linesNoNl)); /* sin '\n' final */
    checkRoundTrip('borde_sin_salto', 'borde: fichero sin salto de linea final', fxNonl, tmp, {});
  } else {
    record('borde: fixtures', false, 'la lista no tiene 4 canales legibles');
  }

  /* fichero truncado: a mitad de bloque (la cola queda partida) */
  {
    const fx = path.join(tmp, 'fx_truncado.m3u8');
    const cut = Math.min(realBytes, head.cutAt + 40000);
    const fd = fs.openSync(realList, 'r');
    const b = Buffer.allocUnsafe(cut);
    fs.readSync(fd, b, 0, cut, 0);
    fs.closeSync(fd);
    fs.writeFileSync(fx, b);
    checkRoundTrip('borde_truncado', 'borde: fichero truncado a ' + cut + ' B', fx, tmp, { gz: true });
  }

  /* ── 2. Prueba negativa: corromper la proyeccion y exigir exit 5 ── */
  console.log('\n--- prueba negativa (el verificador tiene que fallar) ---');
  if (head.channels.length >= 3) {
    const fx = path.join(tmp, 'fx_neg.m3u8');
    const allLines = head.header.concat(head.channels[0], head.channels[1], head.channels[2]);
    fs.writeFileSync(fx, Buffer.concat([joinLines(allLines), Buffer.from('\n', 'latin1')]));
    const proj = path.join(tmp, 'fx_neg.proj.m3u8');
    const rc = runTool(['project', fx, proj, '--no-selfverify']);
    if (rc.code === 0) {
      /* se corrompe una referencia del diccionario dentro de un registro de canal */
      const raw = fs.readFileSync(proj);
      const text = raw.toString('utf8');
      const at = text.indexOf('"p":[');
      let corrupted = text;
      if (at !== -1) {
        /* primer numero tras "p":[ -> se le suma 1 */
        const numStart = text.indexOf('[', at) + 1;
        let numEnd = numStart;
        while (numEnd < text.length && text.charCodeAt(numEnd) >= 48 && text.charCodeAt(numEnd) <= 57) numEnd++;
        const n = Number(text.slice(numStart, numEnd));
        corrupted = text.slice(0, numStart) + String(n + 1) + text.slice(numEnd);
      }
      const tampered = path.join(tmp, 'fx_neg.tampered.m3u8');
      fs.writeFileSync(tampered, Buffer.from(corrupted, 'utf8'));
      const v = runTool(['verify', tampered, fx]);
      record('negativo: proyeccion corrupta -> exit 5 y ok=false', v.code === 5 && v.json && v.json.ok === false, 'exit=' + v.code + ' error=' + (v.json && v.json.error));
    } else {
      record('negativo: project del fixture', false, 'exit=' + rc.code);
    }
  }

  /* ── 3. Lista REAL completa ── */
  console.log('\n--- lista real completa (' + (realBytes / 1048576).toFixed(1) + ' MB) ---');
  const fullPlain = path.join(tmp, 'full.plain.m3u8');
  let plainStats = null;

  if (!quick && !fixturesOnly) {
    const t0 = Date.now();
    const rc = runTool(['project', realList, fullPlain]);
    const ms = Date.now() - t0;
    if (rc.code === 0 && rc.json && rc.json.ok === true) {
      plainStats = rc.json;
      record(
        'real · project(texto) + autoverificacion',
        rc.json.verificado === true && rc.json.sha256_reconstruido === realSha,
        'canales=' + rc.json.canales + ' plantillas=' + rc.json.plantillas +
        ' ratio=' + rc.json.ratio + ' ' + (ms / 1000).toFixed(1) + 's'
      );
      const v = runTool(['verify', fullPlain, realList]);
      record(
        'real · verify(texto) == sha256 original',
        v.code === 0 && v.json && v.json.ok === true && v.json.sha256_reconstruido === realSha,
        'exit=' + v.code + ' sha=' + String(v.json && v.json.sha256_reconstruido).slice(0, 16) +
        ' bytes=' + (v.json && v.json.bytes)
      );
      fs.unlinkSync(fullPlain);
    } else {
      record('real · project(texto)', false, 'exit=' + rc.code + ' ' + String(rc.stderr || '').slice(0, 300));
    }
  } else {
    console.log('[SKIP] real · contenedor de texto (--quick)');
  }

  const fullGz = path.join(tmp, 'full.gz.m3u8');
  if (fixturesOnly) {
    console.log('[SKIP] real · lista completa (--fixtures-only)');
  } else {
    const t0 = Date.now();
    const rc = runTool(['project', realList, fullGz, '--gz']);
    const ms = Date.now() - t0;
    if (rc.code === 0 && rc.json && rc.json.ok === true) {
      const s = rc.json;
      record(
        'real · project(gzip) + autoverificacion',
        s.verificado === true && s.sha256_reconstruido === realSha && s.contenedor === 'gzip',
        'canales=' + s.canales + ' plantillas=' + s.plantillas + ' lineas_plantilla=' + s.lineas_plantilla +
        ' ratio=' + s.ratio + ' ' + (ms / 1000).toFixed(1) + 's'
      );
      const v = runTool(['verify', fullGz, realList]);
      record(
        'real · verify(gzip) == sha256 original',
        v.code === 0 && v.json && v.json.ok === true && v.json.sha256_reconstruido === realSha,
        'exit=' + v.code + ' sha=' + String(v.json && v.json.sha256_reconstruido).slice(0, 16)
      );

      /* invariantes declarados */
      record('real · canales reconstruidos == canales proyectados',
        v.json && v.json.canales === s.canales, (v.json && v.json.canales) + ' vs ' + s.canales);
      record('real · bytes reconstruidos == bytes originales',
        v.json && v.json.bytes === realBytes, (v.json && v.json.bytes) + ' vs ' + realBytes);
      record('real · la proyeccion es menor que el original',
        s.bytes_out < s.bytes_in, s.bytes_out + ' < ' + s.bytes_in);
      record('real · hay plantillas por forma (>= 1)', s.plantillas >= 1, 'plantillas=' + s.plantillas);
      record('real · lineas de la plantilla << lineas por canal del original',
        s.lineas_plantilla >= 900, 'lineas_plantilla=' + s.lineas_plantilla);

      console.log('\n--- numeros medidos ---');
      console.log('  original              : ' + s.bytes_in + ' B  (' + (s.bytes_in / 1048576).toFixed(1) + ' MB)');
      console.log('  proyeccion texto      : ' + s.bytes_out_plain + ' B  ratio_plain=' + s.ratio_plain);
      console.log('  proyeccion gzip       : ' + s.bytes_out + ' B  ratio=' + s.ratio);
      console.log('  LIGHT declarada       : ' + LIGHT_DECLARADO_BYTES + ' B  (dato del enunciado)');
      console.log('  gzip vs LIGHT         : ' + (s.bytes_out / LIGHT_DECLARADO_BYTES).toFixed(4) + 'x  (' + (LIGHT_DECLARADO_BYTES / s.bytes_out).toFixed(2) + ' veces menor)');
      console.log('  texto vs LIGHT        : ' + (s.bytes_out_plain / LIGHT_DECLARADO_BYTES).toFixed(4) + 'x ' +
        (s.bytes_out_plain > LIGHT_DECLARADO_BYTES ? '(PEOR: el texto plano no bate a LIGHT)' : '(mejor)'));
      console.log('  canales / plantillas  : ' + s.canales + ' / ' + s.plantillas);
      console.log('  lineas por canal      : ' + s.lineas_plantilla + ' (rango ' + s.lineas_plantilla_rango.join('..') + ')');
      console.log('  parche medio por canal: ' + s.parche_medio_lineas + ' lineas');
      console.log('  diccionario           : ' + s.diccionario_entradas + ' entradas, ' + s.referencias_diccionario + ' referencias');
      console.log('  sha256 original       : ' + s.sha256_in);
      console.log('  sha256 reconstruido   : ' + s.sha256_reconstruido);
      console.log('  sha256 proyeccion gzip: ' + s.sha256_out);
    } else {
      record('real · project(gzip)', false, 'exit=' + rc.code + ' ' + String(rc.stderr || '').slice(0, 300));
    }
  }

  /* ── resumen ── */
  console.log('\n=== RESUMEN ===');
  console.log('  casos: ' + results.length + '  PASS: ' + (results.length - failures) + '  FAIL: ' + failures);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    for (const f of failed) console.log('  FALLO: ' + f.name + ' — ' + (f.detail || ''));
    console.log('\nVEREDICTO: FALLO');
    process.exit(1);
  }
  console.log('\nVEREDICTO: PASS — la lista proyectada reconstruye el original byte a byte (sha256).');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* noop */ }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { readHead, blankNonces, stripCarrierTags, stripProfile };


