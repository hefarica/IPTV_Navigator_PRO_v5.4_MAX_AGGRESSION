#!/usr/bin/env node
/**
 * regen_headless.js — Regeneración HEADLESS, DINÁMICA e IDEMPOTENTE
 * ============================================================================
 * Ejecuta el emisor real (`m3u8-typed-arrays-ultimate.js`) sin navegador, con
 * stubs de DOM, y produce `<basename>_<MODO>.m3u8` (DEFAULT / 8K / 4K / OFF).
 *
 * USO
 *   node regen_headless.js <input.m3u8> [--mode default|8k|4k|0|both|all] [--out <dir>] [--deterministic]
 *
 *   --mode default   SIN flag `APE_FAKE_UHD` ⇒ ejercita el DEFAULT del emisor
 *                    (t62: '4k' seguro ⇒ 3840x2160 + L150/L153 + ancla :fake4k)
 *   --mode 8k        opt-in explícito 8K ⇒ 7680x4320 + L180/L183 + ancla :fake8k
 *   --mode 4k        '4k' explícito (debe ser ≡ default)
 *   --mode 0         kill-switch ⇒ resolución del perfil/probe, sin capa fake
 *   --mode both      8K + 4K (compatibilidad con t36; DEFAULT: both)
 *   --mode all       DEFAULT + 8K + 4K + 0 (la matriz completa de t62)
 *   --out <dir>         directorio de salida (default: junto a la entrada)
 *   --deterministic     fija Date/Math.random/performance/crypto ⇒ dos corridas
 *                       sobre la misma entrada producen BYTES IDÉNTICOS
 *
 * GARANTÍAS
 *   · NO modifica el emisor (solo lo lee; el export `window.APE_GEN` lo puso t53).
 *   · DINÁMICO: no hay ninguna aserción `=== 2754` ni ruta fija de entrada.
 *   · IDEMPOTENTE con --deterministic: SHA-256 iguales entre corridas.
 *   · Sin --deterministic: el SHA VARÍA (timestamp/nonce del emisor); se
 *     comparan solo los invariantes.
 *
 * VERIFICACIÓN por corrida
 *   `#EXTM3U` línea 1 · N/N canales · ancla del modo (`:fake4k` por defecto,
 *   `:fake8k` en opt-in, ninguna en OFF) · 0 tóxicos · `#EXT-X-APE-LAB-DNA` ·
 *   0 `L153` en STREAM-INF 8K · niveles coherentes con el modo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..', '..', '..');
const EMITTER = path.join(REPO, 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
    const a = argv.slice(2);
    const o = { inputs: [], mode: 'both', out: null, deterministic: false, determinismCheck: false };
    for (let i = 0; i < a.length; i++) {
        const t = a[i];
        if (t === '--mode') o.mode = a[++i];
        else if (t === '--out') o.out = a[++i];
        else if (t === '--deterministic') o.deterministic = true;
        else if (t === '--determinism-check') { o.deterministic = true; o.determinismCheck = true; }
        else if (t === '-h' || t === '--help') o.help = true;
        else if (!t.startsWith('--')) o.inputs.push(t);   // t59: N listas (ficheros o dirs)
    }
    return o;
}

// ── t62 · MODOS ────────────────────────────────────────────────────────────
// `modeTag` es lo que se inyecta como `APE_FAKE_UHD` / `fakeUhd`.
//   null  ⇒ NO se define la clave ⇒ el emisor aplica su DEFAULT ('4k' desde t62).
//   '0'   ⇒ kill-switch (perfil/probe, sin capa fake).
// `anchor` es la etiqueta `#EXT-X-APE-UPSCALE:` que debe aparecer por canal
//   (null ⇒ no debe aparecer ninguna).
const MODES = {
    'default': ['DEFAULT'],
    '8k': ['8K'],
    '4k': ['4K'],
    '0': ['OFF'],
    'both': ['8K', '4K'],          // compatibilidad t36 (sin flag ⇒ 8K+4K)
    'all': ['DEFAULT', '8K', '4K', 'OFF'],   // matriz t62 completa
};
const MODE_TAG = { 'DEFAULT': null, '8K': '8k', '4K': '4k', 'OFF': '0' };
const MODE_ANCHOR = { 'DEFAULT': ':fake4k', '8K': ':fake8k', '4K': ':fake4k', 'OFF': null };

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ── t59 · Parser de catálogo M3U Plus CON HERENCIA POR CANAL ───────────────
// Cada canal conserva SUS directivas (#EXTHTTP/#EXTVLCOPT/#KODIPROP/#EXT-X-APE-*)
// y TODOS sus atributos tvg-*/ape-* del EXTINF. Además se mapean las claves que
// el emisor espera (stream_id/name/stream_icon/category_name/url) para que la
// capa de declaración no borre la identidad del canal.
function parseCatalog(file) {
    const raw = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const ch = [];
    const header = [];
    let pending = null;
    const attrsOf = (s) => {
        const out = {};
        const re = /([A-Za-z0-9:_-]+)="([^"]*)"/g; let m;
        while ((m = re.exec(s)) !== null) out[m[1]] = m[2];
        return out;
    };
    const push = (c) => {
        c.index = ch.length;
        c.stream_id = c.tvgId !== '' ? c.tvgId : String(c.index + 1);
        c.stream_display_name = c.name;
        c.stream_icon = c.tvgLogo;
        c.category_name = c.groupTitle;
        ch.push(c);
    };
    for (const rawLine of raw) {
        const line = rawLine.trim();
        if (line === '') continue;
        if (line.startsWith('#EXTINF:')) {
            // Canal SIN URI (listas con huecos): se conserva para no perderlo.
            if (pending && !pending.url) push(pending);
            const comma = line.lastIndexOf(',');
            const attrs = attrsOf(line);
            pending = {
                tvgId: attrs['tvg-id'] || '',
                tvgName: attrs['tvg-name'] || (comma > -1 ? line.slice(comma + 1).trim() : ''),
                tvgLogo: attrs['tvg-logo'] || '',
                groupTitle: attrs['group-title'] || '',
                name: comma > -1 ? line.slice(comma + 1).trim() : '',
                tvg: {},                 // TODOS los tvg-* del input (herencia)
                ape: {},                 // atributos ape-* del input
                directives: [],          // TODAS las líneas #...(no EXTINF) del bloque
                extinfAttrs: attrs,
            };
            for (const [k, v] of Object.entries(attrs)) {
                if (/^tvg-/i.test(k)) pending.tvg[k] = v;
                else if (/^ape-/i.test(k)) pending.ape[k] = v;
            }
        } else if (pending && line.startsWith('#EXT-X-STREAM-INF')) {
            // [t82] ANTES de la rama generica de "#": si no, esta linea cae en
            // `pending.directives` y `codecHint` NUNCA se asigna (codigo muerto).
            const m = /CODECS="([^"]+)"/.exec(line);
            if (m && !pending.codecHint) pending.codecHint = (m[1].split(',')[0] || '').trim();
            // Se conserva como directiva: mantiene la garantia input-subset-output (t63).
            pending.directives.push(line);
        } else if (pending && line.startsWith('#')) {
            pending.directives.push(line);
        } else if (pending && line && !line.startsWith('#')) {
            pending.url = line; push(pending); pending = null;
        } else if (!pending) {
            header.push(line);           // cabecera de la lista (settings por lista)
        }
    }
    if (pending) { pending.url = pending.url || ''; push(pending); }
    return { channels: ch, header, settings: detectSettings(header) };
}

