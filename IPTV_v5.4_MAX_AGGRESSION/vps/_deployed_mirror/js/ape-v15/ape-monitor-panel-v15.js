/**
 * ═══════════════════════════════════════════════════════════════
 * 📊 APE v16 GUARDIAN TELEMETRY EXCHANGE DASHBOARD (FIXED)
 * IPTV Navigator PRO - Real-time Monitoring (Tipo Exchange)
 * ═══════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Advanced telemetry dashboard for APE Guardian Engine v16
 * ENDPOINT: https://iptv-ape.duckdns.org/guardian/
 * 
 * FIXES:
 * ✅ Removed SSE (not implemented in backend)
 * ✅ Using polling only with correct endpoint
 * ✅ Fixed data mapping from backend response
 * ✅ Added CORS handling
 * ✅ Fixed session rendering
 * 
 * VERSION: 16.1.1-FIXED
 * DATE: 2026-01-26
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════
    const CONFIG = {
        GUARDIAN_URL: 'https://iptv-ape.duckdns.org/guardian',
        POLL_ENDPOINT: 'https://iptv-ape.duckdns.org/guardian/telemetry/sessions',
        PROVIDERS_ENDPOINT: 'https://iptv-ape.duckdns.org/resolve_quality.php?action=providers',
        POLL_INTERVAL: 2000,
        PROVIDERS_POLL_INTERVAL: 2000,
        MAX_LOG_ENTRIES: 100,
        STORAGE_KEY: 'ape16_telemetry_enabled'
    };

    // Metric definitions for the comparison table
    const METRICS_CONFIG = [
        { key: 'bandwidth', label: 'Bandwidth', unit: 'Mbps', thresholds: { warn: 5, error: 2 } },
        { key: 'latency', label: 'Latency', unit: 'ms', thresholds: { warn: 100, error: 200 }, inverse: true },
        { key: 'buffer_size', label: 'Buffer Size', unit: 's', thresholds: { warn: 3, error: 1 } },
        { key: 'packet_loss', label: 'Packet Loss', unit: '%', thresholds: { warn: 1, error: 5 }, inverse: true },
        { key: 'jitter', label: 'Jitter', unit: 'ms', thresholds: { warn: 30, error: 50 }, inverse: true },
        { key: 'fps', label: 'Frame Rate', unit: 'fps', thresholds: { warn: 25, error: 20 } },
        { key: 'bitrate', label: 'Bitrate', unit: 'kbps', thresholds: { warn: 3000, error: 1500 } },
        { key: 'errors', label: 'HTTP Errors', unit: '', thresholds: { warn: 1, error: 5 }, inverse: true }
    ];

    /**
     * APE v16 Guardian Telemetry Exchange Dashboard
     */
    class APEv16ExchangeDashboard {
        constructor(containerId) {
            this.containerId = containerId;
            this.container = null;
            this.pollTimer = null;
            this.providersPollTimer = null;
            this.isConnected = false;
            this.sessions = new Map();
            this.providers = [];
            this.logEntries = [];
            this.lastLatency = 0;
            this.aggregatedMetrics = {
                totalSessions: 0,
                avgBandwidth: 0,
                avgLatency: 0,
                totalErrors: 0
            };
        }

        /**
         * Initialize the dashboard
         */
        init() {
            this.container = document.getElementById(this.containerId);
            if (!this.container) {
                console.error(`APE v16 Exchange: Container #${this.containerId} not found`);
                return false;
            }

            this._injectStyles();
            this._renderPanel();
            this._setupEventListeners();

            // Restore toggle state
            const enabled = localStorage.getItem(CONFIG.STORAGE_KEY) !== 'false';
            const toggle = document.getElementById('ape16-toggle');
            if (toggle) toggle.checked = enabled;

            if (enabled) {
                this._startPolling();
            }

            // SIEMPRE arrancar providers (snapshot en tiempo real, independiente del toggle)
            this._pollProviders(); // primera llamada inmediata
            this.providersPollTimer = setInterval(() => {
                this._pollProviders();
            }, CONFIG.PROVIDERS_POLL_INTERVAL);

            console.log('%c📊 APE v16 Exchange Dashboard Initialized — Providers en tiempo real activos', 'color: #8b5cf6; font-weight: bold;');
            return true;
        }

        /**
         * Inject custom CSS styles
         */
        _injectStyles() {
            if (document.getElementById('ape16-exchange-styles')) return;

            const style = document.createElement('style');
            style.id = 'ape16-exchange-styles';
            style.textContent = `
                /* Highlight animation for updates */
                @keyframes ape16-highlight {
                    0% { background: rgba(56, 189, 248, 0.3); }
                    100% { background: transparent; }
                }
                .ape16-highlight-update {
                    animation: ape16-highlight 0.5s ease-out;
                }
                
                /* Fade in animation */
                @keyframes ape16-fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .ape16-fade-in {
                    animation: ape16-fadeIn 0.3s ease-out;
                }
                
                /* Pulse animation for connected status */
                @keyframes ape16-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .ape16-pulse {
                    animation: ape16-pulse 2s infinite;
                }
                
                /* Table styles */
                .ape16-metrics-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 0.75rem;
                }
                .ape16-metrics-table th, .ape16-metrics-table td {
                    padding: 8px 10px;
                    text-align: left;
                    border-bottom: 1px solid rgba(100, 116, 139, 0.2);
                }
                .ape16-metrics-table th {
                    color: #64748b;
                    font-weight: 600;
                    text-transform: uppercase;
                    font-size: 0.65rem;
                    letter-spacing: 0.05em;
                }
                .ape16-metrics-table tr:hover {
                    background: rgba(56, 189, 248, 0.05);
                }
                
                /* Status colors */
                .ape16-status-ok { color: #4ade80; }
                .ape16-status-warn { color: #fbbf24; }
                .ape16-status-error { color: #f87171; }
                
                /* Adjustment column */
                .ape16-adjustment {
                    color: #a5b4fc;
                    font-style: italic;
                }
                
                /* Session panel */
                .ape16-session-panel {
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(100, 116, 139, 0.3);
                    border-radius: 10px;
                    margin-bottom: 12px;
                    overflow: hidden;
                }
                .ape16-session-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 14px;
                    background: rgba(30, 41, 59, 0.5);
                    border-bottom: 1px solid rgba(100, 116, 139, 0.2);
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Render the main panel HTML
         */
        _renderPanel() {
            this.container.innerHTML = `
                <div class="ape-v16-exchange-panel" style="
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.05));
                    border: 1px solid rgba(139, 92, 246, 0.3);
                    border-radius: 16px;
                    padding: 20px;
                    margin-top: 16px;
                ">
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 1.5rem;">🛡️</span>
                            <div>
                                <h3 style="margin: 0; font-size: 1rem; color: #e2e8f0;">APE Guardian Engine v16 - Telemetría Exchange</h3>
                                <p style="margin: 4px 0 0 0; font-size: 0.72rem; color: #94a3b8;">
                                    Endpoint: <span id="ape16-backend-url" style="color: #a5b4fc;">${CONFIG.GUARDIAN_URL}</span>
                                    <span id="ape16-latency-badge" style="margin-left: 8px; color: #fbbf24;">--ms</span>
                                </p>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <!-- Live Toggle -->
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" id="ape16-toggle" style="width: 18px; height: 18px; accent-color: #8b5cf6;">
                                <span style="font-size: 0.72rem; color: #94a3b8;">Live</span>
                            </label>
                            <!-- Status Badge -->
                            <div id="ape16-status-badge" style="
                                display: flex; align-items: center; gap: 8px;
                                padding: 6px 12px;
                                border-radius: 999px;
                                background: rgba(100, 116, 139, 0.3);
                                border: 1px solid rgba(100, 116, 139, 0.5);
                                font-size: 0.75rem;
                                color: #94a3b8;
                            ">
                                <span id="ape16-status-dot" style="
                                    width: 8px; height: 8px;
                                    border-radius: 50%;
                                    background: #64748b;
                                "></span>
                                <span id="ape16-status-text">Disconnected</span>
                            </div>
                        </div>
                    </div>

                    <!-- Aggregated Metrics Grid -->
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 12px;
                        margin-bottom: 16px;
                    ">
                        <div style="
                            background: rgba(30, 41, 59, 0.5);
                            border: 1px solid rgba(100, 116, 139, 0.3);
                            border-radius: 10px;
                            padding: 12px;
                        ">
                            <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 4px;">Sesiones Activas</div>
                            <div id="ape16-total-sessions" style="font-size: 1.5rem; color: #e2e8f0; font-weight: 600;">0</div>
                        </div>
                        <div style="
                            background: rgba(30, 41, 59, 0.5);
                            border: 1px solid rgba(100, 116, 139, 0.3);
                            border-radius: 10px;
                            padding: 12px;
                        ">
                            <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 4px;">Bandwidth Promedio</div>
                            <div id="ape16-avg-bandwidth" style="font-size: 1.5rem; color: #4ade80; font-weight: 600;">-- Mbps</div>
                        </div>
                        <div style="
                            background: rgba(30, 41, 59, 0.5);
                            border: 1px solid rgba(100, 116, 139, 0.3);
                            border-radius: 10px;
                            padding: 12px;
                        ">
                            <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 4px;">Latency Promedio</div>
                            <div id="ape16-avg-latency" style="font-size: 1.5rem; color: #fbbf24; font-weight: 600;">-- ms</div>
                        </div>
                        <div style="
                            background: rgba(30, 41, 59, 0.5);
                            border: 1px solid rgba(100, 116, 139, 0.3);
                            border-radius: 10px;
                            padding: 12px;
                        ">
                            <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 4px;">Errores Totales</div>
                            <div id="ape16-total-errors" style="font-size: 1.5rem; color: #f87171; font-weight: 600;">0</div>
                        </div>
                    </div>

                    <!-- 📡 PROVIDERS ACTIVOS (Listas consumidas por Resolve) -->
                    <div style="
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(59, 130, 246, 0.3);
                        border-radius: 10px;
                        padding: 14px;
                        margin-bottom: 16px;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 1.1rem;">📡</span>
                                <span style="font-size: 0.8rem; color: #93c5fd; font-weight: 600;">Listas / Proveedores Activos</span>
                            </div>
                            <div id="ape16-providers-count" style="
                                padding: 3px 10px;
                                border-radius: 999px;
                                background: rgba(59, 130, 246, 0.2);
                                border: 1px solid rgba(59, 130, 246, 0.4);
                                font-size: 0.7rem;
                                color: #93c5fd;
                            ">0 proveedores</div>
                        </div>
                        <div id="ape16-providers-container">
                            <div style="text-align: center; padding: 12px; color: #64748b; font-size: 0.78rem;">
                                Esperando datos del resolver...
                            </div>
                        </div>
                    </div>

                    <!-- Sessions Container -->
                    <div id="ape16-sessions-container" style="margin-bottom: 16px;">
                        <div style="text-align: center; padding: 20px; color: #64748b; font-size: 0.85rem;">
                            No hay sesiones activas
                        </div>
                    </div>

                    <!-- Event Log -->
                    <div style="
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(100, 116, 139, 0.3);
                        border-radius: 10px;
                        padding: 12px;
                        margin-bottom: 12px;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">📝 Event Log</span>
                            <div style="display: flex; gap: 8px;">
                                <button id="ape16-download-txt" style="
                                    background: rgba(139, 92, 246, 0.2);
                                    border: 1px solid rgba(139, 92, 246, 0.5);
                                    color: #a5b4fc;
                                    padding: 4px 10px;
                                    border-radius: 6px;
                                    font-size: 0.7rem;
                                    cursor: pointer;
                                ">TXT</button>
                                <button id="ape16-download-csv" style="
                                    background: rgba(139, 92, 246, 0.2);
                                    border: 1px solid rgba(139, 92, 246, 0.5);
                                    color: #a5b4fc;
                                    padding: 4px 10px;
                                    border-radius: 6px;
                                    font-size: 0.7rem;
                                    cursor: pointer;
                                ">CSV</button>
                            </div>
                        </div>
                        <div id="ape16-event-log" style="
                            max-height: 150px;
                            overflow-y: auto;
                            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                            font-size: 0.7rem;
                            line-height: 1.6;
                        "></div>
                    </div>
                </div>
            `;
        }

        /**
         * Setup event listeners
         */
        _setupEventListeners() {
            const toggle = document.getElementById('ape16-toggle');
            if (toggle) {
                toggle.addEventListener('change', (e) => {
                    const enabled = e.target.checked;
                    localStorage.setItem(CONFIG.STORAGE_KEY, enabled);
                    if (enabled) {
                        this._startPolling();
                    } else {
                        this._stopPolling();
                    }
                });
            }

            const btnTxt = document.getElementById('ape16-download-txt');
            const btnCsv = document.getElementById('ape16-download-csv');
            if (btnTxt) btnTxt.addEventListener('click', () => this._downloadTXT());
            if (btnCsv) btnCsv.addEventListener('click', () => this._downloadCSV());
        }

        // ═══════════════════════════════════════════════════════════
        // POLLING LOGIC
        // ═══════════════════════════════════════════════════════════

        _startPolling() {
            if (this.pollTimer) return;
            
            this._logEvent('Iniciando telemetría (polling)', 'info');
            this._poll(); // First poll immediately
            this._pollProviders(); // First providers poll
            
            this.pollTimer = setInterval(() => {
                this._poll();
            }, CONFIG.POLL_INTERVAL);

            this.providersPollTimer = setInterval(() => {
                this._pollProviders();
            }, CONFIG.PROVIDERS_POLL_INTERVAL);
            
            this.isConnected = true;
            this._updateStatusBadge(true);
        }

        async _poll() {
            const startTime = Date.now();
            
            try {
                const response = await fetch(CONFIG.POLL_ENDPOINT);
                const latency = Date.now() - startTime;
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                this._updateLatencyBadge(latency);
                this._processData(data);
                
            } catch (error) {
                console.error('APE v16 Exchange: Poll error', error);
                this._logEvent(`Error: ${error.message}`, 'error');
                this._updateStatusBadge(false);
            }
        }

        async _pollProviders() {
            try {
                const response = await fetch(CONFIG.PROVIDERS_ENDPOINT);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                this.providers = data.providers || [];
                this._renderProviders(data);
            } catch (error) {
                console.warn('APE v16: Providers poll error', error);
            }
        }

        _processData(data) {
            if (!data || !data.sessions) {
                console.warn('APE v16 Exchange: Invalid data format', data);
                return;
            }

            // Update sessions
            const newSessions = new Map();
            data.sessions.forEach(session => {
                newSessions.set(session.session_id, session);
            });

            // Detect new sessions
            newSessions.forEach((session, id) => {
                if (!this.sessions.has(id)) {
                    this._logEvent(`Nueva sesión: ${session.player_type} - ${session.channel_name}`, 'success');
                }
            });

            // Detect removed sessions
            this.sessions.forEach((session, id) => {
                if (!newSessions.has(id)) {
                    this._logEvent(`Sesión finalizada: ${id.substring(0, 16)}...`, 'info');
                }
            });

            this.sessions = newSessions;
            this._renderSessions();
            this._updateAggregatedMetrics();
        }

        // ═══════════════════════════════════════════════════════════
        // RENDERING
        // ═══════════════════════════════════════════════════════════

        _renderSessions() {
            const container = document.getElementById('ape16-sessions-container');
            if (!container) return;

            if (this.sessions.size === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #64748b; font-size: 0.85rem;">
                        No hay sesiones activas
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            this.sessions.forEach(session => {
                const panel = this._createSessionPanel(session);
                container.appendChild(panel);
            });
        }

        _renderProviders(data) {
            const container = document.getElementById('ape16-providers-container');
            const countBadge = document.getElementById('ape16-providers-count');
            if (!container) return;

            const channels = data.active_channels || [];
            const sources = data.sources || [];
            const totalCh = data.total_channels || 0;

            if (countBadge) {
                countBadge.textContent = `${sources.length} fuente${sources.length !== 1 ? 's' : ''} · ${totalCh} canal${totalCh !== 1 ? 'es' : ''} activo${totalCh !== 1 ? 's' : ''}`;
            }

            // ═══ LISTA ACTIVA HEADER (nombre real del archivo M3U8) ═══
            const activeList = data.active_list;
            const listHeader = activeList ? `
                <div style="
                    background: linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(251, 191, 36, 0.06));
                    border: 1px solid rgba(234, 179, 8, 0.4);
                    border-radius: 8px;
                    padding: 10px 14px;
                    margin-bottom: 10px;
                ">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:1.3rem;">📋</span>
                        <div style="flex:1;min-width:0;">
                            <div style="color:#fbbf24;font-size:0.58rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Lista Activa</div>
                            <div style="color:#fef3c7;font-size:0.85rem;font-weight:800;font-family:'Consolas','Monaco',monospace;word-break:break-all;line-height:1.3;">${activeList}</div>
                        </div>
                    </div>
                </div>
            ` : '';

            // Sources header (servidor + user = identifica la suscripción)
            const sourceHeader = sources.length > 0 ? sources.map(s => {
                const hostShort = (s.host || 'UNKNOWN').replace(/:80$/, '').replace(/:443$/, '');
                const userMask = s.user ? s.user.substring(0, 4) + '***' : '—';
                return `
                    <div style="
                        background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(59, 130, 246, 0.08));
                        border: 1px solid rgba(99, 102, 241, 0.35);
                        border-radius: 8px;
                        padding: 10px 14px;
                        margin-bottom: 8px;
                    ">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="font-size:1.1rem;">🛰️</span>
                                <div>
                                    <div style="color:#c7d2fe;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Fuente Activa</div>
                                    <div style="color:#e2e8f0;font-size:0.82rem;font-weight:700;font-family:'Consolas',monospace;">${hostShort}</div>
                                </div>
                            </div>
                            <div style="display:flex;gap:6px;flex-shrink:0;">
                                <span style="padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;font-size:0.62rem;font-weight:600;">👤 ${userMask}</span>
                                <span style="padding:2px 8px;border-radius:4px;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.3);color:#6ee7b7;font-size:0.62rem;font-weight:600;">📺 ${s.count} CH</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('') : '';

            if (channels.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 16px; color: #64748b; font-size: 0.78rem;">
                        ⏳ Sin canales activos — haz zapping para ver telemetría en vivo
                    </div>
                `;
                return;
            }

            // Channel Table — FOCO: nombre del canal, status HTTP, tiempo desde zapping
            const profileColors = { P0: '#f472b6', P1: '#a78bfa', P2: '#60a5fa', P3: '#4ade80', P4: '#fbbf24', P5: '#f87171' };
            const now = Math.floor(Date.now() / 1000);

            const channelRows = channels.map(c => {
                const ago = now - (c.ts || 0);
                const agoText = ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m ${ago % 60}s`;
                const agoColor = ago < 10 ? '#4ade80' : ago < 60 ? '#60a5fa' : ago < 180 ? '#fbbf24' : '#f87171';
                const pColor = profileColors[c.profile] || '#94a3b8';
                const liveDot = ago < 15
                    ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;margin-right:5px;"></span>'
                    : ago < 60
                    ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#fbbf24;margin-right:5px;"></span>'
                    : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#475569;margin-right:5px;"></span>';

                // HTTP Status semáforo
                const status = c.upstream_status || 0;
                const statusColor = status >= 200 && status < 300 ? '#4ade80'
                    : status >= 300 && status < 400 ? '#60a5fa'
                    : status >= 400 && status < 500 ? '#fbbf24'
                    : status >= 500 ? '#f87171'
                    : '#475569';
                const statusText = status > 0 ? status : '—';
                const statusBg = status >= 200 && status < 300 ? 'rgba(74,222,128,0.15)'
                    : status >= 400 && status < 500 ? 'rgba(251,191,36,0.15)'
                    : status >= 500 ? 'rgba(248,113,113,0.15)'
                    : 'rgba(71,85,105,0.15)';

                const chName = c.channel_name || `CH ${c.ch}`;

                return `
                    <tr style="border-bottom:1px solid rgba(100,116,139,0.12);">
                        <td style="padding:6px 8px;max-width:180px;">
                            <div style="display:flex;align-items:center;">
                                ${liveDot}
                                <div style="min-width:0;">
                                    <div style="color:#e2e8f0;font-size:0.76rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${chName}</div>
                                    <div style="color:#64748b;font-size:0.58rem;font-family:'Consolas',monospace;">ID: ${c.ch}</div>
                                </div>
                            </div>
                        </td>
                        <td style="padding:6px 8px;text-align:center;">
                            <span style="padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:800;font-family:'Consolas',monospace;background:${statusBg};color:${statusColor};border:1px solid ${statusColor}44;">${statusText}</span>
                        </td>
                        <td style="padding:6px 8px;text-align:center;">
                            <span style="padding:1px 6px;border-radius:3px;font-size:0.6rem;font-weight:700;background:${pColor}22;color:${pColor};border:1px solid ${pColor}44;">${c.profile}</span>
                        </td>
                        <td style="padding:6px 8px;font-size:0.68rem;color:${agoColor};font-weight:600;white-space:nowrap;">${agoText}</td>
                    </tr>
                `;
            }).join('');

            const channelTable = `
                <div style="
                    background: rgba(15, 23, 42, 0.5);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 8px;
                    overflow: hidden;
                " class="ape16-fade-in">
                    <div style="padding:8px 12px;background:rgba(30,41,59,0.6);border-bottom:1px solid rgba(59,130,246,0.15);">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-size:0.9rem;">📺</span>
                            <span style="color:#93c5fd;font-size:0.75rem;font-weight:600;">Canales Resolviendo en Tiempo Real</span>
                            <span style="margin-left:auto;color:#4ade80;font-size:0.62rem;font-weight:600;">● LIVE</span>
                        </div>
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr style="border-bottom:1px solid rgba(100,116,139,0.25);">
                                    <th style="padding:5px 8px;text-align:left;color:#475569;font-size:0.56rem;text-transform:uppercase;font-weight:600;">Canal</th>
                                    <th style="padding:5px 8px;text-align:center;color:#475569;font-size:0.56rem;text-transform:uppercase;font-weight:600;">HTTP</th>
                                    <th style="padding:5px 8px;text-align:center;color:#475569;font-size:0.56rem;text-transform:uppercase;font-weight:600;">Perfil</th>
                                    <th style="padding:5px 8px;text-align:left;color:#475569;font-size:0.56rem;text-transform:uppercase;font-weight:600;">Hace</th>
                                </tr>
                            </thead>
                            <tbody>${channelRows}</tbody>
                        </table>
                    </div>
                </div>
            `;

            container.innerHTML = listHeader + sourceHeader + channelTable;
        }

        _createSessionPanel(session) {
            const panel = document.createElement('div');
            panel.className = 'ape16-session-panel ape16-fade-in';
            panel.setAttribute('data-session-id', session.session_id);

            const statusColor = session.status === 'OK' ? '#4ade80' : session.status === 'WARNING' ? '#fbbf24' : '#f87171';

            panel.innerHTML = `
                <div class="ape16-session-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1rem;">📺</span>
                        <div>
                            <div style="color: #e2e8f0; font-size: 0.85rem; font-weight: 600;">
                                ${session.channel_name || session.session_id?.substring(0, 16) + '...'}
                            </div>
                            <div style="font-size: 0.7rem; color: #94a3b8;">
                                Player: ${session.player_type || '--'} | Profile: ${session.profile || 'P2'} | Uptime: ${session.uptime || '--'}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="font-size: 0.7rem; color: #a5b4fc;">${session.list_name || 'Lista'}</span>
                        <span style="color: ${statusColor}; font-size: 1rem;">${session.status === 'OK' ? '✅' : session.status === 'WARNING' ? '⚠️' : '❌'}</span>
                    </div>
                </div>

                <!-- 5-Column Metrics Table -->
                <table class="ape16-metrics-table" style="padding: 10px;">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Métrica</th>
                            <th style="width: 18%;">Valor Actual</th>
                            <th style="width: 12%;">Estado</th>
                            <th style="width: 22%;">Ajuste Guardian</th>
                            <th style="width: 18%;">Valor Final</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this._generateMetricRows(session)}
                    </tbody>
                </table>
            `;

            return panel;
        }

        /**
         * Generate metric rows for the 5-column table
         */
        _generateMetricRows(session) {
            return METRICS_CONFIG.map(metric => {
                const rawValue = session[metric.key] ?? session[`raw_${metric.key}`] ?? '--';
                const finalValue = session[`final_${metric.key}`] ?? session[metric.key] ?? '--';
                const adjustment = session[`adjustment_${metric.key}`] ?? '--';
                const status = this._getStatus(rawValue, metric);
                const statusIcon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
                const statusClass = `ape16-status-${status}`;

                return `
                    <tr data-metric="${metric.key}">
                        <td style="color: #e2e8f0;">${metric.label}</td>
                        <td style="color: #94a3b8;">${this._formatValue(rawValue, metric.unit)}</td>
                        <td class="${statusClass}">${statusIcon}</td>
                        <td class="ape16-adjustment">${adjustment}</td>
                        <td style="color: #4ade80; font-weight: 600;">${this._formatValue(finalValue, metric.unit)}</td>
                    </tr>
                `;
            }).join('');
        }

        /**
         * Get status based on thresholds
         */
        _getStatus(value, metric) {
            if (value === '--' || value === null || value === undefined) return 'ok';
            const numValue = parseFloat(value);
            if (isNaN(numValue)) return 'ok';

            if (metric.inverse) {
                if (numValue >= metric.thresholds.error) return 'error';
                if (numValue >= metric.thresholds.warn) return 'warn';
            } else {
                if (numValue <= metric.thresholds.error) return 'error';
                if (numValue <= metric.thresholds.warn) return 'warn';
            }
            return 'ok';
        }

        /**
         * Format value with unit
         */
        _formatValue(value, unit) {
            if (value === '--' || value === null || value === undefined) return '--';
            return `${value}${unit ? ' ' + unit : ''}`;
        }

        /**
         * Update aggregated metrics
         */
        _updateAggregatedMetrics() {
            let totalBandwidth = 0, totalLatency = 0, totalErrors = 0;

            this.sessions.forEach(session => {
                totalBandwidth += parseFloat(session.bandwidth) || 0;
                totalLatency += parseFloat(session.latency) || 0;
                totalErrors += parseInt(session.errors) || 0;
            });

            const count = this.sessions.size || 1;
            this.aggregatedMetrics = {
                totalSessions: this.sessions.size,
                avgBandwidth: (totalBandwidth / count).toFixed(1),
                avgLatency: Math.round(totalLatency / count),
                totalErrors
            };

            document.getElementById('ape16-total-sessions').textContent = this.aggregatedMetrics.totalSessions;
            document.getElementById('ape16-avg-bandwidth').textContent = `${this.aggregatedMetrics.avgBandwidth} Mbps`;
            document.getElementById('ape16-avg-latency').textContent = `${this.aggregatedMetrics.avgLatency} ms`;
            document.getElementById('ape16-total-errors').textContent = this.aggregatedMetrics.totalErrors;
        }

        /**
         * Stop polling
         */
        _stopPolling() {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
            if (this.providersPollTimer) {
                clearInterval(this.providersPollTimer);
                this.providersPollTimer = null;
            }
            this._updateStatusBadge(false);
            this._logEvent('Telemetría desconectada', 'info');
            this.isConnected = false;
        }

        // ═══════════════════════════════════════════════════════════
        // UI HELPERS
        // ═══════════════════════════════════════════════════════════

        _updateStatusBadge(connected) {
            const badge = document.getElementById('ape16-status-badge');
            const dot = document.getElementById('ape16-status-dot');
            const text = document.getElementById('ape16-status-text');

            if (connected) {
                badge.style.background = 'rgba(34, 197, 94, 0.2)';
                badge.style.borderColor = 'rgba(34, 197, 94, 0.5)';
                dot.style.background = '#22c55e';
                dot.style.boxShadow = '0 0 8px #22c55e';
                dot.classList.add('ape16-pulse');
                text.textContent = 'Connected';
                text.style.color = '#4ade80';
            } else {
                badge.style.background = 'rgba(100, 116, 139, 0.3)';
                badge.style.borderColor = 'rgba(100, 116, 139, 0.5)';
                dot.style.background = '#64748b';
                dot.style.boxShadow = 'none';
                dot.classList.remove('ape16-pulse');
                text.textContent = 'Disconnected';
                text.style.color = '#94a3b8';
            }
        }

        _updateLatencyBadge(ms) {
            const el = document.getElementById('ape16-latency-badge');
            if (el) {
                el.textContent = `${ms}ms`;
                el.style.color = ms < 100 ? '#4ade80' : ms < 300 ? '#fbbf24' : '#f87171';
            }
        }

        _logEvent(message, type = 'info') {
            const logContainer = document.getElementById('ape16-event-log');
            if (!logContainer) return;

            const colors = { info: '#94a3b8', success: '#4ade80', warning: '#fbbf24', error: '#f87171' };
            const time = new Date().toLocaleTimeString('es-ES', { hour12: false });

            this.logEntries.unshift({ timestamp: new Date().toISOString(), message, type });
            if (this.logEntries.length > CONFIG.MAX_LOG_ENTRIES) {
                this.logEntries = this.logEntries.slice(0, CONFIG.MAX_LOG_ENTRIES);
            }

            const entry = document.createElement('div');
            entry.style.color = colors[type] || colors.info;
            entry.textContent = `[${time}] ${message}`;
            entry.classList.add('ape16-fade-in');
            logContainer.insertBefore(entry, logContainer.firstChild);

            while (logContainer.children.length > 20) {
                logContainer.removeChild(logContainer.lastChild);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // DOWNLOAD FUNCTIONS
        // ═══════════════════════════════════════════════════════════

        _downloadTXT() {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const filename = `telemetry_${timestamp}.txt`;

            let content = `APE Guardian Engine v16 - Telemetry Log (Exchange Dashboard)\n`;
            content += `Generated: ${now.toLocaleString('es-ES')}\n`;
            content += `Server: ${CONFIG.GUARDIAN_URL}\n`;
            content += `Sessions: ${this.sessions.size}\n`;
            content += `${'='.repeat(60)}\n\n`;

            this.logEntries.forEach(entry => {
                const time = new Date(entry.timestamp).toLocaleTimeString('es-ES', { hour12: false });
                content += `[${time}] [${entry.type.toUpperCase()}] ${entry.message}\n`;
            });

            this._downloadFile(filename, content, 'text/plain');
            this._logEvent(`Archivo ${filename} descargado`, 'success');
        }

        async _downloadCSV() {
            this._logEvent('Descargando logs Resolve v3.0 desde VPS...', 'info');
            try {
                const csvUrl = 'https://iptv-ape.duckdns.org/iptv-ape/resolve_logs_csv.php';
                const response = await fetch(csvUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const now = new Date();
                const ts = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
                a.download = `APE_Resolve_v3_Logs_${ts}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this._logEvent(`CSV Resolve v3.0 descargado (${(blob.size / 1024).toFixed(1)} KB)`, 'success');
            } catch (err) {
                this._logEvent(`Error descargando CSV: ${err.message}`, 'error');
                console.error('CSV download error:', err);
            }
        }

        _downloadFile(filename, content, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        destroy() {
            this._stopPolling();
            if (this.container) this.container.innerHTML = '';
        }
    }

    // ─────────────────────────────────────────────────────────────
    // GLOBAL EXPORT & AUTO-INIT
    // ─────────────────────────────────────────────────────────────

    window.APEv16ExchangeDashboard = APEv16ExchangeDashboard;

    document.addEventListener('DOMContentLoaded', () => {
        const container = document.getElementById('ape15-panel-container');
        if (container) {
            const dashboard = new APEv16ExchangeDashboard('ape15-panel-container');
            dashboard.init();
            window.ape16Dashboard = dashboard;
        }
    });

    console.log('%c🛡️ APE v16 Exchange Dashboard Ready (FIXED)', 'color: #8b5cf6; font-weight: bold;');

})();
