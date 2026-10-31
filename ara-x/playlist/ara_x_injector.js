'use strict';

/**
 * ARA-X playlist injector.
 *
 * Inserts the global `#EXT-X-ARA-*` block (27 canonical lines, D1 §3.1) immediately before the
 * first `#EXTINF` of an M3U Plus channel catalog, and — opt-in — per-channel directives right
 * after each `#EXTINF`, derived **only** from attributes already present (no invention).
 *
 * Pure line insertion: URLs are never touched, no HLS master/media grammar is added, and a
 * second pass is a byte-identical no-op (idempotent). Fail-open: anything that is not a channel
 * catalog is copied unchanged.
 */

const fs = require('node:fs');
const readline = require('node:readline');

const ARA_VERSION = '2026.10.30-EVO-NODROP';
const ARA_TAG_PREFIX = '#EXT-X-ARA-';
const DEFAULT_SYNC_URL = 'https://iptv-ape.duckdns.org/sync';
const DEFAULT_CLIENT_TYPE = 'onn4k';
const HEAD_PROBE_BYTES = 2 * 1024 * 1024;
const MAX_CHANNEL_DIRECTIVES = 6;

const CHANNEL_ID_RE = /^[A-Za-z0-9._:-]{1,32}$/;
const PROFILE_RE = /^P[0-5]$/;
const CODEC_RE = /^(avc1|hvc1|hev1|av01|vp09)\.[0-9A-Za-z.]{2,32}$/;
const EIGHT_K_RE = /^(presentation|disabled)$/;

function clean(value, fallback) {
  const s = String(value == null ? '' : value).replace(/[\r\n]/g, ' ').trim();
  return s.length > 0 ? s : fallback;
}

function buildGlobalBlock({ listVersion = 'unknown', syncUrl = DEFAULT_SYNC_URL, clientType = DEFAULT_CLIENT_TYPE } = {}) {
  return [
    '#EXT-X-ARA-VERSION:2026.10.30-EVO-NODROP',
    '#EXT-X-ARA-SCHEMA:1',
    '#EXT-X-ARA-MODE:never-drop',
    '#EXT-X-ARA-DYNAMIC-CONTROL:enabled',
    '#EXT-X-ARA-PROFILE-AUTO:true',
    '#EXT-X-ARA-SYNC:enabled',
    '#EXT-X-ARA-VPS-SYNC:' + clean(syncUrl, DEFAULT_SYNC_URL),
    '#EXT-X-ARA-SYNC-CADENCE:30',
    '#EXT-X-ARA-AUTH:HMAC-SHA256',
    '#EXT-X-ARA-CLIENT-TYPE:' + clean(clientType, DEFAULT_CLIENT_TYPE),
    '#EXT-X-ARA-MINIMUM-DECODE-RESOLUTION:3840x2160',
    '#EXT-X-ARA-MAX-DECODE-RESOLUTION:3840x2160',
    '#EXT-X-ARA-MAX-PRESENT-RESOLUTION:7680x4320',
    '#EXT-X-ARA-NEVER-DOWNSCALE:true',
    '#EXT-X-ARA-FPS-TARGETS:60,30,24',
    '#EXT-X-ARA-MINIMUM-FPS:24',
    '#EXT-X-ARA-PRIORITY:zero-frame-drops',
    '#EXT-X-ARA-DEGRADE-ORDER:fps,processing',
    '#EXT-X-ARA-EMERGENCY-DOWNSCALE:false',
    '#EXT-X-ARA-THERMAL-60FPS:65',
    '#EXT-X-ARA-THERMAL-30FPS:78',
    '#EXT-X-ARA-THERMAL-24FPS:82',
    '#EXT-X-ARA-8K-MODE:PRESENTATION',
    '#EXT-X-ARA-THERMAL-AWARE:true',
    '#EXT-X-ARA-THERMAL-TARGET:70',
    '#EXT-X-ARA-FALLBACK:passthrough',
    '#EXT-X-ARA-LIST-VERSION:' + clean(listVersion, 'unknown')
  ];
}

/** Parses the space-separated attribute list that follows `#EXTINF:<duration> `. */
function parseExtinfAttrs(line) {
  const out = Object.create(null);
  const s = line.startsWith('#EXTINF') ? line.slice(line.indexOf(':') + 1) : String(line);
  const firstSpace = s.indexOf(' ');
  if (firstSpace === -1) return out;
  const attrs = s.slice(firstSpace + 1);
  const re = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrs)) !== null) out[m[1]] = m[2];
  return out;
}

/**
 * Per-channel directives, D1 §3.5. Only attributes already present in the `#EXTINF` are used:
 * no profile/codec/8K/thermal value is invented. Returns [] when there is no evidence.
 */
function buildChannelBlock(extinfLine, { max = MAX_CHANNEL_DIRECTIVES } = {}) {
  const a = typeof extinfLine === 'string' ? parseExtinfAttrs(extinfLine) : (extinfLine || {});
  const lines = [];
  if (a['tvg-id'] && CHANNEL_ID_RE.test(a['tvg-id'])) lines.push('#EXT-X-ARA-CHANNEL-ID:' + a['tvg-id']);
  if (a['ape-profile'] && PROFILE_RE.test(a['ape-profile'])) lines.push('#EXT-X-ARA-PROFILE-HINT:' + a['ape-profile']);
  if (a['ape-codec'] && CODEC_RE.test(a['ape-codec'])) lines.push('#EXT-X-ARA-CODEC-PREFERRED:' + a['ape-codec']);
  if (a['ape-8k'] && EIGHT_K_RE.test(a['ape-8k'])) lines.push('#EXT-X-ARA-8K:' + a['ape-8k']);
  if (a['ape-thermal-budget']) {
    const n = Number(a['ape-thermal-budget']);
    if (Number.isInteger(n) && n >= 60 && n <= 85) lines.push('#EXT-X-ARA-THERMAL-BUDGET:' + n);
  }
  return lines.slice(0, max);
}

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function hasAraBlock(text) {
  return /(^|\n)#EXT-X-ARA-VERSION:/.test(text);
}

