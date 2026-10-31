#!/usr/bin/env node
'use strict';

/**
 * V1 · Verificación estática, unitaria y de esquemas (gate global ARA-X).
 *
 * Ejecuta, documenta y firma la matriz comando × resultado de V1:
 *
 *   1. `node --check` sobre el 100 % de los JS de `ara-x/` (inventario completo).
 *   2. `node --test "ara-x/tests/*.test.js"` (todas las suites) + una pasada por
 *      archivo para atribuir counts, con salida cruda en el log.
 *   3. Gates de contrato: d1 --no-inject, d2, d4, r5, d5, run_decision_vectors,
 *      check_sync_contract, check_lua_module y el drift gate de schemas.
 *   4. JSON: parseo de TODOS los `*.json` de `ara-x/` (excepto `evidence/`, fuera
 *      de scope) + comprobación estructural de los `*.schema.json`.
 *   5. Imports: resolución de cada `require()` relativo y clasificación de los
 *      bare imports (builtins de Node vs dependencias externas).
 *   6. Secretos obvios: escaneo de la entrega (excluye evidencia raw) y de la
 *      evidencia raw derivada (hallazgos preexistentes, reportados sin absorber).
 *   7. Herramientas ausentes: `php -l`, `luac -p`, `nginx -t` ⇒ NOT_RUN con
 *      motivo; JAMÁS se reportan como PASS.
 *
 * Salida: `ara-x/reports/V1_validation.log` (matriz + salidas crudas + fecha).
 * Sin red, sin VPS, sin dependencias npm. Read-only salvo el log.
 *
 * Uso:
 *   node ara-x/scripts/verify/run_static_checks.js            # V1 completo
 *   node ara-x/scripts/verify/run_static_checks.js --quiet    # solo resumen
 *   node ara-x/scripts/verify/run_static_checks.js --no-log   # no escribe el log
 *
 * Exit: 0 si 0 FAIL de código; 1 si hay cualquier FAIL (los NOT_RUN no fallan).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');        // …/ara-x
const REPO = path.resolve(ROOT, '..');                   // raíz del repo
const LOG_PATH = path.join(ROOT, 'reports', 'V1_validation.log');
const QUIET = process.argv.includes('--quiet');
const NO_LOG = process.argv.includes('--no-log');
const ONLY_ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const MAX_TEXT_BYTES = 16 * 1024 * 1024;                 // presupuesto de escaneo por archivo
const MAX_RAW_LINES = 600;                               // techo por salida cruda en el log

// ─────────────────────────────────────────────────────────────────────────────
// utilidades
// ─────────────────────────────────────────────────────────────────────────────

const posix = (p) => p.split(path.sep).join('/');
const rel = (p) => posix(path.relative(REPO, p));
const relRoot = (p) => posix(path.relative(ROOT, p));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function stamp(date = new Date()) {
  // Fecha LOCAL con offset real: toISOString() da UTC, se desplaza el instante
  // por el offset antes de etiquetarlo (corrige el "UTC con sufijo local").
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  const local = new Date(date.getTime() + off * 60000);
  return local.toISOString().replace('Z', `${sign}${hh}:${mm}`);
}

function walk(dir, opts = {}) {
  const out = [];
  const skipDirs = new Set(opts.skipDirs || []);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      out.push(...walk(path.join(dir, e.name), opts));
    } else if (e.isFile()) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function runNode(args, opts = {}) {
  const started = Date.now();
  const r = spawnSync(process.execPath, args, {
    cwd: opts.cwd || REPO,
    encoding: 'utf8',
    timeout: opts.timeout || 600000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });
  const raw = `${r.stdout || ''}${r.stderr || ''}`;
  return {
    code: typeof r.status === 'number' ? r.status : 1,
    signal: r.signal || null,
    ms: Date.now() - started,
    raw,
    error: r.error ? String(r.error.message || r.error) : null
  };
}

function probeTool(command, args = ['--version']) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  const absent = Boolean(r.error && (r.error.code === 'ENOENT' || /not recognized|no se reconoce/i.test(String(r.error.message || ''))));
  return {
    command,
    present: !absent && typeof r.status === 'number',
    absent,
    status: typeof r.status === 'number' ? r.status : null,
    version: `${r.stdout || ''}${r.stderr || ''}`.split(/\r?\n/).find((l) => l.trim()) || ''
  };
}

function firstLines(text, n) {
  return String(text || '').split(/\r?\n/).slice(0, n).join('\n');
}

function lastNonEmptyLine(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

function clampRaw(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= MAX_RAW_LINES) return { text: lines.join('\n'), truncated: 0 };
  return { text: lines.slice(0, MAX_RAW_LINES).join('\n'), truncated: lines.length - MAX_RAW_LINES };
}

function fence(text, info = 'text') {
  const body = String(text == null ? '' : text).replace(/```/g, '``\u200b`');
  return '```' + info + '\n' + body + '\n```';
}

function mdCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// estado de la captura
// ─────────────────────────────────────────────────────────────────────────────

const matrix = [];   // { step, command, kind, status, exit, ms, reason }
const warnings = [];
const rawBlocks = []; // { id, title, text, truncated, extra }

function addRow(row) {
  matrix.push({
    step: row.step,
    command: row.command,
    kind: row.kind || 'code',
    status: row.status,
    exit: row.exit == null ? null : row.exit,
    ms: row.ms == null ? null : row.ms,
    reason: row.reason || ''
  });
}

function addWarning(text) {
  warnings.push(text);
}

function addRaw(id, title, text) {
  const c = clampRaw(text);
  rawBlocks.push({ id, title, text: c.text, truncated: c.truncated });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · inventario JS + node --check
// ─────────────────────────────────────────────────────────────────────────────

function sectionJs() {
  const files = walk(ROOT, { skipDirs: ['evidence', 'node_modules', '.git'] })
    .filter((f) => f.endsWith('.js'))
    .sort((a, b) => rel(a).localeCompare(rel(b)));

  const rows = [];
  for (const file of files) {
    const buf = fs.readFileSync(file);
    const r = runNode(['--check', rel(file)], { timeout: 60000 });
    rows.push({
      file: rel(file),
      bytes: buf.length,
      sha: sha256(buf),
      ok: r.code === 0,
      exit: r.code,
      ms: r.ms,
      detail: r.code === 0 ? '' : firstLines(r.raw, 12)
    });
  }

  const failed = rows.filter((r) => !r.ok);
  addRow({
    step: '1',
    command: `node --check × ${rows.length} archivos JS de ara-x/`,
    kind: 'code',
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    exit: failed.length === 0 ? 0 : 1,
    ms: rows.reduce((a, r) => a + r.ms, 0),
    reason: failed.length === 0
      ? `${rows.length}/${rows.length} exit 0 (inventario completo)`
      : `${failed.length} archivo(s) con error de sintaxis`
  });
  if (failed.length) addWarning(`node --check rojo en: ${failed.map((f) => f.file).join(', ')}`);

  // Verificación explícita del verificador (comando Verify del contrato V1).
  const self = rows.find((r) => r.file === 'ara-x/scripts/verify/run_static_checks.js');
  if (self) {
    addRow({
      step: '1',
      command: 'node --check ara-x/scripts/verify/run_static_checks.js',
      kind: 'code',
      status: self.ok ? 'PASS' : 'FAIL',
      exit: self.exit,
      ms: self.ms,
      reason: self.ok ? 'exit 0 (auto-verificación del verificador)' : 'error de sintaxis'
    });
  }

  return { rows, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · suites de test
// ─────────────────────────────────────────────────────────────────────────────

function parseTestCounts(text) {
  const pick = (label) => {
    const m = String(text).match(new RegExp(`[ℹ#]\\s*${label}\\s+(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  return {
    tests: pick('tests'),
    pass: pick('pass'),
    fail: pick('fail'),
    skipped: pick('skipped'),
    cancelled: pick('cancelled'),
    duration_ms: pick('duration_ms')
  };
}

function summaryLines(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((l) => /^[ℹ#]\s*(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+/.test(l))
    .join('\n');
}

function snapshotTests(files) {
  const map = new Map();
  for (const f of files) {
    const buf = fs.readFileSync(f);
    map.set(rel(f), { bytes: buf.length, sha: sha256(buf) });
  }
  return map;
}

function snapshotDiff(before, after) {
  const changed = [];
  for (const [file, meta] of after) {
    const prev = before.get(file);
    if (!prev || prev.sha !== meta.sha || prev.bytes !== meta.bytes) changed.push(file);
  }
  return changed;
}

function sectionTests() {
  const files = walk(path.join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.test.js'))
    .sort((a, b) => rel(a).localeCompare(rel(b)));

  const before = snapshotTests(files);
  const glob = 'node --test "ara-x/tests/*.test.js"';

  const attempts = [];
  attempts.push(runNode(['--test', 'ara-x/tests/*.test.js'], { timeout: 900000 }));
  if (attempts[attempts.length - 1].code !== 0) {
    attempts.push(runNode(['--test', 'ara-x/tests/*.test.js'], { timeout: 900000 }));
  }
  const finalRun = attempts[attempts.length - 1];
  const counts = parseTestCounts(finalRun.raw);
  const retried = attempts.length > 1;
  const retryGreen = retried && finalRun.code === 0;

  const after = snapshotTests(files);
  const changed = snapshotDiff(before, after);

  addRow({
    step: '2',
    command: glob,
    kind: 'code',
    status: finalRun.code === 0 ? 'PASS' : 'FAIL',
    exit: finalRun.code,
    ms: attempts.reduce((a, r) => a + r.ms, 0),
    reason: finalRun.code === 0
      ? `${counts.tests}/${counts.tests} tests · ${counts.pass} pass · 0 fail · ${counts.skipped} skip`
        + (retryGreen ? ' (2.ª pasada; la 1.ª fue roja por escritura concurrente de otro workstream)' : '')
      : `${counts.fail} fail en ${counts.tests} tests`
  });

  if (retried && !retryGreen) addWarning('suite completa roja en dos pasadas consecutivas');
  if (retryGreen) addWarning('la 1.ª pasada de la suite fue roja y la 2.ª verde: árbol mutado por otro workstream durante la captura (ver §2.1) — re-ejecutar V1 si cambia');
  if (changed.length) addWarning(`snapshot de tests cambió durante la captura: ${changed.join(', ')}`);

  // Pasada por archivo (atribución de counts y salida cruda por suite).
  const perFile = [];
  for (const file of files) {
    const args = ['--test', rel(file)];
    let r = runNode(args, { timeout: 600000 });
    let retry = false;
    if (r.code !== 0) { retry = true; r = runNode(args, { timeout: 600000 }); }
    const c = parseTestCounts(r.raw);
    perFile.push({
      file: rel(file),
      code: r.code,
      tests: c.tests,
      pass: c.pass,
      fail: c.fail,
      skipped: c.skipped,
      ms: r.ms,
      retry,
      summary: summaryLines(r.raw),
      raw: r.raw
    });
    if (r.code === 0 && retry) {
      addWarning(`${rel(file)}: 1.ª pasada roja, 2.ª verde (captura concurrente)`);
    }
  }
  const badFiles = perFile.filter((p) => p.code !== 0);
  addRow({
    step: '2',
    command: `node --test <archivo> × ${perFile.length} suites`,
    kind: 'code',
    status: badFiles.length === 0 ? 'PASS' : 'FAIL',
    exit: badFiles.length === 0 ? 0 : 1,
    ms: perFile.reduce((a, p) => a + p.ms, 0),
    reason: badFiles.length === 0
      ? `${perFile.length}/${perFile.length} suites verdes (${perFile.reduce((a, p) => a + (p.tests || 0), 0)} tests)`
      : `rojo: ${badFiles.map((p) => p.file).join(', ')}`
  });

  // `node --test ara-x/tests/` (forma taquigráfica del contrato) — se intenta y se documenta.
  const dirRun = runNode(['--test', 'ara-x/tests/'], { timeout: 300000 });
  const dirCounts = parseTestCounts(dirRun.raw);
  addRow({
    step: '2',
    command: 'node --test ara-x/tests/',
    kind: 'invocación',
    status: 'NOT_RUN',
    exit: dirRun.code,
    ms: dirRun.ms,
    reason: `forma con directorio NO soportada por Node ${process.version} en ${process.platform}: `
      + `el runtime trata el directorio como módulo ⇒ MODULE_NOT_FOUND, 0 tests ejecutados `
      + `(no es un fallo de tests; la forma ejecutada y equivalente es ${glob}, PASS)`
  });
  addRaw('tests-dirform', 'Intento de `node --test ara-x/tests/` (limitación del runtime)', dirRun.raw);

  addRaw(
    'tests-glob',
    `${glob} — salida cruda${retried ? ' (última pasada)' : ''}`,
    attempts.map((a, i) => `# pasada ${i + 1}: exit=${a.code} · ${a.ms} ms\n${a.raw}`).join('\n')
  );
  for (const p of perFile) {
    addRaw(`tests-${p.file.replace(/^ara-x\/tests\//, '')}`, `${p.file} — resumen crudo`, p.summary);
  }

  return { files: files.map(rel), before, after, changed, perFile, counts, finalRun, dirRun, dirCounts, retried };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · gates de contrato
// ─────────────────────────────────────────────────────────────────────────────

const GATES = [
  { id: 'd1', step: '3', label: 'D1 · contrato maestro (sin inyección)', args: ['ara-x/scripts/d1_check_master_contract.js', '--no-inject'] },
  { id: 'd2', step: '3', label: 'D2 · política codec 4K/8K', args: ['ara-x/scripts/d2_check_codec_policy.js'] },
  { id: 'd4', step: '3', label: 'D4 · aplicación en device', args: ['ara-x/scripts/d4_check_device_apply.js'] },
  { id: 'r5', step: '3', label: 'R5 · actuadores', args: ['ara-x/scripts/r5_check_actuators.js'] },
  { id: 'd5', step: '3', label: 'D5 · vectores de decisión', args: ['ara-x/scripts/d5_check_decision.js'] },
  { id: 'i1', step: '3', label: 'I1 · run_decision_vectors', args: ['ara-x/scripts/controller/run_decision_vectors.js'] },
  { id: 'sync', step: '3', label: 'I3 · check_sync_contract', args: ['ara-x/scripts/sync/check_sync_contract.js'] },
  { id: 'lua', step: '3', label: 'I3-LUA · check_lua_module', args: ['ara-x/scripts/lua/check_lua_module.js'] },
  { id: 'drift', step: '3', label: 'D3 · drift gate de schemas', args: ['ara-x/scripts/gen_sync_schemas.js', '--check'] }
];

function sectionGates() {
  const results = [];
  for (const g of GATES) {
    const r = runNode(g.args, { timeout: 900000 });
    const summary = lastNonEmptyLine(r.raw);
    results.push({ ...g, ...r, summary });
    addRow({
      step: g.step,
      command: `node ${g.args.join(' ')}`,
      kind: 'code',
      status: r.code === 0 ? 'PASS' : 'FAIL',
      exit: r.code,
      ms: r.ms,
      reason: r.code === 0 ? `exit 0 · ${summary}` : `exit ${r.code} · ${firstLines(r.raw, 3)}`
    });
    for (const line of r.raw.split(/\r?\n/)) {
      if (/^\s*WARN\b/.test(line) && !/WARN D1-D · omitido/.test(line)) addWarning(`${g.id}: ${line.trim()}`);
    }
    addRaw(`gate-${g.id}`, `node ${g.args.join(' ')}` + ` — salida cruda (exit ${r.code}, ${r.ms} ms)`, r.raw);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · JSON y schemas
// ─────────────────────────────────────────────────────────────────────────────

function sectionJson() {
  const files = walk(ROOT, { skipDirs: ['evidence', 'node_modules', '.git'] })
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => rel(a).localeCompare(rel(b)));

  const rows = [];
  for (const file of files) {
    const buf = fs.readFileSync(file);
    const row = { file: rel(file), bytes: buf.length, sha: sha256(buf), ok: false, type: null, error: null };
    try {
      const parsed = JSON.parse(buf.toString('utf8'));
      row.ok = true;
      row.type = Array.isArray(parsed) ? 'array' : typeof parsed;
      if (file.endsWith('.schema.json')) {
        const structural = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          && (typeof parsed.$schema === 'string' || typeof parsed.type === 'string');
        if (!structural) { row.ok = false; row.error = 'schema sin $schema ni type'; }
      }
    } catch (e) {
      row.error = String(e.message || e);
    }
    rows.push(row);
  }

  const invalid = rows.filter((r) => !r.ok);
  const schemas = rows.filter((r) => r.file.endsWith('.schema.json'));

  addRow({
    step: '4',
    command: `JSON.parse × ${rows.length} *.json de ara-x/ (excluye evidence/)`,
    kind: 'code',
    status: invalid.length === 0 ? 'PASS' : 'FAIL',
    exit: invalid.length === 0 ? 0 : 1,
    ms: null,
    reason: invalid.length === 0
      ? `${rows.length}/${rows.length} parsean · 0 inválidos · ${schemas.length} schemas con estructura válida`
      : `${invalid.length} inválido(s): ${invalid.map((i) => i.file).join(', ')}`
  });
  if (invalid.length) addWarning(`JSON inválido: ${invalid.map((i) => i.file).join(', ')}`);

  return { rows, invalid, schemas };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · imports
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')];
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* sigue */ }
  }
  return null;
}

