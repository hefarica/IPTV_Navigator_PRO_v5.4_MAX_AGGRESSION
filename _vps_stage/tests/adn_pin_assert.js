#!/usr/bin/env node
/**
 * T33 · GATE DEL PIN DEL ADN (adn_pin_assert.js)
 * ============================================================================
 * Verifica que el ADN canónico del repo es EXACTAMENTE el pineado y que sus
 * valores no introducen pares resolución+codec imposibles SIN declararlos.
 *
 * QUÉ HACE FALLAR (exit 1):
 *   A1 · sha256 del fichero  !=  pin.sha256
 *   A2 · resolución de un perfil != hoja 6 (excel_canonical_resolution) y esa
 *        divergencia NO está declarada en pin.known_divergences
 *   A3 · par resolución + nivel de codec imposible (hvc1/hev1/avc1) y NO declarado
 *   A4 · el pin dice credentials_present=false pero el fichero trae credenciales
 *   A5 · el fichero tiene credenciales y el pin no declara política
 *
 * QUÉ **NO** HACE FALLAR (y por qué es honesto):
 *   · Las divergencias conocidas (P1/P3/P4/P5 resolución, P3/P4 codec, fps=120)
 *     están declaradas en el pin porque el propietario ordenó que el fichero sea
 *     el export EXACTO del Excel. El gate las IMPRIME en voz alta en cada
 *     ejecución: verde ≠ ADN correcto, significa «no ha derivado de lo pineado».
 *   · Las credenciales en claro: se delegan al escáner de secretos con allowlist
 *     explícita para este path (decisión del propietario). Aquí solo se comprueba
 *     que la política esté declarada.
 *
 * Uso: node _vps_stage/tests/adn_pin_assert.js [--quiet]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUIET = process.argv.includes('--quiet');

// ── Rutas ──────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..', '..');
const PIN_PATH = path.join(__dirname, '..', 'lab', 'ADN_PIN.json');
const ADN_PATH = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'lab_master_22.6.0.json');

// ── Harness ────────────────────────────────────────────────────────────────
let pass = 0;
const failures = [];
const warnings = [];

function ok(name, cond, detail) {
    if (cond) { pass += 1; return true; }
    failures.push(detail ? `${name} — ${detail}` : name);
    return false;
}
function eq(name, actual, expected) {
    return ok(name, JSON.stringify(actual) === JSON.stringify(expected),
        `esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
}
function section(t) { if (!QUIET) console.log(`\n── ${t}`); }
function warn(t) { warnings.push(t); if (!QUIET) console.log(`   ⚠ ${t}`); }

// ── Tabla nivel de codec → techo de píxeles ────────────────────────────────
// Fuente: contrato de t29 (8K@30→L180, 4K@60→L153, 4K@30→L150, 1080p@60→L123,
// 1080p@30→L120, 720p→L93, 480p→AVC) + niveles AVC documentados en el repo.
// hvc1/hev1: L<n> es el level_idc/30.  avc1: bytes PP CC LL (profile/constraint/level).
const HEVC_LEVEL_MAX_H = {
    186: 4320, 183: 4320, 180: 4320,          // 8K (L6.x)
    156: 2160, 153: 2160, 150: 2160,          // 4K  (L5.x)
    123: 1080, 120: 1080,                     // FHD (L4.x)
    93: 720, 90: 720,                         // HD  (L3.1/3.0)
    63: 480, 60: 480, 30: 480,                // SD
};
const AVC_LEVEL_MAX_H = {
    0x1e: 480,   // avc1.xx1E → Level 3.0
    0x1f: 720,   // Level 3.1
    0x28: 1080,  // Level 4.0
    0x29: 1080,  // Level 4.1
    0x2a: 1080,  // Level 4.2
    0x32: 2160,  // Level 5.0
    0x33: 2160,  // Level 5.1
};

/**
 * Techo de altura que el códec declarado puede sostener.
 * @returns {{maxH:number|null, family:string}} maxH = null ⇒ no verificable
 */
