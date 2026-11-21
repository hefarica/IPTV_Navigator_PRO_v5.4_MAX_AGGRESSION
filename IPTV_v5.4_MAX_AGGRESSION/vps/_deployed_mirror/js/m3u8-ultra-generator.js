/**
 * ═══════════════════════════════════════════════════════════════════
 * 📝 M3U8 ULTRA GENERATOR v1.0 - Con Headers por Canal
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Generador de listas M3U8 optimizadas con:
 * - Headers HTTP embebidos (EXTHTTP)
 * - Opciones VLC (EXTVLCOPT)
 * - Propiedades Kodi (KODIPROP)
 * - Metadata de calidad
 */

class M3U8UltraGenerator {
    constructor() {
        this.headersMatrix = window.ULTRA_HEADERS_MATRIX;
        this.selectedLevel = 3; // Default: Pro
        this.enabledOptimizations = {
            proStreaming: false,
            ottNavigator: false,
            includeHeaders: false
        };
        this.selectedHeaders = new Set();
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎯 GENERAR M3U8 COMPLETO
     * ═══════════════════════════════════════════════════════════════
     */
    generateM3U8(channels, server, options = {}) {
        console.log(`[M3U8-ULTRA] 🚀 Generando lista con ${channels.length} canales...`);

        // Configuración
        this.selectedLevel = options.level || this.selectedLevel;
        this.enabledOptimizations = { ...this.enabledOptimizations, ...options.optimizations };
        this.selectedHeaders = new Set(options.selectedHeaders || []);

        let content = '';

        // Header M3U8
        content += this.generateHeader();

        // Procesar cada canal
        channels.forEach((channel, index) => {
            try {
                content += this.generateChannelEntry(channel, server, index);
            } catch (error) {
                console.error(`[M3U8-ULTRA] ❌ Error en canal ${channel.name}:`, error);
            }
        });

        console.log(`[M3U8-ULTRA] ✅ Lista generada: ${content.length} caracteres`);

        return content;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📋 GENERAR HEADER M3U8
     * ═══════════════════════════════════════════════════════════════
     */
    generateHeader() {
        let header = '#EXTM3U\n';

        // Metadata adicional
        header += `#PLAYLIST:IPTV Navigator PRO - Ultra Optimized\n`;
        header += `#EXTGENERATED:${new Date().toISOString()}\n`;
        header += `#EXTLEVEL:${this.selectedLevel}\n`;
        header += `#EXTOPTIMIZATIONS:${Object.keys(this.enabledOptimizations).filter(k => this.enabledOptimizations[k]).join(',')}\n`;
        header += '\n';

        return header;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📺 GENERAR ENTRADA DE CANAL
     * ═══════════════════════════════════════════════════════════════
     */
    generateChannelEntry(channel, server, index) {
        // ═══════════════════════════════════════════════════════════════
        // RFC 8216 ESTRICTO: EXTINF debe ir INMEDIATAMENTE antes de URL
        // Toda configuración adicional va ANTES de EXTINF
        // ═══════════════════════════════════════════════════════════════
        let entry = '';

        // 1. Headers HTTP (ANTES de EXTINF)
        if (this.enabledOptimizations.includeHeaders && this.selectedHeaders.size > 0) {
            entry += this.generateHTTPHeaders(channel, server);
        }

        // 2. Headers VLC (ANTES de EXTINF)
        if (this.enabledOptimizations.includeHeaders) {
            entry += this.generateVLCOPT(channel, server);
        }

        // 3. Headers Kodi (ANTES de EXTINF)
        if (this.enabledOptimizations.proStreaming) {
            entry += this.generateKODIPROP(channel, server);
        }

        // 4. EXTINF - JUSTO ANTES de URL (RFC 8216)
        entry += this.generateEXTINF(channel, index);

        // 5. URL del stream - INMEDIATAMENTE después de EXTINF
        entry += this.generateStreamURL(channel, server);
        entry += '\n';

        return entry;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🌐 GENERAR HEADERS HTTP (EXTHTTP)
     * ═══════════════════════════════════════════════════════════════
     */
    generateHTTPHeaders(channel, server) {
        const headers = {};

        if (!this.headersMatrix) {
            console.warn('[M3U8-ULTRA] Headers matrix not available');
            return '';
        }

        // Iterar sobre headers seleccionados
        this.selectedHeaders.forEach(headerName => {
            const headerConfig = this.headersMatrix.headers[headerName];
            if (!headerConfig) return;

            const levelConfig = headerConfig.levels[this.selectedLevel];
            if (!levelConfig) return;

            let value = levelConfig.value;

            // Si es función generadora, ejecutarla
            if (typeof levelConfig.generator === 'function') {
                value = levelConfig.generator(channel, server, headers);
            }

            // Si es array (rotación), tomar primer valor
            if (Array.isArray(value)) {
                value = value[0];
            }

            // Procesar placeholders
            value = this.processPlaceholders(value, channel, server);

            if (value && value !== "") {
                headers[headerName] = value;
            }
        });

        // Formato EXTHTTP (JSON)
        if (Object.keys(headers).length > 0) {
            return `#EXTHTTP:${JSON.stringify(headers)}\n`;
        }

        return '';
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎥 GENERAR EXTVLCOPT
     * ═══════════════════════════════════════════════════════════════
     */
    generateVLCOPT(channel, server) {
        let opts = '';

        // Headers críticos para VLC
        const vlcHeaders = ['User-Agent', 'Referer', 'Origin'];

        vlcHeaders.forEach(headerName => {
            if (this.selectedHeaders.has(headerName) && this.headersMatrix) {
                const headerConfig = this.headersMatrix.headers[headerName];
                if (!headerConfig) return;

                const levelConfig = headerConfig.levels[this.selectedLevel];
                if (!levelConfig) return;

                let value = levelConfig.value;

                if (typeof levelConfig.generator === 'function') {
                    value = levelConfig.generator(channel, server, {});
                }

                if (Array.isArray(value)) {
                    value = value[0];
                }

                value = this.processPlaceholders(value, channel, server);

                if (value && value !== "") {
                    const paramName = headerName.toLowerCase().replace(/-/g, '');
                    opts += `#EXTVLCOPT:http-${paramName}=${value}\n`;
                }
            }
        });

        // ⭐ CUSTOM HEADERS desde Profile Manager
        if (window.ProfileManagerV9 && typeof window.ProfileManagerV9.getActiveCustomHeaders === 'function') {
            try {
                const customHeaders = window.ProfileManagerV9.getActiveCustomHeaders();

                if (customHeaders && customHeaders.length > 0) {
                    customHeaders.forEach(header => {
                        const name = (header.name || '').trim();
                        const value = this.processPlaceholders(header.value || '', channel, server);

                        if (name && value) {
                            // Formato según tipo de header
                            if (name.toLowerCase() === 'user-agent') {
                                opts += `#EXTVLCOPT:http-user-agent=${value}\n`;
                            } else if (name.toLowerCase() === 'referer') {
                                opts += `#EXTVLCOPT:http-referrer=${value}\n`;
                            } else if (name.toLowerCase().startsWith('http-')) {
                                opts += `#EXTVLCOPT:${name}=${value}\n`;
                            } else {
                                // Header genérico
                                opts += `#EXTVLCOPT:http-header=${name}: ${value}\n`;
                            }
                        }
                    });

                    console.log(`[M3U8-ULTRA] ✅ ${customHeaders.length} custom headers agregados`);
                }
            } catch (error) {
                console.warn('[M3U8-ULTRA] ⚠️ Error al obtener custom headers:', error);
            }
        }

        // Opciones de buffer para VLC
        if (this.enabledOptimizations.proStreaming) {
            const bufferValues = {
                1: 3000,   // Normal: 3s
                2: 5000,   // Plus: 5s
                3: 10000,  // Pro: 10s
                4: 20000,  // Extreme: 20s
                5: 30000   // ULTRA: 30s
            };

            opts += `#EXTVLCOPT:network-caching=${bufferValues[this.selectedLevel]}\n`;
            opts += `#EXTVLCOPT:file-caching=3000\n`;
            opts += `#EXTVLCOPT:live-caching=${bufferValues[this.selectedLevel]}\n`;
        }

        return opts;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🎮 GENERAR KODIPROP
     * ═══════════════════════════════════════════════════════════════
     */
    generateKODIPROP(channel, server) {
        let props = '';

        // Detectar tipo de input
        const inputType = this.detectInputType(channel, server);
        props += `#KODIPROP:inputstream=${inputType}\n`;

        // Propiedades adaptativas
        if (inputType === 'inputstream.adaptive') {
            props += `#KODIPROP:inputstream.adaptive.manifest_type=hls\n`;
            props += `#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive\n`;

            // Buffer según nivel
            const bufferValues = {
                1: 10,   // Normal: 10s
                2: 20,   // Plus: 20s
                3: 30,   // Pro: 30s
                4: 60,   // Extreme: 60s
                5: 120   // ULTRA: 120s
            };

            props += `#KODIPROP:inputstream.adaptive.min_bandwidth=0\n`;
            props += `#KODIPROP:inputstream.adaptive.max_bandwidth=0\n`;
            props += `#KODIPROP:inputstream.adaptive.buffer_duration=${bufferValues[this.selectedLevel]}\n`;
        }

        return props;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📝 GENERAR EXTINF
     * ═══════════════════════════════════════════════════════════════
     */
    generateEXTINF(channel, index) {
        let extinf = '#EXTINF:-1';

        // TVG attributes
        if (channel.stream_id) extinf += ` tvg-id="${channel.stream_id}"`;
        if (channel.name) extinf += ` tvg-name="${this.escapeAttr(channel.name)}"`;
        if (channel.stream_icon) extinf += ` tvg-logo="${channel.stream_icon}"`;
        // Dynamic Group-Title Hierarchy
        let groupTitleValue = null;
        if (window.GroupTitleBuilder) {
            groupTitleValue = window.GroupTitleBuilder.buildExport(channel);
        }

        const finalGroup = groupTitleValue || channel.category_name || channel.group || 'GENERAL';
        extinf += ` group-title="${this.escapeAttr(finalGroup)}"`;

        // Metadata de calidad
        if (channel.heuristics) {
            if (channel.heuristics.qualityTier) {
                extinf += ` quality="${channel.heuristics.qualityTier}"`;
            }
            if (channel.heuristics.bitrate) {
                extinf += ` bitrate="${channel.heuristics.bitrate}"`;
            }
            if (channel.heuristics.codec) {
                extinf += ` codec="${channel.heuristics.codec}"`;
            }
        }
        if (channel.resolution) {
            extinf += ` resolution="${channel.resolution}"`;
        }

        // Metadata de optimización
        extinf += ` opt-level="${this.selectedLevel}"`;
        extinf += ` opt-profile="${this.getLevelName(this.selectedLevel)}"`;

        // Nombre del canal
        extinf += `,${channel.name || 'Unknown'}\n`;

        return extinf;
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔗 GENERAR URL DEL STREAM
     * ═══════════════════════════════════════════════════════════════
     */
    generateStreamURL(channel, server) {
        let url = '';

        // Construir URL según tipo de servidor
        if (server.type === 'xui' && server.baseUrl && server.username && server.password) {
            // Xtream Codes API
            const baseUrl = server.baseUrl.replace('/player_api.php', '');
            url = `${baseUrl}/${server.username}/${server.password}/${channel.stream_id}`;

            // Extensión según tipo
            if (channel.stream_type === 'live') {
                url += `.m3u8`;
            } else if (channel.stream_type === 'movie') {
                url += `.mp4`;
            } else {
                url += `.ts`;
            }

        } else if (channel.stream_url) {
            // URL directa
            url = channel.stream_url;

        } else {
            console.warn(`[M3U8-ULTRA] ⚠️ No se pudo construir URL para ${channel.name}`);
            url = '#';
        }

        // Agregar parámetros de optimización si es necesario
        if (this.enabledOptimizations.ottNavigator) {
            url = this.addOTTParams(url, channel);
        }

        return this.preferHttps(url);
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 🔧 UTILIDADES
     * ═══════════════════════════════════════════════════════════════
     */

    processPlaceholders(value, channel, server) {
        if (typeof value !== 'string') return value;
        if (!server.baseUrl) return value;

        try {
            const url = new URL(server.baseUrl);
            return value
                .replace('{serverUrl}', server.baseUrl || '')
                .replace('{serverOrigin}', url.origin)
                .replace('{serverHost}', url.hostname)
                .replace('{port}', url.port || (url.protocol === 'https:' ? '443' : '80'))
                .replace('{channelId}', channel.stream_id || '')
                .replace('{channelName}', channel.name || '')
                .replace('{random}', Math.random().toString(36).substr(2, 12));
        } catch (e) {
            return value;
        }
    }

    escapeAttr(str) {
        return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    // 🔒 HTTPS PRIORITY: Upgrade HTTP → HTTPS (excepto localhost)
    preferHttps(url) {
        if (!url || typeof url !== 'string') return url;
        if (url.startsWith('https://')) return url;
        if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1') || url.startsWith('http://0.0.0.0')) return url;
        if (url.startsWith('http://')) return url.replace(/^http:\/\//, 'https://');
        return url;
    }

    detectInputType(channel, server) {
        const url = channel.stream_url || server.baseUrl || '';

        if (url.includes('.m3u8') || url.includes('/hls/')) {
            return 'inputstream.adaptive';
        } else if (url.includes('.mpd')) {
            return 'inputstream.adaptive';
        } else if (url.includes('rtmp://')) {
            return 'inputstream.rtmp';
        } else {
            return 'inputstream.ffmpegdirect';
        }
    }

    addOTTParams(url, channel) {
        const separator = url.includes('?') ? '&' : '?';

        // Parámetros OTT Navigator
        url += `${separator}ottnavigator=1`;
        url += `&catchup=xc`;
        url += `&timeshift=7`;

        return url;
    }

    getLevelName(level) {
        const names = {
            1: 'Normal',
            2: 'Plus',
            3: 'Pro',
            4: 'Extreme',
            5: 'ULTRA'
        };
        return names[level] || 'Unknown';
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📥 EXPORTAR CONFIGURACIÓN
     * ═══════════════════════════════════════════════════════════════
     */
    exportConfig() {
        return {
            level: this.selectedLevel,
            optimizations: this.enabledOptimizations,
            selectedHeaders: Array.from(this.selectedHeaders),
            version: "1.0",
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * ═══════════════════════════════════════════════════════════════
     * 📤 IMPORTAR CONFIGURACIÓN
     * ═══════════════════════════════════════════════════════════════
     */
    importConfig(config) {
        if (config.level) this.selectedLevel = config.level;
        if (config.optimizations) this.enabledOptimizations = config.optimizations;
        if (config.selectedHeaders) this.selectedHeaders = new Set(config.selectedHeaders);
        console.log('[M3U8-ULTRA] ✅ Configuración importada');
    }
}

// Instancia global
window.m3u8UltraGenerator = new M3U8UltraGenerator();

console.log('✅ [M3U8UltraGenerator] v1.0 loaded');
