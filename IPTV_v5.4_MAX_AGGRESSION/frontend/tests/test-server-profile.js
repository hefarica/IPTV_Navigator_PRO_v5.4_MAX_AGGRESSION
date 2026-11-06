/**
 * TEST — APE SERVER PROFILE (multiservidor idempotente · polimorfico · isomorfico)
 *
 * Prueba PROPIEDADES, no que el modulo "cargue":
 *
 *   IDEMPOTENCIA   mismo input -> mismo store byte a byte; re-upsert no sube
 *                  revision; needsMeasure dice "fresco"; cambia el inputHash ->
 *                  si re-mide; TTL expirado -> re-mide.
 *   POLIMORFISMO   detectShape acepta string de URL, string de base y 5 formas de
 *                  objeto; classify devuelve los 5 tipos USA.
 *   ISOMORFISMO    el mismo fichero se carga con require() en Node; y se evalua
 *                  como script de navegador (sin require) exponiendo el global.
 *   FAIL-HONEST    sin transporte -> UNMEASURED; sin segmento -> honors206 null;
 *                  capabilityTag nunca convierte null en false.
 *
 * Uso: node IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-server-profile.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MOD_PATH = process.env.APE_SERVER_PROFILE_PATH ||
    path.join(__dirname, '..', 'js', 'ape-v9', 'ape-server-profile.js');

let passed = 0, failed = 0;
function assert(c, m, extra) {
    if (c) { passed++; console.log('  PASS  ' + m); }
    else { failed++; console.error('  FAIL  ' + m + (extra ? '   [' + extra + ']' : '')); }
}

const SP = require(MOD_PATH);
const V = SP.VERSION;

(async () => {
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  APE SERVER PROFILE @' + V + ' — idempotente · polimorfico · isomorfico');
    console.log('══════════════════════════════════════════════════════════════════\n');

    // ── 1. ISOMORFISMO ───────────────────────────────────────────────────
    console.log('  ── 1 · ISOMORFISMO ─────────────────────────────────────────');
    assert(typeof SP.detectShape === 'function', 'require() en Node expone la API');
    // evaluar como script de navegador: sin require, con globalThis.window
    const src = fs.readFileSync(MOD_PATH, 'utf8');
    const sandbox = { window: {}, console: { log() {}, warn() {} } };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    let browserOk = true, browserErr = '';
    try { vm.runInContext(src, ctx); } catch (e) { browserOk = false; browserErr = e.message; }
    assert(browserOk, 'evalua como script de navegador (sin require)', browserErr);
    assert(!!sandbox.APE_SERVER_PROFILE, 'expone global APE_SERVER_PROFILE en el navegador');
    assert(sandbox.APE_SERVER_PROFILE && sandbox.APE_SERVER_PROFILE.VERSION === V, 'misma version en los dos entornos');

    // ── 2. POLIMORFISMO ──────────────────────────────────────────────────
    console.log('\n  ── 2 · POLIMORFISMO (formas de entrada) ───────────────────');
    const forms = [
        ['string URL completa', 'http://nfqdeuxu.x1megaott.store/live/2E2ETBH3/HZHXPBUD/1.m3u8'],
        ['string base', 'http://nfqdeuxu.x1megaott.store'],
        ['{url}', { url: 'http://nfqdeuxu.x1megaott.store/live/2E2ETBH3/HZHXPBUD/1.m3u8' }],
        ['{base_url}', { base_url: 'http://nfqdeuxu.x1megaott.store' }],
        ['{baseUrl}', { baseUrl: 'http://nfqdeuxu.x1megaott.store' }],
        ['{host}', { host: 'http://nfqdeuxu.x1megaott.store' }],
        ['{server}', { server: 'http://nfqdeuxu.x1megaott.store' }],
        ['sin esquema', 'line.tivi-ott.net'],
    ];
    for (const [name, input] of forms) {
        const s = SP.detectShape(input);
        assert(s !== null && s.host === (name === 'sin esquema' ? 'line.tivi-ott.net' : 'nfqdeuxu.x1megaott.store'),
            'forma ' + name + ' -> host correcto', s ? s.host : 'null');
    }
    assert(SP.detectShape('') === null, 'string vacio -> null');
    assert(SP.detectShape('ftp://x/y') === null, 'esquema no http(s) -> null');

    // credenciales y stream id extraidos del path
    const s1 = SP.detectShape('http://nfqdeuxu.x1megaott.store/live/2E2ETBH3/HZHXPBUD/1.m3u8');
    assert(s1.user === '2E2ETBH3' && s1.pass === 'HZHXPBUD' && s1.streamId === '1', 'extrae user/pass/streamId del path');
    assert(s1.ext === '.m3u8', 'extrae la extension');
    const s2 = SP.detectShape('line.tivi-ott.net/live/3JHFTC/U56BDP/115.m3u8');
    assert(s2.schemeInferred === true && s2.scheme === 'http', 'sin esquema: infiere http y lo marca');

    // ── 3. CLASIFICACION (5 tipos USA) ───────────────────────────────────
    console.log('\n  ── 3 · CLASIFICACION (tabla USA) ──────────────────────────');
    const cases = [
        ['XTREAM_HTTP',  'http://h.tv:8080/live/u/p/1.m3u8'],
        ['XTREAM_HTTPS', 'https://h.tv/live/u/p/1.m3u8'],
        ['FRONTCDN',     'http://h.tv/live/u/p/1.m3u8?token=abc123'],
        ['STALKER',      'http://h.tv/portal.php'],
    ];
    for (const [want, url] of cases) {
        const got = SP.classify(SP.detectShape(url)).type;
        assert(got === want, 'clasifica ' + want, 'got ' + got);
    }
    const custom = SP.classify(SP.detectShape('http://h.tv/algo/raro/xyz')).type;
    assert(custom === 'CUSTOM_AUTO', 'desconocido -> CUSTOM_AUTO (passthrough)', custom);

    // ── 4. IDEMPOTENCIA ──────────────────────────────────────────────────
    console.log('\n  ── 4 · IDEMPOTENCIA ──────────────────────────────────────');
    const key1 = SP.profileKey('http://nfqdeuxu.x1megaott.store/live/a/b/1.m3u8');
    const key2 = SP.profileKey('http://nfqdeuxu.x1megaott.store/live/OTRO/OTRO/999.m3u8');
    assert(key1 === key2, 'la identidad NO depende de credenciales ni stream id', key1 + ' vs ' + key2);
    assert(key1 === 'http://nfqdeuxu.x1megaott.store:80', 'la identidad es scheme://host:port', key1);

    const shape1 = SP.detectShape('http://nfqdeuxu.x1megaott.store');
    const iH1 = SP.inputHash(shape1, { user: '2E2ETBH3', pass: 'HZHXPBUD' });
    const iH1b = SP.inputHash(shape1, { user: '2E2ETBH3', pass: 'HZHXPBUD' });
    const iH2 = SP.inputHash(shape1, { user: 'OTRO', pass: 'OTRA' });
    assert(iH1 === iH1b, 'mismo input -> mismo hash (determinista)');
    assert(iH1 !== iH2, 'otras credenciales -> otro hash');

    const meas = {
        state: 'MEASURED', host: 'nfqdeuxu.x1megaott.store', measuredAt: new Date().toISOString(),
        honors206: false, acceptRanges: null, inputHash: iH1, baseUrl: 'http://nfqdeuxu.x1megaott.store'
    };
    const st0 = SP.emptyStore();
    const st1 = SP.upsert(st0, meas, { creds: { user: '2E2ETBH3', pass: 'HZHXPBUD' } });
    const rev1 = st1.servers[key1].revision;
    assert(rev1 === 1, 'primer upsert -> revision 1', 'rev=' + rev1);

    const st2 = SP.upsert(st1, meas, { creds: { user: '2E2ETBH3', pass: 'HZHXPBUD' } });
    const rev2 = st2.servers[key1].revision;
    assert(rev2 === rev1, 'segundo upsert identico NO incrementa revision (idempotente)', 'rev=' + rev2);
    assert(SP.toJSON(st1) === SP.toJSON(st2), 'store serializado byte-identico entre corridas equivalentes');

    // orden de claves estable con dos hosts
    const measB = Object.assign({}, meas, { host: 'line.tivi-ott.net', inputHash: SP.inputHash(SP.detectShape('http://line.tivi-ott.net')) });
    const stAB = SP.upsert(SP.upsert(st0, meas, { creds: { user: 'a', pass: 'b' } }), measB, {});
    const stBA = SP.upsert(SP.upsert(st0, measB, {}), meas, { creds: { user: 'a', pass: 'b' } });
    assert(SP.toJSON(stAB) === SP.toJSON(stBA), 'el orden de insercion no cambia el store (determinista)');

    // roundtrip
    const back = SP.fromJSON(SP.toJSON(stAB));
    assert(SP.toJSON(back) === SP.toJSON(stAB), 'toJSON/fromJSON roundtrip estable');
    assert(SP.fromJSON('{basura').servers && Object.keys(SP.fromJSON('{basura').servers).length === 0,
        'fromJSON con basura devuelve store vacio (fail-safe)');

    // needsMeasure
    assert(SP.needsMeasure(st1, key1, iH1).need === false, 'needsMeasure: fresco -> no mide');
    assert(SP.needsMeasure(st1, key1, iH2).need === true, 'needsMeasure: inputHash distinto -> mide');
    assert(SP.needsMeasure(st0, key1, iH1).need === true, 'needsMeasure: sin perfil -> mide');
    const viejo = Object.assign({}, meas, { measuredAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString() });
    const stOld = SP.upsert(st0, viejo, { creds: { user: 'x', pass: 'y' } });
    assert(SP.needsMeasure(stOld, key1, iH1).need === true, 'needsMeasure: TTL expirado -> mide');

    // ── 5. DESCUBRIMIENTO MULTIFUENTE ────────────────────────────────────
    console.log('\n  ── 5 · DESCUBRIMIENTO MULTIFUENTE ────────────────────────');
    const found = SP.discover([
        { name: 'lab.servers', items: [{ base_url: 'http://nfqdeuxu.x1megaott.store', username: '2E2ETBH3', password: 'HZHXPBUD' }, { base_url: 'http://line.tivi-ott.net', username: '3JHFTC', password: 'U56BDP' }] },
        { name: 'activeServers', items: [{ url: 'http://nfqdeuxu.x1megaott.store' }, { url: 'http://tivigo.cc' }] },
        { name: 'lista', items: ['http://nfqdeuxu.x1megaott.store/live/2E2ETBH3/HZHXPBUD/1.m3u8'] },
    ]);
    assert(found.length === 3, 'descubre 3 hosts distintos de 3 fuentes', 'n=' + found.length);
    const mega = found.find(f => f.key.indexOf('megaott') >= 0);
    assert(mega && mega.sources.length === 3, 'MEGA aparece en las 3 fuentes (dedup por key)', mega ? mega.sources.join(',') : 'no');
    assert(mega && mega.creds && mega.creds.user === '2E2ETBH3', 'rescata las credenciales del objeto del LAB');
    const keys = found.map(f => f.key);
    assert(JSON.stringify(keys) === JSON.stringify([...keys].sort()), 'el resultado viene ordenado (determinista)');

    // ── 6. FAIL-HONEST ───────────────────────────────────────────────────
    console.log('\n  ── 6 · FAIL-HONEST ───────────────────────────────────────');
    const noTr = await SP.measure('http://host.tv', { transport: null, env: {} });
    assert(noTr.state === 'UNMEASURED', 'sin transporte -> UNMEASURED', noTr.state);
    assert(/transporte/.test(noTr.reason || ''), 'explica la razon del no-computado');

    const sinSeg = SP.getProfile(st1, 'http://nfqdeuxu.x1megaott.store');
    assert(sinSeg && sinSeg.honors206 === false, 'con 206 medido como false se reporta false', String(sinSeg && sinSeg.honors206));

    // perfil sin medicion de Range: honors206 null, NO false
    const unknown = { state: 'MEASURED', host: 'x.tv', honors206: null, acceptRanges: null };
    const tagU = SP.capabilityTag(unknown, 'x.tv');
    assert(/HONORS_206=unknown/.test(tagU), 'honors206 null -> HONORS_206=unknown (no false)', tagU);
    assert(/EMIT_BYTERANGE=false/.test(tagU), 'sin 206 confirmado NO emite BYTERANGE');
    assert(/STATE=MEASURED-RANGE-UNKNOWN/.test(tagU), 'estado MEASURED-RANGE-UNKNOWN');

    const tagNull = SP.capabilityTag(null, 'y.tv');
    assert(/STATE=UNMEASURED/.test(tagNull), 'sin perfil -> STATE=UNMEASURED', tagNull);
    assert(/HONORS_206=unknown/.test(tagNull), 'sin perfil -> HONORS_206=unknown');

    assert(SP.shouldEmitByterange({ state: 'MEASURED', honors206: true }) === true, '206 true -> emite BYTERANGE');
    assert(SP.shouldEmitByterange({ state: 'MEASURED', honors206: false }) === false, '206 false -> no emite');
    assert(SP.shouldEmitByterange({ state: 'MEASURED', honors206: null }) === false, '206 null -> no emite');
    assert(SP.shouldEmitByterange(null) === false, 'sin perfil -> no emite');

    const tagOk = SP.capabilityTag({ state: 'MEASURED', host: 'ok.tv', honors206: true, acceptRanges: 'bytes' });
    assert(/STATE=VERIFIED-206/.test(tagOk) && /EMIT_BYTERANGE=true/.test(tagOk), '206 true -> VERIFIED-206 y emite');
    assert(SP.modeTag({ honors206: true, state: 'MEASURED' }).indexOf('BYTERANGE-ELIGIBLE') > 0, 'mode BYTERANGE-ELIGIBLE con 206');
    assert(SP.modeTag({ honors206: false, state: 'MEASURED' }).indexOf('FULL-OBJECT') > 0, 'mode FULL-OBJECT sin 206');

    // ── 7. DIRECTIVAS POR TIPO ───────────────────────────────────────────
    console.log('\n  ── 7 · DIRECTIVAS POR TIPO ───────────────────────────────');
    assert(SP.directiveOverrides('FRONTCDN').extvlcopt.indexOf('http-forward=true') >= 0, 'FRONTCDN recibe http-forward=true');
    assert(SP.directiveOverrides('CUSTOM_AUTO').extvlcopt.indexOf('http-reconnect=true') >= 0, 'CUSTOM_AUTO recibe http-reconnect');
    assert(SP.directiveOverrides('XTREAM_HTTP').extvlcopt.length === 0, 'XTREAM_HTTP no recibe extras');

    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  TOTAL = ' + (passed + failed) + '   PASS = ' + passed + '   FAIL = ' + failed);
    console.log('══════════════════════════════════════════════════════════════════\n');
    process.exit(failed === 0 ? 0 : 1);
})();
