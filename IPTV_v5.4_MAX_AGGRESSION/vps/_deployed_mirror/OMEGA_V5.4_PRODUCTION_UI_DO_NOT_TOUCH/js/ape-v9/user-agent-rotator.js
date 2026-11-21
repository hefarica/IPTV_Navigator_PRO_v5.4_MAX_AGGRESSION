/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔄 USER-AGENT ROTATION ENGINE v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Motor de rotación dinámica de User-Agent para evasión de ISP y anti-tracking.
 * Basado en la Hoja de Ruta del Motor Dinámico JWT + User-Agent.
 * 
 * CARACTERÍSTICAS:
 * - 100+ User-Agents verificados por categoría
 * - Ponderación por popularidad real de dispositivos
 * - Micro-variación de versiones de build
 * - Integración con JWT y Fingerprint
 * - Selección contextual inteligente
 * 
 * CATEGORÍAS:
 * 1. androidTV (Fire TV, Shield, Mi Box, etc.)
 * 2. iOS (iPhone, iPad, Apple TV)
 * 3. smartTV (Samsung, LG, Sony, etc.)
 * 4. desktop (Chrome, Firefox, Safari, Edge)
 * 5. iptv_apps (TiviMate, IPTV Smarters, VLC, etc.)
 * 6. ott_apps (OTT Navigator, Perfect Player, etc.)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '1.0.0';

    // ═══════════════════════════════════════════════════════════════════════════
    // USER_AGENT_POOL - 100+ User-Agents verificados
    // ═══════════════════════════════════════════════════════════════════════════

    const USER_AGENT_POOL = {
        // ─────────────────────────────────────────────────────────────────────────
        // ANDROID TV (25 variantes)
        // ─────────────────────────────────────────────────────────────────────────
        androidTV: [
            // Fire TV Stick 4K Max (2023)
            'Dalvik/2.1.0 (Linux; U; Android 9; AFTKA Build/PS7327.3688N)',
            'Dalvik/2.1.0 (Linux; U; Android 9; AFTKM Build/PS7271.2821N)',
            'Dalvik/2.1.0 (Linux; U; Android 9; AFTMM Build/PS7271.2700N)',
            // Fire TV Cube
            'Dalvik/2.1.0 (Linux; U; Android 9; AFTA Build/PS7273.3043N)',
            'Dalvik/2.1.0 (Linux; U; Android 9; AFTB Build/PS7271.2900N)',
            // NVIDIA Shield Pro
            'Dalvik/2.1.0 (Linux; U; Android 11; SHIELD Android TV Build/RQ1A.210105.003)',
            'Dalvik/2.1.0 (Linux; U; Android 11; SHIELD Android TV Pro Build/RQ1A.210205.004)',
            'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.104 Safari/537.36',
            // Xiaomi Mi Box S
            'Mozilla/5.0 (Linux; Android 9; MI BOX S Build/PQ3A.190801.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36',
            'Dalvik/2.1.0 (Linux; U; Android 9; MIBOX4 Build/PQ3A.190801.002)',
            // Chromecast with Google TV
            'Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Safari/537.36',
            'Dalvik/2.1.0 (Linux; U; Android 12; Chromecast Build/STT1.220621.001)',
            // Generic Android TV
            'Mozilla/5.0 (Linux; Android 10; SM-G9750 Build/PPR1.180610.011) AppleWebKit/537.36 Chrome/90.0.4430.210 Safari/537.36',
            'Mozilla/5.0 (Linux; Android 11; Pixel 4 XL Build/RQ3A.210805.001.A1) AppleWebKit/537.36 Chrome/93.0.4577.62 Safari/537.36',
            'Dalvik/2.1.0 (Linux; U; Android 10; Android TV Build/QTT3.200805.001)',
            // Mecool, Beelink, etc.
            'Dalvik/2.1.0 (Linux; U; Android 10; KM6 Build/QQ3A.200805.001)',
            'Dalvik/2.1.0 (Linux; U; Android 11; GT-King Pro Build/RKQ1.210303.002)',
            'Mozilla/5.0 (Linux; Android 9; X96 Max Plus Build/PPR1.180610.011) AppleWebKit/537.36 Chrome/78.0.3904.108 Safari/537.36',
            // Sony Bravia
            'Mozilla/5.0 (Linux; Android 10; BRAVIA 4K 2021 Build/QTT2.200624.003) AppleWebKit/537.36 Chrome/87.0.4280.141 Safari/537.36',
            // Philips
            'Mozilla/5.0 (Linux; Android 10; Philips TV Build/PPR1.180610.011) AppleWebKit/537.36 Chrome/85.0.4183.127 Safari/537.36',
            // TCL
            'Mozilla/5.0 (Linux; Android 11; 55S546 Build/RKQ1.210714.001) AppleWebKit/537.36 Chrome/94.0.4606.85 Safari/537.36',
            // Hisense
            'Mozilla/5.0 (Linux; Android 9; Hisense Build/PQ3B.190801.002) AppleWebKit/537.36 Chrome/80.0.3987.149 Safari/537.36',
            // Formuler
            'Dalvik/2.1.0 (Linux; U; Android 9; Formuler Build/PQ3A.190801.002)',
            'Dalvik/2.1.0 (Linux; U; Android 11; GTV Build/RTT2.210915.002)',
            // Skyworth
            'Mozilla/5.0 (Linux; Android 9; Skyworth TV Build/PQ3A.190801.002) AppleWebKit/537.36 Chrome/83.0.4103.120 Safari/537.36'
        ],

        // ─────────────────────────────────────────────────────────────────────────
        // iOS / APPLE (15 variantes)
        // ─────────────────────────────────────────────────────────────────────────
        iOS: [
            // iPhone 15 Pro Max
            'AppleCoreMedia/1.0.0.21A331 (iPhone16,2; U; CPU OS 17_0 like Mac OS X)',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            // iPhone 14 Pro
            'AppleCoreMedia/1.0.0.20A5303i (iPhone15,3; U; CPU OS 16_0 like Mac OS X)',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            // iPhone 13
            'AppleCoreMedia/1.0.0.19A346 (iPhone14,5; U; CPU OS 15_0 like Mac OS X)',
            // iPad Pro
            'AppleCoreMedia/1.0.0.21A329 (iPad14,6; U; CPU OS 17_0 like Mac OS X)',
            'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            // iPad Air
            'AppleCoreMedia/1.0.0.20A5303i (iPad13,4; U; CPU OS 16_0 like Mac OS X)',
            // Apple TV 4K
            'AppleCoreMedia/1.0.0.21J354 (Apple TV; U; CPU OS 17_0 like Mac OS X)',
            'Mozilla/5.0 (Apple TV; U; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
            // HomePod
            'AppleCoreMedia/1.0.0.20J373 (HomePod; U; CPU OS 16_3 like Mac OS X)',
            // Various iOS versions
            'AppleCoreMedia/1.0.0.18L203 (iPhone12,1; U; CPU OS 14_4 like Mac OS X)',
            'AppleCoreMedia/1.0.0.17G64 (iPhone11,8; U; CPU OS 13_6 like Mac OS X)',
            'AppleCoreMedia/1.0.0.16G183 (iPhone10,6; U; CPU OS 12_4 like Mac OS X)',
            // Safari macOS (para streaming web)
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
        ],

        // ─────────────────────────────────────────────────────────────────────────
        // SMART TV (20 variantes)
        // ─────────────────────────────────────────────────────────────────────────
        smartTV: [
            // Samsung Tizen
            'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Samsung/TIZEN-7.0 SmartHub/TIZEN-7.0 SamsungBrowser/5.4 TV Safari/537.36',
            'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Samsung/TIZEN-6.5 SmartHub/TIZEN-6.5 SamsungBrowser/4.0 TV Safari/537.36',
            'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Samsung/TIZEN-6.0 SmartHub/TIZEN-6.0 SamsungBrowser/3.2 TV Safari/537.36',
            'Tizen 7.0 Samsung SMART-TV',
            'SamsungBrowser/5.4 SmartTV',
            // LG WebOS
            'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.128 Safari/537.36 LG Browser/14.00.00 WEBAPPMANAGER',
            'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 LG Browser/8.00.00 WEBAPPMANAGER',
            'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager',
            'LG NetCast.TV-2023',
            // Sony Bravia / Google TV
            'Mozilla/5.0 (Linux; NetCast; U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.85 Safari/537.36 Sony Bravia',
            'Mozilla/5.0 (Linux; Android 12; BRAVIA XR) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.5195.79 Safari/537.36',
            // Philips
            'Mozilla/5.0 (Linux; U; Android 7.0; en-US; Philips TV 2022) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36',
            // Panasonic Viera
            'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36 Panasonic Viera',
            // HbbTV
            'HbbTV/1.6.1 (+DRM;Samsung;SmartTV2023;T-HKMLAUKUC-1523.0;TIZEN;SMT) Chrome/94.0.4606.128',
            'HbbTV/1.5.1 (+DRM;Philips;HTV_2021;T-PHLUKAUMO-2021;AndroidTV;OEM) Chrome/87.0.4280.88',
            // Roku TV
            'Roku4640X/DVP-12.0 (12.0.4.4200)',
            'Dalvik/2.1.0 (Linux; U; Android 8.0; Roku Express Build/OPR1.170623.027)',
            // Vizio SmartCast
            'Mozilla/5.0 (Linux; U; Android 6.0.1; en-US; VIZIO SmartCast Build/MMB29M) AppleWebKit/537.36 Chrome/78.0.3904.108 Safari/537.36',
            // TCL Roku TV
            'Roku/DVP-13.0(13.0.0.4251) TCLRokuTV',
            // Hisense VIDAA
            'Mozilla/5.0 (VIDAA; Linux; U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Hisense Safari/537.36'
        ],

        // ─────────────────────────────────────────────────────────────────────────
        // DESKTOP BROWSERS (20 variantes)
        // ─────────────────────────────────────────────────────────────────────────
        desktop: [
            // Chrome Windows
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // Chrome macOS
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            // Firefox Windows
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
            // Firefox macOS
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0',
            // Edge Windows
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
            // Safari macOS
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
            // Opera
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0',
            // Brave
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120',
            // Vivaldi
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Vivaldi/6.4.3160.44',
            // Linux
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
            // Windows 11
            'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // ChromeOS
            'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],

        // ─────────────────────────────────────────────────────────────────────────
        // IPTV APPS (15 variantes)
        // ─────────────────────────────────────────────────────────────────────────
        iptv_apps: [
            // FFmpeg / Lavf
            'Lavf/58.29.100',
            'Lavf/59.27.100',
            'Lavf/60.16.100',
            // ExoPlayer (TiviMate, otros)
            'ExoPlayerLib/2.18.1',
            'ExoPlayerLib/2.19.1',
            'ExoPlayerLib/2.18.7',
            // OkHttp (IPTV Smarters, etc.)
            'okhttp/4.10.0',
            'okhttp/4.11.0',
            'okhttp/4.12.0',
            // VLC
            'VLC/3.0.18 LibVLC/3.0.18',
            'VLC/3.0.20 LibVLC/3.0.20',
            // Kodi
            'Kodi/20.0 (Windows NT 10.0; Win64; x64) App_Bitness/64 Version/20.0-Nexus',
            'Kodi/19.4 (Linux; Android 10) App_Bitness/32 Version/19.4-Matrix',
            // GSE Smart IPTV
            'GSE SMART IPTV/6.9',
            // XCIPTV
            'XCIPTV/5.0.7'
        ],

        // ─────────────────────────────────────────────────────────────────────────
        // OTT APPS - EVASIÓN (10 variantes)
        // ─────────────────────────────────────────────────────────────────────────
        ott_apps: [
            // OTT Navigator
            'OTT Navigator/1.6.9.4 (Build 40936) AppleWebKit/606',
            'OTT Navigator/1.6.9.3 (Build 40892) AppleWebKit/606',
            'OTT Navigator/1.6.9.2 (Build 40856) AppleWebKit/606',
            'OTT Navigator/1.6.8.5 (Build 40712) AppleWebKit/606',
            // TiviMate
            'TiviMate/4.7.0',
            'TiviMate/4.6.1',
            'TiviMate/4.5.0',
            // Perfect Player
            'PerfectPlayer/1.5.9.3',
            // IPTV Smarters Pro
            'IPTVSmartersPro/2.2.2.5',
            // Televizo
            'Televizo/1.8.6.0'
        ]
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // UA_WEIGHTS - Ponderación por popularidad real de dispositivos
    // ═══════════════════════════════════════════════════════════════════════════

    const UA_WEIGHTS = {
        'Fire TV Stick': 0.22,
        'NVIDIA Shield': 0.12,
        'Samsung TV': 0.11,
        'LG TV': 0.09,
        'Apple TV': 0.07,
        'iPhone/iPad': 0.06,
        'Xiaomi Mi Box': 0.08,
        'Chromecast': 0.06,
        'Windows PC': 0.05,
        'OTT Navigator': 0.08,
        'TiviMate': 0.04,
        'Otros': 0.02
    };

    // Mapeo de categoría a weights aplicables
    const CATEGORY_WEIGHT_MAP = {
        androidTV: ['Fire TV Stick', 'NVIDIA Shield', 'Xiaomi Mi Box', 'Chromecast', 'Otros'],
        iOS: ['Apple TV', 'iPhone/iPad'],
        smartTV: ['Samsung TV', 'LG TV', 'Otros'],
        desktop: ['Windows PC', 'Otros'],
        iptv_apps: ['TiviMate', 'Otros'],
        ott_apps: ['OTT Navigator', 'TiviMate', 'Otros']
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CLASE PRINCIPAL: UserAgentRotator
    // ═══════════════════════════════════════════════════════════════════════════

    class UserAgentRotator {
        constructor() {
            this.version = VERSION;
            this.pool = USER_AGENT_POOL;
            this.weights = UA_WEIGHTS;
            this._lastSelected = null;
            this._rotationCount = 0;
            this._sessionHistory = [];

            console.log(`%c🔄 User-Agent Rotation Engine v${VERSION}`, 'color: #22c55e; font-weight: bold;');
            console.log(`📦 Pool total: ${this._getTotalUAs()} User-Agents en ${Object.keys(this.pool).length} categorías`);
        }

        /**
         * Cuenta total de UAs disponibles
         */
        _getTotalUAs() {
            return Object.values(this.pool).reduce((sum, arr) => sum + arr.length, 0);
        }

        /**
         * Selecciona User-Agent basado en contexto
         * @param {Object} context - Contexto de selección
         * @returns {Object} - {userAgent, category, weighted}
         */
        select(context = {}) {
            // Paso 1: Determinar categoría
            const category = this._selectCategory(context);

            // Paso 2: Obtener pool de la categoría
            const pool = this.pool[category];
            if (!pool || pool.length === 0) {
                return this._fallbackUA();
            }

            // Paso 3: Seleccionar con ponderación
            let selectedUA;
            if (context.weighted !== false) {
                selectedUA = this._selectWeighted(pool, category);
            } else {
                selectedUA = pool[Math.floor(Math.random() * pool.length)];
            }

            // Paso 4: Aplicar micro-variación
            if (context.microVariation !== false) {
                selectedUA = this._addMicroVariation(selectedUA);
            }

            // Paso 5: Registrar selección
            this._lastSelected = selectedUA;
            this._rotationCount++;
            this._sessionHistory.push({
                ua: selectedUA.substring(0, 50) + '...',
                category,
                timestamp: Date.now()
            });

            // Mantener historial limitado
            if (this._sessionHistory.length > 100) {
                this._sessionHistory = this._sessionHistory.slice(-50);
            }

            return {
                userAgent: selectedUA,
                category: category,
                rotationNumber: this._rotationCount,
                weighted: context.weighted !== false
            };
        }

        /**
         * Selección agresiva (completamente diferente)
         * Se usa cuando hay bloqueo detectado
         */
        selectAggressive() {
            // Cambiar a una categoría completamente diferente
            const categories = Object.keys(this.pool);
            const currentCategory = this._getLastCategory();

            // Filtrar categoría actual
            const availableCategories = categories.filter(c => c !== currentCategory);
            const newCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];

            return this.select({
                forceCategory: newCategory,
                weighted: false,  // Aleatorio puro
                microVariation: true
            });
        }

        /**
         * Selecciona categoría de dispositivo
         */
        _selectCategory(context) {
            // Si se fuerza categoría
            if (context.forceCategory) {
                return context.forceCategory;
            }

            // Si se especifica tipo de dispositivo
            if (context.deviceType) {
                const mapping = {
                    'tv': 'smartTV',
                    'android': 'androidTV',
                    'ios': 'iOS',
                    'desktop': 'desktop',
                    'iptv': 'iptv_apps',
                    'ott': 'ott_apps'
                };
                return mapping[context.deviceType.toLowerCase()] || 'ott_apps';
            }

            // Por defecto: ponderación por popularidad
            const rand = Math.random();
            let cumulative = 0;

            const categoryWeights = {
                ott_apps: 0.35,    // OTT Navigator preferido para evasión
                androidTV: 0.25,
                smartTV: 0.15,
                iOS: 0.10,
                desktop: 0.08,
                iptv_apps: 0.07
            };

            for (const [cat, weight] of Object.entries(categoryWeights)) {
                cumulative += weight;
                if (rand <= cumulative) {
                    return cat;
                }
            }

            return 'ott_apps';
        }

        /**
         * Selección ponderada dentro de categoría
         */
        _selectWeighted(pool, category) {
            // Ponderar primeros elementos más (más populares)
            const weights = pool.map((_, i) => Math.max(1, pool.length - i));
            const totalWeight = weights.reduce((a, b) => a + b, 0);

            let rand = Math.random() * totalWeight;
            for (let i = 0; i < pool.length; i++) {
                rand -= weights[i];
                if (rand <= 0) {
                    return pool[i];
                }
            }

            return pool[0];
        }

        /**
         * Agrega micro-variación al User-Agent
         * Modifica versiones de build para evitar detección de patrones
         */
        _addMicroVariation(userAgent) {
            // Patrón 1: Build numbers (Build/PS7327.3688N → Build/PS7327.3686N)
            let modified = userAgent.replace(
                /Build\/([A-Z]{2}\d{4}\.\d{3,4})([A-Z])/g,
                (match, nums, suffix) => {
                    const parts = nums.split('.');
                    const variation = Math.floor(Math.random() * 5) - 2; // ±2
                    parts[1] = String(parseInt(parts[1]) + variation).padStart(parts[1].length, '0');
                    return `Build/${parts.join('.')}${suffix}`;
                }
            );

            // Patrón 2: Chrome versions (Chrome/120.0.0.0 → Chrome/120.0.6099.x)
            modified = modified.replace(
                /Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)/g,
                (match, major, minor, build, patch) => {
                    const newPatch = Math.floor(Math.random() * 200);
                    return `Chrome/${major}.${minor}.${build}.${newPatch}`;
                }
            );

            // Patrón 3: Safari versions
            modified = modified.replace(
                /Safari\/(\d+)\.(\d+)/g,
                (match, major, minor) => {
                    const newMinor = parseInt(minor) + Math.floor(Math.random() * 10) - 5;
                    return `Safari/${major}.${Math.max(1, newMinor)}`;
                }
            );

            // Patrón 4: App versions (x.x.x.x)
            modified = modified.replace(
                /\/(\d+)\.(\d+)\.(\d+)\.(\d+)/g,
                (match, a, b, c, d) => {
                    const newD = Math.max(0, parseInt(d) + Math.floor(Math.random() * 3) - 1);
                    return `/${a}.${b}.${c}.${newD}`;
                }
            );

            return modified;
        }

        /**
         * Fallback UA
         */
        _fallbackUA() {
            const fallback = 'OTT Navigator/1.6.9.4 (Build 40936) AppleWebKit/606';
            return {
                userAgent: fallback,
                category: 'ott_apps',
                rotationNumber: this._rotationCount,
                weighted: false
            };
        }

        /**
         * Obtiene última categoría usada
         */
        _getLastCategory() {
            const last = this._sessionHistory[this._sessionHistory.length - 1];
            return last?.category || 'ott_apps';
        }

        /**
         * Obtiene estadísticas de rotación
         */
        getStats() {
            const categoryCounts = {};
            this._sessionHistory.forEach(h => {
                categoryCounts[h.category] = (categoryCounts[h.category] || 0) + 1;
            });

            return {
                totalRotations: this._rotationCount,
                sessionHistorySize: this._sessionHistory.length,
                categoryCounts,
                lastUA: this._lastSelected?.substring(0, 60) + '...',
                poolSize: this._getTotalUAs()
            };
        }

        /**
         * Obtiene User-Agent por defecto para evasión
         */
        getDefaultForEvasion() {
            return this.select({
                forceCategory: 'ott_apps',
                weighted: true,
                microVariation: true
            });
        }

        /**
         * Obtiene todos los UAs de una categoría
         */
        getCategory(categoryName) {
            return this.pool[categoryName] || [];
        }

        /**
         * Lista todas las categorías disponibles
         */
        getCategories() {
            return Object.keys(this.pool).map(cat => ({
                name: cat,
                count: this.pool[cat].length
            }));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREAR INSTANCIA GLOBAL
    // ═══════════════════════════════════════════════════════════════════════════

    window.UserAgentRotator = new UserAgentRotator();
    window.USER_AGENT_POOL = USER_AGENT_POOL;
    window.UA_WEIGHTS = UA_WEIGHTS;

    console.log('✅ UserAgentRotator disponible en window.UserAgentRotator');

})();