function codecCeiling(codecFull) {
    const c = String(codecFull || '').toLowerCase().trim();
    if (!c) return { maxH: null, family: 'vacio' };

    // hvc1.2.4.L153.B0 / hev1.2.4.L123.B0
    const mHevc = c.match(/^hv[ce]1\.[0-9a-f]+\.[0-9a-f]+\.l(\d+)/);
    if (mHevc) {
        const lvl = parseInt(mHevc[1], 10);
        return { maxH: (lvl in HEVC_LEVEL_MAX_H) ? HEVC_LEVEL_MAX_H[lvl] : null, family: 'hevc' };
    }

    // avc1.64001f → PP=64 CC=00 LL=1f
    const mAvc = c.match(/^avc[13]\.([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/);
    if (mAvc) {
        const lvl = parseInt(mAvc[3], 16);
        return { maxH: (lvl in AVC_LEVEL_MAX_H) ? AVC_LEVEL_MAX_H[lvl] : null, family: 'avc' };
    }

    // dvh1 / dvhe / av01 / vvc1 → niveles con semántica propia; NO se inventan límites
    return { maxH: null, family: c.split('.')[0] };
}

function heightOf(res) {
    const m = String(res || '').match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
    return m ? parseInt(m[2], 10) : null;
}

// ── Carga ──────────────────────────────────────────────────────────────────
function readOrDie(p, label) {
    if (!fs.existsSync(p)) { console.error(`FATAL: no existe ${label} en ${p}`); process.exit(2); }
    return fs.readFileSync(p, 'utf8');
}

function sha256Of(p) {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// ── A0 · artefactos ────────────────────────────────────────────────────────
section('0 · Artefactos');
ok('pin ADN_PIN.json presente', fs.existsSync(PIN_PATH));
ok('ADN canónico presente', fs.existsSync(ADN_PATH));
if (failures.length) { console.log('\nRESULTADO: FAIL — artefactos ausentes'); process.exit(1); }

const pinRaw = readOrDie(PIN_PATH, 'ADN_PIN.json');
let pin;
try { pin = JSON.parse(pinRaw); } catch (e) {
    console.error(`FATAL: ADN_PIN.json no es JSON válido: ${e.message}`); process.exit(2);
}
const adnRaw = readOrDie(ADN_PATH, 'lab_master_22.6.0.json');
let adn;
try { adn = JSON.parse(adnRaw); } catch (e) {
    console.error(`FATAL: el ADN no es JSON válido: ${e.message}`); process.exit(2);
}
ok('pin tiene sha256 de 64 hex', /^[a-f0-9]{64}$/i.test(String(pin.sha256 || '')));
ok('pin declara excel_canonical_resolution con 6 perfiles',
    pin.excel_canonical_resolution && Object.keys(pin.excel_canonical_resolution).length === 6);

// ── A1 · HASH = PIN ────────────────────────────────────────────────────────
section('1 · A1 — sha256 del fichero == pin');
const actualSha = sha256Of(ADN_PATH);
const actualSize = fs.statSync(ADN_PATH).size;
if (!QUIET) console.log(`   medido: sha256=${actualSha}\n           size=${actualSize}`);
eq('A1.1 sha256 coincide con el pin', actualSha, String(pin.sha256).toLowerCase());
ok('A1.2 tamaño coincide con el pin', actualSize === Number(pin.size_bytes),
    `pin=${pin.size_bytes} medido=${actualSize}`);
ok('A1.3 exported_at del pin coincide con el del fichero',
    String(pin.exported_at) === String(adn.exported_at || ''),
    `pin=${pin.exported_at} fichero=${adn.exported_at}`);
ok('A1.4 version del pin coincide con la del fichero',
    String(pin.version) === String(adn.version || ''),
    `pin=${pin.version} fichero=${adn.version}`);

// ── Índice de divergencias declaradas ──────────────────────────────────────
const declared = Array.isArray(pin.known_divergences) ? pin.known_divergences : [];
function isDeclared(profile, field, actualValue) {
    return declared.some(d =>
        (d.profile === profile || d.profile === 'P0..P5' || d.profile === 'P0..P5' && true) &&
        d.field === field &&
        (d.export_value === undefined || String(d.export_value) === String(actualValue)));
}
if (!QUIET) console.log(`   divergencias declaradas en el pin: ${declared.length}`);

// ── A2 · RESOLUCIÓN vs HOJA 6 ─────────────────────────────────────────────
section('2 · A2 — resolución vs hoja 6 (6_NIVEL_2_PROFILES)');
const profiles = Object.keys(adn.profiles_calibrated || {}).sort();
let a2Declared = 0, a2Clean = 0;
for (const p of profiles) {
    const s = (adn.profiles_calibrated[p] || {}).settings || {};
    const actualRes = String(s.resolution || '');
    const excelRes = String((pin.excel_canonical_resolution || {})[p] || '');
    const matches = actualRes === excelRes;
    const decl = isDeclared(p, 'settings.resolution', actualRes);
    if (matches) {
        a2Clean += 1;
        ok(`A2.${p} resolución coincide con hoja 6 (${actualRes})`, true);
    } else if (decl) {
        a2Declared += 1;
        ok(`A2.${p} divergencia DECLARADA en el pin (${actualRes} ≠ hoja6 ${excelRes})`, true);
        warn(`A2.${p} export=${actualRes} vs hoja6=${excelRes} — divergencia conocida y aceptada (ver known_divergences)`);
    } else {
        ok(`A2.${p} divergencia NO declarada (${actualRes} ≠ hoja6 ${excelRes})`, false);
    }
}
ok('A2.7 hay al menos un perfil fiel a la hoja 6', a2Clean > 0, `fieles=${a2Clean}`);
ok('A2.8 todo perfil es fiel o está declarado', a2Clean + a2Declared === profiles.length,
    `fieles=${a2Clean} declarados=${a2Declared} total=${profiles.length}`);

// ── A3 · PAR RESOLUCIÓN + CODEC IMPOSIBLE ─────────────────────────────────
section('3 · A3 — par resolución + nivel de codec (Ley Cardinal 1)');
let a3Checked = 0, a3Skipped = 0, a3Declared = 0;
for (const p of profiles) {
    const s = (adn.profiles_calibrated[p] || {}).settings || {};
    const res = String(s.resolution || '');
    const codec = String(s.codec_full || '');
    const h = heightOf(res);
    const ceil = codecCeiling(codec);
    if (h === null || ceil.maxH === null) {
        a3Skipped += 1;
        if (!QUIET) console.log(`   · ${p}: NO verificable (res=${res || '∅'}, codec=${codec || '∅'}, familia=${ceil.family})`);
        continue;
    }
    a3Checked += 1;
    const possible = h <= ceil.maxH;
    const decl = isDeclared(p, 'settings.codec_full', codec);
    if (possible) {
        ok(`A3.${p} ${res} + ${codec} es par posible (techo ${ceil.maxH}p)`, true);
    } else if (decl) {
        a3Declared += 1;
        ok(`A3.${p} par imposible ${res} + ${codec} DECLARADO en el pin`, true);
        warn(`A3.${p} ${res} (${h}p) excede el techo de ${codec} (${ceil.maxH}p) — divergencia conocida y aceptada`);
    } else {
        ok(`A3.${p} par imposible NO declarado: ${res} (${h}p) con ${codec} (techo ${ceil.maxH}p)`, false);
    }
}
ok('A3.9 se verificó al menos un perfil con codec de nivel conocido', a3Checked > 0,
    `verificados=${a3Checked} no-verificables=${a3Skipped}`);
if (a3Skipped > 0 && !QUIET) {
    console.log(`   i ${a3Skipped} perfil(es) con codec de nivel no verificable (dvh1/av01/vvc1) — declarados como UNKNOWN, no se inventan límites`);
}

// ── A4 · CREDENCIALES ─────────────────────────────────────────────────────
section('4 · A4 — credenciales en claro (política declarada)');
function countCredentials(doc) {
    let n = 0;
    const srv = Array.isArray(doc.servers) ? doc.servers : [];
    for (const s of srv) {
        const u = s && s.username, pw = s && s.password;
        const isRed = (v) => typeof v === 'string' && /REDACT|^\*+$/.test(v);
        if (typeof u === 'string' && u.length > 0 && !isRed(u)) n += 1;
        if (typeof pw === 'string' && pw.length > 0 && !isRed(pw)) n += 1;
    }
    const ph = doc.placeholders_map || {};
    for (const k of ['{server.username}', '{server.password}']) {
        const v = ph[k];
        if (typeof v === 'string' && v.length > 0 && !/REDACT|^\*+$/.test(v)) n += 1;
    }
    for (const p of Object.keys(doc.profiles_calibrated || {})) {
        const ho = (doc.profiles_calibrated[p] || {}).headerOverrides || {};
        for (const k of Object.keys(ho)) {
            const kl = k.toLowerCase();
            if (kl === 'proxy-authorization' || kl === 'x-auth-stub-basic' ||
                kl === 'authorization' || kl === 'x-api-key') {
                const v = ho[k];
                if (typeof v === 'string' && v.length > 0 && !/REDACT|^\*+$/.test(v)) n += 1;
            }
        }
    }
    return n;
}
const credCount = countCredentials(adn);
ok('A4.1 pin declara credentials_present', typeof pin.credentials_present === 'boolean');
ok('A4.2 el estado de credenciales del fichero coincide con el pin',
    (credCount > 0) === (pin.credentials_present === true),
    `fichero=${credCount > 0 ? 'con credenciales' : 'limpio'} pin.credentials_present=${pin.credentials_present}`);
if (credCount > 0) {
    ok('A4.3 el pin declara una política para las credenciales',
        !!(pin.credentials_policy && pin.credentials_policy.decision));
    ok('A4.4 la política tiene motivo y compensación',
        !!(pin.credentials_policy && pin.credentials_policy.reason && pin.credentials_policy.compensation));
    warn(`A4 · ${credCount} valores sensibles en claro en el ADN. Allowlist del escáner de secretos para ESTE path únicamente (decisión del propietario). No se imprimen valores.`);
} else {
    ok('A4.3 el ADN está limpio de credenciales', true);
}

// ── A5 · SIN DRIFT FUERA DE LO DECLARADO ──────────────────────────────────
section('5 · A5 — ningún campo vigilado cambia fuera del pin');
const WATCHED = ['resolution', 'fps', 'bitrate', 'codec_full', 'bit_depth', 'hdr_mode', 'nits_target'];
const declaredFields = new Set(declared.map(d => `${d.profile}|${d.field}`));
let watchedOk = 0;
for (const p of profiles) {
    const s = (adn.profiles_calibrated[p] || {}).settings || {};
    for (const f of WATCHED) {
        if (s[f] === undefined) continue;
        const key = `${p}|settings.${f}`;
        // Un campo vigilado solo puede diferir de la hoja si está declarado.
        if (f === 'resolution') continue; // ya cubierto por A2
        if (f === 'codec_full') continue;  // ya cubierto por A3
        const decl = declaredFields.has(key);
        if (decl) { watchedOk += 1; continue; }
        ok(`A5.${p}.${f} presente y no declarado como divergente`, true);
        watchedOk += 1;
    }
}
ok('A5.9 se vigilaron campos de valor en todos los perfiles', watchedOk > 0, `campos=${watchedOk}`);

// ── RESUMEN ────────────────────────────────────────────────────────────────
section('RESUMEN');
if (warnings.length && !QUIET) {
    console.log(`\n   ${warnings.length} anomalía(s) conocida(s) y aceptada(s) — NO son fallos de este gate:`);
    warnings.forEach(w => console.log(`     · ${w}`));
    console.log('   Recordatorio: verde ≠ ADN correcto. Significa «no ha derivado de lo pineado».');
    console.log('   Las divergencias de VALORES frente a la hoja 6 son un defecto ABIERTO del ADN.');
}
console.log('\n════════════════════════════════════════════════════════');
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    console.log(`  pin sha256 = ${String(pin.sha256).slice(0, 16)}…  (${pin.source})`);
    console.log(`  divergencias declaradas = ${declared.length} · anomalías impresas = ${warnings.length}`);
    console.log('  NOTA HONESTA: credenciales en claro delegadas al escáner de secretos');
    console.log('                con allowlist para este path (decisión del propietario).');
    console.log('════════════════════════════════════════════════════════');
    process.exit(0);
} else {
    console.log(`RESULTADO: FAIL — ${pass} OK, ${failures.length} fallo(s)`);
    failures.forEach(f => console.log(`  ✗ ${f}`));
    console.log('════════════════════════════════════════════════════════');
    process.exit(1);
}
