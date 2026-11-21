/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ✅ DIRECT URL VALIDATOR v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates M3U8 playlists to ensure 100% proxy-free architecture.
 * Checks JWT integrity, URL patterns, and required fields.
 * 
 * Features:
 * - Validates URLs are direct (no proxy patterns)
 * - Verifies JWT tokens have embedded simulators
 * - Reports validation results with statistics
 * - Audit logging for compliance
 * 
 * @version 1.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const CONFIG = {
        VERSION: '1.0.0',

        // Patterns that indicate proxy usage (INVALID for no-proxy architecture)
        PROXY_PATTERNS: [
            /proxy\./i,
            /\/proxy\//i,
            /\bproxy=/i,
            /:8765\//,              // Common proxy port
            /:3128\//,              // Squid proxy default
            /:8080\/proxy/i,        // Proxy on 8080
            /proxy\.php/i,
            /stream-proxy/i,
            /hls-proxy/i,
            /m3u8-proxy/i,
            /rewrite\.php/i,
            /redirect\.php/i
        ],

        // Required JWT fields for no-proxy architecture
        REQUIRED_JWT_FIELDS: [
            'iss',
            'exp',
            'sub',
            'architecture'
        ],

        // Expected architecture value
        EXPECTED_ARCHITECTURE: 'NO_PROXY_DIRECT',

        // Fields that indicate embedded simulators
        SIMULATOR_FIELDS: {
            proxy: 'proxy_simulator',
            ua: 'ua_simulator'
        }
    };

    // ═══════════════════════════════════════════════════════════
    // VALIDATION FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * Validate a single URL is direct (no proxy)
     * @param {string} url - URL to validate
     * @returns {Object} Validation result
     */
    function validateUrl(url) {
        const result = {
            url: url,
            valid: true,
            issues: [],
            checks: {
                noProxyPatterns: true,
                hasJwt: false,
                jwtValid: false,
                hasSimulators: false
            }
        };

        if (!url || typeof url !== 'string') {
            result.valid = false;
            result.issues.push('URL is empty or invalid');
            return result;
        }

        // Check for proxy patterns
        for (const pattern of CONFIG.PROXY_PATTERNS) {
            if (pattern.test(url)) {
                result.valid = false;
                result.checks.noProxyPatterns = false;
                result.issues.push(`Matches proxy pattern: ${pattern}`);
            }
        }

        // Check for JWT token
        const jwtMatch = url.match(/[?&]ape_jwt=([^&]+)/);
        if (jwtMatch) {
            result.checks.hasJwt = true;

            try {
                const token = decodeURIComponent(jwtMatch[1]);
                const jwtResult = validateJWT(token);
                result.jwtValidation = jwtResult;
                result.checks.jwtValid = jwtResult.valid;
                result.checks.hasSimulators = jwtResult.hasSimulators;

                if (!jwtResult.valid) {
                    result.issues.push(`JWT issue: ${jwtResult.error}`);
                }
            } catch (e) {
                result.issues.push(`JWT decode error: ${e.message}`);
            }
        }

        // URL without JWT is still valid for no-proxy, just warn
        if (!result.checks.hasJwt) {
            result.warnings = result.warnings || [];
            result.warnings.push('No JWT token found - simulators will not be available');
        }

        return result;
    }

    /**
     * Validate JWT token structure and content
     * @param {string} token - JWT token
     * @returns {Object} Validation result
     */
    function validateJWT(token) {
        const result = {
            valid: true,
            hasSimulators: false,
            proxySimulator: false,
            uaSimulator: false,
            architecture: null,
            issues: []
        };

        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                result.valid = false;
                result.error = 'Invalid JWT format (expected 3 parts)';
                return result;
            }

            // Decode payload
            const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(payloadB64));

            // Check required fields
            for (const field of CONFIG.REQUIRED_JWT_FIELDS) {
                if (!(field in payload)) {
                    result.issues.push(`Missing required field: ${field}`);
                }
            }

            // Check architecture
            result.architecture = payload.architecture;
            if (payload.architecture !== CONFIG.EXPECTED_ARCHITECTURE) {
                result.issues.push(`Unexpected architecture: ${payload.architecture} (expected: ${CONFIG.EXPECTED_ARCHITECTURE})`);
            }

            // Check expiration
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now) {
                result.valid = false;
                result.error = 'Token expired';
                return result;
            }

            // Check for embedded simulators
            if (payload[CONFIG.SIMULATOR_FIELDS.proxy]) {
                result.proxySimulator = true;
                result.hasSimulators = true;
            }
            if (payload[CONFIG.SIMULATOR_FIELDS.ua]) {
                result.uaSimulator = true;
                result.hasSimulators = true;
            }

            result.payload = payload;

        } catch (e) {
            result.valid = false;
            result.error = `Parse error: ${e.message}`;
        }

        return result;
    }

    /**
     * Validate M3U8 content
     * @param {string} content - M3U8 file content
     * @returns {Object} Full validation report
     */
    function validateM3U8(content) {
        const startTime = performance.now();

        const report = {
            valid: true,
            architecture: CONFIG.EXPECTED_ARCHITECTURE,
            version: CONFIG.VERSION,
            timestamp: new Date().toISOString(),
            stats: {
                totalLines: 0,
                totalUrls: 0,
                validUrls: 0,
                invalidUrls: 0,
                urlsWithJwt: 0,
                urlsWithSimulators: 0
            },
            issues: [],
            warnings: [],
            urlResults: []
        };

        if (!content || typeof content !== 'string') {
            report.valid = false;
            report.issues.push('M3U8 content is empty or invalid');
            return report;
        }

        const lines = content.split('\n');
        report.stats.totalLines = lines.length;

        // Check header
        if (!lines[0].startsWith('#EXTM3U')) {
            report.issues.push('Missing #EXTM3U header');
        }

        // Find and validate URLs
        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments/tags
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // This should be a URL
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                report.stats.totalUrls++;

                const urlResult = validateUrl(trimmed);
                report.urlResults.push(urlResult);

                if (urlResult.valid) {
                    report.stats.validUrls++;
                } else {
                    report.stats.invalidUrls++;
                    report.issues.push(...urlResult.issues.map(i => `URL: ${i}`));
                }

                if (urlResult.checks.hasJwt) {
                    report.stats.urlsWithJwt++;
                }
                if (urlResult.checks.hasSimulators) {
                    report.stats.urlsWithSimulators++;
                }

                if (urlResult.warnings) {
                    report.warnings.push(...urlResult.warnings);
                }
            }
        }

        // Determine overall validity
        report.valid = report.stats.invalidUrls === 0 && report.issues.length === 0;

        // Add performance metrics
        const endTime = performance.now();
        report.validationTimeMs = Math.round(endTime - startTime);

        // Summary
        report.summary = {
            isClean: report.valid,
            proxyFreePercentage: report.stats.totalUrls > 0
                ? Math.round((report.stats.validUrls / report.stats.totalUrls) * 100)
                : 100,
            jwtCoverage: report.stats.totalUrls > 0
                ? Math.round((report.stats.urlsWithJwt / report.stats.totalUrls) * 100)
                : 0,
            simulatorCoverage: report.stats.urlsWithJwt > 0
                ? Math.round((report.stats.urlsWithSimulators / report.stats.urlsWithJwt) * 100)
                : 0
        };

        return report;
    }

    /**
     * Quick validation - just check if clean
     * @param {string} content - M3U8 content
     * @returns {boolean} True if 100% proxy-free
     */
    function isClean(content) {
        const report = validateM3U8(content);
        return report.valid;
    }

    /**
     * Validate from URL
     * @param {string} url - URL to fetch and validate
     * @returns {Promise<Object>} Validation report
     */
    async function validateFromUrl(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                return {
                    valid: false,
                    issues: [`Failed to fetch: ${response.status} ${response.statusText}`]
                };
            }
            const content = await response.text();
            return validateM3U8(content);
        } catch (e) {
            return {
                valid: false,
                issues: [`Fetch error: ${e.message}`]
            };
        }
    }

    /**
     * Generate validation badge/summary
     * @param {Object} report - Validation report
     * @returns {string} Human-readable summary
     */
    function generateSummary(report) {
        const lines = [];

        lines.push('═══════════════════════════════════════════════════════════');
        lines.push('  📋 DIRECT URL VALIDATION REPORT');
        lines.push('═══════════════════════════════════════════════════════════');
        lines.push('');

        if (report.valid) {
            lines.push('  🎉 STATUS: ✅ CLEAN - 100% PROXY FREE');
        } else {
            lines.push('  ⚠️ STATUS: ❌ ISSUES FOUND');
        }

        lines.push('');
        lines.push('  📊 STATISTICS:');
        lines.push(`     • Total URLs: ${report.stats.totalUrls}`);
        lines.push(`     • Valid (Direct): ${report.stats.validUrls} (${report.summary.proxyFreePercentage}%)`);
        lines.push(`     • With JWT: ${report.stats.urlsWithJwt} (${report.summary.jwtCoverage}%)`);
        lines.push(`     • With Simulators: ${report.stats.urlsWithSimulators} (${report.summary.simulatorCoverage}%)`);
        lines.push('');

        if (report.issues.length > 0) {
            lines.push('  🔴 ISSUES:');
            for (const issue of report.issues.slice(0, 10)) {
                lines.push(`     • ${issue}`);
            }
            if (report.issues.length > 10) {
                lines.push(`     ... and ${report.issues.length - 10} more`);
            }
            lines.push('');
        }

        if (report.warnings.length > 0) {
            lines.push('  🟡 WARNINGS:');
            for (const warning of report.warnings.slice(0, 5)) {
                lines.push(`     • ${warning}`);
            }
            lines.push('');
        }

        lines.push(`  ⏱️ Validation Time: ${report.validationTimeMs}ms`);
        lines.push('═══════════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    // AUDIT LOGGING
    // ═══════════════════════════════════════════════════════════

    let auditLog = [];

    function logAudit(action, data) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            data
        };
        auditLog.push(entry);

        // Keep only last 100 entries
        if (auditLog.length > 100) {
            auditLog = auditLog.slice(-100);
        }

        return entry;
    }

    function getAuditLog() {
        return [...auditLog];
    }

    function clearAuditLog() {
        auditLog = [];
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const DirectUrlValidator = {
        // Core validation
        validateUrl,
        validateJWT,
        validateM3U8,
        validateFromUrl,

        // Quick checks
        isClean,

        // Reporting
        generateSummary,

        // Audit
        logAudit,
        getAuditLog,
        clearAuditLog,

        // Config
        CONFIG,

        // Version
        getVersion: () => CONFIG.VERSION
    };

    // Global exports
    window.DirectUrlValidator = DirectUrlValidator;
    window.validateM3U8Direct = validateM3U8;  // Convenience alias

    console.log('%c✅ Direct URL Validator v1.0 Loaded', 'color: #00ff41; font-weight: bold;');
    console.log('   ✅ Validates 100% Proxy-Free Architecture');

})();
