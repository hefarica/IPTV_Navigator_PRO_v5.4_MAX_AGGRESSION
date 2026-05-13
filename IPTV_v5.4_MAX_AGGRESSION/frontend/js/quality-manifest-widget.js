/**
 * APE Quality Manifest Control v1.0 — ONN 4K Settings Dashboard
 * Mounts into #quality-manifest-widget in the Telemetry tab.
 * Reads/writes all 58 ONN settings via VPS PHP→ADB bridge.
 * Guardian-safe: verifies daemon alive before/after every change.
 * 
 * Pattern: IIFE + polling (mirrors prisma-control-widget.js)
 */
(function () {
  'use strict';

  const BASE_URL = 'https://iptv-ape.duckdns.org';
  const LOCAL_API = 'http://localhost:7777';
  const VPS_API = `${BASE_URL}/prisma/api/prisma-adb-quality.php`;
  const V2RAY_API = `${BASE_URL}/prisma/api/prisma-v2ray-config.php`;
  const POLL_MS = 30_000;

  let API = VPS_API; // Will be overridden if local bridge is detected
  let apiMode = 'vps'; // 'local' or 'vps'

  const GROUP_META = {
    ai:         { icon: '🤖', name: 'AI Picture Quality',  color: '#a855f7', desc: 'Amlogic AI PQ Engine · Super Resolution · DNR' },
    display:    { icon: '📺', name: 'Display',             color: '#3b82f6', desc: 'Resolution · Refresh Rate · Frame Matching' },
    hdr:        { icon: '🌈', name: 'HDR Pipeline',        color: '#f59e0b', desc: 'Conversion · Luminance · Tone Mapping' },
    color:      { icon: '🎨', name: 'Color Depth',         color: '#ec4899', desc: 'HDMI Space · Bit Depth · Chroma' },
    audio:      { icon: '🔊', name: 'Audio',               color: '#06b6d4', desc: 'Surround · Atmos · SPDIF' },
    brightness: { icon: '☀️', name: 'Brightness',          color: '#eab308', desc: 'Video · Screen Brightness' },
    gpu:        { icon: '⚡', name: 'GPU Rendering',       color: '#10b981', desc: 'Hardware Acceleration · Force GPU' },
    power:      { icon: '🔋', name: 'Power',               color: '#64748b', desc: 'Screen Timeout · Keep Alive' },
  };

  let lastData = null;
  let expandedGroups = new Set(['ai', 'hdr', 'color']);
  let pendingChanges = {};

  function $(sel, root = document) { return root.querySelector(sel); }

  // ── API ──────────────────────────────────────────────────────────────
  async function apiGet(action) {
    const r = await fetch(`${API}?action=${action}&t=${Date.now()}`, { cache: 'no-store', mode: 'cors' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function apiSet(key, value, ns) {
    const params = new URLSearchParams({ action: 'set', key, value: String(value), ns });
    const r = await fetch(`${API}?${params}`, { method: 'POST', cache: 'no-store', mode: 'cors' });
    return r.json();
  }

  async function apiRestartGuardian() {
    const r = await fetch(`${API}?action=restart_guardian`, { method: 'POST', cache: 'no-store', mode: 'cors' });
    return r.json();
  }

  // ── Render helpers ──────────────────────────────────────────────────
  function guardianBadge(g) {
    if (!g) return `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(100,116,139,0.2);color:#64748b">? Unknown</span>`;
    if (g.alive) {
      return `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.2);color:#34d399;font-weight:600">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;box-shadow:0 0 4px #10b981;margin-right:4px;vertical-align:middle"></span>
        PID ${g.pid} · ALIVE</span>`;
    }
    return `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.2);color:#f87171;font-weight:600;animation:pulse 1.5s infinite">
      ✗ DEAD</span>`;
  }

  function settingInput(s) {
    const id = `qm-${s.ns}-${s.key}`;
    const pendingKey = `${s.ns}:${s.key}`;
    const isPending = pendingChanges[pendingKey] !== undefined;
    const displayValue = isPending ? pendingChanges[pendingKey] : (s.current ?? s.expected);

    switch (s.type) {
      case 'toggle': {
        const checked = String(displayValue) === '1';
        return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" id="${id}" data-ns="${s.ns}" data-key="${s.key}" data-type="toggle"
            ${checked ? 'checked' : ''} ${isPending ? 'disabled' : ''}
            style="width:14px;height:14px;accent-color:#a855f7;cursor:pointer">
        </label>`;
      }
      case 'select': {
        if (!s.options) return `<span style="color:#94a3b8;font-size:0.7rem">${displayValue}</span>`;
        let opts = '';
        for (const [val, label] of Object.entries(s.options)) {
          opts += `<option value="${val}" ${String(displayValue) === String(val) ? 'selected' : ''}>${label}</option>`;
        }
        return `<select id="${id}" data-ns="${s.ns}" data-key="${s.key}" data-type="select"
          ${isPending ? 'disabled' : ''}
          style="padding:2px 6px;border-radius:4px;background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.3);
          font-size:0.68rem;cursor:pointer;max-width:120px">${opts}</select>`;
      }
      case 'number': {
        const min = s.options?.min ?? 0;
        const max = s.options?.max ?? 99999;
        return `<input type="number" id="${id}" data-ns="${s.ns}" data-key="${s.key}" data-type="number"
          value="${displayValue}" min="${min}" max="${max}" ${isPending ? 'disabled' : ''}
          style="width:72px;padding:2px 6px;border-radius:4px;background:#0f172a;color:#e2e8f0;
          border:1px solid rgba(148,163,184,0.3);font-size:0.68rem;font-family:monospace">`;
      }
      case 'readonly':
        return `<span style="font-size:0.72rem;font-weight:700;color:#c4b5fd;font-family:monospace">${displayValue ?? '—'}</span>`;
      default:
        return `<span style="color:#94a3b8;font-size:0.7rem">${displayValue ?? '—'}</span>`;
    }
  }

  function syncBadge(s) {
    if (s.current === null || s.current === undefined) {
      return `<span style="font-size:0.55rem;padding:1px 5px;border-radius:3px;background:rgba(100,116,139,0.2);color:#64748b">null</span>`;
    }
    if (s.synced) {
      return `<span style="font-size:0.55rem;padding:1px 5px;border-radius:3px;background:rgba(16,185,129,0.15);color:#34d399">✓</span>`;
    }
    return `<span style="font-size:0.55rem;padding:1px 5px;border-radius:3px;background:rgba(245,158,11,0.2);color:#fbbf24"
      title="Expected: ${s.expected}, Got: ${s.current}">⚠ drift</span>`;
  }

  // ── Main render ─────────────────────────────────────────────────────
  function render(data) {
    const host = $('#quality-manifest-widget');
    if (!host) return;

    const guardian = data.guardian || {};
    const settings = data.settings || [];
    const driftGroups = data.drift_by_group || {};
    const total = data.total || 0;
    const synced = settings.filter(s => s.synced).length;
    const drifted = total - synced;

    // Group settings
    const groups = {};
    for (const s of settings) {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push(s);
    }

    // Overall status
    const allGood = guardian.alive && drifted === 0;
    const statusColor = allGood ? '#10b981' : (!guardian.alive ? '#f87171' : '#f59e0b');
    const statusGlow = `0 0 8px ${statusColor}`;
    const statusLabel = allGood ? '⚡ Perfecto · Guardian Activo' : (!guardian.alive ? '✗ Guardian Muerto' : `⚠ ${drifted} Drifted`);

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.4rem">🛡️</span>
          <div>
            <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">Quality Manifest Control
              <span style="font-size:0.6rem;padding:2px 6px;background:rgba(168,85,247,0.3);border-radius:999px;color:#c4b5fd;margin-left:4px">v1.0</span>
            </div>
            <div style="font-size:0.62rem;color:#94a3b8">ONN 4K · ${total} Settings · ${apiMode === 'local' ? '<span style="color:#34d399">LOCAL</span>' : '<span style="color:#60a5fa">VPS</span>'} ADB Bridge</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};box-shadow:${statusGlow};display:inline-block"></span>
          <span style="font-size:0.68rem;color:${statusColor};font-weight:600">${statusLabel}</span>
          ${guardianBadge(guardian)}
          <button id="qm-restart-guardian" style="font-size:0.6rem;padding:2px 8px;border-radius:4px;
            background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);cursor:pointer;
            transition:all .2s" title="Kill + restart guardian daemon">🔄 Restart</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:#34d399;
          border:1px solid rgba(16,185,129,0.2);font-weight:600">✓ ${synced} Synced</span>
        ${drifted > 0 ? `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.15);
          color:#fbbf24;border:1px solid rgba(245,158,11,0.2);font-weight:600">⚠ ${drifted} Drifted</span>` : ''}
        <span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(168,85,247,0.1);
          color:#c4b5fd;border:1px solid rgba(168,85,247,0.2)">Updated: ${data.ts ? new Date(data.ts).toLocaleTimeString() : '—'}</span>
      </div>`;

    // ── Render groups ──
    for (const [gid, meta] of Object.entries(GROUP_META)) {
      const items = groups[gid] || [];
      if (items.length === 0) continue;
      const isOpen = expandedGroups.has(gid);
      const gDrift = driftGroups[gid] || 0;
      const gBorder = gDrift > 0 ? 'rgba(245,158,11,0.4)' : `${meta.color}33`;

      html += `
      <div style="margin-bottom:8px;border:1px solid ${gBorder};border-radius:10px;overflow:hidden;
        transition:all .3s;background:rgba(15,23,42,0.5)">
        <div class="qm-group-header" data-group="${gid}" style="display:flex;justify-content:space-between;
          align-items:center;padding:10px 12px;cursor:pointer;background:rgba(15,23,42,0.8);
          border-bottom:${isOpen ? '1px solid rgba(100,116,139,0.15)' : 'none'};transition:all .2s;user-select:none">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:1rem">${meta.icon}</span>
            <div>
              <div style="font-size:0.75rem;font-weight:600;color:#e2e8f0">${meta.name}
                <span style="font-size:0.55rem;color:#64748b;font-weight:400;margin-left:4px">(${items.length})</span>
              </div>
              <div style="font-size:0.55rem;color:#64748b">${meta.desc}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            ${gDrift > 0 ? `<span style="font-size:0.55rem;padding:1px 6px;border-radius:3px;background:rgba(245,158,11,0.2);
              color:#fbbf24;font-weight:600">${gDrift} drift</span>` : 
              `<span style="font-size:0.55rem;padding:1px 6px;border-radius:3px;background:rgba(16,185,129,0.15);
              color:#34d399">✓ all</span>`}
            <span style="font-size:0.7rem;color:#64748b;transition:transform .2s;display:inline-block;
              transform:rotate(${isOpen ? '90deg' : '0deg'})">${isOpen ? '▾' : '▸'}</span>
          </div>
        </div>
        ${isOpen ? `<div style="padding:4px 0">
          ${items.map(s => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 12px;
              border-bottom:1px solid rgba(100,116,139,0.08);transition:background .15s"
              onmouseenter="this.style.background='rgba(168,85,247,0.04)'"
              onmouseleave="this.style.background='transparent'">
              <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">
                ${syncBadge(s)}
                <span style="font-size:0.68rem;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
                  title="${s.ns}:${s.key}">${s.label}</span>
                <span style="font-size:0.52rem;color:#475569;font-family:monospace">${s.key}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                ${s.current !== null && !s.synced ? 
                  `<span style="font-size:0.52rem;color:#f87171;text-decoration:line-through;font-family:monospace"
                    title="Current value">${s.current}</span>
                   <span style="font-size:0.6rem;color:#475569">→</span>` : ''}
                ${settingInput(s)}
              </div>
            </div>
          `).join('')}
        </div>` : ''}
      </div>`;
    }

    // ── Xray / v2rayNG Panel ──
    html += `
    <div style="margin-top:10px;border:1px solid rgba(59,130,246,0.3);border-radius:10px;overflow:hidden;
      background:rgba(15,23,42,0.5)">
      <div class="qm-group-header" data-group="xray" style="display:flex;justify-content:space-between;
        align-items:center;padding:10px 12px;cursor:pointer;background:rgba(15,23,42,0.8);user-select:none">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1rem">🔐</span>
          <div>
            <div style="font-size:0.75rem;font-weight:600;color:#e2e8f0">Xray / v2rayNG
              <span style="font-size:0.55rem;color:#64748b;font-weight:400;margin-left:4px">VPS Tunnel</span>
            </div>
            <div style="font-size:0.55rem;color:#64748b">VLESS+Reality · Always-On · Config Manager</div>
          </div>
        </div>
        <span style="font-size:0.7rem;color:#64748b">${expandedGroups.has('xray') ? '▾' : '▸'}</span>
      </div>
      ${expandedGroups.has('xray') ? `<div style="padding:10px 12px" id="qm-xray-panel">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <button id="qm-xray-status" style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);cursor:pointer">
            📊 Status</button>
          <button id="qm-xray-restart" style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);cursor:pointer">
            🔄 Restart Xray</button>
          <button id="qm-v2ray-download" style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);cursor:pointer">
            ⬇ Download Config</button>
          <button id="qm-v2ray-push" style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(168,85,247,0.15);color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer">
            📲 Push to ONN</button>
          <label style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);cursor:pointer">
            ⬆ Upload JSON
            <input type="file" id="qm-v2ray-upload" accept=".json" style="display:none">
          </label>
        </div>
        <div id="qm-xray-result" style="font-size:0.62rem;color:#94a3b8;font-family:monospace;
          background:rgba(0,0,0,0.3);border-radius:6px;padding:8px;max-height:150px;overflow-y:auto;
          display:none;white-space:pre-wrap"></div>
      </div>` : ''}
    </div>`;

    // ── Footer ──
    html += `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;
      border-top:1px solid rgba(100,116,139,0.15)">
      <span style="font-size:0.55rem;color:#475569">Poll: ${POLL_MS/1000}s · Last: ${new Date().toLocaleTimeString()}</span>
      <div style="display:flex;gap:4px">
        <button id="qm-sync-all" style="font-size:0.58rem;padding:2px 8px;border-radius:4px;
          background:rgba(168,85,247,0.15);color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer"
          title="Force all settings to expected values">⚡ Sync All</button>
        <button id="qm-refresh" style="font-size:0.58rem;padding:2px 8px;border-radius:4px;
          background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);cursor:pointer">🔄 Refresh</button>
      </div>
    </div>`;

    host.innerHTML = html;
    bindEvents(data);
  }

  // ── Event binding ───────────────────────────────────────────────────
  function bindEvents(data) {
    // Group toggle
    document.querySelectorAll('.qm-group-header').forEach(el => {
      el.addEventListener('click', () => {
        const g = el.dataset.group;
        if (expandedGroups.has(g)) expandedGroups.delete(g); else expandedGroups.add(g);
        render(lastData || data);
      });
    });

    // Restart guardian
    const restartBtn = $('#qm-restart-guardian');
    if (restartBtn) {
      restartBtn.addEventListener('click', async () => {
        restartBtn.textContent = '⏳...';
        restartBtn.disabled = true;
        try {
          const res = await apiRestartGuardian();
          restartBtn.textContent = res.alive ? '✓ OK' : '✗ Fail';
          setTimeout(refresh, 1000);
        } catch (e) {
          restartBtn.textContent = '✗ Error';
        }
      });
    }

    // Refresh
    const refreshBtn = $('#qm-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);

    // Sync All
    const syncBtn = $('#qm-sync-all');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        if (!confirm('⚡ Forzar TODOS los settings a sus valores esperados. ¿Continuar?')) return;
        syncBtn.textContent = '⏳...';
        syncBtn.disabled = true;
        const drifted = (data.settings || []).filter(s => !s.synced && s.type !== 'readonly');
        for (const s of drifted) {
          try { await apiSet(s.key, s.expected, s.ns); } catch (_) {}
        }
        syncBtn.textContent = '✓ Done';
        setTimeout(refresh, 2000);
      });
    }

    // Individual setting changes
    document.querySelectorAll('[data-type="toggle"]').forEach(el => {
      el.addEventListener('change', () => applySetting(el.dataset.ns, el.dataset.key, el.checked ? '1' : '0', el));
    });

    document.querySelectorAll('[data-type="select"]').forEach(el => {
      el.addEventListener('change', () => applySetting(el.dataset.ns, el.dataset.key, el.value, el));
    });

    document.querySelectorAll('[data-type="number"]').forEach(el => {
      let timer;
      el.addEventListener('change', () => {
        clearTimeout(timer);
        timer = setTimeout(() => applySetting(el.dataset.ns, el.dataset.key, el.value, el), 500);
      });
    });

    // ── Xray / v2rayNG events ──
    const xrayResult = $('#qm-xray-result');
    function showXrayResult(text, color = '#94a3b8') {
      if (!xrayResult) return;
      xrayResult.style.display = 'block';
      xrayResult.style.color = color;
      xrayResult.textContent = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
    }

    const xrayStatusBtn = $('#qm-xray-status');
    if (xrayStatusBtn) {
      xrayStatusBtn.addEventListener('click', async () => {
        xrayStatusBtn.textContent = '⏳...';
        try {
          const r = await fetch(`${V2RAY_API}?action=xray_status&t=${Date.now()}`, { cache: 'no-store' });
          const d = await r.json();
          showXrayResult(
            `Status: ${d.active}\nPID: ${d.pid || 'N/A'}\nPort 8443: ${d.listening ? '✓ listening' : '✗ NOT listening'}\nUptime: ${d.uptime_since || '?'}\nMemory: ${d.memory || '?'}\n\nLast Errors:\n${d.last_errors || 'none'}`,
            d.ok ? '#34d399' : '#f87171'
          );
        } catch (e) { showXrayResult('Error: ' + e.message, '#f87171'); }
        xrayStatusBtn.textContent = '📊 Status';
      });
    }

    const xrayRestartBtn = $('#qm-xray-restart');
    if (xrayRestartBtn) {
      xrayRestartBtn.addEventListener('click', async () => {
        if (!confirm('🔄 Reiniciar Xray en el VPS. ¿Continuar?')) return;
        xrayRestartBtn.textContent = '⏳...';
        try {
          const r = await fetch(`${V2RAY_API}?action=restart_xray`, { method: 'POST', cache: 'no-store' });
          const d = await r.json();
          showXrayResult(d.ok ? `✓ Xray restarted (PID: ${d.pid})` : `✗ Restart failed: ${d.output}`, d.ok ? '#34d399' : '#f87171');
        } catch (e) { showXrayResult('Error: ' + e.message, '#f87171'); }
        xrayRestartBtn.textContent = '🔄 Restart Xray';
      });
    }

    const v2rayDownloadBtn = $('#qm-v2ray-download');
    if (v2rayDownloadBtn) {
      v2rayDownloadBtn.addEventListener('click', async () => {
        try {
          const r = await fetch(`${V2RAY_API}?action=get_config&t=${Date.now()}`, { cache: 'no-store' });
          const d = await r.json();
          if (d.ok) {
            const blob = new Blob([JSON.stringify(d.config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'v2rayng-client-config.json'; a.click();
            URL.revokeObjectURL(url);
            showXrayResult(`✓ Config downloaded (${d.size_bytes} bytes)\nLast modified: ${d.last_modified}`, '#34d399');
          } else { showXrayResult('✗ ' + d.error, '#f87171'); }
        } catch (e) { showXrayResult('Error: ' + e.message, '#f87171'); }
      });
    }

    const v2rayUploadInput = $('#qm-v2ray-upload');
    if (v2rayUploadInput) {
      v2rayUploadInput.addEventListener('change', async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          JSON.parse(text); // validate
          const r = await fetch(`${V2RAY_API}?action=update_config`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: text,
          });
          const d = await r.json();
          showXrayResult(d.ok ? `✓ Config uploaded! (${d.size_bytes} bytes)\n${d.last_modified}` : '✗ ' + d.error,
            d.ok ? '#34d399' : '#f87171');
        } catch (e) { showXrayResult('✗ Invalid JSON: ' + e.message, '#f87171'); }
        v2rayUploadInput.value = '';
      });
    }

    const v2rayPushBtn = $('#qm-v2ray-push');
    if (v2rayPushBtn) {
      v2rayPushBtn.addEventListener('click', async () => {
        v2rayPushBtn.textContent = '⏳...';
        try {
          const r = await fetch(`${V2RAY_API}?action=push_to_onn`, { method: 'POST', cache: 'no-store' });
          const d = await r.json();
          showXrayResult(d.ok ? `✓ ${d.message}\n${d.note || ''}` : '✗ ' + d.error, d.ok ? '#34d399' : '#f87171');
        } catch (e) { showXrayResult('Error: ' + e.message, '#f87171'); }
        v2rayPushBtn.textContent = '📲 Push to ONN';
      });
    }
  }

  // ── Apply a single setting change ──────────────────────────────────
  async function applySetting(ns, key, value, el) {
    const pendingKey = `${ns}:${key}`;
    pendingChanges[pendingKey] = value;

    // Visual feedback: show spinner
    const row = el.closest('div[style*="border-bottom"]');
    if (row) {
      row.style.background = 'rgba(168,85,247,0.08)';
      row.style.borderLeft = '2px solid #a855f7';
    }
    el.disabled = true;

    try {
      const res = await apiSet(key, value, ns);

      if (res.hw_rejected) {
        // Hardware rejected — show warning, revert UI
        if (row) {
          row.style.background = 'rgba(239,68,68,0.08)';
          row.style.borderLeft = '2px solid #f87171';
        }
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.5rem;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.2);color:#f87171;margin-left:4px;font-weight:600';
        badge.textContent = '⚠ HW Limit';
        if (row) row.appendChild(badge);
        setTimeout(() => { delete pendingChanges[pendingKey]; refresh(); }, 3000);
      } else if (res.ok) {
        if (row) {
          row.style.background = 'rgba(16,185,129,0.08)';
          row.style.borderLeft = '2px solid #10b981';
        }
        setTimeout(() => { delete pendingChanges[pendingKey]; refresh(); }, 1500);
      } else {
        if (row) {
          row.style.background = 'rgba(245,158,11,0.08)';
          row.style.borderLeft = '2px solid #f59e0b';
        }
        setTimeout(() => { delete pendingChanges[pendingKey]; refresh(); }, 2000);
      }
    } catch (e) {
      if (row) row.style.background = 'rgba(239,68,68,0.08)';
      setTimeout(() => { delete pendingChanges[pendingKey]; refresh(); }, 2000);
    }
  }

  // ── Poll cycle ─────────────────────────────────────────────────────
  async function refresh() {
    const host = $('#quality-manifest-widget');
    if (!host) return;

    try {
      const data = await apiGet('read_all');
      lastData = data;
      render(data);
    } catch (e) {
      if (lastData) {
        render(lastData);
      } else {
        host.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:14px">
            <span style="font-size:1.4rem">🛡️</span>
            <div>
              <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">Quality Manifest Control</div>
              <div style="font-size:0.72rem;color:#f87171">⚠ Cannot reach ADB API (${e.message})</div>
              <div style="font-size:0.65rem;color:#64748b;margin-top:4px">
                <button id="qm-retry" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;
                  padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.65rem">Retry</button>
              </div>
            </div>
          </div>`;
        const retry = $('#qm-retry');
        if (retry) retry.addEventListener('click', refresh);
      }
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────
  async function boot() {
    const host = $('#quality-manifest-widget');
    if (!host) return;
    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px">
        <span style="font-size:1.4rem">🛡️</span>
        <div>
          <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">Quality Manifest Control</div>
          <div style="font-size:0.72rem;color:#94a3b8">Detecting ADB bridge…</div>
        </div>
      </div>`;

    // Try local bridge first (localhost:7777)
    try {
      const r = await fetch(`${LOCAL_API}?action=guardian_status&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const d = await r.json();
        if (d.ok !== undefined) {
          API = LOCAL_API;
          apiMode = 'local';
        }
      }
    } catch (_) { /* local not available, use VPS */ }

    refresh();
    setInterval(refresh, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
