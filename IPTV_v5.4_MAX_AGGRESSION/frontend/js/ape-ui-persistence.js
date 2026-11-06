/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE UI PERSISTENCE TOTAL — v1.0.0 (2026-11-06)
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

    var SECRET_RX = /(pass(word)?|token|tok|secret|api[-_]?key|auth(orization)?|cookie|session[-_]?key)/i;
    var CONTROL_SEL = 'input[type="checkbox"],input[type="radio"],select,input[type="text"],input[type="number"],input[type="range"],input[type="search"],textarea';
    var DEFAULT_TAGS = { INPUT: 1, SELECT: 1, TEXTAREA: 1 };

    function isSkipped(el) {
        if (!el || !DEFAULT_TAGS[el.tagName]) return true;
        if (el.disabled) return true;
        var t = (el.getAttribute('type') || '').toLowerCase();
        if (t === 'password' || t === 'file' || t === 'hidden' || t === 'submit' || t === 'button') return true;
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

    function writeValue(el, v) {
        var t = (el.getAttribute('type') || '').toLowerCase();
        try {
            if (t === 'checkbox' || t === 'radio') {
                el.checked = !!v;
                if (t === 'radio' && v) el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            if (el.tagName === 'SELECT' && el.multiple && Array.isArray(v)) {
                for (var i = 0; i < el.options.length; i++) el.options[i].selected = v.indexOf(el.options[i].value) >= 0;
                el.dispatchEvent(new Event('change', { bubbles: true }));
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

    /** Aplica el estado. force=false → sólo controles que estén en su default. */
    function apply(doc, state, opts) {
        opts = opts || {};
        var applied = 0, skipped = 0, missing = 0;
        if (!doc || !state || !state.controls) return { applied: applied, skipped: skipped, missing: missing };
        var els = doc.querySelectorAll(CONTROL_SEL);
        var seen = {};
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (isSkipped(el)) continue;
            var k = keyOf(el);
            if (!k || !(k in state.controls)) continue;
            seen[k] = 1;
            if (!opts.force && !isDefault(el)) { skipped++; continue; }   // no pisar lo que el usuario tocó
            if (writeValue(el, state.controls[k])) applied++;
            else missing++;
        }
        for (var kk in state.controls) if (!seen[kk]) missing++;
        return { applied: applied, skipped: skipped, missing: missing };
    }

    // ── capa de almacenamiento ──────────────────────────────────────────────
    function safeSet(key, str) {
        try { localStorage.setItem(key, str); return true; }
        catch (e) { console.warn('[APE-UI-PERSIST] localStorage lleno/no disponible:', e.message); return false; }
    }
    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    var saveTimer = null;
    function saveNow() {
        if (typeof document === 'undefined') return null;
        var st = collect(document);
        var n = 0; for (var k in st.controls) n++;
        st._count = n;
        safeSet(KEY, JSON.stringify(st));
        return st;
    }
    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { saveTimer = null; saveNow(); }, DEBOUNCE_MS);
    }

    function loadState() {
        var raw = safeGet(KEY);
        if (!raw) return null;
        try { var s = JSON.parse(raw); return (s && s.controls) ? s : null; } catch (e) { return null; }
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
        console.log('%c[APE-UI-PERSIST] estado de UI borrado (el LAB intacto)', 'color:#f59e0b;');
        return true;
    }

    function exportState() { return safeGet(KEY) || JSON.stringify(collect(document)); }
    function importState(s) {
        try { var o = JSON.parse(s); if (!o || !o.controls) return false; safeSet(KEY, JSON.stringify(o)); restoreNow(true); return true; }
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
            // 2) captura global de cambios
            document.addEventListener('change', scheduleSave, true);
            document.addEventListener('input', scheduleSave, true);
            document.addEventListener('click', function (e) {
                var t = e.target;
                if (t && (t.type === 'checkbox' || t.type === 'radio')) scheduleSave();
            }, true);
            // 3) flush al cerrar/ocultar
            var flush = function () { saveNow(); };
            global.addEventListener('pagehide', flush);
            global.addEventListener('beforeunload', flush);
            document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
            // 4) paneles dinámicos: reaplica sólo a controles en default
            if (global.MutationObserver) {
                var mo = new global.MutationObserver(function (muts) {
                    var st = loadState();
                    if (!st) return;
                    for (var i = 0; i < muts.length; i++) {
                        var added = muts[i].addedNodes || [];
                        for (var j = 0; j < added.length; j++) {
                            var n = added[j];
                            if (!n || n.nodeType !== 1) continue;
                            if (n.matches && n.matches(CONTROL_SEL) && !isDefault(n)) continue;
                            apply(n, st, { force: false });
                            if (n.querySelectorAll) {
                                var inner = n.querySelectorAll(CONTROL_SEL);
                                for (var q = 0; q < inner.length; q++) apply(inner[q], st, { force: false });
                            }
                        }
                    }
                });
                mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
            }
            // 5) segunda pasada (paneles que se montan tras DOMContentLoaded)
            setTimeout(function () { restoreNow(false); }, 1500);
            console.log('%c[APE-UI-PERSIST] activo — APE_UI_PERSIST.status() para verificar', 'color:#22c55e;font-weight:bold;');
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
        version: '1.0.0',
        saveNow: saveNow, restoreNow: restoreNow, clear: clear,
        exportState: exportState, importState: importState, status: status,
        noteLabFile: noteLabFile, labMeta: labMeta,
        _collect: collect, _apply: apply, _keyOf: keyOf, _isSkipped: isSkipped,
        KEY: KEY, LAB_META_KEY: LAB_META_KEY
    };
    global.APE_UI_PERSIST = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);


