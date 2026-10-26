#!/usr/bin/env node
// Builds JSON_PROFILES_MATRIX.json : P0..P5 normalized + PASS/FAIL/UNKNOWN per law.
// Read-only over the JSON artifacts. Values are cited with their exact JSON key paths.
import fs from 'node:fs';

const BASE = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION';
const REPO = `${BASE}/IPTV_v5.4_MAX_AGGRESSION`;
const DL = 'C:/Users/HFRC/Downloads';
const [outPath, evidencePath] = process.argv.slice(2);

const FILES = {
  lab_master: `${REPO}/frontend/lab_master_22.6.0.json`,
  baseline_8k120: `${DL}/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120.json`,
  baseline_backup0607: `${DL}/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120_BACKUP_20260607.json`,
  baseline_dnr: `${DL}/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json`,
  crystal4k: `${DL}/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json`,
  ape_optimized: `${REPO}/frontend/js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json`,
  ape_realtime: `${REPO}/backend/APE_ALL_PROFILES_v10_REALTIME_ENGINE.json`,
};

// Manifest table = the doctrinal expectation for P0..P5 (source: T4 assignment + skill
// iptv-omega-working-flow-manifesto "Codec ladder — PISO Main10" table).
const MANIFEST = {
  P0: { name: '8K Master', codec: 'dvh1.08.06', resolution: '7680x4320', fps: 120, resRank: 5 },
  P1: { name: '8K (AV1)', codec: 'av01.0.15M.10', resolution: '7680x4320', fps: 120, resRank: 5 },
  P2: { name: '4K', codec: 'hvc1.2.4.L153.B0', resolution: '3840x2160', fps: 60, resRank: 4 },
  P3: { name: 'FHD', codec: 'hvc1.2.4.L123.B0', resolution: '1920x1080', fps: 60, resRank: 3 },
  P4: { name: 'HD', codec: 'hvc1.2.4.L93.B0', resolution: '1280x720', fps: 30, resRank: 2 },
  P5: { name: 'SD failsafe', codec: 'avc1.42c01e', ladder_required: 'hvc1.2.4.L90.B0', resolution: '854x480', fps: 30, resRank: 1 },
};

// Capacity model (documented, derived from the repo's own HEVC ladder table):
// L93=720p30 L120=1080p30 L123=1080p60 L150=4K30 L153=4K60 L156=4K120 L180=8K30 L183=8K60 L186=8K120
const HEVC_CAP = { 90: [1, 30], 93: [2, 30], 120: [3, 30], 123: [3, 60], 150: [4, 30], 153: [4, 60], 156: [4, 120], 180: [5, 30], 183: [5, 60], 186: [5, 120] };
const AVC_CAP = { 30: [1, 30], 31: [2, 30], 40: [3, 30], 42: [3, 60] };
const RES_RANK = { '854x480': 1, '640x360': 1, '1280x720': 2, '1920x1080': 3, '2560x1440': 3, '3840x2160': 4, '7680x4320': 5 };

function parseCodec(codec) {
  if (typeof codec !== 'string' || !codec) return { family: 'none' };
  const c = codec.trim();
  let m;
  if ((m = c.match(/^hvc1\.(\d)\.(\d)\.L(\d{2,3})\.B(\d)$/i))) return { family: 'HEVC', profile: Number(m[2]), level: Number(m[3]), cap: HEVC_CAP[Number(m[3])] || null, raw: c };
  if ((m = c.match(/^hev1/i))) return { family: 'HEVC', level: null, cap: null, raw: c, note: 'hev1 form (should not appear in STREAM-INF)' };
  if ((m = c.match(/^dvh1\.(\d{2})\.(\d{2})$/i))) return { family: 'DV', dvProfile: m[1], dvLevel: m[2], raw: c, cap: null, note: 'Dolby Vision: level field is an HEVC level idc; strict capacity not asserted' };
  if ((m = c.match(/^av01\.(\d)\.(\d{2})[A-Z]\.(\d)$/i))) return { family: 'AV1', profile: m[1], level: m[2], bitdepth: m[3], raw: c, cap: null, note: 'AV1 seq_level_idx; capacity not asserted by this model' };
  if ((m = c.match(/^avc1\.([0-9a-f]{6})$/i))) {
    const hex = m[1];
    const lvlHex = parseInt(hex.slice(4, 6), 16);
    return { family: 'AVC', profileHex: hex.slice(0, 2), level: lvlHex, cap: AVC_CAP[lvlHex] || null, raw: c };
  }
  return { family: 'unknown', raw: c };
}

