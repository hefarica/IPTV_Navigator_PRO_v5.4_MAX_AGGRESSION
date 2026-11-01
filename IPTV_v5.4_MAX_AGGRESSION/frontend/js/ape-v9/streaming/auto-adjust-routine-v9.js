/**
 * APE AUTO-AJUSTAR — medición serial + salida intacta.
 *
 * Regla del propietario:
 *   OUT = lo que pide la imagen/reproducción (bitrate del perfil). NO se baja.
 *   IN  >= OUT × (1 + delta). El delta se paga en entrada/prefetch/buffer.
 *
 * Una sola descarga a la vez. Nunca Promise.all ni sondas paralelas.
 */
(function (global) {
    'use strict';
    var IDS = { out: 'apeAutoAdjustOut' };
    var BUSY = false;
    var VPS_BASE = (global.APE_VPS_BASE || 'https://iptv-ape.duckdns.org').replace(/\/+$/, '');
    var VPS_CONFIG_URL = VPS_BASE + '/prisma/api/ape-output-config.php';

    function el() { return document.getElementById(IDS.out); }
    function status(msg, color) {
        var o = el();
        if (o) { o.textContent = msg; o.style.color = color || '#94a3b8'; }
        console.log('[APE-AUTO]', msg);
    }
    function activeId() {
        try { return global.APE_PROFILES_CONFIG.activeProfileId || 'P3'; } catch (_) { return 'P3'; }
    }
    function profile(id) {
        try { return global.APE_PROFILES_CONFIG.getProfile(id || activeId()); } catch (_) { return null; }
    }
    function deltaFor(id) {
        var arr = global.APE_OUTPUT_DELTA_ARRAY;
        if (arr && typeof arr === 'object' && isFinite(Number(arr[id]))) return Number(arr[id]);
        var v = Number(global.APE_OUTPUT_DELTA_PCT);
        return isFinite(v) && v >= 1 && v <= 90 ? Math.round(v) : 30;
    }
    function profileIds() {
        try {
            return Object.keys(global.APE_PROFILES_CONFIG.profiles || {}).sort();
        } catch (_) { return ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']; }
    }
    function ensureArray(base) {
        var ids = profileIds(), out = {};
        var cur = global.APE_OUTPUT_DELTA_ARRAY;
        ids.forEach(function (id) {
            var v = cur && isFinite(Number(cur[id])) ? Number(cur[id]) : Number(base);
            out[id] = Math.max(1, Math.min(90, Math.round(v || 30)));
        });
        global.APE_OUTPUT_DELTA_ARRAY = out;
        return out;
    }
    function pickChannel() {
        try {
            var st = global.app && global.app.state;
            var ch = st && (st.activeChannel || st.selectedChannel);
            if (ch && ch.url) return ch;
            var arr = global.app && typeof global.app.getFilteredChannels === 'function'
                ? global.app.getFilteredChannels() : [];
            for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].url) return arr[i];
        } catch (_) { }
        return null;
    }
    function candidateUrl() {
        if (global.APE_AUTO_ADJUST_PROBE_URL) return String(global.APE_AUTO_ADJUST_PROBE_URL);
        var ch = pickChannel();
        return ch ? String(ch.url) : '';
    }

    async function fetchText(url, timeoutMs) {
        var ctl = new AbortController();
        var t = setTimeout(function () { ctl.abort(); }, timeoutMs || 12000);
        try {
            var r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
            if (!r.ok) throw new Error('http_' + r.status);
            return await r.text();
        } finally { clearTimeout(t); }
    }
    async function fetchBytes(url, timeoutMs) {
        var ctl = new AbortController();
        var t = setTimeout(function () { ctl.abort(); }, timeoutMs || 12000);
        var t0 = (global.performance && performance.now) ? performance.now() : Date.now();
        try {
            var r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
            if (!r.ok) throw new Error('http_' + r.status);
            var buf = await r.arrayBuffer();
            var t1 = (global.performance && performance.now) ? performance.now() : Date.now();
            return { bytes: buf.byteLength, ms: Math.max(1, t1 - t0) };
        } finally { clearTimeout(t); }
    }

    async function measureSerial() {
        var url = candidateUrl();
        if (!url) throw new Error('sin URL de canal para medir');
        var duration = 6;
        var segmentUrl = url;

        // Playlist primero (una sola descarga); segmento después (una sola).
        if (/\.m3u8(\?|$)/i.test(url)) {
            var pl = await fetchText(url, 12000);
            var durM = pl.match(/#EXTINF:([\d.]+)/);
            if (durM) duration = Math.max(1, Number(durM[1]) || 6);
            var segs = pl.split(/\r?\n/).map(function (x) { return x.trim(); })
                .filter(function (x) { return /^https?:\/\//i.test(x) && /\.(ts|m4s|mp4|aac)(\?|$)/i.test(x); });
            if (segs.length) {
                try { segmentUrl = new URL(segs[0], url).href; } catch (_) { segmentUrl = segs[0]; }
            }
        }
        var got = await fetchBytes(segmentUrl, 15000);
        var mbps = (got.bytes * 8) / (got.ms / 1000) / 1e6;
        if (global.APE_BW && typeof global.APE_BW.sample === 'function') {
            global.APE_BW.sample(got.bytes, got.ms, 'auto-adjust-serial');
        }
        var downloadSec = got.ms / 1000;
        var R = duration / downloadSec;
        global.APE_R_STATE = global.APE_R_STATE || {};
        global.APE_R_STATE.duracionSeg = duration;
        global.APE_R_STATE.segmentos = (global.APE_R_STATE.segmentos || []).concat([{
            duracionSeg: duration, descargaSeg: downloadSec, mbps: mbps
        }]).slice(-20);
        return {
            url: segmentUrl, bytes: got.bytes, ms: got.ms, mbps: mbps,
            durationSec: duration, R: R, source: 'serial'
        };
    }

    async function publishDelta(array) {
        try {
            var r = await fetch(VPS_CONFIG_URL, {
                method: 'POST', mode: 'cors', credentials: 'omit',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({ delta_array: array, delta_pct: array[activeId()], source: 'auto-adjust' })
            });
            var j = await r.json().catch(function () { return {}; });
            return r.ok && j.ok === true;
        } catch (_) { return false; }
    }

    async function apply() {
        if (BUSY) return null;
        BUSY = true;
        var btn = document.getElementById('apeAutoAdjustBtn');
        var old = btn ? btn.disabled : null;
        if (btn) btn.disabled = true;
        try {
            status('Midiendo R serial con la conexión actual…', '#38bdf8');
            var m = await measureSerial();
            var pid = activeId();
            var p = profile(pid);
            var outMbps = Number(p && p.settings && p.settings.bitrate) || 0;
            var delta = deltaFor(pid);
            var required = outMbps * (1 + delta / 100);
            var input = m.mbps;
            var enough = input + 1e-9 >= required;
            var arr = ensureArray(delta);

            // Salida intacta: se prohíbe el fit de bitrate del solver.
            global.APE_SOLVER_PRESERVE_OUTPUT = true;
            global.APE_SOLVER_FIT_BITRATE = false;
            var beforeBr = outMbps;
            var rec = null;
            if (global.ProfileManagerV9 && typeof global.ProfileManagerV9.recomputeActiveProfile === 'function') {
                rec = global.ProfileManagerV9.recomputeActiveProfile();
            }
            var afterBr = Number(p && p.settings && p.settings.bitrate) || 0;
            var outputIntact = Math.abs(afterBr - beforeBr) < 0.05;

            var R = m.R;
            var cls = (global.APE_R && typeof global.APE_R.classify === 'function')
                ? global.APE_R.classify(R) : { band: '—', action: '—' };
            var decision = enough
                ? ('BUFFER OK · R=' + R.toFixed(2) + ' · IN=' + input.toFixed(1) +
                   ' ≥ REQ=' + required.toFixed(1) + ' Mbps · salida ' + afterBr + ' Mbps intacta')
                : ('ENLACE NO ALCANZA · R=' + R.toFixed(2) + ' · IN=' + input.toFixed(1) +
                   ' < REQ=' + required.toFixed(1) + ' Mbps · salida ' + afterBr +
                   ' Mbps intacta; NO se baja la imagen');
            status(decision + ' · ' + cls.band + ' → ' + cls.action,
                enough && outputIntact ? '#22c55e' : '#f59e0b');

            var vpsOk = await publishDelta(arr);
            status(decision + ' · ' + cls.band + ' → ' + cls.action +
                ' · VPS=' + (vpsOk ? 'confirmado' : 'sin confirmar'),
                enough && outputIntact ? '#22c55e' : '#f59e0b');

            return {
                ok: enough && outputIntact, enough: enough, outputIntact: outputIntact,
                R: R, mbps: input, requiredMbps: required, outputMbps: afterBr,
                deltaPct: delta, deltaArray: arr, rec: rec, vps: vpsOk,
                decision: decision
            };
        } catch (e) {
            status('AUTO-AJUSTAR falló: ' + (e && e.message ? e.message : e), '#ef4444');
            return { ok: false, error: (e && e.message) ? e.message : String(e) };
        } finally {
            BUSY = false;
            if (btn) btn.disabled = old === true;
        }
    }

    global.APE_AUTO_ADJUST = {
        apply: apply,
        measureSerial: measureSerial,
        deltaFor: deltaFor,
        activeId: activeId
    };
})(typeof window !== 'undefined' ? window : globalThis);
