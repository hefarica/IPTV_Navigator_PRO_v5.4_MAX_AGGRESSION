/* ═══════════════════════════════════════════════════════════════════════════
 * APE STREAMING HEALTH AUTOTUNER v1.0
 *
 * OBJETIVO DEL OPERADOR (2026-11-16): «el objetivo no es mostrarlo, es que
 * MUEVAS los parámetros de configuración para que el Streaming Health cumpla:
 * riesgo lo más bajo posible, headroom superior. Aplica las fórmulas y que el
 * LLM del sistema encuentre los valores.»
 *
 * VERDAD QUE EL TUNER NO ESCONDE:
 *   El headroom = bandaMedida / bitrateExigido. NINGÚN parámetro de cliente
 *   crea ancho de banda: si la red mide 0,8x, seguirá midiendo 0,8x. Lo que la
 *   configuración SÍ puede hacer es ABSORBER jitter (más buffer ⇒ menos
 *   exposición) y por eso el tuner:
 *     1. mueve buffer / prefetch / paralelo / read-timeout según fórmulas,
 *     2. declara el GAP de red en Mbps cuando el gate no es alcanzable,
 *     3. nunca toca la cadena de fallbacks ni el techo de calidad.
 *
 * DOS FUENTES DE PROPUESTA, UNA DECISIÓN:
 *   - determinista: fórmulas de este fichero (siempre disponible),
 *   - LLM: POST /image/optimize-llm (el mismo endpoint que usa el módulo de
 *     imagen), con purpose='streaming_health'.
 *   La validación por rangos decide SIEMPRE: una propuesta fuera de rango se
 *   recorta, y si toca fallbacks/codec/resolución se RECHAZA entera. Si el LLM
 *   no responde, gana el determinista (doctrina del propio panel).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.APE_HEALTH_TUNER = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    var RANGES = {
        bufferTargetS:     { min: 6,     max: 20,    step: 1,    unit: 's' },
        prefetchSegments:  { min: 2,     max: 8,     step: 1,    unit: 'segmentos' },
        parallelDownloads: { min: 1,     max: 8,     step: 1,    unit: 'conexiones' },
        readTimeoutMs:     { min: 45000, max: 120000, step: 5000, unit: 'ms' }
    };

    /* Claves que el tuner NO puede tocar jamás. Si una propuesta las menciona,
     * se rechaza completa: es el contrato del operador ("sin cambiar la
     * naturaleza de sus fallbacks configurados por perfil"). */
    var FORBIDDEN_KEYS = /fallback|codec|resolution|hdcp|resilience|f0|f1|f2|f3|f4|f5|tier|bitrate|profile/i;

    var GATE = { headroomRatio: 3.0, riskMax: 10, industryMinRatio: 1.3, segDurDefault: 6 };

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function r2(v) { return Math.round(v * 100) / 100; }
    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    /* ── FÓRMULA 1: buffer que absorbe el déficit de la red ──────────────────
     * Si el ratio r < 1, cada segmento llega tarde en un factor (1/r − 1).
     * El buffer debe cubrir ese retraso durante 3 segmentos consecutivos.
     *   bufferTargetS = clamp(segDur · (1 + max(0, 1/r − 1) · 3), 6, 20)
     * r = 3 → 6 s (piso) · r = 1 → 12 s · r = 0.6 → 18 s
     * NO modifica el ratio: sólo compra tiempo antes de que el buffer se vacíe. */
    function bufferForRatio(r, segDur) {
        if (!isNum(r) || r <= 0) return null;
        var sd = isNum(segDur) && segDur > 0 ? segDur : GATE.segDurDefault;
        var deficit = Math.max(0, 1 / r - 1);
        return clamp(Math.round(sd * (1 + deficit * 3)), RANGES.bufferTargetS.min, RANGES.bufferTargetS.max);
    }

    /* ── FÓRMULA 2: prefetch en segmentos que caben en ese buffer ─────────── */
    function prefetchForBuffer(bufferS, segDur) {
        var sd = isNum(segDur) && segDur > 0 ? segDur : GATE.segDurDefault;
        return clamp(Math.ceil((bufferS || sd) / sd), RANGES.prefetchSegments.min, RANGES.prefetchSegments.max);
    }

    /* ── FÓRMULA 3: concurrencia útil = 2·ratio, techo 8 ─────────────────── */
    function parallelForRatio(r) {
        if (!isNum(r) || r <= 0) return RANGES.parallelDownloads.min;
        return clamp(Math.floor(2 * r) || 1, RANGES.parallelDownloads.min, RANGES.parallelDownloads.max);
    }

    /* ── FÓRMULA 4: read-timeout según el déficit de la red ─────────────────
     * Una red lenta necesita más paciencia por segmento, no menos:
     *   readTimeout = clamp(45000 + max(0, 1/r − 1) · 30000, 45000, 120000)
     * r = 3 → 45 s · r = 1 → 45 s · r = 0.5 → 75 s · r = 0.33 → 105 s */
    function timeoutForRatio(r) {
        var deficit = (isNum(r) && r > 0) ? Math.max(0, 1 / r - 1) : 1;
        var t = 45000 + deficit * 30000;
        return clamp(Math.round(t / 5000) * 5000, RANGES.readTimeoutMs.min, RANGES.readTimeoutMs.max);
    }

    /* Propuesta determinista completa. */
    function deterministic(requiredMbps, headroomRatio, segDur) {
        var buf = bufferForRatio(headroomRatio, segDur);
        if (buf === null) return null;
        return {
            bufferTargetS: buf,
            prefetchSegments: prefetchForBuffer(buf, segDur),
            parallelDownloads: parallelForRatio(headroomRatio),
            readTimeoutMs: timeoutForRatio(headroomRatio, segDur)
        };
    }

    /* Validación por rangos: recorta lo numérico y RECHAZA lo que toca lo prohibido.
     * Devuelve {ok, config, rejected:[...], clamped:[...]}. */
    function validate(proposal) {
        if (!proposal || typeof proposal !== 'object') return { ok: false, config: null, rejected: ['no es objeto'] };
        var cfg = {}, rejected = [], clamped = [], k, v, rng;
        for (k in proposal) {
            if (!Object.prototype.hasOwnProperty.call(proposal, k)) continue;
            if (FORBIDDEN_KEYS.test(k)) { rejected.push(k); continue; }
            if (!RANGES[k]) { rejected.push(k); continue; }
            v = Number(proposal[k]);
            if (!isFinite(v)) { rejected.push(k); continue; }
            rng = RANGES[k];
            var cv = clamp(Math.round(v), rng.min, rng.max);
            if (cv !== Math.round(v)) clamped.push({ key: k, from: v, to: cv });
            cfg[k] = cv;
        }
        if (rejected.length) return { ok: false, config: null, rejected: rejected, clamped: clamped };
        var missing = Object.keys(RANGES).filter(function (x) { return cfg[x] === undefined; });
        if (missing.length) return { ok: false, config: null, rejected: missing, clamped: clamped };
        return { ok: true, config: cfg, rejected: [], clamped: clamped };
    }

    /* Verdicto honesto: ¿puede la configuración alcanzar el gate? El headroom no. */
    function verdict(requiredMbps, headroomRatio) {
        var req = Number(requiredMbps) || 0;
        var r = isNum(headroomRatio) ? headroomRatio : null;
        if (r === null || req <= 0) {
            return { reachable: false, state: 'NO_MEASUREMENT', reason: 'sin medición o sin exigencia' };
        }
        var meetsGate = r >= GATE.headroomRatio;
        var meetsIndustry = r >= GATE.industryMinRatio;
        return {
            reachable: meetsGate,
            state: meetsGate ? 'GATE_OK' : (meetsIndustry ? 'SUB_GATE' : 'NETWORK_INSUFFICIENT'),
            headroomRatio: r2(r),
            riskEstimate: null,
            neededMbpsForGate: req > 0 ? r2(req * GATE.headroomRatio) : null,
            neededMbpsForIndustry: req > 0 ? r2(req * GATE.industryMinRatio) : null,
            measuredMbps: req > 0 && r !== null ? r2(req * r) : null,
            gapMbpsForGate: req > 0 && r !== null ? r2(Math.max(0, req * GATE.headroomRatio - req * r)) : null,
            reason: meetsGate
                ? 'la red ya sostiene el gate: la config sólo reduce exposición'
                : ('ningún parámetro de cliente crea banda: faltan ' +
                   (req > 0 && r !== null ? r2(Math.max(0, req * GATE.headroomRatio - req * r)) : '?') +
                   ' Mbps para el gate de ' + GATE.headroomRatio + 'x')
        };
    }

    /* Pide propuesta al LLM de la plataforma (mismo endpoint que el módulo de
     * imagen). Si no hay endpoint o falla, devuelve null y gana el determinista. */
    function askLlm(payload, fetchFn, url) {
        if (typeof fetchFn !== 'function') return Promise.resolve(null);
        var body = {
            purpose: 'streaming_health',
            inW: payload.inW || 0, inH: payload.inH || 0, inFps: payload.inFps || 0,
            outW: payload.outW || 0, outH: payload.outH || 0,
            player: payload.player || 'ott', mode: payload.mode || 'emulado',
            streaming_health: {
                required_mbps: payload.requiredMbps,
                measured_mbps_safe: payload.measuredMbpsSafe,
                headroom_ratio: payload.headroomRatio,
                risk: payload.risk,
                jitter: payload.jitter,
                window_s: payload.windowS,
                objective: 'risk<=10 and headroom>=3.0; move ONLY buffer/prefetch/parallel/readTimeout',
                allowed_keys: Object.keys(RANGES),
                ranges: RANGES,
                forbidden: 'NO tocar fallback, codec, resolution, hdcp, tier, bitrate'
            }
        };
        return fetchFn(url || '/image/optimize-llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) { return res && res.ok ? res.json() : null; })
          .catch(function () { return null; });
    }

    /* Plan completo: determinista + LLM validado → decisión. */
    function plan(inputs, opts) {
        opts = opts || {};
        var required = Number(inputs && inputs.requiredMbps) || 0;
        var r = isNum(inputs && inputs.headroomRatio) ? inputs.headroomRatio : null;
        var det = deterministic(required, r, inputs && inputs.segDurationSec);
        var base = {
            ok: det !== null,
            requiredMbps: required || null,
            headroomRatio: r,
            verdict: verdict(required, r),
            deterministic: det,
            llm: null,
            chosen: det,
            source: det ? 'deterministic' : 'none',
            ranges: RANGES,
            untouched: ['fallback_chain_F0_F5', 'codec_ladder_priority', 'profile_quality_tier',
                        'anti_degradation_floor', 'hdcp_level_policy', 'RESOLUTION_declarada']
        };
        if (!base.ok) { base.reason = 'sin medición: no se mueve nada'; return Promise.resolve(base); }
        if (!opts.llm) return Promise.resolve(base);

        return askLlm(Object.assign({}, inputs, { headroomRatio: r }), opts.fetch || root.fetch, opts.llmUrl)
            .then(function (resp) {
                var prop = resp && (resp.health_config || resp.fields && resp.fields.health_config || resp.config);
                if (!prop && resp && resp.fields) {
                    var pick = {};
                    Object.keys(RANGES).forEach(function (k) {
                        if (resp.fields[k] && resp.fields[k].value !== undefined) pick[k] = resp.fields[k].value;
                    });
                    if (Object.keys(pick).length) prop = pick;
                }
                var v = validate(prop);
                /* ── TOPE SEMÁNTICO (física, no rango) ─────────────────────
                 * Medido 2026-11-16 contra el LLM real: con ratio 0.8 propuso
                 * parallel=8 y prefetch=8. Pasa los rangos (1..8 / 2..8) pero
                 * es AUTOCONGESTIÓN: encolar 8 descargas sobre un enlace que no
                 * sostiene una sola empeora el buffer. La concurrencia útil es
                 * floor(2·ratio) y el prefetch no tiene sentido por encima de
                 * lo que cabe en el buffer. Ningún rango protege de esto: lo
                 * protege la fórmula. */
                if (v.ok && isNum(r) && r > 0) {
                    var seg = isNum(inputs && inputs.segDurationSec) && inputs.segDurationSec > 0
                        ? inputs.segDurationSec : GATE.segDurDefault;
                    var capPar = clamp(Math.floor(2 * r) || 1, RANGES.parallelDownloads.min, RANGES.parallelDownloads.max);
                    var capPre = clamp(Math.ceil(v.config.bufferTargetS / seg), RANGES.prefetchSegments.min, RANGES.prefetchSegments.max);
                    var capped = [];
                    if (v.config.parallelDownloads > capPar) {
                        capped.push({ key: 'parallelDownloads', from: v.config.parallelDownloads, to: capPar });
                        v.config.parallelDownloads = capPar;
                    }
                    if (v.config.prefetchSegments > capPre) {
                        capped.push({ key: 'prefetchSegments', from: v.config.prefetchSegments, to: capPre });
                        v.config.prefetchSegments = capPre;
                    }
                    if (capped.length) v.physicsCap = capped;
                }
                base.llm = { raw: prop || null, accepted: v.ok, rejected: v.rejected, clamped: v.clamped,
                             physicsCap: v.physicsCap || [], source: resp && resp.source ? resp.source : (resp ? 'llm' : 'unavailable') };
                if (v.ok) { base.chosen = v.config; base.source = 'llm'; }
                else { base.source = 'deterministic'; }
                return base;
            });
    }

    /* Aplica la config elegida AL PERFIL ACTIVO, sólo por las APIs del modelo.
     * Devuelve la lista de lo aplicado y lo que no se pudo (sin inventar). */
    function apply(pm, profileId, config) {
        var applied = [], failed = [];
        if (!pm || typeof pm.updateSetting !== 'function' || !config) {
            return { applied: applied, failed: [{ key: '*', reason: 'ProfileManager no disponible' }] };
        }
        function trySet(k, fn, label) {
            try { fn(); applied.push({ key: k, value: config[k] }); }
            catch (e) { failed.push({ key: k, reason: (e && e.message) || 'error', label: label }); }
        }
        if (isNum(config.bufferTargetS)) {
            trySet('bufferSeconds', function () { pm.updateSetting('bufferSeconds', config.bufferTargetS); }, 'buffer base');
        }
        if (typeof pm.updatePrefetchValue === 'function') {
            if (isNum(config.prefetchSegments)) {
                trySet('prefetch_segments', function () { pm.updatePrefetchValue('prefetch_segments', config.prefetchSegments); }, 'prefetch');
            }
            if (isNum(config.parallelDownloads)) {
                trySet('parallel_downloads', function () { pm.updatePrefetchValue('parallel_downloads', config.parallelDownloads); }, 'paralelo');
            }
        } else {
            failed.push({ key: 'prefetch_segments', reason: 'updatePrefetchValue ausente' });
            failed.push({ key: 'parallel_downloads', reason: 'updatePrefetchValue ausente' });
        }
        return { applied: applied, failed: failed, profileId: profileId || null };
    }

    return {
        RANGES: RANGES, GATE: GATE,
        bufferForRatio: bufferForRatio,
        prefetchForBuffer: prefetchForBuffer,
        parallelForRatio: parallelForRatio,
        timeoutForRatio: timeoutForRatio,
        deterministic: deterministic,
        validate: validate,
        verdict: verdict,
        plan: plan,
        apply: apply
    };
});