function checkL1(codec, resolution, fps) {
  const p = parseCodec(codec);
  if (!p.cap) return { verdict: 'UNKNOWN', codec: codec ?? null, resolution: resolution ?? null, fps: fps ?? null, family: p.family, reason: p.note || 'no capacity mapping for this codec form' };
  const rank = RES_RANK[resolution] ?? null;
  if (rank === null) return { verdict: 'UNKNOWN', codec, resolution, fps, family: p.family, reason: 'unknown resolution string' };
  const [capRank, capFps] = p.cap;
  const fpsNum = typeof fps === 'string' ? parseFloat(fps) : fps;
  const levelOk = capRank >= rank;
  const fpsOk = Number.isFinite(fpsNum) ? capFps >= fpsNum : true;
  const verdict = levelOk && fpsOk ? 'PASS' : 'FAIL';
  return {
    verdict, codec, resolution, fps, family: p.family, declared_level: p.level,
    capacity: { resRank: capRank, fps: capFps },
    required_for_declared: requiredLevel(rank, fpsNum),
    reason: verdict === 'PASS' ? 'declared level capacity covers declared resolution+fps'
      : (levelOk ? 'level capacity fps below declared fps' : 'level capacity resolution below declared resolution'),
  };
}

function requiredLevel(rank, fps) {
  const table = {};
  for (const [lvl, [r, f]] of Object.entries(HEVC_CAP)) {
    if (r < rank) continue;
    if (f < (Number.isFinite(fps) ? fps : 0)) continue;
    table[lvl] = `L${lvl}`;
  }
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  return keys.length ? table[keys[0]] : 'none (exceeds L186)';
}

const first = (s) => (typeof s === 'string' ? s.split(',')[0].trim() : s);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const statOf = (p) => { const s = fs.statSync(p); return { bytes: s.size, mtime: s.mtime.toISOString() }; };

const lab = readJson(FILES.lab_master);
const baseline = readJson(FILES.baseline_8k120);
const backup = readJson(FILES.baseline_backup0607);
const apeOpt = readJson(FILES.ape_optimized);
const apeRt = readJson(FILES.ape_realtime);
const channelsFront = JSON.parse(fs.readFileSync(`${BASE}/audit/alignment/2026-10-25/20-json/tools/scan_frontend.json`, 'utf8'));
const channelsBack = JSON.parse(fs.readFileSync(`${BASE}/audit/alignment/2026-10-25/20-json/tools/scan_backend.json`, 'utf8'));

// Canonical Excel branch (captain decision D-20: Downloads/APE_M3U8_LAB_v8_FIXED.xlsm, sheet 6_NIVEL_2_PROFILES,
// read by t4 into EXCEL_PROFILES_EXTRACT.json with hoja!celda provenance).
const EXTRACT_PATH = `${BASE}/audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json`;
const exDoc = readJson(EXTRACT_PATH);
const EXMAP = [
  ['settings.resolution', 'settings', 'settings.resolution'],
  ['settings.maxResolution', 'settings', 'settings.maxResolution'],
  ['settings.fps', 'settings', 'settings.fps'],
  ['settings.targetFps', 'settings', 'settings.targetFps'],
  ['settings.codec', 'settings', 'settings.codec'],
  ['settings.codec_full', 'settings', 'settings.codec_full'],
  ['settings.codec_priority', 'settings', 'settings.codec_priority'],
  ['settings.bit_depth', 'settings', 'settings.bit_depth'],
  ['settings.chroma_subsampling', 'settings', 'settings.chroma_subsampling'],
  ['settings.hdrMode', 'settings', 'settings.hdrMode'],
  ['settings.videoRange', 'settings', 'settings.videoRange'],
  ['settings.maxBitrateKbps', 'settings', 'settings.maxBitrateKbps'],
  ['settings.avgBitrateKbps', 'settings', 'settings.avgBitrateKbps'],
  ['headerOverrides.X-Stream-Codecs', 'headerOverrides', 'headerOverrides.X-Stream-Codecs'],
  ['headerOverrides.X-Stream-Resolution', 'headerOverrides', 'headerOverrides.X-Stream-Resolution'],
  ['headerOverrides.X-Stream-FPS', 'headerOverrides', 'headerOverrides.X-Stream-FPS'],
  ['headerOverrides.X-APE-CODEC', 'headerOverrides', 'headerOverrides.X-APE-CODEC'],
  ['headerOverrides.X-APE-RESOLUTION', 'headerOverrides', 'headerOverrides.X-APE-RESOLUTION'],
  ['headerOverrides.X-APE-FPS', 'headerOverrides', 'headerOverrides.X-APE-FPS'],
  ['kodiprop.inputstream.adaptive.max_resolution', 'kodiprop', 'kodiprop.inputstream.adaptive.max_resolution'],
  ['vlcopt.video-width', 'vlcopt', 'vlcopt.video-width'],
  ['vlcopt.video-height', 'vlcopt', 'vlcopt.video-height'],
];
const exCell = (n) => (n && typeof n === 'object' && 'cell' in n ? n.cell : null);
const exVal = (n) => (n && typeof n === 'object' && 'value' in n ? n.value : null);

