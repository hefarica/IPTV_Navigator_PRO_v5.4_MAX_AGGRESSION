/**
 * ============================================
 * 🚀 VPS Adapter - IPTV Navigator PRO
 * ============================================
 * Reemplaza Cloudflare Workers/R2 con VPS propio
 * Versión: 1.0.0
 * ============================================
 */

class VPSAdapter {
    constructor(config = {}) {
        // ============================================
        // 📋 CONFIGURACIÓN - EDITAR AQUÍ
        // ============================================
        // ✅ Auto-convertir HTTP a HTTPS si está en localStorage
        let baseUrlFromStorage = localStorage.getItem('vps_base_url');
        if (baseUrlFromStorage && baseUrlFromStorage.startsWith('http://')) {
            baseUrlFromStorage = baseUrlFromStorage.replace('http://', 'https://');
            localStorage.setItem('vps_base_url', baseUrlFromStorage);
            console.log('🔄 [VPS Adapter] Convertido HTTP → HTTPS en localStorage');
        }

        this.config = {
            // URL base de tu VPS (IP o dominio)
            // Hetzner CPX11 Ashburn - Configurado 2026-01-12
            // ⚠️ V4.31: VPS_CONFIG tiene prioridad MÁXIMA para bypass de DNS
            baseUrl: config.baseUrl || window.VPS_CONFIG?.DEFAULT_URL || baseUrlFromStorage || 'https://iptv-ape.duckdns.org',

            // Rutas en el VPS (compatible con /var/www/m3u8/)
            paths: {
                listas: config.listasPath || '',  // Raíz: /var/www/m3u8/
                icons: config.iconsPath || '/icons',
                probeResults: config.probeResultsPath || '/probe-results',
                public: config.publicPath || '/public'
            },

            // Timeout para requests (ms)
            timeout: config.timeout || 10000,

            // ✅ HTTPS habilitado por defecto
            useHttps: config.useHttps !== undefined ? config.useHttps : true
        };

        this.isConfigured = !!this.config.baseUrl;

        console.log('🚀 [VPS Adapter] Inicializado:', {
            baseUrl: this.config.baseUrl || '(no configurado)',
            isConfigured: this.isConfigured
        });
    }

    // ============================================
    // 🔧 CONFIGURACIÓN
    // ============================================

    /**
     * Configurar URL del VPS
     */
    configure(baseUrl, options = {}) {
        // Normalizar URL
        let url = baseUrl.trim();

        // Agregar protocolo si falta
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = (options.useHttps ? 'https://' : 'http://') + url;
        }

        // Eliminar barra final
        url = url.replace(/\/$/, '');

        this.config.baseUrl = url;
        this.config.useHttps = url.startsWith('https://');
        this.isConfigured = true;

        // Guardar en localStorage
        localStorage.setItem('vps_base_url', url);

