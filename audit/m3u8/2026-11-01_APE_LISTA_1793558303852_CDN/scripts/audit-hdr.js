/**
 * PASS 2 — MaxCLL/MaxFALL + coherencia HDR/resolución/codec por canal.
 * Una pasada streaming, salida JSON + CSV + muestras de contradicción.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FILE = process.argv[2];
const OUT = process.argv[3] || path.join(require('os').tmpdir(), 'ape-audit');
fs.mkdirSync(OUT, { recursive: true });

const rows = [];
const examples = { cllConflicts: [], fallGtCll: [], avgGtPeak: [], cllGtPeak: [], resMismatch: [], codecMismatch: [], sdrPq: [], levelUnderRes: [], tagCllMismatch: [], tagFallMismatch: [] };
const push = (k, v) => { if (examples[k].length < 5) examples[k].push(v); };

let cur = null;
const counters = {
    channels: 0,
    hasApeCll: 0, hasApeFall: 0, hasDhdrCll: 0, hasXhdrCll: 0, hasMetaPeak: 0,
    cllConflicts: 0, fallGtCll: 0, avgGtPeak: 0, cllGtPeak: 0, sdrPq: 0,
    resMismatch: 0, codecMismatch: 0, levelUnderRes: 0, dvProfiles: {}, hdrTypes: {}, modes: {},
    fourKFalseModes: {}, targets: {}, profiles: {}, streamRes: {}, codecStream: {}, vrange: {}, hdcp: {},
    cllVals: {}, fallVals: {}, dhdrCllVals: {}, dhdrPeakVals: {}, metaPeakVals: {}, metaAvgVals: {}, xhdrCllVals: {}, xhdrFallVals: {},
    verifiedTrue: 0, verifiedFalse: 0, hdrTagValues: {},
    tagCllMismatch: 0, tagFallMismatch: 0, cllZero: 0, fallZero: 0,
    dvProfile8OnSdr: 0, dvRpuClaimed: 0, hdrTypeSdrXhdrCl5000: 0, metaAvg1000: 0,
    daterangeNoMaxFall: 0, tagCllVals: {}, tagFallVals: {}
};
function inc(o, k) { if (k === undefined || k === null || k === '') return; o[k] = (o[k] || 0) + 1; }
function num(s) { const n = Number(s); return Number.isFinite(n) ? n : null; }

function emit() {
    const c = cur; cur = null;
    if (!c) return;
    counters.channels++;
    if (c.apeCll != null) counters.hasApeCll++;
    if (c.apeFall != null) counters.hasApeFall++;
    if (c.dCll != null) counters.hasDhdrCll++;
    if (c.xCll != null) counters.hasXhdrCll++;
    if (c.mPeak != null) counters.hasMetaPeak++;
    if (c.apeCll != null) inc(counters.cllVals, c.apeCll);
    if (c.apeCllTag != null) inc(counters.tagCllVals, c.apeCllTag);
    if (c.apeFallTag != null) inc(counters.tagFallVals, c.apeFallTag);
    if (c.apeCll === 0) counters.cllZero++;
    if (c.apeFall === 0) counters.fallZero++;
    if (c.apeCllTag != null && c.apeCll != null && c.apeCllTag !== c.apeCll) { counters.tagCllMismatch++; push('tagCllMismatch',{ch:c.name,tag:c.apeCllTag,hdr:c.apeCll}); }
    if (c.apeFallTag != null && c.apeFall != null && c.apeFallTag !== c.apeFall) { counters.tagFallMismatch++; push('tagFallMismatch',{ch:c.name,tag:c.apeFallTag,hdr:c.apeFall}); }
    if (c.dvProfile === '8' && c.dType && /SDR/i.test(c.dType)) counters.dvProfile8OnSdr++;
    if (c.dvRpu === true) counters.dvRpuClaimed++;
    if (c.dType && /SDR/i.test(c.dType) && c.xCll === 5000) counters.hdrTypeSdrXhdrCl5000++;
    if (c.mAvg === 1000) counters.metaAvg1000++;
    if (c.daterangeHasFall === false) counters.daterangeNoMaxFall++;
    if (c.apeFall != null) inc(counters.fallVals, c.apeFall);
    if (c.dCll != null) inc(counters.dhdrCllVals, c.dCll);
    if (c.dPeak != null) inc(counters.dhdrPeakVals, c.dPeak);
    if (c.mPeak != null) inc(counters.metaPeakVals, c.mPeak);
    if (c.mAvg != null) inc(counters.metaAvgVals, c.mAvg);
    if (c.xCll != null) inc(counters.xhdrCllVals, c.xCll);
    if (c.xFall != null) inc(counters.xhdrFallVals, c.xFall);
    if (c.verified === true) counters.verifiedTrue++;
    if (c.verified === false) counters.verifiedFalse++;
    inc(counters.profiles, c.profile);
    inc(counters.hdrTypes, c.dType);
    inc(counters.modes, c.dvMode);
    inc(counters.fourKFalseModes, c.k4Mode);
    inc(counters.targets, c.k4Target);
    inc(counters.streamRes, c.sRes);
    inc(counters.codecStream, (c.sCodecs || '').split(',')[0]);
    inc(counters.vrange, c.sVrange);
    inc(counters.hdcp, c.sHdcp);
    inc(counters.dvProfiles, c.dvProfile);
    inc(counters.hdrTagValues, c.apeHdr);

    // Conflictos MaxCLL: comparar valores disponibles
    const clls = [c.apeCll, c.dCll, c.xCll, c.mPeak].filter(v => v != null);
    const distinct = new Set(clls);
    if (clls.length >= 2 && distinct.size > 1) {
        counters.cllConflicts++;
        push('cllConflicts', { ch: c.name, profile: c.profile, ape: c.apeCll, dhdr: c.dCll, xhdr: c.xCll, metaPeak: c.mPeak, type: c.dType });
    }
    // MaxFALL > MaxCLL (por fuente emparejada y cruzada Ape/APE-metadata)
    if (c.apeFall != null && c.apeCll != null && c.apeFall > c.apeCll) { counters.fallGtCll++; push('fallGtCll', { ch: c.name, fall: c.apeFall, cll: c.apeCll }); }
    if (c.mAvg != null && c.mPeak != null && c.mAvg > c.mPeak) { counters.avgGtPeak++; push('avgGtPeak', { ch: c.name, avg: c.mAvg, peak: c.mPeak }); }
    if (c.dCll != null && c.dPeak != null && c.dCll > c.dPeak) { counters.cllGtPeak++; push('cllGtPeak', { ch: c.name, cll: c.dCll, peak: c.dPeak }); }
    // SDR declarando PQ/CP9
    if (c.dType && /SDR/i.test(c.dType) && /PQ/i.test(c.sVrange || '')) {
        counters.sdrPq++;
        push('sdrPq', { ch: c.name, type: c.dType, vrange: c.sVrange, res: c.sRes, codecs: c.sCodecs });
    }
    // resolución STREAM-INF vs resolución declarada en EXTHTTP (fuente)
    if (c.sRes && c.xRes && c.sRes !== c.xRes) {
        counters.resMismatch++;
        push('resMismatch', { ch: c.name, stream: c.sRes, exthttp: c.xRes, profile: c.profile });
    }
    // codec STREAM-INF vs codec EXTHTTP
    if (c.sCodecs && c.xCodec && c.sCodecs.split(',')[0] !== c.xCodec) {
        counters.codecMismatch++;
        push('codecMismatch', { ch: c.name, stream: c.sCodecs.split(',')[0], exthttp: c.xCodec, profile: c.profile });
    }
    // Ley Cardinal 1: nivel del codec vs resolución declarada
    const lvl = (c.sCodecs || '').match(/L(\d{2,3})/);
    if (lvl && c.sRes) {
        const h = Number((c.sRes.split('x')[1] || 0));
        const L = Number(lvl[1]);
        // per doctrine: L153 = 4K@60 techo => 8K exige >153; 1080p con L>=120 ok
        if (h >= 4320 && L <= 153) { counters.levelUnderRes++; push('levelUnderRes', { ch: c.name, res: c.sRes, codec: c.sCodecs }); }
    }
    rows.push({ name: c.name, profile: c.profile, xres: c.xRes, sres: c.sRes, codecs: c.sCodecs, vrange: c.sVrange,
        type: c.dType, apeCll: c.apeCll, apeFall: c.apeFall, dCll: c.dCll, dPeak: c.dPeak,
        mPeak: c.mPeak, mAvg: c.mAvg, xCll: c.xCll, xFall: c.xFall, dvNits: c.dvNits, dvMode: c.dvMode,
        verified: c.verified, k4: c.k4Mode, target: c.k4Target });
}

const rl = readline.createInterface({ input: fs.createReadStream(FILE), crlfDelay: Infinity });
let headerDone = false;

rl.on('line', (line) => {
    if (!headerDone && line.startsWith('#EXTINF')) { headerDone = true; }
    if (!headerDone) return;
    if (line.startsWith('#EXTINF')) {
        emit();
        const comma = line.lastIndexOf(',');
        cur = { name: line.slice(comma + 1).trim().slice(0, 100) };
        return;
    }
    if (!cur) return;
    if (line.startsWith('#EXTHTTP:')) {
        const get = (k) => { const m = line.match(new RegExp('"' + k + '":"([^"]*)"')); return m ? m[1] : null; };
        cur.profile = get('X-APE-Profile') || cur.profile;
        cur.xRes = get('X-Resolution') || get('X-APE-Resolution-Q');
        cur.xCodec = get('X-APE-Codec-Video');
        cur.xHdrMode = get('X-APE-HDR-Mode');
        cur.apeCll = num(get('X-APE-MaxCLL'));
        cur.apeFall = num(get('X-APE-MaxFALL'));
        cur.xCll = num(get('X-HDR-MaxCLL'));
        cur.xFall = num(get('X-HDR-MaxFALL'));
        cur.xNits = num(get('X-HDR-Nits'));
    } else if (line.startsWith('#EXT-X-APE-HDR-MAXCLL:')) {
        cur.apeCllTag = num(line.split(':')[1]);
    } else if (line.startsWith('#EXT-X-APE-HDR-MAXFALL:')) {
        cur.apeFallTag = num(line.split(':')[1]);
    } else if (line.startsWith('#EXT-X-APE-HDR-METADATA:')) {
        const p = line.match(/PEAK=(\d+)/); const a = line.match(/AVG=(\d+)/);
        cur.mPeak = p ? num(p[1]) : cur.mPeak; cur.mAvg = a ? num(a[1]) : cur.mAvg;
    } else if (line.startsWith('#EXT-X-APE-HDR-DV:')) {
        const m = line.match(/MODE=([^,\s]+)/); const n = line.match(/NITS=(\d+)/);
        cur.dvMode = m ? m[1] : cur.dvMode; cur.dvNits = n ? num(n[1]) : cur.dvNits;
    } else if (line.startsWith('#EXT-X-APE-HDR-VERIFIED:')) {
        cur.verified = /:true/i.test(line);
    } else if (line.startsWith('#EXT-X-APE-HDR:')) {
        cur.apeHdr = line.split(':')[1];
    } else if (line.startsWith('#EXT-X-APE-DV-METADATA:')) {
        cur.dvRpu = /RPU=true/i.test(line);
    } else if (line.startsWith('#EXT-X-APE-DV-PROFILE:')) {
        cur.dvProfile = line.split(':')[1];
    } else if (line.startsWith('#EXT-X-APE-4KFALSE-MODE:')) {
        cur.k4Mode = line.split(':')[1];
    } else if (line.startsWith('#EXT-X-APE-4KFALSE-TARGET-RES:')) {
        cur.k4Target = line.split(':')[1];
    } else if (line.startsWith('#EXT-X-DATERANGE:')) {
        const g = (re) => { const m = line.match(re); return m ? m[1] : null; };
        cur.dType = g(/X-HDR-TYPE="([^"]*)"/);
        cur.dCll = num(g(/X-HDR-MAX-CLL=(\d+)/));
        cur.dPeak = num(g(/X-HDR-PEAK-LUMINANCE=(\d+)/));
        const idm = line.match(/ID="hdr-(P\d)/); if (idm) cur.dProfile = idm[1];
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const g = (re) => { const m = line.match(re); return m ? m[1] : null; };
        cur.sRes = g(/RESOLUTION=([0-9x]+)/);
        cur.sCodecs = g(/CODECS="([^"]+)"/);
        cur.sVrange = g(/VIDEO-RANGE="?([A-Za-z0-9-]+)"?/);
        cur.sHdcp = g(/HDCP-LEVEL="?([A-Za-z0-9-]+)"?/);
        cur.sBw = g(/BANDWIDTH=(\d+)/);
    }
});
rl.on('close', () => {
    emit();
    // usar tag APE si el EXTHTTP faltara
    for (const r of rows) { /* noop */ }
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n || 12);
    const summary = {
        channels: counters.channels,
        coverage: {
            apeCll: counters.hasApeCll, apeFall: counters.hasApeFall,
            daterangeCll: counters.hasDhdrCll, exthttpHdrCll: counters.hasXhdrCll, metadataPeak: counters.hasMetaPeak
        },
        conflicts: {
            cllDistinctValues: counters.cllConflicts,
            apeFallGtApeCll: counters.fallGtCll,
            metaAvgGtPeak: counters.avgGtPeak,
            daterangeCllGtPeak: counters.cllGtPeak,
            sdrButPq: counters.sdrPq,
            streamResNeExthttpRes: counters.resMismatch,
            streamCodecNeExthttpCodec: counters.codecMismatch,
            levelUnderResolution: counters.levelUnderRes,
            tagVsHeaderCll: counters.tagCllMismatch, tagVsHeaderFall: counters.tagFallMismatch,
            cllZero: counters.cllZero, fallZero: counters.fallZero,
            dvProfile8OnSdr: counters.dvProfile8OnSdr, dvRpuClaimed: counters.dvRpuClaimed,
            sdrWithXhdrCll5000: counters.hdrTypeSdrXhdrCl5000, metaAvg1000: counters.metaAvg1000,
            daterangeWithoutMaxFall: counters.daterangeNoMaxFall
        },
        distributions: {
            apeCll: top(counters.cllVals), apeFall: top(counters.fallVals),
            daterangeCll: top(counters.dhdrCllVals), daterangePeak: top(counters.dhdrPeakVals),
            metadataPeak: top(counters.metaPeakVals), metadataAvg: top(counters.metaAvgVals),
            exthttpHdrCll: top(counters.xhdrCllVals), exthttpHdrFall: top(counters.xhdrFallVals),
            apeTagCll: top(counters.tagCllVals), apeTagFall: top(counters.tagFallVals)
        },
        verified: { true: counters.verifiedTrue, false: counters.verifiedFalse },
        profiles: top(counters.profiles), hdrTypes: top(counters.hdrTypes), dvModes: top(counters.modes),
        fourKFalseModes: top(counters.fourKFalseModes), fourKFalseTargets: top(counters.targets),
        streamRes: top(counters.streamRes), streamCodec: top(counters.codecStream),
        videoRange: top(counters.vrange), hdcp: top(counters.hdcp), dvProfiles: top(counters.dvProfiles),
        apeHdrState: top(counters.hdrTagValues),
        examples
    };
    fs.writeFileSync(path.join(OUT, 'hdr-audit.json'), JSON.stringify(summary, null, 2));
    const head = 'name\tprofile\txres\tsres\tcodecs\tvrange\ttype\tapeCll\tapeFall\tdCll\tdPeak\tmPeak\tmAvg\txCll\txFall\tdvNits\tdvMode\tverified\tk4\ttarget\n';
    const csv = head + rows.map(r => [r.name, r.profile, r.xres, r.sres, r.codecs, r.vrange, r.type, r.apeCll, r.apeFall, r.dCll, r.dPeak, r.mPeak, r.mAvg, r.xCll, r.xFall, r.dvNits, r.dvMode, r.verified, r.k4, r.target].join('\t')).join('\n');
    fs.writeFileSync(path.join(OUT, 'hdr-audit.tsv'), csv);
    console.log(JSON.stringify(summary, null, 2));
});


