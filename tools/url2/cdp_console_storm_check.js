#!/usr/bin/env node
'use strict';
/**
 * cdp_console_storm_check.js — mide en CHROME REAL si la consola sigue en tormenta
 * ═══════════════════════════════════════════════════════════════════════════════
 * Reproduce el escenario del bug (2026-11-06): recarga de la UI con estado de
 * persistencia guardado (ape_ui_state_v1) que incluye los controles del Gestor
 * de Perfiles. Antes del fix eso disparaba el ciclo
 *   restaurar → input/change → updateSetting → motor reactivo → render →
 *   MutationObserver → restaurar → …
 * y la consola emitía cientos de líneas por segundo con valores derivando a
 * negativos.
 *
 * Qué hace:
 *   1. Lanza Chrome headless con CDP.
 *   2. Siembra localStorage['ape_ui_state_v1'] ANTES de que corran los scripts.
 *   3. Recarga y captura Runtime.consoleAPICalled + Log.entryAdded durante N s.
 *   4. Agrupa mensajes por "firma" (texto sin números) y calcula el máximo de
 *      repeticiones y la tasa por segundo.
 *   5. Sondea la convergencia: aplica el estado 5 veces con force y comprueba
 *      que NO se disparan renders en cascada.
 *
 * Uso:
 *   node tools/url2/cdp_console_storm_check.js [url] [segundos]
 *   CHROME_PATH=... para otra ruta de Chrome.
 *
 * Umbrales (PASS):  máx. repeticiones de una misma firma <= 5  Y  tasa <= 15 ev/s
 * ═══════════════════════════════════════════════════════════════════════════════
 */
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html';
const SECONDS = Number(process.argv[3] || 12);
const MAX_REPEAT = 5;
const MAX_RATE = 15;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPort(start) {
    for (let p = start; p < start + 12; p++) {
        try {
            const r = await fetch(`http://127.0.0.1:${p}/json/version`, { signal: AbortSignal.timeout(600) });
            if (r.ok) return -p;      // ya ocupado
        } catch { return p; }         // libre
    }
    return start;
}

function sig(text) {
    return String(text)
        .replace(/\d+([.,]\d+)?/g, '#')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);
}

function describeArg(a) {
    if (!a) return '';
    if (a.value !== undefined) return typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
    if (a.description) return a.description;
    if (a.unserializableValue) return String(a.unserializableValue);
    return a.type || '';
}

