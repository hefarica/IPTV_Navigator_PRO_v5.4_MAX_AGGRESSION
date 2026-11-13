// test_conviva_auth.js — demuestra la logica del parche D-2.
//
// QUE HACE, EN ORDEN:
//   1. Comprueba si hay un runtime PHP. En este entorno NO lo hay: se declara.
//   2. `git apply --check` sobre el REPO REAL: prueba de aplicabilidad hecha por
//      git mismo, sin escribir nada.
//   3. Aplica el parche a una COPIA TEMPORAL (_proof/) con un replay determinista
//      del diff, y comprueba que lo insertado coincide EXACTAMENTE con las lineas
//      '+' del parche.
//   4. Analisis estatico del guard en la copia parcheada + anti-drift: extrae de
//      la propia copia la variable de entorno y el minimo de longitud, y los usa
//      en el port para que no pueda derivar.
//   5. Port fiel del guard a JS y ejecucion de los casos (401/401/pasa/503).
//
// TRAMPA DOCUMENTADA (medida hoy): `git apply --directory=<dir> <patch>` imprime
// "Skipped patch '<path>'" y devuelve **exit 0** sin aplicar nada. Un exit 0 que
// no comprueba el resultado da por aplicado un parche que no se aplico. Por eso
// aqui el replay verifica el CONTENIDO resultante, no el codigo de salida.
//
// LIMITE DECLARADO: PHP no esta instalado, asi que los casos NO corren sobre PHP;
// corren sobre un port que replica el guard con las constantes del fichero.
//
// NUNCA imprime el valor de un secreto: usa un token FICTICIO.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const REL = 'IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php';
const ORIG = path.join(REPO, REL);
const PATCH = path.join(HERE, '0002-conviva-auth.patch');
const PROOF = path.join(HERE, '_proof');

const FICTICIO = 'FICTICIO_no_es_el_real_0123456789';   // token de mentira, nunca el real

