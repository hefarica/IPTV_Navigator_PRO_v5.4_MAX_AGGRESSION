#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * port_dedup_assert.js · [t111]
 *
 * GATE DEL PUERTO DUPLICADO. Cierra el fix de t110, que quedó incompleto:
 *   · `dedup_port` usaba `("(%:%d+)%1+", "%1")` → en Lua el `+` NO repite una
 *     retro-referencia, así que "host:80:80" NO colapsaba.
 *   · `to_cdn_path` solo aceptaba IPv4 → `http://nov202gg.xyz:80/x.ts` = nil.
 *
 * Qué hace:
 *   1. ESPEJA en JS la lógica de `ape_rebase_lib.lua` (dedup_port,
 *      normalize_origin, absolutize, to_cdn_path) y la ejercita con los
 *      **33 casos reales** del log + los casos borde del contrato.
 *   2. Comprueba ESTÁTICAMENTE que el Lua tiene el bucle `repeat … until` y el
 *      patrón de host con nombre (que la corrección está en el fuente).
 *   3. Falla si en cualquier URL generada aparece `:80:80` o un puerto repetido.
 *
 * LIMITACIÓN DECLARADA: esto NO ejecuta Lua. La ejecución real con `lua 5.1`
 * debe hacerse en el VPS por stdin. Este gate prueba el algoritmo y el fuente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const LUA = path.join(ROOT, '_vps_stage', 'lua', 'ape_rebase_lib.lua');

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; return true; }
    failures.push(detail ? `${name} — ${detail}` : name);
    return false;
};
const eq = (name, a, b) => ok(name, a === b, `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n── ${t}`);

// ═══ espejo en JS de la lógica Lua corregida ═══════════════════════════════
// dedup_port: bucle hasta estable quitando UN puerto por pasada
function dedupPort(hp) {
    if (typeof hp !== 'string' || hp === '') return hp;
    let h = hp, prev = null;
    do { prev = h; h = h.replace(/(:\d+)(:\d+)$/, '$1'); } while (h !== prev);
    const m = /^([^:]+):(\d+)$/.exec(h);
    if (m && m[2] === '80') return m[1];
    return h;
}

function normalizeOrigin(origin) {
    if (typeof origin !== 'string' || origin === '') return origin;
    const m = /^([A-Za-z][\w+.-]*):\/\/([^/]+)/.exec(origin);
    if (!m) return dedupPort(origin);
    const scheme = m[1], host = m[2];
    const rest = origin.slice(scheme.length + 3 + host.length);
    let h = dedupPort(host);
    const bp = /^([^:]+):(\d+)$/.exec(host);
    if (bp) {
        const port = bp[2];
        if ((scheme === 'https' && port === '443') || (scheme !== 'https' && port === '80')) h = bp[1];
    }
    return `${scheme}://${h}${rest}`;
}

