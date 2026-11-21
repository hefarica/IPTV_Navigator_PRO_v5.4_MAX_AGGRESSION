
/**
 * APE Headers + Preview Fix (non-destructive)
 * - Ensures selected headers get non-empty values when APE mode is ON (auto) by using ULTRA_HEADERS_MATRIX.
 * - Ensures preview textarea is updated after generation.
 * - Adds lightweight "guardado" toast on save of headers config.
 *
 * Safe: does not change IDs or rewrite HTML; patches runtime methods only.
 */
(function () {
  'use strict';

  const LS_MODE_KEY = 'v41_headers_value_mode'; // ON/OFF toggle for APE values
  const LS_CFG_KEY = 'ultra_headers_config';   // saved headers selection/values

  function nowId() { return 'toast_' + Math.random().toString(16).slice(2); }

  function toast(msg, ms) {
    try {
      const id = nowId();
      const el = document.createElement('div');
      el.id = id;
      el.textContent = msg;
      el.style.cssText = [
        'position:fixed', 'right:18px', 'top:18px', 'z-index:99999',
        'background:rgba(20,30,45,.95)', 'color:#fff',
        'padding:10px 12px', 'border-radius:10px',
        'font: 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        'box-shadow:0 10px 30px rgba(0,0,0,.35)',
        'border:1px solid rgba(255,255,255,.12)'
      ].join(';');
      document.body.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s ease'; }, Math.max(150, (ms || 1400) - 250));
      setTimeout(() => { el.remove(); }, ms || 1400);
    } catch (_) { }
  }

  function getApeMode() {
    try {
      const v = localStorage.getItem(LS_MODE_KEY);
      if (v === null || v === undefined || v === '') return true; // default ON
      return String(v) === '1' || String(v).toLowerCase() === 'true' || String(v).toUpperCase() === 'ON';
    } catch (_) { return true; }
  }

  function safeGet(obj, path, fallback) {
    try {
      const parts = path.split('.');
      let cur = obj;
      for (const p of parts) {
        if (!cur) return fallback;
        cur = cur[p];
      }
      return (cur === undefined ? fallback : cur);
    } catch (_) { return fallback; }
  }

  function deriveHost(url) {
    try { return new URL(url).host || ''; } catch (_) { return ''; }
  }
  function deriveOrigin(url) {
    try { return new URL(url).origin || ''; } catch (_) { return ''; }
  }

  function safeDefaults(headerName, channelUrl) {
    // Conservative defaults: enough to be valid and useful, but not "evasion".
    const origin = deriveOrigin(channelUrl);
    const host = deriveHost(channelUrl);

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    const map = {
      'User-Agent': ua,
      'Accept': '*/*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Origin': origin || '',
      'Referer': origin ? (origin + '/') : '',
      'Host': host || '',
      'Range': 'bytes=0-'
    };
    return map[headerName] || '';
  }

  function fillHeadersFromMatrix(activeHeaders, level, channel, server) {
    const out = {};
    const matrix = window.ULTRA_HEADERS_MATRIX;

    const channelUrl = (channel && (channel.url || channel.streamUrl || channel.stream || channel.link)) || '';
    const scopeApe = getApeMode();

    for (const k of Object.keys(activeHeaders || {})) {
      const userVal = (activeHeaders && activeHeaders[k] != null) ? String(activeHeaders[k]) : '';
      let v = userVal;

      // When APE mode ON: generate if empty (or keep user override if provided)
      if (scopeApe && (!v || !v.trim())) {
        try {
          if (matrix && typeof matrix.getHeaderValue === 'function') {
            v = matrix.getHeaderValue(k, level || 1, channel || null, server || null);
          }
        } catch (_) { /* fall back below */ }

        if (!v || !String(v).trim()) {
          v = safeDefaults(k, channelUrl);
        }
      }

      // When APE mode OFF: keep user value as-is (validation elsewhere should enforce non-empty)
      out[k] = (v == null ? '' : String(v));
    }

    return out;
  }

  function getHeuristicLevel(ch, server, options) {
    // 🆕 V4.1+ Usar APE_HEURISTICS_ENGINE si está disponible
    if (window.APE_HEURISTICS_ENGINE && typeof window.APE_HEURISTICS_ENGINE.getLevel === 'function') {
      try {
        return window.APE_HEURISTICS_ENGINE.getLevel(ch, server || {}, options || {});
      } catch (_) { /* fall through to legacy */ }
    }

    // Legacy fallback: best-effort mapping if no explicit level exists
    const explicit = safeGet(ch, 'ape.level', null) || safeGet(ch, 'apeLevel', null) || safeGet(ch, 'headersLevel', null);
    const n = Number(explicit);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;

    const tier = String(
      safeGet(ch, 'tier', '') ||
      safeGet(ch, 'heuristics.tier', '') ||
      safeGet(ch, 'scoreTier', '') ||
      safeGet(ch, 'ranking.tier', '')
    ).toUpperCase();

    if (tier.includes('ULTRA') || tier.includes('HARD') || tier.includes('WAF')) return 5;
    if (tier.includes('AGG') || tier.includes('MODERN')) return 3;
    if (tier.includes('LEGACY')) return 2;
    return 1;
  }

  function updatePreview(text) {
    try {
      const el = document.getElementById('m3u8PreviewGen')
        || document.getElementById('m3u8Preview')
        || document.getElementById('m3u8PreviewContent');
      if (el) el.value = text || '';
    } catch (_) { }
  }

  function patchAppInstance(app) {
    if (!app || app.__apeFixPatched) return;
    app.__apeFixPatched = true;

    // Patch: generation -> ensure headers values & preview
    if (typeof app.generateM3U8Pro === 'function') {
      const original = app.generateM3U8Pro.bind(app);
      app.generateM3U8Pro = async function () {
        const before = this.state && this.state.activeHeaders ? { ...this.state.activeHeaders } : null;

        try {
          // If include headers enabled and we have selections, fill them.
          const includeHeaders = !!safeGet(this, 'state.options.includeHeaders', safeGet(this, 'state.includeHeaders', false));
          if (includeHeaders && this.state && this.state.activeHeaders && Object.keys(this.state.activeHeaders).length) {
            const globalLevel = Number(
              safeGet(this, 'state.options.defaultGlobalLevel', null) ||
              safeGet(this, 'state.defaultGlobalLevel', null) ||
              1
            ) || 1;

            // If PER_CHANNEL is enabled, we'll compute per-channel inside generator by temporarily replacing
            // activeHeaders for each channel when app builds EXTHTTP. We can't easily hook that deep without
            // rewriting, so we do the safe thing: pre-fill global values so output is never empty.
            this.state.activeHeaders = fillHeadersFromMatrix(this.state.activeHeaders, globalLevel, null, null);
          }
        } catch (_) { }

        const res = await original();

        // After generation, update preview using state or return value
        try {
          const txt = (typeof res === 'string' && res.length) ? res : safeGet(this, 'state.generatedM3U8', '');
          if (txt) updatePreview(txt);
        } catch (_) { }

        // Restore state object reference if needed
        try {
          if (before && this.state) {
            // keep filled values (better UX) if APE mode ON; otherwise restore
            if (!getApeMode()) this.state.activeHeaders = before;
          }
        } catch (_) { }

        return res;
      };
    }

    // Patch: make sure "Guardar" in headers UI also persists + shows toast
    try {
      const ui = window.HeadersManagerUI && window.HeadersManagerUI.instance ? window.HeadersManagerUI.instance : window.headersManagerUI;
      if (ui && typeof ui.saveConfig === 'function' && !ui.__apeFixSavePatched) {
        ui.__apeFixSavePatched = true;
        const origSave = ui.saveConfig.bind(ui);
        ui.saveConfig = function () {
          try {
            const cfg = this.exportConfig ? this.exportConfig() : null;
            if (cfg) {
              localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg));
              toast('✅ Headers guardados', 1400);
            }
          } catch (_) { }
          return origSave();
        };
      }
    } catch (_) { }

    // Extra: show toast when toggle mode changed
    try {
      const toggle = document.querySelector('[data-ape-headers-toggle]') || document.getElementById('apeHeadersValueMode');
      if (toggle && !toggle.__apeFixBound) {
        toggle.__apeFixBound = true;
        toggle.addEventListener('change', () => {
          toast(getApeMode() ? '🔧 APE: auto-valores ON' : '✍️ APE: valores manuales', 1200);
        });
      }
    } catch (_) { }
  }

  function tryPatch() {
    // app may be global or created later
    if (window.app) patchAppInstance(window.app);

    // some builds store it as window.__appInstance
    if (window.__appInstance) patchAppInstance(window.__appInstance);

    // also patch if app is attached via getter
    // (no-op if absent)
  }

  // Patch quickly, then keep trying for a short period until app exists
  tryPatch();
  let tries = 0;
  const t = setInterval(() => {
    tryPatch();
    tries++;
    if (tries > 60) clearInterval(t);
    if (window.app && window.app.__apeFixPatched) clearInterval(t);
  }, 250);

})();
