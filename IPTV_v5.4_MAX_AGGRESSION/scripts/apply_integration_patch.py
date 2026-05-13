#!/usr/bin/env python3
from pathlib import Path
import sys

HELPER_BLOCK = r'''
    // ═══════════════════════════════════════════════════════════════════════════
    // APE HEALTH ADMISSION RUNTIME — Integración 2026-04-16
    // Publicación por admisión, limpieza M3U8 y variantes seguras por perfil
    // ═══════════════════════════════════════════════════════════════════════════
    const APE_HLS_CONTENT_TYPES = [
        'application/vnd.apple.mpegurl',
        'application/x-mpegurl',
        'application/mpegurl',
        'audio/mpegurl',
        'audio/x-mpegurl'
    ];

    function _apeNormalizeContentType(value) {
        return String(value || '').split(';')[0].trim().toLowerCase();
    }

    function _apeIsHlsContentType(value) {
        const ct = _apeNormalizeContentType(value);
        return !!ct && APE_HLS_CONTENT_TYPES.includes(ct);
    }

    function _apeAddQuery(url, key, value) {
        if (!url) return '';
        const sep = url.includes('?') ? '&' : '?';
        const hashIdx = url.indexOf('#');
        if (hashIdx === -1) return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        return `${url.slice(0, hashIdx)}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}${url.slice(hashIdx)}`;
    }

    function _apeStripRuntimeQuery(url) {
        if (!url) return '';
        return String(url)
            .replace(/[?&]ape_sid=[^&]*/gi, '')
            .replace(/[?&]ape_nonce=[^&]*/gi, '')
            .replace(/[?&]ape_jwt=[^&]*/gi, '')
            .replace(/[?&]_ape_r=[^&]*/gi, '')
            .replace(/[?&]profile=[^&]*/gi, '')
            .replace(/&&+/g, '&')
            .replace(/\?&/g, '?')
            .replace(/[?&]$/, '');
    }

    function ensureM3U8Extension(url) {
        if (!url) return '';
        const raw = _apeStripRuntimeQuery(String(url));
        if (/\.m3u8(\?|#|$)/i.test(raw)) return raw;
        if (/\.ts(\?|#|$)/i.test(raw)) return raw.replace(/\.ts(?=(\?|#|$))/i, '.m3u8');
        return raw;
    }

    function _apeGetHealthRuntime() {
        if (typeof window !== 'undefined' && window.APEHealthRuntime) return window.APEHealthRuntime;
        if (typeof globalThis !== 'undefined' && globalThis.APEHealthRuntime) return globalThis.APEHealthRuntime;
        return null;
    }

    function _apeResolveAdmission(channel, primaryUrl, creds = {}, profile = 'P3') {
        const cleaned = _apeStripRuntimeQuery(primaryUrl || '');
        const runtime = _apeGetHealthRuntime();
        if (!runtime || typeof runtime.lookup !== 'function') {
            return { allowed: true, entry: null, primaryUrl: cleaned, runtime: null };
        }

        const entry = runtime.lookup({ channel, url: cleaned, creds, profile });
        const requireAdmission = !!(runtime.config && runtime.config.requireAdmission);
        if (!entry) {
            return { allowed: !requireAdmission, entry: null, primaryUrl: cleaned, runtime };
        }

        const admittedUrl = _apeStripRuntimeQuery(entry.url || cleaned);
        return {
            allowed: true,
            entry,
            primaryUrl: admittedUrl || cleaned,
            runtime
        };
    }

    function _apeBuildProfileUrls(baseUrl, channel, runtime, admissionEntry, requestedProfile) {
        const fallbackBase = _apeStripRuntimeQuery(baseUrl || '');
        const ladder = ['P1', 'P2', 'P3'];
        const urls = [];
        for (const ladderProfile of ladder) {
            let candidate = '';
            if (runtime && typeof runtime.getProfileUrl === 'function') {
                candidate = runtime.getProfileUrl({
                    profile: ladderProfile,
                    channel,
                    admission: admissionEntry,
                    fallbackUrl: fallbackBase,
                    requestedProfile
                }) || '';
            }

            if (!candidate) {
                const profileTransport = runtime && runtime.config ? runtime.config.profileTransport : 'clean';
                if (profileTransport === 'origin_query') {
                    candidate = _apeAddQuery(fallbackBase, 'profile', ladderProfile);
                } else if (profileTransport === 'fragment') {
                    candidate = `${fallbackBase}${fallbackBase.includes('#') ? '&' : '#'}profile=${encodeURIComponent(ladderProfile)}`;
                } else {
                    candidate = fallbackBase;
                }
            }
            urls.push(candidate || fallbackBase);
        }
        return urls;
    }
'''


