/**
 * APE DRM PARSER — Reads EXT-X-KEY and EXT-X-SESSION-KEY.
 *
 * Detects: AES-128, SAMPLE-AES, SAMPLE-AES-CTR, FairPlay, Widevine,
 *          PlayReady, ClearKey, unknown.
 *
 * The KEYFORMAT URN identifies the DRM system regardless of METHOD.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    const KEYFORMAT_TO_DRM = [
        { re: /widevine/i,                                     drm: 'WIDEVINE' },
        { re: /com\.apple\.streamingkeydelivery/i,             drm: 'FAIRPLAY' },
        { re: /com\.microsoft\.playready/i,                    drm: 'PLAYREADY' },
        { re: /org\.w3\.clearkey|clearkey/i,                   drm: 'CLEARKEY' },
        { re: /urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed/i,drm: 'WIDEVINE' },
        { re: /urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95/i,drm: 'PLAYREADY' },
        { re: /urn:uuid:94ce86fb-07ff-4f43-adb8-93d2fa968ca2/i,drm: 'FAIRPLAY' }
    ];

    function detectDrm(method, keyFormat) {
        const m = String(method || '').trim().toUpperCase();
        if (m === 'NONE') return { drm: 'NONE', encrypted: false, scheme: 'NONE' };

        const kf = String(keyFormat || '').trim();
        if (kf) {
            for (let i = 0; i < KEYFORMAT_TO_DRM.length; i++) {
                if (KEYFORMAT_TO_DRM[i].re.test(kf)) {
                    return { drm: KEYFORMAT_TO_DRM[i].drm, encrypted: true, scheme: m || 'UNKNOWN' };
                }
            }
        }

        if (m === 'AES-128' && (!kf || kf === 'identity')) {
            return { drm: 'AES_128', encrypted: true, scheme: 'AES-128' };
        }
        if (m.indexOf('SAMPLE-AES') === 0 && (!kf || kf === 'identity')) {
            return { drm: 'SAMPLE_AES', encrypted: true, scheme: m };
        }

        return { drm: 'UNKNOWN', encrypted: !!m && m !== 'NONE', scheme: m || 'UNKNOWN' };
    }

    /**
     * Parse a single EXT-X-KEY or EXT-X-SESSION-KEY attribute object.
     * @param {Object} attrs - Already-parsed attribute hash.
     * @returns {Object}
     */
    function parseKey(attrs) {
        const a = attrs || {};
        const det = detectDrm(a.METHOD, a.KEYFORMAT);
        return {
            method:            a.METHOD || null,
            uri:               a.URI || null,
            iv:                a.IV || null,
            keyFormat:         a.KEYFORMAT || null,
            keyFormatVersions: a.KEYFORMATVERSIONS || null,
            drm:               det.drm,
            encrypted:         det.encrypted,
            scheme:            det.scheme
        };
    }

    /**
     * Parse a list of EXT-X-KEY / EXT-X-SESSION-KEY attribute objects.
     * @param {Array<Object>} keys
     * @returns {Object}
     */
    function parseKeys(keys) {
        const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
        const parsed = list.map(parseKey);
        const drmSystems = Array.from(new Set(parsed.map(function (k) { return k.drm; }).filter(function (d) { return d && d !== 'NONE'; })));
        const playerCompatible = parsed.every(function (k) {
            return k.drm === 'NONE' || k.drm === 'AES_128' || k.drm === 'SAMPLE_AES' || k.drm === 'CLEARKEY';
        });
        return {
            keys:              parsed,
            drmSystems:        drmSystems,
            encrypted:         parsed.some(function (k) { return k.encrypted; }),
            playerCompatible:  playerCompatible
        };
    }

    const APEDrmParser = {
        parseKey:  parseKey,
        parseKeys: parseKeys,
        detectDrm: detectDrm
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEDrmParser;
    } else {
        global.APEDrmParser = APEDrmParser;
    }

})(typeof window !== 'undefined' ? window : globalThis);
