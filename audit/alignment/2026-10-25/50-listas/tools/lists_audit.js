#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * lists_audit.js — auditoría RFC 8216 / doctrina de listas .m3u8 (Familia B: directas al proveedor)
 *
 * READ-ONLY: solo fs.createReadStream. NO escribe, NO mueve, NO borra listas.
 * Escribe su propio informe JSON (artefacto de auditoría nuevo) en --out.
 *
 * Todos los URLs se ENMASCARAN antes de salir: ninguna credencial completa se reproduce.
 *
 * Uso:  node lists_audit.js --out <report.json> <lista1.m3u8> [lista2.m3u8 ...]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

/* ─────────────────────────── enmascarado de credenciales ─────────────────── */
const STRUCT = new Set(['live', 'movie', 'series', 'shield', 'cdn', 'meta', 'stream', 'playlist',
  'index', 'm3u8', 'ts', 'm4s', 'mp4', 'master', 'hls', 'play', 'get', 'api', 'timeshift', 'catchup']);
const EXT_RE = /\.(m3u8|ts|m4s|mp4|key|aac|vtt|mpd)$/i;

function maskToken(tok) {
  const m = tok.match(EXT_RE);
  if (m) {
    const base = tok.slice(0, tok.length - m[0].length);
    if (base.length <= 3) return tok;
    return '<CRED>' + m[0];
  }
  return '<CRED>';
}

function maskUrl(u) {
  if (typeof u !== 'string' || u === '') return u;
  const m = u.match(/^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!m) return '<MASKED-NONURL>';
  const scheme = m[1], host = m[2], p = m[3] || '', q = m[4] ? '?<Q>' : '';
  const segs = p.split('/').filter((s) => s !== '');
  const out = segs.map((s) => {
    const low = s.toLowerCase();
    if (STRUCT.has(low)) return s;
    return maskToken(s);
  });
  return `${scheme}://${host}/${out.join('/')}${q}`;
}

/* ─────────────────────────── tablas de nivel (Ley Cardinal 1) ────────────── */
// HEVC general_level_idc (Annex A) — techo de muestras por resolución+fps (doctrina OMEGA)
const HEVC_LEVELS = [
  { idc: 93, w: 1280, h: 720, fps: 30 },
  { idc: 120, w: 1920, h: 1080, fps: 30 },
  { idc: 123, w: 1920, h: 1080, fps: 60 },
  { idc: 150, w: 3840, h: 2160, fps: 30 },
  { idc: 153, w: 3840, h: 2160, fps: 60 },
  { idc: 156, w: 3840, h: 2160, fps: 120 },
  { idc: 180, w: 7680, h: 4320, fps: 30 },
  { idc: 183, w: 7680, h: 4320, fps: 60 },
  { idc: 186, w: 7680, h: 4320, fps: 120 },
];
function hevcRequired(w, h, fps) {
  const px = w * h;
  for (const L of HEVC_LEVELS) {
    if (px <= L.w * L.h && fps <= L.fps) return L.idc;
  }
  return 186;
}
// AVC level_idc (H.264 Annex A, MaxFS/MaxMBPS aproximados)
const AVC_LEVELS = [
  { idc: 31, w: 1280, h: 720, fps: 30 },
  { idc: 40, w: 1920, h: 1080, fps: 30 },
  { idc: 42, w: 1920, h: 1080, fps: 60 },
  { idc: 50, w: 2560, h: 1440, fps: 30 },
  { idc: 51, w: 3840, h: 2160, fps: 30 },
  { idc: 52, w: 3840, h: 2160, fps: 60 },
  { idc: 60, w: 7680, h: 4320, fps: 30 },
  { idc: 62, w: 7680, h: 4320, fps: 60 },
];
function avcRequired(w, h, fps) {
  const px = w * h;
  for (const L of AVC_LEVELS) if (px <= L.w * L.h && fps <= L.fps) return L.idc;
  return 62;
}
// AV1 seq_level_idx → MaxPicSize (AV1 spec §A.3): 5.0-5.3 = 3840x2160; 6.0+ = 7680x4320
function av1MaxPixels(idx) {
  if (idx <= 3) return 1280 * 720;
  if (idx <= 7) return 1920 * 1080;
  if (idx <= 11) return 2048 * 1088 * 2;
  if (idx <= 15) return 3840 * 2160;
  return 7680 * 4320;
}
function av1RequiredIdx(w, h) {
  const px = w * h;
  for (let i = 0; i <= 23; i++) if (px <= av1MaxPixels(i)) return i;
  return 23;
}
const LEVEL_NAME = (idc) => (idc / 30).toFixed(1).replace('.0', '.0');

