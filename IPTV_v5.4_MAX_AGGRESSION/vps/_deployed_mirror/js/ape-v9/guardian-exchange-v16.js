/**
 * APE Guardian Engine v16 - Telemetría Exchange Data Binder
 * Este script interroga (pollea) el endpoint JSON del VPS asincrónicamente
 * para no afectar el UI Thread. Despliega las estadísticas en el HTML Panel.
 */

(function () {
    const GUARDIAN_ENDPOINT = 'https://iptv-ape.duckdns.org/guardian.php';
    const POLL_INTERVAL_MS = 3000;
    let pollTimer = null;
    let isLive = true;

    // Elements
    const elements = {
        toggle: document.getElementById('ape16-toggle'),
        statusBox: document.getElementById('ape16-status-badge'),
        statusDot: document.getElementById('ape16-status-dot'),
        statusText: document.getElementById('ape16-status-text'),
        latencyBadge: document.getElementById('ape16-latency-badge'),
        sessions: document.getElementById('ape16-total-sessions'),
        bandwidth: document.getElementById('ape16-avg-bandwidth'),
        latency: document.getElementById('ape16-avg-latency'),
        errors: document.getElementById('ape16-total-errors'),
        providersCount: document.getElementById('ape16-providers-count'),
        providersContainer: document.getElementById('ape16-providers-container'),
        sessionsContainer: document.getElementById('ape16-sessions-container'),
        eventLog: document.getElementById('ape16-event-log')
    };

    function setStatus(state) {
        if (!elements.statusBox) return;
        const s = {
            'connected': { color: '#4ade80', text: 'Connected', bg: 'rgba(34,197,94,0.1)' },
            'disconnected': { color: '#64748b', text: 'Disconnected', bg: 'rgba(100,116,139,0.3)' },
            'error': { color: '#f87171', text: 'Error', bg: 'rgba(239,68,68,0.1)' }
        }[state] || s['disconnected'];

        elements.statusDot.style.background = s.color;
        elements.statusText.textContent = s.text;
        elements.statusText.style.color = s.color;
        elements.statusBox.style.background = s.bg;
        elements.statusBox.style.borderColor = s.color;
    }

    function addLogEntry(msg, type = 'info') {
        if (!elements.eventLog) return;
        const color = type === 'error' ? '#fca5a5' : type === 'warn' ? '#fde047' : type === 'suggest' ? '#a78bfa' : '#94a3b8';
        const icon = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'suggest' ? '💡' : '📝';
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        
        const div = document.createElement('div');
        div.style.marginBottom = '6px';
        div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        div.style.paddingBottom = '4px';
        
        // Formateador especial para logs de reproducción en tiempo real
        if (msg.startsWith('PLAY|')) {
            const parts = msg.split('|');
            const profile = parts[1] || 'UNK';
            const chId = parts[2] || '???';
            const latency = parts[3] || 'N/A';
            const bw = parts[4] || 'Auto';
            const qosMode = parts[5] || 'Default';
            
            // Buscar nombre del canal
            let chName = 'Canal Desconocido';
            const appBase = window.app || window.top.app;
            if (appBase && appBase.state && appBase.state.channelsMaster) {
                const found = appBase.state.channelsMaster.find(c => c.stream_id == chId);
                if (found) chName = found.name;
            }
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%; font-family: monospace;">
                    <div style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <span style="color:#64748b; font-size:11px;">[${time}]</span> 
                        <span style="color:#10b981; margin:0 4px;">▶</span>
                        <span style="color:#eab308; font-weight:bold; width:35px; display:inline-block;">[${profile}]</span> 
                        <span style="color:#38bdf8; width:65px; display:inline-block;">ID:${chId}</span>
                        <span style="color:#f8fafc; font-weight:bold;">${chName}</span>
                    </div>
                    <div style="display:flex; gap:12px; font-size:11px; background:rgba(0,0,0,0.25); padding: 3px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
                        <span title="Backend Latency"><span style="color:#94a3b8;">LAT:</span> <span style="color:#a3e635;">${latency}</span></span>
                        <span title="Bandwidth Cap"><span style="color:#94a3b8;">BW:</span> <span style="color:#facc15;">${bw}</span></span>
                        <span title="QoS Mode"><span style="color:#94a3b8;">QoS:</span> <span style="color:#c084fc;">${qosMode}</span></span>
                    </div>
                </div>`;
        } else if (msg.startsWith('Play:')) {
            // Retrocompatibilidad temporal si el worker procesa strings viejas antes de actualizarse
            const m = msg.match(/Play: \[([^\]]+)\] (\d+)/);
            if (m) {
                const profile = m[1];
                const chId = m[2];
                let chName = 'Canal Desconocido';
                const appBase = window.app || window.top.app;
                if (appBase && appBase.state && appBase.state.channelsMaster) {
                    const found = appBase.state.channelsMaster.find(c => c.stream_id == chId);
                    if (found) chName = found.name;
                }
                div.innerHTML = `<span style="color:#64748b;">[${time}]</span> ▶ <span style="color:#eab308; font-weight:bold;">[${profile}]</span> <span style="color:#38bdf8;">${chId}</span> <span style="color:#f8fafc;">${chName}</span>`;
            } else {
                div.innerHTML = `<span style="color:#64748b;">[${time}]</span> ${icon} <span style="color:${color}">${msg}</span>`;
            }
        } else {
            // Mensaje estándar / Sugerencia / Internal
            div.innerHTML = `<span style="color:#64748b;">[${time}]</span> ${icon} <span style="color:${color}">${msg}</span>`;
        }
        
        elements.eventLog.prepend(div);
        
        // Mantener solo los últimos 50 logs
        if (elements.eventLog.children.length > 50) {
            elements.eventLog.lastChild.remove();
        }
    }

    async function fetchGuardianData() {
        if (!isLive) return;
        try {
            const start = performance.now();
            const res = await fetch(GUARDIAN_ENDPOINT + '?t=' + Date.now(), { method: 'GET', mode: 'cors' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            
            const data = await res.json();
            const latency = Math.round(performance.now() - start);

            setStatus('connected');
            if(elements.latencyBadge) elements.latencyBadge.textContent = latency + 'ms ping';

            updateDashboard(data);
        } catch (e) {
            setStatus('error');
            if(elements.latencyBadge) elements.latencyBadge.textContent = 'Timeout';
            // No hacemos spam al log, solo actualizamos los badges
        }
    }

    function updateDashboard(data) {
        if (elements.sessions) elements.sessions.textContent = data.active_sessions || 0;
        if (elements.bandwidth) elements.bandwidth.textContent = (data.avg_bandwidth_mbps || 0) + ' Mbps';
        if (elements.latency) elements.latency.textContent = (data.avg_latency_ms || 0) + ' ms';
        if (elements.errors) elements.errors.textContent = data.total_errors || 0;

        // Fallbacks detectados = Suggestion al SSOT (Esto es clave para la Arquitectura exigida)
        if (data.suggestions && data.suggestions.length > 0) {
            data.suggestions.forEach(s => {
                // Solo loguear si no se ha logueado recientemente (cache memory)
                // Se asume simple para el scope
                addLogEntry(`SSOT SUGGESTION: ${s}`, 'suggest');
            });
        }
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(msg => addLogEntry(msg, 'warn'));
        }
    }

    function init() {
        if (elements.toggle) {
            elements.toggle.addEventListener('change', (e) => {
                isLive = e.target.checked;
                if (isLive) {
                    fetchGuardianData();
                    pollTimer = setInterval(fetchGuardianData, POLL_INTERVAL_MS);
                    setStatus('connected');
                } else {
                    clearInterval(pollTimer);
                    setStatus('disconnected');
                }
            });
        }

        // Start 
        if (isLive) {
            fetchGuardianData();
            pollTimer = setInterval(fetchGuardianData, POLL_INTERVAL_MS);
        }
    }

    // Esperar a que el DOM esté listo si se carga async
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
