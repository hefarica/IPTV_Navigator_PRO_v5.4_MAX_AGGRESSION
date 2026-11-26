/**
 * APE PREFETCH MIN-BW — resolución DETERMINISTA del BW mínimo de prefetch.
 *
 * POR QUE EXISTE (medido 2026-11-22):
 *   El panel mostraba `BW mínimo = 1` en un plan 8K. Origen: ProfileManagerV9
 *   derivaba `min_bandwidth_mbps` como `base × 1.15`, y cuando el perfil no tenía
 *   bitrate declarado `_requiredMbpsBasis` caía al "piso mínimo de video 0,5 Mbps"
 *   → 0,5 × 1,15 = 0,58 → redondeado 1 → persistido y servido al generador, que
 *   emite `#EXT-X-APE-PREFETCH-BW-MIN:1Mbps`. Eso es degradación por configuración
 *   (ley anti-degradación) y además incoherente: el mismo panel calculaba 28 Mbps.
 *
 * CONTRATO:
 *   - Puro y determinista: misma entrada → misma salida. Sin Date, sin random,
 *     sin estado global, sin lectura de DOM ni de storage.
 *   - La entrada de red es `measuredMbps` (medición real, p.ej. APE_BW/speedtest).
 *   - El piso lo fija el PERFIL (tier de calidad + bitrate declarado), no la medición.
 *   - Sin medición válida NO se inventa un valor: se devuelve el piso declarado.
 *   - El resultado nunca queda por debajo del piso.
 *
 * Fuera de alcance: no mide, no escribe configuración, no decide estrategia.
 */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.APEPrefetchMinBw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* Pisos por tier, en Mbps, alineados con la tabla de bitrate del repo
     * (CLAUDE.md → "Bitrate Fallback por Resolución"). Un 8K no puede exigir
     * menos de 80 Mbps: declarar 1 Mbps es afirmar una fuente que no existe. */
    var FLOOR_MBPS = {
        '8K': 80,
        '6K': 60,
        '4K': 28,
        'UHD': 28,
        'QHD': 16,
        'FHD': 12,
        'HD': 5.5,
        'SD': 2.5,
        'TINY': 1.5
    };

    var MARGIN_DEFAULT = 1.15;
    var MARGIN_MIN = 1.0;
    var MARGIN_MAX = 2.0;

    function round2(n) {
        return Math.round(n * 100) / 100;
    }

    function finitePositive(n) {
        var v = Number(n);
        return (isFinite(v) && v > 0) ? v : null;
    }

    /** Piso del tier por su nombre canónico (8K/6K/4K/UHD/QHD/FHD/HD/SD). */
    function tierFloor(tier) {
        if (!tier) return null;
        var k = String(tier).toUpperCase().trim();
        if (Object.prototype.hasOwnProperty.call(FLOOR_MBPS, k)) return FLOOR_MBPS[k];
        /* Tolerar etiquetas compuestas: "GOD_TIER_8K", "P0_8K", "2160p". */
        if (k.indexOf('8K') >= 0 || k.indexOf('4320') >= 0) return FLOOR_MBPS['8K'];
        if (k.indexOf('6K') >= 0) return FLOOR_MBPS['6K'];
        if (k.indexOf('4K') >= 0 || k.indexOf('2160') >= 0) return FLOOR_MBPS['4K'];
        if (k.indexOf('1440') >= 0) return FLOOR_MBPS['QHD'];
        if (k.indexOf('1080') >= 0) return FLOOR_MBPS['FHD'];
        if (k.indexOf('720') >= 0) return FLOOR_MBPS['HD'];
        if (k.indexOf('480') >= 0 || k.indexOf('SD') >= 0) return FLOOR_MBPS['SD'];
        return null;
    }

    /**
     * resolveMinBwMbps({ measuredMbps, tierMbps, declaredMbps, margin })
     *   measuredMbps  medición real de red (puede faltar o ser inválida)
     *   tierMbps      piso del tier del perfil (ver tierFloor)
     *   declaredMbps  piso declarado por el perfil (p.ej. prefetch_config)
     *   margin        margen de exigencia (def. 1.15, acotado [1.0, 2.0])
     *
     * Devuelve { mbps, source, floor, margin, clamped }.
     *   mbps === null  ⇒ no hay piso declarado: el llamador NO debe escribir nada.
     */
    function resolveMinBwMbps(input) {
        var i = input || {};
        var margin = Number(i.margin);
        if (!isFinite(margin) || margin <= 0) margin = MARGIN_DEFAULT;
        if (margin < MARGIN_MIN) margin = MARGIN_MIN;
        if (margin > MARGIN_MAX) margin = MARGIN_MAX;

        var tier = finitePositive(i.tierMbps);
        var declared = finitePositive(i.declaredMbps);
        var floor = null;
        if (tier !== null && declared !== null) floor = Math.max(tier, declared);
        else if (tier !== null) floor = tier;
        else if (declared !== null) floor = declared;

        if (floor === null) {
            return { mbps: null, source: 'sin_piso_declarado (no se escribe)', floor: null, margin: margin, clamped: false };
        }

        floor = round2(floor);
        var measured = finitePositive(i.measuredMbps);

        if (measured === null) {
            return { mbps: floor, source: 'piso_del_perfil (sin medición de red)', floor: floor, margin: margin, clamped: true };
        }

        var candidate = round2(measured * margin);
        if (candidate < floor) {
            return { mbps: floor, source: 'piso_del_perfil (medición por debajo del piso)', floor: floor, margin: margin, clamped: true };
        }
        return { mbps: candidate, source: 'medición de red × margen', floor: floor, margin: margin, clamped: false };
    }

    return {
        FLOOR_MBPS: FLOOR_MBPS,
        MARGIN_DEFAULT: MARGIN_DEFAULT,
        tierFloor: tierFloor,
        resolveMinBwMbps: resolveMinBwMbps
    };
});
