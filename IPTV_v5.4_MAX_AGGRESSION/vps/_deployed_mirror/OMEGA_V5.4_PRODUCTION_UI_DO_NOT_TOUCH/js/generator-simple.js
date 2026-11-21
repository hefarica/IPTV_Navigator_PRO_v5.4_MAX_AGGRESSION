/**
 * ═══════════════════════════════════════════════════════════════════
 * 📦 GENERATOR SIMPLE V1.0 - Fallback Sin Worker
 * Generador M3U8 síncrono para emergencias
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Este módulo es el PLAN B cuando el Web Worker no funciona
 * (por ejemplo, al abrir desde file:// en lugar de http://).
 * 
 * Genera M3U8 directamente en el hilo principal.
 * Funciona pero puede congelar la UI con listas grandes.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const GeneratorSimple = {

        version: '1.0.0',

        // ═══════════════════════════════════════════════════════════════
        // 🔧 CONFIGURATION
        // ═══════════════════════════════════════════════════════════════

        config: {
            defaultUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            batchSize: 500,
            previewLimit: 50000
        },

        // ═══════════════════════════════════════════════════════════════
        // 🎬 GENERATION
        // ═══════════════════════════════════════════════════════════════

        /**
         * Generar M3U8 de forma síncrona (sin Worker)
         */
        generate() {
            console.group('[GeneratorSimple] 🚀 Iniciando generación síncrona');
            const startTime = performance.now();

            // 1. Obtener canales
            const channels = this._getChannels();
            if (!channels || channels.length === 0) {
                console.error('❌ No hay canales cargados');
                alert('No hay canales cargados. Conecta un servidor primero.');
                console.groupEnd();
                return null;
            }

            console.log(`📊 Procesando ${channels.length} canales...`);

            // 2. Obtener configuración
            const config = this._getConfig();
            console.log('📝 Config:', config);

            // 3. Construir M3U8
            const lines = ['#EXTM3U'];
            lines.push('#EXTENC: UTF-8');
            lines.push('#PLAYLIST: IPTV Navigator PRO Generated');
            lines.push('');

            for (let i = 0; i < channels.length; i++) {
                const channel = channels[i];

                // Calcular nivel APE simple
                const level = this._calculateLevel(channel, config);

                // Generar headers
                const headers = this._generateHeaders(level, channel, config);

                // Buffer tags
                if (config.includeBuffer) {
                    lines.push('#KODIPROP:inputstream.adaptive.min_buffer=20');
                    lines.push('#KODIPROP:inputstream.adaptive.max_buffer=20');
                    lines.push('#EXTVLCOPT:network-caching=20000');
                }

                // VLC-style headers
                for (const [key, value] of Object.entries(headers)) {
                    if (value) {
                        lines.push(`#EXTVLCOPT:http-${key.toLowerCase()}=${value}`);
                    }
                }

                // EXTHTTP (JSON)
                lines.push(`#EXTHTTP:${JSON.stringify(headers)}`);

                // EXTINF
                const name = channel.name || 'Sin Nombre';
                const logo = channel.logo || channel.stream_icon || '';
                const group = channel.group || channel.category_name || 'General';
                const tvgId = channel.tvg_id || channel.epg_channel_id || '';

                lines.push(`#EXTINF:-1 tvg-id="${this._escapeAttr(tvgId)}" tvg-logo="${this._escapeAttr(logo)}" group-title="${this._escapeAttr(group)}",${name}`);

                // URL
                lines.push(channel.url || this._buildUrl(channel));
                lines.push(''); // Línea vacía entre canales

                // Progreso
                if ((i + 1) % this.config.batchSize === 0) {
                    const percent = Math.round(((i + 1) / channels.length) * 100);
                    console.log(`⏳ Progreso: ${percent}% (${i + 1}/${channels.length})`);
                }
            }

            // 4. Unir y guardar
            const content = lines.join('\n');
            const duration = Math.round(performance.now() - startTime);

            console.log(`✅ Generación completada en ${duration}ms`);
            console.log(`📦 Tamaño: ${(content.length / 1024 / 1024).toFixed(2)} MB`);
            console.groupEnd();

            // 5. Actualizar UI
            this._updateUI(content, {
                total: channels.length,
                time: duration,
                size: content.length
            });

            // 6. Guardar para descarga
            this._saveForDownload(content);

            return content;
        },

        // ═══════════════════════════════════════════════════════════════
        // 🔧 INTERNAL METHODS
        // ═══════════════════════════════════════════════════════════════

        _getChannels() {
            if (window.app && window.app.state) {
                const state = window.app.state;

                // Intentar canales filtrados primero
                if (typeof window.app.getFilteredChannels === 'function') {
                    const filtered = window.app.getFilteredChannels();
                    if (filtered && filtered.length > 0) return filtered;
                }

                // Fallback a channelsMaster o channels
                if (state.channelsMaster && state.channelsMaster.length > 0) {
                    return state.channelsMaster;
                }
                if (state.channels && state.channels.length > 0) {
                    return state.channels;
                }
            }

            // GlobalState fallback
            if (window.GlobalState && window.GlobalState.sourceData) {
                return window.GlobalState.sourceData;
            }

            return [];
        },

        _getConfig() {
            // Intentar leer desde localStorage
            let apeConfig = {};
            try {
                const stored = localStorage.getItem('APE');
                if (stored) apeConfig = JSON.parse(stored);
            } catch (e) {
                console.warn('⚠️ No se pudo leer APE config:', e);
            }

            return {
                mode: apeConfig.mode || 'auto',
                manualLevel: apeConfig.manualLevel || 3,
                autoReferer: apeConfig.autoReferer !== false,
                includeBuffer: apeConfig.includeBuffer !== false,
                userAgent: apeConfig.userAgent || this.config.defaultUserAgent
            };
        },

        _calculateLevel(channel, config) {
            if (config.mode === 'manual') {
                return config.manualLevel;
            }

            // Scoring automático simplificado
            let score = 0;
            const name = (channel.name || '').toUpperCase();
            const url = (channel.url || '').toLowerCase();
            const group = (channel.group || '').toUpperCase();

            // Factor Resolución
            if (name.includes('4K') || name.includes('UHD') || name.includes('HEVC')) score += 30;
            else if (name.includes('FHD') || name.includes('1080')) score += 15;
            else if (name.includes('HD') || name.includes('720')) score += 5;

            // Factor CDN
            if (url.includes('akamai') || url.includes('.akamaized.')) score += 50;
            else if (url.includes('cloudflare')) score += 40;
            else if (url.includes('cloudfront')) score += 30;
            else if (url.includes('fastly')) score += 30;

            // Factor Auth
            if (url.includes('token=') || url.includes('wmsauth') || url.includes('key=')) score += 25;
            if (url.includes('hdnea') || url.includes('hdntl')) score += 20;

            // Factor Categoría
            if (group.includes('SPORT') || group.includes('DEPORTE') || group.includes('PPV')) score += 20;

            // Asignar nivel
            if (score >= 80) return 5;
            if (score >= 60) return 4;
            if (score >= 40) return 3;
            if (score >= 20) return 2;
            return 1;
        },

        _generateHeaders(level, channel, config) {
            const headers = {
                'User-Agent': config.userAgent,
                'Connection': 'keep-alive',
                'Accept': '*/*'
            };

            if (level < 2) return headers;

            // Nivel 2+: Referer/Origin
            if (config.autoReferer && channel.url) {
                try {
                    const url = new URL(channel.url);
                    headers['Referer'] = `${url.protocol}//${url.hostname}/`;
                    headers['Origin'] = `${url.protocol}//${url.hostname}`;
                } catch (e) {
                    // URL inválida
                }
            }
            headers['Accept-Language'] = 'en-US,en;q=0.9,es;q=0.8';

            if (level < 3) return headers;

            // Nivel 3+
            headers['Accept-Encoding'] = 'gzip, deflate';
            headers['Cache-Control'] = 'no-cache';

            if (level < 4) return headers;

            // Nivel 4+: Client Hints
            headers['Sec-CH-UA'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
            headers['Sec-CH-UA-Mobile'] = '?0';
            headers['Sec-CH-UA-Platform'] = '"Windows"';
            headers['Sec-Fetch-Dest'] = 'empty';
            headers['Sec-Fetch-Mode'] = 'cors';

            if (level < 5) return headers;

            // Nivel 5: Ultra
            headers['Accept-Encoding'] = 'gzip, deflate, br, zstd';
            headers['Priority'] = 'u=1, i';
            headers['DNT'] = '1';

            return headers;
        },

        _buildUrl(channel) {
            if (!window.app || !window.app.state || !window.app.state.currentServer) {
                return channel.direct_source || '#';
            }

            const server = window.app.state.currentServer;
            if (!server.baseUrl || !server.username || !channel.stream_id) {
                return channel.direct_source || '#';
            }

            const cleanBase = server.baseUrl.replace(/\/player_api\.php$/, '');
            const ext = window.app.state.streamFormat || 'ts';
            return `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.${ext}`;
        },

        _escapeAttr(text) {
            if (!text) return '';
            return String(text)
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\\/g, '\\\\');
        },

        _updateUI(content, stats) {
            // Actualizar textarea de preview
            const outputArea =
                document.getElementById('m3u8-output-area') ||
                document.getElementById('m3u8PreviewGen') ||
                document.getElementById('m3u8Preview');

            if (outputArea) {
                const preview = content.length > this.config.previewLimit
                    ? content.substring(0, this.config.previewLimit) + '\n\n... [VISTA PREVIA LIMITADA - DESCARGA EL ARCHIVO COMPLETO]'
                    : content;
                outputArea.value = preview;
            }

            // Mostrar alerta de completado
            alert(`✅ Generación Completa\n\nCanales: ${stats.total.toLocaleString()}\nTiempo: ${(stats.time / 1000).toFixed(2)}s\nTamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        },

        _saveForDownload(content) {
            // Guardar en variable global para descarga
            window.generatedM3U8Blob = content;

            if (window.app && window.app.state) {
                window.app.state.generatedM3U8 = content;
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // 📥 DOWNLOAD
        // ═══════════════════════════════════════════════════════════════

        /**
         * Descargar el M3U8 generado
         */
        download() {
            const content = window.generatedM3U8Blob || window.app?.state?.generatedM3U8;

            if (!content || content.length === 0) {
                alert('No hay contenido para descargar. Genera primero.');
                return;
            }

            const blob = new Blob([content], { type: 'audio/x-mpegurl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');

            a.href = url;
            a.download = `iptv_navigator_${new Date().toISOString().slice(0, 10)}.m3u8`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);
            console.log('[GeneratorSimple] 📥 Descarga iniciada');
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 🌐 GLOBAL EXPORT & BINDING
    // ═══════════════════════════════════════════════════════════════════

    window.GeneratorSimple = GeneratorSimple;

    // Auto-bind al botón si GeneratorBridge falla
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            // Verificar si Worker funciona
            if (window.generatorBridge) {
                const status = window.generatorBridge.getStatus();

                if (!status.workerActive || status.fallbackMode) {
                    console.warn('[GeneratorSimple] ⚠️ Worker no activo. Habilitando modo simple.');

                    // Sobrescribir botón
                    const btn =
                        document.getElementById('btn-generate-m3u8') ||
                        document.getElementById('btnGenerateM3U8Pro') ||
                        document.getElementById('btn-start-generate');

                    if (btn) {
                        btn.onclick = (e) => {
                            e.preventDefault();
                            GeneratorSimple.generate();
                        };
                        console.log('[GeneratorSimple] ✅ Botón vinculado a modo simple');
                    }
                }
            }
        }, 1000);
    });

    console.log('[GeneratorSimple] 📦 v1.0.0 cargado (fallback sin Worker)');

})();
