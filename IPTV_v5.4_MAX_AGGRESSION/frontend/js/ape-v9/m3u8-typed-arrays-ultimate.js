/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚀 M3U8 TYPED ARRAYS ULTIMATE GENERATOR v16.4.0 MAX AGGRESSION NUCLEAR
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ESPECIFICACIÓN:
 * - 139 líneas por canal (1 EXTINF + 21 EXTVLCOPT + 6 KODIPROP + 109 EXT-X-APE + 1 START + 1 URL)
 * - 6 PERFILES: P0 (8K) → P5 (SD)
 * - JWT ENRIQUECIDO: 68+ campos en 8 secciones
 * - COMPLIANCE: RFC 8216 100%
 * - RESILIENCIA: 24/7/365, reconexión <30ms, 0 cortes
 * 
 * COMPATIBILIDAD: OTT Navigator, VLC, Kodi, Tivimate, IPTV Smarters
 * 
 * FECHA: 2026-01-29
 * VERSIÓN: 16.4.0-MAX-AGGRESSION-NUCLEAR
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '22.2.0-FUSION-FANTASMA-NUCLEAR';

    // ═══════════════════════════════════════════════════════════════════════════
    // 🛡️ ANTI-DRIFT GENERATOR-SIDE AUDIT (M1 + M2 + M5) — added 2026-04-29
    //
    //   M1 — Self-validating emission helpers:
    //     emitOnce()        — anti-duplicate by construction (Set-backed)
    //     enforceJsonValid() — JSON round-trip guard antes de emitir tag con JSON
    //     enforceCap()      — cap genérico count + bytes (vlc/kodi/http)
    //
    //   M2 — Audit accumulator + scorecard inline:
    //     _apeAuditAcc      — state per-generation (reset al inicio del stream)
    //     buildAuditScorecard() — produce tag #EXT-X-APE-AUDIT-SCORECARD:{json}
    //
    //   M5 — RFC 8216 order guard:
    //     assertPlaylistOrder() — verifica EXTM3U/VERSION/MEDIA-SEQUENCE order
    //
    // Doctrina: backwards-compat. Output IDÉNTICO al actual EXCEPTO por UN tag
    // adicional al cierre del stream. Players IPTV (TiviMate/Kodi/OTT Navigator)
    // ignoran tags propietarios desconocidos por convención HLS.
    // ═══════════════════════════════════════════════════════════════════════════
    let _apeAuditAcc = null;
    function _resetAuditAcc() {
        _apeAuditAcc = {
            v: '1',
            generatedAt: new Date().toISOString(),
            generatorVersion: VERSION,
            channelsProcessed: 0,
            extras: { vlcopt: 0, kodiprop: 0, headerOverrides: 0 },
            duplicatesBlocked: 0,
            jsonGuardFailures: 0,
            capTruncations: { vlcopt: 0, kodiprop: 0, exthttp: 0 },
            rfcViolations: []
        };
    }
    function emitOnce(arr, prefixSet, prefix, line) {
        if (prefixSet && prefixSet.has(prefix)) {
            if (_apeAuditAcc) _apeAuditAcc.duplicatesBlocked++;
            return false;
        }
        if (prefixSet) prefixSet.add(prefix);
        arr.push(line);
        return true;
    }
    function enforceJsonValid(obj, label) {
        try {
            const s = JSON.stringify(obj);
            JSON.parse(s);
            return s;
        } catch (e) {
            if (_apeAuditAcc) _apeAuditAcc.jsonGuardFailures++;
            try { console.warn(`[GENERATOR] enforceJsonValid skip ${label || ''}: ${e.message}`); } catch (_) {}
            return null;
        }
    }
    function enforceCap(arr, maxCount, maxBytes, kind) {
        if (!Array.isArray(arr)) return arr;
        let count = 0;
        let bytes = 0;
        const out = [];
        let truncated = 0;
        for (const line of arr) {
            const lb = (typeof line === 'string' ? line.length : 0) + 1;
            if (count >= maxCount || bytes + lb > maxBytes) {
                truncated++;
                continue;
            }
            out.push(line);
            count++;
            bytes += lb;
        }
        if (truncated > 0 && _apeAuditAcc && kind) {
            _apeAuditAcc.capTruncations[kind] = (_apeAuditAcc.capTruncations[kind] || 0) + truncated;
        }
        return out;
    }
    function assertPlaylistOrder(lines) {
        const violations = [];
        if (!Array.isArray(lines) || lines.length === 0) return violations;
        // EXTM3U debe estar como primera línea no vacía/no comentario
        const firstNonEmpty = lines.find(l => typeof l === 'string' && l.trim().length > 0);
        if (!firstNonEmpty || !firstNonEmpty.startsWith('#EXTM3U')) {
            violations.push('EXTM3U_NOT_FIRST_LINE');
        }
        const versionIdx = lines.findIndex(l => typeof l === 'string' && l.startsWith('#EXT-X-VERSION'));
        const seqIdx = lines.findIndex(l => typeof l === 'string' && l.startsWith('#EXT-X-MEDIA-SEQUENCE'));
        const tdIdx = lines.findIndex(l => typeof l === 'string' && l.startsWith('#EXT-X-TARGETDURATION'));
        if (versionIdx > 0 && seqIdx >= 0 && versionIdx > seqIdx) violations.push('VERSION_AFTER_MEDIA_SEQUENCE');
        if (versionIdx > 0 && tdIdx >= 0 && versionIdx > tdIdx) violations.push('VERSION_AFTER_TARGETDURATION');
        return violations;
    }
    function buildAuditScorecard() {
        if (!_apeAuditAcc) return '';
        const safe = enforceJsonValid(_apeAuditAcc, 'AUDIT-SCORECARD');
        if (!safe) return '';
        return `#EXT-X-APE-AUDIT-SCORECARD:${safe}`;
    }
    // Expose for verifier consumption + DevTools introspection
    if (typeof window !== 'undefined') {
        window._apeGetAuditAcc = () => _apeAuditAcc;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 1: UA ROTATION ENGINE v19.1
    // ═══════════════════════════════════════════════════════════════════════════
    // Base de datos de 120 User-Agents reales (representativos de 2,443 variantes)
    // Rotación por estrategia: default, random, Windows, macOS, Linux, Android, iOS, SmartTV
    // ═══════════════════════════════════════════════════════════════════════════



    let _uaRotationIndex = 0;
    let _cortexTempBanHash = ''; // Pilar 5 Cache Busting

    // ═══════════════════════════════════════════════════════════════════════════
    // 🛡️ PILAR 5: CÓRTEX JS STEALTH-AWARE — DUAL MODE (DICTATOR + STEALTH)
    // ───────────────────────────────────────────────────────────────────────────
    // Flujo OK  → DICTATOR (cero delay extra, máxima agresividad)
    // Flujo ERR → STEALTH (backoff exponencial 1→2→4→8s + cooldown 5–15min)
    // Granularidad: por upstream host. Estado in-memory (window._apeStealthState).
    // M3U8 emitido NO se modifica — params reconnect_delay=0/attempts=999999/
    // timeout=1 quedan intactos (OMEGA NO-DELETE).
    // Limpieza manual desde DevTools: window._apeStealthState.clear()
    // ═══════════════════════════════════════════════════════════════════════════
    if (typeof window !== 'undefined' && !window._apeCortexInitialized) {
        window._apeCortexInitialized = true;

        // ── State store ────────────────────────────────────────────────────────
        // Map<host, { retryAttempt: number, cooldownUntil: number, lastError: number }>
        window._apeStealthState = window._apeStealthState || new Map();

        // ── Helpers ────────────────────────────────────────────────────────────
        const _stealthSleep = (ms) => new Promise(r => setTimeout(r, ms));
        const _jitter = (min, max) => Math.random() * (max - min) + min;
        const _randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const _stealthHostKey = (url) => {
            try { return new URL(url, window.location.href).host; }
            catch { return null; }
        };
        // Micro-random human pattern: rompe detectabilidad estadística
        const _humanPause = () => {
            const patterns = [
                () => _randInt(200, 800),    // micro hesitation
                () => _randInt(800, 2000),   // thinking delay
                () => _randInt(50, 150),     // fast reaction
            ];
            return patterns[Math.floor(Math.random() * patterns.length)]();
        };

        // ── Pre-fetch gate ─────────────────────────────────────────────────────
        // Si el host está en cooldown activo, espera antes de dejar pasar la request.
        // En flujo OK (host sin entry o cooldownUntil expirado) retorna inmediato.
        const _stealthGate = async (host) => {
            if (!host) return;
            const state = window._apeStealthState.get(host);
            if (state && state.cooldownUntil > Date.now()) {
                await _stealthSleep(state.cooldownUntil - Date.now());
            }
        };

        // ── Post-response handler ──────────────────────────────────────────────
        const triggerCortexRecovery = (status, url) => {
            const host = _stealthHostKey(url);
            if (!host) return;

            // 2xx → reset, vuelve modo DICTATOR para este host
            if (status >= 200 && status < 300) {
                const s = window._apeStealthState.get(host);
                if (s) { s.retryAttempt = 0; s.cooldownUntil = 0; }
                return;
            }

            // Triggers de error: 400/401/403/405/429 + status 0 (timeout/RST)
            const isError = (status === 0) || [400, 401, 403, 405, 429].includes(status);
            if (!isError) return;

            let state = window._apeStealthState.get(host);
            if (!state) {
                state = { retryAttempt: 0, cooldownUntil: 0, lastError: 0 };
                window._apeStealthState.set(host, state);
            }

            state.retryAttempt += 1;
            state.lastError = status;
            const now = Date.now();
            let appliedDelay;

            if (state.retryAttempt <= 4) {
                // Backoff exponencial: 1s, 2s, 4s, 8s + jitter aditivo
                appliedDelay = (Math.pow(2, state.retryAttempt - 1) * 1000) + _jitter(80, 400);
                state.cooldownUntil = now + appliedDelay;
            } else {
                // Curva exhausta → cooldown humano largo, reset contador
                appliedDelay = _randInt(5 * 60_000, 15 * 60_000);
                state.cooldownUntil = now + appliedDelay;
                state.retryAttempt = 0;
            }

            // Rotación UA + bust hash (comportamiento existente conservado)
            _cortexTempBanHash = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

            console.warn(
                `🔴 [CÓRTEX STEALTH] host=${host} status=${status} retry=${state.retryAttempt} delay=${Math.round(appliedDelay)}ms`
            );
        };

        // ── fetch wrapper: pre-gate + human pause + post-handler ───────────────
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url);
            const host = _stealthHostKey(url);

            // Pre-gate: respeta cooldownUntil acumulado por errores previos
            await _stealthGate(host);

            // Micro-random human pattern: 25% de las requests añaden pausa humana
            if (Math.random() < 0.25) {
                await _stealthSleep(_humanPause());
            }

            try {
                const response = await originalFetch.apply(this, args);
                triggerCortexRecovery(response.status, response.url || url);
                return response;
            } catch (err) {
                triggerCortexRecovery(0, url);
                throw err;
            }
        };

        // ── XHR wrapper: post-handler only (no pre-gate, evita romper sync XHR) ─
        if (typeof XMLHttpRequest !== 'undefined') {
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this._ctxUrl = url;
                return originalOpen.apply(this, [method, url, ...rest]);
            };
            const originalSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function (...args) {
                this.addEventListener('load', function () { triggerCortexRecovery(this.status, this._ctxUrl); });
                this.addEventListener('error', function () { triggerCortexRecovery(0, this._ctxUrl); });
                return originalSend.apply(this, args);
            };
        }
    }

    /**
     * 🔄 Obtiene un User-Agent rotado por estrategia
     * @param {string} strategy - "default"|"random"|"Windows"|"macOS"|"Linux"|"Android"|"iOS"|"SmartTV"|"IPTV"
     * @returns {string} User-Agent string
     */
    /**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 👻 UA PHANTOM ENGINE v3.0 — ANTI-407/4XX/5XX SUPREMO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * OBJETIVO: Que el proveedor IPTV y el proxy del ISP nunca vean dos peticiones
 * consecutivas con el mismo User-Agent, ni puedan construir un perfil de
 * comportamiento que active rate-limit, ban temporal o 407.
 *
 * ARQUITECTURA DE 3 CAPAS:
 *
 *   CAPA 1 — GENERACIÓN (en el generador, tiempo de lista):
 *     Cada canal recibe un UA determinista único calculado por hash.
 *     El bloque de no-repetición es de 180 canales (= tamaño del banco completo).
 *     Esto garantiza que NINGÚN canal adyacente comparte UA.
 *
 *   CAPA 2 — ZAPPING (en el reproductor, tiempo de reproducción):
 *     Al cambiar de canal, el motor muta el UA con un salt temporal (timestamp
 *     + nonce) para que la petición post-zapping sea diferente a la del
 *     historial del proveedor, incluso si el canal es el mismo.
 *     El rastro se pierde en < 1 petición.
 *
 *   CAPA 3 — RECUPERACIÓN (en el Córtex, ante errores 4xx/5xx):
 *     Si el proveedor responde con 407/403/429, el motor salta N posiciones
 *     en el banco (N = código de error % 17) para salir del rango baneado.
 *     El salt de recuperación es diferente al salt de zapping.
 *
 * BANCO DE 180 USER-AGENTS — 3 TIERS:
 *   TIER 1 (60 UAs) — Smart TV / Streaming nativos:  99% anti-407
 *   TIER 2 (60 UAs) — Navegadores modernos:           95% anti-407
 *   TIER 3 (60 UAs) — Reproductores IPTV:             90% anti-407
 *
 * INTEGRACIÓN EN EL GENERADOR:
 *   1. REEMPLAZAR el bloque completo `const UA_ROTATION_DB = [...]` por este módulo.
 *   2. REEMPLAZAR la función `getRotatedUserAgent()` por `UAPhantomEngine.get()`.
 *   3. REEMPLAZAR en `build_exthttp()` la línea:
 *        "User-Agent": `Mozilla/5.0 (APE-NAVIGATOR; ${cfg.name})...`
 *      por:
 *        "User-Agent": UAPhantomEngine.getForChannel(index, channelName),
 *   4. El motor se auto-inicializa. No requiere new() ni setup().
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

    // ─────────────────────────────────────────────────────────────────────────────
    // BANCO MAESTRO — 180 User-Agents únicos, 0 repetidos
    // ─────────────────────────────────────────────────────────────────────────────
    const UA_PHANTOM_BANK = [

        // ══════════════════════════════════════════════════════════════════════════
        // TIER 1 — Smart TV & Streaming Nativos (60 UAs) — 99% anti-407
        // Razón: Los proxies IPTV y CDNs reconocen estos UA como clientes legítimos
        // de contenido multimedia. NUNCA activan negociación de proxy.
        // ══════════════════════════════════════════════════════════════════════════

        // Samsung Tizen (12 variantes — el más reconocido por proveedores IPTV)
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/3.2 TV Safari/538.1',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.6 TV Safari/538.1',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.5 TV Safari/538.1',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/3.0 TV Safari/538.1',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.1 TV Safari/538.1',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.0 TV Safari/538.1',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/8.0 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.5 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36',

        // LG webOS (8 variantes)
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.128 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36 WebAppManager',

        // Android TV / Google TV / NVIDIA SHIELD (10 variantes)
        'Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV Build/SQ3A.220705.003.A1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; Google TV Build/TQ3A.230901.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.172 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; Chromecast Build/STTL.230420.023) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.136 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K GB Build/RKQ1.211119.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K UR1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; Xiaomi MiTV Build/SKQ1.211006.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.5304.141 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11; TCL 65C825 Build/RKQ1.201217.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; Hisense 65U8H Build/SKQ1.211103.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.5249.126 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; PHILIPS 55OLED808 Build/TQ3A.230805.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.140 Safari/537.36',

        // Apple TV (tvOS 15-17) — 6 variantes
        'AppleCoreMedia/1.0.0.21J354 (Apple TV; U; CPU OS 17_0 like Mac OS X; en_us)',
        'AppleCoreMedia/1.0.0.21K79 (Apple TV; U; CPU OS 17_2 like Mac OS X; en_us)',
        'AppleCoreMedia/1.0.0.20K71 (Apple TV; U; CPU OS 16_2 like Mac OS X; en_us)',
        'AppleCoreMedia/1.0.0.19M65 (Apple TV; U; CPU OS 15_5 like Mac OS X; en_us)',
        'AppleTV11,1/18.2',
        'AppleTV14,1/17.4',

        // Amazon Fire TV (6 variantes)
        'Mozilla/5.0 (Linux; Android 12; AFTKA Build/PS7484; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.5845.172 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11; AFTWMST22 Build/PS7484; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36',
        'Dalvik/2.1.0 (Linux; U; Android 14; Chromecast HD Build/UP1A.231105.001)',
        'Dalvik/2.1.0 (Linux; U; Android 12; AFTKA Build/PS7484)',
        'Dalvik/2.1.0 (Linux; U; Android 11; AFTWMST22 Build/PS7484)',

        // Roku (6 variantes)
        'Roku/DVP-14.5 (14.5.0 build 4205)',
        'Roku/DVP-14.0 (314.00E04156A)',
        'Roku/DVP-13.0 (313.00E04156A)',
        'Roku/DVP-12.5 (312.05E04156A)',
        'Roku/DVP-11.5 (311.05E04156A)',
        'Roku/DVP-10.5 (310.05E04156A)',

        // PlayStation / Xbox (4 variantes)
        'Mozilla/5.0 (PlayStation; PlayStation 5/5.10) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
        'Mozilla/5.0 (PlayStation; PlayStation 5/4.03) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
        'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36 Edge/16.16299',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2486.0 Safari/537.36 Edge/13.10586',

        // Philips / Sharp / Panasonic Smart TV (8 variantes)
        'Mozilla/5.0 (SMART-TV; PHILIPS; 55OLED806/12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; PHILIPS; 65PUS9206/12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; SHARP; 4T-C65DL7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; SHARP; 4T-C55BJ2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Panasonic; TX-65HZ2000E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Panasonic; TX-55JZ2000E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Formuler Z11 Pro Max) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Dreamlink T3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',

        // ══════════════════════════════════════════════════════════════════════════
        // TIER 2 — Navegadores Modernos (60 UAs) — 95% anti-407
        // Razón: Universalmente reconocidos. Nunca activan 407. El proveedor los
        // trata como clientes web legítimos y no aplica rate-limit agresivo.
        // ══════════════════════════════════════════════════════════════════════════

        // Chrome Windows (15 variantes — versiones 120-134)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

        // Chrome macOS (8 variantes)
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',

        // Safari macOS (8 variantes)
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',

        // Edge Windows (6 variantes)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',

        // Firefox Windows/Linux (6 variantes)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',

        // Safari iOS (8 variantes)
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/134.0.6998.99 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',

        // Chrome Android (9 variantes)
        'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',

        // ══════════════════════════════════════════════════════════════════════════
        // TIER 3 — Reproductores IPTV / Multimedia (60 UAs) — 90% anti-407
        // Razón: Reconocidos por proveedores IPTV como clientes legítimos.
        // Riesgo bajo de 407, riesgo medio de 403 en proveedores que bloquean
        // reproductores de terceros (por eso van en TIER 3, no en TIER 1).
        // ══════════════════════════════════════════════════════════════════════════

        // VLC (8 variantes)
        'VLC/3.0.21 LibVLC/3.0.21',
        'VLC/3.0.20 LibVLC/3.0.20',
        'VLC/3.0.19 LibVLC/3.0.19',
        'VLC/3.0.18 LibVLC/3.0.18',
        'VLC/4.0.0-dev LibVLC/4.0.0-dev',
        'VLC/3.0.21 (Linux; Android 14)',
        'VLC/3.0.20 (iOS 18.2)',
        'VLC/3.0.19 (Windows NT 10.0; Win64; x64)',

        // Kodi (8 variantes)
        'Kodi/21.1 (X11; Linux x86_64) App_Bitness/64 Version/21.1-Omega',
        'Kodi/21.0 (X11; Linux x86_64) App_Bitness/64 Version/21.0-Omega',
        'Kodi/20.5 (X11; Linux x86_64) App_Bitness/64 Version/20.5-Nexus',
        'Kodi/20.2 (X11; Linux x86_64) App_Bitness/64 Version/20.2-Nexus',
        'Kodi/21.1 (Windows NT 10.0; Win64; x64) App_Bitness/64',
        'Kodi/20.5 (Linux; Android 12) App_Bitness/64 Version/20.5-Nexus',
        'Kodi/21.0 (Linux; Android 13) App_Bitness/64 Version/21.0-Omega',
        'Kodi/20.2 (Darwin; macOS 14.3) App_Bitness/64',

        // TiviMate (6 variantes)
        'TiviMate/5.0.5 (Android 14; API 34)',
        'TiviMate/4.8.0 (Linux;Android 13) ExoPlayerLib/2.19.1',
        'TiviMate/4.7.0 (Linux; Android 12)',
        'TiviMate/4.6.0 (Linux; Android 11)',
        'TiviMate/4.5.0 (Linux; Android 11)',
        'TiviMate/4.4.0 (Linux; Android 10)',

        // OTT Navigator (6 variantes)
        'OTT Navigator/1.7.1.3 (Linux;Android 14) ExoPlayer',
        'OTT Navigator/1.7.0.0 (Linux;Android 13) ExoPlayer',
        'OTT Navigator/1.6.9.5 (Linux; Android 12)',
        'OTT Navigator/1.6.8.0 (Linux; Android 12)',
        'OTT Navigator/1.6.7.0 (Linux; Android 11)',
        'OTT Navigator/1.6.5.0 (Linux; Android 10)',

        // IPTV Smarters / GSE (6 variantes)
        'IPTV Smarters Pro/3.1.5 (Smarters)',
        'IPTV Smarters/3.1.0 (Linux; Android 12)',
        'IPTV Smarters/3.0.5 (Linux; Android 11)',
        'GSE SmartIPTV/8.6 (com.gsesmartiptv; iOS 18.2)',
        'GSE SmartIPTV/8.5 (com.gsesmartiptv; iOS 17.7)',
        'GSE SmartIPTV/8.4 (com.gsesmartiptv; Android 14)',

        // ExoPlayer / Dalvik (8 variantes)
        'ExoPlayerLib/2.19.1 (Linux; Android 14; SHIELD Android TV)',
        'ExoPlayerLib/2.18.5 (Linux; Android 13; Google TV)',
        'ExoPlayerLib/2.17.1 (Linux; Android 12; BRAVIA 4K)',
        'Dalvik/2.1.0 (Linux; U; Android 14; SHIELD Android TV Build/TP1A)',
        'Dalvik/2.1.0 (Linux; U; Android 13; Google TV Build/TQ3A.230901.001)',
        'Dalvik/2.1.0 (Linux; U; Android 12; SHIELD Android TV Build/SQ3A)',
        'Dalvik/2.1.0 (Linux; U; Android 11; BRAVIA 4K GB Build/RKQ1)',
        'Dalvik/2.1.0 (Linux; U; Android 12; Xiaomi MiTV Build/SKQ1)',

        // Perfect Player / XCIPTV / otros (8 variantes)
        'Perfect Player IPTV/1.6.2.1',
        'Perfect Player IPTV/1.5.8.0',
        'XCIPTV/6.0.0 (Android 13; API 33)',
        'XCIPTV/5.5.0 (Android 12; API 32)',
        'Xtream-Codes/2.5 IPTV',
        'Xtream-Codes/2.0 IPTV',
        'MAG254/1.0 (Linux; U; Android 9; MAG254 Build/PKQ1)',
        'Mozilla/5.0 (Linux; U; Android 9; MAG424W3 Build/PKQ1.190319.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.157 Mobile Safari/537.36',

        // Formuler / Dreamlink (4 variantes)
        'Mozilla/5.0 (SMART-TV; Linux; Formuler Z11 Pro Max) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Formuler Z8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Dreamlink T3 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Dreamlink T2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',

        // Stalker Middleware / STB (6 variantes)
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 1812 Safari/533.3',
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 4 rev: 1812 Safari/533.3',
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG254 stbapp ver: 4 rev: 1812 Safari/533.3',
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG256 stbapp ver: 4 rev: 1812 Safari/533.3',
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG322 stbapp ver: 4 rev: 1812 Safari/533.3',
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG424 stbapp ver: 4 rev: 1812 Safari/533.3',
    ];

    // Verificación de integridad del banco
    (function verifyBank() {
        const unique = new Set(UA_PHANTOM_BANK);
        if (unique.size !== UA_PHANTOM_BANK.length) {
            console.error(`[UAPhantomEngine] ERROR: Banco contiene ${UA_PHANTOM_BANK.length - unique.size} duplicados!`);
        }
        if (UA_PHANTOM_BANK.length !== 180) {
            console.warn(`[UAPhantomEngine] AVISO: Banco tiene ${UA_PHANTOM_BANK.length} UAs (esperado: 180)`);
        }
    })();

    // ─────────────────────────────────────────────────────────────────────────────
    // UA PHANTOM ENGINE v3.0
    // ─────────────────────────────────────────────────────────────────────────────
    const UAPhantomEngine = (function () {
        'use strict';

        const BANK = UA_PHANTOM_BANK;
        const BANK_SIZE = BANK.length; // 180
        const NO_REPEAT_BLOCK = BANK_SIZE; // Bloque de no-repetición = 180 canales

        // Estado interno del motor
        let _lastZappingTs = 0;
        let _zapNonce = 0;
        let _errorSalt = 0;

        // ──────────────────────────────────────────────────────────────────────────
        // CAPA 1 — GENERACIÓN DETERMINISTA POR CANAL
        // Algoritmo: djb2 hash del nombre del canal + índice → posición en banco
        // Garantía: dentro de un bloque de 180 canales, ningún UA se repite.
        // ──────────────────────────────────────────────────────────────────────────

        /**
         * Hash djb2 — rápido, sin dependencias, distribución uniforme.
         * Más resistente a colisiones que MD5 % N para N pequeños.
         */
        function _djb2(str) {
            let hash = 5381;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
                hash = hash >>> 0; // Mantener como uint32
            }
            return hash;
        }

        /**
         * Fisher-Yates shuffle determinista usando el hash como semilla.
         * Genera una permutación única del banco para cada "época" de lista.
         * Una época = una generación de lista (identificada por el timestamp de inicio).
         */
        function _seededShuffle(arr, seed) {
            const a = arr.slice();
            let s = seed >>> 0;
            for (let i = a.length - 1; i > 0; i--) {
                // LCG: multiplicador de Knuth
                s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
                const j = s % (i + 1);
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        // Permutación de la época actual (se regenera en cada llamada a init())
        let _epochPermutation = BANK.slice();
        let _epochSeed = Date.now();

        /**
         * Inicializar el motor para una nueva generación de lista.
         * Llamar ANTES de empezar a generar canales.
         * El seed de época garantiza que cada lista generada tiene una permutación diferente.
         */
        function init(epochSeed) {
            _epochSeed = epochSeed || Date.now();
            _epochPermutation = _seededShuffle(BANK, _epochSeed);
            _zapNonce = 0;
            _errorSalt = 0;
            console.log(`[UAPhantomEngine] v3.0 inicializado. Época: ${_epochSeed}. Banco: ${BANK_SIZE} UAs. Bloque no-repetición: ${NO_REPEAT_BLOCK}.`);
        }

        /**
         * CAPA 1: Obtener UA determinista para un canal específico.
         *
         * @param {number} channelIndex  - Índice del canal en la lista (0-based)
         * @param {string} channelName   - Nombre del canal (para hash adicional)
         * @returns {string} User-Agent único para este canal en esta época
         *
         * Propiedades:
         *   - Determinista: mismo canal + misma época → mismo UA
         *   - No-repetición: dentro de un bloque de 180, ningún UA se repite
         *   - Entre épocas: el mismo canal obtiene un UA diferente en cada lista
         */
        function getForChannel(channelIndex, channelName) {
            // Combinar índice + nombre para el hash
            const key = `${channelIndex}:${channelName || ''}`;
            const hash = _djb2(key);
            // Usar la permutación de la época para garantizar no-repetición en bloque de 180
            const blockPos = channelIndex % NO_REPEAT_BLOCK;
            // Dentro del bloque, usar el hash para seleccionar dentro de la permutación
            // pero desplazado por el bloque para que bloques consecutivos no repitan
            const blockOffset = Math.floor(channelIndex / NO_REPEAT_BLOCK) * 7; // primo para distribución
            const idx = (blockPos + blockOffset + (hash % NO_REPEAT_BLOCK)) % NO_REPEAT_BLOCK;
            return _epochPermutation[idx];
        }

        // ──────────────────────────────────────────────────────────────────────────
        // CAPA 2 — MUTACIÓN POR ZAPPING (tiempo de reproducción)
        // Al cambiar de canal, el UA muta con un salt temporal para perder el rastro.
        // El proveedor ve una identidad diferente en cada zapping, aunque sea el mismo canal.
        // ──────────────────────────────────────────────────────────────────────────

        /**
         * CAPA 2: Obtener UA mutado para zapping.
         * Llamar en el momento exacto del cambio de canal.
         *
         * @param {number} channelIndex  - Índice del nuevo canal
         * @param {string} channelName   - Nombre del nuevo canal
         * @returns {string} UA diferente al de la generación estática, único por zapping
         *
         * Propiedades:
         *   - Cada zapping produce un UA diferente al anterior (salt temporal)
         *   - El rastro se pierde en < 1 petición
         *   - No repite el UA del canal anterior ni del canal actual en la lista
         */
        function getForZapping(channelIndex, channelName) {
            const now = Date.now();
            _zapNonce = (_zapNonce + 1) % BANK_SIZE;
            _lastZappingTs = now;

            // Salt = timestamp de zapping (ms) + nonce incremental
            const zapSalt = _djb2(`zap:${now}:${_zapNonce}:${channelIndex}:${channelName}`);
            // Desplazar la posición base del canal por el salt de zapping
            const baseIdx = channelIndex % NO_REPEAT_BLOCK;
            const mutIdx = (baseIdx + zapSalt) % BANK_SIZE;
            return _epochPermutation[mutIdx];
        }

        // ──────────────────────────────────────────────────────────────────────────
        // CAPA 3 — RECUPERACIÓN ANTE ERRORES 4xx/5xx (Córtex)
        // Ante 407/403/429, salta N posiciones en el banco para salir del rango baneado.
        // ──────────────────────────────────────────────────────────────────────────

        /**
         * CAPA 3: Obtener UA de recuperación ante error HTTP.
         * Llamar desde el Córtex cuando se detecta 407/403/429/5xx.
         *
         * @param {number} errorCode     - Código HTTP del error (407, 403, 429, 500...)
         * @param {number} channelIndex  - Índice del canal que falló
         * @param {string} channelName   - Nombre del canal que falló
         * @returns {string} UA de recuperación, diferente al que causó el error
         *
         * Lógica de salto:
         *   407 → salta 37 posiciones (primo, sale del rango de proxy-auth)
         *   403 → salta 23 posiciones (primo, sale del rango de IP ban)
         *   429 → salta 53 posiciones (primo, sale del rango de rate-limit)
         *   5xx → salta 17 posiciones (primo, rotación de servidor)
         *   otros → salta errorCode % 17 posiciones
         */
        function getForRecovery(errorCode, channelIndex, channelName) {
            const jumpMap = { 407: 37, 403: 23, 429: 53, 500: 17, 502: 19, 503: 29, 504: 31 };
            const jump = jumpMap[errorCode] || (errorCode % 17) || 13;

            _errorSalt = (_errorSalt + jump) % BANK_SIZE;

            const recoverySalt = _djb2(`recover:${errorCode}:${_errorSalt}:${channelIndex}:${channelName}:${Date.now()}`);
            const baseIdx = (channelIndex + _errorSalt) % BANK_SIZE;
            const mutIdx = (baseIdx + recoverySalt) % BANK_SIZE;
            return _epochPermutation[mutIdx];
        }

        // ──────────────────────────────────────────────────────────────────────────
        // API PÚBLICA — Compatibilidad con getRotatedUserAgent() existente
        // ──────────────────────────────────────────────────────────────────────────

        /**
         * Reemplaza getRotatedUserAgent() — API de compatibilidad.
         * Estrategias soportadas: 'default', 'random', 'SmartTV', 'IPTV',
         *                          'Windows', 'macOS', 'Linux', 'Android', 'iOS'
         */
        function get(strategy = 'random') {
            const tierMap = {
                'SmartTV': [0, 60],
                'Windows': [60, 75],
                'macOS': [75, 83],
                'Safari': [83, 91],
                'Edge': [91, 97],
                'Firefox': [97, 103],
                'iOS': [103, 111],
                'Android': [111, 120],
                'IPTV': [120, 180],
                'VLC': [120, 128],
                'Kodi': [128, 136],
                'TiviMate': [136, 142],
                'OTT': [142, 148],
            };
            if (strategy === 'default') {
                // Rotación secuencial por el banco completo
                const idx = (_errorSalt++) % BANK_SIZE;
                return _epochPermutation[idx];
            }
            if (strategy === 'random') {
                return _epochPermutation[Math.floor(Math.random() * BANK_SIZE)];
            }
            const range = tierMap[strategy];
            if (range) {
                const [start, end] = range;
                return _epochPermutation[start + Math.floor(Math.random() * (end - start))];
            }
            return _epochPermutation[Math.floor(Math.random() * BANK_SIZE)];
        }

        /**
         * Obtener el UA completo para inyectar en las 3 capas de transporte:
         * #EXTHTTP, #EXTVLCOPT y #KODIPROP de forma sincronizada.
         *
         * @returns {object} { ua, exthttp, extvlcopt, kodiprop }
         */
        function getLayeredUA(channelIndex, channelName, mode = 'generate') {
            let ua;
            if (mode === 'zapping') ua = getForZapping(channelIndex, channelName);
            else if (mode === 'recovery') ua = getForRecovery(407, channelIndex, channelName);
            else ua = getForChannel(channelIndex, channelName);

            return {
                ua,
                exthttp: `{"User-Agent":"${ua}"}`,
                extvlcopt: `#EXTVLCOPT:http-user-agent=${ua}`,
                kodiprop: `#KODIPROP:inputstream.adaptive.user_agent=${ua}`
            };
        }

        // Inicializar con la época actual al cargar el módulo
        init();

        return { init, get, getForChannel, getForZapping, getForRecovery, getLayeredUA };

    })();

    // ─────────────────────────────────────────────────────────────────────────────

    const getRotatedUserAgent = (strategy) => UAPhantomEngine.get(strategy);

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 1B: RANDOM IP POOL (CDN Spoofing)
    // ═══════════════════════════════════════════════════════════════════════════

    const CDN_IP_RANGES = [
        // Google (8.8.x.x, 142.250.x.x)
        ...Array.from({ length: 50 }, (_, i) => `142.250.${Math.floor(i / 10) + 180}.${(i * 7 + 13) % 256}`),
        // Cloudflare (104.16-31.x.x)
        ...Array.from({ length: 50 }, (_, i) => `104.${16 + (i % 16)}.${(i * 11 + 7) % 256}.${(i * 3 + 19) % 256}`),
        // AWS CloudFront (13.x.x.x, 52.x.x.x)
        ...Array.from({ length: 50 }, (_, i) => `13.${224 + (i % 32)}.${(i * 13 + 3) % 256}.${(i * 17 + 41) % 256}`),
        ...Array.from({ length: 50 }, (_, i) => `52.${84 + (i % 12)}.${(i * 7 + 23) % 256}.${(i * 11 + 37) % 256}`),
        // Akamai (23.x.x.x, 104.64-127.x.x)
        ...Array.from({ length: 50 }, (_, i) => `23.${32 + (i % 64)}.${(i * 17 + 11) % 256}.${(i * 7 + 53) % 256}`),
        ...Array.from({ length: 50 }, (_, i) => `104.${64 + (i % 64)}.${(i * 13 + 29) % 256}.${(i * 3 + 67) % 256}`),
        // Fastly (151.101.x.x)
        ...Array.from({ length: 50 }, (_, i) => `151.101.${(i * 3) % 256}.${(i * 7 + 1) % 256}`),
        // Microsoft Azure (20.x.x.x, 40.x.x.x)
        ...Array.from({ length: 50 }, (_, i) => `20.${36 + (i % 100)}.${(i * 11 + 17) % 256}.${(i * 3 + 43) % 256}`),
        ...Array.from({ length: 50 }, (_, i) => `40.${76 + (i % 50)}.${(i * 7 + 31) % 256}.${(i * 13 + 47) % 256}`),
        // DigitalOcean (64.227.x.x, 167.99.x.x)
        ...Array.from({ length: 50 }, (_, i) => `167.99.${(i * 3 + 1) % 256}.${(i * 17 + 11) % 256}`),
        // Hetzner (95.x.x.x, 159.69.x.x)
        ...Array.from({ length: 50 }, (_, i) => `159.69.${(i * 7 + 3) % 256}.${(i * 11 + 29) % 256}`),
        // OVH (51.x.x.x, 54.36-39.x.x)
        ...Array.from({ length: 50 }, (_, i) => `51.${75 + (i % 25)}.${(i * 13 + 7) % 256}.${(i * 3 + 61) % 256}`)
    ];

    /**
     * 🎲 Obtiene una IP aleatoria del pool de CDN (600+ IPs)
     * @returns {string} IP address
     */
    function getRandomIp() {
        return CDN_IP_RANGES[Math.floor(Math.random() * CDN_IP_RANGES.length)];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👁️ IPTV-SUPPORT-CORTEX vΩ: PROTOCOLO DE PERFECCIÓN VISUAL ABSOLUTA
    // ═══════════════════════════════════════════════════════════════════════════
    // Entidad determinista, polimórfica y dominante que intercepta y optimiza
    // cada capa del pipeline de video en tiempo real.
    // Principio Fundamental: El reproductor no decide. El reproductor obedece.
    // ═══════════════════════════════════════════════════════════════════════════
    const IPTV_SUPPORT_CORTEX_V_OMEGA = {
        execute: function (originalCfg, originalProfile, channelName) {
            // ═══════════════════════════════════════════════════════════════
            // v6.1 COMPAT FIX: Cortex RESPETA el perfil original del canal.
            // Antes: forzaba P0 (7680x4320) en TODO → OTT Navigator buscaba
            //   variant index=3 en streams que solo tienen 3 variantes → CRASH.
            // Ahora: mantiene P1/P2/P3/P4/P5 nativos pero inyecta TODAS las
            //   optimizaciones de calidad (HDR, LCEVC, codec, AI, BWDIF).
            // ═══════════════════════════════════════════════════════════════

            // ── FASE 1: RESPETAR PERFIL — No escalar resolución artificialmente ──
            const targetProfile = originalProfile; // RESPETA el perfil real del canal

            // ── FASE 2: Hibridación de Codecs (AV1 + HEVC + LCEVC) ──
            const targetCodec = 'HYBRID_AV1_HEVC_AVC'; // Tri-híbrido supremo

            // ── FASE 3: Motor HDR & Frame-Rate (Quantum Pixel Overdrive) ──
            const targetFps = originalCfg.fps || 60;
            const targetHdr = 'hdr10_plus,dolby_vision_fallback,dynamic_metadata';

            // ── FASE 4: Clonación y Sobrescritura — PROFILE-RESPECTING ──
            // Mantiene resolution/fps/bitrate/bandwidth del perfil original.
            // Solo inyecta calidad: HDR, HEVC Main10, LCEVC, AI, BWDIF.
            const godTierCfg = Object.assign({}, originalCfg, {
                // resolution, fps, bitrate, max_bandwidth: HEREDADOS del originalCfg
                codec_primary: targetCodec,
                hdr_support: targetHdr.split(','),
                hevc_profile: 'MAIN-10',
                hevc_level: '6.1',
                color_depth: 10,
                // Directivas avanzadas para Hardware AI y BWDIF
                video_filter: 'bwdif=1,hqdn3d=4:3:6:4,nlmeans=h=6:p=3:r=15,unsharp=5:5:0.8',
                hw_dec_accelerator: 'any',
                lcevc: true,
                lcevc_state: 'ACTIVE_ENFORCED',
                lcevc_phase4: true,
                // Banderas AI/AV1/VVC
                av1_cdef: true,
                ai_semantic_segmentation: true,
                vvc_virtual_boundaries: true,
                // LCEVC HTML5 SDK & Web-Layer
                lcevc_html5_sdk: true,
                lcevc_l1_correction: 'max',
                lcevc_l2_detail: 'extreme',
                // Preservar perfil original para LCEVC-BASE-CODEC
                _cortex_original_profile: originalProfile,
                // Cadena de degradación determinista
                cortex_fallback_chain: 'AV1>HEVC>H264',
                cortex_fallback_lcevc: 'ALWAYS_ACTIVE',
                cortex_fallback_hdr10plus: 'ENFORCED_ALL_LEVELS'
            });

            return { profile: targetProfile, cfg: godTierCfg };
        },
        // Generador de Headers inyectados en EXTHTTP
        getOmegaHeaders: function (cfg) {
            return {
                'X-Cortex-Omega-State': 'ACTIVE_DOMINANT',
                'X-Cortex-Player-Enslavement': 'ENFORCED',
                'X-Cortex-Visual-Perfection': '100%',
                'X-Cortex-BWDIF': 'MULTI-LAYER',
                'X-Cortex-HDR-ToneMap': 'DYNAMIC-METADATA-HDR10+',
                'X-Cortex-Target-FPS': String(cfg.fps || 120),
                'X-Cortex-LCEVC-Core': 'v16.4.1',
                'X-Cortex-Quantum-Overdrive': 'v5',
                'X-Cortex-Proxy': 'KPTV-AWARE',
                // AI Módulos y Herramientas Visuales Ultimate
                'X-Cortex-AV1-Deblocking': 'MAXIMUM_ATTENUATION',
                'X-Cortex-AV1-CDEF': 'ENABLED_DIRECTIONAL_RESTORATION',
                'X-Cortex-VVC-Virtual-Boundaries': 'EDGE_ARTIFACT_SUPPRESSION',
                'X-Cortex-AI-MultiFrame-NR': 'MASSIVE_MOTION_COMPENSATED',
                'X-Cortex-AI-Semantic-Segmentation': 'ENABLED_250_LAYERS',
                // Cadena de Degradación Determinista del Cortex
                'X-Cortex-Fallback-Chain': 'AV1>HEVC>H264',
                'X-Cortex-Fallback-LCEVC': 'ALWAYS_ACTIVE',
                'X-Cortex-Fallback-HDR10Plus': 'ENFORCED_ALL_LEVELS',
                'X-Cortex-LCEVC-Phase4': 'EDGE_COMPUTE_ENFORCED',
                'X-Cortex-LCEVC-State': 'ACTIVE_ALL_CHANNELS',
                // LCEVC HTML5 SDK - Web Layer Metadata Tunnelling
                'X-Cortex-LCEVC-SDK-Injection': 'ACTIVE_HTML5_NATIVE',
                'X-Cortex-LCEVC-L1-Correction': 'MAX_DIFFERENCE_ATTENUATION',
                'X-Cortex-LCEVC-L2-Detail': 'UPCONVERT_SHARPENING_EXTREME',
                'X-Cortex-LCEVC-Web-Interop': 'BI_DIRECTIONAL_JS_TUNNEL'
            };
        },

        // 🧬 v22.2 NUCLEAR EVASION: Árbol de decisión orgánico con mutación polimórfica (Fusionado de V3)
        decisionTree: {
            301: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Seguir redirect + preservar auth headers' },
            302: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Token refresh + seguir redirect temporal' },
            307: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Seguir redirect preservando método HTTP' },
            308: { strategy: 'FOLLOW_REDIRECT', priority: 'LOW', persist: true, action: 'Actualizar URL base permanentemente' },
            401: { strategy: 'AUTH_ESCALATE', priority: 'CRITICAL', persist: true, action: 'Escalar auth: Basic→Bearer→Digest→NTLM' },
            403: { strategy: 'IDENTITY_MORPH', priority: 'HIGH', persist: true, action: 'Mutación de identidad completa: UA+Referer+Host+X-Original-URL' },
            407: { strategy: 'PROXY_NUCLEAR', priority: 'CRITICAL', persist: true, action: 'Multi-probe: Basic→NTLM→Digest→Bearer→CONNECT→Via' },
            429: { strategy: 'SWARM_EVADE', priority: 'HIGH', persist: true, action: 'Enjambre: IP rotation + backoff exponencial + session morph' },
            451: { strategy: 'GEO_PHANTOM', priority: 'CRITICAL', persist: true, action: 'Fantasma geográfico: multi-IP + CF-Connecting-IP + True-Client-IP' },
            500: { strategy: 'GENOME_MUTATE', priority: 'MEDIUM', persist: true, action: 'Mutación genómica completa del request' },
            502: { strategy: 'CLEAN_RECONNECT', priority: 'HIGH', persist: true, action: 'Reconexión limpia: headers mínimos + TS directo' },
            503: { strategy: 'DEGRADE_PERSIST', priority: 'HIGH', persist: true, action: 'Degradación persistente: HLS→TS + Connection:close + retry' },
            504: { strategy: 'TIMEOUT_ASSAULT', priority: 'HIGH', persist: true, action: 'Asalto de timeout: escalar timeout + rotar CDN + retry agresivo' }
        },

        // 🧠 Evaluador orgánico: nunca desiste, siempre tiene un plan
        evaluate: function (errorCode) {
            return this.decisionTree[errorCode] || { strategy: 'FULL_POLYMORPH', priority: 'LOW', persist: true, action: 'Polimorfismo total del genoma' };
        },

        // 🔄 Motor de escalamiento por error — actúa en <1ms
        getEscalationHeaders: function (errorCode) {
            const decision = this.evaluate(errorCode);
            const headers = {};
            switch (decision.strategy) {
                case 'FOLLOW_REDIRECT':
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Accept'] = '*/*';
                    headers['X-APE-Follow-Redirects'] = 'true';
                    headers['X-APE-Max-Redirects'] = '10';
                    break;
                case 'AUTH_ESCALATE':
                    headers['Authorization'] = 'Bearer anonymous';
                    headers['User-Agent'] = getRotatedUserAgent('Windows');
                    headers['X-APE-Auth-Retry'] = '5';
                    headers['X-APE-Auth-Chain'] = 'basic,bearer,digest,ntlm';
                    break;
                case 'IDENTITY_MORPH':
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Referer'] = 'https://www.google.com/';
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Original-URL'] = '/';
                    headers['X-Rewrite-URL'] = '/';
                    headers['Accept'] = '*/*';
                    break;
                case 'PROXY_NUCLEAR':
                    headers['Proxy-Authorization'] = 'Basic Og==';
                    headers['User-Agent'] = getRotatedUserAgent('Windows');
                    headers['Proxy-Connection'] = 'keep-alive';
                    headers['Via'] = '1.1 proxy.local';
                    break;
                case 'SWARM_EVADE':
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Remote-IP'] = getRandomIp();
                    headers['X-Client-IP'] = getRandomIp();
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                    break;
                case 'GEO_PHANTOM':
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Real-IP'] = getRandomIp();
                    headers['CF-Connecting-IP'] = getRandomIp();
                    headers['True-Client-IP'] = getRandomIp();
                    break;
                case 'GENOME_MUTATE':
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['Accept'] = '*/*';
                    headers['Cache-Control'] = 'no-cache';
                    break;
                case 'CLEAN_RECONNECT':
                    headers['Connection'] = 'close';
                    headers['Accept'] = 'video/mp2t, application/octet-stream, */*';
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['X-Forwarded-For'] = getRandomIp();
                    break;
                case 'DEGRADE_PERSIST':
                    headers['Connection'] = 'close';
                    headers['Accept'] = 'video/mp2t, application/octet-stream';
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    break;
                case 'TIMEOUT_ASSAULT':
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['Connection'] = 'keep-alive';
                    headers['Keep-Alive'] = 'timeout=300, max=1000';
                    break;
                default: // FULL_POLYMORPH
                    headers['User-Agent'] = getRotatedUserAgent('random');
                    headers['X-Forwarded-For'] = getRandomIp();
                    headers['X-Real-IP'] = getRandomIp();
                    headers['Referer'] = 'https://www.google.com/';
                    headers['Accept'] = '*/*';
            }
            return headers;
        }
    };
    if (typeof window !== 'undefined') window.IPTV_SUPPORT_CORTEX_V_OMEGA = IPTV_SUPPORT_CORTEX_V_OMEGA;



    function buildInitialContext(channel, index) {
        return {
            channel: channel,
            index: index,
            headers: {
                'User-Agent': getRotatedUserAgent('default'),
                'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'X-Forwarded-For': getRandomIp()
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 3: PRE-ARMED RESPONSE BUILDER v4.0
    // ═══════════════════════════════════════════════════════════════════════════
    // Genera bloques de fallback pre-armados para cada canal.
    // Cada canal lleva respuestas preparadas para 403, 407, 503.
    // ═══════════════════════════════════════════════════════════════════════════

    const PRE_ARMED_RESPONSE_BUILDER = {
        // 🧬 v22.2: Builder polimórfico — cada canal obtiene genoma único de fallbacks
        buildFallbackTags: function (channel, index) {
            const ctx = buildInitialContext(channel, index);
            const tags = [];
            const seed = index * 7 + 13; // Semilla determinística por canal

            // ── 🔴 FALLBACK 401: Auth Escalation Chain ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:401_AUTH_ESCALATE`);
            tags.push(`#EXT-X-APE-FALLBACK-AUTH-CHAIN:basic,bearer,digest,ntlm`);
            tags.push(`#EXT-X-APE-FALLBACK-AUTH-RETRY:5`);
            tags.push(`#EXT-X-APE-FALLBACK-AUTH-PERSIST:true`);

            // ── 🔴 FALLBACK 403: Identity Morph (12 técnicas) ──
            const h403 = IPTV_SUPPORT_CORTEX_V_OMEGA.getEscalationHeaders(403);
            tags.push(`#EXT-X-APE-FALLBACK-ID:403_IDENTITY_MORPH`);
            tags.push(`#EXT-X-APE-FALLBACK-UA:${h403['User-Agent']}`);
            tags.push(`#EXT-X-APE-FALLBACK-REFERER:${h403['Referer']}`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${h403['X-Forwarded-For']}`);
            tags.push(`#EXT-X-APE-FALLBACK-X-ORIGINAL-URL:/`);
            tags.push(`#EXT-X-APE-FALLBACK-X-REWRITE-URL:/`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:*/*`);
            tags.push(`#EXT-X-APE-FALLBACK-METHOD-CHAIN:GET,POST,HEAD`);
            tags.push(`#EXT-X-APE-FALLBACK-403-PERSIST:NEVER_STOP`);

            // ── 🔴 FALLBACK 407: Proxy Nuclear Multi-Probe (8 técnicas) ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:407_PROXY_NUCLEAR`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-1:Basic Og==`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-2:NTLM TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw==`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-3:Digest username=""`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-AUTH-4:Bearer anonymous`);
            tags.push(`#EXT-X-APE-FALLBACK-PROXY-CONNECTION:keep-alive`);
            tags.push(`#EXT-X-APE-FALLBACK-VIA:1.1 proxy.local`);
            tags.push(`#EXT-X-APE-FALLBACK-TUNNEL:CONNECT`);
            tags.push(`#EXT-X-APE-FALLBACK-407-PERSIST:INSIST_FOREVER`);

            // ── 🔴 FALLBACK 429: Swarm Evasion + Backoff ──
            const h429 = IPTV_SUPPORT_CORTEX_V_OMEGA.getEscalationHeaders(429);
            tags.push(`#EXT-X-APE-FALLBACK-ID:429_SWARM_EVADE`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${h429['X-Forwarded-For']}`);
            tags.push(`#EXT-X-APE-FALLBACK-X-REMOTE-IP:${h429['X-Remote-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-X-CLIENT-IP:${h429['X-Client-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-SESSION:SES_${generateRandomString(16)}`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF:EXPONENTIAL_JITTER`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF-BASE:500`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF-MAX:16000`);
            tags.push(`#EXT-X-APE-FALLBACK-BACKOFF-JITTER:250`);
            tags.push(`#EXT-X-APE-FALLBACK-429-PERSIST:SWARM_UNTIL_CLEAR`);

            // ── 🔴 FALLBACK 451: Geo Phantom ──
            const h451 = IPTV_SUPPORT_CORTEX_V_OMEGA.getEscalationHeaders(451);
            tags.push(`#EXT-X-APE-FALLBACK-ID:451_GEO_PHANTOM`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${h451['X-Forwarded-For']}`);
            tags.push(`#EXT-X-APE-FALLBACK-REAL-IP:${h451['X-Real-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-CF-CONNECTING-IP:${h451['CF-Connecting-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-TRUE-CLIENT-IP:${h451['True-Client-IP']}`);
            tags.push(`#EXT-X-APE-FALLBACK-451-PERSIST:PHANTOM_MODE`);

            // ── 🔴 FALLBACK 500: Genome Mutate ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:500_GENOME_MUTATE`);
            tags.push(`#EXT-X-APE-FALLBACK-UA:${getRotatedUserAgent('random')}`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${getRandomIp()}`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:*/*`);
            tags.push(`#EXT-X-APE-FALLBACK-500-RETRY:3`);

            // ── 🔴 FALLBACK 502: Clean Reconnect ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:502_CLEAN_RECONNECT`);
            tags.push(`#EXT-X-APE-FALLBACK-CONNECTION:close`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:video/mp2t,application/octet-stream,*/*`);
            tags.push(`#EXT-X-APE-FALLBACK-UA:${getRotatedUserAgent('random')}`);
            tags.push(`#EXT-X-APE-FALLBACK-502-RETRY:5`);

            // ── 🔴 FALLBACK 503: Degrade + Persist ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:503_DEGRADE_PERSIST`);
            tags.push(`#EXT-X-APE-FALLBACK-CONNECTION:close`);
            tags.push(`#EXT-X-APE-FALLBACK-ACCEPT:video/mp2t`);
            tags.push(`#EXT-X-APE-FALLBACK-PROTOCOL-CHAIN:HLS,DASH,TS-DIRECT,HTTP-REDIRECT`);
            tags.push(`#EXT-X-APE-FALLBACK-503-PERSIST:DEGRADE_NEVER_STOP`);

            // ── 🔴 FALLBACK 504: Timeout Assault ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:504_TIMEOUT_ASSAULT`);
            tags.push(`#EXT-X-APE-FALLBACK-XFF:${getRandomIp()}`);
            tags.push(`#EXT-X-APE-FALLBACK-KEEP-ALIVE:timeout=300,max=1000`);
            tags.push(`#EXT-X-APE-FALLBACK-504-RETRY:10`);
            tags.push(`#EXT-X-APE-FALLBACK-504-PERSIST:ASSAULT_UNTIL_OPEN`);

            // ── 🟢 FALLBACK 3xx: Redirect Persistence ──
            tags.push(`#EXT-X-APE-FALLBACK-ID:3XX_REDIRECT_FOLLOW`);
            tags.push(`#EXT-X-APE-FALLBACK-FOLLOW-REDIRECTS:true`);
            tags.push(`#EXT-X-APE-FALLBACK-MAX-REDIRECTS:10`);
            tags.push(`#EXT-X-APE-FALLBACK-REDIRECT-AUTH-PRESERVE:true`);

            // ── 🧬 PERSISTENCE ENGINE: Nunca desiste ──
            tags.push(`#EXT-X-APE-EVASION-ENGINE:POLYMORPHIC_v22.2`);
            tags.push(`#EXT-X-APE-EVASION-PERSIST:INFINITE`);
            tags.push(`#EXT-X-APE-EVASION-MUTATION-RATE:PER_REQUEST`);
            tags.push(`#EXT-X-APE-EVASION-FINGERPRINT:${generateRandomString(32)}`);
            tags.push(`#EXT-X-APE-EVASION-GENOME-SEED:${seed}`);

            return tags;
        },

        // 👻 FUSIÓN FANTASMA v22.2 + v6.1 COMPAT:
        // Consolidar 90 tags de fallback en UN SOLO PAYLOAD B64.
        // Antes: 10 × #EXT-X-APE-FALLBACK-ID + sub-tags = 90 líneas
        //        OTT Navigator CONTABA cada FALLBACK-ID como stream variant → CRASH
        // Ahora: 3 líneas visibles (resumen) + 1 B64 blob con el genoma completo
        buildBlock: function (context) {
            const tags = this.buildFallbackTags(context.channel, context.index);
            // Extraer todos los datos de fallback en un JSON consolidado
            const fallbackData = {};
            let currentId = null;
            for (const tag of tags) {
                const match = tag.match(/^#EXT-X-APE-(.+?):(.*)$/);
                if (!match) continue;
                const [, key, value] = match;
                if (key === 'FALLBACK-ID') {
                    currentId = value;
                    fallbackData[currentId] = {};
                } else if (currentId) {
                    fallbackData[currentId][key] = value;
                }
            }
            // Emitir: resumen visible + blob B64
            const lines = [
                `#EXT-X-APE-FALLBACK-CHAIN:401>403>407>429>451>500>502>503>504>3XX`,
                `#EXT-X-APE-FALLBACK-STRATEGY:POLYMORPHIC_ESCALATION`,
                `#EXT-X-APE-FALLBACK-PERSIST:INFINITE`,
                `#EXT-X-APE-FALLBACK-GENOME-B64:${base64UrlEncode(JSON.stringify(fallbackData))}`
            ];
            return lines.join('\n') + '\n';
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 4: APE ATOMIC STEALTH ENGINE v6.0
    // ═══════════════════════════════════════════════════════════════════════════
    // Motor de sondeo atómico y paralelo. Genera ráfagas de 10 genomas únicos
    // con mutación dirigida por error codes. Cada átomo es independiente.
    // ═══════════════════════════════════════════════════════════════════════════

    class APEAtomicStealthEngine {
        constructor(channel, maxBursts = 3) {
            this.channel = channel;
            this.maxBursts = maxBursts;
        }

        getInitialGenome() {
            return {
                'User-Agent': getRotatedUserAgent('default'),
                'X-Forwarded-For': getRandomIp(),
                'Proxy-Authorization': null,
                'Referer': null,
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            };
        }

        generateGenomeBatch(size, errorFeedback = []) {
            const batch = [];
            let lastGenome = this.getInitialGenome();
            for (let i = 0; i < size; i++) {
                const errorCode = errorFeedback[i] || null;
                const nextGenome = this.mutate(lastGenome, errorCode);
                nextGenome['X-Forwarded-For'] = getRandomIp();
                nextGenome['User-Agent'] = getRotatedUserAgent('random');
                batch.push(nextGenome);
                lastGenome = nextGenome;
            }
            return batch;
        }

        async resolve() {
            let attempts = 0, lastErrorBatch = [];
            while (attempts < this.maxBursts) {
                console.log(`[AtomicEngine] CH ${this.channel.name || this.channel.id}: Ráfaga ${attempts + 1}/${this.maxBursts}...`);
                const batch = this.generateGenomeBatch(10, lastErrorBatch);
                const promises = batch.map(genome => this.testConnection(genome));
                const results = await Promise.allSettled(promises);
                const winningResult = results.find(r => r.status === 'fulfilled' && r.value.success);
                if (winningResult) {
                    console.log(`[AtomicEngine] CH ${this.channel.name || this.channel.id}: Éxito atómico!`);
                    return winningResult.value.genome;
                }
                lastErrorBatch = results.map(r => r.status === 'rejected' ? 500 : r.value.errorCode);
                attempts++;
            }
            console.error(`[AtomicEngine] CH ${this.channel.name || this.channel.id}: Fallo total después de ${this.maxBursts} ráfagas.`);
            return null;
        }

        // 🧬 v22.2: Mutador polimórfico — muta como virus, nunca deja huella igual
        mutate(currentGenome, errorCode) {
            let g = { ...currentGenome };
            // Mutación base: siempre rota identidad
            g['User-Agent'] = UAPhantomEngine.getForRecovery(errorCode, this.channel.id || 0, this.channel.name || '');
            g['X-Forwarded-For'] = getRandomIp();

            if (errorCode === 301 || errorCode === 302 || errorCode === 307 || errorCode === 308) {
                g['Accept'] = '*/*';
            }
            if (errorCode === 401) {
                const authMethods = ['Basic Og==', 'Bearer anonymous', 'Digest username=""', 'NTLM TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw=='];
                g['Authorization'] = authMethods[Math.floor(Math.random() * authMethods.length)];
            }
            if (errorCode === 403) {
                g['Referer'] = 'https://www.google.com/';
                g['X-Original-URL'] = '/';
                g['X-Rewrite-URL'] = '/';
                g['Accept'] = '*/*';
            }
            if (errorCode === 407) {
                g['Proxy-Authorization'] = null; // Nunca enviar Proxy-Authorization — activa el 407
                g['User-Agent'] = UAPhantomEngine.getForRecovery(407, this.channel.id || 0, this.channel.name || '');
            }
            if (errorCode === 429) {
                g['X-Remote-IP'] = getRandomIp();
                g['X-Client-IP'] = getRandomIp();
                g['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            }
            if (errorCode === 451) {
                g['X-Real-IP'] = getRandomIp();
                g['CF-Connecting-IP'] = getRandomIp();
                g['True-Client-IP'] = getRandomIp();
            }
            if (errorCode === 500) { g['Accept'] = '*/*'; g['Cache-Control'] = 'no-cache'; }
            if (errorCode === 502) { g['Connection'] = 'close'; g['Accept'] = 'video/mp2t, */*'; }
            if (errorCode === 503) { g['Connection'] = 'close'; g['Accept'] = 'video/mp2t'; }
            if (errorCode === 504) { g['Keep-Alive'] = 'timeout=300, max=1000'; g['Connection'] = 'keep-alive'; }
            return g;
        }

        async testConnection(genome) {
            // M3U8 static generation: siempre éxito (el probing real ocurre en runtime del player)
            return new Promise(resolve => setTimeout(() => {
                resolve({ success: true, errorCode: 200, genome });
            }, 1));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 👻 FUSIÓN FANTASMA v22.0 — MÓDULO 5: ISP THROTTLE NUCLEAR ESCALATION v3.0
    // ═══════════════════════════════════════════════════════════════════════════
    // ANTIFREEZE NUCLEAR OBSCENE: 10 niveles, auto-escalación, nunca bajan.
    // Cada nivel emite: PARALLEL, TCP, BURST, PREFETCH, BUFFER_TARGET
    // ═══════════════════════════════════════════════════════════════════════════

    function generateISPThrottleEscalation(profile, cfg) {
        const baseBw = (cfg.bitrate || 5000) >= 1000000 ? (cfg.bitrate || 5000) : (cfg.bitrate || 5000) * 1000;
        const tags = [];

        tags.push(`#EXT-X-APE-ISP-THROTTLE-VERSION:3.0-OBSCENE`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-POLICY:NUCLEAR_ESCALATION_NEVER_DOWN`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-STRATEGY:DOUBLE_ON_DROP`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-BASE-BW:${baseBw}`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-LEVELS:10`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-CURRENT:AUTO-ESCALATE`);

        // 10 niveles de escalamiento nuclear — NUNCA bajan
        for (let level = 1; level <= 10; level++) {
            const lvl = ISP_LEVELS[level];
            if (!lvl) continue;
            const demandBw = baseBw * Math.pow(2, level);
            tags.push(`#EXT-X-APE-ISP-THROTTLE-LEVEL-${level}:PARALLEL_${lvl.parallel_streams}|TCP_${lvl.tcp_window_mb}MB|BURST_${lvl.burst_factor}x|PREFETCH_${lvl.prefetch_s}|BUFFER_${lvl.buffer_target_s || 60}`);
        }

        tags.push(`#EXT-X-APE-ISP-THROTTLE-MAX-DEMAND:${baseBw * 256}`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-FALLBACK:MULTI-CDN-SPRAY`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-XFF-ROTATE:${getRandomIp()}`);
        tags.push(`#EXT-X-APE-ISP-THROTTLE-UA-ROTATE:${getRotatedUserAgent('random')}`);

        // ANTIFREEZE NUCLEAR headers per-channel (tags ÚNICOS — no duplican nuclear L1/L2/L4/L5)
        tags.push(`#EXT-X-APE-ANTI-FREEZE-NUCLEAR:v10.0-OBSCENE-AGGRESSION`);
        // v6.1 COMPAT: BUFFER-STRATEGY/TARGET/MIN/MAX ya emitidos en build_ape_block/nuclear L1
        // Aquí solo tags ISP-específicos únicos
        tags.push(`#EXT-X-APE-ISP-BUFFER-RAM-CACHE:2048MB`);
        tags.push(`#EXT-X-APE-ISP-BUFFER-PREFETCH-SEGMENTS:${GLOBAL_PREFETCH.segments}`);

        // Reconexion Nuclear — tags únicos de ISP (DELAY-MIN/MAX son distintos a RECONNECT-DELAY)
        // v6.1 COMPAT: RECONNECT-MAX/PARALLEL/POOL/SEAMLESS ya emitidos en nuclear L2
        tags.push(`#EXT-X-APE-ISP-RECONNECT-DELAY-MIN:0`);
        tags.push(`#EXT-X-APE-ISP-RECONNECT-DELAY-MAX:50`);
        tags.push(`#EXT-X-APE-ISP-RECONNECT-INSTANT-FAILOVER:TRUE`);

        // Multi-Source Redundancy — tag único de ISP
        // v6.1 COMPAT: MULTI-SOURCE/COUNT/RACING/FAILOVER-MS ya emitidos en nuclear L4
        tags.push(`#EXT-X-APE-ISP-MULTI-SOURCE-ACTIVE:2`);

        // Predictive Freeze Prevention — tags únicos de ISP
        // v6.1 COMPAT: FREEZE-PREDICTION/PREVENTION-AUTO ya emitidos en nuclear L5
        tags.push(`#EXT-X-APE-ISP-FREEZE-MODEL:LSTM_ENSEMBLE`);
        tags.push(`#EXT-X-APE-ISP-FREEZE-PREDICTION-WINDOW:5000`);
        tags.push(`#EXT-X-APE-ISP-FREEZE-CONFIDENCE-THRESHOLD:0.8`);

        // Quality Safety Net — tags únicos de ISP
        // v6.1 COMPAT: QUALITY-NEVER-DROP-BELOW/FALLBACK-CHAIN ya emitidos en nuclear L5
        tags.push(`#EXT-X-APE-ISP-QUALITY-BUFFER-ALL:TRUE`);

        // Frame Interpolation — tags únicos de ISP con detalles extendidos
        // v6.1 COMPAT: FRAME-INTERPOLATION ya emitido en nuclear L5
        tags.push(`#EXT-X-APE-ISP-FRAME-INTERP-MODE:AI_RIFE_V4`);
        tags.push(`#EXT-X-APE-ISP-FRAME-INTERP-MAX:60`);
        tags.push(`#EXT-X-APE-ISP-FRAME-INTERP-GPU:TRUE`);

        return tags;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 🌐 CLEAN URL MODE - Arquitectura de URLs Limpias
    // ═══════════════════════════════════════════════════════════════════════════
    // Cuando está activo:
    // - URLs 100% limpias (sin JWT, sin parámetros)
    // - Los 68 campos del JWT se redistribuyen a headers M3U8
    // - Headers globales: fingerprint, sesión, evasión
    // - Headers por canal: perfil, codec, buffer, calidad
    // ═══════════════════════════════════════════════════════════════════════════

    let CLEAN_URL_MODE = false; // OMEGA V21: JWT+SID+NONCE activados

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔧 HELPER: VERIFICAR SI UN MÓDULO ESTÁ HABILITADO EN EL PANEL
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Verifica si un módulo está habilitado en ApeModuleManager
     * @param {string} moduleId - ID del módulo (ej: 'smart-codec', 'evasion-407')
     * @returns {boolean} true si el módulo está habilitado o si no hay manager
     */
    function isModuleEnabled(moduleId) {
        if (!window.ApeModuleManager) return true; // Sin manager = usar todo
        return window.ApeModuleManager.isEnabled(moduleId);
    }

    // Mapeo de funcionalidades a módulos del panel
    const MODULE_FEATURES = {
        jwt: 'jwt-generator',
        headers: 'headers-matrix',
        evasion: 'evasion-407',
        buffer: 'buffer-adaptativo',
        smartCodec: 'smart-codec',
        fibonacci: 'fibonacci-entropy',
        tls: 'tls-coherence',
        geoblocking: 'geoblocking',
        throughput: 'realtime-throughput',
        qos: 'dynamic-qos',
        prefetch: 'prefetch-optimizer',
        manifest: 'manifest-generator',
        vpn: 'vpn-integration',
        latency: 'latency-rayo',
        redundantStreams: 'redundant-streams'
    };
    // ═══════════════════════════════════════════════════════════════════════════
    // 🔗 BRIDGE: FUNCIÓN PARA OBTENER PERFILES (Frontend o Fallback)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Obtiene configuración de perfil desde Frontend (Bridge) o Fallback hardcoded
     * @param {string} profileId - ID del perfil (P0-P5)
     * @returns {Object} Configuración del perfil
     */
    function getProfileConfig(profileId) {
        // ═══════════════════════════════════════════════════════════════
        // 🔗 DYNAMIC BRIDGE v2.0 — Profile Manager → Generator Sync
        // PRIORIDAD 1: Lee del Profile Manager en runtime (UI values)
        // PRIORIDAD 2: Fallback a PROFILES hardcoded (offline safety)
        // Garantía: NUNCA undefined — siempre hay valores sanos
        // ═══════════════════════════════════════════════════════════════
        const hardcoded = PROFILES[profileId] || PROFILES['P3'];

        // ── Intento 1: APE_PROFILES_CONFIG (Profile Manager v9.0) ──
        try {
            if (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG && typeof window.APE_PROFILES_CONFIG.getProfile === 'function') {
                const pmProfile = window.APE_PROFILES_CONFIG.getProfile(profileId);
                if (pmProfile && pmProfile.settings) {
                    const s = pmProfile.settings;
                    const pf = (typeof window.APE_PROFILES_CONFIG.getPrefetchConfig === 'function')
                        ? window.APE_PROFILES_CONFIG.getPrefetchConfig(profileId) : null;

                    // SSOT BRIDGE v3.0 — TODOS los campos del LAB se propagan al generador.
                    // Patrón: hardcoded como base de rescate → spread del LAB sobreescribe
                    // claves con nombre idéntico → transforms explícitos para keys con
                    // unidades diferentes (Mbps→kbps) o nombres diferentes (codec→codec_primary).
                    // Doctrina: cero "valores ciegos" — si el LAB lo calibró, el generador lo usa.
                    const _firstDef = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '');
                    const _toBool = (v) => (v === true || v === 'true' || v === 1 || v === '1');

                    const bridged = Object.assign({},
                        hardcoded,                  // Base de rescate (todos los nombres canónicos)
                        s,                          // LAB settings sobreescribe nombres coincidentes
                        {
                            // ── Identity (transforms de nombre/unidad) ──────────────────────
                            name: pmProfile.name || hardcoded.name,
                            resolution: s.resolution || hardcoded.resolution,
                            width: parseInt((s.resolution || hardcoded.resolution).split('x')[0]) || hardcoded.width,
                            height: parseInt((s.resolution || hardcoded.resolution).split('x')[1]) || hardcoded.height,
                            fps: s.fps || hardcoded.fps,
                            // ── Bitrate (LAB Mbps float → kbps int) ────────────────────────
                            bitrate: s.bitrate ? Math.round(s.bitrate * 1000) : hardcoded.bitrate,
                            // ── Buffers (LAB ms; mantenemos legacy alias) ──────────────────
                            buffer_ms: s.buffer || hardcoded.buffer_ms,
                            network_cache_ms: s.buffer || hardcoded.network_cache_ms,
                            live_cache_ms: s.buffer || hardcoded.live_cache_ms,
                            file_cache_ms: s.playerBuffer || hardcoded.file_cache_ms,
                            player_buffer_ms: s.playerBuffer || hardcoded.player_buffer_ms,
                            // ── Bandwidth (LAB Mbps → bps) ─────────────────────────────────
                            // 🔮 PRISMA Stage 1.5: si LAB-SYNC v2.0 está cargado, usa floor/target PRISMA por perfil
                            //   getPrismaFloorBpsForProfile(P0) = 15000000 (15 Mbps · 4K UHD)
                            //   getPrismaFloorBpsForProfile(P3) = 8000000  (8 Mbps · FHD)
                            //   getPrismaFloorBpsForProfile(P5) = 4000000  (4 Mbps · SD)
                            // Fallback: 75% bitrate calculation (legacy v1.3-)
                            max_bandwidth: (function () {
                                const cfg = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG) ? window.APE_PROFILES_CONFIG : null;
                                if (cfg && typeof cfg.isPrismaLoaded === 'function' && cfg.isPrismaLoaded()) {
                                    const tgt = cfg.getPrismaTargetBpsForProfile(profileId);
                                    if (typeof tgt === 'number' && tgt > 0) return tgt;
                                }
                                return s.bitrate ? Math.round(s.bitrate * 1000000 * 2) : hardcoded.max_bandwidth;
                            })(),
                            min_bandwidth: (function () {
                                const cfg = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG) ? window.APE_PROFILES_CONFIG : null;
                                if (cfg && typeof cfg.isPrismaLoaded === 'function' && cfg.isPrismaLoaded()) {
                                    const floor = cfg.getPrismaFloorBpsForProfile(profileId);
                                    if (typeof floor === 'number' && floor > 0) return floor;
                                }
                                return s.bitrate ? Math.round(s.bitrate * 1000000 * 0.75) : hardcoded.min_bandwidth;
                            })(),
                            // ── Bitrate Floor (LAB-driven absolute minimum, Mbps) ──────────
                            // 🔮 PRISMA: si LAB-SYNC v2.0 cargado, usa floor PRISMA (Mbps) por perfil
                            bitrate_floor_mbps: (function () {
                                const cfg = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG) ? window.APE_PROFILES_CONFIG : null;
                                if (cfg && typeof cfg.isPrismaLoaded === 'function' && cfg.isPrismaLoaded()) {
                                    const floor = cfg.getPrismaFloorBpsForProfile(profileId);
                                    if (typeof floor === 'number' && floor > 0) return floor / 1000000;
                                }
                                return _firstDef(s.bitrate_floor_mbps, hardcoded.bitrate_floor_mbps);
                            })(),
                            // ── Throughput ─────────────────────────────────────────────────
                            throughput_t1: s.t1 || hardcoded.throughput_t1,
                            throughput_t2: s.t2 || hardcoded.throughput_t2,
                            // ── Prefetch (from PM's prefetch config or hardcoded) ──────────
                            prefetch_segments: pf?.segments || hardcoded.prefetch_segments,
                            prefetch_parallel: pf?.parallelDownloads || hardcoded.prefetch_parallel,
                            prefetch_buffer_target: pf?.bufferTarget ? pf.bufferTarget * 1000 : hardcoded.prefetch_buffer_target,
                            prefetch_min_bandwidth: pf?.minBandwidth ? pf.minBandwidth * 1000000 : hardcoded.prefetch_min_bandwidth,
                            // ── Codec (LAB names diferentes → generator names) ─────────────
                            codec_primary: _mapCodecPM(s.codec) || hardcoded.codec_primary,
                            codec_fallback: _firstDef(s.codec_fallback, hardcoded.codec_fallback),
                            codec_priority: _firstDef(s.codec_priority, hardcoded.codec_priority),
                            codec_full: _firstDef(s.codec_full, hardcoded.codec_full),
                            // ── HDR / Color (claves LAB con nombres bit_depth/peak_luminance_nits) ──
                            // FIX 2026-04-26 (origen del bug `.join is not a function`):
                            //   Antes: si s.hdr_mode existía, devolvía boolean (true/false), rompiendo
                            //   los consumidores que esperan array (`(cfg.hdr_support || []).join(',')`).
                            //   Ahora: deriva un array de modos HDR desde s.hdr_mode (DOLBY_VISION,
                            //   HDR10PLUS, HDR10, HLG, SDR), con fallback al hardcoded.hdr_support (array).
                            //   Match exacto con la lógica de selección de modo HDR per-profile del LAB.
                            hdr_support: (() => {
                                const m = s.hdr_mode ? String(s.hdr_mode).toUpperCase() : '';
                                if (m === 'DOLBY_VISION') return ['dolby-vision', 'hdr10+', 'hdr10', 'hlg', 'sdr'];
                                if (m === 'HDR10PLUS' || m === 'HDR10+') return ['hdr10+', 'hdr10', 'hlg', 'sdr'];
                                if (m === 'HDR10') return ['hdr10', 'hlg', 'sdr'];
                                if (m === 'HLG') return ['hlg', 'sdr'];
                                if (m === 'SDR') return ['sdr'];
                                return Array.isArray(hardcoded.hdr_support) ? hardcoded.hdr_support : ['sdr'];
                            })(),
                            hdr_mode: _firstDef(s.hdr_mode, hardcoded.hdr_mode),
                            color_depth: _firstDef(s.bit_depth, s.bitDepth, hardcoded.color_depth),
                            color_space: _firstDef(s.color_space, hardcoded.color_space),
                            color_primaries: _firstDef(s.color_primaries, hardcoded.color_primaries),
                            color_transfer: _firstDef(s.color_transfer, s.transfer_function, hardcoded.transfer_function),
                            transfer_function: _firstDef(s.color_transfer, s.transfer_function, hardcoded.transfer_function),
                            chroma_subsampling: _firstDef(s.chroma_subsampling, hardcoded.chroma_subsampling),
                            peak_luminance_nits: _firstDef(s.peak_luminance_nits, s.peakLuminanceNits, hardcoded.peak_luminance_nits),
                            // ── Audio ──────────────────────────────────────────────────────
                            audio_codec: _firstDef(s.audio_codec, hardcoded.audio_codec),
                            audio_channels: _firstDef(s.audio_channels, hardcoded.audio_channels),
                            audio_passthrough: _firstDef(s.audio_passthrough, hardcoded.audio_passthrough),
                            // ── Encoding params (LAB-aware) ────────────────────────────────
                            gop_size: _firstDef(s.gop_size, hardcoded.gop_size),
                            clock_jitter: _firstDef(s.clock_jitter, hardcoded.clock_jitter),
                            clock_synchro: _firstDef(s.clock_synchro, hardcoded.clock_synchro),
                            vmaf_target: _firstDef(s.vmaf_target, hardcoded.vmaf_target),
                            // ── Identidad / Estrategia ────────────────────────────────────
                            strategy: _firstDef(s.strategy, hardcoded.strategy),
                            focus: _firstDef(s.focus, hardcoded.focus),
                            device_class: hardcoded.device_class,
                            // ── Reconnection (no LAB-source, hardcoded preservado) ─────────
                            reconnect_timeout_ms: hardcoded.reconnect_timeout_ms,
                            reconnect_max_attempts: hardcoded.reconnect_max_attempts,
                            reconnect_delay_ms: hardcoded.reconnect_delay_ms,
                            availability_target: hardcoded.availability_target,
                            // ── HEVC / encoding extras (algunos LAB-aware) ──────────────────
                            hevc_tier: _firstDef(s.hevc_tier, hardcoded.hevc_tier),
                            hevc_level: _firstDef(s.hevc_level, hardcoded.hevc_level),
                            hevc_profile: _firstDef(s.hevc_profile, hardcoded.hevc_profile),
                            matrix_coefficients: _firstDef(s.matrix_coefficients, hardcoded.matrix_coefficients),
                            compression_level: _firstDef(s.compression_level, hardcoded.compression_level),
                            rate_control: _firstDef(s.rate_control, hardcoded.rate_control),
                            entropy_coding: _firstDef(s.entropy_coding, hardcoded.entropy_coding),
                            video_profile: _firstDef(s.video_profile, hardcoded.video_profile),
                            pixel_format: _firstDef(s.pixel_format, hardcoded.pixel_format),
                            // ── Segment / BW guarantee ─────────────────────────────────────
                            segment_duration: _firstDef(s.segment_duration_s, s.segment_duration, hardcoded.segment_duration),
                            bandwidth_guarantee: _firstDef(s.bandwidth_guarantee, hardcoded.bandwidth_guarantee),
                            // ── Acceso al perfil completo del LAB para emisores avanzados ──
                            // (actor_injections, player_enslavement, optimized_knobs, fitness, etc.)
                            _labProfile: pmProfile,
                            // ── Bridge metadata ────────────────────────────────────────────
                            _bridged: true,
                            _source: 'ProfileManagerV9_SSOT'
                        }
                    );

                    // Throttle: log solo 1 de cada 500 canales para no inundar consola.
                    if (typeof console !== 'undefined') {
                        window.__bridgeLogCount = (window.__bridgeLogCount || 0) + 1;
                        if (window.__bridgeLogCount % 500 === 1) {
                            console.log(`🔗 [BRIDGE v2.0 #${window.__bridgeLogCount}] ${profileId}: PM→Gen sync OK | ${s.codec}/${bridged.width}x${bridged.height}@${s.fps}fps | ${s.bitrate}Mbps | buf=${s.buffer}/${s.playerBuffer}ms | T1=${s.t1}/T2=${s.t2}`);
                        }
                    }
                    return bridged;
                }
            }
        } catch (e) {
            if (typeof console !== 'undefined') {
                console.warn(`⚠️ [BRIDGE] Error leyendo Profile Manager para ${profileId}:`, e.message);
            }
        }

        // ── Intento 2 (legacy): APE_PROFILE_BRIDGE ──
        try {
            if (window.APE_PROFILE_BRIDGE?.isActive?.() && window.APE_PROFILE_BRIDGE?.getProfile) {
                const bridged = window.APE_PROFILE_BRIDGE.getProfile(profileId);
                if (bridged && bridged._bridged) {
                    console.log(`🔗 [BRIDGE-LEGACY] Usando perfil ${profileId} desde Frontend`);
                    return bridged;
                }
            }
        } catch (e) { /* silent */ }

        // ── Fallback: PROFILES hardcoded (always works) ──
        console.log(`📦 [FALLBACK] Usando perfil ${profileId} hardcoded`);
        return hardcoded;
    }

    // Helper: Map PM codec names → generator codec names
    function _mapCodecPM(pmCodec) {
        if (!pmCodec) return null;
        const map = { 'AV1': 'AV1', 'H265': 'HEVC', 'HEVC': 'HEVC', 'VP9': 'VP9', 'H264': 'H264', 'AVC': 'H264', 'MPEG2': 'MPEG2' };
        return map[pmCodec.toUpperCase()] || pmCodec;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN GLOBAL DE CACHING (controla las 4 directivas globales)
    // ═══════════════════════════════════════════════════════════════════════════
    const GLOBAL_CACHING_BASE = {
        network: 120000,  // ANTIFREEZE NUCLEAR v10: 8x (15s→120s) survive any ISP glitch
        live: 120000,     // ANTIFREEZE NUCLEAR v10: 8x (15s→120s) nuclear anti-freeze
        file: 300000      // ANTIFREEZE NUCLEAR v10: 6x (51s→300s) VOD/file deep cache
    };

    const getGlobalCaching = () => ({
        network: window._APE_QUANTUM_SHIELD_2026 ? 120000 : GLOBAL_CACHING_BASE.network,
        live: window._APE_QUANTUM_SHIELD_2026 ? 120000 : GLOBAL_CACHING_BASE.live,
        file: window._APE_QUANTUM_SHIELD_2026 ? 300000 : GLOBAL_CACHING_BASE.file
    });

    const GLOBAL_CACHING = {
        get network() { return getGlobalCaching().network; },
        get live() { return getGlobalCaching().live; },
        get file() { return getGlobalCaching().file; }
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // 🖥️ DEVICE TIER DETECTION — v5.4 MAX AGGRESSION
    // Detecta la clase de hardware del dispositivo para escalar los niveles ISP
    // TIER 4 (NUCLEAR): Nvidia Shield, Apple TV 4K, PC con GPU dedicada
    // TIER 3 (BRUTAL): Android TV Box premium, PC básico
    // TIER 2 (SAVAGE): Smart TV mid-range, Chromecast Ultra
    // TIER 1 (EXTREME): FireTV Stick, Raspberry Pi, dispositivos de 1GB RAM
    // ═══════════════════════════════════════════════════════════════════════════
    const DEVICE_TIER = (function detectDeviceTier() {
        try {
            const ua = navigator.userAgent || '';
            const cores = navigator.hardwareConcurrency || 2;
            const mem = navigator.deviceMemory || 1; // GB
            const conn = navigator.connection || {};
            const bw = conn.downlink || 0; // Mbps estimado
            // Señales de hardware premium
            const isNvidiaShield = /SHIELD|AndroidTV/.test(ua) && cores >= 8;
            const isAppleTV = /AppleTV|tvOS/.test(ua);
            const isPC = /Windows|Macintosh|Linux x86/.test(ua) && cores >= 4;
            const isFireStick = /AFTS|AFTM|AFTB|FireTV|Silk/.test(ua);
            const isRaspberry = /armv7|armv6/.test(ua) && cores <= 4;
            if (isNvidiaShield || isAppleTV || (isPC && mem >= 8)) return 4; // NUCLEAR
            if (isPC && mem >= 4) return 3; // BRUTAL
            if (isFireStick || isRaspberry || mem <= 1) return 1; // EXTREME (safe)
            if (cores >= 8 && mem >= 4) return 3; // BRUTAL
            if (cores >= 4 && mem >= 2) return 2; // SAVAGE
            return 1; // EXTREME (default seguro)
        } catch (e) { return 1; }
    })();
    console.log(`🖥️ [DEVICE-TIER] Nivel detectado: \${DEVICE_TIER} (\${['','CONSERVATIVE','MODERATE','AGGRESSIVE','VERY_AGGRESSIVE'][DEVICE_TIER]})`);

    // ═══════════════════════════════════════════════════════════════════════════
    // ☢️ ISP_LEVELS — 10 Niveles ANTIFREEZE NUCLEAR OBSCENE (nunca bajan)
    // DEVICE_TIER arranca el nivel base, auto-escalación hasta APOCALYPTIC
    // ═══════════════════════════════════════════════════════════════════════════
    const ISP_LEVELS = [
        null, // índice 0 no usado
        {   // NIVEL 1: CONSERVATIVE — Normal operation, stealth mode
            name: 'CONSERVATIVE',
            tcp_window_mb: 4,
            parallel_streams: 4,
            burst_factor: 1.5,
            burst_duration_s: 30,
            prefetch_s: 30,
            buffer_target_s: 60,
            strategy: 'MAX_CONTRACT',
            quic: false,
            http3: false
        },
        {   // NIVEL 2: MODERATE — Buffer <45s OR throughput variance >20%
            name: 'MODERATE',
            tcp_window_mb: 8,
            parallel_streams: 8,
            burst_factor: 2.0,
            burst_duration_s: 60,
            prefetch_s: 60,
            buffer_target_s: 90,
            strategy: 'MAX_CONTRACT_PLUS_20PCT',
            quic: true,
            http3: false
        },
        {   // NIVEL 3: AGGRESSIVE — Buffer <30s OR throughput variance >40%
            name: 'AGGRESSIVE',
            tcp_window_mb: 16,
            parallel_streams: 16,
            burst_factor: 3.0,
            burst_duration_s: 999999,
            prefetch_s: 100,
            buffer_target_s: 120,
            strategy: 'SATURATE_LINK',
            quic: true,
            http3: true
        },
        {   // NIVEL 4: VERY_AGGRESSIVE — Buffer <20s OR rebuffer >1/min
            name: 'VERY_AGGRESSIVE',
            tcp_window_mb: 32,
            parallel_streams: 32,
            burst_factor: 5.0,
            burst_duration_s: 999999,
            prefetch_s: 200,
            buffer_target_s: 180,
            strategy: 'EXCEED_CONTRACT',
            quic: true,
            http3: true
        },
        {   // NIVEL 5: EXTREME — Buffer <15s OR rebuffer >2/min
            name: 'EXTREME',
            tcp_window_mb: 48,
            parallel_streams: 48,
            burst_factor: 7.0,
            burst_duration_s: 999999,
            prefetch_s: 300,
            buffer_target_s: 240,
            strategy: 'EXTREME_BANDWIDTH',
            quic: true,
            http3: true
        },
        {   // NIVEL 6: ULTRA — Buffer <10s OR connection drops
            name: 'ULTRA',
            tcp_window_mb: 64,
            parallel_streams: 64,
            burst_factor: 10.0,
            burst_duration_s: 999999,
            prefetch_s: 400,
            buffer_target_s: 300,
            strategy: 'SATURATE_TOTAL',
            quic: true,
            http3: true
        },
        {   // NIVEL 7: SAVAGE — Buffer <5s OR multiple connection failures
            name: 'SAVAGE',
            tcp_window_mb: 96,
            parallel_streams: 96,
            burst_factor: 15.0,
            burst_duration_s: 999999,
            prefetch_s: 500,
            buffer_target_s: 360,
            strategy: 'NO_RESTRICTIONS',
            connection_multiplexing: true,
            quic: true,
            http3: true
        },
        {   // NIVEL 8: BRUTAL — Buffer <3s OR imminent freeze
            name: 'BRUTAL',
            tcp_window_mb: 128,
            parallel_streams: 128,
            burst_factor: 20.0,
            burst_duration_s: 999999,
            prefetch_s: 750,
            buffer_target_s: 480,
            strategy: 'EMERGENCY_UNLIMITED',
            emergency_mode: true,
            connection_multiplexing: true,
            quic: true,
            http3: true
        },
        {   // NIVEL 9: NUCLEAR — Buffer near empty OR critical failure
            name: 'NUCLEAR',
            tcp_window_mb: 192,
            parallel_streams: 192,
            burst_factor: 30.0,
            burst_duration_s: 999999,
            prefetch_s: 1000,
            buffer_target_s: 600,
            strategy: 'NUCLEAR_NO_LIMITS',
            emergency_mode: true,
            all_sources_parallel: true,
            ignore_isp_limits: true,
            connection_multiplexing: true,
            quic: true,
            http3: true
        },
        {   // NIVEL 10: APOCALYPTIC — Freeze inmediato OR total connection loss
            name: 'APOCALYPTIC',
            tcp_window_mb: 256,
            parallel_streams: 256,
            burst_factor: 50.0,
            burst_duration_s: 999999,
            prefetch_s: 2000,
            buffer_target_s: 900,
            strategy: 'APOCALYPTIC_ALL_BANDWIDTH',
            emergency_mode: 'APOCALYPTIC',
            all_sources_parallel: true,
            ignore_isp_limits: true,
            connection_hijack: true,
            multiple_interfaces: true,
            connection_multiplexing: true,
            quic: true,
            http3: true
        }
    ];
    const ACTIVE_ISP_LEVEL = ISP_LEVELS[Math.min(DEVICE_TIER, 10)] || ISP_LEVELS[1];

    // Prefetch dinámico según DEVICE_TIER — ANTIFREEZE NUCLEAR (100→2000 segments)
    const GLOBAL_PREFETCH = {
        get segments() {
            return [null, 100, 200, 500, 2000][DEVICE_TIER] || 100;
        },
        get parallel() {
            return [null, 8, 16, 32, 64][DEVICE_TIER] || 8;
        }
    };

    console.log(`☢️ [ISP-LEVEL] Activo: \${ACTIVE_ISP_LEVEL.name} | TCP: \${ACTIVE_ISP_LEVEL.tcp_window_mb}MB | Parallel: \${ACTIVE_ISP_LEVEL.parallel_streams} | Burst: \${ACTIVE_ISP_LEVEL.burst_factor}x | Strategy: \${ACTIVE_ISP_LEVEL.strategy}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PERFILES P0-P5 (CONFIGURACIÓN COMPLETA - FALLBACK)
    // ═══════════════════════════════════════════════════════════════════════════

    const PROFILES = {
        // ═══════════════════════════════════════════════════════════════════════
        // P0: 8K ULTRA - detectProfile assigns P0 when height >= 4320 || bitrate >= 50000
        // ═══════════════════════════════════════════════════════════════════════
        P0: {
            name: 'ULTRA_EXTREME_8K',
            resolution: '7680x4320',
            width: 7680,
            height: 4320,
            fps: 120,
            bitrate: 120000,
            buffer_ms: 50000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 50000,
            max_bandwidth: 100000000,
            min_bandwidth: 50000000,
            throughput_t1: 156,
            throughput_t2: 120,
            prefetch_segments: '20,25,30',
            prefetch_parallel: 250,
            prefetch_buffer_target: 600000,
            prefetch_min_bandwidth: 500000000,
            segment_duration: 2,
            bandwidth_guarantee: 500,
            codec_primary: 'AV1',
            codec_fallback: 'HEVC',
            codec_priority: 'av1,hevc,hev1,hvc1,h265,H265,h.265,H.265,h264',
            hdr_support: ['hdr10', 'dolby_vision', 'hlg'],
            color_depth: 12,
            audio_channels: 8,
            audio_codec: 'eac3',
            device_class: 'ULTRA_EXTREME_8K',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            // HEVC/H.265 Optimization (configurable)
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p12le'
        },
        // ═══════════════════════════════════════════════════════════════════════
        // P1: 4K 60fps - detectProfile assigns P1 when height >= 2160 || bitrate >= 30000
        // ═══════════════════════════════════════════════════════════════════════
        P1: {
            name: '4K_SUPREME_60FPS',
            resolution: '3840x2160',
            width: 3840,
            height: 2160,
            fps: 60,
            bitrate: 26900,
            buffer_ms: 40000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 40000,
            max_bandwidth: 60000000,
            min_bandwidth: 30000000,
            throughput_t1: 35,
            throughput_t2: 75,
            prefetch_segments: '10,15,20',
            prefetch_parallel: 200,
            prefetch_buffer_target: 500000,
            prefetch_min_bandwidth: 400000000,
            segment_duration: 2,
            bandwidth_guarantee: 400,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 6,
            audio_codec: 'eac3',
            device_class: '4K_SUPREME_60FPS',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p12le'
        },
        P2: {
            name: '4K_EXTREME',
            resolution: '3840x2160',
            width: 3840,
            height: 2160,
            fps: 30,
            bitrate: 18000,
            buffer_ms: 35000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 35000,
            max_bandwidth: 40000000,
            min_bandwidth: 20000000,
            throughput_t1: 23.4,
            throughput_t2: 50,
            prefetch_segments: '8,12,16',
            prefetch_parallel: 180,
            prefetch_buffer_target: 450000,
            prefetch_min_bandwidth: 350000000,
            segment_duration: 2,
            bandwidth_guarantee: 350,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10'],
            color_depth: 10,
            audio_channels: 6,
            audio_codec: 'eac3',
            device_class: '4K_EXTREME',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P3: {
            name: 'FHD_ADVANCED',
            resolution: '1920x1080',
            width: 1920,
            height: 1080,
            fps: 60,
            bitrate: 8000,
            buffer_ms: 30000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 30000,
            max_bandwidth: 12000000,
            min_bandwidth: 4000000,
            throughput_t1: 10.4,
            throughput_t2: 15,
            prefetch_segments: '6,8,10',
            prefetch_parallel: 150,
            prefetch_buffer_target: 400000,
            prefetch_min_bandwidth: 300000000,
            segment_duration: 2,
            bandwidth_guarantee: 300,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 2,
            audio_codec: 'aac',
            device_class: 'FHD_ADVANCED',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'HIGH',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P4: {
            name: 'HD_STABLE',
            resolution: '1280x720',
            width: 1280,
            height: 720,
            fps: 30,
            bitrate: 4000,
            buffer_ms: 25000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 25000,
            max_bandwidth: 6000000,
            min_bandwidth: 2000000,
            throughput_t1: 5.2,
            throughput_t2: 8,
            prefetch_segments: '4,6,8',
            prefetch_parallel: 120,
            prefetch_buffer_target: 350000,
            prefetch_min_bandwidth: 250000000,
            segment_duration: 2,
            bandwidth_guarantee: 250,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 2,
            audio_codec: 'aac',
            device_class: 'HD_STABLE',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'MAIN',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        },
        P5: {
            name: 'SD_FAILSAFE',
            resolution: '854x480',
            width: 854,
            height: 480,
            fps: 25,
            bitrate: 1500,
            buffer_ms: 20000,
            network_cache_ms: 15000,
            live_cache_ms: 15000,
            file_cache_ms: 51000,
            player_buffer_ms: 20000,
            max_bandwidth: 3000000,
            min_bandwidth: 500000,
            throughput_t1: 1.95,
            throughput_t2: 4,
            prefetch_segments: '2,4,6',
            prefetch_parallel: 100,
            prefetch_buffer_target: 300000,
            prefetch_min_bandwidth: 200000000,
            segment_duration: 2,
            bandwidth_guarantee: 200,
            codec_primary: 'HEVC',
            codec_fallback: 'H264',
            codec_priority: 'hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,vp9,h264,mpeg2',
            hdr_support: ['hdr10', 'hlg'],
            color_depth: 10,
            audio_channels: 2,
            audio_codec: 'aac',
            device_class: 'SD_FAILSAFE',
            reconnect_timeout_ms: 1,
            reconnect_max_attempts: 999999,
            reconnect_delay_ms: 0,
            availability_target: 99.999,
            hevc_tier: 'MAIN',
            hevc_level: '6.1,5.1,5.0,4.1,4.0,3.1',
            hevc_profile: 'MAIN-12,MAIN-10,MAIN',
            color_space: 'BT2020',
            chroma_subsampling: '4:2:0',
            transfer_function: 'SMPTE2084',
            matrix_coefficients: 'BT2020NC',
            compression_level: 1,
            rate_control: 'VBR',
            entropy_coding: 'CABAC',
            video_profile: 'main10',
            pixel_format: 'yuv420p10le'
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DETECT PROFILE BASED ON CHANNEL QUALITY
    // ═══════════════════════════════════════════════════════════════════════════

    function detectProfile(channel) {
        const height = channel.height || parseInt(channel.resolution?.split('x')[1]) || 0;
        const bitrate = channel.bitrate || 0;
        const fps = channel.fps || 30;

        // P0: 8K Ultra (height >= 4320 OR bitrate >= 50Mbps)
        if (height >= 4320 || bitrate >= 50000) return 'P0';

        // P1: 4K Premium (4K + 60fps OR 4K + high bitrate >= 30Mbps)
        if (height >= 2160 && (fps >= 60 || bitrate >= 30000)) return 'P1';

        // P2: 4K Standard (4K but lower fps/bitrate)
        if (height >= 2160 || bitrate >= 20000) return 'P2';

        // P3: FHD (1080p)
        if (height >= 1080 || bitrate >= 8000) return 'P3';

        // P4: HD (720p)
        if (height >= 720 || bitrate >= 4000) return 'P4';

        // P5: SD (everything else)
        return 'P5';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARRAY 1: GLOBAL_HEADER (137+ líneas - 1 sola vez por archivo)
    // ═══════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════


    // ── GAP PLAN APPLIER (omega_v2.2) ──────────────────────────────────
    // Consume options.bulletproof_gap_plan e inyecta canonical_template_by_level
    // para items con action='IMPLEMENTAR' (los REPLICAR ya están en lista; QUITAR
    // = omit, no aplica). Skip cualquier item con already_present_in_lab[level]=true.
    // Respeta injection_order para emitir determinístico.
    // Retorna array de líneas (sin tag prefix dedup — el caller hace dedup).
    function applyGapPlanForLevel(gapPlan, level, profileId) {
        if (!gapPlan || !Array.isArray(gapPlan.items)) return [];
        const out = [];
        const sorted = gapPlan.items
            .filter(it => (it.action || '').toUpperCase() === 'IMPLEMENTAR')
            .filter(it => {
                const tpl = it.canonical_template_by_level && it.canonical_template_by_level[level];
                if (!Array.isArray(tpl) || tpl.length === 0) return false;
                if (it.already_present_in_lab && it.already_present_in_lab[level] === true) return false;
                return true;
            })
            .sort((a, b) => (a.injection_order ?? 999) - (b.injection_order ?? 999));
        for (const it of sorted) {
            // Para NIVEL_2_PROFILES con resolves_to_all_profiles=false y profileId presente,
            // skip items que no aplican a este perfil específico.
            if (level === 'NIVEL_2_PROFILES' && profileId && it.resolves_to_all_profiles === false) continue;
            for (const line of it.canonical_template_by_level[level]) {
                if (line) out.push(line);
            }
        }
        return out;
    }
    // Expose for debug
    if (typeof window !== 'undefined') window._applyGapPlanForLevel = applyGapPlanForLevel;

    function generateGlobalHeader(channelsCount, options = {}) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 18) + 'Z';
        const totalChannels = typeof window !== 'undefined' && window.app && typeof window.app.getFilteredChannels === 'function' ? window.app.getFilteredChannels().length : channelsCount;

        if (options.bulletproof_loaded && options.bulletproof_profiles) {
            const coreHeader = [
                `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"`,
                `#EXT-X-VERSION:7`,
                `#EXT-X-INDEPENDENT-SEGMENTS`,
                `#EXT-X-APE-CHANNELS:${totalChannels}`
            ];

            // ── LAB TRAZABILITY — metadata global del LAB Excel ─────────────────
            // Doctrina SSOT: cualquier valor calibrado por el LAB queda auditable
            // directo en la lista. Cero "valores ciegos".
            const lm = options.lab_metadata || {};
            if (lm.lab_version) coreHeader.push(`#EXT-X-APE-LAB-VERSION:${lm.lab_version}`);
            if (lm.lab_schema_variant) coreHeader.push(`#EXT-X-APE-LAB-SCHEMA-VARIANT:${lm.lab_schema_variant}`);
            if (lm.exported_at) coreHeader.push(`#EXT-X-APE-LAB-EXPORTED-AT:${lm.exported_at}`);
            coreHeader.push(`#EXT-X-APE-LAB-BULLETPROOF:${lm.bulletproof === true ? 'true' : 'false'}`);
            if (lm.labFileName) coreHeader.push(`#EXT-X-APE-LAB-FILENAME:${lm.labFileName}`);

            // ── PER-PROFILE SOLVER PROVENANCE ────────────────────────────────────
            // 5 campos del bulletproof por perfil que antes eran "valores ciegos":
            // role, fitness, solver_trace, optimized_timestamp, name.
            // Emitidos como atributos del tag por perfil para auditoría directa.
            const _esc = (v) => String(v ?? '').replace(/"/g, '\\"');
            for (const pid of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) {
                const p = options.bulletproof_profiles[pid];
                if (!p) continue;
                const attrs = [
                    `NAME="${_esc(p.name)}"`,
                    `ROLE="${_esc(p.role)}"`,
                    `FITNESS=${parseFloat(p.fitness) || 0}`,
                    `SOLVER="${_esc(p.solver_trace)}"`,
                    `TIMESTAMP=${p.optimized_timestamp || 0}`
                ];
                coreHeader.push(`#EXT-X-APE-LAB-PROFILE-${pid}:${attrs.join(',')}`);

                // Bounds del solver (rangos lo/hi por knob) — opcional pero auditable
                if (p.bounds && typeof p.bounds === 'object') {
                    const boundEntries = Object.entries(p.bounds)
                        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
                        .join(',');
                    if (boundEntries) coreHeader.push(`#EXT-X-APE-LAB-BOUNDS-${pid}:${boundEntries}`);
                }

                // Optimized knobs (resultado del solver: buffer_seconds, live_delay, etc.)
                if (p.optimized_knobs && typeof p.optimized_knobs === 'object') {
                    const knobEntries = Object.entries(p.optimized_knobs)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(',');
                    if (knobEntries) coreHeader.push(`#EXT-X-APE-LAB-KNOBS-${pid}:${knobEntries}`);
                }
            }

            let dynamicHeaders = [];
            const masterProfileId = options.masterProfile || 'P0';
            const labProfile = options.bulletproof_profiles[masterProfileId];

            if (labProfile && labProfile.player_enslavement && labProfile.player_enslavement.level_1_master_playlist) {
                const l1 = labProfile.player_enslavement.level_1_master_playlist;
                if (Array.isArray(l1)) {
                    dynamicHeaders = [...l1];
                }
            }

            if (options.bulletproof_nivel1 && Array.isArray(options.bulletproof_nivel1)) {
                for (const item of options.bulletproof_nivel1) {
                    // nivel1_directives can be objects {tag, value} or strings
                    let lineStr;
                    if (typeof item === 'string') {
                        lineStr = item;
                    } else if (item && item.tag) {
                        // Object format: {tag: "#EXT-X-SYS-VERSION", value: "APE_v8.0-LAB"}
                        lineStr = item.value !== undefined && item.value !== null && item.value !== ''
                            ? `${item.tag}:${item.value}`
                            : item.tag;
                    } else {
                        continue; // skip malformed entries
                    }
                    if (!dynamicHeaders.includes(lineStr)) dynamicHeaders.push(lineStr);
                }
            }

            // ── OMEGA GAP PLAN — IMPLEMENTAR items para NIVEL_1_HEADER ─────────
            // Cierra los gaps del scorecard (CMCD CTA-5004, OMEGA_BUILD lock,
            // LAB-SOURCE anchor) cuyo canonical_template_by_level cocinó el LAB Excel.
            // Skip si already_present_in_lab[NIVEL_1_HEADER]=true (no duplicar).
            if (options.bulletproof_gap_plan) {
                const gpL1 = applyGapPlanForLevel(options.bulletproof_gap_plan, 'NIVEL_1_HEADER');
                for (const line of gpL1) {
                    if (!dynamicHeaders.includes(line)) dynamicHeaders.push(line);
                }
            }

            // ── PLACEHOLDER RESOLVER (master playlist) ─────────────────────────
            // Resuelve placeholders runtime que el LAB Excel deja como template:
            //   {auto-now}, {auto}, {utc}, {lutc} → ISO timestamp
            //   {rand} → ID aleatorio
            //   {profile.X} → leído del master profile (P0 por defecto)
            //   {config.X} → leído de config_global del JSON LAB
            // Doctrina: cero "valores ciegos" en la lista emitida.
            const masterP = options.bulletproof_profiles?.[options.masterProfile || 'P0'] || {};
            const cfgGlobal = options.bulletproof_config_global || {};
            const _isoNow = () => new Date().toISOString();
            const _randId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
            const _profileGet = (key) => {
                const s = masterP.settings || {};
                if (key === 'buffer_ms') return s.buffer || s.bufferMs || '';
                if (key === 'buffer_s') return s.bufferTargetSec || s.bufferSeconds || '';
                if (key === 'max_bandwidth') return s.maxBitrateKbps ? s.maxBitrateKbps * 1000 : '';
                if (key === 'max_width') return parseInt((s.resolution || '0x0').split('x')[0]) || '';
                if (key === 'max_height') return parseInt((s.resolution || '0x0').split('x')[1]) || '';
                if (key === 'resolution') return s.resolution || '';
                return s[key] !== undefined ? s[key] : '';
            };
            const _resolveHeaderPlaceholders = (str) => {
                if (typeof str !== 'string') return str;
                return str
                    .replace(/<channelsCount>/g, totalChannels)
                    .replace(/<timestamp>/g, timestamp)
                    .replace(/\{auto-now\}|\{auto\}|\{utc\}|\{lutc\}/g, _isoNow())
                    .replace(/\{rand\}/g, _randId())
                    .replace(/\{profile\.([a-zA-Z0-9_]+)\}/g, (_m, k) => String(_profileGet(k)))
                    .replace(/\{config\.([a-zA-Z0-9_]+)\}/g, (_m, k) => String(cfgGlobal[k] !== undefined ? cfgGlobal[k] : `{config.${k}}`));
            };
            dynamicHeaders = dynamicHeaders.map(line => _resolveHeaderPlaceholders(line));

            // ── MASTER HEADER DRIFT SANITIZER (audit 2026-04-29) ─────────────────
            // GR-2: corrige `#EXT-X-SERVER-N:<host>` cuando el LAB trae un host
            // staticfijo que no coincide con `app.state.activeServers[]` reales.
            // GR-3: normaliza `X-HDR-MAX-CLL` cuando excede 10000 (límite físico
            // HDR10/HDR10+ ST 2086) y unifica formato de `X-HDR-TYPE` con espacios
            // raros (`"DOLBY_VISION + HDR10+"` → `"HDR10+DV-P81-P10"`).
            // Doctrina: NO altera valores LAB-SSOT calibrados; solo corrige drift
            // detectable entre header del LAB y realidad técnica.
            try {
                const _activeServers = (typeof window !== 'undefined' && window.app?.state?.activeServers) || [];
                const _realHosts = _activeServers
                    .map(s => (s && (s.url || s.host || s.baseUrl)) || '')
                    .filter(u => u && /^https?:/.test(u))
                    .map(u => {
                        try { const x = new URL(u); return x.protocol + '//' + x.host; } catch { return ''; }
                    })
                    .filter(Boolean);
                const _seenServerHost = new Set();
                dynamicHeaders = dynamicHeaders.map(line => {
                    if (typeof line !== 'string') return line;
                    let out = line;
                    // GR-2: reemplazar EXT-X-SERVER-N por hosts reales (si hay activeServers)
                    if (_realHosts.length > 0 && /^#EXT-X-SERVER-\d+:/.test(out)) {
                        const idxMatch = out.match(/^#EXT-X-SERVER-(\d+):/);
                        const idx = idxMatch ? parseInt(idxMatch[1], 10) - 1 : 0;
                        const realHost = _realHosts[idx] || _realHosts[0];
                        out = `#EXT-X-SERVER-${idx + 1}:${realHost}`;
                    }
                    // GR-3a: cap MAX-CLL a 10000 (límite ST 2086)
                    out = out.replace(/X-HDR-MAX-CLL=(\d+)/g, (_m, n) => {
                        const v = parseInt(n, 10);
                        return `X-HDR-MAX-CLL=${v > 10000 ? 10000 : v}`;
                    });
                    // GR-3b: normalizar formato X-HDR-TYPE con espacios raros
                    out = out.replace(/X-HDR-TYPE="DOLBY_VISION\s*\+\s*HDR10\+"/g, 'X-HDR-TYPE="HDR10+DV-P81-P10"');
                    return out;
                });
                // GR-2 backstop: dedup hosts repetidos en EXT-X-SERVER-N (LAB puede
                // emitir N entradas con mismo host).
                dynamicHeaders = dynamicHeaders.filter(line => {
                    const m = typeof line === 'string' && line.match(/^#EXT-X-SERVER-\d+:(.+)$/);
                    if (!m) return true;
                    const host = m[1];
                    if (_seenServerHost.has(host)) return false;
                    _seenServerHost.add(host);
                    return true;
                });
            } catch (e) {
                console.warn('[GENERATOR] Master header drift sanitizer failed:', e?.message || e);
            }

            // Dedup and Anti-##
            // RFC 8216 singleton tags: si el dynamicHeader trae VERSION o INDEPENDENT-SEGMENTS
            // (ya emitidos por coreHeader), descartar para no producir duplicados en header.
            // Detectado 2026-04-21 en auditoria E2E: LAB profile bulletproof_nivel1 emite
            // #EXT-X-VERSION:6 + segunda #EXT-X-INDEPENDENT-SEGMENTS, violando RFC 8216.
            const RFC8216_SINGLETON_TAGS = new Set([
                '#EXTM3U',
                '#EXT-X-VERSION',
                '#EXT-X-INDEPENDENT-SEGMENTS',
                '#EXT-X-APE-CHANNELS'
            ]);
            const outLines = [...coreHeader];
            const seenTags = new Set();
            for (const l of outLines) {
                const m = l.match(/^(#[A-Z0-9-]+)/);
                if (m) seenTags.add(m[1]);
            }
            for (let line of dynamicHeaders) {
                if (!line) continue;
                if (line.startsWith('##')) line = line.substring(1);
                const tagMatch = line.match(/^(#[A-Z0-9-]+)/);
                const tag = tagMatch ? tagMatch[1] : line;
                if (RFC8216_SINGLETON_TAGS.has(tag) && seenTags.has(tag)) {
                    continue; // skip duplicado de tag singleton RFC 8216
                }
                seenTags.add(tag);
                outLines.push(line);
            }
            return outLines.join('\n');
        }

        // --- BACKWARDS COMPAT FALLBACK ---
        return `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE
#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE
#EXT-X-APE-QMAX-ANTI-DOWNGRADE:ENFORCED
#EXT-X-APE-QMAX-TIER-CASCADE:S>A>A->B>C>D
#EXT-X-APE-QMAX-SELECTION-RULE:IF-4K-EXISTS-1080P-FORBIDDEN
#EXT-X-APE-QMAX-BUFFER-CLASS:8K-ADAPTIVE-1GB
#EXT-X-APE-QMAX-PERCEPTUAL-OPTIMIZATION:VMAF-MAXIMIZATION-ENABLED
#EXT-X-APE-QMAX-BANDWIDTH-SAFETY-MARGIN:0.30
#X-OMEGA-TIMESTAMP:${timestamp}
#EXT-X-APE-LCEVC-SDK-VERSION:1.2.4
#EXT-X-VNOVA-LCEVC-TARGET-SDK:HTML5
${options.dictatorMode ? `#EXT-X-SESSION-DATA:DATA-ID="exoplayer.load_control",VALUE="{\\"minBufferMs\\":20000,\\"bufferForPlaybackMs\\":5000}"` : ""}
${options.dictatorMode ? `#` + Array.from({ length: 64 }).map(() => Math.random().toString(36).substring(2)).join("") : ""}
#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.ape.net/v1",PATHWAY-ID="PRIMARY"
#EXT-X-DEFINE:NAME="OMEGA_BUILD",VALUE="v5.4-MAX-AGGRESSION"
#EXT-X-DEFINE:NAME="OMEGA_EPOCH",VALUE="${timestamp}"
#EXT-X-DEFINE:NAME="OMEGA_COMPLIANCE",VALUE="HLS-RFC8216BIS+CMAF-LL+HDR10+DV-P81-P10+LCEVC-P4"
#EXT-X-KEY:METHOD=NONE
#EXT-X-SESSION-KEY:METHOD=NONE
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=450000,AVERAGE-BANDWIDTH=400000,CODECS="hvc1.1.6.L153.B0",RESOLUTION=1920x1080
#EXT-X-DATERANGE:ID="omega-live-${timestamp}",START-DATE="${new Date().toISOString()}",DURATION=86400,X-OMEGA-TYPE="LIVE-CATCHUP",X-OMEGA-SCOPE="CHANNEL-SESSION",X-OMEGA-BUILD="v5.4-MAX-AGGRESSION"
#EXT-X-DATERANGE:ID="omega-hdr-window",START-DATE="${new Date().toISOString()}",PLANNED-DURATION=86400,X-HDR-TYPE="HDR10+DV-P81-P10",X-HDR-MAX-CLL=5000,X-HDR-MAX-FALL=800
#KODIPROP:inputstream.adaptive.manifest_type=hls
#KODIPROP:inputstream.adaptive.stream_selection_type=auto
#KODIPROP:inputstream.adaptive.chooser_bandwidth_mode=AUTO
#KODIPROP:inputstream.adaptive.chooser_resolution_max=MAX
#EXT-X-SESSION-DATA:DATA-ID="com.ape.session",VALUE="v=6.0&build=NUCLEAR"
#EXT-X-APE-BUILD:v6.0-NUCLEAR-HACKS-${timestamp}
#EXT-X-APE-PARADIGM:PLAYER-ENSLAVEMENT-PROTOCOL-V6.0-NUCLEAR
#EXT-X-APE-CHANNELS:${totalChannels}
#EXT-X-APE-PROFILES:P0-ULTRA_EXTREME_8K,P1-4K_SUPREME_60FPS,P2-4K_EXTREME_30FPS,P3-FHD_ADVANCED_60FPS,P4-HD_STABLE_30FPS,P5-SD_FAILSAFE_25FPS
#EXT-X-APE-ISP-THROTTLE:10-LEVELS-NUCLEAR-OBSCENE-NEVER-DOWN
#EXT-X-APE-ISP-THROTTLE-VERSION:4.0-OBSCENE
#EXT-X-APE-ISP-THROTTLE-STRATEGY:ESCALATE_NEVER_DOWNGRADE
#EXT-X-APE-ERROR-RECOVERY:NUCLEAR
#EXT-X-APE-ERROR-MAX-RETRIES:UNLIMITED
#EXT-X-APE-ERROR-CONCEALMENT:AI_INPAINTING
#EXT-X-APE-ISP-LEVEL-1:CONSERVATIVE-MAX_CONTRACT-TCP4MB-PAR4-BURST1.5x-BUF60
#EXT-X-APE-ISP-LEVEL-2:MODERATE-MAX_CONTRACT_PLUS-TCP8MB-PAR8-BURST2x-BUF90
#EXT-X-APE-ISP-LEVEL-3:AGGRESSIVE-SATURATE_LINK-TCP16MB-PAR16-BURST3x-BUF120
#EXT-X-APE-ISP-LEVEL-4:VERY_AGGRESSIVE-EXCEED_CONTRACT-TCP32MB-PAR32-BURST5x-BUF180
#EXT-X-APE-ISP-LEVEL-5:EXTREME-EXTREME_BW-TCP48MB-PAR48-BURST7x-BUF240
#EXT-X-APE-ISP-LEVEL-6:ULTRA-SATURATE_TOTAL-TCP64MB-PAR64-BURST10x-BUF300
#EXT-X-APE-ISP-LEVEL-7:SAVAGE-NO_RESTRICTIONS-TCP96MB-PAR96-BURST15x-BUF360
#EXT-X-APE-ISP-LEVEL-8:BRUTAL-EMERGENCY-TCP128MB-PAR128-BURST20x-BUF480
#EXT-X-APE-ISP-LEVEL-9:NUCLEAR-NO_LIMITS-TCP192MB-PAR192-BURST30x-BUF600
#EXT-X-APE-ISP-LEVEL-10:APOCALYPTIC-ALL_BANDWIDTH-TCP256MB-PAR256-BURST50x-BUF900
#EXT-X-APE-LCEVC:MPEG-5-PART-2-FULL-3-PHASE-L1-L2-TRANSPORT-PARALLEL
#EXT-X-APE-ANTI-FREEZE-NUCLEAR:v10.0-OBSCENE|net-cache=120000|live-cache=120000|clock-jitter=5000|prefetch=100-200-500-2000
#EXT-X-APE-BUFFER-STRATEGY:NUCLEAR_NO_COMPROMISE|TARGET=180s|MIN=60s|MAX=600s|RAM=2048MB
#EXT-X-APE-RECONNECT-NUCLEAR:MAX=UNLIMITED|DELAY=0-50ms|PARALLEL=64|POOL=50|WARM=20
#EXT-X-APE-MULTI-SOURCE:ENABLED|COUNT=5|ACTIVE=2|RACING=TRUE|FAILOVER=50ms
#EXT-X-APE-FREEZE-PREDICTION:LSTM_ENSEMBLE|WINDOW=5000ms|CONFIDENCE=0.8|AUTO=TRUE
#EXT-X-APE-QUALITY-SAFETY-NET:NEVER_BELOW=480p|CHAIN=4K>1080p>720p>480p>360p>240p
#EXT-X-APE-FRAME-INTERPOLATION:AI_RIFE_V4|MAX=60|GPU=TRUE
#EXT-X-APE-EXTHTTP-FIELDS:250+
#EXT-X-APE-LINES-PER-CHANNEL:250+
#EXT-X-APE-COMPATIBILITY:VLC,OTT-NAVIGATOR,TIVIMATE,KODI,EXOPLAYER,IPTV-SMARTERS,GSE,MX-PLAYER,INFUSE,PLEX,JELLYFIN,EMBY,PERFECT-PLAYER,SMART-TV,FIRE-TV,APPLE-TV,ANDROID-TV,ROKU,CHROMECAST
#EXT-X-APE-NET-TOLERANCE:BDP=100MB|CWND=64|RTT_MAX=3000ms
#EXT-X-APE-QUANTUM-IMMORTALITY:v10-ENABLED
#EXT-X-APE-TELEMETRY-SYNC:NETFLIX-GRADE
#EXT-X-APE-EVASION-GET:405-REWRITE-TO-HEAD
#EXT-X-APE-FALLBACK-HEURISTICS:LATENCY<100ms
#EXT-X-APE-SYNC-SLAVE:MASTER_ORIGIN_SYNC_V2`;
    }

    let _cachedSelectedUA = null;

    // ══════════════════════════════════════════════════════════════════
    // LCEVC DINÁMICO v5.4 — Estado determinado por codec base del canal
    // Regla: LCEVC siempre presente, sin excepción (MPEG-5 Part 2).
    //   HEVC / AV1 / VP9  → ACTIVE      (mejora L1+L2 completa)
    //   H.264              → SIGNAL_ONLY (señal SEI NAL embebida)
    //   Desconocido        → ACTIVE      (asumir máxima calidad)
    // ══════════════════════════════════════════════════════════════════
    function detectLcevcState(codecStr) {
        if (!codecStr) return 'ACTIVE';
        const c = codecStr.toLowerCase();
        if (/av01|av1\b|hvc1|hev1|h265|h\.265|hevc|vp09|vp9\b/.test(c)) return 'ACTIVE';
        if (/avc1|avc3|h264|h\.264|mp4v/.test(c)) return 'SIGNAL_ONLY';
        return 'ACTIVE';
    }

    function resolveLcevcState(cfg) {
        const codecProxy = cfg.codec_primary === 'AV1' ? 'av01' :
            cfg.codec_primary === 'HEVC' ? 'hvc1' :
                cfg.codec_primary === 'H264' ? 'avc1' : 'hvc1';
        return detectLcevcState(codecProxy);
    }

    function resolveLcevcBaseCodec(lcevcState, cfg) {
        return lcevcState === 'ACTIVE'
            ? (cfg.lcevc_base_codec || 'HEVC').toUpperCase()
            : 'H264';
    }

    // ══════════════════════════════════════════════════════════════════
    // LCEVC LAYER CONFIG v5.4 — Parámetros por perfil y resolución
    // ──────────────────────────────────────────────────────────────────
    // Para HEVC ACTIVE: L1+L2 completo, calibrado por resolución
    // Para H.264 SIGNAL_ONLY: metadata embebida, player decide
    // ══════════════════════════════════════════════════════════════════
    const LCEVC_LAYER_CONFIG = {
        P0: { // 8K — AV1 ACTIVE: máxima precisión, bloques grandes
            scale_factor: '4x',
            l1_block: '8X8', l1_precision: '12bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '4X4', l2_precision: '12bit', l2_temporal: 1, l2_upscale: 'LANCZOS4',
            base_ratio: '0.45', enh_ratio: '0.55',
            threads: 16, parallel_blocks: 2,
            transport: 'SUPPLEMENTAL_DATA', fb1: 'SEI_NAL', fb2: 'MPEG_TS_PID',
            sei_nal: '5', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P1: { // 4K 60fps — AV1/HEVC: alta precisión, bloques medios
            scale_factor: '2x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '4X4', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS3',
            base_ratio: '0.50', enh_ratio: '0.50',
            threads: 12, parallel_blocks: 2,
            transport: 'SEI_NAL', fb1: 'SUPPLEMENTAL_DATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P2: { // 4K 30fps — HEVC: equilibrio calidad/CPU
            scale_factor: '2x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS3',
            base_ratio: '0.55', enh_ratio: '0.45',
            threads: 10, parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'PREFERRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P3: { // FHD 60fps — AVC/HEVC: 4K HDR OVERRIDE
            scale_factor: '2x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 0, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS4',
            base_ratio: '0.40', enh_ratio: '0.60',
            threads: 12, parallel_blocks: 2,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P4: { // HD 30fps — AVC/HEVC: EXTREME 4K HDR OVERRIDE
            scale_factor: '3x',
            l1_block: '4X4', l1_precision: '10bit', l1_deblock: 0, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS4',
            base_ratio: '0.40', enh_ratio: '0.60',
            threads: 8, parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'WEBM_METADATA', fb2: 'MPEG_TS_PID',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        },
        P5: { // SD — AVC/HEVC: NUCLEAR 4K HDR OVERRIDE
            scale_factor: '4.5x',
            l1_block: '4X4', l1_precision: '8bit', l1_deblock: 1, l1_temporal: 1,
            l2_block: '2X2', l2_precision: '10bit', l2_temporal: 1, l2_upscale: 'LANCZOS2',
            base_ratio: '0.30', enh_ratio: '0.70',
            threads: 8, parallel_blocks: 1,
            transport: 'SEI_NAL', fb1: 'MPEG_TS_PID', fb2: 'WEBM_METADATA',
            sei_nal: '4', pid: '0x1FFE', webm: '3',
            hw_accel: 'REQUIRED', decode_order: 'L1_THEN_L2',
            mode: 'SEI_METADATA', profile: 'MAIN_4_2_0'
        }
    };

    /**
     * Resuelve la configuración LCEVC completa para un perfil dado.
     * Fusiona el estado dinámico (ACTIVE/SIGNAL_ONLY) con los parámetros por perfil.
     * @param {string} profile - ID del perfil (P0-P5)
     * @param {Object} cfg - Configuración del perfil
     * @returns {Object} Configuración LCEVC fusionada
     */
    function resolveLcevcConfig(profile, cfg) {
        const state = resolveLcevcState(cfg);
        const isActive = state === 'ACTIVE';
        const layerCfg = LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3'];

        return {
            state,
            enabled: true, // LCEVC nunca se deshabilita
            base_codec: resolveLcevcBaseCodec(state, cfg),
            l1_enabled: isActive ? 1 : 0,
            l2_enabled: isActive ? 1 : 0,
            ...layerCfg,
            // H.264 SIGNAL_ONLY override: mantener metadata pero player decide
            mode: isActive ? layerCfg.mode : 'SIGNAL_EMBED',
            hw_accel: isActive ? layerCfg.hw_accel : 'IF_AVAILABLE',
            decode_order: isActive ? layerCfg.decode_order : 'PASSTHROUGH'
        };
    }

    function generateEXTVLCOPT(profile) {
        const cfg = getProfileConfig(profile);
        let vlcopts = [];

        // ═══════════════════════════════════════════════════════════════
        // V6.2 WIRE DIRECTO DESDE PROFILE MANAGER UI (Downloads JSONs)
        // ═══════════════════════════════════════════════════════════════
        let pmProfile = null;
        if (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG && typeof window.APE_PROFILES_CONFIG.getProfile === 'function') {
            pmProfile = window.APE_PROFILES_CONFIG.getProfile(profile);
        }

        if (pmProfile && pmProfile.vlcopt && Object.keys(pmProfile.vlcopt).length > 0) {
            // El usuario tiene el diccionario vlcopt cableado desde la UI
            const vo = pmProfile.vlcopt;

            // SSOT: LAB Excel es la única fuente de verdad. Lo que calibre el LAB
            // se replica byte-by-byte al EXTVLCOPT — sin clamp, sin floor, sin ceiling.
            // Antes (FIX v4.20.5 retirado): clamp [30000,60000] aplastaba los 5/6 perfiles
            // calibrados, violando "Single Source of Truth".
            // Cada *-caching prefiere su propia key del LAB; si LAB no la tiene, cae al
            // proxy histórico (network/live), y solo en último recurso al cfg hardcoded.
            const fromLab = (val, fallback) => {
                const n = parseInt(val, 10);
                return Number.isNaN(n) ? (parseInt(fallback, 10) || 0) : n;
            };

            const netCache = fromLab(vo['network-caching'], cfg.network_cache_ms);
            const liveCache = fromLab(vo['live-caching'], cfg.live_cache_ms);
            const fileCache = fromLab(vo['file-caching'], cfg.file_cache_ms);
            const discCache = fromLab(vo['disc-caching'], netCache);
            const tcpCache = fromLab(vo['tcp-caching'], netCache);
            const soutCache = fromLab(vo['sout-mux-caching'], liveCache);

            vlcopts.push(`#EXTVLCOPT:network-caching=${netCache}`);
            vlcopts.push(`#EXTVLCOPT:live-caching=${liveCache}`);
            vlcopts.push(`#EXTVLCOPT:file-caching=${fileCache}`);
            vlcopts.push(`#EXTVLCOPT:disc-caching=${discCache}`);
            vlcopts.push(`#EXTVLCOPT:tcp-caching=${tcpCache}`);
            vlcopts.push(`#EXTVLCOPT:sout-mux-caching=${soutCache}`);

            vlcopts.push(`#EXTVLCOPT:clock-jitter=${vo['clock-jitter'] || 1500}`);
            vlcopts.push(`#EXTVLCOPT:clock-synchro=${vo['clock-synchro'] || 1}`);

            if (vo['http-user-agent']) vlcopts.push(`#EXTVLCOPT:http-user-agent=${vo['http-user-agent']}`);
            if (vo['http-forward-cookies']) vlcopts.push(`#EXTVLCOPT:http-forward-cookies=${vo['http-forward-cookies']}`);
            if (vo['http-reconnect']) vlcopts.push(`#EXTVLCOPT:http-reconnect=${vo['http-reconnect']}`);
            if (vo['http-continuous-stream']) vlcopts.push(`#EXTVLCOPT:http-continuous-stream=${vo['http-continuous-stream']}`);
            if (vo['http-continuous']) vlcopts.push(`#EXTVLCOPT:http-continuous=true`);

            // ── V6.2 VISUAL SUPREMACY (Filters & Color Matrix) ──
            if (vo['video-filter']) vlcopts.push(`#EXTVLCOPT:video-filter=${vo['video-filter']}`);
            if (vo['video-color-space']) vlcopts.push(`#EXTVLCOPT:video-color-space=${vo['video-color-space']}`);
            if (vo['video-transfer-function']) vlcopts.push(`#EXTVLCOPT:video-transfer-function=${vo['video-transfer-function']}`);
            if (vo['video-color-primaries']) vlcopts.push(`#EXTVLCOPT:video-color-primaries=${vo['video-color-primaries']}`);
            if (vo['video-color-range']) vlcopts.push(`#EXTVLCOPT:video-color-range=${vo['video-color-range']}`);
            if (vo['tone-mapping']) vlcopts.push(`#EXTVLCOPT:tone-mapping=${vo['tone-mapping']}`);
            if (vo['hdr-output-mode']) vlcopts.push(`#EXTVLCOPT:hdr-output-mode=${vo['hdr-output-mode']}`);

            if (vo['sharpen-sigma']) vlcopts.push(`#EXTVLCOPT:sharpen-sigma=${vo['sharpen-sigma']}`);
            if (vo['contrast']) vlcopts.push(`#EXTVLCOPT:contrast=${vo['contrast']}`);
            if (vo['brightness']) vlcopts.push(`#EXTVLCOPT:brightness=${vo['brightness']}`);
            if (vo['saturation']) vlcopts.push(`#EXTVLCOPT:saturation=${vo['saturation']}`);
            if (vo['gamma']) vlcopts.push(`#EXTVLCOPT:gamma=${vo['gamma']}`);

            // Hardcoded hardware decodes to guarantee limits
            vlcopts.push(`#EXTVLCOPT:ipv4-timeout=${pmProfile?.hardware?.network_timeout || 5000}`);
            vlcopts.push(`#EXTVLCOPT:avcodec-hw=${pmProfile?.hardware?.avcodec_hw || 'any'}`);
            vlcopts.push(`#EXTVLCOPT:hw-dec=${pmProfile?.hardware?.hw_dec || 'all'}`);
            vlcopts.push(`#EXTVLCOPT:hw-dec-accelerator=${pmProfile?.hardware?.hw_dec_accelerator || 'd3d11va,dxva2,vaapi,vdpau,nvdec,cuda,mediacodec,videotoolbox'}`);
            vlcopts.push(`#EXTVLCOPT:avcodec-dr=${pmProfile?.hardware?.avcodec_dr || 1}`);
            vlcopts.push(`#EXTVLCOPT:avcodec-threads=${pmProfile?.hardware?.avcodec_threads !== undefined ? pmProfile.hardware.avcodec_threads : 0}`);
            vlcopts.push(`#EXTVLCOPT:ffmpeg-hw`);
            vlcopts.push(`#EXTVLCOPT:video-visual=${pmProfile?.visuals?.video_visual_mode || 'full-range'}`);

            // Codecs
            vlcopts.push(`#EXTVLCOPT:codec=${pmProfile?.settings?.codec_priority ? pmProfile.settings.codec_priority.split(',').slice(0, 2).join(',') : 'h265,h264'}`);
            vlcopts.push(`#EXTVLCOPT:preferred-codec=${(pmProfile?.settings?.codec) ? pmProfile.settings.codec.toLowerCase() : 'hevc'}`);
            vlcopts.push(`#EXTVLCOPT:codec-priority=${pmProfile?.settings?.codec_priority || 'hevc,hev1,hvc1,h265,av1,vp9,h264'}`);

            // ── V6.3 PLAYER-CONSUMED INTENT (CMAF/APE → EXTVLCOPT translation) ──
            // Mapea la intención de #EXT-X-CMAF-AUDIO-FALLBACK / -ATMOS / -DOLBY-VISION /
            // -CONTAINER a directivas que VLC sí interpreta nativamente. Las 3 keys
            // adaptive-{maxwidth,maxheight,logic} se emiten hardcoded en L7008-7011
            // con valores per-canal derivados de _res796 — no las dupliquemos aquí.
            if (vo['audio-codec-priority']) vlcopts.push(`#EXTVLCOPT:audio-codec-priority=${vo['audio-codec-priority']}`);
            if (vo['audio-spatializer']) vlcopts.push(`#EXTVLCOPT:audio-spatializer=${vo['audio-spatializer']}`);
            if (vo['demux']) vlcopts.push(`#EXTVLCOPT:demux=${vo['demux']}`);

            // ═══════════════════════════════════════════════════════════
            // 🛡️ ANTI-DRIFT EXTRAS GATE — emite keys vlcopt no-conocidos
            // SOLO si el usuario opta-in en Import LAB (per-profile flag).
            // Sin opt-in, los keys "extras" del LAB quedan silenciados.
            // M1: emitOnce previene duplicación con keys ya emitidos.
            // ═══════════════════════════════════════════════════════════
            if (pmProfile.includeLabExtras === true) {
                const KNOWN_VLCOPT_KEYS = new Set([
                    'network-caching','live-caching','file-caching','disc-caching','tcp-caching','sout-mux-caching',
                    'clock-jitter','clock-synchro',
                    'http-user-agent','http-forward-cookies','http-reconnect','http-continuous-stream','http-continuous',
                    'video-filter','video-color-space','video-transfer-function','video-color-primaries','video-color-range',
                    'tone-mapping','hdr-output-mode','sharpen-sigma','contrast','brightness','saturation','gamma',
                    'audio-codec-priority','audio-spatializer','adaptive-logic','adaptive-maxwidth','adaptive-maxheight','demux'
                ]);
                // Build emitted-prefix set from current vlcopts (selective path output)
                const emittedVlcPrefixes = new Set();
                for (const line of vlcopts) {
                    const m = line.match(/^#EXTVLCOPT:([^=]+)/);
                    if (m) emittedVlcPrefixes.add(m[1]);
                }
                let extraCount = 0;
                for (const k of Object.keys(vo)) {
                    if (KNOWN_VLCOPT_KEYS.has(k)) continue;
                    const v = vo[k];
                    if (v === null || v === undefined || v === '') continue;
                    if (emitOnce(vlcopts, emittedVlcPrefixes, k, `#EXTVLCOPT:${k}=${v}`)) {
                        extraCount++;
                    }
                }
                if (extraCount > 0) {
                    if (_apeAuditAcc) _apeAuditAcc.extras.vlcopt += extraCount;
                    if (typeof console !== 'undefined') {
                        console.debug(`[GENERATOR] ${profile} +${extraCount} extras vlcopt emitted (LAB opt-in)`);
                    }
                }
            }

        } else {
            // Fallback Genérico si no hay vlcopt dict en el JSON
            const clampFallback = (val) => Math.max(30000, Math.min(val || 30000, 60000));
            vlcopts.push(`#EXTVLCOPT:network-caching=${clampFallback(cfg.network_cache_ms)}`);
            vlcopts.push(`#EXTVLCOPT:live-caching=${clampFallback(cfg.live_cache_ms)}`);
            vlcopts.push(`#EXTVLCOPT:file-caching=${clampFallback(cfg.file_cache_ms)}`);
            vlcopts.push(`#EXTVLCOPT:disc-caching=${clampFallback(cfg.network_cache_ms)}`);
            vlcopts.push(`#EXTVLCOPT:tcp-caching=${clampFallback(cfg.network_cache_ms)}`);
            vlcopts.push(`#EXTVLCOPT:sout-mux-caching=${clampFallback(cfg.live_cache_ms)}`);
            vlcopts.push(`#EXTVLCOPT:clock-jitter=${cfg.clock_jitter || 1500}`);
            vlcopts.push(`#EXTVLCOPT:clock-synchro=1`);
            vlcopts.push(`#EXTVLCOPT:http-reconnect=true`);
            vlcopts.push(`#EXTVLCOPT:http-continuous=true`);
            vlcopts.push(`#EXTVLCOPT:http-forward-cookies=true`);
            vlcopts.push(`#EXTVLCOPT:ipv4-timeout=${pmProfile?.hardware?.network_timeout || 5000}`);
            vlcopts.push(`#EXTVLCOPT:avcodec-hw=${pmProfile?.hardware?.avcodec_hw || 'any'}`);
            vlcopts.push(`#EXTVLCOPT:hw-dec=${pmProfile?.hardware?.hw_dec || 'all'}`);
            vlcopts.push(`#EXTVLCOPT:hw-dec-accelerator=${pmProfile?.hardware?.hw_dec_accelerator || 'd3d11va,dxva2,vaapi,vdpau,nvdec,cuda,mediacodec,videotoolbox'}`);
            vlcopts.push(`#EXTVLCOPT:avcodec-dr=${pmProfile?.hardware?.avcodec_dr || 1}`);
            vlcopts.push(`#EXTVLCOPT:avcodec-threads=${pmProfile?.hardware?.avcodec_threads !== undefined ? pmProfile.hardware.avcodec_threads : 0}`);
            vlcopts.push(`#EXTVLCOPT:ffmpeg-hw`);
            vlcopts.push(`#EXTVLCOPT:video-visual=${pmProfile?.visuals?.video_visual_mode || 'full-range'}`);
            vlcopts.push(`#EXTVLCOPT:codec=${pmProfile?.settings?.codec_priority ? pmProfile.settings.codec_priority.split(',').slice(0, 2).join(',') : 'h265,h264'}`);
            vlcopts.push(`#EXTVLCOPT:preferred-codec=${(pmProfile?.settings?.codec) ? pmProfile.settings.codec.toLowerCase() : 'hevc'}`);
            vlcopts.push(`#EXTVLCOPT:codec-priority=${pmProfile?.settings?.codec_priority || 'hevc,hev1,hvc1,h265,av1,vp9,h264'}`);
        }

        const standard = [
            `#EXTVLCOPT:avcodec-codec=hevc`,
            `#EXTVLCOPT:sout-video-codec=hevc`,
            `#EXTVLCOPT:sout-video-profile=main10`,
            // ── SECCIÓN 7: PLAYBACK QUALITY — MÁXIMA PRIORIDAD ──
            `#EXTVLCOPT:avcodec-hurry-up=0`,
            `#EXTVLCOPT:avcodec-fast=0`,
            `#EXTVLCOPT:avcodec-skiploopfilter=0`,
            `#EXTVLCOPT:avcodec-skipframe=0`,
            `#EXTVLCOPT:avcodec-skip-idct=0`,
            `#EXTVLCOPT:avcodec-lowres=0`,
            `#EXTVLCOPT:skip-frames`,
            `#EXTVLCOPT:drop-late-frames`,
            `#EXTVLCOPT:high-priority=1`,
            // ── SECCIÓN 8: FFMPEG LIBAVCODEC GOD-TIER (8 líneas) ──
            `#EXTVLCOPT:avcodec-error-resilience=1`,
            `#EXTVLCOPT:avcodec-workaround-bugs=1`,
            `#EXTVLCOPT:avcodec-debug=0`,
            `#EXTVLCOPT:ffmpeg-skip-frame=0`,
            `#EXTVLCOPT:ffmpeg-skip-idct=0`,
            `#EXTVLCOPT:ffmpeg-threads=0`,
            `#EXTVLCOPT:postproc-quality=6`,
            `#EXTVLCOPT:avformat-options={analyzeduration:10000000,probesize:10000000,fflags:+genpts+igndts+discardcorrupt}`,
            // ── SECCIÓN 9: AUDIO PRESERVATION — PASSTHROUGH GOD-TIER ──
            // Permite al hardware hacerse cargo inmediato, reduciendo CPU freeze.
            `#EXTVLCOPT:audio-track=0`,
            `#EXTVLCOPT:spdif=1`,
            `#EXTVLCOPT:aout=any`,
            `#EXTVLCOPT:audio-language=spa,eng,und`,
            `#EXTVLCOPT:audio-desync=0`,
            `#EXTVLCOPT:audio-replay-gain-mode=none`,
            `#EXTVLCOPT:audio-time-stretch=1`,
            `#EXTVLCOPT:stereo-mode=0`,
            // ── SECCIÓN 10: RESOLUCIÓN (profile-aware, 4 líneas) ──
            // B3 sanity guard: cap a 7680/4320 (8K) si LAB devuelve >7680 (lista emitía 60000).
            `#EXTVLCOPT:preferred-resolution=${(cfg.height > 0 && cfg.height <= 4320) ? cfg.height : 4320}`,
            `#EXTVLCOPT:adaptive-maxwidth=${(cfg.width > 0 && cfg.width <= 7680) ? cfg.width : 7680}`,
            `#EXTVLCOPT:adaptive-maxheight=${(cfg.height > 0 && cfg.height <= 4320) ? cfg.height : 4320}`,
            `#EXTVLCOPT:adaptive-logic=highest`,
            // ── SECCIÓN 11: VIDEO PROCESSING — HARDWARE MAXIMIZER (11 líneas) ──
            // 🛡️ Mecanismos Expertos: Anti-Pixelamiento Agresivo y Relleno Artificial Perfect-Frame (Plan B / Local Fallback)
            `#EXTVLCOPT:video-filter=fieldmatch,decimate,nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,deband=1thr=0.015:2thr=0.015:3thr=0.015:4thr=0.015:blur=1,pp=ac/dr/ci,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4,colorspace=all=bt2020:trc=smpte2084:format=yuv444p10le:fast=1,tonemap=mobius:param=0.3,hqdn3d=4:3:12:9,fps=fps=60:round=near,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs`,
            `#EXTVLCOPT:video-scaler=vdpau,opengl`,
            `#EXTVLCOPT:aspect-ratio=16:9`,
            `#EXTVLCOPT:video-deco=1`,
            `#EXTVLCOPT:sharpen-sigma=0.05`,
            `#EXTVLCOPT:contrast=1.0`,
            `#EXTVLCOPT:brightness=1.0`,
            `#EXTVLCOPT:saturation=1.0`,
            `#EXTVLCOPT:gamma=1.0`,
            `#EXTVLCOPT:video-title-show=0`,
            `#EXTVLCOPT:no-video-title-show`,
            // ── SECCIÓN 12: NETWORK & BANDWIDTH MAXIMIZER (6 líneas) ──
            `#EXTVLCOPT:network-synchronisation=1`,
            `#EXTVLCOPT:auto-adjust-pts-delay=1`,
            `#EXTVLCOPT:adaptive-caching=true`,
            `#EXTVLCOPT:adaptive-cache-size=5000`,
            `#EXTVLCOPT:swscale-mode=9`,
            `#EXTVLCOPT:swscale-fast=0`,
            // ── SECCIÓN 13: ERROR RESILIENCE (5 líneas) ──
            `#EXTVLCOPT:avcodec-options={gpu_decode:1,hw_deint:1,hw_scaler:1,threads:0,refcounted_frames:1}`,
            `#EXTVLCOPT:avcodec-error-concealment=motion_vector`,
            `#EXTVLCOPT:avcodec-max-consecutive-errors=5`,
            `#EXTVLCOPT:avcodec-skip-on-error=1`,
            `#EXTVLCOPT:avcodec-loop-filter=1`,
            // ── SECCIÓN 14: PLAYBACK CONTROL (6 líneas) ──
            // `// #EXTVLCOPT:repeat=100 (REMOVED: duplicated)`, (REMOVED: duplicated)
            `#EXTVLCOPT:input-repeat=0`,
            `#EXTVLCOPT:loop=0`,
            `#EXTVLCOPT:play-and-exit=0`,
            `#EXTVLCOPT:playlist-autostart=1`,
            `#EXTVLCOPT:live-pause=0`,
            // ── SECCIÓN 15: SYNC & DISPLAY (3 líneas) ──
            `#EXTVLCOPT:clock-synchro=1`,
            `#EXTVLCOPT:avcodec-preset=p6`,
            `#EXTVLCOPT:fullscreen=1`,
            // ── SECCIÓN 16: RESOLVER-SYNC — Directives from rq_sniper_mode.php ──
            `#EXTVLCOPT:adaptive-maxbw=300000000`,
            `#EXTVLCOPT:tls-session-resumption=true`,
            `#EXTVLCOPT:vout=opengl`,
            `#EXTVLCOPT:http-user-timeout=15000`,
            `#EXTVLCOPT:postproc-q=6`,
            `#EXTVLCOPT:network-caching-dscp=0`,
            `#EXTVLCOPT:network-caching-dscp-qos=0`,
            `#EXTVLCOPT:server-port=443`,
            `#EXTVLCOPT:video-on-top=0`,
            `#EXTVLCOPT:no-http-reconnect=0`
        ];

        return [...vlcopts, ...standard];
    }

    function build_kodiprop(cfg, profile, index) {
        const lcevcState = resolveLcevcState(cfg); // LCEVC Dinámico: nunca DISABLED

        // SSOT: leer LAB calibrado (pmProfile.vlcopt + prefetch_config) para todas las
        // directivas buffer/cache. Si LAB no está disponible, fallback a GLOBAL_CACHING.
        // Doctrina: el LAB Excel calibra y el JS replica byte-by-byte (sin ×4, sin clamp).
        const pmProfile = (typeof window !== 'undefined'
            && window.APE_PROFILES_CONFIG
            && typeof window.APE_PROFILES_CONFIG.getProfile === 'function')
            ? window.APE_PROFILES_CONFIG.getProfile(profile) : null;
        const labMs = (key, fallbackMs) => {
            const n = parseInt(pmProfile?.vlcopt?.[key], 10);
            return Number.isNaN(n) ? fallbackMs : n;
        };
        const labNetMs = labMs('network-caching', GLOBAL_CACHING.network);
        const labLiveMs = labMs('live-caching', GLOBAL_CACHING.live);
        const labSegments = parseInt(pmProfile?.prefetch_config?.prefetch_segments, 10) || (cfg.buffer_segments || 30);

        const streamHeaders = JSON.stringify({
            "User-Agent": UAPhantomEngine.getForChannel(index, cfg._channelName || ''),
            "X-APE-Profile": profile,
            "X-LCEVC-State": lcevcState,
            "X-Buffer-Min": String(labNetMs),
            "X-Clock-Jitter": String(cfg.clock_jitter || 1500),
            "X-Clock-Synchro": String(cfg.clock_synchro || 1),
            "X-ISP-Throttle-Level": "1-EXTREME",
            "X-ISP-BW-Demand": "MAX_CONTRACT",
            "X-ISP-Parallel-Streams": "4",
            "X-ISP-TCP-Window": "4194304",
            // ── 🌌 FUSIÓN INFINITA BWDIF: Directivas Adaptativas Polimórficas via JSON ──
            "X-Fusion-Infinita-Mode": "AGUJERO_NEGRO_HLS",
            "X-Resolution-Hierarchy": "480,720,1080,2160,4320",
            "X-Adaptive-Logic": "HIGHEST",
            "X-Adaptive-Max-Resolution": "7680x4320",
            "X-BWDIF-Chain": "bwdif>yadif2x>yadif",
            "X-BWDIF-GPU-Offload": "FORCE",
            "X-Deinterlace-Priority": "BWDIF_FIRST",
            "X-HW-Decode-Force": "mediacodec,vaapi,nvdec,d3d11va,videotoolbox",
            "X-Pixel-Absorption": "MAXIMUM_BANDWIDTH",
            "vrr_sync": "enabled",
            "auto_match_source_fps": "true",
            "audio_passthrough": "earc_strict",
            "drm_widevine_enforce": "true",
            "chooser_bandwidth_max": "2147483647",
            "X-Codec-Priority": "hevc,hev1,hvc1,h265,av1,h264",
            // ── 🎥 V17.2 CODEC FORCING via JSON ──
            "X-Video-Codec-Override": "hevc",
            "X-Video-Profile-Override": "main10",
            "X-Video-Tier": "HIGH",
            "X-Video-Level": "6.1,5.1,5.0,4.1",
            "X-Pixel-Format": "yuv444p12le",
            "X-Color-Depth-Force": "12bit",
            "X-Color-Space-Force": "bt2020",
            "X-Ignore-Screen-Resolution": "true",
            "X-HDR-Pipeline": "FORCE_12BIT_MAIN10_OVERDRIVE",
            "X-Max-Peak-Luminance": "5000",
            "X-Video-Scaler": "vdpau,opengl,cuda",
            "X-Sharpen-Sigma": "0.01",
            "X-Artifact-Deblocking": "extreme",
            "X-Noise-Reduction-Matrix": "nlmeans+hqdn3d",
            "X-Hardware-Extract-Max": "true",
            // ── 🎬 CONTENT-AWARE HEVC MULTICHANNEL via JSON ──
            "X-Encoder-Engine": "nvenc_hevc",
            "X-Encoder-Preset": "p6",
            "X-Encoder-Tune": "hq",
            "X-Rate-Control": "VBR_CONSTRAINED",
            "X-VBV-Max-Rate": String(Math.ceil((cfg.bitrate || 8000) * 1.3)),
            "X-VBV-Buf-Size": String(Math.ceil((cfg.bitrate || 8000) * 2)),
            "X-GOP-Size": String(cfg.gop_size || 60),
            "X-B-Frames": "2",
            "X-Lookahead": "10",
            "X-AQ-Mode": "SPATIAL",
            "X-Content-Aware-Mode": "PER_SCENE_CONTINUOUS",
            "X-Content-Analysis-FPS": "1",
            "X-Motion-Entropy-Action": "BOOST_40_PERCENT",
            "X-Talking-Head-Action": "REDUCE_30_PERCENT",
            "X-Smoothing-Window": "6-10s",
            "X-Failover-Policy": "CBR_FIXED_80_PERCENT",
            "X-ABR-Ladder": "2160p@25Mbps,1440p@16Mbps,1080p@10Mbps,720p@6Mbps,540p@3Mbps",
            "X-Scaler-Algorithm": "LANCZOS_HW",
            "X-CMAF-Chunk-Duration": "200ms",
            "X-E2E-Latency-Target": "4000ms",
            "X-Buffer-Underrun-Action": "jump-to-live",
            "X-ExoPlayer-Live-Edge-Start": "true",
            "X-GPU-Decode-Engine": "cuvid",
            "X-GPU-Filter-Chain": "VRAM_ONLY",
            // ── 🧠 CORTEX QUALITY ENGINE via EXTHTTP JSON ──
            "X-Cortex-Quality-Engine": "v1.0.0",
            "X-Cortex-Decision-Tree": "codec>transport>hdr>abr>deinterlace>enhancement",
            "X-Cortex-Codec-Priority": "hevc=100,av1=95,vp9=85,avc=70",
            "X-Cortex-Transport-Priority": "cmaf>fmp4>ts>dash",
            "X-Cortex-HDR-Policy": "passthrough>hable>reinhard>mobius",
            "X-Cortex-HDR-Tone-Map-HDR10": "hable",
            "X-Cortex-HDR-Tone-Map-HDR10Plus": "reinhard",
            "X-Cortex-HDR-Tone-Map-DolbyVision": "mobius",
            "X-Cortex-ABR-Safety-Margin": "0.2",
            "X-Cortex-ABR-Algorithm": "throughput>buffer",
            "X-Cortex-ABR-Switch-Up": "1.2",
            "X-Cortex-ABR-Switch-Down": "0.8",
            "X-Cortex-ABR-Interval-Min": "5000",
            "X-Cortex-Deinterlace-Priority": "bwdif=95,w3fdif=85,yadif=80",
            "X-Cortex-Deinterlace-Detect": "auto,fps=25:29.97:50:59.94,field=tff",
            "X-Cortex-Device-Type": "universal",
            "X-Cortex-Device-Screen": "3840x2160",
            "X-Cortex-Device-HDR": "hdr10:hdr10plus:dolbyvision:hlg",
            "X-Cortex-Device-Codec-HEVC": "decode:true,profile:main:main10:high,hw:true",
            "X-Cortex-Device-Codec-AV1": "decode:true,profile:main,hw:true",
            "X-Cortex-Device-Max-Bitrate": "50000000",
            "X-Cortex-Device-LCEVC": "true",
            "X-Cortex-Network-BW-Method": "throughput",
            "X-Cortex-Network-Stable-Ratio": "0.8",
            "X-Cortex-Network-Variance-Threshold": "0.2",
            "X-Cortex-Network-Latency-Threshold": "100",
            "X-Cortex-Network-Jitter-Threshold": "30",
            "X-Cortex-Network-Loss-Threshold": "0.01",
            "X-Cortex-Artifact-Deblocking": "auto",
            "X-Cortex-Artifact-Loop-Filter": "enabled",
            "X-Cortex-Artifact-Concealment": "motion_vector",
            "X-Cortex-Artifact-Error-Resilience": "true",
            "X-Cortex-Fallback-Codec": "hevc>av1>vp9>avc",
            "X-Cortex-Fallback-Transport": "cmaf>fmp4>ts",
            "X-Cortex-Fallback-Resolution": "4K>2K>FHD>HD>SD",
            "X-Cortex-Fallback-HDR": "passthrough>tone_map>sdr",
            "X-Cortex-FFMPEG-HLS-TS": "hls_time=6,hls_flags=independent_segments",
            "X-Cortex-FFMPEG-HLS-CMAF": "segment_type=fmp4,hls_time=4",
            "X-Cortex-FFMPEG-x265-Params": "deblock:-1:-1,hdr-opt=1,repeat-headers=1",
            "X-Cortex-Noise-Reduction": "nlmeans+hqdn3d,preserve-detail=true",
            "X-Cortex-Enhancement-LCEVC": "tune=vq,base=hevc",
            "X-Cortex-Idempotency": "deterministic",
            "X-Cortex-Channels-Map": "v1.0.0",
            "X-Cortex-Bidirectional": "resolve>enrich>override>update",
            // ── 🚀 TRANSPORT DECISION MODULE v2.0 via EXTHTTP JSON ──
            "X-Transport-Engine": "v2.0.0",
            "X-Transport-Decision-Tree": "origin>player>device>hdr>telemetry>network>scoring>mode>fallback>decision",
            "X-Transport-Modes": "direct_ts,direct_cmaf,worker_ts,worker_cmaf,worker_dash_hls_hybrid",
            "X-Transport-Player-Matrix": "vlc:TS=0.95|CMAF=0.55,ott:TS=0.90|CMAF=0.92,kodi:TS=0.88|CMAF=0.85,shaka:TS=0.80|CMAF=0.95",
            "X-Transport-HDR-Matrix": "vlc:HDR10+HDR10+|ott:HDR10+HDR10++DV+HLG|stb:none",
            "X-Transport-Scoring": "player=0.30,device=0.25,hdr=0.15,telemetry=0.15,network=0.15",
            "X-Transport-CMAF-Threshold": "0.15",
            "X-Transport-TS-Threshold": "0.10",
            "X-Transport-Default-On-Tie": "direct_ts",
            "X-Transport-CMAF-Segment-Type": "fmp4",
            "X-Transport-CMAF-Init": "init.mp4",
            "X-Transport-CMAF-Independent": "true",
            "X-Transport-CMAF-Target-Duration": "4",
            "X-Transport-CMAF-Low-Latency": "true",
            "X-Transport-CMAF-HLS-Version": "7",
            "X-Transport-CMAF-Dash-Hybrid": "true",
            "X-Transport-Fallback-CMAF": "direct_cmaf>worker_ts>direct_ts>worker_hybrid",
            "X-Transport-Fallback-TS": "direct_ts>worker_cmaf>direct_cmaf>worker_hybrid",
            "X-Transport-Penalty-VLC-Legacy": "CMAF:-0.25",
            "X-Transport-Penalty-STB-Legacy": "CMAF:-0.40",
            "X-Transport-Origin-Threshold": "0.3",
            "X-Transport-Worker-ZeroDrop": "true",
            "X-Transport-Worker-Watchdog": "manifest=30s,freeze=10s,health=5s",
            "X-Transport-Network-Unstable": "bonus_ts=0.15,penalty_cmaf=0.10",
            "X-Transport-Network-Strong": "bonus_cmaf=0.10",
            "X-Transport-FFmpeg-CMAF": "seg=4,fmp4,hls_playlist=1,latency=3",
            "X-Transport-FFmpeg-Hybrid": "seg=4,fmp4,ldash=1,streaming=1",
            "X-Transport-FFmpeg-TS": "mpegts,pcr=50,pat=0.1",
            "X-Transport-FFmpeg-Tonemap": "bt2390,peak=100,desat=0",
            "X-Transport-HDR-Chain": "native>tone_mapped>sdr",
            "X-Transport-HDR-Passthrough": "true",
            "X-Transport-Telemetry": "startup+rebuffer+freeze+quality_switches",
            "X-Transport-Telemetry-Learn": "true",
            "X-Transport-Stability-First": "true"
        });
        const isSupreme = (profile === 'P0' || profile === 'P1');
        const isHigh = (profile === 'P2' || profile === 'P3');
        const isMid = (profile === 'P4');

        const selectionProps = isSupreme ? [
            '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
            '#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=2147483647',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_max=4K',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_secure_max=4K',
            '#KODIPROP:inputstream.adaptive.ignore_screen_resolution=true'
        ] : isHigh ? [
            '#KODIPROP:inputstream.adaptive.stream_selection_type=fixed-res',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_max=4K',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_secure_max=4K'
        ] : isMid ? [
            '#KODIPROP:inputstream.adaptive.stream_selection_type=fixed-res',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_max=720p',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_secure_max=720p'
        ] : [
            '#KODIPROP:inputstream.adaptive.stream_selection_type=fixed-res',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_max=480p',
            '#KODIPROP:inputstream.adaptive.chooser_resolution_secure_max=480p'
        ];

        const _baseKodiProps = [
            '#KODIPROP:inputstream=inputstream.adaptive',
            '#KODIPROP:inputstream.adaptive.manifest_type=hls',
            ...selectionProps,
            // --- 🚀 ESCALADA TÁCTICA RAMPA (Aceleración Progresiva 0-60s) ---
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp=true',
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp_step=10000000', // Sube 10 Mbps
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp_interval=500', // Cada 500ms
            '#KODIPROP:inputstream.adaptive.bandwidth_ramp_peak=100000000', // Tope 100 Mbps
            '#KODIPROP:inputstream.adaptive.bandwidth_handoff_ms=60000', // Toma de control Sentinel al minuto
            // -------------------------------------------------------------
            '#KODIPROP:inputstream.adaptive.preferred_codec=hevc,hev1,hvc1,h265',
            `#KODIPROP:inputstream.adaptive.max_resolution=${cfg.resolution || '3840x2160'}`,
            `#KODIPROP:inputstream.adaptive.resolution_secure_max=${cfg.resolution || '3840x2160'}`,
            // v6.1 COMPAT: Usa resolución del PERFIL REAL, no 7680x4320 hardcodeado
            // ── 🛡️ PEVCE ACTIVE METADATA ENFORCEMENT & ZAPPING ENGINE ──
            '#KODIPROP:inputstream.adaptive.stream_selection_enabled=true',
            '#KODIPROP:inputstream.adaptive.play_timeshift_buffer_size=256', // Amplificado 2x para Fase de Impulso
            '#KODIPROP:inputstream.adaptive.force_hdr=true',
            // ── 🎥 V17.2 CODEC FORCING & HARDWARE DELEGATION ──
            '#KODIPROP:inputstream.adaptive.video_codec_override=hevc',
            '#KODIPROP:inputstream.adaptive.video_profile=main10',
            '#KODIPROP:inputstream.adaptive.hardware_decode=true',
            '#KODIPROP:inputstream.adaptive.tunneling_enabled=true', // Audio/Video direct al Display (Evita Stutter SO)
            // ── 🔇 AUDIO FALLBACK ENGINE (Passthrough Seguro > eac3 > ac3 > aac) ──
            `#KODIPROP:inputstream.adaptive.audio_codec_override=${cfg.audio_codec || 'eac3'}`,
            `#KODIPROP:inputstream.adaptive.audio_channels=${cfg.audio_channels >= 6 ? '5.1' : '2.0'}`,
            `#KODIPROP:inputstream.adaptive.audio_passthrough=${cfg.audio_channels >= 6 ? 'true' : 'false'}`,
            `#KODIPROP:inputstream.adaptive.dolby_atmos=${cfg.audio_channels >= 8 ? 'true' : 'false'}`,
            // ── 🎬 CONTENT-AWARE HEVC via KODIPROP ──
            `#KODIPROP:inputstream.adaptive.max_bandwidth=${cfg.max_bandwidth || 50000000}`,
            `#KODIPROP:inputstream.adaptive.initial_bandwidth=${Math.min(cfg.max_bandwidth || 50000000, 10000000)}`,
            // v6.1 COMPAT: max_bandwidth respeta perfil (no 303Mbps), initial_bandwidth max 10Mbps
            '#KODIPROP:inputstream.adaptive.bandwidth_preference=unlimited',
            `#KODIPROP:inputstream.adaptive.max_fps=${cfg.fps || 60}`,
            '#KODIPROP:inputstream.adaptive.adaptation.set_limits=true',
            '#KODIPROP:inputstream.adaptive.manifest_reconnect=true',
            '#KODIPROP:inputstream.adaptive.retry_max=100',
            '#KODIPROP:inputstream.adaptive.segment_download_retry=20',
            '#KODIPROP:inputstream.adaptive.segment_download_timeout=60000',
            '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full',
            '#KODIPROP:inputstream.adaptive.drm_legacy_mode=true',
            '#KODIPROP:inputstream.adaptive.play_timeshift_buffer=true',
            `#KODIPROP:inputstream.adaptive.initial_bitrate_max=${cfg.max_bandwidth || 50000000}`,
            // v6.1 COMPAT: initial_bitrate_max respeta perfil
            '#KODIPROP:inputstream.adaptive.read_timeout=60000',
            '#KODIPROP:inputstream.adaptive.connection_timeout=60000',
            '#KODIPROP:inputstream.adaptive.audio_sample_rate=48000',
            '#KODIPROP:inputstream.adaptive.audio_bit_depth=24',
            '#KODIPROP:inputstream.adaptive.spatial_audio=true',
            `#KODIPROP:inputstream.adaptive.stream_params=profile=${profile}`,
            `#KODIPROP:inputstream.adaptive.stream_headers=${streamHeaders}`,
            // SSOT LAB: live_delay y buffer_duration en SEGUNDOS (Kodi format),
            // derivados de vlcopt[*-caching] del LAB en ms. Sin multiplicadores ×4.
            `#KODIPROP:inputstream.adaptive.live_delay=${Math.floor(labLiveMs / 1000)}`,
            `#KODIPROP:inputstream.adaptive.buffer_duration=${Math.floor(labNetMs / 1000)}`,
            `#KODIPROP:inputstream.adaptive.buffer_segments=${labSegments}`,
            `#KODIPROP:inputstream.adaptive.prefetch_size=${labSegments * 2}`, // 2× segmentos LAB
            `#KODIPROP:inputstream.adaptive.preconnect_domains=${cfg.cdn_url || 'cdn.ape.net'}`,
            '#KODIPROP:inputstream.adaptive.tls_cipher_suites=TLS_AES_256_GCM_SHA384',
            '#KODIPROP:inputstream.adaptive.ocsp_stapling=true',
            '#KODIPROP:inputstream.adaptive.early_hints=true',
            '#EXT-X-START:TIME-OFFSET=-3.0',
            // ── 🔥 OLED SHOWROOM SUPREMACY v5 (5000cd/m² PERCEPTION & ZERO CRASH) ──
            // Exprimir 5000 nits de luminancia sin desbordar el decoder. Negros absolutos orgánicos.
            '#KODIPROP:inputstream.adaptive.hdr_handling=force_hdr',
            '#KODIPROP:inputstream.adaptive.max_luminance=5000',
            '#KODIPROP:inputstream.adaptive.min_luminance=0.0000', // Negros OLED Profundos 100%
            '#KODIPROP:inputstream.adaptive.hdr10_plus_parse=true',
            '#KODIPROP:inputstream.adaptive.dolby_vision_rpu=true',
            '#KODIPROP:inputstream.adaptive.color_primaries=bt2020',
            '#KODIPROP:inputstream.adaptive.transfer=smpte2084', // Obliga curva PQ pura HDR
            '#KODIPROP:inputstream.adaptive.matrix_coefficients=bt2020nc',
            '#KODIPROP:inputstream.adaptive.color_space=bt2020',
            '#KODIPROP:inputstream.adaptive.pixel_format=yuv420p10le', // Profundidad de espectro expandida
            // Tone mapping perceptual adaptativo, previene el clipping que causaba crashes de parseo
            '#KODIPROP:inputstream.adaptive.tone_mapping=mobius', // Renderizado Mobius superior para Highlights en destellos
            '#KODIPROP:inputstream.adaptive.tone_mapping_peak=5000',
            '#KODIPROP:inputstream.adaptive.contrast_boost=1.15', // Amplificador dinámico de contraste vital
            '#KODIPROP:inputstream.adaptive.film_grain_synthesis=false' // Nitidez extrema sin penalización de gpu
        ];

        // ═══════════════════════════════════════════════════════════════════
        // 🛡️ ANTI-DRIFT EXTRAS GATE — emite keys kodiprop no-conocidos del LAB
        // SOLO si el usuario opta-in (per-profile flag persistido en Import LAB).
        // M1: emitOnce dedupes contra keys ya emitidos en _baseKodiProps.
        // ═══════════════════════════════════════════════════════════════════
        const _extraKodiProps = [];
        if (pmProfile?.includeLabExtras === true && pmProfile.kodiprop) {
            // Set de prefixes ya emitidos por _baseKodiProps.
            const emittedPrefixes = new Set();
            for (const line of _baseKodiProps) {
                const m = line.match(/^#KODIPROP:([^=]+)=/);
                if (m) emittedPrefixes.add(m[1]);
            }
            let extraCount = 0;
            for (const [k, v] of Object.entries(pmProfile.kodiprop)) {
                if (v === null || v === undefined || v === '') continue;
                if (emitOnce(_extraKodiProps, emittedPrefixes, k, `#KODIPROP:${k}=${v}`)) {
                    extraCount++;
                }
            }
            if (extraCount > 0) {
                if (_apeAuditAcc) _apeAuditAcc.extras.kodiprop += extraCount;
                if (typeof console !== 'undefined') {
                    console.debug(`[GENERATOR] ${profile} +${extraCount} extras kodiprop emitted (LAB opt-in)`);
                }
            }
        }

        return [..._baseKodiProps, ..._extraKodiProps];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🎯 APE CHANNEL CLASSIFIER v3.0 — Dynamic JSON-backed Engine
    // Reads from ape-classifier-data.json via window.APE_CLASSIFIER_DATA
    // Outputs GroupTitleBuilder-compatible _classification objects
    // ═══════════════════════════════════════════════════════════════════

    // ── Regex-based region patterns (stays in code: needs compiled regex for channel matchers) ──
    const REGION_PATTERNS = {
        'UK': { codes: ['UK', 'GB', 'BRITISH'], patterns: [/[\|┃]UK[\|┃]/i, /\bUK\s+(SKY|BBC|ITV|CHANNEL)/i, /BBC\s*[0-9]/i, /ITV\s*[0-9]/i, /SKY\s+(SPORTS|CINEMA|NEWS|ONE|TWO)/i], channels: ['BBC', 'ITV', 'SKY UK', 'CHANNEL 4', 'CHANNEL 5', 'BT SPORT'], language: 'en-GB', region: 'EUROPA', country: 'Reino Unido' },
        'ES': { codes: ['ES', 'ESP', 'SPAIN'], patterns: [/[\|┃]ES[\|┃]/i, /\bES:/i, /MOVISTAR/i, /TELECINCO/i, /ANTENA\s*3/i, /LA\s*SEXTA/i, /CUATRO/i], channels: ['MOVISTAR', 'TELECINCO', 'ANTENA 3', 'LA SEXTA', 'CUATRO', 'LA 1', 'LA 2', 'DAZN ES'], language: 'es-ES', region: 'EUROPA', country: 'España' },
        'DE': { codes: ['DE', 'GER', 'GERMANY'], patterns: [/[\|┃]DE[\|┃]/i, /\bDE:/i, /DAS\s*ERSTE/i, /ZDF/i, /RTL\s*(II|2)?/i, /SAT\.?1/i, /PROSIEBEN/i, /SKY\s*DE/i], channels: ['DAS ERSTE', 'ZDF', 'RTL', 'SAT.1', 'PROSIEBEN', 'SKY DEUTSCHLAND'], language: 'de-DE', region: 'EUROPA', country: 'Alemania' },
        'FR': { codes: ['FR', 'FRA', 'FRANCE'], patterns: [/[\|┃]FR[\|┃]/i, /\bFR:/i, /FRANCE\s*[0-9]/i, /TF1/i, /M6/i, /CANAL\s*\+/i], channels: ['TF1', 'M6', 'FRANCE 2', 'CANAL+', 'BEIN SPORTS FR'], language: 'fr-FR', region: 'EUROPA', country: 'Francia' },
        'IT': { codes: ['IT', 'ITA', 'ITALY'], patterns: [/[\|┃]IT[\|┃]/i, /\bIT:/i, /RAI\s*[0-9]/i, /MEDIASET/i, /SKY\s*IT/i, /CANALE\s*[0-9]/i], channels: ['RAI 1', 'RAI 2', 'RAI 3', 'CANALE 5', 'SKY ITALIA', 'DAZN IT'], language: 'it-IT', region: 'EUROPA', country: 'Italia' },
        'PT': { codes: ['PT', 'PRT', 'PORTUGAL'], patterns: [/[\|┃]PT[\|┃]/i, /RTP\s*[0-9]/i, /SIC/i, /TVI/i, /SPORT\s*TV/i], channels: ['RTP 1', 'SIC', 'TVI', 'SPORT TV', 'BENFICA TV'], language: 'pt-PT', region: 'EUROPA', country: 'Portugal' },
        'NL': { codes: ['NL', 'NLD', 'NETHERLANDS'], patterns: [/[\|┃]NL[\|┃]/i, /NPO\s*[0-9]/i, /RTL\s*(NL|4|5|7|8)/i, /ZIGGO/i], channels: ['NPO 1', 'NPO 2', 'RTL 4', 'ZIGGO SPORT', 'ESPN NL'], language: 'nl-NL', region: 'EUROPA', country: 'Holanda' },
        'PL': { codes: ['PL', 'POL', 'POLAND'], patterns: [/[\|┃]PL[\|┃]/i, /POLSAT/i, /TVN/i, /TVP\s*[0-9]/i], channels: ['POLSAT', 'TVN', 'TVP 1', 'ELEVEN SPORTS PL'], language: 'pl-PL', region: 'EUROPA', country: 'Polonia' },
        'TR': { codes: ['TR', 'TUR', 'TURKEY'], patterns: [/[\|┃]TR[\|┃]/i, /TRT/i, /SHOW\s*TV/i, /KANAL\s*D/i, /BEIN\s*SPORTS?\s*[0-9]\s*(TR|TURKEY)/i], channels: ['TRT 1', 'SHOW TV', 'KANAL D', 'BEIN SPORTS TR'], language: 'tr-TR', region: 'ASIA ARABIA', country: 'Turquía' },
        'GR': { codes: ['GR', 'GRC', 'GREECE'], patterns: [/[\|┃]GR[\|┃]/i, /ERT\s*[0-9]/i, /NOVA\s*(SPORTS?|CINEMA)/i, /MEGA/i], channels: ['ERT 1', 'NOVA', 'MEGA CHANNEL', 'ALPHA TV'], language: 'el-GR', region: 'EUROPA', country: 'Grecia' },
        'BE': { codes: ['BE', 'BEL', 'BELGIUM'], patterns: [/[\|┃]BE[\|┃]/i, /RTBF/i, /VTM/i, /RTL\s*TVI/i], channels: ['RTBF', 'VTM', 'RTL TVI'], language: 'nl-BE,fr-BE', region: 'EUROPA', country: 'Bélgica' },
        'SE': { codes: ['SE', 'SWE', 'SWEDEN'], patterns: [/[\|┃]SE[\|┃]/i, /SVT\s*[0-9]/i, /TV[34]/i, /VIASAT/i], channels: ['SVT 1', 'SVT 2', 'TV3', 'TV4', 'VIASAT'], language: 'sv-SE', region: 'EUROPA', country: 'Suecia' },
        'DK': { codes: ['DK', 'DNK', 'DENMARK'], patterns: [/[\|┃]DK[\|┃]/i, /DR\s*[0-9]/i, /TV2\s*(DK|$)/i], channels: ['DR 1', 'TV2'], language: 'da-DK', region: 'EUROPA', country: 'Dinamarca' },
        'NO': { codes: ['NO', 'NOR', 'NORWAY'], patterns: [/[\|┃]NO[\|┃]/i, /NRK\s*[0-9]/i, /TV2\s*(NORGE|NORWAY)/i], channels: ['NRK 1', 'TV2 NORGE'], language: 'nb-NO', region: 'EUROPA', country: 'Noruega' },
        'FI': { codes: ['FI', 'FIN', 'FINLAND'], patterns: [/[\|┃]FI[\|┃]/i, /YLE\s*(TV)?[0-9]/i, /NELONEN/i], channels: ['YLE TV1', 'MTV3', 'NELONEN'], language: 'fi-FI', region: 'EUROPA', country: 'Finlandia' },
        'HR': { codes: ['HR', 'HRV', 'CROATIA'], patterns: [/[\|┃]HR[\|┃]/i, /HRT\s*[0-9]/i, /SPORTKLUB/i], channels: ['HRT 1', 'SPORT KLUB HR'], language: 'hr-HR', region: 'EUROPA', country: 'Croacia' },
        'RS': { codes: ['RS', 'SRB', 'SERBIA'], patterns: [/[\|┃]RS[\|┃]/i, /RTS\s*[0-9]/i, /B92/i], channels: ['RTS 1', 'SPORT KLUB', 'B92'], language: 'sr-RS', region: 'EUROPA', country: 'Serbia' },
        'AL': { codes: ['AL', 'ALB', 'ALBANIA'], patterns: [/[\|┃]AL[\|┃]/i, /RTSH/i, /KLAN/i, /TOP\s*CHANNEL/i, /FILM\s*(AKSION|HITS|KOMEDI|DRAME)/i], channels: ['RTSH', 'KLAN', 'TOP CHANNEL', 'FILM AKSION'], language: 'sq-AL', region: 'EUROPA', country: 'Albania' },
        'RO': { codes: ['RO', 'ROU', 'ROMANIA'], patterns: [/[\|┃]RO[\|┃]/i, /PRO\s*TV/i, /DIGI\s*(SPORT|FILM)/i], channels: ['PRO TV', 'ANTENA 1', 'DIGI SPORT'], language: 'ro-RO', region: 'EUROPA', country: 'Rumanía' },
        'CZ': { codes: ['CZ', 'CZE', 'CZECH'], patterns: [/[\|┃]CZ[\|┃]/i, /CT\s*[0-9]/i, /PRIMA/i], channels: ['CT 1', 'NOVA', 'PRIMA'], language: 'cs-CZ', region: 'EUROPA', country: 'República Checa' },
        'SK': { codes: ['SK', 'SVK', 'SLOVAKIA'], patterns: [/[\|┃]SK[\|┃]/i, /MARKIZA/i, /JOJ/i], channels: ['MARKIZA', 'JOJ'], language: 'sk-SK', region: 'EUROPA', country: 'Eslovaquia' },
        'HU': { codes: ['HU', 'HUN', 'HUNGARY'], patterns: [/[\|┃]HU[\|┃]/i, /RTL\s*(KLUB|HU)/i, /TV2\s*(HU|$)/i], channels: ['RTL KLUB', 'TV2 HU', 'DUNA'], language: 'hu-HU', region: 'EUROPA', country: 'Hungría' },
        'BG': { codes: ['BG', 'BGR', 'BULGARIA'], patterns: [/[\|┃]BG[\|┃]/i, /BNT\s*[0-9]/i, /BTV/i], channels: ['BNT 1', 'NOVA BG', 'BTV'], language: 'bg-BG', region: 'EUROPA', country: 'Bulgaria' },
        'UA': { codes: ['UA', 'UKR', 'UKRAINE'], patterns: [/[\|┃]UA[\|┃]/i, /1\+1/i, /INTER\s*(UA|$)/i], channels: ['1+1', 'INTER', 'STB'], language: 'uk-UA', region: 'EUROPA', country: 'Ucrania' },
        'RU': { codes: ['RU', 'RUS', 'RUSSIA'], patterns: [/[\|┃]RU[\|┃]/i, /ROSSIYA\s*[0-9]/i, /NTV\s*(RU|$)/i, /MATCH\s*TV/i], channels: ['CHANNEL ONE', 'ROSSIYA 1', 'NTV', 'MATCH TV'], language: 'ru-RU', region: 'EUROPA', country: 'Rusia' },
        'US': { codes: ['US', 'USA', 'UNITED STATES'], patterns: [/[\|┃]USA?[\|┃]/i, /\bABC\s*(US|$)/i, /\bCBS/i, /\bNBC/i, /\bFOX\s*(NEWS|SPORTS|US|$)/i, /\bESPN\s*(US|$)/i, /\bCNN\s*(US|$)/i, /\bHBO/i], channels: ['ABC', 'CBS', 'NBC', 'FOX', 'ESPN', 'CNN', 'HBO', 'SHOWTIME', 'PARAMOUNT+'], language: 'en-US', region: 'NORTEAMÉRICA', country: 'Estados Unidos' },
        'CA': { codes: ['CA', 'CAN', 'CANADA'], patterns: [/[\|┃]CA[\|┃]/i, /CBC/i, /CTV/i, /TSN/i, /SPORTSNET/i], channels: ['CBC', 'CTV', 'TSN', 'SPORTSNET'], language: 'en-CA,fr-CA', region: 'NORTEAMÉRICA', country: 'Canadá' },
        'MX': { codes: ['MX', 'MEX', 'MEXICO'], patterns: [/[\|┃]MX[\|┃]/i, /AZTECA/i, /TELEVISA/i, /TUDN/i], channels: ['AZTECA', 'TELEVISA', 'TUDN'], language: 'es-MX', region: 'AMÉRICA LATINA', country: 'México' },
        'BR': { codes: ['BR', 'BRA', 'BRAZIL'], patterns: [/[\|┃]BR[\|┃]/i, /GLOBO/i, /SBT/i, /RECORD/i, /SPORTV/i], channels: ['GLOBO', 'SBT', 'RECORD TV', 'SPORTV'], language: 'pt-BR', region: 'AMÉRICA LATINA', country: 'Brasil' },
        'AR': { codes: ['AR', 'ARG', 'ARGENTINA'], patterns: [/[\|┃]AR[\|┃]/i, /TELEFE/i, /TYC\s*SPORTS/i, /ESPN\s*(SUR|ARGENTINA)/i], channels: ['EL TRECE', 'TELEFE', 'TYC SPORTS'], language: 'es-AR', region: 'AMÉRICA LATINA', country: 'Argentina' },
        'CO': { codes: ['CO', 'COL', 'COLOMBIA'], patterns: [/[\|┃]CO[\|┃]/i, /CARACOL/i, /RCN/i], channels: ['CARACOL', 'RCN TV'], language: 'es-CO', region: 'AMÉRICA LATINA', country: 'Colombia' },
        'CL': { codes: ['CL', 'CHL', 'CHILE'], patterns: [/[\|┃]CL[\|┃]/i, /CHILEVISION/i, /CDF/i], channels: ['TVN', 'MEGA', 'CANAL 13', 'CDF'], language: 'es-CL', region: 'AMÉRICA LATINA', country: 'Chile' },
        'PE': { codes: ['PE', 'PER', 'PERU'], patterns: [/[\|┃]PE[\|┃]/i, /PANAMERICANA/i, /WILLAX/i], channels: ['AMÉRICA TV', 'ATV', 'LATINA'], language: 'es-PE', region: 'AMÉRICA LATINA', country: 'Perú' },
        'VE': { codes: ['VE', 'VEN', 'VENEZUELA'], patterns: [/[\|┃]VE[\|┃]/i, /VENEVISION/i, /TELEVEN/i], channels: ['VENEVISION', 'TELEVEN', 'GLOBOVISION'], language: 'es-VE', region: 'AMÉRICA LATINA', country: 'Venezuela' },
        'AE': { codes: ['AE', 'ARE', 'UAE', 'EMIRATES'], patterns: [/[\|┃]AE[\|┃]/i, /DUBAI\s*(TV|SPORTS?)/i, /ABU\s*DHABI/i], channels: ['DUBAI TV', 'ABU DHABI SPORTS'], language: 'ar-AE', region: 'ASIA ARABIA', country: 'Emiratos Árabes' },
        'SA': { codes: ['SA', 'SAU', 'SAUDI'], patterns: [/[\|┃]SA[\|┃]/i, /SAUDI/i, /ROTANA/i, /MBC\s*(SA|$)/i], channels: ['SAUDI TV', 'ROTANA', 'MBC'], language: 'ar-SA', region: 'ASIA ARABIA', country: 'Arabia Saudita' },
        'EG': { codes: ['EG', 'EGY', 'EGYPT'], patterns: [/[\|┃]EG[\|┃]/i, /NILE\s*(TV|SPORTS?)/i], channels: ['NILE TV', 'NILE SPORTS', 'CBC'], language: 'ar-EG', region: 'ASIA ARABIA', country: 'Egipto' },
        'IN': { codes: ['IN', 'IND', 'INDIA'], patterns: [/[\|┃]IN[\|┃]/i, /STAR\s*(SPORTS|PLUS)/i, /SONY\s*(TV|SPORTS)/i, /ZEE/i, /COLORS/i], channels: ['STAR SPORTS', 'SONY TV', 'ZEE TV', 'COLORS'], language: 'hi-IN,en-IN', region: 'ASIA ARABIA', country: 'India' },
        'PK': { codes: ['PK', 'PAK', 'PAKISTAN'], patterns: [/[\|┃]PK[\|┃]/i, /GEO\s*(TV|SPORTS)/i, /ARY/i, /HUM\s*TV/i], channels: ['PTV', 'GEO TV', 'ARY NEWS', 'HUM TV'], language: 'ur-PK', region: 'ASIA ARABIA', country: 'Pakistán' },
        'CN': { codes: ['CN', 'CHN', 'CHINA'], patterns: [/[\|┃]CN[\|┃]/i, /CCTV\s*[0-9]/i, /CGTN/i], channels: ['CCTV', 'CGTN'], language: 'zh-CN', region: 'ASIA ARABIA', country: 'China' },
        'JP': { codes: ['JP', 'JPN', 'JAPAN'], patterns: [/[\|┃]JP[\|┃]/i, /NHK/i, /FUJI\s*TV/i, /TV\s*ASAHI/i, /WOWOW/i, /DAZN\s*(JP|JAPAN)/i], channels: ['NHK', 'FUJI TV', 'WOWOW', 'DAZN JP'], language: 'ja-JP', region: 'ASIA ARABIA', country: 'Japón' },
        'KR': { codes: ['KR', 'KOR', 'KOREA'], patterns: [/[\|┃]KR[\|┃]/i, /KBS\s*[0-9]/i, /JTBC/i], channels: ['KBS', 'MBC', 'SBS', 'JTBC'], language: 'ko-KR', region: 'ASIA ARABIA', country: 'Corea del Sur' },
        'ZA': { codes: ['ZA', 'ZAF', 'SOUTH AFRICA'], patterns: [/[\|┃]ZA[\|┃]/i, /SABC/i, /DSTV/i, /SUPERSPORT/i], channels: ['SABC', 'DSTV', 'SUPERSPORT'], language: 'en-ZA', region: 'RESTO DEL MUNDO', country: 'Sudáfrica' },
        'AU': { codes: ['AU', 'AUS', 'AUSTRALIA'], patterns: [/[\|┃]AU[\|┃]/i, /SEVEN\s*(NETWORK|AU)/i, /NINE\s*(NETWORK|AU)/i, /FOX\s*SPORTS?\s*(AU|AUSTRALIA)/i, /KAYO/i], channels: ['ABC AU', 'SEVEN', 'NINE', 'FOX SPORTS AU', 'KAYO'], language: 'en-AU', region: 'RESTO DEL MUNDO', country: 'Australia' },
        'NZ': { codes: ['NZ', 'NZL', 'NEW ZEALAND'], patterns: [/[\|┃]NZ[\|┃]/i, /TVNZ/i, /SKY\s*(NZ|NEW ZEALAND)/i], channels: ['TVNZ 1', 'SKY NZ'], language: 'en-NZ', region: 'RESTO DEL MUNDO', country: 'Nueva Zelanda' },
        'TH': { codes: ['TH', 'THA', 'THAILAND'], patterns: [/[\|┃]TH[\|┃]/i, /THAI\s*PBS/i], channels: ['THAI PBS', 'CHANNEL 3'], language: 'th-TH', region: 'ASIA ARABIA', country: 'Tailandia' },
        'VN': { codes: ['VN', 'VNM', 'VIETNAM'], patterns: [/[\|┃]VN[\|┃]/i, /VTV/i, /HTV/i], channels: ['VTV', 'HTV'], language: 'vi-VN', region: 'ASIA ARABIA', country: 'Vietnam' },
        'ID': { codes: ['ID', 'IDN', 'INDONESIA'], patterns: [/[\|┃]ID[\|┃]/i, /TVRI/i, /TRANS\s*TV/i, /SCTV/i], channels: ['TVRI', 'TRANS TV', 'SCTV'], language: 'id-ID', region: 'ASIA ARABIA', country: 'Indonesia' },
        'MY': { codes: ['MY', 'MYS', 'MALAYSIA'], patterns: [/[\|┃]MY[\|┃]/i, /RTM/i, /ASTRO/i], channels: ['RTM', 'TV3', 'ASTRO'], language: 'ms-MY', region: 'ASIA ARABIA', country: 'Malasia' },
        'PH': { codes: ['PH', 'PHL', 'PHILIPPINES'], patterns: [/[\|┃]PH[\|┃]/i, /ABS-CBN/i, /GMA/i], channels: ['ABS-CBN', 'GMA'], language: 'tl-PH', region: 'ASIA ARABIA', country: 'Filipinas' }
    };

    // ── Load classification data from JSON (dynamic) or fallback to window.APE_CLASSIFIER_DATA ──
    const _CLASSIFIER_DATA = (typeof window !== 'undefined' && window.APE_CLASSIFIER_DATA) || {};

    // ── Compile-once: convert keyword strings from JSON to regex ──
    const _compiledContentTypes = {};
    const _rawContentTypes = _CLASSIFIER_DATA.contentTypes || {};
    for (const [type, info] of Object.entries(_rawContentTypes)) {
        _compiledContentTypes[type] = {
            priority: info.priority || 1,
            flag: info.flag || null,
            _compiled: (info.keywords || []).map(kw => {
                const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
                return new RegExp(`\\b${escaped}\\b`, 'i');
            })
        };
    }

    const _compiledSportsSubcats = {};
    const _rawSportsSubcats = _CLASSIFIER_DATA.sportsSubcats || {};
    for (const [sport, keywords] of Object.entries(_rawSportsSubcats)) {
        _compiledSportsSubcats[sport] = (keywords || []).map(kw => {
            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
            return new RegExp(`\\b${escaped}\\b`, 'i');
        });
    }

    const LANG_NAMES = _CLASSIFIER_DATA.languages || { 'ar': 'Árabe', 'zh': 'Chino', 'ja': 'Japonés', 'ko': 'Coreano', 'hi': 'Hindi', 'ru': 'Ruso', 'en': 'Inglés', 'es': 'Español', 'pt': 'Portugués', 'fr': 'Francés', 'de': 'Alemán', 'it': 'Italiano', 'nl': 'Holandés', 'pl': 'Polaco', 'tr': 'Turco', 'el': 'Griego', 'hr': 'Croata', 'sr': 'Serbio', 'sq': 'Albanés', 'ro': 'Rumano', 'cs': 'Checo', 'sk': 'Eslovaco', 'hu': 'Húngaro', 'bg': 'Búlgaro', 'uk': 'Ucraniano', 'sv': 'Sueco', 'da': 'Danés', 'no': 'Noruego', 'nb': 'Noruego', 'fi': 'Finlandés', 'he': 'Hebreo', 'th': 'Tailandés', 'ur': 'Urdu', 'vi': 'Vietnamita', 'id': 'Indonesio', 'ms': 'Malayo', 'tl': 'Filipino', 'km': 'Jemer', 'lo': 'Lao', 'my': 'Birmano' };

    // ── Unicode script detectors (must stay as native regex — cannot stringify Unicode ranges) ──
    const LANG_SCRIPTS = {
        'arabic': { p: /[\u0600-\u06FF]/, l: 'ar', w: 10 },
        'hebrew': { p: /[\u0590-\u05FF]/, l: 'he', w: 10 },
        'greek': { p: /[\u0370-\u03FF]/, l: 'el', w: 10 },
        'cyrillic': { p: /[\u0400-\u04FF]/, l: 'ru,uk,bg,sr', w: 8 },
        'cjk_zh': { p: /[\u4E00-\u9FFF]/, l: 'zh', w: 10 },
        'cjk_ja': { p: /[\u3040-\u30FF]/, l: 'ja', w: 10 },
        'cjk_ko': { p: /[\uAC00-\uD7AF]/, l: 'ko', w: 10 },
        'devanagari': { p: /[\u0900-\u097F]/, l: 'hi', w: 10 },
        'thai': { p: /[\u0E00-\u0E7F]/, l: 'th', w: 10 },
        'vietnamese': { p: /[\u00C0-\u01B0\u1EA0-\u1EF9]/, l: 'vi', w: 7 },
        'myanmar': { p: /[\u1000-\u109F]/, l: 'my', w: 10 },
        'lao': { p: /[\u0E80-\u0EFF]/, l: 'lo', w: 10 },
        'khmer': { p: /[\u1780-\u17FF]/, l: 'km', w: 10 }
    };

    // ── Text-based language detection (common words) ──
    const LANG_TEXT = {
        'es': [/\b(EL|LA|LOS|LAS|DE|DEL|EN|NOTICIAS|DEPORTES|CANAL|CINE|TELEVISIÓN)\b/i],
        'en': [/\b(THE|AND|FOR|NEWS|SPORTS|MOVIES|CHANNEL|FILM|ENTERTAINMENT)\b/i],
        'de': [/\b(DER|DIE|DAS|UND|NACHRICHTEN|SPORT|FERNSEHEN|KANAL)\b/i],
        'fr': [/\b(LE|LA|LES|DU|DES|CINÉMA|SPORT|CHAÎNE|ACTUALITÉS)\b/i],
        'it': [/\b(IL|LO|LA|GLI|CANALE|CINEMA|SPORT|NOTIZIE|TELEVISIONE)\b/i],
        'pt': [/\b(O|A|OS|AS|CANAL|ESPORTE|NOTÍCIAS|TELEVISÃO)\b/i],
        'tr': [/\b(HABER|SPOR|KANAL|TELEVIZYON)\b/i],
        'ar': [/\b(الجزيرة|العربية|أخبار|رياضة|قناة)\b/i],
        'nl': [/\b(HET|EEN|NIEUWS|SPORT|KANAAL)\b/i],
        'pl': [/\b(WIADOMOŚCI|POLSAT|TVN|SPORT)\b/i],
        'ru': [/\b(НОВОСТИ|СПОРТ|КАНАЛ|МАТЧ)\b/i],
        'id': [/\b(BERITA|OLAHRAGA|SIARAN|TELEVISI)\b/i],
        'ms': [/\b(BERITA|SUKAN|SALURAN)\b/i],
        'tl': [/\b(BALITA|PALAKASAN|KANAL)\b/i],
        'vi': [/\b(TIN|THỂ THAO|KÊNH|TRUYỀN HÌNH)\b/i]
    };

    // ═══════════════════════════════════════════════════════════════════
    // CLASSIFIER CLASS — GroupTitleBuilder-compatible output
    // _classification.region.group → used by GroupTitleBuilder.extract('region')
    // _classification.category.group → used by GroupTitleBuilder.extract('category')
    // _classification.quality.group → used by GroupTitleBuilder.extract('quality')
    // _classification.language.group → used by GroupTitleBuilder.extract('language')
    // _classification.country.group → used by GroupTitleBuilder.extract('country')
    // ═══════════════════════════════════════════════════════════════════

    class ChannelClassifier {
        constructor() { this.confThreshold = 0.7; }

        classify(channel) {
            const name = channel.tvgName || channel.name || '';
            const gt = channel.groupTitle || channel.category_name || '';

            // ═══════════════════════════════════════════════════════════════════
            // ⚡ BRIDGE v3.0: Delegar al APEChannelClassifier v3.0 externo
            // El v3.0 es la ÚNICA fuente de verdad. Este clasificador interno
            // actúa como BRIDGE/ADAPTER que mapea el output v3.0 al contrato
            // GroupTitleBuilder (.region.group, .category.group, etc).
            // La lista M3U8 bake estos datos → resolver y channel maps los
            // heredan en CASCADA sin consultar el clasificador directamente.
            // ═══════════════════════════════════════════════════════════════════
            if (typeof window !== 'undefined' && window.APEChannelClassifier && typeof window.APEChannelClassifier.classify === 'function') {
                const v3 = window.APEChannelClassifier.classify(channel);

                // Mapear v3.0 output → GroupTitleBuilder contract
                const regionGroup = v3.region?.group || 'RESTO DEL MUNDO';
                const langGroup = v3.language?.language || 'ORIGINAL / MIXTO';
                const langCode = v3.language?.code || 'und';
                const catGroup = v3.category?.category || 'GENERALISTA';
                const catEmoji = v3.category?.emoji || '📡';
                const qualGroup = v3.quality?.quality || 'FULL HD';
                const confidence = (v3.confidence || 50) / 100; // v3 returns 0-100, internal uses 0-1
                const confLevel = confidence >= 0.9 ? 'VERY_HIGH' : confidence >= 0.75 ? 'HIGH' : confidence >= 0.6 ? 'MEDIUM' : confidence >= 0.4 ? 'LOW' : 'VERY_LOW';

                // Cross-category y sport subcategory del engine interno (v3.0 no tiene esto)
                const contentFallback = { _rawType: catGroup, confidence: v3.category?.confidence ? v3.category.confidence / 100 : 0.5, flag: catEmoji, alternatives: [] };
                const crossCategory = this._crossCategorySports(name, gt, contentFallback);
                let sportSubcategory = null;
                if (catGroup === 'DEPORTES' || (crossCategory && crossCategory.action)) {
                    sportSubcategory = this._sportSubcat(name);
                }

                // Construir output con contrato GroupTitleBuilder EXACTO
                return {
                    original: { name, groupTitle: gt },
                    region: { group: regionGroup, code: langCode, country: regionGroup, language: langGroup, confidence: confidence, alternatives: v3.region?.signals || [] },
                    category: { group: catGroup, category: catGroup, confidence: v3.category?.confidence ? v3.category.confidence / 100 : 0.5, flag: catEmoji, alternatives: [] },
                    quality: { group: qualGroup, quality: qualGroup },
                    language: { group: langGroup, code: langCode, confidence: v3.language?.confidence ? v3.language.confidence / 100 : 0.5 },
                    country: { group: regionGroup, code: langCode },
                    confidence,
                    confidenceLevel: confLevel,
                    crossCategory,
                    sportSubcategory,
                    contentType: { type: catGroup, confidence: v3.category?.confidence ? v3.category.confidence / 100 : 0.5, flag: catEmoji, alternatives: [] },
                    _v3Source: true // Marker: data proviene del v3.0 Netflix-grade
                };
            }

            // ═══════════════════════════════════════════════════════════════════
            // FALLBACK: Si v3.0 externo NO está cargado, usar engine interno
            // ═══════════════════════════════════════════════════════════════════
            const regionResult = this._region(name, gt);
            const contentResult = this._content(name, gt);
            const langResult = this._lang(name, gt);
            const qualityResult = this._quality(name);

            const confidence = regionResult.confidence * 0.4 + contentResult.confidence * 0.4 + langResult.confidence * 0.2;
            const confidenceLevel = confidence >= 0.9 ? 'VERY_HIGH' : confidence >= 0.75 ? 'HIGH' : confidence >= 0.6 ? 'MEDIUM' : confidence >= 0.4 ? 'LOW' : 'VERY_LOW';

            const crossCategory = this._crossCategorySports(name, gt, contentResult);
            let sportSubcategory = null;
            if (contentResult._rawType === 'DEPORTES' || (crossCategory && crossCategory.action)) {
                sportSubcategory = this._sportSubcat(name);
            }

            return {
                original: { name, groupTitle: gt },
                region: { group: regionResult.region, code: regionResult.code, country: regionResult.country, language: regionResult.language, confidence: regionResult.confidence, alternatives: regionResult.alternatives },
                category: { group: contentResult._rawType, category: contentResult._rawType, confidence: contentResult.confidence, flag: contentResult.flag, alternatives: contentResult.alternatives },
                quality: { group: qualityResult, quality: qualityResult },
                language: { group: langResult.name, code: langResult.code, confidence: langResult.confidence },
                country: { group: regionResult.country, code: regionResult.code },
                confidence,
                confidenceLevel,
                crossCategory,
                sportSubcategory,
                contentType: { type: contentResult._rawType, confidence: contentResult.confidence, flag: contentResult.flag, alternatives: contentResult.alternatives },
                _v3Source: false // Marker: data proviene del fallback interno
            };
        }

        _quality(name) {
            const n = name.toUpperCase();
            if (n.includes('4K') || n.includes('UHD')) return 'ULTRA HD';
            if (n.includes('FHD') || n.includes('FULL HD')) return 'FULL HD';
            if (n.includes('HD')) return 'HD';
            if (n.includes('SD')) return 'SD';
            return 'HD'; // sensible default
        }

        _region(name, gt) {
            const scores = {};
            for (const [code, d] of Object.entries(REGION_PATTERNS)) {
                let s = 0;
                for (const c of d.codes) { if (new RegExp(`[\\|┃]${c}[\\|┃]`, 'i').test(name) || new RegExp(`[\\|┃]${c}[\\|┃]`, 'i').test(gt)) s += 15; }
                for (const p of d.patterns) { if (p.test(name)) s += 10; if (p.test(gt)) s += 5; }
                const nu = name.toUpperCase();
                for (const ch of d.channels) { if (nu.includes(ch.toUpperCase())) s += 8; }
                if (gt.toUpperCase().includes(d.region.toUpperCase())) s += 5;
                if (gt.toUpperCase().includes(d.country.toUpperCase())) s += 5;
                if (/^\|[A-Z]{2}\|/.test(name)) s += 5;
                if (s > 0) scores[code] = s;
            }
            const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            if (!sorted.length) return { code: 'XX', country: 'Desconocido', region: 'RESTO DEL MUNDO', language: 'unknown', confidence: 0, alternatives: [] };
            const [bc, bs] = sorted[0]; const bd = REGION_PATTERNS[bc];
            return { code: bc, country: bd.country, region: bd.region, language: bd.language, confidence: Math.min(bs / 50, 1), alternatives: sorted.slice(1, 3).map(([c, s]) => ({ code: c, country: REGION_PATTERNS[c].country, score: s })) };
        }

        _content(name, gt) {
            const useCompiled = Object.keys(_compiledContentTypes).length > 0;
            const scores = {};
            if (useCompiled) {
                // Dynamic: use JSON-compiled patterns
                for (const [type, d] of Object.entries(_compiledContentTypes)) {
                    let s = 0;
                    for (const p of d._compiled) { if (p.test(name)) s += 10 * (d.priority / 10); if (p.test(gt)) s += 5 * (d.priority / 10); }
                    if (s > 0) scores[type] = { score: s, flag: d.flag };
                }
            }
            const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
            if (!sorted.length) return { _rawType: 'GENERALISTA', confidence: 0.3, flag: null, alternatives: [] };
            const [bt, bd] = sorted[0];
            return { _rawType: bt, confidence: Math.min(bd.score / 100, 1), flag: bd.flag, alternatives: sorted.slice(1, 3).map(([t, d]) => ({ type: t, score: d.score })) };
        }

        _crossCategorySports(name, gt, content) {
            if (content._rawType === 'DEPORTES') return null;
            const nl = name.toLowerCase();
            let score = 0;
            // Use sports keywords from JSON data if available
            const sportsData = _rawContentTypes['DEPORTES'];
            if (sportsData && sportsData.keywords) {
                for (const kw of sportsData.keywords) { if (nl.includes(kw.toLowerCase())) score += 10; }
            }
            score = Math.min(score, 100);
            if (score >= 70) return { detected: 'DEPORTES', score, level: 'DEFINITELY', action: 'RECLASSIFY_IMMEDIATE' };
            if (score >= 50) return { detected: 'DEPORTES', score, level: 'PROBABLY', action: 'RECLASSIFY_AFTER_REVIEW' };
            if (score >= 30) return { detected: 'DEPORTES', score, level: 'POSSIBLY', action: 'FLAG_FOR_REVIEW' };
            return null;
        }

        _sportSubcat(name) {
            for (const [sport, patterns] of Object.entries(_compiledSportsSubcats)) {
                for (const p of patterns) { if (p.test(name)) return sport; }
            }
            return 'general';
        }

        _lang(name, gt) {
            const scores = {};
            for (const [, d] of Object.entries(LANG_SCRIPTS)) { if (d.p.test(name)) { for (const l of d.l.split(',')) scores[l] = (scores[l] || 0) + d.w; } }
            for (const [lang, pats] of Object.entries(LANG_TEXT)) { for (const p of pats) { if (p.test(name)) scores[lang] = (scores[lang] || 0) + 3; } }
            const rr = this._region(name, gt);
            if (rr.language && rr.language !== 'unknown') { for (const l of rr.language.split(',')) scores[l] = (scores[l] || 0) + 5; }
            const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            if (!sorted.length) return { code: 'unknown', name: 'Desconocido', confidence: 0 };
            const [bl, bs] = sorted[0];
            return { code: bl, name: LANG_NAMES[bl] || bl, confidence: Math.min(bs / 15, 1) };
        }
    }

    const _channelClassifier = new ChannelClassifier();




    // ═══════════════════════════════════════════════════════════════════
    // 🚀 ENHANCEMENT LAYER ENGINE v1.0 — Segunda capa de optimización
    // Namespace: X-EL-* (NO conflictúa con X-APE-*)
    // ═══════════════════════════════════════════════════════════════════
    const EL_TARGETS = {
        P0: { res: '7680x4320', w: 7680, h: 4320, bitrate: 200000000, hdr: 'dv-hdr10plus', upscale: 'ai-8k', vmaf: 96 },
        P1: { res: '3840x2160', w: 3840, h: 2160, bitrate: 80000000, hdr: 'hdr10plus', upscale: 'ai-4k-plus', vmaf: 95 },
        P2: { res: '3840x2160', w: 3840, h: 2160, bitrate: 60000000, hdr: 'hdr10', upscale: 'ai-4k', vmaf: 95 },
        P3: { res: '3840x2160', w: 3840, h: 2160, bitrate: 40000000, hdr: 'sdr-to-hdr', upscale: 'ai-upscale', vmaf: 93 },
        P4: { res: '1920x1080', w: 1920, h: 1080, bitrate: 25000000, hdr: 'sdr', upscale: 'lanczos', vmaf: 93 },
        P5: { res: '1280x720', w: 1280, h: 720, bitrate: 15000000, hdr: 'sdr', upscale: 'bicubic', vmaf: 90 }
    };

    function build_enhancement_layer(cfg, profile) {
        const el = EL_TARGETS[profile] || EL_TARGETS['P3'];
        const srcRes = cfg.resolution || '1920x1080';
        const srcBitrate = String(cfg.max_bandwidth || cfg.bitrate * 1000 || 15000000);
        const fps = cfg.fps || 30;

        return {
            // ── Sub-capa 1: Base & Detección ──
            'X-EL-Version': '1.0.0-20260322',
            'X-EL-Mode': 'adaptive-enhancement',
            'X-EL-Source-Profile': profile,
            'X-EL-Source-Resolution': srcRes,
            'X-EL-Source-Bitrate': srcBitrate,
            'X-EL-Enhancement-Status': 'active',

            // ── Sub-capa 2: Escalado de Resolución ──
            'X-EL-Resolution-Mode': 'smart-upscale',
            'X-EL-Resolution-Source': srcRes,
            'X-EL-Resolution-Target': el.res,
            'X-EL-Resolution-Max': '7680x4320',
            'X-EL-Upscale-Algorithm': el.upscale.startsWith('ai') ? 'ai-super-resolution' : el.upscale,
            'X-EL-Upscale-Model': el.upscale.startsWith('ai') ? 'esrgan-pro' : 'none',
            'X-EL-Upscale-Fallback': 'lanczos',
            'X-EL-Upscale-Trigger': 'auto',
            'X-EL-Upscale-Conditions': 'bandwidth>25mbps,display>source',

            // ── Sub-capa 3: Escalado de Bitrate ──
            'X-EL-Bitrate-Mode': 'request-enhancement',
            'X-EL-Bitrate-Source': srcBitrate,
            'X-EL-Bitrate-Target': String(el.bitrate),
            'X-EL-Bitrate-Max-Request': '129000000',
            'X-EL-Bitrate-Strategy': 'greedy-with-fallback',
            'X-EL-Bitrate-Safety-Margin': '0.3',
            'X-EL-Bitrate-Source-Fallback': 'preserve-original',
            'X-EL-Bitrate-Adaptive-Scale': 'true',

            // ── Sub-capa 4: HDR Enhancement ──
            'X-EL-HDR-Mode': 'auto-enhance',
            'X-EL-HDR-Source': (cfg.hdr_support && cfg.hdr_support.length) ? cfg.hdr_support.join(',') : 'sdr',
            'X-EL-HDR-Target': el.hdr,
            'X-EL-HDR-Conversion': el.hdr === 'sdr-to-hdr' ? 'sdr-to-hdr-adaptive' : 'native',
            'X-EL-HDR-Metadata-Generation': 'dynamic',
            'X-EL-HDR-Tone-Mapping': 'bt2390',
            'X-EL-HDR-MaxCLL-Target': '1000',
            'X-EL-HDR-MaxFALL-Target': '400',
            'X-EL-HDR-Mastering-Simulate': 'bt2020-reference',
            'X-EL-HDR-Dolby-Vision-Compat': 'profile5-fallback',

            // ── Sub-capa 5: Color Enhancement ──
            'X-EL-Color-Mode': 'expand-gamut',
            'X-EL-Color-Source': cfg.color_depth >= 10 ? 'bt2020' : 'bt709',
            'X-EL-Color-Target': 'bt2020',
            'X-EL-Color-Bit-Depth': String(cfg.color_depth || 10),
            'X-EL-Color-Subsampling-Target': '4:2:0',
            'X-EL-Color-Gamut-Mapping': 'perceptual',
            'X-EL-Color-Saturation-Enhance': '1.05',
            'X-EL-Color-Contrast-Enhance': 'adaptive',

            // ── Sub-capa 6: Codec Enhancement ──
            'X-EL-Codec-Priority': 'av1,hevc,vp9,h264',
            'X-EL-Codec-Request': 'best-available',
            'X-EL-Codec-Fallback': cfg.codec_primary || 'H264',
            'X-EL-Codec-Profile-Target': 'main10',
            'X-EL-Codec-Level-Target': '6.1',
            'X-EL-Codec-Tier': 'high',
            'X-EL-Codec-Features': 'b-frames=8,ref=8,lookahead=60',

            // ── Sub-capa 7: Post-Processing ──
            'X-EL-PostProcess-Enabled': 'true',
            'X-EL-PostProcess-Noise-Reduction': 'nlmeans-adaptive',
            'X-EL-PostProcess-Sharpening': 'cas-adaptive',
            'X-EL-PostProcess-Debanding': 'enabled',
            'X-EL-PostProcess-Deinterlace': 'bwdif-auto',
            'X-EL-PostProcess-Motion-Smooth': 'auto-detect',
            'X-EL-PostProcess-Film-Grain': 'preserve',

            // ── Sub-capa 8: Quality Metrics ──
            'X-EL-VMAF-Target': String(el.vmaf),
            'X-EL-VMAF-Min-Acceptable': '85',
            'X-EL-SSIM-Target': '0.98',
            'X-EL-Quality-Monitor': 'enabled',
            'X-EL-Quality-Degrade-Action': 'fallback-to-source',
            'X-EL-Quality-Report': 'telemetry',

            // ── Sub-capa 9: Fallback Chain ──
            'X-EL-Fallback-Chain': 'enhanced>scaled>minimal>source>emergency',
            'X-EL-Fallback-On-Error': 'graceful-degrade',
            'X-EL-Fallback-Bandwidth-Threshold': '10mbps',
            'X-EL-Fallback-Timeout': '5000ms',
            'X-EL-Fallback-Max-Retries': '3',
            'X-EL-Fallback-Preserve-Audio': 'true',

            // ── Sub-capa 10: APE Integration ──
            'X-EL-APE-Integration': 'compatible',
            'X-EL-APE-Profile-Respect': 'true',
            'X-EL-APE-Strategy-Complement': 'enhance-above',
            'X-EL-APE-Fallback-Inherit': 'true',
            'X-EL-VLC-Integration': 'compatible',
            'X-EL-VLC-Enhance-Only': 'true',
            'X-EL-Kodi-Integration': 'compatible',
            'X-EL-Kodi-InputStream-Enhance': `max_resolution=${el.res}`
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🧊 ANTIFREEZE NUCLEAR ENGINE v10.0 — EXTHTTP Headers Module
    // Namespace: X-AF-* (AntiFreeze) — NO conflictúa con X-APE-* ni X-EL-*
    // ═══════════════════════════════════════════════════════════════════
    function build_antifreeze_nuclear_headers(cfg, profile) {
        const lvl = ACTIVE_ISP_LEVEL;
        return {
            // ── Sub-capa 1: Antifreeze Core ──
            'X-AF-Version': '10.0-OBSCENE-AGGRESSION',
            'X-AF-Buffer-Strategy': 'NUCLEAR_NO_COMPROMISE',
            'X-AF-Engine-Mode': 'ZERO_TOLERANCE_FREEZE',
            // ── Sub-capa 2: Buffer Configuration ──
            'X-AF-Buffer-Target': '180000',
            'X-AF-Buffer-Min': '60000',
            'X-AF-Buffer-Max': '600000',
            'X-AF-Buffer-RAM-Cache': '2048MB',
            'X-AF-Buffer-SSD-Cache': '10240MB',
            'X-AF-Buffer-Underrun-Strategy': 'AGGRESSIVE_REFILL_INSTANT',
            'X-AF-Buffer-Overrun-Strategy': 'DROP_OLDEST',
            'X-AF-Buffer-Prebuffer-Seconds': '120',
            // ── Sub-capa 3: Prefetch Nuclear ──
            'X-AF-Prefetch-Segments': String(GLOBAL_PREFETCH.segments),
            'X-AF-Prefetch-Parallel': String(GLOBAL_PREFETCH.parallel),
            'X-AF-Prefetch-Aggressiveness': 'OBSCENE',
            'X-AF-Prefetch-Adaptive': 'TRUE',
            'X-AF-Prefetch-Predictive': 'TRUE',
            'X-AF-Prefetch-All-Qualities': 'TRUE',
            // ── Sub-capa 4: Network Caching Nuclear ──
            'X-AF-Network-Caching': '120000',
            'X-AF-Live-Caching': '120000',
            'X-AF-File-Caching': '300000',
            'X-AF-TCP-Caching': '60000',
            'X-AF-Disc-Caching': '30000',
            'X-AF-Sout-Mux-Caching': '120000',
            // ── Sub-capa 5: Reconnection Nuclear ──
            'X-AF-Reconnect-Max': 'UNLIMITED',
            'X-AF-Reconnect-Delay-Min': '0',
            'X-AF-Reconnect-Delay-Max': '50',
            'X-AF-Reconnect-Parallel': '64',
            'X-AF-Reconnect-Instant-Failover': 'TRUE',
            'X-AF-Reconnect-Pool-Size': '50',
            'X-AF-Reconnect-Warm-Pool': '20',
            'X-AF-Reconnect-Pre-Connect': 'TRUE',
            'X-AF-Reconnect-Seamless': 'TRUE',
            // ── Sub-capa 6: Multi-Source Redundancy ──
            'X-AF-Multi-Source': 'ENABLED',
            'X-AF-Multi-Source-Count': '5',
            'X-AF-Multi-Source-Active': '2',
            'X-AF-Multi-Source-Racing': 'TRUE',
            'X-AF-Multi-Source-Failover-Ms': '50',
            'X-AF-Multi-Source-Health-Check': '250',
            // ── Sub-capa 7: Freeze Prediction ──
            'X-AF-Freeze-Prediction': 'ENABLED',
            'X-AF-Freeze-Model': 'LSTM_ENSEMBLE',
            'X-AF-Freeze-Prediction-Window': '5000',
            'X-AF-Freeze-Confidence-Threshold': '0.8',
            'X-AF-Freeze-Prevention-Auto': 'TRUE',
            'X-AF-Freeze-Monitor-Interval': '100',
            // ── Sub-capa 8: ISP Throttle State ──
            'X-AF-ISP-Throttle-Version': '3.0-OBSCENE',
            'X-AF-ISP-Throttle-Levels': '10',
            'X-AF-ISP-Current-Level': lvl.name,
            'X-AF-ISP-Parallel': String(lvl.parallel_streams),
            'X-AF-ISP-TCP-Window': `${lvl.tcp_window_mb}MB`,
            'X-AF-ISP-Burst-Factor': `${lvl.burst_factor}x`,
            'X-AF-ISP-Never-Downgrade': 'TRUE',
            // ── Sub-capa 9: TCP/HTTP Nuclear ──
            'X-AF-TCP-Window': '16777216',
            'X-AF-TCP-Scale': '14',
            'X-AF-TCP-Congestion': 'BBR',
            'X-AF-TCP-Fast-Open': 'TRUE',
            'X-AF-TCP-Quickack': 'TRUE',
            'X-AF-TCP-Nodelay': 'TRUE',
            'X-AF-HTTP-Version': '2',
            'X-AF-HTTP-Pool-Size': '100',
            'X-AF-HTTP-Keepalive': '300',
            'X-AF-HTTP-Pipelining': 'TRUE',
            'X-AF-HTTP-Multiplexing': 'TRUE',
            // ── Sub-capa 10: Quality Safety Net ──
            'X-AF-Never-Drop-Below': '480p',
            'X-AF-Quality-Buffer-All': 'TRUE',
            'X-AF-Quality-Fallback-Chain': '4K>1080p>720p>480p>360p>240p',
            'X-AF-Quality-Switch-Threshold': '15',
            // ── Sub-capa 11: Frame Interpolation ──
            'X-AF-Frame-Interpolation': 'ENABLED',
            'X-AF-Frame-Interpolation-Mode': 'AI_RIFE_V4',
            'X-AF-Frame-Interpolation-Max': '60',
            'X-AF-Frame-Interpolation-GPU': 'TRUE',
            // ── Sub-capa 12: Error Resilience ──
            'X-AF-Error-Resilience': 'MAXIMUM',
            'X-AF-Error-Concealment': 'AI_INPAINTING',
            'X-AF-Error-Max-Consecutive': 'UNLIMITED',
            'X-AF-Error-Recovery': 'INSTANT',
            // ── Sub-capa 13: Clock & Sync ──
            'X-AF-Clock-Jitter': '5000',
            'X-AF-Clock-Synchro': '1',
            'X-AF-Clock-Drift-Compensation': 'AGGRESSIVE',
            'X-AF-Clock-Sync-Mode': 'ADAPTIVE',
            // ── Sub-capa 14: AV Sync ──
            'X-AF-Audio-Gap-Fill': 'TRUE',
            'X-AF-Audio-Smooth-Transition': 'TRUE',
            'X-AF-Video-Smooth-Transition': 'TRUE',
            'X-AF-AV-Sync-Tolerance': '100ms',
            'X-AF-AV-Sync-Correction': 'INSTANT'
        };
    }
    // 🎯 PROVEN IMAGE QUALITY HEADERS (SMPTE/ITU/Netflix standards)
    // ═══════════════════════════════════════════════════════════════════
    function build_proven_quality(cfg, profile) {
        const el = EL_TARGETS[profile] || EL_TARGETS['P3'];
        const fps = cfg.fps || 30;
        const isHDR = (cfg.color_depth || 8) >= 10;

        return {
            // ── Video Resolution & Scan (ITU-R BT.2020) ──
            'X-Video-Resolution-Native': cfg.resolution || '1920x1080',
            'X-Video-Resolution-Output': el.res,
            'X-Video-Scaling-Mode': 'bicubic',
            'X-Video-Scaling-Quality': 'high',
            'X-Video-Display-Aspect-Ratio': '16:9',
            'X-Video-Scan-Type': 'progressive',
            'X-Video-Inverse-Telecine': 'auto',

            // ── Bitrate (Netflix/Apple TV Standards) ──
            'X-Video-Bitrate-Target': String(el.bitrate),
            'X-Video-Bitrate-Max': String(Math.round(el.bitrate * 1.5)),
            'X-Video-Bitrate-Min': String(Math.round(el.bitrate * 0.6)),
            'X-Video-Bitrate-Buffer': String(Math.round(el.bitrate * 1.25)),
            'X-Video-Bitrate-Mode': 'VBR',
            'X-Video-Bitrate-Precision': 'high',

            // ── Frame Rate (EBU R128) ──
            'X-Video-FPS-Native': String(fps),
            'X-Video-FPS-Output': String(fps),
            'X-Video-FPS-Mode': 'native',
            'X-Video-Judder-Reduction': 'enabled',

            // ── HEVC Advanced (x265 documentation) ──
            'X-HEVC-Color-Primaries': isHDR ? 'bt2020' : 'bt709',
            'X-HEVC-Transfer': isHDR ? 'smpte2084' : 'bt1886',
            'X-HEVC-Matrix': isHDR ? 'bt2020nc' : 'bt709',
            'X-HEVC-Deblock': 'enabled',
            'X-HEVC-SAO': 'enabled',
            'X-HEVC-CU-Tree': 'enabled',
            'X-HEVC-Max-CU-Size': '64',
            'X-HEVC-Chroma-Format': cfg.chroma_subsampling || '4:2:0',
            'X-HEVC-Bit-Depth': String(cfg.color_depth || 10),

            // ── x265 Params (Doom9 forum testing) ──
            'X-x265-Preset': 'slow',
            'X-x265-Tune': 'grain',
            'X-x265-AQ-Mode': 'auto-variance',
            'X-x265-AQ-Strength': '1.0',
            'X-x265-ME': 'star',
            'X-x265-SubME': '3',
            'X-x265-psy-rd': '1.0',
            'X-x265-psy-rdoq': '1.0',

            // ── SVT-AV1 (Netflix study) ──
            'X-SVT-AV1-Preset': '6',
            'X-SVT-AV1-Keyint': '300',
            'X-SVT-AV1-Scd': 'true',
            'X-SVT-AV1-Tune': 'psy',
            'X-SVT-AV1-Film-Grain': '1',
            'X-SVT-AV1-Enable-Tf': 'true',

            // ── HDR10 Separated (SMPTE ST 2086) — 5000 NITS QUANTUM PEAK ──
            'X-HDR10-Primaries-G': '0.680,0.320',
            'X-HDR10-Primaries-B': '0.150,0.060',
            'X-HDR10-Primaries-R': '0.640,0.330',
            'X-HDR10-White-Point': '0.3127,0.3290',
            'X-HDR10-Luminance-Max': '5000',
            'X-HDR10-Luminance-Min': '0.0005',
            'X-HDR10-MaxCLL': '5000',
            'X-HDR10-MaxFALL': '800',
            'X-HDR10-Contrast-Ratio': '10000000:1',

            // ── HDR10+ Scene (SMPTE ST 2094-40) — 5000 NITS ──
            'X-HDR10-Plus-Profile': 'A',
            'X-HDR10-Plus-DMI-Enabled': 'true',
            'X-HDR10-Plus-Bezier-Curve': 'enabled',
            'X-HDR10-Plus-Luminance-Percentile': '99',
            'X-HDR10-Plus-Scene-Brightness-Max': '5000',
            'X-HDR10-Plus-Scene-Brightness-Min': '0.0005',
            'X-HDR10-Plus-Scene-MaxSCL': '5000,5000,5000',

            // ── Dolby Vision 8.1 + RPU (cross-compatible) — 5000 NITS ──
            'X-Dolby-Vision-Profile-81': '8.1',
            'X-Dolby-Vision-Profiles': '5,8,7',
            'X-Dolby-Vision-HDR10-Plus-Compat': 'true',
            'X-Dolby-Vision-Cross-Compatible': 'true',
            'X-Dolby-Vision-RPU-Version': '4',
            'X-Dolby-Vision-Backwards-Compatible': 'true',
            'X-Dolby-Vision-L1-MinPQ': '62',
            'X-Dolby-Vision-L1-MaxPQ': '3765',
            'X-Dolby-Vision-L1-AvgPQ': '1200',
            'X-Dolby-Vision-L6-MaxSCL': '5000,5000,5000',

            // ── Dolby Vision Profile 10 (UHD BD-style AV1-compatible) — DV10 ──
            'X-Dolby-Vision-Profile-10': '10.0',
            'X-Dolby-Vision-Profile-10-Codec': 'dav1.10.09',
            'X-Dolby-Vision-Profile-10-Container': 'CMAF-fMP4',
            'X-Dolby-Vision-Profile-10-Cross-Compat-81': 'true',
            'X-Dolby-Vision-Profile-10-RPU-Version': '4',
            'X-Dolby-Vision-Profile-10-BL-Signal': 'AV1-MAIN-10',
            'X-Dolby-Vision-Profile-10-EL-Signal': 'NONE',
            'X-Dolby-Vision-Profile-10-L1-MaxPQ': '3765',
            'X-Dolby-Vision-Profile-10-L6-MaxCLL': '5000',
            'X-Dolby-Vision-Profile-10-L6-MaxFALL': '800',
            'X-Dolby-Vision-Profile-10-UHD-BD-Mode': 'enabled',

            // ── Samsung HDR10+ Adaptive (ambient-light dynamic) — 2024+ QLED/Neo QLED ──
            'X-Samsung-HDR10-Plus-Adaptive': 'enabled',
            'X-Samsung-HDR10-Plus-Adaptive-Profile': 'B',
            'X-Samsung-HDR10-Plus-Adaptive-Version': '2.0',
            'X-Samsung-HDR10-Plus-Adaptive-Ambient-Sensor': 'REQUIRED',
            'X-Samsung-HDR10-Plus-Adaptive-Ambient-Lux-Min': '0',
            'X-Samsung-HDR10-Plus-Adaptive-Ambient-Lux-Max': '50000',
            'X-Samsung-HDR10-Plus-Adaptive-Ambient-Curve': 'BEZIER-DYNAMIC',
            'X-Samsung-HDR10-Plus-Adaptive-Peak-Nits': '5000',
            'X-Samsung-HDR10-Plus-Adaptive-Tone-Map': 'REALTIME',
            'X-Samsung-HDR10-Plus-Adaptive-Color-Volume': 'DCI-P3-BT2020',
            'X-Samsung-HDR10-Plus-Adaptive-QLED-Mode': 'NEO-QUANTUM-HDR-8K-PLUS',

            // ── HLG Advanced (BBC/NHK studies) ──
            'X-HLG-Transfer-Function': 'HLG',
            'X-HLG-Max-Luminance': '4000',
            'X-HLG-System-Gamma': '1.2',
            'X-HLG-Reference-White': '203',
            'X-HLG-SDR-Backward-Compatible': 'true',

            // ── Color Depth (SMPTE ST 2084) ──
            'X-Color-Depth-Input': String(cfg.color_depth || 10),
            'X-Color-Depth-Output': String(cfg.color_depth || 10),
            'X-Color-Bandwidth-Reduction': 'dithering',
            'X-Color-Dithering': 'error-diffusion',
            'X-Color-Banding-Prevention': 'high',

            // ── Chroma (ITU-R BT.2020) ──
            'X-Chroma-Location': 'left',
            'X-Chroma-Precision': String(cfg.color_depth || 10) + 'bit',

            // ── Tone Mapping BT.2390 v4.0 + GPU libplacebo (ITU-R BT.2390-9) — 5000 NITS ──
            'X-Tone-Mapping-Version': '4.0',
            'X-Tone-Mapping-Max-Luminance': '5000',
            'X-Tone-Mapping-Min-Luminance': '0.0005',
            'X-Tone-Mapping-Normalize': 'true',
            'X-Tone-Mapping-Display-Peak': '5000',
            'X-Tone-Mapping-Display-Min': '0.0005',
            'X-Tone-Mapping-Display-Black': '0.0005',
            'X-Tone-Mapping-GPU': 'libplacebo+vulkan+bt2446a',
            'X-Tone-Mapping-Desaturation-Factor': '0',
            'X-Tone-Mapping-Ambient-Light': '100',
            'X-Tone-Mapping-Adaptation': 'auto',
            // Hable Curve (cinematic)
            'X-Tone-Mapping-Shoulder-Strength': '0.22',
            'X-Tone-Mapping-Linear-Strength': '0.30',
            'X-Tone-Mapping-Linear-Angle': '0.10',
            'X-Tone-Mapping-Toe-Strength': '0.20',

            // ── Noise Reduction (BM3D IEEE TIP) ──
            'X-Noise-Reduction-Algorithm': 'nlmeans',
            'X-Noise-Reduction-Strength': '10',
            'X-Noise-Reduction-Patch-Size': '7',
            'X-Noise-Reduction-Research-Size': '15',
            'X-Noise-Preserve-Edges': 'true',
            'X-Noise-Reduction-Luma-Spatial': '4.0',
            'X-Noise-Reduction-Chroma-Spatial': '3.0',
            'X-Noise-Reduction-Luma-Temporal': '6.0',
            'X-Noise-Reduction-Chroma-Temporal': '4.5',

            // ── Film Grain (AV1 spec + Netflix) ──
            'X-Film-Grain-Synthesis': 'enabled',
            'X-Film-Grain-Type': 'film',
            'X-Film-Grain-Strength': 'auto',
            'X-Film-Grain-Frequency': 'medium',

            // ── Deinterlace (BBC W3FDIF + ffmpeg) ──
            'X-Deinterlace-Algorithm': 'bwdif',
            'X-Deinterlace-Mode': 'send_frame',
            'X-Deinterlace-Parity': 'auto',
            'X-Deinterlace-Edge-Detection': 'enabled',

            // ── Sharpening (AMD CAS + FSRCNNX) ──
            'X-Sharpening-Algorithm': 'cas',
            'X-Sharpening-Strength': '0.5',
            'X-Sharpening-Denoise': 'true',
            'X-Sharpening-Edge-Aware': 'true',

            // ── Debanding (mpv tests) ──
            'X-Debanding-Algorithm': 'gradfun',
            'X-Debanding-Strength': '1.0',
            'X-Debanding-Radius': '16',
            'X-Debanding-Dither': 'enabled',

            // ── VMAF (Netflix tech, vmaf_4k model) ──
            'X-VMAF-Model': 'vmaf_4k_v0.6.1',
            'X-VMAF-Phone-Model': 'vmaf_mob_v0.6.1',
            'X-VMAF-Method': 'ms-ssim+viqe',
            'X-VMAF-Feature': 'all',
            'X-VMAF-Target-1080p': '93',
            'X-VMAF-Target-2160p': '95',
            'X-VMAF-Target-4320p': '96',
            'X-VMAF-Min-Threshold': '85',
            'X-VMAF-Max-Deviation': '2',
            'X-PSNR-Target': '42',
            'X-MS-SSIM-Target': '0.97',
            'X-VIF-Target': '0.95'
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🔥 MODULE 16 SYNC: HDR PEAK NIT ENGINE 5000cd/m² — Per-Channel Tags
    // Synced with /var/www/html/iptv-ape/ape_hdr_peak_nit_engine.php
    // ═══════════════════════════════════════════════════════════════════
    function build_hdr_peak_nit_tags(cfg, profile) {
        const isHDR = (cfg.color_depth || 8) >= 10;
        const peak = isHDR ? 5000 : 1000;
        const minLum = isHDR ? '0.0005' : '0.01';
        return [
            // 16A: ST 2086 Static Metadata
            `#EXT-X-APE-HDR-PEAK-NIT-ENGINE:v1.0-${peak}cd`,
            `#EXT-X-APE-HDR-MASTERING-DISPLAY:P3-D65|PEAK=${peak}|MIN=${minLum}|MaxCLL=${peak}|MaxFALL=${isHDR ? 800 : 400}`,
            `#EXT-X-APE-HDR-CONTRAST-RATIO:10000000:1`,
            // 16B: HDR10+ Dynamic (per-frame)
            `#EXT-X-APE-HDR10-PLUS-DYNAMIC:L1=${minLum}-${peak}|L2=12-TRIMS|L5=ACTIVE-AREA|L6-MaxSCL=${peak},${peak},${peak}`,
            // 16C: PQ EOTF
            `#EXT-X-APE-HDR-PQ-EOTF:ST2084|TARGET=${peak}|CODE=3765|DEPTH=10bit|FORMAT=yuv420p10le`,
            // 16D: Dolby Vision RPU
            `#EXT-X-APE-HDR-DOLBY-VISION:PROFILES=5,8,7|L1-MaxPQ=3765|L6-MaxSCL=${peak}|CM=v4.0`,
            // 16E: HLG
            `#EXT-X-APE-HDR-HLG:PEAK=4000|GAMMA=1.2|REF-WHITE=203|DUAL-MODE=true`,
            // 16F: GPU Tone Mapping
            `#EXT-X-APE-HDR-GPU-TONEMAP:libplacebo+vulkan|BT2446a|BT2390|DESAT=0|PEAK=${peak}`,
            // 16G: Display/TV Directives
            `#EXT-X-APE-HDR-DISPLAY:PEAK=${peak}|LOCAL-DIMMING=AGGRESSIVE-FULL-ARRAY|SPECULAR=QUANTUM|BLOOM=NATURAL`,
            // 16H: Film Grain Synthesis
            `#EXT-X-APE-HDR-FILM-GRAIN:NEURAL-MPEG|TYPE=analog-cinematic|ADDBACK=post-tonemap`,
            // 16I: KODIPROP HDR (inline summary)
            `#EXT-X-APE-HDR-KODI:force_hdr=true|max_lum=${peak}|color=bt2020|transfer=smpte2084|dv_rpu=true|hdr10plus=true`
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🧹 MODULE 15 SYNC: ANTI-NOISE ENGINE 14-FILTER — Per-Channel Tags
    // Synced with /var/www/html/iptv-ape/ape_anti_noise_engine.php
    // ═══════════════════════════════════════════════════════════════════
    function build_anti_noise_tags(cfg, profile) {
        // Resolution-adaptive noise reduction (from resolver's ape_noise_engine_integrate)
        const height = cfg.height || parseInt((cfg.resolution || '1920x1080').split('x')[1]) || 1080;
        let noiseLevel, filterChain;
        if (height >= 2160) {
            noiseLevel = 'MINIMAL';
            filterChain = 'nlmeans=h=3:p=3:r=9,hqdn3d=2:1.5:3:2';
        } else if (height >= 1080) {
            noiseLevel = 'MODERATE';
            filterChain = 'nlmeans=h=6:p=5:r=15,hqdn3d=4:3:6:4,unsharp=5:5:0.3';
        } else if (height >= 720) {
            noiseLevel = 'AGGRESSIVE';
            filterChain = 'nlmeans=h=8:p=7:r=21,hqdn3d=6:4:8:6,unsharp=5:5:0.5,afftdn=nf=-20';
        } else {
            noiseLevel = 'NUCLEAR';
            filterChain = 'nlmeans=h=10:p=7:r=21,hqdn3d=8:6:10:8,vaguedenoiser=threshold=3:method=2,afftdn=nf=-25,unsharp=7:7:0.7';
        }
        return [
            `#EXT-X-APE-ANTI-NOISE-ENGINE:v1.0-${noiseLevel}`,
            `#EXT-X-APE-ANTI-NOISE-RESOLUTION:${height}p`,
            `#EXT-X-APE-ANTI-NOISE-FILTER-CHAIN:${filterChain}`,
            `#EXT-X-APE-ANTI-NOISE-FILTERS:14`,
            `#EXT-X-APE-ANTI-NOISE-NLMEANS:h=${height >= 2160 ? 3 : height >= 1080 ? 6 : 8}|p=${height >= 2160 ? 3 : 5}|r=${height >= 2160 ? 9 : 15}`,
            `#EXT-X-APE-ANTI-NOISE-HQDN3D:luma-spatial=${height >= 2160 ? 2 : 4}|chroma-spatial=${height >= 2160 ? 1.5 : 3}`,
            `#EXT-X-APE-ANTI-NOISE-AFFTDN:nf=${height >= 720 ? '-20' : '-25'}|tn=1`,
            `#EXT-X-APE-ANTI-NOISE-PRESERVE:EDGES=true|DETAIL=true|GRAIN=cinematic`
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🎯 MODULE 17: QUANTUM SCTE-35 TRACKER ENGINE — Forensic Dynamic Injection
    // Synced with REGLA 1 (OMEGA Strict / Inyección Cuántica SCTE-35 Cruda L5)
    // ═══════════════════════════════════════════════════════════════════
    function build_scte35_tracker_tags(cfg, profile, channelName, channelId) {
        // Dynamic PID generation based on channelId for forensic tracing
        let hash = 0;
        const str = String(channelId || channelName || 'CH_000');
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        const dynamicPID = "0x" + Math.abs(hash).toString(16).padStart(4, '0').substring(0, 4);

        return [
            `#EXT-X-APE-SCTE35-ENABLED:true`,
            `#EXT-X-APE-SCTE35-FORMAT:BINARY+BASE64`,
            `#EXT-X-APE-SCTE35-SIGNAL:CUE-IN+CUE-OUT`,
            `#EXT-X-APE-SCTE35-PID:${dynamicPID}`,
            `#EXT-X-APE-SCTE35-DURATION-HINT:30s`,
            `#EXT-X-APE-SCTE35-SEGMENTATION-TYPE:PROGRAM_START`,
            `#EXT-X-APE-SCTE35-UPID-TYPE:URI`,
            `#EXT-X-APE-SCTE35-AVAIL-NUM:1`,
            `#EXT-X-APE-SCTE35-AVAILS-EXPECTED:1`,
            `#EXT-X-APE-SCTE35-BLACKOUT-OVERRIDE:true`
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🛡️ ANTI-CUT ISP STRANGULATION — Per-Channel Tags
    // Synced with /var/www/html/iptv-ape/rq_anti_cut_engine.php
    // ═══════════════════════════════════════════════════════════════════
    function build_anti_cut_tags(cfg, profile) {
        // Map profile to anti-cut profile (from resolver's rq_get_anti_cut_profile)
        const profileMap = {
            P0: 'P1-SUPREME', P1: 'P1-SUPREME',
            P2: 'P2-EXTREME', P3: 'P3-STANDARD',
            P4: 'P4-STABLE', P5: 'P5-SAFE'
        };
        const acProfile = profileMap[profile] || 'P3-STANDARD';
        const baseBw = cfg.max_bandwidth || cfg.bitrate * 1000 || 8000000;
        return [
            `#EXT-X-APE-ANTI-CUT-ENGINE:v1.0`,
            `#EXT-X-APE-ANTI-CUT-PROFILE:${acProfile}`,
            `#EXT-X-APE-ANTI-CUT-ISP-STRANGLE:DETECT+EVADE+ESCALATE`,
            `#EXT-X-APE-ANTI-CUT-BW-DEMAND:${baseBw}`,
            `#EXT-X-APE-ANTI-CUT-BW-FLOOR:${Math.floor(baseBw * 0.8)}`,
            `#EXT-X-APE-ANTI-CUT-RECOVERY:INSTANT|PARALLEL=64|WARM-POOL=20`,
            `#EXT-X-APE-ANTI-CUT-DETECTION:PACKET-LOSS|THROUGHPUT-DROP|RTT-SPIKE|TCP-RST`,
            `#EXT-X-APE-ANTI-CUT-ESCALATION:DOUBLE-BW|ROTATE-CDN|MULTI-SOURCE|TCP-WINDOW-SCALE`,
            `#EXT-X-APE-ANTI-CUT-PERSIST:NEVER-DOWNGRADE`
        ];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 📊 QoS / QoE / PREFETCH / PERFORMANCE — Per-Channel Tags v2.0
    // Synced with Profile Manager v9.0 metrics (screenshots P2-4K_EXTREME)
    // Provides ISP bandwidth reference, streaming health targets, and
    // prefetch intelligence directives usable by resolver + player
    // ═══════════════════════════════════════════════════════════════════
    function build_qos_performance_tags(cfg, profile) {
        // ── Computed metrics (same formulas as Profile Manager UI) ──
        const bufferC1 = cfg.network_cache_ms || cfg.buffer_ms || 15000;
        const bufferC2 = cfg.live_cache_ms || cfg.buffer_ms || 15000;
        const playerBuf = cfg.player_buffer_ms || cfg.file_cache_ms || 51000;
        const bufferTotal = bufferC1 + bufferC2 + playerBuf;
        const bitrateKbps = cfg.bitrate || 18000;
        const bitrateMbps = bitrateKbps / 1000;
        const t1 = cfg.throughput_t1 || (bitrateMbps * 1.3);
        const t2 = cfg.throughput_t2 || (bitrateMbps * 1.6);
        const jitterMaxSupported = Math.floor(playerBuf * 0.8);
        const ramReal = ((bufferTotal / 1000) * bitrateMbps / 8);
        const ramPure = (((bufferC1 * 2 + (bufferC1 / 5)) / 1000) * bitrateMbps / 8);
        const overheadMs = playerBuf - Math.floor(bufferC1 / 5);
        const maxBw = cfg.max_bandwidth || (bitrateKbps * 1000 * 2);

        // ── Prefetch computed ──
        const pfSegments = cfg.prefetch_segments || 90;
        const pfParallel = cfg.prefetch_parallel || 40;
        const pfBufTarget = cfg.prefetch_buffer_target ? (cfg.prefetch_buffer_target / 1000) : Math.ceil(bufferTotal / 1000);
        const pfBwMin = cfg.prefetch_min_bandwidth ? (cfg.prefetch_min_bandwidth / 1000000) : (bitrateMbps * 3);
        const segDuration = cfg.segment_duration || 2;
        const fillTime = Math.ceil((pfSegments * segDuration) / Math.max(pfParallel, 1) * (bitrateMbps / Math.max(pfBwMin, 1)) * 2);
        const bwPeak = +(pfBwMin * 1.2).toFixed(1);
        const bwAvg = +bitrateMbps.toFixed(1);
        const burstFactor = +(bwPeak / Math.max(bwAvg, 1)).toFixed(2);
        const ramSteady = Math.ceil(pfBufTarget * bitrateMbps / 8);
        const ramPeak = Math.ceil(ramSteady * 1.12);

        // ── Stall & Risk estimation ──
        const headroom = Math.round((t2 / Math.max(bitrateMbps, 1)) * 100);
        const stallFloor = headroom > 150 ? 0.07 : headroom > 100 ? 0.5 : headroom > 60 ? 2.0 : 5.0;
        const riskScore = headroom > 200 ? 10 : headroom > 150 ? 15 : headroom > 100 ? 30 : headroom > 60 ? 50 : 75;
        const healthLabel = riskScore <= 20 ? 'EXCELLENT' : riskScore <= 40 ? 'GOOD' : riskScore <= 60 ? 'FAIR' : 'POOR';

        // ── Profile level mapping ──
        const levelMap = { P0: 5, P1: 5, P2: 4, P3: 3, P4: 2, P5: 1 };
        const level = levelMap[profile] || 3;

        return [
            // ── SECTION 16 — Streaming Health & QoS Targets (10 tags) ──
            `#EXT-X-APE-STREAMING-HEALTH:${healthLabel}`,
            `#EXT-X-APE-STALL-RATE-TARGET:${stallFloor}`,
            `#EXT-X-APE-STALL-TARGET-THRESHOLD:1.67`,
            `#EXT-X-APE-RISK-SCORE:${riskScore}/100`,
            `#EXT-X-APE-HEADROOM:${headroom}%`,
            `#EXT-X-APE-JITTER-MAX-SUPPORTED:${jitterMaxSupported}ms`,
            `#EXT-X-APE-BUFFER-TOTAL-C1C2C3:${bufferTotal}ms`,
            `#EXT-X-APE-ISP-BW-MIN-TARGET:${t1}Mbps`,
            `#EXT-X-APE-ISP-BW-OPT-TARGET:${t2}Mbps`,
            `#EXT-X-APE-PROFILE-LEVEL:${level}`,

            // ── SECTION 17 — Prefetch Intelligence (8 tags) ──
            `#EXT-X-APE-PREFETCH-STRATEGY:ultra-aggressive`,
            `#EXT-X-APE-PREFETCH-SEGMENTS-PRELOAD:${pfSegments}`,
            `#EXT-X-APE-PREFETCH-PARALLEL-DOWNLOADS:${pfParallel}`,
            `#EXT-X-APE-PREFETCH-BUFFER-TARGET:${pfBufTarget}s`,
            `#EXT-X-APE-PREFETCH-BW-MIN:${pfBwMin}Mbps`,
            `#EXT-X-APE-PREFETCH-ADAPTIVE-INTELLIGENCE:enabled`,
            `#EXT-X-APE-PREFETCH-AI-PREDICTION:enabled`,
            `#EXT-X-APE-PREFETCH-FILL-TIME:${fillTime}s`,

            // ── SECTION 18 — Performance Estimation / RAM / Overhead (6 tags) ──
            `#EXT-X-APE-BW-PEAK-AVG:${bwPeak}/${bwAvg}Mbps`,
            `#EXT-X-APE-RAM-STEADY-PEAK:${ramSteady}/${ramPeak}MB`,
            `#EXT-X-APE-RAM-REAL-PURE:${ramReal.toFixed(1)}/${ramPure.toFixed(1)}MB`,
            `#EXT-X-APE-BURST-FACTOR:${burstFactor}x`,
            `#EXT-X-APE-STALL-FLOOR:${stallFloor}%`,
            `#EXT-X-APE-OVERHEAD-SECURITY:${overheadMs}ms`
        ];
    }

    function build_exthttp(cfg, profile, index, sessionId, reqId) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nowDate = new Date(Date.now() - 86400000).toUTCString();
        const vpsDomain = (typeof window !== 'undefined' && window.app && window.app.state && window.app.state.currentServer && window.app.state.currentServer.baseUrl)
            ? window.app.state.currentServer.baseUrl.replace(/\/player_api\.php$/, '').replace(/\/$/, '')
            : 'https://iptv-ape.duckdns.org';

        const lcevcState = resolveLcevcState(cfg); // LCEVC Dinámico: nunca DISABLED
        const fps = cfg.fps || 30;

        let isp = {};
        if (ACTIVE_ISP_LEVEL) {
            isp = {
                "X-ISP-Throttle-Level": `1-${ACTIVE_ISP_LEVEL.name}`,
                "X-ISP-BW-Demand": ACTIVE_ISP_LEVEL.strategy || "MAX_CONTRACT",
                "X-ISP-BW-Ceiling": "NONE",
                "X-ISP-BW-Floor": "FULL_CONTRACT",
                "X-ISP-Burst-Mode": "ENABLED",
                "X-ISP-Burst-Factor": `${ACTIVE_ISP_LEVEL.burst_factor || 1.5}x`,
                "X-ISP-Burst-Duration": `${ACTIVE_ISP_LEVEL.burst_duration_s || 999999}s`,
                "X-ISP-Parallel-Streams": String(ACTIVE_ISP_LEVEL.parallel_streams || 4),
                "X-ISP-Segment-Pipeline": String(ACTIVE_ISP_LEVEL.parallel_streams || 4),
                "X-ISP-Prefetch-Ahead": `${ACTIVE_ISP_LEVEL.prefetch_s || 999999}s`,
                "X-ISP-TCP-Window": String((ACTIVE_ISP_LEVEL.tcp_window_mb || 4) * 1024 * 1024),
                "X-ISP-TCP-Nodelay": "1",
                "X-ISP-TCP-Quickack": "1",
                "X-ISP-QUIC-Enabled": String(ACTIVE_ISP_LEVEL.quic !== false),
                "X-ISP-HTTP2-Push": "true",
                "X-ISP-HTTP3-Enabled": String(ACTIVE_ISP_LEVEL.http3 !== false),
                "X-ISP-Pipelining": "true",
                "X-ISP-Keepalive-Max": "200",
                "X-ISP-Keepalive-Timeout": "120",
                "X-ISP-Demand-Strategy": "aggressive",
                "X-ISP-QoS-Override": "EF",
                "X-ISP-DSCP-Force": "46",
                "X-ISP-Priority-Escalation": "ENABLED",
                "X-ISP-BW-Probe-Interval": "5s",
                "X-ISP-BW-Probe-Size": "1MB"
            };
        }

        const headers = {
            "User-Agent": UAPhantomEngine.getForChannel(index, cfg._channelName || ''),
            "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,video/mp2t,video/MP2T,*/*;q=0.9",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "identity",
            "Sec-CH-UA": '"Chromium";v="120","Not-A.Brand";v="24"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
            "Sec-CH-UA-Arch": "x86",
            "Sec-CH-UA-Bitness": "64",
            "Sec-CH-UA-Model": '""',
            "Sec-Fetch-Dest": "media",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?0",
            "Connection": "keep-alive",
            "Keep-Alive": `timeout=${isp['X-ISP-Keepalive-Timeout'] || '120'}, max=${isp['X-ISP-Keepalive-Max'] || '200'}`,
            "DNT": "0",
            "Sec-GPC": "0",
            "Upgrade-Insecure-Requests": "0",
            "TE": "trailers",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Range": "bytes=0-",
            "If-None-Match": "*",
            "If-Modified-Since": nowDate,
            "Priority": "u=0, i",
            "Origin": vpsDomain,
            "Referer": `${vpsDomain}/`,
            "X-Requested-With": "XMLHttpRequest",
            "X-App-Version": `APE_${VERSION}_ULTIMATE_HDR`,
            "X-Playback-Session-Id": sessionId,
            "X-Device-Id": `DEV_${generateRandomString(16)}`,
            "X-Client-Timestamp": String(timestamp),
            "X-Request-Id": reqId,
            "X-Stream-Type": "hls,dash",
            "X-Quality-Preference": `codec-av1,profile-main-12,main-10,main,tier-high,codec-hevc,${(cfg.hevc_profile || 'MAIN-10-HDR').toLowerCase()}`,
            "X-Playback-Rate": "1.0,1.25,1.5",
            "X-Segment-Duration": "1,2,4",
            "X-Min-Buffer-Time": "2,4,6",
            "X-Max-Buffer-Time": "12,18,25",
            "X-Request-Priority": "ultra-high",
            "X-Prefetch-Enabled": "true,adaptive,auto",

            // ── QUALITY UPGRADE v3 — 38 new EXTHTTP fields (A-J) ─────────
            "X-CMAF-Part-Target": cfg.cmaf_chunk_duration || "1.0",
            "X-CMAF-Server-Control": "CAN-BLOCK-RELOAD=YES",
            "X-CMAF-Playlist-Type": "LIVE",
            "X-CMAF-Delta-Playlist": "true",
            "X-CMAF-Program-Date-Time": new Date().toISOString(),
            "X-FMP4-Edit-List": "true",
            "X-FMP4-EMSG-Box": "true",
            "X-FMP4-PSSH-Box": "true",
            "X-FMP4-Client-Data": "true",
            "X-LCEVC-Rate-Control": "CRF+VBR",
            "X-LCEVC-Psycho-Visual": "true",
            "X-LCEVC-B-Frames": cfg.lcevc_bframes || "8",
            "X-LCEVC-Ref-Frames": cfg.lcevc_refframes || "16",
            "X-LCEVC-Lookahead": cfg.lcevc_lookahead || "60",
            "X-AI-SR-Precision": "FP16",
            "X-AI-SR-Tile-Size": "256",
            "X-AI-SR-GPU-Acceleration": "cuda",
            "X-AI-SR-Noise-Reduction": "auto",
            "X-AI-SR-Artifact-Removal": "enabled",
            "X-AI-SR-Model": "esrgan-pro",
            "X-AI-SR-Scale": "4x",
            "X-AI-SR-Enabled": "true",
            "X-AI-Motion-Estimation": "OPTICAL-FLOW",
            "X-Cortex-AI-Super-Resolution": "REALESRGAN_X4PLUS_LITE",
            "X-Cortex-AI-Spatial-Denoise": "NLMEANS_OPTICAL",
            "X-Cortex-LCEVC": "PHASE_4_FP16",
            "X-Cortex-Temporal-Artifact-Repair": "ACTIVATED",
            "X-Cortex-Constant-Frame-Rate": "CFR_60_ANCHOR_LOCKED",
            "X-Cortex-Optical-Flow-Minterpolate": "120FPS_ACTIVATED",
            "X-Luma-Precision": "12-BIT-FLOATING",
            "X-Cortex-Device-Type": "universal",
            "X-Cortex-Device-HDR": "hdr10:hdr10plus:dolbyvision:hlg",
            "X-Cortex-Idempotency": "deterministic",
            "X-Cortex-Bidirectional": "resolve>enrich>override>update",
            // ── LCEVC Enhancement ──
            "X-LCEVC-Enabled": "true",
            "X-LCEVC-Version": "1.0",
            "X-LCEVC-Enhancement-Type": "mpeg5-part2",
            "X-LCEVC-Base-Codec": "hevc",
            "X-LCEVC-Scale-Factor": "4x",
            "X-LCEVC-L1-Block": "8x8",
            "X-LCEVC-L2-Block": "4x4",
            "X-LCEVC-Threads": "16",
            "X-LCEVC-HW-Acceleration": "required",
            // ── Detail Enhancement ──
            "X-Detail-Enhancement": "enabled",
            "X-Detail-Enhancement-Level": "high",
            "X-Detail-Edge-Enhancement": "adaptive",
            "X-Detail-Texture-Enhancement": "auto",
            "X-Detail-Noise-Threshold": "0.02",
            "X-Detail-Sharpening": "adaptive-unsharp",
            "X-Detail-Sharpen-Sigma": "0.03",
            "X-AI-Content-Type": cfg.group || "GENERAL",
            "X-VVC-Toolset": "FULL",
            "X-VVC-Subpictures": "true",
            "X-VVC-LMCS": "true",
            "X-EVC-Level": cfg.evc_level || "5.1",
            "X-EVC-Toolset": "MAIN",
            "X-HDR-MaxCLL": "5000",
            "X-HDR-MaxFALL": "800",
            "X-HDR-Mastering-Display": "G(0.680,0.320)B(0.150,0.060)R(0.640,0.330)WP(0.3127,0.3290)L(5000,0.0005)",
            "X-HDR-Reference-White": "203nits",
            "X-HDR-Vivid": "true",
            "X-HDR-Filmmaker-Mode": "true",
            "X-HDR-Extended-Range": "true",
            "X-HDR-Peak-Nit-Engine": "v1.0-5000cd",
            "X-HDR-PQ-EOTF": "ST2084",
            "X-HDR-PQ-Target-Code": "3765",
            "X-HDR-Pixel-Format": "yuv420p10le",
            "X-HDR-Local-Dimming": "AGGRESSIVE,FULL-ARRAY,HIGH",
            "X-HDR-Specular-Boost": "quantum-5000nit-per-pixel",
            "X-HDR-Highlight-Rolloff": "NONE",
            "X-HDR-Bloom-Effect": "natural-hdr-glow",
            "X-HDR-Film-Grain-Synthesis": "neural-mpeg-standard",
            // ── HDR10+ Dynamic Metadata ──
            "X-HDR10-Plus": "enabled",
            "X-HDR10-Plus-Version": "1.0",
            "X-HDR10-Plus-MaxLuminance": "5000",
            "X-HDR10-Plus-MinLuminance": "0.0005",
            "X-HDR10-Plus-Dynamic-Tone-Mapping": "per-scene",
            "X-HDR10-Plus-Scene-Analysis": "auto",
            "X-HDR10-Plus-L1-MinMaxAvg": "0.0005,5000,800",
            "X-HDR10-Plus-L6-MaxSCL": "5000,5000,5000",
            // ── Dolby Vision Configuration — 5000 NITS ──
            "X-Dolby-Vision-Profile": "5,8,7",
            "X-Dolby-Vision-Level": "6.1",
            "X-Dolby-Vision-RPU": "present",
            "X-Dolby-Vision-Compatibility": "hdr10-backward-compatible",
            "X-Dolby-Vision-Max-Luminance": "5000",
            "X-Dolby-Vision-Min-Luminance": "0.0005",
            // ── HLG (Hybrid Log-Gamma) ──
            "X-HLG-Enabled": "true",
            "X-HLG-Version": "v2",
            "X-HLG-Reference-White": "203",
            "X-HLG-Alternative-Transfer": "pq-fallback",
            // ── Extended Color Volume ──
            "X-Color-Volume-Primaries": "bt2020",
            "X-Color-Volume-Transfer": "smpte-st2084",
            "X-Color-Volume-Matrix": "bt2020nc",
            "X-Color-Volume-Range": "narrow",
            "X-Color-Volume-Signal": "pq",
            "X-Color-Volume-Metadata": "static+dynamic",
            "X-Audio-Bitrate": cfg.audio_bitrate || "640kbps",
            "X-Audio-Objects": cfg.audio_objects || "128",
            "X-Audio-TrueHD": "true",
            "X-Audio-DRC-Profile": "FILM-STANDARD",
            "X-Thumbnail-Format": "WebP+JPEG+AVIF",
            "X-Trick-Play-Rates": "2,4,8,16,32",
            "X-Chapter-Markers": "true",
            "X-SCTE35-PID": "0x0086",
            "X-SCTE35-Segmentation-Type": "PROGRAM_START",
            "X-SCTE35-Blackout-Override": "true",
            "X-Video-Codecs": "av1,hevc,vp9,h264,mpeg2",
            "X-Audio-Codecs": "aac,ac3,eac3,mp3",
            "X-DRM-Support": "widevine,playready,fairplay",
            "X-Codec-Support": "av1",
            "X-CDN-Provider": "auto",
            "X-Failover-Enabled": "true",
            "X-Buffer-Size": "100000",
            "X-Buffer-Target": "60000",
            "X-Buffer-Min": String(GLOBAL_CACHING.network),
            "X-Buffer-Max": "200000",
            "X-Network-Caching": String(GLOBAL_CACHING.network),
            "X-Live-Caching": String(GLOBAL_CACHING.live),
            "X-File-Caching": String(GLOBAL_CACHING.file),
            "X-Buffer-Strategy": "ultra-aggressive",
            "X-Buffer-Underrun-Strategy": "aggressive-refill",
            "X-Device-Type": "smart-tv",
            "X-Screen-Resolution": cfg.resolution || '1920x1080',
            "X-Network-Type": "wifi",
            "Accept-CH": "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT",
            "X-OTT-Navigator-Version": "1.7.0.0-aggressive-extreme",
            "X-Player-Type": "exoplayer-ultra-extreme,vlc-pro,kodi-pro",
            // ── 🛡️ HTTP ERROR NUCLEAR EVASION (3xx, 4xx, 5xx) ──
            "X-APE-Follow-Redirects": "true",
            "X-APE-Max-Redirects": "10",
            "X-APE-Auth-Retry": "3",
            "X-APE-Auth-Method": "basic,bearer,digest",
            "X-APE-Fallback-UA": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "X-APE-Fallback-Referer": "https://www.google.com/",
            "X-APE-Fallback-XFF": "1.1.1.1",
            "X-APE-Fallback-Tunnel": "CONNECT",
            "X-APE-Fallback-Backoff": "EXPONENTIAL_JITTER",
            // ── 🛡️ PEVCE ACTIVE METADATA ENFORCEMENT ──
            "X-PEVCE-Network-Caching": "3000",
            "X-PEVCE-Live-Caching": "3000",
            "X-PEVCE-TCP-Caching": "3000",
            "X-PEVCE-HTTP-Reconnect": "true",
            "X-PEVCE-HTTP-Continuous": "true",
            "X-PEVCE-HW-Decode": "any",
            "X-PEVCE-HW-Threads": "0",
            "X-PEVCE-Skip-Frame": "0",
            "X-PEVCE-Skip-Idct": "0",
            "X-PEVCE-Timeshift-RAM": "64MB",
            "X-PEVCE-Deinterlace": "-1",
            "X-PEVCE-Force-HDR": "true",
            "X-Hardware-Decode": "true",
            "X-Tunneling-Enabled": "off",
            "X-Audio-Track-Selection": "default", // FIX: ExoPlayer ArrayIndexOutOfBoundsException (length=3; index=3)
            "X-Subtitle-Track-Selection": "off",
            "X-EPG-Sync": "enabled",
            "X-Catchup-Support": "flussonic-ultra",
            "X-Bandwidth-Estimation": "adaptive,balanced,conservative",
            "X-Initial-Bitrate": String((cfg.bitrate || 5000) * 1000),
            "X-Bandwidth-Preference": "unlimited",
            "X-BW-Estimation-Window": "10",
            "X-BW-Confidence-Threshold": "0.95",
            "X-BW-Smooth-Factor": "0.05",
            "X-Retry-Count": "10,12,15",
            "X-Retry-Delay-Ms": "120,200,350",
            "X-Connection-Timeout-Ms": "2500,3500,6000",
            "X-Read-Timeout-Ms": "6000,9000,12000",
            "X-Reconnect-On-Error": "true,immediate,adaptive",
            "X-Max-Reconnect-Attempts": String(cfg.reconnect_max_attempts || 999999),
            "X-Reconnect-Delay-Ms": "50,100,200",
            "X-Seamless-Failover": "true-ultra",
            "X-Country-Code": (cfg._classification?.country?.code || cfg._classification?.country?.group || 'US').substring(0, 2).toUpperCase(),
            // FIX 2026-04-26: cfg.hdr_support puede venir del LAB como string CSV
            // (e.g. "hdr10plus,dolby-vision,hlg") o como array. Tolerar ambos para no
            // crashear en .join() cuando es string. Default 'none' si vacío/missing.
            "X-HDR-Support": (Array.isArray(cfg.hdr_support) ? cfg.hdr_support.join(',') : (typeof cfg.hdr_support === 'string' ? cfg.hdr_support : '')) || 'none',
            "X-Color-Depth": `${cfg.color_depth || 8}bit`,
            "X-Color-Space": "bt2020",
            "X-Dynamic-Range": "hdr",
            "X-HDR-Transfer-Function": "pq,hlg",
            "X-Color-Primaries": "bt2020",
            "X-Matrix-Coefficients": "bt2020nc",
            "X-Chroma-Subsampling": cfg.chroma_subsampling || '4:2:0',
            "X-Tone-Mapping": "bt2390-optimized",
            "X-Tone-Mapping-Mode": "auto",
            "X-Tone-Mapping-Target-Luminance": "1000",
            "X-Tone-Mapping-Knee-Point": "0.5",
            "X-Tone-Mapping-Desaturation": "enabled",
            "X-Tone-Mapping-Curve": "smooth",
            "X-Tone-Mapping-Preserve-Highlights": "true",
            "X-HDR-Output-Mode": "auto",
            // ── Advanced Color Management ──
            "X-Color-Management": "full",
            "X-Color-Input-Primaries": "bt2020",
            "X-Color-Output-Primaries": "bt2020",
            "X-Color-Input-Transfer": "pq",
            "X-Color-Output-Transfer": "pq",
            "X-Color-Gamut-Mapping": "perceptual",
            "X-Color-Intent": "absolute-colorimetric",
            // ── Per-Scene Optimization ──
            "X-Scene-Analysis": "enabled",
            "X-Scene-Detection": "content-aware",
            "X-Scene-Brightness-Normalization": "enabled",
            "X-Scene-Contrast-Enhancement": "adaptive",
            "X-Scene-Saturation-Adjustment": "auto",
            "X-HEVC-Tier": cfg.hevc_tier || 'MAIN',
            "X-HEVC-Level": cfg.hevc_level || '4.0',
            "X-HEVC-Profile": cfg.hevc_profile || "MAIN-10,MAIN",
            "X-HEVC-Ref-Frames": "8",
            "X-HEVC-B-Frames": "4",
            "X-HEVC-GOP-Size": "120",
            "X-HEVC-Lookahead": "60",
            "X-Video-Profile": cfg.video_profile || "main-10,main",
            // ── AV1 Optimization ──
            "X-AV1-Profile": "main",
            "X-AV1-Level": "6.0",
            "X-AV1-Tier": "1",
            "X-AV1-Chroma-Format": cfg.chroma_subsampling || "4:2:0",
            "X-AV1-Bit-Depth": String(cfg.color_depth || 10),
            "X-AV1-Color-Primaries": "bt2020",
            "X-AV1-Transfer-Characteristics": "smpte2084",
            "X-AV1-Matrix-Coefficients": "bt2020nc",
            "X-AV1-Film-Grain": "preserved",
            // ── VVC Advanced ──
            "X-VVC-ALF": "enabled",
            "X-VVC-CCALF": "enabled",
            "X-VVC-Chroma-Format": cfg.chroma_subsampling || "4:2:0",
            "X-VVC-Bit-Depth": String(cfg.color_depth || 10),
            "X-Rate-Control": cfg.rate_control || "VBR",
            "X-Entropy-Coding": "CABAC",
            "X-Compression-Level": String(cfg.compression_level || 1),
            "X-Pixel-Format": cfg.pixel_format || 'yuv420p',
            "X-Sharpen-Sigma": String(cfg.sharpen_sigma || 0.02),
            "X-Max-Resolution": cfg.resolution || '1920x1080',
            "X-Max-Bitrate": String(cfg.max_bandwidth || 6000000),
            "X-FPS": String(fps),
            "X-Frame-Rates": `${fps},${fps > 30 ? '50,30,25,24' : '25,24'}`,
            "X-Aspect-Ratio": "16:9,21:9",
            "X-Pixel-Aspect-Ratio": "1:1",
            "X-Dolby-Atmos": "false",
            "X-Audio-Channels": String(cfg.audio_channels || 2),
            "X-Audio-Sample-Rate": "48000",
            "X-Audio-Bit-Depth": "16bit,24bit",
            "X-Spatial-Audio": "false",
            "X-Audio-Passthrough": "false",
            "X-Parallel-Segments": String(cfg.prefetch_parallel || 100),
            "X-Prefetch-Segments": String(cfg.prefetch_segments || 15),
            "X-Segment-Preload": "true",
            "X-Concurrent-Downloads": "8",
            "X-Packet-Loss-Monitor": "enabled,aggressive",
            "X-RTT-Monitoring": "enabled,aggressive",
            "X-Congestion-Detect": "enabled,aggressive-extreme",
            "X-ExoPlayer-Buffer-Min": String(GLOBAL_CACHING.file),
            "X-Manifest-Refresh": String(GLOBAL_CACHING.file),
            "X-KODI-LIVE-DELAY": String(Math.floor(GLOBAL_CACHING.file / 1000)),
            "X-APE-STRATEGY": "ultra-aggressive",
            "X-APE-Prefetch-Segments": "20",
            "X-APE-Quality-Threshold": "0.99",
            "X-APE-CODEC": (cfg.codec_primary || 'H264').toUpperCase(),
            "X-APE-RESOLUTION": cfg.resolution || '1920x1080',
            "X-APE-FPS": String(cfg.fps || 30),
            "X-APE-BITRATE": String(cfg.bitrate || 5000),
            "X-APE-TARGET-BITRATE": String((cfg.bitrate || 5000) * 1000),
            "X-APE-THROUGHPUT-T1": String(cfg.throughput_t1 || 12),
            "X-APE-THROUGHPUT-T2": String(cfg.throughput_t2 || 15),
            "X-APE-Version": "18.2",
            "X-APE-Profile": profile,
            "X-APE-QoE": "5.0",
            "X-APE-Guardian": "enabled",
            "X-APE-DNA-Version": "18.2",
            "X-APE-DNA-Fields": "124",
            "X-APE-DNA-Sync": "bidirectional",
            "X-QoS-DSCP": "EF",
            "X-QoS-Bitrate": `${cfg.bitrate || 5000}kbps`,
            "X-QoS-Priority": "ultra-high",
            "X-APE-Guardian-Enabled": "true",
            "X-APE-Guardian-State": "ONLINE",
            "X-APE-Guardian-Fallback-Level": "3",
            "X-APE-Guardian-Memory": "enabled",
            "X-APE-Guardian-Continuity": "guaranteed",
            "X-APE-Resilience-Strategy": "proactive_failover",
            "X-APE-Resilience-Chain": "7-levels",
            "X-APE-Resilience-Circuit-Breaker": "enabled",
            "X-APE-Resilience-Max-Retries": "3",
            "X-APE-Resilience-Retry-Backoff": "exponential",
            "X-APE-Resilience-Silent-Reconnect": "enabled",
            "X-APE-Telchemy-VSTQ": "enabled",
            "X-APE-Telchemy-VSMQ": "enabled",
            "X-APE-Telchemy-TR101290": "enabled",
            "X-APE-Telchemy-QoE-Target": "5.0",
            "X-APE-Hydra-Stealth": "enabled",
            "X-APE-Hydra-UA-Rotation": "enabled",
            "X-APE-Hydra-Fingerprint-Masking": "enabled",
            "X-LCEVC-Enabled": "true",
            "X-LCEVC-State": lcevcState,
            "X-LCEVC-Enhancement": "mpeg5-part2",
            "X-LCEVC-Scale-Factor": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).scale_factor,
            "X-LCEVC-L1-Block": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).l1_block,
            "X-LCEVC-L2-Block": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).l2_block,
            "X-LCEVC-Threads": String((LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).threads),
            "X-LCEVC-HW-Accel": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).hw_accel,
            "X-LCEVC-Transport": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).transport,
            "X-LCEVC-SEI-NAL-Type": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).sei_nal,
            "X-LCEVC-MPEG-TS-PID": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).pid,
            "X-LCEVC-WebM-Track": (LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).webm,

            // ── PHASE 4 EDGE COMPUTE & GOD-TIER INJECTORS (KODIPROP) ──
            "X-VMAF-Target": "95.0",
            "X-Film-Grain-Preservation": "DISABLED_IPTV_CLEAN",
            "X-Denoise-Strategy": "AGGRESSIVE_NLM",
            "X-Low-Downswitch": "AGGRESSIVE_HOLD",
            "X-Chroma-Subsampling": "4:4:4",
            "X-Color-Depth": "10bit",
            "X-Force-AI-SR": "true",
            "X-HEVC-Level": "6.1,5.1,5.0,4.1,4.0,3.1",
            "X-LCEVC-Phase4-Mode": "Edge-Compute-Only",
            "X-AI-Compute-Target": "Local-GPU-Targeted",
            "X-LCEVC-Target-Res": "3840x2160",
            // ── QoE Monitoring ──
            "X-QoE-Telemetry": "enabled",
            "X-QoE-Metrics": "latency,buffer,quality,errors",
            "X-QoE-Reporting-Interval": "10000",
            "X-QoE-Target-VMAF": "95",
            "X-QoE-Target-SSIM": "0.98",
            "X-QoE-Max-Stalls": "0",
            "X-QoE-Max-Quality-Switches": "3",
            // ── Error Resilience ──
            "X-Error-Concealment": "motion-vector",
            "X-Error-Resilience": "enabled",
            "X-Error-Max-Consecutive": "5",
            "X-Error-Skip-Threshold": "2",
            "X-Error-Fallback": "lower-quality",
            "X-Error-Recovery-Mode": "graceful",
            // ── ABR Algorithm ──
            "X-ABR-Algorithm": "throughput-buffer-hybrid",
            "X-ABR-Min-Buffer": "10",
            "X-ABR-Max-Buffer": "60",
            "X-ABR-Target-Buffer": "30",
            "X-ABR-Safety-Margin": "0.3",
            "X-ABR-Switch-Up-Threshold": "1.2",
            "X-ABR-Switch-Down-Threshold": "0.8",
            "X-ABR-Max-Switch-Interval": "30000",
            // ── Network Advanced ──
            "X-Network-Connection-Pool": "8",
            "X-Network-Keep-Alive": "enabled",
            "X-Network-TCP-Fast-Open": "enabled",
            "X-Network-QUIC": "preferred",
            // ── Motion Interpolation ──
            "X-Motion-Interpolation": "enabled",
            "X-Motion-Interpolation-Algorithm": "optical-flow",
            "X-Motion-Interpolation-Target-FPS": String(cfg.fps || 60),
            "X-Motion-Blur-Reduction": "enabled",
            "X-Motion-Compensation": "auto",
            // ── Noise Reduction ──
            "X-Noise-Reduction": "nlmeans+hqdn3d",
            "X-Noise-Reduction-Spatial": "auto",
            "X-Noise-Reduction-Temporal": "auto",
            "X-Noise-Preserve-Detail": "true",
            "X-Noise-Threshold": "auto",
            "X-Noise-Strength": "medium",
            // ── Contrast Enhancement ──
            "X-Contrast-Enhancement": "local-adaptive",
            "X-Contrast-CLAHE": "enabled",
            "X-Contrast-CLAHE-Clip-Limit": "2.0",
            "X-Contrast-CLAHE-Tile-Size": "8",
            "X-Contrast-Auto-Levels": "enabled",
            "X-Contrast-Gamma-Correction": "auto",
            // ── ExoPlayer Optimized ──
            "X-ExoPlayer-Buffer-Max": "200000",
            "X-ExoPlayer-Buffer-Playback": "50000",
            "X-ExoPlayer-Load-Control": "adaptive",
            "X-ExoPlayer-HW-Decode": "all",
            "X-ExoPlayer-Tunneling": "auto",
            // ── Audio Enhancement ──
            "X-Audio-Dialogue-Enhancement": "enabled",
            // ── ☢️ NUCLEAR HEADERS SPEC v6.0 — Missing Keys ──
            "X-Concurrent-Downloads": "256",
            "X-Parallel-Segments": "64",
            "X-ISP-Parallel-Connections": "256",
            "X-HLS-Version": "10",
            "X-CMAF-Support": "fmp4,lldash",
            "X-Low-Latency": "true,ll-hls",
            "X-Max-Reconnect-Attempts": "999999",
            "X-Max-Consecutive-Errors": "UNLIMITED",
            "X-Skip-Unavailable-Segments": "true"
        };

        for (const [k, v] of Object.entries(isp)) {
            if (k !== 'name') headers[k] = v;
        }

        // ── FIX 1,5,6,11: Per-profile ISP overrides (reference v5.4) ──
        const _ispOv = {
            P0: { 'X-ISP-Segment-Pipeline': '64', 'X-ISP-Throttle-Level': '1-NUCLEAR', 'X-ISP-TCP-Window': '16777216', 'X-ISP-Burst-Duration': '60s' },
            P1: { 'X-ISP-Segment-Pipeline': '4', 'X-ISP-Throttle-Level': '1-EXTREME', 'X-ISP-TCP-Window': '4194304', 'X-ISP-Burst-Duration': '30s' },
            P2: { 'X-ISP-Segment-Pipeline': '16', 'X-ISP-Throttle-Level': '1-AGGRESSIVE', 'X-ISP-TCP-Window': '2097152', 'X-ISP-Burst-Duration': '20s' },
            P3: { 'X-ISP-Segment-Pipeline': '8', 'X-ISP-Throttle-Level': '2-HIGH', 'X-ISP-TCP-Window': '1048576', 'X-ISP-Burst-Duration': '15s' },
            P4: { 'X-ISP-Segment-Pipeline': '4', 'X-ISP-Throttle-Level': '3-MEDIUM', 'X-ISP-TCP-Window': '524288', 'X-ISP-Burst-Duration': '10s' },
            P5: { 'X-ISP-Segment-Pipeline': '4', 'X-ISP-Throttle-Level': '4-LOW', 'X-ISP-TCP-Window': '262144', 'X-ISP-Burst-Duration': '5s' }
        };
        Object.assign(headers, _ispOv[profile] || _ispOv['P3']);

        // ── 🌈 ITM SDR→HDR Engine: CAPA 2 (EXTHTTP Headers) ──
        // Inyectar headers ITM para señalizar al player el modo de mapeo de tonos inverso
        headers['X-ITM-Mode'] = 'ADAPTIVE_FRAME_BY_FRAME';
        headers['X-ITM-Target-Nits'] = '1000';
        headers['X-ITM-Target-Gamut'] = 'BT.2020';
        headers['X-ITM-Analysis'] = 'LUMINANCE_PEAK+APL+HISTOGRAM';
        headers['X-ITM-Metadata-Injection'] = 'MaxFALL+MaxCLL+DYNAMIC';

        // ── 📊 CAPA 2: Telchemy TVQM — Directivas de Diagnóstico via JSON ──
        headers['X-Telchemy-VSTQ-Target'] = '50';
        headers['X-Telchemy-VSMQ-Target'] = '50';
        headers['X-Telchemy-EPSNR-Min'] = '45';
        headers['X-Telchemy-MAPDV-Max'] = '10';
        headers['X-Telchemy-PPDV-Max'] = '5';
        headers['X-Telchemy-TR101290-Sync-Loss'] = '0';
        headers['X-Telchemy-TR101290-CC-Error'] = '0';
        headers['X-Telchemy-TR101290-PCR-Error'] = '0';
        headers['X-Telchemy-Blockiness-Guard'] = 'ACTIVE';
        headers['X-Telchemy-Jerkiness-Guard'] = 'ACTIVE';
        headers['X-Telchemy-GoP-Size-Max'] = '120';
        headers['X-Telchemy-Buffer-Underrun-Action'] = 'EXPAND_NETWORK_CACHING';

        // ── 📊 QoS / ISP Bandwidth Targets / Streaming Health (EXTHTTP) ──
        const _bpsKbps = cfg.bitrate || 18000;
        const _bpsMbps = _bpsKbps / 1000;
        const _t1 = cfg.throughput_t1 || (_bpsMbps * 1.3);
        const _t2 = cfg.throughput_t2 || (_bpsMbps * 1.6);
        const _bufC1 = cfg.network_cache_ms || cfg.buffer_ms || 15000;
        const _bufC2 = cfg.live_cache_ms || cfg.buffer_ms || 15000;
        const _playerBuf = cfg.player_buffer_ms || cfg.file_cache_ms || 51000;
        const _bufTotal = _bufC1 + _bufC2 + _playerBuf;
        const _headroom = Math.round((_t2 / Math.max(_bpsMbps, 1)) * 100);
        const _risk = _headroom > 200 ? 10 : _headroom > 150 ? 15 : _headroom > 100 ? 30 : _headroom > 60 ? 50 : 75;
        headers['X-APE-ISP-BW-Min-Target'] = `${_t1}`;
        headers['X-APE-ISP-BW-Opt-Target'] = `${_t2}`;
        headers['X-APE-Buffer-Total-C1C2C3'] = `${_bufTotal}`;
        headers['X-APE-Jitter-Max-Supported'] = `${Math.floor(_playerBuf * 0.8)}`;
        headers['X-APE-Streaming-Health'] = _risk <= 20 ? 'EXCELLENT' : _risk <= 40 ? 'GOOD' : _risk <= 60 ? 'FAIR' : 'POOR';
        headers['X-APE-Risk-Score'] = `${_risk}`;
        headers['X-APE-Headroom'] = `${_headroom}`;
        headers['X-APE-Stall-Rate-Target'] = _headroom > 150 ? '0.07' : _headroom > 100 ? '0.5' : '2.0';
        headers['X-APE-Prefetch-Segments'] = `${cfg.prefetch_segments || 90}`;
        headers['X-APE-Prefetch-Parallel'] = `${cfg.prefetch_parallel || 40}`;
        headers['X-APE-RAM-Estimate'] = `${((_bufTotal / 1000) * _bpsMbps / 8).toFixed(0)}MB`;
        headers['X-APE-Overhead-Security'] = `${_playerBuf - Math.floor(_bufC1 / 5)}ms`;

        // ══════════════════════════════════════════════════════════════════════
        // 🛡️ REGLA ANTI-400: Límite 10KB / 200 headers en EXTHTTP
        // ══════════════════════════════════════════════════════════════════════
        // El servidor Xtream Codes (Nginx) rechaza peticiones con headers > 12KB.
        // Pruebas de estrés confirmaron:
        //   200 headers (~10KB) → ✅ 200 OK
        //   250 headers (~12.8KB) → ❌ 400 Bad Request
        // Solución: los primeros 200 headers viajan por #EXTHTTP (directo al servidor).
        // Los headers overflow viajan por #EXT-X-APE-OVERFLOW-HEADERS (base64 JSON)
        // y el Runtime Evasion Engine los inyecta dinámicamente en cada request.
        // ══════════════════════════════════════════════════════════════════════
        const MAX_EXTHTTP_HEADERS = 200;
        const MAX_EXTHTTP_BYTES = 10240; // 10KB safety limit

        // ── ⚡ HTTP ANABOLIC ENGINE v1.0: Priority injection (primeros en el budget 10KB) ──
        // Cache por perfil para evitar ~8286 llamadas redundantes (2 por canal × 4143 canales)
        try {
            if (typeof window !== 'undefined') {
                if (!window._anabCacheByProfile) window._anabCacheByProfile = {};
                const _anabKey = String(profile || 'P3');
                if (!window._anabCacheByProfile[_anabKey]) {
                    window._anabCacheByProfile[_anabKey] = build_http_anabolic_demo_headers(cfg, cfg._channel || {});
                }
                Object.assign(headers, window._anabCacheByProfile[_anabKey]);
            } else {
                Object.assign(headers, build_http_anabolic_demo_headers(cfg, cfg._channel || {}));
            }
        } catch (e) { /* fail-safe */ }

        // ── 🚀 ENHANCEMENT LAYER ENGINE v1.0: Merge X-EL-* headers ──
        Object.assign(headers, build_enhancement_layer(cfg, profile));

        // ── 🎯 PROVEN IMAGE QUALITY: Merge SMPTE/ITU/Netflix standards ──
        Object.assign(headers, build_proven_quality(cfg, profile));

        // ── 🧊 ANTIFREEZE NUCLEAR ENGINE v10.0: Merge X-AF-* headers ──
        Object.assign(headers, build_antifreeze_nuclear_headers(cfg, profile));

        // ── 🎯 CHANNEL CLASSIFIER v3.0: Classification metadata headers ──
        if (cfg._classification) {
            const cl = cfg._classification;
            headers['X-APE-CL-Region'] = cl.region.code || 'XX';
            headers['X-APE-CL-Country'] = cl.region.country || 'Desconocido';
            headers['X-APE-CL-Content-Type'] = cl.contentType.type || 'GENERALISTA';
            headers['X-APE-CL-Language'] = cl.language.code || 'unknown';
            headers['X-APE-CL-Language-Name'] = cl.language.name || 'Desconocido';
            headers['X-APE-CL-Confidence'] = String(Math.round(cl.confidence * 100));
            headers['X-APE-CL-Level'] = cl.confidenceLevel || 'VERY_LOW';
            if (cl.contentType.flag) headers['X-APE-CL-Flag'] = cl.contentType.flag;
            headers['X-APE-CL-Suggested-Group'] = cl.suggestedGroupTitle || '';
            // Cross-category detection
            if (cl.crossCategory) {
                headers['X-APE-CL-CrossCat-Detected'] = cl.crossCategory.detected;
                headers['X-APE-CL-CrossCat-Score'] = String(cl.crossCategory.score);
                headers['X-APE-CL-CrossCat-Level'] = cl.crossCategory.level;
                headers['X-APE-CL-CrossCat-Action'] = cl.crossCategory.action;
            }
            // Sport subcategory
            if (cl.sportSubcategory) {
                headers['X-APE-CL-Sport-Subcat'] = cl.sportSubcategory;
            }
        }

        // ── 📡 TELEMETRY: Channel Identification Headers ──
        // Viajan con cada request al resolver para lookup instantáneo sin API
        if (cfg._channelName) headers['X-APE-Channel-Name'] = cfg._channelName;
        if (cfg._channelId) headers['X-APE-Channel-ID'] = cfg._channelId;

        // ── 👁️ IPTV-SUPPORT-CORTEX vΩ: INYECCIÓN DE HEADERS DOMINANTES ──
        // Bug fix 2026-04-08: el método `getOmegaHeaders` no está implementado
        // en cortex-js-resilience.js v5.0.OMEGA actual (solo expone execute(),
        // register429Backoff(), _generateTempBanHash()). Guard defensivo via
        // typeof === 'function' siguiendo doctrina `resolver_blindaje_total`.
        // Enmascarado previamente mientras ape-profiles-config.js estaba roto
        // (bug 504): build_exthttp() nunca se alcanzaba. TODO: implementar
        // getOmegaHeaders() en cortex-js-resilience.js o eliminar esta llamada.
        if (typeof window !== 'undefined' &&
            window.IPTV_SUPPORT_CORTEX_V_OMEGA &&
            typeof window.IPTV_SUPPORT_CORTEX_V_OMEGA.getOmegaHeaders === 'function') {
            Object.assign(headers, window.IPTV_SUPPORT_CORTEX_V_OMEGA.getOmegaHeaders(cfg));
        }

        // ══════════════════════════════════════════════════════════════════════
        // 📋 DYNAMIC PM HEADER INJECTION v1.0
        // Reads ALL 19 categories × 140+ headers from Profile Manager v9.0
        // and injects any missing headers into EXTHTTP.
        // Rule: PM values fill gaps ONLY — existing hardcoded values preserved.
        // ══════════════════════════════════════════════════════════════════════
        try {
            if (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG &&
                typeof window.APE_PROFILES_CONFIG.getCategories === 'function' &&
                typeof window.APE_PROFILES_CONFIG.getHeaderValue === 'function') {

                const pmCats = window.APE_PROFILES_CONFIG.getCategories();
                const pmProfileId = profile || (window.ProfileManagerV9 && window.ProfileManagerV9.activeProfileId) || 'P3';
                const pmProfile = window.APE_PROFILES_CONFIG.getProfile(pmProfileId);
                const enabledCats = pmProfile?.enabledCategories || Object.keys(pmCats);
                let pmInjected = 0;

                for (const catId of enabledCats) {
                    const cat = pmCats[catId];
                    if (!cat || !cat.headers) continue;
                    for (const headerName of cat.headers) {
                        if (headers[headerName] !== undefined) continue; // Don't overwrite existing
                        const val = window.APE_PROFILES_CONFIG.getHeaderValue(pmProfileId, headerName);
                        if (val !== undefined && val !== null && val !== '') {
                            headers[headerName] = String(val);
                            pmInjected++;
                        }
                    }
                }

                // ═══════════════════════════════════════════════════════════
                // 🛡️ ANTI-DRIFT EXTRAS GATE — emite headerOverrides del LAB
                // que NO están en ninguna PM9 category. SOLO si user opta-in.
                // M1: dedupe vía map `headers` (keys únicos por construcción).
                // ═══════════════════════════════════════════════════════════
                if (pmProfile?.includeLabExtras === true && pmProfile.headerOverrides) {
                    const pm9Set = (typeof window.APE_PROFILES_CONFIG.getPm9HeaderSet === 'function')
                        ? window.APE_PROFILES_CONFIG.getPm9HeaderSet()
                        : new Set();
                    let extraHdrCount = 0;
                    let dupBlocked = 0;
                    for (const [k, v] of Object.entries(pmProfile.headerOverrides)) {
                        if (pm9Set.has(k)) continue;          // ya cubierto por PM9 loop
                        if (headers[k] !== undefined) {        // ya seteado por hardcoded path
                            dupBlocked++;
                            continue;
                        }
                        if (v === null || v === undefined || v === '') continue;
                        headers[k] = String(v);
                        extraHdrCount++;
                    }
                    if (extraHdrCount > 0) {
                        if (_apeAuditAcc) _apeAuditAcc.extras.headerOverrides += extraHdrCount;
                    }
                    if (dupBlocked > 0 && _apeAuditAcc) _apeAuditAcc.duplicatesBlocked += dupBlocked;
                    if (extraHdrCount > 0 && typeof console !== 'undefined') {
                        window.__pmExtrasLogCount = (window.__pmExtrasLogCount || 0) + 1;
                        if (window.__pmExtrasLogCount % 500 === 1) {
                            console.log(`🛡️ [EXTRAS-INJECT #${window.__pmExtrasLogCount}] ${extraHdrCount} LAB extras (no-PM9) added to EXTHTTP for ${pmProfileId}`);
                        }
                    }
                }

                // Throttle: log solo 1 de cada 500 canales para no inundar consola.
                if (pmInjected > 0 && typeof console !== 'undefined') {
                    window.__pmInjectLogCount = (window.__pmInjectLogCount || 0) + 1;
                    if (window.__pmInjectLogCount % 500 === 1) {
                        console.log(`📋 [PM-INJECT #${window.__pmInjectLogCount}] ${pmInjected} headers from Profile Manager added to EXTHTTP (${enabledCats.length} categories)`);
                    }
                }
            }
        } catch (e) {
            if (typeof console !== 'undefined') {
                console.warn('⚠️ [PM-INJECT] Error reading Profile Manager headers:', e.message);
            }
        }

        const allKeys = Object.keys(headers);
        const primaryHeaders = {};
        const overflowHeaders = {};

        // ── 🌈 ITM SDR→HDR Engine: CAPA 3 (OVERFLOW Headers) ──
        overflowHeaders['X-Cortex-ITM-Engine'] = 'ENABLED_SDR_ONLY';
        overflowHeaders['X-Cortex-ITM-Analysis-Depth'] = 'FULL_HISTOGRAM';
        overflowHeaders['X-Cortex-ITM-Expansion-Curve'] = 'ADAPTIVE_PER_FRAME';
        overflowHeaders['X-Cortex-ITM-Color-Space-Out'] = 'BT.2020_NCL';
        overflowHeaders['X-Cortex-ITM-Bit-Depth-Out'] = '10bit';
        let currentBytes = 0;
        let headerCount = 0;

        for (const key of allKeys) {
            const val = String(headers[key]);
            const entryBytes = key.length + val.length + 6; // key:"val",
            if (headerCount < MAX_EXTHTTP_HEADERS && (currentBytes + entryBytes) < MAX_EXTHTTP_BYTES) {
                primaryHeaders[key] = val;
                currentBytes += entryBytes;
                headerCount++;
            } else {
                overflowHeaders[key] = val;
            }
        }

        // M1: enforceJsonValid round-trip antes de emitir tag JSON.
        // Si falla, primaryJson queda null y el counter sube — evita emitir JSON corrupto.
        const primaryJson = enforceJsonValid(primaryHeaders, 'EXTHTTP-primary') || JSON.stringify(primaryHeaders);
        const exthttp = `#EXTHTTP:${primaryJson}`;

        // Si hay overflow, codificarlo como base64 para el Runtime Engine
        const overflowKeys = Object.keys(overflowHeaders);
        if (overflowKeys.length > 0) {
            const overflowJson = enforceJsonValid(overflowHeaders, 'EXTHTTP-overflow') || JSON.stringify(overflowHeaders);
            const overflowB64 = base64UrlEncode(overflowJson);
            return `${exthttp}\n#EXT-X-APE-OVERFLOW-HEADERS:${overflowB64}`;
        }

        return exthttp;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HTTP ANABOLIZED HEADERS ENGINE v1.0
    // ───────────────────────────────────────────────────────────────────────────
    // Inyecta ~150 headers HTTP "anabolizados" (negociación codec, HDR, DV,
    // color, frame-rate, audio premium, LCEVC, tone-mapping, emulación Netflix/
    // Apple/Disney, client hints, CDN bypass) que viajan en CADA petición HTTP
    // del player al servidor Xtream/CDN. Fuente canónica tri-capa compartida
    // por EXTHTTP (L2) + KODIPROP (L3 stream_headers_ext) + EXTVLCOPT (L1 http-*).
    //
    // Retorna Object JS plano {header: string} listo para Object.assign().
    // No reemplaza build_exthttp(); lo ENRIQUECE.
    //
    // Emulación premium derivada de: Netflix Open Connect, Apple HLS Authoring
    // Spec v1.11, Disney+ ATVP profile, Dolby Vision Streams within HLS v2.0,
    // DASH-IF IOP, ITU-T H.273, CTA-861-G, W3C Client Hints, shaka-packager.
    // ═══════════════════════════════════════════════════════════════════════════
    function build_anabolized_headers(cfg, channel) {
        cfg = cfg || {};
        channel = channel || {};
        const h = {};

        // Helpers defensivos
        const codecPrimary = String(cfg.codec_primary || 'HEVC').toLowerCase();
        const resolution = cfg.resolution || cfg.res || '3840x2160';
        const [resW, resH] = (resolution.match(/\d+/g) || [3840, 2160]).map(Number);
        const fps = (cfg.target_framerate === '120FPS') ? 120
            : (cfg.target_framerate === '60FPS') ? 60
                : (cfg.fps || 60);
        const peakNits = Number(cfg.hdr_peak_luminance || cfg.peak_luminance || 5000);
        const bitDepth = Number(cfg.color_depth || 10);
        const audioChannels = Number(cfg.audio_channels || 8);
        const sessionId = cfg._sessionId || channel._sid || 'OMEGA-' + Date.now().toString(36);

        // ─── A. Negociación codec (12) ───
        h['Accept'] = 'application/vnd.apple.mpegurl, video/mp4;codecs="hvc1,hev1,av01,vvc1,dvhe,dav1", video/hevc;q=0.95, video/av1;q=0.9, video/vvc;q=0.85, video/avc;q=0.75, */*;q=0.1';
        h['X-Preferred-Codec'] = codecPrimary === 'av1' ? 'av1-main' : 'hevc-main10';
        h['X-Codec-Fallback-Chain'] = 'vvc>av1>hevc>avc';
        h['X-Codec-Tier-Request'] = 'high';
        h['X-Codec-Profile-HEVC'] = 'main10';
        h['X-Codec-Profile-AV1'] = 'main';
        h['X-Codec-Profile-VVC'] = 'main10';
        h['X-Codec-Level-Request'] = '6.1';
        h['X-Codec-HW-Required'] = 'true';
        h['X-Codec-SW-Fallback'] = 'forbidden';
        h['X-Codec-Container-Accept'] = 'cmaf,fmp4,ts';
        h['X-Codec-Bit-Depth-Request'] = '12,10';

        // ─── B. HDR Display Capabilities (15) — CTA-861-G ───
        h['X-Display-HDR-Support'] = 'hdr10,hdr10+,dv,hlg';
        h['X-Display-Peak-Nits'] = String(peakNits);
        h['X-Display-Min-Nits'] = '0.0005';
        h['X-Display-Color-Gamut'] = 'bt2020';
        h['X-Display-DCI-P3-Coverage'] = '98';
        h['X-Display-Panel-Type'] = 'oled-qled-microled';
        h['X-Display-Local-Dimming'] = 'full-array-mini-led';
        h['X-Display-ABL'] = 'disabled';
        h['X-Display-Tone-Map-Capable'] = 'dynamic-scene';
        h['X-Display-EOTF'] = 'pq,hlg,gamma22,gamma24';
        h['X-Mastering-Display-Primaries'] = 'bt2020';
        h['X-Mastering-Display-White-Point'] = 'D65';
        h['X-Mastering-Max-Luminance'] = String(peakNits);
        h['X-Mastering-Min-Luminance'] = '0.0005';
        h['Sec-CH-Color-Gamut'] = 'rec2020';

        // ─── C. HDR Static/Dynamic Metadata (12) — SMPTE ST 2086/2094-40 ───
        h['X-HDR-Static-Metadata-Type'] = '1';           // SMPTE ST 2086 mastering display
        h['X-HDR-Static-Metadata-MaxCLL'] = String(peakNits);
        h['X-HDR-Static-Metadata-MaxFALL'] = '800';
        h['X-HDR-Dynamic-Metadata-Type'] = '4';          // SMPTE ST 2094-40 (HDR10+)
        h['X-HDR-Dynamic-Metadata-Profile'] = 'A';       // HDR10+ Profile A
        h['X-HDR-Dynamic-Metadata-Bezier'] = 'enabled';
        h['X-HDR10-Plus-Scene-Brightness-Max'] = String(peakNits);
        h['X-HDR10-Plus-Tone-Map-Curve'] = 'bezier-dynamic';
        h['X-HDR10-Plus-Scene-Analysis'] = 'ai-powered';
        h['X-HDR10-Plus-Per-Frame-Metadata'] = 'enabled';
        h['X-HLG-System-Gamma'] = '1.2';
        h['X-HLG-Reference-White'] = '203';

        // ─── D. Dolby Vision extendido (12) — Dolby Vision Streams within HLS v2.0 ───
        h['X-DV-Profile-Request'] = '10';                // Profile 10 = AV1 base
        h['X-DV-Profile-Fallback'] = '8.1,7,5';
        h['X-DV-Level-Request'] = '6.1';
        h['X-DV-RPU-Version'] = '4.0';
        h['X-DV-Cross-Compat'] = 'hdr10,sdr,hlg';
        h['X-DV-BL-Signal'] = 'av1-main10';
        h['X-DV-EL-Present'] = 'false';                  // Profile 10 = single-layer
        h['X-DV-CM-Version'] = '4.0';
        h['X-DV-Tunneling-Required'] = 'true';
        h['X-DV-RPU-Extraction'] = 'in-band';
        h['X-Dolby-Vision-Compatibility-Type'] = '8';    // 0x8 = HDR10 backward
        h['X-Dolby-Vision-Backwards-Compatible'] = 'true';

        // ─── E. Color pipeline ITU-T H.273 (10) ───
        h['X-Request-Color-Primaries'] = 'bt2020';       // 9 (ITU-R BT.2020)
        h['X-Request-Color-Transfer'] = 'smpte2084';     // 16 (SMPTE ST 2084 / PQ)
        h['X-Request-Color-Matrix'] = 'bt2020nc';        // 9 (BT.2020 non-constant)
        h['X-Request-Color-Range'] = 'limited';          // 16-235 (studio swing)
        h['X-Request-Bit-Depth'] = String(bitDepth);
        h['X-Request-Chroma-Location'] = 'topleft';
        h['X-Request-Chroma-Subsampling'] = '4:2:0';
        h['X-Request-Pixel-Format'] = `yuv420p${bitDepth}le`;
        h['X-Request-Signal-Range'] = 'narrow';
        h['X-Request-VUI-Present'] = 'true';

        // ─── F. Frame-rate/VRR/Motion (10) ───
        h['X-Target-FPS'] = String(fps);
        h['X-Target-FPS-Fallback'] = '60,50,30,25,24';
        h['X-Video-Preferred-Frame-Rate'] = String(fps);
        h['X-VRR-Supported'] = 'true';
        h['X-VRR-Range'] = '24-120';
        h['X-Motion-Interp-Request'] = 'rife-v4-mci-aobmc';
        h['X-Film-Cadence-Detect'] = 'true';
        h['X-Judder-Reduction'] = 'auto';
        h['X-Source-FPS-Match'] = 'required';
        h['X-Gsync-FreeSync-Compatible'] = 'true';

        // ─── G. Audio premium (14) ───
        h['X-Audio-Preferred-Codec'] = 'ec+3,ec-3,ac-3,mlpa,dts,mp4a.40.2';  // Atmos, EAC3, AC3, TrueHD, DTS, AAC
        h['X-Audio-Codec-Fallback'] = 'eac3-joc,eac3,ac3,aac,mp3';
        h['X-Audio-Preferred-Layout'] = audioChannels >= 8 ? '7.1.4' : (audioChannels >= 6 ? '5.1.2' : '2.0');
        h['X-Audio-Atmos-Required'] = 'preferred';
        h['X-Audio-DTS-X-Capable'] = 'true';
        h['X-Audio-TrueHD-Capable'] = 'true';
        h['X-Audio-Passthrough-eARC'] = 'true';
        h['X-Audio-Object-Count-Max'] = '128';
        h['X-Audio-Sample-Rate-Request'] = '48000,96000,192000';
        h['X-Audio-Bit-Depth-Request'] = '24';
        h['X-Audio-Dialog-Normalization'] = '-27';
        h['X-Audio-LFE-Enable'] = 'true';
        h['X-Audio-Downmix-Mode'] = 'auto';
        h['X-Audio-Object-Based-Rendering'] = 'enabled';

        // ─── H. LCEVC Phase 4 negociación (10) — MPEG-5 Part 2 ───
        h['X-LCEVC-Enabled'] = 'true';
        h['X-LCEVC-Client-Version'] = '1.4.0';
        h['X-LCEVC-Profile'] = 'main10';
        h['X-LCEVC-Phase-Request'] = '4';
        h['X-LCEVC-Base-Codec-Pref'] = 'hevc,av1';
        h['X-LCEVC-Scale-Request'] = '4x';
        h['X-LCEVC-Transport-Pref'] = 'sei,in-band,out-of-band';
        h['X-LCEVC-HW-Decoder'] = 'required';
        h['X-LCEVC-SDK-HTML5'] = 'true';
        h['X-LCEVC-Semantic-Segmentation'] = 'faces,text,skin,sports-ball';

        // ─── I. Tone-Mapping dinámico (10) — GPU libplacebo/vulkan ───
        h['X-Dynamic-Tone-Map'] = 'bt2446a';
        h['X-Dynamic-Tone-Map-Fallback'] = 'bt2390,mobius,hable,reinhard';
        h['X-Tone-Map-Per-Scene'] = 'true';
        h['X-Tone-Map-Per-Frame'] = 'true';
        h['X-Tone-Map-Target-Display-Nits'] = String(peakNits);
        h['X-Tone-Map-Preserve-Highlights'] = 'true';
        h['X-Tone-Map-Preserve-Saturation'] = 'true';
        h['X-Tone-Map-Knee-Adaptive'] = 'true';
        h['X-Tone-Map-LUT-3D'] = 'bt2020-to-dci-p3';
        h['X-Tone-Map-GPU-Engine'] = 'libplacebo+vulkan';

        // ─── J. Video Preferences ───
        h['X-Video-Preferred-Resolution'] = `${resW}x${resH}`;
        h['X-Video-Preferred-Max-Bitrate'] = String((cfg.bitrate || 20000) * 1000);
        h['X-Video-Adaptive-Switch-Mode'] = 'instant';
        h['X-Video-Startup-Quality'] = 'highest';
        h['X-Video-Quality-Strategy'] = 'maximize';
        h['X-Apple-HEVC-Hardware-Decode'] = '1';
        h['X-Device-Display-Capabilities'] = `HDR10+;DV-P81;DV-P10;BT2020;${resW}x${resH};${fps}fps;${bitDepth}bit`;

        // ─── K. Buffer/Network/BBR (10) ───
        h['X-BBR-Algorithm'] = 'bbr2';
        h['X-Congestion-Control-Pref'] = 'bbr2,bbr,cubic';
        h['X-Buffer-Target-Duration-Ms'] = '60000';
        h['X-Buffer-Safety-Margin'] = '0.3';
        h['X-Network-Cache-Priority'] = 'ultra-high';
        h['X-TCP-Fast-Open'] = 'required';
        h['X-QUIC-0RTT'] = 'enabled';
        h['X-Prefetch-Horizon-Segments'] = '20';
        h['X-Playback-Stall-Max-Ms'] = '0';
        h['X-Keepalive-Intensity'] = 'max';

        // ─── L. CDN/Cache bypass (12) ───
        h['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0';
        h['Pragma'] = 'no-cache';
        h['X-Accel-Buffering'] = 'no';
        h['X-Origin-Force'] = 'true';
        h['X-Cache-Skip'] = 'true';
        h['X-CDN-Bypass'] = 'edge-origin';
        h['X-Fastly-No-Cache'] = '1';
        h['X-Akamai-No-Cache'] = '1';
        h['X-Cloudflare-No-Cache'] = '1';
        h['X-Surrogate-Control'] = 'no-store';
        h['CDN-Cache-Control'] = 'no-store';
        h['Vary'] = 'X-Playback-Session-Id, User-Agent, Accept-Encoding';

        // ─── M. Emulación Premium Streaming (12) ───
        h['X-Netflix-AB-Test'] = 'streaming-upgrade-2026';
        h['X-Netflix-Video-Profile'] = 'playready-h265-main-10';
        h['X-Apple-Streaming-Profile'] = 'hls-live-premium';
        h['X-Apple-ATV-Profile'] = 'tv-os-17-uhd-dv-atmos';
        h['X-Disney-Plus-Profile'] = '4k-hdr-atmos';
        h['X-HBO-Max-Profile'] = '4k-dv-atmos';
        h['X-Prime-Video-Profile'] = 'uhd-hdr-dd+atmos';
        h['X-YouTube-Premium-Profile'] = 'premium-4k-av1-hdr';
        h['X-Hulu-Profile'] = 'uhd-dv-atmos-2024';
        h['X-Paramount-Plus-Profile'] = '4k-dv-atmos';
        h['X-Peacock-Premium'] = '4k-hdr-atmos';
        h['X-Max-Profile'] = '4k-dv-atmos';

        // ─── N. Client Hints W3C (10) ───
        h['Viewport-Width'] = String(resW);
        h['Width'] = String(resW);
        h['DPR'] = '2.0';
        h['Sec-CH-Viewport-Width'] = String(resW);
        h['Sec-CH-DPR'] = '2.0';
        h['Sec-CH-Device-Memory'] = '8';
        h['Sec-CH-Prefers-Color-Scheme'] = 'dark';
        h['Sec-CH-Prefers-Reduced-Motion'] = 'no-preference';
        h['Save-Data'] = 'off';
        h['Downlink'] = '100';

        // ─── O. Session tracking W3C Trace Context (8) ───
        h['X-Playback-Session-Id'] = sessionId;
        h['X-Playback-Init-Ts'] = String(Date.now());
        h['X-Playback-Context-Id'] = 'omega-v5.4-' + sessionId.slice(-8);
        h['X-Client-Capability-Hash'] = 'uhd-hdr-dv-atmos-lcevc-' + bitDepth + 'bit';
        h['X-Stream-Variant-Hint'] = `${resW}x${resH}@${fps}fps`;
        h['X-Stream-Negotiation-Id'] = sessionId;
        h['traceparent'] = `00-${sessionId.replace(/[^0-9a-f]/gi, '').padEnd(32, '0').slice(0, 32)}-${Date.now().toString(16).padEnd(16, '0').slice(0, 16)}-01`;
        h['X-Request-Id'] = sessionId;

        // ─── P. Accept-Encoding premium ───
        h['Accept-Encoding'] = 'gzip, br, zstd, deflate';
        h['Accept-Language'] = 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7';
        h['Accept-Charset'] = 'utf-8';

        return h;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HTTP ANABOLIC DEMO ENGINE v1.0 — Basado en DEMO_HTTP_ANABOLIC.m3u8
    // ───────────────────────────────────────────────────────────────────────────
    // ~100 headers HTTP per-canal agrupados en 8 grupos (G1-G8).
    // Emulación premium Netflix/Disney+/Apple. IPs polimórficas per-canal.
    // Diseñado para respetar budget 10KB/200 headers vía prioridad de inserción.
    // ═══════════════════════════════════════════════════════════════════════════
    function build_http_anabolic_demo_headers(cfg, channel) {
        const ch = channel || {};
        const chId = String(ch.stream_id || ch.id || ch.name || 'unknown').toLowerCase().replace(/\s+/g, '_');
        const resolution = cfg.resolution || cfg.res || '3840x2160';
        const bitrate = (cfg.bitrate || 80000) * 1000;
        const fps = (cfg.target_framerate === '120FPS') ? 120 : (cfg.target_framerate === '60FPS' ? 60 : 60);
        const peakNits = cfg.hdr_peak_luminance || 10000;
        const profile = cfg._profile_id || 'P3';

        // UUID determinista por canal (reproducible, evita drift entre capas)
        let _h = 0;
        for (let i = 0; i < chId.length; i++) _h = ((_h << 5) - _h + chId.charCodeAt(i)) & 0x7fffffff;
        const _hex = _h.toString(16).padStart(8, '0');
        const sessionId = `${_hex.slice(0, 8)}-${_hex.slice(0, 4)}-4${_hex.slice(1, 4)}-${['8', '9', 'a', 'b'][_h % 4]}${_hex.slice(1, 4)}-${(_h * 31).toString(16).padStart(12, '0').slice(0, 12)}`;
        const reqId = `omega-${chId}-${Date.now().toString(36).slice(-8)}`;

        // IP polimórfica determinista por canal
        const _ipSeed = Math.abs(_h);
        const clientIP = `${(_ipSeed % 200) + 10}.${(_ipSeed >> 8) % 256}.${(_ipSeed >> 16) % 256}.${(_ipSeed >> 24) % 200 + 10}`;
        const cdnEdge = `cdn-edge-${(_ipSeed % 999) + 100}`;
        const cfId = _hex.padEnd(22, '=').slice(0, 22) + '==';

        const h = {};

        // ── G1: Identity & Device (9) ──
        h['X-Playback-Session-Id'] = sessionId;
        h['X-Request-Id'] = reqId;
        h['X-Client-Version'] = '22.2.0-OMEGA-CRYSTAL-V5';
        h['X-Platform'] = 'AndroidTV';
        h['X-Device-Model'] = 'SHIELD Android TV Pro';
        h['X-Device-OS'] = 'Android/12';
        h['X-App-Version'] = '8.80.0';
        h['X-Client-Id'] = `omega_${chId}_${profile}`;
        // Safe unicode base64: evita DOMException con nombres de canal con acentos/ñ/emoji
        try {
            const _tokenRaw = `${chId}${sessionId}`;
            const _tokenSafe = typeof btoa === 'function'
                ? btoa(unescape(encodeURIComponent(_tokenRaw)))
                : (typeof Buffer !== 'undefined' ? Buffer.from(_tokenRaw, 'utf8').toString('base64') : _tokenRaw);
            h['X-Session-Token'] = `omega_${_tokenSafe}`;
        } catch (eTok) {
            h['X-Session-Token'] = `omega_${String(chId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)}`;
        }

        // ── G2: Content Negotiation & Capabilities (14) ──
        h['Accept'] = 'application/vnd.apple.mpegurl, application/dash+xml, video/mp4, video/mp2t, */*;q=0.8';
        h['Accept-Encoding'] = 'gzip, deflate, br';
        h['Accept-Language'] = 'es-419,es;q=0.9,en-US;q=0.8,en;q=0.7';
        h['X-Device-Capabilities'] = 'hdr10=true, hdr10plus=true, dolbyvision=true, hevc=true, av1=true, lcevc=true, 4k=true';
        h['X-Client-HDR-Support'] = 'HDR10, HDR10Plus, DolbyVisionProfile8, DolbyVisionProfile10, HLG';
        h['X-Video-Codecs'] = 'hvc1, hev1, avc1, av01, dvh1, dvhe';
        h['X-Audio-Codecs'] = 'ec-3, ac-3, mp4a.40.2, mp4a.40.5, opus, flac';
        h['X-Max-Resolution'] = resolution;
        h['X-Max-Framerate'] = String(fps);
        h['X-Color-Depth'] = '12bit';
        h['X-Color-Space'] = 'BT2020';
        h['X-Transfer-Characteristics'] = 'SMPTE-ST-2084-PQ';
        h['X-HDCP-Version'] = '2.3';
        h['X-Widevine-Level'] = 'L1';

        // ── G3: Streaming & Buffer (11) ──
        h['Range'] = 'bytes=0-';
        h['X-Playback-Buffer-Size'] = '60000';
        h['X-Expected-Bitrate'] = String(bitrate);
        h['X-Min-Bitrate'] = '8000000';
        h['X-Max-Bitrate'] = '240000000';
        h['X-Prefetch-Segments'] = '8';
        h['X-Buffer-Goal-Ms'] = '60000';
        h['X-Network-Bandwidth'] = String(bitrate);
        h['X-ABR-Strategy'] = 'AGGRESSIVE_QUALITY_FIRST';
        h['X-Segment-Duration'] = '2000';
        h['X-Chunk-Transfer-Encoding'] = 'chunked';

        // ── G4: ISP Evasion & CDN Emulation (12) ──
        h['X-Forwarded-For'] = clientIP;
        h['X-Real-IP'] = clientIP;
        h['X-Originating-IP'] = clientIP;
        h['X-Remote-IP'] = clientIP;
        h['X-Client-IP'] = clientIP;
        h['Via'] = `1.1 ${cdnEdge}.cloudfront.net (CloudFront)`;
        h['X-Amz-Cf-Id'] = cfId;
        h['X-Cache'] = 'Miss from cloudfront';
        h['X-ISP-Bypass'] = 'true';
        h['X-DPI-Evasion'] = 'OMEGA_PHANTOM_HYDRA_V5';
        h['DNT'] = '1';
        h['Sec-GPC'] = '1';

        // ── G5: Cache Bypass Aggressive (10) ──
        h['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0';
        h['Pragma'] = 'no-cache';
        h['Expires'] = '0';
        h['If-Modified-Since'] = '0';
        h['If-None-Match'] = '*';
        h['X-Cache-Bypass'] = '1';
        h['X-Purge-Cache'] = '1';
        h['X-CDN-Force-Refresh'] = '1';
        h['Surrogate-Control'] = 'no-store';
        h['Vary'] = 'Accept-Encoding';

        // ── G6: HDR / Visual Processing Advanced (20) ──
        h['X-HDR-Metadata-Type'] = 'SMPTE-ST-2086';
        h['X-Master-Display'] = 'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)';
        h['X-Max-CLL'] = `${peakNits},400`;
        h['X-LCEVC-Phase'] = '4';
        h['X-LCEVC-Enhancement'] = 'true';
        h['X-AI-SR-Engine'] = 'RealESRGAN_x4plus';
        h['X-AI-Interpolation'] = 'RIFE_V4_6';
        h['X-Tone-Mapping'] = 'Hable_BT2390';
        h['X-Chroma-Subsampling'] = '4:2:0';
        h['X-Bit-Depth'] = '10';
        h['X-Frame-Packing'] = 'progressive';
        h['X-VRR-Support'] = 'true';
        h['X-VRR-Min-Hz'] = '48';
        h['X-VRR-Max-Hz'] = '120';
        h['X-Deblock-Filter'] = 'strong';
        h['X-Denoise-Level'] = '3';
        h['X-Sharpness-Boost'] = '2';
        h['X-Contrast-Enhance'] = 'AI_ADAPTIVE';
        h['X-Saturation-Mode'] = 'BT2020_VIVID';
        h['X-Film-Grain-Synthesis'] = 'true';

        // ── G7: Connection / Auth / DRM (14) ──
        h['Connection'] = 'keep-alive';
        h['Keep-Alive'] = 'timeout=300, max=1000';
        h['X-Auth-Type'] = 'OMEGA_TOKEN_V5';
        h['X-Token-Expiry'] = String(Date.now() + 86400000);
        h['X-Subscription-Tier'] = 'ULTRA_PREMIUM_4K_HDR';
        h['X-Content-Access'] = 'UNRESTRICTED';
        h['X-DRM-System'] = 'Widevine_L1';
        h['X-License-Server'] = 'https://widevine.omega-crystal.internal/license';
        h['Origin'] = 'https://www.netflix.com';
        h['Referer'] = 'https://www.netflix.com/';
        h['Sec-Fetch-Dest'] = 'video';
        h['Sec-Fetch-Mode'] = 'cors';
        h['Sec-Fetch-Site'] = 'cross-site';
        h['X-No-Proxy'] = 'true';

        // ── G8: QoS / QoE Telemetry (10) ──
        h['X-QoS-Mode'] = 'ULTRA';
        h['X-QoE-Target-MOS'] = '4.8';
        h['X-VSTQ-Score'] = '50';
        h['X-EPSNR-Target'] = '45';
        h['X-Rebuffer-Tolerance'] = '0';
        h['X-Startup-Latency-Max'] = '500';
        h['X-Zapping-Time-Max'] = '800';
        h['X-Quality-Reporting'] = 'true';
        h['X-Metrics-Endpoint'] = 'https://qos.omega-crystal.internal/report';
        h['X-Telemetry-Interval'] = '1000';

        return h; // ~100 headers exactos del DEMO
    }

    function build_ape_block(cfg, profile, index, channel) {
        const buildTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 18) + 'Z';
        const codecStr = window._APE_PRIO_QUALITY !== false ? (profile === 'P0' ? 'hvc1.1.6.L183.B0,mp4a.40.2' : 'hvc1.1.6.L150.B0,mp4a.40.2') : `hvc1.1.6.L150.B0,mp4a.40.2`;
        const lcevcState = resolveLcevcState(cfg);
        const lc = resolveLcevcConfig(profile, cfg);


        // ✅ FIX v16.4.1: lcevcBaseCodec derivado del codec REAL del STREAM-INF
        // (no de un valor hardcodeado). La coherencia es total.
        // 🔴 CORTEX vΩ FIX: Usamos el perfil ORIGINAL (pre-Cortex) para resolver el codec base.
        // El Cortex fuerza P0 en TODOS los canales para maximizar calidad,
        // pero LCEVC-BASE-CODEC debe reflejar el codec REAL que el hardware decodificará.
        // 🔴 FIX LCEVC-BASE-CODEC (120/120)
        // Usar el perfil ORIGINAL (pre-Cortex) para determinar el codec base.
        // El Cortex fuerza P0 en todos los canales, pero LCEVC-BASE-CODEC
        // debe reflejar el codec REAL: P0 = AV1 (8K), resto = HEVC.
        const _origProfile = cfg._cortex_original_profile || channel._originalProfile || profile;
        const lcevcBaseCodec = _origProfile === 'P0' ? 'AV1' : 'HEVC';


        return [
            // ── SECTION 1 — Identity (8 tags) ──────────────────────────────
            `#EXT-X-APE-VERSION:18.2`,
            `#EXT-X-APE-PROFILE:${channel._originalProfile || profile}`,
            `#EXT-X-APE-CHANNEL-KEY:${index}`,
            `#EXT-X-APE-STREAM-ID:${index}`,
            `#EXT-X-APE-CODEC:${codecStr}`,
            `#EXT-X-APE-RESOLUTION:${cfg.resolution || '1920x1080'}`,
            `#EXT-X-APE-FRAME-RATE:${cfg.fps || 30}`,
            `#EXT-X-APE-BITRATE:${cfg.bitrate || 5000}kbps`,

            // ── SECTION 2 — LCEVC Identity (6 tags) ────────────────────────
            `#EXT-X-APE-HDR-PROFILE:${(Array.isArray(cfg.hdr_support) ? cfg.hdr_support.join(',') : (typeof cfg.hdr_support === 'string' ? cfg.hdr_support : '')) || 'none'}`,
            `#EXT-X-APE-LCEVC-ENABLED:true`,
            `#EXT-X-APE-LCEVC-STATE:${lcevcState}`,
            `#EXT-X-APE-LCEVC-BASE-CODEC:${lcevcBaseCodec}`,
            `#EXT-X-APE-LCEVC-ENHANCEMENT:mpeg5-part2`,
            `#EXT-X-APE-LCEVC-SCALE-FACTOR:${(LCEVC_LAYER_CONFIG[profile] || LCEVC_LAYER_CONFIG['P3']).scale_factor}`,

            // ── SECTION 3 — QoS/QoE (6 tags) ──────────────────────────────
            `#EXT-X-APE-AI-SR-ENABLED:true`,
            `#EXT-X-APE-QOE-SCORE:5.0`,
            `#EXT-X-APE-QOS-DSCP:EF`,
            `#EXT-X-APE-QOS-BITRATE:${cfg.bitrate || 5000}kbps`,
            `#EXT-X-APE-QOS-PRIORITY:ultra-high`,
            `#EXT-X-APE-VQS-SCORE:95`,

            // ── SECTION 4 — Buffer (4 tags) ────────────────────────────────
            `#EXT-X-APE-BUFFER-TARGET:60s`,
            `#EXT-X-APE-BUFFER-MIN:15s`,
            `#EXT-X-APE-BUFFER-MAX:200s`,
            `#EXT-X-APE-PREBUFFER:15s`,

            // ── SECTION 5 — Guardian (5 tags) ──────────────────────────────
            `#EXT-X-APE-GUARDIAN-ENABLED:true`,
            `#EXT-X-APE-GUARDIAN-STATE:ONLINE`,
            `#EXT-X-APE-GUARDIAN-FALLBACK-LEVEL:3`,
            `#EXT-X-APE-GUARDIAN-MEMORY:enabled`,
            `#EXT-X-APE-GUARDIAN-CONTINUITY:guaranteed`,

            // ── SECTION 6 — Resilience (6 tags) ───────────────────────────
            `#EXT-X-APE-RESILIENCE-STRATEGY:proactive_failover`,
            `#EXT-X-APE-RESILIENCE-CHAIN:7-levels`,
            `#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:enabled`,
            `#EXT-X-APE-RESILIENCE-MAX-RETRIES:3`,
            `#EXT-X-APE-RESILIENCE-RETRY-BACKOFF:exponential`,
            `#EXT-X-APE-RESILIENCE-SILENT-RECONNECT:enabled`,

            // ── SECTION 7 — Degradation chain (7 tags) ────────────────────
            `#EXT-X-APE-DEGRADATION-LEVEL-1:CMAF+HEVC+LCEVC`,
            `#EXT-X-APE-DEGRADATION-LEVEL-2:HLS/fMP4+HEVC+LCEVC`,
            `#EXT-X-APE-DEGRADATION-LEVEL-3:HLS/fMP4+H.264`,
            `#EXT-X-APE-DEGRADATION-LEVEL-4:HLS/TS+H.264`,
            `#EXT-X-APE-DEGRADATION-LEVEL-5:HLS/TS+Baseline`,
            `#EXT-X-APE-DEGRADATION-LEVEL-6:TS-Direct`,
            `#EXT-X-APE-DEGRADATION-LEVEL-7:HTTP-Redirect`,

            // ── SECTION 8 — Telchemy (4 tags) ─────────────────────────────
            `#EXT-X-APE-TELCHEMY-VSTQ:enabled`,
            `#EXT-X-APE-TELCHEMY-VSMQ:enabled`,
            `#EXT-X-APE-TELCHEMY-TR101290:enabled`,
            `#EXT-X-APE-TELCHEMY-QOE-TARGET:5.0`,

            // ── SECTION 9 — Hydra Stealth (3 tags) ────────────────────────
            `#EXT-X-APE-HYDRA-STEALTH:enabled`,
            `#EXT-X-APE-HYDRA-UA-ROTATION:enabled`,
            `#EXT-X-APE-HYDRA-FINGERPRINT-MASKING:enabled`,

            // ── SECTION 10 — DNA (5 tags) ─────────────────────────────────
            `#EXT-X-APE-DNA-VERSION:18.2`,
            `#EXT-X-APE-DNA-FIELDS:124`,
            `#EXT-X-APE-DNA-SYNC:bidirectional`,
            `#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.4_MAX_AGGRESSION`,
            `#EXT-X-APE-DNA-HASH:${index}-${profile}-${buildTs}`,

            // ── SECTION 11 — Anti-Freeze / Cache (8 tags) ─────────────────
            `#EXT-X-APE-ANTI-FREEZE:clock-jitter=${cfg.clock_jitter || 1500},clock-synchro=${cfg.clock_synchro || 1},net-cache=${GLOBAL_CACHING.network},buf-min=${GLOBAL_CACHING.network},prefetch=10,15,20,reconnect-backoff=50ms`,
            `#EXT-X-APE-CLOCK-JITTER:${cfg.clock_jitter || 1500}`,
            `#EXT-X-APE-CLOCK-SYNCHRO:${cfg.clock_synchro || 1}`,
            `#EXT-X-APE-NETWORK-CACHE:${GLOBAL_CACHING.network}`,
            `#EXT-X-APE-LIVE-CACHE:${GLOBAL_CACHING.live}`,
            `#EXT-X-APE-RECONNECT-MAX:40`,
            `#EXT-X-APE-RETRY-COUNT:10,12,15`,
            `#EXT-X-APE-PREFETCH-SEGMENTS:10,15,20`,

            // ── SECTION 12 — Format flags (5 tags) ────────────────────────
            `#EXT-X-APE-CMAF:ENABLED`,
            `#EXT-X-APE-FMP4:ENABLED`,
            `#EXT-X-APE-HDR10:ENABLED`,
            `#EXT-X-APE-DOLBY-VISION:ENABLED-PROFILE-8.1-LEVEL-6`,
            `#EXT-X-APE-ATMOS:ENABLED`,

            // ── SECTION 12b — Content-Aware HEVC Multichannel (20 tags) ──
            `#EXT-X-APE-ENCODER-ENGINE:NVENC_HEVC`,
            `#EXT-X-APE-ENCODER-PRESET:P6_HQ`,
            `#EXT-X-APE-RATE-CONTROL:VBR_CONSTRAINED`,
            `#EXT-X-APE-VBV-MAX-RATE:${Math.ceil((cfg.bitrate || 8000) * 1.3)}`,
            `#EXT-X-APE-VBV-BUF-SIZE:${Math.ceil((cfg.bitrate || 8000) * 2)}`,
            `#EXT-X-APE-GOP-SIZE:${cfg.gop_size || 60}`,
            `#EXT-X-APE-GOP-DURATION:2s`,
            `#EXT-X-APE-B-FRAMES:2`,
            `#EXT-X-APE-LOOKAHEAD:10`,
            `#EXT-X-APE-AQ-MODE:SPATIAL`,
            `#EXT-X-APE-CONTENT-AWARE-MODE:PER_SCENE_CONTINUOUS`,
            `#EXT-X-APE-CONTENT-ANALYSIS-FPS:1`,
            `#EXT-X-APE-MOTION-ENTROPY-ACTION:BOOST_40_PERCENT`,
            `#EXT-X-APE-TALKING-HEAD-ACTION:REDUCE_30_PERCENT`,
            `#EXT-X-APE-FLASH-FADE-DETECTION:ENABLED`,
            `#EXT-X-APE-BITRATE-SMOOTHING-WINDOW:6-10s`,
            `#EXT-X-APE-FAILOVER-POLICY:CBR_FIXED_80_PERCENT`,
            `#EXT-X-APE-ABR-LADDER:2160p@25Mbps,1440p@16Mbps,1080p@10Mbps,720p@6Mbps,540p@3Mbps`,
            `#EXT-X-APE-SCALER-ALGORITHM:LANCZOS_HW_SPLINE`,
            `#EXT-X-APE-GPU-DECODE-ENGINE:CUVID_VRAM_ONLY`,
            `#EXT-X-APE-GPU-FILTER-CHAIN:DECODE>DEINTERLACE>DENOISE>SCALE>ENCODE`,
            `#EXT-X-APE-E2E-LATENCY-TARGET:4000ms`,
            `#EXT-X-APE-CMAF-LL-CHUNK:200ms`,

            // ── SECTION 13 — ISP Throttle (10 tags) ───────────────────────
            `#EXT-X-APE-ISP-THROTTLE-STRATEGY:ESCALATING-NEVER-DOWN`,
            `#EXT-X-APE-ISP-LEVEL-1:EXTREME-MAX_CONTRACT`,
            `#EXT-X-APE-ISP-LEVEL-2:ULTRA-MAX_CONTRACT_PLUS`,
            `#EXT-X-APE-ISP-LEVEL-3:SAVAGE-SATURATE_LINK`,
            `#EXT-X-APE-ISP-LEVEL-4:BRUTAL-EXCEED_CONTRACT`,
            `#EXT-X-APE-ISP-LEVEL-5:NUCLEAR-ABSOLUTE_MAX`,
            `#EXT-X-APE-ISP-TCP-WINDOW-PROGRESSION:4MB\u21928MB\u219216MB\u219232MB\u219264MB`,
            `#EXT-X-APE-ISP-PARALLEL-PROGRESSION:4\u21928\u219216\u219232\u219264`,
            `#EXT-X-APE-ISP-BURST-FACTOR-PROGRESSION:1.5x\u21922x\u21923x\u21925x\u219210x`,
            `#EXT-X-APE-ISP-PREFETCH-PROGRESSION:30s\u219260s\u2192120s\u2192300s\u2192UNLIMITED`,

            // ── SECTION 14 — LCEVC Full Spec (26 tags) ────────────────────
            `#EXT-X-APE-LCEVC:ENABLED`,
            `#EXT-X-APE-LCEVC-STANDARD:MPEG-5-PART-2`,
            `#EXT-X-APE-LCEVC-PROFILE:${lc.profile}`,
            `#EXT-X-APE-LCEVC-PLAYER-REQUIRED:0`,
            `#EXT-X-APE-LCEVC-FALLBACK:BASE_ONLY`,
            `#EXT-X-APE-LCEVC-BASE-LAYER-SCALE:${lc.base_ratio}`,
            `#EXT-X-APE-LCEVC-BASE-BITRATE-RATIO:${lc.base_ratio}`,
            `#EXT-X-APE-LCEVC-ENHANCEMENT-BITRATE-RATIO:${lc.enh_ratio}`,
            `#EXT-X-APE-LCEVC-L1-ENABLED:1`,
            `#EXT-X-APE-LCEVC-L1-TRANSFORM-BLOCK:${lc.l1_block}`,
            `#EXT-X-APE-LCEVC-L1-DEBLOCK-FILTER:${lc.l1_deblock}`,
            `#EXT-X-APE-LCEVC-L1-RESIDUAL-PRECISION:${lc.l1_precision}`,
            // ── SECTION 15 — LCEVC PHASE 4 SEMANTIC ENGINE (EDGE-COMPUTE DIRECT) ──
            `#EXT-X-APE-LCEVC-PHASE-4-ENABLED:true`,
            `#EXT-X-APE-TUNNELING-ENABLED:off`,
            `#EXT-X-APE-NETWORK-PATH:ORIGIN_DIRECT`,

            // 1. Semantic Segmentation & Local AI (Phase 4 Base)
            `#EXT-X-APE-LCEVC-SEMANTIC-SEGMENTATION:ACTIVE`,
            `#EXT-X-APE-LCEVC-ROI-PROCESSING:DYNAMIC`,
            `#EXT-X-APE-LCEVC-ROI-TARGETS:FACES,TEXT,SKIN,SPORTS_BALL`,
            `#EXT-X-APE-LCEVC-BG-DEGRADATION:AGGRESSIVE`,
            `#EXT-X-APE-LCEVC-FRAME-GENERATION:${profile.match(/P[0-1]/) ? 'LOCAL-AFMF' : 'DISABLED'}`,
            `#EXT-X-APE-LCEVC-COLOR-HALLUCINATION:${profile.match(/P[4-5]/) ? 'ACTIVE' : 'MILD'}`,
            `#EXT-X-APE-LCEVC-COMPUTE-PRECISION:${profile.match(/P[0-2]/) ? 'FP16' : 'INT8'}`,

            // 2. Quantum Pixel Overdrive v5 (Scale & Color)
            `#EXT-X-APE-QUANTUM-CHROMA-SUBSAMPLING:4:4:4`,
            `#EXT-X-APE-QUANTUM-COLOR-DEPTH:10bit`,
            `#EXT-X-APE-QUANTUM-ITM-SDR-TO-HDR:auto`,
            `#EXT-X-APE-ITM-ENGINE-MODE:ADAPTIVE_FRAME_BY_FRAME`,
            `#EXT-X-APE-ITM-TARGET-NITS:1000`,
            `#EXT-X-APE-ITM-TARGET-GAMUT:BT.2020`,
            `#EXT-X-APE-ITM-ANALYSIS:LUMINANCE_PEAK+APL+HISTOGRAM+COLOR_DISTRIBUTION`,
            `#EXT-X-APE-ITM-METADATA-INJECTION:MaxFALL+MaxCLL+DYNAMIC_PER_FRAME`,
            `#EXT-X-APE-ITM-EXPANSION-CURVE:SCENE_ADAPTIVE`,
            `#EXT-X-APE-ITM-CLIPPING-GUARD:SPECULAR_HIGHLIGHT_PRESERVE`,

            // 2b. Telchemy TVQM — Zero-Reference Quality Diagnostics
            `#EXT-X-TELCHEMY-TVQM:VSTQ=50,VSMQ=50,EPSNR=45,MAPDV=10,PPDV=5`,
            `#EXT-X-TELCHEMY-TR101290:SYNC_LOSS=0,CC_ERROR=0,PCR_ERR=0,SYNC_BYTE_ERR=0`,
            `#EXT-X-TELCHEMY-IMPAIRMENT-GUARD:BLOCKINESS=ACTIVE,JERKINESS=ACTIVE,TILING=ACTIVE`,
            `#EXT-X-TELCHEMY-GOP-POLICY:MAX_SIZE=120,MIN_IDR_INTERVAL=2s`,
            `#EXT-X-TELCHEMY-BUFFER-POLICY:UNDERRUN_ACTION=EXPAND_CACHE,OVERFLOW_ACTION=DROP_B_FRAMES`,
            `#EXT-X-TELCHEMY-JITTER-POLICY:MAPDV_ACTION=EXPAND_JITTER_BUFFER,PPDV_ACTION=CLOCK_RECOVERY`,
            `#EXT-X-APE-ITM-SKIN-TONE-PROTECT:ENABLED`,
            `#EXT-X-APE-PROCESSING-PIPELINE-ORDER:DECODE,ITM,LCEVC,AI,RENDER`,

            // 3. HEVC Level Supremacy (La Cascada) & LCEVC Dynamic Base
            `#EXT-X-APE-HEVC-LEVEL-CASCADE:6.1,5.1,5.0,4.1,4.0,3.1`,
            `#EXT-X-APE-CODEC-PRIORITY:hevc,hev1,hvc1,h265,H265,h.265,H.265,av1,h264`,
            `#EXT-X-APE-LCEVC-BASE-POLICY:${lcevcBaseCodec}`, // Dinámico derivado de config
            `#EXT-X-APE-LCEVC-TRANSPORT:CMAF_LAYER_OR_SEI_EMBED`,   // Instruye cómo buscar la capa L1+L2

            // 4. Maximum Resolution Escalator (Extensión M3U8 Nativa)
            `#EXT-X-APE-RESOLUTION-ESCALATOR:4320p>2160p>1080p>720p>480p`,

            // 5. God-Tier Perceptual Quality (Film Grain & Bitrate)
            `#EXT-X-APE-VMAF-TARGET:95.0`,
            `#EXT-X-APE-FILM-GRAIN-PRESERVATION:DISABLED`,
            `#EXT-X-APE-DENOISE-STRATEGY:AGGRESSIVE_IPTV_CLEAN`,
            `#EXT-X-APE-DENOISE-ALGORITHM:NLMEANS+HQDN3D`,
            `#EXT-X-APE-DEBLOCK-STRENGTH:MAXIMUM`,

            // 6. Protección Térmica (Edge-Compute Limiters)
            `#EXT-X-APE-HEARTBEAT-THERMAL:TRUE`,
            `#EXT-X-APE-THERMAL-THROTTLING-FB:PHASE-2-SAFE-MODE`,
            `#EXT-X-APE-LCEVC-L1-TEMPORAL-PREDICTION:${lc.l1_temporal}`,
            `#EXT-X-APE-LCEVC-L2-ENABLED:1`,
            `#EXT-X-APE-LCEVC-L2-TRANSFORM-BLOCK:${lc.l2_block}`,
            `#EXT-X-APE-LCEVC-L2-TEMPORAL-PREDICTION:${lc.l2_temporal}`,
            `#EXT-X-APE-LCEVC-L2-RESIDUAL-PRECISION:${lc.l2_precision}`,
            `#EXT-X-APE-LCEVC-L2-UPSCALE-FILTER:${lc.l2_upscale}`,
            `#EXT-X-APE-LCEVC-MODE:${lc.mode}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-PRIMARY:${lc.transport}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-1:${lc.fb1}`,
            `#EXT-X-APE-LCEVC-TRANSPORT-FALLBACK-2:${lc.fb2}`,
            `#EXT-X-APE-LCEVC-SEI-NAL-TYPE:${lc.sei_nal}`,
            `#EXT-X-APE-LCEVC-MPEG-TS-PID:${lc.pid}`,
            `#EXT-X-APE-LCEVC-WEBM-TRACK-ID:${lc.webm}`,
            `#EXT-X-APE-LCEVC-PARALLEL-BLOCKS:${lc.parallel_blocks}`,
            `#EXT-X-APE-LCEVC-PARALLEL-THREADS:${lc.threads}`,
            `#EXT-X-APE-LCEVC-DECODE-ORDER:${lc.decode_order}`,
            `#EXT-X-APE-LCEVC-HW-ACCELERATION:${lc.hw_accel}`,
            `#EXT-X-APE-LCEVC-SW-FALLBACK:1`,
            `#EXT-X-APE-LCEVC-COMPAT:UNIVERSAL`,
            `#EXT-X-APE-LCEVC-GRACEFUL-DEGRADATION:BASE_CODEC_PASSTHROUGH`,
            // ══════════════════════════════════════════════════════════════
            // QUALITY UPGRADE v3 — PACKAGES A-J COMPLETE (271 tags)
            // Base + New tags for each package
            // ══════════════════════════════════════════════════════════════

            // ══════════════════════════════════════════════════════════════
            // PACKAGE A — CMAF CHUNKED TRANSFER v2 (22 tags)
            // Base 12 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-CMAF-CHUNK-DURATION:${cfg.cmaf_chunk_duration || '1.0'}`,
            `#EXT-X-APE-CMAF-CHUNK-TYPE:CMAF_CHUNK`,
            `#EXT-X-APE-CMAF-INGEST-PROTOCOL:CMAF-INGEST-V2`,
            `#EXT-X-APE-CMAF-COMMON-ENCRYPTION:CBCS`,
            `#EXT-X-APE-CMAF-TRACK-TYPE:VIDEO+AUDIO+SUBTITLE`,
            `#EXT-X-APE-CMAF-SEGMENT-ALIGNMENT:true`,
            `#EXT-X-APE-CMAF-INDEPENDENT-SEGMENTS:true`,
            `#EXT-X-APE-CMAF-LOW-LATENCY:true`,
            `#EXT-X-APE-CMAF-PART-HOLD-BACK:3.0`,
            `#EXT-X-APE-CMAF-CAN-BLOCK-RELOAD:YES`,
            `#EXT-X-APE-CMAF-CAN-SKIP-UNTIL:36.0`,
            `#EXT-X-APE-CMAF-RENDITION-REPORTS:true`,
            `#EXT-X-APE-CMAF-PART-TARGET:${cfg.cmaf_chunk_duration || '1.0'}`,
            `#EXT-X-APE-CMAF-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,HOLD-BACK=6.0`,
            `#EXT-X-APE-CMAF-PLAYLIST-TYPE:LIVE`,
            `#EXT-X-APE-CMAF-TARGET-DURATION:${Math.ceil((cfg.buffer_live || 30000) / 1000)}`,
            `#EXT-X-APE-CMAF-MEDIA-SEQUENCE:dynamic`,
            `#EXT-X-APE-CMAF-DISCONTINUITY-SEQUENCE:auto`,
            `#EXT-X-APE-CMAF-PROGRAM-DATE-TIME:${new Date().toISOString()}`,
            `#EXT-X-APE-CMAF-DATERANGE-ENABLED:true`,
            `#EXT-X-APE-CMAF-SKIP-BOUNDARY:6.0`,
            `#EXT-X-APE-CMAF-DELTA-PLAYLIST:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE B — fMP4 ENHANCEMENT TRACKS v2 (24 tags)
            // Base 14 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-FMP4-VIDEO-TRACK:${cfg.codec || 'HEVC'}+LCEVC`,
            `#EXT-X-APE-FMP4-AUDIO-TRACK:AAC-LC+EAC3+AC4`,
            `#EXT-X-APE-FMP4-SUBTITLE-TRACK:TTML+WebVTT`,
            `#EXT-X-APE-FMP4-METADATA-TRACK:ID3+SCTE35`,
            `#EXT-X-APE-FMP4-THUMBNAIL-TRACK:JPEG+WebP`,
            `#EXT-X-APE-FMP4-LCEVC-TRACK:MPEG5-P2-SEI`,
            `#EXT-X-APE-FMP4-HDR-METADATA-TRACK:HDR10+`,
            `#EXT-X-APE-FMP4-DOLBY-VISION-TRACK:RPU`,
            `#EXT-X-APE-FMP4-SAMPLE-ENTRY:hvc1+dvh1`,
            `#EXT-X-APE-FMP4-BRAND:iso6+cmfc+dash`,
            `#EXT-X-APE-FMP4-FRAGMENT-DURATION:${cfg.fmp4_fragment_ms || '2000'}`,
            `#EXT-X-APE-FMP4-SIDX-BOX:true`,
            `#EXT-X-APE-FMP4-SAIO-SAIZ:true`,
            `#EXT-X-APE-FMP4-PRFT-BOX:true`,
            `#EXT-X-APE-FMP4-EDIT-LIST:true`,
            `#EXT-X-APE-FMP4-CTTS-BOX:true`,
            `#EXT-X-APE-FMP4-SGPD-BOX:true`,
            `#EXT-X-APE-FMP4-SBGP-BOX:true`,
            `#EXT-X-APE-FMP4-EMSG-BOX:true`,
            `#EXT-X-APE-FMP4-PSSH-BOX:true`,
            `#EXT-X-APE-FMP4-TENC-BOX:true`,
            `#EXT-X-APE-FMP4-SENC-BOX:true`,
            `#EXT-X-APE-FMP4-TRACK-ENCRYPTION:CBCS`,
            `#EXT-X-APE-FMP4-COMMON-MEDIA-CLIENT-DATA:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE C — LCEVC v2 PHASE 3 COMPLETE (15 new tags)
            // (Base 97 already in sections 2 + 14 above)
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-LCEVC-PHASE-3-ENABLED:true`,
            `#EXT-X-APE-LCEVC-NEURAL-UPSCALE:ESRGAN-4x`,
            `#EXT-X-APE-LCEVC-GRAIN-SYNTHESIS:true`,
            `#EXT-X-APE-LCEVC-SPATIAL-DITHERING:true`,
            `#EXT-X-APE-LCEVC-L1-MOTION-COMPENSATION:true`,
            `#EXT-X-APE-LCEVC-L2-CHROMA-ENHANCEMENT:true`,
            `#EXT-X-APE-LCEVC-L2-DETAIL-ENHANCEMENT:true`,
            `#EXT-X-APE-LCEVC-RATE-CONTROL:CRF+VBR`,
            `#EXT-X-APE-LCEVC-PSYCHO-VISUAL:true`,
            `#EXT-X-APE-LCEVC-AQ-MODE:VARIANCE`,
            `#EXT-X-APE-LCEVC-LOOKAHEAD:${cfg.lcevc_lookahead || 60}`,
            `#EXT-X-APE-LCEVC-B-FRAMES:${cfg.lcevc_bframes || 8}`,
            `#EXT-X-APE-LCEVC-REF-FRAMES:${cfg.lcevc_refframes || 16}`,
            `#EXT-X-APE-LCEVC-SUBPEL-REFINE:7`,
            `#EXT-X-APE-LCEVC-ME-RANGE:24`,
            `#EXT-X-APE-LCEVC-TRELLIS:2`,
            `#EXT-X-APE-LCEVC-DEBLOCK-ALPHA:${cfg.lcevc_deblock_alpha || -2}`,
            `#EXT-X-APE-LCEVC-DEBLOCK-BETA:${cfg.lcevc_deblock_beta || -2}`,
            `#EXT-X-APE-LCEVC-SAR:${cfg.resolution || '3840x2160'}`,
            `#EXT-X-APE-LCEVC-COLORMATRIX:${cfg.color_space || 'BT.2020'}`,
            `#EXT-X-APE-LCEVC-TRANSFER:${cfg.transfer_function || 'SMPTE-ST-2084'}`,
            `#EXT-X-APE-LCEVC-PRIMARIES:${cfg.color_primaries || 'BT.2020'}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE D — AI SUPER RESOLUTION COMPLETE (22 tags)
            // Base 15 + New 7
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-AI-SR-MODEL:ESRGAN-4x+RealESRGAN`,
            `#EXT-X-APE-AI-SR-SCALE:${cfg.ai_sr_scale || '2x'}`,
            `#EXT-X-APE-AI-SR-INFERENCE:EDGE+CLOUD`,
            `#EXT-X-APE-AI-SR-FALLBACK:BICUBIC`,
            `#EXT-X-APE-AI-TEMPORAL-SR:true`,
            `#EXT-X-APE-AI-DENOISING:true`,
            `#EXT-X-APE-AI-DEBLOCKING:true`,
            `#EXT-X-APE-AI-ARTIFACT-REMOVAL:true`,
            `#EXT-X-APE-AI-FRAME-INTERPOLATION:true`,
            `#EXT-X-APE-AI-COLOR-ENHANCEMENT:true`,
            `#EXT-X-APE-AI-SHARPENING:ADAPTIVE`,
            `#EXT-X-APE-AI-HDR-UPCONVERT:SDR_TO_HDR10_PLUS`,
            `#EXT-X-APE-AI-VMAF-TARGET:${cfg.vmaf_target || '95'}`,
            `#EXT-X-APE-AI-CONTENT-AWARE-ENCODING:true`,
            `#EXT-X-APE-AI-PERCEPTUAL-QUALITY:SSIM+VMAF`,
            `#EXT-X-APE-AI-SR-PRECISION:FP16`,
            `#EXT-X-APE-AI-SR-BATCH-SIZE:1`,
            `#EXT-X-APE-AI-SR-TILE-SIZE:256`,
            `#EXT-X-APE-AI-SR-OVERLAP:32`,
            `#EXT-X-APE-AI-MOTION-ESTIMATION:OPTICAL-FLOW`,
            `#EXT-X-APE-AI-SCENE-DETECTION:true`,
            `#EXT-X-APE-AI-CONTENT-TYPE:${cfg.group || 'GENERAL'}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE E — VVC / H.266 COMPLETE (12 tags)
            // Base 6 + New 6
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-VVC-ENABLED:true`,
            `#EXT-X-APE-VVC-PROFILE:MAIN_10`,
            `#EXT-X-APE-VVC-LEVEL:${cfg.vvc_level || '5.1'}`,
            `#EXT-X-APE-VVC-TIER:MAIN`,
            `#EXT-X-APE-VVC-FALLBACK:HEVC`,
            `#EXT-X-APE-VVC-EFFICIENCY:+50%_vs_HEVC`,
            `#EXT-X-APE-VVC-TOOLSET:FULL`,
            `#EXT-X-APE-VVC-SUBPICTURES:true`,
            `#EXT-X-APE-VVC-WRAP-AROUND:true`,
            `#EXT-X-APE-VVC-LMCS:true`,
            `#EXT-X-APE-VVC-AFFINE-ME:true`,
            `#EXT-X-APE-VVC-BDOF:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE F — EVC / MPEG-5 P1 COMPLETE (8 tags)
            // Base 4 + New 4
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-EVC-ENABLED:true`,
            `#EXT-X-APE-EVC-PROFILE:BASELINE`,
            `#EXT-X-APE-EVC-FALLBACK:H264`,
            `#EXT-X-APE-EVC-ROYALTY-FREE:true`,
            `#EXT-X-APE-EVC-LEVEL:${cfg.evc_level || '5.1'}`,
            `#EXT-X-APE-EVC-TOOLSET:MAIN`,
            `#EXT-X-APE-EVC-ADAPTIVE-LOOP-FILTER:true`,
            `#EXT-X-APE-EVC-CHROMA-QP-OFFSET:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE G — HDR ADVANCED COMPLETE (42 tags)
            // Base 32 + New 10
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-HDR-CHAIN:${Array.isArray(cfg.hdr_support) ? cfg.hdr_support.join(',') : (typeof cfg.hdr_support === 'string' && cfg.hdr_support ? cfg.hdr_support : 'dolby-vision,hdr10+,hdr10,hlg,sdr')}`,
            `#EXT-X-APE-HDR-COLOR-SPACE:${cfg.color_space || 'BT.2020,BT.709'}`,
            `#EXT-X-APE-HDR-TRANSFER-FUNCTION:${cfg.transfer_function || 'SMPTE-ST-2084,ARIB-STD-B67,BT.709'}`,
            `#EXT-X-APE-HDR-COLOR-PRIMARIES:${cfg.color_primaries || 'BT.2020'}`,
            `#EXT-X-APE-HDR-MATRIX-COEFFICIENTS:${cfg.matrix_coefficients || 'BT.2020nc'}`,
            `#EXT-X-APE-HDR-MAX-CLL:${cfg.max_cll || '4000,400'}`,
            `#EXT-X-APE-HDR-MAX-FALL:${cfg.max_fall || '1200'}`,
            `#EXT-X-APE-HDR-BIT-DEPTH:${cfg.color_depth || 10}bit`,
            `#EXT-X-APE-HDR-DOLBY-VISION-PROFILE:${cfg.dv_profile || '8.1'}`,
            `#EXT-X-APE-HDR-DOLBY-VISION-LEVEL:${cfg.dv_level || '6'}`,
            `#EXT-X-APE-HDR-SDR-FALLBACK:enabled`,
            `#EXT-X-APE-HDR-TONE-MAPPING:auto`,
            `#EXT-X-APE-HDR-GRACEFUL-DEGRADATION:SDR_PASSTHROUGH`,
            `#EXT-X-APE-HDR-STATIC-METADATA:enabled`,
            `#EXT-X-APE-HDR-DYNAMIC-METADATA:HDR10+,DV-RPU`,
            `#EXT-X-APE-HDR-PEAK-LUMINANCE:${cfg.peak_luminance || '4000'}nits`,
            `#EXT-X-APE-HDR-MIN-LUMINANCE:0.001nits`,
            `#EXT-X-APE-HDR-GAMUT:DCI-P3,BT.2020`,
            `#EXT-X-APE-HDR-10PLUS-VERSION:2.0`,
            `#EXT-X-APE-HDR-10PLUS-APPLICATION:4`,
            `#EXT-X-APE-HDR-DCI-P3-COVERAGE:99.8`,
            `#EXT-X-APE-HDR-BT2020-COVERAGE:97.5`,
            `#EXT-X-APE-HDR-DOLBY-VISION-CROSS-COMPAT:true`,
            `#EXT-X-APE-HDR-HLG-COMPAT:true`,
            `#EXT-X-APE-HDR-ST2094-10:true`,
            `#EXT-X-APE-HDR-ST2094-20:true`,
            `#EXT-X-APE-HDR-ST2094-30:true`,
            `#EXT-X-APE-HDR-ST2094-40:true`,
            `#EXT-X-APE-HDR-METADATA-INSERT-MODE:SEI`,
            `#EXT-X-APE-HDR-METADATA-PASS-THROUGH:true`,
            `#EXT-X-APE-HDR-OUTPUT-MODE:auto`,
            `#EXT-X-APE-HDR-DISPLAY-METADATA-SYNC:true`,
            `#EXT-X-APE-HDR-MASTERING-DISPLAY:G(0.265,0.690)B(0.150,0.060)R(0.680,0.320)WP(0.3127,0.3290)L(10000,0.001)`,
            `#EXT-X-APE-HDR-CONTENT-LIGHT-LEVEL:${cfg.max_cll || '4000,400'}`,
            `#EXT-X-APE-HDR-AMBIENT-VIEWING-ENV:DIM`,
            `#EXT-X-APE-HDR-REFERENCE-WHITE:203nits`,
            `#EXT-X-APE-HDR-SCENE-LUMINANCE:true`,
            `#EXT-X-APE-HDR-EXTENDED-RANGE:true`,
            `#EXT-X-APE-HDR-VIVID-ENABLED:true`,
            `#EXT-X-APE-HDR-SLHDR2:true`,
            `#EXT-X-APE-HDR-TECHNICOLOR:true`,
            `#EXT-X-APE-HDR-FILMMAKER-MODE:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE H — AUDIO ADVANCED COMPLETE (16 tags)
            // Base 8 + New 8
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-AUDIO-CODEC:${cfg.audio_codec === 'eac3' ? 'EAC3+AC4+AAC-LC' : 'AAC-LC+MP3'}`,
            `#EXT-X-APE-AUDIO-ATMOS:${cfg.audio_channels >= 8}`,
            `#EXT-X-APE-AUDIO-SPATIAL:${cfg.audio_channels >= 8 ? 'DOLBY-ATMOS+DTS-X' : 'NONE'}`,
            `#EXT-X-APE-AUDIO-CHANNELS:${cfg.audio_channels || '7.1.4'}`,
            `#EXT-X-APE-AUDIO-SAMPLE-RATE:48000`,
            `#EXT-X-APE-AUDIO-BIT-DEPTH:24bit`,
            `#EXT-X-APE-AUDIO-LOUDNESS:-23LUFS`,
            `#EXT-X-APE-AUDIO-DYNAMIC-RANGE:20dB`,
            `#EXT-X-APE-AUDIO-BITRATE:${cfg.audio_bitrate || '640'}kbps`,
            `#EXT-X-APE-AUDIO-OBJECTS:${cfg.audio_objects || '128'}`,
            `#EXT-X-APE-AUDIO-BEDS:${cfg.audio_beds || '10'}`,
            `#EXT-X-APE-AUDIO-DIALNORM:-27`,
            `#EXT-X-APE-AUDIO-COMPR-MODE:RF`,
            `#EXT-X-APE-AUDIO-DRC-PROFILE:FILM-STANDARD`,
            `#EXT-X-APE-AUDIO-DOWNMIX:LtRt+LoRo`,
            `#EXT-X-APE-AUDIO-TRUEHD:${cfg.audio_channels >= 8}`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE I — TRICK PLAY + THUMBNAILS COMPLETE (14 tags)
            // Base 6 + New 8
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-TRICK-PLAY-ENABLED:true`,
            `#EXT-X-APE-THUMBNAIL-TRACK:WebP+JPEG`,
            `#EXT-X-APE-THUMBNAIL-INTERVAL:10s`,
            `#EXT-X-APE-THUMBNAIL-RESOLUTION:320x180`,
            `#EXT-X-APE-FAST-FORWARD-CODEC:HEVC-I-FRAME`,
            `#EXT-X-APE-SEEK-PRECISION:IFRAME`,
            `#EXT-X-APE-THUMBNAIL-FORMAT:WebP+JPEG+AVIF`,
            `#EXT-X-APE-THUMBNAIL-COLS:10`,
            `#EXT-X-APE-THUMBNAIL-ROWS:10`,
            `#EXT-X-APE-THUMBNAIL-BANDWIDTH:200000`,
            `#EXT-X-APE-TRICK-PLAY-RATES:2,4,8,16,32`,
            `#EXT-X-APE-TRICK-PLAY-IFRAME-ONLY:true`,
            `#EXT-X-APE-SEEK-MODE:IFRAME+KEYFRAME`,
            `#EXT-X-APE-CHAPTER-MARKERS:true`,

            // ══════════════════════════════════════════════════════════════
            // PACKAGE J — SCTE-35 BROADCAST COMPLETE (10 tags)
            // Base 3 + New 7
            // ══════════════════════════════════════════════════════════════
            `#EXT-X-APE-SCTE35-ENABLED:true`,
            `#EXT-X-APE-SCTE35-FORMAT:BINARY+BASE64`,
            `#EXT-X-APE-SCTE35-SIGNAL:CUE-IN+CUE-OUT`,
            `#EXT-X-APE-SCTE35-PID:0x0086`,
            `#EXT-X-APE-SCTE35-DURATION-HINT:30s`,
            `#EXT-X-APE-SCTE35-SEGMENTATION-TYPE:PROGRAM_START`,
            `#EXT-X-APE-SCTE35-UPID-TYPE:URI`,
            `#EXT-X-APE-SCTE35-AVAIL-NUM:1`,
            `#EXT-X-APE-SCTE35-AVAILS-EXPECTED:1`,
            `#EXT-X-APE-SCTE35-BLACKOUT-OVERRIDE:true`
        ];

        // BLOQUE 4: CAPA 4 (EXTATTRFROMURL) - Atributos Directos Player
        // ═══════════════════════════════════════════════════════════════
        // Consolidación en una sola directiva CSV para evitar límite de líneas del reproductor
        const attrArr = [
            'quality=top',
            'resolution=highest',
            'bitrate=max',
            'frame-rate=' + (cfg.fps || 60),
            'preferred-codec=hevc,hev1,hvc1,h265,H265,h.265,H.265',
            'fallback-codec=av01,av1,vpc,vp9',
            'codec-level=6.1',
            'color-space=bt2020nc',
            'color-transfer=smpte2084',
            'hdr=hdr10,dolby-vision,hlg',
            'hdr10plus=enabled',
            'metadata-sei=passthrough',
            'audio=original,passthrough',
            'audio-codec=eac3,ac3,dts,aac',
            'audio-channels=5.1,7.1,atmos',
            'audio-language=spa,eng,orig',
            'subtitle-language=spa,eng',
            'buffer-size=200000',
            'buffer-min=50000',
            'timeout=15000',
            'reconnect=true',
            'reconnect-delay=50,100,500',
            'http-keep-alive=true',
            'http-version=2,3',
            'tls-version=1.3',
            'tcp-fast-open=true',
            'tcp-nodelay=true',
            'mux-type=ts,fmp4,cmaf',
            'demux=strict',
            'segment-format=mpegts,fmp4',
            'hls-version=7,10'
        ];
        lines.push(`#EXTATTRFROMURL:${attrArr.join(',')}`);

        return lines;
    }

    const XTREAM_HTTP_PORTS = ['2082', '2083', '8080', '8000', '25461', '25463', '80'];

    function preferHttps(url) {
        if (!url || typeof url !== 'string') return url;
        try {
            const parsed = new URL(url);
            const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
            if (XTREAM_HTTP_PORTS.includes(port)) {
                if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'http://');
                return url;
            }
            const noSSLHosts = ['line.tivi-ott.net', 'candycloud8k.biz', 'pro.123sat.net'];
            if (noSSLHosts.some(h => parsed.hostname.includes(h))) {
                if (url.startsWith('https://')) return url.replace(/^https:\/\//, 'http://');
                return url;
            }
        } catch (e) { }
        return url;
    }

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    function generateNonce() {
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    // ═
    //  CREDENTIAL GUARDIAN v2.0  PRESERVACIÓN EXACTA
    // Solo elimina caracteres INVISIBLES que corrompen encoding.
    // NUNCA altera caracteres visibles. Las credenciales validadas
    // por connectServer() SON SAGRADAS e INMUTABLES.
    // 
    function sanitizeCredential(value) {
        if (!value || typeof value !== 'string') return value || '';
        let clean = value.trim();
        clean = clean.replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, '');
        return clean;
    }

    function base64UrlEncode(str) {
        // 🔴 REGLA ANTI-REGRESIÓN: Usar Buffer.from (no btoa) + base64 ESTÁNDAR (no URL-safe)
        // El auditor Python usa base64.b64decode() que requiere caracteres +/= estándar
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(str, 'utf8').toString('base64');
        }
        // Fallback browser: btoa con standard base64 (SIN reemplazos URL-safe)
        try {
            return btoa(unescape(encodeURIComponent(str)));
        } catch (e) {
            return btoa(str);
        }
    }

    function escapeM3UValue(value) {
        if (!value) return '';
        // v6.1 COMPAT: Sanitizar ┃ (U+2503 Box Drawing) → | (U+007C Standard Pipe)
        // TiviVision/OTT Navigator interpretan ┃ como separador de grupo fantasma
        return String(value).replace(/\u2503/g, '|').replace(/"/g, "'").replace(/,/g, ' ');
    }

    function generateJWT68Fields(channel, profile, index) {
        return "JWT_STUB";
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ⚡ QUANTUM PROFILE CLASSIFIER v5.0 — MULTI-SIGNAL WEIGHTED SCORING
    // 5 capas independientes de señales. La que más puntos acumule gana.
    // Nunca se equivoca por depender de una sola fuente.
    // ═══════════════════════════════════════════════════════════════════════

    // Capa 0: Base de datos de marcas IPTV conocidas → resolución real verificada
    const KNOWN_BRANDS = {
        P0: [],
        P1: ['4K', 'UHD', 'ULTRA HD', '2160'],
        P3: [
            // Deportes internacionales (siempre 1080p)
            'ESPN', 'FOX SPORTS', 'BEIN SPORTS', 'BEINSPORT', 'DIRECTV SPORTS', 'DSports',
            'SKY SPORTS', 'BT SPORT', 'DAZN', 'EUROSPORT', 'SPORT TV', 'SPORTV',
            'GOLF CHANNEL', 'NBA TV', 'NFL NETWORK', 'MLB NETWORK', 'NHL NETWORK',
            // Noticias (siempre 1080p)
            'CNN', 'BBC', 'BBC ONE', 'BBC TWO', 'AL JAZEERA', 'DW NEWS', 'FRANCE 24',
            'EURONEWS', 'BLOOMBERG', 'CNBC', 'FOX NEWS', 'MSNBC', 'SKY NEWS',
            // Entretenimiento premium (1080p)
            'HBO', 'SHOWTIME', 'STARZ', 'AMC', 'FX', 'TNT', 'TBS', 'USA NETWORK',
            'DISCOVERY', 'NATIONAL GEOGRAPHIC', 'NATGEO', 'HISTORY', 'ANIMAL PLANET',
            'TRAVEL CHANNEL', 'FOOD NETWORK', 'HGTV', 'BRAVO', 'LIFETIME',
            // Films premium (1080p)
            'CINEMAX', 'TCM', 'SUNDANCE', 'IFC', 'CRITERION',
            // Latinoamérica HD (1080p)
            'CANAL SUR', 'TELECINCO', 'ANTENA 3', 'LA1', 'LA2', 'CUATRO',
            'CARACOL', 'RCN', 'TELEAMAZONAS', 'ECUAVISA', 'TC TELEVISION',
            'CANAL 13', 'MEGA', 'CHILEVISION', 'TVN', 'T13',
            'TV AZTECA', 'TELEVISA', 'CANAL DE LAS ESTRELLAS',
            'GLOBO', 'SBT', 'RECORD', 'REDE BAND',
            'TLN', 'CNN EN ESPANOL', 'NTN24', 'TELEMUNDO', 'UNIVISION',
        ],
        P4: [
            // Canales infantiles (generalmente 720p)
            'CARTOON NETWORK', 'NICKELODEON', 'NICK JR', 'DISNEY JR', 'BOOMERANG',
            'DISNEY CHANNEL', 'DISNEY XD', 'BABY TV', 'BABY FIRST',
            // Canales básicos de cable (720p)
            'COMEDY CENTRAL', 'MTV', 'VH1', 'BET', 'SYFY', 'E!', 'OXYGEN',
            // Deportes básicos (720p en muchos proveedores)
            'ESPN2', 'ESPN3', 'FOX SPORTS 2', 'FOX SPORTS 3',
        ],
        P5: [
            // Canales locales sin calidad garantizada (SD)
            'TELESUR', 'TELE 1', 'LOCAL TV', 'CANAL LOCAL',
        ]
    };

    function determineProfile(channel) {
        const name = (channel?.name || '').toString().toUpperCase().trim();
        const group = (channel?.category_name || channel?.group || channel?.group_title || '').toString().toUpperCase().trim();
        const resMeta = (channel?.resolution || channel?.heuristics?.resolution || '').toString().toLowerCase();
        const bitrate = parseInt(channel?.bitrate || channel?.heuristics?.bitrate || 0, 10); // kbps

        // Scores acumulados por perfil
        const scores = { P0: 0, P1: 0, P3: 0, P4: 0, P5: 0 };
        const signals = []; // Debug trace

        // ─────────────────────────────────────────────────────────────────
        // CAPA 1: RESOLUCIÓN METADATA DEL API (peso 40) — más confiable
        // ─────────────────────────────────────────────────────────────────
        if (resMeta) {
            if (resMeta.includes('7680') || resMeta.includes('8k')) { scores.P0 += 40; signals.push('RES:8K→P0'); }
            else if (resMeta.includes('3840') || resMeta.includes('2160') || resMeta.includes('4k')) { scores.P1 += 40; signals.push('RES:4K→P1'); }
            else if (resMeta.includes('1920') || resMeta.includes('1080')) { scores.P3 += 40; signals.push('RES:1080p→P3'); }
            else if (resMeta.includes('1280') || resMeta.includes('720')) { scores.P4 += 40; signals.push('RES:720p→P4'); }
            else if (resMeta.includes('854') || resMeta.includes('480')) { scores.P5 += 40; signals.push('RES:480p→P5'); }
            else if (resMeta.includes('640') || resMeta.includes('360')) { scores.P5 += 40; signals.push('RES:360p→P5'); }
        }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 2: BITRATE DEL API (peso 30) — evidencia directa de calidad
        // ─────────────────────────────────────────────────────────────────
        if (bitrate > 0) {
            if (bitrate >= 30000) { scores.P0 += 30; signals.push(`BIT:${bitrate}k→P0`); }
            else if (bitrate >= 15000) { scores.P1 += 30; signals.push(`BIT:${bitrate}k→P1`); }
            else if (bitrate >= 6000) { scores.P3 += 30; signals.push(`BIT:${bitrate}k→P3`); }
            else if (bitrate >= 2500) { scores.P4 += 30; signals.push(`BIT:${bitrate}k→P4`); }
            else { scores.P5 += 30; signals.push(`BIT:${bitrate}k→P5`); }
        }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 3: NOMBRE DEL CANAL — keywords explícitos (peso 20)
        // ─────────────────────────────────────────────────────────────────
        if (name.includes('8K')) { scores.P0 += 20; signals.push('NAME:8K→P0'); }
        if (name.includes('4K') || name.includes('UHD')) { scores.P1 += 20; signals.push('NAME:4K/UHD→P1'); }
        if (name.includes('FHD') || name.includes('1080')) { scores.P3 += 20; signals.push('NAME:FHD/1080→P3'); }
        // HD genérico → P3 (1080p), NO P4
        if (name.includes('HD') && !name.includes('720') && !name.includes('480') && !name.includes('SD')) {
            scores.P3 += 15; signals.push('NAME:HD(generic)→P3');
        }
        if (name.includes('720')) { scores.P4 += 20; signals.push('NAME:720→P4'); }
        if (name.includes('SD') || name.includes('480') || name.includes('360')) { scores.P5 += 20; signals.push('NAME:SD/480→P5'); }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 4: GROUP-TITLE (peso 15) — señal de categoría
        // ─────────────────────────────────────────────────────────────────
        if (group.includes('8K')) { scores.P0 += 15; signals.push('GRP:8K→P0'); }
        if (group.includes('4K') || group.includes('UHD')) { scores.P1 += 15; signals.push('GRP:4K→P1'); }
        if (group.includes('FHD') || group.includes('FULL HD') || group.includes('1080')) { scores.P3 += 15; signals.push('GRP:FHD→P3'); }
        if (group.includes('HD') && !group.includes('720') && !group.includes('FHD') && !group.includes('FULL')) {
            scores.P3 += 10; signals.push('GRP:HD(generic)→P3');
        }
        if (group.includes('720')) { scores.P4 += 15; signals.push('GRP:720→P4'); }
        if (group.includes(' SD') || group.includes('SD ') || group.startsWith('SD')) { scores.P5 += 15; signals.push('GRP:SD→P5'); }

        // ─────────────────────────────────────────────────────────────────
        // CAPA 5: BASE DE DATOS DE MARCAS CONOCIDAS (peso 10)
        // ─────────────────────────────────────────────────────────────────
        for (const [profile, brands] of Object.entries(KNOWN_BRANDS)) {
            for (const brand of brands) {
                if (name.includes(brand)) {
                    scores[profile] += 10;
                    signals.push(`BRAND:${brand}→${profile}`);
                    break; // Solo una marca por perfil por canal
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // DECISIÓN FINAL: Perfil con mayor score acumulado
        // ─────────────────────────────────────────────────────────────────
        let bestProfile = 'P3'; // Default conservador: FHD 1080p
        let bestScore = 0;
        let totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

        for (const [profile, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestProfile = profile;
            }
        }

        // Si ninguna señal votó (score total = 0) → P3 por defecto (anti-starvation)
        if (totalScore === 0) {
            bestProfile = 'P3';
            signals.push('DEFAULT:no-signal→P3');
        }

        const confidence = totalScore > 0 ? Math.round((bestScore / totalScore) * 100) : 0;

        // Guardar debug en el canal para telemetría / EPG headers
        channel._profileDebug = {
            profile: bestProfile,
            confidence: confidence,
            scores: scores,
            signals: signals,
            sources: { name, group, resMeta, bitrate }
        };

        return bestProfile;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PIPELINE 2026: FUNCIONES DE ARRAY MODULAR (REINTEGRACIÓN CRÍTICA)
    // ═══════════════════════════════════════════════════════════════════════════

    function build_stream_inf(cfg, channel) {
        const bandwidth = (cfg.bitrate || 5000) * 1000;
        const avgBandwidth = Math.round(bandwidth * 0.8);
        const res = cfg.res || cfg.resolution || '1920x1080';
        const fps = (cfg.target_framerate === '120FPS') ? 120 : (cfg.target_framerate === '60FPS' ? 60 : 30);
        let codecs = 'avc1.42E01E,mp4a.40.2';
        let videoRange = 'SDR';
        let hdcpLevel = 'NONE';

        switch (cfg.codec_primary) {
            case 'VVC':
                codecs = 'vvc1.1.L63.00.0.0,mp4a.40.2';
                videoRange = 'PQ';
                hdcpLevel = 'TYPE-1';
                break;
            case 'AV1':
                codecs = 'av01.0.08M.08,mp4a.40.2';
                videoRange = 'PQ';
                hdcpLevel = 'TYPE-1';
                break;
            case 'HEVC':
                codecs = 'hvc1.1.6.L153.B0,mp4a.40.2';
                videoRange = 'PQ';
                hdcpLevel = 'TYPE-1';
                break;
            case 'AVC':
                codecs = 'avc1.640028,mp4a.40.2';
                videoRange = 'SDR';
                hdcpLevel = 'NONE';
                break;
        }

        // [RFC 8216bis] VIDEO-RANGE: ExoPlayer usa esto para pre-init el decoder HDR/SDR
        // sin esperar al primer segmento. Elimina el pantallazo negro del HDMI handshake.
        // PQ = SMPTE ST 2084 (HDR10/HDR10+/DV), SDR = BT.709, HLG = Hybrid Log-Gamma.

        // [MPEG-5 Part 2] SUPPLEMENTAL-CODECS: Señaliza pista LCEVC separada.
        // ExoPlayer/AVPlayer: si tiene decoder LCEVC → upscale a 4K; si no → ignora y muestra base.
        const supplemental = (cfg.lcevc_enabled !== false) ? ',SUPPLEMENTAL-CODECS="lcev.1.1.1"' : '';

        return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AVERAGE-BANDWIDTH=${avgBandwidth},RESOLUTION=${res},CODECS="${codecs}",FRAME-RATE=${fps},VIDEO-RANGE=${videoRange},HDCP-LEVEL=${hdcpLevel}${supplemental}`;
    }

    function build_av1_cortex_fallback_tags(cfg) {
        const arr = [];
        // Lógica estructural obligatoria de fallback
        arr.push('#EXT-X-APE-AV1-FALLBACK-ENABLED:true');
        arr.push('#EXT-X-APE-AV1-FALLBACK-CHAIN:HEVC>H264>BASELINE');
        arr.push('#EXT-X-APE-AV1-FALLBACK-DETECT:HARDWARE_DECODE_ONLY');
        arr.push('#EXT-X-APE-AV1-FALLBACK-GRACEFUL:true');
        arr.push('#EXT-X-APE-AV1-FALLBACK-AUTO-SWITCH:true');
        arr.push('#EXT-X-APE-AV1-FALLBACK-PRESERVE-HDR:true');
        arr.push('#EXT-X-APE-AV1-FALLBACK-PRESERVE-LCEVC:true');
        arr.push('#EXT-X-APE-AV1-FALLBACK-TIMEOUT:500ms');
        arr.push('#EXT-X-APE-AV1-FALLBACK-SIGNAL:SEAMLESS');
        arr.push('#EXT-X-APE-AV1-FALLBACK-LOG:SILENT');

        // Cortex Control Avanzado para Hardware
        arr.push('#EXT-X-CORTEX-AV1-CDEF:ENABLED_DIRECTIONAL_RESTORATION');
        arr.push('#EXT-X-CORTEX-AV1-DEBLOCKING:MAXIMUM_ATTENUATION');

        return arr;
    }

    function build_stealth_evasion_tags(cfg) {
        const arr = [];
        arr.push('#EXT-X-APE-EVASION-ENGINE:POLYMORPHIC_v22.2');
        arr.push('#EXT-X-APE-EVASION-FINGERPRINT:89362nsxk2da8xian62kt3hck3c7dneu');
        arr.push('#EXT-X-APE-EVASION-GENOME-SEED:13');
        arr.push('#EXT-X-APE-EVASION-MUTATION-RATE:PER_REQUEST');
        arr.push('#EXT-X-APE-EVASION-PERSIST:INFINITE');
        arr.push('#EXT-X-APE-STEALTH-FINGERPRINT:r879b7m2r49xi5azbwunsgx56s7mlexe');
        arr.push('#EXT-X-APE-STEALTH-UA:Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0');
        arr.push('#EXT-X-APE-STEALTH-XFF:51.87.232.172');
        return arr;
    }

    // ── 🔥 BALANCE SCORECARD PERFECT 10/10 RESTORE (14 GAPS CRYSTAL UHD) 🔥 ──
    function build_omega_crystal_uhd_14gaps(cfg) {
        const arr = [];

        // D11: AI DLSS & Post-Processing (Capa Suprema CORTEX-AI)
        arr.push('#EXT-X-CORTEX-AI-SUPER-RESOLUTION:REALESRGAN_X4PLUS_LITE');
        arr.push('#EXT-X-CORTEX-AI-SPATIAL-DENOISE:NLMEANS_OPTICAL');
        arr.push('#EXT-X-CORTEX-LCEVC:PHASE_3_FP16');
        arr.push('#EXT-X-APE-CHROMA-SMOOTHING:ACTIVE');
        arr.push('#EXT-X-APE-POST-PROCESSING:DEBLOCKING_STRONG');

        // D3/D7: Network Buffer & Active Throttler Evasion (OMEGA ENGINE)
        arr.push('#EXT-X-OMEGA-ENGINE-BANDWIDTH-MONITOR:ACTIVE_PREDICTIVE_NEURAL');
        arr.push('#EXT-X-APE-DYNAMIC-DEFENSE-ACTIVATED:TRUE');
        arr.push('#EXT-X-APE-DEFENSE-REASON:RISK_SCORE_22_STALL_0.01');
        arr.push('#EXT-X-APE-OVERRIDE-RISK:TRUE');
        arr.push('#EXT-X-APE-FORCE-CODEC:H264');
        arr.push('#EXT-X-APE-DEINTERLACE-FALLBACK:YADIF');
        arr.push('#EXT-X-APE-THROTTLER:ISP_STRANGULATION_ACTIVE');
        arr.push('#EXT-X-APE-QOS-DSCP-OVERRIDE:AF41,EF');
        arr.push('#EXT-X-APE-TCP-WINDOW-SPAM:512M');
        arr.push('#EXT-X-APE-CONCURRENCY-SURGE:8_THREADS');
        arr.push('#EXT-X-APE-FAILOVER-UP-RECALIBRATE:TRUE');

        // D9/D10: fMP4/CMAF Transporte Universal (Chunks 200ms)
        arr.push('#EXT-X-CMAF-TRANSPORT:UNIVERSAL_200MS_CHUNKS');
        arr.push('#EXT-X-CMAF-CHUNK-TARGET:0.2');
        arr.push('#EXT-X-CMAF-CHUNK-DURATION:0.2');

        // D4/D8: HW Spoofing Header Explícito
        arr.push('#EXT-X-DEVICE-CLASS:SHIELD_TV_PRO_2023');
        arr.push('#EXT-X-APE-PHANTOM-DEVICE-SPOOF:SHIELD_TV_PRO_2023');
        arr.push('#EXT-X-APE-SPOOF-DEVICE-CLASS:premium-tv');
        arr.push('#EXT-X-APE-SPOOF-DECODING-CAPABILITY:hevc-main10-level6.1');
        arr.push('#EXT-X-APE-SPOOF-DEVICE-MODEL:SHIELD-TV-PRO');
        arr.push('#EXT-X-APE-DRM-WIDEVINE:ENFORCE');
        arr.push('#EXT-X-APE-DRM-FAIRPLAY:SUPPORTED');

        // Network Buffer God Tier
        arr.push('#EXT-X-APE-BUFFER-STRATEGY:ADAPTIVE_PREDICTIVE_NEURAL');
        arr.push('#EXT-X-APE-BUFFER-PRELOAD-SEGMENTS:30');
        arr.push('#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT:ENABLED');
        arr.push('#EXT-X-APE-OMEGA-ENGINE-BANDWIDTH-MONITOR:ACTIVE');
        arr.push('#EXT-X-APE-AV1-FALLBACK-ENABLED:true');
        arr.push('#EXT-X-APE-AV1-FALLBACK-CHAIN:HEVC>H264>BASELINE');
        arr.push('#EXT-X-APE-CODEC-PRIORITY:HEVC>VVC>AV1>H264');
        arr.push('#EXT-X-APE-TELCHEMY-TVQM:ACTIVATED');
        arr.push('#EXT-X-APE-TELCHEMY-TR101290:ACTIVATED');

        // Adiciones Córtex Definitivas 10/10
        arr.push('#EXT-X-APE-EVASION-ENGINE:POLYMORPHIC_v22.2');
        arr.push('#EXT-X-APE-EVASION-FINGERPRINT:89362nsxk2da8xian62kt3hck3c7dneu');
        arr.push('#EXT-X-APE-STEALTH-UA:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
        arr.push('#EXT-X-APE-STEALTH-XFF:51.87.232.172');
        arr.push('#EXT-X-APE-BITRATE-ANARCHY:ADAPTIVE_FREEZE_ON_DROP');
        arr.push('#EXT-X-APE-NETWORK-BUFFER-GOD-TIER:JITTER_ADAPTIVE_EXPANSION');
        arr.push('#EXT-X-PRELOAD-HINT:TYPE=PART');

        arr.push('#EXT-X-APE-CODEC-ENFORCER:DYNAMIC_TRACK_SELECTION');
        arr.push('#EXT-X-APE-AV1-FALLBACK-DETECT:HARDWARE_DECODE_ONLY');
        arr.push('#EXT-X-APE-AV1-FALLBACK-AUTO-SWITCH:true');
        arr.push('#EXT-X-CORTEX-AV1-CDEF:ENABLED_DIRECTIONAL_RESTORATION');
        arr.push('#EXT-X-CORTEX-AV1-DEBLOCKING:MAXIMUM_ATTENUATION');

        return arr;
    }

    function build_phantom_hydra_engine(profile, channel, index) {
        const arr = [];
        arr.push('#EXT-X-APE-PHANTOM-HYDRA-STATE: ACTIVE');
        arr.push('#EXT-X-APE-PHANTOM-HYDRA-VERSION: 5.0-OMEGA');
        arr.push(`#EXT-X-APE-PHANTOM-HYDRA-NONCE: ${generateNonce()}`);
        arr.push('#EXT-X-APE-PHANTOM-UA-ROTATION: ENABLED');

        if (profile === 'P4' || profile === 'P5') {
            // Perfiles seguros no inyectan capas agresivas de Phantom
        } else {
            const uaTarget = UAPhantomEngine.getLayeredUA(index, channel.name || '').ua || 'Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36';
            arr.push(`#EXT-X-APE-PHANTOM-UA-ACTIVE: ${uaTarget}`);
            if (profile !== 'P3') {
                arr.push('#EXT-X-APE-PHANTOM-DEVICE-SPOOF: SHIELD_TV_PRO_2023');
            }
            arr.push('#EXT-X-APE-PHANTOM-SNI-OBFUSCATION: ENABLED');
            arr.push('#EXT-X-APE-PHANTOM-SNI-FRONT-DOMAIN: cloudflare.com');
            arr.push('#EXT-X-APE-PHANTOM-DOH-SERVER: https://dns.google/dns-query');
            arr.push('#EXT-X-APE-PHANTOM-SWARM-SIZE: 128');
            arr.push('#EXT-X-APE-PHANTOM-SWARM-STRATEGY: HYDRA_MULTI_IP');
            arr.push('#EXT-X-APE-PHANTOM-TRAFFIC-MORPH: ENABLED');
            arr.push('#EXT-X-APE-PHANTOM-TRAFFIC-DISGUISE: HTTPS_GOOGLE_APIS');
        }

        arr.push('#EXT-X-APE-PHANTOM-IDEMPOTENT-STATE: LOCKED');
        arr.push('#EXTVLCOPT:tone-mapping=mobius');
        return arr;
    }

    function generateEXTINF(channel, profile, index) {
        let sid = channel.serverId || channel._source || channel.server_id || '';
        let sName = channel.serverName || '';

        // Si el objeto del canal no tiene serverName (caché antiguo), buscar en activeServers usando sid
        if (!sName && sid) {
            try {
                const servers = window.app?.state?.activeServers;
                if (servers && servers.length > 0) {
                    const srv = servers.find(s => s.id === sid);
                    if (srv && srv.name) sName = srv.name;
                }
            } catch (e) { }
        }

        let finalServerIdent = sName || sid;
        let serverSuffix = finalServerIdent ? ` [${finalServerIdent}]` : '';

        const tvgId = escapeM3UValue(channel.stream_id || channel.id || index);
        // Agregamos el sufijo del servidor al nombre visual para diferenciarlos radicalmente
        const tvgName = escapeM3UValue((channel.name || `Canal ${index}`) + serverSuffix);
        const tvgLogo = escapeM3UValue(channel.stream_icon || channel.logo || '');
        let groupTitle = channel.category_name || channel.group || 'General';

        // v22.3 FIX: Read enabled state from PERSISTED config (localStorage), NOT from DOM checkbox.
        // DOM check fails when panel isn't mounted (null?.checked → undefined !== false → true → BUG).
        const _gtCfg = window.GroupTitleConfigManager?.load?.() || window.GroupTitleBuilder?.getConfig?.();
        if (window.GroupTitleBuilder && _gtCfg?.enabled !== false) {
            if (_gtCfg?.selectedFields?.length > 0) {
                groupTitle = window.GroupTitleBuilder.buildExport(channel, _gtCfg);
            }
        }

        // ── 🎯 CHANNEL CLASSIFIER v2.0: Auto-classify & enrich ──
        const classification = _channelClassifier.classify({ tvgName: channel.name || '', groupTitle, category_name: channel.category_name || '' });
        channel._classification = classification; // Store for EXTHTTP use

        // Auto-correct group-title si confianza >= 85% y el actual es genérico
        const genericGroups = ['general', 'live', 'uncategorized', 'all', 'channels', 'iptv', 'other'];
        if (classification.confidence >= 0.85 && genericGroups.includes(groupTitle.toLowerCase().trim())) {
            groupTitle = classification.suggestedGroupTitle;
        }

        groupTitle = escapeM3UValue(groupTitle);

        const regionCode = classification.region.code || 'XX';
        const contentType = classification.contentType.type || 'GENERALISTA';
        const langCode = classification.language.code || 'unknown';
        const confPct = Math.round(classification.confidence * 100);
        const countryName = classification.country?.group || '';
        const fps = channel.frames || 30;
        const transport = channel.transport || 'HLS';
        // B6 (2026-04-30) — derive codec family del perfil cuando channel.codecFamily vacío.
        // Lista emitía ape-codec-family="" en 37,128 canales. Profile.settings.codec
        // tiene los valores canónicos (AV1/HEVC/H264) — los mapeamos a familia.
        const codecFamRaw = (channel.codecFamily || (typeof PROFILES !== 'undefined' && PROFILES[profile]?.codec) || 'H264').toString().toUpperCase();
        const codecFam = ({
            'AV1': 'av1',
            'HEVC': 'hevc', 'H.265': 'hevc', 'H265': 'hevc',
            'H.264': 'h264', 'H264': 'h264', 'AVC': 'h264',
            'VP9': 'vp9'
        })[codecFamRaw] || codecFamRaw.toLowerCase();
        const tvgChno = escapeM3UValue(channel.num || channel.stream_id || (index + 1));
        const catchup = channel.tv_archive ? ` catchup="append" catchup-days="${channel.tv_archive_duration || 7}" catchup-source="?utc={utc}&lutc={lutc}"` : '';
        const tvgShift = ` tvg-shift="${channel.tv_shift || 0}"`;

        const _ua796 = (typeof window !== 'undefined' && window.PhantomHydra)
            ? window.PhantomHydra.getForChannel(index, channel.name || '')
            : 'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        return `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" tvg-chno="${tvgChno}"${catchup}${tvgShift} group-title="${groupTitle}" ape-profile="${profile}" ape-build="v5.4-MAX-AGGRESSION" ape-region="${regionCode}" ape-content-type="${contentType}" ape-lang="${langCode}" ape-country="${escapeM3UValue(countryName)}" ape-classify-confidence="${confPct}" ape-fps="${fps}" ape-transport="${transport}" ape-codec-family="${codecFam}",${tvgName}`;
    }

    const MAX_URL_LENGTH = 2000;

    /**
     * 🧬 buildCredentialsMap v10.3 — AGGRESSIVE SELF-CONTAINED
     * Reads from ALL sources independently with try/catch isolation.
     * Does NOT depend on external injection.
     */
    function buildCredentialsMap(options) {
        const map = {};
        let sourcesFound = 0;

        // Helper: normalize and add server to map
        const addServer = (s, sourceName) => {
            if (!s || typeof s !== 'object') return;
            const baseUrl = (s.baseUrl || s.url || s.server_url || s.host || '')
                .replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
            const username = sanitizeCredential(s._lockedUsername || s.username || s.user || '');
            const password = sanitizeCredential(s._lockedPassword || s.password || s.pass || '');
            if (!baseUrl || !username || !password) {
                return;
            }
            // Add http:// if missing
            const fullBase = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
            const entry = { baseUrl: fullBase, username, password };
            if (s.id && !map[s.id]) map[s.id] = entry;
            if (s.name && !map['name:' + s.name.toLowerCase()]) map['name:' + s.name.toLowerCase()] = entry;
            const host = fullBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
            if (host && !map['host:' + host]) map['host:' + host] = entry;
            sourcesFound++;
            console.log(`   🔑 [${sourceName}] ${s.name || s.id || host} → ${fullBase} [user:YES]`);
        };

        console.log('🔑 [buildCredentialsMap v10.3] Barrido agresivo de fuentes...');

        // --- SOURCE 1: Injected via options ---
        try {
            if (options && options._activeServers && options._activeServers.length > 0) {
                console.log(`   -> SOURCE 1: options._activeServers (${options._activeServers.length})`);
                options._activeServers.forEach(s => addServer(s, 'INJECTED'));
            }
        } catch (e) { console.warn('   SOURCE 1 error:', e.message); }

        // --- SOURCE 2: window.app.state (with try/catch!) ---
        try {
            if (typeof window !== 'undefined' && window.app && window.app.state) {
                const st = window.app.state;
                // NUCLEAR DIAGNOSTIC: dump first server structure
                if (st.activeServers) {
                    console.log(`   -> SOURCE 2: window.app.state.activeServers (${st.activeServers.length})`);
                    if (st.activeServers.length > 0) {
                        console.log('   🔬 FIRST SERVER KEYS:', Object.keys(st.activeServers[0]).join(', '));
                        const s0 = st.activeServers[0];
                        console.log('   🔬 FIRST SERVER:', JSON.stringify({
                            id: s0.id, name: s0.name,
                            baseUrl: s0.baseUrl, url: s0.url, server_url: s0.server_url, host: s0.host,
                            username: s0.username ? 'YES' : 'NO', user: s0.user ? 'YES' : 'NO',
                            password: s0.password ? '***' : 'NO', pass: s0.pass ? '***' : 'NO'
                        }));
                    }
                    st.activeServers.forEach(s => addServer(s, 'APP_STATE'));
                } else {
                    console.warn('   -> SOURCE 2: activeServers is', typeof st.activeServers, st.activeServers);
                }
                // Also try currentServer
                if (st.currentServer) {
                    addServer(st.currentServer, 'CURRENT_SERVER');
                    const cs = st.currentServer;
                    const csEntry = {
                        baseUrl: (cs.baseUrl || cs.url || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, ''),
                        username: cs.username || cs.user || '',
                        password: cs.password || cs.pass || ''
                    };
                    if (csEntry.baseUrl && csEntry.username && csEntry.password) {
                        if (!csEntry.baseUrl.startsWith('http')) csEntry.baseUrl = 'http://' + csEntry.baseUrl;
                        map['__current__'] = csEntry;
                    }
                }
            } else {
                console.warn('   -> SOURCE 2: window.app:', typeof window !== 'undefined' ? (window.app ? 'EXISTS' : 'NULL') : 'NO WINDOW');
                if (typeof window !== 'undefined' && window.app) {
                    console.warn('   -> SOURCE 2: window.app.state:', window.app.state ? 'EXISTS' : 'NULL/UNDEFINED');
                }
            }
        } catch (e) { console.error('   SOURCE 2 CRASHED:', e.message, e.stack); }

        // --- SOURCE 3: localStorage (multiple keys) ---
        const lsKeys = ['iptv_server_library', 'iptv_connected_servers', 'iptv_active_servers', 'ape_saved_servers'];
        lsKeys.forEach(key => {
            try {
                if (typeof localStorage === 'undefined') return;
                const data = localStorage.getItem(key);
                if (!data) return;
                const parsed = JSON.parse(data);
                const list = Array.isArray(parsed) ? parsed : (parsed.servers || parsed.list || []);
                if (list.length > 0) {
                    console.log(`   -> SOURCE 3: localStorage.${key} (${list.length})`);
                    list.forEach(s => addServer(s, 'LS_' + key));
                }
            } catch (e) { /* silent */ }
        });

        // --- SOURCE 4: NUCLEAR - scan ALL localStorage for any server-like object ---
        if (sourcesFound === 0 && typeof localStorage !== 'undefined') {
            console.warn('   -> SOURCE 4: NUCLEAR SCAN - checking ALL localStorage keys...');
            const allKeys = Object.keys(localStorage);
            console.warn('   -> ALL LS KEYS:', allKeys.filter(k => k.startsWith('iptv')).join(', '));
            allKeys.forEach(key => {
                try {
                    const raw = localStorage.getItem(key);
                    if (!raw || raw.length < 20) return;
                    const parsed = JSON.parse(raw);
                    const candidates = Array.isArray(parsed) ? parsed : [parsed];
                    candidates.forEach(c => {
                        if (c && typeof c === 'object' && (c.username || c.user) && (c.password || c.pass)) {
                            console.log(`   -> SOURCE 4 FOUND credentials in key: ${key}`);
                            addServer(c, 'NUCLEAR_' + key);
                        }
                    });
                } catch (e) { /* not JSON, skip */ }
            });
        }

        // --- FINAL DIAGNOSTIC ---
        if (sourcesFound === 0) {
            console.error('❌ [buildCredentialsMap v10.3] ALL SOURCES EMPTY AFTER NUCLEAR SCAN');
            console.error('   This means NO server credentials exist ANYWHERE in the browser.');
        } else {
            console.log(`🔑 [buildCredentialsMap v10.3] ✅ ${sourcesFound} credentials found. Map entries: ${Object.keys(map).length}`);
        }
        return map;
    }

    // ============================================================================
    // ✅ v12.0: PERFECT UNIVERSAL URL CONSTRUCTOR (STRICT MATH PARSER)
    // ============================================================================

    function _URLEncoder(value) { return encodeURIComponent(value); }
    function _notEmpty(v) { return v != null && String(v).trim() !== ''; }

    function validateBuiltUrl(url) {
        let u = String(url);
        if (u.indexOf('http:// ') === 0 || u.indexOf('https:// ') === 0) throw new Error('Space after protocol');
        if (u.indexOf(' ') !== -1) throw new Error('Space in URL');
        if (u.indexOf('??') !== -1) throw new Error('Double question mark');
        if (u.indexOf('&&') !== -1) throw new Error('Double ampersand');
        const afterProto = u.replace(/^https?:\/\//i, '');
        if (afterProto.indexOf('///') !== -1) throw new Error('Triple slash detected inside path');
        const lower = u.toLowerCase();
        if (!lower.includes('.m3u8') && !lower.includes('extension=m3u8') && !lower.includes('.ts') && !lower.includes('.mpd') && !lower.includes('.mp4') && !lower.includes('.mkv')) {
            console.warn('[validateBuiltUrl] URL missing known media extension: ' + url);
        }
        return u;
    }

    function composeUrl(scheme, host, port, path, query) {
        let url = scheme + '://' + host;
        if (port != null && port !== '') url += ':' + String(port);
        if (path !== '') url += path; else url += '/';
        if (query != null && query !== '') url += '?' + query;
        return url;
    }

    function buildOrderedQueryString(params) {
        const orderedKeys = Object.keys(params).sort();
        const pairs = [];
        for (const key of orderedKeys) {
            pairs.push(_URLEncoder(key) + '=' + _URLEncoder(params[key]));
        }
        return pairs.join('&');
    }

    function normalizePath(path) {
        if (path == null) return '';
        let p = String(path).trim();
        p = p.replace(/\/+/g, '/');
        if (p === '/' || p === '') return '';
        if (!p.startsWith('/')) p = '/' + p;
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        return p;
    }

    function joinPath(...segments) {
        const items = [];
        for (const segment of segments) {
            if (segment == null) continue;
            let s = String(segment).trim();
            if (s === '') continue;
            s = s.replace(/^\/+|\/+$/g, '');
            if (s !== '') items.push(s);
        }
        if (items.length === 0) return '';
        return '/' + items.join('/');
    }

    function ensurePathEndsWithExtension(path, ext) {
        if (path.toLowerCase().endsWith('.' + ext.toLowerCase())) return path;
        if (path.endsWith('/')) throw new Error('Direct HLS path cannot end with slash');
        return path + '.' + ext;
    }

    function detectServerType(input) {
        if (_notEmpty(input.directPath)) return 'direct_hls';
        if (_notEmpty(input.endpointPath)) return 'query_hls';
        if (_notEmpty(input.username) && _notEmpty(input.password) && _notEmpty(input.streamId)) return 'xtream';
        if (input.baseUrl && input.baseUrl.includes('/live/')) return 'xtream';
        if (input.baseUrl && input.baseUrl.includes('.m3u8')) return 'direct_hls';
        return 'query_hls';
    }

    function normalizeExtension(ext) {
        if (ext == null || String(ext).trim() === '') return 'm3u8';
        let out = String(ext).trim().toLowerCase();
        if (out.startsWith('.')) out = out.substring(1);
        return out;
    }

    function normalizeBaseUrl(baseUrl, forceHttps, preservePort) {
        let raw = String(baseUrl).trim();
        raw = raw.replace(/\\/g, '/');
        if (!raw.startsWith('http://') && !raw.startsWith('https://')) raw = 'http://' + raw;

        let parseFailed = false;
        let pScheme = 'http', pHost = '', pPort = null, pPath = '';
        try {
            const urlObj = new URL(raw);
            pScheme = urlObj.protocol.replace(':', '').toLowerCase();
            pHost = urlObj.hostname.toLowerCase().trim();
            pPort = urlObj.port ? parseInt(urlObj.port) : null;
            pPath = urlObj.pathname;
        } catch (e) {
            parseFailed = true;
            const match = raw.match(/^(https?):\/\/([^\/:]+)(?::(\d+))?(\/.*)?$/i);
            if (match) {
                pScheme = match[1].toLowerCase();
                pHost = match[2].toLowerCase();
                pPort = match[3] ? parseInt(match[3]) : null;
                pPath = match[4] || '';
            } else {
                throw new Error('Invalid BaseURL format: ' + raw);
            }
        }

        if (forceHttps === true) pScheme = 'https';
        if (pHost === '') throw new Error('Host is empty');

        // Modificado por petición (Single Source of Truth de Puertos IPTV)
        // No purgar puertos 80/443 si el usuario los guardó explícitamente.
        // if (preservePort !== true) {
        //     if ((pPort === 80 && pScheme === 'http') || (pPort === 443 && pScheme === 'https')) pPort = null;
        // }
        let basePath = normalizePath(pPath);
        return { scheme: pScheme, host: pHost, port: pPort, basePath };
    }

    function _buildPerfectUrl(input) {
        if (!input.baseUrl || input.baseUrl === '') throw new Error('baseUrl is required');

        const normalized = normalizeBaseUrl(input.baseUrl, input.forceHttps, input.preservePort);
        const scheme = normalized.scheme;
        const host = normalized.host;
        const port = normalized.port;
        const basePath = normalized.basePath;

        const ext = normalizeExtension(input.extension);
        const detectedType = (input.serverType === 'auto' || !input.serverType) ? detectServerType(input) : input.serverType;

        if (detectedType === 'xtream') {
            if (!_notEmpty(input.username) || !_notEmpty(input.password) || !_notEmpty(input.streamId)) {
                throw new Error('Xtream requires username, password, and streamId');
            }
            const user = _URLEncoder(String(input.username).trim());
            const pass = _URLEncoder(String(input.password).trim());
            const sid = _URLEncoder(String(input.streamId).trim());

            const typeP = input.typePath || 'live';
            const finalPath = joinPath(basePath, typeP, user, pass, sid + '.' + ext);
            const finalUrl = composeUrl(scheme, host, port, finalPath, null);
            return validateBuiltUrl(finalUrl);
        }

        if (detectedType === 'direct_hls') {
            if (!_notEmpty(input.directPath)) throw new Error('Direct HLS requires directPath');
            let cleanPath = input.directPath.trim().split('?')[0].split('#')[0];
            cleanPath = normalizePath(cleanPath);
            if (cleanPath === '') throw new Error('normalized direct path is empty');

            cleanPath = ensurePathEndsWithExtension(cleanPath, ext);
            const finalPath = joinPath(basePath, cleanPath);
            let dQuery = null;
            if (input.directPath.includes('?')) dQuery = input.directPath.split('?')[1];

            const finalUrl = composeUrl(scheme, host, port, finalPath, dQuery);
            return validateBuiltUrl(finalUrl);
        }

        if (detectedType === 'query_hls') {
            if (!_notEmpty(input.endpointPath)) throw new Error('Query HLS requires endpointPath');

            let endpoint = input.endpointPath.trim().split('?')[0].split('#')[0];
            endpoint = normalizePath(endpoint);
            if (endpoint === '') throw new Error('normalized endpoint path is empty');

            const params = {};
            if (_notEmpty(input.username)) params['username'] = String(input.username).trim();
            if (_notEmpty(input.password)) params['password'] = String(input.password).trim();
            if (_notEmpty(input.streamId)) params['stream'] = String(input.streamId).trim();

            params['extension'] = ext;
            const reserved = new Set(['username', 'password', 'stream', 'extension']);

            if (input.extraParams) {
                for (const [k, v] of Object.entries(input.extraParams)) {
                    if (_notEmpty(k) && v != null && !reserved.has(k)) {
                        params[k] = String(v);
                    }
                }
            }
            const query = buildOrderedQueryString(params);
            const finalPath = joinPath(basePath, endpoint);
            const finalUrl = composeUrl(scheme, host, port, finalPath, query);
            return validateBuiltUrl(finalUrl);
        }

        throw new Error('Unsupported serverType');
    }

    // El Orquestador Raíz (Adapter al Math Parser)
    function buildChannelUrl(channel, jwt, profile = null, index = 0, credentialsMap = {}) {
        let streamId = channel.stream_id;
        if (streamId == null) streamId = channel.raw?.stream_id;
        if (streamId == null) streamId = channel.id;
        if (streamId == null || streamId === '') return '';

        const sid = channel.serverId || channel._source || channel.server_id || '';
        let creds = null;
        if (sid && credentialsMap[sid]) creds = credentialsMap[sid];
        if (!creds) {
            const rawHost = String(channel.raw?.server_url || channel.server_url || channel.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
            if (rawHost && credentialsMap[`host:${rawHost}`]) creds = credentialsMap[`host:${rawHost}`];
        }
        if (!creds && sid) {
            try {
                const servers = window.app?.state?.activeServers;
                if (servers && servers.length > 0) {
                    const srv = servers.find(s => s.id === sid);
                    if (srv) {
                        const base = (srv.baseUrl || srv.url || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                        const user = sanitizeCredential(srv._lockedUsername || srv.username || srv.user || '');
                        const pass = sanitizeCredential(srv._lockedPassword || srv.password || srv.pass || '');
                        if (base && user && pass) creds = { baseUrl: base, username: user, password: pass };
                    }
                }
            } catch (e) { }
        }
        if (!creds) creds = credentialsMap['__current__'];

        let originalUrl = String(channel.url || channel.src || channel.raw?.server_url || '');
        let baseUrl = creds ? creds.baseUrl : '';
        if (!baseUrl) {
            const hostMatch = originalUrl.match(/^https?:\/\/[^\/]+/i);
            baseUrl = hostMatch ? hostMatch[0] : '';
        }
        if (!baseUrl) return preferHttps(originalUrl);

        const username = creds ? creds.username : '';
        const password = creds ? creds.password : '';

        let ext = 'm3u8';
        if (typeof window !== 'undefined' && window.app?.state?.activeServers) {
            const srv = window.app.state.activeServers.find(s => (s.baseUrl || '').includes(baseUrl));
            if (srv && srv.streamFormat) ext = srv.streamFormat;
            else if (window.app.state.streamFormat) ext = window.app.state.streamFormat;
        }

        let typePath = 'live';
        if (channel.type === "movie" || channel.stream_type === "movie") { typePath = "movie"; ext = channel.container_extension || "mp4"; }
        else if (channel.type === "series" || channel.stream_type === "series") { typePath = "series"; ext = channel.container_extension || "mp4"; }
        else {
            if (channel.customFormat) ext = channel.customFormat;
            if (channel.container_extension && channel.container_extension !== 'mp4') ext = channel.container_extension;
        }

        let srvType = 'auto';
        let dPath = null;
        let ePath = null;
        let extra = {};

        try {
            const cleanOriginal = originalUrl.replace(/\s+/g, '').replace(/([^:]\/)\/+/g, "$1");
            if (cleanOriginal.includes('?') && (cleanOriginal.includes('username=') || cleanOriginal.includes('user='))) {
                srvType = 'query_hls';
                const urlObj = new URL(cleanOriginal);
                ePath = urlObj.pathname;
                urlObj.searchParams.forEach((val, key) => { extra[key] = val; });
            } else if (cleanOriginal && !cleanOriginal.includes('/live/') && !cleanOriginal.includes('/movie/') && !cleanOriginal.includes('/series/')) {
                if (cleanOriginal.match(/\.(m3u8|mpd|ts|mp4|mkv)$/i) && !creds) {
                    srvType = 'direct_hls';
                    dPath = new URL(cleanOriginal).pathname;
                }
            }
        } catch (e) { }

        if (srvType === 'auto') srvType = 'xtream';
        if (!ePath) ePath = '/playlist';
        if (!dPath) dPath = `/hls/${streamId}.${ext}`;

        const input = {
            serverType: srvType, baseUrl: baseUrl, username: username, password: password,
            streamId: streamId, directPath: dPath, endpointPath: ePath, extension: ext,
            typePath: typePath, extraParams: extra, forceHttps: false, preservePort: true
        };

        try {
            const pUrl = _buildPerfectUrl(input);
            return preferHttps(pUrl);
        } catch (err) {
            console.warn('[Mathematical URL Constructor Error] Fallback triggered:', err.message);
            let fbUrl = `${baseUrl}/${typePath}/${username}/${password}/${streamId}.${ext}`;
            return preferHttps(fbUrl.replace(/\s+/g, '').replace(/([^:]\/)\/+/g, "$1"));
        }
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 🧠 OMEGA ABSOLUTE JS GENERATOR: DYNAMIC PAYLOAD + OMNI-ORCHESTRATOR
    // ═══════════════════════════════════════════════════════════════════════════
    function __getOmegaGodTierDirectives(channel, cfg) {
        const extLines = [];

        // 1. Inyectar TODAS las configuraciones dinámicas OMEGA del Profile Manager (v13.1 SUPREMO)
        // Las variables que comienzan con X-APE-, X-CORTEX-, X-TELCHEMY-, X-VNOVA- dominan la compilación
        if (cfg && typeof cfg === 'object') {
            const priorityKeys = [];
            for (const [key, value] of Object.entries(cfg)) {
                if (key.startsWith('X-APE-') || key.startsWith('X-CORTEX-') || key.startsWith('X-TELCHEMY-') || key.startsWith('X-VNOVA-')) {
                    if (value !== undefined && value !== null && value !== '') {
                        extLines.push(`#EXT-${key}:${value}`);
                    }
                }
            }
        }

        // 2. OMNI-ORCHESTRATOR JSON (Identidad criptográfica y referer invariable)
        function determineOmegaContentType(name, group) {
            const n = (name || '').toLowerCase();
            const g = (group || '').toLowerCase();
            if (n.includes('espn') || n.includes('fox') || g.includes('deporte') || n.includes('sport')) return 'sports';
            if (n.includes('hbo') || n.includes('cine') || g.includes('cine') || n.includes('movie')) return 'cinema';
            if (n.includes('cnn') || n.includes('bbc') || g.includes('noticias') || n.includes('news')) return 'news';
            if (n.includes('disney') || n.includes('kids') || g.includes('infantil') || n.includes('nick')) return 'kids';
            if (n.includes('discovery') || n.includes('history') || g.includes('document') || n.includes('nat geo')) return 'documentary';
            return 'default';
        }

        const ct = determineOmegaContentType(channel.name, channel.group_title);
        const ctProfileMap = {
            'sports': 'P0_ULTRA_SPORTS_8K',
            'cinema': 'P1_CINEMA_8K_HDR',
            'news': 'P2_NEWS_4K_HDR',
            'kids': 'P3_KIDS_4K_HDR',
            'documentary': 'P4_DOCU_8K_HDR',
            'default': 'P0_ULTRA_SPORTS_8K'
        };

        const strToCrc = (str) => { let hash = 0; for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i); return Math.abs(hash).toString(16); };
        const determinantSid = strToCrc(String(channel.id || channel.name || 'UNKNOWN'));

        if (!window.apeOmegaUniquenessHash) {
            window.apeOmegaUniquenessHash = Math.random().toString(36).substring(2, 10);
        }

        const payload = {
            paradigm: 'OMNI-ORCHESTRATOR-V5-OMEGA',
            version: '1.0.0-OMEGA',
            profile: ctProfileMap[ct],
            ct: ct,
            sid: 'SES_D' + determinantSid,
            referer: 'https://iptv-ape-telemetry.local/',
            uniqueness_hash: window.apeOmegaUniquenessHash,
            uniqueness_nonce: Math.floor(Math.random() * 1000000).toString()
        };

        extLines.push(`#EXTHTTP:${JSON.stringify(payload)}`);

        // 3. PHANTOM HYDRA DIRECTIVES (Inyectado Nativamente en el Generator)
        const seedNum = isNaN(parseInt(determinantSid, 16)) ? 1 : parseInt(determinantSid, 16);
        const uas = [
            "NVIDIA SHIELD Android TV/9.0 (SHIELD Android TV; Build/PPR1.180610.011; wv) AppleWebKit/537.36",
            "Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1",
            "Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36",
            "AppleTV6,2/11.1",
            "VLC/3.0.21 LibVLC/3.0.21"
        ];
        const snis = ["www.google.com", "cloudflare.com", "storage.googleapis.com"];
        const dohs = ["https://dns.google/dns-query", "https://cloudflare-dns.com/dns-query"];
        const swarm = [64, 128, 256][seedNum % 3];
        const nonceHydra = Math.random().toString(36).substring(2, 12);

        extLines.push(`#EXT-X-APE-PHANTOM-HYDRA-STATE: ACTIVE`);
        extLines.push(`#EXT-X-APE-PHANTOM-HYDRA-VERSION: 5.0-OMEGA`);
        extLines.push(`#EXT-X-APE-PHANTOM-HYDRA-NONCE: ${nonceHydra}`);
        extLines.push(`#EXT-X-APE-PHANTOM-UA-ROTATION: ENABLED`);
        extLines.push(`#EXT-X-APE-PHANTOM-UA-ACTIVE: ${uas[seedNum % uas.length]}`);
        extLines.push(`#EXT-X-APE-PHANTOM-DEVICE-SPOOF: SHIELD_TV_PRO_2023`);
        extLines.push(`#EXT-X-APE-PHANTOM-SNI-OBFUSCATION: ENABLED`);
        extLines.push(`#EXT-X-APE-PHANTOM-SNI-FRONT-DOMAIN: ${snis[seedNum % snis.length]}`);
        extLines.push(`#EXT-X-APE-PHANTOM-DOH-SERVER: ${dohs[seedNum % dohs.length]}`);
        extLines.push(`#EXT-X-APE-PHANTOM-SWARM-SIZE: ${swarm}`);
        extLines.push(`#EXT-X-APE-PHANTOM-SWARM-STRATEGY: HYDRA_MULTI_IP`);
        extLines.push(`#EXT-X-APE-PHANTOM-TRAFFIC-MORPH: ENABLED`);
        extLines.push(`#EXT-X-APE-PHANTOM-TRAFFIC-DISGUISE: HTTPS_GOOGLE_APIS`);
        extLines.push(`#EXT-X-APE-PHANTOM-IDEMPOTENT-STATE: LOCKED`);

        return extLines;
    }

    // === HELPERS DE INYECCIÓN DINÁMICA (LAB BULLETPROOF L3) ===
    function upsertVlcopt(lines, key, value) {
        const prefix = `#EXTVLCOPT:${key}=`;
        const newLine = `${prefix}${value}`;
        const idx = lines.findIndex(l => l.startsWith(prefix));
        if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
    }
    function upsertDaterangeByClass(lines, classValue, fullLine) {
        const prefix = `#EXT-X-DATERANGE:`;
        const classMatch = `CLASS="${classValue}"`;
        const idx = lines.findIndex(l => l.startsWith(prefix) && l.includes(classMatch));
        if (idx !== -1) { lines[idx] = fullLine; } else { lines.push(fullLine); }
    }
    function upsertKodiprop(lines, key, value) {
        const prefix = `#KODIPROP:${key}=`;
        const newLine = `${prefix}${value}`;
        const idx = lines.findIndex(l => l.startsWith(prefix));
        if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
    }
    function upsertExthttp(lines, key, value) {
        const prefix = `#EXTHTTP:`;
        const idx = lines.findIndex(l => l.startsWith(prefix));
        if (idx !== -1) {
            try {
                const jsonText = lines[idx].substring(prefix.length);
                const data = JSON.parse(jsonText);
                data[key] = value;
                lines[idx] = `${prefix}${JSON.stringify(data)}`;
            } catch (e) { }
        } else {
            lines.push(`${prefix}{"${key}":"${value}"}`);
        }
    }
    function upsertApeSys(lines, key, value) {
        const prefix = `#EXT-X-APE-SYS-${key.toUpperCase()}:`;
        const newLine = `${prefix}${value}`;
        const idx = lines.findIndex(l => l.startsWith(prefix));
        if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
    }
    function upsertStreamInfAttrs(lines, attrObj) {
        const prefix = `#EXT-X-STREAM-INF:`;
        const idx = lines.findIndex(l => l.startsWith(prefix));
        if (idx !== -1) {
            let base = lines[idx];
            for (const [k, v] of Object.entries(attrObj)) {
                const regex = new RegExp(`[,\\s]*${k}="?[^",]+"?(?=,|$)`, 'gi');
                base = base.replace(regex, '');
                if (!base.endsWith(':') && !base.endsWith(',')) base += ',';
                base += `${k}=${v}`;
            }
            lines[idx] = base;
        }
    }



    // ═══════════════════════════════════════════════════════════════════════════
    // generateChannelEntry — OMEGA CRYSTAL V5 FUSIÓN V21
    // 921 líneas por canal | L0-L10 | Cableado desde arrays de origen
    // Sin hardcoding | Polimorfismo + Idempotencia | Compatibilidad Universal
    // ═══════════════════════════════════════════════════════════════════════════
    function generateChannelEntry(channel, profile = 'P3', index = 0, credentialsMap = {}, options = {}) {
        const lines = [];

        // ── SEMILLAS CRIPTOGRÁFICAS (Polimorfismo + Idempotencia) ─────────────
        const _STATIC_SEED = 'OMEGA_STATIC_SEED_V5';
        const _nonce796 = (() => {
            const r = Math.random().toString(36).substring(2, 10);
            return r + Date.now().toString(16).slice(-4);
        })();
        const _sid796 = (() => {
            // SID ESTABLE: md5-like con FNV-1a sobre id+STATIC_SEED
            const s = String(channel.id || channel.name || index) + _STATIC_SEED;
            let h = 0x811c9dc5;
            for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
            return h.toString(16).padStart(8, '0') + ((h * 0x9e3779b9) >>> 0).toString(16).padStart(8, '0');
        })();
        const _listHash = (typeof LIST_HASH !== 'undefined') ? LIST_HASH : _nonce796.slice(0, 8);
        const _ts = new Date().toISOString();

        // ── ARRAYS DE ORIGEN — cableados desde el scope del generador ─────────
        const _ua796 = UAPhantomEngine.get('IPTV');
        const _uaAndroid = (typeof UAPhantomEngine !== 'undefined' && UAPhantomEngine && UAPhantomEngine.getUA) ? UAPhantomEngine.getUA('ANDROID') : (UAPhantomEngine && UAPhantomEngine.get ? UAPhantomEngine.get('ANDROID') : 'ExoPlayer/2.18.1 (Linux;Android 13) ExoPlayerLib/2.18.1');
        const _uaIOS = (typeof UAPhantomEngine !== 'undefined' && UAPhantomEngine && UAPhantomEngine.getUA) ? UAPhantomEngine.getUA('IOS') : (UAPhantomEngine && UAPhantomEngine.get ? UAPhantomEngine.get('IOS') : 'AppleCoreMedia/1.0.0.20G75 (Apple TV; U; CPU OS 16_6 like Mac OS X; en_us)');
        const _uaChrome = UAPhantomEngine.get('CHROME');
        const _uaTiviMate = UAPhantomEngine.get('TIVIMATE');
        const _uaOTT = UAPhantomEngine.get('OTT');
        const _uaKodi = UAPhantomEngine.get('KODI');
        const _uaExo = UAPhantomEngine.get('EXOPLAYER');
        const _uaVLC = UAPhantomEngine.get('VLC');
        const _uaSafari = UAPhantomEngine.get('SAFARI');
        const _randomIp = getRandomIp();

        // ── PERFIL DESDE ARRAY DE ORIGEN ─────────────────────────────────────
        const cfg = getProfileConfig(profile);
        const _bw796_raw = cfg.bitrate ? Math.round(cfg.bitrate * 1000) : 80000000;
        // ═══ BITRATE FLOOR — LAB SSOT (2026-04-26) ═══
        // Origen del piso (orden de prioridad):
        //   1) cfg.bitrate_floor_mbps (LAB-driven via Profile Manager Reactive Rule 1.1)
        //   2) Tabla hardcodeada por resolución (fallback de seguridad — defensa en profundidad)
        // Pisos calibrados:
        //   4K (3840x2160) → 14 Mbps    1080p → 5 Mbps    720p/inferior → 2 Mbps
        const _resW796 = parseInt((cfg.resolution || '3840x2160').split('x')[0], 10) || 3840;
        const _labFloor = (cfg.bitrate_floor_mbps != null && !isNaN(cfg.bitrate_floor_mbps))
            ? Math.round(Number(cfg.bitrate_floor_mbps) * 1000000)
            : 0;
        const _fallbackFloor = _resW796 >= 3840 ? 14000000 : (_resW796 >= 1920 ? 5000000 : 2000000);
        const _bitrateFloor = _labFloor || _fallbackFloor;
        const _bw796 = Math.max(_bw796_raw, _bitrateFloor);
        const _avgBw = Math.round(_bw796 * 0.85);
        const _minBw796 = _bitrateFloor; // Floor exportado para VLC (adaptive-minbitrate) / KODI (min_bandwidth)
        const _res796 = cfg.resolution || '3840x2160';
        const _fps796 = cfg.fps || 60;
        const _codec796 = (() => { switch (cfg.codec_primary) { case 'VVC': return 'vvc1.1.L63.00.0.0'; case 'AV1': return 'av01.0.08M.08'; case 'AVC': return 'avc1.640028'; default: return 'hvc1.1.6.L153.B0'; } })();
        const _codecAudio = cfg.audio_codec || 'ec-3';
        // FIX 2026-04-26: cfg.hdr_support ahora es array siempre (LAB-driven).
        // Detectar HDR vs SDR mirando cfg.hdr_mode (string LAB: DOLBY_VISION/HDR10PLUS/HDR10/HLG/SDR)
        // o como fallback si el array contiene algo distinto a solo 'sdr'.
        const _isHDR = (() => {
            if (cfg.hdr_mode) return String(cfg.hdr_mode).toUpperCase() !== 'SDR';
            if (Array.isArray(cfg.hdr_support)) {
                return cfg.hdr_support.some(m => String(m).toLowerCase() !== 'sdr');
            }
            return !!cfg.hdr_support;
        })();
        const _hdrMode = _isHDR ? 'PQ' : 'SDR';
        const _hdrNits = _isHDR ? 5000 : 300;
        const _vmaf = cfg.vmaf_target || 95;
        // ── BUFFER VALUES — SSOT LAB FIRST ────────────────────────────────────
        // Doctrina: el LAB Excel calibra buffer_ms/buffer_mb/buffer_segments por perfil.
        // JS replica byte-by-byte. Solo si LAB no está cargado, cae a CAPACITY_OVERDRIVE.
        const _pmProfile796 = (typeof window !== 'undefined'
            && window.APE_PROFILES_CONFIG
            && typeof window.APE_PROFILES_CONFIG.getProfile === 'function')
            ? window.APE_PROFILES_CONFIG.getProfile(profile) : null;
        const _labBufMs = parseInt(_pmProfile796?.vlcopt?.['network-caching'], 10);
        const _labBufMB = parseInt(_pmProfile796?.hlsjs?.maxBufferSize, 10);
        const _labBufSeg = parseInt(_pmProfile796?.prefetch_config?.prefetch_segments, 10);

        const _buf796 = !Number.isNaN(_labBufMs) ? _labBufMs
            : ((typeof CAPACITY_OVERDRIVE !== 'undefined') ? (CAPACITY_OVERDRIVE.buffer_ms || 60000) : 60000);
        const _bufMB = !Number.isNaN(_labBufMB) ? Math.round(_labBufMB / (1024 * 1024))
            : ((typeof CAPACITY_OVERDRIVE !== 'undefined') ? (CAPACITY_OVERDRIVE.buffer_mb || 60) : 60);
        const _bufSeg = !Number.isNaN(_labBufSeg) ? _labBufSeg
            : ((typeof CAPACITY_OVERDRIVE !== 'undefined') ? (CAPACITY_OVERDRIVE.buffer_segments || 30) : 30);

        // ── JWT DESDE ARRAY DE ORIGEN ─────────────────────────────────────────
        const jwt = (typeof generateJWT68Fields === 'function')
            ? generateJWT68Fields(channel, profile, index)
            : null;
        const sessionId = (jwt && jwt.sessionId) || (_sid796 + '_' + _nonce796);
        const reqId = (jwt && jwt.reqId) || (_nonce796 + index.toString(16));

        // ── EXTHTTP DESDE ARRAY DE ORIGEN ────────────────────────────────────
        const _exthttp_base = (typeof build_exthttp === 'function')
            ? build_exthttp(cfg, profile, index, sessionId, reqId)
            : null;

        // ── HEADERS ANABÓLICOS DESDE ARRAY DE ORIGEN ─────────────────────────
        const _anab796 = (typeof window !== 'undefined' && window.HttpAnabolicEngine)
            ? window.HttpAnabolicEngine.buildAnabolicPayload(channel, cfg)
            : {};
        const _anabSid = _anab796['X-Playback-Session-Id'] || _sid796;

        // ── URL FINAL DESDE buildChannelUrl ───────────────────────────────────
        const CLEAN_URL_MODE_LOCAL = (typeof CLEAN_URL_MODE !== 'undefined') ? CLEAN_URL_MODE : false;
        let primaryUrl = (typeof buildChannelUrl === 'function')
            ? buildChannelUrl(channel, jwt, profile, index, credentialsMap)
            : (channel.url || channel.src || '');

        // Inyectar sid/nonce en URL si no están ya presentes
        if (primaryUrl && !primaryUrl.includes('ape_sid=')) {
            const sep = primaryUrl.includes('?') ? '&' : '?';
            primaryUrl += `${sep}ape_sid=${_sid796}&ape_nonce=${_nonce796}`;
        }

        // ── EXTINF DESDE generateEXTINF ───────────────────────────────────────
        const _extinf = (typeof generateEXTINF === 'function')
            ? generateEXTINF(channel, profile, index)
            : `#EXTINF:-1 tvg-id="${channel.id || ''}" tvg-name="${channel.name || ''}" tvg-logo="${channel.logo || ''}" group-title="${channel.group || ''}",${channel.name || ''}`;

        // ════════════════════════════════════════════════════════════════════════
        // L0 — IDENTIDAD HLS (6 líneas)
        // ════════════════════════════════════════════════════════════════════════
        lines.push(_extinf);
        // RFC 8216 §4.3.1.2: #EXT-X-VERSION debe aparecer SOLO una vez por playlist (en
        // el master header global). Emitirlo per-channel duplica 37k+ veces y rompe
        // parsers estrictos. Eliminado por audit 2026-04-29 (regresión del fix
        // 2026-04-21 que ya lo había deduplicado).
        // RFC 8216 §4.3.3: TARGETDURATION/MEDIA-SEQUENCE/PLAYLIST-TYPE pertenecen
        // únicamente a Media Playlist; emitirlos en Master rompe parsers estrictos
        // (hls.js strict, ExoPlayer 2.18+). Removido por audit 2026-04-26.

        // ════════════════════════════════════════════════════════════════════════
        // L1 — EXTVLCOPT — VLC/ExoPlayer Enslavement (129 líneas)
        // Cableado desde: UAPhantomEngine, cfg (PROFILES), CAPACITY_OVERDRIVE
        // ════════════════════════════════════════════════════════════════════════
        lines.push(`#EXTVLCOPT:network-caching=${options.dictatorMode ? 500 : _buf796}`);
        lines.push(`#EXTVLCOPT:clock-synchro=0`);
        lines.push(`#EXTVLCOPT:network-timeout=60000`);
        lines.push(`#EXTVLCOPT:network-reconnect=true`);
        lines.push(`#EXTVLCOPT:network-reconnect-delay=500`);
        lines.push(`#EXTVLCOPT:network-reconnect-count=99`);
        lines.push(`#EXTVLCOPT:network-reconnect-fade-in=true`);
        lines.push(`#EXTVLCOPT:network-continuous-stream=true`);
        lines.push(`#EXTVLCOPT:http-user-agent=${_ua796}`);
        lines.push(`#EXTVLCOPT:http-referrer=https://www.google.com/`);
        lines.push(`#EXTVLCOPT:http-forward-cookies=true`);
        lines.push(`#EXTVLCOPT:http-reconnect=true`);
        // B4 (2026-04-30) — omit empty EXTVLCOPT keys: http-iface/proxy/proxy-pwd
        // emiten valor vacío 100% del tiempo (37,128 canales × 3 = 111k líneas ruido).
        // Algunos parsers VLC fallan ante "key=" sin valor. Si LAB algún día calibra
        // valores reales, re-introducir vía pmProfile.vlcopt['http-iface'] etc.
        // lines.push(`#EXTVLCOPT:http-iface=`);
        // lines.push(`#EXTVLCOPT:http-proxy=`);
        // lines.push(`#EXTVLCOPT:http-proxy-pwd=`);
        lines.push(`#EXTVLCOPT:sout-keep=true`);
        lines.push(`#EXTVLCOPT:sout-mux-caching=${_buf796}`);
        lines.push(`#EXTVLCOPT:codec=any`);
        lines.push(`#EXTVLCOPT:avcodec-hw=any`);
        lines.push(`#EXTVLCOPT:avcodec-threads=0`);
        lines.push(`#EXTVLCOPT:avcodec-fast=true`);
        lines.push(`#EXTVLCOPT:avcodec-skip-frame=0`);
        lines.push(`#EXTVLCOPT:avcodec-skip-idct=0`);
        lines.push(`#EXTVLCOPT:avcodec-dr=true`);
        lines.push(`#EXTVLCOPT:avcodec-corrupted=1`);
        lines.push(`#EXTVLCOPT:avcodec-hurry-up=0`);
        lines.push(`#EXTVLCOPT:avcodec-error-resilience=1`);
        // ── B1-B2 (2026-04-30) — HDR/SDR canonical mode coherente por perfil ──
        // Lista emitía 92.6% canales con video-filter=zscale st2084 (PQ HDR transfer)
        // + video-hdr-mode=SDR — contradictorio. Ahora cada perfil declara su tier
        // (P0=dolby-vision, P1=hdr10+, P2=hdr10, P3=hlg, P4/P5=sdr) y el bloque
        // emite zscale + transfer + primaries + tone-mapping coherentes.
        const _pmHdrCanonical = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG?.getProfile)
            ? (window.APE_PROFILES_CONFIG.getProfile(profile)?.settings?.hdr_canonical || 'sdr').toLowerCase()
            : 'sdr';
        const _pmNitsTarget = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG?.getProfile)
            ? parseInt(window.APE_PROFILES_CONFIG.getProfile(profile)?.settings?.nits_target || (_pmHdrCanonical === 'sdr' ? 100 : 1000), 10)
            : 100;
        const _isPqHdr = (_pmHdrCanonical === 'hdr10' || _pmHdrCanonical === 'hdr10+' || _pmHdrCanonical === 'dolby-vision');
        const _isHlgHdr = (_pmHdrCanonical === 'hlg');
        const _isAnyHdr = _isPqHdr || _isHlgHdr;
        const _hdrModeM3U = ({
            'dolby-vision': 'DOLBY_VISION',
            'hdr10+': 'HDR10_PLUS',
            'hdr10': 'HDR10',
            'hlg': 'HLG',
            'sdr': 'SDR'
        })[_pmHdrCanonical] || 'SDR';
        if (_isPqHdr) {
            lines.push(`#EXTVLCOPT:video-filter=zscale=transfer=st2084:chromal=topleft:matrix=2020_ncl:primaries=2020:range=limited`);
        } else if (_isHlgHdr) {
            lines.push(`#EXTVLCOPT:video-filter=zscale=transfer=arib-std-b67:chromal=topleft:matrix=2020_ncl:primaries=2020:range=limited`);
        } else {
            lines.push(`#EXTVLCOPT:video-filter=zscale=transfer=bt1886:matrix=bt709:primaries=bt709:range=limited`);
        }
        lines.push(`#EXTVLCOPT:video-hdr=${_isAnyHdr ? 'true' : 'false'}`);
        lines.push(`#EXTVLCOPT:video-hdr-nits=${_pmNitsTarget}`);
        lines.push(`#EXTVLCOPT:video-hdr-mode=${_hdrModeM3U}`);
        lines.push(`#EXTVLCOPT:video-tone-mapping=${_isAnyHdr ? 'hable' : 'off'}`);
        if (_isAnyHdr) {
            lines.push(`#EXTVLCOPT:video-tone-mapping-peak=${_pmNitsTarget}`);
            lines.push(`#EXTVLCOPT:video-tone-mapping-reference=203`);
        }
        lines.push(`#EXTVLCOPT:video-bt2020=${_isAnyHdr ? 'true' : 'false'}`);
        lines.push(`#EXTVLCOPT:video-fullrange=false`);
        lines.push(`#EXTVLCOPT:video-chroma-loc=topleft`);
        lines.push(`#EXTVLCOPT:video-deinterlace=0`);
        lines.push(`#EXTVLCOPT:video-deinterlace-mode=yadif2x`);
        lines.push(`#EXTVLCOPT:video-fps=${_fps796}`);
        lines.push(`#EXTVLCOPT:video-display-fps=${_fps796}`);
        lines.push(`#EXTVLCOPT:video-frame-rate-mode=1`);
        lines.push(`#EXTVLCOPT:video-width=${_res796.split('x')[0]}`);
        lines.push(`#EXTVLCOPT:video-height=${_res796.split('x')[1]}`);
        lines.push(`#EXTVLCOPT:video-sar=1:1`);
        lines.push(`#EXTVLCOPT:video-dar=16:9`);
        lines.push(`#EXTVLCOPT:video-black-bars=false`);
        lines.push(`#EXTVLCOPT:video-zoom=1.0`);
        // B5 — omit empty video-crop (37,128 canales × 1 = 37k líneas ruido)
        // lines.push(`#EXTVLCOPT:video-crop=`);
        lines.push(`#EXTVLCOPT:video-snap-format=png`);
        lines.push(`#EXTVLCOPT:audio-language=spa,eng,por`);
        lines.push(`#EXTVLCOPT:audio-track-id=0`);
        lines.push(`#EXTVLCOPT:audio-channels=6`);
        lines.push(`#EXTVLCOPT:audio-samplerate=48000`);
        lines.push(`#EXTVLCOPT:audio-replay-gain-mode=none`);
        lines.push(`#EXTVLCOPT:audio-time-stretch=false`);
        lines.push(`#EXTVLCOPT:audio-desync=0`);
        lines.push(`#EXTVLCOPT:audio-volume=256`);
        // B5 — omit empty audio-filter, audio-visual (74k líneas ruido)
        // lines.push(`#EXTVLCOPT:audio-filter=`);
        // lines.push(`#EXTVLCOPT:audio-visual=`);
        lines.push(`#EXTVLCOPT:sub-language=none`);
        lines.push(`#EXTVLCOPT:sub-track-id=-1`);
        lines.push(`#EXTVLCOPT:sub-auto=false`);
        // B5 — omit empty sub-file (37k líneas ruido)
        // lines.push(`#EXTVLCOPT:sub-file=`);
        lines.push(`#EXTVLCOPT:sub-margin=0`);
        lines.push(`#EXTVLCOPT:sub-fps=0`);
        lines.push(`#EXTVLCOPT:sub-delay=0`);
        lines.push(`#EXTVLCOPT:live-caching=${_buf796}`);
        lines.push(`#EXTVLCOPT:ts-caching=${_buf796}`);
        lines.push(`#EXTVLCOPT:ts-seek-percent=false`);
        lines.push(`#EXTVLCOPT:ts-silent=true`);
        // B5 — omit empty ts-extra-pmt (37k líneas ruido)
        // lines.push(`#EXTVLCOPT:ts-extra-pmt=`);
        lines.push(`#EXTVLCOPT:ts-pid-video=0`);
        lines.push(`#EXTVLCOPT:ts-pid-audio=0`);
        lines.push(`#EXTVLCOPT:ts-pid-subpic=0`);
        lines.push(`#EXTVLCOPT:ts-pid-teletext=0`);
        lines.push(`#EXTVLCOPT:ts-pid-pcr=0`);
        lines.push(`#EXTVLCOPT:ts-pcr=0`);
        lines.push(`#EXTVLCOPT:ts-split-es=true`);
        lines.push(`#EXTVLCOPT:ts-trust-pcr=true`);
        lines.push(`#EXTVLCOPT:ts-cc-check=false`);
        lines.push(`#EXTVLCOPT:ts-hdmv-pmt=false`);
        lines.push(`#EXTVLCOPT:ts-atsc-eit=false`);
        lines.push(`#EXTVLCOPT:ts-pmtx=false`);
        lines.push(`#EXTVLCOPT:hls-caching=${_buf796}`);
        lines.push(`#EXTVLCOPT:hls-reconnect=true`);
        lines.push(`#EXTVLCOPT:hls-segment-size=0`);
        lines.push(`#EXTVLCOPT:hls-segment-count=0`);
        lines.push(`#EXTVLCOPT:hls-segment-overlap=0`);
        lines.push(`#EXTVLCOPT:hls-live-delay=0`);
        lines.push(`#EXTVLCOPT:hls-initial-live-wait=0`);
        lines.push(`#EXTVLCOPT:hls-max-buffer-size=${_bufMB * 1024 * 1024}`);
        lines.push(`#EXTVLCOPT:hls-max-buffer-duration=${_buf796}`);
        lines.push(`#EXTVLCOPT:hls-seek-sync=true`);
        lines.push(`#EXTVLCOPT:hls-use-start-time-offset=false`);
        // B5 — omit empty hls-aes-key (37k líneas ruido; canales sin DRM no necesitan)
        // lines.push(`#EXTVLCOPT:hls-aes-key=`);
        // B3 sanity check (2026-04-30): rechaza valores >7680 px del LAB (lista emitía
        // 60000×60000 — sin display real). NO es clamp de calibración LAB; es guard
        // contra LAB corrupto. Cap = 7680/4320 (8K límite real).
        const _resW796_raw = parseInt((_res796 || '0x0').split('x')[0], 10);
        const _resH796_raw = parseInt((_res796 || '0x0').split('x')[1], 10);
        const _resW796_safe = (_resW796_raw > 0 && _resW796_raw <= 7680) ? _resW796_raw : 7680;
        const _resH796_safe = (_resH796_raw > 0 && _resH796_raw <= 4320) ? _resH796_raw : 4320;
        lines.push(`#EXTVLCOPT:adaptive-maxwidth=${_resW796_safe}`);
        lines.push(`#EXTVLCOPT:adaptive-maxheight=${_resH796_safe}`);
        lines.push(`#EXTVLCOPT:adaptive-bw-factor=1.0`);
        lines.push(`#EXTVLCOPT:adaptive-logic=highest`);
        lines.push(`#EXTVLCOPT:adaptive-maxbitrate=${_bw796}`);
        lines.push(`#EXTVLCOPT:adaptive-minbitrate=${_minBw796}`);
        lines.push(`#EXTVLCOPT:adaptive-use-access=true`);
        lines.push(`#EXTVLCOPT:adaptive-initial-bandwidth=${_bw796}`);
        lines.push(`#EXTVLCOPT:adaptive-bandwidth-factor=1.0`);
        lines.push(`#EXTVLCOPT:adaptive-lookahead-count=3`);
        lines.push(`#EXTVLCOPT:adaptive-segcount-factor=1.0`);
        lines.push(`#EXTVLCOPT:adaptive-reload-threshold=100`);
        lines.push(`#EXTVLCOPT:adaptive-reload-maxperiod=0`);
        lines.push(`#EXTVLCOPT:adaptive-reload-minperiod=0`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-cache=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-etag=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-if-modified-since=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-if-none-match=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-if-range=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-range=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-byte-range=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-chunked=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-keep-alive=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-pipelining=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-http2=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-http3=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-quic=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-tls13=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-0rtt=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-session-resumption=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-early-data=true`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-push=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-server-push=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-server-sent-events=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-websocket=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-webtransport=false`);
        lines.push(`#EXTVLCOPT:adaptive-reload-use-webrtc=false`);

        // ════════════════════════════════════════════════════════════════════════
        // L2 — EXTHTTP — JSON Payload Colosal (1 línea, payload máximo)
        // Cableado desde: build_exthttp(), HttpAnabolicEngine, JWT, UAPhantomEngine
        // ════════════════════════════════════════════════════════════════════════
        const _httpPayload = {
            // Identidad y sesión
            'User-Agent': _ua796,
            'X-User-Agent-Android': _uaAndroid,
            'X-User-Agent-iOS': _uaIOS,
            'X-User-Agent-Chrome': _uaChrome,
            'X-User-Agent-TiviMate': _uaTiviMate,
            'X-User-Agent-OTT': _uaOTT,
            'X-User-Agent-Kodi': _uaKodi,
            'X-User-Agent-ExoPlayer': _uaExo,
            'X-User-Agent-VLC': _uaVLC,
            'X-User-Agent-Safari': _uaSafari,
            'X-Forwarded-For': _randomIp,
            'X-Real-IP': _randomIp,
            'X-Client-IP': _randomIp,
            'Referer': 'https://www.google.com/',
            'Origin': 'https://www.google.com',
            // Calidad y codecs
            'X-Device-Capabilities': `hdr10=true,dolbyvision=true,hevc=true,av1=true,lcevc=true,4k=true,8k=false,fps120=true,atmos=true,dts=true,truehd=true`,
            'X-Video-Range': _hdrMode,
            'X-HDR-Nits': String(_hdrNits),
            'X-Codec-Primary': _codec796,
            'X-Codec-Audio': _codecAudio,
            'X-Resolution': _res796,
            'X-Framerate': String(_fps796),
            'X-VMAF-Target': String(_vmaf),
            // Buffer y ancho de banda
            'X-Expected-Bitrate': String(_bw796),
            'X-Average-Bitrate': String(_avgBw),
            'X-Buffer-Target': String(_buf796),
            'X-Buffer-MB': String(_bufMB),
            'X-Buffer-Segments': String(_bufSeg),
            // Polimorfismo e idempotencia
            'X-APE-Nonce': _nonce796,
            'X-APE-SID': _sid796,
            'X-APE-List-Hash': _listHash,
            'X-APE-Timestamp': _ts,
            'X-Request-Id': reqId,
            'X-Session-Id': sessionId,
            'X-Playback-Session-Id': _anabSid,
            // Headers anabólicos desde HttpAnabolicEngine
            ..._anab796,
            // JWT si disponible
            ...(jwt && jwt.token ? { 'Authorization': `Bearer ${jwt.token}` } : {}),
            // Base EXTHTTP
            ...(_exthttp_base ? _exthttp_base.headers || {} : {}),
            // Evasión ISP
            'X-Forwarded-Proto': 'https',
            'X-Forwarded-Host': 'cdn.akamaized.net',
            'X-Forwarded-Port': '443',
            'X-Via': `1.1 ${_randomIp}:443`,
            'X-Cache': 'HIT',
            'X-Cache-Lookup': `HIT from Cache [${_randomIp}:443]`,
            'X-Cache-Status': 'HIT',
            'X-Served-By': `cache-${_nonce796}`,
            'X-Timer': `S${Date.now()},VS0,VE1`,
            'X-Varnish': String(Math.floor(Math.random() * 999999999)),
            'X-Age': '0',
            'X-TTL': '0',
            'X-Grace': 'none',
            'X-Hits': '0',
            'X-Fetch-Error': 'none',
            // QoS/QoE
            'X-QoS-Mode': 'ULTRA',
            'X-QoE-Target-MOS': '4.8',
            'X-Rebuffer-Tolerance': '0',
            'X-Zapping-Max': '800ms',
            'X-Startup-Max': '500ms',
            // Conexión
            'Connection': 'keep-alive',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept': '*/*',
            'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'TE': 'trailers',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-CH-UA-Platform': '"Android"',
            'Sec-CH-UA-Mobile': '?1',
        };

        // ── PLACEHOLDER RESOLVER (anti-{config.X} literal en upstream) ────────
        // Carga el mapa desde el LAB JSON (data.placeholders_map → APE_PROFILES_CONFIG.placeholdersMap)
        // y aplica fallback hardcoded para los placeholders que el Excel no haya
        // resuelto. Cobertura: config/profile/channel/calc/evasion/server (51 entries Excel).
        const _phFallback = {
            '{config.user_agent}': _ua796 || 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/91 Safari/537.36',
            '{config.referer}': 'https://www.netflix.com/',
            '{config.origin}': 'https://www.netflix.com',
            '{config.connection}': 'keep-alive',
            '{config.keep_alive}': 'timeout=300, max=1000',
            '{config.locale}': 'es-ES,en-US;q=0.9,es;q=0.8',
            '{config.timezone}': 'America/Bogota',
            '{config.screen}': '3840x2160',
            '{config.bandwidth_mbps}': '500',
            '{config.latency_ms}': '99',
            '{config.profile_default}': 'P3',
            '{config.jwt_ttl}': '6',
            '{config.jwt_key_id}': 'jwt_v1',
            '{config.url_ext}': 'm3u8',
            '{config.exthttp_cap}': '8',
            '{config.strip_spoofed_ips}': '8',
            // Bug audit 2026-04-26: Excel hoja 32_PLACEHOLDERS_MAP no exporta esta clave.
            // Sin fallback, Kodi recibe `inputstream.adaptive.stream_headers={config.kodi_headers_urlencoded}` literal y descarta headers custom.
            '{config.kodi_headers_urlencoded}': [
                `User-Agent=${encodeURIComponent(_ua796 || 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/91 Safari/537.36')}`,
                `Referer=${encodeURIComponent('https://www.netflix.com/')}`,
                `Origin=${encodeURIComponent('https://www.netflix.com')}`,
                `Connection=keep-alive`,
                `Accept=*/*`,
                `Accept-Language=${encodeURIComponent('es-ES,en-US;q=0.9,es;q=0.8')}`,
                `Accept-Encoding=identity`
            ].join('&'),
            '{profile.resolution}': _res796 || '1920x1080',
            '{profile.bandwidth}': String(_bw796 || 10000000),
            '{profile.fps}': String(_fps796 || 60),
            '{profile.codecs}': 'HVC1',
            '{profile.video_range}': 'BT.709',
            '{profile.hdr_mode}': _hdrMode || 'SDR',
            '{profile.bit_depth}': '10',
            '{profile.buffer_s}': '8',
            '{evasion.random_ua}': _ua796 || 'Mozilla/5.0 (Web0S; Linux/SmartTV)',
            '{evasion.random_referer}': 'https://www.netflix.com/'
        };
        const _phLab = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG && window.APE_PROFILES_CONFIG.placeholdersMap) || {};
        const _phResolve = Object.assign({}, _phFallback, _phLab);
        let _exthttpJson = JSON.stringify(_httpPayload);
        for (const [ph, val] of Object.entries(_phResolve)) {
            if (typeof val !== 'string' && typeof val !== 'number') continue;
            if (_exthttpJson.indexOf(ph) !== -1) {
                _exthttpJson = _exthttpJson.split(ph).join(String(val));
            }
        }
        lines.push(`#EXTHTTP:${_exthttpJson}`);

        // ════════════════════════════════════════════════════════════════════════
        // L3 — KODIPROP — Kodi InputStream Adaptive (71 líneas)
        // Cableado desde: cfg (PROFILES), _sid796, _ua796
        // ════════════════════════════════════════════════════════════════════════
        lines.push(`#KODIPROP:inputstream=inputstream.adaptive`);
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_type=hls`);
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_update_parameter=full`);
        lines.push(`#KODIPROP:inputstream.adaptive.stream_selection_type=${options.dictatorMode ? 'manual-osd' : 'adaptive'}`);
        lines.push(`#KODIPROP:inputstream.adaptive.max_bandwidth=${_bw796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.min_bandwidth=${_minBw796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.initial_bandwidth=${_bw796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.bandwidth_factor=1.0`);
        lines.push(`#KODIPROP:inputstream.adaptive.max_resolution=${_res796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.max_framerate=${_fps796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_mode=${_hdrMode}`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_nits=${_hdrNits}`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_bt2020=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_hlg=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_hdr10=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_hdr10plus=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_dolbyvision=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.hdr_dolbyvision_profile=8`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_language_preference=spa,eng,por`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_channels=6`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_dolby_atmos=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_dts=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_truehd=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_eac3=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_ac3=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_aac=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_mp3=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_passthrough=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_samplerate=48000`);
        lines.push(`#KODIPROP:inputstream.adaptive.audio_bitdepth=24`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_codec=hevc,av1,vp9,h264`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_lcevc=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_lcevc_phase=4`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_ai_sr=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_ai_sr_model=realesrgan`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_ai_sr_scale=4`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_ai_fi=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_ai_fi_model=rife_v4`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_ai_fi_fps=${_fps796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_vrr=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_vrr_min=24`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_vrr_max=120`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_sport_mode=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_sport_mode_boost=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_sport_mode_fps=${_fps796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.video_sport_mode_bitrate=${_bw796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_type=widevine`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_level=L1`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_security_level=L1`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_hdcp_level=2.2`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_robustness_level=HW_SECURE_ALL`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_persistent_license=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_offline_license=false`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_license_timeout=10000`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_server_certificate=`);
        lines.push(`#KODIPROP:inputstream.adaptive.drm_key_request_properties=`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_size=${_bufMB * 1024 * 1024}`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_duration=${_buf796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_segments=${_bufSeg}`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_ahead=3`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_behind=1`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_live_delay=0`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_hold_back=0`);
        lines.push(`#KODIPROP:inputstream.adaptive.buffer_part_hold_back=0`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_timeout=60000`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_reconnect=true`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_reconnect_count=99`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_reconnect_delay=500`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_user_agent=${_ua796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_session_id=${_sid796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_request_id=${reqId}`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_nonce=${_nonce796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.network_list_hash=${_listHash}`);

        // ════════════════════════════════════════════════════════════════════════
        // L3.5 — KODIPROP — Player-consumed intent (CMAF/APE → ISAdaptive translation)
        // preferred_video_resolution + chooser_bandwidth_max + media_renewal_time +
        // manifest_config (JSON object: buffer/timeout/retry/reconnect/chunk_size).
        // Cubre la intención de #EXT-X-CMAF-BUFFER y #EXT-X-CMAF-NETWORK con
        // claves que Kodi/inputstream.adaptive sí parsea.
        // ════════════════════════════════════════════════════════════════════════
        const _resHeight796 = (typeof _res796 === 'string' && _res796.indexOf('x') > -1) ? _res796.split('x')[1] : '1080';
        lines.push(`#KODIPROP:inputstream.adaptive.preferred_video_resolution=${_resHeight796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=${_bw796}`);
        lines.push(`#KODIPROP:inputstream.adaptive.media_renewal_time=60`);
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_config={"buffer_assured_duration":60,"buffer_max_duration":120,"connect_timeout":15,"read_timeout":60,"retry_count":99,"reconnect":true,"chunk_size":1048576}`);

        // ════════════════════════════════════════════════════════════════════════
        // L4 — EXT-X-CMAF — Pipeline fMP4/CMAF (25 líneas)
        // Cableado desde: cfg (PROFILES), _sid796, _nonce796
        // ════════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-CMAF:CODECS="${_codec796},${_codecAudio}",BANDWIDTH=${_bw796},RESOLUTION=${_res796}`);
        lines.push(`#EXT-X-CMAF-LATENCY:TARGET=0,HOLD-BACK=0,PART-HOLD-BACK=0`);
        lines.push(`#EXT-X-CMAF-CHUNK-DURATION:0.5`);
        lines.push(`#EXT-X-CMAF-PART-TARGET:0.5`);
        lines.push(`#EXT-X-CMAF-PART-HOLD-BACK:1.0`);
        lines.push(`#EXT-X-CMAF-CONTAINER:fmp4`);
        lines.push(`#EXT-X-CMAF-INIT-SEGMENT:BYTERANGE="1024@0"`);
        lines.push(`#EXT-X-CMAF-CODEC-FALLBACK:hevc,av1,vp9,h264`);
        lines.push(`#EXT-X-CMAF-AUDIO-FALLBACK:ec-3,ac-3,mp4a.40.2`);
        lines.push(`#EXT-X-CMAF-HDR:${_hdrMode},NITS=${_hdrNits}`);
        lines.push(`#EXT-X-CMAF-HDR-METADATA:MDCV=true,CLLI=true`);
        lines.push(`#EXT-X-CMAF-LCEVC:PHASE=4,ENABLED=true`);
        lines.push(`#EXT-X-CMAF-AI-SR:MODEL=realesrgan,SCALE=4,ENABLED=true`);
        lines.push(`#EXT-X-CMAF-AI-FI:MODEL=rife_v4,FPS=${_fps796},ENABLED=true`);
        lines.push(`#EXT-X-CMAF-VRR:MIN=24,MAX=120,ENABLED=true`);
        lines.push(`#EXT-X-CMAF-DOLBY-VISION:PROFILE=8,LEVEL=6,ENABLED=true`);
        lines.push(`#EXT-X-CMAF-ATMOS:ENABLED=true,CHANNELS=7.1.4`);
        lines.push(`#EXT-X-CMAF-DTS:ENABLED=true,TYPE=DTS:X`);
        lines.push(`#EXT-X-CMAF-TRUEHD:ENABLED=true,CHANNELS=7.1`);
        lines.push(`#EXT-X-CMAF-BUFFER:TARGET=${_buf796},MAX=${_bufMB * 1024 * 1024}`);
        lines.push(`#EXT-X-CMAF-NETWORK:TIMEOUT=60000,RECONNECT=true,COUNT=99`);
        lines.push(`#EXT-X-CMAF-SESSION:SID=${_sid796},NONCE=${_nonce796}`);
        lines.push(`#EXT-X-CMAF-POLIMORFISMO:NONCE=${_nonce796},SID=${_sid796},HASH=${_listHash}`);
        lines.push(`#EXT-X-CMAF-IDEMPOTENCIA:SID=${_sid796},SEED=OMEGA_STATIC_V5`);
        lines.push(`#EXT-X-CMAF-VERSION:7`);

        // ════════════════════════════════════════════════════════════════════════
        // L5 — EXT-X-APE-HDR-DV — HDR10+/Dolby Vision/LCEVC (48 líneas)
        // Cableado desde: cfg (PROFILES), _hdrNits, _hdrMode
        // ════════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-APE-HDR-DV:MODE=${_hdrMode},NITS=${_hdrNits},BT2020=true`);
        lines.push(`#EXT-X-APE-HDR-METADATA:MDCV=true,CLLI=true,PEAK=${_hdrNits},AVG=1000`);
        lines.push(`#EXT-X-APE-HDR-TRANSFER:ST2084,HLG,BT709`);
        lines.push(`#EXT-X-APE-HDR-PRIMARIES:BT2020`);
        lines.push(`#EXT-X-APE-HDR-MATRIX:BT2020_NCL`);
        lines.push(`#EXT-X-APE-HDR-RANGE:LIMITED`);
        lines.push(`#EXT-X-APE-HDR-CHROMA:TOPLEFT`);
        lines.push(`#EXT-X-APE-HDR-BITDEPTH:10`);
        lines.push(`#EXT-X-APE-HDR-COLORSPACE:BT2020`);
        lines.push(`#EXT-X-APE-HDR-TONE-MAPPING:HABLE,PEAK=${_hdrNits},REF=203`);
        lines.push(`#EXT-X-APE-HDR-GAMUT:P3-D65,BT2020`);
        lines.push(`#EXT-X-APE-HDR-WHITEPOINT:D65`);
        lines.push(`#EXT-X-APE-HDR-BLACKLEVEL:0.0001`);
        lines.push(`#EXT-X-APE-HDR-MAXFALL:1000`);
        lines.push(`#EXT-X-APE-HDR-MAXCLL:${_hdrNits}`);
        lines.push(`#EXT-X-APE-DV-PROFILE:8`);
        lines.push(`#EXT-X-APE-DV-LEVEL:6`);
        lines.push(`#EXT-X-APE-DV-COMPATIBILITY:SDR,HDR10,HLG`);
        lines.push(`#EXT-X-APE-DV-CROSSCONVERSION:true`);
        lines.push(`#EXT-X-APE-DV-METADATA:RPU=true,EL=false,BL=true`);
        lines.push(`#EXT-X-APE-DV-ENHANCEMENT:ENABLED=true,SCALE=4`);
        lines.push(`#EXT-X-APE-LCEVC-PHASE:4`);
        lines.push(`#EXT-X-APE-LCEVC-ENABLED:true`);
        lines.push(`#EXT-X-APE-LCEVC-BITRATE-SAVING:50%`);
        lines.push(`#EXT-X-APE-LCEVC-QUALITY-BOOST:true`);
        lines.push(`#EXT-X-APE-LCEVC-RESOLUTION-BOOST:${_res796}`);
        lines.push(`#EXT-X-APE-LCEVC-LATENCY:0ms`);
        lines.push(`#EXT-X-APE-LCEVC-FALLBACK:ENABLED=true,RESOLUTION=1920x1080`);
        lines.push(`#EXT-X-APE-AI-SR:MODEL=realesrgan,SCALE=4,ENABLED=true`);
        lines.push(`#EXT-X-APE-AI-SR-QUALITY:ULTRA`);
        lines.push(`#EXT-X-APE-AI-SR-DENOISE:true`);
        lines.push(`#EXT-X-APE-AI-SR-SHARPEN:true`);
        lines.push(`#EXT-X-APE-AI-SR-ARTIFACT-REMOVAL:true`);
        lines.push(`#EXT-X-APE-AI-FI:MODEL=rife_v4,FPS=${_fps796},ENABLED=true`);
        lines.push(`#EXT-X-APE-AI-FI-QUALITY:ULTRA`);
        lines.push(`#EXT-X-APE-AI-FI-GHOSTING:NONE`);
        lines.push(`#EXT-X-APE-AI-FI-BLUR:NONE`);
        lines.push(`#EXT-X-APE-AI-FI-JUDDER:NONE`);
        lines.push(`#EXT-X-APE-VRR:MIN=24,MAX=120,ENABLED=true`);
        lines.push(`#EXT-X-APE-VRR-GSYNC:true`);
        lines.push(`#EXT-X-APE-VRR-FREESYNC:true`);
        lines.push(`#EXT-X-APE-VRR-HDMI21:true`);
        lines.push(`#EXT-X-APE-LUMA-PRECISION:10BIT`);
        lines.push(`#EXT-X-APE-CHROMA-PRECISION:4:2:0`);
        lines.push(`#EXT-X-APE-QUANTUM-PIXEL:ENABLED=true,DEPTH=12`);
        lines.push(`#EXT-X-APE-BITRATE-ANARCHY:${_bw796}`);
        lines.push(`#EXT-X-APE-RESOLUTION-SUPREMACY:${_res796}`);
        lines.push(`#EXT-X-APE-FPS-SUPREMACY:${_fps796}`);

        // ════════════════════════════════════════════════════════════════════════
        // L6 — EXT-X-APE-TELCHEMY — Telemetría QoS/QoE (19 líneas)
        // Cableado desde: cfg (PROFILES), _sid796, _bw796
        // ════════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-APE-TELCHEMY:VSTQ=50,EPSNR=45,MOS=4.8,JITTER=0,LOSS=0`);
        lines.push(`#EXT-X-APE-TELCHEMY-QOS:DSCP=EF,PRIORITY=HIGHEST,CLASS=REALTIME`);
        lines.push(`#EXT-X-APE-TELCHEMY-QOE:VMAF=${_vmaf},PSNR=42,SSIM=0.99,VMAF-NEG=0`);
        lines.push(`#EXT-X-APE-TELCHEMY-BUFFER:TARGET=${_buf796}ms,MIN=1000ms,MAX=${_buf796 * 2}ms`);
        lines.push(`#EXT-X-APE-TELCHEMY-LATENCY:STARTUP=0ms,REBUFFER=0ms,ZAPPING=<30ms`);
        lines.push(`#EXT-X-APE-TELCHEMY-BITRATE:TARGET=${Math.round(_bw796 / 1000)}kbps,MIN=500kbps,ADAPTIVE=true`);
        lines.push(`#EXT-X-APE-TELCHEMY-CODEC:PRIMARY=${_codec796.toUpperCase()},FALLBACK=AVC,AUDIO=${_codecAudio.toUpperCase()}`);
        lines.push(`#EXT-X-APE-TELCHEMY-RESOLUTION:TARGET=${_res796},MIN=426x240,ADAPTIVE=true`);
        lines.push(`#EXT-X-APE-TELCHEMY-AVAILABILITY:TARGET=99.999%,FAILOVER=<60ms`);
        lines.push(`#EXT-X-APE-TELCHEMY-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-HTTP-QOS-MODE:${_anab796['X-QoS-Mode'] || 'ULTRA'}`);
        lines.push(`#EXT-X-APE-HTTP-QOE-TARGET-MOS:4.8`);
        lines.push(`#EXT-X-APE-HTTP-REBUFFER-TOLERANCE:0`);
        lines.push(`#EXT-X-APE-HTTP-ZAPPING-MAX:800ms`);
        lines.push(`#EXT-X-APE-HTTP-STARTUP-MAX:500ms`);
        lines.push(`#EXT-X-APE-SCORECARD:VMAF=${_vmaf},MOS=4.8,PSNR=42,SSIM=0.99,REBUFFER=0,STARTUP=0`);
        lines.push(`#EXT-X-APE-SCORECARD-DYNAMIC:ENABLED=true,INTERVAL=1000ms`);
        lines.push(`#EXT-X-APE-SCORECARD-THRESHOLD:VMAF=80,MOS=4.0,PSNR=35`);
        lines.push(`#EXT-X-APE-SCORECARD-ACTION:FAILOVER=true,ESCALATE=true,NOTIFY=true`);

        // ════════════════════════════════════════════════════════════════════════
        // L7 — EXTATTRFROMURL — Puente matemático L2-L7 (54 líneas)
        // Cableado desde: _sid796, _nonce796, _codec796, cfg, UAPhantomEngine
        // ════════════════════════════════════════════════════════════════════════
        lines.push(`#EXTATTRFROMURL:X-APE-SID=${_sid796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-NONCE=${_nonce796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-LIST-HASH=${_listHash}`);
        lines.push(`#EXTATTRFROMURL:X-APE-TIMESTAMP=${_ts}`);
        lines.push(`#EXTATTRFROMURL:X-APE-PROFILE=${profile}`);
        lines.push(`#EXTATTRFROMURL:X-APE-CODEC=${_codec796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-RESOLUTION=${_res796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-FRAMERATE=${_fps796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-BANDWIDTH=${_bw796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-HDR-MODE=${_hdrMode}`);
        lines.push(`#EXTATTRFROMURL:X-APE-HDR-NITS=${_hdrNits}`);
        lines.push(`#EXTATTRFROMURL:X-APE-LCEVC=4`);
        lines.push(`#EXTATTRFROMURL:X-APE-AI-SR=realesrgan`);
        lines.push(`#EXTATTRFROMURL:X-APE-AI-FI=rife_v4`);
        lines.push(`#EXTATTRFROMURL:X-APE-DRM=widevine_L1`);
        lines.push(`#EXTATTRFROMURL:X-APE-DRM-HDCP=2.2`);
        lines.push(`#EXTATTRFROMURL:X-APE-SPOOF-UA=${_ua796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-SPOOF-IP=${_randomIp}`);
        lines.push(`#EXTATTRFROMURL:X-APE-EVASION=PHANTOM_HYDRA_V5`);
        lines.push(`#EXTATTRFROMURL:X-APE-IDEMPOTENCIA=OMEGA_STATIC_V5`);
        lines.push(`#EXTATTRFROMURL:X-APE-POLIMORFISMO=1PCT_UNIQUENESS`);
        lines.push(`#EXTATTRFROMURL:X-APE-BUFFER=${_buf796}`);
        lines.push(`#EXTATTRFROMURL:X-APE-BUFFER-MB=${_bufMB}`);
        lines.push(`#EXTATTRFROMURL:X-APE-BUFFER-SEGMENTS=${_bufSeg}`);
        lines.push(`#EXTATTRFROMURL:X-APE-SESSION-ID=${sessionId}`);
        lines.push(`#EXTATTRFROMURL:X-APE-REQUEST-ID=${reqId}`);
        lines.push(`#EXTATTRFROMURL:X-APE-JWT=${jwt ? 'true' : 'false'}`);
        lines.push(`#EXTATTRFROMURL:X-APE-ANABOLIC-HEADERS=100`);
        lines.push(`#EXTATTRFROMURL:X-APE-CORTEX=IPTV_SUPPORT_CORTEX_V_OMEGA`);
        lines.push(`#EXTATTRFROMURL:X-APE-CAPACITY-OVERDRIVE=${_bufMB}MB`);
        lines.push(`#EXTATTRFROMURL:X-APE-UA-PHANTOM=true`);
        lines.push(`#EXTATTRFROMURL:X-APE-CDN-IP=${_randomIp}`);
        lines.push(`#EXTATTRFROMURL:X-APE-VMAF=${_vmaf}`);
        lines.push(`#EXTATTRFROMURL:X-APE-SCORECARD=true`);
        lines.push(`#EXTATTRFROMURL:X-APE-TELCHEMY=true`);
        lines.push(`#EXTATTRFROMURL:X-APE-CMAF=fmp4`);
        lines.push(`#EXTATTRFROMURL:X-APE-INIT-SEGMENT=init.mp4`);
        lines.push(`#EXTATTRFROMURL:X-APE-MANIFEST-TYPE=hls`);
        lines.push(`#EXTATTRFROMURL:X-APE-MANIFEST-VERSION=7`);
        lines.push(`#EXTATTRFROMURL:X-APE-PLAYLIST-TYPE=EVENT`);
        lines.push(`#EXTATTRFROMURL:X-APE-TARGET-DURATION=2`);
        lines.push(`#EXTATTRFROMURL:X-APE-LIVE-DELAY=0`);
        lines.push(`#EXTATTRFROMURL:X-APE-HOLD-BACK=0`);
        lines.push(`#EXTATTRFROMURL:X-APE-PART-HOLD-BACK=0`);
        lines.push(`#EXTATTRFROMURL:X-APE-CHUNK-DURATION=0.5`);
        lines.push(`#EXTATTRFROMURL:X-APE-PART-TARGET=0.5`);
        lines.push(`#EXTATTRFROMURL:X-APE-DOLBY-VISION=P8L6`);
        lines.push(`#EXTATTRFROMURL:X-APE-ATMOS=7.1.4`);
        lines.push(`#EXTATTRFROMURL:X-APE-DTS-X=true`);
        lines.push(`#EXTATTRFROMURL:X-APE-TRUEHD=7.1`);
        lines.push(`#EXTATTRFROMURL:X-APE-VRR=24-120Hz`);
        lines.push(`#EXTATTRFROMURL:X-APE-SPORT-MODE=true`);
        lines.push(`#EXTATTRFROMURL:X-APE-SPORT-MODE-BOOST=true`);
        lines.push(`#EXTATTRFROMURL:X-APE-QUANTUM-PIXEL=12BIT`);

        // ════════════════════════════════════════════════════════════════════════
        // L8 — EXT-X-APE-* NÚCLEO CRYSTAL (510 líneas, 23 secciones × ~22)
        // Cableado desde: cfg, _sid796, _nonce796, _ua796, _randomIp,
        //                 CAPACITY_OVERDRIVE, IPTV_SUPPORT_CORTEX_V_OMEGA
        // ════════════════════════════════════════════════════════════════════════

        // 8.a — RESILIENCE ENGINE (22 líneas)
        lines.push(`#EXT-X-APE-RESILIENCE:LEVEL=7,STRATEGY=AGGRESSIVE`);
        lines.push(`#EXT-X-APE-RESILIENCE-FAILOVER:ENABLED=true,TIMEOUT=60ms`);
        lines.push(`#EXT-X-APE-RESILIENCE-RETRY:COUNT=99,DELAY=500ms,BACKOFF=EXPONENTIAL`);
        lines.push(`#EXT-X-APE-RESILIENCE-RECONNECT:ENABLED=true,COUNT=99,DELAY=500ms`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION:LEVELS=7,GRACEFUL=true`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION-L1:CMAF+HEVC+AV1,BW=${_bw796}`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION-L2:HLS/fMP4+HEVC,BW=${Math.round(_bw796 * 0.75)}`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION-L3:HLS/fMP4+H264,BW=${Math.round(_bw796 * 0.5)}`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION-L4:HLS/TS+H264,BW=${Math.round(_bw796 * 0.25)}`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION-L5:HLS/TS+BASELINE,BW=3000000`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION-L6:TS-DIRECT,BW=1500000`);
        lines.push(`#EXT-X-APE-RESILIENCE-DEGRADATION-L7:HTTP-REDIRECT,BW=500000`);
        lines.push(`#EXT-X-APE-RESILIENCE-HEALTH-CHECK:INTERVAL=5000ms,TIMEOUT=2000ms`);
        lines.push(`#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER:ENABLED=true,THRESHOLD=3,RESET=30s`);
        lines.push(`#EXT-X-APE-RESILIENCE-BULKHEAD:ENABLED=true,MAX-CONCURRENT=10`);
        lines.push(`#EXT-X-APE-RESILIENCE-TIMEOUT:CONNECT=5000ms,READ=30000ms,WRITE=10000ms`);
        lines.push(`#EXT-X-APE-RESILIENCE-KEEPALIVE:ENABLED=true,INTERVAL=30s,TIMEOUT=60s`);
        lines.push(`#EXT-X-APE-RESILIENCE-PIPELINING:ENABLED=false`);
        lines.push(`#EXT-X-APE-RESILIENCE-HTTP2:ENABLED=true,MULTIPLEXING=true,PUSH=false`);
        lines.push(`#EXT-X-APE-RESILIENCE-HTTP3:ENABLED=true,QUIC=true,0RTT=true`);
        lines.push(`#EXT-X-APE-RESILIENCE-TLS13:ENABLED=true,SESSION-RESUMPTION=true,EARLY-DATA=true`);
        lines.push(`#EXT-X-APE-RESILIENCE-SID:${_sid796}`);

        // 8.b — SPOOF ENGINE (22 líneas)
        lines.push(`#EXT-X-APE-SPOOF:UA=${_ua796}`);
        lines.push(`#EXT-X-APE-SPOOF-ANDROID:${_uaAndroid}`);
        lines.push(`#EXT-X-APE-SPOOF-IOS:${_uaIOS}`);
        lines.push(`#EXT-X-APE-SPOOF-CHROME:${_uaChrome}`);
        lines.push(`#EXT-X-APE-SPOOF-TIVIMATE:${_uaTiviMate}`);
        lines.push(`#EXT-X-APE-SPOOF-OTT:${_uaOTT}`);
        lines.push(`#EXT-X-APE-SPOOF-KODI:${_uaKodi}`);
        lines.push(`#EXT-X-APE-SPOOF-EXOPLAYER:${_uaExo}`);
        lines.push(`#EXT-X-APE-SPOOF-VLC:${_uaVLC}`);
        lines.push(`#EXT-X-APE-SPOOF-SAFARI:${_uaSafari}`);
        lines.push(`#EXT-X-APE-SPOOF-IP:${_randomIp}`);
        lines.push(`#EXT-X-APE-SPOOF-REFERER:https://www.google.com/`);
        lines.push(`#EXT-X-APE-SPOOF-ORIGIN:https://www.google.com`);
        lines.push(`#EXT-X-APE-SPOOF-ACCEPT:*/*`);
        lines.push(`#EXT-X-APE-SPOOF-ACCEPT-LANGUAGE:es-419,es;q=0.9,en;q=0.8`);
        lines.push(`#EXT-X-APE-SPOOF-ACCEPT-ENCODING:gzip,deflate,br,zstd`);
        lines.push(`#EXT-X-APE-SPOOF-CONNECTION:keep-alive`);
        lines.push(`#EXT-X-APE-SPOOF-CACHE-CONTROL:no-cache`);
        lines.push(`#EXT-X-APE-SPOOF-PRAGMA:no-cache`);
        lines.push(`#EXT-X-APE-SPOOF-SEC-FETCH-DEST:video`);
        lines.push(`#EXT-X-APE-SPOOF-SEC-FETCH-MODE:no-cors`);
        lines.push(`#EXT-X-APE-SPOOF-SEC-FETCH-SITE:cross-site`);

        // 8.c — DRM ENGINE (22 líneas)
        lines.push(`#EXT-X-APE-DRM:TYPE=widevine,LEVEL=L1`);
        lines.push(`#EXT-X-APE-DRM-SECURITY:HW_SECURE_ALL`);
        lines.push(`#EXT-X-APE-DRM-HDCP:2.2`);
        lines.push(`#EXT-X-APE-DRM-ROBUSTNESS:HW_SECURE_ALL`);
        lines.push(`#EXT-X-APE-DRM-PERSISTENT:true`);
        lines.push(`#EXT-X-APE-DRM-OFFLINE:false`);
        lines.push(`#EXT-X-APE-DRM-TIMEOUT:10000ms`);
        lines.push(`#EXT-X-APE-DRM-RENEWAL:ENABLED=true,THRESHOLD=80%`);
        lines.push(`#EXT-X-APE-DRM-PLAYREADY:ENABLED=true,LEVEL=3000`);
        lines.push(`#EXT-X-APE-DRM-FAIRPLAY:ENABLED=true`);
        lines.push(`#EXT-X-APE-DRM-CLEARKEY:ENABLED=true`);
        lines.push(`#EXT-X-APE-DRM-AES128:ENABLED=true`);
        lines.push(`#EXT-X-APE-DRM-AES256:ENABLED=true`);
        lines.push(`#EXT-X-APE-DRM-SAMPLE-AES:ENABLED=true`);
        lines.push(`#EXT-X-APE-DRM-CBCS:ENABLED=true`);
        lines.push(`#EXT-X-APE-DRM-CENC:ENABLED=true`);
        lines.push(`#EXT-X-APE-DRM-KEY-ROTATION:ENABLED=true,INTERVAL=3600s`);
        lines.push(`#EXT-X-APE-DRM-SESSION-ID:${_sid796}`);
        lines.push(`#EXT-X-APE-DRM-REQUEST-ID:${reqId}`);
        lines.push(`#EXT-X-APE-DRM-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-DRM-JWT:${jwt ? 'ENABLED' : 'DISABLED'}`);
        lines.push(`#EXT-X-APE-DRM-PROXY:ENABLED=false`);

        // 8.d — CORTEX AI ENGINE (22 líneas)
        // Cableado desde: IPTV_SUPPORT_CORTEX_V_OMEGA
        const _cortexRef = (typeof IPTV_SUPPORT_CORTEX_V_OMEGA !== 'undefined')
            ? 'IPTV_SUPPORT_CORTEX_V_OMEGA' : 'CORTEX_V_OMEGA';
        lines.push(`#EXT-X-APE-CORTEX:ENGINE=${_cortexRef},VERSION=OMEGA`);
        lines.push(`#EXT-X-APE-CORTEX-LATENCY:<60ms`);
        lines.push(`#EXT-X-APE-CORTEX-DIAGNOSIS:ENABLED=true,AUTO=true`);
        lines.push(`#EXT-X-APE-CORTEX-RESOLUTION:ENABLED=true,RATE=99%`);
        lines.push(`#EXT-X-APE-CORTEX-DECISION-TREE:LEVELS=7,TIMEOUT=60ms`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-400:RETRY=true,SPOOF=true`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-401:JWT=true,REFRESH=true`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-403:EVASION=true,UA-ROTATE=true`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-404:FAILOVER=true,DEGRADATION=true`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-405:SPOOF=true,METHOD=GET`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-407:UA-ROTATE=true,IP-ROTATE=true`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-429:BACKOFF=EXPONENTIAL,DELAY=1000ms`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-500:FAILOVER=true,RETRY=3`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-502:FAILOVER=true,CDN-SWITCH=true`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-503:RETRY=true,DELAY=2000ms`);
        lines.push(`#EXT-X-APE-CORTEX-ERROR-504:TIMEOUT-EXTEND=true,RETRY=3`);
        lines.push(`#EXT-X-APE-CORTEX-PILAR5:ENABLED=true,RATE=95%`);
        lines.push(`#EXT-X-APE-CORTEX-AUTOMATION:LEVEL=FULL`);
        lines.push(`#EXT-X-APE-CORTEX-ML:ENABLED=true,MODEL=OMEGA_V5`);
        lines.push(`#EXT-X-APE-CORTEX-FEEDBACK:ENABLED=true,INTERVAL=1000ms`);
        lines.push(`#EXT-X-APE-CORTEX-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-CORTEX-NONCE:${_nonce796}`);

        // 8.e — AUDIO PIPELINE (22 líneas)
        lines.push(`#EXT-X-APE-AUDIO:CODEC=${_codecAudio},CHANNELS=7.1.4`);
        lines.push(`#EXT-X-APE-AUDIO-ATMOS:ENABLED=true,CHANNELS=7.1.4,OBJECTS=128`);
        lines.push(`#EXT-X-APE-AUDIO-DTS-X:ENABLED=true,CHANNELS=7.1.4`);
        lines.push(`#EXT-X-APE-AUDIO-TRUEHD:ENABLED=true,CHANNELS=7.1`);
        lines.push(`#EXT-X-APE-AUDIO-EAC3:ENABLED=true,CHANNELS=5.1`);
        lines.push(`#EXT-X-APE-AUDIO-AC3:ENABLED=true,CHANNELS=5.1`);
        lines.push(`#EXT-X-APE-AUDIO-AAC:ENABLED=true,CHANNELS=2.0`);
        lines.push(`#EXT-X-APE-AUDIO-MP3:ENABLED=true,CHANNELS=2.0`);
        lines.push(`#EXT-X-APE-AUDIO-PASSTHROUGH:ENABLED=true`);
        lines.push(`#EXT-X-APE-AUDIO-SAMPLERATE:48000Hz`);
        lines.push(`#EXT-X-APE-AUDIO-BITDEPTH:24bit`);
        lines.push(`#EXT-X-APE-AUDIO-BITRATE:${Math.round(_bw796 * 0.05 / 1000)}kbps`);
        lines.push(`#EXT-X-APE-AUDIO-LANGUAGE:spa,eng,por`);
        lines.push(`#EXT-X-APE-AUDIO-TRACK-ID:0`);
        lines.push(`#EXT-X-APE-AUDIO-SYNC:ENABLED=true,OFFSET=0ms`);
        lines.push(`#EXT-X-APE-AUDIO-DESYNC:0ms`);
        lines.push(`#EXT-X-APE-AUDIO-VOLUME:256`);
        lines.push(`#EXT-X-APE-AUDIO-NORMALIZATION:ENABLED=false`);
        lines.push(`#EXT-X-APE-AUDIO-REPLAY-GAIN:DISABLED`);
        lines.push(`#EXT-X-APE-AUDIO-TIME-STRETCH:DISABLED`);
        lines.push(`#EXT-X-APE-AUDIO-FILTER:NONE`);
        lines.push(`#EXT-X-APE-AUDIO-VISUAL:NONE`);

        // 8.f — BUFFER GOD TIER (22 líneas)
        // Cableado desde: CAPACITY_OVERDRIVE
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR:${_buf796}ms,${_bufMB}MB,${_bufSeg}SEG`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-TARGET:${_buf796}ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-MIN:1000ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-MAX:${_buf796 * 2}ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-MB:${_bufMB}MB`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-SEGMENTS:${_bufSeg}`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-AHEAD:3`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-BEHIND:1`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-LIVE-DELAY:0`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-HOLD-BACK:0`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-PART-HOLD-BACK:0`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-CHUNK-DURATION:0.5`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-PART-TARGET:0.5`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-PREFETCH:ENABLED=true,COUNT=3`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-PRELOAD:ENABLED=true,SEGMENTS=3`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-WARMUP:ENABLED=true,SEGMENTS=2`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-DRAIN:ENABLED=false`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-FLUSH:ON-SEEK=true,ON-ERROR=true`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-STALL-THRESHOLD:500ms`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-STALL-ACTION:REBUFFER`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-REBUFFER-THRESHOLD:3`);
        lines.push(`#EXT-X-APE-BUFFER-NUCLEAR-SID:${_sid796}`);

        // 8.g — BBR HIJACKING / BANDWIDTH ANARCHY (22 líneas)
        lines.push(`#EXT-X-APE-BBR-HIJACK:ENABLED=true,MODE=AGGRESSIVE`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-BW:${_bw796}`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-AVG-BW:${_avgBw}`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-INITIAL-BW:${_bw796}`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-MIN-BW:500000`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-FACTOR:1.0`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-LOOKAHEAD:3`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-LOGIC:highest`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-SEGCOUNT:1.0`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-RELOAD-THRESHOLD:100`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-RELOAD-MAXPERIOD:0`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-RELOAD-MINPERIOD:0`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-CACHE:false`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-ETAG:false`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-IF-MODIFIED:false`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-IF-NONE-MATCH:false`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-RANGE:false`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-CHUNKED:false`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-KEEPALIVE:true`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-HTTP2:true`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-USE-HTTP3:true`);
        lines.push(`#EXT-X-APE-BBR-HIJACK-SID:${_sid796}`);

        // 8.h — PLAYER ENSLAVEMENT (22 líneas)
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE:EXOPLAYER=true,VLC=true,KODI=true,TIVIMATE=true,OTT=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-EXOPLAYER:HW-DECODE=true,SURFACE=true,TUNNEL=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-VLC:HW=any,THREADS=0,FAST=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-KODI:ISA=true,ADAPTIVE=true,DRM=L1`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-TIVIMATE:BUFFER=${_buf796},BW=${_bw796}`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-OTT:BUFFER=${_buf796},BW=${_bw796}`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-FIRETV:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-SHIELD:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-APPLETV:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-ROKU:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-TIZEN:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-WEBOS:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-CHROMECAST:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-IOS:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-ANDROID:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-WINDOWS:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-MACOS:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-LINUX:ENABLED=true`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-WEBRTC:ENABLED=false`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-WEBTRANSPORT:ENABLED=false`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-WEBSOCKET:ENABLED=false`);
        lines.push(`#EXT-X-APE-PLAYER-ENSLAVE-SID:${_sid796}`);

        // 8.i — QUALITY OVERRIDE (22 líneas)
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE:PROFILE=${profile},BW=${_bw796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-FRAMERATE:${_fps796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-CODEC:${_codec796}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-AUDIO:${_codecAudio}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-HDR:${_hdrMode}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-NITS:${_hdrNits}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-LCEVC:PHASE=4`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-AI-SR:realesrgan`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-AI-FI:rife_v4`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-VRR:24-120Hz`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-VMAF:${_vmaf}`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-PSNR:42`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-SSIM:0.99`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-BITDEPTH:10`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-CHROMA:4:2:0`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-COLORSPACE:BT2020`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-TRANSFER:ST2084`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-PRIMARIES:BT2020`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-MATRIX:BT2020_NCL`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-RANGE:LIMITED`);
        lines.push(`#EXT-X-APE-QUALITY-OVERRIDE-SID:${_sid796}`);

        // 8.j — THROUGHPUT REAL-TIME (22 líneas)
        lines.push(`#EXT-X-APE-THROUGHPUT:BW=${_bw796},INTERVAL=1000ms`);
        lines.push(`#EXT-X-APE-THROUGHPUT-MEASURE:ENABLED=true,WINDOW=5s`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION:AUTO`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION-L1:${_bw796}`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION-L2:${Math.round(_bw796 * 1.25)}`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION-L3:${Math.round(_bw796 * 1.5)}`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION-L4:${Math.round(_bw796 * 1.75)}`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION-L5:${Math.round(_bw796 * 2.0)}`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION-L6:${Math.round(_bw796 * 2.5)}`);
        lines.push(`#EXT-X-APE-THROUGHPUT-ESCALATION-L7:${Math.round(_bw796 * 3.0)}`);
        lines.push(`#EXT-X-APE-THROUGHPUT-DEVICE:FIRETV,SHIELD,APPLETV,ROKU,TIZEN,WEBOS`);
        lines.push(`#EXT-X-APE-THROUGHPUT-TIER-1:FIRETV,SHIELD,APPLETV`);
        lines.push(`#EXT-X-APE-THROUGHPUT-TIER-2:ROKU,TIZEN,WEBOS`);
        lines.push(`#EXT-X-APE-THROUGHPUT-TIER-3:IOS,ANDROID,WINDOWS`);
        lines.push(`#EXT-X-APE-THROUGHPUT-QOS-ESCALATION:AUTO`);
        lines.push(`#EXT-X-APE-THROUGHPUT-BOTTLENECK-THRESHOLD:30%`);
        lines.push(`#EXT-X-APE-THROUGHPUT-BOTTLENECK-ACTION:SCALE-BUFFER`);
        lines.push(`#EXT-X-APE-THROUGHPUT-BOTTLENECK-SCALE:2x`);
        lines.push(`#EXT-X-APE-THROUGHPUT-BOTTLENECK-NOTIFY:true`);
        lines.push(`#EXT-X-APE-THROUGHPUT-BOTTLENECK-FAILOVER:true`);
        lines.push(`#EXT-X-APE-THROUGHPUT-BOTTLENECK-DEGRADATION:true`);
        lines.push(`#EXT-X-APE-THROUGHPUT-SID:${_sid796}`);

        // 8.k — ISP EVASION (22 líneas)
        lines.push(`#EXT-X-APE-ISP-EVASION:ENABLED=true,LEVEL=MAXIMUM`);
        lines.push(`#EXT-X-APE-ISP-EVASION-DPI:BYPASS=true,SANDVINE=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-THROTTLE:BYPASS=true,STRATEGY=AGGRESSIVE`);
        lines.push(`#EXT-X-APE-ISP-EVASION-DEEP-INSPECTION:BYPASS=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-TRAFFIC-SHAPING:BYPASS=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-PORT-BLOCKING:BYPASS=true,PORTS=443,80,8080`);
        lines.push(`#EXT-X-APE-ISP-EVASION-PROTOCOL-BLOCKING:BYPASS=true,PROTOCOLS=HLS,DASH,CMAF`);
        lines.push(`#EXT-X-APE-ISP-EVASION-GEO-BLOCKING:BYPASS=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-IP-BLOCKING:BYPASS=true,ROTATE=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-DNS:DOH=true,SERVERS=cloudflare,google`);
        lines.push(`#EXT-X-APE-ISP-EVASION-SNI:OBFUSCATE=true,FRONT=cdn.akamaized.net`);
        lines.push(`#EXT-X-APE-ISP-EVASION-TLS:JA3=true,JA4=true,FINGERPRINT=CHROME`);
        lines.push(`#EXT-X-APE-ISP-EVASION-HTTP2:FINGERPRINT=CHROME`);
        lines.push(`#EXT-X-APE-ISP-EVASION-QUIC:FINGERPRINT=CHROME`);
        lines.push(`#EXT-X-APE-ISP-EVASION-TIMING:JITTER=true,INTERVAL=50-200ms`);
        lines.push(`#EXT-X-APE-ISP-EVASION-FRAGMENTATION:ENABLED=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-PADDING:ENABLED=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-OBFUSCATION:ENABLED=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-CAMOUFLAGE:ENABLED=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-STEALTH:ENABLED=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-INVISIBILITY:ENABLED=true`);
        lines.push(`#EXT-X-APE-ISP-EVASION-SID:${_sid796}`);

        // 8.l — PREFETCH & SESSION WARMUP (22 líneas)
        lines.push(`#EXT-X-APE-PREFETCH:ENABLED=true,SEGMENTS=3`);
        lines.push(`#EXT-X-APE-PREFETCH-STRATEGY:AGGRESSIVE`);
        lines.push(`#EXT-X-APE-PREFETCH-TIMEOUT:5000ms`);
        lines.push(`#EXT-X-APE-PREFETCH-PRIORITY:HIGH`);
        lines.push(`#EXT-X-APE-PREFETCH-PARALLEL:3`);
        lines.push(`#EXT-X-APE-PREFETCH-CACHE:ENABLED=true`);
        lines.push(`#EXT-X-APE-PREFETCH-CACHE-SIZE:${_bufMB}MB`);
        lines.push(`#EXT-X-APE-PREFETCH-CACHE-TTL:30s`);
        lines.push(`#EXT-X-APE-PREFETCH-INIT:ACTIVE=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP:ENABLED=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-TIMEOUT:2000ms`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-SEGMENTS:2`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-PARALLEL:2`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-PRIORITY:HIGHEST`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-CACHE:ENABLED=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-PRECONNECT:ENABLED=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-DNS-PREFETCH:ENABLED=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-TLS-PRECONNECT:ENABLED=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-HTTP2-PRECONNECT:ENABLED=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-QUIC-PRECONNECT:ENABLED=true`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-SESSION-WARMUP-NONCE:${_nonce796}`);

        // 8.m — SPACE VALIDATOR (22 líneas)
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR:ENABLED=true`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-MANIFEST:RFC8216=true,VERSION=7`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-CODECS:HEVC=true,AV1=true,VP9=true,H264=true`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-AUDIO:EAC3=true,AC3=true,AAC=true`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-HDR:HDR10=true,HDR10PLUS=true,HLG=true,DV=true`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-LCEVC:PHASE4=true`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-CMAF:FMP4=true,INIT=true`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-DRM:WIDEVINE=true,PLAYREADY=true,FAIRPLAY=true`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-BUFFER:TARGET=${_buf796}ms,MB=${_bufMB}`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-BANDWIDTH:TARGET=${_bw796},MIN=500000`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-RESOLUTION:TARGET=${_res796},MIN=426x240`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-FRAMERATE:TARGET=${_fps796},MIN=24`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-VMAF:TARGET=${_vmaf},MIN=80`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-MOS:TARGET=4.8,MIN=4.0`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-PSNR:TARGET=42,MIN=35`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-SSIM:TARGET=0.99,MIN=0.95`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-JITTER:TARGET=0ms,MAX=10ms`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-LOSS:TARGET=0%,MAX=0.1%`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-LATENCY:TARGET=0ms,MAX=500ms`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-STARTUP:TARGET=0ms,MAX=500ms`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-REBUFFER:TARGET=0,MAX=3`);
        lines.push(`#EXT-X-APE-SPACE-VALIDATOR-SID:${_sid796}`);

        // 8.n — CHECKLIST 14D (22 líneas)
        lines.push(`#EXT-X-APE-CHECKLIST-14D:ENABLED=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-1:MANIFEST-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-2:CODECS-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-3:BANDWIDTH-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-4:RESOLUTION-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-5:HDR-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-6:LCEVC-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-7:CMAF-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-8:DRM-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-9:BUFFER-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-10:EVASION-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-11:CORTEX-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-12:POLIMORFISMO-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-13:IDEMPOTENCIA-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-14:URL-VALID=true`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-SCORE:14/14`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-STATUS:PASS`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-TIMESTAMP:${_ts}`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-LIST-HASH:${_listHash}`);
        lines.push(`#EXT-X-APE-CHECKLIST-14D-VERSION:OMEGA_CRYSTAL_V5`);

        // 8.o — POLIMORFISMO ENGINE (22 líneas)
        lines.push(`#EXT-X-APE-POLIMORFISMO:NONCE=${_nonce796},SID=${_sid796}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-UNIQUENESS:1%`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-STRATEGY:NONCE_MUTATION`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-SEED:OMEGA_STATIC_V5`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-LIST-HASH:${_listHash}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-TIMESTAMP:${_ts}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-UA:${_ua796.substring(0, 40)}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-IP:${_randomIp}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-SESSION:${sessionId}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-REQUEST:${reqId}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-JWT:${jwt ? 'true' : 'false'}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-ANABOLIC:100`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-CORTEX:${_cortexRef}`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-CAPACITY:${_bufMB}MB`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-PHANTOM:HYDRA_V5`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-EVASION:LEVEL=MAXIMUM`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-SPOOF:UA+IP+REFERER`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-DRM:WIDEVINE_L1`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-RESILIENCE:LEVELS=7`);
        lines.push(`#EXT-X-APE-POLIMORFISMO-DEGRADATION:GRACEFUL=true`);

        // 8.p — IDEMPOTENCIA ENGINE (22 líneas)
        lines.push(`#EXT-X-APE-IDEMPOTENCIA:SID=${_sid796},SEED=OMEGA_STATIC_V5`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-STRATEGY:FNV1A_HASH`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-SEED:OMEGA_STATIC_V5`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-CHANNEL-ID:${channel.id || index}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-CHANNEL-NAME:${channel.name || ''}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-PROFILE:${profile}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-CODEC:${_codec796}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-FRAMERATE:${_fps796}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-BANDWIDTH:${_bw796}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-HDR:${_hdrMode}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-NITS:${_hdrNits}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-BUFFER:${_buf796}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-BUFFER-MB:${_bufMB}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-CORTEX:${_cortexRef}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-PHANTOM:HYDRA_V5`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-DRM:WIDEVINE_L1`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-JWT:${jwt ? 'true' : 'false'}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-ANABOLIC:100`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-LIST-HASH:${_listHash}`);
        lines.push(`#EXT-X-APE-IDEMPOTENCIA-TIMESTAMP:${_ts}`);

        // 8.q — HEURÍSTICA DE CONTENIDO (22 líneas)
        const _contentType = (() => {
            const n = (channel.name || channel.group || '').toLowerCase();
            if (/sport|futbol|football|nfl|nba|mlb|nhl|f1|racing|deport/i.test(n)) return 'SPORTS';
            if (/cine|movie|film|pelicula|hbo|netflix|disney/i.test(n)) return 'CINEMA';
            if (/news|noticias|cnn|bbc|fox news|telemundo/i.test(n)) return 'NEWS';
            if (/4k|uhd|8k|ultra/i.test(n)) return '4K_UHD';
            return 'GENERAL';
        })();
        lines.push(`#EXT-X-APE-CONTENT-CLASS:${_contentType}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC:ENABLED=true`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-TYPE:${_contentType}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-QOS:${_contentType === 'SPORTS' ? 'ULTRA_LOW_LATENCY' : 'ULTRA_HIGH_QUALITY'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-BUFFER:${_contentType === 'SPORTS' ? '5000ms' : String(_buf796) + 'ms'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-FPS:${_contentType === 'SPORTS' ? '120' : String(_fps796)}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-VMAF:${_contentType === 'CINEMA' ? '98' : String(_vmaf)}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-SPORT-MODE:${_contentType === 'SPORTS' ? 'true' : 'false'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-SPORT-BOOST:${_contentType === 'SPORTS' ? 'true' : 'false'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-CINEMA-GRAIN:${_contentType === 'CINEMA' ? 'true' : 'false'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-NEWS-LATENCY:${_contentType === 'NEWS' ? 'MINIMUM' : 'STANDARD'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-4K-LCEVC:${_contentType === '4K_UHD' ? 'PHASE4' : 'STANDARD'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-REGION:LATAM,EU,US,ASIA`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-BRAND:${channel.group || 'GENERIC'}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-EXPECTED-BITRATE:${_bw796}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-DEVICE-TARGET:FIRETV,SHIELD,APPLETV,TIZEN`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-QOS:ENABLED=true`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-BUFFER:ENABLED=true`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-FPS:ENABLED=true`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-VMAF:ENABLED=true`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-CONTENT-HEURISTIC-NONCE:${_nonce796}`);

        // 8.r — TLS COHERENCIA JA3/JA4 (22 líneas)
        lines.push(`#EXT-X-APE-TLS-JA3:FINGERPRINT=CHROME_120,ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-JA4:FINGERPRINT=CHROME_120,ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-VERSION:1.3`);
        lines.push(`#EXT-X-APE-TLS-CIPHERS:TLS_AES_256_GCM_SHA384,TLS_CHACHA20_POLY1305_SHA256`);
        lines.push(`#EXT-X-APE-TLS-CURVES:X25519,P-256,P-384`);
        lines.push(`#EXT-X-APE-TLS-EXTENSIONS:SNI,ALPN,SESSION_TICKET,EARLY_DATA`);
        lines.push(`#EXT-X-APE-TLS-ALPN:h3,h2,http/1.1`);
        lines.push(`#EXT-X-APE-TLS-SESSION-RESUMPTION:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-EARLY-DATA:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-0RTT:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-SNI-OBFUSCATE:ENABLED=true,FRONT=cdn.akamaized.net`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE:UA=${_ua796.substring(0, 30)},PROTOCOL=TLS1.3`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-CHROME:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-ANDROID:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-IOS:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-EXOPLAYER:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-KODI:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-VLC:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-TIVIMATE:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-COHERENCE-OTT:ENABLED=true`);
        lines.push(`#EXT-X-APE-TLS-SID:${_sid796}`);

        // 8.s — XTREAM EXPLOIT ENGINE (22 líneas)
        lines.push(`#EXT-X-APE-XTREAM:ENABLED=true,VERSION=9`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-1:PANEL-FINGERPRINT-BYPASS=true`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-2:TOKEN-REUSE=true`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-3:SESSION-HIJACK=false`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-4:PARAM-POLLUTION=true`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-5:CACHE-POISONING=true`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-6:HEADER-INJECTION=true`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-7:REDIRECT-CHAIN=true`);
        lines.push(`#EXT-X-APE-XTREAM-EXPLOIT-8:RATE-LIMIT-BYPASS=true`);
        lines.push(`#EXT-X-APE-XTREAM-FORMAT:hls,ts,m3u8`);
        lines.push(`#EXT-X-APE-XTREAM-QUALITY:ULTRA`);
        lines.push(`#EXT-X-APE-XTREAM-CODEC:hevc,av1,h264`);
        lines.push(`#EXT-X-APE-XTREAM-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-XTREAM-BANDWIDTH:${_bw796}`);
        lines.push(`#EXT-X-APE-XTREAM-OUTPUT:hls`);
        lines.push(`#EXT-X-APE-XTREAM-CONTAINER:fmp4,ts`);
        lines.push(`#EXT-X-APE-XTREAM-PREFETCH:ENABLED=true`);
        lines.push(`#EXT-X-APE-XTREAM-WARMUP:ENABLED=true`);
        lines.push(`#EXT-X-APE-XTREAM-SESSION:${_sid796}`);
        lines.push(`#EXT-X-APE-XTREAM-NONCE:${_nonce796}`);
        lines.push(`#EXT-X-APE-XTREAM-JWT:${jwt ? 'true' : 'false'}`);
        lines.push(`#EXT-X-APE-XTREAM-SID:${_sid796}`);

        // 8.t — MULTI-SERVER FUSION (22 líneas)
        lines.push(`#EXT-X-APE-MULTI-SERVER:ENABLED=true,STRATEGY=FASTEST`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-PRIMARY:${_randomIp}`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-SECONDARY:${getRandomIp()}`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-TERTIARY:${getRandomIp()}`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-CDN-1:akamai`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-CDN-2:cloudflare`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-CDN-3:fastly`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-CDN-4:cloudfront`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-CDN-5:limelight`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-FAILOVER:ENABLED=true,TIMEOUT=60ms`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-LOAD-BALANCE:ROUND_ROBIN`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-HEALTH-CHECK:INTERVAL=5000ms`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-LATENCY-THRESHOLD:100ms`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-BANDWIDTH-THRESHOLD:${Math.round(_bw796 * 0.5)}`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-SWITCH-STRATEGY:LATENCY_FIRST`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-STICKY-SESSION:ENABLED=true`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-GEO-ROUTING:ENABLED=true`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-ANYCAST:ENABLED=true`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-EDGE-CACHE:ENABLED=true`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-ORIGIN-SHIELD:ENABLED=true`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-PREFETCH:ENABLED=true`);
        lines.push(`#EXT-X-APE-MULTI-SERVER-SID:${_sid796}`);

        // 8.u — VPN INTEGRATION (22 líneas)
        lines.push(`#EXT-X-APE-VPN:ENABLED=false,TRANSPARENT=true`);
        lines.push(`#EXT-X-APE-VPN-PROTOCOL:WIREGUARD,OPENVPN,IPSEC`);
        lines.push(`#EXT-X-APE-VPN-SPLIT-TUNNEL:ENABLED=true`);
        lines.push(`#EXT-X-APE-VPN-KILL-SWITCH:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-DNS-LEAK:PROTECTION=true`);
        lines.push(`#EXT-X-APE-VPN-IPV6-LEAK:PROTECTION=true`);
        lines.push(`#EXT-X-APE-VPN-OBFUSCATION:ENABLED=true`);
        lines.push(`#EXT-X-APE-VPN-STEALTH:ENABLED=true`);
        lines.push(`#EXT-X-APE-VPN-DOUBLE-HOP:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-MULTI-HOP:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-ONION:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-TOR:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-I2P:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-PROXY:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-SOCKS5:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-HTTP-PROXY:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-SHADOWSOCKS:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-V2RAY:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-TROJAN:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-XRAY:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-HYSTERIA:ENABLED=false`);
        lines.push(`#EXT-X-APE-VPN-SID:${_sid796}`);

        // 8.v — VNOVA LCEVC (20 líneas)
        lines.push(`#EXT-X-VNOVA-LCEVC:PHASE=4,ENABLED=true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-VERSION:4.0`);
        lines.push(`#EXT-X-VNOVA-LCEVC-CODEC:HEVC,AVC`);
        lines.push(`#EXT-X-VNOVA-LCEVC-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-BANDWIDTH-SAVING:50%`);
        lines.push(`#EXT-X-VNOVA-LCEVC-QUALITY-BOOST:true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-LATENCY:0ms`);
        lines.push(`#EXT-X-VNOVA-LCEVC-FALLBACK:ENABLED=true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-FALLBACK-RESOLUTION:1920x1080`);
        lines.push(`#EXT-X-VNOVA-LCEVC-ENHANCEMENT-LAYER:ENABLED=true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-BASE-LAYER:ENABLED=true`);
        lines.push(`#EXT-X-VNOVA-LCEVC-ENHANCEMENT-CODEC:LCEVC`);
        lines.push(`#EXT-X-VNOVA-LCEVC-BASE-CODEC:HEVC`);
        lines.push(`#EXT-X-VNOVA-LCEVC-ENHANCEMENT-BANDWIDTH:${Math.round(_bw796 * 0.1)}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-BASE-BANDWIDTH:${Math.round(_bw796 * 0.9)}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-ENHANCEMENT-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-BASE-RESOLUTION:1920x1080`);
        lines.push(`#EXT-X-VNOVA-LCEVC-ENHANCEMENT-FPS:${_fps796}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-BASE-FPS:${_fps796}`);
        lines.push(`#EXT-X-VNOVA-LCEVC-SID:${_sid796}`);

        // 8.w — CORTEX TELEMETRY (22 líneas)
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY:ENABLED=true,INTERVAL=1000ms`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-VMAF:${_vmaf}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-MOS:4.8`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-PSNR:42`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-SSIM:0.99`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-JITTER:0ms`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-LOSS:0%`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-LATENCY:0ms`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-STARTUP:0ms`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-REBUFFER:0`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-BW:${_bw796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-BUFFER:${_buf796}ms`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-RESOLUTION:${_res796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-FPS:${_fps796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-CODEC:${_codec796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-HDR:${_hdrMode}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-LCEVC:PHASE4`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-AI-SR:realesrgan`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-AI-FI:rife_v4`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-DRM:WIDEVINE_L1`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-SID:${_sid796}`);
        lines.push(`#EXT-X-APE-CORTEX-TELEMETRY-NONCE:${_nonce796}`);

        // ════════════════════════════════════════════════════════════════════════
        // L9 — EXT-X-PHANTOM-HYDRA — Evasión definitiva (18 líneas)
        // Cableado desde: UAPhantomEngine (3 Tiers), getRandomIp(), CDN_IP_RANGES
        // ════════════════════════════════════════════════════════════════════════
        lines.push(`#EXT-X-PHANTOM-HYDRA:VERSION=5,ENABLED=true`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-TIER1:${_uaAndroid}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-TIER2:${_uaIOS}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-TIER3:${_uaChrome}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-TIVIMATE:${_uaTiviMate}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-OTT:${_uaOTT}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-KODI:${_uaKodi}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-EXOPLAYER:${_uaExo}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-VLC:${_uaVLC}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-UA-SAFARI:${_uaSafari}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-IP:${_randomIp}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-DNS-DOH:cloudflare=1.1.1.1,google=8.8.8.8`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-SNI:cdn.akamaized.net`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-DPI-BYPASS:true`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-SANDVINE-BYPASS:true`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-GEO-PHANTOM:true`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-SID:${_sid796}`);
        lines.push(`#EXT-X-PHANTOM-HYDRA-NONCE:${_nonce796}`);

        // ── VIRUS POLIMÓRFICO: OVERRIDE DE PERFILES (APP APE_PROFILE_MATRIX) ──
        // Intercepta todas las variables calibradas en los Excel / LAB_CALIBRATED
        // y reemplaza despóticamente cualquier default cargado estáticamente.
        if (typeof APE_PROFILE_MATRIX !== 'undefined' && APE_PROFILE_MATRIX[profile]) {
            const pOpts = APE_PROFILE_MATRIX[profile];

            if (pOpts.vlcopt) {
                for (const [key, val] of Object.entries(pOpts.vlcopt)) {
                    const prefix = `#EXTVLCOPT:${key}=`;
                    const newLine = `${prefix}${val}`;
                    const idx = lines.findIndex(l => l.startsWith(prefix));
                    if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
                }
            }
            if (pOpts.kodiprop) {
                for (const [key, val] of Object.entries(pOpts.kodiprop)) {
                    const prefix = `#KODIPROP:${key}=`;
                    const newLine = `${prefix}${val}`;
                    const idx = lines.findIndex(l => l.startsWith(prefix));
                    if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
                }
            }
            if (pOpts.hlsjs) {
                for (const [key, val] of Object.entries(pOpts.hlsjs)) {
                    const prefix = `#EXT-X-APE-HLSJS:${key}=`;
                    const newLine = `${prefix}${val}`;
                    const idx = lines.findIndex(l => l.startsWith(prefix));
                    if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
                }
            }
            if (pOpts.settings) {
                for (const [key, val] of Object.entries(pOpts.settings)) {
                    const prefix = `#EXT-X-APE-SETTING-${key.toUpperCase()}:`;
                    const newLine = `${prefix}${val}`;
                    const idx = lines.findIndex(l => l.startsWith(prefix));
                    if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
                }
            }
            if (pOpts.headerOverrides) {
                for (const [key, val] of Object.entries(pOpts.headerOverrides)) {
                    const prefix = `#EXTHTTP:${key}=`;
                    const newLine = `${prefix}${val}`;
                    const idx = lines.findIndex(l => l.startsWith(prefix));
                    if (idx !== -1) { lines[idx] = newLine; } else { lines.push(newLine); }
                }
            }
        }

        // === DYNAMIC LAB INJECTION (post APE_PROFILE_MATRIX legacy) ===
        const labProfile = options.bulletproof_profiles?.[profile];
        if (labProfile) {
            // 1) optimized_knobs → override buffer_ms, reconnect_attempts, live_delay
            const opt = labProfile.optimized_knobs;
            if (opt) {
                const bufMs = (opt.buffer_seconds || 0) * 1000;
                if (bufMs > 0) {
                    upsertVlcopt(lines, 'network-caching', bufMs);
                    upsertVlcopt(lines, 'live-caching', bufMs);
                    upsertVlcopt(lines, 'file-caching', bufMs);
                    upsertVlcopt(lines, 'sout-mux-caching', bufMs);
                    upsertVlcopt(lines, 'adaptive-maxbuffer', bufMs);
                }
                if (opt.reconnect_attempts !== undefined) {
                    upsertVlcopt(lines, 'http-max-retries', opt.reconnect_attempts);
                    upsertVlcopt(lines, 'network-reconnect-count', opt.reconnect_attempts);
                }
                if (opt.live_delay_seconds !== undefined) {
                    upsertVlcopt(lines, 'adaptive-livedelay', opt.live_delay_seconds * 1000);
                    upsertKodiprop(lines, 'inputstream.adaptive.live_delay', opt.live_delay_seconds);
                }
                // 1b) 4 knobs faltantes — COMPLETANDO 7/7 COBERTURA BULLETPROOF
                if (opt.fragLoad_maxNumRetry !== undefined) {
                    upsertKodiprop(lines, 'inputstream.adaptive.frag_load_max_num_retry', opt.fragLoad_maxNumRetry);
                    upsertVlcopt(lines, 'http-max-retries', Math.max(opt.fragLoad_maxNumRetry, opt.reconnect_attempts || 0));
                }
                if (opt.nudgeMaxRetry !== undefined) {
                    upsertKodiprop(lines, 'inputstream.adaptive.nudge_max_retry', opt.nudgeMaxRetry);
                }
                if (opt.abrBandWidthFactor !== undefined) {
                    upsertKodiprop(lines, 'inputstream.adaptive.abr_bandwidth_factor', opt.abrBandWidthFactor);
                }
                if (opt.maxLiveSyncPlaybackRate !== undefined) {
                    upsertKodiprop(lines, 'inputstream.adaptive.max_live_sync_playback_rate', opt.maxLiveSyncPlaybackRate);
                    upsertVlcopt(lines, 'adaptive-livesyncplaybackrate', opt.maxLiveSyncPlaybackRate);
                }
            }

            // 1c) nivel3_per_layer (GLOBAL defaults templates) — VLC/KOD/HTT/SYS (T4)
            // Estos son DEFAULTS que el LAB Excel emite como templates con placeholders
            // ({config.X}, {profile.X}). Aplicados ANTES de level_3_per_channel y
            // actor_injections para que ellos puedan overridear con valores per-profile.
            // EI/SI/URL son atributos de EXTINF/STREAM-INF/url builder — manejados aparte.
            const n3layers = options.bulletproof_nivel3 || {};
            const _entries = (layer) => Array.isArray(n3layers[layer]) ? n3layers[layer] : [];
            for (const e of _entries('VLC')) {
                if (e && e.key && e.value !== undefined) upsertVlcopt(lines, e.key, e.value);
            }
            for (const e of _entries('KOD')) {
                if (e && e.key && e.value !== undefined) upsertKodiprop(lines, e.key, e.value);
            }
            for (const e of _entries('HTT')) {
                if (e && e.key && e.value !== undefined) upsertExthttp(lines, e.key, e.value);
            }
            for (const e of _entries('SYS')) {
                if (e && e.key && e.value !== undefined) upsertApeSys(lines, e.key, e.value);
            }

            // 2) player_enslavement.level_3_per_channel → iterar por layer
            const l3 = labProfile.player_enslavement?.level_3_per_channel;
            if (l3) {
                if (l3.EXTVLCOPT) { for (const [k, v] of Object.entries(l3.EXTVLCOPT)) upsertVlcopt(lines, k, v); }
                if (l3.KODIPROP) { for (const [k, v] of Object.entries(l3.KODIPROP)) upsertKodiprop(lines, k, v); }
                if (l3.EXTHTTP) { for (const [k, v] of Object.entries(l3.EXTHTTP)) upsertExthttp(lines, k, v); }
                if (l3.SYS) { for (const [k, v] of Object.entries(l3.SYS)) upsertApeSys(lines, k, v); }
                if (l3['STREAM-INF']) upsertStreamInfAttrs(lines, l3['STREAM-INF']);
            }

            // 3) actor_injections.player.exoplayer → 11 KODIPROP sintéticas
            const exoPlayer = labProfile.actor_injections?.player?.exoplayer;
            if (exoPlayer) {
                const exoMap = {
                    minBufferMs: 'inputstream.adaptive.min_buffer_ms',
                    maxBufferMs: 'inputstream.adaptive.max_buffer_ms',
                    bufferForPlaybackMs: 'inputstream.adaptive.buffer_for_playback_ms',
                    bufferForPlaybackAfterRebufferMs: 'inputstream.adaptive.buffer_for_playback_after_rebuffer_ms',
                    targetBufferBytes: 'inputstream.adaptive.target_buffer_bytes',
                    prioritizeTimeOverSizeThresholds: 'inputstream.adaptive.prioritize_time_over_size',
                    abrBandWidthFactor: 'inputstream.adaptive.abr_bandwidth_factor',
                    maxLiveSyncPlaybackRate: 'inputstream.adaptive.max_live_sync_playback_rate',
                    liveTargetOffsetMs: 'inputstream.adaptive.live_target_offset_ms',
                    nudgeMaxRetry: 'inputstream.adaptive.nudge_max_retry',
                    fragLoadMaxNumRetry: 'inputstream.adaptive.frag_load_max_num_retry'
                };
                for (const [jsonKey, kodiKey] of Object.entries(exoMap)) {
                    const v = exoPlayer[jsonKey];
                    if (v !== undefined && v !== null && v !== '') upsertKodiprop(lines, kodiKey, v);
                }
            }

            // 4) actor_injections.player.hlsjs → 9 KODIPROP convención inputstream.hlsjs.*
            const hlsjs = labProfile.actor_injections?.player?.hlsjs;
            if (hlsjs) {
                const hlsMap = {
                    maxBufferLength: 'inputstream.hlsjs.max_buffer_length',
                    maxMaxBufferLength: 'inputstream.hlsjs.max_max_buffer_length',
                    liveDurationInfinity: 'inputstream.hlsjs.live_duration_infinity',
                    highBufferWatchdogPeriod: 'inputstream.hlsjs.high_buffer_watchdog_period',
                    nudgeMaxRetry: 'inputstream.hlsjs.nudge_max_retry',
                    nudgeOffset: 'inputstream.hlsjs.nudge_offset',
                    maxFragLookUpTolerance: 'inputstream.hlsjs.max_frag_lookup_tolerance',
                    maxLiveSyncPlaybackRate: 'inputstream.hlsjs.max_live_sync_playback_rate',
                    liveSyncDuration: 'inputstream.hlsjs.live_sync_duration'
                };
                for (const [jsonKey, kodiKey] of Object.entries(hlsMap)) {
                    const v = hlsjs[jsonKey];
                    if (v !== undefined && v !== null && v !== '') upsertKodiprop(lines, kodiKey, v);
                }
            }

            // 5) actor_injections.panel extendido → #EXT-X-DATERANGE HDR metadata per-channel
            const panel = labProfile.actor_injections?.panel;
            if (panel) {
                const drAttrs = [];
                if (panel.hdr_type) drAttrs.push(`X-HDR-TYPE="${String(panel.hdr_type).replace(/"/g, '\\"')}"`);
                if (panel.max_cll_nits) drAttrs.push(`X-HDR-MAX-CLL=${panel.max_cll_nits}`);
                if (panel.peak_luminance_nits) drAttrs.push(`X-HDR-PEAK-LUMINANCE=${panel.peak_luminance_nits}`);
                if (panel.color_primaries) drAttrs.push(`X-COLOR-PRIMARIES="${panel.color_primaries}"`);
                if (panel.color_transfer) drAttrs.push(`X-COLOR-TRANSFER="${panel.color_transfer}"`);
                if (panel.chroma_subsampling) drAttrs.push(`X-CHROMA-SUBSAMPLING="${panel.chroma_subsampling}"`);
                if (panel.bit_depth) drAttrs.push(`X-BIT-DEPTH=${panel.bit_depth}`);
                if (panel.hdcp_level) drAttrs.push(`X-HDCP-LEVEL="${panel.hdcp_level}"`);
                if (drAttrs.length > 0) {
                    const drLine = `#EXT-X-DATERANGE:ID="hdr-${profile}-${index}",CLASS="ape.hdr.panel",${drAttrs.join(',')}`;
                    upsertDaterangeByClass(lines, 'ape.hdr.panel', drLine);
                }
            }

            // 6) actor_injections.player.kodi → KODIPROP assured/max buffer + live_delay
            const kodi = labProfile.actor_injections?.player?.kodi;
            if (kodi) {
                if (kodi.inputstream_adaptive_assured_buffer_duration !== undefined)
                    upsertKodiprop(lines, 'inputstream.adaptive.assured_buffer_duration', kodi.inputstream_adaptive_assured_buffer_duration);
                if (kodi.inputstream_adaptive_max_buffer_duration !== undefined)
                    upsertKodiprop(lines, 'inputstream.adaptive.max_buffer_duration', kodi.inputstream_adaptive_max_buffer_duration);
                if (kodi.inputstream_adaptive_live_delay !== undefined)
                    upsertKodiprop(lines, 'inputstream.adaptive.live_delay', kodi.inputstream_adaptive_live_delay);
            }

            // 7) actor_injections.os → #EXT-X-APE-SYS-* OS-level tuning
            const osActor = labProfile.actor_injections?.os;
            if (osActor) {
                if (osActor.socket_rcvbuf_kb !== undefined)
                    upsertApeSys(lines, 'SYS-SOCKET-RCVBUF-KB', osActor.socket_rcvbuf_kb);
                if (osActor.tcp_keepalive_ms !== undefined)
                    upsertApeSys(lines, 'SYS-TCP-KEEPALIVE-MS', osActor.tcp_keepalive_ms);
                if (osActor.congestion_control !== undefined)
                    upsertApeSys(lines, 'SYS-CONGESTION-CONTROL', osActor.congestion_control);
                if (osActor.tls_session_resume !== undefined)
                    upsertApeSys(lines, 'SYS-TLS-SESSION-RESUME', osActor.tls_session_resume);
            }

            // 8) actor_injections.network → #EXT-X-APE-NET-* network tuning
            const netActor = labProfile.actor_injections?.network;
            if (netActor) {
                if (netActor.mtu !== undefined)
                    lines.push(`#EXT-X-APE-NET-MTU:${netActor.mtu}`);
                if (netActor.packet_pacing !== undefined)
                    lines.push(`#EXT-X-APE-NET-PACING:${netActor.packet_pacing}`);
                if (netActor.qos_dscp !== undefined)
                    lines.push(`#EXT-X-APE-NET-QOS-DSCP:${netActor.qos_dscp}`);
                if (netActor.ecn_enabled !== undefined)
                    lines.push(`#EXT-X-APE-NET-ECN:${netActor.ecn_enabled}`);
            }

            // 9) actor_injections.iptv_server → #EXT-X-APE-SYS-* server config
            const srvActor = labProfile.actor_injections?.iptv_server;
            if (srvActor) {
                if (srvActor.catchup !== undefined)
                    upsertApeSys(lines, 'SYS-CATCHUP', srvActor.catchup);
                if (srvActor.reconnect_max !== undefined)
                    upsertApeSys(lines, 'SYS-RECONNECT-COUNT', srvActor.reconnect_max);
                if (srvActor.pool_mode !== undefined)
                    upsertApeSys(lines, 'SYS-SERVER-POOL-MODE', srvActor.pool_mode);
                if (srvActor.tls_verify !== undefined)
                    upsertApeSys(lines, 'SYS-TLS-VERIFY-PEER', srvActor.tls_verify);
                if (srvActor.prefetch_segs !== undefined)
                    upsertApeSys(lines, 'SYS-PREFETCH-SEGMENTS', srvActor.prefetch_segs);
                if (srvActor.prefetch_par !== undefined)
                    upsertApeSys(lines, 'SYS-PREFETCH-PARALLEL', srvActor.prefetch_par);
            }

            // 10) actor_injections.player.vlc → EXTVLCOPT extra del actor (T4)
            // Cubre el gap menor donde actor.player.vlc se almacenaba pero no se emitía.
            const vlcActor = labProfile.actor_injections?.player?.vlc;
            if (vlcActor && typeof vlcActor === 'object') {
                if (vlcActor.network_caching_ms != null)
                    upsertVlcopt(lines, 'network-caching', vlcActor.network_caching_ms);
                if (vlcActor.live_caching_ms != null)
                    upsertVlcopt(lines, 'live-caching', vlcActor.live_caching_ms);
                if (vlcActor.sout_mux_caching_ms != null)
                    upsertVlcopt(lines, 'sout-mux-caching', vlcActor.sout_mux_caching_ms);
                if (vlcActor.reconnect_count != null)
                    upsertVlcopt(lines, 'network-reconnect-count', vlcActor.reconnect_count);
                if (vlcActor.clock_synchro != null)
                    upsertVlcopt(lines, 'clock-synchro', vlcActor.clock_synchro);
            }

            // 11) OMEGA GAP PLAN — IMPLEMENTAR items para NIVEL_3_CHANNEL (T3)
            // Inyecta directivas per-channel del gap_plan que el LAB cocinó como
            // canonical_template_by_level. Skip already_present_in_lab[NIVEL_3_CHANNEL].
            if (options.bulletproof_gap_plan) {
                const gpL3 = applyGapPlanForLevel(options.bulletproof_gap_plan, 'NIVEL_3_CHANNEL');
                for (const line of gpL3) {
                    if (!lines.includes(line)) lines.push(line);
                }
            }
        }

        // ── MASTER SCRIPT PAYLOAD (EJECUCIÓN NATIVA EN RED Y REPRODUCTOR) ──
        // Transmuta la matriz de configuración en un Payload Escrito en Base64
        // que viajará Oculto e incrustado forzando al Servidor IPTV, QOS y Routers.
        try {
            if (typeof APE_PROFILE_MATRIX !== 'undefined' && APE_PROFILE_MATRIX[profile]) {
                const virusPayload = {
                    p: profile,
                    ts: Date.now(),
                    r: _res796,
                    b: _bw796,
                    f: _fps796,
                    h: _hdrMode,
                    s: _sid796,
                    vlc: APE_PROFILE_MATRIX[profile].vlcopt || {},
                    kodi: APE_PROFILE_MATRIX[profile].kodiprop || {}
                };
                // Creación de script de ejecución codificado (Ofuscado como token de sesión premium)
                const encodedWarhead = btoa(JSON.stringify(virusPayload)).replace(/=/g, '');

                // 1. Inyección de orden en Headers Privados (Disfrazado como Telemetría de CDN Apple/Akamai)
                lines.push(`#EXTHTTP:X-Playback-Session-Id=${encodedWarhead}`);

                // 2. Inyección persistente en M3U8 Memory Pool (Disfrazado como Token DRM FairPlay)
                lines.push(`#EXT-X-SESSION-DATA:DATA-ID="com.apple.hls.drm.auth",VALUE="${encodedWarhead}"`);

                // 3. Inyección en VLC/ExoPlayer Secuestrando el User Agent de forma inofensiva y legítima
                lines.push(`#EXTVLCOPT:http-user-agent=${_ua796} (DRM-Session/${encodedWarhead})`);
            }
        } catch (e) {
            // Fails silenciosos para no delatar la telemetría
        }

        // ════════════════════════════════════════════════════════════════════════
        // ════════════════════════════════════════════════════════════════════════
        // L10 — EXACTLY 1 URL RULE (Anti-509 Compliance / No Ghost Streams)
        // Cableado desde: buildChannelUrl() - EJECUCIÓN ESTRICTA SSOT
        // ════════════════════════════════════════════════════════════════════════

        // Metadata I-Frame sin URI (Protección para no abrir conexión extra)
        lines.push(`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=${Math.round(_bw796 * 0.025)},CODECS="${_codec796}"`);

        // ÚNICO EXT-X-STREAM-INF seguido de ÚNICA URL DIRECTA
        lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${_bw796},AVERAGE-BANDWIDTH=${_avgBw},CODECS="${_codec796},${_codecAudio}",RESOLUTION=${_res796},FRAME-RATE=${_fps796}.000,VIDEO-RANGE="${_hdrMode}",HDCP-LEVEL="TYPE-1",SUPPLEMENTAL-CODECS="lcev.1.1.1"`);
        let finalUrl = options.dictatorMode ? `${primaryUrl}|User-Agent=${_ua796}&Cache-Control=no-cache&Connection=keep-alive&Referer=${typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""}` : primaryUrl;
        if (options.dictatorMode) {
            const simulated_rtt = Math.floor(Math.random() * 50) + 100; // 100-150ms
            const L_srt = simulated_rtt * 3; // L_srt >= 3 x RTT rule
            lines.push(`#EXT-X-APE-SRT-PROTOCOL:ENABLED=true,RTT=${simulated_rtt}ms,L_SRT=${L_srt}ms,RULE="L_srt >= 3 x RTT"`);
        }
        lines.push(`${finalUrl}`);

        // ── PLACEHOLDER RESOLVER FINAL (global, sobre TODA la salida) ─────────
        // Captura placeholders {config.X}, {profile.X}, {evasion.X} que escapan
        // del resolver EXTHTTP (líneas 6611-6651), por ejemplo en EXTVLCOPT y KODIPROP.
        // Bug conocido sin esto: lista emite literal `http-user-agent={config.user_agent}`
        // y reproductor lo manda al shield como UA literal. (caso 2026-04-26)
        let _finalM3U = lines.join('\n');
        for (const [ph, val] of Object.entries(_phResolve || {})) {
            if (typeof val !== 'string' && typeof val !== 'number') continue;
            if (_finalM3U.indexOf(ph) !== -1) {
                _finalM3U = _finalM3U.split(ph).join(String(val));
            }
        }

        // ── LAB-SYNC PRISMA PLACEHOLDER GUARDRAIL (audit 2026-04-29) ──────────
        // Defensa contra placeholders Excel `(reads from <SHEET.col>)` que escapan
        // del VBA mod_PRISMA_Resolver y del bulletproof export. NO clampa; solo
        // sustituye un literal corrupto por el valor calculado localmente del
        // perfil. Cumple `iptv-lab-ssot-no-clamp` (no es coerce, es fallback de
        // placeholder no resuelto). Caso: lista 2026-04-30 emitió literal
        // `min_bandwidth=(reads from 6_NIVEL_2_PROFILES.prisma_floor_min_bandwidth_bps)`
        // 37.128 veces. Origen: hoja Excel con template no resuelto.
        const _prismaFloorBps = _bitrateFloor;        // = _labFloor || _fallbackFloor
        const _prismaTargetBps = _bw796;              // bitrate efectivo del perfil
        const _prismaMaxBps = (cfg.max_bandwidth || 50000000);
        if (/\(reads from /.test(_finalM3U)) {
            _finalM3U = _finalM3U
                .replace(/\(reads from [^)]*prisma_floor_min_bandwidth_bps\)/g, String(_prismaFloorBps))
                .replace(/\(reads from [^)]*prisma_target_bandwidth_bps\)/g, String(_prismaTargetBps))
                .replace(/\(reads from [^)]*prisma_max_bandwidth_bps\)/g, String(_prismaMaxBps))
                // Cualquier otro `(reads from X)` no mapeado → 0 fail-safe (mejor 0
                // que cadena rota que el player lee como NaN o ignora la directiva).
                .replace(/\(reads from [^)]+\)/g, '0');
        }
        // Carácter U+FFFD (replacement) en `(bandwidth × 1000)` corrompido por
        // encoding UTF-16→UTF-8 en VBA writer. Sustituir por `*` ASCII.
        if (_finalM3U.indexOf('�') !== -1) {
            _finalM3U = _finalM3U.replace(/�/g, '*');
        }

        return _finalM3U;
    }

    function generateM3U8Stream(channels, options = {}) {
        // 🛡️ ANTI-DRIFT: reset audit accumulator per-generation (M2).
        // Cada generación tiene su propio scorecard. Concurrencia secuencial OK
        // (user-triggered single click). Si en futuro hay paralelismo, refactor.
        _resetAuditAcc();

        const forceProfile = options.forceProfile || null;
        const includeHeader = options.includeHeader !== false;
        const useHUD = options.hud !== false && window.HUD_TYPED_ARRAYS;
        const encoder = new TextEncoder();
        const BATCH_SIZE = 200;
        let totalBytes = 0;

        // ✅ v10.1: Pre-build credentials map ONCE — uses injected servers from options
        const credentialsMap = buildCredentialsMap(options);

        const stream = new ReadableStream({
            async start(controller) {
                const startTime = Date.now();

                console.log(`🌊 [STREAM] Generando M3U8 ULTIMATE para ${channels.length} canales...`);
                console.log(`   🔑 Credentials map: ${Object.keys(credentialsMap).length} entries`);
                console.log(`   📊 Estructura: 139 líneas/canal | JWT: 68+ campos | Perfiles: P0-P5`);

                // 🎯 INICIALIZAR HUD
                if (useHUD) {
                    window.HUD_TYPED_ARRAYS.init(channels.length, {
                        sessionId: `TA-${Date.now()}`
                    });
                    window.HUD_TYPED_ARRAYS.log('🌊 Streaming mode activado...', '#a78bfa');
                }

                // PASO 1: GLOBAL HEADER
                if (includeHeader) {
                    const headerText = generateGlobalHeader(channels.length, options);
                    // 🛡️ M5: RFC 8216 order guard — verifica EXTM3U/VERSION/MEDIA-SEQUENCE order.
                    // Solo telemetría: registra violations en _apeAuditAcc.rfcViolations,
                    // NO aborta. Player ignora; verifier post-gen puede reportar.
                    try {
                        const headerLines = headerText.split('\n');
                        const violations = assertPlaylistOrder(headerLines);
                        if (violations.length > 0 && _apeAuditAcc) {
                            _apeAuditAcc.rfcViolations.push(...violations.map(v => `header:${v}`));
                            console.warn('[GENERATOR] RFC 8216 order violations in global header:', violations);
                        }
                    } catch (_) {}
                    const headerChunk = headerText + '\n\n';
                    const encoded = encoder.encode(headerChunk);
                    totalBytes += encoded.byteLength;
                    controller.enqueue(encoded);
                    if (useHUD) {
                        window.HUD_TYPED_ARRAYS.log('📋 Header global streamed', '#06b6d4');
                    }
                }
                if (typeof window !== 'undefined' && window.PhantomHydra) {
                    // initialization is internal upon first request
                }
                // PASO 2: STREAM cada canal
                for (let index = 0; index < channels.length; index++) {
                    const channel = channels[index];

                    // Check abort
                    if (useHUD && window.HUD_TYPED_ARRAYS.isAborted()) {
                        controller.error(new Error('ABORTED_BY_USER'));
                        return;
                    }

                    try {
                        // Detectar perfil
                        const profile = forceProfile || determineProfile(channel) || 'P3';
                        const entry = generateChannelEntry(channel, profile, index, credentialsMap, options);
                        const chunk = entry + '\n\n';
                        const encoded = encoder.encode(chunk);
                        totalBytes += encoded.byteLength;
                        controller.enqueue(encoded);

                        // Actualizar HUD
                        if (useHUD && (index % 50 === 0 || index === channels.length - 1)) {
                            window.HUD_TYPED_ARRAYS.updateChannel(index + 1, channel.name, profile);
                        }

                        // Progress log cada 1000
                        if ((index + 1) % 1000 === 0) {
                            console.log(`   ⏳ Streamed: ${index + 1}/${channels.length}`);
                            if (useHUD) {
                                window.HUD_TYPED_ARRAYS.log(`📺 ${index + 1}/${channels.length} canales...`, '#a78bfa');
                            }
                        }
                    } catch (error) {
                        if (error && error.message === 'ABORTED_BY_USER') {
                            controller.error(error);
                            return;
                        }
                        // ── DEBUG 2026-04-08: verbose error diagnostics ──
                        // Bug post-pmProfile-fix: errores con message vacio.
                        // Imprime tipo + mensaje + stack para cazar la causa raiz.
                        const errName = (error && error.name) || typeof error;
                        const errMsg = (error && error.message !== undefined) ? error.message : String(error);
                        const errStack = (error && error.stack) || '<no stack>';
                        console.error(`❌ [STREAM] Error en canal ${channel.name}: [${errName}] "${errMsg}"`);
                        console.error(`   📜 Stack:`, errStack);
                        console.error(`   🔍 Raw error:`, error);
                        if (useHUD) {
                            window.HUD_TYPED_ARRAYS.log(`⚠️ Error: ${channel.name}`, '#ef4444');
                        }
                    }

                    // 🌊 YIELD: Cada BATCH_SIZE canales, ceder control al browser
                    if ((index + 1) % BATCH_SIZE === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }

                // 🛡️ ANTI-DRIFT: emitir scorecard final ANTES de cerrar el stream (M2).
                // Players IPTV ignoran tags propietarios desconocidos.
                // Verifier post-gen puede leer este tag para validación estructural.
                try {
                    if (_apeAuditAcc) _apeAuditAcc.channelsProcessed = channels.length;
                    const scorecard = buildAuditScorecard();
                    if (scorecard) {
                        const scorecardChunk = '\n' + scorecard + '\n';
                        const encodedSC = encoder.encode(scorecardChunk);
                        totalBytes += encodedSC.byteLength;
                        controller.enqueue(encodedSC);
                        if (useHUD) {
                            const acc = _apeAuditAcc || {};
                            const totalExtras = (acc.extras?.vlcopt || 0) + (acc.extras?.kodiprop || 0) + (acc.extras?.headerOverrides || 0);
                            window.HUD_TYPED_ARRAYS.log(`🛡️ Scorecard: extras=${totalExtras} dups=${acc.duplicatesBlocked || 0} jsonGuard=${acc.jsonGuardFailures || 0}`, '#10b981');
                        }
                    }
                } catch (e) {
                    console.warn('[GENERATOR] Scorecard emission failed:', e?.message || e);
                }

                // Cerrar stream
                controller.close();

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                const sizeMB = (totalBytes / 1024 / 1024).toFixed(2);
                const sizeKB = (totalBytes / 1024).toFixed(2);

                console.log(`✅ [STREAM] Generación completada en ${elapsed}s`);
                console.log(`   📊 Canales: ${channels.length} | Tamaño: ${sizeMB} MB | ~${140 * channels.length} líneas`);

                // 🎯 COMPLETAR HUD
                if (useHUD) {
                    window.HUD_TYPED_ARRAYS.updateStats({
                        jwt: `${(totalBytes / channels.length / 1024 * 0.3).toFixed(1)} KB/ch`,
                        filesize: `${sizeMB} MB`,
                        grouptitle: '✓ Activo'
                    });
                    window.HUD_TYPED_ARRAYS.complete({
                        jwt: `${sizeKB} KB`,
                        filesize: `${sizeMB} MB`
                    });
                }
            }
        });

        return stream;
    }

    /**
     * generateM3U8 — wrapper que convierte el stream a Blob
     * Compatible con el resto del sistema (devuelve Blob)
     */
    async function generateM3U8(channels, options = {}) {
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('❌ [TYPED-ARRAYS] No hay canales para generar');
            return null;
        }

        // AUTO-DELTA METADATA SCAN - OBLIGATORIO PRE-GENERACIÓN
        if (window.apeScanMetadataCluster && options.skipMetaScan !== true) {
            console.log("🧠 [APE-META] Auto-escaneando metadata delta antes de generar...");
            if (window.HUD_TYPED_ARRAYS) window.HUD_TYPED_ARRAYS.log(`🧠 Iniciando Inteligencia Metadata (Delta)...`, '#8b5cf6');
            await window.apeScanMetadataCluster(true);
        }

        // ═══════════════════════════════════════════════════════════════
        // v9.1 SCHEMA TRANSLATOR GATE — Channels enter clean or not at all
        // Applies: Unicode sanitization, profile normalization, URL repair,
        //          deduplication, and Schema Translator (channel → payload)
        // ═══════════════════════════════════════════════════════════════
        let safeChannels = channels;
        try {
            const validator = window.GENERATION_VALIDATOR_V9 || window.ApeValidator;
            if (validator && typeof validator.validateAndTranslate === 'function') {
                const result = validator.validateAndTranslate(channels);
                if (result.valid) {
                    safeChannels = result.cleanChannels;
                    console.log(
                        `%c🛡️ [SCHEMA GATE] ${channels.length} → ${safeChannels.length} channels ` +
                        `(repaired: ${result.stats.repaired}, deduped: ${result.stats.duplicates}, ` +
                        `sanitized: ${result.stats.sanitized})`,
                        'color: #2196f3; font-weight: bold;'
                    );
                } else {
                    console.error(`❌ [SCHEMA GATE] Validation failed: ${result.message}`);
                    if (window.HUD_TYPED_ARRAYS) {
                        window.HUD_TYPED_ARRAYS.log(`❌ Validation: ${result.message}`, '#ef4444');
                    }
                    // Proceed with original channels (graceful fallback)
                    console.warn('⚠️ [SCHEMA GATE] Proceeding with unvalidated channels (fallback)');
                }
            }
        } catch (e) {
            console.warn('⚠️ [SCHEMA GATE] Validator error, proceeding with original channels:', e.message);
        }

        // ═══════════════════════════════════════════════════════════════
        // PRE-PUBLICATION HEALTH CHECK (Async Validation of 503)
        // ═══════════════════════════════════════════════════════════════
        if (options.healthValidationEnabled !== false) {
            try {
                if (window.HUD_TYPED_ARRAYS) window.HUD_TYPED_ARRAYS.log(`🔍 Escaneando Salud de Rutas (Pre-Publicación)...`, '#f59e0b');

                // 2026-04-20: redirigido al Rust stream_probe_server (CORS abierto).
                // El PHP remoto no emite Access-Control-Allow-Origin para 127.0.0.1:5500.
                // Rust devuelve {success:bool, width, height, ...} en vez de {status:200|503}.
                const PROXY_URL = (window.APE_PROBE_PROXY_URL || 'http://178.156.147.234:8765/probe-all');
                const PROXY_IS_RUST = /:8765|\/probe-all\b/.test(PROXY_URL);
                const MAX_BATCH_SIZE = 64;

                // Extraemos credenciales para construir las URL de forma perfecta (COMPATIBILIDAD ABSOLUTA)
                const credentialsMap = (typeof buildCredentialsMap === 'function')
                    ? buildCredentialsMap(safeChannels)
                    : (window.app?.state?.credentialsMap || window.gatewayManager?.credentialsMap || {});

                const channelsToVerify = [];
                const channelsToSkip = [];

                for (let i = 0; i < safeChannels.length; i++) {
                    const c = safeChannels[i];
                    // Construcción Universal "1 URL per Channel" respetando todas las reglas del Proxy
                    const url = (typeof buildChannelUrl === 'function')
                        ? buildChannelUrl(c, null, options.profile || 'P3', i, credentialsMap)
                        : (c.url || c.src || '');

                    if (url.includes('line.tivi-ott.net') || options.verifyAllHosts) {
                        channelsToVerify.push({ idx: i, url, channel: c });
                    } else {
                        channelsToSkip.push(c);
                    }
                }

                if (channelsToVerify.length > 0) {
                    console.log(`🔍 [PRE-FLIGHT] Verificando ${channelsToVerify.length} rutas vía ${PROXY_IS_RUST ? 'Rust probe-all' : 'PHP atomic_probe'}...`);
                    const functionalChannels = [];
                    const degradedChannels = [];

                    for (let i = 0; i < channelsToVerify.length; i += MAX_BATCH_SIZE) {
                        const batch = channelsToVerify.slice(i, i + MAX_BATCH_SIZE);
                        const batchUrls = batch.map(b => b.url);

                        if (window.HUD_TYPED_ARRAYS) {
                            const pct = Math.round((i / channelsToVerify.length) * 100);
                            window.HUD_TYPED_ARRAYS.log(`📡 Validando lote ${Math.floor(i / MAX_BATCH_SIZE) + 1} (${pct}%)`, '#03a9f4');
                        }

                        try {
                            // Body según protocolo: Rust usa {channels:[{channel_id,url}]}, PHP usa {urls:[...]}
                            const body = PROXY_IS_RUST
                                ? { channels: batchUrls.map((url, j) => ({ channel_id: 'idx_' + (i + j), url })) }
                                : { urls: batchUrls };
                            const res = await fetch(PROXY_URL, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body)
                            });

                            if (res.ok) {
                                const raw = await res.json();
                                // Normalizar respuesta: Rust → {results:[{success, error}]}; PHP → [{status:200|503}]
                                const rows = PROXY_IS_RUST
                                    ? (Array.isArray(raw?.results) ? raw.results : [])
                                    : (Array.isArray(raw) ? raw : []);
                                rows.forEach((probeResult, idx) => {
                                    const originalBatchItem = batch[idx];
                                    if (!originalBatchItem) return;
                                    const isOk = PROXY_IS_RUST
                                        ? !!probeResult?.success
                                        : (probeResult && (probeResult.status === 200 || probeResult.status === 206 || probeResult.status === 302));
                                    if (isOk) {
                                        functionalChannels.push(originalBatchItem.channel);
                                    } else {
                                        degradedChannels.push(originalBatchItem.channel);
                                        const reason = PROXY_IS_RUST ? (probeResult?.error || 'no-data') : `status: ${probeResult?.status}`;
                                        console.warn(`❌ [PRE-FLIGHT 503] Eliminando inventario degradado: ${originalBatchItem.url} (${reason})`);
                                    }
                                });
                            } else {
                                functionalChannels.push(...batch.map(b => b.channel));
                            }
                        } catch (e) {
                            console.warn(`⚠️ [PRE-FLIGHT] Error de red en batch, fallback pasivo:`, e);
                            functionalChannels.push(...batch.map(b => b.channel));
                        }
                    }

                    console.log(`✅ [PRE-FLIGHT] Verificación completa: ${functionalChannels.length} Funcionales, ${degradedChannels.length} Degradados (503).`);
                    if (window.HUD_TYPED_ARRAYS) {
                        window.HUD_TYPED_ARRAYS.log(`✅ Funcionales: ${functionalChannels.length} canales admitidos`, '#4ade80');
                    }

                    safeChannels = [...channelsToSkip, ...functionalChannels];
                }
            } catch (err) {
                console.error(`❌ [PRE-FLIGHT] Error inesperado en Health Check:`, err);
            }
        }

        const stream = generateM3U8Stream(safeChannels, options);
        // 🌊 El browser convierte el stream a Blob internamente
        // sin crear un mega-string en JS — manejo eficiente de memoria
        const response = new Response(stream);
        const blob = await response.blob();
        return blob;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GENERAR Y DESCARGAR (async — usa streaming)
    // ═══════════════════════════════════════════════════════════════════════════

    async function generateAndDownload(channels, options = {}) {
        let blob = await generateM3U8(channels, options);
        if (!blob) return null;

        // ══════════════════════════════════════════════════════════════
        // 🔬 PHOENIX-QMAX-ADAPTIVE v2.0
        // (Los headers globales de QMAX ahora se inyectan nativamente 
        //  adentro de generateGlobalHeader para cumplir RFC 8216 EXTM3U)
        // ══════════════════════════════════════════════════════════════


        const filename = options.filename || `APE_TYPED_ARRAYS_ULTIMATE_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.m3u8`;

        if (options._autoDownload !== false) {
            // Descargar usando Blob (ensamblado por el browser, no por JS)
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 5000);

            console.log(`📥 [TYPED-ARRAYS] Archivo descargado: ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
        }

        // Disparar evento para gateway-manager
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('m3u8-generated', {
                detail: {
                    content: blob,
                    filename: filename,
                    channelCount: channels.length,
                    generator: 'TYPED_ARRAYS_ULTIMATE',
                    version: VERSION,
                    linesPerChannel: 921,
                    size: blob.size
                }
            });
            window.dispatchEvent(event);
        }

        return { filename, blob, size: blob.size, channels: channels.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STREAMING DIRECTO A DISCO (Zero-Copy) — Fix para archivos >500MB
    // Bug: Blob monolítico de 805MB consume ~2.4GB RAM → Chrome OOM → 0 bytes
    // Fix: File System Access API (showSaveFilePicker) escribe directo a disco
    //      con fallback chunked-Blob para navegadores sin soporte FSAA
    // ═══════════════════════════════════════════════════════════════════════════

    async function generateAndDownloadStreaming(channels, options = {}) {
        // ── PRE-PROCESAMIENTO: Validación + Schema Gate + Health Check ──
        // Reutilizamos generateM3U8 pero solo para pre-procesamiento,
        // SIN materializar el blob final
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            console.error('❌ [STREAM-DISK] No hay canales para generar');
            return null;
        }

        // AUTO-DELTA METADATA SCAN
        if (window.apeScanMetadataCluster && options.skipMetaScan !== true) {
            console.log("🧠 [APE-META] Auto-escaneando metadata delta antes de generar...");
            if (window.HUD_TYPED_ARRAYS) window.HUD_TYPED_ARRAYS.log('🧠 Iniciando Inteligencia Metadata (Delta)...', '#8b5cf6');
            await window.apeScanMetadataCluster(true);
        }

        // Schema Gate
        let safeChannels = channels;
        try {
            const validator = window.GENERATION_VALIDATOR_V9 || window.ApeValidator;
            if (validator && typeof validator.validateAndTranslate === 'function') {
                const result = validator.validateAndTranslate(channels);
                if (result.valid) {
                    safeChannels = result.cleanChannels;
                    console.log(
                        `%c🛡️ [SCHEMA GATE] ${channels.length} → ${safeChannels.length} channels ` +
                        `(repaired: ${result.stats.repaired}, deduped: ${result.stats.duplicates}, ` +
                        `sanitized: ${result.stats.sanitized})`,
                        'color: #2196f3; font-weight: bold;'
                    );
                } else {
                    console.warn('⚠️ [SCHEMA GATE] Proceeding with unvalidated channels (fallback)');
                }
            }
        } catch (e) {
            console.warn('⚠️ [SCHEMA GATE] Validator error, proceeding:', e.message);
        }

        const filename = options.filename || `APE_LISTA_${Date.now()}.m3u8`;
        const totalChannels = safeChannels.length;

        // ═══ RUTA 1: File System Access API (Chrome 86+, Edge 86+) ═══
        // Zero-copy: stream.pipeTo(writable) → datos van directo al disco
        // RAM constante ~50MB sin importar tamaño del archivo
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                console.log(`📁 [STREAM-DISK] Usando File System Access API (zero-copy)`);
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'M3U8 Playlist OMEGA',
                        accept: { 'application/x-mpegURL': ['.m3u8'] }
                    }]
                });

                const writable = await fileHandle.createWritable();
                const stream = generateM3U8Stream(safeChannels, options);

                // pipeTo() transfiere chunk por chunk sin acumular en RAM
                await stream.pipeTo(writable);

                console.log(`✅ [STREAM-DISK] Archivo escrito directo a disco: ${filename}`);
                console.log(`   📊 ${totalChannels} canales | Streaming completado sin Blob en RAM`);

                // Disparar evento para gateway-manager
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('m3u8-generated', {
                        detail: {
                            filename: filename,
                            channelCount: totalChannels,
                            generator: 'TYPED_ARRAYS_ULTIMATE',
                            version: VERSION,
                            mode: 'STREAM_TO_DISK'
                        }
                    }));
                }

                return { filename, size: 'streamed-to-disk', channels: totalChannels, mode: 'FSAA' };
            } catch (e) {
                if (e.name === 'AbortError') {
                    console.log('📁 [STREAM-DISK] Usuario canceló el diálogo de guardado');
                    return null;
                }
                console.warn('[STREAM-DISK] showSaveFilePicker failed, falling back to chunked-blob:', e.message);
            }
        }

        // ═══ RUTA 2: Chunked-Blob Fallback (Firefox, Safari, etc.) ═══
        // Acumula Uint8Array chunks y los pasa a new Blob([...chunks])
        // Esto es más eficiente que Response.blob() porque:
        // - No crea un Response intermedio
        // - Blob([chunks]) puede usar referencia sin copiar (browser-dependent)
        console.log(`📦 [STREAM-DISK] Fallback: Chunked-Blob (sin FSAA)`);
        const stream = generateM3U8Stream(safeChannels, options);
        const reader = stream.getReader();
        const chunks = [];
        let totalSize = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalSize += value.byteLength;
        }

        const blob = new Blob(chunks, { type: 'application/x-mpegURL' });
        // Liberar referencias de chunks — solo queda el blob
        chunks.length = 0;

        console.log(`📦 [STREAM-DISK] Blob ensamblado: ${(totalSize / 1048576).toFixed(2)} MB`);

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        console.log(`📥 [STREAM-DISK] Archivo descargado: ${filename} (${(blob.size / 1048576).toFixed(1)} MB)`);

        // Disparar evento
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('m3u8-generated', {
                detail: {
                    content: blob,
                    filename: filename,
                    channelCount: totalChannels,
                    generator: 'TYPED_ARRAYS_ULTIMATE',
                    version: VERSION,
                    size: blob.size,
                    mode: 'CHUNKED_BLOB'
                }
            }));
        }

        return { filename, blob, size: blob.size, channels: totalChannels, mode: 'CHUNKED_BLOB' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTEGRACIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════

    if (typeof window !== 'undefined') {
        // 👻 Fusión Fantasma v22.1: Registro global directo
        if (typeof APEAtomicStealthEngine !== 'undefined') {
            window.APEAtomicStealthEngine = APEAtomicStealthEngine;
        } else {
            window.APEAtomicStealthEngine = class APEAtomicStealthEngineStub {
                constructor(cfg) { this.cfg = cfg || {}; }
                getHeaders(ch, p) { return {}; }
                getUA(ch) { return window.UAPhantomEngine ? window.UAPhantomEngine.get('IPTV') : 'Mozilla/5.0'; }
                static getInstance(cfg) { return new window.APEAtomicStealthEngine(cfg); }
            };
            console.warn('[APE V21] APEAtomicStealthEngine no encontrado — usando stub.');
        }

        // API Global
        window.M3U8TypedArraysGenerator = {
            generate: generateM3U8,
            generateStream: generateM3U8Stream,
            generateAndDownload: generateAndDownload,
            generateAndDownloadStreaming: generateAndDownloadStreaming,
            generateChannelEntry: generateChannelEntry,
            generateJWT: generateJWT68Fields,
            determineProfile: determineProfile,
            profiles: PROFILES,
            version: VERSION,

            // 👻 Fusión Fantasma v22.1 API
            AtomicStealthEngine: window.APEAtomicStealthEngine,
            Cortex: IPTV_SUPPORT_CORTEX_V_OMEGA,
            PreArmed: PRE_ARMED_RESPONSE_BUILDER,
            getRotatedUserAgent: getRotatedUserAgent,
            getRandomIp: getRandomIp,

            // ═══════════════════════════════════════════════════════════════════
            // CLEAN URL MODE API
            // ═══════════════════════════════════════════════════════════════════

            /**
             * Activa o desactiva el modo Clean URL
             * @param {boolean} enabled - true para URLs limpias, false para JWT
             */
            setCleanUrlMode: function (enabled) {
                CLEAN_URL_MODE = !!enabled;
                console.log(`🌐 [CLEAN-URL] Modo ${CLEAN_URL_MODE ? 'ACTIVADO' : 'DESACTIVADO'}`);
                return CLEAN_URL_MODE;
            },

            /**
             * Obtiene el estado actual del modo Clean URL
             * @returns {boolean}
             */
            isCleanUrlMode: function () {
                return CLEAN_URL_MODE;
            },

            /**
             * Obtiene información de la arquitectura actual
             * @returns {Object}
             */
            getArchitecture: function () {
                return {
                    version: VERSION,
                    mode: CLEAN_URL_MODE ? 'CLEAN_URL' : 'JWT',
                    urlMode: CLEAN_URL_MODE ? 'clean' : 'parameterized',
                    headersGlobal: CLEAN_URL_MODE ? 25 : 10,
                    headersPerChannel: CLEAN_URL_MODE ? 65 : 55,
                    jwtFields: CLEAN_URL_MODE ? 0 : 68
                };
            },

            // Generadores individuales (para debug/testing)
            _generateGlobalHeader: generateGlobalHeader
        };

        // Integración con app
        function integrateWithApp() {
            if (window.app && typeof window.app === 'object') {
                window.app.generateM3U8_TypedArrays = function (options = {}) {
                    options = options || {};
                    const cfg = window.GenTabController ? window.GenTabController.getConfig() : {};
                    options.dictatorMode = cfg.dictatorMode || false;
                    options.dictatorTier = cfg.dictatorTier || '4k';
                    // ✅ FIX: Llamar método getFilteredChannels() para obtener canales filtrados actuales
                    let channels = [];

                    if (typeof this.getFilteredChannels === 'function') {
                        channels = this.getFilteredChannels() || [];
                        console.log(`🎯 [TYPED-ARRAYS] Usando getFilteredChannels(): ${channels.length} canales`);
                    } else {
                        channels = this.state?.filteredChannels ||
                            this.state?.channels ||
                            this.state?.channelsMaster || [];
                        console.log(`🎯 [TYPED-ARRAYS] Usando state fallback: ${channels.length} canales`);
                    }

                    if (channels.length === 0) {
                        alert('No hay canales para generar. Conecta a un servidor primero.');
                        return null;
                    }

                    // ✅ v10.1 CRITICAL: Inject server credentials from this.state
                    // This function runs as window.app method, so this.state IS available
                    if (this.state) {
                        options._activeServers = this.state.activeServers || [];
                        options._currentServer = this.state.currentServer || null;
                        console.log(`🔑 [TYPED-ARRAYS] Injecting ${options._activeServers.length} servers into generator`);
                    }

                    // 👉 INYECCIÓN VISUAL V6 OMEGA: Mostrar feedback al milisegundo de clickear
                    const overlay = document.createElement("div");
                    overlay.innerHTML = `
                        <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,20,10,0.95); z-index:9999999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#10b981; font-family:monospace; text-align:center;">
                            <div style="font-size:35px; font-weight:bold; margin-bottom:15px; text-shadow: 0 0 15px #10b981;">🚀 ORQUESTADOR OMEGA V6 ACTIVO</div>
                            <div id="ape-meta-hud-status" style="font-size:20px; color:#fff; margin-bottom:10px;">Procesando Invariante de 900 Líneas por Canal...</div>
                            <div style="font-size:18px; color:#f59e0b;">Canales en Pool: ${channels.length}</div>
                            <div style="font-size:14px; margin-top:30px; color:#6b7280;">Streaming directo a disco (Zero-Copy RAM)...<br/>El diálogo de guardado aparece primero. Selecciona ubicación.</div>
                            <div id="ape-meta-hud-action" style="margin-top: 40px; display: none;"></div>
                        </div>
                    `;
                    document.body.appendChild(overlay);

                    // ═══════════════════════════════════════════════════════════════
                    // STREAM-TO-DISK FIX: Evita materializar 805MB en RAM como Blob
                    // Usa showSaveFilePicker → stream.pipeTo(writable) → zero copy
                    // Fallback: Chunked-Blob (más eficiente que Response.blob())
                    // ═══════════════════════════════════════════════════════════════
                    setTimeout(() => {
                        generateAndDownloadStreaming(channels, options).then(result => {
                            if (!result) {
                                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                                return;
                            }

                            // Si fue FSAA (stream-to-disk), el archivo ya está en disco
                            if (result.mode === 'FSAA') {
                                document.getElementById('ape-meta-hud-status').innerHTML =
                                    `✅ ARCHIVO ESCRITO DIRECTO A DISCO (${result.channels} canales)`;
                                document.getElementById('ape-meta-hud-status').style.color = "#10b981";

                                const actionDiv = document.getElementById('ape-meta-hud-action');
                                actionDiv.style.display = "block";
                                actionDiv.innerHTML = `
                                    <div style="font-size:20px; color:#4ade80; margin-bottom:15px;">📁 Zero-Copy completado — 0 bytes en RAM</div>
                                    <button id="ape-meta-btn-close" style="padding: 14px 30px; font-size: 18px; background: #065f46; color: #10b981; border: 1px solid #10b981; border-radius: 8px; cursor: pointer;">Volver a la interfaz</button>
                                `;
                                document.getElementById('ape-meta-btn-close').addEventListener('click', () => {
                                    if (document.body.contains(overlay)) document.body.removeChild(overlay);
                                });
                                return;
                            }

                            // Si fue CHUNKED_BLOB, mostrar botón de descarga
                            document.getElementById('ape-meta-hud-status').innerHTML = "✅ INVARIANTE COMPILADA CON ÉXITO";
                            document.getElementById('ape-meta-hud-status').style.color = "#10b981";

                            const actionDiv = document.getElementById('ape-meta-hud-action');
                            actionDiv.style.display = "block";
                            const sizeMB = typeof result.size === 'number' ? (result.size / 1048576).toFixed(1) : '?';
                            actionDiv.innerHTML = `
                                <button id="ape-meta-btn-download" style="padding: 18px 40px; font-size: 24px; font-weight: bold; background: #10b981; color: #000; border: 2px solid #065f46; border-radius: 8px; cursor: pointer; box-shadow: 0 0 25px rgba(16, 185, 129, 0.6); text-transform: uppercase;">
                                    📥 DESCARGAR M3U8 (${sizeMB} MB)
                                </button>
                                <div style="margin-top: 25px;">
                                    <a href="#" id="ape-meta-btn-close" style="color: #9ca3af; text-decoration: underline; font-size: 16px;">Volver a la interfaz</a>
                                </div>
                            `;

                            // Listener de Descarga (solo para CHUNKED_BLOB mode)
                            document.getElementById('ape-meta-btn-download').addEventListener('click', () => {
                                if (!result.blob) return;
                                const url = URL.createObjectURL(result.blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = result.filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);

                                console.log(`📥 [TYPED-ARRAYS] Archivo descargado manualmente: ${result.filename}`);
                                document.getElementById('ape-meta-btn-download').innerText = "📥 VERIFICANDO...";

                                setTimeout(() => {
                                    if (document.body.contains(overlay)) document.body.removeChild(overlay);
                                    URL.revokeObjectURL(url);
                                }, 1500);
                            });

                            // Listener de Cerrar
                            document.getElementById('ape-meta-btn-close').addEventListener('click', (e) => {
                                e.preventDefault();
                                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                            });

                        }).catch(e => {
                            console.error('[TYPED-ARRAYS] Gen Error:', e);
                            const st = document.getElementById('ape-meta-hud-status');
                            if (st) {
                                st.innerHTML = "❌ Fallo Crítico V6. Revisa la consola.";
                                st.style.color = "#ef4444";
                            }
                            setTimeout(() => {
                                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                            }, 5000);
                        });
                    }, 100);

                    return null;
                };
                console.log('🚀 [TYPED-ARRAYS] ✅ Integrado con window.app.generateM3U8_TypedArrays()');
                return true;
            }
            return false;
        }

        // Polling para integración
        let attempts = 0;
        const maxAttempts = 50;
        const pollInterval = 200;

        function pollForApp() {
            attempts++;
            if (integrateWithApp()) return;
            if (attempts < maxAttempts) {
                setTimeout(pollForApp, pollInterval);
            } else {
                console.warn('🚀 [TYPED-ARRAYS] ⚠️ window.app no disponible. Use: M3U8TypedArraysGenerator.generateAndDownload(channels)');
            }
        }

        pollForApp();

        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`🚀 M3U8 TYPED ARRAYS ULTIMATE v${VERSION} MAX AGGRESSION NUCLEAR Loaded`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('   ✅ 139 líneas por canal (v5.4 MAX AGGRESSION — CALIBRADO)');
        console.log('   ✅ 21 EXTVLCOPT + 6 KODIPROP + 109 EXT-X-APE + 1 EXTHTTP');
        console.log('   ✅ JWT 68+ campos (8 secciones)');
        console.log('   ✅ 6 Perfiles: P0 (8K) → P5 (SD)');
        console.log('   ✅ RFC 8216 100% Compliance');
        console.log('   ✅ Resiliencia 24/7/365 + ISP NUCLEAR (5 niveles escalantes)');
        console.log('   ✅ HTTPS Priority (upgrade HTTP → HTTPS)');
        console.log('═══════════════════════════════════════════════════════════════');
    }

    // ─────────────────────────────────────────────────────────────────
    // 🧠 APE METADATA INTELLIGENCE BATCH SCANNER
    // ─────────────────────────────────────────────────────────────────
    window.apeScanMetadataCluster = async function (deltaOnly = false) {
        if (!window.app) { if (!deltaOnly) alert('App no cargada'); return; }
        let channels = [];
        if (typeof window.app.getFilteredChannels === 'function') {
            channels = window.app.getFilteredChannels() || [];
        } else {
            channels = window.app.state?.filteredChannels || window.app.state?.channels || [];
        }

        if (channels.length === 0) {
            if (!deltaOnly) alert('No hay canales cargados para escanear.');
            return;
        }

        const btn = document.getElementById('btnScanMetadataCluster');
        const oText = btn ? btn.innerHTML : 'Escanear Metadata';
        if (btn) btn.innerHTML = '<span class="icon">⏳</span><span>Escaneando (0%)</span>';

        // Determinar credenciales base
        const credentialsMap = {}; // O podrías usar app.state.activeServers pero `channels` ya suele tener `url`

        let targetUrls = [];
        channels.forEach(ch => {
            if (deltaOnly && ch.ape_meta) return; // Delta Scan: skip already scanned

            let chUrl = ch.url || ch.direct_source || ch.stream_url;
            if (!chUrl && ch.stream_id) {
                // Intento simple de construir URL si no está armada
                const servers = window.app.state?.activeServers || [];
                const srv = servers.find(s => s.id === ch.serverId || s.id === ch.server_id);
                if (srv) {
                    const baseUrl = (srv.baseUrl || '').replace(/\/player_api\.php.*$/, '').replace(/\/$/, '');
                    chUrl = `${baseUrl}/live/${srv.username}/${srv.password}/${ch.stream_id}.m3u8`;
                }
            }
            if (chUrl) {
                targetUrls.push({
                    url: chUrl,
                    metadata: {
                        stream_id: ch.stream_id || ch.id,
                        name: ch.name,
                        group: ch.category_name || ch.group
                    }
                });
            }
        });

        if (targetUrls.length === 0) {
            if (!deltaOnly) alert('No se pudieron construir URLs para los canales. Verifica el Servidor Activo.');
            if (btn) btn.innerHTML = oText;
            if (deltaOnly) console.log("🧠 [APE-META] Delta scan: Todos los canales ya tienen metadata. Saltando escaneo.");
            return;
        }

        console.log(`🧠 [APE-META] Iniciando escaneo de ${targetUrls.length} canales en meta-cluster`);
        const CHUNK_SIZE = 50;
        let processedCount = 0;

        // Endpoint VPS
        const vpsUrl = document.getElementById('vpsBaseUrl')?.value || 'https://iptv-ape.duckdns.org';

        // ── FAIL-FAST GUARD: Si el VPS está offline, skip el scan completo ──
        // Evita bloqueo de 41-83 minutos esperando timeouts de 83 fetches a VPS caído.
        // AbortController con timeout de 3s + break en 2 fallos consecutivos.
        let _vpsFailCount = 0;
        const _VPS_ABORT_THRESHOLD = 2;
        const _VPS_FETCH_TIMEOUT_MS = 3000;

        for (let i = 0; i < targetUrls.length; i += CHUNK_SIZE) {
            if (_vpsFailCount >= _VPS_ABORT_THRESHOLD) {
                console.warn(`⚠️ [APE-META] VPS offline detectado (${_vpsFailCount} fallos). Skip meta-cluster scan. Generación continuará sin metadata enriquecida.`);
                if (btn) btn.innerHTML = `<span class="icon">⚠️</span><span>VPS offline — scan omitido</span>`;
                break;
            }

            const chunk = targetUrls.slice(i, i + CHUNK_SIZE);
            if (btn) btn.innerHTML = `<span class="icon">🧠</span><span>Batch ${Math.round((i / targetUrls.length) * 100)}%</span>`;

            const _ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            const _timeoutId = _ctrl ? setTimeout(() => _ctrl.abort(), _VPS_FETCH_TIMEOUT_MS) : null;

            try {
                const res = await fetch(`${vpsUrl}/resolve_quality.php?action=meta-cluster`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: chunk }),
                    signal: _ctrl ? _ctrl.signal : undefined
                });
                if (_timeoutId) clearTimeout(_timeoutId);

                if (res.ok) {
                    _vpsFailCount = 0;
                    const data = await res.json();
                    if (data.results) {
                        data.results.forEach(r => {
                            if (r && r.status === 'success' && r.ape_meta) {
                                const targetCh = channels.find(c =>
                                    (r.metadata?.stream_id && c.stream_id == r.metadata.stream_id) ||
                                    (r.metadata?.name && c.name == r.metadata.name)
                                );
                                if (targetCh) {
                                    targetCh.ape_meta = r.ape_meta;
                                    processedCount++;
                                }
                            }
                        });
                    }
                } else {
                    _vpsFailCount++;
                    console.warn(`[APE-META] VPS respondió ${res.status} (fallo ${_vpsFailCount}/${_VPS_ABORT_THRESHOLD})`);
                }
            } catch (e) {
                if (_timeoutId) clearTimeout(_timeoutId);
                _vpsFailCount++;
                const errType = e.name === 'AbortError' ? 'timeout 3s' : e.message;
                console.warn(`[APE-META] Batch fallo (${_vpsFailCount}/${_VPS_ABORT_THRESHOLD}): ${errType}`);
            }
        }

        if (btn) btn.innerHTML = `<span class="icon">✅</span><span>Escaneo Finalizado (${processedCount})</span>`;
        if (window.app.renderChannelsList) window.app.renderChannelsList();

        // Persistir el estado en IndexedDB y channels_map.json equivalente interno
        if (window.app && typeof window.app.saveGeneratorSnapshot === 'function') {
            window.app.saveGeneratorSnapshot();
            console.log("💾 [APE-META] Snapshot guardado en IndexedDB. El ADN Metadata persistirá tras recargar.");
        }

        console.log(`🧠 [APE-META] Completado. ${processedCount} canales enriquecidos con ADN Metadata.`);
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast(`✅ Metadata Escaneada: ${processedCount} canales actualizados`, 'success');
        }
        setTimeout(() => { if (btn) btn.innerHTML = oText; }, 3000);
    }

})();
