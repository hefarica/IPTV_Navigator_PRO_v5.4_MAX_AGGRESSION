/**
 * ═══════════════════════════════════════════════════════════════════
 * RANKING SCORE FIX v1.1 - Corrección de Score Live = 0 y Tier = UNKNOWN
 * ═══════════════════════════════════════════════════════════════════
 * 
 * 🐛 PROBLEMAS CORREGIDOS:
 * 1. scoreLive = 0 en canales 720p
 * 2. qualityTier = "UNKNOWN" en canales con cualquier resolución
 * 3. Cálculo inconsistente de tier basado en thresholds
 * 4. localStorage corrupto con perfiles inválidos
 * 
 * 🔧 SOLUCIÓN:
 * - Wrappea enrichChannelWithScore con validación robusta
 * - Fuerza recálculo de tier basado en qualityScore
 * - Garantiza que scoreLive siempre tenga valor
 * - Limpia localStorage corrupto
 * 
 * 🚀 OPTIMIZADO PARA 300K+ CANALES
 * ═══════════════════════════════════════════════════════════════════
 */

class RankingScoreFix {
    constructor() {
        this.fixedCount = 0;
        this.errorCount = 0;
        this.debugMode = false; // Desactivado por defecto para 300k+

        // Configuración para 300K+ canales
        this.config = {
            batchSize: 5000,
            yieldInterval: 20
        };

        // Limpiar perfil corrupto de localStorage al iniciar
        this._cleanCorruptedProfile();

        console.log('🔧 RankingScoreFix v1.1 inicializado');
    }

    /**
     * Limpiar perfil corrupto de localStorage si existe
     */
    _cleanCorruptedProfile() {
        try {
            const saved = localStorage.getItem('iptv_ranking_score_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Verificar si tiene claves incorrectas (mayúsculas)
                if (parsed.resolutions && (parsed.resolutions['720P'] || parsed.resolutions['1080P'])) {
                    console.warn('⚠️ [ScoreFix] Perfil corrupto detectado, limpiando...');
                    localStorage.removeItem('iptv_ranking_score_config');
                    console.log('✅ [ScoreFix] Perfil corrupto eliminado, usando defecto');
                }
            }
        } catch (e) {
            // Si hay error de parseo, limpiar
            localStorage.removeItem('iptv_ranking_score_config');
        }
    }

    /**
     * Calcular tier basado SOLO en qualityScore y thresholds
     * CLAVES EN MINÚSCULAS para coincidir con el perfil
     */
    calculateTierFromScore(qualityScore, resolution) {
        // Thresholds por resolución - CLAVES EN MINÚSCULAS
        const thresholdsByResolution = {
            '8K': { ultraPremium: 90, premium: 75, standard: 55, medium: 30, low: 0 },
            '4K': { ultraPremium: 90, premium: 75, standard: 55, medium: 30, low: 0 },
            '1080p': { ultraPremium: 85, premium: 70, standard: 50, medium: 25, low: 0 },
            '720p': { ultraPremium: 80, premium: 65, standard: 45, medium: 20, low: 0 },
            '480p': { ultraPremium: 70, premium: 55, standard: 35, medium: 15, low: 0 }
        };

        // Normalizar resolución (misma lógica que ranking-score-config.js)
        let normalizedRes = this._normalizeResolution(resolution);

        const thresholds = thresholdsByResolution[normalizedRes] || thresholdsByResolution['480p'];

        // Determinar tier basado en score (orden descendente)
        if (qualityScore >= thresholds.ultraPremium) {
            return 'ULTRA_PREMIUM';
        } else if (qualityScore >= thresholds.premium) {
            return 'PREMIUM';
        } else if (qualityScore >= thresholds.standard) {
            return 'STANDARD';
        } else if (qualityScore >= thresholds.medium) {
            return 'MEDIUM';
        } else if (qualityScore >= 0) {
            return 'LOW';
        } else {
            return 'UNKNOWN';
        }
    }

    /**
     * Normalizar resolución - MISMA LÓGICA que ranking-score-config.js
     */
    _normalizeResolution(res) {
        if (!res) return '480p';

        const normalized = res.toString().trim().toUpperCase();

        if (normalized.includes('8K') || normalized.includes('7680') || normalized.includes('4320')) {
            return '8K';
        }
        if (normalized.includes('4K') || normalized.includes('2160') || normalized.includes('3840') ||
            normalized.includes('UHD') || normalized.includes('ULTRAHD')) {
            return '4K';
        }
        if (normalized.includes('1080') || normalized.includes('FHD') ||
            normalized.includes('FULLHD') || normalized.includes('1920')) {
            return '1080p';
        }
        if (normalized.includes('720') || normalized.includes('1280') ||
            (normalized === 'HD' && !normalized.includes('FHD') && !normalized.includes('UHD'))) {
            return '720p';
        }
        if (normalized.includes('480') || normalized.includes('SD') || normalized.includes('854')) {
            return '480p';
        }

        return '480p';
    }

