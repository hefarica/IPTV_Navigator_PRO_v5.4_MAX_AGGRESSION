/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE UI PERSISTENCE TOTAL — v1.1.0 (2026-11-06)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Garantiza que TODO lo seleccionado en el frontend sobreviva a:
 *   - cerrar la pestaña / ventana
 *   - recargar (F5) o hard refresh (Ctrl+F5)
 *   - volver a abrir la app días después
 *
 * QUÉ PERSISTE
 *   1) Todos los controles de formulario con identidad estable:
 *      checkbox · radio · select · text · number · range · textarea
 *   2) Estado de paneles renderizados tarde (MutationObserver): reaplica a
 *      controles nuevos que sigan en su valor por defecto (no pisa cambios
 *      que el usuario acaba de hacer).
 *   3) Metadatos del último LAB subido (nombre · bytes · sha256 · fecha),
 *      para trazabilidad; el JSON completo del LAB ya lo guarda
 *      ape-lab-import-helper.js en IndexedDB (APELabDNA/dna/current).
 *
 * QUÉ NO PERSISTE (por seguridad, jamás)
 *   password · token · secret · api-key · authorization · cookie · file · hidden
 *
 * ─── v1.1.0 (2026-11-06) — FIX DEL BUCLE DE RESTAURACIÓN ──────────────────────
 * Síntoma medido en la consola: al recargar, cientos de líneas/segundo y los
 * valores del Gestor de Perfiles derivando a negativos.
 * Causa raíz: esta capa restauraba escribiendo `el.value` y **disparando
 * `input`/`change`** sobre controles recién recreados por
 * `ProfileManagerV9.render()`. Esos eventos sintéticos volvían a entrar en
 * `updateSetting()` → motor reactivo → `render()` → DOM nuevo → observador →
 * restaurar otra vez. No convergía nunca, porque cada render crea nodos NUEVOS
 * que siempre están "en su valor por defecto", así que la restauración se
 * aplicaba una y otra vez.
 *
 * Correcciones (todas aditivas, cero pérdida de persistencia):
 *   1. Escritura idempotente: si el control YA tiene el valor persistido no se
 *      toca y no se dispara ningún evento → punto fijo real.
 *   2. Las restauraciones del MutationObserver son SILENCIOSAS (`silent`):
 *      reponen el valor, nunca se hacen pasar por el usuario.
 *   3. Guardia de reentrada (`AMBIENT.applying`) + coalescing de mutaciones
 *      (una pasada por ráfaga en vez de una por nodo).
 *   4. Presupuesto anti-bucle: >500 restauraciones/segundo ⇒ pausa 3 s y aviso
 *      único. La persistencia nunca puede tumbar la UI.
 *   5. `data-ape-nopersist` para controles cuyo SSOT NO es la UI. Los del Gestor
 *      de Perfiles viven en `profiles` de ape-profiles-config y son POR PERFIL:
 *      persistirlos por `id` (idéntico en los 12 perfiles) contaminaba un perfil
 *      con los valores de otro.
 * ═══════════════════════════════════════════════════════════════════════════════
 * API (consola)
 *   APE_UI_PERSIST.status()        → {controls, saved, bytes, labMeta}
 *   APE_UI_PERSIST.saveNow()       → fuerza guardado
 *   APE_UI_PERSIST.restoreNow()    → fuerza restauración
 *   APE_UI_PERSIST.clear()         → borra el estado de UI (no el LAB)
 *   APE_UI_PERSIST.exportState()   → JSON string para backup manual
 *   APE_UI_PERSIST.importState(s)  → restaura desde backup
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    var KEY = 'ape_ui_state_v1';
    var LAB_META_KEY = 'ape_lab_file_meta_v1';
    var SCHEMA = 1;
    var DEBOUNCE_MS = 200;
    // v1.1.0 — techo de restauraciones por segundo antes de declarar bucle.
    var APPLY_BUDGET_PER_SEC = 500;

    var SECRET_RX = /(pass(word)?|token|tok|secret|api[-_]?key|auth(orization)?|cookie|session[-_]?key)/i;
    var CONTROL_SEL = 'input[type="checkbox"],input[type="radio"],select,input[type="text"],input[type="number"],input[type="range"],input[type="search"],textarea';
    var DEFAULT_TAGS = { INPUT: 1, SELECT: 1, TEXTAREA: 1 };

    /**
     * v1.1.0 — Estado de reentrada. `applying` es true mientras ESTA capa
     * escribe en el DOM. Sirve para dos cosas: no encadenar restauraciones y
     * no guardar como "cambio del usuario" lo que acabamos de reponer.
     */
    var AMBIENT = { applying: false };

    function isSkipped(el) {
        if (!el || !DEFAULT_TAGS[el.tagName]) return true;
        if (el.disabled) return true;
        var t = (el.getAttribute('type') || '').toLowerCase();
        if (t === 'password' || t === 'file' || t === 'hidden' || t === 'submit' || t === 'button') return true;
        // v1.1.0 — opt-out explícito: el control tiene otro dueño (modelo/SSOT).
        // Se acepta en el propio control o en cualquier ancestro (basta marcar
        // el panel entero, p. ej. el Gestor de Perfiles, para que sus controles
        // no se persistan por id y no se contaminen entre perfiles).
        if (el.getAttribute && el.getAttribute('data-ape-nopersist')) return true;
        if (el.closest && el.closest('[data-ape-nopersist]')) return true;
        var idn = (el.id || '') + ' ' + (el.name || '');
        if (SECRET_RX.test(idn)) return true;
        return false;
    }

    /** Clave estable: id > data-ape-key > name+type+índice entre iguales. */
    function keyOf(el) {
        if (el.id) return 'id:' + el.id;
        var dk = el.getAttribute && el.getAttribute('data-ape-key');
        if (dk) return 'dk:' + dk;
        if (!el.name) return null;
        var base = 'nm:' + el.name + ':' + (el.getAttribute('type') || el.tagName.toLowerCase());
        var doc = el.ownerDocument || global.document;
        if (!doc || !doc.querySelectorAll) return base;
        var all = doc.querySelectorAll('[name="' + String(el.name).replace(/"/g, '\\"') + '"]');
        var idx = 0;
        for (var i = 0; i < all.length; i++) { if (all[i] === el) { idx = i; break; } }
        return base + '#' + idx;
    }

    function readValue(el) {
        var t = (el.getAttribute('type') || '').toLowerCase();
        if (t === 'checkbox' || t === 'radio') return el.checked ? 1 : 0;
        if (el.tagName === 'SELECT' && el.multiple) {
            var out = [];
            for (var i = 0; i < el.options.length; i++) if (el.options[i].selected) out.push(el.options[i].value);
            return out;
        }
        return el.value != null ? String(el.value) : '';
    }

    function isDefault(el) {
        var t = (el.getAttribute('type') || '').toLowerCase();
        if (t === 'checkbox' || t === 'radio') return el.checked === el.defaultChecked;
        if (el.tagName === 'SELECT') {
            for (var i = 0; i < el.options.length; i++) {
                if (el.options[i].selected !== el.options[i].defaultSelected) return false;
            }
            return true;
        }
        return String(el.value) === String(el.defaultValue);
    }

    /**
     * v1.1.0 — ¿el control ya está en el valor persistido?
     * Es el criterio de punto fijo: si ya coincide, no se escribe ni se
     * dispara ningún evento, así que una restauración repetida sobre el mismo
     * DOM (o sobre un DOM recién pintado con el valor del modelo) es inerte.
     */
    function sameValue(el, v) {
        var t = (el.getAttribute('type') || '').toLowerCase();
        if (t === 'checkbox' || t === 'radio') return el.checked === !!v;
        if (el.tagName === 'SELECT' && el.multiple && Array.isArray(v)) {
            for (var i = 0; i < el.options.length; i++) {
                var want = v.indexOf(el.options[i].value) >= 0;
                if (!!el.options[i].selected !== want) return false;
            }
            return true;
        }
        return String(readValue(el)) === String(v);
    }

    /**
     * @param {Element} el destino
     * @param {*} v valor persistido
     * @param {Object} [opts] { silent:true } → repone sin disparar input/change
     */
    function writeValue(el, v, opts) {
        opts = opts || {};
        var t = (el.getAttribute('type') || '').toLowerCase();
        try {
            // v1.1.0 — PUNTO FIJO. Antes se escribía y se despachaba siempre;
            // eso era el motor del bucle render↔restore.
            if (sameValue(el, v)) return true;
            if (t === 'checkbox' || t === 'radio') {
                el.checked = !!v;
                if (!opts.silent && t === 'radio' && v) el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            if (el.tagName === 'SELECT' && el.multiple && Array.isArray(v)) {
                for (var i = 0; i < el.options.length; i++) el.options[i].selected = v.indexOf(el.options[i].value) >= 0;
                if (!opts.silent) el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            if (el.tagName === 'SELECT') {
                // si la opción aún no existe (select dinámico), se reintenta luego
                var found = false;
                for (var j = 0; j < el.options.length; j++) if (el.options[j].value === String(v)) { found = true; break; }
                if (!found) return false;
                // marcar la opción explícitamente (no depender del setter de value)
                for (var j2 = 0; j2 < el.options.length; j2++) el.options[j2].selected = (el.options[j2].value === String(v));
            }
            el.value = v;
            if (opts.silent) return true;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } catch (e) { return false; }
    }

    // ── recolección / aplicación (puro: testeable sin navegador) ─────────────
    function collect(doc) {
        var state = { _schema: SCHEMA, _saved_at: new Date().toISOString(), controls: {} };
        if (!doc || !doc.querySelectorAll) return state;
        var els = doc.querySelectorAll(CONTROL_SEL);
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (isSkipped(el)) continue;
            var k = keyOf(el);
            if (!k) continue;
            state.controls[k] = readValue(el);
        }
        return state;
    }

    /** Aplica el estado a UN control. Devuelve 1 si el control quedó aplicado. */
    function applyOne(el, state, opts) {
        opts = opts || {};
        if (!el || isSkipped(el)) return 0;
        var k = keyOf(el);
        if (!k || !(k in state.controls)) return 0;
        if (!opts.force && !isDefault(el)) return 0;   // no pisar lo que el usuario tocó
        return writeValue(el, state.controls[k], opts) ? 1 : 0;
    }

    /** Aplica el estado. force=false → sólo controles que estén en su default. */
    function apply(doc, state, opts) {
        opts = opts || {};
        var r = { applied: 0, skipped: 0, missing: 0 };
        if (!doc || !state || !state.controls) return r;
        // v1.1.0 — guardia de reentrada: nunca encadenar restauraciones.
        if (AMBIENT.applying) { r.reentrant = true; return r; }
        AMBIENT.applying = true;
        try {
            var els = doc.querySelectorAll ? doc.querySelectorAll(CONTROL_SEL) : [];
            var seen = {};
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (isSkipped(el)) continue;
                var k = keyOf(el);
                if (!k || !(k in state.controls)) continue;
                seen[k] = 1;
                if (!opts.force && !isDefault(el)) { r.skipped++; continue; }
                if (writeValue(el, state.controls[k], opts)) r.applied++;
                else r.missing++;
            }
            for (var kk in state.controls) if (!seen[kk]) r.missing++;
        } finally { AMBIENT.applying = false; }
        return r;
    }

    // ── capa de almacenamiento ──────────────────────────────────────────────
    function safeSet(key, str) {
        try { localStorage.setItem(key, str); return true; }
        catch (e) { console.warn('[APE-UI-PERSIST] localStorage lleno/no disponible:', e.message); return false; }
    }
    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    // v1.1.0 — cache del estado: el observador lo pedía en cada mutación y cada
    // llamada hacía JSON.parse del blob completo.
    var _stateCache = null;
    var _stateCacheRaw = null;

    var saveTimer = null;
    function saveNow() {
        if (typeof document === 'undefined') return null;
        var st = collect(document);
        var n = 0; for (var k in st.controls) n++;
        st._count = n;
        safeSet(KEY, JSON.stringify(st));
        _stateCache = null; _stateCacheRaw = null;
        return st;
    }
    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { saveTimer = null; saveNow(); }, DEBOUNCE_MS);
    }

    function loadState() {
        var raw = safeGet(KEY);
        if (raw === _stateCacheRaw) return _stateCache;
        _stateCacheRaw = raw;
        _stateCache = null;
        if (!raw) return null;
        try { var s = JSON.parse(raw); _stateCache = (s && s.controls) ? s : null; } catch (e) { _stateCache = null; }
        return _stateCache;
    }

    // v1.1.0 — presupuesto anti-bucle.
    var _budget = { t: 0, n: 0, warned: false };
    function budgetAllow() {
        var now = Date.now();
        if (now - _budget.t > 1000) { _budget.t = now; _budget.n = 0; }
        _budget.n++;
        if (_budget.n <= APPLY_BUDGET_PER_SEC) return true;
        if (!_budget.warned) {
            _budget.warned = true;
            console.warn('%c[APE-UI-PERSIST] ' + APPLY_BUDGET_PER_SEC + ' restauraciones en <1s — observador en pausa 3s (bucle de render detectado)',
                'color:#ef4444;font-weight:bold;');
            setTimeout(function () { _budget.warned = false; _budget.t = 0; _budget.n = 0; }, 3000);
        }
        return false;
    }

    var restoredOnce = false;
    function restoreNow(force) {
        var st = loadState();
        if (!st) return { applied: 0, skipped: 0, missing: 0 };
        var r = apply(document, st, { force: !!force });
        restoredOnce = true;
        console.log('%c[APE-UI-PERSIST] restaurado', 'color:#22c55e;font-weight:bold;', r);
        return r;
    }

    function clear() {
        try { localStorage.removeItem(KEY); } catch (e) { }
        _stateCache = null; _stateCacheRaw = null;
        console.log('%c[APE-UI-PERSIST] estado de UI borrado (el LAB intacto)', 'color:#f59e0b;');
        return true;
    }

    function exportState() { return safeGet(KEY) || JSON.stringify(collect(document)); }
    function importState(s) {
        try { var o = JSON.parse(s); if (!o || !o.controls) return false; safeSet(KEY, JSON.stringify(o)); _stateCache = null; _stateCacheRaw = null; restoreNow(true); return true; }
        catch (e) { return false; }
    }

    function status() {
        var st = loadState();
        var n = st ? Object.keys(st.controls).length : 0;
        var raw = safeGet(KEY) || '';
        var lab = null;
        try { var lm = safeGet(LAB_META_KEY); lab = lm ? JSON.parse(lm) : null; } catch (e) { }
        var labDna = null;
        try { labDna = !!(global.APE_PROFILES_CONFIG && global.APE_PROFILES_CONFIG.labExportedAt); } catch (e) { }
        return {
            controls_saved: n, bytes: raw.length, saved_at: st ? st._saved_at : null,
            schema: st ? st._schema : null, lab_meta: lab, lab_gate_open: labDna
        };
    }

    // ── metadatos del fichero LAB subido (trazabilidad) ─────────────────────
    function sha256Hex(buf) {
        try {
            if (!global.crypto || !global.crypto.subtle || !global.TextEncoder) return Promise.resolve(null);
            return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(buf)).then(function (h) {
                var b = new Uint8Array(h), out = '';
                for (var i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
                return out;
            }).catch(function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }

    function noteLabFile(file, text) {
        if (!file) return Promise.resolve(null);
        return sha256Hex(text || '').then(function (sha) {
            var meta = {
                name: file.name || null, size: file.size || null, sha256: sha,
                saved_at: new Date().toISOString(), ui_saved_at: (loadState() || {})._saved_at || null
            };
            safeSet(LAB_META_KEY, JSON.stringify(meta));
            console.log('%c[APE-UI-PERSIST] LAB registrado', 'color:#22d3ee;font-weight:bold;', meta);
            return meta;
        });
    }

    function labMeta() { try { return JSON.parse(safeGet(LAB_META_KEY) || 'null'); } catch (e) { return null; } }

    // ── arranque en navegador ───────────────────────────────────────────────
    if (typeof document !== 'undefined') {
        var boot = function () {
            // 1) restauración inicial (paneles ya pintados)
            restoreNow(false);
            // 2) captura global de cambios REALES del usuario (los sintéticos
            //    de nuestra propia restauración no cuentan como cambio).
            document.addEventListener('change', function () { if (AMBIENT.applying) return; scheduleSave(); }, true);
            document.addEventListener('input', function () { if (AMBIENT.applying) return; scheduleSave(); }, true);
            document.addEventListener('click', function (e) {
                if (AMBIENT.applying) return;
                var t = e.target;
                if (t && (t.type === 'checkbox' || t.type === 'radio')) scheduleSave();
            }, true);
            // 3) flush al cerrar/ocultar
            var flush = function () { saveNow(); };
            global.addEventListener('pagehide', flush);
            global.addEventListener('beforeunload', flush);
            document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
            // 4) paneles dinámicos: reaplica SÓLO a controles en default, en una
            //    pasada por ráfaga de mutaciones y sin disparar eventos.
            if (global.MutationObserver) {
                var pending = [];
                var drainTimer = null;

                var drain = function () {
                    drainTimer = null;
                    var roots = pending;
                    pending = [];
                    if (!roots.length) return;
                    var st = loadState();
                    if (!st) return;
                    if (!budgetAllow()) return;
                    AMBIENT.applying = true;
                    try {
                        for (var i = 0; i < roots.length; i++) {
                            var n = roots[i];
                            if (!n || n.nodeType !== 1) continue;
                            if (n.isConnected === false) continue;
                            if (n.matches && n.matches(CONTROL_SEL)) applyOne(n, st, { force: false, silent: true });
                            if (n.querySelectorAll) {
                                var inner = n.querySelectorAll(CONTROL_SEL);
                                for (var q = 0; q < inner.length; q++) applyOne(inner[q], st, { force: false, silent: true });
                            }
                        }
                    } catch (e) {
                        /* la persistencia nunca rompe la UI */
                    } finally { AMBIENT.applying = false; }
                };

                var mo = new global.MutationObserver(function (muts) {
                    for (var i = 0; i < muts.length; i++) {
                        var added = muts[i].addedNodes || [];
                        for (var j = 0; j < added.length; j++) {
                            var n = added[j];
                            if (n && n.nodeType === 1) pending.push(n);
                        }
                    }
                    if (pending.length && !drainTimer) drainTimer = setTimeout(drain, 0);
                });
                mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
            }
            // 5) segunda pasada (paneles que se montan tras DOMContentLoaded)
            setTimeout(function () { restoreNow(false); }, 1500);
            console.log('%c[APE-UI-PERSIST] activo v1.1.0 — APE_UI_PERSIST.status() para verificar', 'color:#22c55e;font-weight:bold;');
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();

        // registro del fichero LAB (cualquier input file cuyo id/name contenga 'lab')
        document.addEventListener('change', function (e) {
            var t = e.target;
            if (!t || t.type !== 'file' || !t.files || !t.files[0]) return;
            var idn = (t.id || '') + ' ' + (t.name || '');
            var f = t.files[0];
            // El importador del LAB crea un <input type=file> SIN id: se reconoce por el nombre del fichero.
            if (!/lab/i.test(idn) && !/(lab|calibrated|bulletproof)/i.test(f.name || '')) return;
            try {
                var rd = new FileReader();
                rd.onload = function () { noteLabFile(f, String(rd.result || '')); };
                rd.readAsText(f);
            } catch (err) { noteLabFile(f, ''); }
        }, true);
    }

    var API = {
        version: '1.1.0',
        saveNow: saveNow, restoreNow: restoreNow, clear: clear,
        exportState: exportState, importState: importState, status: status,
        noteLabFile: noteLabFile, labMeta: labMeta,
        _collect: collect, _apply: apply, _applyOne: applyOne,
        _keyOf: keyOf, _isSkipped: isSkipped, _sameValue: sameValue,
        _ambient: AMBIENT,
        KEY: KEY, LAB_META_KEY: LAB_META_KEY
    };
    global.APE_UI_PERSIST = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
