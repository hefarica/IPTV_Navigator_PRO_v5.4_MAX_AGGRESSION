#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
 * T28 · RC-1 + RC-2 · GATE ESTÁTICO del resolver PHP
 * ───────────────────────────────────────────────────────────────────────────
 * Comprueba por texto (sin ejecutar PHP) que los dos bloqueos que impedían
 * CUALQUIER reproducción están cerrados y que el resto del contrato sigue vivo:
 *
 *   (a) RC-1  guarda idempotente del enum PlayerType  (enum_exists)
 *   (b) RC-2  derivación del origen desde srv + sid + origin
 *   (c) 0 ocurrencias de `error.ts`  (antes: playlist falso de 1 canal)
 *   (d) 502 + cabecera X-APE-Error  con cuerpo vacío
 *   (e) resto del contrato intacto (CODECS · $is_hevc · 302 · Vía A del fusible ·
 *       emisores del manifiesto · helpers previos)
 *
 * NO ejecuta PHP. Si no hay binario `php`, la sintaxis nativa queda [UNKNOWN] y
 * este script NO imprime ningún «php -l OK».
 *
 * USO:  node _vps_stage/tests/resolver_blockers_assert.js
 * EXIT: 0 = todo pasa · 1 = al menos un assert falla
 * ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PHP_PATH = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'backend', 'resolve_quality_unified.php');

let pass = 0;
const failures = [];

function ok(name, cond, evidence) {
    if (cond) {
        pass++;
        console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } else {
        failures.push(name);
        console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
        if (evidence !== undefined) console.log(`      → ${evidence}`);
    }
    return !!cond;
}
function count(hay, needle) {
    let n = 0, i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
}
function section(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }

/* ───────────────────────────── 0 · lectura ───────────────────────────── */
section('0 · Artefacto');
if (!fs.existsSync(PHP_PATH)) {
    console.error(`FATAL: no existe ${PHP_PATH}`);
    process.exit(1);
}
const php = fs.readFileSync(PHP_PATH, 'utf8');
const lines = php.split(/\r?\n/);
ok('resolver PHP presente', php.length > 100000, `${php.length} bytes · ${lines.length} líneas`);

/* ─────────────────────── 1 · RC-1 · guarda del enum ──────────────────── */
section('1 · RC-1 · guarda idempotente del enum PlayerType');
const iGuard = php.indexOf("if (!enum_exists('PlayerType'))");
const iEnum = php.indexOf('enum PlayerType: string');
ok("existe la guarda `if (!enum_exists('PlayerType'))`", iGuard !== -1);
ok('existe la declaración `enum PlayerType: string`', iEnum !== -1);
ok('la guarda precede a la declaración', iGuard !== -1 && iEnum !== -1 && iGuard < iEnum,
    `guarda@${iGuard} enum@${iEnum}`);
ok('la declaración aparece UNA sola vez (sin duplicados en el archivo)',
    count(php, 'enum PlayerType: string') === 1,
    `ocurrencias: ${count(php, 'enum PlayerType: string')}`);

/* La guarda debe CERRAR después del cuerpo del enum: se comprueba el balance
   de llaves del tramo guarda→fin del enum y que el cierre esté tras el último case. */
const iLastCase = php.indexOf("case GENERIC  = 'generic';", iEnum);
const iGuardClose = iLastCase === -1 ? -1 : php.indexOf('}', php.indexOf('}', iLastCase));
ok('el cuerpo del enum cierra después del último case',
    iLastCase !== -1 && iGuardClose !== -1 && iGuardClose > iLastCase);
{
    const block = php.slice(iGuard, iLastCase + 40);
    ok('bloque guarda+enum con llaves balanceadas',
        count(block, '{') === count(block, '}'),
        `{ ${count(block, '{')} vs } ${count(block, '}')}`);
}
ok('el patrón es idempotente: UNA sola DECLARACIÓN `enum PlayerType:` (las menciones en comentarios no cuentan)',
    (php.match(/enum\s+PlayerType\s*:/g) || []).length === 1,
    `declaraciones: ${(php.match(/enum\s+PlayerType\s*:/g) || []).length}`);
ok('los usos `PlayerType::` siguen presentes (no se rompió el resto del archivo)',
    count(php, 'PlayerType::') >= 20, `usos: ${count(php, 'PlayerType::')}`);

/* ─────────────────── 2 · RC-2 · derivación desde srv+sid ─────────────── */
section('2 · RC-2 · derivación del origen desde srv + sid + origin');
const iDerive = php.indexOf('function ape_derive_origin_candidates');
ok('existe `function ape_derive_origin_candidates`', iDerive !== -1);
const deriveBody = iDerive === -1 ? '' : php.slice(iDerive, iDerive + 3600);
ok('decodifica srv con base64_decode', deriveBody.includes('base64_decode'));
ok("separa los 3 campos con explode('|'", deriveBody.includes("explode('|'"));
ok('tolera srv ya en claro (pipe-separated)', deriveBody.includes("str_contains(\$decoded, '|')"));
ok('compone la ruta Xtream /live/user/pass/sid.m3u8', deriveBody.includes("'/live/'") && deriveBody.includes("'.m3u8'"));
ok('ofrece variantes razonables (>= 3 candidatos .m3u8)', count(deriveBody, '.m3u8') >= 3,
    `ocurrencias .m3u8 en la función: ${count(deriveBody, '.m3u8')}`);
