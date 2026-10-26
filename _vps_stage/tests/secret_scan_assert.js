#!/usr/bin/env node
/**
 * ===========================================================================
 * secret_scan_assert.js - GATE H8 / C7 / T34 (arbol servible sin credenciales)
 * ===========================================================================
 * OBJETIVO
 *   Impedir que vuelvan a aparecer credenciales en texto plano en el arbol
 *   servible por HTTP de IPTV Navigator:
 *   `IPTV_v5.4_MAX_AGGRESSION/frontend/**`.
 *
 * AFIRMACIONES FATALES (exit 1 si falla alguna; tambien bajo --strict)
 *   A1  Todo `frontend/lab_master*.json` parsea como JSON.
 *   A2  En `servers[]` los campos de credencial (username/user/password/pass/
 *       pwd/login) estan REDACTADOS: `***REDACTED***`, vacio, `${VAR}`,
 *       `{token}`, `%VAR%`, `getenv(...)` o `env:`.
 *   A3  En los bloques `servers`, `placeholders_map` y `evasion_pool` no hay
 *       credenciales legibles ni URIs `scheme://usuario:contrasena@host`.
 *   A4  Ningun objeto JSON tiene 2+ campos de credencial en claro.
 *   A5  Ningun valor es un auth literal `Basic <base64 de usuario:contrasena>`.
 *   A6  Ningun fichero textual servible contiene URIs con credenciales.
 *   A7  CONTRATO DEL CONSUMIDOR intacto en el DNA del LAB (claves, `servers[]`
 *       con {base_url,username,password,note}, tokens `{server.username}` /
 *       `{server.password}`, `evasion_pool` {user_agents[],referers[]}).
 *
 * ALLOWLIST EXPLICITA (NUNCA fatal, ni con --strict)
 *   Deuda aceptada y CUANTIFICADA por el propietario; se reporta siempre con
 *   ruta, motivo, bytes y ultima medicion. Hoy contiene solo:
 *     - `channels_map.json` (las 3 copias) - waiver contractual (t26/t30/t34).
 *     - `**\/.wrangler/**` - estado local del CLI de Cloudflare (blobs R2),
 *       fuera del arbol servido por nginx y fuera del inScope de t34.
 *     - ADN canonico `lab_master_22.6.0.json`: allowlist SOLO de credenciales
 *       (A2-A6) por decision del propietario, con el pin byte-a-byte de
 *       `_vps_stage/lab/ADN_PIN.json`; A1 (JSON) y A7 (consumidor) siguen
 *       fatales. Compensacion exigida: rotacion de las 5 parejas.
 *
 * DEUDA TECNICA (DEBT) - vacia desde t34
 *   El mecanismo sigue vivo: si se vuelve a anadir una credencial en claro en
 *   los ficheros que t34 sano, ya NO estan exentos => FALLO FATAL inmediato.
 *
 * USO
 *   node _vps_stage/tests/secret_scan_assert.js              # inspeccion local
 *   node _vps_stage/tests/secret_scan_assert.js --strict     # GATE DE CI (exit 0 esperado)
 *   node _vps_stage/tests/secret_scan_assert.js --json       # salida maquina
 *   node _vps_stage/tests/secret_scan_assert.js --selftest   # prueba que detecta
 *
 * -- COMANDO DE CI (documentado; no ejecutado desde aqui, sin despliegue) ----
 *   # .github/workflows/*.yml | etapa de seguridad previa a cualquier deploy
 *   - name: H8 - credenciales fuera del arbol servible
 *     run: node _vps_stage/tests/secret_scan_assert.js --strict
 *   # criterio: exit 0. Cualquier FAIL bloquea el merge/deploy.
 *   # `--json` esta pensado para consumir el resultado desde el runner.
 * ---------------------------------------------------------------------------
 *
 * COBERTURA
 *   Recorre TODO `frontend/**` (no solo el DNA): todo `.json` se parsea y se
 *   inspecciona estructuralmente; todo fichero textual -incluidas copias
 *   `*.js.download`, `*.bak_*`, `*.backup*`- se escanea linea a linea. Los
 *   binarios/no textuales se declaran agregados por extension (nunca en
 *   silencio): la seccion COBERTURA dice cuantos se analizaron y cuantos no.
 *
 * TRAZABILIDAD DEL DNA DEL LAB (por que NO es un fichero muerto)
 *     - `frontend/index-v4.html:4029` carga
 *       `<script src="js/ape-lab-import-helper.js?v=2.0">`.
 *     - `frontend/js/ape-lab-import-helper.js:36`
 *       `DEFAULT_PATH = 'lab_master_22.6.0.json'`.
 *     - `:213-225` `apeImportLabLocal()` hace `fetch(abs,{cache:'no-store'})`.
 *     - `:286-289` es la 3a capa de `bootEnsure()`; `:321-335` la auto-lanza a
 *       los 400 ms salvo `localStorage.ape_lab_auto === '0'`.
 *   La via manual (`ape-profiles-config.js:4544` `importFromLAB`) consume
 *   `LAB_CALIBRATED_*.json` y su `labFileName` por defecto es
 *   `'LAB_CALIBRATED'` (`:4909`, `generation-controller.js:142`).
 *   [UNKNOWN] Importacion manual de un DNA desde FUERA del repo: no verificable
 *   aqui y no pineada (la elige el operador al importar) -> lo cierra t33.
 *
 * HONESTIDAD (leer antes de confiar en el verde)
 *   Este gate demuestra que el arbol servible esta LIMPIO de credenciales
 *   conocidas; NO des-leakea. Las mismas credenciales estuvieron expuestas y
 *   siguen en: el historico del listado generado (`srv=` base64), la copia del
 *   VPS `/var/www/html/prisma/config/lab_master_22.6.0.json`, las 3 copias de
 *   `channels_map.json` y los blobs de `.wrangler`. La ROTACION de las 5
 *   parejas es la unica accion que cierra el riesgo y decide el propietario.
 *
 * GARANTIA DE NO FUGA
 *   Nunca imprime valores: solo ruta, campo, linea, longitud y conteos. No
 *   escribe ficheros, no usa red, no ejecuta codigo del repo.
 * ===========================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const STRICT = ARGS.includes('--strict');
const AS_JSON = ARGS.includes('--json');
const SELFTEST = ARGS.includes('--selftest');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND = path.join(REPO_ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend');

// -- ALLOWLIST EXPLICITA (deuda aceptada y cuantificada; NUNCA fatal) -------
const ALLOWLIST = [
  {
    id: 'waiver-channels-map',
    match: (r) => path.basename(r) === 'channels_map.json',
    why: 'waiver contractual del propietario (t26/t30/t34): no se toca en esta tarea',
    measured: { fecha: '2026-10-25', por: 't34', ocurrencias: 185860, ficheros: 3, bytes: 107549004 },
    method: 'coincidencias de subcadena del conjunto de 7 tokens medido en los 4 ficheros saneados (COTA SUPERIOR; incluye coincidencias incidentales)',
    action: 'rotacion de credenciales + limpieza en tarea propia con inScope sobre channels_map.json',
  },
  {
    id: 'waiver-wrangler-state',
    match: (r) => r.includes('/.wrangler/') || r.endsWith('/.wrangler'),
    why: 'estado local del CLI de Cloudflare (blobs R2 cacheados): no forma parte del arbol servido por nginx y esta fuera del inScope de t34',
    measured: { fecha: '2026-10-25', por: 't34', ocurrencias: 6910, ficheros: 1, bytes: 17754555 },
    method: 'coincidencias de subcadena del mismo conjunto de 7 tokens',
    action: 'purgar `.wrangler/state` (regenerable) o excluirlo del empaquetado; decision del propietario',
  },
];

// -- ALLOWLIST DE CREDENCIALES POR DECISION DEL PROPIETARIO (t33 · ADN_PIN.json)
//    Solo para el path exacto del ADN canonico. Degrada A2-A6 a ALLOWLIST, pero
//    A1 (JSON valido) y A7 (contrato del consumidor) siguen siendo FATALES.
const CREDENTIAL_ALLOWLIST = [
  {
    id: 'waiver-adn-ssot',
    rel: 'IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json',
    why: 'SSOT exacto del export del Excel (LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json), decision del propietario; compensado con rotacion de las 5 parejas y proteccion de la ruta',
    ref: '_vps_stage/lab/ADN_PIN.json (seccion credentials_policy) · sha256 099A1707... · 280.065 B',
    measured: { fecha: '2026-10-25', por: 't33/t34', ocurrencias: 22 },
    action: 'rotacion de credenciales (propietario) + no exponer el path',
    keepsFatal: 'A1 (JSON valido) y A7 (contrato del consumidor) siguen siendo FATALES para este path',
    breakdown: '27 registros = 22 valores + 5 resumenes de objeto (8 servers[].username|password + 2 placeholders_map + 12 headerOverrides Proxy-Authorization/X-Auth-Stub-Basic en P0..P5)',
  },
];

// -- DEUDA TECNICA: vacia desde t34. El mecanismo se conserva para declarar
//    nuevas deudas puntuales, pero por defecto todo hallazgo es FATAL.
const DEBT = [];

const MAX_JSON_PARSE_BYTES = 40 * 1024 * 1024;
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.htm', '.json', '.php', '.py', '.sh', '.txt', '.md', '.css',
  '.log', '.env', '.ini', '.conf', '.yml', '.yaml', '.xml', '.sql', '.csv', '.ts', '.jsx', '.tsx', '.vue', '.htaccess',
  '.m3u', '.m3u8', '.ps1', '.psm1', '.bat', '.cmd', '.toml']);
const TEXT_NAME_RE = /\.(download|bak|backup|old|orig|save|copy|tmp)$/i;
const skippedByExt = new Map();

const findings = [];   // { level:'FAIL'|'ALLOWLIST'|'DEBT'|'WARN'|'SKIP', file, where, detail }
const assertions = [];
let filesAnalizados = 0;

const record = (level, file, where, detail) => findings.push({ level, file, where, detail });
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');

// -- clasificacion de valores -----------------------------------------------
const REDACTION_OK = [
  /^\*{1,}\s*REDACTED\s*\*{0,}$/i,
  /^<redacted>$/i, /^\[redacted\]$/i, /^redacted$/i,
  /^\$\{[^}]+\}$/, /^\{[^}]+\}$/,
  /^%[A-Z0-9_]+%$/, /^__[A-Z0-9_]+__$/, /^x{6,}$/i,
  /^placeholder/i, /^changeme$/i, /^your[_-][a-z0-9_-]+$/i, /^example/i,
  /^getenv\(/i, /^env:/i, /^process\.env/i,
];
const isRedacted = (v) => {
  if (typeof v !== 'string') return true;
  const s = v.trim();
  return s.length === 0 || REDACTION_OK.some((re) => re.test(s));
};

/**
 * Clave de credencial = token EXACTO (evita falsos positivos con nombres de
 * cabecera tipo `X-User-Initiated-Window-Ms`, `Sec-CH-UA`, `X-Pass-Through`).
 * Admite el estilo placeholder `{server.username}` / `server.password`.
 */
