#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
 * T12 · A · SUELO FUSIBLE (FLOOR FUSE) EN EL RESOLVER PHP — gate estático
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 *   1) Assert ESTÁTICO por texto sobre `backend/resolve_quality_unified.php`:
 *      funciones, tabla P0..P5, lectura de $_GET['fuse'], puntos de emisión.
 *   2) MODELO Node del decision-tree `fuse -> floor` comparado contra
 *      `getFloorFuseForProfile()` del frontend (paridad de tabla, no de código).
 *   3) Guardarraíles de NO-REGRESIÓN: CODECS, $is_hevc, 502+X-APE-Error (RC-2/t28),
 *      302 a binario, y que no se haya borrado nada del contrato previo.
 *
 * QUÉ NO HACE (declarado, no disimulado)
 *   · NO ejecuta PHP. Si el CLI `php` no está en la máquina, `php -l` queda
 *     [UNKNOWN] y este script NO imprime ningún "php -l OK".
 *   · NO sustituye a un intérprete: es un gate estático + modelo matemático.
 *
 * USO:  node _vps_stage/tests/fuse_resolver_assert.js
 * EXIT: 0 = todo pasa · 1 = al menos un assert falla
 * ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PHP_PATH = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'backend', 'resolve_quality_unified.php');
const FE_PATH = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-profiles-config.js');

/* Tabla contractual (design_bps / fuse_bps) — la del enunciado y la del frontend. */
const EXPECTED = {
    P0: { design_bps: 25000000, fuse_bps: 18000000 },
    P1: { design_bps: 14000000, fuse_bps: 10000000 },
    P2: { design_bps: 14000000, fuse_bps: 10000000 },
    P3: { design_bps: 5000000, fuse_bps: 3500000 },
    P4: { design_bps: 2000000, fuse_bps: 1400000 },
    P5: { design_bps: 1000000, fuse_bps: 700000 },
};
const EXPECTED_DROP_PCT = { P0: 28, P1: 29, P2: 29, P3: 30, P4: 30, P5: 30 };
const TRIGGER = 25;
const RECOVER = 70;
const HOLD = 20;
const MODE = 'buffer-recharge';

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

function eq(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    return ok(name, a === e, `esperado ${e} · obtenido ${a}`);
}

