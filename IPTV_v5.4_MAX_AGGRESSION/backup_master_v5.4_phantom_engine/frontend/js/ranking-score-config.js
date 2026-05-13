/**
 * RANKING SCORE CONFIG MODULE v1.0
 * Sistema de Scoring Configurable para IPTV Navigator v4.7+
 * 
 * ✅ CARACTERÍSTICAS:
 * - Motor de cálculo realista de scores (0-100)
 * - 5 parámetros configurables: Resolución, Bitrate, Codec, FPS, Ponderación
 * - Perfil por defecto basado en estándares industriales 2025
 * - Persistencia automática en localStorage
 * - Import/Export de perfiles personalizados
 * - Sin dependencias externas (Vanilla JS)
 * 
 * 📊 ESTÁNDARES POR DEFECTO:
 * - 8K: 50000 kbps, HEVC, 60 fps → base 40 pts
 * - 4K: 25000 kbps, HEVC, 30 fps → base 36 pts
 * - 1080p: 8000 kbps, H.264, 30 fps → base 28 pts
 * - 720p: 5000 kbps, H.264, 25 fps → base 20 pts
 * - 480p: 2000 kbps, H.264, 25 fps → base 10 pts
 * 
 * 🎯 FÓRMULA:
 * SCORE = (Res_pts + Bitrate_pts + Codec_pts + FPS_pts) × Ponderación
 * LÍMITE: 0-100 (Math.min/max)
 */

class RankingScoreConfig {
  constructor() {
    this.CONFIG_KEY = 'iptv_ranking_score_config';
    this.DEFAULT_KEY = 'iptv_ranking_score_default';

    // Cargar configuración guardada o usar defecto
    this.profile = this.loadProfile();

    // Validar integridad del perfil
    this.validateProfile();
  }

  /**
   * Obtener perfil por defecto integrado
   * Basado en estándares realistas IPTV 2025
   */
  getDefaultProfile() {
    return {
      version: '1.0',
      name: 'Estándar IPTV 2025',
      description: 'Perfil por defecto basado en estándares industriales',
      createdAt: new Date().toISOString(),

      // RESOLUCIONES
      resolutions: {
        '8K': {
          label: '8K (7680x4320)',
          basePoints: 40,
          standardBitrate: 50000,
          standardCodec: 'HEVC',
          standardFPS: 60,
          tierThresholds: {
            ultraPremium: 90,
            premium: 75,
            standard: 55,
            medium: 30,
            low: 0
          }
        },
        '4K': {
          label: '4K (3840x2160)',
          basePoints: 36,
          standardBitrate: 25000,
          standardCodec: 'HEVC',
          standardFPS: 30,
          tierThresholds: {
            ultraPremium: 90,
            premium: 75,
            standard: 55,
            medium: 30,
            low: 0
          }
        },
        '1080p': {
          label: '1080p (1920x1080)',
          basePoints: 28,
          standardBitrate: 8000,
          standardCodec: 'H.264',
          standardFPS: 30,
          tierThresholds: {
            ultraPremium: 85,
            premium: 70,
            standard: 50,
            medium: 25,
            low: 0
          }
        },
        '720p': {
          label: '720p (1280x720)',
          basePoints: 20,
          standardBitrate: 5000,
          standardCodec: 'H.264',
          standardFPS: 25,
          tierThresholds: {
            ultraPremium: 80,
            premium: 65,
            standard: 45,
            medium: 20,
            low: 0
          }
        },
        '480p': {
          label: '480p (854x480)',
          basePoints: 10,
          standardBitrate: 2000,
          standardCodec: 'H.264',
          standardFPS: 25,
          tierThresholds: {
            ultraPremium: 70,
            premium: 55,
            standard: 35,
            medium: 15,
            low: 0
          }
        }
      },

      // BITRATE - Variancia progresiva
      bitrate: {
        enabled: true,
        weight: 30,
        maxPoints: 50,
        variance: {
          '+80%+': { threshold: 1.8, points: 50 },
          '+60%': { threshold: 1.6, points: 45 },
          '+40%': { threshold: 1.4, points: 40 },
          '+20%': { threshold: 1.2, points: 35 },
          'standard': { threshold: 1.0, points: 30 },
          '-15%': { threshold: 0.85, points: 24 },
          '-30%': { threshold: 0.7, points: 18 },
          '-50%': { threshold: 0.5, points: 12 },
          'crítico': { threshold: 0.0, points: 6 }
        }
      },

      // CODEC - Jerarquía
      codec: {
        enabled: true,
        weight: 20,
        maxPoints: 30,
        hierarchy: [
          { rank: 1, codec: 'AV1', points: 30, description: 'Mejor compresión' },
          { rank: 2, codec: 'VP9', points: 25, description: 'Muy bueno' },
          { rank: 2, codec: 'HEVC', points: 25, description: 'Muy bueno' },
          { rank: 3, codec: 'H.264', points: 15, description: 'Estándar' }
        ]
      },

      // FPS - Variancia
      fps: {
        enabled: true,
        weight: 20,
        maxPoints: 20,
        variance: {
          '+100%': { threshold: 2.0, points: 20 },
          '+80%': { threshold: 1.8, points: 18 },
          '+60%': { threshold: 1.6, points: 16 },
          '+40%': { threshold: 1.4, points: 14 },
          '+20%': { threshold: 1.2, points: 12 },
          'standard': { threshold: 1.0, points: 10 },
          '-20%': { threshold: 0.8, points: 8 },
          '-40%': { threshold: 0.6, points: 6 },
          'crítico': { threshold: 0.0, points: 3 }
        }
      }
    };
  }

