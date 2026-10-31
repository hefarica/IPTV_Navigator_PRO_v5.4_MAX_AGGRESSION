#!/usr/bin/env node
'use strict';
/**
 * R1 · Per-channel fingerprint for structural comparison of two APE catalogues.
 * Emits JSONL: one record per channel, no credentials (URL reduced to sha256 + host).
 *
 * Usage: node r1_fingerprint.js <playlist> <out.jsonl>
 */
const fs = require('node:fs');
const readline = require('node:readline');
const crypto = require('node:crypto');

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function attrList(s, sep = ',') {
  const out = Object.create(null);
  let i = 0; const n = s.length;
  while (i < n) {
    while (i < n && (s[i] === sep || s[i] === ' ')) i++;
    if (i >= n) break;
    const eq = s.indexOf('=', i);
    if (eq === -1) break;
    const key = s.slice(i, eq).trim();
    i = eq + 1;
    let val = '';
    if (s[i] === '"') {
      i++; let j = i;
      while (j < n) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '"') break; j++; }
      val = s.slice(i, j); i = j + 1;
      while (i < n && s[i] !== sep) i++;
    } else {
      let j = i;
      while (j < n && s[j] !== sep) j++;
      val = s.slice(i, j).trim(); i = j;
    }
    out[key] = val;
  }
  return out;
}
const hostOf = (u) => { const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(u); return m ? m[2].toLowerCase() : '(none)'; };

async function main() {
  const [path, out] = process.argv.slice(2);
  if (!path || !out) { console.error('usage: r1_fingerprint.js <playlist> <out.jsonl>'); process.exit(2); }
  const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  const fd = fs.openSync(out, 'w');
  let cur = null, idx = -1, pendingSi = null, linesInFile = 0;
  let written = 0;

  const flush = () => {
    if (!cur) return;
    fs.writeSync(fd, JSON.stringify(cur) + '\n');
    written++; cur = null;
  };

  for await (const raw of rl) {
    linesInFile++;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('#EXTINF:')) {
      flush(); idx++;
      const s = line.slice(8);
      const sp = s.indexOf(' ');
      const al = attrList(sp === -1 ? '' : s.slice(sp + 1), ' ');
      cur = {
        i: idx, ln: linesInFile, lines: 0, bytes: 0,
        id: al['tvg-id'] || null, name: al['tvg-name'] || null, group: al['group-title'] || null,
        profile: al['ape-profile'] || null, cfam: al['ape-codec-family'] || null, fps: al['ape-fps'] || null,
        country: al['ape-country'] || null, conf: al['ape-classify-confidence'] || null,
        urls: 0, si: 0, bw: null, res: null, codecs: null, fr: null, hdcp: null, vr: null, sup: null,
        sf: 0, xres: null, xcodec: null, xrange: null, hdrs: 0, url: null, host: null, scheme: null,
      };
      continue;
    }
    if (!cur) continue;
    cur.lines++;
    cur.bytes += Buffer.byteLength(line, 'utf8') + 1;
    if (line === '') continue;
    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        cur.si++;
        const al = attrList(line.slice(18));
        cur.bw = al.BANDWIDTH || cur.bw; cur.res = al.RESOLUTION || cur.res;
        cur.codecs = al.CODECS || cur.codecs; cur.fr = al['FRAME-RATE'] || cur.fr;
        cur.hdcp = al['HDCP-LEVEL'] || cur.hdcp; cur.vr = al['VIDEO-RANGE'] || cur.vr;
        cur.sup = al['SUPPLEMENTAL-CODECS'] || cur.sup;
      } else if (line.startsWith('#EXT-X-APE-8KFAKE')) { cur.sf++; }
      else if (line.startsWith('#EXTHTTP:')) {
        const m1 = /"X-Resolution":"([^"]*)"/.exec(line); if (m1) cur.xres = m1[1];
        const m2 = /"X-Codec-Full":"([^"]*)"/.exec(line); if (m2) cur.xcodec = m2[1];
        const m3 = /"X-Video-Range":"([^"]*)"/.exec(line); if (m3) cur.xrange = m3[1];
        try { cur.hdrs = Object.keys(JSON.parse(line.slice(9))).length; } catch { cur.hdrs = -1; }
      }
      continue;
    }
    cur.urls++;
    const h = sha(line);
    cur.url = h.slice(0, 16);
    cur.host = hostOf(line);
    cur.scheme = (/^([a-z][a-z0-9+.-]*):/i.exec(line) || [, '(none)'])[1].toLowerCase();
  }
  flush();
  fs.closeSync(fd);
  console.log(`wrote ${out}: channels=${written} file_lines=${linesInFile}`);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
