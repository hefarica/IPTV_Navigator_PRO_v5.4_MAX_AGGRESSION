/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * 🧠 APE CHANNEL CLASSIFIER v2.0.0 (Hiper-Precisión Bidimensional)
 * Sistema de Clasificación Jerárquica basado en Motores Aislados para Canales IPTV
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * 
 * NUEVA JERARQUÍA BIDIMENSIONAL:
 *   Eje A: REGIÓN COMPLETA  → LATAM, NORTEAMÉRICA, EUROPA, ASIA, ÁFRICA (Ubicación física)
 *   Eje B: IDIOMA           → ESPAÑOL, INGLÉS, FRANCÉS, etc. (Comunicación del contenido)
 *   Eje C: CATEGORÍA        → DEPORTES, CINE, NOTICIAS, INFANTIL (Temática)
 *   Eje D: CALIDAD          → ULTRA HD, FULL HD, SD (Resolución)
 * 
 * FORMATO FINAL: "🌎 LATAM · 🗣️ ESPAÑOL · ⚽ DEPORTES · ULTRA HD"
 * 
 * @author APE Engine
 * @version 2.0.0
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    const VERSION = '2.0.0';

    const QUALITY_ICONS = {
        'ULTRA HD': 'icons/quality-ultra-hd.svg',
        'FULL HD': 'icons/quality-full-hd.svg',
        'SD': 'icons/quality-sd.svg'
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // 🗣️ EJE B: PATRONES DE IDIOMA
    // ═══════════════════════════════════════════════════════════════════════════════════
    const LANGUAGE_PATTERNS = {
        ESPANOL: {
            language: 'Español', emoji: '🇪🇸',
            keywords: ['EN ESPAÑOL', 'ESPAÑOL', 'SPANISH', 'LATINO', 'CASTELLANO', 'DEPORTES', 'ESPN DEPORTES', 'FOX DEPORTES', 'BEIN ESPAÑOL'],
            exact_tags: ['[ES]', '|ES|', '(ES)', '[LAT]', '(LAT)', '|LAT|', 'ES:', 'LAT:', '[MEX]', '[ARG]', '[COL]', '[CHL]', '[PER]']
        },
        INGLES: {
            language: 'Inglés', emoji: '🇬🇧',
            keywords: ['ENGLISH', 'INGLES', 'EN INGLÉS', 'NBC SPORTS', 'CBS SPORTS', 'FOX NEWS', 'BBC NEWS', 'SKY SPORTS'],
            exact_tags: ['[EN]', '|EN|', '(EN)', '[UK]', '(UK)', '|UK|', '[US]', '(US)', '|US|', 'EN:', 'UK:', 'US:']
        },
        PORTUGUES: {
            language: 'Portugués', emoji: '🇵🇹',
            keywords: ['PORTUGUESE', 'PORTUGUES', 'LEGENDADO', 'DUBLADO', 'SPORTV', 'GLOBO'],
            exact_tags: ['[PT]', '|PT|', '(PT)', '[BR]', '(BR)', '|BR|', 'PT:', 'BR:']
        },
        FRANCES: {
            language: 'Francés', emoji: '🇫🇷',
            keywords: ['FRANCAIS', 'FRENCH', 'FRANCES', 'VOSTFR', 'VF', 'CANAL+ FR', 'BEIN FR', 'RMC SPORT'],
            exact_tags: ['[FR]', '|FR|', '(FR)', 'FR:']
        },
        ITALIANO: {
            language: 'Italiano', emoji: '🇮🇹',
            keywords: ['ITALIAN', 'ITALIANO', 'SKY ITALIA', 'DAZN ITALIA', 'SPORTITALIA'],
            exact_tags: ['[IT]', '|IT|', '(IT)', 'IT:']
        },
        ALEMAN: {
            language: 'Alemán', emoji: '🇩🇪',
            keywords: ['GERMAN', 'DEUTSCH', 'ALEMAN', 'SKY GERMANY', 'DAZN GERMANY'],
            exact_tags: ['[DE]', '|DE|', '(DE)', 'DE:']
        },
        ARABE: {
            language: 'Árabe', emoji: '🇸🇦',
            keywords: ['ARABIC', 'ARABE', 'BEIN AR', 'AL JAZEERA', 'MBC'],
            exact_tags: ['[AR]', '|AR|', '(AR)', 'AR:']
        },
        TURCO: {
            language: 'Turco', emoji: '🇹🇷',
            keywords: ['TURKISH', 'TURK', 'TURKIYE', 'TRT', 'BEIN SPORTS TURKEY'],
            exact_tags: ['[TR]', '|TR|', '(TR)', 'TR:']
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // 🌎 EJE A: PATRONES DE REGIÓN GEOGRÁFICA
    // ═══════════════════════════════════════════════════════════════════════════════════
    const REGION_PATTERNS = {
        LATAM: {
            name: 'AMÉRICA LATINA', emoji: '🌎',
            logo_paths: ['/ARGENTINA/', '/MEXICO/', '/COLOMBIA/', '/CHILE/', '/PERU/', '/VENEZUELA/', '/ECUADOR/', '/BOLIVIA/', '/URUGUAY/', '/PARAGUAY/', '/LATINO/', '/LATAM/', '/CENTROAMERICA/'],
            channel_keywords: ['TELEFE', 'TYC SPORTS', 'TN ARGENTINA', 'TELEVISA', 'TV AZTECA', 'CARACOL', 'RCN', 'WIN SPORTS', 'TVN CHILE', 'MEGA', 'CHILEVISION', 'GLOBO', 'SBT', 'BAND', 'SPORTV'],
            prefixes: ['MX', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'UY', 'PY', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'PR', 'CU', 'BR', 'AR', 'LATAM']
        },
        NORTEAMERICA: {
            name: 'NORTEAMÉRICA', emoji: '🦅',
            logo_paths: ['/USA/', '/UNITED_STATES/', '/US/', '/AMERICAN/', '/CANADA/'],
            channel_keywords: ['ESPN', 'FOX SPORTS', 'NBC SPORTS', 'CBS SPORTS', 'NFL NETWORK', 'NBA TV', 'MLB NETWORK', 'CNN', 'FOX NEWS', 'MSNBC', 'CNBC', 'TELEMUNDO', 'UNIVISION', 'NBC UNIVERSO', 'HBO', 'SHOWTIME', 'STARZ'],
            prefixes: ['US', 'CA', 'USA']
        },
        EUROPA: {
            name: 'EUROPA', emoji: '🌍',
            logo_paths: ['/UK/', '/ENGLAND/', '/GERMANY/', '/FRANCE/', '/ITALY/', '/PORTUGAL/', '/SPAIN/', '/ESPAÑA/', '/NETHERLANDS/', '/BELGIUM/', '/SWITZERLAND/', '/SWEDEN/', '/NORWAY/', '/DENMARK/', '/RUSSIA/', '/UKRAINE/'],
            channel_keywords: ['BBC', 'ITV', 'SKY UK', 'BT SPORT', 'PREMIER LEAGUE', 'ZDF', 'ARD', 'SKY GERMANY', 'TF1', 'CANAL+ FR', 'BEIN FR', 'RAI', 'SKY ITALIA', 'LA 1', 'ANTENA 3', 'MOVISTAR', 'DAZN ESPAÑA', 'RTP', 'SPORT TV'],
            prefixes: ['UK', 'GB', 'DE', 'FR', 'IT', 'PT', 'ES', 'NL', 'BE', 'AT', 'CH', 'PL', 'SE', 'NO', 'DK', 'FI', 'IE', 'GR', 'RU']
        },
        ASIA_ORIENTE_MEDIO: {
            name: 'ASIA / ARABIA', emoji: '🌏',
            logo_paths: ['/ARABIA/', '/MIDDLE_EAST/', '/QATAR/', '/SAUDI/', '/UAE/', '/TURKEY/', '/INDIA/', '/CHINA/', '/JAPAN/', '/KOREA/'],
            channel_keywords: ['AL KASS', 'AL JAZEERA', 'BEIN AR', 'DUBAI TV', 'TRT', 'STAR INDIA', 'CCTV', 'NHK'],
            prefixes: ['AR', 'TR', 'IN', 'PK', 'CN', 'JP', 'KR', 'ID', 'SA', 'AE', 'QA']
        },
        AFRICA: {
            name: 'ÁFRICA', emoji: '🦁',
            logo_paths: ['/AFRICA/', '/SOUTH_AFRICA/', '/NIGERIA/', '/KENYA/'],
            channel_keywords: ['SUPERSPORT', 'SABC', 'CANAL+ AFRIQUE'],
            prefixes: ['ZA', 'NG', 'KE', 'MA', 'EG']
        },
        OCEANIA: {
            name: 'OCEANÍA', emoji: '🦘',
            logo_paths: ['/AUSTRALIA/', '/NEW_ZEALAND/'],
            channel_keywords: ['ABC AUSTRALIA', 'SKY NEWS AU', 'FOX LEAGUE'],
            prefixes: ['AU', 'NZ']
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // 🎭 EJE C: PATRONES DE CATEGORÍA
    // ═══════════════════════════════════════════════════════════════════════════════════
    const CATEGORY_PATTERNS = {
        DEPORTES: {
            name: 'DEPORTES', emoji: '⚽',
            keywords: ['SPORT', 'DEPORTES', 'ESPN', 'BEIN', 'FOX SPORTS', 'SKY SPORTS', 'DAZN', 'EUROSPORT', 'NBA', 'NFL', 'NHL', 'MLB', 'FIFA', 'UEFA', 'FUTBOL', 'PREMIER', 'CHAMPIONS', 'UFC', 'F1']
        },
        CINE: {
            name: 'CINE', emoji: '🎬',
            keywords: ['MOVIE', 'CINE', 'CINEMA', 'FILM', 'PELICULA', 'HBO', 'SHOWTIME', 'STARZ', 'AMC', 'CINEMAX', 'ACTION', 'COMEDY', 'PREMIERE', 'HOLLYWOOD']
        },
        NOTICIAS: {
            name: 'NOTICIAS', emoji: '📰',
            keywords: ['NEWS', 'NOTICIAS', 'CNN', 'FOX NEWS', 'MSNBC', 'BBC NEWS', 'AL JAZEERA', 'DW', 'FRANCE 24', 'RT', 'BLOOMBERG', 'C5N', 'TN']
        },
        INFANTIL: {
            name: 'INFANTIL', emoji: '👶',
            keywords: ['KIDS', 'INFANTIL', 'BABY', 'NICK', 'DISNEY', 'CARTOON', 'BOOMERANG', 'CBEEBIES', 'CLAN', 'ANIMATION']
        },
        MUSICA: {
            name: 'MUSICA', emoji: '🎵',
            keywords: ['MUSIC', 'MUSICA', 'MTV', 'VH1', 'HIT', 'RADIO', 'CONCERT', 'TRACE', 'MEZZO', 'CLUBBING', 'ROCK', 'POP']
        },
        DOCUMENTALES: {
            name: 'DOCUMENTALES', emoji: '📚',
            keywords: ['DOCUMENTARY', 'DOCUMENTALES', 'DISCOVERY', 'NATIONAL GEOGRAPHIC', 'NAT GEO', 'HISTORY', 'ANIMAL PLANET', 'SCIENCE', 'ODISEA', 'ID']
        },
        ENTRETENIMIENTO: {
            name: 'ENTRETENIMIENTO', emoji: '🎭',
            keywords: ['ENTERTAINMENT', 'ENTRETENIMIENTO', 'REALITY', 'LIFESTYLE', 'FOOD', 'E!', 'TLC', 'LIFETIME', 'BRAVO', 'SERIES', 'DRAMA', 'TELENOVELA']
        },
        RELIGION: {
            name: 'RELIGION', emoji: '⛪',
            keywords: ['RELIGION', 'CRISTIANO', 'CATHOLIC', 'CHURCH', 'EWTN', 'TBN', 'ENLACE', 'ISLAMIC', 'JEWISH', 'SHALOM']
        },
        ADULTOS: {
            name: 'ADULTOS', emoji: '🔞',
            keywords: ['ADULT', 'XXX', '+18', 'PLAYBOY', 'PENTHOUSE', 'HUSTLE', 'BRAZZERS', 'VIVID', 'EROTIC']
        },
        GENERALISTA: {
            name: 'GENERALISTA', emoji: '📡',
            keywords: []
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // 📺 EJE D: PATRONES DE CALIDAD
    // ═══════════════════════════════════════════════════════════════════════════════════
    const QUALITY_PATTERNS = {
        'ULTRA HD': { label: 'ULTRA HD', keywords: ['8K', '4K', 'UHD', 'ULTRA HD', '2160P'], priority: 1, icon: QUALITY_ICONS['ULTRA HD'] },
        'FULL HD': { label: 'FULL HD', keywords: ['FHD', 'FULL HD', '1080P', '1080I', '720P', 'HD'], priority: 2, icon: QUALITY_ICONS['FULL HD'] },
        'SD': { label: 'SD', keywords: ['SD', '480P', '480I', '360P', 'LQ', 'LOW'], priority: 3, icon: QUALITY_ICONS['SD'] }
    };

    // ═══════════════════════════════════════════════════════════════════════════════════
    // 🧠 CLASE PRINCIPAL DEL CLASIFICADOR
    // ═══════════════════════════════════════════════════════════════════════════════════
    class APEChannelClassifier {

        constructor() {
            this.version = VERSION;
            this.stats = { total_classified: 0, by_region: {}, by_language: {}, by_category: {}, by_quality: {} };
            console.log(`%c🧠 APE Channel Classifier v${VERSION} - Cargado`, 'color: #10b981; font-weight: bold;');
        }

        classify(channel) {
            const name = (channel.name || channel.tvg_name || channel.title || '').toUpperCase();
            const logo = (channel.logo || channel.tvg_logo || channel.stream_icon || '').toUpperCase();
            const categoryName = (channel.category_name || channel.group || '').toUpperCase();

            const result = {
                region: this._detectGeographicRegion(name, logo, categoryName),
                language: this._detectLanguage(name, categoryName),
                category: this._detectCategory(name, categoryName),
                quality: this._detectQuality(name),
                original: { name: channel.name, logo: channel.logo, category: channel.category_name }
            };

            result.group_title = this._generateGroupTitle(result);
            this._updateStats(result);
            return result;
        }

        /**
         * 🌎 EJE A: Detectar Región Geográfica (Única)
         */
        _detectGeographicRegion(name, logo, categoryName) {
            // 1. Logo Path
            for (const [key, config] of Object.entries(REGION_PATTERNS)) {
                if (config.logo_paths.some(p => logo.includes(p.toUpperCase()))) {
                    return { group: config.name, emoji: config.emoji, confidence: 'logo_path' };
                }
            }
            // 2. Nombres de canales específicos
            for (const [key, config] of Object.entries(REGION_PATTERNS)) {
                if (config.channel_keywords.some(kw => name.includes(kw))) {
                    return { group: config.name, emoji: config.emoji, confidence: 'channel_name' };
                }
            }
            // 3. ISO Prefix
            const prefixMatch = name.match(/[┃\|\]\[]([A-Z]{2})[┃\|\]\[]/);
            if (prefixMatch) {
                const prefix = prefixMatch[1];
                for (const [key, config] of Object.entries(REGION_PATTERNS)) {
                    if (config.prefixes.includes(prefix)) {
                        return { group: config.name, emoji: config.emoji, confidence: 'prefix' };
                    }
                }
            }
            return { group: 'RESTO DEL MUNDO', emoji: '🌎', confidence: 'default' };
        }

        /**
         * 🗣️ EJE B: Detectar Idioma (Independiente)
         */
        _detectLanguage(name, categoryName) {
            const searchText = `${name} ${categoryName}`;
            
            // 1. Tags exactos [ES], |EN|, etc.
            for (const [key, config] of Object.entries(LANGUAGE_PATTERNS)) {
                if (config.exact_tags.some(tag => name.includes(tag))) {
                    return { language: config.language, emoji: config.emoji, confidence: 'exact_tag' };
                }
            }
            // 2. Keywords de idioma
            for (const [key, config] of Object.entries(LANGUAGE_PATTERNS)) {
                if (config.keywords.some(kw => searchText.includes(kw))) {
                    return { language: config.language, emoji: config.emoji, confidence: 'keyword' };
                }
            }
            // Default Original
            return { language: 'ORIGINAL / MIXTO', emoji: '🗣️', confidence: 'default' };
        }

        _detectCategory(name, categoryName) {
            const searchText = `${name} ${categoryName}`;
            for (const [catKey, config] of Object.entries(CATEGORY_PATTERNS)) {
                if (config.keywords.length > 0 && config.keywords.some(kw => searchText.includes(kw))) {
                    return { category: config.name, emoji: config.emoji, confidence: 'keyword' };
                }
            }
            return { category: 'GENERALISTA', emoji: '📡', confidence: 'default' };
        }

        _detectQuality(name) {
            const qualities = Object.entries(QUALITY_PATTERNS).sort((a, b) => a[1].priority - b[1].priority);
            for (const [key, config] of qualities) {
                if (config.keywords.some(kw => name.includes(kw))) {
                    return { quality: config.label, icon: config.icon, confidence: 'keyword' };
                }
            }
            return { quality: 'FULL HD', icon: QUALITY_ICONS['FULL HD'], confidence: 'default' };
        }

        _generateGroupTitle(result) {
            // "🌎 LATAM · 🗣️ ESPAÑOL · ⚽ DEPORTES · ULTRA HD"
            return `${result.region.emoji} ${result.region.group} · ${result.language.emoji || '🗣️'} ${result.language.language} · ${result.category.emoji} ${result.category.category} · ${result.quality.quality}`;
        }

        _updateStats(result) {
            this.stats.total_classified++;
            const r = result.region.group;
            const l = result.language.language;
            const c = result.category.category;
            const q = result.quality.quality;

            this.stats.by_region[r] = (this.stats.by_region[r] || 0) + 1;
            this.stats.by_language[l] = (this.stats.by_language[l] || 0) + 1;
            this.stats.by_category[c] = (this.stats.by_category[c] || 0) + 1;
            this.stats.by_quality[q] = (this.stats.by_quality[q] || 0) + 1;
        }

        getStats() { return this.stats; }
        resetStats() { this.stats = { total_classified: 0, by_region: {}, by_language: {}, by_category: {}, by_quality: {} }; }
        getQualityIcon(quality) { return QUALITY_ICONS[quality] || QUALITY_ICONS['FULL HD']; }
        getQualityIcons() { return { ...QUALITY_ICONS }; }

        classifyBatch(channels) { return channels.map(ch => this.classify(ch)); }
        getBatchSummary(classifiedChannels) {
            const summary = { total: classifiedChannels.length, by_region: {}, by_language: {}, by_category: {}, by_quality: {}, groups: new Set() };
            classifiedChannels.forEach(ch => {
                summary.by_region[ch.region.group] = (summary.by_region[ch.region.group] || 0) + 1;
                summary.by_language[ch.language.language] = (summary.by_language[ch.language.language] || 0) + 1;
                summary.by_category[ch.category.category] = (summary.by_category[ch.category.category] || 0) + 1;
                summary.by_quality[ch.quality.quality] = (summary.by_quality[ch.quality.quality] || 0) + 1;
                summary.groups.add(ch.group_title);
            });
            summary.unique_groups = summary.groups.size;
            summary.groups = Array.from(summary.groups).sort();
            return summary;
        }
    }

    // 🌐 EXPORTAR GLOBALMENTE
    window.APEChannelClassifier = new APEChannelClassifier();
    window.APEChannelClassifierClass = APEChannelClassifier;
})();
