/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🪦 OMEGA SLOT REAPER v2.0 — Connection-budget aware, single-flight
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUISITO USUARIO 2026-04-09: "CUANDO GENERE LISTAS, QUE TUMBE LAS CONEXIONES VIGENTES"
 *
 * Causa raíz del 403 que motiva este módulo:
 *   El proveedor IPTV (Xtream Codes) puede tener `max_connections=1`. Cuando
 *   el reproductor abre la lista, satura el slot y NGINX devuelve 406/403.
 *
 * v2.0 — correcciones sobre v1.0:
 *   1. SINGLE-FLIGHT: dos llamadas simultáneas para el mismo servidor comparten
 *      la misma promesa. Antes, dos clics podían lanzar dos reapers y duplicar
 *      las conexiones.
 *   2. CERO BURST PARALELO: v1.0 hacía Promise.all de 3 HEAD. Con max_connections=1
 *      eso creaba 3 conexiones y empeoraba el 403 que decía resolver. Ahora el
 *      burst es secuencial, con delay, y sólo si max_connections > 1.
 *   3. TIMEOUT REAL: fetchSlotState usa AbortController y no deja sockets colgados.
 *   4. DIAGNÓSTICO HONESTO: devuelve códigos SLOT_* y active/max; no inventa
 *      códigos del proveedor.
 *
 * API: window.OmegaSlotReaper.reap(server, options)
 *
 * Doctrina OMEGA-NO-DELETE: este módulo conserva la API pública v1.0 y sólo
 * endurece el comportamiento. No elimina llamadas existentes.
 */