const CRED_TOKENS = new Set(['user', 'username', 'user name', 'usr', 'login', 'pass', 'password', 'passwd', 'pwd',
  'credential', 'credentials', 'creds', 'secret', 'secret key', 'api key', 'access token', 'auth token',
  'owner token', 'token']);
function isCredKey(key) {
  const raw = String(key).trim();
  if (/user[_.\- ]?agent/i.test(raw)) return false;
  const norm = raw
    .replace(/^[{[%]+/, '').replace(/[}\]%]+$/, '')
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  if (CRED_TOKENS.has(norm)) return true;
  const parts = norm.split(' ');
  if (parts.length === 2 && ['server', 'srv', 'auth', 'proxy', 'provider', 'account'].includes(parts[0])) {
    return CRED_TOKENS.has(parts[1]);
  }
  return false;
}

const CRED_URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>/@]+:[^\s"'<>/@]+@/i;
const BASIC_RE = /^Basic\s+([A-Za-z0-9+/=]{4,})$/i;
const BEARER_RE = /^Bearer\s+([A-Za-z0-9._\-+/=]{16,})$/i;

function isBasicCredential(v) {
  if (typeof v !== 'string') return false;
  const m = BASIC_RE.exec(v.trim());
  if (!m) return false;
  try {
    const dec = Buffer.from(m[1], 'base64').toString('utf8');
    return /^[\x20-\x7e]+$/.test(dec) && dec.indexOf(':') > 0 && dec.indexOf(':') < dec.length - 1;
  } catch (e) { return false; }
}
const isBearerToken = (v) => typeof v === 'string' && BEARER_RE.test(v.trim());

// -- inspeccion estructural de un documento JSON ----------------------------
function inspectJsonStructure(doc, file) {
  let credPairs = 0, basicHits = 0, bearerHits = 0;

  const walk = (node, p, depth) => {
    if (depth > 30 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, p + '[' + i + ']', depth + 1)); return; }
    let credFields = 0;
    const plainCredKeys = [];
    for (const [k, v] of Object.entries(node)) {
      if (isCredKey(k) && typeof v === 'string' && !isRedacted(v)) {
        credFields++; plainCredKeys.push(k);
        record('FAIL', file, (p ? p + '.' : '') + k, 'credencial en claro (len=' + v.length + ')');
      }
      if (typeof v === 'string') {
        if (isBasicCredential(v)) { basicHits++; record('FAIL', file, (p ? p + '.' : '') + k, 'auth literal Basic con usuario:contrasena (len=' + v.length + ')'); }
        else if (isBearerToken(v)) { bearerHits++; record('WARN', file, (p ? p + '.' : '') + k, 'token Bearer literal (len=' + v.length + ') - revisar'); }
        if (CRED_URL_RE.test(v)) record('FAIL', file, (p ? p + '.' : '') + k, 'URI con credenciales embebidas (len=' + v.length + ')');
      } else if (v && typeof v === 'object') walk(v, (p ? p + '.' : '') + k, depth + 1);
    }
    if (credFields >= 2) { credPairs++; record('FAIL', file, p || '<root>', 'objeto con ' + credFields + ' campos de credencial en claro: ' + plainCredKeys.join(',')); }
  };
  walk(doc, '', 0);
  return { credPairs, basicHits, bearerHits };
}

