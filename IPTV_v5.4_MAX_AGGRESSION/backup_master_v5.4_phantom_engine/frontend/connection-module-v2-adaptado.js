/**
 * CONNECTION-MODULE.js - VERSIÓN ADAPTADA V2.0
 * IPTV Navigator PRO - Etapa 1: EXTENSIÓN de Normalización
 * 
 * ⚠️ CRÍTICO: Este módulo NO reemplaza app.js
 * ✅ Se engancha al pipeline existente de app.js
 * 
 * Responsabilidad: Extender y complementar normalizeChannel()
 */

class ConnectionModuleV2 {
  constructor(appInstance) {
    this.app = appInstance;
    this.fieldMapping = this.initFieldMapping();
    this.cache = new Map();
  }

  /**
   * MAPEO DE 45 CAMPOS - Compatible con app.js
   */
  initFieldMapping() {
    return {
      // Identidad Nuclear (6)
      id: { 
        canonical: 'id', 
        aliases: ['stream_id', 'streamid', 'epg_channel_id', 'channel_id', 'num']
      },
      tvgId: { 
        canonical: 'tvgId', 
        aliases: ['tvg-id', 'tvg_id', 'epg_id', 'xmltv_id', 'tvg_ID']
      },
      tvgName: { 
        canonical: 'tvgName', 
        aliases: ['tvg-name', 'tvg_name', 'epg_name', 'channel_epg_name']
      },
      name: { 
        canonical: 'name', 
        aliases: ['title', 'stream_name', 'channel_name', 'streamname', 'epg_name']
      },
      raw_num: { 
        canonical: 'raw.num', 
        aliases: ['num', 'number', 'position', 'order', 'index']
      },
      raw_streamid: { 
        canonical: 'raw.stream_id', 
        aliases: ['stream_id', 'streamid', 'id', 'uid']
      },

      // Calidad Imagen (12)
      resolution: { 
        canonical: 'resolution', 
        aliases: ['res', 'quality', 'video_quality', 'definition', 'quality_tag']
      },
      bitrate: { 
        canonical: 'bitrate', 
        aliases: ['br', 'bps', 'bitrate_kbps', 'bit_rate', 'bitrate_kbps_estimated']
      },
      bitrateTierCode: { 
        canonical: 'bitrateTierCode', 
        aliases: ['tier', 'quality_tier', 'tier_code', 'bitrate_tier']
      },
      frames: { 
        canonical: 'frames', 
        aliases: ['frame_rate', 'fps', 'video_fps', 'framerate']
      },
      codec: { 
        canonical: 'codec', 
        aliases: ['video_codec', 'stream_codec', 'vcodec', 'video_format']
      },
      codecFamily: { 
        canonical: 'codecFamily', 
        aliases: ['codec_family', 'codec_type']
      },
      raw_videowidth: { 
        canonical: 'raw.video_width', 
        aliases: ['video_width', 'width', 'w', 'video_width_px']
      },
      raw_videoheight: { 
        canonical: 'raw.video_height', 
        aliases: ['video_height', 'height', 'h', 'video_height_px']
      },
      raw_aspectratio: { 
        canonical: 'raw.aspect_ratio', 
        aliases: ['aspect_ratio', 'aspect', 'aspect_ratio_video']
      },
      raw_audiocodec: { 
        canonical: 'raw.audio_codec', 
        aliases: ['audio_codec', 'acodec', 'audio_format']
      },
      raw_audiochannels: { 
        canonical: 'raw.audio_channels', 
        aliases: ['audio_channels', 'channels', 'audio_channel_count']
      },
      qualityTags: { 
        canonical: 'qualityTags', 
        aliases: ['quality_tags', 'tags', 'tag_list', 'quality_tag_list']
      },

      // Categorización (8)
      group: { 
        canonical: 'group', 
        aliases: ['category', 'category_id', 'category_name', 'cat_name', 'group_title', 'categoryname']
      },
      type: { 
        canonical: 'type', 
        aliases: ['stream_type', 'content_type', 'streamtype', 'stream_type_name']
      },
      country: { 
        canonical: 'country', 
        aliases: ['cc', 'iso_code', 'country_code', 'nation', 'nation_code']
      },
      language: { 
        canonical: 'language', 
        aliases: ['lang', 'languages', 'audio_lang', 'language_code', 'spoken_language']
      },
      rating: { 
        canonical: 'rating', 
        aliases: ['rank', 'score', 'rating_value', 'quality_rating']
      },
      isAdult: { 
        canonical: 'isAdult', 
        aliases: ['is_adult', 'adult', 'xxx', 'nsfw', 'adult_content']
      },
      raw_plot: { 
        canonical: 'raw.plot', 
        aliases: ['plot', 'description', 'synopsis', 'channel_description']
      },
      raw_cast: { 
        canonical: 'raw.cast', 
        aliases: ['cast', 'actors', 'cast_list']
      },

      // Infraestructura (9)
      url: { 
        canonical: 'url', 
        aliases: ['stream_url', 'play_url', 'link', 'stream_link', 'stream_source_url']
      },
      logo: { 
        canonical: 'logo', 
        aliases: ['stream_icon', 'tvg_logo', 'icon', 'cover', 'poster', 'stream_icon_url']
      },
      transport: { 
        canonical: 'transport', 
        aliases: ['stream_format', 'format', 'transport_format', 'protocol']
      },
      raw_containerextension: { 
        canonical: 'raw.container_extension', 
        aliases: ['container_extension', 'ext', 'container_type', 'file_extension']
      },
      raw_host: { 
        canonical: 'raw.host', 
        aliases: ['host', 'hostname', 'domain', 'server_host']
      },
      provider: { 
        canonical: 'provider', 
        aliases: ['origin', 'source_name', 'server_name', 'service_provider']
      },
      website: { 
        canonical: 'website', 
        aliases: ['site', 'url_web', 'website_url', 'official_website']
      },
      epgUrl: { 
        canonical: 'epg_url', 
        aliases: ['tvg-url', 'x-tvg-url', 'epg_source_url']
      },
      yearLaunched: { 
        canonical: 'year_launched', 
        aliases: ['founded', 'launched', 'launch_year', 'year_started']
      },

      // Flags (4)
      isHdr: { 
        canonical: 'isHdr', 
        aliases: ['hdr', 'hdr10', 'has_hdr', 'supports_hdr']
      },
      isDolbyAtmos: { 
        canonical: 'isDolbyAtmos', 
        aliases: ['atmos', 'dolby_atmos', 'has_atmos', 'supports_atmos']
      },
      isCatchup: { 
        canonical: 'isCatchup', 
        aliases: ['catchup', 'catch-up', 'restart', 'timeshift', 'supports_catchup']
      },
      internallyEnriched: { 
        canonical: 'internallyEnriched', 
        aliases: ['enriched', 'is_enriched', 'enrichment_done']
      },
    };
  }

