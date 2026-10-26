#!/usr/bin/env node
// t9 / T8 — ¿cuál artefacto JSON es el export del Excel canónico? (D-02 precedencia / D-20)
// Read-only. Compara las 6 tuplas canónicas contra los 4 candidatos JSON de Downloads + lab_master.
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION';
const DL = 'C:/Users/HFRC/Downloads';
const EXTRACT = `${ROOT}/audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json`;

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const ex = JSON.parse(fs.readFileSync(EXTRACT, 'utf8'));

// índice celda->valor por perfil (igual que extract_canon)
const COL = { P0: 'B', P1: 'C', P2: 'D', P3: 'E', P4: 'F', P5: 'G' };
const PROFILES = Object.keys(COL);
const cells = {};
for (const prof of PROFILES) {
  cells[prof] = {};
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.cell === 'string' && 'value' in node) {
      const m = /^6_NIVEL_2_PROFILES!([A-Z]+)(\d+)$/.exec(node.cell);
      if (m && !(`${m[1]}${m[2]}` in cells[prof])) cells[prof][`${m[1]}${m[2]}`] = node.value;
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(ex.profiles[prof], '');
}
const canon = (prof, row) => cells[prof][`${COL[prof]}${row}`] ?? null;

const CANDIDATES = [
  { id: 'lab_master_repo', path: `${ROOT}/IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` },
  { id: 'CRYSTAL-4K-UHD', path: `${DL}/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json` },
  { id: 'EXPORT_20260611_020645', path: `${DL}/LAB_CALIBRATED_20260611_020645.json` },
  { id: 'MEMC-TOTAL-8K120_BACKUP_20260607', path: `${DL}/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120_BACKUP_20260607.json` },
  { id: 'MEMC-TOTAL-8K120', path: `${DL}/LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120.json` },
];

const FIELDS = [
  ['settings.resolution', 25],
  ['settings.fps', 32],
  ['settings.codec_full', 37],
  ['settings.maxResolution', 48],
];

const out = { schema: 't9-json-export-identity/1.0', excel: ex.provenance.file, candidates: [] };

for (const c of CANDIDATES) {
  if (!fs.existsSync(c.path)) { out.candidates.push({ id: c.id, path: c.path, status: 'MISSING' }); continue; }
  let j;
  try { j = JSON.parse(fs.readFileSync(c.path, 'utf8')); } catch (e) { out.candidates.push({ id: c.id, path: c.path, status: 'PARSE_ERROR', error: String(e).slice(0, 160) }); continue; }
  const rec = { id: c.id, path: c.path, bytes: fs.statSync(c.path).size, sha256: sha(c.path), profiles: {}, totalDiffs: 0, totalCompares: 0 };
  for (const prof of PROFILES) {
    const jp = j.profiles_calibrated?.[prof];
    const row = { diffs: [] };
    if (!jp) { row.missing = true; rec.profiles[prof] = row; continue; }
    for (const [jpath, excelRow] of FIELDS) {
      const leaf = jpath.split('.').pop();
      const jv = jp.settings?.[leaf] ?? null;
      const ev = canon(prof, excelRow);
      rec.totalCompares++;
      if (String(jv) !== String(ev)) { row.diffs.push({ field: jpath, excelCell: `6_NIVEL_2_PROFILES!${COL[prof]}${excelRow}`, excel: ev, json: jv }); rec.totalDiffs++; }
    }
    rec.profiles[prof] = row;
  }
  out.candidates.push(rec);
}

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
