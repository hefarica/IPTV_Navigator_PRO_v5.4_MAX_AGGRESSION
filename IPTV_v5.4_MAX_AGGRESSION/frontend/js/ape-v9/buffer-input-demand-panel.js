/**
 * buffer-input-demand-panel.js — panel de la CONDICIÓN DE BUFFER (aditivo)
 * ========================================================================
 * Monta el bloque en la página y habla SÓLO con window.APE_BUF_DEMAND (la
 * aritmética) y con la lista de perfiles que ya exista en la página.
 *
 * Diferencias con el boceto que pasó la persona (todas medibles):
 *   1. No redondea a mano: 6,5 Mbps + 10 % es 7 150 000 bps exactos, no "7.2".
 *   2. No mezcla dos cifras del mismo perfil: la SALIDA sale del bitrate
 *      declarado del perfil y el suelo de arranque se deriva de esa misma cifra.
 *   3. No bloquea la generación por una suposición: mide por canal y, si no
 *      entra ninguno, dice el mínimo imprescindible y el delta que haría falta;
 *      "forzar" queda registrado, no silencioso.
 *   4. No promete un intervalo de medida en ms si el medidor real agrega en
 *      bins de 1000 ms: se declara resolution_ok y max_safe_ms.
 *   5. No inventa la medida del enlace: si nadie la ha medido, se dice.
 */