ok('sanea el host (guardarraíl regex)', deriveBody.includes("preg_match('/^[A-Za-z0-9._:-]+$/'"));
ok('sanea el sid (guardarraíl regex)', deriveBody.includes("preg_match('/^[A-Za-z0-9._-]{1,128}$/'"));
ok('NO inventa credenciales: si falta user/pass devuelve []', deriveBody.includes('return [];'));

const iCtx = php.indexOf('// [RC-2 · T28] ORIGEN: url= explícito o DERIVADO');
ok('el bloque de decisión de origen está en la rama ctx', iCtx !== -1);
ok("lee `url=` primero (camino heredado intacto)",
    php.indexOf("trim((string)($_GET['url'] ?? ''))") !== -1);
ok("llama a la derivación con srv + sid + origin",
    php.includes("ape_derive_origin_candidates(") &&
    php.includes("(string)($_GET['srv'] ?? '')") &&
    php.includes("(string)($_GET['sid'] ?? '')") &&
    php.includes("(string)($_GET['origin'] ?? '')"));
ok('marca el origen como derivado ($origin_derived = true)', php.includes('$origin_derived = true;'));
ok('prueba los candidatos en orden (foreach $probe_targets)', php.includes('foreach ($probe_targets as $probe_target)'));
ok('corta ambos bucles al primer acierto (break 2)', php.includes('break 2;'));
ok('registra el éxito del probe ($probe_ok = true)', php.includes('$probe_ok         = true;'));

/* ────────────────────── 3 · RC-2 · cero playlist falso ───────────────── */
section('3 · RC-2 · cero playlist falso (error.ts)');
ok('cero `error.ts` en todo el archivo', count(php, 'error.ts') === 0, `ocurrencias: ${count(php, 'error.ts')}`);
ok('cero `localhost/error.ts`', count(php, 'localhost/error.ts') === 0);
ok('cero `die("#EXTM3U` (playlist de error)', count(php, 'die("#EXTM3U') === 0);
ok('cero llamadas reales a die( con manifiesto', count(php, "die(\"#EXTM3U") === 0);

/* ─────────────────── 4 · RC-2 · 502 + X-APE-Error ────────────────────── */
section('4 · RC-2 · 502 explícito con X-APE-Error');
const iFail = php.indexOf('function ape_resolver_fail_502');
ok('existe `function ape_resolver_fail_502`', iFail !== -1);
ok('responde HTTP 502', php.includes('http_response_code(502);'));
ok("envía la cabecera X-APE-Error", php.includes("header('X-APE-Error: ' . $code);"));
ok('expone la cabecera por CORS', php.includes("Access-Control-Expose-Headers: X-APE-Error"));
ok('declara Content-Length: 0 (cuerpo vacío)', php.includes("header('Content-Length: 0');"));
ok("código CTX_PAYLOAD_INVALID usado en el fallo de ctx",
    php.includes("ape_resolver_fail_502('CTX_PAYLOAD_INVALID'"));
ok("código ORIGIN_UNRESOLVED usado al no derivar",
    php.includes("ape_resolver_fail_502('ORIGIN_UNRESOLVED', 'sin url="));
ok("código ORIGIN_UNRESOLVED usado al no resolver el probe",
    php.includes("ape_resolver_fail_502('ORIGIN_UNRESOLVED', 'ningún candidato derivado"));

/* El helper NO debe emitir cuerpo: entre su `{` y el `exit;` no puede haber echo/print. */
{
    const body = iFail === -1 ? '' : php.slice(iFail, php.indexOf('exit;', iFail) + 5);
    ok('el helper 502 no imprime cuerpo (sin echo/print antes de exit)',
        body !== '' && count(body, 'echo') === 0 && count(body, 'print') === 0,
        `echo=${count(body, 'echo')} print=${count(body, 'print')}`);
    ok('el helper 502 termina en exit;', body.includes('exit;'));
}
ok('el 502 solo se dispara en modo derivado (url= explícito conserva su comportamiento)',
    php.includes('if ($origin_derived && !$probe_ok) {'));

/* ─────────────────── 5 · contrato previo intacto ─────────────────────── */
section('5 · Resto del contrato intacto (cero regresión)');
ok('línea CODECS byte a byte',
    php.includes('"#EXT-X-STREAM-INF:BANDWIDTH=5100000,AVERAGE-BANDWIDTH=5100000,RESOLUTION={$detected_res},CODECS=\\"{$detected_codec},mp4a.40.2\\"\\n"'));
