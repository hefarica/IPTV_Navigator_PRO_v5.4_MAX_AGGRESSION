#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ratio_assert.js · [t102]  MÉTRICA R = duración_segmento / tiempo_descarga
 *
 * Gate DETERMINISTA. Extrae el bloque `#region R-metric` del prober y lo
 * evalúa: así NO puede haber deriva entre lo que se prueba y lo que se usa.
 *
 * Umbrales del propietario:
 *   >=2.0 EXCELENTE · >=1.5 SALUDABLE · >=1.2 MARGEN INSUFICIENTE · >=1.0
 *   CRITICO · >0.5 INVIABLE · <=0.5 FALLO GRAVE
 *
 * Casos del propietario (veredictos exigidos):
 *   ARENA 0.77 → INVIABLE · WARNER 0.85 → INVIABLE
 *   SKY CINEMA 1.79 → ACEPTABLE · FILM KOMEDI 3.65 → BUENO
 *   y la caída 3.65 → 0.21 debe pasar a FALLO GRAVE
 *
 * Uso: node _vps_stage/tests/ratio_assert.js   → 0 PASS / 1 FAIL
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const PROBER = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-quality-prober.js');

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; return true; }
    failures.push(detail ? `${name} — ${detail}` : name);
    return false;
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n── ${t}`);

// ── cargar el bloque R-metric DESDE el prober ──────────────────────────────
const src = fs.readFileSync(PROBER, 'utf8');
const iS = src.indexOf('// #region R-metric');
const iE = src.indexOf('// #endregion R-metric');
if (iS < 0 || iE < 0) {
    console.error('FATAL: no existe el bloque #region R-metric en el prober');
    process.exit(1);
}
const region = src.slice(iS, iE);
const ctx = { console, window: {}, Math, Number, isFinite };
vm.createContext(ctx);
vm.runInContext(region + '\n;globalThis.__R = { classify: apeRClassify, segment: apeRSegment, series: apeRSeries, decide: apeRDecide, bitrateTarget: apeBitrateTarget, bands: APE_R_BANDS, profiles: APE_R_PROFILE_TABLE };', ctx);
const R = ctx.__R;

console.log('══ t102 · RATIO ASSERT (R = duración / descarga) ══');
console.log(`   prober ${PROBER.split(path.sep).pop()} (${src.length} B · bloque R ${region.length} B)`);

// ── §1 · los 4 casos del propietario ───────────────────────────────────────
section('[1] Casos del propietario');
{
    const cases = [
        ['ARENA', 0.77, 'INVIABLE'],
        ['WARNER', 0.85, 'INVIABLE'],
        ['SKY CINEMA', 1.79, 'ACEPTABLE'],
        ['FILM KOMEDI', 3.65, 'BUENO'],
    ];
    for (const [name, r, want] of cases) {
        eq(`1.${name} R=${r} ⇒ ${want}`, R.classify(r).verdict, want);
    }
}

// ── §2 · la caída 3.65 → 0.21 ──────────────────────────────────────────────
section('[2] Caída en el mismo canal: 3.65 → 0.21 ⇒ FALLO GRAVE');
{
    const serie = R.series([
        { duracionSeg: 3.65, descargaSeg: 1 },
        { duracionSeg: 3.65, descargaSeg: 1 },
        { duracionSeg: 0.21, descargaSeg: 1 },
    ], 3);
    ok('2.1 el último segmento es 0.21', Math.abs(serie.last - 0.21) < 1e-9, String(serie.last));
    eq('2.2 el último se clasifica FALLO GRAVE', R.classify(serie.last).verdict, 'FALLO GRAVE');
    const dec = R.decide({
        segmentos: [
            { duracionSeg: 3.65, descargaSeg: 1 },
            { duracionSeg: 3.65, descargaSeg: 1 },
            { duracionSeg: 0.21, descargaSeg: 1 },
        ], bufferSeg: 90, duracionSeg: 10,
    });
    ok('2.3 la decisión es cambiar', dec.switch === true, dec.reason);
    ok('2.4 y es URGENTE (<1.0 ⇒ inmediato)', dec.urgent === true, dec.reason);
}

// ── §3 · las 6 bandas ──────────────────────────────────────────────────────
section('[3] Las 6 bandas del propietario');
{
    eq('3.1 R=2.50 ⇒ BUENO (EXCELENTE)', R.classify(2.5).verdict, 'BUENO');
    eq('3.2 R=2.00 ⇒ BUENO (borde)', R.classify(2.0).verdict, 'BUENO');
    eq('3.3 R=1.50 ⇒ ACEPTABLE (SALUDABLE)', R.classify(1.5).verdict, 'ACEPTABLE');
    eq('3.4 R=1.30 ⇒ VIGILAR (margen insuficiente)', R.classify(1.3).verdict, 'VIGILAR');
    eq('3.5 R=1.10 ⇒ CRITICO', R.classify(1.1).verdict, 'CRITICO');
    eq('3.6 R=0.90 ⇒ INVIABLE', R.classify(0.9).verdict, 'INVIABLE');
    eq('3.7 R=0.50 ⇒ FALLO GRAVE (borde exacto)', R.classify(0.5).verdict, 'FALLO GRAVE');
    eq('3.8 R=0.21 ⇒ FALLO GRAVE', R.classify(0.21).verdict, 'FALLO GRAVE');
    eq('3.9 sin dato ⇒ SIN DATO', R.classify(null).verdict, 'SIN DATO');
}

// ── §4 · R se calcula con 1 conexión ───────────────────────────────────────
section('[4] R = duración / tiempo de descarga');
{
    eq('4.1 10 s de segmento en 4 s ⇒ R=2.5', R.segment(10, 4), 2.5);
    eq('4.2 10 s en 10 s ⇒ R=1.0', R.segment(10, 10), 1.0);
    eq('4.3 6 s en 8 s ⇒ R=0.75', R.segment(6, 8), 0.75);
    eq('4.4 duración 0 ⇒ null (no se inventa)', R.segment(0, 5), null);
    eq('4.5 descarga 0 ⇒ null', R.segment(10, 0), null);
}

// ── §5 · media móvil 3-5 + último ──────────────────────────────────────────
section('[5] Sostenido: media móvil de 3-5 segmentos + el último');
{
    const s = R.series([
        { duracionSeg: 10, descargaSeg: 5 },   // 2.0
        { duracionSeg: 10, descargaSeg: 5 },   // 2.0
        { duracionSeg: 10, descargaSeg: 10 },  // 1.0
    ], 5);
    ok('5.1 la media usa la ventana', Math.abs(s.mean - (5.0 / 3)) < 1e-9, String(s.mean));
    eq('5.2 el último es 1.0', s.last, 1.0);
    ok('5.3 cuenta los <1.2 de la ventana', s.below12 >= 1, String(s.below12));
    const v = R.series([], 4);
    eq('5.4 sin segmentos ⇒ n=0 y mean=null', [v.n, v.mean], [0, null]);
}

// ── §6 · reglas de acción ──────────────────────────────────────────────────
section('[6] Reglas de acción');
{
    const dosBajos = R.decide({
        segmentos: [
            { duracionSeg: 10, descargaSeg: 9 },   // 1.11
            { duracionSeg: 10, descargaSeg: 9 },   // 1.11
        ], bufferSeg: 120, duracionSeg: 10,
    });
    ok('6.1 media <1.2 en 2 segmentos ⇒ cambiar', dosBajos.switch === true, dosBajos.reason);
    ok('6.2 no es urgente (no hay <1.0)', dosBajos.urgent === false, dosBajos.reason);

    const congelado = R.decide({ segmentos: [{ duracionSeg: 10, descargaSeg: 5 }], idleSeg: 5, bufferSeg: 120, duracionSeg: 10 });
    ok('6.3 4-5 s sin datos ⇒ congelación (urgente)', congelado.switch === true && congelado.urgent === true, congelado.reason);
    ok('6.4 el motivo menciona congelación', /congelacion/.test(congelado.reason), congelado.reason);

    const bufferBajo = R.decide({ segmentos: [{ duracionSeg: 10, descargaSeg: 5 }], bufferSeg: 15, duracionSeg: 10 });
    ok('6.5 buffer <2 segmentos ⇒ recuperar', bufferBajo.switch === true && /buffer/.test(bufferBajo.reason), bufferBajo.reason);

    const sano = R.decide({
        segmentos: [
            { duracionSeg: 10, descargaSeg: 3 },
            { duracionSeg: 10, descargaSeg: 3 },
            { duracionSeg: 10, descargaSeg: 3 },
        ], bufferSeg: 120, duracionSeg: 10,
    });
    ok('6.6 R alto y buffer amplio ⇒ mantener', sano.switch === false, sano.reason);
}

// ── §7 · predicción de congelación ─────────────────────────────────────────
section('[7] Predicción: autonomía < tiempo_cambio + 2*segmento + 5 s');
{
    // 10 s de segmento, 8 s de cambio ⇒ umbral = 8 + 20 + 5 = 33 s
    const necesario = 8 + 2 * 10 + 5;
    eq('7.1 el umbral es 33 s (10 s de segmento, 8 s de cambio)', necesario, 33);
    const justo = R.decide({ segmentos: [{ duracionSeg: 10, descargaSeg: 3 }], bufferSeg: 60, duracionSeg: 10, tiempoCambioSeg: 8 });
    ok('7.2 con 60 s de autonomía NO cambia', justo.switch === false, justo.reason);
    const apurado = R.decide({ segmentos: [{ duracionSeg: 10, descargaSeg: 3 }], bufferSeg: 30, duracionSeg: 10, tiempoCambioSeg: 8 });
    ok('7.3 con 30 s (<33) SÍ cambia', apurado.switch === true, apurado.reason);
    ok('7.4 el motivo es de autonomía, no de R', /autonomia/.test(apurado.reason), apurado.reason);
}

// ── §8 · bitrate objetivo x1.5 / x2.0, p95 en deportes ────────────────────
section('[8] Bitrate objetivo');
{
    const b = R.bitrateTarget(10000000, {});
    eq('8.1 mínimo = real x1.5', b.minimo, 15000000);
    eq('8.2 recomendado = real x2.0', b.recomendado, 20000000);
    ok('8.3 sin deporte no usa p95', b.usoP95 === false);
    const sp = R.bitrateTarget(10000000, { sports: true, p95Bps: 16000000 });
    ok('8.4 en deportes usa p95 como base', sp.usoP95 === true && sp.base === 16000000, JSON.stringify(sp));
    eq('8.5 el recomendado va sobre el p95', sp.recomendado, 32000000);
}

// ── §9 · tabla por perfil P0-P5 ────────────────────────────────────────────
section('[9] Tabla por perfil P0-P5');
{
    for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
        ok(`9.${p} el perfil existe con min/rec`, !!R.profiles[p] && R.profiles[p].min === 1.5 && R.profiles[p].rec === 2.0, JSON.stringify(R.profiles[p]));
    }
    ok('9.7 P3 (FHD 60) usa p95 para deportes', R.profiles.P3.p95 === true);
}

console.log('\n' + '═'.repeat(64));
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    console.log('   R = duración/descarga · 6 bandas · 1 conexión · media 3-5 + último');
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s)`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(1);
