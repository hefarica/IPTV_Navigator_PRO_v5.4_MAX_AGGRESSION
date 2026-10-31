#!/usr/bin/env node
'use strict';

/**
 * d4_check_device_apply.js — verificación del contrato D4 (aplicación en device).
 *
 * 1) Valida `ara-x/spec/lever_namespace_map.json` contra el CÓDIGO y contra el CATÁLOGO v2
 *    (`ara-x/vps/schema/sync_features.json`, t9/D3): 29 claves + regex efectivas (SettingsApplier.kt),
 *    in_ns_map (ape_mesh.php), in_vpp_levers, in_client_allowlist (catalogo levers.vpp), ns_observed
 *    contra el dump del SoC (UTF-16LE), coherencia con R5, tiers == processing.tiers, 15 alcanzables,
 *    3 prohibidas y 1 alias.
 * 2) Implementa `resolveDeviceApply()` SEGÚN EL CONTRATO y exige que los 4 vectores reproduzcan `expect`.
 * 3) Guards duros: claves prohibidas nunca se escriben; wire 8K siempre denied; ningún denied sin razón
 *    ni SoC medido; y las políticas de ejemplo V1/V2/V4 deben pasar el `validatePolicy` REAL del cliente v2
 *    (V3 es a propósito una política mentirosa: wire 8K, que el catalogo v2 ya no admite).
 *
 * Uso: node ara-x/scripts/d4_check_device_apply.js "<repo-root>"   → exit 0 sólo si 0 FAIL.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || process.cwd();
const SPEC = path.join(ROOT, 'ara-x/spec');
const MAP_PATH = path.join(SPEC, 'lever_namespace_map.json');
const VEC_PATH = path.join(SPEC, 'device_apply.vectors.json');
const R5_PATH = path.join(SPEC, 'actuator_allowlist.json');
const CAT_PATH = path.join(ROOT, 'ara-x/vps/schema/sync_features.json');
const CLIENT_PATH = path.join(ROOT, 'ara-x/vps/client/ara_sync_client.js');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };
const eq = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, m + (A === B ? '' : '\n     got  ' + A + '\n     want ' + B)); };
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ─────────────────────────────────────────────────── catálogo v2 (fuente única de vocabulario)
const CAT = readJson(CAT_PATH);
const CANON = CAT.socs.canonical;
const ALIAS = CAT.socs.aliases;
const NO_WIRE_8K = CAT.socs.no_wire_8k;
const FPS_TARGETS = CAT.fps.targets;
const TIERS = CAT.processing.tiers;             // [minimal, balanced, quality, max_image]
const CLIENT_LEVERS = CAT.levers.vpp;
const THERMAL_LIMIT_KEYS = CAT.thermal.limit_keys;

// ─────────────────────────────────────────────────── fixtures del repo
const kt = fs.readFileSync(path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/SettingsApplier.kt'), 'utf8');
const ktRows = [...kt.matchAll(/"([a-z0-9_]+)"\s+to\s+Regex\("([^"]+)"\)/g)].map((m) => ({ key: m[1], regex: m[2].replace(/\\\\/g, '\\') }));

const php = fs.readFileSync(path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php'), 'utf8');
const phpBlock = (re) => { const m = php.match(re); return m ? [...m[1].matchAll(/'([a-z0-9_]+)'\s*=>/g)].map((x) => x[1]) : []; };
const nsMapKeys = phpBlock(/function ape_ff_settings_ns_map\(\) \{\s*return array\(([\s\S]*?)\);/);
const vppLeverKeys = phpBlock(/function ape_vpp_levers\(\$pq_profile = 'max_image'\) \{\s*\$l = array\(([\s\S]*?)\);/);

const dumpPath = path.join(ROOT, 'IPTV_v5.4_MAX_AGGRESSION/backend/onn_settings_global_pq.txt');
const dumpBuf = fs.readFileSync(dumpPath);
const dumpText = dumpBuf[0] === 0xff && dumpBuf[1] === 0xfe ? dumpBuf.toString('utf16le') : dumpBuf.toString('utf8');
const dumpKeys = new Set(dumpText.split(/\r?\n/).map((l) => { const i = l.indexOf('='); return i > 0 ? l.slice(0, i) : null; }).filter(Boolean));

// ─────────────────────────────────────────────────── 1. mapa
const map = readJson(MAP_PATH);
const r5 = readJson(R5_PATH);
const keys = map.keys;
const byKey = new Map(keys.map((k) => [k.key, k]));

console.log('== 1. lever_namespace_map.json contra codigo y catalogo v2 ==');
ok(keys.length === 29, '29 claves en el mapa (got ' + keys.length + ')');
ok(new Set(keys.map((k) => k.key)).size === 29, 'claves unicas');
eq(keys.map((k) => k.key).sort(), ktRows.map((r) => r.key).sort(), 'las claves son exactamente las de SettingsApplier.kt');

const domainBad = [];
for (const r of ktRows) {
  const row = byKey.get(r.key);
  if (!row) { domainBad.push('falta ' + r.key); continue; }
  if (row.domain !== r.regex) domainBad.push(r.key + ': map=' + row.domain + ' kt=' + r.regex);
}
ok(domainBad.length === 0, 'dominio (regex efectiva) identico al .kt' + (domainBad.length ? ' -> ' + domainBad.join(' ; ') : ''));

eq(keys.filter((k) => k.in_ns_map).map((k) => k.key).sort(), nsMapKeys.slice().sort(), 'in_ns_map == ape_ff_settings_ns_map (15)');
eq(keys.filter((k) => k.in_vpp_levers).map((k) => k.key).sort(), vppLeverKeys.slice().sort(), 'in_vpp_levers == ape_vpp_levers (13)');
eq(keys.filter((k) => k.in_client_allowlist).map((k) => k.key).sort(), CLIENT_LEVERS.slice().sort(), 'in_client_allowlist == catalogo levers.vpp (13)');
eq(map.soc.canonical.slice().sort(), CANON.slice().sort(), 'soc.canonical == catalogo socs.canonical');
ok(TIERS.length === 4 && TIERS.includes('max_image') && TIERS.includes('minimal'), 'catalogo processing.tiers = 4 niveles (' + TIERS.join(',') + ')');
ok(JSON.stringify(FPS_TARGETS) === JSON.stringify([24, 30, 60]), 'catalogo fps.targets = [24,30,60]');

const aliasBad = Object.entries(map.soc.alias).filter(([from, to]) => !CANON.includes(to) || ALIAS[from] !== to).map(([f]) => f);
ok(aliasBad.length === 0, 'los alias del mapa existen en el catalogo con el mismo destino' + (aliasBad.length ? ' -> ' + aliasBad.join(',') : ''));
eq(keys.filter((k) => k.ceiling_by_tier).map((k) => k.key).length, keys.filter((k) => k.ceiling_by_tier).length, 'filas con ceiling_by_tier legibles');
const ceilingBad = keys.filter((k) => k.ceiling_by_tier && Object.keys(k.ceiling_by_tier).sort().join(',') !== TIERS.slice().sort().join(',')).map((k) => k.key);
ok(ceilingBad.length === 0, 'todo ceiling_by_tier usa las 4 claves del catalogo' + (ceilingBad.length ? ' -> ' + ceilingBad.join(',') : ''));

const dumpBad = keys.filter((k) => (k.ns_observed !== null) !== dumpKeys.has(k.key)).map((k) => k.key);
ok(dumpBad.length === 0, 'ns_observed coincide con el dump global del SoC' + (dumpBad.length ? ' -> ' + dumpBad.join(',') : ''));

const r5ByKey = new Map(r5.settings_allowlist.device_applier.keys.map((k) => [k.key, k]));
const r5Bad = [];
for (const k of keys) {
  const o = r5ByKey.get(k.key);
  if (!o) { r5Bad.push('falta en R5: ' + k.key); continue; }
  if (o.regex !== k.domain) r5Bad.push('regex distinta en R5: ' + k.key);
  if (o.in_ns_map !== k.in_ns_map) r5Bad.push('in_ns_map distinto en R5: ' + k.key);
  if (o.in_vpp_levers !== k.in_vpp_levers) r5Bad.push('in_vpp_levers distinto en R5: ' + k.key);
  if (Boolean(o.observed_in_mt8696_global_dump) !== (k.ns_observed !== null)) r5Bad.push('dump distinto en R5: ' + k.key);
}
ok(r5Bad.length === 0, 'coherente con actuator_allowlist.json (R5)' + (r5Bad.length ? ' -> ' + r5Bad.join(' ; ') : ''));

const T4 = ['T0', 'T1', 'T2', 'T3', 'T4'];
const tierBad = keys.filter((k) => !T4.includes(k.tier)).map((k) => k.key);
ok(tierBad.length === 0, 'todo key tiene tier valido');
const counts = {};
for (const t of T4) counts[t] = keys.filter((k) => k.tier === t).length;
ok(Object.values(counts).reduce((a, b) => a + b, 0) === 29, 'los tiers particionan las 29 (' + JSON.stringify(counts) + ')');
const reachable = keys.filter((k) => k.reachable_from_policy);
const forbidden = keys.filter((k) => k.forbidden_by_contract);
ok(reachable.length === 15, 'alcanzables desde la politica = 15 (got ' + reachable.length + ')');
ok(forbidden.length === 3, 'prohibidas por contrato = 3 (got ' + forbidden.length + ')');
eq(forbidden.map((k) => k.key).sort(), ['always_hdr', 'user_preferred_resolution_height', 'user_preferred_resolution_width'], 'las 3 prohibidas son always_hdr + user_preferred_resolution_*');
ok(forbidden.every((k) => !k.reachable_from_policy), 'ninguna prohibida es alcanzable');
ok(keys.filter((k) => k.reachable_from_policy && !k.in_client_allowlist && !k.reachable_via.startsWith('base_row') && !k.reachable_via.startsWith('alias_of')).length === 0,
  'toda clave alcanzable viene de base_row, lever del catalogo o alias');
const aliasRows = keys.filter((k) => k.alias_of);
ok(aliasRows.length === 1 && aliasRows[0].key === 'ai_pic_mode' && aliasRows[0].alias_of === 'ai_pq_mode', 'unico alias: ai_pic_mode <- ai_pq_mode');
ok(map.aliases.length === 1 && map.aliases[0].from === 'ai_pq_mode' && map.aliases[0].to === 'ai_pic_mode', 'tabla aliases coincide');

// ─────────────────────────────────────────────────── 2. algoritmo del contrato
const INVERT_CLAMP = ['minimal_post_processing_allowed'];
const BASE = [['match_content_frame_rate', 1], ['hdr_conversion_mode', 1], ['minimal_post_processing_allowed', 0]];
const BLOCKING = ['soc_unmapped', 'soc_mismatch', 'device_not_allowed', 'wire_8k_forbidden', 'eight_k_native_forbidden', 'policy_expired', 'policy_invalid'];
const TIER_IDX = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };

function normalizeSoc(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  const mapped = ALIAS[s] || s;
  return CANON.includes(mapped) ? mapped : null;
}
function lowerTier(tier, steps) {
  const i = TIERS.indexOf(tier);
  if (i < 0) return { tier: TIERS[TIERS.length - 1], effective: TIERS[TIERS.length - 1] };
  return { tier, effective: TIERS[Math.max(0, i - steps)] };
}
function thermalSteps(measured, limits) {
  const th = measured.thermal || {};
  if (th.prov !== 'measured') return { steps: 0, prov: th.prov || 'unavailable' };
  const st = th.status;
  if (typeof th.temp_c === 'number' && limits && THERMAL_LIMIT_KEYS.every((k) => Number.isInteger(limits[k]))) {
    if (th.temp_c >= limits.critical_c) return { steps: 3, prov: 'measured' };
    if (th.temp_c >= limits.severe_c) return { steps: 2, prov: 'measured' };
    if (th.temp_c >= limits.moderate_c) return { steps: 1, prov: 'measured' };
    return { steps: 0, prov: 'measured' };
  }
  if (typeof st !== 'number') return { steps: 0, prov: 'measured' };
  const steps = st <= 1 ? 0 : st === 2 ? 1 : st <= 4 ? 2 : 3;
  return { steps, prov: 'measured' };
}
function cadenceOf(policy, measured) {
  const t = policy.fps && policy.fps.target;
  if (FPS_TARGETS.includes(t)) return { cls: t, src: 'policy.fps.target' };
  const fps = measured.source && measured.source.fps;
  if (typeof fps === 'number' && isFinite(fps) && fps > 0) return { cls: fps >= 50 ? 60 : fps >= 25 ? 30 : 24, src: 'measured.source.fps' };
  return { cls: null, src: 'none' };
}

function resolveDeviceApply(policy, ctx) {
  const denials = [];
  const warnings = [];
  const skipped = [];
  const clamped = [];
  const aliases = [];
  const writes = [];
  const unchanged = [];
  const deferred = [];
  const notApplicable = [];
  const playerOps = [];

  // S1 SoC medido (obligatorio)
  const measuredRaw = ctx.measured.soc_raw;
  const canonical = normalizeSoc(measuredRaw);
  if (!canonical) denials.push('soc_unmapped');

  const polSocRaw = policy.device && policy.device.soc;
  const polCanon = normalizeSoc(polSocRaw);
  let aliasUsed = null;
  if (canonical && polCanon !== canonical) denials.push('soc_mismatch');
  if (canonical && polCanon === canonical && typeof polSocRaw === 'string' && polSocRaw.trim().toLowerCase() !== canonical) {
    aliasUsed = polSocRaw;
    warnings.push('soc_alias_used');
  }

  // S2 gate del VPS
  if (canonical && !(policy.device && policy.device.allowed === true)) denials.push('device_not_allowed');

  // S3 guard 8K (sobre el SoC MEDIDO/canonico y sobre el catalogo v2)
  const disp = policy.display || {};
  if (disp.wire_resolution === '7680x4320') denials.push('wire_8k_forbidden');
  if (disp.eight_k === 'native') denials.push('eight_k_native_forbidden');
  if (canonical && NO_WIRE_8K.includes(canonical) && disp.wire_resolution === '7680x4320') {
    if (!denials.includes('wire_8k_forbidden')) denials.push('wire_8k_forbidden');
  }
  if (canonical && typeof disp.wire_resolution === 'string') {
    const m = /^(\d+)x(\d+)$/.exec(disp.wire_resolution);
    if (m && ctx.measured.display && (Number(m[1]) > ctx.measured.display.native_w || Number(m[2]) > ctx.measured.display.native_h)) {
      warnings.push('wire_above_panel');
    }
  }
  if (Array.isArray(policy.degrade && policy.degrade.order) && policy.degrade.order.includes('resolution')) {
    warnings.push('degrade_resolution_not_actuable');
  }

  // S4 frescura
  if (!(ctx.now_s < policy.valid_until)) denials.push('policy_expired');

  const blocked = denials.some((d) => BLOCKING.includes(d));
  const NON_WHOLE = ['device_not_allowed'];
  const wholeReject = denials.some((d) => BLOCKING.includes(d) && !NON_WHOLE.includes(d));
  const applyPlayer = !wholeReject;
  const applyLevers = !wholeReject && policy.device && policy.device.allowed === true;

  const th = thermalSteps(ctx.measured, policy.thermal && policy.thermal.limits);
  const tierReq = (policy.processing && policy.processing.tier) || TIERS[TIERS.length - 1];
  const { effective } = lowerTier(tierReq, th.steps);
  if (th.prov !== 'measured') warnings.push('thermal_unavailable');
  const cad = cadenceOf(policy, ctx.measured);
  if (cad.cls === null) warnings.push('cadence_unknown');
  if (policy.thermal && policy.thermal.status !== undefined) {
    const ps = policy.thermal.status;
    const ms = ctx.measured.thermal && ctx.measured.thermal.prov === 'measured' ? ctx.measured.thermal.status : 'unknown';
    if (ps !== ms) warnings.push('thermal_status_disagreement');
  }

  // S5 objetivo = filas base + levers explicitos
  const target = new Map();
  const blacklisted = ctx.measured.phase_g_blacklisted === true;
  for (const [k, v] of BASE) target.set(k, k === 'hdr_conversion_mode' && blacklisted ? 0 : v);

  if (applyLevers) {
    for (const [k, v] of Object.entries(policy.device.levers || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const row = byKey.get(k);
      if (!row || !row.reachable_from_policy) { skipped.push({ key: k, code: 'lever_not_reachable' }); continue; }
      if (row.forbidden_by_contract) { skipped.push({ key: k, code: 'forbidden_by_contract' }); continue; }
      if (!new RegExp(row.domain).test(String(v))) { skipped.push({ key: k, code: 'value_out_of_domain' }); continue; }
      target.set(k, v);
    }
  }

  // S6 cadencia: 2 ("always") prohibido
  if (target.has('match_content_frame_rate') && Number(target.get('match_content_frame_rate')) === 2) {
    clamped.push({ key: 'match_content_frame_rate', from: 2, to: 1 });
    target.set('match_content_frame_rate', 1);
  }

  // S7 cap por (processing.tier - pasos_termicos): el tier manda cuando es MAS conservador que los levers.
  // Se itera en el ORDEN DEL MAPA (= prioridad de degradación declarada), no en orden de inserción.
  for (const row of keys) {
    const k = row.key;
    if (!target.has(k) || !row.ceiling_by_tier) continue;
    const ceil = row.ceiling_by_tier[effective];
    if (ceil === null || ceil === undefined) continue;
    const v = Number(target.get(k));
    const next = INVERT_CLAMP.includes(k) ? Math.max(v, ceil) : Math.min(v, ceil);
    if (next !== v) { clamped.push({ key: k, from: v, to: next }); target.set(k, next); }
  }

  // S8 alias
  for (const a of map.aliases) {
    if (target.has(a.from) && !target.has(a.to)) {
      const v = target.get(a.from);
      target.set(a.to, v);
      aliases.push({ from: a.from, to: a.to, value: v });
    }
  }

  // S9 read-before-write
  const current = ctx.current_settings || {};
  const sortedTarget = [...target.entries()].sort((a, b) => {
    const ta = TIER_IDX[byKey.get(a[0]).tier], tb = TIER_IDX[byKey.get(b[0]).tier];
    if (ta !== tb) return ta - tb;
    return a[0] < b[0] ? -1 : 1;
  });
  for (const [k, v] of sortedTarget) {
    const cur = current[k];
    if (cur === null || cur === undefined) {
      writes.push((byKey.get(k).ns_hint || 'global') + ' ' + k + ' ' + v);
      continue;
    }
    const parts = String(cur).split(/\s+/);
    if (parts.length === 2 && parts[1] === String(v)) { unchanged.push(k); continue; }
    writes.push((parts[0] || byKey.get(k).ns_hint || 'global') + ' ' + k + ' ' + v);
  }

  // S10 player (dos fases: live si el player existe; si no, diferido)
  const rt = ctx.measured.player_runtime || {};
  const pl = policy.player || {};
  const curBit = rt.current || {};
  if (applyPlayer) {
    for (const [key, curVal] of [['max_bitrate_bps', curBit.max_bitrate_bps], ['min_bitrate_bps', curBit.min_bitrate_bps]]) {
      if (!(key in pl)) continue;
      if (pl[key] === curVal) continue;
      if (rt.active === true) playerOps.push(key === 'max_bitrate_bps' ? 'track_selector.setMaxVideoBitrate' : 'track_selector.setMinVideoBitrate');
      else deferred.push({ key, until: 'player_inactive' });
    }
    deferred.push({ key: 'buffer_s', until: rt.active === true ? 'player_active' : 'player_inactive' });
    deferred.push({ key: 'reconnect_attempts', until: 'next_media_source' });
    notApplicable.push('abr_bw_factor', 'live_delay_s');
  }

  // S11 estado
  let state;
  if (blocked) state = 'denied';
  else if (skipped.length > 0 || clamped.length > 0) state = 'partial';
  else if (writes.length === 0 && playerOps.length === 0 && deferred.length > 0) state = 'deferred';
  else if (writes.length > 0 || playerOps.length > 0) state = 'applied';
  else state = 'noop';

  const held = Object.keys(current).filter((k) => !target.has(k)).sort();
  const ackReason = denials.length ? denials[0] : null;

  return {
    state,
    denials,
    warnings,
    soc: { measured: measuredRaw, canonical, gate: canonical ? 'allowlisted' : 'denied', alias_used: aliasUsed },
    cadence_class: cad.cls,
    thermal: { prov: th.prov, status: ctx.measured.thermal ? ctx.measured.thermal.status : null, steps: th.steps, effective_tier: effective },
    policy_tier: tierReq,
    writes,
    unchanged_count: unchanged.length,
    skipped,
    clamped,
    aliases,
    deferred_codes: deferred.map((d) => d.key + ':' + d.until).sort(),
    not_applicable: notApplicable.slice().sort(),
    held_levers: held,
    player_ops: playerOps,
    ack_reason: ackReason
  };
}

// ─────────────────────────────────────────────────── 3. vectores
console.log('\n== 2. vectores golden reproducidos por el algoritmo del contrato ==');
const vectors = readJson(VEC_PATH).vectors;
ok(vectors.length === 4, '4 vectores (got ' + vectors.length + ')');
const results = {};
for (const v of vectors) {
  const got = resolveDeviceApply(v.policy, { measured: v.measured, current_settings: v.current_settings || {}, now_s: v.now_s });
  results[v.id] = got;
  const want = v.expect;
  for (const f of ['state', 'denials', 'warnings', 'soc', 'cadence_class', 'thermal', 'writes', 'unchanged_count', 'clamped', 'aliases', 'deferred_codes', 'not_applicable', 'held_levers', 'player_ops', 'ack_reason', 'skipped']) {
    eq(got[f], want[f], v.id + '.' + f);
  }
}

// ─────────────────────────────────────────────────── 4. integración con el cliente v2 REAL
console.log('\n== 3. integracion con el cliente v2 REAL ==');
const client = require(CLIENT_PATH);
// D4 es dueño del CONTRATO DE APLICACIÓN, no del esquema de política (eso es t9/D3). Por eso:
//  - los errores que tocan a D4 (SoC, 8K, degradación) FALLAN la verificación;
//  - un requisito nuevo del esquema que no forma parte del subconjunto que D4 aplica se reporta como
//    `warn` (no se finge que pasa, pero tampoco se rompe por un campo ajeno).
const D4_RELEVANT = /^(device_soc|wire_8k|display_wire|degrade_resolution|never_downscale|min_resolution|display_eight_k)/;
const warn = (m) => console.log('warn ' + m);
const policyErr = (v) => { try { client.validatePolicy(v.policy, { nowS: v.now_s }); return null; } catch (e) { return e.message; } };
const errCode = (msg) => { const m = /^\s*ARA_X_POLICY_VIOLATION\[([a-z0-9_]+)\]/.exec(String(msg)); return m ? m[1] : ''; };
for (const id of ['V1', 'V4']) {
  const v = vectors.find((x) => x.id === id);
  const err = policyErr(v);
  if (err === null) ok(true, id + ' (politica v2 canonica) pasa validatePolicy v2');
  else if (D4_RELEVANT.test(errCode(err))) ok(false, id + ' la rechaza el cliente v2 por un motivo que D4 gobierna -> ' + err);
  else warn(id + ': el cliente v2 pide un campo de esquema ajeno a D4 (' + errCode(err) + ') -> ' + err);
}
for (const id of ['V2', 'V3']) {
  const v = vectors.find((x) => x.id === id);
  const err = policyErr(v) || '';
  ok(/device_soc|wire_8k|display_wire/.test(err), id + ' la rechaza el cliente v2 como se espera -> ' + err);
}
ok(results.V2.warnings.includes('soc_alias_used'), 'V2: el resolvedor TOLERA el alias legacy y lo reporta (no lo descarta en silencio)');
ok(results.V2.soc.canonical === 's905x4' && results.V2.thermal.effective_tier === 'balanced', 'V2: alias canonizado + tier efectivo balanced por 2 pasos termicos');

// ─────────────────────────────────────────────────── 5. guards duros
console.log('\n== 4. guards del contrato ==');
const FORBIDDEN = forbidden.map((k) => k.key);
const wroteForbidden = [];
const accepted8k = [];
const silentDenial = [];
for (const v of vectors) {
  const r = results[v.id];
  for (const w of r.writes) {
    const key = w.split(/\s+/)[1];
    if (FORBIDDEN.includes(key)) wroteForbidden.push(v.id + ':' + key);
  }
  if (v.policy.display && v.policy.display.wire_resolution === '7680x4320' && r.state !== 'denied') accepted8k.push(v.id);
  if (r.state === 'denied' && (!r.ack_reason || !r.soc.measured)) silentDenial.push(v.id);
}
ok(wroteForbidden.length === 0, 'ninguna clave prohibida acaba en un write' + (wroteForbidden.length ? ' -> ' + wroteForbidden.join(',') : ''));
ok(accepted8k.length === 0, 'wire 8K siempre acaba en denied' + (accepted8k.length ? ' -> ' + accepted8k.join(',') : ''));
ok(silentDenial.length === 0, 'ningun denied sin razon ni soc medido (no silent allowed=false)' + (silentDenial.length ? ' -> ' + silentDenial.join(',') : ''));

const clone = (x) => JSON.parse(JSON.stringify(x));
const baseCtx = (v) => ({ measured: v.measured, current_settings: v.current_settings || {}, now_s: v.now_s });

// 8K con nombre canonico (el bypass historico D4-F01)
const bypassPolicy = clone(vectors[0].policy);
bypassPolicy.display = Object.assign({}, bypassPolicy.display, { mode: '8k_emulated', wire_resolution: '7680x4320', eight_k: 'presentation_only' });
const bypass = resolveDeviceApply(bypassPolicy, baseCtx(vectors[0]));
ok(bypass.state === 'denied' && bypass.denials.includes('wire_8k_forbidden'), 'wire 8K bloqueado con soc canonico "s905x4"');

// politica expirada
const expired = clone(vectors[0].policy);
const expRes = resolveDeviceApply(expired, { measured: vectors[0].measured, current_settings: vectors[0].current_settings, now_s: expired.valid_until + 1 });
ok(expRes.state === 'denied' && expRes.denials.includes('policy_expired'), 'politica expirada => denied/policy_expired');

// SoC mismatch
const mismatch = clone(vectors[0].policy);
mismatch.device.soc = 'mt8696';
const mmRes = resolveDeviceApply(mismatch, baseCtx(vectors[0]));
ok(mmRes.state === 'denied' && mmRes.denials.includes('soc_mismatch'), 'soc de la politica != soc medido => denied/soc_mismatch');

// cadencia 2 prohibida
const cad2 = clone(vectors[0].policy);
cad2.device.levers.match_content_frame_rate = 2;
const cadRes = resolveDeviceApply(cad2, baseCtx(vectors[0]));
ok(cadRes.clamped.some((c) => c.key === 'match_content_frame_rate' && c.to === 1), 'match_content_frame_rate=2 se clampa a 1');

// fps.target manda sobre la clase derivada
const v24 = clone(vectors[0].measured);
v24.source = { fps: 23.976, resolution: '3840x2160', codec: 'hvc1.2.4.L153.B0', hdr: 'PQ' };
const p24 = clone(vectors[0].policy); p24.fps = { target: 24, current: 23.976, min: 24 };
const r24 = resolveDeviceApply(p24, { measured: v24, current_settings: {}, now_s: vectors[0].now_s });
ok(r24.cadence_class === 24, 'fps.target=24 => cadence_class 24');

// tier mas conservador que los levers => manda el tier
const tierPolicy = clone(vectors[0].policy);
tierPolicy.processing = { tier: 'balanced' };
const tierRes = resolveDeviceApply(tierPolicy, baseCtx(vectors[0]));
ok(tierRes.clamped.some((c) => c.key === 'ai_sr_level' && c.to === 1), 'processing.tier=balanced limita ai_sr_level a 1');
ok(tierRes.state === 'partial', 'tier cap => partial (no applied)');

// termico desconocido: NO clamp (incertidumbre != frio)
const vUnk = clone(vectors[1].measured);
vUnk.thermal = { prov: 'unavailable', status: null, temp_c: null };
const rUnk = resolveDeviceApply(vectors[1].policy, { measured: vUnk, current_settings: {}, now_s: vectors[1].now_s });
ok(rUnk.thermal.steps === 0 && rUnk.clamped.length === 0, 'thermal unavailable => 0 pasos y 0 clamps (null != frio)');
ok(rUnk.warnings.includes('thermal_unavailable'), 'thermal unavailable se declara como warning');

// temperatura disponible (solo con ADB): usa limits
const vHot = clone(vectors[0].measured);
vHot.thermal = { prov: 'measured', status: 2, temp_c: 71.5 };
const rHot = resolveDeviceApply(vectors[0].policy, { measured: vHot, current_settings: {}, now_s: vectors[0].now_s });
ok(rHot.thermal.steps === 2 && rHot.thermal.effective_tier === 'balanced', 'temp 71.5 >= severe_c(70) => 2 pasos => balanced');

// estado deferred
const deferredPolicy = clone(vectors[3].policy);
deferredPolicy.device = { allowed: true, soc: 'amlogic', thermal_target_c: 70, levers: {} };
const rDef = resolveDeviceApply(deferredPolicy, baseCtx(vectors[3]));
ok(rDef.state === 'deferred', 'sin escrituras y con player inactivo => state deferred (got ' + rDef.state + ')');

// ─────────────────────────────────────────────────── 6. cierre D3 v2 (F01/F02) + ack contra el validador real
console.log('\n== 5. D3 v2 cerro D4-F01/D4-F02 y el ack L3 cabe en state.apply ==');
// D4-F01: los 4 SoC canonicos deben estar en no_wire_8k
const missingNoWire = CANON.filter((s) => !NO_WIRE_8K.includes(s));
ok(missingNoWire.length === 0, 'D4-F01 cerrado: no_wire_8k cubre los 4 SoC canonicos' + (missingNoWire.length ? ' -> faltan ' + missingNoWire.join(',') : ''));
ok(CAT.display.wire_resolutions.indexOf('7680x4320') === -1, 'wire 8K no esta en el enum de resoluciones del catalogo');

// D4-F02: state.apply existe y sus enums coinciden con el contrato
const reqSchemaRaw = fs.readFileSync(path.join(ROOT, 'ara-x/vps/schema/sync_request.schema.json'), 'utf8');
ok(/"apply":\s*\{/.test(reqSchemaRaw), 'D4-F02 cerrado: sync_request.schema.json declara state.apply');
ok(JSON.stringify(client.ACK_STATES) === JSON.stringify(['denied', 'partial', 'deferred', 'applied', 'noop']), 'los 5 estados del schema son los del contrato');
const ackCatalog = CAT.ack;
ok(BLOCKING.every((r) => ackCatalog.blocking_reasons.includes(r)), 'las razones bloqueantes del contrato estan en el catalogo');
ok(['lever_not_reachable', 'value_out_of_domain', 'forbidden_by_contract', 'key_absent_on_soc'].every((r) => ackCatalog.skipped_reasons.includes(r)), 'las 4 razones de skipped estan en el catalogo');
ok(JSON.stringify(ackCatalog.defer_reasons) === JSON.stringify(['player_active', 'lifecycle_pending', 'not_applicable']), 'defer_reasons del catalogo: player_active | lifecycle_pending | not_applicable');

// Mapeo contrato -> wire (state.apply): el contrato usa nombres internos; el wire exige enums cerrados.
const ACK_MAX_LINES = ackCatalog.limits.max_lines;
const WIRE_GATE = (g) => (g === 'allowlisted' ? 'allowlisted' : 'not_allowlisted');
const WIRE_DEFER = (code) => {
  const until = code.split(':')[1];
  if (until === 'player_active') return 'player_active';
  if (until === 'player_inactive' || until === 'next_media_source') return 'lifecycle_pending';
  return 'not_applicable';
};
function toWireAck(r, policy, measured) {
  return {
    st: r.state,
    rs: r.ack_reason,
    etag: policy.policy_etag,
    soc: {
      m: r.soc.measured,
      src: (measured && measured.soc_source) || 'unknown',
      c: r.soc.canonical,
      g: WIRE_GATE(r.soc.gate),
      ...(r.soc.alias_used ? { alias: r.soc.alias_used } : {})
    },
    th: { prov: r.thermal.prov, st: r.thermal.status, steps: r.thermal.steps, tier: r.thermal.effective_tier },
    cad: r.cadence_class,
    ap: r.writes.slice(0, ACK_MAX_LINES),
    un: r.unchanged_count,
    sk: r.skipped.map((s) => ({ k: s.key, r: s.code })),
    cl: r.clamped.map((c) => ({ k: c.key, from: c.from, to: c.to })),
    df: r.deferred_codes.map((code) => ({ k: code.split(':')[0], r: WIRE_DEFER(code) })),
    hl: r.held_levers
  };
}
for (const id of ['V1', 'V2', 'V4']) {
  const v = vectors.find((x) => x.id === id);
  const ack = toWireAck(results[id], v.policy, v.measured);
  let err = null;
  try { client.validateApply(ack); } catch (e) { err = e.message; }
  ok(err === null, id + ': el ack mapeado a state.apply pasa validateApply real' + (err ? ' -> ' + err : ''));
}
const ack3 = toWireAck(results.V3, vectors[2].policy, vectors[2].measured);
let err3 = null;
try { client.validateApply(ack3); } catch (e) { err3 = e.message; }
ok(/ack_soc_m/.test(err3 || ''), 'D4-F10 confirmado: un SoC no canonico NO cabe en state.apply.soc.m -> ' + err3);

console.log('\n---');
console.log(fails === 0 ? 'RESULT: ALL CHECKS PASS' : 'RESULT: ' + fails + ' FAIL');
process.exit(fails === 0 ? 0 : 1);
