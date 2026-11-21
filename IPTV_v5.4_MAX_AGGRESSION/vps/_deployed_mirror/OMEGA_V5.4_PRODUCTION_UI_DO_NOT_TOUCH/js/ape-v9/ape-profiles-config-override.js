/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🛡️ APE PROFILES CONFIG OVERRIDE — ANTI-ARENA v2 AGRESIVO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este archivo SOBREESCRIBE únicamente las cadenas video_filter que contenían
 * "unsharp" en ape-profiles-config.js — sin tocar el archivo original.
 *
 * DOCTRINA: unsharp amplifica el ruido de compresión → genera arena.
 * El afilado de bordes lo hace Real-ESRGAN (AI-SR, M7). NO filtros lineales.
 *
 * REEMPLAZOS:
 *   - unsharp eliminado de todas las cadenas
 *   - nlmeans subido: s=3.0→s=8.0 (P0/P1), s=2.5→s=6.0 (P3), s=2.0→s=5.0 (P4)
 *   - hqdn3d subido: luma_spatial=2.0→6.0, chroma_spatial=1.5→5.0
 *   - gradfun strength subido: 1.0→2.0 (P0/P1), 0.8→1.6 (P3)
 *
 * PERFILES AFECTADOS: P0, P1, P3, P4
 * LÍNEAS ORIGINALES:  294, 570, 578, 586, 594, 908, 1183, 1191, 1199,
 *                     1994, 2269, 2277, 2608, 2882
 *
 * VERSIÓN: anti-arena-v2.0.0
 * FECHA:   2026-06-21
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    // ── Cadenas de reemplazo sin unsharp, con DNR agresivo ──────────────────

    // P0 / P1 — HDR10 PQ (8K/4K): nlmeans máximo + gradfun fuerte
    const VF_HDR_SUPREME =
        "nlmeans=s=8.0:p=7:r=15," +
        "bwdif=mode=1:parity=-1:deint=0," +
        "gradfun=radius=16:strength=2.0," +
        "zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:" +
        "dither=error_diffusion:range=full";

    // P0 / P1 — SDR 4K (sub-tier): nlmeans agresivo + gradfun
    const VF_SDR_4K =
        "nlmeans=s=6.0:p=5:r=11," +
        "bwdif=mode=1:parity=-1:deint=0," +
        "gradfun=radius=12:strength=1.6," +
        "zscale=transfer=bt709:primaries=bt709:matrix=bt709:" +
        "dither=error_diffusion:range=full";

    // P0 / P1 — Sub-HD (tier bajo): hqdn3d agresivo sin unsharp
    const VF_SUBHD_CLEAN =
        "hqdn3d=luma_spatial=6.0:chroma_spatial=5.0:luma_tmp=8.0:chroma_tmp=6.0," +
        "yadif=mode=1:parity=-1:deint=0";

    // P3 — FHD Stable: nlmeans moderado-alto
    const VF_P3_HDR =
        "nlmeans=s=6.0:p=5:r=11," +
        "bwdif=mode=1:parity=-1:deint=0," +
        "gradfun=radius=12:strength=1.6," +
        "zscale=transfer=bt709:primaries=bt709:matrix=bt709:" +
        "dither=error_diffusion:range=full";

    // P3 — Sub-HD: hqdn3d agresivo
    const VF_P3_SUBHD =
        "hqdn3d=luma_spatial=6.0:chroma_spatial=5.0:luma_tmp=8.0:chroma_tmp=6.0," +
        "yadif=mode=1:parity=-1:deint=0";

    // P4 — HD Compatible: hqdn3d agresivo (sin nlmeans para no sobrecargar hardware bajo)
    const VF_P4_CLEAN =
        "hqdn3d=luma_spatial=5.0:chroma_spatial=4.0:luma_tmp=7.0:chroma_tmp=5.5," +
        "yadif=mode=1:parity=-1:deint=0";

    // ── Mapa de sustitución: cadena original → cadena limpia ────────────────
    const OVERRIDE_MAP = {
        // P0 — GOD_TIER_8K_OMEGA
        "nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full":
            VF_HDR_SUPREME,
        // P0 / P1 — SDR 4K sub-tier
        "nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full":
            VF_SDR_4K,
        // P0 / P1 / P3 / P4 — sub-HD hqdn3d con unsharp
        "hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0":
            VF_SUBHD_CLEAN,
        // P3 — FHD HDR
        "nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full":
            VF_P3_HDR,
    };

    // ── Función de parcheo: recorre el árbol de perfiles y aplica overrides ─

    function patchVideoFilters(profiles) {
        if (!profiles || !Array.isArray(profiles)) return profiles;

        return profiles.map(function (profile) {
            // Parchear video-filter de nivel superior (key con guión)
            if (profile['video-filter'] && OVERRIDE_MAP[profile['video-filter']]) {
                console.log(
                    '[APE-OVERRIDE] Patched video-filter in profile',
                    profile.id || profile.name || '?',
                    '→ unsharp eliminated'
                );
                profile['video-filter'] = OVERRIDE_MAP[profile['video-filter']];
            }

            // Parchear video_filter de nivel superior (key con guión bajo)
            if (profile.video_filter && OVERRIDE_MAP[profile.video_filter]) {
                console.log(
                    '[APE-OVERRIDE] Patched video_filter in profile',
                    profile.id || profile.name || '?',
                    '→ unsharp eliminated'
                );
                profile.video_filter = OVERRIDE_MAP[profile.video_filter];
            }

            // Parchear sub-perfiles anidados (tiers: HDR, SDR, SD, etc.)
            ['tiers', 'sub_profiles', 'variants', 'resolutions'].forEach(function (key) {
                if (profile[key] && Array.isArray(profile[key])) {
                    profile[key] = patchVideoFilters(profile[key]);
                }
            });

            // Parchear objetos anidados con video_filter
            Object.keys(profile).forEach(function (k) {
                if (typeof profile[k] === 'object' && profile[k] !== null) {
                    if (profile[k].video_filter && OVERRIDE_MAP[profile[k].video_filter]) {
                        console.log(
                            '[APE-OVERRIDE] Patched nested video_filter in',
                            profile.id || '?', '→', k
                        );
                        profile[k].video_filter = OVERRIDE_MAP[profile[k].video_filter];
                    }
                    if (profile[k]['video-filter'] && OVERRIDE_MAP[profile[k]['video-filter']]) {
                        profile[k]['video-filter'] = OVERRIDE_MAP[profile[k]['video-filter']];
                    }
                }
            });

            return profile;
        });
    }

    // ── Interceptar la inicialización del sistema de perfiles ───────────────

    // Método 1: Hook sobre el objeto APE_PROFILES si ya existe
    function applyOverride() {
        var targets = [
            window.APE_PROFILES,
            window.apeProfilesConfig,
            window.APE_CONFIG && window.APE_CONFIG.profiles,
            window.apeConfig && window.apeConfig.profiles,
        ];

        var patched = 0;
        targets.forEach(function (target) {
            if (target && Array.isArray(target)) {
                patchVideoFilters(target);
                patched++;
            }
        });

        if (patched > 0) {
            console.log('[APE-OVERRIDE] ✅ Anti-arena v2: ' + patched + ' profile arrays patched. unsharp=ELIMINATED.');
        }
    }

    // Método 2: Interceptar defineProperty para capturar la asignación
    var _originalDefineProperty = Object.defineProperty;
    ['APE_PROFILES', 'apeProfilesConfig'].forEach(function (propName) {
        try {
            var _val = window[propName];
            _originalDefineProperty(window, propName, {
                get: function () { return _val; },
                set: function (newVal) {
                    if (Array.isArray(newVal)) {
                        console.log('[APE-OVERRIDE] Intercepted assignment to window.' + propName + ' — patching...');
                        _val = patchVideoFilters(newVal);
                    } else {
                        _val = newVal;
                    }
                },
                configurable: true
            });
        } catch (e) {
            // silencioso si ya está definido como no-configurable
        }
    });

    // Método 3: Aplicar al DOMContentLoaded y al load por si acaso
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyOverride);
    } else {
        applyOverride();
    }
    window.addEventListener('load', applyOverride);

    // Método 4: Exponer función global para llamada manual desde consola
    window.APE_ANTI_SAND_OVERRIDE = {
        version: 'anti-arena-v2.0.0',
        apply: applyOverride,
        map: OVERRIDE_MAP,
        patchTree: patchVideoFilters
    };

    console.log('[APE-OVERRIDE] ape-profiles-config-override.js cargado — Anti-Arena v2 activo.');

})();
