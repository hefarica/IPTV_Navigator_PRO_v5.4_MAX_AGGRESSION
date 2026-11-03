#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * deploy_parity_assert.js · [t112]
 *
 * EL DEPLOY DECÍA "success" CON EL GATEWAY SIN INSTALAR.
 *   repo:   ape_gateway.lua  21.327 B  sha 7211eeb8…
 *   remoto: ape_gateway.lua  11.748 B  sha 2dc0fad8…
 *   y el run salió `success`.
 *
 * Causa (deploy.sh): instalaba desde $STAGING todas las filas del manifiesto,
 * pero solo se subían a staging las que cambiaban (:29), y :40 salía con
 * éxito si no había ninguna. Nunca se comparó el hash DESPUÉS de instalar.
 *
 * Este gate comprueba:
 *   §1 el manifiesto es consistente y sus fuentes existen
 *   §2 deploy.sh tiene la lista de staged + la paridad sha256 tras instalar
 *   §3 verify.sh tiene el bloque de paridad ANTES del exit 0
 *   §4 (opcional, APE_PARITY_LIVE=1) comparación remota real por ssh
 *
 * LIMITACIÓN DECLARADA: sin acceso al VPS este gate NO puede comparar contra
 * el fichero instalado; eso lo hace el job `verify` del pipeline con el mismo
 * código. Aquí se prueba el mecanismo y el manifiesto, no el estado remoto.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, '_vps_stage', 'deploy', 'manifest.tsv');
const DEPLOY = path.join(ROOT, '_vps_stage', 'deploy', 'deploy.sh');
const VERIFY = path.join(ROOT, '_vps_stage', 'deploy', 'verify.sh');

let pass = 0;
const failures = [];
const ok = (n, c, d) => { if (c) { pass += 1; return true; } failures.push(d ? `${n} — ${d}` : n); return false; };
const section = (t) => console.log(`\n── ${t}`);

console.log('══ t112 · DEPLOY PARITY ASSERT (repo sha256 == remoto) ══');

