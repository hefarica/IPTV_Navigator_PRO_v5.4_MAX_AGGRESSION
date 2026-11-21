#!/usr/bin/env node
/**
 * ape-speed-meter-v9.js — medidor de caudal REAL en Mbps.
 *
 * Metodo (equivalente funcional al de un speedtest, sin copiar SDK ajeno):
 *   1. descarga en PARALELO varios streams de tamano conocido
 *   2. DESCARTA el arranque (TCP slow start): warmupMs
 *   3. mide bytes/tiempo reales sobre la meseta
 *   4. EWMA para estabilidad y PERCENTIL 10 como caudal sostenido (peor caso)
 *   5. Mbps = bytes * 8 / 1e6 / segundos
 *
 * De ahi se derivan los valores dependientes del caudal (buffer, caching, bitrate).
 * Sin dependencias. Funciona en Node 18+ y en navegador (fetch + AbortController).
 */
'use strict';

var DEFAULTS = {
    concurrency: 4,
    durationMs: 4000,
    warmupMs: 600,
    windowMs: 200,
    cacheBuster: true
};

function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

function ewma(series, alpha) {
    if (!series.length) return 0;
    var a = alpha || 0.3, s = series[0];
    for (var i = 1; i < series.length; i++) s = a * series[i] + (1 - a) * s;
    return s;
}

function percentil(series, p) {
    if (!series.length) return 0;
    var s = series.slice().sort(function (a, b) { return a - b; });
    var k = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
    return s[k];
}

function construirUrl(u) {
    try {
        var url = new URL(u, 'http://localhost/');
        url.searchParams.set('_ape_speed', String(Date.now()) + Math.random().toString(36).slice(2, 8));
        return url.toString();
    } catch (e) { return u; }
}

/* Descarga un url hasta que se cumpla el plazo; devuelve las muestras por ventana. */
async function tirarDeUrl(url, opts, muestras, deadline) {
    var ac = new AbortController();
    var stop = setTimeout(function () { try { ac.abort(); } catch (e) { } }, Math.max(100, deadline - now()));
    try {
        var res = await fetch(construirUrl(url), { signal: ac.signal, cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok || !res.body) return;
        var reader = res.body.getReader();
        var t0 = now(), acumulado = 0, marca = t0, bytesVentana = 0;
        for (; ;) {
            var r = await reader.read();
            if (r.done) break;
            var t = now();
            acumulado += r.value.length;
            bytesVentana += r.value.length;
            if (t - marca >= opts.windowMs) {
                muestras.push({ t: t - t0, bytes: bytesVentana, ms: t - marca });
                marca = t; bytesVentana = 0;
            }
            if (t >= deadline) { try { reader.cancel(); } catch (e) { } break; }
        }
        if (bytesVentana > 0) muestras.push({ t: now() - t0, bytes: bytesVentana, ms: Math.max(1, now() - marca) });
    } catch (e) { /* abort esperado al vencer el plazo */ }
    finally { clearTimeout(stop); }
}

async function measure(opciones) {
    var opts = Object.assign({}, DEFAULTS, opciones || {});
    var urls = (opts.urls || []).filter(Boolean);
    if (!urls.length) return { ok: false, motivo: 'sin urls de medida' };

    var t0 = now(), deadline = t0 + Math.max(1000, opts.durationMs);
    var muestras = [];
    var lanzadas = [];
    for (var i = 0; i < Math.max(1, opts.concurrency); i++) {
        lanzadas.push(tirarDeUrl(urls[i % urls.length], opts, muestras, deadline));
    }
    await Promise.all(lanzadas);

    // descartar el arranque
    var utiles = muestras.filter(function (m) { return m.t >= opts.warmupMs && m.ms > 0; });
    if (!utiles.length) utiles = muestras.filter(function (m) { return m.ms > 0; });
    if (!utiles.length) return { ok: false, motivo: 'sin muestras utiles' };

    var ventanasMbps = utiles.map(function (m) { return (m.bytes * 8 / 1e6) / (m.ms / 1000); });
    var totalBytes = 0, totalMs = 0;
    utiles.forEach(function (m) { totalBytes += m.bytes; totalMs += m.ms; });

    var mbps = (totalBytes * 8 / 1e6) / (totalMs / 1000);
    var resultado = {
        ok: true,
        mbps: Number(mbps.toFixed(3)),
        mbps_ewma: Number(ewma(ventanasMbps).toFixed(3)),
        mbps_p10: Number(percentil(ventanasMbps, 10).toFixed(3)),
        muestras: utiles.length,
        bytes: totalBytes,
        ms: Math.round(totalMs),
        ventanas: ventanasMbps.map(function (v) { return Number(v.toFixed(2)); }).slice(0, 40)
    };
    resultado.derivados = derivar(resultado);
    return resultado;
}

/**
 * Valores dependientes del caudal. Se usa el p10 (peor caso sostenido), no la media:
 * dimensionar un buffer con la media es como dimensionar un deposito con el consumo medio.
 */
function derivar(r, minimos) {
    var m = Object.assign({ minSeg: 12, maxSeg: 30, base: 2048, minBufferMs: 15000, maxBitrateKbps: 100000 }, minimos || {});
    var mbps = r && r.mbps_p10 > 0 ? r.mbps_p10 : (r && r.mbps > 0 ? r.mbps : 0);
    if (!mbps) return null;
    var seg = Math.min(m.maxSeg, Math.max(m.minSeg, m.base / mbps));
    var target = Math.round(seg * 1000);
    // min NUNCA puede superar el objetivo; se escala con el
    var minMs = Math.min(m.minBufferMs, Math.round(target * 0.75));
    // bitrate objetivo = 50% del caudal, pero acotado a lo que un canal puede pedir
    var bitrate = Math.round(Math.min(m.maxBitrateKbps, mbps * 1000 * 0.5));
    return {
        mbps_usado: Number(mbps.toFixed(3)),
        buffer_target_ms: target,
        buffer_min_ms: minMs,
        buffer_max_ms: Math.round(target * 2),
        network_caching_ms: Math.round(Math.min(20000, Math.max(3000, target * 0.5))),
        target_bitrate_kbps: bitrate
    };
}

var api = { measure: measure, derivar: derivar, ewma: ewma, percentil: percentil, DEFAULTS: DEFAULTS };
if (typeof window !== 'undefined') { window.APE_SPEEDMETER = api; }
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
