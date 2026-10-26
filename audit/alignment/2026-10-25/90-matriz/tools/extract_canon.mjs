#!/usr/bin/env node
// t9 / T8 — Extractor de celdas canónicas (Excel) + valores JSON, para VERIFICAR (no copiar) L10/L11.
// Read-only: solo lee EXCEL_PROFILES_EXTRACT.json y lab_master_22.6.0.json.
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION';
const EXTRACT = `${ROOT}/audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json`;
const LABMASTER = `${ROOT}/IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json`;

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();

const ex = JSON.parse(fs.readFileSync(EXTRACT, 'utf8'));
const lm = JSON.parse(fs.readFileSync(LABMASTER, 'utf8'));

const PROFILES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
// columnas B..G = P0..P5
const COL = { P0: 'B', P1: 'C', P2: 'D', P3: 'E', P4: 'F', P5: 'G' };

// Celdas de interés (fila -> qué es), según D-34/D-35/D-37 y el propio extracto.
const ROWS = {
  7: 'id', 8: 'name', 9: 'level', 10: 'quality',
  25: 'settings.resolution', 32: 'settings.fps', 37: 'settings.codec_full',
  40: 'chroma_subsampling(?)', 48: 'settings.maxResolution',
  49: 'bitrate?', 50: 'bitrate?'
};

function cell(profile) {
  const p = ex.profiles[profile];
  if (!p) return null;
  return p;
}

// Extrae por número de celda desde provenance de cada campo si existe, si no por settings.
function findCellNumbering() {
  // el extracto guarda {value, cell, kind} por campo; armamos índice inverso celda->valor
  const idx = {};
  for (const prof of PROFILES) {
    const p = ex.profiles[prof];
    if (!p) continue;
    idx[prof] = {};
    const walk = (node, path) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.cell === 'string' && 'value' in node) {
        const m = /^6_NIVEL_2_PROFILES!([A-Z]+)(\d+)$/.exec(node.cell);
        if (m) {
          const key = `${m[1]}${m[2]}`;
          if (!(key in idx[prof])) idx[prof][key] = { path, value: node.value, kind: node.kind };
        }
        return;
      }
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    };
    walk(p, '');
  }
  return idx;
}

const cells = findCellNumbering();

const out = {
  schema: 't9-canonical-extract/1.0',
  generatedBy: 'audit/alignment/2026-10-25/90-matriz/tools/extract_canon.mjs',
  provenance: {
    excelExtract: { path: EXTRACT, sha256: sha(EXTRACT) },
    labMaster: { path: LABMASTER, bytes: fs.statSync(LABMASTER).size, sha256: sha(LABMASTER) },
    excelCanonicalClaimed: ex.provenance?.file?.sha256 ?? null,
  },
  profiles: {},
};

for (const prof of PROFILES) {
  const col = COL[prof];
  const c = cells[prof] || {};
  const pick = (row) => c[`${col}${row}`] ?? null;
  const jp = lm.profiles_calibrated?.[prof] ?? null;
  out.profiles[prof] = {
    excel: {
      'resolution(row25)': pick(25),
      'fps(row32)': pick(32),
      'codec_full(row37)': pick(37),
      'chroma(row40)': pick(40),
      'maxResolution(row48)': pick(48),
      'row49': pick(49),
      'row50': pick(50),
      'name(row8)': pick(8),
      'level(row9)': pick(9),
    },
    json: jp
      ? {
          'settings.resolution': jp.settings?.resolution,
          'settings.fps': jp.settings?.fps,
          'settings.codec_full': jp.settings?.codec_full,
          'settings.codec': jp.settings?.codec,
          'settings.chroma_subsampling': jp.settings?.chroma_subsampling,
          'settings.maxResolution': jp.settings?.maxResolution,
          'settings.maxBitrateKbps': jp.settings?.maxBitrateKbps,
          'settings.avgBitrateKbps': jp.settings?.avgBitrateKbps,
          'settings.headersCount': jp.settings?.headersCount,
          'headerOverrides key count': jp.headerOverrides ? Object.keys(jp.headerOverrides).length : null,
          'name': jp.name,
        }
      : null,
  };
}

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
