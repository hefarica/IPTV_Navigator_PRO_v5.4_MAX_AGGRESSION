(function () {
    'use strict';

    const DEFAULT_GATE_URL = 'http://127.0.0.1:8766/gate';  // legacy local (no usado por prepublish)
    // Etapa 3 del plan "Integración sin /resolve/" — probe vía VPS (endpoint ya existente)
    // resolve_redirect.php está desplegado en iptv-ape.duckdns.org y devuelve {location, status}.
    // CERO dependencia de servidor local. CERO pantalla negra.
    const DEFAULT_VPS_PROBE_URL = 'https://iptv-ape.duckdns.org/resolve_redirect.php';
    const DEFAULT_PREPUBLISH_URL = DEFAULT_VPS_PROBE_URL;  // alias para compat con API previa

    async function refreshAdmission(options = {}) {
        if (!window.APEHealthRuntime) throw new Error('APEHealthRuntime no está cargado');
        const result = await window.APEHealthRuntime.loadAdmittedMap(options.admissionUrl, options);
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast(`Salud cargada: ${result.count} entradas admitidas`, 'success');
        }
        return result;
    }

    async function generateHealthyList(options = {}) {
        if (!window.M3U8TypedArraysGenerator) throw new Error('M3U8TypedArraysGenerator no está cargado');
        if (!window.app || typeof window.app.getFilteredChannels !== 'function') throw new Error('window.app.getFilteredChannels() no disponible');

        await window.APEHealthRuntime.ensureReady(options);
        const channels = window.app.getFilteredChannels() || [];
        const merged = {
            ...options,
            useAdmission: true,
            admissionUrl: options.admissionUrl || (window.APEHealthRuntime && window.APEHealthRuntime.config.admissionUrl)
        };
        return window.M3U8TypedArraysGenerator.generateAndDownload(channels, merged);
    }

    async function probeGateServer(gateUrl = DEFAULT_GATE_URL, timeoutMs = 3000) {
        const healthUrl = gateUrl.replace(/\/gate\/?$/, '/health');
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(healthUrl, { method: 'GET', signal: controller.signal, cache: 'no-store' });
            return resp.ok;
        } catch (_) {
            return false;
        } finally {
            clearTimeout(t);
        }
    }

    async function auditM3U8Text(m3u8Text, options = {}) {
        const gateUrl = options.gateUrl || DEFAULT_GATE_URL;
        const sample = options.sampleSize || 300;
        const timeout = options.probeTimeout || 15;
        const url = `${gateUrl}?sample=${encodeURIComponent(sample)}&timeout=${encodeURIComponent(timeout)}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: m3u8Text,
            cache: 'no-store'
        });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`gate_server respondió HTTP ${resp.status}: ${errText.slice(0, 200)}`);
        }
        return resp.json();
    }

    function renderVerdict(verdict) {
        if (!verdict) return 'Verdict vacío';
        const ok200 = ((verdict.ok200_ratio || 0) * 100).toFixed(2);
        const hls = ((verdict.hls_ratio || 0) * 100).toFixed(2);
        const r407 = ((verdict.bad407_ratio || 0) * 100).toFixed(2);
        const lines = [
            `Muestra: ${verdict.sample_size} de ${verdict.total_urls || '?'}`,
            `HTTP 200: ${ok200}% (umbral ≥${(verdict.thresholds?.min_ok200 || 0.99) * 100}%)`,
            `HTTP 407: ${r407}% / ${verdict.bad407_count} (umbral ≤${(verdict.thresholds?.max_407_ratio || 0.01) * 100}%)`,
            `HTTP 405: ${verdict.bad405_count} (umbral ≤${verdict.thresholds?.max_405 ?? 0})`,
            `HLS real: ${hls}% (umbral ≥${(verdict.thresholds?.min_hls || 0.9) * 100}%)`,
            `Veredicto: ${verdict.published ? '✅ CUMPLE umbrales' : '⚠ NO cumple — informativo, lista sigue disponible'}`,
        ];
        return lines.join('\n');
    }

    async function generateListWithGate(options = {}) {
        const gateUrl = options.gateUrl || DEFAULT_GATE_URL;
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('Generando lista completa (4,557 canales)…', 'info');
        }

        const generator = window.M3U8TypedArraysGenerator;
        const generateFn = generator && (generator.generate || generator.generateM3U8);
        if (typeof generateFn !== 'function') {
            throw new Error('M3U8TypedArraysGenerator.generate no disponible');
        }
        if (!window.app || typeof window.app.getFilteredChannels !== 'function') {
            throw new Error('window.app.getFilteredChannels() no disponible');
        }

        // ensureReady puede fallar si admitted.json no es servible (gate_server apagado);
        // NO debe abortar la generación. Sin admission, todos los canales usan URL original.
        try {
            await window.APEHealthRuntime.ensureReady(options);
        } catch (healthError) {
            console.warn('[APE-GATE] admitted.json no cargable — se genera sin admission:', healthError.message);
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('admitted.json no accesible. Arranca gate_server.py para URLs verificadas.', 'warning');
            }
        }
        const channels = window.app.getFilteredChannels() || [];

        // ═══ PARSER STACK ENRICHMENT (also for generateListWithGate path) ═══
        if (window.APEParserGenerationBridge && typeof window.APEParserGenerationBridge.enrichChannelsWithParserStack === 'function') {
            try { window.APEParserGenerationBridge.enrichChannelsWithParserStack(channels); } catch (_) { /* non-critical */ }
        }

        const labCfg = window.APE_PROFILES_CONFIG;
        const labLoaded = !!(labCfg && labCfg.labExportedAt);
        const isBulletproof = labCfg?.labBulletproof === true;
        const merged = {
            ...options,
            useAdmission: true,
            admissionUrl: options.admissionUrl || (window.APEHealthRuntime && window.APEHealthRuntime.config.admissionUrl),
            bulletproof_profiles: labCfg?.profiles || null,
            bulletproof_nivel1:   labCfg?.nivel1Directives || null,
            bulletproof_nivel3:   labCfg?.nivel3PerLayer || null,
            bulletproof_config_global: labCfg?.configGlobal || {},
            bulletproof_evasion_pool:  labCfg?.evasionPool || null,
            bulletproof_placeholders:  labCfg?.placeholdersMap || {},
            bulletproof_gap_plan:      labCfg?.omegaGapPlan || null,
            bulletproof_servers:       labCfg?.labServers || [],
            bulletproof_loaded:   labLoaded,
            is_bulletproof:       isBulletproof,
            bulletproof_meta: {
                schema_variant: labCfg?.labSchemaVariant || null,
                meta_per_profile: labCfg?.labMetaPerProfile || null
            },
            // LAB Trazability — para emitir #EXT-X-APE-LAB-* tags identificables en master playlist.
            // Doctrina SSOT: cualquier valor calibrado por el LAB tiene que ser auditable directo en la lista.
            lab_metadata: {
                lab_version:        labCfg?.labVersion || null,
                lab_schema_variant: labCfg?.labSchemaVariant || null,
                exported_at:        labCfg?.labExportedAt || null,
                bulletproof:        isBulletproof,
                labFileName:        labCfg?.labFileName || 'LAB_CALIBRATED'
            }
        };

        // Prefer streaming for large files (>500MB OOM fix)
        const hasStreaming = typeof generator.generateAndDownloadStreaming === 'function';

        let m3u8Text = null;
        if (hasStreaming) {
            // RUTA STREAMING: zero-copy a disco
            console.log('[APE-GATE] Usando generateAndDownloadStreaming (zero-copy)');
            merged.filename = options.filename || `APE_LISTA_${Date.now()}.m3u8`;
            const result = await generator.generateAndDownloadStreaming(channels, merged);
            if (!result) throw new Error('Generación cancelada o falló');
        } else {
            // RUTA LEGACY: Blob en RAM (riesgo OOM >500MB)
            const blob = await generateFn.call(generator, channels, merged);
            if (!blob) {
                throw new Error('generate retornó null (sin canales válidos)');
            }
            m3u8Text = await blob.text();

            const a = document.createElement('a');
            const objectUrl = URL.createObjectURL(blob);
            a.href = objectUrl;
            a.download = options.filename || `APE_LISTA_${Date.now()}.m3u8`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(objectUrl); a.remove(); }, 1000);
        }

        const gateAvailable = await probeGateServer(gateUrl);
        if (!gateAvailable) {
            const msg = `⚠ gate_server no responde en ${gateUrl}. Lanza:\n  python backend/health/gate_server.py`;
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast(msg, 'warning');
            } else {
                alert(msg);
            }
            return { m3u8Text, verdict: null, reason: 'gate_server_offline' };
        }

        // Audit solo posible si tenemos m3u8Text (ruta legacy)
        if (!m3u8Text) {
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('✅ Lista descargada (streaming). Gate audit requiere ruta legacy.', 'info');
            }
            return { m3u8Text: null, verdict: null, reason: 'streamed_no_text_for_audit' };
        }

        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('Auditando lista (muestreo 300 URLs)…', 'info');
        }

        let verdict = null;
        try {
            verdict = await auditM3U8Text(m3u8Text, options);
            const summary = renderVerdict(verdict);
            console.log('[APE-GATE]', verdict);
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast(summary, verdict.published ? 'success' : 'warning');
            } else {
                alert(summary);
            }
        } catch (err) {
            console.error('[APE-GATE] audit failed:', err);
            const msg = `Auditoría falló: ${err.message}`;
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast(msg, 'error');
            }
        }

        return { m3u8Text, verdict };
    }

    function attachHealthButton(buttonSelector = '[data-ape-health-check]') {
        const button = document.querySelector(buttonSelector);
        if (!button) return false;
        button.addEventListener('click', async () => {
            const originalText = button.textContent;
            try {
                button.disabled = true;
                button.textContent = 'Health-check…';
                const result = await refreshAdmission();
                button.textContent = `Health-check (${result.count})`;
            } catch (error) {
                console.error('[APE-GEN-CTRL] Error en health-check:', error);
                button.textContent = 'Health-check falló';
            } finally {
                button.disabled = false;
                setTimeout(() => { button.textContent = originalText; }, 2500);
            }
        });
        return true;
    }

    function attachAuditedButton(buttonSelector = '[data-ape-generate-audited]') {
        const button = document.querySelector(buttonSelector);
        if (!button) return false;
        button.addEventListener('click', async () => {
            const originalText = button.textContent;
            try {
                button.disabled = true;
                button.textContent = 'Generando + auditando…';
                await generateListWithGate();
                button.textContent = 'Auditoría lista ✓';
            } catch (error) {
                console.error('[APE-GEN-CTRL] Error en generateListWithGate:', error);
                button.textContent = 'Falló — ver consola';
            } finally {
                button.disabled = false;
                setTimeout(() => { button.textContent = originalText; }, 2500);
            }
        });
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎯 PREPUBLISH PIPELINE — Etapa 3 del plan "Integración sin /resolve/"
    // Flujo de 8 pasos del diagrama prepublish_pipeline_without_resolve:
    //   1. getFilteredChannels → 2. buildCandidatesForChannel → 3. canonicalize →
    //   4. POST /prepublish → 5-7. server evalúa (200+MIME+compat+policy) →
    //   8. filtrar admitted, generar m3u8, descargar, POST /gate con criterios extendidos
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Probe de salud del VPS (no del server local). Verifica que resolve_redirect.php
     * responde (usando una URL bait conocida). Cero dependencia de localhost.
     */
    async function probePrepublishServer(probeUrl = DEFAULT_VPS_PROBE_URL, timeoutMs = 4000) {
        try {
            const bait = 'http://example.com/';
            const url = `${probeUrl}?url=${encodeURIComponent(bait)}`;
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), timeoutMs);
            const resp = await fetch(url, { method: 'GET', signal: ctl.signal, cache: 'no-store' });
            clearTimeout(t);
            if (!resp.ok) return false;
            const data = await resp.json().catch(() => ({}));
            return typeof data.status !== 'undefined';
        } catch (_) {
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DYNAMIC ADMISSION HELPERS — 2026-04-17
    // Permiten que el Prepublish Pipeline funcione con CUALQUIER set de canales
    // sin depender de un admitted.json estático pre-generado.
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Calcula qué porcentaje de los canales actuales tienen match en admittedMap.
     */
    function _computeAdmissionCoverage(channels, runtime) {
        if (!runtime || !runtime.admittedMap || runtime.admittedMap.size === 0) {
            return { matched: 0, total: channels.length, ratio: 0 };
        }
        let matched = 0;
        for (const ch of channels) {
            const id = String(ch.stream_id || ch.id || ch.num || '').trim();
            if (id && runtime.admittedMap.has(`id:${id}`)) matched++;
        }
        return { matched, total: channels.length, ratio: channels.length > 0 ? matched / channels.length : 0 };
    }

    /**
     * Probing dinámico vía VPS: toma una muestra de canales, construye URLs de panel,
     * las prueba contra resolve_redirect.php, y las inyecta en admittedMap.
     * Las URL con status 200/302 y content-type HLS se marcan como Tier A.
     */
    async function _dynamicAdmissionProbe(channels, runtime, probeUrl, opts = {}) {
        const sampleSize = Math.min(opts.sampleSize || 200, channels.length);
        const concurrency = opts.concurrency || 20;

        // Muestreo aleatorio de canales
        const shuffled = [...channels].sort(() => Math.random() - 0.5);
        const sample = shuffled.slice(0, sampleSize);

        // Construir URLs de panel para cada canal muestreado.
        // Necesitamos las creds actuales del sistema.
        const creds = _getActiveCredentials();
        if (!creds || !creds.length) {
            console.warn('[DYNAMIC-PROBE] No se encontraron credenciales activas. Abortando probe.');
            return;
        }

        const tasks = [];
        for (const ch of sample) {
            const streamId = String(ch.stream_id || ch.id || ch.num || '').trim();
            if (!streamId) continue;
            // Construir URL Xtream panel para cada credential set
            for (const c of creds) {
                const url = `${c.baseUrl}/live/${c.username}/${c.password}/${streamId}.m3u8`;
                tasks.push({ streamId, channelName: ch.name || ch.tvg_name || '', url, cred: c });
                break; // 1 cred por canal es suficiente para probe
            }
        }

        // Worker pool paralelo
        let idx = 0;
        let done = 0;
        const total = tasks.length;
        const workers = Array(Math.min(concurrency, Math.max(1, total))).fill(null).map(async () => {
            while (true) {
                const i = idx++;
                if (i >= total) break;
                const task = tasks[i];
                try {
                    const url = `${probeUrl}?url=${encodeURIComponent(task.url)}`;
                    const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
                    const data = resp.ok ? await resp.json().catch(() => ({})) : {};
                    const status = typeof data.status === 'number' ? data.status : 0;

                    if (status === 200 || status === 302) {
                        // Inyectar en admittedMap como entrada dinámica
                        const finalUrl = data.location || task.url;
                        const host = String(finalUrl).replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
                        const entry = {
                            stream_id: task.streamId,
                            host: host,
                            url: finalUrl,
                            content_type: data.content_type || 'application/vnd.apple.mpegurl',
                            observedContentType: data.content_type || 'application/vnd.apple.mpegurl',
                            observedRole: 'playlist_hls',
                            publicationTier: 'A',
                            validatedAt: new Date().toISOString(),
                            followRedirectsUsed: !!(data.location && data.location !== task.url),
                            stabilityScore: 0,
                            latency_ms: 0,
                            source: 'dynamic_probe',
                            checked_at: new Date().toISOString(),
                            raw: data,
                        };
                        // Inyectar directamente en admittedMap
                        runtime.admittedMap.set(`id:${task.streamId}`, entry);
                        if (host) runtime.admittedMap.set(`host:${host}|${task.streamId}`, entry);
                        runtime.admittedMap.set(`url:${finalUrl}`, entry);
                    }
                } catch (_) { /* probe failed, channel stays Tier B */ }
                done++;
                if (opts.onProgress && (done % 25 === 0 || done === total)) {
                    try { opts.onProgress(done, total); } catch (_) {}
                }
            }
        });
        await Promise.all(workers);
        console.log(`[DYNAMIC-PROBE] Completado: ${done}/${total} URLs probadas. admittedMap.size=${runtime.admittedMap.size}`);
    }

    /**
     * Extrae las credenciales activas del sistema (conexiones IPTV configuradas).
     */
    function _getActiveCredentials() {
        const creds = [];
        // Intentar obtener desde window.app
        if (window.app && window.app.config && window.app.config.connections) {
            for (const conn of window.app.config.connections) {
                if (conn.url && conn.username && conn.password) {
                    const baseUrl = String(conn.url).replace(/\/+$/, '');
                    creds.push({ baseUrl, username: conn.username, password: conn.password });
                }
            }
        }
        // Intentar desde localStorage (formato ape_servers)
        if (creds.length === 0) {
            try {
                const stored = JSON.parse(localStorage.getItem('ape_servers') || '[]');
                for (const s of stored) {
                    if (s.url && s.username && s.password) {
                        creds.push({ baseUrl: String(s.url).replace(/\/+$/, ''), username: s.username, password: s.password });
                    }
                }
            } catch (_) {}
        }
        // Intentar desde window.apeServers
        if (creds.length === 0 && window.apeServers && Array.isArray(window.apeServers)) {
            for (const s of window.apeServers) {
                if (s.url && s.username && s.password) {
                    creds.push({ baseUrl: String(s.url).replace(/\/+$/, ''), username: s.username, password: s.password });
                }
            }
        }
        return creds;
    }

    /**
     * Batch de probes vía VPS resolve_redirect.php. Trabajador paralelo en JS.
     * Para cada variante de cada canal, hace GET al endpoint del VPS y clasifica.
     * Agrupa por canal, selecciona mejor variante, retorna schema contrato
     * {admitted[], rejected[], stats{}} compatible con el Python de gate_server.
     *
     * Esto reemplaza la llamada a localhost:8766/prepublish → CERO pantalla negra,
     * CERO dependencia de .bat, CERO server local.
     */
    async function callPrepublish(candidates, options = {}, probeUrl = DEFAULT_VPS_PROBE_URL) {
        const concurrency = options.concurrency || 20;
        const priorityChain = options.priority_chain || ['playlist_hls', 'segment_ts', 'playlist_dash', 'segment_cmaf'];
        const t0 = Date.now();

        // Flatten: cada variante es una tarea de probe independiente
        const tasks = [];
        for (const cand of candidates) {
            for (const v of (cand.variants || [])) {
                tasks.push({
                    channel_id: String(cand.channel_id),
                    channel_name: cand.channel_name || '',
                    variant: v,
                });
            }
        }

        const probes = new Array(tasks.length);
        let idx = 0;
        let done = 0;

        const progressCb = options.onProgress;
        const total = tasks.length;

        const workers = Array(Math.min(concurrency, Math.max(1, tasks.length))).fill(null).map(async () => {
            while (true) {
                const i = idx++;
                if (i >= tasks.length) break;
                const task = tasks[i];
                try {
                    const url = `${probeUrl}?url=${encodeURIComponent(task.variant.url)}`;
                    const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
                    const data = resp.ok ? await resp.json().catch(() => ({})) : {};
                    const status = typeof data.status === 'number' ? data.status : 0;
                    probes[i] = {
                        ...task,
                        status,
                        final_url: data.location || task.variant.url,
                        admitted: (status === 200 || status === 302),
                    };
                } catch (err) {
                    probes[i] = { ...task, status: 0, admitted: false, error: (err && err.message) || 'fetch_failed' };
                }
                done++;
                if (progressCb && (done % 25 === 0 || done === total)) {
                    try { progressCb(done, total); } catch (_) { /* ignore */ }
                }
            }
        });
        await Promise.all(workers);

        // Agrupar por canal, seleccionar mejor variante según priority_chain
        const byChannel = new Map();
        for (const p of probes) {
            if (!byChannel.has(p.channel_id)) byChannel.set(p.channel_id, []);
            byChannel.get(p.channel_id).push(p);
        }

        const admitted = [];
        const rejected = [];
        for (const [cid, list] of byChannel) {
            const sane = list.filter(p => p.admitted);
            const sortKey = (p) => {
                const role = p.variant.expected_role || 'unknown';
                const rIdx = priorityChain.indexOf(role);
                const profNum = parseInt(String(p.variant.profile || 'P9').replace(/^P/i, ''), 10) || 99;
                return [(rIdx < 0 ? 99 : rIdx), profNum];
            };
            if (sane.length > 0) {
                sane.sort((a, b) => {
                    const ka = sortKey(a), kb = sortKey(b);
                    return ka[0] - kb[0] || ka[1] - kb[1];
                });
                const best = sane[0];
                admitted.push({
                    channel_id: cid,
                    channel_name: best.channel_name,
                    chosen_url: best.variant.url,
                    chosen_profile: best.variant.profile,
                    chosen_role: best.variant.expected_role || 'playlist_hls',
                    status: best.status,
                });
            } else {
                rejected.push({
                    channel_id: cid,
                    channel_name: list[0] ? list[0].channel_name : '',
                    reason: 'all_variants_failed',
                    variant_outcomes: list.map(p => ({
                        profile: p.variant.profile, url: p.variant.url, status: p.status,
                    })),
                });
            }
        }

        return {
            admitted, rejected,
            stats: {
                candidates_total: candidates.length,
                admitted_count: admitted.length,
                rejected_count: rejected.length,
                elapsed_ms: Date.now() - t0,
                concurrency,
                priority_chain: priorityChain,
                mode: 'vps_resolve_redirect',
            }
        };
    }

    /**
     * Cálculo de gate local (JS puro) a partir de los probes del prepublish.
     * Reemplaza el POST a /gate del server Python. Aplica los criterios del plan
     * "Criterios de aceptación": 200>99%, 407<1%, 405=0, hls_real>=90%.
     */
    function computeGateVerdict(prepublishResult, thresholds = {}) {
        const th = {
            min_200: thresholds.min_200 ?? 0.99,
            max_405: thresholds.max_405 ?? 0,
            max_407_ratio: thresholds.max_407_ratio ?? 0.01,
            min_hls: thresholds.min_hls ?? 0.90,
        };
        const all = [...(prepublishResult.admitted || []).map(a => ({status: a.status, role: a.chosen_role}))];
        for (const r of (prepublishResult.rejected || [])) {
            for (const v of (r.variant_outcomes || [])) all.push({status: v.status, role: 'unknown'});
        }
        const n = all.length || 1;
        const count200 = all.filter(x => x.status === 200 || x.status === 302).length;
        const count405 = all.filter(x => x.status === 405).length;
        const count407 = all.filter(x => x.status === 407).length;
        const countHls = (prepublishResult.admitted || []).filter(a => a.chosen_role === 'playlist_hls').length;
        const ok200_ratio = count200 / n;
        const bad407_ratio = count407 / n;
        const hls_ratio = countHls / ((prepublishResult.admitted || []).length || 1);

        const reasons = [];
        if (count405 > th.max_405) reasons.push(`bad405_count=${count405}>${th.max_405}`);
        if (ok200_ratio < th.min_200) reasons.push(`ok200_ratio=${ok200_ratio.toFixed(4)}<${th.min_200}`);
        if (bad407_ratio > th.max_407_ratio) reasons.push(`bad407_ratio=${bad407_ratio.toFixed(4)}>${th.max_407_ratio}`);
        if (hls_ratio < th.min_hls) reasons.push(`hls_ratio=${hls_ratio.toFixed(4)}<${th.min_hls}`);

        const decision = reasons.length === 0 ? 'publish' : (count405 > 0 ? 'block' : 'reclassify');
        return {
            total_urls: n,
            sample_size: n,
            ok200_ratio, bad405_count: count405, bad407_count: count407, bad407_ratio, hls_ratio,
            thresholds: th, published: decision === 'publish',
            decision, decision_reasons: reasons.length ? reasons : ['all_thresholds_met'],
            checked_at: new Date().toISOString(),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [APE-DUAL 2026-10-24] Salida dual: DIRECTA + CDN desde UNA sola pasada.
    // · A (_DIRECTA.m3u8): URLs del proveedor — doctrina vigente, cero dependencia.
    // · B (_CDN.m3u8):      URLs envueltas /cdn/<host>/… → pasan por el plano VPS
    //                       (4K/8K declarado, LL-HLS, failover multi-CDN, QoE).
    // Se usa ReadableStream.tee(): el generador NO se toca ni se ejecuta dos veces.
    // ═══════════════════════════════════════════════════════════════════════

    // TransformStream línea a línea sobre chunks Uint8Array (LF interno).
    function _makeLineTransform(fn) {
        var buf = '';
        var dec = new TextDecoder();
        var enc = new TextEncoder();
        return new TransformStream({
            transform: function (chunk, ctrl) {
                buf += dec.decode(chunk, { stream: true });
                var i;
                while ((i = buf.indexOf('\n')) >= 0) {
                    var line = buf.slice(0, i);
                    buf = buf.slice(i + 1);
                    ctrl.enqueue(enc.encode(fn(line) + '\n'));
                }
            },
            flush: function (ctrl) {
                if (buf.length) ctrl.enqueue(enc.encode(fn(buf)));
            }
        });
    }

    // Bloque INERTE de trazabilidad del plano (RFC 8216 §6.3.1: tags desconocidos
    // se ignoran). NO altera ningún tag existente ni el bitstream: solo documenta
    // dentro de la lista qué hace el plano /cdn/ con ella.
    function _cdnPlaneBlock() {
        var st = (typeof window.apeCdnInfo === 'function') ? window.apeCdnInfo() : {};
        var lab = (typeof window.apeLabStatus === 'function') ? window.apeLabStatus() : {};
        var base = String(st.base || 'https://iptv-ape.duckdns.org').replace(/\/+$/, '');
        return [
            '#EXT-X-APE-CDN-PLANE:v4',
            '#EXT-X-APE-CDN-BASE:' + base + '/cdn/',
            '#EXT-X-APE-CDN-FAILOVER:allowlist+circuit-breaker-15s',
            '#EXT-X-APE-CDN-302:follow-to-final-origin',
            '#EXT-X-APE-CDN-LLHLS:passthrough+server-control',
            '#EXT-X-APE-CDN-UHD:auto(4k|8k)-codecs-truthful',
            '#EXT-X-APE-CDN-QOE:/_ape/qoe',
            '#EXT-X-APE-CDN-LAB:' + (lab.labVersion || 'n/a') +
                '|profiles=' + ((lab.profiles || []).length) +
                '|bulletproof=' + (lab.bulletproof === true)
        ].join('\n') + '\n';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Destino de guardado con FALLBACK REAL (bug medido en producción):
    // `showSaveFilePicker` exige "user gesture". El pipeline hace antes el
    // Pre-Publish (parser stack + admission + dynamic probe de 200 URLs), así
    // que al llegar aquí el gesto ya caducó y el picker LANZA:
    //   "Must be handling a user gesture to show a file picker."
    // Sin fallback, la lista CDN no se escribiría nunca. Con fallback se usa
    // el mismo camino que la lista normal: chunked-blob + <a download>.
    // Devuelve { kind:'fs', writable } | { kind:'blob', chunks, name }
    // ═══════════════════════════════════════════════════════════════════════
    async function _apeSaveTarget(suggestedName) {
        var types = [{ description: 'M3U8 Playlist', accept: { 'application/x-mpegURL': ['.m3u8'] } }];
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                var h = await window.showSaveFilePicker({ suggestedName: suggestedName, types: types });
                return { kind: 'fs', handle: h, name: h.name, writable: await h.createWritable() };
            } catch (e) {
                console.warn('[APE-CDN] picker no disponible (' + e.message + ') → fallback chunked-blob');
            }
        }
        return { kind: 'blob', chunks: [], name: suggestedName };
    }

    function _apeFinishBlobTarget(target) {
        if (!target || target.kind !== 'blob') return null;
        var blob = new Blob(target.chunks, { type: 'application/x-mpegURL' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = target.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
        return { bytes: blob.size, mode: 'BLOB' };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [APE-CDN 2026-10-24] Salida ÚNICA: la lista MEJORADA (a través del VPS).
    // · Misma fuente que la lista normal (generateStream) → mismo contenido.
    // · Solo se reescriben las líneas ^https?:// (byte-exacto, LF/CRLF intacto)
    //   y se inyecta el bloque inerte #EXT-X-APE-CDN-* antes del primer #EXTINF.
    // · Guarda con picker o, si no hay gesto de usuario, chunked-blob.
    // La lista clásica (URLs directas) sigue disponible con el botón GENERAR.
    // ═══════════════════════════════════════════════════════════════════════
    // Abre el destino INMEDIATAMENTE (gesto de usuario fresco).
    // Debe llamarse como primera operación asíncrona del clic: si se espera a
    // que termine el Pre-Publish, Chrome ya no considera que hay "user gesture"
    // y `showSaveFilePicker` lanza NotAllowedError (verificado en producción).
    // Devuelve { kind:'fs'|'blob'|'cancel', ... }
    async function _apeOpenTargetNow(name) {
        var types = [{ description: 'M3U8 Playlist mejorada', accept: { 'application/x-mpegURL': ['.m3u8'] } }];
        if (typeof window.showSaveFilePicker !== 'function') {
            return { kind: 'blob', chunks: [], name: name, reason: 'no-fsaa' };
        }
        try {
            var h = await window.showSaveFilePicker({ suggestedName: name, types: types });
            return { kind: 'fs', handle: h, name: h.name, writable: await h.createWritable() };
        } catch (e) {
            if (e && e.name === 'AbortError') {
                return { kind: 'cancel', name: name };   // el usuario cerró el diálogo
            }
            console.warn('[APE-CDN] picker no disponible (' + (e && e.message) + ') → se usará blob al final');
            return { kind: 'blob', chunks: [], name: name, reason: e && e.name };
        }
    }

    async function _cdnOnlyWrite(channels, merged, options = {}) {
        var gen = window.M3U8TypedArraysGenerator;
        var stamp = (options.filename || ('APE_LISTA_' + Date.now() + '.m3u8')).replace(/\.m3u8$/i, '');

        if (typeof window.apeCdnRewrap !== 'function') {
            throw new Error('apeCdnRewrap no cargado (ape-cdn-rewrap.js)');
        }
        if (typeof window.apeLineTransform !== 'function') {
            throw new Error('apeLineTransform no cargado (ape-line-transform.js)');
        }
        if (typeof gen.generateStream !== 'function') {
            throw new Error('M3U8TypedArraysGenerator.generateStream no disponible');
        }

        // Destino: el abierto al hacer CLIC (gesto válido) o, si no lo hay,
        // picker tardío → blob. Nunca aborta por falta de gesto.
        var target = options.preTarget;
        if (!target) target = await _apeSaveTarget(stamp + '_CDN.m3u8');

        var sink = (target.kind === 'fs')
            ? target.writable
            : new WritableStream({ write: function (c) { target.chunks.push(c); } });

        var stats = { lines: 0, urls: 0, wrapped: 0, skipped: 0 };
        var lineFn = function (line) {
            stats.lines++;
            var t = line.trim();
            if (!/^https?:\/\//i.test(t)) return line;
            stats.urls++;
            var out = window.apeCdnRewrap(line);
            if (out !== line) stats.wrapped++; else stats.skipped++;
            return out;
        };

        var source = gen.generateStream(channels, merged);
        await source
            .pipeThrough(window.apeLineTransform(lineFn, { block: _cdnPlaneBlock() }))
            .pipeTo(sink);

        var saved = (target.kind === 'fs')
            ? { mode: 'FSAA', filename: target.name }
            : { mode: 'BLOB', filename: target.name, bytes: _apeFinishBlobTarget({ kind: 'blob', chunks: target.chunks, name: target.name }).bytes };

        console.log('%c[APE-CDN] lista MEJORADA generada', 'color:#22d3ee;font-weight:bold;', {
            archivo: saved.filename, modo: saved.mode,
            canales: channels.length,
            urls: stats.urls, cableadas: stats.wrapped, sin_cablear: stats.skipped
        });

        return {
            mode: 'CDN_ONLY',
            filename: saved.filename,
            saveMode: saved.mode,
            channels: channels.length,
            stats: stats
        };
    }

    async function _dualWrite(channels, merged, options = {}) {
        var gen = window.M3U8TypedArraysGenerator;
        var stamp = (options.filename || ('APE_LISTA_' + Date.now() + '.m3u8')).replace(/\.m3u8$/i, '');

        if (typeof window.apeCdnRewrap !== 'function') {
            throw new Error('apeCdnRewrap no cargado (ape-cdn-rewrap.js)');
        }
        if (typeof gen.generateStream !== 'function') {
            throw new Error('M3U8TypedArraysGenerator.generateStream no disponible');
        }

        // AMBOS destinos con el mismo fallback que la ruta CDN (sin abortar por gesto)
        var targetA = await _apeSaveTarget(stamp + '_DIRECTA.m3u8');
        var targetB = await _apeSaveTarget(stamp + '_CDN.m3u8');

        var sinkA = (targetA.kind === 'fs')
            ? targetA.writable
            : new WritableStream({ write: function (c) { targetA.chunks.push(c); } });
        var sinkB = (targetB.kind === 'fs')
            ? targetB.writable
            : new WritableStream({ write: function (c) { targetB.chunks.push(c); } });

        // Una sola generación → tee() a los dos destinos
        var source = gen.generateStream(channels, merged);
        var branches = source.tee();

        var stats = { lines: 0, urls: 0, wrapped: 0, skipped: 0 };

        var lineFn = function (line) {
            stats.lines++;
            var t = line.trim();
            if (!/^https?:\/\//i.test(t)) return line;
            stats.urls++;
            var out = window.apeCdnRewrap(line);
            if (out !== line) stats.wrapped++; else stats.skipped++;
            return out;
        };

        await Promise.all([
            branches[0].pipeTo(sinkA),
            branches[1]
                .pipeThrough(
                    (typeof window.apeLineTransform === 'function')
                        ? window.apeLineTransform(lineFn, { block: _cdnPlaneBlock() })
                        : _makeLineTransform(lineFn)
                )
                .pipeTo(sinkB)
        ]);

        if (targetA.kind === 'blob') _apeFinishBlobTarget(targetA);
        if (targetB.kind === 'blob') _apeFinishBlobTarget(targetB);

        console.log('%c[APE-DUAL] listas generadas', 'color:#22d3ee;font-weight:bold;', {
            directa: targetA.name, cdn: targetB.name, canales: channels.length,
            urls: stats.urls, cableadas: stats.wrapped, sin_cablear: stats.skipped
        });

        return {
            mode: 'DUAL',
            filenameA: targetA.name,
            filenameB: targetB.name,
            channels: channels.length,
            stats: stats
        };
    }

    async function prepublishAndGenerate(options = {}) {        if (!window.app || typeof window.app.getFilteredChannels !== 'function') {
            throw new Error('window.app.getFilteredChannels no disponible');
        }
        const gen = window.M3U8TypedArraysGenerator;
        if (!gen) {
            throw new Error('M3U8TypedArraysGenerator no disponible — recarga el HTML');
        }
        // Preferir streaming (zero-copy) sobre generate+blob (OOM para archivos >500MB)
        const hasStreaming = typeof gen.generateAndDownloadStreaming === 'function';
        const hasGenerate = typeof gen.generate === 'function';
        if (!hasStreaming && !hasGenerate) {
            throw new Error('M3U8TypedArraysGenerator: ni streaming ni generate disponibles');
        }

        const prepublishUrl = options.prepublishUrl || DEFAULT_PREPUBLISH_URL;

        // DOCTRINA "GENERAR-PRIMERO": el click del botón SIEMPRE descarga la lista,
        // con o sin server de audit. El server es opcional (solo añade reporte post).
        // Las URLs del .m3u8 son SIEMPRE directas al upstream (profileTransport='clean')
        // — CERO dependencia de duckdns/resolve en la lista publicada.

        // PASO 1 — canales filtrados
        const channels = window.app.getFilteredChannels() || [];
        if (channels.length === 0) throw new Error('0 canales filtrados');

        if (window.app.showToast) window.app.showToast(`Generando lista con ${channels.length} canales…`, 'info');

        // PASO 1.5 — PARSER STACK ENRICHMENT (26 parsers → evidence per channel)
        // Decora cada canal con _apeCanonical, _apeXtream, _apeCodecParsed, _apeHevcParsed, _apeHdrParsed, _apeHeadersClean.
        // NO modifica propiedades existentes del canal — solo agrega underscore-prefixed.
        // Si el bridge no está cargado, la generación continúa sin enrichment (COVERAGE ALWAYS).
        if (window.APEParserGenerationBridge && typeof window.APEParserGenerationBridge.enrichChannelsWithParserStack === 'function') {
            try {
                const bridgeResult = window.APEParserGenerationBridge.enrichChannelsWithParserStack(channels);
                if (window.app.showToast && bridgeResult.enriched > 0) {
                    window.app.showToast(`🔬 Parser Stack: ${bridgeResult.enriched} canales enriquecidos (HEVC: ${bridgeResult.hevcDetected || 0}, Toxic blocked: ${bridgeResult.toxicHeadersBlocked || 0})`, 'success');
                }
            } catch (bridgeErr) {
                console.warn('[APE-PREPUBLISH] Parser bridge enrichment failed (non-critical):', bridgeErr.message);
            }
        }

        // PASO 2 — cargar admission map (URLs verificadas por health_checker)
        try { await window.APEHealthRuntime.ensureReady(options); } catch (_) { /* graceful, no crítico */ }

        // PASO 2.5 — DYNAMIC ADMISSION: si admitted.json está vacío o no cubre los canales actuales,
        // probar URLs en vivo vía VPS y poblar admittedMap dinámicamente.
        const runtime = window.APEHealthRuntime;
        const admittedCount = runtime ? runtime.admittedMap.size : 0;
        const channelCoverage = _computeAdmissionCoverage(channels, runtime);
        console.log(`[APE-PREPUBLISH] Cobertura admitted: ${channelCoverage.matched}/${channelCoverage.total} (${(channelCoverage.ratio * 100).toFixed(1)}%)`);

        if (channelCoverage.ratio < 0.50) {
            console.log(`[APE-PREPUBLISH] Cobertura < 50% → activando Dynamic Admission Probing via VPS...`);
            if (window.app.showToast) window.app.showToast(`Cobertura ${(channelCoverage.ratio * 100).toFixed(0)}% → Probing dinámico de ${Math.min(200, channels.length)} URLs vía VPS…`, 'info');

            const vpsReachable = await probePrepublishServer(prepublishUrl);
            if (vpsReachable) {
                await _dynamicAdmissionProbe(channels, runtime, prepublishUrl, {
                    sampleSize: options.dynamicProbeSample || 200,
                    concurrency: options.concurrency || 20,
                    onProgress: (done, total) => {
                        if (window.app.showToast && done % 50 === 0) {
                            window.app.showToast(`Probing: ${done}/${total} URLs...`, 'info');
                        }
                    }
                });
                const newCoverage = _computeAdmissionCoverage(channels, runtime);
                console.log(`[APE-PREPUBLISH] Post-probe cobertura: ${newCoverage.matched}/${newCoverage.total} (${(newCoverage.ratio * 100).toFixed(1)}%)`);
                if (window.app.showToast) window.app.showToast(`Dynamic Probe OK: ${newCoverage.matched} canales admitidos (${(newCoverage.ratio * 100).toFixed(0)}%)`, 'success');
            } else {
                console.warn('[APE-PREPUBLISH] VPS no alcanzable → generando sin admission dinámica');
                if (window.app.showToast) window.app.showToast('⚠ VPS no disponible para probe dinámico. Usando panel directo.', 'warning');
            }
        }

        // PASO 3 — GENERAR y DESCARGAR la lista
        // ═══════════════════════════════════════════════════════════════════════
        // STREAM-TO-DISK FIX: Para listas >500MB, gen.generate() materializa
        // todo en un Blob en RAM (805MB) + blob.text() (otro 805MB) + new Blob
        // (otro 805MB) = ~3.2GB → Chrome OOM → 0 bytes.
        // Solución: usar generateAndDownloadStreaming() que escribe directo a disco
        // via showSaveFilePicker (zero-copy, ~50MB RAM constante).
        // ═══════════════════════════════════════════════════════════════════════
        const labCfg = window.APE_PROFILES_CONFIG;
        const labLoaded = !!(labCfg && labCfg.labExportedAt);

        // FAIL-LOUD: si el LAB no está cargado o profiles vacío, abortar antes de generar
        // con defaults silenciosos. Doctrine: single-source — no fallback silent al hardcoded.
        if (!labLoaded || !labCfg.profiles || Object.keys(labCfg.profiles).length === 0) {
            const reason = !labLoaded ? 'LAB JSON no importado (labExportedAt vacío)' : 'profiles vacío en APE_PROFILES_CONFIG';
            const msg = `❌ Generación abortada: ${reason}. Importa primero el LAB_CALIBRATED_*.json.\n` +
                `Atajo: en la consola ejecuta  await apeImportLabLocal()  (carga la DNA del servidor local) y vuelve a pulsar el botón.`;
            console.error('[APE-PREPUBLISH]', msg);
            if (window.app?.showToast) window.app.showToast(msg, 'error');
            else alert(msg);
            throw new Error(msg);
        }

        // T1-T5 fix: pasar TODA la calibración del LAB al generador (no solo profiles+nivel1+nivel3).
        // Sin esto, el generador no resuelve {config.X}/{evasion.X}/{server.X} ni inyecta gap_plan.
        // Match exacto con el payload de generateListWithGate para SSOT consistency.
        const isBulletproof = labCfg?.labBulletproof === true;
        const merged = {
            ...options,
            useAdmission: true,
            admissionUrl: options.admissionUrl || (window.APEHealthRuntime && window.APEHealthRuntime.config.admissionUrl),
            bulletproof_profiles: labCfg.profiles,
            bulletproof_nivel1:   labCfg.nivel1Directives || [],
            bulletproof_nivel3:   labCfg.nivel3PerLayer || {},
            bulletproof_config_global: labCfg.configGlobal || {},
            bulletproof_evasion_pool:  labCfg.evasionPool || null,
            bulletproof_placeholders:  labCfg.placeholdersMap || {},
            bulletproof_gap_plan:      labCfg.omegaGapPlan || null,
            bulletproof_servers:       labCfg.labServers || [],
            bulletproof_loaded:   true,
            is_bulletproof:       isBulletproof,
            bulletproof_meta: {
                schema_variant:   labCfg.labSchemaVariant || null,
                meta_per_profile: labCfg.labMetaPerProfile || null
            },
            lab_metadata: {
                lab_version:        labCfg.labVersion || null,
                lab_schema_variant: labCfg.labSchemaVariant || null,
                exported_at:        labCfg.labExportedAt || null,
                bulletproof:        isBulletproof,
                labFileName:        labCfg.labFileName || 'LAB_CALIBRATED'
            }
        };

        let downloadResult = null;
        // dual: 'cdn' (por defecto, SOLO la mejorada) | 'both' (las dos) | false
        const dualMode = options.dual || false;
        const canStream = typeof gen.generateStream === 'function'
            && typeof window.showSaveFilePicker === 'function';
        const useDual = dualMode !== false && canStream;

        if (useDual && dualMode === 'both') {
            // RUTA DUAL: una pasada, dos archivos (_DIRECTA + _CDN)
            console.log('[APE-PREPUBLISH] RUTA DUAL: generando lista DIRECTA y lista CDN en una sola pasada');
            downloadResult = await _dualWrite(channels, merged, options);
            if (window.app.showToast) window.app.showToast(
                `✅ 2 listas: DIRECTA (proveedor) + CDN (${downloadResult.stats.wrapped} URLs por el VPS, ` +
                `${downloadResult.stats.skipped} fuera de allowlist)`,
                'success'
            );
        } else if (useDual) {
            // RUTA CDN: SOLO la lista mejorada (a través del plano del VPS)
            console.log('[APE-PREPUBLISH] RUTA CDN: generando SOLO la lista mejorada');
            downloadResult = await _cdnOnlyWrite(channels, merged, options);
            if (window.app.showToast) window.app.showToast(
                `✅ Lista MEJORADA: ${channels.length} canales · ${downloadResult.stats.wrapped} URLs por el VPS` +
                (downloadResult.stats.skipped ? ` · ${downloadResult.stats.skipped} fuera de allowlist` : ''),
                'success'
            );
        } else if (hasStreaming) {
            // RUTA STREAMING: zero-copy a disco, sin Blob en RAM
            console.log('[APE-PREPUBLISH] Usando generateAndDownloadStreaming (zero-copy)');
            merged.filename = options.filename || `APE_LISTA_${Date.now()}.m3u8`;
            downloadResult = await gen.generateAndDownloadStreaming(channels, merged);
            if (!downloadResult) {
                // User cancelled showSaveFilePicker or error
                if (window.app.showToast) window.app.showToast('Generación cancelada.', 'warning');
                return { decision: 'cancelled', channels: channels.length };
            }
            if (window.app.showToast) window.app.showToast(
                `✅ Lista descargada: ${channels.length} canales (${downloadResult.mode}). URLs directas al upstream.`,
                'success'
            );
        } else {
            // RUTA LEGACY: Blob en RAM (solo funciona para listas <500MB)
            console.warn('[APE-PREPUBLISH] Fallback a gen.generate() — riesgo de OOM para listas >500MB');
            const blob = await gen.generate(channels, merged);
            if (!blob) throw new Error('generate() devolvió null');

            const a = document.createElement('a');
            const objUrl = URL.createObjectURL(blob);
            a.href = objUrl;
            a.download = options.filename || `APE_LISTA_${Date.now()}.m3u8`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(objUrl); a.remove(); }, 1000);

            if (window.app.showToast) window.app.showToast(
                `✅ Lista descargada: ${channels.length} canales. URLs directas al upstream.`,
                'success'
            );
            downloadResult = { mode: 'LEGACY_BLOB', channels: channels.length };
        }

        // PASO 4 — AUDIT vía VPS (resolve_redirect.php). Cero server local.
        // ═══════════════════════════════════════════════════════════════════════
        // FIX: NO parsear el m3u8 completo (805MB string en RAM).
        // En su lugar, construir URLs de muestra directamente desde los canales
        // (que ya están en memoria como objetos JS ligeros).
        // ═══════════════════════════════════════════════════════════════════════
        const vpsOk = await probePrepublishServer(prepublishUrl);
        if (!vpsOk) {
            console.log('[APE-PREPUBLISH] VPS probe endpoint no responde — skip audit (lista ya descargada).');
            if (window.app.showToast) window.app.showToast(`⚠ Audit VPS no disponible. Lista descargada OK.`, 'warning');
            return { decision: 'generated_no_audit', channels: channels.length, downloadResult };
        }

        // Construir URLs de audit directamente desde los canales (sin parsear m3u8)
        const creds = _getActiveCredentials();
        const auditUrls = [];
        for (const ch of channels) {
            const streamId = String(ch.stream_id || ch.id || ch.num || '').trim();
            if (!streamId) continue;
            let url = ch.url || ch.direct_source || ch.stream_url || '';
            if (!url && creds.length > 0) {
                const c = creds[0];
                url = `${c.baseUrl}/live/${c.username}/${c.password}/${streamId}.m3u8`;
            }
            if (url) auditUrls.push(url);
        }

        // Muestra aleatoria (100 URLs o todas si menos)
        const sampleSize = Math.min(options.auditSample || 100, auditUrls.length);
        const sample = auditUrls.length <= sampleSize
            ? auditUrls
            : auditUrls.sort(() => Math.random() - 0.5).slice(0, sampleSize);

        if (window.app.showToast) window.app.showToast(`Auditando ${sample.length} URLs via VPS…`, 'info');

        // Construimos pseudo-candidates para reusar callPrepublish (batch paralelo al VPS)
        const pseudoCandidates = sample.map((u, i) => ({
            channel_id: `audit_${i}`,
            channel_name: '',
            variants: [{ url: u, profile: 'P1', expected_role: 'playlist_hls' }]
        }));
        const probeResult = await callPrepublish(pseudoCandidates, options, prepublishUrl);

        // Gate local en JS desde los probes del audit
        const verdict = computeGateVerdict(probeResult);

        const decision = verdict.decision;
        const summary =
            `Audit VPS: ${(verdict.ok200_ratio * 100).toFixed(1)}% 200 en muestra de ${verdict.sample_size}.\n` +
            `407=${verdict.bad407_count}  405=${verdict.bad405_count}  HLS=${(verdict.hls_ratio * 100).toFixed(1)}%\n` +
            `Decisión: ${decision.toUpperCase()}`;
        const level = decision === 'publish' ? 'success' : (decision === 'block' ? 'error' : 'warning');
        if (window.app.showToast) window.app.showToast(summary, level);
        else alert(summary);

        return {
            audit: { sample: verdict, elapsed_ms: probeResult.stats.elapsed_ms },
            decision,
            channels: channels.length,
            downloadResult
        };
    }

    // ── [APE-CDN] entrada pública del botón: SOLO la lista mejorada ─────────
    // IMPORTANTE: el destino se elige AQUÍ, como primera operación asíncrona del
    // clic, para conservar el "user gesture" que exige showSaveFilePicker.
    // Si el usuario cancela el diálogo → no se genera nada (no se pierden 2 min).
    async function prepublishAndGenerateDual(options = {}) {
        var stamp = 'APE_LISTA_' + Date.now();
        var pre = await _apeOpenTargetNow(stamp + '_CDN.m3u8');

        if (pre && pre.kind === 'cancel') {
            console.log('[APE-CDN] el usuario canceló el destino → generación abortada sin trabajo');
            if (window.app && window.app.showToast) window.app.showToast('Generación cancelada (no se eligió archivo).', 'warning');
            return { decision: 'cancelled_by_user', channels: 0 };
        }

        try {
            return await prepublishAndGenerate(Object.assign({}, options, {
                dual: 'cdn',
                filename: stamp + '.m3u8',
                preTarget: pre
            }));
        } catch (e) {
            // Si el pipeline aborta (LAB ausente, 0 canales, etc.) el archivo ya
            // elegido se queda a medio abrir: hay que abortarlo para no dejar un
            // 0-byte bloqueado ni un writable colgando.
            if (pre && pre.kind === 'fs' && pre.writable) {
                try { await pre.writable.abort(); } catch (_) { /* ya cerrado */ }
                console.warn('[APE-CDN] destino liberado tras aborto (no se creó archivo vacío)');
            }
            throw e;
        }
    }

    function attachPrepublishButton(buttonSelector = '[data-ape-prepublish]') {        const button = document.querySelector(buttonSelector);
        if (!button) return false;
        button.addEventListener('click', async () => {
            const orig = button.textContent;
            try {
                button.disabled = true;
                button.textContent = 'Prepublish + Gate…';
                await prepublishAndGenerate();
                button.textContent = 'Pipeline ✓';
            } catch (e) {
                console.error('[APE-PREPUBLISH]', e);
                button.textContent = 'Falló — ver consola';
            } finally {
                button.disabled = false;
                setTimeout(() => { button.textContent = orig; }, 3000);
            }
        });
        return true;
    }

    window.APEGenerationController = {
        refreshAdmission,
        generateHealthyList,
        generateListWithGate,
        auditM3U8Text,
        probeGateServer,
        renderVerdict,
        attachHealthButton,
        attachAuditedButton,
        DEFAULT_GATE_URL,
        // Etapa 3 del plan "Integración sin /resolve/"
        prepublishAndGenerate,
        // [APE-DUAL 2026-10-24] misma pasada → 2 archivos (_DIRECTA + _CDN)
        prepublishAndGenerateDual,
        probePrepublishServer,
        callPrepublish,
        attachPrepublishButton,
        DEFAULT_PREPUBLISH_URL
    };
})();