    /**
     * Wrappea enrichChannelWithScore con validación robusta
     */
    wrapEnrichChannelWithScore(originalMethod, appInstance) {
        const self = this;

        return function (channel) {
            try {
                // 1. Asegurar que heuristics existe ANTES de todo
                if (!channel.heuristics) {
                    channel.heuristics = {};
                }

                // 2. Ejecutar método original
                const result = originalMethod.call(appInstance, channel);

                // 3. Si qualityScore es 0 o undefined, forzar recálculo
                if (!channel.qualityScore || channel.qualityScore === 0) {
                    if (appInstance.rankingScoreConfig) {
                        const scoreResult = appInstance.rankingScoreConfig.calculateScore(channel);
                        channel.qualityScore = scoreResult.qualityScore || 0;
                        channel.qualityTier = scoreResult.qualityTier || 'UNKNOWN';
                        channel.scoreBreakdown = scoreResult.breakdown;
                    }
                }

                // 4. Re-calcular tier si es UNKNOWN pero tiene score válido
                if ((channel.qualityTier === 'UNKNOWN' || !channel.qualityTier) && channel.qualityScore > 0) {
                    const correctedTier = self.calculateTierFromScore(
                        channel.qualityScore,
                        channel.resolution
                    );

                    channel.qualityTier = correctedTier;
                    self.fixedCount++;
                }

                // 5. GARANTIZAR que scoreLive tiene valor
                if (!channel.heuristics.scoreLive || channel.heuristics.scoreLive === 0) {
                    channel.heuristics.scoreLive = channel.qualityScore || 0;
                }

                // 6. GARANTIZAR que scoreLive también esté en root
                if (!channel.scoreLive || channel.scoreLive === 0) {
                    channel.scoreLive = channel.qualityScore || 0;
                }

                // 7. Sincronizar tier en heuristics
                if (channel.heuristics.qualityTier === 'UNKNOWN' || !channel.heuristics.qualityTier) {
                    channel.heuristics.qualityTier = channel.qualityTier;
                }

                return result;

            } catch (e) {
                self.errorCount++;
                // Intento de corrección mínima
                if (!channel.heuristics) channel.heuristics = {};
                if (!channel.heuristics.scoreLive && channel.qualityScore) {
                    channel.heuristics.scoreLive = channel.qualityScore;
                }
                return channel;
            }
        };
    }

    /**
     * Aplicar fix completo a la aplicación
     */
    applyFix(appInstance) {
        if (!appInstance) {
            console.error('❌ [ScoreFix] appInstance es null');
            return false;
        }

        if (!appInstance.enrichChannelWithScore) {
            console.error('❌ [ScoreFix] enrichChannelWithScore no existe');
            return false;
        }

        console.group('🔧 [ScoreFix] Aplicando correcciones v1.1');

        // Wrappear enrichChannelWithScore
        const originalMethod = appInstance.enrichChannelWithScore;
        appInstance.enrichChannelWithScore = this.wrapEnrichChannelWithScore(originalMethod, appInstance);

        console.log('✅ enrichChannelWithScore parcheado');
        console.log('🎯 Correcciones automáticas:');
        console.log('   - Tier UNKNOWN → Tier correcto');
        console.log('   - scoreLive = 0 → scoreLive válido');
        console.log('   - Sincronización root ↔ heuristics');
        console.groupEnd();

        return true;
    }

