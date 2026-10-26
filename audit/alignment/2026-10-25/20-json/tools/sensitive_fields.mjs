#!/usr/bin/env node
// Targeted, streaming check of security-relevant fields in frontend/channels_map.json.
// Counts non-empty values and value SHAPES only (never prints a full secret).
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
const file = process.argv[2];
const FIELDS = ['cookie', 'referer', 'origin', 'x_forwarded_for', 'custom_header_1', 'custom_header_2', 'custom_header_3', 'drm_server_url', 'drm_type', 'token_auth_enabled', 'server', 'username', 'password', 'url_m3u8', 'url_ts', 'stream_inf_enabled', 'exthttp_enabled'];
const stats = Object.fromEntries(FIELDS.map((f) => [f, { present: 0, nonempty: 0, types: {}, distinct_sample: new Set(), shapes: {} }]));
const fd = fs.openSync(file, 'r');
const CHUNK = 8 * 1024 * 1024, buf = Buffer.alloc(CHUNK), dec = new StringDecoder('utf8');
let depth = 0, inStr = false, esc = false, keyBuf = '', stage = 'seek', curKey = null, recBuf = '', recDepth = 0;
const shape = (v) => {
  if (v === '') return 'empty';
  if (/^https?:\/\//i.test(v)) return 'url(scheme)';
  if (/^\d+$/.test(v)) return 'numeric-string';
  if (v.length <= 3) return `short(${v.length})`;
  return `text(${v.length})`;
};
function finish() {
  let rec;
  try { rec = JSON.parse(recBuf); } catch { recBuf = ''; return; }
  for (const f of FIELDS) {
    if (!(f in rec)) continue;
    const s = stats[f];
    s.present++;
    const v = rec[f];
    const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    s.types[t] = (s.types[t] || 0) + 1;
    if (typeof v !== 'string' || v === '') continue;
    s.nonempty++;
    if (s.distinct_sample.size < 8) {
      // store shape only; for server keep host (hosts are not secrets)
      if (f === 'server' || f === 'drm_server_url') s.distinct_sample.add(v.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, ''));
      else s.distinct_sample.add(shape(v));
    }
    const sh = shape(v); s.shapes[sh] = (s.shapes[sh] || 0) + 1;
  }
  recBuf = '';
}
function feed(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; if (stage === 'key') keyBuf += c; else if (stage === 'record') recBuf += c; continue; }
      if (c === '\\') { esc = true; if (stage === 'key') keyBuf += c; else if (stage === 'record') recBuf += c; continue; }
      if (c === '"') { inStr = false; if (stage === 'key') { curKey = keyBuf; keyBuf = ''; stage = 'afterKey'; } else if (stage === 'record') recBuf += c; continue; }
      if (stage === 'key') keyBuf += c; else if (stage === 'record') recBuf += c;
      continue;
    }
    if (depth === 0) { if (c === '{') depth = 1; continue; }
    if (stage === 'record') {
      recBuf += c;
      if (c === '{' || c === '[') recDepth++;
      else if (c === '}') { recDepth--; if (recDepth === 0) { finish(); stage = 'afterRecord'; depth = 1; } }
      else if (c === ']') recDepth--;
      continue;
    }
    if (c === '"') { inStr = true; if (stage === 'seek' || stage === 'afterRecord') { stage = 'key'; keyBuf = ''; } continue; }
    if (c === '{') { if (depth === 1) { depth = 2; stage = 'record'; recBuf = '{'; recDepth = 1; } else depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (c === '[') { depth++; continue; }
    if (c === ']') { depth--; continue; }
  }
}
let n;
while ((n = fs.readSync(fd, buf, 0, CHUNK)) > 0) feed(dec.write(buf.subarray(0, n)));
feed(dec.end());
fs.closeSync(fd);
const out = {};
for (const [k, v] of Object.entries(stats)) out[k] = { present: v.present, nonempty: v.nonempty, types: v.types, sample_shapes_or_hosts: [...v.distinct_sample], shapes: v.shapes };
console.log(JSON.stringify(out, null, 2));
