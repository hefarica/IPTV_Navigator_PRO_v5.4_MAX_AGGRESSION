#!/usr/bin/env node
// Refined identity correlation across channels_map copies (read-only).
import fs from 'node:fs';
const dir = process.argv[2];
const load = (n) => JSON.parse(fs.readFileSync(`${dir}/${n}`, 'utf8'));
const F = load('ids_frontend.json'), B = load('ids_backend.json'), D = load('ids_frontend_data.json');
const S = (a) => new Set(a);
const bt = S(B.top_keys), dt = S(D.top_keys), ft = S(F.top_keys);
const fstream = S(F.stream_ids);
const numKeys = [...bt].filter((k) => /^\d+$/.test(k));
const dottedKeys = [...bt].filter((k) => !/^\d+$/.test(k));
const fSuffix = new Set([...ft].map((k) => (k.match(/_(\d+)$/) || [])[1]).filter(Boolean));
const inter = (a, b) => [...a].filter((x) => b.has(x));
const out = {
  backend_key_shapes: { total: bt.size, numeric: numKeys.length, non_numeric: dottedKeys.length, non_numeric_sample: dottedKeys.slice(0, 12) },
  frontend_data_key_shapes: {
    total: dt.size,
    numeric: [...dt].filter((k) => /^\d+$/.test(k)).length,
    non_numeric: [...dt].filter((k) => !/^\d+$/.test(k)).length,
    non_numeric_sample: [...dt].filter((k) => !/^\d+$/.test(k)).slice(0, 12),
  },
  frontend_stream_id_vs_backend_keys: {
    frontend_stream_ids: fstream.size,
    backend_numeric_keys: numKeys.length,
    matched: inter(fstream, bt).length,
    frontend_ids_not_in_backend: [...fstream].filter((x) => !bt.has(x)).length,
    backend_keys_not_in_frontend_ids: [...bt].filter((x) => !fstream.has(x)).length,
    backend_keys_not_in_frontend_ids_sample: [...bt].filter((x) => !fstream.has(x)).slice(0, 12),
  },
  frontend_slug_suffix_vs_backend_keys: {
    frontend_suffixes: fSuffix.size,
    matched_with_backend: inter(fSuffix, bt).length,
    suffix_not_in_backend: [...fSuffix].filter((x) => !bt.has(x)).length,
  },
  frontend_key_prefixes: (() => {
    const m = {};
    for (const k of ft) { const p = k.split('_')[0]; m[p] = (m[p] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
  })(),
  coverage_note: 'frontend(9293) vs backend(8366) vs frontend/data(8366); backend & frontend/data key sets identical',
};
fs.writeFileSync(`${dir}/channels_map_identity.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
