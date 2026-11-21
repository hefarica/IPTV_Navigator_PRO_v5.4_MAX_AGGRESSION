'use strict';
/**
 * ape-speedmeter-bridge.js — alimenta el auto-ajuste EXISTENTE con una medicion REAL.
 *
 * No reimplementa nada: usa
 *   - window.APE_SPEEDMETER.measure()  -> caudal real en Mbps (paralelo, EWMA, p10)
 *   - ProfileManagerV9._applyAutoTune() -> aplica a los 12 perfiles (ya existia)
 *   - window.APE_SPEEDMETER.derivar()   -> valores por perfil para el modo "uno solo"
 *
 * Expone:
 *   window.apeAutoAdjustWithSpeedtest({ alcance: 'todos' | 'P1', urls: [...], concurrency, durationMs })
 *
 * Devuelve un recibo con lo medido y lo aplicado. Si falta una pieza, lo dice y NO inventa.
 */
(function () {
    var root = (typeof window !== 'undefined') ? window : globalThis;

    function pm() {
        return root.ProfileManagerV9
            || (root.app && root.app.profileManager)
            || null;
    }

    function meter() { return root.APE_SPEEDMETER || null; }

    function urlsPorDefecto() {
        // Preferencia: activos de tamano conocido servidos por el propio sitio.
        var base = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
        var cands = [];
        if (root.APE_SPEEDTEST_URLS && root.APE_SPEEDTEST_URLS.length) return root.APE_SPEEDTEST_URLS.slice();
        if (base) {
            cands.push(base + '/probe-8mb.bin');
            cands.push(base + '/js/ape-v9/m3u8-typed-arrays-ultimate.js');
        }
        return cands;
    }

    async function medir(opciones) {
        var M = meter();
        if (!M || typeof M.measure !== 'function') {
            return { ok: false, motivo: 'APE_SPEEDMETER no cargado' };
        }
        var urls = (opciones && opciones.urls) || urlsPorDefecto();
        if (!urls.length) return { ok: false, motivo: 'sin URLs de medida' };
        var r = await M.measure({
            urls: urls,
            concurrency: (opciones && opciones.concurrency) || 4,
            durationMs: (opciones && opciones.durationMs) || 4000,
            warmupMs: (opciones && opciones.warmupMs) || 600
        });
        return r;
    }

    async function aplicar(alcance, medido) {
        var M = meter(), P = pm();
        var recibos = { alcance: alcance || 'todos', aplicado: [], omitido: [] };
        if (!medido || !medido.ok) { recibos.omitido.push('medicion no valida'); return recibos; }

        var mbps = medido.mbps_p10 > 0 ? medido.mbps_p10 : medido.mbps;
        recibos.mbps = mbps;

        if (!alcance || alcance === 'todos') {
            if (!P || typeof P._applyAutoTune !== 'function') {
                recibos.omitido.push('ProfileManagerV9._applyAutoTune no disponible');
                return recibos;
            }
            var r = P._applyAutoTune({ measurement: { mbpsSafe: mbps } }) || null;
            recibos.aplicado.push({ perfiles: 'todos', resultado: r });
            return recibos;
        }

        // Un solo perfil: se derivan sus valores y se escriben en el SSOT.
        var d = M.derivar(medido);
        if (!d) { recibos.omitido.push('derivados no computables'); return recibos; }
        if (!P || !P.config || typeof P.config.getProfile !== 'function') {
            recibos.omitido.push('config.getProfile no disponible');
            return recibos;
        }
        var p = P.config.getProfile(alcance);
        if (!p) { recibos.omitido.push('perfil ' + alcance + ' inexistente'); return recibos; }
        if (!p.headerOverrides || typeof p.headerOverrides !== 'object') p.headerOverrides = {};
        p.headerOverrides['X-Buffer-Target'] = String(d.buffer_target_ms);
        p.headerOverrides['X-Buffer-Min'] = String(d.buffer_min_ms);
        p.headerOverrides['X-Buffer-Max'] = String(d.buffer_max_ms);
        p.headerOverrides['X-Network-Caching'] = String(d.network_caching_ms);
        p.headerOverrides['X-APE-TARGET-BITRATE'] = String(d.target_bitrate_kbps);
        recibos.aplicado.push({ perfil: alcance, valores: d });
        return recibos;
    }

    async function apeAutoAdjustWithSpeedtest(opciones) {
        var o = opciones || {};
        var medido = await medir(o);
        var recibo = await aplicar(o.alcance || 'todos', medido);
        recibo.medicion = medido;
        return recibo;
    }

    root.apeAutoAdjustWithSpeedtest = apeAutoAdjustWithSpeedtest;
    if (typeof module !== 'undefined' && module.exports) module.exports = { apeAutoAdjustWithSpeedtest: apeAutoAdjustWithSpeedtest };
})();
