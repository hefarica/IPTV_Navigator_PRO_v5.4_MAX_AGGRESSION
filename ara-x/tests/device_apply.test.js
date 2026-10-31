'use strict';

/**
 * device_apply.test.js — I4 · verificación del compositor de aplicación en device.
 *
 * Cubre la aceptación del task:
 *   1) 0 claves fuera de `actuator_allowlist.json`; SoC no listado ⇒ allowed:false y cero levers.
 *   2) Payload `/a/cfg` ≤64 KB, sin claves duplicadas, con TTL declarado.
 *   3) No emite props/namespaces inventados, no usa ADB y no toca resolución/códec/bitrate.
 *   4) Variantes de SoC (guion/underscore/mayúsculas), sensores null, payload sobredimensionado,
 *      clave duplicada.
 *   5) PHP staged: lint NOT_RUN declarado cuando no hay intérprete; paridad si lo hay.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const composer = require(path.join(ROOT, 'ara-x', 'device', 'apply_composer.js'));

const ALLOWLIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'ara-x', 'spec', 'actuator_allowlist.json'), 'utf8'));
const LEVER_MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'ara-x', 'spec', 'lever_namespace_map.json'), 'utf8'));
const ALLOWED_KEYS = new Set(ALLOWLIST.settings_allowlist.device_applier.keys.map((k) => k.key));
const VPP_LEVERS = new Set(ALLOWLIST.settings_allowlist.vpp_levers.keys);
const CANON = new Set(LEVER_MAP.soc.canonical);

// ── fixtures ─────────────────────────────────────────────────────────────────
const LIMITS = { light_c: 58, moderate_c: 64, severe_c: 70, critical_c: 78 };

const ALL_LEVERS = {
  pq_ai_sr_enable: 1, ai_sr_level: 3, ai_pq_mode: 3, aipq_enable: 1,
  pq_sharpness_enable: 1, pq_ai_dnr_enable: 1, pq_dnr_enable: 1, pq_nr_enable: 1,
  pq_ai_fbc_enable: 1, pq_hdr_enable: 1, pq_hdr_mode: 1,
  match_content_frame_rate: 1, minimal_post_processing_allowed: 0
};

function policy(over) {
  return Object.assign({
    v: 2,
    device: { allowed: true, soc: 's905x4', levers: Object.assign({}, ALL_LEVERS) },
    display: { wire_resolution: '3840x2160', eight_k: 'presentation_only', never_downscale: true },
    fps: { target: 60 },
    processing: { tier: 'max_image' },
    thermal: { status: 1, limits: LIMITS }
  }, over || {});
}

function measured(over) {
  return Object.assign({
    soc: 's905x4',
    thermal: { prov: 'measured', status: 1, temp_c: 57 },
    player_runtime: { buffer_ms: 4200 }
  }, over || {});
}

function keyOf(row) {
  const parts = String(row).split(/\s+/);
  assert.equal(parts.length, 3, 'fila con forma "<ns> <key> <valor>": ' + row);
  return { ns: parts[0], key: parts[1], value: Number(parts[2]) };
}

// ── 1. specs y allowlist ─────────────────────────────────────────────────────
test('specs: 29 claves, 13 levers, 4 SoC canónicos y sin drift entre artefactos', () => {
  assert.equal(ALLOWED_KEYS.size, 29);
  assert.equal(VPP_LEVERS.size, 13);
  assert.deepEqual([...CANON].sort(), ['amlogic', 'mt8696', 's905x3', 's905x4']);
  assert.equal(composer.ALLOWED.size, 29);
  assert.equal(composer.LEVERS.size, 13);
  assert.equal(composer.KEY_META.size, 29);
  assert.deepEqual(composer.CANON_SOCS.slice().sort(), [...CANON].sort());
});

test('normalizeSoc: guion, underscore, mayúsculas y alias históricos', () => {
  const cases = [
    ['s905x4', 's905x4'],
    ['S905X4', 's905x4'],
    ['  s905x4  ', 's905x4'],
    ['amlogic_s905x4', 's905x4'],
    ['amlogic-s905x4', 's905x4'],
    ['AMLOGIC-S905X4', 's905x4'],
    ['firetv_mt8696', 'mt8696'],
    ['mediatek-mt8696', 'mt8696'],
    ['mt8696', 'mt8696'],
    ['amlogic', 'amlogic'],
    ['s905x3', 's905x3']
  ];
  for (const [raw, want] of cases) {
    assert.equal(composer.resolveSoc(raw).canonical, want, 'normalización de ' + raw);
  }
  for (const raw of ['rk3588', 's905x5', '', '   ', null, undefined, 42, {}]) {
    assert.equal(composer.resolveSoc(raw).canonical, null, 'no canónico: ' + String(raw));
  }
});

// ── 2. camino feliz ──────────────────────────────────────────────────────────
test('camino feliz: filas base + levers, cada clave una sola vez y dentro de la allowlist', () => {
  const r = composer.compose({ policy: policy(), measured: measured() });
  assert.equal(r.ok, true);
  assert.equal(r.allowed, true);
  assert.equal(r.state, 'applied');
  assert.equal(r.soc.canonical, 's905x4');
  assert.equal(r.soc.gate, 'allowlisted');

  const base = ['hdr_conversion_mode', 'match_content_frame_rate', 'minimal_post_processing_allowed'];
  const keysAll = r.rows.map((x) => keyOf(x).key);
  assert.equal(keysAll[0], 'hdr_conversion_mode', 'T0 (seguridad) va primero');
  assert.equal(keysAll[1], 'match_content_frame_rate', 'T1 (cadencia) va después de T0');
  for (const b of base) assert.ok(keysAll.includes(b), 'falta la fila base ' + b);
  // resto: T2 ordenado por clave (nunca antes de T0/T1)
  const rest = keysAll.slice(2);
  assert.deepEqual(rest, rest.slice().sort(), 'las claves T2 van ordenadas');
  assert.ok(!['user_preferred_resolution_height', 'user_preferred_resolution_width'].includes(keysAll[keysAll.length - 1]));

  const keys = keysAll;
  assert.equal(new Set(keys).size, keys.length, 'sin claves duplicadas');
  for (const row of r.rows) {
    const { ns, key, value } = keyOf(row);
    assert.ok(ALLOWED_KEYS.has(key), 'clave fuera de actuator_allowlist.json: ' + key);
    assert.ok(['global', 'system', 'secure'].includes(ns), 'namespace no declarado: ' + ns);
    assert.ok(Number.isInteger(value), 'valor no entero en ' + key);
  }
  // 3 base + 11 levers únicos (match_content_frame_rate y minimal_post_processing_allowed coinciden con la base)
  assert.equal(r.rows.length, 3 + (VPP_LEVERS.size - 2));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.denials, []);
});

// ── 3. allowlist ─────────────────────────────────────────────────────────────
test('allowlist: una clave desconocida aborta la política entera (fail-closed)', () => {
  const p = policy();
  p.device.levers = Object.assign({}, ALL_LEVERS, { not_a_real_lever: 1 });
  const r = composer.compose({ policy: p, measured: measured() });
  assert.equal(r.ok, false);
  assert.equal(r.allowed, false);
  assert.equal(r.rows.length, 0, 'no se aplica NADA si hay una clave fuera de la allowlist');
  assert.ok(r.errors.some((e) => e.code === composer.ERRORS.KEY_NOT_ALLOWED));
  const keys = r.rows.map((x) => keyOf(x).key);
  assert.ok(!keys.includes('not_a_real_lever'));
});

test('allowlist: clave de las 29 pero fuera de los 13 levers VPP ⇒ rechazo', () => {
  const p = policy();
  p.device.levers = { color_depth: 12 };           // está en las 29, NO en vpp_levers
  const r = composer.compose({ policy: p, measured: measured() });
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 0);
  assert.ok(r.errors.some((e) => e.code === composer.ERRORS.LEVER_NOT_IN_ALLOWLIST));
});

test('allowlist: claves prohibidas por contrato (8K/resolución/HDR forzado) ⇒ rechazo', () => {
  for (const forbidden of ['user_preferred_resolution_height', 'user_preferred_resolution_width', 'always_hdr']) {
    const p = policy();
    p.device.levers = Object.assign({}, ALL_LEVERS, { [forbidden]: 1 });
    const r = composer.compose({ policy: p, measured: measured() });
    assert.equal(r.ok, false, forbidden + ' debe rechazarse');
    assert.equal(r.rows.length, 0);
    assert.ok(r.errors.some((e) => e.code === composer.ERRORS.KEY_FORBIDDEN), forbidden);
  }
});

// ── 4. SoC ───────────────────────────────────────────────────────────────────
test('SoC desconocido ⇒ allowed:false, cero filas y cero levers', () => {
  const r = composer.compose({ policy: policy({ device: { allowed: true, soc: 'rk3588', levers: ALL_LEVERS } }), measured: measured({ soc: 'rk3588' }) });
  assert.equal(r.allowed, false);
  assert.equal(r.rows.length, 0);
  assert.equal(r.state, 'denied');
  assert.equal(r.reason, composer.ERRORS.SOC_UNMAPPED);
  assert.equal(r.soc.gate, 'not_allowlisted');
  assert.equal(r.soc.canonical, null);
});

test('SoC medido obligatorio: sin soc no se compone nada', () => {
  const r = composer.compose({ policy: policy(), measured: { thermal: { prov: 'unavailable' } } });
  assert.equal(r.ok, false);
  assert.equal(r.allowed, false);
  assert.equal(r.rows.length, 0);
  assert.ok(r.errors.some((e) => e.code === composer.ERRORS.SOC_NOT_MEASURED));
});

test('SoC de la política distinto del medido ⇒ soc_mismatch sin aplicar', () => {
  const p = policy({ device: { allowed: true, soc: 'mt8696', levers: ALL_LEVERS } });
  const r = composer.compose({ policy: p, measured: measured({ soc: 's905x4' }) });
  assert.equal(r.allowed, false);
  assert.equal(r.rows.length, 0);
  assert.equal(r.reason, composer.ERRORS.SOC_MISMATCH);
});

test('variantes de SoC del mismo chip se aceptan y se reporta el alias', () => {
  for (const raw of ['amlogic_s905x4', 'amlogic-s905x4', 'AMLOGIC-S905X4']) {
    const r = composer.compose({ policy: policy({ device: { allowed: true, soc: raw, levers: ALL_LEVERS } }), measured: measured({ soc: raw }) });
    assert.equal(r.allowed, true, raw);
    assert.equal(r.soc.canonical, 's905x4', raw);
    assert.equal(r.soc.alias_used, raw.trim(), raw);
    assert.ok(r.rows.length > 3, raw + ' debe aplicar levers');
  }
});

test('device.allowed=false con SoC correcto ⇒ solo filas base, cero levers', () => {
  const r = composer.compose({ policy: policy({ device: { allowed: false, soc: 's905x4', levers: ALL_LEVERS } }), measured: measured() });
  assert.equal(r.allowed, false);
  assert.equal(r.state, 'denied');
  assert.equal(r.reason, composer.ERRORS.DEVICE_NOT_ALLOWED);
  assert.equal(r.rows.length, 3, 'sólo las 3 filas base');
  const keys = r.rows.map((x) => keyOf(x).key);
  assert.deepEqual(keys, ['hdr_conversion_mode', 'match_content_frame_rate', 'minimal_post_processing_allowed']);
  for (const k of keys) assert.ok(!VPP_LEVERS.has(k) || ['match_content_frame_rate', 'minimal_post_processing_allowed'].includes(k));
  assert.ok(r.skipped.every((s) => s.code === 'device_not_allowed'));
});

test('truth-guards: wire 8K, eight_k native y never_downscale=false se rechazan', () => {
  const r8k = composer.compose({ policy: policy({ display: { wire_resolution: '7680x4320', eight_k: 'presentation_only', never_downscale: true } }), measured: measured() });
  assert.equal(r8k.allowed, false);
  assert.equal(r8k.rows.length, 0);
  assert.equal(r8k.reason, composer.ERRORS.WIRE_8K);

  const rNative = composer.compose({ policy: policy({ display: { wire_resolution: '3840x2160', eight_k: 'native', never_downscale: true } }), measured: measured() });
  assert.equal(rNative.reason, composer.ERRORS.WIRE_8K);

  const rDown = composer.compose({ policy: policy({ display: { wire_resolution: '3840x2160', eight_k: 'presentation_only', never_downscale: false } }), measured: measured() });
  assert.equal(rDown.allowed, false);
  assert.equal(rDown.rows.length, 0);
  assert.equal(rDown.reason, composer.ERRORS.NEVER_DOWNSCALE);
});

// ── 5. claves duplicadas ─────────────────────────────────────────────────────
test('clave duplicada: base y lever de la misma clave ⇒ una sola fila', () => {
  const p = policy();
  p.device.levers = Object.assign({}, ALL_LEVERS, {
    match_content_frame_rate: 1,              // también es fila base (T1)
    minimal_post_processing_allowed: 0         // también es fila base (T2)
  });
  const r = composer.compose({ policy: p, measured: measured() });
  const keys = r.rows.map((x) => keyOf(x).key);
  assert.equal(keys.filter((k) => k === 'match_content_frame_rate').length, 1);
  assert.equal(keys.filter((k) => k === 'minimal_post_processing_allowed').length, 1);
  assert.equal(new Set(keys).size, keys.length);
});

test('clave duplicada en un cuerpo /a/cfg ⇒ E_CFG_DUPLICATE_KEY', () => {
  const parsed = composer.parseCfgBody('{"pq":2,"pq":3,"ttl":120}');
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.some((e) => e.code === composer.ERRORS.CFG_DUPLICATE_KEY));
  assert.deepEqual(composer.findDuplicateJsonKeys('{"a":1,"a":2,"b":3}'), ['a']);
  assert.deepEqual(composer.findDuplicateJsonKeys('{"a":1,"b":2}'), []);
});

// ── 6. /a/cfg ────────────────────────────────────────────────────────────────
test('/a/cfg: cuerpo válido, TTL declarado y ≤64 KB', () => {
  const cfg = composer.composeCfg({ session: 'sess-1', values: { pq: 2, hdr: 3, ua_mode: 1 }, ttl: 120 });
  assert.equal(cfg.ok, true);
  assert.equal(cfg.ttl_s, 120);
  assert.equal(cfg.ttl_declared, true);
  assert.ok(cfg.bytes <= composer.LIMITS.max_cfg_bytes);
  assert.deepEqual(cfg.keys.sort(), ['hdr', 'pq', 'ua_mode']);
  const round = composer.parseCfgBody(cfg.body);
  assert.equal(round.ok, true);
  assert.equal(round.value.ttl, 120);
});

test('/a/cfg: TTL default 300 y clamp [1,3600]', () => {
  const d = composer.composeCfg({ session: 's', values: {} });
  assert.equal(d.ttl_s, composer.LIMITS.ttl_default_s);
  assert.equal(d.ttl_declared, false);
  assert.equal(composer.composeCfg({ session: 's', values: {}, ttl: 0 }).ttl_s, 1);
  assert.equal(composer.composeCfg({ session: 's', values: {}, ttl: -5 }).ttl_s, 1);
  assert.equal(composer.composeCfg({ session: 's', values: {}, ttl: 99999 }).ttl_s, 3600);
  const bad = composer.composeCfg({ session: 's', values: {}, ttl: 'x' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.code === composer.ERRORS.TTL_OUT_OF_RANGE));
});

test('/a/cfg: claves fuera del contrato y valores no enteros se rechazan', () => {
  const r = composer.composeCfg({ session: 's', values: { pq: 2, bogus: 1 }, ttl: 60 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === composer.ERRORS.CFG_BAD_KEY && e.detail === 'bogus'));
  assert.ok(!r.body.includes('bogus'), 'la clave inválida no se serializa');

  const bad = composer.composeCfg({ session: 's', values: { pq: 1.5 }, ttl: 60 });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.code === composer.ERRORS.CFG_BAD_VALUE));
});

test('payload sobredimensionado: presupuesto 64 KB y límite inyectable', () => {
  // límite inyectado: el cuerpo (pequeño) supera el presupuesto declarado
  const tight = composer.composeCfg({ session: 's', values: { pq: 2 }, ttl: 60, limits: { max_cfg_bytes: 8 } });
  assert.equal(tight.ok, false);
  assert.ok(tight.errors.some((e) => e.code === composer.ERRORS.CFG_TOO_LARGE));

  // default real: 65536 B
  assert.equal(composer.LIMITS.max_cfg_bytes, 65536);
  assert.throws(() => composer.assertBytes('x'.repeat(65537), composer.LIMITS.max_cfg_bytes), /E_CFG_TOO_LARGE/);
  const big = composer.parseCfgBody(JSON.stringify({ pq: 2, ttl: 60, note: 'x'.repeat(70000) }));
  assert.equal(big.ok, false);
  assert.ok(big.errors.some((e) => e.code === composer.ERRORS.CFG_TOO_LARGE));

  // el compositor principal propaga el fallo del cfg
  const r = composer.compose({
    policy: policy(),
    measured: measured(),
    cfg: { session: 's', values: { pq: 2 }, ttl: 60, limits: { max_cfg_bytes: 8 } }
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === composer.ERRORS.CFG_TOO_LARGE));
});

// ── 7. sensores null / R4-F05 ────────────────────────────────────────────────
test('sensores null: térmica no medida ⇒ 0 pasos, sin clamp y con warning', () => {
  const r = composer.compose({ policy: policy(), measured: measured({ thermal: { prov: 'unavailable', status: null, temp_c: null } }) });
  assert.equal(r.allowed, true);
  assert.equal(r.intents.thermal_steps, 0);
  assert.equal(r.intents.thermal_prov, 'unavailable');
  assert.equal(r.intents.effective_tier, 'max_image');
  assert.deepEqual(r.clamped, []);
  assert.ok(r.warnings.includes('thermal_unavailable'));
});

test('R4-F05: buffer_ms del player sí; buffer_health_pct se ignora y no se emite', () => {
  const base = composer.compose({ policy: policy(), measured: measured() });
  assert.equal(base.intents.buffer_ms, 4200);

  const withBhp = composer.compose({
    policy: policy(),
    measured: measured({ player_runtime: { buffer_ms: null, buffer_health_pct: 82 }, player: { buffer_health_pct: 82 } })
  });
  assert.equal(withBhp.intents.buffer_ms, null, 'sin buffer_ms del player ⇒ null (no se usa el modelo de red)');
  assert.ok(withBhp.ignored_inputs.includes('buffer_health_pct'));
  assert.ok(withBhp.warnings.includes('buffer_health_pct_ignored'));
  const scan = JSON.stringify(withBhp);
  assert.ok(!scan.includes('buffer_health_pct":82'), 'el valor del modelo de red no debe viajar');
  assert.ok(!scan.includes('"82"'));
});

test('identidad: serial/chip se ignoran (no se hardcodean ni se emiten)', () => {
  const r = composer.compose({
    policy: policy(),
    measured: measured({ soc: 's905x4', serial: 'AFTKA1234567890', chip: 'mt8696', device_serial: 'xyz' })
  });
  assert.equal(r.allowed, true);
  assert.ok(r.ignored_inputs.includes('serial'));
  assert.ok(r.ignored_inputs.includes('chip'));
  // el VALOR de identidad no puede viajar en lo que se aplica (rows/intents/cfg)
  const payload = JSON.stringify({ rows: r.rows, intents: r.intents, cfg: r.cfg });
  assert.ok(!payload.includes('AFTKA1234567890'));
  assert.ok(!payload.includes('"serial"'));
  assert.ok(!r.rows.some((row) => /serial|chip/.test(row)));
});

// ── 8. no props / no ADB / no resolución-códec-bitrate ──────────────────────
test('no emite props/namespaces inventados ni campos de resolución/códec/bitrate', () => {
  const r = composer.compose({ policy: policy(), measured: measured() });
  const hits = composer.scanForbiddenFields({ rows: r.rows, intents: r.intents });
  assert.deepEqual(hits, [], 'campos prohibidos en la salida: ' + hits.join(','));
  for (const row of r.rows) {
    const { ns } = keyOf(row);
    assert.ok(['global', 'system', 'secure'].includes(ns));
  }
  assert.ok(!/resolution|codecs|bandwidth/i.test(JSON.stringify({ rows: r.rows })));
});

test('las fuentes no usan ADB ni comandos de props', () => {
  const files = [
    path.join(ROOT, 'ara-x', 'device', 'apply_composer.js'),
    path.join(ROOT, 'ara-x', 'device', 'staged', 'ara_cfg_composer.php'),
    path.join(ROOT, 'ara-x', 'scripts', 'device', 'compose_cli.js')
  ];
  // patrones de EJECUCIÓN (no la palabra suelta en prosa/regex de guardia)
  const forbidden = [
    /require\(\s*['"]child_process['"]\s*\)/,
    /from\s+['"]child_process['"]/,
    /\bexecSync\s*\(/,
    /\bspawnSync\s*\(/,
    /\bshell_exec\s*\(/,
    /['"]setprop['"]/,
    /['"]getprop['"]/,
    /\badb\s+shell\b/,
    /\bsettings\s+put\b/
  ];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of forbidden) {
      assert.ok(!re.test(src), path.basename(f) + ' contiene un patrón prohibido: ' + re);
    }
  }
});

// ── 9. térmica y tier ───────────────────────────────────────────────────────
test('térmica medida con temperatura: 2 pasos ⇒ balanced y clamps reales', () => {
  const r = composer.compose({
    policy: policy(),
    measured: measured({ thermal: { prov: 'measured', status: 2, temp_c: 71.5 } })
  });
  assert.equal(r.intents.thermal_steps, 2);
  assert.equal(r.intents.thermal_source, 'temp_c');
  assert.equal(r.intents.effective_tier, 'balanced');
  assert.equal(r.state, 'partial');
  const clampedKeys = r.clamped.map((c) => c.key);
  assert.ok(clampedKeys.includes('ai_sr_level'));
  assert.ok(clampedKeys.includes('pq_ai_fbc_enable'));
  assert.ok(clampedKeys.includes('pq_sharpness_enable'));
  assert.ok(clampedKeys.includes('minimal_post_processing_allowed'));
  const row = Object.fromEntries(r.rows.map((x) => { const k = keyOf(x); return [k.key, k.value]; }));
  assert.equal(row.ai_sr_level, 1);
  assert.equal(row.minimal_post_processing_allowed, 1);
  assert.equal(row.pq_ai_fbc_enable, 0);
});

test('tier más conservador que los levers ⇒ manda el tier', () => {
  const r = composer.compose({ policy: policy({ processing: { tier: 'balanced' } }), measured: measured() });
  assert.equal(r.intents.effective_tier, 'balanced');
  assert.equal(r.state, 'partial');
  const row = Object.fromEntries(r.rows.map((x) => { const k = keyOf(x); return [k.key, k.value]; }));
  assert.equal(row.ai_sr_level, 1);
  assert.equal(row.pq_sharpness_enable, 0);
});

test('límites térmicos inválidos ⇒ warning y se ignoran (no se inventan pasos)', () => {
  const r = composer.compose({
    policy: policy({ thermal: { status: 1, limits: { light_c: 70, moderate_c: 64, severe_c: 60, critical_c: 55 } } }),
    measured: measured({ thermal: { prov: 'measured', status: 1, temp_c: 90 } })
  });
  assert.ok(r.warnings.includes('thermal_limits_invalid'));
  assert.equal(r.intents.thermal_limits, null);
  assert.equal(r.intents.thermal_steps, 0, 'sin límites válidos sólo queda el enum, y status=1 ⇒ 0 pasos');
});

// ── 10. intents y determinismo ──────────────────────────────────────────────
test('intents: fps objetivo, never_downscale, tier y límites térmicos', () => {
  const r = composer.compose({ policy: policy(), measured: measured() });
  assert.equal(r.intents.fps_target, 60);
  assert.equal(r.intents.processing_tier, 'max_image');
  assert.equal(r.intents.never_downscale, true);
  assert.deepEqual(r.intents.thermal_limits, LIMITS);

  const r24 = composer.compose({ policy: policy({ fps: { target: 24 } }), measured: measured() });
  assert.equal(r24.intents.fps_target, 24);

  const rBad = composer.compose({ policy: policy({ fps: { target: 120 } }), measured: measured() });
  assert.equal(rBad.intents.fps_target, null);
  assert.ok(rBad.warnings.includes('cadence_unknown'));
});

test('determinismo: dos composiciones idénticas producen el mismo JSON', () => {
  const a = composer.compose({ policy: policy(), measured: measured(), cfg: { session: 's', values: { pq: 2 }, ttl: 60 } });
  const b = composer.compose({ policy: policy(), measured: measured(), cfg: { session: 's', values: { pq: 2 }, ttl: 60 } });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('presupuesto de filas: max_rows inyectable y warning de truncado', () => {
  const r = composer.compose({ policy: policy(), measured: measured(), limits: { max_rows: 2 } });
  assert.equal(r.rows.length, 2);
  assert.ok(r.warnings.includes('rows_truncated'));
});

// ── 11. CLI ─────────────────────────────────────────────────────────────────
test('CLI --selftest compone y sale con 0', () => {
  const cli = path.join(ROOT, 'ara-x', 'scripts', 'device', 'compose_cli.js');
  const res = spawnSync(process.execPath, [cli, '--selftest'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /ok=true/);
  assert.match(res.stdout, /allowed=true/);
  assert.match(res.stdout, /soc=s905x4/);
});

// ── 12. PHP staged ──────────────────────────────────────────────────────────
const PHP_SRC = path.join(ROOT, 'ara-x', 'device', 'staged', 'ara_cfg_composer.php');

test('PHP staged: existencia, forma de clase y presupuesto declarado', () => {
  const src = fs.readFileSync(PHP_SRC, 'utf8');
  assert.match(src, /^<\?php/);
  assert.match(src, /declare\(strict_types=1\)/);
  assert.match(src, /final class AraApplyComposer/);
  assert.match(src, /MAX_CFG_BYTES = 65536/);
  assert.match(src, /TTL_MAX = 3600/);
  // llaves balanceadas (chequeo sintáctico grueso, no sustituye a `php -l`)
  const open = (src.match(/{/g) || []).length;
  const close = (src.match(/}/g) || []).length;
  assert.equal(open, close, 'llaves desbalanceadas en el PHP');
});

test('PHP staged: lint y paridad JS↔PHP', (t) => {
  const probe = spawnSync('php', ['-v'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    // Sin intérprete local: se declara NOT_RUN (no se finge que se verificó).
    t.skip('php no disponible en este host ⇒ `php -l` y paridad JS↔PHP = NOT_RUN');
    return;
  }
  const lint = spawnSync('php', ['-l', PHP_SRC], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);

  const fixture = {
    policy: policy(),
    measured: measured()
  };
  const js = composer.compose(fixture);
  const phpCode = [
    'require ' + JSON.stringify(PHP_SRC) + ';',
    '$c = new AraApplyComposer(' + JSON.stringify(path.join(ROOT, 'ara-x', 'spec')) + ');',
    '$in = json_decode(file_get_contents("php://stdin"), true);',
    '$r = $c->compose($in);',
    'echo json_encode(["rows" => $r["rows"], "allowed" => $r["allowed"], "tier" => $r["intents"]["effective_tier"], "steps" => $r["intents"]["thermal_steps"], "fps" => $r["intents"]["fps_target"], "buffer_ms" => $r["intents"]["buffer_ms"]], JSON_UNESCAPED_SLASHES);'
  ].join('\n');
  const run = spawnSync('php', ['-r', phpCode], { input: JSON.stringify(fixture), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.allowed, js.allowed);
  assert.deepEqual(out.rows, js.rows, 'filas JS != filas PHP');
  assert.equal(out.tier, js.intents.effective_tier);
  assert.equal(out.steps, js.intents.thermal_steps);
  assert.equal(out.fps, js.intents.fps_target);
  assert.equal(out.buffer_ms, js.intents.buffer_ms);
});
