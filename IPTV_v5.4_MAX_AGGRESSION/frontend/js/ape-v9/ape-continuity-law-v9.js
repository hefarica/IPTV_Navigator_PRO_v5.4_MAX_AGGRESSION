/**
 * APE Streaming Continuity Law v1.0
 * Shared contract for the app generator and LAB-calibrated profiles.
 * Unknown #EXT-X-APE-* tags are inert to players; they are audit metadata.
 */
(function () {
  'use strict';
  if (window.APE_CONTINUITY_LAW) return;

  var TAGS = Object.freeze([
    '#EXT-X-APE-CONTINUITY-LAW:STREAMING_CONTINUITY_LAW_V1',
    '#EXT-X-APE-CONTINUITY-MANIFEST:no-store',
    '#EXT-X-APE-CONTINUITY-RANGE:206',
    '#EXT-X-APE-CONTINUITY-SEGMENTS:session-unique',
    '#EXT-X-APE-CONTINUITY-TRANSPORT:declared',
    '#EXT-X-APE-CONTINUITY-FALLBACK:HDR>SDR1080>SDR720'
  ]);

  window.APE_CONTINUITY_LAW = Object.freeze({
    version: '1.0',
    tags: function () { return TAGS.slice(); },
    block: function () { return TAGS.join('\n'); },
    validate: function (text) {
      var s = String(text || '');
      var missing = TAGS.filter(function (t) {
        return s.indexOf(t.split(':')[0] + ':') === -1;
      });
      return { ok: missing.length === 0, missing: missing };
    }
  });
})();