/* ─────────────────────────── parsing de atributos ────────────────────────── */
function parseAttrs(s) {
  const out = {};
  const re = /([A-Za-z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1].toUpperCase()] = v;
  }
  return out;
}
function codecTokens(c) {
  if (!c) return [];
  return c.split(',').map((x) => x.trim()).filter(Boolean);
}
const AUDIO_RE = /^(mp4a|ac-3|ec-3|opus|flac|dtsc|dtsh|mha1|mhm1|mp3)/i;

// GOLDEN RULE: hvc1.* solo en STREAM-INF CODECS; hev1.* solo en EXTVLCOPT/KODIPROP
function goldenRuleViolations(codecTokensArr) {
  return codecTokensArr.filter((t) => /^hev1/i.test(t));
}

/* ─────────────────────────── auditoría de un archivo ─────────────────────── */
async function auditFile(file) {
  const st = fs.statSync(file);
  const sha = await new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex').toUpperCase())).on('error', rej);
  });

  const R = {
    file: file.replace(/\\/g, '/'),
    bytes: st.size,
    sha256: sha,
    lines: 0,
    extm3u: { count: 0, line: null, text: null },
    uriLines: 0,
    extinf: 0,
    channels: 0,
    tagCounts: {},
    media: { count: 0, withUri: 0, uriLines: [] },
    iframe: { count: 0, withUri: 0, uriLines: [] },
    exthttp: { count: 0, jsonOk: 0, jsonFail: 0, toxic: {}, waf: {}, failSamples: [], samples: [] },
    golden: { hev1InStreamInf: 0, hev1Lines: [], hvc1InVlcopt: 0, hvc1InKodiprop: 0, hvc1SideLines: [], counts: {} },
    streamInf: { count: 0, withCodecs: 0, withResolution: 0, withBandwidth: 0, withVideoRange: 0, videoRangeDup: 0, dupLines: [], noCodecs: 0, noResolution: 0 },
    pairs: {},          // "RES|CODECS|VR" -> count
    impossible: { count: 0, samples: [] },
    multiUrl: { channels: 0, samples: [], maxUrls: 0 },
    dupUrl: { count: 0, samples: [] },
    tvg: { missingId: 0, missingName: 0, missingGroup: 0, missingLogo: 0, samples: [] },
    mediaPlaylistTags: {},   // tags de Media Playlist hallados en un catálogo
    extinfDuration: { notOne: 0, sample: null, max: null },
    targetDuration: null,
    durationExceedsTarget: { count: 0, samples: [] },
    channelSamples: [],
    headerLines: [],
    tailLines: [],
  };

  const seenUrl = new Map();
  let cur = null;
  const MAXS = 6;

  const pushLimited = (arr, v, lim) => { if (arr.length < (lim || MAXS)) arr.push(v); };

  const rl = readline.createInterface({ input: fs.createReadStream(file, { highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  let prevUrlInChannel = false;
  const tail = [];
  for await (let line of rl) {
    R.lines++;
    if (R.lines <= 40) R.headerLines.push(`${R.lines}|${line}`);
    tail.push(`${R.lines}|${line}`); if (tail.length > 12) tail.shift();

    if (line === '') continue;

    if (line[0] === '#') {
      prevUrlInChannel = false;
      const tag = (line.match(/^#(EXT[A-Z0-9-]*)/) || [])[1] || line.slice(0, 24);
      R.tagCounts[tag] = (R.tagCounts[tag] || 0) + 1;

      if (line.startsWith('#EXTM3U')) {
        R.extm3u.count++; if (R.extm3u.line === null) { R.extm3u.line = R.lines; R.extm3u.text = line.slice(0, 300); }
        continue;
      }

      if (line.startsWith('#EXTINF')) {
        if (cur) flushChannel();
        R.extinf++;
        cur = { line: R.lines, extinf: line, urls: [], streamInf: [] };
        const d = line.match(/^#EXTINF:(-?[0-9.]+)/);
        if (d && d[1] !== '-1') { R.extinfDuration.notOne++; if (!R.extinfDuration.sample) R.extinfDuration.sample = `${R.lines}|${line.slice(0, 160)}`; }
        if (d) { const n = parseFloat(d[1]); if (R.extinfDuration.max === null || n > R.extinfDuration.max) R.extinfDuration.max = n; }
        if (!/tvg-id="/.test(line)) R.tvg.missingId++;
        if (!/tvg-name="/.test(line)) R.tvg.missingName++;
        if (!/group-title="/.test(line)) R.tvg.missingGroup++;
        if (!/tvg-logo="/.test(line)) R.tvg.missingLogo++;
        if (R.extinf <= 3 || R.tvg.samples.length < 2) pushLimited(R.tvg.samples, `${R.lines}|${maskExtinf(line)}`);
        continue;
      }

      if (line.startsWith('#EXT-X-STREAM-INF')) {
        R.streamInf.count++;
        const attrs = parseAttrs(line.slice(line.indexOf(':') + 1));
        if (attrs.CODECS) R.streamInf.withCodecs++; else R.streamInf.noCodecs++;
        if (attrs.RESOLUTION) R.streamInf.withResolution++; else R.streamInf.noResolution++;
        if (attrs.BANDWIDTH) R.streamInf.withBandwidth++;
        const vrAll = (line.match(/VIDEO-RANGE=/g) || []).length;
        if (vrAll > 0) R.streamInf.withVideoRange++;
        if (vrAll > 1) { R.streamInf.videoRangeDup++; pushLimited(R.streamInf.dupLines, `${R.lines}|${line.slice(0, 220)}`); }

        const toks = codecTokens(attrs.CODECS);
        for (const t of toks) {
          const fam = /^hvc1/i.test(t) ? 'hvc1' : /^hev1/i.test(t) ? 'hev1' : /^avc1/i.test(t) ? 'avc1'
            : /^(dvh1|dvhe)/i.test(t) ? 'dolby' : /^av01/i.test(t) ? 'av01' : AUDIO_RE.test(t) ? 'audio' : 'other';
          R.golden.counts[fam] = (R.golden.counts[fam] || 0) + 1;
        }
        const bad = goldenRuleViolations(toks);
        if (bad.length) { R.golden.hev1InStreamInf++; pushLimited(R.golden.hev1Lines, `${R.lines}|${line.slice(0, 200)}`); }

        const key = `${attrs.RESOLUTION || '?'}|${attrs.CODECS || ''}|${attrs['VIDEO-RANGE'] || ''}|${attrs.BANDWIDTH || '?'}`;
        R.pairs[key] = (R.pairs[key] || 0) + 1;

        if (attrs.RESOLUTION && attrs.CODECS) checkImpossible(R, R.lines, attrs.RESOLUTION, attrs.CODECS, line);
        if (cur) cur.streamInf.push({ line: R.lines, lineText: line.slice(0, 240) });
        continue;
      }

      if (line.startsWith('#EXTHTTP')) {
        R.exthttp.count++;
        const payload = line.slice(line.indexOf(':') + 1);
        let obj = null;
        try { obj = JSON.parse(payload); R.exthttp.jsonOk++; }
        catch (e) { R.exthttp.jsonFail++; pushLimited(R.exthttp.failSamples, `${R.lines}|${String(e.message).slice(0, 80)}|${payload.slice(0, 160)}`); }
        if (obj && typeof obj === 'object') {
          const lower = {};
          for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
          const TOX = ['range', 'if-none-match', 'if-modified-since', 'te', 'priority', 'upgrade-insecure-requests'];
          for (const t of TOX) if (t in lower) R.exthttp.toxic[t] = (R.exthttp.toxic[t] || 0) + 1;
          if ('traceparent' in lower) R.exthttp.waf.traceparent = (R.exthttp.waf.traceparent || 0) + 1;
          if ('x-requested-with' in lower) R.exthttp.waf.x_requested_with = (R.exthttp.waf.x_requested_with || 0) + 1;
          for (const k of ['referer', 'origin']) {
            const v = String(lower[k] || '');
            if (/iptv-ape|duckdns|178\.156|hetzner/i.test(v)) R.exthttp.waf.vps_referer = (R.exthttp.waf.vps_referer || 0) + 1;
          }
          for (const k of Object.keys(lower)) {
            const v = String(lower[k]);
            if (/OMEGA|CRYSTAL|APE_[A-Z0-9_]*ULTIMATE/i.test(v)) { R.exthttp.waf.engine_fingerprint = (R.exthttp.waf.engine_fingerprint || 0) + 1; break; }
          }
          if (R.exthttp.samples.length < 2) pushLimited(R.exthttp.samples, `${R.lines}|${maskExthttp(obj)}`);
        }
        continue;
      }

      if (line.startsWith('#EXT-X-MEDIA:')) {
        R.media.count++;
        if (/(^|,)\s*URI=/.test(line)) { R.media.withUri++; pushLimited(R.media.uriLines, `${R.lines}|${maskUrl(line.slice(0, 240))}`); }
        continue;
      }
      if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
        R.iframe.count++;
        if (/(^|,)\s*URI=/.test(line)) { R.iframe.withUri++; pushLimited(R.iframe.uriLines, `${R.lines}|${maskUrl(line.slice(0, 240))}`); }
        continue;
      }
      if (line.startsWith('#EXT-X-TARGETDURATION')) {
        const m = line.match(/TARGETDURATION:([0-9.]+)/); if (m) R.targetDuration = parseFloat(m[1]);
        R.mediaPlaylistTags['EXT-X-TARGETDURATION'] = (R.mediaPlaylistTags['EXT-X-TARGETDURATION'] || 0) + 1;
        continue;
      }
      for (const t of ['EXT-X-MEDIA-SEQUENCE', 'EXT-X-ENDLIST', 'EXT-X-PLAYLIST-TYPE', 'EXT-X-PART-INF', 'EXT-X-PART', 'EXT-X-SERVER-CONTROL', 'EXT-X-DISCONTINUITY-SEQUENCE', 'EXT-X-MAP']) {
        if (line.startsWith('#' + t)) { R.mediaPlaylistTags[t] = (R.mediaPlaylistTags[t] || 0) + 1; break; }
      }
      // GOLDEN RULE lado EXTVLCOPT / KODIPROP
      if (line.startsWith('#EXTVLCOPT') && /hvc1\./i.test(line)) { R.golden.hvc1InVlcopt++; pushLimited(R.golden.hvc1SideLines, `${R.lines}|${line.slice(0, 160)}`); }
      if (line.startsWith('#KODIPROP') && /hvc1\./i.test(line)) { R.golden.hvc1InKodiprop++; pushLimited(R.golden.hvc1SideLines, `${R.lines}|${line.slice(0, 160)}`); }
      continue;
    }

    /* ── línea URI ── */
    R.uriLines++;
    const key = line;
    const seen = seenUrl.get(key) || 0;
    seenUrl.set(key, seen + 1);
    if (seen === 1) { R.dupUrl.count++; pushLimited(R.dupUrl.samples, `${R.lines}|${maskUrl(line)}`); }

    if (cur) {
      cur.urls.push({ line: R.lines, url: line });
      if (cur.urls.length > 1) {
        R.multiUrl.channels++;
        pushLimited(R.multiUrl.samples, `${cur.line},${R.lines}|EXTINF+${cur.urls.length}URLs|${maskUrl(cur.urls[0].url)}`);
      }
      if (cur.urls.length > R.multiUrl.maxUrls) R.multiUrl.maxUrls = cur.urls.length;
    }
    prevUrlInChannel = true;
  }
  if (cur) flushChannel();
  R.tailLines = tail;

  function flushChannel() {
    R.channels++;
    if (R.channelSamples.length < 3) {
      R.channelSamples.push({
        extinfLine: cur.line,
        extinf: maskExtinf(cur.extinf),
        streamInf: cur.streamInf.map((s) => ({ line: s.line, text: s.lineText })),
        urls: cur.urls.map((u) => ({ line: u.line, url: maskUrl(u.url) })),
      });
    }
    cur = null;
  }

  R.tagCounts = Object.fromEntries(Object.entries(R.tagCounts).sort((a, b) => b[1] - a[1]));
  R.pairCount = Object.keys(R.pairs).length;
  return R;
}

function maskExtinf(line) {
  return line
    .replace(/tvg-logo="[^"]*"/g, 'tvg-logo="<URL>"')
    .replace(/(tvg-id|tvg-name|group-title)="([^"]{14,})"/g, (m, k) => `${k}="<LONG>"`);
}
function maskExthttp(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj)) {
    let s = String(v);
    if (k.toLowerCase() === 'user-agent') s = s.slice(0, 40) + '…';
    else if (/cookie|auth|token|key|secret/i.test(k)) s = '<REDACTED>';
    else if (/^https?:\/\//i.test(s)) s = maskUrl(s);
    else if (s.length > 60) s = s.slice(0, 60) + '…';
    o[k] = s;
  }
  return JSON.stringify(o);
}

function checkImpossible(R, line, res, codecs, raw) {
  const m = res.match(/^(\d+)x(\d+)$/);
  if (!m) return;
  const w = +m[1], h = +m[2];
  const fps = h >= 2160 ? 60 : h >= 1080 ? 60 : 30; // techo declarado por doctrina
  for (const t of codecTokens(codecs)) {
    let issue = null;
    const hevc = t.match(/^hvc1\.(\d)\.(\d)\.L(\d{2,3})/i) || t.match(/^hev1\.(\d)\.(\d)\.L(\d{2,3})/i);
    if (hevc) {
      const idc = +hevc[3];
      const need = hevcRequired(w, h, fps);
      if (idc < need) issue = `HEVC L${idc} < requerido L${need} para ${res}`;
    } else if (/^avc1\./i.test(t)) {
      const mm = t.match(/^avc1\.[0-9A-Fa-f]{4}([0-9A-Fa-f]{2})$/);
      if (mm) {
        const idc = parseInt(mm[1], 16);
        const need = avcRequired(w, h, fps);
        if (idc < need) issue = `AVC L${(idc / 10).toFixed(1)} < requerido L${(need / 10).toFixed(1)} para ${res}`;
      }
    } else if (/^av01\./i.test(t)) {
      const am = t.match(/^av01\.\d\.(\d{2})/);
      if (am) {
        const idx = +am[1];
        const need = av1RequiredIdx(w, h);
        if (idx < need) issue = `AV1 level_idx ${idx} (${av1MaxPixels(idx)} px max) < requerido idx ${need} para ${res}`;
      }
    }
    if (issue) {
      R.impossible.count++;
      if (R.impossible.samples.length < 8) {
        R.impossible.samples.push({ line, res, codec: t, issue, raw: raw.slice(0, 200) });
      }
      return;
    }
  }
}

/* ─────────────────────────── main ───────────────────────────────────────── */
(async () => {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : null;
  const files = argv.filter((a, i) => a !== '--out' && i !== outIdx + 1);
  const results = [];
  for (const f of files) {
    process.stderr.write(`[audit] ${path.basename(f)} … `);
    const t0 = Date.now();
    try {
      const r = await auditFile(f);
      r.elapsed_ms = Date.now() - t0;
      results.push(r);
      process.stderr.write(`${r.lines} lineas, ${r.channels} canales, ${r.impossible.count} imposibles (${r.elapsed_ms} ms)\n`);
    } catch (e) {
      results.push({ file: f, error: String(e && e.message) });
      process.stderr.write(`ERROR ${e && e.message}\n`);
    }
  }
  const report = { generated_at: new Date().toISOString(), tool: 'tools/lists_audit.js', files: results };
  const json = JSON.stringify(report, null, 1);
  if (out) fs.writeFileSync(out, json, 'utf8');
  console.log(JSON.stringify(summary(results), null, 1));
})();

function summary(results) {
  return results.map((r) => ({
    file: r.file,
    bytes: r.bytes,
    lines: r.lines,
    extm3u_line: r.extm3u && r.extm3u.line,
    extinf: r.extinf,
    uriLines: r.uriLines,
    channels_multiURL: r.multiUrl && r.multiUrl.channels,
    media_with_URI: r.media && r.media.withUri,
    iframe_with_URI: r.iframe && r.iframe.withUri,
    exthttp: r.exthttp && { n: r.exthttp.count, jsonFail: r.exthttp.jsonFail, toxic: r.exthttp.toxic, waf: r.exthttp.waf },
    golden: r.golden && { hev1_in_streaminf: r.golden.hev1InStreamInf, hvc1_in_vlcopt: r.golden.hvc1InVlcopt, hvc1_in_kodiprop: r.golden.hvc1InKodiprop, counts: r.golden.counts },
    streaminf: r.streamInf && { n: r.streamInf.count, noCodecs: r.streamInf.noCodecs, noRes: r.streamInf.noResolution, vrDup: r.streamInf.videoRangeDup },
    impossible: r.impossible && r.impossible.count,
    media_playlist_tags: r.mediaPlaylistTags,
    dup_urls: r.dupUrl && r.dupUrl.count,
    tvg_missing: r.tvg && { id: r.tvg.missingId, name: r.tvg.missingName, group: r.tvg.missingGroup, logo: r.tvg.missingLogo },
    pairs: r.pairCount,
  }));
}