const matrix = {
  meta: {
    task: 't5 / T4 — Auditoría JSON LAB_CALIBRATED_BULLETPROOF, lab_master y channels_map',
    generated_at: new Date().toISOString(),
    auditor: 'json-ssot',
    read_only: true,
    law_model: {
      L1_LEVEL_VS_RESOLUTION: 'Declared H.26x level capacity (repo HEVC ladder table) must cover the declared RESOLUTION+fps. HEVC map L90..L186, AVC map level 30/31/40/42. DV/AV1 forms are UNKNOWN by design of this model (documented), never PASS by default.',
      L0_MANIFEST_CODEC: 'settings.codec_full must equal the doctrinal manifest codec for the profile.',
      L2_MANIFEST_RESOLUTION: 'X-Stream-Resolution (emitted STREAM-INF claim) must equal the manifest resolution.',
      L3_MANIFEST_FPS: 'X-Stream-FPS must equal the manifest fps.',
      L4_MAIN10_FLOOR: 'Preferred video codec must be hvc1.2.* (Main10) or better; AVC allowed only as P5 failsafe.',
      L5_LADDER_HAS_MANIFEST_CODEC: 'prisma_lab_sync_v20.codec_ladder_per_profile must contain the manifest codec (P5: hvc1.2.4.L90.B0).',
      L6_INTERNAL_CODEC_AGREEMENT: 'codec_full / codec_string / X-Stream-Codecs / ladder[0] must name the same codec family+level.',
      L7_BITRATE_ORDER: 'settings.avgBitrateKbps must be <= settings.maxBitrateKbps.',
      L8_HEADER_COUNT_CLAIM: 'settings.headersCount must equal the measured size of headerOverrides.',
      L9_CHANNELS_MAP_ALIGNMENT: 'channels_map codec_rfc6381 per profile must agree with the lab_master codec for that profile.',
      L10_EXCEL_CANONICAL_MATCH: 'Every field mapped in EXCEL_PROFILES_EXTRACT (canonical branch 6_NIVEL_2_PROFILES, D-20) must equal the JSON value. Cited as hoja!celda.',
      L11_FPS_LEVEL_CAPACITY: 'D-15: the declared fps must be supported by the canonical codec level at the canonical resolution. 120fps without level capacity = FAIL.',
    },
    sources: {},
    manifest_table: MANIFEST,
  },
  profiles: {},
  cross_source: { channel_maps: {}, ape_profile_files: {} },
  isolated_failures: [],
};

for (const [label, p] of Object.entries(FILES)) matrix.meta.sources[label] = { path: p, ...statOf(p) };

