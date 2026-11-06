#!/usr/bin/env node
/**
 * profile_run.js — corre APE_SERVER_PROFILE contra servidores reales y emite el
 * store JSON. Sirve de demostracion y de artefacto para auditar la medicion.
 *
 * Uso:
 *   node profile_run.js --servers muestra.json --out profile.json [--idempotency]
 *
 * --idempotency: corre la medicion DOS veces y demuestra que la segunda REUSA los
 * perfiles frescos (no re-mide), que revision no sube y que el store queda
 * byte-identico. La segunda corrida parte del store de la primera, que es la
 * unica forma de probar la idempotencia de verdad.
 */
'use strict';
const fs = require('fs');
const SP = require(process.env.APE_SP_PATH || '/tmp/ape-server-profile.js');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const has = (k) => args.includes(k);
const SERVERS = get('--servers');
const OUT = get('--out') || '/tmp/profile.json';
const DO_IDEM = has('--idempotency');
if (!SERVERS || !fs.existsSync(SERVERS)) { console.error('falta --servers'); process.exit(2); }

function targetsFrom(muestraPath) {
    const m = JSON.parse(fs.readFileSync(muestraPath, 'utf8'));
    const out = [];
    for (const [host, uris] of Object.entries(m)) {
        if (!uris || !uris.length) continue;
        const url = uris[0].split('|')[0];
        const shape = SP.detectShape(url);
        if (!shape) continue;
        out.push({
            host,
            baseUrl: shape.baseUrl,
            creds: shape.user ? { user: shape.user, pass: shape.pass } : null,
            sampleUrl: url,
            uris: uris.map(u => u.split('|')[0]),
        });
    }
    return out;
}

const HDR = () => ({ 'User-Agent': SP.UA_PLAYER, 'Accept': '*/*', 'Accept-Encoding': 'identity' });