// -- A7: contrato del consumidor (ape-lab-import-helper.js + importFromLABData)
function assertConsumerContract(doc, file) {
  const REQUIRED = ['profiles_calibrated', 'nivel1_directives', 'nivel3_per_layer', 'servers',
    'evasion_pool', 'config_global', 'placeholders_map', 'lab_version', 'bulletproof'];
  const missing = REQUIRED.filter((k) => !(k in doc));
  if (missing.length) record('FAIL', file, '<root>', 'faltan claves que consume el importador: ' + missing.join(','));

  if (!(/^omega_/i.test(String(doc.lab_version || '')) || doc.bulletproof === true)) {
    record('FAIL', file, 'lab_version|bulletproof', 'el importador rechazaria el DNA (schema no soportado)');
  }
  const profs = doc.profiles_calibrated;
  if (!profs || typeof profs !== 'object' || Object.keys(profs).length < 1) {
    record('FAIL', file, 'profiles_calibrated', 'sin perfiles: importFromLABData fallaria');
  }
  if (!Array.isArray(doc.servers)) record('FAIL', file, 'servers', 'ya no es un array');
  else doc.servers.forEach((s, i) => {
    if (!s || typeof s !== 'object') { record('FAIL', file, 'servers[' + i + ']', 'no es objeto'); return; }
    const absent = ['base_url', 'username', 'password', 'note'].filter((k) => !(k in s));
    if (absent.length) record('FAIL', file, 'servers[' + i + ']', 'claves perdidas: ' + absent.join(','));
  });

  const pm = doc.placeholders_map;
  if (!pm || typeof pm !== 'object' || Object.keys(pm).length === 0) record('FAIL', file, 'placeholders_map', 'vacio o ausente (romperia el generador)');
  else for (const k of ['{server.username}', '{server.password}']) {
    if (!(k in pm)) record('FAIL', file, 'placeholders_map[' + JSON.stringify(k) + ']', 'placeholder eliminado (el generador lo sustituye)');
  }

  const ep = doc.evasion_pool;
  if (!ep || typeof ep !== 'object' || !Array.isArray(ep.user_agents) || !Array.isArray(ep.referers)) {
    record('FAIL', file, 'evasion_pool', 'forma esperada {user_agents[], referers[]} perdida');
  }
}

