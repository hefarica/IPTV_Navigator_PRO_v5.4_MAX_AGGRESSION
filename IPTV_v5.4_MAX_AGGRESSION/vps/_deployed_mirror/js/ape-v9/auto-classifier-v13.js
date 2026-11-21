/**
 * ═══════════════════════════════════════════════════════════════
 * 🎯 AUTO-CLASSIFIER v13.1 PRO - CHANNEL PROFILE CLASSIFICATION
 * ═══════════════════════════════════════════════════════════════
 * 
 * Sistema inteligente de clasificación automática de canales IPTV
 * basado en características técnicas (resolución, FPS, codec, bitrate).
 * 
 * FEATURES:
 * - Análisis multi-dimensional (4 factores)
 * - Scoring de calidad 0-100
 * - Soporte para 5 codecs
 * - Sugerencias de perfil óptimo (P0-P5)
 * - Estadísticas de distribución
 * - Export de resultados
 * 
 * @version 13.1.0
 * @date 2026-01-05
 * ═══════════════════════════════════════════════════════════════
 */

class ChannelAutoClassifier {
    constructor(bppMatrix, strategyConfig) {
        this.bppMatrix = bppMatrix || window.ProfileManagerV9?.BITS_PER_PIXEL || {};
        this.strategyConfig = strategyConfig || window.ProfileManagerV9?.STRATEGY_CONFIG || {};

        // Matriz de resoluciones (pixels) - Estandarizada a MAYÚSCULAS
        this.resolutionMap = {
            '8K': 33177600,    // 7680x4320
            '4K': 8294400,     // 3840x2160
            'UHD_4K': 8294400,
            'FHD': 2073600,    // 1920x1080
            '1080P': 2073600,
            'HD': 921600,      // 1280x720
            '720P': 921600,
            'SD': 409920,      // 854x480
            '480P': 409920
        };

        this.codecAliases = {
            'HEVC': 'H265',
            'AVC': 'H264',
            'x264': 'H264',
            'x265': 'H265'
        };

        // Reglas Atómicas v13.5
        this.atomicConfig = {
            resolutionWeight: 0.75, // SSOT: Prioridad máxima a la resolución (75%)
            metadataBonus: 15,      // Bono por HEVC/HDR/4K en el nombre
            upwardBias: 5,          // Sesgo hacia arriba para evitar downgrades
            version: '13.5.0-ATOMIC'
        };

        console.log('🎯 Auto-Classifier v13.5 ATOMIC inicializado');
    }

    /**
     * Clasifica un canal individual
     * @param {Object} channel - Canal con {resolution, fps, codec, bitrate}
     * @returns {Object} Resultado con {suggestedProfile, qualityScore, estimatedBitrate, reason}
     */
    classifyChannel(channel) {
        const { fps, codec, bitrate } = channel || {};

        // 1. Detectar pixeles con procedencia (width/height, resolution, name, group)
        const det = this._detectPixels(channel);
        const pixels = det.pixels;

        // 2. Normalizar codec. `codecKnown` evita el bono fantasma: antes
        //    _normalizeCodec(undefined) devolvia 'H264' y regalaba +10 a los
        //    perfiles AVC1, que es lo que hacia ganar a P4 en todos los canales.
        const codecRaw = (codec === undefined || codec === null) ? '' : String(codec).trim();
        const codecKnown = codecRaw.length > 0;
        const normalizedCodec = this._normalizeCodec(codecRaw || undefined);
        // fps desconocido NO es 30: si no viene declarado no se penaliza a
        // ningun perfil por fps (Ley Anti-Degradacion: no degradar por ausencia
        // de dato). Antes 4K sin fps caia a P2 solo por el default 30.
        const fpsRaw = parseInt(fps);
        const fpsKnown = !isNaN(fpsRaw) && fpsRaw > 0;
        const parsedFps = fpsKnown ? fpsRaw : 30;
        const parsedBitrate = parseInt(bitrate) || 0;

        if (!pixels) {
            return {
                suggestedProfile: 'P5', qualityScore: 0,
                reason: 'Resolución no reconocida',
                estimatedBitrate: 0, pixels: 0, detectSource: det.source,
                error: true
            };
        }

        const bpp = this._getBPP(normalizedCodec, pixels);
        const estimatedBitrate = (pixels * parsedFps * bpp) / 1000000;

        let qualityScore = 0;
        if (parsedBitrate > 0 && estimatedBitrate > 0) {
            qualityScore = Math.min(100, (parsedBitrate / estimatedBitrate) * 100);
        }

        const directiveBonus = this._calculateDirectiveBonus(channel);
        qualityScore += directiveBonus;

        const suggestedProfile = this._determineProfile(
            pixels, parsedFps, normalizedCodec, qualityScore, codecKnown, directiveBonus > 0, fpsKnown
        );

        return {
            suggestedProfile,
            qualityScore: Math.round(Math.min(100, qualityScore)),
            estimatedBitrate: Math.round(estimatedBitrate * 10) / 10,
            actualBitrate: parsedBitrate,
            pixels: pixels,
            detectSource: det.source,
            directiveBonusApplied: directiveBonus > 0,
            reason: this._generateReason(suggestedProfile, this._resLabel(pixels), parsedFps, normalizedCodec, qualityScore, directiveBonus > 0)
        };
    }

