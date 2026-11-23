/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ape-lab-12p-reconcile.js — PUENTE DE LOS 12 PERFILES DEL LAB (REA ronda 20)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * QUÉ HACE
 *   Guarda los 12 perfiles del JSON LAB (P0…P5 y las versiones .5 de 6K) con sus
 *   valores ORIGINALES y:
 *     1) CORRIGE la copia embebida `window.APE_LAB_V8_PROFILES` (que sólo traía 6
 *        perfiles y con suelos/bitrates distintos a los del LAB) ANTES de que
 *        `ape-profiles-config.js` la mezcle. Así el Profile Manager y el generador
 *        leen el suelo y el bitrate del LAB, no una copia a mano.
 *     2) OFRECE los 12 perfiles al generador (`settingsFor(id)`), incluidos los .5,
 *        que no existen en APE_PROFILES_CONFIG.
 *     3) Da una auditoría medible (`audit()`) de si lo que se emite coincide con el LAB.
 *
 * POR QUÉ (lo medido en la ronda 20, generador real, un canal por perfil)
 *   Antes: min_bandwidth emitido 14 Mbps en P0 (el LAB pide 52,325), BANDWIDTH
 *   8 Mbps en P3.5 (el LAB dice 112) → el reproductor creía que un 6K de 112 Mbps
 *   cabía en 8 Mbps y cortaba por falta de megas.
 *
 * PROCEDENCIA (no se inventa ningún número)
 *   contracts/lab/APE_FUSION_PREMIUM_6K_4K_LAB_CALIBRATED_BULLETPROOF_v9.3.json
 *   1907351 B · sha256 dd194e042a106d6a9ae417110493dbe11a5a7d087ff1e5e8c2d544952eb9b8d8
 *   Extraído con el generador de hechos del proyecto (script auxiliar, fuera del árbol).
 *   bitrate_bps = bitrate_mbps × 1e6 ; bitrate_floor_mbps = bandwidth_floor_bps / 1e6.
 *
 * SIN DOM, SIN RED, DETERMINISTA. No toca el generador canónico: sólo datos y
 * funciones puras. Si el puente no está cargado, el generador se comporta como antes.
 */
