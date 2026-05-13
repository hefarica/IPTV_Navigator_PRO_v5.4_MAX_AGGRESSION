/**
 * knn-scorer.js
 * Scorer basado en vectores para ranking de canales
 */

class KNNScorer {
    constructor() {
        this.references = {
            'sports_4k': { vector: [25000, 3, 2, 60], category: 'Sports' },
            'cinema_hd': { vector: [8000, 2, 1, 24], category: 'Cinema' },
            'general_sd': { vector: [2000, 1, 0, 30], category: 'General' }
        };
        this.weights = [0.4, 0.3, 0.2, 0.1];
    }

    buildVector(ch) {
        // ✅ V4.6: Use 4-layer model (tech > base > heuristics > legacy)
        const tech = ch.tech || {};
        const base = ch.base || {};
        const heuristics = ch.heuristics || {};

        // Use real bitrate if available from tech, then base, then heuristics
        let b = tech.bitrateKbps ?? base.bitrate ?? heuristics.bitrate ?? ch.bitrate ?? 0;
        if (b > 30000) b = 30000;

        // Resolution Index
        let rIdx = 1; // Default SD/Unknown
        const res = (tech.resolutionLabel ?? base.resolution ?? heuristics.resolution ?? ch.resolution ?? '').toUpperCase();
        if (res === '8K' || res === '4320P') rIdx = 4;
        else if (res === '4K' || res === '2160P') rIdx = 3;
        else if (res === '1080P' || res === 'FHD') rIdx = 2;
        else if (res === '720P' || res === 'HD') rIdx = 1.5;

        // Codec Index
        let cIdx = 0;
        const codec = (tech.codec ?? base.codec ?? heuristics.codec ?? ch.codec ?? '').toUpperCase();
        if (codec.includes('HEVC') || codec.includes('AV1') || codec.includes('H265')) cIdx = 2;
        else if (codec.includes('H264') || codec.includes('AVC')) cIdx = 1;

        // FPS
        const fps = tech.fps ?? base.fps ?? heuristics.fps ?? ch.frames ?? 25;

        return [b, rIdx, cIdx, fps];
    }

    scoreChannel(ch) {
        const v = this.buildVector(ch);
        // Default target: Sports 4K logic for high score
        const ref = this.references['sports_4k'].vector;

        let dist = 0;
        // Normalize distances approximately
        dist += Math.pow((v[0] - ref[0]) / 25000, 2) * this.weights[0];
        dist += Math.pow((v[1] - ref[1]) / 3, 2) * this.weights[1];
        dist += Math.pow((v[2] - ref[2]) / 2, 2) * this.weights[2];
        dist += Math.pow((v[3] - ref[3]) / 60, 2) * this.weights[3];

        return Math.max(0, Math.round((1 - Math.sqrt(dist)) * 100));
    }

    // Alias for inplace scoring - ✅ V4.6: Write to heuristics
    scoreChannelsInPlace(channels) {
        if (!Array.isArray(channels)) return;
        channels.forEach(ch => {
            if (!ch.heuristics) ch.heuristics = {};
            ch.heuristics.qualityScore = this.scoreChannel(ch);
            // Legacy compatibility
            ch.qualityScore = ch.heuristics.qualityScore;
        });
    }
}

// Inicializar instancia global
if (typeof self !== 'undefined') {
    self.KNNScorer = KNNScorer;
    self.knnScorer = new KNNScorer();
} else if (typeof window !== 'undefined') {
    window.KNNScorer = KNNScorer;
    window.knnScorer = new KNNScorer();
}
