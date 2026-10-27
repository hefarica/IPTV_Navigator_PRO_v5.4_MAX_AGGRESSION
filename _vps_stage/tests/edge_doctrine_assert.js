#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * edge_doctrine_assert.js · [t100]
 *
 * GUARD DE LA DOCTRINA DEL EGRESS/RESOLVER.
 *
 * Existe porque el edge ya se rompió una vez por tocar el egress sin entenderlo.
 * Este guard OBLIGA a que la decisión esté documentada y a que nadie cambie el
 * gateway sin actualizar su pin sha256 en el documento.
 *
 * FALLA si:
 *   (a) `docs/edge/EDGE_EGRESS_RESOLVER.md` no existe
 *   (b) el aviso «ANTES DE TOCAR: lee docs/edge/EDGE_EGRESS_RESOLVER.md»
 *       desapareció de la cabecera de `ape_gateway.lua` o de `ape_rebase_lib.lua`
 *   (c) el sha256 del gateway NO coincide con el pinneado en el documento
 *       (alguien cambió el gateway sin actualizar el documento)
 *   (d) el documento no contiene las piezas clave de la decisión
 *
 * Uso: node _vps_stage/tests/edge_doctrine_assert.js   → 0 PASS / 1 FAIL
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const DOC = path.join(ROOT, 'docs', 'edge', 'EDGE_EGRESS_RESOLVER.md');
const GW = path.join(ROOT, '_vps_stage', 'lua', 'ape_gateway.lua');
const RB = path.join(ROOT, '_vps_stage', 'lua', 'ape_rebase_lib.lua');

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; return true; }
    failures.push(detail ? `${name} — ${detail}` : name);
    return false;
};
const section = (t) => console.log(`\n── ${t}`);

console.log('══ t100 · EDGE DOCTRINE ASSERT (egress/resolver) ══');

// ── (a) el documento existe ─────────────────────────────────────────────────
section('(a) documento de decisión');
ok('a.1 existe docs/edge/EDGE_EGRESS_RESOLVER.md', fs.existsSync(DOC));
if (!fs.existsSync(DOC)) {
    console.log('\nRESULTADO: FAIL — falta el documento; no se puede verificar nada más');
    process.exit(1);
}
const doc = fs.readFileSync(DOC, 'utf8');

// ── (d) el documento contiene la decisión ───────────────────────────────────
section('(d) el documento contiene la decisión');
ok('d.1 explica el 407', /407/.test(doc));
ok('d.2 nombra el egress/auth del proveedor', /egress|auth/i.test(doc));
ok('d.3 cita los canales de la prueba (3281 y 698)', /3281/.test(doc) && /698/.test(doc));
ok('d.4 cita ape-profile y video-track', /ape-profile/.test(doc) && /video-track/.test(doc));
ok('d.5 registra la decisión (resolver para hosts con egress)', /resolver/i.test(doc));
ok('d.6 incluye comandos reproducibles', /curl/.test(doc));
ok('d.7 declara el log 24 h como UNKNOWN', /UNKNOWN/.test(doc));

// ── (b) aviso obligatorio en las cabeceras ─────────────────────────────────
section('(b) aviso obligatorio en las cabeceras');
for (const [label, p] of [['ape_gateway.lua', GW], ['ape_rebase_lib.lua', RB]]) {
    ok(`b.${label} existe`, fs.existsSync(p));
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    // La cabecera: el aviso debe estar en las primeras 60 líneas (cabecera real)
    const head = src.split('\n').slice(0, 60).join('\n');
    ok(`b.${label} aviso «ANTES DE TOCAR» en cabecera`, /ANTES DE TOCAR/.test(head), 'no encontrado en las primeras 60 líneas');
    ok(`b.${label} el aviso apunta al documento`, /EDGE_EGRESS_RESOLVER\.md/.test(head));
}

// ── (c) pin sha256 del gateway ─────────────────────────────────────────────
section('(c) pin sha256 — el gateway no cambia sin actualizar el documento');
{
    const sha = crypto.createHash('sha256').update(fs.readFileSync(GW)).digest('hex');
    // El documento debe contener ese sha en la tabla de pin
    ok('c.1 el documento contiene el sha256 ACTUAL del gateway', doc.includes(sha),
        `sha actual=${sha} — el documento no lo tiene (cámbialo si el cambio es intencionado y justifica el egress)`);
    // Y debe declarar explícitamente que es un pin
    ok('c.2 el documento declara el pin', /pin|SHA-256/i.test(doc));
    // Aviso de qué hacer si cambia
    ok('c.3 el documento dice qué hacer al cambiarlo', /actualiza el SHA|actualizar el pin|si tocas/i.test(doc));
    // El rebase también pinneado (informativo, no bloqueante si falta)
    const shaRb = crypto.createHash('sha256').update(fs.readFileSync(RB)).digest('hex');
    ok('c.4 el documento contiene el sha256 ACTUAL de ape_rebase_lib.lua', doc.includes(shaRb),
        `sha rebase=${shaRb}`);
}

// ── (e) aviso en COORDENADAS_SESIONES.md ───────────────────────────────────
section('(e) aviso en COORDENADAS_SESIONES.md');
{
    const coord = path.join(ROOT, 'COORDENADAS_SESIONES.md');
    if (!fs.existsSync(coord)) {
        console.log('   · [UNKNOWN] COORDENADAS_SESIONES.md no existe');
    } else {
        const c = fs.readFileSync(coord, 'utf8');
        ok('e.1 menciona el documento de egress', /EDGE_EGRESS_RESOLVER\.md/.test(c));
        ok('e.2 tiene la sección §16', /##\s*§?16/.test(c) || /§16/.test(c));
    }
}

console.log('\n' + '═'.repeat(64));
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    console.log('   doctrina del egress VIGENTE y pinneada');
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s)`);
for (const f of failures) console.log(`  ✗ ${f}`);
console.log('\n   ⛔ Antes de "arreglar" esto: lee docs/edge/EDGE_EGRESS_RESOLVER.md');
process.exit(1);
