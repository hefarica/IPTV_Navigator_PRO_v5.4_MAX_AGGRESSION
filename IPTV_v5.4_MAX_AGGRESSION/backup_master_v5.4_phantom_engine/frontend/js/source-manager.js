class SourceManager {
    constructor(app) {
        this.app = app;
        this.sources = [];
        this.STORAGE_KEY = 'enrichmentSources';
    }

    async loadSources() {
        if (!this.app.db) return;
        try {
            const data = await this.app.db.getAppState(this.STORAGE_KEY);
            if (data && Array.isArray(data)) {
                this.sources = data;
                console.log(`✅ ${this.sources.length} fuentes cargadas`);
            } else {
                // Default sources if empty
                this.sources = [
                    {
                        id: 'src_iptv_org',
                        label: 'GitHub IPTV-org (Global)',
                        baseUrl: 'https://iptv-org.github.io/iptv/channels.json',
                        type: 'GITHUB_IPTV_ORG',
                        lastSync: null,
                        stats: { channels: 0, logos: 0 },
                        active: true
                    }
                ];
                await this.saveSources();
                console.log('✅ Fuentes por defecto creadas');
            }
            this.renderList();
        } catch (e) {
            console.error('Error loading sources:', e);
        }
    }

    async saveSources() {
        if (!this.app.db) return;
        await this.app.db.saveAppState(this.STORAGE_KEY, this.sources);
        console.log('✅ Fuentes guardadas');
    }

    async addSource(label, baseUrl) {
        if (!baseUrl) throw new Error('URL requerida');

        // Normalize URL
        let url = baseUrl.trim();
        // Basic detection logic could go here, but for now we accept direct URLs
        // If user provides a base github io url, we might want to append /channels.json if not present
        const type = this.detectType(url);

        const newSource = {
            id: 'src_' + Date.now(),
            label: label || 'Nueva Fuente',
            baseUrl: url,
            type: type,
            lastSync: null,
            stats: { channels: 0, logos: 0 },
            active: true
        };

        this.sources.push(newSource);
        await this.saveSources();
        this.renderList();
        return newSource;
    }

    detectType(url) {
        if (url.includes('iptv-org') && url.includes('github')) return 'GITHUB_IPTV_ORG';
        if (url.includes('m3u4u')) return 'M3U4U';
        return 'GENERIC';
    }

    async removeSource(id) {
        if (!confirm('¿Eliminar esta fuente?')) return;
        this.sources = this.sources.filter(s => s.id !== id);
        await this.saveSources();
        this.renderList();
    }

    updateSourceStats(id, stats, lastSync = Date.now()) {
        const idx = this.sources.findIndex(s => s.id === id);
        if (idx !== -1) {
            this.sources[idx].stats = { ...this.sources[idx].stats, ...stats };
            this.sources[idx].lastSync = lastSync;
            this.saveSources();
            this.renderList();
        }
    }

    renderList() {
        const container = document.getElementById('sourcesList');
        if (!container) return; // UI might not be ready

        container.innerHTML = '';
        if (this.sources.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center;">Sin fuentes configuradas</p>';
            return;
        }

        this.sources.forEach(source => {
            const div = document.createElement('div');
            div.style.cssText = 'background:rgba(255,255,255,0.05); border-radius:6px; padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;';

            const lastSyncText = source.lastSync ? new Date(source.lastSync).toLocaleString() : 'Nunca';
            const statsText = `📊 Canales: ${source.stats?.channels || 0} | Logos: ${source.stats?.logos || 0}`;

            div.innerHTML = `
                <div style="flex:1;">
                    <div style="font-weight:bold; color:#e2e8f0;">${source.label} <span style="font-size:0.75rem; background:rgba(59,130,246,0.3); padding:2px 6px; border-radius:4px; margin-left:6px;">${source.type}</span></div>
                    <div style="font-size:0.8rem; color:#94a3b8; margin-top:2px;">${source.baseUrl}</div>
                    <div style="font-size:0.75rem; color:#cbd5e1; margin-top:4px;">Last Sync: ${lastSyncText}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${statsText}</div>
                </div>
                <div style="display:flex; gap:8px; flex-direction:column; align-items:flex-end;">
                     <button class="btn primary sm" onclick="app.enrichmentDelta.syncSource('${source.id}')">🔄 Sync</button>
                     <button class="btn secondary sm" onclick="app.sourceManager.removeSource('${source.id}')" style="color:#ef4444; border-color:rgba(239,68,68,0.3);">🗑️</button>
                </div>
            `;
            container.appendChild(div);
        });
    }
}

// Export to window for global access if needed
window.SourceManager = SourceManager;
