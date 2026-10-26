#!/usr/bin/env node
// Cross-file identity diff between the channels_map copies. Read-only, no secret values.
import fs from 'node:fs';
const dir = process.argv[2];
const load = (n) => JSON.parse(fs.readFileSync(`${dir}/${n}`, 'utf8'));
const F = load('ids_frontend.json'), B = load('ids_backend.json'), D = load('ids_frontend_data.json');
const S = (a) => new Set(a);
const inter = (a, b) => [...a].filter((x) => b.has(x));
const fk = S(F.top_keys), bk = S(B.top_keys), dk = S(D.top_keys);
const fsid = S(F.stream_ids), bsid = S(B.stream_ids), dsid = S(D.stream_ids);
const out = {
  records: { frontend: F.record_count, backend: B.record_count, frontend_data: D.record_count },
  top_keys: { frontend: fk.size, backend: bk.size, frontend_data: dk.size },
  backend_vs_frontend_data: {
    shared: inter(bk, dk).length,
    backend_only: [...bk].filter((x) => !dk.has(x)).length,
    frontend_data_only: [...dk].filter((x) => !bk.has(x)).length,
    backend_only_sample: [...bk].filter((x) => !dk.has(x)).slice(0, 12),
    frontend_data_only_sample: [...dk].filter((x) => !bk.has(x)).slice(0, 12),
  },
  stream_ids: {
    frontend: fsid.size, backend: bsid.size, frontend_data: dsid.size,
    frontend_and_backend: inter(fsid, bsid).length,
    frontend_only: [...fsid].filter((x) => !bsid.has(x)).length,
    backend_only: [...bsid].filter((x) => !fsid.has(x)).length,
    frontend_only_sample: [...fsid].filter((x) => !bsid.has(x)).slice(0, 12),
    backend_only_sample: [...bsid].filter((x) => !fsid.has(x)).slice(0, 12),
  },
  tvg_ids: { frontend: F.tvg_ids.length, backend: B.tvg_ids.length, frontend_data: D.tvg_ids.length },
  hosts: { frontend: F.hosts, backend: B.hosts, frontend_data: D.hosts },
};
fs.writeFileSync(`${dir}/channels_map_diff.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