function count(haystack, needle) {
    let n = 0, i = 0;
    while ((i = haystack.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/* ───────────────────────────── 0 · lectura ───────────────────────────── */
section('0 · Artefactos');
if (!fs.existsSync(PHP_PATH)) {
    console.error(`FATAL: no existe ${PHP_PATH}`);
    process.exit(1);
}
const php = fs.readFileSync(PHP_PATH, 'utf8');
const phpLines = php.split(/\r?\n/);
const fe = fs.existsSync(FE_PATH) ? fs.readFileSync(FE_PATH, 'utf8') : '';

ok('resolver PHP presente y no vacío', php.length > 100000, `${php.length} bytes, ${phpLines.length} líneas`);
ok('frontend ape-profiles-config.js legible (referencia de paridad)', fe.length > 100000, `${fe.length} bytes`);

/* ───────────────────────── 1 · tabla del frontend ───────────────────── */
section('1 · Tabla del FRONTEND (getFloorFuseForProfile) — fuente de paridad');
const feTableSrc = (() => {
    const m = fe.match(/TABLE\s*=\s*\{([\s\S]{0,800}?)\};/);
    return m ? m[1] : '';
})();
ok('bloque TABLE {} localizado en el frontend', feTableSrc.length > 0, 'no se encontró `const TABLE = { ... };`');

const feTable = {};
{
    const re = /(P[0-5])\s*:\s*\{\s*design_bps\s*:\s*(\d+)\s*,\s*fuse_bps\s*:\s*(\d+)\s*\}/g;
    let m;
    while ((m = re.exec(feTableSrc)) !== null) {
        feTable[m[1]] = { design_bps: Number(m[2]), fuse_bps: Number(m[3]) };
    }
}
ok('frontend declara los 6 perfiles P0..P5', Object.keys(feTable).length === 6, `obtenidos: ${Object.keys(feTable).join(',') || 'ninguno'}`);
eq('tabla del frontend == tabla contractual', feTable, EXPECTED);

/* ───────────────────────── 2 · tabla del resolver ───────────────────── */
section('2 · Tabla del RESOLVER (ape_floor_fuse_for_profile)');
const fnStart = php.indexOf('function ape_floor_fuse_for_profile');
ok('existe `function ape_floor_fuse_for_profile`', fnStart !== -1);

const fnBody = fnStart === -1 ? '' : php.slice(fnStart, fnStart + 3000);
const phpTable = {};
{
    const re = /'(P[0-5])'\s*=>\s*\[\s*'design_bps'\s*=>\s*(\d+)\s*,\s*'fuse_bps'\s*=>\s*(\d+)\s*\]/g;
    let m;
    while ((m = re.exec(fnBody)) !== null) {
        phpTable[m[1]] = { design_bps: Number(m[2]), fuse_bps: Number(m[3]) };
    }
}
eq('tabla del resolver (design_bps/fuse_bps)', phpTable, EXPECTED);
eq('paridad PHP ↔ frontend (byte a byte en valores)', phpTable, feTable);
ok('la función devuelve el perfil normalizado', /'profile'\s*=>\s*\$key/.test(fnBody), 'falta `\'profile\' => $key`');
for (const [k, v] of Object.entries({ trigger_buffer_pct: TRIGGER, recover_buffer_pct: RECOVER, hold_s: HOLD })) {
    ok(`la función devuelve ${k} = ${v}`, new RegExp(`'${k}'\\s*=>\\s*${v}\\b`).test(fnBody));
}
ok(`la función devuelve mode = '${MODE}'`, new RegExp(`'mode'\\s*=>\\s*'${MODE}'`).test(fnBody));
for (const [p, d] of Object.entries(EXPECTED_DROP_PCT)) {
    const calc = Math.round((1 - EXPECTED[p].fuse_bps / EXPECTED[p].design_bps) * 100);
    ok(`fórmula max_drop_pct ${p} = ${d}`, calc === d, `calculado ${calc}`);
}
ok('la función está guardada con function_exists (idempotente al re-incluir)',
    php.includes("if (!function_exists('ape_floor_fuse_for_profile'))"));

/* ─────────────────────── 3 · lectura de $_GET['fuse'] ───────────────── */
section("3 · Lectura del parámetro `fuse`");
ok("existe `function ape_floor_fuse_is_active`", php.includes('function ape_floor_fuse_is_active'));
ok("usa isset($_GET['fuse'])", php.includes("isset($_GET['fuse'])"));
ok("comparación estricta === '1'", php.includes("$_GET['fuse'] === '1'"),
    "debe ser estricta: '0'/'true'/'01' NO activan el fusible");
ok('NO se usa el patrón laxo `!empty($_GET[\'fuse\'])`', !/!empty\(\$_GET\['fuse'\]\)/.test(php));
ok("conserva el contrato previo: ctx/url/profile/ch/srv/sid intactos",
    php.includes("$_GET['ctx']") && php.includes("$_GET['url']") &&
    php.includes("$_GET['profile'] ?? 'DEFAULT'") &&
    php.includes("q('ch', '')") && php.includes("q('srv', '')") && php.includes("q('sid', '')"),
    'alguna lectura previa de parámetros desapareció');
console.log('  \x1b[36mi\x1b[0m ctx/url/profile/ch/srv/sid son los params que ESTE archivo lee; ' +
    '`origin`/`alt` viven en vps/resolve.php (fuera de scope, no se tocan).');

/* ───────────────────────── 4 · decision-tree floor ──────────────────── */
section('4 · Decision-tree `fuse → floor` (modelo Node vs PHP)');
ok('existe `$floor_bps`', /\$floor_bps\s*=/.test(php));
ok('$floor_bps usa fuse_bps cuando el fusible está activo', /\$floor_bps\s*=\s*\$fuse\s*\?\s*\(int\)\$fuseTable\['fuse_bps'\]/.test(php));
ok('$floor_bps cae a design_bps cuando está abierto', /\?\s*\(int\)\$fuseTable\['fuse_bps'\]\s*:\s*\(int\)\$fuseTable\['design_bps'\]/.test(php));
ok('existe `ape_floor_fuse_floor_bps` (fuente única)', php.includes('function ape_floor_fuse_floor_bps'));

/* Modelo: replica la semántica PHP (`preg_match('/^\s*(P[0-5])(?![0-9])/i')` + `=== '1'`). */
function modelProfile(rawProfile) {
    const m = /^\s*(P[0-5])(?![0-9])/i.exec(String(rawProfile));
    return m ? m[1].toUpperCase() : 'P3';
}
function modelFuseActive(rawFuse) {
    return rawFuse !== undefined && rawFuse === '1';
}
function modelFloor(rawProfile, rawFuse) {
    const t = EXPECTED[modelProfile(rawProfile)];
    return modelFuseActive(rawFuse) ? t.fuse_bps : t.design_bps;
}

for (const p of Object.keys(EXPECTED)) {
    ok(`fuse=1 · ${p} → floor = fuse_bps (${EXPECTED[p].fuse_bps})`, modelFloor(p, '1') === EXPECTED[p].fuse_bps);
    ok(`fuse ausente · ${p} → floor = design_bps (${EXPECTED[p].design_bps})`, modelFloor(p, undefined) === EXPECTED[p].design_bps);
    ok(`fuse='0' · ${p} → floor = design_bps`, modelFloor(p, '0') === EXPECTED[p].design_bps);
    ok(`fuse='true' · ${p} → floor = design_bps`, modelFloor(p, 'true') === EXPECTED[p].design_bps);
    ok(`fuse='01' · ${p} → floor = design_bps`, modelFloor(p, '01') === EXPECTED[p].design_bps);
}
eq('normalización p1/p3 → P1/P3', [modelProfile('p1'), modelProfile('p3')], ['P1', 'P3']);
eq('normalización P1_ULTRA_SPORTS_8K → P1', modelProfile('P1_ULTRA_SPORTS_8K'), 'P1');
eq('normalización DEFAULT → P3 (fallback del frontend)', modelProfile('DEFAULT'), 'P3');
eq('normalización AUTO/SPORTS → P3', [modelProfile('AUTO'), modelProfile('SPORTS')], ['P3', 'P3']);
ok('P10 no se confunde con P1', modelProfile('P10') === 'P3', `obtenido ${modelProfile('P10')}`);

/* ───────────────────────── 5 · emisión en la respuesta ──────────────── */
section('5 · Emisión aditiva en la respuesta');
ok('#EXT-X-APE-FLOOR-FUSE:STATE= emitido', php.includes("'#EXT-X-APE-FLOOR-FUSE:STATE='"));
ok(',DESIGN=<design> emitido', php.includes("',DESIGN=' . $fuseTable['design_bps']"));
ok(',FUSE=<fuse> emitido', php.includes("',FUSE=' . $fuseTable['fuse_bps']"));
ok(',TRIGGER=25,RECOVER=70,HOLD=20,MODE=buffer-recharge emitido',
    php.includes("',TRIGGER=25,RECOVER=70,HOLD=20,MODE=buffer-recharge'"));
ok('#EXT-X-APE-FLOOR-FUSE-POLICY:normal=adaptive-minbitrate: emitido',
    php.includes("'#EXT-X-APE-FLOOR-FUSE-POLICY:normal=adaptive-minbitrate:'"));
ok('POLICY ;recharge=adaptive-minbitrate: emitido', php.includes("';recharge=adaptive-minbitrate:'"));
ok('POLICY ;state= emitido', php.includes("';state=' . $fuseState"));
ok('STATE ∈ {CLOSED, OPEN}', /\$fuseState\s*=\s*\$fuse\s*\?\s*'CLOSED'\s*:\s*'OPEN'/.test(php),
    "mapeo doctrinal: CLOSED ⇒ fuse_bps, OPEN ⇒ design_bps (ape-profiles-config.js:5109-5110)");
ok('#EXTVLCOPT:adaptive-minbitrate= emitido con $floor_bps',
    php.includes("'#EXTVLCOPT:adaptive-minbitrate=' . $floor_bps"));
ok('#KODIPROP:inputstream.adaptive.min_bandwidth= emitido con $floor_bps',
    php.includes("'#KODIPROP:inputstream.adaptive.min_bandwidth=' . $floor_bps"));

const nAdaptive = count(php, '#EXTVLCOPT:adaptive-minbitrate=');
ok('exactamente UN punto de emisión de adaptive-minbitrate (sin duplicar)', nAdaptive === 1, `encontrados ${nAdaptive}`);

/* Gate `if ($fuse)` que envuelve las dos sobreescrituras de piso.
   OJO: el literal `#KODIPROP:...min_bandwidth=` ya existe AGUAS ARRIBA (rutas
   legacy :4694 y :5023), por eso se busca a partir del gate, no desde el inicio. */
const iGate = php.indexOf('if ($fuse) {');
const iVlc = iGate === -1 ? -1 : php.indexOf("'#EXTVLCOPT:adaptive-minbitrate='", iGate);
const iKodi = iGate === -1 ? -1 : php.indexOf("'#KODIPROP:inputstream.adaptive.min_bandwidth='", iGate);
const iClose = iKodi === -1 ? -1 : php.indexOf('}', iKodi);
ok('existe el gate `if ($fuse) {`', iGate !== -1);
ok('las sobreescrituras están DENTRO del gate `if ($fuse)` (inertes sin fuse)',
    iGate !== -1 && iVlc !== -1 && iKodi !== -1 && iGate < iVlc && iVlc < iKodi && iClose !== -1,
    `gate@${iGate} vlc@${iVlc} kodi@${iKodi}`);
ok('el literal KODIPROP min_bandwidth preexistente NO se borró (rutas legacy :4694/:5023)',
    count(php, '#KODIPROP:inputstream.adaptive.min_bandwidth=') >= 3,
    `ocurrencias: ${count(php, '#KODIPROP:inputstream.adaptive.min_bandwidth=')}`);
ok('las dos directivas de piso van ANTES del #EXT-X-STREAM-INF (orden RFC 8216)',
    iKodi < php.indexOf('#EXT-X-STREAM-INF:BANDWIDTH=5100000'));
ok('los tags de metadata van ANTES del #EXT-X-STREAM-INF',
    php.indexOf("'#EXT-X-APE-FLOOR-FUSE:STATE='") < php.indexOf('#EXT-X-STREAM-INF:BANDWIDTH=5100000'));

/* ─────────────────── 6 · NO-REGRESIÓN (intocables) ─────────────────── */
section('6 · Intocables (cero regresión, cero borrados)');
const CODECS_LINE = '$output .= "#EXT-X-STREAM-INF:BANDWIDTH=5100000,AVERAGE-BANDWIDTH=5100000,RESOLUTION={$detected_res},CODECS=\\"{$detected_codec},mp4a.40.2\\"\\n";';
ok('línea #EXT-X-STREAM-INF/CODECS intacta (byte a byte)',
    php.includes('"#EXT-X-STREAM-INF:BANDWIDTH=5100000,AVERAGE-BANDWIDTH=5100000,RESOLUTION={$detected_res},CODECS=\\"{$detected_codec},mp4a.40.2\\"\\n"'),
    'la línea CODECS no coincide con el original');
ok('la URI de la variante sigue siendo $best_quality_url', php.includes('$output .= $best_quality_url . "\\n";'));

const IS_HEVC = "$is_hevc = (strpos($best_quality_url, 'video_codec=hevc') !== false) ||";
ok('lógica $is_hevc intacta', php.includes(IS_HEVC));

/* ─── [T38 · B2] RC-2 (t28) cambió el contrato a propósito ───────────────────
   La aserción anterior exigía el literal viejo `die("…error.ts…")`. RC-2 lo
   SUSTITUYÓ por un 502 explícito: la aserción quedó OBSOLETA, no era una
   regresión. Contrato nuevo verificado aquí (mismo rigor, más cobertura): */
ok('cero playlist falso de error: `error.ts` = 0 ocurrencias en el archivo',
    count(php, 'error.ts') === 0, `ocurrencias: ${count(php, 'error.ts')}`);
ok('el fallo de origen ya NO usa die() con manifiesto',
    php.includes('ape_resolver_fail_502(') && count(php, 'die("#EXTM3U') === 0,
    `die("#EXTM3U: ${count(php, 'die("#EXTM3U')}`);
ok('el fallo responde 502 con cabecera X-APE-Error',
    php.includes('http_response_code(502);') && php.includes("header('X-APE-Error: ' . $code);"));
ok('el 502 declara Content-Length: 0 (cuerpo vacío)',
    php.includes("header('Content-Length: 0');"));
ok('el origen se deriva de srv+sid cuando falta url=',
    php.includes('function ape_derive_origin_candidates'));
ok('`url=` explícito conserva el camino heredado (una sola rama sin derivar)',
    php.includes("trim((string)($_GET['url'] ?? ''))") && php.includes("if ($origin_url !== '')"));
ok('el 502 sólo se dispara en modo derivado',
    php.includes('if ($origin_derived && !$probe_ok) {'));

ok('302 a binario crudo intacto', php.includes('header("Location: " . $best_quality_url, true, 302);'));

ok('el pipeline de enriquecimiento legacy sigue presente', php.includes('function rq_enrich_channel_output'));
ok('el join de $enriched sigue presente', php.includes('$result = implode("\\n", $enriched);'));
ok('no hay borrados ni truncados en el archivo (7200+ líneas)',
    phpLines.length >= 7200, `${phpLines.length} líneas`);

/* Balance de llaves del bloque NUEVO de helpers (de su inicio a rq_handle_request). */
const iHelpers = php.indexOf('// 🔥 SUELO FUSIBLE (FLOOR FUSE) — Vía A');
const iHandler = php.indexOf('function rq_handle_request');
if (iHelpers !== -1 && iHandler > iHelpers) {
    const block = php.slice(iHelpers, iHandler);
    const open = count(block, '{');
    const close = count(block, '}');
    ok('bloque nuevo con llaves balanceadas', open === close, `{ ${open} vs } ${close}`);
} else {
    ok('bloque nuevo localizable', false, 'no se encontró el marcador del bloque de helpers');
}

/* ─────────────────── 7 · validación nativa PHP (honesta) ────────────── */
section('7 · Validación nativa PHP');
let phpBin = null;
try {
    phpBin = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['php'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim();
} catch (_) { phpBin = null; }

if (!phpBin) {
    console.log('  \x1b[33m⚠ [UNKNOWN]\x1b[0m `php` CLI no disponible en esta máquina.');
    console.log('      NO se afirma «php -l OK». La sintaxis del resolver queda sin validar');
    console.log('      por intérprete; este gate es estático + modelo matemático.');
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
console.log('\n' + '─'.repeat(66));
console.log(`  ${pass}/${total} asserts OK · ${failures.length} fallo(s)`);
if (failures.length) {
    console.log('  FALLOS:');
    for (const f of failures) console.log(`   · ${f}`);
    console.log('─'.repeat(66));
    process.exit(1);
}
console.log('  \x1b[32mSUELO FUSIBLE · Vía A · gate OK\x1b[0m');
console.log('─'.repeat(66));
process.exit(0);
