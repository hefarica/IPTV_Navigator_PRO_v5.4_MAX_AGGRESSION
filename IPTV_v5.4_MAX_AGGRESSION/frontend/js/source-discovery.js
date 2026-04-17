/**
 * SOURCE DISCOVERY & MANAGEMENT MODULE
 * Sistema inteligente de descubrimiento automático de endpoints
 * para fuentes externas (GitHub, m3u4u, CDNs, APIs públicas)
 */

// Patrones comunes de endpoints a probar
const COMMON_ENDPOINT_PATTERNS = [
    '/iptv/channels.json',
    '/channels.json',
    '/api/channels.json',
    '/iptv/index.m3u8',
    '/playlist.m3u8',
    '/index.m3u8',
    '/iptv/index.m3u',
    '/playlist.m3u',
    '/index.m3u',
    '/epg/guides.json',
    '/epg/index.json',
    '/epg.json',
    '/logos/',
    '/icons/',
    '/images/',
    '/countries/',
    '/api/countries.json'
];

/**
 * SourceDiscovery - Descubre automáticamente endpoints útiles
 */
class SourceDiscovery {
    constructor() {
        this.timeout = 5000; // 5s timeout por endpoint
        this.maxConcurrent = 3; // Máximo 3 peticiones paralelas
    }

    /**
     * Prueba si un endpoint existe (HEAD request)
     */
    async probe(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);
            return {
                exists: response.ok,
                status: response.status,
                contentType: response.headers.get('content-type'),
                contentLength: response.headers.get('content-length'),
                lastModified: response.headers.get('last-modified'),
                etag: response.headers.get('etag')
            };
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`Timeout probing: ${url}`);
            }
            return { exists: false, error: error.message };
        }
    }

    /**
     * Clasifica el tipo de endpoint según la URL y content-type
     */
    classifyEndpoint(path, probeResult) {
        const url = path.toLowerCase();
        const contentType = (probeResult.contentType || '').toLowerCase();

        if (url.includes('channel') && url.endsWith('.json')) return 'channels';
        if (url.endsWith('.m3u') || url.endsWith('.m3u8')) return 'm3u';
        if (url.includes('epg') || url.includes('guide')) return 'epg';
        if (url.includes('logo') || url.includes('icon') || url.includes('image')) return 'logos';
        if (url.includes('countr')) return 'countries';

        if (contentType.includes('json')) return 'json';
        if (contentType.includes('xml')) return 'epg';

        return 'other';
    }

    /**
     * Descubre todos los endpoints disponibles en un dominio
     */
    async discover(baseUrl, customPatterns = []) {
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const allPatterns = [...COMMON_ENDPOINT_PATTERNS, ...customPatterns];

        const discovered = {
            base: cleanBase,
            timestamp: Date.now(),
            endpoints: {
                channels: [],
                m3u: [],
                epg: [],
                logos: [],
                countries: [],
                json: [],
                other: []
            },
            stats: {
                total: allPatterns.length,
                found: 0,
                failed: 0
            }
        };

        console.log(`🔍 Discovering endpoints for: ${cleanBase}`);

        // Procesar en batches para no saturar
        for (let i = 0; i < allPatterns.length; i += this.maxConcurrent) {
            const batch = allPatterns.slice(i, i + this.maxConcurrent);

            const promises = batch.map(async (pattern) => {
                const fullUrl = cleanBase + pattern;
                const result = await this.probe(fullUrl);

                if (result.exists) {
                    const type = this.classifyEndpoint(pattern, result);
                    discovered.endpoints[type].push({
                        url: fullUrl,
                        pattern,
                        ...result
                    });
                    discovered.stats.found++;
                    console.log(`✅ Found: ${type} -> ${fullUrl}`);
                } else {
                    discovered.stats.failed++;
                }

                return result;
            });

            await Promise.all(promises);

            // Pequeña pausa entre batches
            if (i + this.maxConcurrent < allPatterns.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        console.log(`📊 Discovery complete: ${discovered.stats.found}/${discovered.stats.total} endpoints found`);

        return discovered;
    }

    /**
     * Analiza una fuente y sugiere el mejor conjunto de endpoints
     */
    async analyze(baseUrl) {
        const discovered = await this.discover(baseUrl);

        const analysis = {
            recommended: {},
            alternatives: {},
            warnings: []
        };

        // Recomendar el mejor endpoint de cada tipo
        if (discovered.endpoints.channels.length > 0) {
            analysis.recommended.channels = discovered.endpoints.channels[0].url;
            if (discovered.endpoints.channels.length > 1) {
                analysis.alternatives.channels = discovered.endpoints.channels.slice(1).map(e => e.url);
            }
        } else {
            analysis.warnings.push('No se encontró endpoint de canales');
        }

        if (discovered.endpoints.epg.length > 0) {
            analysis.recommended.epg = discovered.endpoints.epg[0].url;
        }

        if (discovered.endpoints.m3u.length > 0) {
            analysis.recommended.m3u = discovered.endpoints.m3u[0].url;
        }

        if (discovered.endpoints.logos.length > 0) {
            analysis.recommended.logos = discovered.endpoints.logos[0].url;
        }

        return { discovered, analysis };
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.SourceDiscovery = new SourceDiscovery();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SourceDiscovery;
}
