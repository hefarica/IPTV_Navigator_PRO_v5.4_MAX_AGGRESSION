#!/usr/bin/env node
/**
 * omega_audit_stream.js — auditor OMEGA CRYSTAL en streaming (listas gigantes).
 * Mismas 14 dimensiones/51 checks del skill iptv-m3u8-auditor, sin cargar el archivo.
 * Uso: node tools/omega_audit_stream.js <lista.m3u8[.gz]>
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const file = process.argv[2];
if (!file) { console.error('uso: node tools/omega_audit_stream.js <lista.m3u8[.gz]>'); process.exit(2); }

const GAPS = {
  'GAP 1 — Dynamic Range Classifier': { weight: 8, checks: [
    ['colorspace=all=auto','Auto-detect SDR/HDR/HLG'],['tonemap=mobius','Tone mapping'],
    ['trc=auto','Transfer curve auto'],['zscale=transfer=st2084','HDR conversion']] },
  'GAP 2 — Space Validator': { weight: 7, checks: [
    ['format=yuv444p','4:4:4'],['range=limited','Range fallback'],
    ['chromal=topleft','Chroma siting'],['deband','Banding control']] },
  'GAP 3 — Bitrate Anarchy Protocol': { weight: 9, checks: [
    ['ANTI-CUT-ISP-STRANGLE','ISP throttle'],['bandwidth_ramp=true','Bandwidth ramp'],
    ['bandwidth_ramp_peak=100000000','Peak 100Mbps'],['OMEGA-ENGINE-BANDWIDTH-MONITOR','BW monitor']] },
  'GAP 4 — Hardware Agent Spoofing': { weight: 7, checks: [
    ['X-Device-Class','Device class'],['X-Decoding-Capability','Decoding capability'],
    ['SHIELD-TV-PRO','Shield spoof'],['AppleTV14,1','AppleTV spoof']] },
  'GAP 5 — Quantum Pixel Overdrive': { weight: 7, checks: [
    ['yuv444p10le','10-bit 4:4:4'],['yuv444p','4:4:4'],['saturation','Saturation'],
    ['QUANTUM-PIXEL','Quantum Pixel']] },
  'GAP 6 — Luma Precision Engine': { weight: 8, checks: [
    ['unsharp=luma','Luma sharpening'],['hqdn3d','3D denoise'],
    ['nlmeans','NL means'],['LUMA-GAMMA','Gamma']] },
  'GAP 7 — Network Buffer God Tier': { weight: 9, checks: [
    ['network-caching','VLC cache'],['BUFFER-STRATEGY:ADAPTIVE_PREDICTIVE_NEURAL','Neural buffer'],
    ['BUFFER-PRELOAD-SEGMENTS:30','Preload 30'],['BUFFER-DYNAMIC-ADJUSTMENT:ENABLED','Dynamic buffer']] },
  'GAP 8 — Codec Priority Enforcer': { weight: 8, checks: [
    ['preferred_codec=hevc','HEVC preferred'],['video_codec_override=hevc','HEVC override'],
    ['AV1-FALLBACK-CHAIN','AV1 chain'],['CODEC-PRIORITY','Codec priority']] },
  'GAP 9 — fMP4/CMAF Pipeline': { weight: 8, checks: [
    ['TRANSPORT-PROTOCOL:CMAF_UNIVERSAL','CMAF universal'],['TRANSPORT-CHUNK-SIZE:200MS','200ms chunks'],
    ['TRANSPORT-FALLBACK-1:HLS_FMP4','fMP4 fallback'],['EXT-X-SERVER-CONTROL','LL-HLS control']] },
  'GAP 10 — VRR/Refresh Sync': { weight: 7, checks: [
    ['vrr_sync','VRR sync'],['tunneling_enabled=true','Tunneled'],
    ['CORTEX-CONSTANT-FRAME-RATE','CFR'],['CORTEX-OPTICAL-FLOW-MINTERPOLATE','Optical flow']] },
  'GAP 11 — DLSS/AI Reconstruction': { weight: 9, checks: [
    ['CORTEX-AI-SUPER-RESOLUTION','AI SR'],['CORTEX-AI-SPATIAL-DENOISE','AI denoise'],
    ['CORTEX-LCEVC','LCEVC'],['CORTEX-TEMPORAL-ARTIFACT-REPAIR','Temporal repair']] },
  'GAP 12 — Audio Pipeline Real': { weight: 7, checks: [
    ['dolby_atmos','Atmos'],['audio_passthrough','Passthrough'],
    ['AUDIO-FALLBACK','Fallback'],['earc','eARC']] },
  'GAP 13 — DRM/License Wrapping': { weight: 6, checks: [
    ['drm_widevine','Widevine'],['EXT-X-KEY','HLS key'],
    ['DRM-FAIRPLAY','FairPlay'],['PSSH','PSSH']] },
  'GAP 14 — Checklist Auditoria Automatica': { weight: 8, checks: [
    ['TELEMETRY-TVQM','TVQM'],['TELEMETRY-TR101290','TR101290'],
    ['IMPAIRMENT-GUARD','Impairment guard'],['AUDIT-','Audit directives']] }
};

const found = new Set();
const input = /\.gz$/i.test(file) ? fs.createReadStream(file).pipe(zlib.createGunzip()) : fs.createReadStream(file);
let lines = 0, channels = 0;
const rl = readline.createInterface({ input, crlfDelay: Infinity });
rl.on('line', l => {
  lines++;
  if (l.startsWith('#EXTINF')) channels++;
  if (!l || found.size === 56) return;
  for (const g of Object.values(GAPS)) for (const [needle] of g.checks) {
    if (!found.has(needle) && l.indexOf(needle) !== -1) found.add(needle);
  }
});
rl.on('close', () => {
  const scores = {};
  let totalW = 0, weighted = 0;
  for (const [name, g] of Object.entries(GAPS)) {
    let present = 0;
    for (const [needle] of g.checks) if (found.has(needle)) present++;
    const s = (present / g.checks.length) * 10;
    scores[name] = { score: s, present, total: g.checks.length, weight: g.weight };
    totalW += g.weight; weighted += s * g.weight;
    console.log(`\n[${present === g.checks.length ? 'OK' : present ? 'PARCIAL' : 'FALTA'}] ${name}  ${s.toFixed(1)}/10 (${present}/${g.checks.length})`);
    for (const [needle, desc] of g.checks) console.log(`  ${found.has(needle) ? '[SI]' : '[NO]'} ${needle}  ${desc}`);
  }
  weighted /= totalW;
  console.log(JSON.stringify({ file, lines, channels, total_unique_checks: found.size, weighted_score: Math.round(weighted * 100) / 100, scores }, null, 2));
});
