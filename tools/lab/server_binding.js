#!/usr/bin/env node
/**
 * server_binding.js — verifica que cada canal use las credenciales de SU
 * servidor y no de otro. Un catalogo fusionado de dos proveedores puede
 * mezclar credenciales sin que el conteo total lo delate.
 *
 * Por canal compara cuatro marcas de "a quien pertenezco":
 *   A. host de la URI final
 *   B. host del tag #EXT-X-SERVER-1 (declarado por el generador)
 *   C. host del Referer dentro del KODIPROP manifest_headers
 *   D. host entre corchetes del tvg-name  ("... [line.tivi-ott.net]")
 * y comprueba que el par user/pass de la URI pertenezca al host de la URI.
 *
 * Uso: node tools/lab/server_binding.js --file <lista.m3u8>
 */
'use strict';
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FILE = get('--file');
if (!FILE || !fs.existsSync(FILE)) { console.error('falta --file'); process.exit(2); }

// credencial -> hosts donde aparece
const credToHosts = new Map();
let ch = 0;

const pairs = new Map();   // firma -> n
const idMismatch = [];     // tvg-id != stream_id
let noServer = 0, noBracket = 0, noRef = 0;

let cur = null;
const P = (k) => { pairs.set(k, (pairs.get(k) || 0) + 1); };

function note(a, b) { return a === b ? 'IGUAL' : 'DISTINTO(' + a + '/' + b + ')'; }

(async () => {
    const rl = readline.createInterface({
        input: fs.createReadStream(FILE, { encoding: 'utf8', highWaterMark: 1 << 20 }),
        crlfDelay: Infinity,
    });

    for await (const raw of rl) {
        const line = raw.trim();
        if (line.startsWith('#EXTINF')) {
            const idM = line.match(/tvg-id="([^"]*)"/);
            const nmM = line.match(/tvg-name="([^"]*)"/);
            const brM = (nmM ? nmM[1] : '').match(/\[([A-Za-z0-9.\-]+\.[A-Za-z]{2,})\]/);
            cur = {
                tvgId: idM ? idM[1] : null,
                bracket: brM ? brM[1] : null,
                server1: null, kodiRef: null, url: null,
            };
            continue;
        }
        if (!cur) continue;

        if (line.startsWith('#EXT-X-SERVER-1:')) {
            try { cur.server1 = new URL(line.slice(17)).hostname; } catch { cur.server1 = 'BAD'; }
        } else if (line.startsWith('#KODIPROP:inputstream.adaptive.manifest_headers=')) {
            const q = line.slice(48);
            for (const p of q.split('&')) {
                const i = p.indexOf('=');
                if (i < 0) continue;
                if (/^referer$/i.test(p.slice(0, i))) {
                    try { cur.kodiRef = new URL(p.slice(i + 1)).hostname; } catch { cur.kodiRef = 'BAD'; }
                }
            }
        } else if (/^https?:\/\//i.test(line)) {
            let u;
            try { u = new URL(line.split('|')[0]); } catch { cur = null; continue; }
            ch++;
            const segs = u.pathname.split('/').slice(1);   // live/user/pass/id.ext
            const user = segs.length >= 4 ? segs[1] : '?';
            const pass = segs.length >= 4 ? segs[2] : '?';
            const id = segs.length >= 4 ? segs[3].replace(/\.[A-Za-z0-9]+$/, '') : '?';

            if (!cur.server1) noServer++;
            if (!cur.bracket) noBracket++;
            if (!cur.kodiRef) noRef++;

            // ¿la credencial vive en mas de un host?
            const key = user + ':' + pass;
            if (!credToHosts.has(key)) credToHosts.set(key, new Map());
            const hm = credToHosts.get(key);
            hm.set(u.hostname, (hm.get(u.hostname) || 0) + 1);

            // tvg-id vs stream_id
            if (cur.tvgId !== null && cur.tvgId !== id && idMismatch.length < 10)
                idMismatch.push({ tvgId: cur.tvgId, id, host: u.hostname });

            P([
                'URL vs SERVER-1  : ' + (cur.server1 ? note(u.hostname, cur.server1) : 'sin tag'),
                'URL vs KODI-REF : ' + (cur.kodiRef ? note(u.hostname, cur.kodiRef) : 'sin ref'),
                'URL vs [bracket] : ' + (cur.bracket ? note(u.hostname, cur.bracket) : 'sin corchete'),
            ].join('   |   '));

            cur = null;
        }
    }

    const out = [];
    const W = s => out.push(s);
    W('='.repeat(84));
    W('BINDING CANAL -> SERVIDOR  (¿usa cada uno SU credencial?)');
    W('archivo : ' + FILE);
    W('canales : ' + ch);
    W('='.repeat(84));
    W('');
    W('CREDENCIALES DETECTADAS EN LA URI (user:pass) -> hosts donde aparece');
    W('-'.repeat(84));
    for (const [cred, hm] of credToHosts) {
        const hosts = [...hm.entries()];
        const flag = hosts.length > 1 ? '   <<== USA VARIOS HOSTS' : '';
        W('  ' + cred.padEnd(22) + hosts.map(([h, n]) => h + ' x' + n).join(' , ') + flag);
    }
    W('');
    W('CONSISTENCIA DE LAS CUATRO MARCAS DE SERVIDOR');
    W('-'.repeat(84));
    for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1]))
        W('  ' + String(n).padStart(7) + '  ' + k);
    W('');
    W('HUECOS');
    W('-'.repeat(84));
    W('  canales sin #EXT-X-SERVER-1        : ' + noServer);
    W('  canales sin [host] en el tvg-name  : ' + noBracket);
    W('  canales sin Referer en KODIPROP    : ' + noRef);
    W('');
    W('tvg-id != stream_id (max 10 mostrados) : ' + (idMismatch.length ? idMismatch.length + ' (lista truncada)' : '0'));
    for (const m of idMismatch) W('    tvg-id=' + m.tvgId + '  stream_id=' + m.id + '  host=' + m.host);

    console.log(out.join('\n'));
})();
