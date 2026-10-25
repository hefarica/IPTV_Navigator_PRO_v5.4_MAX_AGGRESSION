/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE LAB IMPORT HELPER v2.0 — la DNA sobrevive a refresh y hard refresh
 * ═══════════════════════════════════════════════════════════════════════════
 * PROBLEMA REAL detectado
 *   `importFromLABData()` escribe `ape_lab_metadata` (de donde sale
 *   `labExportedAt`) AL FINAL de una cadena larga de localStorage.setItem.
 *   Si el origen agota la cuota (~5 MB) a mitad, ese setItem no se ejecuta:
 *   en memoria el LAB existe (la sesión actual genera bien) pero al recargar
 *   `labExportedAt` vuelve vacío → el generador aborta con
 *   "LAB JSON no importado".
 *
 * SOLUCIÓN (3 capas, en este orden)
 *   1. `ape_lab_gate_v1` en localStorage: ~150 bytes con exported_at/version.
 *      Cabe siempre → el gate sobrevive incluso con la cuota llena.
 *   2. DNA completa en IndexedDB (`APELabDNA/dna/current`, sin cuota de 5 MB).
 *   3. Fichero local `frontend/lab_master_22.6.0.json` (mismo origen).
 *
 *   En el arranque: si el gate está cerrado → IDB → si no, fichero local →
 *   `importFromLABData()` → verifica y, si hace falta, repara el gate.
 *   Y en CADA importación exitosa (incluido el picker nativo) se guarda el
 *   snapshot automáticamente.
 *
 * API
 *   await apeImportLabLocal(path?)   importa desde fichero local
 *   apeLabStatus()                   estado del gate
 *   await apeLabSnapshotSave(dna?)   guarda snapshot (IDB + llave mínima)
 *   await apeLabSnapshotRestore()    restaura desde snapshot
 *   auditLabPersist()                diagnóstico de almacenamiento
 *   apeLabForget()                   borra snapshot y reabre el gate
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    var DEFAULT_PATH = 'lab_master_22.6.0.json';
    var GATE_KEY = 'ape_lab_gate_v1';
    var IDB_NAME = 'APELabDNA';
    var IDB_STORE = 'dna';
    var IDB_KEY = 'current';

    // ── estado del gate ───────────────────────────────────────────────────
    function status() {
        var c = global.APE_PROFILES_CONFIG;
        if (!c) return { ok: false, reason: 'APE_PROFILES_CONFIG no cargado' };
        var profs = c.profiles ? Object.keys(c.profiles) : [];
        return {
            ok: !!(c.labExportedAt && profs.length > 0),
            labExportedAt: c.labExportedAt || null,
            labVersion: c.labVersion || null,
            bulletproof: c.labBulletproof === true,
            profiles: profs,
            nivel1: Array.isArray(c.nivel1Directives) ? c.nivel1Directives.length : 0,
            nivel3: c.nivel3PerLayer ? Object.keys(c.nivel3PerLayer).length : 0,
            placeholders: c.placeholdersMap ? Object.keys(c.placeholdersMap).length : 0,
            servers: Array.isArray(c.labServers) ? c.labServers.length : 0
        };
    }

    // ── IndexedDB mínima (sin tocar la DB de la app) ──────────────────────
    function idbOpen() {
        return new Promise(function (res, rej) {
            if (!global.indexedDB) return rej(new Error('IndexedDB no disponible'));
            var r = global.indexedDB.open(IDB_NAME, 1);
            r.onupgradeneeded = function () {
                var db = r.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
            };
            r.onsuccess = function () { res(r.result); };
            r.onerror = function () { rej(r.error || new Error('IDB open error')); };
        });
    }

    function idbPut(value) {
        return idbOpen().then(function (db) {
            return new Promise(function (res, rej) {
                var tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(value, IDB_KEY);
                tx.oncomplete = function () { db.close(); res(true); };
                tx.onerror = function () { db.close(); rej(tx.error); };
            });
        });
    }

    function idbGet() {
        return idbOpen().then(function (db) {
            return new Promise(function (res, rej) {
                var tx = db.transaction(IDB_STORE, 'readonly');
                var q = tx.objectStore(IDB_STORE).get(IDB_KEY);
                q.onsuccess = function () { db.close(); res(q.result || null); };
                q.onerror = function () { db.close(); rej(q.error); };
            });
        });
    }

    function idbDel() {
        return idbOpen().then(function (db) {
            return new Promise(function (res) {
                var tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(IDB_KEY);
                tx.oncomplete = function () { db.close(); res(true); };
                tx.onerror = function () { db.close(); res(false); };
            });
        });
    }

    // ── guardar snapshot (llave mínima + DNA completa) ────────────────────
    async function apeLabSnapshotSave(dna) {
        var cfg = global.APE_PROFILES_CONFIG;
        var gateOk = false, gateErr = null;
        try {
            var gate = {
                exported_at: (dna && dna.exported_at) || (cfg && cfg.labExportedAt) || null,
                lab_version: (dna && dna.lab_version) || (cfg && cfg.labVersion) || null,
                lab_schema_variant: (dna && dna.lab_schema_variant) || (cfg && cfg.labSchemaVariant) || null,
                bulletproof: (dna && dna.bulletproof === true) || (cfg && cfg.labBulletproof === true) || false,
                labFileName: (dna && (dna.labFileName || (dna.meta_per_profile && dna.meta_per_profile.source_file))) || (cfg && cfg.labFileName) || 'LAB_CALIBRATED',
                saved_at: new Date().toISOString()
            };
            localStorage.setItem(GATE_KEY, JSON.stringify(gate));
            gateOk = true;
        } catch (e) { gateErr = e.message; }

        var idbOk = false, idbErr = null;
        if (dna) {
            // SEGURIDAD: solo guardamos en IDB el JSON ORIGINAL del LAB.
            // Nunca reconstruimos la DNA desde el estado interno (el formato
            // `profiles` de PM9 no es el `profiles_calibrated` del LAB y
            // reimportarlo degradaría la calibración).
            try {
                await idbPut(dna);
                idbOk = true;
            } catch (e2) { idbErr = e2.message; }
        }

        if (gateOk || idbOk) {
            console.log('%c[APE-LAB-PERSIST] snapshot guardado', 'color:#22c55e;font-weight:bold;',
                { llaveMinima: gateOk, dnaEnIDB: idbOk, gateErr: gateErr, idbErr: idbErr });
        } else {
            console.warn('[APE-LAB-PERSIST] no pude guardar snapshot', { gateErr: gateErr, idbErr: idbErr });
        }
        return { gateOk: gateOk, idbOk: idbOk };
    }

    // Reconstruye un DNA "suficiente" desde el estado en memoria (por si el
    // import llegó por un camino que no nos pasó el JSON original).
    function rebuildDnaFromConfig() {
        var c = global.APE_PROFILES_CONFIG;
        if (!c || !c.profiles) return null;
        return {
            lab_version: c.labVersion || 'omega_v1',
            lab_schema_variant: c.labSchemaVariant || null,
            exported_at: c.labExportedAt || new Date().toISOString(),
            bulletproof: c.labBulletproof === true,
            playlist_format: 'm3u8',
            profiles_calibrated: c.profiles,
            nivel1_directives: c.nivel1Directives || [],
            nivel3_per_layer: c.nivel3PerLayer || {},
            placeholders_map: c.placeholdersMap || {},
            evasion_pool: c.evasionPool || null,
            config_global: c.configGlobal || {},
            servers: c.labServers || [],
            omega_gap_plan: c.omegaGapPlan || null,
            meta_per_profile: c.labMetaPerProfile || null,
            scoring_metadata: c.labMetadata || {},
            _rebuilt_by: 'ape-lab-import-helper/v2'
        };
    }

    // ── reparar el gate sin reimportar (último recurso, barato) ───────────
    function repairGateFromKey() {
        var c = global.APE_PROFILES_CONFIG;
        if (!c) return false;
        var raw;
        try { raw = localStorage.getItem(GATE_KEY); } catch (e) { return false; }
        if (!raw) return false;
        var g;
        try { g = JSON.parse(raw); } catch (e) { return false; }
        if (!g || !g.exported_at) return false;
        if (!c.labExportedAt) c.labExportedAt = g.exported_at;
        if (!c.labVersion) c.labVersion = g.lab_version;
        if (!c.labSchemaVariant) c.labSchemaVariant = g.lab_schema_variant;
        if (c.labBulletproof === undefined) c.labBulletproof = g.bulletproof === true;
        if (!c.labFileName) c.labFileName = g.labFileName;
        console.log('%c[APE-LAB-PERSIST] gate reparado desde llave mínima', 'color:#f59e0b;font-weight:bold;', g.exported_at);
        return !!c.labExportedAt;
    }

    // ── importar (con snapshot automático) ────────────────────────────────
    async function importData(data, originLabel) {
        var cfg = global.APE_PROFILES_CONFIG;
        if (!cfg) throw new Error('APE_PROFILES_CONFIG no cargado (recarga la página)');
        if (typeof cfg.importFromLABData !== 'function') throw new Error('APE_PROFILES_CONFIG.importFromLABData no disponible');
        if (!data || !data.profiles_calibrated) throw new Error('JSON inválido: falta profiles_calibrated');
        var ver = String(data.lab_version || '');
        if (!/^omega_/i.test(ver) && data.bulletproof !== true) throw new Error('Schema no soportado: lab_version=' + ver);

        var applied = await cfg.importFromLABData(data);
        await apeLabSnapshotSave(data);

        var st = status();
        var out = {
            ok: st.ok, origen: originLabel || '?', exported_at: data.exported_at,
            lab_version: data.lab_version, bulletproof: data.bulletproof === true,
            profiles: st.profiles, nivel1: st.nivel1, nivel3: st.nivel3,
            placeholders: st.placeholders, servers: st.servers, applied: applied || null
        };
        if (st.ok) console.log('%c[APE-LAB-IMPORT] ✅ gate ABIERTO — ya puedes generar', 'color:#22c55e;font-weight:bold;', out);
        else console.error('[APE-LAB-IMPORT] ❌ gate sigue CERRADO', out);
        return out;
    }

    async function apeImportLabLocal(path) {
        var url = path || DEFAULT_PATH;
        var abs = url;
        if (!/^https?:/i.test(url) && url.charAt(0) !== '/') abs = new URL(url, document.baseURI).toString();

        console.log('%c[APE-LAB-IMPORT] cargando ' + abs, 'color:#22d3ee;font-weight:bold;');
        var res = await fetch(abs, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error('No pude leer la DNA (' + res.status + '): ' + abs +
                ' — copia el archivo a frontend/ o usa el botón de importar del Profile Manager');
        }
        return importData(await res.json(), 'archivo-local');
    }

    async function apeLabSnapshotRestore() {
        var dna = null;
        try { dna = await idbGet(); } catch (e) { console.warn('[APE-LAB-PERSIST] IDB no disponible:', e.message); }
        if (!dna) {
            console.log('%c[APE-LAB-PERSIST] sin snapshot en IDB', 'color:#94a3b8;');
            return null;
        }
        console.log('%c[APE-LAB-PERSIST] restaurando DNA desde IndexedDB…', 'color:#22d3ee;font-weight:bold;');
        return importData(dna, 'indexeddb');
    }

    async function apeLabForget() {
        try { localStorage.removeItem(GATE_KEY); } catch (e) {}
        await idbDel();
        console.log('%c[APE-LAB-PERSIST] snapshot borrado', 'color:#f59e0b;');
        return true;
    }

    // ── diagnóstico ───────────────────────────────────────────────────────
    function auditLabPersist() {
        var out = { gate: status(), localStorage: {}, idb: null };
        try {
            var gateRaw = localStorage.getItem(GATE_KEY);
            out.localStorage.gateKey = gateRaw ? JSON.parse(gateRaw) : null;
            out.localStorage.totalChars = 0;
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                out.localStorage.totalChars += (k || '').length + ((localStorage.getItem(k) || '').length);
            }
            out.localStorage.aproxMB = +(out.localStorage.totalChars / 1048576).toFixed(2);
            out.localStorage.keys = localStorage.length;
        } catch (e) { out.localStorage.error = e.message; }
        idbGet().then(function (dna) {
            out.idb = dna ? { saved: true, exported_at: dna.exported_at, bytes: JSON.stringify(dna).length } : { saved: false };
            console.log('%c[APE-LAB-PERSIST] auditoría', 'color:#22d3ee;font-weight:bold;', out);
        }).catch(function (e) {
            out.idb = { error: e.message };
            console.log('%c[APE-LAB-PERSIST] auditoría (IDB)', 'color:#22d3ee;', out);
        });
        return out;
    }

    // ── auto-arranque: restaurar antes de que el usuario pulse nada ───────
    async function bootEnsure() {
        var st = status();
        if (st.ok) {
            // gate ya abierto: refresca el snapshot para que refleje el DNA vigente
            apeLabSnapshotSave(null).catch(function () {});
            console.log('%c[APE-LAB-PERSIST] gate ya abierto (' + st.profiles.length + ' perfiles, ' + st.labExportedAt + ')', 'color:#22c55e;');
            return true;
        }
        // 1) llave mínima (si existe, el gate queda satisfecho al instante)
        repairGateFromKey();
        if (status().ok) { apeLabSnapshotSave(null).catch(function () {}); return true; }
        // 2) snapshot completo en IndexedDB
        try {
            var r = await apeLabSnapshotRestore();
            if (r && r.ok) return true;
        } catch (e) { console.warn('[APE-LAB-PERSIST] restore falló:', e.message); }
        // 3) fichero local
        try {
            var r2 = await apeImportLabLocal();
            return !!(r2 && r2.ok);
        } catch (e2) {
            console.warn('[APE-LAB-IMPORT] auto-import no disponible (' + e2.message + '). ' +
                'Copia lab_master_22.6.0.json a frontend/ o importa con el botón del Profile Manager.');
            return false;
        }
    }

    // ── parche: cualquier import exitoso guarda snapshot ──────────────────
    function patchImporter() {
        var cfg = global.APE_PROFILES_CONFIG;
        if (!cfg || cfg.__apeLabPatched) return;
        var orig = cfg.importFromLABData;
        if (typeof orig !== 'function') return;
        cfg.importFromLABData = function (data, opts) {
            var p = orig.call(this, data, opts);
            Promise.resolve(p).then(function () {
                apeLabSnapshotSave(data).catch(function () {});
            }).catch(function () {});
            return p;
        };
        cfg.__apeLabPatched = true;
    }

    global.apeImportLabLocal = apeImportLabLocal;
    global.apeLabStatus = status;
    global.apeLabSnapshotSave = apeLabSnapshotSave;
    global.apeLabSnapshotRestore = apeLabSnapshotRestore;
    global.apeLabForget = apeLabForget;
    global.auditLabPersist = auditLabPersist;
    global.apeLabEnsureLoaded = bootEnsure;

    if (typeof document !== 'undefined') {
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            if (global.APE_PROFILES_CONFIG) {
                clearInterval(t);
                patchImporter();
                setTimeout(function () {
                    var auto = true;
                    try { auto = (localStorage.getItem('ape_lab_auto') || '1') !== '0'; } catch (e) {}
                    if (!auto) { console.log('%c[APE-LAB-PERSIST] auto desactivado (ape_lab_auto=0)', 'color:#94a3b8;'); return; }
                    bootEnsure();
                }, 400);
            } else if (tries > 120) { clearInterval(t); }
        }, 400);

        console.log('%c[APE-LAB-PERSIST] helper v2.0 listo — apeLabStatus() | auditLabPersist() | await apeLabSnapshotRestore()',
            'color:#94a3b8;');
    }
})(typeof window !== 'undefined' ? window : globalThis);
