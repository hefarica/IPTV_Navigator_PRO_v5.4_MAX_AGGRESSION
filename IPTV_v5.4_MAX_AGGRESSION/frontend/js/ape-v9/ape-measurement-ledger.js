'use strict';
/**
 * ape-measurement-ledger.js — memoria DURABLE de mediciones y de planes aplicados.
 *
 * POR QUÉ EXISTE
 *   El 2026-11-21 la misma sesión aplicó tres planes distintos en 90 s:
 *   355.5 Mbps (sonda contra loopback: medía el disco), 1.18 Mbps (sonda con pocos
 *   bytes) y 102.53 Mbps (medición real del edge). Cada uno reescribió los 12
 *   perfiles y el anterior se perdió: no quedaba ni el dato ni el cálculo, así que
 *   no se podía auditar por qué un perfil acabó con buffer 32000/0.05x.
 *
 * QUÉ GARANTIZA
 *   - TODA medición se persiste, aceptada o rechazada, con su motivo y su ámbito.
 *   - TODO plan aplicado se persiste con el ANTES y el DESPUÉS de cada perfil.
 *   - El estado del auto-tune (última medición buena + pendientes) sobrevive a la
 *     recarga: la histéresis no se reinicia en cada F5.
 *   - Nunca lanza. Si localStorage falla o está lleno, degrada a memoria y lo dice.
 *
 * API
 *   APE_LEDGER.pushMeasurement(rec)   → true/false
 *   APE_LEDGER.pushPlan(rec)          → true/false
 *   APE_LEDGER.getState() / setState(obj)
 *   APE_LEDGER.lastMeasurement() / lastPlan() / recentMeasurements(n) / recentPlans(n)
 *   APE_LEDGER.scopeOf(url)           → 'loopback' | 'edge' | 'provider' | 'unknown'
 *   APE_LEDGER.export()               → JSON string con todo
 *   APE_LEDGER.importar(json)         → restaura (valida forma)
 *   APE_LEDGER.stats()                → conteos y última actividad
 *   APE_LEDGER.clear()
 *
 * Sin dependencias. Funciona en navegador y en Node (usa un localStorage falso si
 * no hay, para que el test pueda ejercitarlo).
 */
