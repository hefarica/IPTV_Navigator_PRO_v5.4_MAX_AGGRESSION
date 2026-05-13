/**
 * batch-processor.js
 * Generic batch processing utility with dynamic source priority support
 * 
 * v4.8.1 - IIFE/Global compatible, uses timeRemaining() for optimal UI responsiveness
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // BATCH PROCESSING WITH requestIdleCallback
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Process channels in batches without blocking UI
     * Uses requestIdleCallback with timeRemaining() for smooth operation
     */
    window.batchUpdateChannels = function (channels, onBatch, options) {
        options = options || {};
        var batchSize = options.batchSize || 500;
        var onComplete = options.onComplete || function () { };
        var onProgress = options.onProgress || function () { };
        var useIdle = typeof requestIdleCallback === 'function';

        var index = 0;
        var total = channels.length;

        function runBatch(deadline) {
            // Process as many batches as we have time for
            while ((!deadline || deadline.timeRemaining() > 5) && index < total) {
                var slice = channels.slice(index, index + batchSize);
                if (slice.length === 0) break;

                try {
                    onBatch(slice, index, Math.round((index / total) * 100));
                } catch (e) {
                    console.error('[BatchProcessor] Error:', e);
                }

                index += batchSize;
            }

            // Report progress
            if (index < total) {
                onProgress(Math.round((index / total) * 100), index, total);

                if (useIdle) {
                    requestIdleCallback(runBatch);
                } else {
                    setTimeout(runBatch, 0);
                }
            } else {
                onProgress(100, total, total);
                onComplete(total);
            }
        }

        // Start processing
        if (useIdle) {
            requestIdleCallback(runBatch);
        } else {
            setTimeout(runBatch, 0);
        }

        // Return controller
        return {
            abort: function () {
                index = total; // Skip remaining
                console.log('[BatchProcessor] Aborted');
            }
        };
    };

    // ═══════════════════════════════════════════════════════════════════
    // DYNAMIC SOURCE PRIORITY RESOLUTION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Default source priority policies
     */
    var DEFAULT_SOURCE_POLICIES = {
        resolution: { mode: 'priority', order: ['external.probe-rosa', 'tech', 'heuristics', 'base'] },
        bitrate: { mode: 'best', order: ['external.probe-rosa', 'tech', 'heuristics'] },
        codec: { mode: 'priority', order: ['external.probe-rosa', 'tech', 'heuristics', 'base'] },
        fps: { mode: 'priority', order: ['external.probe-rosa', 'tech'] },
        country: { mode: 'priority', order: ['external.iptv-org', 'external.tdt', 'heuristics', 'base'] },
        language: { mode: 'priority', order: ['external.iptv-org', 'heuristics', 'base'] },
        logo: { mode: 'fallback', order: ['base', 'external.iptv-org', 'external.tdt'] },
        name: { mode: 'fixed', source: 'base' },
        group: { mode: 'fixed', source: 'base' }
    };

    /**
     * Get value from nested source path like 'external.probe-rosa'
     */
    function getFromPath(channel, field, sourcePath) {
        if (!channel || !sourcePath) return null;

        // Handle nested paths
        if (sourcePath.indexOf('.') !== -1) {
            var parts = sourcePath.split('.');
            var data = channel;
            for (var i = 0; i < parts.length; i++) {
                data = data ? data[parts[i]] : null;
                if (!data) return null;
            }
            return data[field] !== undefined ? data[field] : null;
        }

        // Handle standard sources
        switch (sourcePath) {
            case 'base':
            case 'server':
                return channel.base && channel.base[field] !== undefined ? channel.base[field] :
                    channel.raw && channel.raw[field] !== undefined ? channel.raw[field] :
                        channel[field] !== undefined ? channel[field] : null;

            case 'heuristics':
                return channel.heuristics ? channel.heuristics[field] : null;

            case 'tech':
            case 'probe':
                if (!channel.tech) return null;
                if (field === 'resolution') {
                    return channel.tech.resolutionLabel ||
                        (channel.tech.width && channel.tech.height ? channel.tech.width + 'x' + channel.tech.height : null);
                }
                if (field === 'bitrate') return channel.tech.bitrateKbps || channel.tech.bitrate || null;
                if (field === 'fps') return channel.tech.fps || channel.tech.frameRate || null;
                return channel.tech[field] !== undefined ? channel.tech[field] : null;

            case 'external':
                return channel.external ? channel.external[field] : null;

            case 'quality':
                return channel.quality ? channel.quality[field] : null;

            default:
                return null;
        }
    }

    /**
     * Resolve field value using dynamic source priority
     */
    window.resolveFieldWithPriority = function (channel, field, customPolicy) {
        var policy = customPolicy || DEFAULT_SOURCE_POLICIES[field] || null;

        if (!policy) {
            // Default fallback: tech > base > heuristics > external
            var defaultOrder = ['tech', 'base', 'heuristics', 'external'];
            for (var i = 0; i < defaultOrder.length; i++) {
                var val = getFromPath(channel, field, defaultOrder[i]);
                if (val !== null && val !== undefined && val !== '') return val;
            }
            return null;
        }

        var sources = policy.order || (policy.source ? [policy.source] : []);

        // FIXED MODE
        if (policy.mode === 'fixed' && policy.source) {
            return getFromPath(channel, field, policy.source);
        }

        // PRIORITY / FALLBACK MODE
        if (policy.mode === 'priority' || policy.mode === 'fallback') {
            for (var j = 0; j < sources.length; j++) {
                var value = getFromPath(channel, field, sources[j]);
                if (value !== null && value !== undefined && value !== '') {
                    return value;
                }
            }
            return null;
        }

        // BEST MODE (highest numeric value)
        if (policy.mode === 'best') {
            var values = [];
            for (var k = 0; k < sources.length; k++) {
                var v = getFromPath(channel, field, sources[k]);
                if (v !== null && v !== undefined && v !== '') {
                    var numValue = typeof v === 'number' ? v : parseFloat(v);
                    if (!isNaN(numValue)) {
                        values.push({ source: sources[k], value: numValue, original: v });
                    }
                }
            }
            if (values.length > 0) {
                values.sort(function (a, b) { return b.value - a.value; });
                return values[0].original;
            }
            return null;
        }

        return null;
    };

    /**
     * Batch process channels with source priority resolution
     * Resolves all fields according to policies during batch processing
     */
    window.batchProcessWithPriority = function (channels, fields, onBatch, options) {
        options = options || {};
        var policies = options.policies || DEFAULT_SOURCE_POLICIES;

        return window.batchUpdateChannels(channels, function (batch, index, progress) {
            // Resolve each field for each channel in batch
            var resolvedBatch = batch.map(function (channel) {
                var resolved = {};
                for (var i = 0; i < fields.length; i++) {
                    var field = fields[i];
                    resolved[field] = window.resolveFieldWithPriority(channel, field, policies[field]);
                }
                channel._resolved = resolved;
                return channel;
            });

            onBatch(resolvedBatch, index, progress);
        }, options);
    };

    // ═══════════════════════════════════════════════════════════════════
    // WORKER MESSAGE HANDLER
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Setup worker message handler with automatic batching
     */
    window.setupWorkerHandler = function (worker, handlers, options) {
        options = options || {};
        var batchSize = options.batchSize || 500;
        var enableBatching = options.enableBatching !== false;

        worker.onmessage = function (event) {
            var data = event.data;
            var type = data.type;
            var channels = data.channels;

            var handler = handlers[type];
            if (!handler) {
                console.warn('[WorkerHandler] No handler for type: ' + type);
                return;
            }

            // Batch large channel arrays
            if (enableBatching && channels && Array.isArray(channels) && channels.length > batchSize) {
                console.log('[WorkerHandler] Batching ' + channels.length + ' channels...');

                window.batchUpdateChannels(channels, function (batch, index, progress) {
                    handler({
                        type: type,
                        channels: batch,
                        batchIndex: index,
                        progress: progress,
                        isBatch: true
                    });
                }, {
                    batchSize: batchSize,
                    onComplete: function (total) {
                        console.log('[WorkerHandler] ✅ Finished: ' + type + ' (' + total + ' channels)');
                        if (handlers.batchComplete) {
                            handlers.batchComplete({ type: type, total: total });
                        }
                    }
                });
            } else {
                handler(data);
            }
        };

        worker.onerror = function (error) {
            console.error('[WorkerHandler] Error:', error);
            if (handlers.error) handlers.error(error);
        };
    };

    // ═══════════════════════════════════════════════════════════════════
    // EXPOSE DEFAULT POLICIES
    // ═══════════════════════════════════════════════════════════════════

    window.DEFAULT_SOURCE_POLICIES = DEFAULT_SOURCE_POLICIES;

    console.log('✅ BatchProcessor v4.8.1 cargado (con prioridad dinámica)');

})();