(function () {
    'use strict';
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const D = window.APE_BUF_DEMAND;
    if (!D) return;
    const ID = 'ape-buf-demand-panel';

    function el(tag, attrs, text) {
        const n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(k => {
            if (k === 'style') n.setAttribute('style', attrs[k]);
            else if (k === 'id') n.id = attrs[k];
            else if (k === 'type') n.type = attrs[k];
            else if (k.indexOf('data-') === 0) n.setAttribute(k, attrs[k]);
            else n.setAttribute(k, attrs[k]);
        });
        if (text != null) n.textContent = text;
        return n;
    }

    function mbps(bps) {
        if (bps == null || !isFinite(bps)) return '—';
        return (bps / 1e6).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' Mbps';
    }

    /** Perfiles declarados en la página, sin inventar nada. */
    function profilesFromPage() {
        const cfg = window.APE_PROFILES_CONFIG;
        if (!cfg) return [];
        const cands = [];
        if (Array.isArray(cfg.profiles)) cands.push(cfg.profiles);
        if (cfg.profiles && !Array.isArray(cfg.profiles) && typeof cfg.profiles === 'object') {
            cands.push(Object.keys(cfg.profiles).map(k => Object.assign({ id: k }, cfg.profiles[k])));
        }
        if (typeof cfg.getAllProfiles === 'function') {
            try { cands.push(cfg.getAllProfiles()); } catch (e) { /* no rompe */ }
        }
        if (Array.isArray(window.APE_LAB_V8_PROFILES)) cands.push(window.APE_LAB_V8_PROFILES);
        for (let i = 0; i < cands.length; i++) {
            const list = cands[i];
            if (Array.isArray(list) && list.length) {
                const rows = list.map(p => ({ id: p.id || p.profile || p.name, settings: p.settings || p }));
                const usable = rows.filter(r => isFinite(D.outputBpsOf(r)));
                if (usable.length) return usable;
            }
        }
        return [];
    }

    function mount() {
        if (document.getElementById(ID)) return;
        const box = el('div', {
            id: ID,
            style: 'background:rgba(2,6,23,.38);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:12px;margin:10px 0;color:#e2e8f0;font-size:.85rem;'
        });
        box.appendChild(el('div', { style: 'font-weight:800;color:#86efac;letter-spacing:.4px;' }, 'CONDICIÓN DE BUFFER · ENTRADA ≥ SALIDA × (1 + delta)'));

        const row = el('div', { style: 'display:flex;align-items:center;gap:9px;margin-top:8px;flex-wrap:wrap;' });
        const lab = el('label', { for: 'ape-delta-input', style: 'white-space:nowrap;color:#94a3b8;' }, 'Delta por canal');
        const inp = el('input', {
            id: 'ape-delta-input', type: 'number', min: '1', max: '90', step: '1',
            style: 'width:80px;padding:5px 7px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;font-weight:800;'
        });
        inp.value = String(D.deltaPct(window.APE_BUF_DELTA_PCT));
        const pct = el('span', { style: 'color:#e2e8f0;font-weight:800;' }, '%');
        const btn = el('button', {
            id: 'ape-delta-apply', type: 'button',
            style: 'background:#0ea5e9;color:#fff;border:0;border-radius:6px;padding:6px 12px;font-weight:800;cursor:pointer;'
        }, 'Aplicar');
        const linkLab = el('label', { for: 'ape-link-input', style: 'white-space:nowrap;color:#94a3b8;margin-left:8px;' }, 'Enlace medido');
        const linkInp = el('input', {
            id: 'ape-link-input', type: 'number', min: '0', max: '100000', step: '0.01', placeholder: 'Mbps (opcional)',
            style: 'width:120px;padding:5px 7px;border-radius:6px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;'
        });
        row.appendChild(lab); row.appendChild(inp); row.appendChild(pct); row.appendChild(btn);
        row.appendChild(linkLab); row.appendChild(linkInp);
        box.appendChild(row);

        const chips = el('div', { style: 'display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;font-size:.8rem;' });
        chips.appendChild(el('span', { style: 'color:#86efac;border:1px solid rgba(34,197,94,.45);border-radius:999px;padding:3px 8px;' }, 'ENTRADA EXTRA · descarga / prefetch / buffer'));
        chips.appendChild(el('span', { style: 'color:#fca5a5;border:1px solid rgba(239,68,68,.4);border-radius:999px;padding:3px 8px;' }, 'SALIDA INTACTA · imagen / bitrate del proveedor'));
        box.appendChild(chips);

        const out = el('div', { id: 'ape-buf-sugerencia', style: 'margin-top:8px;' });
        box.appendChild(out);

        const actions = el('div', { style: 'display:flex;gap:7px;margin-top:8px;flex-wrap:wrap;' });
        const force = el('button', {
            id: 'ape-sug-forzar', type: 'button',
            style: 'background:#b45309;color:#fff;border:0;border-radius:6px;padding:5px 12px;font-weight:800;cursor:pointer;'
        }, 'Aprobar y generar así');
        const deny = el('button', {
            id: 'ape-sug-denegar', type: 'button',
            style: 'background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer;'
        }, 'Denegar');
        actions.appendChild(force); actions.appendChild(deny);
        actions.style.display = 'none';
        box.appendChild(actions);

        const anchor = document.getElementById('apeAutoAdjustBtn');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
        else document.body.appendChild(box);

        function line(text, color) {
            const d = el('div', { style: 'font-size:.82rem;margin-top:5px;color:' + (color || '#94a3b8') + ';' }, text);
            out.appendChild(d);
            return d;
        }

        function render() {
            const delta = D.deltaPct(inp.value);
            window.APE_BUF_DELTA_PCT = delta;
            const linkMbps = Number(linkInp.value);
            const linkBps = (isFinite(linkMbps) && linkMbps > 0) ? Math.round(linkMbps * 1e6) : undefined;
            out.textContent = '';

            /* Ejemplo vivo con la cifra que pidió la persona: si el player se
             * come 15 Mbps y el delta es 20 %, hay que pedir 18 Mbps exactos. */
            line('Regla: entrada ≥ salida × (1 + ' + delta + ' %). El delta sale de aquí y se aplica a CADA canal al emitir.', '#86efac');

            const profs = profilesFromPage();
            if (!profs.length) {
                line('Sin catálogo de perfiles cargado en la página: el delta se aplica igual al emitir, pero no hay tabla que comparar.', '#fbbf24');
            } else {
                const plan = D.plan(profs, { deltaPct: delta, linkBps: linkBps, bufferMs: 15000 });
                for (let i = 0; i < plan.profiles.length && i < 14; i++) {
                    const r = plan.profiles[i];
                    let txt = r.id + ' · salida ' + mbps(r.output_bps) + ' → entrada ' + mbps(r.required_bps);
                    let col = '#e2e8f0';
                    if (linkBps != null) {
                        if (r.feasible === true) { txt += ' · entra'; col = '#86efac'; }
                        else {
                            txt += ' · faltan ' + mbps(r.deficit_bps);
                            if (r.delta_affordable_pct != null) txt += ' (el enlace aguanta hasta ' + r.delta_affordable_pct + ' %)';
                            else txt += ' (ningún delta lo arregla: el enlace no llega ni a la salida)';
                            if (r.time_to_dry_s != null) txt += ' · buffer se seca en ' + r.time_to_dry_s + ' s';
                            col = '#fca5a5';
                        }
                    }
                    line(txt, col);
                }
                if (linkBps != null && plan.feasible_count === 0) {
                    line('Ningún perfil entra con ' + mbps(linkBps) + '. Mínimo imprescindible: ' + plan.minimum_profile +
                        ' con ' + mbps(plan.minimum_required_bps) + '; faltan ' + mbps(plan.shortfall_bps) + '.', '#fbbf24');
                    actions.style.display = 'flex';
                } else if (linkBps != null) {
                    line('Entran ' + plan.feasible_count + ' de ' + plan.output_known + ' perfiles con ' + mbps(linkBps) + '.', '#86efac');
                    actions.style.display = 'none';
                }
            }

            const sp = D.samplePlan(15000);
            line('Muestreo: cada ' + sp.requested_ms + ' ms como mucho; el medidor real de la app agrega en bins de ' +
                sp.measurement_ms + ' ms; ciego máximo tolerable ' + sp.max_safe_ms + ' ms → ' +
                (sp.resolution_ok ? 'suficiente' : 'insuficiente, hay que afinar el medidor') + '.', '#c4b5fd');
            if (linkBps == null) line('Sin medida de enlace: no se puede diagnosticar déficit (no comprobado, no inventado).', '#94a3b8');
        }

        btn.addEventListener('click', render);
        linkInp.addEventListener('change', render);
        force.addEventListener('click', function () {
            window.APE_BUF_FORCED_DECISION = { forced: true, at: 'panel', deltaPct: D.deltaPct(inp.value) };
            out.textContent = '';
            line('Forzado y registrado: se emite con el delta ' + D.deltaPct(inp.value) + ' %. La salida no se ha tocado.', '#fbbf24');
        });
        deny.addEventListener('click', function () {
            window.APE_BUF_FORCED_DECISION = { forced: false, at: 'panel', deltaPct: D.deltaPct(inp.value) };
            out.textContent = '';
            line('Denegado: no se emite con un enlace que no cumple la condición.', '#fca5a5');
        });

        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
