#!/usr/bin/env node
// t12 / t26 — ¿queda algún nivel imposible? Capacidad del nivel vs resolución@fps DECLARADA AL PLAYER.
// Usa los campos de emisión (X-Stream-Codecs / X-Stream-Resolution / X-Stream-FPS).
// Uso: node verify_levels.mjs [rutaJson] [rutaSalida]   — sin argumentos usa el lab_master del repo.
import fs from 'node:fs';
const DEFAULT_JSON = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json';
const P = process.argv[2] || DEFAULT_JSON;
const doc = JSON.parse(fs.readFileSync(P, 'utf8'));
const HEVC = { 90: [1, 30], 93: [2, 30], 120: [3, 30], 123: [3, 60], 150: [4, 30], 153: [4, 60], 156: [4, 120], 180: [5, 30], 183: [5, 60], 186: [5, 120] };
const AVC = { 30: [1, 30], 31: [2, 30], 40: [3, 30], 42: [3, 60] };
const RANK = { '854x480': 1, '640x360': 1, '1280x720': 2, '1920x1080': 3, '2560x1440': 3, '3840x2160': 4, '7680x4320': 5 };
const RANKNAME = { 1: '480p', 2: '720p', 3: '1080p', 4: '4K', 5: '8K' };
const cap = (codec) => {
  let m = String(codec).match(/^hvc1\.\d\.\d\.L(\d{2,3})\.B\d$/i);
  if (m) return { fam: 'HEVC', lvl: Number(m[1]), cap: HEVC[Number(m[1])] || null };
  m = String(codec).match(/^avc1\.([0-9a-f]{6})$/i);
  if (m) { const l = parseInt(m[1].slice(4, 6), 16); return { fam: 'AVC', lvl: l, cap: AVC[l] || null }; }
  if (/^dvh1\./i.test(codec)) return { fam: 'DV', lvl: null, cap: null };
  if (/^av01\./i.test(codec)) return { fam: 'AV1', lvl: null, cap: null };
  return { fam: '?', lvl: null, cap: null };
};
const rows = [];
let impossible = 0, unknown = 0;
for (const pk of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const p = doc.profiles_calibrated[pk];
  const codec = String(p.headerOverrides['X-Stream-Codecs'] || '').split(',')[0].trim();
  const res = p.headerOverrides['X-Stream-Resolution'];
  const fps = Number(p.headerOverrides['X-Stream-FPS']);
  const c = cap(codec);
  const rank = RANK[res] ?? null;
  let verdict, detail;
  if (!c.cap || rank === null) { verdict = 'UNKNOWN'; unknown++; detail = `sin modelo de capacidad para ${c.fam}`; }
  else {
    const [cr, cf] = c.cap;
    const ok = cr >= rank && cf >= fps;
    verdict = ok ? 'PASS' : 'FAIL';
    if (!ok) impossible++;
    detail = `${c.fam} L${c.lvl} → ${RANKNAME[cr]}@${cf} vs declarado ${RANKNAME[rank]}@${fps}`;
  }
  rows.push({ profile: pk, name: p.name, codec, resolution: res, fps, level: c.lvl, family: c.fam, capacity: c.cap ? { resRank: c.cap[0], fps: c.cap[1] } : null, verdict, detail, settings_fps: p.settings.fps });
}
const out = { file: P, bytes: fs.statSync(P).size, profiles: rows, impossible_count: impossible, unknown_count: unknown, verdict: impossible === 0 ? 'ZERO_IMPOSSIBLE_LEVELS' : 'IMPOSSIBLE_LEVELS_PRESENT' };
console.log(JSON.stringify(out, null, 2));
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
process.exit(impossible === 0 ? 0 : 1);