  /**
   * EXTIENDE normalizeChannel() de app.js
   * ✅ No reemplaza, complementa
   * ✅ Se engancha al pipeline
   */
  enrichWithFieldMapping(channel) {
    if (!channel) return channel;

    // Iterar sobre aliased fields y mapear si faltan
    Object.entries(this.fieldMapping).forEach(([canonical, config]) => {
      const { aliases } = config;
      
      // Si el campo canonical ya existe, saltamos
      if (this._getNestedValue(channel, canonical)) {
        return;
      }

      // Buscar en aliases
      for (const alias of aliases) {
        const value = this._getNestedValue(channel, alias);
        if (value !== undefined && value !== null && value !== '') {
          this._setNestedValue(channel, canonical, value);
          break;
        }
      }
    });

    return channel;
  }

  /**
   * Obtiene valor nested (a.b.c)
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Setea valor nested (a.b.c)
   */
  _setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Valida conexión Xtream (complementa app.js)
   */
  async validateConnection(config) {
    try {
      const { baseUrl, username, password } = config;
      
      const url = new URL(`${baseUrl}/player_api.php`);
      url.searchParams.append('username', username);
      url.searchParams.append('password', password);
      url.searchParams.append('action', 'get_live_streams');

      const response = await fetch(url.toString(), { timeout: 10000 });
      const data = await response.json();

      return {
        valid: Array.isArray(data),
        count: Array.isArray(data) ? data.length : 0,
        method: 'xtream',
        error: !Array.isArray(data) ? 'Invalid response format' : null,
      };
    } catch (error) {
      return {
        valid: false,
        count: 0,
        method: null,
        error: error.message,
      };
    }
  }

  /**
   * Analiza cuáles campos están enriquecidos (helper)
   */
  analyzeEnrichmentStatus(channel) {
    const status = {
      hasResolution: !!channel.resolution && channel.resolution !== 'UNKNOWN',
      hasCodec: !!channel.codec && channel.codec !== 'UNKNOWN',
      hasAudioCodec: !!channel.raw?.audio_codec && channel.raw.audio_codec !== 'UNKNOWN',
      hasBitrate: !!channel.bitrate && channel.bitrate > 0,
      hasFps: !!channel.frames && channel.frames > 0,
      hasScore: !!channel.qualityScore && channel.qualityScore > 0,
      hasTags: !!channel.qualityTags && channel.qualityTags.length > 0,
      isFullyEnriched: false,
    };

    // Verificar si está completamente enriquecido
    status.isFullyEnriched = Object.values(status).every((v, i) => {
      if (i === status.length - 1) return true; // Skip isFullyEnriched itself
      return v;
    });

    return status;
  }

  /**
   * Reporta estadísticas de mapeo
   */
  getFieldMappingStats() {
    const totalFields = Object.keys(this.fieldMapping).length;
    const totalAliases = Object.values(this.fieldMapping).reduce((sum, f) => sum + f.aliases.length, 0);

    return {
      totalCanonicalFields: totalFields,
      totalAliasVariations: totalAliases,
      averageAliasesPerField: (totalAliases / totalFields).toFixed(2),
      categories: {
        identity: 6,
        quality: 12,
        categorization: 8,
        infrastructure: 9,
        flags: 4,
        extra: 2,
        server: 1,
      }
    };
  }
}

// Exponer globalmente
window.ConnectionModuleV2 = ConnectionModuleV2;