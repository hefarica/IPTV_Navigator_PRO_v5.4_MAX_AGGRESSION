/**
 * Module:       ape-perceptual-4k.js
 * Purpose:      PERCEPTUAL 4K MODE — ADB display mode injection, EDID HDR header
 *               negotiation constants, and per-channel HDR10 overlay for Android TV.
 *               Does NOT transcode. Tells the TV's scaler and color pipeline what to
 *               expect from the incoming stream so it can apply HDR10 tone mapping.
 * Relationship: Loaded after m3u8-typed-arrays-ultimate.js.
 *               Activated by #perceptual-4k toggle (index-v4.html).
 *               ADB commands are relayed via prisma_adb_overlay.sh on the sentinel.
 *               VPS endpoint: /prisma/api/prisma-adb-quality.php?action=save_manifest
 */

/* global window */

(function (global) {
    'use strict';

    // ── HDR10 display mode constants (Android TV ADB settings) ──────────────
    const HDR_DISPLAY_MODES = {
        HDR10:  { adb: 'settings put global display_mode_hdr 1',    label: 'HDR10'  },
        HLG:    { adb: 'settings put global display_mode_hdr 2',    label: 'HLG'    },
        SDR:    { adb: 'settings put global display_mode_hdr 0',    label: 'SDR'    },
        DV:     { adb: 'settings put global display_mode_hdr 4',    label: 'DV'     },
    };

    const DISPLAY_RESOLUTION_CMDS = {
        '4K':   'settings put global display_mode_resolution 2160',
        '1080': 'settings put global display_mode_resolution 1080',
        '720':  'settings put global display_mode_resolution 720',
    };

    const COLOR_MODE_CMD     = 'settings put secure display_color_mode 1';
    const REFRESH_RATE_60    = 'settings put global display_mode_refresh_rate 60';
    const REFRESH_RATE_120   = 'settings put global display_mode_refresh_rate 120';

    // ── EDID-derived header hints (injected into #EXT-X-APE-* tags) ─────────
    // These tell Lua body filter and VPS what display capability was negotiated.
    const EDID_HINTS = {
        HDR10_4K:  '#EXT-X-APE-DISPLAY:HDR10,3840x2160,60Hz,BT.2020,PQ',
        HLG_4K:    '#EXT-X-APE-DISPLAY:HLG,3840x2160,60Hz,BT.2020',
        SDR_4K:    '#EXT-X-APE-DISPLAY:SDR,3840x2160,60Hz,BT.709',
        HDR10_FHD: '#EXT-X-APE-DISPLAY:HDR10,1920x1080,60Hz,BT.2020,PQ',
    };

    /**
     * Build the list of ADB shell commands needed to enable Perceptual 4K mode.
     * @param {object} opts — {hdrMode: 'HDR10'|'HLG'|'DV'|'SDR', resolution: '4K'|'1080', fps: 60|120}
     * @returns {string[]} Array of ADB shell commands (without "adb shell" prefix).
     */
    function getADBCommands(opts) {
        opts = opts || {};
        const hdrKey = (opts.hdrMode || 'HDR10').toUpperCase();
        const resKey = (opts.resolution === '1080') ? '1080' : '4K';
        const fps    = opts.fps >= 100 ? 120 : 60;

        const cmds = [];
        if (HDR_DISPLAY_MODES[hdrKey]) cmds.push(HDR_DISPLAY_MODES[hdrKey].adb);
        if (DISPLAY_RESOLUTION_CMDS[resKey]) cmds.push(DISPLAY_RESOLUTION_CMDS[resKey]);
        cmds.push(COLOR_MODE_CMD);
        cmds.push(fps >= 100 ? REFRESH_RATE_120 : REFRESH_RATE_60);
        return cmds;
    }

    /**
     * Return the EDID hint string to embed in the playlist header.
     * @param {object} opts — {hdrMode, resolution}
     * @returns {string} — #EXT-X-APE-DISPLAY tag
     */
    function getEDIDHint(opts) {
        opts = opts || {};
        const isHDR = (opts.hdrMode || 'HDR10') !== 'SDR';
        const is4K  = (opts.resolution !== '1080');
        if (isHDR && is4K)  return EDID_HINTS.HDR10_4K;
        if (!isHDR && is4K) return EDID_HINTS.SDR_4K;
        return EDID_HINTS.HDR10_FHD;
    }

    /**
     * Apply Perceptual 4K overlay to a channel entry lines array.
     * Appends #EXT-X-APE-DISPLAY hint + #EXT-X-APE-P4K tag before the URL line.
     * Called by m3u8-typed-arrays-ultimate.js when perceptual4kMode === true.
     *
     * @param {string[]} lines  — per-channel lines array (mutated in place)
     * @param {object}   opts   — {hdrMode, resolution, fps, profile}
     * @returns {string[]} The same array with P4K tags prepended
     */
    function applyPerceptual4KToChannel(lines, opts) {
        if (!Array.isArray(lines)) return lines;
        opts = opts || {};

        const hint = getEDIDHint(opts);
        const adbCmds = getADBCommands(opts);
        const profile = (opts.profile || 'P2').toUpperCase();

        // Insert before the URL line (last non-comment line)
        const insertAt = lines.length > 0 ? lines.length - 1 : 0;

        lines.splice(insertAt, 0,
            hint,
            '#EXT-X-APE-P4K:ACTIVE,PROFILE=' + profile + ',HDR=' + (opts.hdrMode || 'HDR10'),
            '#EXT-X-APE-P4K-ADB:' + adbCmds.join('|')
        );

        return lines;
    }

    /**
     * Generate the quality overlay request payload for prisma-adb-quality.php.
     * Sent when the user activates Perceptual 4K so the sentinel daemon can inject ADB.
     * @param {object} opts — {hdrMode, resolution, fps, channelId}
     * @returns {object} Payload ready for JSON.stringify
     */
    function buildQualityPayload(opts) {
        opts = opts || {};
        return {
            action:       'save_manifest',
            perceptual_4k: true,
            hdr_mode:     opts.hdrMode     || 'HDR10',
            resolution:   opts.resolution  || '3840x2160',
            fps:          opts.fps         || 60,
            channel_id:   opts.channelId   || null,
            adb_commands: getADBCommands(opts),
            ts:           Date.now(),
            saved_by:     'ape-perceptual-4k.js',
        };
    }

    // ── Public API ───────────────────────────────────────────────────────────
    global.APE_PERCEPTUAL_4K = {
        VERSION:              '1.0.0',
        HDR_DISPLAY_MODES,
        DISPLAY_RESOLUTION_CMDS,
        EDID_HINTS,
        getADBCommands,
        getEDIDHint,
        applyPerceptual4KToChannel,
        buildQualityPayload,

        /** Returns true if the perceptual-4k toggle is checked in the UI. */
        isActive() {
            return !!(document.getElementById('perceptual-4k') || {}).checked;
        },

        /** Returns current options from UI state. */
        getActiveOptions() {
            return {
                hdrMode:    'HDR10',
                resolution: '4K',
                fps:        60,
            };
        },
    };

})(typeof window !== 'undefined' ? window : globalThis);
