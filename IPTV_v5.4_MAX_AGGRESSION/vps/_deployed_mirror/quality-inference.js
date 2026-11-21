/**
 * quality-inference.js
 * Lógica de inferencia de calidad compartida (Window + Worker)
 */

class QualityInference {
    static applyQualityInference(ch) {
        if (!ch) return;
        const name = ch.name || '';
        const group = ch.group || '';
        ch.resolution = ch.resolution || this.inferResolution(name, group);
        ch.codec = ch.codec || this.inferCodec(name);
        ch.frames = ch.frames || this.inferFps(name);
    }

    static inferResolution(name, group) {
        const text = (name + ' ' + (group || '')).toUpperCase();
        if (text.includes('8K') || text.includes('4320P') || text.includes('8KUHD')) return '8K';
        if (text.includes('4K') || text.includes('2160') || text.includes('UHD')) return '4K';
        if (text.includes('1440P')) return '1440p';
        if (text.includes('1080') || text.includes('FHD') || text.includes('FULL HD')) return '1080p';
        if (text.includes('720') || text.includes('HD')) return '720p';
        if (text.includes('480') || text.includes('SD')) return '480p';
        return '';
    }

    static inferCodec(name) {
        const text = name.toUpperCase();
        if (text.includes('HEVC') || text.includes('H265')) return 'HEVC';
        if (text.includes('AVC') || text.includes('H264')) return 'H264';
        if (text.includes('AV1')) return 'AV1';
        if (text.includes('VP9')) return 'VP9';
        return '';
    }

    static inferFps(name) {
        const text = name.toUpperCase();
        if (text.includes('60FPS') || text.includes('@60')) return 60;
        if (text.includes('50FPS') || text.includes('@50')) return 50;
        return 0;
    }
}

// Exponer globalmente (Window o Worker)
if (typeof self !== 'undefined') {
    self.QualityInference = QualityInference;
} else if (typeof window !== 'undefined') {
    window.QualityInference = QualityInference;
}
