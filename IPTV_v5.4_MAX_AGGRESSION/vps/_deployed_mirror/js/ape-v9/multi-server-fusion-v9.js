(function () {
    'use strict';

    function addQuery(url, key, value) {
        if (!url) return '';
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }

    function stripRuntime(url) {
        return String(url || '')
            .replace(/[?&]ape_sid=[^&]*/gi, '')
            .replace(/[?&]ape_nonce=[^&]*/gi, '')
            .replace(/[?&]ape_jwt=[^&]*/gi, '')
            .replace(/[?&]_ape_r=[^&]*/gi, '')
            .replace(/[?&]profile=[^&]*/gi, '')
            .replace(/&&+/g, '&')
            .replace(/\?&/g, '?')
            .replace(/[?&]$/, '');
    }

    function ensureM3U8(url) {
        const clean = stripRuntime(url);
        if (/\.m3u8(\?|#|$)/i.test(clean)) return clean;
        if (/\.ts(\?|#|$)/i.test(clean)) return clean.replace(/\.ts(?=(\?|#|$))/i, '.m3u8');
        return clean;
    }

    function buildResolverUrl(baseUrl, streamId, host, profile) {
        if (!baseUrl) return '';
        let url = `${baseUrl.replace(/\/$/, '')}/resolve/${encodeURIComponent(String(streamId || '0'))}.m3u8`;
        url = addQuery(url, 'profile', profile);
        if (host) url = addQuery(url, 'host', host);
        return url;
    }

    window.MultiServerFusionV9 = {
        buildRedundantUrls({ primaryUrl, channel, admission, runtimeConfig = {} }) {
            const streamId = (admission && admission.stream_id) || (channel && (channel.stream_id || channel.id || channel.num)) || '0';
            const host = (admission && admission.host) || '';
            const cleanPrimary = ensureM3U8((admission && admission.url) || primaryUrl || '');
            const ladder = ['P1', 'P2', 'P3'];

            if (runtimeConfig.profileTransport === 'resolver' && runtimeConfig.resolverBaseUrl) {
                return ladder.map(profile => buildResolverUrl(runtimeConfig.resolverBaseUrl, streamId, host, profile));
            }

            if (runtimeConfig.profileTransport === 'origin_query') {
                return ladder.map(profile => addQuery(cleanPrimary, 'profile', profile));
            }

            if (runtimeConfig.profileTransport === 'fragment') {
                return ladder.map(profile => `${cleanPrimary}${cleanPrimary.includes('#') ? '&' : '#'}profile=${encodeURIComponent(profile)}`);
            }

            return [cleanPrimary, cleanPrimary, cleanPrimary];
        }
    };
})();