    /**
     * Clasifica un lote de canales
     * @param {Array} channels - Array de objetos canal
     * @returns {Object} Resultados con estadísticas y clasificaciones
     */
    classifyBatch(channels) {
        const results = [];
        const stats = {
            total: channels.length,
            P0: 0,
            P1: 0,
            P2: 0,
            P3: 0,
            P4: 0,
            P5: 0,
            avgQualityScore: 0,
            errors: 0,
            // de donde salio la resolucion de cada canal (medible, no afirmado)
            sources: {},
            profileSource: null
        };

        let totalQuality = 0;

        channels.forEach((channel, index) => {
            const result = this.classifyChannel(channel);

            results.push({
                index,
                channelName: channel.name || `Channel ${index + 1}`,
                ...result,
                originalData: channel
            });

            // Actualizar estadísticas (Si hay error se suma a errores pero se mantiene el conteo de P5 si aplica)
            if (result.error) {
                stats.errors++;
            }

            if (stats[result.suggestedProfile] !== undefined) {
                stats[result.suggestedProfile]++;
            }
            totalQuality += result.qualityScore;
            const src = result.detectSource || 'desconocida';
            stats.sources[src] = (stats.sources[src] || 0) + 1;
        });
        stats.profileSource = this._universeSource || 'ninguna';

        const den = channels.length - stats.errors;
        stats.avgQualityScore = den > 0 ? Math.round(totalQuality / den) : 0;

        return {
            results,
            stats,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Determina el perfil óptimo basado en la configuración real de los perfiles.
     * v13.5: Motor de Matching Atómico (Resolution-Driven)
     */
    _determineProfile(pixels, fps, codec, qualityScore, codecKnown, hasBonus = false, fpsKnown = false) {
        const universe = this._getProfileUniverse();
        if (!universe) return 'P5';

        let bestMatch = 'P5';
        let highestScore = -1;
        const weights = this.atomicConfig || { resolutionWeight: 0.75 };

        for (const [id, profile] of Object.entries(universe)) {
            let score = 0;
            const profilePixels = profile._res || 0;

            // 1. Pixeles (75%)
            if (profilePixels > 0 && pixels > 0) {
                const diff = Math.abs(pixels - profilePixels);
                const maxDiff = Math.max(pixels, profilePixels);
                score += (1 - (diff / maxDiff)) * 100 * weights.resolutionWeight;
            }

            // 2. FPS (15%) SOLO si el canal declara fps. Con fps desconocido el
            //    componente es neutro y no hunde a los perfiles de 60.
            if (fpsKnown) {
                const profileFps = profile._fps || 30;
                score += (1 - (Math.abs(fps - profileFps) / Math.max(fps, profileFps, 1))) * 15;
            }

            // 3. Codec (10%) SOLO si el canal declara codec
            if (codecKnown && profile._codec === codec) score += 10;

            // 4. Sesgo ascendente por nivel. Los .5 quedan por debajo de su base
            //    para que NUNCA ganen por accidente: son sintesis opt-in.
            const num = parseFloat(String(id).replace('P', ''));
            if (!isNaN(num)) {
                score += profile._emulated ? (6 - num) * 0.5 - 1.0 : (6 - num) * 0.5;
            }

            if (hasBonus && !isNaN(num) && num <= 2) score += 5;

            if (score > highestScore) { highestScore = score; bestMatch = id; }
        }
        return bestMatch;
    }

    /* Etiqueta legible de una cantidad de pixeles */
    _resLabel(pixels) {
        if (!pixels) return 'desconocida';
        if (pixels >= 33177600) return '8K';
        if (pixels >= 8294400) return '4K';
        if (pixels >= 2073600) return 'FHD';
        if (pixels >= 921600) return 'HD';
        return 'SD';
    }

    /**
     * Calcula bonos de calidad basados en palabras clave (HEVC, 4K, HDR)
     */
    _calculateDirectiveBonus(channel) {
        let bonus = 0;
        const name = ((channel.name || '') + ' ' + (channel.category_name || '') + ' ' + (channel.group || '')).toUpperCase();

        if (name.includes('HEVC') || name.includes('H.265') || name.includes('X265')) bonus += 5;
        if (name.includes('4K') || name.includes('UHD') || name.includes('ULTRA')) bonus += 5;
        if (name.includes('HDR') || name.includes('10BIT')) bonus += 5;
        if (name.includes('BT.2020') || name.includes('DOLBY')) bonus += 3;

        return bonus;
    }

    /**
     * Fallback: Lógica estática antigua (solo si falla el config)
     */
    _determineProfileStatic(resolution, fps, codec, qualityScore, pixels) {
        if (resolution.includes('8K')) return 'P0';
        if ((resolution.includes('4K') || resolution.includes('UHD')) && fps >= 50 && qualityScore >= 85) return 'P1';
        if (resolution.includes('4K') || resolution.includes('UHD') || qualityScore >= 80) return 'P2';
        if (resolution.includes('FHD') || resolution.includes('1080') || qualityScore >= 60) return 'P3';
        if (resolution.includes('HD') || resolution.includes('720') || qualityScore >= 40) return 'P4';
        return 'P5';
    }

    /**
     * Obtiene BPP del codec y resolución
     */
    _getBPP(codec, pixels) {
        // Determinar label de resolución
        let resLabel;
        if (pixels >= 33000000) resLabel = '8K';
        else if (pixels >= 8000000) resLabel = 'UHD';
        else if (pixels >= 2000000) resLabel = 'FHD';
        else if (pixels >= 900000) resLabel = 'HD';
        else resLabel = 'SD';

        const bppKey = `${codec}_${resLabel}`;
        return this.bppMatrix[bppKey] || 0.15; // Fallback genérico
    }

    /**
     * Obtiene pixels de una resolución
     * v13.1.3: Manejo especial para "AUTO" - intenta detectar calidad real
     */

    /* ═══════════════════════════════════════════════════════════════════════
     * UNIVERSO DE PERFILES — fuente canonica
     *
     * BUG MEDIDO 2026-11-08 (Chromium, preview local 5500):
     * el clasificador matcheaba contra APE_PROFILES_CONFIG, cuyas resoluciones
     * estaban CRUZADAS:
     *     P1 "4K UHD"     -> declaraba 7680x4320  (8K)
     *     P2 "2K QHD"     -> declaraba 3840x2160  (4K)
     *     P3 "FHD 1080p"  -> declaraba 3840x2160  (4K)
     *     P4 "HD 720p"    -> declaraba 3840x2160  (4K)
     *     P5 "SD 480p"    -> declaraba 3840x2160  (4K)
     * Con P2..P5 empatados en 3840x2160 (75% del peso) y fps=120 en los seis,
     * el desempate lo daba el codec + el sesgo: P4 ganaba SIEMPRE.
     * Resultado real: P0=0 P1=0 P2=939 P3=5690 P4=14595 P5=0.
     *
     * El Gestor (APE_ALL_PROFILES_OPTIMIZED.json) y APE_LAB_V8_PROFILES SI
     * tienen la escalera correcta: 8K / 4K / 4K / 1080p / 720p / 480p.
     * Aqui se prefiere esa fuente y se derivan los 6 emulados (.5) para que el
     * universo sean los 12 canonicos del Gestor.
     * ═══════════════════════════════════════════════════════════════════════ */
    _getProfileUniverse() {
        if (this._universe && this._universeAt === (this._universeStamp || 0)) return this._universe;

        let raw = null, source = 'ninguna';
        // 1. canonico del Gestor, si el loader ya lo dejo en window
        if (window.__APE_CANONICAL_PROFILES) {
            raw = window.__APE_CANONICAL_PROFILES.profiles || window.__APE_CANONICAL_PROFILES;
            source = 'gestor-json';
        }
        // 2. LAB v8 (sincrono y con la escalera correcta)
        if (!raw && window.APE_LAB_V8_PROFILES) {
            raw = window.APE_LAB_V8_PROFILES;
            source = 'lab-v8';
        }
        // 3. config como ultimo recurso
        if (!raw && window.APE_PROFILES_CONFIG) {
            const c = window.APE_PROFILES_CONFIG;
            raw = (typeof c.getAllProfiles === 'function') ? c.getAllProfiles() : c.profiles;
            source = 'profiles-config';
        }
        if (!raw) return null;

        const out = {};
        Object.keys(raw).forEach((id) => {
            const p = raw[id] || {};
            out[id] = Object.assign({}, p, {
                _res: this._profileResolution(p),
                _fps: parseInt((p.settings || {}).fps) || parseInt(p.fps) || 30,
                _codec: this._normalizeCodec((p.settings || {}).codec || p.codec),
                _emulated: false
            });
        });
        // derivar la capa .5 (los 6 emulados) si el JSON no la trae
        ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].forEach((baseId) => {
            const pid = baseId + '.5';
            if (out[pid] || !out[baseId]) return;
            const b = out[baseId];
            out[pid] = Object.assign({}, b, {
                id: pid,
                name: String(b.name || baseId) + ' (6K EMULADO)',
                _emulated: true,
                _derived_from: baseId,
                // misma resolucion que su base: el .5 es sintesis, no un pixel real
                _res: b._res
            });
        });
        this._universe = out;
        this._universeSource = source;
        this._universeAt = this._universeStamp || 0;
        return out;
    }

    /* Resolucion pixeles de un perfil: settings.resolution manda, pero se
     * acepta resolution, quality_levels.L1 y el nombre por si el perfil viejo
     * viene cruzado. */
    _profileResolution(profile) {
        const st = profile.settings || {};
        let r = st.resolution || profile.resolution || null;
        if (!r && profile.quality_levels && profile.quality_levels.L1) {
            r = profile.quality_levels.L1.resolution || null;
        }
        let px = this._getPixels(r);
        if (!px) {
            // ultimo recurso: la resolucion mas alta de sus quality_levels
            const ql = profile.quality_levels || {};
            for (const k of ['L1', 'L2', 'L3', 'L4', 'L5']) {
                if (ql[k] && ql[k].resolution) { px = this._getPixels(ql[k].resolution); if (px) break; }
            }
        }
        return px || 0;
    }

    /* ═══════════════════════════════════════════════════════════════════════
     * DETECCION DE RESOLUCION DEL CANAL
     *
     * BUG MEDIDO: _getPixels solo miraba channel.width/height, channel.name y
     * tier. NO miraba channel.group (group-title) — que es donde practicamente
     * todas las listas IPTV declaran la calidad — ni channel.video.resolution
     * (la forma canonica del normalizador). Sin eso, ~todo caia al fallback
     * HD (1280x720) y el reparto se degeneraba.
     * Ahora se devuelve tambien POR QUE campo se detecto, para que el reporte
     * lo demuestre en vez de afirmarlo.
     * ═══════════════════════════════════════════════════════════════════════ */
    _detectPixels(channel) {
        if (!channel) return { pixels: 0, source: 'sin-canal' };

        // 1. width/height explicitos
        const w1 = parseInt(channel.width) || 0;
        const h1 = parseInt(channel.height) || 0;
        if (w1 && h1) return { pixels: w1 * h1, source: 'width/height' };

        const v = channel.video || {};
        const w2 = parseInt(v.width) || 0;
        const h2 = parseInt(v.height) || 0;
        if (w2 && h2) return { pixels: w2 * h2, source: 'video.width/height' };

        // 2. cadena de resolucion explicita
        const cands = [
            ['resolution', channel.resolution],
            ['video.resolution', v.resolution],
            ['resolution_real', channel.resolution_real || v.resolution_real],
            ['quality', channel.quality],
            ['tier', channel.qualityTier || channel.tier]
        ];
        for (const [label, val] of cands) {
            if (!val) continue;
            const str = String(val).toUpperCase().replace(/\s/g, '');
            if (str === 'AUTO' || str === 'UNKNOWN' || str === '-') continue;
            const px = this._getPixels(String(val));
            if (px) return { pixels: px, source: label };
        }

        // 3. palabras clave en nombre + grupo + categoria
        const blob = [
            channel.name, channel.tvgName, channel.tvg_name, channel.streamName,
            channel.group, channel.groupTitle, channel.group_title,
            channel.category_name, channel.category, channel.description
        ].filter(Boolean).join(' ').toUpperCase();

        const tiers = [
            ['8K',   /\b8K\b|UHD.?8K|4320P/],
            ['4K',   /\b4K\b|\bUHD\b|2160P|ULTRA.?HD/],
            ['FHD',  /\bFHD\b|\bFULL.?HD\b|1080[PI]?\b/],
            ['HD',   /\bHD\b|\b720P\b|\bHDTV\b/],
            ['SD',   /\bSD\b|\b480P\b|\b576P\b|\b360P\b|\b240P\b/]
        ];
        for (const [label, re] of tiers) {
            if (re.test(blob)) return { pixels: this.resolutionMap[label], source: 'name+group:' + label };
        }

        // 4. fallback honesto: se declara como tal
        return { pixels: this.resolutionMap['HD'], source: 'fallback-HD' };
    }

    _getPixels(resolution, channel = null) {
        if (!resolution) return 0;

        // ✅ v13.1.3: Manejo especial para "AUTO"
        const normalized = resolution.toUpperCase().replace(/\s/g, '');
        if (normalized === 'AUTO' || normalized === 'UNKNOWN' || normalized === '') {
            // Intentar detectar desde width/height del canal
            if (channel) {
                const width = parseInt(channel.width) || 0;
                const height = parseInt(channel.height) || 0;
                if (width && height) {
                    return width * height;
                }

                // Intentar detectar desde el nombre del canal
                const name = (channel.name || '').toUpperCase();
                if (name.includes('8K')) return this.resolutionMap['8K'];
                if (name.includes('4K') || name.includes('UHD')) return this.resolutionMap['4K'];
                if (name.includes('FHD') || name.includes('1080')) return this.resolutionMap['FHD'];
                if (name.includes('HD') || name.includes('720')) return this.resolutionMap['HD'];

                // Intentar detectar desde tier/qualityTier
                const tier = (channel.qualityTier || channel.tier || '').toUpperCase();
                if (tier.includes('8K')) return this.resolutionMap['8K'];
                if (tier.includes('4K') || tier.includes('UHD') || tier === 'ULTRA') return this.resolutionMap['4K'];
                if (tier.includes('FHD') || tier === 'PREMIUM') return this.resolutionMap['FHD'];
                if (tier.includes('HD') || tier === 'HIGH') return this.resolutionMap['HD'];
            }

            // Fallback: asumir HD como calidad media
            return this.resolutionMap['HD'];
        }

        // Buscar coincidencia exacta primero
        if (this.resolutionMap[normalized]) {
            return this.resolutionMap[normalized];
        }

        // Buscar por inclusión
        for (const [key, value] of Object.entries(this.resolutionMap)) {
            if (normalized.includes(key.replace('_', ''))) {
                return value;
            }
        }

        // Parsear formato "3840x2160"
        const match = resolution.match(/(\d+)x(\d+)/);
        if (match) {
            return parseInt(match[1]) * parseInt(match[2]);
        }

        return 0;
    }

    /**
     * Normaliza nombre de codec
     */
    _normalizeCodec(codec) {
        if (!codec) return 'H264'; // Fallback

        const upper = codec.toUpperCase();
        return this.codecAliases[upper] || upper;
    }

    /**
     * Genera razón human-readable para la clasificación
     */
    _generateReason(profile, resolution, fps, codec, score, hasBonus) {
        const bonusTag = hasBonus ? ' [ATOMIC BONUS]' : '';
        const reasons = {
            'P0': `Ultra Extreme (8K) - Resolución 8K/UHD8K${codec === 'AV1' ? ' + codec AV1' : ''}${bonusTag}`,
            'P1': `4K Supreme (60fps) - ${resolution} @ ${fps}fps con score ${score}%${bonusTag}`,
            'P2': `4K Extreme (30fps) - ${resolution} calidad premium${bonusTag}`,
            'P3': `FHD Advanced - ${resolution} calidad sólida (score ${score}%)${bonusTag}`,
            'P4': `HD Stable - ${resolution} calidad estándar${bonusTag}`,
            'P5': `SD Failsafe - Conexión lenta o baja resolución`
        };

        let msg = reasons[profile] || 'Clasificación automática';
        if (hasBonus) msg += ' (Alineado con Directivas Atómicas)';
        return msg;
    }

    /**
     * Exportar resultados como JSON
     */
    exportResults(batchResults) {
        const exportData = {
            generatedAt: new Date().toISOString(),
            classifier: 'APE Auto-Classifier v13.1 PRO',
            stats: batchResults.stats,
            channels: batchResults.results.map(r => ({
                name: r.channelName,
                profile: r.suggestedProfile,
                qualityScore: r.qualityScore,
                reason: r.reason,
                bitrate: {
                    estimated: r.estimatedBitrate,
                    actual: r.actualBitrate
                }
            }))
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Genera HTML badge para un perfil sugerido
     */
    generateBadge(suggestedProfile, qualityScore) {
        const colors = {
            'P0': '#dc2626',
            'P1': '#ea580c',
            'P2': '#ca8a04',
            'P3': '#16a34a',
            'P4': '#0891b2',
            'P5': '#6366f1'
        };

        const color = colors[suggestedProfile] || '#6b7280';
        const emoji = qualityScore >= 80 ? '⭐' : qualityScore >= 60 ? '✓' : '⚠️';

        return `
            <span class="ape-classifier-badge" style="
                background: ${color};
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                margin-left: 8px;
            ">
                ${emoji} ${suggestedProfile} (${qualityScore}%)
            </span>
        `;
    }
}

// Auto-instanciar en window
if (typeof window !== 'undefined') {
    window.ChannelAutoClassifier = ChannelAutoClassifier;
    window.autoClassifier = new ChannelAutoClassifier();

    /* ═══════════════════════════════════════════════════════════════════════
     * CARGA DEL UNIVERSO CANONICO DEL GESTOR
     *
     * El operador definio que los perfiles del Gestor de Perfiles APE v9.0 son
     * la fuente canonica de la auto-clasificacion. Se cargan aqui y se dejan en
     * window.__APE_CANONICAL_PROFILES; _getProfileUniverse() los prefiere sobre
     * APE_PROFILES_CONFIG (cuyas resoluciones estaban cruzadas) y sobre LAB v8.
     * Si la carga falla, el clasificador sigue con LAB v8 y lo declara.
     * ═══════════════════════════════════════════════════════════════════════ */
    (function loadCanonicalProfiles() {
        const rutas = [
            'js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json',
            './js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json',
            'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json'
        ];
        const probar = (i) => {
            if (i >= rutas.length) return;   // se queda con LAB v8
            if (typeof fetch !== 'function') return;
            fetch(rutas[i], { cache: 'no-store' })
                .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then((j) => {
                    const p = j.profiles || j;
                    if (!p || !Object.keys(p).length) throw new Error('vacio');
                    window.__APE_CANONICAL_PROFILES = p;
                    // invalidar el cache del universo para que se recalcule
                    const C = window.autoClassifier;
                    if (C) { C._universe = null; C._universeStamp = (C._universeStamp || 0) + 1; }
                    console.log('%c[CLASSIFY] universo canonico del Gestor cargado (' +
                        Object.keys(p).length + ' perfiles reales + capa .5 derivada)',
                        'color:#10b981;font-weight:bold');
                })
                .catch(() => probar(i + 1));
        };
        probar(0);
    })();
    console.log('%c🎯 Auto-Classifier Global cargado', 'color: #10b981; font-weight: bold;');
}
