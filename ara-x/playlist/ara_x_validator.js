'use strict';

/**
 * ARA-X playlist validator.
 *
 * Two jobs, deliberately separated:
 *
 *  1. INVARIANTS (errors) — things this layer must never do:
 *       channel loss, URL mutation, extra/missing URL per channel, ARA directive misplaced or
 *       duplicated, unknown/forbidden ARA directive, media/master tags *added* by the layer.
 *
 *  2. PRE-EXISTING FINDINGS (reported, never "fixed") — what the catalog already carries and
 *       R1 measured: mixed HLS grammar in an M3U Plus catalog, I-FRAME-STREAM-INF without URI,
 *       duplicate EXT-X-START, malformed CODECS, MaxFALL > MaxCLL, channels without STREAM-INF,
 *       duplicate tvg-name, SID collisions. This layer does not add HLS grammar, so it must not
 *       pretend these are absent: they are surfaced with counts.
 *
 * URL samples are masked (host + tail of the path, no query) so credentials/tokens never leak
 * into reports. Hashes are computed over the raw URL bytes.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ARA_PREFIX = '#EXT-X-ARA-';

const MEDIA_PLAYLIST_TAGS = Object.freeze([
  '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE', '#EXT-X-DISCONTINUITY-SEQUENCE', '#EXT-X-ENDLIST',
  '#EXT-X-PLAYLIST-TYPE', '#EXT-X-I-FRAMES-ONLY', '#EXT-X-PART', '#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL',
  '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT', '#EXT-X-SKIP', '#EXT-X-BITRATE', '#EXT-X-GAP'
]);
const MASTER_TAGS = Object.freeze([
  '#EXT-X-MEDIA', '#EXT-X-STREAM-INF', '#EXT-X-I-FRAME-STREAM-INF', '#EXT-X-SESSION-DATA', '#EXT-X-SESSION-KEY',
  '#EXT-X-CONTENT-STEERING'
]);
const MEDIA_SEGMENT_TAGS = Object.freeze([
  '#EXTINF', '#EXT-X-BYTERANGE', '#EXT-X-DISCONTINUITY', '#EXT-X-KEY', '#EXT-X-MAP',
  '#EXT-X-PROGRAM-DATE-TIME', '#EXT-X-DATERANGE'
]);
// Legacy export kept for callers (V2 baseline used it): the media-only subset that must not increase.
const MEDIA_TAGS = Object.freeze([
  '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE', '#EXT-X-PLAYLIST-TYPE', '#EXT-X-MAP',
  '#EXT-X-PART:', '#EXT-X-SERVER-CONTROL', '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT'
]);

// ---------------------------------------------------------------- registry (D1 grammar)
let REGISTRY = null;
try {
  REGISTRY = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spec', 'ara_x_directives.json'), 'utf8'));
} catch {
  REGISTRY = null;
}
const GLOBAL_RULES = new Map();   // tag -> entry
const CHANNEL_RULES = new Map();  // tag -> entry
const FORBIDDEN = [];
if (REGISTRY) {
  for (const e of REGISTRY.block.order) GLOBAL_RULES.set(e.tag, e);
  for (const e of REGISTRY.per_channel || []) CHANNEL_RULES.set(e.tag, e);
  for (const f of REGISTRY.forbidden || []) FORBIDDEN.push(f);
}
function classGrammar(cls) {
  return REGISTRY && REGISTRY.value_classes && REGISTRY.value_classes[cls]
    ? new RegExp(REGISTRY.value_classes[cls].grammar)
    : null;
}
function valueOk(rule, value) {
  if (!rule) return true;
  const entry = rule.grammar ? { grammar: rule.grammar } : null;
  if (entry) {
    if (!new RegExp(entry.grammar).test(value)) return false;
  } else {
    const g = classGrammar(rule.class);
    if (g && !g.test(value)) return false;
  }
  if (rule.allowed && !rule.allowed.includes(value)) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.range) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < rule.range[0] || n > rule.range[1]) return false;
  }
  if (rule.must_be !== undefined && value !== rule.must_be) return false;
  return true;
}

function maskUrl(line) {
  try {
    const u = new URL(line);
    const tail = u.pathname.length > 10 ? u.pathname.slice(-8) : u.pathname;
    return u.protocol + '//' + u.host + '/…' + tail;
  } catch {
    return '<unparsed-url-line>';
  }
}

// ---------------------------------------------------------------- collection
function newState() {
  return {
    lines: 0,
    extinf: 0,
    streamInf: 0,
    extattr: 0,
    araTags: 0,
    araNames: Object.create(null),
    urls: 0,
    urlHash: crypto.createHash('sha256'),
    blockUrlCounts: [],
    currentBlockUrls: 0,
    inBlock: false,
    mediaTags: Object.create(null),
    sampleUrls: [],
    declaredChannels: 0,
    // --- richer state (validation) ---
    firstExtinfLine: 0,
    seenFirstExtinf: false,
    footerSeen: false,
    lastNonEmpty: '',
    globalAra: [],          // { line, tag, value }
    channelAra: [],         // { line, tag, value }
    misplacedAra: [],       // { line, tag, why }
    unknownAra: [],         // { line, tag }
    badValueAra: [],        // { line, tag, value }
    forbiddenAra: [],       // { line, tag, value }
    channelAraNames: Object.create(null),
    channelAraDuplicates: [],
    currentChannelAra: null,
    prevGlobalAraLine: 0,
    globalBlockContiguous: true,
    globalBlockClosed: false,
    tvgIds: new Set(),
    duplicateTvgIds: 0,
    tvgNames: new Map(),
    duplicateTvgNames: 0,
    iframeCount: 0,
    iframeWithoutUri: 0,
    startCount: 0,
    startValues: [],
    cmafCount: 0,
    cmafMalformedCodecs: 0,
    hdrImpossible: 0,
    hdrSamples: [],
    sidValues: new Map(),
    sidCollisions: 0,
    channelsWithoutStreamInf: 0,
    mediaPlaylistTags: Object.create(null),
    masterTags: Object.create(null),
    mediaSegmentTags: Object.create(null),
    extinfNonRfcDuration: 0
  };
}

function bump(obj, key) { obj[key] = (obj[key] || 0) + 1; }

function tagOf(line) {
  const i = line.indexOf(':');
  return i === -1 ? line : line.slice(0, i);
}

function accumulate(st, line) {
  st.lines += 1;

  if (line === '') {
    return;
  }

  // --- footer boundary (APE validation footer closes the catalog) ---
  if (line.startsWith('#EXT-X-APE-VALIDATED')) st.footerSeen = true;

  // --- ARA tags: global block before the first #EXTINF, or per-channel right after it ---
  if (line.startsWith(ARA_PREFIX)) {
    st.araTags += 1;
    const tag = tagOf(line);
    const value = line.slice(tag.length + 1);
    const name = tag.slice(ARA_PREFIX.length);
    st.araNames[name] = (st.araNames[name] || 0) + 1;

    if (!st.seenFirstExtinf) {
      if (st.globalBlockClosed) {
        // a global-looking ARA tag after a channel has appeared is misplaced
        st.misplacedAra.push({ line: st.lines, tag, why: 'ara_after_first_channel' });
      } else {
        if (st.prevGlobalAraLine && st.lines !== st.prevGlobalAraLine + 1) st.globalBlockContiguous = false;
        st.prevGlobalAraLine = st.lines;
        st.globalAra.push({ line: st.lines, tag, value });
        const rule = GLOBAL_RULES.get(tag);
        if (!rule) st.unknownAra.push({ line: st.lines, tag });
        else if (!valueOk(rule, value)) st.badValueAra.push({ line: st.lines, tag, value });
      }
    } else if (st.footerSeen) {
      st.misplacedAra.push({ line: st.lines, tag, why: 'ara_in_footer' });
    } else if (st.lastNonEmpty.startsWith('#EXTINF')) {
      // per-channel directive: allowed ONLY immediately after its #EXTINF
      st.channelAra.push({ line: st.lines, tag, value });
      st.channelAraNames[name] = (st.channelAraNames[name] || 0) + 1;
      if (st.currentChannelAra && st.currentChannelAra.has(name)) {
        st.channelAraDuplicates.push({ line: st.lines, tag });
      } else if (st.currentChannelAra) {
        st.currentChannelAra.add(name);
      }
      const rule = CHANNEL_RULES.get(tag);
      if (!rule) st.unknownAra.push({ line: st.lines, tag });
      else if (!valueOk(rule, value)) st.badValueAra.push({ line: st.lines, tag, value });
    } else if (st.currentBlockUrls > 0) {
      st.misplacedAra.push({ line: st.lines, tag, why: 'ara_after_channel_url' });
    } else {
      st.misplacedAra.push({ line: st.lines, tag, why: 'ara_not_after_extinf' });
    }

    for (const f of FORBIDDEN) {
      if (tag !== f.tag) continue;
      if (!f.values || f.values.includes('*') || f.values.includes(value)) {
        st.forbiddenAra.push({ line: st.lines, tag, value });
      }
    }
    st.lastNonEmpty = line;
    return;
  }

  // --- non-ARA HLS tags: classify (pre-existing grammar) and forbid specific values ---
  if (line.startsWith('#')) {
    const tag = tagOf(line);
    const value = line.length > tag.length ? line.slice(tag.length + 1) : '';

    for (const f of FORBIDDEN) {
      if (tag === f.tag && (!f.values || f.values.includes('*') || f.values.includes(value))) {
        st.forbiddenAra.push({ line: st.lines, tag, value });
      }
    }

    if (tag === '#EXTINF') {
      if (st.inBlock) st.blockUrlCounts.push(st.currentBlockUrls);
      st.extinf += 1;
      st.currentChannelAra = new Set();
      bump(st.mediaSegmentTags, '#EXTINF');
      st.inBlock = true;
      st.currentBlockUrls = 0;
      st.seenFirstExtinf = true;
      st.globalBlockClosed = true;
      if (!st.firstExtinfLine) st.firstExtinfLine = st.lines;
      const dur = value.split(' ')[0];
      if (!/^\d+(\.\d+)?$/.test(dur)) st.extinfNonRfcDuration += 1;
      const idMatch = /tvg-id="([^"]*)"/.exec(line);
      if (idMatch) {
        if (st.tvgIds.has(idMatch[1])) st.duplicateTvgIds += 1;
        else st.tvgIds.add(idMatch[1]);
      }
      const nameMatch = /tvg-name="([^"]*)"/.exec(line);
      if (nameMatch) {
        const key = nameMatch[1];
        if (st.tvgNames.has(key)) {
          st.duplicateTvgNames += 1;
          st.tvgNames.set(key, st.tvgNames.get(key) + 1);
        } else {
          st.tvgNames.set(key, 1);
        }
      }
      st.lastNonEmpty = line;
      return;
    }

    if (tag === '#EXT-X-STREAM-INF') st.streamInf += 1;
    if (tag === '#EXTATTRFROMURL') st.extattr += 1;
    if (tag === '#EXT-X-APE-CHANNELS') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed > 0) st.declaredChannels = parsed;
    }
    if (tag === '#EXT-X-I-FRAME-STREAM-INF') {
      st.iframeCount += 1;
      if (!/(?:^|,)URI=/.test(value)) st.iframeWithoutUri += 1;
    }
    if (tag === '#EXT-X-START') {
      st.startCount += 1;
      if (st.startValues.length < 4) st.startValues.push(value);
    }
    if (tag === '#EXT-X-CMAF') {
      st.cmafCount += 1;
      const m = /CODECS="([^"]*)"/.exec(value);
      if (m) {
        const parts = m[1].split(',');
        if (parts.some((p) => p.trim() === '')) st.cmafMalformedCodecs += 1;
      }
    }
    if (tag === '#EXT-X-APE-HDR-METADATA') {
      const peak = /PEAK=(\d+)/.exec(value);
      const avg = /AVG=(\d+)/.exec(value);
      if (peak && avg && Number(avg[1]) > Number(peak[1])) {
        st.hdrImpossible += 1;
        if (st.hdrSamples.length < 2) st.hdrSamples.push(`PEAK=${peak[1]},AVG=${avg[1]}`);
      }
    }
    if (tag === '#EXT-X-CMAF-IDEMPOTENCIA') {
      const m = /SID=([^,]+)/.exec(value);
      if (m) {
        const sid = m[1];
        if (st.sidValues.has(sid)) {
          st.sidCollisions += 1;
          st.sidValues.set(sid, st.sidValues.get(sid) + 1);
        } else {
          st.sidValues.set(sid, 1);
        }
      }
    }
    if (MEDIA_PLAYLIST_TAGS.includes(tag)) bump(st.mediaPlaylistTags, tag);
    if (MASTER_TAGS.includes(tag)) bump(st.masterTags, tag);
    if (MEDIA_SEGMENT_TAGS.includes(tag)) bump(st.mediaSegmentTags, tag);
    for (const t of MEDIA_TAGS) {
      if (line.startsWith(t)) bump(st.mediaTags, t);
    }
    st.lastNonEmpty = line;
    return;
  }

  // --- URL line ---
  st.urls += 1;
  st.urlHash.update(line + '\n', 'utf8');
  st.currentBlockUrls += 1;
  if (st.sampleUrls.length < 3) st.sampleUrls.push(maskUrl(line));
  st.lastNonEmpty = line;
}

function finish(st) {
  if (st.inBlock) st.blockUrlCounts.push(st.currentBlockUrls);

  const globalCounts = Object.create(null);
  for (const e of st.globalAra) {
    const name = e.tag.slice(ARA_PREFIX.length);
    globalCounts[name] = (globalCounts[name] || 0) + 1;
  }
  const duplicates = Object.entries(globalCounts)
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }));
  const wrongSamples = [];
  let wrong = 0;
  st.blockUrlCounts.forEach((count, i) => {
    if (count !== 1) {
      wrong += 1;
      if (wrongSamples.length < 5) wrongSamples.push({ block: i + 1, urls: count });
    }
  });
  st.channelsWithoutStreamInf = Math.max(0, st.extinf - st.streamInf);

  return {
    // legacy shape (V2 baseline + tests)
    lines: st.lines,
    extinf: st.extinf,
    streamInf: st.streamInf,
    extattr: st.extattr,
    araTags: st.araTags,
    araVersion: st.araNames.VERSION || 0,
    araDirectiveNames: Object.keys(st.araNames).sort(),
    duplicateAra: duplicates,
    urls: st.urls,
    urlSha256: st.urlHash.digest('hex'),
    blocks: st.blockUrlCounts.length,
    blocksWithWrongUrlCount: wrong,
    wrongSamples,
    mediaTags: st.mediaTags,
    sampleUrls: st.sampleUrls,
    declaredChannels: st.declaredChannels,
    // ARA layer
    ara: {
      present: st.araTags > 0,
      version: (st.globalAra.find((e) => e.tag === '#EXT-X-ARA-VERSION') || {}).value || null,
      globalLines: st.globalAra.length,
      channelLines: st.channelAra.length,
      blockBeforeFirstExtinf: st.globalAra.length > 0 && st.firstExtinfLine > 0 &&
        Math.max(...st.globalAra.map((e) => e.line)) < st.firstExtinfLine,
      contiguous: st.globalBlockContiguous,
      duplicates,
      channelDuplicates: st.channelAraDuplicates,
      misplaced: st.misplacedAra,
      unknown: st.unknownAra,
      badValue: st.badValueAra,
      forbidden: st.forbiddenAra,
      channelDirectiveNames: Object.keys(st.channelAraNames).sort()
    },
    // catalog facts (pre-existing)
    catalog: {
      extinf: st.extinf,
      urls: st.urls,
      declaredChannels: st.declaredChannels,
      streamInf: st.streamInf,
      channelsWithoutStreamInf: st.channelsWithoutStreamInf,
      blocksWithWrongUrlCount: wrong,
      duplicateTvgIds: st.duplicateTvgIds,
      duplicateTvgNames: st.duplicateTvgNames,
      iframeCount: st.iframeCount,
      iframeWithoutUri: st.iframeWithoutUri,
      startCount: st.startCount,
      startValues: st.startValues,
      cmafCount: st.cmafCount,
      cmafMalformedCodecs: st.cmafMalformedCodecs,
      hdrImpossible: st.hdrImpossible,
      hdrSamples: st.hdrSamples,
      sidCollisions: st.sidCollisions,
      sidDistinct: st.sidValues.size,
      extinfNonRfcDuration: st.extinfNonRfcDuration,
      grammar: {
        mediaPlaylistTags: st.mediaPlaylistTags,
        masterTags: st.masterTags,
        mediaSegmentTags: st.mediaSegmentTags
      }
    },
    registryLoaded: Boolean(REGISTRY)
  };
}

// ---------------------------------------------------------------- validation
function validateReport(stats, opts = {}) {
  const errors = [];
  const warnings = [];
  const preexisting = [];
  const err = (code, message, detail) => errors.push({ code, message, detail });
  const pre = (code, message, count, detail) => {
    if (count > 0) preexisting.push({ code, message, count, detail });
  };

  const { ara, catalog } = stats;

  // --- ARA invariants (this layer) ---
  if (ara.present) {
    if (ara.globalLines === 0) err('ara_no_global_block', 'hay directivas ARA por canal pero falta el bloque global');
    if (ara.globalLines > 0 && !ara.blockBeforeFirstExtinf) {
      err('ara_block_not_before_extinf', 'el bloque global ARA no está antes del primer #EXTINF');
    }
    if (ara.globalLines > 0 && !ara.contiguous) {
      err('ara_block_not_contiguous', 'las líneas del bloque global ARA no son contiguas');
    }
    if (ara.duplicates.length > 0) {
      err('ara_duplicate_directive', 'directiva ARA duplicada en el bloque global',
        ara.duplicates.map((d) => `${d.name}×${d.count}`).join(','));
    }
    if (ara.channelDuplicates && ara.channelDuplicates.length > 0) {
      err('ara_duplicate_directive', 'directiva ARA duplicada dentro de un canal', ara.channelDuplicates.slice(0, 5));
    }
    if (ara.misplaced.length > 0) {
      err('ara_misplaced', 'directiva ARA mal ubicada', ara.misplaced.slice(0, 5));
    }
    if (ara.unknown.length > 0) {
      err('ara_unknown_directive', 'directiva ARA desconocida para la gramática D1', ara.unknown.slice(0, 5));
    }
    if (ara.badValue.length > 0) {
      err('ara_bad_value', 'valor de directiva ARA fuera de gramática/rango/enum', ara.badValue.slice(0, 5));
    }
  } else if (opts.requireAra) {
    err('ara_missing', 'se exige el bloque ARA y no está presente');
  }
  // Prohibidas: se comprueban SIEMPRE (también sin bloque ARA, p.ej. #EXT-X-VERSION:6).
  if (ara.forbidden.length > 0) {
    err('ara_forbidden_directive', 'directiva prohibida por el contrato', ara.forbidden.slice(0, 5));
  }

  // --- structural invariants (this layer must not break them) ---
  if (catalog.blocksWithWrongUrlCount > 0) {
    err('url_count_per_channel', 'canales con 0 o >1 URLs',
      stats.wrongSamples);
  }
  if (opts.expectChannels !== undefined && stats.extinf !== opts.expectChannels) {
    err('channel_count_mismatch', 'el número de #EXTINF no coincide con el esperado',
      { expected: opts.expectChannels, actual: stats.extinf });
  }
  if (opts.expectUrlSha256 !== undefined && stats.urlSha256 !== opts.expectUrlSha256) {
    err('url_mutation', 'el hash agregado de URLs cambió (URL mutada o reordenada)',
      { expected: opts.expectUrlSha256, actual: stats.urlSha256 });
  }
  if (stats.declaredChannels > 0 && stats.extinf !== stats.declaredChannels) {
    err('declared_channels_mismatch', '#EXT-X-APE-CHANNELS no coincide con #EXTINF',
      { declared: stats.declaredChannels, extinf: stats.extinf });
  }

  // --- pre-existing findings (reported, never "fixed" by this layer) ---
  const g = catalog.grammar;
  const mediaOnly = Object.values(g.mediaPlaylistTags).reduce((a, b) => a + b, 0);
  const master = Object.values(g.masterTags).reduce((a, b) => a + b, 0);
  const segment = Object.values(g.mediaSegmentTags).reduce((a, b) => a + b, 0);
  if (mediaOnly > 0 && master > 0) {
    pre('grammar_mixed_master_media', 'el catálogo mezcla Master tags y Media Playlist tags (RFC 8216 §4.3.2)', mediaOnly,
      { mediaPlaylistTags: g.mediaPlaylistTags, masterTags: g.masterTags });
  }
  if (segment > 0 && master > 0) {
    pre('grammar_mixed_segment_master', 'el catálogo mezcla Media Segment tags (#EXTINF/#EXT-X-DATERANGE) y Master tags', segment);
  }
  pre('iframe_without_uri', '#EXT-X-I-FRAME-STREAM-INF sin atributo URI (RFC 8216 §4.3.4.3)', catalog.iframeWithoutUri);
  pre('ext_x_start_duplicated', 'más de un EXT-X-START (arranque ambiguo)', Math.max(0, catalog.startCount - 1),
    catalog.startValues);
  pre('cmaf_malformed_codecs', 'CODECS con elemento vacío (coma final) en #EXT-X-CMAF', catalog.cmafMalformedCodecs);
  pre('hdr_maxfall_gt_maxcll', 'MaxFALL (AVG) > MaxCLL (PEAK): metadata HDR físicamente imposible', catalog.hdrImpossible,
    catalog.hdrSamples);
  pre('channel_without_stream_inf', 'canales sin #EXT-X-STREAM-INF (no son pérdida de canal: la URL existe)', catalog.channelsWithoutStreamInf);
  pre('tvg_name_duplicate', 'tvg-name duplicado con tvg-id/URL distintos', catalog.duplicateTvgNames);
  pre('sid_collision', 'colisión de SID en #EXT-X-CMAF-IDEMPOTENCIA', catalog.sidCollisions);
  pre('extinf_non_rfc_duration', 'EXTINF con duración no decimal (convención M3U Plus, no RFC 8216)', catalog.extinfNonRfcDuration);
  pre('tvg_id_duplicate', 'tvg-id duplicado', catalog.duplicateTvgIds);

  for (const w of warnings) void w;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    preexisting,
    stats
  };
}

// ---------------------------------------------------------------- public API
function analyzeText(text) {
  if (typeof text !== 'string') throw new TypeError('analyzeText expects a string');
  const st = newState();
  for (const raw of text.split('\n')) {
    accumulate(st, raw.endsWith('\r') ? raw.slice(0, -1) : raw);
  }
  return finish(st);
}

async function analyzeFile(filePath) {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error('not a file: ' + filePath);

  const st = newState();
  await new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });
    rl.on('line', (line) => accumulate(st, line));
    rl.on('error', reject);
    rl.on('close', resolve);
  });
  return finish(st);
}

function validateText(text, opts = {}) {
  return validateReport(analyzeText(text), opts);
}

async function validateFile(filePath, opts = {}) {
  return validateReport(await analyzeFile(filePath), opts);
}

function compare(before, after) {
  const checks = [];
  const add = (name, ok, b, a) => checks.push({ name, ok, before: b, after: a });

  add('channels_preserved', before.extinf === after.extinf, before.extinf, after.extinf);
  add('capture_complete', after.declaredChannels > 0 ? after.extinf === after.declaredChannels : true, before.declaredChannels, after.declaredChannels);
  add('url_count_preserved', before.urls === after.urls, before.urls, after.urls);
  add('url_bytes_preserved', before.urlSha256 === after.urlSha256, before.urlSha256, after.urlSha256);
  add('stream_inf_preserved', before.streamInf === after.streamInf, before.streamInf, after.streamInf);
  add('extattr_preserved', before.extattr === after.extattr, before.extattr, after.extattr);
  add('ara_block_exactly_once', after.araVersion === 1, before.araVersion, after.araVersion);
  add('no_duplicate_ara_directives', after.duplicateAra.length === 0, before.duplicateAra.length, after.duplicateAra.length);
  add('url_block_shape_preserved', before.blocksWithWrongUrlCount === after.blocksWithWrongUrlCount, before.blocksWithWrongUrlCount, after.blocksWithWrongUrlCount);
  add('ara_block_before_first_extinf', !after.ara || !after.ara.present || after.ara.blockBeforeFirstExtinf, false, after.ara ? after.ara.blockBeforeFirstExtinf : false);
  add('ara_no_misplaced', after.ara ? after.ara.misplaced.length === 0 : true, 0, after.ara ? after.ara.misplaced.length : 0);
  add('ara_no_forbidden', after.ara ? after.ara.forbidden.length === 0 : true, 0, after.ara ? after.ara.forbidden.length : 0);

  const mediaBefore = before.mediaTags || {};
  const mediaAfter = after.mediaTags || {};
  const mediaKeys = new Set([...Object.keys(mediaBefore), ...Object.keys(mediaAfter)]);
  let mediaNotIncreased = true;
  for (const key of mediaKeys) {
    if ((mediaAfter[key] || 0) > (mediaBefore[key] || 0)) mediaNotIncreased = false;
  }
  add('media_only_tags_not_added', mediaNotIncreased, mediaBefore, mediaAfter);

  const masterBefore = (before.catalog && before.catalog.grammar && before.catalog.grammar.masterTags) || {};
  const masterAfter = (after.catalog && after.catalog.grammar && after.catalog.grammar.masterTags) || {};
  let masterNotIncreased = true;
  for (const key of new Set([...Object.keys(masterBefore), ...Object.keys(masterAfter)])) {
    if ((masterAfter[key] || 0) > (masterBefore[key] || 0)) masterNotIncreased = false;
  }
  add('master_tags_not_added', masterNotIncreased, masterBefore, masterAfter);

  return { ok: checks.every((c) => c.ok), checks };
}

module.exports = {
  ARA_PREFIX,
  MEDIA_TAGS,
  MEDIA_PLAYLIST_TAGS,
  MASTER_TAGS,
  MEDIA_SEGMENT_TAGS,
  analyzeText,
  analyzeFile,
  validateText,
  validateFile,
  compare,
  maskUrl,
  registryLoaded: () => Boolean(REGISTRY)
};
