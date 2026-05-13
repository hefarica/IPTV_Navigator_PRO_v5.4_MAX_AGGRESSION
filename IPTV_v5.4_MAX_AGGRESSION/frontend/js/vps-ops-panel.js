/**
 * VPS OPS PANEL — Frontend controller for NET SHIELD operations
 * Connects to /api/vps-ops on the VPS to run diagnostic/maintenance scripts.
 * 
 * Usage: Include this script, then call VPSOps.init() or it auto-inits on DOMContentLoaded.
 * The panel is injected into the Telemetry tab after the existing NET SHIELD panel.
 */
(function() {
    'use strict';

    const VPS_BASE = 'https://iptv-ape.duckdns.org';
    const API_URL = VPS_BASE + '/api/vps-ops';
    const OWNER_TOKEN = '2E2ETBH3'; // Your owner token

    // ── Panel categories with visual config ──
    const CATEGORIES = {
        diagnostic: { label: 'Diagnóstico', color: '#3b82f6', icon: '🔍' },
        maintenance: { label: 'Mantenimiento', color: '#f59e0b', icon: '🔧' },
        test: { label: 'Tests', color: '#10b981', icon: '🧪' },
    };

    // ── All operations (mirrors PHP catalog) ──
    const OPS = [
        { id: 'health_check',     name: 'Health Check',         icon: '🩺', cat: 'diagnostic' },
        { id: 'traffic_live',     name: 'Tráfico En Vivo',      icon: '📡', cat: 'diagnostic' },
        { id: 'error_scan',       name: 'Scan Errores',         icon: '🔴', cat: 'diagnostic' },
        { id: 'wireguard_status', name: 'WireGuard',            icon: '🔒', cat: 'diagnostic' },
        { id: 'dns_status',       name: 'DNS Hijack',           icon: '🌐', cat: 'diagnostic' },
        { id: 'kernel_tuning',    name: 'Kernel TCP/IP',        icon: '⚡', cat: 'diagnostic' },
        { id: 'connections_live', name: 'Conexiones',           icon: '🔗', cat: 'diagnostic' },
        { id: 'iptables_status',  name: 'IPTables',             icon: '🛡️', cat: 'diagnostic' },
        { id: 'clear_cache',      name: 'Limpiar Cache',        icon: '🗑️', cat: 'maintenance' },
        { id: 'rotate_logs',      name: 'Rotar Logs',           icon: '📋', cat: 'maintenance' },
        { id: 'reload_nginx',     name: 'Reload NGINX',         icon: '🔄', cat: 'maintenance' },
        { id: 'reload_dns',       name: 'Reload DNS',           icon: '🌐', cat: 'maintenance' },
        { id: 'flush_conntrack',  name: 'Flush Conntrack',      icon: '💨', cat: 'maintenance' },
        { id: 'restart_wireguard_health', name: 'Restart WG Health', icon: '♻️', cat: 'maintenance' },
        { id: 'test_upstreams',   name: 'Test Upstreams',       icon: '🧪', cat: 'test' },
        { id: 'test_surfshark',   name: 'Test SurfShark',       icon: '🦈', cat: 'test' },
    ];

    let isRunning = false;

    // ── API call ──
    async function runOp(actionId) {
        if (isRunning) return;
        isRunning = true;

        const btn = document.getElementById('vps-ops-btn-' + actionId);
        const output = document.getElementById('vps-ops-output');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
        if (output) {
            output.style.display = 'block';
            output.innerHTML = '<div style="color:#fbbf24;padding:12px;text-align:center;">⏳ Ejecutando ' + actionId + '…</div>';
        }

        try {
            const resp = await fetch(API_URL + '?action=' + encodeURIComponent(actionId), {
                method: 'POST',
                headers: {
                    'X-APE-Owner': OWNER_TOKEN,
                },
                cache: 'no-store',
            });

            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            renderOutput(data, output);
        } catch (err) {
            if (output) {
                output.innerHTML = '<div style="color:#f87171;padding:12px;">❌ Error: ' + err.message + '</div>';
            }
        } finally {
            isRunning = false;
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        }
    }

    // ── Render results ──
    function renderOutput(data, container) {
        if (!container) return;
        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(16,185,129,0.1);border-radius:8px 8px 0 0;border-bottom:1px solid rgba(16,185,129,0.2);">
                <span style="font-weight:bold;color:#e2e8f0;">${data.icon} ${data.name}</span>
                <span style="font-size:0.72rem;color:#64748b;">${data.total_time_ms}ms · ${data.ts}</span>
            </div>
        `;

        for (const [label, result] of Object.entries(data.results)) {
            const isError = result.exit_code !== 0;
            const statusColor = isError ? '#f87171' : '#4ade80';
            const statusDot = isError ? '🔴' : '🟢';
            const outputText = (result.output || '(empty)').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            html += `
                <div style="border-bottom:1px solid rgba(148,163,184,0.1);padding:8px 12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <span style="font-size:0.78rem;color:#94a3b8;font-weight:600;">${statusDot} ${label}</span>
                        <span style="font-size:0.68rem;color:#64748b;font-family:monospace;">${result.time_ms}ms · exit:${result.exit_code}</span>
                    </div>
                    <pre style="margin:0;padding:6px 8px;background:rgba(0,0,0,0.4);border-radius:6px;font-size:0.72rem;color:${statusColor};white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;font-family:'Cascadia Code','Fira Code',monospace;">${outputText}</pre>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // ── Build UI ──
    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'vps-ops-panel';
        panel.style.cssText = 'background:linear-gradient(135deg,rgba(59,130,246,0.08),rgba(139,92,246,0.05));border:1px solid rgba(59,130,246,0.25);border-radius:16px;padding:20px;margin-top:16px;margin-bottom:16px;';

        // Header
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:1.5rem;">🎛️</span>
                    <div>
                        <h3 style="margin:0;font-size:1rem;color:#e2e8f0;">VPS OPS — Control Remoto</h3>
                        <span style="font-size:0.75rem;color:#818cf8;">NET SHIELD · Diagnóstico & Mantenimiento desde el Frontend</span>
                    </div>
                </div>
                <div id="vps-ops-status" style="font-size:0.75rem;color:#64748b;">Listo</div>
            </div>
        `;

        // Build button grid per category
        for (const [catId, catCfg] of Object.entries(CATEGORIES)) {
            const catOps = OPS.filter(o => o.cat === catId);
            if (!catOps.length) continue;

            const section = document.createElement('div');
            section.style.cssText = 'margin-bottom:14px;';
            section.innerHTML = `
                <div style="font-size:0.72rem;color:${catCfg.color};text-transform:uppercase;margin-bottom:8px;font-weight:bold;letter-spacing:0.5px;">
                    ${catCfg.icon} ${catCfg.label}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;" id="vps-ops-cat-${catId}"></div>
            `;
            panel.appendChild(section);

            const grid = section.querySelector(`#vps-ops-cat-${catId}`);
            for (const op of catOps) {
                const btn = document.createElement('button');
                btn.id = 'vps-ops-btn-' + op.id;
                btn.style.cssText = `
                    padding:8px 14px;
                    background:rgba(30,41,59,0.7);
                    border:1px solid rgba(148,163,184,0.2);
                    border-radius:10px;
                    color:#e2e8f0;
                    font-size:0.78rem;
                    cursor:pointer;
                    transition:all 0.2s;
                    display:flex;align-items:center;gap:6px;
                    font-family:inherit;
                `;
                btn.innerHTML = `<span>${op.icon}</span><span>${op.name}</span>`;
                btn.onmouseenter = () => { btn.style.background = 'rgba(59,130,246,0.2)'; btn.style.borderColor = catCfg.color; btn.style.transform = 'translateY(-1px)'; };
                btn.onmouseleave = () => { btn.style.background = 'rgba(30,41,59,0.7)'; btn.style.borderColor = 'rgba(148,163,184,0.2)'; btn.style.transform = 'none'; };
                btn.onclick = () => runOp(op.id);
                grid.appendChild(btn);
            }
        }

        // Output area
        const outputArea = document.createElement('div');
        outputArea.id = 'vps-ops-output';
        outputArea.style.cssText = 'display:none;margin-top:14px;background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.15);border-radius:12px;overflow:hidden;max-height:500px;overflow-y:auto;';
        panel.appendChild(outputArea);

        return panel;
    }

    // ── Inject into page ──
    function inject() {
        // Try to insert after the NET SHIELD DNS panel or the Guardian panel
        const netShieldPanel = document.querySelector('.ape-v16-exchange-panel:last-of-type');
        const prismaWidget = document.getElementById('prisma-control-widget');
        const target = prismaWidget || netShieldPanel;

        if (target && target.parentNode) {
            target.parentNode.insertBefore(buildPanel(), target);
            console.log('🎛️ [VPS-OPS] Panel injected successfully');
        } else {
            // Fallback: append to telemetry tab
            const telemetryTab = document.getElementById('tab-telemetry');
            if (telemetryTab) {
                telemetryTab.appendChild(buildPanel());
                console.log('🎛️ [VPS-OPS] Panel appended to telemetry tab');
            }
        }
    }

    // ── Public API ──
    window.VPSOps = { runOp, inject };

    // ── Auto-init ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(inject, 500));
    } else {
        setTimeout(inject, 500);
    }

})();
