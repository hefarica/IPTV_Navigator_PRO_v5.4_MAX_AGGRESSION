/**
 * APE HEVC PARSER — Deep RFC 6381 HEVC codec string parser.
 *
 * Grammar: <sample>.<P>.<PC>.<TL>[.<CF1>...<CF6>]
 *   <sample>  hvc1 | hev1
 *   <P>       Profile (numeric)         .1 = Main,  .2 = Main10,  .4 = Main12
 *   <PC>      Profile compatibility (hex)
 *   <TL>      Tier + Level              L<level> = main tier,  H<level> = high tier
 *                                       L153 = Level 5.1 (NOT Main12!)
 *   <CFn>     Constraint flag bytes (hex, up to 6)
 *
 * Rules baked in:
 *   - L153 ≠ Main12. Level number is independent of profile.
 *   - Main10 (.2) implies 10-bit. Main12 (.4) implies 12-bit. Otherwise 8-bit.
 *   - Visual score: DV > Main12 > Main10 > Main8 > AVC fallback.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const RE_HEVC = /^(hvc1|hev1)\.([A-Z]?\d{1,3})\.([0-9A-F]{1,8})\.([LH])(\d{1,3})((?:\.[0-9A-F]{1,2}){0,6})$/i;

    // Mapping (project doctrine): profile number → bit depth and family
    const PROFILE_TABLE = {
        '1':  { name: 'Main',          bitDepth: 8,  family: 'HEVC_MAIN_8'  },
        '2':  { name: 'Main10',        bitDepth: 10, family: 'HEVC_MAIN_10' },
        '3':  { name: 'MainStillPic',  bitDepth: 8,  family: 'HEVC_MAIN_8'  },
        '4':  { name: 'Main12',        bitDepth: 12, family: 'HEVC_MAIN_12' },
        '5':  { name: 'Main10Still',   bitDepth: 10, family: 'HEVC_MAIN_10' },
        '7':  { name: 'Main10Intra',   bitDepth: 10, family: 'HEVC_MAIN_10' },
        '8':  { name: 'Main12Intra',   bitDepth: 12, family: 'HEVC_MAIN_12' }
    };

    // Level number from L/H<N> token. N/30 = decimal level. e.g. 153/30 = 5.1
    function levelToString(numericLevel) {
        const n = Number(numericLevel);
        if (!Number.isFinite(n) || n <= 0) return null;
        const major = Math.floor(n / 30);
        const minor = Math.round(((n / 30) - major) * 10);
        return major + '.' + minor;
    }

    // Visual score (relative, deterministic — used by fallback resolver).
    // Higher is better. Combines profile family + level.
    function computeVisualScore(family, levelNum, tier) {
        let base = 0;
        switch (family) {
            case 'DOLBY_VISION':   base = 100; break;
            case 'HEVC_MAIN_12':   base =  90; break;
            case 'HEVC_MAIN_10':   base =  80; break;
            case 'HEVC_MAIN_8':    base =  60; break;
            default:               base =  40; break;
        }
        // Level bonus: L153 (5.1) > L150 (5.0) > L120 (4.0). Cap at +20.
        const levelBonus = Math.min(20, Math.max(0, Math.floor((levelNum || 0) - 90) / 5));
        const tierBonus = (tier === 'H') ? 2 : 0;
        return base + levelBonus + tierBonus;
    }

    /**
     * Parse an HEVC codec string (RFC 6381).
     * @param {string} codec - e.g. 'hvc1.2.4.L153.B0'
     * @returns {Object}
     */
    function parseHevcCodec(codec) {
        const raw = String(codec || '').trim();
        const out = {
            raw:               raw,
            valid:             false,
            fourCC:            null,
            profileId:         null,
            profileName:       null,
            compatibilityHex:  null,
            tier:              null,        // 'L' main, 'H' high
            level:             null,        // numeric, e.g. 153
            levelString:       null,        // '5.1'
            constraintFlags:   [],
            bitDepth:          null,
            codecFamily:       null,
            visualScore:       null,
            warnings:          []
        };

        if (!raw) {
            out.warnings.push('empty HEVC codec');
            return out;
        }

        const m = RE_HEVC.exec(raw);
        if (!m) {
            out.warnings.push('does not match RFC 6381 HEVC grammar');
            return out;
        }

        out.fourCC = m[1].toLowerCase();

        // Profile token may be "2" or "B2" (rare). Extract digits.
        const profDigits = m[2].replace(/^[A-Z]/i, '');
        out.profileId = profDigits;

        out.compatibilityHex = m[3].toUpperCase();
        out.tier = m[4].toUpperCase();
        out.level = parseInt(m[5], 10);
        out.levelString = levelToString(out.level);

        const tail = (m[6] || '').replace(/^\./, '');
        if (tail) {
            out.constraintFlags = tail.split('.').filter(Boolean).map(function (b) { return b.toUpperCase(); });
        }

        const profEntry = PROFILE_TABLE[String(out.profileId)] || null;
        if (profEntry) {
            out.profileName = profEntry.name;
            out.bitDepth    = profEntry.bitDepth;
            out.codecFamily = profEntry.family;
        } else {
            out.profileName = 'Unknown';
            out.codecFamily = 'HEVC_UNKNOWN';
            out.bitDepth    = null;
            out.warnings.push('unknown HEVC profile id: ' + out.profileId);
        }

        out.visualScore = computeVisualScore(out.codecFamily, out.level, out.tier);
        out.valid = true;
        return out;
    }

    /**
     * Defensive: infer bit depth from codec string alone.
     * Returns 8 / 10 / 12 / null. NEVER infers Main12 from L153.
     */
    function inferBitDepthFromCodec(codec) {
        const p = parseHevcCodec(codec);
        return p.valid ? p.bitDepth : null;
    }

    /**
     * Compare two HEVC codec strings by visual quality.
     * Returns -1 / 0 / 1 (sort-compatible).
     */
    function compareVisualScore(a, b) {
        const pa = parseHevcCodec(a);
        const pb = parseHevcCodec(b);
        const sa = pa.valid ? pa.visualScore : -1;
        const sb = pb.valid ? pb.visualScore : -1;
        return sa < sb ? -1 : (sa > sb ? 1 : 0);
    }

    const APEHevcParser = {
        parseHevcCodec:        parseHevcCodec,
        inferBitDepthFromCodec: inferBitDepthFromCodec,
        compareVisualScore:    compareVisualScore,
        levelToString:         levelToString,
        PROFILE_TABLE:         PROFILE_TABLE
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEHevcParser;
    } else {
        global.APEHevcParser = APEHevcParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
