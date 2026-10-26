/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE PROFILE SOLVER v1.0 — grafo de dependencias + función objetivo
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ RESUELVE
 *   El panel de P1 tiene campos que NO son independientes: T1/T2 salen del
 *   bitrate, el buffer total sale de buffer×2+playerBuffer, la memoria sale de
 *   prefetch×segmento×(1+paralelo×0.1), y el riesgo depende de todo eso junto.
 *   Editar uno a mano dejaba los demás mintiendo. Este módulo:
 *
 *     1) declara el GRAFO (precedentes ← nodo → dependientes) con sus fórmulas
 *     2) propaga en cadena cualquier cambio (aguas abajo por fórmula,
 *        aguas arriba por las reglas de consistencia R1/R3b/R5)
 *     3) evalúa una FUNCIÓN OBJETIVO única y busca el óptimo
 *     4) expone un BOTÓN "AUTO-AJUSTAR" y engancha los inputs para que, al
 *        escribir un número, se recalculen dependientes y precedentes
 *
 * FUNCIÓN OBJETIVO (la que se minimiza)
 *     J =  risk/100
 *        − W_HEAD · (−colchonPct/100)      ← colchón más negativo = mejor
 *        + W_MEM  · (memoriaMB / MEM_CAP)
 *        + W_FILL · (fillTimeSec / FILL_REF)
 *        + penalizaciones (violación de piso LAB, memoria, buffer)
 *
 *   · colchonPct = (bitrate/bwSafe − 1)×100  (negativo = margen) — regla del
 *     propietario: siempre negativo, cuanto más negativo mejor.
 *   · risk ∈ [0,100], 0 = perfecto.
 *
 * DOCTRINA RESPETADA: bitrate/resolución/códec son del LAB (readonly en el
 * panel). El solver NO los toca: sólo mueve prefetch_segments,
 * parallel_downloads, buffer_target_seconds y min_bandwidth_mbps, y avisa si
 * la matemática exigiría violar un piso.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    var CFG = {
        MEM_CAP_MB: 512,
        BUFFER_MIN_S: 10, BUFFER_MAX_S: 90,
        PREFETCH_MIN: 4, PREFETCH_MAX: 50,
        PARALLEL_MIN: 1, PARALLEL_MAX: 32,
        SEG_DUR_S: 6,
        W_HEAD: 0.30, W_MEM: 0.20, W_FILL: 0.15, W_FUSE: 0.05,
        FILL_REF_S: 20,
        // ids reales del panel (verificados en profile-manager-v9.js)
        IDS: {
            prefetch: 'pm9_prefetch_segments',
            parallel: 'pm9_prefetch_parallel',
            buffer: 'pm9_prefetch_buffer',
            minbw: 'pm9_prefetch_bw',
            strategy: 'pm9_prefetch_strategy',
            bitrate: 'pm9_bitrate',
            t1: 'pm9_t1',
            t2: 'pm9_t2',
            bufferTotal: 'pm9_buffer',
            playerBuffer: 'pm9_playerBuffer',
            bufferC1: 'pm9_bufferC1',
            bufferC2: 'pm9_bufferC2'
        }
    };

    // ── 1) GRAFO: fórmulas y vecinos ─────────────────────────────────────
    // state = { bitrate, playerBuffer, segmentSec, prefetch, parallel, buffer,
    //           minbw, t1, t2, bufferTotal, segMB, memoryMB }
    var GRAPH = {
        // bitrate viene del LAB (no editable): alimenta T1/T2/segmento/piso
        bitrate: { editable: false, feeds: ['t1', 't2', 'segMB', 'consumidRed', 'consumidSafety'] },
        t1: { editable: false, formula: function (s) { return s.bitrate * 1.3; }, feeds: ['consumidRed'] },
        t2: { editable: false, formula: function (s) { return s.bitrate * 1.6; }, feeds: ['consumidSafety'] },
        consumidRed: { editable: false, formula: function (s) { return s.t1; } },
        consumidSafety: { editable: false, formula: function (s) { return s.t2; } },
        segMB: { editable: false, formula: function (s) { return (s.bitrate * s.segmentSec) / 8; }, feeds: ['memoryMB'] },

        // buffer total (sólo lectura en el panel) = settings.buffer×2 + playerBuffer
        // OJO: settings.buffer (LAB, ms) NO es buffer_target_seconds (prefetch).
        bufferTotal: {
            editable: false,
            formula: function (s) { return s.bufferMs * 2 + s.playerBuffer; }
        },
        bufferC1: { editable: false, formula: function (s) { return s.bufferMs; } },
        bufferC2: { editable: false, formula: function (s) { return s.bufferMs; } },
        jitterMax: { editable: false, formula: function (s) { return s.playerBuffer * 0.8; } },

        // ── palancas REALES (editables) ────────────────────────────────
        prefetch: {
            editable: true, min: CFG.PREFETCH_MIN, max: CFG.PREFETCH_MAX, step: 1,
            feeds: ['memoryMB', 'risk', 'fillTime']
        },
        parallel: {
            editable: true, min: CFG.PARALLEL_MIN, max: CFG.PARALLEL_MAX, step: 1,
            feeds: ['memoryMB', 'risk', 'fillTime']
        },
        bufferSeg: {
            editable: true, min: CFG.BUFFER_MIN_S, max: CFG.BUFFER_MAX_S, step: 1,
            feeds: ['bufferTotal', 'risk']
        },
        minbw: {
            editable: true, min: 1, max: 200, step: 1, feeds: ['_piso']
        },
        // 🔥 SUELO FUSIBLE: fracción del suelo de DISEÑO a la que puede caer
        // el suelo de emergencia (recarga de buffer). 0.71 = P1/P2 4K (14→10).
        fuseDesignMbps: { editable: false },
        fuseRatio: {
            editable: true, min: 0.50, max: 0.95, step: 0.01, feeds: ['_fuse']
        },

        memoryMB: {
            editable: false,
            formula: function (s) { return s.prefetch * s.segMB * (1 + s.parallel * 0.10); }
        }
    };

    /** Reglas de consistencia: devuelven ajustes (aguas arriba) obligatorios.
     *  `changedKey` decide la DIRECCIÓN del ajuste encadenado:
     *   · si el usuario editó el BUFFER  → se recorta el prefetch (dependiente)
     *   · si editó el PREFETCH           → se sube el buffer (precedente)
     *  Así nunca se contradice el número que el usuario acaba de teclear. */
    function consistency(s, changedKey) {
        var fixes = [];
        var typedBuffer = (changedKey === 'bufferSeg');

        // R3 (precedente): el prefetch pedido no cabe en el buffer → subir buffer
        if (!typedBuffer) {
            var neededBuffer = Math.ceil((s.prefetch * s.segmentSec) / 2);
            if (neededBuffer > s.bufferSeg) {
                var target = Math.min(CFG.BUFFER_MAX_S, neededBuffer);
                if (target > s.bufferSeg) {
                    fixes.push({ key: 'bufferSeg', to: target, reason: 'R3: buffer insuficiente para el prefetch pedido' });
                    s.bufferSeg = target;
                }
            }
        }

        // R3b: si el prefetch no cabe en el buffer, se recorta el prefetch
        var prefetchCeil = Math.floor((2 * s.bufferSeg * 1000) / (s.segmentSec * 1000));
        if (s.prefetch > prefetchCeil) {
            fixes.push({ key: 'prefetch', to: Math.max(CFG.PREFETCH_MIN, prefetchCeil),
                reason: 'R3b: prefetch > 2×buffer/' + s.segmentSec + 's' });
            s.prefetch = Math.max(CFG.PREFETCH_MIN, prefetchCeil);
        }

        // R1: paralelo ≤ prefetch
        if (s.parallel > s.prefetch) {
            fixes.push({ key: 'parallel', to: s.prefetch, reason: 'R1: paralelo > prefetch' });
            s.parallel = s.prefetch;
        }
        // R2: paralelo ≤ deviceParallel
        var devPar = Math.min(CFG.PARALLEL_MAX, s.deviceParallel || CFG.PARALLEL_MAX);
        if (s.parallel > devPar) {
            fixes.push({ key: 'parallel', to: devPar, reason: 'R2: paralelo > cupo del dispositivo' });
            s.parallel = devPar;
        }
        // R3 (piso): buffer ≥ prefetch×segDur/2
        var bufferFloor = Math.ceil((s.prefetch * s.segmentSec) / 2);
        if (s.bufferSeg < bufferFloor) {
            fixes.push({ key: 'bufferSeg', to: Math.min(CFG.BUFFER_MAX_S, bufferFloor),
                reason: 'R3: buffer < prefetch×segDur/2' });
            s.bufferSeg = Math.min(CFG.BUFFER_MAX_S, bufferFloor);
        }

        // R5/R6: memoria ≤ cap (baja paralelo primero, luego prefetch)
        var guard = 0;
        while (s.prefetch * s.segMB * (1 + s.parallel * 0.10) > CFG.MEM_CAP_MB && guard++ < 200) {
            if (s.parallel > CFG.PARALLEL_MIN) s.parallel--;
            else if (s.prefetch > CFG.PREFETCH_MIN) s.prefetch--;
            else break;
        }
        var memFinal = s.prefetch * s.segMB * (1 + s.parallel * 0.10);
        if (memFinal > CFG.MEM_CAP_MB || guard > 0) {
            fixes.push({ key: 'parallel/prefetch', to: s.parallel + '/' + s.prefetch,
                reason: 'R5/R6: memoria ' + Math.round(memFinal) + 'MB ≤ ' + CFG.MEM_CAP_MB + 'MB' });
        }
        return collapse(fixes);
    }

    /** Une correcciones repetidas del mismo campo (evita 23 líneas de ruido). */
    function collapse(fixes) {
        var byKey = {}, order = [];
        fixes.forEach(function (f) {
            if (!byKey[f.key]) { byKey[f.key] = { key: f.key, to: f.to, reasons: [] }; order.push(f.key); }
            byKey[f.key].to = f.to;
            if (byKey[f.key].reasons.indexOf(f.reason) === -1) byKey[f.key].reasons.push(f.reason);
        });
        return order.map(function (k) { return { key: k, to: byKey[k].to, reason: byKey[k].reasons.join(' | ') }; });
    }

    /** Recalcula TODO el grafo en orden topológico (precedentes → dependientes). */
    function recompute(s) {
        var changed = [];
        var order = ['t1', 't2', 'consumidRed', 'consumidSafety', 'segMB', 'memoryMB',
                     'bufferTotal', 'bufferC1', 'bufferC2', 'jitterMax'];
        order.forEach(function (k) {
            var node = GRAPH[k];
            if (!node || !node.formula) return;
            var v = node.formula(s);
            v = Math.round(v * 100) / 100;
            if (s[k] !== v) { s[k] = v; changed.push(k); }
        });
        return changed;
    }

    function clampAll(s) {
        Object.keys(GRAPH).forEach(function (k) {
            var n = GRAPH[k];
            if (!n.editable) return;
            var v = Number(s[k]);
            if (!isFinite(v)) v = n.min;
            s[k] = Math.max(n.min, Math.min(n.max, Math.round(v / n.step) * n.step));
        });
        return s;
    }

    /** Cambia UN campo y propaga en cadena (dependientes + precedentes). */
    function setField(state, key, value) {
        var s = deepCopy(state);
        s[key] = Number(value);
        clampAll(s);
        var fixes = consistency(s, key);       // aguas arriba (dirección según el campo)
        var changed = recompute(s);            // aguas abajo
        return { state: s, fixes: fixes, recomputed: changed };
    }

    // ── 2) FUNCIÓN OBJETIVO ──────────────────────────────────────────────
    function objective(score) {
        var risk = Number(score.risk) || 0;
        var spare = (typeof score.sparePct === 'number') ? score.sparePct : 0;
        var mem = Number(score.memoryMB) || 0;
        var fill = Number(score.fillTimeSec) || 0;
        var j = (risk / 100)
            - CFG.W_HEAD * (-spare / 100)
            + CFG.W_MEM * (mem / CFG.MEM_CAP_MB)
            + CFG.W_FILL * (fill / CFG.FILL_REF_S)
            // fusible cerca del diseño = sin margen de rescate
            + CFG.W_FUSE * ((typeof score.fuseRatio === 'number') ? score.fuseRatio : 1);
        return Math.round(j * 10000) / 10000;
    }

    // ── 3) SOLVER ────────────────────────────────────────────────────────
    function evaluate(s, engineInputs) {
        var snap = (global.APE_BW && typeof global.APE_BW.snapshot === 'function') ? global.APE_BW.snapshot() : null;
        var inputs = {
            profileId: engineInputs.profileId,
            resolution: engineInputs.resolution, codec: engineInputs.codec, fps: engineInputs.fps,
            segmentDurationSec: s.segmentSec,
            prefetchSegments: s.prefetch,
            parallelDownloads: s.parallel,
            minBandwidthMbps: s.minbw,
            bufferBaseMs: 6000,
            bufferTargetSec: s.bufferSeg
        };
        var signals = {
            bitrateMbps: s.bitrate,
            bandwidthObservedMbps: snap ? snap.mbps : 0,
            bandwidthConfidence: snap ? snap.confidence : 'none',
            bandwidthSource: snap ? snap.source : 'none'
        };
        var r = global.StreamingEngine.computeForUI(inputs, signals);
        var out = {
            risk: r.metrics.riskScore,
            sparePct: (typeof r.metrics.headroomSparePct === 'number') ? r.metrics.headroomSparePct : r.metrics.headroomPercent,
            fillTimeSec: Math.round((r.metrics.fillTimeSec || 0) * 100) / 100,
            memoryMB: Math.round(s.prefetch * s.segMB * (1 + s.parallel * 0.10)),
            evidence: r.ui ? r.ui.evidence === true : null,
            stallPct: (typeof r.metrics.stallRatePct === 'number') ? r.metrics.stallRatePct : null,
            class: r.metrics.stallClass
        };
        out.fuseRatio = (s.fuseRatio !== undefined) ? s.fuseRatio : 1;
        out.J = objective(out);
        return out;
    }

    function solve(state, engineInputs) {
        var cur = deepCopy(state);
        clampAll(cur); consistency(cur); recompute(cur);
        var best = evaluate(cur, engineInputs);
        var bestState = deepCopy(cur);
        var sweeps = [
            { key: 'bufferSeg', values: [10, 15, 20, 30, 40, 48, 60, 75, 90] },
            { key: 'prefetch', values: [4, 6, 8, 10, 12, 16, 20, 25, 30] },
            { key: 'parallel', values: [1, 2, 3, 4, 6, 8, 10, 12, 16] },
            { key: 'fuseRatio', values: [0.55, 0.60, 0.65, 0.71, 0.75, 0.80, 0.85] }
        ];
        for (var round = 0; round < 3; round++) {
            var improved = false;
            for (var i = 0; i < sweeps.length; i++) {
                for (var v = 0; v < sweeps[i].values.length; v++) {
                    var cand = setField(bestState, sweeps[i].key, sweeps[i].values[v]).state;
                    var sc = evaluate(cand, engineInputs);
                    if (sc.J < best.J - 1e-9) { best = sc; bestState = cand; improved = true; }
                }
            }
            if (!improved) break;
        }
        return { state: bestState, score: best };
    }

    // ── 4) PUENTE CON EL PERFIL REAL ─────────────────────────────────────
    function stateFromProfile(profileId) {
        var api = global.APE_PROFILES_CONFIG;
        var p = api.profiles[profileId];
        var pf = api.getPrefetchConfig(profileId) || {};
        var st = p.settings || {};
        var s = {
            bitrate: Number(st.bitrate) || 5,
            playerBuffer: Number(st.playerBuffer) || 12000,
            bufferMs: Number(st.buffer) || 12000,
            segmentSec: CFG.SEG_DUR_S,
            prefetch: Number(pf.prefetch_segments) || 8,
            parallel: Number(pf.parallel_downloads) || 4,
            bufferSeg: Number(pf.buffer_target_seconds) || 40,
            minbw: Number(pf.min_bandwidth_mbps) || 40,
            fuseDesignMbps: (function () {
                try {
                    if (api && typeof api.getFloorFuseForProfile === 'function') {
                        var fz = api.getFloorFuseForProfile(profileId);
                        if (fz && fz.design_bps > 0) return Math.round(fz.design_bps / 100000) / 10;
                    }
                } catch (e) { /* no bloqueante */ }
                return 0;
            })(),
            fuseRatio: (function () {
                try {
                    if (api && typeof api.getFloorFuseForProfile === 'function') {
                        var fz = api.getFloorFuseForProfile(profileId);
                        if (fz && fz.design_bps > 0 && fz.fuse_bps > 0) {
                            return Math.round((fz.fuse_bps / fz.design_bps) * 100) / 100;
                        }
                    }
                } catch (e) { /* no bloqueante */ }
                return 0.71;
            })(),
            deviceParallel: 32
        };
        clampAll(s); consistency(s); recompute(s);
        return s;
    }

    function engineInputsFor(profileId) {
        var p = global.APE_PROFILES_CONFIG.profiles[profileId];
        var st = p.settings || {};
        return {
            profileId: profileId,
            resolution: st.resolution || '1920x1080',
            codec: st.codec || 'H265',
            fps: st.fps || 60
        };
    }

    function applyState(profileId, s) {
        var api = global.APE_PROFILES_CONFIG;
        api.updatePrefetchSetting(profileId, 'prefetch_segments', s.prefetch);
        api.updatePrefetchSetting(profileId, 'parallel_downloads', s.parallel);
        api.updatePrefetchSetting(profileId, 'buffer_target_seconds', s.bufferSeg);
        if (s.minbw !== undefined) api.updatePrefetchSetting(profileId, 'min_bandwidth_mbps', s.minbw);
        // 🔥 Persistir el suelo fusible (solo el de emergencia; el diseño no se toca)
        if (s.fuseRatio !== undefined && s.fuseDesignMbps > 0
            && typeof api.setFloorFuseBpsForProfile === 'function') {
            api.setFloorFuseBpsForProfile(profileId,
                Math.round(s.fuseDesignMbps * s.fuseRatio * 1000000));
        }
        // Persistencia INMEDIATA: AUTO-AJUSTAR debe dejar el estado en disco
        // al terminar el clic, no depender del debounce de 300 ms.
        if (typeof api.flushSave === 'function') api.flushSave();
        return true;
    }

    /** Corre el solver sobre un perfil y (opcionalmente) aplica. */
    function adjustProfile(profileId, opts) {
        opts = opts || {};
        var sid = profileId || (global.APE_PROFILES_CONFIG.activeProfileId || 'P3');
        var before = stateFromProfile(sid);
        var ei = engineInputsFor(sid);
        var b4 = evaluate(before, ei);
        var res = solve(before, ei);
        var out = {
            profileId: sid,
            before: b4, after: res.score,
            state: res.state,
            delta: { risk: res.score.risk - b4.risk, J: Math.round((res.score.J - b4.J) * 10000) / 10000 },
            changed: {
                prefetch: res.state.prefetch !== before.prefetch,
                parallel: res.state.parallel !== before.parallel,
                bufferSeg: res.state.bufferSeg !== before.bufferSeg
            }
        };
        if (opts.apply === true) out.applied = applyState(sid, res.state);
        return out;
    }

    function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

    // ── 5) UI: botón + propagación al editar ─────────────────────────────
    var applying = false;

    function syncInputs(s) {
        if (typeof document === 'undefined') return;   // sin DOM: no hay inputs
        applying = true;
        try {
            var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
            var p = CFG.IDS;   // OJO: los ids viven en CFG, no en GRAPH (bug corregido)
            if (!p) return;
            set(p.prefetch, s.prefetch);
            set(p.parallel, s.parallel);
            set(p.buffer, s.bufferSeg);
            set(p.minbw, s.minbw);
            set(p.t1, Math.round(s.t1));
            set(p.t2, Math.round(s.t2));
            set(p.bufferTotal, Math.round(s.bufferTotal));
            var j = document.getElementById('pm9_jitter_max');
            if (j) j.textContent = Math.floor(s.playerBuffer * 0.8) + ' ms';
            var bt = document.getElementById('pm9_buffer_total');
            if (bt) bt.textContent = Math.round(s.bufferTotal) + ' ms';
        } finally { applying = false; }
    }

    /** Repinta el bloque de salud SÍ o SÍ (no confía en la ruta interna del PM). */
    function repaint(score) {
        try {
            if (global.ProfileManagerV9 && typeof global.ProfileManagerV9._updateStreamingHealth === 'function') {
                global.ProfileManagerV9._updateStreamingHealth.call(global.ProfileManagerV9);
            }
        } catch (e) { /* no bloqueante */ }
        if (!score) return;
        if (typeof document === 'undefined') return;   // sin DOM: sólo la API
        // Escritura directa de los 4 indicadores: garantiza que el panel se mueva
        try {
            var lbl = document.getElementById('pm9_stability_label');
            if (lbl) {
                lbl.textContent = score.saturated ? 'SATURADO' : score.class;
                lbl.style.color = score.saturated ? '#ef4444' : (score.risk <= 30 ? '#10b981' : '#f97316');
            }
            var st = document.getElementById('pm9_stall_preview');
            if (st) st.textContent = (Math.round(score.stallPct * 100) / 100) + '%';
            var rk = document.getElementById('pm9_risk_preview');
            if (rk) { rk.textContent = score.risk; rk.style.color = score.risk <= 30 ? '#10b981' : (score.risk <= 60 ? '#eab308' : '#ef4444'); }
            var hr = document.getElementById('pm9_headroom_preview');
            if (hr) hr.textContent = score.sparePct;
        } catch (e) { /* DOM parcial: no romper */ }
    }

    function autoAdjust() {
        var api = global.APE_PROFILES_CONFIG;
        var startId = api.activeProfileId;
        var snap = (global.APE_BW && typeof global.APE_BW.snapshot === 'function')
            ? global.APE_BW.snapshot() : null;
        var hasBw = !!(snap && snap.mbps > 0);
        var selection = null;
        var targetId = startId;
        var oldScore = null;

        // ── 1) OBJETIVO GLOBAL: elegir el perfil de mayor calidad que cumpla
        //         Risk ≤30 y stall ≤1.67 con el enlace medido. Si el perfil
        //         actual ya cumple, se optimiza dentro de él.
        if (hasBw && global.APE_SOLVER_AUTO_PROFILE !== false) {
            selection = findBestProfile();
            var currentCand = (selection.candidates || []).filter(function (c) {
                return c.profileId === startId;
            })[0] || null;
            oldScore = currentCand ? currentCand.score : null;
            var best = selection.best;
            if (best && best.profileId && best.profileId !== startId) {
                var better = false;
                if (best.feasible && (!currentCand || !currentCand.feasible)) better = true;
                else if (best.feasible && currentCand && currentCand.feasible) {
                    better = best.bitrateMbps > currentCand.bitrateMbps;
                } else if (!selection.hasFeasible) {
                    better = !oldScore || best.score.risk < oldScore.risk - 0.5;
                }
                if (better && global.ProfileManagerV9
                    && typeof global.ProfileManagerV9.selectProfile === 'function') {
                    try {
                        global.ProfileManagerV9.selectProfile(best.profileId);
                        targetId = best.profileId;
                    } catch (e) { targetId = startId; }
                }
            }
        }

        // ── 2) Optimizar el estado DENTRO del perfil elegido y aplicarlo.
        var r = adjustProfile(targetId, { apply: true });
        var diag = diagnose(targetId);
        r.diagnostic = diag;
        r.score = r.after;
        r.selection = selection;
        r.profileChanged = (targetId !== startId);
        r.fromProfile = startId;

        syncInputs(r.state);
        repaint({ risk: r.after.risk, sparePct: r.after.sparePct, stallPct: r.after.stallPct,
            class: r.after.class, saturated: diag.saturated });

        // Persistir YA y repintar los dos paneles (superior e inferior).
        var cfgNow = global.APE_PROFILES_CONFIG;
        if (cfgNow && typeof cfgNow.flushSave === 'function') cfgNow.flushSave();
        if (global.ProfileManagerV9 && typeof global.ProfileManagerV9._updateStreamingHealth === 'function') {
            try { global.ProfileManagerV9._updateStreamingHealth(); } catch (e) { /* no bloqueante */ }
        }

        // ── 3) Mensaje con la decisión completa (perfil + métricas).
        var beforeRisk = (r.profileChanged && oldScore) ? oldScore.risk
            : (r.profileChanged ? r.before.risk : r.before.risk);
        var msg;
        if (r.profileChanged) {
            msg = 'Objetivo: ' + startId + ' → ' + targetId +
                ' (' + Math.round((selection && selection.best ? selection.best.bitrateMbps : 0)) + ' Mbps) · Risk ' +
                Math.round(beforeRisk) + ' → ' + r.after.risk +
                ' · colchón ' + r.after.sparePct + '%';
        } else if (diag.bottleneck === 'ENLACE') {
            msg = 'Risk ' + r.after.risk + ' (enlace ' + diag.bandwidthMbps + ' Mbps vs ' +
                diag.requiredBwMbps + ' necesarios) · ya estás en el mejor tier: ' + targetId;
        } else {
            msg = 'Risk ' + r.before.risk + ' → ' + r.after.risk + ' · colchón ' + r.after.sparePct +
                '% · J ' + r.before.J + ' → ' + r.after.J +
                ' · fusible ' + Math.round((r.state.fuseRatio || 0) * 100) + '% del suelo';
        }

        var span = (typeof document !== 'undefined')
            ? document.getElementById('pm9_auto_result') : null;
        if (span) {
            span.textContent = msg;
            span.style.color = (r.after.risk <= 30) ? '#22c55e' : '#f97316';
        }
        if (global.app && global.app.showToast) {
            global.app.showToast(r.profileChanged
                ? ('Perfil ajustado al objetivo: ' + targetId + ' · Risk ' + r.after.risk)
                : ('Auto-ajuste ' + targetId + ': Risk ' + r.before.risk + ' → ' + r.after.risk),
                r.after.risk <= 30 ? 'success' : 'warning');
        }
        console.log('%c[APE-SOLVER] auto-ajuste objetivo', 'color:#22c55e;font-weight:bold;', {
            from: startId, to: targetId, beforeRisk: beforeRisk, afterRisk: r.after.risk,
            feasibleTier: selection && selection.hasFeasible, selection: selection
        });
        return r;
    }

    // ── 4) SELECCIÓN DE PERFIL POR FUNCIÓN OBJETIVO ──────────────────────
    // El solver no se limita al perfil abierto: puntúa los 6 perfiles con el
    // enlace medido y elige el de MAYOR calidad que cumpla el objetivo
    // (Risk ≤ 30 y stall ≤ 1.67%). Si ninguno cumple, elige el de menor Risk.
    function scoreProfile(profileId) {
        var st = stateFromProfile(profileId);
        var solved = solve(st, engineInputsFor(profileId));
        var sc = solved.score;
        var p = global.APE_PROFILES_CONFIG.profiles[profileId];
        var br = Number(p && p.settings && p.settings.bitrate) || 0;
        return {
            profileId: profileId,
            state: solved.state,
            score: sc,
            bitrateMbps: br,
            feasible: (sc.risk <= 30) &&
                (sc.stallPct === null || sc.stallPct === undefined || sc.stallPct <= 1.67)
        };
    }

    function findBestProfile() {
        var api = global.APE_PROFILES_CONFIG;
        var ids = Object.keys(api.profiles || {}).filter(function (id) { return /^P[0-5]$/.test(id); });
        var cands = ids.map(scoreProfile);
        var feasible = cands.filter(function (c) { return c.feasible; });
        feasible.sort(function (a, b) {
            if (b.bitrateMbps !== a.bitrateMbps) return b.bitrateMbps - a.bitrateMbps;
            return a.score.risk - b.score.risk;
        });
        var byRisk = cands.slice().sort(function (a, b) {
            if (a.score.risk !== b.score.risk) return a.score.risk - b.score.risk;
            return b.bitrateMbps - a.bitrateMbps;
        });
        return {
            candidates: cands,
            feasible: feasible,
            hasFeasible: feasible.length > 0,
            best: feasible.length ? feasible[0] : byRisk[0]
        };
    }

    /** bw mínima para alcanzar un colchón objetivo (negativo) */
    function requiredBwFor(bitrate, spareTargetPct) {
        var t = (typeof spareTargetPct === 'number') ? spareTargetPct : -15;
        var ratioNeeded = 1 / (1 + t / 100);        // spare = (1/ratio -1)×100
        return (ratioNeeded * bitrate) / 0.95;      // bwSafe = bw × 0.95
    }

    /** Diagnóstico: ¿por qué Risk no baja de 100? (saturación por enlace) */
    function diagnose(profileId) {
        var sid = profileId || (global.APE_PROFILES_CONFIG.activeProfileId || 'P3');
        var s = stateFromProfile(sid);
        var snap = (global.APE_BW && global.APE_BW.snapshot) ? global.APE_BW.snapshot() : null;
        var bw = snap ? snap.mbps : 0;
        var sc = evaluate(s, engineInputsFor(sid));
        var required = requiredBwFor(s.bitrate, -15);
        return {
            profileId: sid,
            bitrate: s.bitrate,
            bandwidthMbps: bw,
            confidence: snap ? snap.confidence : 'none',
            sparePct: sc.sparePct,
            risk: sc.risk,
            requiredBwMbps: Math.round(required * 100) / 100,
            deficitMbps: Math.round(Math.max(0, required - bw) * 100) / 100,
            saturated: sc.risk >= 99,
            // El Risk está saturado si el déficit domina: ningún buffer lo arregla
            bottleneck: (sc.risk >= 99 && sc.sparePct > -15) ? 'ENLACE' : 'NINGUNO',
            bestTier: bestTier(profileId)
        };
    }

    /** Perfil más alto que el enlace SÍ sostiene (spare ≤ −15 %). */
    function bestTier(profileId) {
        var api = global.APE_PROFILES_CONFIG;
        var sid = profileId || api.activeProfileId;
        var snap = (global.APE_BW && global.APE_BW.snapshot) ? global.APE_BW.snapshot() : null;
        var bw = snap ? snap.mbps : 0;
        if (!(bw > 0)) return null;
        var maxBitrate = bw * 0.95 * 0.85;          // spare ≤ −15 %
        var best = null;
        Object.keys(api.profiles).forEach(function (id) {
            var p = api.profiles[id];
            var br = Number(p.settings && p.settings.bitrate) || 0;
            if (br > 0 && br <= maxBitrate) {
                if (!best || br > best.bitrateMbps) {
                    best = { profileId: id, bitrateMbps: br, current: (id === sid) };
                }
            }
        });
        return best ? {
            profileId: best.profileId,
            bitrateMbps: best.bitrateMbps,
            isCurrent: best.profileId === sid,
            maxBitrateMbps: Math.round(maxBitrate * 100) / 100
        } : { profileId: null, note: 'ningún perfil cabe en ' + Math.round(bw) + ' Mbps' };
    }

    /** Explicación en consola de por qué el número no mejora. */
    function why(profileId) {
        var d = diagnose(profileId);
        console.log('%c[APE-SOLVER] diagnóstico', 'color:#22d3ee;font-weight:bold;', d);
        return d;
    }
    function onManualEdit(key) {
        if (applying) return;
        var api = global.APE_PROFILES_CONFIG;
        var sid = api.activeProfileId;
        var base = stateFromProfile(sid);
        var el = document.getElementById(CFG.IDS[key]);
        if (!el) return;
        var typed = Number(el.value);
        if (!isFinite(typed)) return;

        var step = setField(base, key, typed);
        // persistir lo que el usuario escribió + lo que la cadena corrigió
        applyState(sid, step.state);

        // re-optimizar el resto manteniendo lo tecleado como semilla
        var ei = engineInputsFor(sid);
        var solved = solve(step.state, ei);
        applyState(sid, solved.state);

        syncInputs(solved.state);
        repaint();
        console.log('%c[APE-SOLVER] edición manual propagada', 'color:#22d3ee;font-weight:bold;', {
            campo: key, tecleado: typed, cadena: step.fixes, optimizado: {
                prefetch: solved.state.prefetch, parallel: solved.state.parallel,
                bufferSeg: solved.state.bufferSeg, J: solved.score.J
            }
        });
    }

    // (autoAdjust obsoleto eliminado: vivía aquí y PISABA al de arriba por hoisting,
    //  que es la causa exacta de que el botón no pintara el diagnóstico ni el aviso.)

    function attachUI() {
        var anchor = document.getElementById('pm9_prefetch_content');
        if (!anchor || document.getElementById('pm9_auto_adjust_btn')) return false;

        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0 12px;flex-wrap:wrap';
        bar.innerHTML =
            '<button id="pm9_auto_adjust_btn" style="background:linear-gradient(135deg,#16a34a,#22c55e);' +
            'color:#06240f;border:0;border-radius:6px;padding:8px 14px;font-weight:800;cursor:pointer;' +
            'font-size:0.62rem">⚡ AUTO-AJUSTAR (función objetivo)</button>' +
            '<button id="pm9_best_tier_btn" style="background:linear-gradient(135deg,#7c3aed,#a855f7);' +
            'color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:800;cursor:pointer;' +
            'font-size:0.62rem">🎯 TIER SOSTENIBLE</button>' +
            '<span id="pm9_auto_result" style="font-size:0.55rem;color:#94a3b8">' +
            'Minimiza Risk · maximiza colchón · respeta reglas en cadena</span>';

        anchor.parentNode.insertBefore(bar, anchor);
        document.getElementById('pm9_auto_adjust_btn').addEventListener('click', function () {
            autoAdjust();
        });

        // El headroom SOLO lo mueve el tier (enlace vs bitrate). Este botón es la
        // palanca que sí puede bajar el número; no toca el LAB: cambia de perfil.
        document.getElementById('pm9_best_tier_btn').addEventListener('click', function () {
            var t = bestTier();
            var span = (typeof document !== 'undefined')
            ? document.getElementById('pm9_auto_result') : null;
            if (!t || !t.profileId) {
                if (span) { span.textContent = (t && t.note) || 'sin medición suficiente todavía'; span.style.color = '#f97316'; }
                return;
            }
            if (t.isCurrent) {
                if (span) { span.textContent = 'este perfil YA es el sostenible (' + t.bitrateMbps + ' Mbps)'; span.style.color = '#22c55e'; }
                return;
            }
            if (global.ProfileManagerV9 && typeof global.ProfileManagerV9.selectProfile === 'function') {
                global.ProfileManagerV9.selectProfile(t.profileId);
            }
            if (span) {
                span.textContent = 'cambiado a ' + t.profileId + ' (' + t.bitrateMbps + ' Mbps ≤ ' + t.maxBitrateMbps + ' sostenibles)';
                span.style.color = '#a855f7';
            }
            console.log('%c[APE-SOLVER] tier sostenible aplicado', 'color:#a855f7;font-weight:bold;', t);
        });

        [['prefetch', CFG.IDS.prefetch], ['parallel', CFG.IDS.parallel],
         ['bufferSeg', CFG.IDS.buffer], ['minbw', CFG.IDS.minbw]].forEach(function (pair) {
            var el = document.getElementById(pair[1]);
            if (el) el.addEventListener('change', function () { onManualEdit(pair[0]); });
        });
        return true;
    }

    var API = {
        GRAPH: GRAPH, CFG: CFG,
        stateFromProfile: stateFromProfile, engineInputsFor: engineInputsFor,
        setField: setField, recompute: recompute, consistency: consistency,
        objective: objective, evaluate: evaluate, solve: solve,
        adjustProfile: adjustProfile, applyState: applyState, scoreProfile: scoreProfile, findBestProfile: findBestProfile,
        syncInputs: syncInputs, autoAdjust: autoAdjust, attachUI: attachUI,
        diagnose: diagnose, bestTier: bestTier, why: why, requiredBwFor: requiredBwFor,
        _setState: function (s) { return setField(s, 'prefetch', s.prefetch); }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') {
        window.APE_SOLVER = API;
        // El panel se renderiza al abrir la pestaña del perfil: se intenta al
        // arrancar y en cada clic (idempotente: si el botón ya existe, no hace nada).
        // GUARDA: sin `document` (Node, workers) el módulo debe cargar igual.
        if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
            var tries = 0;
            var t = setInterval(function () {
                tries++;
                if (attachUI() || tries > 60) clearInterval(t);
            }, 500);
            document.addEventListener('click', function () { attachUI(); }, true);
            console.log('%c[APE-SOLVER] listo — botón AUTO-AJUSTAR + propagación al editar',
                'color:#94a3b8;');
        } else {
            console.log('%c[APE-SOLVER] cargado sin DOM (API disponible, sin UI)', 'color:#94a3b8;');
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
