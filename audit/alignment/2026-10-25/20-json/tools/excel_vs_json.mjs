#!/usr/bin/env node
// JSON (lab_master) vs CANONICAL EXCEL branch (6_NIVEL_2_PROFILES) field-by-field,
// citing hoja!celda from t4's EXCEL_PROFILES_EXTRACT.json. Read-only.
import fs from 'node:fs';
const EX = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json';
const JSONP = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json';
const out = process.argv[2] || 'excel_vs_json.json';

const ex = JSON.parse(fs.readFileSync(EX, 'utf8').replace(/^\uFEFF/, ''));
const lab = JSON.parse(fs.readFileSync(JSONP, 'utf8').replace(/^\uFEFF/, ''));

// JSON path (inside profiles_calibrated.Pn)  ->  [excel container, excel flat key]
const MAP = [
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

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const cellOf = (node) => (node && typeof node === 'object' && 'cell' in node ? node.cell : null);
const valOf = (node) => (node && typeof node === 'object' && 'value' in node ? node.value : null);

// Level capacity model (same as build_matrix.mjs)
const HEVC_CAP = { 90: [1, 30], 93: [2, 30], 120: [3, 30], 123: [3, 60], 150: [4, 30], 153: [4, 60], 156: [4, 120], 180: [5, 30], 183: [5, 60], 186: [5, 120] };
const AVC_CAP = { 30: [1, 30], 31: [2, 30], 40: [3, 30], 42: [3, 60] };
const RES_RANK = { '854x480': 1, '640x360': 1, '1280x720': 2, '1920x1080': 3, '2560x1440': 3, '3840x2160': 4, '7680x4320': 5 };
function capOf(codec) {
  if (typeof codec !== 'string') return null;
  let m = codec.match(/^hvc1\.\d\.\d\.L(\d{2,3})\.B\d$/i);
  if (m) return { family: 'HEVC', level: Number(m[1]), cap: HEVC_CAP[Number(m[1])] || null };
  m = codec.match(/^avc1\.([0-9a-f]{6})$/i);
  if (m) { const l = parseInt(m[1].slice(4, 6), 16); return { family: 'AVC', level: l, cap: AVC_CAP[l] || null }; }
  if (/^dvh1\./i.test(codec)) return { family: 'DV', level: null, cap: null };
  if (/^av01\./i.test(codec)) return { family: 'AV1', level: null, cap: null };
  return null;
}

const report = {
  source_json: { path: JSONP, sha256: process.env.SHA_JSON || null },
  source_excel: { path: ex.provenance?.file?.path, sha256: ex.provenance?.sha256, sizeBytes: ex.provenance?.sizeBytes, mtimeUtc: ex.provenance?.mtimeUtc, sheet: ex.sheet, sheetDimension: ex.sheetDimension, readCopyMatchesSource: ex.provenance?.readCopyMatchesSource },
  decision_context: { D20_canonical_branch: 'Downloads/APE_M3U8_LAB_v8_FIXED.xlsm (663EF44E…)', D22_P1: 'export sheet 6_NIVEL_2_PROFILES row 25/37 = 3840x2160 + hvc1.2.4.L153.B0', D15_fps: 'Excel row 32 = 120 in all 6 profiles; level-capacity correction required' },
  profiles: {},
};

for (const pk of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
  const jp = lab.profiles_calibrated[pk];
  const ep = ex.profiles[pk];
  const rows = [];
  for (const [jpath, container, ekey] of MAP) {
    const jval = get(jp, jpath);
    const node = ep?.[container]?.[ekey];
    const eval_ = valOf(node);
    const cell = cellOf(node);
    const jnorm = jval === undefined || jval === null ? null : String(jval);
    const enorm = eval_ === undefined || eval_ === null ? null : String(eval_);
    rows.push({
      json_path: `profiles_calibrated.${pk}.${jpath}`,
      excel_key: ekey, excel_cell: cell,
      excel_value: enorm, json_value: jnorm,
      status: jnorm === null && enorm === null ? 'UNKNOWN_BOTH_ABSENT' : enorm === null ? 'JSON_ONLY' : jnorm === null ? 'EXCEL_ONLY' : jnorm === enorm ? 'MATCH' : 'DIFF',
    });
  }
  const diffs = rows.filter((r) => r.status === 'DIFF');
  // D-15: level-safe fps ceiling for the CANONICAL (resolution, codec)
  const canRes = rows.find((r) => r.excel_key === 'settings.resolution')?.excel_value;
  const canCodec = rows.find((r) => r.excel_key === 'settings.codec_full')?.excel_value;
  const canFps = rows.find((r) => r.excel_key === 'settings.fps')?.excel_value;
  const c = capOf(canCodec);
  const rank = RES_RANK[canRes] ?? null;
  let levelSafeFps = null;
  let fpsVerdict = 'UNKNOWN';
  if (c?.cap && rank !== null) {
    const [capRank, capFps] = c.cap;
    levelSafeFps = capRank >= rank ? capFps : 0;
    fpsVerdict = Number(canFps) <= levelSafeFps ? 'PASS' : 'FAIL';
  }
  report.profiles[pk] = {
    canonical_excel: { resolution: canRes, codec_full: canCodec, fps: canFps },
    field_rows: rows,
    diff_count: diffs.length,
    diffs,
    D15_fps_check: {
      declared_fps: canFps, codec: canCodec, resolution: canRes,
      level_capacity_fps_ceiling: levelSafeFps, verdict: fpsVerdict,
      recommendation: fpsVerdict === 'FAIL'
        ? `bajar fps a <= ${levelSafeFps} (o subir el nivel del codec para sostener ${canFps})`
        : 'fps declarado soportado por el nivel',
    },
  };
}

fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log('written', out);
for (const [pk, p] of Object.entries(report.profiles)) {
  console.log(`${pk} | canónico: ${p.canonical_excel.resolution} ${p.canonical_excel.codec_full} @${p.canonical_excel.fps} | DIFFs=${p.diff_count} | D15 fps ${p.D15_fps_check.verdict} (techo nivel=${p.D15_fps_check.level_capacity_fps_ceiling})`);
  for (const d of p.diffs) console.log(`     DIFF ${d.excel_key} [${d.excel_cell}] excel=${JSON.stringify(d.excel_value)} vs json=${JSON.stringify(d.json_value)}`);
}
