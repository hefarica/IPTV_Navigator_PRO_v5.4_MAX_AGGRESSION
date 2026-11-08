/** REA metadata catalogs. Source evidence and requested processing stay separate. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.APE_REA_CATALOG = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : self, function createReaCatalog(root) {
    'use strict';
    const columns = ['ID', 'Name', 'URL', 'Group', 'RequestHeadersJSON', 'SourceStatus',
        'SourceResolution', 'SourceCodecs', 'SourceFPS', 'SourceVideoRange',
        'REA_Policy', 'REA_TargetResolution', 'REA_HDRIntent', 'REA_Status', 'REA_Execution'];

    function runtime() {
        const api = root.APE_REA_EXPORT;
        if (!api || typeof api.getSourceEvidence !== 'function' || typeof api.getProcessingIntent !== 'function') {
            throw new Error('Falta el finalizador REA. Recarga la aplicación antes de exportar.');
        }
        return api;
    }

    function sourceUrl(channel, options) {
        const ch = channel || {}, opts = options || {};
        for (const value of [ch.url, ch.base && ch.base.url, ch.direct_source, ch.stream_url]) {
            // An already supplied URL is opaque: no normalization of signatures,
            // ports, query strings, escaping or inline player headers.
            if (typeof value === 'string' && value.length) return value;
        }
        if (typeof opts.urlForChannel === 'function') return String(opts.urlForChannel(ch) || '');
        const app = opts.app || root.app;
        const state = app && app.state || {};
        const sid = ch.serverId || ch.server_id;
        const server = sid ? (state.activeServers || []).find(s => s.id === sid) : state.currentServer;
        const base = server && String(server.baseUrl || server.url || '')
            .replace(/\/player_api\.php(?:\?.*)?$/i, '').replace(/\/+$/, '');
        if (!base || !/^https?:\/\/[^\s]+$/i.test(base)
            || server.username == null || server.password == null || ch.stream_id == null) return '';
        const type = ch.stream_type || ch.type;
        const route = type === 'movie' ? 'movie' : (type === 'series' ? 'series' : 'live');
        const ext = route === 'movie' ? (ch.container_extension || 'mp4')
            : (route === 'series' ? 'mp4' : (state.streamFormat || 'ts'));
        return base + '/' + route + '/' + encodeURIComponent(server.username) + '/'
            + encodeURIComponent(server.password) + '/' + ch.stream_id + '.' + ext;
    }

    function suppliedHeaders(channel, options) {
        const ch = channel || {}, opts = options || {};
        const result = Object.create(null);
        for (const input of [opts.requestHeaders, ch.base && ch.base.headers,
            ch.headers, ch.http_headers, ch.httpHeaders, ch.requestHeaders]) {
            if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
            for (const key of Object.keys(input)) {
                if (input[key] != null) result[key] = String(input[key]);
            }
        }
        return result;
    }

    function channelRecord(channel, options) {
        const ch = channel || {}, opts = options || {}, api = runtime();
        const url = sourceUrl(ch, opts);
        const source = api.getSourceEvidence(ch, url);
        return {
            id: ch.stream_id ?? ch.id ?? null,
            name: ch.base && ch.base.name || ch.name || '',
            group: ch.base && ch.base.group || ch.group || ch.category_name || '',
            tvg_id: ch.tvg_id || ch.epg_channel_id || '',
            logo: ch.base && ch.base.logo || ch.logo || ch.stream_icon || '',
            url: url,
            urlStatus: url ? 'supplied_or_constructed' : 'missing',
            requestHeaders: suppliedHeaders(ch, opts),
            headersStatus: 'supplied_only',
            source: source,
            processing: api.getProcessingIntent(source, opts),
            catalogHints: {
                resolution: ch.resolution || ch.base && ch.base.resolution || null,
                codec: ch.codec || null,
                fps: ch.fps ?? null,
                status: 'unverified_catalog_metadata'
            }
        };
    }

    function metadata(options, count) {
        const opts = options || {};
        const policy = opts.rea_processing || opts.reaProcessing
            || root.APE_PROFILES_CONFIG && root.APE_PROFILES_CONFIG.reaProcessing
            || root.APE_REA_POLICY && root.APE_REA_POLICY.policy || null;
        return {
            schema: 'ape.rea-catalog/1',
            kind: 'metadata_catalog',
            channelCount: count,
            delivery: 'source_urls',
            requestedDelivery: opts.dual || 'direct',
            transportApplied: false,
            rea_processing: policy,
            execution: 'not_verified'
        };
    }

    function createCatalog(channels, options) {
        const list = Array.isArray(channels) ? channels : [];
        return Object.assign(metadata(options, list.length), {
            channels: list.map(ch => channelRecord(ch, options))
        });
    }

    function toJSON(channels, options) { return JSON.stringify(createCatalog(channels, options), null, 2); }

    function row(record) {
        return {
            ID: record.id ?? '', Name: record.name, URL: record.url, Group: record.group,
            RequestHeadersJSON: JSON.stringify(record.requestHeaders), SourceStatus: record.source.status,
            SourceResolution: record.source.resolution || '', SourceCodecs: record.source.codecs || '',
            SourceFPS: record.source.frameRate ?? '', SourceVideoRange: record.source.videoRange || '',
            REA_Policy: record.processing.policyId || '',
            REA_TargetResolution: record.processing.targetResolution || '',
            REA_HDRIntent: record.processing.hdr, REA_Status: record.processing.status,
            REA_Execution: record.processing.execution
        };
    }

    function toRows(channels, options) { return (channels || []).map(ch => row(channelRecord(ch, options))); }
    function csvCell(value) {
        let text = String(value == null ? '' : value);
        // Provider names/groups are untrusted text. Quoting CSV syntax alone
        // does not stop a spreadsheet from interpreting a formula. Numeric
        // measurements remain numbers; HTTP(S) URLs are unchanged byte for byte.
        if (typeof value === 'string' && /^[\u0000-\u0020\u00a0\ufeff]*[=+\-@]/.test(text)) text = "'" + text;
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }
    function csvRow(values) { return values.map(csvCell).join(',') + '\r\n'; }

    function createJSONStream(channels, options) {
        const list = Array.isArray(channels) ? channels : [], encoder = new TextEncoder();
        let position = -1;
        return new ReadableStream({
            pull(controller) {
                if (position === -1) {
                    const head = JSON.stringify(metadata(options, list.length));
                    controller.enqueue(encoder.encode(head.slice(0, -1) + ',"channels":['));
                    position = 0;
                } else if (position < list.length) {
                    controller.enqueue(encoder.encode((position ? ',' : '') + JSON.stringify(channelRecord(list[position], options))));
                    position++;
                } else {
                    controller.enqueue(encoder.encode(']}\n'));
                    controller.close();
                }
            }
        });
    }

    function createCSVStream(channels, options) {
        const list = Array.isArray(channels) ? channels : [], encoder = new TextEncoder();
        let position = -1;
        return new ReadableStream({
            pull(controller) {
                if (position === -1) { controller.enqueue(encoder.encode(csvRow(columns))); position = 0; }
                else if (position < list.length) {
                    const record = row(channelRecord(list[position++], options));
                    controller.enqueue(encoder.encode(csvRow(columns.map(key => record[key]))));
                } else controller.close();
            }
        });
    }

    async function download(stream, options, format) {
        const opts = options || {};
        let filename = opts.filename || ('APE_REA_CATALOG.' + format);
        const gzip = opts.gzip === true;
        const mime = gzip ? 'application/gzip' : (format === 'json' ? 'application/json' : 'text/csv');
        if (gzip) {
            if (typeof root.CompressionStream !== 'function') throw new Error('Este navegador no permite exportar gzip. Desactiva la compresión.');
            stream = stream.pipeThrough(new root.CompressionStream('gzip'));
            if (!filename.endsWith('.gz')) filename += '.gz';
        }
        if (opts.writable) await stream.pipeTo(opts.writable);
        else if (typeof root.showSaveFilePicker === 'function' && opts.useFilePicker !== false) {
            const handle = await root.showSaveFilePicker({ suggestedName: filename,
                types: [{ description: gzip ? 'Catálogo comprimido' : 'Catálogo REA',
                    accept: { [mime]: [gzip ? '.gz' : '.' + format] } }] });
            await stream.pipeTo(await handle.createWritable());
        } else {
            // Browsers without the File System Access API require a Blob. The
            // producer still honors backpressure and never builds a second full string.
            const blob = await new Response(stream, { headers: { 'Content-Type': mime } }).blob();
            const anchor = root.document.createElement('a');
            anchor.href = root.URL.createObjectURL(blob); anchor.download = filename;
            anchor.click();
            const objectUrl = anchor.href;
            setTimeout(function () { root.URL.revokeObjectURL(objectUrl); }, 1000);
        }
        return { format, filename, count: opts.channelCount || 0, delivery: 'source_urls',
            requestedDelivery: opts.dual || 'direct', transportApplied: false, gzip, written: true };
    }

    function downloadJSON(channels, options) {
        const opts = Object.assign({}, options || {}, { channelCount: (channels || []).length });
        return download(createJSONStream(channels, opts), opts, 'json');
    }
    function downloadCSV(channels, options) {
        const opts = Object.assign({}, options || {}, { channelCount: (channels || []).length });
        return download(createCSVStream(channels, opts), opts, 'csv');
    }
    return Object.freeze({ sourceUrl, suppliedHeaders, channelRecord, createCatalog, toJSON, toRows,
        createJSONStream, createCSVStream, downloadJSON, downloadCSV, columns: Object.freeze(columns.slice()) });
});
