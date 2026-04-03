/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎚️ APE PROFILE MANAGER v9.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * UI Component para gestionar perfiles P0-P5 con 154 headers.
 * Reemplaza el gestor de 33 headers existente.
 * 
 * AUTOR: APE Engine Team - IPTV Navigator PRO
 * VERSIÓN: 13.1.0-SUPREMO
 * FECHA: 2026-01-05
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    class ProfileManagerV9 {
        // ═══════════════════════════════════════════════════════════════════════
        // CONSTANTES QUIRÚRGICAS v13.1 PRO
        // ═══════════════════════════════════════════════════════════════════════
        static BITS_PER_PIXEL = {
            // 🔬 MATRIZ BPP COMPLETA v13.1 PRO (5 codecs × 5 resoluciones)
            // Eficiencia: AV1 > H265 > VP9 > H264 > MPEG2

            // AV1 (Next-Gen, máxima eficiencia ~30% mejor que H265)
            'AV1_8K': 0.06,
            'AV1_UHD': 0.08,
            'AV1_FHD': 0.12,
            'AV1_HD': 0.18,
            'AV1_SD': 0.22,

            // H265/HEVC (Moderno, ~50% mejor que H264)
            'H265_8K': 0.08,
            'H265_UHD': 0.10,
            'H265_FHD': 0.15,
            'H265_HD': 0.20,
            'H265_SD': 0.25,
            'HEVC_8K': 0.08,  // Alias
            'HEVC_UHD': 0.10,
            'HEVC_FHD': 0.15,
            'HEVC_HD': 0.20,
            'HEVC_SD': 0.25,

            // VP9 (Google, similar a H265)
            'VP9_8K': 0.09,
            'VP9_UHD': 0.11,
            'VP9_FHD': 0.16,
            'VP9_HD': 0.21,
            'VP9_SD': 0.26,

            // H264/AVC (Legacy, más ancho de banda)
            'H264_8K': 0.12,
            'H264_UHD': 0.15,
            'H264_FHD': 0.20,
            'H264_HD': 0.25,
            'H264_SD': 0.30,
            'AVC_8K': 0.12,   // Alias
            'AVC_UHD': 0.15,
            'AVC_FHD': 0.20,
            'AVC_HD': 0.25,
            'AVC_SD': 0.30,

            // MPEG2 (Legacy SD/HD, no recomendado para UHD+)
            'MPEG2_UHD': 0.20,
            'MPEG2_FHD': 0.28,
            'MPEG2_HD': 0.35,
            'MPEG2_SD': 0.40
        };

        static STRATEGY_CONFIG = {
            'ultra-aggressive': {
                compressionMultiplier: 0.27,
                prefetchSegments: 10,
                qualityThreshold: 0.95,
                switchUpThreshold: 1.2,
                switchDownThreshold: 0.6,
                description: 'Pre-carga máxima, prioriza calidad sobre latencia (13.4 Mbps @ 4K/60)'
            },
            'aggressive': {
                compressionMultiplier: 0.26,
                prefetchSegments: 8,
                qualityThreshold: 0.90,
                switchUpThreshold: 1.15,
                switchDownThreshold: 0.65,
                description: 'Pre-carga alta, balance calidad/latencia'
            },
            'balanced': {
                compressionMultiplier: 0.22,
                prefetchSegments: 6,
                qualityThreshold: 0.85,
                switchUpThreshold: 1.1,
                switchDownThreshold: 0.7,
                description: 'Balance equilibrado'
            },
            'adaptive': {
                compressionMultiplier: 0.20,
                prefetchSegments: 4,
                qualityThreshold: 0.80,
                switchUpThreshold: 1.1,
                switchDownThreshold: 0.75,
                description: 'Adapta según condiciones de red en tiempo real'
            },
            'conservative': {
                compressionMultiplier: 0.18,
                prefetchSegments: 3,
                qualityThreshold: 0.75,
                switchUpThreshold: 1.05,
                switchDownThreshold: 0.8,
                description: 'Minimiza uso de ancho de banda'
            },
            'ultra-low-latency': {
                compressionMultiplier: 0.25,
                prefetchSegments: 2,
                qualityThreshold: 0.85,
                switchUpThreshold: 1.3,
                switchDownThreshold: 0.5,
                description: 'Prioriza baja latencia sobre calidad (< 2s)'
            }
        };

        // Lista de headers que se auto-sincronizan y deben ser readonly (verde) en UI
        static AUTO_SYNCED_HEADERS = new Set([
            'X-APE-BITRATE', 'X-APE-TARGET-BITRATE', 'X-APE-THROUGHPUT-T1', 'X-APE-THROUGHPUT-T2',
            'X-Initial-Bitrate', 'X-Max-Bitrate',
            'X-Network-Caching', 'X-Live-Caching', 'X-File-Caching',
            'X-Buffer-Size', 'X-Buffer-Target', 'X-Buffer-Min', 'X-Buffer-Max',
            'X-ExoPlayer-Buffer-Min', 'X-Manifest-Refresh', 'X-KODI-LIVE-DELAY',
            'X-APE-RESOLUTION', 'X-Screen-Resolution', 'X-Max-Resolution',
            'X-APE-FPS', 'X-Frame-Rates',
            'X-APE-STRATEGY',
            'X-APE-CODEC', 'X-Color-Depth', 'X-Codec-Support', 'X-Video-Codecs',
            'X-HEVC-Tier', 'X-HEVC-Level', 'X-HEVC-Profile', 'X-Video-Profile',
            'X-Prefetch-Segments', 'X-Parallel-Segments', 'X-Concurrent-Downloads',
            'X-APE-Prefetch-Segments', 'X-APE-Quality-Threshold', 'X-Segment-Duration', 'X-Prefetch-Enabled',
            // Netflix 4K HDR / HBO Max Dolby Vision Auto-Synced Headers
            'X-HDR-Support', 'X-Color-Space', 'X-Dynamic-Range', 'X-HDR-Transfer-Function', 'X-Color-Primaries', 'X-Matrix-Coefficients', 'X-Chroma-Subsampling', 'X-Pixel-Format', 'X-Compression-Level', 'X-Sharpen-Sigma', 'X-Rate-Control', 'X-Entropy-Coding',
            'X-Reconnect-On-Error', 'X-Max-Reconnect-Attempts', 'X-Reconnect-Delay-Ms', 'X-Buffer-Underrun-Strategy', 'X-Seamless-Failover',
            'X-Retry-Count', 'X-Retry-Delay-Ms', 'X-Connection-Timeout-Ms', 'X-Read-Timeout-Ms',
            'X-Min-Buffer-Time', 'X-Max-Buffer-Time', 'X-Request-Priority',
            'X-Bandwidth-Preference', 'X-BW-Estimation-Window', 'X-BW-Confidence-Threshold', 'X-BW-Smooth-Factor', 'X-Packet-Loss-Monitor', 'X-RTT-Monitoring', 'X-Congestion-Detect',
            'X-Player-Type', 'X-Audio-Track-Selection', 'X-Buffer-Strategy'
        ]);

        static THROUGHPUT_T1_MULTIPLIER = 1.3;
        static THROUGHPUT_T2_MULTIPLIER = 1.6;
        static SEGMENT_DURATION = 6; // segundos

        // Mapas de calidad para auto-sincronización Netflix 4K HDR / HBO Max Dolby Vision
        static QUALITY_MAPS = {
            hdr_color: {
                '8K': { hdr: 'hdr10,hdr10+,dolby-vision,hlg', space: 'bt2020', d_range: 'hdr', fn: 'pq,hlg', prim: 'bt2020', coef: 'bt2020nc', subsamp: '4:4:4,4:2:2,4:2:0', fmt_hevc: 'yuv420p12le', fmt_h264: 'yuv420p10le', comp: '0', sigma: '0.02', rate: 'VBR,CQP', entropy: 'CABAC' },
                '4K': { hdr: 'hdr10,hdr10+,dolby-vision,hlg', space: 'bt2020', d_range: 'hdr', fn: 'pq,hlg', prim: 'bt2020', coef: 'bt2020nc', subsamp: '4:4:4,4:2:2,4:2:0', fmt_hevc: 'yuv420p12le', fmt_h264: 'yuv420p10le', comp: '0', sigma: '0.02', rate: 'VBR,CQP', entropy: 'CABAC' },
                'FHD': { hdr: 'hdr10,dolby-vision,hlg', space: 'bt2020', d_range: 'hdr', fn: 'pq,hlg', prim: 'bt2020', coef: 'bt2020nc', subsamp: '4:2:2,4:2:0', fmt_hevc: 'yuv420p10le', fmt_h264: 'yuv420p', comp: '0', sigma: '0.03', rate: 'VBR,CQP', entropy: 'CABAC' },
                'HD': { hdr: 'hdr10,hlg', space: 'bt2020,bt709', d_range: 'hdr,sdr', fn: 'pq,hlg', prim: 'bt2020,bt709', coef: 'bt2020nc,bt709', subsamp: '4:2:0', fmt_hevc: 'yuv420p10le', fmt_h264: 'yuv420p', comp: '1', sigma: '0.04', rate: 'VBR', entropy: 'CABAC' },
                'SD': { hdr: 'hlg,sdr', space: 'bt709', d_range: 'sdr', fn: 'bt1886', prim: 'bt709', coef: 'bt709', subsamp: '4:2:0', fmt_hevc: 'yuv420p', fmt_h264: 'yuv420p', comp: '1', sigma: '0.06', rate: 'VBR', entropy: 'CABAC' }
            },
            anti_freeze: {
                'ultra-aggressive': { reconnect: 'true,immediate,adaptive', max: '40', delay: '50,100,200', underrun: 'aggressive-refill', failover: 'true-ultra' },
                'aggressive': { reconnect: 'true,immediate', max: '20', delay: '100,200,350', underrun: 'aggressive-refill', failover: 'true' },
                'balanced': { reconnect: 'true', max: '10', delay: '200,500', underrun: 'rebuffer', failover: 'true' },
                'conservative': { reconnect: 'true', max: '5', delay: '500,1000', underrun: 'pause', failover: 'false' },
                'ultra-low-latency': { reconnect: 'true,immediate', max: '50', delay: '20,50', underrun: 'discard', failover: 'true-ultra' }
            },
            timeouts: {
                'ultra-aggressive': { retry: '15,12,10', r_delay: '120,200,350', conn: '2500,3500,6000', read: '6000,9000,12000' },
                'aggressive': { retry: '10,8', r_delay: '200,350', conn: '5000,8000', read: '10000,15000' },
                'balanced': { retry: '5', r_delay: '500,1000', conn: '10000', read: '20000' },
                'conservative': { retry: '3', r_delay: '1000', conn: '15000', read: '30000' },
                'ultra-low-latency': { retry: '20', r_delay: '50', conn: '1500', read: '3000' }
            },
            abr: {
                'ultra-aggressive': { pref: 'unlimited', win: '5', conf: '0.95', smooth: '0.05', p_loss: 'enabled,aggressive', rtt: 'enabled,aggressive', cong: 'enabled,aggressive-extreme' },
                'aggressive': { pref: 'unlimited', win: '10', conf: '0.90', smooth: '0.10', p_loss: 'enabled', rtt: 'enabled', cong: 'enabled,aggressive' },
                'balanced': { pref: 'auto', win: '15', conf: '0.85', smooth: '0.15', p_loss: 'enabled', rtt: 'enabled', cong: 'enabled' },
                'conservative': { pref: 'limited', win: '20', conf: '0.80', smooth: '0.25', p_loss: 'disabled', rtt: 'disabled', cong: 'disabled' },
                'ultra-low-latency': { pref: 'unlimited', win: '2', conf: '0.99', smooth: '0.02', p_loss: 'enabled,aggressive', rtt: 'enabled,aggressive', cong: 'enabled,aggressive-extreme' }
            },
            ott_navigator: {
                '8K': { player: 'exoplayer-ultra-extreme,vlc-pro,kodi-pro', audio: 'default', buf: 'ultra-aggressive', req_prio: 'ultra-high-critical' },
                '4K': { player: 'exoplayer-ultra-extreme,vlc-pro,kodi-pro', audio: 'default', buf: 'ultra-aggressive', req_prio: 'ultra-high' },
                'FHD': { player: 'exoplayer-ultra,vlc-pro', audio: 'default', buf: 'aggressive', req_prio: 'high' },
                'HD': { player: 'exoplayer,vlc', audio: 'highest-quality', buf: 'adaptive', req_prio: 'medium' },
                'SD': { player: 'exoplayer', audio: 'default', buf: 'adaptive', req_prio: 'low' }
            }
        };

        constructor(containerId = 'profile-manager-container') {
            this.containerId = containerId;
            this.container = null;
            this.config = null;
            this.activeProfileId = 'P3'; // Default
            this.expandedCategories = new Set(['identity']); // Default expanded
            this.isOpen = false;

            this._init();
        }

        /**
         * Inicializa el manager
         */
        _init() {
            // Wait for APE_PROFILES_CONFIG
            if (!window.APE_PROFILES_CONFIG) {
                console.warn('⏳ Esperando APE_PROFILES_CONFIG...');
                setTimeout(() => this._init(), 100);
                return;
            }

            this.config = window.APE_PROFILES_CONFIG;

            // Load saved active profile
            const saved = localStorage.getItem('ape_active_profile');
            if (saved && this.config.getProfile(saved)) {
                this.activeProfileId = saved;
            }

            console.log('%c🎚️ Profile Manager v9.0 Inicializado', 'color: #10b981; font-weight: bold;');
            console.log(`   Perfil activo: ${this.activeProfileId}`);
        }

        /**
         * Renderiza el panel completo (expandido)
         * Añade botón de cerrar para volver al estado colapsado
         */
        render() {
            this.container = document.getElementById(this.containerId);
            if (!this.container) {
                console.warn(`Container ${this.containerId} no encontrado`);
                return;
            }

            // Marcar como expandido
            this.isOpen = true;

            const profiles = this.config.getAllProfiles();
            const activeProfile = this.config.getProfile(this.activeProfileId);
            const activeManifest = this.config.getManifestConfig();
            const categories = this.config.getCategories();

            this.container.innerHTML = `
                <div class="pm9-panel">
                    <!-- Header con botón de cerrar -->
                    <div class="pm9-header">
                        <div class="pm9-title">
                            <span class="pm9-icon">🎚️</span>
                            <span>Gestor de Perfiles APE v9.0</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="pm9-active-count">${this.config.countActiveHeaders(this.activeProfileId)} headers activos</span>
                            <button class="pm9-close-btn" onclick="window.ProfileManagerV9.collapse()" title="Cerrar panel">
                                ✕
                            </button>
                        </div>
                    </div>

                    <!-- Tabs de Perfiles -->
                    <div class="pm9-tabs">
                        ${Object.values(profiles).map(p => `
                            <button class="pm9-tab ${p.id === this.activeProfileId ? 'active' : ''}" 
                                    data-profile="${p.id}"
                                    style="--tab-color: ${p.color}"
                                    onclick="window.ProfileManagerV9.selectProfile('${p.id}')">
                                <span class="pm9-tab-id">${p.id}</span>
                                <span class="pm9-tab-count">${this.config.countActiveHeaders(p.id)}</span>
                            </button>
                        `).join('')}
                        <button class="pm9-tab pm9-tab-add" onclick="window.ProfileManagerV9.createNewProfile()">
                            <span>➕</span>
                        </button>
                    </div>

                    <!-- Info del Perfil Activo -->
                    <div class="pm9-profile-info" style="--profile-color: ${activeProfile.color}">
                        <div class="pm9-info-header">
                            <h3 class="pm9-profile-name">${activeProfile.id} - ${activeProfile.name}</h3>
                            <span class="pm9-level-badge">Level ${activeProfile.level}</span>
                        </div>
                        <p class="pm9-profile-desc">${activeProfile.description}</p>
                        
                        <!-- 🚀 FILA 1: PARÁMETROS DE ORIGEN (v13.1 SUPREMO) -->
                        <div class="pm9-origin-grid">
                            <div class="pm9-setting">
                                <label>Resolución</label>
                                <select id="pm9_resolution" onchange="window.ProfileManagerV9.updateSetting('resolution', this.value)">
                                    <option value="7680x4320" ${activeProfile.settings.resolution === '7680x4320' ? 'selected' : ''}>8K (7680x4320)</option>
                                    <option value="3840x2160" ${activeProfile.settings.resolution === '3840x2160' ? 'selected' : ''}>4K (3840x2160)</option>
                                    <option value="1920x1080" ${activeProfile.settings.resolution === '1920x1080' ? 'selected' : ''}>FHD (1920x1080)</option>
                                    <option value="1280x720" ${activeProfile.settings.resolution === '1280x720' ? 'selected' : ''}>HD (1280x720)</option>
                                    <option value="854x480" ${activeProfile.settings.resolution === '854x480' ? 'selected' : ''}>SD (854x480)</option>
                                </select>
                            </div>
                            <div class="pm9-setting">
                                <label>Códec</label>
                                <select id="pm9_codec" onchange="window.ProfileManagerV9.updateSetting('codec', this.value)">
                                    <option value="AV1" ${activeProfile.settings.codec === 'AV1' ? 'selected' : ''}>AV1 (Eco Max)</option>
                                    <option value="H265" ${activeProfile.settings.codec === 'H265' || activeProfile.settings.codec === 'HEVC' ? 'selected' : ''}>H265/HEVC (Eco)</option>
                                    <option value="VP9" ${activeProfile.settings.codec === 'VP9' ? 'selected' : ''}>VP9 (Google)</option>
                                    <option value="H264" ${activeProfile.settings.codec === 'H264' || activeProfile.settings.codec === 'AVC' ? 'selected' : ''}>H264/AVC (Pro)</option>
                                    <option value="MPEG2" ${activeProfile.settings.codec === 'MPEG2' ? 'selected' : ''}>MPEG2 (Legacy)</option>
                                </select>
                            </div>
                            <div class="pm9-setting">
                                <label>FPS</label>
                                <input type="number" id="pm9_fps" value="${activeProfile.settings.fps || 60}" 
                                       oninput="window.ProfileManagerV9.updateSetting('fps', parseInt(this.value) || 60)">
                            </div>
                            <div class="pm9-setting">
                                <label>Buffer Base (s)</label>
                                <input type="number" id="pm9_buffer_sec" value="${activeProfile.settings.buffer / 1000}" 
                                       oninput="window.ProfileManagerV9.updateSetting('bufferSeconds', parseFloat(this.value) || 6)">
                            </div>
                            <div class="pm9-setting">
                                <label>Estrategia</label>
                                <select id="pm9_strategy" onchange="window.ProfileManagerV9.updateSetting('strategy', this.value)">
                                    ${Object.keys(ProfileManagerV9.STRATEGY_CONFIG).map(s => `
                                        <option value="${s}" ${activeProfile.settings.strategy === s ? 'selected' : ''}>
                                            ${s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- ⚙️ SETTINGS AUXILIARES Y MÉTRICAS CALCULADAS -->
                        <div class="pm9-settings-grid">
                            <div class="pm9-setting">
                                <label>Bitrate (Mbps)</label>
                                <input type="number" id="pm9_bitrate" value="${activeProfile.settings.bitrate}" readonly style="opacity: 0.8; cursor: not-allowed;">
                            </div>
                            <div class="pm9-setting">
                                <label>Throughput T1</label>
                                <input type="number" step="0.1" id="pm9_t1" value="${activeProfile.settings.t1}" readonly style="opacity: 0.8; cursor: not-allowed;">
                            </div>
                            <div class="pm9-setting">
                                <label>Throughput T2</label>
                                <input type="number" step="0.1" id="pm9_t2" value="${activeProfile.settings.t2}" readonly style="opacity: 0.8; cursor: not-allowed;">
                            </div>
                            <div class="pm9-setting">
                                <label>Buffer Total (C1+C2+C3)</label>
                                <input type="number" id="pm9_buffer" value="${activeProfile.settings.buffer + activeProfile.settings.buffer + (activeProfile.settings.playerBuffer || 0)}" 
                                       readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;">
                            </div>
                            <div class="pm9-setting">
                                <label>Player Buffer (ms)</label>
                                <input type="number" id="pm9_playerBuffer" value="${activeProfile.settings.playerBuffer}" readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;">
                            </div>
                            <div class="pm9-setting">
                                <label>Headers Count</label>
                                <input type="number" id="pm9_headersCount" value="${activeProfile.settings.headersCount}" 
                                       onchange="window.ProfileManagerV9.updateSetting('headersCount', parseInt(this.value))">
                            </div>
                            <div class="pm9-setting">
                                <label>Clock Jitter (ms) <span style="font-size:9px;color:#10b981;">AUTO 10%</span></label>
                                <input type="number" id="pm9_clockJitter" value="${activeProfile.vlcopt?.['clock-jitter'] || Math.round(activeProfile.settings.buffer * 0.10)}" 
                                       readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;">
                            </div>
                            <div class="pm9-setting">
                                <label>Clock Synchro</label>
                                <select id="pm9_clockSynchro" onchange="window.ProfileManagerV9.updateVlcOpt('clock-synchro', this.value)">
                                    <option value="0" ${activeProfile.vlcopt?.['clock-synchro'] === '0' ? 'selected' : ''}>0 (Desactivado)</option>
                                    <option value="1" ${activeProfile.vlcopt?.['clock-synchro'] === '1' ? 'selected' : ''}>1 (Activado)</option>
                                </select>
                            </div>
                            <div class="pm9-setting">
                                <label>Buffer C1 (Network)</label>
                                <input type="number" id="pm9_bufferC1" value="${activeProfile.settings.buffer}" readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;">
                            </div>
                            <div class="pm9-setting">
                                <label>Buffer C2 (Live)</label>
                                <input type="number" id="pm9_bufferC2" value="${activeProfile.settings.buffer}" readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;">
                            </div>
                        </div>
                        </div>

                        <!-- Métricas de Red y Rendimiento (APE v13.1 SUPREMO) -->
                        <div class="pm9-performance-grid">
                            <div class="pm9-perf-item">
                                <label>Consumo Red (T1-Min)</label>
                                <span id="pm9_net_min">${activeProfile.settings.t1 || 0} Mbps</span>
                            </div>
                            <div class="pm9-perf-item">
                                <label>Consumo Red (T2-Opt)</label>
                                <span id="pm9_net_opt">${activeProfile.settings.t2 || 0} Mbps</span>
                            </div>
                            <div class="pm9-perf-item">
                                <label>Jitter Max Soportado</label>
                                <span id="pm9_jitter_max">${Math.floor((activeProfile.settings.playerBuffer || 0) * 0.8)} ms</span>
                            </div>
                            <div class="pm9-perf-item">
                                <label>Buffer Total (C1+C2+C3)</label>
                                <span id="pm9_buffer_total">${(activeProfile.settings.buffer * 2) + (activeProfile.settings.playerBuffer || 0)} ms</span>
                            </div>
                            <div class="pm9-perf-item pm9-perf-ram">
                                <label>RAM Est. (Teórica vs Real)</label>
                                <div class="pm9-ram-display">
                                    <span id="pm9_ram_real" class="pm9-ram-real">${(((activeProfile.settings.buffer * 2 + (activeProfile.settings.playerBuffer || 0)) / 1000) * (activeProfile.settings.bitrate || 0) / 8).toFixed(1)} MB (Real)</span>
                                    <span id="pm9_ram_theoretical" class="pm9-ram-theo">${(((activeProfile.settings.buffer * 2 + (activeProfile.settings.buffer / 5)) / 1000) * (activeProfile.settings.bitrate || 0) / 8).toFixed(1)} MB (Puro)</span>
                                </div>
                                <div class="pm9-ram-note">Overhead v13.1: +${activeProfile.settings.playerBuffer - (activeProfile.settings.buffer / 5)}ms seguridad</div>
                            </div>
                            <div class="pm9-perf-item pm9-streaming-health">
                                <label>📊 Streaming Health</label>
                                <div id="pm9_streaming_health" style="display: flex; align-items: center; gap: 8px;">
                                    <span id="pm9_health_indicator" style="
                                        width: 10px;
                                        height: 10px;
                                        border-radius: 50%;
                                        background: #10b981;
                                        animation: pulse-health 2s infinite;
                                    "></span>
                                    <span id="pm9_stability_label" style="color: #00ff41; font-weight: 600;">OPTIMAL</span>
                                    <span id="pm9_stall_preview" style="color: #64748b; font-size: 10px;">&lt;1.67%</span>
                                </div>
                                <div id="pm9_health_details" style="font-size: 9px; color: #64748b; margin-top: 4px;">
                                    Risk: <span id="pm9_risk_preview">--</span>/100 | Headroom: <span id="pm9_headroom_preview">--</span>%
                                </div>
                            </div>
                        </div>
                        
                        <!-- Streaming Health Summary (collapsible) -->
                        <div id="pm9_streaming_summary" class="pm9-streaming-summary" style="
                            background: rgba(16,185,129,0.1);
                            border: 1px solid rgba(16,185,129,0.3);
                            border-radius: 8px;
                            padding: 8px 12px;
                            margin-top: 10px;
                            display: none;
                        ">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 11px; font-weight: 600; color: #10b981;">⚡ STREAMING HEALTH</span>
                                <span id="pm9_engine_version" style="font-size: 9px; color: #64748b;">v3.1</span>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 10px;">
                                <div>⚡ Stability: <span id="pm9_summary_stability" style="color: #00ff41;">--</span></div>
                                <div>📈 Stall: <span id="pm9_summary_stall" style="color: #00ff41;">--%</span></div>
                                <div>🎯 Risk: <span id="pm9_summary_risk" style="color: #eab308;">--</span></div>
                                <div>💾 Memory: <span id="pm9_summary_memory" style="color: #00ff41;">-- MB</span></div>
                            </div>
                            <div id="pm9_summary_warning" style="display: none; margin-top: 6px; padding: 4px 6px; background: rgba(234,179,8,0.15); border-radius: 4px; font-size: 9px; color: #eab308;">
                                ⚠️ <span id="pm9_warning_text">--</span>
                            </div>
                        </div>
                    </div>

                    <!-- ⚡ PREFETCH INTELIGENTE (Smart Prefetch Manager) -->
                    ${this._renderPrefetchSection(activeProfile)}

                    <!-- Configuración Global del Manifiesto SUPREMO -->
                    <div class="pm9-manifest-config">
                        <div class="pm9-manifest-header" onclick="window.ProfileManagerV9.toggleManifestDropdown()">
                            <span class="pm9-manifest-title">⚙️ Configuración Global del Manifiesto</span>
                            <span id="pm9_manifest_toggle">▶</span>
                        </div>
                        <div id="pm9_manifest_content" class="pm9-manifest-content" style="display: none;">
                            <div class="pm9-settings-grid">
                                <div class="pm9-setting">
                                    <label>Versión Engine</label>
                                    <input type="text" value="${activeManifest.version}" 
                                           onchange="window.ProfileManagerV9.updateManifestSetting('version', this.value)">
                                </div>
                                <div class="pm9-setting">
                                    <label>Shift (Horas)</label>
                                    <input type="number" id="pm9_shift_hours" value="${activeManifest.shift || 8760}" 
                                           onchange="window.ProfileManagerV9.updateManifestSetting('shift', this.value)"
                                           title="Edita aquí y se convertirá automáticamente a días">
                                </div>
                                <div class="pm9-setting">
                                    <label>JWT Expiration</label>
                                    <input type="text" id="pm9_jwt_expiration" value="${activeManifest.jwtExpiration}" 
                                           readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;"
                                           title="Calculado desde Shift (Horas)">
                                </div>
                                <div class="pm9-setting">
                                    <label>Multilayer Strategy</label>
                                    <input type="text" value="${activeManifest.multilayer}" 
                                           onchange="window.ProfileManagerV9.updateManifestSetting('multilayer', this.value)">
                                </div>
                                <div class="pm9-setting">
                                    <label>Matrix Type</label>
                                    <input type="text" value="${activeManifest.matrixType}" 
                                           onchange="window.ProfileManagerV9.updateManifestSetting('matrixType', this.value)">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Acordeón de Headers -->
                    <div class="pm9-headers-container">
                        ${Object.entries(categories).map(([catId, cat]) => {
                const isExpanded = this.expandedCategories.has(catId);
                const isEnabled = activeProfile.enabledCategories.includes(catId);
                const headerCount = cat.headers.length;

                return `
                                <div class="pm9-category ${isExpanded ? 'expanded' : ''} ${isEnabled ? '' : 'disabled'}">
                                    <div class="pm9-category-header" onclick="window.ProfileManagerV9.toggleCategory('${catId}')">
                                        <div class="pm9-category-left">
                                            <input type="checkbox" ${isEnabled ? 'checked' : ''} 
                                                   onclick="event.stopPropagation(); window.ProfileManagerV9.toggleCategoryEnabled('${catId}', this.checked)">
                                            <span class="pm9-category-icon">${isExpanded ? '▼' : '▶'}</span>
                                            <span class="pm9-category-name">${cat.name}</span>
                                            <span class="pm9-category-count">(${headerCount})</span>
                                        </div>
                                    </div>
                                    ${isExpanded ? `
                                        <div class="pm9-category-content">
                                            <p class="pm9-category-desc">${cat.description}</p>
                                            <div class="pm9-headers-grid">
                                                ${cat.headers.map(headerName => {
                    const value = this.config.getHeaderValue(this.activeProfileId, headerName);
                    const isAutoSynced = ProfileManagerV9.AUTO_SYNCED_HEADERS.has(headerName);
                    return `
                                                        <div class="pm9-header-item">
                                                            <label class="pm9-header-name" ${isAutoSynced ? 'style="color: #10b981;"' : ''}>${headerName}${isAutoSynced ? ' <span style="font-size:8px;color:#10b981;">AUTO</span>' : ''}</label>
                                                            <input type="text" class="pm9-header-value" 
                                                                   value="${this._escapeHtml(value)}"
                                                                   placeholder="Valor..."
                                                                   ${isAutoSynced ? 'readonly style="opacity: 0.85; cursor: not-allowed; border-color: #00ff41;"' : ''}
                                                                   onchange="window.ProfileManagerV9.updateHeaderValue('${headerName}', this.value)">
                                                        </div>
                                                    `;
                }).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
            }).join('')}
                    </div>

                    <!-- Barra de Acciones -->
                    <div class="pm9-actions">
                        <button class="pm9-btn pm9-btn-upload" onclick="window.ProfileManagerV9.importTemplate()" title="Subir plantilla JSON para cargar al perfil actual">
                            📤 Subir Plantilla
                        </button>
                        <button class="pm9-btn pm9-btn-export" onclick="window.ProfileManagerV9.exportTemplate()" title="Exportar perfil actual como JSON">
                            📥 Exportar
                        </button>
                        <button class="pm9-btn pm9-btn-secondary" onclick="window.ProfileManagerV9.duplicateProfile()">
                            📋 Duplicar
                        </button>
                        <button class="pm9-btn pm9-btn-danger" onclick="window.ProfileManagerV9.deleteProfile()">
                            🗑️ Eliminar
                        </button>
                        <button class="pm9-btn pm9-btn-warning" onclick="window.ProfileManagerV9.resetProfile()">
                            ⟲ Default
                        </button>
                        <button class="pm9-btn pm9-btn-primary" onclick="window.ProfileManagerV9.saveAndClose()">
                            💾 Guardar
                        </button>
                    </div>
                </div>
            `;

            this._injectStyles();

            // v3.1: Actualizar indicadores de Streaming Health
            this._updateStreamingHealth();
        }

        /**
         * ═══════════════════════════════════════════════════════════════
         * STREAMING HEALTH UPDATE (v3.1)
         * ═══════════════════════════════════════════════════════════════
         * Actualiza los indicadores de Streaming Health usando StreamingEngine
         */
        _updateStreamingHealth() {
            const profile = this.config.getProfile(this.activeProfileId);
            if (!profile) return;

            // Obtener métricas del prefetch panel si ya existen
            const prefetchConfig = this.config.getPrefetchConfig(this.activeProfileId);
            if (!prefetchConfig || !window.PREFETCH_PRESETS) return;

            const bitrate = profile.settings?.bitrate || 5;
            const performance = window.PREFETCH_PRESETS.estimatePerformance(prefetchConfig, bitrate, {
                profileId: this.activeProfileId,
                resolution: profile.settings?.resolution || '1920x1080',
                codec: profile.settings?.codec || 'H265',
                fps: profile.settings?.fps || 60
            });

            // Actualizar indicadores del panel superior
            const healthIndicator = document.getElementById('pm9_health_indicator');
            const stabilityLabel = document.getElementById('pm9_stability_label');
            const stallPreview = document.getElementById('pm9_stall_preview');
            const riskPreview = document.getElementById('pm9_risk_preview');
            const headroomPreview = document.getElementById('pm9_headroom_preview');

            if (healthIndicator) {
                const riskScore = performance.risk_score || 0;
                const color = riskScore <= 30 ? '#10b981' : riskScore <= 60 ? '#eab308' : '#ef4444';
                healthIndicator.style.background = color;
                healthIndicator.style.boxShadow = `0 0 8px ${color}55`;
            }

            if (stabilityLabel) {
                const label = performance.stability?.label || performance.stall_class || 'OPTIMAL';
                const color = performance.stability?.color || performance.stall_color || '#10b981';
                stabilityLabel.textContent = label;
                stabilityLabel.style.color = color;
            }

            if (stallPreview) {
                const stall = performance.stall_rate_percent || 0;
                stallPreview.textContent = stall <= 1.67 ? `<${stall.toFixed(2)}%` : `${stall.toFixed(2)}%`;
                stallPreview.style.color = stall <= 1.67 ? '#10b981' : '#f97316';
            }

            if (riskPreview) {
                riskPreview.textContent = performance.risk_score || '--';
                riskPreview.style.color = performance.risk_color || '#64748b';
            }

            if (headroomPreview) {
                headroomPreview.textContent = performance.headroom_percent || '--';
            }

            // Actualizar panel de resumen (mostrar si hay warnings)
            const summaryPanel = document.getElementById('pm9_streaming_summary');
            if (summaryPanel && performance.policy_warnings && performance.policy_warnings.length > 0) {
                summaryPanel.style.display = 'block';
                summaryPanel.style.borderColor = performance.risk_color || 'rgba(16,185,129,0.3)';
                summaryPanel.style.background = `${performance.risk_color || '#10b981'}15`;

                const summaryStability = document.getElementById('pm9_summary_stability');
                const summaryStall = document.getElementById('pm9_summary_stall');
                const summaryRisk = document.getElementById('pm9_summary_risk');
                const summaryMemory = document.getElementById('pm9_summary_memory');
                const summaryWarning = document.getElementById('pm9_summary_warning');
                const warningText = document.getElementById('pm9_warning_text');

                if (summaryStability) {
                    summaryStability.textContent = performance.stability?.label || performance.stall_class || '--';
                    summaryStability.style.color = performance.stability?.color || '#10b981';
                }
                if (summaryStall) {
                    summaryStall.textContent = `${performance.stall_rate_percent?.toFixed(2) || '--'}%`;
                }
                if (summaryRisk) {
                    summaryRisk.textContent = `${performance.risk_score || '--'} (${performance.risk_level || 'N/A'})`;
                    summaryRisk.style.color = performance.risk_color || '#eab308';
                }
                if (summaryMemory) {
                    summaryMemory.textContent = `${performance.memory_usage_mb || '--'} MB`;
                }
                if (summaryWarning && warningText && performance.policy_warnings.length > 0) {
                    summaryWarning.style.display = 'block';
                    warningText.textContent = performance.policy_warnings[0];
                }
            } else if (summaryPanel) {
                summaryPanel.style.display = 'none';
            }

            // ═══════════════════════════════════════════════════════════════
            // ACTUALIZAR PANEL INFERIOR (Rendimiento Estimado) EN TIEMPO REAL
            // ═══════════════════════════════════════════════════════════════
            const rtFillTime = document.getElementById('pm9_rt_fill_time');
            const rtBw = document.getElementById('pm9_rt_bw');
            const rtRam = document.getElementById('pm9_rt_ram');
            const rtStall = document.getElementById('pm9_rt_stall');

            if (rtFillTime) {
                rtFillTime.textContent = `${performance.fill_time_seconds}s`;
            }
            if (rtBw) {
                rtBw.textContent = `${performance.bandwidth_usage_mbps}/${performance.bandwidth_average_mbps || '~'} Mbps`;
            }
            if (rtRam) {
                rtRam.textContent = `${performance.memory_usage_mb}/${performance.memory_peak_mb || '~'} MB`;
            }
            if (rtStall) {
                const stall = performance.stall_rate_percent || 0;
                rtStall.textContent = stall <= 1.67 ? `<${stall}%` : `${stall}%`;
                rtStall.style.color = this._getStallColor(stall);
            }

            // Actualizar banner de estabilidad
            const stabilityBanner = document.querySelector('.pm9-stability-banner');
            if (stabilityBanner && performance.stability) {
                stabilityBanner.style.background = `${performance.stability.color}22`;
                stabilityBanner.style.borderLeftColor = performance.stability.color;
                const bannerContent = stabilityBanner.querySelector('span');
                if (bannerContent) {
                    bannerContent.innerHTML = `
                        ${performance.stability.icon} <strong>${performance.stability.label}</strong>
                        <span style="color: #64748b; margin-left: 8px;">Headroom: ${performance.headroom_percent}%</span>
                        ${performance.unstable_margin ? `<span style="color: #64748b; margin-left: 8px;">(Margin: ${performance.unstable_margin}x)</span>` : ''}
                    `;
                }
            }

            // Actualizar métricas v3.1 si existen
            const v31T1T2 = document.querySelector('.pm9-v31-t1t2');
            const v31Burst = document.querySelector('.pm9-v31-burst');
            const v31Floor = document.querySelector('.pm9-v31-floor');
            const v31Overhead = document.querySelector('.pm9-v31-overhead');

            // Actualización mediante contenedores más específicos
            this._updateV31Metrics(performance);

            console.log('📊 Streaming Health updated:', {
                stability: performance.stability?.label,
                stall: performance.stall_rate_percent,
                risk: performance.risk_score,
                warnings: performance.policy_warnings?.length || 0
            });
        }

        /**
         * Actualiza las métricas v3.1 en el panel inferior
         */
        _updateV31Metrics(performance) {
            // Buscar contenedor de métricas v3.1 por estructura
            const metricsContainer = document.querySelector('.pm9-prefetch-preview');
            if (!metricsContainer) return;

            // Actualizar T1/T2, Burst, Floor, Overhead por posición
            const v31Grid = metricsContainer.querySelectorAll('[style*="grid-template-columns: repeat(4"]');
            if (v31Grid.length > 0) {
                const cells = v31Grid[0].children;
                if (cells[0]) {
                    const val = cells[0].querySelector('div:last-child');
                    if (val) val.textContent = `${performance.t1_mbps || '~'}/${performance.t2_mbps || '~'}`;
                }
                if (cells[1]) {
                    const val = cells[1].querySelector('div:last-child');
                    if (val) val.textContent = `${performance.burst_factor || '~'}x`;
                }
                if (cells[2]) {
                    const val = cells[2].querySelector('div:last-child');
                    if (val) val.textContent = `${performance.stall_floor || '~'}%`;
                }
                if (cells[3]) {
                    const val = cells[3].querySelector('div:last-child');
                    if (val) val.textContent = `${performance.request_overhead_sec || '~'}s`;
                }
            }

            // Actualizar Risk Score
            const riskRow = metricsContainer.querySelector('[style*="align-items: center"]');
            if (riskRow) {
                const riskScore = riskRow.querySelector('span');
                if (riskScore && riskScore.textContent.includes('Risk Score')) {
                    riskScore.innerHTML = `🛡️ Risk Score: <strong style="color: ${performance.risk_color}">${performance.risk_score}</strong>/100 <span style="background: ${performance.risk_color}33; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${performance.risk_level}</span>`;
                }
            }

            // Actualizar health badge
            const healthBadge = document.getElementById('pm9_health_badge');
            if (healthBadge) {
                const color = performance.risk_score <= 30 ? '#10b981' : performance.risk_score <= 60 ? '#eab308' : '#ef4444';
                healthBadge.style.background = color;
                healthBadge.style.boxShadow = `0 0 8px ${color}55`;
            }
        }

        /**
         * Inyecta estilos CSS
         */
        _injectStyles() {
            if (document.getElementById('pm9-styles')) return;

            const styles = document.createElement('style');
            styles.id = 'pm9-styles';
            styles.textContent = `
                .pm9-panel {
                    background: rgba(15, 23, 42, 0.95);
                    border: 1px solid rgba(100, 116, 139, 0.3);
                    border-radius: 16px;
                    padding: 20px;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .pm9-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid rgba(100, 116, 139, 0.2);
                }

                .pm9-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 18px;
                    font-weight: 600;
                    color: #f1f5f9;
                }

                .pm9-icon { font-size: 24px; }

                .pm9-active-count {
                    font-size: 13px;
                    color: #10b981;
                    font-weight: 600;
                    background: rgba(16, 185, 129, 0.15);
                    padding: 4px 12px;
                    border-radius: 20px;
                }

                .pm9-close-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    border: 1px solid rgba(239, 68, 68, 0.4);
                    background: rgba(239, 68, 68, 0.15);
                    color: #f87171;
                    font-size: 14px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .pm9-close-btn:hover {
                    background: rgba(239, 68, 68, 0.3);
                    border-color: rgba(239, 68, 68, 0.6);
                    transform: scale(1.1);
                }

                .pm9-tabs {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 16px;
                    flex-wrap: wrap;
                }

                .pm9-tab {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 10px 16px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid transparent;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    min-width: 60px;
                }

                .pm9-tab:hover {
                    background: rgba(51, 65, 85, 0.9);
                    transform: translateY(-2px);
                }

                .pm9-tab.active {
                    border-color: var(--tab-color);
                    background: rgba(51, 65, 85, 1);
                    box-shadow: 0 0 20px rgba(var(--tab-color), 0.3);
                }

                .pm9-tab-id {
                    font-weight: 700;
                    font-size: 14px;
                    color: #f1f5f9;
                }

                .pm9-tab-count {
                    font-size: 11px;
                    color: #94a3b8;
                }

                .pm9-tab-add {
                    background: rgba(16, 185, 129, 0.2);
                    border: 2px dashed rgba(16, 185, 129, 0.5);
                }

                .pm9-profile-info {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border-left: 4px solid var(--profile-color);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 16px;
                }

                .pm9-manifest-config {
                    background: rgba(30, 41, 59, 0.4);
                    border: 1px solid rgba(100, 116, 139, 0.2);
                    border-radius: 12px;
                    padding: 12px;
                    margin-bottom: 16px;
                }

                .pm9-manifest-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                }

                .pm9-manifest-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #94a3b8;
                    text-transform: uppercase;
                }

                .pm9-manifest-content {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(100, 116, 139, 0.1);
                }

                .pm9-info-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .pm9-profile-name {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: #f1f5f9;
                }

                .pm9-level-badge {
                    background: var(--profile-color);
                    color: white;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .pm9-profile-desc {
                    color: #94a3b8;
                    font-size: 13px;
                    margin: 0 0 12px 0;
                }

                .pm9-settings-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                    gap: 12px;
                }

                .pm9-origin-grid {
                    display: grid;
                    grid-template-columns: 1.5fr 1.25fr 0.6fr 1fr 1.5fr;
                    gap: 12px;
                    background: rgba(30, 41, 59, 0.4);
                    padding: 16px;
                    border-radius: 12px;
                    margin-bottom: 16px;
                    border: 1px solid rgba(100, 116, 139, 0.2);
                }

                @media (max-width: 600px) {
                    .pm9-origin-grid {
                        grid-template-columns: 1fr 1fr;
                    }
                }

                .pm9-performance-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                    gap: 8px;
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px dashed rgba(100, 116, 139, 0.3);
                }

                .pm9-perf-item {
                    display: flex;
                    flex-direction: column;
                    background: rgba(15, 23, 42, 0.4);
                    padding: 8px;
                    border-radius: 8px;
                    border: 1px solid rgba(100, 116, 139, 0.1);
                }

                .pm9-perf-item label {
                    font-size: 9px;
                    color: #94a3b8;
                    text-transform: uppercase;
                    margin-bottom: 4px;
                }

                .pm9-perf-item span {
                    font-size: 13px;
                    font-weight: 700;
                    color: #00ff41;
                    font-family: 'Fira Code', monospace;
                }

                .pm9-setting {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .pm9-setting label {
                    font-size: 11px;
                    color: #64748b;
                    text-transform: uppercase;
                    font-weight: 500;
                }

                .pm9-setting input,
                .pm9-setting select {
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid rgba(100, 116, 139, 0.3);
                    border-radius: 6px;
                    padding: 8px 10px;
                    color: #f1f5f9;
                    font-size: 13px;
                    width: 100%;
                    box-sizing: border-box;
                }

                .pm9-setting input:focus,
                .pm9-setting select:focus {
                    outline: none;
                    border-color: #3b82f6;
                }

                .pm9-headers-container {
                    max-height: 400px;
                    overflow-y: auto;
                    margin-bottom: 16px;
                    padding-right: 8px;
                }

                .pm9-category {
                    background: rgba(30, 41, 59, 0.6);
                    border-radius: 10px;
                    margin-bottom: 8px;
                    overflow: hidden;
                    transition: all 0.2s;
                }

                .pm9-category.disabled {
                    opacity: 0.5;
                }

                .pm9-category-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 14px;
                    cursor: pointer;
                    user-select: none;
                    transition: background 0.2s;
                }

                .pm9-category-header:hover {
                    background: rgba(51, 65, 85, 0.5);
                }

                .pm9-category-left {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .pm9-category-icon {
                    color: #64748b;
                    font-size: 10px;
                    width: 12px;
                }

                .pm9-category-name {
                    font-weight: 500;
                    color: #e2e8f0;
                    font-size: 14px;
                }

                .pm9-category-count {
                    color: #64748b;
                    font-size: 12px;
                }

                .pm9-category-content {
                    padding: 0 14px 14px;
                    border-top: 1px solid rgba(100, 116, 139, 0.15);
                }

                .pm9-category-desc {
                    color: #64748b;
                    font-size: 11px;
                    margin: 10px 0;
                }

                .pm9-headers-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .pm9-header-item {
                    display: grid;
                    grid-template-columns: 1fr 2fr;
                    gap: 10px;
                    align-items: center;
                }

                .pm9-header-name {
                    font-size: 12px;
                    color: #94a3b8;
                    font-weight: 500;
                    font-family: 'Fira Code', monospace;
                }

                .pm9-header-value, .pm9-setting select {
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid rgba(100, 116, 139, 0.2);
                    border-radius: 6px;
                    padding: 6px 10px;
                    color: #f1f5f9;
                    font-size: 12px;
                    font-family: 'Fira Code', monospace;
                }

                .pm9-setting select {
                    height: 34px;
                    font-family: 'Inter', sans-serif;
                }

                .pm9-header-value:focus {
                    outline: none;
                    border-color: #3b82f6;
                }

                .pm9-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(100, 116, 139, 0.2);
                }

                .pm9-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 10px 16px;
                    border: none;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .pm9-btn-primary {
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    color: white;
                }

                .pm9-btn-secondary {
                    background: rgba(100, 116, 139, 0.3);
                    color: #e2e8f0;
                }

                .pm9-btn-warning {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }

                .pm9-btn-danger {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }

                .pm9-btn-upload {
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    font-weight: 600;
                    box-shadow: 0 2px 10px rgba(16, 185, 129, 0.3);
                }

                .pm9-btn-export {
                    background: rgba(6, 182, 212, 0.2);
                    color: #06b6d4;
                    border: 1px solid rgba(6, 182, 212, 0.3);
                }

                .pm9-btn:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.1);
                }

                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(-10px); }
                    15% { opacity: 1; transform: translateY(0); }
                    85% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-10px); }
                }

                /* Scrollbar */
                .pm9-headers-container::-webkit-scrollbar {
                    width: 6px;
                }
                .pm9-headers-container::-webkit-scrollbar-track {
                    background: rgba(15, 23, 42, 0.5);
                    border-radius: 3px;
                }
                .pm9-headers-container::-webkit-scrollbar-thumb {
                    background: rgba(100, 116, 139, 0.5);
                    border-radius: 3px;
                }

                .pm9-perf-ram {
                    grid-column: span 2;
                    background: rgba(16, 185, 129, 0.05);
                }

                .pm9-ram-display {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                    gap: 10px;
                    margin-top: 5px;
                }

                .pm9-ram-real {
                    font-size: 16px;
                    font-weight: 700;
                    color: #00ff41;
                }

                .pm9-ram-theo {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                    font-style: italic;
                }

                .pm9-ram-note {
                    font-size: 10px;
                    color: #fbbf24;
                    margin-top: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                /* ═══════════════════════════════════════════════════════════ */
                /* PREFETCH PANEL STYLES                                       */
                /* ═══════════════════════════════════════════════════════════ */

                .pm9-prefetch-config {
                    background: rgba(30, 41, 59, 0.4);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    border-radius: 12px;
                    padding: 12px;
                    margin-bottom: 16px;
                }

                .pm9-prefetch-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                }

                .pm9-prefetch-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #10b981;
                    text-transform: uppercase;
                }

                .pm9-prefetch-content {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(16, 185, 129, 0.15);
                }

                .pm9-prefetch-strategy-row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    margin-bottom: 12px;
                }

                .pm9-prefetch-strategy-row label {
                    font-size: 11px;
                    color: #64748b;
                    text-transform: uppercase;
                    font-weight: 500;
                }

                .pm9-prefetch-strategy-row select {
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid rgba(16, 185, 129, 0.4);
                    border-radius: 8px;
                    padding: 10px 12px;
                    color: #f1f5f9;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                }

                .pm9-prefetch-desc {
                    color: #94a3b8;
                    font-size: 12px;
                    margin: 0 0 12px 0;
                    font-style: italic;
                }

                .pm9-prefetch-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                    margin-bottom: 12px;
                }

                .pm9-prefetch-setting {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .pm9-prefetch-setting label {
                    font-size: 10px;
                    color: #64748b;
                    text-transform: uppercase;
                    font-weight: 500;
                }

                .pm9-prefetch-setting input {
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid rgba(100, 116, 139, 0.3);
                    border-radius: 6px;
                    padding: 8px 10px;
                    color: #f1f5f9;
                    font-size: 13px;
                    width: 100%;
                    box-sizing: border-box;
                }

                .pm9-prefetch-setting input:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    background: rgba(16, 185, 129, 0.1);
                    border-color: rgba(16, 185, 129, 0.3);
                }

                .pm9-prefetch-toggles {
                    display: flex;
                    gap: 16px;
                    margin-bottom: 12px;
                    flex-wrap: wrap;
                }

                .pm9-prefetch-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-size: 12px;
                    color: #94a3b8;
                }

                .pm9-prefetch-toggle input[type="checkbox"] {
                    width: 16px;
                    height: 16px;
                    accent-color: #10b981;
                }

                .pm9-prefetch-preview {
                    background: rgba(16, 185, 129, 0.08);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    border-radius: 8px;
                    padding: 10px;
                }

                .pm9-prefetch-preview-title {
                    font-size: 11px;
                    color: #10b981;
                    font-weight: 600;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                }

                .pm9-prefetch-preview-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 8px;
                }

                @media (max-width: 600px) {
                    .pm9-prefetch-preview-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                .pm9-prefetch-metric {
                    display: flex;
                    flex-direction: column;
                    text-align: center;
                }

                .pm9-prefetch-metric-label {
                    font-size: 9px;
                    color: #64748b;
                    text-transform: uppercase;
                }

                .pm9-prefetch-metric-value {
                    font-size: 14px;
                    font-weight: 700;
                    color: #00ff41;
                    font-family: 'Fira Code', monospace;
                }

                .pm9-prefetch-stall {
                    color: #10b981;
                }

                /* v3.1 Health Badge Animation */
                @keyframes pulse-health {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }

                .pm9-v31-row {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 6px;
                    font-size: 9px;
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                }

                .pm9-v31-cell {
                    text-align: center;
                }

                .pm9-v31-label {
                    color: #64748b;
                    text-transform: uppercase;
                    font-size: 8px;
                }

                .pm9-v31-value {
                    color: #00ff41;
                    font-family: 'Fira Code', monospace;
                    font-weight: 600;
                }

                .pm9-policy-warning {
                    margin-top: 8px;
                    padding: 6px 8px;
                    background: rgba(234,179,8,0.15);
                    border-radius: 4px;
                    border-left: 2px solid #eab308;
                }

                .pm9-policy-urgent {
                    margin-top: 6px;
                    padding: 4px 8px;
                    background: rgba(239,68,68,0.2);
                    border-radius: 4px;
                    text-align: center;
                }
            `;
            document.head.appendChild(styles);
        }

        /**
         * Escape HTML
         */
        _escapeHtml(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // ═══════════════════════════════════════════════════════════════
        // PREFETCH PANEL RENDERING
        // ═══════════════════════════════════════════════════════════════

        /**
         * Renders the Prefetch Configuration section
         */
        _renderPrefetchSection(activeProfile) {
            // Get prefetch config from APE_PROFILES_CONFIG
            const prefetchConfig = this.config.getPrefetchConfig(this.activeProfileId);
            const strategies = window.PREFETCH_STRATEGIES || {};
            const currentStrategy = strategies[prefetchConfig.strategy] || {};

            // Calculate performance metrics
            const bitrate = activeProfile.settings?.bitrate || 5;
            const performance = window.PREFETCH_PRESETS
                ? window.PREFETCH_PRESETS.estimatePerformance(prefetchConfig, bitrate)
                : { fill_time_seconds: '~', bandwidth_usage_mbps: '~', memory_usage_mb: '~', stall_rate_percent: '~' };

            return `
                <div class="pm9-prefetch-config">
                    <div class="pm9-prefetch-header" onclick="window.ProfileManagerV9.togglePrefetchDropdown()">
                        <span class="pm9-prefetch-title">⚡ Prefetch Inteligente</span>
                        <span id="pm9_prefetch_toggle">▶</span>
                    </div>
                    <div id="pm9_prefetch_content" class="pm9-prefetch-content" style="display: none;">
                        
                        <!-- Strategy Selector -->
                        <div class="pm9-prefetch-strategy-row">
                            <label>Estrategia Prefetch</label>
                            <select id="pm9_prefetch_strategy" onchange="window.ProfileManagerV9.updatePrefetchStrategy(this.value)">
                                ${Object.entries(strategies).map(([id, s]) => `
                                    <option value="${id}" ${prefetchConfig.strategy === id ? 'selected' : ''}>
                                        ${s.icon} ${s.name}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <p class="pm9-prefetch-desc">${currentStrategy.description || 'Configuración personalizada'}</p>
                        
                        <!-- Configuration Grid -->
                        <div class="pm9-prefetch-grid">
                            <div class="pm9-prefetch-setting">
                                <label>Segmentos a Precargar</label>
                                <input type="number" id="pm9_prefetch_segments" 
                                       value="${prefetchConfig.prefetch_segments === 'AUTO' ? 25 : prefetchConfig.prefetch_segments}"
                                       min="5" max="200"
                                       ${prefetchConfig.prefetch_segments === 'AUTO' ? 'disabled' : ''}
                                       oninput="window.ProfileManagerV9.updatePrefetchValue('prefetch_segments', parseInt(this.value) || 25)">
                            </div>
                            <div class="pm9-prefetch-setting">
                                <label>Descargas Paralelas</label>
                                <input type="number" id="pm9_prefetch_parallel" 
                                       value="${prefetchConfig.parallel_downloads === 'AUTO' ? 10 : prefetchConfig.parallel_downloads}"
                                       min="1" max="50"
                                       ${prefetchConfig.parallel_downloads === 'AUTO' ? 'disabled' : ''}
                                       oninput="window.ProfileManagerV9.updatePrefetchValue('parallel_downloads', parseInt(this.value) || 10)">
                            </div>
                            <div class="pm9-prefetch-setting">
                                <label>Buffer Objetivo (s)</label>
                                <input type="number" id="pm9_prefetch_buffer" 
                                       value="${prefetchConfig.buffer_target_seconds === 'AUTO' ? 90 : prefetchConfig.buffer_target_seconds}"
                                       min="10" max="600"
                                       ${prefetchConfig.buffer_target_seconds === 'AUTO' ? 'disabled' : ''}
                                       oninput="window.ProfileManagerV9.updatePrefetchValue('buffer_target_seconds', parseInt(this.value) || 90)">
                            </div>
                            <div class="pm9-prefetch-setting">
                                <label>BW Mínimo (Mbps) <span style="font-size:9px;color:#10b981;">AUTO 3×</span></label>
                                <input type="number" id="pm9_prefetch_bw" 
                                       value="${prefetchConfig.min_bandwidth_mbps === 'AUTO' ? 40 : prefetchConfig.min_bandwidth_mbps}"
                                       readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;">
                            </div>
                        </div>
                        
                        <!-- Toggles -->
                        <div class="pm9-prefetch-toggles">
                            <label class="pm9-prefetch-toggle">
                                <input type="checkbox" id="pm9_prefetch_adaptive" 
                                       ${prefetchConfig.adaptive_enabled ? 'checked' : ''}
                                       onchange="window.ProfileManagerV9.updatePrefetchValue('adaptive_enabled', this.checked)">
                                <span>Adaptación Inteligente</span>
                            </label>
                            <label class="pm9-prefetch-toggle">
                                <input type="checkbox" id="pm9_prefetch_ai" 
                                       ${prefetchConfig.ai_prediction_enabled ? 'checked' : ''}
                                       onchange="window.ProfileManagerV9.updatePrefetchValue('ai_prediction_enabled', this.checked)">
                                <span>Predicción AI</span>
                            </label>
                        </div>
                        
                        <!-- Performance Preview v3.1 (StreamingEngine) -->
                        <div class="pm9-prefetch-preview">
                            <div class="pm9-prefetch-preview-title" style="display: flex; justify-content: space-between; align-items: center;">
                                <span>📊 Rendimiento Estimado (v${performance.engine_version || '2.0'})</span>
                                <!-- Health Badge -->
                                <span id="pm9_health_badge" style="
                                    width: 12px;
                                    height: 12px;
                                    border-radius: 50%;
                                    background: ${performance.risk_score <= 30 ? '#10b981' : performance.risk_score <= 60 ? '#eab308' : '#ef4444'};
                                    box-shadow: 0 0 8px ${performance.risk_score <= 30 ? '#10b98155' : performance.risk_score <= 60 ? '#eab30855' : '#ef444455'};
                                    animation: pulse-health 2s infinite;
                                " title="Health: ${performance.risk_level || 'N/A'} (${performance.risk_score || 0}/100)"></span>
                            </div>
                            
                            <!-- Stability Class Banner -->
                            ${performance.stability ? `
                            <div class="pm9-stability-banner" style="
                                background: ${performance.stability.color}22;
                                border-left: 3px solid ${performance.stability.color};
                                padding: 6px 10px;
                                margin-bottom: 10px;
                                border-radius: 4px;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="font-size: 11px;">
                                    ${performance.stability.icon} <strong>${performance.stability.label}</strong>
                                    <span style="color: #64748b; margin-left: 8px;">Headroom: ${performance.headroom_percent}%</span>
                                    ${performance.unstable_margin ? `<span style="color: #64748b; margin-left: 8px;">(Margin: ${performance.unstable_margin}x)</span>` : ''}
                                </span>
                                ${!performance.is_stable ? '<span style="color: #ef4444; font-size: 10px;">⚠️ BW insuficiente</span>' : ''}
                            </div>
                            ` : ''}
                            
                            <div class="pm9-prefetch-preview-grid">
                                <div class="pm9-prefetch-metric">
                                    <span class="pm9-prefetch-metric-label">Tiempo llenado</span>
                                    <span class="pm9-prefetch-metric-value" id="pm9_rt_fill_time">${performance.fill_time_seconds}s</span>
                                </div>
                                <div class="pm9-prefetch-metric">
                                    <span class="pm9-prefetch-metric-label">BW Pico/Avg</span>
                                    <span class="pm9-prefetch-metric-value" id="pm9_rt_bw">${performance.bandwidth_usage_mbps}/${performance.bandwidth_average_mbps || '~'} Mbps</span>
                                </div>
                                <div class="pm9-prefetch-metric">
                                    <span class="pm9-prefetch-metric-label">RAM Steady/Peak</span>
                                    <span class="pm9-prefetch-metric-value" id="pm9_rt_ram">${performance.memory_usage_mb}/${performance.memory_peak_mb || '~'} MB</span>
                                </div>
                                <div class="pm9-prefetch-metric">
                                    <span class="pm9-prefetch-metric-label">Stall Rate</span>
                                    <span class="pm9-prefetch-metric-value pm9-prefetch-stall" id="pm9_rt_stall"
                                          style="color: ${this._getStallColor(performance.stall_rate_percent)}">
                                        ${performance.stall_rate_percent <= 1.67 ? '<' : ''}${performance.stall_rate_percent}%
                                    </span>
                                </div>
                            </div>
                            
                            <!-- v3.1 Additional Metrics -->
                            ${performance.t1_mbps || performance.burst_factor ? `
                            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 9px;">
                                    <div style="text-align: center;">
                                        <div style="color: #64748b;">T1/T2</div>
                                        <div style="color: #00ff41; font-family: monospace;">${performance.t1_mbps || '~'}/${performance.t2_mbps || '~'}</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="color: #64748b;">Burst</div>
                                        <div style="color: #00ff41; font-family: monospace;">${performance.burst_factor || '~'}x</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="color: #64748b;">Floor</div>
                                        <div style="color: #00ff41; font-family: monospace;">${performance.stall_floor || '~'}%</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="color: #64748b;">Overhead</div>
                                        <div style="color: #00ff41; font-family: monospace;">${performance.request_overhead_sec || '~'}s</div>
                                    </div>
                                </div>
                            </div>
                            ` : ''}
                            
                            <!-- Risk Score & Target -->
                            <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                                ${performance.risk_score !== undefined ? `
                                <div style="font-size: 10px;">
                                    🎲 Risk Score: 
                                    <span style="
                                        color: ${performance.risk_color || '#64748b'};
                                        font-weight: bold;
                                    ">${performance.risk_score}/100</span>
                                    <span style="color: #64748b; margin-left: 4px;">(${performance.risk_level || 'N/A'})</span>
                                    ${performance.error_penalty > 0 ? `<span style="color: #f97316; margin-left: 4px;">+${performance.error_penalty} err</span>` : ''}
                                </div>
                                ` : ''}
                                <div class="pm9-stall-target" style="font-size: 10px; color: #64748b;">
                                    🎯 Target: <span style="color: ${performance.stall_rate_percent <= 1.67 ? '#10b981' : '#f97316'}">&lt;1.67%</span>
                                    ${performance.meets_target !== undefined
                    ? (performance.meets_target
                        ? '<span style="color: #10b981; margin-left: 6px;">✅</span>'
                        : '<span style="color: #f97316; margin-left: 6px;">⚠️</span>')
                    : (performance.stall_rate_percent <= 1.67
                        ? '<span style="color: #10b981; margin-left: 6px;">✅</span>'
                        : '<span style="color: #f97316; margin-left: 6px;">⚠️</span>')}
                                </div>
                            </div>
                            
                            <!-- Policy Warnings -->
                            ${performance.policy_warnings && performance.policy_warnings.length > 0 ? `
                            <div style="margin-top: 8px; padding: 6px 8px; background: rgba(234,179,8,0.15); border-radius: 4px; border-left: 2px solid #eab308;">
                                <div style="font-size: 9px; color: #eab308; font-weight: 600; margin-bottom: 4px;">⚠️ WARNINGS (${performance.warning_count || performance.policy_warnings.length})</div>
                                ${performance.policy_warnings.slice(0, 3).map(w => `
                                    <div style="font-size: 9px; color: #d4d4d8; margin-left: 12px; margin-bottom: 2px;">• ${w}</div>
                                `).join('')}
                                ${performance.policy_warnings.length > 3 ? `<div style="font-size: 8px; color: #64748b; margin-left: 12px;">... +${performance.policy_warnings.length - 3} más</div>` : ''}
                            </div>
                            ` : ''}
                            
                            <!-- Policy Status Badge -->
                            ${performance.has_urgent ? `
                            <div style="margin-top: 6px; padding: 4px 8px; background: rgba(239,68,68,0.2); border-radius: 4px; text-align: center;">
                                <span style="font-size: 10px; color: #ef4444; font-weight: 600;">🚨 ACCIÓN URGENTE REQUERIDA</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        /**
         * Obtiene el color para el indicador de stall rate
         */
        _getStallColor(stallRate) {
            if (stallRate <= 0.5) return '#10b981';  // Excelente - Verde esmeralda
            if (stallRate <= 1.0) return '#22c55e';  // Bueno - Verde
            if (stallRate <= 1.67) return '#eab308'; // Aceptable - Amarillo
            if (stallRate <= 3.0) return '#f97316';  // Advertencia - Naranja
            return '#ef4444';                         // Deficiente - Rojo
        }

        /**
         * Toggle prefetch dropdown
         */
        togglePrefetchDropdown() {
            const content = document.getElementById('pm9_prefetch_content');
            const toggle = document.getElementById('pm9_prefetch_toggle');
            if (content && toggle) {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                toggle.textContent = isHidden ? '▼' : '▶';
            }
        }

        /**
         * Update prefetch strategy
         */
        updatePrefetchStrategy(strategyId) {
            if (this.config && this.config.setPrefetchStrategy) {
                this.config.setPrefetchStrategy(this.activeProfileId, strategyId);
                // Refresh the panel to show new values
                this.render();
            }
        }

        /**
         * Update single prefetch value
         */
        updatePrefetchValue(key, value) {
            if (this.config && this.config.updatePrefetchSetting) {
                this.config.updatePrefetchSetting(this.activeProfileId, key, value);

                // USER REQUEST: Sync parallel_downloads -> prefetch_segments (3:1)
                if (key === 'parallel_downloads' && value !== 'AUTO') {
                    const segments = value * 3;
                    this.config.updatePrefetchSetting(this.activeProfileId, 'prefetch_segments', segments);
                    // Actualizar DOM directamente para no perder foco
                    const segmentsInput = document.getElementById('pm9_prefetch_segments');
                    if (segmentsInput) segmentsInput.value = segments;

                    // AUTO-SYNC: Prefetch-dependent headers
                    this.config.setHeaderOverride(this.activeProfileId, 'X-Prefetch-Segments', String(segments));
                    this.config.setHeaderOverride(this.activeProfileId, 'X-Parallel-Segments', String(value));
                    this.config.setHeaderOverride(this.activeProfileId, 'X-Concurrent-Downloads', String(value));
                }

                // v3.1: Actualizar Streaming Health en tiempo real
                this._updateStreamingHealth();
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // MÉTODOS DE INTERACCIÓN
        // ═══════════════════════════════════════════════════════════════

        selectProfile(profileId) {
            this.activeProfileId = profileId;
            localStorage.setItem('ape_active_profile', profileId);
            this.render();
        }

        /**
         * ✅ Colapsa el panel a la vista compacta
         * Restaura el HTML inicial del contenedor
         */
        collapse() {
            this.container = document.getElementById(this.containerId);
            if (!this.container) return;

            this.isOpen = false;
            const activeCount = this.config ? this.config.countActiveHeaders(this.activeProfileId) : 0;

            // Obtener colores de perfiles
            const profileColors = {
                'P0': { bg: 'rgba(220,38,38,0.15)', border: 'rgba(220,38,38,0.4)', text: '#fca5a5' },
                'P1': { bg: 'rgba(234,88,12,0.15)', border: 'rgba(234,88,12,0.4)', text: '#fdba74' },
                'P2': { bg: 'rgba(202,138,4,0.15)', border: 'rgba(202,138,4,0.4)', text: '#fde047' },
                'P3': { bg: 'rgba(22,163,74,0.25)', border: 'rgba(22,163,74,0.5)', text: '#86efac' },
                'P4': { bg: 'rgba(8,145,178,0.15)', border: 'rgba(8,145,178,0.4)', text: '#67e8f9' },
                'P5': { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)', text: '#a5b4fc' }
            };

            const profileLabels = {
                'P0': 'ULTRA', 'P1': '8K', 'P2': '4K', 'P3': 'FHD', 'P4': 'HD', 'P5': 'SD'
            };

            // Construir botones de perfil
            const profileButtons = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map(pid => {
                const colors = profileColors[pid];
                const isActive = pid === this.activeProfileId;
                return `<button class="btn-profile${isActive ? ' active' : ''}" data-profile="${pid}" 
                    onclick="if(window.ProfileManagerV9) { window.ProfileManagerV9.selectProfileCompact('${pid}'); }"
                    style="padding: 6px 10px; font-size: 11px; 
                           background: ${colors.bg}; 
                           border: 1px solid ${colors.border}; 
                           color: ${colors.text}; 
                           border-radius: 6px; cursor: pointer;
                           ${isActive ? 'box-shadow: 0 0 10px ' + colors.border + ';' : ''}">${pid} ${profileLabels[pid]}</button>`;
            }).join('\n                    ');

            this.container.innerHTML = `
                <div class="panel-header" style="margin-bottom: 10px;">
                    <div class="panel-title" style="font-size: 0.9rem;">🎚️ Gestor de Perfiles APE v9.0</div>
                    <span id="activeHeadersCountGen" style="font-size: 0.8em; color: #10b981; font-weight: 600;">${activeCount} activos</span>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0 0 12px 0;">
                    Sistema de perfiles P0-P5 con 154 headers HTTP organizados en 10 categorías para máxima compatibilidad.
                </p>
                
                <!-- Quick Profile Selector -->
                <div style="display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap;">
                    ${profileButtons}
                </div>

                <button class="btn" style="width: 100%; background: linear-gradient(135deg, #10b981, #059669);" 
                        onclick="if(window.ProfileManagerV9) window.ProfileManagerV9.render()">
                    <span class="icon">⚙️</span><span>Gestionar Perfiles (154 Headers)</span>
                </button>
            `;

            console.log('📦 Profile Manager colapsado');
        }

        /**
         * Selecciona perfil en modo compacto (sin expandir)
         */
        selectProfileCompact(profileId) {
            this.activeProfileId = profileId;
            localStorage.setItem('ape_active_profile', profileId);
            this.collapse(); // Re-render en modo colapsado
        }

        toggleCategory(categoryId) {
            if (this.expandedCategories.has(categoryId)) {
                this.expandedCategories.delete(categoryId);
            } else {
                this.expandedCategories.add(categoryId);
            }

            // Guardar posición de scroll del contenedor de headers
            const container = document.querySelector('.pm9-headers-container');
            const scrollPosition = container ? container.scrollTop : 0;

            this.render();

            // Restaurar posición de scroll
            requestAnimationFrame(() => {
                const newContainer = document.querySelector('.pm9-headers-container');
                if (newContainer && scrollPosition > 0) {
                    newContainer.scrollTop = scrollPosition;
                }
            });
        }

        toggleCategoryEnabled(categoryId, enabled) {
            const profile = this.config.getProfile(this.activeProfileId);
            if (!profile) return;

            const cats = profile.enabledCategories;
            const index = cats.indexOf(categoryId);

            if (enabled && index === -1) {
                cats.push(categoryId);
            } else if (!enabled && index !== -1) {
                cats.splice(index, 1);
            }

            this.config.updateProfile(this.activeProfileId, { enabledCategories: cats });

            // Guardar posición de scroll del contenedor de headers antes de re-renderizar  
            const container = document.querySelector('.pm9-headers-container');
            const scrollPosition = container ? container.scrollTop : 0;

            this.render();

            // Restaurar posición de scroll después de re-renderizar
            requestAnimationFrame(() => {
                const newContainer = document.querySelector('.pm9-headers-container');
                if (newContainer && scrollPosition > 0) {
                    newContainer.scrollTop = scrollPosition;
                }
            });
        }

        updateSetting(key, value) {
            const profile = this.config.getProfile(this.activeProfileId);
            if (!profile) return;

            // USER REQUEST: Handle Buffer Total conversion (Total = Base * 2.25)
            // if (key === 'bufferTotal') { ... } // Reverted

            // Motor de Reglas Reactivas (Reactive Engine v9.0)
            this._applyReactiveRules(profile, key, value);

            // Actualización estándar
            profile.settings[key] = value;
            this.config.updateProfile(this.activeProfileId, {
                settings: profile.settings,
                vlcopt: profile.vlcopt,
                level: profile.level,
                quality: profile.quality
            });

            // Re-renderizar si hubo cambios en cascada
            if (['bitrate', 'buffer', 'resolution', 'strategy', 'playerBuffer', 'fps', 'bufferSeconds', 'codec'].includes(key)) {
                this.render();
            } else {
                // Para cambios menores, solo actualizar métricas de Streaming Health
                this._updateStreamingHealth();
            }
        }

        /**
         * Aplica reglas de cálculo automático basadas en lógica APE v13.1 SUPREMO
         */
        /**
         * ═══════════════════════════════════════════════════════════════════════════════
         * APE v13.1 REACTIVE ENGINE - FÓRMULAS AUTOMÁTICAS
         * ═══════════════════════════════════════════════════════════════════════════════
         * 
         * RELACIÓN 4:4:1 (Buffer Base → Todo automático):
         * - Network = Buffer Base (ms)
         * - Live = Buffer Base (ms)
         * - Player = Buffer Base / 4 (ms)
         * - Total = Network + Live + Player
         * 
         * FÓRMULAS DE BITRATE:
         * - Bitrate = (Width × Height × FPS × BPP) / 1,000,000
         * - T1 = Bitrate × 1.3 (umbral mínimo)
         * - T2 = Bitrate × 1.6 (umbral óptimo)
         * 
         * BPP (Bits Per Pixel) por resolución:
         * - 8K:  0.08
         * - 4K:  0.10
         * - FHD: 0.15
         * - HD:  0.25
         * - SD:  0.30
         * ═══════════════════════════════════════════════════════════════════════════════
         */
        _applyReactiveRules(profile, key, value) {
            const s = profile.settings;
            if (!profile.vlcopt) profile.vlcopt = {};



            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 1: BITRATE → T1 y T2 (Multiplicadores Estándar v13.1)
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'bitrate') {
                s.t1 = parseFloat((value * ProfileManagerV9.THROUGHPUT_T1_MULTIPLIER).toFixed(1));
                s.t2 = parseFloat((value * ProfileManagerV9.THROUGHPUT_T2_MULTIPLIER).toFixed(1));

                // Inyectar en headers
                this.config.setHeaderOverride(profile.id, 'X-APE-BITRATE', String(value));
                this.config.setHeaderOverride(profile.id, 'X-APE-TARGET-BITRATE', String(Math.round(value * 1000)));
                this.config.setHeaderOverride(profile.id, 'X-APE-THROUGHPUT-T1', String(s.t1));
                this.config.setHeaderOverride(profile.id, 'X-APE-THROUGHPUT-T2', String(s.t2));

                // AUTO-SYNC: Bitrate-dependent headers
                this.config.setHeaderOverride(profile.id, 'X-Initial-Bitrate', String(Math.round(value * 1000000)));
                this.config.setHeaderOverride(profile.id, 'X-Max-Bitrate', String(Math.round(s.t2 * 1000000)));

                console.log(`🧠 Reactive PRO [v13.1]: Bitrate ${value}Mbps → T1:${s.t1}, T2:${s.t2}`);

                // AUTO: BW Mínimo de Prefetch = 3× Bitrate (para coherencia por perfil)
                if (this.config && this.config.updatePrefetchSetting) {
                    const minBwMbps = Math.round(value * 3);
                    this.config.updatePrefetchSetting(profile.id, 'min_bandwidth_mbps', minBwMbps);
                    console.log(`🧠 Reactive PRO [v13.1]: BW Mínimo Prefetch AUTO → ${minBwMbps} Mbps (3× ${value})`);
                }
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 2: BUFFER BASE → RELACIÓN 4:4:1 (Network:Live:Player)
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'buffer') {
                // Buffer Base en ms
                const baseMs = value;

                // Aplicar Opción B: C1 y C2 son `baseMs`. C3 es el 70% de reserva sobre C1+C2.
                const networkMs = baseMs;                    // C1
                const liveMs = baseMs;                       // C2
                // Player Buffer = (C1 + C2) + ((C1 + C2) * 0.70) = (C1 + C2) * 1.70
                const playerMs = Math.max(250, Math.round((networkMs + liveMs) * 1.70)); // C3 (mínimo 250ms)

                // Actualizar Player Buffer en settings
                s.playerBuffer = playerMs;

                // Sincronizar VLC Options (Capa 1, 2, 3)
                profile.vlcopt['network-caching'] = String(networkMs);
                profile.vlcopt['live-caching'] = String(liveMs);
                profile.vlcopt['file-caching'] = String(playerMs);

                // ✅ Sincronizar Headers de Caching (para que UI refleje lo mismo)
                this.config.setHeaderOverride(profile.id, 'X-Network-Caching', String(networkMs));
                this.config.setHeaderOverride(profile.id, 'X-Live-Caching', String(liveMs));
                this.config.setHeaderOverride(profile.id, 'X-File-Caching', String(playerMs));

                // Sincronizar Headers (ExoPlayer, Kodi)
                this.config.setHeaderOverride(profile.id, 'X-ExoPlayer-Buffer-Min', String(playerMs));
                this.config.setHeaderOverride(profile.id, 'X-Manifest-Refresh', String(playerMs));
                this.config.setHeaderOverride(profile.id, 'X-KODI-LIVE-DELAY', String(Math.floor(playerMs / 1000)));

                // Buffer Total
                const totalMs = networkMs + liveMs + playerMs;
                const totalSeconds = (totalMs / 1000).toFixed(1);

                // AUTO-SYNC: Buffer-dependent headers
                this.config.setHeaderOverride(profile.id, 'X-Buffer-Size', String(totalMs));
                this.config.setHeaderOverride(profile.id, 'X-Buffer-Target', String(playerMs));
                this.config.setHeaderOverride(profile.id, 'X-Buffer-Min', String(baseMs));
                this.config.setHeaderOverride(profile.id, 'X-Buffer-Max', String(totalMs * 4));
                this.config.setHeaderOverride(profile.id, 'X-Min-Buffer-Time', String(Math.floor(baseMs / 1000)));
                this.config.setHeaderOverride(profile.id, 'X-Max-Buffer-Time', String(Math.floor(totalMs / 1000)));

                console.log(`🧠 Reactive [v13.1]: Buffer Opción B → Network(C1):${networkMs}ms + Live(C2):${liveMs}ms + Player(C3):${playerMs}ms = Total:${totalMs}ms (${totalSeconds}s)`);

                // Validación de seguridad para 4K/8K
                if ((profile.quality === '8K' || profile.quality === '4K') && baseMs < 3000) {
                    console.warn(`⚠️ Buffer insuficiente para ${profile.quality}. Mínimo 3000ms.`);
                }

                // AUTO: Clock Jitter = 10% del Buffer Base
                const jitterMs = Math.round(baseMs * 0.10);
                profile.vlcopt['clock-jitter'] = String(jitterMs);
                console.log(`🧠 Reactive [v13.1]: Clock Jitter AUTO → ${jitterMs}ms (10% de ${baseMs}ms)`);
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 2.1: PLAYER BUFFER MANUAL → Sincronizar headers
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'playerBuffer') {
                profile.vlcopt['file-caching'] = String(value);
                this.config.setHeaderOverride(profile.id, 'X-ExoPlayer-Buffer-Min', String(value));
                this.config.setHeaderOverride(profile.id, 'X-Manifest-Refresh', String(value));
                this.config.setHeaderOverride(profile.id, 'X-KODI-LIVE-DELAY', String(Math.floor(value / 1000)));
                console.log(`🧠 Reactive [v13.1]: Player Buffer manual → ${value}ms`);
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 2.2: BUFFER BASE (S) → Convertir a MS y disparar Regla 2
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'bufferSeconds') {
                const ms = parseInt(value) * 1000;
                s.buffer = ms;
                this._applyReactiveRules(profile, 'buffer', ms);
                console.log(`🧠 Reactive [v13.1]: Buffer Base (s) → ${value}s (${ms}ms)`);

                // USER REQUEST: Sincronizar Buffer Total al Buffer Objetivo de Prefetch (en segundos)
                if (this.config && this.config.updatePrefetchSetting) {
                    const playerMs = Math.round((ms + ms) * 1.70);
                    const totalBufferSecs = Math.round((ms + ms + playerMs) / 1000);
                    this.config.updatePrefetchSetting(this.activeProfileId, 'buffer_target_seconds', totalBufferSecs);
                }
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 2.3: FPS → Disparar recalculo de Bitrate
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'fps') {
                this._applyReactiveRules(profile, 'resolution', s.resolution);
                console.log(`🧠 Reactive [v13.1]: FPS manual → ${value} fps`);
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 3: RESOLUCIÓN → LEVEL, QUALITY, BITRATE AUTO-CALCULADO
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'resolution') {
                const res = String(value);
                const parts = res.toLowerCase().split('x');
                let width = 1920, height = 1080;

                if (parts.length === 2) {
                    width = parseInt(parts[0]) || 1920;
                    height = parseInt(parts[1]) || 1080;
                }

                const pixels = width * height;

                // Determinar Quality y Level
                if (pixels >= 33000000) {          // 7680×4320 = 8K
                    profile.level = 5;
                    profile.quality = "8K";
                } else if (pixels >= 8000000) {    // 3840×2160 = 4K
                    profile.level = 4;
                    profile.quality = "4K";
                } else if (pixels >= 2000000) {    // 1920×1080 = FHD
                    profile.level = 3;
                    profile.quality = "FHD";
                } else if (pixels >= 900000) {     // 1280×720 = HD
                    profile.level = 2;
                    profile.quality = "HD";
                } else {                           // SD
                    profile.level = 1;
                    profile.quality = "SD";
                }

                // Caso especial P0 ULTRA
                if (profile.id === 'P0') {
                    profile.level = 6;
                    profile.quality = "ULTRA";
                }

                // Determinar resLabel técnica para el BPP Key (Basado en resolución física real)
                let resLabel = "FHD";
                if (pixels >= 33000000) resLabel = "8K";       // 8K
                else if (pixels >= 8000000) resLabel = "UHD";   // 4K
                else if (pixels >= 2000000) resLabel = "FHD";   // 1080p
                else if (pixels >= 900000) resLabel = "HD";     // 720p
                else resLabel = "SD";                           // 480p

                // AUTO-CALCULAR BITRATE (QUIRÚRGICO v13.1 PRO)
                // ⚠️ CRÍTICO: BUFFER_BASE NO AFECTA BITRATE
                // Fórmula: (Pixels × FPS × BPP_CODEC × STRATEGY_COMPRESSION) / 1,000,000
                // Solo afectan: Resolución, FPS, Códec, Estrategia
                // ═══════════════════════════════════════════════════════════════════

                const codec = s.codec || (pixels >= 2000000 ? 'H265' : 'H264');
                const bppKey = `${codec}_${resLabel}`;
                const bpp = ProfileManagerV9.BITS_PER_PIXEL[bppKey] || 0.15;
                const strategy = ProfileManagerV9.STRATEGY_CONFIG[s.strategy] || ProfileManagerV9.STRATEGY_CONFIG['balanced'];

                // ⚠️ VALIDACIÓN CRÍTICA DE FPS (no usar fallback silencioso)
                const fps = parseInt(s.fps) || 60;
                if (!s.fps) {
                    console.warn(`⚠️ FPS no configurado en perfil ${profile.id}, usando default 60fps`);
                }

                const bitrateBase = (pixels * fps * bpp) / 1000000;
                const bitrateFinal = parseFloat((bitrateBase * strategy.compressionMultiplier).toFixed(1));

                // Actualizar bitrate y disparar cálculo de T1/T2 (Regla 1)
                s.bitrate = bitrateFinal;

                // Inyectar headers de codec y resolución
                this.config.setHeaderOverride(profile.id, 'X-APE-CODEC', codec);
                this.config.setHeaderOverride(profile.id, 'X-APE-RESOLUTION', res);
                this.config.setHeaderOverride(profile.id, 'X-APE-FPS', String(fps));
                this.config.setHeaderOverride(profile.id, 'X-Screen-Resolution', res);

                // AUTO-SYNC: Resolution-dependent headers
                this.config.setHeaderOverride(profile.id, 'X-Max-Resolution', res);
                this.config.setHeaderOverride(profile.id, 'X-Frame-Rates', `${fps},${fps <= 30 ? '24,25' : fps <= 60 ? '24,25,30,50' : '24,25,30,50,60'}`);

                // AUTO-SYNC: Netflix HDR & Color (Group 1) and OTT Navigator (Group 6) and Playback Priority (Group 4)
                const c_map = ProfileManagerV9.QUALITY_MAPS.hdr_color[profile.quality] || ProfileManagerV9.QUALITY_MAPS.hdr_color['FHD'];
                const o_map = ProfileManagerV9.QUALITY_MAPS.ott_navigator[profile.quality] || ProfileManagerV9.QUALITY_MAPS.ott_navigator['FHD'];

                this.config.setHeaderOverride(profile.id, 'X-HDR-Support', c_map.hdr);
                this.config.setHeaderOverride(profile.id, 'X-Color-Space', c_map.space);
                this.config.setHeaderOverride(profile.id, 'X-Dynamic-Range', c_map.d_range);
                this.config.setHeaderOverride(profile.id, 'X-HDR-Transfer-Function', c_map.fn);
                this.config.setHeaderOverride(profile.id, 'X-Color-Primaries', c_map.prim);
                this.config.setHeaderOverride(profile.id, 'X-Matrix-Coefficients', c_map.coef);
                this.config.setHeaderOverride(profile.id, 'X-Chroma-Subsampling', c_map.subsamp);
                this.config.setHeaderOverride(profile.id, 'X-Pixel-Format', (codec === 'H265' || codec === 'AV1') ? c_map.fmt_hevc : c_map.fmt_h264);
                this.config.setHeaderOverride(profile.id, 'X-Compression-Level', c_map.comp);
                this.config.setHeaderOverride(profile.id, 'X-Sharpen-Sigma', c_map.sigma);
                this.config.setHeaderOverride(profile.id, 'X-Rate-Control', c_map.rate);
                this.config.setHeaderOverride(profile.id, 'X-Entropy-Coding', c_map.entropy);

                this.config.setHeaderOverride(profile.id, 'X-Player-Type', o_map.player);
                this.config.setHeaderOverride(profile.id, 'X-Audio-Track-Selection', o_map.audio);
                this.config.setHeaderOverride(profile.id, 'X-Buffer-Strategy', o_map.buf);
                this.config.setHeaderOverride(profile.id, 'X-Request-Priority', o_map.req_prio);

                this._applyReactiveRules(profile, 'bitrate', bitrateFinal);

                console.log(`🧠 Reactive PRO [v13.1]: ${res} (${resLabel}) @ ${fps}fps | Codec:${codec} (BPP:${bpp}) × Strat:${strategy.compressionMultiplier} → ${bitrateFinal}Mbps`);
                console.log(`📊 Validación: Buffer=${s.buffer}ms NO afecta bitrate (solo RAM/Prefetch)`);
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 4: STRATEGY → Sincronizar pre-fetch y disparar recalculo T1/T2
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'strategy') {
                const strat = ProfileManagerV9.STRATEGY_CONFIG[value] || ProfileManagerV9.STRATEGY_CONFIG['balanced'];

                // Actualizar headers de QoS basados en estrategia
                this.config.setHeaderOverride(profile.id, 'X-APE-STRATEGY', value);
                this.config.setHeaderOverride(profile.id, 'X-APE-Prefetch-Segments', String(strat.prefetchSegments));
                this.config.setHeaderOverride(profile.id, 'X-APE-Quality-Threshold', String(strat.qualityThreshold));
                this.config.setHeaderOverride(profile.id, 'X-Segment-Duration', String(ProfileManagerV9.SEGMENT_DURATION));
                this.config.setHeaderOverride(profile.id, 'X-Prefetch-Enabled', 'true');

                // AUTO-SYNC Netflix Quality Groups (Strategy-dependent)
                const af_map = ProfileManagerV9.QUALITY_MAPS.anti_freeze[value] || ProfileManagerV9.QUALITY_MAPS.anti_freeze['balanced'];
                const t_map = ProfileManagerV9.QUALITY_MAPS.timeouts[value] || ProfileManagerV9.QUALITY_MAPS.timeouts['balanced'];
                const abr_map = ProfileManagerV9.QUALITY_MAPS.abr[value] || ProfileManagerV9.QUALITY_MAPS.abr['balanced'];

                this.config.setHeaderOverride(profile.id, 'X-Reconnect-On-Error', af_map.reconnect);
                this.config.setHeaderOverride(profile.id, 'X-Max-Reconnect-Attempts', af_map.max);
                this.config.setHeaderOverride(profile.id, 'X-Reconnect-Delay-Ms', af_map.delay);
                this.config.setHeaderOverride(profile.id, 'X-Buffer-Underrun-Strategy', af_map.underrun);
                this.config.setHeaderOverride(profile.id, 'X-Seamless-Failover', af_map.failover);

                this.config.setHeaderOverride(profile.id, 'X-Retry-Count', t_map.retry);
                this.config.setHeaderOverride(profile.id, 'X-Retry-Delay-Ms', t_map.r_delay);
                this.config.setHeaderOverride(profile.id, 'X-Connection-Timeout-Ms', t_map.conn);
                this.config.setHeaderOverride(profile.id, 'X-Read-Timeout-Ms', t_map.read);

                this.config.setHeaderOverride(profile.id, 'X-Bandwidth-Preference', abr_map.pref);
                this.config.setHeaderOverride(profile.id, 'X-BW-Estimation-Window', abr_map.win);
                this.config.setHeaderOverride(profile.id, 'X-BW-Confidence-Threshold', abr_map.conf);
                this.config.setHeaderOverride(profile.id, 'X-BW-Smooth-Factor', abr_map.smooth);
                this.config.setHeaderOverride(profile.id, 'X-Packet-Loss-Monitor', abr_map.p_loss);
                this.config.setHeaderOverride(profile.id, 'X-RTT-Monitoring', abr_map.rtt);
                this.config.setHeaderOverride(profile.id, 'X-Congestion-Detect', abr_map.cong);

                // Disparar recalculo de Bitrate (Regla 3) para actualizar Bitrate y T1/T2 en cascada
                this._applyReactiveRules(profile, 'resolution', s.resolution);

                console.log(`🧠 Reactive PRO [v13.1]: Strategy changed to ${value} → ${strat.description}`);
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 5: CODEC → Single Source of Truth para TODOS los headers de codec
            // ═══════════════════════════════════════════════════════════════════════
            if (key === 'codec') {
                // Mapa completo de nomenclaturas por codec
                const CODEC_NOMENCLATURE = {
                    'AV1': { names: ['av1'], profileTag: 'main-12,main-10,main', tier: 'HIGH', levels: '6.1,6.0,5.1' },
                    'H265': { names: ['hevc', 'h265', 'h.265'], profileTag: 'main-12,main-10', tier: 'HIGH', levels: '6.1,6.0,5.1,5.0,4.1' },
                    'VP9': { names: ['vp9'], profileTag: 'profile2,profile0', tier: 'N/A', levels: 'N/A' },
                    'H264': { names: ['h264', 'avc', 'h.264'], profileTag: 'high', tier: 'HIGH', levels: '5.1,5.0,4.2,4.1' },
                    'MPEG2': { names: ['mpeg2', 'mpeg-2', 'h262'], profileTag: 'main', tier: 'HIGH', levels: 'high' }
                };

                // Orden de calidad (de mayor a menor)
                const QUALITY_ORDER = ['AV1', 'H265', 'VP9', 'H264', 'MPEG2'];

                const selected = value.toUpperCase();
                const selectedIdx = QUALITY_ORDER.indexOf(selected === 'HEVC' ? 'H265' : selected);
                const normalizedKey = selected === 'HEVC' ? 'H265' : selected;

                // Construir cadena de prioridad: seleccionado + fallbacks en orden de calidad
                const priorityChain = [];
                // 1. Agregar el seleccionado primero (todas sus nomenclaturas)
                if (CODEC_NOMENCLATURE[normalizedKey]) {
                    priorityChain.push(...CODEC_NOMENCLATURE[normalizedKey].names);
                }
                // 2. Agregar los demás en orden descendente de calidad
                for (let i = selectedIdx + 1; i < QUALITY_ORDER.length; i++) {
                    const fallbackKey = QUALITY_ORDER[i];
                    if (fallbackKey !== normalizedKey && CODEC_NOMENCLATURE[fallbackKey]) {
                        priorityChain.push(CODEC_NOMENCLATURE[fallbackKey].names[0]); // solo el nombre principal
                    }
                }

                // Codec principal y fallback
                const primaryName = CODEC_NOMENCLATURE[normalizedKey]?.names[0] || 'hevc';
                const fallbackIdx = selectedIdx + 1 < QUALITY_ORDER.length ? selectedIdx + 1 : selectedIdx;
                const fallbackName = CODEC_NOMENCLATURE[QUALITY_ORDER[fallbackIdx]]?.names[0] || 'h264';

                // Construir Quality-Preference con nomenclaturas completas
                const selectedNom = CODEC_NOMENCLATURE[normalizedKey];
                const qualityParts = [];
                // Primary codec con todas sus alias
                if (selectedNom) {
                    selectedNom.names.forEach(name => {
                        qualityParts.push(`codec-${name},profile-${selectedNom.profileTag},tier-${selectedNom.tier.toLowerCase()}`);
                    });
                }
                // Fallback codec
                const fallbackNom = CODEC_NOMENCLATURE[QUALITY_ORDER[fallbackIdx]];
                if (fallbackNom && QUALITY_ORDER[fallbackIdx] !== normalizedKey) {
                    qualityParts.push(`codec-${fallbackNom.names[0]},${fallbackNom.profileTag},${fallbackNom.tier.toLowerCase()}`);
                }

                // ✅ Actualizar TODOS los headers de codec
                this.config.setHeaderOverride(profile.id, 'X-APE-CODEC', primaryName.toUpperCase());
                this.config.setHeaderOverride(profile.id, 'X-Video-Codecs', priorityChain.join(','));
                this.config.setHeaderOverride(profile.id, 'X-Quality-Preference', qualityParts.join(';'));

                // HEVC-specific headers (solo si aplica)
                if (selectedNom) {
                    this.config.setHeaderOverride(profile.id, 'X-HEVC-Profile', selectedNom.profileTag.toUpperCase());
                    this.config.setHeaderOverride(profile.id, 'X-HEVC-Tier', selectedNom.tier);
                    this.config.setHeaderOverride(profile.id, 'X-HEVC-Level', selectedNom.levels);
                    this.config.setHeaderOverride(profile.id, 'X-Video-Profile', selectedNom.profileTag);
                }

                // ✅ Sync quality_levels.primary
                if (!profile.quality_levels) profile.quality_levels = {};
                if (!profile.quality_levels.primary) profile.quality_levels.primary = {};
                profile.quality_levels.primary.codec = primaryName.toUpperCase();
                profile.quality_levels.primary.profile = selectedNom
                    ? selectedNom.profileTag.toUpperCase()
                    : 'MAIN-12,MAIN-10';

                // ✅ Sync X-Codec-Support (todas las alias del seleccionado)
                if (selectedNom) {
                    this.config.setHeaderOverride(profile.id, 'X-Codec-Support', selectedNom.names.join(','));
                }

                // Recalcular bitrate/T1/T2 por el cambio de codec
                this._applyReactiveRules(profile, 'resolution', s.resolution);

                // AUTO-SYNC: Color depth based on codec
                const colorDepth = (normalizedKey === 'AV1' || normalizedKey === 'H265') ? '12bit' : '10bit';
                this.config.setHeaderOverride(profile.id, 'X-Color-Depth', colorDepth);

                console.log(`🧠 Reactive [v13.1]: Codec ${value} → primary:${primaryName}, priority:[${priorityChain.join(',')}], fallback:${fallbackName}, quality_levels.primary.codec:${primaryName.toUpperCase()}, color:${colorDepth}`);
            }
        }

        /**
         * Actualiza un parámetro VLC específico del perfil activo
         */
        updateVlcOpt(key, value) {
            const profile = this.config.getProfile(this.activeProfileId);
            if (!profile) return;

            if (!profile.vlcopt) profile.vlcopt = {};
            profile.vlcopt[key] = String(value);

            this.config.updateProfile(this.activeProfileId, {
                vlcopt: profile.vlcopt
            });

            console.log(`🎛️ VLC Opt: ${key} -> ${value}`);
        }

        updateManifestSetting(key, value) {
            const updates = {};

            // 🔄 Si es 'shift' (horas), convertir a jwtExpiration (días con _DAYS)
            if (key === 'shift') {
                const hours = parseInt(value, 10);
                if (!isNaN(hours) && hours > 0) {
                    const days = Math.round(hours / 24);
                    updates['shift'] = value; // Guardar el valor original en horas
                    updates['jwtExpiration'] = `${days}_DAYS`; // Formato final
                    console.log(`🔄 Shift ${hours}h → ${days}_DAYS`);

                    // Actualizar el campo JWT Expiration en el UI si existe
                    const jwtInput = document.querySelector('input[value*="_DAYS"]');
                    if (jwtInput) {
                        jwtInput.value = `${days}_DAYS`;
                    }

                    this.config.updateManifestConfig(updates);
                    return;
                }
            }

            updates[key] = value;
            this.config.updateManifestConfig(updates);
        }

        toggleManifestDropdown() {
            const content = document.getElementById('pm9_manifest_content');
            const toggle = document.getElementById('pm9_manifest_toggle');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggle.textContent = '▼';
            } else {
                content.style.display = 'none';
                toggle.textContent = '▶';
            }
        }

        updateHeaderValue(headerName, value) {
            this.config.setHeaderOverride(this.activeProfileId, headerName, value);

            // ✅ Sync bidireccional: si cambian headers de caching, actualizar vlcopt
            const profile = this.config.getProfile(this.activeProfileId);
            if (profile) {
                if (!profile.vlcopt) profile.vlcopt = {};
                const cachingMap = {
                    'X-Network-Caching': 'network-caching',
                    'X-Live-Caching': 'live-caching',
                    'X-File-Caching': 'file-caching'
                };
                if (cachingMap[headerName]) {
                    profile.vlcopt[cachingMap[headerName]] = String(value);
                    this.config.updateProfile(this.activeProfileId, { vlcopt: profile.vlcopt });
                    console.log(`🔄 Sync Header→VLC: ${headerName}=${value} → vlcopt[${cachingMap[headerName]}]=${value}`);
                }
            }
        }

        createNewProfile() {
            const newId = prompt('ID del nuevo perfil (ej: CUSTOM1)');
            if (newId && newId.trim()) {
                if (this.config.createProfile(newId.trim().toUpperCase())) {
                    this.activeProfileId = newId.trim().toUpperCase();
                    this.render();
                } else {
                    alert('El perfil ya existe');
                }
            }
        }

        duplicateProfile() {
            const newId = prompt('ID del perfil duplicado');
            if (newId && newId.trim()) {
                if (this.config.duplicateProfile(this.activeProfileId, newId.trim().toUpperCase())) {
                    this.activeProfileId = newId.trim().toUpperCase();
                    this.render();
                } else {
                    alert('Error al duplicar');
                }
            }
        }

        deleteProfile() {
            if (['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].includes(this.activeProfileId)) {
                alert('No se pueden eliminar perfiles por defecto');
                return;
            }
            if (confirm(`¿Eliminar perfil ${this.activeProfileId}?`)) {
                this.config.deleteProfile(this.activeProfileId);
                this.activeProfileId = 'P3';
                this.render();
            }
        }

        resetProfile() {
            if (confirm(`¿Restaurar ${this.activeProfileId} a valores por defecto?`)) {
                this.config.resetProfile(this.activeProfileId);
                this.render();
            }
        }

        /**
         * ═══════════════════════════════════════════════════════════════
         * 📤 IMPORTAR PLANTILLA JSON → Perfil Activo
         * ═══════════════════════════════════════════════════════════════
         * Abre un file picker, lee el JSON, y carga los headers
         * y settings al perfil activo.
         * 
         * Formato esperado del JSON:
         * {
         *   "headers": { "User-Agent": "...", "Accept": "...", ... },
         *   "settings": { "resolution": "...", "buffer": 30000, ... },
         *   "vlcopt": { "network-caching": "60000", ... }
         * }
         * 
         * También acepta formato plano (solo headers):
         * { "User-Agent": "...", "Accept": "...", ... }
         */
        importTemplate() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.txt';
            input.style.display = 'none';
            document.body.appendChild(input);

            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const profileId = this.activeProfileId;
                    let headersLoaded = 0;
                    let settingsLoaded = 0;

                    // Detectar formato: estructurado vs plano
                    const isStructured = data.headers || data.settings || data.vlcopt;
                    const headers = isStructured ? (data.headers || {}) : data;
                    const settings = isStructured ? (data.settings || {}) : {};
                    const vlcopt = isStructured ? (data.vlcopt || {}) : {};
                    const qualityLevels = data.quality_levels || null;

                    // 1) Cargar headers al perfil (batch: directo a headerOverrides)
                    const profile = this.config.getProfile(profileId);
                    if (!profile) throw new Error(`Perfil ${profileId} no encontrado`);
                    if (!profile.headerOverrides) profile.headerOverrides = {};

                    Object.entries(headers).forEach(([headerName, value]) => {
                        if (typeof value === 'string' || typeof value === 'number') {
                            profile.headerOverrides[headerName] = String(value);
                            headersLoaded++;
                        }
                    });
                    // 2) Cargar settings — ACEPTAR TODOS los keys sin filtro
                    if (profile && Object.keys(settings).length > 0) {
                        if (!profile.settings) profile.settings = {};
                        Object.entries(settings).forEach(([key, value]) => {
                            profile.settings[key] = value;
                            settingsLoaded++;
                        });
                    }

                    // 3) Cargar vlcopt
                    if (profile && Object.keys(vlcopt).length > 0) {
                        Object.entries(vlcopt).forEach(([key, value]) => {
                            if (!profile.vlcopt) profile.vlcopt = {};
                            profile.vlcopt[key] = String(value);
                            settingsLoaded++;
                        });
                    }

                    // 4) Cargar quality_levels
                    if (profile && qualityLevels) {
                        profile.quality_levels = qualityLevels;
                        settingsLoaded++;
                    }

                    // 5) Guardar y re-renderizar
                    this.config.save();
                    this.render();

                    console.log(`✅ Plantilla cargada en ${profileId}: ${headersLoaded} headers, ${settingsLoaded} settings`);

                    // Feedback visual
                    const actionsBar = document.querySelector('.pm9-actions');
                    if (actionsBar) {
                        const feedback = document.createElement('div');
                        feedback.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 20px;border-radius:10px;font-weight:600;z-index:99999;font-size:14px;box-shadow:0 4px 20px rgba(16,185,129,0.4);animation:fadeInOut 3s forwards;';
                        feedback.textContent = `✅ Plantilla "${file.name}" cargada → ${profileId} (${headersLoaded} headers, ${settingsLoaded} settings)`;
                        document.body.appendChild(feedback);
                        setTimeout(() => feedback.remove(), 3000);
                    }

                } catch (err) {
                    console.error('❌ Error al importar plantilla:', err);
                    alert(`❌ Error al leer la plantilla:\n${err.message}\n\nAsegúrate de que sea un JSON válido.`);
                } finally {
                    input.remove();
                }
            });

            input.click();
        }

        /**
         * 📥 EXPORTAR perfil activo como JSON
         */
        exportTemplate() {
            const profileId = this.activeProfileId;
            const profile = this.config.getProfile(profileId);
            if (!profile) return;

            // ✅ Sync vlcopt desde headers antes de exportar
            if (!profile.vlcopt) profile.vlcopt = {};
            const cachingSync = {
                'X-Network-Caching': 'network-caching',
                'X-Live-Caching': 'live-caching',
                'X-File-Caching': 'file-caching'
            };
            Object.entries(cachingSync).forEach(([header, vlcKey]) => {
                const val = this.config.getHeaderValue(profileId, header);
                if (val && !isNaN(parseInt(val, 10))) {
                    profile.vlcopt[vlcKey] = String(parseInt(val, 10));
                }
            });
            this.config.updateProfile(profileId, { vlcopt: profile.vlcopt });
            console.log(`🔄 Export sync: vlcopt actualizado desde headers`);

            // Recopilar TODOS los headers: categorías + overrides custom
            const categories = this.config.getCategories();
            const headers = {};
            // 1) Headers de categorías (con override si existe)
            Object.values(categories).forEach(cat => {
                cat.headers.forEach(headerName => {
                    headers[headerName] = this.config.getHeaderValue(profileId, headerName);
                });
            });
            // 2) Headers custom en overrides que NO están en categorías
            if (profile.headerOverrides) {
                Object.entries(profile.headerOverrides).forEach(([key, val]) => {
                    if (!headers[key]) headers[key] = val;
                });
            }

            const exportData = {
                _meta: {
                    profile: profileId,
                    name: profile.name,
                    exported: new Date().toISOString(),
                    version: 'APE_v9.0'
                },
                headers: headers,
                settings: { ...profile.settings },
                vlcopt: { ...(profile.vlcopt || {}) },
                ...(profile.quality_levels ? { quality_levels: profile.quality_levels } : {})
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `APE_${profileId}_${profile.name}_template.json`;
            a.click();
            URL.revokeObjectURL(url);

            console.log(`📥 Perfil ${profileId} exportado como JSON`);
        }

        saveAndClose() {
            this.config.save();
            console.log('✅ Perfil guardado:', this.activeProfileId);

            // Update header count in UI
            const countEl = document.getElementById('activeHeadersCountGen');
            if (countEl) {
                countEl.textContent = `${this.config.countActiveHeaders(this.activeProfileId)} activos`;
            }
        }

        /**
         * Obtiene el perfil activo para generación
         */
        getActiveProfile() {
            return this.config.getProfile(this.activeProfileId);
        }

        /**
         * ✅ Obtiene el ID del perfil activo actual (P0-P5)
         * Usado por saveGeneratorState() para persistir la selección
         */
        getCurrentProfile() {
            return this.activeProfileId || 'P3';
        }

        /**
         * Obtiene headers del perfil activo
         */
        getActiveHeaders() {
            return this.config.getEnabledHeaders(this.activeProfileId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPOSICIÓN GLOBAL
    // ═══════════════════════════════════════════════════════════════════════
    const instance = new ProfileManagerV9();
    window.ProfileManagerV9 = instance;

    // También exponer en app si existe
    if (window.app) {
        window.app.profileManager = instance;
        window.app.openProfileManager = function () {
            instance.render();
        };
    }

    console.log('%c🎚️ Profile Manager v9.0 Listo', 'color: #10b981; font-weight: bold;');

})();
