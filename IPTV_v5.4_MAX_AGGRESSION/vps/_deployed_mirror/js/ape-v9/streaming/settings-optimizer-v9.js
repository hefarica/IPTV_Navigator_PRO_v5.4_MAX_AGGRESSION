/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE SETTINGS OPTIMIZER v1.0 — ajuste automático con reglas en cadena
 * ═══════════════════════════════════════════════════════════════════════════
 * OBJETIVO (las dos condiciones del propietario)
 *   1) MINIMIZAR el Risk (0-100)
 *   2) MAXIMIZAR el headroom real
 *   con (3) la menor memoria posible como desempate.
 *
 * HONESTIDAD DE PARTIDA — leélo antes de confiar en el resultado:
 *   · El headroom = f(ancho de banda medido, bitrate del perfil). NO depende de
 *     buffer/prefetch/paralelo: esos mueven el RIESGO, no el enlace. Por eso el
 *     optimizador NUNCA puede "subir headroom" sin bajar bitrate, y bajar
 *     bitrate por debajo del piso LAB está PROHIBIDO (MAX IMAGE FIRST).
 *     Si el enlace no alcanza, el veredicto es LIMITADO_POR_ENLACE y se
 *     propone el tier que SÍ alcanza — no se aplica en silencio.
 *   · min_bandwidth_mbps es un PISO para el arranque sin medición: NO es una
 *     palanca de headroom y el optimizador no la usa para maquillar cifras.
 *
 * PALANCAS REALES (y sólo estas)
 *   prefetch_segments, parallel_downloads, buffer_target_seconds
 *
 * REGLAS EN CADENA (se aplican juntas; mover una obliga a mover las otras)
 *   R1  parallel ≤ prefetch            (si no, hay descargas ociosas)
 *   R2  parallel ≤ deviceParallel      (ISP level: VERY_AGGRESSIVE = 32)
 *   R3  buffer ≥ prefetch × segDur/2   (sin colchón, el prefetch no aterriza)
 *   R4  buffer ≥ 10 s y ≤ 90 s
 *   R5  memoria = prefetch × segMB × (1 + parallel×0.10) ≤ MEM_CAP
 *   R6  si R5 se viola → bajar parallel primero, luego prefetch
 *   R7  bitrate/resolución/códec del perfil: INTOCABLES
 *
 * API
 *   APE_OPT.optimize({ profiles:'all'|'active', apply:false })
 *   APE_OPT.candidates(profileId)      → tabla de la búsqueda
 *   APE_OPT.apply(result)              → escribe y persiste (con backup)
 *   APE_OPT.rollback()                 → restaura el backup
 *   APE_OPT.reset()                    → borra backup
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    var C = {
        PREFETCH_MIN: 4, PREFETCH_MAX: 50,
        PARALLEL_MIN: 1, PARALLEL_MAX: 32,
        BUFFER_MIN: 10, BUFFER_MAX: 90,
        MEM_CAP_MB: 512,
        BACKUP_KEY: 'ape_opt_backup_v1',
        SEG_DUR_GUESS: 6,          // el proveedor sirve ~6 s; el resolver lo ajusta
        SEG_MB_GUESS: 6,           // ~6 MB por segmento en UHD
        ROUNDS: 3,
        // ── ORDEN DEL HEADROOM (regla del propietario, 2026-10-24) ────────
        //   "siempre negativo, y cuanto MÁS negativo mejor"
        //   Risk: positivo, cuanto más cerca de 0 mejor.
        // Por eso el número que se ordena es el COLCHÓN
        // (bitrate/bwSafe − 1)×100, que es negativo cuando sobra enlace.
        //   'deeper' (default) → más negativo = mejor   (-107 gana a -79)
        //   'band'             → banda objetivo (modo anterior)
        HEADROOM_MODE: 'deeper',
        HEADROOM_TARGET: -80
    };

    var MODE = C.HEADROOM_MODE;

    /** Orden del headroom. Recibe el COLCHÓN (negativo = margen). */
    function headroomScore(sparePct) {
        if (typeof sparePct !== 'number' || !isFinite(sparePct)) return -Infinity;
        if (MODE === 'band') return -Math.abs(Math.abs(sparePct) - Math.abs(C.HEADROOM_TARGET));
        return -sparePct;      // 'deeper': -107 → 107 ; -10 → 10
    }

    // ── utilidades ───────────────────────────────────────────────────────
    function clampInt(v, lo, hi, step) {
        var n = Math.round(Number(v) || 0);
        if (step > 1) n = Math.round(n / step) * step;
        return Math.max(lo, Math.min(hi, n));
    }
    function round2(v) { return Math.round(v * 100) / 100; }

    /** Reglas en cadena: devuelve una config NORMALIZADA y válida. */
    function normalize(cfg, ctx) {
        var segDur = ctx.segDur || C.SEG_DUR_GUESS;
        var segMB = ctx.segMB || C.SEG_MB_GUESS;
        var devPar = Math.min(C.PARALLEL_MAX, ctx.deviceParallel || C.PARALLEL_MAX);

        var prefetch = clampInt(cfg.prefetch_segments, C.PREFETCH_MIN, C.PREFETCH_MAX, 1);
        var parallel = clampInt(cfg.parallel_downloads, C.PARALLEL_MIN, devPar, 1);
        var buffer = clampInt(cfg.buffer_target_seconds, C.BUFFER_MIN, C.BUFFER_MAX, 1);

        // R3b (cadena, faltaba): el prefetch NO puede exceder lo que el buffer
        // máximo puede sostener, o R3 sería insatisfacible por diseño.
        // prefetch*segDur/2 <= BUFFER_MAX  ⇒  prefetch <= 2*BUFFER_MAX/segDur
        var prefetchCeil = Math.floor((2 * C.BUFFER_MAX) / segDur);
        if (prefetch > prefetchCeil) prefetch = Math.max(C.PREFETCH_MIN, prefetchCeil);

        // R1 / R2
        if (parallel > prefetch) parallel = prefetch;
        if (parallel > devPar) parallel = devPar;

        // R3 / R4
        var bufferFloor = Math.ceil((prefetch * segDur) / 2);
        if (buffer < bufferFloor) buffer = Math.min(C.BUFFER_MAX, bufferFloor);
        buffer = Math.max(C.BUFFER_MIN, Math.min(C.BUFFER_MAX, buffer));

        // R5 / R6
        var memMB = prefetch * segMB * (1 + parallel * 0.10);
        var guard = 0;
        while (memMB > C.MEM_CAP_MB && guard++ < 200) {
            if (parallel > C.PARALLEL_MIN) parallel--;
            else if (prefetch > C.PREFETCH_MIN) prefetch--;
            else break;
            if (parallel > prefetch) parallel = prefetch;
            memMB = prefetch * segMB * (1 + parallel * 0.10);
        }

        return {
            strategy: cfg.strategy || 'adaptive',
            prefetch_segments: prefetch,
            parallel_downloads: parallel,
            buffer_target_seconds: buffer,
            // NO son palancas: se preservan del perfil
            min_bandwidth_mbps: cfg.min_bandwidth_mbps,
            adaptive_enabled: cfg.adaptive_enabled !== false,
            ai_prediction_enabled: cfg.ai_prediction_enabled === true,
            continuous_prefetch: cfg.continuous_prefetch !== false,
            _memoryMB: Math.round(memMB)
        };
    }

    /** Un paso de evaluación contra el motor real (StreamingEngine). */
    function evaluate(profileInputs, cfg, runtimeSignals) {
        if (!global.StreamingEngine || typeof global.StreamingEngine.computeForUI !== 'function') {
            throw new Error('StreamingEngine no disponible: el optimizador mide, no adivina');
        }
        var inputs = {
            profileId: profileInputs.profileId,
            resolution: profileInputs.resolution,
            codec: profileInputs.codec,
            fps: profileInputs.fps,
            segmentDurationSec: profileInputs.segmentDurationSec || C.SEG_DUR_GUESS,
            prefetchSegments: cfg.prefetch_segments,
            parallelDownloads: cfg.parallel_downloads,
            minBandwidthMbps: cfg.min_bandwidth_mbps,
            bufferBaseMs: 6000,
            bufferTargetSec: cfg.buffer_target_seconds
        };
        var r = global.StreamingEngine.computeForUI(inputs, runtimeSignals);
        if (!r || !r.metrics) return null;
        return {
            risk: r.metrics.riskScore,
            headroomPct: r.metrics.headroomPercent,
            sparePct: (typeof r.metrics.headroomSparePct === 'number')
                ? r.metrics.headroomSparePct : r.metrics.headroomPercent,
            stallPct: r.metrics.stallRatePct,
            fillTimeSec: round2(r.metrics.fillTimeSec),
            memoryMB: cfg._memoryMB,
            evidence: r.ui ? r.ui.evidence === true : null,
            class: r.metrics.stallClass
        };
    }

    /** Orden lexicográfico: risk↑ , headroom (colchón)↓ , memoria↑ */
    function better(a, b) {
        if (!b) return true;
        if (a.risk !== b.risk) return a.risk < b.risk;
        var ha = headroomScore(a.sparePct), hb = headroomScore(b.sparePct);
        if (ha !== hb) return ha > hb;
        return a.memoryMB < b.memoryMB;
    }

    /** Búsqueda por descenso de coordenadas (determinista, sin azar). */
    function search(profileInputs, baseCfg, runtimeSignals, ctx) {
        var cur = normalize(baseCfg, ctx);
        var curScore = evaluate(profileInputs, cur, runtimeSignals);
        var visited = [{ cfg: cur, score: curScore }];

        var sweeps = [
            { key: 'buffer_target_seconds', values: [10, 15, 20, 30, 40, 60, 75, 90] },
            { key: 'prefetch_segments', values: [4, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 50] },
            { key: 'parallel_downloads', values: [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32] }
        ];

        for (var r = 0; r < C.ROUNDS; r++) {
            var improved = false;
            for (var s = 0; s < sweeps.length; s++) {
                var sw = sweeps[s];
                for (var v = 0; v < sw.values.length; v++) {
                    var cand = {};
                    for (var k in cur) cand[k] = cur[k];
                    cand[sw.key] = sw.values[v];
                    if (sw.key === 'buffer_target_seconds') cand.buffer_target_seconds = sw.values[v];
                    var norm = normalize(cand, ctx);
                    var sc = evaluate(profileInputs, norm, runtimeSignals);
                    visited.push({ cfg: norm, score: sc });
                    if (sc && better(sc, curScore)) { cur = norm; curScore = sc; improved = true; }
                }
            }
            if (!improved) break;
        }
        return { best: cur, score: curScore, visited: visited };
    }

    // ── contexto desde el entorno real ───────────────────────────────────
    function contextFor(profileId, profile) {
        var devPar = C.PARALLEL_MAX;
        try {
            if (global.ISP_LEVEL && global.ISP_LEVEL.parallel) devPar = global.ISP_LEVEL.parallel;
            else if (global.APE_DEVICE_TIER && global.APE_DEVICE_TIER.parallel) devPar = global.APE_DEVICE_TIER.parallel;
        } catch (e) {}
        var segDur = Number(profile && profile.settings && profile.settings.segmentDurationSec) || C.SEG_DUR_GUESS;
        var bitrate = Number(profile && profile.settings && profile.settings.bitrate) || 5;
        return {
            deviceParallel: Math.min(C.PARALLEL_MAX, devPar || C.PARALLEL_MAX),
            segDur: segDur,
            segMB: Math.max(1, Math.round((bitrate * segDur) / 8)),
            bitrateMbps: bitrate
        };
    }

    function runtimeSignalsNow(bitrate) {
        var snap = (global.APE_BW && typeof global.APE_BW.snapshot === 'function')
            ? global.APE_BW.snapshot() : null;
        return {
            bitrateMbps: bitrate,
            bandwidthObservedMbps: snap ? snap.mbps : 0,
            bandwidthConfidence: snap ? snap.confidence : 'none',
            bandwidthSource: snap ? snap.source : 'none'
        };
    }

    // ── API principal ────────────────────────────────────────────────────
    function optimize(opts) {
        opts = opts || {};
        // Regla del propietario por defecto: colchón más negativo = mejor.
        MODE = (opts.headroomMode === 'max' || opts.headroomMode === 'band')
            ? opts.headroomMode : 'deeper';
        if (typeof opts.headroomTarget === 'number') C.HEADROOM_TARGET = opts.headroomTarget;
        var cfgApi = global.APE_PROFILES_CONFIG;
        if (!cfgApi || !cfgApi.profiles) throw new Error('APE_PROFILES_CONFIG no disponible');

        var ids = (opts.profiles === 'active')
            ? [cfgApi.activeProfileId || 'P3']
            : Object.keys(cfgApi.profiles);

        var out = { version: '1.0', generatedAt: new Date().toISOString(), profiles: {}, summary: {} };
        var totalRiskBefore = 0, totalRiskAfter = 0, n = 0;

        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var profile = cfgApi.profiles[id];
            if (!profile) continue;
            var ctx = contextFor(id, profile);
            var inputs = {
                profileId: id,
                resolution: (profile.settings && profile.settings.resolution) || '1920x1080',
                codec: (profile.settings && profile.settings.codec) || 'H265',
                fps: (profile.settings && profile.settings.fps) || 60,
                segmentDurationSec: ctx.segDur
            };
            var signals = runtimeSignalsNow(ctx.bitrateMbps);
            var baseCfg = (typeof cfgApi.getPrefetchConfig === 'function')
                ? cfgApi.getPrefetchConfig(id) : (profile.prefetch_config || {});
            var baseScore = evaluate(inputs, normalize(baseCfg, ctx), signals);

            var res = search(inputs, baseCfg, signals, ctx);
            var before = baseScore, after = res.score;

            // Veredicto honesto, en la convención del propietario:
            // colchón > 0 ⇒ el enlace NO alcanza el bitrate (sobresuscrito).
            var verdict;
            if (signals.bandwidthConfidence === 'none') verdict = 'SIN_MEDICION';
            else if (!after) verdict = 'SIN_DATOS';
            else if (after.sparePct > 0) verdict = 'LIMITADO_POR_ENLACE';
            else if (after.sparePct > -15) verdict = 'AL_LIMITE';
            else verdict = 'OPTIMO';

            out.profiles[id] = {
                verdict: verdict,
                evidence: after ? after.evidence : null,
                bandwidth: signals,
                before: before, after: after,
                headroomSparePctBefore: before ? before.sparePct : null,
                headroomSparePctAfter: after ? after.sparePct : null,
                delta: before && after ? {
                    risk: after.risk - before.risk,
                    sparePct: after.sparePct - before.sparePct,
                    memoryMB: after.memoryMB - before.memoryMB
                } : null,
                config: res.best,
                changed: (before && after) ? (
                    res.best.prefetch_segments !== normalize(baseCfg, ctx).prefetch_segments ||
                    res.best.parallel_downloads !== normalize(baseCfg, ctx).parallel_downloads ||
                    res.best.buffer_target_seconds !== normalize(baseCfg, ctx).buffer_target_seconds
                ) : false,
                candidates: res.visited.length,
                // Si el enlace no llega, se propone el tier que sí llega (NO se aplica solo)
                proposal: (verdict === 'LIMITADO_POR_ENLACE')
                    ? proposeTier(cfgApi, signals, after)
                    : null
            };

            if (before && after) { totalRiskBefore += before.risk; totalRiskAfter += after.risk; n++; }
        }

        out.summary = {
            profiles: n,
            riskAvgBefore: n ? round2(totalRiskBefore / n) : null,
            riskAvgAfter: n ? round2(totalRiskAfter / n) : null,
            riskImprovement: n ? round2((totalRiskBefore - totalRiskAfter) / n) : null,
            headroomMode: MODE,
            headroomTarget: (MODE === 'band') ? C.HEADROOM_TARGET : null,
            // AVISO DE HONESTIDAD: el headroom NO lo mueven las palancas.
            headroomInvariant: 'headroom = f(enlace medido, bitrate del perfil); buffer/prefetch/paralelo NO lo cambian',
            applied: false
        };

        if (opts.apply === true) out.summary.applied = apply(out).ok;
        return out;
    }

    /** Propone el perfil más alto que el enlace SÍ sostiene (no se aplica solo). */
    function proposeTier(cfgApi, signals, after) {
        var bw = signals.bandwidthObservedMbps * 0.95;
        var target = bw / 1.15;                     // bitrate sostenible
        var best = null;
        Object.keys(cfgApi.profiles).forEach(function (id) {
            var p = cfgApi.profiles[id];
            var br = Number(p.settings && p.settings.bitrate) || 0;
            if (br > 0 && br <= target) {
                if (!best || br > best.bitrateMbps) best = { profileId: id, bitrateMbps: br };
            }
        });
        return {
            sustainableBitrateMbps: round2(target),
            bestProfile: best,
            note: 'No se cambia el perfil automáticamente: bajar resolución es decisión del propietario.'
        };
    }

    // ── aplicar con backup + rollback ────────────────────────────────────
    // Backup autoritativo en memoria (localStorage es best-effort: puede faltar
    // en Node, estar bloqueado por privacidad o lleno). Sin esto, apply()
    // dejaba rollback() sin nada que restaurar.
    var memBackup = null;

    function apply(result) {
        var cfgApi = global.APE_PROFILES_CONFIG;
        if (!cfgApi || typeof cfgApi.updatePrefetchSetting !== 'function') {
            return { ok: false, error: 'updatePrefetchSetting no disponible' };
        }
        var backup = {};
        var ids = Object.keys(result.profiles || {});
        ids.forEach(function (id) {
            backup[id] = JSON.parse(JSON.stringify(cfgApi.getPrefetchConfig(id) || {}));
        });
        memBackup = backup;
        try { localStorage.setItem(C.BACKUP_KEY, JSON.stringify(backup)); } catch (e) { /* best-effort */ }

        var written = [];
        ids.forEach(function (id) {
            var cfg = result.profiles[id].config;
            ['prefetch_segments', 'parallel_downloads', 'buffer_target_seconds'].forEach(function (k) {
                cfgApi.updatePrefetchSetting(id, k, cfg[k]);
            });
            written.push(id);
        });
        console.log('%c[APE-OPT] aplicado', 'color:#22c55e;font-weight:bold;', { profiles: written, backup: C.BACKUP_KEY });
        return { ok: true, profiles: written };
    }

    function rollback() {
        var cfgApi = global.APE_PROFILES_CONFIG;
        var backup = memBackup;
        if (!backup) {
            var raw = null;
            try { raw = localStorage.getItem(C.BACKUP_KEY); } catch (e) { raw = null; }
            if (!raw) return { ok: false, error: 'sin backup' };
            backup = JSON.parse(raw);
        }
        var restored = [];
        Object.keys(backup).forEach(function (id) {
            var cfg = backup[id];
            ['prefetch_segments', 'parallel_downloads', 'buffer_target_seconds'].forEach(function (k) {
                if (cfg[k] !== undefined) cfgApi.updatePrefetchSetting(id, k, cfg[k]);
            });
            restored.push(id);
        });
        console.log('%c[APE-OPT] rollback', 'color:#f59e0b;font-weight:bold;', restored);
        return { ok: true, profiles: restored };
    }

    function reset() {
        memBackup = null;
        try { localStorage.removeItem(C.BACKUP_KEY); } catch (e) {}
        return true;
    }

    function candidates(profileId) {
        var cfgApi = global.APE_PROFILES_CONFIG;
        var profile = cfgApi.profiles[profileId];
        if (!profile) return null;
        var ctx = contextFor(profileId, profile);
        var inputs = {
            profileId: profileId,
            resolution: (profile.settings && profile.settings.resolution) || '1920x1080',
            codec: (profile.settings && profile.settings.codec) || 'H265',
            fps: (profile.settings && profile.settings.fps) || 60,
            segmentDurationSec: ctx.segDur
        };
        var signals = runtimeSignalsNow(ctx.bitrateMbps);
        var base = cfgApi.getPrefetchConfig(profileId);
        var res = search(inputs, base, signals, ctx);
        return res.visited
            .filter(function (v) { return v.score; })
            .sort(function (a, b) { return better(a.score, b.score) ? -1 : 1; })
            .slice(0, 20)
            .map(function (v) {
                return {
                    prefetch: v.cfg.prefetch_segments, parallel: v.cfg.parallel_downloads,
                    bufferSec: v.cfg.buffer_target_seconds, memoryMB: v.cfg._memoryMB,
                    risk: v.score.risk, headroomPct: v.score.headroomPct,
                    stallPct: round2(v.score.stallPct), fillTimeSec: v.score.fillTimeSec
                };
            });
    }

    var API = {
        optimize: optimize, apply: apply, rollback: rollback, reset: reset,
        candidates: candidates, normalize: normalize, CONFIG: C,
        // expuestos para verificación (orden del headroom)
        _headroomScore: headroomScore,
        _setMode: function (m) {
            // 'deeper' (regla del propietario) | 'band' | 'max'
            MODE = (m === 'max' || m === 'band') ? m : 'deeper';
            return MODE;
        }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') {
        window.APE_OPT = API;
        console.log('%c[APE-OPT] optimizador listo — APE_OPT.optimize({apply:true}) | rollback()',
            'color:#94a3b8;');
    }
})(typeof window !== 'undefined' ? window : globalThis);