ok('URI de la variante sigue siendo $best_quality_url', php.includes('$output .= $best_quality_url . "\\n";'));
ok('lógica $is_hevc intacta',
    php.includes("$is_hevc = (strpos($best_quality_url, 'video_codec=hevc') !== false) ||"));
ok('302 a binario crudo intacto',
    php.includes('header("Location: " . $best_quality_url, true, 302);'));

/* Vía A del fusible (t12) */
ok('tabla del fusible intacta (6 perfiles)',
    count(php, "['design_bps' =>") === 6, `filas: ${count(php, "['design_bps' =>")}`);
for (const [p, d, f] of [['P0', 25000000, 18000000], ['P1', 14000000, 10000000], ['P2', 14000000, 10000000], ['P3', 5000000, 3500000], ['P4', 2000000, 1400000], ['P5', 1000000, 700000]]) {
    ok(`fusible ${p} = ${d}/${f}`,
        php.includes(`'${p}' => ['design_bps' => ${d}, 'fuse_bps' => ${f}]`) ||
        php.includes(`'${p}' => ['design_bps' => ${d},  'fuse_bps' => ${f}]`));
}
ok('emisión #EXT-X-APE-FLOOR-FUSE intacta', php.includes("'#EXT-X-APE-FLOOR-FUSE:STATE='"));
ok('emisión #EXT-X-APE-FLOOR-FUSE-POLICY intacta', php.includes("'#EXT-X-APE-FLOOR-FUSE-POLICY:normal=adaptive-minbitrate:'"));
ok('$floor_bps (fuse→floor) intacto', /\$floor_bps\s*=\s*\$fuse\s*\?\s*\(int\)\$fuseTable\['fuse_bps'\]/.test(php));
ok("lectura estricta de fuse === '1' intacta", php.includes("$_GET['fuse'] === '1'"));

/* Emisores y helpers previos */
ok('emisor del manifiesto intacto', php.includes('$output = "#EXTM3U') && php.includes('#EXTM3U\\n";'));
ok('pipeline legacy intacto', php.includes('function rq_enrich_channel_output'));
ok('join de $enriched intacto', php.includes('$result = implode("\\n", $enriched);'));
ok('las 8 directivas #EXTHTTP/KODIPROP/EXTVLCOPT siguen emitiéndose',
    php.includes("'#EXTHTTP:'") && php.includes("'#KODIPROP:") && php.includes("'#EXTVLCOPT:"));
ok('no se borró la tabla de perfiles P0-P5 del anti-cut',
    php.includes("'min_bitrate'          => 5000000") || php.includes("'max_bitrate'          => 50000000"));
ok('archivo no truncado (>= 7322 líneas de la línea base t12)', lines.length >= 7322,
    `${lines.length} líneas`);

/* Balance global de llaves: un desbalance delataría una edición rota. */
{
    const open = count(php, '{');
    const close = count(php, '}');
    const delta = Math.abs(open - close);
    ok('llaves globales razonablemente balanceadas (|Δ| <= 5 por llaves en strings)',
        delta <= 5, `{ ${open} vs } ${close} · Δ=${delta}`);
}
ok('paréntesis globales razonablemente balanceados (|Δ| <= 5)',
    Math.abs(count(php, '(') - count(php, ')')) <= 5,
    `( ${count(php, '(')} vs ) ${count(php, ')')}`);

/* ───────────────── 6 · validación nativa PHP (honesta) ───────────────── */
section('6 · Validación nativa PHP');
let phpBin = null;
try {
    phpBin = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['php'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim();
} catch (_) { phpBin = null; }
if (!phpBin) {
    console.log('  \x1b[33m⚠ [UNKNOWN]\x1b[0m `php` CLI no disponible en esta máquina.');
    console.log('      NO se afirma «php -l OK». La sintaxis queda sin validar por intérprete;');
    console.log('      este gate es ESTÁTICO. Antes de desplegar: `php -l` en el VPS.');
} else {
    try {
        execFileSync(phpBin, ['-l', PHP_PATH], { encoding: 'utf8', stdio: 'pipe' });
        ok('php -l sobre el resolver', true, phpBin);
    } catch (e) {
        ok('php -l sobre el resolver', false, (e.stdout || '') + (e.stderr || ''));
    }
}

/* ───────────────────────────── resumen ─────────────────────────────── */
const total = pass + failures.length;
console.log('\n' + '─'.repeat(70));
console.log(`  ${pass}/${total} asserts OK · ${failures.length} fallo(s)`);
if (failures.length) {
    console.log('  FALLOS:');
    failures.forEach(f => console.log(`   · ${f}`));
    console.log('─'.repeat(70));
    process.exit(1);
}
console.log('  \x1b[32mRC-1 + RC-2 · DESBLOQUEO DEL RESOLVER · gate OK\x1b[0m');
console.log('─'.repeat(70));
process.exit(0);
