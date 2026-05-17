// ═══════════════════════════════════════════════════════════════════════════════
// 🌐 UNIVERSAL SERVER ADAPTER (USA) v1.0 — IDEMPOTENTE + POLIMÓRFICO
// ═══════════════════════════════════════════════════════════════════════════════
//
// OBJETIVO: Conectarse a CUALQUIER servidor IPTV del mundo sin importar:
//   - Protocolo: HTTP o HTTPS
//   - Código de respuesta: 200 (directo) o 302 (redirect CDN)
//   - Tipo de servidor: Xtream Codes, Stalker Middleware, FrontCDN, custom
//   - Puerto: 80, 443, 8080, 25461, cualquier otro
//   - Extensión: .m3u8, .ts, .mp4, .mkv, .mpd
//   - Autenticación: user/pass en URL, token en query, Basic Auth en header
//
// IDEMPOTENCIA: Dado el mismo canal + servidor, siempre produce la misma URL.
//   No importa cuántas veces se llame — el resultado es determinista.
//
// POLIMORFISMO: Cada tipo de servidor recibe directivas EXTHTTP/EXTVLCOPT/KODIPROP
//   adaptadas a sus particularidades. Un servidor HTTPS con 302 recibe headers
//   distintos a uno HTTP con 200, aunque el canal sea el mismo.
//
// ÁRBOL DE DECISIÓN (O(1) por canal):
//
//   ┌─ ¿Tiene URL pre-resuelta en caché? ──────────────────────────► URL_CACHE
//   │
//   ├─ ¿Es FrontCDN? (_forceTS / _frontCDNHost / dominio conocido)
//   │   ├─ ¿Tiene token en caché? ────────────────────────────────► FRONTCDN_TOKEN
//   │   └─ ¿Tiene _frontCDNHost? ────────────────────────────────► FRONTCDN_PROXY
//   │
//   ├─ ¿Es Stalker/MAG? (portal, get.php, /c/ en URL)
//   │   └─ URL directa con MAC en query ─────────────────────────► STALKER_URL
//   │
//   ├─ ¿Es Xtream Codes? (player_api.php, /live/, /movie/, /series/)
//   │   ├─ ¿Servidor HTTPS? ─────────────────────────────────────► XTREAM_HTTPS
//   │   └─ ¿Servidor HTTP? ──────────────────────────────────────► XTREAM_HTTP
//   │
//   └─ ¿Es URL custom/raw? (ya tiene http:// completa)
//       └─ Passthrough con normalización ──────────────────────► CUSTOM_RAW
//
// POLIMORFISMO DE DIRECTIVAS POR TIPO:
//
//   TIPO_HTTPS_200: Sec-Fetch-Site=cross-site, X-Forwarded-Proto=https,
//                  KODIPROP ssl_verify=false, EXTVLCOPT network-caching=4000
//
//   TIPO_HTTP_200:  Sec-Fetch-Site=same-origin, X-Forwarded-Proto=http,
//                  EXTVLCOPT network-caching=8000 (más buffer para HTTP)
//
//   TIPO_302_CDN:   X-Cache-Control=no-store, X-Redirect-Follow=true,
//                  KODIPROP manifest_update_parameter=full,
//                  EXTVLCOPT http-reconnect=true, live-caching=60000
//
//   TIPO_FRONTCDN:  Sin parámetros extra en URL, token en path,
//                  EXTVLCOPT http-forward=true
//
//   TIPO_STALKER:   MAC en header X-Stalker-MAC, portal en X-Stalker-Portal
//
// ═══════════════════════════════════════════════════════════════════════════════

    // ── CONSTANTES DEL MOTOR USA ──────────────────────────────────────────────

    /** Tipos de servidor detectables */
    const USA_SERVER_TYPE = {
        XTREAM_HTTP:    'xtream_http',
        XTREAM_HTTPS:   'xtream_https',
        FRONTCDN:       'frontcdn',
        STALKER:        'stalker',
        CUSTOM_RAW:     'custom_raw',
        UNKNOWN:        'unknown'
    };

    /** Tipos de respuesta HTTP esperada */
    const USA_RESPONSE_TYPE = {
        DIRECT_200:     '200',   // Servidor sirve stream directamente
        REDIRECT_302:   '302',   // Servidor redirige a CDN con token
        UNKNOWN:        'auto'   // No se sabe — el reproductor lo resuelve
    };

    /** Extensiones por tipo de contenido y servidor */
    const USA_EXT_MAP = {
        live_xtream:    'm3u8',   // Xtream Codes live → HLS playlist
        live_frontcdn:  'ts',     // FrontCDN → MPEG-TS directo (evita CORS en redirect)
        live_stalker:   'ts',     // Stalker → MPEG-TS
        movie:          'mp4',    // VOD por defecto
        series:         'mp4',    // Series por defecto
        custom:         'm3u8'    // Custom → intentar HLS primero
    };

    /** Cache de fingerprints de servidor (idempotencia) */
    if (typeof globalThis !== 'undefined' && !globalThis.__APE_USA_SERVER_CACHE__) {
        globalThis.__APE_USA_SERVER_CACHE__ = new Map();
    }

    // ── FUNCIÓN PRINCIPAL: detectServerFingerprint ────────────────────────────
    /**
     * Detecta el tipo, protocolo y comportamiento de un servidor IPTV.
     * IDEMPOTENTE: el mismo baseUrl siempre produce el mismo fingerprint.
     * @param {string} baseUrl - URL base del servidor
     * @param {object} creds - Credenciales con flags opcionales
     * @returns {object} fingerprint del servidor
     */
    function detectServerFingerprint(baseUrl, creds = {}) {
        if (!baseUrl) return { type: USA_SERVER_TYPE.UNKNOWN, proto: 'http', responseType: USA_RESPONSE_TYPE.UNKNOWN };

        // Cache idempotente: mismo servidor → mismo fingerprint siempre
        const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
        const cache = globalScope.__APE_USA_SERVER_CACHE__;
        const cacheKey = `${baseUrl}|${creds._forceTS||''}|${creds._frontCDNHost||''}|${creds._forceHTTPS||''}`;
        if (cache && cache.has(cacheKey)) return cache.get(cacheKey);

        const lower = baseUrl.toLowerCase();
        const isHttps = lower.startsWith('https://');
        const proto = isHttps ? 'https' : 'http';

        let fingerprint;

        // ── DETECCIÓN 1: FrontCDN (redirect 302 a CDN con token) ──
        if (
            (creds._forceTS === true) ||
            (creds._frontCDNHost) ||
            FRONTCDN_FORCE_TS_HOSTS.some(h => lower.includes(h)) ||
            lower.includes('frontcdn') ||
            lower.includes('ky-tv') ||
            lower.includes('kemotv')
        ) {
            fingerprint = {
                type: USA_SERVER_TYPE.FRONTCDN,
                proto,
                responseType: USA_RESPONSE_TYPE.REDIRECT_302,
                ext: USA_EXT_MAP.live_frontcdn,
                directives: 'frontcdn'
            };
        }
        // ── DETECCIÓN 2: Stalker Middleware / MAG ──
        else if (
            lower.includes('/portal.php') ||
            lower.includes('/stalker_portal') ||
            lower.includes('/c/') ||
            lower.includes('get.php') ||
            (creds._serverType === 'stalker') ||
            (creds._isStalker === true)
        ) {
            fingerprint = {
                type: USA_SERVER_TYPE.STALKER,
                proto,
                responseType: USA_RESPONSE_TYPE.DIRECT_200,
                ext: USA_EXT_MAP.live_stalker,
                directives: 'stalker'
            };
        }
        // ── DETECCIÓN 3: Xtream Codes HTTPS ──
        else if (isHttps) {
            fingerprint = {
                type: USA_SERVER_TYPE.XTREAM_HTTPS,
                proto: 'https',
                responseType: USA_RESPONSE_TYPE.DIRECT_200,
                ext: USA_EXT_MAP.live_xtream,
                directives: 'xtream_https'
            };
        }
        // ── DETECCIÓN 4: Xtream Codes HTTP (default) ──
        else {
            fingerprint = {
                type: USA_SERVER_TYPE.XTREAM_HTTP,
                proto: 'http',
                responseType: USA_RESPONSE_TYPE.DIRECT_200,
                ext: USA_EXT_MAP.live_xtream,
                directives: 'xtream_http'
            };
        }

        // Enriquecer fingerprint con datos del servidor si están disponibles
        fingerprint.baseUrl = baseUrl;
        fingerprint.port = (() => {
            try { return new URL(baseUrl).port || (isHttps ? '443' : '80'); } catch(e) { return '80'; }
        })();
        fingerprint.host = (() => {
            try { return new URL(baseUrl).hostname; } catch(e) { return baseUrl.replace(/^https?:\/\//, '').split(':')[0].split('/')[0]; }
        })();

        if (cache) cache.set(cacheKey, fingerprint);
        return fingerprint;
    }

    // ── FUNCIÓN: buildUniversalUrl ────────────────────────────────────────────
    /**
     * Construye la URL óptima para un canal dado el fingerprint del servidor.
     * IDEMPOTENTE: mismo canal + servidor → misma URL.
     * POLIMÓRFICO: la URL se adapta al tipo de servidor detectado.
     *
     * @param {object} channel - Objeto canal con stream_id, type, container_extension
     * @param {object} creds - Credenciales {baseUrl, username, password, ...}
     * @param {object} fingerprint - Resultado de detectServerFingerprint()
     * @param {string} profile - Perfil de calidad P0-P5
     * @returns {string} URL final lista para insertar en la lista M3U8
     */
    function buildUniversalUrl(channel, creds, fingerprint, profile = 'P3') {
        const streamId = channel.stream_id || channel.id || channel.num || '0';
        const typePath = (channel.type === 'movie' || channel.stream_type === 'movie') ? 'movie'
                       : (channel.type === 'series' || channel.stream_type === 'series') ? 'series'
                       : 'live';

        // Extensión polimórfica según tipo de servidor y contenido
        let ext = fingerprint.ext || 'm3u8';
        if (typePath === 'movie') ext = channel.container_extension || 'mp4';
        if (typePath === 'series') ext = channel.container_extension || 'mp4';
        // Override desde el canal si tiene formato custom
        if (channel.customFormat) ext = channel.customFormat;
        if (channel.container_extension && channel.container_extension !== 'mp4' && typePath === 'live') {
            ext = channel.container_extension;
        }

        const base = creds.baseUrl.replace(/\/$/, '');
        const user = creds.username;
        const pass = creds.password;

        // ── URL según tipo de servidor ──
        switch (fingerprint.type) {

            case USA_SERVER_TYPE.FRONTCDN: {
                // FrontCDN: intentar URL pre-resuelta del caché primero
                const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
                const resolveCache = globalScope.__APE_FRONTCDN_RESOLVE_CACHE__;
                const directUrl = `${base}/live/${user}/${pass}/${streamId}.ts`;
                const resolved = resolveCache && resolveCache[directUrl];
                if (resolved && resolved !== directUrl) return resolved;

                // Fallback: usar _frontCDNHost si está disponible
                if (creds._frontCDNHost) {
                    try {
                        const u = new URL(directUrl);
                        u.hostname = creds._frontCDNHost;
                        u.protocol = 'http:';
                        return u.toString();
                    } catch(e) {}
                }
                // Último fallback: URL directa .ts
                return directUrl;
            }

            case USA_SERVER_TYPE.STALKER: {
                // Stalker: URL con MAC en query si está disponible
                const mac = creds.mac || creds._mac || '';
                const portal = base.includes('/c/') ? base : `${base}/c/`;
                if (mac) {
                    return `${portal}?type=stb&action=get_ordered_list&mac=${encodeURIComponent(mac)}&stream_id=${streamId}`;
                }
                // Fallback Stalker: intentar como Xtream
                return `${base}/${typePath}/${user}/${pass}/${streamId}.${ext}`;
            }

            case USA_SERVER_TYPE.XTREAM_HTTPS:
            case USA_SERVER_TYPE.XTREAM_HTTP:
            default: {
                // Xtream Codes estándar: URL limpia sin parámetros extra
                // El protocolo es SAGRADO — se usa exactamente el que tiene el servidor
                return `${base}/${typePath}/${user}/${pass}/${streamId}.${ext}`;
            }
        }
    }

    // ── FUNCIÓN: getUSADirectiveOverrides ─────────────────────────────────────
    /**
     * Devuelve las directivas EXTHTTP, EXTVLCOPT y KODIPROP adicionales
     * específicas para el tipo de servidor detectado.
     * POLIMÓRFICO: cada tipo de servidor recibe directivas diferentes.
     *
     * @param {object} fingerprint - Resultado de detectServerFingerprint()
     * @param {object} cfg - Configuración del perfil actual
     * @returns {object} { exthttp: {}, extvlcopt: [], kodiprop: [] }
     */
    function getUSADirectiveOverrides(fingerprint, cfg = {}) {
        const overrides = { exthttp: {}, extvlcopt: [], kodiprop: [] };

        switch (fingerprint.type) {

            // ── Xtream Codes HTTPS ──────────────────────────────────────────
            case USA_SERVER_TYPE.XTREAM_HTTPS:
                overrides.exthttp = {
                    'X-Forwarded-Proto': 'https',
                    'X-USA-Server-Type': 'xtream-https',
                    'X-USA-Response-Expected': '200',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Site': 'cross-site',
                };
                overrides.extvlcopt = [
                    '#EXTVLCOPT:network-caching=4000',
                    '#EXTVLCOPT:http-reconnect=true',
                    '#EXTVLCOPT:network-reconnect-delay=100',
                ];
                overrides.kodiprop = [
                    '#KODIPROP:inputstream.adaptive.ssl_verify_peer=false',
                    '#KODIPROP:inputstream.adaptive.ssl_verify_host=false',
                    '#KODIPROP:inputstream.adaptive.manifest_headers=Upgrade-Insecure-Requests%3A1',
                ];
                break;

            // ── Xtream Codes HTTP ───────────────────────────────────────────
            case USA_SERVER_TYPE.XTREAM_HTTP:
                overrides.exthttp = {
                    'X-Forwarded-Proto': 'http',
                    'X-USA-Server-Type': 'xtream-http',
                    'X-USA-Response-Expected': '200',
                    'Sec-Fetch-Site': 'same-origin',
                };
                overrides.extvlcopt = [
                    '#EXTVLCOPT:network-caching=8000',
                    '#EXTVLCOPT:http-reconnect=true',
                    '#EXTVLCOPT:network-reconnect-delay=50',
                ];
                overrides.kodiprop = [
                    '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full',
                ];
                break;

            // ── FrontCDN (302 → token CDN) ──────────────────────────────────
            case USA_SERVER_TYPE.FRONTCDN:
                overrides.exthttp = {
                    'X-USA-Server-Type': 'frontcdn-302',
                    'X-USA-Response-Expected': '302',
                    'X-Cache-Control': 'no-store',
                    'X-Redirect-Follow': 'true',
                    'X-CDN-Token-TTL': '31536000',
                    'Sec-Fetch-Site': 'cross-site',
                };
                overrides.extvlcopt = [
                    '#EXTVLCOPT:http-forward=true',
                    '#EXTVLCOPT:http-reconnect=true',
                    '#EXTVLCOPT:live-caching=60000',
                    '#EXTVLCOPT:network-caching=60000',
                    '#EXTVLCOPT:network-reconnect-delay=200',
                ];
                overrides.kodiprop = [
                    '#KODIPROP:inputstream.adaptive.manifest_update_parameter=full',
                    '#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
                ];
                break;

            // ── Stalker Middleware ──────────────────────────────────────────
            case USA_SERVER_TYPE.STALKER:
                overrides.exthttp = {
                    'X-USA-Server-Type': 'stalker-middleware',
                    'X-USA-Response-Expected': '200',
                    'X-Stalker-Auth': 'token',
                    'Sec-Fetch-Site': 'same-origin',
                };
                overrides.extvlcopt = [
                    '#EXTVLCOPT:network-caching=12000',
                    '#EXTVLCOPT:http-reconnect=true',
                ];
                overrides.kodiprop = [];
                break;

            // ── Custom / Unknown ────────────────────────────────────────────
            default:
                overrides.exthttp = {
                    'X-USA-Server-Type': 'universal-auto',
                    'X-USA-Response-Expected': 'auto',
                    'Sec-Fetch-Site': 'cross-site',
                };
                overrides.extvlcopt = [
                    '#EXTVLCOPT:http-reconnect=true',
                    '#EXTVLCOPT:network-caching=8000',
                ];
                overrides.kodiprop = [];
                break;
        }

        // ── Directivas universales para TODOS los tipos ──
        // Estas van siempre, independientemente del servidor
        overrides.exthttp['X-USA-Version'] = '1.0';
        overrides.exthttp['X-USA-Proto'] = fingerprint.proto;
        overrides.exthttp['X-USA-Host'] = fingerprint.host || '';
        overrides.exthttp['X-USA-Port'] = fingerprint.port || '80';
        overrides.exthttp['X-USA-Idempotency-Key'] = (() => {
            // Clave idempotente: hash determinista del servidor
            const str = `${fingerprint.host}|${fingerprint.proto}|${fingerprint.type}`;
            let h = 0;
            for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
            return (h >>> 0).toString(16).padStart(8, '0');
        })();

        return overrides;
    }

    // ── FUNCIÓN: applyUSAOverrides ────────────────────────────────────────────
    /**
     * Aplica los overrides del USA al bloque de headers EXTHTTP existente.
     * NO reemplaza los headers base — los ENRIQUECE con los específicos del servidor.
     * IDEMPOTENTE: aplicar dos veces produce el mismo resultado que aplicar una.
     *
     * @param {object} baseHeaders - Headers EXTHTTP base del generador
     * @param {object} overrides - Resultado de getUSADirectiveOverrides()
     * @returns {object} Headers enriquecidos
     */
    function applyUSAOverrides(baseHeaders, overrides) {
        // Los headers del USA tienen menor precedencia que los del generador base
        // (el generador base ya tiene los valores óptimos para calidad/evasión)
        // Solo se agregan los headers que NO existen en el base
        const merged = Object.assign({}, overrides.exthttp, baseHeaders);
        return merged;
    }

// ═══════════════════════════════════════════════════════════════════════════════
// FIN DEL MÓDULO USA v1.0
// ═══════════════════════════════════════════════════════════════════════════════
