#!/usr/bin/env node
// Streaming, chunked analyzer for channels_map.json (73 MB / 28 MB).
// NEVER loads the whole file, NEVER prints channel records or secret values.
// Usage: node scan_channels_map.mjs <path> <label> <outJson>
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const [file, label, outJson, idsOut] = process.argv.slice(2);
if (!file) { console.error('usage: node scan_channels_map.mjs <path> <label> <outJson>'); process.exit(2); }

const SECRET_KEY_RE = /^(password|pass|passwd|token|secret|api_key|apikey|username|user|auth|authorization|credential|credentials|cookie|key)$/i;
const SIGNED_PARAMS = ['token', 'expires', 'signature', 'sig', 'hdnts', 'hmac', 'auth', 'auth_key', 'md5', 'st', 'e'];
const URL_WITH_CREDS_RE = /[a-z]+:\/\/[^\/"\s]+:[^\/"\s]+@/i; // scheme://user:pass@
const TOKENISH_RE = /\b(?:hdnts|X-Amz-Signature|Signature|token|expires|sig|auth_key|st)=/i;

const stats = {
  label, file, bytes: 0,
  top_level_type: null,
  record_count: 0,
  duplicate_keys: [],
  duplicate_key_count: 0,
  key_length_min: null, key_length_max: null,
  key_charset: { numeric_only: 0, has_underscore: 0, other: 0 },
  first_keys: [], last_key: null,
  field_presence: {},           // field -> count of records containing it
  field_value_summary: {},      // field -> {value: count} for chosen low-cardinality fields
  nested_object_fields: {},     // field -> count (value was an object/array)
  record_size: { min: null, max: 0, sum: 0 },
  secret_key_hits: {},          // key -> count  (names only, NO values)
  crosstab: {},                 // "profile|resolution|codec|hdr" -> count
  records_with_url_userinfo: 0,
  signed_url_param_hits: {},    // param name -> count
  tokenish_value_records: 0,
  parse_errors: 0,
  depth_max: 0,
  trailing_bytes_checked: 0,
  unterminated: false,
};

const VALUE_FIELDS = new Set([
  'profile', 'resolution', 'quality_level', 'codec_rfc6381', 'codec', 'hdr_profile',
  'dolby_vision_profile', 'lcevc_state', 'lcevc_base_codec', 'color_primaries',
  'transfer_characteristics', 'group', 'server', 'cmaf_profile', 'cmaf_delivery_mode',
]);
const SKIP_VALUE_FIELDS = new Set(['group', 'server']); // too high cardinality / sensitive

const fd = fs.openSync(file, 'r');
const CHUNK = 8 * 1024 * 1024;
const buf = Buffer.alloc(CHUNK);
const dec = new StringDecoder('utf8');

let depth = 0;
let inStr = false, esc = false;
let keyBuf = '';
let readingKey = false;
let stage = 'seek';           // seek -> key -> afterColon -> record
let curKey = null;
let recBuf = '';
let recDepth = 0;
let seen = new Set();
const sidSet = new Set(), tvgSet = new Set(), hostSet = new Set();
let pendingDup = new Set();

function addPresence(f) { stats.field_presence[f] = (stats.field_presence[f] || 0) + 1; }
function addValue(f, v) {
  if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return;
  const s = String(v);
  if (s.length > 64) return;
  const bucket = (stats.field_value_summary[f] ||= {});
  bucket[s] = (bucket[s] || 0) + 1;
}

function finishRecord() {
  stats.record_count++;
  const size = recBuf.length;
  if (stats.record_size.min === null || size < stats.record_size.min) stats.record_size.min = size;
  if (size > stats.record_size.max) stats.record_size.max = size;
  stats.record_size.sum += size;

  let rec = null;
  try { rec = JSON.parse(recBuf); } catch (_) { stats.parse_errors++; }

  if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
    for (const k of Object.keys(rec)) {
      addPresence(k);
      if (rec[k] !== null && typeof rec[k] === 'object') {
        stats.nested_object_fields[k] = (stats.nested_object_fields[k] || 0) + 1;
      }
      if (SECRET_KEY_RE.test(k) && typeof rec[k] === 'string' && rec[k].length > 0) {
        stats.secret_key_hits[k] = (stats.secret_key_hits[k] || 0) + 1;
      }
      if (VALUE_FIELDS.has(k) && !SKIP_VALUE_FIELDS.has(k)) addValue(k, rec[k]);
    }
    // URL credential inspection (values never emitted)
    let hasUserinfo = false, tokenish = false;
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      if (typeof v !== 'string') continue;
      if (/^[a-z]+:\/\//i.test(v)) {
        if (URL_WITH_CREDS_RE.test(v)) hasUserinfo = true;
        const q = v.indexOf('?');
        if (q > -1) {
          const qs = v.slice(q + 1);
          for (const part of qs.split('&')) {
            const name = part.split('=')[0];
            if (SIGNED_PARAMS.includes(name.toLowerCase())) {
              stats.signed_url_param_hits[name.toLowerCase()] = (stats.signed_url_param_hits[name.toLowerCase()] || 0) + 1;
            }
          }
        }
        if (TOKENISH_RE.test(v)) tokenish = true;
      }
    }
    if (hasUserinfo) stats.records_with_url_userinfo++;
    if (tokenish) stats.tokenish_value_records++;
    const ct = [rec.profile ?? rec.ape_profile ?? '-', rec.resolution ?? '-', rec.codec_rfc6381 ?? rec.codec ?? '-', rec.hdr_profile ?? '-'].join('|');
    stats.crosstab[ct] = (stats.crosstab[ct] || 0) + 1;
    if (rec.stream_id !== undefined) sidSet.add(String(rec.stream_id));
    if (rec.tvg_id !== undefined) tvgSet.add(String(rec.tvg_id));
    if (rec.server !== undefined) hostSet.add(String(rec.server).replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, ''));
  }
  recBuf = '';
}

