/** Legacy 14-GAP check de la skill iptv-m3u8-auditor (semántica `in content`, streaming). */
'use strict';
const fs = require('fs');
const readline = require('readline');

const gaps = {
  'GAP 1 — Dynamic Range Classifier': { w: 8, checks: [['colorspace=all=auto','Auto-detect SDR/HDR/HLG'],['tonemap=mobius','Tone mapping adaptativo'],['trc=auto','Transfer curve auto-detect'],['zscale=transfer=st2084','Conversion HDR']] },
  'GAP 2 — Space Validator': { w: 7, checks: [['format=yuv444p','4:4:4'],['range=limited','Range fallback'],['chromal=topleft','Chroma siting'],['deband','Banding control']] },
  'GAP 3 — Bitrate Anarchy Protocol': { w: 9, checks: [['ANTI-CUT-ISP-STRANGLE','ISP throttle adaptive'],['bandwidth_ramp=true','Bandwidth ramp'],['bandwidth_ramp_peak=100000000','Peak 100Mbps'],['OMEGA-ENGINE-BANDWIDTH-MONITOR','BW monitor']] },
  'GAP 4 — Hardware Agent Spoofing': { w: 7, checks: [['X-Device-Class','Device class'],['X-Decoding-Capability','Decoding capability'],['SHIELD-TV-PRO','Shield spoof'],['AppleTV14,1','Apple TV spoof']] },
  'GAP 5 — Quantum Pixel Overdrive': { w: 7, checks: [['yuv444p10le','10-bit 4:4:4'],['yuv444p','4:4:4'],['saturation','Saturación'],['QUANTUM-PIXEL','Quantum Pixel']] },
  'GAP 6 — Luma Precision Engine': { w: 8, checks: [['unsharp=luma','Luma sharpening'],['hqdn3d','Denoise'],['nlmeans','NL-means'],['LUMA-GAMMA','Gamma']] },
  'GAP 7 — Network Buffer God Tier': { w: 9, checks: [['network-caching','VLC cache'],['BUFFER-STRATEGY:ADAPTIVE_PREDICTIVE_NEURAL','Buffer neural'],['BUFFER-PRELOAD-SEGMENTS:30','Preload 30'],['BUFFER-DYNAMIC-ADJUSTMENT:ENABLED','Ajuste dinámico']] },
  'GAP 8 — Codec Priority Enforcer': { w: 8, checks: [['preferred_codec=hevc','HEVC preferido'],['video_codec_override=hevc','Override'],['AV1-FALLBACK-CHAIN','AV1 chain'],['CODEC-PRIORITY','Priority']] },
  'GAP 9 — fMP4/CMAF Pipeline': { w: 8, checks: [['TRANSPORT-PROTOCOL:CMAF_UNIVERSAL','CMAF universal'],['TRANSPORT-CHUNK-SIZE:200MS','Chunk 200ms'],['TRANSPORT-FALLBACK-1:HLS_FMP4','Fallback fMP4'],['EXT-X-SERVER-CONTROL','LL-HLS control']] },
  'GAP 10 — VRR/Refresh Sync': { w: 7, checks: [['vrr_sync','VRR sync'],['tunneling_enabled=true','Tunneled'],['CORTEX-CONSTANT-FRAME-RATE','CFR'],['CORTEX-OPTICAL-FLOW-MINTERPOLATE','120fps']] },
  'GAP 11 — DLSS/AI Reconstruction': { w: 9, checks: [['CORTEX-AI-SUPER-RESOLUTION','AI SR'],['CORTEX-AI-SPATIAL-DENOISE','AI denoise'],['CORTEX-LCEVC','LCEVC'],['CORTEX-TEMPORAL-ARTIFACT-REPAIR','Temporal repair']] },
  'GAP 12 — Audio Pipeline Real': { w: 7, checks: [['dolby_atmos','Atmos'],['audio_passthrough','Passthrough'],['AUDIO-FALLBACK','Audio fallback'],['earc','eARC']] },
  'GAP 13 — DRM/License Wrapping': { w: 6, checks: [['drm_widevine','Widevine'],['EXT-X-KEY','HLS key'],['DRM-FAIRPLAY','FairPlay'],['PSSH','PSSH']] },
  'GAP 14 — Checklist Auditoría Auto': { w: 8, checks: [['TELEMETRY-TVQM','TVQM'],['TELEMETRY-TR101290','TR101290'],['IMPAIRMENT-GUARD','Impairment'],['AUDIT-','Audit']] }
};

const patterns = [];
for (const [name, g] of Object.entries(gaps)) for (const [p] of g.checks) patterns.push(p);
const hits = Object.fromEntries(patterns.map(p => [p, 0]));

const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]), crlfDelay: Infinity });
rl.on('line', l => { for (const p of patterns) { if (hits[p] === 0 && l.indexOf(p) !== -1) hits[p] = 1; } });
rl.on('close', () => {
  let tw = 0, ws = 0;
  const out = {};
  for (const [name, g] of Object.entries(gaps)) {
    const present = g.checks.filter(([p]) => hits[p]).length;
    const score = present / g.checks.length * 10;
    tw += g.w; ws += score * g.w;
    out[name] = { score, present, total: g.checks.length, weight: g.w, missing: g.checks.filter(([p]) => !hits[p]).map(([p]) => p) };
    console.log(`${name}: ${score.toFixed(1)}/10 (${present}/${g.checks.length}) missing=[${out[name].missing.join(', ')}]`);
  }
  console.log(`\nSCORE FINAL PONDERADO (rúbrica legacy skill): ${(ws / tw).toFixed(2)}/10`);
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'ape-audit', 'legacy-14gap.json'), JSON.stringify({ gaps: out, weighted: +(ws / tw).toFixed(2) }, null, 2));
});
