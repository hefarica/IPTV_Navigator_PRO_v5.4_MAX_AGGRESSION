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
                description: 'Pre-carga máxima, prioriza calidad sobre latencia. La estrategia NO recorta bitrate: el bitrate lo fija la resolución y el codec'
            },
            'aggressive': {
                compressionMultiplier: 0.26,
                prefetchSegments: 8,
                qualityThreshold: 0.90,
                switchUpThreshold: 1.15,
                switchDownThreshold: 0.65,
                description: 'Pre-carga alta, balance calidad/latencia. No recorta bitrate'
            },
            'balanced': {
                compressionMultiplier: 0.22,
                prefetchSegments: 6,
                qualityThreshold: 0.85,
                switchUpThreshold: 1.1,
                switchDownThreshold: 0.7,
                description: 'Balance equilibrado. No recorta bitrate'
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

        // Contrato de cálculo (P1 como referencia):
        // precedentes = entradas; derivados = nunca se leen como entrada.
        static PRECEDENCE_FIELDS = Object.freeze(['resolution', 'fps', 'codec', 'buffer']);
        static DERIVED_FIELDS = Object.freeze([
            'bitrate', 'bitrate_floor_mbps', 't1', 't2',
            'buffer_c1_ms', 'buffer_c2_ms', 'playerBuffer', 'buffer_total_ms',
            'jitter_max_ms', 'headersCount', 'ram_estimate_mb'
        ]);

        // BITRATE FLOOR — piso mínimo absoluto por quality (Mbps).
        // Distinto de bitrate_range_mbps.min (rango óptimo): el floor es el guardarail
        // inferior bajo el cual variantes HLS son inaceptables (player no debe elegirlas).
        // Origen SSOT: Profile Manager Reactive Rule 1.1 → Bridge → Generator.
        static BITRATE_FLOOR_TABLE = Object.freeze({
            'ULTRA': 25, '8K': 20, '4K': 14, 'FHD': 5, 'HD': 2, 'SD': 1
        });

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

            // T6b: cargar user overrides para badges 🛡 LAB / 🔧 Manual
            this._loadUserOverrides();

            // Backfill bitrate_floor_mbps en perfiles persistidos sin el campo (cross-session safe).
            // Garantiza que el bridge encuentre el valor antes del primer Reactive Rule trigger.
            try {
                const all = (typeof this.config.getAllProfiles === 'function')
                    ? this.config.getAllProfiles() : (this.config.profiles || {});
                Object.values(all).forEach(p => {
                    if (p && p.settings && p.settings.bitrate_floor_mbps == null) {
                        p.settings.bitrate_floor_mbps = this._computeBitrateFloor(p);
                    }
                });
            } catch (e) {
                console.warn('⚠️ Backfill bitrate_floor_mbps falló (no bloqueante):', e?.message);
            }

            // Load saved active profile
            const saved = localStorage.getItem('ape_active_profile');
            if (saved && this.config.getProfile(saved)) {
                this.activeProfileId = saved;
            }

            console.log('%c🎚️ Profile Manager v9.0 Inicializado', 'color: #10b981; font-weight: bold;');
            console.log(`   Perfil activo: ${this.activeProfileId}`);
        }

        // ── HELPERS SSOT desde LAB (T6b) ──────────────────────────────────
        // Doctrina: el LAB Excel es la fuente única de verdad. El UI solo muestra
        // lo que existe en this.config.profiles[Pn]. Si el LAB no tiene un campo,
        // el UI muestra '' (vacío) — NO 0, NO 60, NO defaults forzados.
        /**
         * Devuelve el valor LAB tal cual o vacío sin forzar default.
         * @param {*} v - valor del LAB (undefined/null/string/number)
         * @returns {string|number} - valor para inyectar en input
         */
        _labVal(v) {
            if (v === undefined || v === null) return '';
            if (v === 'null' || v === 'undefined') return '';
            return v;
        }
        /**
         * Coerce a number sin caer a default. NaN devuelve null
         * (que el setter ignora en lugar de sobreescribir LAB con basura).
         */
        _labNum(s) {
            if (s === undefined || s === null || s === '') return null;
            const n = Number(String(s).replace(',', '.'));
            return isNaN(n) ? null : n;
        }
        /**
         * Devuelve el bitrate floor (Mbps) del perfil.
         * Prioridad: settings.bitrate_floor_mbps (LAB) → BITRATE_FLOOR_TABLE por quality → 5.
         * No persiste; solo computa. La persistencia ocurre en Reactive Rule 1.1.
         */
        _computeBitrateFloor(profile) {
            const s = profile?.settings || {};
            const q = String(profile?.quality || 'FHD').toUpperCase();
            const fallback = ProfileManagerV9.BITRATE_FLOOR_TABLE[q] || 5;

            // PRIORIDAD 0 — el suelo del LAB. settings.bandwidth_floor está en bps y es el minimo
            // con el que el perfil ARRANCA. Es dato del laboratorio, no una tabla de la UI.
            const labFloorBps = Number(s.bandwidth_floor);
            const labFloorMbps = (isFinite(labFloorBps) && labFloorBps > 0) ? labFloorBps / 1e6 : null;

            const configured = (s.bitrate_floor_mbps != null && !isNaN(s.bitrate_floor_mbps))
                ? Number(s.bitrate_floor_mbps)
                : (labFloorMbps != null ? labFloorMbps : fallback);

            const bitrate = Number(s.bitrate);

            // El piso NUNCA puede superar el bitrate objetivo. PERO un bitrate por debajo de 1 Mbps no
            // es un techo: es un dato roto. Con bitrate=0.3 el recorte al 80% daba 0.24, que la UI
            // mostraba como "BITRATE FLOOR (MBPS) 0,24" — seis veces por debajo del suelo mas bajo del
            // LAB (P5 = 1.5 Mbps) e inservible incluso para SD. Si el bitrate no es utilizable, NO se
            // recorta contra el: manda el suelo del LAB y, si tampoco lo hay, la tabla de calidad.
            const bitrateUtil = (isFinite(bitrate) && bitrate >= 1) ? bitrate : null;

            if (bitrateUtil) {
                const maxFloor = Math.max(0.1, bitrateUtil * 0.8);
                let floor = configured;
                if (floor > maxFloor) {
                    floor = Math.min(fallback, maxFloor);
                }
                return Number(Math.max(0.1, Math.min(floor, maxFloor)).toFixed(2));
            }

            // Sin bitrate utilizable: se devuelve el suelo del LAB o el de la tabla, con un minimo
            // absoluto de 1 Mbps. Nunca 0,24.
            const base = (labFloorMbps != null) ? labFloorMbps : fallback;
            return Number(Math.max(1, base).toFixed(2));
        }

        /**
         * Calibración mínima 720p: si el target está por debajo de 2 Mbps,
         * se eleva al doble (nunca por debajo de 2 Mbps). No toca codec/res/fps.
         */
        _calibrateHdBase(profile) {
            const s = profile?.settings || {};
            const res = String(s.resolution || '');
            const quality = String(profile?.quality || '').toUpperCase();
            const isHd = /1280x720/i.test(res) || quality === 'HD';
            let bitrate = Number(s.bitrate);
            if (!isFinite(bitrate) || bitrate <= 0) return 0;
            if (isHd && bitrate < 2.0) {
                bitrate = Math.max(2.0, bitrate * 2);
                s.bitrate = parseFloat(bitrate.toFixed(1));
            }
            return Number(s.bitrate) || bitrate;
        }

        /** BPP base por resolución (referencia de P1: 4K AV1 → 40 Mbps). */
        _bppFor(width, height) {
            if (width >= 7680 || height >= 4320) return 0.08;
            if (width >= 3840 || height >= 2160) return 0.10;
            if (width >= 1920 || height >= 1080) return 0.15;
            if (width >= 1280 || height >= 720) return 0.25;
            return 0.30;
        }

        _codecFactor(codec) {
            const c = String(codec || '').toUpperCase();
            if (c.includes('AV1')) return 0.80;
            if (c.includes('H265') || c.includes('HEVC')) return 0.85;
            if (c.includes('VP9')) return 0.90;
            if (c.includes('H264') || c.includes('AVC')) return 1.00;
            return 0.90;
        }

        /**
         * Motor único de cálculo. SOLO escribe campos derivados.
         * Precedencia: resolution, fps, codec, buffer base.
         * Derivados: bitrate, floor, t1, t2, playerBuffer, total, jitterMax,
         * headersCount y RAM. Idempotente: ejecutarlo N veces da el mismo result.
         * NO toca codec, resolution, fps ni el buffer base.
         */
        _applyDerivedProfile(profile) {
            if (!profile || !profile.settings) return null;
            const s = profile.settings;
            const m = String(s.resolution || '').match(/(\d{3,5})\s*[xX]\s*(\d{3,5})/);
            if (!m) return null;
            const width = parseInt(m[1], 10);
            const height = parseInt(m[2], 10);
            const fps = Number(s.fps) > 0 ? Number(s.fps) : 30;
            const baseMs = Number(s.buffer) > 0 ? Number(s.buffer) : 10000;

            // El LAB calibra el bitrate. Solo se deriva si el perfil no lo trae.
            const configuredBitrate = Number(s.bitrate);
            const calculatedBitrate = Math.max(0.1, Math.round(
                (width * height * fps * this._bppFor(width, height) * this._codecFactor(s.codec)) / 1e6
            * 10) / 10);
            const bitrate = configuredBitrate > 0 ? configuredBitrate : calculatedBitrate;
            const configuredFloor = Number(s.bitrate_floor_mbps);
            const floor = configuredFloor > 0 && configuredFloor <= bitrate
                ? configuredFloor
                : Math.max(0.1, Math.round(bitrate * 0.5 * 100) / 100);
            const t1 = parseFloat((bitrate * ProfileManagerV9.THROUGHPUT_T1_MULTIPLIER).toFixed(1));
            const t2 = parseFloat((bitrate * ProfileManagerV9.THROUGHPUT_T2_MULTIPLIER).toFixed(1));
            const player = Math.max(250, Math.round(baseMs * (4 / 3)));
            const total = (baseMs * 2) + player;
            const jitterMax = Math.max(0, Math.round(player * 0.8));
            const headers = Math.min(200, Math.max(1, Math.round(Number(s.headersCount) || 200)));
            const ramMb = Number(((total / 1000) * (bitrate / 8)).toFixed(1));

            s.bitrate = bitrate;
            s.bitrate_floor_mbps = floor;
            s.t1 = t1;
            s.t2 = t2;
            s.buffer_c1_ms = baseMs;
            s.buffer_c2_ms = baseMs;
            s.playerBuffer = player;
            s.buffer_total_ms = total;
            s.jitter_max_ms = jitterMax;
            s.headersCount = headers;
            s.ram_estimate_mb = ramMb;

            const set = (k, v) => this.config.setHeaderOverride(profile.id, k, String(v));
            set('X-APE-BITRATE', bitrate);
            set('X-APE-TARGET-BITRATE', Math.round(bitrate * 1000));
            set('X-APE-BITRATE-FLOOR', floor);
            set('X-Min-Bitrate', Math.round(floor * 1000000));
            set('X-APE-THROUGHPUT-T1', t1);
            set('X-APE-THROUGHPUT-T2', t2);
            set('X-Network-Caching', baseMs);
            set('X-Live-Caching', baseMs);
            set('X-Buffer-Size', total);
            set('X-Buffer-Target', player);
            set('X-Buffer-Min', baseMs);
            set('X-Buffer-Max', total * 4);
            set('X-Min-Buffer-Time', Math.floor(baseMs / 1000));
            set('X-Max-Buffer-Time', Math.floor(total / 1000));
            this._syncLabDerived(profile, {width, height, fps, baseMs, player, total, bitrate, floor, t1, t2});
            return {bitrate, floor, t1, t2, player, total, jitterMax, headers, ramMb};
        }

        /**
         * Hereda los precedentes del LAB a las secciones derivadas.
         * Solo capacidad/caché/buffer/bitrate/resolución/fps.
         * NO toca códec, HDR, color, DRM, seguridad ni identidad.
         */
        _syncLabDerived(profile, c) {
            const s = profile.settings || {};
            const b = Number(c.bitrate);
            const base = Number(c.baseMs);
            const player = Number(c.player);
            const total = Number(c.total);
            const res = `${c.width}x${c.height}`;
            const bBps = Math.round(b * 1e6);
            const floorBps = Math.round(Number(c.floor) * 1e6);

            const put = (obj, key, value) => {
                if (!obj || value == null) return;
                const v = String(value);
                if (String(obj[key]) !== v) obj[key] = v;
            };
            const putNum = (obj, key, value) => put(obj, key, Number(value));

            putNum(s, 'networkCachingMs', base);
            put(s, 'bufferTargetSec', Math.round(total / 1000));
            put(s, 'maxResolution', res);
            putNum(s, 'maxBitrateKbps', Math.round(b * 1000));
            putNum(s, 'avgBitrateKbps', Math.round(b * 0.8 * 1000));
            putNum(s, 'targetFps', c.fps);
            put(s, 'target_framerate', `${c.fps}FPS`);

            const vlc = profile.vlcopt || (profile.vlcopt = {});
            putNum(vlc, 'network-caching', base);
            putNum(vlc, 'live-caching', base);
            putNum(vlc, 'file-caching', player);
            putNum(vlc, 'disc-caching', player);
            putNum(vlc, 'tcp-caching', player);
            putNum(vlc, 'sout-mux-caching', player);
            putNum(vlc, 'video-fps', c.fps);
            putNum(vlc, 'video-width', c.width);
            putNum(vlc, 'video-height', c.height);
            putNum(vlc, 'adaptive-maxwidth', c.width);
            putNum(vlc, 'adaptive-maxheight', c.height);
            putNum(vlc, 'adaptive-maxbitrate', bBps);
            putNum(vlc, 'adaptive-initial-bandwidth', bBps);

            const kodi = profile.kodiprop || (profile.kodiprop = {});
            put(kodi, 'inputstream.adaptive.max_resolution', res);
            putNum(kodi, 'inputstream.adaptive.max_bitrate', Math.round(b * 1000));
            putNum(kodi, 'inputstream.adaptive.min_bandwidth', floorBps);
            putNum(kodi, 'inputstream.adaptive.preferred_video_frame_rate', c.fps);

            const hls = profile.hlsjs || (profile.hlsjs = {});
            putNum(hls, 'maxBufferLength', Math.round(total / 1000));
            putNum(hls, 'maxMaxBufferLength', Math.round(total / 1000));
            putNum(hls, 'backBufferLength', Math.round(base / 1000));
            putNum(hls, 'abrEwmaDefaultEstimate', bBps);
            putNum(hls, 'abrEwmaDefaultEstimateMax', bBps);

            const pref = profile.prefetch_config || (profile.prefetch_config = {});
            // Si el solver ya optimizó Risk/Headroom, NO pisar su prefetch.
            if (profile._objectiveApplied !== true) {
                putNum(pref, 'buffer_target_seconds', Math.round(total / 1000));
                putNum(pref, 'min_bandwidth_mbps', c.floor);
            }

            const opt = profile.optimized_knobs || (profile.optimized_knobs = {});
            putNum(opt, 'buffer_seconds', Math.round(total / 1000));
            putNum(opt, 'live_delay_seconds', Math.round(player / 1000));

            const ho = profile.headerOverrides || (profile.headerOverrides = {});
            const first = (key, value) => {
                if (value == null) return;
                const cur = String(ho[key] ?? '');
                if (cur.includes(',')) {
                    const parts = cur.split(',');
                    parts[0] = String(value);
                    ho[key] = parts.join(',');
                } else {
                    ho[key] = String(value);
                }
            };
            const single = (key, value) => { if (value != null) ho[key] = String(value); };
            single('X-Network-Caching', base);
            single('X-Live-Caching', base);
            single('X-File-Caching', player);
            single('X-ExoPlayer-Buffer-Min', base);
            single('X-Manifest-Refresh', base);
            single('X-KODI-LIVE-DELAY', Math.floor(base / 1000));
            single('X-Buffer-Target', player);
            single('X-Buffer-Min', base);
            single('X-Buffer-Max', total);
            single('X-Min-Buffer-Time', Math.floor(base / 1000));
            single('X-Max-Buffer-Time', Math.floor(total / 1000));
            single('X-APE-FPS', c.fps);
            single('X-Max-Framerate', c.fps);
            single('X-Stream-Bitrate', bBps);
            single('X-Stream-Resolution', res);
            single('X-Stream-FPS', c.fps);
            first('X-APE-BITRATE', b);
            first('X-APE-TARGET-BITRATE', bBps);
            first('X-APE-THROUGHPUT-T1', c.t1);
            first('X-APE-THROUGHPUT-T2', c.t2);
            first('X-APE-RESOLUTION', res);
            first('X-Screen-Resolution', res);
            first('X-Max-Resolution', res);
            first('X-Max-Bitrate', bBps);
            first('X-Initial-Bitrate', bBps);
            single('X-Min-Bitrate', floorBps);

            const actor = (profile.actor_injections && profile.actor_injections.player) || null;
            if (actor) {
                const patchJson = (key, patch) => {
                    const raw = actor[key];
                    if (typeof raw !== 'string') return;
                    try {
                        const obj = JSON.parse(raw);
                        let changed = false;
                        for (const [k, v] of Object.entries(patch)) {
                            if (obj[k] !== v) { obj[k] = v; changed = true; }
                        }
                        if (changed) actor[key] = JSON.stringify(obj);
                    } catch (e) { /* valor no JSON: no tocar */ }
                };
                patchJson('vlc', {
                    network_caching_ms: base,
                    live_caching_ms: base,
                    sout_mux_caching_ms: player
                });
                patchJson('exoplayer', {
                    minBufferMs: base,
                    bufferForPlaybackMs: player
                });
                patchJson('kodi', {
                    inputstream_adaptive_max_buffer_duration: Math.round(total / 1000),
                    inputstream_adaptive_assured_buffer_duration: Math.round(base / 1000)
                });
                patchJson('hlsjs', {
                    maxMaxBufferLength: Math.round(total / 1000)
                });
            }
        }

        /** Rango LI/LS del buffer base (segundos) por resolución. */
        _bufferRange(profile) {
            const s = profile?.settings || {};
            const m = String(s.resolution || '').match(/(\d{3,5})\s*[xX]\s*(\d{3,5})/);
            const w = m ? parseInt(m[1], 10) : 1280;
            const h = m ? parseInt(m[2], 10) : 720;
            if (w >= 7680 || h >= 4320) return {li: 10, ls: 19}; // 8K
            if (w >= 3840 || h >= 2160) return {li: 8, ls: 15};  // 4K
            if (w >= 1920 || h >= 1080) return {li: 6, ls: 12};  // FHD
            if (w >= 1280 || h >= 720) return {li: 4, ls: 10};   // HD
            return {li: 3, ls: 8};                                // SD
        }

        _bufferSec(profile) {
            const ms = Number(profile?.settings?.buffer);
            return isFinite(ms) && ms > 0 ? ms / 1000 : 0;
        }

        _bufferOutOfRange(profile) {
            const r = this._bufferRange(profile);
            const sec = this._bufferSec(profile);
            return sec > 0 && (sec < r.li || sec > r.ls);
        }

        _bufferStyle(profile) {
            return this._bufferOutOfRange(profile)
                ? 'border-color:#ef4444;color:#ef4444;'
                : 'border-color:#00ff41;';
        }

        /** AUTO-AJUSTAR: lleva los segundos al LI/LS más cercano, sin saltos. */
        _autoAdjustBuffer(profile) {
            if (!profile || !profile.settings) return false;
            const r = this._bufferRange(profile);
            const sec = this._bufferSec(profile);
            if (!(sec > 0)) return false;
            const clamped = Math.min(r.ls, Math.max(r.li, sec));
            if (Math.abs(clamped - sec) < 0.01) return false;
            profile.settings.buffer = Math.round(clamped * 1000);
            return true;
        }

        normalizeAllProfiles() {
            const raw = (typeof this.config.getAllProfiles === 'function')
                ? this.config.getAllProfiles()
                : (this.config.profiles || {});
            const all = Array.isArray(raw) ? raw : Object.values(raw || {});
            let changed = 0;
            for (const p of all) {
                if (this._applyDerivedProfile(p)) changed++;
            }
            return changed;
        }

        /**
         * Recalcula el perfil activo con el motor único.
         * No modifica codec, resolución, fps ni buffer base.
         */
        recomputeActiveProfile() {
            const profile = this.config.getProfile(this.activeProfileId);
            if (!profile || !profile.settings) return null;
            const bufferAdjusted = this._autoAdjustBuffer(profile);
            const r = this._applyDerivedProfile(profile);
            if (!r) return null;
            const objective = this._applyObjective(profile);
            if (typeof this.config.flushSave === 'function') this.config.flushSave();
            this._updateStreamingHealth();
            this.render();
            return Object.assign({bufferAdjusted: bufferAdjusted, objectiveAdjusted: !!objective}, r,
                objective && objective.after ? {
                    risk: objective.after.risk,
                    sparePct: objective.after.sparePct,
                    stallPct: objective.after.stallPct,
                    overheadSec: objective.after.fillTimeSec
                } : {});
        }

        /** AUTO-AJUSTAR todos los perfiles P0–P5, incluido buffer LI/LS. */
        _applyObjective(profile) {
            if (!profile || !profile.settings) return null;
            try {
                const snap = (window.APE_BW && typeof window.APE_BW.snapshot === 'function')
                    ? window.APE_BW.snapshot() : null;
                if (!snap || !(snap.mbps > 0)) return null;
                if (!window.APE_SOLVER || typeof window.APE_SOLVER.adjustProfileObjective !== 'function') return null;
                const r = window.APE_SOLVER.adjustProfileObjective(profile.id);
                if (!r) return null;
                profile._objectiveApplied = true;
                // Refrescar floor/T1/T2 con el bitrate que haya fijado el solver.
                const s = profile.settings;
                const b = Number(s.bitrate);
                if (b > 0) {
                    const configuredFloor = Number(s.bitrate_floor_mbps);
                    const floor = configuredFloor > 0 && configuredFloor <= b
                        ? configuredFloor : Math.max(0.1, Math.round(b * 0.5 * 100) / 100);
                    s.bitrate_floor_mbps = floor;
                    s.t1 = parseFloat((b * ProfileManagerV9.THROUGHPUT_T1_MULTIPLIER).toFixed(1));
                    s.t2 = parseFloat((b * ProfileManagerV9.THROUGHPUT_T2_MULTIPLIER).toFixed(1));
                    this.config.setHeaderOverride(profile.id, 'X-APE-THROUGHPUT-T1', String(s.t1));
                    this.config.setHeaderOverride(profile.id, 'X-APE-THROUGHPUT-T2', String(s.t2));
                    this.config.setHeaderOverride(profile.id, 'X-APE-BITRATE-FLOOR', String(floor));
                    this.config.setHeaderOverride(profile.id, 'X-APE-BITRATE', String(b));
                    this.config.setHeaderOverride(profile.id, 'X-Min-Bitrate', String(Math.round(floor * 1000000)));
                }
                return r;
            } catch (e) {
                console.warn('[AUTO-AJUSTAR] objective solver failed:', e && e.message);
                return null;
            }
        }

        recomputeAllProfiles() {
            const raw = (typeof this.config.getAllProfiles === 'function')
                ? this.config.getAllProfiles()
                : (this.config.profiles || {});
            const all = Array.isArray(raw) ? raw : Object.values(raw || {});
            let count = 0;
            let adjusted = 0;
            let objective = 0;
            for (const p of all) {
                if (!p || !p.settings) continue;
                if (this._autoAdjustBuffer(p)) adjusted++;
                this._applyDerivedProfile(p);
                if (this._applyObjective(p)) objective++;
                count++;
            }
            if (typeof this.config.flushSave === 'function') this.config.flushSave();
            this._updateStreamingHealth();
            this.render();
            return {count: count, bufferAdjusted: adjusted, objectiveAdjusted: objective, total: all.length};
        }

        /**
         * Normaliza SOLO aritmética del perfil (floor/T1/T2) antes de pintar.
         * No toca codec, resolución, fps, buffers ni headers de imagen.
         */
        _normalizeArithmetic(profile) {
            if (!profile || !profile.settings) return;
            const s = profile.settings;
            const bitrate = this._calibrateHdBase(profile);
            if (!isFinite(bitrate) || bitrate <= 0) return;

            const t1 = parseFloat((bitrate * ProfileManagerV9.THROUGHPUT_T1_MULTIPLIER).toFixed(1));
            const t2 = parseFloat((bitrate * ProfileManagerV9.THROUGHPUT_T2_MULTIPLIER).toFixed(1));
            const floor = this._computeBitrateFloor(profile);

            if (s.t1 !== t1 || s.t2 !== t2 || s.bitrate_floor_mbps !== floor) {
                s.t1 = t1;
                s.t2 = t2;
                s.bitrate_floor_mbps = floor;
                this.config.setHeaderOverride(profile.id, 'X-APE-THROUGHPUT-T1', String(t1));
                this.config.setHeaderOverride(profile.id, 'X-APE-THROUGHPUT-T2', String(t2));
                this.config.setHeaderOverride(profile.id, 'X-APE-BITRATE-FLOOR', String(floor));
                this.config.setHeaderOverride(profile.id, 'X-Min-Bitrate', String(Math.round(floor * 1000000)));
            }
        }
        /**
         * True si el field aún no fue overrided manualmente por el usuario tras Import LAB.
         * Marca el provenance para los badges 🛡 LAB / 🔧 Manual.
         */
        _isLabSourced(field) {
            if (!this.config.labBulletproof) return false;
            const overrides = this._userOverrides || {};
            const profileOverrides = overrides[this.activeProfileId] || {};
            return !profileOverrides[field];
        }
        _markUserOverride(field) {
            this._userOverrides = this._userOverrides || {};
            this._userOverrides[this.activeProfileId] = this._userOverrides[this.activeProfileId] || {};
            this._userOverrides[this.activeProfileId][field] = Date.now();
            try { localStorage.setItem('pm9_user_overrides', JSON.stringify(this._userOverrides)); } catch (_) {}
        }
        _loadUserOverrides() {
            try {
                const raw = localStorage.getItem('pm9_user_overrides');
                if (raw) this._userOverrides = JSON.parse(raw) || {};
            } catch (_) { this._userOverrides = {}; }
        }

        /**
         * Renderiza el panel 🛡 LAB Bulletproof Details para el perfil activo (T6b)
         * Despliega TODAS las secciones del NIVEL_2_PROFILES del LAB Excel:
         * settings (~41 keys), vlcopt (~48), kodiprop (~7), hlsjs (~41),
         * prefetch_config (~14), headerOverrides (~233), bounds, optimized_knobs,
         * actor_injections, role, fitness, solver_trace.
         * Doctrina: read-only — los valores los calibra el solver del LAB.
         */
        _renderLabBulletproofPanel(p) {
            if (!p) return '';
            const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[c]));
            const _kv = (obj) => {
                if (!obj || typeof obj !== 'object') return '<em style="opacity:0.5">— vacío</em>';
                const entries = Object.entries(obj);
                if (entries.length === 0) return '<em style="opacity:0.5">— vacío</em>';
                return `<table class="pm9-lab-kv-table">${
                    entries.map(([k,v]) => {
                        const dispVal = (v && typeof v === 'object') ? JSON.stringify(v) : String(v == null ? '' : v);
                        const truncated = dispVal.length > 200 ? dispVal.substring(0,197) + '…' : dispVal;
                        return `<tr><td class="pm9-lab-key">${_esc(k)}</td><td class="pm9-lab-val">${_esc(truncated)}</td></tr>`;
                    }).join('')
                }</table>`;
            };
            const sections = [
                { id: 'settings',         icon: '⚙️',  title: 'Settings (NIVEL_2_PROFILES)', data: p.settings,         desc: 'Atributos de calibración del perfil — fila por fila de la hoja 6_NIVEL_2_PROFILES' },
                { id: 'vlcopt',           icon: '📺',  title: 'EXTVLCOPT directives',         data: p.vlcopt,           desc: 'Headers VLC que se emiten en cada canal' },
                { id: 'kodiprop',         icon: '🎬',  title: 'KODIPROP directives',          data: p.kodiprop,         desc: 'Inputstream.adaptive props para Kodi' },
                { id: 'hlsjs',            icon: '🎯',  title: 'HLS.js config',                data: p.hlsjs,            desc: 'Player config para hls.js (browser)' },
                { id: 'prefetch_config',  icon: '🚀',  title: 'Prefetch config',              data: p.prefetch_config,  desc: 'Estrategia de prefetch + caching' },
                { id: 'optimized_knobs',  icon: '🎚️', title: 'Optimized knobs (solver out)', data: p.optimized_knobs,  desc: 'Output del solver LHS→GA→SA→NM' },
                { id: 'bounds',           icon: '📐',  title: 'Solver bounds',                data: p.bounds,           desc: 'Rango [lo, hi] que el solver exploró' },
                { id: 'lab_sync',         icon: '🧪',  title: 'PRISMA LAB-SYNC',               data: p.lab_sync,         desc: 'Campos LAB v8 consumidos por ProfileVal + Guardian Daemon' },
                { id: 'headerOverrides',  icon: '🌐',  title: 'HTTP Header Overrides',        data: p.headerOverrides,  desc: 'Headers HTTP X-APE-* + Sec-Fetch-* + Beautiful Madness 4-layer' }
            ];
            const actorInjections = p.actor_injections || {};
            const actorSections = Object.keys(actorInjections).map(k => ({
                id: 'actor_' + k,
                icon: '🎭',
                title: `actor_injections.${k}`,
                data: actorInjections[k],
                desc: `Per-actor calibration block (${k})`
            }));
            const allSections = [...sections, ...actorSections];
            const totalKeys = allSections.reduce((sum, s) => sum + (s.data && typeof s.data === 'object' ? Object.keys(s.data).length : 0), 0);
            const meta = [
                p.role ? `Role: <strong>${_esc(p.role)}</strong>` : null,
                p.fitness != null ? `Fitness: <strong>${_esc(p.fitness)}</strong>` : null,
                p.solver_trace ? `Solver: <strong>${_esc(p.solver_trace)}</strong>` : null,
                p.optimized_timestamp ? `Timestamp: <strong>${_esc(p.optimized_timestamp)}</strong>` : null
            ].filter(Boolean).join(' · ');
            return `
                <details class="pm9-lab-bp-panel" style="margin-top: 14px; border-radius: 8px; background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.3);">
                    <summary style="cursor: pointer; padding: 10px 14px; font-size: 0.9rem; font-weight: 600; color: #10b981;">
                        🛡 LAB Bulletproof Details — ${p.id} (${totalKeys} fields, read-only desde LAB Excel)
                    </summary>
                    <div style="padding: 12px 16px;">
                        <div style="font-size: 0.78rem; margin-bottom: 10px; padding: 7px 10px; border-radius: 6px; background: rgba(56,189,248,0.10); border: 1px solid rgba(56,189,248,0.28); color: #7dd3fc;">
                            🔊 AUDIO SAFE · ${_esc((p.settings && p.settings.audio_mode) || 'passthrough_safe')}
                            · fallback ${_esc((p.settings && p.settings.audio_fallback) || 'aac_lc_2ch')}
                            · eARC ${_esc((p.settings && p.settings.audio_earc) || 'auto')}
                        </div>
                        ${meta ? `<div style="font-size: 0.8rem; opacity: 0.85; margin-bottom: 10px;">${meta}</div>` : ''}
                        ${allSections.map(s => `
                            <details class="pm9-lab-section" style="margin-top: 8px;">
                                <summary style="cursor: pointer; font-size: 0.82rem; font-weight: 600; padding: 6px 0;">
                                    ${s.icon} ${s.title}
                                    <span style="opacity: 0.6; font-weight: normal;"> — ${s.data && typeof s.data === 'object' ? Object.keys(s.data).length : 0} keys</span>
                                </summary>
                                <div style="padding: 6px 12px; font-size: 0.74rem; opacity: 0.75; font-style: italic;">${s.desc}</div>
                                <div style="padding: 6px 12px;">${_kv(s.data)}</div>
                            </details>
                        `).join('')}
                    </div>
                </details>
            `;
        }

        /**
         * Renderiza el panel completo (expandido)
         * Añade botón de cerrar para volver al estado colapsado
         */
        render() {
            // ══ GUARDIA ANTI-BUCLE (2026-11-06) ═══════════════════════════════
            // Medido: al recargar, la persistencia de UI restauraba los controles
            // disparando input/change, esos eventos entraban en updateSetting() →
            // motor reactivo → render() → DOM nuevo → observador → restaurar…
            // bucle infinito, porque cada render crea nodos NUEVOS que siempre
            // están "en su valor por defecto".
            // Aquí: render() reentrante se coalesce (el de fuera ya repinta el
            // estado más reciente) y un techo de 20 repintados/s aborta cualquier
            // eco que quede vivo. No cambia lo que se pinta, sólo cuántas veces.
            if (this._renderBusy) { this._renderAgain = true; return; }
            const _rn = Date.now();
            if (!this._renderWin || _rn - this._renderWin.t > 1000) this._renderWin = { t: _rn, n: 0, warned: false };
            this._renderWin.n++;
            if (this._renderWin.n > 20) {
                if (!this._renderWin.warned) {
                    this._renderWin.warned = true;
                    console.warn(`[pm9] ${this._renderWin.n} renders/s → coalesciendo (protección anti-bucle)`);
                }
                return;
            }
            this._renderBusy = true;
            // Se libera en el microtask, DESPUÉS de que el render síncrono y sus
            // cascadas terminen; si alguien pidió repintar mientras tanto, se
            // atiende UNA sola vez.
            Promise.resolve().then(() => {
                this._renderBusy = false;
                if (this._renderAgain) { this._renderAgain = false; this.render(); }
            });

            this.container = document.getElementById(this.containerId);
            if (!this.container) {
                console.warn(`Container ${this.containerId} no encontrado`);
                return;
            }

            // Marcar como expandido
            this.isOpen = true;

            this.normalizeAllProfiles();
            const profiles = this.config.getDegradationHierarchy ? this.config.getDegradationHierarchy() : Object.values(this.config.getAllProfiles());
            const activeProfile = this.config.getProfile(this.activeProfileId);
            const activeManifest = this.config.getManifestConfig();
            const categories = this.config.getCategories();

            this.container.innerHTML = `
                <!-- data-ape-nopersist: los controles de este panel son POR PERFIL y su
                     SSOT es APE_PROFILES_CONFIG (persistido en localStorage). Dejar que
                     ape-ui-persistence los reponga por id contaminaba un perfil con los
                     valores de otro, porque el id (pm9_fps, pm9_buffer_sec…) es el mismo
                     en los 12 perfiles. Los valores sobreviven igual: los guarda el modelo. -->
                <div class="pm9-panel" data-ape-nopersist="1">
                    <!-- Header con botón de cerrar -->
                    <div class="pm9-header">
                        <div class="pm9-title">
                            <span class="pm9-icon">🎚️</span>
                            <span>Gestor de Perfiles APE v9.0</span>
                            ${this.config.labBulletproof ? '<span id="pm9-lab-bulletproof-badge" style="font-size: 10px; background: linear-gradient(135deg, #10b981, #059669); padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: bold; color: #fff;">🛡 BULLETPROOF v2</span>' : ''}
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
                        ${profiles.map(p => `
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
                            ${this.config.labBulletproof && this.config.labMetaPerProfile && this.config.labMetaPerProfile[activeProfile.id] ? `<span title="Role: ${this.config.labMetaPerProfile[activeProfile.id].role}&#10;Fitness: ${this.config.labMetaPerProfile[activeProfile.id].fitness_score}%" style="margin-left: 10px; font-size: 11px; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #10b981; padding: 2px 6px; border-radius: 4px; cursor: help;">🛡 ${this.config.labMetaPerProfile[activeProfile.id].role} (${this.config.labMetaPerProfile[activeProfile.id].fitness_score}%)</span>` : ''}
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
                                <label>FPS${this._isLabSourced('fps') ? ' <span class="pm9-badge-lab" title="Calibrado por LAB Excel">🛡</span>' : ' <span class="pm9-badge-manual" title="Editado por usuario">🔧</span>'}</label>
                                <input type="number" id="pm9_fps" value="${this._labVal(activeProfile.settings.fps)}"
                                       data-lab-sourced="${this._isLabSourced('fps')}"
                                       oninput="window.ProfileManagerV9.updateSetting('fps', window.ProfileManagerV9._labNum(this.value))">
                            </div>
                            <div class="pm9-setting">
                                <label>Buffer Base (s)${this._isLabSourced('buffer') ? ' <span class="pm9-badge-lab" title="Calibrado por LAB Excel">🛡</span>' : ' <span class="pm9-badge-manual">🔧</span>'}</label>
                                <input type="number" id="pm9_buffer_sec" value="${activeProfile.settings.buffer != null ? activeProfile.settings.buffer / 1000 : ''}"
                                       data-lab-sourced="${this._isLabSourced('buffer')}"
                                       style="${this._bufferStyle(activeProfile)}"
                                       title="LI ${this._bufferRange(activeProfile).li}s · LS ${this._bufferRange(activeProfile).ls}s"
                                       oninput="window.ProfileManagerV9.updateSetting('bufferSeconds', window.ProfileManagerV9._labNum(this.value))">
                            </div>
                            <div class="pm9-setting">
                                <label>Estrategia</label>
                                <select id="pm9_strategy" onchange="window.ProfileManagerV9.updateSetting('strategy', this.value)">
                                    ${Object.keys(ProfileManagerV9.STRATEGY_CONFIG).map(s => {
                                        /* [t17] etiqueta legible del tuner (español) y 'selected'
                                         * por CLAVE CANÓNICA: acepta 'ultra-aggressive' y
                                         * 'Ultra-Agresivo' sin dejar el select sin opción. */
                                        const T = (typeof window !== 'undefined') ? window.APE_HEALTH_TUNER : null;
                                        const label = (T && typeof T.strategyOf === 'function') ? T.strategyOf(s).name
                                            : (s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '));
                                        const cur = (T && typeof T.strategyKey === 'function')
                                            ? T.strategyKey(activeProfile.settings.strategy) : activeProfile.settings.strategy;
                                        return `
                                        <option value="${s}" ${cur === s ? 'selected' : ''}>
                                            ${label}
                                        </option>`;
                                    }).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- ⚙️ SETTINGS AUXILIARES Y MÉTRICAS CALCULADAS -->
                        <div class="pm9-settings-grid">
                            <div class="pm9-setting">
                                <label>Bitrate (Mbps)${this._isLabSourced('bitrate') ? ' <span class="pm9-badge-lab" title="Calibrado por solver. Edit en LAB Excel">🛡</span>' : ''}</label>
                                <input type="number" id="pm9_bitrate" value="${this._labVal(activeProfile.settings.bitrate)}" readonly
                                       data-lab-sourced="${this._isLabSourced('bitrate')}"
                                       style="opacity: 0.8; cursor: not-allowed;" title="Calibrado por solver. Edit en LAB Excel">
                            </div>
                            <div class="pm9-setting">
                                <label>Bitrate Floor (Mbps) <span class="pm9-badge-lab" title="Piso absoluto: variantes inferiores son inaceptables">AUTO</span></label>
                                <input type="number" id="pm9_bitrate_floor" value="${this._computeBitrateFloor(activeProfile)}" readonly
                                       style="opacity: 0.8; cursor: not-allowed;" title="Piso mínimo absoluto. Auto-calculado por Quality.">
                            </div>
                            <div class="pm9-setting">
                                <label>Throughput T1${this._isLabSourced('t1') ? ' <span class="pm9-badge-lab">🛡</span>' : ''}</label>
                                <input type="number" step="0.1" id="pm9_t1" value="${this._labVal(activeProfile.settings.t1)}" readonly
                                       data-lab-sourced="${this._isLabSourced('t1')}"
                                       style="opacity: 0.8; cursor: not-allowed;" title="Calibrado por solver. Edit en LAB Excel">
                            </div>
                            <div class="pm9-setting">
                                <label>Throughput T2${this._isLabSourced('t2') ? ' <span class="pm9-badge-lab">🛡</span>' : ''}</label>
                                <input type="number" step="0.1" id="pm9_t2" value="${this._labVal(activeProfile.settings.t2)}" readonly
                                       data-lab-sourced="${this._isLabSourced('t2')}"
                                       style="opacity: 0.8; cursor: not-allowed;" title="Calibrado por solver. Edit en LAB Excel">
                            </div>
                            <div class="pm9-setting">
                                <label>Buffer Total (C1+C2+C3)</label>
                                <input type="number" id="pm9_buffer" value="${activeProfile.settings.buffer != null && activeProfile.settings.playerBuffer != null ? (Number(activeProfile.settings.buffer) * 2 + Number(activeProfile.settings.playerBuffer)) : ''}"
                                       readonly style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;">
                            </div>
                            <div class="pm9-setting">
                                <label>Player Buffer (ms)${this._isLabSourced('playerBuffer') ? ' <span class="pm9-badge-lab">🛡</span>' : ''}</label>
                                <input type="number" id="pm9_playerBuffer" value="${this._labVal(activeProfile.settings.playerBuffer)}" readonly
                                       data-lab-sourced="${this._isLabSourced('playerBuffer')}"
                                       style="opacity: 0.8; cursor: not-allowed; border-color: #00ff41;" title="Calibrado por solver. Edit en LAB Excel">
                            </div>
                            <div class="pm9-setting">
                                <label>Headers Count</label>
                                <input type="number" id="pm9_headersCount" value="${activeProfile.settings.headersCount}" 
                                       onchange="window.ProfileManagerV9.updateSetting('headersCount', parseInt(this.value))">
                            </div>
                            <div class="pm9-setting">
                                <label>Clock Jitter (ms) <span style="font-size:9px;color:#10b981;">AUTO 10%</span></label>
                                <input type="number" id="pm9_clockJitter" value="${activeProfile.vlcopt?.['clock-jitter'] || Math.round(Number(activeProfile.settings.buffer || 0) * 0.10)}"
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
                                <span id="pm9_jitter_max">${Math.floor(Number(activeProfile.settings.playerBuffer || 0) * 0.8)} ms</span>
                            </div>
                            <div class="pm9-perf-item">
                                <label>Buffer Total (C1+C2+C3)</label>
                                <span id="pm9_buffer_total">${Number(activeProfile.settings.buffer || 0) * 2 + Number(activeProfile.settings.playerBuffer || 0)} ms</span>
                            </div>
                            <div class="pm9-perf-item pm9-perf-ram">
                                <label>RAM Est. (Teórica vs Real)</label>
                                <div class="pm9-ram-display">
                                    <span id="pm9_ram_real" class="pm9-ram-real">${(((Number(activeProfile.settings.buffer || 0) * 2 + Number(activeProfile.settings.playerBuffer || 0)) / 1000) * Number(activeProfile.settings.bitrate || 0) / 8).toFixed(1)} MB (Real)</span>
                                    <span id="pm9_ram_theoretical" class="pm9-ram-theo">${(((Number(activeProfile.settings.buffer || 0) * 2 + Number(activeProfile.settings.buffer || 0) / 5) / 1000) * Number(activeProfile.settings.bitrate || 0) / 8).toFixed(1)} MB (Puro)</span>
                                </div>
                                <div class="pm9-ram-note">Overhead v13.1: +${Number(activeProfile.settings.playerBuffer || 0) - Number(activeProfile.settings.buffer || 0) / 5}ms seguridad</div>
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
                                    Risk: <span id="pm9_risk_preview">--</span>/100 | Headroom: <span id="pm9_headroom_preview">--</span>
                                </div>
                            </div>
                            <!-- GATE DE SUFICIENCIA EXCEPCIONAL (sufficiency-law-v1.js):
                                 headroom >= 3.00x (200%) Y risk <= 10. Se declara si se
                                 cumple y, si no, cuanto falta. -->
                            <div id="pm9_sufficiency_gate" style="margin-top:6px;padding:5px 8px;border-radius:6px;
                                 background:rgba(255,255,255,.03);border:1px solid rgba(148,163,184,.28);
                                 font-size:9px;color:#94a3b8;line-height:1.35;">
                                Gate: headroom &ge; 200 % y risk &le; 10
                            </div>
                            <!-- [2026-11-18] Enlace al módulo «Latencia Rayo»: es la
                                 REFERENCIA de red del cálculo. Se muestra aquí, donde el
                                 operador mira el rendimiento, sin mover ni tocar el bloque
                                 QoS original (ni sus ids ni su estructura interna). -->
                            <div id="pm9_qos_link" style="margin-top:6px;padding:5px 8px;border-radius:6px;
                                 background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.3);
                                 font-size:9px;color:#7dd3fc;line-height:1.35;">
                                📡 Latencia Rayo: sin medición
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

                    <!-- 🛡 LAB BULLETPROOF DETAILS — render TODOS los campos del LAB para este perfil (T6b)
                         Doctrina: cada línea de NIVEL_2_PROFILES debe llegar al UI como fuente única.
                         Read-only por diseño: los valores son calibrados por el solver del LAB Excel,
                         no se editan aquí. Para cambiar, ir al LAB Excel y reexportar el JSON. -->
                    ${this.config.labBulletproof ? this._renderLabBulletproofPanel(activeProfile) : ''}

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
                        ${(() => {
                // T6b doctrina: TODAS las categorías habilitadas por default para TODOS los
                // perfiles P0-P5 (ALL_CATEGORIES como en ape-profiles-config-v5.js base profiles).
                // Esto cubre el caso donde un Import LAB borró enabledCategories en algunos
                // perfiles y no en otros — todos quedan sincronizados con TODAS las categorías
                // habilitadas. El usuario puede deshabilitar manualmente después (toggle persiste).
                // Persistimos para que sobreviva reload + para que los tabs P0-P5 sumen correctamente.
                const allCatIds = Object.keys(categories);
                let changed = false;
                if (this.config && this.config.profiles) {
                    for (const pid of Object.keys(this.config.profiles)) {
                        const p = this.config.profiles[pid];
                        if (!p) continue;
                        const cur = Array.isArray(p.enabledCategories) ? p.enabledCategories : null;
                        if (!cur || cur.length < allCatIds.length) {
                            p.enabledCategories = [...allCatIds];
                            changed = true;
                        }
                    }
                    if (changed) {
                        try { localStorage.setItem('ape_profiles_v9', JSON.stringify(this.config.profiles)); } catch (_) {}
                    }
                }
                // Asegurar referencia local también actualizada
                if (!Array.isArray(activeProfile.enabledCategories) || activeProfile.enabledCategories.length < allCatIds.length) {
                    activeProfile.enabledCategories = [...allCatIds];
                }
                return '';
            })()}${Object.entries(categories).map(([catId, cat]) => {
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
                        
                        <button class="pm9-btn pm9-btn-export" onclick="window.ProfileManagerV9.toggleExportMenu()" title="Opciones de Exportación/Importación">
                            📥 Exportar
                        </button>

                        <button class="pm9-btn pm9-btn-upload" style="background:linear-gradient(135deg,#dc2626,#991b1b);" onclick="window.ProfileManagerV9.importFromLAB()" title="Importar config calibrada desde APE_M3U8_LAB Excel (LAB_CALIBRATED_*.json)">
                            🧪 Import LAB
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
                        <button class="pm9-btn pm9-btn-primary" onclick="window.ProfileManagerV9.toggleSaveMenu()">
                            💾 Guardar ▾
                        </button>
                    </div>

                    <!-- Menú Flotante de Guardado -->
                    <div id="ape-floating-save-menu" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000000; flex-direction: column; gap: 10px; background: rgba(15, 23, 42, 0.97); padding: 16px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.5); box-shadow: 0 10px 25px rgba(0,0,0,0.6); backdrop-filter: blur(10px); min-width: 280px;">
                        <div style="color: #6ee7b7; font-size: 0.8rem; font-weight: bold; text-align: center; text-transform: uppercase;">💾 Guardar estado</div>
                        <button onclick="window.ProfileManagerV9.saveCurrentProfile()" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); padding: 10px 14px; border-radius: 8px; cursor: pointer; font-weight: 700;">💾 Guardar perfil actual (<span id="pm9-save-current-id">P0</span>)</button>
                        <button onclick="window.ProfileManagerV9.saveAllProfiles()" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); padding: 10px 14px; border-radius: 8px; cursor: pointer; font-weight: 700;">📦 Guardar TODOS los perfiles (${this._allProfileIds().length})</button>
                        <button onclick="window.ProfileManagerV9.toggleSaveMenu()" style="background: transparent; color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); padding: 7px 12px; border-radius: 8px; cursor: pointer;">Cancelar</button>
                    </div>

                    <!-- Menú Flotante de Opciones Extras -->
                    <div id="ape-floating-export-menu" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999999; flex-direction: column; gap: 10px; background: rgba(15, 23, 42, 0.95); padding: 15px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.4); box-shadow: 0 10px 25px rgba(0,0,0,0.5); backdrop-filter: blur(10px);">
                        <div style="color: #c4b5fd; font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; text-align: center;">💾 Export &amp; Import</div>
                        <button onclick="window.ProfileManagerV9.exportTemplate(); window.ProfileManagerV9.toggleExportMenu()" style="background: rgba(6, 182, 212, 0.2); color: rgb(6, 182, 212); border: 1px solid rgba(6, 182, 212, 0.4); padding: 8px 15px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-weight: 600; font-size: 13px;" onmouseover="this.style.background='rgba(6, 182, 212, 0.4)'" onmouseout="this.style.background='rgba(6, 182, 212, 0.2)'">📥 Exportar Actual</button>
                        <button onclick="window.ProfileManagerV9.exportAllProfiles(); window.ProfileManagerV9.toggleExportMenu()" style="background: rgba(139, 92, 246, 0.2); color: rgb(196, 181, 253); border: 1px solid rgba(139, 92, 246, 0.4); padding: 8px 15px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-weight: 600; font-size: 13px;" onmouseover="this.style.background='rgba(139, 92, 246, 0.4)'" onmouseout="this.style.background='rgba(139, 92, 246, 0.2)'">📦 Exportar Todos</button>
                        <button onclick="window.ProfileManagerV9.importAllProfiles(); window.ProfileManagerV9.toggleExportMenu()" style="background: rgba(16, 185, 129, 0.2); color: rgb(16, 185, 129); border: 1px solid rgba(16, 185, 129, 0.4); padding: 8px 15px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-weight: 600; font-size: 13px; margin-top: 5px;" onmouseover="this.style.background='rgba(16, 185, 129, 0.4)'" onmouseout="this.style.background='rgba(16, 185, 129, 0.2)'">📤 Importar Todos</button>
                    </div>

                </div>
            `;

            this._injectStyles();

            // v3.1: Actualizar indicadores de Streaming Health
            this._updateStreamingHealth();

            // [t13 2026-11-17] El auto-arranque de UNA sola medición por sesión se
            // sustituye por el PRIMER CICLO DEL GOBERNADOR: medir una vez y
            // congelar el resultado no es calibrar. El gobernador mide, calcula
            // y aplica en bucle (30 s), se pausa con la pestaña oculta y nunca
            // solapa dos ciclos. No se duplica la medición: este es el único
            // arranque automático.
            /* [t16 2026-11-19 · ORDEN DEL OPERADOR] CERO BUCLE Y CERO AUTO-MEDICIÓN.
             * "tiene que medir cuando lo pido… ya luego no tiene porque repetirse
             * una y otra vez, pues esto va a generar que este cambiando datos sin
             * que se lo pida". Aquí SOLO se restaura el snapshot persistente: no
             * se arranca el gobernador ni se lanza ninguna sonda. La única vía de
             * medir es la acción explícita del usuario (botón único). */
            if (!this._bwAutoStarted) {
                this._bwAutoStarted = true;
                const _self = this;
                setTimeout(function () {
                    try {
                        const rr = _self._restoreQoePlan();
                        if (typeof console !== 'undefined' && rr) {
                            console.log('[SNAPSHOT] ' + (rr.restored
                                ? ('plan restaurado para ' + _self.activeProfileId + (rr.stale ? ' (ANTIGUO, sin medir)' : ''))
                                : 'no restaurado: ' + (rr.reason || 'sin datos')));
                        }
                    } catch (e) { /* no bloqueante */ }
                    /* NO se llama a startGovernor(): sin acción del usuario no se mide. */
                }, 0);
            }
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
                fps: profile.settings?.fps || 60,
                // Inputs REALES que alimentan Stall/Risk (fórmulas v3.1)
                playerBufferMs: profile.settings?.playerBuffer,
                segmentDurationSec: profile.settings?.segment_duration_s
            });

            // FUENTE ÚNICA: si el solver está disponible, su evaluación manda
            // para Risk/Stall/Headroom. Antes el estimador podía dar otro número
            // y el panel inferior se quedaba desincronizado del solver.
            try {
                if (window.APE_SOLVER && typeof window.APE_SOLVER.evaluate === 'function') {
                    const _sc = window.APE_SOLVER.evaluate(
                        window.APE_SOLVER.stateFromProfile(this.activeProfileId),
                        window.APE_SOLVER.engineInputsFor(this.activeProfileId)
                    );
                    if (_sc && isFinite(_sc.risk)) {
                        performance.risk_score = _sc.risk;
                        performance.stall_rate_percent = _sc.stallPct;
                        performance.headroomSparePct = _sc.sparePct;
                        performance.stall_class = _sc.class;
                        performance.risk_level = _sc.risk <= 20 ? 'LOW'
                            : _sc.risk <= 40 ? 'MODERATE'
                                : _sc.risk <= 60 ? 'ELEVATED'
                                    : _sc.risk <= 80 ? 'HIGH' : 'CRITICAL';
                        performance.risk_color = _sc.risk <= 30 ? '#10b981'
                            : _sc.risk <= 60 ? '#eab308' : '#ef4444';
                    }
                }
            } catch (e) { /* no bloqueante */ }

            // ═══════════════════════════════════════════════════════════════
            // [2026-11-18 · ENCARGO FINAL] RIESGO Y HEADROOM CON LA BASE DEL PLAN.
            //
            // DEFECTO MEDIDO: el panel calculaba el riesgo con settings.bitrate
            // (200) mientras el plan dimensiona con calculateBitrate del panel
            // (P0 8K = 35 Mbps). Con 146 Mbps medidos eso daba 146/200 = 0.73x
            // → risk 95 (rojo), cuando la pareja real es 146/35 = 4.17x → risk 5
            // y gate excepcional cumplido. El device decodifica un stream de
            // 35 Mbps, no de 200.
            //
            // UNA SOLA BASE, la del plan:
            //   ratio = medido / requiredMbpsBasis
            //   risk  = APE_BW_METER.riskFromRatio(ratio)   (mismas anclas:
            //           3.0x→5 · 2.0x→20 · 1.5x→35 · 1.3x→50 · 1.0x→70 · 0x→95)
            // Sin medición fresca NO se inventa riesgo: evidence=false y el
            // campo dice "--" con el motivo (nunca 95 por defecto).
            // ═══════════════════════════════════════════════════════════════
            let riskTitle = '';
            try {
                const np = this._networkProfile();
                const basis = this._requiredMbpsBasis(profile);
                const bwM = (typeof window !== 'undefined') ? window.APE_BW_METER : null;
                if (np && np.fresh && basis.mbps > 0 && bwM && typeof bwM.riskFromRatio === 'function') {
                    /* [t16] risk/headroom sobre la CAPACIDAD (peak), no sobre el dip */
                    /* [t30] capacidAD con precedencia declarada; si NO es
                     * computable, no se fabrica un número pequeño. */
                    const capSrc = this._capacitySource();
                    const capR = this._capacity();
                    const capMbps = capSrc.noComputado ? null : Number(capSrc.mbps);
                    if (capSrc.noComputado) {
                        performance.evidence = false;
                        performance.bw_no_computado = true;
                        performance.bw_reason = capSrc.reason;
                        throw new Error('CAPACIDAD_NO_COMPUTADA');
                    }
                    const ratio = Math.round((capMbps / basis.mbps) * 100) / 100;
                    const risk = bwM.riskFromRatio(ratio);
                    performance.evidence = true;
                    performance.headroomRatio = ratio;
                    performance.headroomSparePct = Math.round((ratio - 1) * 100);
                    performance.headroom_percent = performance.headroomSparePct;
                    performance.risk_score = risk;
                    performance.risk_level = risk <= 20 ? 'LOW' : risk <= 40 ? 'MODERATE'
                        : risk <= 60 ? 'ELEVATED' : risk <= 80 ? 'HIGH' : 'CRITICAL';
                    performance.risk_color = risk <= 30 ? '#10b981' : risk <= 60 ? '#eab308' : '#ef4444';
                    performance.bw_measured_mbps = capMbps;
                    performance.bw_source = capSrc.source;
                    /* bw_now_mbps = MUESTRA INSTANTÁNEA (downlink), NO la capacidad:
                     * es la que alimenta la detección de oscilación del gobernador. */
                    performance.bw_now_mbps = Number((np && np.downloadMbps) || capMbps);
                    performance.bw_peak_mbps = capMbps;
                    performance.peak_hold = capR || null;
                    performance.dip = !!(capR && capR.dip);
                    performance.dip_ratio = capR ? capR.dipRatio : null;
                    performance.peak_expired = !!(capR && capR.expired);
                    performance.required_basis_mbps = basis.mbps;
                    performance.required_basis_source = basis.source;
                    performance.stall_rate_percent = (typeof this._stallFromRatio === 'function')
                        ? this._stallFromRatio(ratio) : performance.stall_rate_percent;
                    riskTitle = 'risk ' + risk + ' · ratio ' + ratio + 'x = ' + capMbps +
                        ' Mbps de CAPACIDAD (pico sostenido) / ' + basis.mbps + ' Mbps exigidos (base del plan: ' +
                        basis.source + ') · ahora ' + ((np && np.downloadMbps) || capMbps) + ' Mbps · pico ' + capMbps + ' Mbps' +
                        ((capR && capR.dip) ? ' · DIP al ' + Math.round((capR.dipRatio || 0) * 100) + ' % del pico (inestabilidad, no falta de capacidad)' : '') +
                        ((capR && capR.expired) ? ' · peak anterior EXPIRADO: recalibrado al nuevo maximo' : '');
                } else {
                    performance.evidence = false;
                    performance.risk_score = null;
                    performance.headroomRatio = null;
                    performance.headroomSparePct = null;
                    performance.required_basis_mbps = basis.mbps || null;
                    performance.required_basis_source = basis.source;
                    riskTitle = 'NO_MEASUREMENT: sin perfil de red fresco no hay riesgo que calcular' +
                        (basis.mbps > 0 ? ' (base del plan ' + basis.mbps + ' Mbps)' : '') +
                        (np && !np.fresh ? ' — perfil caducado hace ' + Math.round(np.ageMs / 1000) + ' s' : '');
                }
            } catch (e) { /* no bloqueante */ }

            // Actualizar indicadores del panel superior
            const healthIndicator = document.getElementById('pm9_health_indicator');
            const stabilityLabel = document.getElementById('pm9_stability_label');
            const stallPreview = document.getElementById('pm9_stall_preview');
            const riskPreview = document.getElementById('pm9_risk_preview');
            const headroomPreview = document.getElementById('pm9_headroom_preview');

            /* [2026-11-17] DIAGNOSTICO VISIBLE. Antes, cuando no habia medicion,
             * el panel decia "SIN MEDICION" y OCULTABA el motivo: era imposible
             * saber si faltaba el medidor, si la sonda no encontraba objetivo o
             * si la medicion llego vacia. Ahora el estado real queda en la
             * consola y en el title de los dos indicadores. Solo anade texto:
             * no altera ningun valor pintado. */
            try {
                const _bwd = this._lastBw;
                if (_bwd && !_bwd.ok) {
                    const why = '[STREAMING HEALTH] ' + (_bwd.state || 'SIN_ESTADO')
                        + ' :: ' + (_bwd.reason || 'sin motivo') + ' @ ' + new Date(_bwd.at || Date.now()).toISOString();
                    if (typeof console !== 'undefined' && console.warn) console.warn(why);
                    if (stallPreview) stallPreview.setAttribute('title', why);
                    if (headroomPreview) headroomPreview.setAttribute('title', why);
                } else if (!_bwd) {
                    const why2 = '[STREAMING HEALTH] SIN_INTENTO :: el medidor nunca arranco '
                        + '(APE_BW_METER=' + (typeof window !== 'undefined' && window.APE_BW_METER ? 'OK' : 'AUSENTE') + ')';
                    if (typeof console !== 'undefined' && console.warn) console.warn(why2);
                    if (stallPreview) stallPreview.setAttribute('title', why2);
                    if (headroomPreview) headroomPreview.setAttribute('title', why2);
                }
            } catch (e) { /* no bloqueante */ }

            /* el motivo/base va SIEMPRE en el title: "risk 5 · ratio 4.17x =
             * 146 Mbps medidos / 35 Mbps exigidos (base del plan: …)" o el
             * NO_MEASUREMENT con su razón. Sin esto el número no es auditable. */
            if (riskTitle) {
                if (riskPreview) riskPreview.title = riskTitle;
                if (headroomPreview) headroomPreview.title = riskTitle;
                if (stallPreview) stallPreview.title = riskTitle;
            }

            if (healthIndicator) {
                /* sin medición el semáforo NO puede estar verde (0 falso) ni
                 * rojo por un 95 inventado: gris = no se sabe. */
                const noEv = performance.evidence === false;
                const riskScore = (performance.risk_score === null || performance.risk_score === undefined)
                    ? null : performance.risk_score;
                const color = noEv ? '#64748b'
                    : (riskScore === null ? '#64748b'
                        : (riskScore <= 30 ? '#10b981' : riskScore <= 60 ? '#eab308' : '#ef4444'));
                healthIndicator.style.background = color;
                healthIndicator.style.boxShadow = `0 0 8px ${color}55`;
            }

            /* [t20] etiqueta y color desde la FUENTE ÚNICA (el plan) */
            if (stabilityLabel) {
                const v = this._verdict();
                stabilityLabel.textContent = v.label;
                stabilityLabel.style.color = v.color;
            }

            if (stallPreview) {
                // Sin medición no se publica cifra: un "69%" inventado es peor
                // que un guion. Se muestra el guion y el motivo.
                if (performance.evidence === false) {
                    stallPreview.textContent = '-- (sin medición)';
                    stallPreview.style.color = '#64748b';
                } else {
                    const stall = performance.stall_rate_percent || 0;
                    stallPreview.textContent = stall <= 1.67 ? `<${stall.toFixed(2)}%` : `${stall.toFixed(2)}%`;
                    stallPreview.style.color = stall <= 1.67 ? '#10b981' : '#f97316';
                }
            }

            if (riskPreview) {
                if (performance.evidence === false) {
                    riskPreview.textContent = '--';
                    riskPreview.style.color = '#64748b';
                } else {
                    riskPreview.textContent = performance.risk_score || '--';
                    riskPreview.style.color = performance.risk_color || '#64748b';
                }
            }

            if (headroomPreview) {
                // LEY DE SUFICIENCIA EXCEPCIONAL (sufficiency-law-v1.js).
                //
                // MEDIDO 2026-11-08: el panel mostraba "Headroom: 199900%" con
                // "Risk 90/100". Los dos numeros son incompatibles. La causa:
                // headroomSparePct = (bitrate/bwSafe−1)×100, con bwSafe=0.1 Mbps
                // (no habia medicion y actuaba el piso) y bitrate=200 → 199900.
                // Ese 199900 POSITIVO es un DEFICIT del 99,95 %, no un sobrante.
                //
                // Ahora: sin medicion NO se publica cifra; con ratio fuera de
                // rango fisico se declara IMPLAUSIBLE; y el estado se evalua
                // contra el gate (headroom >= 3.00x = 200 % Y risk <= 10).
                const ratio = (typeof performance.headroomRatio === 'number')
                    ? performance.headroomRatio : null;
                /* [2026-11-20] El tope de 100x marcaba IMPLAUSIBLE un ratio REAL: con 113 Mbps
         * medidos y un perfil de 0,5 Mbps el ratio es 227x y es fisicamente correcto.
         * El tope existia para cazar el antiguo piso de 0,1 Mbps (ratio 1999x); 2000 lo caza igual. */
        const plausible = (ratio !== null && ratio >= 0.01 && ratio <= 2000);
                const hasMeasurement = (performance.evidence !== false) && plausible;
                if (typeof window.evaluateSufficiency === 'function') {
                    const ev = window.evaluateSufficiency(ratio, performance.risk_score, hasMeasurement);
                    /* Operador: "+197 %" y "margen 1,3x" parecían lo mismo con bases
                     * distintas. Se NOMBRA la base: el % es capacidad/exigido (red
                     * frente al perfil); el 1,3x de la ley es el MÍNIMO de industria
                     * (≈ +30 %), un umbral, no una medición. */
                    headroomPreview.textContent = (window.sufficiencyLabel
                        ? window.sufficiencyLabel(ev) : (ev.headroomPct + '%')) + ' (red)';
                    headroomPreview.style.color = ev.color || '#64748b';
                    headroomPreview.title = 'Headroom de RED = capacidad medida / exigido por el perfil' +
                        (ratio !== null ? (' = ' + ratio + 'x') : ' = (sin medir)') +
                        '. El 1,3x de la ley es el MÍNIMO recomendado de industria (~+30 %), NO un valor medido. ' +
                        'El riesgo mostrado es riesgo de RED, no estabilidad de reproducción. ' +
                        ev.reason +
                        (ev.target ? (' — gate: headroom >= ' + Math.round((ev.target.headroomRatio - 1) * 100) +
                          ' % y risk <= ' + ev.target.riskMax) : '');
                } else if (performance.evidence === false) {
                    headroomPreview.textContent = '--';
                    headroomPreview.style.color = '#64748b';
                } else {
                    const spare = (typeof performance.headroomSparePct === 'number')
                        ? performance.headroomSparePct : performance.headroom_percent;
                    headroomPreview.textContent = spare;
                    headroomPreview.style.color =
                        spare <= -100 ? '#10b981' : spare <= -50 ? '#22c55e' :
                        spare <= -15 ? '#eab308' : spare < 0 ? '#f97316' : '#ef4444';
                }
            }

            // GATE DE SUFICIENCIA: declarar explicitamente si el perfil alcanza
            // el estado excepcional, y si no, cuanto le falta.
            /* ═══════════════════════════════════════════════════════════════
             * [t18] UN SOLO VEREDICTO, DOS DIMENSIONES ETIQUETADAS.
             *
             * El operador vio "SUFICIENCIA EXCEPCIONAL" al lado de un plan
             * INCOHERENTE y preguntó por qué el panel decía UNSTABLE. No era un
             * fallo de cálculo: eran DOS preguntas mezcladas.
             *   · TRANSPORTE: disponible (capacidad×duty) vs exigido → MANDA.
             *   · CODEC: capacidad vs bitrate del codec → informativo.
             * Si el plan es ok:false el gate NUNCA dice EXCEPCIONAL ni verde.
             * ═══════════════════════════════════════════════════════════════ */
            const selfPM = this;
            const dims = (function dimensiones() {
                const prof = (selfPM.config && selfPM.config.getProfile) ? selfPM.config.getProfile(selfPM.activeProfileId) : null;
                const plan = (typeof selfPM._coherentPlanFor === 'function')
                    ? selfPM._coherentPlanFor(prof, selfPM._activeStrategyId()) : null;
                const m = (plan && plan.metrics) || {};
                const vv = (plan && plan.values) || {};
                const cap = Number(m.measuredMbps);
                const req = Number(m.requiredMbpsForStall || vv.bwMinMbps || m.requiredMbps);
                const avail = (m.availableMbps === null || m.availableMbps === undefined)
                    ? Number(m.measuredMbps) : Number(m.availableMbps);
                /* [t20] Number(null)=0 colaba un ratio 0 falso: se distingue ausencia */
                const ratioT = (m.dutyRatio === null || m.dutyRatio === undefined) ? null : Number(m.dutyRatio);
                const codecMbps = (typeof selfPM._stallBitrateFor === 'function') ? Number(selfPM._stallBitrateFor(prof)) : null;
                const ratioC = (isFinite(cap) && isFinite(codecMbps) && codecMbps > 0)
                    ? Math.round((cap / codecMbps) * 100) / 100 : null;
                return {
                    plan: plan, ok: !!(plan && plan.ok), measured: m.measuredMbps === undefined ? null : cap,
                    req: isFinite(req) ? req : null,
                    avail: isFinite(avail) ? avail : null,
                    ratioT: (ratioT !== null && ratioT !== undefined && isFinite(ratioT)) ? ratioT
                        : ((isFinite(avail) && isFinite(req) && req > 0) ? (Math.round((avail / req) * 100) / 100)
                            : (isFinite(Number(m.ratio)) ? Number(m.ratio) : null)),
                    faltaUtil: (isFinite(req) && isFinite(avail)) ? Math.max(0, Math.round((req - avail) * 100) / 100) : null,
                    codecMbps: (isFinite(codecMbps) && codecMbps > 0) ? codecMbps : null,
                    ratioC: ratioC,
                    stall: (m.stallEstimatePct === undefined || m.stallEstimatePct === null) ? null : m.stallEstimatePct,
                    target: m.targetStallPct === undefined ? null : m.targetStallPct,
                    causa: (plan && plan.violations && plan.violations.length) ? plan.violations[0] : null
                };
            })();
            this._dims = dims;

            (function renderSufficiencyGate() {
                const el = document.getElementById('pm9_sufficiency_gate');
                if (!el) return;
                const d = dims;
                /* sin medición: ni color ni veredicto inventado */
                if (d.measured === null) {
                    el.textContent = 'NO EXCEPCIONAL (NO_MEASUREMENT): sin medición de red no hay veredicto';
                    el.style.color = '#64748b';
                    el.style.borderColor = 'rgba(148,163,184,.35)';
                    el.title = 'Mide con el botón único: sin capacidad medida no se declara suficiencia.';
                    return;
                }
                const trans = 'TRANSPORTE: ' + d.avail + '/' + d.req + ' Mbps (' + d.ratioT + 'x)' +
                    (d.ok ? ' — cubre el mínimo' : (' — faltan ' + d.faltaUtil + ' Mbps útiles'));
                const codec = (d.codecMbps !== null)
                    ? ('CODEC: ' + d.measured + ' Mbps vs ' + d.codecMbps + ' Mbps de bitrate (' + d.ratioC + 'x) — decodificable' +
                       (d.ok ? '' : ' [informativo: NO compensa un transporte rojo]'))
                    : 'CODEC: sin bitrate de códec disponible';
                if (d.ok) {
                    el.textContent = 'EXCEPCIONAL (plan coherente) · ' + trans + ' · ' + codec;
                    el.style.color = '#10b981';
                    el.style.borderColor = 'rgba(16,185,129,.5)';
                } else {
                    el.textContent = 'NO EXCEPCIONAL (plan incoherente) · ' + trans + ' · ' + codec +
                        (d.causa ? (' · causa: ' + d.causa) : '');
                    el.style.color = '#ef4444';
                    el.style.borderColor = 'rgba(239,68,68,.55)';
                }
                el.title = 'Para EXCEPCIONAL el TRANSPORTE debe dar capacidad ≥ 3x lo exigido (con este perfil: ' +
                    (d.req ? Math.round(d.req * 3) : '?') + ' Mbps medidos) o bajar de perfil. ' +
                    'El CODEC sólo dice si el bitrate es decodificable; no vuelve verde un transporte rojo.';
            })();

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
                    /* [t20] fuente única: el plan, no performance.stability */
                    const vS = this._verdict();
                    summaryStability.textContent = vS.label;
                    summaryStability.style.color = vS.color;
                }
                const etiq = this._summaryLabels(performance);
                if (summaryStall) {
                    summaryStall.textContent = etiq.stall;
                    summaryStall.title = etiq.stallTitle;
                }
                if (summaryRisk) {
                    summaryRisk.textContent = etiq.risk;
                    summaryRisk.style.color = performance.risk_color || '#eab308';
                    summaryRisk.title = etiq.riskTitle;
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
                /* [t18] "<0.00%" es imposible: se muestra el valor y, si no hay,
                 * NO COMPUTADO. */
                const spN = Number(performance.stall_rate_percent);
                if (performance.evidence === false || !isFinite(spN)) {
                    rtStall.textContent = 'NO COMPUTADO';
                    rtStall.style.color = '#64748b';
                } else {
                    const stall = Math.max(0, spN);
                    rtStall.textContent = stall.toFixed(2) + '%';
                    rtStall.style.color = this._getStallColor(stall);
                }
            }

            /* [t18] La estabilidad del panel se DERIVA del plan: coherente=estable.
             * Nada de un cálculo paralelo que diga UNSTABLE con un gate verde. */
            try {
                const dS = this._dims || {};
                const lbl = document.getElementById('pm9_stability_label');
                const ind = document.getElementById('pm9_health_indicator');
                const spv = document.getElementById('pm9_stall_preview');
                if (lbl) {
                    if (dS.measured === null || dS.measured === undefined) {
                        lbl.textContent = 'SIN MEDICIÓN';
                        lbl.style.color = '#64748b';
                    } else if (dS.ok) {
                        lbl.textContent = 'ESTABLE (plan coherente)';
                        lbl.style.color = '#10b981';
                    } else {
                        lbl.textContent = 'NO ESTABLE — transporte insuficiente';
                        lbl.style.color = '#ef4444';
                    }
                }
                if (ind) {
                    const col = (dS.measured === null || dS.measured === undefined) ? '#64748b'
                        : (dS.ok ? '#10b981' : '#ef4444');
                    ind.style.background = col;
                    ind.style.boxShadow = '0 0 8px ' + col + '55';
                }
                if (spv) {
                    /* [t18] "<0.00%" junto a UNSTABLE es incoherente: se muestra la
                     * ESTIMACIÓN del plan; si no es computable, se dice. */
                    /* [t18] mismo formato honesto que el veredicto: si supera, LO DICE. */
                    spv.textContent = (dS.stall === null || dS.stall === undefined)
                        ? 'stall: NO COMPUTADO'
                        : ('stall est. ' + dS.stall + ' %' + (dS.target === null ? ''
                            : (Number(dS.stall) > Number(dS.target)
                                ? (' SUPERA el target ' + dS.target + ' %')
                                : (' ≤ target ' + dS.target + ' % (cumple)'))));
                    spv.style.color = (dS.stall !== null && dS.target !== null && Number(dS.stall) > Number(dS.target))
                        ? '#ef4444' : '#64748b';
                    spv.title = 'Estimación del MODELO de stall para el plan aplicado (no observada en el reproductor).';
                }
            } catch (e) { /* no bloqueante */ }

            // Actualizar banner de estabilidad
            /* [t20] el banner EN VIVO usa la MISMA fuente que el resto. */
            const stabilityBanner = document.querySelector('.pm9-stability-banner');
            if (stabilityBanner) {
                const b = this._verdictHtmlBanner();
                stabilityBanner.style.background = b.v.color + '22';
                stabilityBanner.style.borderLeftColor = b.v.color;
                const bannerContent = stabilityBanner.querySelector('span');
                if (bannerContent) bannerContent.innerHTML = b.inner;
            }

            // Actualizar métricas v3.1 si existen
            const v31T1T2 = document.querySelector('.pm9-v31-t1t2');
            const v31Burst = document.querySelector('.pm9-v31-burst');
            const v31Floor = document.querySelector('.pm9-v31-floor');
            const v31Overhead = document.querySelector('.pm9-v31-overhead');

            // Actualización mediante contenedores más específicos
            this._updateV31Metrics(performance);

            console.log('📊 Streaming Health updated:', {
                stability: (this._verdict() || {}).label,
                stall: performance.stall_rate_percent,
                risk: performance.risk_score,
                warnings: performance.policy_warnings?.length || 0
            });

            /* [2026-11-18] El panel de rendimiento se pinta con el PLAN y el
             * perfil de red medido, no con constantes del perfil. Se hace aquí
             * porque este método corre tras CADA ciclo del gobernador y tras
             * cada render. */
            /* El plan del panel se RECALCULA aquí con el perfil y la medición
             * actuales: si se pintara _lastCoherent, el gate podría mostrar el
             * veredicto de un ciclo anterior y el display iría por detrás. */
            try { this._paintPerfPanel(this._coherentPlanFor(null, this._activeStrategyId())); } catch (e) { /* no bloqueante */ }
        }

        /**
         * Actualiza las métricas v3.1 en el panel inferior
         */
        /* [t18] Etiquetas del bloque de resumen. Se extraen para poder probarlas
         * sin DOM: el operador detectó "STALL RATE <0%" (imposible) y "Risk
         * 5/100 (LOW)" junto a UNSTABLE sin decir qué mide cada número. */
        _summaryLabels(perf) {
            perf = perf || {};
            const noEv = perf.evidence === false;
            const sp = Number(perf.stall_rate_percent);
            const stall = noEv ? 'sin medir (observada del reproductor)'
                : (isFinite(sp) ? (Math.max(0, sp).toFixed(2) + '%') : 'sin medir');
            const risk = 'red: ' + String(perf.risk_score === undefined || perf.risk_score === null ? '--' : perf.risk_score) +
                '/100 (' + String(perf.risk_level || 'N/A') + ')';
            return {
                stall: stall,
                stallTitle: noEv
                    ? 'No hay evidencia de reproducción medida: la tasa de interrupción observada aún no existe'
                    : 'Tasa de interrupción estimada por el modelo (no observada en el reproductor)',
                risk: risk,
                riskTitle: 'Riesgo de RED = f(capacidad medida / exigido por el perfil). NO es un veredicto de estabilidad de reproducción:'
                    + ' la estabilidad se mide con el reproductor y, si no hay datos, figura como "sin medir".'
            };
        }

        /* ═══════════════════════════════════════════════════════════════════
         * [t20] FUENTE ÚNICA DEL VEREDICTO (panel + widget V1.1 + banner + CTA).
         * Todo sale del PLAN (this._dims, derivado de coherentPlan). Ningún
         * widget calcula estabilidad por su cuenta; el headroom es UNA cifra.
         *   plan ok   -> ESTABLE, verde, sin CTA
         *   plan !ok  -> NO ESTABLE, rojo, CTA "ACCION URGENTE REQUERIDA"
         *   sin medic -> SIN MEDICIÓN, gris, sin CTA
         * ═══════════════════════════════════════════════════════════════════ */
        _verdict() {
            const d = this._dims || {};
            if (d.measured === null || d.measured === undefined) {
                return {
                    state: 'NOM', ok: null, label: 'SIN MEDICIÓN', color: '#64748b',
                    icon: '⚪', cta: false, headroomRatio: null, headroomPct: null,
                    bwMin: (d.req === undefined ? null : d.req),
                    stall: null, stallTarget: null, stallOk: null, cause: null
                };
            }
            const ok = !!d.ok;
            const ratio = (d.ratioT === null || d.ratioT === undefined) ? null : d.ratioT;
            return {
                state: ok ? 'OK' : 'BAD',
                ok: ok,
                label: ok ? 'ESTABLE (plan coherente)' : 'NO ESTABLE — transporte insuficiente',
                color: ok ? '#10b981' : '#ef4444',
                icon: ok ? '✅' : '⚠️',
                cta: !ok,
                headroomRatio: ratio,
                headroomPct: (ratio === null) ? null : Math.round((ratio - 1) * 100),
                bwMin: (d.req === undefined ? null : d.req),
                stall: (d.stall === undefined ? null : d.stall),
                stallTarget: (d.target === undefined ? null : d.target),
                stallOk: (d.stall === null || d.stall === undefined || d.target === null || d.target === undefined)
                    ? null : (Number(d.stall) <= Number(d.target)),
                cause: ok ? null : (d.causa || null)
            };
        }

        /* HTML del banner: MISMA fuente y MISMAS cifras que el panel superior */
        _verdictHtmlBanner() {
            const v = this._verdict();
            const head = (v.headroomPct === null) ? 'Headroom: --'
                : ('Headroom: ' + v.headroomRatio + 'x (' + v.headroomPct + ' %)');
            return {
                v: v,
                style: 'background: ' + v.color + '22; border-left: 3px solid ' + v.color +
                    '; padding: 6px 10px; margin-bottom: 10px; border-radius: 4px; display: flex;' +
                    ' justify-content: space-between; align-items: center;',
                inner: '<span style="font-size: 11px;"><strong>' + v.icon + ' ' + v.label + '</strong>' +
                    '<span style="color: #64748b; margin-left: 8px;">' + head + '</span>' +
                    (v.stall === null ? '' : '<span style="color: #64748b; margin-left: 8px;">stall ' +
                        v.stall + ' % / target ' + v.stallTarget + ' %</span>') +
                    '<span style="color: #64748b; margin-left: 8px;">BW mín ' +
                    (v.bwMin === null ? '--' : v.bwMin + ' Mbps') + '</span></span>' +
                    (v.cta ? '<span style="color: #ef4444; font-size: 10px;">⚠️ ' +
                        String(v.cause || 'BW insuficiente').slice(0, 120) + '</span>' : '')
            };
        }

        _updateV31Metrics(performance) {
            // IDs explícitos (el selector legacy cogía la fila del TÍTULO, no la
            // del Risk Score, y por eso el número se quedaba clavado en 100).
            const setText = (id, text, color) => {
                const el = document.getElementById(id);
                if (!el) return false;
                el.textContent = text;
                if (color) el.style.color = color;
                return true;
            };
            setText('pm9_v31_t1t2', `${performance.t1_mbps || '~'}/${performance.t2_mbps || '~'}`);
            setText('pm9_v31_burst', `${performance.burst_factor || '~'}x`);
            setText('pm9_v31_floor', `${performance.stall_floor || '~'}%`);
            setText('pm9_v31_overhead', `${performance.request_overhead_sec || '~'}s`);
            // Sin medición real no se publica un Risk inventado (antes nacía en 100).
            const noEvidence = performance.evidence === false;
            setText('pm9_risk_score', noEvidence ? '--' : `${performance.risk_score ?? '--'}/100`,
                noEvidence ? '#64748b' : performance.risk_color);
            setText('pm9_risk_level', noEvidence
                ? '(sin medición)'
                : `(decode: ${performance.risk_level || 'N/A'} · no es salud global)`);

            // Health badge
            const healthBadge = document.getElementById('pm9_health_badge');
            if (healthBadge) {
                const color = performance.risk_score <= 30 ? '#10b981' : performance.risk_score <= 60 ? '#eab308' : '#ef4444';
                healthBadge.style.background = color;
                healthBadge.style.boxShadow = `0 0 8px ${color}55`;
                healthBadge.title = `Health: ${performance.risk_level || 'N/A'} (${performance.risk_score || 0}/100)`;
            }

            // Fallback legacy: solo si los IDs no existen (paneles viejos)
            if (!document.getElementById('pm9_risk_score')) {
                const metricsContainer = document.querySelector('.pm9-prefetch-preview');
                if (!metricsContainer) return;
                const riskRow = document.getElementById('pm9_risk_row');
                if (riskRow) {
                    const riskScore = riskRow.querySelector('span');
                    if (riskScore) {
                        riskScore.innerHTML = `🛡️ Risk Score: <strong style="color: ${performance.risk_color}">${performance.risk_score}</strong>/100 <span style="background: ${performance.risk_color}33; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${performance.risk_level}</span>`;
                    }
                }
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

                /* T6b — LAB SSOT badges + bulletproof details panel */
                .pm9-badge-lab {
                    display: inline-block;
                    font-size: 9px;
                    color: #10b981;
                    margin-left: 4px;
                    cursor: help;
                }
                .pm9-badge-manual {
                    display: inline-block;
                    font-size: 9px;
                    color: #f59e0b;
                    margin-left: 4px;
                    cursor: help;
                }
                input[data-lab-sourced="true"] {
                    border-left: 2px solid rgba(16, 185, 129, 0.5);
                }
                input[data-lab-sourced="false"] {
                    border-left: 2px solid rgba(245, 158, 11, 0.5);
                }
                .pm9-lab-bp-panel summary:hover {
                    background: rgba(16,185,129,0.12);
                }
                .pm9-lab-section summary:hover {
                    color: #10b981;
                }
                .pm9-lab-kv-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.72rem;
                    font-family: 'Consolas', 'Monaco', monospace;
                }
                .pm9-lab-kv-table tr {
                    border-bottom: 1px solid rgba(100,116,139,0.15);
                }
                .pm9-lab-kv-table tr:hover {
                    background: rgba(16,185,129,0.04);
                }
                .pm9-lab-kv-table td {
                    padding: 4px 8px;
                    vertical-align: top;
                }
                .pm9-lab-kv-table .pm9-lab-key {
                    color: #94a3b8;
                    width: 38%;
                    word-break: break-all;
                }
                .pm9-lab-kv-table .pm9-lab-val {
                    color: #e2e8f0;
                    word-break: break-all;
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

            // Calculate performance metrics (con los mismos inputs que usa
            // _updateStreamingHealth; antes se llamaba sin profileInputs y el
            // panel nacía con un Risk distinto al real).
            const bitrate = activeProfile.settings?.bitrate || 5;
            const performance = window.PREFETCH_PRESETS
                ? window.PREFETCH_PRESETS.estimatePerformance(prefetchConfig, bitrate, {
                    profileId: this.activeProfileId,
                    resolution: activeProfile.settings?.resolution || '1920x1080',
                    codec: activeProfile.settings?.codec || 'H265',
                    fps: activeProfile.settings?.fps || 60,
                    playerBufferMs: activeProfile.settings?.playerBuffer,
                    segmentDurationSec: activeProfile.settings?.segment_duration_s
                })
                : { fill_time_seconds: '~', bandwidth_usage_mbps: '~', memory_usage_mb: '~', stall_rate_percent: '~' };

            // ── Predicción AI: estado REAL (motor APE_PREDICT v1.0) ──────────
            // Sin medición se muestra "sin evidencia"; nunca se inventan Mbps.
            let aiStatus = null;
            let aiDecision = null;
            try {
                if (window.APE_PREDICT && typeof window.APE_PREDICT.snapshot === 'function') {
                    aiStatus = window.APE_PREDICT.snapshot();
                }
                if (window.APE_PREDICT && typeof window.APE_PREDICT.decide === 'function') {
                    aiDecision = window.APE_PREDICT.decide({
                        // settings.bitrate está en Mbps (UI); decide() lo espera en kbps
                        // como cfg.bitrate del generador. Sin ×1000 el headroom salía
                        // 1000× inflado (medido en Chrome: 16777× en vez de 16.78×).
                        bitrate: (Number(activeProfile.settings?.bitrate) || 0) * 1000,
                        prefetch_segments: prefetchConfig.prefetch_segments,
                        prefetch_parallel: prefetchConfig.parallel_downloads,
                        prefetch_buffer_target: (Number(prefetchConfig.buffer_target_seconds) || 0) * 1000,
                        segment_duration: activeProfile.settings?.segment_duration_s,
                        prefetch_ai_prediction: prefetchConfig.ai_prediction_enabled === true
                    });
                }
            } catch (e) { aiStatus = null; aiDecision = null; }
            const aiHasEvidence = !!(aiStatus && aiStatus.evidence && aiStatus.evidence.source === 'resource-timing');
            const aiColor = !prefetchConfig.ai_prediction_enabled ? '#64748b'
                : (aiHasEvidence ? (aiDecision && aiDecision.riskPct >= 35 ? '#ef4444' : aiDecision && aiDecision.riskPct >= 20 ? '#eab308' : '#10b981') : '#64748b');
            const aiLine = !prefetchConfig.ai_prediction_enabled
                ? 'Apagada — el generador declarará AI=disabled'
                : (aiHasEvidence
                    ? `medido ${(aiStatus.evidence.mbps || 0).toFixed(1)} Mbps · pronóstico ${(aiStatus.predicted || 0).toFixed(1)} Mbps · tendencia ${((aiStatus.trend || 0) * 100).toFixed(1)}% · conf ${(aiStatus.confidence || 0).toFixed(2)}`
                    : 'Sin evidencia medida todavía — pulsa «Medir ahora»');
            const aiRiskLine = (prefetchConfig.ai_prediction_enabled && aiDecision && aiDecision.riskPct !== null)
                ? `Riesgo ${aiDecision.riskPct}% · headroom ${aiDecision.headroom}× · aplicado ${aiDecision.applied.segments}×${aiDecision.applied.parallel} de ${aiDecision.declared.segments}×${aiDecision.declared.parallel}${aiDecision.restricted ? ' (estrechado)' : ''}`
                : '';

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
                        
                        <p class="pm9-prefetch-desc">${this.coherentVerdictHtml(activeProfile, prefetchConfig.strategy)}</p>
                        
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
                                <label>BW Mínimo (Mbps) <span style="font-size:9px;color:#10b981;">AUTO ×1.15 (exigencia)</span></label>
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

                        <!-- Predicción AI — estado medido (APE_PREDICT v1.0) -->
                        <div class="pm9-ai-status" style="margin: 8px 0 4px; padding: 7px 9px; border-radius: 4px;
                             background: rgba(255,255,255,0.04); border-left: 3px solid ${aiColor};">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                                <span style="font-size:10px; color:${aiColor}; font-weight:600;">
                                    ${aiHasEvidence ? '● MEDIDO' : '○ SIN EVIDENCIA'} · horizonte 10 s
                                </span>
                                <button onclick="window.ProfileManagerV9.measurePredictiveAI()"
                                        style="font-size:9px; padding:2px 8px; cursor:pointer; border-radius:3px;
                                               border:1px solid ${aiColor}66; background:transparent; color:${aiColor};">
                                    Medir ahora
                                </button>
                            </div>
                            <div style="font-size:9px; color:#94a3b8; margin-top:4px; line-height:1.35;">${aiLine}</div>
                            ${aiRiskLine ? `<div style="font-size:9px; color:${aiColor}; margin-top:3px;">${aiRiskLine}</div>` : ''}
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
                            ${(function (PMi) {
                                /* [t20] banner desde la FUENTE ÚNICA (el plan). */
                                const b = PMi._verdictHtmlBanner();
                                return '<div class="pm9-stability-banner" style="' + b.style + '">' + b.inner + '</div>';
                            })(this)}
                            
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
                                        <div id="pm9_v31_t1t2" style="color: #00ff41; font-family: monospace;">${performance.t1_mbps || '~'}/${performance.t2_mbps || '~'}</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="color: #64748b;">Burst</div>
                                        <div id="pm9_v31_burst" style="color: #00ff41; font-family: monospace;">${performance.burst_factor || '~'}x</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="color: #64748b;">Floor</div>
                                        <div id="pm9_v31_floor" style="color: #00ff41; font-family: monospace;">${performance.stall_floor || '~'}%</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="color: #64748b;">Overhead</div>
                                        <div id="pm9_v31_overhead" style="color: #00ff41; font-family: monospace;">${performance.request_overhead_sec || '~'}s</div>
                                    </div>
                                </div>
                            </div>
                            ` : ''}
                            
                            <!-- Risk Score & Target -->
                            <div id="pm9_risk_row" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                                ${performance.risk_score !== undefined ? `
                                <div style="font-size: 10px;">
                                    🎲 Risk Score: 
                                    <span id="pm9_risk_score" style="
                                        color: ${performance.risk_color || '#64748b'};
                                        font-weight: bold;
                                    ">${performance.risk_score}/100</span>
                                    <span id="pm9_risk_level" style="color: #64748b; margin-left: 4px;">(${performance.risk_level || 'N/A'})</span>
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
                            ${(function (PMi) {
                                /* [t20] la CTA la dicta el PLAN: sólo si es incoherente. */
                                const v = PMi._verdict();
                                if (!v.cta) return '';
                                return '<div style="margin-top: 6px; padding: 4px 8px; background: rgba(239,68,68,0.2); border-radius: 4px; text-align: center;">' +
                                    '<span style="font-size: 10px; color: #ef4444; font-weight: 600;">🚨 ACCIÓN URGENTE REQUERIDA</span>' +
                                    (v.cause ? '<div style="font-size: 9px; color: #fca5a5; margin-top: 2px;">' + String(v.cause).slice(0, 160) + '</div>' : '') +
                                    '</div>';
                            })(this)}
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
                /* [t13 2026-11-17] El preset NO es la decisión: son valores
                 * fijos por estrategia (prefetch-presets.js:99-102) que daban
                 * BUFFER 90 s · BW MÍNIMO 70 Mbps · RAM 10800/12150 MB contra
                 * una red de 0.1 Mbps. Ahora, si hay medición, los CUATRO campos
                 * los deriva APE_HEALTH_TUNER.coherentPlan() y el preset queda
                 * sólo como respaldo declarado cuando no hay medición. */
                this.applyCoherentPlan(strategyId);
                // Refresh the panel to show new values (con los cuatro nuevos)
                this.render();
                this._paintCoherentValues();
                this._updateStreamingHealth();
                return this._lastCoherent;
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

                    /* [t21] el ajuste debe generar la CASCADA completa (misma aridad
                     * que el perfil), no un único token: el perfil declara
                     * X-Parallel-Segments="8,6,4,2" y X-Prefetch-Segments="12,10,8,6". */
                    this._reconcilePlanCascades(profile, {
                        prefetch_segments: segments,
                        parallel_downloads: value
                    });
                }

                // v3.1: Actualizar Streaming Health en tiempo real
                this._updateStreamingHealth();
            }
        }

        /* ═══════════════════════════════════════════════════════════════════
         * PLAN COHERENTE POR ESTRATEGIA — cableado del motor (t13 2026-11-17)
         * ═══════════════════════════════════════════════════════════════════
         * Los cuatro campos del panel (segmentos, paralelas, buffer objetivo y
         * BW mínimo) dejan de venir del preset y los deriva
         * window.APE_HEALTH_TUNER.coherentPlan() desde la MEDICIÓN y el
         * presupuesto de RAM. El preset sólo sobrevive cuando coherentPlan
         * devuelve values:null (sin medición), y entonces el panel lo DICE.
         *
         * No se toca ninguna de las 4 fórmulas del tuner, ni la cadena de
         * fallbacks F0-F5, ni los tiers: aquí sólo se llama y se escriben
         * valores por las APIs del modelo (updatePrefetchSetting).
         * ═══════════════════════════════════════════════════════════════════ */

        /* Dominio REAL de los cuatro controles: los min/max con los que
         * _renderPrefetchSection pinta los inputs (segmentos 5..200, paralelas
         * 1..50, buffer 10..600). El plan se recorta a lo que el control puede
         * representar y cada recorte se declara; NO se cambia el min/max del
         * HTML, porque eso sería alterar la validación prediseñada. */
        _prefetchFieldDomain() {
            return {
                prefetch_segments:     { min: 5,  max: 200 },
                parallel_downloads:    { min: 1,  max: 50 },
                buffer_target_seconds: { min: 10, max: 600 },
                min_bandwidth_mbps:    { min: 0,  max: 10000 }   // readonly
            };
        }

        /* Margen de seguridad: la MISMA constante que usa el tuner
         * (APE_HEALTH_TUNER.DEFAULTS.margin) y que ya rige el panel en
         * streaming-calculator.js:45 (SAFETY_MARGIN = 1.15). Sin tuner cargado
         * el respaldo es 1.15, no 3. */
        _safetyMargin() {
            const T = (typeof window !== 'undefined') ? window.APE_HEALTH_TUNER : null;
            const m = (T && T.DEFAULTS && Number(T.DEFAULTS.margin));
            return (isFinite(m) && m > 0) ? m : 1.15;
        }

        /* ═══════════════════════════════════════════════════════════════════
         * PERFIL DE RED = REFERENCIA DEL CÁLCULO (encargo 2026-11-17)
         *
         * El módulo «Configuración Inteligente QoS (Latencia Rayo)» de app.js
         * mide la red de VERDAD (sonda APE_BW_METER + HEAD al mismo origen) y
         * guarda {downloadMbps, pingMs, timestamp}. Ese perfil es la referencia:
         * coherentPlan recibe SU downloadMbps como measuredMbpsSafe, en vez de
         * que cada pieza calcule por su cuenta.
         *
         * TTL: el gobernador reescribe el perfil cada 30 s, así que 5 minutos
         * son 10 ciclos perdidos. Más viejo que eso NO es referencia → el plan
         * devuelve NO_MEASUREMENT, como ya hacía sin medición.
         * ═══════════════════════════════════════════════════════════════════ */
        _networkProfileTtlMs() { return 5 * 60 * 1000; }

        /* ═══════════════════════════════════════════════════════════════════
         * PEAK-HOLD (t16 2026-11-18)
         *
         * DEFECTO MEDIDO POR EL OPERADOR: minuto 0 el panel daba 240,97 Mbps
         * (Risk 5, headroom 635 %); un ciclo malo posterior dio 18,72 Mbps y el
         * panel cayó a Risk 81 / headroom -43 % / plan INCOHERENTE. El plan se
         * calculaba con la ULTIMA muestra, así que un dip borraba la capacidad.
         *
         * REGLA: la capacidad de referencia es el MAXIMO SOSTENIDO en ventana.
         *   N   = 20 ciclos      (configurable en _peakCfg)
         *   TTL = 10 min         (declarado; el peak caduca y entonces se baja)
         * Un ciclo por debajo NO borra el peak ni el plan: se marca 'dip' y se
         * conserva el ultimo plan coherente. Solo al CADUCAR el peak se recalcula
         * desde el nuevo maximo y se declara 'peak expirado'. Sin muestras ->
         * NO_MEASUREMENT (no se inventa nada).
         * ═══════════════════════════════════════════════════════════════════ */
        _peakCfg() {
            return { maxCycles: 20, ttlMs: 10 * 60 * 1000, dipRatio: 0.8 };
        }

        _peakLoad() {
            if (Array.isArray(this._peakSamples)) return this._peakSamples;
            this._peakSamples = [];
            try {
                if (typeof localStorage !== 'undefined' && localStorage.getItem) {
                    const raw = localStorage.getItem('ape_peak_hold_v1');
                    if (raw) {
                        const o = JSON.parse(raw);
                        if (o && Array.isArray(o.samples)) {
                            this._peakSamples = o.samples.filter(s => s && isFinite(Number(s.mbps)) && Number(s.mbps) > 0)
                                .map(s => ({ mbps: Number(s.mbps), at: Number(s.at) || 0 }));
                        }
                    }
                }
            } catch (e) { /* sin persistencia: se sigue en memoria */ }
            return this._peakSamples;
        }

        _peakSave() {
            try {
                if (typeof localStorage === 'undefined' || !localStorage.setItem) return;
                localStorage.setItem('ape_peak_hold_v1', JSON.stringify({
                    v: 1, ts: Date.now(), samples: this._peakSamples.slice(-this._peakCfg().maxCycles)
                }));
            } catch (e) { /* no bloqueante */ }
        }

        /* Registra una medición en la ventana del peak-hold. */
        _peakRecord(mbps, atMs) {
            const m = Number(mbps);
            if (!isFinite(m) || m <= 0) return null;
            const cfg = this._peakCfg();
            const at = Number(atMs) || Date.now();
            const arr = this._peakLoad();
            const last = arr.length ? arr[arr.length - 1] : null;
            if (last && last.mbps === m && (at - last.at) < 1000) return arr;   // idempotente en el mismo ms
            arr.push({ mbps: m, at: at });
            while (arr.length > cfg.maxCycles) arr.shift();
            this._peakSave();
            return arr;
        }

        /* Capacidad de referencia (peak) + valor instantaneo + estado del dip. */
        /* [t30] medición REAL del medidor desplegado (ape-speed-meter-v9.js).
         * Devuelve la fuente y, si no sirve, el motivo — nunca un número pequeño. */
        _speedmeterMeasure() {
            const w = (typeof window !== 'undefined') ? window : {};
            const last = w.APE_SPEEDMETER_LAST;
            const med = last && last.medicion;
            if (!med) return { ok: false, reason: 'sin medición del medidor' };
            const p10 = Number(med.mbps_p10);
            if (!isFinite(p10) || p10 <= 0) return { ok: false, reason: 'mbps_p10 no válido' };
            const bytes = Number(med.bytesTransferred || med.bytes || 0);
            const MIN = 2 * 1024 * 1024;   // 2 MiB: por debajo no hay régimen
            if (!(bytes >= MIN)) {
                return { ok: false, reason: 'muestra insuficiente (' + bytes + ' B < ' + MIN + ' B)', bytes: bytes };
            }
            return { ok: true, mbps: p10, source: 'ape-speed-meter (p10)', bytes: bytes };
        }

        /* [t30] ¿este perfil de red viene de una ESTIMACIÓN del navegador? */
        _isBrowserEstimate(np) {
            const src = String((np && np.source) || '').toLowerCase();
            return src.indexOf('navigator') >= 0 || src.indexOf('downlink') >= 0;
        }

        /* [t30] CAPACIDAD con precedencia declarada:
         *   1) medición real del medidor (p10)
         *   2) peak-hold de mediciones reales
         *   3) navigator.connection.downlink  ← ÚLTIMO RECURSO, declarado
         * Sin ninguna fuente válida: NO COMPUTADO con motivo. */
        _capacitySource() {
            const np = this._networkProfile();
            const real = this._speedmeterMeasure();
            const capP = this._capacity();
            if (real.ok) {
                return { mbps: real.mbps, source: real.source, noComputado: false, reason: null };
            }
            if (capP && capP.mbps && !this._isBrowserEstimate(np)) {
                return { mbps: capP.mbps, source: 'peak-hold', noComputado: false, reason: null };
            }
            if (np && np.fresh && !this._isBrowserEstimate(np)) {
                return { mbps: np.downloadMbps, source: 'sonda de red (' + (np.source || 'probe') + ')', noComputado: false, reason: null };
            }
            if (np && np.fresh) {
                return {
                    mbps: np.downloadMbps, source: 'navigator.connection.downlink (estimación)',
                    noComputado: false, reason: null, ultimoRecurso: true
                };
            }
            return {
                mbps: null, source: null, noComputado: true,
                reason: real.reason || 'sin medición real ni peak-hold'
            };
        }

        _capacity() {
            const cfg = this._peakCfg();
            const arr = this._peakLoad();
            const np = this._networkProfile();
            /* [t30] una ESTIMACIÓN del navegador (navigator.connection.downlink,
             * ~0.39 Mbps en escritorio) NO se registra como muestra de capacidad. */
            if (np && np.fresh && !this._isBrowserEstimate(np)) {
                const last = arr.length ? arr[arr.length - 1] : null;
                if (!last || (Number(np.timestamp) || 0) > last.at) {
                    this._peakRecord(np.downloadMbps, np.timestamp);
                }
            }
            const nowMs = Date.now();
            const vivos = arr.filter(s => (nowMs - s.at) <= cfg.ttlMs);
            if (!vivos.length) {
                return { mbps: (arr.length ? Math.max.apply(null, arr.map(function (s) { return s.mbps; })) : null), now: (arr.length ? arr[arr.length - 1].mbps : null), peak: (arr.length ? Math.max.apply(null, arr.map(function (s) { return s.mbps; })) : null), dip: false, expired: arr.length > 0,
                         samples: arr.length, cfg: cfg, state: (arr.length ? 'MEASURED_STALE' : 'NO_MEASUREMENT') };
            }
            let peak = vivos[0];
            for (let i = 1; i < vivos.length; i++) { if (vivos[i].mbps > peak.mbps) peak = vivos[i]; }
            const instante = vivos[vivos.length - 1].mbps;
            /* 'expirado': hubo una muestra mayor que la del peak actual y ya salio
             * de la ventana -> el peak anterior caduco. */
            const expirado = arr.some(s => s.mbps > peak.mbps);
            return {
                mbps: peak.mbps,                    // CAPACIDAD DE REFERENCIA
                peak: peak.mbps,
                peakAt: peak.at,
                peakAgeMs: nowMs - peak.at,
                now: instante,                      // ultima muestra (puede ser un dip)
                dip: instante < peak.mbps * cfg.dipRatio,
                dipRatio: Math.round((instante / peak.mbps) * 100) / 100,
                expired: expirado,
                samples: vivos.length,
                cfg: cfg,
                state: 'MEASURED'
            };
        }

        _networkProfile() {
            let np = null;
            try {
                if (typeof window !== 'undefined' && window.app && window.app.state) {
                    np = window.app.state.networkProfile || null;
                }
            } catch (e) { np = null; }
            if (!np && typeof localStorage !== 'undefined' && localStorage.getItem) {
                try {
                    const raw = localStorage.getItem('iptv_qos_profile');
                    if (raw) np = JSON.parse(raw);
                } catch (e) { np = null; }
            }
            if (!np) return null;
            const mbps = Number(np.downloadMbps);
            if (!isFinite(mbps) || mbps <= 0) return null;
            const pingNum = Number(np.pingMs);
            const ts = Number(np.timestamp) || 0;
            const age = Date.now() - ts;
            return {
                downloadMbps: mbps,
                pingMs: (isFinite(pingNum) && pingNum > 0) ? pingNum : null,
                timestamp: ts, ageMs: age,
                fresh: ts > 0 && age >= 0 && age <= this._networkProfileTtlMs(),
                source: np.source || 'unknown',
                ttlMs: this._networkProfileTtlMs()
            };
        }

        /* Medición de referencia: el PERFIL DE RED si está fresco. Si no existe
         * o caducó, null → coherentPlan devuelve NO_MEASUREMENT (no se inventa).
         * El perfil lo escribe el gobernador en cada ciclo con la sonda que ya
         * hizo (una sola medición por ciclo). */
        _freshMeasurement() {
            const np = this._networkProfile();
            /* [t17] tras un reload NO hay networkProfile vivo pero SÍ snapshot y
             * peak persistido: la capacidad medida sigue siendo válida. Sin
             * muestras (ni perfil ni peak) se mantiene NO_MEASUREMENT. */
            if (!np || !np.fresh) {
                const capSolo = this._capacity();
                if (capSolo && capSolo.mbps) {
                    return {
                        measuredMbpsSafe: capSolo.mbps,
                        nowMbps: capSolo.now, peakMbps: capSolo.peak,
                        dip: !!capSolo.dip, expired: !!capSolo.expired,
                        pingMs: null,
                        source: 'peak-hold (snapshot)',
                        ageMs: capSolo.peakAgeMs
                    };
                }
                return null;
            }
            if (np && np.fresh) {
                /* [t16] la referencia es la CAPACIDAD SOSTENIDA (peak-hold), no el
                 * ultimo ciclo: un dip no debe romper el plan. */
                const cap = this._capacity();
                return {
                    measuredMbpsSafe: (cap && cap.mbps) ? cap.mbps : np.downloadMbps,
                    nowMbps: np.downloadMbps,
                    peakMbps: (cap && cap.peak) ? cap.peak : np.downloadMbps,
                    dip: !!(cap && cap.dip),
                    expired: !!(cap && cap.expired),
                    headroomRatio: null,        // coherentPlan deriva measured/required
                    pingMs: np.pingMs,
                    source: 'networkProfile',
                    ageMs: np.ageMs
                };
            }
            return null;
        }

        /* El tuner nombra sus presets por NOMBRE ('Ultra-Agresivo'), el select
         * por id ('ULTRA_AGRESIVO'). Se traduce con el nombre del preset. */
        _strategyNameFor(strategyId) {
            const all = (typeof window !== 'undefined' && window.PREFETCH_STRATEGIES) || {};
            const s = all[strategyId];
            return (s && s.name) ? s.name : strategyId;
        }

        /* Bitrate con el que el PANEL estima el stall: NO el del perfil, sino el
         * que calcula el propio calculador del panel a partir de resolución,
         * códec y fps (streaming-calculator.js:215-231 calculateBitrate, con
         * compressionMult por defecto 0.22 tal como lo usa calculateAllMetrics
         * en :537). Se usa la función REAL cuando está cargada; si no, se
         * devuelve null y coherentPlan aplica su base conservadora declarada
         * (stallBasis='required_fallback'). */
        _stallBitrateFor(profile) {
            const st = (profile && profile.settings) || {};
            const SC = (typeof window !== 'undefined') ? window.StreamingCalculator : null;
            if (!SC || typeof SC.calculateBitrate !== 'function') return null;
            try {
                const b = SC.calculateBitrate(
                    st.resolution || '1920x1080',
                    st.codec || 'H265',
                    Number(st.fps) || 60
                );
                return (isFinite(b) && b > 0) ? b : null;
            } catch (e) { return null; }
        }

        /* Target de stall del panel: STREAMING_CONSTANTS.TARGET_STALL_RATE
         * (streaming-calculator.js:42 y :670), que es el mismo 1.67 % que pinta
         * el chip «Target: <1.67 %». Sin calculador cargado, el del tuner. */
        _stallTargetPct() {
            const C = (typeof window !== 'undefined') ? window.STREAMING_CONSTANTS : null;
            const t = (C && Number(C.TARGET_STALL_RATE)) || null;
            if (t && isFinite(t) && t > 0) return t;
            const T = (typeof window !== 'undefined') ? window.APE_HEALTH_TUNER : null;
            const d = (T && T.STALL && Number(T.STALL.target)) || null;
            return (d && isFinite(d) && d > 0) ? d : 1.67;
        }

        /* Base de exigencia del PLAN, la MISMA que usa coherentPlan para el
         * modelo de stall (calculateBitrate del panel). Orden de precedencia:
         *   1. override manual del operador sobre el bitrate  → settings.bitrate
         *   2. calculateBitrate del panel                     → base del plan
         *   3. sin calculador                                 → settings.bitrate (declarado)
         * El riesgo y el headroom del panel se calculan con ESTA base, no con el
         * bitrate declarado a secas: eran dos bases distintas y de ahí el 95. */
        _requiredMbpsBasis(profile) {
            const p = profile || (this.config && this.config.getProfile
                ? this.config.getProfile(this.activeProfileId) : null);
            const st = (p && p.settings) || {};
            const declared = Number(st.bitrate) || 0;
            const calc = this._stallBitrateFor(p);
            if (declared > 0 && st.bitrate_user_override === true) {
                return { mbps: declared, source: 'settings.bitrate (override del operador)' };
            }
            if (calc && calc > 0) return { mbps: calc, source: 'calculateBitrate del panel' };
            if (declared > 0) return { mbps: declared, source: 'settings.bitrate (sin calculador)' };
            /* [2026-11-20 · OPERADOR: "P4, P5 aparecen sin headroom"] La base caia a 0 en
             * los perfiles de exigencia minima y con base 0 el bloque de riesgo daba "--".
             * Un perfil de video SIEMPRE exige algo: maxBitrateKbps declarado si existe
             * y, si no, un piso de 0,5 Mbps NOMBRADO en la fuente (sin numeros magicos). */
            const _maxK = Number(st.maxBitrateKbps) || 0;
            if (_maxK > 0) return { mbps: _maxK / 1000, source: 'settings.maxBitrateKbps (declarado)' };
            return { mbps: 0.5, source: 'piso minimo de video 0,5 Mbps (perfil sin bitrate declarado)' };
        }

        /* ═════════════════════════════════════════════════════════════════════════
     * APLICACION AUTOMATICA DE PARAMETROS (2026-11-20)
     *
     * Entrada: la medicion r del ciclo (r.measurement.mbpsSafe, r.headroomRatio).
     * Motor:   APE_HEALTH_TUNER.deterministic(mbps, ratio, segDur) — formulas ya
     *          escritas (bufferForRatio, timeoutForRatio, prefetchForBuffer,
     *          parallelForRatio). AQUI NO SE ELIGE NINGUN VALOR A MANO.
     * Salida:  por CADA uno de los 12 perfiles, con SU propio ratio
     *          (medido / exigido por ese perfil):
     *            settings.buffer            = bufferTargetS * 1000  (ms)
     *            vlcopt['network-caching']  = bufferTargetS * 1000  (ms, VLC)
     *            settings.network_timeout_ms= readTimeoutMs
     *            prefetch_config.prefetch_segments / parallel_downloads
     *          y se persiste (config.save) para que la generacion lo herede.
     * Si no hay medicion valida NO se toca nada y se devuelve null.
     * ═════════════════════════════════════════════════════════════════════════ */
    _applyAutoTune(r) {
        try {
            const T = (typeof window !== 'undefined') ? window.APE_HEALTH_TUNER : null;
            const cfg = this.config;
            if (!T || typeof T.deterministic !== 'function' || !cfg || typeof cfg.getProfile !== 'function') return null;
            const acc = (r && r.measurement) || {};
            /* [2026-11-21 · MEDIDO] GATE DE PROCEDENCIA. Un número sólo mueve
             * parámetros si describe TRANSPORTE. Caso real: la sonda estaba
             * bloqueada por preflight (405 → status 0), `mode:'auto'` cayó al
             * sampler pasivo y publicó 0.2 Mbps de tráfico incidental de la
             * página; este método reescribió los 12 perfiles a 0.01x. La ley
             * anti-degradación prohíbe degradar por un no-dato. Sin procedencia
             * verificable: no se toca nada y se nombra la causa. */
            const BW = (typeof window !== 'undefined') ? window.APE_BW_METER : null;
            if (BW && typeof BW.isTrustworthyMeasurement === 'function') {
                const tv = BW.isTrustworthyMeasurement(r);
                if (!tv.ok) {
                    this._lastAutoTuneSkip = { at: Date.now(), reason: tv.reason };
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[AUTO-TUNE] omitido: ' + tv.reason + ' (los perfiles NO se tocan)');
                    }
                    return null;
                }
            }
            const mbps = (typeof acc.mbpsSafe === 'number' && isFinite(acc.mbpsSafe) && acc.mbpsSafe > 0) ? acc.mbpsSafe : null;
            if (mbps === null) return null;

            /* [2026-11-21 · MEDIDO] HISTÉRESIS ASIMÉTRICA contra el vaivén real de la
             * sesión: 355 → 1.18 → 102 Mbps en 90 s, tres planes distintos y los 12
             * perfiles reescritos tres veces. SUBIR es inmediato (una medición mejor
             * siempre se aprovecha). BAJAR exige DOS mediciones consecutivas dentro de
             * 10 min: una caída súbita puede ser una sonda defectuosa, no el enlace.
             * El estado vive en el ledger, así que sobrevive a la recarga (F5). */
            const LED = (typeof window !== 'undefined') ? window.APE_LEDGER : null;
            const HOLD_MS = 10 * 60 * 1000;
            if (LED && typeof LED.getState === 'function') {
                const prev = LED.getState() || null;
                const prevMbps = (prev && Number(prev.mbps) > 0) ? Number(prev.mbps) : null;
                const prevAt = (prev && Number(prev.at)) ? Number(prev.at) : 0;
                const reciente = prevMbps !== null && (Date.now() - prevAt) < HOLD_MS;
                if (reciente && mbps < prevMbps * 0.5) {
                    const pend = (Number(prev.pendingLow) || 0) + 1;
                    if (pend < 2) {
                        LED.setState({ pendingLow: pend, lastLowMbps: mbps, lastLowAt: Date.now(), mbps: prevMbps, reason: 'caída súbita en espera de confirmación' });
                        this._lastAutoTuneHold = { at: Date.now(), mbps: mbps, prevMbps: prevMbps, pendingLow: pend };
                        if (typeof console !== 'undefined' && console.warn) {
                            console.warn('[AUTO-TUNE] en espera (' + pend + '/2): ' + mbps + ' Mbps es <50% de ' + prevMbps + ' Mbps recientes. Perfiles intactos; se confirma con la próxima medición.');
                        }
                        return null;
                    }
                }
                LED.setState({ mbps: mbps, pendingLow: 0, confirmedAt: Date.now(), reason: 'aplicado', scope: acc.scope || null });
            }
            const ids = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P0.5', 'P1.5', 'P2.5', 'P3.5', 'P4.5', 'P5.5'];
            const aplicado = [];
            for (const id of ids) {
                const p = cfg.getProfile(id);
                if (!p) continue;
                const req = this._requiredMbpsBasis(p).mbps;
                if (!(req > 0)) continue;
                const ratio = Math.round((mbps / req) * 100) / 100;
                const det = T.deterministic(mbps, ratio, 6);
                if (!det) continue;
                const cacheMs = Math.round(det.bufferTargetS * 1000);
                p.settings = p.settings || {};
                p.settings.buffer = cacheMs;
                p.settings.bufferSeconds = det.bufferTargetS;
                p.settings.network_timeout_ms = det.readTimeoutMs;
                p.vlcopt = p.vlcopt || {};
                p.vlcopt['network-caching'] = String(cacheMs);
                p.prefetch_config = p.prefetch_config || {};
                p.prefetch_config.prefetch_segments = det.prefetchSegments;
                p.prefetch_config.parallel_downloads = det.parallelDownloads;
                aplicado.push({ id: id, ratio: ratio, cacheMs: cacheMs, timeoutMs: det.readTimeoutMs,
                    prefetch: det.prefetchSegments, parallel: det.parallelDownloads });
            }
            if (!aplicado.length) return null;
            if (typeof cfg.save === 'function') cfg.save();
            /* [2026-11-21 · ENCARGO] El CÁLCULO también se persiste: qué número lo
             * produjo, con qué ámbito, y el antes/después de cada perfil. Única
             * fuente de verdad del plan aplicado, cubre la vía del gobernador y la
             * del botón AUTO-AJUSTAR. Si el ledger falla, el tune sigue. */
            if (LED && typeof LED.pushPlan === 'function') {
                try {
                    LED.pushPlan({
                        mbps: mbps,
                        alcance: 'todos',
                        source: acc.source || (r && r.source) || 'APE_BW_METER',
                        scope: acc.scope || null,
                        perfiles: aplicado
                    });
                } catch (e) { /* el ledger nunca rompe el tune */ }
            }
            this._lastAutoTune = { at: Date.now(), mbps: mbps, perfiles: aplicado };
            if (typeof console !== 'undefined') {
                console.log('[AUTO-TUNE] aplicado a ' + aplicado.length + ' perfiles · medido ' + mbps +
                    ' Mbps · ' + aplicado.map(a => a.id + ':' + a.cacheMs + 'ms/' + a.timeoutMs + 'ms/' + a.ratio + 'x').join(' '));
            }
            if (typeof document !== 'undefined') {
                try { this.render(); } catch (_r) { }
            }
            return this._lastAutoTune;
        } catch (_e) { return null; }
    }

    _coherentPlanFor(profile, strategyId) {
            const T = (typeof window !== 'undefined') ? window.APE_HEALTH_TUNER : null;
            if (!T || typeof T.coherentPlan !== 'function') return null;
            const p = profile || (this.config && this.config.getProfile
                ? this.config.getProfile(this.activeProfileId) : null);
            const st = (p && p.settings) || {};
            const cfg = (this.config && this.config.getPrefetchConfig)
                ? (this.config.getPrefetchConfig(this.activeProfileId) || {}) : {};
            const sid = strategyId || cfg.strategy;
            const meas = this._freshMeasurement() || {};
            /* [t19] base REAL de la exigencia (la misma que pinta el display) */
            const baseReal = this._requiredMbpsBasis(p);
            return T.coherentPlan({
                requiredMbps: (baseReal && baseReal.mbps > 0) ? baseReal.mbps : (Number(st.bitrate) || 0),
                /* requiredMbps ya se pasa arriba con la base REAL del perfil */
                measuredMbpsSafe: meas.measuredMbpsSafe,
                headroomRatio: meas.headroomRatio,
                segDurationSec: Number(st.segment_duration_s) || 0,
                ramBudgetMB: (T.DEFAULTS && T.DEFAULTS.ramBudgetMB) || undefined,
                margin: this._safetyMargin(),
                strategy: this._strategyNameFor(sid),
                /* [t13] el plan debe razonar con el MISMO bitrate y el MISMO
                 * target de stall con los que el panel pintará el chip, para que
                 * el ok:true del plan y el verde del chip no puedan divergir. */
                bitrateForStall: this._stallBitrateFor(p) || undefined,
                /* trazabilidad: de dónde salió la exigencia */
                requiredBasis: baseReal ? baseReal.source : 'sin base',
                targetStallPct: this._stallTargetPct()
            });
        }

        /* Recorta los valores del plan al dominio del panel. Puro: no escribe.
         * Devuelve {values, clamped[]} para que el mismo recorte se use al
         * aplicar Y al declararlo en pantalla (sin dos verdades distintas).
         *
         * OJO CON LAS DOS NOMENCLATURAS: coherentPlan devuelve camelCase
         * (bufferTargetS / prefetchSegments / parallelDownloads / bwMinMbps) y
         * los cuatro controles del panel son snake_case (buffer_target_seconds
         * ...). Este es el ÚNICO mapa entre las dos: sin él el recorte devolvía
         * {} y no se aplicaba ni un campo (medido en el test t13). */
        _planKeyMap() {
            return {
                prefetch_segments:     'prefetchSegments',
                parallel_downloads:    'parallelDownloads',
                buffer_target_seconds: 'bufferTargetS',
                min_bandwidth_mbps:    'bwMinMbps'
            };
        }

        _clampPlanValues(values) {
            const dom = this._prefetchFieldDomain();
            const KEYMAP = this._planKeyMap();
            const out = {}, clamped = [];
            Object.keys(dom).forEach((k) => {
                const src = values ? values[KEYMAP[k]] : undefined;
                if (src === undefined || src === null) return;
                const raw = Math.round(Number(src));
                if (!isFinite(raw)) return;
                const r = dom[k];
                const v = Math.min(r.max, Math.max(r.min, raw));
                if (v !== raw) {
                    clamped.push({ key: k, plan: raw, applied: v,
                                   reason: 'el control sólo admite [' + r.min + ', ' + r.max + ']' });
                }
                out[k] = v;
            });
            return { values: out, clamped: clamped };
        }

        /* Aplica el plan a los CUATRO campos por la API del modelo.
         * Devuelve el plan (con ._applied y ._clamped) para poder verificarlo
         * desde consola. Si no hay medición NO escribe: no hay plan. */
        applyCoherentPlan(strategyId) {
            const profile = (this.config && this.config.getProfile)
                ? this.config.getProfile(this.activeProfileId) : null;
            const plan = this._coherentPlanFor(profile, strategyId);
            this._lastCoherent = plan;
            if (!plan || !plan.values) return plan;
            if (!this.config || typeof this.config.updatePrefetchSetting !== 'function') return plan;
            const c = this._clampPlanValues(plan.values);
            const applied = this._applyPlanValues(c.values);
            if (Object.keys(applied).length) this._lastAppliedSet = applied;
            plan._applied = applied;
            plan._clamped = c.clamped;
            return plan;
        }

        /* Veredicto del plan en texto (misma fuente para el render y para el
         * repintado tras medir, para que no haya dos verdades). */
        coherentVerdictHtml(profile, strategyId) {
            const all = (typeof window !== 'undefined' && window.PREFETCH_STRATEGIES) || {};
            const cfg = (this.config && this.config.getPrefetchConfig)
                ? (this.config.getPrefetchConfig(this.activeProfileId) || {}) : {};
            const sid = strategyId || cfg.strategy;
            const base = (all[sid] && all[sid].description) || 'Configuración personalizada';
            const plan = this._coherentPlanFor(profile, sid);
            const margin = this._safetyMargin();

            if (!plan || plan.state === 'NO_MEASUREMENT' || !plan.values) {
                return base + ' <span style="color:#64748b;">· plan: SIN MEDICIÓN — los cuatro ' +
                    'campos quedan del preset, no calculados (pulsa «Medir ahora»)</span>';
            }

            const c = this._clampPlanValues(plan.values);
            const v = c.values;
            const clampTxt = c.clamped.length
                ? ' <span style="color:#94a3b8;">(' + c.clamped.map(function (x) {
                      return x.key + ' ' + x.plan + '→' + x.applied + ' por el mínimo del control';
                  }).join(' · ') + ')</span>'
                : '';

            /* El stall estimado y su base se publican SIEMPRE: es lo que hace
             * verificable el verde (target del panel vs estimación del plan). */
            const m = plan.metrics || {};
            const stallTxt = (m.stallEstimatePct === null || m.stallEstimatePct === undefined)
                ? ''
                : ' · stall est. ' + m.stallEstimatePct + ' % ' +
                        ((Number(m.stallEstimatePct) <= Number(m.targetStallPct))
                            ? ('≤ target ' + m.targetStallPct + ' %')
                            : ('SUPERA el target ' + m.targetStallPct + ' %')) +
                  (m.stallBasis === 'required_fallback' ? ' [base conservadora: bitrate del perfil]' : '');

            if (plan.ok) {
                return base + ' <span style="color:#10b981;font-weight:600;">· ✓ plan COHERENTE</span>' +
                    '<span style="color:#94a3b8;"> ' + m.measuredMbps + ' Mbps medidos ≥ ' +
                    'exigido×' + margin + ' = ' + v.min_bandwidth_mbps + ' Mbps · buffer ' +
                    v.buffer_target_seconds + ' s · ' + v.prefetch_segments + ' seg · ' +
                    v.parallel_downloads + ' paralelas' + stallTxt + '</span>' + clampTxt;
            }
            return base + ' <span style="color:#ef4444;font-weight:600;">· ✗ plan INCOHERENTE</span>' +
                '<span style="color:#fca5a5;"> ' + (plan.violations || []).join(' · ')
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
                '<span style="color:#eab308;"> · red mínima para verde: ' +
                plan.neededMbpsForGreen + ' Mbps útiles / ' +
                (function () {
                    /* el panel sólo cuenta el 90 % de lo medido (duty de la
                     * estrategia): el bruto necesario es útil / duty. */
                    const duty = Number(m && m.demandDuty) || 1;
                    return (Math.round((plan.neededMbpsForGreen / duty) * 100) / 100) + ' Mbps medidos' +
                        (duty !== 1 ? ' (factor ' + duty + ')' : '');
                })() +
                (plan.neededBufferS ? ' · buffer mínimo para el target: ' + plan.neededBufferS + ' s' : '') +
                '</span>' + stallTxt + clampTxt;
        }

        /* Pinta los cuatro controles + la línea de veredicto con los valores
         * NUEVOS, sin reconstruir el panel (no se pierde el foco). Los ids son
         * los que ya existen en _renderPrefetchSection. */
        _paintCoherentValues() {
            const plan = this._lastCoherent;
            const a = (plan && plan._applied) || null;
            if (a) {
                const setV = (id, v) => {
                    const el = document.getElementById(id);
                    if (el && v !== undefined && v !== null) el.value = String(v);
                };
                setV('pm9_prefetch_segments', a.prefetch_segments);
                setV('pm9_prefetch_parallel', a.parallel_downloads);
                setV('pm9_prefetch_buffer', a.buffer_target_seconds);
                setV('pm9_prefetch_bw', a.min_bandwidth_mbps);
            }
            const root = this.container || (typeof document !== 'undefined' ? document : null);
            const desc = root ? root.querySelector('.pm9-prefetch-desc') : null;
            if (desc) desc.innerHTML = this.coherentVerdictHtml(null, null);
        }

        /* ═══════════════════════════════════════════════════════════════════
         * PANEL DE RENDIMIENTO pintado con el PLAN y el PERFIL MEDIDO
         * (encargo 2026-11-18). Antes estos ids salían de constantes del perfil
         * (t1/t2 y aritmética del buffer) y el gate arrastraba 'SIN_INTENTO'.
         * Ahora: sin perfil fresco NO se pinta cifra (se dice), y con perfil se
         * pinta el plan coherente + la red medida.
         * ═══════════════════════════════════════════════════════════════════ */
        _paintPerfPanel(plan) {
            const setTxt = (id, txt, color) => {
                const el = (typeof document !== 'undefined') ? document.getElementById(id) : null;
                if (!el) return false;
                el.textContent = txt;
                if (color) el.style.color = color;
                return true;
            };
            const prof = (this.config && this.config.getProfile)
                ? this.config.getProfile(this.activeProfileId) : null;
            const player = Number(prof && prof.settings ? prof.settings.playerBuffer : 0) || 0;
            const np = this._networkProfile();
            const p = plan || this._lastCoherent || null;
            /* [t18] con el modelo bajo demanda puede no haber networkProfile vivo
             * y SÍ haber capacidad medida (peak/snapshot): eso cuenta como
             * medición válida para pintar. */
            const capP = this._capacity();
            const hayCapacidad = !!(capP && capP.mbps);
            const capMbps = hayCapacidad ? capP.mbps : (np ? np.downloadMbps : null);

            /* ── Enlace al módulo QoS: estado de la medición vigente ── */
            const fresh = !!((np && np.fresh) || hayCapacidad);
            const edadS = np ? Math.round(np.ageMs / 1000) : null;
            const qosEl = (typeof document !== 'undefined') ? document.getElementById('pm9_qos_link') : null;
            if (qosEl) {
                const capQ = this._capacity();
                const snap = this._snapshotLabel();
                if (snap && qosEl) { qosEl.title = snap; }
                qosEl.textContent = fresh
                    ? ('📡 Latencia Rayo: ACTIVO · ahora ' + (np ? np.downloadMbps : capMbps) + ' Mbps · pico ' +
                       ((capQ && capQ.peak) ? capQ.peak : capMbps) + ' Mbps' +
                       ((np && np.pingMs !== null && np.pingMs !== undefined) ? ' · ' + np.pingMs + ' ms' : ' · ping no medido') +
                       ' · hace ' + edadS + ' s (fuente ' + ((np && np.source) || (this._snapshotInfo && this._snapshotInfo.source) || 'desconocida') + ')')                    + (((np && np.fresh === false) || (this._snapshotInfo && this._snapshotInfo.stale)) ? ' · ANTIGUO' : '')
                    : ('📡 Latencia Rayo: ' + (np ? 'CADUCADO (' + edadS + ' s > ' + Math.round(np.ttlMs / 60000) + ' min)' : 'OFFLINE (sin medición)') +
                       ' — valores guardados: se mantienen hasta que vuelvas a medir');
                qosEl.style.color = fresh ? '#7dd3fc' : '#eab308';
                qosEl.style.borderColor = fresh ? 'rgba(56,189,248,.3)' : 'rgba(234,179,8,.4)';
            }
            /* el badge del propio módulo también dice la verdad */
            const badge = (typeof document !== 'undefined') ? document.getElementById('qosStatusBadge') : null;
            if (badge) {
                if (fresh) {
                    badge.style.background = '#10b981';
                    badge.innerHTML = 'Status: Active (' + ((np && np.downloadMbps) || capMbps) + 'Mbps)';
                } else {
                    badge.style.background = '#ef4444';
                    badge.innerHTML = 'Status: Offline (sin medición)';
                }
            }

            const gate = (typeof document !== 'undefined') ? document.getElementById('pm9_sufficiency_gate') : null;
            const planTxt = (p && p.values)
                ? (' · plan ' + (p.ok ? '✓ COHERENTE' : '✗ INCOHERENTE') +
                   (p.ok ? '' : ' (' + (p.violations || [])[0] + ')') +
                   ' · stall est. ' + p.metrics.stallEstimatePct + ' % ' +
                    ((Number(p.metrics.stallEstimatePct) <= Number(p.metrics.targetStallPct))
                        ? ('≤ ' + p.metrics.targetStallPct + ' % (cumple)')
                        : ('SUPERA el target ' + p.metrics.targetStallPct + ' %')))
                : ' · plan: sin medición';

            if (!p || !p.values || !fresh) {
                ['pm9_net_min', 'pm9_net_opt', 'pm9_jitter_max', 'pm9_buffer_total',
                 'pm9_ram_real', 'pm9_ram_theoretical'].forEach(id => setTxt(id, '-- (sin medición)', '#64748b'));
                setTxt('pm9_ram_note', 'sin perfil de red fresco: no hay cifra que pintar', '#eab308');
                if (gate && !this._dims) gate.textContent = 'Gate: sin medición fresca de red (TTL ' +
                    Math.round(this._networkProfileTtlMs() / 60000) + ' min)' + planTxt;
                return { painted: false, fresh: false };
            }

            const v = p.values, m = p.metrics || {};
            setTxt('pm9_net_min', v.bwMinMbps + ' Mbps (mínimo exigido)');
            setTxt('pm9_net_opt', m.measuredMbps + ' Mbps (red medida)');
            setTxt('pm9_jitter_max', Math.floor(v.bufferTargetS * 1000 * 0.8) + ' ms (buffer ' + v.bufferTargetS + ' s × 0.8)');
            setTxt('pm9_buffer_total', Math.round(v.bufferTargetS * 2000 + player) + ' ms (C1+C2 = plan ' +
                v.bufferTargetS + ' s ×2 + player ' + player + ' ms)');
            const ramPure = Number(m.ramMB) || 0;
            const C = (typeof window !== 'undefined') ? window.STREAMING_CONSTANTS : null;
            const OH = (C && Number(C.MEMORY_OVERHEAD_STEADY)) || 1.20;   // streaming-calculator.js:48
            setTxt('pm9_ram_real', (Math.round(ramPure * OH * 10) / 10) + ' MB (Real ×' + OH + ')');
            setTxt('pm9_ram_theoretical', ramPure + ' MB (Puro)');
            const pct = m.ramBudgetMB ? Math.round((ramPure / m.ramBudgetMB) * 1000) / 10 : null;
            setTxt('pm9_ram_note', 'Presupuesto ' + m.ramBudgetMB + ' MB · el plan usa ' + ramPure + ' MB' +
                (pct === null ? '' : ' (' + pct + ' %)') + ' · estrategia ' + (p.strategy ? p.strategy.name : '-') +
                ' · retraso ≈ ' + v.bufferTargetS + ' s respecto al directo' +
                /* Operador: 5 segmentos no dicen nada sin la duración real. La
                 * duración va en #EXTINF de la lista; aquí se declara la base
                 * usada por el plan para que la cuenta sea auditable. */
                ' · cobertura ' + v.prefetchSegments + ' seg × ' + (Number(m.segDurS) || 6) + ' s = ' +
                (v.prefetchSegments * (Number(m.segDurS) || 6)) + ' s de contenido vs buffer ' + v.bufferTargetS + ' s');
            /* [t18] el veredicto lo escribe el gate unificado (dos dimensiones).
             * Aquí sólo se añade la parte del plan si ese gate no existe todavía. */
            if (gate && !this._dims) {
                gate.textContent = (gate.textContent || '').split(' · plan ')[0] + planTxt;
            }
            return { painted: true, fresh: true };
        }

        /* ═══════════════════════════════════════════════════════════════════
         * GOBERNADOR DE CALIBRACIÓN (t13 · 2026-11-17)
         * ═══════════════════════════════════════════════════════════════════
         * El operador: «la medición TIENE que alimentar a un MOTOR QUE CALIBRA,
         * en bucle. Medir una vez al abrir el panel y quedarse congelado no es
         * calibrar.» Esto es el bucle:
         *
         *   MEDIR (sonda APE_BW_METER) → coherentPlan → APLICAR los 4 campos
         *   → repintar derivados → repetir.
         *
         * Reglas duras que implementa:
         *   · setTimeout recursivo, NUNCA setInterval: los ciclos no se solapan.
         *   · máximo UN ciclo en vuelo; el tick que llega ocupado se SALTA y se
         *     cuenta en _lastTune.skipped.
         *   · plazo total del ciclo (12 s por defecto): si la sonda agota, se
         *     registra y se espera al siguiente ciclo. No se aplica nada.
         *   · si el plan no es coherente NO se aplica y NO se fuerza verde: se
         *     publican violations + neededMbpsForGreen y se CONSERVA el último
         *     juego coherente aplicado.
         *   · antioscilación: si ningún campo se mueve al menos un escalón
         *     (buffer 2 s · segmentos 1 · paralelas 1 · bwMin 1 Mbps) no se
         *     aplica nada; el ciclo queda como skipped por antioscilación.
         *   · se detiene con la pestaña oculta y se reanuda al volver.
         * ═══════════════════════════════════════════════════════════════════ */

        _governorCfg() {
            return {
                intervaloS: 30,        // cadencia entre ciclos
                windowS: 5,            // ventana de la sonda
                deadlineMs: 12000,     // plazo total del ciclo
                /* Escalones de antioscilación. bwMin lleva 1 Mbps porque sin
                 * escalón cualquier variación de 0,01 lo haría aplicar siempre y
                 * anularía la regla para los otros tres. */
                step: { buffer_target_seconds: 2, prefetch_segments: 1, parallel_downloads: 1, min_bandwidth_mbps: 1 }
            };
        }

        /* Estrategia activa: la del PANEL (#pm9_strategy → settings.strategy), que
         * es la que el operador elige y la que dispara el recálculo. El preset de
         * prefetch queda como respaldo si el perfil no declara estrategia. */
        /* ═══════════════════════════════════════════════════════════════════
         * [t17 2026-11-19] LA ELECCIÓN DEL OPERADOR ES INTOCABLE.
         *
         * DEFECTO REPORTADO: selecciona ULTRA-AGRESIVO y el panel lo cambia a
         * "Conservador" con paralelas=1. La estrategia no puede degradarse sola:
         * si el plan no alcanza, se DECLARA ok:false con su motivo, pero la
         * estrategia elegida se queda.
         *
         * ÚNICO escritor: _setUserStrategy() desde el <select> (updateSetting).
         * Ningún plan, pintado, gobernador o preset escribe settings.strategy.
         * _guardStrategy() lo verifica después de cada ciclo y RESTAURA con aviso
         * si algo lo hubiese cambiado (defensa en profundidad).
         * ═══════════════════════════════════════════════════════════════════ */
        _setUserStrategy(profileId, value) {
            const p = this.config && this.config.getProfile ? this.config.getProfile(profileId || this.activeProfileId) : null;
            if (!p || !p.settings) return false;
            const canon = (window.APE_HEALTH_TUNER && window.APE_HEALTH_TUNER.strategyKey)
                ? window.APE_HEALTH_TUNER.strategyKey(value) : String(value);
            p.settings.strategy = canon;
            this._userStrategy = { id: profileId || this.activeProfileId, value: canon, at: Date.now() };
            return true;
        }

        _guardStrategy(profile, expected) {
            if (!profile || !profile.settings) return { ok: true };
            const want = expected || (this._userStrategy && this._userStrategy.id === profile.id
                ? this._userStrategy.value : profile.settings.strategy);
            if (!want) return { ok: true };
            if (String(profile.settings.strategy) !== String(want)) {
                const mal = profile.settings.strategy;
                profile.settings.strategy = want;
                try {
                    if (typeof console !== 'undefined') {
                        console.warn('[t17] estrategia revertida por ' + mal + ' -> se restaura ' + want +
                            ' (la elige el operador, no el plan)');
                    }
                } catch (e) {}
                return { ok: false, restored: want, was: mal };
            }
            return { ok: true };
        }

        _activeStrategyId() {
            const p = (this.config && this.config.getProfile)
                ? this.config.getProfile(this.activeProfileId) : null;
            const stg = (p && p.settings) ? p.settings.strategy : null;
            if (stg) return stg;
            const cfg = (this.config && this.config.getPrefetchConfig)
                ? (this.config.getPrefetchConfig(this.activeProfileId) || {}) : {};
            return cfg.strategy || 'balanced';
        }

        /* ═══════════════════════════════════════════════════════════════════
         * BOTÓN ÚNICO: MEDIR → CALCULAR+APLICAR → AUTOGUARDAR → REPINTAR
         * (encargo 2026-11-18). target 'one' = perfil activo · 'all' = todos los
         * perfiles configurados, cada uno con SU propio bitrate calculado y por
         * lotes. Idempotente: UNA medición por pulsación; el doble clic reutiliza
         * la promesa en vuelo (_qosRunPromise). ═════════════════════════════ */
        qosRunAll(target, opts) {
            opts = opts || {};
            if (this._qosRunPromise) return this._qosRunPromise;
            const self = this;
            const p = this._qosRunAllImpl(target === 'all' ? 'all' : 'one', opts)
                .then(function (r) { self._qosRunPromise = null; self._qosUiStop(r); return r; })
                .catch(function (e) {
                    self._qosRunPromise = null;
                    const r = { ok: false, state: 'EXCEPTION', reason: (e && e.message) || 'error en el flujo' };
                    self._qosUiStop(r);
                    return r;
                });
            this._qosRunPromise = p;
            this._qosUiStart(opts);
            return p;
        }

        _allProfileIds() {
            const cfg = this.config;
            const all = (cfg && cfg.profiles) ? Object.keys(cfg.profiles) : [];
            const list = all.filter(function (id) { return cfg.profiles[id] && cfg.profiles[id].settings; });
            return list.length ? list : [this.activeProfileId];
        }

        _strategyOfProfile(id) {
            const p = (this.config && this.config.getProfile) ? this.config.getProfile(id) : null;
            const stg = (p && p.settings) ? p.settings.strategy : null;
            return stg || this._activeStrategyId();
        }

        /* Escritura de los 4 valores en un perfil CONCRETO (no sólo el activo). */
        /* [t21] aridad de un campo: nº de posiciones de la cascada del PERFIL */
        _arityOf(profile, headerName) {
            if (!this.config || typeof this.config.getHeaderValue !== 'function') return 1;
            const v = this.config.getHeaderValue(profile.id, headerName);
            return (v === null || v === undefined || String(v) === '') ? 1 : String(v).split(',').length;
        }

        /* [t21] cascada MONÓTONA de n posiciones a partir del valor del plan.
         * No repite el mismo valor (ese era el defecto de X-Color-Depth): baja
         * por niveles hasta 1, preservando la aridad del perfil. */
        _cascadeOf(base, n) {
            const b = Math.max(1, Math.round(Number(base) || 1));
            const k = Math.max(1, Number(n) || 1);
            const out = [];
            for (let i = 0; i < k; i++) out.push(Math.max(1, b - i));
            return out.join(',');
        }

        /* [t21] escribe las cascadas que gobierna el plan conservando su aridad. */
        _reconcilePlanCascades(profile, applied) {
            const r = { plan: {} };
            if (!profile || !this.config || typeof this.config.setHeaderOverride !== 'function') return r;
            const a = applied || {};
            const pares = [
                ['X-Parallel-Segments', a.parallel_downloads],
                ['X-Prefetch-Segments', a.prefetch_segments],
                ['X-Concurrent-Downloads', a.parallel_downloads]
            ];
            const self = this;
            pares.forEach(function (par) {
                const name = par[0], val = par[1];
                if (val === undefined || val === null) return;
                const ar = self._arityOf(profile, name);
                const cas = self._cascadeOf(val, ar);
                self.config.setHeaderOverride(profile.id, name, cas);
                r.plan[name] = { posiciones: ar, valor: cas };
            });
            return r;
        }

        /* [t21] GUARD DE CIERRE: ningún campo vacío; ninguna cascada gobernada por
         * el plan con una sola posición. Devuelve el informe para el botón. */
        _guardFields(profile) {
            const inf = { vacios: [], rellenados: [], aridad: [], declarados: [], ok: true };
            if (!profile || !this.config) return inf;
            const self = this;
            const hdrs = ['Keep-Alive', 'Connection', 'Accept-Encoding', 'Sec-CH-UA-Platform',
                'X-Dolby-Vision-Profile', 'X-Dolby-Vision-Level', 'X-APE-STRATEGY', 'X-Color-Depth',
                'X-Segment-Duration', 'X-Prefetch-Segments', 'X-Parallel-Segments', 'X-Frame-Rates'];
            hdrs.forEach(function (name) {
                const v = self.config.getHeaderValue(profile.id, name);
                if (v === null || v === undefined || String(v).trim() === '') {
                    let donor = null;
                    const all = (self.config.profiles ? Object.keys(self.config.profiles) : []);
                    for (let i = 0; i < all.length; i++) {
                        const pv = self.config.getHeaderValue(all[i], name);
                        if (pv !== null && pv !== undefined && String(pv).trim() !== '') { donor = String(pv); break; }
                    }
                    if (donor) {
                        self.config.setHeaderOverride(profile.id, name, donor);
                        inf.rellenados.push(name + ' = ' + donor);
                    } else {
                        /* [t21] sin donante en otros perfiles: se deriva del PROPIO
                         * perfil (SSOT de codec). Dolby Vision se declara con el
                         * codec real del perfil, nunca con un valor inventado. */
                        const st = profile.settings || {};
                        const cadena = String(st.codec_chain_video || '') + ',' + String(st.codec_full || '');
                        let derivado = null;
                        if (name === 'X-Dolby-Vision-Profile') {
                            const dv = /dvh1\.[0-9.]+/.exec(cadena);
                            if (dv) derivado = dv[0];
                        } else if (name === 'X-Dolby-Vision-Level') {
                            const lv = /L(\d{2,3})/.exec(cadena);
                            if (lv) derivado = 'L' + lv[1];
                        }
                        if (derivado) {
                            self.config.setHeaderOverride(profile.id, name, derivado);
                            inf.rellenados.push(name + ' = ' + derivado + ' (derivado del codec del perfil)');
                        } else {
                            inf.declarados.push(name + ' (sin Dolby Vision en este perfil: N/A declarado)');
                        }
                    }
                }
            });
            ['X-Prefetch-Segments', 'X-Parallel-Segments', 'X-Concurrent-Downloads'].forEach(function (name) {
                const v = self.config.getHeaderValue(profile.id, name);
                if (v !== null && v !== undefined && String(v).indexOf(',') < 0) {
                    inf.aridad.push(name + ' = ' + v + ' (una sola posición)');
                    inf.ok = false;
                }
            });
            ['Connection', 'Accept-Encoding', 'Sec-CH-UA-Platform'].forEach(function (name) {
                const v = self.config.getHeaderValue(profile.id, name);
                if (v !== null && v !== undefined && String(v).indexOf(',') < 0) {
                    inf.declarados.push(name + ' = ' + v + ' (aridad 1 por diseño del SSOT)');
                }
            });
            return inf;
        }

        _applyPlanValuesFor(profileId, values) {
            const applied = {};
            if (!this.config || typeof this.config.updatePrefetchSetting !== 'function') return applied;
            const id = profileId || this.activeProfileId;
            Object.keys(values || {}).forEach((k) => {
                if (this.config.updatePrefetchSetting(id, k, values[k])) applied[k] = values[k];
            });
            return applied;
        }

        async _qosRunAllImpl(target, opts) {
            const A = (typeof window !== 'undefined') ? window.app : null;
            const report = { ok: false, state: 'SIN_MEDICION', target: target, profiles: {}, appliedIds: [] };

            /* 1 · MEDIR — una sola vez para todo el flujo */
            let measured = opts.measured || null;
            if (!measured) {
                if (!A || typeof A.measureQosBandwidth !== 'function') {
                    report.state = 'NO_APP';
                    report.reason = 'app.js no expone measureQosBandwidth';
                    return report;
                }
                measured = await A.measureQosBandwidth({ windowS: Number(opts.windowS) || 8 });
            }
            report.measured = measured;
            if (!measured || measured.ok !== true) {
                report.state = (measured && measured.state) || 'NO_MEASUREMENT';
                report.reason = (measured && measured.reason) || 'no se pudo medir';
                return report;                     /* NO se aplica ni se guarda nada */
            }

            /* 2 · publicar el perfil de red (referencia del cálculo) */
            if (A && typeof A.applyNetworkMeasurement === 'function') {
                A.applyNetworkMeasurement(measured, { silent: true });
            }

            /* 3 · CALCULAR + APLICAR cada perfil con SU bitrate */
            const ids = (target === 'all') ? this._allProfileIds() : [this.activeProfileId];
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const profile = this.config.getProfile(id);
                if (!profile || !profile.settings) continue;
                const plan = this._coherentPlanFor(profile, this._strategyOfProfile(id));
                if (!plan || !plan.values) continue;
                const c = this._clampPlanValues(plan.values);
                const applied = this._applyPlanValuesFor(id, c.values);
                const basis = this._requiredMbpsBasis(profile);
                report.profiles[id] = {
                    profileId: id, strategy: plan.strategyKey || this._strategyOfProfile(id),
                    bufferTargetS: c.values.buffer_target_seconds,
                    prefetchSegments: c.values.prefetch_segments,
                    parallelDownloads: c.values.parallel_downloads,
                    bwMinMbps: c.values.min_bandwidth_mbps,
                    basis: basis.mbps, basisSource: basis.source,
                    ok: plan.ok, violations: plan.violations || [],
                    applied: applied, clamped: c.clamped, ts: Date.now()
                };
                report.appliedIds.push(id);
                /* por lotes: ceder el hilo cada 3 perfiles para no bloquear la UI */
                if ((i + 1) % 3 === 0) await new Promise(function (r) { setTimeout(r, 0); });
            }

            /* [t21] CASCADAS + GUARD DE CIERRE sobre el perfil activo: ningún
             * campo vacío y ninguna cascada gobernada por el plan con una sola
             * posición. Se informa en el resultado del botón. */
            try {
                const pAct = this.config.getProfile(this.activeProfileId);
                const aplAct = (report.profiles[this.activeProfileId] || {}).applied || {};
                report.cascadas = this._reconcilePlanCascades(pAct, aplAct);
                report.guard = this._guardFields(pAct);
            } catch (e) { report.guard = { ok: false, vacios: ['(error: ' + (e && e.message) + ')'] }; }

            /* 4 · AUTOGUARDAR — DESPUÉS de aplicar, nunca antes */
            const saved = this._saveQoePlan(report.profiles, measured);
            report.saved = !!saved;
            report.ok = true;
            report.state = report.appliedIds.length ? 'APPLIED' : 'SIN_PERFILES';
            report.coherent = Object.keys(report.profiles).some(function (k) { return report.profiles[k].ok; });

            /* [t17] ningún paso del flujo puede haber cambiado la estrategia */
            try { this._guardStrategy(this.config.getProfile(this.activeProfileId)); } catch (e) {}
            /* 5 · repintar */
            try {
                this._paintCoherentValues();
                this._paintPerfPanel(this._coherentPlanFor(null, this._activeStrategyId()));
                this._updateStreamingHealth();
            } catch (e) { /* no bloqueante */ }
            return report;
        }

        /* ── AUTOGUARDADO del plan por perfil ─────────────────────────────── */
        _saveQoePlan(plans, measured) {
            try {
                if (typeof localStorage === 'undefined' || !localStorage.setItem) return null;
                const rec = {
                    v: 1, ts: Date.now(),
                    measurement: measured ? {
                        mbpsSafe: measured.mbpsSafe, mbpsP95: measured.mbpsP95,
                        jitterMbps: measured.jitterMbps, bufferbloatMs: measured.bufferbloatMs,
                        rttIdleMs: measured.rttIdleMs, source: measured.source || 'explicit'
                    } : null,
                    profiles: plans || {}
                };
                /* [t16] HISTORICO de mediciones explícitas (trazabilidad). No
                 * recalcula nada: sólo se anexa. Gana siempre la última. */
                try {
                    const prev = JSON.parse(localStorage.getItem('ape_qoe_plan_v1') || 'null');
                    const hist = (prev && Array.isArray(prev.history)) ? prev.history : [];
                    hist.push({ ts: rec.ts, mbpsSafe: rec.measurement ? rec.measurement.mbpsSafe : null,
                                mbpsP95: rec.measurement ? rec.measurement.mbpsP95 : null,
                                jitterMbps: rec.measurement ? rec.measurement.jitterMbps : null,
                                bufferbloatMs: rec.measurement ? rec.measurement.bufferbloatMs : null,
                                source: rec.measurement ? rec.measurement.source : 'explicit',
                                profiles: Object.keys(rec.profiles || {}).length });
                    while (hist.length > 20) hist.shift();
                    rec.history = hist;
                } catch (e) { /* sin historico: el snapshot sigue válido */ }
                localStorage.setItem('ape_qoe_plan_v1', JSON.stringify(rec));
                this._snapshotInfo = {
                    ts: rec.ts, ageMs: 0, stale: false,
                    source: rec.measurement ? rec.measurement.source : 'explicit',
                    mbps: rec.measurement ? rec.measurement.mbpsSafe : null,
                    p95: rec.measurement ? rec.measurement.mbpsP95 : null,
                    jitter: rec.measurement ? rec.measurement.jitterMbps : null,
                    bufferbloatMs: rec.measurement ? rec.measurement.bufferbloatMs : null,
                    plan: null
                };
                return rec;
            } catch (e) { return null; }
        }

        _loadQoePlan() {
            try {
                if (typeof localStorage === 'undefined' || !localStorage.getItem) return null;
                const raw = localStorage.getItem('ape_qoe_plan_v1');
                if (!raw) return null;
                const o = JSON.parse(raw);
                if (!o || !o.profiles) return null;
                o.fresh = (Date.now() - (Number(o.ts) || 0)) <= this._networkProfileTtlMs();
                return o;
            } catch (e) { return null; }
        }

        /* Restaura el plan guardado. Si caducó NO se aplica: se informa. */
        /* [t16 · ORDEN DEL OPERADOR] El snapshot se restaura y se APLICA siempre.
         * Ningún TTL borra ni mueve el plan: si envejeció se marca ANTIGUO
         * (visible + title) y los valores siguen aplicados hasta que el operador
         * vuelva a medir. Prohibido que un temporizador cambie un valor. */
        _restoreQoePlan() {
            const o = this._loadQoePlan();
            if (!o) return { restored: false, reason: 'sin plan guardado' };
            const mine = o.profiles[this.activeProfileId];
            if (!mine) return { restored: false, reason: 'el plan no tiene este perfil', ts: o.ts };
            const p = (this.config && this.config.getProfile) ? this.config.getProfile(this.activeProfileId) : null;
            const applied = this._applyPlanValuesFor(this.activeProfileId, {
                prefetch_segments: mine.prefetchSegments,
                parallel_downloads: mine.parallelDownloads,
                buffer_target_seconds: mine.bufferTargetS,
                min_bandwidth_mbps: mine.bwMinMbps
            });
            const ageMs = Date.now() - (Number(o.ts) || 0);
            this._snapshotInfo = {
                ts: Number(o.ts) || 0, ageMs: ageMs, stale: !o.fresh,
                source: (o.measurement && o.measurement.source) || 'desconocida',
                mbps: o.measurement ? o.measurement.mbpsSafe : null,
                p95: o.measurement ? o.measurement.mbpsP95 : null,
                jitter: o.measurement ? o.measurement.jitterMbps : null,
                bufferbloatMs: o.measurement ? o.measurement.bufferbloatMs : null,
                plan: mine
            };
            if (mine.basis > 0) this._peakRecord(Number(o.measurement && o.measurement.mbpsSafe) || 0, this._snapshotInfo.ts);
            /* [t21] un snapshot viejo puede traer campos vacíos: se completan con
             * el perfil en vez de aplicarse a medias. */
            try {
                this._reconcilePlanCascades(p, {
                    prefetch_segments: mine.prefetchSegments,
                    parallel_downloads: mine.parallelDownloads
                });
                const g = this._guardFields(p);
                this._snapshotInfo.guard = g;
                if (g && (g.rellenados.length || g.vacios.length)) {
                    if (typeof console !== 'undefined') {
                        console.log('[t21] snapshot: rellenados=' + g.rellenados.length +
                            ' · vacios sin relleno=' + g.vacios.length);
                    }
                }
            } catch (e) { /* no bloqueante */ }
            return { restored: true, stale: !!this._snapshotInfo.stale, plan: mine, applied: applied,
                     ageMs: ageMs, snapshot: this._snapshotInfo };
        }

        /* Texto del panel: "medido hace X (fuente Y)" + marca ANTIGUO. */
        _snapshotLabel() {
            const s = this._snapshotInfo;
            if (!s || !s.ts) return null;
            const sSeg = Math.round(s.ageMs / 1000);
            const hace = sSeg < 90 ? (sSeg + ' s') : (sSeg < 5400 ? (Math.round(sSeg / 60) + ' min') : (Math.round(sSeg / 3600) + ' h'));
            return 'medido hace ' + hace + ' (fuente ' + s.source + ')' + (s.stale ? ' · ANTIGUO' : '');
        }

        /* ── Feedback visual: LED minimalista (CSS puro, sin librerías) ───── */
        _qosUiStart(opts) {
            try {
                const btn = (typeof document !== 'undefined') ? document.getElementById('pm9_auto_adjust_btn') : null;
                if (!btn) return;
                this._qosBtnLabel = btn.innerHTML;
                btn.disabled = true;
                this._qosT0 = Date.now();
                const self = this;
                const paint = function () {
                    const s = Math.round((Date.now() - self._qosT0) / 1000);
                    btn.innerHTML = '⏳ Midiendo… ' + s + ' s';
                };
                paint();
                this._qosTimer = setInterval(paint, 500);
                if (typeof document !== 'undefined' && document.head && !document.getElementById('pm9_qos_leds_style')) {
                    const st = document.createElement('style');
                    st.id = 'pm9_qos_leds_style';
                    st.textContent = '@keyframes pm9Led{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}' +
                        '#pm9_qos_leds{display:inline-flex;gap:3px;margin-left:8px;vertical-align:middle}' +
                        '#pm9_qos_leds span{width:6px;height:6px;border-radius:50%;background:#38bdf8;display:inline-block;animation:pm9Led 1s infinite ease-in-out}';
                    document.head.appendChild(st);
                }
                let leds = (typeof document !== 'undefined') ? document.getElementById('pm9_qos_leds') : null;
                if (!leds && typeof document !== 'undefined') {
                    leds = document.createElement('span');
                    leds.id = 'pm9_qos_leds';
                    if (btn.parentNode && typeof btn.parentNode.insertBefore === 'function') {
                        btn.parentNode.insertBefore(leds, btn.nextSibling);
                    } else if (document.body && document.body.appendChild) {
                        document.body.appendChild(leds);
                    }
                }
                /* los 4 puntos se crean si faltan (idempotente) */
                if (leds && (!leds.children || leds.children.length === 0)) {
                    for (let i = 0; i < 4; i++) {
                        const dot = document.createElement('span');
                        dot.style.animationDelay = (i * 0.12) + 's';
                        leds.appendChild(dot);
                    }
                }
            } catch (e) { /* no bloqueante */ }
        }

        _qosUiStop(result) {
            try {
                if (this._qosTimer) { clearInterval(this._qosTimer); this._qosTimer = null; }
                const b2 = (typeof document !== 'undefined') ? document.getElementById('pm9_auto_adjust_btn') : null;
                if (b2) {
                    b2.disabled = false;
                    b2.innerHTML = this._qosBtnLabel || '⚡ AUTO-AJUSTAR (función objetivo)';
                }
                const leds = (typeof document !== 'undefined') ? document.getElementById('pm9_qos_leds') : null;
                if (leds) {
                    const measuredOk = !!(result && result.measured && result.measured.ok);
                    const coherent = !!(result && result.coherent);
                    const color = !measuredOk ? '#ef4444' : (coherent ? '#10b981' : '#eab308');
                    Array.prototype.forEach.call(leds.children, function (el) {
                        el.style.background = color;
                        el.style.animation = 'none';
                        el.style.opacity = '1';
                        el.style.transform = 'scale(1)';
                    });
                    leds.title = !measuredOk
                        ? ('no se pudo medir: ' + ((result && (result.reason || result.state)) || 'sin motivo'))
                        : (coherent ? 'plan coherente aplicado' : 'midió pero no alcanza (ver gate)');
                }
            } catch (e) { /* no bloqueante */ }
        }

        /* UN ciclo INMEDIATO y FORZADO (ignora la antioscilación). Idempotente:
         * si ya hay un ciclo en vuelo devuelve ESE, de modo que pulsar
         * AUTO-AJUSTAR dos veces no lanza dos sondas. */
        governorRunOnce(opts) {
            opts = opts || {};
            if (this._govCyclePromise) {
                this._govForceApply = (opts.force !== false);
                return this._govCyclePromise;
            }
            this._govForceApply = (opts.force !== false);
            const self = this;
            const p = this._governorCycle().then(function (r) {
                self._govCyclePromise = null;
                self._govForceApply = false;
                return r;
            }).catch(function (e) {
                self._govCyclePromise = null;
                self._govForceApply = false;
                throw e;
            });
            this._govCyclePromise = p;
            return p;
        }

        /* Escritura de los cuatro valores: ÚNICO camino (lo usan applyCoherentPlan
         * y el gobernador). Va por updatePrefetchSetting, no por
         * updatePrefetchValue: ese handler sincroniza parallel→segments 3:1 y
         * pisaría el plan (que deriva los segmentos del buffer, no del paralelo). */
        _applyPlanValues(values) {
            const applied = {};
            if (!this.config || typeof this.config.updatePrefetchSetting !== 'function') return applied;
            Object.keys(values || {}).forEach((k) => {
                if (this.config.updatePrefetchSetting(this.activeProfileId, k, values[k])) {
                    applied[k] = values[k];
                }
            });
            return applied;
        }

        /* Arranca el gobernador. Idempotente: una sola instancia. */
        startGovernor(opts) {
            const cfg = Object.assign(this._governorCfg(), opts || {});
            this._govCfg = cfg;
            if (this._govTimer || this._govActive) {
                return { ok: true, already: true, intervaloS: cfg.intervaloS };
            }
            this._govActive = true;
            this._govCycles = this._govCycles || 0;
            this._govInFlight = false;

            /* Pausa/reanudación por visibilidad (una sola vez). */
            if (!this._govVisHooked && typeof document !== 'undefined' && document.addEventListener) {
                this._govVisHooked = true;
                const self = this;
                document.addEventListener('visibilitychange', function () {
                    if (document.hidden) {
                        if (self._govActive) {
                            self._govPaused = true;
                            self._govActive = false;
                            if (self._govTimer) { clearTimeout(self._govTimer); self._govTimer = null; }
                            if (typeof console !== 'undefined') console.log('[CALIB] pausado: pestaña oculta');
                        }
                    } else if (self._govPaused) {
                        self._govPaused = false;
                        self._govTimer = null;
                        self.startGovernor(self._govCfg);
                        if (typeof console !== 'undefined') console.log('[CALIB] reanudado: pestaña visible');
                    }
                });
            }

            this._governorTick();     // primer ciclo inmediato
            return { ok: true, started: true, intervaloS: cfg.intervaloS, deadlineMs: cfg.deadlineMs };
        }

        stopGovernor() {
            this._govActive = false;
            if (this._govTimer) { clearTimeout(this._govTimer); this._govTimer = null; }
            return { ok: true, stopped: true, cycles: this._govCycles || 0 };
        }

        _governorSchedule(ms) {
            if (!this._govActive) return;
            if (this._govTimer) clearTimeout(this._govTimer);
            const self = this;
            this._govTimer = setTimeout(function () { self._governorTick(); }, Math.max(0, ms));
        }

        /* Un tick: si ya hay un ciclo en vuelo, NO se solapa: se salta y se cuenta. */
        _governorTick() {
            if (!this._govActive) return;
            const self = this;
            const cfg = this._govCfg || this._governorCfg();
            if (this._govInFlight) {
                this._govSkipped = (this._govSkipped || 0) + 1;
                this._lastTune = Object.assign({}, this._lastTune || {},
                    { skipped: this._govSkipped, skipReason: 'ciclo_anterior_en_vuelo' });
                this._governorSchedule(cfg.intervaloS * 1000);
                return;
            }
            this._govInFlight = true;
            /* se guarda la promesa para que governorRunOnce pueda REUTILIZAR este
             * ciclo en vez de lanzar una segunda sonda (AUTO-AJUSTAR idempotente). */
            const p = this._governorCycle();
            this._govCyclePromise = p;
            p.then(function () {
                self._govInFlight = false;
                self._govCyclePromise = null;
                self._governorSchedule(cfg.intervaloS * 1000);
            }).catch(function (e) {
                self._govInFlight = false;
                self._govCyclePromise = null;
                if (typeof console !== 'undefined') console.warn('[CALIB] ciclo abortado: ' + ((e && e.message) || e));
                self._governorSchedule(cfg.intervaloS * 1000);
            });
        }

        /* Un ciclo completo. Devuelve una promesa con el registro del ciclo. */
        _governorCycle() {
            const self = this;
            const cfg = this._govCfg || this._governorCfg();
            const profile = (this.config && this.config.getProfile)
                ? this.config.getProfile(this.activeProfileId) : null;
            const required = Number(profile && profile.settings ? profile.settings.bitrate : 0) || 0;
            const bw = (typeof window !== 'undefined') ? window.APE_BW_METER : null;
            const T = (typeof window !== 'undefined') ? window.APE_HEALTH_TUNER : null;
            this._govCycles = (this._govCycles || 0) + 1;

            /* 1 · MEDIR. Sin sonda no hay ciclo válido: se registra y se sale. */
            const measure = (bw && typeof bw.measureAndIntegrate === 'function')
                ? bw.measureAndIntegrate(required, { windowS: cfg.windowS, mode: 'auto' })
                : Promise.resolve({ ok: false, state: 'NO_METER',
                                    reason: 'APE_BW_METER no cargado (bandwidth-meter-v1.js)' });

            /* 3 · plazo total del ciclo: si la sonda no vuelve, no se cuelga. */
            let deadlineHit = false;
            const deadline = new Promise(function (resolve) {
                setTimeout(function () {
                    deadlineHit = true;
                    resolve({ ok: false, state: 'CYCLE_DEADLINE',
                              reason: 'el ciclo superó ' + cfg.deadlineMs + ' ms' });
                }, cfg.deadlineMs);
            });

            return Promise.race([measure, deadline]).then(function (r) {
                r = r || { ok: false, state: 'SIN_RESULTADO' };
                r.at = Date.now();                 // frescura para _freshMeasurement
                self._lastBw = r;                  // alimenta panel y veredicto

                /* 1bis · PUBLICAR EL PERFIL DE RED desde ESTA MISMA MEDICIÓN.
                 * El módulo «Latencia Rayo» (app.js) es la REFERENCIA del
                 * cálculo, y el gobernador lo alimenta con la sonda que ya hizo:
                 * UNA sola medición por ciclo, no dos. Se publica ANTES de
                 * calcular el plan para que éste lea el perfil recién escrito. */
                const A = (typeof window !== 'undefined') ? window.app : null;
                const publish = (r.ok && A && typeof A.profileNetwork === 'function')
                    ? Promise.resolve(A.profileNetwork({ prefetched: r, silent: true }))
                        .catch(function (e) {
                            return { ok: false, reason: (e && e.message) || 'profileNetwork falló' };
                        })
                    : Promise.resolve(null);

                return publish.then(function (np) {
                    self._lastNetProfile = np;
                    return self._governorDecide(r, np, profile, T);
                });
            });
        }

        /* Decide y aplica a partir de una medición ya publicada en el perfil de
         * red. Separado de _governorCycle para poder esperar la publicación del
         * perfil sin anidar promesas dentro del cuerpo de decisión. */
        _governorDecide(r, np, profile, T) {
            const self = this;
            const cfg = this._govCfg || this._governorCfg();

            const mbps = (r.measurement && typeof r.measurement.mbpsSafe === 'number')
                ? r.measurement.mbpsSafe : null;
            const ratio = (typeof r.headroomRatio === 'number') ? r.headroomRatio : null;
            const ping = (np && isFinite(Number(np.ttfbMs))) ? Number(np.ttfbMs) : null;

            /* 2 · CALCULAR con el método MEDIDO (jamás con settings.bitrate). */
            const plan = (r.ok && T && typeof T.coherentPlan === 'function')
                ? self._coherentPlanFor(profile, self._activeStrategyId())
                : null;
            /* el plan del ciclo es el que pinta el panel: una sola fuente */
            if (plan) self._lastCoherent = plan;
        /* [2026-11-20 · OPERADOR: "aplicar los parametros de manera automatica"]
         * Tras CADA medicion, el gobernador APLICA lo que deriva el motor a los 12
         * perfiles: buffer (settings.buffer y vlcopt network-caching) y el timeout
         * de red. Cada perfil usa SU propio ratio (medido / exigido por el perfil),
         * no el del perfil activo. Se persiste para que la lista lo herede. */
        /* [t30] el auto-tune sólo corre sobre una medición VÁLIDA: si el ciclo no
         * es ok (la red no sostiene ni el mínimo), escribir 12 perfiles rompía
         * "CONSERVA el juego coherente anterior" y disparaba el antioscilación. */
        if (r && r.ok) { try { self._applyAutoTune(r); } catch (_at) { /* aditivo: nunca rompe el ciclo */ } }
            /* [t17] pase lo que pase con el plan, la estrategia no se revierte */
            self._guardStrategy(profile);

            const rec = {
                at: r.at, ok: false, values: null, violations: [], applied: null,
                measuredMbpsSafe: mbps, headroomRatio: ratio,
                netProfileMbps: (np && np.downloadMbps) || null,
                netProfileSource: (np && np.source) || null,
                pingMs: ping,
                planState: plan ? plan.state : (r.state || 'SIN_PLAN'),
                skipped: self._govSkipped || 0, cycle: self._govCycles
            };

            if (!plan || !plan.values) {
                /* Sin medición o sin plan: NO se aplica y NO se inventa. */
                rec.violations = (plan && plan.violations) ? plan.violations
                    : [String(r.state || 'SIN_MEDICION') + ': ' + String(r.reason || 'sin medición válida')];
                self._lastTune = rec;
                self._governorLog(rec);
                self._governorPaintGate(rec);
                return rec;
            }

            rec.violations = plan.violations || [];
            rec.neededMbpsForGreen = plan.neededMbpsForGreen;

            /* 4 · plan NO coherente: no se aplica, no se fuerza verde y se
             * CONSERVA el último juego coherente aplicado. */
            if (!plan.ok) {
                rec.ok = false;
                rec.kept = self._lastAppliedSet || null;
                self._lastTune = rec;
                self._governorLog(rec);
                self._governorPaintGate(rec);
                self._updateStreamingHealth();
                return rec;
            }

            /* 3 · plan coherente: antioscilación y aplicación. */
            const c = self._clampPlanValues(plan.values);
            const cur = (self.config.getPrefetchConfig(self.activeProfileId) || {});
            const moves = Object.keys(c.values).some(function (k) {
                const now = Number(cur[k]);
                const step = Number(cfg.step[k]) || 0;
                if (!isFinite(now)) return true;
                return Math.abs(c.values[k] - now) >= step;
            });

            /* AUTO-AJUSTAR fuerza la aplicación aunque el cambio sea menor que el
             * escalón: el operador lo pidió explícito y es una acción manual. */
            if (!moves && !self._govForceApply) {
                rec.ok = true;
                rec.skipped = (self._govSkipped || 0) + 0;
                rec.skipReason = 'antioscilacion';
                rec.values = c.values;
                self._lastTune = rec;
                self._governorLog(rec);
                return rec;
            }

            const applied = self._applyPlanValues(c.values);
            if (Object.keys(applied).length) self._lastAppliedSet = applied;
            rec.ok = true;
            rec.values = c.values;
            rec.applied = applied;
            rec.clamped = c.clamped;
            self._lastTune = rec;
            self._governorLog(rec);
            self._governorPaintGate(rec);
            try {
                self._paintCoherentValues();
                self._paintPerfPanel(self._lastCoherent);
                self._updateStreamingHealth();
            } catch (e) { /* no bloqueante */ }
            return rec;
        }

        /* Publica el aviso del ciclo en el gate de suficiencia (texto existente,
         * sin tocar la estructura del panel). */
        _governorPaintGate(rec) {
            try {
                const el = (typeof document !== 'undefined') ? document.getElementById('pm9_sufficiency_gate') : null;
                if (!el || !rec) return;
                if (!rec.ok && rec.violations && rec.violations.length) {
                    const kept = rec.kept ? (' · se conserva ' + JSON.stringify(rec.kept)) : '';
                    el.title = '[CALIB] ' + rec.violations.join(' · ') + kept;
                } else {
                    el.title = '[CALIB] ciclo ' + (rec.cycle || '') + ' coherente' +
                        (rec.skipReason ? ' (sin cambios: ' + rec.skipReason + ')' : '');
                }
            } catch (e) { /* no bloqueante */ }
        }

        /* Una línea de consola por ciclo, con el formato pedido. */
        _governorLog(rec) {
            if (typeof console === 'undefined' || !rec) return;
            const v = rec.values || (rec.applied || {});
            const iso = new Date(rec.at || Date.now()).toISOString();
            console.log('[CALIB] at=' + iso +
                ' mbps=' + (rec.measuredMbpsSafe === null ? 'n/a' : rec.measuredMbpsSafe) +
                ' ratio=' + (rec.headroomRatio === null ? 'n/a' : rec.headroomRatio) +
                ' ok=' + rec.ok +
                ' buf=' + (v.buffer_target_seconds === undefined ? 'n/a' : v.buffer_target_seconds) +
                ' seg=' + (v.prefetch_segments === undefined ? 'n/a' : v.prefetch_segments) +
                ' par=' + (v.parallel_downloads === undefined ? 'n/a' : v.parallel_downloads) +
                ' bwMin=' + (v.min_bandwidth_mbps === undefined ? 'n/a' : v.min_bandwidth_mbps) +
                ' net=' + (rec.netProfileMbps === null ? 'n/a' : rec.netProfileMbps) +
                (rec.pingMs === null || rec.pingMs === undefined ? '' : ' ping=' + rec.pingMs) +
                (rec.skipReason ? ' skipped=' + rec.skipReason : '') +
                ' ' + (rec.violations && rec.violations.length ? rec.violations.join(' | ') : ''));
        }

        // ═══════════════════════════════════════════════════════════════
        // MÉTODOS DE INTERACCIÓN
        // ═══════════════════════════════════════════════════════════════

        /**
         * Predicción AI — mide AHORA con datos reales del navegador (Resource
         * Timing vía APE_BW), refresca la ventana del predictor y re-renderiza.
         * Si no hay medición disponible lo dice; no inventa Mbps.
         */
        /* ═══════════════════════════════════════════════════════════════════
         * STREAMING HEALTH MEDIDO (2026-11-16)
         *
         * Mide en bins de 1 s sobre una ventana de 5 s (hasta 10 s) usando los
         * bytes de media que el player YA descargó (Resource Timing): cero
         * tráfico extra. Alimenta el panel con la ley de suficiencia y, cuando
         * el headroom lo permite, devuelve la configuración recomendada.
         *
         * Sin medición NO publica cifras: deja evidence=false y explica por qué.
         * Devuelve la promesa para poder verificarlo desde consola o test.
         * ═══════════════════════════════════════════════════════════════════ */
        measureStreamingHealth(windowS) {
            const bw = (typeof window !== 'undefined') ? window.APE_BW_METER : null;
            const profile = this.config.getProfile(this.activeProfileId);
            const required = Number(profile && profile.settings ? profile.settings.bitrate : 0) || 0;
            const self = this;

            if (!bw || typeof bw.measureAndIntegrate !== 'function') {
                this._lastBw = { ok: false, state: 'NO_METER', at: Date.now(),
                                 reason: 'APE_BW_METER no cargado (bandwidth-meter-v1.js)' };
                this._updateStreamingHealth();
                return Promise.resolve(this._lastBw);
            }

            return bw.measureAndIntegrate(required, { windowS: windowS || 5, mode: 'auto' }).then(function (r) {
                r.at = Date.now();
                r.stallPct = self._stallFromRatio(r.headroomRatio);
                self._lastBw = r;

                // ═══════════════════════════════════════════════════════════
                // [2026-11-16] NO sólo se muestra: SE MUEVEN LOS PARÁMETROS.
                // 1) el tuner calcula con las 4 fórmulas (buffer/prefetch/
                //    paralelo/read-timeout) y consulta al LLM de la plataforma
                //    (/image/optimize-llm) con purpose='streaming_health';
                // 2) la validación por rangos decide: si el LLM toca fallbacks,
                //    codec, resolución o se sale de rango, gana el determinista;
                // 3) se aplica al perfil activo SOLO por las APIs del modelo.
                // ═══════════════════════════════════════════════════════════
                const T = (typeof window !== 'undefined') ? window.APE_HEALTH_TUNER : null;
                if (!T || !r.ok) { self._updateStreamingHealth(); return r; }
                const segDur = (profile && profile.settings) ? profile.settings.segment_duration_s : null;
                return T.plan({
                    requiredMbps: required,
                    headroomRatio: r.headroomRatio,
                    risk: r.risk,
                    measuredMbpsSafe: r.measurement ? r.measurement.mbpsSafe : null,
                    jitter: r.measurement ? r.measurement.jitter : null,
                    windowS: r.measurement ? r.measurement.windowS : null,
                    segDurationSec: segDur
                }, {
                    llm: true,
                    fetch: (typeof window !== 'undefined' ? window.fetch : null)
                }).then(function (pl) {
                    self._lastTune = pl;
                    if (pl && pl.ok && pl.chosen) {
                        pl.applied = T.apply(self, self.activeProfileId, pl.chosen);
                    }
                    /* [t13] Al TERMINAR una medición el panel no se queda con
                     * valores del preset: los CUATRO campos se recalculan con
                     * coherentPlan (medición fresca) y se repintan los
                     * derivados con esos números, no con los viejos. */
                    try {
                        const _cfg = self.config.getPrefetchConfig(self.activeProfileId) || {};
                        self.applyCoherentPlan(_cfg.strategy);
                        self._paintCoherentValues();
                    } catch (e) { /* no bloqueante */ }
                    self._updateStreamingHealth();
                    return r;
                });
            }).catch(function (e) {
                self._lastBw = { ok: false, state: 'MEASURE_FAILED',
                                 reason: (e && e.message) || 'error midiendo', at: Date.now() };
                self._updateStreamingHealth();
                return self._lastBw;
            });
        }

        /* Estimación DOCUMENTADA de stall a partir del headroom.
         * Tiempo de descarga de un segmento = segDur / ratio. Si ratio < 1 el
         * segmento llega tarde y el buffer se vacía en esa proporción.
         * NO es una medición de stall: es una derivación del mismo ratio, y se
         * etiqueta como tal. ratio >= 1 ⇒ 0 %. */
        _stallFromRatio(r) {
            if (typeof r !== 'number' || !isFinite(r) || r <= 0) return null;
            return Math.max(0, Math.round((1 / r - 1) * 10000) / 100);
        }

        measurePredictiveAI() {
            try {
                if (!window.APE_BW || !window.APE_PREDICT) {
                    console.warn('⚠️ [PREDICT] APE_BW/APE_PREDICT no cargados');
                    return null;
                }
                const added = (typeof window.APE_BW.harvest === 'function') ? window.APE_BW.harvest() : 0;
                window.APE_PREDICT.observe();
                const sn = window.APE_PREDICT.snapshot();
                console.log(`🤖 [PREDICT] +${added} muestras · fuente=${sn.evidence.source} · ${sn.evidence.mbps} Mbps · conf=${sn.confidence} · tendencia=${sn.trend}`);
                this.render();
                return sn;
            } catch (e) {
                console.warn('⚠️ [PREDICT] measurePredictiveAI:', e && e.message);
                return null;
            }
        }

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

            // T6b SSOT guard: si el usuario borra el input (NaN/null), NO escribimos
            // un default — preservamos el valor LAB. El input volverá a mostrar el
            // LAB value en el próximo render(). Doctrine: el LAB es la fuente única.
            if (value === null || value === undefined ||
                (typeof value === 'number' && isNaN(value))) {
                console.log(`[pm9] updateSetting(${key}): valor inválido, preservando LAB`);
                return;
            }

            if (!profile.settings) profile.settings = {};

            // ══ ANTI-BUCLE (2026-11-06) 1/2 · IDEMPOTENCIA ═══════════════════
            // Si el perfil ya tiene ese valor no hay nada que recalcular ni que
            // repintar. Sin esta guarda, un evento que repitiese el valor actual
            // volvía a lanzar motor reactivo + render() + guardado: el eco.
            if (Object.prototype.hasOwnProperty.call(profile.settings, key) &&
                String(profile.settings[key]) === String(value)) return;

            // ══ ANTI-BUCLE (2026-11-06) 2/2 · PRESUPUESTO DE ESCRITURAS ══════
            // Un pico de >25 escrituras/s no es humano: es un bucle. Se descarta
            // la cascada y se avisa UNA vez. Inspección: window.ProfileManagerV9._writeWin
            const _wn = Date.now();
            if (!this._writeWin || _wn - this._writeWin.t > 1000) this._writeWin = { t: _wn, n: 0, warned: false };
            this._writeWin.n++;
            if (this._writeWin.n > 25) {
                if (!this._writeWin.warned) {
                    this._writeWin.warned = true;
                    console.warn(`[pm9] ${this._writeWin.n} escrituras/s → cascada descartada (protección anti-bucle)`);
                }
                return;
            }

            // Rangos físicos: un buffer ≤ 0 no existe (y era el origen de los
            // Network(C1):-13000ms). No se recorta el LAB: se ignora la escritura.
            if ((key === 'bufferSeconds' || key === 'buffer') && !(Number(value) > 0)) {
                console.warn(`[pm9] updateSetting(${key}): ${value} no es un buffer válido (>0), preservando LAB`);
                return;
            }

            // T6b: marcar override del usuario solo si el valor difiere del LAB
            const labValue = profile.settings ? profile.settings[key] : undefined;
            if (this.config.labBulletproof && String(value) !== String(labValue)) {
                this._markUserOverride(key);
            }

            // USER REQUEST: Handle Buffer Total conversion (Total = Base * 2.25)
            // if (key === 'bufferTotal') { ... } // Reverted

            // ── ORDEN CORREGIDO 2026-11-03 ──────────────────────────────────────────────
            // Antes el motor reactivo corría ANTES de escribir el valor nuevo, así que la
            // Regla 3 leía s.fps (viejo) al cambiar fps y s.resolution (viejo) en cascadas.
            // Medido: cambiar 30 -> 60 fps recalculaba el bitrate con 30. El valor se
            // escribe primero y las reglas derivan de él.
            /* [t17] 'strategy' pasa por el escritor único y se normaliza a la clave
             * canónica del panel (ultra-aggressive, no 'Ultra-Agresivo'). */
            if (key === 'strategy') { this._setUserStrategy(this.activeProfileId, value); }
            else { profile.settings[key] = value; }

            // Motor de Reglas Reactivas (Reactive Engine v9.0)
            this._applyReactiveRules(profile, key, value);
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

            /* [2026-11-18 · encargo] La ESTRATEGIA cambia el plan, así que al
             * cambiarla se recalcula TODO de inmediato (un ciclo forzado del
             * gobernador, que además publica el perfil de red con su sonda).
             * Antes sólo se escribía el setting y el plan quedaba viejo. */
            if (key === 'strategy') {
                try { this.governorRunOnce({ force: true }); } catch (e) { /* no bloqueante */ }
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

            // ══ ANTI-BUCLE (2026-11-06): PROFUNDIDAD DE CASCADA ═══════════════
            // Las reglas se llaman entre sí (fps→resolución→bitrate,
            // codec→resolución→bitrate, strategy→resolución→bitrate). El diseño
            // es acíclico y termina en 3 niveles; este tope de 8 garantiza que
            // ninguna regla futura pueda autoalimentarse en silencio.
            this._rxDepth = (this._rxDepth || 0) + 1;
            if (this._rxDepth > 8) {
                this._rxDepth--;
                if (!this._rxDepthWarned) {
                    this._rxDepthWarned = true;
                    console.warn('[pm9] cascada reactiva >8 niveles → abortada (protección anti-bucle)');
                }
                return;
            }
            try {



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

                // AUTO: BW Mínimo de Prefetch = exigencia × margen (1.15), NO 3×.
                // [t13 2026-11-17] 3×bitrate era IMPOSIBLE de cumplir con redes
                // reales: un perfil de 200 Mbps exigía 600 Mbps de mínimo y con
                // 0.1 Mbps medidos la validación no podía cuadrar jamás. El
                // margen es exactamente el que devuelve coherentPlan como
                // bwMinMbps y el que ya rige el panel en
                // streaming-calculator.js:45 (SAFETY_MARGIN = 1.15).
                if (this.config && this.config.updatePrefetchSetting) {
                    const margin = this._safetyMargin();
                    const __baseRealBW = (typeof ProfileManagerV9 !== "undefined" && ProfileManagerV9._requiredMbpsBasis)
                    ? ProfileManagerV9._requiredMbpsBasis(profile).mbps : Number(value);
                const minBwMbps = Math.round((__baseRealBW * margin) * 100) / 100;
                    this.config.updatePrefetchSetting(profile.id, 'min_bandwidth_mbps', minBwMbps);
                    console.log(`🧠 Reactive PRO [v13.1]: BW Mínimo Prefetch AUTO → ${minBwMbps} Mbps (${margin}× ${value})`);
                }
            }

            // ═══════════════════════════════════════════════════════════════════════
            // REGLA 1.1: RESOLUTION/QUALITY/BITRATE → BITRATE FLOOR (Piso Mínimo Absoluto)
            // ═══════════════════════════════════════════════════════════════════════
            // Floor = guardarail bajo el cual variantes HLS son inaceptables.
            // Distinto de bitrate_range_mbps.min (calidad óptima del rango).
            // SSOT: Profile Manager → Bridge → Generator (m3u8-typed-arrays-ultimate.js).
            if (key === 'resolution' || key === 'bitrate' || key === 'quality') {
                // B8 CERRADO: el perfil puede traer DOS suelos — bandwidth_floor en bps (LAB)
                // y bitrate_floor_mbps en Mbps (este gestor). El LAB manda cuando existe, y se
                // convierte a Mbps aqui para que ambos campos digan LO MISMO. Antes se leian por
                // separado y nada garantizaba que coincidieran: el panel mostraba 1,5 mientras el
                // motor escribia 0,15.
                const labFloorBps = Number(s.bandwidth_floor);
                if (isFinite(labFloorBps) && labFloorBps > 0) {
                    s.bitrate_floor_mbps = labFloorBps / 1e6;
                }
                const floorMbps = this._computeBitrateFloor(profile);
                // INVARIANTE: el suelo NUNCA puede superar el techo del perfil. La UI llegó a
                // mostrar BITRATE 0,3 con BITRATE FLOOR 1,5: el piso estaba por encima del
                // objetivo, que es una contradicción visible y deja el perfil sin margen
                // aritmético. Se recorta al techo; si el techo es el que está roto, lo corrige
                // la Regla 3 con su mínimo por resolución.
                const techoPerfil = Number(s.bitrate) || 0;
                s.bitrate_floor_mbps = (techoPerfil > 0) ? Math.min(floorMbps, techoPerfil) : floorMbps;

                // Inyectar en headers para visibilidad/telemetría (single-value, OkHttp-compatible)
                this.config.setHeaderOverride(profile.id, 'X-APE-BITRATE-FLOOR', String(floorMbps));
                this.config.setHeaderOverride(profile.id, 'X-Min-Bitrate', String(Math.round(floorMbps * 1000000)));

                console.log(`🧠 Reactive [v13.1]: Bitrate Floor → ${floorMbps} Mbps (${profile.quality || 'FHD'})`);
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

                // ── CORREGIDO 2026-11-03 ──────────────────────────────────────────────────────
                // Antes: bitrateFinal = bitrateBase × strategy.compressionMultiplier.
                // Medido en la UI: P5 SD (854×480, AV1, 30fps) mostraba 0,3 Mbps y al pasar la
                // estrategia a ultra-aggressive saltaba a 0,9. La cuenta: AV1_SD = 0.22 →
                // 854×480×30×0.22/1e6 = 2.70 Mbps brutos, y 2.70 × 0.27 = 0.73. Insostenible
                // para 480p y contra la ley de no degradar imagen.
                //
                // La causa es una DOBLE penalización: la eficiencia del códec YA está en
                // BITS_PER_PIXEL (AV1_SD 0.22 frente a H264_SD 0.30), y el multiplicador de
                // estrategia la aplicaba OTRA vez con un factor que no mide compresión de vídeo.
                //
                // La estrategia decide CÓMO se consume el buffer (prefetch, thresholds, timeouts,
                // reconexión), no CUÁNTA calidad se emite. Esa es la doctrina MAX IMAGE FIRST.
                //
                // Sin el multiplicador, el cálculo por BPP se conserva intacto y se le pone un
                // mínimo por resolución para que ningún perfil declare un bitrate que su
                // resolución no puede sostener. El mínimo es un suelo de coherencia, no un techo:
                // si el BPP da más, manda el BPP.
                const MIN_BITRATE_MBPS = { '8K': 40, 'UHD': 20, 'FHD': 8, 'HD': 3.5, 'SD': 1.5 };
                const bitrateMinimo = MIN_BITRATE_MBPS[resLabel] || 1.5;
                const bitrateFinal = parseFloat(Math.max(bitrateMinimo, bitrateBase).toFixed(1));

                // Actualizar bitrate y disparar cálculo de T1/T2 (Regla 1)
                s.bitrate = bitrateFinal;

                // Inyectar headers de codec y resolución
                // [2026-11-04] X-APE-CODEC declara SIEMPRE hvc1 (hint de preferencia al upstream).
                // Antes escribia la FAMILIA elegida (AV1/HEVC/H264) y, al ser el campo
                // AUTO_SYNCED + readonly, el operador no podia corregirlo desde la UI.
                // La familia real no se pierde: viaja en X-Video-Codecs.
                this.config.setHeaderOverride(profile.id, 'X-APE-CODEC', 'hvc1');
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
                // [HOMOLOGATION MAXIMAL 2026-06-07/2 HFRC mandato] Mapa COMPLETO de
                // nomenclaturas por codec — TODAS las variantes documentadas (family + RFC
                // short + dot/dash/case mixed + ISO/IEC formal + encoder name). Cubre cualquier
                // parser: ISO BMFF, DASH, HLS, DVB, Web, Smart TV, móvil, decoders enterprise.
                // SSOT en [[feedback_codec_homologation_universal_cascade]].
                // Doctrina HEVC-FIRST: cuando se selecciona H265, TODOS los homologs HEVC se
                // emiten primero; H264 y resto después como fallbacks.
                const CODEC_NOMENCLATURE = {
                    'H265':  { names: ['hevc', 'hev1', 'hev2', 'hvc1', 'hvc2', 'h265', 'H265', 'h.265', 'H.265', 'h-265', 'H-265', 'MPEG-H', 'mpeg-h', 'MPEG-H Part2', 'MPEG-H Part 2', 'mpegh', 'x265', 'x.265', 'ISO/IEC 23008-2'], profileTag: 'main-12,main-10', tier: 'HIGH', levels: '6.1,6.0,5.1,5.0,4.1' },
                    'H264':  { names: ['h264', 'H264', 'h.264', 'H.264', 'h-264', 'H-264', 'avc', 'AVC', 'avc1', 'avc3', 'MPEG-4 AVC', 'mpeg4-avc', 'MPEG4-AVC', 'x264', 'ISO/IEC 14496-10'], profileTag: 'high', tier: 'HIGH', levels: '5.1,5.0,4.2,4.1' },
                    'AV1':   { names: ['av1', 'av01', 'AV1', 'AOM-AV1', 'libaom-av1'], profileTag: 'main-12,main-10,main', tier: 'HIGH', levels: '6.1,6.0,5.1' },
                    'VP9':   { names: ['vp9', 'VP9', 'vp09', 'vp9.0'], profileTag: 'profile2,profile0', tier: 'N/A', levels: 'N/A' },
                    'MPEG2': { names: ['mpeg2', 'mpeg-2', 'h262', 'H262', 'MPEG-2', 'MPEG2', 'ISO/IEC 13818-2'], profileTag: 'main', tier: 'HIGH', levels: 'high' }
                };

                // [HOMOLOGATION HEVC-FIRST 2026-06-07 HFRC mandato] Orden universal:
                // HEVC siempre PRIMERO con TODOS sus homólogos, antes de AV1/VP9/H264/MPEG2.
                // Doctrina: H265 es el codec dominante en IPTV premium con mejor soporte HW
                // universal en TVs/STBs modernos. AV1 es superior técnicamente pero soporte
                // limitado en hardware IPTV. H264 SIEMPRE al final como universal-fallback.
                const QUALITY_ORDER = ['H265', 'H264', 'VP9', 'AV1', 'MPEG2'];

                const selected = value.toUpperCase();
                const selectedIdx = QUALITY_ORDER.indexOf(selected === 'HEVC' ? 'H265' : selected);
                const normalizedKey = selected === 'HEVC' ? 'H265' : selected;

                // Construir cadena de prioridad: seleccionado + fallbacks en orden de calidad
                const priorityChain = [];
                // 1. Agregar el seleccionado primero (todas sus nomenclaturas)
                if (CODEC_NOMENCLATURE[normalizedKey]) {
                    priorityChain.push(...CODEC_NOMENCLATURE[normalizedKey].names);
                }
                // 2. Agregar los demás en orden QUALITY_ORDER (todos, no solo los de después)
                // Fix: loop over all — AV1 at idx 3 would only get MPEG2 if we started at idx+1
                for (let i = 0; i < QUALITY_ORDER.length; i++) {
                    const fallbackKey = QUALITY_ORDER[i];
                    if (fallbackKey !== normalizedKey && CODEC_NOMENCLATURE[fallbackKey]) {
                        priorityChain.push(CODEC_NOMENCLATURE[fallbackKey].names[0]);
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
                this.config.setHeaderOverride(profile.id, 'X-APE-CODEC', 'hvc1');
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

                // ── CORREGIDO 2026-11-03 ──────────────────────────────────────────────────────
                // El BITS_PER_PIXEL depende del códec: AV1_SD es 0.22 y H264_SD es 0.30, un 36 % de
                // diferencia. La Regla 5 sólo tocaba headers, así que cambiar de AV1 a H264 dejaba
                // el bitrate calculado con el BPP del códec anterior: el campo quedaba descolgado de
                // su propia premisa. Se dispara la Regla 3, igual que ya hacen fps (Regla 2.3) y
                // strategy (Regla 4).
                this._applyReactiveRules(profile, 'resolution', s.resolution);
            }
            } finally {
                this._rxDepth--;
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
         * 🔽 Alternar la visibilidad del menú flotante de exportación
         */
        toggleExportMenu() {
            const menu = document.getElementById('ape-floating-export-menu');
            if (menu) {
                if (menu.style.display === 'none') {
                    menu.style.display = 'flex';
                } else {
                    menu.style.display = 'none';
                }
            }
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

        /**
         * 📦 EXPORTAR TODOS los perfiles como JSON
         */
        exportAllProfiles() {
            const exportData = {
                _meta: {
                    type: 'all_profiles',
                    exported: new Date().toISOString(),
                    version: 'APE_v9.0'
                },
                profiles: this.config.getAllProfiles()
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `APE_ALL_PROFILES_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);

            console.log(`📦 Todos los perfiles exportados exitosamente`);
        }

        /**
         * 🔄 IMPORTAR TODOS los perfiles desde un JSON
         */
        importAllProfiles() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            document.body.appendChild(input);

            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    // Aceptar 3 formatos:
                    // 1. { _meta: {type:'all_profiles'}, profiles: {P0..P5} } — formato oficial v9
                    // 2. { _meta: {version:'APE_v9.0'}, profiles: {P0..P5} } — formato con version
                    // 3. { P0:{...}, P1:{...} } — directo sin envelope
                    let profilesData = null;
                    if (data && data.profiles && typeof data.profiles === 'object') {
                        profilesData = data.profiles;
                    } else if (data && /^P[0-5](?:[._]5)?$/.test(Object.keys(data)[0] || '')) {
                        profilesData = data;
                    }

                    if (!profilesData) throw new Error('El archivo no contiene perfiles válidos (P0-P5).');

                    /* [2026-11-20] /^P[0-5]$/ descartaba P0.5..P5.5: se importaban 6 de 12. */
    const pids = Object.keys(profilesData).filter(k => /^P[0-5](?:[._]5)?$/.test(k));
                    if (pids.length === 0) throw new Error('No se encontraron perfiles P0-P5 en el JSON.');

                    // Usar importProfiles de la clase (hace deep merge con DEFAULT_PROFILES)
                    if (typeof this.config.importProfiles === 'function') {
                        const ok = this.config.importProfiles({ profiles: profilesData, manifest: data.manifest, strategicHeaders: data.strategicHeaders });
                        if (!ok) throw new Error('La función importProfiles reportó fallo.');
                    } else {
                        // Fallback directo
                        this.config.profiles = profilesData;
                        this.config.save();
                    }
                    this.render();
                    console.log(`✅ ${pids.length} perfiles importados: ${pids.join(', ')}`);
                    alert(`✅ ${pids.length} perfiles restaurados: ${pids.join(', ')}`);
                } catch (err) {
                    console.error('❌ Error al importar todos los perfiles:', err);
                    alert(`❌ Error al leer la plantilla:\n${err.message}\n\nAsegúrate de que sea un JSON con perfiles P0-P5 válidos.`);
                } finally {
                    input.remove();
                }
            });

            input.click();
        }

        toggleSaveMenu() {
            const el = document.getElementById('ape-floating-save-menu');
            if (!el) return;
            const open = el.style.display === 'flex';
            el.style.display = open ? 'none' : 'flex';
            const id = document.getElementById('pm9-save-current-id');
            if (id) id.textContent = this.activeProfileId || 'P0';
        }

        _persistProfileSnapshot(label) {
            if (!this.config) return null;
            let snapshot = null;
            try {
                snapshot = JSON.stringify(this.config.profiles);
                localStorage.setItem('ape_profiles_v9', snapshot);
                localStorage.setItem('ape_profiles_v9_saved_at', new Date().toISOString());
                localStorage.setItem('ape_profiles_v9_saved_by', label);
            } catch (e) {
                console.warn('[PM9] no pude escribir localStorage:', e.message);
            }
            if (typeof this.config.flushSave === 'function') this.config.flushSave();
            else if (typeof this.config.save === 'function') this.config.save();
            return snapshot;
        }

        saveCurrentProfile() {
        try { this._pushProfilesToVps('saveCurrentProfile'); } catch (e) { /* no bloqueante */ }
            if (!this.config) return;
            this._applyDerivedProfile(this.config.getProfile(this.activeProfileId));
            const snap = this._persistProfileSnapshot('ProfileManagerV9.saveCurrentProfile');
            const bytes = snap ? snap.length : 0;
            try {
                if (window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('Perfil ' + this.activeProfileId + ' guardado (' + Math.round(bytes / 1024) + ' KB)', 'success');
                }
            } catch (e) { /* no bloqueante */ }
            this.toggleSaveMenu();
            console.log('✅ Perfil guardado:', this.activeProfileId, { profilesBytes: bytes });
        }

        /* [2026-11-19] Al GUARDAR, empujar los perfiles al VPS para que su
         * generacion/consumo use exactamente lo que el operador tiene aqui.
         * Fire-and-forget: si el VPS no responde, el guardado local ya esta
         * hecho y no se pierde nada. Devuelve la promesa para poder esperarla
         * en el boton si se quiere. */
        _pushProfilesToVps(source) {
            try {
                const cfg = this.config;
                if (!cfg || !cfg.profiles) return Promise.resolve({ ok: false, reason: 'no_config' });
                const S = (typeof window !== 'undefined' && window.APE_PROFILES_SYNC) || {};
                const url = S.url || '/prisma/api/ape-profiles-state.php';
                const headers = { 'Content-Type': 'application/json' };
                if (S.token) headers['X-APE-Token'] = S.token;
                const body = JSON.stringify({ source: source || 'panel', profiles: cfg.profiles });
                return fetch(url, { method: 'POST', headers: headers, body: body, keepalive: true, cache: 'no-store' })
                    .then(function (r) { return r.json().then(function (j) { return Object.assign({ http: r.status }, j); }); })
                    .then((res) => {
                        const ok = !!res.ok;
                        console.log('[SYNC] perfiles -> VPS:', ok ? ('OK ' + res.profiles + ' perfiles, ' + res.bytes + ' B') : ('FALLO ' + (res.error || res.http)));
                        try {
                            if (ok && window.app && typeof window.app.showToast === 'function') {
                                window.app.showToast('VPS actualizado: ' + res.profiles + ' perfiles', 'success');
                            } else if (!ok && window.app && typeof window.app.showToast === 'function') {
                                window.app.showToast('VPS NO actualizado: ' + (res.error || res.http), 'error');
                            }
                        } catch (e) { /* no bloqueante */ }
                        return res;
                    })
                    .catch(function (e) {
                        console.log('[SYNC] perfiles -> VPS: red ' + ((e && e.message) || e));
                        return { ok: false, reason: 'network' };
                    });
            } catch (e) {
                return Promise.resolve({ ok: false, reason: 'exception' });
            }
        }

        saveAllProfiles() {
            if (!this.config) return;
            this.normalizeAllProfiles();
            const snap = this._persistProfileSnapshot('ProfileManagerV9.saveAllProfiles');
        try { this._pushProfilesToVps('saveAllProfiles'); } catch (e) { /* no bloqueante */ }
            const bytes = snap ? snap.length : 0;
            try {
                if (window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast(this._allProfileIds().length + ' perfiles guardados (' + Math.round(bytes / 1024) + ' KB)', 'success');
                }
            } catch (e) { /* no bloqueante */ }
            this.toggleSaveMenu();
            console.log('✅ perfiles guardados:', { profilesBytes: bytes });
        }

        saveAndClose() {
            if (!this.config) return;
            // Persistencia DIRECTA, sin depender del debounce ni de otro loader:
            // 1) escribir el objeto completo de perfiles en la misma clave que
            //    lee ape-profiles-config al arrancar.
            var snapshot = null;
            try {
                snapshot = JSON.stringify(this.config.profiles);
                localStorage.setItem('ape_profiles_v9', snapshot);
                localStorage.setItem('ape_profiles_v9_saved_at', new Date().toISOString());
                localStorage.setItem('ape_profiles_v9_saved_by', 'ProfileManagerV9.saveAndClose');
            } catch (e) {
                console.warn('[PM9] no pude escribir localStorage:', e.message);
            }
            // 2) flushSave (también persiste manifiesto/headers/fusible).
            if (typeof this.config.flushSave === 'function') {
                this.config.flushSave();
            } else if (typeof this.config.save === 'function') {
                this.config.save();
            }
            var bytes = snapshot ? snapshot.length : 0;
            console.log('✅ Perfil guardado:', this.activeProfileId,
                { profilesBytes: bytes, savedAt: localStorage.getItem('ape_profiles_v9_saved_at') });

            // 3) Aviso visible: antes el botón no daba feedback y parecía no guardar.
            try {
                if (window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast(
                        'Perfil ' + this.activeProfileId + ' guardado (' + Math.round(bytes / 1024) + ' KB)',
                        'success'
                    );
                }
            } catch (e) { /* no bloqueante */ }

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

        /**
         * 🧪 IMPORT FROM LAB — consume LAB_CALIBRATED_*.json del APE_M3U8_LAB Excel
         * Schema esperado: omega_v1
         * Hace dry-run mostrando diff antes de aplicar
         */
        importFromLAB() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            document.body.appendChild(input);

            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    document.body.removeChild(input);
                    return;
                }

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    /* ═══════════════════════════════════════════════════════════════
             * [2026-11-20] EL BOTON "Import LAB" TAMBIEN ACEPTA LOS all_profiles
             *
             * Los ficheros APE_ALL_PROFILES_*.json (PREMIUM_120_60_30,
             * 6K_4K_CASCADA, y cualquier export de "Guardar TODOS") traen la forma
             *   { _meta:{type:'all_profiles'}, profiles:{P0..P5,P0.5..P5.5} }
             * y NO traen lab_version. Este boton los rechazaba con
             *   "Schema no soportado: undefined"
             * aunque el proyecto SI sabe aplicarlos (importAllProfiles). Aqui se
             * detectan ANTES de la validacion de schema y se aplican por la misma
             * via, preservando las 12 entradas y TODAS sus claves: settings (71),
             * quality_levels, headers, vlcopt, kodiprop, prefetch_config, bounds,
             * optimized_knobs, fitness, _objective... El deep merge del motor
             * rellena lo que falte y NO borra lo que venga.
             * ═══════════════════════════════════════════════════════════════ */
            if (data && data.profiles && typeof data.profiles === 'object' && !data.lab_version) {
                const _ids = Object.keys(data.profiles).filter(k => /^P[0-5](?:[._]5)?$/.test(k));
                if (_ids.length > 0) {
                    let _ok = false;
                    if (typeof this.config.importProfiles === 'function') {
                        _ok = this.config.importProfiles({
                            profiles: data.profiles,
                            manifest: data.manifest,
                            strategicHeaders: data.strategicHeaders,
                            rea_processing: data.rea_processing
                        });
                    } else {
                        this.config.profiles = data.profiles;
                        if (typeof this.config.save === 'function') this.config.save();
                        _ok = true;
                    }
                    if (!_ok) throw new Error('importProfiles reporto fallo');
                    this.render();
                    console.log('[IMPORT] all_profiles via boton LAB: ' + _ids.length + ' perfiles -> ' + _ids.join(', '));
                    alert('✅ ' + _ids.length + ' perfiles importados: ' + _ids.join(', ')
                        + '\n\nFuente: ' + file.name
                        + '\nSe conservan settings, quality_levels, headers, vlcopt y kodiprop.');
                    return;
                }
            }
            // [2026-11-08] Huella criptografica del fichero importado. Cierra la carencia
                    // 'sha256=unverified': el DNA de la lista podia nombrar el LAB pero no probar
                    // QUE fichero exacto se importo. Se calcula sobre los bytes reales del upload.
                    let labSha256 = null;
                    try {
                        if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
                            const _buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
                            labSha256 = Array.from(new Uint8Array(_buf))
                                .map(b => b.toString(16).padStart(2, '0')).join('');
                        }
                    } catch (_shaErr) { labSha256 = null; }

                    // Validar schema
                    const supportedSchemas = ['omega_v1', 'omega_v1_bulletproof_20260520'];
                    const isBulletproof = data.lab_schema_variant === 'omega_v2_bulletproof_perprofile' || data.bulletproof === true;
                    // [2026-11-08] Endurecido para NO divergir del motor (ape-profiles-config.js
                    // importFromLABData). Antes esta capa solo aceptaba omega_v1*: un LAB con
                    // lab_version='omega_v2...' y sin bulletproof:true lo ACEPTABA el motor y lo
                    // RECHAZABA este boton ("Schema no soportado"). Mismo criterio en ambas capas.
                    const isVersionSupported = (data && data.lab_version && /^omega_/i.test(String(data.lab_version)))
                        || supportedSchemas.includes(data && data.lab_version)
                        || isBulletproof;
                    if (!isVersionSupported) {
                        alert(`⚠️ Schema no soportado: ${data.lab_version}\nSoportados: ${supportedSchemas.join(', ')}`);
                        return;
                    }
                    if (isBulletproof) console.log('[LAB-CONSUMER] 🛡 Bulletproof JSON detectado — consumiendo 100% de los campos.');
                    if (data.playlist_format !== 'm3u8') {
                        alert(`⚠️ playlist_format inesperado: ${data.playlist_format}\nEsperado: m3u8`);
                        return;
                    }

                    // === DRY-RUN: calcular diff ===
                    const diff = this._computeLABDiff(data);

                    const summary =
                        `🧪 IMPORT FROM LAB — DRY RUN\n\n` +
                        `Archivo: ${file.name}\n` +
                        `Exportado: ${data.exported_at}\n` +
                        `Tamaño: ${(file.size/1024).toFixed(1)} KB\n\n` +
                        `===== CAMBIOS A APLICAR =====\n\n` +
                        `📦 PERFILES P0-P5:\n` +
                        `  ${diff.profiles.updated} actualizados\n` +
                        `  ${diff.profiles.headerOverrides_added} headerOverrides nuevos\n` +
                        `  ${diff.profiles.vlcopt_added} vlcopt nuevos\n` +
                        `  ${diff.profiles.kodiprop_added} kodiprop nuevos\n\n` +
                        `📋 NIVEL_1 (master playlist headers):\n` +
                        `  ${diff.nivel1.count} directivas (NUEVO en frontend)\n\n` +
                        `🎬 NIVEL_3 (per-channel directives):\n` +
                        `  VLC: ${diff.nivel3.VLC || 0}\n` +
                        `  KOD: ${diff.nivel3.KOD || 0}\n` +
                        `  HTT: ${diff.nivel3.HTT || 0}\n` +
                        `  EI:  ${diff.nivel3.EI || 0}\n` +
                        `  SYS: ${diff.nivel3.SYS || 0}\n\n` +
                        `🌐 SERVIDORES: ${diff.servers}\n` +
                        `🎭 EVASION POOL: ${diff.evasion_uas} UAs, ${diff.evasion_refs} refs\n` +
                        `⚙️  CONFIG GLOBAL: ${diff.config_keys} parámetros\n\n` +
                        `📊 SCORING METADATA:\n` +
                        `  Directivas totales: ${data.scoring_metadata?.total_directives || '?'}\n` +
                        `  Refined ≥95: ${data.scoring_metadata?.refined_ge95 || '?'}\n\n` +
                        (diff.gap_plan ? (
                            `🎯 OMEGA GAP PLAN (omega_v2.2):\n` +
                            `  Score actual: ${diff.gap_plan.scorecard} (Grade ${diff.gap_plan.grade})\n` +
                            `  Items totales: ${diff.gap_plan.items}\n` +
                            `  REPLICAR: ${diff.gap_plan.replicar}  IMPLEMENTAR: ${diff.gap_plan.implementar}  QUITAR: ${diff.gap_plan.quitar}\n\n`
                        ) : '') +
                        (diff.prisma_lab_sync ? (
                            `🔮 PRISMA LAB-SYNC v2.0 (Stage ${diff.prisma_lab_sync.stage}):\n` +
                            `  Compliance: ${diff.prisma_lab_sync.compliance}% (target 95%)\n` +
                            `  Profile attrs (boost/floor/target/zap): ${diff.prisma_lab_sync.profile_attrs} perfiles\n` +
                            `  N3 directives PRISMA: ${diff.prisma_lab_sync.n3_directives}\n` +
                            `  Placeholders {prisma.*}: ${diff.prisma_lab_sync.placeholders}\n` +
                            `  Feature sheets: ${diff.prisma_lab_sync.feature_sheets} · ADB settings: ${diff.prisma_lab_sync.adb_settings}\n` +
                            `  VBA modules: ${diff.prisma_lab_sync.vba_modules}  ·  Config JSONs embedded: ${diff.prisma_lab_sync.config_jsons}\n\n`
                        ) : '') +
                        `===== ¿APLICAR CAMBIOS? =====\n\n` +
                        `OK = aplicar todo (irreversible)\n` +
                        `Cancelar = no hacer nada`;

                    if (!confirm(summary)) {
                        console.log('[LAB] Import cancelado por usuario');
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // 🛡️ ANTI-DRIFT — Paso 2: Extras toggle (per-profile)
                    // Cada perfil con extras pregunta si el generator debe emitirlos.
                    // ═══════════════════════════════════════════════════════════
                    const includeExtrasByProfile = {};
                    if (diff.labExtras.totalAcrossProfiles > 0) {
                        const profileIds = Object.keys(diff.labExtras.byProfile);
                        const extrasMsg =
                            `🛡️ EXTRAS DEL LAB DETECTADOS\n\n` +
                            `El LAB Bulletproof trae ${diff.labExtras.totalAcrossProfiles} campos ` +
                            `extra (vlcopt/kodiprop/headers no estándar) que NO están en las 19 ` +
                            `categorías del Profile Manager v9.\n\n` +
                            `Distribución por perfil:\n` +
                            profileIds.map(p => {
                                const e = diff.labExtras.byProfile[p];
                                return `  ${p}: ${e.total} extras (HO:${e.headerOverrides.length} VLC:${e.vlcopt.length} KOD:${e.kodiprop.length})`;
                            }).join('\n') +
                            `\n\n¿Procesarlos para que el GENERADOR los incluya en la lista .m3u8?\n\n` +
                            `OK = SÍ — listas excepcionales con TODA la data del LAB\n` +
                            `Cancelar = NO — solo campos habituales del frontend (267 PM9)`;
                        const includeAll = confirm(extrasMsg);
                        for (const pid of profileIds) includeExtrasByProfile[pid] = includeAll;
                        console.log(`[LAB] includeLabExtras decision: ${includeAll ? 'YES' : 'NO'} aplicado a ${profileIds.length} perfiles`);
                    }

                    // ═══════════════════════════════════════════════════════════
                    // 🛡️ ANTI-DRIFT — Paso 3: Rename collision resolver
                    // Para cada header LAB con drift case/separator vs PM9, decisión
                    // global: renombrar al canónico PM9, o omitir.
                    // ═══════════════════════════════════════════════════════════
                    const collisionResolutions = {}; // key: `${profile}:${labKey}` → 'rename'|'omit'
                    if (diff.labRenameCollisions.length > 0) {
                        const sample = diff.labRenameCollisions.slice(0, 8)
                            .map(c => `  ${c.profile}: "${c.labKey}" ≈ "${c.pm9Key}"`)
                            .join('\n');
                        const more = diff.labRenameCollisions.length > 8
                            ? `\n  ... y ${diff.labRenameCollisions.length - 8} más`
                            : '';
                        const collMsg =
                            `🛡️ COLISIONES DE NOMBRE DETECTADAS\n\n` +
                            `${diff.labRenameCollisions.length} headers del LAB tienen nombre ` +
                            `similar (case/separator drift) a headers existentes en PM9:\n\n` +
                            sample + more + `\n\n` +
                            `¿Renombrar al estándar del frontend (PM9 canónico)?\n\n` +
                            `OK = RENOMBRAR todos al estándar PM9\n` +
                            `Cancelar = OMITIR todos los headers en colisión`;
                        const renameAll = confirm(collMsg);
                        const action = renameAll ? 'rename' : 'omit';
                        for (const c of diff.labRenameCollisions) {
                            collisionResolutions[`${c.profile}:${c.labKey}`] = action;
                        }
                        console.log(`[LAB] collision resolution: ${action} aplicado a ${diff.labRenameCollisions.length} colisiones`);
                    }

                    // === APPLY ===
                    const result = await this.config.importFromLABData(data, {
                        includeExtrasByProfile,
                        collisionResolutions,
                        renameCollisions: diff.labRenameCollisions,
                        // [2026-11-08] la huella viaja con el import y se persiste; el generador
                        // la emite en #EXT-X-APE-LAB-DNA en lugar de 'unverified'.
                        labSha256
                    });

                    // Re-render
                    if (typeof this.render === 'function') {
                        this.render();
                    }

                    const prismaSummary = result.prismaStage
                        ? `\n\n🔮 PRISMA LAB-SYNC v2.0 (Stage ${result.prismaStage}) consumido:\n` +
                          `  • Compliance: ${result.prismaComplianceScore}% target 95%\n` +
                          `  • Profile attrs: ${result.prismaProfileAttrsCount}/6 perfiles\n` +
                          `  • N3 directives: ${result.prismaN3DirectivesCount}\n` +
                          `  • Placeholders {prisma.*}: ${result.prismaPlaceholdersCount}\n` +
                          `  • VBA modules: ${result.prismaVbaModulesCount}\n` +
                          `  • Config JSONs embedded: ${result.prismaConfigJsonsCount}`
                        : '';

                    const antiDriftSummary =
                        (result.profilesWithExtras > 0 || result.renameApplied > 0 || result.renameOmitted > 0)
                            ? `\n\n🛡️ ANTI-DRIFT:\n` +
                              `  • Perfiles con extras habilitados: ${result.profilesWithExtras || 0}\n` +
                              `  • Headers renombrados a PM9-standard: ${result.renameApplied || 0}\n` +
                              `  • Headers en colisión omitidos: ${result.renameOmitted || 0}`
                            : '';

                    alert(`${isBulletproof ? '🛡 BULLETPROOF v2 IMPORTADO' : '✅ LAB CALIBRATED IMPORTADO'}\n\n` +
                          `Perfiles actualizados: ${result.profilesUpdated}\n` +
                          `headerOverrides aplicados: ${result.headersAdded}\n` +
                          `NIVEL_1 directivas: ${result.nivel1Count}\n` +
                          `NIVEL_3 entries: ${result.nivel3Total}\n` +
                          `Placeholders mapeados: ${result.placeholdersCount || 0}\n` +
                          `Servers: ${result.serversCount}` +
                          prismaSummary + antiDriftSummary + `\n\n` +
                          `Próximo paso: generar lista .m3u8 desde APE generator.\n` +
                          `${isBulletproof ? '⚙️ ENGINE: Consumo Bulletproof 100% activo.' : 'El generator inyectará todo lo del LAB.'}` +
                          `${result.prismaStage ? '\n🔮 PRISMA: piso/boost/DNA aplicados por perfil.' : ''}` +
                          `${result.profilesWithExtras > 0 ? '\n🛡️ EXTRAS: generator emitirá campos no-PM9 en perfiles habilitados.' : ''}`);

                    console.log('[LAB] Import OK', result);
                } catch (err) {
                    console.error('[LAB] Import falló:', err);
                    alert(`❌ Error: ${err?.message || err}`);
                } finally {
                    if (input.parentNode) document.body.removeChild(input);
                }
            });

            input.click();
        }

        /**
         * Calcula diff entre estado actual y data del LAB
         *
         * 🛡️ ANTI-DRIFT (2026-04-29):
         *   - labExtras: campos LAB que NO están en PM9 HEADER_CATEGORIES (267 canónicos).
         *     El generator los emitirá SOLO si el usuario opta-in en el dialog de import.
         *   - labRenameCollisions: keys del LAB que matchean PM9 case/separator-insensitive
         *     pero no exacto. El usuario decide por colisión: rename a PM9-standard o omitir.
         */
        _computeLABDiff(data) {
            const diff = {
                profiles: { updated: 0, headerOverrides_added: 0, vlcopt_added: 0, kodiprop_added: 0 },
                nivel1: { count: 0 },
                nivel3: {},
                servers: 0,
                evasion_uas: 0,
                evasion_refs: 0,
                config_keys: 0,
                gap_plan: null,
                labExtras: { byProfile: {}, totalAcrossProfiles: 0 },
                labRenameCollisions: []
            };

            // PM9 canonical set (267 headers) para detección de extras + colisiones
            const pm9Set = (this.config?.getPm9HeaderSet && this.config.getPm9HeaderSet()) || new Set();
            const findCanonical = this.config?.findPm9CanonicalName || (() => null);
            // Generator-known vlcopt keys (emitidos por generateEXTVLCOPT). Cualquier
            // key vlcopt fuera de este set queda silenciada hoy → es "extra" potencial.
            const KNOWN_VLCOPT = new Set([
                'network-caching','live-caching','file-caching','disc-caching','tcp-caching','sout-mux-caching',
                'clock-jitter','clock-synchro',
                'http-user-agent','http-forward-cookies','http-reconnect','http-continuous-stream','http-continuous',
                'video-filter','video-color-space','video-transfer-function','video-color-primaries','video-color-range',
                'tone-mapping','hdr-output-mode','sharpen-sigma','contrast','brightness','saturation','gamma'
            ]);
            // Generator-known kodiprop keys (emitidos por build_kodiprop streamHeaders).
            // El kodiprop dict del LAB se ITERA completo en otros puntos (línea ~7768),
            // pero cualquier key no estándar puede ser un extra para flag al usuario.
            const KNOWN_KODIPROP = new Set([
                'inputstream.adaptive.manifest_type','inputstream.adaptive.stream_selection_type',
                'inputstream.adaptive.chooser_bandwidth_mode','inputstream.adaptive.chooser_resolution_max',
                'inputstream.adaptive.user_agent','inputstream.adaptive.stream_headers',
                'inputstream.adaptive.license_type','inputstream.adaptive.license_key',
                'inputstream.adaptive.manifest_update_parameter'
            ]);

            /* [FASE 3] Dos familias: profiles_calibrated (bulletproof) y profiles (fusión, 12 con P*.5). */
            const labProfiles = (typeof global !== 'undefined' && global.APELabNormalize)
                ? global.APELabNormalize.profilesOf(data)
                : (data.profiles_calibrated || {});
            // [6K 2026-11-05] El LAB v24 trae P0.5..P5.5 ademas de P0..P5. El diff del import
            // debe contarlos o el panel reporta menos cambios de los que realmente aplica.
            const APE_6K_IDS = ['P0.5','P1.5','P2.5','P3.5','P4.5','P5.5'];
            for (const pid of ['P0','P1','P2','P3','P4','P5'].concat(APE_6K_IDS)) {
                const lp = labProfiles[pid];
                if (!lp) continue;
                diff.profiles.updated++;
                diff.profiles.headerOverrides_added += Object.keys(lp.headerOverrides || {}).length;
                diff.profiles.vlcopt_added += Object.keys(lp.vlcopt || {}).length;
                diff.profiles.kodiprop_added += Object.keys(lp.kodiprop || {}).length;

                // Detección extras + colisiones por perfil
                const extras = { headerOverrides: [], vlcopt: [], kodiprop: [] };
                for (const k of Object.keys(lp.headerOverrides || {})) {
                    if (pm9Set.has(k)) continue; // exact match → no es extra ni colisión
                    const canonical = findCanonical(k);
                    if (canonical) {
                        // Drift detectada (case/separator) — colisión, no extra
                        diff.labRenameCollisions.push({ profile: pid, labKey: k, pm9Key: canonical });
                    } else {
                        extras.headerOverrides.push(k);
                    }
                }
                for (const k of Object.keys(lp.vlcopt || {})) {
                    if (!KNOWN_VLCOPT.has(k)) extras.vlcopt.push(k);
                }
                for (const k of Object.keys(lp.kodiprop || {})) {
                    if (!KNOWN_KODIPROP.has(k)) extras.kodiprop.push(k);
                }
                const subtotal = extras.headerOverrides.length + extras.vlcopt.length + extras.kodiprop.length;
                if (subtotal > 0) {
                    extras.total = subtotal;
                    diff.labExtras.byProfile[pid] = extras;
                    diff.labExtras.totalAcrossProfiles += subtotal;
                }
            }

            diff.nivel1.count = (data.nivel1_directives || []).length;
            for (const layer in (data.nivel3_per_layer || {})) {
                diff.nivel3[layer] = (data.nivel3_per_layer[layer] || []).length;
            }
            diff.servers = (data.servers || []).length;
            diff.evasion_uas = (data.evasion_pool?.user_agents || []).length;
            diff.evasion_refs = (data.evasion_pool?.referers || []).length;
            diff.config_keys = Object.keys(data.config_global || {}).length;

            // Gap plan summary (omega_v2.2)
            const gp = data.omega_gap_plan;
            if (gp) {
                const items = Array.isArray(gp.items) ? gp.items : [];
                diff.gap_plan = {
                    items: items.length,
                    replicar: gp.summary?.replicar || 0,
                    implementar: gp.summary?.implementar || 0,
                    quitar: gp.summary?.quitar || 0,
                    scorecard: gp.scorecard_total || '',
                    grade: gp.scorecard_grade || ''
                };
            }

            // 🔮 PRISMA LAB-SYNC v2.0 stats
            const ps = data.prisma_lab_sync_v20;
            if (ps) {
                diff.prisma_lab_sync = {
                    stage: ps._metadata?.stage || '?',
                    compliance: ps._metadata?.compliance_score_current || 0,
                    profile_attrs: Object.keys(ps.profile_attributes || {}).length,
                    n3_directives: (ps.n3_directives_added || []).length,
                    placeholders: (ps.placeholders_added || []).length,
                    vba_modules: Object.keys(ps.vba_modules || {}).length,
                    feature_sheets: Object.keys(ps.feature_sheets || {}).length,
                    config_jsons: Object.keys(ps.config_jsons_consumed_by_vps || {}).filter(k => k !== '_dir').length,
                    adb_settings: Array.isArray(ps.feature_sheets?.['19_ADB_PAYLOAD_INJECTOR']) ? ps.feature_sheets['19_ADB_PAYLOAD_INJECTOR'].length : 0
                };
            }

            return diff;
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

