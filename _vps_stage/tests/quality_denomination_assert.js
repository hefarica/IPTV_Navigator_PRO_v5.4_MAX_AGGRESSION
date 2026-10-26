#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * quality_denomination_assert.js · [t85]
 *
 * ESPECIFICACIÓN DEL PROPIETARIO: la DENOMINACIÓN de calidad debe ser
 * DETERMINISTA y verificable. Mismo input ⇒ misma denominación, siempre.
 * La prueba es POR PERFIL (P0..P5), NO por canal.
 *
 * COMPRUEBA:
 *   §1  Clasificador disponible y precedencia FIJA:
 *       8K-FAKE > 4K-TRUE > 4K-REMUX > 4K-UPSCALING > 4K-FAKE
 *   §2  NUNCA por debajo de 4K: 480p/720p ⇒ 4K-FAKE (nunca 1080p/720p).
 *   §3  RANGOS por denominación y clamp del bitrate real dentro del rango.
 *   §4  AVERAGE = 0.80 × BANDWIDTH (redondeado).
 *   §5  Instrumentación: qualityTag, rangeTag, STABLE-VARIANT-ID, resolución.
 *   §6  FRAME-RATE ≤ 60.
 *   §7  Matriz P0..P5 × 5 denominaciones: caso por perfil y denominación.
 *   §8  DETERMINISMO: dos corridas del mismo caso ⇒ resultado idéntico (SHA).
 *
 * Uso: node _vps_stage/tests/quality_denomination_assert.js   → 0 PASS / 1 FAIL
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const EMITTER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; return true; }
    failures.push(detail ? `${name} — ${detail}` : name);
    return false;
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n── ${t}`);

// ── Cargar el clasificador desde el emisor (región t29-core) ────────────────
const src = fs.readFileSync(EMITTER, 'utf8');
const iS = src.indexOf('// #region t29-core');
const iE = src.indexOf('// #endregion t29-core');
if (iS < 0 || iE < 0) { console.error('FATAL: bloque #region t29-core no encontrado'); process.exit(1); }
const region = src.slice(iS, iE);
const ctx = { console, window: {} };
vm.createContext(ctx);
try {
    vm.runInContext(region + '\n;globalThis.__Q = { denom: __apeQualityDenomination, ranges: APE_QUALITY_RANGES };', ctx);
} catch (e) {
    console.error('FATAL: no se pudo evaluar la región t29-core: ' + e.message);
    process.exit(1);
}
if (typeof ctx.__Q?.denom !== 'function') {
    console.error('FATAL: el emisor no expone __apeQualityDenomination (t85)');
    process.exit(1);
}
const denom = ctx.__Q.denom;
const RANGES = ctx.__Q.ranges;

const PROFILES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const DENOMS = ['4K-TRUE', '4K-REMUX', '4K-UPSCALING', '4K-FAKE', '8K-FAKE'];

// Caso determinista por denominación (el mismo para todos los perfiles).
const CASES = {
    '4K-TRUE': { height: 2160, codec: 'hvc1.2.4.L153.B0', bitrate: 30000000, fps: 60, channelId: 'ch-true' },
    '4K-REMUX': { height: 2160, codec: 'avc1.640033', bitrate: 40000000, fps: 30, channelId: 'ch-remux' },
    '4K-UPSCALING': { height: 1080, codec: 'hvc1.2.4.L120.B0', bitrate: 9000000, fps: 30, channelId: 'ch-ups' },
    '4K-FAKE': { height: 720, codec: 'avc1.640029', bitrate: 3000000, fps: 30, channelId: 'ch-fake' },
    '8K-FAKE': { height: 2160, codec: 'hvc1.2.4.L153.B0', bitrate: 20000000, fps: 60, fakeUhd: '8k', channelId: 'ch-8k' },
};

console.log('══ t85 · QUALITY DENOMINATION ASSERT (determinista, por perfil) ══');
console.log(`   emisor   ${EMITTER.split(path.sep).pop()} (${src.length} B, bloque ${region.length} B)`);

// ── §1 · clasificador y precedencia ─────────────────────────────────────────
section('[1] Clasificador disponible y precedencia FIJA');
{
    ok('1.0 __apeQualityDenomination es función', typeof denom === 'function');
    const t = denom(CASES['4K-TRUE']);
    eq('1.1 fuente 4K + HEVC ⇒ 4K-TRUE', t.denom, '4K-TRUE');
    const tr = denom({ height: 2160, codec: 'avc1.640033', bitrate: 40000000, fps: 30 });
    eq('1.2 4K con AVC y bitrate ≥25 Mbps ⇒ 4K-REMUX', tr.denom, '4K-REMUX');
    const up = denom(CASES['4K-UPSCALING']);
    eq('1.3 fuente 1080p ⇒ 4K-UPSCALING', up.denom, '4K-UPSCALING');
    const fk = denom(CASES['4K-FAKE']);
    eq('1.4 fuente 720p ⇒ 4K-FAKE', fk.denom, '4K-FAKE');
    const k8 = denom(CASES['8K-FAKE']);
    eq('1.5 opt-in 8k ⇒ 8K-FAKE', k8.denom, '8K-FAKE');
    // Precedencia: 8K-FAKE gana aunque la fuente sea 4K real con HEVC.
    eq('1.6 8K-FAKE tiene PRECEDENCIA sobre 4K-TRUE',
        denom({ height: 2160, codec: 'hvc1.2.4.L153.B0', bitrate: 50000000, fps: 60, fakeUhd: '8k' }).denom, '8K-FAKE');
    // AV1 también entra en 4K-TRUE.
    eq('1.7 AV1 en 4K ⇒ 4K-TRUE', denom({ height: 2160, codec: 'av01.0.10M.10', bitrate: 20000000 }).denom, '4K-TRUE');
}

// ── §2 · NUNCA por debajo de 4K ─────────────────────────────────────────────
section('[2] NUNCA una denominación por debajo de 4K');
{
    for (const h of [480, 576, 720, 1080, 1440, 2160, 4320]) {
        const d = denom({ height: h, codec: 'avc1.640028', bitrate: 4000000, fps: 30 }).denom;
        ok(`2.h${h} ${h}p ⇒ denominación 4K/8K (no 1080p/720p)`, /^(4K|8K)-/.test(d), d);
    }
    ok('2.9 ninguno de los 7 devuelve una etiqueta < 4K',
        [480, 720, 1080, 1440, 2160, 4320].every((h) => /^(4K|8K)-/.test(denom({ height: h, codec: 'x', bitrate: 1 }).denom)));
    ok('2.10 resolución declarada es 4K/8K siempre',
        [480, 720, 1080, 2160].every((h) => /^(3840x2160|7680x4320)$/.test(denom({ height: h }).resolution)));
}

// ── §3 · rangos y clamp ─────────────────────────────────────────────────────
section('[3] RANGOS por denominación + clamp del bitrate real');
{
    eq('3.1 rangos 4K-TRUE', [RANGES['4K-TRUE'].min, RANGES['4K-TRUE'].max], [20000000, 45000000]);
    eq('3.2 rangos 4K-REMUX', [RANGES['4K-REMUX'].min, RANGES['4K-REMUX'].max], [25000000, 60000000]);
    eq('3.3 rangos 4K-UPSCALING', [RANGES['4K-UPSCALING'].min, RANGES['4K-UPSCALING'].max], [6000000, 16000000]);
    eq('3.4 rangos 4K-FAKE', [RANGES['4K-FAKE'].min, RANGES['4K-FAKE'].max], [6000000, 16000000]);
    eq('3.5 rangos 8K-FAKE', [RANGES['8K-FAKE'].min, RANGES['8K-FAKE'].max], [14000000, 35000000]);
    // Clamp por abajo y por arriba.
    eq('3.6 clamp inferior (bitrate 1 Mbps en 4K-TRUE ⇒ min)',
        denom({ height: 2160, codec: 'hvc1.2.4.L153.B0', bitrate: 1000000 }).bitrate, 20000000);
    eq('3.7 clamp superior (bitrate 999 Mbps en 4K-TRUE ⇒ max)',
        denom({ height: 2160, codec: 'hvc1.2.4.L153.B0', bitrate: 999000000 }).bitrate, 45000000);
    // Todo caso cae DENTRO de su rango.
    for (const d of DENOMS) {
        const r = denom(CASES[d]);
        ok(`3.8 ${d} bitrate dentro de su rango`, r.bitrate >= r.min && r.bitrate <= r.max,
            `${r.bitrate} ∉ [${r.min}, ${r.max}]`);
    }
}

// ── §4 · AVERAGE = 0.80 × BANDWIDTH ─────────────────────────────────────────
section('[4] AVERAGE-BANDWIDTH = 0.80 × BANDWIDTH');
{
    for (const d of DENOMS) {
        const r = denom(CASES[d]);
        eq(`4.${d} AVERAGE = 0.8 × BANDWIDTH`, r.average, Math.round(r.bandwidth * 0.8));
        ok(`4b.${d} AVERAGE ≤ BANDWIDTH`, r.average <= r.bandwidth);
    }
}

// ── §5 · instrumentación ────────────────────────────────────────────────────
section('[5] Instrumentación: los 3 tags + resolución');
{
    for (const d of DENOMS) {
        const r = denom(CASES[d]);
        eq(`5.${d} qualityTag`, r.qualityTag, '#EXT-X-APE-QUALITY:' + d);
        ok(`5b.${d} rangeTag con min/max/bitrate`,
            r.rangeTag === `#EXT-X-APE-QUALITY-RANGE:min=${r.min},max=${r.max},bitrate=${r.bitrate}`, r.rangeTag);
        eq(`5c.${d} STABLE-VARIANT-ID`, r.stableVariantId, CASES[d].channelId + '_' + d);
    }
    eq('5.z resolución 8K-FAKE', denom(CASES['8K-FAKE']).resolution, '7680x4320');
    eq('5.z2 resolución del resto', denom(CASES['4K-FAKE']).resolution, '3840x2160');
}