  /**
   * Cargar perfil desde localStorage o retornar defecto
   */
  loadProfile() {
    try {
      const saved = localStorage.getItem(this.CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validar estructura básica
        if (parsed.resolutions && parsed.bitrate && parsed.codec && parsed.fps) {
          console.log('✓ Perfil de scoring cargado desde localStorage');
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error cargando perfil:', e);
    }

    console.log('✓ Usando perfil de scoring por defecto');
    return this.getDefaultProfile();
  }

  /**
   * Validar integridad del perfil (agregar campos faltantes)
   */
  validateProfile() {
    const defaultProfile = this.getDefaultProfile();

    // Asegurar que todos los campos necesarios existan
    if (!this.profile.resolutions) this.profile.resolutions = defaultProfile.resolutions;
    if (!this.profile.bitrate) this.profile.bitrate = defaultProfile.bitrate;
    if (!this.profile.codec) this.profile.codec = defaultProfile.codec;
    if (!this.profile.fps) this.profile.fps = defaultProfile.fps;

    // Validar cada resolución
    Object.keys(defaultProfile.resolutions).forEach(res => {
      if (!this.profile.resolutions[res]) {
        this.profile.resolutions[res] = defaultProfile.resolutions[res];
      }
    });
  }

  /**
   * Guardar perfil en localStorage
   */
  saveProfile(profile = null) {
    const toSave = profile || this.profile;
    try {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(toSave));
      console.log('✓ Perfil de scoring guardado');
      return true;
    } catch (e) {
      console.error('Error guardando perfil:', e);
      return false;
    }
  }

  /**
   * Restablecer a perfil por defecto
   */
  resetToDefault() {
    this.profile = this.getDefaultProfile();
    this.saveProfile();
    console.log('✓ Perfil de scoring restablecido al defecto');
    return this.profile;
  }

  /**
   * Obtener perfil actual
   */
  getProfile() {
    return JSON.parse(JSON.stringify(this.profile));
  }

  /**
   * Actualizar estándar de una resolución
   */
  updateResolutionStandard(resolution, updates) {
    if (!this.profile.resolutions[resolution]) {
      console.warn(`Resolución ${resolution} no encontrada`);
      return false;
    }

    this.profile.resolutions[resolution] = {
      ...this.profile.resolutions[resolution],
      ...updates
    };

    this.saveProfile();
    return true;
  }

  /**
   * CORE: Calcular score de un canal
   * 
   * @param {Object} channel - Canal con: resolution, bitrate, codec, fps
   * @returns {Object} { qualityScore: 0-100, qualityTier: string, breakdown: {} }
   */
  calculateScore(channel) {
    if (!channel) return { qualityScore: 0, qualityTier: 'UNKNOWN', breakdown: {} };

    // Normalizar entrada
    const resolution = this._normalizeResolution(channel.resolution);
    const bitrate = Math.max(0, Number(channel.bitrate) || 0);
    const codec = (channel.codec || 'H.264').trim().toUpperCase();
    const fps = Math.max(0, Number(channel.fps) || 25);

    // Obtener estándares para esta resolución
    const resConfig = this.profile.resolutions[resolution];
    if (!resConfig) {
      return {
        qualityScore: 0,
        qualityTier: 'UNKNOWN',
        breakdown: {
          resolution,
          error: `Resolución ${resolution} no configurada`
        }
      };
    }

    // Inicializar desglose
    const breakdown = {
      resolution,
      bitrate,
      codec,
      fps,
      standard: {
        bitrate: resConfig.standardBitrate,
        codec: resConfig.standardCodec,
        fps: resConfig.standardFPS
      },
      points: {}
    };

    // 1. Puntos por Resolución (base)
    breakdown.points.resolution = resConfig.basePoints;

    // 2. Puntos por Bitrate
    breakdown.points.bitrate = this._calculateBitratePoints(
      bitrate,
      resConfig.standardBitrate
    );

    // 3. Puntos por Codec
    breakdown.points.codec = this._calculateCodecPoints(
      codec,
      resConfig.standardCodec
    );

    // 4. Puntos por FPS
    breakdown.points.fps = this._calculateFPSPoints(
      fps,
      resConfig.standardFPS
    );

    // Suma total
    const rawScore =
      breakdown.points.resolution +
      breakdown.points.bitrate +
      breakdown.points.codec +
      breakdown.points.fps;

    // Limitar a 0-100
    const qualityScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    // Determinar tier según resolución
    const tierThresholds = resConfig.tierThresholds;
    let qualityTier = 'LOW';
    let tierEmoji = '🔴';

    if (qualityScore >= tierThresholds.ultraPremium) {
      qualityTier = 'ULTRA_PREMIUM';
      tierEmoji = '🔵';
    } else if (qualityScore >= tierThresholds.premium) {
      qualityTier = 'PREMIUM';
      tierEmoji = '🟢';
    } else if (qualityScore >= tierThresholds.standard) {
      qualityTier = 'STANDARD';
      tierEmoji = '🟡';
    } else if (qualityScore >= tierThresholds.medium) {
      qualityTier = 'MEDIUM';
      tierEmoji = '🟠';
    }

    breakdown.tierEmoji = tierEmoji;

    return {
      qualityScore,
      qualityTier,
      breakdown,
      standard: resConfig
    };
  }

  /**
   * Calcular puntos de bitrate basado en variancia
   */
  _calculateBitratePoints(actual, standard) {
    if (!this.profile.bitrate.enabled) return 0;
    if (standard === 0) return 0;

    const ratio = actual / standard;
    const variance = this.profile.bitrate.variance;

    // Encontrar el rango que aplica
    for (const [key, config] of Object.entries(variance)) {
      if (ratio >= config.threshold) {
        return config.points;
      }
    }

    return variance['crítico'].points;
  }

  /**
   * Calcular puntos de codec comparando con estándar
   */
  _calculateCodecPoints(actual, standard) {
    if (!this.profile.codec.enabled) return 0;

    // Obtener ranking de ambos
    const actualRank = this._getCodecRank(actual);
    const standardRank = this._getCodecRank(standard);

    const rankDiff = actualRank - standardRank;

    if (rankDiff >= 2) {
      return 30; // Mucho mejor
    } else if (rankDiff === 1) {
      return 25; // Mejor
    } else if (rankDiff === 0) {
      return 15; // Igual
    } else if (rankDiff === -1) {
      return 8; // Peor
    } else {
      return 4; // Mucho peor
    }
  }

  /**
   * Obtener ranking de codec
   */
  _getCodecRank(codec) {
    const normalized = codec.trim().toUpperCase();
    const found = this.profile.codec.hierarchy.find(c => c.codec === normalized);
    return found ? found.rank : 999;
  }

  /**
   * Calcular puntos de FPS basado en variancia
   */
  _calculateFPSPoints(actual, standard) {
    if (!this.profile.fps.enabled) return 0;
    if (standard === 0) return 0;

    const ratio = actual / standard;
    const variance = this.profile.fps.variance;

    // Encontrar el rango que aplica
    for (const [key, config] of Object.entries(variance)) {
      if (ratio >= config.threshold) {
        return config.points;
      }
    }

    return variance['crítico'].points;
  }

  /**
   * Normalizar nombre de resolución
   */
  _normalizeResolution(res) {
    if (!res) return '480p';

    const normalized = res.toString().trim().toUpperCase();

    // Mapeo de sinónimos - DEBE RETORNAR claves que coincidan con el perfil
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

    // Default - usar '480p' que existe en el perfil
    return '480p';
  }

  /**
   * Exportar perfil como JSON
   */
  exportProfile() {
    const profile = this.getProfile();
    const json = JSON.stringify(profile, null, 2);
    const filename = `iptv-ranking-profile-${new Date().toISOString().split('T')[0]}.json`;

    // Crear descarga
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    console.log('✓ Perfil exportado:', filename);
    return json;
  }

  /**
   * Importar perfil desde JSON
   */
  importProfile(jsonString) {
    try {
      const imported = JSON.parse(jsonString);

      // Validaciones básicas
      if (!imported.resolutions || !imported.bitrate) {
        throw new Error('Estructura de perfil inválida');
      }

      this.profile = imported;
      this.validateProfile();
      this.saveProfile();

      console.log('✓ Perfil importado correctamente');
      return true;
    } catch (e) {
      console.error('Error importando perfil:', e);
      return false;
    }
  }

  /**
   * Obtener estadísticas de distribución de scores
   */
  getScoreStatistics(channels) {
    if (!Array.isArray(channels) || channels.length === 0) {
      return {
        total: 0,
        avgScore: 0,
        distribution: {}
      };
    }

    const scores = channels.map(ch => {
      const result = this.calculateScore(ch);
      return result.qualityScore;
    });

    const distribution = {
      ultraPremium: scores.filter(s => s >= 90).length,
      premium: scores.filter(s => s >= 75 && s < 90).length,
      standard: scores.filter(s => s >= 55 && s < 75).length,
      medium: scores.filter(s => s >= 30 && s < 55).length,
      low: scores.filter(s => s < 30).length
    };

    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return {
      total: channels.length,
      avgScore,
      distribution
    };
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.RankingScoreConfig = RankingScoreConfig;
}