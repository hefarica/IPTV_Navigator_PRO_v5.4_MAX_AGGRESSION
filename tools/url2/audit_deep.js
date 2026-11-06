#!/usr/bin/env node
'use strict';
/**
 * audit_deep.js — auditoría forense de una lista generada, en UNA pasada de streaming.
 * Uso: node tools/url2/audit_deep.js <lista.m3u8> [--json salida.json] [--samples N]
 *
 * Mide, sin interpretar:
 *  · cabecera completa (directivas globales)
 *  · censo de tags (#EXTINF, STREAM-INF, I-FRAME, MEDIA, EXTVLCOPT, KODIPROP, EXTHTTP…)
 *  · identidad por canal: tvg-id / tvg-name / group-title / nombre visible
 *  · DUPLICADOS: por URL exacta, por tvg-id, por nombre visible, por (nombre+URL)
 *  · URLs por canal (distribución 0/1/2/3+) — anti-509
 *  · atributos de #EXT-X-STREAM-INF (RESOLUTION/CODECS/FRAME-RATE/VIDEO-RANGE/HDCP-LEVEL/BANDWIDTH)
 *  · familias de tags #EXT-X-APE-*, declaraciones de mejora, OWNER/ENHANCE-STATE
 *  · EXTHTTP: JSON válido, nº de campos, y headers TÓXICOS prohibidos
 *  · hosts de las URLs, /pulse/ vs directo
 *  · tamaño de bloque por canal (líneas min/max/avg)
 *  · muestras verbatim de canales (principio, medio, final, aleatorias)
 */
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('uso: node tools/url2/audit_deep.js <lista.m3u8>'); process.exit(2); }
const getOpt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const JSON_OUT = getOpt('--json', null);
const SAMPLES = Number(getOpt('--samples', '4'));

const TOXIC = ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority', 'Upgrade-Insecure-Requests',
    'Proxy-Connection', 'Transfer-Encoding', 'Connection'];
const TOXIC_RX = new RegExp('^(' + TOXIC.map((h) => h.replace(/[-]/g, '\\-')).join('|') + ')$', 'i');

const S = {
    file, bytes: fs.statSync(file).size,
    lines: 0, extinf: 0, streaminf: 0, iframe: 0, iframe_no_uri: 0,
    media: 0, media_with_uri: 0, urls: 0, pulses: 0, direct: 0, non_http: 0,
    extvlcopt: 0, kodiprop: 0,
    exthttp: 0, exthttp_bad: 0, exthttp_fields: 0,
    toxic: {}, tagFam: {}, decl: {}, hosts: {},
    res: {}, codecs: {}, fps: {}, vrange: {}, hdcp: {}, bw: {},
    urlsPerChannel: {}, blockLines: { min: Infinity, max: 0, sum: 0, n: 0 },
    header: [],
    idCount: {}, nameCount: {}, urlCount: {}, nameUrlCount: {},
    dupUrl: 0, dupId: 0, dupName: 0, dupNameUrl: 0,
    samples: [], lastSamples: [],
    apeOwner: 0, apeChannels: 0,
};

const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const attr = (line, key) => {
    const m = new RegExp(key + '=("([^"]*)"|[^,]*)(,|$)').exec(line);
    if (!m) return null;
    return m[2] !== undefined ? m[2] : m[1];
};
const idmap = new Map(), namemap = new Map(), urlmap = new Map(), nameurlmap = new Map();

let cur = null;             // canal en construcción
let blockUrls = 0;
let blockBuf = null;        // muestra verbatim del canal actual (limitada)
let pending = null;         // { id, name, group, extinf }

const MAX_BUF = 40;

function closeChannel() {
    if (!cur) return;
    const urls = blockUrls;
    bump(S.urlsPerChannel, String(urls));
    S.blockLines.sum += cur.lines; S.blockLines.n++;
    if (cur.lines < S.blockLines.min) S.blockLines.min = cur.lines;
    if (cur.lines > S.blockLines.max) S.blockLines.max = cur.lines;

    if (cur.url) {
        if (urlmap.has(cur.url)) { S.dupUrl++; bump(urlmap, cur.url); } else urlmap.set(cur.url, 1);
        if (cur.id) {
            const k = cur.id;
            if (idmap.has(k)) { S.dupId++; idmap.set(k, idmap.get(k) + 1); } else idmap.set(k, 1);
        }
        if (cur.name) {
            if (namemap.has(cur.name)) { S.dupName++; namemap.set(cur.name, namemap.get(cur.name) + 1); } else namemap.set(cur.name, 1);
            const nk = cur.name + '|' + cur.url;
            if (nameurlmap.has(nk)) { S.dupNameUrl++; nameurlmap.set(nk, nameurlmap.get(nk) + 1); } else nameurlmap.set(nk, 1);
            bump(S.nameCount, cur.name);
        }
        if (cur.id) bump(S.idCount, cur.id);
    }
    // muestras
    const keep = { id: cur.id, name: cur.name, group: cur.group, urls: urls, lines: cur.lines, buf: cur.buf };
    if (S.samples.length < SAMPLES) S.samples.push(keep);
    else { S.lastSamples.push(keep); if (S.lastSamples.length > SAMPLES) S.lastSamples.shift(); }
    cur = null; blockUrls = 0;
}

