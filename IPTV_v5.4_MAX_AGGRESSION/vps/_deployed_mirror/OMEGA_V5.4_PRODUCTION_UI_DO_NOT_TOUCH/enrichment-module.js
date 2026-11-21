/**
 * enrichment-module.js
 * EnrichmentModule - Complemento de enriquecimiento para IPTV Navigator PRO
 *
 * ⚠️ NO reemplaza enrichChannel() de app.js
 * ✅ Se ejecuta DESPUÉS del enriquecimiento interno (hook desde app.enrichChannel)
 * ✅ Usa QualityInference + KNNScorer para calidad y scoring
 */

class EnrichmentModule {
    /**
     * @param {IPTVNavigatorPro} appInstance
     */
    constructor(appInstance) {
        this.app = appInstance || null;

        // Motores industriales ya cargados en index-v4.html
        // quality-inference.js expone window.QualityInference
        this.QualityInference = (typeof window !== "undefined" && window.QualityInference)
            ? window.QualityInference
            : null;

        // knn-scorer.js expone window.knnScorer y window.KNNScorer
        this.knnScorer = (typeof window !== "undefined" && window.knnScorer)
            ? window.knnScorer
            : null;
    }

    /**
     * Punto de entrada principal.
     * Se llama desde app.enrichChannel(channel) SI el módulo está disponible.
     *
     * 🔹 Reglas:
     * - NO modifica la estructura básica del canal creada por normalizeChannel().
     * - Solo agrega/normaliza campos de calidad y scoring.
     * - Siempre retorna el mismo objeto (mutación in-place).
     *
     * @param {Object} channel
     * @returns {Object} channel enriquecido
     */
    enrichChannel(channel) {
        if (!channel || typeof channel !== "object") return channel;

        // 1) Asegurar estructura mínima
        if (!channel.raw) channel.raw = {};
        if (!channel.meta) channel.meta = {};

        // 2) Aplicar inferencia de calidad (resolución, codec, fps)
        this._applyQualityInference(channel);

        // 3) Normalizar algunos campos derivados (flags de calidad, UHD, HD, etc.)
        this._deriveQualityFlags(channel);

        // 4) Calcular Quality Score KNN (0-100)
        this._applyKnnScoring(channel);

        // 5) Derivar etiquetas de presentación (tags legibles)
        this._buildQualityTags(channel);

        // 6) Marcar que el canal fue enriquecido por el módulo externo
        channel.meta.enrichedByModule = true;
        channel.meta.enrichmentVersion = "EnrichmentModule.v1.0";

        return channel;
    }

    // --------------------------------------------------------------
    // 2. Calidad: resolución / codec / FPS
    // --------------------------------------------------------------
    _applyQualityInference(channel) {
        try {
            if (!this.QualityInference) return;
            this.QualityInference.applyQualityInference(channel);
        } catch (e) {
            console.warn("EnrichmentModule: QualityInference error:", e);
        }
    }

    // --------------------------------------------------------------
    // 3. Flags de calidad derivados - ✅ V4.6: Write to heuristics
    // --------------------------------------------------------------
    _deriveQualityFlags(channel) {
        // ✅ V4.6: Ensure heuristics layer exists
        if (!channel.heuristics) channel.heuristics = {};
        const h = channel.heuristics;

        // Get values from layers (read-only)
        const res = (h.resolution || channel.base?.resolution || channel.resolution || "").toString().toUpperCase();
        const group = (channel.base?.group || channel.group || channel.category_name || "").toUpperCase();
        const name = (channel.base?.name || channel.name || "").toUpperCase();
        const type = channel.base?.type || channel.type || 'live';

        // Write flags to heuristics layer
        h.isUHD = res === "4K" || res === "8K";
        h.isHD = !h.isUHD && (res.includes("720") || res.includes("1080") || res.includes("HD"));
        h.isSD = !h.isUHD && !h.isHD;

        h.isSports =
            group.includes("DEPORT") ||
            group.includes("SPORT") ||
            name.includes("FUTBOL") ||
            name.includes("FÚTBOL") ||
            name.includes("NBA") ||
            name.includes("UEFA") ||
            name.includes("LIGA") ||
            name.includes("SPORT");

        h.isMovie =
            (type === "movie") ||
            group.includes("CINE") ||
            group.includes("MOVIES");

        h.isSeries =
            (type === "series") ||
            group.includes("SERIES");

        // Legacy compatibility
        channel.isUHD = h.isUHD;
        channel.isHD = h.isHD;
        channel.isSD = h.isSD;
        channel.isSports = h.isSports;
        channel.isMovie = h.isMovie;
        channel.isSeries = h.isSeries;
    }

    // --------------------------------------------------------------
    // 4. KNN Scoring 0–100 - ✅ V4.6: Write to heuristics
    // --------------------------------------------------------------
    _applyKnnScoring(channel) {
        try {
            if (!this.knnScorer) return;

            // ✅ V4.6: Ensure heuristics layer exists
            if (!channel.heuristics) channel.heuristics = {};

            const score = this.knnScorer.scoreChannel(channel);

            // Write to heuristics layer
            channel.heuristics.qualityScore = score;

            // Conversión a tier simple para UI
            if (score >= 90) channel.heuristics.qualityTier = "ULTRA";
            else if (score >= 75) channel.heuristics.qualityTier = "HIGH";
            else if (score >= 55) channel.heuristics.qualityTier = "MEDIUM";
            else channel.heuristics.qualityTier = "LOW";

            // Legacy compatibility
            channel.qualityScore = score;
            channel.qualityTier = channel.heuristics.qualityTier;
        } catch (e) {
            console.warn("EnrichmentModule: KNN scoring error:", e);
        }
    }

    // --------------------------------------------------------------
    // 5. Tags legibles para tabla / export - ✅ V4.6: Write to heuristics
    // --------------------------------------------------------------
    _buildQualityTags(channel) {
        // ✅ V4.6: Ensure heuristics layer exists
        if (!channel.heuristics) channel.heuristics = {};
        const h = channel.heuristics;

        const tags = [];

        if (h.isUHD) tags.push("UHD");
        else if (h.isHD) tags.push("HD");
        else if (h.isSD) tags.push("SD");

        if (h.isSports) tags.push("Sports");
        if (h.isMovie) tags.push("Movies");
        if (h.isSeries) tags.push("Series");

        const codec = h.codec || channel.codec;
        if (codec) tags.push(codec.toUpperCase());

        const fps = h.fps || channel.frames;
        if (fps && fps >= 50) tags.push(fps + "fps");

        if (typeof h.qualityScore === "number") {
            tags.push(`QS:${h.qualityScore}`);
        }

        // Write to heuristics layer
        h.qualityTags = tags;

        // Legacy compatibility
        channel.qualityTags = tags;
    }
}

// Exponer globalmente
if (typeof window !== "undefined") {
    window.EnrichmentModule = EnrichmentModule;
}
