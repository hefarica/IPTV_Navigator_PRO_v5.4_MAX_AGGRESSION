#!/usr/bin/env node
/**
 * lab_absorption_test.js — verifica que LAB_CALIBRATED_BULLETPROOF_*.json
 * declara las 13 secciones que importFromLABData absorbe.
 *
 * Uso:
 *   node frontend/test/lab_absorption_test.js <path_al_json>
 *
 * Exit codes:
 *   0 = OK (todas las secciones presentes en el JSON)
 *   1 = MISSED (alguna sección requerida falta)
 *   2 = USAGE error (falta path)
 *
 * Doctrina: este test verifica el CONTRATO del LAB, no el comportamiento del frontend
 * (eso lo hace lab_absorption_runtime.js paste-en-DevTools).
 */
'use strict';

const fs = require('fs');
const path = process.argv[2];
if (!path) {
    console.error('usage: node lab_absorption_test.js <LAB_CALIBRATED_BULLETPROOF.json>');
    process.exit(2);
}

let raw;
try {
    raw = fs.readFileSync(path, 'utf8');
} catch (e) {
    console.error('No se puede leer:', path, '\n  ', e.message);
    process.exit(2);
}

// Strip UTF-8 BOM si lo trae (Excel exporta con BOM)
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

let j;
try {
    j = JSON.parse(raw);
} catch (e) {
    console.error('JSON inválido:', e.message);
    process.exit(1);
}

const expectations = [
    { jsonPath: 'lab_version',         absorbedAs: 'labVersion',         note: 'Schema validation' },
    { jsonPath: 'lab_schema_variant',  absorbedAs: 'labSchemaVariant',   note: 'Bulletproof flag' },
    { jsonPath: 'bulletproof',         absorbedAs: 'bulletproof',        note: 'Bulletproof boolean' },
    { jsonPath: 'meta_per_profile',    absorbedAs: 'labMetaPerProfile',  note: 'Per-profile meta' },
    { jsonPath: 'profiles_calibrated', absorbedAs: 'profiles',           note: '6 perfiles P0-P5 calibrados' },
    { jsonPath: 'nivel1_directives',   absorbedAs: 'nivel1Directives',   note: 'Master playlist headers' },
    { jsonPath: 'nivel3_per_layer',    absorbedAs: 'nivel3PerLayer',     note: 'Per-channel templates por layer' },
    { jsonPath: 'placeholders_map',    absorbedAs: 'placeholdersMap',    note: '{ns.key} → valor' },
    { jsonPath: 'evasion_pool',        absorbedAs: 'evasionPool',        note: 'UAs + referers rotation' },
    { jsonPath: 'config_global',       absorbedAs: 'configGlobal',       note: '48 params globales' },
    { jsonPath: 'servers',             absorbedAs: 'labServers',         note: 'IPTV servers' },
    { jsonPath: 'scoring_metadata',    absorbedAs: 'labMetadata',        note: 'Scorecard summary' },
    { jsonPath: 'omega_gap_plan',      absorbedAs: 'omegaGapPlan',       note: '50 items REPLICAR/IMPLEMENTAR/QUITAR' }
];

const known = expectations.map(e => e.jsonPath).concat(['playlist_format', 'exported_at']);
const summary = { ok: 0, missed: [], unmapped: [] };

console.log('=== ABSORPTION CHECK (static) ===');
console.log('File:', path);
console.log('');

for (const e of expectations) {
    const exists = e.jsonPath in j && j[e.jsonPath] !== null && j[e.jsonPath] !== undefined;
    const v = j[e.jsonPath];
    let countLabel = '';
    if (Array.isArray(v)) countLabel = ` (${v.length} items)`;
    else if (v && typeof v === 'object') countLabel = ` (${Object.keys(v).length} keys)`;
    if (exists) {
        summary.ok++;
        console.log(`  ✅ ${e.jsonPath}${countLabel} → cfg.${e.absorbedAs}  [${e.note}]`);
    } else {
        summary.missed.push(e.jsonPath);
        console.log(`  ❌ ${e.jsonPath} MISSING (esperado: cfg.${e.absorbedAs})`);
    }
}

for (const k of Object.keys(j)) {
    if (!known.includes(k)) summary.unmapped.push(k);
}

console.log('');
console.log('=== RESULTADO ===');
console.log(`OK:     ${summary.ok} / ${expectations.length}`);
console.log(`MISSED: ${summary.missed.length}${summary.missed.length ? ' → ' + summary.missed.join(', ') : ''}`);
console.log(`UNMAPPED extras (no son gap, solo info): ${summary.unmapped.length}${summary.unmapped.length ? ' → ' + summary.unmapped.join(', ') : ''}`);

if (j.omega_gap_plan && j.omega_gap_plan.summary) {
    const s = j.omega_gap_plan.summary;
    console.log('');
    console.log('=== GAP PLAN ===');
    console.log(`  Total items: ${(j.omega_gap_plan.items || []).length}`);
    console.log(`  REPLICAR:    ${s.replicar || 0}`);
    console.log(`  IMPLEMENTAR: ${s.implementar || 0}`);
    console.log(`  QUITAR:      ${s.quitar || 0}`);
    console.log(`  Scorecard:   ${j.omega_gap_plan.scorecard_total} (Grade ${j.omega_gap_plan.scorecard_grade})`);
}

process.exit(summary.missed.length > 0 ? 1 : 0);
