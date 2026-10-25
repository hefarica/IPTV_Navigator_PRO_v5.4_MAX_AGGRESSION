/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE CDN REWRAP v1.1 — cablea el generador al plano de metadata del VPS
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ HACE
 *   Reescribe la URL de cada canal de la lista generada:
 *       http://line.tivi-ott.net/live/USER/PASS/123.m3u8
 *   →   https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/USER/PASS/123.m3u8
 *
 *   Cada reproducción pasa por el plano del VPS, que sigue el 302 del proveedor,
 *   rebasa los segmentos al CDN (el video NO pasa por el VPS), declara 4K/8K y
 *   mide QoE.
 *
 * v1.1 (2026-10-24) — FIX CRÍTICO DE ORDEN
 *   m3u8-post-processor.js reemplaza el setter de app.state.generatedM3U8 SIN
 *   delegar en el anterior. Si este módulo se cargaba antes, su hook quedaba
 *   enterrado y el rewrap NUNCA se ejecutaba (verificado en consola: línea
 *   "[APE-CDN] hook instalado" aparecía ANTES de "[M3U8 Post-Processor] Hooked").
 *   Ahora ensureHook() verifica la IDENTIDAD del setter y se reinstala ENCIMA
 *   del que esté activo, delegando en él (cadena correcta en cualquier orden).
 *
 * SEGURIDAD / REVERSIBILIDAD
 *   · Solo reescribe hosts de la allowlist (`ape_cdn_hosts`).
 *   · `ape_cdn_mode = 'off'` desactiva al instante (sin recargar código).
 *   · Si el VPS cae, esos canales no sintonizan: por eso el modo se controla.
 *
 * CONFIG (localStorage)
 *   ape_cdn_mode  : 'allowlist' (default) | 'off' | 'all'
 *   ape_cdn_hosts : 'line.tivi-ott.net,otro.host'   (solo en allowlist)
 *   ape_cdn_base  : 'https://iptv-ape.duckdns.org'
 *
 * API
 *   window.apeCdnRewrap(texto)  → reescribe y devuelve
 *   window.apeCdnInfo()         → {mode, hosts, base, active, hooked, rehooks}
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        mode: 'allowlist',
        hosts: 'line.tivi-ott.net',
        base: 'https://iptv-ape.duckdns.org'
    };

    function cfg() {
        var ls = (typeof localStorage !== 'undefined') ? localStorage : null;
        var get = function (k, d) {
            try { var v = ls && ls.getItem(k); return (v === null || v === '') ? d : v; }
            catch (e) { return d; }
        };
        return {
            mode: String(get('ape_cdn_mode', DEFAULTS.mode)).toLowerCase(),
            hosts: String(get('ape_cdn_hosts', DEFAULTS.hosts)).split(',').map(function (s) {
                return s.trim().toLowerCase();
            }).filter(Boolean),
            base: String(get('ape_cdn_base', DEFAULTS.base)).replace(/\/+$/, '')
        };
    }

    function hostOf(url) {
        var m = url.match(/^https?:\/\/([^\/?#]+)/i);
        return m ? m[1].toLowerCase() : '';
    }

    function bareHost(host) { return host.replace(/:\d+$/, ''); }

    /** return: { text, rewritten, skipped, alreadyWrapped } */
    function rewrap(text, options) {
        if (typeof text !== 'string' || text === '') {
            return { text: text, rewritten: 0, skipped: 0, alreadyWrapped: 0 };
        }
        var c = options || cfg();
        if (c.mode === 'off') {
            return { text: text, rewritten: 0, skipped: 0, alreadyWrapped: 0, disabled: true };
        }
        var out = [], rewritten = 0, skipped = 0, already = 0;
        var lines = text.split(/\r?\n/);

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();

            if (!/^https?:\/\//i.test(trimmed)) { out.push(line); continue; }

            var pathPart = trimmed.replace(/^https?:\/\/[^\/]+/i, '');
            if (trimmed.indexOf(c.base + '/cdn/') === 0 || /^\/cdn\//.test(pathPart)) {
                already++; out.push(line); continue;
            }

            var host = hostOf(trimmed);
            var allowed = (c.mode === 'all')
                || c.hosts.indexOf(host) !== -1
                || c.hosts.indexOf(bareHost(host)) !== -1;

            if (!allowed) { skipped++; out.push(line); continue; }

            // El SEGMENTO de host solo puede ser el host: si dejamos el puerto
            // dentro (`/cdn/line.tivi-ott.net:80/...`) el gateway no casa con
            // `ape_hosts_allow.txt` (line.tivi-ott.net) y devuelve 404.
            // Se elimina SOLO el puerto por defecto del esquema (:80 http,
            // :443 https); los puertos reales (:8080, :25461) se conservan.
            var scheme = /^https:\/\//i.test(trimmed) ? 'https' : 'http';
            var rest = trimmed.replace(/^https?:\/\//i, '');
            if (scheme === 'http') {
                rest = rest.replace(/^([^\/:]+):80(?=\/|$)/i, '$1');
            } else {
                rest = rest.replace(/^([^\/:]+):443(?=\/|$)/i, '$1');
            }

            out.push(c.base + '/cdn/' + rest);
            rewritten++;
        }

        return { text: out.join('\n'), rewritten: rewritten, skipped: skipped,
                 alreadyWrapped: already, mode: c.mode };
    }

    function rewrapText(text, options) { return rewrap(text, options).text; }

    // ── estado del hook ────────────────────────────────────────────────────
    var mySetter = null;
    var rehooks = 0;
    var installedAt = 0;
    var lastStats = null;

    function info() {
        var c = cfg();
        return {
            mode: c.mode, hosts: c.hosts, base: c.base, active: c.mode !== 'off',
            hooked: !!(mySetter), rehooks: rehooks, installedAt: installedAt,
            lastRewritten: lastStats ? lastStats.rewritten : 0
        };
    }

    /**
     * Instala (o REINSTALA) el hook sobre state.generatedM3U8.
     * · Si ya somos el setter activo → no hace nada.
     * · Si otro módulo nos reemplazó → se reinstala ENCIMA delegando en él.
     * Devuelve el setter instalado.
     */
    function hookState(state) {
        if (!state) return null;
        if (state.__apeCdnModeOff && info().mode === 'off') return null;

        var desc = Object.getOwnPropertyDescriptor(state, 'generatedM3U8') || {};
        if (desc.set && desc.set === mySetter) return mySetter;   // ya estamos arriba

        var prev = desc;
        var setter = function (value) {
            var res;
            try {
                res = rewrap(value);
            } catch (e) {
                console.warn('[APE-CDN] rewrap error (passthrough):', e);
                res = { text: value, rewritten: 0, skipped: 0 };
            }
            if (res.rewritten > 0) {
                lastStats = res;
                console.log('%c[APE-CDN] ' + res.rewritten + ' URLs cableadas al VPS' +
                    (res.skipped ? ' (' + res.skipped + ' fuera de allowlist)' : ''),
                    'color:#22d3ee;font-weight:bold;');
            }
            if (prev.set) return prev.set.call(this, res.text);
            this._apeCdnRaw = res.text;
            return res.text;
        };
        var getter = function () {
            if (prev.get) return prev.get.call(this);
            return this._apeCdnRaw;
        };

        Object.defineProperty(state, 'generatedM3U8', {
            configurable: true,
            enumerable: true,
            get: getter,
            set: setter
        });

        mySetter = setter;
        rehooks++;
        installedAt = Date.now();
        if (rehooks === 1) {
            console.log('%c[APE-CDN] hook instalado — modo: ' + info().mode,
                'color:#22d3ee;font-weight:bold;');
        } else {
            console.log('%c[APE-CDN] hook RE-instalado (#' + rehooks + ') — otro módulo lo había reemplazado',
                'color:#f59e0b;font-weight:bold;');
        }
        return setter;
    }

    function ensureHook() {
        if (typeof window === 'undefined' || !window.app || !window.app.state) return false;
        if (info().mode === 'off') return false;
        if (rehooks > 50) return false;                 // cortafuegos anti-bucle
        return !!hookState(window.app.state);
    }

    // ── arranque en navegador ──────────────────────────────────────────────
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        var tries = 0;
        var boot = setInterval(function () {
            tries++;
            if (window.app && window.app.state) {
                ensureHook();                            // primer intento
                clearInterval(boot);
                // guardia permanente: si alguien reemplaza el setter, re-hook
                setInterval(ensureHook, 1500);
                window.addEventListener('lab-imported', function () { ensureHook(); });
                document.addEventListener('click', function (ev) {
                    var t = ev.target;
                    if (t && (t.id === 'btnGenerate' || t.id === 'btnDownload')) ensureHook();
                }, true);
            } else if (tries > 120) { clearInterval(boot); }
        }, 500);

        window.apeCdnRewrap = rewrapText;
        window.apeCdnInfo = info;
        window.apeCdnEnsureHook = ensureHook;
    }

    // ── export para tests en Node ──────────────────────────────────────────
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            rewrap: rewrap, rewrapText: rewrapText, info: info,
            hookState: hookState, ensureHook: ensureHook, DEFAULTS: DEFAULTS
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
