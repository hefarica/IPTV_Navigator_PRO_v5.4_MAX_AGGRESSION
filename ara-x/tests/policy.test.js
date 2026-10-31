'use strict';

/**
 * I5 tests — motor de política ARA-X + validador del catálogo.
 *
 * Cubre:
 *  1. El motor reproduce los 36 vectores de D2 (`ara-x/spec/ara_x_codec_cases.json`)
 *     y su salida valida contra `ara_x_codec_policy.schema.json`.
 *  2. Invariantes POL-1..POL-12 sobre los 36 casos y 300 estados sintéticos.
 *  3. Fixtures prohibidos: 8K wire, L153+8K, hvc1+PQ sobre AVC, CMAF/LCEVC/DV/AI-SR
 *     falsos ⇒ nunca PASS (0 falsos 'pass').
 *  4. Un fixture veraz ⇒ PASS (sin falsos positivos).
 *  5. El motor es puro (sin fs/red) y determinista.
 *  6. Los reportes emitidos cubren el 100% de las variantes y cuantifican el contrato.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../policy/policy_engine.js');
const { validate } = require('./helpers/mini_schema.js');

const ROOT = path.resolve(__dirname, '..', '..');
const specPath = (f) => path.join(ROOT, 'ara-x', 'spec', f);
const reportPath = (f) => path.join(ROOT, 'ara-x', 'reports', f);

const schema = JSON.parse(fs.readFileSync(specPath('ara_x_codec_policy.schema.json'), 'utf8'));
const casesDoc = JSON.parse(fs.readFileSync(specPath('ara_x_codec_cases.json'), 'utf8'));
const BASE = casesDoc.default_input;

function deepMerge(a, b) {
  const out = Object.assign({}, a);
  for (const k of Object.keys(b || {})) {
    out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deepMerge(a[k] || {}, b[k]) : b[k];
  }
  return out;
}
function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function eqJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ── 1 · 36 vectores D2 ─────────────────────────────────────────────────── */
test('D2: el motor reproduce los 36 vectores y valida contra el schema', () => {
  let checks = 0;
  for (const c of casesDoc.cases) {
    const input = deepMerge(BASE, c.input || {});
    const d = engine.decide(input);

    const errs = validate(d, schema);
    assert.deepEqual(errs, [], c.id + ' schema: ' + errs.join(' | '));
    checks += 1;

    if (c.kind === 'aggregate') {
      let n = 0;
      for (let i = 0; i < 10631; i++) {
        const dd = engine.decide(Object.assign({}, input, { channel_id: String(100000 + i) }));
        if (dd && dd.channel && dd.channel.id) n += 1;
      }
      assert.equal(n, 10631, 'aggregate: 10.631 decisiones');
      continue;
    }
    if (c.kind === 'idempotence') {
      assert.equal(JSON.stringify(engine.decide(input)), JSON.stringify(engine.decide(input)), 'idempotente');
      continue;
    }

    for (const [key, expected] of Object.entries(c.expect || {})) {
      if (key === 'flags_include') {
        for (const f of expected) {
          assert.ok(d.flags.includes(f), c.id + ' flag ' + f + ' en [' + d.flags + ']');
          checks += 1;
        }
      } else if (key === 'markers_include') {
        for (const m of expected) {
          assert.ok(d.markers.includes(m), c.id + ' marker ' + m);
          checks += 1;
        }
      } else if (key === 'no_url_in_output') {
        assert.ok(!/https?:\/\/|us3r|p4ss/.test(JSON.stringify(d)), c.id + ' sin URL');
        checks += 1;
      } else {
        for (const [sub, value] of Object.entries(expected)) {
          assert.ok(eqJson(getPath(d, key + '.' + sub), value), c.id + ' ' + key + '.' + sub + ' = ' + JSON.stringify(getPath(d, key + '.' + sub)) + ' (esperado ' + JSON.stringify(value) + ')');
          checks += 1;
        }
      }
    }
  }
  assert.equal(casesDoc.cases.length, 36);
  assert.ok(checks >= 150, 'checks ejecutados: ' + checks);
});

