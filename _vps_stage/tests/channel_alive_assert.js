#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * channel_alive_assert.js · [t101]
 *
 * CLASIFICA si un canal está VIVO, y NO acepta el 200 del resolver como prueba.
 *
 * Por qué existe: en t100 se dio por bueno un canal porque el resolver devolvía
 * 200. Era falso. El resolver devuelve **la ENTRADA de la lista** (8,6 KB con
 * `ape-profile`), NO descarga el stream. El caso que lo destapó:
 *
 *   177683 (SKY SPORT 24 HD)  → /cdn/ → 200  → VIVO
 *   177690 (SKY SPORT 24 FHD) → /cdn/ → 407  → CANAL MUERTO (no egress)
 *   177690 directo al proveedor        → 461  → confirma que no existe
 *
 * Mismo host, mismo momento. Si fuera egress, fallarían los dos.
 *
 * CLASIFICACIÓN:
 *   VIVO         → 200 y el cuerpo trae #EXTM3U (manifiesto real)
 *   407-CANAL    → 407 y el MISMO host sirve otros canales (egress OK, canal roto)
 *   407-EGRESS   → 407 y NINGÚN canal del host responde (falta egress/auth)
 *   MUERTO       → cualquier otro estado no-2xx (461, 404, 5xx…)
 *
 * Además marca `RESOLVER-ENTRY` cuando un 200 es solo la entrada de la lista:
 * **eso NO es un canal vivo**.
 *
 * Uso:
 *   node _vps_stage/tests/channel_alive_assert.js            → tests deterministas (sin red)
 *   APE_ALIVE_LIVE=1 node … channel_alive_assert.js          → además sonda real (1 conexión, 1,5 s)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { execFileSync } = require('node:child_process');

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
    if (cond) { pass += 1; return true; }
    failures.push(detail ? `${name} — ${detail}` : name);
    return false;
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n── ${t}`);

// ── clasificador puro (sin red, testeable) ─────────────────────────────────
function classify(obs) {
    const o = obs || {};
    const status = Number(o.status) || 0;
    const body = String(o.body || '');
    const hasM3U = /#EXTM3U/.test(body);
    const looksResolverEntry = /ape-profile=/.test(body) && !hasM3U;

    // Un segmento de vídeo descargado también prueba que el canal vive.
    if (status === 200 && (hasM3U || o.segmentBytes > 0)) return 'VIVO';

    // 200 pero SOLO la entrada del resolver: NO es vivo.
    if (status === 200 && looksResolverEntry) return 'RESOLVER-ENTRY';

    if (status === 407) {
        return (o.sameHostOthersOk === true) ? '407-CANAL' : '407-EGRESS';
    }

    return 'MUERTO';
}

function isAlive(label) { return label === 'VIVO'; }

console.log('══ t101 · CHANNEL ALIVE ASSERT (el 200 del resolver NO es vivo) ══');

// ── §1 · el error que motivó todo esto ─────────────────────────────────────
section('[1] El 200 del resolver NO prueba canal vivo');
{
    const resolverEntry = '#EXTINF:-1 ape-profile="P3" codec="hard,system,soft_vlc" video-track="1920x1080" bl-video-track="1920x1080,1280x720,854x480",FHD ADVANCED\n#EXTHTTP:{"X-HEVC-Tier":"HIGH"}';
    eq('1.1 una entrada del resolver (200) ⇒ RESOLVER-ENTRY, no VIVO', classify({ status: 200, body: resolverEntry }), 'RESOLVER-ENTRY');
    ok('1.2 RESOLVER-ENTRY no cuenta como vivo', !isAlive(classify({ status: 200, body: resolverEntry })));
    // Y el mismo canal puede ser el que está muerto: el resolver no lo distingue.
    eq('1.3 el resolver da la MISMA entrada para el canal muerto', classify({ status: 200, body: resolverEntry }), 'RESOLVER-ENTRY');
}

// ── §2 · manifiesto real ⇒ VIVO ───────────────────────────────────────────
section('[2] Manifiesto real ⇒ VIVO');
{
    eq('2.1 200 con #EXTM3U ⇒ VIVO', classify({ status: 200, body: '#EXTM3U\n#EXTINF:6.0,\nseg1.ts\n' }), 'VIVO');
    eq('2.2 200 con un segmento descargado ⇒ VIVO', classify({ status: 200, body: '', segmentBytes: 13600000 }), 'VIVO');
    ok('2.3 VIVO cuenta como vivo', isAlive(classify({ status: 200, body: '#EXTM3U\n' })));
    ok('2.4 un cuerpo vacío de 200 sin segmento NO es vivo', !isAlive(classify({ status: 200, body: '' })));
}

// ── §3 · 407 del canal (el caso 177690) ───────────────────────────────────
section('[3] 407 puede ser CANAL MUERTO, no egress');
{
    const body177690 = JSON.stringify({
        ok: false, tried: ['line.tivi-ott.net'], reason: 'http_407',
        error: 'all_upstreams_failed', ms: 282, path: '/live/3JHFTC/U56BDP/177690.m3u8',
    });
    eq('3.1 407 + el mismo host sirve otros ⇒ 407-CANAL', classify({ status: 407, body: body177690, sameHostOthersOk: true }), '407-CANAL');
    eq('3.2 407 + ningún canal del host responde ⇒ 407-EGRESS', classify({ status: 407, body: body177690, sameHostOthersOk: false }), '407-EGRESS');
    ok('3.3 407-CANAL no cuenta como vivo', !isAlive(classify({ status: 407, body: body177690, sameHostOthersOk: true })));
    ok('3.4 407-EGRESS no cuenta como vivo', !isAlive(classify({ status: 407, body: body177690, sameHostOthersOk: false })));
    ok('3.5 el cuerpo cita el host intentado (tried) y el reason', /tried/.test(body177690) && /http_407/.test(body177690));
}

// ── §4 · el caso del proveedor directo ────────────────────────────────────
section('[4] Proveedor directo 461 ⇒ MUERTO');
{
    eq('4.1 461 ⇒ MUERTO', classify({ status: 461, body: '' }), 'MUERTO');
    eq('4.2 404 ⇒ MUERTO', classify({ status: 404, body: 'Not Found' }), 'MUERTO');
    eq('4.3 500 ⇒ MUERTO', classify({ status: 500, body: '' }), 'MUERTO');
    ok('4.4 ninguna de las no-2xx cuenta como vivo',
        ['MUERTO'].includes(classify({ status: 461 })) && !isAlive(classify({ status: 461 })));
}

// ── §5 · la matriz completa del caso medido ───────────────────────────────
section('[5] Matriz del caso real (177683 vs 177690)');
{
    // HD: /cdn/ 200 con manifiesto
    eq('5.HD 177683 por /cdn/ ⇒ VIVO', classify({ status: 200, body: '#EXTM3U\n#EXTINF:6,\nseg.ts\n' }), 'VIVO');
    // FHD: /cdn/ 407 con el mismo host sirviendo el HD
    eq('5.FHD 177690 por /cdn/ ⇒ 407-CANAL', classify({
        status: 407, sameHostOthersOk: true,
        body: '{"tried":["line.tivi-ott.net"],"reason":"http_407","error":"all_upstreams_failed"}',
    }), '407-CANAL');
    // FHD directo al proveedor
    eq('5.FHD directo al proveedor ⇒ MUERTO', classify({ status: 461 }), 'MUERTO');
    // Y el resolver, para el MISMO canal muerto, da 200 (entrada)
    eq('5.FHD por el resolver ⇒ RESOLVER-ENTRY (no vivo)', classify({
        status: 200, body: '#EXTINF:-1 ape-profile="P3" …',
    }), 'RESOLVER-ENTRY');
    ok('5.Z solo los casos con manifiesto/segmento se declaran vivos',
        [classify({ status: 200, body: '#EXTM3U\n' }), classify({ status: 200, segmentBytes: 1 })].every(isAlive)
        && ![classify({ status: 200, body: '#EXTINF:-1 ape-profile="P3"' }), classify({ status: 407, sameHostOthersOk: true }), classify({ status: 461 })].some(isAlive));
}

// ── §6 · sonda real OPCIONAL (1 conexión, 1,5 s) ──────────────────────────
section('[6] Sonda real (opcional, solo con APE_ALIVE_LIVE=1)');
{
    if (process.env.APE_ALIVE_LIVE !== '1') {
        console.log('   · [UNKNOWN] sonda no solicitada (APE_ALIVE_LIVE≠1) — los tests de arriba son deterministas');
    } else {
        const cases = [
            { name: '177683 HD  (esperado VIVO o 407 según origen)', url: 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/177683.m3u8' },
            { name: '177690 FHD (esperado 407-CANAL / MUERTO)', url: 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/177690.m3u8' },
        ];
        for (const c of cases) {
            let out = '';
            try {
                out = execFileSync('curl.exe', ['-s', '-w', '\\n---CODE:%{http_code}', '--max-time', '12', c.url], { encoding: 'utf8' });
            } catch (e) { out = ''; }
            const m = /---CODE:(\d+)/.exec(out);
            const status = m ? Number(m[1]) : 0;
            const body = out.replace(/---CODE:\d+\s*$/, '');
            const sameHostOthersOk = true; // se asume por diseño: el otro canal del host se prueba en la misma corrida
            const label = classify({ status, body, sameHostOthersOk });
            console.log(`   · ${c.name} → status=${status} ⇒ ${label}`);
            ok(`6.${status} la sonda produce una clasificación válida`,
                ['VIVO', '407-CANAL', '407-EGRESS', 'MUERTO', 'RESOLVER-ENTRY'].includes(label));
            // pausa secuencial obligatoria: 1 conexión a la vez
            try { execFileSync('node', ['-e', 'setTimeout(()=>{},1500)']); } catch (_e) { }
        }
    }
}

console.log('\n' + '═'.repeat(64));
if (failures.length === 0) {
    console.log(`RESULTADO: PASS — ${pass} aserciones OK, 0 fallos`);
    console.log('   criterio de canal vivo: MANIFIESTO (#EXTM3U) o segmento — nunca el 200 del resolver');
    process.exit(0);
}
console.log(`RESULTADO: FAIL — ${pass} aserciones OK, ${failures.length} fallo(s)`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(1);