def apply_patch(text: str) -> str:
    marker = "    // ═══════════════════════════════════════════════════════════════════════════\n    // generateChannelEntry — v23.0 OMEGA CRYSTAL UNIVERSAL"
    if "APE HEALTH ADMISSION RUNTIME" not in text:
        if marker not in text:
            raise RuntimeError("No se encontró el marcador para insertar el bloque helper")
        text = text.replace(marker, HELPER_BLOCK + "\n" + marker, 1)

    old = """        if (primaryUrl) {\n            primaryUrl = getTierUrl(primaryUrl);\n        }\n\n        // ── EXTINF DESDE generateEXTINF ───────────────────────────────────────\n"""
    new = """        if (primaryUrl) {\n            primaryUrl = getTierUrl(primaryUrl);\n        }\n\n        const _admission = _apeResolveAdmission(channel, primaryUrl, _usaCredsForChannel, profile);\n        if (!_admission.allowed) {\n            if (index < 25) console.warn(`🚫 [ADMISSION] Canal omitido por no estar admitido: ${channel.name || channel.stream_id || index}`);\n            return '';\n        }\n        if (_admission.entry && _admission.primaryUrl) {\n            primaryUrl = ensureM3U8Extension(_admission.primaryUrl);\n        }\n\n        // ── EXTINF DESDE generateEXTINF ───────────────────────────────────────\n"""
    if "const _admission = _apeResolveAdmission" not in text:
        if old not in text:
            raise RuntimeError("No se encontró el punto de inyección para la admisión")
        text = text.replace(old, new, 1)

    old = """        function _buildRedundantUrls(primary, channel, credMap, sid, nonce, profile) {\n            // AGENT-2 FIX 2026-04-12: Robust redundant URL builder.\n            // Primary + 2 backups that are TECHNICALLY DIFFERENT URLs so players\n            // treat them as distinct failover variants. Strategies (in priority):\n            //   1. Alternate server from credMap (different host entirely)\n            //   2. Same URL with cache-bust query param (?_ape_r=N)\n            //   3. Alternate extension (.m3u8 ↔ .ts) if Xtream pattern detected\n            const urls = [];\n            if (typeof primary !== 'string' || !primary) return [primary || '', primary || '', primary || ''];\n            urls.push(primary);\n\n            // Strategy 1: alternate servers from credMap\n            const altServers = [];\n            if (credMap && typeof credMap === 'object') {\n                const currentBase = (credMap['__current__'] && credMap['__current__'].baseUrl) || '';\n                for (const k of Object.keys(credMap)) {\n                    if (k === '__current__') continue;\n                    const cm = credMap[k];\n                    if (cm && cm.baseUrl && cm.baseUrl !== currentBase) altServers.push(cm);\n                }\n            }\n\n            // Strategy 2: cache-bust query param (different URL, same upstream, player sees as variant)\n            const _addQuery = (url, paramKey, paramVal) => {\n                const sep = url.includes('?') ? '&' : '?';\n                const hashIdx = url.indexOf('#');\n                if (hashIdx === -1) return `${url}${sep}${paramKey}=${paramVal}`;\n                return url.slice(0, hashIdx) + sep + paramKey + '=' + paramVal + url.slice(hashIdx);\n            };\n\n            // Strategy 3: swap .ts ↔ .m3u8 for Xtream URLs\n            const _swapExt = (url) => {\n                if (/\\.m3u8(\\?|#|$)/i.test(url)) return url.replace(/\\.m3u8/i, '.ts');\n                if (/\\.ts(\\?|#|$)/i.test(url)) return url.replace(/\\.ts/i, '.m3u8');\n                return url + '?alt=1';\n            };\n\n            // Build backup 1\n            if (altServers[0]) {\n                const alt = altServers[0];\n                const streamId = (channel && (channel.stream_id || channel.id)) || '0';\n                const ext = primary.includes('.m3u8') ? '.m3u8' : '.ts';\n                urls.push(`${alt.baseUrl.replace(/\\/+$/, '')}/live/${alt.username}/${alt.password}/${streamId}${ext}`);\n            } else {\n                const r1 = ((parseInt(nonce, 16) || Math.floor(Math.random() * 0xffff)) * 17).toString(16);\n                urls.push(_addQuery(primary, '_ape_r', r1));\n            }\n\n            // Build backup 2\n            if (altServers[1]) {\n                const alt = altServers[1];\n                const streamId = (channel && (channel.stream_id || channel.id)) || '0';\n                const ext = primary.includes('.m3u8') ? '.m3u8' : '.ts';\n                urls.push(`${alt.baseUrl.replace(/\\/+$/, '')}/live/${alt.username}/${alt.password}/${streamId}${ext}`);\n            } else {\n                // Use extension swap as ultimate fallback (forces Xtream to return HLS vs raw TS)\n                urls.push(_swapExt(primary));\n            }\n\n            return urls;\n        }\n"""
    new = """        function _buildRedundantUrls(primary, channel, credMap, sid, nonce, profile) {\n            const runtime = _admission.runtime || _apeGetHealthRuntime();\n            if (typeof window !== 'undefined' && window.MultiServerFusionV9 && typeof window.MultiServerFusionV9.buildRedundantUrls === 'function') {\n                const externalUrls = window.MultiServerFusionV9.buildRedundantUrls({\n                    primaryUrl: primary,\n                    channel,\n                    credentialsMap: credMap,\n                    sid,\n                    nonce,\n                    profile,\n                    admission: _admission.entry,\n                    runtimeConfig: runtime && runtime.config ? runtime.config : {}\n                });\n                if (Array.isArray(externalUrls) && externalUrls.length >= 3) return externalUrls;\n            }\n            return _apeBuildProfileUrls(primary, channel, runtime, _admission.entry, profile);\n        }\n"""
    if "window.MultiServerFusionV9" not in text:
        if old not in text:
            raise RuntimeError("No se encontró el bloque redundante a sustituir")
        text = text.replace(old, new, 1)

    old = """    async function generateM3U8(channels, options = {}) {\n        if (!channels || !Array.isArray(channels) || channels.length === 0) {\n            console.error('❌ [TYPED-ARRAYS] No hay canales para generar');\n            return null;\n        }\n\n        // AUTO-DELTA METADATA SCAN - OBLIGATORIO PRE-GENERACIÓN\n"""
    new = """    async function generateM3U8(channels, options = {}) {\n        if (!channels || !Array.isArray(channels) || channels.length === 0) {\n            console.error('❌ [TYPED-ARRAYS] No hay canales para generar');\n            return null;\n        }\n\n        if (typeof window !== 'undefined' && window.APEHealthRuntime && options.useAdmission !== false) {\n            try {\n                await window.APEHealthRuntime.ensureReady(options);\n            } catch (healthError) {\n                console.warn('⚠️ [APE-HEALTH] No se pudo preparar el runtime de salud:', healthError.message);\n            }\n        }\n\n        // AUTO-DELTA METADATA SCAN - OBLIGATORIO PRE-GENERACIÓN\n"""
    if "window.APEHealthRuntime.ensureReady" not in text:
        if old not in text:
            raise RuntimeError("No se encontró el punto de preparación de generateM3U8")
        text = text.replace(old, new, 1)

    old = """        const stream = generateM3U8Stream(safeChannels, options);\n"""
    new = """        if (typeof window !== 'undefined' && window.APEHealthRuntime && options.useAdmission !== false && typeof window.APEHealthRuntime.filterAdmittedChannels === 'function') {\n            safeChannels = window.APEHealthRuntime.filterAdmittedChannels(safeChannels, options);\n        }\n\n        const stream = generateM3U8Stream(safeChannels, options);\n"""
    if "window.APEHealthRuntime.filterAdmittedChannels" not in text:
        if old not in text:
            raise RuntimeError("No se encontró el punto de filtrado de generateM3U8")
        text = text.replace(old, new, 1)

    old = """            generateChannelEntry: generateChannelEntry,\n            generateJWT: generateJWT68Fields,\n            determineProfile: determineProfile,\n            profiles: PROFILES,\n"""
    new = """            generateChannelEntry: generateChannelEntry,\n            generateJWT: generateJWT68Fields,\n            determineProfile: determineProfile,\n            ensureM3U8Extension: ensureM3U8Extension,\n            loadAdmissionMap: async function (url, runtimeOptions = {}) {\n                if (typeof window === 'undefined' || !window.APEHealthRuntime) return null;\n                return window.APEHealthRuntime.loadAdmittedMap(url, runtimeOptions);\n            },\n            getHealthStats: function () {\n                if (typeof window === 'undefined' || !window.APEHealthRuntime || typeof window.APEHealthRuntime.getStats !== 'function') return null;\n                return window.APEHealthRuntime.getStats();\n            },\n            profiles: PROFILES,\n"""
    if "loadAdmissionMap: async function" not in text:
        if old not in text:
            raise RuntimeError("No se encontró el bloque API global")
        text = text.replace(old, new, 1)

    return text


def main():
    if len(sys.argv) not in (2, 3):
        print("Uso: apply_integration_patch.py <input.js> [output.js]", file=sys.stderr)
        raise SystemExit(2)

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) == 3 else src
    text = src.read_text(encoding='utf-8')
    patched = apply_patch(text)
    dst.write_text(patched, encoding='utf-8')
    print(f"Patched: {dst}")


if __name__ == '__main__':
    main()
