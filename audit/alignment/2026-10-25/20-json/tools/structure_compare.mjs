#!/usr/bin/env node
// Structural comparison of the LAB JSON chain: counts of every directive layer, per file.
import fs from 'node:fs';
const [outPath, ...pairs] = process.argv.slice(2);
const report = {};
for (const pair of pairs) {
  const i = pair.indexOf('=');
  const label = pair.slice(0, i), path = pair.slice(i + 1);
  const st = fs.statSync(path);
  const raw = fs.readFileSync(path, 'utf8');
  const doc = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const P = doc.profiles_calibrated || doc.profiles || {};
  const perProfile = {};
  for (const [pk, p] of Object.entries(P)) {
    perProfile[pk] = {
      settings: p.settings ? Object.keys(p.settings).length : null,
      vlcopt: p.vlcopt ? Object.keys(p.vlcopt).length : null,
      kodiprop: p.kodiprop ? Object.keys(p.kodiprop).length : null,
      headerOverrides: p.headerOverrides ? Object.keys(p.headerOverrides).length : null,
      hlsjs: p.hlsjs ? Object.keys(p.hlsjs).length : null,
      prefetch_config: p.prefetch_config ? Object.keys(p.prefetch_config).length : null,
      top_keys: Object.keys(p).length,
    };
  }
  const n3 = doc.nivel3_per_layer && typeof doc.nivel3_per_layer === 'object'
    ? Object.fromEntries(Object.entries(doc.nivel3_per_layer).map(([k, v]) => [k, Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0)]))
    : null;
  report[label] = {
    path, bytes: st.size, mtime: st.mtime.toISOString(), bom: /^\uFEFF/.test(raw),
    version: doc.version, lab_version: doc.lab_version, schema: doc.lab_schema_variant,
    exported_at: doc.exported_at, bulletproof: doc.bulletproof,
    top_keys: Object.keys(doc),
    counts: {
      nivel1_directives: Array.isArray(doc.nivel1_directives) ? doc.nivel1_directives.length : null,
      nivel3_per_layer: n3,
      nivel3_total: n3 ? Object.values(n3).reduce((a, b) => a + b, 0) : null,
      placeholders_map: doc.placeholders_map ? Object.keys(doc.placeholders_map).length : null,
      servers: Array.isArray(doc.servers) ? doc.servers.length : null,
      evasion_user_agents: doc.evasion_pool?.user_agents?.length ?? null,
      evasion_referers: doc.evasion_pool?.referers?.length ?? null,
      config_global: doc.config_global ? Object.keys(doc.config_global).length : null,
      scoring_metadata_nivel1_count: doc.scoring_metadata?.nivel1_count ?? null,
      scoring_metadata_nivel3_total: doc.scoring_metadata?.nivel3_total ?? null,
      scoring_metadata_placeholders_count: doc.scoring_metadata?.placeholders_count ?? null,
      scoring_metadata_profile_keys_total: doc.scoring_metadata?.profile_keys_total ?? null,
      scoring_metadata_total_directives: doc.scoring_metadata?.total_directives ?? null,
      prisma_lab_sync_v20_keys: doc.prisma_lab_sync_v20 ? Object.keys(doc.prisma_lab_sync_v20).length : null,
      dnr_calibration: doc.dnr_calibration ? 'present' : null,
      omega_gap_plan_items: doc.omega_gap_plan?.items?.length ?? null,
    },
    per_profile: perProfile,
  };
}
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('written', outPath);
