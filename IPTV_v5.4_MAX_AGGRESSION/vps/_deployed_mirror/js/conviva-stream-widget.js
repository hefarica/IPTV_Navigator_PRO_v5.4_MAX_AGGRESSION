/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  conviva-stream-widget.js — Phase 3.2 SSE client                         ║
 * ║  IPTV Navigator PRO v5.4 · APE PRISMA Conviva Stream Bridge              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Browser-side EventSource consumer for /prisma/api/conviva-stream (Phase 3.1).
 *
 * Exposes `window.ConvivaStream` with:
 *
 *   ConvivaStream.connect({ session_id, device_id, tail, autoConnect, url })
 *     · Opens an SSE connection. Browser handles auto-reconnect with Last-Event-ID.
 *     · Returns the underlying EventSource (or null if SSE unsupported).
 *
 *   ConvivaStream.disconnect()
 *     · Closes the connection cleanly.
 *
 *   ConvivaStream.on(eventName, handler)    /  ConvivaStream.off(eventName, handler)
 *     · Pub/sub for: 'conviva' (telemetry frame), 'open', 'error',
 *                    'reconnect' (server hard-cap reached, EventSource will re-open),
 *                    'close'    (server signaled end of stream).
 *
 *   ConvivaStream.isConnected()              → boolean
 *   ConvivaStream.getStats()                 → { eventsReceived, lastEventId, openedAt }
 *
 * Browser support: EventSource is available in all evergreen browsers + Smart TV
 * WebKit. If unavailable, connect() returns null and emits a 'no-eventsource' error.
 *
 * Telemetry payload shape (from /dev/shm/conviva-events.log via SSE):
 *   { t, s, d, p, c, e, q, dec }
 *   = timestamp_ms, session_id, device_id, player, channel_id,
 *     event_type, qoe_score, decision
 *
 * GATE 1 CABLEADO:
 *   - Producer: vps/prisma/lib/conviva_persistence.php (Phase 2 DEPLOYED)
 *   - Endpoint: /prisma/api/conviva-stream (Phase 3.1 DEPLOYED)
 *   - Consumer: this file, wired in index-v4.html with <script defer>
 *
 * @version 1.0.0
 * @see .agents/artifacts/ARTIFACT_CONVIVA_PHASE3_STREAM_DESIGN.md
 * @see vps/prisma/api/conviva-stream.php
 */
(function () {
    'use strict';

    const VERSION = '1.0.0';
    const DEFAULT_URL = '/prisma/api/conviva-stream';
    const DEFAULT_TAIL = 50;
    const MAX_TAIL = 500;
    const LOG_PREFIX = '[ConvivaStream]';

    let _es = null;                  // EventSource instance
    let _opts = null;                // last connect opts (for diagnostics)
    let _handlers = Object.create(null);
    let _stats = {
        eventsReceived: 0,
        lastEventId: 0,
        openedAt: 0,
        reconnectCount: 0
    };

    function _ensureBus(eventName) {
        if (!_handlers[eventName]) { _handlers[eventName] = new Set(); }
        return _handlers[eventName];
    }

    function _emit(eventName, payload) {
        const bus = _handlers[eventName];
        if (!bus || bus.size === 0) { return; }
        for (const h of bus) {
            try { h(payload); }
            catch (err) { console.error(`${LOG_PREFIX} handler error for "${eventName}":`, err); }
        }
    }

    function _buildUrl(base, params) {
        const qs = [];
        if (params.session_id) { qs.push('session_id=' + encodeURIComponent(params.session_id)); }
        if (params.device_id)  { qs.push('device_id='  + encodeURIComponent(params.device_id));  }
        let tail = (typeof params.tail === 'number') ? params.tail : DEFAULT_TAIL;
        tail = Math.max(0, Math.min(MAX_TAIL, tail | 0));
        qs.push('tail=' + tail);
        return base + (qs.length ? ('?' + qs.join('&')) : '');
    }

    const ConvivaStream = {

        VERSION,

        /**
         * Open the SSE connection.
         * @param {object} [opts]
         * @param {string} [opts.url]        Endpoint URL (default: /prisma/api/conviva-stream)
         * @param {string} [opts.session_id] Filter by session id
         * @param {string} [opts.device_id]  Filter by device id
         * @param {number} [opts.tail=50]    Initial backlog frames (0..500)
         * @param {boolean}[opts.autoConnect] Reserved; EventSource reconnects natively
         * @returns {EventSource|null}
         */
        connect(opts) {
            opts = opts || {};
            if (typeof window.EventSource !== 'function') {
                _emit('error', { code: 'no-eventsource', message: 'EventSource not supported' });
                console.warn(`${LOG_PREFIX} EventSource not supported in this browser`);
                return null;
            }

            if (_es) {
                console.warn(`${LOG_PREFIX} already connected; call disconnect() first`);
                return _es;
            }

            const url = _buildUrl(opts.url || DEFAULT_URL, opts);
            _opts = opts;

            try {
                _es = new EventSource(url, { withCredentials: false });
            } catch (err) {
                _emit('error', { code: 'eventsource-construct-failed', error: err });
                return null;
            }

            _es.addEventListener('open', () => {
                _stats.openedAt = Date.now();
                console.log(`${LOG_PREFIX} open (url=${url})`);
                _emit('open', { url });
            });

            // Main telemetry frames (named 'conviva' from server)
            _es.addEventListener('conviva', (evt) => {
                _stats.eventsReceived++;
                if (evt.lastEventId) { _stats.lastEventId = parseInt(evt.lastEventId, 10) || 0; }
                let payload = null;
                try { payload = JSON.parse(evt.data); }
                catch (parseErr) {
                    _emit('error', { code: 'parse', error: parseErr, raw: evt.data });
                    return;
                }
                _emit('conviva', payload);
            });

            // Server-initiated hard reconnect (e.g. MAX_STREAM_SECONDS reached)
            _es.addEventListener('reconnect', (evt) => {
                _stats.reconnectCount++;
                let info = null;
                try { info = JSON.parse(evt.data); } catch (_) { /* ignore */ }
                console.log(`${LOG_PREFIX} server hinted reconnect`, info);
                _emit('reconnect', info);
                // EventSource will auto-reopen with Last-Event-ID after server closes.
            });

            // Server-initiated final close
            _es.addEventListener('close', (evt) => {
                let info = null;
                try { info = JSON.parse(evt.data); } catch (_) { /* ignore */ }
                console.log(`${LOG_PREFIX} server close`, info);
                _emit('close', info);
            });

            // Generic transport-level errors (network drop, server unreachable, etc.)
            _es.addEventListener('error', (evt) => {
                _emit('error', { code: 'transport', readyState: _es && _es.readyState });
            });

            return _es;
        },

        disconnect() {
            if (_es) {
                try { _es.close(); } catch (_) {}
                _es = null;
                console.log(`${LOG_PREFIX} disconnected`);
            }
        },

        on(eventName, handler) {
            if (typeof handler !== 'function') { return; }
            _ensureBus(eventName).add(handler);
        },

        off(eventName, handler) {
            const bus = _handlers[eventName];
            if (bus) { bus.delete(handler); }
        },

        isConnected() {
            return !!(_es && _es.readyState === 1 /* OPEN */);
        },

        getStats() {
            return Object.assign({
                connected: this.isConnected(),
                lastOpts: _opts
            }, _stats);
        }
    };

    // Expose globally
    if (typeof window !== 'undefined') {
        window.ConvivaStream = ConvivaStream;
        console.log(`${LOG_PREFIX} loaded v${VERSION} — call ConvivaStream.connect({tail:50})`);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ConvivaStream;
    }
})();
