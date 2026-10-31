// R5 self-check: valida estructura y consistencia del actuator_allowlist.json contra el codigo.
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || process.cwd();
const SPEC = path.join(ROOT, 'ara-x/spec/actuator_allowlist.json');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };

const raw = fs.readFileSync(SPEC, 'utf8');
const j = JSON.parse(raw);
console.log('JSON parse OK (' + raw.length + ' bytes)');

ok(j.schema === 'ara-x.actuator_allowlist.v1', 'schema');
ok(Array.isArray(j.actuators) && j.actuators.length === 15, 'actuators=15 (got ' + j.actuators.length + ')');
const ids = j.actuators.map(a => a.id);
ok(new Set(ids).size === ids.length, 'ids unicos');
for (const a of j.actuators) {
  ok(Array.isArray(a.evidence) && a.evidence.length > 0, 'evidencia en ' + a.id);
  ok(!!a.status && !!a.class, 'status/class en ' + a.id);
  for (const e of a.evidence) ok(typeof e.path === 'string' && e.path.length > 3, a.id + ' evidence.path');
}

const sa = j.settings_allowlist;
ok(sa.device_applier.count === 29, 'device_applier.count=29');
ok(sa.device_applier.keys.length === 29, 'device_applier.keys=29');
ok(sa.vpp_levers.keys.length === 13, 'vpp_levers=13');
ok(sa.ns_map.keys.length === 15, 'ns_map=15');
ok(sa.ct_profiles.count === 13, 'ct_profiles.count=13');
ok(sa.cli_profile.count === 13, 'cli_profile.count=13');

