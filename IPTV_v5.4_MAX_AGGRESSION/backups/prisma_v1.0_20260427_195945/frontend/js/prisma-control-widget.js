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

  const LANES = ['cmaf', 'lcevc', 'hdr10plus', 'ai_sr'];
  const LANE_LABELS = {
    cmaf:      { icon: '📦', name: 'CMAF Packaging',      desc: 'fMP4/CMAF repackaging' },
    lcevc:     { icon: '🔬', name: 'LCEVC Enhancement',   desc: 'Low Complexity Enhancement Video Codec' },
    hdr10plus: { icon: '🌈', name: 'HDR10+ Dynamic',      desc: 'Scene-by-scene tone mapping' },
    ai_sr:     { icon: '🤖', name: 'AI Super Resolution', desc: 'Neural upscaling engine' },
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

  function $(sel, root = document) { return root.querySelector(sel); }
  function getKey() { return localStorage.getItem('prisma_key_v1') || ''; }
  function setKey(k) { localStorage.setItem('prisma_key_v1', k); }

  // ── API helpers ─────────────────────────────────────────────────────
  async function apiGet(url) {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { 'X-Prisma-Key': getKey() },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function apiPost(params) {
    const url = `${CONTROL_ENDPOINT}?${new URLSearchParams(params)}`;
    const r = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'X-Prisma-Key': getKey() },
    });
    return r.json();
  }

  // ── Status helpers ──────────────────────────────────────────────────
  function statusColor(s) {
    const map = {
      active: '#10b981', disabled: '#64748b', auto_disabled: '#f59e0b',
      engine_missing: '#ef4444', degraded: '#f97316',
    };
    return map[s] || '#64748b';
  }

  function statusLabel(s) {
    const map = {
      active: '✓ Active', disabled: '— OFF', auto_disabled: '⏸ Auto-Paused',
      engine_missing: '✗ Engine Missing', degraded: '⚠ Degraded',
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

    const dotColor = healthy ? '#10b981' : '#ef4444';
    const dotGlow  = `0 0 8px ${dotColor}`;

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
          <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};box-shadow:${dotGlow};display:inline-block"></span>
          <span style="font-size:0.72rem;color:${dotColor};font-weight:600">${healthy ? 'Healthy' : 'Unhealthy'}</span>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:8px" title="Master ON/OFF">
            <input type="checkbox" id="prisma-master-toggle" ${masterOn ? 'checked' : ''}
              style="width:16px;height:16px;accent-color:#a855f7">
            <span style="font-size:0.72rem;color:${masterOn ? '#c4b5fd' : '#64748b'};font-weight:600">${masterOn ? 'ACTIVO' : 'OFF'}</span>
          </label>
          <button id="prisma-panic-btn"
            style="background:${masterOn ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.2)'};color:#fff;border:none;
            padding:4px 10px;border-radius:6px;font-size:0.7rem;font-weight:700;cursor:pointer;
            transition:all .2s" title="Emergency: disable ALL lanes immediately">⛔ PANIC</button>
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
          ${!engineReady ? `<div style="font-size:0.6rem;color:#f87171;margin-bottom:4px">⚠ Missing: ${(ls.engine?.missing || []).join(', ')}</div>` : ''}
          ${autoDisSecs > 0 ? `<div style="font-size:0.6rem;color:#fbbf24;margin-bottom:4px">⏸ Auto-paused ${autoDisSecs}s remaining</div>` : ''}
          <div style="margin-top:4px">
            <div style="font-size:0.62rem;color:#94a3b8;margin-bottom:2px">Profiles:</div>
            <div>${profileChips(lane, ls.profiles)}</div>
            ${profileShortcuts(lane)}
          </div>
        </div>`;
    }
    html += `</div>`;

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
        await apiPost({ action: 'master', value: val });
        setTimeout(refresh, 300);
      });
    }

    // Panic button
    const panicBtn = $('#prisma-panic-btn');
    if (panicBtn) {
      panicBtn.addEventListener('click', async () => {
        if (!confirm('⛔ PANIC OFF: This will disable ALL PRISMA lanes immediately. Continue?')) return;
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
        if (inp) { setKey(inp.value.trim()); keyBtn.textContent = '✓'; setTimeout(() => { keyBtn.textContent = '💾'; }, 1500); }
      });
    }
  }

  // ── Refresh cycle ──────────────────────────────────────────────────
  async function refresh() {
    const host = $('#prisma-control-widget');
    if (!host) return;

    try {
      const health = await apiGet(HEALTH_ENDPOINT);
      lastState = health;

      // Store key fingerprint for identification
      if (health._key_fingerprint) {
        // If key is present on server but not locally, show hint
      }

      render(health);
      unhealthyCount = health.healthy ? 0 : unhealthyCount + 1;

      // Ring 4: Auto-panic after consecutive unhealthy polls
      if (unhealthyCount >= PANIC_THRESHOLD && health.master_enabled) {
        console.warn('[PRISMA] Auto-panic triggered after', PANIC_THRESHOLD, 'unhealthy polls');
        await apiPost({ action: 'panic_off' });
        unhealthyCount = 0;
        setTimeout(refresh, 500);
      }
    } catch (e) {
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