function handleKey(key) {
  const klen = key.length;
  if (stats.key_length_min === null || klen < stats.key_length_min) stats.key_length_min = klen;
  if (klen > stats.key_length_max) stats.key_length_max = klen;
  if (/^\d+$/.test(key)) stats.key_charset.numeric_only++;
  else if (/_/.test(key)) stats.key_charset.has_underscore++;
  else stats.key_charset.other++;

  if (seen.has(key)) { if (stats.duplicate_keys.length < 50) stats.duplicate_keys.push(key); stats.duplicate_key_count++; }
  else {
    seen.add(key);
    if (stats.first_keys.length < 5) stats.first_keys.push(key);
    stats.last_key = key;
  }
  curKey = key;
}

function processText(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; if (stage === 'key') keyBuf += c; else if (stage === 'record') recBuf += c; continue; }
      if (c === '\\') { esc = true; if (stage === 'key') keyBuf += c; else if (stage === 'record') recBuf += c; continue; }
      if (c === '"') {
        inStr = false;
        if (stage === 'key') { handleKey(keyBuf); keyBuf = ''; stage = 'afterKey'; }
        else if (stage === 'record') { recBuf += c; }
        continue;
      }
      if (stage === 'key') keyBuf += c; else if (stage === 'record') recBuf += c;
      continue;
    }
    // not in string
    if (depth === 0) {
      if (c === '{') { depth = 1; stats.top_level_type = stats.top_level_type || 'object'; }
      else if (c === '[') { depth = 1; stats.top_level_type = stats.top_level_type || 'array'; }
      continue;
    }
    if (stage === 'record') {
      recBuf += c;
      if (c === '{' || c === '[') { recDepth++; if (recDepth + depth > stats.depth_max) stats.depth_max = recDepth + depth; }
      else if (c === '}') {
        recDepth--;
        if (recDepth === 0) {
          // this brace closes the record value AND returns us to the top-level object
          finishRecord();
          stage = 'afterRecord';
          depth = 1;
        }
      } else if (c === ']') { recDepth--; }
      continue;
    }
    if (c === '"') { inStr = true; if (stage === 'seek' || stage === 'afterRecord') { stage = 'key'; keyBuf = ''; } continue; }
    if (c === '{') {
      if (depth === 1) { depth = 2; stage = 'record'; recBuf = '{'; recDepth = 1; }
      else depth++;
      continue;
    }
    if (c === '}') { depth--; continue; }
    if (c === '[') { depth++; continue; }
    if (c === ']') { depth--; continue; }
    // ignore : , whitespace
  }
}

let read;
while ((read = fs.readSync(fd, buf, 0, CHUNK)) > 0) {
  stats.bytes += read;
  processText(dec.write(buf.subarray(0, read)));
}
processText(dec.end());
fs.closeSync(fd);

if (inStr) stats.unterminated = true;
stats.duplicate_keys = stats.duplicate_keys.slice(0, 50);
stats.field_presence_sorted = Object.entries(stats.field_presence).sort((a, b) => b[1] - a[1]);
delete stats.field_presence;
stats.avg_record_size = stats.record_count ? Math.round(stats.record_size.sum / stats.record_count) : 0;
delete stats.record_size.sum;
stats.distinct_keys = seen.size;

const json = JSON.stringify(stats, null, 2);
if (outJson) fs.writeFileSync(outJson, json);
else console.log(json);

if (idsOut) {
  fs.writeFileSync(idsOut, JSON.stringify({
    label,
    record_count: stats.record_count,
    top_keys: [...seen].sort(),
    stream_ids: [...sidSet].sort(),
    tvg_ids: [...tvgSet].sort(),
    hosts: [...hostSet].sort(),
  }, null, 2));
}