(async () => {
    if (!fs.existsSync(CHROME)) { console.error('CHROME no encontrado: ' + CHROME); process.exit(2); }
    const port = await findPort(9333);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-storm-'));

    console.log('== CDP CONSOLE STORM CHECK ==');
    console.log('   url      : ' + URL_);
    console.log('   ventana  : ' + SECONDS + 's');
    console.log('   chrome   : ' + CHROME);
    console.log('   perfil   : ' + profile);

    const chrome = spawn(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--window-size=1600,1200',
        '--user-data-dir=' + profile,
        '--remote-debugging-port=' + port,
        'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr.on('data', () => { });

    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
        await sleep(250);
        try {
            const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
            target = list.find((t) => t.type === 'page');
        } catch { /* aún arrancando */ }
    }
    if (!target) { chrome.kill(); console.error('No se pudo abrir un target CDP'); process.exit(3); }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });

    const consoleEvents = [];
    const logEvents = [];
    ws.addEventListener('message', (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id); pending.delete(msg.id);
            msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
            return;
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
            const text = (msg.params.args || []).map(describeArg).join(' ');
            consoleEvents.push({ type: msg.params.type, text, ts: Date.now() });
        } else if (msg.method === 'Log.entryAdded') {
            const e = msg.params.entry || {};
            logEvents.push({ level: e.level, text: e.text || '', url: e.url || '' });
        }
    });

    await new Promise((res, rej) => {
        ws.addEventListener('open', res, { once: true });
        ws.addEventListener('error', rej, { once: true });
        setTimeout(() => rej(new Error('timeout WS')), 12000);
    });

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

    // ── Sembrar el estado de persistencia ANTES de los scripts de la página ──
    // Reproduce la sesión real del usuario: controles de UI guardados, incluidos
    // los del Gestor de Perfiles (que antes se restauraban por id).
    const seed = {
        _schema: 1,
        _saved_at: new Date().toISOString(),
        _count: 14,
        controls: {
            'id:pm9_fps': '60',
            'id:pm9_buffer_sec': '30',
            'id:pm9_clockSynchro': '1',
            'id:pm9_resolution': '3840x2160',
            'id:pm9_codec': 'H265',
            'id:pm9_strategy': 'balanced',
            'id:pm9_headersCount': '154',
            'id:pm9_bitrate': '112',
            'id:pm9_t1': '145.6',
            'id:pm9_t2': '179.2',
            'id:pm9_playerBuffer': '102000',
            'id:pm9_buffer': '162000',
            'id:ape_ui_probe_text': 'sembrado',
            'id:ape_ui_probe_num': '7'
        }
    };
    await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try{localStorage.setItem('ape_ui_state_v1', ${JSON.stringify(JSON.stringify(seed))});}catch(e){}`
    });

    consoleEvents.length = 0; logEvents.length = 0;
    await send('Page.navigate', { url: URL_ });

    // ── FASE A: arranque (aquí vive el LAB SEMANTIC FILL, que es ÚNICO) ──────
    const SETTLE_MS = 6000;
    await sleep(SETTLE_MS);
    const bootEvents = consoleEvents.length;

    // ── FASE B: abrir el Gestor de Perfiles (12 perfiles, 6K/8K emulados) ────
    let panelInfo = null;
    try {
        const r = await send('Runtime.evaluate', {
            awaitPromise: true, returnByValue: true,
            expression: `(() => {
                let host = document.getElementById('profile-manager-container');
                let created = false;
                if (!host) {
                    host = document.createElement('div');
                    host.id = 'profile-manager-container';
                    document.body.appendChild(host);
                    created = true;
                }
                const PM = window.ProfileManagerV9;
                if (!PM) return { ok: false, reason: 'ProfileManagerV9 ausente' };
                PM.activeProfileId = PM.activeProfileId || 'P3';
                PM.render();
                const panel = document.querySelector('[data-ape-nopersist]');
                return {
                    ok: true, created_host: created, panel_mounted: !!panel,
                    controls: document.querySelectorAll('#profile-manager-container input,#profile-manager-container select').length
                };
            })()`
        });
        panelInfo = r.result && r.result.value;
    } catch (e) { panelInfo = { ok: false, error: String(e && e.message) }; }
    await sleep(2500);

    // ── FASE C: ESTADO ESTABLE — aquí se ve si algo se re-dispara solo ───────
    const markC = consoleEvents.length;
    const t1 = Date.now();
    await sleep(Math.max(4000, SECONDS * 500));
    const steadyElapsed = (Date.now() - t1) / 1000;
    const steadyEvents = consoleEvents.slice(markC);
    const bootCount = bootEvents;
    const elapsed = (bootCount + (consoleEvents.length - bootEvents)) / 1000; // informativo

    // ── FASE D: sonda de convergencia con el panel YA montado ───────────────
    let probe = null;
    try {
        const r = await send('Runtime.evaluate', {
            awaitPromise: true,
            returnByValue: true,
            expression: `(async () => {
                const out = {};
                const P = window.APE_UI_PERSIST, PM = window.ProfileManagerV9;
                out.persist_version = P && P.version ? P.version : null;
                out.pm9_present = !!PM;
                out.panel_optout = !!document.querySelector('[data-ape-nopersist]');
                const raw = localStorage.getItem('ape_ui_state_v1');
                const st = raw ? JSON.parse(raw) : { controls: {} };
                out.controls_saved = Object.keys(st.controls || {}).length;
                if (P && P._apply) {
                    const before = (PM && PM._renderWin) ? PM._renderWin.n : 0;
                    let applied = 0, reentrant = 0;
                    for (let i = 0; i < 5; i++) {
                        const r = P._apply(document, st, { force: true, silent: true });
                        applied += (r.applied || 0);
                        if (r.reentrant) reentrant++;
                    }
                    out.probe_applied = applied;
                    out.probe_reentrant = reentrant;
                    out.renders_during_probe = ((PM && PM._renderWin) ? PM._renderWin.n : 0) - before;
                }
                // Y con eventos (force, no silent): debe converger igual porque el
                // valor ya coincide → escritura idempotente, sin eventos.
                if (P && P._apply) {
                    const before2 = (PM && PM._renderWin) ? PM._renderWin.n : 0;
                    const r2 = P._apply(document, st, { force: true });
                    out.probe_force_applied = r2.applied || 0;
                    out.renders_during_force = ((PM && PM._renderWin) ? PM._renderWin.n : 0) - before2;
                }
                out.write_budget = PM && PM._writeWin ? PM._writeWin.n : null;
                out.rx_depth = PM && PM._rxDepth !== undefined ? PM._rxDepth : null;
                return out;
            })()`
        });
        probe = r.result && r.result.value;
    } catch (e) { probe = { error: String(e && e.message) }; }
    await sleep(1200);

    try { ws.close(); } catch { }
    try { chrome.kill(); } catch { }
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { }

    // ── Análisis ────────────────────────────────────────────────────────────
    const group = (arr) => {
        const m = new Map();
        for (const e of arr) { const k = sig(e.text) || '(vacío)'; m.set(k, (m.get(k) || 0) + 1); }
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const bootRanked = group(consoleEvents.slice(0, bootEvents));
    const steadyRanked = group(steadyEvents);
    const maxRepeatBoot = bootRanked.length ? bootRanked[0][1] : 0;
    const maxRepeat = steadyRanked.length ? steadyRanked[0][1] : 0;
    const steadyRate = steadyEvents.length / steadyElapsed;
    const bootRate = bootEvents / (SETTLE_MS / 1000);
    const reactiveRx = /Reactive|Buffer Opci|Bitrate Floor|Clock Jitter|Perfiles \+|Perfiles v9|Prefetch|FPS manual|VLC Opt/;
    const reactiveSteady = steadyRanked.filter(([k]) => reactiveRx.test(k));
    const reactiveBoot = bootRanked.filter(([k]) => reactiveRx.test(k));

    console.log('\n--- PANEL ---');
    console.log('   ' + JSON.stringify(panelInfo));

    console.log('\n--- VOLUMEN ---');
    console.log(`   arranque (${(SETTLE_MS / 1000).toFixed(0)}s) : ${bootEvents} eventos (${bootRate.toFixed(1)}/s) — LAB SEMANTIC FILL es único`);
    console.log(`   ESTABLE  (${steadyElapsed.toFixed(1)}s) : ${steadyEvents.length} eventos (${steadyRate.toFixed(1)}/s)  ← LA MÉTRICA QUE IMPORTA`);
    console.log(`   máx. repetición estable : ${maxRepeat}×` + (steadyRanked.length ? `  → "${steadyRanked[0][0]}"` : ''));
    console.log(`   máx. repetición arranque: ${maxRepeatBoot}×`);

    console.log('\n--- TOP FIRMAS (ARRANQUE) ---');
    bootRanked.slice(0, 10).forEach(([k, n]) => console.log('   ' + String(n).padStart(4) + '×  ' + k));

    console.log('\n--- TOP FIRMAS (ESTABLE) ---');
    if (!steadyRanked.length) console.log('   (ninguna)');
    steadyRanked.slice(0, 12).forEach(([k, n]) => console.log('   ' + String(n).padStart(4) + '×  ' + k));

    console.log('\n--- MOTOR REACTIVO: ESTABLE ---');
    if (!reactiveSteady.length) console.log('   (ninguna firma reactiva: el motor NO se re-dispara solo)');
    else reactiveSteady.slice(0, 10).forEach(([k, n]) => console.log('   ' + String(n).padStart(4) + '×  ' + k));

    console.log('\n--- MOTOR REACTIVO: ARRANQUE (referencia) ---');
    if (!reactiveBoot.length) console.log('   (ninguna)');
    else reactiveBoot.slice(0, 8).forEach(([k, n]) => console.log('   ' + String(n).padStart(4) + '×  ' + k));

    console.log('\n--- SONDA DE CONVERGENCIA (panel montado) ---');
    console.log('   ' + JSON.stringify(probe));

    const errs = logEvents.filter((e) => e.level === 'error');
    const php404 = errs.filter((e) => /\.php|api\/health|jwt-config|sentinel-status|telemetry-full/.test(e.text + ' ' + e.url));
    console.log('\n--- ERRORES DE RED ---');
    console.log(`   error entries   : ${errs.length}  (de ellos, endpoints .php/api del dev-server sin PHP: ${php404.length})`);

    // ── Veredicto ───────────────────────────────────────────────────────────
    // El arranque puede ser verboso (el LAB se homóloga una sola vez). Lo que
    // NUNCA debe pasar es que el estado estable siga emitiendo y repitiendo.
    const fails = [];
    if (maxRepeat > MAX_REPEAT) fails.push(`firma repetida ${maxRepeat}× en estado estable > ${MAX_REPEAT}`);
    if (steadyRate > MAX_RATE) fails.push(`tasa estable ${steadyRate.toFixed(1)}/s > ${MAX_RATE}/s`);
    if (reactiveSteady.length && reactiveSteady[0][1] > 2) fails.push(`motor reactivo re-disparándose: ${reactiveSteady[0][1]}× "${reactiveSteady[0][0]}"`);
    if (probe && probe.renders_during_probe > 2) fails.push(`renders durante la sonda: ${probe.renders_during_probe}`);
    if (probe && probe.renders_during_force > 2) fails.push(`renders durante la sonda con eventos: ${probe.renders_during_force}`);
    if (probe && probe.probe_reentrant > 0) fails.push('la sonda detectó reentrada en _apply');

    console.log('\n== VEREDICTO: ' + (fails.length ? 'FAIL' : 'PASS') + ' ==');
    if (fails.length) fails.forEach((f) => console.log('   · ' + f));
    else console.log('   Sin tormenta: estado estable ' + steadyRate.toFixed(1) + '/s, ninguna firma repetida de más, y 5 restauraciones forzadas no disparan renders.');
    process.exitCode = fails.length ? 1 : 0;
})().catch((e) => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(9); });