// resuelve un segmento real: prueba hasta N canales hasta que uno sirva manifest
async function resolveSegment(tr, uris, tries) {
    const n = Math.min(tries || 8, uris.length);
    const seen = {};
    for (let i = 0; i < n; i++) {
        const url = uris[i];
        const r = await tr.request(url, { headers: HDR() });
        if (r.err) { seen[r.err] = (seen[r.err] || 0) + 1; continue; }
        seen[r.status] = (seen[r.status] || 0) + 1;
        let mUrl = url, body = r.body || '';
        const loc = r.headers && r.headers.location;
        if (r.status >= 300 && r.status < 400 && loc) {
            mUrl = new URL(loc, url).toString();
            const d = await tr.request(mUrl, { headers: HDR() });
            if (d.err) continue;
            body = d.body || '';
        } else if (r.status !== 200) continue;

        const ls = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (!ls.length || !/^#EXTM3U/.test(ls[0])) continue;
        for (let j = 0; j < ls.length; j++) {
            if (ls[j].startsWith('#EXT-X-STREAM-INF')) {
                for (let k = j + 1; k < ls.length; k++) if (!ls[k].startsWith('#')) return { seg: new URL(ls[k], mUrl).toString(), seen };
            }
        }
        for (const l of ls) if (!l.startsWith('#')) return { seg: new URL(l, mUrl).toString(), seen };
    }
    return { seg: null, seen };
}

async function measureAll(tr, prevStore) {
    const targets = targetsFrom(SERVERS);
    let store = prevStore || SP.emptyStore();
    let measured = 0, reused = 0;
    for (const t of targets) {
        const shape = SP.detectShape(t.sampleUrl);
        const iH = SP.inputHash(shape, t.creds);
        const need = SP.needsMeasure(store, SP.profileKey(shape), iH);
        console.log('\n>>> ' + t.baseUrl + '   (' + (need.need ? 'MIDE: ' + need.why : 'REUSA: ' + need.why) + ')');
        if (!need.need) { reused++; continue; }
        measured++;

        const rs = await resolveSegment(tr, t.uris, 10);
        console.log('    codigos al buscar segmento: ' + Object.entries(rs.seen).map(([k, v]) => k + 'x' + v).join('  '));
        console.log('    segmento: ' + (rs.seg ? rs.seg.slice(0, 88) + '…' : 'NO RESUELTO'));

        const m = await SP.measure(t.baseUrl, {
            transport: tr, creds: t.creds, sampleUrl: t.sampleUrl,
            segmentUrl: rs.seg || undefined, timeoutMs: 15000,
        });
        m.inputHash = iH;
        m.baseUrl = t.baseUrl;
        console.log('    estado=' + m.state + '  type=' + m.type + ' (' + m.typeReason + ')  reachable=' + m.reachable + ' status=' + m.status);
        if (m.authOk !== null) console.log('    authOk=' + m.authOk + '  account=' + m.accountStatus + '  max_conn=' + m.maxConnections);
        console.log('    uaSensitive=' + m.uaSensitive + '   refererTolerant=' + m.refererTolerant);
        console.log('    acceptRanges=' + JSON.stringify(m.acceptRanges) + '  honors206=' + m.honors206 +
            (m.rangeStatus !== undefined ? '  (pidio 1024 B, devolvio ' + m.rangeBytes + ' B, status ' + m.rangeStatus + ')' : '  (NO medido)'));
        for (const n of (m.notes || [])) console.log('      · ' + n);
        store = SP.upsert(store, m, { creds: t.creds });
    }
    return { store, measured, reused };
}

(async () => {
    const tr = SP.resolveTransport({ require });
    console.log('='.repeat(74));
    console.log('APE_SERVER_PROFILE @' + SP.VERSION + '  ·  transporte=' + (tr ? tr.name : 'NINGUNO') + '  ·  TTL=' + (SP.TTL_MS / 3600000) + ' h');
    console.log('='.repeat(74));

    const t0 = Date.now();
    const r1 = await measureAll(tr, null);
    const d1 = Date.now() - t0;
    fs.writeFileSync(OUT, SP.toJSON(r1.store) + '\n', 'utf8');
    console.log('\n  corrida #1: ' + r1.measured + ' medidos, ' + r1.reused + ' reusados, ' + d1 + ' ms');

    if (DO_IDEM) {
        console.log('\n' + '='.repeat(74));
        console.log('IDEMPOTENCIA — 2a corrida PARTIENDO del store de la 1a');
        console.log('='.repeat(74));
        const t1 = Date.now();
        const r2 = await measureAll(tr, r1.store);
        const d2 = Date.now() - t1;
        const j1 = SP.toJSON(r1.store), j2 = SP.toJSON(r2.store);
        console.log('\n  corrida #2: ' + r2.measured + ' medidos, ' + r2.reused + ' reusados, ' + d2 + ' ms');
        console.log('');
        console.log('  ' + '-'.repeat(70));
        console.log('  store #1 : ' + j1.length + ' bytes, ' + d1 + ' ms');
        console.log('  store #2 : ' + j2.length + ' bytes, ' + d2 + ' ms');
        console.log('  byte-identicos  : ' + (j1 === j2 ? 'SI' : 'NO'));
        console.log('  re-midio en #2  : ' + r2.measured + ' (esperado 0)');
        console.log('  reuso en #2     : ' + r2.reused + ' (esperado ' + Object.keys(r1.store.servers).length + ')');
        console.log('  mas rapido      : ' + (d2 < d1 ? 'SI (' + d1 + ' -> ' + d2 + ' ms)' : 'NO'));
        const rev1 = Object.values(r1.store.servers).map(p => p.revision);
        const rev2 = Object.values(r2.store.servers).map(p => p.revision);
        console.log('  revisiones      : [' + rev1.join(',') + '] -> [' + rev2.join(',') + ']  ' + (JSON.stringify(rev1) === JSON.stringify(rev2) ? '(no subieron)' : '(SUBIERON)'));
        const ok = j1 === j2 && r2.measured === 0 && d2 < d1;
        console.log('  ' + '-'.repeat(70));
        console.log('  IDEMPOTENCIA: ' + (ok ? 'DEMOSTRADA' : 'NO demostrada'));
    }

    console.log('\n' + '='.repeat(74));
    console.log('STORE FINAL: ' + OUT);
    console.log('='.repeat(74));
})();