// ── t59 · Settings POR LISTA (desde su propia cabecera) ───────────────────
function detectSettings(header) {
    const txt = header.join('\n');
    const pick = (re) => { const m = txt.match(re); return m ? m[1].trim() : null; };
    const profile = pick(/^#EXT-X-APE-PROFILE:\s*(\S+)/m);
    const labExtras = pick(/^#EXT-X-APE-LAB-EXTRAS:\s*(\S+)/m);
    const declared = pick(/^#EXT-X-APE-CHANNELS:\s*(\d+)/m);
    const dna = pick(/^#EXT-X-APE-LAB-DNA:sha256=([0-9a-f]{8,64})/m);
    return {
        profile: profile || '(sin cabecera ⇒ P3 por defecto)',
        usedProfile: profile || 'P3',
        labExtras: labExtras === null ? '(sin cabecera ⇒ false)' : labExtras,
        labExtrasBool: labExtras === '1',
        channelsDeclared: declared === null ? '(sin cabecera)' : declared,
        dna: dna || '(sin cabecera)',
        headerLines: header.length,
        isOwnList: profile !== null || labExtras !== null || declared !== null,
    };
}

// ── t59 · DENYLIST: el input manda EXCEPTO en los 11 tóxicos ─────────────
// Sin esto, "el input manda" resucitaría Range/If-None-Match/... del EXTHTTP de
// la lista de entrada, rompería el gate `tóxicos = 0` y la reproducción real.
const TOXIC_KEYS = ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority',
    'Upgrade-Insecure-Requests', 'Connection', 'Keep-Alive', 'Proxy-Connection',
    'Sec-Fetch-', 'Sec-CH-UA'];
function stripToxic(obj) {
    const out = {}; let removed = 0;
    for (const [k, v] of Object.entries(obj || {})) {
        const low = k.toLowerCase();
        if (TOXIC_KEYS.some((t) => low === t.toLowerCase() || (t.endsWith('-') && low.startsWith(t.toLowerCase())))) removed++;
        else out[k] = v;
    }
    return { clean: out, removed };
}

// ── t59 · Herencia: el input MANDA y no se pierde ninguna directiva ───────
// Precedencia DOCUMENTADA (v2, sin duplicar):
//   · #EXTHTTP  : merge JSON con **el input por encima** del emisor (union de
//                 claves; si choca, gana el input). Una sola línea en el bloque.
//   · resto (#EXTVLCOPT/#KODIPROP/#EXT-X-APE-*): se comparan por **tag + clave**
//                 (`TAG:clave=valor`). Si el emisor ya emite esa clave, se
//                 SOBRESCRIBE con el valor del input (el input manda) sin crear
//                 una línea duplicada; si no existe, se inserta en orden de input.
//                 Así una lista extranjera conserva TODO y el catálogo propio
//                 (que ya trae la capa del emisor) no se duplica.
//   · EXTINF    : tvg-*/ape-* del input se imponen (valor exacto).
function directiveKey(line) {
    const i = line.indexOf(':');
    if (i === -1) return line;
    const tag = line.slice(0, i);
    const rest = line.slice(i + 1);
    const eq = rest.indexOf('=');
    return eq === -1 ? tag + ':' + rest : tag + ':' + rest.slice(0, eq);
}

function mergeInheritance(text, channels, modeOverride) {
    // t59 · Selección AUTOMÁTICA del modo de herencia (no depende del caller):
    //   · lista AUTODESCRIPTIVA (trae su capa APE: ≥50 `#EXT-X-APE-*` por canal)
    //     ⇒ `passthrough`: el input manda verbatim; el emisor sólo añade la
    //       capa de DECLARACIÓN (STREAM-INF / UPSCALE / STREAM-TRUTH / …).
    //   · lista AJENA/pequeña ⇒ `dedupe`: merge por tag+clave sin duplicar.
    const _ape = channels.reduce((s, c) => s + (c.directives || []).filter((l) => l.startsWith('#EXT-X-APE-')).length, 0);
    const mode = modeOverride || ((channels.length > 0 && (_ape / channels.length) >= 50) ? 'passthrough' : 'dedupe');
    const lines = text.split('\n');
    const starts = [];
    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#EXTINF:')) starts.push(i);
    const stats = { channels: starts.length, injectedDirectives: 0, overwrittenDirectives: 0, mergedExthttp: 0, extinfFixed: 0, lost: [], channelsWithLoss: 0 };
    const out = [];
    const headerEnd = starts.length ? starts[0] : lines.length;
    for (let i = 0; i < headerEnd; i++) out.push(lines[i]);
    if (!starts.length) { stats.text = lines.join('\n'); return stats; }

    const setAttr = (line, name, val) => {
        if (val === undefined || val === null || val === '') return line;
        const safe = String(val).replace(/"/g, '');
        const re = new RegExp('(\\s' + name + '=)"[^"]*"');
        if (re.test(line)) return line.replace(re, '$1"' + safe + '"');
        return line.replace(/^(#EXTINF:-?[\d.]+\s)/, '$1' + name + '="' + safe + '" ');
    };

    // Declaración: lo único que el emisor DEBE añadir/corregir por canal.
    const DECL_RE = /^#EXT-X-(STREAM-INF|APE-UPSCALE|APE-STREAM-TRUTH|APE-FPS-SOURCE|APE-CODEC-SOURCE|APE-CODEC-FALLBACK-CHAIN|APE-PERCEPTUAL-4K)/;
    for (let bi = 0; bi < starts.length; bi++) {
        const s = starts[bi];
        const e = (bi + 1 < starts.length) ? starts[bi + 1] : lines.length;
        const inputCh = channels[bi];
        let extinf = lines[s];
        const body = lines.slice(s + 1, e);

        // ── MODO PASSTHROUGH (lista AUTODESCRIPTIVA: trae su propia capa APE) ──
        // La herencia del input manda: se conservan SUS directivas verbatim y el
        // emisor sólo aporta la capa de DECLARACIÓN (STREAM-INF, UPSCALE, TRUTH…).
        if (mode === 'passthrough' && inputCh) {
            extinf = setAttr(extinf, 'tvg-id', inputCh.tvgId);
            extinf = setAttr(extinf, 'tvg-name', inputCh.tvgName);
            extinf = setAttr(extinf, 'tvg-logo', inputCh.tvgLogo);
            extinf = setAttr(extinf, 'group-title', inputCh.groupTitle);
            for (const [k, v] of Object.entries(inputCh.tvg || {})) extinf = setAttr(extinf, k, v);
            for (const [k, v] of Object.entries(inputCh.ape || {})) extinf = setAttr(extinf, k, v);

            // [t83] La DECLARACION heredada se EXCLUYE del cuerpo: el emisor la
            // SUSTITUYE con la suya (si no, 2 STREAM-INF por canal). El resto
            // de directivas del input se conserva verbatim (t63 input ⊆ output).
            const inDirs = (inputCh.directives || []).filter((l) => !l.startsWith('#EXTHTTP:') && !DECL_RE.test(l));
            const inUrl = inputCh.url || '';
            const emDecl = body.filter((l) => DECL_RE.test(l));
            const emUrl = body.filter((l) => l && !l.startsWith('#')).pop() || inUrl;
            const ethIn = (inputCh.directives || []).filter((l) => l.startsWith('#EXTHTTP:'));
            let ethLine = null;
            if (ethIn.length) {
                const j = {}; let ok = true;
                for (const l of ethIn) { try { Object.assign(j, JSON.parse(l.slice(9))); } catch (_) { ok = false; } }
                if (ok) { const st = stripToxic(j); stats.toxicStripped = (stats.toxicStripped || 0) + st.removed; ethLine = '#EXTHTTP:' + JSON.stringify(st.clean); }
            }
            const newBody = [].concat(inDirs, ethLine ? [ethLine] : [], emDecl, [emUrl]);
            const blockText = [extinf].concat(newBody).join('\n');
            const lost = [];
            const finalAttrs = (extinf.match(/([A-Za-z0-9:_-]+)="([^"]*)"/g) || []).join(' ');
            for (const d of (inputCh.directives || [])) {
                if (d.startsWith('#EXTHTTP:')) continue;                       // ya filtrado (tóxicos)
                    if (DECL_RE.test(d)) continue;   // [t69] declaracion SUSTITUIDA por diseno, no perdida
                    if (blockText.indexOf(d) === -1) lost.push(directiveKey(d));
            }
            for (const [k, v] of Object.entries(inputCh.tvg || {})) if (finalAttrs.indexOf(k + '="' + String(v).replace(/"/g, '') + '"') === -1) lost.push(k);
            if (lost.length) { stats.channelsWithLoss++; if (stats.lost.length < 20) stats.lost.push({ index: bi, tvgId: inputCh.tvgId, lost: lost.slice(0, 5) }); }
            if (extinf !== lines[s]) stats.extinfFixed++;
            stats.passthroughBlocks = (stats.passthroughBlocks || 0) + 1;
            out.push(extinf, ...newBody);
            continue;
        }

        // (a) EXTINF: identidad y atributos del input MANDA
        if (inputCh) {
            extinf = setAttr(extinf, 'tvg-id', inputCh.tvgId);
            extinf = setAttr(extinf, 'tvg-name', inputCh.tvgName);
            extinf = setAttr(extinf, 'tvg-logo', inputCh.tvgLogo);
            extinf = setAttr(extinf, 'group-title', inputCh.groupTitle);
            for (const [k, v] of Object.entries(inputCh.tvg || {})) extinf = setAttr(extinf, k, v);
            for (const [k, v] of Object.entries(inputCh.ape || {})) extinf = setAttr(extinf, k, v);
        }

        // (b) directivas: EXTHTTP por JSON; el resto por tag+clave (input manda)
        const ethIn = (inputCh && inputCh.directives || []).filter((l) => l.startsWith('#EXTHTTP:'));
        const others = (inputCh && inputCh.directives || []).filter((l) => !l.startsWith('#EXTHTTP:'));
        const slots = new Map();                 // key → índice dentro de body
        for (let j = 0; j < body.length; j++) {
            const l = body[j];
            if (l.startsWith('#') && !l.startsWith('#EXTHTTP:')) {
                const k = directiveKey(l);
                if (!slots.has(k)) slots.set(k, j);
            }
        }
        for (const l of others) {
            const k = directiveKey(l);
            if (slots.has(k)) {
                const j = slots.get(k);
                // [t69] FIX: la DECLARACIÓN del emisor MANDA. `directiveKey` colapsa
                // ambos `#EXT-X-STREAM-INF:` a la misma clave, así que el heredado
                // pisaba la declaración 4K/8K generada y la lista se anunciaba 4K
                // con la RESOLUTION del origen. Si ya hay una declaración del
                // emisor, NO se sobrescribe.
                if (DECL_RE.test(l) && DECL_RE.test(body[j])) {
                    stats.declKeptEmitter = (stats.declKeptEmitter || 0) + 1;
                } else if (body[j] !== l) { body[j] = l; stats.overwrittenDirectives++; }
            } else {
                slots.set(k, body.length); body.push(l); stats.injectedDirectives++;
            }
        }
        // t63 · GARANTÍA ESTRUCTURAL: cualquier línea del input que no esté YA
        // presente verbatim se anexa tal cual al final del cuerpo ⇒ input ⊆ output
        // por construcción, sin duplicar (si ya está, no se añade).
        // [t69] EXCEPCIÓN: las líneas de DECLARACIÓN no se re-anexan. Si se
        // añadieran, el `#EXT-X-STREAM-INF` heredado volvería al final y
        // tendríamos DOS por canal (violando el anti-509).
        for (const l of others) {
            if (DECL_RE.test(l)) continue;
            if (!body.includes(l)) { body.push(l); stats.injectedDirectives++; stats.appendedVerbatim = (stats.appendedVerbatim || 0) + 1; }
        }
        if (ethIn.length) {
            const inJson = {}; let ok = true;
            for (const l of ethIn) { try { Object.assign(inJson, JSON.parse(l.slice(9))); } catch (_) { ok = false; } }
            if (ok) {
                const stripped = stripToxic(inJson);          // t59: los 11 tóxicos NUNCA ganan
                stats.toxicStripped = (stats.toxicStripped || 0) + stripped.removed;
                const j = body.findIndex((l) => l.startsWith('#EXTHTTP:'));
                if (j === -1) { body.unshift('#EXTHTTP:' + JSON.stringify(stripped.clean)); stats.injectedDirectives++; }
                else {
                    let em = {}; try { em = JSON.parse(body[j].slice(9)) || {}; } catch (_) { em = {}; }
                    body[j] = '#EXTHTTP:' + JSON.stringify(Object.assign({}, em, stripped.clean));
                    stats.mergedExthttp++;
                }
            }
        }

        // (c) GATE por canal: input ⊆ output
        const blockText = [extinf].concat(body).join('\n');
        const blockAttrs = (extinf.match(/([A-Za-z0-9:_-]+)="([^"]*)"/g) || []).join(' ');
        const lost = [];
        // Se compara por clave→valor (el input puede traer la MISMA clave 2 veces:
        // gana la última, y eso no es pérdida sino conflicto resuelto y documentado).
        // t63: pertenencia EXACTA de línea (no por prefijo de clave, que daba
        // falsos negativos con `TAG:clave=valor`). Los duplicados de clave del
        // input se resuelven last-wins y se reportan como CONFLICTO, no como pérdida.
        const seenKeys = new Map();
        for (const d of (inputCh && inputCh.directives || [])) {
            if (d.startsWith('#EXTHTTP:')) {
                let j = {}; try { j = JSON.parse(d.slice(9)); } catch (_) { j = {}; }
                const got = blockText.match(/#EXTHTTP:([^\n]*)/);
                let g = {}; try { g = JSON.parse(got ? got[1] : '{}'); } catch (_) { g = {}; }
                for (const [k, v] of Object.entries(j)) {
                    if (TOXIC_KEYS.some((t) => k.toLowerCase() === t.toLowerCase() || (t.endsWith('-') && k.toLowerCase().startsWith(t.toLowerCase())))) continue;
                    if (String(g[k]) !== String(v)) lost.push('EXTHTTP.' + k);
                }
                continue;
            }
            const k = directiveKey(d);
            if (seenKeys.has(k) && seenKeys.get(k) !== d) {
                stats.conflicts = (stats.conflicts || 0) + 1;
                if ((stats.conflictList || []).length < 20) (stats.conflictList = stats.conflictList || []).push({ index: bi, key: k, kept: 'last-wins' });
            }
            seenKeys.set(k, d);
            // [t70] Las DECLARACIONES se SUSTITUYEN por diseno (el emisor manda), no se pierden.
            if (DECL_RE.test(d)) { stats.declSuperseded = (stats.declSuperseded || 0) + 1; continue; }
            if (!body.includes(d)) lost.push(k);      // pertenencia exacta
        }
        for (const [k, v] of Object.entries((inputCh && inputCh.tvg) || {})) {
            if (blockAttrs.indexOf(k + '="' + String(v).replace(/"/g, '') + '"') === -1) lost.push(k);
        }
        if (lost.length) { stats.channelsWithLoss++; if (stats.lost.length < 20) stats.lost.push({ index: bi, tvgId: inputCh && inputCh.tvgId, lost: lost.slice(0, 5) }); }
        if (extinf !== lines[s]) stats.extinfFixed++;

        out.push(extinf, ...body);
    }
    stats.text = out.join('\n');
    return stats;
}

// ── Sandbox de navegador + primitivas deterministas ────────────────────────
function makeSandbox(mode, deterministic) {
    const store = new Map();
    const noop = () => { };
    const el = () => ({
        style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        appendChild: noop, removeChild: noop, setAttribute: noop, getAttribute: () => null,
        addEventListener: noop, removeEventListener: noop, append: noop, remove: noop,
        innerHTML: '', textContent: '', value: '', children: [], dataset: {},
        querySelector: () => null, querySelectorAll: () => [], getContext: () => null,
        focus: noop, click: noop, scrollIntoView: noop,
    });
    const documentStub = {
        createElement: el, createElementNS: el, createTextNode: () => el(),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        getElementsByTagName: () => [], getElementsByClassName: () => [],
        addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
        body: el(), head: el(), documentElement: el(),
        cookie: '', readyState: 'complete', hidden: false, visibilityState: 'visible',
        createDocumentFragment: el, createComment: () => el(), fonts: { ready: Promise.resolve(), add: noop },
    };
    const localStorageStub = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); }, clear: () => store.clear(),
        key: (i) => Array.from(store.keys())[i] ?? null, get length() { return store.size; },
    };

    // ── Determinismo ──────────────────────────────────────────────────────
    const FIXED_MS = 1700000000000;           // 2023-11-14T22:13:20Z
    const RealDate = Date;
    let seed = 0xC0FFEE;                      // semilla fija ⇒ PRNG reproducible
    const seededRandom = () => {
        seed ^= seed << 13; seed >>>= 0;
        seed ^= seed >>> 17;
        seed ^= seed << 5; seed >>>= 0;
        return seed / 4294967296;
    };
    let clock = 0;

    let DateStub = RealDate;
    let randomFn = Math.random;
    let perfNow = () => Date.now();
    let cryptoStub = globalThis.crypto;

    if (deterministic) {
        DateStub = function D(...args) {
            if (!(this instanceof D)) return new RealDate(FIXED_MS).toString();
            if (args.length === 0) return new RealDate(FIXED_MS);
            return new RealDate(...args);
        };
        DateStub.prototype = RealDate.prototype;
        DateStub.now = () => FIXED_MS;
        DateStub.parse = RealDate.parse;
        DateStub.UTC = RealDate.UTC;

        randomFn = seededRandom;
        perfNow = () => (clock += 1);
        cryptoStub = {
            getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = 0; return a; },
            randomUUID: () => '00000000-0000-4000-8000-000000000000',
        };
    }

    const MathStub = Object.create(Math);
    MathStub.random = randomFn;

    const sandbox = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, table: noop },
        setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
        Promise, Object, Array, String, Number, Boolean, RegExp, Error, TypeError,
        Map, Set, WeakMap, WeakSet, Symbol, Buffer, TextEncoder, TextDecoder,
        URL, URLSearchParams, Intl, parseInt, parseFloat, isNaN, isFinite,
        encodeURIComponent, decodeURIComponent, escape, unescape, atob, btoa,
        JSON, Math: MathStub, Date: DateStub,
        performance: { now: perfNow, timeOrigin: 0 },
        crypto: cryptoStub,
        ReadableStream: (typeof ReadableStream !== 'undefined' ? ReadableStream : undefined),
        WritableStream: (typeof WritableStream !== 'undefined' ? WritableStream : undefined),
        TransformStream: (typeof TransformStream !== 'undefined' ? TransformStream : undefined),
        AbortController, AbortSignal, structuredClone,
        // t62 · DEFAULT = NO definir la clave ⇒ el emisor aplica su default ('4k').
        // (undefined se comporta igual que la clave ausente en el resolver del emisor)
        APE_FAKE_UHD: (mode === null || mode === undefined) ? undefined : mode,
        document: documentStub, localStorage: localStorageStub, sessionStorage: localStorageStub,
        location: { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:', host: 'localhost', pathname: '/', search: '', hash: '' },
        navigator: { userAgent: 'node-headless', language: 'es', languages: ['es'], platform: 'node', hardwareConcurrency: 8, onLine: true },
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop }),
        requestAnimationFrame: (cb) => setTimeout(() => cb(perfNow()), 0),
        cancelAnimationFrame: (id) => clearTimeout(id),
        fetch: () => Promise.resolve({ ok: false, status: 0, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
        XMLHttpRequest: function () { this.open = noop; this.send = noop; this.setRequestHeader = noop; this.addEventListener = noop; this.readyState = 0; this.status = 0; this.responseText = ''; },
        alert: noop, confirm: () => false, prompt: () => null,
        Blob: function (p) { this.parts = p; this.size = 0; },
        FileReader: function () { this.readAsText = noop; this.addEventListener = noop; },
        Worker: function () { this.postMessage = noop; this.addEventListener = noop; this.terminate = noop; },
        CustomEvent: function (t, o) { this.type = t; this.detail = (o || {}).detail; },
        Event: function (t) { this.type = t; },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        devicePixelRatio: 1, innerWidth: 1920, innerHeight: 1080,
        scrollTo: noop, focus: noop, blur: noop, print: noop,
        HUD_TYPED_ARRAYS: undefined, APE_PROFILES_CONFIG: undefined, app: undefined,
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.top = sandbox;
    sandbox.parent = sandbox;
    return sandbox;
}

// ── Cargar el emisor (lee; NO modifica) ────────────────────────────────────
function loadEmitter(mode, deterministic) {
    const raw = fs.readFileSync(EMITTER);
    const before = sha256(raw);
    const src = raw.toString('utf8')
        + '\n;try{window.__APE_GEN__ = generateM3U8Stream;}catch(e){window.__APE_GEN_ERR__=e.message;}\n';
    const sandbox = makeSandbox(mode, deterministic);
    const ctx = vm.createContext(sandbox);
    let loadError = null;
    try {
        vm.runInContext(src, ctx, { filename: 'm3u8-typed-arrays-ultimate.js', timeout: 120000 });
    } catch (e) {
        loadError = (e && (e.stack || e.message)) || String(e);
    }
    const after = sha256(fs.readFileSync(EMITTER));
    return {
        sandbox,
        fn: sandbox.window.APE_GEN || sandbox.window.__APE_GEN__,
        exportErr: sandbox.window.__APE_GEN_ERR__,
        loadError,
        emitterUnchanged: before === after,
        emitterHash: before,
    };
}

// ── Captura del stream de salida ───────────────────────────────────────────
async function drainStream(out) {
    if (!out) return null;
    if (typeof out === 'string') return out;
    const dec = new TextDecoder();
    if (typeof out.getReader === 'function') {
        const r = out.getReader(); let s = '';
        for (;;) { const { done, value } = await r.read(); if (done) break; s += (typeof value === 'string') ? value : dec.decode(value, { stream: true }); }
        return s + dec.decode();
    }
    if (typeof out[Symbol.asyncIterator] === 'function') {
        let s = ''; for await (const c of out) s += (typeof c === 'string') ? c : dec.decode(c, { stream: true });
        return s + dec.decode();
    }
    for (const k of ['content', 'text', 'm3u8', 'list', 'playlist', 'output', 'data', 'result']) {
        if (typeof out[k] === 'string' && out[k].length > 0) return out[k];
    }
    return null;
}

// ── Verificación (por origen, dinámica) ────────────────────────────────────
// ── t64 · DETECTOR DE TÓXICOS EN AMBAS FORMAS (plana y JSON) ──────────────
// El hallazgo de t62: el `#EXTHTTP` es JSON, así que buscar solo la forma plana
// (`Range: bytes=0-`) subcontaba. Se cuentan las DOS formas por CLAVE EXACTA.
const TOXIC_SIX = ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority', 'Upgrade-Insecure-Requests'];
const TOX_PLAIN = ['Range: bytes=', 'If-None-Match', 'If-Modified-Since', 'TE: trailers', 'Priority: u=0', 'Upgrade-Insecure-Requests'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Cuenta las 6 claves en forma JSON ("Range":"…") — la que el detector antiguo no veía.
function countToxicJson(text) {
    const byKey = {}; let total = 0;
    for (const k of TOXIC_SIX) {
        const n = (text.match(new RegExp('"' + esc(k) + '"\\s*:', 'gi')) || []).length;
        if (n) { byKey[k] = n; total += n; }
    }
    return { total, byKey };
}
// Cuenta las formas planas (contexto de header, no JSON).
function countToxicPlain(text) {
    const byKey = {}; let total = 0;
    for (const p of TOX_PLAIN) {
        const n = text.split(p).length - 1;
        if (n) { byKey[p] = n; total += n; }
    }
    return { total, byKey };
}
// Canales (bloques EXTINF) que contienen al menos un tóxico en cualquier forma.
function toxicChannels(text) {
    const lines = text.split('\n');
    let cur = null, bad = 0; const ids = [];
    for (const l of lines) {
        if (l.startsWith('#EXTINF:')) {
            if (cur && cur.hit) { bad++; if (ids.length < 5) ids.push(cur.id); }
            cur = { id: (l.match(/tvg-id="([^"]*)"/) || [])[1] || '?', hit: false };
            continue;
        }
        if (!cur || cur.hit) continue;
        const j = l.match(/"(Range|If-None-Match|If-Modified-Since|TE|Priority|Upgrade-Insecure-Requests)"\s*:/i);
        if (j || TOX_PLAIN.some((p) => l.indexOf(p) !== -1)) cur.hit = true;
    }
    if (cur && cur.hit) { bad++; if (ids.length < 5) ids.push(cur.id); }
    return { channels: bad, sample: ids };
}

function verify(text, label, expectedChannels, inherit) {
    const lines = text.split('\n');
    const count = (re) => (text.match(re) || []).length;

    // Niveles POR ORIGEN: `L153` en metadata no es freeze; en STREAM-INF 8K sí.
    const byOrigin = { streamInf: 0, iframeStreamInf: 0, other: 0, byTag: {} };
    let streamInfTotal = 0, streamInf8k = 0, streamInf8kL153 = 0;
    for (const raw of lines) {
        const ln = raw.trimEnd();
        if (ln.startsWith('#EXT-X-STREAM-INF')) {
            streamInfTotal++;
            if (/RESOLUTION=7680x4320/.test(ln)) {
                streamInf8k++;
                if (ln.indexOf('L153') !== -1) streamInf8kL153++;
            }
        }
        if (ln.indexOf('L153') === -1) continue;
        const tag = ln.split(':')[0].trim();
        byOrigin.byTag[tag] = (byOrigin.byTag[tag] || 0) + 1;
        if (ln.startsWith('#EXT-X-STREAM-INF')) byOrigin.streamInf++;
        else if (ln.startsWith('#EXT-X-I-FRAME-STREAM-INF')) byOrigin.iframeStreamInf++;
        else byOrigin.other++;
    }

    const tPlain = countToxicPlain(text);
    const tJson = countToxicJson(text);
    const tChan = toxicChannels(text);
    const anchor = MODE_ANCHOR[label];
    const r = {
        label,
        firstLineIsExtM3U: /^#EXTM3U(\s|$)/.test(String(lines[0] || '').trim()),
        channelsIn: expectedChannels,
        extinf: count(/^#EXTINF/gm),
        dnaTag: count(/^#EXT-X-APE-LAB-DNA:/gm),
        anchors: anchor ? (text.split(anchor).length - 1) : 0,
        upscaleFake8k: count(/^#EXT-X-APE-UPSCALE:fake8k/gm),
        upscaleFake4k: count(/^#EXT-X-APE-UPSCALE:fake4k/gm),
        toxic: tPlain.total + tJson.total,               // t64: plana + JSON (6/6)
        toxicPlain: tPlain, toxicJson: tJson, toxicChannels: tChan,
        streamInfTotal, streamInf8k, streamInf8kL153,
        FREEZE_POISON: streamInf8kL153 > 0,
        L153_byOrigin: byOrigin,
        L180: count(/L180/g), L183: count(/L183/g), L150: count(/L150/g), L153: count(/L153/g),
        res7680: count(/RESOLUTION=7680x4320/g), res3840: count(/RESOLUTION=3840x2160/g),
        bytes: Buffer.byteLength(text, 'utf8'),
        sha256: sha256(Buffer.from(text, 'utf8')),
    };
    const fails = [];
    if (!r.firstLineIsExtM3U) fails.push('`#EXTM3U` no es la línea 1');
    if (r.extinf !== expectedChannels) fails.push(`canales ${r.extinf} != entrada ${expectedChannels}`);
    if (anchor) {
        if (r.anchors < expectedChannels) fails.push(`anclas ${anchor} = ${r.anchors} < ${expectedChannels}`);
    } else if (r.upscaleFake8k !== 0 || r.upscaleFake4k !== 0) {
        fails.push(`modo OFF no debe emitir anclas fake (fake8k=${r.upscaleFake8k}, fake4k=${r.upscaleFake4k})`);
    }
    // ── t62 · EXPECTATIVAS POR MODO (anti-deriva del DEFAULT) ──────────────
    // DEFAULT ≡ '4k' seguro: ancla fake4k por canal y CERO fake8k. Si alguien
    // revierte `APE_FAKE_UHD_DEFAULT` a '8k', el DEFAULT emite :fake8k y esta
    // comprobación hace caer el gate (además de fake_uhd_assert §[8]).
    if (label === 'DEFAULT' || label === '4K') {
        if (r.upscaleFake8k !== 0) fails.push(`modo ${label}: ${r.upscaleFake8k} anclas :fake8k (el default debe ser 4K)`);
        if (r.upscaleFake4k < expectedChannels) fails.push(`modo ${label}: anclas :fake4k ${r.upscaleFake4k} < ${expectedChannels}`);
        if (r.streamInf8kL153 > 0) fails.push(`modo ${label}: L153 en STREAM-INF 8K`);
    }
    if (label === '8K') {
        if (r.upscaleFake8k < expectedChannels) fails.push(`modo 8K: anclas :fake8k ${r.upscaleFake8k} < ${expectedChannels}`);
        if (r.streamInf8k < expectedChannels) fails.push(`modo 8K: STREAM-INF con 7680x4320 ${r.streamInf8k} < ${expectedChannels}`);
    }
    if (tPlain.total !== 0) fails.push(`tóxicos planos = ${tPlain.total} (${JSON.stringify(tPlain.byKey)})`);
    if (tJson.total !== 0) fails.push(`tóxicos JSON = ${tJson.total} (${JSON.stringify(tJson.byKey)}) en ${tChan.channels} canal(es)`);
    if (r.dnaTag < 1) fails.push('falta `#EXT-X-APE-LAB-DNA`');
    if (r.FREEZE_POISON) fails.push(`FREEZE: ${r.streamInf8kL153} STREAM-INF 8K con L153`);
    // ── t59 · GATE DE HERENCIA (input ⊆ output, canal por canal) ──────────
    if (inherit) {
        r.inherit = {
            injected: inherit.injectedDirectives,
            mergedExthttp: inherit.mergedExthttp,
            extinfFixed: inherit.extinfFixed,
            lostTotal: inherit.lost.reduce((n, x) => n + x.lost.length, 0),
            channelsWithLoss: inherit.channelsWithLoss,
            sample: inherit.lost.slice(0, 3),
        };
        if (inherit.channelsWithLoss > 0) {
            fails.push(`HERENCIA: ${inherit.channelsWithLoss} canal(es) con pérdida (${r.inherit.lostTotal} directiva(s))`);
        }
    } else {
        r.inherit = null;
    }
    r.fails = fails;
    r.ok = fails.length === 0;
    r.invariants = { channels: r.extinf, anchors: r.anchors, toxic: r.toxic, dnaTag: r.dnaTag, freeze: r.streamInf8kL153, levels: { L180: r.L180, L183: r.L183, L150: r.L150, L153: r.L153 } };
    return r;
}

// ── main (t59: MULTI-LISTA + herencia + determinismo) ─────────────────────
async function main() {
    const opt = parseArgs(process.argv);
    if (opt.help) {
        console.log('uso: node regen_headless.js [<lista|dir> ...] [--mode default|8k|4k|0|both|all] [--out <dir>] [--deterministic] [--determinism-check]');
        console.log('  sin argumentos: catalogo del repo + fixture con directivas propias (multi-lista por defecto)');
        console.log('  --mode default = SIN flag (default del emisor, t62: 4k seguro) · 8k = opt-in · 0 = sin capa fake · all = los 4');
        return 0;
    }
    if (!MODES[opt.mode]) { console.error(`FATAL: --mode inválido '${opt.mode}' (default|8k|4k|0|both|all)`); return 2; }
    if (!fs.existsSync(EMITTER)) { console.error(`FATAL: no existe el emisor '${EMITTER}'`); return 2; }

    // ── Multi-lista: N entradas (ficheros o directorios) ⇒ N pares de salidas
    let inputs = opt.inputs || [];
    if (!inputs.length) {
        const def = path.join(REPO, 'downloaded_list.m3u8');
        const fx = path.join(HERE, 'fixtures', 'mini_inherit_6.m3u8');
        if (fs.existsSync(def)) inputs.push(def);
        if (fs.existsSync(fx)) inputs.push(fx);
    }
    const expanded = [];
    for (const it of inputs) {
        if (fs.existsSync(it) && fs.statSync(it).isDirectory()) {
            for (const f of fs.readdirSync(it).sort()) if (/\.m3u8?$/i.test(f)) expanded.push(path.join(it, f));
        } else expanded.push(it);
    }
    for (const f of expanded) if (!fs.existsSync(f)) { console.error(`FATAL: no existe la entrada '${f}'`); return 2; }
    if (!expanded.length) { console.error('FATAL: sin entradas'); return 2; }

    console.log(`══ regen_headless · MULTI-LISTA · ${expanded.length} lista(s) · modo=${opt.mode} · deterministic=${opt.deterministic}`);
    const report = { tool: 'regen_headless', at: new Date().toISOString(), mode: opt.mode, deterministic: opt.deterministic, lists: [] };
    let allOk = true;

    for (const input of expanded) {
        const parsed = parseCatalog(input);
        const channels = parsed.channels;
        const n = channels.length;
        const base = path.basename(input).replace(/\.(m3u8?|M3U8?)$/, '');
        const outDir = opt.out ? opt.out : path.dirname(path.resolve(input));
        fs.mkdirSync(outDir, { recursive: true });

        const L = {
            input, basename: base, outDir, channelsParsed: n,
            settings: parsed.settings,
            inheritedDirectives: channels.reduce((s, c) => s + (c.directives || []).length, 0),
            inheritedTvgAttrs: channels.reduce((s, c) => s + Object.keys(c.tvg || {}).length, 0),
            // t59: si la lista de entrada ya trae la capa APE (≈714 líneas/canal), se
            // genera con includeLabExtras=true para que el emisor emita SU capa y el
            // merge case por clave en vez de inyectar la entrada entera (sin duplicar).
            apePerChannel: +(channels.reduce((s, c) => s + (c.directives || []).filter((l) => l.startsWith('#EXT-X-APE-')).length, 0) / Math.max(1, n)).toFixed(1),
            inheritMode: null, // se fija abajo
            runs: [],
        };
        console.log(`\n── ${base} · ${n} canales · settings: profile=${parsed.settings.profile} labExtras=${parsed.settings.labExtras} declarados=${parsed.settings.channelsDeclared}`);
        if (!parsed.settings.isOwnList) console.log('   (la lista NO trae cabecera APE propia ⇒ se aplica el perfil por defecto P3 SOLO a esta lista)');

        for (const label of MODES[opt.mode]) {
            const modeTag = MODE_TAG[label];
            const gen = async () => {
                const r = loadEmitter(modeTag, opt.deterministic);
                const run = { label, modeTag, emitterUnchanged: r.emitterUnchanged, loadError: r.loadError, exportErr: r.exportErr, exportAvailable: typeof r.fn === 'function' };
                if (typeof r.fn !== 'function') return { run, text: null };
                let out;
                try {
                    // t62 · DEFAULT ⇒ NO se pasa `fakeUhd`: el emisor aplica su default ('4k').
                    const genOpts = {
                        profile: parsed.settings.usedProfile || 'P3', hud: false,
                        includeLabExtras: (parsed.settings.labExtrasBool === true) || (L.apePerChannel >= 50),
                        lab_metadata: { dna_sha256: 'regen-headless' },
                    };
                    if (modeTag !== null && modeTag !== undefined) genOpts.fakeUhd = modeTag;
                    out = r.fn(channels, genOpts);
                    out = await drainStream(out);
                } catch (e) { run.verdict = 'ERROR'; run.error = String((e && e.message) || e); return { run, text: null }; }
                if (typeof out !== 'string' || out.length === 0) { run.verdict = 'BLOCKED'; run.reason = 'la captura no devolvió texto'; return { run, text: null }; }
                return { run, text: out };
            };

            const A = await gen();
            if (!A.text) { L.runs.push(A.run); allOk = false; continue; }
            const inh = mergeInheritance(A.text, channels, L.inheritMode);
            const v = verify(inh.text, label, n, inh);
            const file = path.join(outDir, `${base}_${label}.m3u8`);
            fs.writeFileSync(file, inh.text, 'utf8');

            // Determinismo: dos corridas ⇒ SHA idéntico (auto en listas pequeñas, opt-in en grandes)
            const wantDet = opt.deterministic && (opt.determinismCheck || n <= 50);
            let det = null;
            if (wantDet) {
                const B = await gen();
                if (B.text) {
                    const inhB = mergeInheritance(B.text, channels, L.inheritMode);
                    const shaA = sha256(Buffer.from(inh.text, 'utf8'));
                    const shaB = sha256(Buffer.from(inhB.text, 'utf8'));
                    det = { equal: shaA === shaB, shaA, shaB };
                    if (!det.equal) { v.fails.push(`determinismo: SHA distinto entre corridas (${shaA.slice(0, 12)} != ${shaB.slice(0, 12)})`); v.ok = false; }
                }
            }
            const run = Object.assign(A.run, {
                file, verify: v, deterministic: det,
                verdict: v.ok ? 'OK' : 'FAIL',
            });
            if (!v.ok) allOk = false;
            L.runs.push(run);

            console.log(`\n   [${label}] ${path.basename(file)}  ${v.bytes} B`);
            console.log(`     SHA-256      : ${v.sha256}`);
            console.log(`     canales      : ${v.extinf} / ${n} ${v.extinf === n ? 'OK' : 'SE PERDIERON'}`);
            const anchorTxt = MODE_ANCHOR[label] || '(sin ancla fake)';
            console.log(`     anclas ${anchorTxt}: ${v.anchors}   tóxicos: ${v.toxic}   LAB-DNA: ${v.dnaTag}`);
            console.log(`     STREAM-INF   : ${v.streamInfTotal} (8K: ${v.streamInf8k}, 8K+L153: ${v.streamInf8kL153} ${v.FREEZE_POISON ? '¡FREEZE!' : 'OK'})`);
            console.log(`     HERENCIA     : inyectadas=${inh.injectedDirectives} · exthttp_merge=${inh.mergedExthttp} · extinf=${inh.extinfFixed} · pérdidas=${v.inherit ? v.inherit.lostTotal : 'n/a'} (canales ${v.inherit ? v.inherit.channelsWithLoss : '?'})`);
            if (det) console.log(`     determinismo : ${det.equal ? 'SHA IDÉNTICO' : 'SHA DISTINTO'} (${det.shaA.slice(0, 12)} / ${det.shaB.slice(0, 12)})`);
            console.log(`     verdict      : ${run.verdict}${v.fails.length ? ' — ' + v.fails.join(' | ') : ''}`);
        }
        report.lists.push(L);
    }

    // ── Resumen multi-lista (t62: columnas dinámicas según --mode) ─────────
    const labels = MODES[opt.mode];
    console.log('\n══ RESUMEN MULTI-LISTA');
    console.log('lista'.padEnd(26) + 'canales'.padEnd(9) + 'perfil'.padEnd(8) + 'herencia'.padEnd(10)
        + labels.map((l) => l.padEnd(9)).join('') + 'verdict');
    for (const L of report.lists) {
        const get = (lb) => (L.runs.find((r) => r.label === lb) || {});
        const inhLost = L.runs.reduce((s, r) => s + (r.verify && r.verify.inherit ? r.verify.inherit.lostTotal : 0), 0);
        const verdict = L.runs.every((r) => r.verdict === 'OK') ? 'OK' : 'FAIL';
        console.log(
            String(L.basename).padEnd(26) + String(L.channelsParsed).padEnd(9) +
            String(L.settings.profile).padEnd(8) + (inhLost + ' perdidas').padEnd(10) +
            labels.map((l) => String(get(l).verdict || '-').padEnd(9)).join('') + verdict,
        );
    }
    report.verdict = allOk ? 'OK' : 'FAIL';
    const rp = path.join(opt.out || path.dirname(path.resolve(expanded[0])), `regen_multilist_report.json`);
    fs.writeFileSync(rp, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n── informe: ${rp}`);
    console.log(`── VEREDICTO: ${report.verdict}`);
    return allOk ? 0 : 1;
}

main().then((rc) => process.exit(rc)).catch((e) => { console.error('FATAL', (e && e.stack) || e); process.exit(3); });
