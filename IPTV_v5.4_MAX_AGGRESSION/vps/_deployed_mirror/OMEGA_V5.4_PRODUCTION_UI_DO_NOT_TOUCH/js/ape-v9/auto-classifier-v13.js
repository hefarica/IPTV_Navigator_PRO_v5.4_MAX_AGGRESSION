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
        const { resolution, fps, codec, bitrate } = channel;

        // 1. Normalizar y validar datos
        const normalizedCodec = this._normalizeCodec(codec);
        const pixels = this._getPixels(resolution, channel); // ✅ v13.1.3: Pasar canal para detección AUTO
        const parsedFps = parseInt(fps) || 30;
        const parsedBitrate = parseInt(bitrate) || 0;

        if (!pixels) {
            return {
                suggestedProfile: 'P5',
                qualityScore: 0,
                reason: 'Resolución no reconocida',
                estimatedBitrate: 0,
                error: true
            };
        }

        // 2. Calcular bitrate estimado óptimo
        const bpp = this._getBPP(normalizedCodec, pixels);
        const estimatedBitrate = (pixels * parsedFps * bpp) / 1000000; // En Mbps

        // 3. Calcular score de calidad (0-100)
        let qualityScore = 0;
        if (parsedBitrate > 0 && estimatedBitrate > 0) {
            qualityScore = Math.min(100, (parsedBitrate / estimatedBitrate) * 100);
        }

        // 4. Bono de Directivas por Metadatos (HEVC, HDR, UHD)
        const directiveBonus = this._calculateDirectiveBonus(channel);
        qualityScore += directiveBonus;

        // 5. Asignar perfil basado en características (Ajustado por SSOT y Upward-Bias)
        const suggestedProfile = this._determineProfile(
            resolution,
            parsedFps,
            normalizedCodec,
            qualityScore,
            pixels,
            directiveBonus > 0 // Flag para indicar que tiene bono de calidad
        );

        return {
            suggestedProfile,
            qualityScore: Math.round(Math.min(100, qualityScore)),
            estimatedBitrate: Math.round(estimatedBitrate * 10) / 10,
            actualBitrate: parsedBitrate,
            directiveBonusApplied: directiveBonus > 0,
            reason: this._generateReason(suggestedProfile, resolution, parsedFps, normalizedCodec, qualityScore, directiveBonus > 0)
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
            errors: 0
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
        });

        stats.avgQualityScore = Math.round(totalQuality / (channels.length - stats.errors));

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
    _determineProfile(resolution, fps, codec, qualityScore, pixels, hasBonus = false) {
        const config = window.APE_PROFILES_CONFIG;
        if (!config) return this._determineProfileStatic(resolution, fps, codec, qualityScore, pixels);

        const profiles = config.getAllProfiles();
        let bestMatch = 'P5';
        let highestScore = -1;

        Object.entries(profiles).forEach(([id, profile]) => {
            let score = 0;
            const settings = profile.settings || {};

            // 1. Matching por Píxeles (SSOT - Peso 75% en v13.5)
            const profilePixels = this._getPixels(settings.resolution);
            if (profilePixels > 0) {
                const diff = Math.abs(pixels - profilePixels);
                const maxDiff = Math.max(pixels, profilePixels);
                const pixelMatch = 1 - (diff / maxDiff);
                score += pixelMatch * (this.atomicConfig.resolutionWeight * 100);
            }

            // 2. Matching por FPS (Peso 15%)
            const profileFps = parseInt(settings.fps) || 30;
            const fpsDiff = Math.abs(fps - profileFps);
            const fpsMatch = 1 - (fpsDiff / Math.max(fps, profileFps, 1));
            score += fpsMatch * 15;

            // 3. Matching por Codec (Peso 10%)
            const profileCodec = this._normalizeCodec(settings.codec);
            if (profileCodec === codec) {
                score += 10;
            }

            // 4. Upward-Bias: Bono por nivel de perfil para prevenir downgrades
            // Los perfiles con IDs menores (P0, P1...) reciben un ligero empuje
            const profileNum = parseInt(id.replace('P', ''));
            if (!isNaN(profileNum)) {
                score += (6 - profileNum) * 0.5; // Bono de hasta 3 puntos por ser perfil premium
            }

            // Bono extra si el canal ya traía bono de metadatos calientes
            if (hasBonus && profileNum <= 2) {
                score += 5; // Empuje extra hacia P0-P2 si detectamos UHD/HEVC
            }

            if (score > highestScore) {
                highestScore = score;
                bestMatch = id;
            }
        });

        return bestMatch;
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
    console.log('%c🎯 Auto-Classifier Global cargado', 'color: #10b981; font-weight: bold;');
}
