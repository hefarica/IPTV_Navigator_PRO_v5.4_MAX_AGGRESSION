#!/usr/bin/env node
'use strict';

/**
 * V3 · escáner de secretos de la entrega ARA-X.
 *
 * Objetivo: impedir que la entrega (código, specs, reportes, scripts y tests)
 * publique credenciales reales. No imprime valores: solo archivo, línea y tipo.
 *
 * Reglas:
 *   - URLs con userinfo (`scheme://user:pass@host`) → finding.
 *   - forma de credencial en path `/cdn/<host>/live/<seg>/<seg>/<id>` con
 *     segmentos reales (no placeholders) → finding. R1 documenta ese patrón.
 *   - `username=`/`password=` en query → finding.
 *   - asignaciones de `secret`/`token`/`api_key`/`ARA_TOKEN`/`APE_ENROLL_SECRET`
 *     con valor literal largo → finding, salvo placeholders y el fixture de test.
 *   - Bearer literal, claves privadas PEM y claves AWS → finding.
 *
 * `ara-x/evidence/**` (catálogos completos) queda fuera por defecto; se puede
 * incluir su evidencia derivada `reports/r1_evidence/**` (que SÍ se escanea).
 *
 * Uso:
 *   node ara-x/scripts/security/scan_secrets.js [--root ara-x] [--json]
 *        [--exclude evidence,reports/r1_evidence] [--allow ara-x-test-secret]
 *
 * Exit: 0 sin findings; 1 con findings o error de IO.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  root: path.resolve(__dirname, '..', '..'),
  excludes: ['evidence', 'node_modules', '.git'],
  allow: ['ara-x-test-secret', 'rotation-secret-old', 'rotation-secret-new']
});

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.sh', '.ps1', '.php', '.lua',
  '.conf', '.yml', '.yaml', '.jsonl', '.example', '.schema'
]);

const PLACEHOLDER_RE = /[<>{}\u2026]|\.\.\.|(?:REPLACE|CHANGE_ME|PLACEHOLDER|REDACTED|EXAMPLE)/i;
const ALLOWED_SECRET_RE = [
  /^ara-x-test-secret$/,
  /^rotation-secret-(?:old|new)$/,
  /^REPLACE_WITH_/i,
  /^CHANGE_ME/i,
  /^PLACEHOLDER/i,
  /^EXAMPLE/i,
  /^\*+REDACTED\*+$/i,
  /^\$\{[^}]+\}$/,
  /^getenv\(/i,
  /^env:/i,
  /^<[^>]*>$/,
  /^x{6,}$/i
];

const URL_USERINFO = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>/@]+:[^\s"'<>/@]+@/i;
const CREDENTIAL_PATH = /https?:\/\/[^\s"'<>]+?\/cdn\/[^\s/<>]+\/live\/([^\s/<>]+)\/([^\s/<>]+)\/([^\s/<>]+)/i;
const QUERY_CREDENTIAL = /[?&](?:username|user|password|pass|pwd)=/i;
const SECRET_ASSIGN = /\b(secret|hmacKey|hmac_key|api_key|apiKey|access_token|ARA_TOKEN|APE_ENROLL_SECRET)\b\s*[:=]\s*["']?([A-Za-z0-9_+\/.\-]{16,})/i;
const BEARER_LITERAL = /\bBearer\s+[A-Za-z0-9._\-+/=]{20,}/;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/;

function allowedSecret(value) {
  return ALLOWED_SECRET_RE.some((re) => re.test(value));
}

function isExcluded(rel, excludes) {
  const parts = rel.split(/[\\/]/);
  return excludes.some((x) => {
    const norm = String(x).replace(/\\/g, '/');
    return norm.includes('/') ? rel.replace(/\\/g, '/').includes(norm) : parts.includes(norm);
  });
}

function scanText(text, rel, allow) {
  const findings = [];
  const allowSet = new Set(allow);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (URL_USERINFO.test(line)) {
      findings.push({ file: rel, line: i + 1, kind: 'userinfo_url', detail: 'URL con userinfo' });
    }
    const pathMatch = line.match(CREDENTIAL_PATH);
    if (pathMatch && !PLACEHOLDER_RE.test(pathMatch[0])) {
      findings.push({
        file: rel,
        line: i + 1,
        kind: 'credential_path',
        detail: 'path con 2 segmentos de credencial + id (seg=' + pathMatch[1].length + '/' + pathMatch[2].length + ')'
      });
    }
    if (QUERY_CREDENTIAL.test(line)) {
      findings.push({ file: rel, line: i + 1, kind: 'query_credential', detail: 'username/password en query' });
    }
    if (PRIVATE_KEY.test(line)) {
      findings.push({ file: rel, line: i + 1, kind: 'private_key', detail: 'bloque PEM privado' });
    }
    if (AWS_KEY.test(line)) {
      findings.push({ file: rel, line: i + 1, kind: 'aws_key', detail: 'clave AWS' });
    }
    if (BEARER_LITERAL.test(line)) {
      findings.push({ file: rel, line: i + 1, kind: 'bearer_literal', detail: 'Bearer literal' });
    }
    const secret = line.match(SECRET_ASSIGN);
    if (secret) {
      const value = secret[2];
      if (!allowedSecret(value) && !allowSet.has(value) && !PLACEHOLDER_RE.test(value)) {
        findings.push({
          file: rel,
          line: i + 1,
          kind: 'secret_assignment',
          detail: 'asignación de ' + secret[1] + ' con valor literal (len=' + value.length + ')'
        });
      }
    }
  }
  return findings;
}

function collectFiles(root, excludes) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (!isExcluded(rel, excludes)) walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXT.has(ext) && !/\.(?:example|env)$/i.test(entry.name)) continue;
      if (rel === 'scripts/security/scan_secrets.js') continue; // no auto-flag del propio escáner
      files.push({ full, rel });
    }
  };
  walk(root);
  return files;
}

function run(options = {}) {
  const root = path.resolve(options.root || DEFAULTS.root);
  const excludes = options.excludes || DEFAULTS.excludes;
  const allow = options.allow || DEFAULTS.allow;
  const files = collectFiles(root, excludes);
  const findings = [];
  const skipped = [];
  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file.full);
    } catch {
      skipped.push({ file: file.rel, reason: 'stat_failed' });
      continue;
    }
    if (stat.size > 20 * 1024 * 1024) {
      skipped.push({ file: file.rel, reason: 'too_large', bytes: stat.size });
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(file.full, 'utf8');
    } catch {
      skipped.push({ file: file.rel, reason: 'read_failed' });
      continue;
    }
    findings.push(...scanText(text, file.rel, allow));
  }
  return {
    ok: findings.length === 0,
    root,
    files: files.length,
    findings,
    skipped
  };
}

function main(argv) {
  const args = argv.slice(2);
  const opts = { ...DEFAULTS };
  let asJson = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--json') asJson = true;
    else if (args[i] === '--root') opts.root = args[++i];
    else if (args[i] === '--exclude') opts.excludes = String(args[++i]).split(',');
    else if (args[i] === '--allow') opts.allow = String(args[++i]).split(',');
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('usage: node ara-x/scripts/security/scan_secrets.js [--root DIR] [--exclude a,b] [--allow a,b] [--json]');
      return 0;
    } else {
      console.error('unknown argument: ' + args[i]);
      return 2;
    }
  }
  let result;
  try {
    result = run(opts);
  } catch (err) {
    console.error('scan failed: ' + err.message);
    return 2;
  }
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('V3 secrets scan');
    console.log('  root: ' + result.root);
    console.log('  files: ' + result.files + ' · findings: ' + result.findings.length + ' · skipped: ' + result.skipped.length);
    for (const f of result.findings) console.log('  FAIL ' + f.file + ':' + f.line + '  ' + f.kind + ' · ' + f.detail);
    if (result.ok) console.log('  OK — 0 secretos reales en el árbol escaneado');
    else console.log('  FAIL — cuarentena/redacción obligatoria; NO commit ni deploy');
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv);

module.exports = { run, main, scanText, DEFAULTS, TEXT_EXT };
