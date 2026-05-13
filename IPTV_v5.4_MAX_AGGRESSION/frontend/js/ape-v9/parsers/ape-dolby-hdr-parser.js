/**
 * APE DOLBY VISION / HDR PARSER — Evidence-only HDR classification.
 *
 * RULES:
 *   - PQ → HDR10/PQ verified
 *   - HLG → HLG verified
 *   - dvh1/dvhe (real) → Dolby Vision HEVC verified
 *   - SUPPLEMENTAL-CODECS with DV fourCC → DV enhancement layer verified
 *   - Otherwise → SDR_OR_UNKNOWN (never invent)
 *
 * Does NOT emit VIDEO-RANGE when unverified.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const DV_FOURCC = /^(dvh1|dvhe|dva1|dvav|dvb1|dvbv)\./i;
    const DV_DB = /^(db1p|db2g|db4h|db4g)/i;        // RPU + EL signaling

    function classifyVideoRange(videoRange) {
        const v = String(videoRange || '').trim().toUpperCase();
        if (v === 'PQ')   return { hdr: 'HDR10_PQ', verified: true };
        if (v === 'HLG')  return { hdr: 'HLG',      verified: true };
        if (v === 'SDR')  return { hdr: 'SDR',      verified: true };
        return { hdr: null, verified: false };
    }

    function classifyDolbyVisionFromCodec(codecToken) {
        const t = String(codecToken || '').trim();
        if (!t) return null;
        if (DV_FOURCC.test(t)) {
            const parts = t.split('.');
            return {
                isDV: true,
                fourCC: parts[0].toLowerCase(),
                profile: parts[1] || null,
                bcl: parts[2] || null
            };
        }
        if (DV_DB.test(t)) {
            return { isDV: true, fourCC: t.toLowerCase(), enhancementLayer: true };
        }
        return null;
    }

    /**
     * @param {Object} streamInfAttrs - Attributes from EXT-X-STREAM-INF (object).
     * @returns {Object} HDR classification.
     */
    function parseStreamInf(streamInfAttrs) {
        const attrs = streamInfAttrs || {};
        const out = {
            videoRange:       null,                 // 'PQ' | 'HLG' | 'SDR' | null
            hdr:              'SDR_OR_UNKNOWN',
            hdrVerified:      false,
            isDolbyVision:    false,
            dvProfile:        null,
            dvBaseLayer:      null,
            supplementalDV:   false,
            evidence:         [],
            warnings:         []
        };

        const vr = classifyVideoRange(attrs['VIDEO-RANGE']);
        if (vr.verified) {
            out.videoRange  = String(attrs['VIDEO-RANGE']).toUpperCase();
            out.hdr         = vr.hdr;
            out.hdrVerified = true;
            out.evidence.push('VIDEO-RANGE=' + out.videoRange);
        }

        const codecsStr = String(attrs.CODECS || '');
        if (codecsStr) {
            const tokens = codecsStr.split(',').map(function (s) { return s.trim(); });
            for (let i = 0; i < tokens.length; i++) {
                const dv = classifyDolbyVisionFromCodec(tokens[i]);
                if (dv) {
                    out.isDolbyVision = true;
                    if (dv.profile) out.dvProfile = dv.profile;
                    if (dv.bcl) out.dvBaseLayer = dv.bcl;
                    out.evidence.push('CODECS DV token: ' + tokens[i]);
                    // Override hdr only if not already set by VIDEO-RANGE
                    if (!out.hdrVerified) {
                        out.hdr = 'DOLBY_VISION';
                        out.hdrVerified = true;
                    } else {
                        out.hdr = 'DOLBY_VISION_OVER_' + out.hdr;
                    }
                }
            }
        }

        const supp = String(attrs['SUPPLEMENTAL-CODECS'] || '');
        if (supp) {
            const sToks = supp.split(',').map(function (s) { return s.trim(); });
            for (let i = 0; i < sToks.length; i++) {
                const dv = classifyDolbyVisionFromCodec(sToks[i]);
                if (dv) {
                    out.supplementalDV = true;
                    out.evidence.push('SUPPLEMENTAL-CODECS DV: ' + sToks[i]);
                }
            }
            if (!out.supplementalDV) {
                out.warnings.push('SUPPLEMENTAL-CODECS present but no DV fourCC: ' + supp);
            }
        }

        if (!out.hdrVerified) out.hdr = 'SDR_OR_UNKNOWN';
        return out;
    }

    /**
     * Convenience: classify a raw VIDEO-RANGE + CODECS combo.
     */
    function classify(videoRange, codecs, supplementalCodecs) {
        return parseStreamInf({
            'VIDEO-RANGE':         videoRange,
            CODECS:                codecs,
            'SUPPLEMENTAL-CODECS': supplementalCodecs
        });
    }

    const APEDolbyHdrParser = {
        parseStreamInf:               parseStreamInf,
        classify:                     classify,
        classifyVideoRange:           classifyVideoRange,
        classifyDolbyVisionFromCodec: classifyDolbyVisionFromCodec
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEDolbyHdrParser;
    } else {
        global.APEDolbyHdrParser = APEDolbyHdrParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
