/**
 * tests/ape-12p-onpath-equivalence.test.js
 * ---------------------------------------------------------------------------
 * Cierra el NO_COMPUTADO de la suite anterior: genera la MISMA lista real dos
 * veces con el emisor real (m3u8-typed-arrays-ultimate.js en un sandbox) y
 * compara línea a línea la salida con el flag APAGADO contra la del flag
 * ENCENDIDO.
 *
 * Qué se comprueba (H = salida con flag encendido, O = con flag apagado):
 *   H1 las dos corridas terminan bien y la lista sale determinista
 *   H2 sin flag NO aparece ni una etiqueta BUFFER-POLICY
 *   H3 con flag aparece UNA por canal (#EXTINF), ni una más ni una menos
 *   H4 cada etiqueta conserva el declarado y añade el efectivo del LAB
 *   H5 todas dicen MEASURED_ON_DEVICE=false (no se ha medido en dispositivo)
 *   H6 el resto de la lista es IDÉNTICO: quitando la etiqueta nueva y el
 *      contador LINES= de los cartuchos, los dos textos coinciden byte a byte
 *   H7 la diferencia de líneas es exactamente la de las etiquetas añadidas
 *
 * Los dos indicadores del arnés que se usan aquí NO son código de producto:
 *   --profiles  carga ape-profiles-config.js en el sandbox (la página lo carga
 *               siempre en index-v4.html; sin él el emisor usa su fallback y
 *               el buffer declarado no sería el real)
 *   --12p on    enciende APE_12P_MODE dentro del sandbox
 * Ninguno de los dos existe en la app: son del arnés de medición
 * (_vps_stage/tests/regen_headless/regen_headless.js).
 *
 * Si el arnés o la fixture no están en este árbol, la suite lo DICE y no
 * inventa un resultado: cuenta como omitida, nunca como verde.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let PASS = 0, FAIL = 0, SKIP = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'esperado ' + JSON.stringify(want) + ', obtenido ' + JSON.stringify(got)); }

// frontend/tests → frontend → IPTV_v5.4_MAX_AGGRESSION → raíz del repo
const REPO = path.resolve(__dirname, '..', '..', '..');
const HARNESS = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'regen_headless.js');
const FIXTURE = path.join(REPO, '_vps_stage', 'tests', 'regen_headless', 'fixtures', 'mini_15.m3u8');
const TAG = '#EXT-X-APE-BUFFER-POLICY:';
const ID_TAG = '#EXT-X-APE-INPUT-DEMAND:';

console.log('\n=== H · lista real: flag apagado vs flag encendido ===');
console.log('  arnés: ' + HARNESS);

if (!fs.existsSync(HARNESS) || !fs.existsSync(FIXTURE)) {
    SKIP++;
    console.log('  OMITIDA  no están el arnés o la fixture en este árbol; no se afirma nada');
    console.log('\nRESUMEN PASS=0 FAIL=0 OMITIDAS=1');
    process.exit(0);
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ape12p-onpath-'));
const dirOff = path.join(base, 'off');
const dirOn = path.join(base, 'on');

function run(extra) {
    const args = [HARNESS, FIXTURE, '--mode', 'default', '--deterministic', '--profiles'];
    for (const e of extra) args.push(e);
    args.push('--out', extra.indexOf('on') !== -1 ? dirOn : dirOff);
    const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function listIn(dir) {
    if (!fs.existsSync(dir)) return null;
    const f = fs.readdirSync(dir).filter(x => /\.m3u8$/i.test(x));
    if (f.length !== 1) return null;
    return fs.readFileSync(path.join(dir, f[0]), 'utf8');
}

let offText = null, onText = null, rOff = null, rOn = null;
try {
    rOff = run([]);
    offText = listIn(dirOff);
    rOn = run(['--12p', 'on']);
    onText = listIn(dirOn);

    // H1
    eq('H1.1 corrida con flag apagado termina bien', rOff.code, 0);
    eq('H1.2 corrida con flag encendido termina bien', rOn.code, 0);
    ok('H1.3 las dos listas existen y no están vacías', !!offText && !!onText && offText.length > 1000 && onText.length > 1000);
    ok('H1.4 el arnés dice que cargó el módulo 12P sólo en la corrida encendida',
        /modulo=1\.0\.0/.test(rOn.out) && !/modulo=1\.0\.0/.test(rOff.out));
    ok('H1.5 la corrida encendida no perdió determinismo (SHA IDÉNTICO)',
        /determinismo\s*:\s*SHA IDÉNTICO/.test(rOn.out));

    const lOff = offText.split('\n');
    const lOn = onText.split('\n');
    const nExtinf = lOff.filter(l => l.indexOf('#EXTINF:') === 0).length;
    const tagsOff = lOff.filter(l => l.indexOf(TAG) === 0);
    const tagsOn = lOn.filter(l => l.indexOf(TAG) === 0);
    const idOff = lOff.filter(l => l.indexOf(ID_TAG) === 0);
    const idOn = lOn.filter(l => l.indexOf(ID_TAG) === 0);

    // H2
    eq('H2.1 sin flag no hay ninguna etiqueta BUFFER-POLICY', tagsOff.length, 0);

    // H3
    ok('H3.1 hay canales en la lista', nExtinf > 0);
    eq('H3.2 con flag hay una etiqueta por canal', tagsOn.length, nExtinf);

    // H4
    ok('H4.1 todas conservan el declarado (DECLARED_MS o unknown)',
        tagsOn.length > 0 && tagsOn.every(t => /DECLARED_MS=(\d+|unknown)/.test(t)));
    ok('H4.2 todas añaden el efectivo (EFFECTIVE_TARGET_MS + _S)',
        tagsOn.length > 0 && tagsOn.every(t => /EFFECTIVE_TARGET_MS=\d+/.test(t) && /EFFECTIVE_TARGET_S=\d+/.test(t)));
    ok('H4.3 el efectivo nunca supera el declarado cuando el declarado se conoce',
        tagsOn.every(t => {
            const d = (/(?:^|[,:])DECLARED_MS=(\d+)/.exec(t) || [])[1];
            const e = (/EFFECTIVE_TARGET_MS=(\d+)/.exec(t) || [])[1];
            return d === undefined || Number(e) <= Number(d);
        }));

    // H5
    ok('H5.1 todas declaran MEASURED_ON_DEVICE=false',
        tagsOn.length > 0 && tagsOn.every(t => /MEASURED_ON_DEVICE=false/.test(t)));

    // H6 · el resto de la lista es idéntico
    const limpia = (arr) => arr
        .filter(l => l.indexOf(TAG) !== 0 && l.indexOf(ID_TAG) !== 0)
        .map(l => l.replace(/(#EXT-X-APE-URL2-CARTRIDGE:[^\n]*?)LINES=\d+/, '$1LINES=#'));
    const a = limpia(lOff), b = limpia(lOn);
    let primerDiff = -1;
    if (a.length === b.length) {
        for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { primerDiff = i; break; } }
    }
    ok('H6.1 mismo número de líneas al quitar la etiqueta', a.length === b.length, a.length + ' vs ' + b.length);
    ok('H6.2 el resto de la lista es idéntico byte a byte', primerDiff === -1,
        primerDiff === -1 ? '' : 'primera diferencia en la línea ' + primerDiff + ': ' + JSON.stringify(a[primerDiff].slice(0, 90)) + ' vs ' + JSON.stringify(b[primerDiff].slice(0, 90)));

    // H6.3–H6.8 · la condición de buffer (entrada ≥ salida × (1+delta)), exacta y sin tocar la salida
    eq('H6.3 sin flag no hay ninguna etiqueta INPUT-DEMAND', idOff.length, 0);
    eq('H6.4 con flag hay una etiqueta INPUT-DEMAND por canal', idOn.length, nExtinf);
    ok('H6.5 todas declaran la salida sin reducir (OUTPUT_REDUCED=false)',
        idOn.length > 0 && idOn.every(t => /(?:^|[,:])OUTPUT_REDUCED=false(,|$)/.test(t)));
    ok('H6.6 todas declaran MEASURED_ON_DEVICE=false (no se inventa medición)',
        idOn.length > 0 && idOn.every(t => /(?:^|[,:])MEASURED_ON_DEVICE=false(,|$)/.test(t)));
    ok('H6.7 la aritmética es exacta: REQUIRED = OUTPUT + ceil(OUTPUT×DELTA/100)',
        idOn.length > 0 && idOn.every(t => {
            const o = Number((/(?:^|[,:])OUTPUT_BPS=(\d+)/.exec(t) || [])[1]);
            const d = Number((/(?:^|[,:])DELTA_PCT=(\d+)/.exec(t) || [])[1]);
            const r = Number((/(?:^|[,:])REQUIRED_BPS=(\d+)/.exec(t) || [])[1]);
            const x = Number((/(?:^|[,:])EXTRA_BPS=(\d+)/.exec(t) || [])[1]);
            if (!isFinite(o) || !isFinite(d) || !isFinite(r) || !isFinite(x)) return false;
            return r === o + Math.floor((o * d + 99) / 100) && x === r - o;
        }));
    ok('H6.8 el delta que se aplica es el que pide la regla, dentro de 1..90',
        idOn.length > 0 && idOn.every(t => {
            const d = Number((/(?:^|[,:])DELTA_PCT=(\d+)/.exec(t) || [])[1]);
            return d >= 1 && d <= 90 && d === 10;
        }));
    // H7
    eq('H7.1 la lista crece exactamente el número de etiquetas añadidas', lOn.length - lOff.length, tagsOn.length + idOn.length);
    ok('H7.2 los cartuchos sólo cambian su propio contador LINES',
        limpia(lOff).filter(l => l.indexOf('#EXT-X-APE-URL2-CARTRIDGE:') === 0).length ===
        limpia(lOn).filter(l => l.indexOf('#EXT-X-APE-URL2-CARTRIDGE:') === 0).length);

    console.log('\n  medido: OFF ' + Buffer.byteLength(offText) + ' B / ' + lOff.length + ' líneas · ON ' +
        Buffer.byteLength(onText) + ' B / ' + lOn.length + ' líneas · etiquetas ' + tagsOn.length + '/' + nExtinf + ' canales');
} finally {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_e) { /* limpieza best-effort */ }
}

console.log('\nRESUMEN PASS=' + PASS + ' FAIL=' + FAIL + (SKIP ? ' OMITIDAS=' + SKIP : ''));
process.exit(FAIL === 0 ? 0 : 1);