// ── Cross-check 1: las 29 claves del APK deben ser EXACTAMENTE las del .kt
const ktPath = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/SettingsApplier.kt');
const kt = fs.readFileSync(ktPath, 'utf8');
// El literal Kotlin escapa la barra (\\d) -> la regex EFECTIVA es \d. Se normaliza antes de comparar.
const ktRows = [...kt.matchAll(/"([a-z0-9_]+)"\s+to\s+Regex\("([^"]+)"\)/g)]
  .map(m => ({ key: m[1], regex: m[2].replace(/\\\\/g, '\\') }));
ok(ktRows.length === 29, 'SettingsApplier.kt ALLOW_KEY=29 (got ' + ktRows.length + ')');
const specKeys = new Map(sa.device_applier.keys.map(k => [k.key, k.regex]));
let diff = [];
for (const r of ktRows) {
  if (!specKeys.has(r.key)) diff.push('falta en spec: ' + r.key);
  else if (specKeys.get(r.key) !== r.regex) diff.push('regex distinta: ' + r.key + ' spec=' + specKeys.get(r.key) + ' kt=' + r.regex);
}
for (const k of specKeys.keys()) if (!ktRows.some(r => r.key === k)) diff.push('sobra en spec: ' + k);
ok(diff.length === 0, 'allowlist APK identica al codigo' + (diff.length ? ' -> ' + diff.join(' ; ') : ''));

// ── Cross-check 2: ape_vpp_levers (13) y ape_ff_settings_ns_map (15)
const php = fs.readFileSync(path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php'), 'utf8');
const block = (re) => { const m = php.match(re); return m ? [...m[1].matchAll(/'([a-z0-9_]+)'\s*=>/g)].map(x => x[1]) : []; };
const levers = block(/function ape_vpp_levers\(\$pq_profile = 'max_image'\) \{\s*\$l = array\(([\s\S]*?)\);/);
const nsmap = block(/function ape_ff_settings_ns_map\(\) \{\s*return array\(([\s\S]*?)\);/);
ok(levers.length === 13, 'ape_vpp_levers=13 (got ' + levers.length + ')');
ok(nsmap.length === 15, 'ape_ff_settings_ns_map=15 (got ' + nsmap.length + ')');
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
ok(same(levers, sa.vpp_levers.keys), 'vpp_levers identicos al .php');
ok(same(nsmap, sa.ns_map.keys), 'ns_map identicos al .php');

// ── Cross-check 3: la allowlist de SoC del PHP coincide con el spec
const socAllow = (php.match(/function ape_soc_allowlisted\(\$socOrDevice, array \$allow = array\(([^)]*)\)/) || [])[1];
const socList = [...(socAllow || '').matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]);
ok(same(socList, j.soc_gate.default_allow), 'soc_gate.default_allow identico al .php (' + socList.join(',') + ')');

// ── Cross-check 4: /a/cfg — dict, TTL y rate-limit contra el Lua
const lua = fs.readFileSync(path.join(ROOT, '_vps_stage/lua/ape_attr.lua'), 'utf8');
const num = (re) => { const m = lua.match(re); return m ? Number(m[1]) : null; };
const dict = (lua.match(/DICT\s*=\s*"([a-z_]+)"/) || [])[1];
ok(dict === j.actuators.find(a => a.id === 'A6').storage.dict, 'A6 dict=' + dict);
const ttlDef = num(/TTL_DEFAULT\s*=\s*(\d+)/), ttlMax = num(/TTL_MAX\s*=\s*(\d+)/);
ok(ttlDef === j.actuators.find(a => a.id === 'A6').storage.ttl_default_s, 'A6 ttl_default=' + ttlDef);
ok(ttlMax === j.actuators.find(a => a.id === 'A6').storage.ttl_clamp_s[1], 'A6 ttl_max=' + ttlMax);
ok(num(/\bRL_MAX\b\s*=\s*(\d+)/) === 6 && num(/\bRL_WINDOW\b\s*=\s*(\d+)/) === 60, 'A6 rate-limit 6/60s');
ok(num(/M\.SLOTS\s*=\s*(\d+)/) === 1000, 'slots=1000');
ok(num(/M\.MASK_BYTES\s*=\s*(\d+)/) === 125, 'mask_bytes=125');

// ── Cross-check 5: nginx /a/cfg loopback + 64k
const ng = fs.readFileSync(path.join(ROOT, '_vps_stage/nginx/meta-plane.conf'), 'utf8');
ok(/location = \/a\/cfg \{[\s\S]{0,120}allow 127\.0\.0\.1;[\s\S]{0,40}deny all;/.test(ng), 'nginx /a/cfg loopback-only');
ok(/client_max_body_size 64k;/.test(ng), 'nginx client_max_body_size 64k');
ok(/lua_shared_dict ape_attr_cfg 1m;/.test(ng), 'lua_shared_dict ape_attr_cfg 1m');

// ── Cross-check 6: tamano real de los .tflite (placeholders)
const assetsDir = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/assets');
const declared = j.actuators.find(a => a.id === 'X1').asset_sizes_bytes;
for (const [f, sz] of Object.entries(declared)) {
  if (f === 'total') continue;
  const real = fs.statSync(path.join(assetsDir, f)).size;
  ok(real === sz, 'tamano ' + f + ' spec=' + sz + ' real=' + real);
}
const totalReal = Object.entries(declared).filter(([f]) => f !== 'total').reduce((s, [, v]) => s + v, 0);
ok(totalReal === declared.total, 'total tflite=' + totalReal);

// ── Cross-check 7: thermal — toda senal declara requires_adb y available_today
for (const s of j.thermal.signals) {
  ok(typeof s.requires_adb === 'boolean', 'requires_adb en ' + s.id);
  ok(s.available_today !== undefined, 'available_today en ' + s.id);
}
ok(j.thermal.measured_in_repo.sysfs_refs === 0, 'thermal: sysfs_refs=0 declarado');

// ── Cross-check 8: sin secretos
ok(!/Authorization: Bearer [A-Za-z0-9._-]{20,}/.test(raw), 'sin tokens Bearer reales');
ok(!/APE_ENROLL_SECRET\s*=\s*[^"]/.test(raw), 'sin secreto de enrolamiento');

console.log('---');
console.log(fails === 0 ? 'RESULT: ALL CHECKS PASS' : 'RESULT: ' + fails + ' FAIL');
process.exit(fails === 0 ? 0 : 1);
