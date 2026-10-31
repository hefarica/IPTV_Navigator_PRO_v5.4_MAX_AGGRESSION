#!/usr/bin/env node
'use strict';
/**
 * R1 · Second targeted pass: DATERANGE ID uniqueness, I-FRAME/CMAF/HDR-METADATA
 * line shapes, and 8K/4K string census. Prints aggregate facts only.
 * Usage: node r1_probe2.js <playlist> [--out out.json]
 */
const fs = require('node:fs');
const readline = require('node:readline');

const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

async function main() {
  const path = process.argv[2];
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx !== -1 ? process.argv[outIdx + 1] : null;
  const R = {
    daterange: { count: 0, distinct_ids: 0, dup_ids: 0, id_samples: [], ids_unique_per_channel: null },
    samples: {},
    dist: { hdr_metadata: {}, daterange_id_prefix: {}, hdr_dv: {}, resolution_supremacy: {}, bitrate_anarchy: {}, cmdf: {} },
    iframe: { count: 0, with_uri: 0, with_resolution: 0, sample: null },
    cmaf_line: { count: 0, resolutions: {}, sample: null },
    stream_inf_lines: { count: 0, with_color_primaries: 0, with_transfer: 0, with_supplemental: 0, sample: null },
    count_8k_strings: { any_7680: 0, any_8k_token: 0, eight_kfake: 0 },
    logo_empty: 0,
    extinf_attrs_seen: {},
    catchup_attrs: 0,
    blank_between_blocks: 0,
  };
  const ids = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let n = 0;
  for await (const raw of rl) {
    n++;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') continue;
    if (line.startsWith('#EXT-X-DATERANGE:')) {
      R.daterange.count++;
      const m = /(?:^|,)ID="([^"]*)"/.exec(line);
      const id = m ? m[1] : '(no-id)';
      ids.set(id, (ids.get(id) || 0) + 1);
      if (R.daterange.id_samples.length < 8) R.daterange.id_samples.push(id);
      bump(R.dist.daterange_id_prefix, id.replace(/[-_].*$/, '').slice(0, 40));
    } else if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
      R.iframe.count++;
      if (/\bURI=/.test(line)) R.iframe.with_uri++;
      if (/\bRESOLUTION=/.test(line)) R.iframe.with_resolution++;
      if (!R.iframe.sample) R.iframe.sample = line.length > 300 ? line.slice(0, 300) + '…' : line;
    } else if (line.startsWith('#EXT-X-CMAF:')) {
      R.cmaf_line.count++;
      const m = /RESOLUTION=([0-9x]+)/.exec(line);
      bump(R.cmaf_line.resolutions, m ? m[1] : '(none)');
      if (!R.cmaf_line.sample) R.cmaf_line.sample = line;
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      R.stream_inf_lines.count++;
      if (line.includes('COLOR-PRIMARIES=')) R.stream_inf_lines.with_color_primaries++;
      if (line.includes('TRANSFER-CHARACTERISTICS=')) R.stream_inf_lines.with_transfer++;
      if (line.includes('SUPPLEMENTAL-CODECS=')) R.stream_inf_lines.with_supplemental++;
      if (!R.stream_inf_lines.sample) R.stream_inf_lines.sample = line;
    } else if (line.startsWith('#EXT-X-APE-HDR-METADATA:')) bump(R.dist.hdr_metadata, line.slice(24));
    else if (line.startsWith('#EXT-X-APE-HDR-DV:')) bump(R.dist.hdr_dv, line.slice(19));
    else if (line.startsWith('#EXT-X-APE-RESOLUTION-SUPREMACY:')) bump(R.dist.resolution_supremacy, line.slice(30));
    else if (line.startsWith('#EXT-X-APE-BITRATE-ANARCHY:')) bump(R.dist.bitrate_anarchy, line.slice(27));
    else if (line.startsWith('#EXT-X-APE-8KFAKE')) R.count_8k_strings.eight_kfake++;
    if (line.includes('7680x4320')) R.count_8k_strings.any_7680++;
    if (/8K120|8K-MASTER|8K Master/.test(line)) R.count_8k_strings.any_8k_token++;
    if (line.startsWith('#EXTINF:')) {
      const s = line.slice(8); const sp = s.indexOf(' ');
      const attrs = sp === -1 ? '' : s.slice(sp + 1);
      const re = /([A-Za-z0-9_-]+)="([^"]*)"/g; let m;
      while ((m = re.exec(attrs))) { bump(R.extinf_attrs_seen, m[1]); if (m[1] === 'tvg-logo' && m[2] === '') R.logo_empty++; if (m[1].startsWith('catchup')) R.catchup_attrs++; }
    }
  }
  rl.close();
  R.daterange.distinct_ids = ids.size;
  R.daterange.dup_ids = [...ids.values()].filter((v) => v > 1).reduce((s, v) => s + v - 1, 0);
  R.daterange.ids_unique_per_channel = ids.size === 1 ? 'single-id-shared-by-every-block' : 'multiple';
  for (const k of Object.keys(R.dist)) R.dist[k] = top(R.dist[k], 12);
  R.cmaf_line.resolutions = top(R.cmaf_line.resolutions, 6);
  R.total_lines = n;
  const json = JSON.stringify(R, null, 2);
  if (out) { fs.writeFileSync(out, json); console.log(`wrote ${out}`); } else console.log(json);
}
main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