for (const pk of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const pr = lab.profiles_calibrated[pk];
  const man = MANIFEST[pk];
  const observed = {
    name: pr.name,
    'settings.codec_full': pr.settings.codec_full,
    'settings.codec_string[0]': first(pr.settings.codec_string),
    'settings.resolution': pr.settings.resolution,
    'settings.fps': pr.settings.fps,
    'settings.maxResolution': pr.settings.maxResolution,
    'settings.maxBitrateKbps': pr.settings.maxBitrateKbps,
    'settings.avgBitrateKbps': pr.settings.avgBitrateKbps,
    'settings.headersCount': pr.settings.headersCount,
    'settings.codec': pr.settings.codec,
    'headerOverrides.X-Stream-Codecs[0]': first(pr.headerOverrides['X-Stream-Codecs']),
    'headerOverrides.X-Stream-Resolution': pr.headerOverrides['X-Stream-Resolution'],
    'headerOverrides.X-Stream-FPS': pr.headerOverrides['X-Stream-FPS'],
    'headerOverrides.X-APE-RESOLUTION[0]': first(pr.headerOverrides['X-APE-RESOLUTION']),
    'headerOverrides.X-APE-FPS[0]': first(pr.headerOverrides['X-APE-FPS']),
    'headerOverrides.X-Max-Resolution[0]': first(pr.headerOverrides['X-Max-Resolution']),
    'headerOverrides.X-APE-CODEC[0]': first(pr.headerOverrides['X-APE-CODEC']),
    'headerOverrides.X-HDCP-Level': pr.headerOverrides['X-HDCP-Level'],
    'headerOverrides.X-Profile-Tier': pr.headerOverrides['X-Profile-Tier'],
    'kodiprop[inputstream.adaptive.max_resolution]': pr.kodiprop['inputstream.adaptive.max_resolution'],
    'vlcopt[video-width]x[video-height]': `${pr.vlcopt['video-width']}x${pr.vlcopt['video-height']}`,
    'measured.headerOverrides_key_count': Object.keys(pr.headerOverrides).length,
    'prisma_lab_sync_v20.codec_ladder_per_profile.video[0]': first(lab.prisma_lab_sync_v20.codec_ladder_per_profile[pk].video),
    'prisma_lab_sync_v20.codec_ladder_per_profile.video': lab.prisma_lab_sync_v20.codec_ladder_per_profile[pk].video,
  };

  const laws = {};

  // L0 — manifest codec (case-insensitive on the exact token)
  laws.L0_MANIFEST_CODEC = {
    verdict: String(observed['settings.codec_full']).toLowerCase() === man.codec.toLowerCase() ? 'PASS' : 'FAIL',
    expected: man.codec, observed: observed['settings.codec_full'], path: `profiles_calibrated.${pk}.settings.codec_full`,
  };
  // L1a — emitted STREAM-INF triple
  laws.L1_LEVEL_VS_RESOLUTION_EMITTED = {
    path: `profiles_calibrated.${pk}.headerOverrides.X-Stream-Codecs | X-Stream-Resolution | X-Stream-FPS`,
    ...checkL1(observed['headerOverrides.X-Stream-Codecs[0]'], observed['headerOverrides.X-Stream-Resolution'], observed['headerOverrides.X-Stream-FPS']),
  };
  // L1b — settings triple
  laws.L1_LEVEL_VS_RESOLUTION_SETTINGS = {
    path: `profiles_calibrated.${pk}.settings.codec_full | settings.resolution | settings.fps`,
    ...checkL1(observed['settings.codec_full'], observed['settings.resolution'], observed['settings.fps']),
  };
  // L1c — codec_string triple (legacy emitter path)
  laws.L1_LEVEL_VS_RESOLUTION_CODEC_STRING = {
    path: `profiles_calibrated.${pk}.settings.codec_string | headerOverrides.X-Stream-Resolution | X-Stream-FPS`,
    ...checkL1(observed['settings.codec_string[0]'], observed['headerOverrides.X-Stream-Resolution'], observed['headerOverrides.X-Stream-FPS']),
  };
  // L2 — emitted resolution vs manifest
  laws.L2_MANIFEST_RESOLUTION = {
    verdict: observed['headerOverrides.X-Stream-Resolution'] === man.resolution ? 'PASS' : 'FAIL',
    expected: man.resolution, observed: observed['headerOverrides.X-Stream-Resolution'],
    path: `profiles_calibrated.${pk}.headerOverrides.X-Stream-Resolution`,
  };
  // L3 — emitted fps vs manifest
  laws.L3_MANIFEST_FPS = {
    verdict: String(observed['headerOverrides.X-Stream-FPS']) === String(man.fps) ? 'PASS' : 'FAIL',
    expected: man.fps, observed: observed['headerOverrides.X-Stream-FPS'],
    path: `profiles_calibrated.${pk}.headerOverrides.X-Stream-FPS`,
  };
  // L4 — Main10 floor
  const cf = String(observed['settings.codec_full']);
  const isMain10Plus = /^hvc1\.([24])\./.test(cf) || /^dvh1\./i.test(cf);
  const isAvc = /^avc1\./i.test(cf);
  laws.L4_MAIN10_FLOOR = {
    verdict: isMain10Plus ? 'PASS' : (pk === 'P5' && isAvc ? 'PASS' : 'FAIL'),
    observed: cf, path: `profiles_calibrated.${pk}.settings.codec_full`,
    note: isMain10Plus
      ? 'HEVC Main10+/DV primary: satisfies the Main10 floor'
      : (pk === 'P5' && isAvc
        ? 'P5 failsafe: AVC primary allowed by manifest'
        : (isAvc ? 'AVC primary on a non-failsafe profile violates the Main10 floor' : 'HEVC Main (hvc1.1.x) primary is BELOW the Main10 floor required since 2026-06-11')),
  };
  // L5 — ladder contains manifest codec
  const ladder = String(observed['prisma_lab_sync_v20.codec_ladder_per_profile.video']).toLowerCase();
  const ladderNeedle = (man.ladder_required || man.codec).toLowerCase();
  laws.L5_LADDER_HAS_MANIFEST_CODEC = {
    verdict: ladder.includes(ladderNeedle) ? 'PASS' : 'FAIL',
    expected_needle: man.ladder_required || man.codec,
    ladder: observed['prisma_lab_sync_v20.codec_ladder_per_profile.video'],
    path: `prisma_lab_sync_v20.codec_ladder_per_profile.${pk}.video`,
  };
  // L6 — internal codec agreement
  const tokens = [observed['settings.codec_full'], observed['settings.codec_string[0]'], observed['headerOverrides.X-Stream-Codecs[0]'], observed['prisma_lab_sync_v20.codec_ladder_per_profile.video[0]']].map((x) => String(x).toLowerCase());
  const distinct = [...new Set(tokens)];
  laws.L6_INTERNAL_CODEC_AGREEMENT = {
    verdict: distinct.length === 1 ? 'PASS' : 'FAIL',
    distinct_values: distinct, paths: [
      `profiles_calibrated.${pk}.settings.codec_full`,
      `profiles_calibrated.${pk}.settings.codec_string`,
      `profiles_calibrated.${pk}.headerOverrides.X-Stream-Codecs`,
      `prisma_lab_sync_v20.codec_ladder_per_profile.${pk}.video`,
    ],
  };
  // L7 — bitrate order
  const avg = Number(observed['settings.avgBitrateKbps']), max = Number(observed['settings.maxBitrateKbps']);
  laws.L7_BITRATE_ORDER = {
    verdict: Number.isFinite(avg) && Number.isFinite(max) ? (avg <= max ? 'PASS' : 'FAIL') : 'UNKNOWN',
    avg, max, paths: [`profiles_calibrated.${pk}.settings.avgBitrateKbps`, `profiles_calibrated.${pk}.settings.maxBitrateKbps`],
    note: avg > max ? 'average bitrate declared above the declared maximum (impossible ordering)' : 'ok',
  };
  // L8 — header count claim
  laws.L8_HEADER_COUNT_CLAIM = {
    verdict: Number(observed['settings.headersCount']) === observed['measured.headerOverrides_key_count'] ? 'PASS' : 'FAIL',
    claimed: Number(observed['settings.headersCount']), measured: observed['measured.headerOverrides_key_count'],
    paths: [`profiles_calibrated.${pk}.settings.headersCount`],
  };

  // L10 — JSON vs CANONICAL EXCEL branch (D-20/D-22), every row cited as hoja!celda
  const exProf = exDoc.profiles?.[pk] || {};
  const exRows = EXMAP.map(([jpath, container, ekey]) => {
    const jval = jpath.split('.').reduce((a, k) => (a == null ? a : a[k]), pr);
    const node = exProf[container]?.[ekey];
    const ev = exVal(node);
    const jn = jval === undefined || jval === null ? null : String(jval);
    const en = ev === undefined || ev === null ? null : String(ev);
    return {
      json_path: `profiles_calibrated.${pk}.${jpath}`, excel_cell: exCell(node),
      excel_value: en, json_value: jn,
      status: en === null ? (jn === null ? 'BOTH_ABSENT' : 'EXCEL_ABSENT') : jn === null ? 'JSON_ABSENT' : jn === en ? 'MATCH' : 'DIFF',
    };
  });
  const exDiffs = exRows.filter((r) => r.status === 'DIFF');
  laws.L10_EXCEL_CANONICAL_MATCH = {
    verdict: exDiffs.length === 0 ? 'PASS' : 'FAIL',
    excel_source: `${exDoc.sheet} (${exDoc.sheetDimension}) · ${exDoc.provenance?.file?.path} · sha256 ${exDoc.provenance?.sha256}`,
    diff_count: exDiffs.length, diffs: exDiffs,
    paths: exDiffs.map((d) => `${d.excel_cell} <-> ${d.json_path}`),
  };
  // L11 — D-15: declared fps must be supported by the canonical codec level at the canonical resolution
  const canRes = exVal(exProf.settings?.['settings.resolution']);
  const canCodec = exVal(exProf.settings?.['settings.codec_full']);
  const canFps = exVal(exProf.settings?.['settings.fps']);
  const canCap = parseCodec(canCodec);
  const canRank = RES_RANK[canRes] ?? null;
  let canCeiling = null, l11 = 'UNKNOWN';
  if (canCap?.cap && canRank !== null) {
    const [capRank, capFps] = canCap.cap;
    canCeiling = capRank >= canRank ? capFps : 0;
    l11 = Number(canFps) <= canCeiling ? 'PASS' : 'FAIL';
  }
  laws.L11_FPS_LEVEL_CAPACITY = {
    verdict: l11, declared_fps: canFps ?? null, codec: canCodec ?? null, resolution: canRes ?? null,
    level_capacity_fps_ceiling: canCeiling,
    paths: ['6_NIVEL_2_PROFILES!{col}25 (resolution)', '6_NIVEL_2_PROFILES!{col}32 (fps)', '6_NIVEL_2_PROFILES!{col}37 (codec_full)'],
    note: l11 === 'FAIL'
      ? `fps ${canFps} excede el techo ${canCeiling} del nivel ${canCap?.level} a ${canRes}; D-15: corregir a <= ${canCeiling} (60 solo si el nivel lo soporta)`
      : 'fps soportado por el nivel (o no evaluable: DV/AV1)',
  };

  const verdicts = Object.values(laws).map((l) => l.verdict);
  const overall = verdicts.includes('FAIL') ? 'FAIL' : verdicts.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
  matrix.profiles[pk] = { manifest_expectation: man, observed, laws, verdict_overall: overall, fail_count: verdicts.filter((v) => v === 'FAIL').length };

  for (const [lawName, l] of Object.entries(laws)) {
    if (l.verdict === 'FAIL') matrix.isolated_failures.push({
      profile: pk, law: lawName, path: l.path ?? l.paths ?? null,
      expected: l.expected ?? l.expected_needle ?? null,
      observed: l.observed ?? l.distinct_values ?? null,
      detail: l.reason || l.note || null,
      capacity: l.capacity ?? null,
      required_for_declared: l.required_for_declared ?? null,
      values: {
        codec: l.codec ?? null, resolution: l.resolution ?? null, fps: l.fps ?? null,
        declared_level: l.declared_level ?? null, family: l.family ?? null,
        distinct_values: l.distinct_values ?? null,
        claimed: l.claimed ?? null, measured: l.measured ?? null,
        avg: l.avg ?? null, max: l.max ?? null, ladder: l.ladder ?? null,
        declared_fps: l.declared_fps ?? null, level_capacity_fps_ceiling: l.level_capacity_fps_ceiling ?? null,
        excel_diffs: l.diffs ?? null,
      },
    });
  }
}