function isChannelCatalog(text) {
  return /(^|\n)#EXTINF:[^\n]*tvg-(id|name)=/.test(text);
}

function injectText(text, opts = {}) {
  if (typeof text !== 'string') throw new TypeError('injectText expects a string');
  if (hasAraBlock(text)) return { text, injected: false, reason: 'already_present' };
  if (!isChannelCatalog(text)) return { text, injected: false, reason: 'not_channel_catalog' };

  const perChannel = opts.perChannel === true;
  const eol = detectEol(text);
  const lines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  const firstExtinf = lines.findIndex((line) => line.startsWith('#EXTINF'));
  if (firstExtinf < 0) return { text, injected: false, reason: 'no_channels' };

  const block = buildGlobalBlock(opts);
  const outLines = [...lines.slice(0, firstExtinf), ...block];
  let perChannelLines = 0;
  let channelsWithDirectives = 0;
  for (const line of lines.slice(firstExtinf)) {
    outLines.push(line);
    if (perChannel && line.startsWith('#EXTINF')) {
      const extra = buildChannelBlock(line);
      if (extra.length) {
        outLines.push(...extra);
        perChannelLines += extra.length;
        channelsWithDirectives += 1;
      }
    }
  }
  return {
    text: outLines.join(eol),
    injected: true,
    reason: 'injected',
    blockLines: block.length,
    perChannelLines,
    channelsWithDirectives,
    firstExtinfLine: firstExtinf + 1,
    eol: eol === '\r\n' ? 'CRLF' : 'LF'
  };
}

async function readHead(filePath, size) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(size);
    const { bytesRead } = await fh.read(buf, 0, size, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

async function fileEndsWithNewline(filePath, size) {
  if (size < 1) return false;
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(2);
    const start = Math.max(0, size - 2);
    const { bytesRead } = await fh.read(buf, 0, 2, start);
    return buf.subarray(0, bytesRead).includes(0x0a);
  } finally {
    await fh.close();
  }
}

async function injectFile(inPath, outPath, opts = {}) {
  const stat = await fs.promises.stat(inPath);
  if (!stat.isFile()) throw new Error('not a file: ' + inPath);

  const head = await readHead(inPath, Math.min(stat.size, HEAD_PROBE_BYTES));
  if (hasAraBlock(head)) {
    await fs.promises.copyFile(inPath, outPath);
    return { injected: false, reason: 'already_present', bytes: stat.size, byteIdenticalCopy: true, perChannelLines: 0 };
  }
  if (!isChannelCatalog(head)) {
    await fs.promises.copyFile(inPath, outPath);
    return { injected: false, reason: 'not_channel_catalog', bytes: stat.size, byteIdenticalCopy: true, perChannelLines: 0 };
  }

  const perChannel = opts.perChannel === true;
  const eol = detectEol(head);
  const endsWithNewline = await fileEndsWithNewline(inPath, stat.size);
  const block = buildGlobalBlock(opts);
  let lines = 0;
  let perChannelLines = 0;
  let channelsWithDirectives = 0;

  await new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(inPath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });
    const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });
    let pending = null;
    let pendingExtras = null;
    let inserted = false;
    let rlClosed = false;

    const write = (chunk) => {
      if (!ws.write(chunk) && !rlClosed) rl.pause();
    };
    ws.on('drain', () => {
      if (!rlClosed) rl.resume();
    });
    ws.on('error', reject);
    rl.on('error', reject);

    rl.on('line', (line) => {
      if (pending !== null) {
        write(pending + eol);
        if (pendingExtras) {
          for (const extra of pendingExtras) write(extra + eol);
          pendingExtras = null;
        }
      }
      if (!inserted && line.startsWith('#EXTINF')) {
        for (const blockLine of block) write(blockLine + eol);
        inserted = true;
        if (perChannel) pendingExtras = buildChannelBlock(line);
      } else if (inserted && perChannel && line.startsWith('#EXTINF')) {
        pendingExtras = buildChannelBlock(line);
      }
      if (pendingExtras && pendingExtras.length) {
        perChannelLines += pendingExtras.length;
        channelsWithDirectives += 1;
      }
      pending = line;
      lines += 1;
    });

    rl.on('close', () => {
      rlClosed = true;
      if (pending !== null) {
        write(pending + (endsWithNewline ? eol : ''));
        if (pendingExtras) {
          for (const extra of pendingExtras) write(extra + eol);
          pendingExtras = null;
        }
      }
      ws.end();
    });
    ws.on('finish', resolve);
  });

  return {
    injected: true,
    reason: 'injected',
    bytes: stat.size,
    lines,
    blockLines: block.length,
    perChannelLines,
    channelsWithDirectives,
    eol: eol === '\r\n' ? 'CRLF' : 'LF',
    trailingNewline: endsWithNewline
  };
}

module.exports = {
  ARA_VERSION,
  ARA_TAG_PREFIX,
  DEFAULT_SYNC_URL,
  DEFAULT_CLIENT_TYPE,
  MAX_CHANNEL_DIRECTIVES,
  buildGlobalBlock,
  buildChannelBlock,
  parseExtinfAttrs,
  detectEol,
  hasAraBlock,
  isChannelCatalog,
  injectText,
  injectFile
};
