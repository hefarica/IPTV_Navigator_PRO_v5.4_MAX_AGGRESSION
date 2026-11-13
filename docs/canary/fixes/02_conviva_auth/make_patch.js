// make_patch.js — genera 0002-conviva-auth.patch SIN tocar el repo real.
// Lee el original del repo, construye la version parcheada EN MEMORIA, y emite
// un diff unificado con las lineas de contexto copiadas byte a byte del original
// (CRLF incluido). No escribe nada fuera de esta carpeta.
//
// Uso: node make_patch.js
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const REL = 'IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php';
const ORIG = path.join(REPO, REL);
const OUT = path.join(__dirname, '0002-conviva-auth.patch');

// ── Bloque de autenticacion a insertar (sin CRLF; se anade al emitir) ─────────
const BLOCK = [
  '// ── AUTH D-2 (2026-11-12) — el endpoint era un registro vivo SIN validacion ──',
  '// Antes de este guard cualquier cliente que alcanzara la ruta podia crear o',
  '// sobrescribir la fila de un device_id en ara_heartbeats (device_id es PK) y',
  '// falsificar state / player / ara_version / caps_json / last_seen: justo el',
  '// estado que el VPS usa para el gate por dispositivo.',
  '//',
  '// Patron copiado de ara-enroll.php:29-38 (mismo estilo de error, tiempo constante):',
  '//   · el secreto esperado se lee SOLO del entorno del pool php-fpm',
  '//   · sin secreto, o demasiado corto  -> 503 (fail-closed: el endpoint se apaga)',
  '//   · credencial ausente o incorrecta -> 401',
  '//',
  '// AVISO OPERATIVO — IMPACTO EN CLIENTES YA DISTRIBUIDOS:',
  '//   Los APK que ya estan instalados mandan este Bearer con el token anterior (o',
  '//   vacio). Hasta que se actualicen DEJARAN DE REPORTAR: recibiran 401 y su fila',
  '//   en ara_heartbeats dejara de refrescarse. La REPRODUCCION NO SE VE AFECTADA:',
  '//   el video nunca pasa por este endpoint; solo se pierde telemetria QoE y el',
  '//   latido que alimenta el gate por dispositivo.',
  '//',
  '// REQUISITO DE DESPLIEGUE — el location de nginx DEBE pasar la cabecera al pool:',
  '//   fastcgi_param HTTP_AUTHORIZATION $http_authorization;',
  '//   (mismo patron ya usado en vps/nginx/snippets/prisma-ara-events.conf:39).',
  '//   Si no se pasa, $_SERVER[\'HTTP_AUTHORIZATION\'] llega vacio y TODO dara 401.',
  '//   El fallback getallheaders() de abajo solo cubre configuraciones donde la',
  '//   cabecera llega por otra via; no sustituye al fastcgi_param.',
  "$convivaExpected = getenv('CONVIVA_EVENT_TOKEN');",
  'if (!is_string($convivaExpected) || strlen($convivaExpected) < 16) {',
  '    http_response_code(503);',
  "    echo json_encode(['ok' => false, 'error' => 'conviva_auth_disabled']);",
  '    exit;',
  '}',
  '',
  "$convivaAuthz = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');",
  '$convivaAuthz = trim($convivaAuthz);',
  "if ($convivaAuthz === '' && function_exists('getallheaders')) {",
  '    foreach (getallheaders() as $convivaHk => $convivaHv) {',
  "        if (strcasecmp((string)$convivaHk, 'Authorization') === 0) {",
  '            $convivaAuthz = trim((string)$convivaHv);',
  '            break;',
  '        }',
  '    }',
  '}',
  "$convivaGiven = '';",
  "if (stripos($convivaAuthz, 'Bearer ') === 0) {",
  '    $convivaGiven = trim(substr($convivaAuthz, 7));',
  '}',
  "if ($convivaGiven === '' || !hash_equals($convivaExpected, $convivaGiven)) {",
  '    http_response_code(401);',
  "    echo json_encode(['ok' => false, 'error' => 'unauthorized']);",
  '    exit;',
  '}',
  ''
];

// ── Leer original conservando CRLF ───────────────────────────────────────────
const raw = fs.readFileSync(ORIG, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(eol);            // ultimo elemento = '' si el fichero acaba en EOL
const hadFinalEol = lines[lines.length - 1] === '';
if (hadFinalEol) lines.pop();

const idxReadBody = lines.findIndex((l) => l.trim() === '// Read body');
if (idxReadBody < 0) throw new Error('no encuentro el ancla "// Read body"');
const idxMethodGuard = lines.findIndex((l) => l.includes("if ($method !== 'POST') {"));
if (idxMethodGuard < 0) throw new Error('no encuentro el method guard');
const idxRawLine = lines.findIndex((l) => l.includes("file_get_contents('php://input')"));
if (idxRawLine < 0) throw new Error('no encuentro la lectura del body');

// ── Construir parcheado en memoria (para validar la insercion) ───────────────
const patched = lines.slice(0, idxReadBody).concat(BLOCK.slice(), lines.slice(idxReadBody));

// ── Emitir diff unificado: contexto desde el method guard hasta la lectura ───
const ctxStart = idxMethodGuard;                 // 0-based
const ctxEnd = idxRawLine;                       // 0-based, inclusive
const ctxOld = lines.slice(ctxStart, ctxEnd + 1);
const insertAt = idxReadBody;                    // la insercion cae dentro del rango
const ctxNew = patched.slice(ctxStart, ctxEnd + 1 + BLOCK.length);
const oldCount = ctxOld.length;
const newCount = ctxNew.length;
const oldStart = ctxStart + 1;                   // 1-based

const out = [];
out.push('diff --git a/' + REL + ' b/' + REL);
out.push('--- a/' + REL);
out.push('+++ b/' + REL);
out.push('@@ -' + oldStart + ',' + oldCount + ' +' + oldStart + ',' + newCount + ' @@');
for (let i = 0; i < oldCount; i++) {
  // la insercion va justo antes de la linea '// Read body'
  if (ctxStart + i === insertAt) {
    for (const b of BLOCK) out.push(b === '' ? '+' : '+' + b);
  }
  const l = ctxOld[i];
  out.push(l === '' ? ' ' : ' ' + l);
}
// Si la insercion cae al final del rango (no deberia), volcarla igualmente
if (insertAt >= ctxEnd + 1) for (const b of BLOCK) out.push(b === '' ? '+' : '+' + b);

fs.writeFileSync(OUT, out.join(eol) + eol, 'utf8');

// ── Reporte ─────────────────────────────────────────────────────────────────
const sha = require('crypto').createHash('sha256').update(fs.readFileSync(ORIG)).digest('hex');
console.log('original      : ' + REL);
console.log('  bytes=' + fs.statSync(ORIG).size + '  sha256=' + sha);
console.log('  eol=' + (eol === '\r\n' ? 'CRLF' : 'LF') + '  lineas=' + lines.length);
console.log('insercion     : ' + BLOCK.length + ' lineas antes de "' + lines[idxReadBody].trim() + '" (linea ' + (idxReadBody + 1) + ')');
console.log('hunk          : @@ -' + oldStart + ',' + oldCount + ' +' + oldStart + ',' + newCount + ' @@');
console.log('parche        : ' + path.relative(process.cwd(), OUT) + '  (' + fs.statSync(OUT).size + ' B)');
console.log('');
console.log('--- bloque insertado (revisar a ojo) ---');
BLOCK.forEach((b, i) => console.log(String(i + 1).padStart(2) + '| ' + b));
