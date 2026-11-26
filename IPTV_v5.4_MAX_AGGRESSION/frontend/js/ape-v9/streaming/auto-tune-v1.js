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
        /* [t13 2026-11-17 · F1 MEDIDO por t12, techos AUTORIZADOS por el capitán]
         * Los rangos del tuner y los del panel no hablaban el mismo idioma: aquí
         * bufferTargetS empezaba en 6 s y el control del panel sólo admite
         * 10..600 (profile-manager-v9.js:2534), así que un plan de 6 s NO se
         * podía almacenar. Alineado a la INTERSECCIÓN FÍSICA: 10..32 s.
         *
         * TECHO 20→30→32, ambos autorizados y con justificación física:
         *   RAM = buffer × required / 8
         *   · 30 s con required 200 → 750 MB sobre 12150 MB = 6,2 %
         *   · 32 s con required 200 → 800 MB sobre 12150 MB = 6,6 %
         * El invariante `ram_excedida` del propio plan sigue comprobándose.
         * El tope de 30 era una elección sin base física: el calculador pedía
         * 31,3 s para cumplir el target de stall en ultra-aggressive, o sea que
         * 30 se quedaba a 1,3 s de la solución. Subir el techo no persigue el
         * verde: quita un límite puesto a mano.
         * COSTE DECLARADO: un buffer de ~31 s son ~31 s de retraso respecto al
         * directo. Es coherente con ultra-aggressive (la estrategia de máxima
         * cola); quien quiera latencia tiene ultra-low-latency con 12 s.
         * Ninguna FÓRMULA cambia: sólo el rango donde aterriza su resultado. */
        bufferTargetS:     { min: 10,    max: 32,    step: 1,    unit: 's' },
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
     *   bufferTargetS = clamp(segDur · (1 + max(0, 1/r − 1) · 3), 10, 20)
     * r = 3 → 10 s (piso del panel, t13) · r = 1 → 10 s · r = 0.6 → 18 s
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

    /* ═══════════════════════════════════════════════════════════════════════
     * PLAN COHERENTE POR ESTRATEGIA (2026-11-17)
     *
     * PROBLEMA MEDIDO en el panel: con la estrategia "Agresivo" el panel mostraba
     * BUFFER 90 s, BW MÍNIMO 70 Mbps (=3×bitrate de perfil), RAM 10800/12150 MB y
     * TIEMPO LLENADO 29510 s contra una red de 0.1 Mbps. Esas cifras no cuadran
     * y por eso la validación no puede ponerse verde: 70 Mbps de mínimo no se
     * alcanzan con 0.1 medidos, y 90 s × 200 Mbps de perfil son 2.25 GB de RAM.
     *
     * SOLUCIÓN (ingeniería, no maquillaje): derivar los CUATRO campos desde la
     * MEDICIÓN y el presupuesto de RAM, y comprobar los invariantes. Si la red no
     * da, el plan lo DECLARA en `violations` y NO finge verde.
     * ═══════════════════════════════════════════════════════════════════════ */

    /* Presets: el nombre que ve el operador y su factor sobre el buffer BASE
     * (el que sale de la fórmula 1 con el ratio medido). */
    var STRATEGIES = {
        'Conservador':   { factor: 0.80, parallelCap: 4, note: 'prioriza arranque rápido y RAM baja' },
        'Balanceado':    { factor: 1.00, parallelCap: 6, note: 'equilibrio buffer/arranque' },
        'Agresivo':      { factor: 1.30, parallelCap: 8, note: 'más cola por delante' },
        'Ultra-Agresivo': { factor: 1.60, parallelCap: 8, demandDuty: 0.90,
                            note: 'máxima cola; exige RAM y banda. La exigencia se dimensiona con la capacidad MEDIDA ×0.90. COSTE DECLARADO: su buffer (~31 s) son ~31 s de retraso respecto al directo — para latencia está ultra-low-latency (12 s)' },
        'Adaptativo':    { factor: null, parallelCap: 8, note: 'el factor lo fija la medición, no el preset' },
        /* [2026-11-18 · encargo] LATENCIA PRIMERO: cola mínima y pocas conexiones.
         * No busca resistencia a stall sino tiempo hasta el primer fotograma. */
        'Ultra-Low-Latency': { factor: 0.60, parallelCap: 2, bufferSegCap: 2, latencyFirst: true,
                               note: 'latencia mínima: buffer de 2 segmentos y como mucho 2 descargas en paralelo' }
    };

    /* ═══════════════════════════════════════════════════════════════════════
     * ALIAS DEL PANEL (hallazgo 2026-11-18)
     *
     * El select #pm9_strategy del panel usa las 6 claves en inglés-hyphen de
     * ProfileManagerV9.STRATEGY_CONFIG (profile-manager-v9.js:72-119):
     *   ultra-aggressive · aggressive · balanced · adaptive ·
     *   conservative · ultra-low-latency
     * El motor nombraba sus presets en español, así que strategyOf('ultra-aggressive')
     * caía al fallback 'Balanceado' (factor 1.0): elegir LA MÁS AGRESIVA aplicaba
     * LA MÁS CONSERVADORA. Este mapa es la traducción oficial y no borra los
     * alias en español (siguen aceptándose tal cual).
     * ═══════════════════════════════════════════════════════════════════════ */
    var ALIASES = {
        'conservative': 'Conservador',
        'balanced': 'Balanceado',
        'aggressive': 'Agresivo',
        'ultra-aggressive': 'Ultra-Agresivo',
        'adaptive': 'Adaptativo',
        'ultra-low-latency': 'Ultra-Low-Latency'
    };

    /* Clave CANÓNICA del panel para escribir de vuelta en el <select>. */
    var CANON_KEY = {
        'Conservador': 'conservative',
        'Balanceado': 'balanced',
        'Agresivo': 'aggressive',
        'Ultra-Agresivo': 'ultra-aggressive',
        'Adaptativo': 'adaptive',
        'Ultra-Low-Latency': 'ultra-low-latency'
    };

    var DEFAULTS = {
        ramBudgetMB: 12150,     // presupuesto del panel (RAM Steady/Peak)
        segDur: 6,              // duración de segmento
        margin: 1.15,           // margen mínimo sobre el bitrate exigido
        fillFactorMax: 3        // llenar no puede tardar más de 3× su propia duración
    };

    /* ═══════════════════════════════════════════════════════════════════════
     * OBJETIVO DE STALL ↔ BUFFER (t13 · encargo del capitán 2026-11-17)
     *
     * El buffer no puede salir SÓLO de absorber el déficit de red: tiene que
     * salir también del objetivo de stall del panel. Esta es la relación EXACTA
     * del calculador del panel, copiada con su archivo:línea — aquí no hay ni
     * una constante inventada:
     *
     *   streaming-calculator.js:33   SEGMENT_DURATION = 6
     *   streaming-calculator.js:37   STALL_RATE_K_DEFAULT = 0.5
     *   streaming-calculator.js:42   TARGET_STALL_RATE = 1.67
     *   streaming-calculator.js:242  calculateStallRate(bufferSeconds, bitrateMbps, bandwidthMbps, k)
     *   streaming-calculator.js:249  estabilidad = getStabilityClass(bandwidth, bitrate)
     *                                (:108 UNSTABLE si ratio < 1.15 → stall forzado, :251-259)
     *   streaming-calculator.js:263  throughputRatio = bandwidth / bitrate
     *   streaming-calculator.js:264  adjustedK = k · clamp(throughputRatio, 0.5, 2)
     *   streaming-calculator.js:265  exponent = −adjustedK · buffer / 6
     *   streaming-calculator.js:266  stall = 100 · e^exponent
     *   streaming-calculator.js:269  ×0.8 si buffer ≥ 60 s
     *   streaming-calculator.js:270  ×0.7 si buffer ≥ 120 s
     *   streaming-calculator.js:271  acotado a [0.01, 100]
     *
     * Despejando el buffer para un target T (dominio buffer < 60, sin recargo):
     *
     *   B = 6 · ln(100 / T) / (0.5 · clamp(bwMin/bitrate, 0.5, 2))
     *
     * Ancho de banda de la ecuación = el MISMO que usa el panel,
     * `min_bandwidth_mbps` (prefetch-presets.js:320 → engineInputs.minBandwidthMbps
     * → calculateStallRate). La MEDICIÓN no entra en la ecuación: ya gatea por la
     * violación `red_insuficiente`.
     *
     * `bitrateForStall` es el bitrate que el panel calcula con
     * calculateBitrate(resolution, codec, fps) — streaming-calculator.js:215-231,
     * NO el bitrate del perfil: lo pasa el panel para que el veredicto del plan y
     * el chip hablen del MISMO modelo. Si no se pasa, se usa requiredMbps (más
     * conservador) y el plan lo DECLARA en stallBasis='required_fallback'.
     * ═══════════════════════════════════════════════════════════════════════ */
    var STALL = {
        segDur: 6,          // streaming-calculator.js:33
        k: 0.5,             // streaming-calculator.js:37
        target: 1.67,       // streaming-calculator.js:42
        kMin: 0.5, kMax: 2, // streaming-calculator.js:264
        unstableRatio: 1.15, // streaming-calculator.js:108
        /* [2026-11-18 · encargo] «ultra exige al máximo medido sin romper»:
         * la exigencia se dimensiona con la capacidad MEDIDA × 0.90 (deja 10 %
         * de cabeza para no saturar el enlace). Sólo aplica a ultra-aggressive. */
        duty: 0.90
    };

    /* Réplica EXACTA de calculateStallRate (streaming-calculator.js:242-281). */
    function stallForBuffer(bufferS, bitrateMbps, bandwidthMbps) {
        var b = Number(bufferS), x = Number(bitrateMbps), w = Number(bandwidthMbps);
        if (!(b > 0) || !(x > 0) || !(w > 0)) return 100;
        var ratio = Math.round((w / x) * 100) / 100;   // el calculador redondea a 2 dec. (:194)
        if (ratio < STALL.unstableRatio) {
            /* mismo camino forzado del calculador (:251-259): ningún buffer lo salva */
            return Math.max(0.01, Math.min(100, 50 + (1 - ratio) * 100));
        }
        var adjustedK = STALL.k * Math.min(STALL.kMax, Math.max(STALL.kMin, ratio));
        var stall = 100 * Math.exp(-adjustedK * (b / STALL.segDur));
        if (b >= 120) stall *= 0.7;
        else if (b >= 60) stall *= 0.8;
        return Math.max(0.01, Math.min(100, stall));
    }

    /* Buffer necesario para que el stall estimado quede en el target.
     * Devuelve {seconds, target, ratio, bitrateMbps, bwMinMbps, basis, forced, unreachable}. */
    function bufferForTargetStallDetailed(inp) {
        inp = inp || {};
        var target = Number(inp.targetStallPct) > 0 ? Number(inp.targetStallPct) : STALL.target;
        var required = Number(inp.requiredMbps) || 0;
        var measured = Number(inp.measuredMbpsSafe);
        /* `bwMinMbps` = mínimo EXIGIDO (lo que el panel pide a la red).
         * `stallBandwidthMbps` = capacidad DISPONIBLE para la ecuación de stall.
         * Por defecto son el mismo número; en ultra-aggressive se SEPARAN:
         *   disponible = medido × duty          (lo que la estrategia acepta gastar)
         *   exigido    = perfil × margen        (mínimo que el panel exige)
         * La razón que evalúa el calculador es SIEMPRE disponible/exigido
         * (bandwidth/bitrate, streaming-calculator.js:263): es SU semántica y no
         * se invierte. [2026-11-18 · corrección del capitán: antes se pasaba
         * invertida y ultra salía UNSTABLE con 400 Mbps medidos] */
        var bwMin = Number(inp.bwMinMbps) > 0 ? Number(inp.bwMinMbps) : r2(required * DEFAULTS.margin);
        var bwAvail = Number(inp.stallBandwidthMbps) > 0 ? Number(inp.stallBandwidthMbps) : bwMin;
        var hasCalc = Number(inp.bitrateForStall) > 0;
        var bitrate = hasCalc ? Number(inp.bitrateForStall) : required;
        if (!(required > 0) || !(bwAvail > 0) || !(bitrate > 0)) return null;
        var ratio = Math.round((bwAvail / bitrate) * 100) / 100;
        var out = {
            target: target, ratio: ratio, bitrateMbps: r2(bitrate),
            bwMinMbps: r2(bwMin), stallBandwidthMbps: r2(bwAvail),
            basis: inp.basisOverride || (hasCalc ? 'calculator_bitrate' : 'required_fallback'),
            measuredMbpsSafe: isNum(measured) ? r2(measured) : null,
            forced: false, seconds: null
        };
        if (ratio < STALL.unstableRatio) {
            out.forced = true;
            out.unreachable = 'el calculador declara UNSTABLE (ratio disponible/exigido ' + ratio + 'x < ' +
                STALL.unstableRatio + 'x): ningún buffer alcanza el target' +
                (inp.basisOverride === 'measured_duty'
                    ? ' — disponible ' + r2(bwAvail) + ' Mbps contra exigido ' + r2(bitrate) + ' Mbps'
                    : '');
            return out;
        }
        var kEff = STALL.k * Math.min(STALL.kMax, Math.max(STALL.kMin, ratio));
        var need = STALL.segDur * Math.log(100 / target) / kEff;
        out.seconds = Math.ceil(need * 10) / 10;
        return out;
    }

    /* Forma posicional que pidió el capitán:
     *   bufferForTargetStall(requiredMbps, measuredMbpsSafe, targetStallPct[, bitrateForStall])
     * Sin el 4º argumento NO se conoce el bitrate con el que el panel estima el
     * stall, así que se usa requiredMbps como bitrate: es la base CONSERVADORA y
     * devuelve un buffer MAYOR (más exigente). Con el 4º argumento (el bitrate
     * de calculateBitrate del panel) devuelve el número que el chip del panel
     * va a confirmar. El plan siempre declara cuál usó en metrics.stallBasis. */
    function bufferForTargetStall(requiredMbps, measuredMbpsSafe, targetStallPct, bitrateForStall) {
        var d = bufferForTargetStallDetailed({
            requiredMbps: requiredMbps, measuredMbpsSafe: measuredMbpsSafe,
            targetStallPct: targetStallPct, bitrateForStall: bitrateForStall
        });
        return d ? d.seconds : null;
    }

    /* Resuelve CUALQUIER nombre (clave del panel, alias español, con acentos,
     * guiones o guiones bajos) al preset del motor. Con los ALIAS del panel
     * delante: 'ultra-aggressive' -> Ultra-Agresivo (antes caía a Balanceado). */
    function normKey(s) {
        return String(s || '').trim().toLowerCase()
            .replace(/[_\s]+/g, '-')
            .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i').replace(/[óò]/g, 'o');
    }

    function strategyOf(name) {
        var k = String(name || '').trim();
        if (STRATEGIES[k]) {
            var d0 = STRATEGIES[k];
            return { name: k, factor: d0.factor, parallelCap: d0.parallelCap, note: d0.note,
                     bufferSegCap: d0.bufferSegCap, latencyFirst: !!d0.latencyFirst, demandDuty: d0.demandDuty };
        }
        var norm = normKey(k);
        if (ALIASES[norm]) {
            var can = ALIASES[norm], d1 = STRATEGIES[can];
            return { name: can, factor: d1.factor, parallelCap: d1.parallelCap, note: d1.note,
                     bufferSegCap: d1.bufferSegCap, latencyFirst: !!d1.latencyFirst, demandDuty: d1.demandDuty,
                     alias: norm };
        }
        for (var key in STRATEGIES) {
            if (!Object.prototype.hasOwnProperty.call(STRATEGIES, key)) continue;
            if (normKey(key) === norm) {
                var d2 = STRATEGIES[key];
                return { name: key, factor: d2.factor, parallelCap: d2.parallelCap, note: d2.note,
                         bufferSegCap: d2.bufferSegCap, latencyFirst: !!d2.latencyFirst, demandDuty: d2.demandDuty };
            }
        }
        return { name: 'Balanceado', factor: 1.0, parallelCap: 6, note: 'preset desconocido -> balanceado' };
    }

    /* Clave CANÓNICA del panel (una de las 6 de #pm9_strategy), SIEMPRE.
     * Sirve para escribir el valor de vuelta en el <select> sin adivinar. */
    function strategyKey(name) {
        var st = strategyOf(name);
        var k = CANON_KEY[st.name];
        if (k) return k;
        // por si un alias nuevo apareciera sin entrada: se resuelve por normKey
        var n = normKey(name);
        for (var key in CANON_KEY) {
            if (CANON_KEY[key] === n) return n;
        }
        return 'balanced';
    }

    /* Devuelve el plan y sus invariantes. `ok:true` significa que la validación
     * del panel PUEDE ponerse verde legítimamente; `ok:false` trae el déficit. */
    function coherentPlan(inputs) {
        inputs = inputs || {};
        var required = Number(inputs.requiredMbps) || 0;      // bitrate que exige el perfil
        var measured = Number(inputs.measuredMbpsSafe);        // mínimo de bins medidos
        var ratio = isNum(inputs.headroomRatio) ? inputs.headroomRatio : (required > 0 ? measured / required : null);
        var segDur = Number(inputs.segDur || inputs.segDurationSec) || DEFAULTS.segDur;
        var ramMB = Number(inputs.ramBudgetMB) || DEFAULTS.ramBudgetMB;
        var margin = Number(inputs.margin) || DEFAULTS.margin;
        var st = strategyOf(inputs.strategy);

        if (!(required > 0) || !isNum(ratio) || ratio <= 0 || !isNum(measured) || measured <= 0) {
            return { ok: false, strategy: st, state: 'NO_MEASUREMENT',
                     reason: 'sin medición válida no se puede calcular un plan coherente',
                     values: null, violations: ['sin medicion'] };
        }

        /* 1 · buffer base por déficit de red (fórmula ya validada) */
        var base = bufferForRatio(ratio, segDur);
        /* 2 · el preset escala el buffer; 'Adaptativo' usa el propio ratio */
        var factor = (st.factor === null) ? clamp(0.8 + ratio * 0.25, 0.8, 1.6) : st.factor;
        var bufferByRatio = clamp(Math.round(base * factor), RANGES.bufferTargetS.min, RANGES.bufferTargetS.max);
        var bufferS = bufferByRatio;
        /* 6 · BW mínimo = exigencia × margen (NO 3×: 3× es lo que hacía imposible validar) */
        var bwMinMbps = r2(required * margin);
        /* 5bis · ULTRA-AGRESIVO: «exige al máximo medido sin romper» (encargo
         * 2026-11-18, dirección CORREGIDA).
         *   disponible = medido × duty(0.90)   ← lo que la estrategia acepta gastar
         *   exigido    = perfil × margen(1.15) ← mínimo que el panel exige
         * La puerta es disponible >= exigido, o sea ratio = disponible/exigido >= 1.
         * (Antes se pasaban invertidos y ultra salía UNSTABLE con 400 medidos.) */
        var ultraDemand = (st.name === 'Ultra-Agresivo' && isNum(measured) && measured > 0);
        var demandDuty = ultraDemand ? (Number(st.demandDuty) || STALL.duty) : null;
        var availableMbps = ultraDemand ? r2(measured * demandDuty) : null;
        var requiredForStall = bwMinMbps;                    // demanda = mínimo exigido
        var dutyOk = ultraDemand ? (availableMbps >= requiredForStall) : true;
        var neededMbpsForUltra = ultraDemand ? r2(requiredForStall / demandDuty) : null;
        /* 2bis · buffer que exige el TARGET DE STALL del panel (ver bloque STALL).
         * Buffer final = el MAYOR de absorber el déficit y cumplir el target. */
        var bft = bufferForTargetStallDetailed({
            requiredMbps: required, measuredMbpsSafe: measured, bwMinMbps: bwMinMbps,
            /* [t19] el modelo de stall razona con la CAPACIDAD medida (o con el
             * duty si la estrategia lo impone), NO con el minimo exigido: usar
             * bwMin como "bandwidth" daba ratio 1,15 fijo y condenaba a rojo. */
            /* [t19/t26] con bitrate real, el stall razona con la CAPACIDAD
             * medida; con base conservadora (sin calculador) razona con bwMin,
             * que es la exigencia completa. */
            stallBandwidthMbps: ultraDemand ? availableMbps
                : ((inputs.bitrateForStall && isNum(measured) && measured > 0) ? measured : null),
            bitrateForStall: ultraDemand ? requiredForStall : inputs.bitrateForStall,
            targetStallPct: inputs.targetStallPct,
            basisOverride: ultraDemand ? 'measured_duty' : null
        });
        var targetStallPct = bft ? bft.target : STALL.target;
        var clampedByRange = false;
        if (bft && bft.seconds !== null && bft.seconds > bufferS) {
            var want = Math.ceil(bft.seconds);
            bufferS = Math.min(want, RANGES.bufferTargetS.max);
            if (bufferS < want) clampedByRange = true;
        }
        /* 3 · RAM real: buffer_s × bitrate_exigido / 8 = MB */
        var ramNeeded = (bufferS * required) / 8;
        if (ramNeeded > ramMB) bufferS = Math.max(RANGES.bufferTargetS.min, Math.floor((ramMB * 8) / required));
        var ramFinal = (bufferS * required) / 8;
        /* 3bis · TECHO DE BUFFER POR ESTRATEGIA (ultra-low-latency): su objetivo
         * es la latencia, no la cola. Se aplica DESPUÉS del objetivo de stall
         * (no lo esconde: si no lo cumple, la violación lo dice). */
        var latencyCapped = false;
        if (st.bufferSegCap) {
            var capS = Number(st.bufferSegCap) * segDur;
            if (bufferS > capS) { bufferS = Math.max(RANGES.bufferTargetS.min, Math.round(capS)); latencyCapped = true; }
        }
        /* 4 · prefetch = segmentos que caben en ese buffer */
        /* [t17] ultra-aggressive es la estrategia de MÁXIMA cola: su config no
         * puede degradarse a la de conservador. Segmentos mínimos 6. Un
         * parallel=1 con estrategia ultra es un DEFECTO, no una decisión. */
        var isUltra = (st.name === 'Ultra-Agresivo');
        var segMin = isUltra ? 6 : RANGES.prefetchSegments.min;
        var segments = clamp(Math.ceil(bufferS / segDur), segMin, RANGES.prefetchSegments.max);
        /* 5 · paralelo útil = 2×ratio, jamás por encima del preset (autocongestión).
         * ultra-low-latency añade su propio techo duro: min(2, floor(2×ratio)). */
        var parallelCap = st.parallelCap;
        if (st.latencyFirst) parallelCap = Math.min(Number(parallelCap) || 2, 2);
        /* [t17] suelo de paralelas: 2 para ultra, 1 para el resto. Se calcula
         * del RATIO (capacidad), no de un valor por defecto. */
        var parFloor = isUltra ? 2 : RANGES.parallelDownloads.min;
        var parPorRatio = Math.floor(2 * ratio);
        if (!isFinite(parPorRatio) || parPorRatio < parFloor) { parPorRatio = parFloor; }
        var parallel = clamp(Math.min(parPorRatio, parallelCap), RANGES.parallelDownloads.min, RANGES.parallelDownloads.max);
        if (isUltra && parallel < 2) { parallel = clamp(2, RANGES.parallelDownloads.min, RANGES.parallelDownloads.max); }
        /* 7 · tiempo de llenado con la red MEDIDA */
        var fillS = r2((bufferS * required) / measured);
        /* 8 · STALL ESTIMADO con la MISMA relación del calculador del panel, sobre
         * el buffer FINAL (después de RAM y rango). Es lo que decide el ok:true. */
        var stallEst = null;
        var stallBitrate = bft ? bft.bitrateMbps : r2(required);
        /* el stall se estima con la MISMA pareja (disponible, exigido) que usó
         * el buffer: si ultra separa los dos números, aquí también se separan. */
        if (bft) stallEst = r2(stallForBuffer(bufferS, stallBitrate,
            (bft.stallBandwidthMbps !== undefined ? bft.stallBandwidthMbps : bwMinMbps)));

        var violations = [];
        /* [t17] UNA SOLA causa dominante. Antes convivían 'red_insuficiente' y
         * 'buffer_insuficiente_para_target' (ésta con su propio "ratio < 1,15"),
         * y el texto se contradecía: decía ratio 1,03x < 1,15 mientras
         * disponible 237,93 > exigido 230. Ahora, si el problema es de RED, se
         * declara una vez con disponible, exigido, ratio y los Mbps que faltan;
         * el buffer/stall NO se añade como segunda causa. */
        var causaRedUltra = false;
        if (ultraDemand) {
            /* [t26] PRECEDENCIA medida: la causa dominante se decide por el
             * orden de las dos preguntas, no por el texto.
             *   1) ¿la red llega al MÍNIMO exigido?   no → red_insuficiente
             *   2) ¿llega con el duty de la estrategia? no → duty_insuficiente
             * Antes el bloque de duty se evaluaba primero y se comía el caso
             * "medido == exigido" (230 con exigido 230), declarándolo como red. */
            if (measured < requiredForStall) {
                /* la red NO llega al mínimo: se declara con disponible, capacidad,
                 * duty y el DÉFICIT real (no el total exigido) */
                causaRedUltra = true;
                violations.push('red_insuficiente: disponible ' + availableMbps + ' Mbps (capacidad ' +
                    r2(measured) + ' × ' + demandDuty + ') < exigido ' + requiredForStall + ' Mbps · ratio ' +
                    (availableMbps / requiredForStall).toFixed(2) + 'x · faltan ' +
                    r2(neededMbpsForUltra - measured) + ' Mbps medidos (' +
                    r2(requiredForStall - availableMbps) + ' Mbps de capacidad)');
            } else if (!dutyOk) {
                causaRedUltra = true;
                violations.push('duty_insuficiente: disponible ' + availableMbps + ' Mbps (capacidad ' +
                    r2(measured) + ' × ' + demandDuty + ') < exigido ' + requiredForStall + ' Mbps · ratio ' +
                    (availableMbps / requiredForStall).toFixed(2) + 'x · se necesitan ' +
                    neededMbpsForUltra + ' Mbps medidos · faltan ' +
                    r2(neededMbpsForUltra - measured) + ' Mbps medidos (' +
                    r2(requiredForStall - availableMbps) + ' Mbps de capacidad)');
            }
        } else if (measured < required * margin) {
            violations.push('red_insuficiente: medido ' + r2(measured) + ' Mbps < exigido×margen ' + bwMinMbps +
                ' Mbps · ratio ' + (measured / (required * margin)).toFixed(2) + 'x · faltan ' +
                r2(required * margin) + ' Mbps');
        }
        if (!causaRedUltra && fillS > bufferS * DEFAULTS.fillFactorMax) {
            violations.push('llenado_lento: ' + fillS + ' s para ' + bufferS + ' s de buffer (máx ' + (bufferS * DEFAULTS.fillFactorMax) + ' s)');
        }
        if (ramFinal > ramMB) {
            violations.push('ram_excedida: ' + r2(ramFinal) + ' MB > ' + ramMB + ' MB');
        }
        /* el mismo suelo que la asignación: si ultra abre 2 por estrategia, eso
         * no es autocongestión (sería contradictorio penalizar lo que se exige) */
        var parTecho = Math.max(isUltra ? 2 : 1, Math.floor(2 * ratio));
        if (parallel > parTecho) {
            violations.push('autocongestion: paralelo ' + parallel + ' > ' + parTecho + ' (2×ratio con suelo de estrategia)');
        }
        /* 9 · CONDICIÓN DURA: ok:true sólo si el stall estimado cumple el target.
         * Si el buffer necesario no cabe en el rango (o la RAM lo recorta), se
         * declara el déficit con el número exacto. Nunca un ok:true que no cumple.
         * Excepciones DECLARADAS, no silenciosas:
         *  · ultra-aggressive con duty corto → manda duty_insuficiente (la red),
         *    el buffer es irrelevante porque la exigencia no se sostiene.
         *  · ultra-low-latency → su objetivo es LATENCIA: el stall se publica como
         *    precio (stallPricePct) y NO como fallo; su única puerta es la red y
         *    que el buffer quepa en 2 segmentos (garantizado por el techo). */
        var stallPricePct = null;
        if (st.latencyFirst) {
            stallPricePct = stallEst;
        } else if (causaRedUltra) {
            /* la red ya está declarada como causa dominante: no se añade una
             * segunda causa (buffer/stall) que contradiría el texto */
        } else if (bft && bft.forced) {
            violations.push('buffer_insuficiente_para_target: ' + bft.unreachable);
        } else if (bft && bft.seconds !== null && stallEst !== null && stallEst > targetStallPct) {
            violations.push('buffer_insuficiente_para_target: se necesitan ' + bft.seconds +
                ' s de buffer para stall ≤ ' + targetStallPct + ' %, el plan aplica ' + bufferS +
                ' s (stall estimado ' + stallEst + ' %)' +
                (clampedByRange ? ' — recortado por el rango ' + RANGES.bufferTargetS.min + '..' + RANGES.bufferTargetS.max + ' s' : ''));
        }

        return {
            ok: violations.length === 0,
            state: violations.length === 0 ? 'COHERENTE' : 'INCOHERENTE',
            /* [t26] la spec lee el buffer necesario en el nivel superior */
            neededBufferS: (bft && bft.seconds !== null) ? bft.seconds : null,
            strategy: st,
            strategyKey: strategyKey(st.name),
            values: {
                bufferTargetS: bufferS,
                prefetchSegments: segments,
                parallelDownloads: parallel,
                bwMinMbps: bwMinMbps
            },
            metrics: {
                ramMB: r2(ramFinal), ramBudgetMB: ramMB,
                fillSeconds: fillS, fillBudgetS: r2(bufferS * DEFAULTS.fillFactorMax),
                ratio: r2(ratio), measuredMbps: r2(measured), requiredMbps: r2(required),
                baseBufferS: base, bufferByRatio: bufferByRatio, factor: r2(factor),
                /* objetivo de stall, con su procedencia declarada */
                targetStallPct: targetStallPct,
                stallEstimatePct: stallEst,
                neededBufferS: (bft && bft.seconds !== null) ? bft.seconds : null,
                bufferClampedByRange: clampedByRange,
                latencyCapped: latencyCapped,
                stallBasis: bft ? bft.basis : 'sin_plan',
                segDurS: segDur,          // base de la cobertura segmentos×duración
                stallBitrateMbps: stallBitrate,
                stallRatio: bft ? bft.ratio : null,
                /* ultra-agresivo: disponible vs exigido, con la dirección correcta
                 * (ratio = disponible/exigido) y el umbral exacto de la puerta */
                demandDuty: demandDuty,
                availableMbps: availableMbps,
                requiredMbpsForStall: ultraDemand ? requiredForStall : null,
                dutyRatio: (ultraDemand && requiredForStall > 0)
                    ? r2(availableMbps / requiredForStall) : null,
                dutyOk: ultraDemand ? dutyOk : null,
                neededMbpsForUltra: neededMbpsForUltra,
                stallDemandMbps: availableMbps,
                /* ultra-low-latency: el stall como PRECIO declarado, no como fallo */
                stallPricePct: stallPricePct
            },
            violations: violations,
            /* Qué haría falta para que SÍ cuadre — sin tocar un solo ajuste a mano */
            neededMbpsForGreen: r2(required * margin),
            neededBufferS: (bft && bft.seconds !== null) ? bft.seconds : null
        };
    }

    return {
        RANGES: RANGES, GATE: GATE, STRATEGIES: STRATEGIES, DEFAULTS: DEFAULTS,
        STALL: STALL,
        bufferForRatio: bufferForRatio,
        prefetchForBuffer: prefetchForBuffer,
        parallelForRatio: parallelForRatio,
        timeoutForRatio: timeoutForRatio,
        stallForBuffer: stallForBuffer,
        bufferForTargetStall: bufferForTargetStall,
        bufferForTargetStallDetailed: bufferForTargetStallDetailed,
        deterministic: deterministic,
        validate: validate,
        verdict: verdict,
        strategyOf: strategyOf,
        strategyKey: strategyKey,
        ALIASES: ALIASES,
        CANON_KEY: CANON_KEY,
        coherentPlan: coherentPlan,
        plan: plan,
        apply: apply
    };
});
