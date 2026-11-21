/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE CONFIG PERSISTENCE GUARD v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PROBLEMA QUE RESUELVE
 *   La biblioteca de servidores vive en DOS sitios:
 *     1) localStorage['iptv_server_library']   (lectura rapida + generador)
 *     2) IndexedDB IPTVNavigatorDB.app_state.serverLibrary  (persistencia real)
 *   Si uno de los dos se vacia (limpieza de datos del sitio, navegador distinto,
 *   un clear de app_state) la biblioteca "desaparece" de la UI aunque el otro
 *   lado siga teniendola.
 *
 * QUE HACE (no invasivo, solo rellena huecos)
 *   - Al arrancar, y periodicamente: si un lado esta vacio y el otro tiene
 *     servidores, copia el que tiene datos hacia el vacio.
 *   - NUNCA borra, NUNCA sobreescribe una biblioteca mas rica con una mas pobre.
 *   - Deja marca verificable en localStorage['ape_config_guard.lastRun'].
 *   - Expone backup/restore manual:
 *       await apeConfigExport()          -> descarga APE_CONFIG_BACKUP_*.json
 *       await apeConfigImport()          -> abre selector de archivo y restaura
 *       await apeConfigGuard.syncNow()    -> fuerza sincronizacion
 *
 * No toca filtros, no toca canales, no toca UI. Solo cierra el hueco de
 * persistencia de servidores entre localStorage e IndexedDB.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var LOG = '[APE-PERSIST]';
    var LS_LIB = 'iptv_server_library';
    var MARK = 'ape_config_guard.lastRun';
    var SYNC_MS = 60000;
    var BACKUP_KEYS = [
        'serverConfig', 'activeServers', 'serverLibrary', 'filterState',
        'filtersConfig', 'advancedFilters', 'analysisConfig', 'headersConfig',
        'rankingConfig', 'gatewayConfig', 'enrichmentSources',
        'ape_recovered_filters'
    ];

    function parseLS(key) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function countOf(value) {
        if (Array.isArray(value)) return value.length;
        if (value && Array.isArray(value.activeServers)) return value.activeServers.length;
        return 0;
    }

    function libKey(s) {
        if (!s || typeof s !== 'object') return null;
        if (s.id) return 'id:' + s.id;
        var base = s.baseUrl || s.url || '';
        if (!base) return null;
        return 'url:' + base + '|' + (s.username || '');
    }

    /**
     * Union por identidad (id o baseUrl+username). No pierde ninguna entrada.
     * En conflicto gana `primary` (el lado con mas datos reales).
     */
    function unionLibrary(primary, secondary) {
        var out = [];
        var seen = Object.create(null);
        [primary, secondary].forEach(function (list) {
            if (!Array.isArray(list)) return;
            list.forEach(function (entry) {
                var k = libKey(entry);
                if (!k) return;
                if (seen[k] === undefined) {
                    seen[k] = out.length;
                    out.push(entry);
                } else {
                    var idx = seen[k];
                    out[idx] = Object.assign({}, entry, out[idx]);
                }
            });
        });
        return out;
    }

    function mark(filled, libCount) {
        try {
            localStorage.setItem(MARK, JSON.stringify({
                ts: Date.now(),
                iso: new Date().toISOString(),
                filled: filled,
                libraryCount: libCount,
                v: '1.0'
            }));
        } catch (e) { /* quota: irrelevante */ }
    }

    /**
     * Sincroniza localStorage <-> IndexedDB sin perder datos.
     * @returns {Promise<{ok:boolean, filled:string[], libraryCount:number}>}
     */
    async function syncOnce(app, reason) {
        var db = app && app.db;
        if (!db || typeof db.saveAppState !== 'function') {
            return { ok: false, filled: [], libraryCount: -1 };
        }
        var filled = [];
        try {
            if (typeof db.ready === 'function') await db.ready();

            var idbLib = await db.getAppState('serverLibrary');
            var lsLib = parseLS(LS_LIB);
            var nIdb = countOf(idbLib);
            var nLs = countOf(lsLib);

            // Unión sin pérdida: nunca se descarta un servidor porque el otro lado
            // tenga menos (ese era el bug que vaciaba la biblioteca tras un clear
            // parcial o tras un guardado del app con un snapshot incompleto).
            var union = unionLibrary(idbLib, lsLib);
            var nUnion = union.length;

            if (nUnion > 0) {
                if (nLs !== nUnion) {
                    localStorage.setItem(LS_LIB, JSON.stringify(union));
                    filled.push('localStorage.iptv_server_library ' + nLs + ' -> ' + nUnion + ' (union)');
                }
                if (nIdb !== nUnion) {
                    await db.saveAppState('serverLibrary', union);
                    filled.push('IndexedDB.serverLibrary ' + nIdb + ' -> ' + nUnion + ' (union)');
                }
            }

            // Espejo que consume el generador (js/ape-v9/generation-controller.js)
            var libFinal = countOf(parseLS(LS_LIB)) > 0 ? parseLS(LS_LIB) : idbLib;
            if (Array.isArray(libFinal) && libFinal.length > 0 && !localStorage.getItem('ape_servers')) {
                localStorage.setItem('ape_servers', JSON.stringify(libFinal.map(function (s) {
                    return { url: s.baseUrl || s.url || '', username: s.username || '', password: s.password || '', name: s.name || '' };
                })));
                filled.push('localStorage.ape_servers sembrado (' + libFinal.length + ')');
            }

            var total = countOf(libFinal);
            mark(filled, total);
            if (filled.length > 0) {
                console.log(LOG + ' sync (' + (reason || 'auto') + '):', filled.join(' | '));
            }
            return { ok: true, filled: filled, libraryCount: total };
        } catch (e) {
            console.warn(LOG + ' sync error:', e && e.message ? e.message : e);
            mark(filled, countOf(parseLS(LS_LIB)));
            return { ok: false, filled: filled, libraryCount: countOf(parseLS(LS_LIB)) };
        }
    }

    // ── Backup / restore manual (para sobrevivir a un clear de datos del sitio) ──
    async function exportConfig() {
        var app = window.app;
        if (!app || !app.db) throw new Error('app.db no disponible');
        var state = {};
        for (var i = 0; i < BACKUP_KEYS.length; i++) {
            var k = BACKUP_KEYS[i];
            try { state[k] = await app.db.getAppState(k); } catch (e) { state[k] = null; }
        }
        var ls = {};
        ls[LS_LIB] = parseLS(LS_LIB);
        ls.ape_servers = parseLS('ape_servers');
        var payload = {
            schema: 'ape.config.backup/1',
            exportedAt: new Date().toISOString(),
            origin: location.origin,
            userAgent: navigator.userAgent,
            app_state: state,
            localStorage: ls
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'APE_CONFIG_BACKUP_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 5000);
        console.log(LOG + ' export listo. Claves:', Object.keys(state).length);
        return payload;
    }

    async function applyBackup(payload) {
        var app = window.app;
        if (!app || !app.db) throw new Error('app.db no disponible');
        if (!payload || payload.schema !== 'ape.config.backup/1') {
            throw new Error('backup invalido: schema != ape.config.backup/1');
        }
        var st = payload.app_state || {};
        var keys = Object.keys(st);
        var written = 0;
        for (var i = 0; i < keys.length; i++) {
            if (st[keys[i]] === null || st[keys[i]] === undefined) continue;
            await app.db.saveAppState(keys[i], st[keys[i]]);
            written++;
        }
        var lib = payload.localStorage && payload.localStorage[LS_LIB];
        if (Array.isArray(lib) && lib.length > 0) {
            localStorage.setItem(LS_LIB, JSON.stringify(lib));
            if (countOf(await app.db.getAppState('serverLibrary')) === 0) {
                await app.db.saveAppState('serverLibrary', lib);
            }
        }
        console.log(LOG + ' import aplicado:', written, 'claves, biblioteca', Array.isArray(lib) ? lib.length : 0);
        return { keys: written, library: Array.isArray(lib) ? lib.length : 0 };
    }

    function pickFile() {
        return new Promise(function (resolve, reject) {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.onchange = function () {
                if (input.files && input.files[0]) resolve(input.files[0]);
                else reject(new Error('sin archivo'));
            };
            input.click();
        });
    }

    async function importConfig() {
        var file = await pickFile();
        var text = await file.text();
        return applyBackup(JSON.parse(text));
    }

    // ── Arranque: esperar window.app.db y sincronizar ──
    var started = false;
    function boot() {
        if (started) return;
        var app = window.app;
        if (!app || !app.db) return;
        started = true;
        syncOnce(app, 'boot').then(function (r) {
            console.log(LOG + ' boot ok. Biblioteca:', r.libraryCount, 'servidores');
        });
        setInterval(function () {
            if (window.app && window.app.db) syncOnce(window.app, 'interval');
        }, SYNC_MS);
        window.addEventListener('beforeunload', function () {
            try { syncOnce(window.app, 'unload'); } catch (e) { /* noop */ }
        });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden' && window.app && window.app.db) {
                syncOnce(window.app, 'hidden');
            }
        });
    }

    var tries = 0;
    var timer = setInterval(function () {
        tries++;
        if (window.app && window.app.db) {
            boot();
            clearInterval(timer);
        } else if (tries > 120) { // ~60s
            clearInterval(timer);
            console.warn(LOG + ' window.app.db no aparecio; guard inactivo');
        }
    }, 500);

    window.apeConfigGuard = { syncNow: function () { return syncOnce(window.app, 'manual'); }, version: '1.0' };
    window.apeConfigExport = exportConfig;
    window.apeConfigImport = importConfig;
    window.apeConfigApplyBackup = applyBackup;
    console.log(LOG + ' guard instalado (v1.0) — apeConfigExport() / apeConfigImport()');
})();
