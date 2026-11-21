/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔐 DEVICE FINGERPRINT COLLECTOR v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Recolecta información real del dispositivo/navegador para generar
 * fingerprints únicos y sofisticados para evasión de ISP y anti-tracking.
 * 
 * SECCIONES:
 * 1. Device Info (5 campos)
 * 2. Browser Info (6 campos)  
 * 3. Screen Info (4 campos)
 * 4. Network Info (3 campos)
 * 5. Canvas Fingerprint (2 campos)
 * 6. Audio Fingerprint (2 campos)
 * 7. WebGL Info (4 campos)
 * 8. Timing Info (3 campos)
 * 
 * TOTAL: 29 campos de fingerprint real
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.0.0';

    class DeviceFingerprintCollector {
        constructor() {
            this.version = VERSION;
            this._cache = null;
            this._cacheExpiry = 0;
            this._cacheDurationMs = 5 * 60 * 1000; // 5 minutos cache
            console.log(`%c🔐 Device Fingerprint Collector v${VERSION}`, 'color: #ef4444; font-weight: bold;');
        }

        /**
         * Genera fingerprint completo con 29 campos
         * @returns {Object} Fingerprint con todas las secciones
         */
        async collect() {
            // Usar cache si está vigente
            if (this._cache && Date.now() < this._cacheExpiry) {
                return this._cache;
            }

            const fingerprint = {
                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 1: DEVICE INFO (5 campos)
                // ─────────────────────────────────────────────────────────────────
                device_platform: navigator.platform || 'Unknown',
                device_cores: navigator.hardwareConcurrency || 4,
                device_memory: navigator.deviceMemory || 8,
                device_touch: navigator.maxTouchPoints || 0,
                device_type: this._detectDeviceType(),

                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 2: BROWSER INFO (6 campos)
                // ─────────────────────────────────────────────────────────────────
                browser_ua: navigator.userAgent,
                browser_language: navigator.language || 'en-US',
                browser_languages: (navigator.languages || ['en-US']).join(','),
                browser_cookies: navigator.cookieEnabled,
                browser_dnt: navigator.doNotTrack || '0',
                browser_vendor: navigator.vendor || 'Unknown',

                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 3: SCREEN INFO (4 campos)
                // ─────────────────────────────────────────────────────────────────
                screen_width: screen.width || 1920,
                screen_height: screen.height || 1080,
                screen_depth: screen.colorDepth || 24,
                screen_pixel_ratio: window.devicePixelRatio || 1,

                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 4: TIMEZONE & LOCALE (3 campos)
                // ─────────────────────────────────────────────────────────────────
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                timezone_offset: new Date().getTimezoneOffset(),
                locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',

                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 5: CANVAS FINGERPRINT (2 campos)
                // ─────────────────────────────────────────────────────────────────
                canvas_hash: await this._getCanvasFingerprint(),
                canvas_supported: this._isCanvasSupported(),

                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 6: AUDIO FINGERPRINT (2 campos)
                // ─────────────────────────────────────────────────────────────────
                audio_hash: await this._getAudioFingerprint(),
                audio_context: this._getAudioContextInfo(),

                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 7: WEBGL INFO (4 campos)
                // ─────────────────────────────────────────────────────────────────
                webgl_vendor: this._getWebGLVendor(),
                webgl_renderer: this._getWebGLRenderer(),
                webgl_version: this._getWebGLVersion(),
                webgl_extensions: this._getWebGLExtensionsCount(),

                // ─────────────────────────────────────────────────────────────────
                // SECCIÓN 8: TIMING & SESSION (3 campos)
                // ─────────────────────────────────────────────────────────────────
                session_id: this._generateSessionId(),
                collection_timestamp: Date.now(),
                fingerprint_version: VERSION
            };

            // Generar hash único del fingerprint completo
            fingerprint.unique_hash = await this._generateUniqueHash(fingerprint);

            // Cache
            this._cache = fingerprint;
            this._cacheExpiry = Date.now() + this._cacheDurationMs;

            return fingerprint;
        }

        /**
         * Detecta tipo de dispositivo
         */
        _detectDeviceType() {
            const ua = navigator.userAgent.toLowerCase();
            if (/tablet|ipad|playbook|silk/.test(ua)) return 'tablet';
            if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
            if (/smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast.tv/.test(ua)) return 'tv';
            return 'desktop';
        }

        /**
         * Genera fingerprint de Canvas
         */
        async _getCanvasFingerprint() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 50;
                const ctx = canvas.getContext('2d');

                // Texto con diferentes estilos
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillStyle = '#f60';
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = '#069';
                ctx.fillText('APE Fingerprint 🔐', 2, 15);
                ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
                ctx.fillText('IPTV Navigator PRO', 4, 30);

                // Generar hash del data URL
                const dataUrl = canvas.toDataURL();
                return await this._hashString(dataUrl);
            } catch (e) {
                return 'canvas_not_available';
            }
        }

        /**
         * Verifica soporte de Canvas
         */
        _isCanvasSupported() {
            try {
                const canvas = document.createElement('canvas');
                return !!(canvas.getContext && canvas.getContext('2d'));
            } catch (e) {
                return false;
            }
        }

        /**
         * Genera fingerprint de Audio
         */
        async _getAudioFingerprint() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return 'audio_not_available';

                const context = new AudioContext();
                const oscillator = context.createOscillator();
                const analyser = context.createAnalyser();
                const gain = context.createGain();
                const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

                gain.gain.value = 0; // Silenciar
                oscillator.type = 'triangle';
                oscillator.frequency.value = 10000;

                oscillator.connect(analyser);
                analyser.connect(scriptProcessor);
                scriptProcessor.connect(gain);
                gain.connect(context.destination);

                oscillator.start(0);

                // Esperar un poco y capturar
                await new Promise(resolve => setTimeout(resolve, 100));

                const frequencyData = new Float32Array(analyser.frequencyBinCount);
                analyser.getFloatFrequencyData(frequencyData);

                oscillator.stop();
                context.close();

                // Hash de los primeros valores
                const sample = Array.from(frequencyData.slice(0, 30)).join(',');
                return await this._hashString(sample);
            } catch (e) {
                return 'audio_error';
            }
        }

        /**
         * Info del AudioContext
         */
        _getAudioContextInfo() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return 'not_available';
                const ctx = new AudioContext();
                const info = `${ctx.sampleRate}_${ctx.destination.maxChannelCount}`;
                ctx.close();
                return info;
            } catch (e) {
                return 'error';
            }
        }

        /**
         * Vendor de WebGL
         */
        _getWebGLVendor() {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 'not_available';
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                return debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
            } catch (e) {
                return 'error';
            }
        }

        /**
         * Renderer de WebGL
         */
        _getWebGLRenderer() {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 'not_available';
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
            } catch (e) {
                return 'error';
            }
        }

        /**
         * Versión de WebGL
         */
        _getWebGLVersion() {
            try {
                const canvas = document.createElement('canvas');
                if (canvas.getContext('webgl2')) return 'webgl2';
                if (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) return 'webgl1';
                return 'none';
            } catch (e) {
                return 'error';
            }
        }

        /**
         * Número de extensiones WebGL
         */
        _getWebGLExtensionsCount() {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 0;
                return gl.getSupportedExtensions()?.length || 0;
            } catch (e) {
                return 0;
            }
        }

        /**
         * Genera Session ID único
         */
        _generateSessionId() {
            const array = new Uint8Array(16);
            crypto.getRandomValues(array);
            return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
        }

        /**
         * Hash de string usando SHA-256
         */
        async _hashString(str) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(str);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
            } catch (e) {
                // Fallback sin crypto.subtle
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                return Math.abs(hash).toString(16).padStart(16, '0');
            }
        }

        /**
         * Genera hash único del fingerprint completo
         */
        async _generateUniqueHash(fp) {
            const components = [
                fp.device_platform,
                fp.device_cores,
                fp.device_memory,
                fp.screen_width,
                fp.screen_height,
                fp.screen_depth,
                fp.timezone,
                fp.canvas_hash,
                fp.audio_hash,
                fp.webgl_vendor,
                fp.webgl_renderer
            ].join('|');

            return await this._hashString(components);
        }

        /**
         * Obtiene fingerprint resumido para JWT (10 campos clave)
         */
        async getForJWT() {
            const full = await this.collect();
            return {
                fp_hash: full.unique_hash,
                fp_device: full.device_type,
                fp_platform: full.device_platform,
                fp_screen: `${full.screen_width}x${full.screen_height}`,
                fp_tz: full.timezone,
                fp_lang: full.browser_language,
                fp_canvas: full.canvas_hash,
                fp_audio: full.audio_hash,
                fp_webgl: full.webgl_renderer?.substring(0, 50) || 'unknown',
                fp_session: full.session_id
            };
        }

        /**
         * Genera fingerprint para User-Agent dinámico
         */
        async getUserAgentComponents() {
            const fp = await this.collect();
            return {
                platform: fp.device_platform,
                type: fp.device_type,
                screen: `${fp.screen_width}x${fp.screen_height}`,
                cores: fp.device_cores,
                memory: fp.device_memory,
                language: fp.browser_language,
                timezone: fp.timezone
            };
        }
    }

    // Crear instancia global
    window.DeviceFingerprintCollector = new DeviceFingerprintCollector();

    console.log('✅ DeviceFingerprintCollector disponible en window.DeviceFingerprintCollector');

})();