// Cross-source: canonical Excel branch (D-20) — the SSOT the captain declared canonical
matrix.cross_source.excel_canonical = {
  decision_refs: {
    D20: 'Rama canónica = C:\\Users\\HFRC\\Downloads\\APE_M3U8_LAB_v8_FIXED.xlsm (sha256 663EF44E…)',
    D22: 'El export usa SHEET_PROFILES="6_NIVEL_2_PROFILES"; P1 canónico = 3840x2160 + hvc1.2.4.L153.B0',
    D15: 'El Excel declara fps=120 en los 6 perfiles; sin evidencia de 120fps reales la corrección es 60 (o el techo del nivel)',
  },
  extract: { path: EXTRACT_PATH, ...statOf(EXTRACT_PATH) },
  excel_file: { path: exDoc.provenance?.file?.path, sha256: exDoc.provenance?.sha256, sizeBytes: exDoc.provenance?.sizeBytes, mtimeUtc: exDoc.provenance?.mtimeUtc, readCopyMatchesSource: exDoc.provenance?.readCopyMatchesSource },
  sheet: exDoc.sheet, sheetDimension: exDoc.sheetDimension,
  per_profile: Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((pk) => {
    const e = exDoc.profiles?.[pk] || {};
    return [pk, {
      resolution: exVal(e.settings?.['settings.resolution']), resolution_cell: exCell(e.settings?.['settings.resolution']),
      codec_full: exVal(e.settings?.['settings.codec_full']), codec_cell: exCell(e.settings?.['settings.codec_full']),
      fps: exVal(e.settings?.['settings.fps']), fps_cell: exCell(e.settings?.['settings.fps']),
      x_stream_codecs: exVal(e.headerOverrides?.['headerOverrides.X-Stream-Codecs']), x_stream_codecs_cell: exCell(e.headerOverrides?.['headerOverrides.X-Stream-Codecs']),
      json_vs_excel_diff_count: matrix.profiles[pk].laws.L10_EXCEL_CANONICAL_MATCH.diff_count,
      json_vs_excel_verdict: matrix.profiles[pk].laws.L10_EXCEL_CANONICAL_MATCH.verdict,
      fps_capacity_verdict: matrix.profiles[pk].laws.L11_FPS_LEVEL_CAPACITY.verdict,
      fps_capacity_ceiling: matrix.profiles[pk].laws.L11_FPS_LEVEL_CAPACITY.level_capacity_fps_ceiling,
    }];
  })),
};

