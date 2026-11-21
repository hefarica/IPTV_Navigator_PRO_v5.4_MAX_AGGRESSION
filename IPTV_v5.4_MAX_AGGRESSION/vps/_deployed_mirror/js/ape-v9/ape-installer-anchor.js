/* ══════════════════════════════════════════════════════════════════════════
 * APE — Installer / Wake Anchor (SSOT de los tags ancla del M3U8)
 *
 * Emite tags INVISIBLES a players (#EXT-X-APE-*) que anclan en la lista:
 *   - INSTALLER: sub-URL del bootstrap (curl|sh DESDE EL HOST CON ADB, no el player).
 *   - WAKE:      beacon del wake-on-playback (el VPS despierta el daemon en ms).
 *
 * VERDAD TÉCNICA (no player-breaking lie):
 *   El player NO ejecuta el instalador ni habilita ADB (imposible). El INSTALLER es
 *   un puntero operativo; el WAKE real lo dispara el VPS al ver el GET del .m3u8
 *   (log_by_lua ape_wake_on_manifest.lua → ape-wake-worker → ADB SIGUSR1/trigger).
 *   Estos tags son metadata; ningún player los ejecuta (RFC 8216 §ignore-unknown).
 * ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
    'use strict';

    var APE_INSTALLER_ANCHOR = {
        base: 'https://iptv-ape.duckdns.org',
        installerPath: '/prisma/install/ape-daemon.sh',
        wakePath: '/prisma/api/ape-wake.php',
        version: '2026.06-universal-1'
    };

    // Devuelve las líneas ancla (array de strings #EXT-X-APE-*). opts.base override.
    function apeInstallerAnchorLines(opts) {
        opts = opts || {};
        var base = opts.base || APE_INSTALLER_ANCHOR.base;
        var ver = opts.version || APE_INSTALLER_ANCHOR.version;
        return [
            '#EXT-X-APE-INSTALLER:URL="' + base + APE_INSTALLER_ANCHOR.installerPath +
                '",VERSION="' + ver + '",RUN="host-with-adb"',
            '#EXT-X-APE-WAKE:BEACON="' + base + APE_INSTALLER_ANCHOR.wakePath +
                '",MODE="on-manifest",NOTE="VPS wakes on-device daemon in ms on playback"'
        ];
    }

    // Versión string (para concatenar en una cabecera template).
    function apeInstallerAnchorBlock(opts) {
        return apeInstallerAnchorLines(opts).join('\n');
    }

    var api = {
        APE_INSTALLER_ANCHOR: APE_INSTALLER_ANCHOR,
        apeInstallerAnchorLines: apeInstallerAnchorLines,
        apeInstallerAnchorBlock: apeInstallerAnchorBlock
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (root) {
        root.APE_INSTALLER_ANCHOR = APE_INSTALLER_ANCHOR;
        root.apeInstallerAnchorLines = apeInstallerAnchorLines;
        root.apeInstallerAnchorBlock = apeInstallerAnchorBlock;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
