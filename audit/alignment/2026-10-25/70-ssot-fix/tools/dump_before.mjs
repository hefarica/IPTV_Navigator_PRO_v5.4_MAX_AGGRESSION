#!/usr/bin/env node
// Dumps the exact CURRENT values of every key t12 will touch (read-only).
import fs from 'node:fs';
const P = process.argv[2];
const doc = JSON.parse(fs.readFileSync(P, 'utf8'));
const pk = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const out = {};
for (const k of pk) {
  const p = doc.profiles_calibrated[k];
  out[k] = {
    'settings.resolution': p.settings.resolution,
    'settings.maxResolution': p.settings.maxResolution,
    'settings.fps': p.settings.fps,
    'settings.targetFps': p.settings.targetFps,
    'settings.target_framerate': p.settings.target_framerate,
    'settings.codec': p.settings.codec,
    'settings.codec_full': p.settings.codec_full,
    'settings.codec_string': p.settings.codec_string,
    'settings.codec_priority': p.settings.codec_priority,
    'settings.bit_depth': p.settings.bit_depth,
    'settings.chroma_subsampling': p.settings.chroma_subsampling,
    'settings.maxBitrateKbps': p.settings.maxBitrateKbps,
    'settings.avgBitrateKbps': p.settings.avgBitrateKbps,
    'vlcopt.video-width': p.vlcopt['video-width'],
    'vlcopt.video-height': p.vlcopt['video-height'],
    'vlcopt.codec-priority': p.vlcopt['codec-priority'],
    'headerOverrides.X-APE-RESOLUTION': p.headerOverrides['X-APE-RESOLUTION'],
    'headerOverrides.X-APE-CODEC': p.headerOverrides['X-APE-CODEC'],
    'headerOverrides.X-APE-FPS': p.headerOverrides['X-APE-FPS'],
    'headerOverrides.X-Stream-Codecs': p.headerOverrides['X-Stream-Codecs'],
    'headerOverrides.X-Stream-Resolution': p.headerOverrides['X-Stream-Resolution'],
    'headerOverrides.X-Stream-FPS': p.headerOverrides['X-Stream-FPS'],
    'headerOverrides.X-Max-Framerate': p.headerOverrides['X-Max-Framerate'],
    'headerOverrides.X-Min-Framerate': p.headerOverrides['X-Min-Framerate'],
    'headerOverrides.X-Frame-Rates': p.headerOverrides['X-Frame-Rates'],
    'headerOverrides.X-Max-Resolution': p.headerOverrides['X-Max-Resolution'],
    'headerOverrides.X-Max-Bitrate': p.headerOverrides['X-Max-Bitrate'],
    'headerOverrides.X-Bitrate-Ladder': p.headerOverrides['X-Bitrate-Ladder'],
    'kodiprop.keys': Object.keys(p.kodiprop).length,
    'kodiprop.stream_headers': p.kodiprop['inputstream.adaptive.stream_headers'],
    'kodiprop.max_resolution': p.kodiprop['inputstream.adaptive.max_resolution'],
    'kodiprop.preferred_video_frame_rate': p.kodiprop['inputstream.adaptive.preferred_video_frame_rate'],
    'ladder.video': doc.prisma_lab_sync_v20.codec_ladder_per_profile[k].video,
    'ladder.first': doc.prisma_lab_sync_v20.codec_ladder_per_profile[k].video.split(',')[0],
  };
}
console.log(JSON.stringify(out, null, 2));
