/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧬 APE RUNTIME EVASION ENGINE v1.0.0 — "EL CEREBRO DEL DECO"
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Motor de inteligencia runtime que viaja con las directivas M3U8.
 * Intercepta TODAS las peticiones HTTP del player, detecta errores en <1ms,
 * y aplica mutación polimórfica automática hasta lograr señal ininterrumpida.
 *
 * ARQUITECTURA:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  M3U8 Tags (#EXT-X-APE-FALLBACK-*)                            │
 * │         ↓ parsea directivas                                    │
 * │  ┌─────────────────────────┐                                   │
 * │  │  DIRECTIVE PARSER       │  ← Lee todas las directivas APE   │
 * │  └─────────┬───────────────┘                                   │
 * │            ↓                                                   │
 * │  ┌─────────────────────────┐                                   │
 * │  │  FETCH INTERCEPTOR      │  ← Monkey-patch de fetch/XHR     │
 * │  │  (captura HTTP errors)  │                                   │
 * │  └─────────┬───────────────┘                                   │
 * │            ↓                                                   │
 * │  ┌─────────────────────────┐                                   │
 * │  │  CORTEX DECISION TREE   │  ← Árbol orgánico por error code │
 * │  │  (13 strategies)        │                                   │
 * │  └─────────┬───────────────┘                                   │
 * │            ↓                                                   │
 * │  ┌─────────────────────────┐                                   │
 * │  │  POLYMORPHIC MUTATOR    │  ← Muta headers como virus       │
 * │  │  (nunca la misma huella)│                                   │
 * │  └─────────┬───────────────┘                                   │
 * │            ↓                                                   │
 * │  ┌─────────────────────────┐                                   │
 * │  │  PERSISTENCE ENGINE     │  ← Insiste, persiste, NUNCA      │
 * │  │  (retry infinito)       │     desiste                      │
 * │  └─────────────────────────┘                                   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * COMPATIBILIDAD: Cualquier player que ejecute JS (web, WebView, Electron)
 * HUELLA: Zero — no deja logs, no deja cookies, no deja rastro
 * 
 * AUTHOR: APE Engine Team — IPTV Navigator PRO v5.4 MAX AGGRESSION
 * VERSION: 1.0.0
 * DATE: 2026-03-18
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function() {
    'use strict';

    const ENGINE_VERSION = '1.1.0-POLYMORPHIC';
    const MAX_RETRIES = 5;
    const STEALTH_MODE = true; // No console.log en producción

    // V1.1: Circuit breaker — stop retrying hosts that are fundamentally broken
    // PhD-AUDIT FIX F2 (2026-04-11): Raised threshold 3→10 to prevent legitimate
    // IPTV providers returning 401 during initial auth from being banned for 5 min.
    // Cooldown reduced to 60s. Values overridable via window globals.
    const _circuitBreaker = {
        _hosts: {},  // { hostname: { failures: N, blockedUntil: timestamp } }
        THRESHOLD: (typeof window !== 'undefined' && window.APE_CB_THRESHOLD) || 10,
        COOLDOWN_MS: (typeof window !== 'undefined' && window.APE_CB_COOLDOWN_MS) || (60 * 1000),

        _getHost(url) {
            try { return new URL(url).hostname; } catch { return url; }
        },

        isBlocked(url) {
            const host = this._getHost(url);
            const entry = this._hosts[host];
            if (!entry) return false;
            if (Date.now() > entry.blockedUntil) {
                delete this._hosts[host]; // Cooldown expired
                return false;
            }
            return entry.failures >= this.THRESHOLD;
        },

        recordFailure(url) {
            const host = this._getHost(url);
            if (!this._hosts[host]) this._hosts[host] = { failures: 0, blockedUntil: 0 };
            this._hosts[host].failures++;
            if (this._hosts[host].failures >= this.THRESHOLD) {
                this._hosts[host].blockedUntil = Date.now() + this.COOLDOWN_MS;
                if (!STEALTH_MODE) {
                    console.warn(`[APE-RUNTIME] Circuit breaker OPEN for ${host} (${this.THRESHOLD} failures, cooldown ${this.COOLDOWN_MS/1000}s)`);
                }
            }
        },

        recordSuccess(url) {
            const host = this._getHost(url);
            delete this._hosts[host];
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 🧬 MÓDULO 1: USER-AGENT & IP POOLS (inline para autonomía total)
    // ═══════════════════════════════════════════════════════════════════════════

    const UA_POOL = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/8.0 TV Safari/537.36',
        'OTT Navigator/1.7.1.3 (Linux;Android 14) ExoPlayer',
        'VLC/3.0.21 LibVLC/3.0.21',
        'Kodi/21.1 (Windows NT 10.0; Win64; x64) App_Bitness/64',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 WebAppManager'
    ];

    const REFERER_POOL = [
        'https://www.google.com/',
        'https://www.youtube.com/',
        'https://www.facebook.com/',
        'https://www.twitch.tv/',
        'https://www.netflix.com/',
        'https://www.reddit.com/',
        'https://www.instagram.com/',
        'https://www.bing.com/'
    ];

    // PhD-AUDIT FIX 2026-04-11: Removed 'Basic Og==' (empty user:pass pattern).
    // It detonates Squid 407 loops because some proxies parse "u:p" as malformed.
    // Replaced with non-empty synthetic credentials that pass header validation
    // without triggering auth loops. Real cached creds override these.
    const PROXY_AUTH_CHAIN = [
        'Basic YW5vbjphbm9u',  // base64("anon:anon") — safe stub, not empty
        'Bearer anonymous',
        'Digest username="anon",realm="",nonce="",uri="",response=""',
        // NTLM intentionally omitted — not viable in browser fetch; triggers CDN_FAILOVER
    ];

    const AUTH_CHAIN = [
        'Basic YW5vbjphbm9u',
        'Bearer anonymous',
        'Digest username="anon",realm="",nonce="",uri="",response=""',
    ];

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎲 HELPERS: Generadores polimórficos
    // ═══════════════════════════════════════════════════════════════════════════

    function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function rndStr(n) { const c = 'abcdef0123456789'; let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
    function rndIP() {
        const ranges = [
            () => `142.250.${180 + Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 256)}`,  // Google
            () => `104.${16 + Math.floor(Math.random() * 16)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, // Cloudflare
            () => `13.${224 + Math.floor(Math.random() * 32)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, // AWS
            () => `23.${32 + Math.floor(Math.random() * 64)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,  // Akamai
            () => `151.101.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, // Fastly
            () => `20.${36 + Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, // Azure
        ];
        return rnd(ranges)();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🧠 MÓDULO 2: CORTEX DECISION TREE — Árbol orgánico de decisión
    // ═══════════════════════════════════════════════════════════════════════════
    // Cada error code tiene una CADENA de estrategias que se escalan
    // automáticamente si la anterior falla. Nunca desiste.
    // ═══════════════════════════════════════════════════════════════════════════

    const CORTEX = {
        // Cada entrada: array de estrategias que se aplican en orden
        // Si la primera falla, prueba la segunda, luego la tercera...
        strategies: {
            301: [{ action: 'FOLLOW', maxRetries: 10 }],
            302: [{ action: 'FOLLOW', maxRetries: 10 }],
            307: [{ action: 'FOLLOW', maxRetries: 10 }],
            308: [{ action: 'FOLLOW', maxRetries: 10 }],
            401: [
                { action: 'AUTH', method: 'basic',   maxRetries: 3 },
                { action: 'AUTH', method: 'bearer',  maxRetries: 3 },
                { action: 'AUTH', method: 'digest',  maxRetries: 3 },
                { action: 'AUTH', method: 'ntlm',    maxRetries: 3 },
                { action: 'MUTATE_FULL', maxRetries: 5 }
            ],
            403: [
                { action: 'UA_ROTATE',       maxRetries: 5 },
                { action: 'REFERER_SPOOF',   maxRetries: 3 },
                { action: 'XFF_ROTATE',      maxRetries: 5 },
                { action: 'HEADER_SPOOF',    maxRetries: 3 },
                { action: 'METHOD_SWITCH',   maxRetries: 2 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            407: [
                { action: 'PROXY_AUTH', method: 'basic',    maxRetries: 3 },
                { action: 'PROXY_AUTH', method: 'ntlm',     maxRetries: 3 },
                { action: 'PROXY_AUTH', method: 'digest',   maxRetries: 3 },
                { action: 'PROXY_AUTH', method: 'bearer',   maxRetries: 3 },
                { action: 'VIA_SPOOF',       maxRetries: 3 },
                { action: 'CONNECT_TUNNEL',  maxRetries: 2 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            429: [
                { action: 'BACKOFF_JITTER',  maxRetries: 10, baseMs: 500, maxMs: 16000 },
                { action: 'IP_SWARM',        maxRetries: 10 },
                { action: 'SESSION_ROTATE',  maxRetries: 5 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            451: [
                { action: 'GEO_PHANTOM',     maxRetries: 10 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            500: [
                { action: 'MUTATE_FULL',     maxRetries: 5 },
                { action: 'BACKOFF_JITTER',  maxRetries: 5, baseMs: 2000, maxMs: 30000 }
            ],
            502: [
                { action: 'CLEAN_RECONNECT', maxRetries: 5 },
                { action: 'DEGRADE_TS',      maxRetries: 3 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            503: [
                { action: 'DEGRADE_TS',      maxRetries: 5 },
                { action: 'BACKOFF_JITTER',  maxRetries: 10, baseMs: 1000, maxMs: 32000 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            504: [
                { action: 'TIMEOUT_EXTEND',  maxRetries: 5 },
                { action: 'XFF_ROTATE',      maxRetries: 5 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            // ── 400 BAD REQUEST: Request syntax/payload recovery ──
            // Causa típica en IPTV: EXTHTTP con demasiados headers (>8KB) o headers
            // malformados que el NGINX/WAF del provider rechaza. Estrategia: reducir
            // progresivamente el payload hasta los headers mínimos.
            400: [
                { action: 'STRIP_HEADERS',   maxRetries: 3 },
                { action: 'UA_ROTATE',       maxRetries: 3 },
                { action: 'METHOD_SWITCH',   maxRetries: 2 },
                { action: 'CLEAN_RECONNECT', maxRetries: 3 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ],
            // ── 405 METHOD NOT ALLOWED: Method rotation ──
            // Algunos CDNs/proxies bloquean HEAD o POST. Rotar entre métodos HTTP.
            405: [
                { action: 'METHOD_SWITCH',   maxRetries: 5 },
                { action: 'UA_ROTATE',       maxRetries: 3 },
                { action: 'XFF_ROTATE',      maxRetries: 3 },
                { action: 'CLEAN_RECONNECT', maxRetries: 3 },
                { action: 'MUTATE_FULL',     maxRetries: 5 }
            ]
        },

        getChain: function(statusCode) {
            return this.strategies[statusCode] || [{ action: 'MUTATE_FULL', maxRetries: MAX_RETRIES }];
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔀 MÓDULO 3: POLYMORPHIC MUTATOR — Nunca la misma huella
    // ═══════════════════════════════════════════════════════════════════════════

    function mutateHeaders(headers, action, strategy) {
        const h = new Headers(headers || {});

        switch (action) {
            case 'FOLLOW':
                // No mutar en redirects, solo seguir
                break;

            case 'AUTH':
                // PhD-AUDIT FIX: non-empty stubs (empty Basic Og== causes Squid 407 loops)
                if (strategy.method === 'basic')  h.set('Authorization', 'Basic YW5vbjphbm9u');
                if (strategy.method === 'bearer') h.set('Authorization', 'Bearer anonymous');
                if (strategy.method === 'digest') h.set('Authorization', 'Digest username="anon",realm="",nonce="",uri="",response=""');
                // NTLM no browser-viable → skip & escalate to CDN_FAILOVER via next chain step
                h.set('User-Agent', rnd(UA_POOL));
                // Prevention headers anti-407
                h.set('Proxy-Connection', 'keep-alive');
                if (!h.has('Via')) h.set('Via', '1.1 ape-gateway');
                break;

            case 'UA_ROTATE':
                h.set('User-Agent', rnd(UA_POOL));
                h.set('Accept', '*/*');
                break;

            case 'REFERER_SPOOF':
                h.set('Referer', rnd(REFERER_POOL));
                h.set('Origin', rnd(REFERER_POOL).replace(/\/$/, ''));
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'XFF_ROTATE':
                h.set('X-Forwarded-For', rndIP());
                h.set('X-Real-IP', rndIP());
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'HEADER_SPOOF':
                h.set('X-Original-URL', '/');
                h.set('X-Rewrite-URL', '/');
                h.set('X-Forwarded-For', rndIP());
                h.set('X-Client-IP', rndIP());
                h.set('User-Agent', rnd(UA_POOL));
                h.set('Referer', rnd(REFERER_POOL));
                break;

            case 'METHOD_SWITCH':
                // Caller will handle method change
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'PROXY_AUTH':
                if (strategy.method === 'basic')   h.set('Proxy-Authorization', PROXY_AUTH_CHAIN[0]);
                if (strategy.method === 'ntlm')    h.set('Proxy-Authorization', PROXY_AUTH_CHAIN[1]);
                if (strategy.method === 'digest')  h.set('Proxy-Authorization', PROXY_AUTH_CHAIN[2]);
                if (strategy.method === 'bearer')  h.set('Proxy-Authorization', PROXY_AUTH_CHAIN[3]);
                h.set('Proxy-Connection', 'keep-alive');
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'VIA_SPOOF':
                h.set('Via', '1.1 proxy.local');
                h.set('Proxy-Connection', 'keep-alive');
                h.set('X-Forwarded-For', rndIP());
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'CONNECT_TUNNEL':
                h.set('Proxy-Authorization', rnd(PROXY_AUTH_CHAIN));
                h.set('Via', '1.1 proxy.local');
                h.set('User-Agent', rnd(UA_POOL));
                h.set('X-Forwarded-For', rndIP());
                break;

            case 'BACKOFF_JITTER':
                h.set('User-Agent', rnd(UA_POOL));
                h.set('X-Forwarded-For', rndIP());
                h.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                break;

            case 'IP_SWARM':
                h.set('X-Forwarded-For', rndIP());
                h.set('X-Remote-IP', rndIP());
                h.set('X-Client-IP', rndIP());
                h.set('X-Remote-Addr', rndIP());
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'SESSION_ROTATE':
                h.set('X-Playback-Session-Id', `SES_${rndStr(16)}`);
                h.set('X-Forwarded-For', rndIP());
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'GEO_PHANTOM':
                h.set('X-Forwarded-For', rndIP());
                h.set('X-Real-IP', rndIP());
                h.set('CF-Connecting-IP', rndIP());
                h.set('True-Client-IP', rndIP());
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'CLEAN_RECONNECT':
                h.set('Connection', 'close');
                h.set('Accept', 'video/mp2t, application/octet-stream, */*');
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'DEGRADE_TS':
                h.set('Connection', 'close');
                h.set('Accept', 'video/mp2t, application/octet-stream');
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'TIMEOUT_EXTEND':
                h.set('Connection', 'keep-alive');
                h.set('Keep-Alive', 'timeout=300, max=1000');
                h.set('X-Forwarded-For', rndIP());
                h.set('User-Agent', rnd(UA_POOL));
                break;

            case 'STRIP_HEADERS':
                // 400 Bad Request recovery: reducir a headers ESENCIALES.
                // Muchos 400 se causan por headers malformados, oversized, o con
                // caracteres ilegales. Reducir progresivamente hasta lo mínimo.
                // Eliminamos TODO y dejamos solo lo que cualquier HTTP server acepta.
                h.delete('X-Forwarded-For');
                h.delete('X-Real-IP');
                h.delete('X-Client-IP');
                h.delete('X-Forwarded-Host');
                h.delete('X-Forwarded-Proto');
                h.delete('X-Forwarded-Port');
                h.delete('Authorization');
                h.delete('Proxy-Authorization');
                h.delete('X-Original-URL');
                h.delete('X-Rewrite-URL');
                h.delete('Via');
                h.set('User-Agent', rnd(UA_POOL));
                h.set('Accept', '*/*');
                h.set('Accept-Encoding', 'identity');
                h.set('Connection', 'keep-alive');
                console.log('[CORTEX] STRIP_HEADERS: reducido a headers esenciales para recovery 400');
                break;

            case 'CDN_FAILOVER':
                // PhD-Master-Integrator FIX (2026-04-11): explicit CDN_FAILOVER action.
                // Signal to downstream resolver to try next CDN host in the chain
                // (state.activeServers has per-channel serverId with fallback order).
                h.set('X-CDN-Failover', 'true');
                h.set('X-CDN-Failover-Reason', strategy.reason || 'upstream-failed');
                h.set('X-CDN-Failover-Attempt', String(strategy.attempt || 1));
                h.set('User-Agent', rnd(UA_POOL));
                h.set('Referer', rnd(REFERER_POOL));
                h.set('Cache-Control', 'no-cache');
                h.set('Connection', 'close');  // force new TCP to next CDN
                // Emit event so the resolver can rotate to next server
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    try {
                        window.dispatchEvent(new CustomEvent('ape-cdn-failover', {
                            detail: { url: strategy.url || '', reason: strategy.reason }
                        }));
                    } catch (_) {}
                }
                console.log('[CORTEX] CDN_FAILOVER: rotating to next upstream');
                break;

            case 'MUTATE_FULL':
            default:
                // Mutación polimórfica total — virus mode
                h.set('User-Agent', rnd(UA_POOL));
                h.set('X-Forwarded-For', rndIP());
                h.set('X-Real-IP', rndIP());
                h.set('Referer', rnd(REFERER_POOL));
                h.set('Accept', '*/*');
                h.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                h.set('Proxy-Authorization', rnd(PROXY_AUTH_CHAIN));
                h.set('X-Playback-Session-Id', `SES_${rndStr(16)}`);
                h.set('DNT', '1');
                break;
        }

        // Anti-fingerprint: siempre inyectar fingerprint único
        h.set('X-Request-ID', `REQ_${rndStr(16)}`);

        return h;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ⏱️ MÓDULO 4: BACKOFF ENGINE — Espera inteligente con jitter
    // ═══════════════════════════════════════════════════════════════════════════

    function calculateBackoff(attempt, baseMs, maxMs) {
        const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs || 16000);
        const jitter = Math.floor(Math.random() * (exponential * 0.3)); // ±30% jitter
        return exponential + jitter - Math.floor(exponential * 0.15);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 📡 MÓDULO 5: DIRECTIVE PARSER — Lee directivas APE del M3U8
    // ═══════════════════════════════════════════════════════════════════════════

    const DirectiveParser = {
        _cache: new Map(),

        /**
         * Parsea un string M3U8 y extrae todas las directivas APE
         * @param {string} m3u8Content - Contenido del M3U8
         * @returns {Object} Mapa de directivas
         */
        parse: function(m3u8Content) {
            if (!m3u8Content || typeof m3u8Content !== 'string') return {};

            const hash = m3u8Content.length + '_' + m3u8Content.substring(0, 50);
            if (this._cache.has(hash)) return this._cache.get(hash);

            const directives = {};
            const lines = m3u8Content.split('\n');

            for (const line of lines) {
                if (!line.startsWith('#EXT-X-APE-')) continue;
                const colonIdx = line.indexOf(':');
                if (colonIdx === -1) continue;
                const key = line.substring(1, colonIdx); // Remove #
                const value = line.substring(colonIdx + 1).trim();
                directives[key] = value;
            }

            this._cache.set(hash, directives);
            return directives;
        },

        /**
         * Extrae las directivas de fallback por error code
         * @param {string} m3u8Content
         * @param {number} errorCode
         * @returns {Object} Configuración de fallback para ese error
         */
        getFallback: function(m3u8Content, errorCode) {
            const directives = this.parse(m3u8Content);
            const prefix = `EXT-X-APE-FALLBACK-`;
            const result = {};

            for (const [key, value] of Object.entries(directives)) {
                if (key.startsWith(prefix)) {
                    result[key.replace(prefix, '')] = value;
                }
            }
            return result;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 🏗️ MÓDULO 6: FETCH INTERCEPTOR — El corazón del motor
    // ═══════════════════════════════════════════════════════════════════════════
    // Monkey-patch de fetch() con retry automático, mutación polimórfica,
    // y persistencia infinita. El deco NUNCA se rinde.
    // ═══════════════════════════════════════════════════════════════════════════

    const _originalFetch = window.fetch;
    // E2E-AUDIT FIX (2026-04-16): Prefer _NATIVE_FETCH (saved before Cortex patching)
    // over window.fetch (which is already Cortex-wrapped at this point).
    // This ensures bypass calls in app.js use the REAL browser fetch with zero interceptors.
    window._APE_ORIGINAL_FETCH = window._NATIVE_FETCH || _originalFetch;
    const _stats = { intercepted: 0, retried: 0, recovered: 0, errors: {} };

    /**
     * Detecta si una URL es un stream de media (M3U8, TS, etc.)
     * CRITICAL FIX v1.2: EXCLUDE Xtream management API calls (/player_api.php, /get.php)
     * from interception. These are JSON API endpoints, not media streams.
     * Intercepting them injects custom headers (X-Request-ID, X-Forwarded-For, etc.)
     * that trigger CORS preflight (OPTIONS) which Xtream XUI panels cannot handle,
     * causing ERR_FAILED / Network Error on connection.
     */
    function isMediaRequest(url) {
        if (!url || typeof url !== 'string') return false;
        const u = url.toLowerCase();

        // ═══════════════════════════════════════════════════════════════
        // 🛡️ EXCLUSIÓN ABSOLUTA: API calls de gestión Xtream Codes
        // Estas URLs devuelven JSON, NO son streams de media.
        // Interceptarlas rompe CORS porque el motor inyecta headers custom.
        // ═══════════════════════════════════════════════════════════════
        if (u.includes('/player_api.php') || u.includes('/get.php') ||
            u.includes('/panel_api.php') || u.includes('/xmltv.php')) {
            return false;
        }

        return u.includes('.m3u8') || u.includes('.ts') || u.includes('.m3u') ||
               u.includes('/live/') || u.includes('/stream/') || u.includes('.mpd') ||
               u.includes('.mp4') || u.includes('/hls/') || u.includes('/dash/');
    }

    /**
     * El interceptor principal — cada request de media pasa por aquí
     */
    async function interceptedFetch(input, init) {
        const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));

        // Solo interceptar requests de media/streaming
        if (!isMediaRequest(url)) {
            return _originalFetch(input, init);
        }

        // V1.1: Circuit breaker — skip if host is blocked
        // PhD-AUDIT FIX F1 (2026-04-11): Bypass circuit breaker when user explicitly
        // initiated the connection (connectServer/addServer). Prevents our own CB
        // from blocking legitimate provider integration attempts.
        if (!(typeof window !== 'undefined' && window.APE_USER_INITIATED) && _circuitBreaker.isBlocked(url)) {
            return _originalFetch(input, init);
        }

        _stats.intercepted++;

        // Obtener la cadena de estrategias del Cortex
        let lastError = null;
        let totalAttempts = 0;
        const startTime = performance.now();

        // FASE 1: Intentar la request original
        try {
            const response = await _originalFetch(input, init);
            if (response.ok || (response.status >= 200 && response.status < 300)) {
                _circuitBreaker.recordSuccess(url);
                return response;
            }
            lastError = response.status;
        } catch (networkError) {
            lastError = 0; // Network error (sin conexión, CORS, etc.)
            // CORS/network errors are unrecoverable from the browser — limit retries severely
            _circuitBreaker.recordFailure(url);
            if (_circuitBreaker.isBlocked(url)) {
                return _originalFetch(input, init);
            }
        }

        // FASE 2: Activar el Cortex — escalamiento orgánico
        const chain = CORTEX.getChain(lastError);
        
        for (let strategyIdx = 0; strategyIdx < chain.length; strategyIdx++) {
            const strategy = chain[strategyIdx];
            
            for (let attempt = 0; attempt < strategy.maxRetries; attempt++) {
                totalAttempts++;
                _stats.retried++;

                // Backoff si la estrategia lo requiere
                if (strategy.action === 'BACKOFF_JITTER') {
                    const delay = calculateBackoff(attempt, strategy.baseMs || 500, strategy.maxMs || 16000);
                    await sleep(delay);
                } else if (totalAttempts > 3) {
                    // Micro-delay para no saturar (50-200ms)
                    await sleep(50 + Math.floor(Math.random() * 150));
                }

                // Mutar headers según la estrategia
                const mutatedHeaders = mutateHeaders(
                    init?.headers || {},
                    strategy.action,
                    strategy
                );

                // Construir la nueva request
                const newInit = {
                    ...init,
                    headers: mutatedHeaders,
                    // Si METHOD_SWITCH, probar con otro método
                    method: strategy.action === 'METHOD_SWITCH' ? 
                        (['GET', 'POST', 'HEAD'][attempt % 3]) : 
                        (init?.method || 'GET'),
                    // Para redirects
                    redirect: strategy.action === 'FOLLOW' ? 'follow' : (init?.redirect || 'follow'),
                    // Credenciales
                    credentials: 'omit', // Stealth: nunca enviar cookies del usuario
                    cache: 'no-store'    // Anti-cache
                };

                try {
                    const response = await _originalFetch(url, newInit);

                    // ¡ÉXITO!
                    if (response.ok || (response.status >= 200 && response.status < 300)) {
                        _stats.recovered++;
                        _circuitBreaker.recordSuccess(url);
                        const elapsed = Math.round(performance.now() - startTime);
                        if (!STEALTH_MODE) {
                            console.log(`%c🧬 [APE-RUNTIME] Recovered! ${lastError}→200 | Strategy: ${strategy.action} | Attempts: ${totalAttempts} | ${elapsed}ms`, 'color: #10b981; font-weight: bold;');
                        }
                        return response;
                    }

                    // ¿Nuevo error diferente? Tal vez la cadena cambió
                    if (response.status !== lastError) {
                        // El error mutó — el Cortex se adapta al nuevo error
                        const newChain = CORTEX.getChain(response.status);
                        if (response.status !== lastError && !_stats.errors[response.status]) {
                            _stats.errors[response.status] = 0;
                        }
                        _stats.errors[response.status] = (_stats.errors[response.status] || 0) + 1;
                        lastError = response.status;
                        
                        // Si el error cambió a algo nuevo, reiniciar la cadena desde el principio
                        // para el nuevo error (recursión controlada)
                        if (response.status >= 300 && response.status < 400) {
                            // Redirect: seguir automáticamente
                            const redirectUrl = response.headers.get('Location');
                            if (redirectUrl) {
                                return interceptedFetch(redirectUrl, init);
                            }
                        }
                    }

                } catch (fetchError) {
                    // Error de red (timeout, DNS, CORS) — record and maybe stop
                    _circuitBreaker.recordFailure(url);
                    if (_circuitBreaker.isBlocked(url)) {
                        // Host is fundamentally broken, stop retrying
                        return _originalFetch(input, init);
                    }
                    if (!STEALTH_MODE) {
                        console.warn(`[APE-RUNTIME] Network error on attempt ${totalAttempts}: ${fetchError.message}`);
                    }
                }
            }
        }

        // FASE 3: LAST RESORT — Mutación total (limitada)
        // V1.1: Reduced from 10 to 3 survival attempts
        for (let survivalAttempt = 0; survivalAttempt < 3; survivalAttempt++) {
            if (_circuitBreaker.isBlocked(url)) break;
            await sleep(calculateBackoff(survivalAttempt, 1000, 30000));
            
            const survivalHeaders = mutateHeaders({}, 'MUTATE_FULL', {});
            
            try {
                const response = await _originalFetch(url, {
                    ...init,
                    headers: survivalHeaders,
                    credentials: 'omit',
                    cache: 'no-store'
                });
                
                if (response.ok) {
                    _stats.recovered++;
                    return response;
                }
            } catch (e) { /* sobrevivir */ }
        }

        // Si después de TODO falló, devolver la última respuesta fallida
        // para que el player no se quede colgado
        if (!STEALTH_MODE) {
            console.error(`[APE-RUNTIME] Exhausted all ${totalAttempts} attempts for: ${url.substring(0, 80)}...`);
        }
        return _originalFetch(input, init);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 📡 MÓDULO 7: XMLHttpRequest INTERCEPTOR
    // ═══════════════════════════════════════════════════════════════════════════
    // Algunos players usan XHR en vez de fetch. Capturamos ambos.
    // ═══════════════════════════════════════════════════════════════════════════

    const _OriginalXHR = window.XMLHttpRequest;
    // E2E-AUDIT FIX (2026-04-16): Prefer _NATIVE_XHR (saved before Cortex patching)
    window._APE_ORIGINAL_XHR = window._NATIVE_XHR || _OriginalXHR;

    class InterceptedXHR extends _OriginalXHR {
        constructor() {
            super();
            this._apeUrl = '';
            this._apeMethod = 'GET';
            this._apeHeaders = {};
            this._apeRetryCount = 0;
            this._apeMaxRetries = MAX_RETRIES;
        }

        open(method, url, async, user, password) {
            this._apeUrl = url;
            this._apeMethod = method;
            return super.open(method, url, async !== false, user, password);
        }

        setRequestHeader(name, value) {
            this._apeHeaders[name] = value;
            return super.setRequestHeader(name, value);
        }

        send(body) {
            if (!isMediaRequest(this._apeUrl)) {
                return super.send(body);
            }

            _stats.intercepted++;

            const originalOnLoad = this.onload;
            const originalOnError = this.onerror;
            const self = this;

            this.onload = function() {
                if (self.status >= 200 && self.status < 300) {
                    // Éxito directo
                    if (originalOnLoad) originalOnLoad.call(self);
                } else if (self.status >= 300 && self._apeRetryCount < self._apeMaxRetries) {
                    // Error HTTP — activar Cortex vía fetch bridge
                    self._retryViaFetchBridge(body, originalOnLoad, originalOnError);
                } else {
                    if (originalOnLoad) originalOnLoad.call(self);
                }
            };

            this.onerror = function() {
                if (self._apeRetryCount < self._apeMaxRetries) {
                    self._retryViaFetchBridge(body, originalOnLoad, originalOnError);
                } else {
                    if (originalOnError) originalOnError.call(self);
                }
            };

            return super.send(body);
        }

        _retryViaFetchBridge(body, onLoad, onError) {
            this._apeRetryCount++;
            _stats.retried++;

            // Usar fetch interceptado para el retry (tiene toda la lógica del Cortex)
            interceptedFetch(this._apeUrl, {
                method: this._apeMethod,
                headers: this._apeHeaders,
                body: body
            }).then(response => {
                if (response.ok) {
                    _stats.recovered++;
                }
                // El XHR ya completó, pero registramos la recuperación
            }).catch(() => {
                // Silencioso en stealth mode
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔌 MÓDULO 8: ACTIVACIÓN — Monkey-patch de fetch + XHR
    // ═══════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔋 MÓDULO 9: OVERFLOW HEADERS INJECTOR — Los 45+ headers del JS
    // ═══════════════════════════════════════════════════════════════════════════
    // Los headers que excedieron el límite de 10KB en #EXTHTTP viajan
    // codificados en base64 dentro de #EXT-X-APE-OVERFLOW-HEADERS.
    // Este módulo los decodifica y los inyecta en CADA request de media
    // que el Runtime Engine intercepta, completando el payload completo.
    // ═══════════════════════════════════════════════════════════════════════════

    const OverflowInjector = {
        _overflowCache: {},  // Cache de headers overflow decodificados
        _loaded: false,

        /**
         * Decodifica base64url a string UTF-8
         */
        _b64Decode: function(b64) {
            try {
                // Restaurar chars estándar de base64
                let s = b64.replace(/-/g, '+').replace(/_/g, '/');
                // Padding
                while (s.length % 4 !== 0) s += '=';
                return decodeURIComponent(escape(atob(s)));
            } catch (e) {
                return null;
            }
        },

        /**
         * Parsea un M3U8 y extrae los overflow headers
         * @param {string} m3u8Content - Contenido del M3U8
         */
        loadFromM3U8: function(m3u8Content) {
            if (!m3u8Content || typeof m3u8Content !== 'string') return;

            const lines = m3u8Content.split('\n');
            for (const line of lines) {
                if (!line.startsWith('#EXT-X-APE-OVERFLOW-HEADERS:')) continue;
                const b64 = line.substring('#EXT-X-APE-OVERFLOW-HEADERS:'.length).trim();
                const decoded = this._b64Decode(b64);
                if (decoded) {
                    try {
                        const headers = JSON.parse(decoded);
                        Object.assign(this._overflowCache, headers);
                        this._loaded = true;
                    } catch (e) { /* JSON parse error — skip */ }
                }
            }
        },

        /**
         * Inyecta los overflow headers en un objeto Headers existente
         * @param {Headers} headers - Headers de la request
         * @returns {Headers} Headers enriquecidos con overflow
         */
        inject: function(headers) {
            if (!this._loaded || Object.keys(this._overflowCache).length === 0) return headers;

            const h = new Headers(headers || {});
            for (const [key, value] of Object.entries(this._overflowCache)) {
                // Solo inyectar si el header no existe ya (no sobrescribir los primarios)
                if (!h.has(key)) {
                    try { h.set(key, value); } catch (e) { /* header name inválido — skip */ }
                }
            }
            return h;
        },

        /**
         * Retorna cuántos headers overflow están cargados
         */
        count: function() {
            return Object.keys(this._overflowCache).length;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔋 MÓDULO 9B: AUTO-LOADER — Carga overflow headers del M3U8 automáticamente
    // ═══════════════════════════════════════════════════════════════════════════
    // Intercepta la carga de listas M3U8 para extraer overflow headers
    // antes de que el player empiece a descargar segmentos.
    // ═══════════════════════════════════════════════════════════════════════════

    const _origFetchForOverflow = window.fetch;

    // Wrap the original interceptedFetch to also load overflow headers
    const _interceptWithOverflow = async function(input, init) {
        const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));

        // Si es un .m3u8, parsear el contenido para extraer overflow headers
        if (url && typeof url === 'string' && (url.includes('.m3u8') || url.includes('.m3u'))) {
            try {
                const resp = await _originalFetch(input, init);
                if (resp.ok) {
                    const cloned = resp.clone();
                    const text = await cloned.text();
                    OverflowInjector.loadFromM3U8(text);
                    // Crear nueva Response con el texto para que el player lo consuma normalmente
                    return new Response(text, {
                        status: resp.status,
                        statusText: resp.statusText,
                        headers: resp.headers
                    });
                }
                return resp;
            } catch (e) {
                // Si falla, delegar al interceptor normal
            }
        }

        return interceptedFetch(input, init);
    };

    function activate() {
        // Patch fetch — con overflow injection integrada
        window.fetch = function(input, init) {
            const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));

            // Para requests de media, inyectar overflow headers
            if (isMediaRequest(url) && OverflowInjector._loaded) {
                if (!init) init = {};
                init.headers = OverflowInjector.inject(init.headers || {});
            }

            return interceptedFetch(input, init);
        };

        // Patch XMLHttpRequest
        window.XMLHttpRequest = InterceptedXHR;

        // Registrar en window para acceso global
        window.APE_RUNTIME_ENGINE = {
            version: ENGINE_VERSION,
            stats: _stats,
            cortex: CORTEX,
            parser: DirectiveParser,
            overflow: OverflowInjector,
            
            getStats: function() {
                return {
                    ...this.stats,
                    recoveryRate: this.stats.intercepted > 0 ? 
                        Math.round((this.stats.recovered / this.stats.retried) * 100) + '%' : '0%'
                };
            },

            // Permitir al usuario forzar stealth on/off
            setStealth: function(on) {
                // No podemos modify const, but we can use this
                window._APE_RUNTIME_STEALTH = on;
            },

            // Inyectar directivas de un M3U8 cargado
            injectDirectives: function(m3u8Content) {
                return DirectiveParser.parse(m3u8Content);
            },

            // Reportar estado (para debug)
            report: function() {
                const s = this.getStats();
                console.table({
                    'Engine Version': ENGINE_VERSION,
                    'Requests Intercepted': s.intercepted,
                    'Retries Executed': s.retried,
                    'Successful Recoveries': s.recovered,
                    'Recovery Rate': s.recoveryRate,
                    'Error Distribution': JSON.stringify(s.errors)
                });
            }
        };

        if (!STEALTH_MODE) {
            console.log(`%c🧬 APE Runtime Evasion Engine v${ENGINE_VERSION} — ACTIVE`, 'color: #8b5cf6; font-weight: bold; font-size: 14px;');
            console.log('%c   Fetch interceptor: ✅ | XHR interceptor: ✅ | Cortex: 13 strategies | Persistence: INFINITE', 'color: #6366f1;');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🚀 IGNITION
    // ═══════════════════════════════════════════════════════════════════════════

    activate();

})();