    /**
     * Función de utilidad: Corregir TODOS los canales existentes (Async para 300k+)
     */
    async fixAllChannels(appInstance) {
        if (!appInstance || !appInstance.state || !appInstance.state.channelsMaster) {
            console.error('❌ [ScoreFix] No hay canales para corregir');
            return;
        }

        console.group('🔧 [ScoreFix] Corrigiendo canales existentes');

        const channels = appInstance.state.channelsMaster;
        const totalChannels = channels.length;
        let fixedTier = 0;
        let fixedScoreLive = 0;

        const { batchSize, yieldInterval } = this.config;
        const totalBatches = Math.ceil(totalChannels / batchSize);

        console.log(`📊 Procesando ${totalChannels.toLocaleString()} canales en ${totalBatches} lotes`);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * batchSize;
            const end = Math.min(start + batchSize, totalChannels);

            for (let i = start; i < end; i++) {
                const channel = channels[i];

                // Asegurar estructura heuristics
                if (!channel.heuristics) {
                    channel.heuristics = {};
                }

                // Corregir tier UNKNOWN
                if ((channel.qualityTier === 'UNKNOWN' || !channel.qualityTier) && channel.qualityScore > 0) {
                    const correctedTier = this.calculateTierFromScore(
                        channel.qualityScore,
                        channel.resolution
                    );

                    channel.qualityTier = correctedTier;
                    channel.heuristics.qualityTier = correctedTier;
                    fixedTier++;
                }

                // Corregir scoreLive = 0
                if ((!channel.heuristics.scoreLive || channel.heuristics.scoreLive === 0) &&
                    channel.qualityScore > 0) {
                    channel.heuristics.scoreLive = channel.qualityScore;
                    channel.scoreLive = channel.qualityScore;
                    fixedScoreLive++;
                }

                // También verificar scoreLive en root
                if ((!channel.scoreLive || channel.scoreLive === 0) && channel.qualityScore > 0) {
                    channel.scoreLive = channel.qualityScore;
                }
            }

            // Yield al event loop cada lote
            if (batchIndex < totalBatches - 1 && yieldInterval > 0) {
                await new Promise(resolve => setTimeout(resolve, yieldInterval));
            }

            // Progress log cada 5 lotes
            if ((batchIndex + 1) % 5 === 0) {
                const pct = Math.round(((batchIndex + 1) / totalBatches) * 100);
                console.log(`   📈 Progreso: ${pct}%`);
            }
        }

        console.log(`✅ Correcciones completadas:`);
        console.log(`   - Tier UNKNOWN → válido: ${fixedTier.toLocaleString()}`);
        console.log(`   - scoreLive 0 → válido: ${fixedScoreLive.toLocaleString()}`);
        console.log(`📊 Total procesados: ${totalChannels.toLocaleString()}`);
        console.groupEnd();

        // Forzar re-render de la tabla
        if (typeof appInstance.renderTable === 'function') {
            appInstance.renderTable();
        }

        return { fixedTier, fixedScoreLive, total: totalChannels };
    }

    /**
     * Diagnóstico: Ver distribución de tiers
     */
    diagnose(appInstance) {
        if (!appInstance || !appInstance.state || !appInstance.state.channelsMaster) {
            console.error('❌ No hay canales para diagnosticar');
            return;
        }

        const channels = appInstance.state.channelsMaster;
        const distribution = {
            ULTRA_PREMIUM: 0,
            PREMIUM: 0,
            STANDARD: 0,
            MEDIUM: 0,
            LOW: 0,
            UNKNOWN: 0,
            NULL: 0
        };

        let scoreLiveZero = 0;
        let scoreZero = 0;

        channels.forEach(ch => {
            const tier = ch.qualityTier || 'NULL';
            distribution[tier] = (distribution[tier] || 0) + 1;

            if (!ch.heuristics?.scoreLive || ch.heuristics.scoreLive === 0) {
                scoreLiveZero++;
            }
            if (!ch.qualityScore || ch.qualityScore === 0) {
                scoreZero++;
            }
        });

        console.group('🔍 [ScoreFix] Diagnóstico');
        console.log('📊 Distribución de Tiers:');
        console.table(distribution);
        console.log(`⚠️ Canales con scoreLive = 0: ${scoreLiveZero}`);
        console.log(`⚠️ Canales con qualityScore = 0: ${scoreZero}`);
        console.log(`📊 Total canales: ${channels.length}`);
        console.groupEnd();

        return { distribution, scoreLiveZero, scoreZero };
    }

    /**
     * Obtener reporte de correcciones aplicadas
     */
    getReport() {
        return {
            fixedCount: this.fixedCount,
            errorCount: this.errorCount,
            successRate: this.fixedCount + this.errorCount > 0
                ? Math.round((this.fixedCount / (this.fixedCount + this.errorCount)) * 100)
                : 100
        };
    }

    /**
     * Habilitar/deshabilitar debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        console.log(`🔧 [ScoreFix] Debug mode: ${enabled ? 'ON' : 'OFF'}`);
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.RankingScoreFix = RankingScoreFix;
    console.log('✅ RankingScoreFix v1.1 disponible globalmente');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RankingScoreFix;
}
