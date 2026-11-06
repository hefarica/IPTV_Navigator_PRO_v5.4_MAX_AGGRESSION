#!/usr/bin/env node
/**
 * identity_coherence.js — mide si un mismo canal declara la MISMA identidad
 * (User-Agent + Referer) en todas las capas que el player puede leer.
 *
 * Capas medidas:
 *   1. #EXTVLCOPT:http-user-agent   (VLC)
 *   2. #EXTVLCOPT:http-referrer     (VLC)
 *   3. #EXTHTTP JSON  User-Agent    (Kodi / players que leen EXTHTTP)
 *   4. #EXTHTTP JSON  Referer
 *   5. #KODIPROP manifest_headers   User-Agent (Kodi inputstream.adaptive)
 *   6. #KODIPROP manifest_headers   Referer
 *   7. PIPE de la URL               User-Agent (lo que lee el player del URI)
 *   8. PIPE de la URL               Referer
 *
 * Si 1..7 no coinciden, el player puede mandar UA distinto entre manifest y
 * segmento => session affinity mismatch (corte a 2-6 s en Flussonic).
 *
 * Uso: node tools/lab/identity_coherence.js --file <lista.m3u8>
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

const diag = new Map();   // firma -> { n, sample }

const REL = (a, b) => {
    if (!a && !b) return '∅=∅';
    if (!a || !b) return 'FALTA-1';
    return a === b ? 'IGUAL' : 'DISTINTO';
};

function sig(obj) {
    // La firma NO incluye el valor del UA del pipe (rota entre 60 valores a
    // proposito). Incluye si COINCIDE con cada otra capa, que es lo que decide
    // si hay session-affinity mismatch.
    return [
        'VLC-UA/HTTP-UA=' + REL(obj.vlcUa, obj.httpUa),
        'VLC-UA/KODI-UA=' + REL(obj.vlcUa, obj.kodiUa),
        'PIPE-UA/KODI-UA=' + REL(obj.pipeUa, obj.kodiUa),
        'VLC-REF/HTTP-REF=' + REL(obj.vlcRef, obj.httpRef),
        'KODI-REF vs host=' + (/^https?:\/\/[^\/]+\/?$/.test(obj.kodiRef || '') ? 'host-ok' : 'RARO'),
        'PIPE-REF=' + (/127\.0\.0\.1|localhost/i.test(obj.pipeRef || '') ? 'LOCALHOST' : (/%3A|%2F/i.test(obj.pipeRef || '') ? 'encoded-otro' : 'crudo')),
        'PIPE-REF-ENC=' + (/%3A|%2F/i.test(obj.pipeRef || '') ? 'SI' : 'NO'),
    ].join('  |  ');
}

const short = s => (s || '∅').length > 60 ? (s || '').slice(0, 57) + '…' : (s || '∅');

let n = 0, channels = 0;
let cur = null;

function closeChannel() {
    if (!cur) return;
    channels++;
    const k = sig(cur.obj);
    if (!diag.has(k)) diag.set(k, { n: 0, host: cur.host, sample: cur.obj, name: cur.name });
    diag.get(k).n++;
    cur = null;
}

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    for await (const raw of rl) {
        n++;
        const line = raw.trim();

        if (line.startsWith('#EXTINF')) {
            closeChannel();
            const nameM = line.match(/,(.*)$/);
            cur = { obj: {}, host: null, name: (nameM ? nameM[1] : '').slice(0, 48) };
            continue;
        }
        if (!cur) continue;

        if (line.startsWith('#EXTVLCOPT:http-user-agent=')) cur.obj.vlcUa = line.slice(31);
        else if (line.startsWith('#EXTVLCOPT:http-referrer=')) cur.obj.vlcRef = line.slice(27);
        else if (line.startsWith('#EXTHTTP:')) {
            try {
                const j = JSON.parse(line.slice(9));
                cur.obj.httpUa = j['User-Agent'] || null;
                cur.obj.httpRef = j['Referer'] || j['Referrer'] || null;
            } catch { cur.obj.httpBadJson = true; }
        }
        else if (line.startsWith('#KODIPROP:inputstream.adaptive.manifest_headers=')) {
            // El prefijo mide EXACTAMENTE 48 caracteres. slice(50) se comia "Us" y
            // dejaba la clave como "er-agent", produciendo un falso negativo
            // (KODIPROP UA = vacio). Verificado con node -e antes de fijar 48.
            const q = line.slice(48);
            for (const p of q.split('&')) {
                const i = p.indexOf('=');
                if (i < 0) continue;
                const k = p.slice(0, i).toLowerCase(), v = p.slice(i + 1);
                if (k === 'user-agent') cur.obj.kodiUa = v;
                else if (k === 'referer' || k === 'referrer') cur.obj.kodiRef = v;
            }
        }
        else if (/^https?:\/\//i.test(line)) {
            const i = line.indexOf('|');
            const urlPart = i === -1 ? line : line.slice(0, i);
            try { cur.host = new URL(urlPart).hostname; } catch { cur.host = '?'; }
            if (i !== -1) {
                for (const p of line.slice(i + 1).split('&')) {
                    const e = p.indexOf('=');
                    if (e < 0) continue;
                    const k = p.slice(0, e).toLowerCase(), v = p.slice(e + 1);
                    if (k === 'user-agent') cur.obj.pipeUa = v;
                    else if (k === 'referer' || k === 'referrer') cur.obj.pipeRef = v;
                }
            }
            closeChannel();
        }
    }
    closeChannel();

    const out = [];
    const P = s => out.push(s);
    P('='.repeat(84));
    P('COHERENCIA DE IDENTIDAD POR CANAL');
    P('archivo  : ' + FILE);
    P('canales  : ' + channels);
    P('firmas   : ' + diag.size);
    P('='.repeat(84));

    const byHost = new Map();
    // agregar por host
    const sorted = [...diag.entries()].sort((a, b) => b[1].n - a[1].n);

    for (const [signature, info] of sorted) {
        P('');
        P('─'.repeat(84));
        P(info.n + ' canales  ·  host ' + info.host + '  ·  ej "' + info.name + '"');
        P('─'.repeat(84));
        const o = info.sample;
        P('  VLC    UA : ' + short(o.vlcUa));
        P('  VLC    REF: ' + short(o.vlcRef));
        P('  EXTHTTP UA: ' + short(o.httpUa));
        P('  EXTHTTP REF: ' + short(o.httpRef));
        P('  KODIPROP UA: ' + short(o.kodiUa));
        P('  KODIPROP REF: ' + short(o.kodiRef));
        P('  PIPE   UA : ' + short(o.pipeUa));
        P('  PIPE   REF: ' + short(o.pipeRef));
        if (o.httpBadJson) P('  !! EXTHTTP no es JSON valido');
    }

    // veredictos
    P('');
    P('='.repeat(84));
    P('VEREDICTOS');
    P('='.repeat(84));
    let uaDistinctBloques = 0, refDistinctBloques = 0;
    let pipesLocalhost = 0, pipesEncoded = 0, uaPipeVsKodi = 0;
    for (const [sigKey, info] of sorted) {
        const o = info.sample;
        const uas = new Set([o.vlcUa, o.httpUa, o.kodiUa, o.pipeUa].filter(Boolean));
        const refs = new Set([o.vlcRef, o.httpRef, o.kodiRef, o.pipeRef].filter(Boolean));
        if (uas.size > 1) uaDistinctBloques += info.n;
        if (refs.size > 1) refDistinctBloques += info.n;
        if (/127\.0\.0\.1|localhost/i.test(o.pipeRef || '')) pipesLocalhost += info.n;
        if (/%3A|%2F/i.test(o.pipeRef || '')) pipesEncoded += info.n;
        if (o.pipeUa && o.kodiUa && o.pipeUa !== o.kodiUa) uaPipeVsKodi += info.n;
    }
    P('  canales con >1 User-Agent entre sus capas : ' + uaDistinctBloques + ' / ' + channels);
    P('  canales con >1 Referer entre sus capas   : ' + refDistinctBloques + ' / ' + channels);
    P('  canales con PIPE-UA != KODIPROP-UA       : ' + uaPipeVsKodi + ' / ' + channels);
    P('  canales con PIPE-Referer = localhost     : ' + pipesLocalhost + ' / ' + channels);
    P('  canales con PIPE-Referer URL-encoded     : ' + pipesEncoded + ' / ' + channels);

    console.log(out.join('\n'));
})();