// -- recorrido --------------------------------------------------------------
const allowFor = (r) => ALLOWLIST.find((a) => a.match(r));
const debtFor = (r) => DEBT.find((d) => r === d.rel || r.endsWith('/' + d.rel));

const DEBT_LINE_RULES = [
  { name: 'asignacion usuario/contrasena', re: /\b(username|user|password|passwd|pass|pwd|login|owner_token|api_key|secret_key|secret)\b\s*['"]?\s*[:=]\s*['"][^'"]{3,}['"]/i },
  { name: 'fila de origen host/usuario/contrasena', re: /^\s*\[\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]/ },
];
const DEBT_MODE_GUARD = /\b(mode|type|strategy|policy|enabled)\b\s*[:=]/i;
function debtLineRule(line) {
  for (const r of DEBT_LINE_RULES) {
    if (!r.re.test(line)) continue;
    if (DEBT_MODE_GUARD.test(line) && !/\b(password|passwd|pwd|owner_token)\b/i.test(line)) continue;
    return r;
  }
  return null;
}

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { record('SKIP', rel(dir), '-', 'no legible: ' + e.code); return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    const rp = rel(fp);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const al = allowFor(rp + '/');
      if (al) { record('ALLOWLIST', rp + '/', '-' + al.id, al.why); continue; }
      walk(fp);
      continue;
    }
    if (!e.isFile()) continue;

    const ext = path.extname(e.name).toLowerCase();
    let size = 0;
    try { size = fs.statSync(fp).size; } catch { continue; }
    const debt = debtFor(rp);

    const al = allowFor(rp);
    if (al) { record('ALLOWLIST', rp, '-' + al.id, al.why + ' - size=' + size); continue; }

    if (ext === '.json') {
      if (size > MAX_JSON_PARSE_BYTES) { record('SKIP', rp, '-', 'JSON > ' + MAX_JSON_PARSE_BYTES + ' B'); continue; }
      let doc;
      try { doc = JSON.parse(fs.readFileSync(fp, 'utf8')); }
      catch (err) { record('FAIL', rp, '-', 'JSON invalido: ' + err.message); continue; }

      const mark = findings.length;
      inspectJsonStructure(doc, rp);
      filesAnalizados++;
      if (/^lab_master.*\.json$/i.test(e.name)) assertConsumerContract(doc, rp);

      const credAl = CREDENTIAL_ALLOWLIST.find((c) => c.rel === rp);
      if (credAl) {
        let degradados = 0;
        for (let i = mark; i < findings.length; i++) {
          if (findings[i].level !== 'FAIL') continue;
          if (!/credencial en claro|auth literal Basic|URI con credenciales|objeto con \d+ campos/.test(findings[i].detail)) continue;
          findings[i].level = 'ALLOWLIST';
          findings[i].detail = findings[i].detail + ' [' + credAl.id + ']';
          degradados++;
        }
        record('ALLOWLIST', rp, '-' + credAl.id, 'ADN canonico pinneado · ' + degradados + ' registro(s) degradados a allowlist (cubren los 22 valores declarados en ADN_PIN)');
      }

      if (debt) {
        for (let i = mark; i < findings.length; i++) {
          if (findings[i].level === 'FAIL') { findings[i].level = 'DEBT'; findings[i].detail += ' - fuera de inScope (' + debt.rel + ')'; }
        }
        record('DEBT', rp, debt.where, debt.why);
      }
      continue;
    }

    const isText = TEXT_EXT.has(ext) || TEXT_NAME_RE.test(e.name) || /\.bak_/i.test(e.name) || /\.backup/i.test(e.name);
    if (isText) {
      let txt;
      try { txt = fs.readFileSync(fp, 'utf8'); } catch { continue; }
      filesAnalizados++;
      const lines = txt.split(/\r\n|\r|\n/);
      for (let i = 0; i < lines.length; i++) {
        if (CRED_URL_RE.test(lines[i])) record(debt ? 'DEBT' : 'FAIL', rp, 'L' + (i + 1), 'URI con credenciales embebidas (len_linea=' + lines[i].length + ')');
        if (debt) {
          const rule = debtLineRule(lines[i]);
          if (rule) record('DEBT', rp, 'L' + (i + 1), '[' + rule.name + '] fuera de inScope');
        }
      }
      if (debt && !findings.some((f) => f.file === rp && f.level === 'DEBT')) record('DEBT', rp, debt.where, debt.why);
    } else {
      const key = ext || '(sin extension)';
      skippedByExt.set(key, (skippedByExt.get(key) || 0) + 1);
    }
  }
}

