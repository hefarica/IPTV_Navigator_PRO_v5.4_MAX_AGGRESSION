#!/usr/bin/env node
'use strict';
/**
 * R1 · Streaming structural forensics for APE M3U8 catalogues.
 *
 * Single pass, constant memory per channel, no credentials emitted:
 *   - URLs are reduced to sha256 + host:port + masked shape.
 *   - Everything else is aggregated counts/distributions.
 *
 * Usage:
 *   node ara-x/scripts/forensics/r1_analyze.js <playlist> [--out <json>] [--label <name>]
 *
 * Output JSON is deliberately machine-readable so the R1 report can quote it verbatim.
 */
const fs = require('node:fs');
const readline = require('node:readline');
const crypto = require('node:crypto');

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function parseAttrList(s, sep = ',') {
  // RFC 8216 attribute-list parser (quoted strings may contain commas)
  const out = Object.create(null);
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && (s[i] === sep || s[i] === ' ')) i++;
    if (i >= n) break;
    let eq = s.indexOf('=', i);
    if (eq === -1) break;
    const key = s.slice(i, eq).trim();
    i = eq + 1;
    let val = '';
    if (s[i] === '"') {
      i++;
      let j = i;
      while (j < n) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '"') break;
        j++;
      }
      val = s.slice(i, j);
      i = j + 1;
      while (i < n && s[i] !== sep) i++;
    } else {
      let j = i;
      while (j < n && s[j] !== sep) j++;
      val = s.slice(i, j).trim();
      i = j;
    }
    out[key] = val;
  }
  return out;
}

function bump(map, key, inc = 1) {
  if (map instanceof Map) map.set(key, (map.get(key) || 0) + inc);
  else map[key] = (map[key] || 0) + inc;
}

function topN(map, n = 40) {
  const arr = [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return { total_distinct: arr.length, top: arr.slice(0, n).map(([k, v]) => ({ key: k, count: v })) };
}

function hostOf(url) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(url);
  return m ? { scheme: m[1].toLowerCase(), host: m[2].toLowerCase() } : { scheme: '(none)', host: '(none)' };
}

function hostOnly(url) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(url);
  if (!m) return '<no-host>';
  const segs = (url.slice(m[0].length).split('/') || []);
  const shape = segs.map((s) => (s.length >= 6 ? `<${s.length}c>` : s)).join('/');
  return m[1] + '://' + m[2] + shape;
}

// -------------------- tag taxonomy (RFC 8216 + Apple HLS 2nd ed. + APE) --------------------
const MEDIA_PLAYLIST_ONLY = new Set([
  '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE', '#EXT-X-DISCONTINUITY-SEQUENCE',
  '#EXT-X-ENDLIST', '#EXT-X-PLAYLIST-TYPE', '#EXT-X-I-FRAMES-ONLY',
  '#EXT-X-PART', '#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL', '#EXT-X-PRELOAD-HINT',
  '#EXT-X-RENDITION-REPORT', '#EXT-X-SKIP', '#EXT-X-BITRATE', '#EXT-X-GAP',
]);
const MASTER_PLAYLIST_ONLY = new Set([
  '#EXT-X-MEDIA', '#EXT-X-STREAM-INF', '#EXT-X-I-FRAME-STREAM-INF',
  '#EXT-X-SESSION-DATA', '#EXT-X-SESSION-KEY', '#EXT-X-CONTENT-STEERING',
]);
const BOTH = new Set(['#EXT-X-VERSION', '#EXT-X-INDEPENDENT-SEGMENTS', '#EXT-X-START', '#EXT-X-DEFINE', '#EXT-X-DATERANGE']);
// Tags RFC 8216 / Apple HLS 2nd ed. actually define (for "unknown tag" accounting).
const KNOWN_HLS = new Set([
  '#EXTM3U', '#EXTINF', ...MEDIA_PLAYLIST_ONLY, ...MASTER_PLAYLIST_ONLY, ...BOTH,
  '#EXT-X-KEY', '#EXT-X-MAP', '#EXT-X-BYTERANGE', '#EXT-X-DISCONTINUITY',
  '#EXT-X-PROGRAM-DATE-TIME', '#EXT-X-ALLOW-CACHE', '#EXT-X-STREAM-INF',
]);
const TOXIC_HEADERS = ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority', 'Upgrade-Insecure-Requests'];
const TRACKED_HEADERS = ['X-Resolution', 'X-Video-Range', 'X-Codec-Full', 'X-APE-Profile', 'X-Framerate', 'X-Expected-Bitrate', 'X-Device-Capabilities', 'X-HDR-Nits'];

