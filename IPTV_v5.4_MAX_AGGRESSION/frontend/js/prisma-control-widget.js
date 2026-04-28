/**
 * APE PRISMA v1.0 — Control Widget (Frontend)
 * Renders into #prisma-control-widget mount point in the Telemetry tab.
 * Polls /prisma/api/prisma-health.php every 30s.
 * Pattern mirrors netshield-sentinel-widget.js (IIFE, polling, DOM render).
 */
(function () {
  'use strict';

  const BASE_URL = 'https://iptv-ape.duckdns.org';
  const HEALTH_ENDPOINT  = `${BASE_URL}/prisma/api/prisma-health.php`;
  const CONTROL_ENDPOINT = `${BASE_URL}/prisma/api/prisma-control.php`;
  const POLL_MS = 30_000;
  const PANIC_THRESHOLD = 3; // consecutive unhealthy polls before auto-panic

  const LANES = ['cmaf', 'lcevc', 'hdr10plus', 'ai_sr', 'quantum_pixel', 'fake_4k_upscaler'];
  const LANE_LABELS = {
    cmaf:              { icon: '📦', name: 'CMAF Packaging',      desc: 'fMP4/CMAF repackaging' },
    lcevc:             { icon: '🔬', name: 'LCEVC Enhancement',   desc: 'Low Complexity Enhancement Video Codec' },
    hdr10plus:         { icon: '🌈', name: 'HDR10+ Dynamic',      desc: 'Scene-by-scene tone mapping' },
    ai_sr:             { icon: '🤖', name: 'AI Super Resolution', desc: 'Neural upscaling engine' },
    quantum_pixel:     { icon: '💎', name: 'Quantum Pixel',       desc: '8000 nits · 12-bit · 4:4:4 deep color' },
    fake_4k_upscaler:  { icon: '🎨', name: 'Fake 4K Upscaler',   desc: '120fps MEMC · HDR lift · neural depth' },
  };
  const PROFILES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  const PROFILE_LABELS = {
    P0: '4K ULTRA', P1: '8K', P2: '4K', P3: 'FHD', P4: 'HD', P5: 'SD'
  };
  const PROFILE_COLORS = {
    P0: '#f59e0b', P1: '#ef4444', P2: '#f97316', P3: '#3b82f6', P4: '#10b981', P5: '#64748b'
  };

  let unhealthyCount = 0;
  let lastState = null;
  let debounceTimer = null;

  // ── Event Log System ─────────────────────────────────────────────────
  const MAX_LOG_ENTRIES = 200;
  const LOG_DISPLAY = 50;
  const eventLog = [];
  let logSeq = 0;

  function prismaLog(level, msg, data) {
    const entry = {
      seq: ++logSeq,
      ts: new Date().toISOString(),
      level, // 'info' | 'ok' | 'warn' | 'error' | 'action'
      msg,
      data: data || null,
    };
    eventLog.push(entry);
    if (eventLog.length > MAX_LOG_ENTRIES) eventLog.shift();
  }

  function logIcon(level) {
    const map = { info: '🔹', ok: '🟢', warn: '🟡', error: '🔴', action: '⚡' };
    return map[level] || '·';
  }

  function logColor(level) {
    const map = { info: '#94a3b8', ok: '#10b981', warn: '#fbbf24', error: '#f87171', action: '#c4b5fd' };
    return map[level] || '#94a3b8';
  }

  function $(sel, root = document) { return root.querySelector(sel); }
  function getKey() { return localStorage.getItem('prisma_key_v1') || ''; }
  function setKey(k) { localStorage.setItem('prisma_key_v1', k); }

  // ── API helpers ─────────────────────────────────────────────────────
  function buildHeaders() {
    const h = {};
    const k = getKey();
    if (k) h['X-Prisma-Key'] = k;
    return h;
  }

  async function apiGet(url) {
    const r = await fetch(url, {
      cache: 'no-store',
      mode: 'cors',
      headers: buildHeaders(),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function apiPost(params) {
    const url = `${CONTROL_ENDPOINT}?${new URLSearchParams(params)}`;
    const r = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      mode: 'cors',
      headers: buildHeaders(),
    });
    return r.json();
  }

  // ── Status helpers ──────────────────────────────────────────────────
  function statusColor(s) {
    const map = {
      active: '#10b981', disabled: '#64748b', auto_disabled: '#f59e0b',
      engine_missing: '#f59e0b', degraded: '#f97316', standby: '#6366f1',
    };
    return map[s] || '#64748b';
  }

  function statusLabel(s) {
    const map = {
      active: '✓ Procesando', disabled: '— Standby', auto_disabled: '⏸ Auto-Recuperando',
      engine_missing: '⏳ Pendiente Despliegue', degraded: '⚠ Degradado',
      standby: '💤 Passthrough',
    };
    return map[s] || s;
  }

  // ── Profile chips ───────────────────────────────────────────────────
  function profileChips(lane, activeProfiles) {
    const active = new Set(activeProfiles || []);
    return PROFILES.map(p => {
      const isOn = active.has(p);
      const bg = isOn ? PROFILE_COLORS[p] : 'rgba(100,116,139,0.2)';
      const fg = isOn ? '#0b1220' : '#64748b';
      return `<button class="prisma-profile-chip" data-lane="${lane}" data-profile="${p}"
        style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:700;
        background:${bg};color:${fg};border:1px solid ${isOn ? bg : 'rgba(100,116,139,0.3)'};
        cursor:pointer;transition:all .2s;margin:2px" title="${PROFILE_LABELS[p]}">${p}</button>`;
    }).join('');
  }

  function profileShortcuts(lane) {
    return `<span style="display:flex;gap:4px;margin-top:4px">
      <button class="prisma-pf-shortcut" data-lane="${lane}" data-preset="all"
        style="font-size:0.6rem;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,0.15);
        color:#60a5fa;border:1px solid rgba(59,130,246,0.3);cursor:pointer">All</button>
      <button class="prisma-pf-shortcut" data-lane="${lane}" data-preset="uhd"
        style="font-size:0.6rem;padding:1px 6px;border-radius:3px;background:rgba(245,158,11,0.15);
        color:#fbbf24;border:1px solid rgba(245,158,11,0.3);cursor:pointer">UHD</button>
      <button class="prisma-pf-shortcut" data-lane="${lane}" data-preset="hd"
        style="font-size:0.6rem;padding:1px 6px;border-radius:3px;background:rgba(16,185,129,0.15);
        color:#34d399;border:1px solid rgba(16,185,129,0.3);cursor:pointer">HD+</button>
      <button class="prisma-pf-shortcut" data-lane="${lane}" data-preset="none"
        style="font-size:0.6rem;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,0.15);
        color:#f87171;border:1px solid rgba(239,68,68,0.3);cursor:pointer">None</button>
    </span>`;
  }

  // ── Render ──────────────────────────────────────────────────────────
  function render(health) {
    const host = $('#prisma-control-widget');
    if (!host) return;

    const masterOn = health.master_enabled;
    const healthy  = health.healthy;
    const panicTs  = health.last_panic_off_ts;

    // Detect key from fingerprint
    if (health._key_fingerprint && !getKey()) {
      // No key stored yet, prompt once
    }

    // Contextual status: Standby (blue) when OFF, green when ON+healthy, red only when ON+failing
    const mode = !masterOn ? 'standby' : (healthy ? 'active' : 'issue');
    const modeMap = {
      standby: { color: '#6366f1', glow: '0 0 8px #6366f1', label: '💤 Standby · Passthrough', labelShort: 'STANDBY' },
      active:  { color: '#10b981', glow: '0 0 8px #10b981', label: '⚡ Activo · Procesando',    labelShort: 'ACTIVO' },
      issue:   { color: '#f59e0b', glow: '0 0 8px #f59e0b', label: '🔧 Auto-Gestionando',      labelShort: 'RECUPERANDO' },
    };
    const mc = modeMap[mode];

    // ── Header ──
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.4rem">🔮</span>
          <div>
            <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">APE PRISMA <span style="font-size:0.65rem;padding:2px 6px;background:rgba(168,85,247,0.3);border-radius:999px;color:#c4b5fd;margin-left:4px">v1.0</span></div>
            <div style="font-size:0.68rem;color:#94a3b8">Quality Uplift Post-Processor · ${health.version || '1.0.0'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${mc.color};box-shadow:${mc.glow};display:inline-block"></span>
          <span style="font-size:0.72rem;color:${mc.color};font-weight:600">${mc.label}</span>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:8px" title="Master ON/OFF">
            <input type="checkbox" id="prisma-master-toggle" ${masterOn ? 'checked' : ''}
              style="width:16px;height:16px;accent-color:#a855f7">
            <span style="font-size:0.72rem;color:${masterOn ? '#c4b5fd' : '#64748b'};font-weight:600">${mc.labelShort}</span>
          </label>
          ${masterOn ? `<button id="prisma-panic-btn"
            style="background:rgba(239,68,68,0.8);color:#fff;border:none;
            padding:4px 10px;border-radius:6px;font-size:0.7rem;font-weight:700;cursor:pointer;
            transition:all .2s" title="Emergency: disable ALL lanes immediately">⛔ PANIC</button>` : ''}
        </div>
      </div>`;

    // ── Lanes grid ──
    html += `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">`;
    for (const lane of LANES) {
      const info   = LANE_LABELS[lane];
      const ls     = (health.lanes_status || {})[lane] || {};
      const isOn   = ls.global === 'on';
      const status = ls.status || 'disabled';
      const errRate = ((ls.errors_60s || 0) * 100).toFixed(1);
      const autoDisSecs = ls.auto_disabled_until || 0;
      const engineReady = ls.engine?.ready ?? false;
      const borderColor = isOn ? statusColor(status) : 'rgba(100,116,139,0.2)';

      html += `
        <div style="background:rgba(15,23,42,0.6);border:1px solid ${borderColor};border-left:3px solid ${borderColor};
          border-radius:8px;padding:10px;transition:all .3s">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:1rem">${info.icon}</span>
              <div>
                <div style="font-size:0.78rem;font-weight:600;color:#e2e8f0">${info.name}</div>
                <div style="font-size:0.62rem;color:#64748b">${info.desc}</div>
              </div>
            </div>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px">
              <input type="checkbox" class="prisma-lane-toggle" data-lane="${lane}" ${isOn ? 'checked' : ''}
                ${!masterOn ? 'disabled' : ''}
                style="width:14px;height:14px;accent-color:${statusColor('active')}">
            </label>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:0.65rem;padding:2px 8px;border-radius:4px;background:${statusColor(status)}20;
              color:${statusColor(status)};font-weight:600">${statusLabel(status)}</span>
            <span style="font-size:0.62rem;color:${parseFloat(errRate) > 5 ? '#f87171' : '#64748b'}">err: ${errRate}%</span>
          </div>
          ${!engineReady && isOn ? `<div style="font-size:0.6rem;color:#fbbf24;margin-bottom:4px">⏳ Engines pendientes: ${(ls.engine?.missing || []).join(', ')}</div>` : ''}
          ${autoDisSecs > 0 ? `<div style="font-size:0.6rem;color:#fbbf24;margin-bottom:4px">⏸ Auto-paused ${autoDisSecs}s remaining</div>` : ''}
          <div style="margin-top:4px">
            <div style="font-size:0.62rem;color:#94a3b8;margin-bottom:2px">Profiles:</div>
            <div>${profileChips(lane, ls.profiles)}</div>
            ${profileShortcuts(lane)}
          </div>
        </div>`;
    }
    html += `</div>`;

    // ── Fake 4K Detector & Stream Intelligence (separate section) ──
    const metrics = health.lane_metrics || {};
    const telem = health.player_telemetry || {};
    const strm = telem.stream || {};
    const aiSr = metrics.ai_sr || {};
    const hdr = metrics.hdr10plus || {};
    const cmafM = metrics.cmaf || {};
    const lcevcM = metrics.lcevc || {};
    const hasStream = strm.codec && strm.codec !== 'unknown';

    if (hasStream || aiSr.active || hdr.active) {
      const isFake = aiSr.fake_4k_detected;
      const fakeBadge = isFake
        ? `<span style="background:rgba(239,68,68,0.9);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:700;animation:pulse 1.5s infinite">⚠ FAKE 4K DETECTADO</span>`
        : (hasStream ? `<span style="background:rgba(16,185,129,0.8);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:700">✓ NATIVE</span>` : '');

      html += `
      <div style="background:linear-gradient(135deg,rgba(15,23,42,0.8),rgba(30,41,59,0.6));border:1px solid ${isFake ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.3)'};
        border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:1.1rem">🔎</span>
            <span style="font-size:0.78rem;font-weight:700;color:#e2e8f0">Stream Intelligence & Fake 4K</span>
          </div>
          ${fakeBadge}
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
          <div style="background:rgba(2,6,23,0.5);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Codec</div>
            <div style="font-size:0.85rem;font-weight:700;color:#a78bfa">${(strm.codec || '?').toUpperCase()}</div>
          </div>
          <div style="background:rgba(2,6,23,0.5);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Resolution</div>
            <div style="font-size:0.85rem;font-weight:700;color:${isFake ? '#f87171' : '#10b981'}">${strm.resolution || '?'}${isFake ? ' (fake)' : ''}</div>
          </div>
          <div style="background:rgba(2,6,23,0.5);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Bitrate</div>
            <div style="font-size:0.85rem;font-weight:700;color:#fbbf24">${strm.bitrate_kbps ? (strm.bitrate_kbps/1000).toFixed(1) : '?'} Mbps</div>
          </div>
          <div style="background:rgba(2,6,23,0.5);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Decoder</div>
            <div style="font-size:0.85rem;font-weight:700;color:${strm.decoder === 'HW' ? '#10b981' : '#f59e0b'}">${strm.decoder || '?'}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
          ${hdr.active ? `
          <div style="background:rgba(2,6,23,0.5);border:1px solid rgba(168,85,247,0.2);border-radius:6px;padding:8px">
            <div style="font-size:0.62rem;font-weight:600;color:#c4b5fd;margin-bottom:4px">🌈 HDR10+ Analysis</div>
            <div style="font-size:0.58rem;color:#94a3b8;line-height:1.5">
              Color: <b style="color:#e2e8f0">${hdr.color_space}</b><br>
              Transfer: <b style="color:#e2e8f0">${hdr.transfer_function}</b><br>
              Peak: <b style="color:#fbbf24">${hdr.peak_luminance_nits} nits</b><br>
              Gamut: <b style="color:#e2e8f0">${hdr.gamut_coverage_dci_p3_pct}% DCI-P3</b><br>
              Dynamic: <b style="color:${hdr.dynamic_metadata ? '#10b981' : '#64748b'}">${hdr.dynamic_metadata ? 'Scene-by-scene' : 'Static'}</b>
            </div>
          </div>` : ''}

          ${aiSr.active ? `
          <div style="background:rgba(2,6,23,0.5);border:1px solid ${isFake ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)'};border-radius:6px;padding:8px">
            <div style="font-size:0.62rem;font-weight:600;color:${isFake ? '#f87171' : '#34d399'};margin-bottom:4px">🤖 AI Super Resolution${isFake ? ' — COMPENSANDO' : ''}</div>
            <div style="font-size:0.58rem;color:#94a3b8;line-height:1.5">
              ${isFake ? `True Source: <b style="color:#f87171">${aiSr.true_source_resolution}</b><br>` : ''}
              Upscale: <b style="color:#e2e8f0">${aiSr.input_resolution} → ${aiSr.output_resolution} (${aiSr.upscale_factor})</b><br>
              VMAF: <b style="color:#fbbf24">${aiSr.vmaf_estimate}</b><br>
              Network: <b style="color:#e2e8f0">${aiSr.neural_network}</b><br>
              Artifacts: <b style="color:${isFake ? '#f87171' : '#10b981'}">${aiSr.artifact_suppression}</b><br>
              Latency: <b style="color:#e2e8f0">${aiSr.processing_latency_ms}ms</b>
            </div>
          </div>` : ''}
        </div>

        ${cmafM.active || lcevcM.active ? `
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
          ${cmafM.active ? `<span style="font-size:0.55rem;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.2)">
            📦 CMAF −${cmafM.overhead_reduction_pct}% overhead · saved ${cmafM.bandwidth_saved_kbps}Kbps · drop:${cmafM.dropped_frames}</span>` : ''}
          ${lcevcM.active ? `<span style="font-size:0.55rem;padding:2px 8px;border-radius:4px;background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.2)">
            🔬 LCEVC +${lcevcM.quality_boost_dB}dB · layer:${lcevcM.enhancement_layer_kbps}Kbps · eff:${lcevcM.bitrate_efficiency_pct}%</span>` : ''}
        </div>` : ''}
      </div>`;
    }

    // ── Panel: Quantum Pixel Engine ──
    const qp = health.quantum_pixel || {};
    if (qp.active) {
      html += `
      <div style="background:linear-gradient(135deg,rgba(88,28,135,0.25),rgba(15,23,42,0.8));border:1px solid rgba(168,85,247,0.4);
        border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:1.1rem">💎</span>
            <span style="font-size:0.78rem;font-weight:700;color:#e2e8f0">Quantum Pixel Engine</span>
          </div>
          <span style="background:linear-gradient(90deg,#a855f7,#ec4899);color:#fff;padding:2px 10px;border-radius:4px;font-size:0.62rem;font-weight:700">
            ${qp.bit_depth}-BIT ${qp.chroma_subsampling}</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:8px">
          <div style="background:rgba(2,6,23,0.6);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.48rem;color:#64748b;text-transform:uppercase">Peak Nits</div>
            <div style="font-size:0.85rem;font-weight:800;background:linear-gradient(90deg,#fbbf24,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${qp.peak_luminance_nits}</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.48rem;color:#64748b;text-transform:uppercase">Peak White</div>
            <div style="font-size:0.85rem;font-weight:800;color:#ef4444">${qp.absolute_peak_white_nits || 10000}</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.48rem;color:#64748b;text-transform:uppercase">MaxCLL</div>
            <div style="font-size:0.85rem;font-weight:700;color:#fbbf24">${qp.maxCLL}</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.48rem;color:#64748b;text-transform:uppercase">MaxFALL</div>
            <div style="font-size:0.85rem;font-weight:700;color:#f59e0b">${qp.maxFALL}</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.48rem;color:#64748b;text-transform:uppercase">Luma</div>
            <div style="font-size:0.65rem;font-weight:700;color:#c4b5fd">${qp.luma_precision}</div>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          <span style="font-size:0.55rem;padding:2px 8px;border-radius:4px;background:linear-gradient(90deg,rgba(239,68,68,0.2),rgba(168,85,247,0.2));color:#f87171;border:1px solid rgba(239,68,68,0.3);font-weight:600">
            🔥 ${qp.peak_white_range || '4,000 – 10,000 nits'}</span>
          <span style="font-size:0.55rem;padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.2);font-weight:600">
            🎬 ${qp.hdr_standard || 'HDR10+ / Dolby Vision'}</span>
          <span style="font-size:0.55rem;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.2);font-weight:600">
            📺 ${qp.display_tier || 'OLED/QLED Ultra Premium'}</span>
          <span style="font-size:0.55rem;padding:2px 8px;border-radius:4px;background:rgba(251,191,36,0.1);color:#fbbf24;border:1px solid rgba(251,191,36,0.2)">
            DV ${qp.dolby_vision_profile || 'Profile 8.1'}</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div style="background:rgba(2,6,23,0.5);border-radius:6px;padding:8px">
            <div style="font-size:0.58rem;color:#94a3b8;line-height:1.6">
              Color: <b style="color:#c4b5fd">${qp.color_space}</b><br>
              Transfer: <b style="color:#e2e8f0">${qp.transfer_function}</b><br>
              Primaries: <b style="color:#e2e8f0">${qp.color_primaries}</b><br>
              Gamma: <b style="color:#e2e8f0">${qp.gamma_curve}</b>
            </div>
          </div>
          <div style="background:rgba(2,6,23,0.5);border-radius:6px;padding:8px">
            <div style="font-size:0.58rem;color:#94a3b8;line-height:1.6">
              Volume: <b style="color:#fbbf24">${qp.color_volume}</b><br>
              YUV: <b style="color:#e2e8f0">${qp.yuv_matrix}</b><br>
              Dither: <b style="color:#e2e8f0">${qp.dithering}</b><br>
              Range: <b style="color:#10b981">${qp.full_range ? 'Full (0-4095)' : 'Limited'}</b><br>
              Luminance: <b style="color:#f59e0b">${qp.luminance_range || '0.0005 – 10,000 nits'}</b>
            </div>
          </div>
        </div>

        ${qp.cascade_layers ? `
        <div style="margin-top:8px;background:rgba(2,6,23,0.5);border:1px solid rgba(168,85,247,0.2);border-radius:6px;padding:8px">
          <div style="font-size:0.62rem;font-weight:600;color:#c4b5fd;margin-bottom:6px">⚡ 3-Layer HDR Cascade (strict order)</div>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
            <div style="flex:1;min-width:100px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);border-radius:4px;padding:5px">
              <div style="font-size:0.52rem;font-weight:700;color:#fbbf24">L1 Gamma Boost</div>
              <div style="font-size:0.48rem;color:#94a3b8;line-height:1.4;margin-top:2px">
                SDR→PQ · γ2.4 · +18 lift
              </div>
            </div>
            <span style="color:#64748b;font-size:0.7rem">→</span>
            <div style="flex:1;min-width:100px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:4px;padding:5px">
              <div style="font-size:0.52rem;font-weight:700;color:#60a5fa">L2 Luminance Headroom</div>
              <div style="font-size:0.48rem;color:#94a3b8;line-height:1.4;margin-top:2px">
                Highlights +35 · Shadow ENHANCED
              </div>
            </div>
            <span style="color:#64748b;font-size:0.7rem">→</span>
            <div style="flex:1;min-width:100px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:4px;padding:5px">
              <div style="font-size:0.52rem;font-weight:700;color:#f87171">L3 Local Dimming ⚡</div>
              <div style="font-size:0.48rem;color:#94a3b8;line-height:1.4;margin-top:2px">
                AGGRESSIVE · Black: ${qp.black_floor_nits || '0.0001'} nits
              </div>
            </div>
          </div>
        </div>` : ''}
      </div>`;
    }

    // ── Panel: Fake 4K HDR Upscaler ──
    const f4k = health.fake_4k_upscaler || {};
    if (f4k.active) {
      const isF = f4k.fake_4k_detected;
      html += `
      <div style="background:linear-gradient(135deg,${isF ? 'rgba(127,29,29,0.3)' : 'rgba(6,78,59,0.3)'},rgba(15,23,42,0.85));
        border:1px solid ${isF ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)'};border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:1.1rem">🎨</span>
            <span style="font-size:0.78rem;font-weight:700;color:#e2e8f0">Fake 4K HDR Upscaler</span>
          </div>
          <span style="background:${isF ? 'rgba(239,68,68,0.9)' : 'rgba(16,185,129,0.9)'};color:#fff;padding:2px 10px;border-radius:4px;
            font-size:0.62rem;font-weight:700">${isF ? '⚠ FAKE → TRUE 4K' : '✓ NATIVE 4K'} ${f4k.upscale_factor}</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
          <div style="background:rgba(2,6,23,0.6);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.5rem;color:#64748b;text-transform:uppercase">Source → Output</div>
            <div style="font-size:0.78rem;font-weight:700;color:${isF ? '#f87171' : '#10b981'}">${f4k.true_source} → ${f4k.output_resolution}</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.5rem;color:#64748b;text-transform:uppercase">VMAF</div>
            <div style="font-size:0.85rem;font-weight:700;color:#fbbf24">${f4k.vmaf_estimate}</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.5rem;color:#64748b;text-transform:uppercase">Sharpness</div>
            <div style="font-size:0.85rem;font-weight:700;color:#a78bfa">${f4k.perceptual_sharpness}%</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px">
          <div style="background:rgba(2,6,23,0.6);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.5rem;color:#64748b;text-transform:uppercase">FPS</div>
            <div style="font-size:0.85rem;font-weight:800;color:#10b981">${f4k.source_fps || 30} → ${f4k.output_fps || 120}</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.5rem;color:#64748b;text-transform:uppercase">Refresh</div>
            <div style="font-size:0.85rem;font-weight:800;color:#34d399">${f4k.refresh_rate_hz || 120} Hz</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.5rem;color:#64748b;text-transform:uppercase">MEMC</div>
            <div style="font-size:0.6rem;font-weight:600;color:#e2e8f0">4x Synthesis</div>
          </div>
          <div style="background:rgba(2,6,23,0.6);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:0.5rem;color:#64748b;text-transform:uppercase">VRR</div>
            <div style="font-size:0.6rem;font-weight:600;color:#e2e8f0">HDMI 2.1</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div style="background:rgba(2,6,23,0.5);border:1px solid rgba(251,191,36,0.15);border-radius:6px;padding:8px">
            <div style="font-size:0.62rem;font-weight:600;color:#fbbf24;margin-bottom:3px">🔥 HDR Visual Stack</div>
            <div style="font-size:0.56rem;color:#94a3b8;line-height:1.6">
              Tonemap: <b style="color:#e2e8f0">${f4k.sdr_to_hdr_tonemap}</b><br>
              ITM: <b style="color:#e2e8f0">${f4k.inverse_tone_mapping}</b><br>
              Contrast: <b style="color:#fbbf24">+${f4k.contrast_boost_pct}%</b><br>
              Saturation: <b style="color:#34d399">+${f4k.saturation_boost_pct}%</b>
            </div>
          </div>
          <div style="background:rgba(2,6,23,0.5);border:1px solid rgba(168,85,247,0.15);border-radius:6px;padding:8px">
            <div style="font-size:0.62rem;font-weight:600;color:#c4b5fd;margin-bottom:3px">🧠 Neural Processing</div>
            <div style="font-size:0.56rem;color:#94a3b8;line-height:1.6">
              Net: <b style="color:#e2e8f0">${f4k.neural_network}</b><br>
              Detail: <b style="color:#e2e8f0">${f4k.detail_recovery}</b><br>
              Edge: <b style="color:#e2e8f0">${f4k.edge_enhancement}</b><br>
              Grain: <b style="color:#e2e8f0">${f4k.grain_synthesis}</b>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <span style="font-size:0.52rem;padding:2px 6px;border-radius:3px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.2)">
            Deblock: ${f4k.deblock_strength}</span>
          <span style="font-size:0.52rem;padding:2px 6px;border-radius:3px;background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.2)">
            Dering: ${f4k.deringing}</span>
          <span style="font-size:0.52rem;padding:2px 6px;border-radius:3px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.2)">
            Temporal: ${f4k.temporal_stability}</span>
          <span style="font-size:0.52rem;padding:2px 6px;border-radius:3px;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.2)">
            Latency: ${f4k.processing_latency_ms}ms</span>
        </div>
      </div>`;
    }

    // ── Infrastructure footer ──
    const bs = health.bootstrap || {};
    const rd = health.ram_disk || {};
    html += `
      <details style="margin-top:4px">
        <summary style="cursor:pointer;font-size:0.72rem;color:#94a3b8;font-weight:600">🔧 Infrastructure</summary>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px">
          <div style="background:rgba(15,23,42,0.6);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:0.62rem;color:#94a3b8">Bootstrap</div>
            <div style="font-size:0.8rem;font-weight:700;color:${bs.bootstrap_exists ? '#10b981' : '#ef4444'}">${bs.bootstrap_exists ? '✓' : '✗'}</div>
          </div>
          <div style="background:rgba(15,23,42,0.6);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:0.62rem;color:#94a3b8">.user.ini</div>
            <div style="font-size:0.8rem;font-weight:700;color:${bs.user_ini_correct ? '#10b981' : '#f59e0b'}">${bs.user_ini_correct ? '✓ Linked' : bs.user_ini_exists ? '⚠ Wrong' : '✗ Missing'}</div>
          </div>
          <div style="background:rgba(15,23,42,0.6);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:0.62rem;color:#94a3b8">RAM Disk</div>
            <div style="font-size:0.8rem;font-weight:700;color:${rd.writable ? '#10b981' : '#ef4444'}">${rd.writable ? `✓ ${rd.used_pct}%` : '✗ N/A'}</div>
          </div>
        </div>
        ${panicTs > 0 ? `<div style="font-size:0.6rem;color:#f87171;margin-top:6px">Last PANIC: ${new Date(panicTs * 1000).toLocaleString()}</div>` : ''}
        <div style="font-size:0.6rem;color:#64748b;margin-top:4px">Updated: ${health.updated_by || '?'} @ ${health.updated_ts ? new Date(health.updated_ts * 1000).toLocaleString() : '—'}</div>
      </details>`;

    // ── Key config (hidden) ──
    html += `
      <details style="margin-top:8px">
        <summary style="cursor:pointer;font-size:0.65rem;color:#475569">🔑 Auth Key</summary>
        <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
          <input type="text" id="prisma-key-input" placeholder="Prisma Key" value="${getKey()}"
            style="flex:1;padding:4px 8px;border-radius:4px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;font-size:0.7rem;font-family:monospace">
          <button id="prisma-key-save"
            style="padding:4px 10px;border-radius:4px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;font-size:0.7rem;cursor:pointer">💾</button>
        </div>
      </details>`;

    // ── Real-Time Event Log (compact: 5 lines) ──
    const logEntries = eventLog.slice(-5).reverse();
    html += `
      <div style="margin-top:8px;border-top:1px solid rgba(100,116,139,0.15);padding-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:0.6rem;color:#475569">📋 Log (${eventLog.length})</span>
          <div style="display:flex;gap:4px">
            <button id="prisma-log-clear" style="font-size:0.55rem;padding:1px 6px;border-radius:3px;background:transparent;
              color:#475569;border:1px solid rgba(100,116,139,0.2);cursor:pointer">limpiar</button>
            <button id="prisma-log-download" style="font-size:0.55rem;padding:1px 6px;border-radius:3px;background:transparent;
              color:#6366f1;border:1px solid rgba(99,102,241,0.2);cursor:pointer">⬇ json</button>
          </div>
        </div>
        <div id="prisma-log-panel" style="max-height:72px;overflow-y:auto;background:rgba(2,6,23,0.4);
          border-radius:4px;padding:3px 6px;font-family:'JetBrains Mono',Consolas,monospace;font-size:0.55rem;line-height:1.35">
          ${logEntries.length === 0
            ? '<div style="color:#334155;padding:4px 0">…</div>'
            : logEntries.map(e => `<div style="display:flex;gap:4px;color:${logColor(e.level)}"><span style="color:#334155">${e.ts.slice(11,19)}</span>${logIcon(e.level)} ${e.msg}${e.data ? ` <span style="color:#334155;margin-left:auto">${typeof e.data==='string'?e.data:''}</span>`:''}</div>`).join('')
          }
        </div>
      </div>`;

    host.innerHTML = html;

    // ── Bind events ──
    bindEvents(health);
  }

  function bindEvents(health) {
    // Master toggle
    const masterToggle = $('#prisma-master-toggle');
    if (masterToggle) {
      masterToggle.addEventListener('change', async () => {
        const val = masterToggle.checked ? 'on' : 'off';
        prismaLog('action', `Master toggle → ${val.toUpperCase()}`);
        await apiPost({ action: 'master', value: val });
        setTimeout(refresh, 300);
      });
    }

    // Panic button
    const panicBtn = $('#prisma-panic-btn');
    if (panicBtn) {
      panicBtn.addEventListener('click', async () => {
        if (!confirm('⛔ PANIC OFF: Esto desactivará TODAS las lanes de PRISMA inmediatamente. ¿Continuar?')) return;
        prismaLog('error', 'PANIC OFF activado manualmente — todas las lanes se desactivan');
        panicBtn.textContent = '⏳...';
        await apiPost({ action: 'panic_off' });
        setTimeout(refresh, 300);
      });
    }

    // Lane toggles
    document.querySelectorAll('.prisma-lane-toggle').forEach(cb => {
      cb.addEventListener('change', async () => {
        const lane = cb.dataset.lane;
        const action = cb.checked ? 'on' : 'off';
        prismaLog('action', `Lane ${lane} → ${action.toUpperCase()}`);
        await apiPost({ lane, action });
        setTimeout(refresh, 300);
      });
    });

    // Profile chips
    document.querySelectorAll('.prisma-profile-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const lane = chip.dataset.lane;
        const profile = chip.dataset.profile;
        const ls = (health.lanes_status || {})[lane] || {};
        const current = new Set(ls.profiles || []);
        if (current.has(profile)) current.delete(profile); else current.add(profile);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          await apiPost({ lane, action: 'set_profiles', profiles: [...current].join(',') });
          setTimeout(refresh, 200);
        }, 300);
      });
    });

    // Profile shortcuts
    document.querySelectorAll('.prisma-pf-shortcut').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lane = btn.dataset.lane;
        const preset = btn.dataset.preset;
        let profiles = '';
        switch (preset) {
          case 'all':  profiles = 'all'; break;
          case 'uhd':  profiles = 'P0,P1,P2'; break;
          case 'hd':   profiles = 'P0,P1,P2,P3,P4'; break;
          case 'none': profiles = 'none'; break;
        }
        await apiPost({ lane, action: 'set_profiles', profiles });
        setTimeout(refresh, 300);
      });
    });

    // Key save
    const keyBtn = $('#prisma-key-save');
    if (keyBtn) {
      keyBtn.addEventListener('click', () => {
        const inp = $('#prisma-key-input');
        if (inp) { setKey(inp.value.trim()); keyBtn.textContent = '✓'; prismaLog('action', 'Auth key actualizada'); setTimeout(() => { keyBtn.textContent = '💾'; }, 1500); }
      });
    }

    // Log controls
    const logClear = $('#prisma-log-clear');
    if (logClear) {
      logClear.addEventListener('click', () => {
        eventLog.length = 0;
        logSeq = 0;
        prismaLog('info', 'Log limpiado');
        render(lastState || health);
      });
    }

    const logDl = $('#prisma-log-download');
    if (logDl) {
      logDl.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(eventLog, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prisma-log-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        prismaLog('info', 'Log descargado');
      });
    }
  }

  // ── Refresh cycle ──────────────────────────────────────────────────
  async function refresh() {
    const host = $('#prisma-control-widget');
    if (!host) return;

    try {
      const health = await apiGet(HEALTH_ENDPOINT);

      // Detect state transitions for logging
      if (lastState) {
        if (lastState.master_enabled !== health.master_enabled) {
          prismaLog(health.master_enabled ? 'ok' : 'info', `Master cambió → ${health.master_enabled ? 'ACTIVO' : 'STANDBY'}`);
        }
        for (const lane of LANES) {
          const prev = (lastState.lanes_status || {})[lane]?.status;
          const curr = (health.lanes_status || {})[lane]?.status;
          if (prev && curr && prev !== curr) {
            const lvl = curr === 'active' ? 'ok' : curr === 'degraded' ? 'warn' : 'info';
            prismaLog(lvl, `Lane ${lane}: ${prev} → ${curr}`);
          }
        }
      } else {
        prismaLog('ok', 'Conexión establecida con PRISMA API');
      }

      lastState = health;
      const lanesSummary = LANES.map(l => `${l}:${(health.lanes_status||{})[l]?.status||'?'}`).join(' ');
      prismaLog('info', `Poll OK — healthy=${health.healthy} master=${health.master_enabled ? 'ON' : 'OFF'}`, lanesSummary);

      // ── Technical metrics per lane (forensic-grade detail) ──────────
      const metrics = health.lane_metrics || {};
      const telemetry = health.player_telemetry || {};
      const stream = telemetry.stream || {};
      if (stream.codec && stream.codec !== 'unknown') {
        prismaLog('info', `🎬 Stream: ${stream.codec.toUpperCase()} ${stream.resolution || '?'} @ ${stream.bitrate_kbps || 0} Kbps [${stream.decoder || '?'}] buf=${stream.buffer_ms || 0}ms drop=${stream.dropped_frames || 0}`,
          `src=${telemetry.source || 'none'}`);
      }
      for (const lane of LANES) {
        const m = metrics[lane];
        if (!m || !m.active) continue;
        let detail = '';
        switch (lane) {
          case 'cmaf':
            if (m.container) detail = `📦 ${m.container} overhead↓${m.overhead_reduction_pct}% saved=${m.bandwidth_saved_kbps}Kbps seg=${m.segment_alignment} HW=${m.hw_decoder_direct} drop=${m.dropped_frames}`;
            break;
          case 'lcevc':
            if (m.psnr_delta) detail = `🔬 PSNR ${m.psnr_delta} quality↑${m.quality_boost_dB}dB layer=${m.enhancement_layer_kbps}Kbps eff=${m.bitrate_efficiency_pct}%`;
            break;
          case 'hdr10plus':
            if (m.color_space) detail = `🌈 ${m.color_space} ${m.transfer_function} peak=${m.peak_luminance_nits}nits gamut=${m.gamut_coverage_dci_p3_pct}% DCI-P3`;
            break;
          case 'ai_sr':
            if (m.upscale_factor) {
              const f4k = m.fake_4k_detected ? '⚠FAKE4K ' : '';
              const src = m.fake_4k_detected ? `src=${m.true_source_resolution} ` : '';
              detail = `🤖 ${f4k}${src}${m.input_resolution}→${m.output_resolution} (${m.upscale_factor}) VMAF=${m.vmaf_estimate} net=${m.neural_network} ${m.artifact_suppression} lat=${m.processing_latency_ms}ms`;
            }
        }
        if (detail) prismaLog('ok', detail);
      }

      render(health);
      unhealthyCount = 0;
    } catch (e) {
      prismaLog('error', `Poll fallido: ${e.message}`);
      // If we have a previous state, keep rendering it with the log visible
      if (lastState) {
        render(lastState);
      } else {
        host.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:14px">
            <span style="font-size:1.4rem">🔮</span>
            <div>
              <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">APE PRISMA</div>
              <div style="font-size:0.72rem;color:#f87171">⚠ Cannot reach PRISMA API (${e.message})</div>
              <div style="font-size:0.65rem;color:#64748b;margin-top:4px">Ensure PRISMA is installed on VPS · <button id="prisma-retry-btn"
                style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.65rem">Retry</button></div>
            </div>
          </div>`;
        const retryBtn = $('#prisma-retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', refresh);
      }
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────
  function boot() {
    const host = $('#prisma-control-widget');
    if (!host) return;
    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px">
        <span style="font-size:1.4rem">🔮</span>
        <div>
          <div style="font-size:0.9rem;color:#e2e8f0;font-weight:700">APE PRISMA</div>
          <div style="font-size:0.72rem;color:#94a3b8">Initializing quality uplift controller…</div>
        </div>
      </div>`;
    refresh();
    setInterval(refresh, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
