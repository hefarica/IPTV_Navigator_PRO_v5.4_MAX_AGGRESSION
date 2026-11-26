#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * CONTRATO DE LAS 61 RUTAS DEL MOTOR JIT (gate de CI)
 *
 * POR QUE EXISTE (2026-11-21)
 *   El inventario de R1 (artifacts/verify/jit_routes_61.json) era un INFORME: se podia
 *   borrar una ruta de server.js, cambiarle el metodo o añadir una ruta nueva, y ningun
 *   gate lo detectaba. Este test convierte ese informe en CONTRATO:
 *     - si DESAPARECE una ruta declarada            -> FALLA y la NOMBRA
 *     - si APARECE una ruta que el inventario no tiene -> FALLA y la NOMBRA (para que nadie
 *       añada superficie sin declararla)
 *     - si CAMBIA el metodo declarado                -> FALLA y NOMBRA ruta + metodo
 *
 * QUE ES "EL MOTOR": el server.js CANONICO es
 *   IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
 * (hay otras dos copias en el arbol: vps/ape-jit/server.js y tools/lab/ape-jit/server.js;
 *  con la vieja salen 59 guardas, no 61 - medido en R1). Aqui solo se lee el canonico.
 *
 * COMO SE DERIVA EL METODO (regla explicita, no heuristica suelta)
 *   Para cada ruta se miran TODOS sus guardas `pathname === '<ruta>'` y su tramo de codigo
 *   (desde la guarda hasta la siguiente guarda de otra ruta, con techo de 400 lineas):
 *     - guarda con `&& req.method === 'POST'`        -> soporta POST
 *     - guarda DESNUDA (sin condicion de metodo)     -> soporta cualquier metodo (GET incluido)
 *     - `req.method === 'GET'` en el tramo           -> soporta GET
 *     - `req.method === 'POST'` en el tramo          -> soporta POST
 *     - `req.method !== 'POST'` en el tramo          -> soporta POST (rechaza el resto)
 *   Direccion del contrato: se exige que TODO metodo DECLARADO siga teniendo evidencia.
 *   Si el codigo tiene MAS metodos que el inventario (p.ej. el inventario dice ANY y el codigo
 *   ya filtra), NO se falla: se avisa. Una ruta que pasa de ANY a restringida no es una
 *   regresion de superficie, y marcarla en rojo bloquearia el CI por una mejora.
 *   Caso conocido y declarado: `/image/capacity` esta en el inventario como ANY porque su rama
 *   es MUERTA (L9518 ya devuelve antes de L9521); el codigo tiene GET/POST en el tramo.
 *
 * DETERMINISTA Y SIN EFECTOS
 *   No toca red, no escribe, no ejecuta el motor. Si falta el inventario FALLA con
 *   "falta el inventario" (nunca lo salta): el contrato no existe sin inventario.
 *
 * USO
 *   node tools/quality/test_jit_routes_contract.js
 *   node tools/quality/test_jit_routes_contract.js --server <ruta a un server.js>   (pruebas)
 *   APE_JIT_SERVER=<ruta>  APE_JIT_ROUTES_JSON=<ruta>
 *   --quiet   solo errores
 *
 * SALIDA: 0 = contrato cumplido · 1 = contrato roto (o falta el inventario) · 2 = uso/IO
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER_DEFAULT = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'vps', 'ape-jit', 'server.js');
const INVENTORY_DEFAULT = path.join(ROOT, 'artifacts', 'verify', 'jit_routes_61.json');

/** Techo del tramo que se inspecciona tras una guarda (lineas). */
const SPAN_CAP = 400;

const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const argServer = (() => {
  const i = argv.indexOf('--server');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find(a => a.startsWith('--server='));
  return eq ? eq.slice('--server='.length) : null;
})();
const SERVER = path.resolve(argServer || process.env.APE_JIT_SERVER || SERVER_DEFAULT);
const INVENTORY = path.resolve(process.env.APE_JIT_ROUTES_JSON || INVENTORY_DEFAULT);

function log(s) { if (!quiet) console.log(s); }
function fail(title, details) {
  console.error('\nCONTRATO ROTO: ' + title);
  for (const d of details) console.error('  - ' + d);
}

