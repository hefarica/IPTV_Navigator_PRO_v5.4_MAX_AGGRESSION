/*
 * count-url-shapes.js — mide de qué FORMA son las URLs del catálogo real.
 *
 * POR QUÉ: el fallo de t15 (N8) es que no se sabe qué proporción del catálogo
 * carece de id numérico. Eso decide si el rewrap CDN y el envoltorio /pulse/
 * son complementarios en la práctica o si uno de los dos nunca se ejerce.
 *
 * Réplica EXACTA de las reglas del generador (m3u8-typed-arrays-ultimate.js:13356-13357):
 *   /\/live\/[^/]+\/[^/]+\/(\d+)\.(?:m3u8|ts|mp4)/i
 *   /\/(\d+)\.(?:m3u8|ts|mp4)(?:[?#].*)?$/i
 *
 * Uso: node scratch/count-url-shapes.js <archivo.m3u8> [archivo2 ...]
 * Sólo lectura. Streaming línea a línea: aguanta 200+ MB sin cargar el fichero.
 */
'use strict';

const fs = require('fs');
const readline = require('readline');

const RE_XTREAM = /\/live\/[^/]+\/[^/]+\/(\d+)\.(?:m3u8|ts|mp4)/i;
const RE_ID_FIN = /\/(\d+)\.(?:m3u8|ts|mp4)(?:[?#].*)?$/i;
const RE_PULSE = /\/pulse\//i;
const RE_CDN = /\/cdn\//i;
const RE_RESOLVER = /resolve_quality(_unified)?\.php/i;
const RE_VPS_HOST = /^https?:\/\/iptv-ape\.duckdns\.org/i;

function forma(u) {
    if (RE_PULSE.test(u)) return 'ya_cableada_pulse';
    if (RE_CDN.test(u)) return 'ya_cdn_relay';
    if (RE_XTREAM.test(u) || RE_ID_FIN.test(u)) return 'con_id_numerico';
    return 'sin_id_numerico';
}

async function analizar(ruta) {
    const acc = { total: 0, con_id_numerico: 0, sin_id_numerico: 0, ya_cableada_pulse: 0, ya_cdn_relay: 0 };
    const ejemplosSinId = [];
    const rl = readline.createInterface({ input: fs.createReadStream(ruta, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const linea of rl) {
        const s = linea.trim();
        if (!s || s.startsWith('#')) continue;
        acc.total++;
        const f = forma(s);
        acc[f]++;
        if (f === 'sin_id_numerico' && ejemplosSinId.length < 5) ejemplosSinId.push(s.slice(0, 120));
    }
    const pct = (n) => acc.total ? (Math.round((n / acc.total) * 10000) / 100).toFixed(2) + ' %' : 'n/a';
    return { ruta, acc, pct, ejemplosSinId };
}

(async () => {
    const rutas = process.argv.slice(2);
    if (!rutas.length) { console.error('uso: node scratch/count-url-shapes.js <archivo.m3u8> [...]'); process.exit(2); }
    for (const ruta of rutas) {
        if (!fs.existsSync(ruta)) { console.log('FALTA ' + ruta); continue; }
        const t0 = Date.now();
        const r = await analizar(ruta);
        console.log('\n=== ' + r.ruta + ' ===');
        console.log('  lineas de URL      : ' + r.acc.total + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
        console.log('  con id numerico    : ' + r.acc.con_id_numerico + '   ' + r.pct(r.acc.con_id_numerico) + '   -> /pulse/ puede cablear');
        console.log('  SIN id numerico    : ' + r.acc.sin_id_numerico + '   ' + r.pct(r.acc.sin_id_numerico) + '   -> /pulse/ NO cablea; el rewrap CDN SI actua');
        console.log('  ya /pulse/         : ' + r.acc.ya_cableada_pulse + '   ' + r.pct(r.acc.ya_cableada_pulse));
        console.log('  ya /cdn/           : ' + r.acc.ya_cdn_relay + '   ' + r.pct(r.acc.ya_cdn_relay));
        if (r.ejemplosSinId.length) {
            console.log('  ejemplos sin id:');
            r.ejemplosSinId.forEach((e) => console.log('    ' + e));
        }
    }
})().catch((e) => { console.error('ERROR', e && e.message); process.exit(1); });
