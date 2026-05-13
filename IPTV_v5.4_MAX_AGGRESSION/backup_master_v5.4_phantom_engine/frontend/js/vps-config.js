/**
 * 🛠️ VPS Global Configuration
 * Centralize all fallbacks and environment settings for IPTV Navigator PRO
 * 
 * ✅ MODIFICADO: 2026-01-23
 * - Cambiado DEFAULT_URL a dominio DuckDNS para evitar errores SSL
 * - Agregado API_URL para endpoints del servidor Flask
 * - Agregado método getApiUrl() para obtener URL de API
 */
window.VPS_CONFIG = {
    // 🌐 EL DOMINIO MAESTRO (Cambiar aquí para todo el sistema)
    // ✅ CORREGIDO: Usar dominio DuckDNS (tiene certificado SSL válido)
    DEFAULT_URL: 'https://iptv-ape.duckdns.org',
    DNS_DOMAIN: 'iptv-ape.duckdns.org',
    IPS_FALLBACK: '178.156.147.234',

    // 🔌 API BACKEND (En el VPS, no localhost)
    // ✅ NUEVO: API Flask corriendo en Hetzner
    API_URL: 'https://iptv-ape.duckdns.org/api',

    // 🔌 LOCAL BACKEND (SCP SERVER) - Solo para subir archivos
    SCP_SERVER_PORT: 5001,
    get scpUrl() {
        return `http://localhost:${this.SCP_SERVER_PORT}`;
    },

    /**
     * Obtiene la mejor URL disponible para el VPS
     */
    getBaseUrl() {
        return localStorage.getItem('vps_base_url') ||
            window.gatewayManager?.config?.vps_url ||
            window.vpsAdapter?.getBaseUrl() ||
            this.DEFAULT_URL;
    },

    /**
     * ✅ NUEVO: Obtiene la URL de la API
     */
    getApiUrl() {
        return this.API_URL;
    }
};

console.log('🌍 [VPS Config] Centralized configuration loaded. Target:', window.VPS_CONFIG.DEFAULT_URL);
console.log('🔌 [VPS Config] API URL:', window.VPS_CONFIG.API_URL);
