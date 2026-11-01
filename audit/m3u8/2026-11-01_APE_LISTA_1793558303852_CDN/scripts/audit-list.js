/**
 * AUDIT STREAMING — lista M3U de ~606 MB (10.573 canales).
 * Una sola pasada, memoria acotada. Salida: JSON con métricas + muestras.
 * Uso: node audit-list.js <archivo> [outDir]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FILE = process.argv[2];
const OUT = process.argv[3] || path.join(require('os').tmpdir(), 'ape-audit');
fs.mkdirSync(OUT, { recursive: true });

const stats = {
    file: FILE,
    bytes: 0,
    lines: 0,
    blankLines: 0,
    maxLineLen: 0,
    crlf: 0,
    lf: 0,
    bom: false,
    headerLines: 0,
    channels: 0,
    endlist: 0,
    playlistType: 0,
    streamInfTotal: 0,
    mediaTotal: 0,
    mediaWithUri: 0,
    iframeTotal: 0,
    iframeWithUri: 0,
    extm3u: 0,
    extinf: 0,
    extinfNoAttrs: 0,
    urls: 0,
    channelsNoUrl: 0,
    channelsMultiUrl: 0,
    channelsMultiStreamInf: 0,
    channelsZeroStreamInf: 0,
    exthttpLines: 0,
    exthttpInvalid: 0,
    exthttpInvalidSamples: [],
    exthttpBytesMax: 0,
    exthttpOver8k: 0,
    exthttpOver7k8: 0,
    exthttpToxic: 0,
    exthttpToxicSamples: [],
    exthttpKeys: {},
    extvlcoptTotal: 0,
    kodipropTotal: 0,
    apeTotal: 0,
    daterangeTotal: 0,
    sessionDataTotal: 0,
    tags: {},
    tagPrefixes: {},
    maxcll: { lines: 0, channels: 0, values: {}, templates: [], samples: [], keys: {} },
    maxfall: { lines: 0, channels: 0, values: {}, templates: [], samples: [], keys: {} },
    hdr: { videoRange: {}, hdrMode: {}, hdr10plus: 0, dv: 0, dvh1: 0, hdrTag: 0, mastering: 0, colorspace: {} },
    codecs: {},
    codecTags: {},
    urlsDomains: {},
    urlSamples: [],
    groupTitles: {},
    namesSample: [],
    lineCounts: [],
    blockBytesSample: [],
    blockLines: {},
    channelState: null,
    headerSaved: false,
    headerFile: path.join(OUT, 'header.txt'),
    samplesDir: OUT,
    sampleChannels: [],
    anomalies: [],
    midSampleTaken: false,
    lastSample: null,
    firstChannel: null
};

const MAX_CL = /(max[-_ ]?cll|MAXCLL|maxcll)/i;
const MAX_FA = /(max[-_ ]?fall|MAXFALL|maxfall)/i;
const HDR10P = /hdr10\+|hdr10plus|hdr10_plus/i;
const HDR = /video-range|VIDEO-RANGE|hdr[-_ ]?mode|HDR-Mode|hdr_support|HDR-Support|dynamic-range|Dynamic-Range/i;
const TOXIC = /"?(Range|If-None-Match|If-Modified-Since|TE|Priority|Upgrade-Insecure-Requests|Connection|Keep-Alive|Proxy-Connection)"?\s*:/i;

function trunc(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
function inc(obj, k) { obj[k] = (obj[k] || 0) + 1; }
function pushSample(arr, v, n) { if (arr.length < (n || 8)) arr.push(v); }

function tagName(line) {
    // nombre de directiva: hasta ':' o '=' (o la línea entera si no hay)
    const m = line.match(/^#[A-Za-z0-9_.\-]+/);
    if (!m) return '#?';
    const base = m[0];
    return base;
}

function finalizeBlock(st) {
    const b = st.channelState;
    if (!b) return;
    st.lineCounts.push(b.lines);
    st.blockLines[b.lines] = (st.blockLines[b.lines] || 0) + 1;
    if (b.urls === 0) st.channelsNoUrl++;
    if (b.urls > 1) st.channelsMultiUrl++;
    if (b.streamInf > 1) st.channelsMultiStreamInf++;
    if (b.streamInf === 0) st.channelsZeroStreamInf++;
    if (b.maxcll) st.maxcll.channels++;
    if (b.maxfall) st.maxfall.channels++;
    if (b.maxcll && st.channels === 1) st.firstChannel = { name: b.name, lines: b.lines, urls: b.urls, streamInf: b.streamInf };
    st.channelState = null;
}

function parseExtinf(line) {
    // #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",NAME
    const out = {};
    const comma = line.lastIndexOf(',');
    out.name = comma >= 0 ? line.slice(comma + 1).trim() : '';
    const attrs = line.slice(0, comma);
    const re = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(attrs))) out[m[1]] = m[2];
    return out;
}

function noteMaxCll(st, kind, line) {
    const bucket = kind === 'cll' ? st.maxcll : st.maxfall;
    bucket.lines++;
    if (st.channelState) { if (kind === 'cll') st.channelState.maxcll = true; else st.channelState.maxfall = true; }
    // valores numéricos
    const nums = line.match(/\d{1,6}(?:\.\d+)?/g) || [];
    for (const n of nums) {
        if (n.length >= 2 && Number(n) >= 10) inc(bucket.values, n);
    }
    // plantilla (dígitos normalizados)
    const tmpl = line.replace(/\d+(\.\d+)?/g, 'N').slice(0, 160);
    if (!bucket.templates.includes(tmpl)) bucket.templates.push(tmpl);
    pushSample(bucket.samples, trunc(line, 300), 6);
    const key = tagName(line);
    inc(bucket.keys, key);
}

const rl = readline.createInterface({ input: fs.createReadStream(FILE), crlfDelay: Infinity });

rl.on('line', (line) => {
    const st = stats;
    st.lines++;
    const len = line.length;
    if (len > st.maxLineLen) st.maxLineLen = len;
    if (len === 0) { st.blankLines++; return; }

    // fin de línea CRLF se pierde con readline; detectamos por byte después.

    if (!st.headerSaved) {
        // header = hasta el primer #EXTINF
    }

    if (line.charCodeAt(0) === 0xFEFF) st.bom = true;
    const isDirective = line[0] === '#';

    if (!isDirective) {
        st.urls++;
        if (st.channelState) {
            st.channelState.urls++;
            if (st.channelState.urls === 1) st.channelState.url = line;
        }
        if (st.urlSamples.length < 10) st.urlSamples.push(trunc(line, 240));
        try {
            const host = new URL(line).hostname;
            inc(st.urlsDomains, host);
        } catch (e) { inc(st.urlsDomains, '(no-url)'); }
        return;
    }

    const tn = tagName(line);
    inc(st.tags, tn);
    // prefijo de familia: #EXT-X-APE-... => #EXT-X-APE
    const fam = tn.replace(/(#EXT-X-APE)-.*/, '$1').replace(/(#EXT-X-SESSION-DATA).*/, '$1');
    inc(st.tagPrefixes, fam);

    if (!st.headerSaved) {
        if (tn === '#EXTINF') {
            st.headerSaved = true;
            st.headerLines = st.lines - 1;
        } else {
            fs.appendFileSync(st.headerFile, line + '\n');
            if (tn === '#EXTM3U') st.extm3u++;
            return;
        }
    }

    if (tn === '#EXT-X-ENDLIST') st.endlist++;
    if (tn === '#EXT-X-PLAYLIST-TYPE') st.playlistType++;
    if (tn === '#EXT-X-STREAM-INF') {
        st.streamInfTotal++;
        if (st.channelState) st.channelState.streamInf++;
        const m = line.match(/CODECS="([^"]+)"/);
        if (m) inc(st.codecs, m[1]);
        if (/VIDEO-RANGE=/i.test(line)) {
            const vr = (line.match(/VIDEO-RANGE="?([A-Za-z0-9-]+)"?/) || [])[1] || '?';
            inc(st.hdr.videoRange, vr);
        }
        if (MAX_CL.test(line)) { inc(st.maxcll.keys, 'STREAM-INF'); noteMaxClId(st, line); }
        if (MAX_FA.test(line)) { inc(st.maxfall.keys, 'STREAM-INF'); noteMaxFall(st, line); }
    }
    if (tn === '#EXT-X-MEDIA') {
        st.mediaTotal++;
        if (/\bURI=/.test(line)) st.mediaWithUri++;
    }
    if (tn === '#EXT-X-I-FRAME-STREAM-INF') {
        st.iframeTotal++;
        if (/\bURI=/.test(line)) st.iframeWithUri++;
    }
    if (tn === '#EXTHTTP') {
        st.exthttpLines++;
        if (st.channelState) st.channelState.exthttp++;
        const payload = line.slice('#EXTHTTP:'.length);
        st.exthttpBytesMax = Math.max(st.exthttpBytesMax, payload.length);
        if (payload.length > 8192) st.exthttpOver8k++;
        if (payload.length > 7800) st.exthttpOver7k8++;
        let ok = true;
        try { const o = JSON.parse(payload); Object.keys(o).forEach(k => inc(st.exthttpKeys, k)); }
        catch (e) { ok = false; st.exthttpInvalid++; pushSample(st.exthttpInvalidSamples, trunc(payload, 300), 5); }
        if (ok && TOXIC.test(payload)) { st.exthttpToxic++; pushSample(st.exthttpToxicSamples, trunc(payload, 300), 5); }
    }
    if (tn === '#EXTVLCOPT') st.extvlcoptTotal++;
    if (tn === '#KODIPROP') st.kodipropTotal++;
    if (tn.startsWith('#EXT-X-APE')) st.apeTotal++;
    if (tn === '#EXT-X-DATERANGE') st.daterangeTotal++;
    if (tn === '#EXT-X-SESSION-DATA') st.sessionDataTotal++;
    if (tn === '#EXT-X-PART' || tn === '#EXT-X-PRELOAD-HINT' || tn === '#EXT-X-SERVER-CONTROL' || tn === '#EXT-X-SKIP' || tn === '#EXT-X-PART-INF') {
        inc(st.tags, '(ll-hls)' + tn);
    }
    if (HDR10P.test(line)) st.hdr.hdr10plus++;
    if (/dvh1|dvhe/i.test(line)) st.hdr.dvh1++;
    if (/DOLBY_VISION|Dolby Vision/i.test(line)) st.hdr.dv++;
    if (HDR.test(line)) st.hdr.hdrTag++;
    if (/MASTERING|MAXCLL|MAXFALL|MAX-CLL|MAX-FALL|ST 2086|ST2086/i.test(line)) st.hdr.mastering++;

    if (MAX_CL.test(line) && tn !== '#EXT-X-STREAM-INF') noteMaxClId(st, line);
    if (MAX_FA.test(line) && tn !== '#EXT-X-STREAM-INF') noteMaxFall(st, line);

    if (tn === '#EXTINF') {
        finalizeBlock(st);
        st.channels++;
        st.extinf++;
        const attrs = parseExtinf(line);
        if (!attrs['group-title'] && !attrs.name) st.extinfNoAttrs++;
        if (attrs['group-title']) inc(st.groupTitles, attrs['group-title']);
        if (st.namesSample.length < 8) st.namesSample.push(trunc(attrs.name || '', 120));
        st.channelState = {
            lines: 0, urls: 0, streamInf: 0, exthttp: 0,
            name: attrs.name || '', group: attrs['group-title'] || '',
            maxcll: false, maxfall: false, url: ''
        };
        // muestras explícitas: primera (1), mitad (5000) y última (siempre)
        st.curSample = (st.channels === 1 || st.channels === 5000) ? { idx: st.channels, lines: [] } : null;
        if (st.curSample) st.sampleChannels.push(st.curSample);
        return;
    }

    if (st.channelState) {
        st.channelState.lines++;
        if (st.curSample) st.curSample.lines.push(line);
    }
});

