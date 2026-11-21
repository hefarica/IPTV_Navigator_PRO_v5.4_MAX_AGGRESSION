/**
 * 📊 VPS MONITOR v1.0 - Monitor estado real del VPS
 * FINGERPRINT: VPSMON-V1.0-BASE
 * CREATION DATE: 2025-12-31
 */

class VPSMonitor {
    constructor(vpsURL = null) {
        // ✅ Obtener URL del VPS desde configuración global
        if (!vpsURL) {
            vpsURL = this._getVPSURL();
        }
        this.vpsURL = vpsURL;
        this.status = null;
        this.refreshInterval = 30000;
        this.metrics = [];
        this.maxMetrics = 288; // 24h at 5min intervals
        this.isMonitoring = false;
        this.monitorInterval = null;
        console.log('[VPSMonitor] Inicializado con URL:', vpsURL);
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
        console.warn('[VPSMonitor] ⚠️ No se encontró URL de VPS configurada, usando default:', defaultVPS);
        return defaultVPS;
    }

    async startMonitoring() {
        if (this.isMonitoring) return;
        console.log('[VPSMonitor] 🔄 Iniciando monitoreo...');
        this.isMonitoring = true;
        await this.refresh();
        this.monitorInterval = setInterval(() => this.refresh(), this.refreshInterval);
    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.isMonitoring = false;
            console.log('[VPSMonitor] ⏹️ Monitoreo detenido');
        }
    }

    async refresh() {
        try {
            // ✅ Actualizar URL si cambió la configuración
            const currentVPS = this._getVPSURL();
            if (currentVPS !== this.vpsURL) {
                console.log('[VPSMonitor] 🔄 URL del VPS actualizada:', currentVPS);
                this.vpsURL = currentVPS;
            }

            const startTime = performance.now();
            // ✅ Usar /health en lugar de /api/status (endpoint real del VPS)
            const response = await fetch(`${this.vpsURL}/health`);
            const fetchTime = Math.round(performance.now() - startTime);

            if (response.ok) {
                const data = await response.json();
                // ✅ Adaptar respuesta de /health al formato esperado
                this.status = {
                    status: data.status === 'ok' ? 'online' : 'offline',
                    channels: { total: 0 }, // No disponible en /health
                    quality: { avgLatency: fetchTime },
                    ...data
                };
                this.metrics.push({ timestamp: Date.now(), fetchTime, ...this.status });
                if (this.metrics.length > this.maxMetrics) this.metrics.shift();
                this.updateUI();
                return this.status;
            }
            throw new Error(`HTTP ${response.status}`);
        } catch (err) {
            console.warn('[VPSMonitor] ⚠️ VPS offline:', err.message);
            this.status = { status: 'offline', error: err.message };
            this.metrics.push({ timestamp: Date.now(), status: 'offline' });
            this.updateUI();
            return null;
        }
    }

    updateUI() {
        const elem = document.getElementById('vps-status-panel');
        if (!elem || !this.status) return;

        const isOnline = this.status.status === 'online';
        elem.innerHTML = `
      <div style="border:2px solid ${isOnline ? '#0f0' : '#f00'}; padding:12px; border-radius:8px; 
                  background:${isOnline ? 'rgba(0,255,0,0.05)' : 'rgba(255,0,0,0.05)'}; font-family:monospace;">
        <strong>🖥️ VPS Status</strong><br>
        Estado: <span style="color:${isOnline ? '#0f0' : '#f00'}">${isOnline ? '✅ Online' : '❌ Offline'}</span><br>
        Canales: ${this.status.channels?.total || 0}<br>
        Latencia: ${this.status.quality?.avgLatency || 'N/A'}<br>
        <small>Muestras: ${this.metrics.length} | ${new Date().toLocaleTimeString()}</small>
      </div>`;
    }

    getMetrics() { return this.metrics; }

    /**
     * Actualiza la URL del VPS desde la configuración global
     */
    refreshVPSURL() {
        const newURL = this._getVPSURL();
        if (newURL !== this.vpsURL) {
            console.log('[VPSMonitor] 🔄 URL del VPS actualizada:', newURL);
            this.vpsURL = newURL;
        }
    }

    generateHealthReport() {
        if (this.metrics.length < 2) return null;

        const online = this.metrics.filter(m => m.status !== 'offline').length;
        const uptime = (online / this.metrics.length * 100).toFixed(2);
        const avgLatency = this.metrics.reduce((sum, m) => sum + (m.fetchTime || 0), 0) / this.metrics.length;

        return {
            uptime: parseFloat(uptime),
            avgLatency: Math.round(avgLatency),
            samples: this.metrics.length,
            verdict: uptime > 80 ? '✅ HEALTHY' : uptime > 50 ? '⚠️ DEGRADED' : '❌ CRITICAL'
        };
    }
}

// Instancia global - Se inicializa con URL del VPS configurada
// ✅ Esperar a que gatewayManager esté disponible (si se carga después)
function initVPSMonitor() {
    if (window.vpsMonitor) return; // Ya inicializado

    window.vpsMonitor = new VPSMonitor();
    console.log('[VPSMonitor] ✅ v1.0 cargado - window.vpsMonitor disponible');

    // Si gatewayManager se carga después, actualizar URL cuando esté listo
    if (!window.gatewayManager) {
        const checkInterval = setInterval(() => {
            if (window.gatewayManager?.config?.vps_url) {
                window.vpsMonitor.refreshVPSURL();
                clearInterval(checkInterval);
            }
        }, 200);

        // Timeout de seguridad
        setTimeout(() => clearInterval(checkInterval), 5000);
    }
}

// Inicializar inmediatamente o esperar a DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVPSMonitor);
} else {
    // Pequeño delay para dar tiempo a gateway-manager.js
    setTimeout(initVPSMonitor, 150);
}
