'use strict';
/**
 * D2 verifier — reproduces the contract `ara-x/spec/ara_x_codec_policy.md`.
 *
 * Runs the reference implementation of the policy against:
 *   - ara-x/spec/ara_x_codec_policy.schema.json   (schema of the decision object)
 *   - ara-x/spec/ara_x_codec_cases.json           (36 cases: 33 decision + aggregate 10.631 + idempotence + URL)
 * and checks POL-1..POL-12 on every decision, 300 synthetic states, schema validity,
 * determinism (byte-identical double run) and the NEVER-DROP aggregate.
 *
 * Usage (from any cwd):
 *   node ara-x/scripts/d2_check_codec_policy.js
 * Expected output:
 *   D2 codec policy: 1435 PASS · 0 FAIL · casos=36 · sinteticos=300
 *   ALL_OK
 * Exit code: 0 = PASS, 1 = at least one failure.
 *
 * Read-only: does not modify the contract files. It is the persisted form of the
 * `<tmp>/d2_check.js` command cited in the contract §14. Same pattern as
 * ara-x/scripts/r5_check_actuators.js (R5).
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..'); // repo root: ara-x/scripts -> ara-x -> repo
const { validate } = require(path.join(ROOT, 'ara-x', 'tests', 'helpers', 'mini_schema.js'));

const SPEC = 'ara-x-codec-policy.v1';
const CANON = ['mt8696', 'amlogic', 's905x4', 's905x3'];
const ALIAS = {
  amlogic_s905x4: 's905x4', 'amlogic-s905x4': 's905x4', s905x4_amlogic: 's905x4',
  amlogic_s905x3: 's905x3', 'amlogic-s905x3': 's905x3', s905x3_amlogic: 's905x3',
  firetv_mt8696: 'mt8696', mediatek_mt8696: 'mt8696'
};
const FPS_SET = [24, 25, 30, 50, 60];
const AUDIO = ',mp4a.40.2';

function familyFromCodec(s) {
  const v = String(s || '').toLowerCase();
  if (/^hvc1|^hev1/.test(v)) return 'hevc';
  if (/^avc1|^avc3/.test(v)) return 'h264';
  if (/^av01/.test(v)) return 'av1';
  if (/^vp09/.test(v)) return 'vp9';
  return null;
}
function levelFromCodec(s) {
  const v = String(s || '');
  let m = /\.L(\d{3})\./.exec(v);
  if (m) return Number(m[1]);
  m = /^avc1\.[0-9a-fA-F]{2}[0-9a-fA-F]{2}([0-9a-fA-F]{2})/.exec(v);
  if (m) return parseInt(m[1], 16);
  return null;
}
function canonicalSoc(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (CANON.includes(s)) return { soc: s, reason: 'soc_allowlisted', allowed: true, flag: null };
  if (ALIAS[s]) return { soc: ALIAS[s], reason: 'soc_alias_used', allowed: true, flag: 'soc_alias_used' };
  if (s === 'unknown' || s === '') return { soc: 'unknown', reason: 'soc_unknown', allowed: false, flag: 'soc_unknown' };
  return { soc: 'unknown', reason: 'soc_not_allowlisted', allowed: false, flag: 'soc_not_allowlisted' };
}
function codecFor(fam, res, fps) {
  if (fam === 'hevc') {
    if (res === '3840x2160') return fps <= 30 ? { codec: 'hvc1.2.4.L150.B0', level: 150 } : { codec: 'hvc1.2.4.L153.B0', level: 153 };
    if (res === '1920x1080') return fps >= 50 ? { codec: 'hvc1.2.4.L123.B0', level: 123 } : { codec: 'hvc1.2.4.L120.B0', level: 120 };
    if (res === '1280x720') return { codec: 'hvc1.2.4.L93.B0', level: 93 };
    return null;
  }
  if (fam === 'h264') {
    if (res === '3840x2160') return fps <= 30 ? { codec: 'avc1.640033', level: 51 } : null;
    if (res === '1920x1080') return fps >= 50 ? { codec: 'avc1.64002A', level: 42 } : { codec: 'avc1.640028', level: 40 };
    if (res === '1280x720') return { codec: 'avc1.640028', level: 40 };
    return null;
  }
  if (fam === 'av1') {
    if (res === '3840x2160') return { codec: 'av01.0.13M.10', level: null };
    return { codec: 'av01.0.08M.08', level: null };
  }
  return null; // vp9 and unknown: no public codec (fail-closed)
}
function uniq(a) { return [...new Set(a)]; }

function decide(input) {
  const flags = [];
  const markers = [];
  const F = (f) => flags.push(f);

  const socInfo = canonicalSoc(input.soc_raw);
  if (socInfo.flag) F(socInfo.flag);
  const socOk = socInfo.allowed;

  let fam = input.source_family || 'unknown';
  const probeFam = familyFromCodec(input.probe_codec_string);
  let probeVerified = false;
  if (probeFam) {
    if (probeFam !== fam) F('family_fixed');
    fam = probeFam;
    probeVerified = true;
  }
  const declaredFam = familyFromCodec(input.declared && input.declared.codecs);
  if (declaredFam && declaredFam !== fam) F('declared_codec_mismatch');

  const cascade = input.cascade_type === 'dual-hvc1-hev1';
  if (cascade) F('cascade_verified');

  // ── fps ──────────────────────────────────────────────────────────────
  let fps, fpsKind;
  if (FPS_SET.includes(input.measured_fps)) { fps = input.measured_fps; fpsKind = 'measured'; }
  else if (FPS_SET.includes(input.declared && input.declared.frame_rate)) { fps = input.declared.frame_rate; fpsKind = 'declared'; }
  else { fps = 30; fpsKind = 'default'; }
  if (input.measured_fps === 120) { fps = 60; fpsKind = 'measured'; F('fps_clamped_120'); }
  const ceiling = socOk ? 60 : 30;
  if (fps > ceiling) { fps = Math.min(fps, ceiling); F('fps_clamped_soc'); }

  // ── resolution + 8K ──────────────────────────────────────────────────
  const eightKDeclared = input.declared && input.declared.resolution === '7680x4320';
  const eightKSrc = input.source_resolution === '7680x4320';
  const eightKReq = Boolean(input.requested_8k) || eightKDeclared || eightKSrc;
  if (eightKReq) F('wire_8k_suppressed');

  let srcRes = input.source_resolution || 'unknown';
  const srcCapped = srcRes === '7680x4320';
  if (srcCapped) srcRes = '3840x2160';

  const tier = input.evidence_tier;
  let res = null, resKind = 'none', pres = false, capped = false;

  if (tier === 'F5') {
    res = null; resKind = 'none';
  } else if (fam === 'unknown') {
    res = null; resKind = 'unknown'; F('codec_unknown');
  } else if (srcRes === 'unknown') {
    res = null; resKind = 'unknown';
  } else if (srcCapped) {
    res = '3840x2160'; resKind = 'capped'; capped = true;
  } else if (socOk && srcRes !== '3840x2160') {
    const cand = codecFor(fam, '3840x2160', fps);
    if (cand) { res = '3840x2160'; resKind = 'presentation'; pres = true; F('presentation_marked'); }
    else { res = srcRes; resKind = 'native'; F('presentation_blocked_level'); }
  } else {
    res = srcRes; resKind = 'native';
  }

  // ── codec + mode ─────────────────────────────────────────────────────
  let mode, codec = null, level = null;
  const realRes = srcCapped ? '3840x2160' : srcRes;
  if (tier === 'F5') {
    mode = 'PASSTHROUGH_F5';
  } else if (fam === 'unknown' || fam === 'vp9') {
    mode = socOk ? 'TRUTHFUL_SIGNAL' : 'TRUTHFUL_ONLY';
    F('truthful_signal');
    if (fam === 'vp9') F('codec_family_unverified');
  } else {
    if (!socOk) { mode = 'TRUTHFUL_ONLY'; F('truthful_only'); }
    else if (tier === 'F0' && probeVerified) { mode = 'NATIVE_VERIFIED'; F('probe_verified'); }
    else if (cascade && fam === 'hevc' && !probeVerified) { mode = 'DAEMON_VERIFIED'; }
    else { mode = 'TRUTHFUL_SIGNAL'; F('truthful_signal'); }
  }

  if (mode !== 'PASSTHROUGH_F5' && fam !== 'unknown' && fam !== 'vp9' && res) {
    let c = codecFor(fam, res, fps);
    if (!c && res === '3840x2160' && fam === 'h264') { fps = 30; c = codecFor(fam, res, fps); F('fps_clamped_avc_4k60'); }
    if (c) { codec = c.codec; level = c.level; }
  }

  // level law: declared level < computed level for same family -> level_fixed
  if (codec && declaredFam === fam) {
    const dl = levelFromCodec(input.declared && input.declared.codecs);
    if (dl != null && level != null && dl < level) F('level_fixed');
  }

  // ── markers ──────────────────────────────────────────────────────────
  if (codec) {
    markers.push('#EXT-X-APE-CODEC-VERIFIED:' + (mode === 'NATIVE_VERIFIED' ? 'true' : 'false'));
    const pref = codecFor(fam, realRes, fps);
    if (pref) markers.push('#EXT-X-APE-CODEC-PREFERRED:' + pref.codec);
  }
  if (pres) {
    markers.push('#EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;mode=4k;src=' + srcRes + ';can8k=0');
  }
  if (eightKReq) markers.push('#EXT-X-APE-8KFAKE:ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY');

  // ── HDR ──────────────────────────────────────────────────────────────
  let thermalBase = 0, thermalTier = 'T2', fpsStep = 0, thermalReason = 'thermal_unavailable', status = input.thermal_status;
  if (status === 'unknown' || status == null) {
    F('thermal_unavailable'); thermalBase = 0; thermalTier = 'T2'; fpsStep = 0;
  } else {
    thermalReason = 'thermal_measured';
    if (status <= 1) { thermalTier = 'T3'; thermalBase = 0; fpsStep = 0; }
    else if (status === 2) { thermalTier = 'T2'; thermalBase = 1; fpsStep = 0; }
    else if (status <= 4) { thermalTier = 'T1'; thermalBase = 3; fpsStep = 1; }
    else { thermalTier = 'T0'; thermalBase = 6; fpsStep = 2; }
  }
  const fpsApplied = input.player_has_selector !== false;
  let post = thermalBase;
  if (!fpsApplied && fpsStep > 0) { F('fps_unavailable'); post = Math.max(post, Math.min(2 * fpsStep, 9)); }
  if (Number(input.external_post_step) > 0) post = Math.max(post, Number(input.external_post_step));

  const hdrHint = post >= 8 ? 'SDR' : 'PQ';
  if (post >= 8) F('pq_rollback');
  if (hdrHint === 'PQ') markers.push('#EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0');

  const hdr = Object.assign({ max_cll: 400, max_fall: 100, avg: 1000, peak: 400, dv_requested: false }, input.hdr || {});
  if (Number(hdr.max_fall) > Number(hdr.max_cll)) {
    F('hdr_metadata_fixed');
    markers.push('#EXT-X-APE-HDR-MAXFALL:' + Number(hdr.max_cll));
  }
  if (hdr.dv_requested) F('dv_without_codec');

  // ── qoe / knobs ──────────────────────────────────────────────────────
  const qoe = input.qoe || {};
  if (qoe.observed === false) F('qoe_unknown');
  if (qoe.modeled_only === true) F('modeled_not_measured');
  if (input.variant_present === false) F('channels_without_variant');
  if (input.declared_url) F('url_not_in_decision');

  const kIn = input.player_knobs || {};
  const knobs = {
    vlc_adaptive_maxwidth: Math.min(3840, Number.isFinite(kIn.vlc_maxwidth) ? kIn.vlc_maxwidth : 3840),
    vlc_adaptive_maxheight: Math.min(2160, Number.isFinite(kIn.vlc_maxheight) ? kIn.vlc_maxheight : 2160),
    vlc_vrr_max: Math.min(60, Number.isFinite(kIn.vlc_vrr_max) ? kIn.vlc_vrr_max : 60),
    vlc_video_fps: Math.min(fps, 60),
    vlc_minterpolate_fps: 0,
    kodi_video_codec: fam === 'hevc' ? 'hvc1' : fam === 'h264' ? 'h264' : fam === 'av1' ? 'av1' : fam === 'vp9' ? 'vp9' : 'none'
  };
  if (Number(kIn.vlc_maxwidth) !== knobs.vlc_adaptive_maxwidth || Number(kIn.vlc_maxheight) !== knobs.vlc_adaptive_maxheight ||
      Number(kIn.vlc_vrr_max) !== knobs.vlc_vrr_max || Number(kIn.vlc_minterpolate_fps) !== 0) F('knobs_clamped');
  if (Number(kIn.vlc_video_fps) !== knobs.vlc_video_fps) F('fps_fixed');

  const tierName = post === 0 ? 'max_image' : post <= 3 ? 'quality' : post <= 6 ? 'balanced' : 'minimal';
  const fcReasons = [];
  if (socInfo.reason === 'soc_unknown') fcReasons.push('soc_unknown');
  if (socInfo.reason === 'soc_not_allowlisted') fcReasons.push('soc_not_allowlisted');
  if (fam === 'unknown') fcReasons.push('family_unknown');
  if (tier === 'F5') fcReasons.push('tier_f5');
  const fcActive = !socOk || fam === 'unknown' || tier === 'F5';

  const reason = mode === 'PASSTHROUGH_F5' ? 'passthrough_f5'
    : mode === 'NATIVE_VERIFIED' ? 'probe_verified'
    : mode === 'DAEMON_VERIFIED' ? 'cascade_verified'
    : fam === 'unknown' ? 'codec_unknown'
    : !socOk ? (socInfo.reason === 'soc_unknown' ? 'soc_unknown' : 'soc_not_allowlisted')
    : pres ? 'presentation_4k_truthful_codec'
    : 'truthful_family';

  return {
    spec: SPEC,
    channel: {
      id: String(input.channel_id || 'unknown'),
      evidence_tier: tier,
      source_family: input.source_family || 'unknown',
      source_resolution: input.source_resolution || 'unknown',
      measured_fps: input.measured_fps == null ? null : input.measured_fps,
      cascade,
      probe_verified: probeVerified
    },
    wire: {
      mode, resolution: res, resolution_kind: resKind,
      video_codec: codec, codecs: codec ? codec + AUDIO : null,
      video_range: hdrHint, video_range_kind: hdrHint === 'PQ' ? 'display_intent' : 'none',
      frame_rate: fps, frame_rate_kind: fpsKind,
      supplemental_codecs: null, level_idc: level, reason
    },
    markers: uniq(markers).slice(0, 6),
    device: { allowed: socOk, soc: socInfo.soc, reason: socInfo.reason },
    display: {
      mode: res === '3840x2160' ? '4k' : 'native',
      wire_resolution: '3840x2160',
      min_resolution: '3840x2160',
      never_downscale: true,
      eight_k: 'presentation_only',
      hdr_hint: hdrHint
    },
    fps: { target: [60, 30, 24][fpsStep], current: input.measured_fps == null ? null : input.measured_fps, min: 24, step: fpsStep, applied: fpsApplied },
    processing: { tier: tierName, post_step: post },
    degrade: { order: ['fps', 'processing'], resolution: 'forbidden' },
    knobs,
    thermal: { status: status == null ? 'unknown' : status, tier: thermalTier, clamps: thermalBase, reason: thermalReason },
    flags: uniq(flags).filter((f) => /^[a-z0-9_]+$/.test(f)).slice(0, 16),
    fail_closed: { active: fcActive, reasons: uniq(fcReasons).slice(0, 4) }
  };
}

// ── verifier ─────────────────────────────────────────────────────────────
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'ara-x', 'spec', 'ara_x_codec_policy.schema.json'), 'utf8'));
const casesDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'ara-x', 'spec', 'ara_x_codec_cases.json'), 'utf8'));
const base = casesDoc.default_input;
const deep = (a, b) => {
  const o = Object.assign({}, a);
  for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deep(a[k] || {}, b[k]) : b[k];
  return o;
};
const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let pass = 0, fail = 0;
const failures = [];
function check(caseId, name, cond, detail) {
  if (cond) { pass++; return; }
  fail++; failures.push(caseId + ' ' + name + (detail ? ' :: ' + detail : ''));
}

const decisions = new Map();
for (const c of casesDoc.cases) {
  const input = deep(base, c.input || {});
  const d = decide(input);
  decisions.set(c.id, { input, d });
  if (c.kind === 'aggregate') {
    let n = 0;
    const d1 = decide(Object.assign({}, input, { channel_id: '904505' }));
    for (let i = 0; i < 10631; i++) {
      const dd = decide(Object.assign({}, input, { channel_id: String(100000 + i) }));
      if (dd && dd.channel && dd.channel.id) n++;
    }
    check(c.id, 'aggregate channels', n === 10631 && d1.channel.id === '904505', String(n));
    continue;
  }
  if (c.kind === 'idempotence') {
    const a = JSON.stringify(decide(input)), b = JSON.stringify(decide(input));
    check(c.id, 'idempotent', a === b);
    continue;
  }
  const errs = validate(d, schema);
  check(c.id, 'schema', errs.length === 0, errs.join(' | '));
  if (c.expect) {
    for (const key of Object.keys(c.expect)) {
      if (key === 'flags_include') {
        for (const f of c.expect[key]) check(c.id, 'flag ' + f, d.flags.includes(f), d.flags.join(','));
      } else if (key === 'markers_include') {
        for (const m of c.expect[key]) check(c.id, 'marker ' + m.slice(0, 34), d.markers.includes(m), d.markers.join(' | '));
      } else if (key === 'no_url_in_output') {
        check(c.id, 'no url', !/us3r|p4ss|example\.invalid|https?:\/\//.test(JSON.stringify(d)));
      } else {
        const keys = key.split('.');
        for (const sub of Object.keys(c.expect[key])) {
          const got = get(d, key + '.' + sub);
          check(c.id, key + '.' + sub, eq(got, c.expect[key][sub]), JSON.stringify(got));
        }
        if (keys.length > 1 && Object.keys(c.expect[key]).length === 0) check(c.id, key, false, 'empty expect');
      }
    }
  }
  // POL invariants on every decision
  check(c.id, 'POL-1 codec truth', !d.wire.codecs || (d.wire.video_codec && d.channel.source_family !== 'unknown' || d.wire.mode === 'DAEMON_VERIFIED') || d.wire.video_codec === null);
  check(c.id, 'POL-2 no hvc1 over avc', !(String(d.wire.video_codec || '').startsWith('hvc1') && d.channel.source_family === 'h264' && d.wire.mode !== 'DAEMON_VERIFIED'));
  check(c.id, 'POL-3 no wire 8k', d.wire.resolution !== '7680x4320' && (d.wire.level_idc == null || d.wire.level_idc <= 153) && !['8k_emulated', '8k'].includes(d.display.mode));
  check(c.id, 'POL-5 floor witness', d.display.min_resolution === '3840x2160' && d.display.never_downscale === true);
  check(c.id, 'POL-6 degrade', eq(d.degrade, { order: ['fps', 'processing'], resolution: 'forbidden' }));
  check(c.id, 'POL-7 fail-closed soc', d.device.allowed === true ? true : (d.wire.mode === 'TRUTHFUL_ONLY' || d.wire.mode === 'PASSTHROUGH_F5' || d.wire.mode === 'TRUTHFUL_SIGNAL'));
  check(c.id, 'POL-8 null thermal', d.thermal.status !== 'unknown' || d.thermal.clamps === 0);
  check(c.id, 'POL-12 hdr coherence', (d.wire.video_range === 'PQ') === (d.display.hdr_hint === 'PQ'));
  check(c.id, 'no URL ever', !/https?:\/\/|us3r|p4ss/.test(JSON.stringify(d)));
  // POL-4 level law (HEVC/AVC families)
  if (d.wire.level_idc != null && d.wire.resolution) {
    const need = { '3840x2160': { lte30: 150, gt30: 153 }, '1920x1080': { lte30: 120, gt30: 123 }, '1280x720': { lte30: 93, gt30: 93 } }[d.wire.resolution];
    const isAvc = String(d.wire.video_codec).startsWith('avc1');
    if (need && !isAvc) check(c.id, 'POL-4 level law', d.wire.level_idc >= (d.wire.frame_rate > 30 ? need.gt30 : need.lte30), d.wire.level_idc + ' @ ' + d.wire.resolution + '/' + d.wire.frame_rate);
    if (isAvc) {
      const ok = d.wire.resolution === '3840x2160' ? d.wire.level_idc === 51 && d.wire.frame_rate <= 30
        : d.wire.resolution === '1920x1080' ? (d.wire.frame_rate > 30 ? d.wire.level_idc === 42 : d.wire.level_idc === 40) : d.wire.level_idc === 40;
      check(c.id, 'POL-4 avc level law', ok, d.wire.level_idc + ' @ ' + d.wire.resolution + '/' + d.wire.frame_rate);
    }
  }
}

// 300 synthetic states: schema + invariants + determinism
let synth = 0;
const tiers = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5'];
const fams = ['hevc', 'h264', 'av1', 'vp9', 'unknown'];
const res = ['3840x2160', '1920x1080', '1280x720', '7680x4320', 'unknown'];
const fpss = [24, 25, 30, 50, 60, 120, null];
const socs = ['s905x4', 'amlogic_s905x4', 'firetv_mt8696', 'unknown', 'rk3588'];
const therms = [0, 1, 2, 3, 4, 5, 6, 'unknown'];
for (let i = 0; i < 300; i++) {
  const input = deep(base, {
    evidence_tier: tiers[i % tiers.length],
    source_family: fams[(i * 3) % fams.length],
    source_resolution: res[(i * 5) % res.length],
    measured_fps: fpss[(i * 7) % fpss.length],
    soc_raw: socs[(i * 11) % socs.length],
    thermal_status: therms[(i * 13) % therms.length],
    player_has_selector: i % 3 !== 0,
    requested_8k: i % 17 === 0,
    cascade_type: i % 4 === 0 ? 'dual-hvc1-hev1' : null
  });
  const d = decide(input);
  const errs = validate(d, schema);
  if (errs.length) { fail++; failures.push('SYNTH' + i + ' schema ' + errs.join('|')); } else pass++;
  const a = JSON.stringify(d), b = JSON.stringify(decide(input));
  if (a !== b) { fail++; failures.push('SYNTH' + i + ' non-deterministic'); } else pass++;
  if (d.wire.resolution === '7680x4320' || (d.wire.level_idc && d.wire.level_idc > 153)) { fail++; failures.push('SYNTH' + i + ' 8k/level'); } else pass++;
  synth++;
}

console.log('D2 codec policy: ' + pass + ' PASS · ' + fail + ' FAIL · casos=' + casesDoc.cases.length + ' · sinteticos=' + synth);
if (fail) { console.log(failures.slice(0, 40).join('\n')); process.exit(1); }
console.log('ALL_OK');
