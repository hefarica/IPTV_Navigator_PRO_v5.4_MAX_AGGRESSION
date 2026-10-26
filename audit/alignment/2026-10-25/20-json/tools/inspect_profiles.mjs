#!/usr/bin/env node
// Structure inspector for lab_master_22.6.0.json + APE_ALL_PROFILES_* + visual_profiles.
// Read-only. Prints keys and small scalar values only; never prints credentials.
import fs from 'node:fs';

const path = process.argv[2];
const raw = fs.readFileSync(path);
const doc = JSON.parse(raw.toString('utf8'));

const out = { path, bytes: raw.length, top_keys: Object.keys(doc) };
const MASK_RE = /(password|passwd|pass|token|secret|apikey|api_key|username|user|authorization|cookie)/i;
function mask(k, v) {
  if (typeof v === 'string' && MASK_RE.test(k) && v.length > 0) return `«masked:${v.length}ch»`;
  return v;
}
function describe(node, depth = 0, maxDepth = 2, prefix = '') {
  const lines = [];
  if (node === null || typeof node !== 'object') return [`${prefix}${JSON.stringify(mask(prefix, node))}`];
  if (Array.isArray(node)) {
    lines.push(`${prefix}[array len=${node.length}]`);
    if (depth < maxDepth) {
      const sample = node.slice(0, 3);
      sample.forEach((el, i) => lines.push(...describe(el, depth + 1, maxDepth, `${prefix}  [${i}] `)));
    }
    return lines;
  }
  const keys = Object.keys(node);
  lines.push(`${prefix}{object keys=${keys.length}}`);
  if (depth < maxDepth) {
    for (const k of keys) {
      const v = node[k];
      if (v !== null && typeof v === 'object') {
        lines.push(...describe(v, depth + 1, maxDepth, `${prefix}  ${k}: `));
      } else {
        const sv = typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : v;
        lines.push(`${prefix}  ${k} = ${JSON.stringify(mask(k, sv))}`);
      }
    }
  } else {
    lines.push(`${prefix}  keys: ${keys.slice(0, 60).join(', ')}${keys.length > 60 ? ' …' : ''}`);
  }
  return lines;
}

const report = { path, bytes: raw.length, top_keys: out.top_keys, sections: {} };

// Profiles-focused extraction (any object that looks like P0..P5 holder)
const PROFILE_KEYS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const SCALAR_HINT = /codec|resol|width|height|fps|frame|level|bandwidth|bitrate|mime|profile|hdr|range|tier|name|id$|^id/i;

function grabProfiles(obj) {
  const res = {};
  for (const pk of PROFILE_KEYS) {
    if (!obj || !(pk in obj)) continue;
    const p = obj[pk];
    const entry = { type: Array.isArray(p) ? `array(${p.length})` : typeof p, keys: p && typeof p === 'object' ? Object.keys(p) : null, scalars: {}, nested_counts: {} };
    if (p && typeof p === 'object') {
      for (const [k, v] of Object.entries(p)) {
        if (v !== null && typeof v === 'object') {
          entry.nested_counts[k] = Array.isArray(v) ? `array(${v.length})` : `object(${Object.keys(v).length})`;
          // for object-of-scalars (settings), expose scalars that matter
          if (!Array.isArray(v)) {
            for (const [k2, v2] of Object.entries(v)) {
              if (SCALAR_HINT.test(k2) && (typeof v2 === 'string' || typeof v2 === 'number' || typeof v2 === 'boolean')) {
                entry.scalars[`${k}.${k2}`] = typeof v2 === 'string' && v2.length > 120 ? v2.slice(0, 120) + '…' : mask(k2, v2);
              }
            }
          }
        } else {
          entry.scalars[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : mask(k, v);
        }
      }
    }
    res[pk] = entry;
  }
  return res;
}

for (const k of out.top_keys) {
  const v = doc[k];
  if (v === null || typeof v !== 'object') {
    report.sections[k] = { type: typeof v, value: typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : mask(k, v) };
    continue;
  }
  const keys = Object.keys(v);
  const sec = { type: Array.isArray(v) ? `array(${v.length})` : `object(${keys.length})`, sample_keys: keys.slice(0, 40) };
  if (keys.some((x) => PROFILE_KEYS.includes(x))) sec.profiles = grabProfiles(v);
  // shallow type map
  sec.shallow = {};
  for (const kk of keys.slice(0, 80)) {
    const vv = v[kk];
    sec.shallow[kk] = Array.isArray(vv) ? `array(${vv.length})` : vv === null ? 'null' : typeof vv === 'object' ? `object(${Object.keys(vv).length})` : typeof vv === 'string' && vv.length > 90 ? vv.slice(0, 90) + '…' : mask(kk, vv);
  }
  report.sections[k] = sec;
}

if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
else console.log(JSON.stringify(report, null, 2));

if (!process.argv[3]) console.log('\n/* generic describe */\n' + describe(doc, 0, 1).slice(0, 40).join('\n'));
