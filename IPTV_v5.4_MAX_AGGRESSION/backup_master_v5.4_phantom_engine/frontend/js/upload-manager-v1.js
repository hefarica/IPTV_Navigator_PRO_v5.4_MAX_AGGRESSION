/**
 * 🚀 UPLOAD MANAGER v1.0 - Envía config a VPS
 * FINGERPRINT: UPLMGR-V1.0-BASE
 * CREATION DATE: 2025-12-31
 */

class UploadManager {
    constructor(vpsURL = null) {
        // ✅ Obtener URL del VPS desde configuración global
        if (!vpsURL) {
            vpsURL = this._getVPSURL();
        }
        this.vpsURL = vpsURL;
        this.uploadStatus = {};
        this.requestCount = 0;
        this.errorCount = 0;
        this.lastUpload = null;
        console.log('[UploadManager] Inicializado con URL:', vpsURL);
    }

    /**
     * Obtiene la URL del VPS desde la configuración disponible
     */
    _getVPSURL() {
        // 1. Intentar desde gateway-manager (prioridad alta)
        if (window.gatewayManager?.config?.vps_url) {
            return window.gatewayManager.config.vps_url;
        }

        // 2. Intentar desde vpsAdapter
        if (window.vpsAdapter?.getBaseUrl?.()) {
            return window.vpsAdapter.getBaseUrl();
        }

        // 3. Intentar desde localStorage (legacy)
        const stored = localStorage.getItem('gateway_vps_url');
        if (stored) {
            return stored;
        }

        // 4. Default: VPS Master Config
        const defaultVPS = window.VPS_CONFIG?.DEFAULT_URL || 'https://iptv-ape.duckdns.org';
        console.warn('[UploadManager] ⚠️ No se encontró URL de VPS configurada, usando default:', defaultVPS);
        return defaultVPS;
    }

    /**
     * Enviar canales seleccionados al Orchestrator
     */
    async uploadToVPS(channels, servers = []) {
        this.requestCount++;

        if (!channels || channels.length === 0) {
            console.error('[UploadManager] ❌ Sin canales para enviar');
            this.errorCount++;
            return false;
        }

        try {
            console.log(`[UploadManager] 📤 Enviando ${channels.length} canales al VPS...`);

            const payload = {
                channels: channels.map(ch => ({
                    id: ch.id,
                    name: ch.name || ch.displayName,
                    streamUrl: ch.streamUrl || ch.url,
                    logo: ch.logo || ch.tvgLogo,
                    resolution: ch.resolution || 'HD',
                    bitrate: ch.bitrate || '5000',
                    serverId: ch.serverId,
                    categoryName: ch.categoryName || ch.groupTitle,
                    fingerprint: this._generateFingerprint(ch),
                    qualityScore: this._calculateQualityScore(ch)
                })),
                servers: servers,
                timestamp: new Date().toISOString(),
                toolkit: 'IPTV-Navigator-PRO-v3.0.1',
                requestId: `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };

            const response = await fetch(`${this.vpsURL}/api/upload-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Toolkit-Version': '3.0.1'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            console.log(`[UploadManager] ✅ Upload exitoso: ${result.channelsReceived || channels.length} canales`);

            this.uploadStatus = {
                success: true,
                timestamp: new Date(),
                channelsSent: channels.length,
                requestId: payload.requestId
            };

            this.lastUpload = this.uploadStatus;
            return true;

        } catch (err) {
            console.error(`[UploadManager] ❌ Error: ${err.message}`);
            this.errorCount++;
            this.uploadStatus = { success: false, error: err.message };
            return false;
        }
    }

    _generateFingerprint(channel) {
        const str = `${channel.name}-${channel.streamUrl}-${channel.serverId}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return `FP-${Math.abs(hash).toString(16).toUpperCase()}`;
    }

    _calculateQualityScore(channel) {
        let score = 50;
        if (channel.resolution === '4K') score += 30;
        else if (channel.resolution === 'Full HD') score += 15;
        if (parseInt(channel.bitrate) > 8000) score += 20;
        return Math.min(100, score);
    }

    getStatus() { return this.uploadStatus; }

    getStats() {
        return {
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            successRate: this.requestCount > 0
                ? ((this.requestCount - this.errorCount) / this.requestCount * 100).toFixed(2) + '%'
                : '0%',
            lastUpload: this.lastUpload
        };
    }

    async checkVPSConnection() {
        try {
            // ✅ Actualizar URL si cambió la configuración
            const currentVPS = this._getVPSURL();
            if (currentVPS !== this.vpsURL) {
                console.log('[UploadManager] 🔄 URL del VPS actualizada:', currentVPS);
                this.vpsURL = currentVPS;
            }

            // ✅ Usar /health en lugar de /api/status (endpoint real del VPS)
            const response = await fetch(`${this.vpsURL}/health`, { method: 'GET' });
            const ok = response.ok;
            console.log(`[UploadManager] VPS: ${ok ? '✅ Online' : '❌ Offline'}`);
            return ok;
        } catch (err) {
            console.error(`[UploadManager] ❌ VPS no disponible: ${err.message}`);
            return false;
        }
    }

    setVPSURL(newURL) {
        this.vpsURL = newURL;
        console.log(`[UploadManager] ✅ VPS URL actualizada: ${newURL}`);
    }

    /**
     * Actualiza la URL del VPS desde la configuración global
     */
    refreshVPSURL() {
        const newURL = this._getVPSURL();
        if (newURL !== this.vpsURL) {
            this.setVPSURL(newURL);
        }
    }
}

// Instancia global - Se inicializa con URL del VPS configurada
// ✅ Esperar a que gatewayManager esté disponible (si se carga después)
function initUploadManager() {
    if (window.uploader) return; // Ya inicializado

    window.uploader = new UploadManager();
    console.log('[UploadManager] ✅ v1.0 cargado - window.uploader disponible');

    // Si gatewayManager se carga después, actualizar URL cuando esté listo
    if (!window.gatewayManager) {
        const checkInterval = setInterval(() => {
            if (window.gatewayManager?.config?.vps_url) {
                window.uploader.refreshVPSURL();
                clearInterval(checkInterval);
            }
        }, 200);

        // Timeout de seguridad
        setTimeout(() => clearInterval(checkInterval), 5000);
    }
}

// Inicializar inmediatamente o esperar a DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUploadManager);
} else {
    // Pequeño delay para dar tiempo a gateway-manager.js
    setTimeout(initUploadManager, 150);
}