// Cross-source: doctrinal baseline vs repo
const baselineCmp = {};
for (const pk of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const a = lab.profiles_calibrated[pk], b = baseline.profiles_calibrated[pk], c = backup.profiles_calibrated[pk];
  baselineCmp[pk] = {
    'settings.codec_full': { repo: a.settings.codec_full, baseline_8k120: b.settings.codec_full, backup_0607: c.settings.codec_full, equal_repo_baseline: a.settings.codec_full === b.settings.codec_full },
    'settings.resolution': { repo: a.settings.resolution, baseline_8k120: b.settings.resolution, backup_0607: c.settings.resolution },
    'settings.fps': { repo: a.settings.fps, baseline_8k120: b.settings.fps, backup_0607: c.settings.fps },
    'headerOverrides.X-Stream-Codecs': { repo: a.headerOverrides['X-Stream-Codecs'], baseline_8k120: b.headerOverrides['X-Stream-Codecs'], backup_0607: c.headerOverrides['X-Stream-Codecs'] },
    'vlcopt.codec-priority': { repo: a.vlcopt['codec-priority'], baseline_8k120: b.vlcopt['codec-priority'], backup_0607: c.vlcopt['codec-priority'] },
    'headerOverrides.X-Video-Codecs': { repo: a.headerOverrides['X-Video-Codecs'], baseline_8k120: b.headerOverrides['X-Video-Codecs'], backup_0607: c.headerOverrides['X-Video-Codecs'] },
    'headerOverrides.X-Quality-Preference': { repo: a.headerOverrides['X-Quality-Preference'], baseline_8k120: b.headerOverrides['X-Quality-Preference'], backup_0607: c.headerOverrides['X-Quality-Preference'] },
    'settings.codec': { repo: a.settings.codec, baseline_8k120: b.settings.codec, backup_0607: c.settings.codec },
  };
}
matrix.cross_source.baseline_vs_repo = {
  note: 'Repo lab_master_22.6.0.json is byte-identical to Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json (same sha256 099A1707…). It descends from baseline_8k120 (NOT from the manifesto-named BACKUP_20260607).',
  per_profile: baselineCmp,
};

