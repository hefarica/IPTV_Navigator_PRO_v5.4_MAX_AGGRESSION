#!/usr/bin/env node
// t12 — integridad estructural ANTES(backup) vs DESPUÉS(actual): qué cambió y qué NO.
import fs from 'node:fs';
const [beforePath, afterPath, outPath] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const B = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

const leafPaths = (node, prefix = '', acc = []) => {
  if (node === null || typeof node !== 'object') { acc.push(prefix); return acc; }
  if (Array.isArray(node)) { acc.push(prefix + '[]'); return acc; }
  for (const k of Object.keys(node)) leafPaths(node[k], prefix ? `${prefix}.${k}` : k, acc);
  return acc;
};
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

const keysA = Object.keys(A), keysB = Object.keys(B);
const rootAdded = keysB.filter((k) => !keysA.includes(k));
const rootRemoved = keysA.filter((k) => !keysB.includes(k));

const profA = Object.keys(A.profiles_calibrated || {}), profB = Object.keys(B.profiles_calibrated || {});

const pathsA = leafPaths(A).sort(), pathsB = leafPaths(B).sort();
const setA = new Set(pathsA), setB = new Set(pathsB);
const pathsAdded = pathsB.filter((p) => !setA.has(p));
const pathsRemoved = pathsA.filter((p) => !setB.has(p));

const changed = [];
for (const p of pathsA) {
  if (!setB.has(p)) continue;
  const va = get(A, p), vb = get(B, p);
  if (JSON.stringify(va) !== JSON.stringify(vb)) changed.push({ path: p, before: va, after: vb });
}

const out = {
  schema: 't12-structural-integrity/1.0',
  before: { path: beforePath, bytes: fs.statSync(beforePath).size, root_keys: keysA.length, leaf_paths: pathsA.length },
  after: { path: afterPath, bytes: fs.statSync(afterPath).size, root_keys: keysB.length, leaf_paths: pathsB.length },
  root_keys_added: rootAdded, root_keys_removed: rootRemoved,
  profiles_before: profA, profiles_after: profB,
  profiles_exactly_P0_P5: profB.sort().join(',') === 'P0,P1,P2,P3,P4,P5',
  leaf_paths_added: pathsAdded, leaf_paths_removed: pathsRemoved,
  changed_leaf_count: changed.length,
  changed,
  // Pruebas de "no rompe lo que consume la APP" (APP_SSOT_BINDINGS t6)
  app_consumed_root_keys_present: ['profiles_calibrated', 'prisma_lab_sync_v20', 'nivel1_directives', 'nivel3_per_layer', 'servers', 'evasion_pool', 'config_global', 'placeholders_map', 'lab_version', 'lab_schema_variant', 'exported_at', 'bulletproof'].map((k) => ({ key: k, present: k in B })),
  untouched_blocks: {
    servers_equal: JSON.stringify(A.servers) === JSON.stringify(B.servers),
    servers_count: Array.isArray(B.servers) ? B.servers.length : null,
    nivel1_directives_equal: JSON.stringify(A.nivel1_directives) === JSON.stringify(B.nivel1_directives),
    nivel1_count: Array.isArray(B.nivel1_directives) ? B.nivel1_directives.length : null,
    nivel3_per_layer_equal: JSON.stringify(A.nivel3_per_layer) === JSON.stringify(B.nivel3_per_layer),
    evasion_pool_equal: JSON.stringify(A.evasion_pool) === JSON.stringify(B.evasion_pool),
    config_global_equal: JSON.stringify(A.config_global) === JSON.stringify(B.config_global),
    placeholders_map_equal: JSON.stringify(A.placeholders_map) === JSON.stringify(B.placeholders_map),
    dnr_calibration_equal: JSON.stringify(A.dnr_calibration) === JSON.stringify(B.dnr_calibration),
  },
  per_profile_keycounts_after: Object.fromEntries(Object.entries(B.profiles_calibrated).map(([k, v]) => [k, { top: Object.keys(v).length, settings: Object.keys(v.settings || {}).length, vlcopt: Object.keys(v.vlcopt || {}).length, kodiprop: Object.keys(v.kodiprop || {}).length, headerOverrides: Object.keys(v.headerOverrides || {}).length }])),
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  profiles_exactly_P0_P5: out.profiles_exactly_P0_P5,
  root_keys_added: rootAdded, root_keys_removed: rootRemoved,
  leaf_paths_added: pathsAdded.length, leaf_paths_removed: pathsRemoved.length,
  changed_leaf_count: changed.length,
  servers_equal: out.untouched_blocks.servers_equal,
  app_consumed_all_present: out.app_consumed_root_keys_present.every((x) => x.present),
  bytes_before: out.before.bytes, bytes_after: out.after.bytes,
}, null, 2));