        console.log('✅ [VPS Adapter] Configurado:', url);
        return this;
    }

    /**
     * Obtener URL base
     */
    getBaseUrl() {
        return this.config.baseUrl;
    }

    /**
     * Verificar si está configurado
     */
    isReady() {
        return this.isConfigured && !!this.config.baseUrl;
    }

    // ============================================
    // 🌐 URLs DE RECURSOS
    // ============================================

    /**
     * Obtener URL de una lista M3U8
     */
    getListaUrl(filename) {
        if (!this.isReady()) {
            console.warn('⚠️ [VPS Adapter] No configurado');
            return null;
        }
        return `${this.config.baseUrl}${this.config.paths.listas}/${filename}`;
    }

    /**
     * Obtener URL de un icono
     */
    getIconUrl(filename) {
        if (!this.isReady()) return null;
        return `${this.config.baseUrl}${this.config.paths.icons}/${filename}`;
    }

    /**
     * Obtener URLs de iconos de calidad (Locales para evitar errores SSL)
     */
    getQualityIcons() {
        return {
            'ULTRA HD': 'icons/quality-ultra-hd.svg',
            'FULL HD': 'icons/quality-full-hd.svg',
            'HD': 'icons/quality-hd.svg',
            'SD': 'icons/quality-sd.svg'
        };
    }

    /**
     * Obtener URL de resultados de probe
     */
    getProbeResultsUrl(filename = 'probe_results.csv') {
        if (!this.isReady()) return null;
        return `${this.config.baseUrl}${this.config.paths.probeResults}/${filename}`;
    }

    // ============================================
    // 📡 OPERACIONES DE RED
    // ============================================

    /**
     * Health check del VPS
     */
    async healthCheck() {
        if (!this.isReady()) {
            return { ok: false, error: 'VPS no configurado' };
        }

        try {
            const response = await fetch(`${this.config.baseUrl}/health`, {
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ [VPS] Health check OK:', data);
                return { ok: true, data };
            }

            return { ok: false, error: `HTTP ${response.status}` };
        } catch (err) {
            console.error('❌ [VPS] Health check failed:', err.message);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Cargar lista M3U8 desde el VPS
     */
    async loadLista(filename) {
        const url = this.getListaUrl(filename);
        if (!url) {
            throw new Error('VPS no configurado');
        }

        console.log(`📥 [VPS] Cargando lista: ${filename}`);

        const response = await fetch(url, {
            signal: AbortSignal.timeout(this.config.timeout)
        });

        if (!response.ok) {
            throw new Error(`Error cargando lista: HTTP ${response.status}`);
        }

        const content = await response.text();
        console.log(`✅ [VPS] Lista cargada: ${content.length} bytes`);

        return content;
    }

    /**
     * Cargar resultados de probe desde el VPS
     */
    async loadProbeResults(filename = 'probe_results.csv') {
        const url = this.getProbeResultsUrl(filename);
        if (!url) {
            throw new Error('VPS no configurado');
        }

        console.log(`📥 [VPS] Cargando probe results: ${filename}`);

        const response = await fetch(url, {
            signal: AbortSignal.timeout(this.config.timeout)
        });

        if (!response.ok) {
            throw new Error(`Error cargando probe results: HTTP ${response.status}`);
        }

        const content = await response.text();
        console.log(`✅ [VPS] Probe results cargados: ${content.length} bytes`);

        return this._parseCSV(content);
    }

    /**
     * Parsear CSV a objetos
     */
    _parseCSV(csvContent) {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const results = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx]?.trim().replace(/"/g, '') || '';
            });
            results.push(row);
        }

        return results;
    }

    // ============================================
    // 🔄 COMPATIBILIDAD CON CLOUDFLARE (Legacy)
    // ============================================

    /**
     * Alias para compatibilidad con código existente
     * Reemplaza llamadas a R2_BASE
     */
    get R2_BASE() {
        console.warn('⚠️ [VPS Adapter] R2_BASE es legacy, usar getBaseUrl()');
        return this.config.baseUrl;
    }
}

// ============================================
// 🏗️ INSTANCIA GLOBAL
// ============================================

// Crear instancia global
window.vpsAdapter = new VPSAdapter();

// Exponer para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VPSAdapter;
}

// ============================================
// 🎯 API SIMPLE PARA app.js
// ============================================

/**
 * Función helper para configurar VPS rápidamente
 * Usar desde consola: configureVPS('123.45.67.89')
 */
window.configureVPS = function (baseUrl, options = {}) {
    window.vpsAdapter.configure(baseUrl, options);
    console.log('✅ VPS configurado. Recarga la página para aplicar cambios.');
    return window.vpsAdapter.getBaseUrl();
};

/**
 * Mostrar diálogo de configuración VPS
 */
window.showVPSConfig = function () {
    const currentUrl = window.vpsAdapter.getBaseUrl() || '';

    const newUrl = prompt(
        '🚀 Configurar VPS para IPTV Navigator PRO\n\n' +
        'Introduce la IP o dominio de tu VPS:\n' +
        '(ejemplo: 123.45.67.89 o mi-vps.com)',
        currentUrl
    );

    if (newUrl && newUrl.trim()) {
        window.configureVPS(newUrl.trim());

        if (confirm('✅ VPS configurado!\n\n¿Deseas recargar la página para aplicar los cambios?')) {
            location.reload();
        }
    }
};

console.log('🚀 VPS Adapter cargado. Usa configureVPS("tu-ip") o showVPSConfig() para configurar.');