// -- selftest ---------------------------------------------------------------
function selftest() {
  const cases = [];
  const run = (fixture) => { const n = findings.length; inspectJsonStructure(fixture, '<fixture>'); return findings.slice(n).filter((f) => f.level === 'FAIL').length; };

  cases.push({ name: 'servers[] en claro detectado', ok: run({ servers: [{ base_url: 'http://h:80', username: 'usuarioReal1', password: 'claveReal1', note: 'x' }] }) >= 2 });
  cases.push({ name: 'marcadores aceptados sin falso positivo', ok: run({ servers: [{ base_url: 'http://h:80', username: '***REDACTED***', password: '${SRV_PASS}', note: 'x' }] }) === 0 });
  cases.push({ name: 'referencias getenv()/env: aceptadas', ok: run({ servers: [{ base_url: 'http://h:80', username: 'getenv(APE_USER)', password: 'env:APE_PASS', note: 'x' }] }) === 0 });
  cases.push({ name: 'nombres de cabecera NO son credenciales (anti falso positivo)', ok: run({ headers: { 'X-User-Initiated-Window-Ms': '5000', 'Sec-CH-UA': 'chromium', 'X-Pass-Through': 'true', 'User-Agent': 'ok' } }) === 0 });
  cases.push({ name: 'auth literal Basic usuario:contrasena detectado', ok: run({ h: { 'Proxy-Authorization': 'Basic ' + Buffer.from('usuarioReal1:claveReal1').toString('base64') } }) === 1 });
  cases.push({ name: 'URI con credenciales detectada', ok: run({ u: 'http://usuario:clave@host/x' }) >= 1 });
  return cases;
}

