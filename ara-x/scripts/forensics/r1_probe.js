#!/usr/bin/env node
'use strict';
/**
 * R1 · Targeted probe for facts the aggregate analyzer does not keep:
 *   CMAF truthfulness, 8K wire declarations, DATERANGE/SID uniqueness,
 *   URL credential shape (masked), LL-HLS placement, HDR mode mix.
 *
 * Single streaming pass. Never prints user/pass values: paths are shape-masked.
 *
 * Usage: node r1_probe.js <playlist> [--out probe.json]
 */
const fs = require('node:fs');
const readline = require('node:readline');

const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const top = (o, n = 20) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

async function main() {
  const path = process.argv[2];
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx !== -1 ? process.argv[outIdx + 1] : null;
  if (!path) { console.error('usage: r1_probe.js <playlist> [--out probe.json]'); process.exit(2); }

  const R = {
    file: path.replace(/\\/g, '/'),
    bytes: fs.statSync(path).size,
    header_lines: [],
    start_lines: [],
    ara_tags: 0,
    resolution_7680: 0,
    resolution_2160: 0,
    cmaf: { map_tag: 0, key_tag: 0, media_tag: 0, endlist: 0, pdt: 0, media_sequence: 0, container: {}, init_segment: {} },
    apes: { '8kfake_sample': null, '4kpremium_sample': null, '4kfalse_samples': {}, '8kfake_needs_dv': null },
    hdr: { kodi_hdr_mode: {}, dv_profile: {}, hdr_transfer: {}, hdr_primaries: {}, hdr_range: {}, hdr_dv_mode: {} },
    daterange: { count: 0, distinct_ids: 0, dup_ids: 0, ids_sample: [] },
    sid: { count: 0, distinct: 0, dups: 0, dup_sample: [] },
    nonce: { count: 0, distinct: 0 },
    urls: { count: 0, with_at: 0, with_userinfo_scheme: 0, path_shape_top: [], provider_hosts: {}, query_present: 0 },
    exthttp: { with_url_value: 0 },
    lab: {},
    misc: { ph_headers: 0, empty_lines: 0 },
  };

  const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  const seenSid = new Map(), seenDr = new Map(), seenNonce = new Set();
  let n = 0, inHeader = true, drSample = [];

  for await (const raw of rl) {
    n++;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') { R.misc.empty_lines++; continue; }
    if (inHeader && !line.startsWith('#EXTINF:')) {
      if (R.header_lines.length < 140) R.header_lines.push(line.length > 320 ? line.slice(0, 320) + '…' : line);
    } else inHeader = false;

    if (line.startsWith('#EXT-X-START')) R.start_lines.push({ line: n, v: line });
    if (line.startsWith('#EXT-X-ARA')) R.ara_tags++;
    if (line.includes('RESOLUTION=7680x4320')) R.resolution_7680++;
    if (line.includes('RESOLUTION=3840x2160')) R.resolution_2160++;

    if (line.startsWith('#EXT-X-MAP')) R.cmaf.map_tag++;
    else if (line.startsWith('#EXT-X-KEY')) R.cmaf.key_tag++;
    else if (line.startsWith('#EXT-X-MEDIA:')) R.cmaf.media_tag++;
    else if (line.startsWith('#EXT-X-ENDLIST')) R.cmaf.endlist++;
    else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME')) R.cmaf.pdt++;
    else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) R.cmaf.media_sequence++;
    else if (line.startsWith('#EXT-X-CMAF-CONTAINER:')) bump(R.cmaf.container, line.slice(21));
    else if (line.startsWith('#EXT-X-CMAF-INIT-SEGMENT:')) bump(R.cmaf.init_segment, line.slice(24));
    else if (line.startsWith('#EXT-X-APE-8KFAKE')) { if (!R.apes['8kfake_sample']) R.apes['8kfake_sample'] = line; }
    else if (line.startsWith('#EXT-X-APE-4K-PREMIUM')) { if (!R.apes['4kpremium_sample']) R.apes['4kpremium_sample'] = line; }
    else if (line.startsWith('#EXT-X-APE-4KFALSE')) {
      const k = line.split(':')[0];
      if (!R.apes['4kfalse_samples'][k]) R.apes['4kfalse_samples'][k] = line.length > 200 ? line.slice(0, 200) + '…' : line;
    } else if (line.startsWith('#EXT-X-DATERANGE:')) {
      R.daterange.count++;
      const m = /(?:^|,)ID="([^"]*)"/.exec(line.slice(18));
      const id = m ? m[1] : '(no-id)';
      if (seenDr.has(id)) R.daterange.dup_ids++; else { seenDr.set(id, 1); if (drSample.length < 6) drSample.push(id); }
    } else if (line.startsWith('#EXT-X-CMAF-IDEMPOTENCIA:')) {
      const m = /SID=([^,]+)/.exec(line);
      if (m) { R.sid.count++; if (seenSid.has(m[1])) { R.sid.dups++; if (R.sid.dup_sample.length < 5) R.sid.dup_sample.push(m[1].slice(0, 8) + '…'); } else seenSid.set(m[1], 1); }
    } else if (line.startsWith('#KODIPROP:')) {
      if (line.includes('hdr_mode=')) bump(R.hdr.kodi_hdr_mode, line.split('hdr_mode=')[1] || '');
    } else if (line.startsWith('#EXT-X-APE-DV-PROFILE:')) bump(R.hdr.dv_profile, line.slice(22));
    else if (line.startsWith('#EXT-X-APE-HDR-TRANSFER:')) bump(R.hdr.hdr_transfer, line.slice(23));
    else if (line.startsWith('#EXT-X-APE-HDR-PRIMARIES:')) bump(R.hdr.hdr_primaries, line.slice(24));
    else if (line.startsWith('#EXT-X-APE-HDR-RANGE:')) bump(R.hdr.hdr_range, line.slice(21));
    else if (line.startsWith('#EXT-X-APE-HDR-DV:')) bump(R.hdr.hdr_dv_mode, line.slice(19));
    else if (line.startsWith('#EXT-X-APE-LAB-DNA:')) R.lab.dna = line.slice(21);
    else if (line.startsWith('#EXT-X-APE-CHANNELS:')) R.lab.channels = line.slice(20);

    if (line.startsWith('#')) continue;

    // ---- URL line ----
    R.urls.count++;
    if (line.includes('@')) R.urls.with_at++;
    const mm = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(line);
    if (mm) {
      const host = mm[2].toLowerCase();
      const segs = mm[3].split('/').filter(Boolean);
      // provider host = segment after /cdn/ when present
      let shape;
      if (segs[0] === 'cdn' && segs.length >= 3) {
        bump(R.urls.provider_hosts, segs[1]);
        shape = '/' + segs.slice(0, 4).map((s) => (s.length >= 4 ? `<${s.length}c>` : s)).join('/') + '/…';
      } else {
        shape = '/' + segs.slice(0, 2).map((s) => (s.length >= 4 ? `<${s.length}c>` : s)).join('/') + '/…';
      }
      if (!R.urls._shape) R.urls._shape = {};
      bump(R.urls._shape, shape);
      if (mm[4]) R.urls.query_present++;
    }
  }
  rl.close();
  R.total_lines = n;
  R.daterange.distinct_ids = seenDr.size;
  R.daterange.ids_sample = drSample;
  R.sid.distinct = seenSid.size;
  R.urls.path_shape_top = top(R.urls._shape || {}, 12);
  delete R.urls._shape;
  R.urls.provider_hosts = top(R.urls.provider_hosts, 25);
  R.cmaf.container = top(R.cmaf.container, 6);
  R.cmaf.init_segment = top(R.cmaf.init_segment, 6);
  R.hdr = {
    kodi_hdr_mode: top(R.hdr.kodi_hdr_mode, 8), dv_profile: top(R.hdr.dv_profile, 5),
    hdr_transfer: top(R.hdr.hdr_transfer, 5), hdr_primaries: top(R.hdr.hdr_primaries, 5),
    hdr_range: top(R.hdr.hdr_range, 5), hdr_dv_mode: top(R.hdr.hdr_dv_mode, 5),
  };
  const json = JSON.stringify(R, null, 2);
  if (out) { fs.writeFileSync(out, json); console.log(`wrote ${out} (${json.length} B)`); } else console.log(json);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
