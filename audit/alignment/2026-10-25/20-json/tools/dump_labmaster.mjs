#!/usr/bin/env node
// Targeted extraction from lab_master_22.6.0.json (read-only, no secret values).
import fs from 'node:fs';
const file = process.argv[2];
const out = process.argv[3];
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const PK = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

const k = (...p) => p.reduce((a, b) => (a == null ? a : a[b]), doc);

const res = { file, bytes: fs.statSync(file).size, top_keys: Object.keys(doc) };

res.scalars = {
  playlist_format: doc.playlist_format, export: doc.exported_at, version: doc.version,
  lab_version: doc.lab_version, lab_schema_variant: doc.lab_schema_variant, bulletproof: doc.bulletproof,
};

res.meta_per_profile = doc.meta_per_profile;

res.profiles = {};
for (const p of PK) {
  const pr = doc.profiles_calibrated?.[p];
  if (!pr) { res.profiles[p] = null; continue; }
  res.profiles[p] = {
    id: pr.id, name: pr.name, role: pr.role,
    settings: pr.settings,
    vlcopt_keys: Object.keys(pr.vlcopt || {}).length,
    vlcopt_sel: {
      'video-width': pr.vlcopt?.['video-width'], 'video-height': pr.vlcopt?.['video-height'],
      'video-fps': pr.vlcopt?.['video-fps'], 'codec-priority': pr.vlcopt?.['codec-priority'],
      'adaptive-maxwidth': pr.vlcopt?.['adaptive-maxwidth'], 'adaptive-maxheight': pr.vlcopt?.['adaptive-maxheight'],
      'adaptive-maxbitrate': pr.vlcopt?.['adaptive-maxbitrate'], 'video-hdr-mode': pr.vlcopt?.['video-hdr-mode'],
    },
    kodiprop: pr.kodiprop,
    headerOverrides_count: Object.keys(pr.headerOverrides || {}).length,
    headerOverrides_sel: Object.fromEntries(Object.entries(pr.headerOverrides || {}).filter(([kk]) =>
      /X-APE-(CODEC|RESOLUTION|FPS|BITRATE|TARGET-BITRATE|PLAYER-ENSLAVEMENT)|X-Stream-|X-Max-|X-HEVC-|X-Video-Range|X-HDCP|X-HDR-Peak|X-Dolby|X-Frame-Rate|X-Bandwidth|X-Codec-Support|X-Profile-Tier|X-Bitrate-Ladder$/.test(kk))),
    hlsjs: pr.hlsjs,
    bounds: pr.bounds,
    fitness: pr.fitness,
    player_enslavement: pr.player_enslavement,
    actor_injections_keys: Object.keys(pr.actor_injections || {}),
  };
}

res.prisma_lab_sync_v20 = doc.prisma_lab_sync_v20;
res.config_global = doc.config_global;
res.scoring_metadata = doc.scoring_metadata;
res.nivel1_directives = { count: doc.nivel1_directives?.length, sample: doc.nivel1_directives?.slice(0, 6), last: doc.nivel1_directives?.slice(-3) };
res.nivel3_per_layer = Object.fromEntries(Object.entries(doc.nivel3_per_layer || {}).map(([kk, vv]) => [kk, { type: Array.isArray(vv) ? `array(${vv.length})` : typeof vv, count: Array.isArray(vv) ? vv.length : (vv && typeof vv === 'object' ? Object.keys(vv).length : 1), sample: Array.isArray(vv) ? vv.slice(0, 4) : vv }]));
res.servers = Array.isArray(doc.servers) ? doc.servers.map((s) => {
  const o = { ...s };
  for (const kk of Object.keys(o)) if (/pass|user|token|secret|key/i.test(kk) && typeof o[kk] === 'string') o[kk] = `«masked:${o[kk].length}ch»`;
  return o;
}) : doc.servers;
res.evasion_pool = { user_agents: doc.evasion_pool?.user_agents?.length, referers: doc.evasion_pool?.referers?.length, first_ua_len: doc.evasion_pool?.user_agents?.[0]?.length };
res.placeholders_map = { count: Object.keys(doc.placeholders_map || {}).length, keys: Object.keys(doc.placeholders_map || {}) };
res.dnr_calibration = doc.dnr_calibration;
res.omega_gap_plan = { keys: Object.keys(doc.omega_gap_plan || {}), summary: doc.omega_gap_plan?.summary, scorecard_total: doc.omega_gap_plan?.scorecard_total, scorecard_grade: doc.omega_gap_plan?.scorecard_grade, items_count: doc.omega_gap_plan?.items?.length };

fs.writeFileSync(out, JSON.stringify(res, null, 2));
console.log('written', out, fs.statSync(out).size, 'bytes');