const results = [];
const limits = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}
// Un LIMITE no es un fallo: se declara y no altera el veredicto. Lo que no se puede
// hacer es callarlo ni contarlo como PASS (seria un falso verde).
function limit(name, detail) {
  limits.push({ name, detail });
  console.log('LIMITE ' + name + (detail ? '   [' + detail + ']' : ''));
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

console.log('== 0. runtime PHP ==');
let phpInfo = null;
try {
  phpInfo = execFileSync('php', ['-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')[0];
  console.log('   PHP presente: ' + phpInfo.trim());
} catch (e) {
  limit('PHP no disponible en este host',
    'php no esta en PATH: los casos de comportamiento corren sobre un PORT en JS, no sobre PHP');
}

console.log('\n== 1. estado del repo ANTES ==');
const origBytes = fs.readFileSync(ORIG);
const shaBefore = sha256(origBytes);
console.log('   ' + REL);
console.log('   bytes=' + origBytes.length + ' sha256=' + shaBefore);

console.log('\n== 2. git apply --check sobre el REPO REAL (sin escribir) ==');
let checkOk = false, statTxt = '';
try {
  execFileSync('git', ['apply', '--check', PATCH], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  checkOk = true;
} catch (e) { statTxt = (e.stderr || e.message).trim(); }
check('git apply --check exit 0', checkOk, statTxt);
try {
  statTxt = execFileSync('git', ['apply', '--stat', PATCH], { cwd: REPO, encoding: 'utf8' }).trim();
  console.log('   ' + statTxt.split('\n').join('\n   '));
} catch (e) { console.log('   (stat fallo)'); }

console.log('\n== 2b. trampa: git apply --directory NO aplica y aun asi devuelve 0 ==');
fs.rmSync(PROOF, { recursive: true, force: true });
const COPY = path.join(PROOF, 'repo', REL);
fs.mkdirSync(path.dirname(COPY), { recursive: true });
fs.writeFileSync(COPY, origBytes);
let dirOut = '', dirCode = 0;
try {
  dirOut = execFileSync('git', ['apply', '--directory=_proof/repo', '--verbose', PATCH], {
    cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
} catch (e) { dirCode = e.status || 1; dirOut = (e.stderr || e.message).trim(); }
const copyAfterDir = sha256(fs.readFileSync(COPY));
check('--directory devuelve 0 PERO no modifica la copia (trampa reproducida)',
  dirCode === 0 && copyAfterDir === shaBefore,
  'exit=' + dirCode + ' salida="' + (dirOut.split('\n').pop() || '(vacia)') + '"');

console.log('\n== 3. replay determinista del parche sobre la copia temporal ==');
const patchLines = fs.readFileSync(PATCH, 'utf8').split(/\r?\n/);
const origLines = origBytes.toString('utf8').split(/\r?\n/);
const addedExpected = patchLines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));

// construir la copia parcheada aplicando los hunks
const outLines = [];
let cursor = 0, added = [];
const hunks = [];
for (let i = 0; i < patchLines.length; i++) {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(patchLines[i]);
  if (m) {
    const h = { oldStart: +m[1], oldCount: m[2] === undefined ? 1 : +m[2], body: [] };
    for (let j = i + 1; j < patchLines.length; j++) {
      const l = patchLines[j];
      if (/^@@ /.test(l) || /^diff --git /.test(l)) break;
      if (l === '' ) continue;                    // linea vacia del propio fichero patch
      h.body.push(l);
    }
    hunks.push(h);
  }
}
for (const h of hunks) {
  const start = h.oldStart - 1;
  while (cursor < start) { outLines.push(origLines[cursor]); cursor++; }
  for (const l of h.body) {
    const tag = l[0], rest = l.slice(1);
    if (tag === ' ') { outLines.push(origLines[cursor]); cursor++; }
    else if (tag === '-') { cursor++; }
    else if (tag === '+') { outLines.push(rest); added.push(rest); }
  }
}
while (cursor < origLines.length) { outLines.push(origLines[cursor]); cursor++; }

const patched = outLines.join('\r\n');
fs.mkdirSync(PROOF, { recursive: true });
fs.writeFileSync(path.join(PROOF, 'conviva-event.patched.php'), patched, 'utf8');
const shaPatched = sha256(Buffer.from(patched, 'utf8'));

check('el replay inserta lineas', added.length > 0, added.length + ' lineas anadidas');
check('lo insertado coincide con las lineas + del parche', JSON.stringify(added) === JSON.stringify(addedExpected));
check('la copia parcheada DIFIERE del original', shaPatched !== shaBefore, '+' + (patched.length - origBytes.length) + ' B');
console.log('   copia: ' + path.relative(HERE, path.join(PROOF, 'conviva-event.patched.php')) + '  sha256=' + shaPatched);

console.log('\n== 4. el repo real sigue intacto ==');
check('sha256 del repo real sin cambios', sha256(fs.readFileSync(ORIG)) === shaBefore, shaBefore.slice(0, 16) + '...');

console.log('\n== 5. analisis estatico del guard (copia parcheada) ==');
const patchedLines = patched.split(/\r?\n/);
const codeOnly = (txt) => txt.split(/\r?\n/).filter((l) => {
  const t = l.trim();
  return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}).join('\n');
const origCode = codeOnly(origBytes.toString('utf8'));
const patchCode = codeOnly(patched);

check('el ORIGINAL no valida credencial (sin hash_equals en codigo)', !origCode.includes('hash_equals'));
check('el ORIGINAL no lee secreto del entorno', !origCode.includes('getenv('));
check('el PARCHADO usa hash_equals (tiempo constante)', patchCode.includes('hash_equals($convivaExpected, $convivaGiven)'));

const envVar = (patched.match(/getenv\('([A-Z_]+)'\)/) || [])[1];
const minLen = Number((patched.match(/strlen\(\$convivaExpected\)\s*<\s*(\d+)/) || [])[1]);
check('lee el secreto de una variable de entorno', !!envVar, envVar || 'no encontrada');
check('exige longitud minima', Number.isFinite(minLen) && minLen > 0, 'min=' + minLen);
check('503 fail-closed cuando falta el secreto', /http_response_code\(503\)[\s\S]{0,200}?conviva_auth_disabled/.test(patched));
check('401 cuando no coincide', /http_response_code\(401\)[\s\S]{0,120}?'unauthorized'/.test(patched));
check('acepta el esquema Bearer', /stripos\(\$convivaAuthz,\s*'Bearer '\)/.test(patched));

const iMethod = patchedLines.findIndex((l) => l.includes("if ($method !== 'POST') {"));
const iAuth = patchedLines.findIndex((l) => l.includes("getenv('" + (envVar || 'X') + "')"));
const iBody = patchedLines.findIndex((l) => l.includes("file_get_contents('php://input')"));
check('orden 405 -> auth -> body', iMethod > -1 && iAuth > iMethod && iBody > iAuth,
  'metodo=' + (iMethod + 1) + ' auth=' + (iAuth + 1) + ' body=' + (iBody + 1));

console.log('\n== 6. comportamiento: PORT fiel del guard (NO es PHP) ==');
function guard(req, env) {
  if (req.method !== 'POST') return { code: 405, error: 'method_not_allowed' };
  const expected = env[envVar];
  if (typeof expected !== 'string' || expected.length < minLen) return { code: 503, error: 'conviva_auth_disabled' };
  let authz = req.headers.Authorization || req.headers.authorization || '';
  authz = String(authz).trim();
  let given = '';
  if (authz.toLowerCase().startsWith('bearer ')) given = authz.slice(7).trim();
  if (given === '' || given !== expected) return { code: 401, error: 'unauthorized' };
  return { code: 200, pass: true };
}

const ENV_OK = { [envVar]: FICTICIO };
const cases = [
  ['sin cabecera Authorization            -> 401', { method: 'POST', headers: {} }, ENV_OK, 401],
  ['cabecera con token incorrecto         -> 401', { method: 'POST', headers: { Authorization: 'Bearer token_que_no_es' } }, ENV_OK, 401],
  ['cabecera con token correcto           -> pasa', { method: 'POST', headers: { Authorization: 'Bearer ' + FICTICIO } }, ENV_OK, 200],
  ['secreto del servidor no configurado   -> 503', { method: 'POST', headers: { Authorization: 'Bearer ' + FICTICIO } }, {}, 503],
  ['secreto del servidor demasiado corto  -> 503', { method: 'POST', headers: { Authorization: 'Bearer ' + FICTICIO } }, { [envVar]: 'corto' }, 503],
  ['esquema Basic en vez de Bearer        -> 401', { method: 'POST', headers: { Authorization: 'Basic ' + FICTICIO } }, ENV_OK, 401],
  ['Bearer vacio                          -> 401', { method: 'POST', headers: { Authorization: 'Bearer ' } }, ENV_OK, 401],
  ['GET no llega a la auth (405 primero)  -> 405', { method: 'GET', headers: {} }, {}, 405]
];
for (const [name, req, env, want] of cases) {
  const got = guard(req, env);
  check(name, got.code === want, 'observado=' + got.code + ' esperado=' + want);
}

console.log('\n== 7. cierre: el repo real sigue intacto ==');
check('sha256 final del repo real', sha256(fs.readFileSync(ORIG)) === shaBefore, shaBefore.slice(0, 16) + '...');
try {
  const st = execFileSync('git', ['status', '--porcelain', '--', REL], { cwd: REPO, encoding: 'utf8' }).trim();
  check('git status del objetivo limpio', st === '', st || 'sin cambios');
} catch (e) { check('git status del objetivo limpio', false, e.message); }

const fails = results.filter((r) => !r.ok);
console.log('\n================ RESUMEN ================');
console.log('comprobaciones: ' + results.length + '   fallos: ' + fails.length + '   limites declarados: ' + limits.length);
for (const l of limits) console.log('LIMITE: ' + l.name + ' -> ' + l.detail);
console.log(fails.length === 0 ? 'RESULTADO: PASS' : 'RESULTADO: FAIL');
process.exit(fails.length === 0 ? 0 : 1);
