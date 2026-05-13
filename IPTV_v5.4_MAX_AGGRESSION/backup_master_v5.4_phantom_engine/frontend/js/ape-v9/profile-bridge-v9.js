/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔗 APE PROFILE BRIDGE v9.1 - COMPLETE WIRING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Bridge que conecta ProfileManagerV9 (Frontend) con TYPED ARRAYS (Generador).
 * Convierte TODOS los campos del UI al formato que espera el generador.
 * 
 * CAMPOS CABLEADOS (40+):
 * - Básicos: resolution, width, height, fps, bitrate
 * - Buffers: buffer_ms, network_cache_ms, live_cache_ms, file_cache_ms, player_buffer_ms
 * - VLC Options: clock_jitter, clock_synchro
 * - Bandwidth: max_bandwidth, min_bandwidth, throughput_t1, throughput_t2
 * - Prefetch: prefetch_segments, prefetch_parallel, prefetch_buffer_target, prefetch_min_bandwidth
 * - Prefetch Flags: adaptive_enabled, ai_prediction_enabled
 * - Codecs: codec_primary, codec_fallback, codec_priority
 * - Quality: hdr_support, color_depth, audio_channels
 * - Manifest: version, jwt_expiration, multilayer_strategy, matrix_type
 * - Metadata: headers_count, enabled_categories, device_class
 * 
 * AUTOR: APE Engine Team - IPTV Navigator PRO
 * VERSIÓN: 1.1.0-COMPLETE
 * FECHA: 2026-01-31
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.1.0-COMPLETE';

    // ═══════════════════════════════════════════════════════════════════════
    // MAPEO DE CODEC FRONTEND → TYPED ARRAYS
    // ═══════════════════════════════════════════════════════════════════════
    const CODEC_MAPPING = {
        'AV1': { primary: 'AV1', fallback: 'HEVC', priority: 'av1,hevc,h265,h264' },
        'H265': { primary: 'HEVC', fallback: 'H264', priority: 'hevc,h265,h.265,vp9,h264' },
        'HEVC': { primary: 'HEVC', fallback: 'H264', priority: 'hevc,h265,h.265,vp9,h264' },
        'VP9': { primary: 'VP9', fallback: 'H264', priority: 'vp9,h264,avc,mpeg2' },
        'H264': { primary: 'H264', fallback: 'MPEG2', priority: 'h264,avc,h.264,mpeg2' },
        'AVC': { primary: 'H264', fallback: 'MPEG2', priority: 'h264,avc,h.264,mpeg2' },
        'MPEG2': { primary: 'MPEG2', fallback: 'H264', priority: 'mpeg2,mpeg-2,h262,h264' }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════
    class APEProfileBridge {
        constructor() {
            this.version = VERSION;
            this._cache = {};
            console.log(`%c🔗 APE Profile Bridge v${VERSION} - COMPLETE WIRING`, 'color: #8b5cf6; font-weight: bold;');
        }

        /**
         * Convierte perfil del Frontend al formato TYPED ARRAYS (COMPLETO)
         * @param {string} profileId - ID del perfil (P0-P5)
         * @returns {Object|null} Configuración en formato TYPED ARRAYS
         */
        convertToTypedArraysFormat(profileId) {
            // Verificar que ProfilesConfig existe
            if (!window.APE_PROFILES_CONFIG) {
                console.warn('⚠️ APE_PROFILES_CONFIG no disponible, usando fallback');
                return null;
            }

            const config = window.APE_PROFILES_CONFIG;
            const profile = config.getProfile(profileId);

            if (!profile) {
                console.warn(`⚠️ Perfil ${profileId} no encontrado`);
                return null;
            }

            // ═══════════════════════════════════════════════════════════════
            // 1. VALORES BÁSICOS DEL PERFIL
            // ═══════════════════════════════════════════════════════════════
            const [width, height] = (profile.settings.resolution || '1920x1080').split('x').map(Number);
            const bitrateKbps = Math.round((profile.settings.bitrate || 8) * 1000);
            const bufferMs = profile.settings.buffer || 3000;
            const playerBufferMs = profile.settings.playerBuffer || Math.round(bufferMs / 4);
            const fps = profile.settings.fps || 60;

            // ═══════════════════════════════════════════════════════════════
            // 2. VLCOPT VALUES (Clock Jitter, Clock Synchro, etc.)
            // ═══════════════════════════════════════════════════════════════
            const vlcopt = profile.vlcopt || {};
            const clockJitter = parseInt(vlcopt['clock-jitter'] || '0', 10);
            const clockSynchro = parseInt(vlcopt['clock-synchro'] || '0', 10);
            // Caching: UI Header (X-*-Caching) → vlcopt → bufferMs fallback
            const headerValues = this._extractHeaderValues(config, profileId);
            const networkCaching = headerValues.network_caching ?? parseInt(vlcopt['network-caching'] || bufferMs, 10);
            const liveCaching = headerValues.live_caching ?? parseInt(vlcopt['live-caching'] || bufferMs, 10);
            const fileCaching = headerValues.file_caching ?? parseInt(vlcopt['file-caching'] || playerBufferMs, 10);

            // ═══════════════════════════════════════════════════════════════
            // 3. PREFETCH CONFIG (desde UI o getPrefetchConfig)
            // ═══════════════════════════════════════════════════════════════
            const prefetchConfig = config.getPrefetchConfig ? config.getPrefetchConfig(profileId) : {};
            const prefetchSegments = prefetchConfig.prefetch_segments || this._getDefaultPrefetchSegments(profile.settings.strategy);
            const prefetchParallel = prefetchConfig.parallel_downloads || this._getDefaultPrefetchParallel(profile.settings.strategy);
            const prefetchBufferTarget = (prefetchConfig.buffer_target_seconds || 90) * 1000; // Convert to ms
            const prefetchMinBandwidth = (prefetchConfig.min_bandwidth_mbps || 40) * 1000000; // Convert to bps
            const adaptiveEnabled = prefetchConfig.adaptive_enabled !== false;
            const aiPredictionEnabled = prefetchConfig.ai_prediction_enabled || false;

            // ═══════════════════════════════════════════════════════════════
            // 4. CODEC MAPPING
            // ═══════════════════════════════════════════════════════════════
            const codecMap = CODEC_MAPPING[profile.settings.codec] || CODEC_MAPPING['H264'];

            // ═══════════════════════════════════════════════════════════════
            // 5. MANIFEST CONFIG
            // ═══════════════════════════════════════════════════════════════
            const manifest = config.getManifestConfig ? config.getManifestConfig() : {};

            // ═══════════════════════════════════════════════════════════════
            // 6. HEADERS VALUES (HDR, Color, Audio, Caching, etc.)
            // Already extracted above (line ~91) for caching priority chain
            // ═══════════════════════════════════════════════════════════════

            // ═══════════════════════════════════════════════════════════════
            // 7. ENABLED CATEGORIES (for headers count)
            // ═══════════════════════════════════════════════════════════════
            const enabledCategories = profile.enabledCategories || [];
            const headersCount = profile.settings.headersCount || config.countActiveHeaders(profileId) || 72;

            // ═══════════════════════════════════════════════════════════════
            // CREAR OBJETO CONVERTIDO (40+ campos)
            // ═══════════════════════════════════════════════════════════════
            const converted = {
                // ───────────────────────────────────────────────────────────
                // BÁSICOS (6 campos)
                // ───────────────────────────────────────────────────────────
                name: profile.name,
                resolution: profile.settings.resolution,
                width: width,
                height: height,
                fps: fps,
                bitrate: bitrateKbps,

                // ───────────────────────────────────────────────────────────
                // BUFFERS (5 campos) - Desde UI Buffer Total, Player Buffer
                // ───────────────────────────────────────────────────────────
                buffer_ms: bufferMs,
                buffer_min: headerValues.buffer_min ?? profile.settings.buffer_min ?? Math.round(bufferMs * 0.1),
                buffer_max: headerValues.buffer_max ?? profile.settings.buffer_max ?? Math.round(bufferMs * 2),
                network_cache_ms: headerValues.network_caching ?? networkCaching,
                live_cache_ms: headerValues.live_caching ?? liveCaching,
                file_cache_ms: headerValues.file_caching ?? fileCaching,
                player_buffer_ms: playerBufferMs,

                // ───────────────────────────────────────────────────────────
                // VLCOPT (2 campos) - Desde UI Clock Jitter, Clock Synchro
                // ───────────────────────────────────────────────────────────
                clock_jitter: clockJitter,
                clock_synchro: clockSynchro,

                // ───────────────────────────────────────────────────────────
                // BANDWIDTH (4 campos) - Derivados de bitrate + T1/T2
                // ───────────────────────────────────────────────────────────
                max_bandwidth: Math.round(bitrateKbps * 1.5 * 1000),
                min_bandwidth: Math.round(bitrateKbps * 0.3 * 1000),
                throughput_t1: profile.settings.t1 || Math.round(bitrateKbps * 1.3 / 1000),
                throughput_t2: profile.settings.t2 || Math.round(bitrateKbps * 1.6 / 1000),

                // ───────────────────────────────────────────────────────────
                // PREFETCH (6 campos) - Desde sección Prefetch Inteligente
                // ───────────────────────────────────────────────────────────
                prefetch_segments: prefetchSegments,
                prefetch_parallel: prefetchParallel,
                prefetch_buffer_target: prefetchBufferTarget,
                prefetch_min_bandwidth: prefetchMinBandwidth,
                prefetch_adaptive_enabled: adaptiveEnabled,
                prefetch_ai_prediction: aiPredictionEnabled,
                prefetch_strategy: prefetchConfig.strategy || profile.settings.strategy || 'adaptive',

                // ───────────────────────────────────────────────────────────
                // CODECS (3 campos) - Desde UI Códec dropdown
                // ───────────────────────────────────────────────────────────
                codec_primary: codecMap.primary,
                codec_fallback: codecMap.fallback,
                codec_priority: codecMap.priority,

                // ───────────────────────────────────────────────────────────
                // CALIDAD VISUAL (3 campos) - Desde Headers HDR/Color/Audio
                // ───────────────────────────────────────────────────────────
                hdr_support: headerValues.hdr_support,
                color_depth: headerValues.color_depth,
                audio_channels: headerValues.audio_channels,

                // ───────────────────────────────────────────────────────────
                // MANIFEST CONFIG (4 campos) - Desde sección Manifiesto
                // ───────────────────────────────────────────────────────────
                manifest_version: manifest.version || '13.1.0-SUPREMO',
                jwt_expiration: this._convertShiftToJwtExpiration(manifest),
                multilayer_strategy: manifest.multilayer || 'EXTVLCOPT,KODIPROP,PIPE_HEADERS',
                matrix_type: manifest.matrixType || '65_HEADERS_BY_PERFIL',

                // ───────────────────────────────────────────────────────────
                // HEADERS & CATEGORÍAS (3 campos)
                // ───────────────────────────────────────────────────────────
                headers_count: headersCount,
                enabled_categories: enabledCategories,
                strategy: profile.settings.strategy || 'adaptive',

                // ───────────────────────────────────────────────────────────
                // DEVICE & RESILIENCIA (4 campos)
                // ───────────────────────────────────────────────────────────
                device_class: profile.name || `${profileId}_CUSTOM`,
                quality_level: profile.quality || this._inferQualityLevel(profileId),
                reconnect_timeout_ms: 30,
                reconnect_max_attempts: 100,

                // ───────────────────────────────────────────────────────────
                // HEVC/H.265 OPTIMIZATION (11 campos) - Desde profile.settings
                // ✅ Cableados directamente desde la fuente P0-P5
                // ───────────────────────────────────────────────────────────
                hevc_tier: profile.settings.hevc_tier || 'HIGH',
                hevc_level: profile.settings.hevc_level || '6.1,5.1,5.0,4.1,4.0,3.1',
                hevc_profile: profile.settings.hevc_profile || 'MAIN-10',
                color_space: profile.settings.color_space || 'BT709',
                chroma_subsampling: profile.settings.chroma_subsampling || '4:2:0',
                transfer_function: profile.settings.transfer_function || 'BT1886',
                matrix_coefficients: profile.settings.matrix_coefficients || 'BT709',
                compression_level: headerValues.compression_level ?? profile.settings.compression_level ?? 1,
                sharpen_sigma: headerValues.sharpen_sigma ?? profile.settings.sharpen_sigma ?? 0.05,
                rate_control: profile.settings.rate_control || 'VBR',
                entropy_coding: profile.settings.entropy_coding || 'CABAC',
                video_profile: profile.settings.video_profile || 'main10',
                pixel_format: profile.settings.pixel_format || 'yuv420p10le',

                // ───────────────────────────────────────────────────────────
                // LCEVC ENHANCEMENT LAYER (6 campos) — APE v1.0.0
                // Activar lcevc_enabled=true para pasar a estado SIGNAL_ONLY.
                // El estado real (PACKAGED / PLAYER_VALIDATED) lo resuelve
                // el backend (lcevc_state_engine.php).
                // ───────────────────────────────────────────────────────────
                lcevc_enabled:         profile.settings.lcevc_enabled         ?? false,
                lcevc_state:           profile.settings.lcevc_state            ?? 'OFF',
                lcevc_mode:            profile.settings.lcevc_mode             ?? 'SEI_METADATA',
                lcevc_base_codec:      profile.settings.lcevc_base_codec       ?? 'h264',
                // ── OTT Visual Quality Fields ─────────────────────────────────
                hdr_profile:           profile.settings.hdr_profile            ?? 'sdr',
                ai_sr_enabled:         profile.settings.ai_sr_enabled          ?? false,
                ai_sr_mode:            profile.settings.ai_sr_mode             ?? 'balanced',
                ai_sr_scale_factor:    profile.settings.ai_sr_scale_factor     ?? 2,
                lcevc_transport:       profile.settings.lcevc_transport        ?? 'embedded',
                lcevc_fallback:        profile.settings.lcevc_fallback         ?? 'base_only',
                lcevc_player_required: profile.settings.lcevc_player_required  ?? false,
                lcevc_profile:         profile.settings.lcevc_profile          ?? 'standard',
                // ───────────────────────────────────────────────────────────
                // CMAF ENGINE FIELDS (4 campos) — APE CMAF v2.0.0
                // ───────────────────────────────────────────────────────────
                cmaf_enabled:          profile.settings.cmaf_enabled           ?? false,
                cmaf_profile:          profile.settings.cmaf_profile           ?? 'live',
                cmaf_delivery_mode:    profile.settings.cmaf_delivery_mode     ?? 'inline',
                streams_base_url:      profile.settings.streams_base_url       ?? 'https://iptv-ape.duckdns.org/streams',

                // ───────────────────────────────────────────────────────────
                // APE v18.2 FIELDS — Telchemy TVQM + VQS + Degradation Chain
                // ───────────────────────────────────────────────────────────
                vqs_score:             profile.settings.vqs_score              ?? 0,
                vqs_tier:              profile.settings.vqs_tier               ?? 'STANDARD',
                quality_profile:       profile.settings.quality_profile        ?? 'P3',
                tvqm_vstq:             profile.settings.tvqm_vstq              ?? 0,
                tvqm_vsmq:             profile.settings.tvqm_vsmq              ?? 0,
                tr101290_status:       profile.settings.tr101290_status        ?? 'PASS',
                ape_version:           profile.settings.ape_version            ?? '18.2.0',
                ape_profile:           profile.settings.ape_profile            ?? 'CMAF-UNIVERSAL',
                ape_dna_hash:          profile.settings.ape_dna_hash           ?? '',
                hydra_stealth_enabled: profile.settings.hydra_stealth_enabled  ?? false,
                // ── Degradation Chain (7 niveles) ────────────────────────────
                degradation_chain:     profile.settings.degradation_chain      ?? [
                    'CMAF+HEVC/AV1','HLS/fMP4+HEVC','HLS/fMP4+H.264',
                    'HLS/TS+H.264','HLS/TS+Baseline','TS Direct','HTTP redirect'
                ],
                degradation_level:     profile.settings.degradation_level      ?? 4,
                // ── HDR Extended ─────────────────────────────────────────────
                hdr10_enabled:         profile.settings.hdr10_enabled          ?? false,
                hdr10_plus_enabled:    profile.settings.hdr10_plus_enabled     ?? false,
                dolby_vision_enabled:  profile.settings.dolby_vision_enabled   ?? false,
                dolby_vision_profile:  profile.settings.dolby_vision_profile   ?? '',
                hlg_enabled:           profile.settings.hlg_enabled            ?? false,
                // ── OTT Skills ───────────────────────────────────────────────
                quantum_pixel_overdrive:   profile.settings.quantum_pixel_overdrive   ?? false,
                content_aware_hevc:        profile.settings.content_aware_hevc        ?? false,
                antigravity_mode:          profile.settings.antigravity_mode          ?? false,
                god_mode_zero_drop:        profile.settings.god_mode_zero_drop        ?? false,
                // ── Network ──────────────────────────────────────────────────
                low_latency_mode:      profile.settings.low_latency_mode        ?? false,
                live_edge_segments:    profile.settings.live_edge_segments      ?? 3,
                // ───────────────────────────────────────────────────────────
                // METADATA BRIDGE (3 campos)
                // ───────────────────────────────────────────────────────────
                _bridged: true,
                _source: 'ProfileManagerV9',
                _profileId: profileId
            };

            // Cachear para evitar recálculos
            this._cache[profileId] = converted;
            return converted;
        }

        /**
         * Obtiene segmentos de prefetch por defecto según estrategia
         */
        _getDefaultPrefetchSegments(strategy) {
            const map = {
                'ultra-aggressive': 90, 'aggressive': 50, 'balanced': 25,
                'adaptive': 25, 'conservative': 15, 'ultra-low-latency': 10
            };
            return map[strategy] || 25;
        }

        /**
         * Obtiene descargas paralelas por defecto según estrategia
         */
        _getDefaultPrefetchParallel(strategy) {
            const map = {
                'ultra-aggressive': 40, 'aggressive': 20, 'balanced': 10,
                'adaptive': 10, 'conservative': 6, 'ultra-low-latency': 4
            };
            return map[strategy] || 10;
        }

        /**
         * Infiere quality level desde profileId
         */
        _inferQualityLevel(profileId) {
            const map = { P0: 'ULTRA', P1: '8K', P2: '4K', P3: 'FHD', P4: 'HD', P5: 'SD' };
            return map[profileId] || 'FHD';
        }

        /**
         * Convierte Shift (horas) a JWT Expiration (días con sufijo _DAYS)
         * Ejemplo: 8760 horas → 365_DAYS
         * @param {Object} manifest - Objeto manifest con shift o jwtExpiration
         * @returns {string} JWT Expiration formateado (ej: "365_DAYS")
         */
        _convertShiftToJwtExpiration(manifest) {
            // Si ya tiene el formato correcto con _DAYS, usar directo
            if (manifest.jwtExpiration && typeof manifest.jwtExpiration === 'string' && manifest.jwtExpiration.includes('_DAYS')) {
                return manifest.jwtExpiration;
            }

            // Si tiene shift en horas, convertir a días
            if (manifest.shift !== undefined && manifest.shift !== null) {
                const hours = parseInt(manifest.shift, 10);
                if (!isNaN(hours) && hours > 0) {
                    const days = Math.round(hours / 24);
                    console.log(`🔄 [BRIDGE] Shift ${hours}h → ${days}_DAYS`);
                    return `${days}_DAYS`;
                }
            }

            // Si jwtExpiration es un número (horas), convertir
            if (manifest.jwtExpiration && typeof manifest.jwtExpiration === 'number') {
                const days = Math.round(manifest.jwtExpiration / 24);
                return `${days}_DAYS`;
            }

            // Si jwtExpiration es string numérico sin sufijo
            if (manifest.jwtExpiration && /^\d+$/.test(manifest.jwtExpiration)) {
                const hours = parseInt(manifest.jwtExpiration, 10);
                const days = Math.round(hours / 24);
                return `${days}_DAYS`;
            }

            // Fallback
            return manifest.jwtExpiration || '365_DAYS';
        }

        /**
         * Extrae valores de calidad desde headers del perfil
         */
        _extractHeaderValues(config, profileId) {
            const defaults = {
                hdr_support: [],
                color_depth: 8,
                audio_channels: 2,
                compression_level: undefined,  // undefined = use profile.settings fallback
                sharpen_sigma: undefined
            };

            try {
                // HDR Support
                const hdrHeader = config.getHeaderValue(profileId, 'X-HDR-Support');
                if (hdrHeader && hdrHeader !== '[GENERATE]' && hdrHeader.length > 0) {
                    defaults.hdr_support = hdrHeader.split(',').map(s => s.trim().toLowerCase());
                }

                // Color Depth
                const colorHeader = config.getHeaderValue(profileId, 'X-Color-Depth');
                if (colorHeader) {
                    const match = colorHeader.match(/(\d+)/);
                    if (match) defaults.color_depth = parseInt(match[1]);
                }

                // Audio Channels
                const audioHeader = config.getHeaderValue(profileId, 'X-Audio-Channels');
                if (audioHeader) {
                    // Parse "7.1" or "5.1" or "2.0" or just numbers
                    const match = audioHeader.match(/(\d+)/);
                    if (match) {
                        const ch = parseInt(match[1]);
                        defaults.audio_channels = ch >= 7 ? 8 : ch >= 5 ? 6 : 2;
                    }
                }

                // Dolby Atmos
                const atmosHeader = config.getHeaderValue(profileId, 'X-Dolby-Atmos');
                if (atmosHeader === 'true') {
                    defaults.audio_channels = 8; // Override to max
                }

                // ✅ Compression Level (desde UI X-Compression-Level)
                const comprHeader = config.getHeaderValue(profileId, 'X-Compression-Level');
                if (comprHeader != null && comprHeader !== '' && comprHeader !== '[GENERATE]') {
                    const parsed = parseInt(comprHeader, 10);
                    if (!isNaN(parsed)) {
                        defaults.compression_level = parsed;
                    }
                }

                // ✅ Sharpen Sigma (desde UI X-Sharpen-Sigma)
                const sharpenHeader = config.getHeaderValue(profileId, 'X-Sharpen-Sigma');
                if (sharpenHeader != null && sharpenHeader !== '' && sharpenHeader !== '[GENERATE]') {
                    const parsed = parseFloat(sharpenHeader);
                    if (!isNaN(parsed)) {
                        defaults.sharpen_sigma = parsed;
                    }
                }

                // ✅ Buffer Target/Min/Max (desde UI X-Buffer-*)
                const bufTargetH = config.getHeaderValue(profileId, 'X-Buffer-Target');
                if (bufTargetH && !isNaN(parseInt(bufTargetH, 10))) {
                    defaults.buffer_target = parseInt(bufTargetH, 10);
                }
                const bufMinH = config.getHeaderValue(profileId, 'X-Buffer-Min');
                if (bufMinH && !isNaN(parseInt(bufMinH, 10))) {
                    defaults.buffer_min = parseInt(bufMinH, 10);
                }
                const bufMaxH = config.getHeaderValue(profileId, 'X-Buffer-Max');
                if (bufMaxH && !isNaN(parseInt(bufMaxH, 10))) {
                    defaults.buffer_max = parseInt(bufMaxH, 10);
                }

                // ✅ Network/Live/File Caching (desde UI X-*-Caching)
                const netCacheH = config.getHeaderValue(profileId, 'X-Network-Caching');
                if (netCacheH && !isNaN(parseInt(netCacheH, 10))) {
                    defaults.network_caching = parseInt(netCacheH, 10);
                }
                const liveCacheH = config.getHeaderValue(profileId, 'X-Live-Caching');
                if (liveCacheH && !isNaN(parseInt(liveCacheH, 10))) {
                    defaults.live_caching = parseInt(liveCacheH, 10);
                }
                const fileCacheH = config.getHeaderValue(profileId, 'X-File-Caching');
                if (fileCacheH && !isNaN(parseInt(fileCacheH, 10))) {
                    defaults.file_caching = parseInt(fileCacheH, 10);
                }

            } catch (e) {
                console.warn('⚠️ Error leyendo headers:', e);
            }

            return defaults;
        }

        /**
         * Obtiene perfil cacheado o lo convierte
         */
        getProfile(profileId) {
            // Usar cache si disponible (se invalida al guardar en UI)
            if (this._cache[profileId]) return this._cache[profileId];
            return this.convertToTypedArraysFormat(profileId);
        }

        /**
         * Invalida cache (llamar cuando el usuario cambia config)
         */
        invalidateCache(profileId = null) {
            if (profileId) {
                delete this._cache[profileId];
            } else {
                this._cache = {};
            }
            console.log('🔄 Cache de Bridge invalidado');
        }

        /**
         * Verifica si el bridge está activo
         */
        isActive() {
            return !!window.APE_PROFILES_CONFIG;
        }

        /**
         * Obtiene resumen de campos cableados para debugging
         */
        getWiringReport(profileId) {
            const converted = this.getProfile(profileId);
            if (!converted) return null;

            return {
                profileId: profileId,
                totalFields: Object.keys(converted).filter(k => !k.startsWith('_')).length,
                fields: {
                    basic: ['name', 'resolution', 'width', 'height', 'fps', 'bitrate'],
                    buffers: ['buffer_ms', 'network_cache_ms', 'live_cache_ms', 'file_cache_ms', 'player_buffer_ms'],
                    vlcopt: ['clock_jitter', 'clock_synchro'],
                    bandwidth: ['max_bandwidth', 'min_bandwidth', 'throughput_t1', 'throughput_t2'],
                    prefetch: ['prefetch_segments', 'prefetch_parallel', 'prefetch_buffer_target', 'prefetch_min_bandwidth', 'prefetch_adaptive_enabled', 'prefetch_ai_prediction'],
                    codecs: ['codec_primary', 'codec_fallback', 'codec_priority'],
                    quality: ['hdr_support', 'color_depth', 'audio_channels'],
                    hevc: ['hevc_tier', 'hevc_level', 'hevc_profile', 'color_space', 'chroma_subsampling',
                        'transfer_function', 'matrix_coefficients', 'compression_level', 'sharpen_sigma', 'rate_control',
                        'entropy_coding', 'video_profile', 'pixel_format'],
                    manifest: ['manifest_version', 'jwt_expiration', 'multilayer_strategy', 'matrix_type'],
                    metadata: ['headers_count', 'enabled_categories', 'strategy', 'device_class', 'quality_level']
                }
            };
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 🌐 HTTP HEADERS BRIDGE (para #EXTHTTP en M3U8)
        // ═══════════════════════════════════════════════════════════════════════

        /**
         * Obtiene HTTP headers JSON para un perfil (para #EXTHTTP)
         * @param {string} profileId - ID del perfil (P0-P5)
         * @param {Object} options - Opciones adicionales (userAgent, fingerprint)
         * @returns {Object} Headers HTTP clave-valor
         */
        getHTTPHeaders(profileId, options = {}) {
            if (!window.APE_PROFILES_CONFIG?.getHTTPHeadersJSON) {
                console.warn('⚠️ APE_PROFILES_CONFIG.getHTTPHeadersJSON not available');
                return {};
            }
            return window.APE_PROFILES_CONFIG.getHTTPHeadersJSON(profileId, options);
        }

        /**
         * Obtiene bloque #EXTHTTP completo para insertar en M3U8
         * @param {string} profileId - ID del perfil
         * @param {Object} options - Opciones adicionales
         * @returns {string} Bloque de texto con comentario y #EXTHTTP
         */
        getEXTHTTPBlock(profileId, options = {}) {
            if (!window.APE_PROFILES_CONFIG?.getEXTHTTPBlock) {
                console.warn('⚠️ APE_PROFILES_CONFIG.getEXTHTTPBlock not available');
                return '';
            }
            return window.APE_PROFILES_CONFIG.getEXTHTTPBlock(profileId, options);
        }

        /**
         * Obtiene línea #EXTHTTP: sola (sin comentarios)
         * @param {string} profileId - ID del perfil
         * @param {Object} options - Opciones adicionales
         * @returns {string} Línea #EXTHTTP:{...}
         */
        getEXTHTTPLine(profileId, options = {}) {
            if (!window.APE_PROFILES_CONFIG?.getEXTHTTPLine) {
                console.warn('⚠️ APE_PROFILES_CONFIG.getEXTHTTPLine not available');
                return '';
            }
            return window.APE_PROFILES_CONFIG.getEXTHTTPLine(profileId, options);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORTAR SINGLETON
    // ═══════════════════════════════════════════════════════════════════════
    window.APE_PROFILE_BRIDGE = new APEProfileBridge();

    // Invalidar cache cuando el usuario guarda cambios en ProfileManager
    document.addEventListener('ape-profile-saved', () => {
        window.APE_PROFILE_BRIDGE.invalidateCache();
    });

    // También escuchar cambios en prefetch
    document.addEventListener('ape-prefetch-updated', () => {
        window.APE_PROFILE_BRIDGE.invalidateCache();
    });

})();
