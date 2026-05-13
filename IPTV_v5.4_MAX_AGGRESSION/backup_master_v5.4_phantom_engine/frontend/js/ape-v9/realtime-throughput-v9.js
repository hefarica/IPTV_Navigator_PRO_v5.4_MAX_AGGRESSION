/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📊 APE REALTIME THROUGHPUT ANALYZER v9.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Monitors bitrate during playback and detects bottlenecks in real-time.
 * Auto-switches to RESILIENT profile when performance drops.
 * 
 * Features:
 * - Real-time bitrate calculation
 * - Bottleneck detection (>30% drop threshold)
 * - Efficiency scoring
 * - Auto-profile switching
 * 
 * @version 9.0.0
 * @date 2024-12-30
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const CONFIG = {
        VERSION: '9.0.0',
        SAMPLE_INTERVAL_MS: 1000,    // Sample every 1 second
        BOTTLENECK_THRESHOLD: 0.70,  // 30% drop = bottleneck
        MIN_SAMPLES: 5,              // Minimum samples before analysis
        MAX_HISTORY: 60,             // Keep last 60 samples
        DEBUG: false
    };

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    const _monitors = new Map();  // channelId -> monitor state

    // ═══════════════════════════════════════════════════════════
    // MONITOR CLASS
    // ═══════════════════════════════════════════════════════════

    class ThroughputMonitor {
        constructor(channelId, expectedBitrate) {
            this.channelId = channelId;
            this.expectedBitrate = expectedBitrate;
            this.samples = [];
            this.startTime = Date.now();
            this.lastSampleTime = Date.now();
            this.totalBytes = 0;
            this.isActive = true;
            this.bottleneckCount = 0;
            this.maxBitrate = 0;
            this.minBitrate = Infinity;
        }

        addSample(bytesDownloaded) {
            const now = Date.now();
            const elapsed = (now - this.lastSampleTime) / 1000;  // seconds

            if (elapsed <= 0) return null;

            const bitrateKbps = (bytesDownloaded * 8) / elapsed / 1000;  // kbps

            const sample = {
                timestamp: now,
                bytes: bytesDownloaded,
                elapsed,
                bitrate: bitrateKbps
            };

            this.samples.push(sample);
            this.totalBytes += bytesDownloaded;
            this.lastSampleTime = now;

            // Track min/max
            if (bitrateKbps > this.maxBitrate) this.maxBitrate = bitrateKbps;
            if (bitrateKbps < this.minBitrate && bitrateKbps > 0) this.minBitrate = bitrateKbps;

            // Trim history
            if (this.samples.length > CONFIG.MAX_HISTORY) {
                this.samples.shift();
            }

            return sample;
        }

        getCurrentBitrate() {
            if (this.samples.length === 0) return 0;

            // Average of last 3 samples
            const recent = this.samples.slice(-3);
            const sum = recent.reduce((a, s) => a + s.bitrate, 0);
            return sum / recent.length;
        }

        getAverageBitrate() {
            if (this.samples.length === 0) return 0;

            const sum = this.samples.reduce((a, s) => a + s.bitrate, 0);
            return sum / this.samples.length;
        }

        isBottleneck() {
            if (this.samples.length < CONFIG.MIN_SAMPLES) return false;

            const currentBitrate = this.getCurrentBitrate();
            const ratio = currentBitrate / this.expectedBitrate;

            if (ratio < CONFIG.BOTTLENECK_THRESHOLD) {
                this.bottleneckCount++;
                return true;
            }

            return false;
        }

        getEfficiency() {
            const avgBitrate = this.getAverageBitrate();
            if (this.expectedBitrate <= 0) return 'UNKNOWN';

            const ratio = avgBitrate / this.expectedBitrate;

            if (ratio >= 0.9) return 'EXCELLENT';
            if (ratio >= 0.7) return 'GOOD';
            if (ratio >= 0.5) return 'MODERATE';
            if (ratio >= 0.3) return 'POOR';
            return 'CRITICAL';
        }

        getReport() {
            const duration = (Date.now() - this.startTime) / 1000;

            return {
                channelId: this.channelId,
                duration: duration.toFixed(1) + 's',
                totalBytes: this.totalBytes,
                totalMB: (this.totalBytes / 1024 / 1024).toFixed(2),
                samples: this.samples.length,
                currentBitrate: this.getCurrentBitrate().toFixed(0) + ' kbps',
                avgBitrate: this.getAverageBitrate().toFixed(0) + ' kbps',
                maxBitrate: this.maxBitrate.toFixed(0) + ' kbps',
                minBitrate: this.minBitrate === Infinity ? 'N/A' : this.minBitrate.toFixed(0) + ' kbps',
                expectedBitrate: this.expectedBitrate + ' kbps',
                efficiency: this.getEfficiency(),
                bottleneckEvents: this.bottleneckCount
            };
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MONITOR OPERATIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * Start monitoring a channel
     * @param {string} channelId - Channel identifier
     * @param {number} expectedBitrate - Expected bitrate in kbps
     * @returns {Object} Monitor instance
     */
    function startMonitoring(channelId, expectedBitrate = 5000) {
        const monitor = new ThroughputMonitor(channelId, expectedBitrate);
        _monitors.set(channelId, monitor);

        if (CONFIG.DEBUG) {
            console.log(`[Throughput] Started monitoring ${channelId}, expected ${expectedBitrate} kbps`);
        }

        return monitor;
    }

    /**
     * Record bytes downloaded for a channel
     * @param {string} channelId - Channel identifier
     * @param {number} bytesDownloaded - Bytes just downloaded
     * @returns {Object} Metrics
     */
    function recordBytesDownloaded(channelId, bytesDownloaded) {
        const monitor = _monitors.get(channelId);
        if (!monitor || !monitor.isActive) return null;

        const sample = monitor.addSample(bytesDownloaded);
        if (!sample) return null;

        const isBottleneck = monitor.isBottleneck();

        const metrics = {
            channelId,
            bitrate: sample.bitrate,
            efficiency: monitor.getEfficiency(),
            bottleneck: isBottleneck,
            samples: monitor.samples.length
        };

        // Emit event if bottleneck detected
        if (isBottleneck && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ape:bottleneck', {
                detail: {
                    channelId,
                    bitrate: sample.bitrate,
                    expected: monitor.expectedBitrate
                }
            }));
        }

        return metrics;
    }

    /**
     * Stop monitoring a channel
     * @param {string} channelId - Channel identifier
     * @returns {Object} Final report
     */
    function stopMonitoring(channelId) {
        const monitor = _monitors.get(channelId);
        if (!monitor) return null;

        monitor.isActive = false;
        const report = monitor.getReport();

        if (CONFIG.DEBUG) {
            console.log(`[Throughput] Stopped monitoring ${channelId}:`, report);
        }

        // Keep in history but marked inactive
        return report;
    }

    /**
     * Get current metrics for a channel
     */
    function getMetrics(channelId) {
        const monitor = _monitors.get(channelId);
        if (!monitor) return null;

        return {
            channelId,
            isActive: monitor.isActive,
            bitrate: monitor.getCurrentBitrate(),
            avgBitrate: monitor.getAverageBitrate(),
            efficiency: monitor.getEfficiency(),
            bottleneckCount: monitor.bottleneckCount
        };
    }

    /**
     * Get all active monitors
     */
    function getActiveMonitors() {
        return Array.from(_monitors.values())
            .filter(m => m.isActive)
            .map(m => m.getReport());
    }

    // ═══════════════════════════════════════════════════════════
    // ANALYSIS
    // ═══════════════════════════════════════════════════════════

    /**
     * Analyze network performance across all channels
     */
    function analyzeOverallPerformance() {
        const monitors = Array.from(_monitors.values());

        if (monitors.length === 0) {
            return { status: 'NO_DATA', monitors: 0 };
        }

        const efficiencyScores = monitors.map(m => {
            const eff = m.getEfficiency();
            switch (eff) {
                case 'EXCELLENT': return 5;
                case 'GOOD': return 4;
                case 'MODERATE': return 3;
                case 'POOR': return 2;
                case 'CRITICAL': return 1;
                default: return 0;
            }
        });

        const avgScore = efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length;
        const totalBottlenecks = monitors.reduce((a, m) => a + m.bottleneckCount, 0);

        let networkHealth;
        if (avgScore >= 4.5) networkHealth = 'EXCELLENT';
        else if (avgScore >= 3.5) networkHealth = 'GOOD';
        else if (avgScore >= 2.5) networkHealth = 'MODERATE';
        else if (avgScore >= 1.5) networkHealth = 'POOR';
        else networkHealth = 'CRITICAL';

        return {
            status: 'OK',
            monitors: monitors.length,
            activeMonitors: monitors.filter(m => m.isActive).length,
            avgEfficiencyScore: avgScore.toFixed(2),
            networkHealth,
            totalBottlenecks,
            recommendation: totalBottlenecks > 5 ? 'Consider switching to RESILIENT profile' : null
        };
    }

    // ═══════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════

    function getStatus() {
        return {
            version: CONFIG.VERSION,
            totalMonitors: _monitors.size,
            activeMonitors: Array.from(_monitors.values()).filter(m => m.isActive).length,
            bottleneckThreshold: (1 - CONFIG.BOTTLENECK_THRESHOLD) * 100 + '%',
            ready: true
        };
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const RealtimeThroughputAnalyzer = {
        // Monitor operations
        startMonitoring,
        recordBytesDownloaded,
        stopMonitoring,
        getMetrics,
        getActiveMonitors,

        // Analysis
        analyzeOverallPerformance,

        // Status
        getStatus,

        // Data
        monitors: _monitors,

        // Config
        CONFIG
    };

    // Global exports
    window.THROUGHPUT_ANALYZER_V9 = RealtimeThroughputAnalyzer;
    window.APE_Throughput = RealtimeThroughputAnalyzer;  // Alias

    console.log('%c📊 APE Realtime Throughput Analyzer v9.0 Loaded', 'color: #00ff41; font-weight: bold;');

})();