// -- ejecucion --------------------------------------------------------------
if (SELFTEST) {
  const cases = selftest();
  console.log('======================================================================');
  console.log(' H8 / C7 / T34 - SELFTEST DE DETECCION (fixtures en memoria)');
  console.log('======================================================================');
  for (const c of cases) console.log((c.ok ? ' [PASS] ' : ' [FAIL] ') + c.name);
  const ok = cases.every((c) => c.ok);
  console.log('\n' + (ok ? '[H8-GATE] SELFTEST OK - los detectores no son vacios.' : '[H8-GATE] SELFTEST FALLO.'));
  process.exit(ok ? 0 : 1);
}

if (!fs.existsSync(FRONTEND)) {
  console.error('[H8-GATE] FATAL: no existe ' + rel(FRONTEND));
  process.exit(1);
}

walk(FRONTEND);

const fatal = findings.filter((f) => f.level === 'FAIL' || (STRICT && f.level === 'DEBT'));
const debt = findings.filter((f) => f.level === 'DEBT');
const allow = findings.filter((f) => f.level === 'ALLOWLIST');
const warn = findings.filter((f) => f.level === 'WARN');
const skip = findings.filter((f) => f.level === 'SKIP');

const has = (re) => findings.some((f) => f.level === 'FAIL' && re.test(f.detail));
assertions.push({ id: 'A1 - DNA del LAB parsea', ok: !has(/JSON invalido/) });
assertions.push({ id: 'A2/A3/A4 - sin credenciales en claro en bloques servibles', ok: !has(/credencial en claro|objeto con \d+ campos/) });
assertions.push({ id: 'A5 - sin auth literal Basic usuario:contrasena', ok: !has(/auth literal Basic/) });
assertions.push({ id: 'A6 - sin URIs scheme://user:pass@ en texto servible', ok: !has(/URI con credenciales/) });
assertions.push({ id: 'A7 - contrato del consumidor intacto en el DNA', ok: !has(/importador|placeholders_map|evasion_pool|servers\[|profiles_calibrated|no es array|ya no es un array/) });

if (AS_JSON) {
  console.log(JSON.stringify({
    strict: STRICT, ok: fatal.length === 0,
    counts: { fail: findings.filter((f) => f.level === 'FAIL').length, debt: debt.length, allowlist: allow.length, warn: warn.length, skip: skip.length },
    allowlistPolicy: ALLOWLIST.map((a) => ({ id: a.id, why: a.why, measured: a.measured, method: a.method, action: a.action })),
    credentialAllowlist: CREDENTIAL_ALLOWLIST.map((c) => ({ id: c.id, rel: c.rel, why: c.why, ref: c.ref, measured: c.measured, action: c.action, keepsFatal: c.keepsFatal, breakdown: c.breakdown })),
    ciCommand: 'node _vps_stage/tests/secret_scan_assert.js --strict',
    findings, assertions,
  }, null, 2));
} else {
  console.log('======================================================================');
  console.log(' H8 / C7 / T34 - GATE DE CREDENCIALES EN EL ARBOL SERVIDO' + (STRICT ? '  [MODO STRICT - CI]' : ''));
  console.log(' raiz analizada: ' + rel(FRONTEND));
  console.log('======================================================================');
  for (const a of assertions) console.log((a.ok ? ' [PASS] ' : ' [FAIL] ') + a.id);

  const fails = findings.filter((f) => f.level === 'FAIL');
  console.log('\n- VIOLACIONES FATALES: ' + fails.length + ' -');
  if (!fails.length) console.log('   (ninguna)');
  for (const f of fails) console.log('   x ' + f.file + '  ' + f.where + '  ' + f.detail);

  if (debt.length) {
    console.log('\n- DEUDA TECNICA' + (STRICT ? ' (FATAL en --strict)' : '') + ': ' + debt.length + ' -');
    for (const d of debt) console.log('   - ' + d.file + '  ' + d.where + '  ' + d.detail);
  }

  console.log('\n- ALLOWLIST EXPLICITA (deuda aceptada; NUNCA fatal, tampoco en --strict): ' + allow.length + ' registro(s) -');
  for (const a of ALLOWLIST) {
    const hits = allow.filter((x) => (x.where || '').includes(a.id));
    console.log('   - ' + a.id + '  ->  ' + hits.length + ' ruta(s)');
    for (const h of hits) console.log('       * ' + h.file + '  ' + h.detail);
    console.log('       motivo: ' + a.why);
    console.log('       medicion ' + a.measured.fecha + ' (' + a.measured.por + '): ' + a.measured.ocurrencias +
      ' coincidencias - ' + a.measured.ficheros + ' fichero(s) - ' + a.measured.bytes + ' B');
    console.log('       metodo: ' + a.method);
    console.log('       accion requerida: ' + a.action);
  }

  if (CREDENTIAL_ALLOWLIST.length) {
    console.log('\n- ALLOWLIST DE CREDENCIALES POR DECISION DEL PROPIETARIO (degrada A2-A6; A1/A7 siguen fatales) -');
    for (const c of CREDENTIAL_ALLOWLIST) {
      const hits = allow.filter((x) => (x.where || '').includes(c.id));
      console.log('   - ' + c.id + '  ->  ' + c.rel + '  (' + hits.length + ' registro)');
      for (const h of hits) console.log('       * ' + String(h.where).replace(/^-/, '') + '  ' + h.detail);
      console.log('       motivo: ' + c.why);
      console.log('       referencia: ' + c.ref);
      console.log('       medicion ' + c.measured.fecha + ' (' + c.measured.por + '): ' + c.measured.ocurrencias + ' valores en claro');
      console.log('       accion requerida: ' + c.action);
      if (c.keepsFatal) console.log('       nota: ' + c.keepsFatal);
      if (c.breakdown) console.log('       desglose: ' + c.breakdown);
    }
  }

  if (warn.length) { console.log('\n- AVISOS: ' + warn.length + ' -'); for (const w of warn) console.log('   - ' + w.file + '  ' + w.where + '  ' + w.detail); }
  if (skip.length) { console.log('\n- OMITIDOS: ' + skip.length + ' -'); for (const s of skip) console.log('   - ' + s.file + '  ' + s.detail); }

  const noAnalizados = [...skippedByExt.values()].reduce((a, b) => a + b, 0);
  console.log('\n- COBERTURA: ' + filesAnalizados + ' fichero(s) analizados - ' + noAnalizados + ' no analizados (no textuales/binarios) -');
  if (noAnalizados) for (const [k, v] of [...skippedByExt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log('   - ' + k + ': ' + v);

  console.log('\n- CI: `node _vps_stage/tests/secret_scan_assert.js --strict` (exit 0 obligatorio) -');
  console.log('\n' + (fatal.length === 0
    ? '[H8-GATE] OK - arbol servible limpio (inScope t34) + allowlist de canales/estado declarada y cuantificada.'
    : '[H8-GATE] FALLO - ' + fatal.length + ' hallazgo(s) fatal(es).'));
  console.log('RECORDATORIO: este gate NO des-leakea. La rotacion de las 5 parejas es la unica accion que cierra el riesgo (decision del propietario).');
  console.log('garantia: no se imprimen valores sensibles (solo ruta/campo/linea/longitud/conteos).');
}

process.exit(fatal.length === 0 ? 0 : 1);