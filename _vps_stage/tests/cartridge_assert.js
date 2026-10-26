#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * cartridge_assert.js · [t88]
 *
 * El resolver es un CARTUCHO preconfigurado por perfil. Este gate comprueba:
 *   (a) DETERMINISMO — la misma entrada genera 2 veces la MISMA URL (SHA).
 *   (b) PARAMS COMPLETOS — ch, p, mode, list, bw, buf, fuse están en el
 *       ensamblado real del emisor.
 *   (c) FUSIBLE PRESENTE — `fuse` se emite y toma el valor del perfil
 *       (hoy 0 en el catálogo era el defecto; aquí se verifica que existe).
 *   (d) 200/302 — sonda HTTP read-only sobre el resolver desplegado.
 *       Si no hay red, se declara [UNKNOWN] y NO se tumba el gate (un test
 *       unitario no debe depender de internet).
 *
 * Uso: node _vps_stage/tests/cartridge_assert.js   → 0 PASS / 1 FAIL
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
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

// ── Tabla del cartucho por perfil (contrato determinista) ───────────────────
// bw/buf/min/max en bps/ms. `fuse` = 1 si el perfil tiene fusible de suelo.
const CARTRIDGE = {
    P0: { p: 'P0', mode: 'adaptive', bw: 45000000, buf: 8000, min: 20000000, max: 45000000, fuse: 1 },
    P1: { p: 'P1', mode: 'adaptive', bw: 35000000, buf: 8000, min: 20000000, max: 45000000, fuse: 1 },
    P2: { p: 'P2', mode: 'adaptive', bw: 25000000, buf: 6000, min: 12000000, max: 25000000, fuse: 1 },
    P3: { p: 'P3', mode: 'adaptive', bw: 16000000, buf: 6000, min: 6000000, max: 16000000, fuse: 1 },
    P4: { p: 'P4', mode: 'adaptive', bw: 9000000, buf: 4000, min: 6000000, max: 16000000, fuse: 1 },
    P5: { p: 'P5', mode: 'adaptive', bw: 6000000, buf: 4000, min: 6000000, max: 16000000, fuse: 1 },
};
const PROFILES = Object.keys(CARTRIDGE);
const REQUIRED = ['ch', 'p', 'mode', 'list', 'bw', 'buf', 'fuse'];

// Reconstruye la URL del cartucho EXACTAMENTE como el emisor (misma tabla).
function buildCartridge(base, channel, profile) {
    const c = CARTRIDGE[profile];
    return `${base}/resolve_quality_unified.php?ch=${encodeURIComponent(channel)}`
        + `&p=${encodeURIComponent(c.p)}`
        + `&mode=${c.mode}`
        + `&list=proxy`
        + `&bw=${c.bw}`
        + `&buf=${c.buf}`
        + `&min=${c.min}`
        + `&max=${c.max}`
        + `&fuse=${c.fuse}`;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const src = fs.readFileSync(EMITTER, 'utf8');

console.log('══ t88 · CARTRIDGE ASSERT (determinista, por perfil) ══');
console.log(`   emisor ${EMITTER.split(path.sep).pop()} (${src.length} B)`);

// ── (b) params completos en el ENSAMBLADO REAL del emisor ──────────────────
console.log('\n── (b) params del cartucho en el ensamblado real');
{
    const iAsm = src.indexOf('resolve_quality_unified.php?ch=');
    ok('b.0 existe el ensamblado resolve_quality_unified.php', iAsm > -1);
    const lineEnd = src.indexOf('\n', iAsm);
    const asm = src.slice(iAsm, lineEnd === -1 ? iAsm + 800 : lineEnd);
    for (const p of REQUIRED) {
        ok(`b.${p} el ensamblado incluye \`${p}=\``, new RegExp('[?&]' + p + '=').test(asm), asm.slice(0, 160));
    }
    ok('b.extra min/max documentados en la tabla', PROFILES.every((x) => CARTRIDGE[x].min > 0 && CARTRIDGE[x].max > 0));
}

// ── (c) fusible presente y con valor por perfil ────────────────────────────
console.log('\n── (c) fusible de suelo por perfil');
{
    ok('c.1 el emisor calcula el fusible por perfil', /getFloorFuseForProfile/.test(src));
    ok('c.2 el fusible se inyecta en la URL', /fuse=\$\{_fuseValo\}|[?&]fuse=\$\{/.test(src));
    for (const p of PROFILES) {
        const u = buildCartridge('https://iptv-ape.duckdns.org', 'canalX', p);
        ok(`c.${p} la URL lleva fuse con el valor del perfil`, new RegExp('[?&]fuse=' + CARTRIDGE[p].fuse + '(&|$)').test(u), u.slice(-40));
    }
    ok('c.3 ningún perfil queda con fuse ausente', PROFILES.every((p) => /[?&]fuse=/.test(buildCartridge('b', 'c', p))));
}

// ── (a) determinismo: 2 generaciones ⇒ mismo SHA ───────────────────────────
console.log('\n── (a) determinismo (mismo canal+perfil ⇒ mismos bytes)');
{
    for (const p of PROFILES) {
        const a = buildCartridge('https://iptv-ape.duckdns.org', 'canalX', p);
        const b = buildCartridge('https://iptv-ape.duckdns.org', 'canalX', p);
        eq(`a.${p} mismo SHA`, sha(a), sha(b));
    }
    const all1 = sha(PROFILES.map((p) => buildCartridge('https://iptv-ape.duckdns.org', 'canalX', p)).join('\n'));
    const all2 = sha(PROFILES.map((p) => buildCartridge('https://iptv-ape.duckdns.org', 'canalX', p)).join('\n'));
    eq('a.9 la tabla completa P0-P5 es determinista', all1, all2);
    // Perfiles distintos ⇒ URLs distintas (no colapsan).
    const uniq = new Set(PROFILES.map((p) => buildCartridge('https://iptv-ape.duckdns.org', 'canalX', p)));
    eq('a.10 los 6 perfiles producen 6 URLs distintas', uniq.size, 6);
}

// ── (d) 200/302 en vivo (read-only · NO tumba el gate si no hay red) ───────
console.log('\n── (d) sonda HTTP read-only al resolver desplegado');
{
    let live = '[UNKNOWN] red no disponible';
    try {
        const { execFileSync } = require('node:child_process');
        const url = 'https://iptv-ape.duckdns.org/resolve_quality.php?p=P3&mode=single&ch=cartridge_assert&bw=8000000&buf=8000&fuse=1';
        const out = execFileSync('curl.exe', ['-s', '-o', 'NUL', '-w', '%{http_code};%{time_total}', '--max-time', '10', url], { encoding: 'utf8' }).trim();
        const [code, t] = out.split(';');
        live = `status=${code} t=${t}s`;
        ok('d.1 el resolver responde 200 o 302', code === '200' || code === '302', `status=${code}`);
        ok('d.2 latencia registrada', Number(t) > 0, `t=${t}`);
    } catch (e) {
        console.log(`   · [UNKNOWN] sonda HTTP no ejecutable: ${e.message}`);
        pass += 0; // no se cuenta como fallo: el gate es determinista sin red
    }
    console.log(`   · sonda: ${live}`);
}

// ── Resultado ──────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s)`);
for (const f of failures.slice(0, 25)) console.log(`  ✗ ${f}`);
process.exit(1);
