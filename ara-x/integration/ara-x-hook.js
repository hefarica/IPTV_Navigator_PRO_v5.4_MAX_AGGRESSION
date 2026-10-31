/**
 * ARA-X hook for the APE generator (X1) — OPT-IN, DEFAULT OFF, FAIL-OPEN.
 *
 * This file is NOT loaded by the app today. It ships as part of the staged patch
 * (`ara-x/integration/ara-x-hook.patch`) and must be copied to
 * `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ara-x-hook.js` only when the claim over
 * `IPTV_v5.4_MAX_AGGRESSION/frontend/**` is granted.
 *
 * Contract (D1 §3.1):
 *   · `window.ARA_X_ENABLED === true` (also 1 / "1" / "true") turns the hook ON.
 *     Anything else — including the global being absent — leaves it OFF.
 *   · OFF  ⇒ the generator output is byte-identical to the baseline (the hook is never
 *            called from the patched code paths; if called, `apply`/`augmentEntry`
 *            return their input untouched).
 *   · ON   ⇒ 27-line inert `#EXT-X-ARA-*` block inserted between the global header and
 *            the first `#EXTINF`. Per-channel directives stay OFF unless
 *            `window.ARA_X_PER_CHANNEL === true`.
 *   · Never touches URLs, channels, `#EXT-X-STREAM-INF`, credentials or counts.
 *   · Any error is swallowed: a broken hook can never break generation.
 *
 * Works in the browser (exposes `window.ARA_X_HOOK`) and in Node (module.exports),
 * so `ara-x/integration/verify_integration.js` can test it without a DOM.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') {
    try { root.ARA_X_HOOK = api; } catch (_) { /* noop */ }
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var HOOK_VERSION = '2026.10.30-INT1';
  var ARA_VERSION = '2026.10.30-EVO-NODROP';
  var DEFAULT_SYNC_URL = 'https://iptv-ape.duckdns.org/sync';
  var DEFAULT_CLIENT_TYPE = 'onn4k';
  var BLOCK_LINES = 27;

  var CHANNEL_ID_RE = /^[A-Za-z0-9._:-]{1,32}$/;
  var PROFILE_RE = /^P[0-5]$/;

  function clean(value, fallback) {
    var s = String(value == null ? '' : value).replace(/[\r\n]/g, ' ').trim();
    return s.length > 0 ? s : fallback;
  }

  /** The canonical 27-line block (byte-identical to D1 / ara_x_injector.js). */
  function buildGlobalBlock(opts) {
    opts = opts || {};
    var listVersion = clean(opts.listVersion, 'unknown');
    var syncUrl = clean(opts.syncUrl, DEFAULT_SYNC_URL);
    var clientType = clean(opts.clientType, DEFAULT_CLIENT_TYPE);
    return [
      '#EXT-X-ARA-VERSION:2026.10.30-EVO-NODROP',
      '#EXT-X-ARA-SCHEMA:1',
      '#EXT-X-ARA-MODE:never-drop',
      '#EXT-X-ARA-DYNAMIC-CONTROL:enabled',
      '#EXT-X-ARA-PROFILE-AUTO:true',
      '#EXT-X-ARA-SYNC:enabled',
      '#EXT-X-ARA-VPS-SYNC:' + syncUrl,
      '#EXT-X-ARA-SYNC-CADENCE:30',
      '#EXT-X-ARA-AUTH:HMAC-SHA256',
      '#EXT-X-ARA-CLIENT-TYPE:' + clientType,
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
      '#EXT-X-ARA-LIST-VERSION:' + listVersion
    ];
  }

  function win() {
    if (typeof window !== 'undefined' && window) return window;
    if (typeof globalThis !== 'undefined' && globalThis) return globalThis;
    return null;
  }

  function truthyFlag(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function enabled(w) {
    try {
      var scope = w || win();
      return !!(scope && truthyFlag(scope.ARA_X_ENABLED));
    } catch (_) { return false; }
  }

  function perChannelEnabled(w) {
    try {
      if (!enabled(w)) return false;
      var scope = w || win();
      return !!(scope && truthyFlag(scope.ARA_X_PER_CHANNEL));
    } catch (_) { return false; }
  }

  function resolveListVersion(opts, w) {
    try {
      opts = opts || {};
      if (opts.listVersion) return clean(opts.listVersion, 'unknown');
      var scope = w || win();
      if (scope && scope.ARA_X_LIST_VERSION) return clean(scope.ARA_X_LIST_VERSION, 'unknown');
    } catch (_) { /* noop */ }
    return 'unknown';
  }

  /**
   * Chunk appended right after the global header in `generateM3U8Stream`:
   * the 27 lines, each terminated by LF (the generator builds strings with LF),
   * so the next channel entry starts immediately after.
   */
  function blockChunk(opts, w) {
    try {
      return buildGlobalBlock({ listVersion: resolveListVersion(opts, w) }).join('\n') + '\n';
    } catch (_) { return ''; }
  }

  /** Parses the space-separated attribute list of an `#EXTINF:` line. */
  function parseExtinfAttrs(line) {
    var out = Object.create(null);
    try {
      var s = String(line || '');
      var colon = s.indexOf(':');
      s = colon === -1 ? s : s.slice(colon + 1);
      var firstSpace = s.indexOf(' ');
      if (firstSpace === -1) return out;
      var re = /([A-Za-z0-9_-]+)="([^"]*)"/g;
      var m;
      var attrs = s.slice(firstSpace + 1);
      while ((m = re.exec(attrs)) !== null) out[m[1]] = m[2];
    } catch (_) { /* noop */ }
    return out;
  }

  /** Per-channel directives, evidence-only (same rules as the Node injector). */
  function channelDirectives(extinfLine) {
    var a = parseExtinfAttrs(extinfLine);
    var lines = [];
    if (a['tvg-id'] && CHANNEL_ID_RE.test(a['tvg-id'])) lines.push('#EXT-X-ARA-CHANNEL-ID:' + a['tvg-id']);
    if (a['ape-profile'] && PROFILE_RE.test(a['ape-profile'])) lines.push('#EXT-X-ARA-PROFILE-HINT:' + a['ape-profile']);
    return lines.slice(0, 6);
  }

  /**
   * Inserts the per-channel directives right after the entry's `#EXTINF` line.
   * Returns the input untouched on any doubt (fail-open).
   */
  function augmentEntry(entry) {
    try {
      if (!perChannelEnabled()) return entry;
      if (typeof entry !== 'string' || entry.indexOf('#EXTINF') !== 0) return entry;
      var eol = entry.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
      var nl = entry.indexOf('\n');
      if (nl === -1) return entry;
      var extra = channelDirectives(entry.slice(0, nl));
      if (!extra.length) return entry;
      var inserted = extra.map(function (l) { return l + eol; }).join('');
      return entry.slice(0, nl + 1) + inserted + entry.slice(nl + 1);
    } catch (_) { return entry; }
  }

  /**
   * String-level injection (non-stream paths / tests): inserts the block before the
   * first `#EXTINF`. Idempotent (if the block is present, returns the input), and
   * fail-open (any error returns the input).
   */
  function applyText(text, opts, w) {
    try {
      if (!enabled(w)) return text;
      if (typeof text !== 'string') return text;
      if (/(^|\n)#EXT-X-ARA-VERSION:/.test(text)) return text;
      var first = text.search(/(^|\n)#EXTINF/);
      if (first === -1) return text;
      var insertAt = first === 0 ? 0 : first + 1;
      var eol = text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
      var block = buildGlobalBlock({ listVersion: resolveListVersion(opts, w) });
      var blockText = block.map(function (l) { return l + eol; }).join('');
      return text.slice(0, insertAt) + blockText + text.slice(insertAt);
    } catch (_) { return text; }
  }

  return {
    VERSION: HOOK_VERSION,
    ARA_VERSION: ARA_VERSION,
    BLOCK_LINES: BLOCK_LINES,
    buildGlobalBlock: buildGlobalBlock,
    blockChunk: blockChunk,
    augmentEntry: augmentEntry,
    channelDirectives: channelDirectives,
    parseExtinfAttrs: parseExtinfAttrs,
    applyText: applyText,
    enabled: enabled,
    perChannelEnabled: perChannelEnabled
  };
});
