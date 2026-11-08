/** Shared REA catalog finalizer. Pure JavaScript: browser, Worker and Node. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.APE_REA_EXPORT = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : self, function createReaExport(root) {
    'use strict';
    const httpEncoder = new TextEncoder();
    const httpLimitCount = 200, httpLimitBytes = 8192;
    const httpProtected = /^(?:authorization|proxy-authorization|cookie2?|user-agent|referer|origin)$|(?:^|[-_])(?:auth(?:orization)?|api[-_]?key|access[-_]?token|token|secret|signature)(?:$|[-_])/i;
    const httpPriority = /^(?:accept(?:-.*)?|cache-control|pragma|x-ape-(?:profile|tier)|x-prefetch-.*|x-parallel-segments|x-concurrent-downloads|x-(?:expected|max|min)-bitrate|x-buffer-target)$/i;
    const httpToxic = /^(?:range|if-none-match|if-modified-since|te|priority|upgrade-insecure-requests|connection|keep-alive|proxy-connection|sec-fetch(?:-.*)?|sec-ch-ua(?:-.*)?)$/i;
    function httpFailure(reason) { throw new Error('REA_EXTHTTP_' + reason + ': revisa las cabeceras HTTP de la fuente; no se exportó una autenticación incompleta.'); }
    function putHttp(map, key, value, required) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(String(key))
            || value == null || !['string', 'number', 'boolean'].includes(typeof value)) httpFailure('INVALID_HEADER');
        const text = String(value);
        if (/[\x00-\x1f\x7f]/.test(text)) httpFailure('INVALID_HEADER');
        if (httpToxic.test(key)) {
            if (required) httpFailure('UNSUPPORTED_HEADER');
            return;
        }
        const lower = key.toLowerCase(), prior = map.get(lower);
        map.set(lower, { key: String(key), value: text, required: !!required || !!(prior && prior.required) || httpProtected.test(key) });
    }
    function suppliedHttp(channel, options, sourceUrl) {
        const ch = channel || {}, opts = options || {}, map = new Map();
        const merge = input => {
            if (input == null) return;
            if (typeof input !== 'object' || Array.isArray(input)) httpFailure('INVALID_HEADER');
            for (const key of Object.keys(input)) putHttp(map, key, input[key], true);
        };
        merge(opts.requestHeaders);
        const raw = String(ch.url || ch.base && ch.base.url || ch.direct_source || ch.stream_url || sourceUrl || '');
        const pipe = raw.search(/\|(?=[A-Za-z][A-Za-z0-9_-]*=)/);
        if (pipe >= 0) {
            for (const pair of raw.slice(pipe + 1).split('&')) {
                const eq = pair.indexOf('=');
                if (eq < 1) httpFailure('INVALID_HEADER');
                let key, value;
                try { key = decodeURIComponent(pair.slice(0, eq)); value = decodeURIComponent(pair.slice(eq + 1)); }
                catch (_) { httpFailure('INVALID_HEADER'); }
                putHttp(map, key, value, true);
            }
        }
        for (const input of [ch.base && ch.base.headers, ch.headers, ch.http_headers, ch.httpHeaders, ch.requestHeaders]) merge(input);
        return map;
    }
    function requiredHttpFits(map) {
        const required = Object.create(null);
        for (const entry of map.values()) if (entry.required) required[entry.key] = entry.value;
        if (Object.keys(required).length > httpLimitCount || httpEncoder.encode(JSON.stringify(required)).length > httpLimitBytes) {
            httpFailure('REQUIRED_HEADERS_EXCEED_BUDGET');
        }
    }
    function validateRequiredHeaders(channel, options, sourceUrl) {
        requiredHttpFits(suppliedHttp(channel, options, sourceUrl));
        return true;
    }
    function finalizeHttp(lines, channel, options, sourceUrl) {
        const supplied = suppliedHttp(channel, options, sourceUrl), merged = new Map();
        const first = lines.findIndex(line => line.startsWith('#EXTHTTP:'));
        if (first < 0 && supplied.size === 0) return lines;
        for (const line of lines) {
            if (!line.startsWith('#EXTHTTP:')) continue;
            const raw = line.slice(9);
            let object;
            try {
                if (raw.trim().startsWith('{')) object = JSON.parse(raw);
                else {
                    const eq = raw.indexOf('=');
                    if (eq < 1) httpFailure('INVALID_JSON');
                    object = Object.create(null); object[raw.slice(0, eq)] = raw.slice(eq + 1);
                }
                if (!object || typeof object !== 'object' || Array.isArray(object)) httpFailure('INVALID_JSON');
            } catch (_) { httpFailure('INVALID_JSON'); }
            for (const key of Object.keys(object)) putHttp(merged, key, object[key], false);
        }
        for (const entry of supplied.values()) putHttp(merged, entry.key, entry.value, true);
        requiredHttpFits(merged);
        const output = Object.create(null), overflow = Object.create(null);
        const entries = Array.from(merged.values());
        entries.sort((a, b) => (b.required ? 2 : httpPriority.test(b.key) ? 1 : 0) - (a.required ? 2 : httpPriority.test(a.key) ? 1 : 0));
        let count = 0, bytes = 2;
        for (const entry of entries) {
            const cost = httpEncoder.encode(JSON.stringify(entry.key) + ':' + JSON.stringify(entry.value)).length + (count ? 1 : 0);
            if (count < httpLimitCount && bytes + cost <= httpLimitBytes) {
                output[entry.key] = entry.value; count++; bytes += cost;
            } else {
                if (entry.required) httpFailure('REQUIRED_HEADERS_EXCEED_BUDGET');
                overflow[entry.key] = entry.value;
            }
        }
        const result = lines.filter(line => !line.startsWith('#EXTHTTP:'));
        // EXTHTTP belongs to the channel announced by EXTINF. A few legacy
        // emitters placed it before EXTINF, which can attach auth to a neighbour.
        const extinf = result.findIndex(line => line.startsWith('#EXTINF:'));
        const insertion = extinf >= 0 ? extinf + 1 : result.findIndex(line => line.trim() && !line.trim().startsWith('#'));
        const additions = ['#EXTHTTP:' + JSON.stringify(output)];
        if (Object.keys(overflow).length) additions.push('#EXT-X-APE-REA-HTTP-OVERFLOW:' + JSON.stringify(overflow));
        result.splice(insertion < 0 ? result.length : insertion, 0, ...additions);
        if (supplied.size) {
            const query = Object.keys(output).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(output[key])).join('&');
            for (let i = 0; i < result.length; i++) {
                if (/^#KODIPROP:inputstream\.adaptive\.(?:stream|manifest)_headers=/.test(result[i])) {
                    result[i] = result[i].slice(0, result[i].indexOf('=') + 1) + query;
                }
                const vlc = result[i].match(/^#EXTVLCOPT:http-([^=]+)=/i);
                if (vlc) {
                    const key = vlc[1].toLowerCase() === 'referrer' ? 'referer' : vlc[1].toLowerCase();
                    const entry = supplied.get(key);
                    if (entry) result[i] = result[i].slice(0, result[i].indexOf('=') + 1) + entry.value;
                }
            }
        }
        return result;
    }
    // REA source/processing boundary. URL comparison never decodes credentials,
    // strips query tokens, upgrades a protocol or compares only host/profile.
    function _apeReaSourceUri(value) {
        return String(value || '').trim().split(/\|(?=[A-Za-z][A-Za-z0-9_-]*=)/)[0];
    }

    function _apeReaChannelUris(channel) {
        const ch = channel || {};
        return [ch.url, ch.direct_source, ch.stream_url, ch.base && ch.base.url]
            .map(_apeReaSourceUri).filter(Boolean);
    }

    function _apeReaSourceEvidence(channel, playbackUrl, explicitProbe) {
        const probe = explicitProbe || (channel && channel._probeData) || null;
        const unknown = { status: 'unknown', reason: 'no_url_bound_probe', source: null,
            width: null, height: null, resolution: null, videoCodec: null, audioCodec: null,
            codecs: null, frameRate: null, videoRange: null, bandwidth: null,
            averageBandwidth: null, hdcpLevel: null, supplementalCodecs: null };
        if (!probe || typeof probe !== 'object') return unknown;
        const provenance = probe.provenance || {};
        const uri = _apeReaSourceUri(playbackUrl);
        const probedUri = _apeReaSourceUri(provenance.requestedUrl);
        const responseUri = _apeReaSourceUri(provenance.responseUrl);
        if (provenance.schema !== 'ape.probe-provenance/1' || provenance.scope !== 'channel_url'
            || !uri || !probedUri || (uri !== probedUri && uri !== responseUri)
            || !/^PROBED_(?:MASTER|MEDIA)(?:\+BINARY)?$/.test(String(probe.source || ''))) {
            unknown.reason = 'probe_not_for_playback_uri';
            return unknown;
        }
        const observed = Array.isArray(provenance.observedFields) ? provenance.observedFields : [];
        const has = name => observed.indexOf(name) !== -1;
        const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
        const codec = value => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value || '')) ? String(value) : null;
        const result = Object.assign({}, unknown, { status: 'observed', reason: 'exact_url_probe', source: probe.source });
        const res = has('resolution') && String(probe.resolution || '').match(/^(\d+)x(\d+)$/);
        if (res && Number.isSafeInteger(Number(res[1])) && Number.isSafeInteger(Number(res[2]))
            && Number(res[1]) > 0 && Number(res[2]) > 0) {
            result.width = Number(res[1]); result.height = Number(res[2]);
            result.resolution = result.width + 'x' + result.height;
        }
        if (has('videoCodec')) result.videoCodec = codec(probe.videoCodec);
        if (has('audioCodec')) result.audioCodec = codec(probe.audioCodec);
        // Do not synthesize an AAC companion or rewrite an observed E-AC-3 codec.
        const codecs = [result.videoCodec, result.audioCodec].filter(Boolean);
        result.codecs = codecs.length ? codecs.join(',') : null;
        if (has('frameRate')) result.frameRate = positive(probe.frameRate);
        if (has('bandwidth')) result.bandwidth = positive(probe.bandwidth);
        if (has('avgBandwidth')) result.averageBandwidth = positive(probe.avgBandwidth);
        if (has('videoRange') && /^(SDR|PQ|HLG)$/.test(String(probe.videoRange || ''))) result.videoRange = probe.videoRange;
        if (has('hdcpLevel') && /^(NONE|TYPE-0|TYPE-1)$/.test(String(probe.hdcpLevel || ''))) result.hdcpLevel = probe.hdcpLevel;
        if (has('supplementalCodecs') && /^[A-Za-z0-9._,\/-]+$/.test(String(probe.supplementalCodecs || ''))) {
            result.supplementalCodecs = String(probe.supplementalCodecs);
        }
        return result;
    }

    function _apeReaAttributeList(line) {
        // Preserve quoted commas in CODECS and opaque stable IDs.
        const attrs = []; let token = '', quoted = false;
        for (const char of String(line || '').replace(/^#EXT-X-STREAM-INF:/, '')) {
            if (char === '"') quoted = !quoted;
            if (char === ',' && !quoted) { attrs.push(token); token = ''; }
            else token += char;
        }
        if (token) attrs.push(token);
        return attrs;
    }

    function _apeReaProcessingIntent(evidence, options) {
        const api = root.APE_REA_POLICY || null;
        const cfg = root.APE_PROFILES_CONFIG || null;
        const opts = options || {};
        const candidate = opts.rea_processing || opts.reaProcessing
            || (cfg && (cfg.reaProcessing || cfg.rea_processing)) || (api && api.policy) || null;
        let target = null, policyValid = false;
        if (api && typeof api.resolveTarget === 'function' && typeof api.validatePolicy === 'function') {
            policyValid = !!api.validatePolicy(candidate).valid;
            if (policyValid && evidence.width && evidence.height) {
                target = api.resolveTarget(evidence.width, evidence.height, candidate);
            }
        }
        const validTarget = target && target.valid;
        const sourceRange = evidence.videoRange;
        return {
            schema: 'ape.rea-intent/1',
            policyId: (validTarget && target.policyId) || (candidate && candidate.policy_id) || null,
            status: policyValid ? 'requested_only' : 'policy_unavailable',
            sourceStatus: evidence.status,
            targetResolution: validTarget ? target.targetResolution : null,
            targetWidth: validTarget ? target.targetWidth : null,
            targetHeight: validTarget ? target.targetHeight : null,
            boxWidth: validTarget ? target.boxWidth : null,
            boxHeight: validTarget ? target.boxHeight : null,
            mode: validTarget ? target.mode : 'pending_source',
            enhancementRequested: validTarget ? target.enhancementRequested : null,
            runtimePackage: 'com.ape.crystalagent.rea',
            execution: 'not_verified',
            capacityGate: 'device_runtime',
            hdr: sourceRange === 'HLG' ? 'native_hlg'
                : (sourceRange === 'PQ' ? 'preserve_native_pq'
                    : (sourceRange === 'SDR' ? 'sdr_to_pq_conditional' : 'pending_source')),
            hdrVerified: false,
            runtimeFallback: sourceRange === 'HLG' ? 'native_playback' : 'adaptive_native_if_needed',
            outputPreference: opts.hdr_force || 'auto',
            // The external player receives bytes. MediaSession supplies controls.
            integration: 'external_player'
        };
    }

    function _apeIsMediaPlaylist(text) {
        // Some historical IPTV catalogs contain media-like global directives.
        // Their negative EXTINF entries still identify them as catalogs. Zero
        // duration segments with media sequence/map/part data must stay intact.
        if (/^#EXTINF:\s*-\d/m.test(text)) return false;
        return /^#EXT-X-(?:MAP:|PART:|BYTERANGE:|DISCONTINUITY-SEQUENCE:|ENDLIST(?:\r?$)|PLAYLIST-TYPE:)/m.test(text)
            || (/^#EXT-X-TARGETDURATION:/m.test(text) && /^#EXT-X-MEDIA-SEQUENCE:/m.test(text));
    }

    function _apeFinalizeReaChannel(text, context) {
        const ctx = context || {};
        const original = String(text == null ? '' : text);
        if (_apeIsMediaPlaylist(original)) return original;
        let lines = original.split('\n');
        const uris = lines.filter(line => line.trim() && line.trim()[0] !== '#');
        // One catalog block only. Never move a segment or collapse a multi-URI block.
        if (uris.length !== 1) return original;
        lines = finalizeHttp(lines, ctx.channel || {}, ctx.options || ctx, ctx.sourceUrl || uris[0]);
        const actualUri = _apeReaSourceUri(uris[0]);
        const requestedUri = _apeReaSourceUri(ctx.playbackUrl || ctx.finalUrl || actualUri);
        // An explicit passthrough association is needed after a CDN URL rewrite.
        const evidenceUri = ctx.sourcePassthrough === true && ctx.sourceUrl
            ? _apeReaSourceUri(ctx.sourceUrl) : actualUri;
        const evidence = _apeReaSourceEvidence(ctx.channel || {}, evidenceUri, ctx.probe);
        if (requestedUri !== actualUri) {
            Object.assign(evidence, _apeReaSourceEvidence({}, '', null), { reason: 'playback_uri_changed' });
        }
        const intent = _apeReaProcessingIntent(evidence, ctx.options || ctx);
        const controlled = new Set(['BANDWIDTH', 'AVERAGE-BANDWIDTH', 'RESOLUTION', 'CODECS',
            'FRAME-RATE', 'VIDEO-RANGE', 'HDCP-LEVEL', 'SUPPLEMENTAL-CODECS', 'BIT-DEPTH',
            'CHROMA-SUBSAMPLING', 'MAXCLL', 'MAXFALL', 'COLOR-PRIMARIES',
            'TRANSFER-CHARACTERISTICS', 'MATRIX-COEFFICIENTS']);
        const existing = lines.find(line => line.startsWith('#EXT-X-STREAM-INF:')) || '';
        const attrs = _apeReaAttributeList(existing).filter(attr => {
            const key = attr.split('=')[0].trim().toUpperCase();
            return /^[A-Z0-9-]+=/.test(attr) && !controlled.has(key);
        });
        // BANDWIDTH is required for a HLS variant. If it is not observed, keep a
        // valid IPTV catalog entry (EXTINF + URI) instead of inventing a variant.
        let streamInf = null;
        if (evidence.bandwidth) {
            const sourceAttrs = ['BANDWIDTH=' + Math.round(evidence.bandwidth)];
            if (evidence.averageBandwidth) sourceAttrs.push('AVERAGE-BANDWIDTH=' + Math.round(evidence.averageBandwidth));
            if (evidence.resolution) sourceAttrs.push('RESOLUTION=' + evidence.resolution);
            if (evidence.codecs) sourceAttrs.push('CODECS="' + evidence.codecs + '"');
            if (evidence.frameRate) sourceAttrs.push('FRAME-RATE=' + evidence.frameRate.toFixed(3));
            if (evidence.videoRange) sourceAttrs.push('VIDEO-RANGE=' + evidence.videoRange);
            if (evidence.hdcpLevel) sourceAttrs.push('HDCP-LEVEL=' + evidence.hdcpLevel);
            if (evidence.supplementalCodecs) sourceAttrs.push('SUPPLEMENTAL-CODECS="' + evidence.supplementalCodecs + '"');
            streamInf = '#EXT-X-STREAM-INF:' + sourceAttrs.concat(attrs).join(',');
        }
        const target = intent.targetResolution || 'unknown';
        const wants6k = Math.min(intent.targetWidth || 0, intent.targetHeight || 0) === 3240
            && intent.enhancementRequested === true;
        const replacements = {
            '#EXT-X-APE-4KFALSE-MODE:': 'DISABLED;SOURCE_DECLARATION=UNCHANGED;REPLACED_BY=REA_REQUEST',
            '#EXT-X-APE-4KFALSE-TARGET-RES:': 'DISABLED;USE_REA_TARGET=1',
            '#EXT-X-APE-4KFALSE-ENGINE:': 'LEGACY_RECIPE;STATUS=DECLARED_ONLY;EXECUTED=0',
            '#EXT-X-APE-PERCEPTUAL-4K:': 'TARGET-RESOLUTION="' + target + '",HDR-INTENT="conditional",MODE="requested_only",EXECUTED=0',
            '#EXT-X-APE-8KFAKE:': 'ENABLED=0;NEVER_REAL=1;TARGET=DISPLAY;EXECUTED=0',
            '#EXT-X-APE-4K-PREMIUM:': 'DECLARED_ONLY;EXECUTED=0',
            '#EXT-X-APE-CRYSTAL-6K:': (wants6k ? 'REQUESTED;RES=' + target : 'NOT_REQUESTED') + ';CAPACITY_CHECK=RUNTIME;EXECUTED=0',
            '#EXT-X-APE-CRYSTAL-6K-MODE:': (wants6k ? 'REQUESTED_ONLY' : 'NOT_REQUESTED') + ';SOURCE=' + (evidence.resolution || 'unknown') + ';EXECUTED=0',
            '#EXT-X-APE-CRYSTAL-6K-BITRATE:': 'UNKNOWN;MEASURE_AT_RUNTIME=1',
            '#EXT-X-APE-CRYSTAL-6K-TRUTH:': 'REQUESTED_ENHANCEMENT;NOT_SOURCE;DOWNSCALE_FORBIDDEN',
            '#EXT-X-APE-UPSCALE:': (intent.enhancementRequested === true ? 'REQUESTED_ONLY'
                : (intent.enhancementRequested === false ? 'NATIVE_PASSTHROUGH' : 'PENDING_SOURCE')) + ';TARGET=' + target + ';EXECUTED=0',
            '#EXT-X-APE-QUALITY:': 'SOURCE=' + (evidence.resolution || 'unknown') + ';STATUS=' + evidence.status.toUpperCase(),
            '#EXT-X-APE-QUALITY-SOURCE:': evidence.source || 'UNKNOWN',
            '#EXT-X-APE-FPS-SOURCE:': evidence.frameRate ? 'probe-url' : 'unknown',
            '#EXT-X-APE-CODEC-SOURCE:': evidence.codecs ? 'probe-url' : 'unknown',
            '#EXT-X-APE-CRYSTAL-ENHANCEMENT:': 'REQUESTED_ONLY;CAPACITY_GATED=1;EXECUTED=0',
            '#EXT-X-APE-REALCE-SOURCE:': 'device-unverified;OBS_BPS=unknown;EXECUTED=0',
            '#EXT-X-APE-AI-HDR-UPCONVERT:': 'CONDITIONAL;MODE=' + intent.hdr + ';EXECUTED=0'
        };
        const replacePrefixes = Object.keys(replacements);
        lines = lines.filter(line => !/^#EXT-X-STREAM-INF:/.test(line)
            && !/^#EXT-X-APE-(?:SOURCE|REA|STREAM-TRUTH):/.test(line));
        lines = lines.map(line => {
            const prefix = replacePrefixes.find(key => line.startsWith(key));
            if (prefix) return prefix + replacements[prefix];
            // An I-frame rendition needs its own URI/probe. Historical generated
            // hints have neither; retain the requested data as private metadata.
            if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
                return line.replace('#EXT-X-I-FRAME-STREAM-INF:', '#EXT-X-APE-DECLARED-I-FRAME-STREAM-INF:')
                    + ';STATUS=UNVERIFIED';
            }
            // Historical recipe capabilities remain available, with an explicit
            // execution status. They are not evidence that AI/HDR ran on a device.
            if (/^#EXT-X-APE-(?:AI-|SUPER-RES-|ANTI-NOISE-|HDR-|CORTEX-AI-|CORTEX-TEMPORAL-|CORTEX-LCEVC:|LCEVC-ENHANCEMENT:)/.test(line)
                && line.indexOf(';EXECUTED=0') === -1) return line + ';STATUS=DECLARED_ONLY;EXECUTED=0';
            return line;
        });
        const metadata = [
            '#EXT-X-APE-SOURCE:' + JSON.stringify(evidence),
            '#EXT-X-APE-REA:' + JSON.stringify(intent),
            '#EXT-X-APE-STREAM-TRUTH:src=' + (evidence.status === 'observed' ? 'probe-url' : 'unknown')
                + ',w=' + (evidence.width || 'unknown') + ',h=' + (evidence.height || 'unknown')
                + ',fps=' + (evidence.frameRate || 'unknown') + ',range=' + (evidence.videoRange || 'unknown')
                + ',codec=' + (evidence.videoCodec || 'unknown')
        ];
        const uriIndex = lines.findIndex(line => line.trim() && line.trim()[0] !== '#');
        lines.splice(uriIndex, 0, ...metadata, ...(streamInf ? [streamInf] : []));
        return lines.join('\n');
    }

    function _apeFinalizeReaPlaylist(text, channels, options) {
        const original = String(text == null ? '' : text);
        if (_apeIsMediaPlaylist(original)) return original;
        const lines = original.split('\n');
        const starts = [];
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^#EXTINF:([^ ,]+)/);
            if (!match) continue;
            // Real HLS media segments have positive durations. Never interpret
            // such a media playlist as a catalog, even if it contains tvg metadata.
            if (!Number.isFinite(Number(match[1])) || Number(match[1]) > 0) return original;
            starts.push(i);
        }
        if (!starts.length) return original;
        const byUri = new Map(), byId = new Map();
        for (const ch of channels || []) {
            for (const uri of _apeReaChannelUris(ch)) {
                if (!byUri.has(uri)) byUri.set(uri, ch);
                else if (byUri.get(uri) !== ch) byUri.set(uri, null);
            }
            for (const id of new Set([ch.tvg_id, ch.stream_id, ch.id].filter(v => v != null && String(v) !== '').map(String))) {
                if (!byId.has(id)) byId.set(id, ch);
                else if (byId.get(id) !== ch) byId.set(id, null);
            }
        }
        const result = lines.slice(0, starts[0]);
        for (let i = 0; i < starts.length; i++) {
            const block = lines.slice(starts[i], starts[i + 1] === undefined ? lines.length : starts[i + 1]);
            const uriLine = block.find(line => line.trim() && line.trim()[0] !== '#');
            const uri = _apeReaSourceUri(uriLine);
            const id = (block[0].match(/\btvg-id="([^"]*)"/) || [])[1];
            const channel = byUri.get(uri) || (id && byId.get(id)) || {};
            // ID lookup selects the channel only. It never authenticates its probe.
            result.push(_apeFinalizeReaChannel(block.join('\n'), { channel, playbackUrl: uri, options: options || {} }));
        }
        return result.join('\n');
    }

    return {
        finalizePlaylist: _apeFinalizeReaPlaylist,
        finalizeChannelBlock: _apeFinalizeReaChannel,
        getSourceEvidence: _apeReaSourceEvidence,
        getProcessingIntent: _apeReaProcessingIntent,
        validateRequiredHeaders: validateRequiredHeaders
    };
});