// ── 1. inventario (fuente de verdad). Sin inventario NO hay contrato ──────────
if (!fs.existsSync(INVENTORY)) {
  console.error('CONTRATO ROTO: falta el inventario');
  console.error('  esperado: ' + INVENTORY);
  console.error('  sin inventario no hay contrato que vigilar: NO se salta el test.');
  process.exit(1);
}
let inv;
try {
  inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
} catch (e) {
  console.error('CONTRATO ROTO: el inventario no es JSON valido (' + e.message + ')');
  process.exit(1);
}
if (!Array.isArray(inv.rows) || inv.rows.length === 0) {
  console.error('CONTRATO ROTO: el inventario no tiene filas (rows[])');
  process.exit(1);
}

if (!fs.existsSync(SERVER)) {
  console.error('CONTRATO ROTO: no existe el server.js canonico');
  console.error('  esperado: ' + SERVER);
  process.exit(2);
}
const raw = fs.readFileSync(SERVER);
const text = raw.toString('utf8');
const lines = text.split(/\r?\n/);
const sha = crypto.createHash('sha256').update(raw).digest('hex');

// ── 2. guardas reales del server ──────────────────────────────────────────────
/** pathname === '<ruta>'  (comillas simples o dobles). */
const GUARD_SRC = /pathname\s*===\s*(['"])([^'"]+)\1/g;
const guards = [];
lines.forEach((line, i) => {
  const re = new RegExp(GUARD_SRC.source, 'g');
  let m;
  while ((m = re.exec(line)) !== null) guards.push({ route: m[2], line: i + 1 });
});
const routesInCode = Array.from(new Set(guards.map(g => g.route))).sort();
const declared = inv.rows.map(r => r.route);
const declaredSet = new Set(declared);

if (!quiet) {
  console.log('== CONTRATO JIT: ' + declared.length + ' rutas declaradas ==');
  console.log('server.js   : ' + path.relative(ROOT, SERVER));
  console.log('sha256      : ' + sha + '  (' + raw.length + ' B, ' + lines.length + ' lineas)');
  if (inv.sha256 && inv.sha256 !== sha) {
    console.log('AVISO       : el sha256 del server.js NO coincide con el del inventario (' +
      String(inv.sha256).slice(0, 16) + '...). El contrato se evalua sobre el codigo ACTUAL.');
  }
  console.log('guardas     : ' + guards.length + ' ocurrencias, ' + routesInCode.length + ' rutas distintas');
  console.log('');
}

// ── 3. tramo de cada guarda y derivacion de metodos ──────────────────────────
function spanOf(g) {
  const next = guards.filter(x => x.line > g.line).map(x => x.line)[0] || (lines.length + 1);
  const end = Math.min(next - 1, g.line - 1 + SPAN_CAP);
  return lines.slice(g.line - 1, Math.max(g.line, end)).join('\n');
}
/**
 * Tramo de una guarda. Si el INVENTARIO grabo su fin (`end_lines`), se usa ese: es el tramo
 * que midio R1 y evita que una guarda vecina (p.ej. la rama muerta de /image/capacity en L9521)
 * recorte la evidencia de metodo de la anterior (/image/config pierde su POST de L9540).
 */
function spanFor(row, g) {
  // Se usa la LONGITUD del tramo que grabo el inventario, aplicada a la posicion ACTUAL de la
  // guarda. Con numeros de linea absolutos el contrato fallaba en falso en cuanto una edicion
  // insertaba una linea por encima (probado: N2 desplazaba todo +1 y "perdia" el POST de
  // /image/config). Con la longitud, el tramo es invariante al desplazamiento.
  if (!Array.isArray(row.guards) || !Array.isArray(row.end_lines)) return spanOf(g);
  const sameRoute = guards.filter(x => x.route === row.route);
  const idx = sameRoute.findIndex(x => x.line === g.line);
  if (idx < 0 || !Number.isFinite(row.guards[idx]) || !Number.isFinite(row.end_lines[idx])) return spanOf(g);
  const len = row.end_lines[idx] - row.guards[idx];
  if (len <= 0) return spanOf(g);
  return lines.slice(g.line - 1, Math.min(g.line - 1 + len, lines.length)).join('\n');
}
/**
 * Evidencia de metodo por ruta. OJO a la diferencia, que costo una prueba negativa (N3):
 * una guarda DESNUDA (sin condicion de metodo) demuestra que la ruta atiende GET, pero NO
 * demuestra que siga exigiendo POST. Si se exige POST y solo queda una guarda desnuda, la
 * ruta paso de "solo POST" a "cualquier metodo": eso ES un cambio de metodo y debe fallar.
 *   postEvidence = guarda o tramo con `=== 'POST'`, o tramo con `!== 'POST'`.
 *   getEvidence  = guarda o tramo con `=== 'GET'`, o una guarda desnuda.
 */
function methodsOf(row) {
  const route = row.route;
  const gs = guards.filter(g => g.route === route);
  let post = false, get = false, bare = false;
  for (const g of gs) {
    const guardLine = lines[g.line - 1] || '';
    if (/req\.method\s*===\s*'POST'/.test(guardLine)) post = true;
    if (!/req\.method/.test(guardLine)) bare = true;          // atiende cualquier metodo
    const span = spanFor(row, g);
    if (/req\.method\s*===\s*'GET'/.test(span)) get = true;
    if (/req\.method\s*===\s*'POST'/.test(span)) post = true;
    if (/req\.method\s*!==\s*'POST'/.test(span)) post = true; // rechaza no-POST => solo POST
  }
  return { post, get: get || bare, bare };
}

// ── 4. evaluacion del contrato ────────────────────────────────────────────────
const vanished = [];   // rutas declaradas que ya no tienen guarda
const appeared = [];   // rutas del codigo que el inventario no declara
const methodGone = []; // (ruta, metodo declarado) sin evidencia en el codigo
const methodWider = [];// aviso: el codigo restringe mas de lo declarado (no es fallo)

for (const row of inv.rows) {
  const hits = guards.filter(g => g.route === row.route);
  if (hits.length === 0) {
    const where = Array.isArray(row.guards) && row.guards.length ? ' (estaba en L' + row.guards.join(', L') + ')' : '';
    vanished.push(row.route + where);
    continue;
  }
  const ev = methodsOf(row);
  const decl = Array.isArray(row.methods) ? row.methods : [];
  if (decl.length === 1 && decl[0] === 'ANY') {
    // Una guarda DESNUDA ya significa "cualquier metodo": no es una restriccion.
    const restringido = ev.bare ? null
      : (ev.post && !ev.get) ? 'POST'
      : (!ev.post && ev.get) ? 'GET' : null;
    if (restringido) {
      methodWider.push(row.route + ': el inventario dice ANY y el codigo ya restringe a ' + restringido +
        ' (no es fallo: paso de abierto a filtrado)');
    }
    continue;
  }
  for (const m of decl) {
    if (m === 'ANY') continue;
    const has = (m === 'POST') ? ev.post : (m === 'GET') ? ev.get : true;
    if (!has) {
      methodGone.push(row.route + ': declara ' + decl.join('|') + ' y en el codigo NO hay evidencia de ' + m +
        (m === 'POST' && ev.bare ? ' (solo queda una guarda desnuda: paso a atender CUALQUIER metodo)' : ''));
    }
  }
}
for (const r of routesInCode) {
  if (!declaredSet.has(r)) {
    const first = guards.find(g => g.route === r);
    appeared.push(r + ' (L' + first.line + ')');
  }
}

// ── 5. veredicto ──────────────────────────────────────────────────────────────
let rc = 0;
if (vanished.length) {
  fail('rutas que el inventario declara y el motor YA NO TIENE (' + vanished.length + ')', vanished);
  rc = 1;
}
if (appeared.length) {
  fail('rutas NUEVAS en el motor que el inventario NO declara (' + appeared.length + ')', appeared.concat([
    'si la ruta es intencional: declarala en artifacts/verify/jit_routes_61.json (y en su .md)'
  ]));
  rc = 1;
}
if (methodGone.length) {
  fail('metodos declarados que ya no tienen evidencia en el codigo (' + methodGone.length + ')', methodGone);
  rc = 1;
}
if (methodWider.length && !quiet) {
  console.log('AVISO: el codigo es MAS estricto que el inventario en ' + methodWider.length + ' ruta(s) (no es fallo):');
  for (const w of methodWider) console.log('  - ' + w);
  console.log('');
}

if (rc === 0) {
  if (!quiet) {
    console.log('CONTRATO CUMPLIDO: ' + declared.length + '/' + declared.length + ' rutas declaradas presentes, ' +
      routesInCode.length + ' rutas en el motor, 0 nuevas, 0 metodos perdidos.');
    console.log('  (contrato: artifacts/verify/jit_routes_61.json  ·  motor: ' +
      path.relative(ROOT, SERVER) + ')');
  }
}
process.exit(rc);