// Cross-source: APE profile files
for (const [label, doc] of [['ape_optimized', apeOpt], ['ape_realtime', apeRt]]) {
  const holder = doc.profiles;
  const rows = {};
  for (const pk of Object.keys(holder)) {
    const p = holder[pk];
    rows[pk] = {
      name: p.name,
      'settings.resolution': p.settings?.resolution ?? null,
      'settings.fps': p.settings?.fps ?? null,
      'settings.codec': p.settings?.codec ?? null,
      'headerOverrides.X-APE-CODEC': p.headerOverrides?.['X-APE-CODEC'] ?? p.headerOverrides_v10?.['X-APE-CODEC'] ?? null,
      'headerOverrides.X-Video-Codecs': p.headerOverrides?.['X-Video-Codecs'] ?? null,
      'codec_ladder.video': doc.codec_ladder?.[pk]?.video ?? null,
    };
  }
  matrix.cross_source.ape_profile_files[label] = { path: FILES[label], ...statOf(FILES[label]), meta_version: doc._meta?.version, meta_exported: doc._meta?.exported || doc._meta?.generated, profiles: rows };
}
matrix.cross_source.ape_profile_files.note = 'These two files are a SECOND and THIRD codec doctrine in the same repo (v9 AV1/HEVC-first and v10 HEVC-first) that disagree with lab_master (DV/Main10 lab ladder). See JSON_DRIFT_REPORT.md §5.';

// Cross-source: channels_map per-profile aggregates
matrix.cross_source.channel_maps = {
  frontend: { path: `${REPO}/frontend/channels_map.json`, ...statOf(`${REPO}/frontend/channels_map.json`), records: channelsFront.record_count, crosstab: channelsFront.crosstab, profiles_present: [...new Set(Object.keys(channelsFront.crosstab).map((k) => k.split('|')[0]))] },
  backend: { path: `${REPO}/backend/channels_map.json`, ...statOf(`${REPO}/backend/channels_map.json`), records: channelsBack.record_count, crosstab: channelsBack.crosstab, profiles_present: [...new Set(Object.keys(channelsBack.crosstab).map((k) => k.split('|')[0]))] },
  frontend_data: { path: `${REPO}/frontend/data/channels_map.json`, ...statOf(`${REPO}/frontend/data/channels_map.json`), records: 8366 },
};

// L9 — channels_map codec vs lab_master codec, per profile present in the map
const mapCodecByProfile = { P0: 'hvc1.2.4.L183.B0', P1: 'hvc1.2.4.L150.B0', P2: 'avc1.640028' };
matrix.cross_source.channels_map_alignment = {};
for (const [pk, mapCodec] of Object.entries(mapCodecByProfile)) {
  const labCodec = lab.profiles_calibrated[pk].settings.codec_full;
  matrix.cross_source.channels_map_alignment[pk] = {
    law: 'L9_CHANNELS_MAP_ALIGNMENT',
    verdict: String(mapCodec).toLowerCase() === String(labCodec).toLowerCase() ? 'PASS' : 'FAIL',
    channels_map_codec_rfc6381: mapCodec,
    lab_master_codec_full: labCodec,
    paths: [`frontend/channels_map.json[*].codec_rfc6381 (${pk} subset)`, `profiles_calibrated.${pk}.settings.codec_full`],
  };
  if (matrix.cross_source.channels_map_alignment[pk].verdict === 'FAIL') {
    matrix.isolated_failures.push({ profile: pk, law: 'L9_CHANNELS_MAP_ALIGNMENT', path: `frontend/channels_map.json[*].codec_rfc6381`, expected: labCodec, observed: mapCodec, detail: 'per-channel map declares a different codec than the LAB profile SSOT' });
  }
}
for (const pk of ['P3', 'P4', 'P5']) {
  matrix.cross_source.channels_map_alignment[pk] = { law: 'L9_CHANNELS_MAP_ALIGNMENT', verdict: 'UNKNOWN', reason: 'profile absent from both channels_map copies (map only populates P0/P1/P2)' };
}