// ── §1 manifiesto ─────────────────────────────────────────────────────────
section('[1] Manifiesto: filas, columnas, fuentes y destinos');
const rows = fs.readFileSync(MANIFEST, 'utf8').split('\n')
    .filter(l => l.trim() !== '' && !/^\s*#/.test(l))
    .map(l => l.split('\t'));

ok('1.1 el manifiesto tiene filas', rows.length > 0, String(rows.length));
let badCols = 0, missing = 0, dupDst = 0;
const seenDst = new Set();
for (const r of rows) {
    if (r.length < 5) { badCols += 1; continue; }
    const [src, dst] = r;
    if (!fs.existsSync(path.join(ROOT, src))) { missing += 1; console.log(`      falta la fuente: ${src}`); }
    if (seenDst.has(dst)) { dupDst += 1; console.log(`      destino duplicado: ${dst}`); }
    seenDst.add(dst);
}
ok('1.2 todas las filas tienen 5 columnas', badCols === 0, `${badCols} mal formadas`);
ok('1.3 todas las fuentes existen en el repo', missing === 0, `${missing} ausentes`);
ok('1.4 no hay destinos duplicados', dupDst === 0, `${dupDst} duplicados`);

// El gateway debe estar en el manifiesto (es el que no se instaló)
const gwRow = rows.find(r => /ape_gateway\.lua/.test(r[0] || ''));
ok('1.5 el gateway ESTÁ en el manifiesto', !!gwRow, 'no aparece');
if (gwRow) {
    const gwPath = path.join(ROOT, gwRow[0]);
    const sz = fs.existsSync(gwPath) ? fs.statSync(gwPath).size : 0;
    const sha = fs.existsSync(gwPath) ? crypto.createHash('sha256').update(fs.readFileSync(gwPath)).digest('hex') : '';
    ok('1.6 el gateway del repo es el de 21.3 KB', sz > 20000 && sz < 25000, `${sz} B`);
    ok('1.7 el gateway tiene el egress-retry', /_ape_egress_retry/.test(fs.readFileSync(gwPath, 'utf8')));
    console.log(`      ${gwRow[0]} → ${gwRow[1]} · ${sz} B · ${sha.slice(0, 12)}…`);
}

// ── §2 deploy.sh ──────────────────────────────────────────────────────────
section('[2] deploy.sh: staging selectivo + paridad tras instalar');
const dsh = fs.readFileSync(DEPLOY, 'utf8');
ok('2.1 registra lo que se sube a staging (STAGED_LIST)', /STAGED_LIST/.test(dsh));
ok('2.2 solo instala lo que está en staging', /grep -qxF "\$dst"/.test(dsh));
ok('2.3 aborta si el fichero de staging no existe', /no existe pero .* está en STAGED_LIST/.test(dsh));
ok('2.4 compara sha256 DESPUÉS de instalar', /PARIDAD ROTA/.test(dsh));
ok('2.5 el fallo de paridad marca fail=1', /PARIDAD ROTA[\s\S]{0,80}fail=1/.test(dsh));
ok('2.6 el fail dispara rollback', /if \[ "\$fail" -ne 0 \] \|\| ! rsh "nginx -t"/.test(dsh));
ok('2.7 conserva el aviso de que solo instala lo staged', /NO-STAGED/.test(dsh));

// ── §3 verify.sh ──────────────────────────────────────────────────────────
section('[3] verify.sh: paridad obligatoria ANTES de declarar success');
const vsh = fs.readFileSync(VERIFY, 'utf8');
ok('3.1 tiene el bloque de paridad', /PARIDAD sha256 repo == remoto/.test(vsh));
ok('3.2 cuenta las filas con paridad rota', /parity_bad/.test(vsh));
ok('3.3 sale con código != 0 si hay paridad rota', /parity_bad.*-ne 0[\s\S]{0,120}exit 2/.test(vsh));
const iParity = vsh.indexOf('PARIDAD sha256 repo == remoto');
const iExit0 = vsh.lastIndexOf('exit 0');
ok('3.4 el bloque está ANTES del exit 0 (no es código muerto)', iParity > 0 && iParity < iExit0,
    `paridad@${iParity} exit0@${iExit0}`);
ok('3.5 recorre TODO el manifiesto (manifest_rows, fd3 o stdin)', /done (?:3)?< <\(manifest_rows\)/.test(vsh.slice(iParity, iParity + 2000)));

// ── §4 comparación remota real (opcional) ────────────────────────────────
section('[4] Comparación remota real (solo con APE_PARITY_LIVE=1)');
if (process.env.APE_PARITY_LIVE !== '1') {
    console.log('   · [NOT_RUN] sin APE_PARITY_LIVE=1 — el estado remoto lo verifica el job `verify` del pipeline');
} else {
    let checked = 0, mismatched = 0;
    for (const r of rows) {
        if (r.length < 5) continue;
        const [src, dst] = r;
        const lf = path.join(ROOT, src);
        if (!fs.existsSync(lf)) continue;
        const want = crypto.createHash('sha256').update(fs.readFileSync(lf)).digest('hex');
        let got = '';
        try {
            got = execFileSync('ssh', [process.env.APE_SSH_TARGET || 'vps', `sha256sum '${dst}'`], { encoding: 'utf8' }).split(' ')[0].trim();
        } catch (e) { got = 'ERROR'; }
        checked += 1;
        if (want !== got) { mismatched += 1; console.log(`      PARIDAD-ROTA ${dst} repo=${want.slice(0, 12)} remoto=${String(got).slice(0, 12)}`); }
    }
    ok(`4.1 ${checked} ficheros comparados con el remoto`, checked > 0, String(checked));
    ok('4.2 paridad remota completa', mismatched === 0, `${mismatched} con paridad rota`);
}

console.log('\n' + '═'.repeat(64));
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    console.log('   el deploy ya no puede declarar success sin paridad de hashes');
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s)`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(1);