function noteMaxClId(st, line) { noteMaxCll(st, 'cll', line); }
function noteMaxFall(st, line) { noteMaxCll(st, 'fall', line); }

rl.on('close', () => {
    finalizeBlock(stats);
    try { stats.bytes = fs.statSync(FILE).size; } catch (e) {}
    // CRLF/LF aproximado por bytes
    try {
        const fd = fs.openSync(FILE, 'r');
        const buf = Buffer.alloc(1 << 20);
        let crlf = 0, lf = 0, read;
        while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
            for (let i = 0; i < read; i++) {
                if (buf[i] === 10) { if (i > 0 ? buf[i - 1] === 13 : false) crlf++; else lf++; }
            }
        }
        fs.closeSync(fd);
        stats.crlf = crlf; stats.lf = lf;
    } catch (e) { stats.crlfErr = String(e); }

    // histograma de líneas por canal
    const lc = stats.lineCounts.slice().sort((a, b) => a - b);
    const q = (p) => lc.length ? lc[Math.min(lc.length - 1, Math.floor(p * lc.length))] : 0;
    stats.lineStats = {
        n: lc.length, min: lc[0] || 0, p50: q(0.5), p90: q(0.9), p99: q(0.99),
        max: lc[lc.length - 1] || 0,
        avg: lc.length ? Math.round(lc.reduce((a, b) => a + b, 0) / lc.length) : 0
    };
    delete stats.lineCounts;

    // top valores
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
    stats.maxcll.valuesTop = top(stats.maxcll.values, 15);
    stats.maxfall.valuesTop = top(stats.maxfall.values, 15);
    delete stats.maxcll.values; delete stats.maxfall.values;
    stats.tagsTop = top(stats.tags, 120);
    delete stats.tags;
    stats.tagPrefixesTop = top(stats.tagPrefixes, 40);
    delete stats.tagPrefixes;
    stats.exthttpKeysTop = top(stats.exthttpKeys, 40);
    delete stats.exthttpKeys;
    stats.urlsDomainsTop = top(stats.urlsDomains, 25);
    delete stats.urlsDomains;
    stats.groupTitlesTop = top(stats.groupTitles, 25);
    delete stats.groupTitles;
    stats.codecsTop = top(stats.codecs, 15);
    delete stats.codecs;
    stats.channelsMultiUrlPct = stats.channels ? +(100 * stats.channelsMultiUrl / stats.channels).toFixed(2) : 0;
    stats.channelsNoUrlPct = stats.channels ? +(100 * stats.channelsNoUrl / stats.channels).toFixed(2) : 0;
    stats.maxcllChannelsPct = stats.channels ? +(100 * stats.maxcll.channels / stats.channels).toFixed(2) : 0;
    stats.maxfallChannelsPct = stats.channels ? +(100 * stats.maxfall.channels / stats.channels).toFixed(2) : 0;

    const jsonPath = path.join(OUT, 'audit.json');
    fs.writeFileSync(jsonPath, JSON.stringify(stats, null, 2));

    // muestras de bloque
    const samples = stats.sampleChannels.map(s => ({ idx: s.idx, lines: s.lines }));
    fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify(samples.map(s => ({ idx: s.idx, n: s.lines.length, first: s.lines.slice(0, 8), last: s.lines.slice(-5) })), null, 2));
    for (const s of samples) {
        fs.writeFileSync(path.join(OUT, `channel_${s.idx}.txt`), s.lines.join('\n'));
    }

    console.log(JSON.stringify({
        file: stats.file, bytes: stats.bytes, lines: stats.lines, channels: stats.channels,
        headerLines: stats.headerLines, lineStats: stats.lineStats,
        maxCll: { lines: stats.maxcll.lines, channelsPct: stats.maxcllChannelsPct, valuesTop: stats.maxcll.valuesTop, templates: stats.maxcll.templates.slice(0, 6), keys: stats.maxcll.keys },
        maxFall: { lines: stats.maxfall.lines, channelsPct: stats.maxfallChannelsPct, valuesTop: stats.maxfall.valuesTop, templates: stats.maxfall.templates.slice(0, 6), keys: stats.maxfall.keys },
        exthttp: { lines: stats.exthttpLines, invalid: stats.exthttpInvalid, over8k: stats.exthttpOver8k, over7k8: stats.exthttpOver7k8, toxic: stats.exthttpToxic, maxBytes: stats.exthttpBytesMax },
        hdr: stats.hdr,
        channelsNoUrl: stats.channelsNoUrl, channelsMultiUrl: stats.channelsMultiUrl,
        channelsMultiStreamInf: stats.channelsMultiStreamInf, channelsZeroStreamInf: stats.channelsZeroStreamInf,
        media: { total: stats.mediaTotal, withUri: stats.mediaWithUri },
        iframe: { total: stats.iframeTotal, withUri: stats.iframeWithUri },
        endlist: stats.endlist, playlistType: stats.playlistType,
        crlf: stats.crlf, lf: stats.lf, maxLineLen: stats.maxLineLen,
        out: OUT
    }, null, 2));
});

