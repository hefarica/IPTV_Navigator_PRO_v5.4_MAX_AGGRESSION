/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 👑 APE ENGINE v9.0 ULTIMATE - FUSION CORE
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * ARQUITECTURA HÍBRIDA v5.0 + v8.7.1:
 * 
 * DE v5.0:
 * - Headers Matrix (154 headers, 5 niveles)
 * - APE Heuristics Engine (8 factores ponderados)
 * - Coherence Validator (TLS/HTTP/2 consistency)
 * 
 * DE v8.7.1:
 * - Protocol-Enforcer (Hard-Fail protection)
 * - Fibonacci Entropy (URL uniqueness)
 * - HUD Overlay (visualización tiempo real)
 * - Drip-Feed vs Live-Edge 2.0 (buffers dinámicos)
 * 
 * NUEVO EN v9.0:
 * - Session Warmup Engine (CDN pre-calentamiento)
 * - Buffer Optimizer (Zero-Freeze estrategia)
 * - Profile Coherence (JA3/JA4 consistency)
 * - Advanced Telemetry (métricas granulares)
 * 
 * AUTOR: APE Engine Team - IPTV Navigator PRO
 * VERSIÓN: 9.0.0-ULTIMATE
 * FECHA: 2024-12-29
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURACIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const CONFIG = {
        // Buffer Strategy (ms)
        BUFFER: {
            VOD_CACHE: 20000,        // Drip-Feed: 20s para estabilidad
            LIVE_CACHE: 1000,        // Live-Edge 2.0: 1s para baja latencia
            SPORTS_CACHE: 500,       // Ultra-Live: 0.5s para deportes críticos
            MIN_DURATION: 6,         // Segmento HLS mínimo
            PREBUFFER_SEGMENTS: 3    // Segmentos a pre-cargar
        },

        // APE Heuristics Weights (v5.0)
        HEURISTICS: {
            CDN_WEIGHT: 0.35,        // Akamai/Cloudflare/Fastly detection
            FORMAT_WEIGHT: 0.25,     // .m3u8 vs .ts detection
            QUALITY_WEIGHT: 0.20,    // 4K/FHD/HD detection
            COMPAT_WEIGHT: 0.15,     // Player compatibility
            LIVE_WEIGHT: 0.25        // Live/VOD detection
        },

        // Profile Selection
        PROFILES: {
            DESKTOP: 'chrome_desktop_125',
            SMART_TV: 'smart_tv_tizen_6',
            ANDROID: 'android_exoplayer',
            PLAYER: 'vlc_player'
        },

        // Rendering
        CHUNK_SIZE: 200,             // Canales por lote (no bloquear UI)
        PROGRESS_UPDATE_INTERVAL: 100, // ms entre actualizaciones UI

        // Session
        SESSION_ID: crypto.randomUUID()
    };

    // ═══════════════════════════════════════════════════════════════════════
    // HUD OVERLAY SYSTEM (v8.7.1)
    // ═══════════════════════════════════════════════════════════════════════
    const HUD = {
        overlay: null,
        elements: {},

        init(totalChannels) {
            // Remover HUD anterior si existe
            const existing = document.getElementById('ape-hud-v9');
            if (existing) existing.remove();

            // Crear HUD
            const hud = document.createElement('div');
            hud.id = 'ape-hud-v9';
            hud.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(5, 10, 20, 0.98);
                z-index: 999999;
                display: flex; flex-direction: column;
                padding: 40px;
                font-family: 'Courier New', monospace;
                color: #00ff41;
                box-sizing: border-box;
                border: 2px solid #00ff41;
                animation: hudFadeIn 0.3s ease-in;
            `;

            hud.innerHTML = `
                <style>
                    @keyframes hudFadeIn {
                        from { opacity: 0; transform: scale(0.95); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                </style>
                
                <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px;">
                    <div>
                        <h1 style="margin: 0; font-size: 28px; text-shadow: 0 0 10px #00ff41;">
                            ⚡ APE ENGINE v9.0 ULTIMATE
                        </h1>
                        <div style="color: #03a9f4; font-size: 14px; margin-top: 5px;">
                            FUSION CORE ACTIVO | SESSION: ${CONFIG.SESSION_ID.slice(0, 8)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 32px; font-weight: bold;" id="ape-counter">0 / ${totalChannels}</div>
                        <div style="color: #888; font-size: 12px;">CANALES PROCESADOS</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 15px;">
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">NIVEL 1 (SAFE)</div>
                        <div style="font-size: 20px; font-weight: bold;" id="stat-l1">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">NIVEL 2 (STABLE)</div>
                        <div style="font-size: 20px; font-weight: bold; color: #4caf50;" id="stat-l2">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">NIVEL 3 (ADVANCED)</div>
                        <div style="font-size: 20px; font-weight: bold; color: #ffeb3b;" id="stat-l3">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">NIVEL 4 (EXTREME)</div>
                        <div style="font-size: 20px; font-weight: bold; color: #ff9800;" id="stat-l4">0</div>
                    </div>
                    <div style="background: #111; padding: 10px; border: 1px solid #333; border-radius: 5px;">
                        <div style="color: #888; font-size: 10px;">NIVEL 5 (ULTRA)</div>
                        <div style="font-size: 20px; font-weight: bold; color: #f44336;" id="stat-l5">0</div>
                    </div>
                </div>

                <div id="ape-log" style="
                    flex: 1;
                    background: #000;
                    border: 1px solid #1a1a1a;
                    padding: 15px;
                    overflow-y: auto;
                    font-size: 11px;
                    line-height: 1.6;
                    margin-bottom: 15px;
                    color: #ccc;
                "></div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 1; background: #111; padding: 8px; border-radius: 5px; text-align: center;">
                        <div style="color: #888; font-size: 10px;">WARMUP</div>
                        <div style="font-size: 16px; color: #ff9800;" id="stat-warmup">0</div>
                    </div>
                    <div style="flex: 1; background: #111; padding: 8px; border-radius: 5px; text-align: center;">
                        <div style="color: #888; font-size: 10px;">FIBONACCI</div>
                        <div style="font-size: 16px; color: #03a9f4;" id="stat-fib">0</div>
                    </div>
                    <div style="flex: 1; background: #111; padding: 8px; border-radius: 5px; text-align: center;">
                        <div style="color: #888; font-size: 10px;">VELOCIDAD</div>
                        <div style="font-size: 16px; color: #00ff41;" id="stat-speed">0 ch/s</div>
                    </div>
                </div>

                <div style="height: 20px; background: #111; border-radius: 10px; overflow: hidden; border: 1px solid #333;">
                    <div id="ape-progress" style="
                        width: 0%;
                        height: 100%;
                        background: linear-gradient(90deg, #03a9f4, #00ff41);
                        transition: width 0.2s ease-out;
                    "></div>
                </div>

                <button id="ape-cancel" style="
                    margin-top: 20px;
                    background: transparent;
                    border: 2px solid #ff1744;
                    color: #ff1744;
                    padding: 12px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 14px;
                    border-radius: 5px;
                    font-weight: bold;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#ff1744'; this.style.color='#000';"
                   onmouseout="this.style.background='transparent'; this.style.color='#ff1744';">
                    ⛔ CANCELAR OPERACIÓN
                </button>
            `;

            document.body.appendChild(hud);

            this.overlay = hud;
            this.elements = {
                log: document.getElementById('ape-log'),
                bar: document.getElementById('ape-progress'),
                counter: document.getElementById('ape-counter'),
                statL1: document.getElementById('stat-l1'),
                statL2: document.getElementById('stat-l2'),
                statL3: document.getElementById('stat-l3'),
                statL4: document.getElementById('stat-l4'),
                statL5: document.getElementById('stat-l5'),
                statWarmup: document.getElementById('stat-warmup'),
                statFib: document.getElementById('stat-fib'),
                statSpeed: document.getElementById('stat-speed')
            };

            document.getElementById('ape-cancel').onclick = () => {
                window.APE_ABORT = true;
                this.log('⚠️ ABORTANDO PROCESO...', '#ff1744');
                setTimeout(() => this.close(), 1500);
            };
        },

        log(message, color = '#ccc') {
            if (!this.elements.log) return;
            const time = new Date().toLocaleTimeString('es-ES');
            const entry = document.createElement('div');
            entry.style.cssText = `color: ${color}; border-bottom: 1px dashed #111; padding: 3px 0;`;
            entry.innerHTML = `[${time}] ${message}`;
            this.elements.log.appendChild(entry);
            this.elements.log.scrollTop = this.elements.log.scrollHeight;
        },

        update(current, total, stats = {}) {
            if (this.elements.bar) {
                this.elements.bar.style.width = `${(current / total * 100).toFixed(2)}%`;
            }
            if (this.elements.counter) {
                this.elements.counter.textContent = `${current} / ${total}`;
            }
            if (stats.l1 !== undefined) this.elements.statL1.textContent = stats.l1;
            if (stats.l2 !== undefined) this.elements.statL2.textContent = stats.l2;
            if (stats.l3 !== undefined) this.elements.statL3.textContent = stats.l3;
            if (stats.l4 !== undefined) this.elements.statL4.textContent = stats.l4;
            if (stats.l5 !== undefined) this.elements.statL5.textContent = stats.l5;
            if (stats.warmup !== undefined) this.elements.statWarmup.textContent = stats.warmup;
            if (stats.fibonacci !== undefined) this.elements.statFib.textContent = stats.fibonacci;
            if (stats.speed !== undefined) this.elements.statSpeed.textContent = stats.speed;
        },

        close() {
            if (this.overlay) {
                setTimeout(() => this.overlay.remove(), 3000);
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // FIBONACCI ENTROPY (v8.7.1)
    // ═══════════════════════════════════════════════════════════════════════
    const Fibonacci = {
        cache: new Map(),

        getSequence(index) {
            if (this.cache.has(index)) return this.cache.get(index);

            const seed = (new Date().getDate()) + index;
            const phi = 1.6180339887;
            const result = Math.floor((Math.pow(phi, seed) - Math.pow(1 - phi, seed)) / Math.sqrt(5));

            this.cache.set(index, result);
            return result;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // APE ENGINE CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════
    class APE_Ultimate_Engine {
        constructor() {
            this.version = '9.0.0-ULTIMATE';
            this.stats = {
                l1: 0, l2: 0, l3: 0, l4: 0, l5: 0,
                warmup: 0,
                fibonacci: 0,
                processed: 0,
                startTime: null
            };
        }

        /**
         * Ejecuta la generación M3U completa
         */
        async execute(channels) {
            window.APE_ABORT = false;
            this.stats.startTime = performance.now();

            HUD.init(channels.length);
            HUD.log('🚀 INICIANDO MOTOR DE FUSIÓN v9.0 ULTIMATE...', '#03a9f4');

            // Verificar dependencias
            if (!this._checkDependencies()) {
                return;
            }

            // ═══════════════════════════════════════════════════════════
            // V9.0.1: BATCH WARMUP (TOP 100 canales de nivel alto)
            // Per documentación: Warmup debe hacerse al inicio en batch,
            // NO individualmente durante el procesamiento
            // ═══════════════════════════════════════════════════════════
            const warmup = window.SESSION_WARMUP_V9 || window.APE_Warmup;
            const TOP_WARMUP_COUNT = 100; // Per documentation

            // Filtrar canales L4+ para warmup batch
            const l4PlusChannels = channels.filter(ch => {
                const analysis = this._analyzeChannel(ch);
                return analysis.level >= 4;
            }).slice(0, TOP_WARMUP_COUNT);

            if (l4PlusChannels.length > 0 && warmup) {
                HUD.log(`🔥 Session Warmup: TOP ${l4PlusChannels.length} canales L4+...`, '#ff9800');

                // Ejecutar warmup en batch (usa MAX_CONCURRENT=10 internamente)
                const warmupBatch = l4PlusChannels.map(ch => ({
                    url: ch.url,
                    level: 4
                }));

                try {
                    await warmup.executeBatch(warmupBatch);
                    this.stats.warmup = l4PlusChannels.length;
                    HUD.log(`✅ Warmup completado: ${l4PlusChannels.length} canales`, '#4ade80');
                } catch (e) {
                    HUD.log(`⚠️ Warmup parcial: ${e.message}`, '#ff9800');
                }
            }

            // Marcar warmup como ya ejecutado (no hacer individual)
            this._warmupCompleted = true;

            // Construir M3U
            let m3uContent = this._generateHeader();

            // Procesar canales en lotes
            for (let i = 0; i < channels.length; i += CONFIG.CHUNK_SIZE) {
                if (window.APE_ABORT) {
                    HUD.log('❌ Proceso cancelado por el usuario', '#ff1744');
                    break;
                }

                const chunk = channels.slice(i, i + CONFIG.CHUNK_SIZE);
                const chunkContent = await this._processChunk(chunk, i);
                m3uContent += chunkContent;

                // Actualizar UI
                this.stats.processed = Math.min(i + CONFIG.CHUNK_SIZE, channels.length);
                const speed = (this.stats.processed / ((performance.now() - this.stats.startTime) / 1000)).toFixed(1);
                HUD.update(this.stats.processed, channels.length, {
                    ...this.stats,
                    speed: `${speed} ch/s`
                });

                if (i % 1000 === 0 && i > 0) {
                    HUD.log(`📊 Lote ${i}-${i + chunk.length} procesado | L5: ${this.stats.l5}`, '#ccc');
                }

                // Yield al navegador
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (!window.APE_ABORT) {
                this._download(m3uContent);
                const elapsed = ((performance.now() - this.stats.startTime) / 1000).toFixed(2);
                HUD.log(`✅ GENERACIÓN COMPLETADA EN ${elapsed}s`, '#00ff41');
                HUD.log(`📈 Total: ${channels.length} | L5: ${this.stats.l5} | Warmup: ${this.stats.warmup}`, '#03a9f4');
                HUD.close();
            }
        }

        /**
         * Verifica dependencias requeridas
         */
        _checkDependencies() {
            const deps = {
                'Headers Matrix': window.HEADERS_MATRIX_V9 || window.APE_Headers_Matrix,
                'Session Warmup': window.SESSION_WARMUP_V9 || window.APE_Warmup,
                'Manifest Generator': window.MANIFEST_GENERATOR_V9 || window.APE_Manifest
            };

            for (const [name, dep] of Object.entries(deps)) {
                if (!dep) {
                    HUD.log(`❌ ERROR CRÍTICO: ${name} no encontrado`, '#ff1744');
                    alert(`Error Crítico: El módulo '${name}' no está cargado. Verifica que todos los scripts estén incluidos en el HTML.`);
                    return false;
                }
            }

            HUD.log('✓ Todas las dependencias cargadas correctamente', '#4caf50');
            return true;
        }

        /**
         * Genera cabecera M3U
         */
        _generateHeader() {
            return `#EXTM3U
#APE_ENGINE: v${this.version}
#SESSION_ID: ${CONFIG.SESSION_ID}
#GENERATED: ${new Date().toISOString()}
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:${CONFIG.BUFFER.MIN_DURATION}
#EXT-X-INDEPENDENT-SEGMENTS
`;
        }

        /**
         * Procesa un lote de canales
         */
        async _processChunk(chunk, baseIndex) {
            const matrix = window.HEADERS_MATRIX_V9 || window.APE_Headers_Matrix;
            const warmup = window.SESSION_WARMUP_V9 || window.APE_Warmup;

            let content = '';

            for (let i = 0; i < chunk.length; i++) {
                const ch = chunk[i];
                const absIndex = baseIndex + i;

                // 1. Análisis heurístico (APE v5.0)
                const profile = this._analyzeChannel(ch);
                this.stats[`l${profile.level}`]++;

                // 2. Seleccionar perfil de coherencia
                const profileName = this._selectProfile(profile);

                // 3. Generar headers (Matrix v9.0)
                const headers = matrix.getHeaders(profile.level, profileName, {
                    url: ch.url,
                    streamType: profile.streamType
                });

                // 4. Session Warmup (v9.0.1 - Ya ejecutado en batch al inicio)
                // NOTA: No hacemos warmup individual - se hace batch al inicio
                // Ver execute() para implementación correcta per documentación

                // 5. Entropía Fibonacci (v8.7.1)
                const entropy = Fibonacci.getSequence(absIndex) % 9999;
                this.stats.fibonacci++;

                // 6. Construir URL final (v9.0.2: incluye canal para JWT)
                const finalUrl = this._buildFinalUrl(ch.url, entropy, headers, ch);

                // 7. Construir entrada M3U
                content += this._buildM3UEntry(ch, profile, headers, finalUrl);
            }

            return content;
        }

        /**
         * Análisis heurístico del canal (APE v5.0 mejorado)
         */
        _analyzeChannel(ch) {
            let score = 0.1;
            const url = (ch.url || '').toLowerCase();
            const name = (ch.name || '').toUpperCase();

            // Factor 1: CDN Detection (35%)
            if (/cloudflare|akamai|fastly|limelight|level3|cloudfront/.test(url)) {
                score += CONFIG.HEURISTICS.CDN_WEIGHT;
            }

            // Factor 2: Format Detection (25%)
            if (url.includes('.m3u8')) score += CONFIG.HEURISTICS.FORMAT_WEIGHT;
            else if (url.includes('.ts')) score += CONFIG.HEURISTICS.FORMAT_WEIGHT * 0.5;
            else if (url.includes('.mpd')) score += CONFIG.HEURISTICS.FORMAT_WEIGHT * 0.7;

            // Factor 3: Quality Detection (20%) - Enhanced for 9 tiers
            if (/IMAX|CINEMA\s*GRADE|DCI/i.test(name)) score += CONFIG.HEURISTICS.QUALITY_WEIGHT * 1.5;
            else if (/8K.*HDR|UHD.*HDR.*8K/i.test(name)) score += CONFIG.HEURISTICS.QUALITY_WEIGHT * 1.4;
            else if (/8K|4320P|ULTRA.*PREMIUM/i.test(name)) score += CONFIG.HEURISTICS.QUALITY_WEIGHT * 1.3;
            else if (/4K.*HDR|UHD.*HDR|HDR10\+|DOLBY\s*VISION/i.test(name)) score += CONFIG.HEURISTICS.QUALITY_WEIGHT * 1.2;
            else if (/4K|UHD|2160P/.test(name)) score += CONFIG.HEURISTICS.QUALITY_WEIGHT;
            else if (/FHD|1080P/.test(name)) score += CONFIG.HEURISTICS.QUALITY_WEIGHT * 0.8;
            else if (/HD|720P/.test(name)) score += CONFIG.HEURISTICS.QUALITY_WEIGHT * 0.6;

            // Factor 4: Live Detection (25%)
            const isLive = /DEPORTES|FUTBOL|SOCCER|LIVE|NOTICIAS|NEWS|EVENTO|DIRECTO|DAZN|ESPN|PPV/i.test(name);
            if (isLive) score += CONFIG.HEURISTICS.LIVE_WEIGHT;

            // Factor 5: Compatibility (15%)
            if (/VLC|TIVIMATE|KODI|OTT/.test(navigator.userAgent.toUpperCase())) {
                score += CONFIG.HEURISTICS.COMPAT_WEIGHT;
            }

            // Mapeo de score a nivel
            let level = 2;
            if (score > 0.85) level = 5;
            else if (score > 0.65) level = 4;
            else if (score > 0.45) level = 3;
            else if (score > 0.25) level = 2;

            // Determinar modo de buffer
            let mode, cache;
            if (isLive) {
                if (/DEPORTES|FUTBOL|SOCCER|PPV/i.test(name)) {
                    mode = 'ULTRA_LIVE';
                    cache = CONFIG.BUFFER.SPORTS_CACHE;
                } else {
                    mode = 'LIVE_EDGE';
                    cache = CONFIG.BUFFER.LIVE_CACHE;
                }
            } else {
                mode = 'DRIP_FEED';
                cache = CONFIG.BUFFER.VOD_CACHE;
            }

            // Determine quality tier (1-9)
            let qualityTier = 'sd';
            if (/IMAX|CINEMA\s*GRADE/i.test(name)) qualityTier = 'imax';
            else if (/8K.*HDR/i.test(name)) qualityTier = '8k_hdr';
            else if (/8K|4320P/i.test(name)) qualityTier = '8k';
            else if (/4K.*HDR|HDR10\+|DOLBY\s*VISION/i.test(name)) qualityTier = '4k_hdr';
            else if (/4K|UHD|2160P/i.test(name)) qualityTier = '4k';
            else if (/FHD|1080P/i.test(name)) qualityTier = 'fhd';
            else if (/HD|720P/i.test(name)) qualityTier = 'hd';

            return {
                level,
                mode,
                cache,
                streamType: isLive ? 'live' : 'vod',
                quality: qualityTier
            };
        }

        /**
         * Selecciona perfil de coherencia según nivel
         */
        _selectProfile(profile) {
            if (profile.level >= 4) return CONFIG.PROFILES.DESKTOP; // Chrome Desktop para máxima sofisticación
            if (profile.streamType === 'live') return CONFIG.PROFILES.SMART_TV; // Tizen para live
            return CONFIG.PROFILES.DESKTOP; // Default
        }

        /**
         * Construye URL final con Fibonacci
         * v9.0.2: Usa JWT tokens criptográficos si disponibles
         */
        _buildFinalUrl(url, entropy, headers, channel = null) {
            const separator = url.includes('?') ? '&' : '?';

            // v9.0.2: Usar JWT Token Generator si disponible
            const jwtGen = window.JWT_TOKEN_V9 || window.APE_JWT;
            let tokenParam;

            if (jwtGen && channel) {
                try {
                    const jwtToken = jwtGen.generateChannelToken(channel);
                    tokenParam = `ape_jwt=${encodeURIComponent(jwtToken)}`;
                    this.stats.jwt = (this.stats.jwt || 0) + 1;
                } catch (e) {
                    // Fallback a token simple
                    tokenParam = `ape_token=${entropy}&sid=${CONFIG.SESSION_ID.slice(0, 8)}`;
                }
            } else {
                tokenParam = `ape_token=${entropy}&sid=${CONFIG.SESSION_ID.slice(0, 8)}`;
            }

            const baseUrl = `${url}${separator}${tokenParam}`;

            // Convertir headers a formato pipe
            const matrix = window.HEADERS_MATRIX_V9 || window.APE_Headers_Matrix;
            const headerString = matrix.toHttpPipeFormat(headers);

            return `${baseUrl}|${headerString}`;
        }

        /**
         * Construye entrada M3U individual
         * v9.0.2: Usa Dynamic QoS Buffer para buffer inteligente
         */
        _buildM3UEntry(ch, profile, headers, finalUrl) {
            let entry = '';

            // ═══════════════════════════════════════════════════════════
            // v9.0.10: FIX CRÍTICO - Nombres de canales Xtream API
            // Xtream usa: name, stream_display_name, epg_channel_id
            // Fallback: extraer de URL o usar stream_id
            // ═══════════════════════════════════════════════════════════

            // Obtener nombre con fallback robusto
            let channelName = ch.name ||
                ch.stream_display_name ||
                ch.title ||
                ch.epg_channel_id ||
                '';

            // Si el nombre está vacío, intentar extraer del logo
            if (!channelName && ch.stream_icon) {
                const logoMatch = ch.stream_icon.match(/\/([^\/]+)\.(png|jpg|jpeg|gif)$/i);
                if (logoMatch) {
                    channelName = logoMatch[1].replace(/_/g, ' ').replace(/-/g, ' ').toUpperCase();
                }
            }

            // Último fallback: usar stream_id o num con prefijo descriptivo
            if (!channelName) {
                if (ch.stream_id) {
                    channelName = `Channel ${ch.stream_id}`;
                } else if (ch.num) {
                    channelName = `Channel ${ch.num}`;
                } else {
                    channelName = `Channel ${Date.now() % 10000}`;
                }
            }

            // Limpiar nombre
            channelName = channelName.toString().trim();

            // Obtener otros campos con fallbacks
            const tvgId = ch.stream_id || ch.id || ch.epg_channel_id || '';
            const tvgLogo = ch.stream_icon || ch.logo || '';
            const groupTitle = ch.category_name || ch.group_title || ch.group || 'GENERAL';

            // EXTINF con todos los campos
            entry += `#EXTINF:-1`;
            if (tvgId) entry += ` tvg-id="${tvgId}"`;
            entry += ` tvg-name="${channelName}"`;  // SIEMPRE incluir tvg-name
            if (tvgLogo) entry += ` tvg-logo="${tvgLogo}"`;
            entry += ` group-title="[L${profile.level}] ${groupTitle}"`;
            entry += `,${channelName}\n`;  // NOMBRE VISIBLE después de la coma

            // v9.0.2: Dynamic QoS Buffer (2s-15s inteligente)
            const qosEngine = window.DYNAMIC_QOS_V9 || window.APE_QoS;
            let bufferMs = profile.cache;
            let bufferStrategy = profile.mode;

            if (qosEngine) {
                try {
                    const qosConfig = qosEngine.calculateBuffer(ch);
                    bufferMs = qosConfig.bufferMs;
                    bufferStrategy = qosConfig.strategy;
                    this.stats.qos = (this.stats.qos || 0) + 1;
                } catch (e) {
                    // Fallback a buffer estático
                }
            }

            // EXTVLCOPT (Dynamic Buffer strategy)
            entry += `#EXTVLCOPT:network-caching=${bufferMs}\n`;
            if (bufferStrategy === 'ultra-low-latency' || profile.mode === 'ULTRA_LIVE') {
                entry += `#EXTVLCOPT:clock-jitter=0\n`;
                entry += `#EXTVLCOPT:clock-synchro=0\n`;
                entry += `#EXTVLCOPT:live-caching=${Math.min(bufferMs, 2000)}\n`;
            } else if (bufferStrategy === 'low-latency') {
                entry += `#EXTVLCOPT:live-caching=${Math.min(bufferMs, 3000)}\n`;
            }
            entry += `#EXTVLCOPT:http-user-agent=${headers['User-Agent']}\n`;

            // APE Buffer Metadata
            entry += `#EXT-X-APE-BUFFER:strategy=${bufferStrategy},buffer=${bufferMs}\n`;

            // KODIPROP (si nivel alto)
            if (profile.level >= 3) {
                entry += `#KODIPROP:inputstream.adaptive.manifest_type=hls\n`;
                entry += `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=${encodeURIComponent(headers['User-Agent'])}\n`;
            }

            // URL final
            entry += `${finalUrl}\n`;

            return entry;
        }

        /**
         * Descarga el archivo M3U
         */
        _download(content) {
            const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            link.download = `APE_ULTIMATE_v9.0_${date}.m3u8`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const instance = new APE_Ultimate_Engine();
    window.APE_ENGINE_V9 = instance;
    window.APE_Engine = instance; // Alias para compatibilidad

    console.log('%c👑 APE Engine v9.0 ULTIMATE Cargado', 'color: #00ff41; font-weight: bold; font-size: 16px; text-shadow: 0 0 10px #00ff41;');
    console.log('%cFUSION CORE: v5.0 + v8.7.1 + v9.0', 'color: #03a9f4; font-size: 12px;');

})();
