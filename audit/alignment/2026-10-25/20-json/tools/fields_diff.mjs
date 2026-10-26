#!/usr/bin/env node
// Field-set + credential-embedding quantification for the channels_map copies. Values never printed.
import fs from 'node:fs';
const dir = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/audit/alignment/2026-10-25/20-json/tools';
const load = (n) => JSON.parse(fs.readFileSync(`${dir}/${n}`, 'utf8'));
const F = load('scan_frontend.json'), B = load('scan_backend.json'), D = load('scan_frontend_data.json');
const fields = (s) => new Set((s.field_presence_sorted || []).map(([k]) => k));
const fF = fields(F), fB = fields(B), fD = fields(D);
const diff = (a, b) => [...a].filter((x) => !b.has(x));
const out = {
  field_counts: { frontend: fF.size, backend: fB.size, frontend_data: fD.size },
  fields_in_frontend_only: diff(fF, fB),
  fields_in_backend_only: diff(fB, fF),
  fields_in_backend_only_vs_data: diff(fB, fD),
  fields_in_frontend_data_only: diff(fD, fB),
  nested_objects: { frontend: F.nested_object_fields, backend: B.nested_object_fields, frontend_data: D.nested_object_fields },
  credential_fields: {
    frontend: { username: F.secret_key_hits.username || 0, password: F.secret_key_hits.password || 0 },
    backend: B.secret_key_hits,
    frontend_data: D.secret_key_hits,
  },
  depth: { frontend: F.depth_max, backend: B.depth_max, frontend_data: D.depth_max },
  record_size: { frontend: F.record_size, backend: B.record_size, frontend_data: D.record_size },
  avg_record_size: { frontend: F.avg_record_size, backend: B.avg_record_size, frontend_data: D.avg_record_size },
};
fs.writeFileSync(`${dir}/fields_diff.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