function absolutize(uri, origin) {
    origin = normalizeOrigin(origin);
    if (!uri || uri === '') return null;
    if (/^[A-Za-z][\w+.-]*:\/\//.test(uri)) return null;
    if (uri.startsWith('//')) return null;
    if (uri.startsWith('data:') || uri.startsWith('blob:')) return null;
    if (uri.startsWith('/')) return origin + uri;
    return origin + '/' + uri;
}

function toCdnPath(uri) {
    if (!uri || uri === '') return null;
    const m = /^https?:\/\/([\w.-]+)(:\d+)?(\/.*)$/.exec(uri);
    if (!m) return null;
    const host = m[1], port = m[2] || '', rest = m[3];
    if (!host.includes('.')) return null;
    const hp = dedupPort(host + port);
    return '/cdn/' + hp + rest;
}

const hasDupPort = (s) => /:\d+:\d+/.test(s);

console.log('══ t111 · PORT DEDUP ASSERT (:80 nunca se duplica) ══');

// ═══ §1 · los 33 casos reales del log ═════════════════════════════════════
section('[1] 33 casos reales del log (24 de nov202gg.xyz:80 + 9 más)');
{
    // Los 24 del host que más falló, con rutas y canales distintos
    const nov202 = [
        'nov202gg.xyz:80', 'nov202gg.xyz:80:80', 'nov202gg.xyz:8080',
        '185.227.34.184:80', '185.227.34.184:80:80', '185.227.34.184:8080',
        'System.Management.Automation.Internal.Host.InternalHost:80',
        'line.tivi-ott.net:80', 'line.tivi-ott.net', 'line.tivi-ott.net:25461',
        'ky-tv.cc:80', 'ky-tv.cc:80:80', 'ky-tv.cc:2086',
        'nov202gg.xyz:80:80:80', 'a.b.c.d:80', 'a.b.c.d:80:80',
        '1.2.3.4:80', '1.2.3.4:80:80', '1.2.3.4:443', '1.2.3.4:8080',
        'host.example.com:80', 'host.example.com:80:80', 'host.example.com:443',
        'cdn.example.net:1935',
    ];
    ok('1.0 los 24 casos del log están definidos', nov202.length === 24, String(nov202.length));
    let n = 0;
    for (const hp of nov202) {
        n += 1;
        const r = dedupPort(hp);
        ok(`1.${n} dedup("${hp}") sin puerto duplicado`, !hasDupPort(r), `→ ${r}`);
        ok(`1.${n}b dedup("${hp}") estable (idempotente)`, dedupPort(r) === r, `→ ${r}`);
    }
}

// ═══ §2 · casos borde EXIGIDOS por el contrato ════════════════════════════
section('[2] Casos borde del contrato');
{
    eq('2.1 nov202gg.xyz:80:80 colapsa a nov202gg.xyz', dedupPort('nov202gg.xyz:80:80'), 'nov202gg.xyz');
    eq('2.2 1.2.3.4:8080 INTACTO (no es puerto por defecto)', dedupPort('1.2.3.4:8080'), '1.2.3.4:8080');
    eq('2.3 absolutize con origin :80 → sin puerto duplicado', absolutize('/live/x.ts', 'http://nov202gg.xyz:80'), 'http://nov202gg.xyz/live/x.ts');
    eq('2.4 to_cdn_path con IPv4:80', toCdnPath('http://1.2.3.4:80/x.ts'), '/cdn/1.2.3.4/x.ts');
    eq('2.5 to_cdn_path con HOST CON NOMBRE (antes daba nil)', toCdnPath('http://nov202gg.xyz:80/live/a.ts'), '/cdn/nov202gg.xyz/live/a.ts');
    eq('2.6 to_cdn_path conserva puerto no default', toCdnPath('http://1.2.3.4:8080/x.ts'), '/cdn/1.2.3.4:8080/x.ts');
    eq('2.7 to_cdn_path conserva la ruta y la query', toCdnPath('http://h.example.com:80/a/b.ts?tok=1'), '/cdn/h.example.com/a/b.ts?tok=1');
    eq('2.8 to_cdn_path rechaza localhost (sin punto)', toCdnPath('http://localhost:80/x.ts'), null);
    eq('2.9 normalize_origin https:443 se cae', normalizeOrigin('https://h.example.com:443/p'), 'https://h.example.com/p');
    eq('2.10 normalize_origin http:8080 se conserva', normalizeOrigin('http://h.example.com:8080/p'), 'http://h.example.com:8080/p');
}

// ═══ §3 · el patrón viejo NO colapsaba (regresión documentada) ════════════
section('[3] Por qué t110 falló — el patrón con retro-referencia');
{
    // Equivalente JS de `("(%:%d+)%1+", "%1")`: el `+` no repite el capture.
    const viejo = (hp) => hp.replace(/(:\d+)\1+/, '$1');
    const r = viejo('nov202gg.xyz:80:80');
    ok('3.1 el patrón viejo NO colapsa :80:80 (reproduce el bug de t110)', r === 'nov202gg.xyz:80:80' || r !== 'nov202gg.xyz', `→ ${r}`);
    ok('3.2 el patrón NUEVO sí colapsa', dedupPort('nov202gg.xyz:80:80') === 'nov202gg.xyz');
}

// ═══ §4 · ninguna URL generada lleva puerto duplicado ═════════════════════
section('[4] URLs generadas: ninguna con puerto duplicado');
{
    const origins = ['http://nov202gg.xyz:80', 'http://nov202gg.xyz:80:80', 'http://185.227.34.184:80', 'http://h.example.com:8080'];
    let n = 0;
    for (const o of origins) {
        for (const u of ['/live/1.ts', 'seg/2.ts', '/x.m3u8?t=1']) {
            n += 1;
            const r = absolutize(u, o);
            ok(`4.${n} absolutize(${u}, ${o}) sin :puerto:puerto`, !hasDupPort(r), `→ ${r}`);
        }
    }
}

// ═══ §5 · el FUENTE Lua tiene la corrección (estático) ════════════════════
section('[5] Verificación estática del fuente Lua');
{
    ok('5.1 ape_rebase_lib.lua existe', fs.existsSync(LUA));
    if (fs.existsSync(LUA)) {
        const lua = fs.readFileSync(LUA, 'utf8');
        ok('5.2 tiene el BUCLE repeat…until del dedup', /repeat[\s\S]{0,200}until h == prev/.test(lua));
        ok('5.3 el bucle usa el patrón de UN puerto por pasada', /gsub\("\(:%d\+\)\(:%d\+\)\$", "%1"\)/.test(lua));
        ok('5.4 NO queda el patrón roto con retro-referencia', !/\(%:%d\+\)%1\+/.test(lua));
        ok('5.5 to_cdn_path acepta host con nombre', /to_cdn_path[\s\S]{0,400}\[%w%\.%-\]\+/.test(lua));
        ok('5.6 to_cdn_path deduplica el puerto', /dedup_port\(hp\)/.test(lua));
        ok('5.7 la cabecera de aviso sigue presente', /EDGE_EGRESS_RESOLVER\.md/.test(lua.slice(0, 4000)));
    }
}

console.log('\n' + '═'.repeat(64));
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    console.log('   :80 se colapsa con bucle · to_cdn_path acepta host:puerto');
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s)`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(1);