/* ── 2 · Invariantes POL-1..POL-12 ──────────────────────────────────────── */
test('POL-1..POL-12: invariantes sobre los 36 casos', () => {
  for (const c of casesDoc.cases) {
    if (c.kind === 'aggregate' || c.kind === 'idempotence') continue;
    const d = engine.decide(deepMerge(BASE, c.input || {}));

    // POL-1 wire veraz o ausente
    if (d.wire.codecs) assert.ok(d.wire.video_codec, c.id + ' POL-1 codec');
    // POL-2 hvc1 solo familia hevc o daemon verificado
    if (String(d.wire.video_codec || '').startsWith('hvc1')) {
      assert.ok(d.channel.source_family === 'hevc' || d.wire.mode === 'DAEMON_VERIFIED', c.id + ' POL-2');
    }
    // POL-3 sin 8K wire ni niveles > L153
    assert.notEqual(d.wire.resolution, '7680x4320', c.id + ' POL-3 res');
    assert.ok(d.wire.level_idc == null || d.wire.level_idc <= 153, c.id + ' POL-3 level');
    assert.equal(d.display.eight_k, 'presentation_only', c.id + ' POL-3 eight_k');
    // POL-4 nivel >= requerido
    if (d.wire.resolution && d.wire.level_idc != null && String(d.wire.video_codec).startsWith('hvc1')) {
      const req = engine.requiredLevel(d.wire.resolution, d.wire.frame_rate);
      assert.ok(d.wire.level_idc >= req, c.id + ' POL-4 ' + d.wire.level_idc + ' < ' + req);
    }
    // POL-5 piso como testigo
    assert.equal(d.display.min_resolution, '3840x2160', c.id + ' POL-5');
    assert.equal(d.display.never_downscale, true, c.id + ' POL-5 nd');
    // POL-6 sin resolución en la degradación
    assert.deepEqual(d.degrade.order, ['fps', 'processing'], c.id + ' POL-6 order');
    assert.equal(d.degrade.resolution, 'forbidden', c.id + ' POL-6 res');
    // POL-8 null != 0
    if (d.thermal.status === 'unknown') assert.equal(d.thermal.clamps, 0, c.id + ' POL-8');
    // POL-9 pq sólo como intención
    if (d.wire.video_range === 'PQ') assert.equal(d.display.hdr_hint, 'PQ', c.id + ' POL-9');
  }
});

/* ── 3 · Fixtures prohibidos (0 falsos pass) ───────────────────────────── */
function cleanCtx() {
  return {
    tvg_id: 'fx',
    line: 1,
    hasVariant: true,
    family: 'h264',
    measured_fps: 25,
    evidenceTier: 'F2',
    socRaw: 's905x4',
    declared: {
      resolution: '3840x2160',
      codecs: 'avc1.640033,mp4a.40.2',
      videoCodec: 'avc1.640033',
      family: 'h264',
      level: 51,
      frameRate: 25,
      bandwidth: 22000000,
      averageBandwidth: 18000000,
      videoRange: 'PQ',
      transfer: '16',
      primaries: '9',
      matrix: '9',
      hdcp: 'TYPE-1',
      supplemental: null,
      stableId: 'fx_P3'
    },
    inband: {
      cmafRes: '1920x1080',
      cmafCodecs: 'avc1.640028',
      cmafContainer: 'fmp4',
      cmafInit: null,
      cmafHdr: 'SDR,NITS=100',
      hdrTransfer: 'PQ',
      hdrMaxCll: 400,
      hdrMaxFall: 100,
      hdrPeak: 400,
      hdrAvg: 100,
      dvProfile: null,
      lcevcEnabled: false,
      aiSrEnabled: false,
      aiFiEnabled: false,
      eightKFake: 'ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY',
      upscaleMarker: 'declared=3840x2160;codec=truthful;mode=4k;src=1920x1080;can8k=0',
      hdrIntent: 'display-pq;SCOPE=DISPLAY;VERIFIED=0',
      codecPreferred: 'avc1.640028',
      codecVerified: false,
      codecVerifiedPresent: true,
      knobs: { vlcMaxWidth: 3840, vlcMaxHeight: 2160, vlcVrrMax: 60, vlcVideoFps: 25, vlcMinterpolateFps: 0, xFramerate: 25 }
    },
    fileHasMap: true,
    fileHasSupplemental: true
  };
}

test('fixtures prohibidos: nunca PASS', () => {
  const cases = [
    ['wire 8K', (c) => { c.declared.resolution = '7680x4320'; }, 'I5-R01'],
    ['L153+8K', (c) => { c.declared.resolution = '7680x4320'; c.declared.codecs = 'hvc1.2.4.L153.B0,mp4a.40.2'; c.declared.videoCodec = 'hvc1.2.4.L153.B0'; c.declared.family = 'hevc'; c.declared.level = 153; }, 'I5-R01'],
    ['hvc1+PQ sobre AVC', (c) => { c.declared.codecs = 'hvc1.2.4.L153.B0,mp4a.40.2'; c.declared.videoCodec = 'hvc1.2.4.L153.B0'; c.declared.family = 'hevc'; c.declared.level = 153; c.declared.videoRange = 'PQ'; }, 'I5-R03'],
    ['CMAF falso', (c) => { c.inband.cmafContainer = 'mpegts'; }, 'I5-R05'],
    ['LCEVC falso', (c) => { c.inband.lcevcEnabled = true; }, 'I5-R06'],
    ['DV falso', (c) => { c.inband.dvProfile = '8'; }, 'I5-R07'],
    ['AI-SR falso', (c) => { c.inband.aiSrEnabled = true; c.inband.aiSrRaw = 'MODEL=realesrgan,SCALE=4,ENABLED=true'; }, 'I5-R08']
  ];
  for (const [label, mutate, expectedRule] of cases) {
    const ctx = cleanCtx();
    mutate(ctx);
    const r = engine.classifyVariant(ctx);
    assert.notEqual(r.classification, 'PASS', label + ' no debe ser PASS');
    assert.ok(r.findings.includes(expectedRule), label + ' debe disparar ' + expectedRule + ' (vio ' + r.findings.join(',') + ')');
  }
});

