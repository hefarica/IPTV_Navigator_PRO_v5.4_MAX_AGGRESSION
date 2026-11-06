#!/usr/bin/env node
'use strict';
/**
 * audit_census2.js — segundo pase: distribuciones por canal que el primer pase no separa.
 * Uso: node tools/url2/audit_census2.js <lista.m3u8> [--json out.json]
 */
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const ji = args.indexOf('--json');
const OUT = ji >= 0 ? args[ji + 1] : null;

const D = {
    apeProfile: {}, resSupremacy: {}, fourKFalse: {}, fourKTarget: {}, codecFull: {},
    enhanceState: {}, owner: {}, hdrDv: {}, cmafContainer: {}, lcevcPhase: {}, strategy: {},
    bufferSeconds: {}, headersCount: {}, bw: {}, fps: {}, res: {}, codecs: {},
    urlExt: {}, urlScheme: {}, urlPathKind: {},
    chTotal: 0, chSinCodecPreferred: 0, chSinStreamInf: 0, chSinExthttp: 0,
    chSinEnhanceState: 0, chSinOwner: 0, chSinLcevc: 0, chSinDv: 0,
    urlsSample: [], chSinCodecIdx: [], chSinEnhanceIdx: [],
};

const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const attr = (line, key) => { const m = new RegExp(key + '=("([^"]*)"|[^,\\s]*)').exec(line); return m ? (m[2] !== undefined ? m[2] : m[1]) : null; };
const tagVal = (line) => { const i = line.indexOf(':'); return i > 0 ? line.slice(i + 1).trim() : ''; };

let cur = null;
const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });

const finish = () => {
    if (!cur) return;
    D.chTotal++;
    if (!cur.streaminf) D.chSinStreamInf++;
    if (!cur.exthttp) D.chSinExthttp++;
    if (!cur.codecPref) { D.chSinCodecPreferred++; if (D.chSinCodecIdx.length < 12) D.chSinCodecIdx.push(cur.n); }
    if (!cur.enhanceState) { D.chSinEnhanceState++; if (D.chSinEnhanceIdx.length < 12) D.chSinEnhanceIdx.push(cur.n); }
    if (!cur.owner) D.chSinOwner++;
    if (!cur.lcevc) D.chSinLcevc++;
    if (!cur.dv) D.chSinDv++;
    if (cur.url) {
        try {
            const u = new URL(cur.url);
            bump(D.urlScheme, u.protocol);
            const last = u.pathname.split('/').pop() || '';
            const ext = (last.match(/\.([a-z0-9]{1,5})$/i) || [, '(sin extension)'])[1].toLowerCase();
            bump(D.urlExt, ext);
            bump(D.urlPathKind, /\/pulse\//.test(u.pathname) ? 'pulse' : (/\.m3u8?$/i.test(last) ? 'm3u8-directo' : (/\/live\//.test(u.pathname) ? '/live/' : 'otro')));
        } catch (e) { bump(D.urlExt, '(invalida)'); }
    }
    cur = null;
};

rl.on('line', (line) => {
    if (line.startsWith('#EXTINF')) {
        finish();
        cur = { n: D.chTotal + 1, streaminf: 0, exthttp: 0, codecPref: 0, enhanceState: 0, owner: 0, lcevc: 0, dv: 0, url: null };
        const p = attr(line, 'ape-profile'); if (p) bump(D.apeProfile, p);
        return;
    }
    if (!cur) return;
    if (line.startsWith('#EXT-X-STREAM-INF')) {
        cur.streaminf++;
        bump(D.res, attr(line, 'RESOLUTION')); bump(D.codecs, attr(line, 'CODECS'));
        bump(D.bw, attr(line, 'BANDWIDTH')); bump(D.fps, attr(line, 'FRAME-RATE'));
        return;
    }
    if (line.startsWith('#EXTHTTP:')) { cur.exthttp++; return; }
    if (line.startsWith('#EXT-X-APE-CODEC-PREFERRED')) { cur.codecPref++; return; }
    if (line.startsWith('#EXT-X-APE-ENHANCE-STATE')) { cur.enhanceState++; bump(D.enhanceState, tagVal(line).slice(0, 40)); return; }
    if (line.startsWith('#EXT-X-APE-OWNER')) { cur.owner++; bump(D.owner, tagVal(line).slice(0, 40)); return; }
    if (line.startsWith('#EXT-X-APE-LCEVC-PHASE')) { cur.lcevc++; bump(D.lcevcPhase, tagVal(line)); return; }
    if (line.startsWith('#EXT-X-APE-DV-PROFILE')) { cur.dv++; return; }
    if (line.startsWith('#EXT-X-APE-RESOLUTION-SUPREMACY')) return bump(D.resSupremacy, tagVal(line));
    if (line.startsWith('#EXT-X-APE-4KFALSE-MODE')) return bump(D.fourKFalse, tagVal(line));
    if (line.startsWith('#EXT-X-APE-4KFALSE-TARGET-RES')) return bump(D.fourKTarget, tagVal(line));
    if (line.startsWith('#EXT-X-APE-CODEC-FULL')) return bump(D.codecFull, tagVal(line));
    if (line.startsWith('#EXT-X-APE-STRATEGY')) return bump(D.strategy, tagVal(line));
    if (line.startsWith('#EXT-X-APE-BUFFER-SECONDS')) return bump(D.bufferSeconds, tagVal(line));
    if (line.startsWith('#EXT-X-APE-HEADERS-COUNT')) return bump(D.headersCount, tagVal(line));
    if (line.startsWith('#EXT-X-CMAF-CONTAINER')) return bump(D.cmafContainer, tagVal(line));
    if (line && !line.startsWith('#') && /^https?:\/\//i.test(line.trim())) { cur.url = line.trim(); }
});

rl.on('close', () => {
    finish();
    const top = (o, n = 15) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
    const out = {
        canales: D.chTotal,
        ape_profile: top(D.apeProfile),
        stream_inf_resolution: top(D.res, 5),
        stream_inf_codecs: top(D.codecs, 5),
        stream_inf_bandwidth: top(D.bw, 8),
        stream_inf_frame_rate: top(D.fps, 5),
        canal_resolution_supremacy: top(D.resSupremacy),
        canal_4kfalse_mode: top(D.fourKFalse),
        canal_4kfalse_target_res: top(D.fourKTarget),
        canal_codec_full: top(D.codecFull),
        canal_enhance_state: D.enhanceState,
        canal_owner: D.owner,
        canal_lcevc_phase: top(D.lcevcPhase, 5),
        canal_cmaf_container: top(D.cmafContainer, 5),
        canal_strategy: top(D.strategy),
        canal_buffer_seconds: top(D.bufferSeconds),
        canal_headers_count: top(D.headersCount, 8),
        url_scheme: D.urlScheme, url_extension: top(D.urlExt, 10), url_kind: D.urlPathKind,
        faltantes: {
            sin_stream_inf: D.chSinStreamInf, sin_exthttp: D.chSinExthttp,
            sin_codec_preferred: D.chSinCodecPreferred, indices_sin_codec: D.chSinCodecIdx,
            sin_enhance_state: D.chSinEnhanceState, indices_sin_enhance: D.chSinEnhanceIdx,
            sin_owner: D.chSinOwner, sin_lcevc: D.chSinLcevc, sin_dv: D.chSinDv,
        },
    };
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
});