(function () {
    'use strict';

    var SOURCE = "contracts/lab/APE_FUSION_PREMIUM_6K_4K_LAB_CALIBRATED_BULLETPROOF_v9.3.json";
    var SOURCE_BYTES = 1907351;
    var SOURCE_SHA256 = "dd194e042a106d6a9ae417110493dbe11a5a7d087ff1e5e8c2d544952eb9b8d8";
    var VERSION = '1.2.0';

    // ── Los 12 perfiles, tal cual los declara el LAB ────────────────────────
    var PROFILES = {
    "P0": { bitrate_mbps: 200, bandwidth_floor_bps: 52325000, bandwidth_target_bps: 100000000, bandwidth_max_bps: 200000000, avg_bandwidth_ratio: 0.75,
      max_bitrate_kbps: 200000, avg_bitrate_kbps: 160000, resolution: "7680x4320", fps: 30, codec: "dvh1.08.06,ac-3",
      buffer_ms: 19000, player_buffer_ms: 25333, buffer_effective_s: 15, segment_s: 4 },
    "P0.5": { bitrate_mbps: 89.6, bandwidth_floor_bps: 29900000, bandwidth_target_bps: 60000000, bandwidth_max_bps: 90000000, avg_bandwidth_ratio: 0.75,
      max_bitrate_kbps: 89600, avg_bitrate_kbps: 71680, resolution: "5760x3240", fps: 60, codec: "hvc1.2.4.L183.B0,ac-3",
      buffer_ms: 15000, player_buffer_ms: 20000, buffer_effective_s: 20, segment_s: 4 },
    "P1": { bitrate_mbps: 40, bandwidth_floor_bps: 24700000, bandwidth_target_bps: 38000000, bandwidth_max_bps: 57000000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 40000, avg_bitrate_kbps: 32000, resolution: "3840x2160", fps: 60, codec: "hvc1.2.4.L153.B0,ac-3",
      buffer_ms: 12000, player_buffer_ms: 16000, buffer_effective_s: 24, segment_s: 4 },
    "P1.5": { bitrate_mbps: 89.6, bandwidth_floor_bps: 29900000, bandwidth_target_bps: 46000000, bandwidth_max_bps: 89600000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 89600, avg_bitrate_kbps: 71680, resolution: "5760x3240", fps: 60, codec: "hvc1.2.4.L183.B0,ac-3",
      buffer_ms: 12000, player_buffer_ms: 16000, buffer_effective_s: 20, segment_s: 4 },
    "P2": { bitrate_mbps: 37.3, bandwidth_floor_bps: 12259000, bandwidth_target_bps: 18860000, bandwidth_max_bps: 37300000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 37300, avg_bitrate_kbps: 29840, resolution: "3840x2160", fps: 30, codec: "hvc1.2.4.L150.B0,ac-3",
      buffer_ms: 10000, player_buffer_ms: 13333, buffer_effective_s: 24, segment_s: 4 },
    "P2.5": { bitrate_mbps: 112, bandwidth_floor_bps: 36777000, bandwidth_target_bps: 56580000, bandwidth_max_bps: 112000000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 112000, avg_bitrate_kbps: 89600, resolution: "5760x3240", fps: 60, codec: "hvc1.2.4.L183.B0,ac-3",
      buffer_ms: 10000, player_buffer_ms: 13333, buffer_effective_s: 20, segment_s: 4 },
    "P3": { bitrate_mbps: 18.7, bandwidth_floor_bps: 6500000, bandwidth_target_bps: 10000000, bandwidth_max_bps: 18700000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 18700, avg_bitrate_kbps: 14960, resolution: "1920x1080", fps: 60, codec: "hvc1.2.4.L123.B0,mp4a.40.2",
      buffer_ms: 8000, player_buffer_ms: 10667, buffer_effective_s: 27, segment_s: 4 },
    "P3.5": { bitrate_mbps: 112, bandwidth_floor_bps: 36777000, bandwidth_target_bps: 56580000, bandwidth_max_bps: 112000000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 112000, avg_bitrate_kbps: 89600, resolution: "5760x3240", fps: 60, codec: "hvc1.2.4.L183.B0,ac-3",
      buffer_ms: 10000, player_buffer_ms: 13333, buffer_effective_s: 20, segment_s: 4 },
    "P4": { bitrate_mbps: 4.1, bandwidth_floor_bps: 1345500, bandwidth_target_bps: 6500000, bandwidth_max_bps: 9750000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 4100, avg_bitrate_kbps: 3280, resolution: "1280x720", fps: 30, codec: "hvc1.2.4.L93.B0,mp4a.40.2",
      buffer_ms: 10000, player_buffer_ms: 13333, buffer_effective_s: 30, segment_s: 4 },
    "P4.5": { bitrate_mbps: 112, bandwidth_floor_bps: 36777000, bandwidth_target_bps: 56580000, bandwidth_max_bps: 112000000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 112000, avg_bitrate_kbps: 89600, resolution: "5760x3240", fps: 60, codec: "hvc1.2.4.L183.B0,ac-3",
      buffer_ms: 10000, player_buffer_ms: 13333, buffer_effective_s: 20, segment_s: 4 },
    "P5": { bitrate_mbps: 1.8, bandwidth_floor_bps: 1300000, bandwidth_target_bps: 4000000, bandwidth_max_bps: 6000000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 1800, avg_bitrate_kbps: 1440, resolution: "854x480", fps: 30, codec: "avc1.42c01e,mp4a.40.2",
      buffer_ms: 5000, player_buffer_ms: 6667, buffer_effective_s: 17, segment_s: 4 },
    "P5.5": { bitrate_mbps: 112, bandwidth_floor_bps: 36777000, bandwidth_target_bps: 56580000, bandwidth_max_bps: 112000000, avg_bandwidth_ratio: 0.78,
      max_bitrate_kbps: 112000, avg_bitrate_kbps: 89600, resolution: "5760x3240", fps: 60, codec: "hvc1.2.4.L183.B0,ac-3",
      buffer_ms: 12000, player_buffer_ms: 16000, buffer_effective_s: 20, segment_s: 4 }
    };

    var ORDER = ["P0","P0.5","P1","P1.5","P2","P2.5","P3","P3.5","P4","P4.5","P5","P5.5"];

    function ids() { return ORDER.slice(); }

    function get(id) {
        if (!id) return null;
        var f = PROFILES[String(id)];
        return f ? f : null;
    }

    function bitrateBps(id) { var f = get(id); return f ? Math.round(f.bitrate_mbps * 1000000) : 0; }
    function floorBps(id) { var f = get(id); return f ? Math.round(f.bandwidth_floor_bps) : 0; }
    function targetBps(id) { var f = get(id); return f ? Math.round(f.bandwidth_target_bps) : 0; }
    function maxBps(id) { var f = get(id); return f ? Math.round(f.bandwidth_max_bps) : 0; }

    /**
     * El «network caching» que el LAB calibra para ese perfil, en milisegundos
     * (`settings.networkCachingMs`, que el LAB escribe también como `buffer`). Es lo
     * que acaba en `#EXTVLCOPT:network-caching`. 0 si el perfil no existe.
     */
    function networkCachingMs(id) { var f = get(id); return f ? Math.round(f.buffer_ms) : 0; }

    /**
     * Lo que SE EMITE en `#EXTVLCOPT:network-caching`, en ms. Regla (decisión, no dato
     * del LAB): se emite el cache declarado por el LAB, pero nunca por encima del buffer
     * efectivo que la propia política de bitrate del LAB sostiene (su queja D1: un buffer
     * declarado mayor de lo que el perfil aguanta). En 11 de 12 perfiles coincide con el
     * declarado; sólo P0 baja de 19 000 a 15 000 ms.
     */
    function networkCachingEmittedMs(id) {
        var f = get(id);
        if (!f) return 0;
        var declared = Math.round(f.buffer_ms) || 0;
        var cap = Math.round((f.buffer_effective_s || 0) * 1000);
        if (cap > 0 && declared > cap) return cap;
        return declared;
    }

    /**
     * Objeto con forma de `settings` del Profile Manager, con los valores del LAB.
     * El generador lo usa sólo cuando APE_PROFILES_CONFIG no tiene ese perfil
     * (hoy: los seis .5 de 6K). Nombres y unidades son los del LAB.
     */
    function settingsFor(id) {
        var f = get(id);
        if (!f) return null;
        return {
            resolution: f.resolution,
            fps: f.fps,
            bitrate: f.bitrate_mbps,                       // Mbps (el generador lo pasa a kbps)
            codec: f.codec,                                 // alias de codec_string
            codec_string: f.codec,
            bandwidth_floor: f.bandwidth_floor_bps,
            bandwidth_target: f.bandwidth_target_bps,
            bandwidth_max: f.bandwidth_max_bps,
            avg_bandwidth_ratio: f.avg_bandwidth_ratio,
            bitrate_floor_mbps: f.bandwidth_floor_bps / 1000000, // derivado
            maxBitrateKbps: f.max_bitrate_kbps,
            avgBitrateKbps: f.avg_bitrate_kbps,
            buffer: f.buffer_ms,
            networkCachingMs: f.buffer_ms,
            playerBuffer: f.player_buffer_ms,
            bufferEffectiveSec: f.buffer_effective_s,
            segment_duration_s: f.segment_s
        };
    }

    // Campos del LAB que se copian sobre la copia embebida: [nombre en settings] -> [clave
    // en las tablas de arriba]. Se deja FUERA a propósito lo que no es ancho de banda ni
    // identidad (buffers, codecs, cabeceras): esa reconciliación se mide aparte.
    var PATCH_MAP = [
        ['bitrate', 'bitrate_mbps'],
        ['bandwidth_floor', 'bandwidth_floor_bps'],
        ['bandwidth_target', 'bandwidth_target_bps'],
        ['bandwidth_max', 'bandwidth_max_bps'],
        ['avg_bandwidth_ratio', 'avg_bandwidth_ratio'],
        ['maxBitrateKbps', 'max_bitrate_kbps'],
        ['avgBitrateKbps', 'avg_bitrate_kbps'],
        ['resolution', 'resolution'],
        ['fps', 'fps']
    ];

    /**
     * Corrige (in situ) la copia embebida `APE_LAB_V8_PROFILES` con los valores del LAB.
     * No añade perfiles que el Profile Manager no sepa pintar: sólo corrige los que ya
     * existen. Devuelve un informe con cada cambio y una huella para las pruebas.
     */
    function patchLabV8(target) {
        var report = { version: VERSION, source_sha256: SOURCE_SHA256, patched: [], not_present: [], skipped: [], changed: 0 };
        if (!target || typeof target !== 'object') { report.skipped.push('sin APE_LAB_V8_PROFILES'); return report; }
        ORDER.forEach(function (id) {
            var f = get(id);
            var dst = target[id];
            if (!f) return;
            if (!dst || !dst.settings) { report.not_present.push(id); return; }   // no se crea: el PM no lo pintaría
            var row = { id: id, fields: {} };
            PATCH_MAP.forEach(function (pair) {
                var k = pair[0], v = f[pair[1]];
                if (v === undefined || v === null) return;
                var before = dst.settings[k];
                if (String(before) === String(v)) return;
                dst.settings[k] = v;
                row.fields[k] = { before: (before === undefined ? null : before), after: v };
                report.changed++;
            });
            // derivado: el suelo en Mbps que usa el generador (floor_bps / 1e6)
            var fl = f.bandwidth_floor_bps / 1000000;
            if (String(dst.settings.bitrate_floor_mbps) !== String(fl)) {
                row.fields.bitrate_floor_mbps = { before: (dst.settings.bitrate_floor_mbps === undefined ? null : dst.settings.bitrate_floor_mbps), after: fl };
                dst.settings.bitrate_floor_mbps = fl;
                report.changed++;
            }
            if (Object.keys(row.fields).length) report.patched.push(row);
        });
        report.fingerprint = fingerprint(report);
        return report;
    }

    function fingerprint(rep) {
        var t = ORDER.map(function (id) {
            var f = get(id);
            return [id, f.bitrate_mbps, f.bandwidth_floor_bps, f.bandwidth_target_bps, f.bandwidth_max_bps, f.resolution, f.fps].join(':');
        }).join('|');
        var h = 0;
        for (var i = 0; i < t.length; i++) { h = ((h << 5) - h + t.charCodeAt(i)) | 0; }
        return ('00000000' + (h >>> 0).toString(16)).slice(-8);
    }

    /**
     * ¿Es coherente este perfil consigo mismo? Reglas (todas del LAB, no inventadas):
     *   - hay bitrate y suelo;
     *   - suelo < bitrate (si no, el suelo pediría más que el propio stream);
     *   - máxima ≥ bitrate (la envolvente no puede quedarse por debajo del pico).
     */
    function coherent(id) {
        var f = get(id);
        if (!f) return { id: id, ok: false, why: 'perfil desconocido' };
        var bad = [];
        if (!(f.bitrate_mbps > 0)) bad.push('sin bitrate');
        if (!(f.bandwidth_floor_bps > 0)) bad.push('sin suelo');
        if (f.bandwidth_floor_bps >= f.bitrate_mbps * 1000000) bad.push('suelo ≥ bitrate');
        if (f.bandwidth_max_bps < f.bitrate_mbps * 1000000) bad.push('máxima < bitrate');
        return { id: id, ok: bad.length === 0, why: bad.join(', '), floor_ratio: f.bandwidth_floor_bps / (f.bitrate_mbps * 1000000) };
    }

    function audit() {
        return ORDER.map(function (id) {
            var c = coherent(id);
            var f = get(id);
            return { id: id, ok: c.ok, why: c.why, bitrate_mbps: f.bitrate_mbps, floor_mbps: f.bandwidth_floor_bps / 1000000, floor_ratio: c.floor_ratio };
        });
    }

    var API = {
        version: VERSION,
        source: SOURCE,
        source_bytes: SOURCE_BYTES,
        source_sha256: SOURCE_SHA256,
        profiles: PROFILES,
        ids: ids,
        get: get,
        settingsFor: settingsFor,
        bitrateBps: bitrateBps,
        floorBps: floorBps,
        targetBps: targetBps,
        maxBps: maxBps,
        networkCachingMs: networkCachingMs,
        networkCachingEmittedMs: networkCachingEmittedMs,
        coherent: coherent,
        audit: audit,
        patchLabV8: patchLabV8,
        fingerprint: function () { return fingerprint(); }
    };

    if (typeof window !== 'undefined') {
        // R22: nombre propio para no chocar con window.APE_LAB_12P de lab-12p-conformance.js
        // (ese otro módulo se carga después en index-v4.html y antes borraba este puente).
        window.APE_LAB_12P_RECONCILE = API;
        // Auto-aplicar sobre la copia embebida si ya está cargada (orden normal de la página).
        try {
            if (window.APE_LAB_V8_PROFILES) {
                API.report = patchLabV8(window.APE_LAB_V8_PROFILES);
                window.APE_LAB_12P_REPORT = API.report;
            }
        } catch (e) { /* nunca romper la página por el puente */ }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
