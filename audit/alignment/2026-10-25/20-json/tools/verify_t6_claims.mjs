#!/usr/bin/env node
// Verifies the 4 anomalies reported by the APP lane (t6) against lab_master.
// Read-only. Prints exact JSON paths + transcribed values.
import fs from 'node:fs';
const P = process.argv[2];
const raw = fs.readFileSync(P);
const doc = JSON.parse(raw.toString('utf8'));
const sha = process.env.SHA256 || '(see shell)';
const stat = fs.statSync(P);
const PK = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const MAN = { P0: [7680, 120, 'dvh1.08.06'], P1: [7680, 120, 'av01.0.15M.10'], P2: [3840, 60, 'hvc1.2.4.L153.B0'], P3: [1920, 60, 'hvc1.2.4.L123.B0'], P4: [1280, 30, 'hvc1.2.4.L93.B0'], P5: [854, 30, 'avc1.42c01e'] };

console.log('FILE', P);
console.log('bytes', stat.size, '| mtime', stat.mtime.toISOString(), '| sha256', sha);
console.log('newlines', (raw.toString('utf8').match(/\n/g) || []).length);

console.log('\n### Q1 — P1 codec level vs resolution: every node that declares a video codec');
const codecPaths = [
  ['settings.codec', (p) => p.settings.codec],
  ['settings.codec_full', (p) => p.settings.codec_full],
  ['settings.codec_string', (p) => p.settings.codec_string],
  ['settings.codec_priority', (p) => p.settings.codec_priority],
  ['settings.codec_chain_video', (p) => p.settings.codec_chain_video],
  ['settings.codec_primary', (p) => p.settings.codec_primary],
  ['headerOverrides.X-APE-CODEC', (p) => p.headerOverrides['X-APE-CODEC']],
  ['headerOverrides.X-Codec-Support', (p) => p.headerOverrides['X-Codec-Support']],
  ['headerOverrides.X-Stream-Codecs', (p) => p.headerOverrides['X-Stream-Codecs']],
  ['headerOverrides.X-HEVC-Level', (p) => p.headerOverrides['X-HEVC-Level']],
  ['headerOverrides.X-Video-Codecs', (p) => p.headerOverrides['X-Video-Codecs']],
  ['vlcopt.codec-priority', (p) => p.vlcopt['codec-priority']],
  ['prisma_lab_sync_v20.codec_ladder_per_profile.video', null],
];
for (const pk of ['P1']) {
  const pr = doc.profiles_calibrated[pk];
  console.log(`-- ${pk} ("${pr.name}")`);
  for (const [name, fn] of codecPaths) {
    const v = fn ? fn(pr) : doc.prisma_lab_sync_v20.codec_ladder_per_profile[pk].video;
    console.log(`   ${name} = ${JSON.stringify(v)}`);
  }
  console.log('   settings.resolution =', JSON.stringify(pr.settings.resolution));
  console.log('   settings.maxResolution =', JSON.stringify(pr.settings.maxResolution));
  console.log('   settings.fps =', JSON.stringify(pr.settings.fps));
  console.log('   settings.targetFps =', JSON.stringify(pr.settings.targetFps));
  console.log('   headerOverrides.X-Stream-Resolution =', JSON.stringify(pr.headerOverrides['X-Stream-Resolution']));
  console.log('   headerOverrides.X-Stream-FPS =', JSON.stringify(pr.headerOverrides['X-Stream-FPS']));
  console.log('   headerOverrides.X-APE-RESOLUTION =', JSON.stringify(pr.headerOverrides['X-APE-RESOLUTION']));
  console.log('   headerOverrides.X-APE-FPS =', JSON.stringify(pr.headerOverrides['X-APE-FPS']));
  console.log('   kodiprop max_resolution =', JSON.stringify(pr.kodiprop['inputstream.adaptive.max_resolution']));
  console.log('   vlcopt video-width/height =', JSON.stringify(`${pr.vlcopt['video-width']}x${pr.vlcopt['video-height']}`));
}

console.log('\n### Q1b — does P1 contain any 8K@120-capable HEVC level (L186) anywhere?');
const p1keys = [];
const walkStr = (n, p) => {
  if (n === null) return;
  if (typeof n === 'string') { if (/L186|L183|L180/.test(n)) p1keys.push([p, n.length > 140 ? n.slice(0, 140) + '…' : n]); return; }
  if (Array.isArray(n)) { n.forEach((v, i) => walkStr(v, `${p}[${i}]`)); return; }
  if (typeof n === 'object') { for (const [k, v] of Object.entries(n)) walkStr(v, p ? `${p}.${k}` : k); }
};
walkStr(doc.profiles_calibrated.P1, 'profiles_calibrated.P1');
console.log('   nodes mentioning L186/L183/L180 in P1:', p1keys.length);
for (const [p, v] of p1keys.slice(0, 10)) console.log('    ', p, '=', JSON.stringify(v));

console.log('\n### Q2 — fps fields per profile vs manifest');
for (const pk of PK) {
  const pr = doc.profiles_calibrated[pk];
  console.log(`${pk} | settings.fps=${JSON.stringify(pr.settings.fps)} targetFps=${JSON.stringify(pr.settings.targetFps)} target_framerate=${JSON.stringify(pr.settings.target_framerate)} X-Stream-FPS=${JSON.stringify(pr.headerOverrides['X-Stream-FPS'])} X-APE-FPS=${JSON.stringify(pr.headerOverrides['X-APE-FPS'])} X-Max-Framerate=${JSON.stringify(pr.headerOverrides['X-Max-Framerate'])} | manifest fps=${MAN[pk][1]}`);
}

console.log('\n### Q3 — name vs resolution pairs');
for (const pk of PK) {
  const pr = doc.profiles_calibrated[pk];
  console.log(`${pk} | name=${JSON.stringify(pr.name)} | settings.resolution=${JSON.stringify(pr.settings.resolution)} | maxResolution=${JSON.stringify(pr.settings.maxResolution)} | X-Stream-Resolution=${JSON.stringify(pr.headerOverrides['X-Stream-Resolution'])} | X-Max-Resolution=${JSON.stringify(pr.headerOverrides['X-Max-Resolution'])} | kodiprop=${JSON.stringify(pr.kodiprop['inputstream.adaptive.max_resolution'])} | vlcopt=${JSON.stringify(pr.vlcopt['video-width'] + 'x' + pr.vlcopt['video-height'])}`);
}

console.log('\n### Q4 — numeric-looking strings / Excel float artifacts across the whole document');
const weird = [];
const walkWeird = (n, p) => {
  if (n === null) return;
  if (typeof n === 'number') {
    if (!Number.isInteger(n) && p.includes('chroma')) weird.push([p, n, 'number']);
    return;
  }
  if (typeof n === 'string') {
    if (/^\d{12,}$/.test(n) || /^\d+\.\d{6,}$/.test(n) || /e[-+]\d{2,}$/i.test(n) || /^\d{3,}(\.\d+)?$/.test(n) && /chroma|bit_depth|pixel|ratio/i.test(p)) weird.push([p, n, 'string']);
    return;
  }
  if (Array.isArray(n)) { n.forEach((v, i) => walkWeird(v, `${p}[${i}]`)); return; }
  if (typeof n === 'object') { for (const [k, v] of Object.entries(n)) walkWeird(v, p ? `${p}.${k}` : k); }
};
walkWeird(doc, '');
console.log('   candidates:', weird.length);
for (const [p, v, t] of weird.slice(0, 40)) console.log(`    ${p} = ${JSON.stringify(v)} (${t})`);