// -------------------- analyser --------------------
async function analyze(path, label) {
  const st = fs.statSync(path);
  const res = {
    label,
    file: path.replace(/\\/g, '/'),
    bytes: st.size,
    sha256_partial_note: 'computed by caller (Get-FileHash / download wrapper)',
    lines: 0,
    empty_lines: 0,
    crlf_lines: 0,
    final_newline: false,
    header: { lines: 0, raw: [], tags: {} },
    tag_counts: {},
    tag_bytes: {},
    tag_unknown: {},
    placement: { media_only_in_master: {}, master_only_ok: {}, both: {} },
    channels: {
      count: 0,
      blocks_missing_url: 0,
      blocks_multi_url: 0,
      blocks_zero_stream_inf: 0,
      blocks_multi_stream_inf: 0,
      blocks_multi_extinf: 0,
      stream_inf_not_followed_by_uri: 0,
      stream_inf_not_adjacent_to_url: 0,
      stream_inf_per_block: {},
      blocks_stream_inf_adjacent_ok: 0,
      lines_per_block: { min: null, max: 0, sum: 0 },
      bytes_per_block: { min: null, max: 0, sum: 0 },
      shapes: {},
    },
    extinf: { attrs: {}, attr_missing: {}, durations: {}, empty_attr_values: {} },
    stream_inf: { bandwidth: {}, avg_bandwidth: {}, resolution: {}, codecs: {}, video_range: {}, frame_rate: {}, hdcp: {}, supplemental: {}, attrs_seen: {}, missing: {} },
    media_with_uri: 0,
    iframe_stream_inf: 0,
    iframe_stream_inf_with_uri: 0,
    profile: {},
    codec_family: {},
    fps_attr: {},
    resolution_contradictions: { block_streaminf_8k: 0, block_streaminf_4k: 0, block_streaminf_fhd_while_4kdecl: 0 },
    dedup: { url_exact_dups: 0, url_norm_dups: 0, tvgid_dups: 0, name_group_dups: 0, name_dups: 0 },
    urls: { schemes: {}, hosts: {}, host_shapes_top: {} },
    logos: { hosts: {} },
    groups: {},
    countries: {},
    regions: {},
    ext_http: { count: 0, json_valid: 0, json_invalid: 0, header_count_dist: {}, key_presence: {}, value_dist: {}, toxic: {}, channels_with_toxic: 0, max_len: 0 },
    apes: {
      '4kfalse': 0, '8kfake': 0, '8kfake_attrs': {}, l153_decl: 0, pq_decl: 0,
      kodi_hdr_bt2020: 0, kodi_hdr_sdr: 0, hlg_true: 0, dv_true: 0,
      x_resolution_1080: 0, x_resolution_2160: 0, streaminf_resolution_2160: 0,
      lcevc: 0, ai_sr: 0, ai_fi: 0, drm_L1: 0,
    },
    llhls: { server_control: 0, part_inf: 0, targetduration: 0, part: 0, preload: 0, rendition_report: 0, skip: 0, media_sequence: 0, endlist: 0, pdt: 0 },
    session_ids: { distinct_sid: 0, distinct_nonce: 0, distinct_list_hash: 0, distinct_spoof_ip: 0, sid_samples: 0 },
    footer: {},
    last_lines: [],
    elapsed_ms: 0,
  };

  const t0 = Date.now();
  const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });

  let inHeader = true;
  let block = null;
  let pendingStreamInf = null;
  const seenUrl = new Map(), seenUrlNorm = new Map(), seenTvgId = new Map(), seenNameGroup = new Map(), seenName = new Map();
  const sidSet = new Set(), nonceSet = new Set(), hashSet = new Set(), spoofIpSet = new Set();
  const tagCounts = new Map(), tagBytes = new Map(), unknownTags = new Map();
  const lineSizes = [];
  const tail = [];

  const P = res; // alias

  function closeBlock() {
    if (!block) return;
    const c = P.channels;
    c.count++;
    c.lines_per_block.sum += block.lines;
    c.bytes_per_block.sum += block.bytes;
    if (c.lines_per_block.min === null || block.lines < c.lines_per_block.min) c.lines_per_block.min = block.lines;
    if (c.bytes_per_block.min === null || block.bytes < c.bytes_per_block.min) c.bytes_per_block.min = block.bytes;
    if (block.lines > c.lines_per_block.max) c.lines_per_block.max = block.lines;
    if (block.bytes > c.bytes_per_block.max) c.bytes_per_block.max = block.bytes;
    if (block.extinf > 1) c.blocks_multi_extinf++;
    if (block.urls === 0) c.blocks_missing_url++;
    if (block.urls > 1) c.blocks_multi_url++;
    if (block.streamInf === 0) c.blocks_zero_stream_inf++;
    if (block.streamInf > 1) c.blocks_multi_stream_inf++;
    if (block.streamInf > 0 && !block.streamInfAdjacent) c.stream_inf_not_adjacent_to_url++;
    if (block.streamInf > 0 && block.streamInfAdjacent) c.blocks_stream_inf_adjacent_ok++;
    bump(P.channels.stream_inf_per_block, String(block.streamInf));
    const sig = sha(block.tagSeq.join('\u0001')).slice(0, 10);
    const shapeKey = `${block.lines}L|${block.tagSet.size}T|${block.streamInf}SI|${sig}`;
    if (pendingStreamInf) { c.stream_inf_not_followed_by_uri++; pendingStreamInf = null; }
    bump(P.channels.shapes, shapeKey);
    block = null;
  }

  for await (const raw of rl) {
    P.lines++;
    const isCRLF = raw.endsWith('\r');
    if (isCRLF) P.crlf_lines++;
    const line = isCRLF ? raw.slice(0, -1) : raw;

    tail.push(line);
    if (tail.length > 8) tail.shift();

    if (line === '') { P.empty_lines++; if (block) { block.lines++; block.bytes += 1; } continue; }

    if (inHeader) {
      if (line.startsWith('#EXTINF:')) {
        inHeader = false;
        P.header.lines = P.lines - 1;
      } else if (P.header.raw.length < 260) {
        P.header.raw.push(line);
      }
    }

    if (line.startsWith('#')) {
      const colon = line.indexOf(':');
      const tag = colon === -1 ? line : line.slice(0, colon);
      const bytes = Buffer.byteLength(line, 'utf8') + 1;
      bump(tagCounts, tag);
      bump(tagBytes, tag, bytes);

      if (!KNOWN_HLS.has(tag) && !tag.startsWith('#EXT-X-APE') && !tag.startsWith('#EXTVLCOPT') &&
          !tag.startsWith('#KODIPROP') && !tag.startsWith('#EXTHTTP') && !tag.startsWith('#EXTATTRFROMURL') &&
          !tag.startsWith('#EXT-X-ARA')) {
        bump(unknownTags, tag);
      }
      if (MEDIA_PLAYLIST_ONLY.has(tag) && isMasterCtx()) bump(P.placement.media_only_in_master, tag);
      if (BOTH.has(tag)) bump(P.placement.both, tag);

      // ---- specific tags ----
      if (tag === '#EXTINF') {
        if (block) closeBlock();          // a new #EXTINF terminates the previous channel block
        block = newBlock();
        block.extinf++;
        block.lines++;
        block.bytes += bytes;
        const attrStr = line.slice(8);
        // duration is up to first space; attribute-list follows
        const sp = attrStr.indexOf(' ');
        const dur = sp === -1 ? attrStr : attrStr.slice(0, sp);
        bump(P.extinf.durations, dur);
        const al = parseAttrList(sp === -1 ? '' : attrStr.slice(sp + 1), ' ');
        for (const [k, v] of Object.entries(al)) {
          bump(P.extinf.attrs, k);
          if (v === '') bump(P.extinf.empty_attr_values, k);
          if (k.startsWith('ape-')) { if (k === 'ape-profile') bump(P.profile, v); if (k === 'ape-codec-family') bump(P.codec_family, v); if (k === 'ape-fps') bump(P.fps_attr, v); }
        }
        for (const req of ['tvg-id', 'tvg-name', 'group-title']) if (!(req in al)) bump(P.extinf.attr_missing, req);
        if (al['tvg-id']) {
          const prev = seenTvgId.get(al['tvg-id']);
          if (prev !== undefined) P.dedup.tvgid_dups++; else seenTvgId.set(al['tvg-id'], P.channels.count);
        }
        if (al['tvg-name']) {
          const ng = al['tvg-name'] + '\u0000' + (al['group-title'] || '');
          if (seenNameGroup.has(ng)) P.dedup.name_group_dups++; else seenNameGroup.set(ng, P.channels.count);
          if (seenName.has(al['tvg-name'])) P.dedup.name_dups++; else seenName.set(al['tvg-name'], P.channels.count);
        }
        if (al['tvg-logo']) bump(P.logos.hosts, hostOf(al['tvg-logo']).host);
        if (al['group-title']) bump(P.groups, al['group-title']);
        if (al['ape-country']) bump(P.countries, al['ape-country']);
        if (al['ape-region']) bump(P.regions, al['ape-region']);
        continue;
      }
      if (tag === '#EXT-X-STREAM-INF') {
        if (!block) block = newBlock();
        block.streamInf = (block.streamInf || 0) + 1;
        block.lines++; block.bytes += bytes;
        noteTag(block, tag);
        const al = parseAttrList(line.slice(18));
        for (const k of Object.keys(al)) bump(P.stream_inf.attrs_seen, k);
        for (const req of ['BANDWIDTH', 'RESOLUTION', 'CODECS']) if (!(req in al)) bump(P.stream_inf.missing, req);
        if (al.BANDWIDTH) bump(P.stream_inf.bandwidth, al.BANDWIDTH);
        if (al['AVERAGE-BANDWIDTH']) bump(P.stream_inf.avg_bandwidth, al['AVERAGE-BANDWIDTH']);
        if (al.RESOLUTION) {
          bump(P.stream_inf.resolution, al.RESOLUTION);
          if (al.RESOLUTION === '7680x4320') P.resolution_contradictions.block_streaminf_8k++;
          if (al.RESOLUTION === '3840x2160') { P.resolution_contradictions.block_streaminf_4k++; P.apes.streaminf_resolution_2160++; }
        }
        if (al.CODECS) {
          bump(P.stream_inf.codecs, al.CODECS);
          if (/\b(?:hvc1|hev1)\.[0-9]+\.[0-9]+\.L153/i.test(al.CODECS)) P.apes.l153_decl++;
        }
        if (al['VIDEO-RANGE']) { bump(P.stream_inf.video_range, al['VIDEO-RANGE']); if (al['VIDEO-RANGE'] === 'PQ') P.apes.pq_decl++; }
        if (al['FRAME-RATE']) bump(P.stream_inf.frame_rate, al['FRAME-RATE']);
        if (al['HDCP-LEVEL']) bump(P.stream_inf.hdcp, al['HDCP-LEVEL']);
        if (al['SUPPLEMENTAL-CODECS']) bump(P.stream_inf.supplemental, al['SUPPLEMENTAL-CODECS']);
        pendingStreamInf = true;
        continue;
      }
      if (tag === '#EXT-X-MEDIA') {
        P.media_with_uri += /\bURI=/.test(line) ? 1 : 0;
        bump(P.placement.master_only_ok, tag);
        if (block) { block.lines++; block.bytes += bytes; noteTag(block, tag); }
        continue;
      }
      if (tag === '#EXT-X-I-FRAME-STREAM-INF') {
        P.iframe_stream_inf++;
        if (/\bURI=/.test(line)) P.iframe_stream_inf_with_uri++;
        if (block) { block.lines++; block.bytes += bytes; noteTag(block, tag); }
        continue;
      }
      if (tag === '#EXTHTTP') {
        P.ext_http.count++;
        if (block) { block.lines++; block.bytes += bytes; noteTag(block, tag); }
        const jsonStr = line.slice(9);
        if (line.length > P.ext_http.max_len) P.ext_http.max_len = line.length;
        let nHeaders = -1, ok = false;
        try {
          const obj = JSON.parse(jsonStr);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            ok = true; nHeaders = Object.keys(obj).length;
            bump(P.ext_http.header_count_dist, String(nHeaders));
            let toxicHits = 0;
            for (const h of Object.keys(obj)) {
              bump(P.ext_http.key_presence, h);
              if (TOXIC_HEADERS.includes(h)) { bump(P.ext_http.toxic, h); toxicHits++; }
            }
            for (const tk of TRACKED_HEADERS) {
              if (Object.prototype.hasOwnProperty.call(obj, tk)) {
                const bucket = P.ext_http.value_dist[tk] || (P.ext_http.value_dist[tk] = {});
                bump(bucket, String(obj[tk]).slice(0, 80));
              }
            }
            if (toxicHits) P.ext_http.channels_with_toxic++;
            const kc = obj['X-Codec-Full']; if (kc) bump(P.apes._codec_full || (P.apes._codec_full = new Map()), kc);
            const xr = obj['X-Resolution']; if (xr === '1920x1080') P.apes.x_resolution_1080++; else if (xr === '3840x2160') P.apes.x_resolution_2160++;
            const sid = obj['X-Request-Id']; if (sid) { /* too unique; skip */ }
          }
        } catch { P.ext_http.json_invalid++; }
        if (ok) P.ext_http.json_valid++;
        continue;
      }
      if (tag.startsWith('#EXT-X-APE-4KFALSE')) { P.apes['4kfalse']++; }
      if (tag === '#EXT-X-APE-8KFAKE' || tag === '#EXT-X-APE-8K-FAKE') {
        P.apes['8kfake']++;
        const al = parseAttrList(line.slice(line.indexOf(':') + 1));
        for (const [k, v] of Object.entries(al)) bump(P.apes['8kfake_attrs'], k + '=' + v);
      }
      if (tag === '#KODIPROP') {
        if (line.includes('hdr_bt2020=true')) P.apes.kodi_hdr_bt2020++;
        if (line.includes('hdr_mode=SDR')) P.apes.kodi_hdr_sdr++;
        if (line.includes('hdr_hlg=true')) P.apes.hlg_true++;
        if (line.includes('hdr_dolbyvision=true')) P.apes.dv_true++;
        if (line.includes('video_lcevc=true')) P.apes.lcevc++;
        if (line.includes('video_ai_sr=true')) P.apes.ai_sr++;
        if (line.includes('video_ai_fi=true')) P.apes.ai_fi++;
        if (line.includes('drm_level=L1')) P.apes.drm_L1++;
        const m = /network_session_id=(.*)$/.exec(line);
        if (m && block && block.sid === undefined) block.sid = m[1];
      }
      if (tag === '#EXT-X-CMAF-IDEMPOTENCIA') {
        const m = /SID=([^,]+)/.exec(line); if (m) { sidSet.add(m[1]); if (block && block.sidRaw === undefined) block.sidRaw = m[1]; }
      }
      if (tag === '#EXTATTRFROMURL') {
        const m = /X-APE-SPOOF-IP=(\S+)/.exec(line); if (m) spoofIpSet.add(m[1]);
      }
      if (tag === '#EXT-X-APE-CHANNELS') P.footer.declared_channels = line.slice(line.indexOf(':') + 1);
      if (tag === '#EXT-X-APE-VALIDATED') P.footer.validated = line.slice(line.indexOf(':') + 1);
      if (tag === '#EXT-X-APE-AUDIT-SCORECARD') P.footer.scorecard = line.slice(line.indexOf(':') + 1);
      if (tag === '#EXT-X-SERVER-CONTROL') P.llhls.server_control++;
      if (tag === '#EXT-X-PART-INF') P.llhls.part_inf++;
      if (tag === '#EXT-X-TARGETDURATION') P.llhls.targetduration++;
      if (tag === '#EXT-X-PART') P.llhls.part++;
      if (tag === '#EXT-X-PRELOAD-HINT') P.llhls.preload++;
      if (tag === '#EXT-X-RENDITION-REPORT') P.llhls.rendition_report++;
      if (tag === '#EXT-X-SKIP') P.llhls.skip++;
      if (tag === '#EXT-X-MEDIA-SEQUENCE') P.llhls.media_sequence++;
      if (tag === '#EXT-X-ENDLIST') P.llhls.endlist++;
      if (tag === '#EXT-X-PROGRAM-DATE-TIME') P.llhls.pdt++;

      if (block) { block.lines++; block.bytes += bytes; noteTag(block, tag); }
      continue;
    }
    // ---- URI line ----
    if (pendingStreamInf) { pendingStreamInf = false; if (block) block.streamInfAdjacent = (block.streamInfAdjacent || 0) + 1; }
    if (block) {
      block.urls++;
      block.lines++;
      block.bytes += Buffer.byteLength(line, 'utf8') + 1;
    }
    const h = sha(line);
    if (seenUrl.has(h)) P.dedup.url_exact_dups++; else seenUrl.set(h, P.channels.count);
    const norm = line.replace(/[?#].*$/, '');
    const hn = sha(norm);
    if (seenUrlNorm.has(hn)) P.dedup.url_norm_dups++; else seenUrlNorm.set(hn, P.channels.count);
    const { scheme, host } = hostOf(line);
    bump(P.urls.schemes, scheme);
    bump(P.urls.hosts, host);
  }
  closeBlock();
  rl.close();

  P.lines = P.lines;
  P.empty_lines = P.empty_lines;
  P.tag_counts = Object.fromEntries([...tagCounts.entries()].sort((a, b) => b[1] - a[1]));
  P.tag_bytes = Object.fromEntries([...tagBytes.entries()].sort((a, b) => b[1] - a[1]));
  P.tag_unknown = topN(unknownTags, 60);
  P.placement.media_only_in_master = sortObj(P.placement.media_only_in_master);
  P.placement.master_only_ok = sortObj(P.placement.master_only_ok);
  P.placement.both = sortObj(P.placement.both);
  P.channels.shapes = topN(mapFromObj(P.channels.shapes), 20);
  P.channels.stream_inf_per_block = topN(mapFromObj(P.channels.stream_inf_per_block), 20);
  P.extinf.attrs = sortObj(P.extinf.attrs);
  P.extinf.attr_missing = sortObj(P.extinf.attr_missing);
  P.extinf.durations = topN(mapFromObj(P.extinf.durations), 10);
  P.extinf.empty_attr_values = sortObj(P.extinf.empty_attr_values);
  for (const k of ['bandwidth', 'avg_bandwidth', 'resolution', 'codecs', 'video_range', 'frame_rate', 'hdcp', 'supplemental', 'attrs_seen', 'missing']) {
    P.stream_inf[k] = topN(mapFromObj(P.stream_inf[k]), 30);
  }
  P.profile = sortObj(P.profile);
  P.codec_family = sortObj(P.codec_family);
  P.fps_attr = sortObj(P.fps_attr);
  P.urls.schemes = sortObj(P.urls.schemes);
  P.urls.hosts = topN(mapFromObj(P.urls.hosts), 50);
  P.logos.hosts = topN(mapFromObj(P.logos.hosts), 30);
  P.groups = topN(mapFromObj(P.groups), 40);
  P.countries = topN(mapFromObj(P.countries), 30);
  P.regions = topN(mapFromObj(P.regions), 30);
  P.ext_http.header_count_dist = topN(mapFromObj(P.ext_http.header_count_dist), 20);
  P.ext_http.toxic = sortObj(P.ext_http.toxic);
  P.ext_http.key_presence = topN(mapFromObj(P.ext_http.key_presence), 40);
  for (const k of Object.keys(P.ext_http.value_dist)) P.ext_http.value_dist[k] = topN(mapFromObj(P.ext_http.value_dist[k]), 12);
  P.apes['8kfake_attrs'] = sortObj(P.apes['8kfake_attrs']);
  if (P.apes._codec_full) { P.apes.codec_full = topN(P.apes._codec_full, 20); delete P.apes._codec_full; }
  P.session_ids.distinct_sid = sidSet.size;
  P.session_ids.distinct_nonce = nonceSet.size;
  P.session_ids.distinct_list_hash = hashSet.size;
  P.session_ids.distinct_spoof_ip = spoofIpSet.size;
  P.session_ids.spoof_ip_sample = [...spoofIpSet].slice(0, 5).map((x) => x.replace(/\d+\.\d+\.\d+\./, 'x.x.x.'));
  P.last_lines = tail.slice();
  // final newline + BOM probe
  try {
    const fd = fs.openSync(path, 'r');
    const b = Buffer.alloc(3);
    fs.readSync(fd, b, 0, 3, 0);
    P.bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 'utf8-bom' : 'none';
    const last = Buffer.alloc(1);
    fs.readSync(fd, last, 0, 1, Math.max(0, st.size - 1));
    P.last_byte_hex = '0x' + last[0].toString(16).padStart(2, '0');
    P.final_newline = last[0] === 0x0a;
    const last2 = Buffer.alloc(2);
    fs.readSync(fd, last2, 0, 2, Math.max(0, st.size - 2));
    P.last_2_bytes_hex = last2.toString('hex');
    fs.closeSync(fd);
  } catch (e) { P.last_byte_probe_error = String(e && e.message || e); }
  P.header.tags = P.header.raw.reduce((acc, l) => {
    const t = l.startsWith('#') ? l.split(':')[0] : '(uri)';
    acc[t] = (acc[t] || 0) + 1; return acc;
  }, {});
  P.elapsed_ms = Date.now() - t0;
  return P;

  function isMasterCtx() {
    // A "channel catalogue" is treated as a master playlist context by construction:
    // the file declares EXT-X-STREAM-INF variants for channels, i.e. it is a master.
    return true;
  }
  function noteTag(b, t) { if (!b) return; if (!b.tagSet.has(t)) { b.tagSet.add(t); if (b.tagSeq.length < 600) b.tagSeq.push(t); } }
  function newBlock() {
    return { lines: 0, bytes: 0, extinf: 0, urls: 0, streamInf: 0, tagSeq: [], tagSet: new Set() };
  }
}

function mapFromObj(o) { const m = new Map(); for (const [k, v] of Object.entries(o)) m.set(k, v); return m; }
function sortObj(o) { return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1])); }

async function main() {
  const args = process.argv.slice(2);
  const path = args[0];
  if (!path) { console.error('usage: r1_analyze.js <playlist> [--out file.json] [--label name]'); process.exit(2); }
  const outIdx = args.indexOf('--out');
  const labelIdx = args.indexOf('--label');
  const out = outIdx !== -1 ? args[outIdx + 1] : null;
  const label = labelIdx !== -1 ? args[labelIdx + 1] : path;

  const res = await analyze(path, label);
  const json = JSON.stringify(res, null, 2);
  if (out) { fs.writeFileSync(out, json, 'utf8'); console.log(`wrote ${out} (${json.length} B)`); }
  else console.log(json);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