// ── §6 · FRAME-RATE ≤ 60 ────────────────────────────────────────────────────
section('[6] FRAME-RATE ≤ 60 (nunca L186)');
{
    for (const f of [24, 25, 30, 50, 60, 120, 240]) {
        ok(`6.f${f} fps ≤ 60`, denom({ height: 2160, codec: 'hvc1.2.4.L153.B0', bitrate: 30000000, fps: f }).fps <= 60);
    }
    eq('6.9 60 fps se conserva', denom({ height: 2160, fps: 60 }).fps, 60);
}

// ── §7 · matriz P0..P5 × 5 denominaciones ───────────────────────────────────
section('[7] Matriz P0..P5 × 5 denominaciones (caso determinista por par)');
{
    for (const p of PROFILES) {
        for (const d of DENOMS) {
            const inp = Object.assign({ profile: p }, CASES[d]);
            const r = denom(inp);
            const inRange = r.bitrate >= r.min && r.bitrate <= r.max;
            ok(`7.${p}.${d} denominación + rango + resolución 4K/8K`,
                r.denom === d && inRange && /^(3840x2160|7680x4320)$/.test(r.resolution) && r.fps <= 60,
                `${r.denom} bitrate=${r.bitrate} res=${r.resolution} fps=${r.fps}`);
        }
    }
}

// ── §8 · DETERMINISMO ───────────────────────────────────────────────────────
section('[8] DETERMINISMO: dos corridas ⇒ mismo resultado (SHA)');
{
    const sha = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
    for (const d of DENOMS) {
        const a = sha(denom(CASES[d]));
        const b = sha(denom(CASES[d]));
        eq(`8.${d} mismo input ⇒ mismo SHA`, a, b);
    }
    // Estabilidad frente a orden de ejecución (sin estado oculto).
    const first = sha(PROFILES.map((p) => DENOMS.map((d) => denom(Object.assign({ profile: p }, CASES[d])))));
    denom({ height: 480 }); // invocación intermedia que NO debe afectar
    const second = sha(PROFILES.map((p) => DENOMS.map((d) => denom(Object.assign({ profile: p }, CASES[d])))));
    eq('8.9 sin estado: la matriz completa da el mismo SHA tras invocaciones intermedias', first, second);
}

// ── Resultado ───────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
const total = pass + failures.length;
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s) de ${total}`);
const shown = failures.slice(0, 30);
for (const f of shown) console.log(`  ✗ ${f}`);
if (failures.length > shown.length) console.log(`  … y ${failures.length - shown.length} más`);
process.exit(1);
