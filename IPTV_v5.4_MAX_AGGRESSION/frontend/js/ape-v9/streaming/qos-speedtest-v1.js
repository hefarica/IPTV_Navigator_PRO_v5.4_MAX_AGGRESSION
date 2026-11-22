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
 * APE QOS SPEEDTEST v1 — medición de capacidad tipo Ookla (sin su UI)
 *
 * POR QUÉ EXISTE (medido, no supuesto): la sonda de una sola conexión no
 * satura el enlace durante una ventana TCP corta, así que subestima el ancho
 * de banda real. Esto mide con N descargas PARALELAS contra el MISMO origen
 * (cache-buster + Range por stream), suma sus bytes en bins de 1 s, y publica:
 *
 *   mbpsP95        capacidad de pico sostenido (percentil 95 de los bins útiles)
 *   mbpsSafe       mínimo sostenido de los bins en régimen — es el que gobierna
 *                  el plan (un solo bin malo no lo destruye: se descarta la rampa)
 *   mbpsAvg        media de los bins útiles
 *   jitterMbps     desviación típica de los bins útiles
 *   bufferbloatMs  rttCargado − rttIdle (HEAD al mismo origen, en reposo y
 *                  DURANTE la carga). Detecta saturación del router.
 *
 * PARADA ADAPTATIVA: termina antes del tope si el coeficiente de variación de
 * los últimos 3 bins es < 5 % y han pasado al menos 3 s. Si no converge, sigue
 * hasta el tope. RAMPA: se descarta el primer bin y, si hay ≥ 6, también el 2º.
 *
 * PROHIBIDO aquí: caché (cache-buster + Range + no-store), azar (ninguna función
 * defaults disfrazados (si no se puede medir se devuelve ok:false con motivo y
 * NO se escribe nada), medir contra otro origen (siempre el mismo origen).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.APE_SPEEDTEST = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /* [2026-11-21 · MEDIDO] Fetch NATIVO capturado en carga, antes de que nadie lo
     * parchee. `ape-runtime-evasion-engine.js` intercepta window.fetch y su
     * `interceptedFetch` SÍ matchea `.m3u8` (isMediaRequest): la sonda entraba en la
     * cadena de reintentos y se comía la ventana. Stack real del operador:
     *     headRtt → interceptedFetch @ ape-runtime-evasion-engine.js:589
     *             → window.fetch @ :938 → net::ERR_FAILED
     * El motor añade además pausa humana aleatoria (25 %, 50-2000 ms) y cooldowns
     * por host: veneno para medir. `opts.fetch` sigue sirviendo para pruebas. */
    var NATIVE_FETCH = (root && typeof root.fetch === 'function') ? root.fetch : null;

    var DEFAULTS = {
        minWindowS: 5,
        maxWindowS: 10,
        stopCvPct: 5,        // CV de los últimos 3 bins por debajo de esto → parada adaptativa
        stopMinS: 3,         // ...y al menos 3 s medidos
        stopBins: 3,
        rampBins: 1,         // descartar el primer bin siempre
        rampBins2: 2,        // y el segundo si hay >= 6 bins
        /* [2026-11-21] 96 MB por stream × 8 streams eran 768 MB por medición: la
         * sonda saturaba el mismo enlace que intenta medir y, con `no-store`,
         * volvía a bajarlo entero en cada ciclo. 24 MB × 8 = 192 MB de techo. */
        maxBytesPerStream: 24 * 1024 * 1024,
        streamsMin: 4,
        streamsMax: 8
    };

    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function r2(v) { return Math.round(v * 100) / 100; }
    function nowMs(opts) {
        if (opts && typeof opts.now === 'function') return opts.now();
        if (root.performance && typeof root.performance.now === 'function') return root.performance.now();
        return Date.now();
    }

    /* N = clamp(hardwareConcurrency / 2, 4, 8) */
    function streamsFor(hc, d) {
        d = d || DEFAULTS;
        var h = Number(hc);
        if (!isNum(h) || h <= 0) h = 8;
        return Math.max(d.streamsMin, Math.min(d.streamsMax, Math.floor(h / 2)));
    }

    function sameOriginPath() {
        try {
            /* [2026-11-20] la sonda es la lista grande del servidor, no el pathname */
        return apeProbeUrl('/lists/streamlink.m3u8');
        } catch (e) { /* noop */ }
        return '/index-v4.html';
    }

    /* URL del mismo origen con cache-buster por stream. */
    function urlFor(base, tag, i) {
        var u = String(base || sameOriginPath());
        return u + (u.indexOf('?') >= 0 ? '&' : '?') + '_ookla=' + tag + '&s=' + i;
    }

    /* Una descarga que va acumulando bytes y se puede cancelar. */
    function openStream(f, url, aborter, budget, onBytes) {
        var ctl = new AbortController();
        var st = { url: url, bytes: 0, done: false, error: null, reader: null };
        /* [2026-11-21 · MEDIDO EN CHROME 157] SIN `Range`. Corrección de la primera
         * hipótesis: en el estándar Fetch `Range` es **safelisted** cuando es un
         * rango simple, así que este header NO rompía el CORS (medido en navegador:
         * GET con `Range: bytes=0-` → 206 OK). Se quita igualmente porque figura en
         * la lista de headers tóxicos del repo y no aporta nada aquí: el presupuesto
         * de bytes ya se aplica cancelando el reader. El preflight real venía de
         * `X-APE-Rtt` en headRtt (ver allí, medido BLOCKED). */
        var opts = { cache: 'no-store', method: 'GET' };
        if (aborter) opts.signal = ctl.signal;
        st.abort = function () { try { ctl.abort(); } catch (e) { /* noop */ } };
        st.promise = Promise.resolve()
            .then(function () { return f(url, opts); })
            .then(function (res) {
                if (!res || res.ok !== true) {
                    st.error = 'HTTP_' + (res ? res.status : 'x');
                    return null;
                }
                if (!res.body || typeof res.body.getReader !== 'function') {
                    st.error = 'NO_STREAM_READER';
                    return null;
                }
                st.reader = res.body.getReader();
                function pump() {
                    return st.reader.read().then(function (chunk) {
                        if (chunk.done) { st.done = true; return; }
                        var n = chunk.value ? chunk.value.length : 0;
                        st.bytes += n;
                        if (onBytes) onBytes(n);
                        if (st.bytes >= budget) {
                            st.done = true;
                            try { st.reader.cancel(); } catch (e) { /* noop */ }
                            return;
                        }
                        return pump();
                    });
                }
                return pump();
            })
            .catch(function (e) {
                if (!st.done) st.error = (e && e.name === 'AbortError') ? 'ABORTED' : ((e && e.message) || 'STREAM_FAILED');
            });
        return st;
    }

    /* RTT de un HEAD al MISMO origen (no a otro host: nada de CORS). */
    function headRtt(f, url, opts) {
        var t0 = nowMs(opts);
        /* Mismo motivo que en openStream: un header propio dispara preflight y el
         * edge contesta 405. `X-APE-Rtt` era el disparador en los HEAD de RTT. */
        return f(url, { method: 'HEAD', cache: 'no-store' })
            .then(function (res) {
                var ms = Math.round(nowMs(opts) - t0);
                if (!res || res.ok !== true) return { ok: false, ms: ms, state: 'HTTP_' + (res ? res.status : 'x') };
                return { ok: true, ms: ms };
            })
            .catch(function (e) { return { ok: false, state: 'RTT_FAILED', reason: (e && e.message) || 'fetch' }; });
    }

    function stats(bins) {
        var n = bins.length;
        if (!n) return { ok: false };
        var sum = 0, i;
        for (i = 0; i < n; i++) sum += bins[i];
        var avg = sum / n;
        var min = Math.min.apply(null, bins);
        var max = Math.max.apply(null, bins);
        var sd = 0;
        for (i = 0; i < n; i++) sd += (bins[i] - avg) * (bins[i] - avg);
        sd = Math.sqrt(sd / n);
        var sorted = bins.slice().sort(function (a, b) { return a - b; });
        var idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
        return { ok: true, avg: avg, min: min, max: max, sd: sd, p95: sorted[idx], cvPct: avg > 0 ? (sd / avg) * 100 : null };
    }

    /* Resume una serie de bins: descarta la rampa y publica las métricas. */
    function summarize(bins, opts) {
        opts = opts || {};
        var d = opts.defaults || DEFAULTS;
        var all = (bins || []).filter(isNum);
        if (!all.length) return { ok: false, state: 'NO_MEASUREMENT', reason: 'sin bins' };
        var activos = all.filter(function (v) { return v > 0; });
        if (!activos.length) {
            return { ok: false, state: 'NO_MEASUREMENT', reason: 'ventana sin bytes: no es 0 Mbps, es que no llegó nada' };
        }
        var drop = Math.min(d.rampBins, Math.max(0, activos.length - 1));
        if (all.length >= 6) drop = Math.min(d.rampBins2, Math.max(0, activos.length - 1));
        var regimen = activos.slice(drop);
        if (!regimen.length) regimen = activos.slice();
        var s = stats(regimen);
        if (!s.ok) return { ok: false, state: 'NO_MEASUREMENT', reason: 'sin bins en régimen' };
        return {
            ok: true,
            state: 'MEASURED',
            mbpsSafe: r2(s.min),
            mbpsP95: r2(s.p95),
            mbpsAvg: r2(s.avg),
            mbpsMax: r2(s.max),
            jitterMbps: r2(s.sd),
            cvPct: s.cvPct === null ? null : r2(s.cvPct),
            bins: all.length,
            binsActivos: activos.length,
            binsRegimen: regimen.length,
            warmupBinsDropped: drop,
            perBinMbps: all.map(r2),
            windowS: all.length
        };
    }

    /* Medición completa. opts: {url, windowS, hardwareConcurrency, fetch, now, binS, defaults}
     * Devuelve {ok, mbpsSafe, mbpsP95, mbpsAvg, jitterMbps, bufferbloatMs, …} */
    function measure(opts) {
        opts = opts || {};
        var d = opts.defaults || DEFAULTS;
        var f = opts.fetch || NATIVE_FETCH || root.fetch;
        if (typeof f !== 'function') {
            return Promise.resolve({ ok: false, state: 'NO_FETCH', reason: 'sin fetch: no se puede medir' });
        }
        if (typeof AbortController !== 'function') {
            return Promise.resolve({ ok: false, state: 'NO_ABORT', reason: 'sin AbortController' });
        }
        var hc = isNum(opts.hardwareConcurrency) ? opts.hardwareConcurrency
            : (root.navigator && isNum(root.navigator.hardwareConcurrency) ? root.navigator.hardwareConcurrency : 8);
        var nStreams = streamsFor(hc, d);
        var base = opts.url || sameOriginPath();
        var tag = String(Math.floor(nowMs(opts))) + '-' + nStreams;   // cache-buster determinista por corrida
        var maxS = Math.max(d.minWindowS, Math.min(d.maxWindowS, Number(opts.windowS) || d.maxWindowS));
        var binS = Number(opts.binS) || 1;
        var budget = nStreams * d.maxBytesPerStream;

        var streams = [];
        var bins = [];
        var binBytes = 0;
        var totalBytes = 0;
        var t0 = nowMs(opts);
        var stopReason = 'cap';
        var timer = null;
        var idleRtt = null;
        var loadRtt = null;

        function onBytes(k) { binBytes += k; totalBytes += k; }

        function startStreams() {
            for (var i = 0; i < nStreams; i++) {
                streams.push(openStream(f, urlFor(base, tag, i), true, d.maxBytesPerStream, onBytes));
            }
        }

        function finish(err) {
            if (timer) { clearInterval(timer); timer = null; }
            streams.forEach(function (s) { s.abort(); });
            var resumen = summarize(bins, { defaults: d });
            var elapsedS = r2((nowMs(opts) - t0) / 1000);
            var out = {
                ok: !!resumen.ok,
                state: resumen.ok ? 'MEASURED' : resumen.state,
                reason: resumen.reason,
                streams: nStreams,
                streamsActive: streams.filter(function (s) { return !s.done && !s.error; }).length,
                streamsBytes: streams.map(function (s) { return s.bytes; }),
                streamsErrors: streams.map(function (s) { return s.error; }).filter(Boolean),
                totalBytes: totalBytes,
                elapsedS: elapsedS,
                stopReason: stopReason,
                bins: resumen.bins || bins.length,
                binsRegimen: resumen.binsRegimen,
                warmupBinsDropped: resumen.warmupBinsDropped,
                perBinMbps: resumen.perBinMbps,
                mbpsSafe: resumen.mbpsSafe, mbpsP95: resumen.mbpsP95, mbpsAvg: resumen.mbpsAvg,
                mbpsMax: resumen.mbpsMax, jitterMbps: resumen.jitterMbps, cvPct: resumen.cvPct,
                rttIdleMs: idleRtt, rttLoadedMs: loadRtt,
                bufferbloatMs: (isNum(idleRtt) && isNum(loadRtt)) ? Math.round(loadRtt - idleRtt) : null,
                windowS: maxS,
                source: 'ookla-multistream'
            };
            if (!resumen.ok) {
                out.ok = false;
                out.state = resumen.state || 'NO_MEASUREMENT';
                out.reason = resumen.reason || (err || 'sin bytes medidos');
            }
            return out;
        }

        /* 1 · RTT en reposo (2 muestras, se queda la menor) */
        return Promise.all([headRtt(f, urlFor(base, tag, 99), opts), headRtt(f, urlFor(base, tag, 98), opts)])
            .then(function (rs) {
                var ok = rs.filter(function (r) { return r && r.ok; }).map(function (r) { return r.ms; });
                idleRtt = ok.length ? Math.min.apply(null, ok) : null;
                return null;
            })
            .then(function () {
                /* 2 · carga multi-stream + bins de 1 s + RTT bajo carga */
                startStreams();
                var binIdx = 0;
                return new Promise(function (resolve) {
                    var loadRttDone = false;
                    timer = setInterval(function () {
                        var elapsed = (nowMs(opts) - t0) / 1000;
                        bins.push(r2((binBytes * 8) / 1e6 / binS));
                        binBytes = 0;
                        binIdx++;
                        /* RTT bajo carga: una sola vez, pasados ~2 bins */
                        if (!loadRttDone && binIdx === 2) {
                            loadRttDone = true;
                            headRtt(f, urlFor(base, tag, 97), opts).then(function (r) {
                                if (r && r.ok) loadRtt = r.ms;
                            });
                        }
                        /* 3 · parada adaptativa */
                        if (elapsed >= d.stopMinS && bins.length >= d.stopBins) {
                            var last = bins.slice(-d.stopBins);
                            var st = stats(last);
                            if (st.ok && st.cvPct !== null && st.cvPct < d.stopCvPct) {
                                stopReason = 'adaptativa';
                                resolve(null);
                                return;
                            }
                        }
                        if (elapsed >= maxS) {
                            stopReason = 'tope';
                            resolve(null);
                        }
                    }, binS * 1000);
                });
            })
            .then(function () { return finish(null); })
            .catch(function (e) { return finish((e && e.message) || 'excepcion'); });
    }

    return {
        DEFAULTS: DEFAULTS,
        streamsFor: streamsFor,
        summarize: summarize,
        urlFor: urlFor,
        measure: measure
    };
});