const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });

rl.on('line', (line) => {
    S.lines++;
    if (S.lines <= 80) S.header.push(line);
    if (cur) { cur.lines++; if (cur.buf.length < MAX_BUF) cur.buf.push(line); }

    if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
        S.iframe++;
        if (!/URI=/.test(line)) S.iframe_no_uri++;
        if (cur && cur.buf.length < MAX_BUF) cur.buf.push('   [I-FRAME] ' + line.slice(0, 120));
        return;
    }
    if (line.startsWith('#EXT-X-MEDIA')) {
        S.media++;
        if (/URI=/.test(line)) S.media_with_uri++;
        return;
    }
    if (line.startsWith('#EXT-X-STREAM-INF')) {
        S.streaminf++;
        bump(S.res, attr(line, 'RESOLUTION'));
        bump(S.codecs, attr(line, 'CODECS'));
        bump(S.fps, attr(line, 'FRAME-RATE'));
        bump(S.vrange, attr(line, 'VIDEO-RANGE'));
        bump(S.hdcp, attr(line, 'HDCP-LEVEL'));
        bump(S.bw, attr(line, 'BANDWIDTH'));
        return;
    }
    if (line.startsWith('#EXTINF')) {
        closeChannel();
        S.extinf++;
        const gid = attr(line, 'tvg-id');
        const gname = attr(line, 'tvg-name');
        const group = attr(line, 'group-title');
        const nm = /,(.*)$/.exec(line);
        cur = {
            id: gid || '', tvgname: gname || '', name: nm ? nm[1].trim() : '', group: group || '',
            lines: 0, buf: [line.slice(0, 260)], url: null,
        };
        return;
    }
    if (line.startsWith('#EXTVLCOPT')) { S.extvlcopt++; return; }
    if (line.startsWith('#KODIPROP')) { S.kodiprop++; return; }
    if (line.startsWith('#EXTHTTP:')) {
        S.exthttp++;
        const raw = line.slice(9);
        try {
            const o = JSON.parse(raw);
            const keys = Object.keys(o || {});
            S.exthttp_fields += keys.length;
            for (const k of keys) if (TOXIC_RX.test(k.trim())) bump(S.toxic, k.trim());
        } catch (e) { S.exthttp_bad++; }
        return;
    }
    if (line.startsWith('#EXT-X-APE-')) {
        const fam = line.split(':')[0];
        bump(S.tagFam, fam);
        if (fam === '#EXT-X-APE-OWNER') S.apeOwner++;
        if (fam === '#EXT-X-APE-CHANNELS') S.apeChannels++;
        for (const k of ['LCEVC-PHASE', 'HDR10-PLUS', 'DOLBY-VISION', 'MINTERPOLATE', 'ENHANCE-STATE', 'AI-SR', 'CODEC-REAL', 'CODEC-PREFERRED', 'AUDIT-SCORECARD', 'INSTALLER', 'WAKE']) {
            if (line.startsWith('#EXT-X-APE-' + k)) bump(S.decl, k);
        }
        return;
    }
    if (line && !line.startsWith('#') && /^[a-z][a-z0-9+.-]*:\/\//i.test(line.trim())) {
        const u = line.trim();
        S.urls++;
        if (!/^https?:\/\//i.test(u)) S.non_http++;
        if (/\/pulse\//.test(u)) S.pulses++; else S.direct++;
        try { bump(S.hosts, new URL(u).host); } catch (e) { bump(S.hosts, '(invalida)'); }
        if (cur) { cur.url = u; blockUrls++; }
    }
});

rl.on('close', () => {
    closeChannel();
    const top = (o, k = 12) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k));
    const dupIds = [...idmap.entries()].filter(([, n]) => n > 1);
    const dupNames = [...namemap.entries()].filter(([, n]) => n > 1);
    const out = {
        file: S.file,
        bytes: S.bytes,
        lines: S.lines,
        header: S.header,
        counts: {
            extinf: S.extinf, streaminf: S.streaminf,
            iframe: S.iframe, iframe_sin_uri: S.iframe_no_uri,
            media: S.media, media_con_uri: S.media_with_uri,
            urls: S.urls, pulse: S.pulses, directo: S.direct, no_http: S.non_http,
            extvlcopt: S.extvlcopt, kodiprop: S.kodiprop,
            exthttp: S.exthttp, exthttp_json_invalido: S.exthttp_bad, exthttp_campos_total: S.exthttp_fields,
            ape_owner: S.apeOwner, ape_channels: S.apeChannels,
        },
        urls_por_canal: S.urlsPerChannel,
        lineas_por_canal: {
            min: S.blockLines.min === Infinity ? 0 : S.blockLines.min,
            max: S.blockLines.max,
            avg: S.blockLines.n ? +(S.blockLines.sum / S.blockLines.n).toFixed(1) : 0,
        },
        duplicados: {
            por_url_exacta: S.dupUrl, por_tvg_id: S.dupId, por_nombre: S.dupName, por_nombre_url: S.dupNameUrl,
            tvg_id_repetidos_top: top(Object.fromEntries(dupIds.map(([k, n]) => [k, n]))),
            nombres_repetidos_top: top(Object.fromEntries(dupNames.map(([k, n]) => [k, n]))),
            identidades_unicas: { tvg_id: idmap.size, nombre: namemap.size, url: urlmap.size },
        },
        streaminf: {
            resolution: top(S.res), codecs: top(S.codecs), frame_rate: top(S.fps),
            video_range: top(S.vrange), hdcp: top(S.hdcp), bandwidth: top(S.bw),
        },
        exthttp_headers_toxicos: S.toxic,
        hosts: top(S.hosts, 15),
        familias_ape: top(S.tagFam, 40),
        declaraciones: S.decl,
        muestras_inicio: S.samples,
        muestras_final: S.lastSamples,
    };
    if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
    // Resumen legible por stdout (y JSON completo si se pide)
    const R = out.counts;
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('AUDITORÍA PROFUNDA — ' + file);
    console.log('══════════════════════════════════════════════════════════════════');
    console.log(`bytes=${S.bytes}  lineas=${S.lines}`);
    console.log(`EXTINF=${R.extinf}  STREAM-INF=${R.streaminf}  I-FRAME=${R.iframe} (sin URI ${R.iframe_sin_uri})  MEDIA=${R.media} (con URI ${R.media_con_uri})`);
    console.log(`URLs=${R.urls}  /pulse/=${R.pulse}  directo=${R.directo}  no-http=${R.no_http}`);
    console.log(`EXTVLCOPT=${R.extvlcopt}  KODIPROP=${R.kodiprop}  EXTHTTP=${R.exthttp} (JSON inválido ${R.exthttp_json_invalido}, campos ${R.exthttp_campos_total})`);
    console.log(`APE-OWNER=${R.ape_owner}  APE-CHANNELS=${R.ape_channels}`);
    console.log(`URLs por canal: ${JSON.stringify(out.urls_por_canal)}`);
    console.log(`Líneas por canal: min=${out.lineas_por_canal.min} max=${out.lineas_por_canal.max} avg=${out.lineas_por_canal.avg}`);
    console.log(`Duplicados: url=${out.duplicados.por_url_exacta} tvg-id=${out.duplicados.por_tvg_id} nombre=${out.duplicados.por_nombre} nombre+url=${out.duplicados.por_nombre_url}`);
    console.log(`Identidades únicas: tvg-id=${out.duplicados.identidades_unicas.tvg_id} nombre=${out.duplicados.identidades_unicas.nombre} url=${out.duplicados.identidades_unicas.url}`);
    console.log('STREAM-INF resolution: ' + JSON.stringify(out.streaminf.resolution));
    console.log('STREAM-INF codecs    : ' + JSON.stringify(out.streaminf.codecs));
    console.log('STREAM-INF bandwidth : ' + JSON.stringify(out.streaminf.bandwidth));
    console.log('Headers tóxicos EXTHTTP: ' + (Object.keys(out.exthttp_headers_toxicos).length ? JSON.stringify(out.exthttp_headers_toxicos) : 'NINGUNO'));
    console.log('Hosts top: ' + JSON.stringify(out.hosts));
    if (JSON_OUT) console.log('JSON completo → ' + JSON_OUT);
});
