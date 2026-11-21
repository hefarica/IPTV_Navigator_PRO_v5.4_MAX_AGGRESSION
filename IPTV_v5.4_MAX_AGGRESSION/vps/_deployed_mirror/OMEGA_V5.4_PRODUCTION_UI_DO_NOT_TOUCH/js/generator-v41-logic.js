/**
 * 🚀 IPTV Navigator PRO - V4.1 Logic Pack (lightweight integration)
 * - Telemetry mini panel + dashboard KPIs
 * - Compression profile hints (AUTO/MODERN/LEGACY)
 * - Stream inspector UI updater
 * - Header toggles sync (filter obsolete)
 *
 * This file is designed to be safe-additive for the existing v3/v4 codebase.
 */
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function safeText(el, text){
    if (!el) return;
    el.textContent = String(text);
  }

  function pulse(el){
    if (!el) return;
    el.classList.add('telemetry-card-updating');
    setTimeout(()=>el.classList.remove('telemetry-card-updating'), 650);
  }

  // ─────────────────────────────────────────────────────────────
  // 1) Compression hints
  // ─────────────────────────────────────────────────────────────
  function updateCompressionHints(profile){
    const hint = $('compressionHint');
    if (!hint) return;

    const p = (profile || 'AUTO').toUpperCase();

    if (p === 'MODERN'){
      hint.innerHTML = '<span style="color: #3b82f6; font-weight: 600;">⚡ MODERN:</span> ' +
        'Prioriza compresión moderna (br/zstd cuando sea posible). Recomendado para CDNs actuales y hardware reciente.';
    } else if (p === 'LEGACY'){
      hint.innerHTML = '<span style="color: #fb923c; font-weight: 600;">📺 LEGACY:</span> ' +
        'Máxima compatibilidad: gzip/deflate. Útil si tienes problemas de reproducción o entornos muy antiguos.';
    } else {
      hint.innerHTML = '<span style="color: #3b82f6; font-weight: 600;">ℹ️ AUTO:</span> ' +
        'Se seleccionará MODERN o LEGACY automáticamente según CDN/WAF detectado y capacidades del player target.';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2) Stream Inspector
  // ─────────────────────────────────────────────────────────────
  function updateStreamInspector(payload){
    if (!payload) return;
    const provider = payload.provider || payload.Provider || '—';
    const cdn = payload.cdn || payload.CDN || payload.waf || payload.WAF || '—';
    const protocol = (payload.protocol || payload.Protocol || '').toUpperCase() || '—';

    safeText($('inspectorProvider'), provider);
    safeText($('inspectorCdn'), cdn);
    const protoEl = $('inspectorProtocol');
    safeText(protoEl, protocol);
    if (protoEl){
      if (protocol === 'HTTPS' || protocol === 'HTTP'){
        protoEl.setAttribute('data-protocol', protocol);
      } else {
        protoEl.removeAttribute('data-protocol');
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3) V4.1 Config sync helpers
  // ─────────────────────────────────────────────────────────────
  function getV41Config(){
    return {
      compressionProfile: $('v41CompatProfile')?.value || 'AUTO',
      filterObsolete: $('filterObsolete') ? !!$('filterObsolete').checked : true,
      telemetryEnabled: $('telemetryEnabled') ? !!$('telemetryEnabled').checked : true,
      targetPlayer: $('v41TargetPlayer')?.value || 'generic'
    };
  }

  function updateHeaderToggles(){
    // Keep a single source of truth on window for other modules to read.
    window.v41Config = Object.assign({}, window.v41Config || {}, getV41Config());

    // If the app has a state bag, sync it (best-effort).
    try {
      if (window.app && window.app.state){
        window.app.state.v41 = Object.assign({}, window.app.state.v41 || {}, window.v41Config);
      }
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────
  // 4) Telemetry manager (for the new UI)
  // ─────────────────────────────────────────────────────────────
  const telemetryManager = {
    stats: {
      calls: 0,
      success: 0,
      totalTime: 0,
      overrides: 0,
      dist: { MODERN: 0, LEGACY: 0 }
    },

    reset(){
      this.stats = { calls:0, success:0, totalTime:0, overrides:0, dist:{MODERN:0, LEGACY:0} };
      this.render();
    },

    logDecision(success, timeMs, profile, wasOverride){
      const enabled = $('telemetryEnabled') ? !!$('telemetryEnabled').checked : true;
      if (!enabled) return;

      const p = (profile || 'AUTO').toUpperCase();
      // AUTO is counted into MODERN/LEGACY distribution later when we can infer; for now map AUTO->MODERN
      const bucket = (p === 'LEGACY') ? 'LEGACY' : 'MODERN';

      this.stats.calls += 1;
      this.stats.success += success ? 1 : 0;
      this.stats.totalTime += Number(timeMs || 0);
      this.stats.overrides += wasOverride ? 1 : 0;
      this.stats.dist[bucket] = (this.stats.dist[bucket] || 0) + 1;

      this.render();
      this.updateSmartRecommendations();
    },

    render(){
      const s = this.stats;
      const calls = s.calls || 0;
      const successPct = calls ? Math.round((s.success / calls) * 100) : 0;
      const avg = calls ? Math.round(s.totalTime / calls) : 0;

      safeText($('telemetryApeCalls'), calls);
      safeText($('telemetrySuccess'), `${successPct}%`);
      safeText($('telemetryAvgTime'), `${avg}ms`);
      safeText($('telemetryOverrides'), s.overrides);

      // dashboard (if present)
      safeText($('telem__ape-calls'), calls);
      safeText($('telem__success-rate'), `${successPct}%`);
      safeText($('telem__avg-time'), `${avg}ms`);
      safeText($('telem__overrides'), s.overrides);

      pulse($('telemetryApeCalls'));
      pulse($('telemetrySuccess'));
      pulse($('telemetryAvgTime'));
      pulse($('telemetryOverrides'));

      // dist bars
      const modern = s.dist.MODERN || 0;
      const legacy = s.dist.LEGACY || 0;
      const total = modern + legacy;
      const modernPct = total ? Math.round((modern / total) * 100) : 0;
      const legacyPct = total ? (100 - modernPct) : 0;

      const modernBar = $('modernBar');
      const legacyBar = $('legacyBar');
      if (modernBar) modernBar.style.width = modernPct + '%';
      if (legacyBar) legacyBar.style.width = legacyPct + '%';
      safeText($('modernPercent'), modernPct + '%');
      safeText($('legacyPercent'), legacyPct + '%');

      safeText($('modernChannels'), modern);
      safeText($('legacyChannels'), legacy);
      safeText($('modernPct'), modernPct + '%');
      safeText($('legacyPct'), legacyPct + '%');
    },

    updateSmartRecommendations(){
      // Simple heuristic:
      // - buffer = max(2s, min(10s, avgLatency*0.02 + 2))
      const calls = this.stats.calls || 0;
      const avg = calls ? (this.stats.totalTime / calls) : 0;
      const bufferSec = clamp(Math.round((avg * 0.02) + 2), 2, 10);
      const bufEl = $('smartBufferRecommend');
      if (bufEl) safeText(bufEl, `${bufferSec}s`);

      // profile recommendation based on distribution (or selected)
      const pEl = $('smartProfileRecommend');
      if (!pEl) return;
      const modern = this.stats.dist.MODERN || 0;
      const legacy = this.stats.dist.LEGACY || 0;
      const rec = (legacy > modern) ? 'LEGACY' : 'MODERN';
      safeText(pEl, rec);
    }
  };

  // Make global (needed by the guide's tests)
  window.telemetryManager = telemetryManager;

  // ─────────────────────────────────────────────────────────────
  // 5) Hook points for app.js (best-effort)
  // ─────────────────────────────────────────────────────────────
  window.V41Hooks = window.V41Hooks || {};

  // Called by patched app.generateM3U8Pro (see patch in app.js)
  window.V41Hooks.onGenerateStart = function(ctx){
    // keep config synced
    updateHeaderToggles();

    // update hint on load
    updateCompressionHints($('v41CompatProfile')?.value || 'AUTO');

    // update quick stats (if channels provided)
    if (ctx && Array.isArray(ctx.channels)){
      const total = ctx.channels.length;
      safeText($('genStatTotal'), total);
      // placeholder until filters are applied
      safeText($('genStatFiltered'), total);
    }
  };

  window.V41Hooks.onGenerateEnd = function(ctx){
    if (!ctx) return;
    // Stream inspector - best-effort: derive from URL
    const sampleUrl = ctx.sampleUrl || '';
    if (sampleUrl){
      const u = String(sampleUrl);
      let protocol = '—';
      try { protocol = (new URL(u)).protocol.replace(':','').toUpperCase(); } catch(_){}
      const lower = u.toLowerCase();
      const provider =
        lower.includes('cloudflare') ? 'Cloudflare' :
        lower.includes('akamai') ? 'Akamai' :
        lower.includes('fastly') ? 'Fastly' :
        lower.includes('cloudfront') ? 'CloudFront' :
        lower.includes('edgekey') || lower.includes('edgesuite') ? 'Akamai EdgeSuite' :
        '—';
      const cdn =
        lower.includes('cloudflare') ? 'Cloudflare CDN' :
        lower.includes('akamai') ? 'Akamai CDN' :
        lower.includes('fastly') ? 'Fastly CDN' :
        lower.includes('cloudfront') ? 'AWS CloudFront' :
        lower.includes('cdn') ? 'CDN' :
        '—';
      updateStreamInspector({provider, cdn, protocol});
    }

    // Quick stats from ctx
    if (typeof ctx.totalChannels === 'number') safeText($('genStatTotal'), ctx.totalChannels);
    if (typeof ctx.filteredChannels === 'number') safeText($('genStatFiltered'), ctx.filteredChannels);
    if (typeof ctx.count4k === 'number') safeText($('genStat4K'), ctx.count4k);
    if (typeof ctx.groupCount === 'number') safeText($('genStatGroups'), ctx.groupCount);
  };

  // Expose helpers on app if it exists
  function attachToApp(){
    if (!window.app) return;
    if (typeof window.app.updateCompressionHints !== 'function') window.app.updateCompressionHints = updateCompressionHints;
    if (typeof window.app.updateStreamInspector !== 'function') window.app.updateStreamInspector = updateStreamInspector;
    if (typeof window.app.updateHeaderToggles !== 'function') window.app.updateHeaderToggles = updateHeaderToggles;
  }

  document.addEventListener('DOMContentLoaded', function(){
    // init config and hint if UI exists
    updateHeaderToggles();
    updateCompressionHints($('v41CompatProfile')?.value || 'AUTO');

    // attach handlers
    const sel = $('v41CompatProfile');
    if (sel){
      sel.addEventListener('change', (e)=>updateCompressionHints(e.target.value));
    }
    const ft = $('filterObsolete');
    if (ft){
      ft.addEventListener('change', updateHeaderToggles);
    }
    const te = $('telemetryEnabled');
    if (te){
      te.addEventListener('change', ()=>telemetryManager.render());
    }

    attachToApp();
    // If app is created later, retry a few times (non-blocking)
    let tries = 0;
    const t = setInterval(()=>{
      attachToApp();
      tries++;
      if (window.app || tries > 20) clearInterval(t);
    }, 200);
  });

})();
