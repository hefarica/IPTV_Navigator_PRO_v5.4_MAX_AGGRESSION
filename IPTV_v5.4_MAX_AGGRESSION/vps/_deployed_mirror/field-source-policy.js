/**
 * field-source-policy.js
 * Dynamic field source priority system for IPTV Navigator PRO
 * 
 * Allows configurable priority order for each field across multiple data sources:
 * - base (server data)
 * - tech (probe results)
 * - heuristics (inferred data)
 * - external.* (IPTV-org, TDT, probe-rosa, etc.)
 * 
 * v4.8 - IIFE/Global compatible (no ESModules)
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // DEFAULT FIELD SOURCE POLICIES
    // ═══════════════════════════════════════════════════════════════════

    var defaultFieldSourcePolicy = {
        // Identity - always from server
        name: ['base'],
        group: ['base'],
        id: ['base'],

        // Quality fields - probe/tech has priority
        codec: ['external.probe-rosa', 'tech', 'heuristics', 'base'],
        resolution: ['external.probe-rosa', 'tech', 'heuristics', 'base'],
        bitrate: ['external.probe-rosa', 'tech', 'heuristics', 'base'],
        fps: ['external.probe-rosa', 'tech', 'heuristics'],
        width: ['external.probe-rosa', 'tech', 'heuristics'],
        height: ['external.probe-rosa', 'tech', 'heuristics'],

        // Geographic - external sources have best data
        country: ['external.iptv-org', 'external.tdt', 'heuristics', 'base'],
        language: ['external.iptv-org', 'heuristics', 'base'],

        // Scoring - always from heuristics
        score: ['heuristics'],
        qualityScore: ['heuristics'],
        qualityTier: ['heuristics'],

        // Media assets - prefer server, fallback to external
        logo: ['base', 'external.iptv-org', 'external.tdt'],
        stream_icon: ['base', 'external.iptv-org'],

        // External enrichment - only from external
        website: ['external.iptv-org', 'external.tdt'],
        network: ['external.iptv-org'],
        owner: ['external.iptv-org'],
        categories: ['external.iptv-org'],

        // EPG
        epg_channel_id: ['external.iptv-org', 'base'],
        tv_archive: ['base', 'external.iptv-org']
    };

    // Current active policy (can be modified at runtime)
    var currentPolicy = deepClone(defaultFieldSourcePolicy);

    // ═══════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Navigate nested object path like 'external.probe-rosa'
     */
    function getNestedValue(obj, path, field) {
        if (!obj || !path) return undefined;

        var parts = path.split('.');
        var ref = obj;

        for (var i = 0; i < parts.length; i++) {
            ref = ref ? ref[parts[i]] : undefined;
            if (ref === undefined || ref === null) return undefined;
        }

        return ref[field];
    }

    /**
     * Get value from a specific source
     */
    function getFromSource(channel, source, field) {
        if (!channel) return undefined;

        // Handle nested paths like 'external.probe-rosa'
        if (source.indexOf('.') !== -1) {
            return getNestedValue(channel, source, field);
        }

        // Handle standard sources
        switch (source) {
            case 'base':
            case 'server':
                if (channel.base && channel.base[field] !== undefined) return channel.base[field];
                if (channel.raw && channel.raw[field] !== undefined) return channel.raw[field];
                return channel[field];

            case 'tech':
            case 'probe':
                if (!channel.tech) return undefined;
                // Special mappings for tech layer
                if (field === 'resolution') {
                    return channel.tech.resolutionLabel ||
                        (channel.tech.width && channel.tech.height ?
                            channel.tech.width + 'x' + channel.tech.height : undefined);
                }
                if (field === 'bitrate') return channel.tech.bitrateKbps || channel.tech.bitrate;
                if (field === 'fps') return channel.tech.fps || channel.tech.frameRate;
                return channel.tech[field];

            case 'heuristics':
                return channel.heuristics ? channel.heuristics[field] : undefined;

            case 'external':
                return channel.external ? channel.external[field] : undefined;

            case 'quality':
                return channel.quality ? channel.quality[field] : undefined;

            default:
                return undefined;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Get the value of a field using policy-based priority
     * @param {Object} channel - Channel object
     * @param {string} field - Field name
     * @param {Array} customSources - Optional custom source order
     * @returns {*} Field value or null
     */
    function getField(channel, field, customSources) {
        var sources = customSources || currentPolicy[field] || ['tech', 'base', 'heuristics', 'external'];

        for (var i = 0; i < sources.length; i++) {
            var value = getFromSource(channel, sources[i], field);
            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
        }

        // Final fallback: direct channel property
        return channel[field] !== undefined ? channel[field] : null;
    }

    /**
     * Get the value and its source for debugging/display
     * @param {Object} channel - Channel object
     * @param {string} field - Field name
     * @returns {Object} { value, source }
     */
    function getFieldWithSource(channel, field) {
        var sources = currentPolicy[field] || ['tech', 'base', 'heuristics', 'external'];

        for (var i = 0; i < sources.length; i++) {
            var value = getFromSource(channel, sources[i], field);
            if (value !== undefined && value !== null && value !== '') {
                return { value: value, source: sources[i] };
            }
        }

        if (channel[field] !== undefined) {
            return { value: channel[field], source: 'root' };
        }

        return { value: null, source: null };
    }

    /**
     * Set custom policy for one or more fields
     * @param {Object} newPolicy - Object with field: [sources] mappings
     */
    function setFieldSourcePolicy(newPolicy) {
        if (!newPolicy || typeof newPolicy !== 'object') return;

        for (var field in newPolicy) {
            if (newPolicy.hasOwnProperty(field)) {
                currentPolicy[field] = newPolicy[field];
            }
        }

        console.log('✅ FieldSourcePolicy actualizado:', Object.keys(newPolicy));
    }

    /**
     * Reset policy to defaults
     */
    function resetFieldSourcePolicy() {
        currentPolicy = deepClone(defaultFieldSourcePolicy);
        console.log('🔄 FieldSourcePolicy reseteado a defaults');
    }

    /**
     * Get current policy for a field
     * @param {string} field - Field name
     * @returns {Array} Source order array
     */
    function getFieldPolicy(field) {
        return currentPolicy[field] || null;
    }

    /**
     * Get all current policies
     * @returns {Object} Current policy object
     */
    function getAllPolicies() {
        return deepClone(currentPolicy);
    }

    /**
     * Calculate final view object for a channel (all resolved fields)
     * @param {Object} channel - Channel object
     * @param {Array} fields - Optional list of fields to resolve
     * @returns {Object} Resolved field values
     */
    function calculateFinalView(channel, fields) {
        var result = {};
        var fieldsToResolve = fields || Object.keys(currentPolicy);

        for (var i = 0; i < fieldsToResolve.length; i++) {
            var field = fieldsToResolve[i];
            result[field] = getField(channel, field);
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════
    // EXPOSE TO GLOBAL SCOPE
    // ═══════════════════════════════════════════════════════════════════

    window.FieldSourcePolicy = {
        getField: getField,
        getFieldWithSource: getFieldWithSource,
        setPolicy: setFieldSourcePolicy,
        resetPolicy: resetFieldSourcePolicy,
        getPolicy: getFieldPolicy,
        getAllPolicies: getAllPolicies,
        calculateFinalView: calculateFinalView,
        defaults: defaultFieldSourcePolicy
    };

    // Also expose individual functions for convenience
    window.getFieldByPolicy = getField;
    window.getFieldWithSource = getFieldWithSource;
    window.setFieldSourcePolicy = setFieldSourcePolicy;

    console.log('✅ FieldSourcePolicy v4.8 cargado');

})();