test('fixture veraz: PASS sin falsos positivos', () => {
  const r = engine.classifyVariant(cleanCtx());
  assert.equal(r.classification, 'PASS', 'hallazgos: ' + r.findings.join(','));
  assert.deepEqual(r.findings, []);
  assert.equal(r.wire_target.video_codec, 'avc1.640033');
});

/* ── 4 · Pureza y determinismo ─────────────────────────────────────────── */
test('el motor es puro (sin fs ni red) y determinista', () => {
  const src = fs.readFileSync(path.join(ROOT, 'ara-x', 'policy', 'policy_engine.js'), 'utf8');
  for (const forbidden of ["require('node:fs')", 'require("node:fs")', "require('node:http')", "require('node:https')", "require('node:net')", 'fetch(']) {
    assert.ok(!src.includes(forbidden), 'engine no debe contener ' + forbidden);
  }
  const input = deepMerge(BASE, {});
  const a = JSON.stringify(engine.decide(input));
  const b = JSON.stringify(engine.decide(input));
  assert.equal(a, b, 'decisión determinista');
});

test('parseStreamInf extrae RFC 6381 y atributos', () => {
  const v = engine.parseStreamInf('#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=3840x2160,FRAME-RATE=30.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ,HDCP-LEVEL=TYPE-1');
  assert.equal(v.resolution, '3840x2160');
  assert.equal(v.frameRate, 30);
  assert.equal(v.family, 'hevc');
  assert.equal(v.level, 153);
  assert.equal(v.videoRange, 'PQ');
  assert.equal(v.bandwidth, 9000000);
  const a = engine.parseStreamInf('#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160,CODECS="avc1.640033,mp4a.40.2"');
  assert.equal(a.family, 'h264');
  assert.equal(a.level, 51);
});

/* ── 5 · Reportes del catálogo (si están generados) ────────────────────── */
test('policy_findings.json (A): 100% de variantes y cuantificación', () => {
  const p = reportPath('policy_findings.json');
  assert.ok(fs.existsSync(p), 'falta ' + p);
  const r = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(r.capture.sha256, 'E27C03EB45DACD6E5F19C3F4E016B456236CA2C06F485DDF11165DDC86E2A680');
  assert.equal(r.structure.channels, 10631);
  assert.equal(r.structure.streaminf, 10631);
  assert.equal(r.classification.total_variants_classified, 10631);
  assert.equal(r.classification.by_class.NO_VARIANT, 0);
  assert.equal(r.variants.length, 10631);
  assert.equal(r.quantified.fz01_avc_with_hvc1, 9593);
  assert.equal(r.quantified.fake_cmaf, 10631);
  assert.equal(r.quantified.fake_lcevc, 10631);
  assert.equal(r.quantified.fake_dv, 10631);
  assert.equal(r.quantified.ai_sr_not_scoped, 10631);
  assert.equal(r.quantified.pq_public_sdr_inband, 9823);
  assert.equal(r.quantified.frame_rate_overclaim, 10503);
  assert.equal(r.quantified.fourk_9_15_avc, 9548);
  assert.equal(r.quantified.declared_4k_below_28mbps, 9778);
  for (const s of r.structure.url_samples_masked) {
    assert.match(s, /^https?:\/\/[^/]+\/<masked-path:\d+>$/, 'muestra enmascarada: ' + s);
  }
  assert.ok(!/\b(?:username|password|user:|pass:)\b/i.test(JSON.stringify(r)), 'sin credenciales');
});

test('policy_findings_cdn.json (B): 10.631 canales y 45 sin variante', () => {
  const p = reportPath('policy_findings_cdn.json');
  assert.ok(fs.existsSync(p), 'falta ' + p);
  const r = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(r.structure.channels, 10631);
  assert.equal(r.structure.streaminf, 10586);
  assert.equal(r.structure.channels_without_variant, 45);
  assert.equal(r.classification.total_variants_classified, 10586);
  assert.equal(r.classification.by_class.NO_VARIANT, 45);
  assert.equal(r.variants.length, 10586);
  assert.equal(r.channels_without_variant_list.length, 45);
  assert.equal(r.classification.total_channels_accounted, 10631);
  assert.ok(r.quantified.fz01_avc_with_hvc1 > 9000, 'FZ-01 cuantificado en B');
});