// Machine-readable answers to the 4 anomalies raised by the APP lane (t6), for t9 consumption.
const p1 = lab.profiles_calibrated.P1;
matrix.app_lane_crosscheck = {
  source_task: 't6 (lane APP) → verificado por t5 (lane JSON)',
  file: FILES.lab_master,
  sha256_at_audit: '099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4',
  q1_p1_level_vs_resolution: {
    verdict: 'CONFIRMADO (literal, sin corrección en ningún nodo)',
    impossible_pair: { codec: p1.settings.codec_full, resolution: p1.settings.resolution, fps: p1.settings.fps, level_capacity: '4K@60', required_level: 'L186' },
    nodes_declaring_the_level: {
      'profiles_calibrated.P1.settings.codec_full': p1.settings.codec_full,
      'profiles_calibrated.P1.settings.codec_string': p1.settings.codec_string,
      'profiles_calibrated.P1.headerOverrides.X-Stream-Codecs': p1.headerOverrides['X-Stream-Codecs'],
      'prisma_lab_sync_v20.codec_ladder_per_profile.P1.video': lab.prisma_lab_sync_v20.codec_ladder_per_profile.P1.video,
    },
    nodes_with_8k_capable_alternative: {
      'profiles_calibrated.P1.headerOverrides.X-APE-CODEC': p1.headerOverrides['X-APE-CODEC'],
      'profiles_calibrated.P1.headerOverrides.X-Codec-Support': p1.headerOverrides['X-Codec-Support'],
      'profiles_calibrated.P1.headerOverrides.X-HEVC-Level': p1.headerOverrides['X-HEVC-Level'],
    },
    hevc_level_8k120_nodes_found_in_P1: 0,
    emitted_triple_also_impossible: { codec: p1.headerOverrides['X-Stream-Codecs'], resolution: p1.headerOverrides['X-Stream-Resolution'], fps: p1.headerOverrides['X-Stream-FPS'], required_level: 'L156' },
  },
  q2_fps_all_profiles: {
    verdict: 'CONFIRMADO en settings.fps (6/6 = "120"); REFUTADA la lectura de que el fps emitido esté mal en los 6',
    settings_fps: Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((k) => [k, lab.profiles_calibrated[k].settings.fps])),
    emitted_X_Stream_FPS: Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((k) => [k, lab.profiles_calibrated[k].headerOverrides['X-Stream-FPS']])),
    differs_from_manifest_settings_fps: ['P2', 'P3', 'P4', 'P5'],
    differs_from_manifest_emitted_fps: ['P0'],
    X_APE_FPS_cardinality: Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((k) => [k, `${lab.profiles_calibrated[k].headerOverrides['X-APE-FPS'].split(',').length} values vs ${lab.profiles_calibrated[k].headerOverrides['X-APE-RESOLUTION'].split(',').length} resolutions`])),
  },
  q3_name_vs_resolution: {
    verdict: 'CONFIRMADO (nombre ≠ settings.resolution/maxResolution en P1..P5; los campos de emisión sí respetan el tier)',
    pairs: Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((k) => [k, {
      name: lab.profiles_calibrated[k].name,
      'settings.resolution': lab.profiles_calibrated[k].settings.resolution,
      'settings.maxResolution': lab.profiles_calibrated[k].settings.maxResolution,
      'headerOverrides.X-Stream-Resolution': lab.profiles_calibrated[k].headerOverrides['X-Stream-Resolution'],
      'kodiprop.max_resolution': lab.profiles_calibrated[k].kodiprop['inputstream.adaptive.max_resolution'],
      'vlcopt.video-width x video-height': `${lab.profiles_calibrated[k].vlcopt['video-width']}x${lab.profiles_calibrated[k].vlcopt['video-height']}`,
    }])),
    regression_origin: 'settings.resolution por tier existía en LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-ALIGNED.json (2026-05-23 01:12); el valor 3840x2160 para P3/P4/P5 aparece en …_BACKUP_20260607.json (2026-05-23 01:30) y se arrastra a B2→B3→B4/A1',
  },
  q4_chroma_subsampling: {
    verdict: 'CONFIRMADO y AMPLIADO: el valor corrupto está en los 6 perfiles, no sólo en P0',
    type: 'string',
    value: '168055555555556',
    paths: ['profiles_calibrated.P0.settings.chroma_subsampling', 'profiles_calibrated.P1.settings.chroma_subsampling', 'profiles_calibrated.P2.settings.chroma_subsampling', 'profiles_calibrated.P3.settings.chroma_subsampling', 'profiles_calibrated.P4.settings.chroma_subsampling', 'profiles_calibrated.P5.settings.chroma_subsampling'],
    same_pattern_elsewhere: [
      { path: 'profiles_calibrated.P0/P1/P2.optimized_timestamp', value: '46132.0850925926', class: 'Excel date serial as string' },
      { path: 'profiles_calibrated.P3/P4/P5.optimized_timestamp', value: '46132.0850810185', class: 'Excel date serial as string' },
      { path: 'config_global.Meta_Optimizer_Last_Fit', value: '0.699752', class: 'number serialized as string' },
      { path: 'config_global.Meta_Optimizer_Worst_Fit', value: '0.217547', class: 'number serialized as string' },
    ],
  },
  masking_note: 'El valor imposible 8K@120+L153 vive en los campos que alimentan los placeholders {profile.resolution}/{profile.fps}/{profile.codecs} de placeholders_map (usados por nivel3_per_layer.SI). Si la lista emitida sale correcta, la sustitución ocurre en runtime (lane APP); desde el JSON no hay nodo que lo corrija.',
};

matrix.summary = {  profiles_fail: Object.entries(matrix.profiles).filter(([, v]) => v.verdict_overall === 'FAIL').map(([k]) => k),
  profiles_pass: Object.entries(matrix.profiles).filter(([, v]) => v.verdict_overall === 'PASS').map(([k]) => k),
  isolated_failure_count: matrix.isolated_failures.length,
  total_law_evaluations: Object.values(matrix.profiles).reduce((a, p) => a + Object.keys(p.laws).length, 0) + Object.keys(matrix.cross_source.channels_map_alignment).length,
};

fs.writeFileSync(outPath, JSON.stringify(matrix, null, 2));
console.log('matrix written:', outPath, fs.statSync(outPath).size, 'bytes');
console.log('overall:', JSON.stringify(matrix.summary));
if (evidencePath) fs.writeFileSync(evidencePath, JSON.stringify(matrix.isolated_failures, null, 2));
