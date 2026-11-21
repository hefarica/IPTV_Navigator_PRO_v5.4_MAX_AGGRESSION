class EnrichmentDelta {
    constructor(app) {
        this.app = app;
        this.batchSize = 50;
        this.batchDelay = 150; // ms
        this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
    }

    async syncSource(sourceId) {
        if (!this.app.sourceManager) return;
        const source = this.app.sourceManager.sources.find(s => s.id === sourceId);
        if (!source) return alert('Fuente no encontrada');

        const statusUI = document.getElementById('enrichmentStatus');
        const progressBar = document.getElementById('enrichmentBar');
        const detailsUI = document.getElementById('enrichmentDetails');

        if (statusUI) statusUI.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (detailsUI) detailsUI.textContent = `Iniciando sincronización con ${source.label}...`;

        try {
            console.log(`🔍 Detectando cambios en ${source.baseUrl}`);

            // 1. Detect Changes (Delta Check)
            const changeCheck = await this.detectChanges(source.baseUrl);
            let externalData = [];

            if (!changeCheck.hasChanges && changeCheck.cachedData) {
                console.log('✅ Sin cambios (hash coincide). Usando caché.');
                if (detailsUI) detailsUI.textContent = 'Usando caché local (sin cambios detectados)...';
                externalData = changeCheck.cachedData;
            } else {
                console.log(`📥 Descargando desde ${source.baseUrl}`);
                if (detailsUI) detailsUI.textContent = 'Descargando datos actualizados...';
                externalData = await this.fetchJSON(source.baseUrl);

                // Save to Cache if valid
                if (Array.isArray(externalData) && externalData.length > 0) {
                    await this.saveToCache(source.baseUrl, externalData, changeCheck.newHash);
                }
            }

            if (!externalData || !externalData.length) throw new Error('Datos vacíos o inválidos');

            // 2. Enrich Process
            console.log(`✨ Enriqueciendo ${this.app.state.channelsMaster.length} canales locales con ${externalData.length} items externos...`);

            const stats = { enriched: 0, logos: 0 };
            const total = this.app.state.channelsMaster.length;
            let processed = 0;

            // Batch Processing Generator
            const enricher = this.enrichBatchGenerator(this.app.state.channelsMaster, externalData);

            // Execute Batches
            for await (const batchResult of enricher) {
                processed += batchResult.count;
                stats.enriched += batchResult.enriched;
                stats.logos += batchResult.logos;

                // Update UI
                const percent = Math.min(100, Math.round((processed / total) * 100));
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (detailsUI) detailsUI.textContent = `${processed} / ${total} canales procesados...`;
            }

            // 3. Finalize
            this.app.sourceManager.updateSourceStats(sourceId, {
                channels: externalData.length,
                logos: stats.logos
            });

            // Save enriched channels to DB
            await this.app.saveChannelsList();

            this.app.renderTable();

            if (detailsUI) detailsUI.textContent = '¡Completado!';
            setTimeout(() => { if (statusUI) statusUI.style.display = 'none'; }, 2000);

            alert(`✅ Sincronización completada.\n\nDatos fuente: ${externalData.length}\nCanales enriquecidos: ${stats.enriched}\nLogos nuevos: ${stats.logos}`);

        } catch (e) {
            console.error('Sync error:', e);
            if (detailsUI) detailsUI.textContent = `Error: ${e.message}`;
            alert(`❌ Error: ${e.message}`);
        }
    }

    async detectChanges(url) {
        try {
            // HEAD request to get ETag or Content-Length
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) return { hasChanges: true }; // Force download if generic error

            const newHash = response.headers.get('ETag') || response.headers.get('Content-Length') || null;
            if (!newHash) return { hasChanges: true }; // Cannot validate, force download

            // Check IndexedDB for previous hash
            const cacheKey = `delta:hash:${url}`;
            const cached = await this.app.db.getAppState(cacheKey);

            if (cached && cached.hash === newHash && (Date.now() - cached.timestamp < this.cacheTTL)) {
                // Hash matches + TTL valid -> Try to load content from cache
                const contentKey = `delta:content:${url}`;
                const content = await this.app.db.getAppState(contentKey);
                if (content) return { hasChanges: false, cachedData: content, newHash };
            }

            return { hasChanges: true, newHash };
        } catch (e) {
            console.warn('Delta check failed, forcing download', e);
            return { hasChanges: true };
        }
    }

    async fetchJSON(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    async saveToCache(url, data, hash) {
        if (!this.app.db) return;
        try {
            await this.app.db.saveAppState(`delta:hash:${url}`, { hash, timestamp: Date.now() });
            await this.app.db.saveAppState(`delta:content:${url}`, data); // Caution: large data in IndexedDB
        } catch (e) { console.warn('Cache save failed', e); }
    }

    // Generator function for non-blocking batches
    async *enrichBatchGenerator(localChannels, externalData) {
        // Index external data for O(1) lookups
        // Map by name (normalized) and tvg-id
        const mapByName = new Map();
        const mapById = new Map();

        externalData.forEach(item => {
            if (item.name) mapByName.set(item.name.toLowerCase().trim(), item);
            if (item.tvg_id) mapById.set(item.tvg_id, item);
        });

        let processedCount = 0;
        let batchCount = 0;
        let enrichedCount = 0;
        let logoCount = 0;

        for (const channel of localChannels) {
            let match = null;

            // Strategy 1: TVG-ID
            if (channel.tvgId) match = mapById.get(channel.tvgId);

            // Strategy 2: Name Exact
            if (!match && channel.name) match = mapByName.get(channel.name.toLowerCase().trim());

            if (match) {
                let modified = false;

                // Enrich Logo
                if (!channel.logo && match.logo) {
                    channel.logo = match.logo;
                    channel.stream_icon = match.logo; // Sync both
                    logoCount++;
                    modified = true;
                }

                // Enrich ID
                if (!channel.tvgId && match.tvg_id) {
                    channel.tvgId = match.tvg_id;
                    modified = true;
                }

                if (modified) enrichedCount++;
            }

            processedCount++;
            batchCount++;

            if (batchCount >= this.batchSize) {
                // Yield control to UI
                await new Promise(resolve => setTimeout(resolve, this.batchDelay));
                yield { count: batchCount, enriched: enrichedCount, logos: logoCount };

                // Reset batch counters (accumulated are returned but typically we just want delta or total)
                // Let's yield deltas
                batchCount = 0;
                enrichedCount = 0;
                logoCount = 0;
            }
        }

        // Final yield remaining
        if (batchCount > 0) {
            yield { count: batchCount, enriched: enrichedCount, logos: logoCount };
        }
    }
}

// Export
window.EnrichmentDelta = EnrichmentDelta;