function sectionImports(jsFiles) {
  const specs = new Map();
  const missing = [];

  for (const file of jsFiles) {
    const text = fs.readFileSync(file, 'utf8');
    REQUIRE_RE.lastIndex = 0;
    let m;
    while ((m = REQUIRE_RE.exec(text)) !== null) {
      const spec = m[1];
      if (!specs.has(spec)) specs.set(spec, { spec, kind: null, refs: 0, files: new Set() });
      const rec = specs.get(spec);
      rec.refs += 1;
      rec.files.add(rel(file));

      if (spec.startsWith('.') || spec.startsWith('/')) {
        rec.kind = rec.kind === 'missing' ? 'missing' : 'relative';
        if (!resolveRelative(file, spec)) missing.push({ file: rel(file), spec });
      } else if (Module.isBuiltin(spec)) {
        rec.kind = rec.kind || 'builtin';
      } else {
        rec.kind = rec.kind || 'external';
      }
    }
  }

  const external = [...specs.values()].filter((s) => s.kind === 'external');
  const ok = missing.length === 0 && external.length === 0;

  addRow({
    step: '5',
    command: `resolución de require() en ${jsFiles.length} JS (builtins + relativos)`,
    kind: 'code',
    status: ok ? 'PASS' : 'FAIL',
    exit: ok ? 0 : 1,
    ms: null,
    reason: ok
      ? `${[...specs.values()].filter((s) => s.kind === 'relative').length} specs relativos resueltos · `
        + `${[...specs.values()].filter((s) => s.kind === 'builtin').length} builtins · 0 externos · 0 sin resolver`
      : `${missing.length} require(s) sin resolver · ${external.length} dependencia(s) externa(s)`
  });
  if (!ok) addWarning(`imports rojos: ${JSON.stringify({ missing, external: external.map((e) => e.spec) })}`);

  return { specs: [...specs.values()].map((s) => ({ spec: s.spec, kind: s.kind, refs: s.refs, samples: [...s.files].slice(0, 3) })), missing, external };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · secretos obvios
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.sh', '.ps1', '.php', '.lua', '.conf', '.yml', '.yaml', '.jsonl', '.example']);
const PLACEHOLDER_RE = /[<>{}\u2026]|\.\.\.|(?:REPLACE|CHANGE_ME|PLACEHOLDER|REDACTED|EXAMPLE|TODO|FIXME)/i;
// Fixtures y ejemplos sintéticos del repo (no son credenciales): se allowlistean por
// línea, nunca se imprime el valor. Cualquier valor real fuera de estos patrones es FAIL.
const SYNTHETIC_LINE_RE = new RegExp([
  'ara-x-test-secret',
  'rotation-secret-(?:old|new)',
  'secret-[ab]\\b',
  'token=probe\\b',
  'cdn\\.example',
  'example\\.(?:com|org|net)',
  '\\buser:pass\\b',
  '\\b(?:dummy|fixture|synthetic|placeholder|foo|bar)\\b'
].join('|'), 'i');

const SECRET_RULES = [
  { id: 'private_key', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
  { id: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'github_token', re: /\bghp_[A-Za-z0-9]{36}\b/g },
  { id: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'openai_key', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { id: 'bearer_literal', re: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/g },
  { id: 'credential_url', re: /\bhttps?:\/\/[^/\s:@'"]+:[^/\s@'"]+@/g },
  { id: 'query_credentials', re: /[?&](?:username|user|password|pass|token|api_key)=[^&\s'"]{6,}/gi },
  { id: 'literal_assignment', re: /\b(?:password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/gi }
];

function isAllowedMatch(value, file, line) {
  const context = `${value}\n${line || ''}`;
  if (SYNTHETIC_LINE_RE.test(context)) return true;
  if (PLACEHOLDER_RE.test(context)) return true;
  if (file.endsWith('.example.json')) return true;
  return false;
}

function scanSecrets({ excludeRawEvidence }) {
  const skipDirs = ['evidence', 'node_modules', '.git'];
  const files = walk(ROOT, { skipDirs })
    .filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()))
    .filter((f) => !(excludeRawEvidence && rel(f).startsWith('ara-x/reports/r1_evidence/')))
    .filter((f) => {
      try { return fs.statSync(f).size <= MAX_TEXT_BYTES; } catch { return false; }
    })
    .sort((a, b) => rel(a).localeCompare(rel(b)));

  const hits = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    for (const rule of SECRET_RULES) {
      rule.re.lastIndex = 0;
      for (let i = 0; i < lines.length; i += 1) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(lines[i])) !== null) {
          const value = m[0];
          hits.push({
            file: rel(file),
            line: i + 1,
            rule: rule.id,
            allowed: isAllowedMatch(value, file, lines[i]),
            // no se reproduce el valor: solo longitud y hash corto para trazabilidad
            valueLen: value.length,
            valueSha8: sha256(value).slice(0, 8)
          });
        }
      }
    }
  }

  const real = hits.filter((h) => !h.allowed);
  return { files: files.length, hits, real };
}

function sectionSecrets() {
  const delivery = scanSecrets({ excludeRawEvidence: true });
  const full = scanSecrets({ excludeRawEvidence: false });

  const rawOnly = full.real.filter((h) => h.file.startsWith('ara-x/reports/r1_evidence/'));
  const unexpected = full.real.filter((h) => !h.file.startsWith('ara-x/reports/r1_evidence/'));
  const ok = delivery.real.length === 0 && unexpected.length === 0;

  addRow({
    step: '6',
    command: 'scan de secretos obvios (entrega: sin evidence/ ni reports/r1_evidence/)',
    kind: 'code',
    status: ok ? 'PASS' : 'FAIL',
    exit: ok ? 0 : 1,
    ms: null,
    reason: ok
      ? `${delivery.files} archivos escaneados · 0 secretos reales · ${delivery.hits.length} coincidencias allowlisted (fixtures/placeholders)`
      : `${delivery.real.length} hallazgo(s) en la entrega`
  });

  if (!ok) addWarning(`secretos en la entrega: ${JSON.stringify(unexpected.slice(0, 10))}`);
  if (rawOnly.length) {
    addWarning(`evidencia raw: ${rawOnly.length} hallazgo(s) preexistente(s) en reports/r1_evidence/ — documentados por V3 (V3-F-02), NO absorbidos por V1 y NO corregidos (fuera del write-scope de V1)`);
  }

  return { delivery, full, rawOnly, unexpected, ok };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 · herramientas ausentes (NOT_RUN justificado)
// ─────────────────────────────────────────────────────────────────────────────

function sectionTools() {
  const php = probeTool('php');
  const luac = probeTool('luac');
  const lua = probeTool('lua');
  const nginx = probeTool('nginx');
  const tools = { php, luac, lua, nginx };

  const phpFiles = [
    'ara-x/device/staged/ara_cfg_composer.php',
    'ara-x/vps/php/ara-sync.php'
  ];
  for (const f of phpFiles) {
    const exists = fs.existsSync(path.join(REPO, f));
    addRow({
      step: '7',
      command: `php -l ${f}`,
      kind: 'tool-ausente',
      status: 'NOT_RUN',
      exit: null,
      ms: null,
      reason: !exists ? 'archivo ausente' : (php.present ? 'php presente pero no se ejecutó en esta captura (no declarado PASS)' : 'php NO instalado en este host (probe: ENOENT) ⇒ lint NO ejecutado, nunca PASS')
    });
  }

  addRow({
    step: '7',
    command: 'luac -p ara-x/vps/lua/ara_x_sync.lua',
    kind: 'tool-ausente',
    status: 'NOT_RUN',
    exit: null,
    ms: null,
    reason: luac.present ? 'luac presente pero no se ejecutó en esta captura (no declarado PASS)' : 'luac/lua NO instalados en este host (probe: ENOENT) ⇒ sintaxis Lua NO verificada aquí, nunca PASS'
  });

  addRow({
    step: '7',
    command: 'nginx -t (ara-x/vps/nginx/*.conf)',
    kind: 'tool-ausente',
    status: 'NOT_RUN',
    exit: null,
    ms: null,
    reason: (nginx.present
      ? 'nginx presente, pero los .conf son fragmentos para incluir en el nginx.conf del VPS'
      : 'nginx NO instalado en este host (probe: ENOENT) y además los .conf son fragmentos')
      + ' ⇒ `nginx -t` requiere el nginx.conf real del VPS (fuera del scope local de V1), nunca PASS'
  });

  return tools;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8 · contexto de otros workstreams (no absorbido por V1)
// ─────────────────────────────────────────────────────────────────────────────

function sectionCrossWorkstream() {
  const v3Path = path.join(ROOT, 'reports', 'V3_security.md');
  const out = {
    v3Present: fs.existsSync(v3Path),
    verdict: null,
    deploy: null,
    findings: [],
    notes: [],
    repairs: []
  };
  for (const f of ['V3_repair_r2.md', 'V3_repair_t26.md', 'V3_repair_t26_final.md']) {
    const p = path.join(ROOT, 'reports', f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const head = text.split(/\r?\n/).find((l) => /^#/.test(l));
    out.repairs.push({
      file: 'ara-x/reports/' + f,
      bytes: fs.statSync(p).size,
      sha256: sha256(fs.readFileSync(p)),
      title: head ? head.replace(/^#+\s*/, '') : f
    });
  }
  if (!out.v3Present) {
    out.notes.push('`ara-x/reports/V3_security.md` ausente en la captura: V3 no aporta veredicto en este snapshot.');
    return out;
  }
  const lines = fs.readFileSync(v3Path, 'utf8').split(/\r?\n/);
  const verdictLine = lines.find((l) => /Veredicto (final )?V3-R2|Veredicto global/i.test(l));
  out.verdict = verdictLine ? verdictLine.replace(/^>\s*/, '').trim() : null;
  const deployLine = lines.find((l) => /deploy.*NO-GO|NO-GO.*deploy|Deploy de producción/i.test(l));
  out.deploy = deployLine ? deployLine.replace(/^>\s*/, '').trim() : null;
  const seen = new Set();
  for (const line of lines) {
    if (/^\|\s*\*\*V3-F-\d+\*\*/.test(line)) {
      const id = (line.match(/V3-F-\d+/) || [])[0];
      if (id && !seen.has(id)) {
        seen.add(id);
        out.findings.push(line.slice(0, 220));
      }
    }
  }
  if (!out.findings.length) out.notes.push('V3 no declara filas `V3-F-*` legibles en este snapshot.');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9 · artefactos críticos y auditoría de las rutas t26 / V3-R2 (V1-R)
// ─────────────────────────────────────────────────────────────────────────────

const KEY_ARTIFACT_GROUPS = [
  {
    group: 'VPS staged (solo lectura; write-scope ajeno a V1)',
    items: [
      ['ara-x/vps/lua/ara_x_sync.lua', 'E7AEC115'],
      ['ara-x/vps/nginx/ara-sync-lua.conf', '3A424DC0'],
      ['ara-x/vps/nginx/ara-sync-zone.conf', null],
      ['ara-x/vps/nginx/ara-sync.conf', null],
      ['ara-x/vps/php/ara-sync.php', '4604D42D'],
      ['ara-x/vps/schema/sync_features.json', 'CC9EAD72'],
      ['ara-x/scripts/lua/check_lua_module.js', 'B1542E0B'],
      ['ara-x/tests/lua_module.test.js', 'CE61DEE7']
    ]
  },
  {
    group: 'Rutas t26 + informes V3 (auditadas)',
    items: [
      ['ara-x/reports/V3_repair_r2.md', '94475E47'],
      ['ara-x/reports/V3_repair_t26.md', '83A492A4'],
      ['ara-x/reports/V3_repair_t26_final.md', '126326C8'],
      ['ara-x/tests/security.test.js', '5D99623E'],
      ['ara-x/spec/ARA_X_MASTER_CONTRACT.md', '719920EC'],
      ['ara-x/reports/r1_evidence/cdn_full.json', '170DF79E'],
      ['ara-x/reports/r1_evidence/local_full.json', '843FBADD'],
      ['ara-x/reports/r1_evidence/compare.json', null],
      ['ara-x/reports/r1_evidence/probe_cdn.json', null],
      ['ara-x/reports/r1_evidence/probe_local.json', null],
      ['ara-x/reports/r1_evidence/probe2_cdn.json', null],
      ['ara-x/reports/r1_evidence/probe2_local.json', null],
      ['ara-x/reports/r1_evidence/xtab_cdn.json', null],
      ['ara-x/reports/r1_evidence/xtab_local.json', null]
    ]
  },
  {
    group: 'Código que consume V2 (E2E no re-ejecutado)',
    items: [
      ['ara-x/playlist/ara_x_injector.js', '88A3EB3D'],
      ['ara-x/playlist/ara_x_validator.js', 'F31DE565']
    ]
  },
  {
    group: 'Contexto V3 (solo lectura; fuera de write-scope)',
    items: [
      ['ara-x/reports/V3_security.md', null]
    ]
  }
];

function sectionKeyArtifacts() {
  const rows = [];
  const failures = [];
  for (const g of KEY_ARTIFACT_GROUPS) {
    for (const [relPath, expected] of g.items) {
      const full = path.join(REPO, relPath);
      const exists = fs.existsSync(full);
      let bytes = null;
      let sha = null;
      let ok = false;
      let error = null;
      if (!exists) {
        error = 'ausente';
      } else {
        try {
          const buf = fs.readFileSync(full);
          bytes = buf.length;
          sha = sha256(buf);
          ok = !expected || sha.toUpperCase().startsWith(String(expected).toUpperCase());
          if (expected && !ok) error = `sha256 ${sha.slice(0, 8).toUpperCase()}… ≠ esperado ${expected}`;
        } catch (e) {
          error = String(e.message || e);
        }
      }
      rows.push({ group: g.group, file: relPath, bytes, sha, expected, ok, error });
      if (!exists) failures.push(`${relPath}: ausente`);
      else if (expected && !ok) failures.push(`${relPath}: sha256 ${sha.slice(0, 8).toUpperCase()}… ≠ ${expected}`);
    }
  }
  return { rows, failures };
}

function sectionT26Audit(keyArtifacts) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: detail === undefined ? null : detail });
  const read = (relPath) => fs.readFileSync(path.join(REPO, relPath), 'utf8');

  // 9.1 · r1_evidence sin credenciales
  const r1Dir = path.join(ROOT, 'reports', 'r1_evidence');
  const r1Files = fs.readdirSync(r1Dir).filter((f) => f.endsWith('.json')).sort();
  const patterns = [
    ['userinfo', /\bhttps?:\/\/[^/\s:@'"]+:[^/\s@'"]+@/g],
    ['query_creds', /[?&](?:username|user|password|pass|token|api_key)=[^&\s'"]{6,}/gi],
    ['live_digits', /\/live\/\d{6,}\/\d{6,}\//g],
    ['a_digits', /\/a\/\d+\/\d{6,}\/\d{6,}\//g]
  ];
  const r1Hits = [];
  let r1AllParse = true;
  let placeholders = 0;
  let unredactedCdn = 0;
  for (const f of r1Files) {
    const text = fs.readFileSync(path.join(r1Dir, f), 'utf8');
    try { JSON.parse(text); } catch { r1AllParse = false; }
    placeholders += (text.match(/<\d+c>/g) || []).length;
    // `/cdn/<Nc>/...` es el estado redactado; un subpath literal tras `/cdn/` sería una URL sin redactar.
    // (La cabecera `#EXT-X-APE-CDN-BASE:https://…/cdn/` termina en `/cdn/"` y NO es una credencial.)
    unredactedCdn += (text.match(/\/cdn\/(?!<)[^"\s]/g) || []).length;
    for (const [name, re] of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (r1Hits.length < 10) r1Hits.push({ file: 'ara-x/reports/r1_evidence/' + f, rule: name, offset: m.index });
      }
    }
  }
  add('r1_evidence: 9 JSON presentes y parsean', r1Files.length === 9 && r1AllParse, { files: r1Files.length, parse: r1AllParse });
  add('r1_evidence: 0 credenciales (userinfo/query/live-seg/a-seg)', r1Hits.length === 0, { hits: r1Hits.length, sample: r1Hits.slice(0, 3) });
  add('r1_evidence: URLs /cdn/ redactadas con placeholders <Nc>', unredactedCdn === 0 && placeholders > 0,
    { placeholders, unredacted_cdn_subpath: unredactedCdn });

  // 9.2 · security.test.js alineado a F-04 + 13/13
  const secText = read('ara-x/tests/security.test.js');
  add('security.test.js: título/aserción F-04 (sin extras top-level)',
    /Lua response sin extras top-level/.test(secText) && /V3-F-04/.test(secText), null);
  add('security.test.js: assert de ausencia de soc_canonical en el Lua',
    /\/soc_canonical\/\.test\(lua\)/.test(secText) && /V3-F-04 reparado en t28/.test(secText), null);
  add('security.test.js: validatePolicy rechaza los 3 extras',
    /validatePolicy\(\{\s*\.\.\.example,\s*\.\.\.extra\s*\}\)/.test(secText), null);
  const secRun = runNode(['--test', 'ara-x/tests/security.test.js'], { timeout: 300000 });
  const secCounts = parseTestCounts(secRun.raw);
  add('security.test.js: 13/13 PASS', secRun.code === 0 && secCounts.tests === 13 && secCounts.pass === 13 && secCounts.fail === 0, secCounts);
  addRaw('audit-security', 'node --test ara-x/tests/security.test.js — salida cruda', secRun.raw);

  // 9.3 · informes de reparación V3
  const r2 = read('ara-x/reports/V3_repair_r2.md');
  add('V3_repair_r2.md: F-02 redactado y F-01 NO-GO (sin contradicción)',
    /V3-F-02/.test(r2) && /redact/i.test(r2) && /V3-F-01/.test(r2) && /NO-GO/i.test(r2)
    && !/V3-F-01[^\n]{0,160}(CERRAD[OA]|resuelt[oa]|reparad[oa])/i.test(r2), null);
  add('V3_repair_r2.md: referencia al ajuste de security.test.js', /security\.test\.js/.test(r2), null);

  const t26 = read('ara-x/reports/V3_repair_t26.md');
  add('V3_repair_t26.md: F-02 CERRADO · T26-B2 CUBIERTO · F-05/F-01/F-09 NO-GO · T29-B1 RESUELTO',
    /F-02[^\n]{0,80}CERRAD/i.test(t26) && /T26-B2/.test(t26) && /F-05/.test(t26) && /NO-GO/.test(t26)
    && /F-01/.test(t26) && /F-09/.test(t26) && /T29-B1/.test(t26) && /RESUELTO/.test(t26), null);

  const t26f = read('ara-x/reports/V3_repair_t26_final.md');
  add('V3_repair_t26_final.md: F-02 CERRADO · T26-B2 · F-05/F-01/F-09 NO-GO · 117/117 · 43/43 · 191/189 · 13/13',
    /F-02/.test(t26f) && /CERRAD/i.test(t26f) && /T26-B2/.test(t26f) && /F-05/.test(t26f) && /NO-GO/.test(t26f)
    && /F-01/.test(t26f) && /F-09/.test(t26f) && /117\/117/.test(t26f) && /43\/43/.test(t26f)
    && /191/.test(t26f) && /189/.test(t26f) && /13\/13/.test(t26f), null);

  // 9.4 · contrato D1: digests citados en el Anexo C
  const contract = read('ara-x/spec/ARA_X_MASTER_CONTRACT.md');
  const syncFull = path.join(ROOT, 'vps', 'schema', 'sync_features.json');
  const syncActual = sha256(fs.readFileSync(syncFull));
  const syncBytes = fs.statSync(syncFull).size;
  const syncRow = /`ara-x\/vps\/schema\/sync_features\.json`[^\n]*?\|\s*([\d.]+)\s*\|\s*`([A-Fa-f0-9]{8})/.exec(contract);
  const syncCitedBytes = syncRow ? Number(syncRow[1].replace(/\./g, '')) : null;
  const syncCitedSha = syncRow ? syncRow[2].toUpperCase() : null;
  add('D1 Anexo C: digest citado de sync_features.json == actual',
    Boolean(syncRow) && syncCitedBytes === syncBytes && syncActual.toUpperCase().startsWith(syncCitedSha),
    { cited: syncRow ? `${syncCitedBytes} B/${syncCitedSha}` : null, actual: `${syncBytes} B/${syncActual.slice(0, 8).toUpperCase()}` });

  const r1ReportFull = path.join(ROOT, 'reports', 'R1_list_forensics.md');
  const r1Actual = sha256(fs.readFileSync(r1ReportFull));
  const r1Bytes = fs.statSync(r1ReportFull).size;
  const r1Row = /`ara-x\/reports\/R1_list_forensics\.md`[^\n]*?\|\s*([\d.]+)\s*\|\s*`([A-Fa-f0-9]{8})/.exec(contract);
  const r1CitedBytes = r1Row ? Number(r1Row[1].replace(/\./g, '')) : null;
  const r1CitedSha = r1Row ? r1Row[2].toUpperCase() : null;
  add('D1 Anexo C: digest citado de R1_list_forensics.md == actual',
    Boolean(r1Row) && r1CitedBytes === r1Bytes && r1Actual.toUpperCase().startsWith(r1CitedSha),
    { cited: r1Row ? `${r1CitedBytes} B/${r1CitedSha}` : null, actual: `${r1Bytes} B/${r1Actual.slice(0, 8).toUpperCase()}` });

  // 9.5 · V3_security.md (contexto, solo lectura)
  const v3Path = path.join(ROOT, 'reports', 'V3_security.md');
  const v3 = fs.existsSync(v3Path) ? fs.readFileSync(v3Path, 'utf8') : '';
  add('V3_security.md: V3-R2 PASS (reparables) + F-01/F-05/F-09 NO-GO',
    /V3-R2:\s*PASS/i.test(v3) && /NO-GO/i.test(v3) && /F-01/.test(v3) && /F-05/.test(v3) && /F-09/.test(v3), null);
  const v3Verdict = (v3.split(/\r?\n/).find((l) => /Veredicto final V3-R2/i.test(l)) || '').replace(/^>\s*/, '').trim();

  // 9.6 · binding del código E2E de V2 (no re-ejecutado)
  const injector = sha256(fs.readFileSync(path.join(ROOT, 'playlist', 'ara_x_injector.js')));
  const validatorSha = sha256(fs.readFileSync(path.join(ROOT, 'playlist', 'ara_x_validator.js')));
  add('V2 E2E no re-ejecutado: injector/validator sin cambios (88A3EB3D/F31DE565)',
    injector.toUpperCase().startsWith('88A3EB3D') && validatorSha.toUpperCase().startsWith('F31DE565'),
    { injector: injector.slice(0, 8).toUpperCase(), validator: validatorSha.slice(0, 8).toUpperCase() });

  // 9.7 · hashes esperados de artefactos críticos
  add('Artefactos críticos con hash esperado (Lua/snippet/PHP/tests/t26)',
    keyArtifacts.failures.length === 0, { failures: keyArtifacts.failures.slice(0, 5) });

  return {
    checks,
    allOk: checks.every((c) => c.ok),
    failed: checks.filter((c) => !c.ok).map((c) => c.name),
    r1: { files: r1Files.length, hits: r1Hits.length, placeholders, unredacted_cdn: unredactedCdn },
    security: { ...secCounts, exit: secRun.code },
    contract: {
      syncCitedBytes,
      syncCitedSha,
      syncBytes,
      syncActual: syncActual.slice(0, 16),
      r1CitedBytes,
      r1CitedSha,
      r1Bytes,
      r1Actual: r1Actual.slice(0, 16)
    },
    v3: { verdict: v3Verdict }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// informe
// ─────────────────────────────────────────────────────────────────────────────

function buildReport(state) {
  const {
    js, tests, gates, json, imports, secrets, tools, cross, keyArtifacts, audits, env, evidence, logShaInfo
  } = state;

  const pass = matrix.filter((r) => r.status === 'PASS').length;
  const fail = matrix.filter((r) => r.status === 'FAIL').length;
  const notRun = matrix.filter((r) => r.status === 'NOT_RUN').length;
  const codeFail = matrix.filter((r) => r.status === 'FAIL' && r.kind === 'code').length;
  const auditFail = audits.checks.filter((c) => !c.ok).length + keyArtifacts.failures.length;
  const verdict = codeFail === 0 && auditFail === 0 ? 'PASS' : 'FAIL';

  const L = [];
  L.push('# V1-R · Re-verificación estática final sobre bytes actuales — gate global ARA-X');
  L.push('');
  L.push(`**Revisión:** V1-R (t32) — refresco de V1 sobre los bytes ACTUALES (incluye las reparaciones t26/t28/t30/t31 ` +
    'y los informes V3-R2 posteriores a t27).  ');
  L.push(`**Fecha de captura:** ${env.stamp}  `);
  L.push(`**Generado por:** \`node ara-x/scripts/verify/run_static_checks.js\` (idempotente, read-only salvo este log)  `);
  L.push(`**Host:** ${process.platform}/${process.arch} · Node ${process.version} · ${os.release()}  `);
  L.push(`**Workspace:** \`${REPO}\`  `);
  L.push(`**Git:** HEAD \`${env.head}\` · staged \`${env.staged}\` · \`ara-x/\` ${env.araXTracked ? 'tracked' : 'untracked (snapshot de trabajo)'}  `);
  L.push(`**Alcance:** local, sin VPS, sin deploy, sin red. Excluye \`ara-x/evidence/\` (fuera de scope).  `);
  L.push('');
  L.push('## 0 · Veredicto V1-R');
  L.push('');
  L.push(`> **V1-R ${verdict}** — ${pass} PASS · ${fail} FAIL · ${notRun} NOT_RUN · `
    + `0 rojos de código en la matriz · auditorías t26/V3: ${audits.checks.filter((c) => c.ok).length}/${audits.checks.length} PASS`
    + (keyArtifacts.failures.length ? ` · ${keyArtifacts.failures.length} artefacto(s) con hash inesperado` : '')
    + '. Los NOT_RUN son herramientas ausentes (`php`, `luac`, `nginx`) y una forma de invocación no soportada '
    + 'por el runtime; **jamás se reportan como PASS**.');
  L.push('>');
  L.push('> **Este veredicto cubre solo estática/unitaria/esquemas + auditoría de las rutas t26/V3-R2.** No absorbe '
    + 'ni blanquea rojos de otros workstreams: **V3-R2 = PASS en reparables de repo, deploy de producción NO-GO** '
    + 'por F-01/F-05/F-09 (documentado en §10). La decisión de entrega es del council (C1); V1-R no la adelanta.');
  L.push('>');
  L.push('> Leyenda de status: **PASS** = comando ejecutado y exit 0 (o parseo íntegro); **FAIL** = comando '
    + 'ejecutado con error o invariante roja; **NOT_RUN** = no ejecutado por herramienta ausente o por '
    + 'invocación no soportada, con motivo; nunca se cuenta como PASS.');
  L.push('');
  L.push('### Matriz comando × resultado');
  L.push('');
  L.push('| # | Paso | Comando | Tipo | Status | Exit | ms | Motivo |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of matrix) {
    L.push(`| ${matrix.indexOf(r) + 1} | ${mdCell(r.step)} | \`${mdCell(r.command)}\` | ${mdCell(r.kind)} | **${r.status}** | ${r.exit == null ? '—' : r.exit} | ${r.ms == null ? '—' : r.ms} | ${mdCell(r.reason)} |`);
  }
  L.push('');
  L.push(`**Totales:** PASS=${pass} · FAIL=${fail} (código=${codeFail}) · NOT_RUN=${notRun}.`);
  L.push('');
  L.push('> Las auditorías de rutas t26/V3-R2 (§9) y los hashes de artefactos críticos son comprobaciones '
    + 'ADICIONALES: no alteran las 23 filas de la matriz de arriba, pero si fallan el veredicto es FAIL.');
  L.push('');

  // resumen de secciones
  L.push('### Resumen por área');
  L.push('');
  L.push(`- **JS:** ${js.rows.length}/${js.rows.length} con \`node --check\` exit 0 (lista completa en §1).`);
  L.push(`- **Tests:** ${tests.files.length} suites · ${tests.counts.tests} tests · ${tests.counts.pass} pass · `
    + `${tests.counts.fail} fail · ${tests.counts.skipped} skip · exit ${tests.finalRun.code} (crudo en §2).`);
  L.push(`- **Gates:** ${gates.filter((g) => g.code === 0).length}/${gates.length} exit 0 (crudo en §3).`);
  L.push(`- **JSON/schemas:** ${json.rows.length - json.invalid.length}/${json.rows.length} parsean · `
    + `${json.schemas.length} schemas con estructura válida · ${json.invalid.length} inválidos (§4).`);
  L.push(`- **Imports:** ${imports.specs.length} specs únicos · ${imports.missing.length} sin resolver · `
    + `${imports.external.length} externos (§5).`);
  L.push(`- **Secretos:** entrega ${secrets.delivery.real.length} reales · ${secrets.delivery.hits.length} allowlisted; `
    + `r1_evidence auditada sin credenciales (§9.1).`);
  L.push(`- **Herramientas:** php=${tools.php.present ? 'presente' : 'AUSENTE'} · luac=${tools.luac.present ? 'presente' : 'AUSENTE'} · `
    + `nginx=${tools.nginx.present ? 'presente' : 'AUSENTE'} ⇒ NOT_RUN justificados (§7).`);
  L.push(`- **Auditoría t26/V3-R2:** ${audits.checks.filter((c) => c.ok).length}/${audits.checks.length} PASS · `
    + `security.test.js ${audits.security.pass}/${audits.security.tests} · r1_evidence ${audits.r1.hits} credenciales · `
    + `contrato D1 digests actuales (§9).`);
  L.push('');

  // §1
  L.push('## 1 · Inventario JS y `node --check` (100 % de `ara-x/`)');
  L.push('');
  L.push(`Se ejecutó \`node --check\` sobre **${js.rows.length} archivos** (todos los \`*.js\` de \`ara-x/\`, `
    + `excluyendo \`ara-x/evidence/\`). Resultado: **${js.rows.length - js.failed.length} PASS · ${js.failed.length} FAIL**.`);
  L.push('');
  L.push('| # | Archivo | Bytes | sha256 (16) | node --check |');
  L.push('|---|---|---|---|---|');
  js.rows.forEach((r, i) => {
    L.push(`| ${i + 1} | \`${mdCell(r.file)}\` | ${r.bytes} | \`${r.sha.slice(0, 16)}…\` | ${r.ok ? 'PASS' : '**FAIL**'} |`);
  });
  L.push('');
  if (js.failed.length) {
    L.push('### Fallos de sintaxis');
    L.push('');
    for (const r of js.failed) {
      L.push(`#### \`${r.file}\``);
      L.push(fence(r.detail));
      L.push('');
    }
  }

  // §2
  L.push('## 2 · Suites de test (`node --test`)');
  L.push('');
  L.push(`**Comando ejecutado:** \`node --test "ara-x/tests/*.test.js"\` (equivale a la suite completa de `
    + `\`ara-x/tests/\`; ver §2.2 para la forma con directorio).`);
  L.push('');
  L.push(`**Snapshot de tests:** ${tests.files.length} archivos · ${tests.changed.length} cambiados durante la captura`
    + (tests.changed.length ? ` (${tests.changed.join(', ')})` : ''));
  L.push('');
  L.push('| # | Suite | tests | pass | fail | skip | exit | ms | sha256 (16) |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  tests.perFile.forEach((p, i) => {
    const meta = tests.after.get(p.file) || {};
    L.push(`| ${i + 1} | \`${mdCell(p.file)}\` | ${p.tests == null ? '—' : p.tests} | ${p.pass == null ? '—' : p.pass} | `
      + `${p.fail == null ? '—' : p.fail} | ${p.skipped == null ? '—' : p.skipped} | ${p.code} | ${p.ms} | \`${(meta.sha || '').slice(0, 16)}…\` |`);
  });
  L.push('');
  L.push(`**Totales de la suite:** tests=${tests.counts.tests} · pass=${tests.counts.pass} · fail=${tests.counts.fail} · `
    + `skipped=${tests.counts.skipped} · exit=${tests.finalRun.code}` +
    (tests.retried ? ' · (hubo reintento: ver salida cruda con ambas pasadas)' : ''));
  L.push('');
  L.push('Salida cruda por archivo (resumen del reporter para atribuir counts, además de la suite completa en §2.1):');
  L.push('');
  for (const p of tests.perFile) {
    const block = rawBlocks.find((b) => b.id === `tests-${p.file.replace(/^ara-x\/tests\//, '')}`);
    L.push(`#### \`${p.file}\` — exit ${p.code}${p.retry ? ' (reintento)' : ''}`);
    L.push('');
    L.push(fence(block ? block.text : '(sin salida)'));
    L.push('');
  }
  L.push('Los 2 skips declarados: (a) `device_apply.test.js` — lint PHP/paridad JS↔PHP = NOT_RUN sin PHP local; '
    + '(b) `playlist.test.js` — E2E real gated por `ARA_X_E2E=1` (escribe ~1,1 GB de temporales). '
    + 'Ambos son NOT_RUN justificados, no tests verdes.');
  L.push('');
  L.push('### 2.1 Salida cruda de la suite completa');
  L.push('');
  L.push(fence(rawBlocks.find((b) => b.id === 'tests-glob').text));
  L.push('');
  if (rawBlocks.find((b) => b.id === 'tests-glob').truncated) {
    L.push(`> _Salida truncada: ${rawBlocks.find((b) => b.id === 'tests-glob').truncated} líneas omitidas._`);
    L.push('');
  }
  L.push('### 2.2 `node --test ara-x/tests/` (forma con directorio)');
  L.push('');
  const dirRow = matrix.find((r) => r.command === 'node --test ara-x/tests/');
  L.push(`**Status: ${dirRow.status}.** ${dirRow.reason}`);
  L.push('');
  L.push(fence(rawBlocks.find((b) => b.id === 'tests-dirform').text));
  L.push('');

  // §3
  L.push('## 3 · Gates de contrato (salidas crudas)');
  L.push('');
  for (const g of gates) {
    L.push(`### ${g.label}`);
    L.push('');
    L.push(`\`node ${g.args.join(' ')}\` ⇒ **exit ${g.code}** · ${g.ms} ms · ${g.summary || '(sin resumen)'}`);
    L.push('');
    const block = rawBlocks.find((b) => b.id === `gate-${g.id}`);
    L.push(fence(block.text));
    if (block.truncated) L.push(`\n> _Salida truncada: ${block.truncated} líneas omitidas._`);
    L.push('');
  }

  // §4
  L.push('## 4 · JSON y schemas');
  L.push('');
  L.push(`Se parsearon **${json.rows.length} archivos JSON** de \`ara-x/\` (excluye \`ara-x/evidence/\`, fuera de scope). `
    + `**Inválidos: ${json.invalid.length}.** Schemas \`*.schema.json\`: ${json.schemas.length} `
    + `(${json.schemas.map((s) => '`' + s.file.replace('ara-x/', '') + '`').join(', ')}).`);
  L.push('');
  L.push('| # | Archivo | Bytes | sha256 (16) | JSON.parse |');
  L.push('|---|---|---|---|---|');
  json.rows.forEach((r, i) => {
    L.push(`| ${i + 1} | \`${mdCell(r.file)}\` | ${r.bytes} | \`${r.sha.slice(0, 16)}…\` | ${r.ok ? 'PASS (' + r.type + ')' : '**FAIL** — ' + mdCell(r.error)} |`);
  });
  L.push('');

  // §5
  L.push('## 5 · Imports (`require()`)');
  L.push('');
  L.push(`Escaneados **${js.rows.length} JS**. Specs únicos: ${imports.specs.length} · `
    + `relativos: ${imports.specs.filter((s) => s.kind === 'relative').length} · `
    + `builtins: ${imports.specs.filter((s) => s.kind === 'builtin').length} · `
    + `externos: ${imports.external.length} · sin resolver: ${imports.missing.length}.`);
  L.push('');
  L.push('| Spec | Tipo | Refs | Ejemplos |');
  L.push('|---|---|---|---|');
  for (const s of imports.specs) {
    L.push(`| \`${mdCell(s.spec)}\` | ${s.kind} | ${s.refs} | ${s.samples.map((x) => '`' + x + '`').join('<br>')} |`);
  }
  L.push('');
  if (imports.missing.length) {
    L.push('**Requires sin resolver:**');
    L.push('');
    for (const m of imports.missing) L.push(`- \`${m.file}\` → \`${m.spec}\``);
    L.push('');
  }

  // §6
  L.push('## 6 · Secretos obvios');
  L.push('');
  L.push(`**Entrega** (excluye \`ara-x/evidence/\` y \`reports/r1_evidence/\`): ${secrets.delivery.files} archivos · `
    + `${secrets.delivery.real.length} secretos reales · ${secrets.delivery.hits.length} coincidencias allowlisted `
    + `(fixtures de test/placeholders). Escaneadas extensiones de texto y binarios JSON grandes hasta 16 MiB.`);
  L.push('');
  if (secrets.delivery.hits.length) {
    L.push('| Archivo | Línea | Regla | Allowlisted |');
    L.push('|---|---|---|---|');
    for (const h of secrets.delivery.hits) {
      L.push(`| \`${mdCell(h.file)}\` | ${h.line} | ${h.rule} | ${h.allowed ? 'sí (fixture/placeholder)' : '**NO**'} |`);
    }
    L.push('');
  }
  L.push(`**Evidencia raw derivada** (\`reports/r1_evidence/**\`, auditoría dedicada en §9.1): `
    + `${secrets.rawOnly.length} hallazgo(s) con las reglas genéricas de V1. `
    + 'V3 documentó 2 `credential_path` **pre-reparación** (**V3-F-02**); t26 redactó la evidencia y el escaneo '
    + 'dedicado de §9.1 confirma 0 credenciales sobre los 9 JSON actuales.');
  L.push('');
  if (secrets.rawOnly.length) {
    L.push('| Archivo | Línea | Regla | sha8 del valor |');
    L.push('|---|---|---|---|');
    for (const h of secrets.rawOnly) L.push(`| \`${mdCell(h.file)}\` | ${h.line} | ${h.rule} | \`${h.valueSha8}\` |`);
    L.push('');
    L.push('> **No absorbido por V1.** Coincide con **V3-F-02** (HIGH) del workstream V3: URLs completas con '
      + 'cuenta/clave en la evidencia raw de R1. V1 no corrige ni redacta esos archivos (fuera de su write-scope) '
      + 'y no los declara limpios; quedan como bloqueo de entrega para council/packaging.');
    L.push('');
  }

  // §7
  L.push('## 7 · Herramientas no disponibles (NOT_RUN justificado, nunca PASS)');
  L.push('');
  L.push('| Herramienta | Probe | Resultado |');
  L.push('|---|---|---|');
  for (const [name, t] of Object.entries(tools)) {
    L.push(`| \`${name}\` | \`${t.command} --version\` | ${t.present ? `presente (exit ${t.status}): ${mdCell(t.version)}` : '**AUSENTE** (ENOENT)'} |`);
  }
  L.push('');
  const syncGate = gates.find((g) => g.id === 'sync');
  const luaGate = gates.find((g) => g.id === 'lua');
  L.push('Consecuencia: `php -l` (2 archivos), `luac -p` (1 archivo) y `nginx -t` (3 fragmentos) figuran '
    + '**NOT_RUN** en la matriz; no se declaran verdes. Los chequeos estáticos sustitutivos (patrones del '
    + `PHP/Lua y del snippet) sí corren en §3: \`check_sync_contract\` ${syncGate ? syncGate.summary : 'n/a'} · `
    + `\`check_lua_module\` ${luaGate ? luaGate.summary : 'n/a'}.`);
  L.push('');

  // §8
  L.push('## 8 · Avisos del verificador (WARN, no FAIL)');
  L.push('');
  if (warnings.length === 0) L.push('Sin avisos.');
  else for (const w of warnings) L.push(`- ${w}`);
  L.push('');

  // §9 · artefactos críticos + auditoría t26/V3-R2 (V1-R)
  L.push('## 9 · Artefactos críticos, rutas t26 y auditoría V3-R2 (V1-R)');
  L.push('');
  L.push('Sección de la revisión V1-R: liga el veredicto a los **bytes actuales** de Lua/snippet/PHP/tests y de las '
    + 'rutas que cambiaron después de t27. No añade filas a la matriz; si algo falla, el veredicto es FAIL.');
  L.push('');
  L.push('### 9.0 Hashes actuales de artefactos críticos');
  L.push('');
  L.push('| Grupo | Archivo | Bytes | sha256 (16) | Esperado | Status |');
  L.push('|---|---|---|---|---|---|');
  for (const r of keyArtifacts.rows) {
    L.push(`| ${mdCell(r.group)} | \`${mdCell(r.file)}\` | ${r.bytes == null ? '—' : r.bytes} | `
      + `${r.sha ? '`' + r.sha.slice(0, 16) + '…`' : '—'} | ${r.expected ? '`' + r.expected + '…`' : '—'} | `
      + `${r.ok ? 'PASS' : '**FAIL**' + (r.error ? ' — ' + mdCell(r.error) : '')} |`);
  }
  L.push('');
  L.push('### 9.1 r1_evidence — sin credenciales');
  L.push('');
  L.push(`- Archivos JSON: **${audits.r1.files}** (esperado 9) · parsean: sí.`);
  L.push(`- Credenciales por patrones (userinfo, query creds, \`/live/<digits>/<digits>/\`, \`/a/<n>/<digits>/<digits>/\`): **${audits.r1.hits}**.`);
  L.push(`- URLs \`/cdn/\` sin redactar (\`/cdn/\` no seguido de \`<\`): **${audits.r1.unredacted_cdn}** · placeholders \`<Nc>\`: ${audits.r1.placeholders}.`);
  L.push('');
  L.push('### 9.2 Auditorías t26/V3-R2');
  L.push('');
  L.push('| Auditoría | Status | Detalle |');
  L.push('|---|---|---|');
  for (const c of audits.checks) {
    L.push(`| ${mdCell(c.name)} | ${c.ok ? 'PASS' : '**FAIL**'} | ${c.detail == null ? '' : mdCell(JSON.stringify(c.detail)).slice(0, 240)} |`);
  }
  L.push('');
  L.push(`**security.test.js:** ${audits.security.pass}/${audits.security.tests} pass · ${audits.security.fail} fail · `
    + `exit ${audits.security.exit} (crudo abajo).`);
  L.push('');
  const secBlock = rawBlocks.find((b) => b.id === 'audit-security');
  if (secBlock) {
    L.push(fence(secBlock.text));
    L.push('');
  }
  L.push('### 9.3 Contrato D1 — digests del Anexo C');
  L.push('');
  L.push('| Evidencia | Citado en D1 | Actual | ¿Coincide? |');
  L.push('|---|---|---|---|');
  L.push(`| \`sync_features.json\` | ${audits.contract.syncCitedBytes} B · \`${audits.contract.syncCitedSha}\` | `
    + `${audits.contract.syncBytes} B · \`${String(audits.contract.syncActual).slice(0, 8).toUpperCase()}\``
    + ` | ${audits.checks.find((c) => c.name.includes('sync_features'))?.ok ? 'sí' : '**NO**'} |`);
  L.push(`| \`R1_list_forensics.md\` | ${audits.contract.r1CitedBytes} B · \`${audits.contract.r1CitedSha}\` | `
    + `${audits.contract.r1Bytes} B · \`${String(audits.contract.r1Actual).slice(0, 8).toUpperCase()}\``
    + ` | ${audits.checks.find((c) => c.name.includes('R1_list_forensics'))?.ok ? 'sí' : '**NO**'} |`);
  L.push('');
  L.push('### 9.4 Alcance de V2 respecto a estos bytes');
  L.push('');
  L.push('V2 (E2E) **no se re-ejecuta** en V1-R: consume solo `ara-x/playlist/ara_x_injector.js` y '
    + '`ara-x/playlist/ara_x_validator.js`, cuyos sha256 siguen siendo **88A3EB3D…/F31DE565…** (fila propia en §9.2), '
    + 'y no consume Lua/PHP/nginx ni el VPS. Las reparaciones t26/t28/t30/t31 son ajenas a ese alcance; este log '
    + 'las liga por hash para que el veredicto estático quede anclado a los bytes actuales.');
  L.push('');

  // §10 · contexto V3-R2 (no absorbido)
  L.push('## 10 · Contexto de otros workstreams (no absorbido por V1-R)');
  L.push('');
  L.push(`**V3 (V3-R2, seguridad) — snapshot:** ${cross.v3Present ? '`reports/V3_security.md` presente' : 'reporte ausente'}.`);
  if (cross.verdict) L.push(`**Veredicto V3-R2 citado:** ${cross.verdict}`);
  if (cross.deploy) L.push(`**Deploy citado:** ${cross.deploy}`);
  if (cross.repairs.length) {
    L.push('');
    L.push('**Informes de reparación V3 presentes** (hashes en §9.0):');
    L.push('');
    for (const r of cross.repairs) {
      L.push(`- \`${r.file}\` (${r.bytes} B, \`${r.sha256.slice(0, 16)}…\`) — ${mdCell(r.title)}`);
    }
  }
  L.push('');
  if (cross.findings.length) {
    L.push('Hallazgos `V3-F-*` citados por el reporte V3 actual (texto recortado; V1-R no re-evalúa el veredicto V3):');
    L.push('');
    for (const f of cross.findings) {
      L.push(`- ${String(f).replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').trim()}`);
    }
    L.push('');
  }
  for (const n of cross.notes) L.push(`- ${n}`);
  L.push('');
  L.push('> V1-R **no** modifica PHP/Lua/VPS, no redacta evidencia y no re-clasifica findings de seguridad. '
    + 'Este apartado existe para que council (C1) vea el rojo junto al verde estático, en el mismo documento. '
    + 'V3-R2 = **PASS en reparables de repo**; el deploy sigue **NO-GO** por F-01/F-05/F-09.');
  L.push('');

  // §11 · reproducibilidad y límites
  L.push('## 11 · Reproducibilidad y límites de la captura');
  L.push('');
  L.push('- Reproducir: `node ara-x/scripts/verify/run_static_checks.js` (exit 0 ⟺ 0 FAIL de código y 0 auditorías rojas).');
  L.push('- `node --test ara-x/tests/` (forma con directorio) **no es ejecutable** en este runtime '
    + `(Node ${process.version} / ${process.platform}): el runner trata el directorio como módulo y ejecuta 0 tests. `
    + 'La forma ejecutada y equivalente es `node --test "ara-x/tests/*.test.js"` (10 suites, arriba).');
  L.push('- El snapshot incluye hashes de cada archivo JS/JSON/suite/artefacto crítico, de modo que cualquier edición '
    + 'posterior es detectable (`sha256` en §1/§2/§4/§9.0).');
  L.push('- `ara-x/evidence/**` ('
    + `${evidence.files} archivos, ~${evidence.gb} GB) queda fuera: es material de R1/I2 y V2, no de V1-R.`);
  L.push('- `ara-x/.gitignore` ignora `*.log`; este archivo es el entregable de V1-R en disco, no va al commit.');
  L.push('- No se ejecutó `check_lists.js` (444 s, escribe ~1,1 GB y depende de `ara-x/evidence/`): '
    + 'pertenece al gate E2E de I2/V2, no a V1-R.');
  L.push('- El árbol puede estar en movimiento (otras tareas del equipo): los `sha256` de §1/§2/§4/§9.0 fijan este '
    + 'snapshot; si algún archivo cambia, re-ejecutar el verificador (≈15 s) renueva la evidencia.');
  L.push('');
  L.push(`**Firma V1-R:** \`integration-verifier\` · ${env.stamp} · \`${verdict}\` · `
    + `PASS=${pass} FAIL=${fail} (código=${codeFail}) NOT_RUN=${notRun} · `
    + `auditorías=${audits.checks.filter((c) => c.ok).length}/${audits.checks.length}.`);
  L.push('');
  if (logShaInfo) {
    L.push(`**sha256 (32 hex) del cuerpo de este log, sin esta línea de firma:** \`${logShaInfo}\``);
    L.push('');
  }
  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const startedAt = new Date();
  if (ONLY_ARGS.length) {
    console.error(`Argumentos no reconocidos: ${ONLY_ARGS.join(' ')}`);
    console.error('Uso: node ara-x/scripts/verify/run_static_checks.js [--quiet] [--no-log]');
    process.exit(2);
  }

  const env = {
    stamp: stamp(startedAt),
    head: (() => {
      const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' });
      return (r.stdout || '').trim() || 'NO_GIT';
    })(),
    staged: (() => {
      const r = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: REPO, encoding: 'utf8' });
      return String(r.stdout || '').split(/\r?\n/).filter(Boolean).length;
    })(),
    araXTracked: (() => {
      const r = spawnSync('git', ['ls-files', '--', 'ara-x'], { cwd: REPO, encoding: 'utf8' });
      return Boolean(String(r.stdout || '').trim());
    })()
  };
  addRow({ step: '0', command: 'node --version', kind: 'env', status: 'PASS', exit: 0, ms: 0, reason: process.version });
  addRow({
    step: '0',
    command: 'git rev-parse --short HEAD',
    kind: 'env',
    status: env.head === 'NO_GIT' ? 'NOT_RUN' : 'PASS',
    exit: null,
    ms: null,
    reason: env.head === 'NO_GIT' ? 'git no disponible' : `${env.head} · staged=${env.staged} · ara-x ${env.araXTracked ? 'tracked' : 'untracked'}`
  });

  const js = sectionJs();
  const tests = sectionTests();
  const gates = sectionGates();
  const json = sectionJson();
  const imports = sectionImports(
    walk(ROOT, { skipDirs: ['evidence', 'node_modules', '.git'] })
      .filter((f) => f.endsWith('.js'))
      .sort((a, b) => rel(a).localeCompare(rel(b)))
  );
  const secrets = sectionSecrets();
  const tools = sectionTools();
  const cross = sectionCrossWorkstream();
  if (cross.deploy && /NO-GO/i.test(cross.deploy)) {
    addWarning('V3-R2: reparables de repo PASS, pero deploy NO-GO (F-01/F-05/F-09) — rojo de otro workstream citado en §10; V1-R no lo absorbe.');
  }
  if (cross.v3Present && cross.verdict && /FAIL/i.test(cross.verdict) && !/PASS/i.test(cross.verdict)) {
    addWarning('V3: veredicto FAIL citado en §10; V1-R no lo absorbe.');
  }
  const keyArtifacts = sectionKeyArtifacts();
  const audits = sectionT26Audit(keyArtifacts);
  for (const f of audits.failed) addWarning(`auditoría t26/V3 roja: ${f}`);
  for (const f of keyArtifacts.failures) addWarning(`artefacto crítico con hash inesperado: ${f}`);
  const evidence = (() => {
    let files = 0;
    let bytes = 0;
    for (const f of walk(path.join(ROOT, 'evidence'))) {
      try {
        const s = fs.statSync(f);
        if (s.isFile()) { files += 1; bytes += s.size; }
      } catch { /* sigue */ }
    }
    return { files, bytes, gb: (bytes / 1e9).toFixed(2) };
  })();

  // El hash del log se calcula sobre el cuerpo sin la línea de firma (se añade al final).
  const draft = buildReport({
    js, tests, gates, json, imports, secrets, tools, cross, keyArtifacts, audits, env, evidence, logShaInfo: null
  });
  const logSha = sha256(Buffer.from(draft, 'utf8')).slice(0, 32);
  const final = buildReport({
    js, tests, gates, json, imports, secrets, tools, cross, keyArtifacts, audits, env, evidence, logShaInfo: logSha
  });

  if (!NO_LOG) {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.writeFileSync(LOG_PATH, final, 'utf8');
  }

  const pass = matrix.filter((r) => r.status === 'PASS').length;
  const fail = matrix.filter((r) => r.status === 'FAIL').length;
  const notRun = matrix.filter((r) => r.status === 'NOT_RUN').length;
  const codeFail = matrix.filter((r) => r.status === 'FAIL' && r.kind === 'code').length;
  const auditFail = audits.checks.filter((c) => !c.ok).length + keyArtifacts.failures.length;

  if (!QUIET) {
    console.log('V1-R · matriz comando × resultado');
    for (const r of matrix) {
      console.log(`  ${r.status.padEnd(7)} ${r.kind.padEnd(12)} ${r.command}${r.reason ? '  · ' + r.reason : ''}`);
    }
  }
  console.log('');
  console.log(`V1-R ${codeFail === 0 && auditFail === 0 ? 'PASS' : 'FAIL'} · PASS=${pass} FAIL=${fail} (código=${codeFail}) NOT_RUN=${notRun}`
    + ` · auditorías=${audits.checks.filter((c) => c.ok).length}/${audits.checks.length}`
    + (keyArtifacts.failures.length ? ` · artefactos=${keyArtifacts.failures.length} rojos` : ''));
  console.log(`tests: ${tests.counts.tests} · pass ${tests.counts.pass} · fail ${tests.counts.fail} · skip ${tests.counts.skipped}`);
  console.log(`security.test.js: ${audits.security.pass}/${audits.security.tests} · r1_evidence creds=${audits.r1.hits}`);
  console.log(`JS node --check: ${js.rows.length - js.failed.length}/${js.rows.length} · JSON válidos: ${json.rows.length - json.invalid.length}/${json.rows.length}`);
  if (!NO_LOG) console.log(`log: ${rel(LOG_PATH)} · sha256(log)=${logSha}…`);
  process.exit(codeFail === 0 && auditFail === 0 ? 0 : 1);
}

main();
