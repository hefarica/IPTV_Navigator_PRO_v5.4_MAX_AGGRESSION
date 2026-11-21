/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🪦 OMEGA SLOT REAPER v1.0 — Pre-flight connection slot liberator
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUISITO USUARIO 2026-04-09: "CUANDO GENERE LISTAS, QUE TUMBE LAS CONEXIONES VIGENTES"
 *
 * Causa raíz del 403 que motiva este módulo:
 *   El proveedor IPTV (Xtream Codes) tiene `max_connections=1` (cuenta trial). Cuando
 *   el reproductor abre la lista, satura el slot inmediatamente y NGINX devuelve 406/403.
 *   Este módulo se ejecuta ANTES de generar la lista, leyendo el `player_api.php` para
 *   verificar `active_cons` y forzando un cycle de conexión vía `Connection: close`
 *   para liberar slots zombie.
 *
 * Investigación previa (verificada con curl real):
 *   - Xtream Codes NO expone acción pública `force_logout` (todas las acciones devuelven
 *     el mismo `user_info` JSON, ignoran el parámetro action).
 *   - `panel_api.php` requiere admin del panel — no accesible al usuario.
 *   - `c/api.php?action=disconnect` no existe en este panel.
 *   - HEAD con `Connection: close` SÍ persuade al NGINX a ciclar las conexiones.
 *
 * API: window.OmegaSlotReaper.reap(server, options)
 *
 * Doctrina OMEGA-NO-DELETE: este módulo solo AÑADE comportamiento. No elimina nada.
 */

(function() {
    'use strict';

    /**
     * Lee el estado actual de conexiones del servidor Xtream Codes.
     * @param {Object} server - { baseUrl, username, password }
     * @returns {Promise<{active: number, max: number, raw: object}|null>}
     */
    async function fetchSlotState(server) {
        const baseUrl = (server.baseUrl || server.url || '').replace(/\/+$/, '');
        const user    = encodeURIComponent(server.username || server.user || '');
        const pass    = encodeURIComponent(server.password || server.pass || '');

        if (!baseUrl || !user || !pass) {
            return null;
        }

        const apiUrl = `${baseUrl}/player_api.php?username=${user}&password=${pass}&_t=${Date.now()}`;

        try {
            const resp = await fetch(apiUrl, { cache: 'no-store' });
            if (!resp.ok) return null;
            const data = await resp.json();
            const ui = data && data.user_info;
            if (!ui) return null;
            return {
                active: parseInt(ui.active_cons || '0', 10),
                max:    parseInt(ui.max_connections || '1', 10),
                raw:    data
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Burst de HEAD requests con Connection: close para forzar cycle del NGINX.
     * No es destructivo: hace requests al propio API endpoint con la cuenta del usuario.
     */
    async function burstReapNginxSlots(server, burstSize) {
        const baseUrl = (server.baseUrl || server.url || '').replace(/\/+$/, '');
        const user    = encodeURIComponent(server.username || server.user || '');
        const pass    = encodeURIComponent(server.password || server.pass || '');
        const apiUrl  = `${baseUrl}/player_api.php?username=${user}&password=${pass}&_t=${Date.now()}`;

        const promises = Array.from({ length: burstSize }, () =>
            fetch(apiUrl + '_burst' + Math.random(), {
                method:    'HEAD',
                headers:   { 'Connection': 'close' },
                cache:     'no-store',
                keepalive: false
            }).catch(() => null)
        );
        await Promise.all(promises);
    }

    /**
     * Reaper principal. Espera hasta que `active_cons` llegue a 0 (o timeout).
     *
     * @param {Object}   server   - { baseUrl, username, password, name? }
     * @param {Object}   options  - { maxWaitMs, pollIntervalMs, burstReap, burstSize, onProgress }
     * @returns {Promise<{ok:boolean, reason:string, active?:number, max?:number, waitedMs?:number}>}
     */
    async function reap(server, options) {
        options = options || {};
        const maxWaitMs      = options.maxWaitMs      || 60000;
        const pollIntervalMs = options.pollIntervalMs || 3000;
        const burstReap      = options.burstReap      !== false;
        const burstSize      = options.burstSize      || 3;
        const onProgress     = typeof options.onProgress === 'function' ? options.onProgress : function(){};

        // Step 1: estado inicial
        const initial = await fetchSlotState(server);
        if (!initial) {
            onProgress({ stage: 'error', error: 'API unreachable' });
            return { ok: false, reason: 'api_unreachable' };
        }

        onProgress({ stage: 'check', active: initial.active, max: initial.max });

        if (initial.active === 0) {
            return { ok: true, reason: 'already_clear', active: 0, max: initial.max };
        }

        // Step 2: burst-reap (persuade al NGINX a ciclar slots zombie)
        if (burstReap) {
            onProgress({ stage: 'reap_burst', count: burstSize });
            await burstReapNginxSlots(server, burstSize);
        }

        // Step 3: poll loop
        const startedAt = Date.now();
        let activeConn = initial.active;
        let maxConn    = initial.max;

        while (Date.now() - startedAt < maxWaitMs) {
            await new Promise(function(r) { setTimeout(r, pollIntervalMs); });

            const refresh = await fetchSlotState(server);
            if (refresh) {
                activeConn = refresh.active;
                maxConn    = refresh.max;
                const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                onProgress({ stage: 'poll', active: activeConn, max: maxConn, elapsedSec: elapsed });

                if (activeConn === 0) {
                    return {
                        ok:       true,
                        reason:   'reaped',
                        active:   0,
                        max:      maxConn,
                        waitedMs: Date.now() - startedAt
                    };
                }
            }
        }

        // Step 4: timeout
        return {
            ok:       false,
            reason:   'timeout',
            active:   activeConn,
            max:      maxConn,
            waitedMs: maxWaitMs
        };
    }

    /**
     * Reap multi-server. Itera sobre todos los servers activos.
     * Devuelve un array de resultados.
     *
     * @param {Array<Object>} servers
     * @param {Object}        options
     * @returns {Promise<Array>}
     */
    // PhD-AUDIT FIX F4 (2026-04-11): Parallelize reap across providers.
    // Serial loop caused 1000 servers x 60s = 16h worst case. Now uses
    // worker pool with configurable concurrency (default 32).
    async function reapAll(servers, options) {
        const concurrency = (options && options.concurrency) || 32;
        const queue = (servers || []).slice();
        const results = [];
        async function worker() {
            while (queue.length) {
                const srv = queue.shift();
                try {
                    const result = await reap(srv, options);
                    results.push({ server: srv, result: result });
                } catch (e) {
                    results.push({ server: srv, result: { error: e.message } });
                }
            }
        }
        await Promise.all(Array.from({ length: concurrency }, worker));
        return results;
    }

    // Exponer al window
    window.OmegaSlotReaper = {
        version:        '1.0.0',
        reap:           reap,
        reapAll:        reapAll,
        fetchSlotState: fetchSlotState
    };

    console.log('🪦 [OmegaSlotReaper v1.0] cargado — pre-flight connection slot reaper listo');
})();
