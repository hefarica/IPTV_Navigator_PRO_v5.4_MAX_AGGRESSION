// ═══════════════════════════════════════════════════════════════════════════
// M3U8 REDIRECT TRANSFORMER - APE v15.1 FIXED
// ═══════════════════════════════════════════════════════════════════════════
class M3U8RedirectTransformer {
    constructor(options = {}) {
        this.redirectorUrl = options.redirectorUrl || 'https://api.ape-tv.net';
        this.stats = {
            totalLines: 0,
            headerLines: 0,
            extinifLines: 0,
            urlsTransformed: 0,
            preservedLines: 0,
            originalSize: 0,
            transformedSize: 0,
            errors: []
        };
    }

    extractChannelId(extinf_line, position = 0) {
        try {
            const tvgIdMatch = extinf_line.match(/tvg-id="([^"]+)"/);
            if (tvgIdMatch && tvgIdMatch[1].trim()) {
                return this._sanitizeId(tvgIdMatch[1]);
            }

            const tvgNameMatch = extinf_line.match(/tvg-name="([^"]+)"/);
            if (tvgNameMatch && tvgNameMatch[1].trim()) {
                return this._sanitizeId(tvgNameMatch[1]);
            }

            const groupMatch = extinf_line.match(/group-title="([^"]+)"/);
            if (groupMatch && groupMatch[1].trim()) {
                return this._sanitizeId(groupMatch[1]);
            }

            const nameMatch = extinf_line.match(/,(.+)$/);
            if (nameMatch) {
                return this._sanitizeId(nameMatch[1].trim());
            }

            return `ch_${position}`;
        } catch (error) {
            console.warn(`⚠️ Error extracting channel ID: ${error.message}`);
            return `ch_${position}`;
        }
    }

    _sanitizeId(id) {
        return id
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[àáäâ]/g, 'a')
            .replace(/[èéëê]/g, 'e')
            .replace(/[ìíïî]/g, 'i')
            .replace(/[òóöô]/g, 'o')
            .replace(/[ùúüû]/g, 'u')
            .replace(/[ñ]/g, 'n')
            .replace(/[^a-z0-9_-]/g, '')
            .substring(0, 50);
    }

    isStreamURL(line) {
        const stripped = line.trim();
        return (
            stripped &&
            !stripped.startsWith('#') &&
            !stripped.startsWith(';') &&
            (stripped.startsWith('http://') ||
                stripped.startsWith('https://') ||
                stripped.startsWith('rtmp://') ||
                stripped.startsWith('rtmps://'))
        );
    }

    transformURL(originalUrl, channelId) {
        try {
            if (!originalUrl || typeof originalUrl !== 'string') {
                throw new Error('Invalid URL format');
            }

            // ✅ CRITICAL FIX: Single encoding path (NO double encoding)
            // Step 1: URL → UTF-8 bytes → Base64
            const base64Url = btoa(unescape(encodeURIComponent(originalUrl)));

            // Step 2: Base64 → URL-encoded for query param (single time only)
            const safeBase64 = encodeURIComponent(base64Url);

            // Step 3: Build final redirect URL
            const redirectUrl =
                `${this.redirectorUrl}/stream?` +
                `channel_id=${encodeURIComponent(channelId)}&` +
                `original_url=${safeBase64}`;

            return redirectUrl;
        } catch (error) {
            console.error(`❌ URL transform error for [${channelId}]:`, error.message);
            this.stats.errors.push({
                type: 'url_transform',
                url: originalUrl,
                error: error.message
            });
            return null;
        }
    }

    transform(m3uContent) {
        if (!m3uContent || typeof m3uContent !== 'string') {
            return {
                output: '',
                stats: { ...this.stats, error: 'Invalid M3U content' },
                success: false
            };
        }

        console.log('🔄 [M3U8Transform] Iniciando transformación APE v15.1...');

        const lines = m3uContent.split('\n');
        const output = [];

        let currentExtinf = null;
        let currentChannelId = 'unknown';
        let urlPosition = 0;

        this.stats.totalLines = lines.length;
        this.stats.originalSize = m3uContent.length;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const stripped = line.trim();

            // Headers and metadata
            if (stripped.startsWith('#')) {
                output.push(line);

                if (stripped.startsWith('#EXTM3U') || stripped.startsWith('#EXT-X-')) {
                    this.stats.headerLines++;
                }

                if (stripped.startsWith('#EXTINF:')) {
                    currentChannelId = this.extractChannelId(stripped, urlPosition);
                    currentExtinf = line;
                    this.stats.extinifLines++;
                }

                continue;
            }

            // Transform stream URLs
            if (currentExtinf && this.isStreamURL(stripped)) {
                const originalUrl = stripped;

                const redirectUrl = this.transformURL(originalUrl, currentChannelId);

                if (redirectUrl) {
                    output.push(redirectUrl);
                    this.stats.urlsTransformed++;
                    urlPosition++;
                } else {
                    console.warn(`⚠️ Keeping original URL for [${currentChannelId}]`);
                    output.push(originalUrl);
                }

                currentExtinf = null;
                currentChannelId = 'unknown';
                continue;
            }

            // Preserve everything else
            output.push(line);
            this.stats.preservedLines++;
        }

        this.stats.transformedSize = output.join('\n').length;
        const integrityPercent =
            ((this.stats.headerLines + this.stats.extinifLines + this.stats.preservedLines)
                / this.stats.totalLines * 100).toFixed(1);

        console.log(`✅ [M3U8Transform] Transformación completada:`);
        console.log(`   📊 URLs transformadas: ${this.stats.urlsTransformed}`);
        console.log(`   📋 Headers preservados: ${this.stats.headerLines}`);
        console.log(`   📝 EXTINF preservados: ${this.stats.extinifLines}`);
        console.log(`   ✅ Integridad: ${integrityPercent}%`);
        console.log(`   📦 Tamaño original: ${(this.stats.originalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   📦 Tamaño transformado: ${(this.stats.transformedSize / 1024 / 1024).toFixed(2)} MB`);

        if (this.stats.errors.length > 0) {
            console.warn(`⚠️ Errores encontrados: ${this.stats.errors.length}`);
            this.stats.errors.forEach(err => console.warn(`   - ${err.type}: ${err.error}`));
        }

        return {
            output: output.join('\n'),
            stats: {
                ...this.stats,
                integrity: integrityPercent
            },
            success: this.stats.urlsTransformed > 0 && this.stats.errors.length === 0
        };
    }

    validate(transformedContent) {
        const lines = transformedContent.split('\n');
        const checks = {
            hasExtm3u: lines.some(l => l.trim().startsWith('#EXTM3U')),
            hasRedirectUrls: lines.some(l => l.includes(`${this.redirectorUrl}/stream`)),
            allUrlsStartCorrectly: lines
                .filter(l => !l.trim().startsWith('#') && l.trim().length > 0)
                .every(l => l.trim().startsWith('http')),
            noDoubleEncoding: !lines.some(l =>
                l.includes('%25') || // Double-encoded %
                l.match(/%[0-9A-F]{2}%[0-9A-F]{2}/) // Pattern of double encoding
            )
        };

        const success = Object.values(checks).every(v => v === true);

        if (!success) {
            console.warn('⚠️ Validation failed:', checks);
        }

        return {
            success,
            checks,
            timestamp: new Date().toISOString()
        };
    }
}

// Export for use in gateway-manager
if (typeof window !== 'undefined') {
    window.M3U8RedirectTransformer = M3U8RedirectTransformer;
}
