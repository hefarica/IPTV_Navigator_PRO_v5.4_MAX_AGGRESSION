/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎛️ ULTRA HEADERS MATRIX EXTENDED v1.0 — 70+ HEADERS ADICIONALES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Extiende ULTRA_HEADERS_MATRIX con ~70 headers adicionales.
 * Se carga DESPUÉS de ultra-headers-matrix.js.
 * Valores dinámicos usan generator() — los motores de rotación los resuelven.
 * Valores estáticos se cablean desde el UI.
 *
 * FECHA: 2026-02-07
 *
 * ⚠️ C8 (2026-05-11) — HEADERS DEPRECATED:
 *   - "TE"                (línea ~118)  ← okhttp legacy no soporta RFC 7230 trailers
 *   - "If-Modified-Since" (línea ~137)  ← 304+0B → okhttp EOF (igual que If-None-Match)
 *   - "Priority"          (línea ~220)  ← RFC 9218 HTTP/3 sobre HTTP/1.1
 *
 * Filtrado downstream por _ca7BannedAbsolute (m3u8-typed-arrays-ultimate.js:7537)
 * y UPSERT_EXTHTTP_BANNED_OUTBOUND (línea 6889). Ver feedback_exthttp_traps.md #9.
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const matrix = window.ULTRA_HEADERS_MATRIX;
    if (!matrix || !matrix.headers) {
        console.error('[HeadersExtended] ULTRA_HEADERS_MATRIX no disponible. Carga ultra-headers-matrix.js primero.');
        return;
    }

    // Helper: generate UUID
    const _uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 12)}`;

    // ═══════════════════════════════════════════════════════════════════════
    // NUEVOS HEADERS — Se mergen en matrix.headers
    // ═══════════════════════════════════════════════════════════════════════

    const EXTENDED_HEADERS = {

        // ═══════════════════════════════════════════════════════════
        // 🆔 CLIENT HINTS EXTENDIDOS
        // ═══════════════════════════════════════════════════════════

        "Sec-CH-UA-Arch": {
            description: "Arquitectura del procesador del cliente",
            category: "ClientHints",
            priority: 6,
            validated: true,
            sources: ["Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { value: "x86", description: "x86" },
                4: { value: "x86", description: "x86" },
                5: { generator: () => ["x86", "arm", "arm64"][Math.floor(Math.random() * 3)], description: "Rotación arch" }
            }
        },

        "Sec-CH-UA-Bitness": {
            description: "Bits del procesador del cliente",
            category: "ClientHints",
            priority: 5,
            validated: true,
            sources: ["Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { value: "64", description: "64-bit" },
                4: { value: "64", description: "64-bit" },
                5: { generator: () => ["32", "64"][Math.floor(Math.random() * 2)], description: "Rotación bitness" }
            }
        },

        "Sec-CH-UA-Model": {
            description: "Modelo del dispositivo",
            category: "ClientHints",
            priority: 4,
            validated: true,
            sources: ["Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { value: "", description: "Vacío (desktop)" },
                4: { value: "", description: "Vacío (desktop)" },
                5: { generator: () => ["", "Pixel 7", "SM-S908B", "MI BOX S"][Math.floor(Math.random() * 4)], description: "Rotación modelo" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🛡️ SECURITY EXTENDIDOS
        // ═══════════════════════════════════════════════════════════

        "Sec-Fetch-User": {
            description: "Indica si la navegación fue iniciada por el usuario",
            category: "Security",
            priority: 3,
            validated: true,
            sources: ["Fetch Metadata"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "?1", description: "User initiated" },
                3: { value: "?1", description: "User initiated" },
                4: { value: "?1", description: "User initiated" },
                5: { value: "?1", description: "User initiated" }
            }
        },

        "Sec-GPC": {
            description: "Global Privacy Control",
            category: "Security",
            priority: 2,
            validated: true,
            sources: ["GPC Spec"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "1", description: "Privacy ON" },
                3: { value: "1", description: "Privacy ON" },
                4: { value: "1", description: "Privacy ON" },
                5: { value: "1", description: "Privacy ON" }
            }
        },

        "TE": {
            description: "Transfer encodings aceptados",
            category: "Connection",
            priority: 3,
            validated: true,
            sources: ["RFC 7230"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "trailers", description: "Trailers" },
                3: { value: "trailers", description: "Trailers" },
                4: { value: "trailers", description: "Trailers" },
                5: { value: "trailers", description: "Trailers" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 💾 CACHE EXTENDIDOS
        // ═══════════════════════════════════════════════════════════

        "If-Modified-Since": {
            description: "Fecha de última modificación conocida",
            category: "Caching",
            priority: 3,
            validated: true,
            sources: ["RFC 7232"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { generator: () => new Date(Date.now() - 86400000).toUTCString(), description: "Ayer" },
                4: { generator: () => new Date(Date.now() - 3600000).toUTCString(), description: "Hace 1h" },
                5: { generator: () => new Date(Date.now() - 60000).toUTCString(), description: "Hace 1min" }
            }
        },

        "Accept-Charset": {
            description: "Juegos de caracteres aceptados",
            category: "Compression",
            priority: 2,
            validated: true,
            sources: ["RFC 7231"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "utf-8", description: "UTF-8" },
                3: { value: "utf-8, iso-8859-1;q=0.5", description: "UTF-8 + ISO fallback" },
                4: { value: "utf-8, iso-8859-1;q=0.5", description: "UTF-8 + ISO fallback" },
                5: { value: "utf-8, iso-8859-1;q=0.5, *;q=0.1", description: "Todo charset" }
            }
        },

        "Accept-CH": {
            description: "Client Hints aceptados por el server",
            category: "ClientHints",
            priority: 4,
            validated: true,
            sources: ["Client Hints Draft"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "", description: "Sin header" },
                3: { value: "DPR, Viewport-Width, Width", description: "Básicos" },
                4: { value: "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT", description: "Completos" },
                5: { value: "DPR, Viewport-Width, Width, Device-Memory, RTT, Downlink, ECT", description: "Completos" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // ⚡ APE ENGINE CORE
        // ═══════════════════════════════════════════════════════════

        "X-App-Version": {
            description: "Versión del motor APE",
            category: "Custom",
            priority: 5,
            validated: false,
            sources: ["APE Engine"],
            levels: {
                1: { value: "APE_1.0", description: "v1.0" },
                2: { value: "APE_4.0_PRO", description: "v4.0 Pro" },
                3: { value: "APE_9.0_ULTIMATE", description: "v9.0 ULTIMATE" },
                4: { value: "APE_9.0_ULTIMATE", description: "v9.0 ULTIMATE" },
                5: { value: "APE_9.0_ULTIMATE", description: "v9.0 ULTIMATE" }
            }
        },

        "X-Device-Id": {
            description: "ID único del dispositivo",
            category: "Custom",
            priority: 5,
            validated: false,
            sources: ["APE Engine"],
            levels: {
                1: { value: "", description: "Sin ID" },
                2: { generator: () => _uuid(), description: "UUID" },
                3: { generator: () => _uuid(), description: "UUID" },
                4: { generator: () => _uuid(), description: "UUID" },
                5: { generator: () => `DEV-${_uuid()}-${Date.now().toString(36)}`, description: "UUID complejo" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📊 PRIORITY, BUFFERS, PREFETCH
        // ═══════════════════════════════════════════════════════════

        "Priority": {
            description: "Prioridad HTTP de la petición",
            category: "Streaming",
            priority: 5,
            validated: true,
            sources: ["RFC 9218"],
            levels: {
                1: { value: "", description: "Sin priority" },
                2: { value: "u=3", description: "Normal" },
                3: { value: "u=1, i", description: "Alta, incremental" },
                4: { value: "u=0, i", description: "Máxima, incremental" },
                5: { value: "u=0, i", description: "Máxima, incremental" }
            }
        },

        "X-Playback-Rate": {
            description: "Velocidad de reproducción",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1.0", description: "Normal" },
                2: { value: "1.0", description: "Normal" },
                3: { value: "1.0", description: "Normal" },
                4: { value: "1.0", description: "Normal" },
                5: { value: "1.0", description: "Normal" }
            }
        },

        "X-Segment-Duration": {
            description: "Duración esperada de cada segmento HLS (sec)",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["HLS Spec"],
            levels: {
                1: { value: "10", description: "10s" },
                2: { value: "6", description: "6s" },
                3: { value: "6", description: "6s" },
                4: { value: "4", description: "4s" },
                5: { value: "2", description: "2s (low latency)" }
            }
        },

        "X-Min-Buffer-Time": {
            description: "Buffer mínimo en segundos",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "5", description: "5s" },
                2: { value: "10", description: "10s" },
                3: { value: "20", description: "20s" },
                4: { value: "30", description: "30s" },
                5: { value: "60", description: "60s" }
            }
        },

        "X-Max-Buffer-Time": {
            description: "Buffer máximo en segundos",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "30", description: "30s" },
                2: { value: "30", description: "30s" },
                3: { value: "60", description: "60s" },
                4: { value: "120", description: "120s" },
                5: { value: "300", description: "300s" }
            }
        },

        "X-Request-Priority": {
            description: "Prioridad de la petición",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "low", description: "Baja" },
                2: { value: "normal", description: "Normal" },
                3: { value: "high", description: "Alta" },
                4: { value: "high", description: "Alta" },
                5: { value: "high", description: "Alta" }
            }
        },

        "X-Prefetch-Enabled": {
            description: "Habilitar prefetch de segmentos",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "Desactivado" },
                2: { value: "true", description: "Activado" },
                3: { value: "true", description: "Activado" },
                4: { value: "true", description: "Activado" },
                5: { value: "true", description: "Activado" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🎬 VIDEO / AUDIO / DRM
        // ═══════════════════════════════════════════════════════════

        "X-Video-Codecs": {
            description: "Codecs de video soportados",
            category: "Streaming",
            priority: 7,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "h264", description: "Solo H.264" },
                2: { value: "h264,hevc", description: "H.264 + HEVC" },
                3: { value: "hevc,vp9,av1,h264", description: "Multi-codec" },
                4: { value: "hevc,vp9,av1,h264", description: "Multi-codec" },
                5: { value: "hevc,vp9,av1,h264,vvc", description: "Todos + VVC" }
            }
        },

        "X-Audio-Codecs": {
            description: "Codecs de audio soportados",
            category: "Streaming",
            priority: 6,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "aac", description: "Solo AAC" },
                2: { value: "aac,mp3", description: "AAC + MP3" },
                3: { value: "aac,mp3,opus,ac3,eac3", description: "Multi-codec" },
                4: { value: "aac,mp3,opus,ac3,eac3", description: "Multi-codec" },
                5: { value: "aac,mp3,opus,ac3,eac3,dts,flac", description: "Todos" }
            }
        },

        "X-DRM-Support": {
            description: "Sistemas DRM soportados",
            category: "Security",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "", description: "Sin DRM" },
                2: { value: "widevine", description: "Widevine" },
                3: { value: "widevine,playready", description: "Widevine + PlayReady" },
                4: { value: "widevine,playready", description: "Widevine + PlayReady" },
                5: { value: "widevine,playready,fairplay", description: "Todos" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🌐 EDGE / CDN / FAILOVER
        // ═══════════════════════════════════════════════════════════

        "X-CDN-Provider": {
            description: "Proveedor CDN preferido",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "auto", description: "Auto" },
                2: { value: "auto", description: "Auto" },
                3: { value: "auto", description: "Auto" },
                4: { value: "premium", description: "Premium" },
                5: { value: "premium", description: "Premium" }
            }
        },

        "X-Failover-Enabled": {
            description: "Habilitar failover automático",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "Desactivado" },
                2: { value: "true", description: "Activado" },
                3: { value: "true", description: "Activado" },
                4: { value: "true", description: "Activado" },
                5: { value: "true", description: "Activado" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📱 DEVICE / TELEMETRY (dinámicos)
        // ═══════════════════════════════════════════════════════════

        "X-Client-Timestamp": {
            description: "Timestamp del cliente",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "", description: "Sin timestamp" },
                2: { generator: () => String(Date.now()), description: "Epoch ms" },
                3: { generator: () => String(Date.now()), description: "Epoch ms" },
                4: { generator: () => new Date().toISOString(), description: "ISO 8601" },
                5: { generator: () => new Date().toISOString(), description: "ISO 8601" }
            }
        },

        "X-Screen-Resolution": {
            description: "Resolución de pantalla del dispositivo",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "1280x720", description: "720p" },
                2: { value: "1920x1080", description: "1080p" },
                3: { value: "854x480", description: "SD (reference)" },
                4: { value: "3840x2160", description: "4K" },
                5: { generator: () => `${screen.width || 1920}x${screen.height || 1080}`, description: "Real del device" }
            }
        },

        "X-Network-Type": {
            description: "Tipo de conexión de red",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom"],
            levels: {
                1: { value: "unknown", description: "Desconocido" },
                2: { value: "wifi", description: "WiFi" },
                3: { value: "wifi", description: "WiFi" },
                4: { value: "ethernet", description: "Ethernet" },
                5: { generator: () => (navigator.connection && navigator.connection.type) || "wifi", description: "Real del device" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📺 OTT NAVIGATOR / REPRODUCTORES ANDROID
        // ═══════════════════════════════════════════════════════════

        "X-OTT-Navigator-Version": {
            description: "Versión de OTT Navigator",
            category: "Custom",
            priority: 4,
            validated: false,
            sources: ["OTT Navigator"],
            levels: {
                1: { value: "1.6.0.0", description: "v1.6" },
                2: { value: "1.6.9.5", description: "v1.6.9.5" },
                3: { value: "1.7.0.0", description: "v1.7.0.0" },
                4: { value: "1.7.0.0", description: "v1.7.0.0" },
                5: { generator: () => ["1.6.9.5", "1.7.0.0", "1.7.1.0"][Math.floor(Math.random() * 3)], description: "Rotación versiones" }
            }
        },

        "X-Player-Type": {
            description: "Tipo de reproductor",
            category: "Custom",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "native", description: "Nativo" },
                2: { value: "exoplayer", description: "ExoPlayer" },
                3: { value: "exoplayer", description: "ExoPlayer" },
                4: { value: "exoplayer", description: "ExoPlayer" },
                5: { generator: () => ["exoplayer", "vlc", "ffmpeg", "native"][Math.floor(Math.random() * 4)], description: "Rotación player" }
            }
        },

        "X-Hardware-Decode": {
            description: "Decodificación por hardware",
            category: "Custom",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "Software" },
                2: { value: "true", description: "Hardware" },
                3: { value: "true", description: "Hardware" },
                4: { value: "true", description: "Hardware" },
                5: { value: "true", description: "Hardware" }
            }
        },

        "X-Tunneling-Enabled": {
            description: "Tunneling de video habilitado",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["ExoPlayer docs"],
            levels: {
                1: { value: "false", description: "Desactivado" },
                2: { value: "auto", description: "Auto" },
                3: { value: "auto", description: "Auto" },
                4: { value: "true", description: "Activado" },
                5: { value: "true", description: "Activado" }
            }
        },

        "X-Audio-Track-Selection": {
            description: "Selección de pista de audio",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "default", description: "Default" },
                2: { value: "default", description: "Default" },
                3: { value: "default", description: "Default" },
                4: { value: "best", description: "Mejor calidad" },
                5: { value: "best", description: "Mejor calidad" }
            }
        },

        "X-Subtitle-Track-Selection": {
            description: "Selección de subtítulos",
            category: "Custom",
            priority: 2,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "off", description: "Desactivados" },
                2: { value: "off", description: "Desactivados" },
                3: { value: "off", description: "Desactivados" },
                4: { value: "auto", description: "Auto" },
                5: { value: "auto", description: "Auto" }
            }
        },

        "X-EPG-Sync": {
            description: "Sincronización de guía EPG",
            category: "Custom",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "disabled", description: "Desactivado" },
                2: { value: "enabled", description: "Activado" },
                3: { value: "enabled", description: "Activado" },
                4: { value: "enabled", description: "Activado" },
                5: { value: "enabled", description: "Activado" }
            }
        },

        "X-Catchup-Support": {
            description: "Soporte de catchup/timeshift",
            category: "Custom",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "", description: "Sin catchup" },
                2: { value: "default", description: "Default" },
                3: { value: "flussonic", description: "Flussonic" },
                4: { value: "flussonic", description: "Flussonic" },
                5: { generator: () => ["flussonic", "xc", "shift", "append"][Math.floor(Math.random() * 4)], description: "Rotación tipo" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // ⏱️ TIMEOUTS / REINTENTOS
        // ═══════════════════════════════════════════════════════════

        "X-Bandwidth-Estimation": {
            description: "Método de estimación de ancho de banda",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "auto", description: "Auto" },
                2: { value: "auto", description: "Auto" },
                3: { value: "auto", description: "Auto" },
                4: { value: "aggressive", description: "Agresivo" },
                5: { value: "aggressive", description: "Agresivo" }
            }
        },

        "X-Initial-Bitrate": {
            description: "Bitrate inicial preferido",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "auto", description: "Auto" },
                2: { value: "medium", description: "Medio" },
                3: { value: "highest", description: "Máximo" },
                4: { value: "highest", description: "Máximo" },
                5: { value: "highest", description: "Máximo" }
            }
        },

        "X-Retry-Count": {
            description: "Número de reintentos por error",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1", description: "1 reintento" },
                2: { value: "2", description: "2 reintentos" },
                3: { value: "3", description: "3 reintentos" },
                4: { value: "5", description: "5 reintentos" },
                5: { value: "10", description: "10 reintentos" }
            }
        },

        "X-Retry-Delay-Ms": {
            description: "Delay entre reintentos (ms)",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "3000", description: "3s" },
                2: { value: "2000", description: "2s" },
                3: { value: "1000", description: "1s" },
                4: { value: "500", description: "500ms" },
                5: { value: "200", description: "200ms" }
            }
        },

        "X-Connection-Timeout-Ms": {
            description: "Timeout de conexión (ms)",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "30000", description: "30s" },
                2: { value: "20000", description: "20s" },
                3: { value: "15000", description: "15s" },
                4: { value: "10000", description: "10s" },
                5: { value: "5000", description: "5s" }
            }
        },

        "X-Read-Timeout-Ms": {
            description: "Timeout de lectura (ms)",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "60000", description: "60s" },
                2: { value: "45000", description: "45s" },
                3: { value: "30000", description: "30s" },
                4: { value: "20000", description: "20s" },
                5: { value: "15000", description: "15s" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🌍 SEGURIDAD / EVASION
        // ═══════════════════════════════════════════════════════════

        "X-Country-Code": {
            description: "Código de país para geo-targeting",
            category: "Security",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "", description: "Sin country" },
                2: { value: "US", description: "USA" },
                3: { value: "US", description: "USA" },
                4: { generator: () => ["US", "DE", "FR", "GB", "NL"][Math.floor(Math.random() * 5)], description: "Rotación país" },
                5: { generator: () => ["US", "DE", "FR", "GB", "NL", "CA", "AU"][Math.floor(Math.random() * 7)], description: "Rotación amplia" }
            }
        },

        "X-Buffer-Strategy": {
            description: "Estrategia de buffering",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "conservative", description: "Conservadora" },
                2: { value: "balanced", description: "Balanceada" },
                3: { value: "aggressive", description: "Agresiva" },
                4: { value: "ultra-aggressive", description: "Ultra-agresiva" },
                5: { value: "ultra-aggressive", description: "Ultra-agresiva" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🌈 HDR / COLOR
        // ═══════════════════════════════════════════════════════════

        "X-HDR-Support": {
            description: "Formatos HDR soportados",
            category: "Streaming",
            priority: 6,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "", description: "Sin HDR" },
                2: { value: "hdr10", description: "HDR10" },
                3: { value: "hdr10,hdr10+,dolby-vision,hlg", description: "Multi-HDR" },
                4: { value: "hdr10,hdr10+,dolby-vision,hlg", description: "Multi-HDR" },
                5: { value: "hdr10,hdr10+,dolby-vision,hlg", description: "Multi-HDR" }
            }
        },

        "X-Color-Depth": {
            description: "Profundidad de color soportada",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "8bit", description: "8-bit" },
                2: { value: "10bit", description: "10-bit" },
                3: { value: "12bit,10bit", description: "12/10-bit" },
                4: { value: "12bit,10bit", description: "12/10-bit" },
                5: { value: "12bit,10bit", description: "12/10-bit" }
            }
        },

        "X-Color-Space": {
            description: "Espacios de color soportados",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "rec709", description: "Rec.709" },
                2: { value: "rec709,p3", description: "709 + P3" },
                3: { value: "bt2020,p3,rec709", description: "BT.2020 + P3 + 709" },
                4: { value: "bt2020,p3,rec709", description: "BT.2020 + P3 + 709" },
                5: { value: "bt2020,p3,rec709", description: "BT.2020 + P3 + 709" }
            }
        },

        "X-Dynamic-Range": {
            description: "Rango dinámico preferido",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "sdr", description: "SDR" },
                2: { value: "sdr", description: "SDR" },
                3: { value: "hdr", description: "HDR" },
                4: { value: "hdr", description: "HDR" },
                5: { value: "hdr", description: "HDR" }
            }
        },

        "X-HDR-Transfer-Function": {
            description: "Función de transferencia HDR",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "pq", description: "PQ" },
                3: { value: "pq,hlg", description: "PQ + HLG" },
                4: { value: "pq,hlg", description: "PQ + HLG" },
                5: { value: "pq,hlg", description: "PQ + HLG" }
            }
        },

        "X-Color-Primaries": {
            description: "Primarios de color",
            category: "Streaming",
            priority: 2,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "bt709", description: "BT.709" },
                3: { value: "bt2020", description: "BT.2020" },
                4: { value: "bt2020", description: "BT.2020" },
                5: { value: "bt2020", description: "BT.2020" }
            }
        },

        "X-Matrix-Coefficients": {
            description: "Coeficientes de matriz de color",
            category: "Streaming",
            priority: 2,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "", description: "Sin header" },
                2: { value: "bt709", description: "BT.709" },
                3: { value: "bt2020nc", description: "BT.2020 non-constant" },
                4: { value: "bt2020nc", description: "BT.2020 non-constant" },
                5: { value: "bt2020nc", description: "BT.2020 non-constant" }
            }
        },

        "X-Chroma-Subsampling": {
            description: "Submuestreo de croma soportado",
            category: "Streaming",
            priority: 2,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "4:2:0", description: "4:2:0" },
                2: { value: "4:2:0", description: "4:2:0" },
                3: { value: "4:2:0,4:2:2,4:4:4", description: "Multi" },
                4: { value: "4:2:0,4:2:2,4:4:4", description: "Multi" },
                5: { value: "4:2:0,4:2:2,4:4:4", description: "Multi" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📐 RESOLUCIÓN / BITRATE / FPS
        // ═══════════════════════════════════════════════════════════

        "X-Max-Resolution": {
            description: "Resolución máxima soportada",
            category: "Streaming",
            priority: 7,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1280x720", description: "720p" },
                2: { value: "1920x1080", description: "1080p" },
                3: { value: "3840x2160", description: "4K" },
                4: { value: "3840x2160", description: "4K" },
                5: { value: "7680x4320", description: "8K" }
            }
        },

        "X-Max-Bitrate": {
            description: "Bitrate máximo soportado (bps)",
            category: "Streaming",
            priority: 6,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "5000000", description: "5 Mbps" },
                2: { value: "15000000", description: "15 Mbps" },
                3: { value: "40000000", description: "40 Mbps" },
                4: { value: "80000000", description: "80 Mbps" },
                5: { value: "100000000", description: "100 Mbps" }
            }
        },

        "X-Frame-Rates": {
            description: "Frame rates soportados",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "25,30", description: "25/30 fps" },
                2: { value: "24,25,30", description: "24-30 fps" },
                3: { value: "24,25,30,50,60,120", description: "Todos fps" },
                4: { value: "24,25,30,50,60,120", description: "Todos fps" },
                5: { value: "24,25,30,50,60,120", description: "Todos fps" }
            }
        },

        "X-Aspect-Ratio": {
            description: "Relaciones de aspecto soportadas",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "16:9", description: "16:9" },
                2: { value: "16:9", description: "16:9" },
                3: { value: "16:9,21:9", description: "16:9 + 21:9" },
                4: { value: "16:9,21:9", description: "16:9 + 21:9" },
                5: { value: "16:9,21:9,4:3", description: "Multi-ratio" }
            }
        },

        "X-Pixel-Aspect-Ratio": {
            description: "Relación de aspecto de píxel",
            category: "Streaming",
            priority: 2,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1:1", description: "Cuadrado" },
                2: { value: "1:1", description: "Cuadrado" },
                3: { value: "1:1", description: "Cuadrado" },
                4: { value: "1:1", description: "Cuadrado" },
                5: { value: "1:1", description: "Cuadrado" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🔊 AUDIO AVANZADO / DOLBY / ATMOS
        // ═══════════════════════════════════════════════════════════

        "X-Dolby-Atmos": {
            description: "Soporte Dolby Atmos",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "No" },
                2: { value: "false", description: "No" },
                3: { value: "true", description: "Sí" },
                4: { value: "true", description: "Sí" },
                5: { value: "true", description: "Sí" }
            }
        },

        "X-Audio-Channels": {
            description: "Configuraciones de canales de audio",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "2.0", description: "Stereo" },
                2: { value: "5.1,2.0", description: "5.1 + Stereo" },
                3: { value: "7.1,5.1,2.0", description: "7.1 + 5.1 + Stereo" },
                4: { value: "7.1,5.1,2.0", description: "7.1 + 5.1 + Stereo" },
                5: { value: "7.1,5.1,2.0", description: "7.1 + 5.1 + Stereo" }
            }
        },

        "X-Audio-Sample-Rate": {
            description: "Frecuencias de muestreo de audio (Hz)",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "44100", description: "44.1 kHz" },
                2: { value: "48000", description: "48 kHz" },
                3: { value: "48000,96000", description: "48/96 kHz" },
                4: { value: "48000,96000", description: "48/96 kHz" },
                5: { value: "48000,96000,192000", description: "Hi-Res" }
            }
        },

        "X-Audio-Bit-Depth": {
            description: "Profundidad de bits de audio",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "16bit", description: "16-bit" },
                2: { value: "16bit", description: "16-bit" },
                3: { value: "24bit", description: "24-bit" },
                4: { value: "24bit", description: "24-bit" },
                5: { value: "32bit", description: "32-bit" }
            }
        },

        "X-Spatial-Audio": {
            description: "Soporte audio espacial",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "No" },
                2: { value: "false", description: "No" },
                3: { value: "true", description: "Sí" },
                4: { value: "true", description: "Sí" },
                5: { value: "true", description: "Sí" }
            }
        },

        "X-Audio-Passthrough": {
            description: "Audio passthrough (sin decodificar)",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "No" },
                2: { value: "false", description: "No" },
                3: { value: "true", description: "Sí" },
                4: { value: "true", description: "Sí" },
                5: { value: "true", description: "Sí" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🚀 SEGMENTOS PARALELOS / PREFETCH
        // ═══════════════════════════════════════════════════════════

        "X-Parallel-Segments": {
            description: "Segmentos descargados en paralelo",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1", description: "1 seg" },
                2: { value: "2", description: "2 seg" },
                3: { value: "4", description: "4 seg" },
                4: { value: "6", description: "6 seg" },
                5: { value: "8", description: "8 seg" }
            }
        },

        "X-Prefetch-Segments": {
            description: "Segmentos a prefetch",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1", description: "1 seg" },
                2: { value: "2", description: "2 seg" },
                3: { value: "3", description: "3 seg" },
                4: { value: "5", description: "5 seg" },
                5: { value: "10", description: "10 seg" }
            }
        },

        "X-Segment-Preload": {
            description: "Precargar segmentos",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "No" },
                2: { value: "true", description: "Sí" },
                3: { value: "true", description: "Sí" },
                4: { value: "true", description: "Sí" },
                5: { value: "true", description: "Sí" }
            }
        },

        "X-Concurrent-Downloads": {
            description: "Descargas concurrentes permitidas",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "1", description: "1" },
                2: { value: "2", description: "2" },
                3: { value: "4", description: "4" },
                4: { value: "6", description: "6" },
                5: { value: "8", description: "8" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 🔄 RECONEXIÓN / FAILOVER
        // ═══════════════════════════════════════════════════════════

        "X-Reconnect-On-Error": {
            description: "Reconectar automáticamente ante errores",
            category: "Streaming",
            priority: 6,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "No" },
                2: { value: "true", description: "Sí" },
                3: { value: "true", description: "Sí" },
                4: { value: "true", description: "Sí" },
                5: { value: "true", description: "Sí" }
            }
        },

        "X-Max-Reconnect-Attempts": {
            description: "Máximo de intentos de reconexión",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "3", description: "3 intentos" },
                2: { value: "10", description: "10 intentos" },
                3: { value: "50", description: "50 intentos" },
                4: { value: "100", description: "100 intentos" },
                5: { value: "200", description: "200 intentos" }
            }
        },

        "X-Reconnect-Delay-Ms": {
            description: "Delay entre reconexiones (ms)",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "3000", description: "3s" },
                2: { value: "1000", description: "1s" },
                3: { value: "200", description: "200ms" },
                4: { value: "50", description: "50ms" },
                5: { value: "50", description: "50ms" }
            }
        },

        "X-Buffer-Underrun-Strategy": {
            description: "Estrategia ante buffer underrun",
            category: "Streaming",
            priority: 5,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "pause", description: "Pausar" },
                2: { value: "rebuffer", description: "Re-buffering" },
                3: { value: "adaptive", description: "Adaptativo" },
                4: { value: "adaptive", description: "Adaptativo" },
                5: { value: "adaptive", description: "Adaptativo" }
            }
        },

        "X-Seamless-Failover": {
            description: "Failover sin interrupción",
            category: "Streaming",
            priority: 6,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "false", description: "No" },
                2: { value: "false", description: "No" },
                3: { value: "true", description: "Sí" },
                4: { value: "true", description: "Sí" },
                5: { value: "true", description: "Sí" }
            }
        },

        // ═══════════════════════════════════════════════════════════
        // 📈 BANDWIDTH ESTIMATION / QoS
        // ═══════════════════════════════════════════════════════════

        "X-Bandwidth-Preference": {
            description: "Preferencia de ancho de banda",
            category: "Streaming",
            priority: 4,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "auto", description: "Auto" },
                2: { value: "auto", description: "Auto" },
                3: { value: "unlimited", description: "Sin límite" },
                4: { value: "unlimited", description: "Sin límite" },
                5: { value: "unlimited", description: "Sin límite" }
            }
        },

        "X-BW-Estimation-Window": {
            description: "Ventana de estimación de BW (seg)",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "30", description: "30s" },
                2: { value: "20", description: "20s" },
                3: { value: "10", description: "10s" },
                4: { value: "5", description: "5s" },
                5: { value: "3", description: "3s" }
            }
        },

        "X-BW-Confidence-Threshold": {
            description: "Umbral de confianza de BW (0-1)",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "0.5", description: "50%" },
                2: { value: "0.7", description: "70%" },
                3: { value: "0.85", description: "85%" },
                4: { value: "0.9", description: "90%" },
                5: { value: "0.95", description: "95%" }
            }
        },

        "X-BW-Smooth-Factor": {
            description: "Factor de suavizado EWMA",
            category: "Streaming",
            priority: 2,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "0.5", description: "0.5 (mucho suavizado)" },
                2: { value: "0.3", description: "0.3" },
                3: { value: "0.15", description: "0.15 (referencia)" },
                4: { value: "0.1", description: "0.1 (reactivo)" },
                5: { value: "0.05", description: "0.05 (muy reactivo)" }
            }
        },

        "X-Packet-Loss-Monitor": {
            description: "Monitoreo de pérdida de paquetes",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "disabled", description: "Desactivado" },
                2: { value: "enabled", description: "Activado" },
                3: { value: "enabled", description: "Activado" },
                4: { value: "enabled", description: "Activado" },
                5: { value: "enabled", description: "Activado" }
            }
        },

        "X-RTT-Monitoring": {
            description: "Monitoreo de Round-Trip Time",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "disabled", description: "Desactivado" },
                2: { value: "enabled", description: "Activado" },
                3: { value: "enabled", description: "Activado" },
                4: { value: "enabled", description: "Activado" },
                5: { value: "enabled", description: "Activado" }
            }
        },

        "X-Congestion-Detect": {
            description: "Detección de congestión de red",
            category: "Streaming",
            priority: 3,
            validated: false,
            sources: ["Custom IPTV"],
            levels: {
                1: { value: "disabled", description: "Desactivado" },
                2: { value: "basic", description: "Básico" },
                3: { value: "enabled", description: "Activado" },
                4: { value: "aggressive", description: "Agresivo" },
                5: { value: "aggressive", description: "Agresivo" }
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MERGE INTO MATRIX
    // ═══════════════════════════════════════════════════════════════════════

    const addedCount = Object.keys(EXTENDED_HEADERS).length;
    Object.assign(matrix.headers, EXTENDED_HEADERS);
    matrix.totalHeaders = Object.keys(matrix.headers).length;

    console.log(
        `%c✅ ULTRA HEADERS MATRIX EXTENDED v1.0 — +${addedCount} headers (Total: ${matrix.totalHeaders})`,
        'color: #ff9800; font-weight: bold;'
    );

})();
