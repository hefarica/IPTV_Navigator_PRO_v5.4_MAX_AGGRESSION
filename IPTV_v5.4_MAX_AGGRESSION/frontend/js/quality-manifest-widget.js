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

  // Production decoupling: set to false to prevent local DOS command prompt popups
  const APE_USE_LOCAL_BRIDGE_DEBUG = false;

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
    vpn:        { icon: '🔒', name: 'VPN / Xray',          color: '#8b5cf6', desc: 'Always-on VPN · Lockdown (acceso)' },
    net:        { icon: '🌐', name: 'Red / Sistema',       color: '#0ea5e9', desc: 'TCP rwnd · DNS · Keep-Alive' },
    afr:        { icon: '🎞️', name: 'AFR Anti-Judder',     color: '#22c55e', desc: 'Match frame rate · clear pinned mode' },
    qoe:        { icon: '📊', name: 'QoE Telemetry',       color: '#f97316', desc: 'Judder · Rebuffer → heartbeat' },
    daemon:     { icon: '🛡️', name: 'Daemon Behavior',     color: '#ef4444', desc: 'Kill BW thieves · RAM · TCP tuning' },
  };

  const KNOWN_OPTIONS = {
    'ai_pq_mode': {'0':'Off','1':'Low','2':'Mid','3':'High'},
    'ai_sr_mode': {'0':'Off','1':'Low','2':'Mid','3':'High'},
    'ai_pic_mode': {'0':'Off','1':'Low','2':'Mid','3':'High'},
    'ai_sr_level': {'0':'Off','1':'Low','2':'Mid','3':'High'},
    'user_preferred_refresh_rate': {'23.976':'23.976','24.0':'24','25.0':'25','29.97':'29.97','30.0':'30','50.0':'50','59.94':'59.94','60.0':'60'},
    'display_color_mode': {'0':'Native','1':'Boosted','2':'Saturated','3':'HDR'},
    'match_content_frame_rate_pref': {'0':'Never','1':'Non-Seamless','2':'Seamless'},
    'hdr_conversion_mode': {'0':'Passthrough','1':'System','2':'SDR','3':'Force'},
    'hdr_output_type': {'0':'None','1':'HDR10','2':'HLG','3':'DolbyVision','4':'Auto-Best'},
    'hdr_force_conversion_type': {'-1':'Disabled','1':'HDR10','2':'HLG','3':'DolbyVision'},
    'hdmi_color_space': {'0':'RGB','1':'YCbCr 4:4:4','2':'YCbCr 4:2:2','3':'YCbCr 4:2:0'},
    'color_depth': {'8':'8-bit','10':'10-bit','12':'12-bit'},
    'encoded_surround_output': {'0':'Never','1':'Auto','2':'Always'},
    'screen_off_timeout': {'60000':'1min','300000':'5min','1800000':'30min','2147483647':'Never'},
    
    // Ranges for numeric settings
    'hdr_brightness_boost': {min:0,max:100},
    'sdr_brightness_in_hdr': {min:0,max:100},
    'peak_luminance': {min:100,max:10000},
    'video_brightness': {min:0,max:100},
    'screen_brightness': {min:0,max:255},
    // [2026-05-21] wired numeric ranges (real/standard; toggles validate 0/1 inherently)
    'tcp_default_init_rwnd': {min:1,max:1000},
    'qoe_interval_s': {min:10,max:300}
  };

  let lastData = null;
  let expandedGroups = new Set(['ai', 'hdr', 'color']);
  let pendingChanges = {};
  let dirtyKeys = new Set(); // tracks unsaved changes from panel inputs
  let applyingKeys = new Set(); // tracks keys currently being sent to local ADB

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
    ['global','peak_luminance','10000','hdr','Peak Luminance','number'],
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
    // VPN / Xray — [sync PHP 2026-05-22]
    ['secure','always_on_vpn_app',        'com.v2ray.ang','vpn', 'VPN App (Xray)',   'readonly'],
    ['secure','always_on_vpn_lockdown',   '1',            'vpn', 'VPN Lockdown',      'toggle'],
    // Red / Sistema
    ['global','tcp_default_init_rwnd',    '60',           'net', 'TCP Init RWND',     'number'],
    ['global','private_dns_specifier',    'dns.google',   'net', 'Private DNS',       'text'],
    ['global','stay_on_while_plugged_in', '3',            'net', 'Stay On (plug)',    'toggle'],
    // AFR Anti-Judder
    ['daemon','afr_anti_judder',          '1',            'afr', 'AFR Anti-Judder',   'toggle'],
    // QoE Telemetry
    ['daemon','qoe_report',               '1',            'qoe', 'QoE Heartbeat',     'toggle'],
    ['daemon','qoe_interval_s',           '30',           'qoe', 'QoE Sample (s)',    'number'],
    // Daemon Behavior
    ['daemon','kill_bandwidth_thieves',   '1',            'daemon','Kill BW Thieves', 'toggle'],
    ['daemon','drop_caches',              '1',            'daemon','Drop Caches',     'toggle'],
    ['daemon','tcp_lowlatency_tuning',    '1',            'daemon','TCP Low-Latency', 'toggle'],
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
    const isApplying = applyingKeys.has(pendingKey);
    
    // Safely unpack displayValue if it's an object {ns, key, value} in pendingChanges
    let displayValue;
    if (isPending) {
      const p = pendingChanges[pendingKey];
      displayValue = (p && typeof p === 'object' && 'value' in p) ? p.value : p;
    } else {
      displayValue = (s.current ?? s.expected);
    }

    switch (s.type) {
      case 'toggle': {
        const checked = String(displayValue) === '1';
        return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" id="${id}" data-ns="${s.ns}" data-key="${s.key}" data-type="toggle"
            ${checked ? 'checked' : ''} ${isApplying ? 'disabled' : ''}
            style="width:14px;height:14px;accent-color:#a855f7;cursor:pointer">
        </label>`;
      }
      case 'select': {
        const options = s.options || KNOWN_OPTIONS[s.key];
        if (!options) return `<span style="color:#94a3b8;font-size:0.7rem">${displayValue}</span>`;
        let opts = '';
        for (const [val, label] of Object.entries(options)) {
          opts += `<option value="${val}" ${String(displayValue) === String(val) ? 'selected' : ''}>${label}</option>`;
        }
        return `<select id="${id}" data-ns="${s.ns}" data-key="${s.key}" data-type="select"
          ${isApplying ? 'disabled' : ''}
          style="padding:2px 6px;border-radius:4px;background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.3);
          font-size:0.68rem;cursor:pointer;max-width:120px">${opts}</select>`;
      }
      case 'number': {
        const options = s.options || KNOWN_OPTIONS[s.key];
        const min = options?.min ?? 0;
        const max = options?.max ?? 99999;
        return `<input type="number" id="${id}" data-ns="${s.ns}" data-key="${s.key}" data-type="number"
          value="${displayValue}" min="${min}" max="${max}" ${isApplying ? 'disabled' : ''}
          style="width:72px;padding:2px 6px;border-radius:4px;background:#0f172a;color:#e2e8f0;
          border:1px solid rgba(148,163,184,0.3);font-size:0.68rem;font-family:monospace">`;
      }
      case 'text': {
        return `<input type="text" id="${id}" data-ns="${s.ns}" data-key="${s.key}" data-type="text"
          value="${(displayValue ?? '').toString().replace(/"/g, '&quot;')}" ${isApplying ? 'disabled' : ''}
          style="width:120px;padding:2px 6px;border-radius:4px;background:#0f172a;color:#e2e8f0;
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
    const isVpsRealtime = connMode === 'vps-realtime';
    const isVpsManifest = connMode === 'vps-manifest';
    const isLocal = connMode === 'local';
    const isOffline = data.offline;

    const queued = !!data.queued;
    const workerPending = !!data.worker_pending;
    const daemonAwake = !!guardian.alive;

    // Status: Combine connection mode + Guardian heartbeat + Pending states
    let statusColor = '#10b981';
    let statusLabel = '';
    
    if (isOffline) {
      statusColor = '#f87171';
      statusLabel = '📡 Sin conexión total';
    } else if (queued || workerPending) {
      statusColor = '#f59e0b';
      statusLabel = '⏳ Aplicando cambios (En Cola)';
    } else if (isVpsManifest) {
      statusColor = daemonAwake ? '#60a5fa' : '#f59e0b';
      statusLabel = daemonAwake ? '☁ VPS Guardado · ONN En línea' : '⚠ VPS Guardado · ONN Offline';
    } else {
      const allGood = daemonAwake && drifted === 0;
      statusColor = allGood ? '#10b981' : (!daemonAwake ? '#f87171' : '#f59e0b');
      statusLabel = allGood ? '⚡ Perfecto · Guardian Activo' : (!daemonAwake ? '✗ Guardian Muerto' : `⚠ ${drifted} Drifted`);
    }
    const statusGlow = `0 0 8px ${statusColor}`;

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.4rem">🛡️</span>
          <div>
            <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">Quality Manifest Control
              <span style="font-size:0.6rem;padding:2px 6px;background:rgba(168,85,247,0.3);border-radius:999px;color:#c4b5fd;margin-left:4px">v1.1</span>
            </div>
            <div style="font-size:0.62rem;color:#94a3b8;display:flex;align-items:center;gap:6px">
              ONN 4K · ${total} Settings · Modo:
              ${APE_USE_LOCAL_BRIDGE_DEBUG ? `
              <select id="qm-mode-selector" style="background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.3);font-size:0.62rem;padding:1px 4px;border-radius:3px;cursor:pointer">
                <option value="vps" ${apiMode === 'vps' ? 'selected' : ''}>VPS (Server-side)</option>
                <option value="local" ${apiMode === 'local' ? 'selected' : ''}>Local Bridge (ADB)</option>
              </select>
              ` : `<span style="color:#a855f7;font-weight:600">VPS (Server-side)</span>`}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};box-shadow:${statusGlow};display:inline-block"></span>
          <span style="font-size:0.68rem;color:${statusColor};font-weight:600">${statusLabel}</span>
          ${isLocal ? guardianBadge(guardian) : `<span style="font-size:0.62rem;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.15);color:#60a5fa;font-weight:600">${isVpsManifest ? '☁ Manifest' : isVpsRealtime ? '⚡ Realtime' : '○ Offline'}</span>`}
          
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

      <!-- Pipeline Status Indicators Row -->
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;background:rgba(15,23,42,0.4);padding:6px 10px;border-radius:8px;border:1px solid rgba(100,116,139,0.15);align-items:center">
        <span style="font-size:0.58rem;color:#64748b;font-weight:700;margin-right:4px">PIPELINE:</span>
        ${queued ? 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);font-weight:600;animation:pulse 1.5s infinite">🟡 Queued</span>` : 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.2)">🟢 Queued</span>`
        }
        ${workerPending ? 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);font-weight:600;animation:pulse 1.5s infinite">🟡 Worker Pending</span>` : 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.2)">🟢 Worker Idle</span>`
        }
        ${(queued || workerPending) ? 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(100,116,139,0.1);color:#64748b;border:1px solid rgba(100,116,139,0.15)">⚪ Waiting</span>` : 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.2);font-weight:600">🟢 Applied</span>`
        }
        ${daemonAwake ? 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.2);font-weight:600">🟢 Daemon Awake</span>` : 
          `<span style="font-size:0.58rem;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.25);font-weight:600;animation:pulse 1.5s infinite">🔴 Daemon Asleep</span>`
        }
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
          ${items.map(s => {
            const pendingKey = `${s.ns}:${s.key}`;
            const isDirty = dirtyKeys.has(pendingKey);
            const rowBg = isDirty ? 'rgba(245,158,11,0.08)' : 'transparent';
            const rowBorderLeft = isDirty ? '2px solid #f59e0b' : 'none';
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 12px;
                border-bottom:1px solid rgba(100,116,139,0.08);transition:background .15s;background:${rowBg};border-left:${rowBorderLeft}"
                onmouseenter="this.style.background='rgba(168,85,247,0.04)'"
                onmouseleave="this.style.background='${rowBg}'">
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
            `;
          }).join('')}
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

    // ── Codec Cascade Panel (subir CSV → override del SSOT al grabar lista) ──
    html += codecCascadeSection();

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

  // ── Codec Cascade section (HTML) ───────────────────────────────────────
  // Lee la cascada ACTIVA del SSOT (window.APE_HEVC_CASCADE). Subir un CSV la
  // sobreescribe (override) y persiste en localStorage; el generador la usa al
  // GRABAR la lista (declara CODECS= por tier). NO fuerza el códec físico del
  // proveedor — solo la DECLARACIÓN/orden de fallback.
  function codecCascadeSection() {
    const ssot = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;
    const isOpen = expandedGroups.has('codec');
    if (!ssot || typeof ssot.getActiveCascade !== 'function') {
      return `
      <div style="margin-top:10px;border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px 12px;background:rgba(15,23,42,0.5)">
        <div style="font-size:0.72rem;color:#fbbf24;font-weight:600">🎬 Codec Cascade</div>
        <div style="font-size:0.58rem;color:#94a3b8;margin-top:4px">SSOT no cargada (ape-hevc-cascade.js). Recarga la página.</div>
      </div>`;
    }
    const cascade = ssot.getActiveCascade() || [];
    const overridden = ssot.isOverridden && ssot.isOverridden();
    const rows = cascade.map((t) => `
      <tr style="border-bottom:1px solid rgba(100,116,139,0.08)">
        <td style="padding:3px 6px;color:#64748b;font-family:monospace;text-align:center">${t.tier}</td>
        <td style="padding:3px 6px;color:#34d399;font-family:monospace;white-space:nowrap">${t.codec}</td>
        <td style="padding:3px 6px;color:#86efac;font-family:monospace;white-space:nowrap">${t.codec_hev1 || (typeof t.codec === 'string' && t.codec.startsWith('hvc1') ? t.codec.replace(/^hvc1/, 'hev1') : t.codec)}</td>
        <td style="padding:3px 6px;color:#cbd5e1">${t.profile || ''}</td>
        <td style="padding:3px 6px;color:#94a3b8;text-align:center">${t.level || ''}</td>
        <td style="padding:3px 6px;color:#94a3b8">${t.capability || t.role || ''}</td>
      </tr>`).join('');

    return `
    <div style="margin-top:10px;border:1px solid ${overridden ? 'rgba(245,158,11,0.45)' : 'rgba(52,211,153,0.3)'};border-radius:10px;overflow:hidden;background:rgba(15,23,42,0.5)">
      <div class="qm-group-header" data-group="codec" style="display:flex;justify-content:space-between;
        align-items:center;padding:10px 12px;cursor:pointer;background:rgba(15,23,42,0.8);user-select:none">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1rem">🎬</span>
          <div>
            <div style="font-size:0.75rem;font-weight:600;color:#e2e8f0">Codec Cascade
              <span style="font-size:0.55rem;color:#64748b;font-weight:400;margin-left:4px">${cascade.length} tiers · RFC 6381</span>
              ${overridden ? `<span style="font-size:0.52rem;padding:1px 6px;border-radius:3px;background:rgba(245,158,11,0.2);color:#fbbf24;font-weight:600;margin-left:4px">CSV override</span>` : `<span style="font-size:0.52rem;padding:1px 6px;border-radius:3px;background:rgba(52,211,153,0.15);color:#34d399;margin-left:4px">default SSOT</span>`}
            </div>
            <div style="font-size:0.55rem;color:#64748b">Fallback HEVC Main10 → AV1 → HEVC 8bit → H.264 · se aplica al GRABAR la lista</div>
          </div>
        </div>
        <span style="font-size:0.7rem;color:#64748b">${isOpen ? '▾' : '▸'}</span>
      </div>
      ${isOpen ? `<div style="padding:10px 12px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
          <label style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);cursor:pointer">
            ⬆ Subir CSV
            <input type="file" id="qm-codec-upload" accept=".csv,text/csv" style="display:none">
          </label>
          <button id="qm-codec-reset" style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);cursor:pointer">
            ↩ Default SSOT</button>
          <button id="qm-codec-download" style="font-size:0.6rem;padding:3px 10px;border-radius:4px;
            background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);cursor:pointer">
            ⬇ Descargar actual</button>
        </div>
        <div style="font-size:0.55rem;color:#64748b;margin-bottom:8px;line-height:1.4">
          ⚠ Honestidad: la cascada <strong>declara</strong> <code>CODECS=</code> por tier en cada STREAM-INF al grabar.
          El códec <strong>físico</strong> lo envía el proveedor — no se puede forzar HEVC si el stream es H.264.
          Esto fija la <strong>preferencia y el orden de degradación</strong> que el player intenta.
        </div>
        <div style="max-height:240px;overflow-y:auto;border:1px solid rgba(100,116,139,0.15);border-radius:6px">
          <table style="width:100%;border-collapse:collapse;font-size:0.6rem">
            <thead><tr style="background:rgba(15,23,42,0.9);position:sticky;top:0">
              <th style="padding:4px 6px;color:#94a3b8;text-align:center">T</th>
              <th style="padding:4px 6px;color:#94a3b8;text-align:left">hvc1 (STREAM-INF)</th>
              <th style="padding:4px 6px;color:#94a3b8;text-align:left">hev1 (KODIPROP)</th>
              <th style="padding:4px 6px;color:#94a3b8;text-align:left">Profile</th>
              <th style="padding:4px 6px;color:#94a3b8;text-align:center">Lvl</th>
              <th style="padding:4px 6px;color:#94a3b8;text-align:left">Capacidad / Rol</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div id="qm-codec-status" style="font-size:0.6rem;text-align:center;padding:4px;margin-top:6px;display:none;border-radius:4px"></div>
      </div>` : ''}
    </div>`;
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

    // Connection Mode selector
    const modeSelector = $('#qm-mode-selector');
    if (modeSelector) {
      modeSelector.addEventListener('change', (e) => {
        const newMode = e.target.value;
        localStorage.setItem('qm-api-mode', newMode);
        apiMode = newMode;
        API = (newMode === 'local') ? LOCAL_API : VPS_API;
        refresh();
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
      el.addEventListener('change', () => {
        markDirty(el.dataset.ns, el.dataset.key, el.value, el);
        if (apiMode === 'local') applySetting(el.dataset.ns, el.dataset.key, el.value, el);
      });
    });

    document.querySelectorAll('[data-type="text"]').forEach(el => {
      el.addEventListener('change', () => {
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
          const r = await fetch(`${API}?action=restart_guardian`, { method: 'POST', cache: 'no-store' });
          if (r.ok) {
             const d = await r.json();
             if (d.ok) restartBtn.textContent = '✓ Ok';
             else throw new Error(d.error || 'Unknown error');
          } else {
             throw new Error('Local API failed');
          }
        } catch (e) {
          restartBtn.textContent = e.message.includes('ADB') ? '✗ No ADB' : '✗ Error';
          console.error('[Sentinel Control Error]:', e.message);
        }
        setTimeout(() => { restartBtn.textContent = '🔄 Restart'; restartBtn.disabled = false; refresh(); }, 3000);
      });
    }

    // ⏹/▶ Toggle Sentinel
    const toggleBtn = $('#qm-toggle-guardian');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        const isAlive = (lastData || data).guardian?.alive;
        toggleBtn.textContent = '⏳...';
        toggleBtn.disabled = true;
        try {
          const action = isAlive ? 'stop_guardian' : 'restart_guardian';
          const r = await fetch(`${API}?action=${action}`, { method: 'POST', cache: 'no-store' });
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

    // ── Codec Cascade: subir CSV / reset / descargar ──
    const codecStatus = () => $('#qm-codec-status');
    const showCodecStatus = (msg, color) => {
      const el = codecStatus();
      if (!el) return;
      el.style.display = 'block';
      el.style.background = color + '22';
      el.style.color = color;
      el.innerHTML = msg;
    };
    const ssot = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;

    const codecUpload = $('#qm-codec-upload');
    if (codecUpload) {
      codecUpload.addEventListener('change', (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file || !ssot) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const rows = ssot.parseCascadeCSV(String(reader.result || ''));
            if (!rows.length) { showCodecStatus('⛔ CSV sin filas válidas (tier 1-12 + codec)', '#f87171'); return; }
            const res = ssot.setCascade(rows, true); // persiste en localStorage
            if (!res.ok) { showCodecStatus('⛔ ' + (res.error || 'error'), '#f87171'); return; }
            showCodecStatus(`✓ Cascada actualizada: ${res.overridden}/${res.tiers} tiers override. Se aplicará al GRABAR la lista.`, '#34d399');
            setTimeout(() => render(lastData || data), 600);
          } catch (e) {
            showCodecStatus('⛔ Error parseando CSV: ' + e.message, '#f87171');
          }
        };
        reader.readAsText(file);
      });
    }

    const codecReset = $('#qm-codec-reset');
    if (codecReset) {
      codecReset.addEventListener('click', () => {
        if (!ssot) return;
        if (!confirm('↩ Restaurar la cascada de codecs al SSOT por defecto (12-tier)?')) return;
        ssot.resetCascade();
        showCodecStatus('✓ Cascada restaurada al default SSOT.', '#60a5fa');
        setTimeout(() => render(lastData || data), 600);
      });
    }

    const codecDownload = $('#qm-codec-download');
    if (codecDownload) {
      codecDownload.addEventListener('click', () => {
        if (!ssot) return;
        const cascade = ssot.getActiveCascade() || [];
        let csv = 'Tier;Codec String hvc1;Codec String hev1;Profile;Level;Capacidad;Rol\n';
        cascade.forEach((t) => {
          const hev1 = t.codec_hev1 || (typeof t.codec === 'string' && t.codec.startsWith('hvc1') ? t.codec.replace(/^hvc1/, 'hev1') : t.codec);
          csv += `${t.tier};${t.codec};${hev1};${t.profile || ''};${t.level || ''};${t.capability || t.role || ''};${t.role || ''}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'codec-cascade-actual.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }
  }

  // ── [2026-05-21] Input validation: reject non-valid / non-configurable values ──
  function validateValue(key, value) {
    const opt = KNOWN_OPTIONS[key];
    if (!opt) return { ok: true };               // no constraint declared → accept
    if (opt.min !== undefined && opt.max !== undefined) {
      const n = Number(value);
      if (value === '' || isNaN(n)) return { ok: false, reason: 'no numérico' };
      if (n < opt.min || n > opt.max) return { ok: false, reason: `fuera de rango (${opt.min}-${opt.max})` };
      return { ok: true };
    }
    // select/enum: the option keys are the only valid values
    if (typeof opt === 'object') {
      if (Object.prototype.hasOwnProperty.call(opt, String(value))) return { ok: true };
      return { ok: false, reason: 'opción no válida' };
    }
    return { ok: true };
  }

  // ── Mark a setting as dirty (changed but not saved) ────────────────
  function markDirty(ns, key, value, el) {
    const id = `${ns}:${key}`;
    // Validación de entrada — un valor no válido NO se acepta (no entra a pendingChanges)
    const v = validateValue(key, value);
    if (!v.ok) {
      if (el) {
        el.style.borderColor = '#ef4444';
        el.style.boxShadow = '0 0 6px rgba(239,68,68,0.55)';
        el.title = 'Valor no válido: ' + v.reason;
      }
      const sb = $('#qm-save-status');
      if (sb) { sb.style.display = 'block'; sb.style.background = 'rgba(239,68,68,0.12)'; sb.style.color = '#f87171'; sb.textContent = `⛔ ${key}: VALOR NO VÁLIDO (${v.reason})`; }
      return;
    }
    if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; el.title = ''; }
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

    // [FIX 2026-05-21] Build manifest from the LIVE current state (lastData) + overrides.
    // NEVER from the embedded MANIFEST: those are stale defaults, and using them made
    // every untouched setting revert to the hardcoded value on save ("vuelve al anterior").
    const liveSettings = (lastData && Array.isArray(lastData.settings) && lastData.settings.length)
      ? lastData.settings
      : MANIFEST.map(([ns, key, expected, group, label, type]) => ({ ns, key, current: expected, expected, group, label, type }));
    const manifest = liveSettings.map((s) => {
      const baseVal = (s.current !== null && s.current !== undefined && s.current !== '') ? s.current : s.expected;
      const override = pendingChanges[`${s.ns}:${s.key}`];
      return { ns: s.ns, key: s.key, value: override ? override.value : baseVal, group: s.group, label: s.label, type: s.type };
    });

    // Snapshot de la cascada de codecs ACTIVA (default o override CSV) para
    // respaldarla en el VPS junto al manifest. El generador la usa via localStorage
    // al GRABAR; este backup permite que sobreviva reboots / otro navegador.
    const _ssotCascade = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;
    const codec_cascade = (_ssotCascade && typeof _ssotCascade.getActiveCascade === 'function')
      ? _ssotCascade.getActiveCascade()
      : null;
    const codec_cascade_per_profile = (_ssotCascade && typeof _ssotCascade.generateProfileCascadeArrays === 'function')
      ? _ssotCascade.generateProfileCascadeArrays()
      : null;

    try {
      let savedLocally = false;
      let localHash = '';

      // 1. If local mode, ensure local manifest on device is updated and applied instantly (PRIORITIZED)
      if (apiMode === 'local') {
        try {
          const rLocal = await fetch(`${LOCAL_API}?action=save_manifest`, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manifest }),
          });
          if (rLocal.ok) {
            const dLocal = await rLocal.json();
            if (dLocal.ok) {
              savedLocally = true;
              localHash = dLocal.manifest_hash || dLocal.hash;
              
              if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = 'rgba(16,185,129,0.15)';
                statusEl.style.color = '#34d399';
                statusEl.innerHTML = `✓ <strong>¡Aplicado al TV!</strong> ${changes.length} cambio(s) transferido(s) via ADB local y Sentinel despertado.`;
              }
              // Clear dirty state immediately
              dirtyKeys.clear();
              pendingChanges = {};
              saveBtn.textContent = '💾 Guardar y Aplicar';
              saveBtn.style.background = 'rgba(16,185,129,0.1)';
              saveBtn.style.color = '#6b7280';
              saveBtn.style.boxShadow = 'none';
              
              // Background sync to VPS
              fetch(`${BASE_URL}/prisma/api/prisma-adb-quality.php?action=save_manifest`, {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manifest, codec_cascade, codec_cascade_per_profile, ts: new Date().toISOString(), local_sync: true }),
              }).catch(e => console.warn('[QM] Background VPS sync failed:', e));

              setTimeout(refresh, 1500);
            } else {
              throw new Error(dLocal.error || 'Local API failed during save_manifest');
            }
          } else {
            throw new Error(`Local API status ${rLocal.status}`);
          }
        } catch (e) {
          console.warn('[QM] Failed to save manifest to local API:', e);
          // Fall through to VPS if local mode fails
        }
      }

      if (!savedLocally) {
        // 2. POST manifest to VPS for Persistence (Survive Reboots)
        const r = await fetch(`${BASE_URL}/prisma/api/prisma-adb-quality.php?action=save_manifest`, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manifest, codec_cascade, codec_cascade_per_profile, ts: new Date().toISOString() }),
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
    pendingChanges[pendingKey] = { ns, key, value };
    applyingKeys.add(pendingKey);

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
        setTimeout(() => { applyingKeys.delete(pendingKey); delete pendingChanges[pendingKey]; refresh(); }, 3000);
      } else if (res.ok) {
        if (row) {
          row.style.background = 'rgba(16,185,129,0.08)';
          row.style.borderLeft = '2px solid #10b981';
        }
        setTimeout(() => { applyingKeys.delete(pendingKey); delete pendingChanges[pendingKey]; refresh(); }, 1500);
      } else {
        if (row) {
          row.style.background = 'rgba(245,158,11,0.08)';
          row.style.borderLeft = '2px solid #f59e0b';
        }
        setTimeout(() => { applyingKeys.delete(pendingKey); delete pendingChanges[pendingKey]; refresh(); }, 2000);
      }
    } catch (e) {
      if (row) row.style.background = 'rgba(239,68,68,0.08)';
      setTimeout(() => { applyingKeys.delete(pendingKey); delete pendingChanges[pendingKey]; refresh(); }, 2000);
    }
  }

  // ── Poll cycle — 3-layer resilient connection ──────────────────────
  // Layer 1: VPS server-side API / Local API (based on mode selection)
  // Layer 2: VPS saved manifest fallback (get_manifest)
  // Layer 3: Embedded defaults → always available
  async function refresh() {
    const host = $('#quality-manifest-widget');
    if (!host) return;

    // Render offline state immediately if no live data yet — prevents "Initializing" hang
    // while Layer 1/2 fetches are pending (up to 8+5s timeouts).
    if (!lastData) {
      try { render(offlineData()); } catch (e) { console.error('[QM] offline render error:', e); }
    }

    // Load connection mode from localStorage or default to vps
    let savedMode = localStorage.getItem('qm-api-mode') || 'vps';
    if (!APE_USE_LOCAL_BRIDGE_DEBUG) {
      savedMode = 'vps';
    }
    apiMode = savedMode;
    API = (apiMode === 'local') ? LOCAL_API : VPS_API;

    // Layer 1: Mode-specific endpoint querying
    if (apiMode === 'local') {
      try {
        const r = await fetch(`${LOCAL_API}?action=read_all&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          if (data.ok && data.settings && data.settings.length > 0) {
            data.offline = false;
            data.connectionMode = 'local';
            lastData = data;
            render(data);
            return;
          }
        }
      } catch (_) { /* fall through to Layer 2 & 3 */ }
    } else {
      // VPS Mode: Query real-time device settings via VPS first
      try {
        const r = await fetch(`${VPS_API}?action=read_all&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          if (data.ok && data.settings && data.settings.length > 0) {
            data.offline = false;
            data.connectionMode = 'vps-realtime';
            lastData = data;
            render(data);
            return;
          }
        }
      } catch (_) { /* fall through to VPS Saved Manifest */ }
    }

    // Layer 2: Try VPS saved manifest (persistent state)
    try {
      const r = await fetch(`${BASE_URL}/prisma/api/prisma-adb-quality.php?action=get_manifest&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const vpsData = await r.json();
      if (vpsData.ok && vpsData.manifest && vpsData.manifest.length > 0) {
        // ── Cascade restore desde VPS ──────────────────────────────────────
        // Si el VPS tiene una cascada guardada Y el localStorage no tiene una
        // override activa → restaurar la cascada del VPS en APE_HEVC_CASCADE.
        // Esto permite que una nueva sesión de navegador recuerde la cascada
        // sin que el usuario tenga que re-subir el CSV manualmente.
        try {
          const ssot = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;
          if (ssot && !ssot.isOverridden() && Array.isArray(vpsData.codec_cascade) && vpsData.codec_cascade.length >= 5) {
            const res = ssot.setCascade(vpsData.codec_cascade, true); // persiste en localStorage
            if (res && res.ok) {
              console.info('[QM] cascade restored from VPS:', res.tiers, 'tiers');
            }
          }
        } catch (_) {}

        // Convert VPS manifest format to render format
        const settings = vpsData.manifest.map(m => ({
          ns: m.ns, key: m.key, current: m.value, expected: m.value,
          synced: true, group: m.group, label: m.label, type: m.type, options: null
        }));
        // Fetch Guardian Status from VPS to check heartbeat, queued and pending status
        let guardianAlive = false;
        let queued = false;
        let workerPending = false;
        try {
          const s = await fetch(`${VPS_API}?action=guardian_status`, { signal: AbortSignal.timeout(2000) });
          const j = await s.json();
          guardianAlive = !!j.alive;
          queued = !!j.queued;
          workerPending = !!j.worker_pending;
        } catch (_) {}

        const renderData = {
          ok: true, settings, drift_by_group: {},
          guardian: { pid: null, alive: guardianAlive },
          total: settings.length, ts: vpsData.saved_at || vpsData.ts,
          offline: false, connectionMode: 'vps-manifest',
          savedBy: vpsData.saved_by, savedAt: vpsData.saved_at,
          queued: queued, worker_pending: workerPending
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
    try { render(fallback); } catch (e) { console.error('[QM] Layer 3 render error:', e); }
  }

  // ── Boot ────────────────────────────────────────────────────────────
  async function boot() {
    const host = $('#quality-manifest-widget');
    if (!host) return;
    // Render offline manifest IMMEDIATELY — never show "Initializing" state
    try {
      render(offlineData());
    } catch (e) {
      console.error('[QM] boot render error:', e);
      host.innerHTML = `<div style="padding:14px;color:#f87171;font-size:0.72rem">⚠ Widget error: ${e.message}</div>`;
    }

    // Load connection mode from localStorage or default to vps
    let savedMode = localStorage.getItem('qm-api-mode') || 'vps';
    if (!APE_USE_LOCAL_BRIDGE_DEBUG) {
      savedMode = 'vps';
    }
    apiMode = savedMode;
    API = (apiMode === 'local') ? LOCAL_API : VPS_API;

    // Do NOT automatically query localhost:7777 to avoid opening DOS window / running local node bridge
    // unless explicitly saved as 'local' and debug is enabled
    if (APE_USE_LOCAL_BRIDGE_DEBUG && apiMode === 'local') {
      try {
        const r = await fetch(`${LOCAL_API}?action=guardian_status&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (r.ok) {
          const d = await r.json();
          if (d.ok !== undefined) {
            API = LOCAL_API;
            apiMode = 'local';
          }
        }
      } catch (_) {
        // Fallback to VPS mode if local mode fails
        apiMode = 'vps';
        API = VPS_API;
        localStorage.setItem('qm-api-mode', 'vps');
      }
    }

    refresh();
    setInterval(refresh, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { boot(); } catch(e) { console.warn('[QM] boot error:', e); } });
  } else {
    try { boot(); } catch(e) { console.warn('[QM] boot error:', e); }
  }
})();
