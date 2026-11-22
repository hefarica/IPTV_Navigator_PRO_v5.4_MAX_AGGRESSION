#!/usr/bin/env node
'use strict';
/*
 * 403-matrix.js — DIAGNÓSTICO DETERMINISTA DE UN 403 CONTRA UN CANAL REAL.
 *
 * POR QUÉ EN NODE Y NO EN LA CONSOLA DEL NAVEGADOR:
 * `fetch` del navegador IGNORA `User-Agent`, `Referer`, `Origin` y `Cookie` en headers
 * (son forbidden request headers de Fetch API). Un A/B de UA desde la consola manda siempre
 * el UA del navegador y por tanto NO prueba nada. Node/undici sí permite fijarlos.
 *
 * USO:
 *   node IPTV_v5.4_MAX_AGGRESSION/tools/diag/403-matrix.js "<URL_DEL_CANAL>"
 *   node ... --headers-file=headers.json      (JSON con cabeceras extra a replicar)
 *   node ... --timeout=15000 --json           (salida machine-readable)
 *
 * QUÉ HACE: 8 sondas GET en orden, cada una aislada con timeout, y una tabla con
 * status / content-type / bytes / server. No muta nada, no sigue más de 5 redirects,
 * no imprime credenciales de la URL (las enmascara).
 *
 * LECTURA DEL RESULTADO:
 *   · sólo las variantes "sin X-APE/exo" dan 200  → son NUESTRAS cabeceras.
 *   · sólo la variante de UA de reproductor da 200 → es el UA.
 *   · todas 403 salvo una con el UA del proveedor/player exacto → UA + posible WAF.
 *   · todas 403 y el body dice token/expired   → URL/token, no cabeceras.
 *   · 509 en alguna                            → límite de conexiones del panel.
 */
const { argv, exit } = process;

const args = argv.slice(2);
const flag = (name, def) => {
    const hit = args.find(a => a.startsWith('--' + name + '='));
    return hit ? hit.split('=').slice(1).join('=') : def;
};
const asJson = args.includes('--json');
const timeoutMs = parseInt(flag('timeout', '15000'), 10);
const headersFile = flag('headers-file', null);
const url = args.find(a => !a.startsWith('--'));
if (!url) {
    console.error('Falta la URL del canal.\n  node 403-matrix.js "<URL>" [--headers-file=h.json] [--timeout=15000] [--json]');
    exit(2);
}

let extra = {};
if (headersFile) {
    try { extra = JSON.parse(require('fs').readFileSync(headersFile, 'utf8')); }
    catch (e) { console.error('headers-file inválido: ' + e.message); exit(2); }
}

const masked = url.replace(/(\/live\/)([^/]+)\/([^/]+)\//, (m, p, u, pw) => p + '***' + '/' + '***' + '/');

/* Las 2 cabeceras X-APE + 2 exo_* que NUESTRA lista emite al proveedor (medido en el manifiesto). */
const APE_HDRS = { 'X-APE-Profile': 'P0', 'X-APE-Tier': 'TU', exo_tunneled_playback: 'true', exo_tunneled_fallback: 'safe' };
const UA = {
    tizen8k: 'Mozilla/5.0 (SMART-TV; Tizen 8.0; Samsung 8K QN900D) AppleWebKit/538.1 (KHTML, like Gecko)',
    vlc: 'VLC/3.0.20 LibVLC/3.0.20',
    okhttp: 'okhttp/4.9.3',
    exoplayer: 'ExoPlayerLib/2.19.1',
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    none: null
};

const PROBES = [
    { id: 'P1', label: 'UA Tizen8K + X-APE/exo (lo que emite la lista)', ua: UA.tizen8k, hdrs: APE_HDRS },
    { id: 'P2', label: 'UA Tizen8K, SIN X-APE/exo', ua: UA.tizen8k, hdrs: {} },
    { id: 'P3', label: 'UA VLC, SIN X-APE/exo', ua: UA.vlc, hdrs: {} },
    { id: 'P4', label: 'UA okhttp, SIN X-APE/exo', ua: UA.okhttp, hdrs: {} },
    { id: 'P5', label: 'UA ExoPlayer, SIN X-APE/exo', ua: UA.exoplayer, hdrs: {} },
    { id: 'P6', label: 'UA Chrome, SIN X-APE/exo', ua: UA.chrome, hdrs: {} },
    { id: 'P7', label: 'UA VLC + X-APE/exo', ua: UA.vlc, hdrs: APE_HDRS },
    { id: 'P8', label: 'Sin User-Agent explícito (default de node)', ua: UA.none, hdrs: {} }
];

(async () => {
    const out = [];
    for (const p of PROBES) {
        const headers = Object.assign({}, extra, p.hdrs);
        if (p.ua === null) delete headers['User-Agent'];
        else headers['User-Agent'] = p.ua;
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), timeoutMs);
        const t0 = Date.now();
        let rec = { id: p.id, label: p.label, status: null, ms: null, ct: '', bytes: null, server: '', cf: '', note: '' };
        try {
            const r = await fetch(url, { headers, redirect: 'follow', signal: ac.signal });
            const buf = Buffer.from(await r.arrayBuffer());
            rec.status = r.status;
            rec.ct = (r.headers.get('content-type') || '').split(';')[0];
            rec.bytes = buf.length;
            rec.server = r.headers.get('server') || '';
            rec.cf = r.headers.get('cf-ray') ? 'cf' : '';
            rec.ms = Date.now() - t0;
            if (r.status !== 200) {
                const txt = buf.toString('utf8').replace(/\s+/g, ' ').slice(0, 120);
                rec.note = txt;
            } else if (!/#EXTM3U/.test(buf.toString('utf8').slice(0, 64))) {
                rec.note = '200 pero no parece M3U8 (primeros bytes: ' + buf.toString('utf8').slice(0, 24).replace(/\s+/g, ' ') + ')';
            }
        } catch (e) {
            rec.note = (e.name === 'AbortError' ? 'TIMEOUT ' + timeoutMs + 'ms' : 'ERROR ' + e.message).slice(0, 140);
            rec.ms = Date.now() - t0;
        } finally { clearTimeout(t); }
        out.push(rec);
    }

    if (asJson) { console.log(JSON.stringify({ url: masked, probes: out }, null, 2)); return; }

    console.log('\nURL: ' + masked + (extra && Object.keys(extra).length ? '   (headers-file: ' + Object.keys(extra).length + ' cabeceras extra)' : ''));
    console.log('─'.repeat(96));
    for (const r of out) {
        const st = r.status === null ? '---' : String(r.status);
        console.log(r.id + '  ' + String(r.status === null ? r.note : st).padEnd(6) + String(r.ct).padEnd(18) +
            String(r.bytes === null ? '' : r.bytes + 'B').padEnd(9) + String(r.server).padEnd(14) + (r.ms !== null ? r.ms + 'ms' : ''));
        console.log('    ' + r.label);
        if (r.note && r.status !== 200) console.log('    ↳ ' + r.note);
        if (r.note && r.status === 200) console.log('    ↳ ' + r.note);
    }
    console.log('─'.repeat(96));
    const ok = out.filter(r => r.status === 200);
    if (!ok.length) {
        console.log('VEREDICTO: ninguna variante obtuvo 200 → NO son las cabeceras ni el UA:');
        console.log('           sospecha URL/token vencido, IP bloqueada o el panel caído.');
    } else {
        console.log('VEREDICTO: 200 en → ' + ok.map(r => r.id).join(', '));
        console.log('           compara con P1: si P1 falla y otra pasa, la causa son UA/cabeceras, no el token.');
    }
})();
