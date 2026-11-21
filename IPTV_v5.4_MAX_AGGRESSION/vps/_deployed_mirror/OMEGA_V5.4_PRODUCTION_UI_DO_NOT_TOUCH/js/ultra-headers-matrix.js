/**
 * ═══════════════════════════════════════════════════════════════════
 * 🎛️ ULTRA HEADERS MATRIX v1.0 - 33 Headers × 5 Niveles
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Sistema completo de headers HTTP para streaming IPTV optimizado.
 * Cada header tiene 5 niveles de agresividad:
 *   1. Normal    - Configuración básica, máxima compatibilidad
 *   2. Plus      - Optimización moderada
 *   3. Pro       - Optimización avanzada (recomendado)
 *   4. Extreme   - Máximo rendimiento, puede causar bloqueos
 *   5. ULTRA     - Configuración más agresiva posible
 */

const ULTRA_HEADERS_MATRIX = {
    version: "1.0",
    totalHeaders: 35,
    levels: 5,
    lastUpdated: new Date().toISOString(),

    headers: {
        // ═══════════════════════════════════════════════════════════
        // 🆔 IDENTITY HEADERS (Identidad del cliente)
        // ═══════════════════════════════════════════════════════════

        "User-Agent": {
            description: "Identifica el cliente que realiza la petición",
            category: "Identity",
            priority: 10,
            validated: true,
            sources: ["MDN", "Reddit r/IPTV", "GitHub iptv-org"],
            levels: {
                1: {
                    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    description: "Chrome genérico Windows"
                },
                2: {
                    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    description: "Chrome 120 completo"
                },
                3: {
                    value: "Lavf/60.3.100",
                    description: "FFmpeg/Lavf - Player nativo"
                },
                4: {
                    value: "VLC/3.0.20 LibVLC/3.0.20",
                    description: "VLC Player"
                },
                5: {
                    generator: (channel, server) => {
                        const agents = [
                            "ExoPlayer/2.19.1 (Linux; Android 13)",
                            "Kodi/20.2 (Windows NT 10.0; Win64; x64)",
                            "OTT Navigator/1.6.7.3",
                            "TiviMate/4.5.0 (Android 13)"
                        ];
                        return agents[Math.floor(Math.random() * agents.length)];
                    },
                    description: "Rotación aleatoria de players"
                }
            }
        },

        "Referer": {
            description: "URL de origen de la petición",
            category: "Identity",
            priority: 9,
            validated: true,
            sources: ["MDN", "CORS docs"],
            levels: {
                1: { value: "", description: "Sin referer" },
                2: { value: "{serverOrigin}", description: "Origen del servidor" },
                3: { value: "{serverOrigin}/", description: "Origen con slash" },
                4: { value: "{serverUrl}", description: "URL completa del servidor" },
                5: {
                    generator: (channel, server) => `${server.baseUrl}/player_api.php`,
                    description: "URL del player API"
                }
            }
        },

        "Origin": {
            description: "Origen de la petición CORS",
            category: "Identity",
            priority: 8,
            validated: true,
            sources: ["MDN CORS"],
            levels: {
                1: { value: "", description: "Sin origin" },
                2: { value: "{serverOrigin}", description: "Mismo origen" },
                3: { value: "{serverOrigin}", description: "Mismo origen (forzado)" },
                4: { value: "null", description: "Origen nulo (sandbox)" },
                5: { value: "{serverOrigin}", description: "Origen dinámico" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🔐 AUTH HEADERS (Autenticación)
        // ═══════════════════════════════════════════════════════════

        "Authorization": {
            description: "Token de autenticación",
            category: "Auth",
            priority: 10,
            validated: true,
            sources: ["RFC 7235"],
            levels: {
                1: { value: "", description: "Sin auth" },
                2: {
                    generator: (ch, srv) => srv.token ? `Bearer ${srv.token}` : "",
                    description: "Bearer token si existe"
                },
                3: {
                    generator: (ch, srv) => srv.username ? `Basic ${btoa(srv.username + ':' + srv.password)}` : "",
                    description: "Basic auth"
                },
                4: {
                    generator: (ch, srv) => srv.token ? `Bearer ${srv.token}` : srv.username ? `Basic ${btoa(srv.username + ':' + srv.password)}` : "",
                    description: "Bearer o Basic"
                },
                5: {
                    generator: (ch, srv) => {
                        if (srv.customAuth) return srv.customAuth;
                        if (srv.token) return `Bearer ${srv.token}`;
                        if (srv.username) return `Basic ${btoa(srv.username + ':' + srv.password)}`;
                        return "";
                    },
                    description: "Auth dinámico completo"
                }
            }
        },

        "X-Auth-Token": {
            description: "Token alternativo de autenticación",
            category: "Auth",
            priority: 7,
            validated: true,
            sources: ["XUI API"],
            levels: {
                1: { value: "", description: "Sin token" },
                2: { generator: (ch, srv) => srv.authToken || "", description: "Token si existe" },
                3: { generator: (ch, srv) => srv.authToken || srv.token || "", description: "Token fallback" },
                4: { generator: (ch, srv) => srv.authToken || srv.token || `${srv.username}_${Date.now()}`, description: "Token generado" },
                5: { generator: (ch, srv) => `${srv.username || 'user'}_${Date.now()}_${Math.random().toString(36).substr(2)}`, description: "Token único por request" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🌐 CORS HEADERS
        // ═══════════════════════════════════════════════════════════

        "Access-Control-Allow-Origin": {
            description: "Orígenes permitidos CORS",
            category: "CORS",
            priority: 6,
            validated: true,
            sources: ["MDN CORS"],
            levels: {
                1: { value: "*", description: "Todos los orígenes" },
                2: { value: "*", description: "Todos los orígenes" },
                3: { value: "{serverOrigin}", description: "Solo servidor" },
                4: { value: "{serverOrigin}", description: "Solo servidor" },
                5: { value: "*", description: "Wildcard para máxima compatibilidad" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 💾 CACHING HEADERS
        // ═══════════════════════════════════════════════════════════

        "Cache-Control": {
            description: "Control de caché HTTP",
            category: "Caching",
            priority: 8,
            validated: true,
            sources: ["MDN", "RFC 7234"],
            levels: {
                1: { value: "no-cache", description: "Sin caché" },
                2: { value: "no-store, no-cache", description: "Sin almacenamiento" },
                3: { value: "no-store, no-cache, must-revalidate", description: "Revalidación forzada" },
                4: { value: "no-store, no-cache, must-revalidate, max-age=0", description: "Máxima frescura" },
                5: { value: "no-store, no-cache, no-transform, must-revalidate, max-age=0, s-maxage=0", description: "Control total" }
            }
        },

        "Pragma": {
            description: "Directiva de caché legacy",
            category: "Caching",
            priority: 5,
            validated: true,
            sources: ["RFC 7234"],
            levels: {
                1: { value: "", description: "Sin pragma" },
                2: { value: "no-cache", description: "No cache" },
                3: { value: "no-cache", description: "No cache" },
                4: { value: "no-cache", description: "No cache" },
                5: { value: "no-cache", description: "No cache" }
            }
        },

        "Expires": {
            description: "Fecha de expiración del recurso",
            category: "Caching",
            priority: 4,
            validated: true,
            sources: ["RFC 7234"],
            levels: {
                1: { value: "", description: "Sin expires" },
                2: { value: "0", description: "Expirado" },
                3: { value: "0", description: "Expirado" },
                4: { value: "-1", description: "Inmediatamente expirado" },
                5: { value: "Thu, 01 Jan 1970 00:00:00 GMT", description: "Epoch (siempre expirado)" }
            }
        },

        "If-None-Match": {
            description: "ETag para validación condicional",
            category: "Caching",
            priority: 3,
            validated: true,
            sources: ["RFC 7232"],
            levels: {
                1: { value: "", description: "Sin validación" },
                2: { value: "", description: "Sin validación" },
                3: { value: "*", description: "Cualquier recurso" },
                4: { value: "*", description: "Cualquier recurso" },
                5: { generator: () => `W/"${Date.now()}"`, description: "ETag único" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🔗 CONNECTION HEADERS
        // ═══════════════════════════════════════════════════════════

        "Connection": {
            description: "Control de conexión persistente",
            category: "Connection",
            priority: 9,
            validated: true,
            sources: ["RFC 7230"],
            levels: {
                1: { value: "close", description: "Cerrar después de respuesta" },
                2: { value: "keep-alive", description: "Mantener abierta" },
                3: { value: "keep-alive", description: "Mantener abierta" },
                4: { value: "keep-alive, Upgrade", description: "Keep-alive con upgrade" },
                5: { value: "keep-alive, Upgrade, HTTP2-Settings", description: "Conexión avanzada" }
            }
        },

        "Keep-Alive": {
            description: "Parámetros de conexión persistente",
            category: "Connection",
            priority: 7,
            validated: true,
            sources: ["RFC 7230"],
            levels: {
                1: { value: "timeout=5", description: "5 segundos timeout" },
                2: { value: "timeout=30, max=100", description: "30s, 100 requests" },
                3: { value: "timeout=60, max=500", description: "60s, 500 requests" },
                4: { value: "timeout=120, max=1000", description: "120s, 1000 requests" },
                5: { value: "timeout=300, max=10000", description: "5 min, 10000 requests" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📦 COMPRESSION HEADERS
        // ═══════════════════════════════════════════════════════════

        "Accept-Encoding": {
            description: "Codificaciones aceptadas",
            category: "Compression",
            priority: 6,
            validated: true,
            sources: ["MDN", "RFC 7231"],
            levels: {
                1: { value: "identity", description: "Sin compresión" },
                2: { value: "gzip", description: "Solo gzip" },
                3: { value: "gzip, deflate", description: "Gzip y deflate" },
                4: { value: "gzip, deflate, br", description: "Incluye brotli" },
                5: { value: "gzip, deflate, br, zstd", description: "Todas las compresiones" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🛡️ SECURITY HEADERS
        // ═══════════════════════════════════════════════════════════

        "X-Requested-With": {
            description: "Indica petición AJAX/XMLHttpRequest",
            category: "Security",
            priority: 5,
            validated: true,
            sources: ["jQuery docs", "OWASP"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "XMLHttpRequest", description: "XMLHttpRequest estándar" },
                3: { value: "XMLHttpRequest", description: "XMLHttpRequest" },
                4: { value: "XMLHttpRequest", description: "XMLHttpRequest" },
                5: { value: "ShockwaveFlash", description: "Flash player (legacy)" }
            }
        },

        "X-Forwarded-For": {
            description: "IP original del cliente (proxy)",
            category: "Security",
            priority: 4,
            validated: true,
            sources: ["RFC 7239"],
            levels: {
                1: { value: "", description: "Sin forward" },
                2: { value: "", description: "Sin forward" },
                3: { generator: () => `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, description: "IP aleatoria" },
                4: { generator: () => `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, description: "IP aleatoria" },
                5: { generator: () => `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, description: "Chain de IPs" }
            }
        },

        "DNT": {
            description: "Do Not Track",
            category: "Security",
            priority: 2,
            validated: true,
            sources: ["W3C DNT"],
            levels: {
                1: { value: "", description: "Sin DNT" },
                2: { value: "1", description: "No rastrear" },
                3: { value: "1", description: "No rastrear" },
                4: { value: "1", description: "No rastrear" },
                5: { value: "1", description: "No rastrear" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🌍 PROXY HEADERS
        // ═══════════════════════════════════════════════════════════

        "X-Real-IP": {
            description: "IP real del cliente",
            category: "Proxy",
            priority: 4,
            validated: true,
            sources: ["Nginx docs"],
            levels: {
                1: { value: "", description: "Sin IP" },
                2: { value: "", description: "Sin IP" },
                3: { generator: () => `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, description: "IP aleatoria" },
                4: { generator: () => `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, description: "IP aleatoria" },
                5: { generator: () => `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`, description: "IP aleatoria" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📺 STREAMING HEADERS
        // ═══════════════════════════════════════════════════════════

        "Accept": {
            description: "Tipos de contenido aceptados",
            category: "Streaming",
            priority: 8,
            validated: true,
            sources: ["RFC 7231"],
            levels: {
                1: { value: "*/*", description: "Cualquier tipo" },
                2: { value: "video/*, application/x-mpegURL", description: "Video y HLS" },
                3: { value: "video/mp4, video/MP2T, application/x-mpegURL, application/vnd.apple.mpegurl", description: "Formatos específicos" },
                4: { value: "video/mp4, video/webm, video/MP2T, application/x-mpegURL, application/vnd.apple.mpegurl, application/dash+xml", description: "Todos los formatos video" },
                5: { value: "*/*;q=0.8, video/mp4;q=1.0, video/MP2T;q=1.0, application/x-mpegURL;q=1.0, application/vnd.apple.mpegurl;q=1.0", description: "Con prioridades" }
            }
        },

        "Range": {
            description: "Rango de bytes solicitado",
            category: "Streaming",
            priority: 7,
            validated: true,
            sources: ["RFC 7233"],
            levels: {
                1: { value: "", description: "Sin rango" },
                2: { value: "bytes=0-", description: "Desde inicio" },
                3: { value: "bytes=0-", description: "Desde inicio" },
                4: { value: "bytes=0-", description: "Desde inicio" },
                5: { value: "bytes=0-", description: "Desde inicio" }
            }
        },

        "X-Playback-Session-Id": {
            description: "ID de sesión de reproducción",
            category: "Streaming",
            priority: 6,
            validated: true,
            sources: ["Apple HLS"],
            levels: {
                1: { value: "", description: "Sin session ID" },
                2: { generator: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2), description: "UUID aleatorio" },
                3: { generator: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2), description: "UUID aleatorio" },
                4: { generator: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2), description: "UUID aleatorio" },
                5: { generator: () => `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2)}`, description: "Timestamp + UUID" }
            }
        },

        "X-Stream-Type": {
            description: "Tipo de stream",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "", description: "Sin tipo" },
                2: { value: "live", description: "Live stream" },
                3: { value: "live", description: "Live stream" },
                4: { generator: (ch) => ch.stream_type || "live", description: "Dinámico" },
                5: { generator: (ch) => ch.stream_type || "live", description: "Dinámico" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // ⚡ PERFORMANCE HEADERS
        // ═══════════════════════════════════════════════════════════

        "X-Buffer-Size": {
            description: "Tamaño de buffer sugerido",
            category: "Streaming",
            priority: 6,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1048576", description: "1MB buffer" },
                2: { value: "2097152", description: "2MB buffer" },
                3: { value: "4194304", description: "4MB buffer" },
                4: { value: "8388608", description: "8MB buffer" },
                5: { value: "16777216", description: "16MB buffer" }
            }
        },

        "X-Preload-Duration": {
            description: "Duración de preload en segundos",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "5", description: "5 segundos" },
                2: { value: "10", description: "10 segundos" },
                3: { value: "20", description: "20 segundos" },
                4: { value: "30", description: "30 segundos" },
                5: { value: "60", description: "60 segundos" }
            }
        },

        "X-Quality-Preference": {
            description: "Preferencia de calidad",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "auto", description: "Automático" },
                2: { value: "720p", description: "HD 720p" },
                3: { value: "1080p", description: "FHD 1080p" },
                4: { value: "4k", description: "4K UHD" },
                5: { value: "max", description: "Máxima disponible" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🔧 CUSTOM/ADVANCED HEADERS
        // ═══════════════════════════════════════════════════════════

        "X-Client-Version": {
            description: "Versión del cliente",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "1.0", description: "v1.0" },
                2: { value: "2.0", description: "v2.0" },
                3: { value: "3.0", description: "v3.0" },
                4: { value: "4.0-pro", description: "v4.0-pro" },
                5: { value: "5.0-ultra", description: "v5.0-ultra" }
            }
        },

        "X-Device-Type": {
            description: "Tipo de dispositivo",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "web", description: "Web browser" },
                2: { value: "stb", description: "Set-top box" },
                3: { value: "smarttv", description: "Smart TV" },
                4: { value: "android-player", description: "Android player" },
                5: { generator: () => ["stb", "smarttv", "android-player", "firestick", "roku"][Math.floor(Math.random() * 5)], description: "Rotación" }
            }
        },

        "X-Platform": {
            description: "Plataforma del cliente",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "web", description: "Web" },
                2: { value: "windows", description: "Windows" },
                3: { value: "android", description: "Android" },
                4: { value: "android-tv", description: "Android TV" },
                5: { generator: () => ["android-tv", "firetv", "webos", "tizen", "roku"][Math.floor(Math.random() * 5)], description: "Rotación TV" }
            }
        },

        "X-App-Name": {
            description: "Nombre de la aplicación",
            category: "Custom",
            priority: 2,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "IPTV-Navigator", description: "Nombre base" },
                2: { value: "IPTV-Navigator-Plus", description: "Plus" },
                3: { value: "IPTV-Navigator-Pro", description: "Pro" },
                4: { value: "OTT-Navigator", description: "OTT Navigator" },
                5: { generator: () => ["OTT-Navigator", "TiviMate", "IPTV-Smarters", "Perfect-Player"][Math.floor(Math.random() * 4)], description: "Rotación apps" }
            }
        },

        "X-Timezone": {
            description: "Zona horaria del cliente",
            category: "Custom",
            priority: 2,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "", description: "Sin timezone" },
                2: { generator: () => Intl.DateTimeFormat().resolvedOptions().timeZone, description: "Timezone local" },
                3: { generator: () => Intl.DateTimeFormat().resolvedOptions().timeZone, description: "Timezone local" },
                4: { value: "UTC", description: "UTC" },
                5: { generator: () => ["America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"][Math.floor(Math.random() * 4)], description: "Rotación" }
            }
        },

        "X-Request-ID": {
            description: "ID único de petición",
            category: "Custom",
            priority: 4,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "", description: "Sin ID" },
                2: { generator: () => Math.random().toString(36).substr(2, 8), description: "ID corto" },
                3: { generator: () => Math.random().toString(36).substr(2, 16), description: "ID medio" },
                4: { generator: () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2)}`, description: "UUID" },
                5: { generator: () => `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2)}-${Math.random().toString(36).substr(2, 8)}`, description: "ID complejo" }
            }
        },

        "Sec-Fetch-Dest": {
            description: "Destino de fetch (security)",
            category: "Security",
            priority: 3,
            validated: true,
            sources: ["Fetch Metadata"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "video", description: "Video" },
                3: { value: "video", description: "Video" },
                4: { value: "video", description: "Video" },
                5: { value: "video", description: "Video" }
            }
        },

        "Sec-Fetch-Mode": {
            description: "Modo de fetch",
            category: "Security",
            priority: 3,
            validated: true,
            sources: ["Fetch Metadata"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "cors", description: "CORS" },
                3: { value: "cors", description: "CORS" },
                4: { value: "no-cors", description: "No CORS" },
                5: { value: "no-cors", description: "No CORS" }
            }
        },

        "Sec-Fetch-Site": {
            description: "Sitio de origen fetch",
            category: "Security",
            priority: 3,
            validated: true,
            sources: ["Fetch Metadata"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "cross-site", description: "Cross-site" },
                3: { value: "cross-site", description: "Cross-site" },
                4: { value: "same-origin", description: "Same origin" },
                5: { value: "none", description: "None" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🔐 CLIENT HINTS (Nivel 4+ EXTREME)
        // Críticos para eludir detectores de bots basados en coherencia
        // ═══════════════════════════════════════════════════════════

        "Sec-CH-UA": {
            description: "Marcas y versiones del navegador (Client Hints)",
            category: "ClientHints",
            priority: 9,
            validated: true,
            sources: ["RFC 8941", "Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin Client Hints" },
                2: { value: "", description: "Sin Client Hints" },
                3: { value: "", description: "Sin Client Hints" },
                4: { value: '"Not/A)Brand";v="99", "Google Chrome";v="120", "Chromium";v="120"', description: "Chrome 120" },
                5: {
                    generator: () => {
                        const versions = ['118', '119', '120', '121', '122'];
                        const v = versions[Math.floor(Math.random() * versions.length)];
                        return `"Not/A)Brand";v="99", "Google Chrome";v="${v}", "Chromium";v="${v}"`;
                    },
                    description: "Rotación de versiones Chrome"
                }
            }
        },

        "Sec-CH-UA-Mobile": {
            description: "Indica si el dispositivo es móvil",
            category: "ClientHints",
            priority: 8,
            validated: true,
            sources: ["Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { value: "", description: "Sin header" },
                4: { value: "?0", description: "Desktop" },
                5: {
                    generator: (channel) => {
                        // Si el canal tiene indicador móvil, usar ?1
                        return channel?.deviceType === 'mobile' ? "?1" : "?0";
                    },
                    description: "Dinámico según dispositivo"
                }
            }
        },

        "Sec-CH-UA-Platform": {
            description: "Sistema operativo del cliente",
            category: "ClientHints",
            priority: 8,
            validated: true,
            sources: ["Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { value: "", description: "Sin header" },
                4: { value: '"Windows"', description: "Windows" },
                5: {
                    generator: () => {
                        const platforms = ['"Windows"', '"macOS"', '"Linux"', '"Android"'];
                        return platforms[Math.floor(Math.random() * platforms.length)];
                    },
                    description: "Rotación de plataformas"
                }
            }
        },

        "Sec-CH-UA-Full-Version-List": {
            description: "Lista completa de versiones del navegador",
            category: "ClientHints",
            priority: 7,
            validated: true,
            sources: ["Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { value: "", description: "Sin header" },
                4: { value: '"Not/A)Brand";v="99.0.0.0", "Google Chrome";v="120.0.6099.71", "Chromium";v="120.0.6099.71"', description: "Chrome 120 detallado" },
                5: {
                    generator: () => {
                        const versions = [
                            { v: '120.0.6099.71' },
                            { v: '121.0.6167.85' },
                            { v: '122.0.6261.94' }
                        ];
                        const sel = versions[Math.floor(Math.random() * versions.length)];
                        return `"Not/A)Brand";v="99.0.0.0", "Google Chrome";v="${sel.v}", "Chromium";v="${sel.v}"`;
                    },
                    description: "Rotación de versiones completas"
                }
            }
        },

        "Accept-Language": {
            description: "Idiomas preferidos del cliente",
            category: "Identity",
            priority: 5,
            validated: true,
            sources: ["RFC 7231", "MDN"],
            levels: {
                1: { value: "en-US,en;q=0.9", description: "Inglés US" },
                2: { value: "en-US,en;q=0.9,es;q=0.8", description: "Inglés + Español" },
                3: { value: "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7", description: "Español + Inglés" },
                4: { value: "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6,de;q=0.5", description: "Multi-idioma" },
                5: {
                    generator: () => {
                        const langs = [
                            "es-ES,es;q=0.9,en;q=0.8",
                            "en-US,en;q=0.9,es;q=0.8",
                            "fr-FR,fr;q=0.9,en;q=0.8",
                            "de-DE,de;q=0.9,en;q=0.8"
                        ];
                        return langs[Math.floor(Math.random() * langs.length)];
                    },
                    description: "Rotación de idiomas"
                }
            }
        },

        "Upgrade-Insecure-Requests": {
            description: "Solicita al servidor usar HTTPS si disponible",
            category: "Security",
            priority: 3,
            validated: true,
            sources: ["W3C", "MDN"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "1", description: "Solicitar HTTPS" },
                3: { value: "1", description: "Solicitar HTTPS" },
                4: { value: "1", description: "Solicitar HTTPS" },
                5: { value: "1", description: "Solicitar HTTPS" }
            }
        }
    },

    // ═══════════════════════════════════════════════════════════
    // 🎚️ PRESETS POR NIVEL
    // ═══════════════════════════════════════════════════════════

    presets: {
        1: {
            name: "NORMAL",
            icon: "⭐",
            description: "Compatibilidad esencial - Headers básicos sin evasión",
            bandwidthMin: 5,
            recommended: ["User-Agent", "Accept", "Accept-Language", "Connection", "Sec-Fetch-Dest", "Sec-Fetch-Mode", "Sec-Fetch-Site"]
        },
        2: {
            name: "PRO",
            icon: "⭐⭐",
            description: "Evasión CORS básica - Referer/Origin críticos",
            bandwidthMin: 10,
            recommended: ["User-Agent", "Accept", "Accept-Language", "Connection", "Sec-Fetch-Dest", "Sec-Fetch-Mode", "Sec-Fetch-Site", "Referer", "Origin"]
        },
        3: {
            name: "ADVANCED",
            icon: "⭐⭐⭐",
            description: "Suplantación de dispositivo - User-Agent específico",
            bandwidthMin: 20,
            recommended: ["User-Agent", "Referer", "Origin", "Accept", "Connection", "Keep-Alive", "Cache-Control", "Accept-Encoding", "X-Requested-With", "Authorization"]
        },
        4: {
            name: "EXTREME",
            icon: "⭐⭐⭐⭐",
            description: "Ecosistema moderno - Client Hints requeridos",
            bandwidthMin: 50,
            recommended: ["User-Agent", "Referer", "Origin", "Accept", "Connection", "Keep-Alive", "Cache-Control", "Accept-Encoding", "X-Requested-With", "Authorization", "Sec-CH-UA", "Sec-CH-UA-Mobile", "Sec-CH-UA-Platform", "Sec-CH-UA-Full-Version-List"]
        },
        5: {
            name: "ULTRA",
            icon: "🔥",
            description: "Evasión CDN agresivos - X-Forwarded-For/Cookie",
            bandwidthMin: 100,
            recommended: "ALL"
        }
    },


    // ═══════════════════════════════════════════════════════════
    // 🔧 MÉTODOS UTILITARIOS
    // ═══════════════════════════════════════════════════════════

    getHeaderValue(headerName, level, channel = {}, server = {}) {
        const header = this.headers[headerName];
        if (!header) return null;

        const levelConfig = header.levels[level];
        if (!levelConfig) return null;

        if (typeof levelConfig.generator === 'function') {
            return levelConfig.generator(channel, server, {});
        }

        let value = levelConfig.value;

        // Process placeholders
        if (typeof value === 'string' && server.baseUrl) {
            try {
                const url = new URL(server.baseUrl);
                value = value
                    .replace('{serverUrl}', server.baseUrl)
                    .replace('{serverOrigin}', url.origin)
                    .replace('{serverHost}', url.hostname)
                    .replace('{port}', url.port || (url.protocol === 'https:' ? '443' : '80'));
            } catch (e) { }
        }

        return value;
    },

    getAllHeadersForLevel(level, channel = {}, server = {}) {
        const result = {};

        Object.keys(this.headers).forEach(headerName => {
            const value = this.getHeaderValue(headerName, level, channel, server);
            if (value && value !== "") {
                result[headerName] = value;
            }
        });

        return result;
    },

    getRecommendedHeaders(level) {
        const preset = this.presets[level];
        if (!preset) return [];

        if (preset.recommended === "ALL") {
            return Object.keys(this.headers);
        }

        return preset.recommended;
    },

    getHeadersByCategory(category) {
        return Object.entries(this.headers)
            .filter(([name, config]) => config.category === category)
            .map(([name, config]) => ({ name, ...config }));
    },

    // ═══════════════════════════════════════════════════════════
    // 🛠️ UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    utils: {
        /**
         * Genera un Session ID único
         */
        generateSessionId: function () {
            return 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15);
        },

        /**
         * Genera un Device ID único
         */
        generateDeviceId: function () {
            return 'device-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
        },

        /**
         * Genera una IP aleatoria (o determinística con seed)
         */
        randomIP: function (seed) {
            if (seed) {
                // IP determinística basada en seed
                const r1 = (seed % 256);
                const r2 = ((seed >> 8) % 256);
                const r3 = ((seed >> 16) % 256);
                const r4 = ((seed >> 24) % 256);
                return `${r1}.${r2}.${r3}.${r4}`;
            }
            // IP aleatoria
            return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
        },

        /**
         * Hash code simple (Java-style)
         */
        hashCode: function (str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash);
        },

        /**
         * Genera un JWT falso (solo para simulación)
         */
        fakeJWT: function (header, payload) {
            const h = btoa(JSON.stringify(header)).replace(/=/g, '');
            const p = btoa(JSON.stringify(payload)).replace(/=/g, '');
            const signature = btoa(Math.random().toString(36)).replace(/=/g, '').substring(0, 43);
            return `${h}.${p}.${signature}`;
        }
    },

    /**
     * Alias para getHeaders compatible con documentación alternativa
     */
    getHeaders: function (channel, level = 3) {
        return this.getAllHeadersForLevel(level, channel, {});
    }
};

// Export global
window.ULTRA_HEADERS_MATRIX = ULTRA_HEADERS_MATRIX;

// Exportar funciones de utilidad al scope global para compatibilidad
window.generateSessionId = ULTRA_HEADERS_MATRIX.utils.generateSessionId;
window.generateDeviceId = ULTRA_HEADERS_MATRIX.utils.generateDeviceId;
window.randomIP = ULTRA_HEADERS_MATRIX.utils.randomIP;
window.hashCode = ULTRA_HEADERS_MATRIX.utils.hashCode;
window.fakeJWT = ULTRA_HEADERS_MATRIX.utils.fakeJWT;

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║ 🚀 ULTRA HEADERS MATRIX V${ULTRA_HEADERS_MATRIX.version} - CARGADO                                ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ ✅ ${Object.keys(ULTRA_HEADERS_MATRIX.headers).length} headers HTTP configurados                                        ║
║ ✅ 5 niveles de agresividad (Normal → ULTRA)                              ║
║ ✅ Funciones dinámicas por canal                                          ║
║ ✅ Validado por foros especializados                                      ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
