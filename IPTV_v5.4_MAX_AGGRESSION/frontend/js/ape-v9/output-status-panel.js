/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔎 APE Output Status Panel · v2.0.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Matriz visual de las 8 salidas del motor + SONDAS HTTP REALES.
 *
 * v2 (esta versión) corrige cinco defectos medidos en la v1:
 *
 *   D1 · Los ids de canal eran literales (`1174213`, `3`): se probaban canales
 *        que podían no existir en la lista del usuario. Ahora salen de los
 *        canales REALMENTE cargados (`window.app.state`) y la tarjeta dice
 *        cuál probó y por qué.
 *   D2 · La tarjeta JSON usaba `kind:'media'`, así que un JSON correcto se
 *        etiquetaba "el cuerpo no es playlist/DASH". Ahora `kind:'json'` (parse
 *        real) y se prueban los dos URI que el servidor anuncia.
 *   D3 · `BASE` llevaba un host literal. Ahora la base sale de la configuración
 *        del usuario (`window.APE_JIT_BASE`, `localStorage`, campo del panel o
 *        el mismo host que sirve la página); si no hay ninguna, se declara.
 *   D4 · `Range` se pedía a un nombre fijo (`init-0.m4s`) prohibido por
 *        docs/policies/STREAMING_CONTINUITY_LAW.md:28. Ahora se DESCUBRE el
 *        init real en el `#EXT-X-MAP:URI="…"` de la playlist del canal.
 *   D5 · Un estado nunca se pintaba con lo que el servidor había contestado en
 *        cabeceras; ahora cada veredicto lleva su código y su motivo.
 *
 * La tabla de salidas y su clasificación viven en `ape-output-matrix.js`, que es
 * el MISMO módulo que usa el generador para declarar `#EXT-X-APE-OUTPUT-MATRIX`
 * en la lista: lo que la lista promete es lo que aquí se prueba.
 *
 * No modifica generador, VPS ni JIT.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';
    if (window.__APE_OUTPUT_PANEL__) return;
    window.__APE_OUTPUT_PANEL__ = true;

    var M = window.APE_OUTPUT_MATRIX || null;

    var $ = function (sel) { return document.querySelector(sel); };
    var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    var VERSION = '2.0.0';

    /* Lo último que contestó cada salida, para el resumen y para Copiar/Abrir. */
    var LAST = {};

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function verdictOf(name) {
        return (M && M.VERDICT && M.VERDICT[name]) ||
            { color: '#94a3b8', label: String(name || '—') };
    }

    function colour(status) {
        if (status === 'copy') return '#22c55e';
        return verdictOf(status).color;
    }

    function setStatus(id, text, detail) {
        var el = document.querySelector('[data-ape-out-status="' + id + '"]');
        if (!el) return;
        el.textContent = text;
        el.style.color = colour(text);
        el.title = detail || '';
    }

    function setUrlLine(id, text, title) {
        var el = document.querySelector('[data-ape-out-url="' + id + '"]');
        if (!el) return;
        el.textContent = text || '';
        el.title = title || text || '';
    }

    function setWho(id, text) {
        var el = document.querySelector('[data-ape-out-who="' + id + '"]');
        if (!el) return;
        el.textContent = text || '';
        el.title = text || '';
    }

    /* ── base del JIT ─────────────────────────────────────────────────────── */

    function baseInfo() {
        if (!M) return { base: '', ok: false, source: '', reason: 'falta ape-output-matrix.js' };
        return M.resolveBase(window);
    }

    function paintBase(info) {
        var chip = $('#ape-out-base-chip');
        if (chip) {
            chip.textContent = info.ok
                ? 'JIT ' + String(info.base).replace(/^https?:\/\//, '') + ' · ' + info.source
                : 'sin host JIT · define window.APE_JIT_BASE';
            chip.style.color = info.ok ? '#7dd3fc' : '#f59e0b';
            chip.title = info.ok ? ('resuelto desde: ' + info.source) : info.reason;
        }
        var input = $('#ape-out-base');
        if (input && info.ok && !input.value) input.value = info.base;
    }

    /* ── canales reales ───────────────────────────────────────────────────── */

    function stateOf() {
        try { return (window.app && window.app.state) || {}; } catch (e) { return {}; }
    }

    function picked() {
        if (!M) return { total: 0, fourk: null, hd: null, any: null };
        return M.pick(stateOf());
    }

    function paintWho() {
        if (!M) return;
        var p = picked();
        M.ROWS.forEach(function (row) {
            var actx = M.channelFor(row, p);
            if (row.need === 'none') { setWho(row.id, 'lista global · sin canal'); return; }
            if (!actx) { setWho(row.id, 'sin canales cargados'); return; }
            var id = M.channelId(actx.ch) || '?';
            var name = actx.ch.name || actx.ch.title || '';
            setWho(row.id, 'id ' + id + (name ? ' · ' + name : '') + ' · ' + actx.why);
        });
    }

    /* ── pinta las tarjetas ───────────────────────────────────────────────── */

    function render() {
        if ($('#ape-output-matrix')) return;
        if (!M) {
            var el = document.createElement('section');
            el.id = 'ape-output-matrix';
            el.setAttribute('data-ape-out-error', 'missing-matrix-module');
            el.style.cssText = 'margin:14px 0;padding:12px;border:1px solid rgba(239,68,68,.5);border-radius:12px;background:rgba(127,29,29,.25);color:#fca5a5;font-size:.72rem;';
            el.textContent = '⚠️ Falta js/ape-v9/ape-output-matrix.js: el panel no puede saber qué probar.';
            (($('#tab-export') || document.body)).appendChild(el);
            return;
        }

        var tab = $('#tab-export') || $('#exportStatus') || document.body;
        var host = document.createElement('section');
        host.id = 'ape-output-matrix';
        host.style.cssText = 'margin:14px 0 18px;padding:14px;border:1px solid rgba(56,189,248,.38);border-radius:14px;background:linear-gradient(135deg,rgba(14,165,233,.10),rgba(15,23,42,.55));';

        var cards = M.ROWS.map(function (c) {
            return '<div style="background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.22);border-radius:10px;padding:10px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
                '<b style="font-size:.78rem;color:#e2e8f0;">' + esc(c.title) + '</b>' +
                '<span data-ape-out-status="' + esc(c.id) + '" style="font-size:.72rem;font-weight:800;color:#94a3b8;">—</span>' +
              '</div>' +
              '<div style="font-size:.66rem;color:#94a3b8;margin:5px 0;">' + esc(c.sub) + '</div>' +
              '<div data-ape-out-who="' + esc(c.id) + '" style="font-size:.62rem;color:#7dd3fc;margin-bottom:3px;word-break:break-word;"></div>' +
              '<div data-ape-out-url="' + esc(c.id) + '" style="font-size:.62rem;color:#64748b;word-break:break-all;"></div>' +
              '<div style="display:flex;gap:6px;margin-top:8px;">' +
                '<button data-ape-probe="' + esc(c.id) + '" style="background:rgba(14,165,233,.18);color:#7dd3fc;border:1px solid rgba(14,165,233,.45);border-radius:6px;padding:4px 8px;font-size:.62rem;font-weight:700;cursor:pointer;">Probar</button>' +
                '<button data-ape-copy="' + esc(c.id) + '" style="background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.25);border-radius:6px;padding:4px 8px;font-size:.62rem;cursor:pointer;">Copiar</button>' +
                '<button data-ape-open="' + esc(c.id) + '" style="background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.25);border-radius:6px;padding:4px 8px;font-size:.62rem;cursor:pointer;">Abrir</button>' +
              '</div></div>';
        }).join('');

        host.innerHTML =
          '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">' +
            '<div><div style="font-weight:800;color:#7dd3fc;font-size:.85rem;">🔎 Salidas implementadas · prueba real</div>' +
            '<div style="font-size:.68rem;color:#94a3b8;margin-top:4px;">HLS + DASH + CMAF · 4K HDR passthrough · 1080/720/480 → 1080 HDR10</div></div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
              '<span id="ape-out-mode" style="font-size:.64rem;color:#c4b5fd;border:1px solid rgba(139,92,246,.45);border-radius:999px;padding:4px 9px;">modo: —</span>' +
              '<span id="ape-out-base-chip" style="font-size:.64rem;color:#7dd3fc;border:1px solid rgba(14,165,233,.45);border-radius:999px;padding:4px 9px;">JIT —</span>' +
              '<button id="ape-out-probe-all" style="background:rgba(16,185,129,.2);color:#6ee7b7;border:1px solid rgba(16,185,129,.45);border-radius:7px;padding:6px 10px;font-size:.66rem;font-weight:800;cursor:pointer;">Probar todas</button>' +
            '</div></div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">' +
            '<label for="ape-out-base" style="font-size:.62rem;color:#94a3b8;">Host JIT (sale de tu configuración):</label>' +
            '<input id="ape-out-base" type="text" spellcheck="false" placeholder="https://tu-servidor/jit" ' +
              'style="flex:1 1 260px;min-width:200px;background:rgba(2,6,23,.7);border:1px solid rgba(148,163,184,.3);border-radius:6px;padding:5px 8px;color:#e2e8f0;font-size:.66rem;" />' +
            '<button id="ape-out-base-save" style="background:transparent;color:#7dd3fc;border:1px solid rgba(14,165,233,.45);border-radius:6px;padding:5px 9px;font-size:.62rem;cursor:pointer;">Guardar</button>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:12px;">' + cards + '</div>' +
          '<div id="ape-out-summary" style="font-size:.64rem;color:#94a3b8;margin-top:9px;">Los estados — no son éxito: se llenan solo con probes HTTP reales.</div>';

        if (tab.id === 'exportStatus') tab.insertAdjacentElement('beforebegin', host);
        else tab.appendChild(host);

        host.querySelectorAll('[data-ape-probe]').forEach(function (b) {
            b.addEventListener('click', function () { probeById(b.getAttribute('data-ape-probe')); });
        });
        host.querySelectorAll('[data-ape-copy]').forEach(function (b) {
            b.addEventListener('click', function () { copyById(b.getAttribute('data-ape-copy')); });
        });
        host.querySelectorAll('[data-ape-open]').forEach(function (b) {
            b.addEventListener('click', function () {
                var u = (LAST[b.getAttribute('data-ape-open')] || {}).tested;
                if (!u) { setStatus(b.getAttribute('data-ape-open'), 'sin url', 'prueba primero'); return; }
                window.open(u, '_blank', 'noopener');
            });
        });
        var all = $('#ape-out-probe-all');
        if (all) all.addEventListener('click', function () { probeAll(); });

        var save = $('#ape-out-base-save');
        if (save) save.addEventListener('click', function () {
            var input = $('#ape-out-base');
            var v = input ? String(input.value || '').trim() : '';
            try { window.localStorage.setItem('ape_jit_base', v); } catch (e) { }
            window.APE_JIT_BASE = v || undefined;
            paintBase(baseInfo());
            var s = $('#ape-out-summary');
            if (s) s.textContent = v ? ('host guardado: ' + v) : 'host borrado: vuelve a resolverse desde la configuración';
        });

        paintBase(baseInfo());
        paintWho();
        gateInfo();
    }

    /* ── cabecera: modo del motor ─────────────────────────────────────────── */

    function gateInfo() {
        var el = $('#ape-out-mode');
        if (!el) return;
        var direct = false;
        try {
            direct = window.APE_DIRECT_MODE === true ||
                ($('#apeDirectModeToggle') && $('#apeDirectModeToggle').checked);
        } catch (e) { }
        var pub = $('#publicationMode') ? $('#publicationMode').value : 'balanced_95';
        el.textContent = (direct ? 'DIRECTO' : 'VPS') + ' · ' + pub + ' · JIT HLS+DASH';
    }

    /* ── la sonda ─────────────────────────────────────────────────────────── */

    function rowOf(id) {
        if (!M) return null;
        for (var i = 0; i < M.ROWS.length; i++) if (M.ROWS[i].id === id) return M.ROWS[i];
        return null;
    }

    function renderResult(id, r) {
        var v = verdictOf(r.verdict);
        setStatus(id, v.label, (r.tested || '') + ' · ' + (r.reason || ''));
        setUrlLine(id, r.tested ? String(r.tested).replace(/^https?:\/\/[^\/]+/i, '') : '—', r.tested || '');
        LAST[id] = r;
    }

    /* Fetch de las sondas: el del NAVEGADOR, nunca el que parchea el motor de
     * evasión. 'ape-runtime-evasion-engine.js' reemplaza window.fetch y, para
     * cualquier URL con /live/ o .m3u8 (isMediaRequest), reintenta con
     * cabeceras inventadas (Authorization, Via, X-Forwarded-For…). Una cabecera
     * propia vuelve la petición "no simple": el navegador manda un OPTIONS
     * previo y, si el servidor no autoriza esa cabecera, NO deja leer la
     * respuesta. Medido en la consola del operador:
     *   "Request header field x-playback-session-id is not allowed by
     *    Access-Control-Allow-Headers in preflight response" sobre
     *   /jit/live/1174213/master.m3u8.
     * El motor guarda el fetch original en window._APE_ORIGINAL_FETCH /
     * _NATIVE_FETCH. Mismo patrón ya usado por ape-speed-meter-v9.js y
     * bandwidth-meter-v1.js, que se comían la misma cadena de reintentos. */
    function probeFetch() {
        var w = (typeof window !== 'undefined') ? window : {};
        var f = w._APE_ORIGINAL_FETCH || w._NATIVE_FETCH || w.fetch;
        return (typeof f === 'function') ? f.bind(w) : null;
    }

    async function probeOnce(id) {
        var row = rowOf(id);
        if (!row) return { verdict: 'error', reason: 'salida desconocida: ' + id };
        var info = baseInfo();
        paintBase(info);
        paintWho();
        setStatus(id, 'probando', 'consulta HTTP real');
        var r = await M.runRow(row, {
            baseInfo: info,
            state: stateOf(),
            picked: picked(),
            fetch: probeFetch()
        });
        renderResult(id, r);
        return r;
    }

    async function probeById(id) {
        var r = await probeOnce(id);
        resumen();
        return r;
    }

    /* «Probar todas»: secuencial (el proveedor admite 1 conexión; sondear en
     * paralelo provoca PROVIDER_SLOT_BUSY cruzado y estados falsos).
     * Reintenta sólo lo que el propio servidor marcó como transitorio. */
    async function probeAll() {
        if (!M) return;
        var btn = $('#ape-out-probe-all');
        if (btn) { btn.disabled = true; btn.textContent = 'Probando…'; }
        var total = M.ROWS.length;
        for (var i = 0; i < total; i++) {
            var row = M.ROWS[i];
            var s = $('#ape-out-summary');
            if (s) s.textContent = 'probando ' + (i + 1) + '/' + total + ' · ' + row.title;
            var intentos = 2;
            var r = await probeOnce(row.id);
            while ((r.verdict === 'ocupado' || r.verdict === 'timeout') && intentos > 0) {
                intentos--;
                setStatus(row.id, 'reintento', row.title + ' · ' + r.reason);
                await new Promise(function (res) { setTimeout(res, 900); });
                r = await probeOnce(row.id);
            }
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Probar todas'; }
        resumen();
    }

    function resumen() {
        var s = $('#ape-out-summary');
        if (!s) return;
        var cuenta = {}, total = 0, ok = 0;
        M.ROWS.forEach(function (row) {
            var r = LAST[row.id];
            if (!r) return;
            total++;
            cuenta[r.verdict] = (cuenta[r.verdict] || 0) + 1;
            if (r.verdict === 'listo' || r.verdict === 'range_ok') ok++;
        });
        if (!total) return;
        var partes = Object.keys(cuenta).map(function (k) {
            return cuenta[k] + ' ' + (verdictOf(k).label || k);
        });
        s.textContent = ok + '/' + total + ' con respuesta real (' + partes.join(' · ') +
            ') · el resto se queda declarado, no se pinta verde.';
    }

    function copyById(id) {
        var r = LAST[id] || {};
        var u = r.tested || '';
        if (!u) { setStatus(id, 'sin url', 'prueba primero'); return; }
        try { if (navigator.clipboard) navigator.clipboard.writeText(u); } catch (e) { }
        setStatus(id, 'copy', u);
        setTimeout(function () {
            var prev = LAST[id];
            setStatus(id, prev ? verdictOf(prev.verdict).label : '—', u);
        }, 900);
    }

    /* ── arranque ─────────────────────────────────────────────────────────── */

    function boot() {
        render();
        paintWho();
        /* Una sola línea en la consola, a propósito: antes este panel no decía
         * nada y no había manera de saber si se había pintado. Dice el host con
         * el que va a sondear y si tiene el fetch limpio del navegador. */
        try {
            var bi = baseInfo();
            console.info('[APE-OUT] 8 salidas v' + VERSION +
                ' · host: ' + (bi && bi.ok ? bi.base : 'ninguno (' + ((bi && (bi.reason || bi.source)) || '?') + ')') +
                ' · sonda: ' + (probeFetch() ? 'fetch del navegador' : 'sin fetch'));
        } catch (e) { /* un log nunca debe romper la página */ }
        /* La lista puede terminar de cargar después: cuando cambie el estado de
         * canales se vuelve a decir a qué canal apunta cada tarjeta. */
        setInterval(paintWho, 4000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.APE_OUTPUT_PANEL = {
        version: VERSION,
        probe: probeById,
        probeAll: probeAll,
        base: baseInfo,
        rows: function () { return M ? M.ROWS.slice() : []; },
        last: function () { return JSON.parse(JSON.stringify(LAST)); }
    };
})();