(function() {
    'use strict';

    var VERSION = '2.0.0';
    var _inflight = new Map();

    function _num(value, fallback) {
        var n = parseInt(value, 10);
        return Number.isFinite(n) ? n : fallback;
    }

    function _serverKey(server) {
        server = server || {};
        return String(server.id || server.baseUrl || server.url || server.name || 'unknown');
    }

    function _apiUrl(server) {
        var baseUrl = String(server.baseUrl || server.url || '').replace(/\/+$/, '');
        var user = encodeURIComponent(server.username || server.user || '');
        var pass = encodeURIComponent(server.password || server.pass || '');
        if (!baseUrl || !user || !pass) return '';
        return baseUrl + '/player_api.php?username=' + user + '&password=' + pass + '&_t=' + Date.now();
    }

    function _sleep(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    async function _fetchJson(url, timeoutMs) {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 5000);
        try {
            var resp = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'omit',
                keepalive: false,
                redirect: 'follow',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            if (!resp.ok) return { ok: false, status: resp.status };
            return { ok: true, status: resp.status, data: await resp.json() };
        } catch (e) {
            return { ok: false, status: 0, error: e && e.message ? e.message : String(e) };
        } finally {
            clearTimeout(timer);
        }
    }

    async function _headClose(url) {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, 5000);
        try {
            await fetch(url, {
                method: 'HEAD',
                cache: 'no-store',
                credentials: 'omit',
                keepalive: false,
                redirect: 'manual',
                headers: { 'Connection': 'close' },
                signal: controller.signal
            });
        } catch (_) {
            // HEAD puede fallar por CORS o por bloqueo del proveedor. No es fatal.
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Lee el estado actual de conexiones del servidor Xtream Codes.
     * @param {Object} server - { baseUrl, username, password }
     * @returns {Promise<{active:number,max:number,raw:object}|null>}
     */
    async function fetchSlotState(server) {
        var url = _apiUrl(server || {});
        if (!url) return null;
        var result = await _fetchJson(url, 5000);
        if (!result.ok || !result.data) return null;
        var ui = result.data.user_info;
        if (!ui) return null;
        return {
            active: Math.max(0, _num(ui.active_cons, 0)),
            max: Math.max(1, _num(ui.max_connections, 1)),
            raw: result.data
        };
    }

    /**
     * Burst secuencial de HEAD con Connection: close.
     * NUNCA en paralelo: con max_connections=1 cada HEAD extra es un 403 extra.
     */
    async function burstReapNginxSlots(server, burstSize, maxConnections) {
        var max = Math.max(1, _num(maxConnections, 1));
        if (max <= 1) return { sent: 0, skipped: 'single_slot' };

        var requested = Math.max(1, _num(burstSize, 1));
        var safe = Math.min(requested, Math.max(0, max - 1), 4);
        if (safe <= 0) return { sent: 0, skipped: 'no_spare_slot' };

        var baseUrl = String(server.baseUrl || server.url || '').replace(/\/+$/, '');
        var user = encodeURIComponent(server.username || server.user || '');
        var pass = encodeURIComponent(server.password || server.pass || '');
        var apiUrl = baseUrl + '/player_api.php?username=' + user + '&password=' + pass + '&_t=' + Date.now();

        var sent = 0;
        for (var i = 0; i < safe; i++) {
            await _headClose(apiUrl + '_burst' + i);
            sent++;
            await _sleep(250);
        }
        return { sent: sent, skipped: null };
    }

    /**
     * Reaper principal. Espera hasta que `active_cons` llegue a `targetActive`
     * (por defecto 0) o hasta que venza el timeout.
     *
     * @param {Object} server
     * @param {Object} options - { maxWaitMs, pollIntervalMs, burstReap, burstSize, targetActive, onProgress }
     * @returns {Promise<{ok:boolean,code:string,reason:string,active?:number,max?:number,waitedMs?:number}>}
     */
    async function _reap(server, options) {
        options = options || {};
        var maxWaitMs = Math.max(1000, _num(options.maxWaitMs, 60000));
        var pollIntervalMs = Math.max(500, _num(options.pollIntervalMs, 3000));
        var targetActive = Math.max(0, _num(options.targetActive, 0));
        var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function() {};

        var initial = await fetchSlotState(server);
        if (!initial) {
            onProgress({ stage: 'error', error: 'API unreachable or no user_info' });
            return { ok: false, code: 'SLOT_API_UNREACHABLE', reason: 'api_unreachable' };
        }

        onProgress({ stage: 'check', active: initial.active, max: initial.max });

        if (initial.active <= targetActive) {
            return {
                ok: true,
                code: 'SLOT_CLEAR',
                reason: 'already_clear',
                active: initial.active,
                max: initial.max,
                waitedMs: 0
            };
        }

        // Sólo tiene sentido "persuadir" a NGINX si hay más de un slot.
        if (options.burstReap === true && initial.max > 1) {
            onProgress({ stage: 'reap_burst', count: Math.min(_num(options.burstSize, 1), initial.max - 1) });
            var burst = await burstReapNginxSlots(server, options.burstSize, initial.max);
            onProgress({ stage: 'reap_burst_done', sent: burst.sent, skipped: burst.skipped });
        } else if (options.burstReap === true && initial.max <= 1) {
            onProgress({ stage: 'reap_burst_skipped', reason: 'single_slot' });
        }

        var startedAt = Date.now();
        var activeConn = initial.active;
        var maxConn = initial.max;

        while (Date.now() - startedAt < maxWaitMs) {
            await _sleep(pollIntervalMs);
            var refresh = await fetchSlotState(server);
            if (refresh) {
                activeConn = refresh.active;
                maxConn = refresh.max;
                var elapsed = Math.floor((Date.now() - startedAt) / 1000);
                onProgress({ stage: 'poll', active: activeConn, max: maxConn, elapsedSec: elapsed });
                if (activeConn <= targetActive) {
                    return {
                        ok: true,
                        code: 'SLOT_REAPED',
                        reason: 'reaped',
                        active: activeConn,
                        max: maxConn,
                        waitedMs: Date.now() - startedAt
                    };
                }
            }
        }

        return {
            ok: false,
            code: 'SLOT_TIMEOUT',
            reason: 'timeout',
            active: activeConn,
            max: maxConn,
            waitedMs: maxWaitMs
        };
    }

    /**
     * Single-flight: dos llamadas concurrentes para el mismo servidor comparten
     * la misma promesa. Evita que dos clics dupliquen las conexiones.
     */
    async function reap(server, options) {
        var key = _serverKey(server);
        if (_inflight.has(key)) return _inflight.get(key);
        var promise = _reap(server, options).finally(function() {
            _inflight.delete(key);
        });
        _inflight.set(key, promise);
        return promise;
    }

    /**
     * Reap multi-server con concurrencia acotada. Por defecto 1: si el proveedor
     * tiene max_connections=1, abrir varios servidores en paralelo también es
     * una mala idea.
     */
    async function reapAll(servers, options) {
        options = options || {};
        var concurrency = Math.max(1, _num(options.concurrency, 1));
        var list = Array.isArray(servers) ? servers : [];
        var queue = list.slice();
        var results = [];

        async function worker() {
            while (queue.length) {
                var srv = queue.shift();
                try {
                    results.push({ server: srv, result: await reap(srv, options) });
                } catch (e) {
                    results.push({ server: srv, result: { ok: false, code: 'SLOT_ERROR', error: e && e.message } });
                }
            }
        }

        await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, list.length)) }, worker));
        return results;
    }

    function diagnose(result) {
        result = result || {};
        if (result.code === 'SLOT_CLEAR') return 'Slot libre: no hay conexiones activas.';
        if (result.code === 'SLOT_REAPED') return 'Slot liberado tras esperar al proveedor.';
        if (result.code === 'SLOT_API_UNREACHABLE') return 'No se pudo leer player_api.php. Revisa URL/credenciales o CORS.';
        if (result.code === 'SLOT_TIMEOUT') {
            return 'El proveedor sigue con ' + (result.active != null ? result.active : '?') + '/' +
                (result.max != null ? result.max : '?') + ' conexiones activas. ' +
                'Cierra el player u otro dispositivo y reintenta.';
        }
        return 'Estado de slot desconocido.';
    }

    window.OmegaSlotReaper = {
        version: VERSION,
        reap: reap,
        reapAll: reapAll,
        fetchSlotState: fetchSlotState,
        diagnose: diagnose
    };

    console.log('🪦 [OmegaSlotReaper v' + VERSION + '] single-flight · sin burst en max_connections=1');
})();
