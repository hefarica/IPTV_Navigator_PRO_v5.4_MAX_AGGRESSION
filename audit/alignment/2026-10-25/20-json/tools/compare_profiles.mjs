#!/usr/bin/env node
// Consolidated per-profile comparator across BALANCED-NAME sources.
// Usage: node compare_profiles.mjs out.json <label=path> ...
import fs from 'node:fs';
const [outPath, ...pairs] = process.argv.slice(2);
const WANT = [
  ['name', (p) => p?.name],
  ['resolution', (p) => p?.settings?.resolution],
  ['maxResolution', (p) => p?.settings?.maxResolution],
  ['fps', (p) => p?.settings?.fps],
  ['codec_full', (p) => p?.settings?.codec_full],
  ['codec_string', (p) => p?.settings?.codec_string],
  ['bitrateMbps', (p) => p?.settings?.bitrate],
  ['maxBitrateKbps', (p) => p?.settings?.maxBitrateKbps],
  ['avgBitrateKbps', (p) => p?.settings?.avgBitrateKbps],
  ['X-APE-CODEC', (p) => p?.headerOverrides?.['X-APE-CODEC']],
  ['X-Stream-Codecs', (p) => p?.headerOverrides?.['X-Stream-Codecs']],
  ['X-Stream-Resolution', (p) => p?.headerOverrides?.['X-Stream-Resolution']],
  ['X-Stream-FPS', (p) => p?.headerOverrides?.['X-Stream-FPS']],
  ['X-APE-RESOLUTION', (p) => p?.headerOverrides?.['X-APE-RESOLUTION']],
  ['X-Max-Resolution', (p) => p?.headerOverrides?.['X-Max-Resolution']],
  ['X-HDCP-Level', (p) => p?.headerOverrides?.['X-HDCP-Level']],
  ['X-Profile-Tier', (p) => p?.headerOverrides?.['X-Profile-Tier']],
  ['kodiprop.max_resolution', (p) => p?.kodiprop?.['inputstream.adaptive.max_resolution']],
  ['vlcopt.w/h', (p) => `${p?.vlcopt?.['video-width']}x${p?.vlcopt?.['video-height']}`],
  ['vlcopt.video-fps', (p) => p?.vlcopt?.['video-fps']],
  ['count.headerOverrides', (p) => (p?.headerOverrides ? Object.keys(p.headerOverrides).length : undefined)],
  ['count.settings', (p) => (p?.settings ? Object.keys(p.settings).length : undefined)],
  ['claim.headersCount', (p) => p?.settings?.headersCount],
  ['role', (p) => p?.role],
];

const report = { sources: {}, keys: WANT.map((w) => w[0]) };
for (const pair of pairs) {
  const i = pair.indexOf('=');
  const label = pair.slice(0, i), path = pair.slice(i + 1);
  const st = fs.statSync(path);
  const raw = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const doc = JSON.parse(raw);
  const src = { path, bytes: st.size, mtime: st.mtime.toISOString(), bom: /^\uFEFF/.test(fs.readFileSync(path, 'utf8')) ? true : false, holder: doc.profiles_calibrated ? 'profiles_calibrated' : (doc.profiles ? 'profiles' : 'NONE'), top_keys: Object.keys(doc), profiles: {} };
  const holder = doc.profiles_calibrated || doc.profiles || null;
  if (holder) {
    for (const pk of Object.keys(holder)) {
      const p = holder[pk];
      if (!p || typeof p !== 'object') continue;
      const e = {};
      for (const [k, fn] of WANT) { try { e[k] = fn(p); } catch { e[k] = undefined; } }
      src.profiles[pk] = e;
    }
  }
  if (doc.codec_ladder_per_profile) src.codec_ladder_per_profile = doc.codec_ladder_per_profile;
  if (doc.prisma_lab_sync_v20?.codec_ladder_per_profile) src.codec_ladder_per_profile = doc.prisma_lab_sync_v20.codec_ladder_per_profile;
  report.sources[label] = src;
}
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('written', outPath, fs.statSync(outPath).size);
