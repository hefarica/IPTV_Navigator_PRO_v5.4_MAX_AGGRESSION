(function () {
    'use strict';

    const DEFAULT_CONFIG = {
        admissionUrl: '/backend/health/admitted.json',
        requireAdmission: false,
        profileTransport: 'resolver',
        resolverBaseUrl: '',
        preferHostOrder: ['line.tivi-ott.net', 'ky-tv.cc'],
        cacheTtlMs: 5 * 60 * 1000,
        debug: false
    };

    function normalizeHost(value) {
        return String(value || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
    }

    function normalizeUrl(value) {
        return String(value || '')
            .replace(/[?&]ape_sid=[^&]*/gi, '')
            .replace(/[?&]ape_nonce=[^&]*/gi, '')
            .replace(/[?&]ape_jwt=[^&]*/gi, '')
            .replace(/[?&]_ape_r=[^&]*/gi, '')
            .replace(/[?&]profile=[^&]*/gi, '')
            .replace(/&&+/g, '&')
            .replace(/\?&/g, '?')
            .replace(/[?&]$/, '');
    }

    function withQuery(url, key, value) {
        if (!url) return '';
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }

    function ensureM3U8(url) {
        if (!url) return '';
        if (/\.m3u8(\?|#|$)/i.test(url)) return url;
        if (/\.ts(\?|#|$)/i.test(url)) return url.replace(/\.ts(?=(\?|#|$))/i, '.m3u8');
        return url;
    }

    // Plan Supremo — inferencia de rol desde Content-Type observado por health_checker
    const MIME_ROLE_MAP = {
        'application/vnd.apple.mpegurl': 'playlist_hls',
        'application/x-mpegurl':         'playlist_hls',
        'application/mpegurl':           'playlist_hls',
        'application/dash+xml':          'playlist_dash',
        'video/mp2t':                    'segment_ts',
        'video/iso.segment':             'segment_cmaf',
        'application/mp4':               'segment_cmaf'
    };

    function roleFromContentType(ct) {
        if (!ct) return null;
        const key = String(ct).toLowerCase().split(';')[0].trim();
        return MIME_ROLE_MAP[key] || null;
    }

    function normalizeEntry(raw, keyHint) {
        if (!raw || typeof raw !== 'object') return null;
        const streamId = String(raw.stream_id || raw.id || raw.streamId || keyHint || '').trim();
        const host = normalizeHost(raw.host || raw.base_host || raw.final_host || raw.url || '');
        const url = normalizeUrl(raw.url || raw.primary_url || raw.m3u8_url || '');
        if (!streamId || !url) return null;

        const contentType = String(raw.content_type || raw.contentType || '').trim();
        const observedRole = roleFromContentType(contentType) || 'unknown';
        // publicationTier: 'A' si tenemos URL terminal + rol HLS/DASH/segment conocido.
        // Si el health_checker ya marca tier explícito (raw.publication_tier), respetarlo.
        const explicitTier = String(raw.publication_tier || raw.publicationTier || '').toUpperCase();
        const publicationTier = (explicitTier === 'A' || explicitTier === 'B' || explicitTier === 'C')
            ? explicitTier
            : (observedRole !== 'unknown' ? 'A' : 'B');

        return {
            stream_id: streamId,
            host,
            url: ensureM3U8(url),
            content_type: contentType,                  // legado
            observedContentType: contentType,           // Plan Supremo — alias explícito
            observedRole,                               // inferido del MIME real
            publicationTier,                            // 'A' | 'B' | 'C'
            validatedAt: raw.checked_at || raw.checkedAt || raw.validated_at || '',
            followRedirectsUsed: Boolean(raw.follow_redirects_used || raw.followRedirectsUsed ||
                                         (raw.final_url && raw.final_url !== raw.url)),
            stabilityScore: Number(raw.stability_score || raw.stabilityScore || 0) || 0,
            latency_ms: Number(raw.latency_ms || raw.latencyMs || 0),
            source: raw.source || '',
            checked_at: raw.checked_at || raw.checkedAt || '',
            raw
        };
    }

    const runtime = {
        config: { ...DEFAULT_CONFIG },
        admittedMap: new Map(),
        lastLoadedAt: 0,
        lastSourceUrl: '',
        pendingLoad: null,

        setConfig(next) {
            this.config = { ...this.config, ...(next || {}) };
            return this.config;
        },

        ingest(payload) {
            this.admittedMap = new Map();
            if (Array.isArray(payload)) {
                for (const item of payload) {
                    const entry = normalizeEntry(item, item && (item.stream_id || item.id || item.streamId));
                    if (!entry) continue;
                    this._putEntry(entry);
                }
            } else if (payload && typeof payload === 'object') {
                for (const [key, value] of Object.entries(payload)) {
                    const entry = normalizeEntry(value, key);
                    if (!entry) continue;
                    this._putEntry(entry);
                }
            }
            this.lastLoadedAt = Date.now();
            return this.admittedMap.size;
        },

        _putEntry(entry) {
            this.admittedMap.set(`id:${entry.stream_id}`, entry);
            if (entry.host) this.admittedMap.set(`host:${entry.host}|${entry.stream_id}`, entry);
            this.admittedMap.set(`url:${normalizeUrl(entry.url)}`, entry);
        },

        async loadAdmittedMap(url, options = {}) {
            this.setConfig(options);
            const sourceUrl = url || options.admissionUrl || this.config.admissionUrl;
            if (!sourceUrl) throw new Error('admissionUrl no configurada');
            this.lastSourceUrl = sourceUrl;
            const response = await fetch(sourceUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error(`No se pudo cargar admitted.json: HTTP ${response.status}`);
            const payload = await response.json();
            const count = this.ingest(payload);
            if (this.config.debug) console.log(`[APE-HEALTH] admittedMap cargado: ${count} entradas`);
            return { count, url: sourceUrl };
        },

        async ensureReady(options = {}) {
            this.setConfig(options);
            const age = Date.now() - this.lastLoadedAt;
            if (this.admittedMap.size > 0 && age < this.config.cacheTtlMs) {
                return { count: this.admittedMap.size, cached: true, url: this.lastSourceUrl };
            }
            if (this.pendingLoad) return this.pendingLoad;
            this.pendingLoad = this.loadAdmittedMap(options.admissionUrl || this.config.admissionUrl, options)
                .finally(() => { this.pendingLoad = null; });
            return this.pendingLoad;
        },

        lookup({ channel, url, creds }) {
            const streamId = String(channel && (channel.stream_id || channel.id || channel.num || '') || '').trim();
            const cleanUrl = normalizeUrl(url || '');
            const hostFromUrl = normalizeHost(cleanUrl);
            const hostFromCreds = normalizeHost(creds && creds.baseUrl);

            const candidates = [];
            if (streamId && hostFromUrl) candidates.push(`host:${hostFromUrl}|${streamId}`);
            if (streamId && hostFromCreds) candidates.push(`host:${hostFromCreds}|${streamId}`);
            if (streamId) candidates.push(`id:${streamId}`);
            if (cleanUrl) candidates.push(`url:${cleanUrl}`);

            for (const key of candidates) {
                const entry = this.admittedMap.get(key);
                if (entry) return entry;
            }
            return null;
        },

        getProfileUrl({ profile, channel, admission, fallbackUrl }) {
            // Etapa 2 del plan "Integración sin /resolve/":
            // ─── Prioridad de URL terminal (doctrina "HLS first, upstream directo, host admitido"): ───
            //   1) admission.url  — URL verificada por health_checker (200+HLS real)
            //   2) fallbackUrl    — URL construida desde creds upstream por el generador
            // Sin capa intermedia /resolve/. La URL sale directo al upstream.
            // La rama 'resolver' se conserva por compatibilidad pero no se recomienda
            // (requiere resolve_admitted.py desplegado en el VPS — Etapa D del plan original).
            const cleanFallback = ensureM3U8(normalizeUrl((admission && admission.url) || fallbackUrl || ''));
            if (!cleanFallback) return '';

            // Canonicalización (idempotencia): APEFormatPolicy si está disponible.
            const canonicalize = (typeof window !== 'undefined' && window.APEFormatPolicy && typeof window.APEFormatPolicy.canonicalizeUrl === 'function')
                ? window.APEFormatPolicy.canonicalizeUrl
                : (u) => u;

            // 'resolver' — legado. Requiere VPS backend /resolve/{id}.m3u8 desplegado.
            if (this.config.profileTransport === 'resolver' && this.config.resolverBaseUrl) {
                const streamId = encodeURIComponent(String((admission && admission.stream_id) || (channel && (channel.stream_id || channel.id || '')) || '0'));
                let resolved = `${this.config.resolverBaseUrl.replace(/\/$/, '')}/resolve/${streamId}.m3u8`;
                resolved = withQuery(resolved, 'profile', profile || 'P3');
                if (admission && admission.host) resolved = withQuery(resolved, 'host', admission.host);
                return canonicalize(resolved);
            }

            // 'origin_query' — URL upstream con ?profile=PX.
            if (this.config.profileTransport === 'origin_query') {
                return canonicalize(withQuery(cleanFallback, 'profile', profile || 'P3'));
            }

            // 'fragment' — URL upstream con #profile=PX (no entra en query canon).
            if (this.config.profileTransport === 'fragment') {
                return `${cleanFallback}${cleanFallback.includes('#') ? '&' : '#'}profile=${encodeURIComponent(profile || 'P3')}`;
            }

            // 'clean' (default en el plan "Integración sin /resolve/"): URL upstream directa.
            // Ya viene ensureM3U8 + normalizeUrl aplicados; solo canonicaliza por idempotencia.
            return canonicalize(cleanFallback);
        },

        filterAdmittedChannels(channels) {
            if (!this.config.requireAdmission) return channels;
            if (this.admittedMap.size === 0) {
                if (this.config.debug) console.warn('\u{1F6AB} [APE-HEALTH] admittedMap empty with requireAdmission=true -> returning empty list (fail-closed)');
                return [];
            }
            return (channels || []).filter(channel => {
                const id = String(channel && (channel.stream_id || channel.id || channel.num || '') || '').trim();
                if (!id) return false;
                return this.admittedMap.has(`id:${id}`);
            });
        },

        getStats() {
            return {
                entries: this.admittedMap.size,
                lastLoadedAt: this.lastLoadedAt,
                lastSourceUrl: this.lastSourceUrl,
                requireAdmission: this.config.requireAdmission,
                profileTransport: this.config.profileTransport
            };
        }
    };

    window.APEHealthRuntime = runtime;
})();
