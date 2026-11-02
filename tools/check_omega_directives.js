#!/usr/bin/env node
/** Static gate for the OMEGA/Crystal directives implemented in the generator. */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8');
const expected = {
  D1: ['colorspace=all=auto', 'tonemap=mobius', 'trc=auto'],
  D4: ['X-Device-Class', 'X-Decoding-Capability', 'SPOOF-DEVICE-CLASS', 'SPOOF-DECODING-CAPABILITY'],
  D5: ['yuv444p10le', 'yuv444p', 'saturation', 'QUANTUM-PIXEL'],
  D7: ['BUFFER-STRATEGY:ADAPTIVE_PREDICTIVE_NEURAL', 'BUFFER-PRELOAD-SEGMENTS:30', 'BUFFER-DYNAMIC-ADJUSTMENT:ENABLED'],
  D8: ['preferred_codec=hevc', 'video_codec_override=hevc', 'AV1-FALLBACK-CHAIN', 'CODEC-PRIORITY'],
  D9: ['TRANSPORT-PROTOCOL:CMAF_UNIVERSAL', 'TRANSPORT-CHUNK-SIZE:200MS', 'TRANSPORT-FALLBACK-1:HLS_FMP4', 'EXT-X-SERVER-CONTROL'],
  D12: ['audio_passthrough_earc=strict', 'AUDIO-EARC'],
  D13: ['DRM-WIDEVINE', 'drm_widevine'],
  D14: ['TELEMETRY-TVQM', 'TELEMETRY-TR101290', 'IMPAIRMENT-GUARD', 'AUDIT-OMEGA'],
};
let total = 0, pass = 0;
for (const [dim, checks] of Object.entries(expected)) {
  for (const check of checks) {
    total++;
    const ok = src.includes(check);
    if (ok) pass++;
    console.log((ok ? 'PASS ' : 'FAIL ') + dim + ' ' + check);
  }
}
console.log(`\nTOTAL=${total} PASS=${pass} FAIL=${total - pass}`);
if (pass !== total) process.exitCode = 1;