(function (root) {
    var VERSION = 1;
    var KEY = {
        measurements: 'ape_measurements_v1',
        plans: 'ape_autotune_plans_v1',
        state: 'ape_autotune_state_v1'
    };
    var MAX_MEASUREMENTS = 300;   // ~ varias sesiones de sondeos
    var MAX_PLANS = 100;

    var memory = {};              // respaldo si localStorage no está disponible
    var memoriaAvisada = false;

    function nowIso(ts) { return new Date(ts || Date.now()).toISOString(); }

    function store() {
        try { return root.localStorage || null; } catch (e) { return null; }
    }

    function avisarMemoria(motivo) {
        if (memoriaAvisada) return;
        memoriaAvisada = true;
        try {
            if (root.console && console.warn) {
                console.warn('[APE-LEDGER] sin localStorage (' + motivo + '): se guarda en memoria de la pestaña');
            }
        } catch (e) { /* noop */ }
    }

    function getRaw(key) {
        var s = store();
        if (!s) { avisarMemoria('localStorage inaccesible'); return memory[key] === undefined ? null : memory[key]; }
        try { return s.getItem(key); } catch (e) { avisarMemoria('lectura bloqueada'); return null; }
    }

    function setRaw(key, valor) {
        var s = store();
        if (!s) { avisarMemoria('localStorage inaccesible'); memory[key] = valor; return true; }
        try { s.setItem(key, valor); return true; }
        catch (e) { avisarMemoria('cuota o bloqueo'); memory[key] = valor; return false; }
    }

    function readArr(key) {
        var raw = getRaw(key);
        if (!raw) return [];
        try {
            var v = JSON.parse(raw);
            return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
    }

    /* Escribe recortando a `max`. Si la cuota revienta, suelta los más viejos y
       reintenta: es preferible conservar 50 registros recientes que ninguno. */
    function writeArr(key, arr, max) {
        var out = arr.slice(-max);
        while (out.length) {
            var ok = setRaw(key, JSON.stringify(out));
            if (ok) return true;
            out = out.slice(Math.max(1, Math.floor(out.length / 4)));
        }
        return false;
    }

    function push(key, rec, max) {
        var arr = readArr(key);
        arr.push(rec);
        return writeArr(key, arr, max);
    }

    /* Ámbito de una URL de sonda: lo que decide si el número describe el ENLACE o
       el propio disco. Un 355 Mbps medido en loopback no es la capacidad del ISP. */
    function scopeOf(url) {
        var u = String(url || '');
        if (!u) return 'unknown';
        try {
            var h = '';
            if (typeof root.location !== 'undefined' && root.location && root.location.hostname) h = String(root.location.hostname);
            var m = /^https?:\/\/([^\/:?#]+)/i.exec(u);
            var host = m ? m[1].toLowerCase() : (h ? h.toLowerCase() : '');
            if (!host) return 'unknown';
            if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|::1)$/.test(host) || /^(localhost|127\.)/.test(host)) return 'loopback';
            if (h && host === h.toLowerCase()) return 'edge';          // mismo host que la UI
            if (/duckdns\.org|ape\./i.test(host)) return 'edge';
            return 'provider';
        } catch (e) { return 'unknown'; }
    }

    function baseRecord(rec) {
        var ts = (rec && Number(rec.at)) || Date.now();
        return { v: VERSION, at: ts, iso: nowIso(ts) };
    }

    function merge(dst, src) {
        if (!src || typeof src !== 'object') return dst;
        Object.keys(src).forEach(function (k) {
            if (src[k] !== undefined) dst[k] = src[k];
        });
        return dst;
    }

    function pushMeasurement(rec) {
        var out = baseRecord(rec);
        merge(out, rec);
        out.scope = rec && rec.scope ? rec.scope : scopeOf(rec && (rec.probeUrl || rec.url));
        if (out.accepted === undefined) out.accepted = null;   // null = no evaluado
        return push(KEY.measurements, out, MAX_MEASUREMENTS);
    }

    function pushPlan(rec) {
        var out = baseRecord(rec);
        merge(out, rec);
        return push(KEY.plans, out, MAX_PLANS);
    }

    function getState() {
        var raw = getRaw(KEY.state);
        if (!raw) return null;
        try { var v = JSON.parse(raw); return (v && typeof v === 'object') ? v : null; }
        catch (e) { return null; }
    }

    function setState(obj) {
        if (!obj || typeof obj !== 'object') return false;
        var prev = getState() || {};
        var next = merge(merge({ v: VERSION }, prev), obj);
        next.at = Number(obj.at) || Date.now();
        next.iso = nowIso(next.at);
        return setRaw(KEY.state, JSON.stringify(next));
    }

    function lastOf(key) {
        var arr = readArr(key);
        return arr.length ? arr[arr.length - 1] : null;
    }

    function lastMeasurement() { return lastOf(KEY.measurements); }
    function lastPlan() { return lastOf(KEY.plans); }

    function recent(key, n) {
        var arr = readArr(key);
        var k = Math.max(1, Number(n) || 10);
        return arr.slice(-k).reverse();
    }

    function exportar() {
        return JSON.stringify({
            v: VERSION,
            exportedAt: nowIso(),
            measurements: readArr(KEY.measurements),
            plans: readArr(KEY.plans),
            state: getState()
        }, null, 2);
    }

    function importar(json) {
        var data;
        try { data = (typeof json === 'string') ? JSON.parse(json) : json; }
        catch (e) { return { ok: false, reason: 'JSON inválido' }; }
        if (!data || typeof data !== 'object') return { ok: false, reason: 'forma inválida' };
        var ms = Array.isArray(data.measurements) ? data.measurements : null;
        var ps = Array.isArray(data.plans) ? data.plans : null;
        if (!ms && !ps) return { ok: false, reason: 'sin measurements ni plans' };
        if (ms) writeArr(KEY.measurements, ms, MAX_MEASUREMENTS);
        if (ps) writeArr(KEY.plans, ps, MAX_PLANS);
        if (data.state && typeof data.state === 'object') setState(data.state);
        return { ok: true, measurements: ms ? ms.length : 0, plans: ps ? ps.length : 0 };
    }

    function stats() {
        var ms = readArr(KEY.measurements);
        var ps = readArr(KEY.plans);
        var ultima = ms.length ? ms[ms.length - 1] : null;
        var aceptadas = ms.filter(function (m) { return m && m.accepted === true; }).length;
        return {
            mediciones: ms.length,
            aceptadas: aceptadas,
            rechazadas: ms.filter(function (m) { return m && m.accepted === false; }).length,
            planes: ps.length,
            ultimaMedicionAt: ultima ? ultima.iso : null,
            ultimaMedicionMbps: ultima && Number(ultima.mbpsSafe) ? Number(ultima.mbpsSafe) : null,
            ultimaMedicionScope: ultima ? ultima.scope : null,
            estado: getState()
        };
    }

    function clear() {
        var s = store();
        var keys = [KEY.measurements, KEY.plans, KEY.state];
        keys.forEach(function (k) {
            try { if (s) s.removeItem(k); } catch (e) { /* noop */ }
            delete memory[k];
        });
        return true;
    }

    var api = {
        VERSION: VERSION,
        KEY: KEY,
        MAX_MEASUREMENTS: MAX_MEASUREMENTS,
        MAX_PLANS: MAX_PLANS,
        pushMeasurement: pushMeasurement,
        pushPlan: pushPlan,
        getState: getState,
        setState: setState,
        lastMeasurement: lastMeasurement,
        lastPlan: lastPlan,
        recentMeasurements: function (n) { return recent(KEY.measurements, n); },
        recentPlans: function (n) { return recent(KEY.plans, n); },
        scopeOf: scopeOf,
        export: exportar,
        importar: importar,
        stats: stats,
        clear: clear
    };

    root.APE_LEDGER = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
