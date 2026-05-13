/**
 * NET SHIELD Sentinel — Frontend Widget
 * Muestra estado del agente autónomo en tab Telemetría.
 * Endpoint: https://iptv-ape.duckdns.org/api/netshield-sentinel.php
 * Refresh: cada 30s
 */
(function () {
  'use strict';

  const ENDPOINT = 'https://iptv-ape.duckdns.org/api/netshield-sentinel.php';
  const REFRESH_MS = 30_000;

  function $(sel, root = document) { return root.querySelector(sel); }
  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    for (const k in (props.style || {})) n.style[k] = props.style[k];
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    });
    return n;
  }

  function fmtAge(iso) {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    return Math.floor(s / 3600) + 'h';
  }

  function riskBadge(risk) {
    const colors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
    return `<span style="background:${colors[risk] || '#64748b'};color:#0b1220;padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.65rem">${risk}</span>`;
  }

  function confBadge(c) {
    const v = (c || 0) * 100;
    const color = v >= 90 ? '#10b981' : v >= 70 ? '#3b82f6' : v >= 50 ? '#f59e0b' : '#ef4444';
    return `<span style="background:${color};color:#0b1220;padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.65rem">${v.toFixed(0)}%</span>`;
  }

  async function fetchSnapshot() {
    const r = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function postAction(action, id) {
    const r = await fetch(`${ENDPOINT}?${action}=${encodeURIComponent(id)}`, {
      method: 'POST',
      cache: 'no-store',
    });
    return r.json();
  }

  function renderStats(stats) {
    if (!stats) return '';
    return `
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:10px">
        <div style="background:rgba(59,130,246,.1);padding:6px;border-radius:6px;text-align:center">
          <div style="font-size:0.65rem;color:#94a3b8">Eventos 1h</div>
          <div style="font-size:1rem;color:#e2e8f0;font-weight:700">${stats.events_last_cycle ?? 0}</div>
        </div>
        <div style="background:rgba(16,185,129,.1);padding:6px;border-radius:6px;text-align:center">
          <div style="font-size:0.65rem;color:#94a3b8">Auto-aplicados</div>
          <div style="font-size:1rem;color:#10b981;font-weight:700">${stats.proposals_auto_applied_all_time ?? 0}</div>
        </div>
        <div style="background:rgba(245,158,11,.1);padding:6px;border-radius:6px;text-align:center">
          <div style="font-size:0.65rem;color:#94a3b8">Pendientes</div>
          <div style="font-size:1rem;color:#f59e0b;font-weight:700">${stats.proposals_pending ?? 0}</div>
        </div>
        <div style="background:rgba(168,85,247,.1);padding:6px;border-radius:6px;text-align:center">
          <div style="font-size:0.65rem;color:#94a3b8">KB aprendido</div>
          <div style="font-size:1rem;color:#a855f7;font-weight:700">${stats.kb_unique_signatures ?? 0}</div>
        </div>
      </div>
    `;
  }

  function renderPending(list, onApprove, onReject) {
    if (!list || !list.length) {
      return `<div style="text-align:center;padding:14px;color:#64748b;font-size:0.78rem">✓ Sin propuestas pendientes</div>`;
    }
    const container = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    list.forEach(p => {
      const row = el('div', {
        style: {
          background: 'rgba(15,23,42,.6)',
          border: '1px solid rgba(245,158,11,.4)',
          borderRadius: '8px',
          padding: '10px',
        },
      });
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:0.8rem;color:#fbbf24;font-weight:700">${p.signature_id}</div>
          <div style="display:flex;gap:4px">
            ${confBadge(p.confidence)} ${riskBadge(p.risk)}
            <span style="background:#334155;color:#cbd5e1;padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.65rem">${p.event_count} eventos</span>
          </div>
        </div>
        <div style="font-size:0.72rem;color:#cbd5e1;margin-bottom:4px"><strong>Causa:</strong> ${p.root_cause || '—'}</div>
        <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:4px"><strong>Motivo:</strong> ${p.rationale || '—'}</div>
        <div style="font-family:'Consolas',monospace;background:#0b1220;color:#10b981;padding:6px;border-radius:4px;font-size:0.7rem;margin-bottom:8px;overflow-x:auto">$ ${p.fix_bash || '(sin acción)'}</div>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button data-action="approve" data-id="${p.proposal_id}" style="background:#10b981;color:#0b1220;border:none;padding:4px 12px;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.72rem">✓ Aprobar y aplicar</button>
          <button data-action="reject" data-id="${p.proposal_id}" style="background:#475569;color:#e2e8f0;border:none;padding:4px 12px;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.72rem">✕ Rechazar</button>
        </div>
      `;
      row.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async () => {
          const act = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');
          btn.disabled = true;
          btn.textContent = '⏳...';
          try {
            const resp = await postAction(act, id);
            if (resp && resp.ok) {
              btn.textContent = act === 'approve' ? '✓ Aplicado' : '✕ Rechazado';
              setTimeout(refresh, 500);
            } else {
              btn.textContent = '⚠ Error';
              console.error('sentinel action error', resp);
            }
          } catch (e) {
            btn.textContent = '⚠ Error';
            console.error(e);
          }
        });
      });
      container.appendChild(row);
    });
    return container.outerHTML;
  }

  function renderRecentAuto(list) {
    if (!list || !list.length) return '';
    const rows = list.map(p => `
      <tr>
        <td style="padding:2px 6px;color:#94a3b8;font-size:0.68rem">${fmtAge(p.applied_at)} ago</td>
        <td style="padding:2px 6px;color:#10b981;font-size:0.68rem">${p.signature_id}</td>
        <td style="padding:2px 6px;font-family:'Consolas',monospace;color:#cbd5e1;font-size:0.66rem">${p.fix_bash || ''}</td>
        <td style="padding:2px 6px;color:${p.returncode === 0 ? '#10b981' : '#ef4444'};font-size:0.66rem">rc=${p.returncode ?? '?'}</td>
      </tr>
    `).join('');
    return `
      <details style="margin-top:10px">
        <summary style="cursor:pointer;font-size:0.75rem;color:#94a3b8">🤖 Últimas aplicaciones automáticas (${list.length})</summary>
        <table style="width:100%;margin-top:6px;border-collapse:collapse"><tbody>${rows}</tbody></table>
      </details>
    `;
  }

  function renderTopSigs(list) {
    if (!list || !list.length) return '';
    const rows = list.slice(0, 8).map(s => `
      <tr>
        <td style="padding:2px 6px;font-size:0.68rem;color:${s.id === 'unknown' ? '#ef4444' : '#cbd5e1'}">${s.id}</td>
        <td style="padding:2px 6px;font-size:0.68rem;color:#94a3b8;text-align:right">${s.count}</td>
      </tr>
    `).join('');
    return `
      <details style="margin-top:8px">
        <summary style="cursor:pointer;font-size:0.75rem;color:#94a3b8">📊 Top signatures (lifetime)</summary>
        <table style="width:100%;margin-top:6px;border-collapse:collapse"><tbody>${rows}</tbody></table>
      </details>
    `;
  }

  async function refresh() {
    const host = $('#netshield-sentinel-widget');
    if (!host) return;
    try {
      const snap = await fetchSnapshot();
      const lastAge = fmtAge(snap.last_cycle_at);
      host.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div style="font-size:0.9rem;color:#f3f4f6;font-weight:700">🛡️ NET SHIELD Sentinel</div>
            <div style="font-size:0.68rem;color:#94a3b8">Último barrido: hace ${lastAge} · modo advisory + auto si ≥90%/low</div>
          </div>
          <button id="sentinel-refresh-btn" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.72rem">↻ refrescar</button>
        </div>
        ${renderStats(snap.stats)}
        <div style="font-size:0.78rem;color:#fbbf24;font-weight:600;margin:10px 0 6px 0">⏳ Pendientes de tu aprobación</div>
        ${renderPending(snap.pending_approvals)}
        ${renderRecentAuto(snap.recent_auto_applied)}
        ${renderTopSigs(snap.top_signatures_lifetime)}
      `;
      // re-bind buttons (innerHTML destruye listeners)
      host.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const act = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');
          btn.disabled = true;
          btn.textContent = '⏳...';
          try {
            const r = await postAction(act, id);
            btn.textContent = r && r.ok ? (act === 'approve' ? '✓ aplicado' : '✕ rechazado') : '⚠ error';
            setTimeout(refresh, 600);
          } catch (e) { btn.textContent = '⚠ error'; console.error(e); }
        });
      });
      $('#sentinel-refresh-btn', host)?.addEventListener('click', refresh);
    } catch (e) {
      host.innerHTML = `
        <div style="color:#ef4444;font-size:0.78rem;padding:10px">
          ⚠ No se pudo cargar estado Sentinel (${e.message}).
          <button onclick="window.__netshieldSentinelRefresh && window.__netshieldSentinelRefresh()" style="margin-left:8px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem">reintentar</button>
        </div>
      `;
    }
  }

  window.__netshieldSentinelRefresh = refresh;

  function boot() {
    if (!$('#netshield-sentinel-widget')) return;
    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
