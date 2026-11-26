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

    /* Base del PROPIO script. El mismo relativo '../../probe-8mb.bin' resuelve a
     * la raiz del sitio en el VPS (https://<host>/probe-8mb.bin) y a frontend/ en
     * local (.../frontend/probe-8mb.bin). Resolver contra location.origin daba
     * 404 en los dos layouts (medido: GET /probe-8mb.bin 404). */
    function baseDelScript() {
        try {
            if (typeof document === 'undefined') return '';
            var s = document.currentScript;
            if (!s || !s.src) {
                var ls = document.getElementsByTagName('script');
                for (var i = ls.length - 1; i >= 0; i--) {
                    if (ls[i].src && /ape-speedmeter-bridge\.js(\?|$)/.test(ls[i].src)) { s = ls[i]; break; }
                }
            }
            return (s && s.src) ? s.src : '';
        } catch (e) { return ''; }
    }

    function urlsPorDefecto() {
        // Preferencia: activos de tamano conocido servidos por el propio sitio.
        if (root.APE_SPEEDTEST_URLS && root.APE_SPEEDTEST_URLS.length) return root.APE_SPEEDTEST_URLS.slice();
        var baseScript = baseDelScript();
        /* [2026-11-21 · MEDIDO] La base del SCRIPT y la base de la PAGINA viven en
         * directorios DISTINTOS: el script en js/ape-v9/, la pagina en frontend/.
         * Resolver el MISMO relativo contra las dos da 404 en una de ellas. Caso real
         * del operador: la pestaña resolvio '../../probe-8mb.bin' contra
         * location.href (frontend/index-v4.html) y pidio la raiz del sitio
         * (probe-8mb.bin) → 404, tal cual aparece en la consola. Cada base usa SU
         * propio relativo. */
        function desdeScript(rel) {
            try { if (baseScript) return new URL(rel, baseScript).toString(); } catch (e) { }
            return '';
        }
        function desdePagina(rel) {
            try {
                if (typeof location !== 'undefined' && location.href) return new URL(rel, location.href).toString();
            } catch (e) { }
            return '';
        }
        var cands = [];
        var sonda = baseScript ? desdeScript('../../probe-8mb.bin') : desdePagina('probe-8mb.bin');
        if (sonda) cands.push(sonda);
        // Respaldo: un asset JS grande del propio paquete (siempre same-origin).
        var respaldo = baseScript
            ? desdeScript('m3u8-typed-arrays-ultimate.js')
            : desdePagina('js/ape-v9/m3u8-typed-arrays-ultimate.js');
        if (respaldo) cands.push(respaldo);
        return cands;
    }

    function ledger() {
        return (root.APE_LEDGER && typeof root.APE_LEDGER.pushMeasurement === 'function') ? root.APE_LEDGER : null;
    }

    /* Medición del EDGE por la vía correcta: multiconexión tipo Ookla contra
       /lists/*, que es el único asset CORS-legible del servidor (medido). */
    async function medirConOokla(opciones) {
        var ST = root.APE_SPEEDTEST;
        if (!ST || typeof ST.measure !== 'function') return null;
        try {
            var out = await ST.measure({ windowS: (opciones && opciones.windowS) || 6 });
            if (!out || out.ok !== true || !(Number(out.mbpsSafe) > 0)) return null;
            return {
                ok: true,
                mbps: Number(out.mbpsSafe),
                mbps_p10: Number(out.mbpsSafe),
                mbps_ewma: Number(out.mbpsAvg),
                muestras: Number(out.binsRegimen || out.bins) || 0,
                bytes: Number(out.totalBytes) || 0,
                source: 'ookla-multistream',
                url: 'https://iptv-ape.duckdns.org/lists/streamlink.m3u8'
            };
        } catch (e) { return null; }
    }

    async function medir(opciones) {
        var L = ledger();
        /* [2026-11-21 · MEDIDO] ORDEN CORREGIDO. Primero el EDGE. La sonda de 8 MB
         * del dev server corre contra 127.0.0.1, así que mide LOOPBACK: en la sesión
         * real publicó 355.5 Mbps de disco y el auto-tune lo tomó como enlace
         * (ratios 20x). Queda sólo como respaldo cuando el edge no responde. */
        var edge = await medirConOokla(opciones);
        if (edge) {
            edge.scope = L ? L.scopeOf(edge.url) : 'edge';
            return edge;
        }

        var M = meter();
        if (!M || typeof M.measure !== 'function') {
            return { ok: false, motivo: 'APE_SPEEDMETER no cargado', scope: 'unknown' };
        }
        var urls = (opciones && opciones.urls) || urlsPorDefecto();
        if (!urls.length) return { ok: false, motivo: 'sin URLs de medida', scope: 'unknown' };
        var r = await M.measure({
            urls: urls,
            concurrency: (opciones && opciones.concurrency) || 4,
            durationMs: (opciones && opciones.durationMs) || 4000,
            warmupMs: (opciones && opciones.warmupMs) || 600
        });
        if (r && typeof r === 'object') {
            r.url = urls[0];
            r.scope = L ? L.scopeOf(urls[0]) : 'unknown';
            if (!r.source) r.source = 'ape-speed-meter-v9';
        }
        return r;
    }

    async function aplicar(alcance, medido) {
        var M = meter(), P = pm(), L = ledger();
        var recibos = { alcance: alcance || 'todos', aplicado: [], omitido: [] };
        if (!medido || !medido.ok) {
            recibos.omitido.push('medicion no valida' + ((medido && (medido.motivo || medido.state)) ? ': ' + (medido.motivo || medido.state) : ''));
            return recibos;
        }
        /* [2026-11-21 · MEDIDO] Un número medido en loopback describe el DISCO, no el
         * enlace. La sesión real publicó 355.5 Mbps así y el auto-tune lo aplicó como
         * 20x de headroom. Se rechaza y se nombra la causa. */
        var ambito = medido.scope || (L ? L.scopeOf(medido.url) : 'unknown');
        if (ambito === 'loopback') {
            recibos.omitido.push('medición contra loopback (' + (medido.url || 'sin url') + '): mide el disco, no el enlace');
            return recibos;
        }
        recibos.scope = ambito;

        var mbps = medido.mbps_p10 > 0 ? medido.mbps_p10 : medido.mbps;
        recibos.mbps = mbps;

        /* [2026-11-21] PROCEDENCIA EXPLICITA. El gate de `_applyAutoTune` exige
         * saber DE DÓNDE viene el número. Antes se enviaba `{measurement:{mbpsSafe}}`
         * —un objeto anónimo que el gate no podía distinguir de un artefacto del
         * sampler pasivo—. Ahora se declara la sonda real con sus muestras. */
        var procedencia = {
            ok: true,
            probe: { bytes: Number(medido.bytes) || 0, source: 'ape-speed-meter-v9' },
            measurement: {
                state: 'MEASURED',
                mbpsSafe: mbps,
                mbpsAvg: medido.mbps_ewma,
                bins: Number(medido.muestras) || 0,
                binsActivos: Number(medido.muestras) || 0,
                bytes: Number(medido.bytes) || 0,
                source: 'ape-speed-meter-v9'
            }
        };

        if (!alcance || alcance === 'todos') {
            if (!P || typeof P._applyAutoTune !== 'function') {
                recibos.omitido.push('ProfileManagerV9._applyAutoTune no disponible');
                return recibos;
            }
            var r = P._applyAutoTune(procedencia) || null;
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
        /* [2026-11-21 · LEY ANTI-DEGRADACIÓN] NO se escribe X-APE-TARGET-BITRATE.
         * Ese header declara el bitrate del VÍDEO, no la capacidad del enlace. Un
         * caudal medido bajo (0.2 Mbps) escribía 100 kbps de techo y hacía imposible
         * el 4K: degradar calidad para tapar un síntoma de transporte está prohibido
         * (docs/policies/ANTI_DEGRADATION_LAW.md). El enlace lento se corrige con
         * buffer/caching/timeout —que ya se escriben arriba—, nunca recortando imagen. */
        recibos.omitido.push('X-APE-TARGET-BITRATE: no se deriva del caudal medido (ley anti-degradación)');
        recibos.aplicado.push({ perfil: alcance, valores: d });
        return recibos;
    }

    async function apeAutoAdjustWithSpeedtest(opciones) {
        var o = opciones || {};
        var L = ledger();
        var medido = await medir(o);
        var recibo = await aplicar(o.alcance || 'todos', medido);
        recibo.medicion = medido;

        /* [2026-11-21 · ENCARGO] NADA se pierde: TODA ejecución deja rastro durable,
         * aceptada o rechazada, con su número, su ámbito y su motivo. El plan
         * aplicado lo persiste `_applyAutoTune` (única fuente, cubre las dos vías). */
        if (L) {
            try {
                var mb = medido && (Number(medido.mbps_p10) > 0 ? Number(medido.mbps_p10) : Number(medido.mbps));
                L.pushMeasurement({
                    mbpsSafe: (isFinite(Number(mb)) && Number(mb) > 0) ? Number(mb) : null,
                    mbpsAvg: (medido && isFinite(Number(medido.mbps_ewma))) ? Number(medido.mbps_ewma) : null,
                    bytes: (medido && Number(medido.bytes)) || 0,
                    muestras: (medido && Number(medido.muestras)) || 0,
                    source: (medido && medido.source) || 'ape-speed-meter-v9',
                    probeUrl: (medido && medido.url) || '',
                    scope: (recibo && recibo.scope) || (medido && medido.scope) || 'unknown',
                    accepted: !!(recibo && recibo.aplicado && recibo.aplicado.length),
                    reason: (recibo && recibo.omitido && recibo.omitido.length) ? recibo.omitido.join(' | ') : null,
                    alcance: (recibo && recibo.alcance) || null
                });
            } catch (e) { /* el ledger NUNCA rompe la medición */ }
        }
        return recibo;
    }

    root.apeAutoAdjustWithSpeedtest = apeAutoAdjustWithSpeedtest;
    if (typeof module !== 'undefined' && module.exports) module.exports = { apeAutoAdjustWithSpeedtest: apeAutoAdjustWithSpeedtest };
})();
