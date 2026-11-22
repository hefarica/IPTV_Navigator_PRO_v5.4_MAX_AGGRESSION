/* [2026-11-20] ORIGEN DE SONDA (v2). La v1 usaba `root`, que NO existe en estos
 * modulos: lanzaba ReferenceError, el catch devolvia '' y la sonda se quedaba en
 * /lists/streamlink.m3u8 relativa -> 404 -> el medidor no medía la red.
 * Ahora usa `location` directamente, que siempre existe en el navegador. */
function apeProbeOrigin() {
    try {
        var h = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';
        if (!h) return '';
        var local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(h);
        return local ? 'https://iptv-ape.duckdns.org' : '';
    } catch (_e) { return ''; }
}
function apeProbeUrl(path) {
    var p = String(path || '/lists/streamlink.m3u8');
    var o = apeProbeOrigin();
    if (!o) return p;
    return o + (p.charAt(0) === '/' ? p : '/' + p);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * APE BANDWIDTH METER v1.0 — el PRODUCTOR de medición que faltaba
 *
 * POR QUE EXISTE
 *   `sufficiency-law-v1.js` ya hace lo correcto: sin medición devuelve
 *   NO_MEASUREMENT en vez de inventar un headroom. Pero nadie MEDÍA. Resultado
 *   medido en el panel: "UNSTABLE · 79.97 % · Risk 90 · Headroom SIN MEDICIÓN",
 *   tres números incompatibles porque ninguno venía de la red.
 *
 * QUE MIDE
 *   Velocidad media en bins de 1 segundo, acumulada sobre una ventana de 5 s
 *   (configurable a 10 s). Fuente preferente: Resource Timing — los bytes que
 *   el reproductor YA descargó. Cero tráfico extra. Fuente opcional: sonda
 *   sintética contra una URL pequeña, sólo si se pide explícitamente.
 *
 * QUE DEVUELVE (y qué NO)
 *   - mbpsAvg  : media de la ventana
 *   - mbpsSafe : mínimo de los bins (el número con el que se decide, porque un
 *                pico de 1 s no sostiene un buffer)
 *   - jitter   : 1 − min/max de la ventana
 *   Sin muestras NO hay números: state = NO_MEASUREMENT y recommend = null.
 *
 * AUTOMATIZA
 *   Traduce headroom → buffer / prefetch / concurrencia / read-timeout.
 *   NO toca la naturaleza de los fallbacks: las cadenas F0–F5, el codec ladder
 *   y los tiers de calidad quedan fuera, listados en `untouched`.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.APE_BW_METER = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /* ── FETCH NATIVO CAPTURADO EN CARGA (2026-11-17) ────────────────────────
     * MEDIDO EN EL NAVEGADOR DEL OPERADOR: `ape-runtime-evasion-engine.js`
     * parchea window.fetch y REINTENTA con espera (interceptedFetch). La sonda
     * leia root.fetch en el momento de la llamada, heredaba esa interceptacion,
     * se quedaba reintentando el primer objetivo toda la ventana y moria por el
     * temporizador: PROBE_ABORTED "signal is aborted without reason" y el panel
     * en NO_MEASUREMENT. En Node no existe ese motor, por eso ahi medía bien.
     * Se captura AQUI, antes de que nadie parchee, y se usa para medir red pura.
     * (Se puede seguir inyectando `opts.fetch` para pruebas.) */
    var NATIVE_FETCH = (root && typeof root.fetch === 'function') ? root.fetch : null;

    var LAW = {
        VERSION: '1.0',
        WINDOW_S_DEFAULT: 5,
        WINDOW_S_MAX: 10,
        BIN_MS: 1000,
        // anclas de riesgo, coherentes con sufficiency-law-v1 (3x→≤10, 1.3x→50)
        RISK_ANCHORS: [[3.0, 5], [2.0, 20], [1.5, 35], [1.3, 50], [1.0, 70], [0, 95]],
        CONCURRENCY_MAX: 8,          // invariante del repo: 8, nunca más
        MIN_BINS_VALIDOS: 3,
        /* [2026-11-21] Un sampler PASIVO sólo es evidencia de transporte si de
         * verdad corrieron bytes de media en la ventana. Por debajo de este umbral
         * es el ruido de la propia página (recursos, sondas fallidas) y NO puede
         * dimensionar un buffer: el caso medido publicó 0.2 Mbps y reescribió los
         * 12 perfiles a 0.01x. */
        RT_MIN_BYTES: 2 * 1024 * 1024,
        /* [2026-11-21] Piso de la sonda SINTÉTICA. `bytes > 0` era demasiado débil:
         * una sonda que solo alcanzó a traer 4 KB publicó 1.18 Mbps y reescribió los
         * 12 perfiles. Una muestra por debajo de esto no dimensiona transporte. */
        PROBE_MIN_BYTES: 512 * 1024,
        // SONDA SINTÉTICA: fichero estático del propio servidor (nunca el
        // proveedor: su slot es único y una sonda lo tumbaría). Se cancela en
        // cuanto pasa la ventana, así que el tope sólo acota el daño.
        PROBE_URL_DEFAULT: '/lists/streamlink.m3u8',
        PROBE_MAX_BYTES: 64 * 1024 * 1024,
        UNTOUCHED: [
            'fallback_chain_F0_F5',
            'codec_ladder_priority',
            'profile_quality_tier',
            'anti_degradation_floor',
            'hdcp_level_policy',
            'RESOLUTION_declarada'
        ]
    };

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function round2(v) { return Math.round(v * 100) / 100; }

    /* Acumula muestras crudas [{t_ms, bytes}] en bins de 1 s. */
    function toBins(samples, binMs) {
        binMs = binMs || LAW.BIN_MS;
        var out = [], cur = null, i, s, b;
        if (!samples || !samples.length) return out;
        for (i = 0; i < samples.length; i++) {
            s = samples[i];
            if (!s || typeof s.t_ms !== 'number') continue;
            b = Math.floor(s.t_ms / binMs);
            if (!cur || cur.bin !== b) { cur = { bin: b, bytes: 0 }; out.push(cur); }
            cur.bytes += (Number(s.bytes) || 0);
        }
        return out;
    }

    /* Resumen honesto de una ventana de muestras.
     * `mbpsSafe` ignora bins inactivos (0 bytes) SOLO si quedan >= 3 con datos:
     * un bin inactivo es el reproductor en pausa, no una caída de red. */
    function summarize(samples, windowS) {
        var bins = toBins(samples);
        var perBin = bins.map(function (b) { return b.bytes * 8 / 1e6; });
        var activos = perBin.filter(function (v) { return v > 0; });
        if (!activos.length) {
            return {
                ok: false, state: 'NO_MEASUREMENT',
                reason: 'ventana sin bytes: el reproductor no descargó nada (no es 0 Mbps)',
                samples: perBin.length, windowS: windowS || LAW.WINDOW_S_DEFAULT
            };
        }
        var usados, dropped = 0;
        if (activos.length >= 4) {
            /* [2026-11-17 FIX MEDIDO] El PRIMER bin de 1 s incluye el arranque de
             * la peticion (cola de Chrome, DNS, primer paquete): salia a ~2.34 Mbps
             * mientras el resto iba a cientos, y como mbpsSafe era el MINIMO
             * ABSOLUTO, un solo bin de arranque destruia la medicion y el panel
             * clavaba el headroom en -100%. Se descarta el bin de calentamiento
             * (solo si quedan >=3 utiles) y se mide sobre los bins en regimen. */
            usados = activos.slice(1);
            dropped = 1;
            if (usados.length < LAW.MIN_BINS_VALIDOS) { usados = activos; dropped = 0; }
        } else {
            usados = activos.length >= LAW.MIN_BINS_VALIDOS ? activos : perBin;
        }
        var sum = 0, i;
        for (i = 0; i < usados.length; i++) sum += usados[i];
        /* [2026-11-21] BYTES reales de la ventana: la prueba de que hubo transporte.
         * Un `mbpsSafe` pequeño con pocos KB es tráfico incidental de la página, no
         * un enlace lento. Sin este número el auto-tune no podía distinguirlos. */
        var bytesVentana = 0;
        for (i = 0; i < (samples || []).length; i++) bytesVentana += (Number(samples[i] && samples[i].bytes) || 0);
        var avg = sum / usados.length;
        var min = Math.min.apply(null, usados);
        var max = Math.max.apply(null, usados);
        return {
            ok: true, state: 'MEASURED',
            mbpsAvg: round2(avg),
            mbpsSafe: round2(min),
            mbpsMax: round2(max),
            jitter: max > 0 ? round2(1 - min / max) : null,
            warmupBinsDropped: dropped,
            bins: perBin.length,
            binsActivos: activos.length,
            bytes: bytesVentana,
            perBinMbps: perBin.map(round2),
            windowS: windowS || LAW.WINDOW_S_DEFAULT
        };
    }

    /* Riesgo 0..100 por interpolación lineal entre anclas de la ley. */
    function riskFromRatio(r) {
        if (r === null || r === undefined || !isFinite(r)) return null;
        var A = LAW.RISK_ANCHORS, i, hi, lo, t;
        if (r >= A[0][0]) return A[0][1];
        for (i = 0; i < A.length - 1; i++) {
            hi = A[i]; lo = A[i + 1];
            if (r <= hi[0] && r >= lo[0]) {
                t = (hi[0] === lo[0]) ? 0 : (r - lo[0]) / (hi[0] - lo[0]);
                return Math.round(lo[1] + t * (hi[1] - lo[1]));
            }
        }
        return 95;
    }

    /* Escalón de configuración según headroom. Sube buffer/prefetch/tiempo de
     * lectura; NUNCA toca la cadena de fallbacks ni el techo de calidad. */
    function recommendFromRatio(r) {
        if (r === null || r === undefined || !isFinite(r) || r <= 0) {
            return { ok: false, state: 'NO_MEASUREMENT', config: null, untouched: LAW.UNTOUCHED.slice() };
        }
        var tier, cfg;
        if (r >= 2.0) {
            tier = 'EXCEPTIONAL';
            cfg = { bufferTargetS: 12, prefetchSegments: 6, parallelDownloads: 8, readTimeoutMs: 90000 };
        } else if (r >= 1.3) {
            tier = 'SUFFICIENT';
            cfg = { bufferTargetS: 10, prefetchSegments: 4, parallelDownloads: 6, readTimeoutMs: 75000 };
        } else {
            tier = 'TIGHT';
            cfg = { bufferTargetS: 8, prefetchSegments: 3, parallelDownloads: 4, readTimeoutMs: 60000 };
        }
        cfg.parallelDownloads = clamp(Math.min(cfg.parallelDownloads, Math.floor(2 * r) || 1),
                                      1, LAW.CONCURRENCY_MAX);
        return {
            ok: true, state: tier, config: cfg,
            reason: 'headroom ' + round2(r) + 'x → ' + tier,
            untouched: LAW.UNTOUCHED.slice()
        };
    }

    /* Núcleo: integra medición + exigencia y devuelve todo lo que el panel
     * necesita, sin inventar nada cuando no hay muestras. */
    function integrate(requiredMbps, samples, opts) {
        opts = opts || {};
        var req = Number(requiredMbps);
        var m = summarize(samples, opts.windowS);
        if (!m.ok) {
            return {
                ok: false, state: 'NO_MEASUREMENT',
                measurement: m, headroomRatio: null, headroomPct: null, risk: null,
                recommend: { ok: false, state: 'NO_MEASUREMENT', config: null, untouched: LAW.UNTOUCHED.slice() },
                untouched: LAW.UNTOUCHED.slice(),
                reason: m.reason
            };
        }
        if (!isFinite(req) || req <= 0) {
            return {
                ok: false, state: 'NO_REQUIREMENT',
                measurement: m, headroomRatio: null, headroomPct: null, risk: null,
                recommend: { ok: false, state: 'NO_REQUIREMENT', config: null, untouched: LAW.UNTOUCHED.slice() },
                untouched: LAW.UNTOUCHED.slice(),
                reason: 'sin bitrate exigido no hay headroom que calcular'
            };
        }
        var r = round2(m.mbpsSafe / req);
        var risk = riskFromRatio(r);
        var ev = null;
        if (typeof root.evaluateSufficiency === 'function') {
            ev = root.evaluateSufficiency(r, risk, true);
        }
        var rec = recommendFromRatio(r);
        return {
            ok: true,
            state: ev ? ev.state : rec.state,
            law: ev,
            measurement: m,
            requiredMbps: req,
            headroomRatio: r,
            headroomPct: Math.round((r - 1) * 100),
            risk: risk,
            satisfiesExceptional: ev ? !!ev.satisfiesExceptional : (r >= 3 && risk <= 10),
            recommend: rec,
            untouched: LAW.UNTOUCHED.slice()
        };
    }

    /* ── SAMPLER de navegador (Resource Timing, cero tráfico extra) ─────────
     * Cada 1 s lee cuántos bytes de media entraron desde la última lectura y
     * los apila. Al terminar la ventana resuelve con las muestras crudas. */
    function startSampler(opts) {
        opts = opts || {};
        var windowS = clamp(Number(opts.windowS) || LAW.WINDOW_S_DEFAULT, 1, LAW.WINDOW_S_MAX);
        var mediaRe = /\.(ts|m4s|mp4|m3u8|cmfv|cmfa)(\?|#|$)/i;
        var samples = [], t0 = null, lastBytes = 0, timer = null;
        var perf = root.performance;

        if (!perf || typeof perf.getEntriesByType !== 'function') {
            return Promise.resolve({
                ok: false, state: 'NO_RESOURCE_TIMING',
                reason: 'el entorno no expone performance.getEntriesByType (no se mide, no se inventa)',
                samples: [], windowS: windowS
            });
        }

        function totalBytes() {
            var out = 0;
            var entries = perf.getEntriesByType('resource') || [];
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                if (e.initiatorType && e.initiatorType !== 'xmlhttprequest' && e.initiatorType !== 'fetch' && e.initiatorType !== 'other' && e.initiatorType !== 'video') continue;
                if (!mediaRe.test(String(e.name || ''))) continue;
                var n = Number(e.transferSize) || Number(e.encodedBodySize) || 0;
                if (n > 0) out += n;
            }
            return out;
        }

        return new Promise(function (resolve) {
            t0 = Date.now();
            lastBytes = totalBytes();
            timer = setInterval(function () {
                var now = Date.now();
                var tot = totalBytes();
                var delta = tot >= lastBytes ? tot - lastBytes : 0;
                lastBytes = tot;
                samples.push({ t_ms: now - t0, bytes: delta });
                if (now - t0 >= windowS * 1000) {
                    clearInterval(timer);
                    resolve({ ok: samples.some(function (s) { return s.bytes > 0; }),
                             state: 'SAMPLED', samples: samples, windowS: windowS,
                             source: 'resource-timing' });
                }
            }, LAW.BIN_MS);
        });
    }

    /* ── SONDA SINTÉTICA (no depende de estar reproduciendo) ─***************
     * Descarga real durante `windowS` segundos contra un fichero ESTÁTICO del
     * propio servidor, contando bytes por bin de 1 s. Se cancela al terminar la
     * ventana: no hace falta el fichero completo.
     *
     * NO toca el proveedor: su slot es único y una sonda de más tumbaría lo que
     * se está sirviendo. La URL es configurable (opts.probeUrl).
     * cache:'no-store' + cache-buster: si no, mide la caché, no la red.
     * ********************************************************************* */
    function probe(opts) {
        opts = opts || {};
        var windowS = clamp(Number(opts.windowS) || LAW.WINDOW_S_DEFAULT, 1, LAW.WINDOW_S_MAX);
        var baseUrl = apeProbeUrl(opts.probeUrl || LAW.PROBE_URL_DEFAULT);
        /* [2026-11-17] AUTODESCUBRIMIENTO DEL OBJETIVO.
         * El objetivo por defecto (/lists/streamlink.m3u8) existe en el VPS pero
         * NO en un Live Server local: la sonda fallaba entera y el panel se
         * quedaba en "SIN MEDICION" aunque la red fuera perfecta. Se prueban
         * candidatos que SIEMPRE estan: el generador y el propio panel. */
        /* [2026-11-20] ORDEN CAMBIADO: la lista grande primero. Los ficheros locales
         * se eliminaron como respaldo porque medir el disco no es medir la red.
         * Si la red falla, se declara el fallo; no se inventa una cifra. */
        var cands = opts.probeUrl ? [baseUrl] : [baseUrl,
            apeProbeUrl('/index-v4.html'),
            apeProbeUrl('/js/ape-v9/m3u8-typed-arrays-ultimate.js')];
        var ci = 0;
        var maxBytes = Number(opts.maxBytes) || LAW.PROBE_MAX_BYTES;
        var fetchFn = opts.fetch || NATIVE_FETCH || root.fetch;
        var Ctl = root.AbortController;

        if (typeof fetchFn !== 'function' || typeof Ctl !== 'function') {
            return Promise.resolve({
                ok: false, state: 'NO_FETCH',
                reason: 'el entorno no expone fetch/AbortController: no se mide, no se inventa',
                samples: [], windowS: windowS, source: 'synthetic-probe'
            });
        }

        var ctl = new Ctl();
        var baseBust = (baseUrl.indexOf('?') === -1 ? '?' : '&') + '_ape_bw=' +
                   Date.now() + Math.random().toString(36).slice(2, 8);
        var samples = [], t0 = Date.now(), total = 0, round = 0;
        var hardStop = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, windowS * 1000 + 400);

        /* ── RONDAS (2026-11-17) ─────────────────────────────────────────────
         * Un fichero pequeño —o cualquier cosa servida en localhost— termina en
         * milisegundos y dejaría menos de MIN_BINS_VALIDOS bins: la ley daría
         * NO_MEASUREMENT aunque la red esté perfecta. Se ENCADENAN peticiones
         * hasta completar la ventana, cada una con su cache-buster propio para
         * seguir midiendo red y no caché. */
        function more() { return Date.now() - t0 < windowS * 1000 && total < maxBytes; }

        function oneRound() {
            round++;
            /* [2026-11-17 FIX MEDIDO POR t11] PRESUPUESTO POR CANDIDATO.
             * Reproducido en Chrome real: el primer objetivo tardaba 7311 ms
             * DESDE LA PAGINA (310 peticiones encoladas por Chrome al cargar)
             * mientras curl al mismo servidor tardaba 3 ms. El plazo GLOBAL de
             * 5400 ms abortaba la sonda entera antes de probar el segundo.
             * Ahora cada candidato tiene su propio plazo corto y, si expira, la
             * cadena AVANZA en vez de morir. */
            var perCand = Math.max(400, Math.min(1500, (windowS * 1000) / 2));
            var ctlC = new Ctl();
            var tCand = setTimeout(function () { try { ctlC.abort(); } catch (e) {} }, perCand);
            function avanzar() {
                if (ci < cands.length - 1) { ci++; return oneRound(); }
                return null;
            }
            /* [2026-11-21 · MEDIDO EN CHROME 157] SIN `Range`. Corrección de la
             * primera hipótesis: `Range` simple es CORS-safelisted, NO disparaba el
             * preflight (medido: GET con Range → 206 OK). Se quita por doctrina del
             * repo (header tóxico) y porque el presupuesto de bytes ya se aplica
             * cortando el reader. Se deja sólo `Accept`, que sí es safelisted.
             * El preflight real del ciclo lo disparaba `X-APE-Rtt` en headRtt. */
            return fetchFn(cands[ci] + baseBust + '-' + round, {
                cache: 'no-store',
                signal: ctlC.signal,
                headers: { 'Accept': '*/*' }
            }).then(function (res) {
                clearTimeout(tCand);
                if (!res || !res.ok) {
                    var nx = avanzar();
                    if (nx) return nx;
                    throw new Error('HTTP ' + (res ? res.status : '?') + ' en ' + cands[ci]);
                }
                if (!res.body || typeof res.body.getReader !== 'function') throw new Error('respuesta sin stream');
                var reader = res.body.getReader();
                function pump() {
                    return reader.read().then(function (r) {
                        if (r.done) {
                            if (more()) return oneRound();   // fichero corto: otra ronda
                            return;
                        }
                        var now = Date.now() - t0;
                        var n = (r.value && r.value.length) ? r.value.length : 0;
                        total += n;
                        samples.push({ t_ms: now, bytes: n });
                        if (!more()) {
                            try { reader.cancel(); } catch (e) {}
                            return;
                        }
                        return pump();
                    });
                }
                return pump();
            }).catch(function (e) {
                /* [2026-11-17] Candidato colgado o error de red: AVANZAR al
                 * siguiente en lugar de matar la sonda entera. Es la causa que
                 * midio t11: el 404 del primer objetivo tarda 7311 ms desde la
                 * pagina porque Chrome lo encola detras de 310 peticiones. */
                clearTimeout(tCand);
                var nxc = avanzar();
                if (nxc) return nxc;
                throw e;
            });
        }

        return oneRound().then(function () {
                clearTimeout(hardStop);
                try { ctl.abort(); } catch (e) {}
                return {
                    ok: samples.some(function (s) { return s.bytes > 0; }),
                    state: 'PROBED', samples: samples, windowS: windowS,
                    source: 'synthetic-probe', bytes: total, probeUrl: baseUrl
                };
        }).catch(function (e) {
            clearTimeout(hardStop);
            var aborted = e && e.name === 'AbortError';
            return {
                ok: samples.some(function (s) { return s.bytes > 0; }),
                state: aborted ? 'PROBE_ABORTED' : 'PROBE_FAILED',
                reason: (e && e.message) || 'sonda fallida',
                samples: samples, windowS: windowS, source: 'synthetic-probe',
                bytes: total, probeUrl: baseUrl
            };
        });
    }

    /* Un solo paso para el panel.
     * mode 'probe' (por defecto): sonda activa, funciona SIN reproducir.
     * mode 'auto'             : sonda y, si falla, cae a Resource Timing.
     * mode 'rt'               : sólo Resource Timing (lo que el player descargó).
     * Si no hay medición NO inventa: devuelve el estado con su razón. */
    function measureAndIntegrate(requiredMbps, opts) {
        opts = opts || {};
        var mode = opts.mode || 'probe';

        function fromRt() {
            return startSampler(opts).then(function (smp) {
                if (!smp || smp.state === 'NO_RESOURCE_TIMING') return null;
                return integrate(requiredMbps, smp.samples || [], { windowS: smp.windowS });
            });
        }

        function none(state, reason, src) {
            return {
                ok: false, state: state || 'NO_MEASUREMENT',
                measurement: { ok: false, state: state || 'NO_MEASUREMENT', reason: reason || null, source: src || null },
                headroomRatio: null, headroomPct: null, risk: null,
                recommend: { ok: false, state: state || 'NO_MEASUREMENT', config: null, untouched: LAW.UNTOUCHED.slice() },
                untouched: LAW.UNTOUCHED.slice(), reason: reason || null
            };
        }

        if (mode === 'rt') {
            return fromRt().then(function (r) {
                return r || none('NO_RESOURCE_TIMING', 'el entorno no expone Resource Timing', 'resource-timing');
            });
        }

        return probe(opts).then(function (pr) {
            if (pr && pr.ok) {
                var out = integrate(requiredMbps, pr.samples || [], { windowS: pr.windowS });
                out.probe = { bytes: pr.bytes, source: pr.source, probeUrl: pr.probeUrl };
                return out;
            }
            if (mode === 'auto') {
                return fromRt().then(function (r) {
                    /* [2026-11-17] El fallback OCULTABA la causa: si el pasivo
                     * tambien fallaba, se devolvia SU 'ventana sin bytes' y el
                     * error real de la sonda (p.ej. HTTP 404 del objetivo) se
                     * perdia. Ahora se conservan los DOS motivos para que el
                     * panel pueda decir cual fallo. */
                    var pr2 = (pr && pr.state && pr.state !== 'PROBED')
                        ? ('sonda: ' + pr.state + ' :: ' + (pr.reason || 'sin motivo')) : null;
                    if (r && r.ok) return r;
                    if (r) {
                        r.probeError = { state: pr && pr.state, reason: pr && pr.reason };
                        if (pr2) r.reason = (r.reason ? r.reason + '  |  ' : '') + pr2;
                        return r;
                    }
                    return none(pr && pr.state, pr2 || 'sonda y pasivo sin datos', 'synthetic-probe');
                });
            }
            return none(pr && pr.state, (pr && pr.reason) || 'sonda sin datos', 'synthetic-probe');
        });
    }

    /* [2026-11-21 · MEDIDO] ¿Esta lectura puede mover parámetros? Sólo si describe
     * TRANSPORTE. Rechaza el artefacto exacto que degradó los 12 perfiles:
     * sonda bloqueada por preflight (405) → fallback al sampler pasivo → 0.2 Mbps
     * de tráfico incidental de la página → ratios 0.01x. Un no-dato no se convierte
     * en decisión de ingeniería. Devuelve {ok, reason} — nunca lanza. */
    function isTrustworthyMeasurement(r) {
        if (!r || r.ok !== true) {
            return { ok: false, reason: 'medición no válida (' + ((r && (r.state || r.reason)) || 'sin estado') + ')' };
        }
        var m = r.measurement || null;
        if (!m || m.state !== 'MEASURED') {
            return { ok: false, reason: 'sin bins en régimen (' + ((m && (m.state || m.reason)) || 'sin measurement') + ')' };
        }
        var mbps = Number(m.mbpsSafe);
        if (!(mbps > 0)) return { ok: false, reason: 'mbpsSafe no positivo' };
        /* 1 · sonda sintética real (mode 'probe'): hay bytes y hay URL objetivo. */
        if (r.probe && Number(r.probe.bytes) > 0) {
            var bytesSonda = Number(r.probe.bytes) || 0;
            var L = (root && root.APE_LEDGER) ? root.APE_LEDGER : null;
            /* 1a · loopback no es transporte: mide el disco del propio host. */
            if (L && typeof L.scopeOf === 'function' && L.scopeOf(r.probe.probeUrl) === 'loopback') {
                return {
                    ok: false,
                    reason: 'sonda contra loopback (' + (r.probe.probeUrl || 'sin url') + '): mide el disco, no el enlace',
                    bytes: bytesSonda
                };
            }
            /* 1b · piso de bytes: 4 KB no dimensionan un buffer. */
            if (bytesSonda < LAW.PROBE_MIN_BYTES) {
                return {
                    ok: false,
                    reason: 'sonda con ' + bytesSonda + ' B (< ' + LAW.PROBE_MIN_BYTES + ' B): muestra insuficiente para dimensionar el transporte',
                    bytes: bytesSonda
                };
            }
            return { ok: true, source: r.probe.source || 'synthetic-probe', bytes: bytesSonda, mbps: mbps };
        }
        /* 2 · sonda 8 MB del medidor de caudal (ape-speed-meter-v9). */
        if (m.source === 'ape-speed-meter-v9') {
            return { ok: true, source: m.source, bytes: Number(m.bytes) || 0, mbps: mbps };
        }
        /* 3 · sampler pasivo: sólo si de verdad corrieron MB de media. */
        var bytes = Number(m.bytes) || 0;
        if (bytes < LAW.RT_MIN_BYTES) {
            return {
                ok: false,
                reason: 'sin sonda: ' + bytes + ' B medidos (< ' + LAW.RT_MIN_BYTES + ' B) — sampler pasivo con tráfico incidental, no dimensiona el transporte',
                bytes: bytes
            };
        }
        return { ok: true, source: m.source || 'resource-timing', bytes: bytes, mbps: mbps };
    }

    return {
        LAW: LAW,
        toBins: toBins,
        summarize: summarize,
        riskFromRatio: riskFromRatio,
        recommendFromRatio: recommendFromRatio,
        integrate: integrate,
        startSampler: startSampler,
        probe: probe,
        measureAndIntegrate: measureAndIntegrate,
        isTrustworthyMeasurement: isTrustworthyMeasurement
    };
});
