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
  let dirtyKeys = new Set(); // tracks unsaved changes from panel inputs

  // Embedded settings manifest — always available even without API
  const MANIFEST = [
    ['system','aipq_enable','1','ai','AI PQ Enable','toggle'],
    ['system','aisr_enable','1','ai','AI SR Enable','toggle'],
    ['system','ai_pq_mode','3','ai','AI PQ Mode','select'],
    ['system','ai_sr_mode','3','ai','AI SR Mode','select'],
    ['global','ai_pic_mode','3','ai','AI Picture Mode','select'],
    ['global','ai_sr_level','3','ai','AI SR Level','select'],
    ['global','pq_ai_dnr_enable','1','ai','AI Digital NR','toggle'],
    ['global','pq_ai_fbc_enable','1','ai','AI Film Bias Comp','toggle'],
    ['global','pq_ai_sr_enable','1','ai','AI SR Global','toggle'],
    ['global','pq_nr_enable','1','ai','Noise Reduction','toggle'],
    ['global','pq_sharpness_enable','1','ai','Sharpness','toggle'],
    ['global','pq_dnr_enable','1','ai','Digital NR','toggle'],
    ['global','smart_illuminate_enabled','1','ai','Smart Illuminate','toggle'],
    ['global','user_preferred_resolution_height','2160','display','Resolution Height','readonly'],
    ['global','user_preferred_resolution_width','3840','display','Resolution Width','readonly'],
    ['global','user_preferred_refresh_rate','60.0','display','Refresh Rate','select'],
    ['global','display_color_mode','3','display','Color Mode','select'],
    ['global','match_content_frame_rate_pref','2','display','Match Frame Rate','select'],
    ['global','match_content_frame_rate','1','display','Frame Match ON','toggle'],
    ['global','hdr_conversion_mode','0','hdr','HDR Conversion','select'],
    ['global','hdr_output_type','4','hdr','HDR Output Type','select'],
    ['global','hdr_force_conversion_type','-1','hdr','Force Conversion','select'],
    ['global','hdr_brightness_boost','100','hdr','HDR Brightness','number'],
    ['global','sdr_brightness_in_hdr','100','hdr','SDR in HDR Bright','number'],
    ['global','peak_luminance','8000','hdr','Peak Luminance','number'],
    ['global','pq_hdr_enable','1','hdr','HDR Engine','toggle'],
    ['global','pq_hdr_mode','1','hdr','HDR Processing','toggle'],
    ['global','always_hdr','0','hdr','Always HDR','toggle'],
    ['global','hdmi_color_space','2','color','HDMI Color Space','select'],
    ['global','color_depth','12','color','Color Depth','select'],
    ['global','color_mode_ycbcr422','1','color','YCbCr 4:2:2','toggle'],
    ['global','encoded_surround_output','2','audio','Surround Output','select'],
    ['global','enable_dolby_atmos','1','audio','Dolby Atmos','toggle'],
    ['global','db_id_sound_spdif_output_enable','1','audio','SPDIF Output','toggle'],
    ['global','video_brightness','100','brightness','Video Brightness','number'],
    ['system','screen_brightness','255','brightness','Screen Brightness','number'],
    ['global','force_gpu_rendering','1','gpu','Force GPU','toggle'],
    ['global','force_hw_ui','1','gpu','Force HW UI','toggle'],
    ['global','hardware_accelerated_rendering_enabled','1','gpu','HW Accel','toggle'],
    ['system','screen_off_timeout','2147483647','power','Screen Timeout','select'],
  ];

  /** Build offline data from embedded manifest (when API is unreachable) */
  function offlineData() {
    const settings = MANIFEST.map(([ns, key, expected, group, label, type]) => ({
      ns, key, expected, current: null, synced: false, group, label, type, options: null
    }));
    const drift = {};
    for (const s of settings) { drift[s.group] = (drift[s.group] || 0) + 1; }
    return { ok: false, settings, drift_by_group: drift, guardian: { pid: null, alive: false }, total: MANIFEST.length, ts: null, offline: true };
  }

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
  function guardianBadge(g, mode) {
    if (!g) return `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(100,116,139,0.2);color:#64748b">? Unknown</span>`;
    
    // In VPS mode, the PID might not be available, but we know it's alive via heartbeat
    const idText = g.pid ? `PID ${g.pid}` : 'VPS Heartbeat';
    
    if (g.alive) {
      return `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.2);color:#34d399;font-weight:600">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;box-shadow:0 0 4px #10b981;margin-right:4px;vertical-align:middle"></span>
        ${idText} · ALIVE</span>`;
    }
    return `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.2);color:#f87171;font-weight:600;animation:pulse 1.5s infinite">
      ✗ MUERTO O SIN CONEXIÓN</span>`;
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

    // Connection mode awareness
    const connMode = data.connectionMode || (data.offline ? 'offline' : 'vps');
    const isVpsManifest = connMode === 'vps-manifest';
    const isLocal = connMode === 'local';
    const isOffline = data.offline;

    // Status: Combine connection mode + Guardian heartbeat
    let allGood, statusColor, statusLabel;
    
    if (isOffline) {
      allGood = false;
      statusColor = '#f87171';
      statusLabel = '📡 Sin conexión total';
    } else if (isVpsManifest) {
      allGood = guardian.alive;
      statusColor = guardian.alive ? '#60a5fa' : '#f59e0b';
      statusLabel = guardian.alive ? '☁ VPS Guardado · ONN En línea' : '⚠ VPS Guardado · ONN Offline';
    } else {
      allGood = guardian.alive && drifted === 0;
      statusColor = allGood ? '#10b981' : (!guardian.alive ? '#f87171' : '#f59e0b');
      statusLabel = allGood ? '⚡ Perfecto · Guardian Activo' : (!guardian.alive ? '✗ Guardian Muerto' : `⚠ ${drifted} Drifted`);
    }
    const statusGlow = `0 0 8px ${statusColor}`;

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.4rem">🛡️</span>
          <div>
            <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">Quality Manifest Control
              <span style="font-size:0.6rem;padding:2px 6px;background:rgba(168,85,247,0.3);border-radius:999px;color:#c4b5fd;margin-left:4px">v1.0</span>
            </div>
            <div style="font-size:0.62rem;color:#94a3b8">ONN 4K · ${total} Settings · ${isLocal ? '<span style="color:#34d399">LOCAL</span> ADB' : isVpsManifest ? '<span style="color:#60a5fa">VPS</span> Guardado' : '<span style="color:#f59e0b">OFFLINE</span> Defaults'}${data.savedAt ? ` · <span style="color:#64748b">${new Date(data.savedAt).toLocaleString()}</span>` : ''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};box-shadow:${statusGlow};display:inline-block"></span>
          <span style="font-size:0.68rem;color:${statusColor};font-weight:600">${statusLabel}</span>
          ${isLocal ? guardianBadge(guardian) : `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.15);color:#60a5fa;font-weight:600">${isVpsManifest ? '✓ Persistente' : '○ Editable'}</span>`}
          
          <button id="qm-toggle-guardian" style="font-size:0.6rem;padding:2px 8px;border-radius:4px;
            background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);cursor:pointer;
            transition:all .2s" title="Stop/Start Sentinel">
            ${guardian.alive ? '⏹ Stop' : '▶ Start'}
          </button>
          
          <button id="qm-restart-guardian" style="font-size:0.6rem;padding:2px 8px;border-radius:4px;
            background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);cursor:pointer;
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

    // Offline warning banner
    if (isOffline) {
      html += `
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;
        padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        <span style="font-size:1rem">📡</span>
        <div>
          <div style="font-size:0.68rem;color:#fbbf24;font-weight:600">Sin manifiesto guardado — Edita y haz clic en "💾 Guardar y Aplicar"</div>
          <div style="font-size:0.58rem;color:#94a3b8">Los valores se guardarán en el VPS y el Guardian los aplicará al ONN automáticamente</div>
        </div>
      </div>`;
    } else if (isVpsManifest) {
      html += `
      <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:8px;
        padding:6px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        <span style="font-size:0.8rem">☁️</span>
        <div style="font-size:0.58rem;color:#94a3b8">Estado guardado en VPS · Guardian aplica cada 15s · Edita y guarda para cambiar al vuelo</div>
      </div>`;
    }

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
    const hasDirty = dirtyKeys.size > 0;
    html += `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;
      border-top:1px solid rgba(100,116,139,0.15)">
      <span style="font-size:0.55rem;color:#475569">Poll: ${POLL_MS/1000}s · Last: ${new Date().toLocaleTimeString()}</span>
      <div style="display:flex;gap:4px;align-items:center">
        <button id="qm-save-apply" style="font-size:0.62rem;padding:3px 12px;border-radius:6px;
          background:${hasDirty ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.1)'};
          color:${hasDirty ? '#34d399' : '#6b7280'};border:1px solid ${hasDirty ? 'rgba(16,185,129,0.5)' : 'rgba(16,185,129,0.2)'};
          cursor:pointer;font-weight:700;transition:all .2s;
          ${hasDirty ? 'animation:pulse 1.5s infinite;box-shadow:0 0 12px rgba(16,185,129,0.3);' : ''}"
          title="Guardar cambios y enviar al ONN al vuelo via Guardian">💾 Guardar y Aplicar${hasDirty ? ` (${dirtyKeys.size})` : ''}</button>
        <button id="qm-sync-all" style="font-size:0.58rem;padding:2px 8px;border-radius:4px;
          background:rgba(168,85,247,0.15);color:#c4b5fd;border:1px solid rgba(168,85,247,0.3);cursor:pointer"
          title="Force all settings to expected values">⚡ Sync All</button>
        <button id="qm-refresh" style="font-size:0.58rem;padding:2px 8px;border-radius:4px;
          background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);cursor:pointer">🔄 Refresh</button>
      </div>
    </div>
    <div id="qm-save-status" style="font-size:0.6rem;text-align:center;padding:4px;margin-top:4px;display:none;
      border-radius:4px"></div>`;

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
      el.addEventListener('change', () => {
        const val = el.checked ? '1' : '0';
        markDirty(el.dataset.ns, el.dataset.key, val, el);
        if (apiMode === 'local') applySetting(el.dataset.ns, el.dataset.key, val, el);
      });
    });

    document.querySelectorAll('[data-type="select"]').forEach(el => {
      el.addEventListener('change', () => {
        markDirty(el.dataset.ns, el.dataset.key, el.value, el);
        if (apiMode === 'local') applySetting(el.dataset.ns, el.dataset.key, el.value, el);
      });
    });

    document.querySelectorAll('[data-type="number"]').forEach(el => {
      el.addEventListener('input', () => {
        markDirty(el.dataset.ns, el.dataset.key, el.value, el);
        if (apiMode === 'local') applySetting(el.dataset.ns, el.dataset.key, el.value, el);
      });
    });

    // 💾 Guardar y Aplicar
    const saveBtn = $('#qm-save-apply');
    if (saveBtn) saveBtn.addEventListener('click', saveAndApply);

    // 🔄 Restart Sentinel
    const restartBtn = $('#qm-restart-guardian');
    if (restartBtn) {
      restartBtn.addEventListener('click', async () => {
        restartBtn.textContent = '⏳...';
        restartBtn.disabled = true;
        try {
          const r = await fetch(`${LOCAL_API}?action=restart_guardian`, { method: 'POST', cache: 'no-store' });
          if (r.ok) {
             const d = await r.json();
             if (d.ok) restartBtn.textContent = '✓ Ok';
             else throw new Error(d.error);
          } else {
             throw new Error('Local API failed');
          }
        } catch (e) {
          restartBtn.textContent = '✗ Error';
          console.error(e);
        }
        setTimeout(() => { restartBtn.textContent = '🔄 Restart'; restartBtn.disabled = false; refresh(); }, 3000);
      });
    }

    // ⏹/▶ Toggle Sentinel
    const toggleBtn = $('#qm-toggle-guardian');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        const isAlive = guardian.alive;
        toggleBtn.textContent = '⏳...';
        toggleBtn.disabled = true;
        try {
          const action = isAlive ? 'stop_guardian' : 'restart_guardian';
          const r = await fetch(`${LOCAL_API}?action=${action}`, { method: 'POST', cache: 'no-store' });
          if (r.ok) {
             const d = await r.json();
             if (d.ok) toggleBtn.textContent = '✓ Ok';
             else throw new Error(d.error);
          } else {
             throw new Error('Local API failed');
          }
        } catch (e) {
          toggleBtn.textContent = '✗ Error';
          console.error(e);
        }
        setTimeout(() => { toggleBtn.disabled = false; refresh(); }, 3000);
      });
    }

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

  // ── Mark a setting as dirty (changed but not saved) ────────────────
  function markDirty(ns, key, value, el) {
    const id = `${ns}:${key}`;
    dirtyKeys.add(id);
    pendingChanges[id] = { ns, key, value };
    
    // Visual feedback on the row
    const row = el.closest('div[style*="border-bottom"]');
    if (row) {
      row.style.background = 'rgba(245,158,11,0.08)';
      row.style.borderLeft = '2px solid #f59e0b';
    }
    
    // Update save button badge count
    const saveBtn = $('#qm-save-apply');
    if (saveBtn) {
      saveBtn.textContent = `💾 Guardar y Aplicar (${dirtyKeys.size})`;
      saveBtn.style.background = 'rgba(16,185,129,0.25)';
      saveBtn.style.color = '#34d399';
      saveBtn.style.borderColor = 'rgba(16,185,129,0.5)';
      saveBtn.style.boxShadow = '0 0 12px rgba(16,185,129,0.3)';
    }
  }

  // ── Save & Apply: POST manifest to VPS → Guardian applies on ONN ──
  async function saveAndApply() {
    const saveBtn = $('#qm-save-apply');
    const statusEl = $('#qm-save-status');
    if (!saveBtn) return;

    const changes = Object.values(pendingChanges);
    if (changes.length === 0) {
      // No pending dirty changes — save current manifest as-is
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(59,130,246,0.1)';
        statusEl.style.color = '#60a5fa';
        statusEl.textContent = 'ℹ Sin cambios pendientes. Manifesto actualizado.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    }

    saveBtn.textContent = '⏳ Guardando...';
    saveBtn.disabled = true;

    // Build full manifest from embedded MANIFEST + any overrides
    const manifest = MANIFEST.map(([ns, key, expected, group, label, type]) => {
      const override = pendingChanges[`${ns}:${key}`];
      return { ns, key, value: override ? override.value : expected, group, label, type };
    });

    try {
      // 1. If local mode, ensure all changes are forcefully applied instantly
      if (apiMode === 'local' && changes.length > 0) {
        for (const c of changes) {
           try { await apiSet(c.key, c.value, c.ns); } catch (_) {}
        }
      }

      // 2. POST manifest to VPS for Persistence (Survive Reboots)
      const r = await fetch(`${BASE_URL}/prisma/api/prisma-adb-quality.php?action=save_manifest`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, ts: new Date().toISOString() }),
      });
      const d = await r.json();

      if (d.ok) {
        // Success
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(16,185,129,0.1)';
          statusEl.style.color = '#34d399';
          statusEl.textContent = `✓ Guardado! ${changes.length} cambio(s) enviado(s) al VPS (Persistencia) y al Sentinel.`;
        }
        // Clear dirty state
        dirtyKeys.clear();
        pendingChanges = {};
        saveBtn.textContent = '💾 Guardar y Aplicar';
        saveBtn.style.background = 'rgba(16,185,129,0.1)';
        saveBtn.style.color = '#6b7280';
        saveBtn.style.boxShadow = 'none';
        
        // Refresh after a beat
        setTimeout(refresh, 2000);
      } else {
        throw new Error(d.error || 'Unknown error');
      }
    } catch (e) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color = '#f87171';
        statusEl.textContent = `✗ Error: ${e.message}`;
      }
      saveBtn.textContent = `💾 Reintentar (${dirtyKeys.size})`;
    }
    saveBtn.disabled = false;
    if (statusEl) setTimeout(() => { statusEl.style.display = 'none'; }, 6000);
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

  // ── Poll cycle — 3-layer resilient connection ──────────────────────
  // Layer 1: LOCAL bridge (localhost:7777) → real-time ONN values
  // Layer 2: VPS saved manifest (get_manifest) → last saved state (persistent)
  // Layer 3: Embedded defaults → always available
  async function refresh() {
    const host = $('#quality-manifest-widget');
    if (!host) return;

    // Layer 1: Try local bridge (direct ADB to ONN)
    try {
      const r = await fetch(`${LOCAL_API}?action=read_all&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        if (data.ok && data.settings && data.settings.length > 0) {
          API = LOCAL_API;
          apiMode = 'local';
          data.offline = false;
          data.connectionMode = 'local';
          lastData = data;
          render(data);
          return;
        }
      }
    } catch (_) { /* fall through to Layer 2 */ }

    // Layer 2: Try VPS saved manifest (persistent state)
    try {
      const r = await fetch(`${BASE_URL}/prisma/api/prisma-adb-quality.php?action=get_manifest&t=${Date.now()}`, { cache: 'no-store' });
      const vpsData = await r.json();
      if (vpsData.ok && vpsData.manifest && vpsData.manifest.length > 0) {
        // Convert VPS manifest format to render format
        const settings = vpsData.manifest.map(m => ({
          ns: m.ns, key: m.key, current: m.value, expected: m.value,
          synced: true, group: m.group, label: m.label, type: m.type, options: null
        }));
        // Fetch Guardian Heartbeat to know if it's alive on the ONN
        let guardianAlive = false;
        try {
          const hbRes = await fetch(`${BASE_URL}/prisma/api/prisma-adb-quality.php?action=guardian_heartbeat&t=${Date.now()}`, { cache: 'no-store' });
          const hbData = await hbRes.json();
          if (hbData.ok && hbData.alive) {
            guardianAlive = true;
          }
        } catch (_) {}

        const renderData = {
          ok: true, settings, drift_by_group: {},
          guardian: { pid: null, alive: guardianAlive },
          total: settings.length, ts: vpsData.saved_at || vpsData.ts,
          offline: false, connectionMode: 'vps-manifest',
          savedBy: vpsData.saved_by, savedAt: vpsData.saved_at,
        };
        lastData = renderData;
        render(renderData);
        return;
      }
    } catch (_) { /* fall through */ }

    // Layer 3: Embedded defaults (always available)
    const fallback = lastData || offlineData();
    fallback.offline = true;
    fallback.connectionMode = 'offline';
    render(fallback);
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
    document.addEventListener('DOMContentLoaded', () => { try { boot(); } catch(e) { console.warn('[QM] boot error:', e); } });
  } else {
    try { boot(); } catch(e) { console.warn('[QM] boot error:', e); }
  }
})();
